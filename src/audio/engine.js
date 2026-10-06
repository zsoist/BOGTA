// GTA Bogotá — player vehicle engine. ONE persistent oscillator stack, retuned per frame (zero node churn).
// rpm is simulated from |speed| through a gearbox with shifts; throttle opens the lowpass; profile per vehicle type.
import { Kit, clamp, lerp, satCurve } from './synth.js';

// fIdle/fMax = fundamental (Hz) at idle/redline. ratios = top-speed fraction of each gear.
const PROFILES = {
  car: { fIdle: 44, fMax: 205, idleN: 0.14, ratios: [0.2, 0.38, 0.56, 0.76, 1.0], lp: [380, 2700], q: 2.2, drive: 2.0, saw: 0.55, pulse: 0, sub: 0.55, noise: 0.05, rough: 0.1, gain: 0.55, whine: 0, wave: 'p35' },
  police: { fIdle: 46, fMax: 235, idleN: 0.15, ratios: [0.2, 0.38, 0.56, 0.76, 1.0], lp: [420, 3200], q: 2.4, drive: 2.4, saw: 0.6, pulse: 0.1, sub: 0.5, noise: 0.06, rough: 0.08, gain: 0.58, whine: 0, wave: 'p35' },
  moto: { fIdle: 78, fMax: 430, idleN: 0.2, ratios: [0.18, 0.34, 0.52, 0.74, 1.0], lp: [700, 5600], q: 1.7, drive: 3.2, saw: 0.4, pulse: 0.5, sub: 0.12, noise: 0.1, rough: 0.2, gain: 0.5, whine: 0, wave: 'p22' },
  bus: { fIdle: 27, fMax: 98, idleN: 0.18, ratios: [0.3, 0.55, 0.78, 1.0], lp: [230, 1150], q: 1.5, drive: 2.6, saw: 0.35, pulse: 0.7, sub: 0.7, noise: 0.08, rough: 0.5, gain: 0.85, whine: 0.25, wave: 'p12' },
  buseta: { fIdle: 31, fMax: 115, idleN: 0.17, ratios: [0.26, 0.46, 0.68, 1.0], lp: [260, 1500], q: 1.6, drive: 2.8, saw: 0.4, pulse: 0.6, sub: 0.55, noise: 0.1, rough: 0.4, gain: 0.8, whine: 0, wave: 'p12' },
  chiva: { fIdle: 29, fMax: 108, idleN: 0.18, ratios: [0.28, 0.5, 0.74, 1.0], lp: [260, 1300], q: 1.8, drive: 3.4, saw: 0.45, pulse: 0.55, sub: 0.6, noise: 0.16, rough: 0.62, gain: 0.85, whine: 0, wave: 'p12' },
};
const TYPE_MAP = { taxi: 'car', sedan: 'car', police: 'police', moto: 'moto', policeMoto: 'moto', transmilagro: 'bus', sitp: 'bus', buseta: 'buseta', chiva: 'chiva' };
export const profileFor = (type) => PROFILES[TYPE_MAP[type] || 'car'] || PROFILES.car;

export function createEngine(ctx, out, kit = new Kit(ctx)) {
  const c = ctx;
  const mkOsc = (type) => { const o = c.createOscillator(); o.type = type; o.frequency.value = 40; o.start(); return o; };
  const saw = mkOsc('sawtooth'), pulse = c.createOscillator(), sub = mkOsc('sine'), whine = mkOsc('sine'), lope = mkOsc('sine');
  pulse.setPeriodicWave(kit.waves.p35); pulse.frequency.value = 40; pulse.start();
  const gSaw = c.createGain(), gPulse = c.createGain(), gSub = c.createGain(), gWhine = c.createGain();
  const mixer = c.createGain(), shaper = c.createWaveShaper(), lp = c.createBiquadFilter(), hp = c.createBiquadFilter(), amp = c.createGain(), lopeDepth = c.createGain();
  shaper.curve = satCurve(2.4); shaper.oversample = '2x';
  lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.value = 400;
  hp.type = 'highpass'; hp.frequency.value = 28;
  amp.gain.value = 0; gWhine.gain.value = 0; lopeDepth.gain.value = 0;
  saw.connect(gSaw); pulse.connect(gPulse); sub.connect(gSub);
  gSaw.connect(mixer); gPulse.connect(mixer); gSub.connect(mixer);
  mixer.connect(shaper); shaper.connect(lp); lp.connect(hp); hp.connect(amp); amp.connect(out);
  lope.connect(lopeDepth); lopeDepth.connect(amp.gain);          // AM "lope" = diesel/single-cylinder chug
  whine.connect(gWhine); gWhine.connect(out);                     // turbo whine (buses)
  // intake hiss
  const nz = c.createBufferSource(); nz.buffer = kit.noise; nz.loop = true;
  const nbp = c.createBiquadFilter(), gNoise = c.createGain();
  nbp.type = 'bandpass'; nbp.frequency.value = 900; nbp.Q.value = 0.6; gNoise.gain.value = 0;
  nz.connect(nbp); nbp.connect(gNoise); gNoise.connect(out); nz.start();

  const st = { type: null, prof: null, gear: 0, rpmN: 0, thr: 0, shiftCut: 0, misfire: 0, prevThr: 0, prevSpeed: 0, active: false };
  const sm = (p, v, tc = 0.04) => p.setTargetAtTime(v, c.currentTime, tc);

  function setProfile(type) {
    st.type = type; const p = profileFor(type); st.prof = p; st.gear = 0;
    pulse.setPeriodicWave(kit.waves[p.wave] || kit.waves.p35);
    saw.type = 'sawtooth';
    lp.Q.value = p.q;
    shaper.curve = satCurve(p.drive);
    sm(gSaw.gain, p.saw, 0.05); sm(gPulse.gain, p.pulse, 0.05); sm(gSub.gain, p.sub, 0.05);
  }

  return {
    get rpm() { return st.rpmN; }, get gear() { return st.gear + 1; },
    /** Call every frame. veh = player's vehicle or null; thrIn = |throttle| 0..1 (already direction-aware). */
    update(dt, veh, thrIn) {
      const now = c.currentTime;
      const on = !!veh && !veh.destroyed && (veh.health === undefined || veh.health > 0);
      if (veh && veh.type !== st.type) { setProfile(veh.type); st.rpmN = 0; }
      const p = st.prof;
      if (!p) return;
      if (!on) { // engine off: spool down & fade
        st.rpmN = Math.max(0, st.rpmN - dt * 1.5);
        sm(amp.gain, 0, 0.08); sm(gWhine.gain, 0, 0.08); sm(gNoise.gain, 0, 0.08); sm(lopeDepth.gain, 0, 0.08);
        st.active = false; return;
      }
      st.active = true;
      const maxSp = (veh.def && veh.def.maxSpeed) || 30;
      const speed = Math.abs(veh.speed || 0), s = clamp(speed / maxSp, 0, 1.15);
      const gears = p.ratios, G = gears.length;
      // ---- throttle smoothing (opens the filter)
      const thrT = clamp(thrIn, 0, 1);
      st.thr += (thrT - st.thr) * (1 - Math.exp(-dt * (thrT > st.thr ? 9 : 4)));
      // ---- gearbox with hysteresis
      let ratio = s / gears[st.gear];
      let rpmT = p.idleN + (1 - p.idleN) * clamp(ratio, 0, 1.05);
      if (ratio > 0.93 && st.gear < G - 1 && thrT > 0.1) { st.gear++; st.shiftCut = 0.11; ratio = s / gears[st.gear]; rpmT = p.idleN + (1 - p.idleN) * ratio; }
      else if (rpmT < p.idleN + (1 - p.idleN) * 0.33 && st.gear > 0) { st.gear--; st.shiftCut = 0.05; ratio = s / gears[st.gear]; rpmT = p.idleN + (1 - p.idleN) * ratio; }
      // launch / standing: clutch slip lets the revs rise with the throttle
      if (speed < 4) rpmT = Math.max(rpmT, p.idleN + st.thr * 0.5);
      // spool-up after ignition is slow; normal tracking is quick
      const k = st.rpmN < p.idleN * 0.8 ? 3.5 : rpmT > st.rpmN ? 11 : 7;
      st.rpmN += (rpmT - st.rpmN) * (1 - Math.exp(-dt * k));
      if (st.shiftCut > 0) { st.shiftCut -= dt; st.rpmN -= dt * 0.9; }
      const idleJit = (1 - st.thr) * (Math.random() - 0.5) * 0.012;
      const rpmN = clamp(st.rpmN + idleJit, 0, 1.05);
      // ---- damage sputter
      const dmg = veh.health !== undefined ? clamp(1 - veh.health / 45, 0, 1) : 0;
      if (dmg > 0 && st.misfire <= 0 && Math.random() < dt * (1 + 4 * dmg)) st.misfire = 0.06 + Math.random() * 0.1;
      if (st.misfire > 0) st.misfire -= dt;
      // ---- map to audio params
      const f = lerp(p.fIdle, p.fMax, rpmN);
      sm(saw.frequency, f, 0.03); sm(pulse.frequency, f, 0.03); sm(sub.frequency, f * 0.5, 0.03);
      const cutoff = lerp(p.lp[0], p.lp[1], clamp(0.25 * rpmN + 0.75 * st.thr, 0, 1));
      sm(lp.frequency, cutoff, 0.05);
      let a = p.gain * (0.34 + 0.66 * st.thr) * (0.55 + 0.45 * rpmN);
      if (st.shiftCut > 0) a *= 0.3;
      if (st.misfire > 0) a *= 0.15;
      sm(amp.gain, a * (1 - 0.0), 0.03);
      const rough = clamp(p.rough + dmg * 0.3, 0, 0.9);
      lope.frequency.setTargetAtTime(f * 0.5, now, 0.05);
      sm(lopeDepth.gain, a * rough * 0.45, 0.05);
      sm(gWhine.gain, p.whine * st.thr * rpmN * rpmN * 0.08, 0.06);
      whine.frequency.setTargetAtTime(f * 9, now, 0.05);
      sm(gNoise.gain, p.noise * (0.3 + st.thr) * rpmN * 0.4, 0.05);
      nbp.frequency.setTargetAtTime(500 + rpmN * 2500, now, 0.06);
      // ---- one-shots: exhaust pop on lift-off, air-brake psshh on bus stop
      if (st.prevThr > 0.8 && thrT < 0.2 && rpmN > 0.6 && (p === PROFILES.moto || p === PROFILES.car || p === PROFILES.police)) {
        kit.nz(now, out, { type: 'lowpass', f: 700, f2: 150, dur: 0.09, gain: 0.16 + Math.random() * 0.08, q: 1 });
        if (p === PROFILES.moto) kit.nz(now + 0.07, out, { type: 'lowpass', f: 900, f2: 200, dur: 0.06, gain: 0.1 });
      }
      if ((p === PROFILES.bus || p === PROFILES.buseta) && st.prevSpeed > 3 && speed < 0.5) kit.nz(now, out, { type: 'highpass', f: 3500, f2: 2200, dur: 0.6, gain: 0.14, atk: 0.01 });
      st.prevThr = thrT; st.prevSpeed = speed;
    },
  };
}
