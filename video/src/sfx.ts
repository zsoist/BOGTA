// Sparse SFX cues from assets/sfx (ElevenLabs). Beats are absolute (master timeline); the vertical cut remaps them.
// Set ENABLE_SFX=false if the audio agent bakes SFX into the final mix.
export const ENABLE_SFX = true;

export interface SfxCue {
  file: string; // under public/sfx
  beat: number;
  vol: number;
  /** seconds to play (trimmed); undefined = whole file */
  dur?: number;
  loop?: boolean;
}

export const SFX_MASTER: SfxCue[] = [
  { file: 'rain.mp3', beat: 0, vol: 0.32, dur: 7.2, loop: true },
  { file: 'whoosh.mp3', beat: 11.75, vol: 0.5 },
  { file: 'whoosh.mp3', beat: 16.75, vol: 0.35 },
  { file: 'whoosh.mp3', beat: 21.75, vol: 0.35 },
  { file: 'whoosh.mp3', beat: 26.75, vol: 0.35 },
  { file: 'whoosh.mp3', beat: 31.75, vol: 0.5 },
  { file: 'horn.mp3', beat: 44, vol: 0.4 },
  { file: 'siren.mp3', beat: 58, vol: 0.28, dur: 9 },
  { file: 'crash.mp3', beat: 68, vol: 0.6 },
  { file: 'whoosh.mp3', beat: 83.75, vol: 0.5 },
  { file: 'whoosh.mp3', beat: 95, vol: 0.4 },
  { file: 'whoosh.mp3', beat: 103.75, vol: 0.5 },
  { file: 'cash.mp3', beat: 122, vol: 0.5 },
  { file: 'whoosh.mp3', beat: 131.75, vol: 0.5 },
  { file: 'crash.mp3', beat: 138, vol: 0.45 },
];

export const SFX_VERTICAL: SfxCue[] = [
  { file: 'rain.mp3', beat: 0, vol: 0.3, dur: 4.8, loop: true },
  { file: 'whoosh.mp3', beat: 7.75, vol: 0.5 },
  { file: 'whoosh.mp3', beat: 13.75, vol: 0.5 },
  { file: 'horn.mp3', beat: 18.5, vol: 0.4 },
  { file: 'siren.mp3', beat: 26, vol: 0.28, dur: 5 },
  { file: 'crash.mp3', beat: 30, vol: 0.55 },
  { file: 'whoosh.mp3', beat: 33.75, vol: 0.5 },
  { file: 'whoosh.mp3', beat: 45.75, vol: 0.5 },
];
