import React from 'react';
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SmartMedia, resolveMedia } from '../components/SmartMedia';
import { KineticText } from '../components/KineticText';
import { Stars, SirenGlow } from '../components/Stars';
import { BustedCard } from '../components/BustedCard';
import { SpeedLines } from '../components/SpeedLines';
import { RainOverlay } from '../components/RainOverlay';
import { Flash } from '../components/Flash';
import { GameHud } from '../components/GameHud';
import { MONTAGE_BLOCKS, VERT_MONTAGE, type MontageWord, type Shot } from '../shotlist';
import { ramp, useBeats } from '../lib/anim';
import { C, EZ, FONT, SPR } from '../theme';

interface FlatShot extends Shot {
  start: number; // beats from scene start
  block: number;
  word: MontageWord;
  tag?: string;
}

const flatten = (): FlatShot[] => {
  const out: FlatShot[] = [];
  let cur = 0;
  MONTAGE_BLOCKS.forEach((bl, bi) => {
    bl.shots.forEach((s) => {
      out.push({ ...s, start: cur, block: bi, word: bl.word, tag: bl.tag });
      cur += s.beats;
    });
  });
  return out;
};
export const MONTAGE_FLAT = flatten();
/** Beats (scene-relative) where the montage cuts — used for CA spikes. */
export const MONTAGE_CUT_BEATS = MONTAGE_FLAT.map((s) => s.start);

const WORDS = ['ROBA', 'DERRAPA', 'HUYE', 'HABLA'] as const;
const WORD_COLOR: Record<string, string> = { ROBA: C.gold, DERRAPA: '#fff', HUYE: '#FF5A66', HABLA: C.green };

/** Word tracker (top-left): ROBA · DERRAPA · HUYE · HABLA with the current one lit. */
const Tracker: React.FC<{ current: MontageWord }> = ({ current }) => {
  const { width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const portrait = height > width;
  return (
    <div style={{ position: 'absolute', left: (portrait ? 48 : 80) * u, top: (portrait ? 60 : 54) * u * (portrait ? 1.8 : 1), display: 'flex', gap: 22 * u, fontFamily: FONT.title, fontSize: (portrait ? 56 : 40) * u, letterSpacing: 5 * u, zIndex: 30 }}>
      {WORDS.map((w) => (
        <span
          key={w}
          style={{
            color: current === w ? WORD_COLOR[w] : 'rgba(255,255,255,0.35)',
            textShadow: current === w ? `0 0 ${18 * u}px ${WORD_COLOR[w]}99, 0 ${3 * u}px 0 #000` : `0 ${3 * u}px 0 #000`,
            transform: current === w ? 'scale(1.12)' : 'none',
            transformOrigin: 'left center',
          }}
        >
          {w}
        </span>
      ))}
    </div>
  );
};

/** One cut of the montage: hard cut + punch zoom + flash on the beat. Stills get a game HUD (real footage carries its own). */
export const MontageShot: React.FC<{ shot: Shot & { word?: MontageWord; block?: number; start?: number }; len: number }> = ({ shot, len }) => {
  const frame = useCurrentFrame();
  const { bf } = useBeats();
  const real = resolveMedia(shot.slot).origin === 'footage';
  const punch = 1 + 0.07 * Math.exp(-frame * 0.28);
  const wanted = shot.word === 'HUYE' || shot.block === 3;
  return (
    <AbsoluteFill style={{ transform: `scale(${punch})` }}>
      <SmartMedia name={shot.slot} duration={len} trimBeats={shot.trim} flip={shot.flip} handheld={shot.word === 'DERRAPA' ? 5 : 2.4} />
      <RainOverlay intensity={shot.slot === 'chiva' ? 0.15 : 0.45} angle={12} drops={4} seed={`m${shot.start ?? 0}${shot.slot}`} opacity={0.85} />
      {shot.word === 'DERRAPA' && <SpeedLines intensity={0.9} seed={`sp${shot.start ?? 0}`} />}
      {!real && <GameHud beatFrames={bf} wanted={wanted} vehicle={shot.slot === 'chiva' ? 'CHIVA' : 'TAXI'} money={52300 + (shot.start ?? 0) * 410} />}
      <Flash hits={[0]} peak={0.45} decay={0.4} />
    </AbsoluteFill>
  );
};

/** Act 4 — beat-cut gameplay with kinetic ROBA / DERRAPA / HUYE / HABLA, stars, sirens, BUSTED, pico y placa. */
export const GameplayMontage: React.FC = () => {
  const { frame, b, bf, height } = useBeats();
  const { width } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const shots = MONTAGE_FLAT;

  const curIdx = shots.reduce((acc, s, i) => (frame >= b(s.start) ? i : acc), 0);
  const curWord = [...shots].slice(0, curIdx + 1).reverse().find((s) => s.word)?.word ?? null;
  const huyeStart = shots.find((s) => s.word === 'HUYE')!.start;
  const bustedStart = shots.find((s) => s.block === 3)!.start;
  const hablaStart = shots.find((s) => s.word === 'HABLA')!.start;
  const inSiren = frame >= b(huyeStart) && frame < b(bustedStart + 4);

  // star fills inside HUYE (each 2 beats) — the 5th lands as BUSTED begins
  const starFill = [0.5, 2.5, 4.5, 6.5, 8.5].map((x) => b(x));

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {shots.map((s, i) => (
        <Sequence key={i} from={b(s.start)} durationInFrames={b(s.beats)} layout="none">
          <MontageShot shot={s} len={b(s.beats)} />
        </Sequence>
      ))}

      {/* kinetic words, one per block, landing on the block's first beat (sync'd to the VO word) */}
      {WORDS.map((word) => {
        const first = shots.find((s) => s.word === word)!;
        return (
          <Sequence key={word} from={b(first.start)} durationInFrames={b(4)} layout="none">
            <KineticText
              words={[{ text: word, at: 0, color: WORD_COLOR[word], rot: word === 'HUYE' ? 3 : -3 }]}
              size={word === 'DERRAPA' ? 330 : 400}
              exitAt={b(2.8)}
              exitDuration={b(0.5)}
              shakeAmp={34}
              align="right"
              style={{ paddingRight: 90 * u, paddingTop: height * 0.46 }}
            />
          </Sequence>
        );
      })}

      {/* block tags (carjack quote, pico y placa) */}
      {MONTAGE_BLOCKS.map((bl, i) => {
        const first = shots.find((s) => s.block === i)!;
        if (!bl.tag || i === 3) return null;
        return (
          <Sequence key={`tag${i}`} from={b(first.start + 0.5)} durationInFrames={b(i === 4 ? 6 : 4)} layout="none">
            <Tag text={bl.tag} pico={i === 4} />
          </Sequence>
        );
      })}

      {/* wanted stars */}
      <Sequence from={b(huyeStart)} durationInFrames={b(14)} layout="none">
        <StarsFrame fillAt={starFill} />
      </Sequence>
      {inSiren && <SirenGlow beatFrames={bf} intensity={frame >= b(bustedStart) ? 0.8 : 1} />}

      <Sequence from={b(bustedStart)} durationInFrames={b(4)} layout="none">
        <BustedCard at={0} />
      </Sequence>

      {/* "E - HABLAR" prompt on the last block */}
      <Sequence from={b(hablaStart + 1.2)} durationInFrames={b(2.8)} layout="none">
        <TalkPrompt />
      </Sequence>

      <Tracker current={curWord} />
      <Flash hits={[b(bustedStart)]} peak={0.8} />
    </AbsoluteFill>
  );
};

const StarsFrame: React.FC<{ fillAt: number[] }> = ({ fillAt }) => {
  const { width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  return (
    <div style={{ position: 'absolute', right: 70 * u, top: 190 * u }}>
      <Stars fillAt={fillAt} size={96 * u} gap={12 * u} blinkFrom={fillAt[4] + 30} />
    </div>
  );
};

const Tag: React.FC<{ text: string; pico?: boolean }> = ({ text, pico }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const p = spring({ frame, fps, config: SPR.snap });
  if (pico) {
    return (
      <div
        style={{
          position: 'absolute',
          right: 100 * u,
          bottom: 150 * u,
          transform: `translateX(${(1 - p) * 500}px) rotate(-3deg)`,
          background: C.flagY,
          color: '#0B0B0F',
          border: `${8 * u}px solid #0B0B0F`,
          borderRadius: 18 * u,
          padding: `${16 * u}px ${34 * u}px`,
          boxShadow: `0 ${14 * u}px 0 rgba(0,0,0,0.6)`,
          textAlign: 'center',
        }}
      >
        <div style={{ fontFamily: FONT.slam, fontSize: 88 * u, lineHeight: 1 }}>PICO Y PLACA</div>
        <div style={{ fontFamily: FONT.ui, fontWeight: 800, fontSize: 28 * u, letterSpacing: 3 * u }}>PLACA TERMINADA EN 7 · HOY NO CIRCULA</div>
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: 360 * u,
        bottom: 90 * u,
        fontFamily: FONT.ui,
        fontWeight: 800,
        fontSize: 30 * u,
        letterSpacing: 8 * u,
        color: '#fff',
        background: 'rgba(0,0,0,0.55)',
        padding: `${10 * u}px ${22 * u}px`,
        borderLeft: `${8 * u}px solid ${C.gold}`,
        transform: `translateX(${(1 - p) * -300}px)`,
      }}
    >
      {text}
    </div>
  );
};

const TalkPrompt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const p = spring({ frame, fps, config: SPR.pop });
  const press = ramp(frame, [fps * 0.9, fps * 1.0], [0, 1], EZ.out);
  return (
    <div style={{ position: 'absolute', left: '50%', bottom: 150 * u, transform: `translateX(-50%) scale(${p})`, display: 'flex', alignItems: 'center', gap: 20 * u, background: 'rgba(0,0,0,0.7)', border: '2px solid rgba(255,255,255,0.25)', borderRadius: 18 * u, padding: `${14 * u}px ${28 * u}px` }}>
      <div style={{ width: 70 * u, height: 70 * u, borderRadius: 14 * u, background: '#fff', color: '#000', fontFamily: FONT.ui, fontWeight: 800, fontSize: 44 * u, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateY(${press * 6 * u}px)`, boxShadow: `0 ${(8 - press * 6) * u}px 0 #888` }}>E</div>
      <div style={{ fontFamily: FONT.title, fontSize: 56 * u, letterSpacing: 4 * u, color: '#fff' }}>HABLAR CON DOÑA GLORIA</div>
    </div>
  );
};

export { VERT_MONTAGE };
