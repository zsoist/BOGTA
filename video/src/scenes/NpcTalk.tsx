import React from 'react';
import { AbsoluteFill, Img, Sequence } from 'remotion';
import { SmartMedia } from '../components/SmartMedia';
import { ChatBubbles, type ChatMsg } from '../components/ChatBubbles';
import { RadioDial, STATIONS } from '../components/RadioDial';
import { WhipPan } from '../components/WhipPan';
import { RainOverlay } from '../components/RainOverlay';
import { KineticText } from '../components/KineticText';
import { IMG } from '../lib/assets';
import { ramp, useBeats } from '../lib/anim';
import { C, EZ, FONT } from '../theme';

const THUMBS = [
  { src: IMG.abuela, name: 'DOÑA GLORIA' },
  { src: IMG.vendor, name: 'VENDEDOR' },
  { src: IMG.walker, name: 'ROLO' },
  { src: IMG.student, name: 'ESTUDIANTE' },
  { src: IMG.oficinista, name: 'OFICINISTA' },
  { src: IMG.policia, name: 'POLICÍA' },
];

/** Act 5a — split screen: the player talks to Doña Gloria, reply typed live with an ElevenLabs waveform. */
const ChatHalf: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { frame, b, width, height } = useBeats();
  const u = Math.min(width / 1920, height / 1080);
  const msgs: ChatMsg[] = [
    { who: 'player', text: '¿Qué más, Doña Gloria?', at: b(vertical ? 0.6 : 1), cps: 0.55 },
    { who: 'npc', text: '¡Ay, mijo, qué más va a ser! Aquí, aguantando el aguacero de las tres. Y cuidado, que la policía anda preguntando por un taxi amarillo... ¿usted no sabrá nada, cierto?', at: b(vertical ? 1.8 : 3.2), cps: vertical ? 1.5 : 1.05 },
  ];
  const selIdx = frame < b(8) ? 0 : Math.min(THUMBS.length - 1, Math.floor((frame - b(8)) / b(0.5)));
  const split = 1130 * u; // slanted split x at top
  const panelW = width - split - 60 * u;
  const panelH = height - 150 * u;

  if (vertical) {
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ height: '46%' }}>
          <SmartMedia name="npc-talk" duration={b(6)} />
          <RainOverlay intensity={0.4} drops={5} seed="npcv" />
        </AbsoluteFill>
        <div style={{ position: 'absolute', left: 36, right: 36, top: '47%', bottom: 150 }}>
          <ChatBubbles messages={msgs} npcName="DOÑA GLORIA" npcRole="Empanadas · La Candelaria" portrait={IMG.abuela} width={width - 72} height={height * 0.53 - 190} at={0} scale={0.82} />
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      {/* left: dialogue camera */}
      <AbsoluteFill style={{ clipPath: `polygon(0 0, ${split + 40 * u}px 0, ${split - 40 * u}px 100%, 0 100%)` }}>
        <SmartMedia name="npc-talk" duration={b(11)} />
        <RainOverlay intensity={0.45} drops={6} seed="npc" />
        <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5))' }} />
      </AbsoluteFill>
      {/* slanted divider */}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <line x1={split + 40 * u} y1={0} x2={split - 40 * u} y2={height} stroke="#000" strokeWidth={16 * u} />
        <line x1={split + 40 * u + 14 * u} y1={0} x2={split - 40 * u + 14 * u} y2={height} stroke={C.gold} strokeWidth={3 * u} opacity={0.8} />
      </svg>
      {/* right: dark glass + chat */}
      <AbsoluteFill style={{ left: split - 40 * u, background: 'radial-gradient(circle at 70% 30%, #1B2036, #0B0B0F 70%)', clipPath: `polygon(40px 0, 100% 0, 100% 100%, -40px 100%)` }} />
      <div style={{ position: 'absolute', left: split + 20 * u, top: 60 * u }}>
        <ChatBubbles messages={msgs} npcName="DOÑA GLORIA" npcRole="Vendedora de empanadas · La Candelaria" portrait={IMG.abuela} width={panelW - 20 * u} height={panelH - 40 * u} at={b(0.2)} scale={u * 1.02} />
      </div>
      {/* prompt chip + NPC kinds */}
      <div style={{ position: 'absolute', left: 70 * u, bottom: 64 * u, display: 'flex', flexDirection: 'column', gap: 18 * u }}>
        <div style={{ display: 'flex', gap: 30 * u }}>
          {THUMBS.map((t, i) => {
            const a = ramp(frame, [b(1 + i * 0.25), b(1.6 + i * 0.25)], [0, 1], EZ.out);
            const sel = i === selIdx;
            return (
              <div key={t.name} style={{ opacity: a, transform: `translateY(${(1 - a) * 30}px) scale(${sel ? 1.15 : 1})`, textAlign: 'center' }}>
                <div style={{ width: 104 * u, height: 104 * u, borderRadius: '50%', overflow: 'hidden', border: `${sel ? 5 : 3}px solid ${sel ? C.gold : 'rgba(255,255,255,0.35)'}`, boxShadow: sel ? `0 0 ${24 * u}px ${C.gold}99` : 'none', opacity: sel ? 1 : 0.7 }}>
                  <Img src={t.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ fontFamily: FONT.title, fontSize: 20 * u, letterSpacing: 1.5, color: sel ? C.gold : '#ddd', marginTop: 6 * u, whiteSpace: 'nowrap', textShadow: '0 2px 0 #000' }}>{t.name}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 70 * u, top: 56 * u, fontFamily: FONT.ui, fontWeight: 800, fontSize: 26 * u, letterSpacing: 8 * u, color: C.white, background: 'rgba(0,0,0,0.55)', padding: `${10 * u}px ${20 * u}px`, borderLeft: `${8 * u}px solid ${C.green}` }}>
        E · HABLA CON CUALQUIER NPC
      </div>
    </AbsoluteFill>
  );
};

/** Act 5b — the GTA radio wheel spinning through the 5 stations. */
const RadioHalf: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { frame, b, bf, width, height } = useBeats();
  const u = Math.min(width / 1920, height / 1080);
  const size = vertical ? width * 1.02 : height * 0.98;
  const step = vertical ? b(0.9) : b(1.8);
  return (
    <AbsoluteFill style={{ background: '#05060a' }}>
      <AbsoluteFill style={{ filter: 'blur(14px) brightness(0.38) saturate(1.3)', transform: 'scale(1.12)' }}>
        <SmartMedia name="panel-01" duration={b(9)} cam={{ from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.1, x: 1, y: 0 } }} />
      </AbsoluteFill>
      <RainOverlay intensity={0.35} drops={0} seed="radio" opacity={0.7} />
      <div style={{ position: 'absolute', left: vertical ? (width - size) / 2 : 70 * u, top: vertical ? height * 0.14 : (height - size) / 2 }}>
        <RadioDial at={0} step={step} size={size} beatFrames={bf} />
      </div>
      {!vertical && (
        <div style={{ position: 'absolute', right: 90 * u, top: 0, bottom: 0, width: 800 * u, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26 * u }}>
          <KineticText words={[{ text: '5 EMISORAS', at: b(0.3), color: '#fff' }, { text: 'PROPIAS', at: b(0.8), color: C.gold }]} size={190} align="left" shakeAmp={12} style={{ position: 'relative', height: 'auto', inset: 'auto', alignItems: 'flex-start' }} />
          <Row n="Q" text="CAMBIAR EMISORA" at={b(2)} />
          <Row n="♪" text="MÚSICA ORIGINAL · ELEVENLABS" at={b(2.6)} />
          <Row n="◉" text="LOCUTOR CON CLAUDE: TRÁFICO EN VIVO" at={b(3.2)} />
        </div>
      )}
      {vertical && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: height * 0.07, textAlign: 'center' }}>
          <span style={{ fontFamily: FONT.slam, fontSize: 150 * u * 1.4, color: '#fff', WebkitTextStroke: `${8 * u}px #000`, paintOrder: 'stroke fill' }}>5 EMISORAS</span>
        </div>
      )}
    </AbsoluteFill>
  );
};

const Row: React.FC<{ n: string; text: string; at: number }> = ({ n, text, at }) => {
  const { frame, width, height } = useBeats();
  const u = Math.min(width / 1920, height / 1080);
  const a = ramp(frame, [at, at + 14], [0, 1], EZ.out);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 * u, opacity: a, transform: `translateX(${(1 - a) * 60}px)` }}>
      <div style={{ width: 56 * u, height: 56 * u, borderRadius: 12 * u, background: '#fff', color: '#000', fontFamily: FONT.ui, fontWeight: 800, fontSize: 32 * u, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
      <div style={{ fontFamily: FONT.title, fontSize: 40 * u, letterSpacing: 3 * u, color: C.white, whiteSpace: 'nowrap' }}>{text}</div>
    </div>
  );
};

export const NpcTalk: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { b } = useBeats();
  const cut = b(vertical ? 3.4 : 11);
  const whip = b(0.45);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Sequence durationInFrames={cut + whip} layout="none">
        <WhipPan mode="out" at={cut} duration={whip} dir="left" blur={90}>
          <ChatHalf vertical={vertical} />
        </WhipPan>
      </Sequence>
      <Seq from={cut} whip={whip}>
        <RadioHalf vertical={vertical} />
      </Seq>
    </AbsoluteFill>
  );
};

const Seq: React.FC<{ from: number; whip: number; children: React.ReactNode }> = ({ from, whip, children }) => (
  <Sequence from={from} layout="none">
    <WhipPan mode="in" at={0} duration={whip} dir="left" blur={90}>
      {children}
    </WhipPan>
  </Sequence>
);

export { STATIONS };
