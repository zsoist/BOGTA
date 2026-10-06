// Facade material: patched MeshLambertMaterial.
// Per-instance (or per-vertex) attribute aStyle = (kind, seed, litProbability, bakedFlag)
//   kind: 0 painted apartments (desaturated balcony facade tinted by instance color), 1 brick, 2 glass curtain wall,
//         3 colonial, 4 commercial/podium (glass facade, warm), 5 plain, 6 roof/rooftop/cornice plain.  +10 => ground floor = shopfronts.
//   bakedFlag 0: InstancedMesh unit box (face size from instance scale)   1: UVs in cell units (prism geometry)
// Facade images (assets/textures/facade-*.png) are loaded asynchronously and mapped with WORLD-SCALE UVs
// (bay-snapped across the face, floor-aligned vertically). A fully procedural window shader is the instant fallback.
import * as THREE from 'three';
import { U } from './env.js';

// [cellW, cellH] per kind (also used by prismGeometry for landmarks)
export const CELL = {
  0: [3.5, 3.2], 1: [3.5, 3.2], 2: [2.4, 3.6], 3: [3.5, 4.0], 4: [2.4, 3.6], 5: [3.4, 3.4], 6: [3.4, 3.4],
};
export const cellFor = (kind) => CELL[kind % 10] || CELL[0];
export const SHOP_H = 4.4;
export const BAY = { 0: 3.5, 1: 3.5, 2: 2.4, 3: 3.5, 4: 2.4 };
export const heightOf = (kind, floors, shops) => (kind === 3 ? floors * 4.0 : (shops ? SHOP_H : 0) + floors * CELL[kind][1]);

const TEX = {
  tBrick: { value: null }, tColonial: { value: null }, tGlass: { value: null }, tShops: { value: null },
  uHas: { value: new THREE.Vector4(0, 0, 0, 0) },
};
let texStarted = false;
function loadFacadeTextures() {
  if (texStarted) return; texStarted = true;
  const ph = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); ph.needsUpdate = true;
  for (const k of ['tBrick', 'tColonial', 'tGlass', 'tShops']) TEX[k].value = ph;
  const loader = new THREE.TextureLoader();
  const files = { tBrick: ['facade-brick.png', 'x'], tColonial: ['facade-colonial.png', 'y'], tGlass: ['facade-glass.png', 'z'], tShops: ['facade-shops.png', 'w'] };
  for (const [key, [file, comp]] of Object.entries(files)) {
    let url; try { url = new URL(`../../assets/textures/${file}`, import.meta.url).href; } catch (e) { continue; }
    loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
      TEX[key].value = t; TEX.uHas.value[comp] = 1;
    }, undefined, () => { /* optional asset: procedural fallback stays */ });
  }
}

const VERT_PARS = /* glsl */`
attribute vec4 aStyle;
varying vec2 vWinUv;
varying vec4 vStyle;
varying float vFaceUp;
varying vec2 vMeters;
varying vec2 vFace;
varying vec2 vUvB; varying vec2 vUvG; varying vec2 vUvC; varying vec2 vUvS;
vec2 cellFor(float k){
  if (k < 0.5) return vec2(3.5, 3.2);
  if (k < 1.5) return vec2(3.5, 3.2);
  if (k < 2.5) return vec2(2.4, 3.6);
  if (k < 3.5) return vec2(3.5, 4.0);
  if (k < 4.5) return vec2(2.4, 3.6);
  return vec2(3.4, 3.4);
}
`;
const VERT_MAIN = /* glsl */`
{
  vStyle = aStyle;
  float kraw = aStyle.x;
  float kk = mod(floor(kraw + 0.5), 10.0);
  float gH = kraw > 9.5 ? 4.4 : 0.0;
  vec3 an = abs(normal);
  vFaceUp = an.y;
  vec2 cell = cellFor(kk);
  vec2 fs = vec2(1000.0, 1000.0);
  bool inst = aStyle.w < 0.5;
  vec3 isc = vec3(1.0);
  #ifdef USE_INSTANCING
    isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  #endif
  if (inst) fs = an.x > 0.5 ? vec2(isc.z, isc.y) : (an.z > 0.5 ? vec2(isc.x, isc.y) : vec2(isc.x, isc.z));
  float nC = max(1.0, floor(fs.x / cell.x + 0.5));
  float nR = max(1.0, floor(fs.y / cell.y + 0.5));
  if (inst) { vWinUv = uv * vec2(nC, nR); vMeters = uv * fs; }
  else { vWinUv = uv; vMeters = uv * cell; }
  vFace = fs;
  float off = floor(fract(aStyle.y * 0.137) * 8.0);
  float my = vMeters.y;
  float bB = inst ? uv.x * max(1.0, floor(fs.x / 3.5 + 0.5)) : vMeters.x / 3.5;
  float bG = inst ? uv.x * max(1.0, floor(fs.x / 2.4 + 0.5)) : vMeters.x / 2.4;
  float bS = inst ? uv.x * max(1.0, floor(fs.x / 3.6 + 0.5)) : vMeters.x / 3.6;
  vUvB = vec2((bB + off) / 4.0, 0.928 + (my - gH) / 15.4);
  vUvG = vec2((bG + off) / 8.0, 0.82 + (my - gH) / 21.6);
  vUvC = vec2((bB + off) / 4.0, inst ? clamp(my / max(fs.y, 1.0), 0.002, 0.998) : my / 8.0);
  vUvS = vec2((bS + off) / 4.0, clamp(my / 4.4, 0.002, 0.998));
}
`;
const FRAG_PARS = /* glsl */`
varying vec2 vWinUv;
varying vec4 vStyle;
varying float vFaceUp;
varying vec2 vMeters;
varying vec2 vFace;
varying vec2 vUvB; varying vec2 vUvG; varying vec2 vUvC; varying vec2 vUvS;
uniform float uNight;
uniform float uTime;
uniform sampler2D tBrick; uniform sampler2D tColonial; uniform sampler2D tGlass; uniform sampler2D tShops;
uniform vec4 uHas;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float aab(vec2 f, vec2 lo, vec2 hi, vec2 w){
  vec2 a = smoothstep(lo - w, lo + w, f);
  vec2 b = 1.0 - smoothstep(hi - w, hi + w, f);
  return a.x * a.y * b.x * b.y;
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hueTint(vec3 c){ return c / max(luma(c), 0.02); }
`;
const FRAG_MAIN = /* glsl */`
vec3 wallCol = diffuseColor.rgb;
vec3 winEmit = vec3(0.0);
{
  float kind = mod(floor(vStyle.x + 0.5), 10.0);
  bool shopFlag = vStyle.x > 9.5;
  float seed = vStyle.y;
  float litP = vStyle.z;
  vec2 fw = fwidth(vWinUv);
  float farF = smoothstep(0.30, 0.85, max(fw.x, fw.y));
  vec2 w = max(fw * 0.8, vec2(0.0005));
  vec2 id = floor(vWinUv);
  vec2 f = fract(vWinUv);
  bool side = vFaceUp < 0.5;
  float coverage = 0.0;
  vec3 glassCol = vec3(0.07, 0.10, 0.14);
  vec3 trim = vec3(0.0); float trimA = 0.0;
  vec3 warm = vec3(1.0, 0.76, 0.42);
  bool shop = false;
  // textured samples (taken unconditionally so derivatives stay valid)
  vec3 tb = texture2D(tBrick, vUvB).rgb;
  vec3 tg = texture2D(tGlass, vUvG).rgb;
  vec3 tc = texture2D(tColonial, vUvC).rgb;
  vec3 ts = texture2D(tShops, vUvS).rgb;
  float used = 0.0; vec3 albedo = wallCol; vec3 em2 = vec3(0.0);
  if (side) {
    vec3 tint = hueTint(wallCol);
    vec2 idB = floor(vec2(vUvB.x * 4.5, (vUvB.y - 0.928) / 0.2078));
    vec2 idG = floor(vec2(vUvG.x * 8.0, (vUvG.y - 0.828) / 0.1748));
    float nightWin = hash21(idG + vec2(seed * 7.0, seed * 3.0));
    float litG = step(1.0 - litP * 0.8, nightWin);
    float litB = step(1.0 - litP * 0.8, hash21(idB + vec2(seed * 5.0, seed * 2.0)));
    if (shopFlag && vMeters.y < 4.4 && uHas.w > 0.5) {
      albedo = ts; used = 1.0; em2 = ts * 1.05 * uNight;
    } else if (kind < 0.5 && uHas.x > 0.5) {
      float g = luma(tb);
      albedo = wallCol * clamp(0.15 + 1.9 * g, 0.0, 1.6); used = 1.0;
      float gm = smoothstep(0.07, 0.14, tb.b - tb.r) * litB;
      em2 = warm * gm * 0.8 * uNight + tb * smoothstep(0.5, 0.7, tb.g) * smoothstep(0.12, 0.25, tb.r - tb.b) * 1.1 * uNight;
    } else if (kind > 0.5 && kind < 1.5 && uHas.x > 0.5) {
      albedo = tb * mix(vec3(1.0), tint, 0.35) * 1.08; used = 1.0;
      float gm = smoothstep(0.07, 0.14, tb.b - tb.r) * litB;
      float g = luma(tb);
      em2 = warm * gm * 0.8 * uNight + tb * smoothstep(0.5, 0.7, tb.g) * smoothstep(0.12, 0.25, tb.r - tb.b) * 1.1 * uNight;
    } else if (kind > 1.5 && kind < 2.5 && uHas.z > 0.5) {
      albedo = tg * mix(vec3(1.0), tint, 0.3) * 1.1; used = 1.0;
      float gm = smoothstep(0.08, 0.15, tg.b - tg.r) * litG;
      em2 = warm * gm * 0.75 * uNight + tg * smoothstep(0.5, 0.7, tg.g) * smoothstep(0.12, 0.25, tg.r - tg.b) * 1.0 * uNight;
    } else if (kind > 2.5 && kind < 3.5 && uHas.y > 0.5) {
      albedo = tc * mix(vec3(1.0), tint, 0.22) * 1.05; used = 1.0;
      em2 = vec3(1.0, 0.7, 0.4) * smoothstep(0.55, 0.8, luma(tc)) * 0.25 * uNight * litB;
    } else if (kind > 3.5 && kind < 4.5 && uHas.z > 0.5) {
      albedo = tg * mix(vec3(1.0), tint, 0.5) * 1.15; used = 1.0;
      float gm = smoothstep(0.08, 0.15, tg.b - tg.r) * step(0.35, nightWin);
      em2 = warm * gm * 0.75 * uNight;
    }
  }
  if (side && kind < 4.5 && used < 0.5) {
    vec2 lo = vec2(0.2, 0.2), hi = vec2(0.8, 0.76);
    shop = id.y < 0.5 && kind != 2.0 && kind != 3.0;
    if (kind < 0.5) { lo = vec2(0.2, 0.2); hi = vec2(0.8, 0.74); }
    else if (kind < 1.5) { lo = vec2(0.27, 0.2); hi = vec2(0.73, 0.74); }
    else if (kind < 2.5) { lo = vec2(0.03, 0.22); hi = vec2(0.97, 0.94); }
    else if (kind < 3.5) { lo = vec2(0.34, 0.26); hi = vec2(0.66, 0.84); }
    else { lo = vec2(0.07, 0.14); hi = vec2(0.93, 0.80); }
    if (shop) { lo = vec2(0.06, 0.1); hi = vec2(0.94, 0.66); }
    if (kind > 2.5 && kind < 3.5 && id.y < 0.5) { lo = vec2(0.3, 0.0); hi = vec2(0.7, 0.74); }
    coverage = aab(f, lo, hi, w);
    if (kind > 3.5) { coverage *= smoothstep(0.0, 0.03 + w.x, abs(f.x - 0.5)); }
    if (kind < 3.5 && kind != 2.0) {
      float sill = aab(f, vec2(lo.x - 0.05, lo.y - 0.07), vec2(hi.x + 0.05, lo.y), w);
      trim = vec3(0.86, 0.84, 0.78); trimA = sill * (1.0 - farF);
      if (kind > 2.5) {
        float ring = aab(f, lo - vec2(0.04, 0.04), hi + vec2(0.04, 0.03), w) - coverage;
        trim = vec3(0.95, 0.94, 0.9); trimA = clamp(ring, 0.0, 1.0);
      }
    }
    float slab = smoothstep(0.0, 0.05 + w.y, f.y);
    albedo = wallCol * mix(0.84, 1.0, slab);
    if (kind == 2.0) {
      float sp = aab(f, vec2(-1.0, 0.0), vec2(2.0, 0.22), w);
      glassCol = mix(vec3(0.10, 0.17, 0.23), vec3(0.32, 0.50, 0.62), clamp(f.y * 0.8 + hash21(id + seed) * 0.35, 0.0, 1.0));
      albedo = mix(wallCol * 0.55, glassCol, coverage);
      albedo = mix(albedo, wallCol * 0.5, sp);
    } else {
      float h = hash21(id * 1.7 + seed * 3.1);
      vec3 gc = glassCol * (0.8 + 0.8 * h);
      if (shop) gc = mix(vec3(0.10, 0.13, 0.16), vec3(0.22, 0.28, 0.32), f.y);
      albedo = mix(albedo, gc, coverage);
      albedo = mix(albedo, trim, trimA);
    }
    if (shop) {
      float aw = aab(f, vec2(0.02, 0.66), vec2(0.98, 0.84), w);
      float stripe = step(0.5, fract(vWinUv.x * 2.0 + 0.25));
      vec3 awC = mix(vec3(0.85, 0.15, 0.12), vec3(0.95, 0.9, 0.85), stripe);
      float hh = hash21(vec2(seed, id.x + 3.0));
      if (hh > 0.66) awC = mix(vec3(0.1, 0.35, 0.7), vec3(0.95, 0.9, 0.85), stripe);
      else if (hh > 0.33) awC = mix(vec3(0.1, 0.5, 0.25), vec3(0.95, 0.9, 0.85), stripe);
      albedo = mix(albedo, awC * 0.9, aw * (1.0 - farF * 0.5));
    }
    if (kind > 0.5 && kind < 1.5) {
      float course = step(0.82, fract(vMeters.y / 0.1));
      float row = floor(vMeters.y / 0.1);
      float joint = step(0.92, fract((vMeters.x + 0.11 * mod(row, 2.0)) / 0.22));
      float br = max(course, joint) * (1.0 - farF) * (1.0 - coverage);
      albedo *= 1.0 - 0.14 * br;
    }
    float cellR = hash21(id + vec2(seed * 7.0, seed * 3.0));
    float litc = step(1.0 - litP, cellR);
    float flick = 0.7 + 0.3 * hash21(id * 2.3 + seed);
    vec3 em = (kind == 2.0 ? mix(vec3(0.75, 0.88, 1.0), warm, step(0.6, hash21(id + seed * 5.0))) : mix(warm, vec3(1.0, 0.93, 0.8), hash21(id * 3.1 + seed)));
    float shopLit = shop ? 1.0 : 0.0;
    float litAmt = max(litc, shopLit * step(0.35, hash21(id + seed))) * flick;
    vec3 detailed = em * litAmt * coverage * 1.7;
    vec3 averaged = em * litP * 0.5 * 0.55;
    em2 = mix(detailed, averaged, farF) * uNight;
  }
  if (side) {
    // fake AO: corners, under-cornice, ground contact + gentle height gradient
    float dEdge = min(vMeters.x, vFace.x - vMeters.x);
    float ao = mix(0.80, 1.0, smoothstep(0.0, 1.3, dEdge));
    ao *= mix(0.84, 1.0, smoothstep(0.0, 1.0, vFace.y - vMeters.y));
    ao *= mix(0.62, 1.0, smoothstep(0.0, 4.5, vMeters.y));
    ao *= 0.94 + 0.1 * smoothstep(0.0, 70.0, vMeters.y);
    albedo *= ao;
    diffuseColor.rgb = albedo;
    winEmit = em2;
  } else {
    diffuseColor.rgb = wallCol * 0.74;
  }
}
`;

export function patchBuildingMaterial(mat) {
  loadFacadeTextures();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = U.uNight;
    shader.uniforms.uTime = U.uTime;
    Object.assign(shader.uniforms, TEX);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_MAIN)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += winEmit;');
  };
  mat.customProgramCacheKey = () => 'bldg-win-v2';
  return mat;
}

export function createBuildingMaterials() {
  const instanced = patchBuildingMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
  const baked = patchBuildingMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true }));
  return { instanced, baked };
}

let shared = null;
// One material pair for the whole world (city + hillside barrios share the same compiled programs).
export function getSharedMaterials() {
  if (!shared) shared = createBuildingMaterials();
  return shared;
}
