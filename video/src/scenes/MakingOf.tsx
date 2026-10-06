import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { SmartMedia } from '../components/SmartMedia';
import { AgentGraph } from '../components/AgentGraph';
import { CodeTyper, SNIPPETS } from '../components/CodeTyper';
import { Counter } from '../components/Counter';
import { KineticText } from '../components/KineticText';
import { Flash } from '../components/Flash';
import { MANIFEST } from '../generated/manifest';
import { ramp, useBeats } from '../lib/anim';
import { VO06_CUES } from '../vo';
import { secondsToBeats } from '../beats';
import { C, EZ, FONT } from '../theme';

// Fallback constants (measured at build time with `wc -l src/**/*.js`); the sync script refreshes MANIFEST.loc.
export const STATS = {
  agents: 8,
  minutes: 90,
  loc: MANIFEST.loc || 9692,
  codexImages: MANIFEST.codexImages || 34,
  elevenTracks: MANIFEST.elevenTracks || 29,
};

// VO06 starts at beat 105 (scene beat 1); cues in seconds -> beats
const V0 = 1;
const B_LIDER = V0 + secondsToBeats(VO06_CUES.lider); // 1
const B_SIETE = V0 + secondsToBeats(VO06_CUES.siete); // 6
const B_NOVENTA = V0 + secondsToBeats(VO06_CUES.noventa); // ~11.6

const BlueprintGrid: React.FC<{ alpha: number }> = ({ alpha }) => {
  const { frame, width, height } = useBeats();
  const off = (frame * 0.25) % 80;
  return (
    <AbsoluteFill style={{ opacity: alpha, backgroundImage: 'linear-gradient(rgba(77,163,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(77,163,255,0.08) 1px, transparent 1px)', backgroundSize: '80px 80px', backgroundPosition: `${off}px ${off}px`, maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, #000 40%, transparent 100%)' }}>
      <div style={{ position: 'absolute', width, height }} />
    </AbsoluteFill>
  );
};

/** Act 6 — Making-of: art plate → 1 Opus → 7 Sonnet graph lighting up, CONTRACT/code typing real files, counters. */
export const MakingOf: React.FC = () => {
  const { frame, b, bf, width, height } = useBeats();
  const u = Math.min(width / 1920, height / 1080);
  const plate = ramp(frame, [b(5.2), b(6.4)], [1, 0], EZ.inOut); // plate bright -> dim
  const graphA = ramp(frame, [b(3), b(4)], [0, 1], EZ.out);

  const graphBox = { left: 30 * u, top: 60 * u, w: 1150 * u, h: 800 * u };
  const codeW = 600 * u;

  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {/* art plate */}
      <AbsoluteFill style={{ filter: `blur(${(1 - plate) * 16}px) brightness(${0.28 + plate * 0.4})`, transform: 'scale(1.06)' }}>
        <SmartMedia name="makingof" duration={b(28)} cam={{ from: { s: 1.0, x: 0, y: 0 }, to: { s: 1.14, x: -1.5, y: 0 } }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(11,11,15,${0.55 + (1 - plate) * 0.35}) 0%, rgba(11,11,15,${0.4 + (1 - plate) * 0.45}) 100%)` }} />
      <BlueprintGrid alpha={graphA} />

      {/* header tag */}
      <div style={{ position: 'absolute', left: 60 * u, top: 28 * u, display: 'flex', alignItems: 'center', gap: 14 * u, fontFamily: FONT.ui, fontWeight: 800, fontSize: 22 * u, letterSpacing: 8 * u, color: C.white, opacity: ramp(frame, [b(0.2), b(1)], [0, 1], EZ.out) }}>
        <span style={{ width: 14 * u, height: 14 * u, borderRadius: '50%', background: C.police, boxShadow: `0 0 12px ${C.police}`, opacity: Math.floor(frame / (bf / 2)) % 2 ? 1 : 0.35 }} />
        MAKING OF · 05.10.2026 · UNIVERSIDAD SANTO TOMÁS
      </div>

      {/* the three VO cues as kinetic banners */}
      <Sequence from={b(B_LIDER)} durationInFrames={b(4)} layout="none">
        <KineticText words={[{ text: 'UN LÍDER.', at: 0, color: C.opus }]} size={330} exitAt={b(2.3)} exitDuration={b(0.5)} shakeAmp={26} />
      </Sequence>
      <Sequence from={b(B_SIETE)} durationInFrames={b(4)} layout="none">
        <KineticText words={[{ text: 'SIETE', at: 0, color: C.sonnet }, { text: 'AGENTES.', at: b(0.25), color: C.sonnet }]} size={128} stagger={0} exitAt={b(3.1)} exitDuration={b(0.5)} shakeAmp={20} align="right" style={{ justifyContent: 'flex-start', paddingTop: 52 * u, paddingRight: 56 * u }} />
      </Sequence>
      <Sequence from={b(B_NOVENTA)} durationInFrames={b(4.5)} layout="none">
        <KineticText words={[{ text: 'NOVENTA', at: 0, color: C.gold }, { text: 'MINUTOS.', at: b(0.25), color: C.gold }]} size={128} stagger={0} exitAt={b(3.6)} exitDuration={b(0.5)} shakeAmp={20} align="right" style={{ justifyContent: 'flex-start', paddingTop: 52 * u, paddingRight: 56 * u }} />
      </Sequence>

      {/* agent graph */}
      <div style={{ position: 'absolute', left: graphBox.left, top: graphBox.top, opacity: graphA }}>
        <AgentGraph width={graphBox.w} height={graphBox.h} at={b(4)} beatFrames={bf} gap={1.5} scale={Math.max(0.9, u * 1.1)} />
      </div>

      {/* code panel — contract first, then the modules */}
      <div style={{ position: 'absolute', left: width - codeW - 56 * u, top: 340 * u }}>
        {[
          { s: SNIPPETS.contract, from: 4.5, badge: 'CONTRATO' },
          { s: SNIPPETS.config, from: 8.5, badge: 'MUNDO' },
          { s: SNIPPETS.vehicle, from: 12.5, badge: 'VEHÍCULOS' },
          { s: SNIPPETS.police, from: 16.5, badge: 'IA' },
        ].map((x, i, arr) => {
          const to = i + 1 < arr.length ? arr[i + 1].from : 21;
          return (
            <Sequence key={i} from={b(x.from)} durationInFrames={b(to - x.from) + 4} layout="none">
              <div style={{ position: 'absolute', left: 0, top: 0 }}>
                <CodeTyper code={x.s.code} file={x.s.file} lang={x.s.lang} at={2} cps={2.2} width={codeW} fontSize={21 * u} badge={x.badge} accent={i === 0 ? C.gold : C.green} maxLines={9} />
              </div>
            </Sequence>
          );
        })}
      </div>

      {/* counters */}
      <div style={{ position: 'absolute', left: 70 * u, right: 70 * u, bottom: 48 * u, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 30 * u }}>
        <Counter value={STATS.agents} label="Agentes" at={b(B_SIETE)} duration={b(1.2)} color={C.sonnet} size={84 * u} />
        <Counter value={STATS.minutes} label="Minutos" at={b(B_NOVENTA)} duration={b(1.4)} suffix="min" color={C.gold} size={84 * u} />
        <Counter value={STATS.loc} label="Líneas de código" at={b(17)} duration={b(3)} color={C.green} size={84 * u} />
        <Counter value={STATS.codexImages} label="Imágenes · Codex" at={b(18.5)} duration={b(2.4)} color={C.codex} size={84 * u} />
        <Counter value={STATS.elevenTracks} label="Pistas · ElevenLabs" at={b(20)} duration={b(2.4)} color={C.eleven} size={84 * u} />
      </div>

      <Flash hits={[b(B_LIDER), b(B_SIETE), b(B_NOVENTA)]} peak={0.35} decay={0.3} />
    </AbsoluteFill>
  );
};
