// Optional cinematic post chain for capture mode only (the game itself is untouched): MSAA HDR render target with a depth texture ->
// depth-of-field (gather bokeh, scatter-as-gather weighting) -> UnrealBloom -> OutputPass (ACES tone mapping + sRGB).
// Enabled per shot with `post: { dof: { focus, range, strength, maxBlur }, bloom: { strength, radius, threshold } }`.
// It works by intercepting renderer.render(scene, camera) for the main scene render, so world.renderFrame() needs no changes.
import * as THREE from 'three';

const DOF_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear, uFar, uFocus, uRange, uStrength, uMaxBlur;
varying vec2 vUv;
float viewDist(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float cocAt(vec2 uv) {
  float z = viewDist(texture2D(tDepth, uv).x);
  float a = max(abs(z - uFocus) - uRange, 0.0);
  return clamp(a / max(z, 0.5) * uStrength, 0.0, 1.0) * uMaxBlur;
}
void main() {
  vec4 c0 = texture2D(tColor, vUv);
  float coc0 = cocAt(vUv);
  vec3 acc = c0.rgb; float wsum = 1.0;
  const int N = 56;
  const float GOLD = 2.39996323;
  for (int i = 0; i < N; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / float(N));
    float a = fi * GOLD;
    vec2 o = vec2(cos(a), sin(a)) * r * uMaxBlur;
    vec2 uv = vUv + o / uRes;
    float sc = cocAt(uv);
    float dist = length(o);
    float w = clamp(sc - dist + 1.0, 0.0, 1.0);
    // pixels that are themselves in focus must not be smeared by far-away blurry neighbours behind them
    float zS = viewDist(texture2D(tDepth, uv).x), zC = viewDist(texture2D(tDepth, vUv).x);
    if (zS > zC + 2.0) w *= clamp(coc0 - dist + 1.0, 0.0, 1.0);
    vec3 s = texture2D(tColor, uv).rgb;
    float lum = dot(s, vec3(0.299, 0.587, 0.114));
    w *= 1.0 + lum * lum * 1.5;
    acc += s * w; wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, c0.a);
}`;
const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function createPost(renderer, scene, camera) {
  const orig = renderer.render.bind(renderer);
  const size = new THREE.Vector2();
  const state = { on: false, params: { dof: null, bloom: null }, ready: false };
  let rtScene = null, rtA = null, bloom = null, out = null, quad = null, dofMat = null;
  let inRender = false;

  function ensureTargets() {
    renderer.getDrawingBufferSize(size);
    if (rtScene && rtScene.width === size.x && rtScene.height === size.y) return;
    rtScene?.dispose(); rtA?.dispose();
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    rtScene = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth, colorSpace: THREE.LinearSRGBColorSpace });
    rtA = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    bloom?.setSize?.(size.x, size.y);
  }

  async function init() {
    if (state.ready) return true;
    try {
      const [{ UnrealBloomPass }, { OutputPass }, { FullScreenQuad }] = await Promise.all([
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
        import('three/addons/postprocessing/Pass.js'),
      ]);
      renderer.getDrawingBufferSize(size);
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.5, 0.9);
      out = new OutputPass();
      out.renderToScreen = true;
      dofMat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: DOF_FRAG, depthTest: false, depthWrite: false,
        uniforms: { tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 2400 }, uFocus: { value: 50 }, uRange: { value: 5 }, uStrength: { value: 0.5 }, uMaxBlur: { value: 10 } },
      });
      quad = new FullScreenQuad(dofMat);
      state.ready = true;
      return true;
    } catch (err) { console.error('[capture/post] unavailable, rendering without post', err); return false; }
  }

  function renderPost() {
    ensureTargets();
    const p = state.params;
    // 1) scene -> MSAA HDR target (with depth)
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    orig(scene, camera);
    // 2) depth of field (with no DoF requested the same pass runs as a plain, no-blur copy so bloom never touches the MSAA target)
    const u = dofMat.uniforms;
    u.tColor.value = rtScene.texture; u.tDepth.value = rtScene.depthTexture;
    u.uRes.value.set(size.x, size.y);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    if (p.dof) {
      u.uFocus.value = p.dof.focus; u.uRange.value = p.dof.range ?? 4; u.uStrength.value = p.dof.strength ?? 0.5;
      u.uMaxBlur.value = (p.dof.maxBlur ?? 10) * (size.y / 1080);
    } else { u.uFocus.value = 50; u.uRange.value = 1e6; u.uStrength.value = 0; u.uMaxBlur.value = 0.001; }
    renderer.setRenderTarget(rtA);
    quad.render(renderer);
    const src = rtA;
    // 3) bloom (adds onto `src`)
    if (p.bloom) {
      bloom.strength = p.bloom.strength ?? 0.3; bloom.radius = p.bloom.radius ?? 0.5; bloom.threshold = p.bloom.threshold ?? 0.9;
      bloom.render(renderer, null, src, 1 / 60, false);
    }
    // 4) tone map + sRGB to the canvas
    out.render(renderer, null, src);
  }

  renderer.render = function (s, c) {
    if (!state.on || inRender || s !== scene || c !== camera) return orig(s, c);
    inRender = true;
    try { renderPost(); } finally { inRender = false; }
  };

  return {
    params: state.params,
    async configure(cfg) {
      if (!cfg || (!cfg.dof && !cfg.bloom)) { state.on = false; state.params.dof = null; state.params.bloom = null; return state.params; }
      const ok = await init();
      state.on = ok;
      state.params.dof = cfg.dof ? { ...cfg.dof } : null;
      state.params.bloom = cfg.bloom ? { ...cfg.bloom } : null;
      return state.params;
    },
  };
}
