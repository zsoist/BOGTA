import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { FilmFinish } from './components/FilmFinish';
import { InkTransition } from './components/InkTransition';
import { Subtitles } from './components/Subtitles';
import { Flash } from './components/Flash';
import { Soundtrack } from './Soundtrack';
import { ColdOpen } from './scenes/ColdOpen';
import { TheCity } from './scenes/TheCity';
import { TitleSlam } from './scenes/TitleSlam';
import { GameplayMontage, MONTAGE_CUT_BEATS } from './scenes/GameplayMontage';
import { NpcTalk } from './scenes/NpcTalk';
import { MakingOf } from './scenes/MakingOf';
import { Finale } from './scenes/Finale';
import { MASTER_FPS, SCENE_BEATS, SCENE_START_BEAT, beatToFrame, sceneDuration, sceneFrom } from './beats';
import { VO_LINES } from './vo';

const F = (beats: number) => beatToFrame(beats, MASTER_FPS);

/** Ink-wipe boundaries (scene start beats). title -> montage is a smash cut on the music's first hits. */
const INK: { beat: number; dir: 'lr' | 'rl' | 'tb' | 'bt'; seed: number }[] = [
  { beat: SCENE_START_BEAT.city, dir: 'lr', seed: 3 },
  { beat: SCENE_START_BEAT.title, dir: 'rl', seed: 5 },
  { beat: SCENE_START_BEAT.npc, dir: 'tb', seed: 7 },
  { beat: SCENE_START_BEAT.makingOf, dir: 'lr', seed: 9 },
  { beat: SCENE_START_BEAT.finale, dir: 'bt', seed: 11 },
];
const INK_FRAMES = F(0.85);

/** CA/shake impact frames (absolute): scene cuts, the drop, montage cuts, finale burst, VO slams. */
const impacts = (() => {
  const out: number[] = [];
  Object.keys(SCENE_START_BEAT).forEach((k) => out.push(F(SCENE_START_BEAT[k as keyof typeof SCENE_START_BEAT])));
  out.push(F(40)); // drop
  MONTAGE_CUT_BEATS.forEach((b) => out.push(F(SCENE_START_BEAT.montage + b)));
  for (let i = 0; i < 8; i++) out.push(F(SCENE_START_BEAT.finale + 2 + i * 0.5));
  out.push(F(SCENE_START_BEAT.finale + 6));
  return out;
})();

export const Trailer: React.FC = () => {
  return (
    <FilmFinish aberration={1.1} impacts={impacts} grain={0.15} vignette={0.5}>
      <AbsoluteFill style={{ background: '#000' }}>
        {(Object.keys(SCENE_BEATS) as (keyof typeof SCENE_BEATS)[]).map((k) => {
          const Comp = SCENES[k];
          return (
            <Sequence key={k} from={sceneFrom(k)} durationInFrames={sceneDuration(k)} name={k}>
              <Comp />
            </Sequence>
          );
        })}

        {/* smash cut: logo hold -> montage */}
        <Sequence from={sceneFrom('montage') - 2} durationInFrames={14} layout="none">
          <Flash hits={[2]} peak={0.9} decay={0.35} />
        </Sequence>

        {INK.map((x) => (
          <Sequence key={x.beat} from={F(x.beat) - Math.round(INK_FRAMES / 2)} durationInFrames={INK_FRAMES} layout="none">
            <InkTransition start={0} duration={INK_FRAMES} dir={x.dir} seed={x.seed} />
          </Sequence>
        ))}

        <Subtitles lines={VO_LINES} />
      </AbsoluteFill>
      <Soundtrack />
    </FilmFinish>
  );
};

const SCENES: Record<keyof typeof SCENE_BEATS, React.FC> = {
  coldOpen: () => <ColdOpen />,
  city: () => <TheCity />,
  title: () => <TitleSlam />,
  montage: () => <GameplayMontage />,
  npc: () => <NpcTalk />,
  makingOf: () => <MakingOf />,
  finale: () => <Finale />,
};
