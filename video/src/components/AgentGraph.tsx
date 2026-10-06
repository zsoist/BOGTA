import React, { useMemo } from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { evolvePath, getLength, getPointAtLength } from '@remotion/paths';
import { C, EZ, FONT, SPR } from '../theme';
import { ramp } from '../lib/anim';

interface AgentDef {
  name: string[];
  files: string[];
  tool?: { name: string; color: string; sub: string };
  chips?: 'out' | 'below' | 'above';
}

// 7 Sonnet 5.5 agents (module owners from docs/CONTRACT.md) + their real files.
const AGENTS: AgentDef[] = [
  { name: ['MUNDO'], files: ['world/city.js', 'world/sky.js'] },
  { name: ['VEHÍCULOS'], files: ['entities/vehicle.js', 'entities/player.js'] },
  { name: ['IA'], files: ['ai/traffic.js', 'ai/pedestrians.js', 'ai/police.js'] },
  { name: ['UI'], files: ['ui/hud.js', 'ui/minimap.js', 'ui/dialog.js'] },
  { name: ['AUDIO'], files: ['audio/synth.js', 'audio/audio.js'] },
  { name: ['SERVIDOR', '+ CLAUDE'], files: ['server/server.mjs', 'net/claude.js'], chips: 'below', tool: { name: 'CODEX', color: C.codex, sub: 'ARTE · GPT-IMAGE' } },
  { name: ['ELEVEN-', 'LABS'], files: ['scripts/elevenlabs-generate.mjs'], chips: 'above', tool: { name: 'ELEVENLABS', color: C.eleven, sub: 'MÚSICA · VOZ · SFX' } },
];

interface Props {
  width: number;
  height: number;
  /** local frame where the lead appears */
  at: number;
  /** frames per beat (so node light-ups land on the beat grid) */
  beatFrames: number;
  /** beats between agents lighting up */
  gap?: number;
  /** scale for text sizes */
  scale?: number;
  showFiles?: boolean;
}

const hex = (c: string, a: number) => c + Math.round(a * 255).toString(16).padStart(2, '0');

/**
 * Animated node graph: 1 orange Opus 5.5 lead → 7 blue Sonnet 5.5 agents (+ Codex & ElevenLabs tool nodes).
 * Edges draw with @remotion/paths evolvePath; nodes light up in sequence, file chips appear as modules get written,
 * and data pulses travel along each edge.
 */
export const AgentGraph: React.FC<Props> = ({ width, height, at, beatFrames: bf, gap = 1.5, scale = 1, showFiles = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = width * 0.52;
  const cy = height * 0.5;
  const rx = width * 0.285;
  const ry = height * 0.31;
  const rLead = Math.min(width, height) * 0.1;
  const rAgent = Math.min(width, height) * 0.062;

  const geo = useMemo(
    () =>
      AGENTS.map((a, i) => {
        const ang = -Math.PI / 2 + (i / AGENTS.length) * Math.PI * 2;
        const x = cx + Math.cos(ang) * rx;
        const y = cy + Math.sin(ang) * ry;
        const mx = (cx + x) / 2;
        const my = (cy + y) / 2;
        // curve the edge slightly (perpendicular offset)
        const px = -(y - cy);
        const py = x - cx;
        const pl = Math.hypot(px, py) || 1;
        const off = Math.min(width, height) * 0.05 * (i % 2 ? 1 : -1);
        const qx = mx + (px / pl) * off;
        const qy = my + (py / pl) * off;
        // start at lead rim, end at agent rim
        const sx = cx + (Math.cos(ang) * rLead * 0.95);
        const sy = cy + (Math.sin(ang) * rLead * 0.95);
        const ex = x - Math.cos(ang) * rAgent * 0.95;
        const ey = y - Math.sin(ang) * rAgent * 0.95;
        const d = `M ${sx} ${sy} Q ${qx} ${qy} ${ex} ${ey}`;
        let tool: { x: number; y: number; d: string } | undefined;
        if (a.tool) {
          const tx = cx + Math.cos(ang) * (rx + Math.min(width, height) * 0.17);
          const ty = cy + Math.sin(ang) * (ry + Math.min(width, height) * 0.12);
          tool = { x: tx, y: ty, d: `M ${x + Math.cos(ang) * rAgent} ${y + Math.sin(ang) * rAgent} L ${tx - Math.cos(ang) * rAgent * 0.8} ${ty - Math.sin(ang) * rAgent * 0.8}` };
        }
        return { ang, x, y, d, len: getLength(d), tool };
      }),
    [cx, cy, rx, ry, rLead, rAgent, width, height],
  );

  const leadPop = spring({ frame: frame - at, fps, config: SPR.slam });
  const fs = Math.min(width, height) * 0.024 * scale;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <filter id="ag-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="ag-lead" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#FFC27A" />
          <stop offset="60%" stopColor={C.opus} />
          <stop offset="100%" stopColor="#B2480A" />
        </radialGradient>
      </defs>

      {/* edges + pulses (under nodes) */}
      {geo.map((g, i) => {
        const t0 = at + (1 + i * gap) * bf;
        const draw = ramp(frame, [t0, t0 + bf * 0.9], [0, 1], EZ.out);
        if (draw <= 0) return null;
        const ev = evolvePath(draw, g.d);
        const act = ramp(frame, [t0 + bf * 0.5, t0 + bf * 3.2], [0, 1], EZ.inOut);
        const activeNow = frame >= t0 + bf * 0.5 && frame < t0 + bf * 3.2;
        const pulseT = ((frame - t0) / (bf * 1.2)) % 1;
        const pt = draw >= 1 ? getPointAtLength(g.d, g.len * EZ.inOut(pulseT)) : null;
        const tool = g.tool;
        const toolT0 = t0 + bf * 1.6;
        const toolDraw = tool ? ramp(frame, [toolT0, toolT0 + bf * 0.8], [0, 1], EZ.out) : 0;
        return (
          <g key={i}>
            <path d={g.d} fill="none" stroke={hex(C.sonnet, 0.18)} strokeWidth={2} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
            <path d={g.d} fill="none" stroke={activeNow ? C.sonnet : hex(C.sonnet, 0.55)} strokeWidth={activeNow ? 4 : 2.5} strokeLinecap="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} filter={activeNow ? 'url(#ag-glow)' : undefined} />
            {pt && draw >= 1 && (
              <circle cx={pt.x} cy={pt.y} r={activeNow ? 7 : 4} fill={activeNow ? '#fff' : C.sonnet} opacity={activeNow ? 1 : 0.7} filter="url(#ag-glow)" />
            )}
            {tool && toolDraw > 0 && (() => {
              const te = evolvePath(toolDraw, tool.d);
              return <path d={tool.d} fill="none" stroke={AGENTS[i].tool!.color} strokeWidth={3} strokeDasharray={te.strokeDasharray} strokeDashoffset={te.strokeDashoffset} strokeLinecap="round" opacity={0.9 * (0.6 + 0.4 * act)} />;
            })()}
          </g>
        );
      })}

      {/* lead node */}
      <g transform={`translate(${cx} ${cy}) scale(${Math.min(leadPop, 1.15)})`} opacity={Math.min(1, leadPop * 2)}>
        <circle r={rLead * (1.35 + 0.12 * Math.sin((frame / bf) * Math.PI * 2))} fill={hex(C.opus, 0.08)} />
        <circle r={rLead * 1.12} fill="none" stroke={hex(C.opus, 0.45)} strokeWidth={2} strokeDasharray="4 10" transform={`rotate(${frame * 0.4})`} />
        <circle r={rLead} fill="url(#ag-lead)" stroke="#FFD9A8" strokeWidth={4} filter="url(#ag-glow)" />
        <text y={-rLead * 0.05} textAnchor="middle" fontFamily={FONT.title} fontSize={rLead * 0.48} fill="#1A0B00" letterSpacing={2}>
          OPUS 5.5
        </text>
        <text y={rLead * 0.34} textAnchor="middle" fontFamily={FONT.ui} fontWeight={800} fontSize={rLead * 0.17} fill="#3A1A00" letterSpacing={3}>
          LÍDER
        </text>
      </g>

      {/* agent + tool nodes */}
      {geo.map((g, i) => {
        const a = AGENTS[i];
        const t0 = at + (1 + i * gap) * bf;
        const pop = spring({ frame: frame - (t0 + bf * 0.6), fps, config: SPR.slam });
        if (frame < t0 + bf * 0.55) return null;
        const writeStart = t0 + bf * 0.9;
        const writeEnd = t0 + bf * 3.2;
        const writing = frame >= writeStart && frame < writeEnd;
        const prog = ramp(frame, [writeStart, writeEnd], [0, 1], EZ.inOut);
        const done = frame >= writeEnd;
        const lit = writing ? 1 : done ? 0.45 : 0.7;
        const circ = 2 * Math.PI * (rAgent * 1.18);
        const dirX = Math.cos(g.ang);
        const dirY = Math.sin(g.ang);
        const anchor = dirX > 0.3 ? 'start' : dirX < -0.3 ? 'end' : 'middle';
        const toolT0 = t0 + bf * 1.6;
        const toolPop = a.tool ? spring({ frame: frame - (toolT0 + bf * 0.7), fps, config: SPR.slam }) : 0;
        return (
          <g key={i}>
            <g transform={`translate(${g.x} ${g.y}) scale(${Math.min(pop, 1.2)})`}>
              {writing && <circle r={rAgent * (1.5 + 0.25 * Math.sin(frame * 0.35))} fill={hex(C.sonnet, 0.14)} />}
              <circle r={rAgent} fill={hex('#0E2242', 0.96)} stroke={C.sonnet} strokeWidth={writing ? 5 : 3} opacity={0.5 + lit * 0.5} filter={writing ? 'url(#ag-glow)' : undefined} />
              <circle r={rAgent * 1.18} fill="none" stroke={hex(C.sonnet, 0.9)} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${circ * prog} ${circ}`} transform="rotate(-90)" opacity={writing || done ? 1 : 0} />
              {a.name.map((ln, k) => (
                <text key={k} y={(k - (a.name.length - 1) / 2) * rAgent * 0.34 - rAgent * 0.08} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT.title} fontSize={rAgent * (a.name.length > 1 ? 0.36 : 0.46)} fill="#fff" letterSpacing={1.5}>
                  {ln}
                </text>
              ))}
              <text y={rAgent * 0.52} textAnchor="middle" fontFamily={FONT.ui} fontWeight={800} fontSize={rAgent * 0.16} fill={C.sonnet} letterSpacing={2}>
                SONNET 5.5
              </text>
              {done && (
                <g transform={`translate(${rAgent * 0.72} ${-rAgent * 0.72})`}>
                  <circle r={rAgent * 0.22} fill={C.green} />
                  <path d={`M ${-rAgent * 0.1} 0 L ${-rAgent * 0.02} ${rAgent * 0.09} L ${rAgent * 0.12} ${-rAgent * 0.08}`} stroke="#04140A" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
            </g>
            {/* file chips */}
            {showFiles &&
              a.files.map((f, k) => {
                const ct = writeStart + bf * (0.25 + k * 0.7);
                const ca = ramp(frame, [ct, ct + 8], [0, 1], EZ.out);
                if (ca <= 0) return null;
                const side = a.chips ?? 'out';
                let bx = g.x + dirX * (rAgent * 1.45) + (anchor === 'middle' ? 0 : dirX > 0 ? 6 : -6);
                let by = g.y + dirY * (rAgent * 1.35) + (k - (a.files.length - 1) / 2) * fs * 1.55 + (dirY > 0.6 ? fs * 1.0 : 0) + (dirY < -0.6 ? -fs * 1.0 : 0);
                let anc = anchor;
                if (side === 'below') {
                  bx = g.x;
                  by = g.y + rAgent * 1.45 + fs * 1.1 + k * fs * 1.55;
                  anc = 'middle';
                } else if (side === 'above') {
                  bx = g.x;
                  by = g.y - rAgent * 1.45 - fs * 0.4 - (a.files.length - 1 - k) * fs * 1.55;
                  anc = 'middle';
                }
                const wTxt = f.length * fs * 0.6 + fs * 1.0;
                const x0 = anc === 'start' ? bx : anc === 'end' ? bx - wTxt : bx - wTxt / 2;
                return (
                  <g key={f} opacity={ca} transform={`translate(${(1 - ca) * (dirX > 0 ? -14 : 14)} 0)`}>
                    <rect x={x0} y={by - fs * 0.85} width={wTxt} height={fs * 1.3} rx={fs * 0.3} fill="rgba(10,14,26,0.92)" stroke={hex(C.sonnet, 0.6)} strokeWidth={1.5} />
                    <text x={x0 + fs * 0.5} y={by + fs * 0.0} fontFamily={FONT.mono} fontSize={fs * 0.92} fill={writing && k === a.files.length - 1 ? '#fff' : '#9FC4F5'}>
                      {f}
                    </text>
                  </g>
                );
              })}
            {/* tool node */}
            {a.tool && g.tool && toolPop > 0.01 && (
              <g transform={`translate(${g.tool.x} ${g.tool.y}) scale(${Math.min(toolPop, 1.15)})`}>
                <rect x={-rAgent * 0.95} y={-rAgent * 0.62} width={rAgent * 1.9} height={rAgent * 1.24} rx={rAgent * 0.28} fill="#10101A" stroke={a.tool.color} strokeWidth={3} filter="url(#ag-glow)" />
                <text y={-rAgent * 0.02} textAnchor="middle" fontFamily={FONT.title} fontSize={rAgent * 0.44} fill={a.tool.color} letterSpacing={2}>
                  {a.tool.name}
                </text>
                <text y={rAgent * 0.36} textAnchor="middle" fontFamily={FONT.ui} fontWeight={800} fontSize={rAgent * 0.14} fill="#A8ABC0" letterSpacing={1.5}>
                  {a.tool.sub}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};
