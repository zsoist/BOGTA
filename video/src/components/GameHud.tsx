import React from 'react';
import { useCurrentFrame, useVideoConfig, random } from 'remotion';
import { C, FONT } from '../theme';
import { ramp } from '../lib/anim';

/** GTA-style HUD (money, clock, radar) used over styled stills only — real footage carries the game's own HUD. */
export const GameHud: React.FC<{ money?: number; clock?: string; vehicle?: string; wanted?: boolean; beatFrames: number }> = ({ money = 52300, clock = '15:02', vehicle = 'TAXI', wanted, beatFrames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const portrait = height > width;
  const m = Math.round(money + ramp(frame, [0, 180], [0, 8000]));
  const sweep = (frame * 2) % 360;
  const R = 112 * u * (portrait ? 1.2 : 1);
  return (
    <>
      <div style={{ position: 'absolute', right: 56 * u, top: 44 * u, textAlign: 'right', fontFamily: FONT.slam, lineHeight: 1 }}>
        <div style={{ fontSize: 64 * u, color: C.green, WebkitTextStroke: `${5 * u}px #000`, paintOrder: 'stroke fill', textShadow: `0 ${4 * u}px 0 #000` }}>$ {m.toLocaleString('es-CO')}</div>
        <div style={{ fontSize: 34 * u, color: '#fff', marginTop: 6 * u, WebkitTextStroke: `${3 * u}px #000`, paintOrder: 'stroke fill' }}>{clock} ☔</div>
      </div>
      <div style={{ position: 'absolute', left: 56 * u, bottom: (portrait ? 480 : 70) * u, width: R * 2, height: R * 2, borderRadius: '50%', border: `${6 * u}px solid #0a0a0a`, background: 'radial-gradient(circle, rgba(20,38,28,0.88), rgba(8,14,10,0.92))', boxShadow: `0 0 0 ${2 * u}px rgba(111,211,111,0.5), 0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.6)`, overflow: 'hidden' }}>
        <svg width={R * 2} height={R * 2}>
          {[0.33, 0.66, 1].map((k) => (
            <circle key={k} cx={R} cy={R} r={R * k * 0.96} fill="none" stroke="rgba(111,211,111,0.22)" strokeWidth={1.5} />
          ))}
          <path d={`M ${R} ${R} L ${R + Math.cos(((sweep - 90) * Math.PI) / 180) * R} ${R + Math.sin(((sweep - 90) * Math.PI) / 180) * R}`} stroke="rgba(111,211,111,0.7)" strokeWidth={3} />
          {Array.from({ length: 5 }, (_, i) => (
            <rect key={i} x={R + (random(`rx${i}`) - 0.5) * R * 1.4} y={R + (random(`ry${i}`) - 0.5) * R * 1.4} width={6 * u} height={6 * u} fill={wanted && i < 3 ? (Math.floor(frame / (beatFrames / 4)) % 2 ? C.police : C.policeB) : 'rgba(255,255,255,0.7)'} />
          ))}
          <polygon points={`${R},${R - 14 * u} ${R - 9 * u},${R + 10 * u} ${R + 9 * u},${R + 10 * u}`} fill="#fff" />
        </svg>
      </div>
    </>
  );
};
