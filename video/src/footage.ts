// Footage slots the capture agent fills into video/public/footage/<slot>.mp4 (1920x1080, 60 fps, no audio needed).
// Each slot has a styled fallback (Ken Burns of an existing still) so the trailer always looks intentional.
// Pure data (no imports) so scripts/gen-footage-doc.mjs can read it with Node's TS stripping.
export type SlotName =
  | 'monserrate-dolly'
  | 'colpatria-night-orbit'
  | 'caracas-chase'
  | 'candelaria-crane'
  | 'drift-lowangle'
  | 'carjack'
  | 'police-chase'
  | 'npc-talk'
  | 'chiva'
  | 'hero-01'
  | 'hero-02'
  | 'hero-03'
  | 'hero-04'
  | 'hero-05'
  | 'hero-06'
  | 'hero-07'
  | 'hero-08';

export type FallbackImg = 'cover' | 'taxiNight' | 'bus' | 'moto' | 'abuela' | 'policia';
export type CoverCropKey = 'hero' | 'mural' | 'bus' | 'girl' | 'taxi' | 'skyline' | 'moto' | 'plaza';

export interface CamState {
  /** zoom (1 = cover-fit) */
  s: number;
  /** pan in % of the frame (positive x = image moves right) */
  x: number;
  y: number;
  /** roll in degrees (Dutch tilt) */
  r?: number;
}

export interface Fallback {
  /** a full still, or a crop of the cover */
  img?: FallbackImg;
  crop?: CoverCropKey;
  /** art/<name> from the art agent has priority if it exists */
  art?: string;
  /** use the 3-layer ParallaxScene (art/parallax-*.png) as the fallback */
  parallax?: boolean;
  from: CamState;
  to: CamState;
  /** CSS filter grade */
  grade?: string;
  /** focal point of the still, in % (object-position) */
  focus?: [number, number];
}

export interface Slot {
  name: SlotName;
  /** shot title for the doc */
  title: string;
  /** desired camera move, written for the capture agent */
  move: string;
  fallback: Fallback;
}

export const SLOTS: Slot[] = [
  {
    name: 'monserrate-dolly',
    title: 'Monserrate al amanecer',
    move: 'Dolly-in lento hacia el santuario blanco de Monserrate desde la Candelaria (cámara baja, 1.5 m, empuja 25 m hacia adelante). Hora 17:30, cielo naranja, sin HUD, DoF (BokehPass) con foco en el santuario.',
    fallback: { parallax: true, art: 'panel-06', img: 'moto', from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.22, x: -3, y: 2 }, focus: [50, 40] },
  },
  {
    name: 'colpatria-night-orbit',
    title: 'Colpatranca de noche',
    move: 'Órbita de 70° alrededor de la Torre Colpatranca con los LEDs en bandera, cámara a 60 m de altura, mirando hacia arriba 15°, llovizna. Sin HUD.',
    fallback: { art: 'panel-07', img: 'taxiNight', from: { s: 1.22, x: 3, y: 6, r: -1.5 }, to: { s: 1.0, x: -2, y: -4, r: 0.5 }, focus: [50, 40] },
  },
  {
    name: 'caracas-chase',
    title: 'TransMilagro bajo la lluvia',
    move: 'Cámara de persecución baja, 3 m detrás del taxi robado, corriendo por la Avenida Caracas junto al TransMilagro. Lluvia fuerte, 15:00, charcos reflejando. Con HUD apagado, FOV 80.',
    fallback: { art: 'panel-02', img: 'bus', from: { s: 1.12, x: 4, y: 1 }, to: { s: 1.0, x: -4, y: 0 }, focus: [50, 50] },
  },
  {
    name: 'candelaria-crane',
    title: 'La Candelaria (crane)',
    move: 'Crane que baja desde 25 m hasta 2 m sobre las casitas coloniales de La Candelaria, mirando hacia la Plaza de Bolívar, atardecer. Sin HUD.',
    fallback: { img: 'moto', from: { s: 1.3, x: -2, y: 8 }, to: { s: 1.02, x: 2, y: -2 }, focus: [60, 60], grade: 'saturate(1.15)' },
  },
  {
    name: 'drift-lowangle',
    title: 'Drift en la Caracas',
    move: 'Ángulo bajo (cámara a 0.4 m del piso, lateral), taxi derrapando de derecha a izquierda con humo de llantas y marcas, lluvia. Pasa a un metro de cámara. Sin HUD.',
    fallback: { art: 'panel-01', crop: 'taxi', from: { s: 1.0, x: 6, y: 4, r: 2 }, to: { s: 1.16, x: -6, y: -4, r: -2 }, focus: [50, 62] },
  },
  {
    name: 'carjack',
    title: 'Robo del taxi — "¡Qué pena, veci!"',
    move: 'Cámara tercera persona sobre el hombro, jugador corre al taxi, el conductor se baja indignado, el jugador entra y arranca. Plano medio, con HUD del juego activado.',
    fallback: { img: 'taxiNight', from: { s: 1.04, x: 4, y: 0 }, to: { s: 1.3, x: 6, y: -2 }, focus: [24, 62] },
  },
  {
    name: 'police-chase',
    title: 'Persecución con sirenas',
    move: 'Cámara trasera estándar del juego durante persecución a 3 estrellas: patrullas con sirenas detrás, Torre Colpatranca al fondo, derrapes en esquinas, el jugador es rodeado y se detiene (busted). 8+ segundos, HUD del juego activado.',
    fallback: { art: 'panel-04', img: 'taxiNight', from: { s: 1.1, x: -4, y: 2, r: 1 }, to: { s: 1.0, x: 3, y: -2, r: -1 }, focus: [50, 55] },
  },
  {
    name: 'npc-talk',
    title: 'Hablando con Doña Gloria',
    move: 'Cámara de diálogo: plano medio de Doña Gloria (vendedora de empanadas) con el jugador de espaldas a cuadro, lluvia, La Candelaria. Empuje lento. HUD y panel de diálogo del juego activados.',
    fallback: { art: 'panel-03', img: 'abuela', from: { s: 1.08, x: -3, y: 4 }, to: { s: 1.2, x: -6, y: -1 }, focus: [72, 32] },
  },
  {
    name: 'chiva',
    title: 'Chiva rumbera / pico y placa',
    move: 'Cámara lateral paralela a la chiva rumbera (colores, luces) en travelling a su velocidad, 5 m de distancia, y luego el retén de "pico y placa" en un cruce. Atardecer.',
    fallback: { art: 'panel-05', img: 'moto', from: { s: 1.15, x: 5, y: 3 }, to: { s: 1.0, x: -3, y: -2 }, focus: [50, 55] },
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map<Slot>((n) => ({
    name: `hero-0${n}` as SlotName,
    title: `Hero shot ${n}`,
    move: [
      'Plano bajo del taxi saltando una loma, polvo y lluvia.',
      'Moto Rapidín zigzagueando entre carros, cámara lateral.',
      'Estrellas de búsqueda en el HUD y patrulla cruzando frente a cámara.',
      'TransMilagro pasando frente a cámara, whip.',
      'Plaza de Bolívar con palomas levantando vuelo, crane bajo.',
      'Drift 360° en rotonda, cámara cenital 45°.',
      'Chiva rumbera de frente, luces encendidas.',
      'Plano final: taxi frente a la Santo Tomás con el logo del Build Day, cámara hacia atrás.',
    ][n - 1],
    fallback: [
      { art: 'panel-01', img: 'taxiNight', from: { s: 1.2, x: 4, y: 0 }, to: { s: 1.05, x: -4, y: 0 }, focus: [50, 60] },
      { art: 'panel-08', crop: 'moto', from: { s: 1.0, x: -4, y: 0 }, to: { s: 1.2, x: 4, y: 0 }, focus: [50, 55] },
      { art: 'panel-04', crop: 'hero', from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.15, x: 0, y: 3 }, focus: [60, 55] },
      { art: 'panel-02', img: 'bus', from: { s: 1.2, x: 6, y: 0 }, to: { s: 1.0, x: -4, y: 0 }, focus: [50, 55] },
      { art: 'panel-06', crop: 'plaza', from: { s: 1.2, x: 0, y: 6 }, to: { s: 1.0, x: 0, y: -2 }, focus: [50, 40] },
      { art: 'panel-07', crop: 'taxi', from: { s: 1.15, x: -4, y: 0, r: 3 }, to: { s: 1.0, x: 4, y: 0, r: -2 }, focus: [50, 40] },
      { art: 'panel-05', img: 'moto', from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.2, x: -4, y: 0 }, focus: [50, 55] },
      { art: 'panel-03', crop: 'skyline', from: { s: 1.0, x: 3, y: 0 }, to: { s: 1.2, x: -3, y: 0 }, focus: [50, 30] },
    ][n - 1] as Fallback,
  })),
];

export const SLOT_BY_NAME = Object.fromEntries(SLOTS.map((s) => [s.name, s])) as Record<SlotName, Slot>;
