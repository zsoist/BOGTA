// Arcade vehicles for GTA Bogotá. Contract: docs/CONTRACT.md. Models face -Z, forward = (-sin h, 0, -cos h), heading + = turn left.
// Physics: velocity is split into forward/lateral components every frame. Lateral velocity bleeds off at `grip` per second
// (handbrake / hard slides lower it => drift), steering is speed-scaled + smoothed, momentum is partly converted when the grip
// bites (so drifts keep their speed). Body roll/pitch are spring-damped off lateral/longitudinal acceleration.
import * as THREE from 'three';
import { events } from '../core/events.js';
import { state } from '../core/state.js';
import { resolveCircle } from '../core/collision.js';
import { buildVehicleModel, pickPaint, MATS } from './models.js';
import { getFX } from './effects.js';

// kind: car|moto|bus. turnLow/turnHigh = yaw rate (rad/s) at low / top speed. brake & accel in m/s^2. grip = lateral velocity decay /s.
export const VEHICLE_TYPES = {
  taxi: { label: 'taxi', kind: 'car', maxSpeed: 34, accel: 12.5, brake: 23, grip: 8.6, turnLow: 2.7, turnHigh: 1.05, mass: 950, radius: 0.85, length: 3.7, width: 1.62, color: 0xf5c400, rollK: 0.0042, frag: 1.1, pivotH: 0.7, rollK2: 100 },
  sedan: { label: 'sedán', kind: 'car', maxSpeed: 38, accel: 13, brake: 24, grip: 8.4, turnLow: 2.5, turnHigh: 1.1, mass: 1300, radius: 0.95, length: 4.5, width: 1.8, color: 0xc0392b, rollK: 0.0044, frag: 1.0, pivotH: 0.75, rollK2: 90 },
  moto: { label: 'moto domiciliaria', kind: 'moto', maxSpeed: 41, accel: 17, brake: 22, grip: 6.8, turnLow: 3.0, turnHigh: 1.35, mass: 230, radius: 0.45, length: 2.1, width: 0.7, color: 0xe85d04, rollK: 0.036, frag: 1.5, pivotH: 0, rollK2: 70 },
  transmilagro: { label: 'TransMilagro', kind: 'bus', maxSpeed: 21, accel: 3.8, brake: 10, grip: 5.2, turnLow: 0.95, turnHigh: 0.55, mass: 15000, radius: 1.35, length: 17.5, width: 2.55, color: 0xd1121b, rollK: 0.0032, frag: 0.35, pivotH: 1.3, rollK2: 36, articulated: true },
  sitp: { label: 'SITPaciencia', kind: 'bus', maxSpeed: 20, accel: 4.2, brake: 10.5, grip: 5.4, turnLow: 1.05, turnHigh: 0.6, mass: 9500, radius: 1.3, length: 11, width: 2.5, color: 0x1d4fd8, rollK: 0.0034, frag: 0.4, pivotH: 1.3, rollK2: 40 },
  buseta: { label: 'buseta', kind: 'bus', maxSpeed: 25, accel: 6.2, brake: 13, grip: 6.4, turnLow: 1.5, turnHigh: 0.8, mass: 4500, radius: 1.12, length: 7.4, width: 2.15, color: [0xe63946], rollK: 0.0038, frag: 0.6, pivotH: 1.1, rollK2: 50 },
  chiva: { label: 'chiva rumbera', kind: 'bus', maxSpeed: 22, accel: 5.2, brake: 11, grip: 6.0, turnLow: 1.35, turnHigh: 0.75, mass: 6000, radius: 1.2, length: 8.4, width: 2.3, color: 0xf4a300, rollK: 0.0042, frag: 0.55, pivotH: 1.3, rollK2: 42 },
  police: { label: 'patrulla', kind: 'car', maxSpeed: 43, accel: 15.5, brake: 25, grip: 9.2, turnLow: 2.7, turnHigh: 1.3, mass: 1500, radius: 0.95, length: 4.5, width: 1.8, color: 0xf2f2f2, isPolice: true, rollK: 0.0042, frag: 0.8, pivotH: 0.75, rollK2: 95 },
  policeMoto: { label: 'moto de la Policía', kind: 'moto', maxSpeed: 44, accel: 19, brake: 24, grip: 7.2, turnLow: 3.1, turnHigh: 1.4, mass: 250, radius: 0.45, length: 2.1, width: 0.7, color: 0xf2f2f2, isPolice: true, rollK: 0.036, frag: 1.3, pivotH: 0, rollK2: 70 },
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TMP = { x: 0, z: 0 };
let NEXT_ID = 1;
const MAX_WHEELS = 12;

export class Vehicle {
  constructor(scene, type, { x = 0, z = 0, heading = 0, color } = {}) {
    const def = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
    this.id = NEXT_ID++;
    this.scene = scene;
    this.type = VEHICLE_TYPES[type] ? type : 'sedan';
    this.def = def;
    this.mesh = new THREE.Group();
    this.position = this.mesh.position;
    this.position.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
    this.speed = 0;            // signed forward m/s
    this.lateral = 0;          // signed sideways m/s (+ = right)
    this.velocity = new THREE.Vector3();
    this.driver = null;        // null | 'player' | 'ai'
    this.health = 100;
    this.radius = def.radius;
    this.length = def.length;
    this.width = def.width;
    this.mass = def.mass;
    this.isPolice = !!def.isPolice;
    this.sirenOn = false;
    this.destroyed = false;
    this.destroyedAndRemoved = false;
    this.plateDigit = undefined;
    this.flipped = false;
    this.drifting = false;

    this.throttle = 0; this.steer = 0; this.handbrake = false;
    this.steerSm = 0; this.yawRate = 0; this.spin = 0; this.accelS = 0; this.distance = 0;
    this.roll = 0; this.rollV = 0; this.pitch = 0; this.pitchV = 0; this.bobY = 0; this.hopY = 0; this.hopV = 0;
    this.articAng = 0; this.flipSign = 1; this.flipTimer = 0;
    this.crashCd = 0; this.dmgCd = 0; this.crimeCd = 0; this.fireT = 0; this.smokeAcc = 0; this.tireAcc = 0; this.sparkAcc = 0;
    this._brake = false; this._sirenK = -1; this._sirenT = Math.random() * 3; this._err = false; this._cx = 0; this._cz = 0;
    this.skidX = new Float32Array(MAX_WHEELS); this.skidZ = new Float32Array(MAX_WHEELS); this.skidHas = new Uint8Array(MAX_WHEELS);

    this.paint = color !== undefined ? color : pickPaint(this.type, def);
    this.rig = buildVehicleModel(this.type, def, this.paint);
    this.mesh.add(this.rig.root);
    this.bodyWheels = this.rig.wheels.filter((w) => w.group === 'body').slice(0, MAX_WHEELS);
    this.driveN = Math.max(1, this.bodyWheels.filter((q) => q.drive).length * 0.5);
    this._aL = 0;
    scene.add(this.mesh);
    this.fx = getFX(scene);

    // Collision circles along the body axis (offset along forward; + = toward the nose).
    const hl = def.length / 2, span = hl - def.radius;
    this.cO = [];
    if (span <= 0.05) this.cO.push(0);
    else { const n = Math.ceil((span * 2) / (1.5 * def.radius)) + 1; for (let i = 0; i < n; i++) this.cO.push(span - (i * span * 2) / (n - 1)); }
    this.boundR = hl + 0.6;
    this._applyVisuals(0, null);
  }

  setControls({ throttle = 0, steer = 0, handbrake = false } = {}) {
    this.throttle = throttle > 1 ? 1 : throttle < -1 ? -1 : throttle;
    this.steer = steer > 1 ? 1 : steer < -1 ? -1 : steer;
    this.handbrake = !!handbrake;
  }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  right(out = new THREE.Vector3()) { return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }

  // Door spot in world space. side -1 = driver side (left), +1 = right.
  doorPosition(out, side = -1, back = 0) {
    const lx = side * (this.width / 2 + 0.85), lz = (this.rig.meta.seatZ || 0) + back;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    return out.set(this.position.x + lx * c + lz * s, 0, this.position.z - lx * s + lz * c);
  }

  // Distance from (x,z) to the vehicle hull (0 when overlapping).
  distanceTo(x, z) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    let best = 1e9;
    for (let i = 0; i < this.cO.length; i++) {
      const o = this.cO[i];
      const dx = x - (this.position.x - s * o), dz = z - (this.position.z - c * o);
      const d = Math.sqrt(dx * dx + dz * dz) - this.radius;
      if (d < best) best = d;
    }
    return best < 0 ? 0 : best;
  }

  // Push a circle (pedestrian/player) out of the hull. Returns true if it moved.
  pushOut(pos, r) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    let moved = false;
    for (let i = 0; i < this.cO.length; i++) {
      const o = this.cO[i];
      const dx = pos.x - (this.position.x - s * o), dz = pos.z - (this.position.z - c * o);
      const d2 = dx * dx + dz * dz, R = this.radius + r;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 0.0001;
        pos.x += (dx / d) * (R - d); pos.z += (dz / d) * (R - d);
        moved = true;
      }
    }
    return moved;
  }

  setSiren(on) { this.sirenOn = !!on; }

  damage(amount) {
    if (this.destroyed || !(amount > 0)) return;
    this.health = Math.max(0, this.health - amount);
    events.emit('vehicle:damaged', { vehicle: this, amount });
    if (this.health <= 0) this._explode();
  }

  // R key: un-flip / hop the car back onto its wheels and unstick it.
  flip() {
    if (this.destroyed) return false;
    const was = this.flipped;
    this.flipped = false; this.flipTimer = 0;
    this.hopV = was ? 5 : 3.2;
    this.velocity.multiplyScalar(was ? 0 : 0.6);
    this.spin = 0;
    return was;
  }

  _explode() {
    this.destroyed = true; this.health = 0; this.fireT = 11; this.sirenOn = false;
    for (const m of this.rig.paintMeshes) m.material = MATS.char;
    for (const m of this.rig.lampMeshes) m.visible = false;
    if (this.rig.beam) this.rig.beam.visible = false;
    this.fx.explosion(this.position.x, 0.6, this.position.z);
    this.hopV = 6.5; this.spin += (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2);
    this.rollV += (Math.random() - 0.5) * 6;
    events.emit('vehicle:destroyed', { vehicle: this });
    this._emitCrash(1);
  }

  _emitCrash(intensity) {
    if (this.crashCd > 0) return;
    const p = this._world && this._world.player;
    let k = intensity;
    if (this.driver !== 'player') {
      if (!p) return;
      const dx = p.position.x - this.position.x, dz = p.position.z - this.position.z;
      k *= clamp(1 - Math.sqrt(dx * dx + dz * dz) / 45, 0, 1) * 0.7;
      if (k < 0.06) return;
    }
    this.crashCd = 0.14;
    events.emit('crash', { intensity: k, x: this.position.x, z: this.position.z });
  }

  update(dt, world) {
    if (this.destroyedAndRemoved) return;
    try {
      dt = Math.min(dt, 0.05);
      if (!(dt > 0)) return;
      this._world = world;
      this.fx.frame(world, dt);
      this.crashCd -= dt; this.dmgCd -= dt; this.crimeCd -= dt;
      const steps = dt > 0.026 ? 2 : 1, sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        this._physics(sdt);
        if (world) { this._collideWorld(sdt, world); this._collideVehicles(sdt, world); }
      }
      this._visuals(dt, world);
    } catch (err) {
      if (!this._err) { this._err = true; console.error('[vehicle.update]', err); }
    }
  }

  // ---------------- physics ----------------
  _physics(dt) {
    const d = this.def;
    const h = this.heading, sn = Math.sin(h), cs = Math.cos(h);
    const fx = -sn, fz = -cs, rx = cs, rz = -sn;
    let vx = this.velocity.x, vz = this.velocity.z;
    let vF = vx * fx + vz * fz, vL = vx * rx + vz * rz;
    let thr = this.throttle, str = this.steer, hb = this.handbrake;
    const parked = this.driver === null;
    if (this.flipped || this.destroyed || parked) { thr = 0; str = 0; }
    if (this.flipped || this.destroyed) hb = false;
    const maxS = d.maxSpeed, aSpeed = Math.abs(vF), t = Math.min(1, aSpeed / maxS);
    const slipBefore = vL;

    // --- longitudinal ---
    const vF0 = vF;
    if (thr > 0.01) {
      vF += (vF < -0.6 ? d.brake : d.accel * (1 - t * t * t)) * thr * dt;
    } else if (thr < -0.01) {
      if (vF > 0.6) vF += d.brake * thr * dt;
      else vF += d.accel * 0.7 * thr * (1 - clamp(-vF / (maxS * 0.32), 0, 1)) * dt;
    }
    let fric = 0;
    if (Math.abs(thr) < 0.01) fric += parked ? 10 : this.destroyed ? 6 : 2.6;
    if (hb) fric += thr > 0.01 ? 2.5 : 4.5;
    if (this.flipped) fric += 7;
    if (fric > 0) { const dv = fric * dt; vF = vF > dv ? vF - dv : vF < -dv ? vF + dv : 0; }
    if (vF > maxS) vF -= (vF - maxS) * Math.min(1, 2 * dt);
    else if (vF < -maxS * 0.34) vF += (-maxS * 0.34 - vF) * Math.min(1, 3 * dt);

    // --- lateral grip (drift) ---
    const speedAbs = Math.abs(vF);
    const slipRatio = speedAbs > 4 ? Math.abs(vL) / speedAbs : 0;
    let grip = d.grip * (1 - 0.5 * smooth(0.3, 0.85, slipRatio));
    if (hb) grip *= 0.22;
    if (state.raining) grip *= 0.9;
    if (this.flipped) grip *= 0.4;
    let vL2 = vL * Math.exp(-grip * dt);
    if (hb) { const kd = 5.5 * dt; vL2 = vL2 > kd ? vL2 - kd : vL2 < -kd ? vL2 + kd : 0; } // kinetic friction of the locked rear tires
    // keep some momentum: part of the lateral speed the tires bite away becomes forward drive
    const bite = Math.abs(vL) - Math.abs(vL2);
    if (!this.flipped) vF += Math.sign(vF || 1) * bite * (hb ? 0.12 : 0.3);
    vL = vL2;
    this.drifting = !this.flipped && speedAbs > 5 && (Math.abs(slipBefore) > 4.2 || (hb && speedAbs > 6));
    this._slip = slipBefore;

    // --- steering / yaw ---
    const tt = Math.min(1, speedAbs / maxS);
    const dirSign = clamp(vF / 2.2, -1, 1);
    const lowRamp = clamp(speedAbs / 3, 0, 1);
    let rate = d.turnLow + (d.turnHigh - d.turnLow) * Math.pow(tt, 0.7);
    if (hb) rate *= 1.25;
    const sRate = (Math.abs(str) > Math.abs(this.steerSm) && str * this.steerSm >= 0 ? 6.5 : 11) * (1 - 0.4 * tt);
    this.steerSm += clamp(str - this.steerSm, -sRate * dt, sRate * dt);
    this.yawRate = this.steerSm * rate * dirSign * lowRamp * (this.flipped ? 0 : 1);
    this.spin *= Math.exp(-3.2 * dt);
    this.heading += (this.yawRate + this.spin) * dt;

    // --- recompose in the OLD basis (momentum is conserved; next frame sees the slip angle) ---
    vx = fx * vF + rx * vL; vz = fz * vF + rz * vL;
    this.velocity.x = vx; this.velocity.z = vz;
    this.position.x += vx * dt; this.position.z += vz * dt;
    this.distance += Math.abs(vF) * dt;

    // weight transfer inputs
    const accelF = (vF - vF0) / dt;
    this.accelS += (accelF - this.accelS) * Math.min(1, 7 * dt);
    this._aL = this.yawRate * vF + this.spin * vF * 0.4;
  }

  _collideWorld(dt, world) {
    const grid = world.colliderGrid;
    if (!grid) return;
    const r = this.radius, hl = this.length / 2;
    let maxImpact = 0, nxAcc = 0, nzAcc = 0;
    for (let i = 0; i < this.cO.length; i++) {
      const o = this.cO[i];
      const s = Math.sin(this.heading), c = Math.cos(this.heading);
      const cx = this.position.x - s * o, cz = this.position.z - c * o;
      TMP.x = cx; TMP.z = cz;
      const hit = resolveCircle(TMP, r, grid);
      if (!hit) continue;
      this.position.x += TMP.x - cx; this.position.z += TMP.z - cz;
      const vn = this.velocity.x * hit.x + this.velocity.z * hit.z;
      if (vn < 0) {
        const impact = -vn;
        this.velocity.x -= 1.3 * vn * hit.x; this.velocity.z -= 1.3 * vn * hit.z;
        // scrape friction on the tangent
        const tx = this.velocity.x - (this.velocity.x * hit.x + this.velocity.z * hit.z) * hit.x;
        const tz = this.velocity.z - (this.velocity.x * hit.x + this.velocity.z * hit.z) * hit.z;
        const f = Math.min(1, 1.6 * dt + impact * 0.03);
        this.velocity.x -= tx * f; this.velocity.z -= tz * f;
        // corner hits spin the car: torque = r x n
        const cross = (-c * o) * hit.x - (-s * o) * hit.z;
        this.spin = clamp(this.spin + (impact * 0.11 * cross) / hl * (this.def.kind === 'moto' ? 0.3 : 1), -4.5, 4.5);
        if (impact > maxImpact) { maxImpact = impact; nxAcc = hit.x; nzAcc = hit.z; }
      }
    }
    if (maxImpact > 0.6) this._impact(maxImpact, nxAcc, nzAcc, 1, null);
  }

  _collideVehicles(dt, world) {
    const list = world.vehicles;
    if (!list) return;
    const sa = Math.sin(this.heading), ca = Math.cos(this.heading);
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (o === this || o.destroyedAndRemoved || o.id > this.id) continue;
      const bx = o.position.x - this.position.x, bz = o.position.z - this.position.z;
      const R0 = this.boundR + o.boundR;
      if (bx * bx + bz * bz > R0 * R0) continue;
      const sb = Math.sin(o.heading), cb = Math.cos(o.heading);
      let bestD = 0, nx = 0, nz = 0, oa = 0, ob = 0;
      const rr = this.radius + o.radius;
      for (let i = 0; i < this.cO.length; i++) {
        const ax = this.position.x - sa * this.cO[i], az = this.position.z - ca * this.cO[i];
        for (let j = 0; j < o.cO.length; j++) {
          const cx = o.position.x - sb * o.cO[j], cz = o.position.z - cb * o.cO[j];
          const dx = ax - cx, dz = az - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const dist = Math.sqrt(d2) || 0.0001, depth = rr - dist;
          if (depth > bestD) { bestD = depth; nx = dx / dist; nz = dz / dist; oa = this.cO[i]; ob = o.cO[j]; }
        }
      }
      if (bestD <= 0) continue;
      const mA = this.mass, mB = o.mass, mt = mA + mB;
      this.position.x += nx * bestD * (mB / mt); this.position.z += nz * bestD * (mB / mt);
      o.position.x -= nx * bestD * (mA / mt); o.position.z -= nz * bestD * (mA / mt);
      const rvx = this.velocity.x - o.velocity.x, rvz = this.velocity.z - o.velocity.z;
      const vn = rvx * nx + rvz * nz;
      if (vn >= 0) continue;
      const impact = -vn;
      const j = (-(1.32) * vn) / (1 / mA + 1 / mB);
      this.velocity.x += (nx * j) / mA; this.velocity.z += (nz * j) / mA;
      o.velocity.x -= (nx * j) / mB; o.velocity.z -= (nz * j) / mB;
      // spin from the contact offsets (lighter vehicle spins more)
      const crossA = (-ca * oa) * nx - (-sa * oa) * nz;
      const crossB = (-cb * ob) * -nx - (-sb * ob) * -nz;
      this.spin = clamp(this.spin + (impact * 0.1 * crossA * (mB / mt)) / (this.length / 2), -4.5, 4.5);
      o.spin = clamp(o.spin + (impact * 0.1 * crossB * (mA / mt)) / (o.length / 2), -4.5, 4.5);
      this._impact(impact, nx, nz, clamp(mB / mA, 0.3, 2.4), o, o.driver === 'player');
      o._impact(impact, -nx, -nz, clamp(mA / mB, 0.3, 2.4), this, o.driver !== 'player');
      // crimes only for the player's vehicle
      const pv = this.driver === 'player' ? this : o.driver === 'player' ? o : null;
      if (pv && impact > 2.5 && pv.crimeCd <= 0 && Math.abs(pv.speed) > 4) {
        const other = pv === this ? o : this;
        pv.crimeCd = 1.6;
        events.emit('crime', { type: other.isPolice ? 'hit_police' : 'ram', x: pv.position.x, z: pv.position.z });
      }
    }
  }

  // Shared impact reaction: damage, crash event, sparks, body kick, flip chance.
  _impact(impact, nx, nz, massFactor, other, silent = false) {
    const d = this.def;
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading), fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    const side = nx * rx + nz * rz, front = nx * fx + nz * fz;
    this.rollV += side * impact * 0.14 * (d.kind === 'moto' ? 0.5 : 1);
    this.pitchV += front * impact * 0.03;
    if (impact > 5) this.hopV = Math.max(this.hopV, Math.min(3.2, impact * 0.12));
    if (impact > 3 && this.dmgCd <= 0) {
      this.dmgCd = 0.12;
      this.damage((impact - 3) * (other ? 1.15 : 1.5) * d.frag * clamp(massFactor, 0.35, 1.7));
    }
    if (!silent && impact > 2.2) this._emitCrash(clamp((impact - 1.5) / 22, 0.05, 1));
    if (impact > 3) {
      const n = Math.min(6, 1 + (impact / 4) | 0);
      for (let i = 0; i < n; i++) this.fx.spark(this.position.x - nx * this.radius, 0.5, this.position.z - nz * this.radius, nx * 2, 1.5, nz * 2);
    }
    if (impact > 16 && Math.abs(side) > 0.42 && !this.flipped && !this.destroyed && d.kind !== 'bus' && Math.random() < 0.6) {
      this.flipped = true; this.flipTimer = 0;
      this.flipSign = side >= 0 ? -1 : 1;
      this.hopV = 6.5; this.rollV += this.flipSign * 8;
    }
  }

  // ---------------- visuals ----------------
  _visuals(dt, world) {
    const d = this.def, rig = this.rig, fx = this.fx;
    const h = this.heading, sn = Math.sin(h), cs = Math.cos(h);
    const vx = this.velocity.x, vz = this.velocity.z;
    const vF = vx * -sn + vz * -cs, vL = vx * cs + vz * -sn;
    this.speed = vF; this.lateral = vL;
    const aSpeed = Math.abs(vF), t = Math.min(1, aSpeed / d.maxSpeed);

    // --- body roll / pitch springs ---
    const moto = d.kind === 'moto';
    let rollT, pitchT;
    if (this.flipped) { rollT = this.flipSign * (moto ? 1.5 : Math.PI); pitchT = 0; }
    else {
      rollT = moto ? clamp(this._aL * d.rollK, -0.62, 0.62) : -clamp(this._aL * d.rollK * 1.05 + vL * 0.004, -0.14, 0.14);
      pitchT = clamp(this.accelS * 0.0042 * (d.kind === 'bus' ? 0.7 : 1), -0.075, 0.075);
    }
    const k = this.flipped ? 38 : d.rollK2, c = this.flipped ? 5 : 2 * Math.sqrt(d.rollK2) * 0.55;
    this.rollV += ((rollT - this.roll) * k - c * this.rollV) * dt;
    this.roll += this.rollV * dt;
    this.pitchV += ((pitchT - this.pitch) * 85 - 11 * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    this.roll = clamp(this.roll, -6.5, 6.5);
    // hop (crash / flip / explosion)
    this.hopV -= 22 * dt; this.hopY += this.hopV * dt;
    if (this.hopY < 0) { this.hopY = 0; this.hopV = this.hopV < -3 ? -this.hopV * 0.25 : 0; }
    this.bobY = Math.sin(this.distance * 2.3) * 0.011 * Math.min(1, aSpeed / 10) + (this.driver !== null && !this.destroyed ? Math.sin(world ? world.time * 38 : 0) * 0.0035 : 0);

    // auto-right AI / parked cars after a few seconds
    if (this.flipped) { this.flipTimer += dt; if (this.driver !== 'player' && this.flipTimer > 4) this.flip(); }

    this._applyVisuals(dt, world);

    // --- lights ---
    const braking = !this.destroyed && ((this.throttle < -0.05 && vF > 0.5) || (this.throttle > 0.05 && vF < -0.5) || this.handbrake);
    if (braking !== this._brake) {
      this._brake = braking;
      const m = braking ? MATS.tailBright : MATS.tailDim;
      for (const mesh of rig.tails) mesh.material = m;
    }
    if (rig.beam) rig.beam.visible = !this.destroyed && fx.night > 0.05 && !this.flipped;
    if (rig.sirenR) {
      let kk = -1;
      if (this.sirenOn && !this.destroyed) { this._sirenT += dt; const s = Math.floor(this._sirenT * 10) % 6; kk = s < 2 ? 0 : s === 2 ? 1 : s < 5 ? 2 : 1; }
      if (kk !== this._sirenK) {
        this._sirenK = kk;
        rig.sirenR.material = kk === 0 ? MATS.redOn : MATS.redOff;
        rig.sirenB.material = kk === 2 ? MATS.blueOn : MATS.blueOff;
      }
    }
    if (rig.rider) rig.rider.visible = this.driver !== null;
    if (this.driver === 'player') fx.aimSpot(this);

    // --- skid marks + tire smoke ---
    const hardBrake = aSpeed > 13 && ((this.throttle < -0.5 && vF > 0) || (this.throttle > 0.5 && vF < 0)) && !moto;
    const skidding = !this.flipped && (this.drifting || hardBrake);
    const wheels = this.bodyWheels;
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      const on = skidding && (w.drive || hardBrake);
      if (!on) { this.skidHas[i] = 0; continue; }
      const wx = this.position.x + w.x * cs + w.z * sn, wz = this.position.z - w.x * sn + w.z * cs;
      if (this.skidHas[i]) {
        const dx = wx - this.skidX[i], dz = wz - this.skidZ[i];
        if (dx * dx + dz * dz > 0.36) {
          if (dx * dx + dz * dz < 25) fx.addSkid(this.skidX[i], this.skidZ[i], wx, wz, moto ? 0.12 : d.kind === 'bus' ? 0.3 : 0.2);
          this.skidX[i] = wx; this.skidZ[i] = wz;
        }
      } else { this.skidHas[i] = 1; this.skidX[i] = wx; this.skidZ[i] = wz; }
      if (w.drive) {
        this.tireAcc += dt * (this.drifting ? 26 : 12) * (aSpeed > 8 ? 1 : 0.4) / this.driveN;
        while (this.tireAcc >= 1) { this.tireAcc -= 1; fx.tireSmoke(wx, wz, vx, vz, this.drifting ? 1 : 0.6); }
      }
    }
    // --- damage smoke / fire ---
    if (this.health < 55 || this.destroyed) {
      const hp = this.destroyed ? 0 : this.health;
      const m = rig.meta.hood || [0, 1, 0];
      const px = this.position.x + m[0] * cs + m[2] * sn, pz = this.position.z - m[0] * sn + m[2] * cs;
      const py = this.flipped ? 0.8 : m[1];
      if (this.destroyed) this.fireT -= dt;
      const fireOn = this.destroyed && this.fireT > 0;
      this.smokeAcc += dt * (fireOn ? 26 : 3 + ((55 - hp) / 55) * 12 * (this.destroyed ? 0.6 : 1));
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        if (fireOn) fx.firePuff(px, py, pz); else fx.damageSmoke(px, py, pz, hp < 25 || this.destroyed);
      }
    }
    // scraping sparks on the ground when flipped & sliding
    if (this.flipped && aSpeed > 3) { this.sparkAcc += dt * 25; while (this.sparkAcc >= 1) { this.sparkAcc -= 1; fx.spark(this.position.x, 0.15, this.position.z, vx * 0.3, 1, vz * 0.3); } }
  }

  // Writes transforms (also used once at construction).
  _applyVisuals(dt, world) {
    const d = this.def, rig = this.rig;
    this.mesh.rotation.y = this.heading;
    const pv = d.pivotH, roll = this.roll;
    rig.body.rotation.set(this.pitch, 0, roll);
    rig.body.position.set(pv * Math.sin(roll), pv * (1 - Math.cos(roll)) + this.hopY + this.bobY, 0);
    const vF = this.speed, t = Math.min(1, Math.abs(vF) / d.maxSpeed);
    const steerAng = this.steerSm * (d.kind === 'moto' ? 0.42 : 0.5) * (1 - 0.55 * t);
    if (rig.fork) rig.fork.rotation.y = steerAng;
    const locked = this.handbrake && this.driver !== null;
    for (let i = 0; i < rig.wheels.length; i++) {
      const w = rig.wheels[i];
      if (w.front && w.group !== 'fork') w.pivot.rotation.y = steerAng;
      if (dt > 0 && !(locked && w.drive)) w.spin.rotation.x -= (vF * dt) / w.r;
    }
    if (rig.rear && dt > 0) {
      const target = -clamp(this.yawRate * 0.36, -0.5, 0.5) * clamp(vF / 2, -1, 1);
      this.articAng += (target - this.articAng) * Math.min(1, 4 * dt);
      rig.rear.rotation.y = this.articAng;
    }
  }

  dispose() {
    this.destroyedAndRemoved = true;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    // geometry/materials are shared across vehicles of a type: nothing to free
  }
}
