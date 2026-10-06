// GTA Bogotá dev server — static files + Claude-powered API. Zero deps beyond @anthropic-ai/sdk.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { aiEnabled, MODEL, npcReply, radioLine, offlineNpcLine, offlineRadioLine } from './claude.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN) || 30;
const MAX_BODY = 32 * 1024;
const BLOCKED_SEGMENTS = new Set(['node_modules', 'server']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- helpers ----------
const json = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
};

const hits = new Map(); // ip -> number[] timestamps
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) if (!arr.some((t) => now - t < 60_000)) hits.delete(ip);
}, 60_000).unref();

function readBody(req, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, d = null) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function cleanContext(c) {
  c = c && typeof c === 'object' ? c : {};
  return {
    district: str(c.district, 60) || undefined,
    hour: num(c.hour),
    raining: c.raining == null ? undefined : !!c.raining,
    wanted: num(c.wanted) == null ? undefined : Math.max(0, Math.min(5, Math.round(c.wanted))),
    money: num(c.money) == null ? undefined : Math.round(c.money),
    vehicle: str(c.vehicle, 40) || undefined,
    recent: Array.isArray(c.recent) ? c.recent.slice(-3).map((s) => str(s, 200)).filter(Boolean) : undefined,
  };
}

function handleError(res, err, fallbackBody) {
  if (err instanceof Anthropic.RateLimitError) {
    console.warn('[claude] rate limited by API (429)');
    return json(res, 429, { error: 'rate_limited', ...fallbackBody });
  }
  if (err instanceof Anthropic.APIError) {
    console.warn(`[claude] API error ${err.status ?? ''}: ${String(err.message).slice(0, 160)}`);
    return json(res, 502, { error: 'upstream_error', ...fallbackBody });
  }
  console.error('[server] unexpected:', err?.message || err);
  return json(res, err?.status || 500, { error: err?.message || 'internal_error', ...fallbackBody });
}

// ---------- optional ElevenLabs TTS module (written by another agent; may not exist yet) ----------
let elevenCache = null;
let elevenTriedAt = 0;
async function loadEleven() {
  if (elevenCache) return elevenCache;
  if (Date.now() - elevenTriedAt < 5000) return null;
  elevenTriedAt = Date.now();
  try {
    elevenCache = await import('./elevenlabs.mjs');
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') console.warn('[tts] elevenlabs.mjs failed to load:', err?.message);
  }
  return elevenCache;
}
const elevenOn = (m) => {
  try { return !!(m?.liveTTSEnabled ?? m?.elevenEnabled)?.(); } catch { return false; }
};

// ---------- API ----------
export async function api(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, { enabled: aiEnabled(), model: MODEL(), tts: elevenOn(await loadEleven()) });
  }
  if (req.method === 'POST' && pathname === '/api/tts') {
    const eleven = await loadEleven();
    if (!eleven?.handleTTS) return json(res, 503, { error: 'tts_unavailable' });
    if (rateLimited(req.socket.remoteAddress || 'unknown')) return json(res, 429, { error: 'rate_limited' });
    let ttsBody;
    try {
      ttsBody = await readBody(req, 2048);
    } catch (err) {
      return json(res, err.status || 400, { error: err.message });
    }
    try {
      return await eleven.handleTTS(req, res, ttsBody);
    } catch (err) {
      console.warn('[tts] handler error:', err?.message);
      if (!res.headersSent) return json(res, 502, { error: 'tts_error' });
      return res.end();
    }
  }
  if (req.method !== 'POST' || (pathname !== '/api/npc' && pathname !== '/api/radio')) {
    return json(res, 404, { error: 'not_found' });
  }
  const ip = req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) return json(res, 429, { error: 'rate_limited', reply: offlineNpcLine(), line: offlineRadioLine(), offline: true });

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, err.status || 400, { error: err.message });
  }

  if (pathname === '/api/npc') {
    const message = str(body.message, 400).trim();
    if (!message) return json(res, 400, { error: 'message required' });
    if (!aiEnabled()) return json(res, 200, { reply: offlineNpcLine(), offline: true });
    const ped = {
      name: str(body.ped?.name, 60) || undefined,
      kind: str(body.ped?.kind, 20) || 'walker',
      persona: str(body.ped?.persona, 500) || undefined,
    };
    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-12)
      .filter((h) => h && typeof h.content === 'string')
      .map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content.slice(0, 600) }));
    const t0 = Date.now();
    try {
      const reply = await npcReply({ ped, history, message, context: cleanContext(body.context) });
      console.log(`[npc] ${ped.kind}/${ped.name || '?'} ${Date.now() - t0}ms`);
      return json(res, 200, { reply });
    } catch (err) {
      return handleError(res, err, { reply: offlineNpcLine(), offline: true });
    }
  }

  // /api/radio
  if (!aiEnabled()) return json(res, 200, { line: offlineRadioLine(), offline: true });
  const station = {
    id: str(body.station?.id, 40) || undefined,
    name: str(body.station?.name, 80) || undefined,
    genre: str(body.station?.genre, 30) || undefined,
  };
  const t0 = Date.now();
  try {
    const line = await radioLine({ station, context: cleanContext(body.context) });
    console.log(`[radio] ${station.id || '?'} ${Date.now() - t0}ms`);
    return json(res, 200, { line });
  } catch (err) {
    return handleError(res, err, { line: offlineRadioLine(), offline: true });
  }
}

// ---------- static ----------
async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return json(res, 400, { error: 'bad_path' });
  }
  if (rel.includes('\0')) return json(res, 400, { error: 'bad_path' });
  if (rel.endsWith('/')) rel += 'index.html';
  const target = path.resolve(ROOT, '.' + path.posix.normalize('/' + rel));
  const inside = target === ROOT || target.startsWith(ROOT + path.sep);
  const segments = path.relative(ROOT, target).split(path.sep);
  if (!inside || segments.some((s) => s.startsWith('.') || BLOCKED_SEGMENTS.has(s))) {
    return json(res, 403, { error: 'forbidden' });
  }
  try {
    let file = target;
    let st = await stat(file);
    if (st.isDirectory()) {
      file = path.join(file, 'index.html');
      st = await stat(file);
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    json(res, 404, { error: 'not_found' });
  }
}

// Only listen when run directly (`npm start`). Vercel imports `api` from here via /api/*.js functions.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[server] fatal handler error:', err);
    if (!res.headersSent) json(res, 500, { error: 'internal_error' });
    else res.end();
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} is busy. Try: PORT=${PORT + 1} npm start\n`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  const on = aiEnabled();
  const line = '═'.repeat(50);
  console.log(`\n  ${line}`);
  console.log('   🚕  G T A   B O G O T Á');
  console.log(`   Abre:  http://localhost:${PORT}`);
  console.log(`   Claude: ${on ? `ACTIVADO ✅  (${MODEL()})` : 'sin API key — modo offline (agrega ANTHROPIC_API_KEY en .env)'}`);
  console.log(`  ${line}\n`);
});
}
