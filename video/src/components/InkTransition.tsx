import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { getLength } from '@remotion/paths';
import { ramp } from '../lib/anim';
import { C, EZ } from '../theme';

interface Props {
  /** first frame of the wipe (local to the enclosing Sequence) */
  start: number;
  /** total frames (cover + uncover). The scene cut should hide at start + duration/2 */
  duration: number;
  /** sweep direction */
  dir?: 'lr' | 'rl' | 'tb' | 'bt';
  /** colour layers, leading edge first. Last = main ink. Colombian flag only here. */
  colors?: string[];
  seed?: number;
}

const FLAG = [C.flagY, C.flagB, C.flagR, C.ink];

/**
 * Brush-stroke wipe. Fat SVG strokes are drawn along wavy paths (stroke-dash = @remotion/paths length),
 * masked + roughened with fractal-noise displacement so the edge looks dry-brushed. Flag-coloured strokes lead
 * the black ink in and trail it out; the cut happens under full coverage at the midpoint.
 */
export const InkTransition: React.FC<Props> = ({ start, duration, dir = 'lr', colors = FLAG, seed = 3 }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = (frame - start) / duration;
  const vertical = dir === 'tb' || dir === 'bt';
  const rows = 4;
  const A = vertical ? H : W; // along-axis length
  const B = vertical ? W : H; // cross-axis length
  const thick = (B / rows) * 1.45;

  const paths = useMemo(
    () =>
      Array.from({ length: rows }, (_, i) => {
        const c = (B / rows) * (i + 0.5);
        const wob = ((i % 2) * 2 - 1) * B * 0.045;
        const a0 = -A * 0.2;
        const a1 = A * 1.2;
        const d = `M ${a0} ${c} C ${A * 0.3} ${c - wob}, ${A * 0.62} ${c + wob}, ${a1} ${c + wob * 0.4}`;
        const L = getLength(d);
        // orient into screen coordinates
        const dd = vertical ? `M ${c} ${a0} C ${c - wob} ${A * 0.3}, ${c + wob} ${A * 0.62}, ${c + wob * 0.4} ${a1}` : d;
        return { d: dd, L };
      }),
    [A, B, vertical],
  );

  if (u <= 0 || u >= 1) return null;
  const flip = dir === 'rl' || dir === 'bt';
  const n = colors.length;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 90, transform: flip ? (vertical ? 'scaleY(-1)' : 'scaleX(-1)') : undefined }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id={`ink-rough-${seed}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency={vertical ? '0.05 0.012' : '0.012 0.05'} numOctaves={3} seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={W * 0.045} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter={`url(#ink-rough-${seed})`}>
          {colors.map((col, j) =>
            paths.map((p, i) => {
              const rowDelay = i * 0.025;
              const cover = ramp(u, [j * 0.07 + rowDelay, j * 0.07 + rowDelay + 0.27], [0, 1], EZ.inOut);
              const tail = ramp(u, [0.54 + (n - 1 - j) * 0.07 + rowDelay, 0.54 + (n - 1 - j) * 0.07 + rowDelay + 0.27], [0, 1], EZ.inOut);
              const vis = Math.max(0, cover - tail) * p.L;
              if (vis <= 0.5) return null;
              return (
                <path
                  key={`${j}-${i}`}
                  d={p.d}
                  fill="none"
                  stroke={col}
                  strokeWidth={thick}
                  strokeLinecap="round"
                  strokeDasharray={`${vis} ${p.L * 3}`}
                  strokeDashoffset={-tail * p.L}
                />
              );
            }),
          )}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
