# ElevenLabs integration (music, SFX, voices)

Key: `ELEVENLABS_API_KEY` in `.env` (server-side only, never in browser code, never committed; `.env` is gitignored).

## What was generated (all mp3, 44.1 kHz, 128 kbps)
Budget was cut to "as cheap as possible" mid-run. Final plan: one 90 s trailer, 3 station loops, short jingles, trailer VO. Some extra files (generated before the cut) are kept because they are already paid for and the game falls back to the procedural synth only when a file is missing.

| file | length | notes |
|---|---|---|
| `assets/music/trailer.mp3` | 90 s | trailer score: rain + soft accordion (0-20 s), cumbia-trap drop at 20 s, break ~60 s, climax + hard ending, ~100 BPM, instrumental |
| `assets/music/title.mp3` | 90 s | byte-identical COPY of trailer.mp3 (title theme) |
| `assets/music/tropicombo.mp3`, `acordeon.mp3`, `perreadera.mp3` | 75 s each | station loops (generated before the cut at 75 s; the script's current spec is 30 s, skipped because files exist) |
| `assets/music/champeta.mp3`, `busted.mp3`, `wasted.mp3` | 75 s / 5 s / 5 s | generated before the cut; optional, delete if you prefer the procedural versions |
| `assets/sfx/horn, siren, crash, cash, rain, crowd, whoosh .mp3` | 0.8-10 s | generated before the cut (~1,350 credits); only `siren` is in the script's current spec. Optional; the synth also covers them |
| `assets/voices/jingle-{tropicombo,acordeon,perreadera,champeta,trancon}.mp3` | 2.4-5 s | <= 8-word DJ station IDs, `eleven_flash_v2_5`, voice aud_Dipemo |
| `assets/voices/welcome.mp3` | 1.7 s | "¡Bienvenido a Bogotá, parce!" |
| `video/audio/vo/vo-01.mp3 ... vo-08.mp3` | 1.3-7.9 s | trailer narrator (Spanish, deep/slow, aud_Damian, flash model), lines from docs/VIDEO_PLAN.md: 01 "En Bogotá hay una sola ley." 02 "Siempre llueve a las tres." 03 "Más cerca de las estrellas... y del trancón." 04 "Roba. Derrapa. Huye. Habla." 05 "Cada bogotano tiene algo que decir." 06 "Un líder. Siete agentes. Noventa minutos." 07 "GTA Bogotá." 08 "Hecho en el Claude Build Day Bogotá." |
| `assets/music/manifest.json` | | file list with bytes + estimated seconds (from CBR size) |

`trancon` (talk station) has only a jingle, no music. Per-file `credits` in the manifest are unreliable (the account counter lags); use the totals below.

## Credits (final)
Plan: Creator, 131,000 credits. Start: 1,315 used (129,685 free). **Final: 8,061 used, 122,939 remaining. Spent this session: ~6,746 credits (~5.2% of the account).**
Rough breakdown: music ~5,100 (7 tracks at 75/45/5 s before the cut ~3,850, plus the 90 s trailer ~1,240), SFX ~1,350, voices + VO ~300. The reduced budget was not exceeded by the trailer step: after it, 122,939 remained (94% of the start), so the station-loop gate (>= 40% left) passed, but the three loops already existed so nothing more was generated.

## Runtime NPC voices (OFF by default): `server/elevenlabs.mjs`
Exports `handleTTS(req, res, body)`, `elevenEnabled()` (key present) and `liveTTSEnabled()` (key present AND `ELEVENLABS_LIVE_TTS=1`). Live TTS is **disabled by default** to save credits: without `ELEVENLABS_LIVE_TTS=1` the endpoint returns 503 `{error:'tts_disabled'}` and the browser should fall back to `speechSynthesis`. When enabled: model `eleven_flash_v2_5` (cheapest + lowest latency, multilingual), text capped at **160 chars** (400 otherwise), mp3 44.1 kHz 64 kbps, in-memory cache of 500 entries keyed by sha1(kind+text). No key: 503 `{error:'elevenlabs_disabled'}`.

Voices (all from this account's library, Colombian/Latin Spanish):
- vendor, dj: `j7XQZUnVCfhpa94EsaJS` (aud_Dipemo)
- walker: `GMEpD7vcmVahuyz6NuZA` (aud_JuanCarlos)
- student: `b2htR0pMe28pYwCY9gnP` (aud_Sofia)
- oficinista, policia: `sdxJtmxpzgSLekrYUGIu` (aud_Damian)
- abuela: `SmgKjOvC1aIujLWcMzqq` (aud_Alisson, slowed to 0.88x)
Unknown kinds fall back to `walker`. Flash costs about 0.5 credit per character.

### Mounting in `server/server.mjs` (lead)
```js
import { handleTTS, liveTTSEnabled } from './elevenlabs.mjs';
// inside the request handler, next to /api/npc and /api/radio (readJson = the existing JSON body helper):
if (url.pathname === '/api/tts' && req.method === 'POST') return handleTTS(req, res, await readJson(req));
// optionally expose in /api/health: { ..., tts: liveTTSEnabled() }  (browser: use /api/tts only when true)
```
`handleTTS` writes the full response itself (audio/mpeg or JSON) and catches its own errors. To turn on live voices: `ELEVENLABS_LIVE_TTS=1` in `.env`.

### Browser usage
```js
const r = await fetch('/api/tts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: text.slice(0, 160), kind: ped.kind }) });
if (r.ok) { const url = URL.createObjectURL(await r.blob()); new Audio(url).play(); } // else speechSynthesis
```

## Regenerate
```
node --env-file=.env scripts/elevenlabs-generate.mjs                 # everything, skips existing files
node --env-file=.env scripts/elevenlabs-generate.mjs --only music    # or sfx / voices
node --env-file=.env scripts/elevenlabs-generate.mjs --only music --force   # overwrite (spends credits)
# voices (jingles, welcome, video/audio/vo/vo-NN.mp3) are ~0.5 credit/char: --only voices --force costs < 100 credits
```
To re-roll one file, delete it and rerun. Prompts live at the top of the script. APIs used: `POST /v1/music` (model `music_v2_5`, `force_instrumental: true`, falls back to the default model on error), `POST /v1/sound-generation` (`eleven_text_to_sound_v2`, `loop` for ambience), `POST /v1/text-to-speech/{voice_id}` (`eleven_flash_v2_5` for jingles and VO). No artist names are used in any prompt.

## How the game should use the files
- **Radio**: when the station changes, if `assets/music/<stationId>.mp3` exists (tropicombo, acordeon, perreadera, champeta), play it looped (`loop = true` on an `<audio>`/`AudioBufferSourceNode`) through the existing car-radio filter (bandpass/low-pass + slight distortion) instead of the procedural synth; if the fetch 404s, keep the procedural synth. Start at a random offset so tuning in feels like live radio. Only while driving.
- **Jingles**: on station change, play `assets/voices/jingle-<stationId>.mp3` once (duck the music ~50% during it). `trancon` has a jingle plus the `/api/radio` line (spoken with speechSynthesis).
- **Title screen**: `assets/music/title.mp3` (= trailer.mp3) after the first user gesture (Enter/click), fade out when the game starts. `assets/voices/welcome.mp3` right after the player starts.
- **Stingers**: `busted.mp3` on `player:busted`, `wasted.mp3` on `player:wasted`.
- **SFX**: `horn` (H), `siren` loop while police chase, `crash` on `crash` event (scale volume with intensity), `cash` on `money:change` with delta > 0, `rain` loop when `state.raining`, `crowd` loop at low volume near vendors/plazas on foot, `whoosh` for UI transitions. Decode with `decodeAudioData` once and reuse buffers; all are guarded so a missing file just means procedural fallback.
- **NPC speech**: browser `speechSynthesis` by default; `POST /api/tts` only when `liveTTSEnabled()` (opt-in).
