// Usage: node tools/shot.mjs <url> <out.png> [waitExpr] [w] [h]
import { chromium } from 'playwright';
const [url, out, waitExpr = 'window.__ready === true', w = 1280, h = 720] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', m => console.log('[console]', m.type(), m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(waitExpr, null, { timeout: 180000 });
await page.screenshot({ path: out });
await browser.close();
