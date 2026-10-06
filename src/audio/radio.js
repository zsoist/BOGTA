// GTA Bogotá — in-car radio: procedural stations (lookahead sequencer, "A Tale of Two Clocks" pattern), optional real
// audio files per station, station jingles, tuning static, and the talk station with a Claude-written (or offline) DJ.
import { Kit, makeImpulse, satCurve } from './synth.js';
import { SONGS, JINGLES } from './tracks.js';
import { districtAt } from '../config.js';

const LOOKAHEAD = 0.45;   // seconds of music scheduled ahead of the audio clock
const TICK_MS = 50;       // JS timer period (the *audio* clock does the precise timing)
const LEVEL = 0.8;

const JINGLE_TEXT = {
  tropicombo: 'Tropicombo, noventa y ocho punto siete. ¡Pura cumbia, parce!',
  acordeon: 'Vallenato Stereo. El Acordeón Llorón.',
  perreadera: '¡La Perreadera F M! ¡Pa\' que perree, mi gente!',
  champeta: 'Champeta Picó Radio. ¡Ábrete, que llegó el picó!',
  trancon: 'Trancón al Aire. Las noticias, sin salir de la Séptima.',
};

// ------------------------------------------------------------------------------------------ DJ lines (offline)
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function djCandidates(i) {
  const L = [
    'Trancón al Aire, aquí no avanzamos, pero informamos. Reportan trancón en la Séptima: un carro lleva detenido desde el gobierno anterior.',
    'Atención conductores: el hueco de la calle cincuenta y tres cumplió cinco años y ya pidió cédula. Si pasa por ahí, salúdelo.',
    'Y en el clima: llueve a las tres. Siempre llueve a las tres. Es la única noticia en Bogotá que nunca falla.',
    'TransMilagro reporta que va full. Pero full full: ya hay gente colgando del retrovisor.',
    'Un ciudadano aseguró haber visto un semáforo en verde en la Caracas. Las autoridades no confirman ni desmienten.',
    'El Tapahuecos informa que tapó un hueco. Pero se abrieron dos. La matemática no perdona, veci.',
    'Si va para el norte, salga ya. Si va para el sur, rece. Si va para la Ochenta, cancele el plan.',
    'Recuerde: la señal de pare es una sugerencia con forma de octágono. Pero igual, párele bolas.',
    'Último minuto: un taxista asegura que conoce un atajo. Lleva tres horas en el atajo.',
    'Reporte de movilidad: la Caracas está despejada. Perdón, es que se me cayó la transmisión. Está imposible.',
    'Para los que van tarde a Santo Tomás: el profesor también está en el trancón. Respire, parce.',
    'Un peatón cruzó la Séptima sin mirar. Salió ileso porque, como todo, el carro iba a diez por hora.',
    'Consejo del día: el que pita no avanza más rápido, pero se desahoga. Pite con cariño.',
    'Si ve una moto con una mochila naranja volando bajo, no se asuste. Es el domicilio. Ya viene tarde.',
    'Estamos en vivo desde un semáforo en la Veintiséis. Llevamos cuatro ciclos. Los saluda el equipo de Trancón al Aire.',
    'Dato curioso: en Bogotá se dice cinco minuticos y puede significar cualquier cosa entre cinco minutos y la próxima semana.',
  ];
  if (i.raining) L.push('Se nos vino el aguacero. Y como cuando llueve en Bogotá no hay taxi, hasta el taxi está buscando taxi.', 'Llovió, como a las tres. Tenga cuidado con los charcos: algunos tienen más profundidad que un huecazo en la Séptima.');
  if (i.wanted > 0) L.push('Última hora: persecución en vivo por la ciudad. Un conductor huye de las patrullas y, dicen los testigos, ni siquiera iba tarde.', 'La Policía pide al conductor del carro fugitivo que se detenga. El conductor responde que está en el trancón. Y es verdad.');
  if (i.hour >= 5 && i.hour < 9) L.push(`Son las ${i.hhmm} y estamos en hora pico. Hora pico: o sea, hora de mirar el carro de adelante.`, 'Buenos días, rolos. Ya hay trancón, y apenas están calentando.');
  if (i.hour >= 17 && i.hour < 20) L.push(`Son las ${i.hhmm}. Hora pico de la tarde: la ciudad entera intenta llegar a su casa por la misma calle.`);
  if (i.hour >= 21 || i.hour < 5) L.push('Buenas noches, rolos. La ciudad duerme; los huecos, no.', 'Madrugada en Bogotá: la única hora donde el semáforo funciona y nadie lo respeta.');
  if (i.hour >= 6 && i.hour < 21) L.push(`Recuerde el pico y placa: hoy ${i.day % 2 ? 'impar, circulan placas terminadas en uno a cinco' : 'par, circulan placas terminadas en seis a cero'}. Si su placa termina en ${i.plateDigit}, ${((i.day % 2 ? i.plateDigit >= 1 && i.plateDigit <= 5 : i.plateDigit === 0 || i.plateDigit >= 6)) ? 'hoy le toca rodar, felicitaciones' : 'mejor llame a un parcero'}.`);
  if (i.speed > 90) L.push('Alerta: un vehículo anda más rápido que el trancón. Las autoridades lo buscan para felicitarlo.');
  if (i.district) L.push(`Reporte desde ${i.district}: todo normal, o sea, mal pero estable.`);
  return L;
}

export class Radio {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} out
   * @param {{assets?:object, voice?:object}} opts  assets/voice are optional (offline tests pass neither)
   */
  constructor(ctx, out, { assets = null, voice = null } = {}) {
    this.ctx = ctx; this.assets = assets; this.voice = voice;
    this.kit = new Kit(ctx);
    this.cur = null;
    this.active = false;
    this.speaking = false;
    this.dialog = false;
    this.crashUntil = 0;
    this.djTimer = 4; this.djPending = false; this._recent = []; this._djFn = undefined; this._djRetryAt = 0;
    this._sayId = 0; this._timer = null; this._lastDuck = 1; this._world = null;

    // ---- graph: station buses -> [dry + reverb] -> "car speaker" EQ -> duck -> fade -> out ; voice -> fade
    const c = ctx;
    this.in = c.createGain();
    const mix = c.createGain();
    const dry = c.createGain(); dry.gain.value = 0.9; this.in.connect(dry); dry.connect(mix);
    try { const wet = c.createGain(); wet.gain.value = 0.2; const conv = c.createConvolver(); conv.buffer = makeImpulse(c, 1.2, 2.8); this.in.connect(wet); wet.connect(conv); conv.connect(mix); } catch { /* no reverb */ }
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110; hp.Q.value = 0.7;
    const peak = c.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1700; peak.gain.value = 3.5; peak.Q.value = 0.8;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800; lp.Q.value = 0.8;
    const sat = c.createWaveShaper(); sat.curve = satCurve(1.5); sat.oversample = '2x';
    const trim = c.createGain(); trim.gain.value = 0.9;
    this.musicDuck = c.createGain();
    this.fade = c.createGain(); this.fade.gain.value = 0;
    mix.connect(hp); hp.connect(peak); peak.connect(lp); lp.connect(sat); sat.connect(trim); trim.connect(this.musicDuck); this.musicDuck.connect(this.fade);
    this.voiceIn = c.createGain();
    const vhp = c.createBiquadFilter(); vhp.type = 'highpass'; vhp.frequency.value = 160;
    const vlp = c.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 5500;
    this.voiceIn.connect(vhp); vhp.connect(vlp); vlp.connect(this.fade);
    this.fade.connect(out);
  }

  // ------------------------------------------------------------------------------------------ control
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    const now = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setTargetAtTime(on ? 1 : 0, now, on ? 0.25 : 0.12);
    if (on) { this._ensureTimer(); if (this.cur?.seq) this.cur.seq.nextTime = Math.max(this.cur.seq.nextTime, now + 0.1); }
    else { this._cancelSpeech(); setTimeout(() => { if (!this.active) this._stopTimer(); }, 900); }
  }
  setDialog(on) { this.dialog = !!on; }
  duckFor(seconds) { this.crashUntil = this.ctx.currentTime + seconds; }

  /** Tune to a RADIO_STATIONS entry (null / no genre = off). announce = static + jingle + station name. */
  tune(def, { announce = false } = {}) {
    const ctx = this.ctx, now = ctx.currentTime;
    this._retire(this.cur);
    this.cur = null;
    this._cancelSpeech();
    this.djPending = false;
    if (!def || !def.genre) return;
    const song = SONGS[def.genre];
    if (!song) return;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.in);
    const subs = {};
    for (const k of ['drums', 'bass', 'harm', 'lead', 'fx']) { const g = ctx.createGain(); g.gain.value = song.mix[k] ?? 0.8; g.connect(bus); subs[k] = g; }
    const st = { def, genre: def.genre, song, bus, subs, bpm: def.bpm || song.bpm, mode: null, seq: null, src: null, S: {}, token: Math.random() };
    this.cur = st;
    const delay = announce ? 0.85 : 0.1;
    bus.gain.setTargetAtTime(LEVEL * (song.level ?? 1), now + delay * 0.6, 0.12);
    this.djTimer = announce ? 7 : 3;
    if (announce) this._announce(st, now);
    this._startMusic(st, delay);
    if (this.active) this._ensureTimer();
  }

  _retire(st) {
    if (!st) return;
    const now = this.ctx.currentTime;
    try { st.bus.gain.cancelScheduledValues(now); st.bus.gain.setTargetAtTime(0, now, 0.03); } catch { /* ignore */ }
    if (st.src) { try { st.src.stop(now + 0.25); } catch { /* ignore */ } }
    st.dead = true;
    setTimeout(() => { try { st.bus.disconnect(); } catch { /* ignore */ } }, 500);
  }

  // ------------------------------------------------------------------------------------------ announce (static + jingle)
  _announce(st, now) {
    this.kit.tuning(now, this.in, 1);
    const id = st.def.id, rel = `voices/jingle-${id}.mp3`;
    const a = this.assets;
    const synthJingle = () => { const f = JINGLES[st.genre]; if (f) f(this.kit, this.ctx.currentTime + 0.18, this.in); };
    if (a) {
      a.ready.then(() => {
        if (this.cur !== st) return;
        if (a.has(rel)) {
          a.buffer(rel).then((buf) => {
            if (this.cur !== st) return;
            if (!buf) { synthJingle(); this._say(JINGLE_TEXT[id], 'jingle', { tts: false, rate: 1.0, pitch: 0.8, voiceIdx: 1 }); return; }
            const src = this.ctx.createBufferSource(); src.buffer = buf;
            const g = this.ctx.createGain(); g.gain.value = 1.5; src.connect(g); g.connect(this.voiceIn);
            const myId = ++this._sayId; this.speaking = true;
            src.onended = () => { if (myId === this._sayId) this.speaking = false; };
            st.jingleSrc = src; src.start(this.ctx.currentTime + 0.2);
          });
        } else { synthJingle(); this._say(JINGLE_TEXT[id], 'jingle', { tts: false, rate: 1.0, pitch: 0.8, voiceIdx: 1 }); }
      });
    } else synthJingle();
  }

  // ------------------------------------------------------------------------------------------ music start
  _startMusic(st, delay) {
    const a = this.assets;
    const synth = () => {
      if (this.cur !== st) return;
      const song = st.song;
      st.mode = 'synth';
      st.seq = { secIdx: Math.floor(Math.random() * song.order.length), bar: 0, step: 0, nextTime: this.ctx.currentTime + delay, loop: 0 };
    };
    if (!a || st.genre === 'talk') { synth(); return; }
    const rel = `music/${st.def.id}.mp3`;
    a.ready.then(async () => {
      if (this.cur !== st) return;
      if (!a.has(rel)) { synth(); return; }
      const buf = await a.buffer(rel);
      if (this.cur !== st) return;
      if (!buf) { synth(); return; }
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 1.2;
      src.connect(g); g.connect(st.bus);
      st.bus.gain.setTargetAtTime(LEVEL, this.ctx.currentTime + delay * 0.6, 0.12);
      src.start(this.ctx.currentTime + delay, Math.random() * buf.duration); // random offset: feels like live radio
      st.mode = 'file'; st.src = src;
    });
  }

  // ------------------------------------------------------------------------------------------ sequencer
  tick(now = this.ctx.currentTime, look = LOOKAHEAD) {
    const st = this.cur;
    if (!st || st.mode !== 'synth' || st.dead) return;
    const q = st.seq, song = st.song, sd = 60 / st.bpm / 4;
    if (q.nextTime < now - 0.1) q.nextTime = now + 0.05; // underrun: resync instead of bursting
    let guard = 0;
    while (q.nextTime < now + look && guard++ < 96) {
      const sec = song.sections[song.order[q.secIdx]];
      const nextSecKey = song.order[(q.secIdx + 1) % song.order.length];
      const S = st.S;
      S.t = q.nextTime + (q.step & 1 ? song.swing * sd : 0) + (Math.random() - 0.5) * 0.004;
      S.step = q.step; S.stepDur = sd; S.bar = q.bar; S.secBars = sec.bars; S.secName = song.order[q.secIdx]; S.sec = sec;
      S.chord = sec.chords[q.bar];
      S.next = q.bar + 1 < sec.bars ? sec.chords[q.bar + 1] : song.sections[nextSecKey].chords[0];
      S.first = q.bar === 0; S.last = q.bar === sec.bars - 1; S.loop = q.loop;
      S.k = this.kit; S.b = st.subs;
      try { song.play(S); } catch (e) { console.error('[radio] step failed', e); }
      q.nextTime += sd;
      if (++q.step >= 16) {
        q.step = 0;
        if (++q.bar >= sec.bars) { q.bar = 0; if (++q.secIdx >= song.order.length) { q.secIdx = 0; q.loop++; } }
      }
    }
  }
  _ensureTimer() { if (!this._timer && typeof setInterval !== 'undefined') this._timer = setInterval(() => { try { if (this.active) this.tick(); } catch (e) { console.error(e); } }, TICK_MS); }
  _stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  // ------------------------------------------------------------------------------------------ speech + DJ
  _say(text, kind, opts = {}) {
    if (!this.voice) return Promise.resolve();
    const id = ++this._sayId;
    this.speaking = true;
    return this.voice.say(text, kind, {
      channel: 'radio', bus: this.voiceIn, ...opts,
      onend: () => { if (id === this._sayId) this.speaking = false; },
    });
  }
  _cancelSpeech() {
    this._sayId++; this.speaking = false;
    try { this.voice?.cancel('radio'); } catch { /* ignore */ }
    try { this.cur?.jingleSrc?.stop(); } catch { /* ignore */ }
  }

  _info(world) {
    const s = world?.state || {}, p = world?.player;
    const h = s.hour ?? 12, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const speed = Math.abs(p?.vehicle?.speed || 0) * 3.6;
    let district = ''; try { if (p?.position) district = districtAt(p.position.z); } catch { /* ignore */ }
    const info = { hour: h, hhmm: `${hh}:${String(mm).padStart(2, '0')}`, day: s.day ?? 1, raining: !!s.raining, wanted: s.wanted || 0, plate: s.plate, plateDigit: s.plateDigit ?? 0, money: s.money ?? 0, speed: Math.round(speed), district };
    // Non-enumerable toString: if the net layer interpolates `context` into a prompt string it still reads sensibly.
    Object.defineProperty(info, 'toString', { enumerable: false, value: () => `Hora ${info.hhmm}${info.raining ? ', lloviendo' : ''}${info.wanted ? `, el jugador tiene ${info.wanted} estrellas de búsqueda` : ''}${info.district ? `, zona ${info.district}` : ''}, va a ${info.speed} km/h.` });
    return info;
  }

  async _fetchDJ(def, info) {
    if (this._djFn === undefined || (this._djFn === null && Date.now() > this._djRetryAt)) {
      try { const m = await import('../net/claude.js'); this._djFn = typeof m.radioDJ === 'function' ? m.radioDJ : null; } catch { this._djFn = null; }
      if (!this._djFn) this._djRetryAt = Date.now() + 60e3;
    }
    if (!this._djFn) return null;
    const r = await Promise.race([this._djFn({ station: { id: def.id, name: def.name, genre: def.genre }, context: info }), new Promise((res) => setTimeout(() => res(null), 8000))]);
    if (r && r.offline) return null; // net layer's canned line: prefer our context-aware fallbacks
    const line = typeof r === 'string' ? r : r?.line;
    return typeof line === 'string' && line.trim() ? line.trim() : null;
  }

  async _dj() {
    const st = this.cur;
    if (!st || this.djPending) return;
    this.djPending = true;
    try {
      const info = this._info(this._world);
      let line = null;
      try { line = await this._fetchDJ(st.def, info); } catch { /* offline */ }
      if (!line) {
        const pool = djCandidates(info).filter((l) => !this._recent.includes(l));
        line = pick(pool.length ? pool : djCandidates(info));
      }
      this._recent.push(line); if (this._recent.length > 8) this._recent.shift();
      if (this.cur !== st || !this.active) return;
      this.kit.nz(this.ctx.currentTime, this.voiceIn, { type: 'bandpass', f: 1800, q: 1, dur: 0.06, gain: 0.25 });
      await this._say(line, 'dj', { rate: 1.06, pitch: 0.95, voiceIdx: 0 });
    } catch (e) { /* never throw */ } finally {
      this.djPending = false;
      this.djTimer = 9 + Math.random() * 9;
    }
  }

  // ------------------------------------------------------------------------------------------ per-frame
  update(dt, world) {
    this._world = world;
    const now = this.ctx.currentTime;
    let duck = 1;
    if (this.speaking) duck *= 0.28;
    if (this.dialog) duck *= 0.4;
    if (now < this.crashUntil) duck *= 0.35;
    if (Math.abs(duck - this._lastDuck) > 0.01) { this.musicDuck.gain.setTargetAtTime(duck, now, now < this.crashUntil ? 0.03 : 0.12); this._lastDuck = duck; }
    const st = this.cur;
    if (this.active && st && st.genre === 'talk' && st.mode === 'synth' && !this.djPending && !this.speaking) {
      this.djTimer -= dt;
      if (this.djTimer <= 0) this._dj();
    }
    if (this.active) this.tick(now);
  }
}
