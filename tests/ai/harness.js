// Test harness: flat road grid from `net` + box buildings; runs the AI systems with a stub/real Vehicle.
import * as THREE from 'three';
import { buildRoadNetwork, MIN_X, MAX_X, MIN_Z, MAX_Z, BLOCK, COLS, ROWS, LANDMARKS } from '/src/config.js';
import { events } from '/src/core/events.js';
import { state } from '/src/core/state.js';
import { input } from '/src/core/input.js';
import { createColliderGrid } from '/src/core/collision.js';
import { Vehicle } from '/src/entities/vehicle.js';

const q = new URLSearchParams(location.search);
const logEl = document.getElementById('log'), hudEl = document.getElementById('hud');
const logs = [];
const addLog = (s) => { logs.unshift(s); logs.length = Math.min(logs.length, 16); logEl.textContent = logs.join('\n'); };
for (const n of ['notify', 'crime', 'wanted:change', 'player:busted', 'horn', 'npc:talk', 'prompt']) {
  if (n === 'horn') { let c = 0; events.on(n, () => { c++; window.__horns = c; }); continue; }
  events.on(n, (d) => addLog(`${n} ${JSON.stringify(d, (k, v) => (k === 'vehicle' || k === 'ped' ? undefined : v)).slice(0, 90)}`));
}
window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message)));
const _ce = console.error; console.error = (...a) => { window.__errors.push(a.map(String).join(' ')); _ce(...a); };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c7); scene.fog = new THREE.Fog(0x9fb4c7, 200, 700);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x445533, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 140, 40); scene.add(sun);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);

const net = buildRoadNetwork();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0x6f8a5a })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363a });
const swMat = new THREE.MeshLambertMaterial({ color: 0xb9b6ad });
for (const r of net.roads) {
  const len = r.axis === 'x' ? MAX_Z - MIN_Z + 20 : MAX_X - MIN_X + 20;
  const g = new THREE.BoxGeometry(r.axis === 'x' ? r.width : len, 0.04, r.axis === 'x' ? len : r.width);
  const m = new THREE.Mesh(g, roadMat); m.position.set(r.axis === 'x' ? r.coord : 0, 0, r.axis === 'z' ? r.coord : 0); scene.add(m);
  if (r.avenue && r.axis === 'x' && r.index === 6) { const med = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, len), swMat); med.position.set(r.coord, 0.1, 0); scene.add(med); }
}
// buildings
const colliders = [];
const bGeo = new THREE.BoxGeometry(1, 1, 1);
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
  const ri = net.roads[i], rj = net.roads[COLS + 1 + j], ri2 = net.roads[i + 1], rj2 = net.roads[COLS + 1 + j + 1];
  const minX = ri.coord + ri.width / 2 + 3, maxX = ri2.coord - ri2.width / 2 - 3, minZ = rj.coord + rj.width / 2 + 3, maxZ = rj2.coord - rj2.width / 2 - 3;
  const sw = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX + 6, 0.12, maxZ - minZ + 6), swMat); sw.position.set((minX + maxX) / 2, 0.06, (minZ + maxZ) / 2); scene.add(sw);
  const h = 6 + rnd() * 14;
  const m = new THREE.Mesh(bGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(rnd(), 0.25, 0.55) }));
  m.scale.set(maxX - minX, h, maxZ - minZ); m.position.set((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2); scene.add(m);
  colliders.push({ minX, maxX, minZ, maxZ, height: h });
}
const colliderGrid = createColliderGrid(colliders);
for (const l of LANDMARKS) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 6), new THREE.MeshBasicMaterial({ color: 0xff00ff })); m.position.set(l.x, 15, l.z); scene.add(m); }

// ---- stub player (on foot or driving) ----
const world = { scene, camera, renderer, net, colliderGrid, city: { colliders }, player: null, vehicles: [], peds: [], state, events, time: 0 };
const playerPos = new THREE.Vector3(201, 0, -148);
const pmesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: 0xff3366 })); pmesh.position.copy(playerPos); scene.add(pmesh);
const player = {
  mesh: pmesh, position: pmesh.position, heading: 0, vehicle: null, health: 100,
  get isDriving() { return !!this.vehicle; },
  get cameraTarget() { return { position: this.position, heading: this.heading, speed: this.vehicle?.speed || 0, isDriving: !!this.vehicle }; },
  update(dt) {
    if (this.vehicle) {
      this.vehicle.setControls(window.__ctl || { throttle: input.throttle, steer: input.steer, handbrake: input.handbrake });
      this.position.copy(this.vehicle.position); this.position.y = 0; this.heading = this.vehicle.heading; pmesh.visible = false;
    } else {
      pmesh.visible = true;
      const sp = input.run ? 7 : 3.4; this.heading += input.steer * 2.5 * dt;
      this.position.x += -Math.sin(this.heading) * input.throttle * sp * dt; this.position.z += -Math.cos(this.heading) * input.throttle * sp * dt; this.position.y = 0.9;
    }
  },
};
world.player = player;
const taxi = new Vehicle(scene, 'taxi', { x: 201 - 6, z: -148 - 6, heading: 0 }); taxi.driver = null; world.vehicles.push(taxi);
window.world = world; window.state = state; window.events = events; window.THREE = THREE; window.player = player; window.taxi = taxi;
window.enterTaxi = (v = taxi) => { v.driver = 'player'; player.vehicle = v; world.vehicles.includes(v) || world.vehicles.push(v); };
window.exitCar = () => { if (player.vehicle) { player.vehicle.driver = null; player.vehicle = null; } };
window.teleport = (x, z) => { player.position.set(x, 0.9, z); if (player.vehicle) { player.vehicle.position.set(x, 0.7, z); } };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') { if (player.vehicle) exitCar(); else { let best = null, bd = 6; for (const v of world.vehicles) { const d = v.position.distanceTo(player.position); if (d < bd) { bd = d; best = v; } } if (best) { if (best.driver === 'ai') events.emit('crime', { type: 'carjack', x: best.position.x, z: best.position.z }); enterTaxi(best); } } }
  if (e.code === 'KeyT') camMode = (camMode + 1) % 3;
});

const systems = [];
async function tryLoad(path, fn) { try { const m = await import(path); const s = fn(m); if (s) systems.push(s); return s; } catch (err) { console.error('[harness] load ' + path, err.message); } }
const sTraffic = await tryLoad('/src/ai/traffic.js', (m) => m.createTraffic(scene, net, { count: 40 }));
const sPeds = q.get('peds') === '0' ? null : await tryLoad('/src/ai/pedestrians.js', (m) => m.createPedestrians(scene, net, { count: 60 }));
const sPolice = q.get('police') === '0' ? null : await tryLoad('/src/ai/police.js', (m) => m.createPolice(scene, net));
world.pedSystem = sPeds; window.sys = { traffic: sTraffic, peds: sPeds, police: sPolice };

let camMode = Number(q.get('cam') || 0);
const cpos = new THREE.Vector3(), clook = new THREE.Vector3();
function updateCam() {
  if (window.__cam) { camera.position.set(...window.__cam.pos); camera.lookAt(...window.__cam.look); camera.updateMatrixWorld(); return; }
  const t = player.position;
  if (camMode === 0) { cpos.set(t.x + 0, 120, t.z + 45); clook.copy(t); }
  else if (camMode === 1) { cpos.set(t.x + Math.sin(player.heading) * 10, 4.5, t.z + Math.cos(player.heading) * 10); clook.set(t.x, 1.5, t.z); }
  else { cpos.set(t.x + 18, 22, t.z + 22); clook.copy(t); }
  camera.position.lerp(cpos, 0.15); camera.lookAt(clook);
  camera.updateMatrixWorld();
}
if (q.get('x')) { teleport(Number(q.get('x')), Number(q.get('z'))); camera.position.set(Number(q.get('x')), 95, Number(q.get('z')) + 55); }
if (q.get('drive') === '1') enterTaxi();

let last = performance.now(), aiMs = 0, frames = 0, aiMsMax = 0, simSpeed = Number(q.get('speed') || 1);
window.__aiStats = { avg: 0, max: 0, frames: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 20); last = now;
  for (let k = 0; k < simSpeed; k++) step(dt);
  updateCam();
  const o = [`veh ${world.vehicles.length} peds ${world.peds.length} wanted ${state.wanted} horns ${window.__horns || 0}`, `AI ms avg ${window.__aiStats.avg.toFixed(2)} max ${window.__aiStats.max.toFixed(2)}  t=${world.time.toFixed(0)}  hour ${state.hour.toFixed(1)}`, `[T] cam  [F] enter/exit  WASD drive  cam=${camMode}`];
  hudEl.textContent = o.join('\n');
  renderer.render(scene, camera); input.endFrame();
}
function step(dt) {
  world.time += dt;
  state.hour += dt / 60; if (state.hour >= 24) state.hour = 0; // 1 s = 1 game minute
  window.__botStep?.();
  player.update(dt, world);
  for (const v of world.vehicles) if (!v.destroyedAndRemoved) v.update(dt, world);
  const t0 = performance.now();
  for (const s of systems) { try { s.update(dt, world); } catch (err) { console.error(err); window.__errors.push('update: ' + err.stack); } }
  const ms = performance.now() - t0;
  const S = window.__aiStats; S.frames++; S.avg += (ms - S.avg) * 0.05; S.max = Math.max(S.max * 0.995, ms);
  if (input.pressed('KeyE') && sPeds && !player.vehicle) { const p = sPeds.nearestTalkable(player.position, 3.5); if (p) events.emit('npc:talk', { ped: p }); }
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
requestAnimationFrame(frame);
window.__ready = true;

window.fastForward = (sec, dt = 1 / 30) => { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) step(dt); return world.time; };
window.__metrics = () => {
  let overlaps = 0, offroad = 0, stopped = 0, n = 0, sum = 0;
  const vs = world.vehicles;
  for (const v of vs) { if (v === taxi || v.destroyed) continue; n++; sum += Math.abs(v.speed); if (Math.abs(v.speed) < 0.3) stopped++; if (!net.roadAt(v.position.x, v.position.z)) offroad++; }
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) { const a = vs[i], b = vs[j]; if (a.position.distanceTo(b.position) < (a.radius + b.radius) * 0.7) overlaps++; }
  return { n, avgSpeed: +(sum / Math.max(1, n)).toFixed(2), stopped, offroad, overlaps };
};
// Runs `sec` simulated seconds and reports collision damage among AI vehicles (should be ~0 for ambient traffic).
window.__crashTest = (sec = 300) => {
  const log = [];
  const off = events.on('vehicle:damaged', (d) => {
    const v = d.vehicle; let near = null, nd = 99;
    for (const o of world.vehicles) { if (o === v) continue; const dd = o.position.distanceTo(v.position); if (dd < nd) { nd = dd; near = o; } }
    const ag = sys.traffic?.agents.find((a) => a.v === v);
    log.push({ t: world.time | 0, type: v.type, amt: +d.amount.toFixed(1), x: v.position.x | 0, z: v.position.z | 0, st: ag?.state, turn: ag?.turn, sp: +v.speed.toFixed(1), other: near?.type, od: +nd.toFixed(1), osp: near ? +near.speed.toFixed(1) : 0 });
  });
  fastForward(sec); off();
  return { n: log.length, log: log.slice(0, 10), metrics: __metrics(), errors: window.__errors.slice(0, 3) };
};
// Player bot: drives the player's vehicle around the grid (random walk on nodes) so chases can be tested without a keyboard.
const bot = { tn: null, pn: null, speed: 22 };
window.__bot = (on, speed = 22) => { bot.speed = speed; window.__ctl = on ? { throttle: 0, steer: 0, handbrake: false } : null; if (!on) bot.tn = null; };
const _botStep = () => {
  if (!window.__ctl || !player.vehicle || window.__ctl.handbrake === true) return;
  const v = player.vehicle, p = v.position;
  if (!bot.tn || Math.hypot(bot.tn.x - p.x, bot.tn.z - p.z) < 14) {
    const cn = net.nearestNode(p.x, p.z);
    const hx = -Math.sin(v.heading), hz = -Math.cos(v.heading);
    const opts = cn.neighbors.map((id) => net.nodes[id]).filter((n) => (n.x - p.x) * hx + (n.z - p.z) * hz > 5);
    bot.tn = opts.length ? opts[(Math.random() * opts.length) | 0] : net.nodes[cn.neighbors[0]];
  }
  const dx = bot.tn.x + 3 - p.x, dz = bot.tn.z - p.z; // aim a little right of the node
  let err = Math.atan2(-dx, -dz) - v.heading; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
  window.__ctl.steer = Math.max(-1, Math.min(1, err * 2)); window.__ctl.throttle = v.speed < bot.speed ? 1 : 0;
};
window.__botStep = _botStep;
window.__chaseTest = (sec = 30, botSpeed = 15, crimes = ['hit_police', 'carjack']) => {
  if (!player.vehicle) enterTaxi();
  __bot(true, botSpeed); fastForward(4);
  for (const c of crimes) sys.police.addHeat(c, player.position.x, player.position.z);
  const r = [];
  for (let k = 0; k < sec / 2; k++) {
    fastForward(2);
    const us = sys.police.units.map((u) => ({ m: u.mode[0], d: Math.round(Math.hypot(u.v.position.x - player.position.x, u.v.position.z - player.position.z)), sp: Math.round(u.v.speed), s: u.stuckT, l: u.los }));
    r.push(`t${world.time | 0} w${state.wanted} p${Math.round(player.vehicle.speed)}/${Math.round(player.vehicle.health)} ` + us.map((u) => `${u.m}${u.d}/${u.sp}${u.l ? '*' : ''}${u.s > 0.5 ? '!' : ''}`).join(' '));
  }
  return { r, errors: window.__errors.slice(0, 4) };
};
// Drives the taxi at a sidewalk ped (dodge disabled) to test the cartoon knockdown. Returns a trace.
window.__hitTest = (speed = 12, camFollow = true) => {
  fastForward(3); enterTaxi(); const v = taxi;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]; let ped = null, dir = null;
  outer: for (const p of world.peds) { if (p.kind === 'vendor' || p.kind === 'policia' || p.st !== 'walk') continue; for (const d of dirs) { if (!net.roadAt(p.position.x + d[0] * 9, p.position.z + d[1] * 9)) continue; if (net.roadAt(p.position.x, p.position.z)) continue; ped = p; dir = d; break outer; } }
  if (!ped) return 'no ped';
  ped.dodge = false; ped.mvx = 0; ped.mvz = 0;
  v.position.set(ped.position.x + dir[0] * 11, 0, ped.position.z + dir[1] * 11); v.heading = Math.atan2(dir[0], dir[1]); v.speed = speed; v.velocity.set(-dir[0] * speed, 0, -dir[1] * speed);
  window.__ctl = { throttle: 0.6, steer: 0, handbrake: false };
  const ev = []; const o1 = events.on('crime', (d) => ev.push(d.type)); const o2 = events.on('notify', (d) => ev.push(d.text));
  const trace = [];
  for (let i = 0; i < 70; i++) { fastForward(0.05, 1 / 60); if (i % 5 === 0) trace.push([ped.st, +ped.hy.toFixed(2), +ped.pitch.toFixed(1), Math.round(Math.hypot(v.position.x - ped.position.x, v.position.z - ped.position.z))].join('/')); if (ped.st === 'down' && camFollow && !window.__cam) window.__cam = { pos: [ped.position.x + 7, 3.5, ped.position.z + 7], look: [ped.position.x, 0.8, ped.position.z] }; }
  window.__ctl = { throttle: 0, steer: 0, handbrake: true };
  const mid = [ped.st, ped.knockedDown]; fastForward(3.2); const after = [ped.st, ped.knockedDown]; fastForward(1.5);
  o1(); o2(); window.__hitPed = ped;
  return { ev, trace, mid, after, now: [ped.st, ped.knockedDown], wanted: state.wanted, err: window.__errors.slice(0, 3) };
};
