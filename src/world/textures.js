// Procedural canvas textures (no external assets required).
import * as THREE from 'three';
import { makeRng } from './env.js';

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(canvas, { repeat = true, srgb = true, aniso = 8, mip = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

function speckle(ctx, w, h, n, rng, light = 255, dark = 0, alpha = 0.12, size = 1.4) {
  for (let i = 0; i < n; i++) {
    const v = rng() < 0.5 ? dark : light;
    ctx.fillStyle = `rgba(${v},${v},${v},${rng() * alpha})`;
    const s = 0.6 + rng() * size;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
}

// Road tile. kind: 'street' (12 m wide), 'avenue' (20 m), 'caracas' (20 m w/ red busway), 'plain' (intersection)
// Canvas: u across the road (32 px/m), v along the road (period 8 m = 256 px).
export function roadTexture(kind) {
  const rng = makeRng(kind === 'street' ? 11 : kind === 'avenue' ? 12 : kind === 'caracas' ? 13 : 14);
  const W = kind === 'street' ? 384 : kind === 'plain' ? 256 : 640;
  const H = 256;
  const c = mk(W, H); const g = c.getContext('2d');
  const PX = 32; // px per meter
  const mx = (m) => W / 2 + m * PX; // meter offset from road center -> px
  g.fillStyle = '#4b4e54'; g.fillRect(0, 0, W, H);
  // blotchy repaired patches
  for (let i = 0; i < 14; i++) {
    const v = 70 + rng() * 14;
    g.fillStyle = `rgba(${v},${v + 2},${v + 6},0.35)`;
    g.fillRect(rng() * W, rng() * H, 30 + rng() * 120, 20 + rng() * 80);
  }
  speckle(g, W, H, W * H / 9, rng, 235, 10, 0.2, 1.8);
  // tire wear in lane centers (darker polished bands)
  const lanes = kind === 'street' ? [-3, 3] : kind === 'plain' ? [] : [-7, -3.2, 3.2, 7];
  for (const m of lanes) {
    for (const off of [-0.9, 0.9]) {
      const grd = g.createLinearGradient(mx(m + off) - 14, 0, mx(m + off) + 14, 0);
      grd.addColorStop(0, 'rgba(20,20,24,0)'); grd.addColorStop(0.5, 'rgba(20,20,24,0.28)'); grd.addColorStop(1, 'rgba(20,20,24,0)');
      g.fillStyle = grd; g.fillRect(mx(m + off) - 14, 0, 28, H);
    }
  }
  // cracks
  g.strokeStyle = 'rgba(15,15,18,0.55)'; g.lineWidth = 1.1;
  for (let i = 0; i < 6; i++) {
    let x = rng() * W, y = rng() * H; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.3) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  const paint = (m0, m1, color, y0 = 0, y1 = H) => { g.fillStyle = color; g.fillRect(mx(m0), y0, (m1 - m0) * PX, y1 - y0); };
  const yellow = '#e9b827', white = '#e8e8e2';
  if (kind === 'street') {
    paint(-0.08, 0.08, yellow, 0, 128);          // dashed yellow center (4 m on / 4 m off)
    paint(-5.55, -5.4, 'rgba(235,235,225,0.55)'); paint(5.4, 5.55, 'rgba(235,235,225,0.55)');
  } else if (kind === 'avenue') {
    paint(-0.28, -0.14, yellow); paint(0.14, 0.28, yellow);   // double solid yellow
    paint(-4.95, -4.8, white, 0, 128); paint(4.8, 4.95, white, 0, 128);
    paint(-9.5, -9.35, white); paint(9.35, 9.5, white);
  } else if (kind === 'caracas') {
    // red TransMilagro busway in the middle
    const grd = g.createLinearGradient(mx(-4), 0, mx(4), 0);
    grd.addColorStop(0, '#8d2328'); grd.addColorStop(0.5, '#a42a2c'); grd.addColorStop(1, '#8d2328');
    g.fillStyle = grd; g.fillRect(mx(-4), 0, 8 * PX, H);
    speckle(g, W, H, 3000, rng, 255, 0, 0.1, 1.4);
    for (const m of [-3, 3]) { // bus tire wear on red
      g.fillStyle = 'rgba(40,10,10,0.18)'; g.fillRect(mx(m - 1.1), 0, 20, H); g.fillRect(mx(m + 0.45), 0, 20, H);
    }
    paint(-4.2, -4.05, white); paint(4.05, 4.2, white);
    paint(-0.07, 0.07, 'rgba(240,240,235,0.6)', 0, 128);
    paint(-7.0, -6.85, white, 0, 128); paint(6.85, 7.0, white, 0, 128);
    paint(-9.5, -9.35, white); paint(9.35, 9.5, white);
  }
  return tex(c);
}

export function zebraTexture() {
  const c = mk(64, 64); const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  const rng = makeRng(5);
  g.fillStyle = 'rgba(236,236,228,0.92)'; g.fillRect(8, 0, 30, 64); // stripe occupies ~half of a 1-m period
  for (let i = 0; i < 260; i++) { g.clearRect(rng() * 64, rng() * 64, 1 + rng() * 3, 1 + rng() * 3); }
  return tex(c);
}

export function potholeTexture() {
  const c = mk(128, 128); const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  const rng = makeRng(77);
  g.translate(64, 64);
  // outer cracked ring
  g.fillStyle = 'rgba(25,25,28,0.55)'; g.beginPath();
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = 50 + rng() * 12; g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.82); } g.fill();
  g.fillStyle = 'rgba(8,8,10,0.9)'; g.beginPath();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = 32 + rng() * 10; g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8); } g.fill();
  g.fillStyle = 'rgba(70,72,78,0.8)'; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = 14 + rng() * 7; g.lineTo(Math.cos(a) * r - 5, Math.sin(a) * r * 0.7 - 5); } g.fill();
  return tex(c, { repeat: false });
}

export function pavementTexture() {
  const c = mk(256, 256); const g = c.getContext('2d');
  const rng = makeRng(21);
  g.fillStyle = '#b4b1a8'; g.fillRect(0, 0, 256, 256);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const v = 168 + rng() * 22;
    g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.fillRect(tx * 64 + 2, ty * 64 + 2, 60, 60);
  }
  g.strokeStyle = 'rgba(70,68,62,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  speckle(g, 256, 256, 3000, rng, 255, 0, 0.12, 1.4);
  return tex(c);
}

export function plazaTexture() {
  const c = mk(256, 256); const g = c.getContext('2d');
  const rng = makeRng(31);
  g.fillStyle = '#c9c2b2'; g.fillRect(0, 0, 256, 256);
  for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
    const v = 188 + rng() * 22; const warm = ((tx + ty) % 2) ? 6 : -4;
    g.fillStyle = `rgb(${v + warm},${v},${v - 12})`; g.fillRect(tx * 32 + 1, ty * 32 + 1, 30, 30);
  }
  speckle(g, 256, 256, 2000, rng, 255, 0, 0.1, 1.4);
  return tex(c);
}

export function grassTexture() {
  const c = mk(256, 256); const g = c.getContext('2d');
  const rng = makeRng(41);
  g.fillStyle = '#5f9a3e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const r = 10 + rng() * 38; const x = rng() * 256, y = rng() * 256;
    const v = rng();
    g.fillStyle = v < 0.5 ? `rgba(120,170,60,${0.12 + rng() * 0.14})` : `rgba(30,100,50,${0.1 + rng() * 0.14})`;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); }
  }
  speckle(g, 256, 256, 4000, rng, 220, 20, 0.3, 1.6);
  return tex(c);
}

export function groundTexture() {
  const c = mk(256, 256); const g = c.getContext('2d');
  const rng = makeRng(51);
  g.fillStyle = '#6a6a60'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const r = 12 + rng() * 40; const x = rng() * 256, y = rng() * 256;
    g.fillStyle = rng() < 0.5 ? `rgba(120,115,95,${0.12 + rng() * 0.14})` : `rgba(70,80,64,${0.1 + rng() * 0.14})`;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); }
  }
  speckle(g, 256, 256, 3000, rng, 220, 20, 0.2, 1.6);
  return tex(c);
}

// Radial glow used for streetlamp halos / light pools.
export function glowTexture() {
  const c = mk(128, 128); const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false, mip: false });
}

// ---------- Shop sign atlas (parody names) ----------
export const SIGNS = [
  ['Tinto Don Aurelio', '#3b2417', '#ffd08a', '☕'], ['Corrientazo Doña Gloria', '#b3261e', '#fff3c4', '🍲'],
  ['Supermercado El Exitazo', '#ffd400', '#d1121b', '🛒'], ['Gaseosa La Rolombiana', '#c8102e', '#ffffff', '🥤'],
  ['Poni Malteadita', '#ff7ab8', '#ffffff', '🥛'], ['Panadería La Almojábana Feliz', '#f2b25a', '#5a2d0c', '🥐'],
  ['Rapidín Domicilios', '#ff6a00', '#ffffff', '🛵'], ['Llévalo Ya', '#6a1fb5', '#ffe14d', '📦'],
  ['Domi-Volador', '#00a3a3', '#ffffff', '⚡'], ['Tapahuecos S.A.', '#222222', '#ffd400', '🚧'],
  ['Taxi Amarillito', '#ffd400', '#111111', '🚕'], ['Arepas La Reina', '#e8c27a', '#7a1f1f', '🫓'],
  ['Empanadas Doña Rosa', '#d9822b', '#fff', '🥟'], ['Fruver El Mango Biche', '#3da34d', '#ffec6e', '🥭'],
  ['Droguería La Esquina Feliz', '#ffffff', '#0a7d3b', '💊'], ['Ferretería El Martillo', '#1b4f9c', '#ffffff', '🔨'],
  ['Sala de Belleza Divas', '#d63d86', '#ffffff', '💇'], ['Café Pa\' Qué Más', '#5b3a29', '#f5e1c8', '☕'],
  ['Obleas Arequipe Total', '#f4d6a0', '#8a3b12', '🍯'], ['Papelería El Estudio', '#2b6cb0', '#fff', '✏️'],
  ['Pizzería Don Peppino', '#c0392b', '#fff', '🍕'], ['Hamburguesas El Bacán', '#f39c12', '#2b1b0e', '🍔'],
  ['Ropa Americana Gomelo', '#111827', '#f5c518', '👕'], ['Cell Reparo Ya', '#0ea5e9', '#fff', '📱'],
  ['Bar La Pola Fría', '#14532d', '#ffe9a8', '🍺'], ['Lavandería Burbujas', '#7dd3fc', '#0c4a6e', '🫧'],
  ['Cigarrería El Parcero', '#7f1d1d', '#fde68a', '🏪'], ['Jugos Naturales Lulo Loco', '#84cc16', '#14532d', '🍹'],
  ['Cacharrería La Chiva', '#7c3aed', '#fde047', '🧰'], ['Salpicón & Mazorca', '#f97316', '#fff', '🌽'],
  ['Floristería Sumercé', '#be185d', '#ffe4e6', '🌹'], ['Billares Hueco Hondo', '#065f46', '#fef3c7', '🎱'],
];
export const SIGN_COLS = 4, SIGN_ROWS = 8;

export function signAtlas() {
  const CW = 512, CH = 128;
  const c = mk(CW * SIGN_COLS, CH * SIGN_ROWS);
  const draw = () => {
    const g = c.getContext('2d');
    SIGNS.forEach(([name, bg, fg, icon], i) => {
      const cx = (i % SIGN_COLS) * CW, cy = Math.floor(i / SIGN_COLS) * CH;
      g.save(); g.translate(cx, cy);
      g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, CW, 10);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, CH - 8, CW, 8);
      g.strokeStyle = fg; g.lineWidth = 4; g.globalAlpha = 0.85; g.strokeRect(8, 8, CW - 16, CH - 16); g.globalAlpha = 1;
      g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(icon, 52, CH / 2 + 4);
      g.fillStyle = fg; g.textAlign = 'center';
      let size = 54; const font = (s) => `${s}px "Bebas Neue","Impact","Arial Narrow",sans-serif`;
      g.font = font(size);
      const maxW = CW - 130;
      while (g.measureText(name.toUpperCase()).width > maxW && size > 20) { size -= 2; g.font = font(size); }
      g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 0; g.shadowOffsetX = 2; g.shadowOffsetY = 2;
      g.fillText(name.toUpperCase(), (110 + CW - 20) / 2, CH / 2 + 5);
      g.restore();
    });
  };
  draw();
  const t = tex(c, { repeat: false, aniso: 8 });
  t.userData.redraw = () => { c.getContext('2d').clearRect(0, 0, c.width, c.height); draw(); t.needsUpdate = true; };
  try { document.fonts?.load('48px "Bebas Neue"').then(() => t.userData.redraw()).catch(() => {}); } catch (e) { /* optional */ }
  return t;
}

// Big marquee / banner texture.
export function bannerTexture(lines, { w = 1024, h = 256, bg = '#0b1020', fg = '#ffffff', accent = '#ffd400', border = true } = {}) {
  const c = mk(w, h);
  const draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = accent; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(26, 26, w - 52, h - 52); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const size = ln.size || Math.floor((h * 0.62) / n);
      g.font = `${size}px ${ln.font || '"Bebas Neue","Impact","Arial Black",sans-serif'}`;
      g.fillStyle = ln.color || (i === 0 ? fg : accent);
      g.shadowColor = ln.glow || 'rgba(0,0,0,0)'; g.shadowBlur = ln.glow ? 18 : 0;
      g.fillText(ln.text, w / 2, ((i + 0.5) / n) * (h - 20) + 10);
    });
  };
  draw();
  const t = tex(c, { repeat: false });
  t.userData.redraw = () => { draw(); t.needsUpdate = true; };
  try { document.fonts?.load('48px "Bebas Neue"').then(() => t.userData.redraw()).catch(() => {}); } catch (e) { /* optional */ }
  return t;
}

export function pitchTexture() {
  const c = mk(512, 384); const g = c.getContext('2d');
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#3f8f3a' : '#47993f'; g.fillRect(i * 512 / 12, 0, 512 / 12 + 1, 384); }
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
  g.strokeRect(16, 16, 480, 352); g.beginPath(); g.moveTo(256, 16); g.lineTo(256, 368); g.stroke();
  g.beginPath(); g.arc(256, 192, 46, 0, 7); g.stroke();
  g.strokeRect(16, 112, 70, 160); g.strokeRect(426, 112, 70, 160); g.strokeRect(16, 150, 28, 84); g.strokeRect(468, 150, 28, 84);
  return tex(c, { repeat: false });
}

// 64 m tile continuing the street grid beyond the playable map (asphalt bands centered on the tile edges).
export function cityGroundTexture() {
  const S = 512, c = mk(S, S); const g = c.getContext('2d');
  const rng = makeRng(61);
  g.fillStyle = '#7b7d70'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const r = 20 + rng() * 60; const x = 48 + rng() * (S - 96), y = 48 + rng() * (S - 96);
    g.fillStyle = rng() < 0.5 ? `rgba(95,110,80,${0.15 + rng() * 0.2})` : `rgba(140,130,110,${0.12 + rng() * 0.15})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  speckle(g, S, S, 9000, rng, 235, 10, 0.18, 2);
  // sidewalk ring
  g.fillStyle = '#a7a49b';
  g.fillRect(48, 48, S - 96, 24); g.fillRect(48, S - 72, S - 96, 24); g.fillRect(48, 48, 24, S - 96); g.fillRect(S - 72, 48, 24, S - 96);
  // asphalt bands centered on the tile edges (12 m wide = 96 px)
  g.fillStyle = '#4b4e54';
  g.fillRect(0, 0, 48, S); g.fillRect(S - 48, 0, 48, S); g.fillRect(0, 0, S, 48); g.fillRect(0, S - 48, S, 48);
  speckle(g, S, S, 6000, rng, 235, 10, 0.2, 2);
  g.fillStyle = 'rgba(233,184,39,0.75)';
  for (let k = 0; k < 4; k++) { g.fillRect(S - 3 + 0, 32 + k * 128 + 0, 3, 52); g.fillRect(0, 32 + k * 128, 3, 52); g.fillRect(32 + k * 128, 0, 52, 3); g.fillRect(32 + k * 128, S - 3, 52, 3); }
  return tex(c, { aniso: 8 });
}
