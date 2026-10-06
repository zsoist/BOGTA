# 🚕 GTA Bogotá

> Un mundo abierto low-poly de Bogotá, hecho para reírse del trancón. Maneje, robe taxis (de mentiras), esquive huecos, huya de la Policía... y converse con cualquiera: **los NPCs y el locutor de radio hablan con Claude**.

Premium low-poly 3D free-roam in the browser (Three.js, no bundler). Cerros Orientales, Monserrate, Torre Colpatranca, TransMilagro, lluvia a las 3, pico y placa. Every pedestrian has a personality, and the radio DJ of *Trancón al Aire* improvises bulletins live.

## Quick start

```bash
cp .env.example .env        # paste your ANTHROPIC_API_KEY (platform.claude.com)
npm install && npm start
# open http://localhost:5173
```

No key? The game still runs: NPCs and the DJ fall back to a big bank of offline lines.

| `.env` | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude for NPC chat + radio DJ (from platform.claude.com) |
| `CLAUDE_MODEL` | defaults to `claude-opus-5-5` |
| `ELEVENLABS_API_KEY` | optional: voices, music and SFX (from elevenlabs.io) |
| `PORT` | defaults to `5173` |

Regenerate the ElevenLabs music / voices / SFX any time:

```bash
node --env-file=.env scripts/elevenlabs-generate.mjs
```

Health check: `curl localhost:5173/api/health` → `{"enabled":true,"model":"claude-opus-5-5","tts":true}`

## Controls

| Key | Action |
|---|---|
| `W A S D` / arrows | Drive / walk |
| `Space` | Handbrake / jump |
| `Shift` | Run |
| `F` | Enter / exit / steal a vehicle |
| `E` | Talk to the nearest person (Claude-powered) |
| `Q` | Change radio station |
| `H` | Horn |
| `R` | Flip the car back over |
| `C` | Change camera |
| `Esc` | Close dialog |

## Architecture

```
 Browser (vanilla ES modules + Three.js via import map)
 ┌───────────────────────────────────────────────────────────────┐
 │ main.js ── game loop ── world: city · sky · traffic · peds    │
 │              │                  · police · player · vehicles  │
 │              ├─ ui: hud · minimap · dialog · title            │
 │              ├─ audio: WebAudio synth + ElevenLabs            │
 │              └─ net/claude.js  (offline fallbacks, 20 s timeout)
 └───────────────────────┬───────────────────────────────────────┘
                         │ fetch
 ┌───────────────────────▼───────────────────────────────────────┐
 │ server/server.mjs  (Node http: static files + API, rate limit)│
 │   GET  /api/health    POST /api/npc    POST /api/radio        │
 │   POST /api/tts (ElevenLabs)                                  │
 │ server/claude.mjs ── @anthropic-ai/sdk ── Claude Opus 5.5     │
 │ server/persona.mjs ── NPC & DJ system prompts                 │
 └───────────────────────────────────────────────────────────────┘
```

## API

- `POST /api/npc` `{ ped:{name,kind,persona}, history:[{role,content}], message, context:{district,hour,raining,wanted,money,vehicle} }` → `{ reply }`
- `POST /api/radio` `{ station, context }` → `{ line }`
- Inputs are capped (12 history turns, 400-char messages), 30 req/min per IP. Without a key, both return an offline line with `offline: true`.

## Credits

Built at **Claude Build Day Bogotá** with Claude **Opus 5.5** and **Sonnet 5.5**. Portraits and loading screens generated with image models; music, voices and SFX with ElevenLabs. All brands are parodies, all trancones are real.
