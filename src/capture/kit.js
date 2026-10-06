// Capture toolkit: deterministic RNG, clock lock, synthetic input feed, camera rigs (CatmullRom splines + easing),
// scripted vehicle drivers and small world helpers. Used by src/capture/capture.js and shots.js. (Capture mode only.)
import * as THREE from 'three';
import { state } from '../core/state.js';
import { input } from '../core/input.js';
import { env } from '../world/env.js';
import { Vehicle } from '../entities/vehicle.js';
import { driveToward, makeCtl, removeVehicle } from '../ai/common.js';

export const FPS = 60;
export const DT = 1 / FPS;

// ---------------------------------------------------------------- math
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const unlerp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
export const smooth = (a, b, x) => { const t = unlerp(a, b, x); return t * t * (3 - 2 * t); };
export const smoother = (a, b, x) => { const t = unlerp(a, b, x); return t * t * t * (t * (t * 6 - 15) + 10); };
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  inOut5: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  in2: (t) => t * t,
  out2: (t) => 1 - (1 - t) * (1 - t),
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
};

// ---------------------------------------------------------------- deterministic RNG
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seedRandom(seed) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- clock / weather lock
// main.js recomputes state.raining from the hour on every simulate() and advances state.hour: freeze both behind accessors.
const clockLock = { hour: 12, raining: false, locked: false, hourFn: null };
export function lockClock(hour, raining) {
  clockLock.hour = hour; clockLock.raining = !!raining;
  if (!clockLock.locked) {
    clockLock.locked = true;
    Object.defineProperty(state, 'hour', { get: () => clockLock.hour, set: () => {}, configurable: true, enumerable: true });
    Object.defineProperty(state, 'raining', { get: () => clockLock.raining, set: () => {}, configurable: true, enumerable: true });
  }
  env.rain = raining ? 1 : 0; // skip the 0 -> 1 smoothing
}
export function setHour(h) { clockLock.hour = h; }
export function setRain(r) { clockLock.raining = !!r; }

// ---------------------------------------------------------------- synthetic input
export const feed = { throttle: 0, steer: 0, handbrake: false, run: false, keys: new Set(), pressed: new Set() };
export function installInputFeed() {
  const def = (k, get) => Object.defineProperty(input, k, { get, configurable: true });
  def('throttle', () => feed.throttle);
  def('steer', () => feed.steer);
  def('handbrake', () => feed.handbrake);
  def('run', () => feed.run);
  input.down = (c) => !state.dialogOpen && feed.keys.has(c);
  input.pressed = (c) => feed.pressed.has(c);
  const end = input.endFrame.bind(input);
  input.endFrame = () => { feed.pressed.clear(); end(); };
}
export function press(code) { feed.pressed.add(code); }
export function setAxes(throttle = 0, steer = 0, handbrake = false, run = false) {
  feed.throttle = throttle; feed.steer = steer; feed.handbrake = handbrake; feed.run = run;
}

// ---------------------------------------------------------------- camera rig
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
export function V(a) { return a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]); }

// Smooth spline through keyframes (centripetal Catmull-Rom). at(u) with u in 0..1 (uniform in parameter, not arc length).
export function spline(points, closed = false) {
  const pts = points.map(V);
  if (pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5));
  const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal', 0.5);
  return { curve: c, at: (u, out = new THREE.Vector3()) => c.getPoint(clamp(u, 0, 1), out) };
}

// Apply a camera pose. roll in radians. Keeps the lens above ground.
export function pose(camera, pos, look, fov, roll = 0, minY = 0.25) {
  camera.position.copy(pos);
  if (camera.position.y < minY) camera.position.y = minY;
  camera.up.copy(_up);
  camera.lookAt(look);
  if (roll) camera.rotateZ(roll);
  if (fov && Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// Deterministic low-frequency "handheld" wobble.
export function handheld(t, amp = 1, out = { x: 0, y: 0, z: 0, r: 0 }) {
  out.x = (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 3.1 + 1.3) * 0.4) * amp;
  out.y = (Math.sin(t * 2.3 + 0.7) * 0.6 + Math.sin(t * 4.3) * 0.4) * amp;
  out.z = (Math.sin(t * 1.3 + 2.1) * 0.5) * amp;
  out.r = (Math.sin(t * 1.1 + 0.4) * 0.6 + Math.sin(t * 2.9) * 0.4) * amp * 0.012;
  return out;
}

// ---------------------------------------------------------------- vehicles / drivers
export function spawnVehicle(world, type, x, z, heading, { speed = 0, driver = 'ai', color } = {}) {
  const v = new Vehicle(world.scene, type, { x, z, heading, color });
  v.driver = driver;
  v.aiOwner = 'capture';
  v.speed = speed;
  v.velocity.set(-Math.sin(heading) * speed, 0, -Math.cos(heading) * speed);
  world.vehicles.push(v);
  return v;
}

export function removeVehiclesNear(world, x, z, r, keep = []) {
  for (const v of world.vehicles.slice()) {
    if (keep.includes(v) || v.driver === 'player') continue;
    const dx = v.position.x - x, dz = v.position.z - z;
    if (dx * dx + dz * dz < r * r) removeVehicle(world, v);
  }
}
// Clear a rectangle (axis aligned box with margin) of traffic cars.
export function removeVehiclesInBox(world, x0, z0, x1, z1, keep = []) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
  for (const v of world.vehicles.slice()) {
    if (keep.includes(v) || v.driver === 'player') continue;
    const p = v.position;
    if (p.x > ax && p.x < bx && p.z > az && p.z < bz) removeVehicle(world, v);
  }
}

export function headingOf(dx, dz) { return Math.atan2(-dx, -dz); }
export const fwd = (h) => ({ x: -Math.sin(h), z: -Math.cos(h) });
export const right = (h) => ({ x: Math.cos(h), z: -Math.sin(h) });

// Polyline pilot: pure pursuit along [[x,z],...] holding `speed` (m/s, may be a function of distance traveled).
export class Pilot {
  constructor(vehicle, path, { speed = 15, look = 9, gain = 1.9, onControls = null } = {}) {
    this.v = vehicle; this.path = path; this.speed = speed; this.look = look; this.gain = gain;
    this.st = { ctl: makeCtl(), prevHeading: vehicle.heading, yawRate: 0 };
    this.seg = 0; this.onControls = onControls; this.done = false;
  }
  update(dt) {
    const v = this.v, p = v.position, path = this.path;
    // advance to the closest forward segment
    while (this.seg < path.length - 2) {
      const a = path[this.seg], b = path[this.seg + 1];
      const abx = b[0] - a[0], abz = b[1] - a[1];
      const t = ((p.x - a[0]) * abx + (p.z - a[1]) * abz) / (abx * abx + abz * abz || 1);
      if (t > 1) this.seg++; else break;
    }
    // lookahead point
    let rem = this.look, i = this.seg;
    let a = path[i], b = path[i + 1];
    const abx = b[0] - a[0], abz = b[1] - a[1], L = Math.hypot(abx, abz) || 1;
    let t = clamp(((p.x - a[0]) * abx + (p.z - a[1]) * abz) / (L * L), 0, 1);
    let px = a[0] + abx * t, pz = a[1] + abz * t;
    let tx = px, tz = pz;
    let cx = px, cz = pz;
    while (true) {
      const nx = b[0], nz = b[1];
      const d = Math.hypot(nx - cx, nz - cz);
      if (d >= rem || i >= path.length - 2) { const k = d > 1e-6 ? Math.min(1, rem / d) : 1; tx = cx + (nx - cx) * k; tz = cz + (nz - cz) * k; break; }
      rem -= d; cx = nx; cz = nz; i++; a = path[i]; b = path[i + 1];
    }
    const sp = typeof this.speed === 'function' ? this.speed(this) : this.speed;
    driveToward(v, this.st, tx, tz, sp, dt, this.gain);
    if (this.onControls) this.onControls(this.st.ctl);
    this.done = this.seg >= path.length - 2 && Math.hypot(path[path.length - 1][0] - p.x, path[path.length - 1][1] - p.z) < 3;
    return this.st.ctl;
  }
}

// Make the Player drive `vehicle` without the F-key walk (used by driving shots).
export function putPlayerInVehicle(world, vehicle) {
  const pl = world.player;
  pl.vehicle = vehicle; pl.mode = 'driving'; pl.mesh.visible = false;
  pl.carjacking = false;
  pl._camH = vehicle.heading; pl.camYaw = vehicle.heading;
  pl.position.set(vehicle.position.x, 0, vehicle.position.z);
  vehicle.driver = 'player';
  vehicle.aiOwner = 'player';
  if (vehicle.plateDigit === undefined) { vehicle.plateDigit = 5; vehicle.plate = 'BOG-1235'; }
}

// Park the (invisible) player somewhere harmless: AI systems spawn / simulate around world.player.position.
export function parkPlayerAt(world, x, z, { visible = false, heading = 0 } = {}) {
  const pl = world.player;
  pl.mode = 'foot'; pl.vehicle = null; pl.position.set(x, 0, z);
  pl.heading = heading; pl.camYaw = heading; pl.vx = pl.vz = pl.speed = 0;
  pl.mesh.visible = visible;
}

// Is the camera inside a building collider? (diagnostics)
export function cameraBlocked(world, pos) {
  const grid = world.colliderGrid;
  if (!grid) return false;
  const hits = grid.query(pos.x, pos.z, 0.5, []);
  for (const c of hits) if (pos.x > c.minX && pos.x < c.maxX && pos.z > c.minZ && pos.z < c.maxZ && (c.height === undefined || pos.y < c.height)) return true;
  return false;
}

export const log = (...a) => { (window.__capLog ||= []).push(a.join(' ')); console.log('[capture]', ...a); };
export { THREE };
