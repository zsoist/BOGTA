import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ramp } from '../lib/anim';
import { EZ } from '../theme';

type Dir = 'left' | 'right' | 'up' | 'down';

interface Props {
  children: React.ReactNode;
  /** 'in': the child whips into frame. 'out': the child whips away. */
  mode: 'in' | 'out';
  /** first frame of the whip (local to the enclosing Sequence) */
  at?: number;
  duration?: number;
  /** the direction the CAMERA pans (content travels the opposite way) */
  dir?: Dir;
  /** blur strength in px at peak velocity */
  blur?: number;
}

/**
 * Whip-pan: brutal eased translation + directional motion blur (SVG feGaussianBlur with stdDeviation on one axis),
 * plus a streak glow at peak speed. Put the outgoing scene (mode="out") and incoming scene (mode="in") over each other.
 */
export const WhipPan: React.FC<Props> = ({ children, mode, at = 0, duration = 14, dir = 'left', blur = 70 }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const p = duration <= 0 ? (mode === 'in' ? 1 : 0) : ramp(frame, [at, at + duration], [0, 1], EZ.whip);
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'left' || dir === 'up' ? 1 : -1; // camera pans left => content moves right? we want content exits opposite of pan
  const dist = horizontal ? W : H;
  // 'out': 0 -> -sign*dist ; 'in': +sign*dist -> 0
  const off = mode === 'out' ? -sign * dist * p : sign * dist * (1 - p);
  const speed = mode === 'out' ? Math.pow(p, 1.4) : Math.pow(1 - p, 1.4);
  const sd = blur * speed;
  const id = `whip-${mode}-${dir}`;
  const t = horizontal ? `translateX(${off}px)` : `translateY(${off}px)`;
  const active = mode === 'in' ? p < 1 : p > 0;

  return (
    <AbsoluteFill>
      {active && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={horizontal ? `${sd} 0` : `0 ${sd}`} />
          </filter>
        </svg>
      )}
      <AbsoluteFill style={{ transform: t, filter: active && sd > 0.5 ? `url(#${id})` : undefined }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
