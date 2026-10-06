// Browser client for the Claude-powered API. Never throws: falls back to offline lines so the game stays fun without a key.
import { offlineNpcReply as engineReply, npcGreeting, quickReplies, beginConversation, usedIntents, nearestPlaceName, observeTurn } from './offline.js';
export { npcGreeting, quickReplies, beginConversation, usedIntents };
const TIMEOUT_MS = 20000;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Offline NPC reply that answers what the player said. @returns {{reply:string, intent:string, action?:object}} */
export function offlineNpcReply(ped = {}, context = {}, message = '') { return engineReply(ped, context, message); }
const lastPicked = new Map();
function pickFresh(key, arr) {
  let line = pick(arr);
  for (let i = 0; i < 3 && line === lastPicked.get(key); i++) line = pick(arr);
  lastPicked.set(key, line);
  return line;
}

// ---------- offline NPC dialogue: see the intent engine below ----------
const RADIO_LINES = {
  trancon: [
    'Trancón al Aire: la Séptima está detenida, la Caracas también, y mi paciencia, ni se diga.',
    'Atención: un hueco en la Calle 72 se reportó oficialmente como lago. Tapahuecos ya viene... en 2031.',
    'Pico y placa hoy para placas pares. Los impares, ¡disfruten el trancón con calma!',
    'El TransMilagro va tan lleno que el reporte de pasajeros dice "sí".',
    'Última hora: llueve a las tres. Sí, otra vez. No se sorprenda, sumercé.',
    'Reporte vial: un taxi y una buseta discuten por un carril. Van 40 minutos y nadie cede.',
  ],
  tropicombo: [
    '¡Tropicombo 98.7! Cumbia pa\' que se le mueva hasta la ruana, ¡que siga la rumba!',
    'Esto es Tropicombo, la emisora que le pone sabor a su trancón. ¡Dale que dale!',
  ],
  acordeon: [
    'Vallenato Stereo, El Acordeón Llorón: para que llore con ganas, pero de la emoción.',
    'Sigue el acordeón, sigue la parranda, y siga usted que el semáforo ya se puso en verde.',
  ],
  perreadera: [
    '¡La Perreadera FM! Dembow pa\' que el carro tiemble, pero no se choque, ¿ah?',
    'Suba el volumen, baje el vidrio y que el trancón se convierta en discoteca.',
  ],
  champeta: [
    '¡Champeta Picó Radio! Desde la costa pa\' los rolos con ganas de bailar.',
    'Esto es puro picó, mi gente. Que se mueva todo menos el semáforo.',
  ],
  _default: [
    'Usted está escuchando la mejor radio de la ciudad. Sigan sintonizados, ¡no se vayan!',
    'Bogotá, ciudad de montañas, trancones y buena música. Seguimos al aire.',
  ],
};

export function offlineRadioLine(station = {}) {
  const id = station.id && RADIO_LINES[station.id] ? station.id : station.genre === 'talk' ? 'trancon' : '_default';
  return pickFresh(`radio-${id}`, RADIO_LINES[id]);
}

// ---------- fetch helper ----------
async function post(url, payload, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- public API ----------
export async function checkAI() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch('/api/health', { signal: ctrl.signal });
    const d = await res.json();
    return { enabled: !!d.enabled, model: d.model || null, tts: !!d.tts };
  } catch {
    return { enabled: false, model: null, tts: false };
  } finally {
    clearTimeout(timer);
  }
}

// The server only keeps a few context fields: fold the nearest landmark into `district` so Claude can give real directions.
function serverContext(c = {}) {
  const near = nearestPlaceName(c);
  return { district: near && c.district ? `${c.district} (cerca de ${near})` : c.district, hour: c.hour, raining: c.raining, wanted: c.wanted, money: c.money, vehicle: c.vehicle };
}

/** @returns {Promise<{reply: string, offline?: boolean, intent?: string, action?: object}>} */
export async function npcTalk({ ped = {}, history = [], message = '', context = {} } = {}) {
  try {
    const { data } = await post('/api/npc', {
      ped: { name: ped.name, kind: ped.kind, persona: ped.persona },
      history: history.slice(-12),
      message: String(message).slice(0, 400),
      context: serverContext(context),
    });
    if (data && typeof data.reply === 'string' && data.reply.trim() && !data.offline) {
      let action = null;
      try { action = observeTurn(ped, context, message); } catch { /* optional */ }
      return { reply: data.reply.trim(), action };
    }
  } catch { /* timeout / network → fallback */ }
  const o = engineReply(ped, context, message);
  return { reply: o.reply, offline: true, intent: o.intent, action: o.action };
}

/** @returns {Promise<{line: string, offline?: boolean}>} */
export async function radioDJ({ station = {}, context = {} } = {}) {
  try {
    const { data } = await post('/api/radio', { station: { id: station.id, name: station.name, genre: station.genre }, context });
    if (data && typeof data.line === 'string' && data.line.trim() && !data.offline) return { line: data.line.trim() };
  } catch { /* fallback */ }
  return { line: offlineRadioLine(station), offline: true };
}
