import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ramp, shake } from '../lib/anim';
import { C, EZ, FONT, SPR } from '../theme';

export interface KWord {
  text: string;
  color?: string;
  /** relative size multiplier */
  scale?: number;
  /** frame (local) when this word slams. Default: start + index * stagger */
  at?: number;
  /** extra rotation (deg) */
  rot?: number;
  font?: 'slam' | 'title' | 'logo';
  /** fill gradient instead of flat colour */
  gradient?: [string, string];
}

interface Props {
  words: KWord[];
  /** local frame where the first word slams */
  start?: number;
  /** frames between words */
  stagger?: number;
  /** base font size in px (at 1920 wide the design reference) */
  size?: number;
  /** 'stack' = one word per line, 'inline' = same baseline with wrapping */
  layout?: 'stack' | 'inline';
  align?: 'center' | 'left' | 'right';
  /** frame (local) at which the whole block flies out. undefined = stays */
  exitAt?: number;
  exitDuration?: number;
  /** screen shake amplitude in px at each impact */
  shakeAmp?: number;
  /** outline colour (black comic outline) */
  outline?: string;
  outlineWidth?: number;
  /** skew angle (deg) the words land at */
  skew?: number;
  letterSpacing?: number;
  lineHeight?: number;
  style?: React.CSSProperties;
}

const fontOf = (f?: KWord['font']) => (f === 'title' ? FONT.title : f === 'logo' ? FONT.logo : FONT.slam);

/**
 * Word-by-word slam: each word scales down from 2.8x with blur, skew, an RGB-split echo and a screen-shake hit.
 */
export const KineticText: React.FC<Props> = ({
  words,
  start = 0,
  stagger = 14,
  size = 220,
  layout = 'stack',
  align = 'center',
  exitAt,
  exitDuration = 12,
  shakeAmp = 14,
  outline = '#000',
  outlineWidth = 10,
  skew = -8,
  letterSpacing = 2,
  lineHeight = 0.92,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080) * (height > width ? 1.45 : 1);

  const hits = words.map((w, i) => w.at ?? start + i * stagger);
  let sx = 0,
    sy = 0,
    sr = 0;
  hits.forEach((h, i) => {
    const s = shake(frame, h, shakeAmp * u, 0.22, i + 1);
    sx += s.x;
    sy += s.y;
    sr += s.r;
  });

  const exit = exitAt === undefined ? 0 : ramp(frame, [exitAt, exitAt + exitDuration], [0, 1], EZ.in);
  const justify = align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end';

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: layout === 'stack' ? 'column' : 'row',
        flexWrap: layout === 'inline' ? 'wrap' : 'nowrap',
        justifyContent: 'center',
        alignItems: layout === 'stack' ? justify : 'center',
        alignContent: 'center',
        gap: layout === 'inline' ? `${size * u * 0.06}px ${size * u * 0.22}px` : 0,
        transform: `translate(${sx - exit * width * 0.25}px, ${sy}px) rotate(${sr}deg)`,
        opacity: 1 - exit,
        filter: exit > 0 ? `blur(${exit * 24}px)` : undefined,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const h = hits[i];
        const t = frame - h;
        const p = spring({ frame: t, fps, config: SPR.slam });
        const vis = t >= 0 ? 1 : 0;
        const appear = ramp(frame, [h, h + 3], [0, 1], EZ.out);
        const sc = (w.scale ?? 1) * (2.7 - 1.7 * Math.min(p, 1.35)) * (1 + 0.02 * Math.sin(Math.max(0, t) * 0.12) * Math.exp(-t * 0.05));
        const blur = ramp(frame, [h, h + 9], [26, 0], EZ.out) * u;
        const sk = skew + ramp(frame, [h, h + 10], [-16, 0], EZ.out);
        const fs = size * u * (w.scale ?? 1);
        const fill: React.CSSProperties = w.gradient
          ? { background: `linear-gradient(180deg, ${w.gradient[0]}, ${w.gradient[1]})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
          : { color: w.color ?? '#fff' };
        const base: React.CSSProperties = {
          fontFamily: fontOf(w.font),
          fontSize: fs,
          lineHeight,
          letterSpacing,
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
        };
        const echo = ramp(frame, [h, h + 8], [1, 0], EZ.out);
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              opacity: vis * appear,
              transform: `rotate(${w.rot ?? 0}deg) skewX(${sk}deg) scale(${sc / (w.scale ?? 1)})`,
              filter: `blur(${blur}px)`,
              willChange: 'transform',
            }}
          >
            {/* RGB-split echo on impact */}
            {echo > 0.02 && (
              <>
                <div style={{ ...base, position: 'absolute', inset: 0, color: C.flagR, opacity: echo * 0.7, transform: `translate(${-14 * echo * u}px, ${4 * echo * u}px)`, mixBlendMode: 'screen' }}>{w.text}</div>
                <div style={{ ...base, position: 'absolute', inset: 0, color: '#2fe6ff', opacity: echo * 0.7, transform: `translate(${14 * echo * u}px, ${-4 * echo * u}px)`, mixBlendMode: 'screen' }}>{w.text}</div>
              </>
            )}
            {/* hard comic shadow */}
            <div style={{ ...base, position: 'absolute', inset: 0, color: '#000', transform: `translate(${10 * u}px, ${12 * u}px)`, WebkitTextStroke: `${(outlineWidth + 6) * u}px #000` }}>{w.text}</div>
            <div style={{ ...base, ...fill, WebkitTextStroke: w.gradient ? undefined : `${outlineWidth * u}px ${outline}`, paintOrder: 'stroke fill', position: 'relative' }}>
              {w.text}
              {w.gradient && (
                <span style={{ position: 'absolute', left: 0, top: 0, color: 'transparent', WebkitTextStroke: `${outlineWidth * u}px ${outline}`, zIndex: -1 }}>{w.text}</span>
              )}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
