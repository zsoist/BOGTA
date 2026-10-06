// Ground, roads (textured tiles), sidewalk slabs, zebra crossings, potholes, TransMilagro busway + stations.
import * as THREE from 'three';
import { GeoBuilder, col } from './geo.js';
import { COLS, ROWS, carreraX, calleZ, blockRect, wCarrera, wCalle, CURB } from './layout.js';
import { roadTexture, zebraTexture, potholeTexture, pavementTexture, cityGroundTexture, bannerTexture } from './textures.js';
import { U } from './env.js';

const ROAD_Y = 0.0;
const SLAB_BOTTOM = -0.25;

export function buildRoads(scene, net, rng) {
  const group = new THREE.Group(); group.name = 'roads';
  const colliders = [];

  // ---- materials ----
  const texs = { street: roadTexture('street'), avenue: roadTexture('avenue'), caracas: roadTexture('caracas'), plain: roadTexture('plain') };
  const roadMats = {};
  for (const k of Object.keys(texs)) roadMats[k] = new THREE.MeshLambertMaterial({ map: texs[k] });
  const pave = pavementTexture();
  const sidewalkMat = new THREE.MeshLambertMaterial({ map: pave });
  const gt = cityGroundTexture(); gt.repeat.set(5600 / 64, 5600 / 64); gt.offset.set(0.25, 0.25);
  const groundMat = new THREE.MeshLambertMaterial({ map: gt });

  // ---- ground ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5600, 5600).rotateX(-Math.PI / 2), groundMat);
  ground.position.y = SLAB_BOTTOM - 0.02; ground.receiveShadow = true; ground.name = 'ground';
  group.add(ground);

  // ---- road tiles ----
  const gb = { street: new GeoBuilder(), avenue: new GeoBuilder(), caracas: new GeoBuilder(), plain: new GeoBuilder() };
  const WHITE = [1, 1, 1];
  const rx = (i) => net.roads[i];                    // carrera i (axis x)
  const rz = (j) => net.roads[COLS + 1 + j];         // calle j (axis z)
  const STUB = 10;
  const quadTile = (b, x0, z0, x1, z1, uvf) => {
    const p = (x, z) => [x, ROAD_Y, z];
    b.quad(p(x0, z0), p(x0, z1), p(x1, z1), p(x1, z0), WHITE, [...uvf(x0, z0), ...uvf(x0, z1), ...uvf(x1, z1), ...uvf(x1, z0)]);
  };
  // carrera segments (run along Z)
  for (let i = 0; i <= COLS; i++) {
    const cx = carreraX(i), w = wCarrera(i);
    const kind = i === 6 ? 'caracas' : w > 15 ? 'avenue' : 'street';
    const uvf = (x, z) => [(x - (cx - w / 2)) / w, z / 8];
    for (let j = -1; j <= ROWS; j++) {
      let za, zb;
      if (j === -1) { za = calleZ(0) - wCalle(0) / 2 - STUB; zb = calleZ(0) - wCalle(0) / 2; }
      else if (j === ROWS) { za = calleZ(ROWS) + wCalle(ROWS) / 2; zb = za + STUB; }
      else { za = calleZ(j) + wCalle(j) / 2; zb = calleZ(j + 1) - wCalle(j + 1) / 2; }
      quadTile(gb[kind], cx - w / 2, za, cx + w / 2, zb, uvf);
    }
  }
  // calle segments (run along X)
  for (let j = 0; j <= ROWS; j++) {
    const cz = calleZ(j), w = wCalle(j);
    const kind = w > 15 ? 'avenue' : 'street';
    const uvf = (x, z) => [(z - (cz - w / 2)) / w, x / 8];
    for (let i = -1; i <= COLS; i++) {
      let xa, xb;
      if (i === -1) { xa = carreraX(0) - wCarrera(0) / 2 - STUB; xb = carreraX(0) - wCarrera(0) / 2; }
      else if (i === COLS) { xa = carreraX(COLS) + wCarrera(COLS) / 2; xb = xa + STUB; }
      else { xa = carreraX(i) + wCarrera(i) / 2; xb = carreraX(i + 1) - wCarrera(i + 1) / 2; }
      quadTile(gb[kind], xa, cz - w / 2, xb, cz + w / 2, uvf);
    }
  }
  // intersections
  const uvPlain = (x, z) => [x / 8, z / 8];
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
    const cx = carreraX(i), cz = calleZ(j), wi = wCarrera(i), wj = wCalle(j);
    quadTile(gb.plain, cx - wi / 2, cz - wj / 2, cx + wi / 2, cz + wj / 2, uvPlain);
  }
  for (const k of Object.keys(gb)) {
    const m = new THREE.Mesh(gb[k].build(true), roadMats[k]);
    m.receiveShadow = true; m.name = 'road-' + k; group.add(m);
  }

  // Caracas busway continuing through intersections (red overlay)
  const busGB = new GeoBuilder();
  for (let j = 0; j <= ROWS; j++) {
    const cz = calleZ(j), wj = wCalle(j);
    busGB.quad([-4, 0.004, cz - wj / 2], [-4, 0.004, cz + wj / 2], [4, 0.004, cz + wj / 2], [4, 0.004, cz - wj / 2], col(0xa32a2c));
    // white edge lines through the intersection
  }
  const busMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const busMesh = new THREE.Mesh(busGB.build(), busMat); busMesh.receiveShadow = true; group.add(busMesh);

  // ---- sidewalk slabs (one per block) ----
  const sw = new GeoBuilder();
  const topC = [1, 1, 1];
  const curbUV = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const slab = (x0, z0, x1, z1) => {
    const s = 1 / 2.4;
    sw.quad([x0, CURB, z0], [x0, CURB, z1], [x1, CURB, z1], [x1, CURB, z0], topC,
      [x0 * s, z0 * s, x0 * s, z1 * s, x1 * s, z1 * s, x1 * s, z0 * s]);
    const side = col(0xcfccc4);
    sw.quad([x1, SLAB_BOTTOM, z0], [x1, CURB, z0], [x1, CURB, z1], [x1, SLAB_BOTTOM, z1], side, curbUV);
    sw.quad([x0, SLAB_BOTTOM, z1], [x0, CURB, z1], [x0, CURB, z0], [x0, SLAB_BOTTOM, z0], side, curbUV);
    sw.quad([x1, SLAB_BOTTOM, z1], [x1, CURB, z1], [x0, CURB, z1], [x0, SLAB_BOTTOM, z1], side, curbUV);
    sw.quad([x0, SLAB_BOTTOM, z0], [x0, CURB, z0], [x1, CURB, z0], [x1, SLAB_BOTTOM, z0], side, curbUV);
  };
  for (let bi = 0; bi < COLS; bi++) for (let bj = 0; bj < ROWS; bj++) {
    const b = blockRect(bi, bj);
    slab(b.sx0, b.sz0, b.sx1, b.sz1);
  }
  // outer border strips (outside of the outermost roads)
  const ox0 = carreraX(0) - wCarrera(0) / 2, ox1 = carreraX(COLS) + wCarrera(COLS) / 2;
  const oz0 = calleZ(0) - wCalle(0) / 2, oz1 = calleZ(ROWS) + wCalle(ROWS) / 2;
  slab(ox0 - 3, oz0 - 3, ox0, oz1 + 3);
  slab(ox1, oz0 - 3, ox1 + 3, oz1 + 3);
  slab(ox0, oz0 - 3, ox1, oz0);
  slab(ox0, oz1, ox1, oz1 + 3);
  const swMesh = new THREE.Mesh(sw.build(true), sidewalkMat); swMesh.receiveShadow = true; swMesh.name = 'sidewalks'; group.add(swMesh);

  // ---- zebra crossings (instanced) ----
  const zt = zebraTexture();
  const zebraMat = new THREE.MeshLambertMaterial({ map: zt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mkZebraGeo = (width, depth, nStripes) => {
    const g = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * nStripes, uv.getY(k));
    return g;
  };
  const zebraStreetGeo = mkZebraGeo(11, 3.0, 11), zebraAveGeo = mkZebraGeo(19, 3.0, 19);
  const zs = [], za = [];
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
    const cx = carreraX(i), cz = calleZ(j), wi = wCarrera(i), wj = wCalle(j);
    const arms = [];
    if (j > 0) arms.push([cx, cz - wj / 2 - 2.0, 0, wi]);      // carrera, north arm
    if (j < ROWS) arms.push([cx, cz + wj / 2 + 2.0, 0, wi]);   // south arm
    if (i > 0) arms.push([cx - wi / 2 - 2.0, cz, Math.PI / 2, wj]);   // calle, west arm
    if (i < COLS) arms.push([cx + wi / 2 + 2.0, cz, Math.PI / 2, wj]); // east arm
    for (const a of arms) (a[3] > 15 ? za : zs).push(a);
  }
  const _o = new THREE.Object3D();
  const mkZebra = (geo, list) => {
    const im = new THREE.InstancedMesh(geo, zebraMat, list.length);
    list.forEach((a, k) => { _o.position.set(a[0], 0.012, a[1]); _o.rotation.set(0, a[2], 0); _o.updateMatrix(); im.setMatrixAt(k, _o.matrix); });
    im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; im.frustumCulled = false; im.renderOrder = 1; return im;
  };
  group.add(mkZebra(zebraStreetGeo, zs), mkZebra(zebraAveGeo, za));

  // ---- potholes (huecos) ----
  const phMat = new THREE.MeshLambertMaterial({ map: potholeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const phGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const potholes = [];
  const addPot = (x, z) => potholes.push([x, z, rng.range(0.8, 1.9), rng() * Math.PI]);
  for (let n = 0; n < 150; n++) {
    const cross = rng() < 0.5;
    if (cross) {
      const i = rng.int(0, COLS), r = rx(i), j = rng.int(0, ROWS - 1);
      const z0 = calleZ(j) + wCalle(j) / 2 + 5, z1 = calleZ(j + 1) - wCalle(j + 1) / 2 - 5;
      let lat = rng.range(-r.width / 2 + 1.5, r.width / 2 - 1.5); if (i === 6 && Math.abs(lat) < 4.5) lat = Math.sign(lat || 1) * 6.5;
      addPot(r.coord + lat, rng.range(z0, z1));
    } else {
      const j = rng.int(0, ROWS), r = rz(j), i = rng.int(0, COLS - 1);
      const x0 = carreraX(i) + wCarrera(i) / 2 + 5, x1 = carreraX(i + 1) - wCarrera(i + 1) / 2 - 5;
      addPot(rng.range(x0, x1), r.coord + rng.range(-r.width / 2 + 1.5, r.width / 2 - 1.5));
    }
  }
  for (let n = 0; n < 30; n++) { // Carrera Séptima pothole slalom
    const j = rng.int(0, ROWS - 1), z0 = calleZ(j) + 11, z1 = calleZ(j + 1) - 11;
    addPot(carreraX(10) + rng.range(-7.5, 7.5), rng.range(z0, z1));
  }
  const phMesh = new THREE.InstancedMesh(phGeo, phMat, potholes.length);
  potholes.forEach((p, k) => { _o.position.set(p[0], 0.014, p[1]); _o.rotation.set(0, p[3], 0); _o.scale.set(p[2], 1, p[2] * 0.85); _o.updateMatrix(); phMesh.setMatrixAt(k, _o.matrix); });
  _o.scale.set(1, 1, 1);
  phMesh.instanceMatrix.needsUpdate = true; phMesh.receiveShadow = true; phMesh.frustumCulled = false; phMesh.renderOrder = 2;
  group.add(phMesh);

  // ---- TransMilagro stations on Avenida Caracas ----
  const stations = buildStations(group, colliders);

  const wetCol = new THREE.Color();
  function update(env) {
    const k = 1 - 0.32 * env.rain;
    wetCol.setScalar(k);
    for (const m of Object.values(roadMats)) m.color.copy(wetCol);
    sidewalkMat.color.setScalar(1 - 0.22 * env.rain);
    stations.update(env);
  }
  return { group, colliders, update, rx, rz };
}

function buildStations(group, colliders) {
  const L = 20, HW = 1.8;
  const defs = [
    { z: calleZ(5) + 32, name: 'Calle 85' },
    { z: calleZ(10) + 32, name: 'Calle 45' },
    { z: calleZ(15) + 32, name: 'Calle 19' },
  ];
  const body = new GeoBuilder(), glass = new GeoBuilder(), lights = new GeoBuilder();
  const red = col(0xc4161c), dark = col(0x2c3036), conc = col(0x9a9b9a), light = col(0xfff1c8), glassC = col(0xa8e4ee);
  for (const d of defs) {
    const z0 = d.z - L / 2, z1 = d.z + L / 2;
    body.box(-HW, 0, z0, HW, 0.55, z1, conc, col(0xb4b4b0));                    // platform
    body.box(-HW - 0.45, 3.05, z0 - 0.4, HW + 0.45, 3.3, z1 + 0.4, red, col(0xe03a3e)); // roof
    body.box(-HW - 0.45, 3.3, z0 - 0.4, -HW - 0.4, 4.45, z1 + 0.4, red, red);   // fascia boards
    body.box(HW + 0.4, 3.3, z0 - 0.4, HW + 0.45, 4.45, z1 + 0.4, red, red);
    for (let z = z0; z <= z1 + 0.01; z += 5) body.box(-HW - 0.08, 0.55, z - 0.1, -HW + 0.08, 3.05, z + 0.1, dark, dark, { top: false });
    for (let z = z0; z <= z1 + 0.01; z += 5) body.box(HW - 0.08, 0.55, z - 0.1, HW + 0.08, 3.05, z + 0.1, dark, dark, { top: false });
    // glass panels with a doorway in the middle (3 m gap)
    for (const side of [-1, 1]) {
      const x = side * HW;
      glass.box(x - 0.03, 0.55, z0, x + 0.03, 3.05, d.z - 1.5, glassC, glassC, { top: false });
      glass.box(x - 0.03, 0.55, d.z + 1.5, x + 0.03, 3.05, z1, glassC, glassC, { top: false });
    }
    glass.box(-HW, 0.55, z0 - 0.03, HW, 3.05, z0 + 0.03, glassC, glassC, { top: false });
    glass.box(-HW, 0.55, z1 - 0.03, HW, 3.05, z1 + 0.03, glassC, glassC, { top: false });
    lights.box(-0.4, 3.0, z0 + 1, 0.4, 3.05, z1 - 1, light, light, { top: false });
    colliders.push({ minX: -HW - 0.45, maxX: HW + 0.45, minZ: z0 - 0.4, maxZ: z1 + 0.4, height: 3.3, kind: 'station' });
  }
  const bodyMesh = new THREE.Mesh(body.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; bodyMesh.name = 'stations';
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.34, depthWrite: false });
  const glassMesh = new THREE.Mesh(glass.build(), glassMat); glassMesh.renderOrder = 3;
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  const lightMesh = new THREE.Mesh(lights.build(), lightMat);
  group.add(bodyMesh, glassMesh, lightMesh);
  // signs
  const signs = [];
  const signMat = new THREE.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: 0.2 });
  for (const d of defs) {
    const t = bannerTexture([{ text: 'TRANSMILAGRO', size: 120, color: '#ffffff' }, { text: `Estación ${d.name}`, size: 70, color: '#ffd400' }], { w: 1024, h: 256, bg: '#c4161c', border: false });
    const m = new THREE.MeshLambertMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.15 });
    signs.push(m);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), m);
      p.position.set(side * (HW + 0.47), 3.88, d.z); p.rotation.y = side * Math.PI / 2; group.add(p);
    }
  }
  return {
    update(env) {
      lightMat.color.setScalar(0.4 + 0.9 * env.night);
      for (const m of signs) m.emissiveIntensity = 0.12 + 0.9 * env.night;
    },
  };
}
