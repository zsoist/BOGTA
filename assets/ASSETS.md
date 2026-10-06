# GTA Bogotá: generated image assets

All images generated with Codex CLI (`gpt-6-sol` image tool). Prompts: `docs/prompts/codex-prompts.md`.
Hi-res originals of textures and radio icons (1024px) are in `assets/_src/`.

| Path | Size | Purpose |
|---|---|---|
| `assets/textures/facade-colonial.png` | 512x512 | Game texture: La Candelaria colonial building facade (tileable horizontally) |
| `assets/textures/facade-brick.png` | 512x512 | Game texture: Bogotá red-brick apartment tower facade (tileable) |
| `assets/textures/facade-glass.png` | 512x512 | Game texture: modern glass office tower facade (tileable) |
| `assets/textures/facade-shops.png` | 512x512 | Game texture: ground-floor shopfront strip with parody signs (not tile-blended, keeps signs legible) |
| `assets/radio/tropicombo.png` | 256x256 | Radio wheel icon: Tropicombo 98.7 |
| `assets/radio/acordeon.png` | 256x256 | Radio wheel icon: El Acordeón Llorón |
| `assets/radio/perreadera.png` | 256x256 | Radio wheel icon: La Perreadera FM |
| `assets/radio/champeta.png` | 256x256 | Radio wheel icon: Champeta Picó Radio |
| `assets/radio/trancon.png` | 256x256 | Radio wheel icon: Trancón al Aire |
| `assets/ui/logo.png` | 1204x655 RGBA (true alpha) | Title/UI logo 'GTA BOGOTÁ', cropped to content, TRUE transparent PNG |
| `video/public/art/panel-01.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 1/8 (4:5) |
| `video/public/art/panel-02.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 2/8 (4:5) |
| `video/public/art/panel-03.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 3/8 (4:5) |
| `video/public/art/panel-04.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 4/8 (4:5) |
| `video/public/art/panel-05.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 5/8 (4:5) |
| `video/public/art/panel-06.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 6/8 (4:5) |
| `video/public/art/panel-07.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 7/8 (4:5) |
| `video/public/art/panel-08.png` | 1024x1280 (+ .jpg q88 copy) | Title-slam comic panel 8/8 (4:5) |
| `video/public/art/coldopen.png` | 1920x1080 (+ .jpg q88 copy) | Trailer cold open: rain-streaked window over night Bogotá |
| `video/public/art/makingof.png` | 1920x1080 (+ .jpg q88 copy) | Trailer making-of: Opus + 7 Sonnet robots building Bogotá on a laptop |
| `video/public/art/endcard.png` | 1920x1080 (+ .jpg q88 copy) | Trailer end card: night panorama, empty top-center for logo |
| `video/public/art/parallax-bg.png` | 1920x1080 (+ .jpg q88 copy) | 2.5D parallax back layer: sky + Cerros + Monserrate (opaque) |
| `video/public/art/parallax-mid.png` | 1920x1080 RGBA (true alpha) | 2.5D parallax mid layer: city skyline, TRUE transparent |
| `video/public/art/parallax-fg.png` | 1920x1080 RGBA (true alpha) | 2.5D parallax foreground: taxi + wet street, TRUE transparent |

Notes
- True transparency (RGBA): `assets/ui/logo.png`, `video/public/art/parallax-mid.png`, `video/public/art/parallax-fg.png`. Produced by generating on flat #FF00FF magenta and chroma-keying locally (the image tool does not output alpha reliably). Faint color fringing is possible on tiny splash droplets in parallax-fg.
- Radio icons are circular badges on a solid near-black (#0B0B0F) square background (not transparent).
- Textures `facade-colonial/brick/glass` were made seamless horizontally with a half-width offset crossfade (slight ghosting in the middle band); `facade-shops` is untouched to keep sign text crisp.
- Vertical panels (`panel-0N`) keep native 1024x1280; the .jpg copies are q88 (1920px wide for 16:9 art).
