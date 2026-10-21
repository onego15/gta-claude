// Builds a copy of the game for hosts that only serve standard web media types:
// every .glb is re-encoded as base64 text (<name>.glb.txt) and loaded via src/core/glb.js.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const out = 'dist-artifact';
execSync(`npx vite build --outDir ${out} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_GLB_B64: '1' } });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(out).filter((f) => f.endsWith('.glb'))) {
  fs.writeFileSync(`${f}.txt`, fs.readFileSync(f).toString('base64'));
  fs.unlinkSync(f);
}
