# FOOTAGE.md — tomas que necesita el tráiler

Formato de cada toma: **`video/public/footage/<slot>.mp4`**, 1920×1080, **60 fps exactos** (captura determinista `?capture=1`), H.264, sin audio (se ignora).
Todo el tráiler va a **100 BPM** → 1 beat = 36 frames, 1 compás = 144 frames. Los cortes caen en beats, así que **la duración usada empieza en el frame 0 de cada archivo** (más `trim` si el slot se reutiliza).
Graba **al menos la columna "Capturar"** (= frames usados + 30 frames de margen). Si el archivo es más corto, el tráiler lo repite en loop; si no existe, usa un Ken Burns de respaldo y se ve bien igual.
Después de dejar los archivos corre `npm run sync` (o cualquier render, ya lo hace solo).

_Generado por `npm run footage:doc` desde `src/footage.ts` + `src/shotlist.ts`._

| Slot (archivo) | Usado (frames) | Capturar (frames / seg) | Usos en el montaje | Movimiento de cámara |
|---|---|---|---|---|
| `monserrate-dolly.mp4`<br>_Monserrate al amanecer_ | 180 | **210** f · 3.5 s | Acto 2 · La ciudad (180f) | Dolly-in lento hacia el santuario blanco de Monserrate desde la Candelaria (cámara baja, 1.5 m, empuja 25 m hacia adelante). Hora 17:30, cielo naranja, sin HUD, DoF (BokehPass) con foco en el santuario. |
| `colpatria-night-orbit.mp4`<br>_Colpatranca de noche_ | 180 | **210** f · 3.5 s | Acto 2 · La ciudad (180f) | Órbita de 70° alrededor de la Torre Colpatranca con los LEDs en bandera, cámara a 60 m de altura, mirando hacia arriba 15°, llovizna. Sin HUD. |
| `caracas-chase.mp4`<br>_TransMilagro bajo la lluvia_ | 180 | **210** f · 3.5 s | Acto 2 · La ciudad (180f)<br>Acto 4 · Montaje · ROBA (72f)<br>Acto 4 · Montaje · DERRAPA (72f, desde +72f) | Cámara de persecución baja, 3 m detrás del taxi robado, corriendo por la Avenida Caracas junto al TransMilagro. Lluvia fuerte, 15:00, charcos reflejando. Con HUD apagado, FOV 80. |
| `candelaria-crane.mp4`<br>_La Candelaria (crane)_ | 180 | **210** f · 3.5 s | Acto 2 · La ciudad (180f) | Crane que baja desde 25 m hasta 2 m sobre las casitas coloniales de La Candelaria, mirando hacia la Plaza de Bolívar, atardecer. Sin HUD. |
| `drift-lowangle.mp4`<br>_Drift en la Caracas_ | 216 | **246** f · 4.1 s | Acto 4 · Montaje · DERRAPA (144f)<br>Acto 4 · Montaje · DERRAPA (72f, desde +144f) | Ángulo bajo (cámara a 0.4 m del piso, lateral), taxi derrapando de derecha a izquierda con humo de llantas y marcas, lluvia. Pasa a un metro de cámara. Sin HUD. |
| `carjack.mp4`<br>_Robo del taxi — "¡Qué pena, veci!"_ | 216 | **246** f · 4.1 s | Acto 4 · Montaje · ROBA (144f)<br>Acto 4 · Montaje · ROBA (72f, desde +144f) | Cámara tercera persona sobre el hombro, jugador corre al taxi, el conductor se baja indignado, el jugador entra y arranca. Plano medio, con HUD del juego activado. |
| `police-chase.mp4`<br>_Persecución con sirenas_ | 504 | **534** f · 8.9 s | Acto 4 · Montaje · HUYE (108f)<br>Acto 4 · Montaje · HUYE (108f, desde +108f)<br>Acto 4 · Montaje · HUYE (72f, desde +216f)<br>Acto 4 · Montaje · HUYE (72f, desde +288f)<br>Acto 4 · Montaje (144f, desde +360f) | Cámara trasera estándar del juego durante persecución a 3 estrellas: patrullas con sirenas detrás, Torre Colpatranca al fondo, derrapes en esquinas, el jugador es rodeado y se detiene (busted). 8+ segundos, HUD del juego activado. |
| `npc-talk.mp4`<br>_Hablando con Doña Gloria_ | 216 | **246** f · 4.1 s | Acto 4 · Montaje · HABLA (216f) | Cámara de diálogo: plano medio de Doña Gloria (vendedora de empanadas) con el jugador de espaldas a cuadro, lluvia, La Candelaria. Empuje lento. HUD y panel de diálogo del juego activados. |
| `chiva.mp4`<br>_Chiva rumbera / pico y placa_ | 288 | **318** f · 5.3 s | Acto 4 · Montaje (144f)<br>Acto 4 · Montaje (72f, desde +144f)<br>Acto 4 · Montaje (72f, desde +216f) | Cámara lateral paralela a la chiva rumbera (colores, luces) en travelling a su velocidad, 5 m de distancia, y luego el retén de "pico y placa" en un cruce. Atardecer. |
| `hero-01.mp4`<br>_Hero shot 1_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | Plano bajo del taxi saltando una loma, polvo y lluvia. |
| `hero-02.mp4`<br>_Hero shot 2_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | Moto Rapidín zigzagueando entre carros, cámara lateral. |
| `hero-03.mp4`<br>_Hero shot 3_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | Estrellas de búsqueda en el HUD y patrulla cruzando frente a cámara. |
| `hero-04.mp4`<br>_Hero shot 4_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | TransMilagro pasando frente a cámara, whip. |
| `hero-05.mp4`<br>_Hero shot 5_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | Plaza de Bolívar con palomas levantando vuelo, crane bajo. |
| `hero-06.mp4`<br>_Hero shot 6_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | Drift 360° en rotonda, cámara cenital 45°. |
| `hero-07.mp4`<br>_Hero shot 7_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | Chiva rumbera de frente, luces encendidas. |
| `hero-08.mp4`<br>_Hero shot 8_ | 18 | **48** f · 0.8 s | Acto 7 · Ráfaga final (18f) | Plano final: taxi frente a la Santo Tomás con el logo del Build Day, cámara hacia atrás. |

## Notas para el agente de captura
- **HUD:** tomas `carjack`, `police-chase`, `npc-talk`, `hero-0N` con HUD del juego encendido (el tráiler no dibuja HUD encima cuando existe el video). Las tomas de ciudad (`monserrate-dolly`, `colpatria-night-orbit`, `caracas-chase`, `candelaria-crane`) sin HUD y con DoF.
- **Cinemáticas 2.39:1:** el tráiler hace el letterbox, así que captura en 16:9 completo.
- **Hero shots:** cada uno se ve solo 18 frames (0.3 s) pero capturar 36+30 frames deja margen para ajustar el corte.
- **Beat:** si puedes, haz que el momento de mayor impacto de cada toma (derrape, choque, salto) caiga en el frame 72 o 108 (beat 2 / beat 3) de la toma, porque es donde corta la música.
- Nombres exactos, minúsculas, `.mp4`. Copia a `video/public/footage/`.
