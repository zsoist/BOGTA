// Title screen: Ken Burns cover, logo, controls card, rotating tips, blinking "Presiona ENTER".
// Resolves on Enter (or a click on the prompt / after sound is on, any click). Title music starts on the first
// gesture (browsers block autoplay) and fades out when the game starts.
import { injectStyles, h } from './util.js';
import { controlsRows } from './hud.js';

const TIPS = [
  ['Tip', 'el pico y placa no perdona.'],
  ['Tip', 'siempre llueve a las 3. Siempre.'],
  ['Tip', 'los huecos de la Séptima también tienen derechos humanos.'],
  ['Tip', 'si ves un TransMilagro lleno, no es lleno: es "ambiente".'],
  ['Tip', 'un tinto a tiempo salva vidas (y parciales).'],
  ['Tip', 'el que llega a Monserrate a pie, llega con la dignidad en el piso.'],
  ['Tip', 'pitar no arregla el trancón, pero desahoga.'],
  ['Tip', 'Doña Gloria siempre tiene razón. Siempre.'],
  ['Tip', 'si te persigue la policía, finge que vas para el Build Day.'],
  ['Tip', 'las empanadas de a dos mil son una inversión, no un gasto.'],
  ['Tip', 'a los abuelos se les saluda: "¿cómo amaneció, sumercé?"'],
  ['Tip', 'llévese el paraguas. Ya sabe por qué.'],
];

const asset = (p) => new URL(`../../assets/${p}`, import.meta.url).href;
const loadImg = (src) => new Promise((res) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => res(null);
  i.src = src;
});

async function audioFn(name, ...args) {
  try {
    const m = await import('../audio/audio.js');
    if (typeof m[name] === 'function') return await m[name](...args);
  } catch { /* audio is optional */ }
  return undefined;
}

export async function createTitle(root) {
  await injectStyles();

  const slidesEl = h('div', { class: 'tt-bg' });
  const el = h('div', { class: 'gtab-title', role: 'dialog', 'aria-label': 'GTA Bogotá — pantalla de título' });
  const tipEl = h('div', { class: 'tt-tip', 'aria-live': 'polite' });
  const barFill = h('i');
  const press = h('button', { class: 'tt-press', type: 'button' }, ['Presiona ', h('span', { class: 'keycap', text: 'ENTER' })]);
  const snd = h('div', { class: 'tt-snd', text: '🔊 click para sonido' });
  el.append(
    slidesEl,
    h('div', { class: 'tt-vig' }),
    h('div', { class: 'tt-grain' }),
    h('div', { class: 'tt-logo' }, [
      h('span', { class: 'a', text: 'GTA' }), h('span', { class: 'b', text: 'BOGOTÁ' }),
      h('span', { class: 'c', text: 'BUILD DAY EDITION · MUNDO ABIERTO' }),
    ]),
    h('aside', { class: 'tt-card', 'aria-label': 'Controles' }, [h('h3', { text: 'CONTROLES' }), ...controlsRows().slice(0, 9)]),
    h('div', { class: 'tt-foot' }, [tipEl, h('div', { class: 'tt-bar' }, [barFill]), press, snd]),
  );
  root.append(el);

  // ---------- slides (cover + optional loading-1..3.jpg, crossfade) ----------
  const slides = [];
  const addSlide = (img, first) => {
    const s = h('img', { class: `tt-slide${first ? ' on' : ''}`, alt: '', draggable: 'false' });
    s.src = img.src;
    slidesEl.append(s);
    slides.push(s);
  };
  loadImg(asset('cover.png')).then((img) => {
    if (img) addSlide(img, true); else el.classList.add('nocover');
    if (!img) el.style.background = 'radial-gradient(circle at 50% 35%, #3a2a0c, #0a0b10 70%)';
  });
  Promise.all([1, 2, 3].map((n) => loadImg(asset(`loading/loading-${n}.jpg`)))).then((imgs) => {
    imgs.filter(Boolean).forEach((img) => { addSlide(img, !slides.length); });
  });
  let slideIdx = 0;
  const slideTimer = setInterval(() => {
    if (slides.length < 2) return;
    slides[slideIdx].classList.remove('on');
    slideIdx = (slideIdx + 1) % slides.length;
    slides[slideIdx].classList.add('on');
  }, 7000);

  // ---------- tips ----------
  const TIP_MS = 3800;
  el.style.setProperty('--tip-ms', `${TIP_MS}ms`);
  let tipIdx = Math.floor(Math.random() * TIPS.length);
  const showTip = () => {
    const [a, b] = TIPS[tipIdx % TIPS.length];
    tipIdx++;
    tipEl.classList.remove('on');
    setTimeout(() => {
      tipEl.textContent = '';
      tipEl.append(h('b', { text: `${a}: ` }), b);
      tipEl.classList.add('on');
      barFill.classList.remove('run'); void barFill.offsetWidth; barFill.classList.add('run');
    }, 450);
  };
  showTip();
  const tipTimer = setInterval(showTip, TIP_MS + 450);

  // ---------- sound hint: appears shortly, then reflects state ----------
  setTimeout(() => snd.classList.add('show'), 1200);
  let musicOn = false;
  function startMusic() {
    if (musicOn) return;
    musicOn = true;
    audioFn('playTitleMusic');
    snd.textContent = '🔊 ¡Sonido activado! ENTER para jugar';
    snd.classList.add('on');
  }

  // ---------- start / exit ----------
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      removeEventListener('keydown', onKey, true);
      el.removeEventListener('pointerdown', onPointer);
      clearInterval(slideTimer); clearInterval(tipTimer);
      el.classList.add('leave');
      if (musicOn) audioFn('stopTitleMusic', 1.4);
      resolve(); // resolve inside the user gesture so audio.unlock() is allowed
      setTimeout(() => el.remove(), 1100);
    };
    function onKey(e) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); finish(); return; }
      if (e.key.length === 1 || e.code === 'Space' || e.code.startsWith('Arrow')) startMusic(); // any other key = sound on
    }
    function onPointer(e) {
      if (e.target.closest('.tt-card')) { startMusic(); return; }
      if (!musicOn && !e.target.closest('.tt-press')) { startMusic(); return; } // first click = sound on
      finish();
    }
    addEventListener('keydown', onKey, true);
    el.addEventListener('pointerdown', onPointer);
    press.addEventListener('click', (e) => { e.stopPropagation(); }); // handled by pointerdown/keyboard
    press.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); finish(); } });
  });
}
