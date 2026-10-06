# 🚕 GTA BOGOTÁ — Prompt maestro

> Construido en el **Claude Build Day Bogotá** (5 oct 2026 · Universidad Santo Tomás) con **Claude Opus 5.5** como líder y **7 agentes Sonnet 5.5** en paralelo.
> Track: **Delight**: algo que sorprenda, bonito y divertido, que antes no habría quedado así de bien ni tan rápido.

---

## El prompt

```
Eres un estudio de videojuegos AAA comprimido en un equipo de agentes. Construye "GTA BOGOTÁ":
un juego de mundo abierto free-roam, 3D low-poly, que corre en el navegador, parodia cariñosa de
Grand Theft Auto ambientada en Bogotá, Colombia.

VISIÓN
- Que alguien abra el link y en 10 segundos diga "¡uy, eso es Bogotá!": los Cerros Orientales al
  oriente con Monserrate y su santuario blanco, el TransMilagro rojo por la Caracas, taxis amarillos
  por todas partes, la Torre Colpatranca cambiando de colores de noche, ladrillo rojo en Chapinero,
  casitas coloniales de colores en La Candelaria y la lluvia de las 3 de la tarde.
- Tono: humor rolo, PG-13, sin armas ni narcos. El caos viene de robar carros, atropellar gente
  (se caen como en caricatura y se vuelven a parar), pasarse el pico y placa y huirle a la policía.

STACK
- Vanilla ES modules sin bundler. Three.js 0.186.1 por import map. Física arcade propia, sin librerías.
- Node server sin frameworks: archivos estáticos + proxy a Claude (SDK oficial @anthropic-ai/sdk,
  modelo claude-opus-5-5, effort low) + proxy de voces a ElevenLabs. Las keys solo viven en .env.
- Música, voces y efectos generados con ElevenLabs (Music, TTS, SFX). Arte 2D generado con Codex
  (gpt-image vía la suscripción de ChatGPT).

MAPA (Bogotá real, estilizada)
- +X = oriente (cerros), -Z = norte. Las Calles crecen hacia el norte y las Carreras hacia el occidente.
- Grid de 12×18 cuadras de 64 m. Avenidas: Caracas (con carril de TransMilagro), Séptima, Calle 26
  y Calle 72. Barrios de sur a norte: La Candelaria → Centro Internacional → Teusaquillo →
  Chapinero → Zona T → Chicó/Parque 93 → Usaquén.
- Hitos: Plaza de Bolívar, Torre Bacatanga, Torre Colpatranca, Torres del Parque, U. Santo Tomás
  (aquí empiezas, ¡es el Build Day!), Zona T, Parque 93, Usaquén, El Campín, Parque Simón Bolívar,
  Monserrate.

GAMEPLAY
- A pie: caminar, correr y saltar. F para robar el carro más cercano: si tiene conductor, este se
  baja indignado ("¡Qué pena, veci, necesito el carro!").
- Vehículos: taxi, sedán, moto de domicilios Rapidín, TransMilagro articulado, SITPaciencia, buseta,
  chiva rumbera y patrulla y moto de policía. Manejo jugoso con drift, freno de mano, inclinación de
  carrocería, marcas de llanta, humo y daño.
- Ciudad viva: tráfico por la derecha, motos zigzagueando, busetas, peatones con paraguas cuando
  llueve, vendedores (obleas, tinto, empanadas, mango biche) y abuelas.
- Nivel de búsqueda de 0 a 5 ★: persecución con predicción, retenes y "¡Alto ahí, sumercé!".
  Si te atrapan sale "¡LO CAPTURARON!"; si mueres, "¡QUEDÓ PAILA!".
- Pico y placa real: tu placa termina en un dígito, y en días pares o impares la policía te para.
- Hablar con cualquier NPC (tecla E): conversación libre con Claude, en personaje, con contexto
  (barrio, hora, lluvia, tus estrellas, el carro en que llegaste) y con voz de ElevenLabs.
- Radio (Q) al manejar: Tropicombo 98.7 (cumbia), El Acordeón Llorón (vallenato), La Perreadera FM,
  Champeta Picó Radio y "Trancón al Aire", con un locutor de Claude que inventa noticias de tráfico.
- Ciclo día/noche (1 s real = 1 min de juego). Llueve a las 3. Las luces de la ciudad se prenden de noche.

CALIDAD
- Premium: 60 fps en un MacBook (InstancedMesh, geometrías mergeadas, cero allocations por frame),
  HUD estilo GTA (plata en verde, estrellas, radar circular, banners de barrio), cero errores en
  consola, y todo con fallback: sin keys el juego sigue funcionando con diálogos offline y música
  procedural.

ARQUITECTURA (contrato primero, agentes en paralelo)
- docs/CONTRACT.md fija las coordenadas, las APIs exactas de cada módulo, el orden de update y el
  catálogo de eventos.
- Agentes: Mundo + Cielo | Vehículos + Jugador | IA (tráfico, peatones, policía) |
  UI (HUD, radar, diálogo, título) | Audio (synth + radio) | Servidor + Claude + arte Codex |
  ElevenLabs (música, voces, SFX).
- El líder escribe el núcleo (config, eventos, estado, input, colisiones, main.js), integra y prueba.
```

---

## Cómo correrlo

```bash
cp .env.example .env   # pega ANTHROPIC_API_KEY (y ELEVENLABS_API_KEY)
npm install
npm start              # → http://localhost:5173
```

## Guion de demo (2 min)

1. **0:00**: Título con la portada de Codex y el tema de ElevenLabs. ENTER.
2. **0:15**: Apareces frente a la Santo Tomás. Robas el taxi (F) y prendes la radio (Q) en Tropicombo.
3. **0:40**: Drift por la Caracas al lado del TransMilagro. Atropellas sin querer a un señor (se
   vuelve a parar) y te ganas 1 ★.
4. **1:00**: Persecución: sirenas, la Torre Colpatranca de fondo y llega la lluvia de las 3.
5. **1:25**: Te bajas en La Candelaria y le hablas (E) a Doña Gloria la de las empanadas, que
   responde con Claude y voz de ElevenLabs y sabe que la policía te viene siguiendo.
6. **1:50**: "Trancón al Aire" reporta tu persecución en vivo. Cierre.
