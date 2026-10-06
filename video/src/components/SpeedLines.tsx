import React, { useMemo } from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';

/** Radial speed lines for drift/chase beats (comic-book rush). */
export const SpeedLines: React.FC<{ intensity?: number; color?: string; seed?: string }> = ({ intensity = 1, color = '255,255,255', seed = 'sl' }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const n = Math.round(46 * intensity);
  const lines = useMemo(
    () => Array.from({ length: n }, (_, i) => ({ a: random(`${seed}a${i}`) * Math.PI * 2, r0: 0.28 + random(`${seed}r${i}`) * 0.22, len: 0.1 + random(`${seed}l${i}`) * 0.28, w: 1 + random(`${seed}w${i}`) * 3.5 })),
    [n, seed],
  );
  const cx = W / 2,
    cy = H / 2,
    R = Math.hypot(W, H) / 2;
  const f = Math.floor(frame / 2); // 30 Hz "on twos" for comic feel
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.55 * Math.min(1, intensity) }}>
      <svg width={W} height={H}>
        {lines.map((l, i) => {
          const jit = 1 + (random(`${seed}j${f}-${i}`) - 0.5) * 0.25;
          const r0 = l.r0 * R * jit;
          const r1 = r0 + l.len * R;
          return <line key={i} x1={cx + Math.cos(l.a) * r0} y1={cy + Math.sin(l.a) * r0} x2={cx + Math.cos(l.a) * r1} y2={cy + Math.sin(l.a) * r1} stroke={`rgba(${color},0.8)`} strokeWidth={l.w} strokeLinecap="round" />;
        })}
      </svg>
    </AbsoluteFill>
  );
};
