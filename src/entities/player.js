// The player: a low-poly rolo (jeans, jacket, ruana) with procedural walk/run/jump animation, plus the enter/exit/carjack
// state machine (foot -> entering -> driving -> foot). Contract: docs/CONTRACT.md.
import * as THREE from 'three';
import { events } from '../core/events.js';
import { state, addMoney } from '../core/state.js';
import { input } from '../core/input.js';
import { resolveCircle } from '../core/collision.js';
import { carreraX, calleZ } from '../config.js';
import { buildHumanoid, animateHumanoid } from './models.js';

const WALK = 3.9, RUN = 7.7, JUMP_V = 7.4, GRAVITY = 23, ACCEL = 26, DECEL = 34;
const REACH = 3.2;       // hull distance (m) at which F grabs a vehicle
const PLAYER_R = 0.34;
const SPAWN = { x: carreraX(9) + 9, z: calleZ(7) - 20 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

const CARJACK_LINES = [
  '¡Qué pena, veci, necesito el carro!', '¡Préstamo express, sumercé!', 'Ya se lo devuelvo, mi rey (mentiras)',
  '¡Permiso, parce, es una urgencia!', '¡Se lo cuido, don, tranquilo!', 'Súbase a la moto... ah no, bájese del carro',
];
const VICTIM_LINES = ['¡Mi carro! ¡Auxilio!', '¡Ay, qué vaina! ¡Me robaron el carro!', '¡Y yo que acabé de pagar el parqueadero!'];
const VICTIM_COLORS = [[0x3a5a40, 0xd8b07a], [0x6b2d5c, 0xb98560], [0x264653, 0xe0b48f], [0x9c4a1a, 0x8d5a3b], [0x30343f, 0xcfa07a]];

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.rig = buildHumanoid({ ruana: true });
    this.mesh = this.rig.group;
    this.position = this.mesh.position;
    this.heading = 0;
    this.camYaw = 0;
    this.vehicle = null;
    this.mode = 'foot';           // foot | entering | driving | down
    this.vx = 0; this.vz = 0; this.speed = 0;
    this.vy = 0; this.onGround = true;
    this.crouchT = 0; this.sq = 0; this.sqV = 0; this.yawS = 0; this.accS = 0;
    this.stun = 0; this.stunDur = 1; this.knockX = 0; this.knockZ = 0; this.hitCd = 0;
    this.downT = 0; this.respawnT = 0;
    this.enterT = 0; this.enterDur = 0.3; this.enterFrom = new THREE.Vector3(); this.enterTo = new THREE.Vector3();
    this._promptText = null;
    this._camH = 0;
    this._ct = { position: this.position, heading: 0, speed: 0, isDriving: false };
    this._ctl = { throttle: 0, steer: 0, handbrake: false };
    this._tmpV = new THREE.Vector3();
    this._tmpArr = [];
    this._world = null;
    this._time = 0;
    this.position.set(SPAWN.x, 0, SPAWN.z);
    scene.add(this.mesh);

    this.victims = [];
    for (let i = 0; i < 3; i++) {
      const [jacket, skin] = VICTIM_COLORS[i % VICTIM_COLORS.length];
      const rig = buildHumanoid({ ruana: false, jacket, skin, jeans: 0x2b2f3a });
      rig.group.visible = false;
      scene.add(rig.group);
      this.victims.push({ rig, t: 0, active: false, vx: 0, vz: 0, phase: 0 });
    }
    events.on('player:busted', () => { if (this.respawnT <= 0) this.respawnT = 2.4; this._respawnKind = 'busted'; });
  }

  get health() { return state.health; }
  set health(v) { state.health = clamp(v, 0, 100); }
  get isDriving() { return this.mode === 'driving'; }

  get cameraTarget() {
    const ct = this._ct;
    if (this.mode === 'driving' && this.vehicle) {
      ct.position = this.vehicle.position; ct.heading = this._camH; ct.speed = this.vehicle.speed; ct.isDriving = true;
    } else {
      ct.position = this.position; ct.heading = this.camYaw; ct.speed = this.speed; ct.isDriving = false;
    }
    return ct;
  }

  update(dt, world) {
    try {
      dt = Math.min(dt, 0.05);
      if (!(dt > 0)) return; // first frame / paused timers can hand us 0 or negative deltas
      this._world = world;
      this._time += dt;
      this.hitCd -= dt;
      if (this.respawnT > 0) { this.respawnT -= dt; if (this.respawnT <= 0) this.respawn(); }
      switch (this.mode) {
        case 'foot': this._foot(dt, world); break;
        case 'entering': this._entering(dt, world); break;
        case 'driving': this._driving(dt, world); break;
        case 'down': this._down(dt, world); break;
        default: break;
      }
      this._updateVictims(dt, world);
    } catch (err) {
      if (!this._err) { this._err = true; console.error('[player.update]', err); }
    }
  }

  // ---------------- on foot ----------------
  // GTA-style: input is camera-relative, velocity changes are acceleration-limited (no instant jumps), and the character
  // turns (angle-lerp) to face where it is going. The camera yaw drifts behind the facing direction while moving forward-ish.
  _foot(dt, world) {
    const prevH = this.heading, prevSp = this.speed;
    if (this.stun > 0) {
      this.stun -= dt;
      this.vx = this.knockX; this.vz = this.knockZ;
      this.knockX *= Math.exp(-3 * dt); this.knockZ *= Math.exp(-3 * dt);
      const p = 1 - clamp(this.stun / this.stunDur, 0, 1);
      this.mesh.rotation.x = Math.sin(p * Math.PI) * 1.45;
      this.mesh.rotation.y = this.heading;
      this._gravity(dt);
      this._integrate(dt, world);
      this.speed = Math.hypot(this.vx, this.vz);
      animateHumanoid(this.rig, dt, { speed: 0, air: true, vy: 1, squash: 0 });
      if (this.stun <= 0) this.mesh.rotation.x = 0;
      return;
    }
    const f = input.throttle, s = input.steer, run = input.run;
    const cy = this.camYaw;
    let mx = -Math.sin(cy) * f - Math.cos(cy) * s;
    let mz = -Math.cos(cy) * f + Math.sin(cy) * s;
    let mag = Math.hypot(mx, mz);
    const hasInput = mag > 0.01;
    let faceH = this.heading;
    let tvx = 0, tvz = 0;
    if (hasInput) {
      mx /= mag; mz /= mag; mag = Math.min(1, mag);
      faceH = Math.atan2(-mx, -mz);
      const sp = (run ? RUN : WALK) * mag * (this.crouchT > 0 ? 0.6 : 1);
      tvx = mx * sp; tvz = mz * sp;
    } else if (this.speed > 1) faceH = Math.atan2(-this.vx, -this.vz);
    // acceleration-limited velocity (slower control in the air)
    const dvx = tvx - this.vx, dvz = tvz - this.vz, dv = Math.hypot(dvx, dvz);
    const maxDv = (hasInput ? ACCEL : DECEL) * (this.onGround ? 1 : 0.35) * dt;
    if (dv > maxDv) { this.vx += (dvx / dv) * maxDv; this.vz += (dvz / dv) * maxDv; } else { this.vx = tvx; this.vz = tvz; }
    this.speed = Math.hypot(this.vx, this.vz);
    // face movement direction, smoothed (no snapping); small speed => turn in place toward the input
    if (hasInput || this.speed > 1) this.heading += wrap(faceH - this.heading) * damp(hasInput ? 12 : 8, dt);
    // camera follows when moving away-ish from it; sideways drifts slowly, towards-camera never rotates it
    if (hasInput) {
      const rel = wrap(faceH - cy);
      const w = clamp(Math.cos(rel) * 0.9 + 0.2, 0, 1);
      this.camYaw += wrap(this.heading - cy) * damp(2.0 * w, dt);
    }
    // jump: anticipation crouch -> launch (stretch) -> air tuck -> landing squash
    if (this.onGround && this.crouchT <= 0 && input.pressed('Space')) this.crouchT = 0.09;
    if (this.crouchT > 0) {
      this.crouchT -= dt;
      if (this.crouchT <= 0) { this.vy = JUMP_V; this.onGround = false; this.sqV -= 14; }
    }
    this._gravity(dt);
    this._integrate(dt, world);
    this._vehicleContacts(dt, world);
    // squash/stretch spring (+ crouch while preparing to jump)
    const sqT = this.crouchT > 0 ? 0.85 : !this.onGround && this.vy > 2 ? -0.5 : 0;
    this.sqV += ((sqT - this.sq) * 380 - this.sqV * 26) * dt;
    this.sq += this.sqV * dt;
    // animation inputs
    const yawRate = wrap(this.heading - prevH) / Math.max(dt, 1e-4);
    if (!Number.isFinite(this.yawS) || !Number.isFinite(this.accS)) { this.yawS = 0; this.accS = 0; }
    this.yawS += (yawRate - this.yawS) * damp(14, dt);
    const accel = (this.speed - prevSp) / Math.max(dt, 1e-4);
    this.accS += (accel - this.accS) * damp(8, dt);
    animateHumanoid(this.rig, dt, { speed: this.onGround ? this.speed : this.speed * 0.5, yawRate: this.yawS, accel: this.accS, air: !this.onGround, vy: this.vy, squash: clamp(this.sq, -1, 1) });
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.x = 0;

    // health
    if (state.health <= 0 && this.mode === 'foot') { this._wasted(); return; }

    // interaction
    const target = this._nearestVehicle(world);
    this._setPrompt(target ? `F — Robar ${target.def.label}${target.driver === 'ai' ? ' (¡ocupado!)' : ''}` : null);
    if (input.pressed('KeyF') && target) this._beginEnter(target, world);
  }

  _gravity(dt) {
    if (this.onGround) return;
    this.vy -= GRAVITY * dt;
    this.position.y += this.vy * dt;
    if (this.position.y <= 0) { this.position.y = 0; if (this.vy < -3) this.sqV += Math.min(16, -this.vy * 1.3); this.vy = 0; this.onGround = true; }
  }

  _integrate(dt, world) {
    this.position.x += this.vx * dt; this.position.z += this.vz * dt;
    const grid = world && world.colliderGrid;
    if (grid) resolveCircle(this.position, PLAYER_R, grid);
  }

  // Parked/slow vehicles are solid; fast ones knock the player down (cartoon, hurts a bit).
  _vehicleContacts(dt, world) {
    const list = world && world.vehicles;
    if (!list || this.stun > 0) return;
    const px = this.position.x, pz = this.position.z;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.destroyedAndRemoved || v.driver === 'player') continue;
      const dx = px - v.position.x, dz = pz - v.position.z, R = v.boundR + 1;
      if (dx * dx + dz * dz > R * R) continue;
      const sp = Math.abs(v.speed);
      if (sp > 4.5 && this.hitCd <= 0 && this.position.y < 1.1 && v.distanceTo(px, pz) < PLAYER_R + 0.15) {
        this.hitCd = 1.2;
        const dmg = Math.min(45, sp * 1.5);
        state.health = Math.max(0, state.health - dmg);
        const vl = Math.hypot(v.velocity.x, v.velocity.z) || 1;
        this.knockX = (v.velocity.x / vl) * (sp * 0.45 + 2.5); this.knockZ = (v.velocity.z / vl) * (sp * 0.45 + 2.5);
        this.stunDur = 1.15; this.stun = 1.15; this.vy = 4.5; this.onGround = false;
        events.emit('crash', { intensity: clamp(sp / 22, 0.15, 0.7), x: px, z: pz });
        if (state.health > 0) events.emit('notify', { text: '¡Auch! Mire por dónde camina, veci', kind: 'bad' });
        return;
      }
      v.pushOut(this.position, PLAYER_R);
    }
  }

  _nearestVehicle(world) {
    const list = world && world.vehicles;
    if (!list) return null;
    let best = null, bd = REACH;
    const px = this.position.x, pz = this.position.z;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.destroyedAndRemoved || v.destroyed || v.driver === 'player') continue;
      const d = v.distanceTo(px, pz);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  _setPrompt(text) {
    if (text === this._promptText) return;
    this._promptText = text;
    events.emit('prompt', { text });
  }

  // ---------------- entering / carjack ----------------
  _beginEnter(v, world) {
    if (v.destroyed || v.driver === 'player') return;
    const carjack = v.driver === 'ai';
    v.doorPosition(this.enterTo, -1);
    this.enterFrom.copy(this.position);
    const dist = Math.hypot(this.enterTo.x - this.position.x, this.enterTo.z - this.position.z);
    this.enterDur = clamp(0.18 + dist * 0.09, 0.22, 0.5);
    this.enterT = 0;
    this.mode = 'entering';
    this.vehicle = v;
    this.carjacking = carjack;
    this._setPrompt(null);
    if (carjack) {
      this._spawnVictim(v);
      events.emit('crime', { type: 'carjack', x: v.position.x, z: v.position.z });
      events.emit('notify', { text: CARJACK_LINES[(Math.random() * CARJACK_LINES.length) | 0], kind: 'info' });
      if (Math.random() < 0.6) events.emit('notify', { text: VICTIM_LINES[(Math.random() * VICTIM_LINES.length) | 0], kind: 'bad' });
    }
    v.driver = 'player';
    v.setControls(this._zero());
    v.velocity.multiplyScalar(carjack ? 0.5 : 1);
    if (v.plateDigit === undefined) {
      v.plateDigit = Math.floor(Math.random() * 10);
      v.plate = `BOG-${100 + ((Math.random() * 899) | 0)}${v.plateDigit}`;
    }
  }

  _zero() { const c = this._ctl; c.throttle = 0; c.steer = 0; c.handbrake = false; return c; }

  _entering(dt, world) {
    const v = this.vehicle;
    if (!v || v.destroyedAndRemoved) { this.mode = 'foot'; this.vehicle = null; return; }
    this.enterT += dt;
    v.doorPosition(this.enterTo, -1);
    const k = clamp(this.enterT / this.enterDur, 0, 1);
    const e = k * k * (3 - 2 * k);
    this.position.x = this.enterFrom.x + (this.enterTo.x - this.enterFrom.x) * e;
    this.position.z = this.enterFrom.z + (this.enterTo.z - this.enterFrom.z) * e;
    this.position.y = Math.sin(k * Math.PI) * 0.25;
    const dx = v.position.x - this.position.x, dz = v.position.z - this.position.z;
    this.heading += wrap(Math.atan2(-dx, -dz) - this.heading) * damp(20, dt);
    this.mesh.rotation.y = this.heading;
    animateHumanoid(this.rig, dt, { speed: 4.2, yawRate: 0, accel: 0 });
    this.mesh.scale.setScalar(1 - 0.35 * e);
    v.setControls(this._zero());
    if (k >= 1) {
      this.mode = 'driving';
      this.mesh.visible = false; this.mesh.scale.setScalar(1);
      this.position.y = 0;
      this._camH = v.heading;
      v.hopV = Math.max(v.hopV, 1.1); // little suspension dip when you hop in
      events.emit('vehicle:enter', { vehicle: v, carjacked: this.carjacking, driverId: 'player' });
    }
  }

  _spawnVictim(v) {
    let vic = this.victims.find((q) => !q.active);
    if (!vic) vic = this.victims.reduce((a, b) => (a.t > b.t ? a : b));
    v.doorPosition(this._tmpV, -1);
    vic.active = true; vic.t = 0; vic.phase = 0;
    vic.rig.group.visible = true;
    vic.rig.group.position.copy(this._tmpV);
    vic.rig.group.scale.setScalar(1);
    const dx = this._tmpV.x - v.position.x, dz = this._tmpV.z - v.position.z, l = Math.hypot(dx, dz) || 1;
    vic.vx = (dx / l) * 5.2 + (Math.random() - 0.5) * 2; vic.vz = (dz / l) * 5.2 + (Math.random() - 0.5) * 2;
    vic.vy = 4;
    vic.rig.group.rotation.y = Math.atan2(-vic.vx, -vic.vz);
  }

  _updateVictims(dt, world) {
    const grid = world && world.colliderGrid;
    for (const vic of this.victims) {
      if (!vic.active) continue;
      vic.t += dt;
      const g = vic.rig.group;
      g.position.x += vic.vx * dt; g.position.z += vic.vz * dt;
      vic.vy -= GRAVITY * dt;
      g.position.y = Math.max(0, g.position.y + vic.vy * dt);
      if (g.position.y === 0) vic.vy = 0;
      if (grid) resolveCircle(g.position, 0.32, grid);
      animateHumanoid(vic.rig, dt, { speed: 5.2, yawRate: 0, accel: 0, panic: vic.t > 0.35, air: g.position.y > 0.05, vy: vic.vy });
      if (vic.t > 5.5) { const k = clamp(1 - (vic.t - 5.5) / 0.5, 0, 1); g.scale.setScalar(Math.max(0.01, k)); if (k <= 0) { vic.active = false; g.visible = false; } }
    }
  }

  // ---------------- driving ----------------
  _driving(dt, world) {
    const v = this.vehicle;
    if (!v || v.destroyedAndRemoved) { this._exit(world, true); return; }
    const c = this._ctl;
    c.throttle = input.throttle; c.steer = input.steer; c.handbrake = input.handbrake;
    v.setControls(c);
    this.position.set(v.position.x, 0, v.position.z);
    this.heading = v.heading; this.camYaw = v.heading;
    this.speed = Math.abs(v.speed); this.vx = v.velocity.x; this.vz = v.velocity.z;
    // camera heading leans toward the velocity direction during drifts (shows the slide)
    const sp = Math.hypot(v.velocity.x, v.velocity.z);
    let target = v.heading;
    if (v.speed > 3 && sp > 5) {
      const vh = Math.atan2(-v.velocity.x, -v.velocity.z);
      target += clamp(wrap(vh - v.heading), -0.9, 0.9) * 0.45 * clamp((sp - 5) / 8, 0, 1);
    }
    this._camH += wrap(target - this._camH) * damp(7, dt);

    if (input.pressed('KeyH')) events.emit('horn', { vehicle: v });
    if (input.pressed('KeyR')) v.flip();
    if (v.destroyed) { this._eject(v, world); return; }

    let prompt = null;
    if (v.flipped) prompt = 'R — Voltear el carro';
    else if (Math.abs(v.speed) < 3) prompt = 'F — Bajarse';
    this._setPrompt(prompt);
    if (input.pressed('KeyF')) {
      if (Math.abs(v.speed) < 9) this._exit(world, false);
      else events.emit('notify', { text: 'Frene primero, veci, que se mata', kind: 'info' });
    }
  }

  _freeSpot(x, z, world) {
    const grid = world && world.colliderGrid;
    if (grid) {
      const hits = grid.query(x, z, 0.5, this._tmpArr);
      for (let i = 0; i < hits.length; i++) {
        const c = hits[i];
        const nx = clamp(x, c.minX, c.maxX), nz = clamp(z, c.minZ, c.maxZ);
        if ((x - nx) * (x - nx) + (z - nz) * (z - nz) < 0.3 * 0.3) return false;
      }
    }
    const list = world && world.vehicles;
    if (list) for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === this.vehicle || o.destroyedAndRemoved) continue;
      if (o.distanceTo(x, z) < 0.45) return false;
    }
    return true;
  }

  _exit(world, forced) {
    const v = this.vehicle;
    const out = this._tmpV;
    let placed = false;
    if (v) {
      const tries = [[-1, 0], [1, 0], [-1, 1.8], [1, 1.8], [-1, -1.8], [1, -1.8]];
      for (const [side, back] of tries) {
        v.doorPosition(out, side, back);
        if (this._freeSpot(out.x, out.z, world)) { placed = true; break; }
      }
      if (!placed) { v.doorPosition(out, -1, 0); }
      this.position.set(out.x, 0, out.z);
      v.driver = null;
      v.setControls(this._zero());
      this.heading = v.heading;
    }
    this.camYaw = this.heading;
    this.mode = 'foot';
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.vx = 0; this.vz = 0; this.speed = 0; this.vy = 2.8; this.onGround = false;
    this.vehicle = null;
    this._setPrompt(null);
    if (v) events.emit('vehicle:exit', { vehicle: v, forced: !!forced });
  }

  // Burning wreck: cartoon ejection.
  _eject(v, world) {
    this._exit(world, true);
    const dx = this.position.x - v.position.x, dz = this.position.z - v.position.z, l = Math.hypot(dx, dz) || 1;
    this.knockX = (dx / l) * 6; this.knockZ = (dz / l) * 6;
    this.stunDur = 1.4; this.stun = 1.4; this.vy = 5.5; this.onGround = false; this.hitCd = 1.5;
    state.health = Math.max(0, state.health - 20);
    events.emit('notify', { text: '¡Salió volando como tamal en el trancón!', kind: 'bad' });
  }

  // ---------------- wasted / respawn ----------------
  _wasted() {
    this.mode = 'down'; this.downT = 0; this.respawnT = 4.2; this._respawnKind = 'wasted';
    this.vx = 0; this.vz = 0; this.speed = 0;
    this._setPrompt(null);
    events.emit('player:wasted', {});
  }

  _down(dt) {
    this.downT += dt;
    const k = clamp(this.downT / 0.45, 0, 1);
    this.mesh.rotation.x = k * 1.5;
    this.mesh.position.y = (1 - k) * 0.1;
    animateHumanoid(this.rig, dt, { speed: 0 });
  }

  respawn(x = SPAWN.x, z = SPAWN.z) {
    if (this.mode === 'driving' || this.mode === 'entering') {
      const v = this.vehicle;
      if (v) { v.driver = null; v.setControls(this._zero()); events.emit('vehicle:exit', { vehicle: v, forced: true }); }
      this.vehicle = null;
    }
    if (this._respawnKind === 'wasted') {
      const fee = Math.min(state.money, Math.round(state.money * 0.1));
      if (fee > 0) { addMoney(-fee, 'Ambulancia'); events.emit('notify', { text: `La ambulancia le cobró ${fee.toLocaleString('es-CO')} lucas... ¡y sin tinto!`, kind: 'bad' }); }
    }
    this._respawnKind = null;
    state.health = 100;
    this.mode = 'foot';
    this.position.set(x, 0, z);
    this.mesh.visible = true; this.mesh.rotation.set(0, 0, 0); this.mesh.scale.setScalar(1);
    this.vx = this.vz = this.speed = 0; this.stun = 0; this.vy = 0; this.onGround = true;
    this.heading = 0; this.camYaw = 0;
  }
}
