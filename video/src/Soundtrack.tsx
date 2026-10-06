import React from 'react';
import { Sequence, staticFile, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { has } from './lib/assets';
import { MUSIC_TRIM_SEC, beatToFrame } from './beats';
import { VO_LINES, VO_LINES_V, type VoLine } from './vo';
import { ENABLE_SFX, SFX_MASTER, SFX_VERTICAL, type SfxCue } from './sfx';

/**
 * Music (trimmed so the DROP sits on beat 40) with a VO-ducking volume curve + VO lines + SFX.
 * Everything is optional: missing files are simply skipped, so the trailer still renders silent.
 */
export const Soundtrack: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const lines: VoLine[] = vertical ? VO_LINES_V : VO_LINES;
  const sfx: SfxCue[] = vertical ? SFX_VERTICAL : SFX_MASTER;
  const hasMusic = has('music/trailer.mp3');

  const duckRanges = lines.map((l) => [beatToFrame(l.startBeat, fps) - 8, beatToFrame(l.startBeat, fps) + Math.round(l.dur * fps) + 14] as const);
  const volume = (f: number) => {
    const fadeIn = Math.min(1, f / (fps * 1.4));
    const fadeOut = Math.min(1, Math.max(0, (durationInFrames - f) / (fps * 1.5)));
    let duck = 1;
    for (const [a, b] of duckRanges) {
      if (f >= a && f <= b) {
        const edge = Math.min(1, Math.min(f - a, b - f) / 8);
        duck = Math.min(duck, 1 - 0.38 * edge);
      }
    }
    return 0.92 * fadeIn * fadeOut * duck;
  };

  return (
    <>
      {hasMusic && <Audio src={staticFile('music/trailer.mp3')} trimBefore={Math.round(MUSIC_TRIM_SEC * fps)} volume={volume} />}
      {lines.map((l) =>
        has(`vo/${l.file}`) ? (
          <Sequence key={l.id} from={beatToFrame(l.startBeat, fps)} durationInFrames={Math.ceil((l.dur + 0.5) * fps)} layout="none">
            <Audio src={staticFile(`vo/${l.file}`)} volume={l.volume ?? 1} />
          </Sequence>
        ) : null,
      )}
      {ENABLE_SFX &&
        sfx.map((c, i) =>
          has(`sfx/${c.file}`) ? (
            <Sequence key={`${c.file}${i}`} from={beatToFrame(c.beat, fps)} durationInFrames={Math.ceil((c.dur ?? 4) * fps)} layout="none">
              <Audio src={staticFile(`sfx/${c.file}`)} volume={c.vol} loop={c.loop} />
            </Sequence>
          ) : null,
        )}
    </>
  );
};
