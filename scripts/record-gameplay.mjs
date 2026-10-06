// Records a real, scripted play session of the live game (HUD visible) with Playwright's video recorder.
import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const require = createRequire(new URL('./capture-deps/package.json', import.meta.url));
const { chromium } = require('playwright');
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const dir = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
  .map((d) => path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')).find((p) => fs.existsSync(p));
const out = path.resolve('video/public/footage/_rec'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: dir, headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5173/'); await wait(3500);
await page.keyboard.press('Enter'); await wait(2500);
// Walk to the parked taxi and steal it.
await page.evaluate(() => { const t = world.vehicles.find((v) => v.type === 'taxi' && !v.driver); world.player.position.set(t.position.x + 2.4, 0, t.position.z + 1); world.player.heading = Math.PI / 2; });
await page.keyboard.down('KeyW'); await wait(500); await page.keyboard.up('KeyW');
await page.keyboard.press('KeyF'); await wait(1500);
await page.keyboard.press('KeyQ'); await wait(300);
// Drive north, weave, drift.
await page.keyboard.down('KeyW'); await wait(3500);
await page.keyboard.down('KeyA'); await page.keyboard.down('Space'); await wait(900); await page.keyboard.up('Space'); await page.keyboard.up('KeyA'); await wait(1800);
await page.keyboard.down('KeyD'); await wait(700); await page.keyboard.up('KeyD'); await wait(1500);
// Heat up: police chase.
await page.evaluate(() => { for (let i = 0; i < 4; i++) events.emit('crime', { type: 'hit_police', x: world.player.position.x, z: world.player.position.z }); state.hour = 20.5; });
await wait(2500);
await page.keyboard.down('KeyD'); await page.keyboard.down('Space'); await wait(800); await page.keyboard.up('Space'); await page.keyboard.up('KeyD'); await wait(2500);
await page.keyboard.down('KeyA'); await wait(600); await page.keyboard.up('KeyA'); await wait(3000);
await page.keyboard.up('KeyW');
await wait(800);
const v = page.video(); await ctx.close(); await browser.close();
console.log('VIDEO', await v.path());
