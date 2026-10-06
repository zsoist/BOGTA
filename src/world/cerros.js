// Cerros Orientales: heightfield mountain wall (east), Monserrate sanctuary + cable car, forest, hillside barrios.
import * as THREE from 'three';
import { GeoBuilder, col } from './geo.js';
import { LANDMARKS, CERROS_START_X, MONSERRATE_HEIGHT, MAX_X, MIN_Z, MAX_Z } from '../config.js';
import { makeRng, U, sstep } from './env.js';
import { glowTexture } from './textures.js';
import { PAL } from './buildings.js';

const MONS = LANDMARKS.find((l) => l.id === 'monserrate') || { x: 560, z: 440 };
const X_START = MAX_X + 10;

// ---- value noise ----
function h2(ix, iz) { let n = (ix * 374761393 + iz * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z) { return vnoise(x, z) * 0.5 + vnoise(x * 2.1 + 7, z * 2.1 - 3) * 0.28 + vnoise(x * 4.3 - 5, z * 4.3 + 9) * 0.14 + vnoise(x * 8.7, z * 8.7 + 4) * 0.08; }

function baseHeight(x, z) {
  const rise = sstep(X_START + 5, X_START + 215, x);
  const far = sstep(X_START + 150, X_START + 520, x);
  let h = 175 * Math.pow(rise, 0.95) + 120 * far;
  const crest = 1 + 0.16 * Math.sin(z * 0.0042 + 1.3) + 0.09 * Math.sin(z * 0.0113 + 0.4);
  h *= crest;
  h += (fbm(x * 0.012, z * 0.012) - 0.5) * 70 * rise;
  h += (fbm(x * 0.05 + 11, z * 0.05) - 0.5) * 9 * rise;
  const taper = 1 - 0.55 * sstep(850, 1750, Math.abs(z));
  return Math.max(0, h * taper);
}
const PEAK_BASE = baseHeight(MONS.x, MONS.z);
const PEAK_H = Math.max(MONSERRATE_HEIGHT, PEAK_BASE + 25);
export function cerrosHeight(x, z) {
  if (x < X_START) return 0;
  let h = baseHeight(x, z);
  const d = Math.hypot(x - MONS.x, z - MONS.z);
  const bump = (PEAK_H - PEAK_BASE) * Math.exp(-(d * d) / (2 * 52 * 52));
  h += bump;
  const plat = 1 - sstep(10, 22, d); // flat summit platform
  return h + (PEAK_H - h) * plat;
}

function colorAt(x, z, h, slope, out) {
  const n = fbm(x * 0.03 + 3, z * 0.03 - 8);
  const n2 = fbm(x * 0.11, z * 0.11);
  // palette
  const forest = [0.08, 0.25, 0.10], forest2 = [0.13, 0.34, 0.13], grassC = [0.30, 0.45, 0.14], paramo = [0.42, 0.45, 0.20], rock = [0.36, 0.33, 0.28], dry = [0.40, 0.38, 0.18];
  let c = n > 0.5 ? forest : forest2;
  const t1 = sstep(0.4, 0.62, n2); c = c.map((v, i) => v + (grassC[i] - v) * t1 * 0.55);
  const hh = sstep(120, 230, h); c = c.map((v, i) => v + (paramo[i] - v) * hh * 0.7);
  const low = 1 - sstep(8, 55, h); c = c.map((v, i) => v + (dry[i] - v) * low * 0.6);
  const sl = sstep(0.55, 1.1, slope); c = c.map((v, i) => v + (rock[i] - v) * sl * 0.8);
  const k = 0.88 + n2 * 0.25;
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  return out;
}

export function createCerros(scene, opts = {}) {
  const rng = makeRng(2024);
  const group = new THREE.Group(); group.name = 'cerros';

  // ---------- terrain ----------
  const xs = []; for (let x = X_START - 2; x < 700; x += 8) xs.push(x); for (let x = 700; x <= 1500; x += 28) xs.push(x);
  const zs = []; for (let z = -1900; z < -900; z += 24) zs.push(z); for (let z = -900; z < 900; z += 8) zs.push(z); for (let z = 900; z <= 1900; z += 24) zs.push(z);
  const nx = xs.length, nz = zs.length;
  const H = new Float32Array(nx * nz), X = new Float32Array(nx * nz), Z = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const idx = k * nx + i;
    const jx = i > 0 && i < nx - 1 ? (h2(i, k) - 0.5) * 4 : 0, jz = k > 0 && k < nz - 1 ? (h2(i + 91, k + 17) - 0.5) * 4 : 0;
    X[idx] = xs[i] + (xs[i] > 700 ? jx * 4 : jx); Z[idx] = zs[k] + (Math.abs(zs[k]) > 900 ? jz * 4 : jz);
    H[idx] = i === 0 ? 0 : cerrosHeight(X[idx], Z[idx]);
    if (i === 0) H[idx] = -0.05;
  }
  const pos = [], colr = [];
  const tmp = [0, 0, 0];
  const pushTri = (a, b, c) => {
    const cx = (X[a] + X[b] + X[c]) / 3, cz = (Z[a] + Z[b] + Z[c]) / 3, ch = (H[a] + H[b] + H[c]) / 3;
    const ux = X[b] - X[a], uy = H[b] - H[a], uz = Z[b] - Z[a], vx = X[c] - X[a], vy = H[c] - H[a], vz = Z[c] - Z[a];
    let nxn = uy * vz - uz * vy, nyn = uz * vx - ux * vz, nzn = ux * vy - uy * vx;
    const l = Math.hypot(nxn, nyn, nzn) || 1; const slope = Math.sqrt(1 - Math.min(1, (nyn / l) * (nyn / l))) / Math.max(0.05, Math.abs(nyn / l));
    const sgn = nyn < 0 ? -1 : 1;
    colorAt(cx, cz, ch, slope * 0.6, tmp);
    const jit = 0.92 + h2(Math.floor(cx), Math.floor(cz)) * 0.16;
    for (const v of (sgn > 0 ? [a, b, c] : [a, c, b])) { pos.push(X[v], H[v], Z[v]); colr.push(tmp[0] * jit, tmp[1] * jit, tmp[2] * jit); }
  };
  for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
    const a = k * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if ((i + k) & 1) { pushTri(a, c, b); pushTri(b, c, d); } else { pushTri(a, c, d); pushTri(a, d, b); }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = false; terrain.castShadow = false; terrain.frustumCulled = false; terrain.name = 'cerros-terrain';
  group.add(terrain);

  // ---------- forest (instanced low-poly conifers / eucalyptus) ----------
  const tb = new GeoBuilder();
  const trunk = col(0x4b3a2a), g1 = col(0x24592f), g2 = col(0x2f7038), g3 = col(0x3d8844);
  tb.cyl(0, 0, 0, 3, 0.5, 0.35, 5, trunk);
  tb.cyl(0, 0, 2, 7.5, 3.3, 0, 6, g1);
  tb.cyl(0, 0, 5.5, 11.5, 2.7, 0, 6, g2);
  tb.cyl(0, 0, 9, 15.5, 1.9, 0, 6, g3);
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const treePos = [];
  for (let n = 0; n < 5200 && treePos.length < 1700; n++) {
    const x = rng.range(X_START + 6, 760), z = rng.range(-1400, 1400);
    const dens = fbm(x * 0.02, z * 0.02);
    if (dens < 0.46) continue;
    const h = cerrosHeight(x, z);
    if (h < 3 || h > 200) continue;
    if (Math.hypot(x - MONS.x, z - MONS.z) < 36) continue;
    const hx = cerrosHeight(x + 5, z) - cerrosHeight(x - 5, z), hz = cerrosHeight(x, z + 5) - cerrosHeight(x, z - 5);
    if (Math.hypot(hx, hz) > 12) continue; // too steep
    treePos.push([x, h - 0.4, z]);
  }
  const trees = new THREE.InstancedMesh(tb.build(), treeMat, treePos.length);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    treePos.forEach((t, k) => {
      const sc = rng.range(0.9, 1.9);
      p.set(t[0], t[1], t[2]); s.set(sc, sc * rng.range(0.9, 1.4), sc); e.set(0, rng() * 6.28, 0); q.setFromEuler(e); m.compose(p, q, s);
      trees.setMatrixAt(k, m); const v = rng.range(0.8, 1.15); c.setRGB(v, v * rng.range(0.95, 1.1), v * 0.95); trees.setColorAt(k, c);
    }); }
  trees.instanceMatrix.needsUpdate = true; trees.instanceColor.needsUpdate = true; trees.frustumCulled = false; trees.name = 'cerros-forest';
  group.add(trees);

  // ---------- hillside barrios (colorful houses climbing the slope) ----------
  if (opts.buildingMat) {
    const houses = [];
    for (let x = X_START + 6; x < X_START + 100; x += 10) {
      for (let z = MIN_Z - 150; z < MAX_Z + 150; z += 10) {
        const jx = rng.range(-3, 3), jz = rng.range(-3, 3);
        const px = x + jx, pz = z + jz;
        const t = (px - X_START) / 100;
        if (!rng.chance(0.62 - 0.8 * t)) continue;
        if (Math.hypot(px - MONS.x, pz - MONS.z) < 80) continue;
        const w = rng.range(5.5, 8.5), d = rng.range(5.5, 8.5), fl = rng.int(1, 3);
        const gy = Math.min(cerrosHeight(px - w / 2, pz - d / 2), cerrosHeight(px + w / 2, pz + d / 2), cerrosHeight(px - w / 2, pz + d / 2), cerrosHeight(px + w / 2, pz - d / 2));
        houses.push({ x: px, z: pz, w, d, fl, y: gy - 0.6, sk: Math.max(0.6, cerrosHeight(px, pz) - gy + 1.5) });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const style = new THREE.InstancedBufferAttribute(new Float32Array(houses.length * 4), 4); geo.setAttribute('aStyle', style);
    const im = new THREE.InstancedMesh(geo, opts.buildingMat, houses.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    houses.forEach((hs, k) => {
      const hh = hs.fl * 3.4 + 1.4;
      p.set(hs.x, hs.y - hs.sk, hs.z); s.set(hs.w, hh + hs.sk, hs.d); m.compose(p, q, s); im.setMatrixAt(k, m);
      im.setColorAt(k, new THREE.Color(rng.pick(['#e8a14b', '#d8654f', '#f3d46b', '#f2c0a0', '#f4efe2', '#8fc46b', '#4bb3a8', '#e8788a', '#dfe6ea'])));
      style.setXYZW(k, rng.chance(0.3) ? 0 : 3, rng() * 100, 0.4, 0);
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; im.name = 'cerros-barrios';
    group.add(im);
    // roofs: flat terracotta slabs (cheap)
    const roofGeo = new THREE.BoxGeometry(1, 0.35, 1); roofGeo.translate(0, 0.18, 0);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), houses.length);
    houses.forEach((hs, k) => {
      const hh = hs.fl * 3.4 + 1.4;
      p.set(hs.x, hs.y + hh, hs.z); s.set(hs.w + 0.6, 1, hs.d + 0.6); m.compose(p, q, s); roofs.setMatrixAt(k, m);
      roofs.setColorAt(k, new THREE.Color(rng.pick(['#b5523b', '#9a9ea3', '#c2603f', '#7d8187'])));
    });
    roofs.instanceMatrix.needsUpdate = true; roofs.instanceColor.needsUpdate = true; roofs.frustumCulled = false;
    group.add(roofs);
  }

  // ---------- Monserrate sanctuary ----------
  const sx = MONS.x, sz = MONS.z, sy = PEAK_H;
  const sb = new GeoBuilder();
  const white = col(0xf3efe6), stone = col(0xa9a69c), tile = col(0xb5523b), gold = col(0xe3b44a);
  sb.cyl(sx, sz, sy - 3, sy + 0.2, 17, 16, 14, stone, { top: col(0xb9b5aa) });                // terrace
  sb.box(sx - 14, sy, sz - 14, sx + 14, sy + 1.4, sz - 13.4, white, white);                    // low wall
  sb.box(sx - 14, sy, sz + 13.4, sx + 14, sy + 1.4, sz + 14, white, white);
  sb.box(sx - 14, sy, sz - 14, sx - 13.4, sy + 1.4, sz + 14, white, white);
  sb.box(sx + 13.4, sy, sz - 14, sx + 14, sy + 1.4, sz + 14, white, white);
  sb.box(sx - 4.5, sy + 0.2, sz - 9, sx + 4.5, sy + 6.4, sz + 5, white, white);               // nave
  sb.gable(sx - 4.5, sz - 9, sx + 4.5, sz + 5, sy + 6.4, sy + 9.6, tile, col(0x9a4430), 'z', 0.5);
  sb.box(sx - 7.5, sy + 0.2, sz - 6, sx - 4.5, sy + 4.2, sz + 3, white, white);               // side wings
  sb.box(sx + 4.5, sy + 0.2, sz - 6, sx + 7.5, sy + 4.2, sz + 3, white, white);
  sb.box(sx - 2.5, sy + 0.2, sz + 5, sx + 2.5, sy + 8, sz + 8.4, white, white);               // portico/facade
  sb.gable(sx - 2.8, sz + 5, sx + 2.8, sz + 8.6, sy + 8, sy + 10, tile, tile, 'x', 0.2);
  sb.box(sx + 4.5, sy + 0.2, sz + 3, sx + 8, sy + 11, sz + 6.5, white, white);                // bell tower
  sb.cyl(sx + 6.25, sz + 4.75, sy + 11, sy + 15, 2.6, 0, 4, tile, { phase: Math.PI / 4 });
  sb.cyl(sx + 6.25, sz + 4.75, sy + 15, sy + 17.5, 0.12, 0.12, 4, gold);
  sb.box(sx + 6.1, sy + 16.2, sz + 4.6, sx + 6.4, sy + 17, sz + 4.9, gold, gold);
  // big white cross on the ridge
  sb.box(sx - 11.2, sy, sz - 0.2, sx - 10.8, sy + 9, sz + 0.2, white, white);
  sb.box(sx - 12.4, sy + 6.2, sz - 0.2, sx - 9.6, sy + 6.8, sz + 0.2, white, white);
  // comms mast
  sb.box(sx + 9.5, sy, sz - 9, sx + 9.8, sy + 18, sz - 8.7, col(0xd9d9d9), col(0xd9d9d9));
  for (let k = 0; k < 3; k++) sb.box(sx + 9.35, sy + 4 + k * 5, sz - 9.15, sx + 9.95, sy + 5.2 + k * 5, sz - 8.55, col(0xc72b2b), col(0xc72b2b));
  const sanct = new THREE.Mesh(sb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  sanct.castShadow = true; sanct.receiveShadow = true; sanct.name = 'monserrate-sanctuary';
  group.add(sanct);
  // floodlit glow behind the church at night
  const glowTex = glowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glow = new THREE.Sprite(glowMat); glow.position.set(sx + 1, sy + 7, sz + 2); glow.scale.set(70, 50, 1); glow.renderOrder = 6;
  group.add(glow);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 4), beaconMat); beacon.position.set(sx + 9.65, sy + 18.4, sz - 8.85); group.add(beacon);

  // ---------- cable car ----------
  const A = new THREE.Vector3(X_START + 18, 0, MONS.z + 36); A.y = cerrosHeight(A.x, A.z) + 6.5;
  const B = new THREE.Vector3(sx - 17.5, sy + 5.2, sz + 8);
  const cb = new GeoBuilder();
  const cabMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // stations
  const st = (p, big) => { cb.box(p.x - 5, p.y - 6.5, p.z - 4, p.x + 5, p.y + 1.2, p.z + 4, white, col(0xc9c4b8)); cb.box(p.x - 5.5, p.y + 1.2, p.z - 4.5, p.x + 5.5, p.y + 2, p.z + 4.5, col(0xc4161c), col(0xc4161c)); };
  st(A, true);
  const dir = new THREE.Vector3().subVectors(B, A);
  const len = dir.length();
  // pylons
  for (const t of [0.34, 0.68]) {
    const px = A.x + dir.x * t, pz = A.z + dir.z * t, py = A.y + dir.y * t;
    const gy = cerrosHeight(px, pz);
    cb.box(px - 0.4, gy - 1, pz - 0.4, px + 0.4, py + 1.5, pz + 0.4, col(0x8a8d92), col(0x8a8d92));
    cb.box(px - 0.5, py + 1, pz - 1.1, px + 0.5, py + 1.5, pz + 1.1, col(0x5f6368), col(0x5f6368));
  }
  const cableMesh = new THREE.Mesh(cb.build(), cabMat); cableMesh.castShadow = true; group.add(cableMesh);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x2c2f33 });
  const mkCable = (off) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), cableMat);
    const a = A.clone(); a.z += off; a.y += 1.4; const b = B.clone(); b.z += off; b.y += 1.4;
    m.position.copy(a).lerp(b, 0.5); m.scale.z = a.distanceTo(b); m.lookAt(b); group.add(m);
  };
  mkCable(-1.0); mkCable(1.0);
  const cabins = [];
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group();
    const cbb = new GeoBuilder();
    cbb.box(-1.6, -3.4, -1.1, 1.6, -0.9, 1.1, k ? col(0xe8e4da) : col(0xd8222a), col(0xf4f0e6));
    cbb.box(-1.62, -2.7, -1.12, 1.62, -1.7, 1.12, col(0x7fb8d6), col(0x7fb8d6), { top: false });
    cbb.box(-0.06, -0.9, -0.06, 0.06, 0.8, 0.06, col(0x333333), col(0x333333));
    g.add(new THREE.Mesh(cbb.build(), cabMat)); g.userData.off = k ? 1.0 : -1.0; g.castShadow = true; group.add(g); cabins.push(g);
  }
  const dwell = 8, travel = 52, period = 2 * (dwell + travel);
  const ease = (t) => t * t * (3 - 2 * t);
  const sunTmp = new THREE.Color();

  scene.add(group);
  return {
    group, heightAt: cerrosHeight,
    update(dt, env) {
      const t = (env.time % period);
      let u;
      if (t < dwell) u = 0; else if (t < dwell + travel) u = ease((t - dwell) / travel); else if (t < 2 * dwell + travel) u = 1; else u = 1 - ease((t - 2 * dwell - travel) / travel);
      for (let k = 0; k < 2; k++) {
        const uu = k ? 1 - u : u;
        const c = cabins[k];
        c.position.set(A.x + dir.x * uu, A.y + dir.y * uu + 1.4 - Math.sin(uu * Math.PI) * 1.5, A.z + dir.z * uu + c.userData.off);
        c.rotation.z = Math.sin(env.time * 1.3 + k * 2) * 0.03;
      }
      glowMat.opacity = env.night * 0.55;
      beaconMat.color.setScalar(1); beaconMat.color.setRGB(1, 0.15 + 0.1 * Math.sin(env.time * 4), 0.15);
      beacon.visible = (env.time % 1.6) < 0.8 || env.night < 0.4;
    },
  };
}
