import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { art } from '../lib/assets';
import { ramp } from '../lib/anim';
import { EZ } from '../theme';

export interface ParallaxLayer {
  src: string;
  /** 0 = far (barely moves) … 1 = near (moves + scales most) */
  depth: number;
  blur?: number;
  opacity?: number;
}

/** The three Codex layers (video/public/art/parallax-{bg,mid,fg}.png). Returns [] if any is missing. */
export const parallaxLayers = (): ParallaxLayer[] => {
  const bg = art('parallax-bg');
  const mid = art('parallax-mid');
  const fg = art('parallax-fg');
  if (!bg || !mid || !fg) return [];
  // mid + fg need alpha -> force .png when it exists
  return [
    { src: bg, depth: 0 },
    { src: art('parallax-mid')!, depth: 0.5 },
    { src: art('parallax-fg')!, depth: 1 },
  ];
};
export const hasParallax = () => parallaxLayers().length === 3;

interface Props {
  layers?: ParallaxLayer[];
  duration?: number;
  /** camera dolly: how far we push in (1 = none). Near layers scale by (1 + (zoom-1) * (0.4+depth*1.6)). */
  zoom?: number;
  /** lateral truck in % of width, near layers move `truck*depth*2.2` */
  truck?: number;
  /** vertical crane in % of height */
  crane?: number;
  mist?: boolean;
}

/** 2.5D parallax: 3 stacked layers with depth-scaled push-in + truck + crane + drifting mist. */
export const ParallaxScene: React.FC<Props> = ({ layers = parallaxLayers(), duration = 180, zoom = 1.18, truck = -3, crane = 0, mist = true }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, [0, duration], [0, 1], EZ.camera);
  return (
    <AbsoluteFill style={{ background: '#05060a', overflow: 'hidden' }}>
      {layers.map((l, i) => {
        const sc = 1.04 + (zoom - 1) * (0.35 + l.depth * 1.5) * p;
        const tx = truck * (0.3 + l.depth * 2.2) * p;
        const ty = crane * (0.3 + l.depth * 2.0) * p;
        return (
          <AbsoluteFill key={i} style={{ transform: `translate(${tx}%, ${ty}%) scale(${sc})`, transformOrigin: '50% 62%', opacity: l.opacity ?? 1, filter: l.blur ? `blur(${l.blur}px)` : undefined }}>
            <Img src={l.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </AbsoluteFill>
        );
      })}
      {mist && (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(0deg, rgba(150,170,190,0.0) 0%, rgba(150,170,190,0.12) 38%, rgba(150,170,190,0) 62%)',
            transform: `translateX(${-frame * 0.35}px)`,
            mixBlendMode: 'screen',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
