// Pedestrians: ~60 low-poly rolos drawn with THREE.InstancedMesh (3 draw calls for the whole crowd),
// walking the sidewalk graph (corners + crosswalks), vendors with parody carts, umbrellas in the rain,
// fleeing from fast cars, cartoon ragdoll knock-downs, E-to-talk prompts.
// Contract: createPedestrians(scene, net, { count }) -> { update(dt, world), nearestTalkable(pos, maxDist) }
import * as THREE from 'three';
import { COLS, ROWS, MIN_X, MIN_Z, BLOCK, LANDMARKS } from '../config.js';
import { resolveCircle } from '../core/collision.js';
import {
  clamp, rand, pick, wrapAngle, TAU, ensureIndex, inView, lineClear,
} from './common.js';
import { roadOfCarrera, roadOfCalle } from './roads.js';
import { preloadCharacters, charactersReady, createCharacterMesh, updateCharacterAnim, disposeCharacter } from '../entities/characters.js';
preloadCharacters().catch(() => {}); // optional glTF characters; the instanced procedural peds remain the fallback

// ---------------------------------------------------------------- flavor data
const FEMALE = ['Gloria', 'Marleny', 'Luz Dary', 'Yesenia', 'Rosalba', 'Carmenza', 'Nubia', 'Stella', 'Alejandra', 'Dayana', 'Valentina', 'Paola', 'Johana', 'Lucero', 'Esperanza', 'Ximena', 'Marisol', 'Tatiana'];
const MALE = ['Aurelio', 'Wilson', 'Fabián', 'Jhon Jairo', 'Édgar', 'Hernán', 'Camilo', 'Santiago', 'Andrés', 'Duván', 'Nelson', 'Álvaro', 'Cristian', 'Jairo', 'Mauricio', 'Óscar', 'Leonardo', 'Sebastián'];
const SURN = ['Rodríguez', 'Pardo', 'Gómez', 'Cárdenas', 'Moreno', 'Ramírez', 'Quintero', 'Beltrán', 'Bernal', 'Cifuentes', 'Sánchez', 'Pinzón', 'Acosta', 'Rincón', 'Mahecha', 'Bautista', 'Torres', 'Buitrago'];
const ERRANDS = ['la panadería La Almojábana Feliz', 'el corrientazo de Doña Gloria', 'la droguería', 'una vuelta en el banco', 'la parada del TransMilagro', 'el Supermercado El Exitazo', 'recoger a su chino del colegio', 'comprar un tinto'];
const OFICINA = ['una aseguradora de la Calle 72', 'un banco de la Calle 26', 'una consultora en Chapinero', 'una notaría del centro', 'un call center en Teusaquillo'];

const KINDS = {
  walker: { speed: [1.25, 1.7], shirts: [0xd9534f, 0x4a90d9, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xf4d03f], pants: [0x2c3e50, 0x34495e, 0x7f8c8d, 0x4b3b2a, 0x1f2d3d], hat: null, pack: 0.25, packCols: [0x2c3e50, 0xc0392b, 0x27ae60] },
  oficinista: { speed: [1.5, 1.9], shirts: [0xffffff, 0xbcd4e6, 0xd6e0ea, 0x9fb3c8, 0xf2e6d0], pants: [0x1e2530, 0x2d3748, 0x3a3a3a], hat: null, pack: 0.7, packCols: [0x2b2118, 0x1a1a1a] },
  student: { speed: [1.35, 1.8], shirts: [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b], pants: [0x3b5b92, 0x2f4a7a, 0x2c2c34], hat: null, pack: 1, packCols: [0xe8590c, 0x1c7ed6, 0x2b8a3e, 0xc2255c] },
  abuela: { speed: [0.8, 1.0], shirts: [0x8e44ad, 0x9c6b3f, 0xc0392b, 0x7d6608, 0x6c3a5c], pants: [0x5d4037, 0x3e2f2a], hat: null, pack: 0, packCols: [0x8d6e63], gray: true, scale: 0.94 },
  policia: { speed: [1.2, 1.35], shirts: [0x2f5d3a], pants: [0x23402b], hat: 0x1f3a28, hatSize: [0.46, 0.15, 0.5], pack: 0, packCols: [0x000000] },
  vendor: { speed: [1.0, 1.1], shirts: [0xffffff, 0xf5d142, 0xe8590c, 0x4dabf7], pants: [0x4b3b2a, 0x2c3e50], hat: 0xd8b66a, hatSize: [0.64, 0.07, 0.64], pack: 0, packCols: [0x000000] },
};
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
const HAIR = [0x1b1b1b, 0x2b1b10, 0x4a3020, 0x6b4b2a, 0xb08d57, 0x222222];
const UMB = [0xff4d4d, 0x2f9bff, 0xffd43b, 0x51cf66, 0xcc5de8, 0xff922b, 0x20c997];

const VENDORS = [
  { lm: 'plaza_bolivar', side: 0, product: 'obleas', title: 'OBLEAS CON AREQUIPE', sub: '$2.000 · ¡a la orden!', name: 'Doña Gloria Pinzón', color: '#e64980', shout: '¡Obleas, obleas con arequipe, a la orden!' },
  { lm: 'plaza_bolivar', side: 2, product: 'mango biche', title: 'MANGO BICHE', sub: 'con sal y limón · $3.000', name: 'Don Wilson Mahecha', color: '#74b816', shout: '¡Mango biche con sal y limón, veci!' },
  { lm: 'candelaria', side: 1, product: 'empanadas', title: 'EMPANADAS MI TIERRA', sub: 'calientitas · $2.000', name: 'Doña Marleny Torres', color: '#f08c00', shout: '¡Empanadas calientitas, sumercé!' },
  { lm: 'santo_tomas', side: 3, product: 'tinto', title: 'TINTO DON AURELIO', sub: '¡caliente! · $1.000', name: 'Don Aurelio Rincón', color: '#8d5524', shout: '¡Tintico, tintico caliente pa’l frío!' },
  { lm: 'santo_tomas', side: 0, product: 'obleas', title: 'OBLEAS DOÑA LUZ DARY', sub: 'arequipe + mora · $2.500', name: 'Doña Luz Dary Cárdenas', color: '#d6336c', shout: '¡Obleas pa’ los estudiantes, a la orden!' },
  { lm: 'zona_t', side: 2, product: 'empanadas', title: 'EMPANADAS LA ZONA', sub: 'con ají · $2.500', name: 'Don Jhon Jairo Bernal', color: '#e8590c', shout: '¡Empanadas con ají pa’ la guayabera!' },
  { lm: 'parque93', side: 1, product: 'mango biche', title: 'MANGO BICHE EXPRESS', sub: 'sin picante $2.500', name: 'Doña Nubia Acosta', color: '#82c91e', shout: '¡Mango biche, mango biche fresquito!' },
  { lm: 'usaquen', side: 3, product: 'obleas', title: 'OBLEAS USAQUÉN', sub: 'arequipe doble · $3.000', name: 'Doña Esperanza Quintero', color: '#cc5de8', shout: '¡Obleas del domingo, pase pase!' },
  { lm: 'campin', side: 0, product: 'tinto', title: 'TINTO DON AURELIO #2', sub: 'sucursal El Campín', name: 'Don Hernán Beltrán', color: '#6f4e37', shout: '¡Tinto pa’ la hinchada, Azules campeón!' },
];
const POLICE_NAMES = ['Agente Ramírez', 'Patrullero Cifuentes', 'Agente Bautista'];

const BOX = 8; // box instances per ped: torso, legL, legR, armL, armR, pack, hat, umbrella pole
const _c = new THREE.Color();
let _uid = 1;

// scratch frame (columns of B = Ry(h) * Rx(pitch) * Rz(roll)) and origin
let Bxx = 1, Bxy = 0, Bxz = 0, Byx = 0, Byy = 1, Byz = 0, Bzx = 0, Bzy = 0, Bzz = 1, Ox = 0, Oy = 0, Oz = 0;
function setFrame(h, pitch, roll, x, y, z) {
  const c = Math.cos(h), s = Math.sin(h), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const c0x = c, c0y = 0, c0z = -s;
  const c1x = s * sp, c1y = cp, c1z = c * sp;
  Bzx = s * cp; Bzy = -sp; Bzz = c * cp;
  if (roll === 0) { Bxx = c0x; Bxy = c0y; Bxz = c0z; Byx = c1x; Byy = c1y; Byz = c1z; }
  else {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    Bxx = c0x * cr + c1x * sr; Bxy = c0y * cr + c1y * sr; Bxz = c0z * cr + c1z * sr;
    Byx = -c0x * sr + c1x * cr; Byy = -c0y * sr + c1y * cr; Byz = -c0z * sr + c1z * cr;
  }
  Ox = x; Oy = y; Oz = z;
}
// writes one instance matrix: local center (lx,ly,lz) (relative to the body center), size (sx,sy,sz), rotation th about local X
function put(mesh, idx, lx, ly, lz, sx, sy, sz, th) {
  const a = mesh.instanceMatrix.array, o = idx * 16;
  let yx = Byx, yy = Byy, yz = Byz, zx = Bzx, zy = Bzy, zz = Bzz;
  if (th !== 0) {
    const c = Math.cos(th), s = Math.sin(th);
    yx = Byx * c + Bzx * s; yy = Byy * c + Bzy * s; yz = Byz * c + Bzz * s;
    zx = -Byx * s + Bzx * c; zy = -Byy * s + Bzy * c; zz = -Byz * s + Bzz * c;
  }
  a[o] = Bxx * sx; a[o + 1] = Bxy * sx; a[o + 2] = Bxz * sx; a[o + 3] = 0;
  a[o + 4] = yx * sy; a[o + 5] = yy * sy; a[o + 6] = yz * sy; a[o + 7] = 0;
  a[o + 8] = zx * sz; a[o + 9] = zy * sz; a[o + 10] = zz * sz; a[o + 11] = 0;
  a[o + 12] = Ox + Bxx * lx + Byx * ly + Bzx * lz;
  a[o + 13] = Oy + Bxy * lx + Byy * ly + Bzy * lz;
  a[o + 14] = Oz + Bxz * lx + Byz * ly + Bzz * lz;
  a[o + 15] = 1;
}
function zero(mesh, idx) { const a = mesh.instanceMatrix.array, o = idx * 16; for (let k = 0; k < 16; k++) a[o + k] = 0; }

const validQ = (i, j, qx, qz) => !((i === 0 && qx < 0) || (i === COLS && qx > 0) || (j === 0 && qz < 0) || (j === ROWS && qz > 0));
const keyOf = (ni, qx, qz) => ni * 4 + (qx > 0 ? 2 : 0) + (qz > 0 ? 1 : 0);

function makeSign(title, sub, color) {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 384, 128);
  g.fillStyle = '#fff8e1'; g.fillRect(8, 8, 368, 112);
  g.fillStyle = color; g.textAlign = 'center';
  g.font = '800 34px Impact, "Arial Black", sans-serif'; g.fillText(title, 192, 58, 350);
  g.fillStyle = '#3b2a1a'; g.font = '700 22px "Arial", sans-serif'; g.fillText(sub, 192, 98, 350);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createPedestrians(scene, net, { count = 60 } = {}) {
  const nodes = net.nodes;
  const CAP = count + 20;
  const peds = [];
  const freeSlots = [];
  for (let i = CAP - 1; i >= 0; i--) freeSlots.push(i);

  // ---- shared instanced geometry (3 draw calls)
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const headGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const coneGeo = new THREE.ConeGeometry(0.5, 0.3, 8, 1);
  const boxM = new THREE.InstancedMesh(boxGeo, mat, CAP * BOX);
  const headM = new THREE.InstancedMesh(headGeo, mat, CAP);
  const coneM = new THREE.InstancedMesh(coneGeo, mat, CAP);
  for (const m of [boxM, headM, coneM]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = false; m.receiveShadow = false;
    for (let i = 0; i < m.count; i++) zero(m, i);
    m.setColorAt(0, _c.setHex(0xffffff));
    scene.add(m);
  }
  boxM.castShadow = true; headM.castShadow = true;
  const setBoxCol = (slot, part, hex) => boxM.setColorAt(slot * BOX + part, _c.setHex(hex));

  const index = { v: null };
  const tmpV = [];
  let promptOn = false, lastPrompt = null, notifyCd = 0, shoutCd = 0, hitNotifyCd = 0, time = 0, scanCd = 0, spawnCd = 0, inited = false;
  let player = null, plx = 0, plz = 0;
  const freeCount = Math.max(24, count - VENDORS.length - 3 - 6);

  // ---------------------------------------------------------------- sidewalk graph
  const _cp = { x: 0, z: 0 };
  function cornerPos(ni, qx, qz, out) {
    const n = nodes[ni];
    out.x = n.x + qx * (roadOfCarrera(net, n.i).width / 2 + 2.3);
    out.z = n.z + qz * (roadOfCalle(net, n.j).width / 2 + 2.3);
    return out;
  }
  // option scratch
  const oNi = [0, 0, 0, 0], oQx = [0, 0, 0, 0], oQz = [0, 0, 0, 0], oCross = [0, 0, 0, 0], oW = [0, 0, 0, 0], oX = [0, 0, 0, 0], oZ = [0, 0, 0, 0];
  function pickMove(p) {
    const n = nodes[p.ni], i = n.i, j = n.j, qx = p.qx, qz = p.qz;
    let k = 0;
    if (j + qz >= 0 && j + qz <= ROWS && validQ(i, j + qz, qx, -qz)) { oNi[k] = net.nodeAt(i, j + qz).id; oQx[k] = qx; oQz[k] = -qz; oCross[k] = 0; k++; }
    if (i + qx >= 0 && i + qx <= COLS && validQ(i + qx, j, -qx, qz)) { oNi[k] = net.nodeAt(i + qx, j).id; oQx[k] = -qx; oQz[k] = qz; oCross[k] = 0; k++; }
    if (validQ(i, j, -qx, qz)) { oNi[k] = p.ni; oQx[k] = -qx; oQz[k] = qz; oCross[k] = 1; k++; }
    if (validQ(i, j, qx, -qz)) { oNi[k] = p.ni; oQx[k] = qx; oQz[k] = -qz; oCross[k] = 2; k++; }
    if (k === 0) return false;
    let tot = 0;
    for (let a = 0; a < k; a++) {
      cornerPos(oNi[a], oQx[a], oQz[a], _cp);
      oX[a] = _cp.x; oZ[a] = _cp.z;
      const dx = _cp.x - p.position.x, dz = _cp.z - p.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx * p.mvx + dz * p.mvz) / d;
      let w = dot > 0.6 ? 0.55 : dot > -0.4 ? 0.26 : 0.03;
      if (oCross[a]) w *= 0.8;
      if (keyOf(oNi[a], oQx[a], oQz[a]) === p.lastKey) w = 0;
      if (p.home) {
        const hd = Math.hypot(_cp.x - p.home.x, _cp.z - p.home.z), cd = Math.hypot(p.position.x - p.home.x, p.position.z - p.home.z);
        if (hd > p.home.r && hd > cd) w *= 0.04;
        else if (cd > p.home.r && hd < cd) w *= 3;
      }
      oW[a] = w; tot += w;
    }
    if (tot <= 0) { for (let a = 0; a < k; a++) { oW[a] = 1; tot += 1; } }
    let r = Math.random() * tot, sel = 0;
    for (let a = 0; a < k; a++) { r -= oW[a]; if (r <= 0) { sel = a; break; } sel = a; }
    p.lastKey = p.curKey;
    p.ni = oNi[sel]; p.qx = oQx[sel]; p.qz = oQz[sel];
    p.curKey = keyOf(p.ni, p.qx, p.qz);
    p.tx = oX[sel] + p.jx * (oCross[sel] ? 0 : 1); p.tz = oZ[sel] + p.jz * (oCross[sel] ? 0 : 1);
    p.crossing = oCross[sel];
    const dx = p.tx - p.position.x, dz = p.tz - p.position.z, d = Math.hypot(dx, dz) || 1;
    p.mvx = dx / d; p.mvz = dz / d;
    p.st = p.crossing ? 'wait' : 'walk';
    p.waitT = 0; p.checkT = 0;
    return true;
  }

  function snapToCorner(p) {
    const n = net.nearestNode(p.position.x, p.position.z);
    const qx = p.position.x >= n.x ? 1 : -1, qz = p.position.z >= n.z ? 1 : -1;
    let ni = n.id, q1 = qx, q2 = qz;
    if (!validQ(n.i, n.j, q1, q2)) { if (!validQ(n.i, n.j, -q1, q2)) q2 = -q2; else q1 = -q1; }
    p.ni = ni; p.qx = q1; p.qz = q2; p.lastKey = -1; p.curKey = keyOf(ni, q1, q2);
    cornerPos(ni, q1, q2, _cp);
    p.tx = _cp.x; p.tz = _cp.z; p.crossing = 0; p.st = 'walk';
    const dx = p.tx - p.position.x, dz = p.tz - p.position.z, d = Math.hypot(dx, dz) || 1;
    p.mvx = dx / d; p.mvz = dz / d;
  }

  // ---------------------------------------------------------------- crossing safety
  function safeToCross(p, world) {
    const n = nodes[p.ni];
    // p.crossing: 1 = crossing the carrera (moving along X), 2 = crossing the calle (moving along Z)
    const road = p.crossing === 1 ? roadOfCarrera(net, n.i) : roadOfCalle(net, n.j);
    const cx = p.position.x, cz = p.position.z;
    const w = road.width;
    const tCross = w / 1.5 + 0.8;
    const list = index.v.query(cx, cz, 50, tmpV);
    for (let k = 0; k < list.length; k++) {
      const v = list[k];
      const sp = v.speed;
      if (Math.abs(sp) < 1.4) continue;
      const vx = v.position.x, vz = v.position.z;
      let along, lateral;
      if (p.crossing === 1) { // road runs along Z at x = road.coord
        lateral = Math.abs(vx - road.coord); along = (cz - vz) * Math.sign(-Math.cos(v.heading) * sp);
      } else {
        lateral = Math.abs(vz - road.coord); along = (cx - vx) * Math.sign(-Math.sin(v.heading) * sp);
      }
      if (lateral > w / 2 + 2.5) continue;
      if (along < -3 || along > 48) continue;
      if (along / Math.abs(sp) < tCross + 1.2) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- creation
  function nameFor(kind, female) {
    if (kind === 'abuela') return `Doña ${pick(FEMALE)} ${pick(SURN)}`;
    if (kind === 'policia') return pick(POLICE_NAMES);
    return `${female ? pick(FEMALE) : pick(MALE)} ${pick(SURN)}`;
  }
  function personaFor(p, extra) {
    const age = p.age, n = p.name;
    switch (p.kind) {
      case 'vendor': return `${n}, ${age} años, vendedor(a) ambulante de ${extra.product} en ${extra.place}. Llena de trabajo y de chismes, grita su producto, trata a todos de "sumercé", "mijo" o "veci". Se queja de que llueve a las 3 y de la Alcaldía, pero se ríe de todo.`;
      case 'student': return `${n}, ${age} años, estudiante de Ingeniería de Sistemas en la Universidad Santo Tomás. Trasnochado por el hackathon Build Day, vive de tinto y empanadas, habla de Claude y de que "esto está bacano". Dice "parce", "qué mamera", "bacano".`;
      case 'oficinista': return `${n}, ${age} años, oficinista en ${pick(OFICINA)}. Con afán permanente, camina rápido, habla del trancón, del pico y placa y del tinto de la oficina. Educado pero estresado, dice "con permiso" y "qué boleta".`;
      case 'abuela': return `${n}, ${age} años, abuelita bogotana de ruana. Dice "mijito", "mijita", "sumercé", cuenta que "en mis tiempos el tranvía pasaba por acá" y se queja de los huecos, el tráfico y de los peatones sin ruana. Dulce pero regañona.`;
      case 'policia': return `${n}, agente de la Policía en la Plaza de Bolívar. Formal pero buena gente, dice "sumercé", "a la orden", advierte del pico y placa, de las palomas y de no pasarse los semáforos. Se ríe si lo molestan con respeto.`;
      default: return `${n}, ${age} años, rolo(a) camino a ${pick(ERRANDS)}. Conversador(a), usa "parce", "chévere", "qué boleta", "sumercé". Opina del clima (siempre 14 grados y llovizna) y de Bogotá.`;
    }
  }

  let lastDt = 0.016;
  function createPed(kind, opts = {}) {
    if (!freeSlots.length) return null;
    const slot = freeSlots.pop();
    const cfg = KINDS[kind];
    const female = opts.female ?? Math.random() < (kind === 'abuela' ? 1 : 0.48);
    const holder = new THREE.Object3D();
    holder.position.y = 0.1; // sidewalk curb height
    scene.add(holder);
    const p = {
      id: _uid++, mesh: holder, position: holder.position, kind, name: opts.name || nameFor(kind, female), persona: '', knockedDown: false,
      talkable: true, slot, st: 'walk', heading: rand(0, TAU), phase: rand(0, TAU), speed: rand(cfg.speed[0], cfg.speed[1]), sc: (cfg.scale || 1) * rand(0.93, 1.07),
      age: kind === 'abuela' ? 62 + ((Math.random() * 25) | 0) : kind === 'student' ? 18 + ((Math.random() * 7) | 0) : 22 + ((Math.random() * 40) | 0),
      ni: 0, qx: 1, qz: 1, curKey: -1, lastKey: -1, tx: 0, tz: 0, mvx: 0, mvz: -1, crossing: 0, waitT: 0, checkT: 0, idleT: 0,
      jx: rand(-0.5, 0.5), jz: rand(-0.5, 0.5), home: opts.home || null, fixed: !!opts.fixed,
      fleeT: 0, fvx: 0, fvz: 0, hy: 0.9, pitch: 0, roll: 0, vy: 0, vx: 0, vz: 0, spinP: 0, spinR: 0, spinY: 0, downT: 0, landed: false,
      lay: 0, limb0: 0, limb1: 0, limb2: 0, limb3: 0, dodge: Math.random() < 0.62, umbRoll: Math.random(), umbCol: pick(UMB), shoutCd: rand(0, 20), moving: 0, lean: 0,
      hasPack: Math.random() < cfg.pack, hatCol: cfg.hat, hatSize: cfg.hatSize || [0.42, 0.14, 0.42], extra: opts.extra || null,
      cart: opts.cart || null, bobPhase: rand(0, 6),
    };
    p.persona = personaFor(p, opts.extra || {});
    holder.rotation.y = p.heading;
    // colors
    const gray = cfg.gray;
    const shirt = pick(cfg.shirts), pants = pick(cfg.pants);
    setBoxCol(slot, 0, shirt);
    setBoxCol(slot, 1, pants); setBoxCol(slot, 2, pants);
    setBoxCol(slot, 3, shirt); setBoxCol(slot, 4, shirt);
    setBoxCol(slot, 5, pick(cfg.packCols));
    setBoxCol(slot, 6, cfg.hat ?? (gray ? 0xdddddd : pick(HAIR)));
    setBoxCol(slot, 7, 0x333333);
    headM.setColorAt(slot, _c.setHex(pick(SKIN)));
    coneM.setColorAt(slot, _c.setHex(p.umbCol));
    boxM.instanceColor.needsUpdate = true; headM.instanceColor.needsUpdate = true; coneM.instanceColor.needsUpdate = true;
    peds.push(p);
    return p;
  }

  function destroyPed(p, world) {
    const i = peds.indexOf(p);
    if (i >= 0) peds.splice(i, 1);
    const w = world.peds.indexOf(p);
    if (w >= 0) world.peds.splice(w, 1);
    for (let k = 0; k < BOX; k++) zero(boxM, p.slot * BOX + k);
    zero(headM, p.slot); zero(coneM, p.slot);
    if (p.char) { disposeCharacter(p.char); p.char = null; }
    scene.remove(p.mesh);
    freeSlots.push(p.slot);
  }

  function placeOnSidewalk(p, near) {
    // random corner within a ring around `near`, then a spot along one of its sidewalk edges
    for (let attempt = 0; attempt < 14; attempt++) {
      const nn = net.nearestNode(near.x, near.z);
      const span = Math.ceil(near.maxD / BLOCK) + 1;
      const i = clamp(nn.i + Math.round(rand(-span, span)), 0, COLS), j = clamp(nn.j + Math.round(rand(-span, span)), 0, ROWS);
      const ni = net.nodeAt(i, j).id;
      const qx = Math.random() < 0.5 ? 1 : -1, qz = Math.random() < 0.5 ? 1 : -1;
      if (!validQ(i, j, qx, qz)) continue;
      p.ni = ni; p.qx = qx; p.qz = qz; p.curKey = keyOf(ni, qx, qz); p.lastKey = -1;
      cornerPos(ni, qx, qz, _cp);
      p.position.set(_cp.x, 0, _cp.z);
      p.mvx = Math.random() < 0.5 ? 1 : -1; p.mvz = 0;
      if (!pickMove(p)) continue;
      if (p.crossing) { p.st = 'walk'; p.crossing = 0; }
      // slide along the first leg
      const f = Math.random() * 0.9;
      p.position.x += (p.tx - p.position.x) * f; p.position.z += (p.tz - p.position.z) * f;
      const d = Math.hypot(p.position.x - near.x, p.position.z - near.z);
      if (d < near.minD || d > near.maxD) continue;
      if (near.hidden && d < 100 && inView(near.world, p.position.x, p.position.z, 2)) continue;
      p.heading = Math.atan2(-p.mvx, -p.mvz);
      return true;
    }
    return false;
  }

  function spawnFree(world, initial) {
    const p0 = player ? player.position : { x: 0, z: 0 };
    // choose kind by neighborhood
    const santo = LANDMARKS.find((l) => l.id === 'santo_tomas');
    const tmpKind = (x, z) => {
      const r = Math.random();
      if (santo && Math.hypot(x - santo.x, z - santo.z) < 110 && r < 0.4) return 'student';
      if (z > -150 && z < 450 && r < 0.62) return 'oficinista';
      if (r < 0.13) return 'abuela';
      return 'walker';
    };
    const near = { x: p0.x, z: p0.z, minD: initial ? 12 : 55, maxD: initial ? 115 : 125, hidden: !initial, world };
    const kind = tmpKind(p0.x + rand(-80, 80), p0.z + rand(-80, 80));
    const p = createPed(kind);
    if (!p) return null;
    if (!placeOnSidewalk(p, near)) { destroyPed(p, world); return null; }
    world.peds.push(p);
    return p;
  }

  function spawnFixed(world) {
    // vendors with carts near landmarks
    const cartMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b, flatShading: true });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.7, flatShading: true });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222, flatShading: true });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const cartGeo = new THREE.BoxGeometry(1.5, 0.8, 0.8), topGeo = new THREE.BoxGeometry(1.35, 0.4, 0.7);
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 10), poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6);
    const umbGeo = new THREE.ConeGeometry(1.45, 0.55, 10, 1), signGeo = new THREE.PlaneGeometry(1.5, 0.5);
    for (const vd of VENDORS) {
      const lm = LANDMARKS.find((l) => l.id === vd.lm);
      if (!lm) continue;
      const i0 = clamp(Math.floor((lm.x - MIN_X) / BLOCK), 0, COLS - 1), j0 = clamp(Math.floor((lm.z - MIN_Z) / BLOCK), 0, ROWS - 1);
      const rW = roadOfCarrera(net, i0), rE = roadOfCarrera(net, i0 + 1), rN = roadOfCalle(net, j0), rS = roadOfCalle(net, j0 + 1);
      const jit = rand(-9, 9);
      let x, z, heading;
      if (vd.side === 0) { z = rN.coord + rN.width / 2 + 1.6; x = lm.x + jit; heading = 0; }
      else if (vd.side === 1) { x = rE.coord - rE.width / 2 - 1.6; z = lm.z + jit; heading = -Math.PI / 2; }
      else if (vd.side === 2) { z = rS.coord - rS.width / 2 - 1.6; x = lm.x + jit; heading = Math.PI; }
      else { x = rW.coord + rW.width / 2 + 1.6; z = lm.z + jit; heading = Math.PI / 2; }
      const g = new THREE.Group();
      const body = new THREE.Mesh(cartGeo, cartMat); body.position.y = 0.75; g.add(body);
      const top = new THREE.Mesh(topGeo, glassMat); top.position.y = 1.35; g.add(top);
      for (const sx of [-0.55, 0.55]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.32, 0.1); g.add(w); }
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(0.55, 2.0, 0.25); g.add(pole);
      const umbMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(vd.color), flatShading: true });
      const umb = new THREE.Mesh(umbGeo, umbMat); umb.position.set(0.55, 2.85, 0.25); g.add(umb);
      const signMat = new THREE.MeshBasicMaterial({ map: makeSign(vd.title, vd.sub, vd.color), side: THREE.DoubleSide });
      const sign = new THREE.Mesh(signGeo, signMat); sign.rotation.y = Math.PI; sign.position.set(0, 1.0, -0.42); sign.scale.set(0.9, 0.9, 1); g.add(sign);
      g.position.set(x, 0, z); g.rotation.y = heading;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(g);
      const p = createPed('vendor', { name: vd.name, female: /^Doña/.test(vd.name), fixed: true, cart: g, extra: { product: vd.product, place: lm.name } });
      if (!p) continue;
      p.talkable = true; p.vendor = vd;
      p.st = 'stand';
      p.position.set(x + Math.sin(heading) * 0.85, 0, z + Math.cos(heading) * 0.85);
      p.heading = heading; p.sc = 1;
      p.home = { x: p.position.x, z: p.position.z, r: 1 };
      p.age = 35 + ((Math.random() * 30) | 0);
      p.persona = personaFor(p, { product: vd.product, place: lm.name });
      world.peds.push(p);
    }
    // police on foot at the Plaza de Bolívar
    const plaza = LANDMARKS.find((l) => l.id === 'plaza_bolivar');
    for (let k = 0; k < 3 && plaza; k++) {
      const p = createPed('policia', { female: k === 2, fixed: true, home: { x: plaza.x, z: plaza.z, r: 48 }, name: POLICE_NAMES[k] });
      if (!p) continue;
      if (!placeOnSidewalk(p, { x: plaza.x, z: plaza.z, minD: 0, maxD: 70, hidden: false, world })) { destroyPed(p, world); continue; }
      world.peds.push(p);
    }
    // students hanging around Santo Tomás
    const santo = LANDMARKS.find((l) => l.id === 'santo_tomas');
    for (let k = 0; k < 6 && santo; k++) {
      const p = createPed('student', { fixed: true, home: { x: santo.x, z: santo.z, r: 60 } });
      if (!p) continue;
      if (!placeOnSidewalk(p, { x: santo.x, z: santo.z, minD: 0, maxD: 70, hidden: false, world })) { destroyPed(p, world); continue; }
      world.peds.push(p);
    }
  }

  // ---------------------------------------------------------------- notify helper
  function say(world, text, kind = 'info', cdKey = 'n', gap = 0.8) {
    if (cdKey === 'n') { if (time < notifyCd) return; notifyCd = time + gap; }
    world.events.emit('notify', { text, kind });
  }

  // ---------------------------------------------------------------- reactions
  function knock(p, v, world) {
    p.st = 'down'; p.knockedDown = true; p.talkable = false; p.downT = 0; p.landed = false;
    const sp = Math.abs(v.speed);
    const vel = v.velocity;
    const sgn = Math.sign(v.speed) || 1;
    const vx = vel ? vel.x : -Math.sin(v.heading) * v.speed, vz = vel ? vel.z : -Math.cos(v.heading) * v.speed;
    p.vx = vx * 0.85 + rand(-1, 1); p.vz = vz * 0.85 + rand(-1, 1);
    p.vy = clamp(4.5 + sp * 0.18, 5, 9.5);
    p.hy = Math.max(p.hy, 1.0);
    p.spinP = (Math.random() < 0.5 ? -1 : 1) * rand(6, 11); p.spinR = rand(-6, 6); p.spinY = rand(-5, 5);
    p.limb0 = rand(0.6, 1.6); p.limb1 = -rand(0.6, 1.6); p.limb2 = rand(1.5, 2.8); p.limb3 = rand(1.5, 2.8);
    p.pitch = 0; p.roll = 0; p.fleeT = 0; p.crossing = 0;
    p.sgn = sgn;
    const x = p.position.x, z = p.position.z;
    const police = p.kind === 'policia';
    if (v.driver === 'player') world.events.emit('crime', { type: police ? 'hit_police' : 'hit_ped', x, z, ped: p, vehicle: v });
    world.events.emit('crash', { intensity: clamp(sp / 28, 0.15, 0.6), x, z });
    // witnesses scatter
    for (let k = 0; k < peds.length; k++) {
      const q = peds[k];
      if (q === p || q.st === 'down' || q.st === 'getup' || q.kind === 'policia' || (q.st === 'stand' && q.kind === 'vendor')) continue;
      const dx = q.position.x - x, dz = q.position.z - z;
      if (dx * dx + dz * dz < 18 * 18) startFlee(q, x, z, 2.2);
    }
  }
  function startFlee(p, fromX, fromZ, secs) {
    if (p.st === 'down' || p.st === 'getup') return;
    let dx = p.position.x - fromX, dz = p.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    p.fvx = dx / d; p.fvz = dz / d;
    p.fleeT = secs; p.prevSt = p.st === 'flee' ? p.prevSt : p.st; p.st = 'flee'; p.crossing = 0;
  }

  const SHOUT_FLEE = ['¡Pilas, loco!', '¡Cuidado, mijo!', '¡Ay, Virgen santa!', '¡Por la acera no, home!'];

  function updatePed(p, dt, world, idx) {
    const pos = p.position;
    const st = p.st;
    if (st === 'down') { ragdoll(p, dt, world); return; }
    if (st === 'getup') {
      p.downT += dt;
      const k = clamp(p.downT / 0.7, 0, 1);
      p.pitch = p.lieP * (1 - k); p.roll *= 0.8; p.hy = 0.22 + (0.9 * p.sc - 0.22) * k;
      if (k >= 1) { p.st = p.fixed && p.kind === 'vendor' ? 'return' : 'walk'; p.knockedDown = false; p.talkable = true; p.pitch = 0; p.roll = 0; p.hy = 0.9 * p.sc; if (p.st === 'walk') snapToCorner(p); }
      return;
    }
    // ---- vehicles: contact / threat
    const list = idx.query(pos.x, pos.z, 6.5, tmpV);
    for (let k = 0; k < list.length; k++) {
      const v = list[k];
      if (v.destroyed) continue;
      const sp = v.speed;
      const asp = Math.abs(sp);
      const rx = pos.x - v.position.x, rz = pos.z - v.position.z;
      const d2 = rx * rx + rz * rz;
      const reach = (v.length || 4) / 2 + 1.2;
      const hullD = d2 < reach * reach && v.distanceTo ? v.distanceTo(pos.x, pos.z) : (d2 < reach * reach ? Math.sqrt(d2) - (v.radius || 1.2) : 99);
      if (hullD < 0.3) {
        if (asp > 4) { knock(p, v, world); return; }
        if (v.pushOut) v.pushOut(pos, 0.3);
        else { const d = Math.sqrt(d2) || 0.01; pos.x += rx / d * 0.2; pos.z += rz / d * 0.2; }
        if (asp > 1.5 && p.st !== 'flee') startFlee(p, v.position.x, v.position.z, 1.0);
      } else if (asp > 4 && d2 < 64 && p.st !== 'flee') {
        const fx = -Math.sin(v.heading) * Math.sign(sp), fz = -Math.cos(v.heading) * Math.sign(sp);
        const ahead = rx * fx + rz * fz;
        if (ahead < -1 || ahead > 3 + asp * 0.22 || !p.dodge) continue;
        const lat = rx * -fz + rz * fx;
        if (Math.abs(lat) > (v.width || 1.8) * 0.5 + 1.6) continue;
        const onRoad = net.roadAt(v.position.x, v.position.z);
        if (!onRoad || ahead < 4.5) {
          // sidestep perpendicular to the car's path
          const sgn = lat >= 0 ? 1 : -1;
          p.fvx = -fz * sgn; p.fvz = fx * sgn;
          p.fleeT = 1.4; p.prevSt = p.st; p.st = 'flee'; p.crossing = 0;
          if (Math.random() < 0.3 && Math.hypot(pos.x - plx, pos.z - plz) < 30) say(world, SHOUT_FLEE[(Math.random() * SHOUT_FLEE.length) | 0], 'info', 'n', 2.5);
          break;
        }
      }
    }
    if (p.st === 'flee') {
      p.fleeT -= dt;
      pos.x += p.fvx * 5.2 * dt; pos.z += p.fvz * 5.2 * dt;
      resolveCircle(pos, 0.35, world.colliderGrid);
      p.mvx = p.fvx; p.mvz = p.fvz;
      p.moving = 1; p.running = true; p.phase += dt * 11;
      if (p.fleeT <= 0) { p.running = false; if (p.kind === 'vendor' && p.fixed) { p.st = 'return'; } else snapToCorner(p); }
      faceMove(p, dt);
      return;
    }
    p.running = false;
    // ---- state behaviors
    if (p.kind === 'policia' && state_wanted(world) > 0 && p.st !== 'chase') {
      if (Math.hypot(pos.x - plx, pos.z - plz) < 42) { p.st = 'chase'; p.shoutCd = 0; }
    }
    switch (p.st) {
      case 'stand': {
        p.moving = 0;
        // face the street, wave the arm now and then; shout for customers
        p.shoutCd -= dt;
        if (p.vendor && p.shoutCd <= 0 && time >= shoutCd) {
          const d = Math.hypot(pos.x - plx, pos.z - plz);
          if (d < 9) { shoutCd = time + 7; p.shoutCd = rand(30, 50); world.events.emit('notify', { text: `🛒 ${p.name}: ${p.vendor.shout}`, kind: 'info' }); }
          else p.shoutCd = 4;
        }
        break;
      }
      case 'return': {
        const h = p.home;
        const dx = h.x - pos.x, dz = h.z - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.4) { p.st = 'stand'; p.heading = p.cart ? p.cart.rotation.y : p.heading; p.moving = 0; break; }
        const spd = 1.5;
        pos.x += dx / d * spd * dt; pos.z += dz / d * spd * dt; p.mvx = dx / d; p.mvz = dz / d; p.moving = 1; p.phase += dt * spd * 2.6;
        faceMove(p, dt);
        break;
      }
      case 'chase': {
        if (state_wanted(world) <= 0 || Math.hypot(pos.x - plx, pos.z - plz) > 70) { snapToCorner(p); break; }
        const dx = plx - pos.x, dz = plz - pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > 1.7) {
          const spd = 4.3;
          pos.x += dx / d * spd * dt; pos.z += dz / d * spd * dt; p.mvx = dx / d; p.mvz = dz / d; p.moving = 1; p.running = true; p.phase += dt * 10;
          resolveCircle(pos, 0.35, world.colliderGrid);
        } else p.moving = 0;
        p.shoutCd -= dt;
        if (p.shoutCd <= 0 && time >= hitNotifyCd) { hitNotifyCd = time + 6; p.shoutCd = 8; world.events.emit('notify', { text: '👮 ¡Alto ahí, sumercé!', kind: 'bad' }); }
        faceMove(p, dt);
        break;
      }
      case 'idle': {
        p.moving = 0; p.idleT -= dt;
        if (p.idleT <= 0) pickMove(p);
        break;
      }
      case 'wait': {
        p.moving = 0; p.waitT += dt; p.checkT -= dt;
        if (p.checkT <= 0) {
          p.checkT = 0.25;
          if (safeToCross(p, world) || p.waitT > 14) { p.st = 'walk'; }
        }
        // look toward the destination
        break;
      }
      default: { // walk
        const dx = p.tx - pos.x, dz = p.tz - pos.z, d = Math.hypot(dx, dz);
        const boost = world.state.raining ? 1.25 : 1;
        const spd = p.speed * boost * (p.crossing ? 1.35 : 1);
        if (d < 0.55) {
          if (p.kind === 'policia' || p.kind === 'student') { /* patrol: slight pauses */ }
          if (Math.random() < 0.07 && !p.crossing) { p.st = 'idle'; p.idleT = rand(2, 6); p.moving = 0; }
          else if (!pickMove(p)) { p.st = 'idle'; p.idleT = 2; }
          break;
        }
        const step = Math.min(d, spd * dt);
        pos.x += dx / d * step; pos.z += dz / d * step;
        p.mvx = dx / d; p.mvz = dz / d; p.moving = 1; p.phase += dt * spd * 2.7;
        faceMove(p, dt);
      }
    }
  }
  const state_wanted = (world) => world.state.wanted || 0;

  function faceMove(p, dt) {
    const target = Math.atan2(-p.mvx, -p.mvz);
    p.heading += wrapAngle(target - p.heading) * Math.min(1, dt * 10);
  }

  function ragdoll(p, dt, world) {
    p.downT += dt;
    const pos = p.position;
    if (!p.landed) {
      p.vy -= 18 * dt;
      p.hy += p.vy * dt;
      pos.x += p.vx * dt; pos.z += p.vz * dt;
      p.pitch += p.spinP * dt; p.roll += p.spinR * dt; p.heading += p.spinY * dt;
      resolveCircle(pos, 0.35, world.colliderGrid);
      if (p.hy <= 0.22 && p.vy < 0) {
        p.hy = 0.22;
        if (Math.abs(p.vy) > 3) { p.vy = -p.vy * 0.28; p.spinP *= 0.5; p.spinR *= 0.5; p.vx *= 0.7; p.vz *= 0.7; }
        else { p.landed = true; p.vy = 0; }
      }
    } else {
      pos.x += p.vx * dt; pos.z += p.vz * dt;
      const f = Math.exp(-4 * dt); p.vx *= f; p.vz *= f;
      resolveCircle(pos, 0.35, world.colliderGrid);
      // settle into a lying pose
      const lie = Math.round((p.pitch - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      p.pitch += (lie - p.pitch) * Math.min(1, dt * 9);
      p.roll += (Math.round(p.roll / TAU) * TAU - p.roll) * Math.min(1, dt * 9);
      p.lieP = lie;
    }
    if (p.downT >= 3.0 && p.landed) {
      p.st = 'getup'; p.downT = 0; p.lieP = p.lieP ?? Math.PI / 2;
      // normalize angles so the get-up lerp is short
      p.pitch = p.lieP;
      if (Math.hypot(pos.x - plx, pos.z - plz) < 70) say(world, '¡Ay, juepucha!', 'info', 'n', 0.6);
    } else if (p.downT > 5) { p.st = 'getup'; p.downT = 0; p.lieP = Math.PI / 2; p.pitch = p.lieP; }
  }

  // ---------------------------------------------------------------- drawing
  function drawPed(p, world) {
    const sc = p.sc, cy = 0.9 * sc;
    const swingAmp = p.st === 'down' ? 0 : (p.running ? 0.95 : 0.55) * p.moving;
    const sw = Math.sin(p.phase) * swingAmp;
    const bob = p.moving ? Math.abs(Math.cos(p.phase)) * 0.045 * sc * (p.running ? 1.6 : 1) : Math.sin(time * 1.6 + p.bobPhase) * 0.006;
    const lean = p.running ? -0.2 : 0;
    const standing = p.st !== 'down' && p.st !== 'getup';
    p.position.y = 0.1;
    const oy = 0.1 + (standing ? cy + bob : p.hy);
    setFrame(p.heading, p.pitch + lean, p.roll, p.position.x, oy, p.position.z);
    const base = p.slot * BOX;
    const dy = -cy; // local y relative to the body center
    let tL = sw, tR = -sw, aL = -sw * 0.9, aR = sw * 0.9;
    if (p.st === 'down' || p.st === 'getup') { tL = p.limb0; tR = p.limb1; aL = p.limb2; aR = -p.limb3; }
    else if (p.st === 'stand') { // vendor: arm waving
      aR = 2.5 + Math.sin(time * 4.5 + p.bobPhase) * 0.45 * (Math.sin(time * 0.5 + p.bobPhase) > 0.2 ? 1 : 0.1); aL = 0.1;
    } else if (p.st === 'idle') { aR = -1.1; aL = 0.1; } // looking at the phone
    else if (p.st === 'chase') { aR = -1.2 - sw; aL = 1.0 + sw; }
    // body
    put(boxM, base, 0, (1.18) * sc + dy, 0, 0.5 * sc, 0.62 * sc, 0.28 * sc, 0);
    // legs (pivot at hip y=0.86)
    const legL = 0.86 * sc, hipY = 0.86 * sc;
    put(boxM, base + 1, -0.13 * sc, hipY - Math.cos(tL) * legL / 2 + dy, -Math.sin(tL) * legL / 2, 0.19 * sc, legL, 0.22 * sc, tL);
    put(boxM, base + 2, 0.13 * sc, hipY - Math.cos(tR) * legL / 2 + dy, -Math.sin(tR) * legL / 2, 0.19 * sc, legL, 0.22 * sc, tR);
    // arms (pivot at shoulder y=1.46)
    const armL = 0.62 * sc, shY = 1.46 * sc;
    put(boxM, base + 3, -0.33 * sc, shY - Math.cos(aL) * armL / 2 + dy, -Math.sin(aL) * armL / 2, 0.12 * sc, armL, 0.14 * sc, aL);
    put(boxM, base + 4, 0.33 * sc, shY - Math.cos(aR) * armL / 2 + dy, -Math.sin(aR) * armL / 2, 0.12 * sc, armL, 0.14 * sc, aR);
    // pack (backpack / briefcase at the hand)
    if (p.hasPack) {
      if (p.kind === 'oficinista') put(boxM, base + 5, 0.34 * sc, 0.62 * sc + dy, -0.02, 0.1 * sc, 0.3 * sc, 0.42 * sc, 0);
      else put(boxM, base + 5, 0, 1.2 * sc + dy, 0.2 * sc, 0.38 * sc, 0.46 * sc, 0.2 * sc, 0);
    } else zero(boxM, base + 5);
    // hair / hat
    const hs = p.hatSize;
    put(boxM, base + 6, 0, 1.87 * sc + dy, 0, hs[0] * sc, hs[1] * sc, hs[2] * sc, 0);
    // head
    put(headM, p.slot, 0, 1.68 * sc + dy, 0, 0.4 * sc, 0.44 * sc, 0.4 * sc, 0);
    // umbrella
    const umb = standing && (p.kind === 'vendor' ? false : world.state.raining && p.umbRoll < 0.72);
    if (umb) {
      put(boxM, base + 7, 0.0, 1.88 * sc + dy, 0, 0.03, 0.78 * sc, 0.03, 0);
      put(coneM, p.slot, 0, 2.3 * sc + dy, 0, 2.3 * sc, 1, 2.3 * sc, 0);
    } else { zero(boxM, base + 7); zero(coneM, p.slot); }
    p.mesh.rotation.y = p.heading;
    drawChar(p, world);
  }

  // Optional rigged glTF character (near peds only). Replaces the instanced boxes while attached.
  function drawChar(p, world) {
    try {
      const dx = p.position.x - plx, dz = p.position.z - plz, d2 = dx * dx + dz * dz;
      if (d2 > 60 * 60 || !charactersReady()) {
        if (p.char) { disposeCharacter(p.char); p.char = null; p.charFail = 0; }
        return;
      }
      if (!p.char) {
        if (p.charFail) return;
        p.char = createCharacterMesh(p.kind, { scale: p.sc });
        if (!p.char) { p.charFail = 1; return; }
        p.mesh.add(p.char);
      }
      const base = p.slot * BOX;
      for (let k = 0; k < BOX; k++) zero(boxM, base + k);
      zero(headM, p.slot); zero(coneM, p.slot);
      const lying = p.st === 'down' || p.st === 'getup';
      const c = p.char;
      c.rotation.set(lying ? p.pitch : 0, 0, lying ? p.roll : 0);
      c.position.y = lying ? Math.max(0, p.hy - 0.22) * 0.5 : 0;
      const sp = p.moving ? (p.running ? 5.4 : p.speed) : 0;
      updateCharacterAnim(c, sp, lastDt, { lod: d2 > 30 * 30, air: lying && !p.landed });
    } catch (err) { if (!p.charErr) { p.charErr = true; console.warn('[peds] char', err); } p.charFail = 1; }
  }

  // ---------------------------------------------------------------- public API
  function nearestTalkable(pos, maxDist = 3.5) {
    let best = null, bd = maxDist * maxDist;
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (!p.talkable || p.knockedDown || p.st === 'flee' || p.st === 'getup' || p.st === 'down') continue;
      const dx = p.position.x - pos.x, dz = p.position.z - pos.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function onCrime(world, d) {
    if (!d) return;
    if (d.type === 'carjack' && d.x !== undefined) {
      // the player module animates the ejected driver; bystanders just scatter
      for (let k = 0; k < peds.length; k++) {
        const q = peds[k];
        if (q.kind === 'policia' || q.kind === 'vendor' || q.st === 'down' || q.st === 'getup') continue;
        const dx = q.position.x - d.x, dz = q.position.z - d.z;
        if (dx * dx + dz * dz < 14 * 14) startFlee(q, d.x, d.z, 2.0);
      }
    }
  }

  function update(dt, world) {
    time += dt; lastDt = dt;
    player = world.player;
    if (player && player.position) { plx = player.position.x; plz = player.position.z; }
    const idx = ensureIndex(world);
    index.v = idx;
    if (!inited) {
      inited = true;
      world.events.on('crime', (d) => onCrime(world, d));
      spawnFixed(world);
      let guard = 0;
      while (peds.filter((q) => !q.fixed).length < freeCount && guard++ < freeCount * 4) spawnFree(world, true);
    }
    // ---- update near peds
    const R2 = 135 * 135;
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      const dx = p.position.x - plx, dz = p.position.z - plz;
      const d2 = dx * dx + dz * dz;
      if (d2 > R2) {
        // far: recycle free peds (out of view); fixed ones just freeze
        if (!p.fixed && d2 > 150 * 150 && !inView(world, p.position.x, p.position.z, 3)) destroyPed(p, world);
        continue;
      }
      try { updatePed(p, dt, world, idx); } catch (err) { console.error('[peds]', err); p.st = 'walk'; snapToCorner(p); }
    }
    // soft separation between neighbours (cheap O(n^2) over the near set)
    for (let i = 0; i < peds.length; i++) {
      const a = peds[i];
      if (a.st === 'down' || a.st === 'stand') continue;
      for (let j = i + 1; j < peds.length; j++) {
        const b = peds[j];
        if (b.st === 'down' || b.st === 'stand') continue;
        const dx = a.position.x - b.position.x;
        if (dx > 0.7 || dx < -0.7) continue;
        const dz = a.position.z - b.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.49 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.7 - d) * 0.5 * Math.min(1, dt * 6); a.position.x += dx / d * push; a.position.z += dz / d * push; b.position.x -= dx / d * push; b.position.z -= dz / d * push; }
      }
    }
    // ---- draw (near ones only)
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      const dx = p.position.x - plx, dz = p.position.z - plz;
      if (dx * dx + dz * dz > R2) continue;
      drawPed(p, world);
    }
    boxM.instanceMatrix.needsUpdate = true; headM.instanceMatrix.needsUpdate = true; coneM.instanceMatrix.needsUpdate = true;
    // ---- keep the crowd topped up around the player
    spawnCd -= dt;
    if (spawnCd <= 0) {
      spawnCd = 0.25;
      let nFree = 0;
      for (let i = 0; i < peds.length; i++) if (!peds[i].fixed) nFree++;
      if (nFree < freeCount && freeSlots.length > 0) spawnFree(world, false);
    }
    // ---- E prompt
    scanCd -= dt;
    if (scanCd <= 0) {
      scanCd = 0.1;
      let want = null;
      if (player && !player.vehicle && !world.state.dialogOpen && !player.isDriving) want = nearestTalkable(player.position, 3.5);
      if (want) {
        const txt = `E — Hablar con ${want.name}`;
        if (!promptOn || txt !== lastPrompt) { promptOn = true; lastPrompt = txt; world.events.emit('prompt', { text: txt }); }
      } else if (promptOn) { promptOn = false; lastPrompt = null; world.events.emit('prompt', { text: null }); }
    }
  }

  return { update, nearestTalkable, peds };
}
