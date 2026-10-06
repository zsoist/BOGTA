// Global game state (single source of truth for HUD, save, NPC context).
import { START_HOUR } from '../config.js';
import { events } from './events.js';

const plateDigit = Math.floor(Math.random() * 10);
export const state = {
  money: 50000,        // COP
  health: 100,         // player (on foot) health 0..100
  wanted: 0,           // 0..5 stars (owned by ai/police.js, mirrored here)
  hour: START_HOUR,    // 0..24 game clock
  day: 1,              // game day (odd/even matters for pico y placa)
  plate: `BOG-${100 + Math.floor(Math.random() * 899)}${plateDigit}`,
  plateDigit,
  raining: false,
  stationIndex: 1,     // RADIO_STATIONS index
  paused: false,
  dialogOpen: false,   // true while talking to an NPC (input goes to the chat box)
  aiEnabled: false,    // true when /api/health reports a Claude key
  started: false,
};

export function addMoney(delta, reason = '') {
  state.money = Math.max(0, Math.round(state.money + delta));
  events.emit('money:change', { amount: state.money, delta, reason });
}

export const formatCOP = (n) => '$ ' + Math.round(n).toLocaleString('es-CO');
