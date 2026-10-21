// Procedural canvas textures for facades, ground surfaces and signage.
// Every generator is deterministic (seeded) so the city looks the same on each load.
import * as THREE from 'three';
import { mulberry32 } from './layout.js';

const cache = new Map();
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function toTexture(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noise(g, w, h, rnd, amount, scale = 1, alpha = 0.08) {
  const d = g.getImageData(0, 0, w, h); const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    p[i] += n; p[i + 1] += n; p[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
  void scale; void alpha;
}

function blotches(g, w, h, rnd, n, color, rmin, rmax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rmin + rnd() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', String(alpha * (0.4 + rnd() * 0.6))));
    gr.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const shade = (hex, f) => {
  const c = new THREE.Color(hex); c.multiplyScalar(f); return `#${c.getHexString()}`;
};

// --- window glass ------------------------------------------------------------
function drawGlass(g, x, y, w, h, rnd, opts = {}) {
  const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  const sky = opts.tint || ['#6f8aa6', '#3c5068', '#22303f'];
  gr.addColorStop(0, sky[0]); gr.addColorStop(0.45, sky[1]); gr.addColorStop(1, sky[2]);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  // reflection streak
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath(); g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.1, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h * 0.6); g.closePath(); g.fill();
  // interior hints: curtains / blinds
  const k = rnd();
  if (!opts.noInterior && k < 0.35) {
    g.fillStyle = `rgba(${200 + rnd() * 50 | 0},${180 + rnd() * 50 | 0},${150 + rnd() * 60 | 0},0.35)`;
    g.fillRect(x, y, w * (0.15 + rnd() * 0.2), h); g.fillRect(x + w * (0.7 + rnd() * 0.1), y, w * 0.3, h);
  } else if (!opts.noInterior && k < 0.6) {
    g.fillStyle = 'rgba(220,215,200,0.22)';
    const drop = h * (0.2 + rnd() * 0.7);
    for (let yy = y; yy < y + drop; yy += 3) g.fillRect(x, yy, w, 1.5);
  }
}

// Emissive (night light) for a window.
function drawLit(e, x, y, w, h, rnd, density = 0.45) {
  if (rnd() > density) return false;
  const warm = rnd() < 0.75;
  const c = warm ? [255, 190 + rnd() * 40 | 0, 120 + rnd() * 50 | 0] : [190 + rnd() * 40 | 0, 215, 255];
  const b = 0.55 + rnd() * 0.45;
  const gr = e.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, `rgba(${c[0] * b | 0},${c[1] * b | 0},${c[2] * b | 0},1)`);
  gr.addColorStop(1, `rgba(${c[0] * b * 0.6 | 0},${c[1] * b * 0.6 | 0},${c[2] * b * 0.6 | 0},1)`);
  e.fillStyle = gr; e.fillRect(x, y, w, h);
  if (rnd() < 0.4) { e.fillStyle = 'rgba(0,0,0,0.55)'; e.fillRect(x + w * rnd() * 0.6, y + h * 0.35, w * 0.25, h * 0.65); }
  return true;
}

// --- facades ---------------------------------------------------------------
// A facade texture covers CB bays x CF floors. Returns { map, emissive, orm }.
export const FACADE_CELL = { bays: 4, floors: 4 };

const FACADE_STYLES = {
  brick: { wall: ['#8a4a36', '#7a3f2e', '#94573f', '#6e3b2c'], frame: '#e9e4da', kind: 'sash' },
  brickDark: { wall: ['#4f3b33', '#5a463c', '#45342d'], frame: '#d9d2c4', kind: 'sash' },
  stucco: { wall: ['#d8cbb0', '#cdbf9f', '#e2d6bd', '#c9b69a'], frame: '#4a4a4a', kind: 'wide' },
  stuccoPastel: { wall: ['#d9b8a0', '#b9c7c2', '#e0d1a4', '#c6a9b5'], frame: '#f2efe8', kind: 'wide' },
  brownstone: { wall: ['#7b5a48', '#6d4f3f', '#86634f'], frame: '#2a2420', kind: 'tall' },
  concrete: { wall: ['#a9a59c', '#9c988f', '#b3afa6'], frame: '#3b3d40', kind: 'grid' },
  glass: { wall: ['#2b3a48'], frame: '#9aa6ae', kind: 'curtain', tint: ['#8fb4cf', '#4d6f8c', '#243a50'] },
  glassGreen: { wall: ['#26403d'], frame: '#b7c2bf', kind: 'curtain', tint: ['#9fcfc4', '#4e8279', '#21413d'] },
  glassDark: { wall: ['#1d2229'], frame: '#4b5560', kind: 'curtain', tint: ['#6c7d92', '#2f3a48', '#161c24'] },
  warehouse: { wall: ['#8d8f86', '#7f8a8f', '#9a8a6f'], frame: '#3d3d3d', kind: 'industrial' },
  hospital: { wall: ['#e8e8e4'], frame: '#5d7a8a', kind: 'wide' },
  police: { wall: ['#b8b2a6'], frame: '#2b3440', kind: 'grid' },
};

export function facadeTexture(styleName, seed) {
  const k = `facade:${styleName}:${seed}`;
  if (cache.has(k)) return cache.get(k);
  const st = FACADE_STYLES[styleName];
  const rnd = mulberry32(seed * 7919 + styleName.length * 31);
  const CW = 128, CH = 128, B = FACADE_CELL.bays, F = FACADE_CELL.floors;
  const W = CW * B, H = CH * F;
  const c = canvas(W, H), g = c.getContext('2d');
  const ec = canvas(W, H), e = ec.getContext('2d');
  const oc = canvas(W, H), o = oc.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  // ORM: R unused(ao=1), G roughness, B metalness
  o.fillStyle = 'rgb(255,235,0)'; o.fillRect(0, 0, W, H);
  const wall = st.wall[(rnd() * st.wall.length) | 0];
  g.fillStyle = wall; g.fillRect(0, 0, W, H);

  if (st.kind === 'sash' || st.kind === 'tall') {
    // bricks
    if (st.kind === 'sash') {
      const bh = 6, bw = 16;
      for (let y = 0; y < H; y += bh) {
        const off = ((y / bh) % 2) * bw / 2;
        for (let x = -bw; x < W + bw; x += bw) {
          g.fillStyle = shade(wall, 0.82 + rnd() * 0.3);
          g.fillRect(x + off + 0.5, y + 0.5, bw - 1.2, bh - 1.2);
        }
      }
      g.globalAlpha = 0.35; g.fillStyle = '#c9bfb0';
      for (let y = 0; y < H; y += bh) g.fillRect(0, y + bh - 1, W, 0.8);
      g.globalAlpha = 1;
    } else {
      noise(g, W, H, rnd, 18);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = 0; y < H; y += 16) g.fillRect(0, y, W, 1);
    }
    blotches(g, W, H, rnd, 25, 'rgba(30,20,15,A)', 10, 60, 0.12);
    for (let f = 0; f < F; f++) for (let b = 0; b < B; b++) {
      const x0 = b * CW, y0 = f * CH;
      const ww = st.kind === 'tall' ? 46 : 50, wh = st.kind === 'tall' ? 82 : 70;
      const wx = x0 + (CW - ww) / 2, wy = y0 + (st.kind === 'tall' ? 22 : 30);
      // lintel & sill
      g.fillStyle = st.kind === 'tall' ? '#cbbca3' : '#d8d0c2';
      g.fillRect(wx - 6, wy - 9, ww + 12, 8);
      g.fillRect(wx - 5, wy + wh, ww + 10, 6);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(wx - 5, wy + wh + 6, ww + 10, 3);
      // frame
      g.fillStyle = st.frame; g.fillRect(wx - 3, wy - 2, ww + 6, wh + 3);
      drawGlass(g, wx, wy, ww, wh, rnd);
      g.fillStyle = st.frame; g.fillRect(wx, wy + wh / 2 - 2, ww, 4); g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      o.fillStyle = 'rgb(255,40,0)'; o.fillRect(wx, wy, ww, wh);
      drawLit(e, wx, wy, ww, wh, rnd);
      e.fillStyle = '#000'; e.fillRect(wx, wy + wh / 2 - 2, ww, 4); e.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    }
  } else if (st.kind === 'wide') {
    noise(g, W, H, rnd, 14);
    blotches(g, W, H, rnd, 30, 'rgba(60,50,40,A)', 20, 80, 0.08);
    for (let f = 0; f < F; f++) {
      const y0 = f * CH;
      g.fillStyle = shade(wall, 0.85); g.fillRect(0, y0 + CH - 10, W, 10);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, y0 + CH - 10, W, 2);
      for (let b = 0; b < B; b++) {
        const x0 = b * CW; const ww = 92, wh = 62; const wx = x0 + (CW - ww) / 2, wy = y0 + 30;
        g.fillStyle = st.frame; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        drawGlass(g, wx, wy, ww, wh, rnd);
        g.fillStyle = st.frame; g.fillRect(wx + ww * 0.62, wy, 3, wh);
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(wx - 4, wy + wh + 3, ww + 8, 3);
        o.fillStyle = 'rgb(255,40,0)'; o.fillRect(wx, wy, ww, wh);
        drawLit(e, wx, wy, ww, wh, rnd);
        e.fillStyle = '#000'; e.fillRect(wx + ww * 0.62, wy, 3, wh);
        // AC unit under some windows
        if (rnd() < 0.18) { g.fillStyle = '#d9d9d4'; g.fillRect(wx + ww - 30, wy + wh + 6, 26, 16); g.fillStyle = '#8c8c88'; for (let i = 0; i < 5; i++) g.fillRect(wx + ww - 28, wy + wh + 8 + i * 3, 22, 1); }
      }
    }
  } else if (st.kind === 'grid') {
    noise(g, W, H, rnd, 20);
    blotches(g, W, H, rnd, 40, 'rgba(40,40,40,A)', 10, 50, 0.1);
    for (let f = 0; f < F; f++) for (let b = 0; b < B; b++) {
      const x0 = b * CW, y0 = f * CH; const wx = x0 + 14, wy = y0 + 22, ww = CW - 28, wh = CH - 44;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      drawGlass(g, wx, wy, ww, wh, rnd);
      g.fillStyle = st.frame; for (let i = 1; i < 3; i++) g.fillRect(wx + (ww / 3) * i - 1, wy, 2, wh);
      o.fillStyle = 'rgb(255,30,0)'; o.fillRect(wx, wy, ww, wh);
      drawLit(e, wx, wy, ww, wh, rnd, 0.5);
      // streaks below windows
      g.fillStyle = 'rgba(30,30,30,0.12)'; g.fillRect(wx + 4, wy + wh + 3, ww - 8, 14);
    }
  } else if (st.kind === 'curtain') {
    for (let f = 0; f < F; f++) for (let b = 0; b < B; b++) {
      const x0 = b * CW, y0 = f * CH;
      drawGlass(g, x0, y0, CW, CH - 18, rnd, { tint: st.tint, noInterior: rnd() < 0.5 });
      g.fillStyle = shade(st.wall[0], 1.15); g.fillRect(x0, y0 + CH - 18, CW, 18); // spandrel
      g.fillStyle = st.frame; g.fillRect(x0, y0, 3, CH); g.fillRect(x0 + CW / 2 - 1, y0, 2, CH - 18); g.fillRect(x0, y0 + CH - 18, CW, 2);
      o.fillStyle = 'rgb(255,18,200)'; o.fillRect(x0 + 3, y0, CW - 3, CH - 18);
      o.fillStyle = 'rgb(255,90,120)'; o.fillRect(x0, y0 + CH - 18, CW, 18);
      if (drawLit(e, x0 + 3, y0 + 2, CW - 6, CH - 22, rnd, 0.55)) { e.fillStyle = '#000'; e.fillRect(x0 + CW / 2 - 1, y0, 2, CH); }
    }
  } else if (st.kind === 'industrial') {
    // corrugated vertical ribs
    for (let x = 0; x < W; x += 8) { g.fillStyle = shade(wall, 0.9 + (x % 16 ? 0.12 : 0)); g.fillRect(x, 0, 8, H); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 6, 0, 2, H); }
    blotches(g, W, H, rnd, 40, 'rgba(90,60,30,A)', 10, 70, 0.15);
    for (let b = 0; b < B; b++) if (rnd() < 0.6) {
      const wx = b * CW + 20, wy = 18, ww = CW - 40, wh = 30;
      g.fillStyle = '#333'; g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4); drawGlass(g, wx, wy, ww, wh, rnd, { noInterior: true });
      drawLit(e, wx, wy, ww, wh, rnd, 0.3);
    }
    o.fillStyle = 'rgb(255,120,160)'; o.fillRect(0, 0, W, H);
  }
  // global grime gradient toward the bottom of each tile row
  const res = {
    map: toTexture(c), emissive: toTexture(ec), orm: toTexture(oc, { srgb: false }),
  };
  cache.set(k, res);
  return res;
}

// --- storefront (ground floor) ----------------------------------------------------
// 4 bays x 4.2 m. Dark glazing with reflections by day; the emissive map lights the
// interior at night. ORM marks the glass as smooth so it picks up the sky reflection.
export function storefrontTexture(seed, palette) {
  const k = `store:${seed}`;
  if (cache.has(k)) return cache.get(k);
  const rnd = mulberry32(seed * 104729 + 17);
  const W = 512, H = 180;
  const c = canvas(W, H), g = c.getContext('2d');
  const ec = canvas(W, H), e = ec.getContext('2d');
  const oc = canvas(W, H), o = oc.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  o.fillStyle = 'rgb(255,190,0)'; o.fillRect(0, 0, W, H);
  const frames = ['#1d1e20', '#3a2a1e', '#26392f', '#5b1c1c', '#d8d3c8', '#2c3442'];
  const frame = palette?.frame || frames[(rnd() * frames.length) | 0];
  g.fillStyle = frame; g.fillRect(0, 0, W, H);
  const doorBay = (rnd() * 4) | 0;
  const warm = rnd() < 0.65;
  const kind = (rnd() * 4) | 0; // interior variety
  for (let b = 0; b < 4; b++) {
    const x0 = b * 128;
    const gx = x0 + 7, gy = 26, gw = 114, gh = H - 46;
    // transom windows
    g.fillStyle = '#20262c'; g.fillRect(gx, 7, gw, 14);
    g.fillStyle = 'rgba(160,190,210,0.25)'; g.fillRect(gx, 7, gw, 6);
    // interior: back wall, ceiling lights, floor
    const ig = g.createLinearGradient(0, gy, 0, gy + gh);
    ig.addColorStop(0, warm ? '#4a3a2c' : '#3a4048'); ig.addColorStop(0.55, warm ? '#2c2219' : '#22272d'); ig.addColorStop(1, '#0e0d0c');
    g.fillStyle = ig; g.fillRect(gx, gy, gw, gh);
    const eg = e.createLinearGradient(0, gy, 0, gy + gh);
    eg.addColorStop(0, warm ? '#ffd9a0' : '#dfeeff'); eg.addColorStop(0.6, warm ? '#a8784a' : '#7d8a99'); eg.addColorStop(1, warm ? '#3a2614' : '#262c33');
    e.fillStyle = eg; e.fillRect(gx, gy, gw, gh);
    // ceiling lamps
    for (let l = 0; l < 3; l++) { const lx = gx + 18 + l * 38; g.fillStyle = 'rgba(255,240,210,0.5)'; g.fillRect(lx, gy + 4, 14, 3); e.fillStyle = '#fff'; e.fillRect(lx, gy + 4, 14, 3); }
    // furniture silhouettes
    g.fillStyle = 'rgba(0,0,0,0.45)'; e.fillStyle = 'rgba(0,0,0,0.6)';
    if (kind === 0) { for (let s = 0; s < 3; s++) { const sy = gy + 34 + s * 26; g.fillRect(gx + 6, sy, gw - 12, 3); for (let p = gx + 8; p < gx + gw - 10; p += 7 + rnd() * 5) { g.fillStyle = `hsla(${rnd() * 360},35%,${30 + rnd() * 20}%,0.55)`; g.fillRect(p, sy - 9 - rnd() * 6, 4, 10); } g.fillStyle = 'rgba(0,0,0,0.45)'; } }
    else if (kind === 1) { for (let t = 0; t < 2; t++) { const tx = gx + 18 + t * 52; g.fillRect(tx, gy + gh - 34, 30, 4); g.fillRect(tx + 13, gy + gh - 30, 4, 22); e.fillRect(tx, gy + gh - 34, 30, 26); g.fillRect(tx - 6, gy + gh - 26, 6, 18); g.fillRect(tx + 30, gy + gh - 26, 6, 18); } }
    else if (kind === 2) { g.fillRect(gx + 10, gy + gh - 40, gw - 20, 32); e.fillRect(gx + 10, gy + gh - 40, gw - 20, 32); for (let p = 0; p < 4; p++) g.fillRect(gx + 16 + p * 25, gy + 30, 14, 18); }
    else { for (let p = 0; p < 3; p++) { const px = gx + 14 + p * 34; g.fillRect(px + 6, gy + 34, 10, 10); g.fillRect(px, gy + 44, 22, 40); e.fillRect(px, gy + 34, 22, 50); } }
    if (b === doorBay) {
      g.fillStyle = frame; g.fillRect(gx + gw / 2 - 25, gy - 2, 50, gh + 20);
      g.fillStyle = '#15181b'; g.fillRect(gx + gw / 2 - 21, gy + 2, 42, gh + 12);
      g.fillStyle = 'rgba(170,190,205,0.18)'; g.fillRect(gx + gw / 2 - 21, gy + 2, 42, gh + 12);
      g.fillStyle = '#c9b88a'; g.fillRect(gx + gw / 2 + 12, gy + gh * 0.45, 3, 22);
      e.fillStyle = warm ? '#5a3f22' : '#3a4250'; e.fillRect(gx + gw / 2 - 21, gy + 2, 42, gh + 12);
      if (rnd() < 0.6) { g.fillStyle = '#d4291f'; g.fillRect(gx + gw / 2 - 14, gy + 16, 28, 10); g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.fillText('OPEN', gx + gw / 2, gy + 24); e.fillStyle = '#ff3b2f'; e.fillRect(gx + gw / 2 - 14, gy + 16, 28, 10); }
    } else if (rnd() < 0.45) {
      // window posters / decals
      g.fillStyle = `hsl(${rnd() * 360},55%,55%)`; g.fillRect(gx + 8 + rnd() * 60, gy + 40 + rnd() * 30, 26, 34);
    }
    // reflections: sky gradient at the top, diagonal streaks
    const rg = g.createLinearGradient(0, gy, 0, gy + gh);
    rg.addColorStop(0, 'rgba(190,210,230,0.42)'); rg.addColorStop(0.5, 'rgba(150,170,190,0.12)'); rg.addColorStop(1, 'rgba(60,70,80,0.05)');
    g.fillStyle = rg; g.fillRect(gx, gy, gw, gh);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(gx + 30, gy); g.lineTo(gx + 62, gy); g.lineTo(gx + 22, gy + gh); g.lineTo(gx - 10 + 10, gy + gh); g.closePath(); g.fill();
    o.fillStyle = 'rgb(255,14,90)'; o.fillRect(gx, gy, gw, gh);
    // mullions, stallriser, pilasters
    g.fillStyle = frame; g.fillRect(gx + gw * 0.5 - 1.5, gy, 3, gh); if (b === doorBay) g.fillRect(gx + gw / 2 - 25, gy, 4, gh);
    g.fillStyle = shade(frame, 0.75); g.fillRect(x0, H - 20, 128, 20);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, H - 20, 128, 2);
    g.fillStyle = shade(frame, 1.1); g.fillRect(x0, 0, 7, H); g.fillRect(x0 + 121, 0, 7, H);
    e.fillStyle = '#000'; e.fillRect(gx + gw * 0.5 - 1.5, gy, 3, gh);
  }
  const res = { map: toTexture(c), emissive: toTexture(ec), orm: toTexture(oc, { srgb: false }) };
  cache.set(k, res);
  return res;
}

// --- signs ---------------------------------------------------------------------
export function signTexture(text, opts = {}) {
  const k = `sign:${text}:${JSON.stringify(opts)}`;
  if (cache.has(k)) return cache.get(k);
  const W = opts.w || 512, H = opts.h || 96;
  const c = canvas(W, H), g = c.getContext('2d');
  const ec = canvas(W, H), e = ec.getContext('2d');
  g.fillStyle = opts.bg || '#1b1b1b'; g.fillRect(0, 0, W, H);
  if (opts.border !== false) { g.strokeStyle = opts.borderColor || 'rgba(255,255,255,0.25)'; g.lineWidth = 4; g.strokeRect(4, 4, W - 8, H - 8); }
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const font = opts.font || 'bold 56px "Oswald", "Arial Narrow", sans-serif';
  for (const ctx of [g, e]) {
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = parseInt(font.match(/(\d+)px/)[1], 10);
    while (ctx.measureText(text).width > W * 0.88 && size > 12) { size -= 2; ctx.font = font.replace(/\d+px/, `${size}px`); }
  }
  if (opts.vertical) {
    const chars = [...text.replace(/ /g, '')];
    const step = (H - 40) / chars.length; const size = Math.min(W * 0.75, step * 0.95);
    for (const [ctx, col] of [[g, opts.fg], [e, opts.fg]]) {
      ctx.font = font.replace(/\d+px/, `${size | 0}px`); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = opts.neon ? 14 : 0;
      chars.forEach((ch, i) => ctx.fillText(ch, W / 2, 20 + step * (i + 0.5)));
    }
    const res = { map: toTexture(c, { repeat: false }), emissive: toTexture(ec, { repeat: false }) };
    cache.set(k, res);
    return res;
  }
  g.fillStyle = opts.fg || '#f5e6c8';
  if (opts.neon) { g.shadowColor = opts.fg; g.shadowBlur = 14; }
  g.fillText(text, W / 2, H / 2 + 2);
  g.shadowBlur = 0;
  if (opts.sub) { g.font = 'bold 18px sans-serif'; g.fillStyle = opts.subColor || opts.fg; g.fillText(opts.sub, W / 2, H - 16); }
  e.fillStyle = opts.neon ? opts.fg : shade(opts.fg || '#f5e6c8', 0.5);
  e.shadowColor = opts.fg; e.shadowBlur = opts.neon ? 18 : 0;
  e.fillText(text, W / 2, H / 2 + 2);
  const res = { map: toTexture(c, { repeat: false }), emissive: toTexture(ec, { repeat: false }) };
  cache.set(k, res);
  return res;
}

// --- ground -------------------------------------------------------------------
export function asphaltTexture() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const rnd = mulberry32(42);
  const S = 512; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, S, S);
  const d = g.getImageData(0, 0, S, S), p = d.data;
  for (let i = 0; i < p.length; i += 4) { const n = (rnd() - 0.5) * 34 + (rnd() < 0.02 ? 30 : 0); p[i] += n; p[i + 1] += n; p[i + 2] += n + 1; }
  g.putImageData(d, 0, 0);
  blotches(g, S, S, rnd, 30, 'rgba(15,15,15,A)', 20, 90, 0.18);
  blotches(g, S, S, rnd, 14, 'rgba(110,110,105,A)', 20, 70, 0.08);
  // cracks
  g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) { let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 12; j++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  // patch
  g.fillStyle = 'rgba(25,25,28,0.5)'; g.fillRect(rnd() * S, rnd() * S, 80, 50);
  const t = toTexture(c); cache.set('asphalt', t); return t;
}

export function roadMarkingTexture() {
  // Lane-marking overlay for a road segment: U across the road (12 m), V along it (repeats every 12 m)
  if (cache.has('markings')) return cache.get('markings');
  const W = 256, H = 256; const c = canvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const px = (m) => (m / 12) * W;
  // double yellow center
  g.fillStyle = 'rgba(232,186,52,0.95)'; g.fillRect(px(6) - px(0.22), 0, px(0.12), H); g.fillRect(px(6) + px(0.1), 0, px(0.12), H);
  // parking strip edges (dashed white)
  g.fillStyle = 'rgba(235,235,230,0.85)';
  for (const m of [2.5, 9.5]) for (let y = 0; y < H; y += 64) g.fillRect(px(m) - px(0.06), y, px(0.12), 30);
  // worn speckle
  const d = g.getImageData(0, 0, W, H), p = d.data; const rnd = mulberry32(5);
  for (let i = 3; i < p.length; i += 4) if (p[i] > 0) p[i] *= 0.6 + rnd() * 0.4;
  g.putImageData(d, 0, 0);
  const t = toTexture(c, { aniso: 16 }); cache.set('markings', t); return t;
}

export function crosswalkTexture() {
  if (cache.has('zebra')) return cache.get('zebra');
  const W = 256, H = 64; const c = canvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(240,240,236,0.92)';
  for (let x = 6; x < W; x += 24) g.fillRect(x, 4, 13, H - 8);
  const d = g.getImageData(0, 0, W, H), p = d.data; const rnd = mulberry32(9);
  for (let i = 3; i < p.length; i += 4) if (p[i] > 0) p[i] *= 0.55 + rnd() * 0.45;
  g.putImageData(d, 0, 0);
  const t = toTexture(c, { repeat: false }); cache.set('zebra', t); return t;
}

export function sidewalkTexture() {
  if (cache.has('sidewalk')) return cache.get('sidewalk');
  const rnd = mulberry32(77); const S = 512; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#a5a29b'; g.fillRect(0, 0, S, S);
  noise(g, S, S, rnd, 22);
  const tile = 128; // 1.5m slabs (texture repeats every 6m)
  for (let y = 0; y < S; y += tile) for (let x = 0; x < S; x += tile) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? 255 : 0},${rnd() < 0.5 ? 255 : 0},0,0)`;
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; g.fillRect(x, y, tile, tile);
  }
  g.fillStyle = 'rgba(40,38,35,0.55)';
  for (let i = 0; i <= S; i += tile) { g.fillRect(i - 1, 0, 2, S); g.fillRect(0, i - 1, S, 2); }
  blotches(g, S, S, rnd, 20, 'rgba(30,28,25,A)', 10, 50, 0.12);
  // gum spots
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(60,60,60,0.35)'; g.beginPath(); g.arc(rnd() * S, rnd() * S, 1.5 + rnd() * 2, 0, 7); g.fill(); }
  const t = toTexture(c); cache.set('sidewalk', t); return t;
}

export function grassTexture() {
  if (cache.has('grass')) return cache.get('grass');
  const rnd = mulberry32(3); const S = 512; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#4d6b2f'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, rnd, 60, 'rgba(90,120,45,A)', 20, 80, 0.4);
  blotches(g, S, S, rnd, 40, 'rgba(40,55,20,A)', 20, 60, 0.35);
  for (let i = 0; i < 9000; i++) { const x = rnd() * S, y = rnd() * S; g.strokeStyle = `hsla(${80 + rnd() * 30},${40 + rnd() * 20}%,${22 + rnd() * 22}%,0.7)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 4); g.stroke(); }
  const t = toTexture(c); cache.set('grass', t); return t;
}

export function pavingTexture() {
  if (cache.has('paving')) return cache.get('paving');
  const rnd = mulberry32(11); const S = 512; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#8c7f73'; g.fillRect(0, 0, S, S);
  const bw = 32, bh = 16;
  for (let y = 0; y < S; y += bh) for (let x = 0; x < S; x += bw) {
    const off = ((y / bh) % 2) * bw / 2;
    g.fillStyle = `hsl(${20 + rnd() * 15},${12 + rnd() * 12}%,${42 + rnd() * 14}%)`;
    g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2); g.fillRect(x + off + 1 - S, y + 1, bw - 2, bh - 2);
  }
  noise(g, S, S, rnd, 16);
  const t = toTexture(c); cache.set('paving', t); return t;
}

export function concreteTexture(seed = 1, base = '#8f8d88') {
  const k = `concrete:${seed}:${base}`;
  if (cache.has(k)) return cache.get(k);
  const rnd = mulberry32(seed * 13); const S = 256; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S); noise(g, S, S, rnd, 20);
  blotches(g, S, S, rnd, 20, 'rgba(40,40,40,A)', 10, 50, 0.15);
  const t = toTexture(c); cache.set(k, t); return t;
}

export function roofTexture() {
  if (cache.has('roof')) return cache.get('roof');
  const rnd = mulberry32(21); const S = 256; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#5b5955'; g.fillRect(0, 0, S, S); noise(g, S, S, rnd, 26);
  blotches(g, S, S, rnd, 20, 'rgba(20,20,20,A)', 10, 60, 0.2);
  g.strokeStyle = 'rgba(0,0,0,0.2)'; for (let i = 0; i < S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); }
  const t = toTexture(c); cache.set('roof', t); return t;
}

export function waterNormalTexture() {
  if (cache.has('waternormal')) return cache.get('waternormal');
  const S = 256; const c = canvas(S, S), g = c.getContext('2d'); const d = g.createImageData(S, S); const p = d.data;
  const rnd = mulberry32(99);
  const waves = Array.from({ length: 14 }, () => ({ kx: Math.round((rnd() - 0.5) * 16), ky: Math.round((rnd() - 0.5) * 16), a: 0.3 + rnd() * 0.7, ph: rnd() * 6.28 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let nx = 0, ny = 0;
    for (const w of waves) { const s = Math.cos((w.kx * x + w.ky * y) / S * 6.283 + w.ph) * w.a; nx += s * w.kx * 0.02; ny += s * w.ky * 0.02; }
    const i = (y * S + x) * 4; p[i] = 128 + nx * 127; p[i + 1] = 128 + ny * 127; p[i + 2] = 255; p[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = toTexture(c, { srgb: false }); cache.set('waternormal', t); return t;
}

export function lightPoolTexture() {
  if (cache.has('pool')) return cache.get('pool');
  const S = 128; const c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = toTexture(c, { repeat: false }); cache.set('pool', t); return t;
}

export function glowTexture() {
  if (cache.has('glow')) return cache.get('glow');
  const S = 64; const c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = toTexture(c, { repeat: false }); cache.set('glow', t); return t;
}

export function leafTexture() {
  if (cache.has('leaf')) return cache.get('leaf');
  const rnd = mulberry32(55); const S = 256; const c = canvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * S * 0.47; const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    g.fillStyle = `hsl(${85 + rnd() * 35},${35 + rnd() * 25}%,${18 + rnd() * 26}%)`;
    g.beginPath(); g.ellipse(x, y, 4 + rnd() * 5, 2 + rnd() * 3, rnd() * 3.14, 0, 6.283); g.fill();
  }
  const t = toTexture(c, { repeat: false }); cache.set('leaf', t); return t;
}

export function barkTexture() {
  if (cache.has('bark')) return cache.get('bark');
  const rnd = mulberry32(66); const W = 64, H = 256; const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(${20 + rnd() * 40},${15 + rnd() * 30},${10 + rnd() * 20},0.6)`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 10 + rnd() * 40); }
  const t = toTexture(c); cache.set('bark', t); return t;
}
