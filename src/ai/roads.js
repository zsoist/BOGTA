// Road-graph helpers shared by traffic + police: lane offsets, edge geometry, out-of-view lane spawns.
import { BLOCK, COLS, ROWS, MIN_X, MIN_Z, LANE_OFFSET } from '../config.js';
import { inView, ensureIndex, rand } from './common.js';

export const CARACAS_I = 6;
// Lateral lane offsets (m to the RIGHT of travel). Normal streets: LANE_OFFSET. Avenues: two lanes per direction.
// Caracas: red busway |x|<4 (station platform collider reaches 2.25), bus lane at 3.7, mixed lanes outside the busway.
export const BUS_LANE = 3.7;
export const CARACAS_LANES = [6.2, 8.3];
export const AVENUE_LANES = [2.8, 7.2];

export function roadOfCarrera(net, i) { return net.roads[i]; }
export function roadOfCalle(net, j) { return net.roads[COLS + 1 + j]; }
// Road that the edge a->b runs along.
export function edgeRoad(net, a, b) { return a.i === b.i ? net.roads[a.i] : net.roads[COLS + 1 + a.j]; }

// pref: 'in' (inner lane, left turns) | 'out' (outer lane, right turns) | undefined (random)
export function laneFor(road, kind, pref) {
  if (!road.avenue) return LANE_OFFSET;
  const lanes = road.axis === 'x' && road.index === CARACAS_I ? CARACAS_LANES : AVENUE_LANES;
  if (road.axis === 'x' && road.index === CARACAS_I && kind === 'bus') return BUS_LANE;
  if (pref === 'out') return lanes[1];
  if (pref === 'in') return lanes[0];
  return Math.random() < 0.5 ? lanes[0] : lanes[1];
}

const _list = [];
// Choose a spawn on a lane inside an annulus around the player. Fills `out` and returns true on success.
// opts: { minD, maxD, hidden (bool), clear (m, free radius from other vehicles), kind ('car'|'bus') }
export function pickLaneSpawn(net, world, opts, out) {
  const pl = world.player ? world.player.position : { x: 0, z: 0 };
  const pn = net.nearestNode(pl.x, pl.z);
  const idx = ensureIndex(world);
  const span = Math.ceil(opts.maxD / BLOCK) + 1;
  for (let attempt = 0; attempt < 14; attempt++) {
    let i, j;
    if (opts.kind === 'bus') {
      i = CARACAS_I;
      j = Math.max(0, Math.min(ROWS, pn.j + Math.round(rand(-span, span))));
    } else {
      i = Math.max(0, Math.min(COLS, pn.i + Math.round(rand(-span, span))));
      j = Math.max(0, Math.min(ROWS, pn.j + Math.round(rand(-span, span))));
    }
    const a = net.nodeAt(i, j);
    let b;
    if (opts.kind === 'bus') {
      const nj = j + (Math.random() < 0.5 ? -1 : 1);
      if (nj < 0 || nj > ROWS) continue;
      b = net.nodeAt(i, nj);
    } else {
      b = net.nodes[a.neighbors[(Math.random() * a.neighbors.length) | 0]];
    }
    const fx = Math.sign(b.x - a.x), fz = Math.sign(b.z - a.z);
    const rx = -fz, rz = fx;
    const road = edgeRoad(net, a, b);
    const off = laneFor(road, opts.kind || 'car');
    const s = rand(14, BLOCK - 22);
    const x = a.x + fx * s + rx * off, z = a.z + fz * s + rz * off;
    const dx = x - pl.x, dz = z - pl.z;
    const d = Math.hypot(dx, dz);
    if (d < opts.minD || d > opts.maxD) continue;
    if (opts.hidden && d < 210 && inView(world, x, z, 7)) continue;
    const near = idx.query(x, z, opts.clear || 9, _list);
    let ok = true;
    for (let k = 0; k < near.length; k++) {
      const q = near[k].position;
      if (Math.abs(q.x - x) < (opts.clear || 9) && Math.abs(q.z - z) < (opts.clear || 9)) { ok = false; break; }
    }
    if (!ok) continue;
    out.x = x; out.z = z; out.from = a; out.to = b; out.s = s; out.off = off;
    out.heading = Math.atan2(-fx, -fz);
    return true;
  }
  return false;
}
export { MIN_X, MIN_Z, BLOCK };
