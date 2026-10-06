import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { beatToFrame } from '../beats';
import { VO_LINES, type VoLine } from '../vo';
import { ramp } from '../lib/anim';
import { C, EZ, FONT } from '../theme';

/** Bebas Neue subtitles synced to the VO lines (word-by-word reveal). `scale` is the line-set to use. */
export const Subtitles: React.FC<{ lines?: VoLine[]; bottom?: number; size?: number }> = ({ lines = VO_LINES, bottom = 50, size = 58 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const portrait = height > width;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 70 }}>
      {lines.flatMap((l) =>
        l.subs.map((s, si) => {
          const f0 = beatToFrame(l.startBeat, fps) + Math.round(s.at * fps);
          const f1 = beatToFrame(l.startBeat, fps) + Math.round(s.until * fps);
          if (frame < f0 - 2 || frame > f1 + 10) return null;
          const words = s.text.split(' ');
          const perWord = Math.max(1, Math.min(6, (f1 - f0) / (words.length * 1.8)));
          const fadeOut = ramp(frame, [f1, f1 + 8], [1, 0], EZ.in);
          return (
            <div
              key={`${l.id}-${si}`}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: portrait ? height * 0.2 : bottom * u,
                textAlign: 'center',
                padding: `0 ${60 * u}px`,
                opacity: fadeOut,
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  fontFamily: FONT.title,
                  fontSize: size * u * (portrait ? 1.35 : 1),
                  letterSpacing: 3 * u,
                  color: C.white,
                  textShadow: `0 ${3 * u}px ${18 * u}px rgba(0,0,0,0.95), 0 0 ${2 * u}px #000, 0 ${2 * u}px 0 #000`,
                  lineHeight: 1.05,
                }}
              >
                {words.map((w, i) => {
                  const a = ramp(frame, [f0 + i * perWord, f0 + i * perWord + 5], [0, 1], EZ.out);
                  return (
                    <span key={i} style={{ display: 'inline-block', opacity: a, transform: `translateY(${(1 - a) * 14 * u}px)`, marginRight: 0.28 * size * u }}>
                      {w}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        }),
      )}
    </AbsoluteFill>
  );
};
