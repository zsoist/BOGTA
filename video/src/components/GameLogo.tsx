import React from 'react';
import { Img, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { has } from '../lib/assets';
import { staticFile } from 'remotion';
import { ramp } from '../lib/anim';
import { C, EZ, FONT, SPR } from '../theme';

const LOGO = has('ui/logo.png') ? staticFile('ui/logo.png') : undefined; // Codex logo with alpha (1204x655)

interface Props {
  /** local frame of the slam */
  at?: number;
  /** width in px at design size */
  width?: number;
  /** glitch intensity 0..1 over the first frames */
  glitch?: number;
  /** keep floating after landing */
  idle?: boolean;
}

/**
 * GTA BOGOTÁ logo: slams from 3x with an RGB-split + horizontal slice glitch, then settles with a slow float.
 * Uses the Codex logo (ui/logo.png) when present; typographic fallback otherwise.
 */
export const GameLogo: React.FC<Props> = ({ at = 0, width: w = 980, glitch = 1, idle = true }) => {
  const frame = useCurrentFrame();
  const { fps, width: cw, height: ch } = useVideoConfig();
  const u = Math.min(cw / 1920, ch / 1080) * (ch > cw ? 1.5 : 1);
  const t = frame - at;
  if (t < 0) return null;
  const p = spring({ frame: t, fps, config: SPR.slam });
  const sc = 3 - 2 * Math.min(p, 1.12);
  const blur = ramp(frame, [at, at + 10], [30, 0], EZ.out);
  const g = glitch * Math.exp(-t * 0.12);
  const float = idle ? Math.sin(t * 0.04) * 6 * u : 0;
  const width = w * u;
  const logoH = width * (655 / 1204);

  const logo = (style: React.CSSProperties) =>
    LOGO ? (
      <Img src={LOGO} style={{ width, height: logoH, display: 'block', ...style }} />
    ) : (
      <div style={{ width, textAlign: 'center', fontFamily: FONT.logo, ...style }}>
        <div style={{ fontSize: width * 0.34, lineHeight: 0.9, color: '#fff', WebkitTextStroke: `${width * 0.02}px #000`, paintOrder: 'stroke fill' }}>GTA</div>
        <div style={{ fontSize: width * 0.25, lineHeight: 0.95, color: C.gold, WebkitTextStroke: `${width * 0.018}px #000`, paintOrder: 'stroke fill' }}>BOGOTÁ</div>
      </div>
    );

  const slices = 6;
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) translateY(${float}px) scale(${sc})`, filter: `blur(${blur * u}px) drop-shadow(0 ${20 * u}px ${40 * u}px rgba(0,0,0,0.65))`, opacity: Math.min(1, t / 2) }}>
      {g > 0.04 && (
        <>
          {logo({ position: 'absolute', left: 0, top: 0, transform: `translateX(${-g * 40 * u}px)`, opacity: 0.8, filter: 'sepia(1) saturate(8) hue-rotate(-50deg)', mixBlendMode: 'screen' })}
          {logo({ position: 'absolute', left: 0, top: 0, transform: `translateX(${g * 40 * u}px)`, opacity: 0.8, filter: 'sepia(1) saturate(8) hue-rotate(150deg)', mixBlendMode: 'screen' })}
        </>
      )}
      <div style={{ position: 'relative' }}>
        {Array.from({ length: g > 0.04 ? slices : 1 }, (_, i) => {
          const off = g > 0.04 ? (random(`gl-${Math.floor(t / 2)}-${i}`) - 0.5) * 120 * g * u : 0;
          const y0 = (i / slices) * 100,
            y1 = ((i + 1) / slices) * 100;
          return (
            <div
              key={i}
              style={{
                position: i === 0 ? 'relative' : 'absolute',
                left: 0,
                top: 0,
                transform: `translateX(${off}px)`,
                clipPath: g > 0.04 ? `polygon(0 ${y0}%, 100% ${y0}%, 100% ${y1}%, 0 ${y1}%)` : undefined,
              }}
            >
              {logo({})}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Anamorphic lens flare that sweeps across the logo. */
export const LensFlare: React.FC<{ at: number; duration?: number; y?: number }> = ({ at, duration = 50, y = 0.5 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = ramp(frame, [at, at + duration], [0, 1], EZ.soft);
  if (frame < at || frame > at + duration + 10) return null;
  const x = -0.2 + 1.4 * p;
  const a = Math.sin(Math.PI * Math.min(1, p)) ;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', opacity: a, zIndex: 60 }}>
      <div style={{ position: 'absolute', left: x * width - width * 0.4, top: y * height - 3, width: width * 0.8, height: 6, background: 'linear-gradient(90deg, transparent, rgba(120,200,255,0.9) 40%, #fff 50%, rgba(255,180,90,0.9) 60%, transparent)', filter: 'blur(1.5px)' }} />
      <div style={{ position: 'absolute', left: x * width - 140, top: y * height - 140, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, rgba(255,230,160,0.55) 18%, rgba(255,160,60,0) 62%)' }} />
      {[0.55, 0.8, 1.15].map((k, i) => (
        <div key={i} style={{ position: 'absolute', left: (1 - x) * width * k * 0.9 + width * 0.05 * i, top: y * height + (i - 1) * 40, width: 40 + i * 30, height: 40 + i * 30, borderRadius: '50%', border: `2px solid rgba(${i === 1 ? '120,220,255' : '255,200,120'},0.5)`, background: `radial-gradient(circle, rgba(${i === 1 ? '120,220,255' : '255,200,120'},0.18), transparent 70%)` }} />
      ))}
    </div>
  );
};
