import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { beatFrames, beatToFrame } from '../beats';
import { EZ } from '../theme';

type Ease = (t: number) => number;

/** Clamped interpolate with an easing curve (default expo-out). */
export const ramp = (frame: number, input: [number, number], output: [number, number], easing: Ease = EZ.out) =>
  interpolate(frame, input, output, { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic noise-free wobble: decaying sine. Great for impact shakes. */
export const shake = (frame: number, hitFrame: number, amp: number, decay = 0.18, seed = 1) => {
  const t = frame - hitFrame;
  if (t < 0) return { x: 0, y: 0, r: 0 };
  const env = amp * Math.exp(-t * decay);
  return {
    x: (random(`sx${seed}${Math.floor(t)}`) - 0.5) * 2 * env,
    y: (random(`sy${seed}${Math.floor(t)}`) - 0.5) * 2 * env,
    r: (random(`sr${seed}${Math.floor(t)}`) - 0.5) * 0.4 * env,
  };
};

/** Combined shake for several hit frames. */
export const shakeMulti = (frame: number, hits: number[], amp: number, decay = 0.18) => {
  let x = 0,
    y = 0,
    r = 0;
  hits.forEach((h, i) => {
    const s = shake(frame, h, amp, decay, i + 1);
    x += s.x;
    y += s.y;
    r += s.r;
  });
  return { x, y, r };
};

/** 0..1 flash envelope: sum of exponential decays at hit frames. */
export const flash = (frame: number, hits: number[], decay = 0.25) => {
  let v = 0;
  for (const h of hits) {
    const t = frame - h;
    if (t >= 0) v += Math.exp(-t * decay);
  }
  return Math.min(1, v);
};

/** Beat-based time helpers: schedule everything in beats, get frames out. */
export const useBeats = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const bf = beatFrames(fps);
  return {
    frame,
    fps,
    width,
    height,
    durationInFrames,
    bf,
    /** beats -> frames */
    b: (beats: number) => beatToFrame(beats, fps),
    /** current time in beats (fractional) */
    beat: frame / bf,
    /** 1 on the beat, exponentially decays through it */
    pulse: (decay = 5) => {
      const bt = frame / bf;
      return Math.exp(-(bt - Math.floor(bt)) * decay);
    },
    /** 1 on each 8th note */
    pulse8: (decay = 7) => {
      const bt = (frame / bf) * 2;
      return Math.exp(-(bt - Math.floor(bt)) * decay);
    },
    /** progress 0..1 of a beat-range */
    prog: (fromBeat: number, toBeat: number, ease: Ease = EZ.out) =>
      ramp(frame, [beatToFrame(fromBeat, fps), beatToFrame(toBeat, fps)], [0, 1], ease),
    /** spring started at a beat */
    spr: (atBeat: number, config: { damping: number; stiffness: number; mass: number }, durationBeats?: number) =>
      spring({
        frame: frame - beatToFrame(atBeat, fps),
        fps,
        config,
        durationInFrames: durationBeats ? beatToFrame(durationBeats, fps) : undefined,
      }),
  };
};

/** Scale a pixel size designed for 1920x1080 to the actual canvas (uses the smaller-relative axis). */
export const useU = () => {
  const { width, height } = useVideoConfig();
  return Math.min(width / 1920, height / 1080) * (height > width ? 1.0 : 1);
};
