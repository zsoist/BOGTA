// Shared AI helpers: math, view frustum test, per-frame vehicle spatial index, line-of-sight, vehicle control.
// Everything here is allocation-free in the hot path (module-scoped scratch objects, preallocated typed arrays).
import * as THREE from 'three';
import { MIN_X, MAX_X, MIN_Z, MAX_Z } from '../config.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
// heading that makes forward = (-sin h, -cos h) point along (dx, dz)
export const headingTo = (dx, dz) => Math.atan2(-dx, -dz);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- camera view test (out-of-view spawning) ----------
const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _sph = new THREE.Sphere();
let _viewStamp = -1;
export function inView(world, x, z, r = 6) {
  const cam = world.camera;
  if (!cam) return false;
  if (_viewStamp !== world.time) {
    _viewStamp = world.time;
    cam.updateMatrixWorld();
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
  }
  _sph.center.set(x, 1.5, z);
  _sph.radius = r;
  return _frustum.intersectsSphere(_sph);
}

// ---------- vehicle spatial index (rebuilt once per frame by whoever asks first) ----------
const CELL = 16;
const OX = MIN_X - 160, OZ = MIN_Z - 160;
const GX = Math.ceil((MAX_X - MIN_X + 320) / CELL), GZ = Math.ceil((MAX_Z - MIN_Z + 320) / CELL);

class VehicleIndex {
  constructor() {
    this.head = new Int32Array(GX * GZ).fill(-1);
    this.next = new Int32Array(256);
    this.items = [];
    this.used = [];
    this.stamp = -1;
  }
  cellOf(x, z) {
    const cx = clamp(Math.floor((x - OX) / CELL), 0, GX - 1);
    const cz = clamp(Math.floor((z - OZ) / CELL), 0, GZ - 1);
    return cz * GX + cx;
  }
  rebuild(vehicles) {
    for (let i = 0; i < this.used.length; i++) this.head[this.used[i]] = -1;
    this.used.length = 0;
    this.items.length = 0;
    if (vehicles.length > this.next.length) this.next = new Int32Array(vehicles.length * 2);
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v || !v.position || v.destroyedAndRemoved) continue;
      const idx = this.items.length;
      this.items.push(v);
      const c = this.cellOf(v.position.x, v.position.z);
      if (this.head[c] === -1) this.used.push(c);
      this.next[idx] = this.head[c];
      this.head[c] = idx;
    }
  }
  // Fills `out` (cleared) with vehicles whose cell overlaps the square [x-r,x+r]x[z-r,z+r]; returns out.
  query(x, z, r, out) {
    out.length = 0;
    const x0 = clamp(Math.floor((x - r - OX) / CELL), 0, GX - 1), x1 = clamp(Math.floor((x + r - OX) / CELL), 0, GX - 1);
    const z0 = clamp(Math.floor((z - r - OZ) / CELL), 0, GZ - 1), z1 = clamp(Math.floor((z + r - OZ) / CELL), 0, GZ - 1);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let k = this.head[cz * GX + cx]; k !== -1; k = this.next[k]) out.push(this.items[k]);
      }
    }
    return out;
  }
}
export const vehicleIndex = new VehicleIndex();
export function ensureIndex(world) {
  if (vehicleIndex.stamp !== world.time || vehicleIndex.count !== world.vehicles.length) {
    vehicleIndex.stamp = world.time;
    vehicleIndex.count = world.vehicles.length;
    vehicleIndex.rebuild(world.vehicles);
  }
  return vehicleIndex;
}

// ---------- line of sight vs building colliders ----------
const _q = [];
export function lineClear(grid, x0, z0, x1, z1, step = 4) {
  if (!grid) return true;
  const dx = x1 - x0, dz = z1 - z0;
  const d = Math.hypot(dx, dz);
  const n = Math.ceil(d / step);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = x0 + dx * t, z = z0 + dz * t;
    const list = grid.query(x, z, 0.2, _q);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && (c.height === undefined || c.height > 3)) return false;
    }
  }
  return true;
}

// ---------- vehicle control driving (steer toward a point, hold a speed) ----------
export function makeCtl() { return { throttle: 0, steer: 0, handbrake: false }; }

// st: any object holding {ctl, prevHeading, yawRate}. Writes controls to the vehicle.
export function driveToward(v, st, tx, tz, desiredSpeed, dt, steerGain = 1.9, extraSteer = 0) {
  const p = v.position;
  const dx = tx - p.x, dz = tz - p.z;
  const hd = Math.atan2(-dx, -dz);
  const err = wrapAngle(hd - v.heading);
  // yaw-rate estimate for a little damping so heavy buses don't oscillate
  const yr = dt > 0 ? wrapAngle(v.heading - st.prevHeading) / dt : 0;
  st.prevHeading = v.heading;
  st.yawRate += (yr - st.yawRate) * Math.min(1, dt * 12);
  const ctl = st.ctl;
  let steer = err * steerGain - st.yawRate * 0.22 + extraSteer;
  const sp = v.speed;
  // reverse steering convention when backing up
  if (sp < -0.5) steer = -steer;
  ctl.steer = clamp(steer, -1, 1);
  const e = desiredSpeed - sp;
  if (desiredSpeed < 0.15 && Math.abs(sp) < 0.4) ctl.throttle = 0;
  else if (e > 0) ctl.throttle = clamp(e * 0.7, 0, 1);
  else ctl.throttle = sp > 0.3 ? clamp(e * 0.55, -1, 0) : 0;
  ctl.handbrake = desiredSpeed < 0.15 && Math.abs(sp) < 0.6;
  v.setControls(ctl);
  return err;
}

// Half extent of a vehicle's rectangle projected on the unit direction (dx, dz).
export function extentAlong(o, dx, dz) {
  const L = (o.length || (o.radius || 1) * 2.4) / 2, W = (o.width || (o.radius || 1) * 1.8) / 2;
  const fx = -Math.sin(o.heading), fz = -Math.cos(o.heading);
  const c = Math.abs(dx * fx + dz * fz), s = Math.abs(dx * fz - dz * fx);
  return c * L + s * W;
}
export const halfLen = (v) => (v.length || (v.radius || 1) * 2.4) / 2;
export const halfWid = (v) => (v.width || (v.radius || 1) * 1.8) / 2;

export function removeVehicle(world, v) {
  const i = world.vehicles.indexOf(v);
  if (i >= 0) world.vehicles.splice(i, 1);
  try { v.dispose?.(); } catch (e) { /* ignore */ }
}

let _hornAt = -10;
export function honk(world, v, minGap = 0.3) {
  if (world.time - _hornAt < minGap) return false;
  _hornAt = world.time;
  world.events.emit('horn', { vehicle: v });
  return true;
}

export function playerSpeed(world) {
  const pl = world.player;
  if (!pl) return 0;
  if (pl.vehicle) return Math.abs(pl.vehicle.speed || 0);
  return 0;
}
