// Ambient traffic: lane-following cars on the road graph (right-hand traffic), bezier turns, ticket-based
// intersection reservation, car-following / ped braking, honking, motos that weave between lanes,
// TransMilagro buses on the Avenida Caracas median (with station stops), ambient police patrols.
// Contract: createTraffic(scene, net, { count }) -> { update(dt, world) }.
import * as VehicleMod from '../entities/vehicle.js';
import { BLOCK, COLS, ROWS, carreraX, calleZ, LANE_OFFSET } from '../config.js';
import {
  clamp, rand, pick, wrapAngle, smoothstep, ensureIndex, driveToward, makeCtl, removeVehicle, honk, inView, extentAlong, halfLen, halfWid,
} from './common.js';
import { laneFor, edgeRoad, roadOfCarrera, roadOfCalle, pickLaneSpawn, CARACAS_I, BUS_LANE, CARACAS_LANES, AVENUE_LANES } from './roads.js';

// Station stops for TransMilagro buses (mid-block on Avenida Caracas). If the city exposes `city.tmStations`
// ([{x,z}]) those are used instead.
export const TM_STATIONS = [5, 10, 15].map((j) => ({ x: carreraX(CARACAS_I), z: calleZ(j) + 32 })); // same spots as src/world/roads.js stations

const TYPE_MIX = [
  ['taxi', 0.35], ['sedan', 0.24], ['moto', 0.15], ['buseta', 0.1], ['sitp', 0.1], ['chiva', 0.03], ['sedan', 0.03],
];
const BUS_COUNT = 6;
const FAR_RECYCLE = 262;
const _sp = { x: 0, z: 0, from: null, to: null, s: 0, off: 0, heading: 0 };
const _near = [];
const _parkCtl = { throttle: 0, steer: 0, handbrake: true };

// ---- curve scratch ----
let _bx = 0, _bz = 0;
function bez(a, t) {
  const u = 1 - t;
  _bx = u * u * a.ex + 2 * u * t * a.cx + t * t * a.xx;
  _bz = u * u * a.ez + 2 * u * t * a.cz + t * t * a.xz;
}

export function createTraffic(scene, net, { count = 40 } = {}) {
  const Vehicle = VehicleMod.Vehicle;
  const TYPES = VehicleMod.VEHICLE_TYPES || {};
  const hasType = (t) => !!TYPES[t];
  const agents = [];
  const wrecks = [];
  const parked = [];
  const nodeState = net.nodes.map(() => ({ inside: [], waiting: [] }));
  let inited = false, spawnCd = 0, patrolCd = 4, time = 0, busesToSpawn = 0, bursts = 0;
  let px = 0, pz = 0;

  // ------------------------------------------------------------------ spawning
  function chooseType() {
    let r = Math.random(), acc = 0;
    for (const [t, w] of TYPE_MIX) { acc += w; if (r <= acc) return hasType(t) ? t : 'sedan'; }
    return 'sedan';
  }

  function makeAgent(v, kind) {
    const def = v.def || TYPES[v.type] || {};
    const maxS = def.maxSpeed || 20;
    return {
      v, kind, ctl: makeCtl(), prevHeading: v.heading, yawRate: 0,
      from: null, to: null, next: null, fx: 0, fz: 0, rx: 0, rz: 0, axis: 0, dirKey: 0,
      state: 0, laneT: 3, laneCur: 3, turn: 0, offIn: 3, offOut: 3,
      ex: 0, ez: 0, cx: 0, cz: 0, xx: 0, xz: 0, curveLen: 10, t: 0, sE: 50, stopS: 40, fox: 0, foz: 0,
      aggr: kind === 'moto' ? 1.2 : kind === 'bus' ? 0.9 : v.type === 'taxi' ? rand(1.0, 1.2) : rand(0.82, 1.08),
      maxS, steerGain: kind === 'bus' ? 1.5 : kind === 'moto' ? 2.2 : v.type === 'chiva' ? 1.6 : 1.9,
      granted: false, waiting: false, ticket: 0, inNode: null, waitT: 0, grantT: 0,
      blockT: 0, honkCd: rand(1, 6), stuckT: 0, ghostT: 0, longBlockT: 0, panic: 0, hitCd: 0,
      pass: 0, passObs: null, passOff: 0, stillT: 0, passCd: 0, weave: 1, phase: rand(0, 6.28), amp: kind === 'moto' ? rand(1.4, 2.1) : 0, dwell: 0, dwellStation: -1,
      lastHealth: v.health,
    };
  }

  function addAgent(world, kind, type, sp, speedFrac) {
    let v;
    try { v = new Vehicle(scene, type, { x: sp.x, z: sp.z, heading: sp.heading }); } catch (err) { console.error('[traffic] vehicle spawn failed', err); return null; }
    v.driver = 'ai';
    v.aiOwner = 'traffic';
    world.vehicles.push(v);
    const a = makeAgent(v, kind);
    a.laneCur = sp.off;
    planEdge(a, sp.from, sp.to);
    const sp0 = a.cruiseBase * speedFrac;
    v.speed = sp0;
    v.velocity?.set(a.fx * sp0, 0, a.fz * sp0);
    agents.push(a);
    return a;
  }

  function spawnOne(world, kind, initial) {
    const type = kind === 'bus' ? 'transmilagro' : kind === 'police' ? 'police' : chooseType();
    const k = type === 'moto' ? 'moto' : kind;
    if (!hasType(type)) return null;
    if (k === 'bus') {
      const j = (Math.random() * ROWS) | 0;
      const down = Math.random() < 0.5;
      const a = net.nodeAt(CARACAS_I, j), b = net.nodeAt(CARACAS_I, j + 1);
      const from = down ? a : b, to = down ? b : a;
      const fz = Math.sign(to.z - from.z);
      const off = BUS_LANE, s = rand(10, 40);
      _sp.x = from.x + -fz * off; _sp.z = from.z + fz * s; _sp.from = from; _sp.to = to; _sp.off = off;
      _sp.heading = Math.atan2(0, -fz);
      return addAgent(world, 'bus', type, _sp, 0.6);
    }
    const ok = pickLaneSpawn(net, world, initial ? { minD: 28, maxD: 245, hidden: false, kind: 'car', clear: 9 } : { minD: 125, maxD: 235, hidden: true, kind: 'car', clear: 9 }, _sp);
    if (!ok) return null;
    return addAgent(world, k, type, _sp, 0.75);
  }

  // ------------------------------------------------------------------ path planning
  function crossHalf(to, axis) {
    // axis 0: moving along X (calle); the crossing road is the carrera at node.i. axis 1: moving along Z; crossing = calle j.
    return (axis === 0 ? roadOfCarrera(net, to.i) : roadOfCalle(net, to.j)).width / 2;
  }

  function planEdge(a, from, to) {
    a.from = from; a.to = to;
    const fx = Math.sign(to.x - from.x), fz = Math.sign(to.z - from.z);
    a.fx = fx; a.fz = fz; a.rx = -fz; a.rz = fx;
    a.axis = fx !== 0 ? 0 : 1;
    a.dirKey = fx !== 0 ? (fx > 0 ? 0 : 1) : (fz > 0 ? 2 : 3);
    // pick the next node (never a U-turn)
    let next = null;
    const nb = to.neighbors;
    if (a.kind === 'bus') {
      const sj = to.j + fz;
      next = sj >= 0 && sj <= ROWS ? net.nodeAt(to.i, sj) : null;
    } else {
      let total = 0;
      const far = Math.hypot(to.x - px, to.z - pz) > 175;
      for (let k = 0; k < nb.length; k++) {
        if (nb[k] === from.id) continue;
        const n = net.nodes[nb[k]];
        const straight = Math.sign(n.x - to.x) === fx && Math.sign(n.z - to.z) === fz;
        let w = straight ? 0.56 : 0.22;
        if (far && Math.hypot(n.x - px, n.z - pz) < Math.hypot(to.x - px, to.z - pz)) w *= 3;
        total += w;
      }
      let r = Math.random() * total;
      for (let k = 0; k < nb.length; k++) {
        if (nb[k] === from.id) continue;
        const n = net.nodes[nb[k]];
        const straight = Math.sign(n.x - to.x) === fx && Math.sign(n.z - to.z) === fz;
        let w = straight ? 0.56 : 0.22;
        if (far && Math.hypot(n.x - px, n.z - pz) < Math.hypot(to.x - px, to.z - pz)) w *= 3;
        r -= w;
        next = n;
        if (r <= 0) break;
      }
    }
    a.next = next;
    let turn = 0;
    let fox = fx, foz = fz;
    if (next) {
      fox = Math.sign(next.x - to.x); foz = Math.sign(next.z - to.z);
      if (fox !== fx || foz !== fz) turn = (fox * a.rx + foz * a.rz) > 0 ? 1 : -1;
    }
    a.turn = turn; a.fox = fox; a.foz = foz;
    // lanes
    const road = edgeRoad(net, from, to);
    const kind = a.kind === 'bus' ? 'bus' : 'car';
    let laneT;
    if (road.avenue && turn === 0 && a.kind !== 'bus') {
      const lanes = road.axis === 'x' && road.index === CARACAS_I ? CARACAS_LANES : AVENUE_LANES;
      laneT = Math.abs(a.laneCur - lanes[0]) < Math.abs(a.laneCur - lanes[1]) ? lanes[0] : lanes[1];
    } else laneT = laneFor(road, kind, turn === 1 ? 'out' : turn === -1 ? 'in' : undefined);
    a.laneT = laneT;
    const outRoad = next ? edgeRoad(net, to, next) : road;
    const offOut = next ? laneFor(outRoad, kind) : laneT;
    a.offIn = laneT; a.offOut = offOut;
    // curve through the intersection (quadratic bezier)
    const h = crossHalf(to, a.axis);
    let tE;
    if (turn === 0) {
      tE = -(h + 1.2);
      a.ex = to.x + fx * tE + a.rx * laneT; a.ez = to.z + fz * tE + a.rz * laneT;
      a.xx = to.x - fx * tE + a.rx * offOut; a.xz = to.z - fz * tE + a.rz * offOut;
      a.cx = (a.ex + a.xx) * 0.5; a.cz = (a.ez + a.xz) * 0.5;
    } else {
      const rox = -foz, roz = fox;
      const tc = (rox * fx + roz * fz) * offOut;
      const big = clamp((a.v.length - 4.5) / 6, 0, 1.4);
      const k = (turn === 1 ? 5.5 : 9) + big * 6;
      a.cx = to.x + a.rx * laneT + fx * tc; a.cz = to.z + a.rz * laneT + fz * tc;
      a.ex = a.cx - fx * k; a.ez = a.cz - fz * k;
      a.xx = a.cx + fox * k; a.xz = a.cz + foz * k;
      tE = tc - k;
    }
    const chord = Math.hypot(a.xx - a.ex, a.xz - a.ez);
    const net2 = Math.hypot(a.cx - a.ex, a.cz - a.ez) + Math.hypot(a.xx - a.cx, a.xz - a.cz);
    a.curveLen = Math.max(4, (2 * chord + net2) / 3);
    a.sE = BLOCK + tE;
    a.stopS = Math.min(BLOCK - (h + 1.5), a.sE) - (halfLen(a.v) + 0.5);
    a.state = 0; a.t = 0;
    a.granted = false; a.waiting = false; a.ticket = 0; a.waitT = 0;
    a.limit = road.avenue ? 15 : 11;
    a.cruiseBase = Math.min(a.limit * a.aggr, a.maxS * 0.75);
    if (a.kind === 'bus') a.cruiseBase = Math.min(14, a.maxS * 0.8);
  }

  function resnap(a) {
    const v = a.v, p = v.position;
    leaveNode(a);
    const n = net.nearestNode(p.x, p.z);
    const hx = -Math.sin(v.heading), hz = -Math.cos(v.heading);
    let best = null, bd = -2;
    for (const id of n.neighbors) {
      const m = net.nodes[id];
      if (a.kind === 'bus' && m.i !== CARACAS_I) continue;
      const d = (Math.sign(m.x - n.x) * hx + Math.sign(m.z - n.z) * hz);
      if (d > bd) { bd = d; best = m; }
    }
    if (!best) best = net.nodes[n.neighbors[0]];
    // if the car is already past `n` along the chosen direction use the next edge instead
    const fx = Math.sign(best.x - n.x), fz = Math.sign(best.z - n.z);
    const along = (p.x - n.x) * fx + (p.z - n.z) * fz;
    let from = n, to = best;
    if (along > 20) {
      const nn = net.nodes[best.neighbors.find((id) => {
        const q = net.nodes[id];
        return Math.sign(q.x - best.x) === fx && Math.sign(q.z - best.z) === fz;
      }) ?? best.id];
      if (nn !== best) { from = best; to = nn; }
    }
    a.laneCur = ((p.x - from.x) * -Math.sign(to.z - from.z) + (p.z - from.z) * Math.sign(to.x - from.x));
    a.laneCur = clamp(a.laneCur, 0.5, 8);
    planEdge(a, from, to);
  }

  // ------------------------------------------------------------------ intersections
  function conflict(a, b) {
    if (a.axis !== b.axis) return true;
    if (a.dirKey === b.dirKey) return false;
    return a.turn === -1 || b.turn === -1;
  }
  function leaveNode(a) {
    if (a.inNode) {
      const i = a.inNode.inside.indexOf(a);
      if (i >= 0) a.inNode.inside.splice(i, 1);
      a.inNode = null;
    }
    if (a.waiting) {
      const w = nodeState[a.to.id].waiting;
      const i = w.indexOf(a);
      if (i >= 0) w.splice(i, 1);
      a.waiting = false;
    }
    a.granted = false;
  }
  function tryGrant(a, force) {
    const ns = nodeState[a.to.id];
    if (!force) {
      for (let i = 0; i < ns.inside.length; i++) if (conflict(a, ns.inside[i])) return false;
      for (let i = 0; i < ns.waiting.length; i++) {
        const w = ns.waiting[i];
        if (w !== a && w.ticket < a.ticket && conflict(a, w)) return false;
      }
    }
    if (a.waiting) { const i = ns.waiting.indexOf(a); if (i >= 0) ns.waiting.splice(i, 1); a.waiting = false; }
    ns.inside.push(a);
    a.inNode = ns; a.granted = true; a.grantT = 0;
    return true;
  }

  // ------------------------------------------------------------------ sensing
  let _gap = 1e9, _lv = 0, _obs = null;
  function sense(a, world, dx, dz, L, idx) {
    _gap = 1e9; _lv = 0; _obs = null;
    const v = a.v, p = v.position;
    const n = Math.hypot(dx, dz) || 1;
    dx /= n; dz /= n;
    const lx = -dz, lz = dx;
    const myL = halfLen(v), myW = halfWid(v) * (a.kind === 'moto' ? 0.8 : 1);
    const list = idx.query(p.x + dx * L * 0.5, p.z + dz * L * 0.5, L * 0.5 + 6, _near);
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (o === v) continue;
      const q = o.position;
      const rx = q.x - p.x, rz = q.z - p.z;
      const ahead = rx * dx + rz * dz;
      const ext = extentAlong(o, dx, dz);
      if (ahead < 0.2 || ahead - ext > L + myL) continue;
      const lat = Math.abs(rx * lx + rz * lz);
      if (lat > myW + extentAlong(o, lx, lz) + 0.25) continue;
      const gap = ahead - myL - ext;
      if (gap < _gap) {
        _gap = gap; _obs = o;
        const vel = o.velocity;
        _lv = Math.max(0, vel ? vel.x * dx + vel.z * dz : o.speed || 0);
      }
    }
    // pedestrians (incl. knocked down ones lying on the road) and the player on foot
    const peds = world.peds;
    for (let k = 0; k < peds.length; k++) {
      const q = peds[k].position;
      const rx = q.x - p.x, rz = q.z - p.z;
      if (rx > L + 6 || rx < -L - 6 || rz > L + 6 || rz < -L - 6) continue;
      const ahead = rx * dx + rz * dz;
      if (ahead < 0.2 || ahead - myL > L) continue;
      if (Math.abs(rx * lx + rz * lz) > myW + 0.75) continue;
      const gap = ahead - myL - 0.4;
      if (gap < _gap) { _gap = gap; _obs = peds[k]; _lv = 0; }
    }
    const pl = world.player;
    if (pl && !pl.vehicle && pl.position) {
      const rx = pl.position.x - p.x, rz = pl.position.z - p.z;
      const ahead = rx * dx + rz * dz;
      if (ahead > 0.2 && ahead - myL < L && Math.abs(rx * lx + rz * lz) < myW + 0.75) {
        const gap = ahead - myL - 0.4;
        if (gap < _gap) { _gap = gap; _obs = pl; _lv = 0; }
      }
    }
  }

  // ------------------------------------------------------------------ agent update
  function release(a) { leaveNode(a); const i = agents.indexOf(a); if (i >= 0) agents.splice(i, 1); }

  function flipBus(a) {
    const v = a.v, n = a.to;
    leaveNode(a);
    const back = net.nodeAt(n.i, n.j - a.fz);
    const fz = -a.fz;
    const off = BUS_LANE;
    v.position.set(n.x + -fz * off, v.position.y, n.z + fz * 8);
    v.heading = Math.atan2(0, -fz);
    if (v.mesh) v.mesh.rotation.y = v.heading;
    v.speed = 0; v.velocity?.set(0, 0, 0);
    a.laneCur = off; a.prevHeading = v.heading;
    planEdge(a, n, back);
  }

  function oncomingAhead(a, idx) {
    const v = a.v, p = v.position;
    const list = idx.query(p.x + a.fx * 20, p.z + a.fz * 20, 24, _near);
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (o === v) continue;
      const rx = o.position.x - p.x, rz = o.position.z - p.z;
      const al = rx * a.fx + rz * a.fz;
      if (al < -4 || al > 40) continue;
      const latAbs = (o.position.x - a.from.x) * a.rx + (o.position.z - a.from.z) * a.rz;
      if (latAbs > 0.9) continue;
      const ofx = -Math.sin(o.heading), ofz = -Math.cos(o.heading);
      if (ofx * a.fx + ofz * a.fz < -0.3) return true;
    }
    return false;
  }

  function updateAgent(a, dt, world, idx, stations) {
    const v = a.v, p = v.position;
    const speed = v.speed;
    a.honkCd -= dt; a.ghostT -= dt; a.hitCd -= dt;
    // ---- compute position along path & the pure-pursuit target
    const L = clamp(3.5 + Math.abs(speed) * 0.45, 4, 11);
    let tx, tz, s = 0;
    if (a.state === 0) {
      const dx = p.x - a.from.x, dz = p.z - a.from.z;
      s = dx * a.fx + dz * a.fz;
      const lat = dx * a.rx + dz * a.rz;
      if (Math.abs(lat - a.laneCur) > 11 || s < -30 || s > BLOCK + 30) {
        if (!(a.kind === 'bus' && s > BLOCK && !a.next)) { resnap(a); return; }
      }
      // lateral lane + weaving (motos)
      let want = a.pass === 1 ? a.passOff : a.laneT;
      if (a.amp > 0 && a.pass !== 1) {
        // weave between lanes only on open road (no vehicle within ~10 m ahead / 5 m behind / 4 m aside)
        let clear = 1;
        const near2 = idx.query(p.x, p.z, 12, _near);
        for (let k = 0; k < near2.length; k++) {
          const o = near2[k];
          if (o === v) continue;
          const rx = o.position.x - p.x, rz = o.position.z - p.z;
          const al = rx * a.fx + rz * a.fz, la = rx * a.rx + rz * a.rz;
          if (al > -5 && al < 10 && la > -4.2 && la < 4.2) { clear = 0; break; }
        }
        a.weave += (clear - a.weave) * Math.min(1, dt * 2.5);
        const fade = Math.min(smoothstep(8, 20, s), smoothstep(8, 20, a.sE - s)) * a.weave;
        want += Math.sin(time * 0.85 + a.phase) * a.amp * fade * (a.laneT < 5 ? 1 : 0.6);
      }
      a.laneCur += clamp(want - a.laneCur, -1.7 * dt, 1.7 * dt);
      if (s >= a.sE && a.next) {
        // enter the intersection curve
        if (!a.granted) tryGrant(a, true);
        a.state = 1; a.t = clamp((s - a.sE) / a.curveLen, 0, 0.3);
      } else if (!a.next && s > BLOCK + 8 && (s > BLOCK + 40 || !inView(world, p.x, p.z, 8))) {
        flipBus(a); return;
      }
    }
    if (a.state === 1) {
      bez(a, a.t);
      const dx = p.x - _bx, dz = p.z - _bz;
      const dist = Math.hypot(dx, dz);
      if (dist > 15) { resnap(a); return; }
      if (dist < 5 && speed > 0) a.t += (speed * dt) / a.curveLen;
      if (a.t >= 1) {
        const nxt = a.next;
        leaveNode(a);
        a.laneCur = a.offOut;
        planEdge(a, a.to, nxt);
        a.laneCur = clamp(a.laneCur, 0.5, 8);
        // fallthrough into edge state this frame
        const ddx = p.x - a.from.x, ddz = p.z - a.from.z;
        s = ddx * a.fx + ddz * a.fz;
      }
    }
    if (a.state === 1) {
      const tt = a.t + L / a.curveLen;
      if (tt <= 1) { bez(a, tt); tx = _bx; tz = _bz; }
      else { tx = a.xx + a.fox * (tt - 1) * a.curveLen; tz = a.xz + a.foz * (tt - 1) * a.curveLen; }
    } else {
      const ss = s + L;
      if (ss < a.sE || !a.next) {
        tx = a.from.x + a.fx * ss + a.rx * a.laneCur; tz = a.from.z + a.fz * ss + a.rz * a.laneCur;
      } else {
        const tt = (ss - a.sE) / a.curveLen;
        if (tt <= 1) { bez(a, tt); tx = _bx; tz = _bz; }
        else { tx = a.xx + a.fox * (tt - 1) * a.curveLen; tz = a.xz + a.foz * (tt - 1) * a.curveLen; }
      }
    }

    // ---- speed limits
    let vmax = a.cruiseBase;
    if (a.panic > 0) { a.panic -= dt; vmax = Math.max(vmax, 9) * 1.15; }
    const vTurn = (a.turn === 1 ? 5.6 : 4.6) * (a.v.length > 6 ? 0.85 : 1);
    if (a.state === 1) vmax = Math.min(vmax, a.turn === 0 ? vmax : vTurn);
    else if (a.turn !== 0) {
      const dE = a.sE - s;
      vmax = Math.min(vmax, Math.sqrt(vTurn * vTurn + 2 * 3.5 * Math.max(0, dE)));
    }
    // intersection reservation
    if (a.state === 0 && !a.granted && a.next !== undefined) {
      const dStop = a.stopS - s;
      if (!a.waiting && dStop < 32) {
        a.waiting = true;
        a.ticket = time + Math.max(0, dStop) / Math.max(4, Math.abs(speed)) - (a.kind === 'bus' ? 4 : 0);
        nodeState[a.to.id].waiting.push(a);
      }
      if (a.waiting) {
        a.waitT += dt;
        if (dStop < -1.5) tryGrant(a, true);
        else if (dStop < 14 + speed * 0.5) {
          if (tryGrant(a, a.waitT > 18)) { /* granted */ }
        }
      }
      if (!a.granted) vmax = Math.min(vmax, Math.sqrt(2 * 3.4 * Math.max(0, dStop)));
    } else if (a.granted) {
      a.grantT += dt;
      if (a.grantT > 14) leaveNode(a);
    }
    // bus stations
    if (a.kind === 'bus') {
      if (a.dwell > 0) { a.dwell -= dt; vmax = 0; }
      else {
        let best = -1, bd = 70;
        for (let k = 0; k < stations.length; k++) {
          const ds = (stations[k].z - p.z) * a.fz;
          if (ds > -0.5 && ds < bd && a.dwellStation !== k) { bd = ds; best = k; }
        }
        if (a.dwellStation >= 0 && Math.abs(stations[a.dwellStation].z - p.z) > 30) a.dwellStation = -1;
        if (best >= 0) {
          vmax = Math.min(vmax, Math.sqrt(2 * 2.2 * Math.max(0, bd - 1.2)) + 0.3);
          if (bd < 2.6 && Math.abs(speed) < 0.6) { a.dwell = rand(4, 7); a.dwellStation = best; }
        }
      }
    }
    // ---- car following / pedestrians / player
    if (a.ghostT <= 0) {
      const L2 = 9 + Math.abs(speed) * 1.5 + halfLen(v);
      sense(a, world, tx - p.x, tz - p.z, L2, idx);
      if (_gap < 1e8) {
        const vf = Math.sqrt(_lv * _lv + 2 * 5 * Math.max(0, _gap - 1.8));
        if (vf < vmax) vmax = vf;
        if (_gap < 3.5 && Math.abs(speed) < 0.9) { a.blockT += dt; a.longBlockT += dt; }
        else { a.blockT = Math.max(0, a.blockT - dt * 2); a.longBlockT = Math.max(0, a.longBlockT - dt); }
        const obsPlayer = _obs && (_obs.driver === 'player' || _obs === world.player);
        if (a.blockT > (obsPlayer ? 1.1 : 2.4) && a.honkCd <= 0) {
          if (honk(world, v)) a.honkCd = rand(3.5, 8);
          a.blockT = 0.4;
        }
        // near miss with the player's car at speed
        if (obsPlayer && _gap < 5 && _lv + Math.abs(speed) > 14 && a.honkCd <= 0 && Math.random() < 0.08) {
          if (honk(world, v)) a.honkCd = rand(4, 9);
        }
      } else { a.blockT = Math.max(0, a.blockT - dt * 2); a.longBlockT = Math.max(0, a.longBlockT - dt); }
      if (a.longBlockT > 45) { a.ghostT = 4; a.longBlockT = 0; if (honk(world, v)) a.honkCd = 2; }
    }
    // ---- overtake stationary obstacles (abandoned / parked cars in the lane) by borrowing the other lane
    if (a.state === 0) {
      a.passCd -= dt;
      if (a.pass === 1) {
        const o = a.passObs;
        if (!o || o.destroyedAndRemoved || world.vehicles.indexOf(o) < 0) a.pass = 0;
        else {
          const rx = o.position.x - p.x, rz = o.position.z - p.z;
          const al = rx * a.fx + rz * a.fz;
          if (al < -(extentAlong(o, a.fx, a.fz) + halfLen(v) + 1.2)) a.pass = 0;
          else if (a.passOff < 0 && al > -1 && oncomingAhead(a, idx)) { a.pass = 0; a.passCd = 5; }
          if (vmax > 8) vmax = 8;
        }
      } else if (a.passCd <= 0 && _obs && _obs.def && _obs !== v && _lv < 0.4 && _gap < 10 && Math.abs(speed) < 2.5 && a.ghostT <= 0) {
        const so = (_obs.position.x - a.from.x) * a.fx + (_obs.position.z - a.from.z) * a.fz;
        if (so > 10 && so < a.stopS - 16) {
          a.stillT += dt;
          if (a.stillT > (_obs.driver === null ? 0.8 : 4)) {
            a.stillT = 0;
            const road = edgeRoad(net, a.from, a.to);
            let ok = true;
            if (road.avenue) {
              const lanes = road.index === CARACAS_I && road.axis === 'x' ? CARACAS_LANES : AVENUE_LANES;
              a.passOff = Math.abs(a.laneCur - lanes[0]) < Math.abs(a.laneCur - lanes[1]) ? lanes[1] : lanes[0];
            } else if (oncomingAhead(a, idx)) ok = false;
            else a.passOff = -LANE_OFFSET;
            if (ok) { a.pass = 1; a.passObs = _obs; if (a.honkCd <= 0 && honk(world, v)) a.honkCd = rand(3, 6); } else a.passCd = 1.5;
          }
        }
      } else a.stillT = Math.max(0, a.stillT - dt);
    } else if (a.pass) a.pass = 0;
    // hit reaction (damage taken => honk + brief panic)
    if (v.health < a.lastHealth - 0.5 && a.hitCd <= 0) {
      a.hitCd = 2.5; a.panic = 1.6;
      if (a.honkCd < 1.5 && honk(world, v)) a.honkCd = rand(3, 6);
    }
    a.lastHealth = v.health;
    // unexplained standstill
    if (Math.abs(speed) < 0.35 && vmax > 1.5 && _gap > 8 && !(a.waiting && !a.granted)) a.stuckT += dt; else a.stuckT = Math.max(0, a.stuckT - dt);
    if (a.stuckT > 9) { a.stuckT = 0; resnap(a); a.ghostT = 2; }

    driveToward(v, a, tx, tz, vmax, dt, a.steerGain);
  }

  // ------------------------------------------------------------------ main update
  function init(world) {
    inited = true;
    const pl = world.player ? world.player.position : { x: 0, z: 0 };
    px = pl.x; pz = pl.z;
    ensureIndex(world);
    busesToSpawn = BUS_COUNT; // spread the (model-building) spawns over the first frames to avoid a start-up hitch
  }

  function carCount() { let n = 0; for (let i = 0; i < agents.length; i++) if (agents[i].kind !== 'bus') n++; return n; }
  function patrolCount() { let n = 0; for (let i = 0; i < agents.length; i++) if (agents[i].v.isPolice) n++; return n; }

  function update(dt, world) {
    if (!inited) init(world);
    time += dt;
    const pl = world.player ? world.player.position : null;
    if (pl) { px = pl.x; pz = pl.z; }
    const idx = ensureIndex(world);
    const stations = world.city?.tmStations?.length ? world.city.tmStations : TM_STATIONS;
    spawnCd -= dt; patrolCd -= dt;

    let recycleDone = false;
    for (let i = agents.length - 1; i >= 0; i--) {
      const a = agents[i], v = a.v;
      // ownership handoff: carjacked, taken over by police, destroyed, or driver gone
      if (v.destroyed || v.destroyedAndRemoved) { leaveNode(a); agents.splice(i, 1); wrecks.push({ v, t: 0 }); continue; }
      if (v.driver !== 'ai' || v.aiOwner !== 'traffic') {
        leaveNode(a); agents.splice(i, 1);
        if (v.driver === 'player' || v.driver === null) parked.push(v);
        continue;
      }
      try { updateAgent(a, dt, world, idx, stations); } catch (err) { console.error('[traffic] agent error', err); resnap(a); }
      // recycle far cars (not buses: they loop their route)
      if (a.kind !== 'bus' && !recycleDone && pl) {
        const dx = v.position.x - px, dz = v.position.z - pz;
        if (dx * dx + dz * dz > FAR_RECYCLE * FAR_RECYCLE || (a.longBlockT > 18 && !inView(world, v.position.x, v.position.z, 8))) {
          recycleDone = replaceAgent(world, a, i);
        }
      }
    }
    // start-up population: a few per frame, anywhere around the player (the title screen hides the pop-in)
    if (busesToSpawn > 0) { busesToSpawn--; spawnOne(world, 'bus', true); }
    else if (time < 5 && bursts < 400 && carCount() - patrolCount() < count - 2 && pl) {
      for (let k = 0; k < 4; k++) { bursts++; if (!spawnOne(world, 'car', true)) break; }
    }
    // keep ~count cars alive around the player
    else if (spawnCd <= 0 && carCount() - patrolCount() < count - 2 && pl) {
      spawnCd = 0.15;
      spawnOne(world, 'car', false);
    }
    // ambient police patrols (2 max) while the heat is off
    if (patrolCd <= 0) {
      patrolCd = 6;
      if (patrolCount() < 2 && world.state.wanted === 0 && pl) spawnOne(world, 'police', false);
    }
    // wrecks: leave the burnt shell around for a while, then remove it
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i]; w.t += dt;
      if (w.t > 14 && !inView(world, w.v.position.x, w.v.position.z, 6)) { removeVehicle(world, w.v); wrecks.splice(i, 1); }
      else if (w.t > 40) { removeVehicle(world, w.v); wrecks.splice(i, 1); }
    }
    // abandoned / stolen cars stay parked
    for (let i = parked.length - 1; i >= 0; i--) {
      const v = parked[i];
      if (world.vehicles.indexOf(v) < 0) { parked.splice(i, 1); continue; }
      if (v.driver === null || v.driver === undefined) {
        if (v.setControls && Math.abs(v.speed || 0) < 8) v.setControls(_parkCtl);
      }
    }
    if (parked.length > 10) {
      for (let i = 0; i < parked.length; i++) {
        const v = parked[i];
        if (v.driver === 'player') continue;
        const dx = v.position.x - px, dz = v.position.z - pz;
        if (dx * dx + dz * dz > 300 * 300 && !inView(world, v.position.x, v.position.z, 8)) { removeVehicle(world, v); parked.splice(i, 1); break; }
      }
    }
  }

  function replaceAgent(world, a, i) {
    const kind = a.v.isPolice ? 'police' : 'car';
    // find a hidden spot first; only then despawn the old car
    const ok = pickLaneSpawn(net, world, { minD: 125, maxD: 235, hidden: true, kind: 'car', clear: 9 }, _sp);
    if (!ok) return false;
    leaveNode(a);
    agents.splice(i, 1);
    removeVehicle(world, a.v);
    const type = kind === 'police' ? 'police' : chooseType();
    if (!hasType(type)) return true;
    addAgent(world, type === 'moto' ? 'moto' : kind, type, _sp, 0.75);
    return true;
  }

  return { update, agents, get stats() { return { agents: agents.length, parked: parked.length, wrecks: wrecks.length }; } };
}
