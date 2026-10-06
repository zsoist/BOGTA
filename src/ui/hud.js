// GTA-style HUD overlay: money, wanted stars, clock/weather, speedometer, health, toasts, prompts,
// district banner, BUSTED/WASTED screens, pause + controls card. DOM is touched only when values change.
import { events } from '../core/events.js';
import { state, formatCOP } from '../core/state.js';
import { RADIO_STATIONS } from '../config.js';
import { injectStyles, h, clamp, damp, retrigger } from './util.js';

const STAR_PATH = 'M50 4 L62 36 L96 38 L69 59 L79 93 L50 73 L21 93 L31 59 L4 38 L38 36 Z';
const GAUGE_R = 78;
const GAUGE_LEN = GAUGE_R * ((270 * Math.PI) / 180);

const CONTROLS = [
  [['W', 'A', 'S', 'D'], 'Conducir / caminar'],
  [['Espacio'], 'Freno de mano / saltar'],
  [['Shift'], 'Correr'],
  [['F'], 'Entrar / salir / robar'],
  [['E'], 'Hablar con la gente'],
  [['Q'], 'Cambiar emisora'],
  [['H'], 'Pitar'],
  [['R'], 'Voltear el carro'],
  [['C'], 'Cambiar cámara'],
  [['P'], 'Pausa'],
  [['K'], 'Ver controles'],
  [['Esc'], 'Cerrar diálogo'],
];

export function controlsRows() {
  return CONTROLS.map(([keys, label]) =>
    h('div', { class: 'ctl-row' }, [h('span', { class: 'keys' }, keys.map((k) => h('span', { class: 'keycap', text: k }))), h('span', { text: label })]));
}

function polarPoint(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function buildSpeedo() {
  const [sx, sy] = polarPoint(100, 100, GAUGE_R, 135);
  const [ex, ey] = polarPoint(100, 100, GAUGE_R, 405);
  const d = `M${sx.toFixed(2)} ${sy.toFixed(2)} A${GAUGE_R} ${GAUGE_R} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  let ticks = '';
  for (let i = 0; i <= 20; i++) {
    const deg = 135 + (270 * i) / 20;
    const big = i % 5 === 0;
    const [x1, y1] = polarPoint(100, 100, GAUGE_R - 12, deg);
    const [x2, y2] = polarPoint(100, 100, GAUGE_R - (big ? 21 : 17), deg);
    ticks += `<line class="tick ${big ? 'big' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<svg viewBox="0 0 200 200" aria-hidden="true">
    <defs><linearGradient id="gtab-spg" gradientUnits="userSpaceOnUse" x1="25" y1="0" x2="175" y2="0">
      <stop offset="0" stop-color="#7ee07e"/><stop offset="0.55" stop-color="#f5c518"/><stop offset="1" stop-color="#ff4d4d"/></linearGradient></defs>
    <circle class="bg" cx="100" cy="100" r="96"/>
    <path class="trk" d="${d}"/>
    <path class="val" d="${d}" stroke-dasharray="${GAUGE_LEN.toFixed(1)}" stroke-dashoffset="${GAUGE_LEN.toFixed(1)}"/>
    ${ticks}
  </svg>`;
}

const pad2 = (n) => String(n).padStart(2, '0');

export function createHUD(root) {
  injectStyles();
  const layer = h('div', { class: 'gtab-layer gtab-hud' });

  // ---------- top-right: clock / money / stars ----------
  const wx = h('span', { class: 'wx', text: '⛅' });
  const time = h('span', { class: 'time', text: '14:30' });
  const temp = h('span', { class: 'temp', text: '14°' });
  const money = h('div', { class: 'hud-money', text: formatCOP(state.money) });
  const deltas = h('div', { class: 'hud-deltas' });
  const stars = h('div', { class: 'hud-stars', 'aria-label': 'Nivel de búsqueda' });
  const starEls = [];
  for (let i = 0; i < 5; i++) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'hud-star'); s.setAttribute('viewBox', '0 0 100 100');
    s.innerHTML = `<path d="${STAR_PATH}"/>`;
    starEls.push(s);
    stars.append(s);
  }
  layer.append(h('div', { class: 'hud-tr' }, [h('div', { class: 'hud-clock' }, [wx, time, temp]), money, deltas, stars]));

  // ---------- toasts / radio ----------
  const toasts = h('div', { class: 'hud-toasts', role: 'status', 'aria-live': 'polite' });
  const radioName = h('span', { class: 'nm' });
  const radio = h('div', { class: 'hud-radio' }, [h('span', { class: 'eq' }, [h('i'), h('i'), h('i'), h('i')]), h('span', { text: '📻' }), radioName]);
  layer.append(toasts, radio);

  // ---------- bottom-left vitals ----------
  const hpFill = h('i');
  const hpBar = h('div', { class: 'hud-bar hp', title: 'Salud' }, [hpFill]);
  const carFill = h('i');
  const carBar = h('div', { class: 'hud-bar car', title: 'Estado del carro' }, [carFill]);
  const street = h('div', { class: 'hud-street', text: '' });
  layer.append(h('div', { class: 'hud-vitals' }, [hpBar, carBar, street]));

  // ---------- bottom-right speedo ----------
  const speedo = h('div', { class: 'hud-speedo', 'aria-hidden': 'true' });
  speedo.innerHTML = buildSpeedo();
  const spVal = speedo.querySelector('.val');
  const spNum = h('div', { class: 'num', text: '0' });
  const spVeh = h('div', { class: 'veh', text: '' });
  speedo.append(spNum, h('div', { class: 'unit', text: 'KM/H' }), spVeh);
  layer.append(speedo);

  // ---------- prompt / banner / overlays ----------
  const prompt = h('div', { class: 'hud-prompt', role: 'status' });
  const dTag = h('div', { class: 'tag' });
  const dNm = h('div', { class: 'nm' });
  const district = h('div', { class: 'hud-district', role: 'status' }, [dTag, dNm, h('div', { class: 'bar' })]);
  const bwBig = h('div', { class: 'big' });
  const bwSub = h('div', { class: 'sub' });
  const bw = h('div', { class: 'hud-bw', 'aria-live': 'assertive' }, [h('div', { class: 'band' }), h('div', { class: 'txt' }, [bwBig, bwSub])]);
  const pause = h('div', { class: 'hud-pause', role: 'dialog', 'aria-label': 'Pausa' }, [
    h('div', { class: 'box' }, [h('div', { class: 'big', text: 'PAUSA' }), h('div', { class: 'hint', text: 'P para seguir · K controles' })]),
  ]);
  const controls = h('div', { class: 'hud-controls', role: 'dialog', 'aria-label': 'Controles' }, [
    h('h3', { text: 'CONTROLES' }),
    h('div', { class: 'ctl-grid' }, controlsRows()),
  ]);
  const kfoot = h('div', { class: 'hud-kfoot' }, [h('span', { class: 'keycap', text: 'K' }), ' CONTROLES']);
  layer.append(prompt, district, bw, pause, controls, kfoot);
  root.append(layer);

  // ================= state mirrors (only touch DOM on change) =================
  let latestWorld = null;
  let shownMoney = state.money;
  let targetMoney = state.money;
  let shownMoneyTxt = money.textContent;
  let moneyFlashT = 0;
  let lastMinute = -1, lastWx = '', lastTemp = '';
  let lastStars = -1, lastChase = false, chaseTimer = 0;
  let lastSpeedInt = -1, lastGaugeMax = 0, lastVeh = null, lastVehLabel = '';
  let lastHpPct = -1, lastCarPct = -1, lastDriving = false, lastRed = false;
  let lastPaused = false, streetTimer = 0, lastStreet = '';
  let bwTimer = 0, radioTimer = 0, promptKey = '';

  // ---------- money ----------
  events.on('money:change', ({ amount, delta } = {}) => {
    if (typeof amount === 'number') targetMoney = amount;
    if (!delta) return;
    const d = h('div', { class: `hud-delta ${delta > 0 ? 'pos' : 'neg'}`, text: `${delta > 0 ? '+' : '−'}${formatCOP(Math.abs(delta))}` });
    d.addEventListener('animationend', () => d.remove());
    deltas.append(d);
    while (deltas.children.length > 5) deltas.firstChild.remove();
    money.classList.toggle('up', delta > 0);
    money.classList.toggle('down', delta < 0);
    moneyFlashT = 0.6;
  });

  // ---------- wanted ----------
  events.on('wanted:change', ({ level } = {}) => setStars(level ?? state.wanted, true));
  function setStars(level, animate) {
    const n = clamp(Math.round(level || 0), 0, 5);
    if (n === lastStars) return;
    starEls.forEach((s, i) => {
      s.classList.toggle('on', i < n);
      if (animate && i < n && i >= lastStars) { s.classList.remove('pop'); void s.getBoundingClientRect(); s.classList.add('pop'); };
    });
    stars.setAttribute('aria-label', `Nivel de búsqueda: ${n} de 5`);
    lastStars = n;
    if (n === 0) setChase(false);
  }
  function setChase(v) {
    if (v === lastChase) return;
    lastChase = v;
    stars.classList.toggle('chase', v);
  }

  // ---------- toasts ----------
  const ICONS = { info: 'i', good: '✓', bad: '!' };
  events.on('notify', ({ text, kind = 'info' } = {}) => {
    if (!text) return;
    const k = ICONS[kind] ? kind : 'info';
    const prev = [...toasts.children].find((t) => !t.classList.contains('out') && t.dataset.text === text);
    if (prev) {
      const n = (Number(prev.dataset.n) || 1) + 1;
      prev.dataset.n = n;
      let x = prev.querySelector('.x2');
      if (!x) { x = h('span', { class: 'x2' }); prev.append(x); }
      x.textContent = `×${n}`;
      clearTimeout(prev._t);
      prev._t = setTimeout(() => dismiss(prev), 4200);
      retrigger(prev, 'again');
      return;
    }
    const t = h('div', { class: `hud-toast ${k}` }, [h('span', { class: 'ic', text: ICONS[k] }), h('span', { text })]);
    t.dataset.text = text;
    t._t = setTimeout(() => dismiss(t), 4200 + Math.min(2500, text.length * 25));
    toasts.append(t);
    while (toasts.children.length > 4) dismiss(toasts.firstChild);
  });
  function dismiss(t) {
    if (!t || t.classList.contains('out')) return;
    clearTimeout(t._t);
    t.classList.add('out');
    setTimeout(() => t.remove(), 420);
  }

  // ---------- radio ----------
  events.on('radio:change', ({ station } = {}) => {
    let name = '';
    if (typeof station === 'string') name = RADIO_STATIONS.find((s) => s.id === station)?.name || station;
    else if (typeof station === 'number') name = RADIO_STATIONS[station]?.name || '';
    else if (station && typeof station === 'object') name = station.name || RADIO_STATIONS.find((s) => s.id === station.id)?.name || '';
    if (!name) name = RADIO_STATIONS[state.stationIndex]?.name || 'Radio';
    radioName.textContent = name;
    radio.classList.toggle('off', /apagada/i.test(name) || station === 'off' || station?.id === 'off');
    radio.classList.add('show');
    clearTimeout(radioTimer);
    radioTimer = setTimeout(() => radio.classList.remove('show'), 3000);
  });

  // ---------- prompt chip ----------
  events.on('prompt', ({ text } = {}) => {
    if (!text) { prompt.classList.remove('show'); promptKey = ''; return; }
    if (text === promptKey) return;
    promptKey = text;
    const m = /^\s*\[?([A-Za-zÁÉÍÓÚ0-9]{1,8}|Espacio)\]?\s*[—–:-]\s*(.+)$/.exec(text);
    prompt.textContent = '';
    if (m) prompt.append(h('span', { class: 'keycap', text: m[1].toUpperCase() }), h('span', { text: m[2] }));
    else prompt.append(h('span', { text }));
    prompt.classList.add('show');
  });

  // ---------- district banner ----------
  events.on('district:change', ({ name } = {}) => {
    if (!name) return;
    dNm.textContent = name;
    const w = latestWorld;
    let st = '';
    try { if (w?.player && w.net) st = w.net.roadAt(w.player.position.x, w.player.position.z)?.name || ''; } catch { /* optional */ }
    dTag.textContent = st ? `${st} · Bogotá D.C.` : 'Bogotá D.C.';
    retrigger(district, 'go');
  });

  // ---------- BUSTED / WASTED ----------
  function showBW(kind) {
    bw.className = `hud-bw ${kind}`;
    bwBig.textContent = kind === 'busted' ? '¡LO CAPTURARON!' : '¡QUEDÓ PAILA!';
    bwSub.textContent = kind === 'busted' ? 'LOS TOMBOS TE COGIERON, SUMERCÉ' : 'RESPIRE, ROLO... YA PASÓ';
    retrigger(bw, 'go');
    document.body.classList.add('gtab-gray');
    prompt.classList.remove('show'); promptKey = '';
    clearTimeout(bwTimer);
    bwTimer = setTimeout(() => { document.body.classList.remove('gtab-gray'); bw.classList.remove('go'); }, 3300);
  }
  events.on('player:busted', () => showBW('busted'));
  events.on('player:wasted', () => showBW('wasted'));

  // ---------- controls card (K) ----------
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyK' || e.repeat || state.dialogOpen) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    controls.classList.toggle('show');
  });

  // ================= per-frame update =================
  function update(dt, world) {
    latestWorld = world;
    const p = world?.player;
    const nowS = (world?.time ?? performance.now() / 1000);

    // money count-up/down
    if (shownMoney !== targetMoney) {
      shownMoney = damp(shownMoney, targetMoney, 7, dt);
      if (Math.abs(shownMoney - targetMoney) < 1) shownMoney = targetMoney;
      const txt = formatCOP(shownMoney);
      if (txt !== shownMoneyTxt) { money.textContent = txt; shownMoneyTxt = txt; }
    } else if (state.money !== targetMoney && !deltas.children.length) {
      targetMoney = state.money; // missed event (e.g. loaded save)
    }
    if (moneyFlashT > 0) {
      moneyFlashT -= dt;
      if (moneyFlashT <= 0) money.classList.remove('up', 'down');
    }

    // clock + weather (minute resolution)
    const hr = state.hour;
    const minute = Math.floor(hr * 60) % 1440;
    if (minute !== lastMinute) {
      lastMinute = minute;
      time.textContent = `${pad2(Math.floor(minute / 60) % 24)}:${pad2(minute % 60)}`;
      const night = hr < 5.5 || hr >= 18.5;
      const w = state.raining ? '🌧️' : night ? '🌙' : '⛅';
      if (w !== lastWx) { wx.textContent = w; lastWx = w; }
      const tmp = `${Math.round(9 + 7 * Math.max(0, Math.sin(((hr - 6) / 12) * Math.PI)) - (state.raining ? 3 : 0))}°`;
      if (tmp !== lastTemp) { temp.textContent = tmp; lastTemp = tmp; }
    }

    // wanted stars (mirror state in case no event arrived) + chase flashing @ ~3 Hz
    if (state.wanted !== lastStars) setStars(state.wanted, true);
    chaseTimer -= dt;
    if (chaseTimer <= 0) {
      chaseTimer = 0.35;
      let chasing = false;
      if (state.wanted > 0 && p && world.vehicles) {
        const px = p.position.x, pz = p.position.z;
        for (const v of world.vehicles) {
          if (!v.isPolice || v.destroyed) continue;
          const dx = v.position.x - px, dz = v.position.z - pz;
          if (dx * dx + dz * dz < 170 * 170) { chasing = true; break; }
        }
      }
      setChase(chasing);
    }

    // vehicle / speedometer / health
    const veh = p?.vehicle || null;
    const driving = !!veh && (p.isDriving !== false);
    if (driving !== lastDriving) { lastDriving = driving; speedo.classList.toggle('show', driving); carBar.classList.toggle('show', driving); }
    if (driving) {
      if (veh !== lastVeh) {
        lastVeh = veh;
        const label = (veh.def?.label || veh.type || 'Vehículo').toString().toUpperCase();
        if (label !== lastVehLabel) { spVeh.textContent = label; lastVehLabel = label; }
        const ms = veh.def?.maxSpeed || 38;
        lastGaugeMax = Math.max(60, Math.ceil((ms * 3.6) / 20) * 20);
        lastSpeedInt = -1;
      }
      const kmh = Math.round(Math.abs(veh.speed || 0) * 3.6);
      if (kmh !== lastSpeedInt) {
        lastSpeedInt = kmh;
        spNum.textContent = kmh;
        spVal.style.strokeDashoffset = (GAUGE_LEN * (1 - clamp(kmh / lastGaugeMax, 0, 1))).toFixed(1);
        const red = kmh / lastGaugeMax > 0.9;
        if (red !== lastRed) { lastRed = red; speedo.classList.toggle('red', red); }
      }
      const cp = Math.round(clamp(veh.health ?? 100, 0, 100));
      if (cp !== lastCarPct) { lastCarPct = cp; carFill.style.transform = `scaleX(${cp / 100})`; carBar.classList.toggle('low', cp < 30); }
    } else lastVeh = null;

    const hp = Math.round(clamp(p?.health ?? state.health ?? 100, 0, 100));
    if (hp !== lastHpPct) { lastHpPct = hp; hpFill.style.transform = `scaleX(${hp / 100})`; hpBar.classList.toggle('low', hp < 30); }

    // street name (4 Hz)
    streetTimer -= dt;
    if (streetTimer <= 0 && p && world.net) {
      streetTimer = 0.25;
      let s = '';
      try { s = world.net.roadAt(p.position.x, p.position.z)?.name || ''; } catch { /* ignore */ }
      if (s && s !== lastStreet) { lastStreet = s; street.textContent = `📍 ${s}`; }
    }

    // pause
    if (state.paused !== lastPaused) {
      lastPaused = state.paused;
      pause.classList.toggle('show', state.paused);
      document.body.classList.toggle('gtab-gray-pause', state.paused);
    }
    void nowS;
  }

  return { update };
}
