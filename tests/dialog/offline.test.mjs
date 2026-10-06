// node tests/dialog/offline.test.mjs — offline intent engine sanity (no deps).
import assert from 'node:assert/strict';
import { detectIntent, offlineNpcReply, npcGreeting, quickReplies, resetOfflineMemory, beginConversation } from '../../src/net/offline.js';

const ped = (kind, extra = {}) => ({ id: kind, name: { vendor: 'Don Aurelio Rincón', walker: 'Camilo Pardo', student: 'Valentina Gómez', oficinista: 'Álvaro Torres', abuela: 'Doña Stella Moreno', policia: 'Agente Ramírez' }[kind], kind, ...extra });
const vendor = () => ped('vendor', { extra: { product: 'tinto', place: 'Universidad Santo Tomás' }, vendor: { sub: '¡caliente! · $1.000' } });
const ctx = { district: 'Chapinero', hour: 11, raining: false, wanted: 0, money: 50000, pos: { x: 0, z: 0 }, day: 1, plateDigit: 7 };

// [kind, input, expected intent, extra ctx]
const CASES = [
  ['vendor', '¿Cuánto vale?', 'price'], ['vendor', 'cuanto la empanada', 'price'], ['vendor', 'Deme un tinto', 'buy'], ['vendor', 'quiero dos tintos', 'buy'],
  ['vendor', '¿Qué vende?', 'menu'], ['vendor', 'tengo hambre', 'menu'], ['vendor', 'Hola, buenas tardes', 'greeting'], ['vendor', 'qué más veci', 'greeting'],
  ['walker', '¿Dónde queda Monserrate?', 'directions'], ['walker', 'cómo llego a la Zona T', 'directions'], ['walker', 'dónde queda la Candelaria?', 'directions'],
  ['walker', 'cómo llego al TransMilagro', 'directions'], ['walker', '¿Va a llover?', 'weather'], ['walker', 'qué frío tan hijo', 'weather'],
  ['walker', '¿Cómo está el trancón?', 'traffic'], ['walker', 'hay pico y placa hoy?', 'traffic'], ['walker', 'cómo te llamas', 'identity'],
  ['walker', 'eres una IA?', 'ai'], ['walker', 'eres un robot', 'ai'], ['walker', 'qué hora es', 'time'], ['walker', 'dónde estoy', 'where_am_i'],
  ['student', '¿Qué es el Build Day?', 'buildday'], ['student', 'tienes parcial?', 'topic'], ['student', 'qué estudias', 'topic'], ['student', 'dónde queda Santo Tomás', 'directions'],
  ['oficinista', 'tienes reunión con el jefe?', 'topic'], ['oficinista', 'Chao, gracias', 'bye'], ['oficinista', 'muchas gracias', 'thanks'],
  ['abuela', 'hola abuelita', 'greeting'], ['abuela', 'cómo está abuelita', 'howareyou'], ['abuela', 'eres muy amable', 'compliment'], ['abuela', 'me caes bien', 'compliment'],
  ['abuela', 'qué me recomienda hacer', 'advice'], ['abuela', 'usted es una tonta', 'insult'],
  ['policia', 'yo no hice nada sumercé', 'innocent'], ['policia', 'le doy plata y arreglamos', 'bribe'], ['policia', '¿hay policías cerca?', 'police'],
  ['policia', 'me persiguen los tombos', 'police'], ['policia', 'esto es un atraco', 'threat'], ['walker', 'jajaja', 'laugh'], ['walker', 'listo', 'ack'],
  ['walker', 'qué opina del fútbol, azules?', 'football'], ['walker', 'qué canción suena en la radio', 'music'], ['walker', 'asdkjh qwe', 'fallback'],
  ['walker', 'cómo es Bogotá?', 'city'], ['vendor', 'cómo va el negocio', 'topic'],
];
let n = 0;
for (const [kind, input, want] of CASES) {
  const got = detectIntent(input, ctx, kind === 'vendor' ? vendor() : ped(kind)).id;
  assert.equal(got, want, `[${kind}] "${input}" → ${got}, expected ${want}`);
  n++;
}
console.log(`intents ok (${n} cases)`);

// replies are non-empty, in Spanish, never the old nonsense, no repeats back-to-back
for (const kind of ['vendor', 'walker', 'student', 'oficinista', 'abuela', 'policia']) {
  resetOfflineMemory();
  const p = kind === 'vendor' ? vendor() : ped(kind);
  beginConversation(p);
  const seen = new Set();
  for (const msg of ['hola', 'cuánto vale', 'dónde queda Monserrate', 'va a llover', 'quién eres', 'asdf', 'asdf', 'chao']) {
    const r = offlineNpcReply(p, ctx, msg);
    assert.ok(r.reply && r.reply.length > 5 && r.reply.length < 320, `${kind}/${msg}: bad reply "${r.reply}"`);
    assert.ok(!/sin saldo en la cabeza/.test(r.reply));
    assert.ok(!/\{\w+\}/.test(r.reply), `unfilled template: ${r.reply}`);
    if (msg === 'asdf') { assert.ok(!seen.has(r.reply), `repeated fallback: ${r.reply}`); seen.add(r.reply); }
  }
}
console.log('replies ok for all kinds');

// directions use real relative geometry (Monserrate east; Zona T north of Centro)
resetOfflineMemory();
assert.match(offlineNpcReply(ped('walker'), { ...ctx, pos: { x: 0, z: 400 } }, 'dónde queda Zona T').reply, /norte/);
assert.match(offlineNpcReply(ped('walker'), ctx, 'dónde queda Monserrate').reply, /cerros|oriente/);
assert.match(offlineNpcReply(ped('walker'), { ...ctx, pos: { x: 0, z: -500 } }, 'cómo llego a La Candelaria').reply, /sur/);

// wanted: NPC reacts to the police first
resetOfflineMemory();
const w = offlineNpcReply(ped('walker'), { ...ctx, wanted: 3 }, 'hola');
assert.equal(w.intent, 'police'); assert.match(w.reply, /sirena|policía|nada/i);
assert.match(npcGreeting(ped('policia'), { ...ctx, wanted: 2 }), /Alto|Pare|estrella/);
assert.match(npcGreeting(ped('abuela'), { ...ctx, raining: true }), /llov|agua|moja/i);

// buying: success returns an action; not enough money does not; other kinds never charge
resetOfflineMemory();
let b = offlineNpcReply(vendor(), ctx, 'deme un tinto');
assert.equal(b.action?.type, 'buy'); assert.equal(b.action.price, 1000); assert.equal(b.action.item, 'tinto');
b = offlineNpcReply(vendor(), ctx, 'deme dos tintos'); assert.equal(b.action.price, 2000);
b = offlineNpcReply(vendor(), { ...ctx, money: 100 }, 'deme un tinto'); assert.equal(b.action, undefined); assert.match(b.reply, /faltan/);
b = offlineNpcReply(vendor(), ctx, 'deme una empanada'); assert.equal(b.action, undefined); assert.match(b.reply, /no lo manejo/);
assert.equal(offlineNpcReply(ped('walker'), ctx, 'deme un tinto').action, undefined);

// pico y placa uses day + plate
assert.match(offlineNpcReply(ped('policia'), ctx, 'hay pico y placa hoy').reply, /impar/);

// chips are relevant and shrink as topics get used
const chips = quickReplies(vendor(), ctx, []);
assert.ok(chips.length >= 3 && chips.some((c) => /Deme un tinto/.test(c.text)), JSON.stringify(chips));
assert.ok(!quickReplies(vendor(), ctx, ['price']).some((c) => c.intent === 'price'));
for (const c of quickReplies(ped('policia'), ctx, [])) assert.ok(c.text.length > 3);
// every chip text maps to its own intent
for (const kind of ['vendor', 'walker', 'student', 'oficinista', 'abuela', 'policia']) {
  const p = kind === 'vendor' ? vendor() : ped(kind);
  for (const c of quickReplies(p, ctx, [])) { const got = detectIntent(c.text, ctx, p).id; assert.equal(got, c.intent, `chip "${c.text}" (${kind}) → ${got}, expected ${c.intent}`); }
}
console.log('all offline dialogue tests passed');
