// GTA Bogotá — speech: prefer server TTS (POST /api/tts → audio/mpeg), fall back to speechSynthesis (es-CO > es-MX > es).
// say() ALWAYS eventually calls onend (even on failure/mute) so callers can use it for ducking logic.

const MAX_CACHE = 40;

/** Split into <= max-char chunks at sentence / clause boundaries (server TTS limit is 160 chars). */
function splitText(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('! ', max), rest.lastIndexOf('? ', max));
    if (cut < max * 0.4) cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf('; ', max), rest.lastIndexOf(': ', max));
    if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

function rankVoices() {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return [];
    const order = ['es-co', 'es-mx', 'es-us', 'es-419', 'es-ar', 'es-es', 'es'];
    const score = (v) => {
      const l = (v.lang || '').toLowerCase().replace('_', '-');
      let i = order.indexOf(l);
      if (i < 0) i = l.startsWith('es') ? order.length - 1 : 99;
      if (/compact|eloquence/i.test(v.name)) i += 0.5;
      if (/google|natural|premium|enhanced/i.test(v.name)) i -= 0.3;
      return i;
    };
    return synth.getVoices().filter((v) => score(v) < 50).sort((a, b) => score(a) - score(b));
  } catch { return []; }
}

export function createVoice(ctxIn = null, outIn = null) {
  let ctx = ctxIn, defaultOut = outIn;
  let voices = rankVoices();
  try { if (window.speechSynthesis) window.speechSynthesis.addEventListener?.('voiceschanged', () => { voices = rankVoices(); }); } catch { /* ignore */ }
  const cache = new Map();
  let ttsOffUntil = 0;
  const cur = new Map(); // channel -> { token, stop() }
  let counter = 0;
  const api = { muted: false, ttsEnabled: true, setContext(c, o) { ctx = c; defaultOut = o; } };

  const stripEmoji = (s) => String(s).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();

  async function fetchTTS(text, kind) {
    if (!ctx || !api.ttsEnabled || typeof fetch === 'undefined' || Date.now() < ttsOffUntil) return null;
    const key = `${kind}|${text}`;
    if (cache.has(key)) return cache.get(key);
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, kind }) });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !ct.includes('audio')) { ttsOffUntil = Date.now() + (res.status === 404 || res.status === 501 || res.status === 503 ? 10 * 60e3 : 30e3); return null; }
      const data = await res.arrayBuffer();
      const buf = await new Promise((resolve, reject) => { const r = ctx.decodeAudioData(data, resolve, reject); if (r && r.then) r.then(resolve, reject); });
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(key, buf);
      return buf;
    } catch { ttsOffUntil = Date.now() + 30e3; return null; }
  }

  function speakSynth(text, { rate = 1.03, pitch = 1, voiceIdx = 0, onstart, onend }) {
    let done = false, guard = null;
    const finish = () => { if (!done) { done = true; clearTimeout(guard); onend?.(); } };
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { setTimeout(finish, 0); return { stop() { finish(); } }; }
    guard = setTimeout(finish, text.length * 85 + 4000);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = voices[Math.min(voiceIdx, Math.max(0, voices.length - 1))];
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-CO';
      u.rate = rate; u.pitch = pitch; u.volume = 0.95;
      u.onstart = () => onstart?.();
      u.onend = finish; u.onerror = finish;
      setTimeout(() => { try { if (!done) synth.speak(u); } catch { finish(); } }, 50); // cancel()+speak() race workaround
    } catch { finish(); }
    return { stop() { try { synth.cancel(); } catch { /* ignore */ } finish(); } };
  }

  /**
   * say(text, kind, { channel, bus, tts, rate, pitch, voiceIdx, pan, onstart, onend })
   * kind: 'dj' | 'npc' | 'jingle' | ... (sent to /api/tts so the server can pick a voice)
   */
  api.say = async function say(text, kind = 'npc', opts = {}) {
    const { channel = 'main', bus = defaultOut, tts = true, onstart, onend } = opts;
    text = stripEmoji(text);
    api.cancel(channel);
    const token = ++counter;
    const slot = { token, stop() { end(); } };
    cur.set(channel, slot);
    let ended = false;
    const end = () => { if (ended) return; ended = true; if (cur.get(channel) === slot) cur.delete(channel); onend?.(); };
    if (!text || api.muted) { end(); return; }
    try {
      let bufs = null;
      if (tts && ctx) {
        const parts = splitText(text, 155);
        const got = await Promise.all(parts.map((p) => fetchTTS(p, kind)));
        if (got.every(Boolean)) bufs = got;
      }
      if (cur.get(channel) !== slot) return; // superseded/cancelled (cancel() already called onend)
      if (bufs && ctx && ctx.state !== 'closed') {
        const srcs = [], g = ctx.createGain(); g.gain.value = 1; g.connect(bus || ctx.destination);
        let at = ctx.currentTime + 0.03, finished = false;
        const fin = () => { if (finished) return; finished = true; try { g.disconnect(); } catch { /* ignore */ } end(); };
        bufs.forEach((b, i) => {
          const src = ctx.createBufferSource(); src.buffer = b; src.connect(g); src.start(at); at += b.duration; srcs.push(src);
          if (i === bufs.length - 1) src.onended = fin;
        });
        slot.stop = () => { for (const s of srcs) { try { s.stop(); } catch { /* ignore */ } } fin(); };
        onstart?.();
      } else {
        const h = speakSynth(text, { ...opts, onstart, onend: end });
        slot.stop = () => h.stop();
      }
    } catch { end(); }
  };

  api.cancel = function cancel(channel) {
    if (channel) { const s = cur.get(channel); if (s) { cur.delete(channel); try { s.stop(); } catch { /* ignore */ } } return; }
    for (const [c] of cur) api.cancel(c);
  };
  api.setMuted = (m) => { api.muted = !!m; if (m) api.cancel(); };
  return api;
}
