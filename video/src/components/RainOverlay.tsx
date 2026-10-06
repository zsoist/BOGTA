import React, { useMemo } from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props {
  /** 0..1 density + speed */
  intensity?: number;
  /** wind slant in degrees (0 = vertical) */
  angle?: number;
  /** lens drops on the glass */
  drops?: number;
  tint?: string;
  /** frame offset so layered overlays don't sync */
  seed?: string;
  opacity?: number;
}

/** Procedural rain: two parallax streak layers + refractive drops sliding on the lens. Fully deterministic. */
export const RainOverlay: React.FC<Props> = ({ intensity = 0.7, angle = 12, drops = 10, tint = '200,220,255', seed = 'rain', opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const k = 60 / fps; // keep speeds identical at 30 fps
  const scale = Math.min(W, H) / 1080;
  const nFar = Math.round(150 * intensity);
  const nNear = Math.round(55 * intensity);

  const streaks = useMemo(() => {
    const mk = (n: number, layer: number) =>
      Array.from({ length: n }, (_, i) => ({
        x: random(`${seed}-x-${layer}-${i}`) * (W + 500) - 250,
        y0: random(`${seed}-y-${layer}-${i}`) * (H + 400),
        len: (layer ? 120 : 50) + random(`${seed}-l-${layer}-${i}`) * (layer ? 160 : 90),
        spd: (layer ? 62 : 38) + random(`${seed}-s-${layer}-${i}`) * (layer ? 36 : 20),
        w: (layer ? 1.8 : 0.9) + random(`${seed}-w-${layer}-${i}`) * (layer ? 1.6 : 0.8),
        a: (layer ? 0.2 : 0.12) + random(`${seed}-a-${layer}-${i}`) * (layer ? 0.28 : 0.18),
      }));
    return { far: mk(nFar, 0), near: mk(nNear, 1) };
  }, [W, H, nFar, nNear, seed]);

  const t = Math.tan((angle * Math.PI) / 180);
  const renderLayer = (arr: typeof streaks.far) =>
    arr.map((s, i) => {
      const span = H + 400 * scale + s.len * scale;
      const y = ((s.y0 + frame * s.spd * k * scale) % span) - s.len * scale;
      const x = s.x - (y + s.len * scale * 0.5) * t;
      return (
        <line
          key={i}
          x1={x}
          y1={y}
          x2={x - s.len * scale * t}
          y2={y + s.len * scale}
          stroke={`rgba(${tint},${s.a})`}
          strokeWidth={s.w * scale}
          strokeLinecap="round"
        />
      );
    });

  const dropList = useMemo(
    () =>
      Array.from({ length: drops }, (_, i) => ({
        x: 0.05 + random(`${seed}-dx${i}`) * 0.9,
        y: 0.05 + random(`${seed}-dy${i}`) * 0.7,
        r: 16 + random(`${seed}-dr${i}`) * 34,
        born: Math.floor(random(`${seed}-db${i}`) * 140),
        slide: 0.4 + random(`${seed}-ds${i}`) * 1.4,
      })),
    [drops, seed],
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {renderLayer(streaks.far)}
        {renderLayer(streaks.near)}
      </svg>
      {dropList.map((d, i) => {
        const age = frame * k - d.born;
        if (age < 0) return null;
        const grow = Math.min(1, age / 10);
        const slide = Math.pow(age, 1.18) * d.slide * 0.5 * scale; // accelerates like a real drop
        const r = d.r * grow * scale;
        const cy = d.y * H + slide;
        if (cy - r > H) return null;
        return (
          <React.Fragment key={i}>
            {/* trail */}
            <div
              style={{
                position: 'absolute',
                left: d.x * W - 1.2 * scale,
                top: d.y * H,
                width: 2.4 * scale,
                height: Math.max(0, slide),
                background: `linear-gradient(180deg, rgba(${tint},0), rgba(${tint},0.22))`,
                borderRadius: 2,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: d.x * W - r,
                top: cy - r * 1.15,
                width: r * 2,
                height: r * 2.3,
                borderRadius: '50% 50% 50% 50% / 58% 58% 42% 42%',
                backdropFilter: 'blur(2.5px) brightness(1.5) saturate(1.2)',
                background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 38%)',
                boxShadow: 'inset -2px -4px 8px rgba(255,255,255,0.22), inset 3px 4px 9px rgba(0,0,0,0.3), 0 2px 5px rgba(0,0,0,0.2)',
              }}
            />
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
