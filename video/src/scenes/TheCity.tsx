import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { SmartMedia } from '../components/SmartMedia';
import { RainOverlay } from '../components/RainOverlay';
import { WhipPan } from '../components/WhipPan';
import { Letterbox } from '../components/FilmFinish';
import { Counter } from '../components/Counter';
import { CITY_SHOTS, VERT_CITY_SHOTS, type Shot } from '../shotlist';
import { ramp, useBeats } from '../lib/anim';
import { C, EZ, FONT } from '../theme';

const LowerThird: React.FC<{ title: string; sub?: string; dur: number }> = ({ title, sub, dur }) => {
  const { frame, width, height, b } = useBeats();
  const u = Math.min(width / 1920, height / 1080);
  const portrait = height > width;
  const inP = ramp(frame, [b(0.5), b(1.2)], [0, 1], EZ.out);
  const outP = ramp(frame, [dur - b(0.6), dur - b(0.1)], [0, 1], EZ.in);
  const barH = 6 * u;
  const chars = Math.floor(inP * title.length * 1.2);
  const barBottom = portrait ? height * 0.24 : 138 * u + 70 * u;
  return (
    <div style={{ position: 'absolute', left: (portrait ? 56 : 110) * u, bottom: barBottom, opacity: 1 - outP, transform: `translateX(${-outP * 120}px)` }}>
      <div style={{ width: 520 * u * inP, height: barH, background: C.gold, marginBottom: 14 * u, boxShadow: `0 0 ${20 * u}px ${C.gold}88` }} />
      <div style={{ fontFamily: FONT.title, fontSize: (portrait ? 120 : 112) * u, letterSpacing: 6 * u, lineHeight: 0.95, color: '#fff', textShadow: `0 ${6 * u}px ${30 * u}px rgba(0,0,0,0.8)`, whiteSpace: 'nowrap' }}>{title.slice(0, chars)}</div>
      {sub && <div style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: 26 * u, letterSpacing: 8 * u, color: C.gold, marginTop: 10 * u, opacity: ramp(frame, [b(0.9), b(1.5)], [0, 1], EZ.out) }}>{sub}</div>}
    </div>
  );
};

const AltitudeHud: React.FC = () => {
  const { frame, width, height, b } = useBeats();
  const vis = ramp(frame, [b(0.4), b(1)], [0, 1], EZ.out) * (1 - ramp(frame, [b(9.5), b(10.2)], [0, 1], EZ.in));
  const u = Math.min(width / 1920, height / 1080);
  const portrait = height > width;
  return (
    <div style={{ position: 'absolute', right: (portrait ? 56 : 110) * u, bottom: portrait ? height * 0.24 : 138 * u + 70 * u, zIndex: 20, opacity: vis }}>
      <Counter value={2640} label="ALTITUD · BOGOTÁ" suffix="m" at={b(0.8)} duration={b(4.4)} color={C.white} size={92 * u} />
    </div>
  );
};

/** Act 2 — four establishing shots in 2.39:1, whip-panned on the beat, with lower thirds, rain and an altitude counter. */
export const TheCity: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { b, fps } = useBeats();
  const shots: Shot[] = vertical ? VERT_CITY_SHOTS : CITY_SHOTS;
  const whip = Math.round(b(0.4)); // frames of overlap
  const dirs: ('left' | 'right' | 'up')[] = vertical ? ['up', 'up'] : ['left', 'right', 'left'];
  let cursor = 0;
  const entries = shots.map((s, i) => {
    const from = b(cursor);
    const len = b(s.beats);
    cursor += s.beats;
    return { s, i, from, len };
  });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {entries.map(({ s, i, from, len }) => {
        const last = i === entries.length - 1;
        const d = dirs[Math.max(0, i - 1)] ?? 'left';
        const dOut = dirs[i] ?? 'left';
        return (
          <Sequence key={i} from={from} durationInFrames={len + (last ? 0 : whip)} layout="none">
            <WhipPan mode="in" at={0} duration={i === 0 ? 0 : whip} dir={d} blur={80}>
              <WhipPan mode="out" at={len} duration={last ? 1e6 : whip} dir={dOut} blur={80}>
                <AbsoluteFill>
                  <SmartMedia name={s.slot} duration={len + whip} flip={s.flip} />
                  <RainOverlay intensity={i === 0 ? 0.25 : 0.5} angle={10} drops={i === 0 ? 3 : 6} seed={`city${i}`} opacity={0.9} />
                  <LowerThird title={s.title ?? ''} sub={s.sub} dur={len} />
                </AbsoluteFill>
              </WhipPan>
            </WhipPan>
          </Sequence>
        );
      })}
      {!vertical && <AltitudeHud />}
      {!vertical && <LetterboxIn />}
    </AbsoluteFill>
  );
};

const LetterboxIn: React.FC = () => {
  const { frame, b } = useBeats();
  return <Letterbox amount={ramp(frame, [0, b(1)], [0.0, 1], EZ.out)} />;
};
