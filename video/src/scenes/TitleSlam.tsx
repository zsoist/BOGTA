import React from 'react';
import { AbsoluteFill } from 'remotion';
import { PanelCollage, type CollagePanel } from '../components/PanelCollage';
import { GameLogo, LensFlare } from '../components/GameLogo';
import { Flash } from '../components/Flash';
import { KenBurns } from '../components/KenBurns';
import { art, IMG } from '../lib/assets';
import { ramp, shake, useBeats } from '../lib/anim';
import { C, EZ, FONT } from '../theme';

const p = (a: string, fb: CollagePanel): CollagePanel => {
  const s = art(a);
  return s ? { src: s, focus: [50, 45] } : fb;
};

/** Collage assets: Codex panels when present, cover crops as fallback. */
export const collagePanels = (): CollagePanel[] => [
  p('panel-03', { src: IMG.cover, crop: 'hero', focus: [50, 30] }), // Doña Gloria
  p('panel-07', { src: IMG.cover, crop: 'skyline', focus: [40, 40] }), // Colpatranca
  p('panel-06', { src: IMG.cover, crop: 'girl', focus: [50, 40] }), // Monserrate
  p('panel-04', { src: IMG.taxiNight, focus: [30, 55] }), // police chase
  p('panel-02', { src: IMG.cover, crop: 'bus', focus: [50, 50] }), // TransMilagro
  p('panel-05', { src: IMG.cover, crop: 'moto', focus: [50, 50] }), // chiva
  p('panel-01', { src: IMG.cover, crop: 'taxi', focus: [50, 55] }), // taxi (center hero)
];

/**
 * Act 3 — collage panels assemble on the 8th notes during the riser, inhale, and the LOGO SLAMS on the drop.
 * Local beat 8 == music drop (absolute beat 40).
 */
export const TitleSlam: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { frame, b, width, height, pulse } = useBeats();
  const dropF = b(vertical ? 3 : 8);
  const build = vertical ? 0.5 : 0.75; // beats between panels: one per beat so the 7th (hero) lands 2 beats before the drop
  const inhale = ramp(frame, [dropF - b(1.4), dropF - 2], [0, 1], EZ.in); // pre-drop squeeze
  const post = frame >= dropF;
  const sh = shake(frame, dropF, 30, 0.18, 7);
  const recede = post ? ramp(frame, [dropF, dropF + b(0.6)], [0.55, 0.7], EZ.out) : inhale * 0.3;
  const panels = collagePanels();
  const taglineA = ramp(frame, [dropF + b(0.9), dropF + b(1.5)], [0, 1], EZ.out);
  const u = Math.min(width / 1920, height / 1080);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* depth plate behind the panels so un-built cells never read as empty */}
      <AbsoluteFill style={{ filter: 'blur(10px) brightness(0.36) saturate(1.3)', transform: 'scale(1.15)' }}>
        <KenBurns src={IMG.taxiNight} from={{ s: 1.0, x: 0, y: 0 }} to={{ s: 1.12, x: -2, y: 0 }} duration={b(10)} />
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px) rotate(${sh.r * 0.2}deg) scale(${1 + inhale * 0.03})` }}>
        <PanelCollage panels={vertical ? panels.slice(0, 5) : panels} kind={vertical ? 'portrait' : 'landscape'} start={b(0)} stagger={b(build)} recede={recede} />
        {/* riser vignette */}
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,${0.35 + inhale * 0.4}) 100%)` }} />
        {post && <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0) 62%)' }} />}
      </AbsoluteFill>
      <GameLogo at={dropF} width={vertical ? 1000 : 1060} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${vertical ? 62 : 74}%`, textAlign: 'center', opacity: taglineA, transform: `translateY(${(1 - taglineA) * 20}px)` }}>
        <span style={{ fontFamily: FONT.title, fontSize: (vertical ? 70 : 62) * u * (vertical ? 1.6 : 1), letterSpacing: 14 * u, color: '#fff', textShadow: `0 ${4 * u}px ${24 * u}px #000` }}>
          LA CIUDAD DONDE SIEMPRE LLUEVE A LAS <span style={{ color: C.gold }}>3</span>
        </span>
      </div>
      <LensFlare at={dropF + 2} duration={b(1.4)} y={vertical ? 0.42 : 0.46} />
      <Flash hits={[dropF]} peak={1} decay={0.2} />
    </AbsoluteFill>
  );
};
