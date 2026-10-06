import { staticFile } from 'remotion';
import { MANIFEST } from '../generated/manifest';

const FILES = new Set<string>(MANIFEST.files);

/** Does a file exist in video/public/ (as of the last `npm run sync`)? */
export const has = (p: string) => FILES.has(p);

/** staticFile() for the first candidate that exists; falls back to the last candidate. */
export const pick = (...candidates: string[]) => staticFile(candidates.find(has) ?? candidates[candidates.length - 1]);

export const listPublic = (prefix: string, re?: RegExp) =>
  MANIFEST.files.filter((f) => f.startsWith(prefix) && (!re || re.test(f))).sort();

/** art/<name>.{png,jpg,jpeg,webp} produced by the art agent, or undefined. */
export const art = (name: string): string | undefined => {
  const hit = ['jpg', 'png', 'jpeg', 'webp'].map((e) => `art/${name}.${e}`).find(has);
  return hit ? staticFile(hit) : undefined;
};

/** Image keys used across scenes — each resolves to an existing file (primary path, then fallback copy). */
export const IMG = {
  cover: pick('cover.png', 'fallback/cover.png'),
  taxiNight: pick('loading/loading-1.jpg', 'fallback/loading-1.jpg'), // taxis + Colpatranca
  bus: pick('loading/loading-2.jpg', 'fallback/loading-2.jpg'), // TransMilagro in the rain
  moto: pick('loading/loading-3.jpg', 'fallback/loading-3.jpg'), // Rapidín + Monserrate sunset
  abuela: pick('portraits/abuela.png'),
  policia: pick('portraits/policia.png'),
  oficinista: pick('portraits/oficinista.png'),
  student: pick('portraits/student.png'),
  vendor: pick('portraits/vendor.png'),
  walker: pick('portraits/walker.png'),
} as const;
export type ImgKey = keyof typeof IMG;

/** Natural size of cover.png (for cropping panels out of it). */
export const COVER_SIZE = { w: 1672, h: 941 };
/** Named crops of the cover art (pixels in cover.png) — each is one panel of the original cover. */
export const COVER_CROPS = {
  hero: { x: 150, y: 0, w: 330, h: 345 }, // protagonist
  mural: { x: 0, y: 20, w: 190, h: 300 }, // mural girl
  bus: { x: 0, y: 340, w: 410, h: 240 }, // TransMilagro
  girl: { x: 0, y: 600, w: 490, h: 340 }, // mirador
  taxi: { x: 480, y: 500, w: 700, h: 441 }, // yellow taxi
  skyline: { x: 1010, y: 0, w: 662, h: 330 }, // Colpatranca + cerros
  moto: { x: 1180, y: 280, w: 492, h: 360 }, // delivery moto
  plaza: { x: 1170, y: 620, w: 502, h: 321 }, // Plaza de Bolívar
} as const;
export type CoverCrop = keyof typeof COVER_CROPS;
