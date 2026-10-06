// Copies game assets into video/public/ and writes src/generated/manifest.ts
// (list of files that really exist + live stats), so compositions can fall back gracefully.
// Runs automatically before `still`, `render`, `render:vertical`, `render:draft`, `studio`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const videoDir = path.resolve(here, '..');
const root = path.resolve(videoDir, '..');
const pub = path.join(videoDir, 'public');
const assets = path.join(root, 'assets');

const exists = (p) => fs.existsSync(p);
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });

function copyFile(src, dst) {
  if (!exists(src)) return false;
  mkdir(path.dirname(dst));
  const same = exists(dst) && fs.statSync(dst).size === fs.statSync(src).size && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs;
  if (!same) fs.copyFileSync(src, dst);
  return true;
}
function copyDir(src, dst, filter = () => true) {
  if (!exists(src)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    if (fs.statSync(s).isDirectory()) { n += copyDir(s, path.join(dst, f), filter); continue; }
    if (f.startsWith('.') || !filter(f)) continue;
    if (copyFile(s, path.join(dst, f))) n++;
  }
  return n;
}
function walk(dir, base = dir, out = []) {
  if (!exists(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('.')) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

// --- copy game assets ---
const report = {};
report.music = copyFile(path.join(assets, 'music/trailer.mp3'), path.join(pub, 'music/trailer.mp3')) ? 'trailer.mp3 found' : 'no trailer.mp3 -> renders silent';
report.radio = copyDir(path.join(assets, 'radio'), path.join(pub, 'radio'));
report.loading = copyDir(path.join(assets, 'loading'), path.join(pub, 'loading'));
report.portraits = copyDir(path.join(assets, 'portraits'), path.join(pub, 'portraits'));
report.cover = copyFile(path.join(assets, 'cover.png'), path.join(pub, 'cover.png'));
report.ui = copyDir(path.join(assets, 'ui'), path.join(pub, 'ui'));
report.sfx = copyDir(path.join(assets, 'sfx'), path.join(pub, 'sfx'));
// Seed fallback stills (used when the primary path is missing)
copyFile(path.join(assets, 'cover.png'), path.join(pub, 'fallback/cover.png'));
copyDir(path.join(assets, 'loading'), path.join(pub, 'fallback'));
// VO + trailer-specific audio produced by the audio agent
report.vo = copyDir(path.join(videoDir, 'audio/vo'), path.join(pub, 'vo'), (f) => /\.(mp3|wav|m4a)$/i.test(f));
// vo-04 = "Roba. Derrapa. Huye. Habla." -> cut into 4 words (silencedetect times) so each word lands on its montage block.
{
  const src = path.join(pub, 'vo/vo-04.mp3');
  const cuts = [[0, 0.5], [0.6, 1.33], [1.56, 2.17], [2.38, 3.11]];
  if (exists(src)) {
    cuts.forEach(([a, b], i) => {
      const dst = path.join(pub, `vo/vo-04-${i + 1}.mp3`);
      if (exists(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) return;
      try {
        execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(a), '-to', String(b), '-i', src, '-af', 'afade=t=in:d=0.015,afade=t=out:st=' + Math.max(0, b - a - 0.03) + ':d=0.03', '-codec:a', 'libmp3lame', '-b:a', '192k', dst]);
      } catch (e) { console.warn('[sync-assets] ffmpeg cut failed for', dst); }
    });
  }
}
// Optionally also accept trailer music dropped in video/audio/
copyFile(path.join(videoDir, 'audio/trailer.mp3'), path.join(pub, 'music/trailer.mp3'));

// AI clips (Atlas Cloud) are written straight into video/public/ai/ — nothing to copy, they are listed in the manifest.
report.ai = fs.existsSync(path.join(pub, 'ai')) ? walk(path.join(pub, 'ai')).filter((f) => f.endsWith('.mp4') && fs.statSync(path.join(pub, 'ai', f)).size > 20000).length : 0;

// --- live stats ---
function countLines(dir) {
  let loc = 0, files = 0;
  for (const rel of walk(dir)) {
    if (!rel.endsWith('.js')) continue;
    const txt = fs.readFileSync(path.join(dir, rel), 'utf8');
    loc += txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0); // == wc -l (+ last unterminated line)
    files++;
  }
  return { loc, files };
}
const { loc, files: jsFiles } = countLines(path.join(root, 'src'));
const imgCount = (d) => walk(d).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).length;
const mp3Count = (d) => walk(d).filter((f) => /\.(mp3|wav)$/i.test(f)).length;
const codexImages = imgCount(path.join(assets, 'loading')) + imgCount(path.join(assets, 'portraits')) + imgCount(path.join(assets, 'ui'))
  + imgCount(path.join(assets, 'textures')) + imgCount(path.join(assets, 'radio')) + (exists(path.join(assets, 'cover.png')) ? 1 : 0)
  + new Set(walk(path.join(pub, 'art')).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, ''))).size;
const elevenTracks = mp3Count(path.join(assets, 'music')) + mp3Count(path.join(assets, 'sfx')) + mp3Count(path.join(assets, 'voices')) + mp3Count(path.join(videoDir, 'audio'));

const files = walk(pub).filter((f) => !/\.mp4$/.test(f) || fs.statSync(path.join(pub, f)).size > 20000);
const manifest = `// AUTO-GENERATED by scripts/sync-assets.mjs — do not edit by hand.
export const MANIFEST = {
  generatedAt: ${JSON.stringify(new Date().toISOString())},
  files: ${JSON.stringify(files, null, 2)} as string[],
  loc: ${loc},
  jsFiles: ${jsFiles},
  codexImages: ${codexImages},
  elevenTracks: ${elevenTracks},
};
`;
mkdir(path.join(videoDir, 'src/generated'));
const out = path.join(videoDir, 'src/generated/manifest.ts');
if (!exists(out) || fs.readFileSync(out, 'utf8').replace(/generatedAt.*\n/, '') !== manifest.replace(/generatedAt.*\n/, '')) fs.writeFileSync(out, manifest);

console.log('[sync-assets]', JSON.stringify({ ...report, loc, jsFiles, codexImages, elevenTracks, publicFiles: files.length }));
