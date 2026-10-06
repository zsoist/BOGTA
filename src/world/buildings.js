// Building context: block fillers (colonial rings, mid-rise grids, towers), shop signs, yards, instanced output.
import * as THREE from 'three';
import { GeoBuilder, col } from './geo.js';
import { cellFor, heightOf, BAY } from './buildingMat.js';
import { SIGN_COLS, SIGN_ROWS, SIGNS } from './textures.js';
import { U } from './env.js';

export const PAL = {
  brick: ['#9a4a35', '#a85a3e', '#8b3e2f', '#b4694a', '#7e3b30', '#c0714f', '#a34f3d', '#b5603f'],
  paint: ['#e9d8b4', '#d9e4d4', '#e8c9c0', '#cfd9e6', '#f0e2b6', '#c9d2b8', '#e6cdb0', '#d8d2c4', '#dcdcd4'],
  concrete: ['#d8d2c4', '#c9c3b3', '#bfc5c9', '#e0d6c0', '#a9b0b6', '#cfc1ad', '#b8a998', '#dcdcd4', '#d9cdb5'],
  glass: ['#7ea4bd', '#5f8aa8', '#6b9aa8', '#8fb0c4', '#4f7596', '#6f8fab'],
  colonial: ['#f3d46b', '#e8a14b', '#d8654f', '#4bb3a8', '#e86b9a', '#5b8fd6', '#f4efe2', '#8fc46b', '#d94f4f', '#9a6fd1', '#f08a3a', '#f2c0a0'],
  whitewash: ['#f4efe3', '#ebe4d3', '#f1ece0', '#e7dcc4', '#f0d9a8', '#f2e2c4'],
  commercial: ['#e4d7bd', '#d6c8ac', '#c7d1d8', '#e8c9a0', '#c9b8a6', '#e0c4a8'],
  roofTile: ['#b5523b', '#a94632', '#c2603f', '#8e3d2e', '#b04a30'],
  roofGrey: ['#7a7d82', '#6c7076', '#868a8f'],
};

export class BuildingContext {
  constructor(rng) {
    this.rng = rng;
    this.inst = [];       // {x,y,z,sx,sy,sz,color,kind,seed,litP}
    this.signs = [];      // {x,y,z,ry,w,h,cell}
    this.colliders = [];
    this.trees = [];      // {x,z,s,type}
    this.shadows = [];    // contact-shadow footprints {x0,x1,z0,z1}
    this.statics = new GeoBuilder();   // vertex-colored static (gable roofs, rooftop clutter, props)
    this.grass = new GeoBuilder();     // park grass overlay
    this.plaza = new GeoBuilder();     // paved plaza overlay
    this.dirt = new GeoBuilder();      // simple colored overlay (paths, sand)
    this.parks = [];      // rects that count as green space
  }
  pal(name) { return this.rng.pick(PAL[name]); }

  addInst(x, y, z, sx, sy, sz, color, kind, litP = 0.4) {
    this.inst.push({ x, y, z, sx, sy, sz, color: color instanceof THREE.Color ? color : new THREE.Color(color), kind, seed: this.rng(), litP });
  }
  addCollider(x0, x1, z0, z1, height, kind = 'building') {
    this.colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, height, kind });
  }

  // One facade volume: instanced box + parapet/cornice slab. Returns the top Y.
  _part(x0, x1, z0, z1, floors, kind, color, y0, shops, litP, cap = true) {
    const h = heightOf(kind, floors, shops);
    this.addInst((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, h, z1 - z0, color, kind + (shops ? 10 : 0), litP);
    if (cap) {
      const cc = this.rng.pick(['#9b968a', '#8a867c', '#a8a397', '#7c7970', '#b0a48f']);
      this.addInst((x0 + x1) / 2, y0 + h, (z0 + z1) / 2, x1 - x0 + 0.5, 0.5, z1 - z0 + 0.5, cc, 6, 0);
    }
    return y0 + h + (cap ? 0.5 : 0);
  }

  // Rooftop clutter: water tanks, AC units, antennas (merged static geometry).
  _roofProps(x0, x1, z0, z1, y, tall) {
    const rng = this.rng, b = this.statics;
    const w = x1 - x0, d = z1 - z0;
    if (w < 6 || d < 6) return;
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const t = rng();
      const px = rng.range(x0 + 2, x1 - 2), pz = rng.range(z0 + 2, z1 - 2);
      if (t < 0.4) { // water tank on a stand
        const r = rng.range(0.8, 1.3), hh = rng.range(1.5, 2.2);
        b.box(px - r * 0.8, y, pz - r * 0.8, px - r * 0.6, y + 0.8, pz - r * 0.6, col(0x55585c), col(0x55585c));
        b.box(px + r * 0.6, y, pz + r * 0.6, px + r * 0.8, y + 0.8, pz + r * 0.8, col(0x55585c), col(0x55585c));
        b.cyl(px, pz, y + 0.8, y + 0.8 + hh, r, r, 8, col(0x8a8d90), { top: col(0x6a6d70) });
        b.cyl(px, pz, y + 0.8 + hh, y + 1.3 + hh, r, r * 0.3, 8, col(0x5f6266));
      } else if (t < 0.8) { // AC units
        for (let q = 0; q < rng.int(2, 3); q++) b.box(px + q * 1.7, y, pz, px + q * 1.7 + 1.4, y + 0.9, pz + 1.0, col(0xaeb1b4), col(0x8d9094));
      } else { // stair/elevator head
        const sw = rng.range(2.5, 3.8), sd = rng.range(2.5, 3.8);
        b.box(px, y, pz, px + sw, y + 2.6, pz + sd, col(0xb8b3a6), col(0x8e8a80));
      }
    }
    if (tall || rng.chance(0.35)) { // antenna
      const ax = rng.range(x0 + 1.5, x1 - 1.5), az = rng.range(z0 + 1.5, z1 - 1.5), hh = rng.range(4, tall ? 14 : 8);
      b.box(ax - 0.06, y, az - 0.06, ax + 0.06, y + hh, az + 0.06, col(0x4b4f55), col(0x4b4f55));
      b.box(ax - 0.7, y + hh * 0.7, az - 0.03, ax + 0.7, y + hh * 0.7 + 0.08, az + 0.03, col(0x4b4f55), col(0x4b4f55));
      b.box(ax - 0.7, y + hh * 0.5, az - 0.03, ax + 0.7, y + hh * 0.5 + 0.08, az + 0.03, col(0x4b4f55), col(0x4b4f55));
    }
  }

  // Building massing. spec: {x0,x1,z0,z1,floors,kind,color,roof,ridge,roofColor,litP,lot,signChance,
  //   podium,noSetback,noCrown,noCollider,noRoofProps,noShops,y0}
  building(s) {
    const rng = this.rng;
    let { x0, x1, z0, z1, floors, kind } = s;
    const litP = s.litP ?? 0.4;
    const y0 = s.y0 || 0;
    const bay = BAY[kind] || 3.5;
    if (kind !== 3 && !s.noSnap) { // shrink footprint to a whole number of facade bays so windows never get cut at corners
      const nw = Math.max(1, Math.floor((x1 - x0) / bay + 0.2)), nd = Math.max(1, Math.floor((z1 - z0) / bay + 0.2));
      x1 = x0 + Math.min(x1 - x0, nw * bay); z1 = z0 + Math.min(z1 - z0, nd * bay);
    }
    const shops = !s.noShops && y0 === 0 && kind !== 3 && kind <= 4;
    const gable = s.roof === 'gable';
    let top = y0;
    if (gable) {
      top = this._part(x0, x1, z0, z1, floors, kind, s.color, y0, false, litP, false);
      const w = x1 - x0, d = z1 - z0;
      const ridge = s.ridge || (w >= d ? 'x' : 'z');
      const span = ridge === 'x' ? d : w;
      const rc = s.roofColor || this.pal('roofTile');
      this.statics.gable(x0, z0, x1, z1, top, top + Math.min(2.8, Math.max(1.2, span * 0.17)), rc, col(rc).map((v) => v * 0.82), ridge, 0.4);
      if (rng.chance(0.35)) { const cx = rng.range(x0 + 1, x1 - 1), cz = rng.range(z0 + 1, z1 - 1); this.statics.box(cx, top, cz, cx + 0.6, top + 2.2, cz + 0.6, col(0x8a5a48), col(0x6a4538)); }
    } else {
      let cur = { x0, x1, z0, z1 };
      let remaining = floors, yy = y0;
      if (s.podium && floors >= 8) {
        const pf = rng.int(2, 3);
        yy = this._part(x0, x1, z0, z1, pf, 4, this.pal('commercial'), yy, shops, litP, true);
        remaining -= pf;
        const ix = (x1 - x0) * rng.range(0.14, 0.22), iz = (z1 - z0) * rng.range(0.14, 0.22);
        cur = { x0: x0 + ix, x1: x1 - ix, z0: z0 + iz, z1: z1 - iz };
        yy = this._tower(cur, remaining, kind, s.color, yy, litP, s, false);
      } else {
        yy = this._tower(cur, remaining, kind, s.color, yy, litP, s, shops);
      }
      top = yy;
    }
    if (!s.noCollider) this.addCollider(x0, x1, z0, z1, top);
    if (s.lot && floors >= 1 && (s.signChance ?? 0.5) > 0) this._signs({ ...s, x0, x1, z0, z1 }, x1 - x0, z1 - z0, shops);
    if (s.lot !== null && !s.noShadow && y0 === 0) this.shadows.push({ x0, x1, z0, z1 });
    return top;
  }

  // Tower body with optional setback; places rooftop details / crown on the highest part.
  _tower(r, floors, kind, color, y0, litP, s, shops) {
    const rng = this.rng;
    let yy = y0, cur = r;
    if (floors >= 8 && !s.noSetback && kind <= 2 && rng.chance(0.6)) {
      const k = rng.int(2, 3);
      yy = this._part(cur.x0, cur.x1, cur.z0, cur.z1, floors - k, kind, color, yy, shops, litP, true);
      const inset = rng.range(1.4, 2.4);
      if (cur.x1 - cur.x0 > inset * 2 + 6 && cur.z1 - cur.z0 > inset * 2 + 6) cur = { x0: cur.x0 + inset, x1: cur.x1 - inset, z0: cur.z0 + inset, z1: cur.z1 - inset };
      yy = this._part(cur.x0, cur.x1, cur.z0, cur.z1, k, kind, color, yy, false, litP, true);
    } else {
      yy = this._part(cur.x0, cur.x1, cur.z0, cur.z1, floors, kind, color, yy, shops, litP, true);
    }
    const tall = floors >= 10;
    if (kind === 2 && floors >= 12 && !s.noCrown) { // glass-tower crown: mechanical floor + mast
      const ix = (cur.x1 - cur.x0) * 0.2, iz = (cur.z1 - cur.z0) * 0.2;
      const cx0 = cur.x0 + ix, cx1 = cur.x1 - ix, cz0 = cur.z0 + iz, cz1 = cur.z1 - iz;
      this.addInst((cx0 + cx1) / 2, yy, (cz0 + cz1) / 2, cx1 - cx0, 4.2, cz1 - cz0, '#8fa2b3', 5, 0);
      this.addInst((cx0 + cx1) / 2, yy + 4.2, (cz0 + cz1) / 2, cx1 - cx0 + 0.4, 0.4, cz1 - cz0 + 0.4, '#cfd6dc', 6, 0);
      const mx = (cx0 + cx1) / 2, mz = (cz0 + cz1) / 2, mh = rng.range(10, 22);
      this.statics.box(mx - 0.12, yy + 4.6, mz - 0.12, mx + 0.12, yy + 4.6 + mh, mz + 0.12, col(0x6c7178), col(0x6c7178));
      this.statics.box(mx - 0.2, yy + 4.6 + mh, mz - 0.2, mx + 0.2, yy + 4.6 + mh + 0.4, mz + 0.2, col(0xe03030), col(0xe03030));
      yy += 4.6;
    } else if (!s.noRoofProps) this._roofProps(cur.x0, cur.x1, cur.z0, cur.z1, yy, tall);
    return yy;
  }

  _signs(s, w, d, shops) {
    const L = s.lot, T = 3.2, sc = s.signChance ?? 0.5, ry = this.rng;
    const faces = [];
    if (s.z0 - L.z0 < T) faces.push({ ry: Math.PI, x: (s.x0 + s.x1) / 2, z: s.z0 - 0.07, len: w });
    if (L.z1 - s.z1 < T) faces.push({ ry: 0, x: (s.x0 + s.x1) / 2, z: s.z1 + 0.07, len: w });
    if (s.x0 - L.x0 < T) faces.push({ ry: -Math.PI / 2, x: s.x0 - 0.07, z: (s.z0 + s.z1) / 2, len: d });
    if (L.x1 - s.x1 < T) faces.push({ ry: Math.PI / 2, x: s.x1 + 0.07, z: (s.z0 + s.z1) / 2, len: d });
    for (const f of faces) {
      if (!ry.chance(shops ? sc * 0.45 : sc) || f.len < 4) continue;
      const sw = Math.min(f.len * 0.8, ry.range(3.4, 4.8));
      const sh = Math.min(1.2, Math.max(0.8, sw / 4.2));
      this.signs.push({ x: f.x, y: shops ? 5.3 : s.kind === 3 ? 3.3 : 2.75, z: f.z, ry: f.ry, w: sw, h: sh, cell: ry.int(0, SIGNS.length - 1) });
    }
  }

  // ---------- fillers ----------
  // Row of houses around the block perimeter with a courtyard in the middle.
  ring(lot, o = {}) {
    const rng = this.rng;
    const { x0, x1, z0, z1 } = lot;
    const dN = rng.range(o.dmin ?? 11, o.dmax ?? 15), dS = rng.range(o.dmin ?? 11, o.dmax ?? 15);
    const dW = rng.range(o.dmin ?? 11, o.dmax ?? 15), dE = rng.range(o.dmin ?? 11, o.dmax ?? 15);
    const gap = o.gap ?? 0.8;
    const wmin = o.wmin ?? 6.5, wmax = o.wmax ?? 11;
    const palName = o.pal || 'colonial';
    const mk = (a0, a1, fixedLo, fixedHi, alongX, side) => {
      let p = a0;
      while (a1 - p > 3) {
        let w = rng.range(wmin, wmax);
        if (a1 - (p + w) < wmin * 0.8) w = a1 - p;
        const e = Math.min(a1, p + w);
        const floors = (o.kind ?? 3) === 3 ? (rng.chance(0.78) ? 2 : 3) : rng.int(o.fmin ?? 2, o.fmax ?? 3);
        const color = o.colors ? rng.pick(o.colors) : this.pal(palName);
        const spec = alongX
          ? { x0: p, x1: e - gap, z0: fixedLo, z1: fixedHi }
          : { x0: fixedLo, x1: fixedHi, z0: p, z1: e - gap };
        if (spec.x1 - spec.x0 > 2 && spec.z1 - spec.z0 > 2) {
          this.building({ ...spec, floors, kind: o.kind ?? 3, color, roof: o.roof ?? 'gable', ridge: alongX ? 'x' : 'z', roofColor: o.roofColor ? rng.pick(o.roofColor) : undefined, litP: o.litP ?? 0.42, lot, signChance: o.signChance ?? 0.5, noShops: o.noShops ?? true });
        }
        p = e;
      }
    };
    mk(x0, x1, z0, z0 + dN - gap, true, 'N');
    mk(x0, x1, z1 - dS, z1, true, 'S');
    mk(z0 + dN, z1 - dS, x0, x0 + dW - gap, false, 'W');
    mk(z0 + dN, z1 - dS, x1 - dE, x1, false, 'E');
    const court = { x0: x0 + dW, x1: x1 - dE, z0: z0 + dN, z1: z1 - dS };
    if (o.courtyard !== false) this.courtyard(court, o.courtyardGreen ?? rng.chance(0.55));
    return court;
  }
  courtyard(c, green = true) {
    const rng = this.rng;
    if (c.x1 - c.x0 < 3 || c.z1 - c.z0 < 3) return;
    if (green) { this.grass.floor(c.x0, c.z0, c.x1, c.z1, 0.13, [1, 1, 1], 1 / 8); }
    else this.plaza.floor(c.x0, c.z0, c.x1, c.z1, 0.13, [1, 1, 1], 1 / 2.4);
    const n = Math.floor((c.x1 - c.x0) * (c.z1 - c.z0) / 90);
    for (let k = 0; k < n; k++) this.trees.push({ x: rng.range(c.x0 + 1.5, c.x1 - 1.5), z: rng.range(c.z0 + 1.5, c.z1 - 1.5), s: rng.range(0.7, 1.1), type: 0 });
  }

  // Mid-rise blocks on an nx x nz subdivision (2-4 volumes with alleys between them).
  grid(lot, o = {}) {
    const rng = this.rng;
    const { x0, x1, z0, z1 } = lot;
    const nx = o.nx ?? rng.int(2, 3), nz = o.nz ?? rng.int(1, 2);
    const mg = o.margin ?? 1.2;
    const xs = [x0], zs = [z0];
    for (let i = 1; i < nx; i++) xs.push(x0 + ((x1 - x0) * i) / nx + rng.range(-3, 3));
    for (let k = 1; k < nz; k++) zs.push(z0 + ((z1 - z0) * k) / nz + rng.range(-3, 3));
    xs.push(x1); zs.push(z1);
    const kindsPick = () => (o.kinds ? rng.pick(o.kinds) : 1);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (rng.chance(o.courtyardP ?? 0.08)) { // leave a small plaza / pocket park instead of a building
        this.courtyard({ x0: xs[i] + 2, x1: xs[i + 1] - 2, z0: zs[k] + 2, z1: zs[k + 1] - 2 }, rng.chance(0.6)); continue;
      }
      const bx0 = xs[i] + (i === 0 ? 0 : mg), bx1 = xs[i + 1] - (i === nx - 1 ? 0 : mg);
      const bz0 = zs[k] + (k === 0 ? 0 : mg), bz1 = zs[k + 1] - (k === nz - 1 ? 0 : mg);
      const floors = rng.int(o.fmin ?? 4, o.fmax ?? 9);
      const kind = kindsPick();
      const color = kind === 2 ? this.pal('glass') : kind === 1 ? this.pal('brick') : o.pal ? this.pal(o.pal) : this.pal('paint');
      this.building({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, floors, kind, color, lot, litP: o.litP ?? 0.45, signChance: o.signChance ?? 0.5,
        podium: floors >= 9 && rng.chance(o.podium ?? 0.5) && bx1 - bx0 > 14 && bz1 - bz0 > 14 });
    }
  }

  // Dense tower block: podium + 1-2 towers.
  towers(lot, o = {}) {
    const rng = this.rng;
    const { x0, x1, z0, z1 } = lot;
    const nT = rng.chance(0.4) ? 2 : 1;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const pf = 2;
    // podium (shops) over the full lot
    const podTop = this._part(x0, x1, z0, z1, pf, 4, this.pal('commercial'), 0, true, 0.5, true);
    this.shadows.push({ x0, x1, z0, z1 });
    this._signs({ x0, x1, z0, z1, kind: 4, lot }, x1 - x0, z1 - z0, true);
    let tallest = podTop;
    for (let k = 0; k < nT; k++) {
      const tw = rng.range(16, 24), td = rng.range(16, 24);
      const px = nT === 1 ? cx + rng.range(-3, 3) : cx + (k ? 1 : -1) * rng.range(8, 11);
      const pz = nT === 1 ? cz + rng.range(-3, 3) : cz + (k ? 1 : -1) * rng.range(6, 10);
      const kind = rng.chance(o.glassP ?? 0.65) ? 2 : (rng.chance(0.5) ? 0 : 1);
      const floors = rng.int(o.fmin ?? 12, o.fmax ?? 26);
      const color = kind === 2 ? this.pal('glass') : kind === 1 ? this.pal('brick') : this.pal('paint');
      const bay = BAY[kind];
      const bx0 = Math.max(x0 + 2, px - tw / 2), bz0 = Math.max(z0 + 2, pz - td / 2);
      const nbx = Math.max(2, Math.floor((Math.min(x1 - 2, px + tw / 2) - bx0) / bay)), nbz = Math.max(2, Math.floor((Math.min(z1 - 2, pz + td / 2) - bz0) / bay));
      const r = { x0: bx0, x1: bx0 + nbx * bay, z0: bz0, z1: bz0 + nbz * bay };
      const top = this._tower(r, floors, kind, color, podTop, 0.55, { noSetback: false }, false);
      tallest = Math.max(tallest, top);
    }
    this.addCollider(x0, x1, z0, z1, tallest);
  }

  // Green park: grass overlay, paths, trees. Returns rect.
  park(lot, o = {}) {
    const rng = this.rng;
    const { x0, x1, z0, z1 } = lot;
    this.grass.floor(x0 - 3, z0 - 3, x1 + 3, z1 + 3, 0.13, [1, 1, 1], 1 / 8);
    this.parks.push({ ...lot });
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const pc = col(0xcdbf9a);
    // diagonal + cross paths
    const pw = 1.6;
    this.dirt.quad([x0 - 3, 0.15, cz - pw], [x0 - 3, 0.15, cz + pw], [x1 + 3, 0.15, cz + pw], [x1 + 3, 0.15, cz - pw], pc);
    this.dirt.quad([cx - pw, 0.15, z0 - 3], [cx - pw, 0.15, z1 + 3], [cx + pw, 0.15, z1 + 3], [cx + pw, 0.15, z0 - 3], pc);
    const n = o.trees ?? 28;
    for (let k = 0; k < n; k++) {
      const x = rng.range(x0 + 1.5, x1 - 1.5), z = rng.range(z0 + 1.5, z1 - 1.5);
      if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;
      if (o.avoid && o.avoid(x, z)) continue;
      this.trees.push({ x, z, s: rng.range(0.8, 1.35), type: rng.chance(0.3) ? 1 : 0 });
    }
    // benches
    for (const [bx, bz, r] of [[cx - 6, cz - 3.2, 0], [cx + 6, cz + 3.2, 0], [cx + 3.2, cz - 6, 1], [cx - 3.2, cz + 6, 1]]) {
      const b = this.statics;
      const wood = col(0x7a5230), metal = col(0x2e3236);
      if (r === 0) { b.box(bx - 1, 0.45, bz - 0.25, bx + 1, 0.55, bz + 0.25, wood); b.box(bx - 1, 0.55, bz + 0.2, bx + 1, 1.0, bz + 0.28, wood); b.box(bx - 0.9, 0.13, bz - 0.2, bx - 0.8, 0.45, bz + 0.2, metal); b.box(bx + 0.8, 0.13, bz - 0.2, bx + 0.9, 0.45, bz + 0.2, metal); }
      else { b.box(bx - 0.25, 0.45, bz - 1, bx + 0.25, 0.55, bz + 1, wood); b.box(bx + 0.2, 0.55, bz - 1, bx + 0.28, 1.0, bz + 1, wood); b.box(bx - 0.2, 0.13, bz - 0.9, bx + 0.2, 0.45, bz - 0.8, metal); b.box(bx - 0.2, 0.13, bz + 0.8, bx + 0.2, 0.45, bz + 0.9, metal); }
    }
    return lot;
  }

  // ---------- finalize ----------
  buildInstanced(mat) {
    const n = this.inst.length;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const style = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('aStyle', style);
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    this.inst.forEach((b, k) => {
      p.set(b.x, b.y, b.z); s.set(b.sx, b.sy, b.sz);
      m.compose(p, q, s); im.setMatrixAt(k, m); im.setColorAt(k, b.color);
      style.setXYZW(k, b.kind, b.seed * 100, b.litP, 0);
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true; im.name = 'buildings';
    im.computeBoundingSphere();
    return im;
  }

  buildContactShadows() {
    const n = this.shadows.length;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.min(x, y, 63 - x, 63 - y);
      const a = Math.pow(Math.min(1, d / 7), 1.4) * 0.5;
      const o = (y * 64 + x) * 4; img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0; img.data[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const FR = 1.5;
    this.shadows.forEach((b, k) => {
      p.set((b.x0 + b.x1) / 2, 0.125, (b.z0 + b.z1) / 2); sc.set(b.x1 - b.x0 + FR * 2, 1, b.z1 - b.z0 + FR * 2);
      m.compose(p, q, sc); im.setMatrixAt(k, m);
    });
    im.count = n; im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = 1; im.name = 'contact-shadows';
    return im;
  }

  buildSigns(atlas) {
    const n = this.signs.length;
    const geo = new THREE.PlaneGeometry(1, 1);
    const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    geo.setAttribute('aCell', cellAttr);
    const mat = new THREE.MeshLambertMaterial({ map: atlas });
    const uSign = { value: 0.12 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSign = uSign;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(${(1 / SIGN_COLS).toFixed(5)}, ${(1 / SIGN_ROWS).toFixed(5)}) + aCell;\n#endif`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSign;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uSign;');
    };
    mat.customProgramCacheKey = () => 'sign-atlas-v1';
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    this.signs.forEach((g, k) => {
      p.set(g.x, g.y, g.z); s.set(g.w, g.h, 1); e.set(0, g.ry, 0); q.setFromEuler(e);
      m.compose(p, q, s); im.setMatrixAt(k, m);
      cellAttr.setXY(k, (g.cell % SIGN_COLS) / SIGN_COLS, 1 - (Math.floor(g.cell / SIGN_COLS) + 1) / SIGN_ROWS);
    });
    im.count = n;
    im.instanceMatrix.needsUpdate = true; im.name = 'signs'; im.frustumCulled = false;
    return { mesh: im, uSign };
  }
}
