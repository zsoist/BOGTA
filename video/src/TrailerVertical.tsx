import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { FilmFinish } from './components/FilmFinish';
import { InkTransition } from './components/InkTransition';
import { Subtitles } from './components/Subtitles';
import { KineticText } from './components/KineticText';
import { AgentGraph } from './components/AgentGraph';
import { Counter } from './components/Counter';
import { Stars, SirenGlow } from './components/Stars';
import { BustedCard } from './components/BustedCard';
import { Soundtrack } from './Soundtrack';
import { ColdOpen, COLD_VERTICAL } from './scenes/ColdOpen';
import { TheCity } from './scenes/TheCity';
import { TitleSlam } from './scenes/TitleSlam';
import { MontageShot } from './scenes/GameplayMontage';
import { NpcTalk } from './scenes/NpcTalk';
import { Finale } from './scenes/Finale';
import { STATS } from './scenes/MakingOf';
import { VERT_MONTAGE } from './shotlist';
import { VO_LINES_V } from './vo';
import { VERTICAL_FPS, VSCENE_BEATS, VSCENE_ORDER, beatToFrame, vSceneFrom, type SceneName } from './beats';
import { useBeats } from './lib/anim';
import { C } from './theme';

const F = (b: number) => beatToFrame(b, VERTICAL_FPS);
const ORDER = VSCENE_ORDER;

const WORD_COLOR: Record<string, string> = { ROBA: C.gold, DERRAPA: '#fff', HUYE: '#FF5A66' };

const VMontage: React.FC = () => {
  const { b, bf, width, height } = useBeats();
  const u = width / 1920;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {VERT_MONTAGE.map((m, i) => (
        <Sequence key={i} from={b(i * 4)} durationInFrames={b(4)} layout="none">
          <MontageShot shot={{ ...m.shot, word: m.word, block: i === 3 ? 3 : i, start: i * 4 }} len={b(4)} />
          {m.word && (
            <KineticText
              words={[{ text: m.word, at: 0, color: WORD_COLOR[m.word], rot: -3 }]}
              size={m.word === 'DERRAPA' ? 330 : 420}
              exitAt={b(3.2)}
              exitDuration={b(0.5)}
              shakeAmp={34}
              style={{ paddingTop: height * 0.55 }}
            />
          )}
        </Sequence>
      ))}
      <Sequence from={b(8)} durationInFrames={b(4)} layout="none">
        <div style={{ position: 'absolute', right: 56, top: 160 }}>
          <Stars fillAt={[b(0.3), b(1), b(1.8), b(2.6), b(3.4)]} size={150 * u * 1.1} gap={10} />
        </div>
        <SirenGlow beatFrames={bf} />
      </Sequence>
      <Sequence from={b(12)} durationInFrames={b(4)} layout="none">
        <SirenGlow beatFrames={bf} intensity={0.7} />
        <BustedCard at={0} />
      </Sequence>
    </AbsoluteFill>
  );
};

const VMakingOf: React.FC = () => {
  const { b, bf, width, height } = useBeats();
  const u = width / 1920;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 35%, #16203A, #0B0B0F 70%)' }} />
      <KineticText
        words={[
          { text: '1 LÍDER', at: b(0.1), color: C.opus, scale: 0.9 },
          { text: '7 AGENTES', at: b(0.6), color: C.sonnet, scale: 0.9 },
          { text: '90 MIN', at: b(1.1), color: C.gold, scale: 0.9 },
        ]}
        size={230}
        stagger={0}
        style={{ paddingBottom: height * 0.55 }}
        shakeAmp={20}
      />
      <div style={{ position: 'absolute', left: 0, top: height * 0.33 }}>
        <AgentGraph width={width} height={height * 0.36} at={b(0.3)} beatFrames={bf} gap={0.42} scale={0.9} showFiles={false} />
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, bottom: height * 0.17, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        <Counter value={STATS.agents} label="Agentes" at={b(1.2)} duration={b(1.2)} color={C.sonnet} size={92} />
        <Counter value={STATS.loc} label="Líneas" at={b(2)} duration={b(2.4)} color={C.green} size={92} />
        <Counter value={STATS.codexImages + STATS.elevenTracks} label="Arte+audio IA" at={b(2.6)} duration={b(2.4)} color={C.eleven} size={92} />
      </div>
    </AbsoluteFill>
  );
};

const SCENES: Record<SceneName, React.FC> = {
  coldOpen: () => <ColdOpen cues={COLD_VERTICAL} />,
  city: () => <TheCity vertical />,
  title: () => <TitleSlam vertical />,
  montage: () => <VMontage />,
  npc: () => <NpcTalk vertical />,
  makingOf: () => <VMakingOf />,
  finale: () => <Finale vertical />,
};

/** 30 s vertical cutdown (1080x1920 @30): same components, tighter edit, 50 beats. */
export const TrailerVertical: React.FC = () => {
  const { width } = useVideoConfig();
  void width;
  const boundaries = ORDER.slice(1).map((k) => vSceneFrom(k));
  const ink = F(0.85);
  return (
    <FilmFinish aberration={1.0} impacts={boundaries} grain={0.15} vignette={0.5}>
      <AbsoluteFill style={{ background: '#000' }}>
        {ORDER.map((k) => {
          const Comp = SCENES[k];
          return (
            <Sequence key={k} from={vSceneFrom(k)} durationInFrames={F(VSCENE_BEATS[k])} name={k}>
              <Comp />
            </Sequence>
          );
        })}
        {boundaries.map((f, i) => (
          <Sequence key={f} from={f - Math.round(ink / 2)} durationInFrames={ink} layout="none">
            <InkTransition start={0} duration={ink} dir={(['lr', 'rl', 'tb', 'lr', 'bt', 'tb'] as const)[i % 6]} seed={3 + i * 2} />
          </Sequence>
        ))}
        <Subtitles lines={VO_LINES_V} size={62} />
      </AbsoluteFill>
      <Soundtrack vertical />
    </FilmFinish>
  );
};
