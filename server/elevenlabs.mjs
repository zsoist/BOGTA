// ElevenLabs TTS proxy for NPC voices. No dependencies, no express.
// The API key stays server-side (process.env.ELEVENLABS_API_KEY) and is never sent to the browser.
import { createHash } from 'node:crypto';

export const elevenEnabled = () => !!process.env.ELEVENLABS_API_KEY;
// Live NPC TTS costs credits per character, so it is OFF by default: set ELEVENLABS_LIVE_TTS=1 to enable.
// When off, /api/tts answers 503 {error:'tts_disabled'} and the browser falls back to speechSynthesis.
export const liveTTSEnabled = () => elevenEnabled() && process.env.ELEVENLABS_LIVE_TTS === '1';

// Colombian Spanish voices from this account's /v1/voices list.
const V = {
  dipemo: 'j7XQZUnVCfhpa94EsaJS',    // aud_Dipemo   - male, middle aged, Colombian, narrative/professional
  damian: 'sdxJtmxpzgSLekrYUGIu',    // aud_Damian   - male, middle aged, Colombian, formal
  sofia: 'b2htR0pMe28pYwCY9gnP',     // aud_Sofia    - female, young, Colombian, conversational/pleasant
  alisson: 'SmgKjOvC1aIujLWcMzqq',   // aud_Alisson  - female, middle aged, Colombian, casual
  juancarlos: 'GMEpD7vcmVahuyz6NuZA' // aud_JuanCarlos - male, middle aged, Latin American, crisp
};

// kind -> voice + per-character voice settings (flash model supports stability/similarity/style/speed)
const VOICES = {
  vendor:     { id: V.dipemo,     settings: { stability: 0.35, similarity_boost: 0.8, style: 0.5, speed: 1.08 } },
  walker:     { id: V.juancarlos, settings: { stability: 0.5,  similarity_boost: 0.8, style: 0.25, speed: 1.0 } },
  student:    { id: V.sofia,      settings: { stability: 0.4,  similarity_boost: 0.8, style: 0.4, speed: 1.1 } },
  oficinista: { id: V.damian,     settings: { stability: 0.6,  similarity_boost: 0.8, style: 0.15, speed: 1.05 } },
  abuela:     { id: V.alisson,    settings: { stability: 0.6,  similarity_boost: 0.8, style: 0.3, speed: 0.88 } },
  policia:    { id: V.damian,     settings: { stability: 0.7,  similarity_boost: 0.8, style: 0.35, speed: 0.98 } },
  dj:         { id: V.dipemo,     settings: { stability: 0.3,  similarity_boost: 0.8, style: 0.6, speed: 1.1 } },
};
const DEFAULT_KIND = 'walker';
const MODEL = 'eleven_flash_v2_5'; // lowest-latency multilingual model (~75 ms), good Spanish
const MAX_CHARS = 160;
const CACHE_MAX = 500; // aggressive: repeated NPC lines never cost credits twice

const cache = new Map(); // hash -> Buffer (insertion order = LRU-ish)

function json(res, status, obj) {
  if (res.headersSent) { res.end(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function sendAudio(res, buf, hit) {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': buf.length,
    'Cache-Control': 'private, max-age=3600',
    'X-TTS-Cache': hit ? 'hit' : 'miss',
  });
  res.end(buf);
}

/**
 * POST /api/tts  body: { text: string (<=160 chars), kind?: vendor|walker|student|oficinista|abuela|policia|dj }
 * `body` is the already-parsed JSON object. Responds audio/mpeg, or JSON error (503 if no key).
 */
export async function handleTTS(req, res, body) {
  try {
    if (!elevenEnabled()) return json(res, 503, { error: 'elevenlabs_disabled', enabled: false });
    if (!liveTTSEnabled()) return json(res, 503, { error: 'tts_disabled', enabled: false });
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return json(res, 400, { error: 'text required' });
    if (text.length > MAX_CHARS) return json(res, 400, { error: `text too long (max ${MAX_CHARS})` });
    const kind = VOICES[body?.kind] ? body.kind : DEFAULT_KIND;

    const hash = createHash('sha1').update(`${kind}\n${text}`).digest('hex');
    const hit = cache.get(hash);
    if (hit) { cache.delete(hash); cache.set(hash, hit); return sendAudio(res, hit, true); }

    const v = VOICES[kind];
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.id}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: v.settings }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      console.warn(`[elevenlabs] TTS HTTP ${r.status}`); // never log headers/key
      return json(res, r.status === 401 || r.status === 402 || r.status === 429 ? 503 : 502, { error: 'tts_failed', status: r.status });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    cache.set(hash, buf);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return sendAudio(res, buf, false);
  } catch (e) {
    console.warn('[elevenlabs] TTS error:', e?.name || 'error');
    return json(res, 502, { error: 'tts_failed' });
  }
}
