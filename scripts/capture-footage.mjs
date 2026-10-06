#!/usr/bin/env node
// GTA Bogotá — deterministic trailer footage capture.
//   node scripts/capture-footage.mjs [--only name,name] [--fps 60] [--scale 1] [--out video/public/footage]
//        [--keep] [--frames N] [--seed N] [--headed] [--list] [--url http://localhost:5173] [--crf 14]
// Opens http://localhost:5173/?capture=1&shot=<name> at 1920x1080 (scaled by --scale), steps the game one fixed 1/fps step at a time
// (window.__capture.step) and reads back every frame (canvas PNG, or a page screenshot for shots that show the HUD),
// then encodes <out>/<name>.mp4 (H.264, yuv420p, bt709, CRF 14, +faststart) with ffmpeg and writes <out>/manifest.json.
// The game server must already be running (npm start). Playwright lives in scripts/capture-deps (npm i there once).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const opt = { only: null, fps: 60, scale: 1, out: path.join(root, 'video/public/footage'), keep: false, frames: 0, seed: 0, headed: false, list: false, url: 'http://localhost:5173', crf: 14, tmp: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], nx = () => argv[++i];
  if (a === '--only') opt.only = nx().split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--fps') opt.fps = Number(nx());
  else if (a === '--scale') opt.scale = Number(nx());
  else if (a === '--out') opt.out = path.resolve(nx());
  else if (a === '--keep') opt.keep = true;
  else if (a === '--frames') opt.frames = Number(nx());
  else if (a === '--seed') opt.seed = Number(nx());
  else if (a === '--headed') opt.headed = true;
  else if (a === '--list') opt.list = true;
  else if (a === '--url') opt.url = nx();
  else if (a === '--crf') opt.crf = Number(nx());
  else if (a === '--tmp') opt.tmp = path.resolve(nx());
  else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(0); }
  else { console.error(`unknown argument ${a}`); process.exit(2); }
}

// ---------------------------------------------------------------- playwright + chromium discovery
const require = createRequire(path.join(here, 'capture-deps', 'package.json'));
let chromium;
try { ({ chromium } = require('playwright')); }
catch { try { ({ chromium } = createRequire(path.join(root, 'package.json'))('playwright')); } catch { console.error('playwright not found: run `npm i` in scripts/capture-deps'); process.exit(1); } }

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const own = chromium.executablePath();
  if (own && fs.existsSync(own)) return own;
  // Playwright's own browser revision may not be installed: fall back to any Chrome-for-Testing in the cache, then system Chrome.
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      const p = path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (fs.existsSync(p)) return p;
    }
  }
  const sys = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return fs.existsSync(sys) ? sys : undefined;
}

const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required', '--mute-audio'];

async function launch() {
  const executablePath = findChrome();
  // headless 'new' mode (full Chrome rendering stack) unless --headed
  return chromium.launch({ executablePath, headless: !opt.headed, args: GPU_ARGS });
}

// ---------------------------------------------------------------- one shot
async function captureShot(browser, name, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|ERR_SOCKET|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await page.addInitScript((fps) => { window.__CAPTURE_FPS = fps; }, opt.fps);
  const url = `${opt.url}/?capture=1&shot=${encodeURIComponent(name)}&fps=${opt.fps}&seed=${opt.seed}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__capture && window.__capture.ready, null, { timeout: 120000 });
  const meta = await page.evaluate(async () => { await window.__capture.ready; return window.__capture.ctxRef().meta; });
  const total = opt.frames ? Math.min(opt.frames, meta.frames) : meta.frames;
  const dir = opt.tmp ? path.join(opt.tmp, name) : fs.mkdtempSync(path.join(os.tmpdir(), `gtab-${name}-`));
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  // warm-up: traffic + peds spawn and settle
  const WARM = 300;
  for (let left = meta.warmup; left > 0; left -= WARM) await page.evaluate((n) => window.__capture.step(n), Math.min(WARM, left));
  const writes = [];
  for (let i = 0; i < total; i++) {
    let b64;
    if (meta.hud) {
      await page.evaluate(() => { window.__capture.step(1); return new Promise((r) => requestAnimationFrame(() => r())); });
      const buf = await page.screenshot({ type: 'png', animations: 'allow', caret: 'initial' });
      writes.push(fs.promises.writeFile(path.join(dir, `f_${String(i).padStart(5, '0')}.png`), buf));
    } else {
      const url64 = await page.evaluate(() => window.__capture.stepGrab());
      b64 = url64.slice(url64.indexOf(',') + 1);
      writes.push(fs.promises.writeFile(path.join(dir, `f_${String(i).padStart(5, '0')}.png`), Buffer.from(b64, 'base64')));
    }
    if (writes.length > 32) await Promise.all(writes.splice(0, writes.length));
    if (i % 30 === 0 || i === total - 1) process.stdout.write(`\r  ${name}: frame ${i + 1}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)   `);
  }
  await Promise.all(writes);
  process.stdout.write('\n');
  const info = await page.evaluate(() => window.__capture.info());
  await ctx.close();
  return { meta, total, dir, info, errors };
}

function encode(name, dir, frames, outDir) {
  const mp4 = path.join(outDir, `${name}.mp4`);
  const args = ['-y', '-loglevel', 'error', '-framerate', String(opt.fps), '-i', path.join(dir, 'f_%05d.png'),
    '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(opt.crf), '-pix_fmt', 'yuv420p', '-r', String(opt.fps),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', '-an', mp4];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
  return mp4;
}

// ---------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(opt.out, { recursive: true });
  const W = Math.round(1920 * opt.scale), H = Math.round(1080 * opt.scale);
  const browser = await launch();
  // discover shot list from the game
  const probe = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await probe.goto(`${opt.url}/?capture=1`, { waitUntil: 'load', timeout: 120000 });
  await probe.waitForFunction(() => window.__capture, null, { timeout: 120000 });
  const all = await probe.evaluate(() => window.__capture.shots);
  const gl = await probe.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  await probe.close();
  console.log(`WebGL renderer: ${gl}`);
  if (opt.list) { console.log(all.join('\n')); await browser.close(); return; }
  const names = opt.only ? opt.only : all;
  for (const n of names) if (!all.includes(n)) { console.error(`unknown shot "${n}". Available: ${all.join(', ')}`); await browser.close(); process.exit(2); }

  const manifestPath = path.join(opt.out, 'manifest.json');
  let manifest = { generated: '', fps: opt.fps, width: 1920, height: 1080, shots: [] };
  try { manifest = { ...manifest, ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')) }; } catch { /* new */ }
  for (const name of names) {
    console.log(`\n== ${name}  (${W}x${H} @ ${opt.fps} fps)`);
    let res = null;
    for (let attempt = 1; attempt <= 2 && !res; attempt++) {
      try { res = await captureShot(browser, name, W, H); }
      catch (err) { console.error(`  attempt ${attempt} failed: ${err.message}`); }
    }
    if (!res) { console.error(`  ${name}: giving up`); continue; }
    if (res.errors.length) console.log(`  page errors (${res.errors.length}): ${[...new Set(res.errors)].slice(0, 3).join(' | ')}`);
    if (res.info?.blocked) console.log(`  WARNING: camera inside a building collider on ${res.info.blocked} frames`);
    const mp4 = encode(name, res.dir, res.total, opt.out);
    if (!opt.keep) fs.rmSync(res.dir, { recursive: true, force: true });
    const entry = { name, file: `${name}.mp4`, frames: res.total, seconds: +(res.total / opt.fps).toFixed(3), fps: opt.fps, hud: !!res.meta.hud, description: res.meta.description, beatFrame: res.meta.beat ?? null };
    manifest.shots = [...manifest.shots.filter((s) => s.name !== name), entry];
    console.log(`  -> ${path.relative(root, mp4)}  (${entry.seconds}s)`);
  }
  manifest.shots.sort((a, b) => a.name.localeCompare(b.name));
  manifest.generated = new Date().toISOString();
  manifest.fps = opt.fps;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
