// Keyboard input. input.down('KeyW'), input.pressed('KeyF') (true only on the frame it went down).
// Gameplay reads are suppressed while state.dialogOpen (typing into the NPC chat).
import { state } from './state.js';

const down = new Set();
const pressedThisFrame = new Set();
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

addEventListener('keydown', (e) => {
  if (state.dialogOpen) return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (!down.has(e.code)) pressedThisFrame.add(e.code);
  down.add(e.code);
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

export const input = {
  down: (code) => !state.dialogOpen && down.has(code),
  pressed: (code) => !state.dialogOpen && pressedThisFrame.has(code),
  // Axes in [-1, 1]
  get throttle() { return (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0); },
  get steer() { return (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0) - (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0); }, // +1 = left
  get handbrake() { return this.down('Space'); },
  get run() { return this.down('ShiftLeft') || this.down('ShiftRight'); },
  endFrame() { pressedThisFrame.clear(); },
  clear() { down.clear(); pressedThisFrame.clear(); },
};
