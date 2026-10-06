# 🎬 GTA BOGOTÁ: tráiler en motion design (plan)

**Formato:** 90 s · 1920×1080 · 60 fps · H.264 alta calidad (CRF 16), más un corte vertical 1080×1920 de 30 s para redes.
**Herramienta:** **Remotion 4** (motion graphics en React, renderizado determinista frame a frame) + **ffmpeg** para el máster final.
**Idea central:** *"Una ciudad donde siempre llueve a las 3... construida en 90 minutos por 8 IAs."* Es tráiler de videojuego y making-of en una sola pieza.

---

## 1. Las 3 fuentes visuales

| Fuente | Cómo se obtiene | Por qué es premium |
|---|---|---|
| **Gameplay real** | Modo `?capture=1` en el juego: paso de tiempo fijo, `window.__capture.step()` y lectura del canvas frame a frame (PNG) con Playwright. Se ensambla con ffmpeg a 60 fps exactos | Tomas sin tirones ni frames perdidos, mucho más limpias que grabar la pantalla |
| **Tomas cinemáticas** | Rutas de cámara programadas en el juego (`?shot=monserrate-dolly`, `colpatria-night-orbit`, `caracas-chase`, `candelaria-crane`, `drift-lowangle`), con HUD apagado y profundidad de campo (BokehPass) | Planos tipo dron y "beauty shots" como en un tráiler de Rockstar |
| **Motion graphics** | Componentes en Remotion: tipografía cinética, paneles collage estilo portada GTA, diagramas animados, contadores, código tipeándose | El sello de motion design AAA |

Arte complementario: portada y loading screens de **Codex** (Ken Burns + parallax 2.5D por capas) y retratos de NPCs.

## 2. Audio

- **Música:** ElevenLabs Music. Track de tráiler de 90 s hecho a la medida que empieza con lluvia y acordeón suave, sube a **cumbia-trap épica** con tambora y bajo 808, tiene un break y cierra en clímax. Los cortes van sincronizados al beat (BPM fijo → marcadores de frame en Remotion).
- **Voz en off:** ElevenLabs TTS con una voz de narrador de tráiler en español, grave y cinematográfica.
- **SFX:** whooshes, impactos, sirena, pito, "cha-ching" (ElevenLabs SFX ya generados y nuevos "risers").

## 3. Estructura (90 s)

| Tiempo | Acto | Visual | VO / texto |
|---|---|---|---|
| 0:00–0:07 | **Cold open** | Negro. Lluvia sobre el lente y un rayo que deja ver los cerros. Reloj digital **14:59 → 15:00** | *"En Bogotá hay una sola ley..."* → **"SIEMPRE LLUEVE A LAS 3"** |
| 0:07–0:20 | **La ciudad** | Dolly a Monserrate, órbita nocturna a la Torre Colpatranca con LEDs, TransMilagro bajo la lluvia, crane sobre La Candelaria | *"2.640 metros más cerca de las estrellas... y del trancón."* |
| 0:20–0:24 | **Title slam** | Golpe de música. Collage de paneles estilo GTA que se arma panel por panel → logo **GTA BOGOTÁ** con glitch y lens flare | — |
| 0:24–0:50 | **Montaje de gameplay** (cortes al beat) | Robo del taxi ("¡Qué pena, veci!"), drift en la Caracas, motos zigzagueando, estrellas subiendo ★★★, persecución con sirenas, **"¡LO CAPTURARON!"**, chiva rumbera, pico y placa | Textos cinéticos: **ROBA · DERRAPA · HUYE · HABLA** |
| 0:50–1:02 | **Los NPCs hablan** | Pantalla dividida: el jugador le habla a Doña Gloria y aparecen burbujas de chat con la respuesta real de Claude y la forma de onda de la voz de ElevenLabs. Dial de la radio girando por las 5 emisoras | *"Cada bogotano tiene algo que decir."* |
| 1:02–1:20 | **Making-of** | Diagrama animado: **1 Opus 5.5 → 7 Sonnet 5.5**, cada agente como un nodo que se ilumina mientras se escribe su módulo. El contrato `CONTRACT.md` entra al cuadro, el código se tipea solo y suben los contadores (líneas de código, agentes, imágenes de Codex, pistas de ElevenLabs, **90 minutos**) | *"Un líder. Siete agentes. Noventa minutos."* |
| 1:20–1:30 | **Final** | Ráfaga de 8 hero shots en 2 segundos → logo → créditos | **"Hecho en el Claude Build Day Bogotá · Universidad Santo Tomás · 05.10.2026"** · Claude · Codex · ElevenLabs |

## 4. Lenguaje visual

- **Tipografía:** Bangers/Pricedown-like para los slams, Bebas Neue para los títulos e Inter para la UI y los datos.
- **Paleta:** negro tinta #0B0B0F, verde plata GTA #6FD36F y dorado #F5C518. Acentos de bandera (amarillo, azul y rojo) solo en transiciones.
- **Transiciones:** cortes de tinta con forma de pincelada, *whip pans* con motion blur, aperturas tipo "panel de cómic", barrido de lluvia.
- **Acabado:** grano de película, aberración cromática leve, viñeta, letterbox 2.39:1 en las tomas cinemáticas y relleno completo en los slams.
- **Ritmo:** toda animación con spring/easing personalizado y ningún movimiento lineal. Cortes en downbeats y movimientos internos en corcheas.

## 5. Pipeline y agentes

1. **Agente Captura:** agrega `?capture=1` + rutas de cámara al juego, scripts de Playwright para exportar cada toma a `video/footage/*.mp4`, y BokehPass opcional.
2. **Agente Motion (Remotion):** crea el proyecto `video/` con escenas por acto, `beats.ts` sincronizado al BPM, componentes reutilizables (PanelCollage, KineticText, AgentGraph, ChatBubbles, Counter, InkTransition) y placeholders hasta que llegue el footage.
3. **Agente Audio del tráiler:** música de 90 s, voz en off y risers con ElevenLabs, marcadores de beat y mezcla con ffmpeg (loudness −14 LUFS).
4. **Líder (Opus):** dirección, revisión frame a frame, render final `video/out/gta-bogota-trailer.mp4` + versión vertical.

**Dependencias:** las escenas de motion graphics y el audio pueden arrancar **ya**. Las tomas de gameplay necesitan el juego integrado (≈ 19:30).
**Render:** ~3–6 min en el M4 para 90 s a 1080p60.
