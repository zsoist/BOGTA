// GTA Bogotá — bootstrap + game loop. Owned by the lead; modules follow docs/CONTRACT.md.
import * as THREE from 'three';
import { buildRoadNetwork, districtAt, LANDMARKS, GAME_MINUTES_PER_SECOND, carreraX, calleZ } from './config.js';
import { events } from './core/events.js';
import { state } from './core/state.js';
import { input } from './core/input.js';
import { createColliderGrid } from './core/collision.js';

const bootError = (err) => {
  console.error(err);
  const el = document.getElementById('boot-error');
  el.style.display = 'block';
  el.textContent += `${err?.stack || err}\n`;
};
addEventListener('error', (e) => bootError(e.error || e.message));
addEventListener('unhandledrejection', (e) => bootError(e.reason));

// Optional modules load independently so one broken module never kills the whole game.
async function load(path) {
  try { return await import(path); } catch (err) { bootError(`[load] ${path}: ${err.message}`); return {}; }
}

const [cityMod, skyMod, vehicleMod, playerMod, trafficMod, pedsMod, policeMod, hudMod, minimapMod, dialogMod, titleMod, audioMod, netMod] =
  await Promise.all([
    load('./world/city.js'), load('./world/sky.js'), load('./entities/vehicle.js'), load('./entities/player.js'),
    load('./ai/traffic.js'), load('./ai/pedestrians.js'), load('./ai/police.js'),
    load('./ui/hud.js'), load('./ui/minimap.js'), load('./ui/dialog.js'), load('./ui/title.js'),
    load('./audio/audio.js'), load('./net/claude.js'),
  ]);

// ---------- Renderer / scene / camera ----------
const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4c7);
scene.fog = new THREE.Fog(0x9fb4c7, 90, 360);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
// Size is checked every frame: robust to hidden tabs, panes and devtools (resize events can be missed).
let lastW = 0, lastH = 0;
function syncSize() {
  const w = innerWidth, h = innerHeight;
  if (!w || !h || (w === lastW && h === lastH)) return;
  lastW = w; lastH = h;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
syncSize();

// Fallback lighting (sky.js replaces/controls its own lights; these stay subtle).
if (!skyMod.createSky) {
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x445533, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(80, 140, 40); scene.add(sun);
}

// ---------- World ----------
const net = buildRoadNetwork();
let city;
try { city = cityMod.createCity ? cityMod.createCity(scene, net) : fallbackCity(scene); }
catch (err) { bootError(`[city] ${err.message}`); city = fallbackCity(scene); }
const colliderGrid = createColliderGrid(city.colliders || []);
let sky = null;
try { sky = skyMod.createSky?.(scene, renderer); } catch (err) { bootError(`[sky] ${err.message}`); }

const world = { scene, camera, renderer, net, colliderGrid, city, player: null, vehicles: [], peds: [], state, events, time: 0 };

// Player spawns on the sidewalk in front of Universidad Santo Tomás (Build Day venue), with a taxi parked next to them.
const spawn = { x: carreraX(9) + 9, z: calleZ(7) - 20 };
const player = playerMod.Player ? new playerMod.Player(scene) : null;
if (player) { player.position.set(spawn.x, 0, spawn.z); player.heading = 0; world.player = player; }
if (vehicleMod.Vehicle) {
  const taxi = new vehicleMod.Vehicle(scene, 'taxi', { x: carreraX(9) + 3, z: calleZ(7) - 30, heading: 0 });
  taxi.driver = null;
  world.vehicles.push(taxi);
  const moto = new vehicleMod.Vehicle(scene, 'moto', { x: carreraX(9) + 3, z: calleZ(7) - 42, heading: 0 });
  world.vehicles.push(moto);
}

const systems = [
  trafficMod.createTraffic?.(scene, net, { count: 40 }),
  pedsMod.createPedestrians?.(scene, net, { count: 60 }),
  policeMod.createPolice?.(scene, net),
  city, sky,
].filter((s) => s && typeof s.update === 'function');
const pedSystem = systems.find((s) => typeof s.nearestTalkable === 'function') || null;
world.pedSystem = pedSystem;

const hud = hudMod.createHUD?.(uiRoot);
const minimap = minimapMod.createMinimap?.(uiRoot, net);
const dialog = dialogMod.createDialog?.(uiRoot);
const audio = audioMod.createAudio?.();
const uiSystems = [hud, minimap, dialog, audio].filter((s) => s && typeof s.update === 'function');

// ---------- Camera rig ----------
const cam = { mode: 0, yaw: 0, shake: 0, pos: new THREE.Vector3(spawn.x, 8, spawn.z + 12), look: new THREE.Vector3() };
events.on('crash', ({ intensity = 0.5 } = {}) => { cam.shake = Math.min(1, cam.shake + intensity * 0.6); });
const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();
function updateCamera(dt) {
  if (!player) return;
  if (input.pressed('KeyC')) cam.mode = (cam.mode + 1) % 2;
  const t = player.cameraTarget || { position: player.position, heading: player.heading, speed: 0, isDriving: false };
  const driving = t.isDriving;
  // Smoothly follow the heading (lag gives the GTA "swing" on turns).
  let dYaw = t.heading - cam.yaw;
  dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
  cam.yaw += dYaw * (1 - Math.exp(-(driving ? 3.2 : 4) * dt));
  const far = cam.mode === 1;
  const dist = driving ? (far ? 16 : 10) + Math.abs(t.speed) * 0.08 : far ? 9 : 6;
  const height = driving ? (far ? 7 : 4.2) : far ? 4.5 : 2.6;
  tmpV.set(Math.sin(cam.yaw) * dist, height, Math.cos(cam.yaw) * dist).add(t.position);
  // Keep the camera out of buildings.
  cam.pos.lerp(tmpV, 1 - Math.exp(-6 * dt));
  tmpL.set(-Math.sin(cam.yaw) * 4, driving ? 1.6 : 1.5, -Math.cos(cam.yaw) * 4).add(t.position);
  cam.look.lerp(tmpL, 1 - Math.exp(-10 * dt));
  camera.position.copy(cam.pos);
  if (cam.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * cam.shake;
    camera.position.y += (Math.random() - 0.5) * cam.shake;
    cam.shake *= Math.exp(-6 * dt);
  }
  camera.lookAt(cam.look);
  const targetFov = 62 + Math.min(16, Math.abs(t.speed) * 0.35);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-3 * dt));
  camera.updateProjectionMatrix();
}

// ---------- Game clock / district tracking ----------
let lastDistrict = '';
function updateClock(dt) {
  state.hour += (dt * GAME_MINUTES_PER_SECOND) / 60;
  if (state.hour >= 24) { state.hour -= 24; state.day += 1; events.emit('notify', { text: `Día ${state.day} — ${state.day % 2 ? 'impar' : 'par'}: ojo con el pico y placa`, kind: 'info' }); }
  const wasRaining = state.raining;
  state.raining = state.hour >= 15 && state.hour < 17.5; // "llueve a las 3"
  if (state.raining && !wasRaining) events.emit('notify', { text: '🌧️ Son las 3... y como siempre, llovió en Bogotá', kind: 'info' });
  if (player) {
    const d = districtAt(player.position.z);
    if (d !== lastDistrict) { lastDistrict = d; events.emit('district:change', { name: d }); }
  }
}

// ---------- Loop ----------
// simulate(dt) advances the world; renderFrame() draws. Normal play drives them from rAF;
// capture mode (?capture=1, see src/capture/) drives them with a fixed timestep for frame-perfect trailer footage.
function simulate(dt) {
  world.time += dt;
  updateClock(dt);
  player?.update(dt, world);
  for (const v of world.vehicles) if (!v.destroyedAndRemoved) v.update?.(dt, world);
  for (const s of systems) { try { s.update(dt, world); } catch (err) { console.error(err); } }
  if (input.pressed('KeyE') && pedSystem && player && !player.isDriving) {
    const ped = pedSystem.nearestTalkable(player.position, 3.5);
    if (ped) events.emit('npc:talk', { ped });
  }
  if (!world.cameraOverride) updateCamera(dt); else world.cameraOverride(dt, world);
}
function renderFrame(dt) {
  for (const s of uiSystems) { try { s.update(dt, world); } catch (err) { console.error(err); } }
  input.endFrame();
  renderer.render(scene, camera);
}
const params = new URLSearchParams(location.search);
const captureMode = params.has('capture');
const timer = new THREE.Timer();
let running = false;
function frame(ts) {
  requestAnimationFrame(frame);
  syncSize();
  if (captureMode) return; // capture driver owns stepping
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  if (input.pressed('KeyP')) state.paused = !state.paused;
  if (running && !state.paused) simulate(dt);
  renderFrame(dt);
}
requestAnimationFrame(frame);
Object.assign(world, { simulate, renderFrame, cam });

// ---------- Start ----------
netMod.checkAI?.().then((r) => { state.aiEnabled = !!r?.enabled; }).catch(() => {});
if (captureMode) {
  const cap = await load('./capture/capture.js');
  state.started = true; running = true;
  cap.installCapture?.({ world, params });
} else if (titleMod.createTitle) await titleMod.createTitle(uiRoot);
audio?.unlock?.();
state.started = true;
running = true;
events.emit('notify', { text: '¡Bienvenido a Bogotá, parce! F para robar el taxi 🚕', kind: 'good' });
const santo = LANDMARKS.find((l) => l.id === 'santo_tomas');
events.emit('district:change', { name: santo ? santo.name : 'Chapinero' });

// Expose for debugging in DevTools.
Object.assign(window, { THREE, world, state, events });

function fallbackCity(scene) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0x3a3f44 }));
  g.rotation.x = -Math.PI / 2; scene.add(g);
  return { colliders: [], update() {} };
}
