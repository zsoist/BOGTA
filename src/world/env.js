// Shared environment state for the world modules (city.js / sky.js / cerros.js).
// Derived purely from state.hour + state.raining so every module agrees on the time of day.
import * as THREE from 'three';
import { state } from '../core/state.js';

// Shader uniforms shared by every patched material (one object => one update per frame).
export const U = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  uRain: { value: 0 },
};

export const env = {
  hour: 14.5,
  night: 0,        // 0 day .. 1 full night (smooth around dusk/dawn)
  overcast: 0.5,   // 0 clear .. 1 grey Andean sky
  rain: 0,         // smoothed 0..1
  time: 0,
  sunElev: 0.8,
  sunDir: new THREE.Vector3(0.3, 0.8, 0.4),
  moonDir: new THREE.Vector3(-0.3, 0.8, -0.4),
  horizon: new THREE.Color(0xb2d6f7),   // current sky horizon / fog color (written by sky.js)
  _stamp: null,
};

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function nightOf(h) {
  if (h < 5.0 || h >= 19.2) return 1;
  if (h < 6.8) return 1 - sstep(5.0, 6.8, h);
  if (h < 17.3) return 0;
  return sstep(17.3, 19.2, h);
}

// Idempotent per frame: both city.update and sky.update call it, only the first one computes.
export function updateEnv(world) {
  const now = world && typeof world.time === 'number' ? world.time : performance.now() / 1000;
  if (env._stamp === now) return env;
  const dt = env._stamp === null ? 0.016 : Math.min(0.1, Math.max(0, now - env._stamp));
  env._stamp = now;
  env.time = now;
  const h = ((state.hour % 24) + 24) % 24;
  env.hour = h;
  const target = state.raining ? 1 : 0;
  env.rain += (target - env.rain) * (1 - Math.exp(-dt * 0.7));
  if (Math.abs(env.rain - target) < 0.002) env.rain = target;
  env.night = nightOf(h);
  const aft = sstep(13.2, 15.0, h) * (1 - sstep(18.0, 19.5, h));
  env.overcast = clamp01(0.2 + 0.52 * aft + 0.28 * env.rain);
  const a = ((h - 6) / 12) * Math.PI;
  env.sunDir.set(Math.cos(a) * 0.9, Math.sin(a), 0.36).normalize();
  env.sunElev = env.sunDir.y;
  env.moonDir.set(-env.sunDir.x * 0.8 + 0.1, -env.sunDir.y, -0.3).normalize();
  if (env.moonDir.y < 0.05) env.moonDir.set(-0.35, 0.6, -0.5).normalize();
  U.uNight.value = env.night;
  U.uTime.value = now;
  U.uRain.value = env.rain;
  return env;
}

// Deterministic RNG so the city is identical every run (colliders included).
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next;
  rng.range = (a, b) => a + (b - a) * next();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  rng.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  rng.chance = (p) => next() < p;
  return rng;
}
