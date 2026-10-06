import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, EZ, FONT, SPR } from '../theme';
import { ramp } from '../lib/anim';

interface Props {
  value: number;
  label: string;
  /** local frame where the roll-up starts */
  at: number;
  /** frames to roll */
  duration?: number;
  prefix?: string;
  suffix?: string;
  color?: string;
  size?: number;
  sub?: string;
  /** locale thousands separators */
  locale?: string;
  decimals?: number;
}

/** Number roll-up: fast start, long settle, pop + glow when it lands. */
export const Counter: React.FC<Props> = ({ value, label, at, duration = 70, prefix = '', suffix = '', color = C.gold, size = 96, sub, locale = 'es-CO', decimals = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = ramp(frame, [at, at + duration], [0, 1], EZ.out);
  const shown = decimals ? value * p : Math.round(value * p);
  const landT = frame - (at + duration * 0.85);
  const pop = landT >= 0 ? spring({ frame: landT, fps, config: SPR.pop }) : 0;
  const appear = ramp(frame, [at - 8, at + 4], [0, 1], EZ.out);
  const glow = landT >= 0 ? Math.exp(-landT * 0.07) : 0;
  return (
    <div style={{ opacity: appear, transform: `translateY(${(1 - appear) * 24}px)`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: size * 0.04 }}>
      <div style={{ fontFamily: FONT.title, fontSize: size * 0.34, letterSpacing: size * 0.04, color: C.mute, textTransform: 'uppercase' }}>{label}</div>
      <div
        style={{
          fontFamily: FONT.ui,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          fontSize: size,
          lineHeight: 1,
          color,
          transform: `scale(${1 + 0.1 * (landT >= 0 ? Math.sin(Math.min(pop, 1) * Math.PI) : 0)})`,
          transformOrigin: 'left center',
          textShadow: `0 0 ${24 + glow * 50}px ${color}${Math.round((0.25 + glow * 0.5) * 255).toString(16).padStart(2, '0')}`,
          letterSpacing: -size * 0.02,
        }}
      >
        {prefix}
        {shown.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        <span style={{ fontSize: size * 0.5, marginLeft: size * 0.08, color: C.white, opacity: 0.85 }}>{suffix}</span>
      </div>
      {sub && <div style={{ fontFamily: FONT.ui, fontSize: size * 0.17, color: C.mute, letterSpacing: 1 }}>{sub}</div>}
      <div style={{ height: 3, width: `${p * 100}%`, maxWidth: size * 3.2, background: `linear-gradient(90deg, ${color}, transparent)`, borderRadius: 2 }} />
    </div>
  );
};
