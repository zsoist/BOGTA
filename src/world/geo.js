// Tiny merged-geometry builder: flat-shaded quads/boxes/cylinders with vertex colors (+ optional UVs).
import * as THREE from 'three';

const _c = new THREE.Color();
export function col(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; }

export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.s = []; this.hasStyle = false; }
  _push(x, y, z, nx, ny, nz, c, u, v, st) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(c[0], c[1], c[2]); this.u.push(u, v);
    if (st) { this.s.push(st[0], st[1], st[2], st[3]); this.hasStyle = true; } else this.s.push(0, 0, 0, 1);
  }
  tri(a, b, c, color, uvs, style) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const cc = typeof color === 'number' || typeof color === 'string' ? col(color) : color;
    const uv = uvs || [0, 0, 1, 0, 1, 1];
    this._push(a[0], a[1], a[2], nx, ny, nz, cc, uv[0], uv[1], style);
    this._push(b[0], b[1], b[2], nx, ny, nz, cc, uv[2], uv[3], style);
    this._push(c[0], c[1], c[2], nx, ny, nz, cc, uv[4], uv[5], style);
  }
  // quad p0..p3 CCW seen from the front. uvs = [u0,v0,u1,v1,u2,v2,u3,v3]
  quad(p0, p1, p2, p3, color, uvs, style) {
    const cc = typeof color === 'number' || typeof color === 'string' ? col(color) : color;
    const uv = uvs || [0, 0, 0, 1, 1, 1, 1, 0];
    this.tri(p0, p1, p2, cc, [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]], style);
    this.tri(p0, p2, p3, cc, [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]], style);
  }
  // Horizontal quad on y (facing up), world-scaled UVs.
  floor(x0, z0, x1, z1, y, color, uvScale = 1) {
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color,
      [x0 * uvScale, z0 * uvScale, x0 * uvScale, z1 * uvScale, x1 * uvScale, z1 * uvScale, x1 * uvScale, z0 * uvScale]);
  }
  box(x0, y0, z0, x1, y1, z1, side, top, o = {}) {
    const sc = typeof side === 'number' || typeof side === 'string' ? col(side) : side;
    const tc = top === undefined ? sc : (typeof top === 'number' || typeof top === 'string' ? col(top) : top);
    const st = o.style;
    if (o.top !== false) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], tc, o.topUV, st);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], sc, undefined, st);
    if (o.sides !== false) {
      const w = o.sideUV;
      this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], sc, w, st);
      this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], sc, w, st);
      this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], sc, w, st);
      this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], sc, w, st);
    }
  }
  // Vertical cylinder / cone / frustum (rTop may be 0).
  cyl(cx, cz, y0, y1, rBot, rTop, seg, color, o = {}) {
    const cc = typeof color === 'number' || typeof color === 'string' ? col(color) : color;
    const tcc = o.top === undefined ? cc : (typeof o.top === 'number' || typeof o.top === 'string' ? col(o.top) : o.top);
    const ph = o.phase || 0;
    for (let i = 0; i < seg; i++) {
      const a0 = ph + (i / seg) * Math.PI * 2, a1 = ph + ((i + 1) / seg) * Math.PI * 2;
      const b0 = [cx + Math.cos(a0) * rBot, y0, cz + Math.sin(a0) * rBot];
      const b1 = [cx + Math.cos(a1) * rBot, y0, cz + Math.sin(a1) * rBot];
      const t0 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop];
      const t1 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
      // outward-facing (normal points away from axis)
      this.tri(b0, t0, t1, cc, undefined, o.style);
      if (rBot > 0.0001) this.tri(b0, t1, b1, cc, undefined, o.style);
      if (o.cap !== false && rTop > 0.0001) this.tri([cx, y1, cz], t1, t0, tcc, undefined, o.style);
      if (o.bottom && rBot > 0.0001) this.tri([cx, y0, cz], b0, b1, cc, undefined, o.style);
    }
  }
  // Sloped / free prism between two rectangles is rarely needed; gable roof helper:
  // ridge along Z (axis='z') or X (axis='x').
  gable(x0, z0, x1, z1, y0, yRidge, color, color2, axis = 'z', over = 0) {
    const cc = typeof color === 'number' || typeof color === 'string' ? col(color) : color;
    const cc2 = color2 === undefined ? cc : (typeof color2 === 'number' || typeof color2 === 'string' ? col(color2) : color2);
    x0 -= over; x1 += over; z0 -= over; z1 += over;
    if (axis === 'z') {
      const mx = (x0 + x1) / 2;
      this.quad([x0, y0, z0], [x0, y0, z1], [mx, yRidge, z1], [mx, yRidge, z0], cc);
      this.quad([x1, y0, z1], [x1, y0, z0], [mx, yRidge, z0], [mx, yRidge, z1], cc2);
      this.tri([x0, y0, z1], [x1, y0, z1], [mx, yRidge, z1], cc);
      this.tri([x1, y0, z0], [x0, y0, z0], [mx, yRidge, z0], cc);
    } else {
      const mz = (z0 + z1) / 2;
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, yRidge, mz], [x1, yRidge, mz], cc);
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, yRidge, mz], [x0, yRidge, mz], cc2);
      this.tri([x0, y0, z0], [x0, y0, z1], [x0, yRidge, mz], cc);
      this.tri([x1, y0, z1], [x1, y0, z0], [x1, yRidge, mz], cc);
    }
  }
  build(withUV = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (withUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    else g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.s, 4));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Extruded polygon prism (walls + flat roof) with window-grid UVs for the building shader.
// pts: [[x,z],...] ordered like (0,0),(1,0),(1,1),(0,1) (increasing angle in the x/z plane). UV x = columns (cell units), UV y = floors.
export function prismGeometry(pts, y0, floors, kind, cellW, cellH, color, seed = 0, litP = 0.5, roofColor) {
  const b = new GeoBuilder();
  const cc = col(color);
  const rc = roofColor !== undefined ? col(roofColor) : cc;
  const y1 = y0 + floors * cellH;
  const st = [kind, seed, litP, 1];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const cols = Math.max(1, Math.round(len / cellW));
    // outward for CCW-from-above polygon (x right, z down on screen): quad a(bottom) -> a(top) -> c(top) -> c(bottom)
    b.quad([a[0], y0, a[1]], [a[0], y1, a[1]], [c[0], y1, c[1]], [c[0], y0, c[1]], cc,
      [0, 0, 0, floors, cols, floors, cols, 0], st);
  }
  // roof (triangle fan)
  let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    b.tri([cx, y1, cz], [c[0], y1, c[1]], [a[0], y1, a[1]], rc, [0, 0, 0, 0, 0, 0], [6, seed, 0, 1]);
  }
  return b;
}
