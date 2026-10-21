// Building generators. Each takes a lot rectangle plus the side that faces the street and
// appends geometry to the Batcher. Returns collider boxes.
import * as THREE from 'three';
import { facadeMaterial, storeMaterial, signMaterial, awningMaterial } from './materials.js';
import { hex } from './geom.js';
import { CURB_H } from './layout.js';

export const FLOOR_H = 3.2;
export const BAY_W = 3.0;
const GROUND_H = 4.2;

// Registry of dynamic materials used by batch keys
export const dynMats = new Map();
const useMat = (key, mat) => { if (!dynMats.has(key)) dynMats.set(key, mat); return key; };

const SHOP_NAMES = [
  ['SUSHI KAZE', '#f5f1e6', '#7a1f1f'], ['MOON CAFE', '#f6e7c1', '#2e2a26'], ['BAYSIDE PHARMACY', '#ffffff', '#1f6d4a'], ['LUCKY 7 LIQUOR', '#ffe36b', '#1b1b1b'],
  ['PIXEL GAMES', '#7ff7ff', '#14102a'], ['LAUNDROMAT', '#ffffff', '#2d5d8c'], ['ROSA FLOWERS', '#ffe8f0', '#9c3b5c'], ['NOODLE BAR', '#ffd36b', '#2a1a12'],
  ['AURORA BOOKS', '#f1e4c8', '#3d2a1f'], ['DELI & GROCERY', '#fff6d0', '#245a2a'], ['HARBOR TATTOO', '#ff6b6b', '#111111'], ['PIZZA NAPOLI', '#ffffff', '#b8261d'],
  ['24H MART', '#ffffff', '#d4561c'], ['VINYL VAULT', '#f0d7ff', '#2b1238'], ['BARBER SHOP', '#ffffff', '#1d3c6b'], ['PAWN & GOLD', '#ffd700', '#202020'],
  ['TACO LOCO', '#fff1b8', '#1d6b3a'], ['KARAOKE STAR', '#ff8af2', '#220b2a'], ['COFFEE ROASTERS', '#e9dcc5', '#3b2416'], ['DIM SUM PALACE', '#ffdf8a', '#8a1515'],
  ['ELECTRONICS', '#9fe7ff', '#0e2233'], ['SNEAKER LAB', '#ffffff', '#111111'], ['BAKERY', '#5a3418', '#f3e1c0'], ['RAMEN ICHI', '#ffffff', '#202020'],
];
let shopCounter = 0;
export function nextShop(rnd) { const s = SHOP_NAMES[(shopCounter++ * 7 + ((rnd() * 3) | 0)) % SHOP_NAMES.length]; return s; }

// Facade-textured wall. side: 'n','s','e','w'. y0..y1 world heights.
function facadeWall(B, matKey, side, x0, z0, x1, z1, y0, y1, uOff = 0) {
  const w = side === 'n' || side === 's' ? x1 - x0 : z1 - z0;
  const bays = Math.max(1, Math.round(w / BAY_W)), floors = (y1 - y0) / FLOOR_H;
  const uv = [uOff, (y0 - GROUND_H) / FLOOR_H / 4, uOff + bays / 4, (y0 - GROUND_H) / FLOOR_H / 4 + floors / 4];
  if (side === 's') B.wall(matKey, x0, z1, x1, z1, y0, y1, uv);
  else if (side === 'n') B.wall(matKey, x1, z0, x0, z0, y0, y1, uv);
  else if (side === 'e') B.wall(matKey, x1, z1, x1, z0, y0, y1, uv);
  else B.wall(matKey, x0, z0, x0, z1, y0, y1, uv);
}

const SIDES = ['n', 's', 'e', 'w'];
const outward = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

// Storefront band along one side, with sign + optional awning
function storefront(B, rnd, side, r, y0, opts = {}) {
  const { x0, z0, x1, z1 } = r;
  const len = side === 'n' || side === 's' ? x1 - x0 : z1 - z0;
  const storeKey = useMat(`store:${opts.storeSeed}`, storeMaterial(opts.storeSeed));
  const uv = [0, 0, len / 12, 1];
  const yb = y0, yt = y0 + GROUND_H;
  if (side === 's') B.wall(storeKey, x0, z1, x1, z1, yb, yt, uv);
  else if (side === 'n') B.wall(storeKey, x1, z0, x0, z0, yb, yt, uv);
  else if (side === 'e') B.wall(storeKey, x1, z1, x1, z0, yb, yt, uv);
  else B.wall(storeKey, x0, z0, x0, z1, yb, yt, uv);
  // sign band: box protruding 0.25 above the storefront glass
  const [ox, oz] = outward[side];
  const shop = opts.shop || nextShop(rnd);
  const signW = Math.min(len - 1.2, 3 + rnd() * 6);
  const t = 0.25; const sy0 = yt - 1.0, sy1 = yt - 0.1;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const signKey = useMat(`sign:${shop[0]}`, signMaterial(shop[0], { fg: shop[1], bg: shop[2], neon: rnd() < 0.35 }));
  // frame
  const fx = side === 'n' || side === 's';
  const bx0 = fx ? cx - signW / 2 : (side === 'e' ? x1 : x0 - t), bx1 = fx ? cx + signW / 2 : (side === 'e' ? x1 + t : x0);
  const bz0 = fx ? (side === 's' ? z1 : z0 - t) : cz - signW / 2, bz1 = fx ? (side === 's' ? z1 + t : z0) : cz + signW / 2;
  B.box('trim', bx0 - 0.06 * Math.abs(oz), sy0 - 0.06, bz0 - 0.06 * Math.abs(ox), bx1 + 0.06 * Math.abs(oz), sy1 + 0.06, bz1 + 0.06 * Math.abs(ox), { color: hex(shop[2]) });
  const e = 0.01;
  if (side === 's') B.wall(signKey, bx0, bz1 + e, bx1, bz1 + e, sy0, sy1, [0, 0, 1, 1]);
  else if (side === 'n') B.wall(signKey, bx1, bz0 - e, bx0, bz0 - e, sy0, sy1, [0, 0, 1, 1]);
  else if (side === 'e') B.wall(signKey, bx1 + e, bz1, bx1 + e, bz0, sy0, sy1, [0, 0, 1, 1]);
  else B.wall(signKey, bx0 - e, bz0, bx0 - e, bz1, sy0, sy1, [0, 0, 1, 1]);
  // awning
  if (opts.awning ?? rnd() < 0.55) {
    const cols = [['#b8261d', '#efe7d6'], ['#1f5a3a', '#efe7d6'], ['#1d3c6b', '#e9e4da'], ['#2b2b2b', '#c9a94a'], ['#7a3b1f', '#f1d9a8']][(rnd() * 5) | 0];
    const aw = useMat(`awning:${cols[0]}${cols[1]}`, awningMaterial(cols[0], cols[1]));
    const depth = 1.6, ay1 = sy0 - 0.15, ay0 = ay1 - 0.9;
    const along = fx ? [x0 + 0.4, x1 - 0.4] : [z0 + 0.4, z1 - 0.4];
    const segs = [];
    // split long awnings around a gap
    if (along[1] - along[0] > 9) { const mid = (along[0] + along[1]) / 2; segs.push([along[0], mid - 0.4], [mid + 0.4, along[1]]); } else segs.push(along);
    for (const [a0, a1] of segs) {
      const L = (a1 - a0);
      const P = (a, d, y) => (fx ? new THREE.Vector3(a, y, (side === 's' ? z1 : z0) + oz * d) : new THREE.Vector3((side === 'e' ? x1 : x0) + ox * d, y, a));
      // sloped top: from wall (high) to front (low)
      const q = [P(a0, 0, ay1), P(a1, 0, ay1), P(a1, depth, ay0), P(a0, depth, ay0)];
      const facingOut = side === 's' || side === 'w';
      if (facingOut) B.quad(aw, q[0], q[3], q[2], q[1], [0, 0, L / 1.2, 1]); else B.quad(aw, q[0], q[1], q[2], q[3], [0, 0, L / 1.2, 1]);
      // valance
      const v = [P(a0, depth, ay0), P(a1, depth, ay0), P(a1, depth, ay0 - 0.3), P(a0, depth, ay0 - 0.3)];
      if (facingOut) B.quad(aw, v[3], v[2], v[1], v[0], [0, 0.85, L / 1.2, 1]); else B.quad(aw, v[0], v[1], v[2], v[3], [0, 0.85, L / 1.2, 1]);
    }
  }
  return shop;
}

function cornice(B, r, y, depth, h, color) {
  B.box('trim', r.x0 - depth, y, r.z0 - depth, r.x1 + depth, y + h, r.z1 + depth, { color });
}

function roofTop(B, rnd, r, y, opts = {}) {
  const { x0, z0, x1, z1 } = r;
  B.flat('roof', x0 + 0.01, z0 + 0.01, x1 - 0.01, z1 - 0.01, y + 0.02, [x0 / 8, z0 / 8, x1 / 8, z1 / 8]);
  // parapet
  const p = 0.25, ph = opts.parapet ?? 0.9, pc = opts.parapetColor || [0.55, 0.53, 0.5];
  B.box('trim', x0, y, z0, x1, y + ph, z0 + p, { color: pc });
  B.box('trim', x0, y, z1 - p, x1, y + ph, z1, { color: pc });
  B.box('trim', x0, y, z0 + p, x0 + p, y + ph, z1 - p, { color: pc });
  B.box('trim', x1 - p, y, z0 + p, x1, y + ph, z1 - p, { color: pc });
  const w = x1 - x0, d = z1 - z0;
  // AC units
  const n = Math.floor((w * d) / 120) + 1;
  for (let i = 0; i < n; i++) {
    const ax = x0 + 1.5 + rnd() * (w - 4), az = z0 + 1.5 + rnd() * (d - 4);
    B.box('metal', ax, y, az, ax + 1.4, y + 1.0, az + 1.0, { color: [0.75, 0.76, 0.76] });
    B.box('darkMetal', ax + 0.2, y + 1.0, az + 0.2, ax + 1.2, y + 1.05, az + 0.8, { color: [0.5, 0.5, 0.5] });
  }
  // stair bulkhead
  if (w > 8 && d > 8 && rnd() < 0.8) {
    const sx = x0 + 2 + rnd() * (w - 6), sz = z0 + 2 + rnd() * (d - 6);
    B.box('concrete', sx, y, sz, sx + 3, y + 2.6, sz + 2.4, { color: [0.85, 0.83, 0.8], uvScale: 3 });
  }
  // water tank (classic city roofs)
  if (opts.tank ?? rnd() < 0.35) {
    const tx = x0 + 2 + rnd() * Math.max(1, w - 5), tz = z0 + 2 + rnd() * Math.max(1, d - 5);
    const tank = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 14, 1);
    B.geometry('wood', tank, new THREE.Matrix4().makeTranslation(tx, y + 3.0, tz), [0.75, 0.6, 0.45]);
    const cone = new THREE.ConeGeometry(1.45, 0.9, 14);
    B.geometry('darkMetal', cone, new THREE.Matrix4().makeTranslation(tx, y + 4.75, tz), [0.6, 0.6, 0.6]);
    for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) B.box('darkMetal', tx + lx - 0.08, y, tz + lz - 0.08, tx + lx + 0.08, y + 1.7, tz + lz + 0.08);
  }
  // antenna
  if (opts.antenna) {
    const ax = (x0 + x1) / 2, az = (z0 + z1) / 2;
    B.box('darkMetal', ax - 0.1, y, az - 0.1, ax + 0.1, y + opts.antenna, az + 0.1);
    B.box('darkMetal', ax - 0.6, y + opts.antenna * 0.6, az - 0.04, ax + 0.6, y + opts.antenna * 0.6 + 0.08, az + 0.04);
  }
}

// Fire escape on a facade (brick buildings)
function fireEscape(B, side, r, y0, floors, along0, along1) {
  const [ox, oz] = outward[side]; const fx = side === 'n' || side === 's';
  const base = fx ? (side === 's' ? r.z1 : r.z0) : (side === 'e' ? r.x1 : r.x0);
  const dep = 1.2;
  for (let f = 1; f < floors; f++) {
    const y = y0 + GROUND_H + (f - 1) * FLOOR_H - 0.15;
    const a0 = along0, a1 = along1;
    const n0 = base, n1 = base + (fx ? oz : ox) * dep;
    const [lo, hi] = [Math.min(n0, n1), Math.max(n0, n1)];
    if (fx) {
      B.box('darkMetal', a0, y, lo, a1, y + 0.06, hi);
      // railing
      B.box('darkMetal', a0, y + 0.95, side === 's' ? hi - 0.04 : lo, a1, y + 1.0, side === 's' ? hi : lo + 0.04);
      for (let a = a0; a <= a1 + 0.01; a += 0.5) B.box('darkMetal', a - 0.02, y, side === 's' ? hi - 0.04 : lo, a + 0.02, y + 1.0, side === 's' ? hi : lo + 0.04);
      // ladder (diagonal approximated by steps)
      const lx = f % 2 ? a0 + 0.3 : a1 - 1.6;
      for (let s = 0; s < 8; s++) B.box('darkMetal', lx + s * 0.16, y - FLOOR_H + 0.4 * s + 0.2, lo + 0.1, lx + s * 0.16 + 0.2, y - FLOOR_H + 0.4 * s + 0.24, hi - 0.1);
    } else {
      B.box('darkMetal', lo, y, a0, hi, y + 0.06, a1);
      B.box('darkMetal', side === 'e' ? hi - 0.04 : lo, y + 0.95, a0, side === 'e' ? hi : lo + 0.04, y + 1.0, a1);
      for (let a = a0; a <= a1 + 0.01; a += 0.5) B.box('darkMetal', side === 'e' ? hi - 0.04 : lo, y, a - 0.02, side === 'e' ? hi : lo + 0.04, y + 1.0, a + 0.02);
      const lz = f % 2 ? a0 + 0.3 : a1 - 1.6;
      for (let s = 0; s < 8; s++) B.box('darkMetal', lo + 0.1, y - FLOOR_H + 0.4 * s + 0.2, lz + s * 0.16, hi - 0.1, y - FLOOR_H + 0.4 * s + 0.24, lz + s * 0.16 + 0.2);
    }
  }
}

// Vertical blade sign (neon) on a corner
function bladeSign(B, rnd, side, r, y, text, colors) {
  const [ox, oz] = outward[side]; const fx = side === 'n' || side === 's';
  const key = useMat(`blade:${text}`, signMaterial(text, { w: 128, h: 512, fg: colors[0], bg: colors[1], neon: true, font: 'bold 70px "Oswald", sans-serif', vertical: true }));
  const along = fx ? r.x0 + 1.2 : r.z0 + 1.2;
  const base = fx ? (side === 's' ? r.z1 : r.z0) : (side === 'e' ? r.x1 : r.x0);
  const out0 = base + (fx ? oz : ox) * 0.3, out1 = base + (fx ? oz : ox) * 1.3;
  const h = 4.5;
  if (fx) {
    B.box('trim', along - 0.08, y, Math.min(out0, out1), along + 0.08, y + h, Math.max(out0, out1), { color: hex(colors[1]) });
    B.wall(key, along + 0.09, Math.min(out0, out1), along + 0.09, Math.max(out0, out1), y, y + h, [0, 0, 1, 1]);
    B.wall(key, along - 0.09, Math.max(out0, out1), along - 0.09, Math.min(out0, out1), y, y + h, [0, 0, 1, 1]);
  } else {
    B.box('trim', Math.min(out0, out1), y, along - 0.08, Math.max(out0, out1), y + h, along + 0.08, { color: hex(colors[1]) });
    B.wall(key, Math.max(out0, out1), along + 0.09, Math.min(out0, out1), along + 0.09, y, y + h, [0, 0, 1, 1]);
    B.wall(key, Math.min(out0, out1), along - 0.09, Math.max(out0, out1), along - 0.09, y, y + h, [0, 0, 1, 1]);
  }
  void rnd;
}

// ---------------------------------------------------------------------------
// Mid-rise mixed use (shops at street level, apartments/offices above)
export function midrise(B, rnd, r, fronts, opts = {}) {
  const y0 = CURB_H;
  const floors = opts.floors ?? 3 + ((rnd() * 4) | 0);
  const style = opts.style ?? ['brick', 'brickDark', 'stucco', 'stuccoPastel', 'brownstone'][(rnd() * 5) | 0];
  const fkey = useMat(`facade:${style}:${opts.seed ?? 1}`, facadeMaterial(style, opts.seed ?? 1));
  const top = y0 + GROUND_H + (floors - 1) * FLOOR_H;
  // ground floor: storefront on fronts, plain facade elsewhere
  const bandColor = style.startsWith('brick') ? [0.82, 0.78, 0.7] : style === 'brownstone' ? [0.55, 0.45, 0.38] : [0.9, 0.88, 0.84];
  for (const s of SIDES) {
    if (fronts.includes(s) && opts.shops !== false) storefront(B, rnd, s, r, y0, { storeSeed: (opts.seed ?? 1) * 10 + SIDES.indexOf(s) + ((rnd() * 6) | 0) });
    else facadeWall(B, fkey, s, r.x0, r.z0, r.x1, r.z1, y0, y0 + GROUND_H);
    facadeWall(B, fkey, s, r.x0, r.z0, r.x1, r.z1, y0 + GROUND_H, top);
  }
  // band between ground floor & upper floors
  cornice(B, r, y0 + GROUND_H - 0.05, 0.12, 0.3, bandColor);
  // cornice
  cornice(B, r, top - 0.1, style === 'brownstone' || style.startsWith('brick') ? 0.45 : 0.2, 0.6, bandColor);
  roofTop(B, rnd, r, top, { parapetColor: bandColor });
  if (style.startsWith('brick') && floors >= 4 && rnd() < 0.7) {
    const s = fronts[0];
    const fx = s === 'n' || s === 's';
    const a0 = fx ? r.x0 + 2 : r.z0 + 2;
    fireEscape(B, s, r, y0, floors, a0, a0 + 4.2);
  }
  if (opts.blade) bladeSign(B, rnd, fronts[0], r, y0 + GROUND_H + 1.2, opts.blade[0], [opts.blade[1], opts.blade[2]]);
  return [{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: top + 1 }];
}

// Residential walk-up with stoop, no shops
export function walkup(B, rnd, r, fronts, opts = {}) {
  const y0 = CURB_H;
  const floors = opts.floors ?? 3 + ((rnd() * 3) | 0);
  const style = opts.style ?? ['brick', 'brownstone', 'stuccoPastel', 'brickDark'][(rnd() * 4) | 0];
  const fkey = useMat(`facade:${style}:${opts.seed ?? 2}`, facadeMaterial(style, opts.seed ?? 2));
  const top = y0 + GROUND_H * 0.85 + (floors - 1) * FLOOR_H;
  for (const s of SIDES) facadeWall(B, fkey, s, r.x0, r.z0, r.x1, r.z1, y0, top, 0);
  const bandColor = style === 'brownstone' ? [0.5, 0.4, 0.33] : [0.86, 0.83, 0.76];
  cornice(B, r, top - 0.1, 0.4, 0.55, bandColor);
  roofTop(B, rnd, r, top, { parapetColor: bandColor, tank: rnd() < 0.25 });
  // entrance door + stoop on front
  const s = fronts[0]; const [ox, oz] = outward[s]; const fx = s === 'n' || s === 's';
  const along = fx ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
  const base = fx ? (s === 's' ? r.z1 : r.z0) : (s === 'e' ? r.x1 : r.x0);
  for (let i = 0; i < 3; i++) {
    const d0 = base + (fx ? oz : ox) * 0, d1 = base + (fx ? oz : ox) * (1.4 - i * 0.4);
    const lo = Math.min(d0, d1), hi = Math.max(d0, d1);
    if (fx) B.box('concrete', along - 1.1, y0, lo, along + 1.1, y0 + 0.2 * (i + 1), hi, { color: [0.78, 0.74, 0.68] });
    else B.box('concrete', lo, y0, along - 1.1, hi, y0 + 0.2 * (i + 1), along + 1.1, { color: [0.78, 0.74, 0.68] });
  }
  // door
  const dy0 = y0 + 0.6, dy1 = y0 + 3.0; const e = 0.02;
  const door = [0.25, 0.16, 0.1];
  if (fx) B.box('wood', along - 0.6, dy0, Math.min(base, base + oz * e), along + 0.6, dy1, Math.max(base, base + oz * e) + (s === 's' ? 0.04 : 0), { color: door });
  else B.box('wood', Math.min(base, base + ox * e), dy0, along - 0.6, Math.max(base, base + ox * e) + (s === 'e' ? 0.04 : 0), dy1, along + 0.6, { color: door });
  // balconies on pastel stucco
  if (style === 'stuccoPastel' && rnd() < 0.8) {
    for (let f = 1; f < floors; f++) {
      const y = y0 + GROUND_H * 0.85 + (f - 1) * FLOOR_H - 0.1;
      const a0 = along - 2.2, a1 = along + 2.2; const n1 = base + (fx ? oz : ox) * 1.1;
      const lo = Math.min(base, n1), hi = Math.max(base, n1);
      if (fx) { B.box('concrete', a0, y, lo, a1, y + 0.15, hi, { color: [0.9, 0.9, 0.88] }); B.box('darkMetal', a0, y + 0.15, s === 's' ? hi - 0.05 : lo, a1, y + 1.05, s === 's' ? hi : lo + 0.05); }
      else { B.box('concrete', lo, y, a0, hi, y + 0.15, a1, { color: [0.9, 0.9, 0.88] }); B.box('darkMetal', s === 'e' ? hi - 0.05 : lo, y + 0.15, a0, s === 'e' ? hi : lo + 0.05, y + 1.05, a1); }
    }
  } else if (style.startsWith('brick') && floors >= 4) {
    const a0 = (fx ? r.x0 : r.z0) + 1.5;
    fireEscape(B, s, r, y0 - GROUND_H * 0.15, floors, a0, a0 + 4.2);
  }
  return [{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: top + 1 }];
}

// Office tower with optional setbacks and glass lobby
export function tower(B, rnd, r, fronts, opts = {}) {
  const y0 = CURB_H;
  const floors = opts.floors ?? 10 + ((rnd() * 14) | 0);
  const style = opts.style ?? ['glass', 'glassGreen', 'glassDark', 'concrete'][(rnd() * 4) | 0];
  const fkey = useMat(`facade:${style}:${opts.seed ?? 3}`, facadeMaterial(style, opts.seed ?? 3));
  const lobbyH = 5.5;
  // lobby: dark glass recessed band with columns
  const lob = { x0: r.x0 + 0.8, z0: r.z0 + 0.8, x1: r.x1 - 0.8, z1: r.z1 - 0.8 };
  const lobbyKey = useMat('store:9001', storeMaterial(9001));
  for (const s of SIDES) {
    const len = s === 'n' || s === 's' ? lob.x1 - lob.x0 : lob.z1 - lob.z0;
    const uv = [0, 0, len / 12, 1];
    if (s === 's') B.wall(lobbyKey, lob.x0, lob.z1, lob.x1, lob.z1, y0, y0 + lobbyH, uv);
    else if (s === 'n') B.wall(lobbyKey, lob.x1, lob.z0, lob.x0, lob.z0, y0, y0 + lobbyH, uv);
    else if (s === 'e') B.wall(lobbyKey, lob.x1, lob.z1, lob.x1, lob.z0, y0, y0 + lobbyH, uv);
    else B.wall(lobbyKey, lob.x0, lob.z0, lob.x0, lob.z1, y0, y0 + lobbyH, uv);
  }
  // columns at the corners and every ~6 m
  const colC = style === 'concrete' ? [0.75, 0.73, 0.7] : [0.35, 0.38, 0.42];
  for (let x = r.x0; x <= r.x1 + 0.01; x += (r.x1 - r.x0) / Math.max(1, Math.round((r.x1 - r.x0) / 6))) for (const z of [r.z0, r.z1 - 0.8]) B.box('trim', x - 0.4, y0, z, x + 0.4, y0 + lobbyH, z + 0.8, { color: colC });
  for (let z = r.z0; z <= r.z1 + 0.01; z += (r.z1 - r.z0) / Math.max(1, Math.round((r.z1 - r.z0) / 6))) for (const x of [r.x0, r.x1 - 0.8]) B.box('trim', x, y0, z - 0.4, x + 0.8, y0 + lobbyH, z + 0.4, { color: colC });
  B.box('trim', r.x0 - 0.2, y0 + lobbyH, r.z0 - 0.2, r.x1 + 0.2, y0 + lobbyH + 0.6, r.z1 + 0.2, { color: colC });
  // shaft with setbacks
  let cur = { ...r }; let y = y0 + lobbyH + 0.6; let remaining = floors;
  const tiers = opts.setbacks ?? (floors > 16 ? 3 : floors > 11 ? 2 : 1);
  for (let t = 0; t < tiers; t++) {
    const n = t === tiers - 1 ? remaining : Math.max(3, Math.round(remaining * (0.55 + rnd() * 0.15)));
    remaining -= n;
    const h = n * FLOOR_H;
    for (const s of SIDES) facadeWall(B, fkey, s, cur.x0, cur.z0, cur.x1, cur.z1, y, y + h, t * 0.25);
    // vertical fins for concrete towers
    if (style === 'concrete') {
      for (let x = cur.x0; x <= cur.x1 + 0.01; x += BAY_W * 2) { B.box('trim', x - 0.15, y, cur.z0 - 0.35, x + 0.15, y + h, cur.z0, { color: [0.8, 0.78, 0.74] }); B.box('trim', x - 0.15, y, cur.z1, x + 0.15, y + h, cur.z1 + 0.35, { color: [0.8, 0.78, 0.74] }); }
    }
    y += h;
    B.box('trim', cur.x0 - 0.15, y, cur.z0 - 0.15, cur.x1 + 0.15, y + 0.5, cur.z1 + 0.15, { color: style === 'concrete' ? [0.78, 0.76, 0.72] : [0.55, 0.6, 0.64] });
    if (t < tiers - 1) {
      roofTop(B, rnd, cur, y + 0.5, { parapet: 1.1, tank: false, parapetColor: [0.6, 0.62, 0.64] });
      const inset = 2.5 + rnd() * 2.5;
      cur = { x0: cur.x0 + inset, z0: cur.z0 + inset, x1: cur.x1 - inset, z1: cur.z1 - inset };
      y += 0.5;
    }
  }
  roofTop(B, rnd, cur, y + 0.5, { parapet: 1.3, tank: false, antenna: rnd() < 0.6 ? 6 + rnd() * 12 : 0, parapetColor: [0.6, 0.62, 0.64] });
  // crown light strip
  if (opts.crown) {
    const k = useMat('neon:crown', signMaterial(' ', { bg: opts.crown, fg: opts.crown, neon: true, border: false }));
    B.box(k, cur.x0 - 0.2, y + 0.5, cur.z0 - 0.2, cur.x1 + 0.2, y + 0.75, cur.z1 + 0.2);
  }
  // logo sign on the front near the top
  if (opts.logo) {
    const s = fronts[0]; const key = useMat(`logo:${opts.logo[0]}`, signMaterial(opts.logo[0], { fg: opts.logo[1], bg: opts.logo[2], neon: true, border: false, w: 512, h: 128 }));
    const ly = y - 4.5, lw = Math.min(14, (s === 'n' || s === 's' ? cur.x1 - cur.x0 : cur.z1 - cur.z0) - 2);
    const cx = (cur.x0 + cur.x1) / 2, cz = (cur.z0 + cur.z1) / 2; const e = 0.08;
    if (s === 's') B.wall(key, cx - lw / 2, cur.z1 + e, cx + lw / 2, cur.z1 + e, ly, ly + lw / 4, [0, 0, 1, 1]);
    else if (s === 'n') B.wall(key, cx + lw / 2, cur.z0 - e, cx - lw / 2, cur.z0 - e, ly, ly + lw / 4, [0, 0, 1, 1]);
    else if (s === 'e') B.wall(key, cur.x1 + e, cz + lw / 2, cur.x1 + e, cz - lw / 2, ly, ly + lw / 4, [0, 0, 1, 1]);
    else B.wall(key, cur.x0 - e, cz - lw / 2, cur.x0 - e, cz + lw / 2, ly, ly + lw / 4, [0, 0, 1, 1]);
  }
  return [{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: y + 1 }];
}

// Simple low building used for special sites (police, hospital, gas mart, warehouse)
export function special(B, rnd, r, fronts, opts) {
  const y0 = opts.y0 ?? CURB_H;
  const floors = opts.floors;
  const fkey = useMat(`facade:${opts.style}:${opts.seed ?? 4}`, facadeMaterial(opts.style, opts.seed ?? 4));
  const top = y0 + GROUND_H + (floors - 1) * FLOOR_H;
  for (const s of SIDES) {
    if (fronts.includes(s) && opts.store) {
      const k = useMat(`store:${opts.store}`, storeMaterial(opts.store));
      const len = s === 'n' || s === 's' ? r.x1 - r.x0 : r.z1 - r.z0; const uv = [0, 0, len / 12, 1];
      if (s === 's') B.wall(k, r.x0, r.z1, r.x1, r.z1, y0, y0 + GROUND_H, uv);
      else if (s === 'n') B.wall(k, r.x1, r.z0, r.x0, r.z0, y0, y0 + GROUND_H, uv);
      else if (s === 'e') B.wall(k, r.x1, r.z1, r.x1, r.z0, y0, y0 + GROUND_H, uv);
      else B.wall(k, r.x0, r.z0, r.x0, r.z1, y0, y0 + GROUND_H, uv);
      facadeWall(B, fkey, s, r.x0, r.z0, r.x1, r.z1, y0 + GROUND_H, top);
    } else facadeWall(B, fkey, s, r.x0, r.z0, r.x1, r.z1, y0, top);
  }
  cornice(B, r, top - 0.1, 0.25, 0.5, opts.trim || [0.85, 0.85, 0.83]);
  roofTop(B, rnd, r, top, { parapetColor: opts.trim || [0.85, 0.85, 0.83], tank: false });
  if (opts.sign) {
    const s = fronts[0]; const sg = opts.sign;
    const key = useMat(`sign:${sg[0]}`, signMaterial(sg[0], { fg: sg[1], bg: sg[2], neon: sg[3], border: false, w: 512, h: 112 }));
    const w = Math.min(12, (s === 'n' || s === 's' ? r.x1 - r.x0 : r.z1 - r.z0) - 2), h = w * 0.22;
    const y = y0 + GROUND_H + 0.2; const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; const e = 0.06;
    if (s === 's') B.wall(key, cx - w / 2, r.z1 + e, cx + w / 2, r.z1 + e, y, y + h, [0, 0, 1, 1]);
    else if (s === 'n') B.wall(key, cx + w / 2, r.z0 - e, cx - w / 2, r.z0 - e, y, y + h, [0, 0, 1, 1]);
    else if (s === 'e') B.wall(key, r.x1 + e, cz + w / 2, r.x1 + e, cz - w / 2, y, y + h, [0, 0, 1, 1]);
    else B.wall(key, r.x0 - e, cz - w / 2, r.x0 - e, cz + w / 2, y, y + h, [0, 0, 1, 1]);
  }
  return [{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: top + 1 }];
}
