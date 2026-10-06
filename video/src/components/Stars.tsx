import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, SPR } from '../theme';
import { ramp } from '../lib/anim';
import { EZ } from '../theme';

const STAR = 'M50 4 L61 36 L95 36 L67 57 L78 90 L50 70 L22 90 L33 57 L5 36 L39 36 Z';

interface Props {
  /** local frames at which star 1..5 fill */
  fillAt: number[];
  size?: number;
  gap?: number;
  /** flash blink after the last fill (wanted stars blink in GTA) */
  blinkFrom?: number;
}

/** GTA wanted stars: fill one by one with pop + shockwave + flash; blink once full. */
export const Stars: React.FC<Props> = ({ fillAt, size = 130, gap = 14, blinkFrom }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blink = blinkFrom !== undefined && frame > blinkFrom ? (Math.floor((frame - blinkFrom) / (fps / 6)) % 2 === 0 ? 1 : 0.35) : 1;
  return (
    <div style={{ display: 'flex', gap, alignItems: 'center', opacity: blink }}>
      {Array.from({ length: 5 }, (_, i) => {
        const t = frame - (fillAt[i] ?? 1e9);
        const filled = t >= 0;
        const p = filled ? spring({ frame: t, fps, config: SPR.slam }) : 0;
        const sc = filled ? 0.35 + 0.65 * Math.min(p, 1.3) + (1 - Math.min(1, t / 8)) * 0.35 : 1;
        const ring = filled ? ramp(frame, [fillAt[i], fillAt[i] + 14], [0, 1], EZ.out) : 0;
        return (
          <div key={i} style={{ position: 'relative', width: size, height: size }}>
            {filled && ring < 1 && (
              <div style={{ position: 'absolute', inset: -size * 0.2 * ring, borderRadius: '50%', border: `${4 * (1 - ring)}px solid ${C.gold}`, opacity: 1 - ring, transform: `scale(${0.6 + ring * 1.2})` }} />
            )}
            <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: 'absolute', transform: `scale(${sc})`, overflow: 'visible', filter: filled ? `drop-shadow(0 0 ${14 + (1 - Math.min(1, t / 10)) * 30}px rgba(245,197,24,0.9))` : undefined }}>
              <path d={STAR} fill={filled ? C.gold : 'rgba(0,0,0,0.35)'} stroke={filled ? '#000' : 'rgba(245,197,24,0.45)'} strokeWidth={filled ? 5 : 3} strokeLinejoin="round" />
              {filled && <path d={STAR} fill="none" stroke="#fff" strokeOpacity={Math.max(0, 1 - t / 6)} strokeWidth={4} />}
            </svg>
          </div>
        );
      })}
    </div>
  );
};

/** Red/blue police flashers glowing from the screen edges, alternating on 8th notes. */
export const SirenGlow: React.FC<{ beatFrames: number; intensity?: number }> = ({ beatFrames, intensity = 1 }) => {
  const frame = useCurrentFrame();
  const ph = (frame / (beatFrames / 2)) % 2; // 8th-note alternate
  const phase = Math.floor(frame / (beatFrames / 4)) % 2;
  const fade = 0.55 + 0.45 * Math.abs(Math.sin(ph * Math.PI));
  const red = phase === 0;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', opacity: intensity * fade, zIndex: 40 }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 55% 85% at 0% 50%, ${red ? 'rgba(255,45,61,0.55)' : 'rgba(45,107,255,0.1)'}, transparent 70%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 55% 85% at 100% 50%, ${red ? 'rgba(45,107,255,0.1)' : 'rgba(45,107,255,0.55)'}, transparent 70%)` }} />
    </div>
  );
};
