// Beat grid for the trailer. ElevenLabs trailer music = 100 BPM.
// Every cut, slam and transition is scheduled in BEATS and converted to frames here, so the
// same timeline works at 60 fps (Trailer) and 30 fps (TrailerVertical). Nothing is hand-timed in frames.
export const BPM = 100;
export const MASTER_FPS = 60;
export const BEATS_PER_BAR = 4;

/**
 * trailer.mp3 analysis (ffmpeg astats, 10 ms RMS on the low band): kicks land at 25.11 + 0.6k s, i.e. the grid is
 * offset by 0.51 s (and the first 1.1 s is near-silent). Trimming 1.11 s from the head puts the DROP exactly on
 * beat 40 (24.0 s) = montage start, the BREAK (energy falls) around beat 102 (61.2 s) = making-of, and the final
 * CLIMAX hit on beat 134 (80.4 s) = hero burst. All cuts therefore land on kicks.
 */
export const MUSIC_TRIM_SEC = 1.11;
export const MUSIC_DROP_BEAT = 40;
export const MUSIC_BREAK_BEAT = 102;
export const MUSIC_CLIMAX_BEAT = 134;

export const beatFrames = (fps: number = MASTER_FPS) => (fps * 60) / BPM; // 36 @60fps, 18 @30fps
export const beatToFrame = (beats: number, fps: number = MASTER_FPS) => Math.round(beats * beatFrames(fps));
export const barToFrame = (bars: number, fps: number = MASTER_FPS) => beatToFrame(bars * BEATS_PER_BAR, fps);
export const frameToBeat = (frame: number, fps: number = MASTER_FPS) => frame / beatFrames(fps);
export const secondsToBeats = (s: number) => (s * BPM) / 60;

/** Frame numbers of every downbeat (bar line) in [0, totalBeats]. */
export const barMarkers = (totalBeats: number, fps: number = MASTER_FPS) => {
  const out: number[] = [];
  for (let b = 0; b <= totalBeats; b += BEATS_PER_BAR) out.push(beatToFrame(b, fps));
  return out;
};

/** 0..1 phase inside the current beat (1 = on the beat, decays). Handy for pulses. */
export const beatPulse = (frame: number, fps: number, decay = 5) => {
  const b = frameToBeat(frame, fps);
  const ph = b - Math.floor(b);
  return Math.exp(-ph * decay);
};

// ---- Master timeline (60 fps), in beats. 150 beats = 90 s ----
export const SCENE_BEATS = {
  coldOpen: 12, //  0:00.0 – 0:07.2
  city: 20, //      0:07.2 – 0:19.2
  title: 10, //     0:19.2 – 0:25.2  (collage builds on the riser, LOGO SLAM lands on the drop at beat 40 = 0:24.0)
  montage: 42, //   0:25.2 – 0:50.4
  npc: 20, //       0:50.4 – 1:02.4
  makingOf: 28, //  1:02.4 – 1:19.2
  finale: 18, //    1:19.2 – 1:30.0
} as const;

export type SceneName = keyof typeof SCENE_BEATS;
const ORDER: SceneName[] = ['coldOpen', 'city', 'title', 'montage', 'npc', 'makingOf', 'finale'];

export const SCENE_START_BEAT = (() => {
  let acc = 0;
  const o = {} as Record<SceneName, number>;
  for (const k of ORDER) {
    o[k] = acc;
    acc += SCENE_BEATS[k];
  }
  return o;
})();

export const TOTAL_BEATS = ORDER.reduce((a, k) => a + SCENE_BEATS[k], 0); // 150
export const TRAILER_FRAMES = beatToFrame(TOTAL_BEATS, MASTER_FPS); // 5400

export const sceneFrom = (s: SceneName, fps = MASTER_FPS) => beatToFrame(SCENE_START_BEAT[s], fps);
export const sceneDuration = (s: SceneName, fps = MASTER_FPS) => beatToFrame(SCENE_BEATS[s], fps);

// ---- Vertical cutdown (30 fps), 50 beats = 30 s ----
export const VERTICAL_FPS = 30;
export const VSCENE_BEATS = {
  coldOpen: 8,
  city: 6,
  title: 4,
  montage: 16,
  npc: 6,
  makingOf: 6,
  finale: 4,
} as const;
export const VSCENE_ORDER: SceneName[] = ORDER;
export const VTOTAL_BEATS = ORDER.reduce((a, k) => a + VSCENE_BEATS[k], 0); // 50
export const VTRAILER_FRAMES = beatToFrame(VTOTAL_BEATS, VERTICAL_FPS); // 900
export const vSceneFrom = (s: SceneName) => {
  let acc = 0;
  for (const k of ORDER) {
    if (k === s) break;
    acc += VSCENE_BEATS[k];
  }
  return beatToFrame(acc, VERTICAL_FPS);
};
