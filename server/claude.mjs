// Claude integration for GTA Bogotá — NPC dialogue + radio DJ lines.
// Uses the official SDK. Works without a key (callers check `aiEnabled()` and use offline lines).
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = () => process.env.CLAUDE_MODEL || 'claude-opus-5-5';
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

let client = null;
// User-scoped keys (sk-ant-usr-…) must name a workspace via the anthropic-workspace-id header.
const workspaceHeaders = () => (process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : undefined);
const getClient = () => (client ??= new Anthropic({ timeout: 20_000, maxRetries: 1, defaultHeaders: workspaceHeaders() }));

// ---------- optional persona.mjs (owned by the lead) ----------
let personaMod = null;
let personaTriedAt = 0;
async function loadPersona() {
  if (personaMod) return personaMod;
  if (Date.now() - personaTriedAt < 5000) return {};
  personaTriedAt = Date.now();
  try {
    personaMod = await import('./persona.mjs');
    console.log('[persona] using server/persona.mjs prompts');
    return personaMod;
  } catch {
    return {}; // not there (yet): defaults below
  }
}

// ---------- fallbacks ----------
const REFUSAL_LINES = [
  'Uy, parce, mejor hablemos de otra cosa, ¿no? Mire que hoy está lloviendo y toca resguardarse.',
  'Eh, eso sí no se lo puedo contestar, sumercé. ¿Le provoca un tintico mejor?',
  'Ay no, qué pereza ese tema, veci. Cuénteme más bien cómo le fue con el trancón.',
];
const SERVER_OFFLINE_NPC = [
  '¡Hola, veci! Hoy ando sin saldo en la cabeza, pero igual se le quiere. ¡Cuídese del hueco de la esquina!',
  '¿Qué más, parce? Mire que llueve a las tres, no se le olvide el paraguas.',
];
const SERVER_OFFLINE_RADIO = [
  'Trancón al Aire: hay trancón en toda la ciudad, o sea, lo normal. Paciencia y buena música.',
  'Y recuerden: el pico y placa no perdona, pero la cumbia sí. ¡Sigan sintonizados!',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const offlineNpcLine = () => pick(SERVER_OFFLINE_NPC);
export const offlineRadioLine = () => pick(SERVER_OFFLINE_RADIO);
export const refusalLine = () => pick(REFUSAL_LINES);

// ---------- default prompts ----------
const KIND_HINTS = {
  vendor: 'vendedor ambulante de la calle: carismático, regatea, ofrece tinto, obleas, empanadas o mango biche; vive de la calle y se pone nervioso si hay policía cerca.',
  walker: 'transeúnte rolo tranquilo: pasea con su ruana, se queja del clima, del trancón y de los huecos, pero con humor.',
  student: 'estudiante universitario (Santo Tomás): cansado, con afán, habla de parciales, de la beca, del bus y de cómo "llegó tarde otra vez".',
  oficinista: 'oficinista estresado con corbata y paraguas: habla de reuniones, del jefe, del pico y placa y del almuerzo corrientazo.',
  abuela: 'abuela dulce y cuchara: llama a todos "mijito/mijita" y "mi vida", da consejos, ofrece onces y se asusta con los carros veloces.',
  policia: 'agente de la Policía Nacional (parodia amistosa): formal pero buena gente, preocupado por el pico y placa y el desorden vial. Nunca violento.',
};

function defaultNpcSystem(ped = {}, ctx = {}) {
  const kind = ped.kind || 'walker';
  return [
    `Eres ${ped.name || 'un ciudadano de Bogotá'}, un personaje (${kind}) en "GTA Bogotá", un juego de mundo abierto estilo parodia ambientado en Bogotá, Colombia.`,
    `Tu rol: ${KIND_HINTS[kind] || KIND_HINTS.walker}`,
    ped.persona ? `Personalidad específica: ${ped.persona}` : '',
    `Voz: español colombiano, acento rolo, cálido y chistoso. Usa con naturalidad palabras como parce, chévere, bacano, sumercé, veci, qué boleta, trancón, vaina, lucas, onces, paila, hacer vaca.`,
    `Reglas: responde con 1 a 3 frases CORTAS (máximo ~45 palabras en total). Habla siempre en personaje; no rompas la cuarta pared. No menciones que eres una IA ni un modelo, a menos que el jugador te lo pregunte directamente; en ese caso responde con humor y vuelve al personaje.`,
    `Contenido: PG-13. Prohibido usar groserías fuertes o insultos (nunca: gonorrea, malparido, hijueputa, ni similares). Nada de marcas reales: usa parodias (TransMilagro, SITPaciencia, Rapidín, Torre Colpatranca, Tinto Don Aurelio, Corrientazo Doña Gloria, Supermercado El Exitazo, gaseosa La Rolombiana). Sin violencia gráfica, sin glorificar el narcotráfico, sin contenido sexual. Es un juego de caos y manejo: choques, trancones y persecuciones de dibujos animados.`,
    `Responde solo con lo que dice el personaje, sin comillas, sin acotaciones entre asteriscos, sin emojis excesivos.`,
    contextBlock(ctx),
    reactions(kind, ctx),
  ].filter(Boolean).join('\n\n');
}

function reactions(kind, c = {}) {
  const bits = [];
  if (c.wanted > 0) {
    bits.push(
      kind === 'policia'
        ? `El jugador tiene ${c.wanted} estrella(s) de búsqueda: reacciona con autoridad exagerada y cómica ("¡Pare ahí, sumercé!").`
        : kind === 'vendor'
          ? `La policía anda detrás del jugador (${c.wanted} estrellas): estás nervioso, quieres que se aleje de tu carrito, habla bajito y rápido.`
          : `La policía persigue al jugador (${c.wanted} estrellas): reacciónale con susto o chisme, según tu personaje.`,
    );
  }
  if (c.raining) bits.push('Está lloviendo: menciónalo si viene al caso (paraguas, ruana, "llueve a las tres").');
  if (typeof c.hour === 'number' && (c.hour >= 22 || c.hour < 5)) bits.push('Es de noche: comenta el frío o lo tarde que es.');
  if (c.vehicle) bits.push(`El jugador anda en: ${c.vehicle}. Puedes comentarlo.`);
  return bits.length ? `Reacciones sugeridas: ${bits.join(' ')}` : '';
}

function fmtHour(h) {
  if (typeof h !== 'number' || !isFinite(h)) return null;
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function contextBlock(c = {}) {
  const lines = [];
  if (c.district) lines.push(`Barrio/zona: ${c.district}`);
  const t = fmtHour(c.hour);
  if (t) lines.push(`Hora: ${t}`);
  if (c.raining != null) lines.push(`Lluvia: ${c.raining ? 'sí' : 'no'}`);
  if (c.wanted != null) lines.push(`Estrellas de búsqueda del jugador: ${c.wanted}`);
  if (c.money != null) lines.push(`Plata del jugador: COP ${c.money}`);
  if (c.vehicle) lines.push(`Vehículo del jugador: ${c.vehicle}`);
  return lines.length ? `Contexto actual del juego:\n- ${lines.join('\n- ')}` : '';
}

function defaultRadioSystem(station = {}, ctx = {}) {
  const name = station.name || 'la radio';
  const talk = station.genre === 'talk' || /trancón/i.test(name);
  const base = [
    `Eres el locutor de radio de "GTA Bogotá", un juego parodia de mundo abierto en Bogotá, Colombia. Hablas en español colombiano (rolo), con mucha chispa.`,
    talk
      ? `Estación: "Trancón al Aire", noticiero de tráfico. Da un boletín de 1 a 2 frases, chistoso e inventado: trancones absurdos, huecos que ya tienen nombre propio, pico y placa, TransMilagro lleno, lluvia a las 3, obras eternas, un ciclista y un taxi en discusión. Tono de noticiero dramático.`
      : `Estación: "${name}" (género: ${station.genre || 'variado'}). Da una intro-hype de 1 a 2 frases entre canciones: saluda, grita el nombre de la emisora, anuncia la próxima canción en general (sin inventar nombres de artistas reales ni canciones reales) y mete un chiste local.`,
    `Reglas: máximo 2 frases cortas (~35 palabras). PG-13, sin groserías fuertes (nunca: gonorrea, malparido, hijueputa). Sin marcas reales (parodias: TransMilagro, SITPaciencia, Rapidín, Torre Colpatranca, La Rolombiana). Sin glorificar narcotráfico ni violencia. Responde solo con lo que dice el locutor, sin comillas ni acotaciones.`,
    contextBlock(ctx),
  ];
  if (ctx?.recent?.length) base.push(`Evita repetir estas líneas recientes: ${ctx.recent.slice(-3).join(' | ')}`);
  if (ctx?.wanted > 0) base.push('Dato opcional: hay una persecución policial en curso en la ciudad; puedes mencionarlo como noticia de última hora.');
  return base.filter(Boolean).join('\n\n');
}

// ---------- core ----------
function textOf(response) {
  return (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function cleanLine(s) {
  return s.replace(/^["“”«»]+|["“”«»]+$/g, '').replace(/\*[^*]*\*/g, '').replace(/\s+/g, ' ').trim();
}

async function ask({ system, messages, maxTokens = 1024 }) {
  const response = await getClient().messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    output_config: { effort: 'low' },
    system,
    messages,
  });
  if (response.stop_reason === 'refusal') return { refusal: true, text: '' };
  return { refusal: false, text: cleanLine(textOf(response)) };
}

// Normalize history into a valid alternating list that starts with `user` and ends with the new user message.
function buildMessages(history, message) {
  const out = [];
  for (const h of history) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const content = String(h.content ?? '').slice(0, 600);
    if (!content) continue;
    if (!out.length && role !== 'user') continue; // must start with user
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n${content}`;
    else out.push({ role, content });
  }
  if (out.length && out[out.length - 1].role === 'user') out[out.length - 1].content += `\n${message}`;
  else out.push({ role: 'user', content: message });
  return out;
}

export async function npcReply({ ped, history, message, context }) {
  const persona = await loadPersona();
  let system;
  try {
    system = persona.buildNpcSystemPrompt?.(ped, context);
  } catch (err) {
    console.warn('[persona] buildNpcSystemPrompt failed:', err.message);
  }
  system ||= defaultNpcSystem(ped, context);
  const { refusal, text } = await ask({ system, maxTokens: 300, messages: buildMessages(history, message) });
  return refusal || !text ? refusalLine() : text;
}

export async function radioLine({ station, context }) {
  const persona = await loadPersona();
  let system;
  try {
    system = persona.buildRadioSystemPrompt?.(station, context);
  } catch (err) {
    console.warn('[persona] buildRadioSystemPrompt failed:', err.message);
  }
  system ||= defaultRadioSystem(station, context);
  const seed = Math.random().toString(36).slice(2, 6);
  const { refusal, text } = await ask({
    system,
    maxTokens: 400,
    messages: [{ role: 'user', content: `Dame tu próxima intervención al aire. (variación ${seed})` }],
  });
  return refusal || !text ? offlineRadioLine() : text;
}

export { Anthropic };
