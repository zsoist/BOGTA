// Police: wanted level (heat -> 0..5 stars), pursuit with prediction, ramming, roadblocks at 4+ stars,
// line-of-sight cooldown, busted logic, pico y placa pull-over gag. Owns state.wanted.
// Contract: createPolice(scene, net) -> { update(dt, world) }.
import * as VehicleMod from '../entities/vehicle.js';
import { state, addMoney } from '../core/state.js';
import { events } from '../core/events.js';
import { MIN_Z, MAX_Z, calleZ, ROWS, BLOCK } from '../config.js';
import {
  clamp, rand, wrapAngle, ensureIndex, inView, lineClear, driveToward, makeCtl, removeVehicle, extentAlong, halfLen, halfWid,
} from './common.js';
import { pickLaneSpawn } from './roads.js';

const CRIME_HEAT = { carjack: 1, hit_ped: 1, hit_police: 2, ram: 0.5, pico_placa: 1, speeding: 0.2 };
const COOL_SECONDS = 20;
const _sp = { x: 0, z: 0, from: null, to: null, s: 0, off: 0, heading: 0 };
const _near = [];
const HOLD = { throttle: 0, steer: 0, handbrake: true };

const LEVEL_TEXT = {
  1: ['🚨 ¡Alto ahí, sumercé!', 'bad'],
  2: ['🚓 ¡Refuerzos en camino, parce!', 'bad'],
  3: ['🏍️ ¡Se prendió esto! Ya vienen las motos', 'bad'],
  4: ['🚧 ¡Retén adelante! Esto está más caliente que un tinto de Don Aurelio', 'bad'],
  5: ['🚨 ¡Todo el Escuadrón Rolo va por usted! Más patrullas que huecos en la Caracas', 'bad'],
};

export function createPolice(scene, net) {
  const Vehicle = VehicleMod.Vehicle;
  const TYPES = VehicleMod.VEHICLE_TYPES || {};
  const units = [];
  let heat = 0, level = 0, time = 0;
  let unseenT = 0, lastX = 0, lastZ = 0, spawnCd = 0, adoptCd = 0, losCd = 0, bustT = 0, bustedCd = 0, bustNotified = false;
  let ramCd = 0, speedCd = 0, rbCd = 8, nextSlot = 0, rb = null;
  let plx = 0, plz = 0, pvx = 0, pvz = 0, psp = 0, prevX = 0, prevZ = 0, havePrev = false, pdir = 0;
  const pico = { drive: 0, need: rand(18, 35), cd: 0, active: false, unit: null, announced: false, t: 0, stopT: 0, wait: 0 };
  let wantedWorld = null;

  // ------------------------------------------------------------------ heat / level
  function setLevel(L, silent) {
    if (L === level) return;
    const up = L > level;
    const prev = level;
    level = L;
    state.wanted = L;
    if (prev === 0 && L > 0) for (const u of units) if (u.mode === 'retire') { u.mode = 'chase'; u.tn = -1; u.v.setSiren?.(true); }
    events.emit('wanted:change', { level: L });
    if (up && !silent && LEVEL_TEXT[L]) events.emit('notify', { text: LEVEL_TEXT[L][0], kind: LEVEL_TEXT[L][1] });
  }
  function addHeat(type, x, z) {
    if (bustedCd > 0) return;
    const h = CRIME_HEAT[type];
    if (!h) return;
    if (type === 'ram') { if (time < ramCd) return; ramCd = time + 1.2; }
    if (type === 'speeding') { if (time < speedCd) return; speedCd = time + 2.5; if (heat >= 1) return; heat = Math.min(1, heat + h); }
    else heat = Math.min(5.99, heat + h);
    if (x !== undefined) { lastX = x; lastZ = z; }
    unseenT = 0;
    setLevel(Math.floor(heat + 1e-6));
  }
  function clearWanted(msg, kind = 'good') {
    heat = 0; unseenT = 0; bustT = 0; bustNotified = false;
    state.wantedSearching = false;
    if (level > 0) {
      setLevel(0, true);
      if (msg) events.emit('notify', { text: msg, kind });
    }
    for (const u of units) if (u.mode !== 'pull') toRetire(u);
    if (rb) { for (const u of rb.units) if (u.mode === 'block') toRetire(u); rb = null; }
  }
  events.on('crime', (d) => { if (d && d.type) addHeat(d.type, d.x, d.z); });
  events.on('player:wasted', () => { bustedCd = 3; clearWanted(null); pico.active = false; });

  // ------------------------------------------------------------------ units
  function makeUnit(v, kind, mode) {
    return {
      v, kind, mode, ctl: makeCtl(), prevHeading: v.heading, yawRate: 0, los: false, losT: rand(0, 0.25),
      stuckT: 0, revT: 0, revSteer: 1, tn: -1, nn: -1, pn: -1, flank: (nextSlot++ % 2) ? 1 : -1, born: time, sirenT: 0, wreckT: 0, goal: -1,
      blockT: 0, lat: 2.6, shiftT: 0, maxS: v.def?.maxSpeed || 32, gain: kind === 'moto' ? 2.4 : 2.0,
    };
  }
  function toRetire(u) { if (u.mode !== 'retire') { u.mode = 'retire'; u.sirenT = 2 + rand(0, 2); u.tn = -1; } }

  function spawnUnit(world, kind, mode = 'chase', at = null) {
    const type = kind === 'moto' && TYPES.policeMoto ? 'policeMoto' : 'police';
    if (!TYPES[type]) return null;
    let spot = at;
    if (!spot) {
      if (!pickLaneSpawn(net, world, mode === 'pull' ? { minD: 85, maxD: 150, hidden: true, kind: 'car', clear: 9 } : { minD: 120, maxD: 205, hidden: true, kind: 'car', clear: 9 }, _sp)) return null;
      spot = _sp;
    }
    let v;
    try { v = new Vehicle(scene, type, { x: spot.x, z: spot.z, heading: spot.heading }); } catch (e) { console.error('[police] spawn failed', e); return null; }
    v.driver = 'ai'; v.aiOwner = 'police';
    v.setSiren?.(true);
    world.vehicles.push(v);
    const u = makeUnit(v, kind, mode);
    units.push(u);
    return u;
  }

  function adopt(world) {
    // ambient patrol cars from the traffic system join the chase
    const target = level * 2;
    for (let i = 0; i < world.vehicles.length && units.length < target; i++) {
      const v = world.vehicles[i];
      if (!v.isPolice || v.aiOwner !== 'traffic' || v.driver !== 'ai' || v.destroyed) continue;
      const dx = v.position.x - plx, dz = v.position.z - plz;
      if (dx * dx + dz * dz > 260 * 260) continue;
      v.aiOwner = 'police'; v.setSiren?.(true);
      units.push(makeUnit(v, v.type === 'policeMoto' ? 'moto' : 'car', 'chase'));
    }
  }

  // ------------------------------------------------------------------ navigation helpers
  let _rx = 0, _rz = 0;
  function nextNode(u, fromNode, goalNode, hx, hz) {
    // greedy Manhattan step toward goal on the grid graph; never U-turns unless forced
    let best = null, bs = -1e9;
    const g = net.nodes[goalNode];
    for (let k = 0; k < fromNode.neighbors.length; k++) {
      const id = fromNode.neighbors[k];
      if (id === u.pn && fromNode.neighbors.length > 1) continue;
      const n = net.nodes[id];
      const dirx = Math.sign(n.x - fromNode.x), dirz = Math.sign(n.z - fromNode.z);
      const man = Math.abs(n.i - g.i) + Math.abs(n.j - g.j);
      let score = -man * 10 + (dirx * hx + dirz * hz) * 2.5 + Math.random() * 0.3;
      if (score > bs) { bs = score; best = n; }
    }
    return best || net.nodes[fromNode.neighbors[0]];
  }

  const _list = [];
  // light obstacle avoidance for pursuers: returns speed cap, writes steer bias to _bias
  let _bias = 0, _obsLat = 0, _obsGap = 1e9;
  function avoid(u, dirx, dirz, idx, ignorePlayerCar) {
    _bias = 0; _obsLat = 0; _obsGap = 1e9;
    const v = u.v, p = v.position;
    const L = 10 + Math.abs(v.speed) * 0.5;
    const myL = halfLen(v), myW = halfWid(v);
    const list = idx.query(p.x + dirx * L * 0.5, p.z + dirz * L * 0.5, L * 0.5 + 6, _list);
    let cap = 1e9;
    const lx = -dirz, lz = dirx;
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (o === v || o.destroyed) continue;
      if (ignorePlayerCar && o.driver === 'player') continue;
      const rx = o.position.x - p.x, rz = o.position.z - p.z;
      const ahead = rx * dirx + rz * dirz;
      const ext = extentAlong(o, dirx, dirz);
      if (ahead < 0.5 || ahead - ext > L + myL) continue;
      const lat = rx * lx + rz * lz;
      if (Math.abs(lat) > myW + extentAlong(o, lx, lz) + 0.3) continue;
      const gap = ahead - myL - ext;
      const lv = Math.max(0, o.velocity ? o.velocity.x * dirx + o.velocity.z * dirz : o.speed || 0);
      cap = Math.min(cap, Math.sqrt(lv * lv + 2 * 6 * Math.max(0, gap - 1.2)) + 1.5);
      if (gap < _obsGap) { _obsGap = gap; _obsLat = lat; }
      _bias += (lat > 0 ? -1 : 1) * clamp((L - ahead) / L, 0.2, 1) * 0.7;
    }
    return cap;
  }

  function relocate(u, world) {
    if (!pickLaneSpawn(net, world, { minD: 120, maxD: 205, hidden: true, kind: 'car', clear: 9 }, _sp)) return false;
    const v = u.v;
    v.position.set(_sp.x, v.position.y, _sp.z); v.heading = _sp.heading; if (v.mesh) v.mesh.rotation.y = v.heading;
    v.speed = 0; v.velocity?.set(0, 0, 0);
    u.tn = -1; u.pn = -1; u.stuckT = 0; u.prevHeading = v.heading;
    return true;
  }

  function pickPathTarget(u, world, gx, gz) {
    const v = u.v, p = v.position;
    const hx = -Math.sin(v.heading), hz = -Math.cos(v.heading);
    const goal = net.nearestNode(gx, gz).id;
    const cn = net.nearestNode(p.x, p.z);
    if (u.tn < 0) {
      // first pick: choose among neighbours roughly ahead of us
      let best = null, bs = -1e9;
      const g = net.nodes[goal];
      for (const id of cn.neighbors) {
        const n = net.nodes[id];
        const dirx = Math.sign(n.x - cn.x), dirz = Math.sign(n.z - cn.z);
        const ahead = (n.x - p.x) * hx + (n.z - p.z) * hz;
        if (ahead < 4) continue;
        const man = Math.abs(n.i - g.i) + Math.abs(n.j - g.j);
        const s = -man * 10 + (dirx * hx + dirz * hz) * 2 + Math.random() * 0.3;
        if (s > bs) { bs = s; best = n; }
      }
      if (!best) best = nextNode(u, cn, goal, hx, hz);
      u.tn = best.id; u.pn = cn.id;
      const dirx = Math.sign(best.x - cn.x), dirz = Math.sign(best.z - cn.z);
      u.nn = nextNode(u, best, goal, dirx, dirz).id;
    } else {
      const tn = net.nodes[u.tn];
      if (Math.hypot(tn.x - p.x, tn.z - p.z) < 15) {
        const dirx = Math.sign(tn.x - net.nodes[u.pn].x), dirz = Math.sign(tn.z - net.nodes[u.pn].z);
        u.pn = u.tn; u.tn = u.nn;
        const n2 = net.nodes[u.tn];
        const d2x = Math.sign(n2.x - tn.x), d2z = Math.sign(n2.z - tn.z);
        u.nn = nextNode(u, n2, goal, d2x, d2z).id;
      }
    }
  }

  // ------------------------------------------------------------------ unit behaviors
  function updateUnit(u, dt, world, idx) {
    const v = u.v, p = v.position;
    const dx = plx - p.x, dz = plz - p.z, dist = Math.hypot(dx, dz);
    u.losT -= dt;
    if (u.losT <= 0) { u.losT = 0.25; u.los = dist < 140 && lineClear(world.colliderGrid, p.x, p.z, plx, plz); }
    // reverse maneuver when wedged
    if (u.revT > 0) {
      u.revT -= dt;
      u.ctl.throttle = -1; u.ctl.steer = u.revSteer; u.ctl.handbrake = false; v.setControls(u.ctl);
      if (u.revT <= 0) u.tn = -1;
      return;
    }
    switch (u.mode) {
      case 'block': {
        v.setControls(HOLD);
        return;
      }
      case 'retire': return retire(u, dt, world, idx, dist);
      case 'pull': return pullUnit(u, dt, world, idx, dist);
      default: break;
    }
    // ---------------- chase
    const maxS = u.maxS;
    let tx, tz, spd;
    const known = unseenT < 6 || u.los;
    if (u.los && dist < 90) {
      const T = clamp(dist / Math.max(10, Math.abs(v.speed) + 6), 0, 1.0);
      tx = plx + pvx * T; tz = plz + pvz * T;
      if (dist < 38 && psp > 2) { // flank: aim a little to our side of the target (surround / box-in)
        const dl = Math.hypot(pvx, pvz) || 1;
        const off = u.flank * Math.min(3.2, dist * 0.12);
        tx += (-pvz / dl) * off; tz += (pvx / dl) * off;
      }
      const ex = tx - p.x, ez = tz - p.z, ed = Math.hypot(ex, ez) || 1;
      spd = clamp(psp + 4 + dist * 0.25, 7, maxS);
      if (dist < 10 && psp < 2.5) spd = clamp((dist - 4) * 1.2, 0, 12); // arrive near a stopped player
      else if (dist < 14) spd = maxS; // ram!
      const want = spd;
      const cap = avoid(u, ex / ed, ez / ed, idx, true);
      shiftLane(u, dt, false);
      if (cap < spd) spd = cap;
      driveToward(v, u, tx, tz, spd, dt, u.gain, _bias);
      watchStuck(u, dt, world, want, dist);
      return;
    }
    // graph pursuit / search
    let gx = known ? plx : lastX, gz = known ? plz : lastZ;
    if (!known) {
      const gnode = net.nearestNode(gx, gz);
      if (Math.hypot(p.x - gx, p.z - gz) < 30) {
        // reached the last known spot: spread out around it
        if (u.goal < 0 || Math.random() < dt * 0.15) {
          const ni = clamp(gnode.i + Math.round(rand(-2, 2)), 0, 12), nj = clamp(gnode.j + Math.round(rand(-2, 2)), 0, ROWS);
          u.goal = net.nodeAt(ni, nj).id;
        }
        const gg = net.nodes[u.goal]; gx = gg.x; gz = gg.z;
      }
    }
    pickPathTarget(u, world, gx, gz);
    const tn = net.nodes[u.tn];
    const pn = net.nodes[u.pn];
    const fdx = Math.sign(tn.x - pn.x), fdz = Math.sign(tn.z - pn.z);
    // keep to the right-hand lane, but swing around slow traffic ahead
    tx = tn.x + -fdz * u.lat; tz = tn.z + fdx * u.lat;
    const dN = Math.hypot(tn.x - p.x, tn.z - p.z);
    spd = maxS * 0.82;
    if (u.nn >= 0) {
      const nn = net.nodes[u.nn];
      const ndx = Math.sign(nn.x - tn.x), ndz = Math.sign(nn.z - tn.z);
      if (ndx !== fdx || ndz !== fdz) spd = Math.min(spd, Math.sqrt(8 * 8 + 2 * 6 * Math.max(0, dN - 10)));
    }
    const ex = tx - p.x, ez = tz - p.z, ed = Math.hypot(ex, ez) || 1;
    const want = spd;
    const cap = avoid(u, ex / ed, ez / ed, idx, false);
    shiftLane(u, dt, cap < spd * 0.8 && _obsGap < 24);
    if (cap < spd) spd = u.shiftT > 1.0 ? Math.max(cap, 5) : cap; // still blocked after swinging out: nudge through
    driveToward(v, u, tx, tz, spd, dt, u.gain, _bias * 0.4);
    watchStuck(u, dt, world, want, dist);
  }

  function shiftLane(u, dt, blocked) {
    if (blocked) { u.shiftT += dt; const side = _obsLat > 0 ? -3.2 : 3.2; u.lat += clamp(side - u.lat, -5 * dt, 5 * dt); }
    else { u.shiftT = Math.max(0, u.shiftT - dt); u.lat += clamp(2.6 - u.lat, -4 * dt, 4 * dt); }
  }

  function watchStuck(u, dt, world, spd, dist) {
    const v = u.v;
    if (Math.abs(v.speed) < 1.2 && spd > 4 && dist > 7) u.stuckT += dt; else u.stuckT = Math.max(0, u.stuckT - dt * 2);
    if (u.stuckT > 1.5) { u.stuckT = 0; u.revT = 0.9 + Math.random() * 0.4; u.revSteer = Math.random() < 0.5 ? -1 : 1; }
    // far away and out of view: teleport back into the fight
    if (dist > 300 && u.mode !== 'retire' && !inView(world, v.position.x, v.position.z, 8)) relocate(u, world);
  }

  function retire(u, dt, world, idx, dist) {
    const v = u.v;
    u.sirenT -= dt;
    if (u.sirenT <= 0 && v.sirenOn) v.setSiren?.(false);
    // leave: head away from the player
    const cn = net.nearestNode(v.position.x, v.position.z);
    if (u.tn < 0 || Math.hypot(net.nodes[u.tn].x - v.position.x, net.nodes[u.tn].z - v.position.z) < 15) {
      const hx = -Math.sin(v.heading), hz = -Math.cos(v.heading);
      let best = null, bs = -1e9;
      for (const id of cn.neighbors) {
        const n = net.nodes[id];
        const ahead = (n.x - v.position.x) * hx + (n.z - v.position.z) * hz;
        if (ahead < 3) continue;
        const s = Math.hypot(n.x - plx, n.z - plz) + Math.random() * 30;
        if (s > bs) { bs = s; best = n; }
      }
      if (!best) best = net.nodes[cn.neighbors[(Math.random() * cn.neighbors.length) | 0]];
      u.tn = best.id;
    }
    const tn = net.nodes[u.tn];
    const ex = tn.x - v.position.x, ez = tn.z - v.position.z, ed = Math.hypot(ex, ez) || 1;
    let spd = 13;
    const cap = avoid(u, ex / ed, ez / ed, idx, false);
    if (cap < spd) spd = cap;
    driveToward(v, u, tn.x, tn.z, spd, dt, u.gain, _bias);
    watchStuck(u, dt, world, 13, Math.max(dist, 8));
    if (dist > 170 && !inView(world, v.position.x, v.position.z, 8)) u.dead = true;
    else if (dist > 300) u.dead = true;
    u.retireT = (u.retireT || 0) + dt;
    if (u.retireT > 40 && !inView(world, v.position.x, v.position.z, 8)) u.dead = true;
  }

  // ---- pico y placa pull-over: follow just behind the player, then wait for them to stop
  function pullUnit(u, dt, world, idx, dist) {
    const v = u.v;
    if (!pico.announced && dist < 45 && u.los) {
      pico.announced = true; pico.t = 0;
      events.emit('notify', { text: '👮 ¡Oríllese, sumercé! Tiene pico y placa', kind: 'bad' });
    }
    // target: a point 7 m behind the player
    const dl = Math.hypot(pvx, pvz);
    let bx, bz;
    if (dl > 2) { bx = plx - (pvx / dl) * 7; bz = plz - (pvz / dl) * 7; }
    else { const h = world.player?.vehicle?.heading ?? 0; bx = plx + Math.sin(h) * 7; bz = plz + Math.cos(h) * 7; }
    let spd;
    if (u.los && dist < 80) {
      const bd = Math.hypot(bx - v.position.x, bz - v.position.z);
      spd = clamp(psp + (bd - 2) * 0.6, 0, u.maxS * 0.9);
      if (dist < 6.5 && psp < 1.5) spd = 0;
      const ex = bx - v.position.x, ez = bz - v.position.z, ed = Math.hypot(ex, ez) || 1;
      const cap = avoid(u, ex / ed, ez / ed, idx, true);
      if (cap < spd) spd = cap;
      driveToward(v, u, bx, bz, spd, dt, u.gain, _bias);
    } else {
      pickPathTarget(u, world, plx, plz);
      const tn = net.nodes[u.tn], pn = net.nodes[u.pn];
      const fdx = Math.sign(tn.x - pn.x), fdz = Math.sign(tn.z - pn.z);
      const tx = tn.x + -fdz * 2.6, tz = tn.z + fdx * 2.6;
      spd = u.maxS * 0.9;
      const ex = tx - v.position.x, ez = tz - v.position.z, ed = Math.hypot(ex, ez) || 1;
      const cap = avoid(u, ex / ed, ez / ed, idx, false); if (cap < spd) spd = cap;
      driveToward(v, u, tx, tz, spd, dt, u.gain, _bias);
    }
    watchStuck(u, dt, world, spd, dist);
  }

  // ------------------------------------------------------------------ roadblock
  function placeRoadblock(world) {
    if (psp < 7) return false;
    const dl = Math.hypot(pvx, pvz) || 1;
    const dirx = pvx / dl, dirz = pvz / dl;
    const alongZ = Math.abs(dirz) > Math.abs(dirx);
    const roads = net.roads;
    let road = null, bd = 1e9;
    for (const r of roads) {
      if ((alongZ && r.axis !== 'x') || (!alongZ && r.axis !== 'z')) continue;
      const d = Math.abs(r.coord - (alongZ ? plx : plz));
      if (d < bd) { bd = d; road = r; }
    }
    if (!road || bd > 12) return false; // player isn't on a street
    const ahead = 140 + Math.min(60, psp * 2);
    let bx, bz, heading;
    if (alongZ) {
      const z = plz + Math.sign(dirz) * ahead;
      const j = clamp(Math.round((z - MIN_Z - BLOCK / 2) / BLOCK), 0, ROWS - 1);
      bz = calleZ(j) + BLOCK / 2; bx = road.coord; heading = Math.PI / 2;
    } else {
      const x = plx + Math.sign(dirx) * ahead;
      const i = clamp(Math.round((x - (net.nodes[0].x) - BLOCK / 2) / BLOCK), 0, 11);
      bx = net.nodes[0].x + i * BLOCK + BLOCK / 2; bz = road.coord; heading = 0;
    }
    if (Math.hypot(bx - plx, bz - plz) < 100 || inView(world, bx, bz, 10)) return false;
    const off = Math.min(2.9, road.width / 4);
    const spots = alongZ
      ? [{ x: bx - off, z: bz, heading }, { x: bx + off, z: bz, heading: heading + Math.PI }]
      : [{ x: bx, z: bz - off, heading: 0 }, { x: bx, z: bz + off, heading: Math.PI }];
    const made = [];
    for (const s of spots) { const u = spawnUnit(world, 'car', 'block', s); if (u) { u.v.speed = 0; made.push(u); } }
    if (!made.length) return false;
    rb = { units: made, x: bx, z: bz, t: 0, alongZ, dirx, dirz };
    events.emit('notify', { text: '🚧 ¡Retén de la Policía adelante!', kind: 'bad' });
    return true;
  }

  // ------------------------------------------------------------------ pico y placa
  function restricted(day, digit) {
    const odd = day % 2 === 1;
    const allowed = odd ? (digit >= 1 && digit <= 5) : (digit === 0 || digit >= 6);
    return !allowed;
  }

  // ------------------------------------------------------------------ main update
  function update(dt, world) {
    time += dt;
    wantedWorld = world;
    const pl = world.player;
    if (!pl || !pl.position) return;
    const pv = pl.vehicle;
    plx = pl.position.x; plz = pl.position.z;
    if (pv && pv.velocity) { pvx = pv.velocity.x; pvz = pv.velocity.z; psp = Math.abs(pv.speed || 0); }
    else if (havePrev && dt > 0) {
      const nx = (plx - prevX) / dt, nz = (plz - prevZ) / dt;
      pvx += (nx - pvx) * Math.min(1, dt * 8); pvz += (nz - pvz) * Math.min(1, dt * 8); psp = Math.hypot(pvx, pvz);
    }
    prevX = plx; prevZ = plz; havePrev = true;
    const idx = ensureIndex(world);
    bustedCd -= dt; spawnCd -= dt; adoptCd -= dt; rbCd -= dt; pico.cd -= dt;

    // ---- units
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i], v = u.v;
      if (u.dead || v.destroyedAndRemoved) { removeVehicle(world, v); units.splice(i, 1); continue; }
      if (v.destroyed) { u.wreckT += dt; if (u.wreckT > 9) { removeVehicle(world, v); units.splice(i, 1); } continue; }
      if (v.driver === 'player') { units.splice(i, 1); continue; } // carjacked a patrol car
      if (v.aiOwner !== 'police') { units.splice(i, 1); continue; }
      try { updateUnit(u, dt, world, idx); } catch (err) { console.error('[police] unit error', err); u.tn = -1; }
    }
    if (pico.unit && units.indexOf(pico.unit) < 0) { pico.unit = null; if (pico.active && level === 0) { pico.active = false; } }

    // ---- wanted bookkeeping
    if (level > 0) {
      // adopt ambient patrols and spawn more
      if (adoptCd <= 0) { adoptCd = 1; adopt(world); }
      const target = level * 2;
      let active = 0;
      for (let i = 0; i < units.length; i++) if (units[i].mode !== 'retire') active++;
      if (active < target && spawnCd <= 0 && bustedCd <= 0) {
        spawnCd = 0.8;
        const motos = units.filter((u) => u.kind === 'moto').length;
        const wantMoto = level >= 2 && motos < Math.floor(target / 3);
        spawnUnit(world, wantMoto ? 'moto' : 'car', 'chase');
      }
      // excess units (level dropped) retire — not applicable except when clearing
      // line of sight -> solid stars; broken -> searching, then cooldown
      let seen = false;
      for (let i = 0; i < units.length; i++) { const u = units[i]; if ((u.mode === 'chase' || u.mode === 'pull') && u.los) { const d = Math.hypot(u.v.position.x - plx, u.v.position.z - plz); if (d < 110) { seen = true; break; } } }
      if (!seen) for (let i = 0; i < world.peds.length; i++) { const q = world.peds[i]; if (q.kind === 'policia' && q.st === 'chase') { if (lineClear(world.colliderGrid, q.position.x, q.position.z, plx, plz)) { seen = true; break; } } }
      if (seen) { unseenT = 0; lastX = plx; lastZ = plz; state.wantedSearching = false; }
      else {
        unseenT += dt; state.wantedSearching = true;
        if (unseenT >= COOL_SECONDS) clearWanted('🕶️ ¡Los despistó! Respire, parce: la policía perdió el rastro', 'good');
      }
      // roadblock at 4+ stars
      if (level >= 4) {
        if (!rb && rbCd <= 0) { if (placeRoadblock(world)) rbCd = 30; else rbCd = 3; }
      }
      if (rb) {
        rb.t += dt;
        const passed = (rb.alongZ ? (plz - rb.z) * Math.sign(rb.dirz) : (plx - rb.x) * Math.sign(rb.dirx)) > 35;
        const far = Math.hypot(plx - rb.x, plz - rb.z) > 260;
        if (passed || far || rb.t > 40 || level < 4) { for (const u of rb.units) if (u.mode === 'block') u.mode = 'chase'; rb = null; }
      }
      // busted: stopped next to the law for 2 s
      let near = false;
      if (psp < 1.3 && bustedCd <= 0) {
        for (let i = 0; i < units.length; i++) { const u = units[i]; if (u.mode === 'retire' || u.v.destroyed) continue; if (Math.hypot(u.v.position.x - plx, u.v.position.z - plz) < 6) { near = true; break; } }
        if (!near) for (let i = 0; i < world.peds.length; i++) { const q = world.peds[i]; if (q.kind === 'policia' && q.st === 'chase' && Math.hypot(q.position.x - plx, q.position.z - plz) < 2.8) { near = true; break; } }
      }
      if (near) {
        bustT += dt;
        if (!bustNotified) { bustNotified = true; events.emit('notify', { text: '👮 ¡Quieto ahí! Manos donde las vea, sumercé', kind: 'bad' }); }
        if (bustT >= 2) busted(world);
      } else { bustT = Math.max(0, bustT - dt * 1.5); if (bustT === 0) bustNotified = false; }
    } else {
      state.wantedSearching = false;
      if (heat > 0) heat = Math.max(0, heat - dt * 0.05);
      // retirees keep leaving; make sure no pursuers linger
      // speeding: patrol within sight of a very fast player
      if (pv && psp > 28 && bustedCd <= 0) {
        losCd -= dt;
        if (losCd <= 0) {
          losCd = 0.5;
          for (let i = 0; i < world.vehicles.length; i++) {
            const c = world.vehicles[i];
            if (!c.isPolice || c === pv) continue;
            const d = Math.hypot(c.position.x - plx, c.position.z - plz);
            if (d < 70 && lineClear(world.colliderGrid, c.position.x, c.position.z, plx, plz)) { addHeat('speeding', plx, plz); break; }
          }
        }
      }
    }

    // ---- pico y placa gag
    if (pv && level === 0 && bustedCd <= 0) {
      const hr = state.hour;
      const digit = pv.plateDigit ?? state.plateDigit;
      const bad = hr >= 6 && hr < 21 && restricted(state.day, digit);
      if (bad && psp > 3 && !pico.active && pico.cd <= 0) {
        pico.drive += dt;
        if (pico.drive > pico.need) {
          const u = spawnUnit(world, 'car', 'pull');
          if (u) { pico.active = true; pico.unit = u; pico.announced = false; pico.t = 0; pico.stopT = 0; pico.wait = 0; pico.drive = 0; }
        }
      }
    } else if (!pico.active) pico.drive = Math.max(0, pico.drive - dt);
    if (pico.active) {
      const u = pico.unit;
      if (!u || level > 0 || !pv) { endPico(u, false); }
      else if (!pico.announced) { pico.wait += dt; if (pico.wait > 40) endPico(u, false); }
      else {
        pico.t += dt;
        const d = Math.hypot(u.v.position.x - plx, u.v.position.z - plz);
        if (psp < 1.6 && d < 12) pico.stopT += dt; else pico.stopT = Math.max(0, pico.stopT - dt);
        if (pico.stopT > 1.6) {
          const fine = 35000;
          addMoney(-fine, 'Comparendo pico y placa');
          events.emit('notify', { text: '📝 Comparendo por pico y placa: −$ 35.000. "¡No se repita, sumercé!"', kind: 'bad' });
          endPico(u, true);
        } else if (pico.t > 10) {
          events.emit('notify', { text: '🚨 ¡Tiene pico y placa, sumercé! ¡Y se me escapa!', kind: 'bad' });
          const pu = u;
          pico.active = false; pico.unit = null; pico.cd = 90; pico.need = rand(25, 45);
          if (pu) pu.mode = 'chase';
          events.emit('crime', { type: 'pico_placa', x: plx, z: plz });
        }
      }
    }
  }

  function endPico(u, fined) {
    pico.active = false; pico.unit = null; pico.drive = 0; pico.cd = fined ? 150 : 40; pico.need = rand(25, 45);
    if (u && u.mode === 'pull') toRetire(u);
  }

  function busted(world) {
    const loss = Math.round(state.money * 0.2);
    bustedCd = 6;
    clearWanted(null);
    addMoney(-loss, 'Multa — capturado');
    events.emit('notify', { text: `🚔 ¡LO CAPTURARON! Multa del 20%: −$ ${loss.toLocaleString('es-CO')}`, kind: 'bad' });
    events.emit('player:busted', { fine: loss });
  }

  return { update, units, get level() { return level; }, get heat() { return heat; }, addHeat };
}
