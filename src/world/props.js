// Trees (instanced, wind sway), streetlights (instanced pole + emissive head + glow halo + ground light pool).
import * as THREE from 'three';
import { GeoBuilder, col } from './geo.js';
import { COLS, ROWS, carreraX, calleZ, wCarrera, wCalle } from './layout.js';
import { glowTexture } from './textures.js';
import { U } from './env.js';
import { districtAt } from '../config.js';

function pushGeo(b, geo, colorFn, yOff = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const a = [pos.getX(i), pos.getY(i) + yOff, pos.getZ(i)], bb = [pos.getX(i + 1), pos.getY(i + 1) + yOff, pos.getZ(i + 1)], c = [pos.getX(i + 2), pos.getY(i + 2) + yOff, pos.getZ(i + 2)];
    const cy = (a[1] + bb[1] + c[1]) / 3;
    b.tri(a, bb, c, colorFn(cy, a, bb, c));
  }
}

function treeGeometry(type) {
  const b = new GeoBuilder();
  const trunk = col(0x6b4a2e);
  if (type === 0) {
    b.cyl(0, 0, 0, 2.6, 0.2, 0.14, 5, trunk);
    const crown = new THREE.IcosahedronGeometry(1.9, 0); crown.scale(1, 0.85, 1);
    const lo = col(0x3e7f39), hi = col(0x78b552);
    pushGeo(b, crown, (y) => { const t = Math.min(1, Math.max(0, (y - 2.2) / 3.2)); return [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t]; }, 3.9);
    const crown2 = new THREE.IcosahedronGeometry(1.2, 0);
    pushGeo(b, crown2, (y) => { const t = Math.min(1, Math.max(0, (y - 2.8) / 3.0)); return [lo[0] * 0.9 + (hi[0] - lo[0]) * t, lo[1] * 0.95 + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t]; }, 5.1);
  } else {
    b.cyl(0, 0, 0, 2.2, 0.18, 0.12, 5, trunk);
    const dark = col(0x2c6a45), light = col(0x4f9a5c);
    b.cyl(0, 0, 1.6, 4.6, 1.7, 0, 6, dark);
    b.cyl(0, 0, 3.4, 6.6, 1.35, 0, 6, [ (dark[0] + light[0]) / 2, (dark[1] + light[1]) / 2, (dark[2] + light[2]) / 2 ]);
    b.cyl(0, 0, 5.2, 8.6, 0.95, 0, 6, light);
  }
  return b.build();
}

export function buildTrees(list, rng) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float swayAmt = transformed.y * transformed.y * 0.0042;
        transformed.x += sin(uTime * 1.3 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5) * swayAmt;
        transformed.z += cos(uTime * 1.1 + instanceMatrix[3].z * 0.6) * swayAmt * 0.7;`);
  };
  mat.customProgramCacheKey = () => 'tree-sway-v1';
  const out = [];
  const types = [0, 1];
  for (const t of types) {
    const items = list.filter((o) => o.type === t);
    if (!items.length) continue;
    const im = new THREE.InstancedMesh(treeGeometry(t), mat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    items.forEach((o, k) => {
      p.set(o.x, o.y || 0.1, o.z); s.set(o.s, o.s * rng.range(0.9, 1.2), o.s); e.set(0, rng() * 6.28, 0); q.setFromEuler(e);
      m.compose(p, q, s); im.setMatrixAt(k, m);
      const v = rng.range(0.82, 1.12); c.setRGB(v * rng.range(0.92, 1.08), v, v * rng.range(0.85, 1.0)); im.setColorAt(k, c);
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = false; im.name = 'trees' + t;
    out.push(im);
  }
  return out;
}

// Streetlights + street trees along every road segment.
export function placeStreetProps(net, rng, o = {}) {
  const exclude = o.exclude || [];
  const blocked = (x, z) => exclude.some((e) => Math.hypot(x - e.x, z - e.z) < e.r);
  const lamps = []; // {x,z,ry}
  const trees = [];
  const density = (z) => {
    const d = districtAt(z);
    return d === 'Usaquén' ? 0.8 : d.startsWith('Chicó') ? 0.9 : d === 'Zona T' ? 0.6 : d === 'Chapinero' ? 0.7 : d === 'Teusaquillo' ? 0.9 : d.startsWith('Centro') ? 0.35 : 0.3;
  };
  const edge = 3.2;
  const spacing = 13;
  // carreras
  for (let i = 0; i <= COLS; i++) {
    const cx = carreraX(i), w = wCarrera(i);
    const avenue = w > 15;
    for (let j = 0; j < ROWS; j++) {
      const za = calleZ(j) + wCalle(j) / 2 + edge, zb = calleZ(j + 1) - wCalle(j + 1) / 2 - edge;
      const lampT = [za + (zb - za) * 0.25, za + (zb - za) * 0.75];
      for (const side of [-1, 1]) {
        const sx = cx + side * (w / 2 + 0.75);
        lampT.forEach((z, k) => { if ((avenue || ((k + (j & 1)) & 1) === (side > 0 ? 1 : 0)) && !blocked(sx, z)) lamps.push({ x: sx, z, ry: side > 0 ? Math.PI : 0 }); });
        const tx = cx + side * (w / 2 + 1.55);
        for (let z = za + 2 + rng.range(0, 4); z < zb - 1; z += spacing * rng.range(0.85, 1.25)) {
          if (lampT.some((lz) => Math.abs(lz - z) < 3)) continue;
          if (!rng.chance(density(z)) || blocked(tx, z)) continue;
          trees.push({ x: tx, z, s: rng.range(0.75, 1.15), type: rng.chance(0.25) ? 1 : 0 });
        }
      }
    }
  }
  // calles
  for (let j = 0; j <= ROWS; j++) {
    const cz = calleZ(j), w = wCalle(j);
    const avenue = w > 15;
    for (let i = 0; i < COLS; i++) {
      const xa = carreraX(i) + wCarrera(i) / 2 + edge, xb = carreraX(i + 1) - wCarrera(i + 1) / 2 - edge;
      const lampT = [xa + (xb - xa) * 0.25, xa + (xb - xa) * 0.75];
      for (const side of [-1, 1]) {
        const sz = cz + side * (w / 2 + 0.75);
        lampT.forEach((x, k) => { if ((avenue || ((k + (i & 1)) & 1) === (side > 0 ? 0 : 1)) && !blocked(x, sz)) lamps.push({ x, z: sz, ry: side > 0 ? Math.PI / 2 : -Math.PI / 2 }); });
        const tz = cz + side * (w / 2 + 1.55);
        for (let x = xa + 2 + rng.range(0, 4); x < xb - 1; x += spacing * rng.range(0.85, 1.25)) {
          if (lampT.some((lx) => Math.abs(lx - x) < 3)) continue;
          if (!rng.chance(density(cz)) || blocked(x, tz)) continue;
          trees.push({ x, z: tz, s: rng.range(0.75, 1.15), type: rng.chance(0.25) ? 1 : 0 });
        }
      }
    }
  }
  return { lamps, trees };
}

const LAMP_ARM = 2.3, LAMP_H = 7.4;

export function buildLamps(lamps, extra = []) {
  const all = lamps.concat(extra);
  const n = all.length;
  const group = new THREE.Group(); group.name = 'streetlights';
  // pole + arm
  const pb = new GeoBuilder();
  const grey = col(0x3a3e44);
  pb.cyl(0, 0, 0, LAMP_H, 0.11, 0.07, 6, grey);
  pb.cyl(0, 0, 0, 0.5, 0.2, 0.2, 6, grey);
  pb.box(0, LAMP_H - 0.12, -0.05, LAMP_ARM, LAMP_H - 0.02, 0.05, grey, grey);
  pb.box(LAMP_ARM - 0.5, LAMP_H - 0.2, -0.18, LAMP_ARM + 0.4, LAMP_H - 0.1, 0.18, col(0x24272b), col(0x24272b));
  const poleMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const poles = new THREE.InstancedMesh(pb.build(), poleMat, n);
  // emissive lamp head (under the housing)
  const headGeo = new THREE.BoxGeometry(0.85, 0.07, 0.3); headGeo.translate(LAMP_ARM - 0.05, LAMP_H - 0.24, 0);
  const headMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, n);
  // glow halo (billboard) + ground pool
  const glowTex = glowTexture();
  const haloMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: glowTex }, uNight: U.uNight, uColor: { value: new THREE.Color(1.0, 0.78, 0.45) }, uSize: { value: 1.9 } },
    vertexShader: `uniform float uSize; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.,0.,0.,1.); mv.xy += (uv - 0.5) * 2.0 * uSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float uNight; uniform vec3 uColor; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a * uNight; gl_FragColor = vec4(uColor * 1.1, a); }`,
  });
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, n);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  all.forEach((l, k) => {
    e.set(0, l.ry, 0); q.setFromEuler(e); p.set(l.x, 0, l.z); s.set(1, 1, 1);
    m.compose(p, q, s); poles.setMatrixAt(k, m); heads.setMatrixAt(k, m);
    // head position in world
    const hx = l.x + Math.cos(l.ry) * (LAMP_ARM), hz = l.z - Math.sin(l.ry) * (LAMP_ARM);
    p.set(hx, LAMP_H - 0.3, hz); s.set(1, 1, 1); q.identity(); m.compose(p, q, s); halos.setMatrixAt(k, m);
    p.set(hx, 0.17, hz); s.set(13, 1, 13); m.compose(p, q, s); pools.setMatrixAt(k, m);
  });
  for (const im of [poles, heads, halos, pools]) { im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; }
  poles.castShadow = false; poles.receiveShadow = false;
  halos.renderOrder = 5; pools.renderOrder = 4;
  group.add(poles, heads, halos, pools);
  const dayHead = new THREE.Color(0x70747a), nightHead = new THREE.Color(1.6, 1.25, 0.8);
  return {
    group,
    update(env) {
      headMat.color.copy(dayHead).lerp(nightHead, env.night);
      poolMat.opacity = env.night * (0.5 - 0.1 * env.rain);
      halos.visible = pools.visible = env.night > 0.01;
    },
  };
}
