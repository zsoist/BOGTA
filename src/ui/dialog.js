// NPC chat panel: portrait, typewriter replies, quick-reply chips, Claude/offline badge, optional voice.
import { events } from '../core/events.js';
import { state } from '../core/state.js';
import { input } from '../core/input.js';
import { districtAt } from '../config.js';
import { injectStyles, h, kindInfo } from './util.js';

const CHIPS = ['¿Qué más, veci?', '¿Cuánto vale?', '¿Dónde queda Monserrate?'];
const GREETINGS = {
  vendor: ['¡A la orden, a la orden! ¿Qué se le ofrece, veci?', '¿Le provoca algo, sumercé? ¡Todo fresquecito!'],
  walker: ['¿Qué más, parce? ¿Todo bien por ahí?', 'Ey, qué hubo. Ando con afán, pero dígame.'],
  student: ['Quiubo, parce. Estoy en parciales, así que hable rápido.', '¡Ey! ¿Tiene un tinto para este pobre estudiante?'],
  oficinista: ['Buenas. Tengo reunión en diez minutos, ¿en qué le ayudo?', 'Dígame, que el jefe me está mirando.'],
  abuela: ['Ay, mijito, ¿cómo está? ¿Ya comió?', 'Bendito sea Dios, qué educado. ¿Qué necesita, mi amor?'],
  policia: ['Buenas, ciudadano. Circule tranquilo, ¿sí?', 'Cualquier cosa me avisa. Y respete el pico y placa.'],
};
const OFFLINE = {
  vendor: ['Eso le sale baratico, sumercé. ¡Lleve, lleve!', 'Hoy ando de buenas, le dejo dos por mil.'],
  walker: ['Uy, no sé, parce. ¡Esta ciudad es una locura!', 'Hágale pues, y ojo con los huecos.'],
  student: ['Eso suena a parcial sorpresa, qué mamera.', 'Ni idea, parce, yo solo vine por el wifi.'],
  oficinista: ['Eso lo vemos en la reunión de las tres. Si no llueve.', 'Mmm, tendría que consultarlo con mi jefe.'],
  abuela: ['Ay, mijo, en mis tiempos eso no pasaba.', 'Tómese una aguapanelita y se le pasa.'],
  policia: ['Siga derecho y no se meta en problemas, ¿oyó?', 'Eso no es asunto mío... pero juicioso, ¿sí?'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let netMod = null;
async function getNet() {
  if (netMod) return netMod;
  try { netMod = await import('../net/claude.js'); } catch (err) { console.warn('[dialog] net/claude.js unavailable, using offline lines', err); netMod = {}; }
  return netMod;
}
let audioMod = null;
async function speakLine(text, kind) {
  try {
    if (!audioMod) audioMod = await import('../audio/audio.js');
    if (typeof audioMod.speak === 'function') { audioMod.speak(text, kind); return; }
  } catch { /* fall through to browser TTS */ }
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = speechSynthesis.getVoices().find((x) => /es[-_]CO/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^es/i.test(x.lang));
    if (v) u.voice = v;
    u.lang = v?.lang || 'es-CO';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* optional */ }
}
function stopSpeech() {
  try { audioMod?.stopSpeaking?.(); audioMod?.stopSpeak?.(); } catch { /* optional */ }
  try { window.speechSynthesis?.cancel(); } catch { /* optional */ }
}

export function createDialog(root) {
  injectStyles();

  // ---------- DOM ----------
  const portraitImg = h('img', { alt: '', draggable: 'false' });
  const emo = h('span', { class: 'emo' });
  const portrait = h('div', { class: 'dlg-portrait' }, [emo, portraitImg]);
  const nameEl = h('h2', { class: 'dlg-name', id: 'gtab-dlg-name' });
  const kindBadge = h('span', { class: 'dlg-badge kind' });
  const aiBadge = h('span', { class: 'dlg-badge ai off', text: 'offline' });
  const ttsBtn = h('button', { class: 'dlg-ib', type: 'button', 'aria-pressed': 'true', title: 'Voz del personaje', text: '🔊' });
  const closeBtn = h('button', { class: 'dlg-ib', type: 'button', 'aria-label': 'Cerrar conversación (Esc)', title: 'Cerrar (Esc)', text: '✕' });
  const log = h('div', { class: 'dlg-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversación' });
  const typing = h('div', { class: 'dlg-typing', 'aria-hidden': 'true' }, ['escribiendo', h('i'), h('i'), h('i')]);
  const chipsEl = h('div', { class: 'dlg-chips' });
  const inputEl = h('input', { class: 'dlg-input', type: 'text', maxlength: '200', autocomplete: 'off', spellcheck: 'false', placeholder: 'Escríbele algo…', 'aria-label': 'Tu mensaje' });
  const sendBtn = h('button', { class: 'dlg-send', type: 'submit', text: 'ENVIAR' });
  const form = h('form', { class: 'dlg-form' }, [inputEl, sendBtn]);
  const panel = h('aside', { class: 'dlg', role: 'dialog', 'aria-labelledby': 'gtab-dlg-name', 'aria-modal': 'false' }, [
    h('div', { class: 'dlg-head' }, [
      portrait,
      h('div', { class: 'dlg-who' }, [nameEl, h('div', { class: 'dlg-badges' }, [kindBadge, aiBadge])]),
      h('div', { class: 'dlg-btns' }, [ttsBtn, closeBtn]),
    ]),
    log, chipsEl, form,
    h('div', { class: 'dlg-foot', text: 'Enter envía · Esc cierra' }),
  ]);
  const layer = h('div', { class: 'gtab-layer dlg-layer' }, [panel]);
  root.append(layer);
  log.append(typing);

  const chipBtns = CHIPS.map((c) => {
    const b = h('button', { class: 'dlg-chip', type: 'button', text: c });
    b.addEventListener('click', () => send(c));
    chipsEl.append(b);
    return b;
  });

  // ---------- state ----------
  let ped = null, isOpen = false, pending = false, token = 0, ttsOn = true;
  let history = []; // [{role, content}] real exchange only (the local greeting is not sent to the model)
  let latestWorld = null, prevFocus = null, openedAt = 0, lastAI = null, typer = null;

  let lastOffline = false;
  const syncAI = () => {
    const on = !!state.aiEnabled && !lastOffline;
    if (lastAI === on) return;
    lastAI = on;
    aiBadge.className = `dlg-badge ai ${on ? 'on' : 'off'}`;
    aiBadge.textContent = on ? '🤖 Claude' : 'offline';
  };

  ttsBtn.addEventListener('click', () => {
    ttsOn = !ttsOn;
    ttsBtn.setAttribute('aria-pressed', String(ttsOn));
    ttsBtn.textContent = ttsOn ? '🔊' : '🔇';
    ttsBtn.title = ttsOn ? 'Voz activada' : 'Voz desactivada';
    if (!ttsOn) stopSpeech();
    inputEl.focus();
  });
  closeBtn.addEventListener('click', () => close());

  // ---------- messages ----------
  const scrollDown = () => { log.scrollTop = log.scrollHeight; };
  function addMsg(role, text) {
    const m = h('div', { class: `dlg-msg ${role}`, text });
    log.insertBefore(m, typing);
    scrollDown();
    return m;
  }
  function typewrite(el, text) {
    return new Promise((resolve) => {
      let i = 0, acc = 0, last = performance.now();
      const caret = h('span', { class: 'caret' });
      el.textContent = '';
      el.append(document.createTextNode(''), caret);
      const node = el.firstChild;
      const finish = () => { cancelAnimationFrame(typer); typer = null; el.removeEventListener('click', finish); caret.remove(); node.data = text; scrollDown(); resolve(); };
      el.addEventListener('click', finish, { once: true });
      const tick = (now) => {
        if (!isOpen) { finish(); return; }
        acc += (now - last) / 1000 * 46; last = now; // ~46 chars/s
        while (acc >= 1 && i < text.length) {
          const ch = text[i++]; acc -= 1;
          if (/[.!?¿¡]/.test(ch) && i < text.length && text[i] === ' ') acc -= 6; // little pause on sentence ends
          else if (ch === ',') acc -= 2.5;
        }
        node.data = text.slice(0, i);
        scrollDown();
        if (i >= text.length) finish(); else typer = requestAnimationFrame(tick);
      };
      typer = requestAnimationFrame(tick);
    });
  }

  function setPending(v) {
    pending = v;
    typing.classList.toggle('show', v);
    sendBtn.disabled = v;
    chipBtns.forEach((b) => { b.disabled = v; });
    form.setAttribute('aria-busy', String(v));
    if (v) scrollDown();
  }

  function context() {
    const w = latestWorld || window.world;
    const p = w?.player;
    let district = '';
    try { district = districtAt(p?.position?.z ?? 0); } catch { /* optional */ }
    return {
      district,
      hour: Math.round(state.hour * 10) / 10,
      raining: !!state.raining,
      wanted: state.wanted || 0,
      money: state.money,
      vehicle: p?.vehicle ? (p.vehicle.def?.label || p.vehicle.type || 'vehículo') : null,
    };
  }

  async function send(raw) {
    const text = String(raw ?? '').trim().slice(0, 200);
    if (!text || pending || !isOpen) return;
    inputEl.value = '';
    addMsg('me', text);
    const my = token;
    const prior = history.slice();
    history.push({ role: 'user', content: text });
    setPending(true);
    let reply = '', offline = false;
    try {
      const net = await getNet();
      if (typeof net.npcTalk === 'function') {
        const r = await Promise.race([
          net.npcTalk({ ped, history: prior, message: text, context: context() }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)),
        ]);
        reply = (r?.reply || '').trim();
        offline = !!r?.offline;
      }
    } catch (err) { console.warn('[dialog] npcTalk failed', err); }
    if (my !== token) return; // closed / reopened meanwhile
    if (!reply) { reply = pick(OFFLINE[ped?.kind] || OFFLINE.walker); offline = true; }
    lastOffline = offline;
    syncAI();
    setPending(false);
    history.push({ role: 'assistant', content: reply });
    const m = addMsg('npc', '');
    await typewrite(m, reply);
    if (my !== token) return;
    if (ttsOn) speakLine(reply, ped?.kind);
    inputEl.focus();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); send(inputEl.value); });

  // ---------- open / close ----------
  function open(p) {
    if (!p) return;
    if (isOpen) { if (p === ped) { inputEl.focus(); return; } closeInternal(false); }
    ped = p; token++; history = [];
    const info = kindInfo(p.kind);
    panel.style.setProperty('--kc', info.color);
    nameEl.textContent = p.name || info.label;
    kindBadge.textContent = info.label;
    emo.textContent = info.emoji;
    emo.style.display = '';
    portraitImg.style.display = 'none';
    portraitImg.onload = () => { portraitImg.style.display = ''; emo.style.display = 'none'; };
    portraitImg.onerror = () => { portraitImg.style.display = 'none'; emo.style.display = ''; };
    portraitImg.src = new URL(`../../assets/portraits/${encodeURIComponent(p.kind || 'walker')}.png`, import.meta.url).href;
    log.querySelectorAll('.dlg-msg').forEach((n) => n.remove());
    setPending(false);
    lastOffline = false; lastAI = null; syncAI();
    prevFocus = document.activeElement;
    isOpen = true; openedAt = performance.now();
    state.dialogOpen = true;
    try { input.clear(); } catch { /* optional */ }
    panel.classList.add('open');
    inputEl.placeholder = `Escríbele algo a ${(p.name || info.label).split(' ')[0]}…`;
    setTimeout(() => inputEl.focus({ preventScroll: true }), 60);
    // local greeting, instant (no API round-trip)
    const greet = p.greeting || pick(GREETINGS[p.kind] || GREETINGS.walker);
    const m = addMsg('npc', '');
    const my = token;
    typewrite(m, greet).then(() => { if (my === token && ttsOn) speakLine(greet, p.kind); });
  }

  function closeInternal(restore = true) {
    token++;
    isOpen = false;
    if (typer) { cancelAnimationFrame(typer); typer = null; }
    panel.classList.remove('open');
    setPending(false);
    stopSpeech();
    state.dialogOpen = false;
    try { input.clear(); } catch { /* optional */ }
    if (restore) {
      try { inputEl.blur(); if (prevFocus && prevFocus !== document.body && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch { /* optional */ }
    }
    ped = null;
  }
  function close() { if (isOpen) closeInternal(true); }

  events.on('npc:talk', ({ ped: p } = {}) => open(p));

  // Keyboard: capture so the game never sees dialog keystrokes.
  addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') { // focus trap
      const f = [...panel.querySelectorAll('button:not(:disabled), input')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
      e.preventDefault(); f[next].focus();
      return;
    }
    // swallow the held "E" that opened the dialog so it doesn't type into the field
    if (e.code === 'KeyE' && e.repeat && performance.now() - openedAt < 900) { e.preventDefault(); return; }
    if (!panel.contains(document.activeElement) && e.key.length === 1 && !e.ctrlKey && !e.metaKey) inputEl.focus();
  }, true);

  function update(dt, world) {
    latestWorld = world;
    if (!isOpen) return;
    syncAI();
    // walked/ran away → end conversation
    const pp = world?.player?.position, qp = ped?.position;
    if (pp && qp) {
      const dx = pp.x - qp.x, dz = pp.z - qp.z;
      if (dx * dx + dz * dz > 14 * 14) close();
    }
  }

  return { update, open, close, get isOpen() { return isOpen; } };
}
