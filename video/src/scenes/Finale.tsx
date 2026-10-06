import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { SmartMedia } from '../components/SmartMedia';
import { GameLogo, LensFlare } from '../components/GameLogo';
import { RainOverlay } from '../components/RainOverlay';
import { Flash } from '../components/Flash';
import { HERO_BEATS_EACH, HERO_SLOTS } from '../shotlist';
import { ramp, shake, useBeats } from '../lib/anim';
import { C, EZ, FONT, SPR } from '../theme';

/** Beat positions (scene-relative) — music climax hit sits on beat 2. */
export const FINALE_CUES = { hold: 0, burst: 2, logo: 6, credits: 9, fade: 16.2 };
export const FINALE_CUES_V = { hold: 0, burst: 0, logo: 2, credits: 2.7, fade: 3.5 };

const Badge: React.FC<{ text: string; sub: string; color: string; at: number }> = ({ text, sub, color, at }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const p = spring({ frame: frame - at, fps, config: SPR.slam });
  if (frame < at) return null;
  return (
    <div style={{ transform: `scale(${Math.min(1.1, p)}) translateY(${(1 - Math.min(1, p)) * 30}px)`, opacity: Math.min(1, p * 1.5), padding: `${14 * u}px ${30 * u}px`, borderRadius: 16 * u, background: 'rgba(8,8,12,0.78)', border: `${3 * u}px solid ${color}`, boxShadow: `0 0 ${30 * u}px ${color}55`, textAlign: 'center' }}>
      <div style={{ fontFamily: FONT.title, fontSize: 56 * u, letterSpacing: 5 * u, color, lineHeight: 1 }}>{text}</div>
      <div style={{ fontFamily: FONT.ui, fontWeight: 700, fontSize: 18 * u, letterSpacing: 4 * u, color: '#B8BACB', marginTop: 6 * u }}>{sub}</div>
    </div>
  );
};

/** Act 7 — quiet hold, 8 hero shots on the 8th notes at the climax, logo + endcard, credits, fade. */
export const Finale: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { frame, b, width, height, bf } = useBeats();
  const u = Math.min(width / 1920, height / 1080);
  const C_ = vertical ? FINALE_CUES_V : FINALE_CUES;
  const burstF = b(C_.burst);
  const burstEach = b(HERO_BEATS_EACH);
  const burstEnd = burstF + burstEach * (vertical ? 4 : 8);
  const logoF = b(C_.logo);
  const credF = b(C_.credits);
  const heroIdx = Math.floor((frame - burstF) / burstEach);
  const inBurst = frame >= burstF && frame < burstEnd;
  const fade = ramp(frame, [b(C_.fade), b(C_.fade + 1.6)], [0, 1], EZ.inOut);

  const holdA = ramp(frame, [b(0.3), b(0.9)], [0, 1], EZ.out) * (1 - ramp(frame, [burstF - 8, burstF], [0, 1], EZ.in));
  const sh = shake(frame, logoF, 24, 0.18, 5);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* quiet hold before the climax */}
      {frame < burstF && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', display: 'flex', flexDirection: 'column', opacity: holdA }}>
          <AbsoluteFill style={{ opacity: 0.22, filter: 'blur(3px)' }}>
            <SmartMedia name="coldopen" duration={b(2)} cam={{ from: { s: 1.2, x: 0, y: 0 }, to: { s: 1.0, x: 0, y: 0 } }} handheld={0} />
          </AbsoluteFill>
          <RainOverlay intensity={0.5} drops={5} seed="fin0" opacity={0.7} />
          <div style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: 28 * u * (vertical ? 1.5 : 1), letterSpacing: 16 * u, color: C.mute }}>Y ASÍ QUEDÓ</div>
          <div style={{ width: 360 * u * ramp(frame, [b(0.5), b(1.8)], [0, 1], EZ.out), height: 3 * u, background: C.gold, marginTop: 24 * u, boxShadow: `0 0 20px ${C.gold}` }} />
        </AbsoluteFill>
      )}

      {/* hero shot burst */}
      {HERO_SLOTS.slice(0, vertical ? 4 : 8).map((slot, i) => (
        <Sequence key={slot} from={burstF + i * burstEach} durationInFrames={burstEach} layout="none">
          <HeroShot slot={slot} index={i} len={burstEach} total={vertical ? 4 : 8} />
        </Sequence>
      ))}

      {/* endcard + logo */}
      {frame >= logoF - 2 && (
        <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
          <AbsoluteFill style={{ filter: 'brightness(0.8) saturate(1.15)' }}>
            <SmartMedia name="endcard" duration={b(12)} cam={{ from: { s: 1.12, x: 0, y: 0 }, to: { s: 1.0, x: 0, y: -1 } }} handheld={0} />
          </AbsoluteFill>
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,0.0), rgba(0,0,0,0.65))' }} />
          <RainOverlay intensity={0.45} drops={4} seed="fin1" opacity={0.8} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: vertical ? '-6%' : '-9%', bottom: 0 }}>
            <GameLogo at={logoF} width={vertical ? 1000 : 1000} />
          </div>
        </AbsoluteFill>
      )}
      <LensFlare at={logoF + 3} duration={b(1.6)} y={0.4} />

      {/* credits */}
      {frame >= credF && (
        <AbsoluteFill style={{ justifyContent: 'flex-end', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: (vertical ? 240 : 64) * u }}>
          <Credits at={credF} vertical={vertical} />
        </AbsoluteFill>
      )}

      <Flash hits={[burstF, ...HERO_SLOTS.map((_, i) => burstF + i * burstEach).slice(1, vertical ? 4 : 8), logoF]} peak={0.6} decay={0.35} />
      <AbsoluteFill style={{ background: '#000', opacity: fade }} />
    </AbsoluteFill>
  );
};

const Credits: React.FC<{ at: number; vertical?: boolean }> = ({ at, vertical }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const bf = (fps * 60) / 100;
  const a1 = ramp(frame, [at, at + 14], [0, 1], EZ.out);
  const a2 = ramp(frame, [at + bf * 0.8, at + bf * 0.8 + 14], [0, 1], EZ.out);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: FONT.title, fontSize: (vertical ? 92 : 78) * u * (vertical ? 1.2 : 1), letterSpacing: 6 * u, color: '#fff', textShadow: `0 ${4 * u}px ${24 * u}px #000`, opacity: a1, transform: `translateY(${(1 - a1) * 24}px)` }}>
        HECHO EN EL CLAUDE BUILD DAY BOGOTÁ
      </div>
      <div style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: (vertical ? 28 : 28) * u * (vertical ? 1.4 : 1), letterSpacing: 10 * u, color: C.gold, marginTop: 8 * u, opacity: a2, textShadow: '0 2px 12px #000' }}>
        UNIVERSIDAD SANTO TOMÁS · 05.10.2026
      </div>
      <div style={{ display: 'flex', gap: 26 * u, justifyContent: 'center', marginTop: 28 * u, flexWrap: 'wrap' }}>
        <Badge text="CLAUDE" sub="OPUS 5.5 + 7× SONNET 5.5" color={C.opus} at={at + bf * 1.2} />
        <Badge text="CODEX" sub="ARTE · GPT-IMAGE" color={C.codex} at={at + bf * 1.7} />
        <Badge text="ELEVENLABS" sub="MÚSICA · VOZ · SFX" color={C.eleven} at={at + bf * 2.2} />
      </div>
    </div>
  );
};

const HeroShot: React.FC<{ slot: (typeof HERO_SLOTS)[number]; index: number; len: number; total: number }> = ({ slot, index, len, total }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width / 1920, height / 1080);
  const punch = 1 + 0.09 * Math.exp(-frame * 0.35);
  return (
    <AbsoluteFill style={{ transform: `scale(${punch})` }}>
      <SmartMedia name={slot} duration={len + 12} flip={index % 2 === 1} handheld={4} />
      <RainOverlay intensity={0.4} drops={2} seed={`h${index}`} opacity={0.8} />
      <div style={{ position: 'absolute', right: 60 * u, bottom: 50 * u, fontFamily: FONT.slam, fontSize: 70 * u, color: '#fff', WebkitTextStroke: `${5 * u}px #000`, paintOrder: 'stroke fill' }}>
        0{index + 1}
        <span style={{ fontSize: 34 * u, color: C.gold }}> / 0{total}</span>
      </div>
    </AbsoluteFill>
  );
};
