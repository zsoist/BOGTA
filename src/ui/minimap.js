// Circular GTA-style radar. Roads are pre-rendered once to an offscreen canvas; each frame we only
// blit it rotated around the player (heading-up) and draw blips. Budget: < 1 ms per frame.
import { state } from '../core/state.js';
import { LANDMARKS, MIN_X, MAX_X, MIN_Z, MAX_Z, ROAD_WIDTH } from '../config.js';
import { injectStyles, h, damp } from './util.js';

const STATIC_SCALE = 1.75;            // px per world meter in the pre-rendered layer
const BOUNDS = { x0: MIN_X - 50, x1: 650, z0: MIN_Z - 50, z1: MAX_Z + 50 }; // east margin includes Monserrate (x ≈ 560)
const PARKS = { simon_bolivar: 1, parque93: 1 };

function renderStatic(net) {
  const w = BOUNDS.x1 - BOUNDS.x0, hh = BOUNDS.z1 - BOUNDS.z0;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * STATIC_SCALE); c.height = Math.ceil(hh * STATIC_SCALE);
  const g = c.getContext('2d');
  g.scale(STATIC_SCALE, STATIC_SCALE);
  g.translate(-BOUNDS.x0, -BOUNDS.z0);

  // ground
  g.fillStyle = '#18232a';
  g.fillRect(BOUNDS.x0, BOUNDS.z0, w, hh);

  // Cerros Orientales (east): darker green slope with contour rings around Monserrate
  const mon = LANDMARKS.find((l) => l.id === 'monserrate');
  const grad = g.createLinearGradient(MAX_X, 0, BOUNDS.x1, 0);
  grad.addColorStop(0, '#1d3324'); grad.addColorStop(1, '#2b4a30');
  g.fillStyle = grad;
  g.fillRect(MAX_X + 18, BOUNDS.z0, BOUNDS.x1 - MAX_X - 18, hh);
  if (mon) {
    g.strokeStyle = 'rgba(150,200,130,0.22)'; g.lineWidth = 1.2;
    for (let r = 22; r < 190; r += 22) { g.beginPath(); g.ellipse(mon.x, mon.z, r * 0.9, r * 1.5, 0.25, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(235,240,230,0.5)'; g.beginPath(); g.arc(mon.x, mon.z, 5, 0, Math.PI * 2); g.fill();
  }

  const xs = net.roads.filter((r) => r.axis === 'x').sort((a, b) => a.coord - b.coord);
  const zs = net.roads.filter((r) => r.axis === 'z').sort((a, b) => a.coord - b.coord);

  // city blocks
  g.fillStyle = '#233039';
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i].coord + xs[i].width / 2 + 1, x1 = xs[i + 1].coord - xs[i + 1].width / 2 - 1;
      const z0 = zs[j].coord + zs[j].width / 2 + 1, z1 = zs[j + 1].coord - zs[j + 1].width / 2 - 1;
      g.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
  }

  // parks / landmarks footprints
  for (const l of LANDMARKS) {
    if (PARKS[l.id]) {
      g.fillStyle = '#2f6a3c';
      if (l.id === 'simon_bolivar') {
        g.beginPath(); g.ellipse(l.x, l.z, l.radius * 1.5, l.radius * 1.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2d6f9c'; g.beginPath(); g.ellipse(l.x + 6, l.z + 4, 22, 14, -0.4, 0, Math.PI * 2); g.fill();
      } else {
        g.fillRect(l.x - 26, l.z - 26, 52, 52);
        g.fillStyle = '#3d8a4b'; g.beginPath(); g.arc(l.x, l.z, 10, 0, Math.PI * 2); g.fill();
      }
    } else if (l.id === 'plaza_bolivar') {
      g.fillStyle = '#4a5560'; g.fillRect(l.x - 24, l.z - 24, 48, 48);
    } else if (l.id === 'campin') {
      g.fillStyle = '#2c4b36'; g.beginPath(); g.ellipse(l.x, l.z, 28, 20, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // roads: outline pass then fill pass so intersections merge cleanly
  const ext = (r) => (r.axis === 'x'
    ? [r.coord, MIN_Z - 10, r.coord, MAX_Z + 10]
    : [MIN_X - 10, r.coord, MAX_X + 10, r.coord]);
  g.lineCap = 'butt';
  const stroke = (r, color, wid) => {
    const [x0, z0, x1, z1] = ext(r);
    g.strokeStyle = color; g.lineWidth = wid;
    g.beginPath(); g.moveTo(x0, z0); g.lineTo(x1, z1); g.stroke();
  };
  for (const r of net.roads) stroke(r, '#06090c', r.width + 4);
  for (const r of net.roads) stroke(r, r.avenue ? '#aab6bf' : '#68757f', r.avenue ? r.width : Math.max(ROAD_WIDTH - 3, 8));
  // avenue center line, Caracas TransMilagro red lane
  for (const r of net.roads) {
    if (!r.avenue) continue;
    if (r.axis === 'x' && /caracas/i.test(r.name)) { stroke(r, '#06090c', 8); stroke(r, '#e63946', 5.5); }
    else stroke(r, 'rgba(60,70,78,0.7)', 1.2);
  }
  return { canvas: c, w, h: hh };
}

function makeIcon(emoji, px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,14,0.88)'; g.beginPath(); g.arc(px / 2, px / 2, px / 2 - 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = Math.max(1, px / 14); g.stroke();
  g.font = `${Math.round(px * 0.58)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, px / 2, px / 2 + px * 0.05);
  return c;
}

export function createMinimap(root, net) {
  injectStyles();
  const wrap = h('div', { class: 'mm-wrap', role: 'img', 'aria-label': 'Minimapa' });
  const canvas = h('canvas');
  wrap.append(canvas);
  const layer = h('div', { class: 'gtab-layer gtab-minimap' }, [wrap]);
  root.append(layer);
  const ctx = canvas.getContext('2d', { alpha: false });

  let stat = null;
  try { stat = renderStatic(net); } catch (err) { console.error('[minimap] static render failed', err); }

  let size = 200, dpr = 1, icons = [], policeIcon = null;
  function resize() {
    size = wrap.clientWidth || 200;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    const ipx = Math.max(16, Math.round(size * dpr * 0.1));
    icons = LANDMARKS.map((l) => ({ l, img: makeIcon(l.icon, ipx) }));
    policeIcon = null;
  }
  resize();
  addEventListener('resize', resize);

  let zoomR = 130;       // visible radius in meters (smoothed; widens with speed)
  let heading = 0;

  function update(dt, world) {
    const p = world?.player;
    if (!p || !stat) return;
    const t0 = performance.now();
    if (size !== wrap.clientWidth && wrap.clientWidth) resize();
    const ct = p.cameraTarget;
    const hd = (ct && typeof ct.heading === 'number') ? ct.heading : (p.heading || 0);
    // smooth shortest-angle follow to avoid snapping when heading wraps
    let dh = hd - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    heading += dh * (1 - Math.exp(-14 * dt));
    const speed = Math.abs(ct?.speed ?? 0);
    zoomR = damp(zoomR, 120 + Math.min(70, speed * 1.8), 1.5, dt);

    const W = canvas.width, c = W / 2, rimR = c;
    const S = c / zoomR; // px per meter
    const px = p.position.x, pz = p.position.z;
    const cosH = Math.cos(heading), sinH = Math.sin(heading);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#111a20';
    ctx.fillRect(0, 0, W, W);

    // static layer: translate to center, rotate so heading points up, scale meters→px
    ctx.setTransform(S * cosH, S * sinH, -S * sinH, S * cosH, c, c);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(stat.canvas, BOUNDS.x0 - px, BOUNDS.z0 - pz, stat.w, stat.h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // world → radar px (rotation by +heading)
    const place = (x, z, pad, out) => {
      const dx = x - px, dz = z - pz;
      let rx = (dx * cosH - dz * sinH) * S, ry = (dx * sinH + dz * cosH) * S;
      const d = Math.hypot(rx, ry), lim = rimR - pad;
      out.clamped = d > lim;
      if (out.clamped) { rx *= lim / d; ry *= lim / d; }
      out.x = c + rx; out.y = c + ry; out.ang = Math.atan2(ry, rx);
      return out;
    };
    const pt = { x: 0, y: 0, ang: 0, clamped: false };

    // landmarks
    for (const { l, img } of icons) {
      place(l.x, l.z, img.width * 0.62, pt);
      ctx.globalAlpha = pt.clamped ? 0.55 : 1;
      ctx.drawImage(img, pt.x - img.width / 2, pt.y - img.width / 2);
    }
    ctx.globalAlpha = 1;

    // police blips (flash red/blue)
    const flip = ((world.time ?? performance.now() / 1000) * 4) % 2 < 1;
    const pr = Math.max(3, size * dpr * 0.022);
    const vs = world.vehicles;
    if (vs) {
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (!v.isPolice || v.destroyed || v === p.vehicle) continue;
        place(v.position.x, v.position.z, pr * 2, pt);
        const col = flip ? '#ff2b3a' : '#2f7bff';
        ctx.fillStyle = col;
        ctx.strokeStyle = '#05070a'; ctx.lineWidth = Math.max(1.5, pr * 0.45);
        ctx.beginPath();
        if (pt.clamped) { // chevron on the rim pointing outward
          ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.ang);
          ctx.moveTo(pr * 1.2, 0); ctx.lineTo(-pr, pr); ctx.lineTo(-pr, -pr); ctx.closePath(); ctx.restore();
        } else ctx.arc(pt.x, pt.y, pr, 0, Math.PI * 2);
        ctx.stroke(); ctx.fill();
      }
    }

    // wanted ring (red/blue pulse)
    if (state.wanted > 0) {
      const tt = (world.time ?? performance.now() / 1000);
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(tt * 5));
      ctx.lineWidth = Math.max(4, rimR * 0.045);
      ctx.strokeStyle = flip ? `rgba(255,43,58,${pulse})` : `rgba(47,123,255,${pulse})`;
      ctx.beginPath(); ctx.arc(c, c, rimR - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    }

    // north marker on the rim
    {
      const nr = Math.max(9, size * dpr * 0.055);
      const nx = c + Math.sin(heading) * (rimR - nr - 3), ny = c - Math.cos(heading) * (rimR - nr - 3);
      ctx.fillStyle = '#e63946'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, nr * 0.14);
      ctx.beginPath(); ctx.arc(nx, ny, nr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(nr * 1.25)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', nx, ny + nr * 0.06);
    }

    // player arrow (always pointing up)
    {
      const a = Math.max(8, size * dpr * 0.05);
      ctx.save(); ctx.translate(c, c);
      ctx.fillStyle = '#fff6c9'; ctx.strokeStyle = '#05070a'; ctx.lineWidth = Math.max(2, a * 0.28); ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = a * 0.6;
      ctx.beginPath(); ctx.moveTo(0, -a * 1.15); ctx.lineTo(a * 0.82, a * 0.9); ctx.lineTo(0, a * 0.42); ctx.lineTo(-a * 0.82, a * 0.9); ctx.closePath();
      ctx.stroke(); ctx.fill(); ctx.restore();
    }

    // dev perf hook
    update.lastMs = performance.now() - t0;
  }

  return { update, get lastMs() { return update.lastMs || 0; } };
}
