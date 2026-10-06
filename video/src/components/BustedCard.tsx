import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EZ, FONT, SPR } from '../theme';
import { ramp, shake } from '../lib/anim';
import { Letterbox } from './FilmFinish';

/**
 * "¡LO CAPTURARON!" — GTA busted card: scene desaturates + darkens, giant ice-white italic title drifts in slow,
 * money penalty ticks, thin letterbox slides in. Place it over the footage.
 */
export const BustedCard: React.FC<{ at?: number; text?: string; sub?: string; penalty?: string }> = ({
  at = 0,
  text = '¡LO CAPTURARON!',
  sub = 'LA POLICÍA TE ATRAPÓ, SUMERCÉ',
  penalty = '-$ 20.000',
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080) * (height > width ? 1.25 : 1);
  const t = frame - at;
  if (t < 0) return null;
  const grade = ramp(frame, [at, at + 12], [0, 1], EZ.out);
  const p = spring({ frame: t, fps, config: SPR.pop });
  const drift = ramp(frame, [at, at + 200], [1.0, 1.08], EZ.camera);
  const sh = shake(frame, at, 22 * u, 0.25, 9);
  return (
    <AbsoluteFill style={{ zIndex: 60 }}>
      <AbsoluteFill style={{ backdropFilter: `grayscale(${grade}) contrast(${1 + 0.12 * grade}) brightness(${1 - 0.28 * grade})`, background: `rgba(10,16,30,${0.35 * grade})` }} />
      <Letterbox amount={ramp(frame, [at, at + 20], [0, 0.5], EZ.out)} />
      <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', transform: `translate(${sh.x}px, ${sh.y}px) scale(${drift})` }}>
        <div
          style={{
            fontFamily: FONT.title,
            fontSize: 250 * u,
            letterSpacing: 10 * u,
            transform: `scale(${1.5 - 0.5 * Math.min(p, 1.1)}) skewX(-8deg)`,
            opacity: Math.min(1, t / 4),
            background: 'linear-gradient(180deg, #ffffff 0%, #cfe6ff 55%, #7fb2f0 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: `drop-shadow(0 ${6 * u}px 0 #0a1630) drop-shadow(0 0 ${28 * u}px rgba(120,180,255,0.65))`,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
        <div style={{ marginTop: 10 * u, display: 'flex', gap: 40 * u, alignItems: 'center', opacity: ramp(frame, [at + 14, at + 26], [0, 1], EZ.out), transform: `translateY(${(1 - ramp(frame, [at + 14, at + 30], [0, 1], EZ.out)) * 20 * u}px)` }}>
          <span style={{ fontFamily: FONT.title, fontSize: 56 * u, letterSpacing: 6 * u, color: '#cfe6ff' }}>{sub}</span>
          <span style={{ fontFamily: FONT.slam, fontSize: 64 * u, color: C.green, WebkitTextStroke: `${4 * u}px #000`, paintOrder: 'stroke fill' }}>{penalty}</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
