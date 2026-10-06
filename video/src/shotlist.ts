// Edit decisions in BEATS. Pure data (no imports) — also read by scripts/gen-footage-doc.mjs.
import type { SlotName } from './footage';

export interface Shot {
  slot: SlotName;
  /** length on screen, in beats */
  beats: number;
  /** where in the source clip to start, in beats (60 fps source) */
  trim?: number;
  /** extra label shown in the lower third (city) */
  title?: string;
  sub?: string;
  /** mirror the fallback camera move for variety */
  flip?: boolean;
  /** override the fallback "focus" or crop variant index */
  variant?: number;
}

// ---- Act 2: La ciudad (20 beats) ----
export const CITY_SHOTS: Shot[] = [
  { slot: 'monserrate-dolly', beats: 5, title: 'MONSERRATE', sub: 'CERROS ORIENTALES · 3.152 M' },
  { slot: 'colpatria-night-orbit', beats: 5, title: 'TORRE COLPATRANCA', sub: 'CENTRO INTERNACIONAL · 196 M' },
  { slot: 'caracas-chase', beats: 5, title: 'AVENIDA CARACAS', sub: 'TRANSMILAGRO · 15:00 · LLOVIENDO' },
  { slot: 'candelaria-crane', beats: 5, title: 'LA CANDELARIA', sub: 'CENTRO HISTÓRICO · DESDE 1538' },
];

// ---- Act 4: Montaje de gameplay (42 beats). Words slam at the start of each block. ----
export type MontageWord = 'ROBA' | 'DERRAPA' | 'HUYE' | 'HABLA' | null;
export interface MontageBlock {
  word: MontageWord;
  /** tag line under the word */
  tag?: string;
  shots: Shot[];
}
export const MONTAGE_BLOCKS: MontageBlock[] = [
  {
    word: 'ROBA',
    tag: '¡QUÉ PENA, VECI!',
    shots: [
      { slot: 'carjack', beats: 4, trim: 0 },
      { slot: 'carjack', beats: 2, trim: 4, flip: true },
      { slot: 'caracas-chase', beats: 2, trim: 0, variant: 1 },
    ],
  },
  {
    word: 'DERRAPA',
    tag: 'AVENIDA CARACAS',
    shots: [
      { slot: 'drift-lowangle', beats: 4, trim: 0 },
      { slot: 'caracas-chase', beats: 2, trim: 2, flip: true, variant: 2 },
      { slot: 'drift-lowangle', beats: 2, trim: 4, flip: true },
    ],
  },
  {
    word: 'HUYE',
    tag: 'NIVEL DE BÚSQUEDA',
    shots: [
      { slot: 'police-chase', beats: 3, trim: 0 },
      { slot: 'police-chase', beats: 3, trim: 3, flip: true },
      { slot: 'police-chase', beats: 2, trim: 6 },
      { slot: 'police-chase', beats: 2, trim: 8, flip: true },
    ],
  },
  {
    // BustedCard over the final police-chase beat
    word: null,
    shots: [{ slot: 'police-chase', beats: 4, trim: 10 }],
  },
  {
    word: null,
    tag: 'PICO Y PLACA · PLACA TERMINADA EN 7',
    shots: [
      { slot: 'chiva', beats: 4, trim: 0 },
      { slot: 'chiva', beats: 2, trim: 4, flip: true },
      { slot: 'chiva', beats: 2, trim: 6, variant: 1 },
    ],
  },
  {
    word: 'HABLA',
    tag: 'PRESIONA E',
    shots: [{ slot: 'npc-talk', beats: 4, trim: 0 }],
  },
];

// ---- Act 7: ráfaga de 8 hero shots (cada uno = 0.5 beat = una corchea) ----
export const HERO_SLOTS: SlotName[] = ['hero-01', 'hero-02', 'hero-03', 'hero-04', 'hero-05', 'hero-06', 'hero-07', 'hero-08'];
export const HERO_BEATS_EACH = 0.5;

// Vertical cutdown shots (30 fps). Same slots, shorter.
export const VERT_CITY_SHOTS: Shot[] = [
  { slot: 'monserrate-dolly', beats: 3, title: 'MONSERRATE' },
  { slot: 'colpatria-night-orbit', beats: 3, title: 'TORRE COLPATRANCA' },
];
export const VERT_MONTAGE: { word: MontageWord; shot: Shot; tag?: string }[] = [
  { word: 'ROBA', shot: { slot: 'carjack', beats: 4, trim: 0 }, tag: '¡QUÉ PENA, VECI!' },
  { word: 'DERRAPA', shot: { slot: 'drift-lowangle', beats: 4, trim: 0 }, tag: 'AVENIDA CARACAS' },
  { word: 'HUYE', shot: { slot: 'police-chase', beats: 4, trim: 0 }, tag: 'NIVEL DE BÚSQUEDA' },
  { word: null, shot: { slot: 'police-chase', beats: 4, trim: 4 } },
];
