import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { noise2D } from '@remotion/noise';
import type { CamState } from '../footage';
import { ramp } from '../lib/anim';
import { EZ } from '../theme';
import { COVER_CROPS, COVER_SIZE, type CoverCrop } from '../lib/assets';

export interface KenBurnsProps {
  src: string;
  /** crop a region (pixels) out of a larger image, e.g. one panel of the cover */
  crop?: CoverCrop;
  from?: CamState;
  to?: CamState;
  /** shot length in frames (defaults to the Sequence length via `duration` or 180) */
  duration?: number;
  /** focal point in % (object-position / transform-origin) */
  focus?: [number, number];
  /** CSS filter */
  grade?: string;
  /** mirror horizontally (variety on reused stills) */
  flip?: boolean;
  /** handheld camera-shake amount in px (0 = locked off) */
  handheld?: number;
  ease?: (t: number) => number;
  style?: React.CSSProperties;
}

/** Cinematic push/pan/roll on a still. Never linear: eased camera + optional organic handheld noise. */
export const KenBurns: React.FC<KenBurnsProps> = ({
  src,
  crop,
  from = { s: 1, x: 0, y: 0 },
  to = { s: 1.15, x: 0, y: 0 },
  duration = 180,
  focus = [50, 50],
  grade,
  flip,
  handheld = 0,
  ease = EZ.camera,
  style,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = ramp(frame, [0, Math.max(1, duration)], [0, 1], ease);
  const s = from.s + (to.s - from.s) * p;
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  const r = (from.r ?? 0) + ((to.r ?? 0) - (from.r ?? 0)) * p;
  const hx = handheld ? noise2D('hh-x', frame * 0.018, 3) * handheld : 0;
  const hy = handheld ? noise2D('hh-y', frame * 0.021, 9) * handheld : 0;
  const hr = handheld ? noise2D('hh-r', frame * 0.015, 5) * handheld * 0.02 : 0;

  const transform = `translate(${x * (flip ? -1 : 1)}%, ${y}%) translate(${hx}px, ${hy}px) scale(${s}) rotate(${(flip ? -r : r) + hr}deg)`;
  const origin = `${flip ? 100 - focus[0] : focus[0]}% ${focus[1]}%`;

  let img: React.ReactNode;
  if (crop) {
    const c = COVER_CROPS[crop];
    const k = Math.max(width / c.w, height / c.h);
    const iw = COVER_SIZE.w * k;
    const ih = COVER_SIZE.h * k;
    const left = -c.x * k - (c.w * k - width) * (focus[0] / 100);
    const top = -c.y * k - (c.h * k - height) * (focus[1] / 100);
    img = <Img src={src} style={{ position: 'absolute', left, top, width: iw, height: ih, maxWidth: 'none' }} />;
  } else {
    img = <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focus[0]}% ${focus[1]}%` }} />;
  }

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#000', ...style }}>
      <AbsoluteFill style={{ transform: flip ? `${transform} scaleX(-1)` : transform, transformOrigin: origin, filter: grade }}>{img}</AbsoluteFill>
    </AbsoluteFill>
  );
};
