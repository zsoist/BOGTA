// Shared vehicle FX: skid-mark ring buffer (one InstancedMesh), soft smoke/fire/spark particles (one Points draw call),
// night-time lamp state and the single real SpotLight (player's vehicle only).
// One FX instance per scene; `fx.frame(world, dt)` is idempotent per game frame so every Vehicle can call it.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { MATS } from './models.js';

const MAX_P = 520;
const SKID_MAX = 2200;

const fxByScene = new WeakMap();
export function getFX(scene) {
  let f = fxByScene.get(scene);
  if (!f) { f = new FX(scene); fxByScene.set(scene, f); }
  return f;
}

// 0 = full day, 1 = full night. Rain also switches lamps on ("llueve a las 3").
export function nightFactor() {
  const h = state.hour;
  let n = 0;
  if (h >= 19.5 || h < 5) n = 1;
  else if (h >= 18) n = (h - 18) / 1.5;
  else if (h >= 5 && h < 6.5) n = (6.5 - h) / 1.5;
  if (state.raining) n = Math.max(n, 0.5);
  return n;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _v2 = new THREE.Vector2();

const PARTICLE_VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vA;
  varying vec3 vC;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uScale * projectionMatrix[1][1] / max(0.2, -mv.z), 0.0, 160.0);
    vA = aAlpha; vC = aColor;
  }`;
const PARTICLE_FRAG = /* glsl */`
  varying float vA;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = vA * smoothstep(1.0, 0.25, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vC, a);
  }`;

class FX {
  constructor(scene) {
    this.scene = scene;
    this.lastTime = -1;
    this.frameNo = 0;
    this.night = 0;
    this.skidMat = null;

    // ---- skid marks ----
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({
      color: 0x0e0e10, transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.skid = new THREE.InstancedMesh(g, m, SKID_MAX);
    this.skid.frustumCulled = false;
    this.skid.count = 0;
    this.skid.renderOrder = 1;
    this.skid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.skid);
    this.skidN = 0; this.skidHead = 0; this.skidDirty = false;

    // ---- particles ----
    this.px = new Float32Array(MAX_P * 3);
    this.pSize = new Float32Array(MAX_P);
    this.pAlpha = new Float32Array(MAX_P);
    this.pColor = new Float32Array(MAX_P * 3);
    this.vel = new Float32Array(MAX_P * 3);
    this.life = new Float32Array(MAX_P);
    this.maxLife = new Float32Array(MAX_P).fill(1);
    this.s0 = new Float32Array(MAX_P);
    this.s1 = new Float32Array(MAX_P);
    this.a0 = new Float32Array(MAX_P);
    this.grav = new Float32Array(MAX_P);
    this.pHead = 0;
    const pg = new THREE.BufferGeometry();
    const posA = new THREE.BufferAttribute(this.px, 3).setUsage(THREE.DynamicDrawUsage);
    const sizeA = new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage);
    const alphaA = new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    const colA = new THREE.BufferAttribute(this.pColor, 3).setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('position', posA);
    pg.setAttribute('aSize', sizeA);
    pg.setAttribute('aAlpha', alphaA);
    pg.setAttribute('aColor', colA);
    this.attrs = [posA, sizeA, alphaA, colA];
    this.pMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
      uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, fog: false,
    });
    this.points = new THREE.Points(pg, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);

    // ---- the one real light: headlight on the player's vehicle ----
    this.spot = new THREE.SpotLight(0xfff0c4, 0, 60, 0.52, 0.7, 1.15);
    this.spot.castShadow = false;
    this.spotTarget = new THREE.Object3D();
    scene.add(this.spot, this.spotTarget);
    this.spot.target = this.spotTarget;
  }

  // Called by every vehicle each frame; does the shared work once per game frame.
  frame(world, dt) {
    const t = world && world.time !== undefined ? world.time : (this.frameNo += 1);
    if (t === this.lastTime) return;
    this.lastTime = t;
    this.night = nightFactor();
    const n = this.night;
    // Lamp materials are shared by every vehicle.
    MATS.headlamp.color.setRGB(0.62 + 0.38 * n, 0.64 + 0.34 * n, 0.66 + 0.1 * n);
    MATS.beam.opacity = n * 0.32;
    this.spot.intensity = 0;
    if (world && world.renderer) {
      world.renderer.getDrawingBufferSize(_v2);
      this.pMat.uniforms.uScale.value = _v2.y * 0.5;
    }
    this._updateParticles(dt);
    if (this.skidDirty) {
      this.skid.instanceMatrix.needsUpdate = true;
      this.skid.count = this.skidN;
      this.skidDirty = false;
    }
  }

  // Aim the headlight at the player's vehicle (called from that vehicle's update).
  aimSpot(v) {
    if (this.night < 0.06) return;
    const f = Math.sin(v.heading), c = Math.cos(v.heading);
    this.spot.position.set(v.position.x - f * 1.2, 1.0, v.position.z - c * 1.2);
    this.spotTarget.position.set(v.position.x - f * 22, 0, v.position.z - c * 22);
    this.spot.intensity = 110 * this.night;
  }

  addSkid(x0, z0, x1, z1, width = 0.2) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return;
    _q.setFromAxisAngle(Y_AXIS, Math.atan2(dx, dz));
    _p.set((x0 + x1) * 0.5, 0.055, (z0 + z1) * 0.5);
    _s.set(width, 1, len + 0.08);
    _m4.compose(_p, _q, _s);
    this.skid.setMatrixAt(this.skidHead, _m4);
    this.skidHead = (this.skidHead + 1) % SKID_MAX;
    if (this.skidN < SKID_MAX) this.skidN++;
    this.skidDirty = true;
  }

  emit(x, y, z, vx, vy, vz, s0, s1, life, a0, r, g, b, grav = 0) {
    const i = this.pHead;
    this.pHead = (i + 1) % MAX_P;
    const k = i * 3;
    this.px[k] = x; this.px[k + 1] = y; this.px[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.pColor[k] = r; this.pColor[k + 1] = g; this.pColor[k + 2] = b;
    this.s0[i] = s0; this.s1[i] = s1; this.life[i] = life; this.maxLife[i] = life; this.a0[i] = a0; this.grav[i] = grav;
    this.pSize[i] = s0; this.pAlpha[i] = 0;
  }

  tireSmoke(x, z, vx, vz, amount = 1) {
    const r = Math.random;
    this.emit(x + (r() - 0.5) * 0.3, 0.15, z + (r() - 0.5) * 0.3, vx * 0.15 + (r() - 0.5) * 0.8, 0.5 + r() * 0.7, vz * 0.15 + (r() - 0.5) * 0.8,
      0.5, 1.9 + r() * 0.8, 0.8 + r() * 0.5, 0.42 * amount, 0.92, 0.92, 0.9, 0.2);
  }

  damageSmoke(x, y, z, dark) {
    const r = Math.random;
    const c = dark ? 0.16 : 0.62;
    this.emit(x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3, (r() - 0.5) * 0.8, 1.6 + r() * 1.2, (r() - 0.5) * 0.8,
      0.35, 1.6 + r(), 1.4 + r() * 0.8, dark ? 0.7 : 0.5, c, c, c * 1.03, 0.6);
  }

  firePuff(x, y, z) {
    const r = Math.random;
    this.emit(x + (r() - 0.5) * 0.9, y, z + (r() - 0.5) * 0.9, (r() - 0.5) * 1.2, 2.2 + r() * 2, (r() - 0.5) * 1.2,
      0.5, 1.5 + r() * 0.6, 0.55 + r() * 0.35, 0.95, 1, 0.45 + r() * 0.3, 0.08, 1.5);
    if (r() < 0.5) this.emit(x + (r() - 0.5), y + 0.3, z + (r() - 0.5), (r() - 0.5), 2.5 + r() * 2, (r() - 0.5), 0.5, 2.2, 1.2 + r(), 0.6, 0.12, 0.11, 0.1, 1.2);
  }

  spark(x, y, z, vx, vy, vz) {
    const r = Math.random;
    this.emit(x, y, z, vx + (r() - 0.5) * 3, vy + r() * 2.5, vz + (r() - 0.5) * 3, 0.14, 0.04, 0.25 + r() * 0.25, 1, 1, 0.8 + r() * 0.2, 0.3, -12);
  }

  explosion(x, y, z) {
    const r = Math.random;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, sp = 2 + r() * 7;
      this.emit(x, y + 0.5, z, Math.cos(a) * sp, 2 + r() * 6, Math.sin(a) * sp, 0.9, 3.2 + r() * 1.6, 0.6 + r() * 0.5, 0.95, 1, 0.5 + r() * 0.4, 0.1, 2);
    }
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, sp = 1 + r() * 4;
      this.emit(x, y + 0.8, z, Math.cos(a) * sp, 3 + r() * 5, Math.sin(a) * sp, 0.8, 3 + r() * 2, 1.4 + r() * 1.2, 0.75, 0.13, 0.12, 0.11, 0.5);
    }
    for (let i = 0; i < 20; i++) {
      const a = r() * Math.PI * 2, sp = 4 + r() * 9;
      this.emit(x, y + 0.6, z, Math.cos(a) * sp, 4 + r() * 8, Math.sin(a) * sp, 0.18, 0.05, 0.6 + r() * 0.6, 1, 1, 0.85, 0.35, -14);
    }
  }

  _updateParticles(dt) {
    let any = false;
    const px = this.px, vel = this.vel, life = this.life;
    for (let i = 0; i < MAX_P; i++) {
      const l = life[i];
      if (l <= 0) { if (this.pAlpha[i] !== 0) { this.pAlpha[i] = 0; this.pSize[i] = 0; any = true; } continue; }
      any = true;
      const k = i * 3;
      const nl = l - dt;
      life[i] = nl;
      const t = 1 - nl / this.maxLife[i];
      vel[k + 1] += this.grav[i] * dt;
      const drag = Math.exp(-1.6 * dt);
      vel[k] *= drag; vel[k + 2] *= drag;
      px[k] += vel[k] * dt; px[k + 1] = Math.max(0.05, px[k + 1] + vel[k + 1] * dt); px[k + 2] += vel[k + 2] * dt;
      this.pSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fadeIn = t < 0.12 ? t / 0.12 : 1;
      this.pAlpha[i] = nl <= 0 ? 0 : this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.35);
    }
    if (any) for (const a of this.attrs) a.needsUpdate = true;
  }
}
