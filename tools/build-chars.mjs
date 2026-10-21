// Bakes the character roster + retargeted animations into public/assets/chars via headless Chromium.
// Requires the dev server (npx vite) and scratch/human (humanforge assets) + scratch/UAL*.glb.
import { chromium } from 'playwright';
import fs from 'node:fs';
const only = process.argv[2] ? `?only=${process.argv[2]}` : '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5173/tools/charbuild/build.html${only}`);
await page.waitForFunction('window.__ready === true', null, { timeout: 1800000 });
const ids = await page.evaluate(() => Object.keys(window.__out));
fs.mkdirSync('public/assets/chars', { recursive: true });
const metaPath = 'public/assets/chars/roster.json';
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
for (const id of ids) {
  const { glb, meta: m } = await page.evaluate((k) => window.__out[k], id);
  fs.writeFileSync(`public/assets/chars/${id}.glb`, Buffer.from(glb, 'base64'));
  meta[id] = m;
}
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
await browser.close();
