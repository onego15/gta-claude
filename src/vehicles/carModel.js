// Procedural car models. The body shell is lofted along the car's length from side/plan
// profiles, which gives real wheel arches, a sloped windshield, tumblehome and rounded
// ends. Local space: +z forward, +x = left (driver) side, y up, origin on the ground
// halfway between the axles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, toTexture } from '../world/textures.js';

// piecewise smooth interpolation through control points [[t, v], ...]
function curve(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 0; i < points.length - 1; i++) {
      const [t0, v0] = points[i], [t1, v1] = points[i + 1];
      if (t <= t1) { const k = (t - t0) / (t1 - t0); const s = k * k * (3 - 2 * k); return v0 + (v1 - v0) * s; }
    }
    return points[points.length - 1][1];
  };
}

export const CAR_TYPES = {
  sedan: {
    L: 4.7, W: 1.84, wheelR: 0.34, wheelW: 0.24, base: 2.75, track: 1.56, clear: 0.2,
    belt: [[0, 0.78], [0.05, 0.92], [0.24, 0.98], [0.34, 1.0], [0.66, 0.98], [0.86, 0.9], [0.97, 0.78], [1, 0.62]],
    roof: { rear: 0.27, rearTop: 0.39, frontTop: 0.56, front: 0.69, h: 1.44 },
    width: [[0, 0.8], [0.04, 0.95], [0.15, 1], [0.85, 1], [0.96, 0.93], [1, 0.74]],
    bottomEnd: 0.42, doorZ: [0.44, 0.66], mass: 1400, power: 1.0, maxSpeed: 52,
  },
  hatch: {
    L: 4.05, W: 1.76, wheelR: 0.32, wheelW: 0.22, base: 2.5, track: 1.5, clear: 0.2,
    belt: [[0, 0.82], [0.05, 0.95], [0.2, 0.98], [0.66, 0.96], [0.88, 0.86], [0.97, 0.74], [1, 0.6]],
    roof: { rear: 0.04, rearTop: 0.14, frontTop: 0.55, front: 0.7, h: 1.47 },
    width: [[0, 0.86], [0.04, 0.96], [0.15, 1], [0.85, 1], [0.96, 0.92], [1, 0.74]],
    bottomEnd: 0.4, doorZ: [0.42, 0.66], mass: 1150, power: 0.9, maxSpeed: 46,
  },
  suv: {
    L: 4.85, W: 1.95, wheelR: 0.4, wheelW: 0.27, base: 2.85, track: 1.66, clear: 0.28,
    belt: [[0, 0.98], [0.05, 1.08], [0.2, 1.12], [0.68, 1.1], [0.88, 1.04], [0.97, 0.92], [1, 0.78]],
    roof: { rear: 0.05, rearTop: 0.11, frontTop: 0.57, front: 0.7, h: 1.78 },
    width: [[0, 0.88], [0.04, 0.97], [0.15, 1], [0.85, 1], [0.96, 0.94], [1, 0.8]],
    bottomEnd: 0.5, doorZ: [0.44, 0.67], mass: 2000, power: 1.1, maxSpeed: 47,
  },
  van: {
    L: 5.2, W: 1.98, wheelR: 0.36, wheelW: 0.25, base: 3.2, track: 1.7, clear: 0.24,
    belt: [[0, 1.0], [0.04, 1.08], [0.2, 1.1], [0.78, 1.1], [0.9, 1.02], [0.98, 0.85], [1, 0.72]],
    roof: { rear: 0.02, rearTop: 0.05, frontTop: 0.72, front: 0.84, h: 2.1 },
    width: [[0, 0.92], [0.03, 0.99], [0.12, 1], [0.88, 1], [0.97, 0.94], [1, 0.82]],
    bottomEnd: 0.45, doorZ: [0.66, 0.84], mass: 2300, power: 0.95, maxSpeed: 40, windowsRear: false,
  },
  sports: {
    L: 4.45, W: 1.92, wheelR: 0.34, wheelW: 0.28, base: 2.6, track: 1.62, clear: 0.13,
    belt: [[0, 0.72], [0.05, 0.86], [0.22, 0.9], [0.4, 0.88], [0.68, 0.8], [0.88, 0.7], [0.97, 0.58], [1, 0.46]],
    roof: { rear: 0.22, rearTop: 0.42, frontTop: 0.56, front: 0.73, h: 1.24 },
    width: [[0, 0.82], [0.05, 0.98], [0.2, 1], [0.8, 0.98], [0.95, 0.9], [1, 0.72]],
    bottomEnd: 0.32, doorZ: [0.4, 0.66], mass: 1350, power: 1.55, maxSpeed: 68,
  },
  pickup: {
    L: 5.3, W: 1.98, wheelR: 0.41, wheelW: 0.27, base: 3.3, track: 1.68, clear: 0.3,
    belt: [[0, 1.02], [0.04, 1.1], [0.42, 1.12], [0.7, 1.12], [0.88, 1.05], [0.97, 0.94], [1, 0.8]],
    roof: { rear: 0.42, rearTop: 0.45, frontTop: 0.62, front: 0.72, h: 1.86 },
    width: [[0, 0.95], [0.03, 1], [0.95, 1], [1, 0.84]],
    bottomEnd: 0.5, doorZ: [0.5, 0.68], mass: 2200, power: 1.1, maxSpeed: 46, bed: [0.02, 0.4],
  },
};

const paintTexCache = new Map();
function paintDetailTexture(type, livery) {
  const key = type + (livery || '');
  if (paintTexCache.has(key)) return paintTexCache.get(key);
  const P = CAR_TYPES[type];
  const W = 1024, H = 512; const c = canvas(W, H), g = c.getContext('2d');
  // u = along length (rear->front); v in [0,0.5) = right side (-x), [0.5,1] = left side (+x).
  // Each half: 0 = bottom center .. 1 = roof center. The left side is seen with the car's
  // front on the viewer's left, so text there is drawn mirrored.
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  for (const half of [0, 1]) {
    const vy = (v) => (1 - (half * 0.5 + v * 0.5)) * H;
    const text = (str, u, v, size, color) => {
      g.save(); g.translate(u * W, vy(v)); g.scale(half ? -1 : 1, 1); g.font = `bold ${size}px "Oswald", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(str, 0, 0); g.restore();
    };
    if (livery === 'police') {
      g.fillStyle = '#16181c'; g.fillRect(0, vy(1), W, vy(0) - vy(1));
      g.fillStyle = '#f4f4f2'; g.fillRect(W * (P.doorZ[0] - 0.2), vy(0.62), W * (P.doorZ[1] - P.doorZ[0] + 0.2), vy(0.18) - vy(0.62));
      g.fillStyle = '#f4f4f2'; g.fillRect(0, vy(1), W, vy(0.86) - vy(1)); // white roof
      text('POLICE', (P.doorZ[0] + P.doorZ[1] - 0.2) / 2, 0.41, 26, '#18306a');
      g.fillStyle = '#c9a227'; g.fillRect(W * (P.doorZ[0] - 0.2), vy(0.6), W * (P.doorZ[1] - P.doorZ[0] + 0.2), 3);
    }
    if (livery === 'taxi') {
      g.fillStyle = '#111'; for (let x = W * 0.3; x < W * 0.72; x += 12) { g.fillRect(x, vy(0.47), 6, 5); g.fillRect(x + 6, vy(0.47) + 5, 6, 5); }
      text('TAXI', (P.doorZ[0] + P.doorZ[1]) / 2, 0.38, 20, '#111');
    }
    g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 2;
    const seam = (u0, u1) => { g.beginPath(); g.moveTo(u0 * W, vy(0.2)); g.lineTo(u0 * W, vy(0.66)); g.moveTo(u1 * W, vy(0.2)); g.lineTo(u1 * W, vy(0.66)); g.stroke(); };
    seam(P.doorZ[0], P.doorZ[1]);
    if (type === 'sedan' || type === 'suv') seam(P.doorZ[0] - 0.2, P.doorZ[0]);
    g.fillStyle = 'rgba(30,30,30,0.6)';
    g.fillRect(P.doorZ[0] * W + 10, vy(0.58), 22, 4);
    if (type === 'sedan' || type === 'suv') g.fillRect((P.doorZ[0] - 0.2) * W + 10, vy(0.58), 22, 4);
    const gr = g.createLinearGradient(0, vy(0.25), 0, vy(0.04));
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,35,30,0.35)'); g.fillStyle = gr; g.fillRect(0, vy(0.25), W, vy(0.04) - vy(0.25));
  }
  const t = toTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  paintTexCache.set(key, t);
  return t;
}

// ring definition: points on the right half (x >= 0 here means left/driver side; mirrored)
const K = 14; // points per half ring (bottom center -> roof center)

function buildShell(type) {
  const P = CAR_TYPES[type];
  const belt = curve(P.belt), widthF = curve(P.width);
  const N = 56;
  const half = P.W / 2, L = P.L;
  const zw = [-P.base / 2, P.base / 2];
  const archR = P.wheelR + 0.07;
  const bodyPos = [], bodyUV = [], glassPos = [], glassUV = [];
  const ringsBody = [], flags = [];
  const roofAt = (t) => {
    const r = P.roof;
    if (t < r.rear || t > r.front) return null;
    const bt = belt(t);
    if (t < r.rearTop) { const k = (t - r.rear) / (r.rearTop - r.rear); return bt + (r.h - bt) * Math.sin(k * Math.PI / 2) ** 0.8; }
    if (t > r.frontTop) { const k = (r.front - t) / (r.front - r.frontTop); return bt + (r.h - bt) * Math.sin(k * Math.PI / 2) ** 0.75; }
    return r.h + 0.015 * Math.sin(((t - r.rearTop) / (r.frontTop - r.rearTop)) * Math.PI);
  };
  for (let i = 0; i <= N; i++) {
    // denser stations near the ends
    const s = i / N; const t = 0.5 - 0.5 * Math.cos(s * Math.PI);
    const z = -L / 2 + t * L;
    let w = half * widthF(t);
    const bt = belt(t);
    let yb = P.clear + 0.08;
    // rounded bumpers at ends
    const endK = Math.min(t, 1 - t);
    if (endK < 0.05) yb = P.clear + 0.08 + (P.bottomEnd - P.clear) * (1 - endK / 0.05) ** 2;
    let arch = false;
    for (const wz of zw) { const dz = z - wz; if (Math.abs(dz) < archR) { yb = Math.max(yb, P.wheelR + Math.sqrt(archR * archR - dz * dz)); arch = true; } }
    const rt = roofAt(t);
    const top = rt ?? bt + 0.04;
    const gh = rt ? 1 : 0;
    // half-ring points (x positive), from bottom center up to roof center
    const pts = [];
    const sideTopW = w * 0.985;
    pts.push([0, yb]);
    pts.push([w * 0.7, yb]);
    pts.push([w * 0.93, yb + 0.03]);
    pts.push([w, Math.min(yb + 0.14, (yb + bt) / 2)]);
    pts.push([w * 1.0, yb + (bt - yb) * 0.55]);
    pts.push([sideTopW, bt - 0.04]);
    pts.push([w * 0.95, bt]);
    {
      // same point layout with or without a greenhouse so neighbouring rings always match
      const k = gh ? 1 : 0;
      const gw0 = w * (0.92 - 0.04 * (1 - k)), gw1 = w * (0.74 * k + 0.62 * (1 - k));
      const tp = gh ? top : bt + 0.04;
      pts.push([gw0, bt + 0.012 + 0.003 * k]);
      pts.push([gw0 + (gw1 - gw0) * 0.35, bt + (tp - bt) * 0.35 + 0.006 * (1 - k)]);
      pts.push([gw0 + (gw1 - gw0) * 0.72, bt + (tp - bt) * 0.72 + 0.004 * (1 - k)]);
      pts.push([gw1, tp - 0.03 * k]);
      pts.push([w * (0.6 * k + 0.45 * (1 - k)), tp]);
      pts.push([w * (0.3 * k + 0.22 * (1 - k)), tp + 0.012]);
      pts.push([0, tp + 0.015]);
    }
    ringsBody.push({ z, t, pts, gh, arch, rt, bt });
  }
  // glass region per quad: segment j in [7,10] on greenhouse stations => side window; top segments on sloped parts => windshield / rear glass
  const r = P.roof;
  const isGlass = (t0, t1, j) => {
    const ring0 = ringsBody.find((q) => q.t === t0), ring1 = ringsBody.find((q) => q.t === t1);
    if (!ring0.gh || !ring1.gh) return false;
    const tm = (t0 + t1) / 2;
    if (j >= 7 && j <= 9) {
      // side windows with A/B/C pillars
      if (tm < r.rear + 0.025 || tm > r.front - 0.03) return false;
      if (P.windowsRear === false && tm < r.frontTop - 0.08) return false;
      const bPillar = P.doorZ[0];
      if (Math.abs(tm - bPillar) < 0.012) return false;
      return true;
    }
    if (j >= 10) {
      if (tm > r.frontTop + 0.006 && tm < r.front - 0.01) return true; // windshield
      if (tm < r.rearTop - 0.004 && tm > r.rear + 0.008 && P.windowsRear !== false) return true; // rear window
    }
    return false;
  };
  // door panel (driver side): faces with x>0, t in doorZ, j in [1..9]
  const doorPos = [], doorUV = [], doorGlass = [];
  const pushQuad = (arr, uvArr, a, b, c, d, ua, ub, uc, ud) => { arr.push(...a, ...b, ...c, ...a, ...c, ...d); uvArr.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud); };
  for (let i = 0; i < ringsBody.length - 1; i++) {
    const A = ringsBody[i], Bq = ringsBody[i + 1];
    for (let j = 0; j < K - 1; j++) {
      for (const side of [1, -1]) {
        const p = (R, k) => [R.pts[k][0] * side, R.pts[k][1], R.z];
        let a = p(A, j), b = p(Bq, j), c = p(Bq, j + 1), d = p(A, j + 1);
        const vo = side === 1 ? 0.5 : 0; const ua = [A.t, vo + j / (K - 1) / 2], ub = [Bq.t, vo + j / (K - 1) / 2], uc = [Bq.t, vo + (j + 1) / (K - 1) / 2], ud = [A.t, vo + (j + 1) / (K - 1) / 2];
        const glass = isGlass(A.t, Bq.t, j);
        const inDoor = side === 1 && j >= 1 && j <= 9 && A.t >= P.doorZ[0] - 1e-6 && Bq.t <= P.doorZ[1] + 1e-6 && (j <= 6 || glass);
        // winding: outward facing
        if (side === 1) { [a, b, c, d] = [a, d, c, b]; }
        const uvs = side === 1 ? [ua, ud, uc, ub] : [ua, ub, uc, ud];
        if (inDoor) { if (glass) pushQuad(doorGlass, [], a, b, c, d, ...uvs); else pushQuad(doorPos, doorUV, a, b, c, d, ...uvs); continue; }
        if (glass) pushQuad(glassPos, glassUV, a, b, c, d, ...uvs); else pushQuad(bodyPos, bodyUV, a, b, c, d, ...uvs);
      }
    }
  }
  // end caps
  for (const [R, dir] of [[ringsBody[0], -1], [ringsBody[ringsBody.length - 1], 1]]) {
    const cy = R.pts.reduce((s, q) => s + q[1], 0) / R.pts.length;
    for (let j = 0; j < K - 1; j++) for (const side of [1, -1]) {
      const a = [0, cy, R.z], b = [R.pts[j][0] * side, R.pts[j][1], R.z], c = [R.pts[j + 1][0] * side, R.pts[j + 1][1], R.z];
      const flip = (dir * side) > 0;
      const tri = flip ? [a, c, b] : [a, b, c];
      bodyPos.push(...tri[0], ...tri[1], ...tri[2]); bodyUV.push(R.t, 0.05, R.t, 0.05, R.t, 0.05);
    }
  }
  const mk = (pos, uv) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (uv && uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); else g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.computeVertexNormals();
    return g;
  };
  // smooth normals for the body by merging vertices
  const body = smoothGeo(mk(bodyPos, bodyUV));
  const glass = mk(glassPos, glassUV);
  const door = smoothGeo(mk(doorPos, doorUV));
  const doorG = mk(doorGlass, null);
  return { body, glass, door, doorGlass: doorG, rings: ringsBody, roofAt, belt };
}

function smoothGeo(g) {
  // average normals of coincident vertices (keeps UV seams)
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  for (let i = 0; i < pos.count; i++) { const k = key(i); let e = map.get(k); if (!e) { e = [0, 0, 0, []]; map.set(k, e); } e[0] += nor.getX(i); e[1] += nor.getY(i); e[2] += nor.getZ(i); e[3].push(i); }
  for (const e of map.values()) { const l = Math.hypot(e[0], e[1], e[2]) || 1; for (const i of e[3]) nor.setXYZ(i, e[0] / l, e[1] / l, e[2] / l); }
  return g;
}

// --- wheels -----------------------------------------------------------------------------------
const wheelCache = new Map();
function wheelGeos(r, w, sporty) {
  const k = `${r}:${w}:${sporty}`;
  if (wheelCache.has(k)) return wheelCache.get(k);
  // tire: lathe profile around the axle (axle = local x after rotation)
  const prof = [];
  const rr = r, ri = r * 0.68, hw = w / 2;
  const n = 10;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI; prof.push(new THREE.Vector2(rr - 0.05 + Math.cos(a) * 0.05, Math.sin(a) * hw)); }
  prof.unshift(new THREE.Vector2(ri, -hw * 0.92)); prof.push(new THREE.Vector2(ri, hw * 0.92));
  const tire = new THREE.LatheGeometry(prof, 28); tire.rotateZ(Math.PI / 2);
  // rim: dish + spokes
  const rimParts = [];
  const dish = new THREE.CylinderGeometry(ri * 0.98, ri * 0.98, w * 0.5, 24, 1, true); dish.rotateZ(Math.PI / 2); rimParts.push(dish);
  const face = new THREE.CircleGeometry(ri * 0.25, 16); face.rotateY(Math.PI / 2); face.translate(hw * 0.42, 0, 0); rimParts.push(face);
  const spokes = sporty ? 10 : 6;
  for (let i = 0; i < spokes; i++) {
    const s = new THREE.BoxGeometry(0.03, ri * 0.82, sporty ? 0.035 : 0.07); s.translate(hw * 0.4, ri * 0.5, 0); s.rotateX((i / spokes) * Math.PI * 2); rimParts.push(s);
  }
  const outer = new THREE.TorusGeometry(ri * 0.95, 0.02, 6, 24); outer.rotateY(Math.PI / 2); outer.translate(hw * 0.38, 0, 0); rimParts.push(outer);
  const rim = mergeGeometries(rimParts.map((g) => { const q = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(a)) q.deleteAttribute(a); if (!q.getAttribute('uv')) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.getAttribute('position').count * 2), 2)); return q; }));
  const res = { tire, rim };
  wheelCache.set(k, res);
  return res;
}

// --- materials ----------------------------------------------------------------------------------
const shared = {};
function sharedMats() {
  if (shared.ready) return shared;
  shared.glass = new THREE.MeshPhysicalMaterial({ color: '#1a2228', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55, envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false });
  shared.tire = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.92 });
  shared.rim = new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.25, metalness: 0.95, envMapIntensity: 1.6 });
  shared.rimDark = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.8 });
  shared.trim = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.6, metalness: 0.2 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: '#d8dade', roughness: 0.12, metalness: 1.0, envMapIntensity: 2 });
  shared.interior = new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.9 });
  shared.well = new THREE.MeshStandardMaterial({ color: '#0c0c0c', roughness: 1, side: THREE.DoubleSide });
  shared.plate = new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5 });
  shared.ready = true;
  return shared;
}
function plateTexture() {
  const c = canvas(128, 64), g = c.getContext('2d');
  g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#2a3f7a'; g.lineWidth = 4; g.strokeRect(3, 3, 122, 58);
  g.fillStyle = '#2a3f7a'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('PORT AURORA', 64, 17);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 26px monospace'; g.fillText('7PA-' + Math.floor(Math.random() * 900 + 100), 64, 48);
  return toTexture(c, { repeat: false });
}

export const CAR_COLORS = ['#8c1c1c', '#1e3a6e', '#e8e6e0', '#151617', '#6d7278', '#2f5a3c', '#a8a9ad', '#c46a1d', '#3b2a4f', '#5a1f2c', '#2a5d7a', '#d8c9a5', '#474b50', '#7a0f14'];

// Build a complete car object. Returns { group, body, wheels[], door, lights{...}, dims }
export function buildCar(type, { color = '#8c1c1c', livery = null } = {}) {
  const P = CAR_TYPES[type];
  const S = sharedMats();
  const shell = buildShell(type);
  const paint = new THREE.MeshPhysicalMaterial({ color: livery === 'police' ? '#ffffff' : livery === 'taxi' ? '#f2b705' : color, roughness: 0.38, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08, map: paintDetailTexture(type, livery), envMapIntensity: 1.3 });
  const group = new THREE.Group();
  const body = new THREE.Group(); group.add(body); // body sways with suspension
  const add = (geo, mat, parent = body, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  add(shell.body, paint);
  add(shell.glass, S.glass, body, false);
  // wheel wells (dark half cylinders inside the arches)
  for (const wz of [-P.base / 2, P.base / 2]) {
    const wg = new THREE.CylinderGeometry(P.wheelR + 0.06, P.wheelR + 0.06, P.W * 0.9, 16, 1, true, -Math.PI / 2, Math.PI);
    wg.rotateZ(Math.PI / 2); wg.rotateX(Math.PI / 2); wg.rotateY(0); wg.translate(0, P.wheelR, wz);
    add(wg, S.well, body, false);
  }
  // underbody plate
  const ub = new THREE.BoxGeometry(P.W * 0.86, 0.06, P.L * 0.82); ub.translate(0, P.clear + 0.08, 0); add(ub, S.trim, body, false);
  // interior: seats, dash, steering wheel
  const belt0 = shell.belt(0.55);
  const iy = Math.max(P.clear + 0.25, belt0 - 0.55);
  const seatZ = (P.doorZ[0] + P.doorZ[1]) / 2 * P.L - P.L / 2 - 0.15;
  for (const x of [0.38, -0.38]) {
    const seat = new THREE.BoxGeometry(0.5, 0.14, 0.5); seat.translate(x * P.W / 1.84, iy + 0.12, seatZ); add(seat, S.interior, body, false);
    const back = new THREE.BoxGeometry(0.5, 0.65, 0.12); back.rotateX(-0.25); back.translate(x * P.W / 1.84, iy + 0.48, seatZ - 0.3); add(back, S.interior, body, false);
  }
  const dashZ = P.roof.front * P.L - P.L / 2 - 0.25;
  const dash = new THREE.BoxGeometry(P.W * 0.85, 0.25, 0.4); dash.translate(0, belt0 - 0.12, dashZ); add(dash, S.interior, body, false);
  const sw = new THREE.TorusGeometry(0.18, 0.025, 6, 16); sw.rotateX(-0.45); sw.translate(0.38 * P.W / 1.84, belt0 + 0.02, dashZ - 0.32); add(sw, S.trim, body, false);
  if (P.bed) {
    // pickup bed: dark open box
    const z0 = P.bed[0] * P.L - P.L / 2, z1 = P.bed[1] * P.L - P.L / 2; const bt = shell.belt(0.2);
    const floor = new THREE.BoxGeometry(P.W * 0.86, 0.05, z1 - z0); floor.translate(0, bt - 0.45, (z0 + z1) / 2); add(floor, S.trim);
  }
  // door (driver side, hinged at its front edge)
  const hingeZ = P.doorZ[1] * P.L - P.L / 2, hingeX = P.W / 2;
  const doorPivot = new THREE.Group(); doorPivot.position.set(hingeX, 0, hingeZ); body.add(doorPivot);
  shell.door.translate(-hingeX, 0, -hingeZ); shell.doorGlass.translate(-hingeX, 0, -hingeZ);
  add(shell.door, paint, doorPivot); add(shell.doorGlass, S.glass, doorPivot, false);
  // lights: headlights, taillights, grille, bumpers, mirrors, plates
  const headMat = new THREE.MeshStandardMaterial({ color: '#f4f6f8', emissive: '#fff4e0', emissiveIntensity: 0.05, roughness: 0.1, metalness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#6a0d0d', emissive: '#ff1a10', emissiveIntensity: 0.25, roughness: 0.25 });
  const fz = P.L / 2, rz = -P.L / 2;
  const frontRing = shell.rings[shell.rings.length - 3], rearRing = shell.rings[2];
  const yh = shell.belt(0.96) - 0.12;
  const hw = frontRing.pts[4][0];
  for (const s of [1, -1]) {
    const hl = new THREE.BoxGeometry(0.34, 0.11, 0.1); hl.rotateY(-s * 0.35); hl.translate(s * (hw - 0.22), yh, fz - 0.08 - (type === 'van' ? 0.02 : 0.03));
    add(hl, headMat, body, false);
    const tl = new THREE.BoxGeometry(0.36, 0.12, 0.08); tl.rotateY(s * 0.25); tl.translate(s * (rearRing.pts[4][0] - 0.2), shell.belt(0.03) - 0.12, rz + 0.07);
    add(tl, tailMat, body, false);
    // mirror
    const mz = P.roof.front * P.L - P.L / 2 - 0.05;
    const mir = new THREE.BoxGeometry(0.16, 0.1, 0.12); mir.translate(s * (P.W / 2 + 0.06), shell.belt(P.roof.front) + 0.08, mz); add(mir, s === 1 ? paint : paint, body);
    if (s === 1) { /* driver mirror sits on the door frame */ }
  }
  // grille & bumpers
  const grille = new THREE.BoxGeometry(hw * 1.1, 0.16, 0.06); grille.translate(0, yh - 0.12, fz - 0.06); add(grille, S.trim, body, false);
  const fb = new THREE.BoxGeometry(P.W * 0.92, 0.14, 0.12); fb.translate(0, P.bottomEnd + 0.05, fz - 0.07); add(fb, S.trim);
  const rb = new THREE.BoxGeometry(P.W * 0.92, 0.14, 0.12); rb.translate(0, P.bottomEnd + 0.05, rz + 0.07); add(rb, S.trim);
  const pf = new THREE.PlaneGeometry(0.42, 0.13); pf.translate(0, P.bottomEnd + 0.06, fz - 0.005); add(pf, S.plate, body, false);
  const pr = new THREE.PlaneGeometry(0.42, 0.13); pr.rotateY(Math.PI); pr.translate(0, P.bottomEnd + 0.2, rz + 0.005); add(pr, S.plate, body, false);
  // roof extras
  let lightbar = null; let taxiSign = null;
  if (livery === 'police') {
    const y = shell.roofAt(0.45) + 0.02;
    lightbar = { red: new THREE.MeshStandardMaterial({ color: '#550000', emissive: '#ff1010', emissiveIntensity: 0 }), blue: new THREE.MeshStandardMaterial({ color: '#000055', emissive: '#1040ff', emissiveIntensity: 0 }) };
    const base = new THREE.BoxGeometry(1.1, 0.06, 0.26); base.translate(0, y + 0.03, -0.1); add(base, S.trim);
    const lr = new THREE.BoxGeometry(0.5, 0.11, 0.22); lr.translate(0.27, y + 0.11, -0.1); add(lr, lightbar.red, body, false);
    const lb = new THREE.BoxGeometry(0.5, 0.11, 0.22); lb.translate(-0.27, y + 0.11, -0.1); add(lb, lightbar.blue, body, false);
    // push bar
    const pb = new THREE.BoxGeometry(P.W * 0.6, 0.35, 0.08); pb.translate(0, P.bottomEnd + 0.22, fz + 0.03); add(pb, S.trim);
  }
  if (livery === 'taxi') {
    const y = shell.roofAt(0.45) + 0.02;
    taxiSign = new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffcc33', emissiveIntensity: 0.1 });
    const ts = new THREE.BoxGeometry(0.6, 0.2, 0.22); ts.translate(0, y + 0.1, -0.1); add(ts, taxiSign);
  }
  // wheels
  const wg = wheelGeos(P.wheelR, P.wheelW, type === 'sports');
  const wheels = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * (P.track / 2), P.wheelR, sz * P.base / 2);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(wg.tire, S.tire); tire.castShadow = true; spin.add(tire);
    const rim = new THREE.Mesh(wg.rim, type === 'sports' || type === 'suv' ? S.rimDark : S.rim); rim.castShadow = false;
    if (sx < 0) rim.scale.x = -1;
    spin.add(rim);
    group.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0, side: sx });
  }
  const dims = { L: P.L, W: P.W, H: P.roof.h, hx: P.W / 2, hz: P.L / 2, wheelR: P.wheelR, base: P.base, track: P.track };
  const seat = { x: 0.38 * P.W / 1.84, y: iy + 0.05, z: seatZ };
  const doorPos = { x: P.W / 2 + 0.55, z: (P.doorZ[0] + P.doorZ[1]) / 2 * P.L - P.L / 2 };
  return { group, body, wheels, doorPivot, paint, lights: { head: headMat, tail: tailMat, lightbar, taxiSign }, dims, seat, doorPos, params: P };
}
