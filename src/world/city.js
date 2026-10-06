// GTA Bogotá — city builder. createCity(scene, net) -> { colliders, update(dt, world), group }
// Everything static is merged/instanced: roads (6 draw calls), one InstancedMesh for all buildings,
// one for signs, trees (2), streetlights (4), landmarks (a handful). Deterministic (seeded) so colliders never change.
import * as THREE from 'three';
import { COLS, ROWS, MIN_X, MAX_X, MIN_Z, MAX_Z, districtAt, LANDMARKS } from '../config.js';
import { env, updateEnv, makeRng } from './env.js';
import { GeoBuilder } from './geo.js';
import { getSharedMaterials } from './buildingMat.js';
import { BuildingContext, PAL } from './buildings.js';
import { buildRoads } from './roads.js';
import { blockRect, carreraX, calleZ } from './layout.js';
import { signAtlas, grassTexture, plazaTexture } from './textures.js';
import { buildTrees, placeStreetProps, buildLamps } from './props.js';
import { createLandmarks } from './landmarks.js';

// Extra plain parks (besides the landmark ones) so the grid has some green lungs.
const EXTRA_PARKS = new Set(['3,13', '8,10', '4,2', '5,16', '6,11']);

function genericBlock(ctx, b, rng) {
  const lot = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
  const d = districtAt(b.cz);
  const nearCaracas = b.bi === 5 || b.bi === 6;
  const nearCalle72 = b.bj === 6 || b.bj === 7;
  const r = rng();
  if (d === 'Usaquén') {
    if (r < 0.74) ctx.ring(lot, { pal: 'whitewash', kind: 3, fmin: 1, fmax: 2, roof: 'gable', dmin: 11, dmax: 14, wmin: 7, wmax: 12, gap: 1.0, litP: 0.45,
      colors: rng.chance(0.5) ? undefined : [...PAL.whitewash, ...PAL.whitewash, '#e8a14b', '#d8654f', '#5b8fd6'] });
    else ctx.grid(lot, { nx: 2, nz: 2, fmin: 3, fmax: 5, kinds: [1, 1, 0], litP: 0.45 });
  } else if (d.startsWith('Chicó')) {
    ctx.grid(lot, { nx: 2, nz: rng.int(1, 2), fmin: 5, fmax: nearCaracas ? 14 : 11, kinds: [2, 2, 0, 1], litP: 0.5, podium: 0.6 });
  } else if (d === 'Zona T') {
    ctx.grid(lot, { nx: rng.int(2, 3), nz: rng.int(2, 3), fmin: 3, fmax: 6, kinds: [4, 4, 1, 0], litP: 0.55, signChance: 0.8 });
  } else if (d === 'Chapinero') {
    if (nearCalle72) ctx.grid(lot, { nx: 2, nz: 2, fmin: 8, fmax: 17, kinds: [2, 2, 2, 0, 1], litP: 0.5, podium: 0.7, signChance: 0.6 });
    else if (r < 0.12) ctx.ring(lot, { pal: 'brick', kind: 1, fmin: 2, fmax: 3, roof: 'gable', dmin: 10, dmax: 13, wmin: 8, wmax: 13, gap: 1.6, litP: 0.4, roofColor: ['#4a3c36', '#5a4a42', '#6b5a4d'] });
    else if (r < 0.2) ctx.towers(lot, { fmin: 10, fmax: 20 });
    else ctx.grid(lot, { nx: rng.int(2, 3), nz: rng.int(2, 3), fmin: 4, fmax: nearCaracas ? 12 : 9, kinds: [1, 1, 1, 0, 0, 4, 2], litP: 0.45 });
  } else if (d === 'Teusaquillo') {
    if (r < 0.55) ctx.ring(lot, { pal: 'brick', kind: 1, fmin: 2, fmax: 3, roof: 'gable', dmin: 10, dmax: 13, wmin: 8, wmax: 13, gap: 1.8, litP: 0.4, signChance: 0.25, roofColor: ['#4a3c36', '#5a4a42', '#6b5a4d', '#7a3b2e'] });
    else ctx.grid(lot, { nx: 2, nz: rng.int(2, 3), fmin: 4, fmax: 8, kinds: [1, 1, 1, 0], litP: 0.45 });
  } else if (d.startsWith('Centro')) {
    if (r < 0.55) ctx.towers(lot, { fmin: 12, fmax: 26, glassP: 0.6 });
    else ctx.grid(lot, { nx: 2, nz: 2, fmin: 8, fmax: 16, kinds: [2, 0, 1, 2], litP: 0.5, podium: 0.6 });
  } else { // La Candelaria
    ctx.ring(lot, { pal: 'colonial', kind: 3, fmin: 2, fmax: 3, roof: 'gable', dmin: 11, dmax: 14, wmin: 6, wmax: 10, gap: 0.6, litP: 0.5, signChance: 0.55 });
  }
}

// Low-poly "rest of Bogotá" beyond the playable grid so the world has no visible edge.
function sprawl(ctx, rng) {
  const rect = { x0: MIN_X - 14, x1: MAX_X + 14, z0: MIN_Z - 14, z1: MAX_Z + 14 };
  const STEP = 64, R = 11 * STEP;
  for (let cx = MIN_X - R; cx < MAX_X + 8; cx += STEP) for (let cz = MIN_Z - R; cz < MAX_Z + R; cz += STEP) {
    const mx = cx + STEP / 2, mz = cz + STEP / 2;
    if (mx > rect.x0 && mx < rect.x1 && mz > rect.z0 && mz < rect.z1) continue;
    if (mx > MAX_X + 10) continue;
    const dist = Math.max(rect.x0 - mx, mx - rect.x1, rect.z0 - mz, mz - rect.z1, 0);
    if (rng.chance(0.08 + dist / 2400)) continue;
    const n = rng.int(2, 3);
    const x0 = cx + 9, x1 = cx + STEP - 9, z0 = cz + 9, z1 = cz + STEP - 9;
    for (let a = 0; a < n; a++) {
      const w = rng.range(14, 26), d = rng.range(14, 26);
      const px = rng.range(x0, x1 - w), pz = rng.range(z0, z1 - d);
      const fl = Math.max(2, Math.round(rng.range(2, 7) + (dist < 250 ? rng.range(0, 6) : 0)));
      const kind = rng.pick([1, 1, 0, 0, 2, 3]);
      const color = kind === 2 ? ctx.pal('glass') : kind === 1 ? ctx.pal('brick') : kind === 3 ? ctx.pal('colonial') : ctx.pal('concrete');
      ctx.building({ x0: px, x1: px + w, z0: pz, z1: pz + d, floors: fl, kind, color, noCollider: true, noRoofProps: true, roof: kind === 3 ? 'gable' : 'flat', litP: 0.4 });
    }
  }
}

export function createCity(scene, net) {
  const rng = makeRng(1337);
  const group = new THREE.Group(); group.name = 'city';
  const mats = getSharedMaterials();
  const colliders = [];

  const roads = buildRoads(scene, net, rng);
  group.add(roads.group);
  colliders.push(...roads.colliders);

  const ctx = new BuildingContext(rng);
  const landmarks = createLandmarks(ctx, { net, group, rng, mats });

  for (let bi = 0; bi < COLS; bi++) for (let bj = 0; bj < ROWS; bj++) {
    const key = `${bi},${bj}`;
    if (landmarks.handled.has(key)) continue;
    const b = blockRect(bi, bj);
    if (EXTRA_PARKS.has(key)) { ctx.park({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }, { trees: 30 }); continue; }
    genericBlock(ctx, b, rng);
  }
  sprawl(ctx, rng);

  // street trees + lamps
  const spawn = { x: carreraX(9) + 9, z: calleZ(7) - 20 };
  const props = placeStreetProps(net, rng, { exclude: [{ x: spawn.x, z: spawn.z, r: 7 }, ...(landmarks.exclude || [])] });
  ctx.trees.push(...props.trees);
  for (const t of landmarks.trees || []) ctx.trees.push(t);

  // ---- meshes ----
  const bld = ctx.buildInstanced(mats.instanced); group.add(bld);
  group.add(ctx.buildContactShadows());
  const atlas = signAtlas();
  const signs = ctx.buildSigns(atlas); group.add(signs.mesh);
  const statics = new THREE.Mesh(ctx.statics.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  statics.castShadow = true; statics.receiveShadow = true; statics.name = 'static-props'; group.add(statics);

  const grassTex = grassTexture(), plazaTex = plazaTexture();
  const ov = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
  const grassMesh = new THREE.Mesh(ctx.grass.build(true), new THREE.MeshLambertMaterial({ map: grassTex, ...ov })); grassMesh.receiveShadow = true;
  const plazaMesh = new THREE.Mesh(ctx.plaza.build(true), new THREE.MeshLambertMaterial({ map: plazaTex, ...ov })); plazaMesh.receiveShadow = true;
  const dirtMesh = new THREE.Mesh(ctx.dirt.build(), new THREE.MeshLambertMaterial({ vertexColors: true, ...ov, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); dirtMesh.receiveShadow = true;
  group.add(grassMesh, plazaMesh, dirtMesh);
  for (const t of buildTrees(ctx.trees, rng)) group.add(t);
  const lamps = buildLamps(props.lamps, landmarks.lamps || []);
  group.add(lamps.group);

  colliders.push(...ctx.colliders, ...(landmarks.colliders || []));
  scene.add(group);

  function update(dt, world) {
    try {
      updateEnv(world);
      roads.update(env);
      lamps.update(env);
      signs.uSign.value = 0.08 + 0.95 * env.night;
      landmarks.update?.(dt, world, env);
    } catch (err) { console.error('[city.update]', err); }
  }
  return { colliders, update, group, ctx };
}
