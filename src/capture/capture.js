// Deterministic frame-by-frame capture driver for the trailer footage. Activated by main.js with `?capture=1`.
//   window.__capture = { shots, setup(name) -> Promise<meta>, step(n), grab() -> dataURL, stepGrab(), scout(...), info() }
// URL: ?capture=1&shot=<name>[&fps=60][&seed=0]. The Playwright script (scripts/capture-footage.mjs) waits for __capture.ready, then
// step()s `warmup` frames and grabs every following frame. simulate(1/fps) + renderFrame(1/fps) are the only things that advance the
// world, so the footage has an exact fixed timestep. Shots are defined in seconds (src/capture/shots.js).
import * as THREE from 'three';
import { state } from '../core/state.js';
import { events } from '../core/events.js';
import {
  cfg, setFps, clamp, seedRandom, hashStr, lockClock, installInputFeed, setAxes, feed, pose, cameraBlocked, log, gradeEnv,
} from './kit.js';
import { createPost } from './post.js';
import { SHOTS } from './shots.js';

const BASE_CSS = `
  #ui { display: none !important; }
  #boot-error { display: none !important; }
  body.cap-hud #ui { display: block !important; }
  /* time-based HUD chrome (toasts, banners) runs on wall-clock timers: hide it so frames stay deterministic */
  body.cap-hud .hud-toasts, body.cap-hud .hud-district, body.cap-hud .hud-controls, body.cap-hud .hud-kfoot,
  body.cap-hud .hud-radio, body.cap-hud .hud-pause, body.cap-hud .hud-prompt { display: none !important; }
  * { caret-color: transparent !important; }
`;

export function installCapture({ world, params }) {
  const canvas = document.getElementById('game');
  const camera = world.camera;
  const style = document.createElement('style');
  style.textContent = BASE_CSS;
  document.head.append(style);
  installInputFeed();
  setFps(Number(params.get('fps')) || 60);

  let shot = null;
  let ctx = null;
  const post = createPost(world.renderer, world.scene, camera);
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
    const frames = Math.round(shot.seconds * cfg.fps);
    const warmup = Math.round((shot.warmup ?? 1.5) * cfg.fps);
    document.body.classList.toggle('cap-hud', !!shot.hud);
    ctx = {
      world, THREE, camera, shot, name, state, events, fps: cfg.fps,
      f: -warmup, frames, seconds: shot.seconds, t: 0, p: 0, data: {}, started: false, blocked: 0, opts,
    };
    ctx.meta = { name, frames, warmup, fps: cfg.fps, hud: !!shot.hud, description: shot.description || '', beat: shot.beat ?? null };
    lockClock(shot.hour ?? 12, shot.rain ?? false);
    gradeEnv({});
    setAxes(0, 0, false, false);
    feed.keys.clear(); feed.pressed.clear();
    state.wanted = 0; state.health = 100; state.dialogOpen = false;
    world.cameraOverride = () => applyCamera();
    ctx.post = await post.configure(shot.post || null);
    await shot.setup?.(ctx);
    applyCamera();
    return ctx.meta;
  }

  function step(n = 1) {
    for (let i = 0; i < n; i++) {
      if (!ctx) throw new Error('call setup(shot) first');
      const f = ctx.f;
      ctx.t = Math.max(0, f) / cfg.fps;
      ctx.p = clamp(ctx.t / ctx.seconds, 0, 1);
      if (f >= 0 && !ctx.started) { ctx.started = true; shot.start?.(ctx); }
      shot.update?.(ctx);
      world.simulate(cfg.dt);
      shot.afterSim?.(ctx);
      world.renderFrame(cfg.dt);
      ctx.f = f + 1;
    }
    return ctx.f;
  }

  function grab() { return canvas.toDataURL('image/png'); }
  // step + grab in ONE task: the drawing buffer is only valid until the browser composites (no preserveDrawingBuffer).
  function stepGrab() { step(1); return grab(); }

  // Free camera for scouting: scout(pos, look, fov, hour, rain, anchor, warmFrames, extra) -> dataURL of the last frame
  async function scout(pos, look, fov = 60, hour = 12, rain = false, anchor = null, warm = 60, extra = {}) {
    seedRandom(7);
    shot = {
      name: 'scout', seconds: 1, hud: false, post: extra.post || null,
      setup: (c) => {
        if (anchor) { c.world.player.position.set(anchor[0], 0, anchor[1]); c.world.player.mesh.visible = false; }
        gradeEnv({ overcast: extra.overcast ?? null, rain: extra.rainLevel ?? null });
      },
      camera: (c, cs) => { cs.pos.set(...pos); cs.look.set(...look); cs.fov = fov; cs.roll = 0; },
    };
    ctx = { world, THREE, camera, shot, name: 'scout', state, events, fps: cfg.fps, f: -warm, frames: 1, seconds: 1, t: 0, p: 0, data: {}, started: false, blocked: 0 };
    lockClock(hour, rain);
    document.body.classList.remove('cap-hud');
    world.cameraOverride = () => applyCamera();
    ctx.post = await post.configure(shot.post);
    await shot.setup(ctx);
    step(warm - 1);
    step(1);
    return grab();
  }

  function info() {
    const pl = world.player;
    return {
      f: ctx?.f, blocked: ctx?.blocked, hour: state.hour, raining: state.raining, wanted: state.wanted,
      cam: camera.position.toArray().map((v) => +v.toFixed(2)), fov: camera.fov,
      player: pl ? { x: +pl.position.x.toFixed(2), z: +pl.position.z.toFixed(2), mode: pl.mode } : null,
      vehicles: world.vehicles.length, peds: world.peds.length, debug: ctx?.data?.debug ?? null, log: window.__capLog || [],
    };
  }

  window.__capture = { shots: Object.keys(SHOTS), setup, step, grab, stepGrab, scout, info, world, ctxRef: () => ctx, THREE };
  if (params.get('shot')) window.__capture.ready = setup(params.get('shot')).catch((e) => { console.error(e); throw e; });
  log('capture mode ready');
}
