// Voice-over schedule. Lines come from docs/ELEVENLABS.md (video/audio/vo/vo-01..08.mp3, synced to public/vo/).
// Durations measured with ffprobe/silencedetect. Everything is placed in BEATS so it stays on the grid.
import { beatToFrame } from './beats';

export interface VoSub {
  text: string;
  /** seconds from the start of the audio line */
  at: number;
  until: number;
}
export interface VoLine {
  id: string;
  /** file under public/vo/ */
  file: string;
  startBeat: number;
  /** audio length in seconds */
  dur: number;
  subs: VoSub[];
  volume?: number;
}

export const VO_TEXT = {
  'vo-01': 'En Bogotá hay una sola ley.',
  'vo-02': 'Siempre llueve a las tres.',
  'vo-03': 'Más cerca de las estrellas... y del trancón.',
  'vo-04': 'Roba. Derrapa. Huye. Habla.',
  'vo-05': 'Cada bogotano tiene algo que decir.',
  'vo-06': 'Un líder. Siete agentes. Noventa minutos.',
  'vo-07': 'GTA Bogotá.',
  'vo-08': 'Hecho en el Claude Build Day Bogotá.',
} as const;

/** vo-06 has long dramatic pauses: words land at these offsets (s). */
export const VO06_CUES = { lider: 0.0, siete: 3.0, noventa: 6.35 } as const;
/** vo-04 words (cut into vo-04-1..4 by sync-assets). */
export const VO04_FILES = ['vo-04-1.mp3', 'vo-04-2.mp3', 'vo-04-3.mp3', 'vo-04-4.mp3'] as const;

// ---- Master (60 fps) ----
export const VO_LINES: VoLine[] = [
  { id: 'vo-01', file: 'vo-01.mp3', startBeat: 2, dur: 1.53, subs: [{ text: VO_TEXT['vo-01'], at: 0, until: 1.9 }] },
  { id: 'vo-02', file: 'vo-02.mp3', startBeat: 8, dur: 1.76, subs: [] },
  { id: 'vo-03', file: 'vo-03.mp3', startBeat: 13, dur: 2.6, subs: [{ text: VO_TEXT['vo-03'], at: 0, until: 3.0 }] },
  { id: 'vo-04a', file: 'vo-04-1.mp3', startBeat: 42, dur: 0.5, subs: [] },
  { id: 'vo-04b', file: 'vo-04-2.mp3', startBeat: 50, dur: 0.73, subs: [] },
  { id: 'vo-04c', file: 'vo-04-3.mp3', startBeat: 58, dur: 0.61, subs: [] },
  { id: 'vo-04d', file: 'vo-04-4.mp3', startBeat: 80, dur: 0.73, subs: [] },
  { id: 'vo-05', file: 'vo-05.mp3', startBeat: 95, dur: 2.18, subs: [{ text: VO_TEXT['vo-05'], at: 0, until: 2.6 }] },
  { id: 'vo-06', file: 'vo-06.mp3', startBeat: 105, dur: 7.8, subs: [] },
  { id: 'vo-07', file: 'vo-07.mp3', startBeat: 138, dur: 1.21, subs: [] },
  { id: 'vo-08', file: 'vo-08.mp3', startBeat: 141, dur: 2.37, subs: [] },
];

// ---- Vertical (30 fps, 50 beats) ----
export const VO_LINES_V: VoLine[] = [
  { id: 'vo-01', file: 'vo-01.mp3', startBeat: 1, dur: 1.53, subs: [{ text: VO_TEXT['vo-01'], at: 0, until: 1.9 }] },
  { id: 'vo-02', file: 'vo-02.mp3', startBeat: 4, dur: 1.76, subs: [] },
  { id: 'vo-04a', file: 'vo-04-1.mp3', startBeat: 18, dur: 0.5, subs: [] },
  { id: 'vo-04b', file: 'vo-04-2.mp3', startBeat: 22, dur: 0.73, subs: [] },
  { id: 'vo-04c', file: 'vo-04-3.mp3', startBeat: 26, dur: 0.61, subs: [] },
  { id: 'vo-05', file: 'vo-05.mp3', startBeat: 37.5, dur: 2.18, subs: [{ text: VO_TEXT['vo-05'], at: 0, until: 2.6 }] },
  { id: 'vo-07', file: 'vo-07.mp3', startBeat: 46, dur: 1.21, subs: [] },
  { id: 'vo-08', file: 'vo-08.mp3', startBeat: 47, dur: 2.37, subs: [] },
];

export const voStartFrame = (l: VoLine, fps: number) => beatToFrame(l.startBeat, fps);
