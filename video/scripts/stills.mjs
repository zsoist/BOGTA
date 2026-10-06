// Render several stills with ONE bundle: node scripts/stills.mjs Trailer 0 300 600 ...  -> out/stills/<comp>-<frame>.png
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition, openBrowser } from '@remotion/renderer';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const [comp = 'Trailer', ...frames] = process.argv.slice(2);
const outDir = path.join(root, 'out/stills');
fs.mkdirSync(outDir, { recursive: true });
const bundled = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') });
const browser = await openBrowser('chrome', { chromiumOptions: { gl: 'angle' } });
const composition = await selectComposition({ serveUrl: bundled, id: comp, puppeteerInstance: browser });
for (const f of frames) {
  const frame = Number(f);
  const output = path.join(outDir, `${comp === 'Trailer' ? 'f' : 'v'}${String(frame).padStart(4, '0')}.png`);
  const t = Date.now();
  await renderStill({ composition, serveUrl: bundled, output, frame, puppeteerInstance: browser, imageFormat: 'png' });
  console.log('still', frame, ((Date.now() - t) / 1000).toFixed(1) + 's');
}
await browser.close({ silent: true });
