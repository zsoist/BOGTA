// GTA Bogotá — audio system. Pure WebAudio synthesis, with optional real audio files (assets/music, assets/voices,
// assets/sfx) and server TTS (/api/tts) preferred when present. See docs/CONTRACT.md.
//   createAudio() → { unlock(), update(dt, world), ...extras }
//   also exported: playTitleMusic(), stopTitleMusic(), speak(text, kind)
import { events } from '../core/events.js';
import { state } from '../core/state.js';
import { input } from '../core/input.js';
import { RADIO_STATIONS } from '../config.js';
import { clamp, smoothstep, Kit } from './synth.js';
import { createAssets } from './assets.js';
import { createVoice } from './voice.js';
import { createEngine } from './engine.js';
import { createSfx, SFX_FILES } from './sfx.js';
import { Radio } from './radio.js';

let current = null; // the live audio instance (module-level helpers delegate to it)

const VOICE_STYLE = { abuela: { pitch: 1.3, rate: 0.92, voiceIdx: 0 }, policia: { pitch: 0.75, rate: 1.05, voiceIdx: 1 }, student: { pitch: 1.15, rate: 1.12, voiceIdx: 0 }, vendor: { pitch: 1.0, rate: 1.1, voiceIdx: 1 }, oficinista: { pitch: 0.95, rate: 1.08, voiceIdx: 1 }, walker: { pitch: 1.05, rate: 1.05, voiceIdx: 0 } };

export function createAudio() {
  let ctx = null, failed = false, ready = false, muted = false;
  let master, comp, masterLp, pauseLp, sfxBus, engineBus, radioBus, voiceBus, titleBus;
  let kit, assets, engine, sfx, radio;
  const voice = createVoice(null, null);

  // ---- bookkeeping
  const L = { x: 0, z: 0, rx: 1, rz: 0 };        // listener (position + camera right axis)
  let radioStation = -1, suppressBlip = 0;
  let screechLvl = 0, rainLvl = 0, thunderT = 30, hornUntil = 0, lastBlip = 0, lastCash = 0, lastCrash = 0, lastWhoosh = 0, prevWanted = 0;
  let stepDist = 0, prevPX = null, prevPZ = null;
  let sirenVeh = null, sirenPrevD = 0, sirenClose = 0;
  let titleWanted = false, titleSrc = null;
  const prevD = new WeakMap(), hornPitch = new WeakMap();

  // =============================================================== context + graph
  function ensureCtx() {
    if (ctx || failed) return ctx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { failed = true; return null; }
      ctx = new Ctor({ latencyHint: 'interactive' });
      build();
    } catch (err) { console.warn('[audio] unavailable:', err?.message || err); failed = true; ctx = null; ready = false; }
    return ctx;
  }

  function build() {
    const c = ctx;
    const g = (v) => { const n = c.createGain(); n.gain.value = v; return n; };
    sfxBus = g(0.9); engineBus = g(0.5); radioBus = g(0.62); voiceBus = g(1.0); titleBus = g(0.7);
    pauseLp = c.createBiquadFilter(); pauseLp.type = 'lowpass'; pauseLp.frequency.value = 20000; pauseLp.Q.value = 0.5;
    masterLp = c.createBiquadFilter(); masterLp.type = 'lowpass'; masterLp.frequency.value = 20000; masterLp.Q.value = 0.5;   // "wasted" slow-mo sweep
    comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = g(0.85);
    for (const b of [sfxBus, engineBus, radioBus, voiceBus, titleBus]) b.connect(pauseLp);
    pauseLp.connect(masterLp); masterLp.connect(comp); comp.connect(master); master.connect(c.destination);

    kit = new Kit(c);
    assets = createAssets(c);
    voice.setContext(c, voiceBus);
    engine = createEngine(c, engineBus, kit);
    sfx = createSfx(c, sfxBus, kit, assets);
    radio = new Radio(c, radioBus, { assets, voice });
    // Warm the sfx/stinger buffers once we know which files exist so they can be played synchronously later.
    assets.ready.then(() => { for (const f of SFX_FILES) assets.prefetch(f); });
    ready = true;
    if (muted) master.gain.value = 0;
  }

  function resume() {
    if (!ctx) return;
    try { if (ctx.state !== 'running') ctx.resume().catch(() => {}); } catch { /* ignore */ }
  }
  let gestureHooked = false;
  function hookGestures() {
    if (gestureHooked || typeof window === 'undefined') return;
    gestureHooked = true;
    const go = () => { ensureCtx(); resume(); if (ctx && ctx.state === 'running') { for (const e of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(e, go, true); gestureHooked = false; } };
    for (const e of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(e, go, true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  }

  // =============================================================== helpers
  function rel(x, z) {
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz) || 0.001;
    return { d, pan: clamp(((dx / d) * L.rx + (dz / d) * L.rz) * Math.min(1, d / 8), -1, 1) };
  }
  const notifyQuiet = (data) => { suppressBlip++; try { events.emit('notify', data); } finally { suppressBlip--; } };

  function cycleStation() {
    const n = RADIO_STATIONS.length;
    setStation((state.stationIndex + 1) % n, true);
  }
  function setStation(idx, emit, announce = emit) {
    idx = ((idx % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    state.stationIndex = idx; radioStation = idx;
    const def = RADIO_STATIONS[idx];
    if (ready) { radio.tune(def.genre ? def : null, { announce }); if (announce && !def.genre) kit.tuning(ctx.currentTime, radioBus, 0.8); }
    if (emit) {
      events.emit('radio:change', { station: def });
      notifyQuiet({ text: `📻 ${def.name}`, kind: 'info' });
    }
  }

  function toggleMute() {
    muted = !muted;
    voice.setMuted(muted);
    if (ready) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.03);
    notifyQuiet({ text: muted ? '🔇 Audio silenciado (M)' : '🔊 Audio activado (M)', kind: 'info' });
  }

  // =============================================================== events
  events.on('crash', (e = {}) => {
    if (!ready) return;
    const now = ctx.currentTime; if (now - lastCrash < 0.07) return; lastCrash = now;
    const I = clamp(e.intensity ?? 0.5, 0, 1);
    let lvl = 1, pan = 0;
    if (typeof e.x === 'number' && typeof e.z === 'number') { const r = rel(e.x, e.z); lvl = Math.pow(clamp(1 - r.d / 130, 0, 1), 1.3); pan = r.pan; }
    if (lvl < 0.02) return;
    sfx.crash(I, lvl, pan);
    if (I > 0.3 && lvl > 0.4) radio.duckFor(0.3 + 0.5 * I);
  });
  events.on('horn', (e = {}) => {
    if (!ready) return;
    const pv = playerVeh();
    const v = e.vehicle;
    if ((!v && typeof e.x !== 'number') || (v && v === pv)) { if (pv) hornUntil = ctx.currentTime + 0.4; return; }
    const pos = v ? v.position : e;
    const r = rel(pos.x, pos.z);
    let p = hornPitch.get(v || e); if (!p) { p = 0.88 + Math.random() * 0.3; hornPitch.set(v || e, p); }
    sfx.horn.honk(Math.pow(clamp(1 - r.d / 90, 0, 1), 1.5), r.pan, p);
  });
  events.on('notify', (e = {}) => {
    if (!ready || muted || suppressBlip) return;
    const now = ctx.currentTime; if (now - lastBlip < 0.08) return; lastBlip = now;
    sfx.ui(e.kind === 'good' ? 'good' : e.kind === 'bad' ? 'bad' : 'info');
  });
  events.on('money:change', (e = {}) => {
    if (!ready) return;
    const now = ctx.currentTime; if (now - lastCash < 0.12) return; lastCash = now;
    if (e.delta > 0) sfx.cash(e.delta >= 100000); else if (e.delta < 0) sfx.loss();
  });
  events.on('player:busted', () => { if (!ready) return; sfx.busted(); radio.duckFor(3.5); });
  events.on('player:wasted', () => { if (!ready) return; sfx.wasted(masterLp); radio.duckFor(4.5); });
  events.on('vehicle:enter', () => { if (ready) sfx.door(); });
  events.on('vehicle:exit', () => { if (ready) sfx.door(); });
  events.on('vehicle:destroyed', (e = {}) => {
    if (!ready || !e.vehicle?.position) return;
    const r = rel(e.vehicle.position.x, e.vehicle.position.z);
    const lvl = Math.pow(clamp(1 - r.d / 160, 0, 1), 1.2);
    if (lvl > 0.02) { sfx.explosion(lvl, r.pan); if (lvl > 0.4) radio.duckFor(0.9); }
  });
  events.on('wanted:change', (e = {}) => {
    if (!ready) return;
    const lv = e.level || 0; if (lv > prevWanted) sfx.wanted(true); else if (lv < prevWanted) sfx.wanted(false);
    prevWanted = lv;
  });

  let wRef = null;
  const playerVeh = () => { const p = wRef?.player; return p && p.isDriving ? p.vehicle : null; };

  // =============================================================== per-frame
  function update(dt, world) {
    if (!ready) return;
    wRef = world;
    try { step(dt, world); } catch (err) { if (!update.warned) { update.warned = true; console.error('[audio] update failed', err); } }
  }

  function step(dt, world) {
    const player = world?.player, S = world?.state || state;
    const veh = player && player.isDriving ? player.vehicle : null;
    const driving = !!veh && !veh.destroyed;
    const pos = player?.position || { x: 0, z: 0 };
    const now = ctx.currentTime;

    // listener: player position, camera right axis (so panning matches what's on screen)
    L.x = pos.x; L.z = pos.z;
    const me = world?.camera?.matrixWorld?.elements;
    if (me) { const rx = me[0], rz = me[2], n = Math.hypot(rx, rz) || 1; L.rx = rx / n; L.rz = rz / n; }
    else if (player) { L.rx = Math.cos(player.heading || 0); L.rz = -Math.sin(player.heading || 0); }

    // keys
    if (input.pressed('KeyM')) toggleMute();
    if (driving && input.pressed('KeyQ')) cycleStation();

    // pause: muffle everything
    const paused = !!S.paused;
    pauseLp.frequency.setTargetAtTime(paused ? 650 : 20000, now, 0.08);

    // ---- radio
    if (S.stationIndex !== radioStation) setStation(S.stationIndex, false);     // changed elsewhere (HUD etc.)
    radio.setActive(driving && !muted);
    radio.setDialog(!!S.dialogOpen);
    radio.update(dt, world);

    // ---- player engine
    let thr = 0;
    if (driving) {
      const raw = veh.controls?.throttle ?? input.throttle;
      const sp = veh.speed || 0;
      thr = Math.abs(sp) > 1 ? Math.max(0, raw * Math.sign(sp)) : Math.abs(raw);
    }
    engine.update(dt, driving ? veh : null, thr);

    // ---- screech (lateral slip, handbrake, hard cornering, hard braking)
    let target = 0, speedN = 0;
    if (driving) {
      const sp = veh.speed || 0, asp = Math.abs(sp);
      speedN = clamp(asp / ((veh.def && veh.def.maxSpeed) || 30), 0, 1);
      let slip = veh.slip ?? veh.lateralSlip;
      if (slip === undefined && veh.velocity) { const h = veh.heading || 0; slip = veh.velocity.x * Math.cos(h) - veh.velocity.z * Math.sin(h); }
      target = smoothstep(2.2, 7.5, Math.abs(slip || 0));
      if (veh.drifting === true) target = Math.max(target, 0.6);
      target = Math.max(target, 0.55 * smoothstep(13, 24, Math.abs(input.steer) * asp));
      if (input.handbrake && asp > 7) target = Math.max(target, 0.75 * smoothstep(7, 16, asp));
      const raw = veh.controls?.throttle ?? input.throttle;
      if (raw * Math.sign(sp || 1) < -0.5 && asp > 14) target = Math.max(target, 0.4 * smoothstep(14, 24, asp));
      if (asp < 3) target = 0;
    }
    screechLvl += (target - screechLvl) * Math.min(1, dt * 12);
    sfx.screech.set(screechLvl, speedN);

    // ---- horn (hold H, or 'horn' event)
    sfx.horn.player(driving && (input.down('KeyH') || now < hornUntil));

    // ---- other vehicles: traffic bed, sirens, pass-by whoosh
    let hum = 0, best = null, bestLvl = 0, bestD = 0, sirCount = 0;
    const vs = world?.vehicles || [];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v || v.destroyed || !v.position) continue;
      const dx = v.position.x - pos.x, dz = v.position.z - pos.z, d2 = dx * dx + dz * dz;
      if (d2 > 22500) continue;
      const d = Math.sqrt(d2);
      if (v.isPolice && v.sirenOn) { const l = Math.pow(1 - d / 150, 1.4); sirCount++; if (l > bestLvl) { bestLvl = l; best = v; bestD = d; } }
      if (v === veh) continue;
      const asp = Math.abs(v.speed || 0);
      if (d < 70 && asp > 1) hum += (1 - d / 70) * (1 - d / 70) * Math.min(1, asp / 12);
      // pass-by whoosh when something fast crosses within ~6 m
      const pd = prevD.get(v); prevD.set(v, d);
      if (pd !== undefined && pd > 6.5 && d <= 6.5 && now - lastWhoosh > 0.35) {
        const rv = asp + Math.abs(veh?.speed || 0);
        if (rv > 14) { lastWhoosh = now; const r = rel(v.position.x, v.position.z); sfx.whoosh(clamp(0.35 + rv / 45, 0, 1), r.pan, clamp(rv / 35, 0, 1)); }
      }
    }
    sfx.bed.set(clamp(hum / 3, 0, 1), speedN, driving);

    // siren: wail normally, yelp at 3+ stars; Doppler from closing speed; volume/brightness by distance
    if (best) {
      if (best !== sirenVeh) { sirenVeh = best; sirenPrevD = bestD; sirenClose = 0; }
      if (dt > 0) sirenClose += ((sirenPrevD - bestD) / dt - sirenClose) * Math.min(1, dt * 4);
      sirenPrevD = bestD;
      const r = rel(best.position.x, best.position.z);
      sfx.siren.set(clamp(bestLvl + 0.12 * Math.min(2, sirCount - 1), 0, 1), (S.wanted || 0) >= 3, 1 + clamp(sirenClose, -35, 35) / 343, r.pan, 900 + 3600 * (1 - bestD / 150));
    } else { sirenVeh = null; sfx.siren.set(0, false, 1, 0, 3000); }

    // ---- rain + thunder
    const rt = S.raining ? 1 : 0;
    rainLvl += (rt - rainLvl) * Math.min(1, dt / 2.5);
    sfx.rain.set(rainLvl, driving);
    if (rt) { thunderT -= dt; if (thunderT <= 0) { thunderT = 40 + Math.random() * 55; sfx.thunder(0.7 + Math.random() * 0.3); } }

    // ---- on foot: crowd ambience + footsteps
    sfx.crowd.set(!driving && rainLvl < 0.5 ? 1 : 0);
    if (!driving && player) {
      if (prevPX !== null && dt > 0) {
        const mv = Math.hypot(pos.x - prevPX, pos.z - prevPZ);
        if (mv < 3) {
          const spd = mv / dt;
          if (spd > 0.6) { stepDist += mv; const run = spd > 5, stride = run ? 1.25 : 0.85; if (stepDist >= stride) { stepDist = 0; sfx.step(run, !!world.net?.roadAt?.(pos.x, pos.z)); } }
        }
      }
      prevPX = pos.x; prevPZ = pos.z;
    } else { prevPX = null; stepDist = 0; }
  }

  // =============================================================== title music / speech (also module-level exports)
  async function playTitleMusic() {
    titleWanted = true; hookGestures();
    if (!ensureCtx()) return;
    resume();
    await assets.ready;
    if (!titleWanted || titleSrc || !assets.has('music/title.mp3')) return;
    const buf = await assets.buffer('music/title.mp3');
    if (!titleWanted || !buf || titleSrc) return;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.8);
    src.connect(g); g.connect(titleBus); src.start();
    titleSrc = { src, g };
  }
  function stopTitleMusic(fade = 1.2) {
    titleWanted = false;
    if (!titleSrc || !ctx) return;
    const { src, g } = titleSrc; titleSrc = null;
    const now = ctx.currentTime;
    try { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + fade); src.stop(now + fade + 0.05); } catch { /* ignore */ }
  }
  /** Speak a line (NPC dialog). Prefers server TTS, falls back to speechSynthesis. Resolves when the line has started. */
  function speak(text, kind = 'npc') {
    ensureCtx();
    const style = VOICE_STYLE[kind] || {};
    return voice.say(text, kind, { channel: 'npc', bus: voiceBus, ...style });
  }

  const api = {
    /** Call after the first user gesture (title screen). Never throws. */
    unlock() { try { hookGestures(); ensureCtx(); resume(); } catch { /* never throw */ } },
    update,
    playTitleMusic, stopTitleMusic, speak,
    toggleMute, setStation, cycleStation,
    get ctx() { return ctx; }, get ready() { return ready; },
    get sfx() { return sfx; }, get radio() { return radio; }, get engine() { return engine; }, get assets() { return assets; }, get voice() { return voice; },
    get muted() { return muted; }, get master() { return master; },
  };
  current = api;
  return api;
}

// Module-level helpers (for the title screen / dialog UI, which don't hold the audio instance).
export function playTitleMusic() { return current ? current.playTitleMusic() : Promise.resolve(); }
export function stopTitleMusic(fade) { if (current) current.stopTitleMusic(fade); }
export function speak(text, kind) { return current ? current.speak(text, kind) : Promise.resolve(); }
