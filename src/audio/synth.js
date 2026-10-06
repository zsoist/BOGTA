// GTA Bogotá — WebAudio synthesis toolkit (no audio files). Works with AudioContext AND OfflineAudioContext.
// Everything here is "fire and forget": a voice creates a handful of nodes, schedules them at an absolute time `t`
// and lets them die on their own (stop times are always set, so nothing leaks).

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

/** Looping noise buffer. color: 'white' | 'pink' | 'brown'. */
export function makeNoiseBuffer(ctx, seconds = 2, color = 'white') {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  // Cross-fade the loop seam so the loop point never clicks.
  const xf = Math.min(len >> 3, 2048);
  for (let i = 0; i < xf; i++) { const a = i / xf; d[len - xf + i] = d[len - xf + i] * (1 - a) + d[i] * a; }
  return buf;
}

/** Soft saturation curve (k ~ 1..10). */
export function satCurve(k = 3, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}

/** Pulse-train PeriodicWave with a given duty cycle (narrow = nasal / diesel knock). */
export function pulseWave(ctx, duty = 0.25, harmonics = 40) {
  const real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

/** Synthetic room impulse response (stereo decaying noise). */
export function makeImpulse(ctx, seconds = 1.3, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.55; // gentle darkening
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** Stereo panner when supported (falls back to a plain gain so callers never branch). */
export function makePan(ctx, pan = 0) {
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); return p; }
  return ctx.createGain();
}

// ---- envelope helpers -------------------------------------------------------------------------------------------
/** Attack -> hold -> release (linear). */
export function sustainEnv(param, t, peak, atk, dur, rel) {
  dur = Math.max(dur, atk + 0.01);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + atk);
  param.setValueAtTime(peak, t + dur);
  param.linearRampToValueAtTime(0, t + dur + rel);
}
/** Attack -> exponential decay to silence. */
export function decayEnv(param, t, peak, atk, dec) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + atk);
  param.exponentialRampToValueAtTime(0.0001, t + atk + dec);
}
/** Sine vibrato scheduled on an AudioParam as a value curve (no persistent LFO connections). */
export function vibrato(param, t, dur, depth = 8, rate = 5.4, delay = 0.12) {
  const d = dur - delay;
  if (d < 0.12 || !param.setValueCurveAtTime) return;
  const n = 32, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const tau = (i / (n - 1)) * d; c[i] = depth * Math.sin(2 * Math.PI * rate * tau) * Math.min(1, tau / 0.25); }
  try { param.setValueCurveAtTime(c, t + delay, d); } catch { /* overlapping curve: ignore */ }
}

const VOWELS = { a: [800, 1200], e: [500, 1900], i: [300, 2300], o: [450, 800], u: [320, 700] };

export class Kit {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = makeNoiseBuffer(ctx, 5, 'white');
    this.sat3 = satCurve(3);
    this.sat8 = satCurve(8);
    this.waves = { p12: pulseWave(ctx, 0.12), p22: pulseWave(ctx, 0.22), p35: pulseWave(ctx, 0.35) };
  }

  _osc(type, f, t0, t1) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.start(t0); o.stop(t1);
    return o;
  }

  /** Generic filtered noise one-shot (hats, snares, scrapes, crashes, impacts, static...). */
  nz(t, out, { type = 'highpass', f = 5000, f2 = 0, q = 0.7, dur = 0.05, gain = 0.2, atk = 0.001 } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    decayEnv(g.gain, t, gain, atk, Math.max(0.005, dur - atk));
    s.connect(flt); flt.connect(g); g.connect(out);
    s.loop = true;
    s.start(t, Math.max(0, Math.random() * (this.noise.duration - 0.5))); s.stop(t + dur + 0.03);
  }

  // ---------------------------------------------------------------- drums
  kick(t, out, v = 1, { f0 = 165, f1 = 44, dec = 0.3, click = 0.22 } = {}) {
    const c = this.ctx, o = this._osc('sine', f0, t, t + dec + 0.05), g = c.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.11);
    decayEnv(g.gain, t, v * 0.95, 0.002, dec);
    o.connect(g); g.connect(out);
    if (click) this.nz(t, out, { type: 'highpass', f: 2200, dur: 0.012, gain: click * v });
  }
  snare(t, out, v = 1, { tone = 195, dec = 0.17, hp = 1700 } = {}) {
    const c = this.ctx, o = this._osc('triangle', tone * 1.25, t, t + 0.14), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(tone, t + 0.05);
    decayEnv(g.gain, t, 0.38 * v, 0.001, 0.09);
    o.connect(g); g.connect(out);
    this.nz(t, out, { type: 'highpass', f: hp, dur: dec, gain: 0.42 * v });
  }
  clap(t, out, v = 1) {
    for (let i = 0; i < 3; i++) this.nz(t + i * 0.011, out, { type: 'bandpass', f: 1500, q: 0.9, dur: 0.02, gain: 0.34 * v });
    this.nz(t + 0.033, out, { type: 'bandpass', f: 1400, q: 0.8, dur: 0.16, gain: 0.3 * v });
  }
  rim(t, out, v = 1) {
    const o = this._osc('triangle', 1750, t, t + 0.05), g = this.ctx.createGain();
    decayEnv(g.gain, t, 0.22 * v, 0.001, 0.03); o.connect(g); g.connect(out);
    this.nz(t, out, { type: 'bandpass', f: 3500, q: 1.5, dur: 0.02, gain: 0.15 * v });
  }
  hat(t, out, v = 1, open = false) {
    this.nz(t, out, { type: 'highpass', f: open ? 6200 : 7600, dur: open ? 0.26 : 0.045, gain: (open ? 0.12 : 0.15) * v });
  }
  shaker(t, out, v = 1) { this.nz(t, out, { type: 'bandpass', f: 6800, q: 1.2, dur: 0.05, atk: 0.012, gain: 0.12 * v }); }
  crash(t, out, v = 1) { this.nz(t, out, { type: 'highpass', f: 4200, dur: 1.4, gain: 0.2 * v, atk: 0.004 }); }
  /** Guacharaca: wooden scraper. Down-stroke = longer "chhh", up-stroke = short "k". */
  guacharaca(t, out, v = 1, up = false) {
    if (up) {
      this.nz(t, out, { type: 'bandpass', f: 4200, f2: 6800, q: 2.5, dur: 0.045, atk: 0.003, gain: 0.3 * v });
    } else {
      this.nz(t, out, { type: 'bandpass', f: 3800, f2: 5600, q: 2.5, dur: 0.075, atk: 0.006, gain: 0.26 * v });
      this.nz(t + 0.03, out, { type: 'bandpass', f: 5200, q: 3, dur: 0.03, gain: 0.12 * v });
    }
    this.nz(t, out, { type: 'highpass', f: 8000, dur: 0.012, gain: 0.07 * v }); // wooden tick
  }
  /** Membrane drum: tambora (low), llamador (high), caja (snappy) via params. */
  drum(t, out, v = 1, { f0 = 130, f1 = 70, dec = 0.22, noise = 0.1, slap = false } = {}) {
    const o = this._osc('sine', f0, t, t + dec + 0.04), g = this.ctx.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec * 0.5);
    decayEnv(g.gain, t, 0.85 * v, 0.002, dec);
    o.connect(g); g.connect(out);
    if (noise) this.nz(t, out, { type: 'bandpass', f: slap ? 2600 : 1400, q: 1, dur: slap ? 0.05 : 0.03, gain: noise * v * 2 });
  }
  conga(t, out, v = 1, f = 330, slap = false) {
    const c = this.ctx, o = this._osc('sine', f * 1.08, t, t + 0.2), g = c.createGain();
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    decayEnv(g.gain, t, 0.55 * v, 0.001, slap ? 0.07 : 0.16);
    o.connect(g); g.connect(out);
    const o2 = this._osc('triangle', f * 1.9, t, t + 0.1), g2 = c.createGain();
    decayEnv(g2.gain, t, 0.12 * v, 0.001, 0.05); o2.connect(g2); g2.connect(out);
    if (slap) this.nz(t, out, { type: 'bandpass', f: 2800, q: 1.2, dur: 0.03, gain: 0.2 * v });
  }
  cowbell(t, out, v = 1) {
    const c = this.ctx, bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 820; bp.Q.value = 1.1;
    decayEnv(g.gain, t, 0.3 * v, 0.001, 0.13);
    for (const f of [587, 845]) { const o = this._osc('square', f, t, t + 0.18); o.connect(bp); }
    bp.connect(g); g.connect(out);
  }
  clave(t, out, v = 1) {
    const o = this._osc('sine', 2500, t, t + 0.06), g = this.ctx.createGain();
    decayEnv(g.gain, t, 0.3 * v, 0.001, 0.035); o.connect(g); g.connect(out);
  }
  tom(t, out, v = 1, f = 120) { this.drum(t, out, v, { f0: f * 1.6, f1: f, dec: 0.25, noise: 0.03 }); }

  // ---------------------------------------------------------------- bass
  /** 808: pitch-dropped sine with soft saturation. */
  bass808(t, out, { f = 55, dur = 0.4, v = 1, glideTo = 0 } = {}) {
    const c = this.ctx, o = this._osc('sine', f * 1.6, t, t + dur + 0.2), g = c.createGain(), sh = c.createWaveShaper();
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    sh.curve = this.sat3; sh.oversample = '2x';
    sustainEnv(g.gain, t, 0.8 * v, 0.004, dur, 0.12);
    o.connect(sh); sh.connect(g); g.connect(out);
  }
  /** Electric/acoustic-ish plucked bass. */
  bass(t, out, { f = 55, dur = 0.25, v = 1, tone = 1 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(900 * tone, t); lp.frequency.exponentialRampToValueAtTime(240 * tone, t + 0.18);
    const o1 = this._osc('sawtooth', f, t, t + dur + 0.15), o2 = this._osc('sine', f, t, t + dur + 0.15);
    const g1 = c.createGain(); g1.gain.value = 0.35;
    o1.connect(g1); g1.connect(lp); o2.connect(lp); lp.connect(g);
    sustainEnv(g.gain, t, 0.75 * v, 0.006, dur, 0.09);
    g.connect(out);
  }

  // ---------------------------------------------------------------- harmony / lead
  /** Plucked string (cumbia/soukous guitar, reggaeton pluck). */
  pluck(t, out, { f = 440, dur = 0.12, v = 1, type = 'sawtooth', bright = 3200 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(), hp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2.2;
    lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, bright * 0.2), t + dur);
    hp.type = 'highpass'; hp.frequency.value = 140;
    const o1 = this._osc(type, f, t, t + dur + 0.1), o2 = this._osc('square', f * 1.004, t, t + dur + 0.1);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(hp); hp.connect(g);
    decayEnv(g.gain, t, 0.3 * v, 0.003, dur);
    g.connect(out);
  }
  /** Reed organ / "teclado" for cumbia. */
  organ(t, out, { f = 440, dur = 0.14, v = 1 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2800;
    [[1, 'sine', 0.5], [2, 'sine', 0.35], [3, 'triangle', 0.18], [4, 'sine', 0.1]].forEach(([m, ty, a]) => {
      const o = this._osc(ty, f * m, t, t + dur + 0.08), og = c.createGain(); og.gain.value = a;
      o.connect(og); og.connect(lp);
    });
    lp.connect(g); sustainEnv(g.gain, t, 0.22 * v, 0.006, dur, 0.05); g.connect(out);
  }
  /** Accordion: 3 slightly detuned reeds + octave "musette", bellows attack. */
  accordion(t, out, { f = 523, dur = 0.3, v = 1 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(), bp = c.createBiquadFilter(), mix = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.7;
    bp.type = 'peaking'; bp.frequency.value = 1500; bp.gain.value = 5; bp.Q.value = 0.9;
    const end = t + dur + 0.1;
    [['sawtooth', 1, -9, 0.3], ['sawtooth', 1, 9, 0.3], ['square', 1, 0, 0.16], ['sawtooth', 2, 4, 0.12]].forEach(([ty, m, cents, a]) => {
      const o = this._osc(ty, f * m, t, end), og = c.createGain(); og.gain.value = a; o.detune.value = cents;
      if (m === 1 && cents === 0) vibrato(o.detune, t, dur, 5, 5.6, 0.15);
      o.connect(og); og.connect(mix);
    });
    mix.connect(lp); lp.connect(bp); bp.connect(g);
    sustainEnv(g.gain, t, 0.26 * v, 0.018, dur, 0.06); g.connect(out);
  }
  /** Gaita / millo flute with breath noise. */
  flute(t, out, { f = 660, dur = 0.3, v = 1 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3400;
    const end = t + dur + 0.1;
    const o1 = this._osc('sine', f, t, end), o2 = this._osc('triangle', f * 2, t, end), g2 = c.createGain(); g2.gain.value = 0.12;
    vibrato(o1.detune, t, dur, 12, 5.2, 0.1);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
    sustainEnv(g.gain, t, 0.42 * v, 0.03, dur, 0.07); g.connect(out);
    this.nz(t, out, { type: 'bandpass', f: Math.min(7000, f * 4), q: 2, dur: Math.min(dur, 0.25), gain: 0.05 * v, atk: 0.02 });
  }
  /** Synth brass stab (champeta horns). */
  brass(t, out, { f = 392, dur = 0.2, v = 1 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2800, t + 0.045);
    lp.frequency.exponentialRampToValueAtTime(900, t + Math.max(0.1, dur));
    const end = t + dur + 0.1;
    [-7, 7].forEach((cents) => { const o = this._osc('sawtooth', f, t, end); o.detune.value = cents; o.connect(lp); });
    const sub = this._osc('square', f / 2, t, end), sg = c.createGain(); sg.gain.value = 0.35; sub.connect(sg); sg.connect(lp);
    lp.connect(g); sustainEnv(g.gain, t, 0.2 * v, 0.012, dur, 0.06); g.connect(out);
  }
  /** Generic poly lead (square/saw/triangle, detuned pair). */
  lead(t, out, { f = 440, dur = 0.2, v = 1, type = 'square', cutoff = 3200, pluckDec = 0, vib = 0 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 1;
    const end = t + dur + 0.12;
    [-6, 6].forEach((cents) => {
      const o = this._osc(type, f, t, end); o.detune.value = cents; if (vib) vibrato(o.detune, t, dur, vib);
      const og = c.createGain(); og.gain.value = 0.5; o.connect(og); og.connect(lp);
    });
    lp.connect(g);
    if (pluckDec) decayEnv(g.gain, t, 0.28 * v, 0.004, pluckDec); else sustainEnv(g.gain, t, 0.24 * v, 0.008, dur, 0.07);
    g.connect(out);
  }
  /** Chord pad (detuned saws, slow attack). */
  pad(t, out, notes, { dur = 2, v = 1, cutoff = 1100 } = {}) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.6;
    const end = t + dur + 0.6;
    for (const m of notes) for (const cents of [-8, 8]) { const o = this._osc('sawtooth', mtof(m), t, end); o.detune.value = cents; const og = c.createGain(); og.gain.value = 0.12; o.connect(og); og.connect(lp); }
    lp.connect(g); sustainEnv(g.gain, t, 0.5 * v, Math.min(0.5, dur * 0.4), dur, 0.5); g.connect(out);
  }
  /** Soft electric piano (talk bed). */
  epiano(t, out, { f = 440, dur = 0.5, v = 1 } = {}) {
    const c = this.ctx, g = c.createGain();
    const o1 = this._osc('sine', f, t, t + dur + 0.1), o2 = this._osc('sine', f * 2, t, t + dur + 0.1), o3 = this._osc('sine', f * 7.01, t, t + 0.15);
    const g2 = c.createGain(), g3 = c.createGain(); g2.gain.value = 0.25; g3.gain.value = 0.06;
    decayEnv(g3.gain, t, 0.06, 0.001, 0.07);
    o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
    decayEnv(g.gain, t, 0.3 * v, 0.004, dur); g.connect(out);
  }
  /** Vowel "chop" (reggaeton vocal stab). */
  vox(t, out, { f = 330, dur = 0.14, v = 1, vowel = 'e' } = {}) {
    const c = this.ctx, g = c.createGain(), mix = c.createGain(), [f1, f2] = VOWELS[vowel] || VOWELS.e;
    const o = this._osc('sawtooth', f, t, t + dur + 0.08); vibrato(o.detune, t, dur, 10, 6, 0.05);
    [[f1, 1.0], [f2, 0.55]].forEach(([fc, a]) => {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = 6;
      const bg = c.createGain(); bg.gain.value = a; o.connect(bp); bp.connect(bg); bg.connect(mix);
    });
    mix.connect(g); sustainEnv(g.gain, t, 0.9 * v, 0.012, dur, 0.04); g.connect(out);
  }
  /** Laser/"picó" zap. */
  zap(t, out, v = 1, f0 = 3200, f1 = 180, dur = 0.28) {
    const c = this.ctx, o = this._osc('sawtooth', f0, t, t + dur + 0.05), g = c.createGain(), bp = c.createBiquadFilter();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
    decayEnv(g.gain, t, 0.22 * v, 0.003, dur); o.connect(bp); bp.connect(g); g.connect(out);
  }
  /** Noise riser (build-up). */
  riser(t, out, dur = 1.2, v = 1) {
    const c = this.ctx, s = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; hp.type = 'highpass'; hp.Q.value = 2;
    hp.frequency.setValueAtTime(300, t); hp.frequency.exponentialRampToValueAtTime(7500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28 * v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    s.connect(hp); hp.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  /** Sub boom impact. */
  boom(t, out, v = 1, dur = 1.1) {
    const o = this._osc('sine', 90, t, t + dur + 0.05), g = this.ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(30, t + dur * 0.8);
    decayEnv(g.gain, t, 0.9 * v, 0.004, dur); o.connect(g); g.connect(out);
    this.nz(t, out, { type: 'lowpass', f: 1800, f2: 120, dur: 0.5, gain: 0.35 * v });
  }
  /** Radio dial static + whistle sweep. */
  tuning(t, out, v = 1) {
    this.nz(t, out, { type: 'bandpass', f: 600, f2: 4200, q: 0.8, dur: 0.22, gain: 0.3 * v, atk: 0.01 });
    this.nz(t + 0.07, out, { type: 'highpass', f: 2500, dur: 0.2, gain: 0.18 * v });
    const o = this._osc('sine', 500, t, t + 0.22), g = this.ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.2); decayEnv(g.gain, t, 0.05 * v, 0.01, 0.2); o.connect(g); g.connect(out);
  }
}
