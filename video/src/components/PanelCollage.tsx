import React, { useMemo } from 'react';
import { AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { bbox, centroid, intersect, type Pt } from '../lib/geom';
import { ramp } from '../lib/anim';
import { COVER_CROPS, COVER_SIZE, type CoverCrop } from '../lib/assets';
import { EZ, SPR } from '../theme';

export interface CollagePanel {
  src: string;
  /** crop of the cover image instead of a full image */
  crop?: CoverCrop;
  focus?: [number, number];
}

/** Angled GTA-cover panel layouts (design space). Polygons share edges, so a thick black stroke = comic gutters. */
export const collageLayout = (kind: 'landscape' | 'portrait') => {
  if (kind === 'landscape') {
    const W = 1920,
      H = 1080;
    const L: [Pt, Pt] = [[560, 0], [470, H]];
    const R: [Pt, Pt] = [[1370, 0], [1460, H]];
    const lineH = (y0: number, slope: number, side: 'l' | 'r'): [Pt, Pt] => (side === 'l' ? [[0, y0], [600, y0 - slope * 600]] : [[1920, y0], [1300, y0 - slope * -620]]);
    const ls1 = lineH(350, 0.07, 'l');
    const ls2 = lineH(715, 0.07, 'l');
    const rs1 = lineH(330, -0.07, 'r');
    const rs2 = lineH(700, -0.07, 'r');
    const a1 = intersect(...L, ...ls1),
      a2 = intersect(...L, ...ls2);
    const b1 = intersect(...R, ...rs1),
      b2 = intersect(...R, ...rs2);
    const polys: Pt[][] = [
      [[0, 0], L[0], a1, ls1[0]], // 0 left-top
      [R[0], [W, 0], rs1[0], b1], // 1 right-top
      [ls1[0], a1, a2, ls2[0]], // 2 left-mid
      [b1, rs1[0], rs2[0], b2], // 3 right-mid
      [ls2[0], a2, L[1], [0, H]], // 4 left-bottom
      [b2, rs2[0], [W, H], R[1]], // 5 right-bottom
      [L[0], R[0], R[1], L[1]], // 6 center hero
    ];
    return { W, H, polys, order: [0, 1, 2, 3, 4, 5, 6] };
  }
  const W = 1080,
    H = 1920;
  const h1: [Pt, Pt] = [[0, 640], [W, 590]];
  const h2: [Pt, Pt] = [[0, 1330], [W, 1380]];
  const v1: [Pt, Pt] = [[610, 0], [490, 700]];
  const v2: [Pt, Pt] = [[470, 1250], [600, H]];
  const t = intersect(...h1, ...v1);
  const bt = intersect(...h2, ...v2);
  const polys: Pt[][] = [
    [[0, 0], v1[0], t, h1[0]],
    [v1[0], [W, 0], h1[1], t],
    [h1[0], h1[1], h2[1], h2[0]],
    [h2[0], bt, v2[1], [0, H]],
    [bt, h2[1], [W, H], v2[1]],
  ];
  return { W, H, polys, order: [0, 1, 3, 4, 2] };
};

interface Props {
  panels: CollagePanel[];
  kind?: 'landscape' | 'portrait';
  /** local frame at which the first panel slams in */
  start?: number;
  /** frames between panels (use an 8th note) */
  stagger?: number;
  gutter?: number;
  /** 0..1: dim + push-back (when the logo arrives) */
  recede?: number;
  /** frame at which a "build" has finished (for the idle drift) */
  idleDrift?: boolean;
}

/**
 * GTA-cover style panel collage: angled panels slam in one by one with a black border gutter.
 */
export const PanelCollage: React.FC<Props> = ({ panels, kind = 'landscape', start = 0, stagger = 18, gutter = 15, recede = 0, idleDrift = true }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const layout = useMemo(() => collageLayout(kind), [kind]);
  const sc = Math.max(width / layout.W, height / layout.H);
  const ox = (width - layout.W * sc) / 2;
  const oy = (height - layout.H * sc) / 2;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: ox,
          top: oy,
          width: layout.W,
          height: layout.H,
          transform: `scale(${sc * (1 - recede * 0.06)})`,
          transformOrigin: '0 0',
          filter: recede > 0 ? `brightness(${1 - recede * 0.55}) blur(${recede * 3}px)` : undefined,
        }}
      >
        {layout.polys.map((poly, i) => {
          const slot = layout.order.indexOf(i);
          const panel = panels[i % panels.length];
          const t0 = start + slot * stagger;
          const t = frame - t0;
          if (t < -1) return null;
          const bb = bbox(poly);
          const [cx, cy] = centroid(poly);
          // entry direction: from nearest screen edge
          const fromX = cx < layout.W / 2 ? -1 : 1;
          const isCenter = kind === 'landscape' ? i === 6 : i === 2;
          const p = spring({ frame: t, fps, config: isCenter ? SPR.heavy : SPR.slam });
          const dx = isCenter ? 0 : fromX * (1 - p) * layout.W * 0.55;
          const dy = isCenter ? (1 - p) * layout.H * 0.6 : (1 - p) * (cy < layout.H / 2 ? -1 : 1) * layout.H * 0.15;
          const rot = (1 - p) * (isCenter ? 0 : fromX * 7);
          const scale = 1 + (1 - p) * (isCenter ? 0.25 : 0.08);
          const impact = Math.exp(-Math.max(0, t) * 0.35);
          const drift = idleDrift ? ramp(frame, [t0, t0 + 240], [1.0, 1.1], EZ.camera) : 1.06;
          const local = poly.map(([x, y]) => `${x - bb.x}px ${y - bb.y}px`).join(',');
          const strokePts = poly.map(([x, y]) => `${x},${y}`).join(' ');
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${scale})`,
                transformOrigin: `${cx}px ${cy}px`,
                opacity: Math.min(1, Math.max(0, t + 1) / 2),
              }}
            >
              <div style={{ position: 'absolute', left: bb.x, top: bb.y, width: bb.w, height: bb.h, clipPath: `polygon(${local})`, overflow: 'hidden', background: '#111' }}>
                <PanelImage panel={panel} w={bb.w} h={bb.h} zoom={drift} />
                <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: impact * 0.55 }} />
              </div>
              <svg width={layout.W} height={layout.H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <polygon points={strokePts} fill="none" stroke="#050507" strokeWidth={gutter} strokeLinejoin="miter" />
              </svg>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const PanelImage: React.FC<{ panel: CollagePanel; w: number; h: number; zoom: number }> = ({ panel, w, h, zoom }) => {
  const focus = panel.focus ?? [50, 50];
  if (panel.crop) {
    const c = COVER_CROPS[panel.crop];
    const k = Math.max(w / c.w, h / c.h);
    return (
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${focus[0]}% ${focus[1]}%` }}>
        <Img src={panel.src} style={{ position: 'absolute', left: -c.x * k - (c.w * k - w) * (focus[0] / 100), top: -c.y * k - (c.h * k - h) * (focus[1] / 100), width: COVER_SIZE.w * k, height: COVER_SIZE.h * k, maxWidth: 'none' }} />
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${focus[0]}% ${focus[1]}%` }}>
      <Img src={panel.src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focus[0]}% ${focus[1]}%` }} />
    </div>
  );
};
