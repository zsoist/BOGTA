// Block / road geometry helpers shared by the world modules.
import { COLS, ROWS, SIDEWALK, carreraX, calleZ, ROAD_WIDTH, AVENUE_WIDTH, CARRERA_AVENUES, CALLE_AVENUES } from '../config.js';

export const wCarrera = (i) => (CARRERA_AVENUES.has(i) ? AVENUE_WIDTH : ROAD_WIDTH);
export const wCalle = (j) => (CALLE_AVENUES.has(j) ? AVENUE_WIDTH : ROAD_WIDTH);
export const CURB = 0.1; // sidewalk height above road

// Full slab (sidewalk + lot) for block (bi, bj) and the buildable lot inside it.
export function blockRect(bi, bj) {
  const sx0 = carreraX(bi) + wCarrera(bi) / 2, sx1 = carreraX(bi + 1) - wCarrera(bi + 1) / 2;
  const sz0 = calleZ(bj) + wCalle(bj) / 2, sz1 = calleZ(bj + 1) - wCalle(bj + 1) / 2;
  return {
    bi, bj, sx0, sx1, sz0, sz1,
    x0: sx0 + SIDEWALK, x1: sx1 - SIDEWALK, z0: sz0 + SIDEWALK, z1: sz1 - SIDEWALK,
    cx: (sx0 + sx1) / 2, cz: (sz0 + sz1) / 2,
  };
}
export { COLS, ROWS, SIDEWALK, carreraX, calleZ };
