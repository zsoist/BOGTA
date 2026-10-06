// Sky: gradient dome shader (sun, moon, stars, stylized clouds), day/night + overcast/rain palettes, lights + shadow rig,
// fog, instanced rain streaks, distant hills, and the Cerros Orientales (cerros.js).
import * as THREE from 'three';
import { state } from '../core/state.js';
import { env, updateEnv, sstep, clamp01, makeRng, U } from './env.js';
import { createCerros } from './cerros.js';
import { getSharedMaterials } from './buildingMat.js';

const C = (hex) => new THREE.Color(hex);

// Palette keyframes by hour (clear-sky colors). Linear interpolation between keys.
const KEYS = [
  { h: 0,    top: C('#050a20'), hor: C('#1a2347'), hemiS: C('#3d5290'), hemiG: C('#3a3a48'), sun: C('#8fa9ff'), sunI: 1.3, hemiI: 2.6 },
  { h: 4.8,  top: C('#060c24'), hor: C('#1c2650'), hemiS: C('#3d5290'), hemiG: C('#3a3a48'), sun: C('#8fa9ff'), sunI: 1.3, hemiI: 2.6 },
  { h: 5.9,  top: C('#26427c'), hor: C('#f0987a'), hemiS: C('#7088b8'), hemiG: C('#3d3833'), sun: C('#ffb27a'), sunI: 1.3, hemiI: 1.2 },
  { h: 6.9,  top: C('#4f88d2'), hor: C('#ffd9b0'), hemiS: C('#a9c6ee'), hemiG: C('#5b5a48'), sun: C('#ffe0b0'), sunI: 2.6, hemiI: 1.6 },
  { h: 9,    top: C('#3f86de'), hor: C('#bddcf5'), hemiS: C('#bcd8ff'), hemiG: C('#6b7058'), sun: C('#fff3dc'), sunI: 3.2, hemiI: 1.9 },
  { h: 13,   top: C('#2f7fe0'), hor: C('#b2d6f7'), hemiS: C('#b8d6ff'), hemiG: C('#6b7058'), sun: C('#fff6e6'), sunI: 3.3, hemiI: 1.9 },
  { h: 16.8, top: C('#4a78c4'), hor: C('#ffd2a2'), hemiS: C('#a8c4ee'), hemiG: C('#605a46'), sun: C('#ffc88a'), sunI: 2.4, hemiI: 1.6 },
  { h: 17.9, top: C('#2c4488'), hor: C('#ff8f5a'), hemiS: C('#8a8cc0'), hemiG: C('#4a3f3a'), sun: C('#ff9a5e'), sunI: 1.2, hemiI: 1.2 },
  { h: 18.7, top: C('#1a2656'), hor: C('#9a5a78'), hemiS: C('#46558c'), hemiG: C('#2a2a33'), sun: C('#c78fb0'), sunI: 0.9, hemiI: 1.0 },
  { h: 19.6, top: C('#0a1232'), hor: C('#2b3260'), hemiS: C('#3d5290'), hemiG: C('#3a3a48'), sun: C('#8fa9ff'), sunI: 1.3, hemiI: 2.6 },
  { h: 24,   top: C('#050a20'), hor: C('#1a2347'), hemiS: C('#3d5290'), hemiG: C('#3a3a48'), sun: C('#8fa9ff'), sunI: 1.3, hemiI: 2.6 },
];
// Overcast ("grey Andean") and rain palettes (day / night versions)
const OV_DAY = { top: C('#7d8997'), hor: C('#b6c0c9'), hemiS: C('#cfd8e1'), hemiG: C('#6a6e66'), sun: C('#eef1f4'), sunK: 0.32, hemiAdd: 0.5 };
const OV_NIGHT = { top: C('#171b28'), hor: C('#3a3a4c'), hemiS: C('#38435f'), hemiG: C('#15181f'), sun: C('#8fa9ff'), sunK: 0.8, hemiAdd: 0.1 };
const RAIN_DAY = { top: C('#56616c'), hor: C('#838f99'), hemiS: C('#9fb0bd'), hemiG: C('#4f534d'), sunK: 0.6 };

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 uTop, uHor, uSunDir, uMoonDir, uSunColor, uCloudLit, uCloudDark;
uniform float uNight, uOvercast, uTime, uSunAmt, uRain;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p){ p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vn(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = clamp(y, 0.0, 1.0);
  vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.7, pow(t, 0.6)));
  col = mix(col, uHor, exp(-max(y, 0.0) * 9.0) * 0.55);
  if (y < 0.0) col = mix(uHor, uHor * 0.85, clamp(-y * 4.0, 0.0, 1.0));
  // sun
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.18 + pow(sd, 48.0) * 0.45 + smoothstep(0.99935, 0.99975, sd) * 2.2) * uSunAmt;
  // moon
  float md = dot(d, uMoonDir);
  float moonAmt = uNight * (1.0 - uOvercast * 0.85);
  col += vec3(0.82, 0.88, 1.0) * (smoothstep(0.9989, 0.9993, md) * 1.6 + pow(max(md, 0.0), 220.0) * 0.35) * moonAmt;
  // stars
  if (y > 0.02 && uNight > 0.05) {
    vec3 sp = d * 160.0; vec3 id = floor(sp); vec3 f = fract(sp) - 0.5;
    float h = hash3(id);
    float star = step(0.9945, h) * smoothstep(0.38, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * (1.0 + h * 4.0) + h * 60.0));
    col += vec3(0.9, 0.93, 1.0) * star * uNight * (1.0 - uOvercast * 0.95) * smoothstep(0.02, 0.25, y);
  }
  // clouds (stylized, two-tone)
  if (y > -0.02) {
    vec2 uv = d.xz / (max(y, 0.0) + 0.22) * 1.25;
    uv += vec2(uTime * 0.0045, uTime * 0.0021);
    float n = fbm(uv * 1.1);
    float cover = mix(0.60, 0.30, uOvercast);
    float c = smoothstep(cover, cover + 0.16, n);
    vec2 sdir = normalize(uSunDir.xz + vec2(0.0001));
    float n2 = fbm((uv + sdir * 0.07) * 1.1);
    float lit = clamp((n - n2) * 5.0 + 0.55, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    float band = smoothstep(0.0, 0.14, y);
    col = mix(col, cc, c * band * (0.92 - 0.1 * uRain));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky(scene, renderer) {
  const rng = makeRng(99);
  const group = new THREE.Group(); group.name = 'sky';

  // ---------- dome ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, transparent: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uNight: U.uNight, uTime: U.uTime, uOvercast: { value: 0.5 }, uSunAmt: { value: 1 }, uRain: U.uRain,
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 40, 24), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -1000; dome.name = 'sky-dome';
  group.add(dome);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x6b7058, 1.8);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const SH = 62;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 5, far: 420 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.35;
  sun.shadow.camera.updateProjectionMatrix();
  group.add(hemi, sun, sun.target);

  // ---------- fog / background ----------
  const fogColor = new THREE.Color();
  scene.fog = new THREE.Fog(0xb2d6f7, 90, 900);
  scene.background = fogColor.clone();

  // ---------- distant hills (west/north/south haze ring following the camera) ----------
  const hills = (() => {
    const seg = 96, R = 1250;
    const pos = [], colr = [];
    const hcol = new THREE.Color();
    const hAt = (k) => { const a = (k / seg) * Math.PI * 2; return 35 + 60 * (0.5 + 0.5 * Math.sin(a * 3.0 + 1.0)) * (0.6 + 0.4 * Math.sin(a * 7.0)) + rng() * 30; };
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      // skip eastern sector (the real Cerros live there): angle measured from +X
      const mid = (a0 + a1) / 2; const dE = Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid)));
      if (dE < 1.05) continue;
      const h0 = hAt(k), h1 = hAt(k + 1);
      const p = (a, h, r) => [Math.cos(a) * r, h, Math.sin(a) * r];
      const b0 = p(a0, -20, R), b1 = p(a1, -20, R), t0 = p(a0, h0, R), t1 = p(a1, h1, R);
      for (const v of [b0, t1, t0, b0, b1, t1]) { pos.push(...v); }
      const lv = 0.82 + rng() * 0.18;
      for (let q = 0; q < 6; q++) colr.push(lv, lv, lv);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false; m.name = 'distant-hills';
    return m;
  })();
  group.add(hills);

  // ---------- rain ----------
  const RAIN_N = 3200;
  const rain = (() => {
    const seeds = new Float32Array(RAIN_N * 4 * 3), corner = new Float32Array(RAIN_N * 4 * 2), pos = new Float32Array(RAIN_N * 4 * 3), idx = new Uint32Array(RAIN_N * 6);
    for (let i = 0; i < RAIN_N; i++) {
      const sx = rng(), sy = rng(), sz = rng();
      for (let v = 0; v < 4; v++) {
        const o = i * 4 + v;
        seeds.set([sx, sy, sz], o * 3);
        corner.set([v < 2 ? 0 : 1, v % 2 ? 1 : -1], o * 2);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { uTime: U.uTime, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(34, 24, 34) }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0.75, 0.82, 0.9) } },
      vertexShader: `
        attribute vec3 aSeed; attribute vec2 aCorner;
        uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox;
        varying float vA;
        void main(){
          vec3 p = aSeed * uBox;
          float speed = 16.0 + aSeed.x * 6.0;
          p.y = mod(p.y - uTime * speed, uBox.y);
          p.x += (uBox.y - p.y) * 0.07;
          vec3 rel = mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox;
          vec3 top = uCenter + rel;
          vec3 bot = top - vec3(0.45, 1.5 + aSeed.z * 0.8, 0.0);
          vec4 vt = viewMatrix * vec4(top, 1.0), vb = viewMatrix * vec4(bot, 1.0);
          vec2 d = vb.xy - vt.xy; float l = length(d); d = l > 1e-5 ? d / l : vec2(0.0, -1.0);
          vec2 n = vec2(-d.y, d.x);
          vec4 v = mix(vt, vb, aCorner.x);
          v.xy += n * aCorner.y * max(0.018, 0.0042 * -v.z);
          gl_Position = projectionMatrix * v;
          float fade = 1.0 - smoothstep(0.35, 0.5, length(rel.xz) / uBox.x);
          vA = mix(0.15, 0.85, aCorner.x) * fade * step(0.0, top.y);
        }`,
      fragmentShader: `uniform float uAlpha; uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uAlpha); }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.name = 'rain';
    return mesh;
  })();
  group.add(rain);

  // ---------- Cerros Orientales ----------
  let cerros = null;
  try { cerros = createCerros(scene, { buildingMat: getSharedMaterials().instanced }); } catch (e) { console.error('[sky] cerros failed', e); }
  scene.add(group);

  // ---------- per-frame scratch ----------
  const tTop = new THREE.Color(), tHor = new THREE.Color(), tHemiS = new THREE.Color(), tHemiG = new THREE.Color(), tSun = new THREE.Color();
  const tmpA = new THREE.Color();
  const hillTint = new THREE.Color(0x3e6a58);
  const lightDir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), snapped = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const SH_TEXEL = (SH * 2) / 2048;
  let cameraFarSet = false;

  function palette(hour) {
    let k = 0; while (k < KEYS.length - 2 && hour >= KEYS[k + 1].h) k++;
    const a = KEYS[k], b = KEYS[k + 1];
    const t = sstep(a.h, b.h, hour);
    tTop.lerpColors(a.top, b.top, t); tHor.lerpColors(a.hor, b.hor, t);
    tHemiS.lerpColors(a.hemiS, b.hemiS, t); tHemiG.lerpColors(a.hemiG, b.hemiG, t); tSun.lerpColors(a.sun, b.sun, t);
    return { sunI: a.sunI + (b.sunI - a.sunI) * t, hemiI: a.hemiI + (b.hemiI - a.hemiI) * t };
  }

  function update(dt, world) {
    updateEnv(world);
    const cam = world?.camera;
    if (cam && !cameraFarSet) { if (cam.far < 2400) { cam.far = 2400; cam.updateProjectionMatrix(); } cameraFarSet = true; }
    const night = env.night, ov = env.overcast * (1 - 0.15 * night), rn = env.rain;
    let { sunI, hemiI } = palette(env.hour);

    // overcast mix (day vs night greys)
    if (ov > 0.001) {
      const dayK = ov * (1 - night);
      const nightK = ov * night * 0.8;
      if (dayK > 0) {
        tTop.lerp(OV_DAY.top, dayK); tHor.lerp(OV_DAY.hor, dayK); tHemiS.lerp(OV_DAY.hemiS, dayK); tHemiG.lerp(OV_DAY.hemiG, dayK); tSun.lerp(OV_DAY.sun, dayK);
        sunI *= 1 - dayK * (1 - OV_DAY.sunK); hemiI += OV_DAY.hemiAdd * dayK;
      }
      if (nightK > 0) { tTop.lerp(OV_NIGHT.top, nightK); tHor.lerp(OV_NIGHT.hor, nightK); tHemiS.lerp(OV_NIGHT.hemiS, nightK); tHemiG.lerp(OV_NIGHT.hemiG, nightK); }
    }
    if (rn > 0.001) {
      const k = rn * (1 - night * 0.6);
      tTop.lerp(RAIN_DAY.top, k * 0.8); tHor.lerp(RAIN_DAY.hor, k * 0.8); tHemiS.lerp(RAIN_DAY.hemiS, k * 0.6); tHemiG.lerp(RAIN_DAY.hemiG, k * 0.6);
      sunI *= 1 - k * (1 - RAIN_DAY.sunK);
    }

    // dome uniforms
    const su = skyMat.uniforms;
    su.uTop.value.copy(tTop); su.uHor.value.copy(tHor);
    su.uSunDir.value.copy(env.sunDir); su.uMoonDir.value.copy(env.moonDir);
    su.uSunColor.value.copy(tSun);
    su.uOvercast.value = Math.min(1, ov + rn * 0.3);
    su.uSunAmt.value = (1 - Math.min(1, ov * 1.1)) * (1 - night) * sstep(-0.04, 0.05, env.sunElev);
    tmpA.copy(tHor).lerp(OV_DAY.hor, 0.5); su.uCloudLit.value.copy(tmpA).multiplyScalar(1.12 - 0.3 * night);
    su.uCloudDark.value.copy(tmpA).multiplyScalar(0.62 - 0.3 * night + 0.08 * (1 - ov));
    if (night > 0.5) { su.uCloudLit.value.lerp(tHor, 0.7); su.uCloudDark.value.lerp(tTop, 0.6); }
    if (cam) dome.position.copy(cam.position);

    // fog
    fogColor.copy(tHor); env.horizon.copy(tHor);
    const fog = scene.fog;
    if (fog && fog.isFog) {
      fog.color.copy(fogColor);
      fog.near = 75 - 25 * rn;
      fog.far = (1000 - 250 * ov - 260 * rn) * (1 - 0.2 * night);
    }
    if (scene.background && scene.background.isColor) scene.background.copy(fogColor);

    // lights
    const dayAmt = sstep(-0.06, 0.2, env.sunElev);
    lightDir.copy(env.moonDir).lerp(env.sunDir, dayAmt).normalize();
    if (lightDir.y < 0.3) { lightDir.y = 0.3; lightDir.normalize(); }
    hemi.color.copy(tHemiS); hemi.groundColor.copy(tHemiG); hemi.intensity = hemiI;
    sun.color.copy(tSun); sun.intensity = sunI;
    const target = world?.player?.position || cam?.position;
    if (target) {
      right.crossVectors(UP, lightDir).normalize(); up.crossVectors(lightDir, right).normalize();
      const pr = (target.x * right.x + target.y * right.y + target.z * right.z), pu = (target.x * up.x + target.y * up.y + target.z * up.z), pl = (target.x * lightDir.x + target.y * lightDir.y + target.z * lightDir.z);
      const qr = Math.round(pr / SH_TEXEL) * SH_TEXEL, qu = Math.round(pu / SH_TEXEL) * SH_TEXEL;
      snapped.set(0, 0, 0).addScaledVector(right, qr).addScaledVector(up, qu).addScaledVector(lightDir, pl);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(lightDir, 180);
      sun.target.updateMatrixWorld();
    }

    // rain
    const ra = rain.material.uniforms;
    const rainOn = rn > 0.02;
    rain.visible = rainOn;
    if (rainOn && cam) { ra.uCenter.value.copy(cam.position); ra.uAlpha.value = rn * (0.85 - 0.3 * night); }

    // hills follow camera
    if (cam) { hills.position.set(cam.position.x, 0, cam.position.z); }
    hills.material.color.copy(tHor).multiplyScalar(0.8).lerp(hillTint, 0.6 * (1 - night * 0.6));
    cerros?.update(dt, env);
  }

  return { update, group, sun, hemi, env };
}
