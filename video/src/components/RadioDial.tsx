import React from 'react';
import { Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { noise2D } from '@remotion/noise';
import { has } from '../lib/assets';
import { C, EZ, FONT, SPR } from '../theme';
import { ramp } from '../lib/anim';

// Station names + genres come straight from src/config.js (RADIO_STATIONS).
export const STATIONS = [
  { id: 'tropicombo', name: 'TROPICOMBO 98.7', short: 'TC', genre: 'CUMBIA', color: '#FFB300' },
  { id: 'acordeon', name: 'EL ACORDEÓN LLORÓN', short: 'AL', genre: 'VALLENATO', color: '#F0503E' },
  { id: 'perreadera', name: 'LA PERREADERA FM', short: 'PF', genre: 'REGGAETÓN', color: '#FF3DAE' },
  { id: 'champeta', name: 'CHAMPETA PICÓ RADIO', short: 'CP', genre: 'CHAMPETA', color: '#2BD9C5' },
  { id: 'trancon', name: 'TRANCÓN AL AIRE', short: 'TA', genre: 'NOTICIAS DE TRÁFICO', color: '#6FA8FF' },
] as const;

interface Props {
  /** local frame when the wheel appears */
  at: number;
  /** frames each station stays selected */
  step: number;
  size: number;
  /** pulse (0..1) on each beat for the equalizer rim */
  beatFrames: number;
}

/** GTA radio wheel: 5 stations around a ring; the ring spins so the tuned station sits on top, rim = live EQ. */
export const RadioDial: React.FC<Props> = ({ at, step, size, beatFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = STATIONS.length;
  const t = Math.max(0, frame - at);
  const idx = Math.min(n - 1, Math.floor(t / step));
  // eased rotation between selections
  const local = t - idx * step;
  const sp = spring({ frame: local, fps, config: SPR.heavy });
  const prevIdx = Math.max(0, idx - 1);
  const rot = idx === 0 ? 0 : -((prevIdx + (idx - prevIdx) * Math.min(1.08, sp)) * (360 / n)); // degrees
  const appear = ramp(frame, [at, at + 20], [0, 1], EZ.out);
  const R = size * 0.34;
  const cx = size / 2;
  const cy = size / 2;
  const sel = STATIONS[idx];
  const ticks = 120;
  const pulse = Math.exp(-((frame / beatFrames) % 1) * 5);

  return (
    <div style={{ position: 'relative', width: size, height: size, opacity: appear, transform: `scale(${0.85 + 0.15 * appear})` }}>
      {/* glow */}
      <div style={{ position: 'absolute', inset: size * 0.08, borderRadius: '50%', background: `radial-gradient(circle, ${sel.color}33, transparent 66%)`, filter: 'blur(20px)' }} />
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        {/* equalizer rim */}
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
          const h = (noise2D('eq', i * 0.35, frame * 0.12) * 0.5 + 0.5) * (0.5 + pulse * 0.9) * size * 0.07 + size * 0.012;
          const r0 = size * 0.465;
          return <line key={i} x1={cx + Math.cos(a) * r0} y1={cy + Math.sin(a) * r0} x2={cx + Math.cos(a) * (r0 + h)} y2={cy + Math.sin(a) * (r0 + h)} stroke={sel.color} strokeWidth={size * 0.006} strokeLinecap="round" opacity={0.85} />;
        })}
        <circle cx={cx} cy={cy} r={R + size * 0.1} fill="rgba(8,8,12,0.78)" stroke="rgba(255,255,255,0.12)" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={size * 0.19} fill="rgba(0,0,0,0.5)" stroke={sel.color} strokeWidth={3} opacity={0.9} />
        {/* pointer */}
        <polygon points={`${cx},${cy - R - size * 0.115} ${cx - size * 0.022},${cy - R - size * 0.155} ${cx + size * 0.022},${cy - R - size * 0.155}`} fill={C.gold} />
      </svg>
      {/* ring of stations */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: `rotate(${rot}deg)` }}>
        {STATIONS.map((s, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const isSel = i === idx;
          const d = size * (isSel ? 0.21 : 0.155);
          const logo = has(`radio/${s.id}.png`);
          return (
            <div
              key={s.id}
              style={{
                position: 'absolute',
                left: cx + Math.cos(a) * R - d / 2,
                top: cy + Math.sin(a) * R - d / 2,
                width: d,
                height: d,
                transform: `rotate(${-rot}deg) scale(${isSel ? 1 : 0.9})`,
                borderRadius: '50%',
                overflow: 'hidden',
                border: `${size * (isSel ? 0.008 : 0.004)}px solid ${isSel ? s.color : 'rgba(255,255,255,0.25)'}`,
                boxShadow: isSel ? `0 0 ${size * 0.05}px ${s.color}` : 'none',
                opacity: isSel ? 1 : 0.55,
                background: s.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {logo ? <Img src={staticFile(`radio/${s.id}.png`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: FONT.slam, fontSize: d * 0.42, color: '#0B0B0F' }}>{s.short}</span>}
            </div>
          );
        })}
      </div>
      {/* centre readout */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontFamily: FONT.ui, fontSize: size * 0.022, letterSpacing: size * 0.006, color: C.mute, fontWeight: 600 }}>AHORA SUENA</div>
        <div key={idx} style={{ fontFamily: FONT.title, fontSize: size * 0.058, lineHeight: 1, color: sel.color, margin: `${size * 0.01}px 0`, width: size * 0.34, transform: `scale(${1 + 0.18 * Math.exp(-local * 0.25)})`, textShadow: `0 0 ${size * 0.03}px ${sel.color}88` }}>{sel.name}</div>
        <div style={{ fontFamily: FONT.ui, fontSize: size * 0.02, letterSpacing: size * 0.005, color: C.white, fontWeight: 600 }}>{sel.genre}</div>
      </div>
    </div>
  );
};
