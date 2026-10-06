#!/usr/bin/env node
// ElevenLabs asset generator for GTA Bogotá: music, sfx, voices (Spanish TTS).
// Usage: node --env-file=.env scripts/elevenlabs-generate.mjs [--only music|sfx|voices] [--force] [--dry]
// Idempotent: skips files that already exist (unless --force). Never prints the API key.
import { mkdir, writeFile, stat, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const RESERVE = 8000; // never spend the account below this many credits
const MIN_BYTES = 10 * 1024;

if (!KEY) { console.error('ELEVENLABS_API_KEY missing (run with node --env-file=.env)'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abs = (...p) => path.join(ROOT, ...p);

async function credits() {
  // The subscription endpoint is rate-limited (429) and its counter lags generations; retry gently.
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': KEY } });
    if (r.ok) {
      const j = await r.json();
      return { used: j.character_count, limit: j.character_limit, remaining: j.character_limit - j.character_count };
    }
    if (r.status !== 429) break;
    await sleep(2000 * (i + 1));
  }
  return { used: NaN, limit: NaN, remaining: Infinity }; // unknown: do not block generation
}

// MP3 128 kbps CBR -> duration estimate from bytes.
const mp3Seconds = (bytes, kbps = 128) => +((bytes * 8) / (kbps * 1000)).toFixed(1);

async function post(urlPath, body, { timeoutMs = 240_000 } = {}) {
  const r = await fetch(`${API}${urlPath}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 400);
    const err = new Error(`HTTP ${r.status} ${txt}`);
    err.status = r.status;
    throw err;
  }
  return Buffer.from(await r.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const MUSIC_COMMON = 'Original instrumental, no vocals, no singing, no spoken words. Studio-quality, warm, punchy, loopable: constant energy from the first beat to the last, no long intro, no fade-out, no ending riff.';
const MUSIC = [
  // Budget-reduced plan: ONE 90 s trailer (also the title theme: copied to title.mp3) + 3 station loops.
  { id: 'trailer', ms: 90000, copyTo: 'title.mp3', prompt: 'Cinematic game trailer score, instrumental, steady 100 BPM. 0 to 20 seconds: soft rain ambience and a gentle lonely accordion melody over low strings. At 20 seconds the beat drops into epic cumbia-trap: tambora and alegre drum, guacharaca scraper, huge 808 sub bass, rising brass and accordion hook. Around 60 seconds a short breakdown with only rain, accordion and a heartbeat kick, then rebuilds. Full climax with everything playing, ending on a hard final hit at 90 seconds. Bogota at dusk, dangerous and glamorous. No vocals.' },
  { id: 'tropicombo', ms: 30000, station: true, prompt: `Colombian cumbia, 98 BPM, festive and danceable. Guacharaca scraper and tambora drum patterns drive the groove, a warm round bass line walks under it, a bright accordion plays a catchy hook, clarinet and gaita flute answer in call and response, handclaps and a shaker. Sunny street party in Bogota. ${MUSIC_COMMON}` },
  { id: 'acordeon', ms: 30000, station: true, prompt: `Colombian vallenato, 115 BPM, parranda energy. Lead diatonic accordion playing fast joyful runs and a singable hook, caja vallenata drum, guacharaca scraper keeping the paseo rhythm, bass guitar, light acoustic guitar strums. A lively late-night parranda with friends. ${MUSIC_COMMON}` },
  { id: 'perreadera', ms: 30000, station: true, prompt: `Modern reggaeton, 95 BPM, dembow rhythm with punchy kick and snare, deep 808 sub bass, playful plucky synth lead, bright bell melody, vocal-free chops and risers, clean club mix, cheeky and fun. Strictly instrumental. ${MUSIC_COMMON}` },
];

const SFX = [
  // Budget-reduced plan: the procedural synth covers SFX; only the siren (4 s) is generated.
  { id: 'siren', sec: 4, loop: true, text: 'Latin American police car siren, wailing two-tone yelp rising and falling, outdoor, seamless loop' },
];

const STATION_JINGLES = { // <= 8 words each (credits are per character)
  tropicombo: '¡Tropicombo noventa y ocho siete, a bailar!',
  acordeon: '¡Vallenato Stereo, El Acordeón Llorón!',
  perreadera: '¡La Perreadera FM, dale volumen!',
  champeta: '¡Champeta Picó Radio, pura energía costeña!',
  trancon: '¡Trancón al Aire, paciencia, sumercé!',
};
// Voice: aud_Dipemo, Colombian male, narrative/professional (see server/elevenlabs.mjs for the full map)
const DJ_VOICE = 'j7XQZUnVCfhpa94EsaJS';
const DJ_SETTINGS = { stability: 0.3, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true, speed: 1.08 };
// Trailer narrator: aud_Damian, Colombian male, formal, slowed for a deep cinematic read.
const VO_VOICE = 'sdxJtmxpzgSLekrYUGIu';
const VO_SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 0.92 };
const VO_LINES = [ // from docs/VIDEO_PLAN.md, <= 8 words each
  'En Bogotá hay una sola ley.',
  'Siempre llueve a las tres.',
  'Más cerca de las estrellas... y del trancón.',
  'Roba. Derrapa. Huye. Habla.',
  'Cada bogotano tiene algo que decir.',
  'Un líder. Siete agentes. Noventa minutos.',
  'GTA Bogotá.',
  'Hecho en el Claude Build Day Bogotá.',
];
const TTS_MODEL = 'eleven_flash_v2_5'; // cheapest tier (0.5 credit/char), multilingual, good Spanish

// ---------------------------------------------------------------------------
async function generate(item, kind) {
  const out = kind === 'vo' ? abs('video', 'audio', 'vo', item.file) : abs('assets', kind === 'music' ? 'music' : kind === 'sfx' ? 'sfx' : 'voices', item.file);
  if (!FORCE && existsSync(out)) {
    const s = await stat(out);
    if (s.size > MIN_BYTES || item.small) { console.log(`skip   ${item.file} (exists, ${s.size} B)`); return { ...item, skipped: true, bytes: s.size }; }
  }
  const before = await credits();
  if (before.remaining < RESERVE) throw new Error(`credit reserve reached (${before.remaining} left), stopping`);
  if (DRY) { console.log(`dry    ${item.file}`); return null; }

  let buf, lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      buf = await item.run();
      if (buf.length < (item.small ? 2048 : MIN_BYTES)) throw new Error(`output too small (${buf.length} B)`);
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`retry  ${item.file} attempt ${attempt}: ${e.message}`);
      if (e.status === 401 || e.status === 402) break;
      await sleep(2500);
    }
  }
  if (!buf) { console.error(`FAILED ${item.file}: ${lastErr?.message}`); return { ...item, failed: true }; }
  await writeFile(out, buf);
  if (item.copyTo) await writeFile(path.join(path.dirname(out), item.copyTo), buf);
  const after = await credits();
  const cost = after.used - before.used;
  console.log(`ok     ${item.file}  ${(buf.length / 1024).toFixed(0)} KB  ~${mp3Seconds(buf.length)}s  cost ${cost} credits  (remaining ${after.remaining})`);
  return { id: item.id, file: item.file, bytes: buf.length, seconds: mp3Seconds(buf.length), credits: cost };
}

async function musicRun(m) {
  const body = { prompt: m.prompt, music_length_ms: m.ms, force_instrumental: true, model_id: 'music_v2_5' };
  try {
    return await post('/v1/music?output_format=mp3_44100_128', body, { timeoutMs: 400_000 });
  } catch (e) {
    // Fall back to the default model if v2.5 rejects the request (not for auth/credit errors).
    if (e.status === 401 || e.status === 402 || e.status === 429) throw e;
    console.warn(`  music_v2_5 failed (${e.message.slice(0, 120)}), trying default model`);
    delete body.model_id;
    return post('/v1/music?output_format=mp3_44100_128', body, { timeoutMs: 400_000 });
  }
}

async function main() {
  const start = await credits();
  console.log(`credits: ${start.remaining} remaining of ${start.limit} (used ${start.used})`);
  for (const d of ['music', 'sfx', 'voices']) await mkdir(abs('assets', d), { recursive: true });
  const results = { music: [], sfx: [], voices: [] };

  if (!ONLY || ONLY === 'music') {
    for (const m of MUSIC) {
      // station loops only if >= 40% of the starting credits remain after the trailer
      if (m.station) { const now = await credits(); if (now.remaining < start.remaining * 0.4) { console.log(`skip   ${m.id}.mp3 (credits < 40% of start)`); continue; } }
      results.music.push(await generate({ id: m.id, file: `${m.id}.mp3`, copyTo: m.copyTo, run: () => musicRun(m) }, 'music'));
    }
  }
  if (!ONLY || ONLY === 'sfx') {
    for (const s of SFX) {
      results.sfx.push(await generate({
        id: s.id, file: `${s.id}.mp3`, small: true,
        run: () => post('/v1/sound-generation?output_format=mp3_44100_128', {
          text: s.text, duration_seconds: s.sec, prompt_influence: 0.5, loop: !!s.loop, model_id: 'eleven_text_to_sound_v2',
        }),
      }, 'sfx'));
    }
  }
  if (!ONLY || ONLY === 'voices') {
    const lines = { ...Object.fromEntries(Object.entries(STATION_JINGLES).map(([k, v]) => [`jingle-${k}`, v])), welcome: '¡Bienvenido a Bogotá, parce!' };
    for (const [id, text] of Object.entries(lines)) {
      results.voices.push(await generate({
        id, file: `${id}.mp3`, small: true,
        run: () => post(`/v1/text-to-speech/${DJ_VOICE}?output_format=mp3_44100_128`, { text, model_id: TTS_MODEL, voice_settings: DJ_SETTINGS }),
      }, 'voices'));
    }
    await mkdir(abs('video', 'audio', 'vo'), { recursive: true });
    for (const [i, text] of VO_LINES.entries()) {
      const id = `vo-${String(i + 1).padStart(2, '0')}`;
      await generate({
        id, file: `${id}.mp3`, small: true,
        run: () => post(`/v1/text-to-speech/${VO_VOICE}?output_format=mp3_44100_128`, { text, model_id: TTS_MODEL, voice_settings: VO_SETTINGS }),
      }, 'vo');
    }
  }

  // manifest (merge with any existing one so partial runs keep prior data)
  const manPath = abs('assets', 'music', 'manifest.json');
  let prev = {};
  try { prev = JSON.parse(await readFile(manPath, 'utf8')); } catch {}
  const files = { ...(prev.files || {}) };
  for (const [group, list] of Object.entries(results)) {
    for (const r of list) {
      if (!r || r.failed) continue;
      const rel = `assets/${group === 'music' ? 'music' : group}/${r.file}`;
      if (r.skipped && files[rel]) continue;
      files[rel] = { bytes: r.bytes, seconds: r.seconds ?? files[rel]?.seconds ?? null, credits: r.credits ?? files[rel]?.credits ?? null };
    }
  }
  // also pick up files already on disk that aren't listed yet (e.g. from an earlier partial run)
  for (const group of ['music', 'sfx', 'voices']) {
    for (const f of (await readdir(abs('assets', group))).filter((n) => n.endsWith('.mp3'))) {
      const rel = `assets/${group}/${f}`;
      if (!files[rel]) { const b = (await stat(abs(rel))).size; files[rel] = { bytes: b, seconds: mp3Seconds(b), credits: null }; }
    }
  }
  if (!DRY) await writeFile(manPath, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'seconds estimated from 128 kbps CBR mp3 size', files }, null, 2) + '\n');

  const end = await credits();
  console.log(`\ncredits spent this run: ${end.used - start.used}; remaining: ${end.remaining}`);
  const failed = Object.values(results).flat().filter((r) => r?.failed);
  if (failed.length) { console.error('failed:', failed.map((f) => f.file).join(', ')); process.exit(2); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
