// Shot library for the trailer. Every shot is defined in SECONDS (ctx.t) so any --fps works.
//   seconds, hour, rain, hud, warmup (s), description, beat (seconds of the money moment), post { dof, bloom }
//   setup(ctx) before warm-up, start(ctx) when recording begins (f = 0), update(ctx) before every simulate, camera(ctx, cs) -> cs.{pos,look,fov,roll}
// Map facts (config.js): carreraX(i) = -384 + 64 i (Caracas i=6 -> x=0, Séptima i=10 -> x=256, Carrera 5 i=11 -> x=320), calleZ(j) = -576 + 64 j.
import * as THREE from 'three';
import { carreraX, calleZ, LANDMARKS } from '../config.js';
import {
  clamp, lerp, ease, smooth, V, spline, handheld, gradeEnv, parkPlayerAt, putPlayerInVehicle, spawnVehicle, Pilot, setAxes, press,
  removeVehiclesInBox, removeVehiclesNear, headingOf, fwd, right, feed,
} from './kit.js';

const LM = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
const _v = new THREE.Vector3();
const shakeOut = { x: 0, y: 0, z: 0, r: 0 };

// camera helper: position/look splines evaluated with an eased parameter
function rig(posPts, lookPts, { easing = ease.inOut, shake = 0 } = {}) {
  const P = spline(posPts), L = spline(lookPts);
  return (ctx, cs, u = ctx.p) => {
    const k = easing(clamp(u, 0, 1));
    P.at(k, cs.pos); L.at(k, cs.look);
    if (shake) { const h = handheld(ctx.t, shake, shakeOut); cs.pos.x += h.x * 0.15; cs.pos.y += h.y * 0.15; cs.look.x += h.x * 0.4; cs.look.y += h.y * 0.4; cs.roll = h.r; }
    else cs.roll = 0;
  };
}

export const SHOTS = {
  // ------------------------------------------------------------------------------------------------ city beauty shots
  'monserrate-dolly': {
    seconds: 4.5, hour: 17.8, rain: false, hud: false, warmup: 1.6,
    description: 'Golden-hour rising dolly from over La Candelaria rooftops toward the Monserrate sanctuary on the Cerros (DoF, no HUD).',
    post: { dof: { focus: 400, range: 110, strength: 0.7, maxBlur: 10 }, bloom: { strength: 0.18, radius: 0.5, threshold: 0.95 } },
    setup(ctx) {
      gradeEnv({ overcast: 0.1 });
      parkPlayerAt(ctx.world, 262, 519.5);
      ctx.data.cam = rig([[70, 42, 507], [115, 58, 503], [160, 74, 499]], [[430, 92, 462], [438, 99, 457], [446, 106, 452]], { easing: ease.inOut, shake: 0.35 });
    },
    camera(ctx, cs) {
      ctx.data.cam(ctx, cs); cs.fov = lerp(52, 44, ease.inOut(ctx.p));
      ctx.post.dof.focus = lerp(420, 380, ctx.p);
    },
  },

  'colpatria-night-orbit': {
    seconds: 4.5, hour: 21, rain: true, hud: false, warmup: 1.6,
    description: '70-degree orbit around Torre Colpatranca, LED facade cycling, light drizzle, night (no HUD).',
    post: { bloom: { strength: 0.5, radius: 0.7, threshold: 0.78 } },
    setup(ctx) {
      gradeEnv({ rain: 0.2 });
      parkPlayerAt(ctx.world, 250, 330);
    },
    camera(ctx, cs) {
      const c = LM.colpatria, k = ease.inOutSine(ctx.p);
      const ang = lerp(150, 220, k) * Math.PI / 180;                 // NW -> SW around the west face, cerros behind the tower
      const R = lerp(112, 104, k), y = lerp(70, 94, k);
      cs.pos.set(c.x + Math.cos(ang) * R, y, c.z - Math.sin(ang) * R);
      cs.look.set(c.x, 122 + k * 6, c.z);
      cs.fov = 56; cs.roll = 0;
    },
  },

  'candelaria-crane': {
    seconds: 4.5, hour: 17.2, rain: true, hud: false, warmup: 1.6,
    description: 'Crane down from 26 m to street level over the colonial roofs of La Candelaria, looking at Plaza de Bolivar, rain at dusk (no HUD).',
    post: { bloom: { strength: 0.2, radius: 0.5, threshold: 0.9 } },
    setup(ctx) {
      gradeEnv({ rain: 0.8, overcast: 0.45 });
      parkPlayerAt(ctx.world, 300, 519.5);
      ctx.data.cam = rig([[345, 27, 530], [330, 14, 523], [318, 3.2, 517]], [[236, 12, 478], [236, 10, 480], [238, 14, 482]], { easing: ease.inOut, shake: 0.3 });
    },
    camera(ctx, cs) { ctx.data.cam(ctx, cs); cs.fov = lerp(54, 48, ctx.p); },
  },
};
