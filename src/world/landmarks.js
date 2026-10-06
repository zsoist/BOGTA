// Landmark models: every LANDMARK from config.js gets a recognizable low-poly model.
// createLandmarks(ctx, {net, group, rng, mats}) -> { handled:Set<'bi,bj'>, colliders, lamps, trees, exclude, update(dt, world, env) }
import * as THREE from 'three';
import { GeoBuilder, col, prismGeometry } from './geo.js';
import { blockRect } from './layout.js';
import { LANDMARKS } from '../config.js';
import { U, makeRng } from './env.js';
import { PAL } from './buildings.js';
import { heightOf, SHOP_H } from './buildingMat.js';
import { bannerTexture, pitchTexture, glowTexture } from './textures.js';

const LM = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

export function createLandmarks(ctx, { net, group, rng, mats }) {
  const out = {
    handled: new Set(), colliders: [], lamps: [], trees: [], exclude: [],
    updaters: [],
    update(dt, world, env) { for (const u of this.updaters) u(dt, world, env); },
  };
  const R = makeRng(4242);
  const stat = ctx.statics;
  const add = (m) => { group.add(m); return m; };
  const bakedMesh = (gb) => { const m = new THREE.Mesh(gb.build(), mats.baked); m.castShadow = true; m.receiveShadow = true; return add(m); };
  const lotOf = (bi, bj) => { out.handled.add(`${bi},${bj}`); const b = blockRect(bi, bj); return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, cx: b.cx, cz: b.cz }; };
  const collide = (x0, x1, z0, z1, h, kind = 'landmark') => out.colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: h, kind });
  const colorBox = (x0, y0, z0, x1, y1, z1, side, top) => stat.box(x0, y0, z0, x1, y1, z1, col(side), col(top ?? side));
  const nightMats = []; // materials whose intensity follows the night factor
  const glowSprites = [];
  const glowTex = glowTexture();
  const mkGlow = (x, y, z, sx, sy, color, k) => {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const sp = new THREE.Sprite(mat); sp.position.set(x, y, z); sp.scale.set(sx, sy, 1); sp.renderOrder = 6; add(sp); glowSprites.push({ mat, k }); return sp;
  };
  const signMat = (tex, glow = 0.25) => { const m = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow }); m.userData.base = glow; nightMats.push(m); return m; };
  const polyPts = (cx, cz, rx, rz, n, a0 = 0, a1 = Math.PI * 2) => { const p = []; for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); } return p; };

  // ============ Plaza de Bolívar (Capitolio, Catedral, Alcaldía, Palacio de Justicia, statue, pigeons) ============
  {
    const L = lotOf(9, 16); const lm = LM.plaza_bolivar;
    ctx.plaza.floor(L.x0 - 3, L.z0 - 3, L.x1 + 3, L.z1 + 3, 0.13, [1, 1, 1], 1 / 2.4);
    const stone = '#e6dcc4', stone2 = '#d8cdb2';
    // Capitolio Nacional (south side): long neoclassical block with colonnade + pediment
    const cz0 = L.z1 - 15, cz1 = L.z1;
    ctx.addInst((L.x0 + 1 + L.x1 - 1) / 2, 0, (cz0 + cz1) / 2, L.x1 - L.x0 - 2, 17, cz1 - cz0, stone, 0, 0.4);
    ctx.addInst((L.x0 + L.x1) / 2, 17, (cz0 + cz1) / 2, L.x1 - L.x0 - 1.5, 0.6, cz1 - cz0 + 0.5, '#cfc6ae', 6, 0);
    for (let i = 0; i < 10; i++) { const cx = L.x0 + 5 + i * ((L.x1 - L.x0 - 10) / 9); stat.cyl(cx, cz0 - 0.9, 0.5, 13.5, 0.55, 0.5, 8, col(0xf0e9d6)); stat.box(cx - 0.7, 13.5, cz0 - 1.6, cx + 0.7, 14.1, cz0 - 0.2, col(0xe6dcc4), col(0xe6dcc4)); }
    stat.box(L.x0 + 3.5, 14.1, cz0 - 1.8, L.x1 - 3.5, 15.2, cz0 - 0.1, col(0xf0e9d6), col(0xf0e9d6));
    const mx = (L.x0 + L.x1) / 2; stat.tri([L.x1 - 3.5, 15.2, cz0 - 1.8], [L.x0 + 3.5, 15.2, cz0 - 1.8], [mx, 19.2, cz0 - 1.8], col(0xe6dcc4));
    for (let s = 0; s < 4; s++) stat.box(L.x0 + 3 - s * 0.4, s * 0.18, cz0 - 2.6 - s * 0.5, L.x1 - 3 + s * 0.4, s * 0.18 + 0.18, cz0 - 1.8 + 0.1, col(0xcfc6ae), col(0xcfc6ae));
    collide(L.x0 + 1, L.x1 - 1, cz0 - 2.5, cz1, 19);
    // Catedral Primada (east side): twin towers + pediment
    const ex0 = L.x1 - 12, ex1 = L.x1, ez0 = L.z0 + 14, ez1 = L.z0 + 38;
    ctx.addInst((ex0 + ex1) / 2, 0, (ez0 + ez1) / 2, ex1 - ex0, 14, ez1 - ez0, '#d7cdb6', 0, 0.3);
    stat.gable(ex0, ez0, ex1, ez1, 14, 17.2, col(0x6b7075), col(0x5d6267), 'x', 0.3);
    for (const tz of [ez0 + 3.5, ez1 - 3.5]) { ctx.addInst(ex0 + 1, 0, tz, 5.6, 22, 6, '#e0d4b8', 0, 0.3); ctx.addInst(ex0 + 1, 22, tz, 6.2, 0.5, 6.6, '#cfc6ae', 6, 0); stat.cyl(ex0 + 1, tz, 22.5, 28, 4.2, 0, 4, col(0x4f5a60), { phase: Math.PI / 4 }); stat.box(ex0 + 0.9, 28, tz - 0.1, ex0 + 1.1, 30, tz + 0.1, col(0xe3b44a), col(0xe3b44a)); }
    stat.tri([ex0 - 1.5, 14, ez0 + 7], [ex0 - 1.5, 14, ez1 - 7], [ex0 - 1.5, 18.5, (ez0 + ez1) / 2], col(0xe6dcc4));
    stat.box(ex0 - 1.8, 0, (ez0 + ez1) / 2 - 2, ex0 - 0.6, 6, (ez0 + ez1) / 2 + 2, col(0x4a3524), col(0x4a3524));
    collide(ex0 - 1.5, ex1, ez0 - 3, ez1 + 3, 22);
    // Alcaldía (west): colonial-style
    ctx.building({ x0: L.x0, x1: L.x0 + 9, z0: L.z0 + 12, z1: L.z0 + 40, floors: 3, kind: 3, color: '#e8c36a', roof: 'gable', ridge: 'z', litP: 0.5, noShadow: true, noShops: true });
    // Palacio de Justicia (north): brick/glass block
    ctx.building({ x0: L.x0 + 4, x1: L.x1 - 4, z0: L.z0, z1: L.z0 + 8, floors: 4, kind: 1, color: '#8f5a47', litP: 0.45, noShops: true, noSetback: true, noRoofProps: true });
    // Statue of Bolívar (plinth + figure) and low fountain basin
    const sx = (L.x0 + L.x1) / 2 - 2, sz = (L.z0 + L.z1) / 2 - 1;
    stat.cyl(sx, sz, 0.1, 0.5, 4.2, 4.0, 12, col(0xcfc6ae));
    stat.cyl(sx, sz, 0.5, 1.2, 2.2, 2.0, 8, col(0xbdb49c));
    colorBox(sx - 1.1, 1.2, sz - 1.1, sx + 1.1, 4.2, sz + 1.1, '#aaa392');
    stat.cyl(sx, sz, 4.2, 6.4, 0.55, 0.4, 6, col(0x4f5a49));
    stat.cyl(sx, sz, 6.4, 7.4, 0.4, 0.4, 6, col(0x4f5a49));
    stat.box(sx - 0.2, 6.2, sz - 0.9, sx + 0.2, 6.5, sz + 0.1, col(0x4f5a49), col(0x4f5a49));
    collide(sx - 2, sx + 2, sz - 2, sz + 2, 7.4);
    // flags
    for (const fx of [L.x0 + 4, L.x1 - 4]) { stat.box(fx - 0.08, 0, L.z0 + 12, fx + 0.08, 12, L.z0 + 12.16, col(0xcccccc), col(0xcccccc)); stat.quad([fx, 11.8, L.z0 + 12.1], [fx, 10.2, L.z0 + 12.1], [fx + 2.4, 10.2, L.z0 + 12.1], [fx + 2.4, 11.8, L.z0 + 12.1], col(0xf6d21a)); stat.quad([fx, 10.9, L.z0 + 12.1], [fx, 10.2, L.z0 + 12.1], [fx + 2.4, 10.2, L.z0 + 12.1], [fx + 2.4, 10.9, L.z0 + 12.1], col(0xc8202a)); stat.quad([fx, 11.4, L.z0 + 12.1], [fx, 10.9, L.z0 + 12.1], [fx + 2.4, 10.9, L.z0 + 12.1], [fx + 2.4, 11.4, L.z0 + 12.1], col(0x1f4aa8)); }
    for (const [lx, lz] of [[L.x0 + 12, L.z0 + 14], [L.x1 - 14, L.z0 + 14], [L.x0 + 12, L.z1 - 20], [L.x1 - 14, L.z1 - 20]]) out.lamps.push({ x: lx, z: lz, ry: 0 });
    out.exclude.push({ x: L.cx, z: L.cz, r: 1 });

    // pigeons
    const N = 70;
    const pb = new GeoBuilder();
    pb.box(-0.12, 0.12, -0.2, 0.12, 0.34, 0.2, col(0x7e8794), col(0x8e97a4));
    pb.box(-0.07, 0.3, -0.3, 0.07, 0.44, -0.14, col(0x5d6470), col(0x5d6470));
    pb.box(-0.1, 0.16, 0.2, 0.1, 0.24, 0.42, col(0x6a717c), col(0x6a717c));
    pb.box(-0.03, 0.3, -0.34, 0.03, 0.34, -0.3, col(0xe0a060), col(0xe0a060));
    const pigMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const pigeons = new THREE.InstancedMesh(pb.build(), pigMat, N);
    const wb = new GeoBuilder(); wb.box(0, -0.015, -0.12, 0.42, 0.015, 0.14, col(0x6f7783), col(0x7e8794));
    const wingR = new THREE.InstancedMesh(wb.build(), pigMat, N), wingL = new THREE.InstancedMesh(wb.build(), pigMat, N);
    for (const m of [pigeons, wingR, wingL]) { m.frustumCulled = false; m.castShadow = false; add(m); }
    const P = [];
    const plaza = { x0: L.x0 + 10, x1: L.x1 - 4, z0: L.z0 + 12, z1: L.z1 - 18 };
    for (let i = 0; i < N; i++) P.push({ hx: R.range(plaza.x0, plaza.x1), hz: R.range(plaza.z0, plaza.z1), x: 0, z: 0, ph: R() * 6.28, hd: R() * 6.28, mode: 0, t: 0, T: 6, ang: R() * 6.28, dir: R() < 0.5 ? 1 : -1, wander: R() * 6.28 });
    const o = new THREE.Object3D(), ow = new THREE.Object3D();
    const nearTo = (pos, x, z, r) => pos && Math.abs(pos.x - x) < r && Math.abs(pos.z - z) < r && Math.hypot(pos.x - x, pos.z - z) < r;
    out.updaters.push((dt, world, env) => {
      const pp = world?.player?.position;
      const veh = world?.vehicles;
      const tt = env.time;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.mode === 0) {
          p.wander += dt * 0.4;
          p.x = p.hx + Math.sin(p.wander * 1.3 + p.ph) * 0.8; p.z = p.hz + Math.cos(p.wander + p.ph) * 0.8;
          const peck = Math.max(0, Math.sin(tt * 3 + p.ph * 5)) * 0.07;
          let scare = nearTo(pp, p.x, p.z, 6);
          if (!scare && veh) for (let k = 0; k < veh.length && !scare; k++) { const vp = veh[k].position; if (vp && nearTo(vp, p.x, p.z, 9) && Math.abs(veh[k].speed || 0) > 3) scare = true; }
          if (scare) { p.mode = 1; p.t = 0; p.T = R.range(5, 9); p.ang = Math.atan2(p.z - (pp ? pp.z : p.z - 1), p.x - (pp ? pp.x : p.x - 1)); }
          o.position.set(p.x, 0.12 + 0.0, p.z); o.rotation.set(0.25 * (peck > 0.02 ? 1 : 0.2), p.hd + Math.sin(p.wander) * 0.3, 0); o.scale.setScalar(1.25);
          o.position.y = 0.13;
          o.updateMatrix(); pigeons.setMatrixAt(i, o.matrix);
          ow.position.copy(o.position); ow.rotation.set(0, o.rotation.y, 0); ow.scale.set(0.5, 0.5, 0.5); ow.updateMatrix(); ow.position.set(p.x, 0.27, p.z);
          ow.rotation.set(0, p.hd + Math.sin(p.wander) * 0.3 + Math.PI, 0); ow.scale.set(0.9, 1, 0.9); ow.updateMatrix(); wingR.setMatrixAt(i, ow.matrix);
          ow.rotation.set(0, p.hd + Math.sin(p.wander) * 0.3, 0); ow.updateMatrix(); wingL.setMatrixAt(i, ow.matrix);
        } else {
          p.t += dt;
          const u = p.t / p.T;
          if (u >= 1) { p.mode = 0; p.x = p.hx; p.z = p.hz; continue; }
          const e = Math.sin(Math.PI * Math.min(1, u * 1.0));
          const a = p.ang + p.dir * u * 3.2;
          const r = 16 * e * (0.6 + 0.4 * Math.sin(p.ph));
          const x = p.hx + Math.cos(a) * r, z = p.hz + Math.sin(a) * r, y = 0.2 + 9 * e;
          const hd = -(a + p.dir * Math.PI / 2) - Math.PI / 2 + (p.dir > 0 ? Math.PI : 0);
          o.position.set(x, y, z); o.rotation.set(-0.15, hd, p.dir * 0.35); o.scale.setScalar(1.25); o.updateMatrix(); pigeons.setMatrixAt(i, o.matrix);
          const flap = Math.sin(tt * 26 + p.ph * 7) * 0.9;
          ow.position.set(x, y + 0.3, z); ow.rotation.set(0, hd + Math.PI, flap); ow.scale.set(1.2, 1, 1.2); ow.updateMatrix(); wingR.setMatrixAt(i, ow.matrix);
          ow.rotation.set(0, hd, -flap); ow.updateMatrix(); wingL.setMatrixAt(i, ow.matrix);
        }
      }
      pigeons.instanceMatrix.needsUpdate = wingR.instanceMatrix.needsUpdate = wingL.instanceMatrix.needsUpdate = true;
    });
  }

  // ============ La Candelaria: colorful colonial ring around a courtyard with a pila ============
  {
    const L = lotOf(11, 17);
    const court = ctx.ring(L, { pal: 'colonial', kind: 3, fmin: 2, fmax: 3, roof: 'gable', dmin: 12, dmax: 14, wmin: 6, wmax: 10, gap: 0.6, litP: 0.5, signChance: 0.6, courtyard: false });
    ctx.plaza.floor(court.x0, court.z0, court.x1, court.z1, 0.13, [1, 1, 1], 1 / 2.4);
    const cx = (court.x0 + court.x1) / 2, cz = (court.z0 + court.z1) / 2;
    stat.cyl(cx, cz, 0.13, 0.9, 2.3, 2.1, 10, col(0xcfc6ae)); stat.cyl(cx, cz, 0.9, 1.0, 1.9, 1.9, 10, col(0x4aa6c4)); stat.cyl(cx, cz, 1.0, 2.8, 0.35, 0.3, 6, col(0xcfc6ae));
    collide(cx - 2.3, cx + 2.3, cz - 2.3, cz + 2.3, 2.8);
    for (const [tx, tz] of [[court.x0 + 2, court.z0 + 2], [court.x1 - 2, court.z1 - 2]]) out.trees.push({ x: tx, z: tz, s: 0.9, type: 0 });
    // colorful bunting across the courtyard
    const colors = [0xe8484d, 0xf6d21a, 0x2f6fd6, 0x2fb26a, 0xe86b9a, 0xf08a3a];
    for (const zz of [court.z0 + 3, court.z1 - 3]) for (let x = court.x0 + 0.5; x < court.x1 - 0.5; x += 1.0) {
      const k = Math.round((x - court.x0) / 1.0);
      const sag = 0.45 * Math.sin(((x - court.x0) / (court.x1 - court.x0)) * Math.PI);
      stat.tri([x, 5.2 - sag, zz], [x + 0.8, 5.2 - sag, zz], [x + 0.4, 4.5 - sag, zz], col(colors[k % colors.length]));
    }
  }

  // ============ Torre Bacatanga (twin glass towers with crown + beacons) ============
  const beacons = [];
  {
    const L = lotOf(11, 15);
    const podTop = ctx._part(L.x0, L.x1, L.z0, L.z1, 3, 4, '#d6c8ac', 0, true, 0.5, true);
    ctx.shadows.push({ x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1 });
    ctx._signs({ x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1, kind: 4, lot: L }, L.x1 - L.x0, L.z1 - L.z0, true);
    const chamfer = (cx, cz, hw, hd, c) => [[cx - hw + c, cz - hd], [cx + hw - c, cz - hd], [cx + hw, cz - hd + c], [cx + hw, cz + hd - c], [cx + hw - c, cz + hd], [cx - hw + c, cz + hd], [cx - hw, cz + hd - c], [cx - hw, cz - hd + c]];
    const mkTower = (cx, cz, hw, floors, colr, name) => {
      const gb = prismGeometry(chamfer(cx, cz, hw, hw, 1.8), podTop, floors, 2, 2.4, 3.6, colr, R(), 0.6, '#9aa7b3');
      const top = podTop + floors * 3.6;
      // stepped crown
      const g2 = prismGeometry(chamfer(cx, cz, hw * 0.72, hw * 0.72, 1.2), top, 3, 2, 2.4, 3.6, colr, R(), 0.6, '#9aa7b3');
      const g3 = prismGeometry(chamfer(cx, cz, hw * 0.4, hw * 0.4, 0.8), top + 10.8, 2, 5, 3.4, 3.4, '#7e8c99', R(), 0, '#cfd6dc');
      for (const g of [g2, g3]) { gb.p.push(...g.p); gb.n.push(...g.n); gb.c.push(...g.c); gb.u.push(...g.u); gb.s.push(...g.s); }
      bakedMesh(gb);
      const ty = top + 10.8 + 6.8;
      stat.box(cx - 0.18, ty, cz - 0.18, cx + 0.18, ty + 18, cz + 0.18, col(0x5c6168), col(0x5c6168));
      for (let k = 0; k < 3; k++) stat.box(cx - 0.4, ty + 4 + k * 5, cz - 0.4, cx + 0.4, ty + 5.2 + k * 5, cz + 0.4, col(0xd04040), col(0xd04040));
      const bm = new THREE.MeshBasicMaterial({ color: 0xff2020 }); const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), bm); b.position.set(cx, ty + 18.6, cz); add(b); beacons.push({ bm, b });
      mkGlow(cx, ty + 18.6, cz, 16, 16, 0xff3030, 0.9);
      return top + 10.8 + 6.8;
    };
    const hA = mkTower(L.cx - 7, L.cz - 6, 7, 53, '#5f8aa8');
    const hB = mkTower(L.cx + 9, L.cz + 8, 6, 42, '#4a7b98');
    collide(L.x0, L.x1, L.z0, L.z1, hA);
    LM.bacata.towerTop = hA;
  }

  // ============ Torre Colpatranca (tall, LED facade cycles colors at night) ============
  {
    const L = lotOf(10, 14);
    const podTop = ctx._part(L.x0, L.x1, L.z0, L.z1, 3, 4, '#d6c8ac', 0, true, 0.5, true);
    ctx.shadows.push({ x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1 });
    ctx._signs({ x0: L.x0, x1: L.x1, z0: L.z0, z1: L.z1, kind: 4, lot: L }, L.x1 - L.x0, L.z1 - L.z0, true);
    const cx = L.cx, cz = L.cz, hw = 8.5, floors = 38;
    const rect = (hw2, hd2) => [[cx - hw2, cz - hd2], [cx + hw2, cz - hd2], [cx + hw2, cz + hd2], [cx - hw2, cz + hd2]];
    const gb = prismGeometry(rect(hw, hw), podTop, floors, 2, 2.4, 3.6, '#3d5a74', R(), 0.6, '#9aa7b3');
    const top = podTop + floors * 3.6;
    const g2 = prismGeometry(rect(hw * 0.78, hw * 0.78), top, 3, 2, 2.4, 3.6, '#3d5a74', R(), 0.6, '#9aa7b3');
    const g3 = prismGeometry(rect(hw * 0.5, hw * 0.5), top + 10.8, 2, 5, 3.4, 3.4, '#6f7f8c', R(), 0, '#cfd6dc');
    for (const g of [g2, g3]) { gb.p.push(...g.p); gb.n.push(...g.n); gb.c.push(...g.c); gb.u.push(...g.u); gb.s.push(...g.s); }
    bakedMesh(gb);
    const sy = top + 10.8 + 6.8;
    stat.cyl(cx, cz, sy, sy + 34, 0.5, 0.06, 6, col(0xd8dde2));
    collide(L.x0, L.x1, L.z0, L.z1, sy);
    // LED facade overlay (additive, only visible at night)
    const ledMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uNight: U.uNight, uTime: U.uTime },
      vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uNight; uniform float uTime; varying vec3 vW; varying vec3 vN;
        void main(){
          if (abs(vN.y) > 0.5) discard;
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          float y = vW.y;
          vec3 rb = 0.5 + 0.5 * cos(6.28318 * (y * 0.010 + uTime * 0.07 + u * 0.01 + vec3(0.0, 0.33, 0.67)));
          float wave = 0.5 + 0.5 * sin(y * 0.22 - uTime * 1.6 + sin(u * 0.4 + uTime * 0.5) * 2.0);
          float rails = smoothstep(0.15, 0.45, abs(fract(u * 0.62) - 0.5));
          float flag = step(0.5, fract(uTime * 0.05));
          float band = floor(fract(y * 0.02 - uTime * 0.05) * 3.0);
          vec3 fl = band < 0.5 ? vec3(1.0, 0.82, 0.1) : (band < 1.5 ? vec3(0.1, 0.25, 0.9) : vec3(0.9, 0.12, 0.12));
          vec3 c = mix(rb, fl, flag * 0.8);
          float a = uNight * (0.28 + 0.5 * wave) * (0.35 + 0.65 * rails);
          gl_FragColor = vec4(c * 1.15, a);
        }`,
    });
    const led = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.5, floors * 3.6, hw * 2 + 0.5), ledMat);
    led.position.set(cx, podTop + (floors * 3.6) / 2, cz); led.renderOrder = 7; add(led);
    mkGlow(cx, podTop + floors * 3.6 * 0.55, cz, 70, 160, 0x6a7cff, 0.18);
    const bm = new THREE.MeshBasicMaterial({ color: 0xff2020 }); const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), bm); b.position.set(cx, sy + 34.4, cz); add(b); beacons.push({ bm, b });
  }

  // ============ Torres del Parque (curved brick crescents) ============
  {
    const L = lotOf(11, 13);
    ctx.plaza.floor(L.x0, L.z0, L.x1, L.z1, 0.13, [1, 1, 1], 1 / 2.4);
    const crescent = (cx, cz, ro, ri, a0, a1, n) => {
      const p = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([cx + Math.cos(a) * ro, cz + Math.sin(a) * ro]); }
      for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; p.push([cx + Math.cos(a) * ri, cz + Math.sin(a) * ri]); }
      return p;
    };
    const specs = [[L.cx - 8, L.cz - 3, 15, 9.5, 2.2, 3.7, 8, 28], [L.cx + 7, L.cz + 9, 12, 7.5, 3.6, 5.3, 7, 21], [L.cx + 10, L.cz - 8, 10, 6, 1.9, 3.1, 6, 15]];
    let maxH = 0;
    for (const [cx, cz, ro, ri, a0, a1, n, floors] of specs) {
      const gb = prismGeometry(crescent(cx, cz, ro, ri, a0, a1, n), 0.1, floors, 1, 3.5, 3.2, '#a85a3e', R(), 0.5, '#7a7a74');
      const top = 0.1 + floors * 3.2;
      // lighter concrete base + crown band
      const gb2 = prismGeometry(crescent(cx, cz, ro + 0.1, ri - 0.1, a0, a1, n), top, 1, 6, 3.5, 3.0, '#c9c0ae', R(), 0, '#9a968c');
      for (const g of [gb2]) { gb.p.push(...g.p); gb.n.push(...g.n); gb.c.push(...g.c); gb.u.push(...g.u); gb.s.push(...g.s); }
      bakedMesh(gb); maxH = Math.max(maxH, top + 3);
    }
    collide(L.x0 + 2, L.x1 - 2, L.z0 + 2, L.z1 - 2, maxH);
    for (const [tx, tz] of [[L.x0 + 1.5, L.z0 + 1.5], [L.x1 - 1.5, L.z1 - 1.5], [L.x0 + 1.5, L.z1 - 1.5]]) out.trees.push({ x: tx, z: tz, s: 1, type: 0 });
  }

  // ============ Universidad Santo Tomás — "BUILD DAY" ============
  {
    const L = lotOf(9, 6);
    ctx.plaza.floor(L.x0 - 3, L.z0 - 3, L.x1 + 3, L.z1 + 3, 0.13, [1, 1, 1], 1 / 2.4);
    const bx0 = L.x0 + 13, bx1 = L.x1 - 1, bz0 = L.z0 + 5, bz1 = L.z1 - 4;
    const floors = 7;
    const top = ctx._part(bx0, bx1, bz0, bz1, floors, 1, '#c98b6c', 0, false, 0.55, true);
    // lighter stone base + portico + steps facing the west plaza
    stat.box(bx0 - 3.4, 5.8, (bz0 + bz1) / 2 - 7.5, bx0, 6.3, (bz0 + bz1) / 2 + 7.5, col(0xe0d6c0), col(0xcfc6ae));
    stat.box(bx0 - 0.2, 0, (bz0 + bz1) / 2 - 2.2, bx0 + 0.05, 4.2, (bz0 + bz1) / 2 + 2.2, col(0x2a2f3a), col(0x2a2f3a));
    for (let k = 0; k < 5; k++) stat.cyl(bx0 - 2.4, (bz0 + bz1) / 2 - 5.2 + k * 2.6, 0, 6.2, 0.4, 0.38, 8, col(0xf0e9d6));
    for (let s = 0; s < 4; s++) stat.box(bx0 - 4.6 - s * 0.5, s * 0.15, (bz0 + bz1) / 2 - 8, bx0 - 3 - s * 0.5 + 1.2, s * 0.15 + 0.15, (bz0 + bz1) / 2 + 8, col(0xcfc6ae), col(0xcfc6ae));
    stat.box(bx0 - 0.4, 0, bz0 - 0.1, bx1, 0.5, bz1 + 0.1, col(0xb9ac98), col(0xb9ac98));
    collide(bx0 - 0.5, bx1, bz0, bz1, top);
    ctx.shadows.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 });
    // BUILD DAY marquee facing the west plaza (and a second one on the south face)
    const tex = bannerTexture([{ text: 'BUILD DAY 🤖', size: 150, color: '#ffffff', glow: '#ffd400' }, { text: 'UNIVERSIDAD SANTO TOMÁS', size: 52, color: '#ffd400' }], { w: 1024, h: 256, bg: '#101a3d', accent: '#ffd400' });
    const sm = signMat(tex, 0.32);
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), sm); sw.position.set(bx0 - 0.15, 18.5, (bz0 + bz1) / 2); sw.rotation.y = -Math.PI / 2; add(sw);
    const ss = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), sm); ss.position.set((bx0 + bx1) / 2, 18.5, bz1 + 0.15); add(ss);
    mkGlow(bx0 - 4, 18.5, (bz0 + bz1) / 2, 40, 18, 0xffd060, 0.25);
    // flag poles
    for (let k = 0; k < 3; k++) {
      const fz = (bz0 + bz1) / 2 - 8 + k * 8, fx = L.x0 + 8;
      stat.box(fx - 0.07, 0, fz - 0.07, fx + 0.07, 9, fz + 0.07, col(0xd0d0d0), col(0xd0d0d0));
      const fc = [[0xf6d21a, 0xc8202a], [0x1f4aa8, 0xf6d21a], [0xffffff, 0x1f4aa8]][k];
      stat.quad([fx, 8.9, fz], [fx, 8.0, fz], [fx, 8.0, fz + 1.8], [fx, 8.9, fz + 1.8], col(fc[0])); stat.quad([fx, 8.0, fz], [fx, 7.2, fz], [fx, 7.2, fz + 1.8], [fx, 8.0, fz + 1.8], col(fc[1]));
    }
    out.trees.push({ x: L.x0 + 4, z: L.z0 + 4, s: 1.0, type: 0 }, { x: L.x0 + 4, z: L.z1 - 3, s: 1.1, type: 0 }, { x: L.x0 + 9, z: L.z1 - 6, s: 0.9, type: 1 });
    out.exclude.push({ x: 201, z: -148, r: 6 });
  }

  // ============ Zona T (ring of bars around a plaza with string lights + neon) ============
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  let bulbs = null;
  {
    const L = lotOf(7, 4);
    const court = ctx.ring(L, { pal: 'brick', kind: 1, roof: 'flat', fmin: 3, fmax: 4, dmin: 11, dmax: 12, wmin: 9, wmax: 13, gap: 0.5, litP: 0.6, signChance: 0.9, courtyard: false, noShops: false, colors: PAL.brick });
    // plaza floor with a checker of tiles
    ctx.plaza.floor(court.x0, court.z0, court.x1, court.z1, 0.13, [0.85, 0.75, 0.9], 1 / 2.4);
    const nb = new GeoBuilder();
    // neon bars along the plaza-facing facades
    const ncols = [0xff2d95, 0x28e0ff, 0xffd400, 0xff7a1a, 0x8a5bff];
    for (let i = 0; i < 9; i++) {
      const c = col(ncols[i % ncols.length]);
      const x = court.x0 + 2 + i * ((court.x1 - court.x0 - 4) / 8);
      nb.box(x - 0.9, 4.2, court.z0 - 0.15, x + 0.9, 4.45, court.z0 - 0.05, c, c);
      nb.box(x - 0.9, 4.2, court.z1 + 0.05, x + 0.9, 4.45, court.z1 + 0.15, c, c);
    }
    const nm = new THREE.Mesh(nb.build(), neonMat); add(nm);
    // string lights criss-crossing the plaza
    const poles = [[court.x0, court.z0], [court.x1, court.z0], [court.x0, court.z1], [court.x1, court.z1], [(court.x0 + court.x1) / 2, court.z0], [(court.x0 + court.x1) / 2, court.z1]];
    for (const [px, pz] of poles) stat.box(px - 0.08, 0, pz - 0.08, px + 0.08, 6, pz + 0.08, col(0x2b2f35), col(0x2b2f35));
    const strands = [[0, 3], [1, 2], [4, 5], [0, 5], [1, 5], [2, 4], [3, 4]];
    const bp = [];
    for (const [a, b] of strands) {
      const A = poles[a], B = poles[b], n = 14;
      for (let k = 0; k <= n; k++) { const t = k / n; bp.push([A[0] + (B[0] - A[0]) * t, 6 - 0.9 * Math.sin(Math.PI * t), A[1] + (B[1] - A[1]) * t]); }
    }
    bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bp.length);
    const m4 = new THREE.Matrix4(), cc = new THREE.Color();
    bp.forEach((p, k) => { m4.makeTranslation(p[0], p[1], p[2]); bulbs.setMatrixAt(k, m4); cc.set(ncols[k % ncols.length]); cc.lerp(new THREE.Color(0xfff0c0), 0.3); bulbs.setColorAt(k, cc); });
    bulbs.frustumCulled = false; add(bulbs);
    // umbrellas + tables
    for (let k = 0; k < 14; k++) {
      const ux = R.range(court.x0 + 3, court.x1 - 3), uz = R.range(court.z0 + 3, court.z1 - 3);
      const uc = col(R.pick([0xe8484d, 0xf6d21a, 0x2f6fd6, 0xffffff, 0xf08a3a, 0x2fb26a]));
      stat.box(ux - 0.04, 0, uz - 0.04, ux + 0.04, 2.3, uz + 0.04, col(0x666a70), col(0x666a70));
      stat.cyl(ux, uz, 2.0, 2.6, 1.4, 0, 8, uc);
      stat.cyl(ux, uz, 0.0, 0.75, 0.55, 0.5, 8, col(0x4a3a2e));
    }
    // "ZONA T" marquee on the north building facing the plaza
    const tex = bannerTexture([{ text: 'ZONA T', size: 170, color: '#ff4fae', glow: '#ff2d95' }, { text: 'rumba · tragos · parche', size: 44, color: '#28e0ff' }], { w: 1024, h: 256, bg: '#14081f', accent: '#ff2d95' });
    const zm = signMat(tex, 0.5);
    const zs = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), zm); zs.position.set((court.x0 + court.x1) / 2, 11.2, court.z0 - 0.3); zs.rotation.y = Math.PI; add(zs);
    mkGlow((court.x0 + court.x1) / 2, 9, (court.z0 + court.z1) / 2, 60, 30, 0xff4fae, 0.25);
    const mmx = (court.x0 + court.x1) / 2; ctx.statics.box(mmx - 7.2, 9.4, court.z0 - 0.5, mmx + 7.2, 13.2, court.z0 - 0.3, col(0x14081f), col(0x14081f));
    const cnt = { c: 0 };
    out.updaters.push((dt, world, env) => {
      neonMat.color.setScalar(0.5 + 1.1 * env.night);
      bulbs.material.color.setScalar(0.45 + 1.2 * env.night);
    });
  }

  // ============ Parque 93 ============
  {
    const L = lotOf(8, 3);
    ctx.park(L, { trees: 34, avoid: (x, z) => Math.hypot(x - L.cx, z - L.cz) < 9 });
    // round plaza with fountain + obelisk
    stat.cyl(L.cx, L.cz, 0.12, 0.2, 8.5, 8.5, 16, col(0xd8d0bc), { top: col(0xd8d0bc) });
    stat.cyl(L.cx, L.cz, 0.2, 0.9, 3.4, 3.2, 12, col(0xbdb49c)); stat.cyl(L.cx, L.cz, 0.9, 0.95, 3.0, 3.0, 12, col(0x4aa6c4));
    stat.cyl(L.cx, L.cz, 0.95, 7.5, 0.7, 0.18, 4, col(0xe8e2d0), { phase: Math.PI / 4 });
    collide(L.cx - 3.4, L.cx + 3.4, L.cz - 3.4, L.cz + 3.4, 7.5);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; out.lamps.push({ x: L.cx + Math.cos(a) * 11, z: L.cz + Math.sin(a) * 11, ry: a + Math.PI }); }
    mkGlow(L.cx, 7.5, L.cz, 14, 14, 0xfff0c0, 0.5);
  }

  // ============ Usaquén church + plaza ============
  {
    const L = lotOf(10, 1);
    ctx.plaza.floor(L.x0 - 3, L.z0 - 3, L.x1 + 3, L.z1 + 3, 0.13, [1, 1, 1], 1 / 2.4);
    const cx = L.cx, nz0 = L.z0 + 1, nz1 = L.z0 + 22;
    const white = '#f4efe3';
    ctx.addInst(cx, 0, (nz0 + nz1) / 2, 12, 9.5, nz1 - nz0, white, 5, 0);
    stat.gable(cx - 6, nz0, cx + 6, nz1, 9.5, 14.5, col(0xb5523b), col(0x9a4430), 'x', 0.5);
    // front gable facade + arched door + rose window
    stat.tri([cx - 6, 9.5, nz1 + 0.05], [cx + 6, 9.5, nz1 + 0.05], [cx, 14.8, nz1 + 0.05], col(0xf4efe3));
    stat.box(cx - 1.5, 0, nz1, cx + 1.5, 4.4, nz1 + 0.25, col(0x5a3b25), col(0x5a3b25));
    stat.cyl(cx, nz1 + 0.2, 4.4, 4.5, 1.5, 1.5, 10, col(0x5a3b25));
    stat.box(cx - 0.9, 9.8, nz1 + 0.05, cx + 0.9, 11.4, nz1 + 0.2, col(0x2a3a55), col(0x2a3a55));
    for (const wx of [-4, 4]) stat.box(cx + wx - 0.5, 2.4, nz1 + 0.04, cx + wx + 0.5, 6.2, nz1 + 0.2, col(0x2a3a55), col(0x2a3a55));
    // bell tower (SW corner)
    const tx = cx - 8.8, tz = nz1 - 3;
    ctx.addInst(tx, 0, tz, 5, 20, 5, white, 5, 0);
    ctx.addInst(tx, 20, tz, 5.6, 0.5, 5.6, '#cfc9bb', 6, 0);
    stat.box(tx - 1.4, 16, tz + 2.51, tx + 1.4, 19, tz + 2.6, col(0x2a3a55), col(0x2a3a55));
    stat.cyl(tx, tz, 20.5, 25.5, 3.4, 0, 4, col(0xb5523b), { phase: Math.PI / 4 });
    stat.box(tx - 0.08, 25.5, tz - 0.08, tx + 0.08, 27.5, tz + 0.08, col(0xe3b44a), col(0xe3b44a)); stat.box(tx - 0.5, 26.6, tz - 0.08, tx + 0.5, 26.8, tz + 0.08, col(0xe3b44a), col(0xe3b44a));
    collide(tx - 2.5, cx + 6, nz0, nz1 + 0.5, 20);
    ctx.shadows.push({ x0: tx - 2.5, x1: cx + 6, z0: nz0, z1: nz1 });
    // plaza fountain + trees
    const fz = L.z0 + 34;
    stat.cyl(cx, fz, 0.13, 0.8, 2.2, 2.0, 10, col(0xcfc6ae)); stat.cyl(cx, fz, 0.8, 0.85, 1.8, 1.8, 10, col(0x4aa6c4)); stat.cyl(cx, fz, 0.85, 2.6, 0.3, 0.25, 6, col(0xcfc6ae));
    collide(cx - 2.2, cx + 2.2, fz - 2.2, fz + 2.2, 2.6);
    for (const [tx2, tz2] of [[L.x0 + 4, L.z0 + 27], [L.x1 - 4, L.z0 + 27], [L.x0 + 4, L.z1 - 3], [L.x1 - 4, L.z1 - 3]]) out.trees.push({ x: tx2, z: tz2, s: 1.15, type: 0 });
    // flea-market canopies (colorful)
    for (let k = 0; k < 12; k++) {
      const ux = R.range(L.x0 + 5, L.x1 - 5), uz = R.range(L.z0 + 27, L.z1 - 6);
      if (Math.hypot(ux - cx, uz - fz) < 4) continue;
      const uc = col(R.pick([0xe8484d, 0xf6d21a, 0x2f6fd6, 0x2fb26a, 0xf08a3a, 0xe86b9a]));
      stat.box(ux - 1.2, 0, uz - 0.7, ux + 1.2, 0.95, uz + 0.7, col(0x7a5230), col(0x9a6a40));
      stat.box(ux - 1.3, 2.5, uz - 1.0, ux + 1.3, 2.62, uz + 1.0, uc, uc);
      for (const [dx, dz] of [[-1.2, -0.9], [1.2, -0.9], [-1.2, 0.9], [1.2, 0.9]]) stat.box(ux + dx - 0.04, 0, uz + dz - 0.04, ux + dx + 0.04, 2.5, uz + dz + 0.04, col(0x666a70), col(0x666a70));
    }
    // colonial houses flanking the plaza
    for (const side of [0, 1]) {
      const hx0 = side ? L.x1 - 8 : L.x0, hx1 = side ? L.x1 : L.x0 + 8;
      for (let z = L.z0 + 26; z < L.z1 - 8; z += 9) ctx.building({ x0: hx0, x1: hx1, z0: z, z1: z + 8.2, floors: 2, kind: 3, color: R.pick(PAL.whitewash), roof: 'gable', ridge: 'z', litP: 0.5, lot: L, signChance: 0.5, noShops: true });
    }
    mkGlow(tx, 14, tz, 24, 30, 0xffd9a0, 0.2);
  }

  // ============ El Campín stadium ============
  {
    const L = lotOf(2, 9);
    const cx = L.cx, cz = L.cz;
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.scale.set(1, 1, 0.9); add(g);
    // outer wall (20-gon prism, grey concrete with window slits)
    const wallGB = prismGeometry(polyPts(0, 0, 22.5, 22.5, 20), 0, 5, 0, 3.5, 3.2, '#d2d0c8', R(), 0.5, '#9a968c');
    const wm = new THREE.Mesh(wallGB.build(), mats.baked); wm.castShadow = true; wm.receiveShadow = true; g.add(wm);
    // seating bowl: stepped frusta, blue/red halves
    const sb = new GeoBuilder();
    const blue = col(0x2b5fd6), red = col(0xd0302f), white = col(0xe8e8e8);
    for (let step = 0; step < 6; step++) {
      const r0 = 13 + step * 1.35, r1 = r0 + 1.35, y0 = 1 + step * 2.0, y1 = y0 + 2.0;
      for (let i = 0; i < 20; i++) {
        const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2;
        const half = Math.cos((a0 + a1) / 2) > 0;
        const c = (i % 5 === 0) ? white : (half ? blue : red);
        const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
        sb.quad(p(a0, r0, y0), p(a0, r0, y1), p(a1, r0, y1), p(a1, r0, y0), c);       // riser (inner)
        sb.quad(p(a0, r0, y1), p(a0, r1, y1), p(a1, r1, y1), p(a1, r0, y1), c);       // tread
      }
    }
    // roof canopy ring
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2, p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      sb.quad(p(a0, 17.5, 16.2), p(a0, 23.2, 17.2), p(a1, 23.2, 17.2), p(a1, 17.5, 16.2), col(0xeeeeea));
      sb.quad(p(a0, 17.5, 16.0), p(a1, 17.5, 16.0), p(a1, 23.2, 17.0), p(a0, 23.2, 17.0), col(0x9a9a96));
    }
    const sm = new THREE.Mesh(sb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })); sm.castShadow = true; sm.receiveShadow = true; g.add(sm);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(26, 17.5).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: pitchTexture() })); pitch.position.y = 0.4; pitch.receiveShadow = true; g.add(pitch);
    // floodlight towers
    const fl = new GeoBuilder();
    const heads = [];
    for (const [fx, fz] of [[-21, -18], [21, -18], [-21, 18], [21, 18]]) {
      fl.box(fx - 0.3, 0, fz - 0.3, fx + 0.3, 27, fz + 0.3, col(0x5c6168), col(0x5c6168));
      heads.push([fx, fz]);
    }
    const flm = new THREE.Mesh(fl.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); flm.castShadow = true; g.add(flm);
    const headMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    for (const [fx, fz] of heads) { const hm = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), headMat); hm.position.set(fx, 28, fz); hm.rotation.set(0, Math.atan2(-fx, -fz), 0); g.add(hm); mkGlow(cx + fx, 28, cz + fz * 0.9, 24, 24, 0xfff6d8, 0.8); }
    const dayH = new THREE.Color(0x30343a), nightH = new THREE.Color(2, 1.9, 1.6);
    out.updaters.push((dt, w, env) => { headMat.color.copy(dayH).lerp(nightH, env.night); });
    collide(L.x0, L.x1, L.z0, L.z1, 18);
    ctx.shadows.push({ x0: L.x0 + 1, x1: L.x1 - 1, z0: L.z0 + 2, z1: L.z1 - 2 });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.78; out.trees.push({ x: cx + Math.cos(a) * 25.5 * 0.0 + (k < 2 ? -1 : 1) * 23.5, z: cz + (k % 2 ? 1 : -1) * 19, s: 0.9, type: 0 }); }
  }

  // ============ Parque Simón Bolívar (lakes + ducks) ============
  {
    const blocks = [[0, 7], [1, 7], [0, 8], [1, 8]].map(([bi, bj]) => lotOf(bi, bj));
    const waterGeos = [];
    blocks.forEach((L, k) => {
      ctx.park(L, { trees: k < 2 ? 22 : 30, avoid: k < 2 ? (x, z) => Math.hypot((x - L.cx) / 21, (z - L.cz) / 17) < 1 : undefined });
      if (k < 2) {
        const rx = k === 0 ? 19 : 15, rz = k === 0 ? 14 : 11;
        // sandy shore ring + water
        const shore = new GeoBuilder();
        const n = 28; const sc = col(0xd6c79a);
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          const P = (a, f) => [L.cx + Math.cos(a) * (rx + f), 0.17, L.cz + Math.sin(a) * (rz + f)];
          shore.quad(P(a0, 0), P(a0, 2.2), P(a1, 2.2), P(a1, 0), sc);
        }
        const sm2 = new THREE.Mesh(shore.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); sm2.receiveShadow = true; add(sm2);
        const wg = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2); wg.scale(rx, 1, rz); wg.translate(L.cx, 0.2, L.cz);
        waterGeos.push(wg);
        collide(L.cx - rx * 0.85, L.cx + rx * 0.85, L.cz - rz * 0.85, L.cz + rz * 0.85, 0.5, 'water');
        blocks[k].lake = { cx: L.cx, cz: L.cz, rx, rz };
      }
    });
    const waterMat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: U.uTime, uNight: U.uNight, uDeep: { value: new THREE.Color(0x0f4f66) }, uShallow: { value: new THREE.Color(0x3a9aa0) }, uSky: { value: new THREE.Color(0xb2d6f7) } }]),
      vertexShader: 'varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){\n vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: `uniform float uTime; uniform float uNight; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; varying vec3 vW;
        #include <fog_pars_fragment>
        void main(){
          float n = sin(vW.x * 1.3 + uTime * 0.9) * sin(vW.z * 1.1 - uTime * 0.7) + 0.5 * sin((vW.x + vW.z) * 2.7 + uTime * 1.7);
          vec3 c = mix(uDeep, uShallow, 0.5 + 0.25 * n);
          c = mix(c, uSky, 0.07 + 0.06 * n);
          float sp = smoothstep(0.85, 1.2, n); c += vec3(1.0, 0.95, 0.85) * sp * 0.25 * (1.0 - uNight);
          c *= mix(1.0, 0.18, uNight);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    for (const wg of waterGeos) { const m = new THREE.Mesh(wg, waterMat); m.receiveShadow = false; m.renderOrder = 1; add(m); }
    out.updaters.push((dt, w, env) => { waterMat.uniforms.uSky.value.copy(env.horizon); });
    // ducks
    const lake = blocks[0].lake;
    const db = new GeoBuilder();
    db.box(-0.22, 0, -0.3, 0.22, 0.26, 0.3, col(0xf2efe6), col(0xf2efe6)); db.box(-0.12, 0.26, -0.38, 0.12, 0.5, -0.12, col(0x2f7d4a), col(0x2f7d4a)); db.box(-0.06, 0.34, -0.5, 0.06, 0.4, -0.38, col(0xf0a020), col(0xf0a020));
    const ND = 14;
    const ducks = new THREE.InstancedMesh(db.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), ND);
    ducks.frustumCulled = false; add(ducks);
    const DK = []; for (let i = 0; i < ND; i++) DK.push({ lk: i < 9 ? blocks[0].lake : blocks[1].lake, a: R() * 6.28, sp: R.range(0.05, 0.12) * (R() < 0.5 ? 1 : -1), rr: R.range(0.3, 0.8), ph: R() * 6.28 });
    const od = new THREE.Object3D();
    out.updaters.push((dt, w, env) => {
      for (let i = 0; i < ND; i++) {
        const d = DK[i]; d.a += d.sp * dt;
        const lk = d.lk, a = d.a;
        const x = lk.cx + Math.cos(a) * lk.rx * d.rr, z = lk.cz + Math.sin(a) * lk.rz * d.rr;
        od.position.set(x, 0.19 + Math.sin(env.time * 1.6 + d.ph) * 0.03, z);
        od.rotation.set(0, -Math.atan2(-Math.sin(a) * lk.rz * Math.sign(d.sp), Math.cos(a) * lk.rx * Math.sign(d.sp)) - Math.PI / 2 + Math.PI, 0);
        od.scale.setScalar(1.5); od.updateMatrix(); ducks.setMatrixAt(i, od.matrix);
      }
      ducks.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- shared updates ----------
  out.updaters.push((dt, world, env) => {
    for (const m of nightMats) m.emissiveIntensity = m.userData.base * (0.35 + 3.0 * env.night);
    for (const g of glowSprites) g.mat.opacity = env.night * g.k;
    const blink = (env.time % 1.5) < 0.75;
    for (const b of beacons) { b.bm.color.setRGB(1, 0.12, 0.12); b.b.visible = blink || env.night < 0.3; }
  });
  return out;
}
