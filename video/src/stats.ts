// SINGLE SOURCE OF TRUTH for every number/label shown in the trailer. The lead edits this right before render.
import { MANIFEST } from './generated/manifest';

export const STATS = {
  minutes: 45,
  agents: 13, // 1 Opus + 12 Sonnet
  leadModel: 'Claude Opus 5.5',
  agentModel: 'Claude Sonnet 5.5',
  tokens: 3_400_000,
  apis: 6,
  codexImages: 31,
  elevenLabsTracks: 9,
  elevenLabsCredits: 6750,
  atlasClips: 12,
  linesOfCode: 11685, // wc -l over src/**/*.js server/*.mjs
  liveUrl: 'gta-bogota.vercel.app',
  repo: 'github.com/zsoist/BOGTA',
};
void MANIFEST;

export interface Tool {
  name: string;
  sub: string;
  color: string;
}
export const TOOLS: Tool[] = [
  { name: 'CLAUDE CODE', sub: `${STATS.leadModel} lidera · ${STATS.agentModel} construye`, color: '#FF8A2B' },
  { name: 'CLAUDE API', sub: 'Diálogos de NPCs + locutor de radio', color: '#4DA3FF' },
  { name: 'CODEX · OPENAI', sub: `Todo el arte 2D · ${STATS.codexImages} imágenes`, color: '#E7E7EE' },
  { name: 'ELEVENLABS', sub: `Música + voces · ${STATS.elevenLabsTracks} pistas`, color: '#B07CFF' },
  { name: 'ATLAS CLOUD', sub: `Video con IA · ${STATS.atlasClips} clips`, color: '#2BD9C5' },
  { name: 'THREE.JS', sub: 'Mundo 3D en el navegador', color: '#6FD36F' },
  { name: 'REMOTION', sub: 'Este tráiler, en React', color: '#F5C518' },
  { name: 'VERCEL', sub: 'Despliegue en vivo', color: '#FFFFFF' },
  { name: 'GITHUB', sub: 'Código abierto', color: '#9AA0BE' },
];
