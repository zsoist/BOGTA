import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { flash } from '../lib/anim';

/** Full-frame flash at the given frames (local to the enclosing Sequence). */
export const Flash: React.FC<{ hits: number[]; color?: string; peak?: number; decay?: number }> = ({ hits, color = '#fff', peak = 0.9, decay = 0.28 }) => {
  const frame = useCurrentFrame();
  const v = flash(frame, hits, decay) * peak;
  if (v < 0.01) return null;
  return <AbsoluteFill style={{ background: color, opacity: v, pointerEvents: 'none', zIndex: 80 }} />;
};
