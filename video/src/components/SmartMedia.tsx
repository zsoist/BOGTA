import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ramp } from '../lib/anim';
import { EZ } from '../theme';
import { Video } from '@remotion/media';
import { KenBurns } from './KenBurns';
import { ParallaxScene, hasParallax } from './ParallaxScene';
import { SLOT_BY_NAME, type CamState, type Fallback, type SlotName } from '../footage';
import { IMG, art, has } from '../lib/assets';
import { beatFrames } from '../beats';

export type MediaOrigin = 'footage' | 'ai' | 'parallax' | 'art' | 'still';
export interface ResolvedMedia {
  origin: MediaOrigin;
  /** staticFile url (video or image) */
  src?: string;
  fallback?: Fallback;
  crop?: Fallback['crop'];
}

const DEFAULT_CAM: { from: CamState; to: CamState } = { from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.12, x: 0, y: 0 } };

/**
 * Resolution order (decided at build time from the manifest — the browser cannot stat files):
 *   1. footage/<name>.mp4   real captured gameplay
 *   2. ai/<name>.mp4        Atlas Cloud AI clip (name or the slot's art panel)
 *   3. parallax / art/<name>.png + Ken Burns (Codex art)
 *   4. cover/loading still crops
 */
export const resolveMedia = (name: string): ResolvedMedia => {
  const slot = (SLOT_BY_NAME as Record<string, (typeof SLOT_BY_NAME)[SlotName]>)[name];
  const fb = slot?.fallback;
  if (has(`footage/${name}.mp4`)) return { origin: 'footage', src: staticFile(`footage/${name}.mp4`), fallback: fb };
  if (has(`ai/${name}.mp4`)) return { origin: 'ai', src: staticFile(`ai/${name}.mp4`), fallback: fb };
  if (fb?.art && has(`ai/${fb.art}.mp4`)) return { origin: 'ai', src: staticFile(`ai/${fb.art}.mp4`), fallback: fb };
  if (fb?.parallax && hasParallax()) return { origin: 'parallax', fallback: fb };
  const direct = art(name);
  if (direct) return { origin: 'art', src: direct, fallback: fb };
  const viaSlot = fb?.art ? art(fb.art) : undefined;
  if (viaSlot) return { origin: 'art', src: viaSlot, fallback: fb };
  if (fb) return { origin: 'still', src: IMG[(fb.img ?? 'cover') as keyof typeof IMG], fallback: fb, crop: fb.img ? undefined : fb.crop };
  return { origin: 'still', src: IMG.cover };
};

const AiClip: React.FC<{ src: string; duration: number; flip?: boolean; grade?: string }> = ({ src, duration, flip, grade }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, [0, duration], [0, 1], EZ.camera);
  const sc = 1.02 + 0.09 * p;
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${sc}) translateX(${(flip ? 1 : -1) * p * 1.2}%) ${flip ? 'scaleX(-1)' : ''}`, filter: grade }}>
        <Video src={src} muted loop objectFit="cover" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export interface SmartMediaProps {
  /** slot name (monserrate-dolly …), hero-0N, or an art key (coldopen, makingof, endcard, panel-01 …) */
  name: string;
  /** frames this clip is shown (drives the camera move) */
  duration: number;
  /** start offset into the source clip, in beats (real footage only) */
  trimBeats?: number;
  flip?: boolean;
  /** override the Ken Burns of the fallback */
  cam?: { from: CamState; to: CamState };
  grade?: string;
  handheld?: number;
}

const GRADE_VIDEO = 'contrast(1.06) saturate(1.1)';

/** Plays real footage if it exists; otherwise a styled, intentional fallback. */
export const SmartMedia: React.FC<SmartMediaProps> = ({ name, duration, trimBeats = 0, flip, cam, grade, handheld = 1.6 }) => {
  const { fps } = useVideoConfig();
  const m = resolveMedia(name);
  const fb = m.fallback;
  const from = cam?.from ?? fb?.from ?? DEFAULT_CAM.from;
  const to = cam?.to ?? fb?.to ?? DEFAULT_CAM.to;
  const g = [fb?.grade, grade].filter(Boolean).join(' ') || undefined;

  if (m.origin === 'footage') {
    return (
      <AbsoluteFill style={{ background: '#000', filter: [GRADE_VIDEO, grade].filter(Boolean).join(' '), transform: flip ? 'scaleX(-1)' : undefined }}>
        <Video src={m.src!} muted loop objectFit="cover" trimBefore={Math.round(trimBeats * beatFrames(fps))} />
      </AbsoluteFill>
    );
  }
  if (m.origin === 'ai') {
    // AI clips are short and generic: loop them and add a slow push-in so they feel directed.
    return <AiClip src={m.src!} duration={duration} flip={flip} grade={[GRADE_VIDEO, fb?.grade, grade].filter(Boolean).join(' ')} />;
  }
  if (m.origin === 'parallax') {
    return <ParallaxScene duration={duration} zoom={1.2} truck={flip ? 3 : -3} />;
  }
  return (
    <KenBurns
      src={m.src!}
      crop={m.origin === 'still' ? (m.crop as never) : undefined}
      from={from}
      to={to}
      duration={duration}
      focus={fb?.focus}
      grade={g}
      flip={flip}
      handheld={handheld}
    />
  );
};

/** Back-compat alias used by scenes: a footage slot. */
export const FootageClip: React.FC<Omit<SmartMediaProps, 'name'> & { slot: SlotName }> = ({ slot, ...rest }) => (
  <SmartMedia name={slot} {...rest} />
);
