import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, random } from 'remotion';
import { noise2D } from '@remotion/noise';
import { flash } from '../lib/anim';

// ---- procedural film grain tile (generated once with @remotion/noise, then jittered per frame) ----
let grainUrl: string | null = null;
const getGrainTile = () => {
  if (grainUrl) return grainUrl;
  if (typeof document === 'undefined') return '';
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fine = noise2D('grain-a', x * 0.9, y * 0.9);
      const coarse = noise2D('grain-b', x * 0.18, y * 0.18);
      const w = (random(`g${x}-${y}`) - 0.5) * 1.1;
      const v = 128 + (fine * 0.55 + coarse * 0.25 + w * 0.6) * 90;
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  grainUrl = c.toDataURL('image/png');
  return grainUrl;
};

export interface FilmFinishProps {
  children: React.ReactNode;
  /** base chromatic aberration in px (0 disables the filter) */
  aberration?: number;
  /** frames (of this composition) where a hit spikes the aberration */
  impacts?: number[];
  grain?: number; // 0..1 opacity
  vignette?: number; // 0..1
  /** letterbox 0..1 (1 = full 2.39:1) */
  letterbox?: number;
}

/** Grain + vignette + subtle chromatic aberration (+ optional 2.39 letterbox). Wrap the whole trailer. */
export const FilmFinish: React.FC<FilmFinishProps> = ({ children, aberration = 1.1, impacts = [], grain = 0.16, vignette = 0.55, letterbox = 0 }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const spike = flash(frame, impacts, 0.3);
  const d = aberration + spike * 5;
  const jitterFrame = Math.floor((frame * 30) / fps); // grain refreshes at 30 Hz like film-ish
  const gx = Math.floor(random(`gx${jitterFrame}`) * 256);
  const gy = Math.floor(random(`gy${jitterFrame}`) * 256);
  const tile = getGrainTile();
  const barH = letterbox > 0 ? Math.max(0, (height - width / 2.39) / 2) * letterbox : 0;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id="film-ca" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feOffset in="r" dx={d} dy={d * 0.15} result="r2" />
            <feOffset in="b" dx={-d} dy={-d * 0.15} result="b2" />
            <feBlend in="r2" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="b2" mode="screen" />
          </filter>
        </defs>
      </svg>
      <AbsoluteFill style={{ filter: d > 0.25 ? 'url(#film-ca)' : undefined }}>{children}</AbsoluteFill>
      {barH > 0.5 && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barH, background: '#000' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: barH, background: '#000' }} />
        </>
      )}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${vignette}) 100%)`,
          pointerEvents: 'none',
        }}
      />
      {tile && (
        <AbsoluteFill
          style={{
            backgroundImage: `url(${tile})`,
            backgroundSize: '384px 384px',
            backgroundPosition: `${gx}px ${gy}px`,
            mixBlendMode: 'overlay',
            opacity: grain,
            pointerEvents: 'none',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** Animated 2.39:1 letterbox for individual scenes. `amount` 0..1. */
export const Letterbox: React.FC<{ amount?: number }> = ({ amount = 1 }) => {
  const { width, height } = useVideoConfig();
  const h = Math.max(0, (height - width / 2.39) / 2) * amount;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h, background: '#000', zIndex: 50 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#000', zIndex: 50 }} />
    </>
  );
};
