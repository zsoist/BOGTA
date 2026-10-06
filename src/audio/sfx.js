// GTA Bogotá — sound effects: tire screech, siren, rain, crowd, traffic bed + wind, horns, crashes, UI, stingers, steps.
// Persistent loops are created once and only have their gains/frequencies retargeted. One-shots are fire-and-forget.
// Every effect prefers a real audio file (assets/sfx/*.mp3, assets/music/{busted,wasted}.mp3) when one was found.
import { Kit, makeNoiseBuffer, makePan, satCurve, decayEnv, sustainEnv, mtof, clamp } from './synth.js';

export const SFX_FILES = ['sfx/horn.mp3', 'sfx/siren.mp3', 'sfx/crash.mp3', 'sfx/cash.mp3', 'sfx/rain.mp3', 'sfx/crowd.mp3', 'sfx/whoosh.mp3', 'music/busted.mp3', 'music/wasted.mp3'];

export function createSfx(ctx, out, kit, assets) {
  const c = ctx;
  const pink = makeNoiseBuffer(c, 4, 'pink'), brown = makeNoiseBuffer(c, 4, 'brown');
  const sat = satCurve(5);
  const sm = (p, v, tc = 0.05) => p.setTargetAtTime(v, c.currentTime, tc);
  const peek = (rel) => (assets ? assets.peek(rel) : undefined);

  const loopSrc = (buf, rate = 1) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * (buf.duration * 0.9)); return s; };
  const oneShot = (rel, { gain = 1, rate = 1, pan = 0, bus = out } = {}) => {
    const buf = peek(rel); if (!buf) return null;
    const s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain; const p = makePan(c, pan);
    s.connect(g); g.connect(p); p.connect(bus); s.start();
    s.onended = () => { try { s.disconnect(); g.disconnect(); p.disconnect(); } catch { /* ignore */ } };
    return { src: s, gain: g };
  };
  const tone = (t, bus, { f = 440, f2 = 0, type = 'sine', dur = 0.1, gain = 0.1, atk = 0.004 } = {}) => {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); decayEnv(g.gain, t, gain, atk, dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + atk + dur + 0.03);
  };
  const panned = (pan) => { const p = makePan(c, pan); p.connect(out); return p; };

  // ================================================================== tire screech (persistent)
  const scrG = c.createGain(); scrG.gain.value = 0; scrG.connect(out);
  const scrNoise = loopSrc(kit.noise), scrBp = c.createBiquadFilter(), scrNg = c.createGain();
  scrBp.type = 'bandpass'; scrBp.frequency.value = 1900; scrBp.Q.value = 6; scrNg.gain.value = 0.9;
  scrNoise.connect(scrBp); scrBp.connect(scrNg); scrNg.connect(scrG);
  const scrTone = c.createOscillator(), scrTone2 = c.createOscillator(), scrTg = c.createGain(), scrTbp = c.createBiquadFilter(), scrWob = c.createOscillator(), scrWobG = c.createGain();
  scrTone.type = 'square'; scrTone.frequency.value = 1150; scrTone2.type = 'sawtooth'; scrTone2.frequency.value = 1730;
  scrTbp.type = 'bandpass'; scrTbp.frequency.value = 1500; scrTbp.Q.value = 3; scrTg.gain.value = 0.22;
  scrWob.frequency.value = 17; scrWobG.gain.value = 55; scrWob.connect(scrWobG); scrWobG.connect(scrTone.frequency); scrWobG.connect(scrTone2.frequency);
  scrTone.connect(scrTbp); scrTone2.connect(scrTbp); scrTbp.connect(scrTg); scrTg.connect(scrG);
  scrTone.start(); scrTone2.start(); scrWob.start();
  const screech = {
    set(level, speedN = 0.5) {
      sm(scrG.gain, clamp(level, 0, 1) * 0.5, 0.045);
      sm(scrBp.frequency, 1500 + speedN * 1100, 0.1);
      sm(scrTone.frequency, 950 + speedN * 450, 0.1); sm(scrTone2.frequency, 1420 + speedN * 700, 0.1);
    },
  };

  // ================================================================== siren (persistent; file loop if available)
  const sirLfo = c.createOscillator(), sirLfoG = c.createGain(), sirA = c.createOscillator(), sirB = c.createOscillator();
  const sirMix = c.createGain(), sirSh = c.createWaveShaper(), sirLp = c.createBiquadFilter(), sirHp = c.createBiquadFilter(), sirPan = makePan(c, 0), sirOut = c.createGain();
  sirLfo.type = 'triangle'; sirLfo.frequency.value = 0.4; sirLfoG.gain.value = 420;
  sirA.type = 'sawtooth'; sirB.type = 'square'; sirA.frequency.value = 1050; sirB.frequency.value = 1050;
  sirLfo.connect(sirLfoG); sirLfoG.connect(sirA.frequency); sirLfoG.connect(sirB.frequency);
  const sB = c.createGain(); sB.gain.value = 0.3; sirA.connect(sirMix); sirB.connect(sB); sB.connect(sirMix);
  sirSh.curve = sat;
  sirLp.type = 'lowpass'; sirLp.frequency.value = 3000; sirLp.Q.value = 0.6; sirHp.type = 'highpass'; sirHp.frequency.value = 350;
  sirMix.connect(sirSh); sirSh.connect(sirLp); sirLp.connect(sirHp); sirHp.connect(sirPan); sirPan.connect(sirOut); sirOut.gain.value = 0; sirOut.connect(out);
  sirLfo.start(); sirA.start(); sirB.start();
  let sirFile = null, sirProcG = 1, sirYelp = false;
  const siren = {
    /** level 0..1, yelp bool, doppler ratio, pan -1..1, cutoff Hz */
    set(level, yelp, doppler = 1, pan = 0, cutoff = 3000) {
      if (!sirFile) { const b = peek('sfx/siren.mp3'); if (b) { sirFile = loopSrc(b); sirFile.connect(sirLp); sirProcG = 0; sm(sirMix.gain, 0, 0.05); } }
      sirYelp = yelp;
      sm(sirOut.gain, clamp(level, 0, 1) * 0.42, 0.12);
      if (!sirFile) {
        sm(sirLfo.frequency, yelp ? 3.6 : 0.42, 0.25);
        sm(sirLfoG.gain, (yelp ? 330 : 430) * doppler, 0.25);
        sirA.frequency.setTargetAtTime((yelp ? 1000 : 1060) * doppler, c.currentTime, 0.1);
        sirB.frequency.setTargetAtTime((yelp ? 1000 : 1060) * doppler * 1.003, c.currentTime, 0.1);
      } else sirFile.playbackRate.setTargetAtTime(doppler, c.currentTime, 0.1);
      sm(sirLp.frequency, cutoff, 0.15);
      sirPan.pan && sm(sirPan.pan, clamp(pan, -1, 1), 0.1);
    },
  };

  // ================================================================== rain (persistent; file loop if available)
  const rainG = c.createGain(), rainLp = c.createBiquadFilter(), rainHp = c.createBiquadFilter(), rainBand = c.createBiquadFilter(), rainBg = c.createGain();
  rainG.gain.value = 0; rainLp.type = 'lowpass'; rainLp.frequency.value = 6000; rainHp.type = 'highpass'; rainHp.frequency.value = 350;
  rainBand.type = 'bandpass'; rainBand.frequency.value = 3600; rainBand.Q.value = 0.5; rainBg.gain.value = 0.35;
  const rainP = loopSrc(pink), rainW = loopSrc(kit.noise);
  rainP.connect(rainHp); rainHp.connect(rainLp); rainLp.connect(rainG); rainW.connect(rainBand); rainBand.connect(rainBg); rainBg.connect(rainLp); rainG.connect(out);
  let rainFile = null;
  const rain = {
    set(level, muffled) {
      if (!rainFile) { const b = peek('sfx/rain.mp3'); if (b) { rainFile = loopSrc(b); rainFile.connect(rainLp); sm(rainBg.gain, 0, 0.05); rainP.disconnect(); } }
      sm(rainG.gain, level * (rainFile ? 1.5 : 0.5) * (muffled ? 0.75 : 1), 0.4);
      sm(rainLp.frequency, muffled ? 1900 : 7000, 0.4);
    },
  };

  // ================================================================== crowd ambience (file only, on foot)
  const crowdG = c.createGain(); crowdG.gain.value = 0; crowdG.connect(out);
  let crowdSrc = null;
  const crowd = {
    set(level) {
      if (!crowdSrc) { const b = peek('sfx/crowd.mp3'); if (!b) return; crowdSrc = loopSrc(b); crowdSrc.connect(crowdG); }
      sm(crowdG.gain, level * 1.0, 0.8);
    },
  };

  // ================================================================== traffic hum + wind/road (persistent)
  const humG = c.createGain(), humLp = c.createBiquadFilter(), windG = c.createGain(), windBp = c.createBiquadFilter(), roadG = c.createGain(), roadLp = c.createBiquadFilter();
  humG.gain.value = 0; humLp.type = 'lowpass'; humLp.frequency.value = 260;
  windG.gain.value = 0; windBp.type = 'bandpass'; windBp.frequency.value = 900; windBp.Q.value = 0.35;
  roadG.gain.value = 0; roadLp.type = 'lowpass'; roadLp.frequency.value = 700;
  loopSrc(brown).connect(humLp); humLp.connect(humG); humG.connect(out);
  loopSrc(pink).connect(windBp); windBp.connect(windG); windG.connect(out);
  loopSrc(brown, 1.3).connect(roadLp); roadLp.connect(roadG); roadG.connect(out);
  const bed = {
    set(traffic, speedN, driving) {
      sm(humG.gain, 0.05 + traffic * 0.2, 0.4); sm(humLp.frequency, 200 + traffic * 260, 0.4);
      sm(windG.gain, speedN * speedN * 0.1 * (driving ? 1 : 0), 0.15); sm(windBp.frequency, 600 + speedN * 1300, 0.15);
      sm(roadG.gain, speedN * 0.12 * (driving ? 1 : 0), 0.15);
    },
  };

  // ================================================================== horns
  const hornG = c.createGain(), hornLp = c.createBiquadFilter(), hornHp = c.createBiquadFilter(), hornOscs = [];
  hornG.gain.value = 0; hornLp.type = 'lowpass'; hornLp.frequency.value = 3400; hornHp.type = 'highpass'; hornHp.frequency.value = 260;
  [['sawtooth', 466, 0.5], ['sawtooth', 587, 0.5], ['square', 932, 0.15]].forEach(([ty, f, a]) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = ty; o.frequency.value = f; g.gain.value = a; o.connect(g); g.connect(hornLp); o.start(); hornOscs.push([o, f]);
  });
  hornLp.connect(hornHp); hornHp.connect(hornG); hornG.connect(out);
  let hornOn = false, hornT0 = 0, hornFile = null;
  const horn = {
    get on() { return hornOn; },
    /** Player horn: call every frame with the key state. "pi-pííí": short beep, then a long one for as long as it's held. */
    player(down) {
      const now = c.currentTime;
      if (down && !hornOn) {
        hornOn = true; hornT0 = now;
        const fileHorn = oneShot('sfx/horn.mp3', { gain: 0.55 });
        if (fileHorn) { hornFile = fileHorn; return; }
        const g = hornG.gain; g.cancelScheduledValues(now);
        g.setValueAtTime(0, now); g.linearRampToValueAtTime(0.32, now + 0.012); g.setValueAtTime(0.32, now + 0.1); g.linearRampToValueAtTime(0.0, now + 0.12);
        g.setValueAtTime(0, now + 0.18); g.linearRampToValueAtTime(0.34, now + 0.2);
        for (const [o, f] of hornOscs) { o.frequency.cancelScheduledValues(now); o.frequency.setValueAtTime(f, now); o.frequency.setValueAtTime(f * 1.045, now + 0.18); }
      } else if (!down && hornOn && now - hornT0 > 0.35) {
        hornOn = false;
        if (hornFile) { try { hornFile.gain.gain.setTargetAtTime(0, now, 0.05); hornFile.src.stop(now + 0.3); } catch { /* ignore */ } hornFile = null; return; }
        hornG.gain.cancelScheduledValues(now); hornG.gain.setValueAtTime(hornG.gain.value, now); hornG.gain.linearRampToValueAtTime(0, now + 0.06);
      }
    },
    /** Another car's horn. level 0..1 (distance-attenuated by the caller), pan -1..1, pitch multiplier per car. */
    honk(level, pan, pitch = 1) {
      if (level < 0.02) return;
      if (oneShot('sfx/horn.mp3', { gain: level, pan, rate: pitch })) return;
      const t = c.currentTime + 0.01, p = panned(pan), g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3000; g.gain.value = 0; lp.connect(g); g.connect(p);
      const f0 = (Math.random() < 0.5 ? 440 : 500) * pitch;
      [['sawtooth', f0], ['sawtooth', f0 * 1.26], ['square', f0 * 2]].forEach(([ty, f], i) => { const o = c.createOscillator(); o.type = ty; o.frequency.value = f; const og = c.createGain(); og.gain.value = i === 2 ? 0.1 : 0.4; o.connect(og); og.connect(lp); o.start(t); o.stop(t + 0.8); });
      const A = 0.28 * level;
      if (Math.random() < 0.5) { sustainEnv(g.gain, t, A, 0.012, 0.11, 0.015); g.gain.setValueAtTime(0, t + 0.2); g.gain.linearRampToValueAtTime(A, t + 0.215); g.gain.setValueAtTime(A, t + 0.58); g.gain.linearRampToValueAtTime(0, t + 0.62); }
      else { sustainEnv(g.gain, t, A, 0.012, 0.42, 0.04); }
    },
  };

  // ================================================================== crashes / explosions / whoosh
  const crash = (intensity, level = 1, pan = 0) => {
    const I = clamp(intensity, 0, 1), L = level * (0.3 + 0.9 * I), t = c.currentTime + 0.005;
    const fileHit = oneShot('sfx/crash.mp3', { gain: L * 0.7, rate: 0.92 + Math.random() * 0.16 - I * 0.1, pan });
    const p = panned(pan);
    if (!fileHit) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.22);
      decayEnv(g.gain, t, L * 0.85, 0.003, 0.18 + 0.3 * I); o.connect(g); g.connect(p); o.start(t); o.stop(t + 0.6);
      kit.nz(t, p, { type: 'lowpass', f: 1400, f2: 180, dur: 0.18 + 0.3 * I, gain: L * 0.6 });
      kit.nz(t, p, { type: 'bandpass', f: 2200, f2: 700, q: 1.1, dur: 0.14 + 0.2 * I, gain: L * 0.5 });
      if (I > 0.3) { tone(t, p, { f: 410, type: 'triangle', dur: 0.3, gain: L * 0.12 }); tone(t + 0.01, p, { f: 653, type: 'triangle', dur: 0.22, gain: L * 0.08 }); }
      if (I > 0.5) for (let i = 0; i < 7; i++) kit.nz(t + 0.03 + Math.random() * 0.55, p, { type: 'highpass', f: 5000 + Math.random() * 4000, dur: 0.03, gain: L * 0.18 }); // glass
      for (let i = 0; i < 2 + Math.round(I * 4); i++) kit.nz(t + 0.1 + Math.random() * 0.6, p, { type: 'bandpass', f: 1500 + Math.random() * 2500, q: 2, dur: 0.04, gain: L * 0.12 }); // debris
    }
  };
  const explosion = (level = 1, pan = 0) => {
    const t = c.currentTime + 0.005, p = panned(pan);
    kit.boom(t, p, level, 1.4);
    kit.nz(t, p, { type: 'lowpass', f: 3500, f2: 120, dur: 1.4, gain: 0.5 * level });
    for (let i = 0; i < 8; i++) kit.nz(t + 0.1 + Math.random() * 1.0, p, { type: 'bandpass', f: 800 + Math.random() * 3000, q: 2, dur: 0.05, gain: 0.12 * level });
  };
  const whoosh = (level = 0.5, pan = 0, speedN = 0.5) => {
    if (oneShot('sfx/whoosh.mp3', { gain: level * 1.6, pan, rate: 0.85 + speedN * 0.4 })) return;
    const t = c.currentTime + 0.005, p = panned(pan), dur = 0.55 - speedN * 0.2;
    const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = kit.noise; bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(1600 + speedN * 1200, t + dur * 0.45); bp.frequency.exponentialRampToValueAtTime(380, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35 * level, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(bp); bp.connect(g); g.connect(p); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  };
  const thunder = (level = 1) => {
    const t = c.currentTime + 0.05, p = panned((Math.random() - 0.5) * 0.8);
    kit.nz(t, p, { type: 'lowpass', f: 420, f2: 70, dur: 3.2, gain: 0.55 * level, atk: 0.35, q: 0.8 });
    for (let i = 0; i < 4; i++) kit.nz(t + 0.3 + i * 0.45 + Math.random() * 0.3, p, { type: 'lowpass', f: 250, f2: 60, dur: 1.4, gain: 0.3 * level, atk: 0.1 });
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(48, t); o.frequency.exponentialRampToValueAtTime(28, t + 2.5);
    decayEnv(g.gain, t, 0.5 * level, 0.3, 2.4); o.connect(g); g.connect(p); o.start(t); o.stop(t + 3);
  };

  // ================================================================== UI + feedback
  const ui = (kind = 'info') => {
    const t = c.currentTime + 0.005;
    if (kind === 'good') { [84, 88, 91].forEach((m, i) => tone(t + i * 0.065, out, { f: mtof(m), type: 'triangle', dur: 0.14, gain: 0.1 })); tone(t + 0.2, out, { f: mtof(96), type: 'sine', dur: 0.3, gain: 0.05 }); }
    else if (kind === 'bad') { tone(t, out, { f: 233, f2: 196, type: 'square', dur: 0.14, gain: 0.07 }); tone(t + 0.13, out, { f: 175, f2: 147, type: 'square', dur: 0.2, gain: 0.07 }); }
    else { tone(t, out, { f: 880, type: 'triangle', dur: 0.08, gain: 0.1 }); tone(t + 0.075, out, { f: 1319, type: 'triangle', dur: 0.12, gain: 0.09 }); }
  };
  const cash = (big = false) => {
    if (oneShot('sfx/cash.mp3', { gain: 1.2 })) return;
    const t = c.currentTime + 0.005;
    kit.nz(t, out, { type: 'bandpass', f: 3200, q: 1.5, dur: 0.035, gain: 0.25 });              // "cha" (drawer click)
    kit.nz(t + 0.04, out, { type: 'highpass', f: 5000, dur: 0.05, gain: 0.12 });
    tone(t + 0.012, out, { f: 110, f2: 70, dur: 0.12, gain: 0.18 });                              // drawer thump
    [[2093, 0.12], [2637, 0.1], [3136, 0.07], [5587, 0.03]].forEach(([f, a]) => tone(t + 0.09, out, { f, type: 'sine', dur: big ? 0.9 : 0.6, gain: a }));   // "ching" bell
    if (big) [2093, 2637].forEach((f) => tone(t + 0.22, out, { f: f * 1.5, dur: 0.5, gain: 0.06 }));
  };
  const loss = () => { const t = c.currentTime + 0.005; tone(t, out, { f: 330, f2: 220, type: 'triangle', dur: 0.2, gain: 0.1 }); tone(t + 0.12, out, { f: 247, f2: 165, type: 'triangle', dur: 0.25, gain: 0.1 }); };
  const wanted = (up) => {
    const t = c.currentTime + 0.005;
    if (up) { tone(t, out, { f: 988, type: 'square', dur: 0.09, gain: 0.06 }); tone(t + 0.11, out, { f: 1319, type: 'square', dur: 0.2, gain: 0.06 }); tone(t + 0.02, out, { f: 500, f2: 1100, type: 'sawtooth', dur: 0.35, gain: 0.05 }); }
    else { [88, 84, 79].forEach((m, i) => tone(t + i * 0.1, out, { f: mtof(m), type: 'sine', dur: 0.3, gain: 0.07 })); }
  };
  const door = () => {
    const t = c.currentTime + 0.005;
    tone(t, out, { f: 120, f2: 55, dur: 0.14, gain: 0.3 });
    kit.nz(t, out, { type: 'lowpass', f: 900, f2: 200, dur: 0.1, gain: 0.25 });
    kit.nz(t + 0.09, out, { type: 'bandpass', f: 2400, q: 3, dur: 0.02, gain: 0.12 });     // latch
  };
  const step = (run = false, road = false) => {
    const t = c.currentTime + 0.002;
    kit.nz(t, out, { type: 'lowpass', f: 700 + Math.random() * 500, dur: 0.07, gain: run ? 0.12 : 0.085 });
    tone(t, out, { f: 90 + Math.random() * 25, f2: 60, dur: 0.07, gain: run ? 0.12 : 0.08 });
    if (road) kit.nz(t, out, { type: 'highpass', f: 3500, dur: 0.03, gain: 0.04 });
  };

  // ================================================================== stingers
  const busted = () => {
    const t = c.currentTime + 0.02;
    if (oneShot('music/busted.mp3', { gain: 1.4 })) return;
    const p = out;
    [0, 0.38].forEach((d) => { const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; o.type = 'sawtooth'; o.frequency.setValueAtTime(650, t + d); o.frequency.exponentialRampToValueAtTime(1500, t + d + 0.3); decayEnv(g.gain, t + d, 0.1, 0.02, 0.32); o.connect(lp); lp.connect(g); g.connect(p); o.start(t + d); o.stop(t + d + 0.5); });
    [[220, 0.3], [330, 0.2], [554, 0.14], [880, 0.1]].forEach(([f, a], i) => tone(t + 0.1, p, { f: f * (1 + i * 0.012), type: 'sine', dur: 2.2, gain: a }));      // gong
    [[62, 0.6], [60, 0.6], [57, 1.3]].forEach(([m, d], i) => kit.brass(t + 0.45 + i * 0.5, p, { f: mtof(m), dur: d, v: 1.1 })); // "wah wah waaah"
    kit.boom(t + 0.1, p, 0.7, 0.8);
  };
  const wasted = (masterLp) => {
    const t = c.currentTime + 0.02;
    if (masterLp) { const f = masterLp.frequency; f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(380, t + 1.2); f.setValueAtTime(380, t + 3.6); f.exponentialRampToValueAtTime(20000, t + 5.2); }
    const file = oneShot('music/wasted.mp3', { gain: 1.4 });
    kit.boom(t, out, 1, 1.8);
    // heartbeat, slowing down
    [0.1, 0.34, 1.0, 1.28, 2.1, 2.44].forEach((d, i) => tone(t + d, out, { f: 58, f2: 38, dur: 0.2, gain: i % 2 ? 0.32 : 0.45 }));
    // tinnitus ring
    tone(t + 0.05, out, { f: 3150, dur: 2.8, gain: 0.025, atk: 0.1 });
    if (!file) {
      // sad slide-trombone
      [[196, 130, 0.5], [185, 123, 0.5], [175, 98, 1.1]].forEach(([a, b, d], i) => {
        const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; o.type = 'sawtooth';
        const st = t + 0.5 + i * 0.6; o.frequency.setValueAtTime(a, st); o.frequency.exponentialRampToValueAtTime(b, st + d);
        sustainEnv(g.gain, st, 0.18, 0.04, d, 0.2); o.connect(lp); lp.connect(g); g.connect(out); o.start(st); o.stop(st + d + 0.3);
      });
    }
  };

  return { screech, siren, rain, crowd, bed, horn, crash, explosion, whoosh, thunder, ui, cash, loss, wanted, door, step, busted, wasted, oneShot, isFile: (rel) => !!peek(rel) };
}
