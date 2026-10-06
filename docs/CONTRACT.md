# GTA Bogotá — Module Contract (READ FULLY BEFORE WRITING CODE)

Browser game, **vanilla ES modules, no bundler**, Three.js **0.186.1** via import map (`import * as THREE from 'three'`, addons at `three/addons/...`).
Served by `server/server.mjs` at http://localhost:5173 (`npm start`). Quality bar: **premium** — polished feel, juicy feedback, 60 fps on a MacBook, zero console errors.

## Ground rules
- Only edit the files your task owns. Shared files (`src/config.js`, `src/core/*`, `src/main.js`, `index.html`, this doc) are owned by the lead; if you need a change there, write it in your final report instead.
- Use `src/config.js` constants (coordinates, road network, landmarks, districts, stations). Never hardcode a second map.
- Heading convention: `mesh.rotation.y = heading`; models face **-Z**; `forward = (-sin h, 0, -cos h)`; heading 0 = north. `+X = east` (cerros/Monserrate), `-Z = north`.
- Low-poly look: `MeshLambertMaterial({flatShading:true})` / `MeshStandardMaterial` with flat colors; share materials/geometries; use `InstancedMesh` for anything repeated > 20 times.
- r186: use `THREE.Timer` (not Clock), `PCFShadowMap` (not PCFSoft). No physics library — arcade physics.
- Text the player sees is **Spanish (Colombian, rolo flavor)**, funny, PG-13. No real brand names (use parodies in `docs/research/bogota.md`). No narco glorification. Weapons: none (it's a "chaos & driving" GTA — crimes are carjacking, running people over (they ragdoll and get up, cartoon style), ramming, speeding).
- Every module must be **robust**: never throw inside `update()`; guard missing optional assets (`assets/...png` may not exist → fall back to procedural).

## Shared core (already written, import them)
- `src/core/events.js` → `events.on(name, fn)` / `events.emit(name, data)`
- `src/core/state.js` → `state` (money, health, wanted, hour, day, plate, plateDigit, raining, stationIndex, paused, dialogOpen, aiEnabled), `addMoney(delta, reason)`, `formatCOP(n)`
- `src/core/input.js` → `input.down(code)`, `input.pressed(code)`, `input.throttle`, `input.steer` (+1 = left), `input.handbrake`, `input.run`
- `src/core/collision.js` → `createColliderGrid(colliders)` → `{add, query}`, `resolveCircle(pos, radius, grid)` → normal|null
- `src/config.js` → `buildRoadNetwork()` → `net = {roads, nodes, nodeAt(i,j), nearestNode(x,z), roadAt(x,z)}`, `LANDMARKS`, `districtAt(z)`, `RADIO_STATIONS`, sizes.

## The `world` object (built in main.js, passed to every `update(dt, world)`)
```js
world = {
  scene, camera, renderer, net, colliderGrid,
  city,            // return value of createCity
  player,          // Player instance
  vehicles: [],    // ALL live Vehicle instances (traffic, police, parked, player's). Systems push/splice their own.
  peds: [],        // ALL live pedestrians (Ped objects, see below)
  state, events,
  time,            // seconds since start (real)
}
```

## Update order (main.js, every frame)
1. `player.update` (sets controls on its vehicle) → 2. `vehicle.update(dt, world)` for EVERY entry in `world.vehicles` (**main.js does this — AI systems must NOT call vehicle.update themselves; they only call `setControls`**) → 3. traffic, pedestrians, police, city, sky `update` → 4. camera → 5. HUD/minimap/dialog/audio `update` → render.
A destroyed/recycled vehicle must be spliced out of `world.vehicles` and `dispose()`d by the system that owns it.
Pressing **E** near a ped is handled in main.js via `pedSystem.nearestTalkable(pos, 3.5)` → emits `npc:talk`.

## Module APIs (exact export names — main.js imports these)

### World — `src/world/city.js`
`export function createCity(scene, net)` → `{ colliders: AABB[], update(dt, world), group }`
- Ground, roads (lane markings, zebra crossings, sidewalks with curbs), TransMilagro median busway + 2-3 glass stations on Avenida Caracas, buildings per block (InstancedMesh, varied heights: low colonial colorful houses in La Candelaria/Usaquén, brick towers in Teusaquillo/Chapinero, glass towers in Centro Internacional), parks (Simón Bolívar lake, Parque 93), trees, streetlights (emissive at night), hand-painted shop signs with parody names (CanvasTexture), potholes ("huecos") as dark decals.
- Each LANDMARK from config gets a recognizable low-poly model: Torre Colpatranca (with color-cycling LED facade at night), Torre Bacatanga (tallest twin), Plaza de Bolívar (open plaza + Capitolio + Catedral + pigeons), Torres del Parque (curved brick), El Campín stadium, Usaquén church, Santo Tomás university building (sign "Build Day 🤖"), Zona T lights.
- `colliders`: AABBs `{minX,maxX,minZ,maxZ,height}` for buildings/solid props (NOT roads).
`export function createSky(scene, renderer)` in `src/world/sky.js` → `{ update(dt, world) }`
- Cerros Orientales mountain range along the east (x > CERROS_START_X) with Monserrate peak + white sanctuary + cable car line, day/night cycle driven by `state.hour` (sun/hemisphere light, sky color, fog color, stars at night, city glow), rain particles when `state.raining` (starts 15:00, "llueve a las 3"), shadow camera follows `world.player.position`.

### Entities — `src/entities/vehicle.js`
```js
export const VEHICLE_TYPES = { taxi, sedan, moto, transmilagro, sitp, buseta, chiva, police, policeMoto } // each: {label, maxSpeed(m/s), accel, grip, mass, radius, length, color...}
export class Vehicle {
  constructor(scene, type, { x, z, heading = 0 })
  type; def; mesh; position /* === mesh.position */; heading; speed /* signed m/s forward */; velocity /* THREE.Vector3 */
  driver /* null | 'player' | 'ai' */; health /* 0..100 */; radius; isPolice; sirenOn; destroyed
  setControls({ throttle, steer, handbrake })   // throttle -1..1, steer -1..1 (+1 left)
  update(dt, world)    // arcade physics + collisions vs world.colliderGrid + vs other world.vehicles + wheel spin, body roll, skid marks, smoke when damaged, headlights at night, siren lights
  forward(out = new THREE.Vector3())
  damage(amount)       // emits 'vehicle:damaged'; at 0 → smoke + 'vehicle:destroyed' (cartoon explosion, no gore)
  setSiren(on)
  dispose()
}
```
Plates: player-stolen cars get `vehicle.plateDigit` for pico y placa.
### Entities — `src/entities/player.js`
```js
export class Player {
  constructor(scene)
  mesh; position; heading; vehicle /* Vehicle|null */; health
  update(dt, world)  // on foot: WASD camera-relative-free (tank-free) movement, Shift run, Space jump, animated low-poly rolo (ruana + sombrero vueltiao optional)
                     // F: enter nearest vehicle within 4 m (if AI-driven → carjack: driver ejected as ped, emits 'crime' {type:'carjack'}), F again: exit to driver side.
                     // in vehicle: input → vehicle.setControls; player mesh hidden
  get isDriving()
  get cameraTarget()  // { position: Vector3, heading, speed, isDriving }
}
```

### AI — `src/ai/traffic.js`, `src/ai/pedestrians.js`, `src/ai/police.js`
- `createTraffic(scene, net, { count = 40 })` → `{ update(dt, world) }` — spawns Vehicles (push into `world.vehicles` on first update), lane-following on the road graph with right-hand traffic, intersection turns, slowing behind cars/player, honking, TransMilagro buses only on Avenida Caracas median, recycles cars far from the player (keep ~count alive within 250 m).
- `createPedestrians(scene, net, { count = 60 })` → `{ update(dt, world), nearestTalkable(pos, maxDist) }` — Ped = `{ id, mesh, position, kind: 'vendor'|'walker'|'student'|'oficinista'|'abuela'|'policia', name, persona, knockedDown }`. Push into `world.peds`. Walk sidewalks, vendors with carts near landmarks (obleas, tinto, empanadas, mango biche), umbrellas when raining, flee when a car drives on the sidewalk, get knocked (cartoon ragdoll, stand up after 3 s) when hit by vehicle speed > 4 m/s → `events.emit('crime', {type:'hit_ped', ...})`.
- `createPolice(scene, net)` → `{ update(dt, world) }` — owns wanted level: listens to `'crime'` (carjack +1, hit_ped +1, hit_police +2, ram +0.5 accumulates). Sets `state.wanted` and emits `'wanted:change'`. Spawns police cars/motos (stars*2) at road nodes 120–200 m away, pursuit with prediction, siren on, roadblocks at 4+ stars. Wanted decays after 20 s out of sight. Busted: player stopped (speed < 1) within 6 m of police for 2 s → `'player:busted'` (lose 20% money, respawn). Pico y placa: if player drives a car whose plateDigit is restricted today between 6:00–21:00, police occasionally pull you over (+1 star "¡Tiene pico y placa, sumercé!").

### UI — `src/ui/hud.js`, `src/ui/minimap.js`, `src/ui/dialog.js`, `src/ui/title.js`
- `createHUD(root)` → `{ update(dt, world) }` — GTA-style HUD (top-right money `$ 50.000` in green Pricedown-like font, wanted ★ flashing, clock `14:30`, weather icon; bottom-left speedometer km/h + vehicle name + health/armor bars; zone/street name banner when changing district (GTA style big italic text); toast notifications from `'notify'` events; context prompts ("F — Robar taxi", "E — Hablar con Doña Gloria") from `'prompt'` events; "BUSTED"/"WASTED" style screens ("¡LO CAPTURARON!", "¡QUEDÓ PAILA!").
- `createMinimap(root, net)` → `{ update(dt, world) }` — round bottom-left radar rotating with player heading, pre-rendered roads, landmark icons, police blips flashing red/blue, north indicator.
- `createDialog(root)` → `{ update(dt, world) }` — listens `'npc:talk'` {ped}. Opens chat panel with portrait (`assets/portraits/<kind>.png`, fallback emoji), sets `state.dialogOpen = true`, text input, calls `npcTalk()` from `src/net/claude.js`, typewriter reply, Esc closes. Speech via `speechSynthesis` es-CO voice optional toggle.
- `createTitle(root)` → `Promise<void>` resolved on Enter/click: full-screen `assets/cover.png`, logo, "Presiona ENTER", controls card, loading tips. Plays nothing until user gesture (audio unlock).

### Audio — `src/audio/audio.js`
`createAudio()` → `{ unlock(), update(dt, world) }` — pure WebAudio synthesis: engine (rpm by speed, per vehicle type), tire screech on drift, horn (H), siren when police chasing, crash thuds, rain ambience, **radio stations** (Q cycles; `state.stationIndex`; procedural loops per genre: cumbia guacharaca + bass, vallenato accordion-ish saw lead, reggaetón dembow kick/snare, champeta, talk = DJ lines via `radioDJ()` spoken with speechSynthesis) only while driving. Emits `'notify'` with station name on change.

### Net — `src/net/claude.js` + `server/server.mjs`
- `export async function checkAI()` → `{ enabled, model }` (GET `/api/health`)
- `export async function npcTalk({ ped, history, message, context })` → `{ reply }` (POST `/api/npc`), offline fallback lines per kind when server/AI unavailable.
- `export async function radioDJ({ station, context })` → `{ line }` (POST `/api/radio`)
- Server: Node `http`, static file server for the project root + the 3 API routes, official `@anthropic-ai/sdk`, model from `CLAUDE_MODEL` (default `claude-opus-5-5`), key from `ANTHROPIC_API_KEY` (`.env`), works with NO key (health → enabled:false).

## Event catalog
| event | payload | emitted by |
|---|---|---|
| `crime` | `{type:'carjack'|'hit_ped'|'hit_police'|'ram'|'pico_placa'|'speeding', x, z}` | player, peds, vehicles, police |
| `wanted:change` | `{level}` | police |
| `money:change` | `{amount, delta, reason}` | state.addMoney |
| `vehicle:enter` / `vehicle:exit` | `{vehicle}` | player |
| `vehicle:damaged` | `{vehicle, amount}` / `vehicle:destroyed` `{vehicle}` | vehicle |
| `crash` | `{intensity 0..1, x, z}` | vehicle (for audio/camera shake) |
| `npc:talk` | `{ped}` | pedestrians (when player presses E near a talkable ped) |
| `prompt` | `{text}` or `{text:null}` to clear | player, pedestrians |
| `notify` | `{text, kind:'info'|'good'|'bad'}` | anyone |
| `district:change` | `{name}` | main.js |
| `player:busted` / `player:wasted` | `{}` | police / player |
| `radio:change` | `{station}` | audio |

## Controls
WASD/arrows drive/walk · Space handbrake/jump · Shift run · F enter/exit/robar · E hablar · Q radio · H pito · R voltear carro · C cámara · Esc cerrar diálogo
