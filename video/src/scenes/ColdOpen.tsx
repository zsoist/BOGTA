import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame } from 'remotion';
import { SmartMedia } from '../components/SmartMedia';
import { RainOverlay } from '../components/RainOverlay';
import { KineticText } from '../components/KineticText';
import { Flash } from '../components/Flash';
import { flash, ramp, shake, useBeats } from '../lib/anim';
import { C, EZ, FONT, SPR } from '../theme';

export interface ColdOpenCues {
  /** lightning strikes (beats) */
  lightning: number[];
  clockIn: number;
  /** 14:59 -> 15:00 */
  clockFlip: number;
  /** "BIENVENIDO A LA NEVERA" word slams (beats) */
  slam: [number, number, number, number];
  total: number;
}
export const COLD_MASTER: ColdOpenCues = { lightning: [3, 4.25, 7], clockIn: 3.5, clockFlip: 6, slam: [8, 8.5, 9, 10], total: 12 };
export const COLD_VERTICAL: ColdOpenCues = { lightning: [1.5, 2.5, 4], clockIn: 2, clockFlip: 4, slam: [5, 5.5, 6, 6.5], total: 8 };

/** Act 1 — black, rain on the lens, lightning reveals the cerros, 14:59 -> 15:00, "BIENVENIDO A LA NEVERA". */
export const ColdOpen: React.FC<{ cues?: ColdOpenCues }> = ({ cues = COLD_MASTER }) => {
  const { frame, fps, width, height, b, bf, pulse } = useBeats();
  const portrait = height > width;
  const u = Math.min(width / 1920, height / 1080) * (portrait ? 1.45 : 1);
  const total = b(cues.total);

  // --- lightning ---
  const hits = cues.lightning.map((x) => b(x));
  const bolt = flash(frame, hits, 0.16);
  const ambient = 0.1 + ramp(frame, [0, total * 0.75], [0, 0.1], EZ.soft) + ramp(frame, [b(cues.clockFlip), b(cues.slam[0])], [0, 0.34], EZ.out); // the cerros are barely visible between strikes
  const bright = ambient + bolt * 1.5;
  const flipF = b(cues.clockFlip);
  const slam0 = b(cues.slam[0]);
  const afterFlip = frame >= flipF;

  // --- clock ---
  const cIn = b(cues.clockIn);
  const clockA = ramp(frame, [cIn, cIn + 18], [0, 1], EZ.out);
  const flipP = spring({ frame: frame - flipF, fps, config: SPR.slam });
  const toCorner = ramp(frame, [slam0 - 6, slam0 + 20], [0, 1], EZ.inOut);
  const clockText = afterFlip ? '15:00' : '14:59';
  const colonOn = afterFlip || Math.floor(frame / (bf / 2)) % 2 === 0;
  const sh = shake(frame, flipF, 26 * u, 0.2, 4);
  const clockSize = (portrait ? 330 : 300) * u * (1 - toCorner * 0.78) * (afterFlip ? 1 + 0.12 * Math.max(0, 1 - flipP) : 1);
  const cx = 50 - toCorner * 41; // %
  const cy = 50 - toCorner * (portrait ? 40 : 40);
  const color = afterFlip ? C.gold : C.green;

  // fade in from black over first beat
  const fadeIn = ramp(frame, [0, b(1.2)], [1, 0], EZ.out);
  const rainI = 0.55 + ramp(frame, [0, flipF], [0, 0.25], EZ.in) + (afterFlip ? 0.2 : 0);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ filter: `brightness(${bright}) contrast(1.15) saturate(${0.55 + bolt * 0.6})`, transform: `translate(${sh.x * 0.3}px, ${sh.y * 0.3}px)` }}>
        <SmartMedia name="coldopen" duration={total} cam={{ from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.16, x: -1.5, y: 1 } }} handheld={3} />
      </AbsoluteFill>
      {/* cold blue grade on the flash */}
      <AbsoluteFill style={{ background: `rgba(120,160,255,${bolt * 0.22})`, mixBlendMode: 'screen' }} />
      <RainOverlay intensity={Math.min(1, rainI)} angle={14} drops={afterFlip ? 16 : 10} seed="cold" />

      {/* clock */}
      <div style={{ position: 'absolute', left: `${cx}%`, top: `${cy}%`, transform: `translate(${-50 * (1 - toCorner)}%, -50%) translate(${sh.x}px, ${sh.y}px)`, opacity: clockA, textAlign: toCorner > 0.5 ? 'left' : 'center' }}>
        <div style={{ fontFamily: FONT.ui, fontSize: 26 * u * (1 - toCorner * 0.4), letterSpacing: 10 * u, color: C.mute, fontWeight: 600, marginBottom: 14 * u, opacity: 1 - toCorner }}>BOGOTÁ · COLOMBIA · 4°36′N 74°04′O</div>
        <div
          style={{
            fontFamily: FONT.ui,
            fontWeight: 800,
            fontSize: clockSize,
            lineHeight: 1,
            color,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: -clockSize * 0.03,
            textShadow: `0 0 ${40 * u}px ${color}aa, 0 0 ${110 * u}px ${color}55`,
            filter: afterFlip && frame - flipF < 6 ? 'blur(2px)' : undefined,
          }}
        >
          {clockText.slice(0, 2)}
          <span style={{ opacity: colonOn ? 1 : 0.15 }}>:</span>
          {clockText.slice(3)}
        </div>
        <div style={{ fontFamily: FONT.title, fontSize: 38 * u * (1 - toCorner * 0.3), letterSpacing: 12 * u, color: afterFlip ? C.gold : C.white, opacity: 0.9 * (1 - toCorner), marginTop: 6 * u }}>{afterFlip ? '¡Y SE VINO EL PALO DE AGUA!' : 'TARDE · SOLECITO TRAICIONERO'}</div>
      </div>

      {/* BIENVENIDO A LA NEVERA */}
      <KineticText
        start={0}
        size={portrait ? 210 : 205}
        stagger={0}
        shakeAmp={26}
        words={[
          { text: 'BIENVENIDO', at: b(cues.slam[0]), color: '#fff' },
          { text: 'A LA', at: b(cues.slam[1]), color: '#fff', scale: 0.85 },
          { text: 'NEVERA,', at: b(cues.slam[2]), color: '#fff' },
          { text: 'PARCE', at: b(cues.slam[3]), color: C.gold, scale: 1.6, rot: -4 },
        ]}
        style={{ paddingTop: portrait ? height * 0.12 : 40 * u }}
      />

      <Flash hits={hits} color="#cfe0ff" peak={0.5} decay={0.22} />
      <Flash hits={[flipF]} color="#fff3c0" peak={0.3} decay={0.3} />
      <AbsoluteFill style={{ background: '#000', opacity: fadeIn }} />
    </AbsoluteFill>
  );
};
