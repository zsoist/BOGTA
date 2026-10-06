// Rigged + animated glTF characters (Kenney "Mini Characters", CC0 — see assets/models/CREDITS.md).
// Async preload; until it resolves (or if it fails) every caller keeps its procedural fallback.
// API: preloadCharacters() -> Promise<boolean>, charactersReady(), createCharacterMesh(kind, opts) -> Object3D|null,
//      updateCharacterAnim(obj, speed, dt, state), disposeCharacter(obj)
// state: { air?:bool, down?:bool, sit?:bool, drive?:bool }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const CHARACTERS_ENABLED = true; // flip to false to force the procedural humanoids everywhere
const BASE = 'assets/models/characters/';
const FILES = ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'];
const KIND_POOL = {
  walker: FILES, student: ['male-b', 'male-e', 'female-b', 'female-e', 'male-f', 'female-f'],
  oficinista: ['male-c', 'male-d', 'female-c', 'female-d'], abuela: ['female-a', 'female-c', 'female-f'],
  policia: ['male-a', 'male-d', 'female-d'], vendor: ['male-a', 'male-f', 'female-a', 'female-b'],
};
const KIND_TINT = { policia: 0x6fae7a }; // multiplies the shared colormap -> green uniforms
const SCALE = 2.45;                       // models are ~0.67 m tall (chibi); lift to ~1.65 m
const WALK_REF = 2.1, RUN_REF = 6.0;      // ground speed (m/s) at which clips play at timeScale 1

const loaded = {}; // name -> { scene, clips }
let ready = false, started = null;

export const charactersReady = () => ready && CHARACTERS_ENABLED;

export function preloadCharacters() {
  if (started) return started;
  if (!CHARACTERS_ENABLED) return (started = Promise.resolve(false));
  const loader = new GLTFLoader();
  started = Promise.all(FILES.map((f) => new Promise((res) => {
    loader.load(`${BASE}character-${f}.glb`, (g) => { loaded[f] = { scene: g.scene, clips: g.animations }; res(); }, undefined, (e) => { console.warn('[characters]', f, e?.message || e); res(); });
  }))).then(() => { ready = Object.keys(loaded).length > 0; return ready; }).catch((e) => { console.warn('[characters]', e); return false; });
  return started;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function createCharacterMesh(kind = 'walker', opts = {}) {
  if (!charactersReady()) return null;
  try {
    const pool = (KIND_POOL[kind] || FILES).filter((n) => loaded[n]);
    const name = opts.model && loaded[opts.model] ? opts.model : pool.length ? pool[(Math.random() * pool.length) | 0] : Object.keys(loaded)[0];
    const src = loaded[name];
    const root = new THREE.Group();
    const model = SkeletonUtils.clone(src.scene);
    model.scale.setScalar(SCALE * (opts.scale || 1));
    model.rotation.y = Math.PI; // glTF characters face +Z; the game faces -Z
    const tint = opts.tint ?? KIND_TINT[kind];
    model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = true;
      if (tint !== undefined) { o.material = o.material.clone(); o.material.color.setHex(tint); }
    });
    root.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const act = {};
    for (const c of src.clips) act[c.name] = mixer.clipAction(c);
    for (const n of ['idle', 'walk', 'sprint', 'jump', 'fall', 'die', 'sit', 'drive']) if (act[n]) act[n].play(), act[n].setEffectiveWeight(n === 'idle' ? 1 : 0);
    if (act.jump) act.jump.setLoop(THREE.LoopRepeat);
    const t0 = Math.random() * 3; mixer.update(t0);
    root.userData.char = { mixer, act, w: { idle: 1 }, accum: 0, name, time: 0 };
    return root;
  } catch (e) { console.warn('[characters] create failed', e); return null; }
}

const _target = {};
export function updateCharacterAnim(obj, speed, dt, state = {}) {
  const ch = obj && obj.userData && obj.userData.char;
  if (!ch) return;
  try {
    const { act } = ch;
    // reduced-rate updates for far peds are handled by the caller via `state.lod` (accumulate dt, step when >= interval)
    ch.accum += dt;
    const interval = state.lod ? 0.1 : 0;
    if (ch.accum < interval) return;
    const step = ch.accum; ch.accum = 0;
    let want = 'idle';
    if (state.down) want = 'die';
    else if (state.drive) want = act.drive ? 'drive' : 'sit';
    else if (state.sit) want = 'sit';
    else if (state.air) want = (state.vy ?? 1) < 0 && act.fall ? 'fall' : 'jump';
    else if (speed > 4.6) want = 'sprint';
    else if (speed > 0.25) want = 'walk';
    _target.idle = _target.walk = _target.sprint = _target.jump = _target.fall = _target.die = _target.sit = _target.drive = 0;
    if (!act[want]) want = 'idle';
    _target[want] = 1;
    const k = 1 - Math.exp(-14 * step);
    for (const n in act) {
      const a = act[n], t = _target[n] || 0;
      const w = a.getEffectiveWeight();
      const nw = w + (t - w) * k;
      a.setEffectiveWeight(nw < 0.002 ? 0 : nw);
      if (n === 'die' && t === 0 && nw === 0) a.reset();
    }
    if (act.walk) act.walk.timeScale = Math.min(2.2, Math.max(0.5, speed / WALK_REF));
    if (act.sprint) act.sprint.timeScale = Math.min(1.6, Math.max(0.8, speed / RUN_REF));
    ch.mixer.update(step);
  } catch (e) { if (!ch.err) { ch.err = true; console.warn('[characters] anim', e); } }
}

export function disposeCharacter(obj) {
  const ch = obj && obj.userData && obj.userData.char;
  if (!ch) return;
  ch.mixer.stopAllAction();
  if (obj.parent) obj.parent.remove(obj);
}
