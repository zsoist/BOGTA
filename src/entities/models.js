// Low-poly mesh builders for vehicles + humanoids. Models face -Z, origin on the ground at the vehicle center.
// Each vehicle TYPE is built once into merged vertex-colored geometries (a "blueprint"); instances only create a few Meshes
// that share geometry + materials => very few draw calls per vehicle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const lam = (o) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _eu = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const WHITE = 0xffffff;
const GLASS = 0x1d2b3a;
const GLASS_LIGHT = 0x34506a;
const DARK = 0x1b1c1f;
const BUMP = 0x2b2c30;
const CHROME = 0xc4c9cf;

// ---------- shared materials ----------
const paintCache = new Map();
export function paintMaterial(hex) {
  let m = paintCache.get(hex);
  if (!m) { m = lam({ color: hex, vertexColors: true }); paintCache.set(hex, m); }
  return m;
}
const beamMat = new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
});
export const MATS = {
  detail: lam({ vertexColors: true }),
  char: lam({ color: 0x24201e }),
  headlamp: new THREE.MeshBasicMaterial({ color: 0xa0a4a8 }),
  tailDim: new THREE.MeshBasicMaterial({ color: 0x8c1616 }),
  tailBright: new THREE.MeshBasicMaterial({ color: 0xff3524 }),
  redOff: new THREE.MeshBasicMaterial({ color: 0x6a1010 }),
  redOn: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  blueOff: new THREE.MeshBasicMaterial({ color: 0x10206a }),
  blueOn: new THREE.MeshBasicMaterial({ color: 0x3a6bff }),
  beam: beamMat,
  human: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, flatShading: true }),
};

// ---------- canvas textures (signs / decals) ----------
const redraws = [];
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  redraws.push(() => { draw(ctx, w, h); t.needsUpdate = true; });
  return t;
}
if (typeof document !== 'undefined' && document.fonts?.load) {
  Promise.all([document.fonts.load('40px Bangers'), document.fonts.load('40px "Bebas Neue"')])
    .then(() => redraws.forEach((r) => r())).catch(() => {});
}
const decalMats = new Map();
function decalMaterial(key, w, h, draw) {
  let m = decalMats.get(key);
  if (!m) {
    m = lam({ map: canvasTexture(w, h, draw), alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    decalMats.set(key, m);
  }
  return m;
}
const planeCache = new Map();
function planeGeo(w, h) {
  const k = `${w}x${h}`;
  let g = planeCache.get(k);
  if (!g) { g = new THREE.PlaneGeometry(w, h); planeCache.set(k, g); }
  return g;
}
const FONT = (px, face = 'Bangers') => `${px}px ${face}, "Bebas Neue", Impact, "Arial Black", sans-serif`;
function text(ctx, str, x, y, px, color, face, align = 'center') {
  ctx.font = FONT(px, face);
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}
function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

// ---------- geometry part collector ----------
function prismGeo({ wb, wt, db, dt, h, zo = 0, xo = 0 }) {
  const v = [
    [-wb / 2, 0, -db / 2], [wb / 2, 0, -db / 2], [wb / 2, 0, db / 2], [-wb / 2, 0, db / 2],
    [-wt / 2 + xo, h, zo - dt / 2], [wt / 2 + xo, h, zo - dt / 2], [wt / 2 + xo, h, zo + dt / 2], [-wt / 2 + xo, h, zo + dt / 2],
  ];
  const cx = (v[4][0] + v[6][0]) * 0.25, cy = h / 2, cz = (zo) * 0.5;
  const quads = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const out = [];
  const tri = (a, b, c) => {
    const A = v[a], B = v[b], C = v[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const fx = (A[0] + B[0] + C[0]) / 3 - cx, fy = (A[1] + B[1] + C[1]) / 3 - cy, fz = (A[2] + B[2] + C[2]) / 3 - cz;
    const flip = nx * fx + ny * fy + nz * fz < 0;
    const order = flip ? [a, c, b] : [a, b, c];
    for (const i of order) out.push(...v[i]);
  };
  for (const [a, b, c, d] of quads) { tri(a, b, c); tri(a, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

class Parts {
  constructor() { this.layers = new Map(); this.extras = []; this.wheels = []; this.meta = {}; }
  _add(key, g, hex) {
    if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
    if (g.attributes.uv) g.deleteAttribute('uv');
    const cnt = g.attributes.position.count;
    const arr = new Float32Array(cnt * 3);
    _col.setHex(hex);
    for (let i = 0; i < cnt; i++) { arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    let list = this.layers.get(key);
    if (!list) { list = []; this.layers.set(key, list); }
    list.push(g);
  }
  geo(key, g, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(_eu.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    this._add(key, g, hex);
  }
  box(key, w, h, d, hex, x, y, z, ry = 0, rx = 0, rz = 0) { this.geo(key, new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz); }
  prism(key, o, hex, x, y, z, ry = 0) { this.geo(key, prismGeo(o), hex, x, y, z, 0, ry, 0); }
  cyl(key, rt, rb, h, seg, hex, x, y, z, rx = 0, ry = 0, rz = 0) { this.geo(key, new THREE.CylinderGeometry(rt, rb, h, seg), hex, x, y, z, rx, ry, rz); }
  sphere(key, r, hex, x, y, z, sx = 1, sy = 1, sz = 1, ws = 7, hs = 5) { this.geo(key, new THREE.SphereGeometry(r, ws, hs), hex, x, y, z, 0, 0, 0, sx, sy, sz); }
  ico(key, r, hex, x, y, z, sx = 1, sy = 1, sz = 1) { this.geo(key, new THREE.IcosahedronGeometry(r, 0), hex, x, y, z, 0, 0, 0, sx, sy, sz); }
  extra(e) { this.extras.push(e); }
  wheel(group, x, z, r, w, front, drive, y = null) { this.wheels.push({ group, x, z, r, w, front, drive, y: y === null ? r : y }); }
  decal(group, key, w, h, pxw, pxh, draw, x, y, z, ry = 0) {
    this.extra({ group, geo: planeGeo(w, h), mat: decalMaterial(key, pxw, pxh, draw), x, y, z, ry });
  }
  finish() {
    const geos = {};
    for (const [k, list] of this.layers) { geos[k] = mergeGeometries(list, false); list.forEach((g) => g.dispose()); }
    return geos;
  }
}

// ---------- wheels ----------
const wheelCache = new Map();
function wheelGeometry(r, w) {
  const k = `${r}/${w}`;
  let g = wheelCache.get(k);
  if (g) return g;
  const P = new Parts();
  P.geo('w', new THREE.CylinderGeometry(r, r, w, 12), 0x17171a, 0, 0, 0, 0, 0, Math.PI / 2);
  P.geo('w', new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.03, 8), 0xc3c8ce, 0, 0, 0, 0, 0, Math.PI / 2);
  P.box('w', w + 0.05, r * 1.05, r * 0.17, 0x80868e, 0, 0, 0);
  P.box('w', w + 0.05, r * 0.17, r * 1.05, 0x80868e, 0, 0, 0);
  g = P.finish().w;
  wheelCache.set(k, g);
  return g;
}

// ---------- car-like body ----------
function carCommon(P, o) {
  const { L, W, clr, baseH, cabinH, wr, wb } = o;
  const hl = L / 2, topY = clr + baseH;
  P.box('body.detail', W - 0.12, 0.22, L - 0.25, DARK, 0, clr + 0.11, 0);
  P.box('body.paint', W, baseH - 0.14, L, WHITE, 0, clr + 0.14 + (baseH - 0.14) / 2, 0);
  P.box('body.detail', W + 0.012, 0.05, L * 0.78, 0x2c2d31, 0, clr + 0.17, 0);
  P.prism('body.detail', { wb: W - 0.1, wt: W - 0.34, db: o.cabDb, dt: o.cabDt, h: cabinH, zo: o.cabZo }, GLASS, 0, topY, o.cabZ);
  const roofZ = o.cabZ + o.cabZo;
  P.box('body.paint', W - 0.32, 0.06, o.cabDt + 0.1, WHITE, 0, topY + cabinH + 0.02, roofZ);
  for (const sx of [-1, 1]) {
    P.box('body.paint', 0.05, cabinH, 0.09, WHITE, sx * (W / 2 - 0.09), topY + cabinH / 2, o.cabZ + o.cabZo * 0.5);
    P.box('body.detail', 0.12, 0.08, 0.07, DARK, sx * (W / 2 + 0.07), topY + 0.16, o.cabZ - o.cabDb / 2 + 0.12); // mirrors
    for (const sz of [-1, 1]) P.box('body.detail', 0.03, 0.4, wr * 2.45, DARK, sx * (W / 2 + 0.004), clr + 0.28, sz * wb / 2); // arches
    P.box('body.lamp', 0.3, 0.13, 0.07, WHITE, sx * (W / 2 - 0.28), clr + 0.44, -hl - 0.01);
    P.box('body.tail', 0.28, 0.12, 0.06, WHITE, sx * (W / 2 - 0.26), clr + 0.44, hl + 0.01);
    for (const sz of [-1, 1]) P.wheel('body', sx * (W / 2 - 0.02), sz * wb / 2, wr, 0.22, sz < 0, sz > 0);
  }
  P.box('body.detail', W + 0.03, 0.2, 0.14, BUMP, 0, clr + 0.2, -hl - 0.0);
  P.box('body.detail', W + 0.03, 0.2, 0.14, BUMP, 0, clr + 0.2, hl + 0.0);
  P.box('body.detail', W * 0.46, 0.12, 0.05, 0x101114, 0, clr + 0.4, -hl - 0.025);
  P.box('body.detail', 0.28, 0.06, 0.03, 0xe8e0c0, 0, clr + 0.3, hl + 0.035); // plate (yellow-ish)
  P.meta.hood = [0, topY + 0.1, -hl * 0.5];
  P.meta.exhaust = [0.45, 0.2, hl + 0.1];
  P.meta.beam = { z: -hl - 0.1, len: 10, w0: 1.1, w1: 4.4 };
  P.meta.headY = clr + 0.44;
  return { hl, topY, roofZ };
}

const SEDAN = { L: 4.5, W: 1.8, clr: 0.2, baseH: 0.56, cabinH: 0.56, cabDb: 2.05, cabDt: 1.2, cabZ: 0.25, cabZo: 0.04, wr: 0.32, wb: 2.7 };
const TAXI_BODY = { L: 3.7, W: 1.62, clr: 0.2, baseH: 0.5, cabinH: 0.62, cabDb: 2.0, cabDt: 1.45, cabZ: 0.35, cabZo: 0.18, wr: 0.29, wb: 2.3 };

function lightBar(P, y, z) {
  P.box('body.detail', 0.9, 0.06, 0.3, 0x15161a, 0, y + 0.03, z);
  P.box('body.sirenR', 0.4, 0.11, 0.26, WHITE, -0.23, y + 0.1, z);
  P.box('body.sirenB', 0.4, 0.11, 0.26, WHITE, 0.23, y + 0.1, z);
}

const BUILD = {};

BUILD.taxi = (P) => {
  const { topY, roofZ } = carCommon(P, TAXI_BODY);
  const W = TAXI_BODY.W;
  // black door stripe with TAXI lettering
  P.box('body.detail', W + 0.02, 0.13, 1.6, 0x16161a, 0, 0.55, 0.45);
  for (const sx of [-1, 1]) {
    P.decal('body', 'taxi-door', 0.8, 0.14, 256, 48, (c, w, h) => { text(c, 'TAXI', w / 2, h / 2 + 2, 44, '#ffd21a', 'Bangers'); }, sx * (W / 2 + 0.03), 0.55, 0.45, sx * Math.PI / 2);
  }
  P.extra({ group: 'body', geo: new THREE.BoxGeometry(0.56, 0.17, 0.22), mat: taxiSignMats(), x: 0, y: topY + TAXI_BODY.cabinH + 0.145, z: roofZ });
  P.meta.seatZ = 0.0;
};
let _taxiSign = null;
function taxiSignMats() {
  if (_taxiSign) return _taxiSign;
  const face = lam({ map: canvasTexture(256, 96, (c, w, h) => { rect(c, 0, 0, w, h, '#fff7d6'); rect(c, 0, 0, w, 8, '#1a1a1a'); rect(c, 0, h - 8, w, 8, '#1a1a1a'); text(c, 'TAXI', w / 2, h / 2 + 3, 74, '#111', 'Bangers'); }) });
  const side = lam({ color: 0xfff1b0 });
  _taxiSign = [side, side, side, side, face, face];
  return _taxiSign;
}

const SEDAN_COLORS = [0xc0392b, 0x2e6fd9, 0x2f9e6f, 0xe9e9e9, 0x3b3f46, 0xe08a1e, 0x7c4dba, 0x9fb4c7, 0xd94f86];
BUILD.sedan = (P) => { carCommon(P, SEDAN); P.meta.seatZ = 0.1; P.box('body.paint', 1.2, 0.04, 0.9, WHITE, 0, 0.77, -1.5); };

function policeCar(P) {
  const { topY, roofZ } = carCommon(P, SEDAN);
  const { L, W } = SEDAN;
  const GREEN = 0x1f6b3a;
  P.box('body.detail', W + 0.014, 0.2, L * 0.72, GREEN, 0, 0.47, 0.0);
  P.box('body.detail', W - 0.06, 0.012, 1.45, GREEN, 0, 0.766, -L / 2 + 0.85);
  P.box('body.detail', W - 0.06, 0.012, 0.95, GREEN, 0, 0.766, L / 2 - 0.55);
  lightBar(P, topY + SEDAN.cabinH + 0.05, roofZ);
  for (const sx of [-1, 1]) {
    P.decal('body', 'policia-side', 1.5, 0.19, 384, 48, (c, w, h) => { text(c, 'POLICÍA', w / 2, h / 2 + 2, 44, '#ffffff', 'Bangers'); }, sx * (W / 2 + 0.03), 0.49, 0.0, sx * Math.PI / 2);
  }
  P.decal('body', 'policia-hood', 1.1, 0.25, 256, 56, (c, w, h) => { text(c, 'POLICÍA', w / 2, h / 2 + 2, 46, '#ffffff', 'Bangers'); }, 0, 0.78, -L / 2 + 0.85, 0);
  P.meta.seatZ = 0.1;
}
BUILD.police = policeCar;

// ---------- motos ----------
function motoCommon(P, o) {
  // Fork group origin = front axle center. Body group origin = ground center.
  P.meta.fork = [0, 0.32, -0.64];
  P.wheel('fork', 0, 0, 0.32, 0.12, true, false, 0);
  P.wheel('body', 0, 0.62, 0.34, 0.16, false, true);
  for (const sx of [-1, 1]) P.cyl('fork.detail', 0.025, 0.03, 0.74, 6, 0xa3a8ae, sx * 0.09, 0.36, 0.12, 0.31);
  P.box('fork.detail', 0.74, 0.04, 0.04, 0x1a1a1c, 0, 0.74, 0.25);
  for (const sx of [-1, 1]) P.box('fork.detail', 0.14, 0.05, 0.05, 0x111, sx * 0.4, 0.74, 0.25);
  P.box('fork.paint', 0.14, 0.04, 0.5, WHITE, 0, 0.45, -0.02);
  P.box('fork.detail', 0.26, 0.24, 0.16, 0x1b1c1f, 0, 0.62, -0.13);
  P.box('fork.lamp', 0.2, 0.18, 0.06, WHITE, 0, 0.62, -0.225);
  P.box('body.detail', 0.34, 0.34, 0.52, 0x2a2c30, 0, 0.42, 0.05);
  P.box('body.detail', 0.12, 0.1, 0.4, 0x2a2c30, 0, 0.33, 0.35);
  P.box('body.paint', 0.3, 0.25, 0.58, WHITE, 0, 0.82, -0.25);
  P.box('body.paint', 0.36, 0.26, 0.6, WHITE, 0, 0.63, 0.22);
  P.box('body.detail', 0.32, 0.1, 0.72, 0x1b1b1e, 0, 0.83, 0.4);
  P.box('body.paint', 0.22, 0.06, 0.55, WHITE, 0.0, 0.76, 0.95);
  P.box('body.tail', 0.2, 0.08, 0.05, WHITE, 0, 0.78, 1.24);
  P.cyl('body.detail', 0.04, 0.05, 0.85, 6, CHROME, 0.2, 0.36, 0.6, Math.PI / 2 - 0.08);
  P.box('body.detail', 0.05, 0.3, 0.05, 0x888b90, 0, 0.5, 0.6);
  P.box('body.detail', 0.22, 0.04, 0.12, 0xdcd6a0, 0, 0.55, 1.0); // plate
  // rider (own group, visible only with a driver)
  const r = o.rider;
  P.box('rider.detail', 0.44, 0.56, 0.27, r.jacket, 0, 1.28, 0.28, 0, -0.32);
  P.box('rider.detail', 0.46, 0.14, 0.29, r.stripe, 0, 1.08, 0.33, 0, -0.32);
  P.ico('rider.detail', 0.2, r.helmet, 0, 1.69, 0.1, 1, 1.0, 1.1);
  P.box('rider.detail', 0.27, 0.09, 0.14, 0x15202c, 0, 1.69, -0.05);
  for (const sx of [-1, 1]) {
    P.box('rider.detail', 0.12, 0.62, 0.14, r.jacket, sx * 0.3, 1.2, -0.08, 0, 1.08, sx * 0.1);
    P.box('rider.detail', 0.13, 0.52, 0.17, r.pants, sx * 0.24, 0.9, 0.18, 0, 1.37);
    P.box('rider.detail', 0.13, 0.46, 0.15, r.pants, sx * 0.26, 0.62, -0.02, 0, 0.1);
    P.box('rider.detail', 0.14, 0.09, 0.26, 0x222, sx * 0.26, 0.4, -0.08);
  }
  if (r.backpack) {
    P.extra({ group: 'rider', geo: new THREE.BoxGeometry(0.52, 0.52, 0.46), mat: deliveryBoxMats(), x: 0, y: 1.34, z: 0.62 });
  }
  P.meta.hood = [0, 0.8, -0.2];
  P.meta.exhaust = [0.2, 0.3, 1.1];
  P.meta.beam = { z: -0.4, len: 8, w0: 0.7, w1: 3.2 };
  P.meta.headY = 0.62;
  P.meta.seatZ = 0.3;
  if (o.siren) {
    P.box('body.sirenR', 0.12, 0.1, 0.12, WHITE, -0.1, 1.0, 1.05);
    P.box('body.sirenB', 0.12, 0.1, 0.12, WHITE, 0.1, 1.0, 1.05);
  }
}
let _deliveryMats = null;
function deliveryBoxMats() {
  if (_deliveryMats) return _deliveryMats;
  const orange = lam({ color: 0xff7a1a });
  const logo = lam({ map: canvasTexture(256, 256, (c, w, h) => { rect(c, 0, 0, w, h, '#ff7a1a'); rect(c, 12, 12, w - 24, h - 24, '#ff9a3c'); text(c, 'RAPIDÍN', w / 2, h / 2 - 22, 62, '#fff', 'Bangers'); text(c, '¡a su puerta!', w / 2, h / 2 + 40, 34, '#5a1d00', 'Bangers'); }) });
  _deliveryMats = [logo, logo, orange, orange, logo, orange];
  return _deliveryMats;
}
BUILD.moto = (P) => motoCommon(P, { rider: { jacket: 0xff7a1a, stripe: 0x222222, helmet: 0xf0f0f0, pants: 0x27364f, backpack: true } });
BUILD.policeMoto = (P) => motoCommon(P, { rider: { jacket: 0x1f6b3a, stripe: 0xffffff, helmet: 0xffffff, pants: 0x1e2a22, backpack: false }, siren: true });

// ---------- buses ----------
function busSegment(P, g, o) {
  const { L, W, zc = 0, y0 = 0.45, lowH = 1.05, winH = 1.1, stripe, stripeH = 0.22, pillarEvery = 1.35, doors = [] } = o;
  const top = y0 + lowH + winH;
  P.box(`${g}.detail`, W - 0.25, 0.3, L - 0.3, 0x1b1c1f, 0, y0 + 0.12, zc);
  P.box(`${g}.paint`, W, lowH, L, WHITE, 0, y0 + lowH / 2, zc);
  if (stripe !== undefined) P.box(`${g}.detail`, W + 0.014, stripeH, L - 0.06, stripe, 0, y0 + lowH * 0.58, zc);
  P.box(`${g}.detail`, W - 0.07, winH, L - 0.06, o.glass ?? GLASS, 0, y0 + lowH + winH / 2, zc);
  const n = Math.floor((L - 0.6) / pillarEvery);
  for (let i = 0; i <= n; i++) {
    const z = zc - (L - 0.5) / 2 + (i * (L - 0.5)) / n;
    for (const sx of [-1, 1]) P.box(`${g}.paint`, 0.04, winH, 0.1, WHITE, sx * (W / 2 - 0.02), y0 + lowH + winH / 2, z);
  }
  P.box(`${g}.paint`, W + 0.05, 0.13, L + 0.02, WHITE, 0, top + 0.065, zc);
  for (const dz of doors) {
    P.box(`${g}.detail`, 0.04, lowH + winH - 0.08, 1.15, o.doorColor ?? 0x2d4256, W / 2 + 0.005, y0 + (lowH + winH) / 2 - 0.02, zc + dz);
    P.box(`${g}.detail`, 0.05, 0.05, 1.15, 0xffd21a, W / 2 + 0.012, y0 + 0.08, zc + dz);
  }
  return top;
}

function busEnds(P, g, o, front, rear) {
  const { L, W, zc = 0, y0 = 0.45 } = o;
  if (front) {
    const z = zc - L / 2;
    P.box(`${g}.detail`, W + 0.03, 0.26, 0.2, BUMP, 0, y0 + 0.15, z - 0.02);
    P.box(`${g}.detail`, W * 0.55, 0.3, 0.06, 0x101114, 0, y0 + 0.5, z - 0.03);
    for (const sx of [-1, 1]) {
      P.box(`${g}.lamp`, 0.34, 0.16, 0.07, WHITE, sx * (W / 2 - 0.3), y0 + 0.62, z - 0.02);
      P.box(`${g}.detail`, 0.2, 0.14, 0.12, DARK, sx * (W / 2 + 0.1), y0 + 1.6, z + 0.2); // mirrors
    }
  }
  if (rear) {
    const z = zc + L / 2;
    P.box(`${g}.detail`, W + 0.03, 0.26, 0.2, BUMP, 0, y0 + 0.15, z + 0.02);
    for (const sx of [-1, 1]) P.box(`${g}.tail`, 0.3, 0.2, 0.06, WHITE, sx * (W / 2 - 0.25), y0 + 0.75, z + 0.02);
  }
}

function sideText(P, g, key, label, w, h, x, y, z, fg, bg, px = 64, face = 'Bangers') {
  for (const sx of [-1, 1]) {
    P.decal(g, key, w, h, 512, Math.round(512 * h / w), (c, cw, ch) => {
      if (bg) rect(c, 0, 0, cw, ch, bg);
      text(c, label, cw / 2, ch / 2 + 2, px, fg, face);
    }, sx * x, y, z, sx * Math.PI / 2);
  }
}

BUILD.sitp = (P, d) => {
  const o = { L: 11, W: 2.5, zc: 0, stripe: 0xf1f1f1 };
  const top = busSegment(P, 'body', { ...o, doors: [-2.4], glass: 0x21384f });
  busEnds(P, 'body', o, true, true);
  P.box('body.detail', 0.9, 0.12, 0.7, 0x9aa1a8, 0, top + 0.19, 1.8);
  P.box('body.detail', 1.6, 0.24, 1.2, 0xb4bbc2, 0, top + 0.25, -1.2);
  sideText(P, 'body', 'sitp-side', 'SITPaciencia', 3.4, 0.4, 1.26, 1.3, 1.9, '#ffffff', null, 92);
  for (const z of [-3.8]) P.wheel('body', 1.2, z, 0.5, 0.32, true, false), P.wheel('body', -1.2, z, 0.5, 0.32, true, false);
  for (const z of [2.9, 4.2]) P.wheel('body', 1.2, z, 0.5, 0.32, false, true), P.wheel('body', -1.2, z, 0.5, 0.32, false, true);
  P.decal('body', 'sitp-front', 1.7, 0.34, 256, 52, (c, w, h) => { rect(c, 0, 0, w, h, '#0b0b0b'); text(c, 'PORTAL SUR', w / 2, h / 2 + 2, 40, '#ffb020', 'Bangers'); }, 0, 2.15, -5.52, Math.PI);
  P.meta.hood = [0, 1.4, -5.2]; P.meta.exhaust = [1.0, 0.5, 5.6]; P.meta.seatZ = -4.2;
  P.meta.beam = { z: -5.6, len: 13, w0: 1.8, w1: 6.5 };
  P.meta.headY = 1.1;
};

BUILD.transmilagro = (P) => {
  const W = 2.55, y0 = 0.45;
  const f = { L: 8.5, W, zc: -4.6, stripe: 0xfff3c4, stripeH: 0.18, doors: [-1.6, 1.4], glass: 0x1f3446, doorColor: 0xe9eef2 };
  const topF = busSegment(P, 'body', f);
  busEnds(P, 'body', f, true, false);
  const r = { L: 8.1, W, zc: 4.4, stripe: 0xfff3c4, stripeH: 0.18, doors: [-1.4, 1.2], glass: 0x1f3446, doorColor: 0xe9eef2 };
  busSegment(P, 'rear', r);
  busEnds(P, 'rear', r, false, true);
  // bellows (accordion) rides on the rear group so it pivots with the joint
  P.box('rear.detail', W - 0.18, 2.05, 0.9, 0x141416, 0, y0 + 1.07, 0.0);
  for (let i = -3; i <= 3; i++) P.box('rear.detail', W - 0.1, 2.0, 0.07, 0x2a2b30, 0, y0 + 1.07, i * 0.12);
  P.box('rear.paint', W + 0.02, 0.13, 0.9, WHITE, 0, topF + 0.065, 0);
  P.box('body.detail', 1.7, 0.26, 1.1, 0xb9bec4, 0, topF + 0.26, -3.0);
  P.box('rear.detail', 1.7, 0.26, 1.1, 0xb9bec4, 0, topF + 0.26, 4.2);
  sideText(P, 'body', 'tm-side', 'TransMilagro', 4.4, 0.4, 1.28, 1.33, -4.5, '#ffffff', null, 100);
  sideText(P, 'rear', 'tm-side', 'TransMilagro', 4.4, 0.4, 1.28, 1.33, 4.4, '#ffffff', null, 100);
  P.decal('body', 'tm-front', 1.9, 0.36, 256, 48, (c, w, h) => { rect(c, 0, 0, w, h, '#0b0b0b'); text(c, 'PORTAL NORTE', w / 2, h / 2 + 2, 38, '#ffb020', 'Bangers'); }, 0, 2.3, -8.87, Math.PI);
  for (const sx of [-1, 1]) {
    P.wheel('body', sx * 1.28, -6.0, 0.5, 0.32, true, false);
    P.wheel('body', sx * 1.28, -2.6, 0.5, 0.32, false, false);
    P.wheel('rear', sx * 1.28, 3.6, 0.5, 0.32, false, true);
    P.wheel('rear', sx * 1.28, 6.6, 0.5, 0.32, false, true);
  }
  P.meta.rearZ = 0;
  P.meta.hood = [0, 1.6, -8.4]; P.meta.exhaust = [1.0, 0.6, 8.6]; P.meta.seatZ = -7.2;
  P.meta.beam = { z: -8.9, len: 14, w0: 1.8, w1: 6.8 };
  P.meta.headY = 1.1;
};

BUILD.buseta = (P) => {
  const o = { L: 7.4, W: 2.15, zc: 0, y0: 0.4, lowH: 0.95, winH: 0.95, stripe: 0xffd21a, stripeH: 0.16, doors: [-1.5], glass: 0x273f55 };
  const top = busSegment(P, 'body', o);
  busEnds(P, 'body', o, true, true);
  P.box('body.detail', 2.17, 0.14, 7.2, 0x1f4fd8, 0, 0.45 + 0.16, 0);
  P.box('body.detail', 2.17, 0.1, 7.2, 0xe63946, 0, 0.45 + 0.42, 0);
  P.box('body.detail', 1.2, 0.2, 1.0, 0xa0a6ad, 0, top + 0.23, 1.2);
  for (const sx of [-1, 1]) P.box('body.detail', 0.05, 0.4, 0.5, 0xffd21a, sx * 1.08, 0.7, 2.7);
  sideText(P, 'body', 'buseta-side', '¡HAY PUESTO!', 2.8, 0.42, 1.09, 1.0, 1.4, '#ffe14a', null, 78);
  P.decal('body', 'buseta-sign', 1.3, 0.34, 256, 64, (c, w, h) => {
    rect(c, 0, 0, w, h, '#fff6c8'); rect(c, 4, 4, w - 8, h - 8, '#ffefa0');
    text(c, 'Cll 80 - SOACHA', w / 2, h / 2 + 2, 30, '#b3261e', 'Bangers');
  }, 0, top - 0.62, -3.72, Math.PI);
  for (const sx of [-1, 1]) { P.wheel('body', sx * 1.0, -2.4, 0.42, 0.26, true, false); P.wheel('body', sx * 1.0, 2.2, 0.42, 0.26, false, true); }
  P.meta.hood = [0, 1.3, -3.4]; P.meta.exhaust = [0.8, 0.5, 3.8]; P.meta.seatZ = -2.6;
  P.meta.beam = { z: -3.8, len: 11, w0: 1.5, w1: 5.4 };
  P.meta.headY = 0.95;
};

BUILD.chiva = (P) => {
  const L = 8.4, W = 2.3, floor = 0.85;
  const PAN = [0xd62828, 0xf4a300, 0x2a9d8f, 0x1d4fd8, 0xf1c40f, 0xe05cb0];
  P.box('body.detail', W - 0.4, 0.3, L - 0.3, 0x1c1c1f, 0, 0.62, 0);
  P.box('body.detail', W, 0.12, L, 0x6a3f1e, 0, floor - 0.06, 0.2);
  // hood + fenders
  P.box('body.paint', W - 0.55, 0.9, 1.95, WHITE, 0, floor + 0.35, -L / 2 + 1.05);
  P.box('body.paint', W - 0.55, 0.06, 1.75, WHITE, 0, floor + 0.83, -L / 2 + 0.95);
  P.box('body.detail', 1.15, 0.8, 0.07, 0x15161a, 0, floor + 0.3, -L / 2 + 0.06);
  for (let i = -2; i <= 2; i++) P.box('body.detail', 0.03, 0.78, 0.09, CHROME, i * 0.2, floor + 0.3, -L / 2 + 0.05);
  for (const sx of [-1, 1]) {
    P.box('body.paint', 0.5, 0.1, 1.6, WHITE, sx * (W / 2 - 0.2), floor + 0.5, -L / 2 + 1.1);
    P.cyl('body.lamp', 0.17, 0.17, 0.1, 10, WHITE, sx * 0.72, floor + 0.7, -L / 2 - 0.0, Math.PI / 2);
    P.box('body.tail', 0.28, 0.2, 0.06, WHITE, sx * (W / 2 - 0.3), floor + 0.55, L / 2 + 0.03);
    P.box('body.detail', 0.18, 0.12, 0.1, DARK, sx * (W / 2 + 0.05), floor + 1.35, -L / 2 + 2.45);
  }
  P.box('body.detail', W + 0.05, 0.2, 0.18, BUMP, 0, 0.78, -L / 2 - 0.05);
  P.box('body.detail', W + 0.05, 0.2, 0.18, BUMP, 0, 0.78, L / 2 + 0.05);
  // windshield + cab frame
  P.box('body.detail', W - 0.75, 0.75, 0.06, GLASS_LIGHT, 0, floor + 1.2, -L / 2 + 2.15);
  P.box('body.paint', W - 0.5, 0.06, 0.1, WHITE, 0, floor + 1.6, -L / 2 + 2.15);
  // colorful wooden side panels
  const n = 8, seg = (L - 2.5) / n;
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + 2.45 + seg * (i + 0.5);
    for (const sx of [-1, 1]) {
      P.box('body.detail', 0.07, 0.9, seg - 0.04, PAN[(i + (sx > 0 ? 0 : 3)) % PAN.length], sx * (W / 2 - 0.02), floor + 0.5, z);
      P.box('body.detail', 0.08, 0.1, seg - 0.04, 0xfff3d1, sx * (W / 2 - 0.02), floor + 0.8, z);
      P.cyl('body.detail', 0.17, 0.17, 0.05, 6, 0xffffff, sx * (W / 2 + 0.02), floor + 0.45, z, 0, 0, Math.PI / 2);
      P.cyl('body.detail', 0.08, 0.08, 0.06, 6, PAN[(i + 2) % PAN.length], sx * (W / 2 + 0.03), floor + 0.45, z, 0, 0, Math.PI / 2);
    }
  }
  // posts + roof + benches
  for (let i = 0; i <= 6; i++) {
    const z = -L / 2 + 2.3 + (i * (L - 2.5)) / 6;
    for (const sx of [-1, 1]) P.box('body.detail', 0.09, 1.6, 0.09, 0x7a4a24, sx * (W / 2 - 0.08), floor + 1.75, z);
  }
  const roofZ = 0.95, roofL = L - 1.9, roofY = floor + 2.55;
  P.box('body.paint', W + 0.2, 0.1, roofL, WHITE, 0, roofY, roofZ);
  for (const sx of [-1, 1]) P.box('body.detail', 0.06, 0.18, roofL, 0xd62828, sx * (W / 2 + 0.1), roofY - 0.1, roofZ);
  for (let i = 0; i < 5; i++) {
    const z = -L / 2 + 3.0 + i * 1.05;
    P.box('body.detail', W - 0.5, 0.1, 0.45, 0x8a5a2e, 0, floor + 0.5, z);
    P.box('body.detail', W - 0.5, 0.45, 0.06, 0x8a5a2e, 0, floor + 0.8, z + 0.22);
  }
  // roof rack with luggage
  for (const sx of [-1, 1]) P.box('body.detail', 0.05, 0.28, roofL - 0.2, 0x2a2a2e, sx * (W / 2 - 0.1), roofY + 0.2, roofZ);
  for (const z of [-L / 2 + 2.4, roofZ, L / 2 - 0.7]) P.box('body.detail', W - 0.1, 0.05, 0.05, 0x2a2a2e, 0, roofY + 0.34, z);
  P.box('body.detail', 0.9, 0.5, 0.7, 0xd62828, -0.45, roofY + 0.4, 0.2);
  P.box('body.detail', 0.8, 0.4, 0.6, 0x2a9d8f, 0.5, roofY + 0.35, 1.1);
  P.box('body.detail', 0.7, 0.35, 0.9, 0xf4a300, -0.3, roofY + 0.32, 2.2);
  P.box('body.detail', 0.5, 0.3, 0.5, 0x1d4fd8, 0.5, roofY + 0.3, -0.6);
  P.cyl('body.detail', 0.3, 0.3, 0.8, 6, 0xcfcfcf, 0.0, roofY + 0.45, 3.0, 0, 0, Math.PI / 2);
  // rear ladder
  for (const sx of [-0.35, 0.35]) P.box('body.detail', 0.05, 2.4, 0.05, 0xcfcfcf, sx, floor + 1.2, L / 2 + 0.1);
  for (let i = 0; i < 6; i++) P.box('body.detail', 0.8, 0.04, 0.05, 0xcfcfcf, 0, floor + 0.2 + i * 0.4, L / 2 + 0.1);
  P.decal('body', 'chiva-front', 2.0, 0.4, 384, 76, (c, w, h) => {
    rect(c, 0, 0, w, h, '#d62828'); rect(c, 6, 6, w - 12, h - 12, '#ffd21a');
    text(c, 'CHIVA RUMBERA', w / 2, h / 2 + 3, 54, '#d62828', 'Bangers');
  }, 0, roofY - 0.3, -L / 2 + 2.05, Math.PI);
  sideText(P, 'body', 'chiva-hood', '¡Rumba!', 1.1, 0.3, W / 2 - 0.27, floor + 0.84, -L / 2 + 1.0, '#ffffff', null, 90);
  P.wheel('body', 1.05, -3.0, 0.52, 0.3, true, false); P.wheel('body', -1.05, -3.0, 0.52, 0.3, true, false);
  P.wheel('body', 1.05, 2.5, 0.52, 0.34, false, true); P.wheel('body', -1.05, 2.5, 0.52, 0.34, false, true);
  P.meta.hood = [0, floor + 1.0, -L / 2 + 1.0]; P.meta.exhaust = [0.9, 0.5, L / 2 + 0.1]; P.meta.seatZ = -L / 2 + 2.9;
  P.meta.beam = { z: -L / 2 - 0.1, len: 11, w0: 1.5, w1: 5.4 };
  P.meta.headY = floor + 0.7;
};

// ---------- blueprint cache + instancing ----------
const blueprints = new Map();
function blueprint(type) {
  let bp = blueprints.get(type);
  if (bp) return bp;
  const P = new Parts();
  (BUILD[type] || BUILD.sedan)(P);
  bp = { geos: P.finish(), extras: P.extras, wheels: P.wheels, meta: P.meta };
  blueprints.set(type, bp);
  return bp;
}

const beamCache = new Map();
function beamGeometry({ len, w0, w1 }) {
  const k = `${len}/${w0}/${w1}`;
  let g = beamCache.get(k);
  if (g) return g;
  const pos = new Float32Array([
    -w0 / 2, 0, 0, w0 / 2, 0, 0, w1 / 2, 0, -len,
    -w0 / 2, 0, 0, w1 / 2, 0, -len, -w1 / 2, 0, -len,
  ]);
  const near = [1, 0.93, 0.62], far = [0, 0, 0];
  const col = new Float32Array([...near, ...near, ...far, ...near, ...far, ...far]);
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  beamCache.set(k, g);
  return g;
}

export function pickPaint(type, def) {
  if (type === 'sedan') return SEDAN_COLORS[Math.floor(Math.random() * SEDAN_COLORS.length)];
  if (type === 'buseta') return [0xe63946, 0xf4a300, 0x2a9d8f, 0xf1c40f, 0x7c4dba][Math.floor(Math.random() * 5)];
  return Array.isArray(def.color) ? def.color[0] : def.color;
}

export function buildVehicleModel(type, def, paintHex) {
  const bp = blueprint(type);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const groups = { body };
  if (bp.meta.rearZ !== undefined) { groups.rear = new THREE.Group(); groups.rear.position.z = bp.meta.rearZ; body.add(groups.rear); }
  if (bp.meta.fork) { groups.fork = new THREE.Group(); groups.fork.position.set(...bp.meta.fork); body.add(groups.fork); }
  const hasRider = Object.keys(bp.geos).some((k) => k.startsWith('rider.')) || bp.extras.some((e) => e.group === 'rider');
  if (hasRider) { groups.rider = new THREE.Group(); groups.rider.visible = false; body.add(groups.rider); }
  const paint = paintMaterial(paintHex);
  const rig = {
    root, body, groups, wheels: [], tails: [], sirenR: null, sirenB: null, rider: groups.rider || null, rear: groups.rear || null, fork: groups.fork || null,
    paintMeshes: [], lampMeshes: [], beam: null, meta: bp.meta, paint,
  };
  for (const [key, geo] of Object.entries(bp.geos)) {
    const [gname, layer] = key.split('.');
    const parent = groups[gname];
    if (!parent) continue;
    let mat = MATS.detail, cast = true;
    if (layer === 'paint') mat = paint;
    else if (layer === 'lamp') { mat = MATS.headlamp; cast = false; }
    else if (layer === 'tail') { mat = MATS.tailDim; cast = false; }
    else if (layer === 'sirenR') { mat = MATS.redOff; cast = false; }
    else if (layer === 'sirenB') { mat = MATS.blueOff; cast = false; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast && gname !== 'rider';
    mesh.receiveShadow = layer === 'paint' || layer === 'detail';
    parent.add(mesh);
    if (layer === 'paint') rig.paintMeshes.push(mesh);
    if (layer === 'lamp') rig.lampMeshes.push(mesh);
    if (layer === 'tail') { rig.tails.push(mesh); rig.lampMeshes.push(mesh); }
    if (layer === 'sirenR') rig.sirenR = mesh;
    if (layer === 'sirenB') rig.sirenB = mesh;
  }
  for (const e of bp.extras) {
    const parent = groups[e.group];
    if (!parent) continue;
    const m = new THREE.Mesh(e.geo, e.mat);
    m.position.set(e.x, e.y, e.z);
    m.rotation.y = e.ry || 0;
    parent.add(m);
  }
  for (const w of bp.wheels) {
    const parent = groups[w.group];
    if (!parent) continue;
    const pivot = new THREE.Group();
    pivot.position.set(w.x, w.y, w.z);
    const spin = new THREE.Mesh(wheelGeometry(w.r, w.w), MATS.detail);
    pivot.add(spin);
    parent.add(pivot);
    rig.wheels.push({ pivot, spin, r: w.r, front: w.front, drive: w.drive, x: w.x, z: w.z, group: w.group });
  }
  if (bp.meta.beam) {
    const b = new THREE.Mesh(beamGeometry(bp.meta.beam), MATS.beam);
    b.position.set(0, 0.045, bp.meta.beam.z);
    b.frustumCulled = false; b.renderOrder = 1; b.visible = false;
    root.add(b);
    rig.beam = b;
  }
  return rig;
}

// ---------- stylized low-poly humanoid ("el rolo") ----------
// ~1.75 m. Tapered cylinder limbs + sphere joints, jointed at shoulder/elbow/hip/knee/ankle. Index 0 = left (-X), 1 = right (+X).
// Skeleton-free: every joint is a Group the animator rotates. Built from merged vertex-colored parts (one Mesh per body segment).
const TAU = Math.PI * 2;
const H_THIGH = 0.42, H_SHIN = 0.4, H_ANKLE = 0.09;      // leg chain: hip -> knee -> ankle -> sole
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function buildHumanoid(o = {}) {
  const c = {
    jeans: 0x34466b, jacket: 0x77833f, jacketDark: 0x555d31, skin: 0xcf9568, hair: 0x1c1511, shoes: 0xf3f1ea, sole: 0xcdc8ba,
    ruana: true, ruanaA: 0xe2d4b0, ruanaB: 0x7d4636, ruanaC: 0x2f3d38, cap: false, capColor: 0x1d2227, scale: 1, ...o,
  };
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const mk = (P, key) => { const m = new THREE.Mesh(P.finish()[key], MATS.human); m.castShadow = true; return m; };

  const pelvis = new THREE.Group();
  pelvis.position.y = H_THIGH + H_SHIN + H_ANKLE;
  body.add(pelvis);
  { // hips
    const P = new Parts();
    P.sphere('p', 0.16, c.jeans, 0, -0.01, 0, 1.14, 0.62, 0.8, 8, 5);
    P.geo('p', new THREE.CylinderGeometry(0.162, 0.168, 0.05, 8), 0x1c1a19, 0, 0.07, 0, 0, 0, 0, 1.08, 1, 0.8); // belt
    pelvis.add(mk(P, 'p'));
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.1, 0, 0); pelvis.add(hip);
    { const P = new Parts();
      P.sphere('t', 0.1, c.jeans, 0, 0, 0);
      P.cyl('t', 0.097, 0.07, H_THIGH, 7, c.jeans, 0, -H_THIGH / 2, 0);
      hip.add(mk(P, 't')); }
    const knee = new THREE.Group(); knee.position.y = -H_THIGH; hip.add(knee);
    { const P = new Parts();
      P.sphere('s', 0.072, c.jeans, 0, 0, 0.004);
      P.cyl('s', 0.068, 0.054, H_SHIN, 7, c.jeans, 0, -H_SHIN / 2, 0);
      P.cyl('s', 0.056, 0.056, 0.03, 7, 0x1d2639, 0, -H_SHIN + 0.03, 0); // jean cuff
      knee.add(mk(P, 's')); }
    const ankle = new THREE.Group(); ankle.position.y = -H_SHIN; knee.add(ankle);
    { const P = new Parts();
      P.sphere('f', 0.06, c.shoes, 0, -0.045, -0.05, 0.95, 0.8, 2.15, 7, 5);       // sneaker body
      P.sphere('f', 0.052, c.shoes, 0, -0.03, 0.03, 0.95, 1, 1.1, 6, 4);           // heel / collar
      P.geo('f', new THREE.CylinderGeometry(0.062, 0.062, 0.03, 8), c.sole, 0, -0.078, -0.05, 0, 0, 0, 1.0, 1, 2.45); // sole
      P.box('f', 0.05, 0.012, 0.09, 0x3b4a66, 0, -0.01, -0.07); // tongue/laces accent
      ankle.add(mk(P, 'f')); }
    legs.push({ hip, knee, ankle });
  }

  const torso = new THREE.Group();
  torso.position.y = 0.04;
  pelvis.add(torso);
  let chest;
  { // jacket (bomber): tapered torso + ribbed hem + collar
    const P = new Parts();
    P.geo('c', new THREE.CylinderGeometry(0.225, 0.172, 0.44, 8), c.jacket, 0, 0.23, 0, 0, 0, 0, 1.15, 1, 0.8);
    P.geo('c', new THREE.CylinderGeometry(0.184, 0.178, 0.07, 8), c.jacketDark, 0, 0.0, 0, 0, 0, 0, 1.15, 1, 0.82); // hem
    P.geo('c', new THREE.CylinderGeometry(0.085, 0.1, 0.06, 8), c.jacketDark, 0, 0.465, 0.0, 0, 0, 0, 1.0, 1, 0.95); // collar
    P.box('c', 0.012, 0.4, 0.012, c.jacketDark, 0, 0.23, -0.15); // zipper
    P.cyl('c', 0.043, 0.048, 0.1, 6, c.skin, 0, 0.5, 0);          // neck
    chest = mk(P, 'c'); torso.add(chest);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0);
  torso.add(head);
  { // head: skull, hair volume, face features, ears (+ optional cap)
    const P = new Parts();
    P.sphere('h', 0.145, c.skin, 0, 0.14, 0, 0.98, 1.1, 1.04, 8, 6);
    P.sphere('h', 0.158, c.hair, 0, 0.185, 0.027, 1.0, 0.86, 1.04, 8, 5);   // hair cap
    P.sphere('h', 0.085, c.hair, 0, 0.2, -0.07, 1.1, 0.7, 0.95, 6, 4);      // quiff / volume
    P.sphere('h', 0.1, c.hair, 0, 0.12, 0.085, 1.15, 1.0, 0.9, 6, 4);       // back hair
    for (const sx of [-1, 1]) {
      P.sphere('h', 0.03, c.skin, sx * 0.13, 0.12, 0.0, 0.6, 1, 0.85, 5, 4);               // ears
      P.sphere('h', 0.022, 0x14100e, sx * 0.05, 0.13, -0.126, 1, 1, 0.8, 5, 4);            // eyes
      P.box('h', 0.062, 0.014, 0.014, c.hair, sx * 0.052, 0.168, -0.128, 0, 0, sx * -0.14); // brows
      P.box('h', 0.014, 0.05, 0.05, c.hair, sx * 0.135, 0.17, 0.0);                          // sideburns
    }
    P.sphere('h', 0.028, 0xbd835a, 0, 0.095, -0.138, 1, 1.1, 1.2, 5, 4);                    // nose
    P.box('h', 0.045, 0.01, 0.012, 0x8e5a44, 0, 0.055, -0.126);                             // mouth
    if (c.cap) {
      P.geo('h', new THREE.SphereGeometry(0.152, 8, 5, 0, TAU, 0, Math.PI / 2), c.capColor, 0, 0.19, 0.01, 0, 0, 0, 1.0, 1.0, 1.05);
      P.box('h', 0.2, 0.014, 0.12, c.capColor, 0, 0.205, -0.15, 0, 0.12, 0);
    }
    head.add(mk(P, 'h'));
  }

  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.255, 0.4, 0); torso.add(sh);
    { const P = new Parts();
      P.sphere('a', 0.075, c.jacket, 0, 0, 0);
      P.cyl('a', 0.063, 0.052, 0.29, 7, c.jacket, 0, -0.145, 0);
      sh.add(mk(P, 'a')); }
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    { const P = new Parts();
      P.sphere('e', 0.055, c.jacket, 0, 0, 0);
      P.cyl('e', 0.052, 0.044, 0.25, 7, c.jacket, 0, -0.125, 0);
      P.cyl('e', 0.047, 0.047, 0.04, 7, c.jacketDark, 0, -0.255, 0);   // cuff
      P.sphere('e', 0.046, c.skin, 0, -0.31, 0, 1, 1.15, 1, 6, 4);     // hand
      P.sphere('e', 0.022, c.skin, sx * -0.03, -0.29, -0.035, 1, 1.4, 1, 5, 4); // thumb
      el.add(mk(P, 'e')); }
    arms.push({ sh, el });
  }

  let ruana = null;
  if (c.ruana) { // light ruana: poncho cone with woven stripe bands, slightly off-center (thrown over the left shoulder)
    const P = new Parts();
    P.geo('r', new THREE.CylinderGeometry(0.2, 0.34, 0.4, 9), c.ruanaA, 0.0, -0.2, 0.0, 0, 0, 0, 1.12, 1, 0.9);
    P.geo('r', new THREE.CylinderGeometry(0.325, 0.34, 0.06, 9), c.ruanaB, 0.0, -0.37, 0.0, 0, 0, 0, 1.12, 1, 0.9);
    P.geo('r', new THREE.CylinderGeometry(0.31, 0.325, 0.025, 9), c.ruanaC, 0.0, -0.31, 0.0, 0, 0, 0, 1.12, 1, 0.9);
    P.sphere('r', 0.11, c.ruanaA, -0.13, -0.01, 0, 1.2, 0.8, 1.1, 7, 4);                  // extra fold over the left shoulder
    ruana = new THREE.Group();
    ruana.position.set(-0.015, 0.47, 0);
    ruana.rotation.z = 0.05;
    ruana.add(mk(P, 'r'));
    torso.add(ruana);
  }
  const rig = {
    scale: c.scale,
    group, body, pelvis, torso, chest, head, legs, arms, ruana,
    anim: { phase: 0, lean: 0, roll: 0, airK: 0, t: Math.random() * 10, rs: 0 },
  };
  animateHumanoid(rig, 0, { speed: 0 });
  return rig;
}

// Procedural pose. Gait is driven by DISTANCE travelled (phase += speed*dt/stride) so feet don't skate; pelvis height comes from the
// leg chain itself (the supporting leg sets it => natural 2x-frequency bob). Blends idle -> walk -> run by speed.
// o = { speed (m/s), yawRate (rad/s), accel (m/s^2 forward), air (0..1 target), vy, squash (-1 stretch .. +1 crouch), panic }
export function animateHumanoid(rig, dt, o) {
  const a = rig.anim, { legs, arms, pelvis, torso, head, chest, body, ruana } = rig;
  if (!(dt >= 0)) dt = 0;
  if (!Number.isFinite(a.lean + a.roll + a.phase + a.rs)) { a.lean = a.roll = a.rs = 0; a.phase = 0; }
  const sp = o.speed || 0, yr = o.yawRate || 0, sq = o.squash || 0;
  a.t += dt;
  const ampMove = smoothstep(0.05, 1.3, sp);
  const turnAmp = sp < 1.5 ? smoothstep(0.6, 3.0, Math.abs(yr)) * 0.3 : 0;
  const ampW = Math.max(ampMove, turnAmp);
  const runK = smoothstep(4.4, 7.0, sp);
  const stride = (1.3 + 1.05 * runK) * (0.62 + 0.38 * smoothstep(0.3, 3.9, sp));
  a.phase += (sp * dt / stride) * TAU + (sp < 1.5 ? Math.abs(yr) * dt * 2.2 : 0);
  if (a.phase > TAU) a.phase -= TAU;
  const airT = o.air ? 1 : 0;
  a.airK += (airT - a.airK) * Math.min(1, 16 * dt);
  const airK = a.airK;
  const hipAmp = Math.asin(Math.min(0.85, stride / 3.3)) * ampW;
  const kBase = lerp(0.62, 1.35, runK);
  const crouch = Math.max(0, sq);
  const fall = o.vy < 0 ? 1 : 0;

  // ----- legs -----
  let hMin = 0;
  for (let i = 0; i < 2; i++) {
    const phi = a.phase + (i ? Math.PI : 0);
    const swing = Math.max(0, Math.cos(phi));
    let hip = hipAmp * Math.sin(phi) + 0.03 * ampW;
    let knee = 0.05 + ampW * (kBase * (0.1 + 0.9 * swing) + runK * 0.22);
    // jump tuck: rising = knees up, falling = legs reach for the ground
    const hipAir = (i ? 0.25 : 0.75) * (1 - 0.55 * fall), kneeAir = (i ? 0.7 : 1.15) * (1 - 0.6 * fall);
    hip = lerp(hip, hipAir, airK); knee = lerp(knee, kneeAir, airK);
    hip += crouch * 0.62; knee += crouch * 1.15;
    const leg = legs[i];
    leg.hip.rotation.x = hip;
    leg.knee.rotation.x = -knee;
    leg.ankle.rotation.x = -(hip - knee) * 0.72 + (airK * 0.25);
    leg.hip.rotation.z = (i ? 1 : -1) * 0.012;
    const reach = H_THIGH * Math.cos(hip) + H_SHIN * Math.cos(hip - knee) + H_ANKLE;
    if (reach > hMin) hMin = reach; // the extended (supporting) leg sets pelvis height; the other foot lifts
  }
  const standH = H_THIGH + H_SHIN + H_ANKLE;
  pelvis.position.y = Math.min(standH, hMin);
  pelvis.position.x = Math.sin(a.phase) * 0.02 * ampW + Math.sin(a.t * 0.6) * 0.011 * (1 - ampW);
  pelvis.rotation.z = Math.sin(a.phase) * 0.055 * ampW;
  pelvis.rotation.y = -Math.sin(a.phase) * (0.06 + 0.1 * runK) * ampW;

  // ----- torso: lean into acceleration + turns, counter-twist, breathing -----
  const leanT = ampW * (0.035 + 0.17 * runK) + Math.max(-0.12, Math.min(0.28, (o.accel || 0) * 0.011)) + crouch * 0.18 - airK * 0.05;
  a.lean += (leanT - a.lean) * Math.min(1, 9 * dt);
  const rollT = Math.max(-0.22, Math.min(0.22, yr * sp * 0.012));
  a.roll += (rollT - a.roll) * Math.min(1, 8 * dt);
  const breathe = Math.sin(a.t * 1.9) * 0.012 * (1 - ampW * 0.6);
  body.rotation.x = -a.lean * 0.45;
  body.rotation.z = a.roll;
  torso.rotation.x = -a.lean * 0.55 - crouch * 0.1;
  torso.rotation.y = Math.sin(a.phase) * (0.1 + 0.12 * runK) * ampW;
  torso.rotation.z = -a.roll * 0.4 + Math.sin(a.phase) * 0.03 * ampW;
  chest.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe * 0.5);
  // head stabilization (counter-rotates torso) + idle look-around
  head.rotation.x = a.lean * 0.75 + crouch * 0.1;
  head.rotation.y = -torso.rotation.y * 0.85 + Math.sin(a.t * 0.45) * 0.2 * (1 - ampW);
  head.rotation.z = -(torso.rotation.z + body.rotation.z) * 0.6;

  // ----- arms (counter-swing) -----
  const armAmp = hipAmp * lerp(0.95, 1.2, runK);
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const swingA = (i ? 1 : -1) * Math.sin(a.phase);            // L arm opposes L leg
    let shx = armAmp * swingA + Math.sin(a.t * 1.3 + i) * 0.03 * (1 - ampW);
    let elb = 0.18 + ampW * (0.15 + runK * 1.05) + Math.max(0, shx) * 0.45;
    let out = 0.09 + crouch * 0.1;
    if (o.panic) { shx = 2.5 + Math.sin(a.t * 18 + i * 2) * 0.35; elb = 0.4; out = 0.25; }
    else if (airK > 0.01) { // arms drive up on takeoff, spread while falling
      shx = lerp(shx, fall ? 0.9 : 2.0, airK); elb = lerp(elb, fall ? 0.4 : 0.5, airK); out = lerp(out, fall ? 0.7 : 0.3, airK);
    }
    arms[i].sh.rotation.x = shx - crouch * 0.5;
    arms[i].sh.rotation.z = side * out;
    arms[i].el.rotation.x = elb;
  }
  if (ruana) {
    const target = -a.lean * 0.7 + Math.sin(a.phase * 2) * 0.05 * ampW - (o.accel || 0) * 0.012 - airK * 0.3;
    a.rs += (target - a.rs) * Math.min(1, 7 * dt);
    ruana.rotation.x = a.rs; ruana.rotation.z = Math.sin(a.phase) * 0.05 * ampW - a.roll * 0.5;
  }
  // squash & stretch about the feet
  const k = rig.scale || 1;
  body.scale.set(k * (1 + 0.07 * sq), k * (1 - 0.13 * sq), k * (1 + 0.07 * sq));
}
