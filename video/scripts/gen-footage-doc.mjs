// Generates video/FOOTAGE.md from src/footage.ts + src/shotlist.ts (single source of truth).
// Run: npm run footage:doc   (Node >= 22 strips TS types natively)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOTS } from '../src/footage.ts';
import { CITY_SHOTS, MONTAGE_BLOCKS, HERO_SLOTS, HERO_BEATS_EACH } from '../src/shotlist.ts';
import { BPM, beatToFrame } from '../src/beats.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const F = (beats) => beatToFrame(beats, 60);
const uses = {};
const add = (slot, where, beats, trim = 0) => {
  (uses[slot] ||= []).push({ where, beats, trim, need: trim + beats });
};
CITY_SHOTS.forEach((s) => add(s.slot, 'Acto 2 · La ciudad', s.beats, s.trim ?? 0));
MONTAGE_BLOCKS.forEach((b) => b.shots.forEach((s) => add(s.slot, `Acto 4 · Montaje${b.word ? ' · ' + b.word : ''}`, s.beats, s.trim ?? 0)));
HERO_SLOTS.forEach((s) => add(s, 'Acto 7 · Ráfaga final', HERO_BEATS_EACH, 0));

const HANDLE = 30; // half a second of handles
let md = `# FOOTAGE.md — tomas que necesita el tráiler

Formato de cada toma: **\`video/public/footage/<slot>.mp4\`**, 1920×1080, **60 fps exactos** (captura determinista \`?capture=1\`), H.264, sin audio (se ignora).
Todo el tráiler va a **${BPM} BPM** → 1 beat = ${F(1)} frames, 1 compás = ${F(4)} frames. Los cortes caen en beats, así que **la duración usada empieza en el frame 0 de cada archivo** (más \`trim\` si el slot se reutiliza).
Graba **al menos la columna "Capturar"** (= frames usados + 30 frames de margen). Si el archivo es más corto, el tráiler lo repite en loop; si no existe, usa un Ken Burns de respaldo y se ve bien igual.
Después de dejar los archivos corre \`npm run sync\` (o cualquier render, ya lo hace solo).

_Generado por \`npm run footage:doc\` desde \`src/footage.ts\` + \`src/shotlist.ts\`._

| Slot (archivo) | Usado (frames) | Capturar (frames / seg) | Usos en el montaje | Movimiento de cámara |
|---|---|---|---|---|
`;
for (const s of SLOTS) {
  const u = uses[s.name] || [];
  const need = Math.max(0, ...u.map((x) => F(x.need)));
  const rec = need + HANDLE;
  const useTxt = u.map((x) => `${x.where} (${F(x.beats)}f${x.trim ? ', desde +' + F(x.trim) + 'f' : ''})`).join('<br>');
  md += `| \`${s.name}.mp4\`<br>_${s.title}_ | ${need} | **${rec}** f · ${(rec / 60).toFixed(1)} s | ${useTxt || '—'} | ${s.move} |\n`;
}
md += `
## Notas para el agente de captura
- **HUD:** tomas \`carjack\`, \`police-chase\`, \`npc-talk\`, \`hero-0N\` con HUD del juego encendido (el tráiler no dibuja HUD encima cuando existe el video). Las tomas de ciudad (\`monserrate-dolly\`, \`colpatria-night-orbit\`, \`caracas-chase\`, \`candelaria-crane\`) sin HUD y con DoF.
- **Cinemáticas 2.39:1:** el tráiler hace el letterbox, así que captura en 16:9 completo.
- **Hero shots:** cada uno se ve solo ${F(HERO_BEATS_EACH)} frames (0.3 s) pero capturar ${F(HERO_BEATS_EACH) + 30} frames deja margen para ajustar el corte.
- **Beat:** si puedes, haz que el momento de mayor impacto de cada toma (derrape, choque, salto) caiga en el frame ${F(2)} o ${F(3)} (beat 2 / beat 3) de la toma, porque es donde corta la música.
- Nombres exactos, minúsculas, \`.mp4\`. Copia a \`video/public/footage/\`.
`;
fs.writeFileSync(path.join(here, '../FOOTAGE.md'), md);
console.log('FOOTAGE.md written');
