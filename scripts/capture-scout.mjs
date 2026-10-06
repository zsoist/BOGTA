// Dev tool: render single scouting frames. usage: node scripts/capture-scout.mjs '<json array of views>' [outdir]
// view = {name, pos:[x,y,z], look:[x,y,z], fov, hour, rain, anchor:[x,z], warm, w, h}
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, 'capture-deps', 'package.json'));
const { chromium } = require('playwright');
const views = JSON.parse(process.argv[2]);
const outDir = process.argv[3] || '/tmp/scout';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || (process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
for (const v of views) {
  const page = await browser.newPage({ viewport: { width: v.w || 960, height: v.h || 540 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:5173/?capture=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__capture, null, { timeout: 120000 });
  const t0 = Date.now();
  await page.evaluate((a) => window.__capture.scout(a.pos, a.look, a.fov || 60, a.hour ?? 12, !!a.rain, a.anchor || null, a.warm ?? 60), v);
  const url = await page.evaluate(() => window.__capture.grab());
  fs.writeFileSync(path.join(outDir, `${v.name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(v.name, `${Date.now() - t0} ms`);
  await page.close();
}
await browser.close();
