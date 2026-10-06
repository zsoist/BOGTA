// GTA Bogotá — shared world constants + road network.
// COORDINATES (meters, Y up):  +X = EAST (toward the Cerros Orientales / Monserrate)
//                              -Z = NORTH (Calles grow northward), +Z = SOUTH
// Carreras run north-south (fixed X), Calles run east-west (fixed Z).
// HEADING convention (all entities): mesh.rotation.y = heading; models are built facing -Z.
//   forward = (-sin(h), 0, -cos(h)). heading 0 = facing north.

export const BLOCK = 64;          // distance between parallel road centerlines
export const COLS = 12;           // blocks along X
export const ROWS = 18;           // blocks along Z
export const MIN_X = -(COLS * BLOCK) / 2;   // -384 (west edge)
export const MAX_X = (COLS * BLOCK) / 2;    //  384 (east edge, foot of the cerros)
export const MIN_Z = -(ROWS * BLOCK) / 2;   // -576 (north edge)
export const MAX_Z = (ROWS * BLOCK) / 2;    //  576 (south edge)
export const ROAD_WIDTH = 12;     // normal street (1 lane each way + margins)
export const AVENUE_WIDTH = 20;   // avenues (2 lanes each way)
export const SIDEWALK = 3;        // sidewalk width on each side of a road
export const LANE_OFFSET = 3;     // lane center offset to the RIGHT of travel direction (Colombia drives on the right)

// Carreras: index 0 = west edge ... index COLS = east edge (numbers grow WESTWARD, so east is the lowest).
export const CARRERAS = [
  'Avenida Boyacá', 'Avenida 68', 'Carrera 30 (NQS)', 'Carrera 24', 'Carrera 19', 'Carrera 15',
  'Avenida Caracas', 'Carrera 13', 'Carrera 11', 'Carrera 9', 'Carrera Séptima', 'Carrera 5', 'Avenida Circunvalar',
];
export const CARRERA_AVENUES = new Set([6, 10]); // Caracas (TransMilagro median), Séptima

// Calles: index 0 = north edge ... index ROWS = south edge.
export const CALLES = [
  'Calle 140', 'Calle 127', 'Calle 116', 'Calle 100', 'Calle 93', 'Calle 85', 'Calle 80', 'Calle 72',
  'Calle 63', 'Calle 57', 'Calle 53', 'Calle 45', 'Calle 39', 'Calle 32', 'Calle 26', 'Calle 19',
  'Calle 13 (Jiménez)', 'Calle 10', 'Calle 6',
];
export const CALLE_AVENUES = new Set([7, 14]); // Calle 72, Calle 26

export const carreraX = (i) => MIN_X + i * BLOCK;
export const calleZ = (j) => MIN_Z + j * BLOCK;

// Neighborhoods by Z range (used by HUD zone label + NPC context).
export const DISTRICTS = [
  { name: 'Usaquén', minZ: MIN_Z, maxZ: -352 },
  { name: 'Chicó / Parque 93', minZ: -352, maxZ: -256 },
  { name: 'Zona T', minZ: -256, maxZ: -128 },
  { name: 'Chapinero', minZ: -128, maxZ: 128 },
  { name: 'Teusaquillo', minZ: 128, maxZ: 320 },
  { name: 'Centro Internacional', minZ: 320, maxZ: 448 },
  { name: 'La Candelaria', minZ: 448, maxZ: MAX_Z + 1 },
];
export const districtAt = (z) => (DISTRICTS.find((d) => z >= d.minZ && z < d.maxZ) || DISTRICTS[3]).name;

// Landmarks (center of the block they occupy). radius = trigger/footprint radius.
export const LANDMARKS = [
  { id: 'plaza_bolivar', name: 'Plaza de Bolívar', x: 224, z: 480, radius: 26, icon: '🏛️' },
  { id: 'candelaria', name: 'La Candelaria', x: 352, z: 544, radius: 26, icon: '🎨' },
  { id: 'bacata', name: 'Torre Bacatanga', x: 352, z: 416, radius: 18, icon: '🏙️' },
  { id: 'colpatria', name: 'Torre Colpatranca', x: 288, z: 352, radius: 16, icon: '🌈' },
  { id: 'torres_parque', name: 'Torres del Parque', x: 352, z: 288, radius: 22, icon: '🧱' },
  { id: 'santo_tomas', name: 'Universidad Santo Tomás (Build Day!)', x: 224, z: -160, radius: 22, icon: '🎓' },
  { id: 'zona_t', name: 'Zona T', x: 96, z: -288, radius: 24, icon: '🍻' },
  { id: 'parque93', name: 'Parque 93', x: 160, z: -352, radius: 24, icon: '🌳' },
  { id: 'usaquen', name: 'Usaquén', x: 288, z: -512, radius: 24, icon: '⛪' },
  { id: 'campin', name: 'Estadio El Campín', x: -224, z: 32, radius: 26, icon: '⚽' },
  { id: 'simon_bolivar', name: 'Parque Simón Bolívar', x: -320, z: -96, radius: 50, icon: '🦆' },
  { id: 'monserrate', name: 'Monserrate', x: 560, z: 440, radius: 40, icon: '⛰️' }, // on the mountain, east of the map
];

// Mountains (Cerros Orientales) start just east of MAX_X. Monserrate peak lives at LANDMARKS.monserrate.
export const CERROS_START_X = MAX_X + 30;
export const MONSERRATE_HEIGHT = 220;

// Time: 1 real second = 1 game minute (24 real minutes per day). Rain starts at 15:00 ("llueve a las 3").
export const GAME_MINUTES_PER_SECOND = 1;
export const START_HOUR = 14.5;

export const RADIO_STATIONS = [
  { id: 'off', name: 'Radio apagada' },
  { id: 'tropicombo', name: 'Tropicombo 98.7', genre: 'cumbia', bpm: 100 },
  { id: 'acordeon', name: 'Vallenato Stereo — El Acordeón Llorón', genre: 'vallenato', bpm: 115 },
  { id: 'perreadera', name: 'La Perreadera FM', genre: 'reggaeton', bpm: 95 },
  { id: 'champeta', name: 'Champeta Picó Radio', genre: 'champeta', bpm: 125 },
  { id: 'trancon', name: 'Trancón al Aire (noticias)', genre: 'talk', bpm: 0 },
];

// ---------- Road network (shared by city, traffic, police, minimap) ----------
// nodes: intersections {id, i, j, x, z, neighbors:[nodeId]}
// roads: [{axis:'x'|'z', coord, name, width, avenue, index}]  axis 'x' = carrera (constant X), 'z' = calle (constant Z)
export function buildRoadNetwork() {
  const roads = [];
  for (let i = 0; i <= COLS; i++) {
    const avenue = CARRERA_AVENUES.has(i);
    roads.push({ axis: 'x', index: i, coord: carreraX(i), name: CARRERAS[i], avenue, width: avenue ? AVENUE_WIDTH : ROAD_WIDTH });
  }
  for (let j = 0; j <= ROWS; j++) {
    const avenue = CALLE_AVENUES.has(j);
    roads.push({ axis: 'z', index: j, coord: calleZ(j), name: CALLES[j], avenue, width: avenue ? AVENUE_WIDTH : ROAD_WIDTH });
  }
  const nodes = [];
  const id = (i, j) => j * (COLS + 1) + i;
  for (let j = 0; j <= ROWS; j++) {
    for (let i = 0; i <= COLS; i++) {
      const neighbors = [];
      if (i > 0) neighbors.push(id(i - 1, j));
      if (i < COLS) neighbors.push(id(i + 1, j));
      if (j > 0) neighbors.push(id(i, j - 1));
      if (j < ROWS) neighbors.push(id(i, j + 1));
      nodes.push({ id: id(i, j), i, j, x: carreraX(i), z: calleZ(j), neighbors });
    }
  }
  const nodeAt = (i, j) => nodes[id(i, j)];
  // Nearest intersection node to a world position.
  const nearestNode = (x, z) => {
    const i = Math.max(0, Math.min(COLS, Math.round((x - MIN_X) / BLOCK)));
    const j = Math.max(0, Math.min(ROWS, Math.round((z - MIN_Z) / BLOCK)));
    return nodeAt(i, j);
  };
  // Is (x,z) on a road surface? Returns the road or null.
  const roadAt = (x, z) => {
    for (const r of roads) {
      const d = r.axis === 'x' ? Math.abs(x - r.coord) : Math.abs(z - r.coord);
      const along = r.axis === 'x' ? z : x;
      const inside = r.axis === 'x' ? along >= MIN_Z - 10 && along <= MAX_Z + 10 : along >= MIN_X - 10 && along <= MAX_X + 10;
      if (inside && d <= r.width / 2) return r;
    }
    return null;
  };
  return { roads, nodes, nodeAt, nearestNode, roadAt };
}
