// Offline NPC dialogue: a small intent engine so replies make sense without Claude.
// Pure JS (no DOM, no deps) so it runs in the browser and in node tests.
import { LANDMARKS, DISTRICTS, CARRERAS, BLOCK, MIN_X, COLS } from '../config.js';

export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const KINDS = ['vendor', 'walker', 'student', 'oficinista', 'abuela', 'policia'];
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO');

// ---------------------------------------------------------------- items
const ITEMS = {
  tinto: { label: 'tinto', art: 'un', price: 2000, re: /\b(tintos?|cafe|cafecito|tintico)\b/ },
  empanada: { label: 'empanada', art: 'una', price: 2000, re: /\bempanadas?\b/ },
  oblea: { label: 'oblea con arequipe', art: 'una', price: 2500, re: /\bobleas?\b|arequipe/ },
  mango: { label: 'mango biche', art: 'un', price: 3000, re: /\bmango\b|\bbiche\b/ },
  mazorca: { label: 'mazorca', art: 'una', price: 3500, re: /\bmazorcas?\b/ },
  arepa: { label: 'arepa', art: 'una', price: 3000, re: /\barepas?\b/ },
  almojabana: { label: 'almojábana', art: 'una', price: 1500, re: /\balmojabanas?\b|\bpan de yuca\b/ },
};
const PRODUCT_ITEM = { obleas: 'oblea', empanadas: 'empanada', 'mango biche': 'mango', tinto: 'tinto' };
const itemIn = (t) => Object.keys(ITEMS).find((k) => ITEMS[k].re.test(t)) || null;
const productOf = (ped) => PRODUCT_ITEM[ped?.extra?.product] || (ped?.kind === 'vendor' ? 'tinto' : null);
function priceOf(ped, key) {
  if (ped?.kind === 'vendor' && productOf(ped) === key && ped.vendor?.sub) {
    const m = /\$\s?([\d.]+)/.exec(ped.vendor.sub);
    if (m) return parseInt(m[1].replace(/\./g, ''), 10) || ITEMS[key].price;
  }
  return ITEMS[key].price;
}
const QTY = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
const qtyIn = (t) => { const m = /\b(un|una|uno|dos|tres|cuatro|cinco|[1-5])\b/.exec(t); return m ? QTY[m[1]] : 1; };

// ---------------------------------------------------------------- places
const DPLACE = (name) => { const d = DISTRICTS.find((x) => x.name === name); return { x: 0, z: (d.minZ + Math.min(d.maxZ, 576)) / 2 }; };
const PLACES = [
  { id: 'monserrate', re: /monserrate|\bcerros?\b|teleferico|funicular|santuario/ },
  { id: 'candelaria', re: /candelaria/ },
  { id: 'plaza_bolivar', re: /plaza de bolivar|plaza bolivar|capitolio|catedral|\bplaza\b/ },
  { id: 'bacata', re: /bacata|bacatanga/ },
  { id: 'colpatria', re: /colpatri|colpatranca/ },
  { id: 'torres_parque', re: /torres del parque/ },
  { id: 'santo_tomas', re: /santo tomas|universidad|build day|buildday|hackathon|\bla u\b/ },
  { id: 'zona_t', re: /zona t\b|zona rosa|\brumba\b|farra|discoteca|\bbares?\b/ },
  { id: 'parque93', re: /parque 93|parque noventa|noventa y tres|\bchico\b/ },
  { id: 'usaquen', re: /usaquen|pulgas/ },
  { id: 'campin', re: /campin|estadio/ },
  { id: 'simon_bolivar', re: /simon bolivar|parque simon/ },
  { id: 'caracas', weak: true, name: 'la estación del TransMilagro más cercana, sobre la Avenida Caracas', x: 0, re: /transmilagro|transmilenio|estacion|portal|\bcaracas\b/ },
  { id: 'd_chapinero', weak: true, name: 'Chapinero', ...DPLACE('Chapinero'), re: /chapinero/ },
  { id: 'd_teusa', weak: true, name: 'Teusaquillo', ...DPLACE('Teusaquillo'), re: /teusaquillo/ },
  { id: 'd_centro', weak: true, name: 'el Centro Internacional', ...DPLACE('Centro Internacional'), re: /centro internacional|\bcentro\b/ },
];
const placeIn = (t) => PLACES.find((p) => p.re.test(t)) || null;
const placeInfo = (p) => (p.name ? p : LANDMARKS.find((l) => l.id === p.id));
const road = (n) => String(n).replace(/\s*\(.*\)/, '');
const first = (ped) => (String(ped?.name || 'veci').replace(/^(Doña|Don|Agente|Patrullero)\s+/i, '').split(' ')[0]);

function playerPos(ctx) {
  if (ctx?.pos && isFinite(ctx.pos.x) && isFinite(ctx.pos.z)) return ctx.pos;
  const d = DISTRICTS.find((x) => x.name === ctx?.district) || DISTRICTS[3];
  return { x: 0, z: (d.minZ + Math.min(d.maxZ, 576)) / 2 };
}
function nearestLandmark(pos) {
  let best = null, bd = Infinity;
  for (const l of LANDMARKS) { if (l.id === 'monserrate') continue; const d = Math.hypot(l.x - pos.x, l.z - pos.z); if (d < bd) { bd = d; best = l; } }
  return { lm: best, dist: bd };
}
function directionsTo(target, pos) {
  const lm = placeInfo(target);
  const tx = lm.x, tz = lm.z ?? pos.z;
  const dx = tx - pos.x, dz = tz - pos.z;
  const dist = Math.hypot(dx, dz);
  const name = lm.name;
  if (lm.id === 'monserrate') {
    return { name, text: dx > 100 ? 'Siempre pa\' los cerros, al oriente, hasta donde no haya más calle, y de ahí a subir por la Circunvalar.' : 'Mírelo, está ahí arriba en los cerros, al oriente. Suba por la Circunvalar.', near: false };
  }
  if (dist < (lm.radius || 20) + 25) return { name, text: 'Pero si ya está ahí mismito: mire alrededor, sumercé.', near: true };
  const legs = [];
  const bz = Math.round(Math.abs(dz) / BLOCK), bx = Math.round(Math.abs(dx) / BLOCK);
  if (bz >= 1) legs.push({ b: bz, t: dz < 0 ? 'pa\' el norte (las calles suben)' : 'pa\' el sur (las calles bajan)' });
  if (bx >= 1) legs.push({ b: bx, t: dx > 0 ? 'pa\' los cerros (al oriente)' : 'pa\' el occidente (lejos de los cerros)' });
  legs.sort((a, b) => b.b - a.b);
  let text = legs.length ? `Siga ${legs[0].t} unas ${legs[0].b} cuadra${legs[0].b > 1 ? 's' : ''}` : 'Está a un paso';
  if (legs[1]) text += ` y luego ${legs[1].t} unas ${legs[1].b}`;
  text += '.';
  const ci = Math.floor((tx - MIN_X) / BLOCK);
  if (lm.id !== 'caracas' && !lm.id.startsWith('d_') && ci >= 0 && ci < COLS) text += ` Queda entre la ${road(CARRERAS[ci])} y la ${road(CARRERAS[ci + 1])}.`;
  return { name, text, near: false };
}

// ---------------------------------------------------------------- intents
// [intent, weight, regex] on normalized text. Highest total wins.
const RULES = [
  ['greeting', 3, /\b(hola|holi|buenas|buenos dias|buen dia|buenas tardes|buenas noches|que mas|quiubo|quihubo|que hubo|saludos|alo)\b/],
  ['greeting', 1, /^(oye|ey|hey)\b/],
  ['howareyou', 4, /\b(como (esta|estas|va|le va|te va|anda|andas|amanecio|le fue|te fue|vas)|que tal|todo bien|como se siente)\b/],
  ['where_am_i', 6, /\b(donde estoy|donde (es|estamos) esto|que lugar es|en que (barrio|zona) estoy|que barrio es)\b/],
  ['time', 6, /\b(que hora|hora es|tiene hora|me regala la hora|que horas son)\b/],
  ['price', 4, /\b(cuanto|cuantos|precio|precios|vale|valen|cuesta|cuestan|cobra|cobras|a como|barato|caro)\b/],
  ['buy', 4, /\b(deme|dame|damelo|quiero|quisiera|comprar|compro|llevo|lleveme|vendame|me vende|me vendes|me das|me da|me regala|regaleme|pongame|sirvame|traigame|un tinto|una empanada)\b/],
  ['menu', 3, /\b(que (vende|vendes|tiene|tienes|hay para comer|hay para tomar|ofrece|me recomienda|recomienda|recomiendas)|hambre|comer|almorzar|almuerzo|almuerza|desayuno|onces|antojo|provoca|menu|sed|tomar)\b/],
  ['directions', 3, /\b(donde|dnd|como (llego|llegar|se llega|voy|se va|hago para llegar|puedo llegar)|queda|quedan|cerca|lejos|ruta|ir a|llegar a|voy para|para ir|por donde|hacia|cuantas cuadras|indiqueme|sabe donde)\b/],
  ['weather', 4, /\b(lluvia|llueve|llover|lloviendo|clima|frio|aguacero|paraguas|sol|calor|temperatura|nublado|llovizna|ruana)\b/],
  ['police', 4, /\b(policia|policias|tombos?|paco|pacos|me persiguen|me buscan|me estan buscando|me siguen|persecucion|patrulla|sirenas?|estrellas?|me siguen)\b/],
  ['innocent', 5, /\b(no hice nada|yo no fui|no fui yo|soy inocente|no he hecho nada|yo no hice)\b/],
  ['bribe', 5, /\b(soborno|coima|mordida|le doy plata|le pago para|arreglemos|le doy unas lucas)\b/],
  ['threat', 5, /\b(atraco|esto es un atraco|le robo|lo robo|manos arriba|plata o la vida|le quito|lo mato|quieto)\b/],
  ['traffic', 5, /\b(trancon|trancones|trafico|pico y placa|pico placa|semaforo|semaforos|huecos?|tapahuecos)\b/],
  ['traffic', 2, /\b(buseta|sitpaciencia|transmilagro|transmilenio|taxi|bus)\b/],
  ['identity', 4, /\b(quien (es|eres|sos)|como (te|se) llama|como te llamas|cual es (tu|su) nombre|tu nombre|su nombre|de donde (es|eres)|a que se dedica|a que te dedicas|que hace(s)?|hablame de ti|cuentame de ti|presentate|y usted quien)\b/],
  ['ai', 5, /\b(claude|inteligencia artificial|\bia\b|\bai\b|robot|chatgpt|eres un bot|eres real|programado|anthropic|modelo de lenguaje|quien te (creo|hizo|programo))\b/],
  ['buildday', 5, /\b(build day|buildday|hackathon)\b/],
  ['compliment', 4, /\b(me caes bien|que amable|eres (muy )?(amable|bacano|chevere|genial|simpatic[oa]|lind[oa]|buena gente)|buena gente|excelente|te quiero|que simpatic[oa]|muy amable)\b/],
  ['insult', 5, /\b(idiota|estupid[oa]|imbecil|tonto|tonta|bobo|boba|feo|fea|inutil|basura|asco|callese|cierre la boca|pendej[oa]|mierda|malparid[oa]|gonorrea|hijueputa|hpta|marica|cabron|puto|odio)\b/],
  ['thanks', 4, /\b(gracias|mil gracias|muy amable)\b/],
  ['bye', 5, /\b(chao|chau|adios|hasta luego|hasta pronto|nos vemos|me voy|ya me voy|cuidese|hasta la proxima)\b/],
  ['money', 4, /\b(plata|lucas|platica|presta|prestame|preste|tiene plata|regalame plata|pesos)\b/],
  ['football', 4, /\b(futbol|partido|azules|cardenales|hinchada|el equipo|gol)\b/],
  ['music', 4, /\b(radio|musica|cumbia|vallenato|reggaeton|champeta|bailar|cancion|canciones)\b/],
  ['advice', 4, /\b(que hago|que puedo hacer|que hay por aqui|que hay de bueno|que visitar|que visito|plan|aburrido|turistear|conocer|recomiendame|que me recomienda hacer)\b/],
  ['city', 3, /\b(bogota|rolos?|cachaco|colombia|la ciudad|vivir aqui)\b/],
  ['laugh', 4, /^(ja|je|ji|jaja|jeje|jiji|jajaja|haha|xd|lol)+$/],
  ['ack', 3, /^(si|no|ok|okay|listo|dale|bueno|claro|de una|vale|ah|aja|mmm|hum|ya|entiendo|perfecto|genial|chevere|bacano|super|uy|ajá)( \w+)?$/],
];
const TOPIC = {
  vendor: /\b(negocio|ventas|vender|carrito|permiso|alcaldia|clientes|trabajo)\b/,
  student: /\b(parcial|tarea|profe|profesor|estudiar|estudia|estudias|estudiando|carrera|beca|nota|examen|clase|sistemas|programar|codigo|ingenieria)\b/,
  oficinista: /\b(afan|prisa|reunion|jefe|oficina|correo|informe|corrientazo|quincena|trabajo)\b/,
  abuela: /\b(nieto|salud|rodillas|consejo|receta|en mis tiempos|tranvia|iglesia|rezar|dios)\b/,
  policia: /\b(papeles|licencia|comparendo|multa|reglas|ley|ciclovia|palomas?|espacio publico|orden)\b/,
  walker: /\b(trabajo|familia|vuelta|casa)\b/,
};

export function detectIntent(text, ctx = {}, ped = {}) {
  const t = norm(text);
  const out = { id: 'fallback', t, item: itemIn(t), place: placeIn(t), qty: qtyIn(t) };
  if (!t) return out;
  const words = t.split(' ').length;
  const score = {};
  const add = (id, w) => { score[id] = (score[id] || 0) + w; };
  for (const [id, w, re] of RULES) if (re.test(t)) add(id, w);
  if (TOPIC[ped.kind || 'walker']?.test(t)) add('topic', 5);
  if (out.item) { add('menu', 2); if (/\b(deme|dame|quiero|quisiera|llevo|lleveme|compro|comprar|vendame|pongame|sirvame|traigame|me vende|me das|me da)\b/.test(t)) add('buy', 2); }
  if (out.place && !(out.place.weak && !score.directions)) add('directions', score.directions ? 1.5 : words <= 3 ? 3.5 : 1.5);
  if (score.price && score.menu && !out.item) delete score.menu;
  let best = 'fallback', bs = 0;
  for (const [id, s] of Object.entries(score)) if (s > bs) { best = id; bs = s; }
  out.id = best;
  return out;
}

// ---------------------------------------------------------------- memory
const memory = new Map();
const keyOf = (ped) => `${ped?.id ?? ''}|${ped?.name ?? ''}|${ped?.kind ?? ''}`;
const memOf = (ped) => { const k = keyOf(ped); let m = memory.get(k); if (!m) memory.set(k, (m = { used: new Set(), intents: [], wantedSeen: 0 })); return m; };
export function beginConversation(ped) { const m = memOf(ped); m.intents = []; m.wantedSeen = 0; }
export function resetOfflineMemory() { memory.clear(); }
export const usedIntents = (ped) => memOf(ped).intents.slice();

// ---------------------------------------------------------------- lines
const saludo = (h = 12) => (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
const hhmm = (h = 12) => { let hh = Math.floor(h) % 24; const mm = Math.floor((h % 1) * 60); const ap = hh >= 12 ? 'de la tarde' : 'de la mañana'; const h12 = hh % 12 || 12; return `${h12}:${String(mm).padStart(2, '0')} ${hh >= 19 || hh < 5 ? 'de la noche' : ap}`; };

function vars(ped, ctx, extra = {}) {
  const key = productOf(ped) || 'tinto';
  const it = ITEMS[key];
  const prod = ped?.extra?.product || it.label;
  return {
    me: ped?.name || 'un rolo', first: first(ped), product: prod, item: it.label, price: cop(priceOf(ped, key)),
    place: ped?.extra?.place || ctx?.district || 'por aquí', district: ctx?.district || 'Chapinero',
    saludo: saludo(ctx?.hour), hora: hhmm(ctx?.hour), n: ctx?.wanted || 1, vehicle: ctx?.vehicle || 'carro', ...extra,
  };
}
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));

// pick an unused line (kind pool first, then generic), reset when exhausted
function pickLine(ped, key, kindPool, genericPool, v) {
  const m = memOf(ped);
  const pools = [kindPool || [], genericPool || []];
  for (const pool of pools) {
    const fresh = pool.map((l, i) => [l, `${key}:${pool === pools[0] ? 'k' : 'g'}${i}`]).filter(([, id]) => !m.used.has(id));
    if (fresh.length) {
      const [l, id] = fresh[(hash(keyOf(ped) + m.used.size) + fresh.length) % fresh.length];
      m.used.add(id);
      return fill(typeof l === 'function' ? l(v) : l, v);
    }
  }
  for (const k of [...m.used]) if (k.startsWith(key + ':')) m.used.delete(k);
  const pool = (kindPool && kindPool.length ? kindPool : genericPool) || [''];
  return fill(typeof pool[0] === 'function' ? pool[0](v) : pool[hash(keyOf(ped)) % pool.length], v);
}

// R[intent] = { _: generic[], vendor: [], ... }
const R = {
  greeting: {
    vendor: ['¡Quiubo, veci! ¿Le provoca {product}?', 'Buenas, buenas. Aquí estoy, firme con mi {product}.', '¡A la orden, sumercé! Pregunte sin pena.'],
    walker: ['¡Quiubo, parce! ¿Todo bien?', 'Hola, hola. ¿Qué se le ofrece?', 'Buenas, veci. Dígame con confianza.'],
    student: ['Quiubo, parce. Hable rápido que se me va el bus.', 'Hola, hola. Perdone, ando repasando para el parcial.', '¡Ey! Qué hubo, parce.'],
    oficinista: ['Buenas. Sea breve, que mi reunión empieza ya.', 'Hola, con gusto. ¿En qué le puedo colaborar?', 'Buenas, buenas. Dígame, rapidito.'],
    abuela: ['Ay, mijito, qué amable. Buenas, mi vida.', 'Buenas, mi amor. ¿Cómo amaneció?', 'Hola, mijito. Venga, no sea tímido.'],
    policia: ['Buenas, ciudadano. A la orden.', 'Buenas. ¿Todo en orden, sumercé?', 'Muy buenas. ¿Alguna novedad?'],
    _: ['¡Quiubo, veci! ¿En qué le puedo ayudar?'],
  },
  howareyou: {
    vendor: ['Pues aquí, veci, peleándole al día con mi {product}. ¿Y usted?', 'Bien, bendito sea Dios, aunque las ventas andan flacas. ¿Usted cómo va?', 'Mejor ahora que alguien me pregunta. ¿Y usted, sumercé?'],
    walker: ['Pues acá, sobreviviendo al trancón. ¿Y usted, parce?', 'Bien, con frío pero vivo. ¿Usted?', 'Tranquilo, sumercé: caminando y renegando, como buen rolo. ¿Y usted?'],
    student: ['Vivo, que ya es ganancia. Dormí tres horas y tengo parcial.', 'Cansado, parce, pero bacano. ¿Y usted?', 'Aquí, a punta de tinto y empanada. ¿Usted qué tal?'],
    oficinista: ['Ahí, entre correos y reuniones. ¿Y usted?', 'Bien, gracias a Dios. Aunque mi jefe diga lo contrario.', 'Estresado, pero estable. ¿Usted?'],
    abuela: ['Bien, mijito, con mis achaques pero contenta. ¿Y usted, ya comió?', 'Aquí, mi vida, con las rodillas quejándose del frío. ¿Y usted?', 'Bendito sea Dios, bien. Usted se ve flaquito, ¿está comiendo?'],
    policia: ['Bien, gracias, ciudadano. Cuidando la ciudad y el turno.', 'Sin novedad, gracias a Dios. ¿Y usted?', 'Firme en el puesto. ¿Usted cómo va?'],
    _: ['Bien, gracias a Dios. ¿Y usted, veci?'],
  },
  where_am_i: {
    _: ['Está en {district}, sumercé. {near}', 'Esto es {district}, veci. {near}', 'Pues en {district}, parce. {near}'],
  },
  time: {
    _: ['Son las {hora}, sumercé.', 'Mire, van a ser las {hora}.', 'Las {hora}, veci. El tiempo vuela, pero el trancón no.'],
  },
  menu: {
    vendor: ['Aquí tengo {product}, a {price}. ¿Se lo sirvo?', 'Lo mío es {product}: fresquecito y a buen precio. ¿Cuántos le pongo?', 'Tengo {product}, y si no le provoca, el hambre lo convence.'],
    walker: ['¿Hambre? Cójase una empanada, que por aquí hay vendedores en cada esquina.', 'Yo le recomiendo un tinto y una almojábana calientes, que con este frío es lo único serio.', 'Busque a un vendedor, parce; el que más le huela a empanada, ese es.'],
    student: ['¿Comida? Sí, por favor. Ando a punta de tinto; si encuentra empanadas a dos mil, avíseme.', 'Por el Santo Tomás hay un tinto que salva vidas: el de Don Aurelio.', 'Un tinto y una oblea, parce. Con eso se sobrevive a un parcial.'],
    oficinista: ['Le recomiendo el corrientazo de Doña Gloria: sopa, seco y jugo. Una belleza.', 'Yo almuerzo a las doce en punto: corrientazo. Lo demás es picar.', 'Un tintico y ya. Si como mucho, me da sueño en la reunión.'],
    abuela: ['¿Hambre, mijito? Venga, que yo siempre cargo una almojábana. Y chocolate con queso, si lo ve.', 'Cómase una arepita con quesito caliente, mi vida: no hay mal que resista.', 'Una aguapanelita con limón, mijito, y se le pasa todo.'],
    policia: ['En servicio, con un tintico me conformo. Cerca hay vendedores; pregunte con confianza.', 'Por aquí hay empanadas buenas. Yo no vigilo el sabor, solo el orden.', 'Un tinto caliente y a patrullar, ciudadano.'],
    _: ['Por aquí hay vendedores de tinto y empanada, veci.'],
  },
  weather_rain: {
    _: ['Pues claro, ¡llueve! Si son pasadas las tres, así es Bogotá.', 'Mire cómo cae. Rolo sin paraguas no es rolo.', 'Aguacero de manual: a las tres, puntual como el reloj.'],
  },
  weather_pre: {
    _: ['Todavía no llueve, pero a las tres cae el agua, ¡palabra de rolo!', 'Se ve despejado, pero no confíe: aquí llueve a las tres.', 'Ahorita está seco, pero al rato se viene el aguacero.'],
  },
  weather_dry: {
    _: ['Raro que no haya llovido ya. Algo se trae el cielo, veci.', 'Hoy se salvó, pero el frío bogotano no perdona: unos catorce grados.', 'Sequecito por ahora. Eso sí, con ruana, que el frío es el mismo.'],
  },
  weather_night: {
    _: ['De noche el frío se siente de verdad: unos nueve grados, parce.', 'A esta hora hace un frío que se le mete a uno hasta el alma. Abríguese.'],
  },
  weather_tail: {
    vendor: ['Eso sí, con frío el tinto se vende solo.'], walker: ['Yo con la ruana ya estoy listo.'], student: ['Y mi tarea ahí, a la intemperie.'],
    oficinista: ['Menos mal traje paraguas.'], abuela: ['Abríguese, mijito, que se enferma.'], policia: ['Con lluvia, a manejar despacio.'],
  },
  police_on: {
    vendor: ['¡Ay, no, que me espantan los clientes! Sí, ya vi las sirenas. Hágase lejos de mi carrito, ¿sí?', 'Shhh, bájele a la voz, sumercé. Los tombos andan cerca y yo no tengo permiso ni para respirar.'],
    walker: ['¡Uy, sí! Sirenas por todo lado. ¿Usted qué hizo, parce? Mejor no me cuente.', 'Dicen que lo buscan... y yo no vi nada, ¿ya?'],
    student: ['¿En serio? Parce, con razón hay tanta sirena. Yo no lo conozco, ¿ah?', 'Uy, qué mamera. Si le preguntan, yo estaba estudiando.'],
    oficinista: ['Veci, tengo reunión y no pienso ser testigo. Con permiso.', 'Con tantas sirenas, ¡qué trancón se viene! Y usted, a lo suyo.'],
    abuela: ['Ay, Virgen santísima, ¡mijito, qué hizo! Entréguese, que Dios perdona. La policía, a veces.', 'Mijito, vaya y pida disculpas, que eso con cariño se arregla.'],
    policia: ['¡Alto ahí, sumercé! Tiene {n} estrella(s). Entréguese y le invito un tinto.', 'Con {n} estrella(s) ya no se hace el loco: pare y colabore, ciudadano.'],
    _: ['¡Uy, mucho ruido de sirenas! ¿Usted qué hizo, parce?'],
  },
  police_off: {
    vendor: ['Por aquí pasan de vez en cuando, y yo sin permiso... mejor hable bajito. Hoy no se ve ninguno.'],
    walker: ['Tranquilo, no he visto nada. La policía solo aparece cuando uno no la necesita.', 'Por la Plaza de Bolívar siempre hay agentes, si los necesita.'],
    student: ['Cero tombos por aquí. Mi mayor peligro es el parcial.'], oficinista: ['Ni idea, veci; yo solo veo pantallas y corbatas.'],
    abuela: ['Por aquí hay agentes muy educados, mijito. En la Plaza siempre hay uno.'],
    policia: ['Aquí estoy yo, ciudadano. ¿Qué novedad reporta?', 'Todo tranquilo por este sector. Y que siga así, ¿sí?'],
    _: ['Por ahora todo tranquilo, veci.'],
  },
  innocent: {
    policia: ['Eso dicen todos, sumercé... pero hoy le creo. Circule tranquilo.', 'Si no hizo nada, no tiene de qué preocuparse. Respete el semáforo y ya.'],
    _: ['Yo tampoco hice nada, parce, y mírenos aquí. Así es la vida.', 'Tranquilo, sumercé, nadie lo está acusando... todavía.'],
  },
  bribe: {
    policia: ['¡Sumercé! Eso es un delito, y yo soy muy serio. Mejor invíteme un tinto, pero sin segundas intenciones.', 'Guarde esa plata, ciudadano. Circule, circule.'],
    _: ['Uy, no, parce, a mí no me meta en eso.'],
  },
  threat: {
    vendor: ['¡Ay, no, veci, tranquilo! Aquí solo hay {product} y deudas. Si quiere, le doy una gratis, pero no me asuste.'],
    walker: ['Uy, no, no, tranquilo. Yo solo llevo mil quinientos pesos y un paraguas roto.'],
    student: ['¡Parce, tranquilo! Lo único valioso que tengo es un parcial sin estudiar.'],
    oficinista: ['Veci, por favor, ¡tengo reunión! Mi billetera solo tiene una tarjeta del TransMilagro con cinco pesos.'],
    abuela: ['¡Jesús, María y José! Mijito, no sea malo, que a mí apenas me alcanza para el pan.'],
    policia: ['¡Alto ahí, ciudadano! Baje la voz y la actitud, o lo invito a conocer la estación.'],
    _: ['¡Tranquilo, tranquilo! Hablemos como gente.'],
  },
  traffic: {
    vendor: ['El trancón es mi mejor cliente: carro detenido, tinto vendido.', 'Con los huecos de esta calle, ya no sé si vendo o hago slalom.'],
    walker: ['Trancón siempre hay. Aquí el que llega a tiempo está de mal agüero.', 'Por la Caracas ni se meta: el TransMilagro va lleno y el trancón le gana al peatón.'],
    student: ['El bus me demora una hora y media. Llego a clase a la hora del almuerzo, parce.', 'Los huecos de aquí ya tienen nombre propio, y uno de ellos me debe un zapato.'],
    oficinista: ['El trancón me roba dos horas al día. Dos. Y el jefe pregunta por qué llego tarde.', 'Pico y placa, trancón y lluvia: el trío perfecto de un lunes.'],
    abuela: ['Ay, mijito, esos carros van como locos. En mis tiempos pasaba el tranvía y uno se montaba con calma.', 'Cruce despacio y mire a los dos lados, mi vida, que los buses no frenan.'],
    policia: ['Respete el semáforo y el pico y placa, ciudadano. Es lo único que le pido.', 'El trancón hoy va ganando. Colabore: no se pase la cebra.'],
    _: ['El tráfico en Bogotá es una filosofía, veci.'],
  },
  identity: {
    vendor: ['Soy {first}, a la orden. Vendo {product} aquí en {place}; todo el que pasa me conoce.', 'Me dicen {first}. Madrugo, armo el carrito y a vender {product}, sumercé.'],
    walker: ['Soy {first}, un rolo cualquiera. Camino, me quejo del trancón y vuelvo a caminar.', '{first}, para servirle. Vivo en {district} y aquí me tiene.'],
    student: ['{first}, estudiante de Sistemas en el Santo Tomás. Ando medio dormido por el Build Day.', 'Me dicen {first}, parce. Estudio, programo y sobrevivo a tinto.'],
    oficinista: ['{me}, oficinista. Mi vida son correos, reuniones y tinto frío.', '{first}, a la orden. Trabajo por aquí cerca y siempre voy tarde.'],
    abuela: ['Soy {me}, mijito, bogotana de toda la vida. He visto pasar el tranvía, el trancón y el hueco de la esquina.', 'Me dicen {first}, mi vida, y llevo más años en esta calle que los semáforos.'],
    policia: ['{me}, de la Policía. A la orden, ciudadano.', 'Soy el {me}. Cualquier novedad, me avisa.'],
    _: ['Soy {first}, a la orden.'],
  },
  ai: {
    vendor: ['¿Inteligencia artificial yo? Qué va, veci: soy de carne, hueso y empanada. Aunque dicen que un tal Claude me da conversación; hoy ando sin señal.'],
    walker: ['¿Que si soy un bot? Jaja, yo solo soy un rolo con ruana. Dicen que por aquí anda un tal Claude hablando por todos, hoy sin señal.'],
    student: ['¿IA? Parce, yo estudio Sistemas: la IA me debe el parcial. Hasta le pedí ayuda a Claude, pero hoy está sin señal.'],
    oficinista: ['¿Un bot yo? Ojalá, así iría a las reuniones por mí. No: soy de carne, hueso y correos sin responder.'],
    abuela: ['Mijito, yo no sé qué es eso de inteligencia artificial. Lo único artificial que conozco son las flores de plástico de mi sala.'],
    policia: ['Ciudadano, soy de carne y hueso, no un robot. Aunque el pico y placa sí lo cumplo como una máquina.'],
    _: ['Soy un personaje del Build Day, veci. Hoy ando offline, sin mi cerebro Claude.'],
  },
  buildday: {
    student: ['¡El Build Day! Aquí en el Santo Tomás: gente programando con IA hasta la madrugada. Yo ya llevo tres tintos, parce.'],
    _: ['El Build Day es un hackathon bacanísimo en el Santo Tomás: la gente programa con IA hasta la madrugada. Queda por la Carrera 9, en Chapinero.'],
  },
  compliment: {
    vendor: ['¡Uy, gracias, veci! Por eso le dejo la {product} a buen precio.', 'Qué gente tan amable. ¡Así da gusto trabajar!'],
    walker: ['Se le agradece, parce. Me sonrojé y todo.', 'Qué detalle, veci. Hoy sí me alegró el día.'],
    student: ['¡Gracias, parce! Con eso me dan ganas de estudiar. Casi.', 'Uy, qué bacano. Me subió el ánimo para el parcial.'],
    oficinista: ['Gracias, con permiso... me tomó por sorpresa. Es lo mejor que me han dicho hoy.', 'Qué amable. En esta ciudad no se oye todos los días.'],
    abuela: ['Ay, mijito, qué bendición. Venga, que le doy una almojábana.', 'Dios se lo pague, mi vida.'],
    policia: ['Se agradece, ciudadano. Siempre es bueno que reconozcan el servicio.', 'Gracias, sumercé. Así da gusto patrullar.'],
    _: ['¡Gracias, veci!'],
  },
  insult: {
    vendor: ['Ay, veci, qué agresividad. Mejor cómprese un {product} y se le pasa.', 'Uy, tranquilo. Aquí en la calle se respeta, pero se lo perdono por esta vez.'],
    walker: ['Uy, qué genio. Respire, parce: es Bogotá, no un partido del Campín.', 'Tranquilo, sumercé, que el frío ya es suficiente castigo.'],
    student: ['Uy, qué palabras, parce. Eso no se lo enseñaron en la U.', 'Respire, que el parcial es el que me tiene mal, no usted.'],
    oficinista: ['Voy a fingir que no escuché eso, porque llevo prisa. Con permiso.', 'Veci, inhale, exhale. Yo ya lo hago diez veces al día en el trabajo.'],
    abuela: ['¡Ave María, mijito! Lávese la boca con agua de panela y pida disculpas.', 'Ay, qué falta de educación. Su mamá no le enseñó eso.'],
    policia: ['Respeto, ciudadano. Eso se paga con comparendo... pedagógico: un tinto para mí. ¿Listo?', 'Baje el tono, sumercé, que aquí todos nos respetamos.'],
    _: ['Uy, tranquilo, veci. Respiremos.'],
  },
  thanks: {
    vendor: ['A la orden, veci. ¡Vuelva cuando tenga hambre!'], walker: ['Con mucho gusto, parce.'], student: ['De nada, parce. Pa\' eso estamos.'],
    oficinista: ['Con gusto, veci. Ahora sí, con permiso.'], abuela: ['Con mucho gusto, mi vida. Cuídese.'], policia: ['A la orden, ciudadano. Para eso estamos.'],
    _: ['¡No hay de qué!'],
  },
  bye: {
    vendor: ['¡Vaya con Dios, veci! Vuelva cuando tenga hambre.', 'Chao, sumercé. ¡Y no me olvide el {product}!'],
    walker: ['Chao, parce. Cuídese de los huecos.', 'Hasta luego, veci. Y lleve paraguas.'],
    student: ['Chao, parce. Me toca ir a sufrir el parcial.', 'Nos vemos. Si ve a mi profesor, no me conoce.'],
    oficinista: ['Hasta luego. Me toca volar a la reunión.', 'Chao. Si me busca, estoy en una junta eterna.'],
    abuela: ['Que Dios lo bendiga, mijito. Abríguese.', 'Vaya con Dios, mi vida. Y no se suba a esas motos.'],
    policia: ['Buen día, ciudadano. Circule con precaución.', 'Hasta luego, sumercé. Y cumpla el pico y placa.'],
    _: ['¡Chao, veci!'],
  },
  money: {
    vendor: ['¿Plata? Eso busco yo también, veci. Mejor cómpreme algo y me ayuda.'],
    walker: ['Jaja, si tuviera plata no estaría caminando en este frío. Ando misio.'],
    student: ['¿Plata? Parce, yo ando con mil quinientos. Mejor hagamos vaca.'],
    oficinista: ['Yo también ando justo, veci. La quincena demora más que el TransMilagro.'],
    abuela: ['Mijito, la abuela solo da consejos y almojábanas. Plata, poquita; cariño, harto.'],
    policia: ['Ciudadano, aquí no se mendiga ni se soborna. Trabaje honradamente.'],
    _: ['Uy, de plata no hablemos, veci.'],
  },
  football: {
    _: ['¡Azules campeón, parce! Aunque los Cardenales también dan guerra, con respeto.', 'El fútbol en El Campín se vive con tinto en mano y gritando al árbitro.', 'Yo no sé de táctica, pero sé gritar gol. Eso sí.'],
    abuela: ['Ay, mijito, yo de eso no sé. Mi finado era del Azul y nunca se perdió un partido.'],
    policia: ['Los días de partido hay trancón y trabajo. Respeto a la hinchada, ciudadano.'],
  },
  music: {
    _: ['Yo soy de cumbia, parce: Tropicombo 98.7 no falla.', 'Con la Perreadera FM el trancón parece discoteca. Mejor oigamos el vallenato, que es más sabroso.', 'Suba la radio, que con champeta hasta el semáforo baila.'],
    abuela: ['Yo, bambuco y pasillo, mijito, como Dios manda.'],
  },
  advice: {
    _: ['Si es plan, suba a Monserrate o camine por La Candelaria. Y a las tres, resguárdese que llueve.', 'Aquí en {district} lo bacano es {tip}. Y no olvide el paraguas.', 'Un tinto, una caminata por la Séptima y, si hay plata, la Zona T. Eso es Bogotá.'],
  },
  city: {
    _: ['Bogotá es dura pero uno la quiere: frío, lluvia y todo. Eso sí, los huecos...', 'Rolo de pura cepa: criado entre el trancón y el chocolate con queso.', 'Esta ciudad se queja mucho, pero no la cambio por nada.'],
  },
  laugh: { _: ['Jajaja, qué risa, veci.', 'Jeje, así es. ¿Y qué más?', 'Jajaja, usted sí es chistoso.'] },
  ack: {
    vendor: ['¡Listo pues! ¿Le pongo {product}?', 'De una. ¿Algo más, sumercé?'],
    walker: ['Listo pues. ¿Algo más, parce?', 'Chévere. ¿Y qué más se le ofrece?'],
    student: ['Listo, parce. ¿Algo más? Que se me va el tiempo.', 'Bacano. ¿Y qué más?'],
    oficinista: ['Perfecto. ¿Algo más? Que tengo reunión.', 'De acuerdo. Dígame si necesita algo más.'],
    abuela: ['Bueno, mijito. ¿Quiere una aguapanelita?', 'Eso, mi vida. ¿Algo más?'],
    policia: ['Muy bien, ciudadano. ¿Alguna otra consulta?', 'Perfecto. Cualquier cosa, me avisa.'],
    _: ['Listo pues. ¿Algo más?'],
  },
  topic: {
    vendor: ['El negocio va así así: los lunes flojo, los viernes bacano, y cuando llueve, ni les cuento.', 'Madrugo a las cuatro, armo el carrito y a pelearle al día. Duro, pero es mío.', 'Lo que más duele es el permiso. Entre el espacio público y la policía, uno vive corriendo.'],
    student: ['Tengo parcial de Cálculo y lo único que sé derivar es el trancón.', 'Estudio Sistemas: escribo código, lo borro y lloro. Pero bacano.', 'El profe dice que hay que leer. Yo digo que hay que sobrevivir.'],
    oficinista: ['Mi jefe dice que la reunión es de cinco minutos. Llevamos tres horas.', 'Correo tras correo, tinto tras tinto. Eso es una oficina, veci.', 'Yo vivo del corrientazo y de la quincena. En ese orden.'],
    abuela: ['En mis tiempos el tranvía pasaba por la Séptima y uno caminaba tranquilo.', 'Mi nieto no me visita desde diciembre, pero me manda memes. No sé qué son.', 'Tómese una aguapanela con limón, mijito, que eso cura todo.'],
    policia: ['Con respeto: papeles al día y el semáforo en rojo se respeta, ¿oyó?', 'Un comparendo es pedagogía con factura. Mejor evitarlo.', 'Por la Plaza hay palomas por todas partes; esas sí no respetan la autoridad.'],
    walker: ['Uno se rebusca como puede, veci. La vida en Bogotá es de resistencia.', 'Con familia y trabajo, el día no alcanza. Pero ahí vamos.'],
    _: ['Cosas de la vida, veci.'],
  },
  fallbackPre: { _: ['¿Ah? No le entendí, veci.', 'Uy, parce, eso sí no se lo capté.', 'Perdone, sumercé, ¿cómo así?', 'Mmm, no le pillé la idea.'] },
  fallbackSteer: {
    vendor: ['¿Mejor un {product} a {price}? Eso sí le entiendo.', 'Si quiere comprar algo, aquí tengo {product}.'],
    walker: ['Pregúnteme por el clima, el trancón o cómo llegar a Monserrate.', 'De huecos y trancones tengo doctorado; de eso, nada.'],
    student: ['Pregúnteme del Build Day o del parcial, que de eso sí sé.', 'Hable más despacio, que ando con tres horas de sueño.'],
    oficinista: ['Mande eso por correo. O pregúnteme por el pico y placa.', 'Mejor hablemos de algo útil: ¿hoy tiene pico y placa?'],
    abuela: ['Mijito, hable más duro, que ya no oigo bien. Mejor cuénteme: ¿ya comió?', 'Ay, no entendí, mi vida. ¿Le doy una aguapanelita?'],
    policia: ['Sea claro, ciudadano: ¿necesita indicaciones o va a reportar algo?', 'Si es consulta, pregunte por direcciones o por el pico y placa.'],
    _: ['Pregunte por direcciones, clima o tráfico.'],
  },
};
const WANTED_TAIL = {
  vendor: 'Y hágase lejos, que viene la policía.', walker: 'Y ojo, que la policía viene detrás suyo.', student: 'Y esas sirenas... ¿son por usted?',
  oficinista: 'Y apúrele, que viene la policía.', abuela: 'Y huya, mijito, que viene la policía.', policia: 'Y no se me escape, que lo estoy viendo.',
};
const TIPS = { 'Usaquén': 'el mercado de las pulgas y las obleas', 'Chicó / Parque 93': 'tomarse un tinto en el Parque 93', 'Zona T': 'la rumba y las empanadas con ají', Chapinero: 'el Build Day en el Santo Tomás', Teusaquillo: 'las casas de ladrillo y el parque', 'Centro Internacional': 'mirar la Torre Colpatranca', 'La Candelaria': 'los grafitis y la Plaza de Bolívar' };

function kindOf(ped) { return KINDS.includes(ped?.kind) ? ped.kind : 'walker'; }
const L = (ped, key, v) => pickLine(ped, key, R[key]?.[kindOf(ped)], R[key]?._, v);

function picoText(ctx, kind) {
  const h = ctx?.hour ?? 12;
  if (h < 6 || h >= 21) return 'A esta hora ya no rige el pico y placa, tranquilo. Rige de seis de la mañana a nueve de la noche.';
  if (typeof ctx?.day === 'number' && typeof ctx?.plateDigit === 'number') {
    const odd = ctx.day % 2 === 1, d = ctx.plateDigit;
    const ok = odd ? d >= 1 && d <= 5 : d === 0 || d >= 6;
    const base = `Hoy es día ${odd ? 'impar: circulan las placas terminadas en 1 al 5' : 'par: circulan las placas terminadas en 6 al 0'}.`;
    const mine = ctx.vehicle ? ` La suya termina en ${d}: ${ok ? 'puede circular' : 'NO puede circular, ojo'}.` : '';
    return base + mine;
  }
  return 'Rige de seis de la mañana a nueve de la noche: placa par un día, impar el otro.';
}

// ---------------------------------------------------------------- public API
/** @returns {{reply:string, intent:string, action?:{type:'buy',item:string,qty:number,price:number,label:string}}} */
export function offlineNpcReply(ped = {}, context = {}, message = '') {
  const ctx = context || {};
  const kind = kindOf(ped);
  const m = memOf(ped);
  const det = detectIntent(message, ctx, ped);
  let id = det.id;
  const v = vars(ped, ctx);
  const pos = playerPos(ctx);
  const wanted = ctx.wanted > 0;
  let reply = '', action;

  // wanted: NPC reacts first to generic chatter
  if (wanted && ['greeting', 'fallback', 'ack', 'laugh', 'compliment', 'howareyou'].includes(id)) {
    if (id === 'greeting' || id === 'fallback') id = 'police';
  }

  switch (id) {
    case 'police': reply = L(ped, wanted ? 'police_on' : 'police_off', v); if (wanted) m.wantedSeen = ctx.wanted; break;
    case 'weather': {
      const h = ctx.hour ?? 12;
      const key = ctx.raining ? 'weather_rain' : h >= 21 || h < 5 ? 'weather_night' : h < 15 ? 'weather_pre' : 'weather_dry';
      reply = L(ped, key, v) + ' ' + (R.weather_tail[kind]?.[0] || '');
      break;
    }
    case 'traffic': {
      if (/pico/.test(det.t)) reply = picoText(ctx, kind) + (kind === 'policia' ? ' Cumpla, ciudadano.' : kind === 'oficinista' ? ' Y a mí me toca igual.' : '');
      else reply = L(ped, 'traffic', v);
      if (ctx.vehicle && /\b(carro|moto|taxi|bus|buseta|conduce|manejo)\b/.test(det.t)) reply += ` Y despacio con ese ${ctx.vehicle}, ¿sí?`;
      break;
    }
    case 'directions': {
      if (!det.place) {
        const { lm, dist } = nearestLandmark(pos);
        const d = directionsTo(lm, pos);
        reply = `¿Pa' dónde va, sumercé? Por aquí cerca queda ${lm.name}. ${dist < lm.radius + 25 ? 'Casi que lo pisa.' : d.text} Si no, pregunte por Monserrate, La Candelaria o la Zona T.`;
        break;
      }
      const d = directionsTo(det.place, pos);
      const nm = d.name;
      const WR = {
        vendor: [`${d.text} Y de paso, lléveme {item}, ¿sí?`, `¿Pa' ${nm}? ${d.text} Pero antes, ¿no le provoca algo?`],
        walker: [`Para ${nm}: ${d.text}`, `Uy, ${nm}, ¡qué plan! ${d.text}`],
        student: [`${nm}? ${d.text} Yo iría en bus, pero ando misio.`, `${d.text} Y si llega tarde, la culpa es del trancón.`],
        oficinista: [`${d.text} Con afán, que yo ya voy tarde.`, `${nm}: ${d.text} Si va en carro, revise el pico y placa.`],
        abuela: [`Ay, mijito, ${nm}... ${d.text} Y abríguese, que hace frío.`, `${d.text} Vaya despacio, mi vida, que los carros andan como locos.`],
        policia: [`Con gusto, ciudadano. ${d.text} Y respete los semáforos.`, `Para ${nm}: ${d.text} Cualquier duda, me avisa.`],
      };
      reply = pickLine(ped, 'dir:' + det.place.id, WR[kind], WR.walker, { ...v, item: `${ITEMS[productOf(ped) || 'tinto'].art} ${ITEMS[productOf(ped) || 'tinto'].label}` });
      break;
    }
    case 'where_am_i': {
      const { lm } = nearestLandmark(pos);
      reply = L(ped, 'where_am_i', { ...v, near: `Cerquita de ${lm.name}.` });
      break;
    }
    case 'time': reply = L(ped, 'time', v); break;
    case 'price':
    case 'buy':
    case 'menu': {
      const key = det.item;
      const own = productOf(ped);
      if (kind !== 'vendor') {
        if (id === 'menu') { reply = L(ped, 'menu', v); break; }
        if (id === 'buy' && kind === 'abuela') { const k = key || 'almojabana'; reply = `Ay, mijito, tome ${ITEMS[k].art} ${ITEMS[k].label}, que a la abuela no se le paga. Pero cuídese, ¿oyó?`; break; }
        const ref = key ? `${ITEMS[key].art} ${ITEMS[key].label} anda por ${cop(ITEMS[key].price)}` : `un tinto anda por ${cop(ITEMS.tinto.price)}`;
        const NV = {
          price: { walker: [`Yo no vendo nada, parce. Por ahí ${ref}; pregúntele a un vendedor.`], student: [`Yo no vendo, parce, yo compro... cuando hay plata. Por ahí ${ref}.`], oficinista: [`Eso no es conmigo, veci. Yo solo sé que ${ref}, y mi corrientazo, doce mil.`], abuela: [`Ay, mijito, yo no vendo nada. Pero ${ref}, ¡y eso que está carísimo!`], policia: ['Yo no vendo nada, ciudadano. Solo comparendos, y esos no tienen descuento.'] },
          buy: { walker: ['Yo no vendo nada, parce. Busque al vendedor de la esquina, que ese sí tiene de todo.'], student: ['¡Ojalá tuviera algo para vender, parce! Ando es comprando. Si me invita un tinto, le cuento todo.'], oficinista: ['Yo no soy vendedor, veci; solo vendo mi alma a la oficina.'], policia: ['¿Dame qué? Aquí el que pide papeles soy yo, sumercé.'] },
        };
        const bank = NV[id === 'buy' ? 'buy' : 'price'];
        reply = pickLine(ped, 'nv' + id, bank[kind], bank.walker || bank.student, v);
        break;
      }
      // vendor
      if (!key && id === 'price') { reply = pickLine(ped, 'vprice', [`La {product} le sale a {price}, sumercé, ¡regalada!`, `{product}: {price}. Y si lleva dos, le hago la rebajita... de a cien pesos.`, `A {price}, veci. Más barato solo el aire, y ese está contaminado.`], null, v); break; }
      if (!key) { reply = id === 'buy' ? pickLine(ped, 'vask', ['¿Qué le sirvo, veci? Tengo {product}, a {price}.', 'Dígame qué le provoca: aquí tengo {product}, a {price}.'], null, v) : L(ped, 'menu', v); break; }
      if (key !== own && !(own === 'tinto' && key === 'tinto')) {
        reply = `${ITEMS[key].label[0].toUpperCase() + ITEMS[key].label.slice(1)}? Eso no lo manejo, sumercé. Lo mío es ${v.product}, a ${v.price}. ¿Le sirvo?`;
        break;
      }
      const unit = priceOf(ped, key), qty = id === 'buy' ? det.qty : 1, total = unit * qty;
      if (id === 'price') { reply = pickLine(ped, 'vp2', [`${ITEMS[key].label[0].toUpperCase() + ITEMS[key].label.slice(1)}: ${cop(unit)}, veci. Calientico y recién hecho.`, `A ${cop(unit)} cada ${ITEMS[key].label}, sumercé. ¡Lléveme dos y le sonrío doble!`], null, v); break; }
      if (typeof ctx.money === 'number' && ctx.money < total) { reply = `Uy, veci, le faltan lucas: son ${cop(total)} y usted lleva ${cop(ctx.money)}. Vuelva cuando se rebusque.`; break; }
      action = { type: 'buy', item: key, qty, price: total, label: ITEMS[key].label };
      reply = pickLine(ped, 'vbuy', [
        `¡Tome, veci! ${qty > 1 ? qty + ' ' + ITEMS[key].label + 's' : ITEMS[key].art + ' ' + ITEMS[key].label} calientico. Son ${cop(total)}, ¡gracias!`,
        `Aquí tiene, sumercé: ${qty > 1 ? qty + ' ' + ITEMS[key].label + 's' : ITEMS[key].label}. ${cop(total)} pesitos, y que le rinda.`,
        `¡De una! Servido. Son ${cop(total)}; lo demás es cariño.`,
      ], null, v);
      break;
    }
    case 'advice': reply = L(ped, 'advice', { ...v, tip: TIPS[ctx.district] || 'caminar y tomarse un tinto' }); break;
    case 'topic': reply = L(ped, 'topic', v); break;
    case 'fallback': {
      reply = `${pickLine(ped, 'fbp', R.fallbackPre._, null, v)} ${pickLine(ped, 'fbs', R.fallbackSteer[kind], R.fallbackSteer._, v)}`;
      break;
    }
    default: reply = L(ped, id, v) || L(ped, 'fallbackPre', v);
  }

  if (wanted && m.wantedSeen < ctx.wanted && id !== 'police' && !['bye', 'insult', 'threat', 'innocent', 'bribe'].includes(id) && WANTED_TAIL[kind] && reply.length < 170) {
    reply += ' ' + WANTED_TAIL[kind];
    m.wantedSeen = ctx.wanted;
  }
  m.intents.push(id);
  const out = { reply: reply.replace(/\s+/g, ' ').trim(), intent: id };
  if (action) out.action = action;
  return out;
}

const OPEN = {
  wanted: {
    vendor: ['¡Shhh! ¿Esas sirenas son por usted, sumercé? Hágase pa\' allá, que me espantan los clientes.', '¡Ay, no, la policía! No se me arrime al carrito, veci.'],
    walker: ['¡Uy, parce! ¿Esas sirenas son por usted? Yo no vi nada, ¿ya?', 'Mejor ni me hable, que viene la policía y yo no quiero testificar.'],
    student: ['¡Parce, esas sirenas! ¿Usted qué hizo? Yo no lo conozco, ¿ah?', 'Uy, qué mamera. ¿Lo persigue la policía? Yo estaba estudiando.'],
    oficinista: ['¡Uy! ¿Esas sirenas son suyas? Con permiso, que yo tengo reunión y no quiero ser testigo.', 'Veci, aléjese, que con la policía detrás me van a hacer llegar tarde.'],
    abuela: ['¡Ay, Virgen santa, mijito! ¿Por qué viene con la policía detrás? Entréguese, mi vida.', 'Mijito, ¿qué hizo? Pida disculpas y se le pasa.'],
    policia: ['¡Alto ahí, sumercé! Tiene {n} estrella(s). Entréguese y le invito un tinto.', '¡Pare! Con esas sirenas detrás, ya sabe cómo se llama esto: persecución. Colabore.'],
  },
  rain: {
    vendor: ['¡Aguacero, veci! Venga bajo mi sombrilla y compre un {product} calientico.'], walker: ['¡Qué aguacero, parce! Y yo sin paraguas.', 'Ya cayó el agua de las tres, ¿vio? Nunca falla.'],
    student: ['Parce, ¡llueve y mi tarea se moja! Qué mamera. ¿Qué más?'], oficinista: ['Buenas. Menos mal traje paraguas; para eso sí soy precavido.'],
    abuela: ['¡Ay, mijito, está lloviendo! Venga, arrímese, que se moja y se enferma.'], policia: ['Buenas. Con lluvia, a manejar despacio, ¿oyó?'],
  },
  night: {
    vendor: ['¡A estas horas todavía vendiendo, veci! ¿Le sirvo {product} para el frío?'], walker: ['Uy, a estas horas por {district}, y con este frío. ¿Qué más, veci?'],
    student: ['Parce, a esta hora solo estudia el que no estudió antes. ¿Usted qué hace despierto?'], oficinista: ['¿A esta hora todavía en la calle? Yo también, el jefe no perdona.'],
    abuela: ['Mijito, ¿qué hace en la calle a esta hora? ¡Con el frío que hace!'], policia: ['{saludo}, ciudadano. A esta hora, juicioso.'],
  },
  vehicle: {
    vendor: ['¡Qué {vehicle}! Estacione y le sirvo un {product}.'], walker: ['Ey, qué {vehicle}, parce. ¡No me atropelle!'], student: ['¡Parce, qué {vehicle} tan bacano! ¿Me lleva al Santo Tomás?'],
    oficinista: ['Buen {vehicle}. ¿Tiene pico y placa hoy? Pregunto por usted.'], abuela: ['¡Ay, mijito, qué {vehicle}! Despacio, que me asusto.'], policia: ['Buenas. Ese {vehicle}: documentos al día, ¿cierto?'],
  },
  day: {
    vendor: ['{saludo}, veci. ¡A la orden con {product}: {price}! ¿Le sirvo?', '¡{product}, fresquecito! ¿Qué se le ofrece, sumercé?', '¡Ey, veci! Esta es la mejor esquina de {district}. ¿Le provoca algo?'],
    walker: ['{saludo}, parce. ¿Qué más, todo bien por {district}?', 'Quiubo, veci. ¿Perdido o paseando?', 'Ey, qué hubo. Con este frío uno solo habla pa\' no congelarse.'],
    student: ['{saludo}, parce. Ando repasando, pero dígame.', 'Quiubo. ¿No tendrá un tinto? Llevo desde las cuatro sin dormir.', '¡Ey! ¿Va para el Build Day? Eso está bacano.'],
    oficinista: ['{saludo}. Tengo reunión en diez minutos, ¿en qué le ayudo?', 'Perdone el afán, pero dígame, rapidito.', 'Buenas. Si es sobre el informe, no estoy; si no, adelante.'],
    abuela: ['{saludo}, mijito. ¿Ya comió?', 'Ay, qué amable. ¿Cómo está, mi vida?', 'Bendito sea Dios, por fin alguien que saluda. ¿Qué necesita, mi amor?'],
    policia: ['{saludo}, ciudadano. Circule tranquilo, ¿sí?', 'A la orden. Recuerde: respete el pico y placa.', 'Buenas. Cualquier novedad, me avisa.'],
  },
};
/** Context-aware opener (priority: wanted > rain > night > vehicle > time of day). */
export function npcGreeting(ped = {}, ctx = {}) {
  const kind = kindOf(ped);
  const h = ctx?.hour ?? 12;
  const v = vars(ped, ctx);
  let bucket = 'day';
  if (ctx?.wanted > 0) bucket = 'wanted';
  else if (ctx?.raining && OPEN.rain[kind]) bucket = 'rain';
  else if ((h >= 21 || h < 5) && OPEN.night[kind]) bucket = 'night';
  else if (ctx?.vehicle && hash(ped?.name || '') % 2 === 0) bucket = 'vehicle';
  return pickLine(ped, 'open:' + bucket, OPEN[bucket][kind], OPEN.day[kind], v);
}

// ---------------------------------------------------------------- quick replies
/** Up to 4 relevant chips, skipping topics already covered in this conversation. */
export function quickReplies(ped = {}, ctx = {}, used = []) {
  const kind = kindOf(ped);
  const own = productOf(ped) || 'tinto';
  const it = ITEMS[own];
  const C = {
    vendor: [['price', `¿Cuánto vale ${it.art === 'una' ? 'la' : 'el'} ${it.label.split(' ')[0]}?`], ['buy', `Deme ${it.art} ${it.label.split(' con ')[0]}`], ['directions', '¿Dónde queda Monserrate?'], ['topic', '¿Cómo va el negocio?'], ['weather', '¿Va a llover?'], ['identity', '¿Cómo se llama?']],
    walker: [['greeting', '¿Qué más, veci?'], ['directions', '¿Cómo llego a Monserrate?'], ['weather', '¿Va a llover?'], ['traffic', '¿Cómo está el trancón?'], ['advice', '¿Qué me recomienda hacer?'], ['identity', '¿Quién es usted?']],
    student: [['buildday', '¿Qué es el Build Day?'], ['topic', '¿Tiene parcial?'], ['directions', '¿Dónde queda Santo Tomás?'], ['ai', '¿Usted usa IA?'], ['menu', '¿Tiene hambre?'], ['weather', '¿Va a llover?']],
    oficinista: [['traffic', '¿Hay pico y placa hoy?'], ['topic', '¿Por qué tanto afán?'], ['directions', '¿Dónde queda la Zona T?'], ['menu', '¿Qué almuerza hoy?'], ['time', '¿Qué hora es?'], ['weather', '¿Va a llover?']],
    abuela: [['howareyou', '¿Cómo está, abuelita?'], ['menu', '¿Qué me recomienda comer?'], ['city', '¿Cómo era antes Bogotá?'], ['weather', '¿Hace frío, no?'], ['directions', '¿Dónde queda la Candelaria?'], ['advice', '¿Qué hay por aquí?']],
    policia: [['innocent', 'Yo no hice nada, sumercé'], ['traffic', '¿Hay pico y placa hoy?'], ['directions', '¿Dónde queda la Plaza de Bolívar?'], ['police', '¿Hay policías cerca?'], ['time', '¿Qué hora es?'], ['advice', '¿Qué me recomienda hacer?']],
  }[kind];
  const list = ctx?.wanted > 0 ? [['police', kind === 'policia' ? 'Yo no hice nada, sumercé' : '¿Me están buscando?'], ...C.filter((c) => c[0] !== 'innocent')] : C;
  const seen = new Set();
  return list.filter(([k, t]) => !used.includes(k) && !seen.has(t) && seen.add(t)).slice(0, 4).map(([k, t]) => ({ intent: k, text: t }));
}

/** Name of the landmark closest to the player (for prompts / "where am I"). */
export function nearestPlaceName(ctx = {}) {
  try { return nearestLandmark(playerPos(ctx)).lm?.name || ''; } catch { return ''; }
}

/** Used when Claude answered: record the topic (for chips) and detect a valid vendor purchase so the game can charge it. */
export function observeTurn(ped = {}, context = {}, message = '') {
  const det = detectIntent(message, context, ped);
  memOf(ped).intents.push(det.id);
  if (det.id !== 'buy' || kindOf(ped) !== 'vendor' || !det.item || det.item !== productOf(ped)) return null;
  const total = priceOf(ped, det.item) * det.qty;
  if (typeof context.money === 'number' && context.money < total) return null;
  return { type: 'buy', item: det.item, qty: det.qty, price: total, label: ITEMS[det.item].label };
}
