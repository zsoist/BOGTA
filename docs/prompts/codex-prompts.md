# Codex prompt library (GTA Bogotá)

Command template (model must be `gpt-6-sol`):

```
cd "<project root>" && codex exec --skip-git-repo-check -m gpt-6-sol -s workspace-write "Use your image generation tool to create ONE image: <PROMPT>. Save the final PNG to ./<path> (copy it from wherever the tool writes it). Reply only with the saved path."
```

Run up to 4 in parallel. Post-processing (resize with PIL/sips, chroma-key #FF00FF to alpha, seamless crossfade, JPEG q88) is described in `assets/ASSETS.md`.

## Prompting notes (what worked)
- Structure: subject, composition, camera/framing, lighting, style, palette, constraints (as in the preamble).
- Put requested text in quotes, say "spelled exactly as quoted", and forbid any other text. Accents rendered correctly.
- Transparent assets: ask for one flat solid #FF00FF background, forbid magenta in the subject, then key it out locally.
- State aspect ratio and pixel size in words; the tool snaps to its nearest supported size.

## Style preamble (shared by ALL prompts, prepended verbatim)

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes.
```

## Prompts
Each final prompt below is exactly: `<preamble> <body> <aspect>`.

### facade-colonial
Output: `assets/textures/facade-colonial.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Game texture: perfectly flat front orthographic elevation, camera straight-on at the wall, zero perspective, no sky, no ground, no people, fills the entire square frame edge to edge, soft even daylight with no cast shadows, seamlessly tileable horizontally (left and right edges match). Subject: La Candelaria colonial facade, a row of adjoining Spanish-colonial houses with colorful stucco walls (ochre, terracotta, teal, mustard, pink-red), white trim, carved dark-brown wooden balconies with flower pots, green wooden doors and shuttered windows, aged plaster details. Square 1:1, 1024x1024.
```

### facade-brick
Output: `assets/textures/facade-brick.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Game texture: perfectly flat front orthographic elevation, camera straight-on at the wall, zero perspective, no sky, no ground, no people, fills the entire square frame edge to edge, soft even daylight with no cast shadows, seamlessly tileable horizontally (left and right edges match). Subject: Bogota red-brick apartment tower facade, warm red-brown brick with a regular grid of rectangular windows with concrete frames, small balconies with metal railings, a few lit warm-yellow windows, subtle brick pattern and weathering. Square 1:1, 1024x1024.
```

### facade-glass
Output: `assets/textures/facade-glass.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Game texture: perfectly flat front orthographic elevation, camera straight-on at the wall, zero perspective, no sky, no ground, no people, fills the entire square frame edge to edge, soft even daylight with no cast shadows, seamlessly tileable horizontally (left and right edges match). Subject: modern glass office tower curtain-wall facade, teal-blue reflective glass panels in a precise grid with thin aluminum mullions and horizontal floor bands, soft sky reflections and faint cloud reflections, a few lit office windows. Square 1:1, 1024x1024.
```

### facade-shops
Output: `assets/textures/facade-shops.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Game texture: perfectly flat front orthographic elevation, camera straight-on at the wall, zero perspective, no sky, no ground, no people, fills the entire square frame edge to edge, soft even daylight with no cast shadows, seamlessly tileable horizontally (left and right edges match). Subject: a ground-floor shopfront strip of four adjoining colorful storefronts side by side, each with roll-up metal shutters half open, big display windows and a bold hand-painted sign above, in this order left to right: 'Tinto Don Aurelio' (coffee cart cafe, brown and cream), 'Corrientazo Doña Gloria' (lunch restaurant, red and yellow), 'Panadería La Almojábana Feliz' (bakery, warm orange), 'Supermercado El Exitazo' (supermarket, bright green and white). Sign lettering must be large, bold, perfectly legible, spelled exactly as quoted including accents, in a clean sans-serif or painted sign style. Only these four signs contain text. Square 1:1, 1024x1024.
```

### tropicombo
Output: `assets/radio/tropicombo.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Icon: square radio-station badge icon in GTA radio-wheel style. A bold circular emblem centered on a solid near-black #0B0B0F background, with a tropical sunburst with a stylized cumbia drum and palm leaves. Palette: hot orange, sun yellow, turquoise. Thick bold white outline ring, glossy faceted look, strong simple shapes readable at 128 px. The station name text 'Tropicombo 98.7' in heavy bold sans-serif lettering, perfectly legible and spelled exactly as quoted, placed on the badge. No other text. Square 1:1, 1024x1024.
```

### acordeon
Output: `assets/radio/acordeon.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Icon: square radio-station badge icon in GTA radio-wheel style. A bold circular emblem centered on a solid near-black #0B0B0F background, with a red accordion with a single blue teardrop crying from it and small musical notes. Palette: deep red, cream, sky blue. Thick bold white outline ring, glossy faceted look, strong simple shapes readable at 128 px. The station name text 'El Acordeón Llorón' in heavy bold sans-serif lettering, perfectly legible and spelled exactly as quoted, placed on the badge. No other text. Square 1:1, 1024x1024.
```

### perreadera
Output: `assets/radio/perreadera.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Icon: square radio-station badge icon in GTA radio-wheel style. A bold circular emblem centered on a solid near-black #0B0B0F background, with a neon speaker cone with a cartoon hot-pink and purple flame, reggaeton party vibe. Palette: electric purple, hot pink, lime accents. Thick bold white outline ring, glossy faceted look, strong simple shapes readable at 128 px. The station name text 'La Perreadera FM' in heavy bold sans-serif lettering, perfectly legible and spelled exactly as quoted, placed on the badge. No other text. Square 1:1, 1024x1024.
```

### champeta
Output: `assets/radio/champeta.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Icon: square radio-station badge icon in GTA radio-wheel style. A bold circular emblem centered on a solid near-black #0B0B0F background, with a giant colorful picó sound-system speaker tower painted with Caribbean folk art patterns. Palette: green, yellow, red, blue Caribbean palette. Thick bold white outline ring, glossy faceted look, strong simple shapes readable at 128 px. The station name text 'Champeta Picó Radio' in heavy bold sans-serif lettering, perfectly legible and spelled exactly as quoted, placed on the badge. No other text. Square 1:1, 1024x1024.
```

### trancon
Output: `assets/radio/trancon.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Icon: square radio-station badge icon in GTA radio-wheel style. A bold circular emblem centered on a solid near-black #0B0B0F background, with a yellow taxi stuck in traffic with a broadcast antenna, red brake lights and a traffic cone, news-bulletin feel. Palette: yellow, red, dark navy. Thick bold white outline ring, glossy faceted look, strong simple shapes readable at 128 px. The station name text 'Trancón al Aire' in heavy bold sans-serif lettering, perfectly legible and spelled exactly as quoted, placed on the badge. No other text. Square 1:1, 1024x1024.
```

### logo
Output: `assets/ui/logo.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Logo lettering: the title 'GTA BOGOTÁ' as a stacked game logo, 'GTA' on top in heavy blocky bold white pixel-slab font (Pricedown-like, GTA franchise-parody lettering), 'BOGOTÁ' below in the same heavy blocky font in a golden-yellow to orange vertical gradient, with the accent (acute accent) over the final A clearly visible, subtle thick black outline around all letters, slight faceted low-poly shading, centered. Spelled exactly 'GTA' and 'BOGOTÁ'. No other text, no decoration, no scene. Background: one single perfectly flat solid pure magenta #FF00FF color, no gradient, no shadow on the background, no magenta anywhere in the subject, crisp clean edges.  Landscape 3:2, 1536x1024.
```

### panel-01
Output: `video/public/art/panel-01.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: a yellow taxi drifting sideways through rain on Carrera Séptima in downtown Bogotá, water spray, wet street reflections, colonial buildings and Cerros Orientales behind. Vertical 4:5, 1024x1280.
```

### panel-02
Output: `video/public/art/panel-02.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: a red articulated TransMilagro bus arriving at a modern glass TransMilenio-style station in drizzle, passengers with umbrellas, glowing windows. Vertical 4:5, 1024x1280.
```

### panel-03
Output: `video/public/art/panel-03.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: a sweet smiling abuela with grey braided hair and a colorful ruana offering a steaming cup of chocolate con queso on a tray, warm cozy colonial street, rain outside. Vertical 4:5, 1024x1280.
```

### panel-04
Output: `video/public/art/panel-04.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: a green-and-white police patrol car chasing at night with bright red and blue flashing lights, wet street, motion blur, city lights, no people visible. Vertical 4:5, 1024x1280.
```

### panel-05
Output: `video/public/art/panel-05.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: a multicolor painted chiva rumbera party bus with festive string lights, colorful stripes and happy partygoers waving from the roof, night street in Zona Rosa. Vertical 4:5, 1024x1280.
```

### panel-06
Output: `video/public/art/panel-06.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: the white Monserrate sanctuary church on top of the green mountain at golden hour, Bogota city sprawl below in warm amber light, dramatic clouds. Vertical 4:5, 1024x1280.
```

### panel-07
Output: `video/public/art/panel-07.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: a Torre Colpatria-style skyscraper with a rainbow LED-lit facade glowing at night above the city, moody rainy sky, reflections on wet streets. Vertical 4:5, 1024x1280.
```

### panel-08
Output: `video/public/art/panel-08.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: vertical 4:5 comic-collage panel, dramatic hero framing, strong foreground-to-background depth, ink-black thin border feel, no text. Subject: a friendly street vendor selling obleas from a wooden cart with a big colorful umbrella in the rain, bright spots of color, warm lantern light, colonial street. Vertical 4:5, 1024x1280.
```

### coldopen
Output: `video/public/art/coldopen.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Composition: extreme close-up of a rain-streaked window pane in the foreground with large sharp water droplets and streaks, behind it a dark out-of-focus Bogotá skyline at night with the Cerros Orientales silhouette and Monserrate faintly lit, a lightning bolt in the sky lighting the clouds. Moody teal and orange color grade, cinematic shallow depth of field, lots of dark negative space. No text.  Landscape 16:9, 1920x1080.
```

### makingof
Output: `video/public/art/makingof.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Scene: eight friendly cute low-poly robots with big expressive eyes building a miniature low-poly Bogotá city (tiny Monserrate, Torre Colpatria-like tower, yellow taxis, red bus) that rises from the screen of a giant open laptop sitting on a university classroom desk. One larger leader robot glowing warm orange stands at the center directing the others (it is 'Opus'); seven smaller robots glowing blue work around it (they are 'Sonnet'). Classroom background: rows of desks, a window, chalkboard, warm golden light, cozy and joyful. No text on screen or on robots.  Landscape 16:9, 1920x1080.
```

### endcard
Output: `video/public/art/endcard.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Scene: wide night panorama of low-poly Bogotá spreading across the valley, thousands of warm window lights, the Cerros Orientales as a dark ridge with Monserrate sanctuary brightly lit on top, Torre Colpatria-like tower with colorful LEDs, a thin layer of mist, deep indigo to teal sky with a few stars. The top-center third of the image is calm empty dark sky reserved for a logo (nothing in it). No text.  Landscape 16:9, 1920x1080.
```

### parallax-bg
Output: `video/public/art/parallax-bg.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Scene: background layer for a parallax effect: moody dusk sky with soft clouds, the layered green Cerros Orientales mountains with misty ridgelines, and the white Monserrate sanctuary on the peak. Absolutely no city, no buildings other than Monserrate, no foreground, no people; the bottom edge fades into mist so it can sit behind other layers. No text.  Landscape 16:9, 1920x1080.
```

### parallax-mid
Output: `video/public/art/parallax-mid.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Scene: middle layer for a parallax effect: only a wide Bogotá city skyline of low-poly buildings (Torre Colpatria-like tower, glass towers, red-brick apartment blocks, church towers) standing along the bottom, the buildings' bases cut off flat at the bottom edge of the image, nothing above the buildings. Background: one single perfectly flat solid pure magenta #FF00FF color, no gradient, no shadow on the background, no magenta anywhere in the subject, crisp clean edges. Rainy dusk lighting on the buildings with a few warm lit windows; avoid pink and magenta colors on the buildings. No sky, no mountains, no ground, no text.  Landscape 16:9, 1920x1080.
```

### parallax-fg
Output: `video/public/art/parallax-fg.png`

```
Style: premium low-poly faceted 3D illustration in the look of a stylized game cinematic: crisp triangular facets and flat-shaded planes visible on all surfaces, bold saturated colors, polished GTA loading-screen key-art energy, rainy Andean light of Bogota (cool teal-grey overcast sky with warm amber street-light glow, wet reflective surfaces). Constraints: no real brand logos, no weapons, no real or recognizable people, no watermark, no signature, no extra or garbled text anywhere except text explicitly requested in quotes. Scene: foreground layer for a parallax effect: a yellow low-poly taxi seen from a low three-quarter front angle on a wet asphalt street with puddles and bright reflections and splashes, occupying the lower half of the frame, with a small curb and lamp post at the right edge. Background: one single perfectly flat solid pure magenta #FF00FF color, no gradient, no shadow on the background, no magenta anywhere in the subject, crisp clean edges. The area above the taxi is empty background color. Avoid pink and magenta colors on the subject. No sky, no buildings, no text.  Landscape 16:9, 1920x1080.
```

