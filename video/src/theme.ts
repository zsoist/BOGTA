import { Easing } from 'remotion';
import { loadFont as loadBangers } from '@remotion/google-fonts/Bangers';
import { loadFont as loadBebas } from '@remotion/google-fonts/BebasNeue';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadLogo } from '@remotion/google-fonts/BowlbyOne';

export const C = {
  ink: '#0B0B0F',
  ink2: '#14141C',
  ink3: '#1C1C27',
  green: '#6FD36F', // GTA "plata en verde"
  greenDark: '#2F7A3A',
  gold: '#F5C518',
  white: '#F5F2EA',
  mute: '#9A9AA8',
  // Colombian flag — transitions only
  flagY: '#FCD116',
  flagB: '#003893',
  flagR: '#CE1126',
  // agent graph
  opus: '#FF8A2B',
  sonnet: '#4DA3FF',
  codex: '#E7E7EE',
  eleven: '#B07CFF',
  police: '#FF2D3D',
  policeB: '#2D6BFF',
} as const;

const bangers = loadBangers('normal', { subsets: ['latin'] });
const bebas = loadBebas('normal', { subsets: ['latin'] });
const inter = loadInter('normal', { subsets: ['latin'], weights: ['400', '500', '600', '800'] });
const mono = loadMono('normal', { subsets: ['latin'], weights: ['400', '700'] });
const logo = loadLogo('normal', { subsets: ['latin'] });

export const FONT = {
  slam: `${bangers.fontFamily}, Impact, sans-serif`, // kinetic slams
  title: `${bebas.fontFamily}, Impact, sans-serif`, // titles, subtitles, lower thirds
  ui: `${inter.fontFamily}, system-ui, sans-serif`, // UI + data
  mono: `${mono.fontFamily}, ui-monospace, monospace`, // code
  logo: `${logo.fontFamily}, Impact, sans-serif`, // GTA-style logo
};

/** Nothing is linear: every motion uses one of these curves. */
export const EZ = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // expo-out: fast start, long settle
  in: Easing.bezier(0.7, 0, 0.84, 0),
  inOut: Easing.bezier(0.76, 0, 0.24, 1),
  slam: Easing.bezier(0.2, 1.45, 0.32, 1), // overshoot
  whip: Easing.bezier(0.9, 0, 0.1, 1), // brutal whip pan
  soft: Easing.bezier(0.33, 0, 0.1, 1),
  camera: Easing.bezier(0.45, 0.05, 0.25, 1), // slow cinematic drift
};

/** Spring presets (custom damping/stiffness, never default). */
export const SPR = {
  slam: { damping: 11, stiffness: 320, mass: 0.7 },
  snap: { damping: 18, stiffness: 340, mass: 0.6 },
  pop: { damping: 13, stiffness: 220, mass: 0.8 },
  soft: { damping: 22, stiffness: 110, mass: 1 },
  heavy: { damping: 16, stiffness: 160, mass: 1.4 },
} as const;
