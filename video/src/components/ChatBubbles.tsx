import React from 'react';
import { Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { noise2D } from '@remotion/noise';
import { C, EZ, FONT, SPR } from '../theme';
import { ramp } from '../lib/anim';

export interface ChatMsg {
  who: 'player' | 'npc';
  text: string;
  /** local frame when this message starts appearing/typing */
  at: number;
  /** characters per frame (60fps basis) while typing */
  cps?: number;
}

const typedLen = (m: ChatMsg, frame: number, fps: number) => Math.max(0, Math.floor((frame - m.at) * (m.cps ?? 0.9) * (60 / fps)));

/** Equalizer-style waveform visualiser (noise-driven) — speaks while the NPC reply types. */
export const Waveform: React.FC<{ active: number; bars?: number; width: number; height: number; color?: string }> = ({ active, bars = 38, width, height, color = C.eleven }) => {
  const frame = useCurrentFrame();
  const bw = width / (bars * 1.6);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: bw * 0.6, height, width, justifyContent: 'center' }}>
      {Array.from({ length: bars }, (_, i) => {
        const env = Math.sin((i / (bars - 1)) * Math.PI) * 0.75 + 0.25;
        const n = (noise2D('wave', i * 0.45, frame * 0.11) * 0.5 + 0.5) * (0.55 + 0.45 * Math.abs(noise2D('wave2', i * 0.2, frame * 0.23)));
        const h = Math.max(0.06, (0.08 + n * env) * active + 0.05);
        return <div key={i} style={{ width: bw, height: h * height, borderRadius: bw, background: color, opacity: 0.5 + 0.5 * h, boxShadow: `0 0 ${8 * h}px ${color}` }} />;
      })}
    </div>
  );
};

interface Props {
  messages: ChatMsg[];
  npcName: string;
  npcRole: string;
  portrait: string;
  width: number;
  height: number;
  at?: number;
  /** font-size scale */
  scale?: number;
}

/** NPC dialogue UI: portrait header, player bubble, typing dots, typed reply with a live ElevenLabs waveform. */
export const ChatBubbles: React.FC<Props> = ({ messages, npcName, npcRole, portrait, width, height, at = 0, scale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: frame - at, fps, config: SPR.soft });
  const fs = 34 * scale;

  // is an npc message currently typing?
  let speaking = 0;
  messages.forEach((m) => {
    if (m.who !== 'npc') return;
    const n = typedLen(m, frame, fps);
    if (n > 0 && n < m.text.length) speaking = 1;
    else if (n >= m.text.length && frame - m.at < m.text.length / ((m.cps ?? 0.9) * (60 / fps)) + 18) speaking = Math.max(speaking, ramp(frame, [m.at + m.text.length / ((m.cps ?? 0.9) * (60 / fps)), m.at + m.text.length / ((m.cps ?? 0.9) * (60 / fps)) + 18], [1, 0.0], EZ.out));
  });

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 28 * scale,
        overflow: 'hidden',
        background: 'linear-gradient(160deg, rgba(24,26,38,0.93), rgba(10,10,16,0.96))',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.65)',
        transform: `translateX(${(1 - Math.min(1, appear)) * 80}px)`,
        opacity: Math.min(1, appear * 1.4),
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT.ui,
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 * scale, padding: `${22 * scale}px ${28 * scale}px`, borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ width: 92 * scale, height: 92 * scale, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${C.gold}`, boxShadow: `0 0 ${24 * scale}px rgba(245,197,24,${0.25 + speaking * 0.4})` }}>
          <Img src={portrait} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT.title, fontSize: 52 * scale, letterSpacing: 3, color: C.white, lineHeight: 1 }}>{npcName}</div>
          <div style={{ fontSize: 20 * scale, color: C.mute, marginTop: 4 }}>{npcRole}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 * scale, padding: `${6 * scale}px ${14 * scale}px`, borderRadius: 30, background: 'rgba(111,211,111,0.12)', border: '1px solid rgba(111,211,111,0.4)', fontSize: 17 * scale, color: C.green, fontWeight: 600 }}>
          <span style={{ width: 9 * scale, height: 9 * scale, borderRadius: '50%', background: C.green, boxShadow: `0 0 10px ${C.green}`, opacity: 0.6 + 0.4 * Math.sin(frame * 0.2) }} />
          CLAUDE OPUS 5.5 · EN VIVO
        </div>
      </div>

      {/* messages */}
      <div style={{ flex: 1, padding: `${24 * scale}px ${28 * scale}px`, display: 'flex', flexDirection: 'column', gap: 18 * scale, justifyContent: 'flex-start' }}>
        {messages.map((m, i) => {
          if (frame < m.at - 2) return null;
          const player = m.who === 'player';
          const n = typedLen(m, frame, fps);
          const doneAt = m.at + m.text.length / ((m.cps ?? 0.9) * (60 / fps));
          const pop = spring({ frame: frame - m.at, fps, config: SPR.pop });
          // thinking dots before an npc reply
          const thinkFor = m.who === 'npc' ? 22 : 0;
          const typing = n > 0 && n < m.text.length;
          if (m.who === 'npc' && frame < m.at + thinkFor * (fps / 60)) {
            return (
              <div key={i} style={{ alignSelf: 'flex-start', display: 'flex', gap: 8 * scale, padding: `${16 * scale}px ${22 * scale}px`, borderRadius: 24 * scale, background: 'rgba(255,255,255,0.08)' }}>
                {[0, 1, 2].map((d) => (
                  <div key={d} style={{ width: 11 * scale, height: 11 * scale, borderRadius: '50%', background: C.mute, transform: `translateY(${Math.sin(frame * 0.3 - d * 0.9) * 5 * scale}px)` }} />
                ))}
              </div>
            );
          }
          const nShown = m.who === 'npc' ? Math.max(0, n - Math.round(thinkFor * (m.cps ?? 0.9))) : n;
          const txt = m.text.slice(0, nShown);
          return (
            <div key={i} style={{ alignSelf: player ? 'flex-end' : 'flex-start', maxWidth: '88%', transform: `scale(${0.92 + 0.08 * Math.min(1, pop)})`, transformOrigin: player ? 'right bottom' : 'left bottom' }}>
              <div style={{ fontSize: 15 * scale, color: C.mute, margin: `0 ${10 * scale}px ${5 * scale}px`, textAlign: player ? 'right' : 'left', letterSpacing: 2, fontWeight: 600 }}>{player ? 'TÚ' : npcName.toUpperCase()}</div>
              <div
                style={{
                  padding: `${18 * scale}px ${26 * scale}px`,
                  borderRadius: player ? `${26 * scale}px ${26 * scale}px ${6 * scale}px ${26 * scale}px` : `${26 * scale}px ${26 * scale}px ${26 * scale}px ${6 * scale}px`,
                  background: player ? 'linear-gradient(135deg, #5BC25B, #2F7A3A)' : 'rgba(255,255,255,0.09)',
                  color: player ? '#04140A' : C.white,
                  fontSize: fs,
                  lineHeight: 1.3,
                  fontWeight: player ? 700 : 500,
                  border: player ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.1)',
                  minWidth: 120 * scale,
                }}
              >
                {txt}
                {(typing || (nShown < m.text.length)) && <span style={{ display: 'inline-block', width: 3 * scale, height: fs, background: player ? '#04140A' : C.gold, marginLeft: 3, verticalAlign: 'text-bottom', opacity: Math.floor(frame / 8) % 2 }} />}
              </div>
              {!player && frame >= doneAt - 10 && (
                <div style={{ marginTop: 6 * scale, fontSize: 14 * scale, color: C.eleven, letterSpacing: 2, fontWeight: 600, opacity: ramp(frame, [doneAt - 10, doneAt + 6], [0, 1], EZ.out) }}>
                  ▶ VOZ · ELEVENLABS
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* waveform footer */}
      <div style={{ padding: `${14 * scale}px ${28 * scale}px ${22 * scale}px`, borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 * scale }}>
          <div style={{ fontFamily: FONT.title, fontSize: 28 * scale, color: C.eleven, letterSpacing: 3, width: 130 * scale }}>VOZ</div>
          <Waveform active={speaking} width={width - 260 * scale} height={64 * scale} />
        </div>
      </div>
    </div>
  );
};
