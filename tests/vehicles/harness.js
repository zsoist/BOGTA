// Scratch harness for src/entities/*: flat ground, box buildings, player + every vehicle type, chase cam (same as main.js).
import * as THREE from 'three';
import { events } from '../../src/core/events.js';
import { state } from '../../src/core/state.js';
import { input } from '../../src/core/input.js';
import { createColliderGrid } from '../../src/core/collision.js';
import { Vehicle, VEHICLE_TYPES } from '../../src/entities/vehicle.js';
import { Player } from '../../src/entities/player.js';

const q = new URLSearchParams(location.search);
if (q.has('hour')) state.hour = parseFloat(q.get('hour'));
const errBox = document.getElementById('err');
addEventListener('error', (e) => { errBox.textContent += `${e.message}\n`; });
addEventListener('unhandledrejection', (e) => { errBox.textContent += `${e.reason?.stack || e.reason}\n`; });

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const night = state.hour >= 19 || state.hour < 6;
scene.background = new THREE.Color(night ? 0x0a0f1c : 0x9fb4c7);
scene.fog = new THREE.Fog(scene.background, 90, 360);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

scene.add(new THREE.HemisphereLight(night ? 0x334466 : 0xdfefff, 0x445533, night ? 0.5 : 1.2));
const sun = new THREE.DirectionalLight(night ? 0x8899cc : 0xffffff, night ? 0.4 : 1.6);
sun.position.set(80, 140, 40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
scene.add(sun, sun.target);

// ground + road stripes
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: 0x3b4046 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(1200, 150, 0x555b63, 0x474d54); grid.position.y = 0.01; scene.add(grid);
const colliders = [];
const bMat = new THREE.MeshLambertMaterial({ color: 0xb49a7c, flatShading: true });
function building(x, z, w, d, h, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });
}
building(-40, -60, 20, 30, 18, 0xb0623f); building(45, -70, 28, 20, 24, 0x7a8ea0); building(0, -130, 90, 12, 14, 0xc9b27a);
building(-70, 20, 14, 60, 12, 0x8a6a8a); building(70, 10, 14, 60, 16, 0x6f9a7a); building(0, 90, 40, 10, 10, 0xaa7755);
building(0, -20, 4, 4, 3, 0x999999); // lone pillar to bump into
const colliderGrid = createColliderGrid(colliders);

const world = { scene, camera, renderer, net: null, colliderGrid, city: null, player: null, vehicles: [], peds: [], state, events, time: 0 };
const player = new Player(scene);
player.position.set(6, 0, 0);
world.player = player;

const spawnAt = (type, x, z, heading = 0, driver = null) => { const v = new Vehicle(scene, type, { x, z, heading }); v.driver = driver; world.vehicles.push(v); return v; };
const taxi = spawnAt('taxi', 3, -8);
spawnAt('moto', 3, -14);
const types = Object.keys(VEHICLE_TYPES);
types.forEach((t, i) => spawnAt(t, -26 + i * 6.5 - (VEHICLE_TYPES[t].length > 10 ? 4 : 0) + (i > 5 ? 8 : 0), 30 + (i % 3) * 14, Math.PI * 0.5 * 0 + 0.2));
// AI car driving in a circle (to carjack)
const ai = spawnAt('sedan', 20, 4, 0, 'ai');
window.sim = { world, player, taxi, ai, Vehicle, THREE, events, state, input };

// --- tiny HUD ---
const hud = document.getElementById('hud'), promptEl = document.getElementById('prompt'), toast = document.getElementById('toast');
events.on('prompt', ({ text }) => { promptEl.style.display = text ? 'block' : 'none'; promptEl.textContent = text || ''; });
const log = [];
const note = (t) => { log.unshift(t); log.length = Math.min(log.length, 6); };
events.on('notify', ({ text }) => { const d = document.createElement('div'); d.textContent = text; toast.prepend(d); setTimeout(() => d.remove(), 3500); });
for (const n of ['crime', 'vehicle:enter', 'vehicle:exit', 'vehicle:damaged', 'vehicle:destroyed', 'crash', 'horn', 'player:wasted'])
  events.on(n, (d) => note(`${n} ${d && d.type ? d.type : d && d.intensity !== undefined ? d.intensity.toFixed(2) : d && d.amount ? d.amount.toFixed(1) : ''}`));

// --- camera (copy of main.js) ---
const cam = { yaw: 0, shake: 0, pos: new THREE.Vector3(6, 8, 12), look: new THREE.Vector3(), mode: 0 };
events.on('crash', ({ intensity = 0.5 } = {}) => { cam.shake = Math.min(1, cam.shake + intensity * 0.6); });
const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();
function updateCamera(dt) {
  if (input.pressed('KeyC')) cam.mode = (cam.mode + 1) % 2;
  const t = player.cameraTarget;
  const driving = t.isDriving;
  let dYaw = t.heading - cam.yaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
  cam.yaw += dYaw * (1 - Math.exp(-(driving ? 3.2 : 4) * dt));
  const far = cam.mode === 1;
  const dist = driving ? (far ? 16 : 10) + Math.abs(t.speed) * 0.08 : far ? 9 : 6;
  const height = driving ? (far ? 7 : 4.2) : far ? 4.5 : 2.6;
  tmpV.set(Math.sin(cam.yaw) * dist, height, Math.cos(cam.yaw) * dist).add(t.position);
  cam.pos.lerp(tmpV, 1 - Math.exp(-6 * dt));
  tmpL.set(-Math.sin(cam.yaw) * 4, driving ? 1.6 : 1.5, -Math.cos(cam.yaw) * 4).add(t.position);
  cam.look.lerp(tmpL, 1 - Math.exp(-10 * dt));
  camera.position.copy(cam.pos);
  if (cam.shake > 0.001) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake *= Math.exp(-6 * dt); }
  camera.lookAt(cam.look);
  const tf = 62 + Math.min(16, Math.abs(t.speed) * 0.35);
  camera.fov += (tf - camera.fov) * (1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix();
}

const timer = new THREE.Timer();
let frames = 0, fpsT = 0, fps = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  world.time += dt;
  state.hour += dt / 60 * 0; // frozen clock
  // AI sedan circles lazily
  if (ai.driver === 'ai') ai.setControls({ throttle: 0.35, steer: 0.22, handbrake: false });
  if (input.pressed('KeyN')) state.hour = state.hour >= 19 || state.hour < 6 ? 14.5 : 22;
  player.update(dt, world);
  for (const v of world.vehicles) v.update(dt, world);
  updateCamera(dt);
  if (window.sim.free) { camera.position.set(...window.sim.free.pos); camera.lookAt(...window.sim.free.look); }
  sun.position.set(player.position.x + 80, 140, player.position.z + 40); sun.target.position.copy(player.position);
  input.endFrame();
  renderer.render(scene, camera);
  frames++; fpsT += dt;
  if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  const v = player.vehicle;
  hud.textContent = `fps ${fps.toFixed(0)}  mode ${player.mode}  hp ${state.health}  hour ${state.hour.toFixed(1)}\n` +
    (v ? `${v.type} speed ${(v.speed * 3.6).toFixed(0)} km/h  lat ${v.lateral.toFixed(1)}  drift ${v.drifting}  hp ${v.health.toFixed(0)}  flipped ${v.flipped}\n` : `on foot  speed ${player.speed.toFixed(1)}\n`) +
    log.join('\n') + `\ncalls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`;
}
requestAnimationFrame(frame);
window.__ready = true;

// showcase helper: sim.show('chiva', azimuthRad)  — parks only that type in front of a fixed camera
sim.show = (type, az = 0.6, list) => {
  const seen = {}; const uniq = [];
  for (const v of world.vehicles) { if (v === ai) continue; if (seen[v.type]) continue; seen[v.type] = 1; uniq.push(v); }
  uniq.forEach((q, i) => { q.position.set(400 + i * 30, 0, 400); q.driver = null; q.health = 100; });
  const sel = list ? list.map((t) => uniq.find((q) => q.type === t)) : [uniq.find((q) => q.type === type)];
  let x = 0, maxL = 0;
  sel.forEach((v) => { v.position.set(x, 0, 300); v.heading = 0; v.velocity.set(0, 0, 0); x += 6; maxL = Math.max(maxL, v.length); });
  const cx = (x - 6) / 2, d = maxL * 0.95 + 4;
  sim.free = { pos: [cx + Math.sin(az) * d, d * 0.33 + 1.2, 300 + Math.cos(az) * d], look: [cx, maxL > 6 ? 1.5 : 0.7, 300] };
};
