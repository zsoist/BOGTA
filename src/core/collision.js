// AABB collider spatial hash + circle-vs-AABB resolution (XZ plane).
// Collider: { minX, maxX, minZ, maxZ, height, kind? }
const CELL = 32;

export function createColliderGrid(colliders = []) {
  const cells = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  const add = (c) => {
    for (let cx = Math.floor(c.minX / CELL); cx <= Math.floor(c.maxX / CELL); cx++)
      for (let cz = Math.floor(c.minZ / CELL); cz <= Math.floor(c.maxZ / CELL); cz++) {
        const k = key(cx, cz);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(c);
      }
  };
  colliders.forEach(add);
  const seen = new Set();
  return {
    add,
    // All colliders overlapping a circle's bounding square.
    query(x, z, r, out = []) {
      out.length = 0; seen.clear();
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
        for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
          const list = cells.get(key(cx, cz));
          if (list) for (const c of list) if (!seen.has(c)) { seen.add(c); out.push(c); }
        }
      return out;
    },
  };
}

const tmp = [];
// Pushes `pos` (THREE.Vector3 or {x,z}) out of any collider. Returns the collision normal {x,z,depth} of the deepest hit, or null.
export function resolveCircle(pos, radius, grid) {
  let hit = null;
  for (const c of grid.query(pos.x, pos.z, radius, tmp)) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    let dx = pos.x - nx, dz = pos.z - nz;
    let d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    let d = Math.sqrt(d2), depth, n;
    if (d > 1e-5) { depth = radius - d; n = { x: dx / d, z: dz / d }; }
    else { // center inside the box: push along min-penetration axis
      const pens = [[pos.x - c.minX, -1, 0], [c.maxX - pos.x, 1, 0], [pos.z - c.minZ, 0, -1], [c.maxZ - pos.z, 0, 1]];
      pens.sort((a, b) => a[0] - b[0]);
      depth = pens[0][0] + radius; n = { x: pens[0][1], z: pens[0][2] };
    }
    pos.x += n.x * depth; pos.z += n.z * depth;
    if (!hit || depth > hit.depth) hit = { x: n.x, z: n.z, depth, collider: c };
  }
  return hit;
}
