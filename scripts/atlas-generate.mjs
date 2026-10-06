#!/usr/bin/env node
// Atlas Cloud image-to-video generator for GTA Bogotá (idempotent, budget-aware).
//
//   node --env-file=.env scripts/atlas-generate.mjs [--only a,b] [--budget 5] [--model fast|full]
//        [--res 720p|1080p-SR] [--interp mci|dup] [--dry-run] [--post-only] [--force] [--balance]
//
// - Skips any clip whose raw MP4 already exists (use --force to regenerate, --post-only to only re-encode).
// - Spend is tracked in video/public/ai/manifest.json (cost per clip, from balance delta when available).
// - NEVER prints the API key. Key is read from ATLASCLOUD_API_KEY.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.atlascloud.ai';
const KEY = process.env.ATLASCLOUD_API_KEY;
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const MODELS = {
  // price = USD per second of output (Atlas models list, verified against balance deltas)
  fast: { id: 'bytedance/seedance-2.0-fast/image-to-video', price: 0.0585 }, // list price says 0.027/s but measured 720p cost is ~$0.29 per 5s clip
  full: { id: 'bytedance/seedance-2.0/image-to-video', price: 0.09 },
};
const MODEL = MODELS[opt('model', 'fast')];
const RES = opt('res', '720p');
const SECONDS = Number(opt('seconds', 5));
const BUDGET = Number(opt('budget', 5)); // USD hard cap for THIS ledger (sum of manifest costs)
const INTERP = opt('interp', 'mci'); // 'mci' = minterpolate motion-compensated, 'dup' = plain fps=60
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;

const STYLE = ' Keep the exact low-poly stylized 3D art style and color palette of the source image, smooth coherent motion, cinematic lighting. No text, no logos, no subtitles, no watermark.';
const AI = 'video/public/ai';
const RAW = 'assets/_src/ai-raw';
const GAME = 'assets/video';

// order == priority order when budget runs low
const CLIPS = [
  { name: 'coldopen', src: 'video/public/art/coldopen.png', ratio: '16:9', out: AI, prompt: 'Rain streaks run down a window glass in the foreground, a sudden lightning flash illuminates the Bogotá skyline and the Andes mountains behind, then dims back to moody night; neon reflections shimmer in the drops. Slow cinematic push-in.' },
  { name: 'title-loop', src: 'assets/cover.png', ratio: '16:9', out: GAME, loop: true, prompt: 'Subtle living cover art: gentle rain falling, car headlights glinting and flickering on the wet street, neon signs softly pulsing, mist drifting over the mountains, very slow cinematic push-in camera. Calm ambient motion, nothing sudden.' },
  { name: 'panel-01', src: 'video/public/art/panel-01.png', ratio: 'adaptive', out: AI, prompt: 'The yellow taxi drifts sideways through the wet street, sheets of rain spray flying off its tires, headlights glowing, reflections streaking on the asphalt; the camera tracks slightly alongside with dynamic energy.' },
  { name: 'panel-04', src: 'video/public/art/panel-04.png', ratio: 'adaptive', out: AI, prompt: 'Police lights flash blue and red in a chase at night, the green police car speeds forward through rain spray, light reflections pulsing on the wet road, city lights twinkling behind; subtle camera shake.' },
  { name: 'panel-06', src: 'video/public/art/panel-06.png', ratio: 'adaptive', out: AI, prompt: 'Golden hour timelapse over Monserrate: storm clouds roll and drift across the mountain sky, golden sunset light moving across the church and hillside, city lights slowly switching on in the valley below; slow gentle camera push.' },
  { name: 'panel-07', src: 'video/public/art/panel-07.png', ratio: 'adaptive', out: AI, prompt: 'The tall skyscraper tower LED facade cycles through rainbow colors, glowing reflections shifting on the wet plaza pavement, light rain falling, slow upward camera tilt, street lamps glowing.' },
  { name: 'endcard', src: 'video/public/art/endcard.png', ratio: '16:9', out: AI, prompt: 'Slow aerial drift over the night panorama of Bogotá, thousands of city lights twinkling, clouds slowly moving over the mountains, gentle parallax; the upper center of the frame stays calm and empty.' },
  { name: 'makingof', src: 'video/public/art/makingof.png', ratio: '16:9', out: AI, prompt: 'Little robots busily building a city on a laptop, bright welding sparks flying, glowing lights flickering, slow cinematic orbit camera around the scene.' },
  { name: 'panel-02', src: 'video/public/art/panel-02.png', ratio: 'adaptive', out: AI, prompt: 'The red TransMilenio articulated bus glides forward arriving at the station, headlights glowing, rain falling, passengers with umbrellas waiting under the glass shelter, reflections shimmering on the wet road; slow camera dolly.' },
  { name: 'panel-03', src: 'video/public/art/panel-03.png', ratio: 'adaptive', out: AI, prompt: 'The warm grandmother smiles gently and offers the cup of hot chocolate toward the camera, steam rising from the cup, her braids and colorful poncho swaying slightly, soft lantern glow; slow push-in.' },
  { name: 'panel-05', src: 'video/public/art/panel-05.png', ratio: 'adaptive', out: AI, prompt: 'The colorful chiva party bus bounces to the beat, string party lights blinking and swaying, passengers on top dancing and cheering with raised arms, reflections dancing on the wet street; lively handheld camera.' },
  { name: 'panel-08', src: 'video/public/art/panel-08.png', ratio: 'adaptive', out: AI, prompt: 'The street vendor under the big rainbow umbrella smiles and hands over a snack, rain drips from the umbrella edge, lantern light flickering warmly, rain falling on cobblestones; slow gentle push-in.' },
  { name: 'loading-1', src: 'assets/loading/loading-1.jpg', ratio: '16:9', out: GAME, loop: true, seconds: 4, prompt: 'Very subtle ambient motion: drifting clouds and mist, soft rain, twinkling city lights, slow gentle camera drift.' },
  { name: 'loading-2', src: 'assets/loading/loading-2.jpg', ratio: '16:9', out: GAME, loop: true, seconds: 4, prompt: 'Very subtle ambient motion: drifting clouds and mist, soft rain, twinkling city lights, slow gentle camera drift.' },
  { name: 'loading-3', src: 'assets/loading/loading-3.jpg', ratio: '16:9', out: GAME, loop: true, seconds: 4, prompt: 'Very subtle ambient motion: drifting clouds and mist, soft rain, twinkling city lights, slow gentle camera drift.' },
];

const abs = (p) => path.join(ROOT, p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// fetch with retries on network errors (transient 'fetch failed')
const _fetch = globalThis.fetch;
async function fetchR(url, init, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await _fetch(url, init); } catch (e) { if (i >= tries) throw new Error(`${e.message} (${e.cause?.code || e.cause?.message || 'no cause'})`); await sleep(2000 * i); }
  }
}
const H = () => ({ Authorization: `Bearer ${KEY}` });

async function balance() {
  const r = await fetchR(`${API}/public/v1/balance`, { headers: H() });
  const j = await r.json();
  return Number(j.available?.value);
}

async function uploadMedia(file) {
  const buf = await readFile(abs(file));
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), path.basename(file));
  const r = await fetchR(`${API}/api/v1/model/uploadMedia`, { method: 'POST', headers: H(), body: fd });
  const j = await r.json();
  const url = j.data?.download_url || j.data?.url || j.url || j.download_url;
  if (!url) throw new Error(`upload failed: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return url;
}

async function generate(clip) {
  const imageUrl = await uploadMedia(clip.src);
  const body = {
    model: MODEL.id, image: imageUrl, prompt: clip.prompt + STYLE,
    duration: clip.seconds || SECONDS, resolution: RES, ratio: clip.ratio, generate_audio: false, watermark: false,
    bitrate_mode: 'high',
  };
  const r = await fetchR(`${API}/api/v1/model/generateVideo`, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  const id = j.data?.id || j.data?.prediction_id || j.prediction_id || j.id;
  if (!id) throw new Error(`submit failed: ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const p = await (await fetchR(`${API}/api/v1/model/prediction/${id}`, { headers: H() })).json();
    const st = p.data?.status;
    if (st === 'completed' || st === 'succeeded') {
      const url = p.data.outputs?.[0];
      if (!url) throw new Error('completed without output');
      return { id, url };
    }
    if (st === 'failed' || st === 'error' || st === 'canceled') throw new Error(`generation ${st}: ${p.data?.error || ''}`);
  }
  throw new Error('timeout polling ' + id);
}

function ff(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' ').slice(0, 200));
}
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]);
  const j = JSON.parse(r.stdout.toString());
  return { w: j.streams[0].width, h: j.streams[0].height, dur: Number(j.format.duration) };
}

function post(clip) {
  const raw = abs(path.join(RAW, `${clip.name}.mp4`));
  const { w, h, dur } = probe(raw);
  const portrait = h > w;
  const outs = {};
  // (b) trailer version: lanczos upscale, 60 fps, CRF 16 (loops use the looped source)
  const tdir = abs(AI);
  const fps60 = (clip.interp || INTERP) === 'mci' ? 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1' : 'fps=60';
  const scale = portrait ? 'scale=1080:-2:flags=lanczos' : 'scale=1920:-2:flags=lanczos';
  const trailerOut = path.join(tdir, `${clip.name}.mp4`);
  // (a) web version: <=1280 wide, CRF 26, faststart, no audio
  const webDir = clip.out === GAME ? abs(GAME) : path.join(abs(AI), 'web');
  const webOut = path.join(webDir, `${clip.name}.mp4`);
  const webScale = portrait ? 'scale=-2:min(ih\\,1280)' : 'scale=min(iw\\,1280):-2';
  let src = raw;
  if (clip.loop) {
    // seamless loop: tail 0.5s cross-faded over the head 0.5s; clip length becomes dur-0.5
    const X = 0.5;
    const loopPath = abs(path.join(RAW, `${clip.name}.loop.mp4`));
    ff(['-i', raw, '-filter_complex',
      `[0:v]split=3[m][h][t];` +
      `[m]trim=${X}:${dur - X},setpts=PTS-STARTPTS[main];` +
      `[h]trim=0:${X},setpts=PTS-STARTPTS[head];` +
      `[t]trim=${dur - X}:${dur},setpts=PTS-STARTPTS,format=yuva420p,fade=t=out:st=0:d=${X}:alpha=1[tail];` +
      `[head][tail]overlay=format=auto,format=yuv420p[xf];[main][xf]concat=n=2:v=1:a=0[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-crf', '12', '-preset', 'slow', '-pix_fmt', 'yuv420p', loopPath]);
    src = loopPath;
  }
  spawnSync('mkdir', ['-p', tdir, webDir]);
  if (clip.out === AI) {
    ff(['-i', src, '-vf', `${scale},${fps60},format=yuv420p`, '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart', trailerOut]);
    outs.trailer = path.relative(ROOT, trailerOut);
  }
  ff(['-i', src, '-vf', `${webScale},format=yuv420p`, '-an', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', webOut]);
  outs.web = path.relative(ROOT, webOut);
  return outs;
}

async function main() {
  if (!KEY) { console.error('ATLASCLOUD_API_KEY missing (run with node --env-file=.env)'); process.exit(1); }
  if (flag('balance')) { console.log('balance USD', await balance()); return; }
  const manifestPath = abs(path.join(AI, 'manifest.json'));
  await mkdir(abs(AI), { recursive: true }); await mkdir(abs(RAW), { recursive: true }); await mkdir(abs(GAME), { recursive: true });
  const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { clips: [] };
  const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const spent = () => manifest.clips.reduce((s, c) => s + (c.cost || 0), 0);
  let bal = await balance();
  console.log(`balance $${bal.toFixed(3)} | ledger spend $${spent().toFixed(3)} | budget $${BUDGET} | model ${MODEL.id} ${RES} ${SECONDS}s`);

  for (const clip of CLIPS) {
    if (ONLY && !ONLY.includes(clip.name)) continue;
    const rawPath = abs(path.join(RAW, `${clip.name}.mp4`));
    const secs = clip.seconds || SECONDS;
    const est = MODEL.price * secs;
    const have = existsSync(rawPath) && !flag('force');
    if (!have) {
      if (spent() + est > BUDGET) { console.log(`SKIP ${clip.name}: budget (${spent().toFixed(3)} + ${est.toFixed(3)} > ${BUDGET})`); continue; }
      if (flag('dry-run')) { console.log(`DRY ${clip.name} ~$${est.toFixed(3)}`); continue; }
      if (flag('post-only')) { console.log(`no raw for ${clip.name}`); continue; }
      console.log(`GEN ${clip.name} ...`);
      const t0 = Date.now();
      try {
        const { id, url } = await generate(clip);
        const mp4 = Buffer.from(await (await fetchR(url)).arrayBuffer());
        await writeFile(rawPath, mp4);
        const nb = await balance();
        const delta = bal - nb; bal = nb;
        const cost = delta > 0 && delta < est * 3 ? Number(delta.toFixed(4)) : est;
        const info = probe(rawPath);
        manifest.clips = manifest.clips.filter((c) => c.name !== clip.name);
        manifest.clips.push({ name: clip.name, source: clip.src, model: MODEL.id, seconds: clip.seconds || SECONDS, cost, resolution: `${info.w}x${info.h}`, prediction: id, prompt: clip.prompt, generatedAt: new Date().toISOString() });
        await save();
        console.log(`  done in ${((Date.now() - t0) / 1000) | 0}s, cost $${cost}, ${info.w}x${info.h}, balance $${nb.toFixed(3)}`);
      } catch (e) { console.error(`  FAIL ${clip.name}: ${e.message}`); continue; }
    } else console.log(`have ${clip.name} (skip generation)`);
    // post (idempotent: always re-encode only when outputs missing or --post-only/--force)
    const entry = manifest.clips.find((c) => c.name === clip.name);
    const webCheck = clip.out === GAME ? abs(path.join(GAME, `${clip.name}.mp4`)) : abs(path.join(AI, `${clip.name}.mp4`));
    if (!existsSync(webCheck) || flag('post-only') || flag('force') || !have) {
      const outs = post(clip);
      if (entry) { Object.assign(entry, { files: outs, fps: 60, interp: clip.interp || INTERP }); await save(); }
      console.log('  post:', JSON.stringify(outs));
    }
  }
  console.log(`ledger spend $${spent().toFixed(3)} | balance $${(await balance()).toFixed(3)}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
