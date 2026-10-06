// Dev tool: evaluate JS inside the capture page. usage: node scripts/capture-eval.mjs "<async js body that may `return` a value>"
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, 'capture-deps', 'package.json'))('playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || (process.env.HOME + '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', (m) => { if (m.type() !== 'error') console.log('  [page]', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/?capture=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__capture, null, { timeout: 120000 });
const res = await page.evaluate(`(async () => { ${process.argv[2]} })()`);
console.log(typeof res === 'string' ? res : JSON.stringify(res, null, 1));
await browser.close();
