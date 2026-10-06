// TEST-ONLY stub that satisfies the Vehicle contract (docs/CONTRACT.md). Never imported by src/ in the shipped game.
import * as THREE from 'three';
import { resolveCircle } from '../../src/core/collision.js';
import { events } from '../../src/core/events.js';

export const VEHICLE_TYPES = {
  taxi: { label: 'Taxi', maxSpeed: 30, accel: 9, radius: 1.9, length: 4.2, width: 1.8, color: 0xf5c518 },
  sedan: { label: 'Sedán', maxSpeed: 34, accel: 10, radius: 1.9, length: 4.4, width: 1.8, color: 0x5577aa },
  moto: { label: 'Moto', maxSpeed: 40, accel: 14, radius: 1.0, length: 2.0, width: 0.7, color: 0xee6622 },
  transmilagro: { label: 'TransMilagro', maxSpeed: 24, accel: 4, radius: 5.5, length: 18, width: 2.6, color: 0xcc2222 },
  sitp: { label: 'SITPaciencia', maxSpeed: 22, accel: 4.5, radius: 4.2, length: 11, width: 2.5, color: 0x2255aa },
  buseta: { label: 'Buseta', maxSpeed: 24, accel: 5, radius: 3, length: 7, width: 2.2, color: 0xdd8833 },
  chiva: { label: 'Chiva', maxSpeed: 20, accel: 4, radius: 3.2, length: 8, width: 2.3, color: 0xd94f9a },
  police: { label: 'Policía', maxSpeed: 36, accel: 11, radius: 1.9, length: 4.5, width: 1.9, color: 0x2f6b3a },
  policeMoto: { label: 'Moto policía', maxSpeed: 42, accel: 15, radius: 1.0, length: 2.0, width: 0.7, color: 0x2f6b3a },
};
const geoCache = new Map();
export class Vehicle {
  constructor(scene, type, { x, z, heading = 0 }) {
    this.scene = scene; this.type = type; this.def = VEHICLE_TYPES[type];
    const d = this.def;
    const key = type;
    if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(d.width, 1.4, d.length));
    this.mesh = new THREE.Mesh(geoCache.get(key), new THREE.MeshLambertMaterial({ color: d.color, flatShading: true }));
    const nose = new THREE.Mesh(new THREE.BoxGeometry(d.width * 0.6, 0.3, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    nose.position.set(0, 0.5, -d.length / 2); this.mesh.add(nose);
    this.siren = new THREE.Mesh(new THREE.BoxGeometry(d.width * 0.5, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x3333ff }));
    this.siren.position.set(0, 0.9, 0); this.siren.visible = false; this.mesh.add(this.siren);
    this.mesh.position.set(x, 0.7, z); this.mesh.rotation.y = heading; scene.add(this.mesh);
    this.position = this.mesh.position; this.heading = heading; this.speed = 0; this.velocity = new THREE.Vector3();
    this.driver = null; this.health = 100; this.radius = d.radius; this.isPolice = type === 'police' || type === 'policeMoto';
    this.length = d.length; this.width = d.width; this.sirenOn = false; this.destroyed = false; this.ctl = { throttle: 0, steer: 0, handbrake: false }; this.steerS = 0;
    this.plateDigit = Math.floor(Math.random() * 10);
  }
  setControls(c) { this.ctl.throttle = c.throttle; this.ctl.steer = c.steer; this.ctl.handbrake = !!c.handbrake; }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  setSiren(on) { this.sirenOn = on; this.siren.visible = on; }
  damage(a) { this.health = Math.max(0, this.health - a); events.emit('vehicle:damaged', { vehicle: this, amount: a }); if (this.health <= 0 && !this.destroyed) { this.destroyed = true; this.mesh.material.color.set(0x222222); events.emit('vehicle:destroyed', { vehicle: this }); } }
  update(dt, world) {
    if (this.destroyed) { this.speed *= 0.95; return; }
    const d = this.def, c = this.ctl;
    if (this.sirenOn) this.siren.material.color.set(Math.floor(world.time * 6) % 2 ? 0xff2222 : 0x3333ff);
    let a;
    if (c.throttle > 0) a = c.throttle * d.accel; else if (c.throttle < 0) a = this.speed > 0.2 ? c.throttle * d.accel * 1.4 : c.throttle * d.accel * 0.5; else a = 0;
    a -= this.speed * 0.15 + Math.sign(this.speed) * 0.6;
    if (c.handbrake) a -= Math.sign(this.speed) * 6;
    this.speed += a * dt;
    if (Math.abs(this.speed) < 0.15 && c.throttle === 0) this.speed = 0;
    this.speed = Math.max(-8, Math.min(d.maxSpeed, this.speed));
    this.steerS += (c.steer - this.steerS) * Math.min(1, dt * 7);
    const turn = this.steerS * Math.min(1, Math.abs(this.speed) / 3) * (1.9 / (1 + Math.abs(this.speed) / 14)) * (d.length > 8 ? 0.55 : 1);
    this.heading += turn * dt * Math.sign(this.speed || 1);
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    this.position.x += fx * this.speed * dt; this.position.z += fz * this.speed * dt;
    this.velocity.set(fx * this.speed, 0, fz * this.speed);
    const n = resolveCircle(this.position, d.radius * 0.8, world.colliderGrid);
    if (n) { this.speed *= 0.5; }
    for (const o of world.vehicles) {
      if (o === this || o.destroyed) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const r = d.radius * 0.8 + o.radius * 0.8, dd = Math.hypot(dx, dz);
      if (dd < r && dd > 1e-4) { const push = (r - dd) * 0.5; this.position.x += dx / dd * push; this.position.z += dz / dd * push; this.speed *= 0.97; }
    }
    this.mesh.rotation.y = this.heading;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.material.dispose(); this.destroyedAndRemoved = true; }
}
