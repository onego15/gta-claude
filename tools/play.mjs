// Automated play-testing harness. Loads the game in headless Chromium, drives it with
// scripted virtual input using deterministic frame stepping, and captures screenshots.
// Usage: node tools/play.mjs <script.json> [outDir] [w] [h]
// Script: [{ "frames": 30, "keys": ["KeyW"], "buttons": 0, "dx": 0, "dy": 0, "shot": "a.png", "eval": "js" }, ...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [scriptPath, outDir = '.', w = 1280, h = 720] = process.argv.slice(2);
const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const url = script.url || 'http://localhost:5173/?autostart&lowres';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await page.goto(url);
await page.waitForFunction('window.__ready === true && window.__game && window.__game.state === "play"', null, { timeout: 300000 });
await page.evaluate(() => {
  window.__manual = true;
  const inp = window.__game.input;
  inp.virtual = { keys: new Set(), pressed: new Set(), buttons: 0, pressed2: 0, dx: 0, dy: 0 };
  window.__vin = (keys, buttons, dx, dy) => {
    const v = inp.virtual; const next = new Set(keys);
    v.pressed = new Set([...next].filter((k) => !v.keys.has(k)));
    v.pressed2 = buttons & ~v.buttons; v.keys = next; v.buttons = buttons; v.dx = dx; v.dy = dy;
  };
});
let i = 0;
for (const st of script.steps) {
  if (st.eval) { const r = await page.evaluate(st.eval); if (r !== undefined) console.log(`[eval ${i}]`, JSON.stringify(r)); }
  const frames = st.frames ?? 0;
  for (let f = 0; f < frames; f++) {
    await page.evaluate(([k, b, dx, dy, dt]) => { window.__vin(k, b, dx, dy); window.__game.update(dt); }, [st.keys || [], st.buttons || 0, st.dx || 0, st.dy || 0, st.dt || 1 / 30]);
    if (st.every && f % st.every === 0) { await page.evaluate(() => window.__game.render()); await page.screenshot({ path: path.join(outDir, `${st.prefix || 'f'}_${String(i).padStart(3, '0')}_${String(f).padStart(4, '0')}.png`) }); }
  }
  if (st.shot) { await page.evaluate(() => window.__game.render()); await page.screenshot({ path: path.join(outDir, st.shot) }); console.log('shot', st.shot); }
  if (st.log) { const r = await page.evaluate(st.log); console.log(`[log ${i}]`, JSON.stringify(r)); }
  i++;
}
await browser.close();
