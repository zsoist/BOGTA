import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EZ, FONT } from '../theme';
import { ramp } from '../lib/anim';

type Lang = 'js' | 'md';

const KW = /^(export|const|let|var|function|class|return|import|from|new|if|else|async|await|of|in)$/;
const tokenize = (line: string, lang: Lang): { t: string; c: string }[] => {
  if (lang === 'md') {
    if (/^\s*#/.test(line)) return [{ t: line, c: C.gold }];
    const out: { t: string; c: string }[] = [];
    line.split(/(`[^`]+`|\*\*[^*]+\*\*)/).forEach((s) => {
      if (!s) return;
      if (s.startsWith('`')) out.push({ t: s, c: '#7EE0A0' });
      else if (s.startsWith('**')) out.push({ t: s, c: '#fff' });
      else out.push({ t: s, c: '#B9BCD0' });
    });
    return out;
  }
  const out: { t: string; c: string }[] = [];
  const re = /(\/\/.*$)|('[^']*'|"[^"]*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ t: m[1], c: '#6B7089' });
    else if (m[2]) out.push({ t: m[2], c: '#F5C518' });
    else if (m[3]) out.push({ t: m[3], c: '#FF9B5E' });
    else if (m[4]) out.push({ t: m[4], c: KW.test(m[4]) ? '#C792EA' : /^[A-Z_]{3,}$/.test(m[4]) ? '#6FD36F' : '#D6D9EC' });
    else out.push({ t: m[0], c: '#9AA0BE' });
  }
  return out;
};

interface Props {
  code: string;
  file: string;
  lang?: Lang;
  /** local frame to start typing */
  at: number;
  /** characters typed per frame (60 fps basis) */
  cps?: number;
  width: number;
  fontSize?: number;
  /** colour of the file tab accent */
  accent?: string;
  /** line count shown at most (older lines scroll up) */
  maxLines?: number;
  badge?: string;
}

/** Editor window that types REAL code (inlined from the repo) with syntax colours and a beat-blinking cursor. */
export const CodeTyper: React.FC<Props> = ({ code, file, lang = 'js', at, cps = 1.4, width, fontSize = 22, accent = C.green, maxLines = 11, badge }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.floor((frame - at) * cps * (60 / fps)));
  const shown = code.slice(0, n);
  const lines = shown.split('\n');
  const allLines = code.split('\n');
  const done = n >= code.length;
  const startLine = Math.max(0, lines.length - maxLines);
  const vis = lines.slice(startLine);
  const appear = ramp(frame, [at - 10, at + 6], [0, 1], EZ.out);
  const cursorOn = Math.floor(frame / (fps / 4)) % 2 === 0 || !done;
  const lh = fontSize * 1.55;

  return (
    <div
      style={{
        width,
        opacity: appear,
        transform: `translateY(${(1 - appear) * 30}px)`,
        background: 'linear-gradient(180deg, rgba(20,20,28,0.96), rgba(12,12,18,0.96))',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 14,
        boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        overflow: 'hidden',
        fontFamily: FONT.mono,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(255,255,255,0.035)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
          <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
        ))}
        <div style={{ marginLeft: 12, fontSize: fontSize * 0.68, color: '#C9CCE0', borderBottom: `2px solid ${accent}`, paddingBottom: 3 }}>{file}</div>
        <div style={{ flex: 1 }} />
        {badge && <div style={{ fontFamily: FONT.ui, fontSize: fontSize * 0.55, color: '#0B0B0F', background: accent, padding: '3px 9px', borderRadius: 20, fontWeight: 800, letterSpacing: 1 }}>{badge}</div>}
      </div>
      <div style={{ padding: '16px 0', minHeight: lh * Math.min(maxLines, allLines.length) + 32 }}>
        {vis.map((ln, i) => {
          const no = startLine + i + 1;
          const last = i === vis.length - 1;
          return (
            <div key={no} style={{ display: 'flex', height: lh, fontSize, lineHeight: `${lh}px`, whiteSpace: 'pre' }}>
              <div style={{ width: fontSize * 2.6, textAlign: 'right', paddingRight: 16, color: '#4A4E66', flexShrink: 0 }}>{no}</div>
              <div>
                {tokenize(ln, lang).map((tk, j) => (
                  <span key={j} style={{ color: tk.c }}>
                    {tk.t}
                  </span>
                ))}
                {last && cursorOn && <span style={{ display: 'inline-block', width: fontSize * 0.55, height: fontSize * 1.1, marginLeft: 2, background: accent, verticalAlign: 'text-bottom' }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---- REAL snippets, inlined at build time from the repo (src/config.js, docs/CONTRACT.md) ----
export const SNIPPETS = {
  config: {
    file: 'src/config.js',
    lang: 'js' as Lang,
    code: `export const BLOCK = 64;          // distance between parallel road centerlines
export const COLS = 12;           // blocks along X
export const ROWS = 18;           // blocks along Z
export const CALLE_AVENUES = new Set([7, 14]); // Calle 72, Calle 26
export const START_HOUR = 14.5;   // llueve a las 3

export const RADIO_STATIONS = [
  { id: 'tropicombo', name: 'Tropicombo 98.7', genre: 'cumbia', bpm: 100 },
  { id: 'perreadera', name: 'La Perreadera FM', genre: 'reggaeton', bpm: 95 },
];`,
  },
  contract: {
    file: 'docs/CONTRACT.md',
    lang: 'md' as Lang,
    code: `# GTA Bogotá — Module Contract (READ FULLY BEFORE WRITING CODE)
- Heading convention: \`mesh.rotation.y = heading\`; models face **-Z**
- Only edit the files your task owns.
## World — \`src/world/city.js\`
export function createCity(scene, net) → { colliders, update(dt, world), group }`,
  },
  vehicle: {
    file: 'src/entities/vehicle.js',
    lang: 'js' as Lang,
    code: `export class Vehicle {
  constructor(scene, type, { x, z, heading = 0 })
  setControls({ throttle, steer, handbrake })
  update(dt, world)   // arcade physics + collisions
  damage(amount)      // emits 'vehicle:damaged'
}`,
  },
  police: {
    file: 'docs/CONTRACT.md',
    lang: 'md' as Lang,
    code: `- \`createPolice(scene, net)\` → \`{ update(dt, world) }\` — owns wanted level
- listens to \`'crime'\` (carjack +1, hit_ped +1, hit_police +2, ram +0.5)
- Busted: player stopped (speed < 1) within 6 m of police for 2 s → \`'player:busted'\``,
  },
};
