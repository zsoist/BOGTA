// Deterministic frame-by-frame capture driver for the trailer footage. Activated by main.js with `?capture=1`.
//   window.__capture = { shots, setup(name) -> Promise<meta>, step(n), grab() -> dataURL, scout(...), info() }
// The Playwright script (scripts/capture-footage.mjs) calls setup(name), then step()s `warmup + frames` times, grabbing each
// frame after warm-up. simulate(1/60) + renderFrame(1/60) are the only things that advance the world, so footage is exactly 60 fps.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { events } from '../core/events.js';
import {
  DT, FPS, clamp, seedRandom, hashStr, lockClock, installInputFeed, setAxes, feed, pose, cameraBlocked, log,
} from './kit.js';
import { SHOTS } from './shots.js';

const BASE_CSS = `
  #ui { display: none !important; }
  #boot-error { display: none !important; }
  body.cap-hud #ui { display: block !important; }
  /* time-based HUD chrome is wall-clock driven: hide it so frames stay deterministic */
  body.cap-hud .hud-toasts, body.cap-hud .hud-district, body.cap-hud .hud-controls, body.cap-hud .hud-kfoot,
  body.cap-hud .hud-radio, body.cap-hud .hud-pause { display: none !important; }
  body.cap-hud .hud-prompt { display: none !important; }
  body.cap-hud.cap-prompt .hud-prompt { display: flex !important; }
  body.cap-dialog .hud-prompt { display: none !important; }
  * { caret-color: transparent !important; }
`;

export function installCapture({ world, params }) {
  const canvas = document.getElementById('game');
  const camera = world.camera;
  const style = document.createElement('style');
  style.textContent = BASE_CSS;
  document.head.append(style);
  installInputFeed();

  let shot = null;
  let ctx = null;
  const out = { fps: FPS };

  const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60, roll: 0 };

  function applyCamera() {
    if (!shot) return;
    try {
      shot.camera?.(ctx, camState);
      pose(camera, camState.pos, camState.look, camState.fov, camState.roll);
      if (ctx.f >= 0 && cameraBlocked(world, camera.position)) ctx.blocked = (ctx.blocked || 0) + 1;
    } catch (err) { console.error('[capture] camera', err); }
  }

  async function setup(name, opts = {}) {
    shot = SHOTS[name];
    if (!shot) throw new Error(`unknown shot "${name}". Available: ${Object.keys(SHOTS).join(', ')}`);
    const seed = opts.seed ?? params.get('seed') ?? 0;
    seedRandom(hashStr(name) + Number(seed));
    const hudOn = !!shot.hud;
    document.body.classList.toggle('cap-hud', hudOn);
    ctx = {
      world, THREE, camera, shot, name, state, events,
      f: -(shot.warmup ?? 90), frames: shot.frames, t: 0, p: 0, data: {}, started: false, blocked: 0, opts,
    };
    lockClock(shot.hour ?? 12, shot.rain ?? false);
    setAxes(0, 0, false, false);
    feed.keys.clear(); feed.pressed.clear();
    state.wanted = 0;
    state.health = 100;
    state.dialogOpen = false;
    world.cameraOverride = (dt) => applyCamera();
    await shot.setup?.(ctx);
    applyCamera();
    return { name, frames: shot.frames, warmup: shot.warmup ?? 90, fps: FPS, hud: hudOn, description: shot.description || '', beat: shot.beat ?? null };
  }

  function step(n = 1) {
    for (let i = 0; i < n; i++) {
      if (!ctx) throw new Error('call setup(shot) first');
      const f = ctx.f;
      ctx.t = Math.max(0, f) / FPS;
      ctx.p = clamp(f / shot.frames, 0, 1);
      if (f >= 0 && !ctx.started) { ctx.started = true; shot.start?.(ctx); }
      shot.update?.(ctx);
      world.simulate(DT);
      shot.afterSim?.(ctx);
      world.renderFrame(DT);
      ctx.f = f + 1;
    }
    return ctx.f;
  }

  function grab() { return canvas.toDataURL('image/png'); }

  // Free camera for scouting positions: scout([x,y,z],[lx,ly,lz],fov,hour,rain)
  async function scout(pos, look, fov = 60, hour = 12, rain = false, anchor = null, warm = 60) {
    seedRandom(7);
    shot = {
      name: 'scout', frames: 1, hud: false, warmup: warm,
      setup: (c) => { if (anchor) { c.world.player.position.set(anchor[0], 0, anchor[1]); c.world.player.mesh.visible = false; } },
      camera: (c, cs) => { cs.pos.set(...pos); cs.look.set(...look); cs.fov = fov; cs.roll = 0; },
    };
    ctx = { world, THREE, camera, shot, name: 'scout', state, events, f: -warm, frames: 1, t: 0, p: 0, data: {}, started: false, blocked: 0 };
    lockClock(hour, rain);
    document.body.classList.remove('cap-hud');
    world.cameraOverride = () => applyCamera();
    await shot.setup(ctx);
    step(warm);
    return true;
  }

  function info() {
    const pl = world.player;
    return {
      f: ctx?.f, blocked: ctx?.blocked, hour: state.hour, raining: state.raining, wanted: state.wanted,
      cam: camera.position.toArray().map((v) => +v.toFixed(2)), fov: camera.fov,
      player: pl ? { x: +pl.position.x.toFixed(2), z: +pl.position.z.toFixed(2), mode: pl.mode } : null,
      vehicles: world.vehicles.length, peds: world.peds.length, data: ctx?.data?.debug ?? null, log: window.__capLog || [],
    };
  }

  window.__capture = { shots: Object.keys(SHOTS), setup, step, grab, scout, info, world, ctxRef: () => ctx, THREE };
  if (params.get('shot')) window.__capture.ready = setup(params.get('shot')).catch((e) => { console.error(e); throw e; });
  log('capture mode ready');
}
