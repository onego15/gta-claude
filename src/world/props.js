// Street furniture and vegetation as instanced meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { emissiveMats } from './materials.js';
import { CURB_H } from './layout.js';

const M4 = () => new THREE.Matrix4();
function colored(geo, color, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  const c = new THREE.Color(color); const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const merge = (parts) => mergeGeometries(parts, false);
const tr = (x, y, z) => M4().makeTranslation(x, y, z);
const trs = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => M4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function instanced(geo, mat, items, matFn, { shadow = true, receive = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, i) => im.setMatrixAt(i, matFn(it)));
  im.count = items.length; im.castShadow = shadow; im.receiveShadow = receive;
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  return im;
}
const place = (it, y = CURB_H, s = 1) => trs(it.x, it.y ?? y, it.z, 0, it.rot || 0, 0, s, s, s);

// ---------------- geometry builders ---------------------------------------------------------
function streetLightGeo() {
  const pole = '#3c4146';
  const p = [];
  p.push(colored(new THREE.CylinderGeometry(0.1, 0.16, 0.6, 10), '#2e3236', tr(0, 0.3, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.06, 0.1, 7.6, 10), pole, tr(0, 4.1, 0)));
  // arm toward -z (the road side when rot=0 means the light faces -z)
  p.push(colored(new THREE.CylinderGeometry(0.045, 0.05, 2.2, 8), pole, trs(0, 7.75, -1.0, Math.PI / 2 - 0.12, 0, 0)));
  p.push(colored(new THREE.BoxGeometry(0.36, 0.14, 0.8), '#555b60', tr(0, 7.86, -2.1)));
  return merge(p);
}
function parkLightGeo() {
  const p = [];
  p.push(colored(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 10), '#1f2326', tr(0, 0.25, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 10), '#1f2326', tr(0, 2.2, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.22, 0.12, 0.12, 8), '#1f2326', tr(0, 4.05, 0)));
  p.push(colored(new THREE.ConeGeometry(0.3, 0.3, 8), '#1f2326', tr(0, 4.75, 0)));
  return merge(p);
}
function benchGeo() {
  const p = [];
  for (let i = 0; i < 3; i++) p.push(colored(new THREE.BoxGeometry(1.8, 0.04, 0.12), '#7a5232', tr(0, 0.45, -0.18 + i * 0.15)));
  for (let i = 0; i < 2; i++) p.push(colored(new THREE.BoxGeometry(1.8, 0.11, 0.035), '#7a5232', trs(0, 0.65 + i * 0.16, 0.2, -0.2, 0, 0)));
  for (const x of [-0.75, 0.75]) {
    p.push(colored(new THREE.BoxGeometry(0.06, 0.45, 0.5), '#26292c', tr(x, 0.22, 0)));
    p.push(colored(new THREE.BoxGeometry(0.06, 0.45, 0.05), '#26292c', trs(x, 0.66, 0.22, -0.2, 0, 0)));
  }
  return merge(p);
}
function hydrantGeo() {
  const p = [];
  p.push(colored(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 12), '#a8261d', tr(0, 0.04, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.12, 0.13, 0.55, 12), '#c8321f', tr(0, 0.35, 0)));
  p.push(colored(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#c8321f', tr(0, 0.62, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), '#e3c94a', tr(0, 0.78, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8), '#c8321f', trs(0, 0.42, 0, 0, 0, Math.PI / 2)));
  p.push(colored(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), '#e3c94a', trs(0, 0.42, 0.12, Math.PI / 2, 0, 0)));
  return merge(p);
}
function binGeo() {
  const p = [];
  p.push(colored(new THREE.CylinderGeometry(0.28, 0.25, 0.95, 14, 1, true), '#2c5a3d', tr(0, 0.48, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 14), '#1f3f2b', tr(0, 0.98, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 14), '#111', tr(0, 0.03, 0)));
  return merge(p);
}
function newsboxGeo() {
  const p = [];
  p.push(colored(new THREE.BoxGeometry(0.5, 0.9, 0.45), '#2a4f8a', tr(0, 0.6, 0)));
  p.push(colored(new THREE.BoxGeometry(0.42, 0.3, 0.02), '#cfd9e6', tr(0, 0.85, -0.235)));
  for (const x of [-0.18, 0.18]) p.push(colored(new THREE.BoxGeometry(0.04, 0.15, 0.04), '#222', tr(x, 0.08, 0)));
  return merge(p);
}
function meterGeo() {
  const p = [];
  p.push(colored(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), '#3a3d40', tr(0, 0.55, 0)));
  p.push(colored(new THREE.BoxGeometry(0.18, 0.3, 0.14), '#5a6066', tr(0, 1.22, 0)));
  p.push(colored(new THREE.BoxGeometry(0.12, 0.08, 0.02), '#cfe3c0', tr(0, 1.28, -0.075)));
  return merge(p);
}
function shelterGeo() {
  const p = [];
  p.push(colored(new THREE.BoxGeometry(4, 0.12, 1.6), '#30353a', tr(0, 2.6, 0)));
  for (const x of [-1.9, 1.9]) p.push(colored(new THREE.BoxGeometry(0.08, 2.6, 0.08), '#30353a', tr(x, 1.3, 0.7)));
  p.push(colored(new THREE.BoxGeometry(3.6, 0.05, 0.4), '#8a8f94', tr(0, 0.5, 0.45)));
  p.push(colored(new THREE.BoxGeometry(0.08, 2.4, 1.4), '#30353a', tr(1.95, 1.3, 0)));
  return merge(p);
}
function pumpGeo() {
  const p = [];
  p.push(colored(new THREE.BoxGeometry(3.2, 0.25, 1.0), '#9a9a96', tr(0, 0.12, 0)));
  for (const x of [-0.9, 0.9]) {
    p.push(colored(new THREE.BoxGeometry(0.7, 1.7, 0.5), '#e9e7e2', tr(x, 1.1, 0)));
    p.push(colored(new THREE.BoxGeometry(0.72, 0.35, 0.52), '#c3261b', tr(x, 1.8, 0)));
    p.push(colored(new THREE.BoxGeometry(0.4, 0.25, 0.02), '#1a2a1a', tr(x, 1.35, -0.26)));
  }
  return merge(p);
}
function phoneGeo() {
  const p = [];
  p.push(colored(new THREE.BoxGeometry(0.9, 2.3, 0.9), '#30465c', tr(0, 1.15, 0)));
  p.push(colored(new THREE.BoxGeometry(0.95, 0.15, 0.95), '#b8c4cf', tr(0, 2.35, 0)));
  return merge(p);
}
function planterGeo() {
  const p = [];
  p.push(colored(new THREE.BoxGeometry(2.4, 0.6, 2.4), '#8f8a80', tr(0, 0.3, 0)));
  p.push(colored(new THREE.BoxGeometry(2.2, 0.05, 2.2), '#3b2c1f', tr(0, 0.6, 0)));
  return merge(p);
}
function fountainGeo() {
  const p = [];
  p.push(colored(new THREE.CylinderGeometry(3.6, 3.7, 0.6, 32, 1, true), '#a39d92', tr(0, 0.3, 0)));
  p.push(colored(new THREE.CylinderGeometry(3.3, 3.3, 0.6, 32, 1, true), '#8e887d', tr(0, 0.3, 0)));
  p.push(colored(new THREE.RingGeometry(3.3, 3.7, 32), '#b5afa4', trs(0, 0.6, 0, -Math.PI / 2, 0, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 12), '#a39d92', tr(0, 0.8, 0)));
  p.push(colored(new THREE.CylinderGeometry(1.3, 0.9, 0.3, 20), '#a39d92', tr(0, 1.6, 0)));
  p.push(colored(new THREE.CylinderGeometry(0.15, 0.2, 0.9, 8), '#a39d92', tr(0, 2.1, 0)));
  return merge(p);
}
function containerGeo() {
  const g = new THREE.BoxGeometry(12.2, 2.6, 2.5);
  g.translate(0, 1.3, 0);
  return g;
}
function containerTexture() {
  const c = T.canvas(512, 128), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 10) { g.fillStyle = x % 20 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'; g.fillRect(x, 0, 5, 128); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 512, 6); g.fillRect(0, 122, 512, 6);
  const rnd = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,50,20,${rnd() * 0.25})`; g.beginPath(); g.ellipse(rnd() * 512, rnd() * 128, 5 + rnd() * 30, 2 + rnd() * 10, 0, 0, 7); g.fill(); }
  g.font = 'bold 26px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText('AURORA LINES', 330, 40);
  return T.toTexture(c);
}
function crateTexture() {
  const c = T.canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#9b7a4c'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { g.fillStyle = `rgba(0,0,0,${0.1 + (y % 32) / 300})`; g.fillRect(0, y, 128, 1.5); }
  g.strokeStyle = '#6b5232'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
  g.beginPath(); g.moveTo(8, 8); g.lineTo(120, 120); g.stroke();
  return T.toTexture(c);
}
function palmFrondTexture() {
  const c = T.canvas(64, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 64, 256);
  g.strokeStyle = '#4b5a28'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 256); g.stroke();
  for (let y = 8; y < 250; y += 5) {
    const w = Math.sin((y / 256) * Math.PI) * 30;
    g.strokeStyle = `hsl(${85 + Math.random() * 20},45%,${22 + Math.random() * 12}%)`; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(32, y); g.lineTo(32 - w, y + 14); g.moveTo(32, y); g.lineTo(32 + w, y + 14); g.stroke();
  }
  return T.toTexture(c, { repeat: false });
}

function treeGeos(rnd) {
  // trunk + branches
  const trunk = merge([
    colored(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8), '#ffffff', tr(0, 1.6, 0)),
    colored(new THREE.CylinderGeometry(0.05, 0.1, 1.6, 6), '#ffffff', trs(0.35, 3.2, 0, 0, 0, -0.6)),
    colored(new THREE.CylinderGeometry(0.05, 0.1, 1.5, 6), '#ffffff', trs(-0.3, 3.3, 0.2, 0.3, 0, 0.6)),
  ]);
  // canopy: crossed leaf cards spread through an ellipsoid
  const cards = [];
  for (let i = 0; i < 46; i++) {
    const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1);
    const rr = 0.55 + rnd() * 0.45;
    const x = Math.cos(u) * Math.sin(v) * 1.9 * rr, y = 4.4 + Math.cos(v) * 1.5 * rr, z = Math.sin(u) * Math.sin(v) * 1.9 * rr;
    const s = 1.3 + rnd() * 0.8;
    const g = new THREE.PlaneGeometry(s, s);
    g.applyMatrix4(trs(x, y, z, rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
    // normals pointing outward from the canopy center for soft lighting
    const n = g.getAttribute('normal'), pp = g.getAttribute('position');
    for (let k = 0; k < n.count; k++) { const vx = pp.getX(k), vy = pp.getY(k) - 4.2, vz = pp.getZ(k); const l = Math.hypot(vx, vy, vz) || 1; n.setXYZ(k, vx / l, vy / l, vz / l); }
    cards.push(colored(g, new THREE.Color().setHSL(0.24 + rnd() * 0.05, 0.4, 0.42 + rnd() * 0.12)));
  }
  return { trunk, canopy: merge(cards) };
}

function palmGeos() {
  const segs = [];
  let x = 0, y = 0;
  for (let i = 0; i < 8; i++) { const h = 0.95; segs.push(colored(new THREE.CylinderGeometry(0.15 - i * 0.008, 0.18 - i * 0.008, h, 8), i % 2 ? '#7a6a52' : '#6d5e48', trs(x, y + h / 2, 0, 0, 0, -0.04))); y += h * 0.995; x += 0.04 * i * 0.3; }
  const fronds = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.9, 3.2, 1, 4);
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) { const t = (p.getY(k) + 1.6) / 3.2; p.setY(k, t * 3.0); p.setZ(k, -t * t * 1.4); }
    g.computeVertexNormals();
    g.applyMatrix4(trs(x, y, 0, -0.5, a, 0));
    fronds.push(colored(g, '#ffffff'));
  }
  return { trunk: merge(segs), fronds: merge(fronds) };
}

function signalHeadGeo() {
  return merge([colored(new THREE.BoxGeometry(0.34, 0.95, 0.26), '#1d2023', tr(0, 0, 0)), colored(new THREE.BoxGeometry(0.42, 1.03, 0.04), '#141618', tr(0, 0, 0.14))]);
}

// ---------------- main builder ---------------------------------------------------------------
export function buildProps(city, rnd) {
  const g = new THREE.Group(); g.name = 'props';
  const P = city.props;
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 });
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.1 });
  const night = []; // materials that glow at night

  // street lights
  const tall = P.lights.filter((l) => !l.park);
  const parkL = P.lights.filter((l) => l.park);
  g.add(instanced(streetLightGeo(), metal, tall, (it) => place(it, it.dock ? 0 : CURB_H)));
  g.add(instanced(parkLightGeo(), metal, parkL, (it) => place(it)));
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffd9a0', emissiveIntensity: 0 });
  emissiveMats.push({ mat: bulbMat, base: 6, kind: 'lamp' });
  const bulbGeo = new THREE.BoxGeometry(0.28, 0.04, 0.6); bulbGeo.translate(0, 7.78, -2.1);
  g.add(instanced(bulbGeo, bulbMat, tall, (it) => place(it, it.dock ? 0 : CURB_H), { shadow: false }));
  const lantGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.55, 8); lantGeo.translate(0, 4.38, 0);
  g.add(instanced(lantGeo, bulbMat, parkL, (it) => place(it), { shadow: false }));
  // ground light pools
  const poolMat = new THREE.MeshBasicMaterial({ map: T.lightPoolTexture(), color: '#ffcf8a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  night.push({ mat: poolMat, base: 0.55, prop: 'opacity' });
  const poolGeo = new THREE.PlaneGeometry(9, 9); poolGeo.rotateX(-Math.PI / 2);
  const pools = [...tall.map((l) => { const s = Math.sin(l.rot || 0), c = Math.cos(l.rot || 0); return { x: l.x - s * 2.1 * 1 + 0, z: l.z - c * 2.1, y: (l.dock ? 0 : CURB_H) * 0 + 0.03 }; }), ...parkL.map((l) => ({ x: l.x, z: l.z, y: 0.2, s: 0.6 }))];
  g.add(instanced(poolGeo, poolMat, pools, (it) => trs(it.x, it.y, it.z, 0, 0, 0, it.s || 1, 1, it.s || 1), { shadow: false, receive: false }));

  // trees
  const tg = treeGeos(rnd);
  const bark = new THREE.MeshStandardMaterial({ map: T.barkTexture(), vertexColors: true, roughness: 0.9 });
  const leaves = new THREE.MeshStandardMaterial({ map: T.leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 });
  addWind(leaves);
  g.add(instanced(tg.trunk, bark, P.trees, (it) => trs(it.x, CURB_H, it.z, 0, (it.x * 13 + it.z * 7) % 6.28, 0, it.s, it.s, it.s)));
  g.add(instanced(tg.canopy, leaves, P.trees, (it) => trs(it.x, CURB_H, it.z, 0, (it.x * 13 + it.z * 7) % 6.28, 0, it.s, it.s * (0.9 + ((it.x * 3) % 1) * 0.2), it.s)));
  // tree pits
  const pitGeo = new THREE.PlaneGeometry(1.4, 1.4); pitGeo.rotateX(-Math.PI / 2);
  g.add(instanced(pitGeo, new THREE.MeshStandardMaterial({ color: '#2b2219', roughness: 1 }), P.trees.filter((t) => t.pit), (it) => tr(it.x, CURB_H + 0.012, it.z), { shadow: false }));
  // palms
  const pg = palmGeos();
  g.add(instanced(pg.trunk, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), P.palms, (it) => trs(it.x, CURB_H, it.z, 0, it.x % 6, 0, it.s, it.s, it.s)));
  const frondMat = new THREE.MeshStandardMaterial({ map: palmFrondTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  addWind(frondMat);
  g.add(instanced(pg.fronds, frondMat, P.palms, (it) => trs(it.x, CURB_H, it.z, 0, it.x % 6, 0, it.s, it.s, it.s)));

  g.add(instanced(benchGeo(), paint, P.benches, (it) => place(it)));
  g.add(instanced(hydrantGeo(), paint, P.hydrants, (it) => place(it)));
  g.add(instanced(binGeo(), paint, P.bins, (it) => place(it)));
  g.add(instanced(newsboxGeo(), paint, P.newsboxes, (it) => place(it)));
  g.add(instanced(meterGeo(), metal, P.meters, (it) => place(it)));
  g.add(instanced(shelterGeo(), metal, P.shelters, (it) => place(it)));
  const glass = new THREE.MeshStandardMaterial({ color: '#9fb8c8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25, depthWrite: false });
  const shGlass = new THREE.BoxGeometry(3.7, 2.2, 0.03); shGlass.translate(0, 1.4, 0.75);
  g.add(instanced(shGlass, glass, P.shelters, (it) => place(it), { shadow: false }));
  const adMat = new THREE.MeshStandardMaterial({ map: T.signTexture('FIZZ COLA', { w: 256, h: 512, bg: '#d4161c', fg: '#ffffff', font: 'bold 54px "Oswald", sans-serif', vertical: true }).map, emissiveMap: T.signTexture('FIZZ COLA', { w: 256, h: 512, bg: '#d4161c', fg: '#ffffff', font: 'bold 54px "Oswald", sans-serif', vertical: true }).map, emissive: '#ffffff', emissiveIntensity: 0 });
  emissiveMats.push({ mat: adMat, base: 0.8, kind: 'sign' });
  const adGeo = new THREE.BoxGeometry(0.1, 2.0, 1.2); adGeo.translate(1.95, 1.4, 0);
  g.add(instanced(adGeo, adMat, P.shelters, (it) => place(it), { shadow: false }));
  g.add(instanced(pumpGeo(), paint, P.pumps, (it) => place(it)));
  g.add(instanced(phoneGeo(), paint, P.phonebooths, (it) => place(it)));
  g.add(instanced(planterGeo(), paint, P.planters, (it) => place(it)));
  // planter bushes use the tree canopy cards scaled down
  g.add(instanced(tg.canopy, leaves, P.planters, (it) => trs(it.x, CURB_H - 2.9, it.z, 0, it.x, 0, 0.55, 0.7, 0.55)));
  g.add(instanced(fountainGeo(), paint, P.fountains, (it) => place(it)));
  const waterMat = new THREE.MeshStandardMaterial({ color: '#4d7f8f', roughness: 0.05, metalness: 0.1, normalMap: T.waterNormalTexture(), transparent: true, opacity: 0.85 });
  const waterDisc = new THREE.CircleGeometry(3.3, 32); waterDisc.rotateX(-Math.PI / 2); waterDisc.translate(0, 0.5, 0);
  const waterTop = new THREE.CircleGeometry(1.15, 20); waterTop.rotateX(-Math.PI / 2); waterTop.translate(0, 1.72, 0);
  g.add(instanced(mergeGeometries([waterDisc, waterTop]), waterMat, P.fountains, (it) => place(it), { shadow: false }));
  // hedges
  const hedgeMat = new THREE.MeshStandardMaterial({ map: T.leafTexture(), color: '#6f8f4a', roughness: 0.9 });
  const hedgeGeo = new THREE.BoxGeometry(1, 1, 1); hedgeGeo.translate(0, 0.5, 0);
  g.add(instanced(hedgeGeo, hedgeMat, P.hedges, (it) => trs((it.x0 + it.x1) / 2, CURB_H, (it.z0 + it.z1) / 2, 0, 0, 0, it.x1 - it.x0, 1.0, it.z1 - it.z0)));
  // containers & crates
  const cont = new THREE.InstancedMesh(containerGeo(), new THREE.MeshStandardMaterial({ map: containerTexture(), roughness: 0.6, metalness: 0.4 }), Math.max(1, P.containers.length));
  P.containers.forEach((c, i) => { cont.setMatrixAt(i, trs(c.x, (c.y || 0), c.z, 0, c.rot || 0, 0)); cont.setColorAt(i, new THREE.Color(c.color)); });
  cont.castShadow = cont.receiveShadow = true; cont.computeBoundingSphere(); g.add(cont);
  const crateGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3); crateGeo.translate(0, 0.65, 0);
  g.add(instanced(crateGeo, new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 }), P.crates, (it) => trs(it.x, 0, it.z, 0, it.rot, 0)));
  // dock cranes (simple gantries) as static geometry
  g.add(buildCrane(city.sites.docks.yard.x0 - 30, city.sites.docks.yard.z0 + 10));

  return { group: g, night };
}

function buildCrane(x, z) {
  const parts = [];
  const col = '#c9842a';
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) parts.push(colored(new THREE.BoxGeometry(0.8, 26, 0.8), col, tr(x + dx, 13, z + dz)));
  parts.push(colored(new THREE.BoxGeometry(11, 2, 11), col, tr(x, 26, z)));
  parts.push(colored(new THREE.BoxGeometry(46, 1.6, 2.4), col, tr(x - 14, 27.5, z)));
  parts.push(colored(new THREE.BoxGeometry(4, 3, 3), '#e2e0d8', tr(x + 3, 24.2, z)));
  for (let i = 0; i < 6; i++) parts.push(colored(new THREE.BoxGeometry(0.2, 0.2, 14), col, trs(x - 5, 4 + i * 4, z, 0.6, 0, 0)));
  const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Gentle canopy sway in the vertex shader (world-position based, works with instancing)
export const windUniform = { value: 0 };
function addWind(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 wp = (instanceMatrix * vec4(position,1.0)).xyz;
      #else
      vec3 wp = position;
      #endif
      float sway = sin(uWind * 1.3 + wp.x * 0.35 + wp.z * 0.27) * 0.06 + sin(uWind * 2.7 + wp.y) * 0.02;
      transformed.x += sway * max(0.0, position.y - 2.5);
      transformed.z += sway * 0.6 * max(0.0, position.y - 2.5);`);
  };
  mat.customProgramCacheKey = () => 'wind';
}

// Traffic signal heads + lenses. Returns updater that sets lamp colors from light state.
export function buildSignals(rnd) {
  void rnd;
  return null;
}
