// Shared UI helpers (owned by the UI module).

let cssPromise = null;

/** Inject src/ui/ui.css once. Resolves when the stylesheet is applied (or failed — never rejects). */
export function injectStyles() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    try {
      const href = new URL('./ui.css', import.meta.url).href;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.gtab = 'ui';
      link.onload = () => resolve(true);
      link.onerror = () => resolve(false);
      document.head.appendChild(link);
      setTimeout(() => resolve(false), 2500); // never block the title screen forever
    } catch (err) {
      console.warn('[ui] could not inject ui.css', err);
      resolve(false);
    }
  });
  return cssPromise;
}

/** Tiny hyperscript: h('div', {class:'x', text:'hi', style:{...}, on:{click:fn}}, [children]) */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent exponential smoothing. */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Re-trigger a CSS animation class on an element. */
export function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow
  el.classList.add(cls);
}

export const KIND_INFO = {
  vendor: { label: 'Vendedor', emoji: '🧑‍🍳', color: '#f59e0b' },
  walker: { label: 'Transeúnte', emoji: '🚶', color: '#60a5fa' },
  student: { label: 'Estudiante', emoji: '🎓', color: '#a78bfa' },
  oficinista: { label: 'Oficinista', emoji: '💼', color: '#34d399' },
  abuela: { label: 'Abuela', emoji: '👵', color: '#f472b6' },
  policia: { label: 'Policía', emoji: '👮', color: '#4ade80' },
};
export const kindInfo = (k) => KIND_INFO[k] || { label: 'Rolo', emoji: '🧑', color: '#fbbf24' };
