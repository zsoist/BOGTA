// Browser client for the Claude-powered API. Never throws: falls back to offline lines so the game stays fun without a key.
const TIMEOUT_MS = 20000;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lastPicked = new Map();
function pickFresh(key, arr) {
  let line = pick(arr);
  for (let i = 0; i < 3 && line === lastPicked.get(key); i++) line = pick(arr);
  lastPicked.set(key, line);
  return line;
}

// ---------- offline banks ----------
const NPC_LINES = {
  vendor: [
    '¡A la orden, a la orden! Tinto calientico, empanada a dos mil, ¿qué le provoca, veci?',
    'Lléveme una oblea con arequipe, que hoy está regalada... bueno, casi regalada, sumercé.',
    'Mango biche con sal y limón, ¡para que se le despierte hasta el alma!',
    'Ayer vendí tanto que hoy me toca madrugar al doble. ¡Y todavía no llueve!',
    'Si ve policía, me avisa, ¿sí? Que mi carrito no tiene permiso ni para respirar.',
    'Mazorca asadita, mazorca con mantequilla... ¡mazorca para el frío rolo!',
  ],
  walker: [
    '¿Qué más, parce? Qué frío tan bravo el de hoy, ¿no?',
    'Esa ruana no es moda, es supervivencia. Aquí llueve a las tres y uno nunca aprende.',
    'Tranquilo, sumercé, que en Bogotá todo se demora, hasta el semáforo en verde.',
    'Vea, cuidado con el hueco de la esquina, que ya tiene hasta nombre y apellido.',
    'Yo solo voy a coger el TransMilagro, pero va tan lleno que mejor camino.',
    'Qué chimba de ciudad, aunque uno viva en trancón permanente.',
  ],
  student: [
    '¡Parce, llegué tarde otra vez! El profe me va a matar... con una tarea más.',
    'Tengo parcial a las siete y no he leído ni el título. Chévere todo.',
    'Estudiar en Santo Tomás es bacano, lo duro es el bus de ida y vuelta.',
    '¿Hacemos vaca para unas onces? Me quedan mil quinientos pesos.',
    'Ese Build Day de la U está buenísimo, hay robots y todo. ¡Pásese!',
    'Mi mochila pesa más que mi autoestima. Pero seguimos, ¿no?',
  ],
  oficinista: [
    'Perdone, voy tarde a una reunión que pudo ser un correo. ¡Con permiso!',
    'Hoy me toca pico y placa y mi jefe cree que el carro vuela.',
    'Mi corrientazo de Doña Gloria es lo único que me mantiene cuerdo, veci.',
    'Llevo veinte minutos en la fila del TransMilagro. Veinte. Minutos. Sumercé.',
    'Traje paraguas, así que obviamente hoy no llueve. La vida es paila.',
    'Una agenda llena, el café frío y el jefe preguntando por el informe. Todo normal.',
  ],
  abuela: [
    'Ay, mijito, ¿ya almorzó? Venga le doy un pan de yuca, mi vida.',
    'Cuídese en la calle, que los carros hoy andan como locos, ¡Dios guarde!',
    'En mis tiempos, la Séptima era pura calma y chocolate con queso.',
    'Mi vida, abríguese bien, que el frío rolo no perdona a nadie.',
    'Yo ya le dije a mi nieto que no se suba a esas motos. ¡Ni a las bicis!',
    'Venga pa\' acá, que le tengo unas onces: almojábana calientica.',
  ],
  policia: [
    'Buenas, ciudadano. Recuerde: el pico y placa no es una sugerencia.',
    'Circule con cuidado, que el único que puede correr aquí es el semáforo.',
    '¿Todo en orden, sumercé? Cualquier novedad me avisa, ¿bueno?',
    'Con mucho respeto: ese carro no se parquea en la ciclovía.',
    'Si ve algo sospechoso me avisa. Si ve un hueco, también, pero ya no hay presupuesto.',
    'Tranquilo, solo estoy vigilando el trancón. Hoy va ganando el trancón.',
  ],
};
const NPC_WANTED = {
  vendor: ['¡Ay, no, la policía! Hágase pa\' allá, que me espantan los clientes.', 'Shhh... sumercé, no me comprometa, que esos tombos me conocen.'],
  policia: ['¡Alto ahí, ciudadano! ¡Pare el carro, por favor, que me cuesta el turno!', 'Está en problemas, sumercé. Entréguese y le invito un tinto.'],
  _default: ['¡Uy, mucho ruido de sirenas por acá! ¿Usted qué hizo, parce?', 'Mejor no me cuente nada, que yo no vi nada, veci.'],
};
const NPC_RAIN = ['Qué lluvia tan fuerte, ¡justo a las tres como siempre!', 'Ya empezó el aguacero, ¿no que "llueve a las tres"? Pues acertaron.'];

const RADIO_LINES = {
  trancon: [
    'Trancón al Aire: la Séptima está detenida, la Caracas también, y mi paciencia, ni se diga.',
    'Atención: un hueco en la Calle 72 se reportó oficialmente como lago. Tapahuecos ya viene... en 2031.',
    'Pico y placa hoy para placas pares. Los impares, ¡disfruten el trancón con calma!',
    'El TransMilagro va tan lleno que el reporte de pasajeros dice "sí".',
    'Última hora: llueve a las tres. Sí, otra vez. No se sorprenda, sumercé.',
    'Reporte vial: un taxi y una buseta discuten por un carril. Van 40 minutos y nadie cede.',
  ],
  tropicombo: [
    '¡Tropicombo 98.7! Cumbia pa\' que se le mueva hasta la ruana, ¡que siga la rumba!',
    'Esto es Tropicombo, la emisora que le pone sabor a su trancón. ¡Dale que dale!',
  ],
  acordeon: [
    'Vallenato Stereo, El Acordeón Llorón: para que llore con ganas, pero de la emoción.',
    'Sigue el acordeón, sigue la parranda, y siga usted que el semáforo ya se puso en verde.',
  ],
  perreadera: [
    '¡La Perreadera FM! Dembow pa\' que el carro tiemble, pero no se choque, ¿ah?',
    'Suba el volumen, baje el vidrio y que el trancón se convierta en discoteca.',
  ],
  champeta: [
    '¡Champeta Picó Radio! Desde la costa pa\' los rolos con ganas de bailar.',
    'Esto es puro picó, mi gente. Que se mueva todo menos el semáforo.',
  ],
  _default: [
    'Usted está escuchando la mejor radio de la ciudad. Sigan sintonizados, ¡no se vayan!',
    'Bogotá, ciudad de montañas, trancones y buena música. Seguimos al aire.',
  ],
};

export function offlineNpcReply(ped = {}, context = {}) {
  const kind = NPC_LINES[ped.kind] ? ped.kind : 'walker';
  if (context?.wanted > 0 && Math.random() < 0.7) return pickFresh(`w-${kind}`, NPC_WANTED[kind] || NPC_WANTED._default);
  if (context?.raining && Math.random() < 0.3) return pickFresh('rain', NPC_RAIN);
  return pickFresh(`npc-${kind}`, NPC_LINES[kind]);
}
export function offlineRadioLine(station = {}) {
  const id = station.id && RADIO_LINES[station.id] ? station.id : station.genre === 'talk' ? 'trancon' : '_default';
  return pickFresh(`radio-${id}`, RADIO_LINES[id]);
}

// ---------- fetch helper ----------
async function post(url, payload, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- public API ----------
export async function checkAI() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch('/api/health', { signal: ctrl.signal });
    const d = await res.json();
    return { enabled: !!d.enabled, model: d.model || null, tts: !!d.tts };
  } catch {
    return { enabled: false, model: null, tts: false };
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<{reply: string, offline?: boolean}>} */
export async function npcTalk({ ped = {}, history = [], message = '', context = {} } = {}) {
  try {
    const { data } = await post('/api/npc', {
      ped: { name: ped.name, kind: ped.kind, persona: ped.persona },
      history: history.slice(-12),
      message: String(message).slice(0, 400),
      context,
    });
    if (data && typeof data.reply === 'string' && data.reply.trim() && !data.offline) return { reply: data.reply.trim() };
  } catch { /* timeout / network → fallback */ }
  return { reply: offlineNpcReply(ped, context), offline: true };
}

/** @returns {Promise<{line: string, offline?: boolean}>} */
export async function radioDJ({ station = {}, context = {} } = {}) {
  try {
    const { data } = await post('/api/radio', { station: { id: station.id, name: station.name, genre: station.genre }, context });
    if (data && typeof data.line === 'string' && data.line.trim() && !data.offline) return { line: data.line.trim() };
  } catch { /* fallback */ }
  return { line: offlineRadioLine(station), offline: true };
}
