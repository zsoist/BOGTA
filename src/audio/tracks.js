// GTA Bogotá — procedural songs. Each song is data (sections/chords/phrases) + a play(S) function called once per
// 16th-note step by the radio sequencer's lookahead scheduler. 16 steps = 1 bar.
//   S = { t, step, stepDur, bar (bar within section), secBars, secName, sec, chord, next, first, last, k (Kit), b (buses), loop }
// Buses: b.drums, b.bass, b.harm, b.lead, b.fx.

import { mtof } from './synth.js';

const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIN = [0, 2, 3, 5, 7, 8, 10];
const deg = (root, scale, d) => root + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const TRI = { m: [0, 3, 7], M: [0, 4, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11] };
const C = (r, q) => ({ r, q });
const triad = (c, up = 0) => TRI[c.q].map((i) => c.r + i + up);
const jit = (x) => x * (0.88 + Math.random() * 0.24);
const pitchOf = (n, root, scale) => (typeof n === 'object' ? n.m : deg(root, scale, n));
// Approach note: next chord's root, in the octave closest to this chord's root.
const approach = (c, n) => { let r = n ? n.r : c.r; while (r - c.r > 7) r -= 12; while (c.r - r > 7) r += 12; return r; };
function phraseAt(S, phrase, fn) { if (!phrase) return; for (const e of phrase) if (e[0] === S.step) fn(e[1], e[2]); }
const roll = (S, from, k, out, fn) => { if (S.last && S.step >= from) fn((S.step - from + 1) / (16 - from + 1)); };

// =========================================================================================== CUMBIA (Tropicombo)
const Am = C(33, 'm'), Dm = C(38, 'm'), E7 = C(40, '7'), F = C(41, 'M'), G = C(43, 'M');
const CUMBIA = {
  bpm: 100, swing: 0.05, level: 0.6,
  mix: { drums: 0.85, bass: 0.95, harm: 0.7, lead: 0.8, fx: 0.7 },
  sections: {
    intro: { bars: 2, chords: [Am, E7], bass: [0, 1], organ: 0, mel: [
      [[0, 4, 4], [4, 2, 4], [8, 0, 8]],
      [[0, 1, 4], [4, { m: 68 }, 4], [8, 1, 4], [12, { m: 68 }, 4]]], melVoice: 'flute' },
    A: { bars: 4, chords: [Am, Dm, E7, Am], bass: [0, 1, 2, 3], organ: 1, melVoice: 'flute', mel: [
      [[0, 0, 4], [4, 2, 2], [8, 4, 4], [12, 3, 2], [14, 2, 2]],
      [[0, 3, 4], [4, 5, 2], [6, 4, 2], [8, 3, 4], [12, 2, 4]],
      [[0, 1, 4], [6, 2, 2], [8, 1, 2], [10, { m: 68 }, 2], [12, 1, 4]],
      [[0, 0, 6], [8, 2, 2], [10, 1, 2], [12, 0, 4]]] },
    B: { bars: 4, chords: [F, G, Am, E7], bass: [0, 1, 2, 3], organ: 1, pad: 1, melVoice: 'lead', mel: [
      [[0, 4, 2], [2, 4, 2], [4, 3, 2], [6, 2, 2], [8, 2, 1], [10, 3, 2], [12, 4, 4]],
      [[0, 3, 2], [2, 3, 2], [4, 2, 2], [6, 1, 2], [8, 1, 1], [10, 2, 2], [12, 3, 4]],
      [[0, 2, 2], [2, 2, 2], [4, 1, 2], [6, 0, 2], [8, 0, 2], [10, 1, 2], [12, 2, 4]],
      [[0, 1, 3], [4, 1, 1], [6, 2, 1], [8, 1, 2], [10, { m: 68 }, 2], [12, 0, 4]]] },
    brk: { bars: 2, chords: [Am, E7], bass: [0, 1], organ: 0, perc: 1, mel: null },
  },
  order: ['intro', 'A', 'B', 'A', 'B', 'brk', 'B'],
  play(S) {
    const { t, step: s, k, b, sec, chord, bar } = S;
    const sd = S.stepDur;
    if (S.first && s === 0 && S.secName !== 'intro') k.crash(t, b.fx, 0.6);
    // tambora (low) on 1 & 3, llamador (high, "toc") on 2 & 4
    if (s === 0 || s === 8) k.drum(t, b.drums, jit(0.95), { f0: 135, f1: 68, dec: 0.26, noise: 0.08 });
    if (s === 4 || s === 12) k.drum(t, b.drums, jit(0.6), { f0: 330, f1: 250, dec: 0.11, noise: 0.1, slap: true });
    if (s === 6 || s === 14) k.drum(t, b.drums, jit(0.25), { f0: 120, f1: 80, dec: 0.1, noise: 0.02 });
    // guacharaca: steady 8ths, accent on the off-8th ("ch-KA"), 16th ghosts
    if (s % 2 === 0) k.guacharaca(t, b.drums, jit(s % 4 === 2 ? 1 : 0.55), s % 4 === 2);
    else k.guacharaca(t, b.drums, jit(0.16), true);
    if (!sec.perc || S.bar) k.shaker(t, b.drums, jit(s % 2 ? 0.4 : 0.7));
    if (sec.perc && s % 2 === 0) k.conga(t, b.drums, jit(s % 4 ? 0.5 : 0.8), s % 4 ? 300 : 360, s % 4 === 2);
    // fill into the next section
    roll(S, 12, k, b.drums, (p) => k.conga(t, b.drums, 0.4 + 0.5 * p, 280 + 120 * p, true));
    // bass tumbao (root / fifth)
    if (sec.bass && sec.bass.includes(bar) && !(S.secName === 'intro' && bar === 0)) {
      const r = chord.r;
      const bp = { 0: [r, 3], 3: [r, 1.3], 6: [r + 7, 2], 8: [r, 3], 11: [r, 1.3], 14: [approach(chord, S.next), 1.5] }[s];
      if (bp) k.bass(t, b.bass, { f: mtof(bp[0]), dur: bp[1] * sd, v: jit(s === 0 ? 1 : 0.8), tone: 1.1 });
    }
    // organ "chuc-chuc" upbeats
    if (sec.organ && (s === 2 || s === 6 || s === 10 || s === 14)) for (const m of triad(chord, 24)) k.organ(t, b.harm, { f: mtof(m), dur: sd * 1.4, v: jit(s === 6 || s === 14 ? 0.8 : 0.6) });
    if (sec.pad && s === 0 && bar % 2 === 0) k.pad(t, b.harm, triad(chord, 36), { dur: sd * 30, v: 0.35, cutoff: 1400 });
    // melody
    if (sec.mel) {
      phraseAt(S, sec.mel[bar], (n, len) => {
        const m = pitchOf(n, 69, MIN);
        if (sec.melVoice === 'flute') k.flute(t, b.lead, { f: mtof(m), dur: len * sd * 0.95, v: jit(0.9) });
        else { k.lead(t, b.lead, { f: mtof(m), dur: len * sd * 0.9, v: jit(0.9), type: 'square', cutoff: 2800, vib: 7 }); k.flute(t, b.lead, { f: mtof(m + 12), dur: len * sd * 0.8, v: 0.35 }); }
      });
    }
  },
};

// =========================================================================================== VALLENATO (acordeón)
const VC = C(36, 'M'), VF = C(41, 'M'), VG7 = C(43, '7'), VAm = C(45, 'm'), VDm = C(38, 'm');
const VALLENATO = {
  bpm: 115, swing: 0.04, level: 0.55,
  mix: { drums: 0.85, bass: 0.95, harm: 0.7, lead: 0.9, fx: 0.7 },
  sections: {
    intro: { bars: 2, chords: [VC, VG7], bassOn: 0, mel: [
      [[0, 2, 2], [2, 4, 2], [4, 7, 2], [6, 6, 2], [8, 5, 2], [10, 4, 2], [12, 2, 4]],
      [[0, 1, 2], [2, 3, 2], [4, 6, 2], [6, 5, 2], [8, 4, 2], [10, 1, 2], [12, -1, 4]]] },
    verse: { bars: 4, chords: [VC, VF, VG7, VC], bassOn: 1, mel: [
      [[0, 2, 3], [4, 4, 2], [6, 2, 2], [8, 4, 4]],
      [[0, 3, 3], [4, 5, 2], [6, 3, 2], [8, 5, 4]],
      [[0, 1, 2], [2, 3, 2], [4, 1, 2], [6, -1, 2], [8, 1, 4]],
      [[0, 0, 4], [6, 2, 2], [8, 4, 2], [10, 2, 2], [12, 0, 4]]] },
    chorus: { bars: 4, chords: [VC, VAm, VF, VG7], bassOn: 1, hook: 1, mel: [
      [[0, 2, 2], [2, 4, 2], [4, 4, 2], [6, 2, 2], [8, 4, 2], [10, 5, 2], [12, 4, 2], [14, 2, 2]],
      [[0, 2, 2], [2, 5, 2], [4, 5, 2], [6, 4, 2], [8, 2, 4], [12, 1, 2], [14, 2, 2]],
      [[0, 3, 2], [2, 5, 2], [4, 5, 2], [6, 3, 2], [8, 5, 2], [10, 7, 2], [12, 5, 2], [14, 3, 2]],
      [[0, 1, 2], [2, 4, 2], [4, 3, 2], [6, 1, 2], [8, -1, 4], [12, 0, 4]]] },
    bridge: { bars: 4, chords: [VAm, VDm, VG7, VC], bassOn: 1, run: 1, mel: [
      [[0, 5, 1], [1, 4, 1], [2, 2, 1], [3, 4, 1], [4, 5, 2], [6, 7, 2], [8, 5, 4], [12, 4, 2], [14, 2, 2]],
      [[0, 3, 1], [1, 5, 1], [2, 3, 1], [3, 1, 1], [4, 3, 2], [6, 5, 2], [8, 6, 4], [12, 5, 2], [14, 3, 2]],
      [[0, 1, 1], [1, 3, 1], [2, 4, 1], [3, 6, 1], [4, 5, 1], [5, 4, 1], [6, 3, 1], [7, 1, 1], [8, -1, 4], [12, 1, 4]],
      [[0, 2, 4], [4, 4, 2], [6, 7, 2], [8, 7, 8]]] },
  },
  order: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
  play(S) {
    const { t, step: s, k, b, sec, chord, bar } = S;
    const sd = S.stepDur;
    if (S.first && s === 0 && S.secName !== 'intro') k.crash(t, b.fx, 0.45);
    // caja vallenata + bombo
    if (s === 0 || s === 8) k.drum(t, b.drums, jit(0.9), { f0: 150, f1: 78, dec: 0.2, noise: 0.06 });
    if (s === 4 || s === 12) k.drum(t, b.drums, jit(0.85), { f0: 260, f1: 190, dec: 0.1, noise: 0.22, slap: true });
    if (s === 7 || s === 10 || s === 15) k.drum(t, b.drums, jit(0.3), { f0: 280, f1: 210, dec: 0.07, noise: 0.12, slap: true });
    if (s === 6) k.drum(t, b.drums, jit(0.4), { f0: 140, f1: 90, dec: 0.1, noise: 0.03 });
    // guacharaca: 8ths + flurry at the end of each bar
    if (s % 2 === 0) k.guacharaca(t, b.drums, jit(s % 4 === 2 ? 0.9 : 0.5), s % 4 === 2);
    else if (s >= 13) k.guacharaca(t, b.drums, jit(0.5), true);
    else k.guacharaca(t, b.drums, jit(0.14), true);
    roll(S, 12, k, b.drums, (p) => k.drum(t, b.drums, 0.4 + 0.5 * p, { f0: 250, f1: 190, dec: 0.08, noise: 0.2, slap: true }));
    // oom-pah bass with approach note
    if (sec.bassOn || bar > 0) {
      const r = chord.r;
      const bp = { 0: [r, 3], 4: [r + 7, 2], 8: [r, 3], 12: [r + 7, 2], 14: [approach(chord, S.next), 2] }[s];
      if (bp) k.bass(t, b.bass, { f: mtof(bp[0]), dur: bp[1] * sd, v: jit(s === 0 ? 1 : 0.78), tone: 0.8 });
    }
    // accordion left hand (chords on 2 & 4)
    if ((sec.bassOn || bar > 0) && (s === 4 || s === 12)) for (const m of triad(chord, 24)) k.accordion(t, b.harm, { f: mtof(m), dur: sd * 3, v: 0.32 });
    // accordion right hand (melody) with grace-note ornaments
    phraseAt(S, sec.mel && sec.mel[bar], (n, len) => {
      const m = pitchOf(n, 72, MAJ);
      if (len >= 3 && Math.random() < 0.4) k.accordion(t - 0.05, b.lead, { f: mtof(deg(72, MAJ, typeof n === 'number' ? n + 1 : 0)), dur: 0.06, v: 0.55 });
      k.accordion(t, b.lead, { f: mtof(m), dur: Math.max(0.09, len * sd * 0.93), v: jit(len >= 2 ? 1 : 0.8) });
    });
  },
};

// =========================================================================================== REGGAETÓN (dembow)
const RAm = C(33, 'm'), RF = C(29, 'M'), RC = C(36, 'M'), RG = C(31, 'M');
const REGGAETON = {
  bpm: 95, swing: 0, level: 0.95,
  mix: { drums: 0.85, bass: 1.0, harm: 0.6, lead: 0.8, fx: 0.8 },
  sections: {
    intro: { bars: 2, chords: [RAm, RF], pad: 1, drums: 0, bass: 0, hats: 1 },
    verse: { bars: 4, chords: [RAm, RF, RC, RG], pad: 0, drums: 1, bass: 1, hats: 1, stabs: 1, mel: null },
    pre: { bars: 2, chords: [RAm, RG], pad: 1, drums: 1, kick: 0, bass: 1, hats: 1, riser: 1, mel: null },
    chorus: { bars: 4, chords: [RAm, RF, RC, RG], pad: 1, drums: 1, bass: 1, hats: 1, hook: 1, mel: [
      [[0, 4, 2], [3, 4, 1], [4, 2, 2], [6, 0, 2], [8, 2, 3], [12, 4, 2], [14, 2, 1]],
      [[0, 2, 2], [3, 2, 1], [4, 0, 2], [6, -2, 2], [8, 0, 3], [12, 2, 2], [14, 0, 1]],
      [[0, 4, 2], [3, 4, 1], [4, 2, 2], [6, 4, 2], [8, 5, 3], [12, 4, 2], [14, 2, 1]],
      [[0, 3, 2], [3, 3, 1], [4, 1, 2], [6, 3, 2], [8, 4, 4], [12, 3, 2], [14, 1, 2]]] },
    brk: { bars: 2, chords: [RAm, RF], pad: 1, drums: 0, bass: 1, hats: 0, vox: 1 },
  },
  order: ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'brk', 'chorus'],
  play(S) {
    const { t, step: s, k, b, sec, chord, bar } = S;
    const sd = S.stepDur;
    if (S.first && s === 0) {
      if (S.secName === 'chorus') { k.boom(t, b.fx, 0.9, 0.9); k.crash(t, b.fx, 0.7); }
      if (S.secName === 'verse') k.crash(t, b.fx, 0.35);
    }
    if (sec.pad && s === 0 && (bar % 2 === 0)) k.pad(t, b.harm, triad(chord, 48), { dur: sd * 30, v: S.secName === 'intro' ? 0.7 : 0.45, cutoff: 1300 });
    // dembow: kick every beat; snare/rim on the 3-3-2 "ch-ch" positions
    if (sec.drums) {
      if (sec.kick !== 0 && s % 4 === 0) k.kick(t, b.drums, jit(0.85), { f0: 150, f1: 46, dec: 0.22 });
      if (s === 3 || s === 11) { k.snare(t, b.drums, jit(0.65), { tone: 210 }); }
      if (s === 6 || s === 14) { k.snare(t, b.drums, jit(0.95), { tone: 225 }); k.clap(t, b.drums, jit(0.4)); }
      if (s === 7 || s === 15) k.rim(t, b.drums, jit(0.35));
    }
    if (sec.hats) {
      if (s % 2 === 0) k.hat(t, b.drums, jit(s % 4 === 2 ? 0.8 : 0.55), s === 14 && bar % 2 === 1);
      else if (S.secName === 'chorus' || S.secName === 'pre') k.hat(t, b.drums, jit(0.25));
    }
    if (S.secName === 'pre') {
      if (s === 0 && bar === 0) k.riser(t, b.fx, sd * 32, 1);
      if (S.last && s >= 8) k.snare(t, b.drums, 0.3 + (s - 8) * 0.1, { tone: 230 });
    }
    // 808 following the kick pattern
    if (sec.bass && !(S.secName === 'pre' && S.last && s >= 12)) {
      const f = mtof(chord.r), nx = mtof(S.next ? S.next.r : chord.r);
      const bp = { 0: [5, 0], 6: [2, 0], 8: [3, 0], 11: [2, 0], 14: [2, S.last ? nx : 0] }[s];
      if (bp && (S.secName !== 'brk' || s === 0 || s === 8)) k.bass808(t, b.bass, { f, dur: bp[0] * sd * 0.92, v: jit(s === 0 ? 1 : 0.85), glideTo: bp[1] });
    }
    // plucked chord stabs in the verse (3-3-2)
    if (sec.stabs && (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14)) for (const m of triad(chord, 36)) k.pluck(t, b.harm, { f: mtof(m), dur: sd * 1.4, v: jit(s === 0 ? 0.8 : 0.5), bright: 2600 });
    // perreo hook: square pluck lead + vocal chop on the bar ends
    phraseAt(S, sec.mel && sec.mel[bar], (n, len) => k.lead(t, b.lead, { f: mtof(pitchOf(n, 69, MIN)), dur: len * sd, v: jit(0.95), type: 'square', cutoff: 3600, pluckDec: Math.max(0.14, len * sd * 0.8) }));
    if (sec.hook && s === 14) k.vox(t, b.lead, { f: mtof(bar % 2 ? 59 : 64), dur: sd * 2, v: 0.7, vowel: bar % 2 ? 'a' : 'e' });
    if (sec.hook && s === 0 && bar === 0) k.vox(t, b.lead, { f: mtof(57), dur: sd * 3, v: 0.8, vowel: 'o' });
    if (sec.vox) {
      if (s === 0 || s === 8) k.vox(t, b.lead, { f: mtof(s ? 64 : 60), dur: sd * 4, v: 0.7, vowel: s ? 'e' : 'a' });
      if (s === 12 && S.last) k.riser(t, b.fx, sd * 4, 0.9);
    }
  },
};

// =========================================================================================== CHAMPETA (soukous guitars)
const CG = C(31, 'M'), CE = C(40, 'm'), CC = C(36, 'M'), CD = C(38, 'M');
const GUITAR = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 3, 4, 3, 2, 1];
const GUITAR2 = [3, 2, 4, 2, 3, 1, 2, 0, 3, 2, 4, 3, 2, 1, 2, 4];
const ACC332 = new Set([0, 3, 6, 8, 11, 14]);
const CHAMPETA = {
  bpm: 125, swing: 0.02, level: 0.65,
  mix: { drums: 0.8, bass: 0.95, harm: 0.65, lead: 0.75, fx: 0.7 },
  sections: {
    intro: { bars: 2, chords: [CG, CE], guitar: 1, drums: 0, bass: 0 },
    A: { bars: 4, chords: [CG, CE, CC, CD], guitar: 1, drums: 1, bass: 1 },
    B: { bars: 4, chords: [CC, CD, CE, CD], guitar: 1, drums: 1, bass: 1, horns: 1, hook: 1, mel: [
      [[0, 5, 2], [2, 4, 2], [4, 3, 2], [8, 0, 2], [10, 3, 2], [14, 5, 2]],
      [[0, 6, 2], [2, 5, 2], [4, 4, 2], [8, 1, 2], [10, 4, 2], [14, 6, 2]],
      [[0, 5, 2], [2, 4, 2], [4, 2, 2], [8, 0, 2], [10, 2, 2], [14, 4, 2]],
      [[0, 4, 4], [6, 1, 2], [8, 4, 2], [10, 6, 2], [12, 7, 4]]] },
    sebene: { bars: 4, chords: [CG, CE, CC, CD], guitar: 2, drums: 1, bass: 1, perc: 1 },
  },
  order: ['intro', 'A', 'B', 'A', 'B', 'sebene', 'B'],
  play(S) {
    const { t, step: s, k, b, sec, chord, bar } = S;
    const sd = S.stepDur;
    if (S.first && s === 0) { k.zap(t, b.fx, 0.8); if (S.secName !== 'intro') k.crash(t, b.fx, 0.5); }
    if (sec.guitar) {
      let base = chord.r + 24; while (base > 65) base -= 12;
      const third = chord.q === 'm' ? 3 : 4;
      const tones = [0, third, 7, 12, 12 + third];
      const idx = (sec.guitar === 2 ? GUITAR2 : GUITAR)[s];
      const up = sec.guitar === 2 ? 12 : 0;
      const acc = ACC332.has(s);
      k.pluck(t, b.harm, { f: mtof(base + tones[idx] + up), dur: sd * (acc ? 1.7 : 0.9), v: jit(acc ? 1 : 0.5), bright: acc ? 3800 : 2400 });
    }
    if (sec.drums) {
      if (s === 0 || s === 8 || (S.secName === 'B' && s === 10)) k.kick(t, b.drums, jit(0.9), { f0: 150, f1: 48, dec: 0.2 });
      if (s === 4 || s === 12) { k.snare(t, b.drums, jit(0.8), { tone: 200 }); k.clap(t, b.drums, jit(0.35)); }
      if (s % 2 === 0) k.hat(t, b.drums, jit(s % 4 === 2 ? 0.7 : 0.45), s === 14);
      else if (s === 15 || s === 7) k.hat(t, b.drums, jit(0.35), true);
      if (ACC332.has(s)) k.conga(t, b.drums, jit(s % 2 ? 0.5 : 0.7), s === 3 || s === 11 ? 260 : 330, s === 6 || s === 14);
      if (s === 0 || s === 6 || s === 8 || s === 14) k.cowbell(t, b.drums, jit(0.35));
      if (sec.perc && s % 2 === 1) k.clave(t, b.drums, jit(0.3));
      roll(S, 12, k, b.drums, (p) => k.snare(t, b.drums, 0.35 + 0.5 * p, { tone: 215 }));
    }
    if (sec.bass) {
      const r = chord.r;
      const bp = { 0: [r, 3], 3: [r, 2], 6: [r + 7, 2], 8: [r, 3], 11: [r + 12, 2], 14: [approach(chord, S.next), 2] }[s];
      if (bp) k.bass(t, b.bass, { f: mtof(bp[0]), dur: bp[1] * sd, v: jit(s === 0 ? 1 : 0.8), tone: 1.3 });
    }
    if (sec.horns && (((bar % 2 === 0) && (s === 0 || s === 3 || s === 6)) || ((bar % 2 === 1) && s === 8))) {
      for (const m of triad(chord, 36)) k.brass(t, b.harm, { f: mtof(m), dur: sd * (s === 8 ? 3 : 1.8), v: jit(0.85) });
    }
    phraseAt(S, sec.mel && sec.mel[bar], (n, len) => k.lead(t, b.lead, { f: mtof(pitchOf(n, 67, MAJ)), dur: len * sd * 0.9, v: jit(0.9), type: 'sawtooth', cutoff: 3000, vib: 9 }));
  },
};

// =========================================================================================== TALK (traffic-news bed)
const TC = C(36, 'M7'), TAm = C(33, 'm7'), TDm = C(38, 'm7'), TG = C(43, '7');
const TALK = {
  bpm: 90, swing: 0.12, level: 0.55,
  mix: { drums: 0.6, bass: 0.8, harm: 0.7, lead: 0.5, fx: 0.5 },
  sections: { bed: { bars: 4, chords: [TC, TAm, TDm, TG] } },
  order: ['bed'],
  play(S) {
    const { t, step: s, k, b, chord } = S;
    const sd = S.stepDur;
    if (s === 0) for (const m of triad(chord, 36)) k.epiano(t, b.harm, { f: mtof(m), dur: sd * 6, v: 0.6 });
    if (s === 6 || s === 10) for (const m of triad(chord, 36).slice(1)) k.epiano(t, b.harm, { f: mtof(m), dur: sd * 3, v: 0.4 });
    if (s === 0 || s === 10) k.bass(t, b.bass, { f: mtof(chord.r), dur: sd * 4, v: 0.7, tone: 0.7 });
    if (s === 8) k.bass(t, b.bass, { f: mtof(chord.r + 7), dur: sd * 3, v: 0.55, tone: 0.7 });
    if (s % 4 === 0) k.hat(t, b.drums, jit(s % 8 ? 0.3 : 0.45));
    if (s === 4 || s === 12) k.rim(t, b.drums, jit(0.3));
    if (s === 0 && S.bar === 0) k.kick(t, b.drums, 0.4, { f0: 110, f1: 50, dec: 0.2, click: 0.05 });
  },
};

export const SONGS = { cumbia: CUMBIA, vallenato: VALLENATO, reggaeton: REGGAETON, champeta: CHAMPETA, talk: TALK };

// =========================================================================================== JINGLES (station stings)
export const JINGLES = {
  cumbia(k, t, out) {
    k.guacharaca(t, out, 1); k.guacharaca(t + 0.08, out, 0.8, true);
    [76, 79, 81, 84].forEach((m, i) => k.flute(t + 0.1 + i * 0.1, out, { f: mtof(m), dur: i === 3 ? 0.5 : 0.1, v: 0.9 }));
    k.drum(t + 0.1, out, 0.9, { f0: 135, f1: 68, dec: 0.25 }); k.conga(t + 0.5, out, 0.7, 330, true); k.conga(t + 0.62, out, 0.6, 260);
  },
  vallenato(k, t, out) {
    [72, 76, 79, 84, 83, 81, 79].forEach((m, i) => k.accordion(t + i * 0.07, out, { f: mtof(m), dur: i === 6 ? 0.5 : 0.07, v: 0.9 }));
    k.drum(t, out, 0.9, { f0: 150, f1: 78 }); k.drum(t + 0.55, out, 0.8, { f0: 260, f1: 190, dec: 0.1, noise: 0.2, slap: true });
  },
  reggaeton(k, t, out) {
    k.riser(t, out, 0.4, 0.8); k.boom(t + 0.4, out, 0.9, 0.7);
    k.vox(t + 0.42, out, { f: mtof(57), dur: 0.2, v: 0.9, vowel: 'e' }); k.vox(t + 0.7, out, { f: mtof(64), dur: 0.25, v: 0.9, vowel: 'a' });
    k.snare(t + 0.4, out, 0.8); k.clap(t + 0.4, out, 0.6);
  },
  champeta(k, t, out) {
    k.zap(t, out, 1, 3600, 200, 0.3); k.zap(t + 0.12, out, 0.7, 2600, 300, 0.25);
    [67, 71, 74].forEach((m) => k.brass(t + 0.35, out, { f: mtof(m + 12), dur: 0.3, v: 1 }));
    k.conga(t + 0.35, out, 0.8, 330, true); k.conga(t + 0.5, out, 0.7, 260); k.cowbell(t + 0.35, out, 0.7);
  },
  talk(k, t, out) {
    [67, 71, 74, 79].forEach((m, i) => k.epiano(t + i * 0.09, out, { f: mtof(m), dur: 0.25, v: 1 }));
    k.brass(t + 0.4, out, { f: mtof(67), dur: 0.2, v: 0.8 }); k.hat(t + 0.4, out, 0.8);
    for (let i = 0; i < 5; i++) k.clave(t + 0.62 + i * 0.045, out, 0.35);
  },
};
