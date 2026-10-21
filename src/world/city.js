// Assembles Port Aurora: ground, roads, sidewalks, buildings, special sites and the prop
// placement lists consumed by props.js / traffic / peds.
import * as THREE from 'three';
import { Batcher, hex } from './geom.js';
import { cityMaterials } from './materials.js';
import { dynMats, midrise, walkup, tower, special } from './buildings.js';
import {
  ROADS, ROAD_HALF, WALK_W, CURB_H, MIN, MAX, LOT_INSET, PROMENADE, PARK_OFF, DOCK, ZONES, blockRect, mulberry32, SPACING,
} from './layout.js';

export function buildCity() {
  const rnd = mulberry32(20261021);
  const B = new Batcher();
  const colliders = []; // AABB boxes {x0,z0,x1,z1,h,kind}
  const circles = []; // round obstacles {x,z,r,kind}
  const props = { lights: [], trees: [], benches: [], hydrants: [], bins: [], newsboxes: [], shelters: [], palms: [], planters: [], containers: [], crates: [], barriers: [], cones: [], meters: [], fountains: [], hedges: [], pumps: [], phonebooths: [] };
  const parking = []; // {x,z,heading}
  const lots = []; // for minimap: {x0,z0,x1,z1,h,kind}
  const sites = {}; // named places: police, hospital, safehouse, etc.
  const covers = []; // boxes usable as cover
  const parks = []; const plazas = [];

  const LAND0 = MIN - LOT_INSET - PROMENADE, LAND1 = MAX + LOT_INSET + PROMENADE;

  // ---------------- ground & seawall -------------------------------------------------
  // land slab below sidewalks
  B.box('concrete', LAND0, -3, LAND0, LAND1, 0, LAND1, { skip: 'py', color: [0.8, 0.78, 0.74], uvScale: 4 });
  // dock apron (road level)
  B.box('concrete', DOCK.x0, -3, DOCK.z0, LAND0 + 0.01, 0, DOCK.z1, { skip: 'pxpy', color: [0.72, 0.7, 0.66], uvScale: 4 });
  B.flat('asphalt', DOCK.x0, DOCK.z0, LAND0, DOCK.z1, 0.0, [DOCK.x0 / 8, DOCK.z0 / 8, LAND0 / 8, DOCK.z1 / 8]);

  // ---------------- roads ----------------------------------------------------------------
  const R0 = MIN - ROAD_HALF, R1 = MAX + ROAD_HALF;
  const asphaltUV = (x0, z0, x1, z1) => [x0 / 8, -z1 / 8, x1 / 8, -z0 / 8];
  // intersections
  for (const rx of ROADS) for (const rz of ROADS) B.flat('asphalt', rx - ROAD_HALF, rz - ROAD_HALF, rx + ROAD_HALF, rz + ROAD_HALF, 0, asphaltUV(rx - ROAD_HALF, rz - ROAD_HALF, rx + ROAD_HALF, rz + ROAD_HALF));
  // segments + markings + crosswalks
  const CW = 3.2; // crosswalk width
  for (let i = 0; i < ROADS.length; i++) for (let j = 0; j < ROADS.length - 1; j++) {
    const r = ROADS[i];
    const a = ROADS[j] + ROAD_HALF, b = ROADS[j + 1] - ROAD_HALF;
    // road along z at x=r
    B.flat('asphalt', r - ROAD_HALF, a, r + ROAD_HALF, b, 0, asphaltUV(r - ROAD_HALF, a, r + ROAD_HALF, b));
    B.quad('marking', new THREE.Vector3(r - ROAD_HALF, 0.012, b - CW - 1), new THREE.Vector3(r + ROAD_HALF, 0.012, b - CW - 1), new THREE.Vector3(r + ROAD_HALF, 0.012, a + CW + 1), new THREE.Vector3(r - ROAD_HALF, 0.012, a + CW + 1), [0, 0, 1, (b - a - 2 * CW - 2) / 12]);
    // road along x at z=r
    B.flat('asphalt', a, r - ROAD_HALF, b, r + ROAD_HALF, 0, asphaltUV(a, r - ROAD_HALF, b, r + ROAD_HALF));
    B.quad('marking', new THREE.Vector3(a + CW + 1, 0.012, r - ROAD_HALF), new THREE.Vector3(a + CW + 1, 0.012, r + ROAD_HALF), new THREE.Vector3(b - CW - 1, 0.012, r + ROAD_HALF), new THREE.Vector3(b - CW - 1, 0.012, r - ROAD_HALF), [0, 0, 1, (b - a - 2 * CW - 2) / 12]);
  }
  void R0; void R1;
  // crosswalks + stop lines at every intersection approach
  for (const rx of ROADS) for (const rz of ROADS) {
    const zeb = (x0, z0, x1, z1, alongX) => {
      if (alongX) B.quad('zebra', new THREE.Vector3(x0, 0.014, z1), new THREE.Vector3(x1, 0.014, z1), new THREE.Vector3(x1, 0.014, z0), new THREE.Vector3(x0, 0.014, z0), [0, 0, 1, 1]);
      else B.quad('zebra', new THREE.Vector3(x0, 0.014, z0), new THREE.Vector3(x0, 0.014, z1), new THREE.Vector3(x1, 0.014, z1), new THREE.Vector3(x1, 0.014, z0), [0, 0, 1, 1]);
    };
    const h = ROAD_HALF;
    if (rz > MIN) zeb(rx - h, rz - h - CW, rx + h, rz - h, true);
    if (rz < MAX) zeb(rx - h, rz + h, rx + h, rz + h + CW, true);
    if (rx > MIN) zeb(rx - h - CW, rz - h, rx - h, rz + h, false);
    if (rx < MAX) zeb(rx + h, rz - h, rx + h + CW, rz + h, false);
    // stop lines (white bars on the incoming lane, before the crosswalk)
    const sl = (x0, z0, x1, z1) => B.flat('trim', x0, z0, x1, z1, 0.013, [0, 0, 1, 1], [0.92, 0.92, 0.9]);
    if (rz > MIN) sl(rx - 3.5, rz - h - CW - 0.7, rx, rz - h - CW - 0.3); // southbound lane (x - 1.75)
    if (rz < MAX) sl(rx, rz + h + CW + 0.3, rx + 3.5, rz + h + CW + 0.7);
    if (rx > MIN) sl(rx - h - CW - 0.7, rz, rx - h - CW - 0.3, rz + 3.5);
    if (rx < MAX) sl(rx + h + CW + 0.3, rz - 3.5, rx + h + CW + 0.7, rz);
  }

  // ---------------- sidewalks / block platforms -------------------------------------------
  const curbFaces = (x0, z0, x1, z1) => {
    B.wall('curb', x0, z1, x1, z1, 0, CURB_H, [x0 / 2, 0, x1 / 2, 0.08]);
    B.wall('curb', x1, z0, x0, z0, 0, CURB_H, [x0 / 2, 0, x1 / 2, 0.08]);
    B.wall('curb', x1, z1, x1, z0, 0, CURB_H, [z0 / 2, 0, z1 / 2, 0.08]);
    B.wall('curb', x0, z0, x0, z1, 0, CURB_H, [z0 / 2, 0, z1 / 2, 0.08]);
  };
  const walkUV = (x0, z0, x1, z1) => [x0 / 6, -z1 / 6, x1 / 6, -z0 / 6];
  for (let bx = 0; bx < 4; bx++) for (let bz = 0; bz < 4; bz++) {
    const x0 = ROADS[bx] + ROAD_HALF, x1 = ROADS[bx + 1] - ROAD_HALF, z0 = ROADS[bz] + ROAD_HALF, z1 = ROADS[bz + 1] - ROAD_HALF;
    B.flat('sidewalk', x0, z0, x1, z1, CURB_H, walkUV(x0, z0, x1, z1));
    curbFaces(x0, z0, x1, z1);
  }
  // promenade ring (outside the outer roads)
  const P0 = MIN - ROAD_HALF, P1 = MAX + ROAD_HALF;
  const prom = [
    [LAND0, LAND0, LAND1, P0], [LAND0, P1, LAND1, LAND1], // north / south strips
    [LAND0, P0, P0, P1], [P1, P0, LAND1, P1], // west / east strips
  ];
  // west strip has a driveway gap to the docks
  const gap = { z0: 34, z1: 46 };
  for (const [x0, z0, x1, z1] of prom) {
    if (x1 === P0 && z0 === P0) { // west strip split around the gap
      for (const [a, b] of [[z0, gap.z0], [gap.z1, z1]]) { B.flat('sidewalk', x0, a, x1, b, CURB_H, walkUV(x0, a, x1, b)); curbFaces(x0, a, x1, b); }
      B.flat('asphalt', x0, gap.z0, x1, gap.z1, 0.0, asphaltUV(x0, gap.z0, x1, gap.z1));
      continue;
    }
    B.flat('sidewalk', x0, z0, x1, z1, CURB_H, walkUV(x0, z0, x1, z1));
    curbFaces(x0, z0, x1, z1);
  }
  // seawall railing + bollards along the land edge (except dock side)
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; B.box('darkMetal', x - 0.05, CURB_H, z - 0.05, x + 0.05, CURB_H + 1.05, z + 0.05); }
    const ax = (x1 - x0) / len, az = (z1 - z0) / len;
    for (const y of [0.55, 1.0]) {
      if (Math.abs(ax) > 0.5) B.box('darkMetal', Math.min(x0, x1), CURB_H + y, z0 - 0.035, Math.max(x0, x1), CURB_H + y + 0.06, z0 + 0.035);
      else B.box('darkMetal', x0 - 0.035, CURB_H + y, Math.min(z0, z1), x0 + 0.035, CURB_H + y + 0.06, Math.max(z0, z1));
    }
    void az;
  };
  const E = 0.3;
  rail(LAND0 + E, LAND0 + E, LAND1 - E, LAND0 + E);
  rail(LAND0 + E, LAND1 - E, LAND1 - E, LAND1 - E);
  rail(LAND1 - E, LAND0 + E, LAND1 - E, LAND1 - E);
  rail(LAND0 + E, LAND0 + E, LAND0 + E, DOCK.z0);
  rail(LAND0 + E, DOCK.z1, LAND0 + E, LAND1 - E);
  colliders.push({ x0: LAND0 - 3, z0: LAND0 - 3, x1: LAND1 + 3, z1: LAND0 + 0.4, h: 1.2, kind: 'rail' });
  colliders.push({ x0: LAND0 - 3, z0: LAND1 - 0.4, x1: LAND1 + 3, z1: LAND1 + 3, h: 1.2, kind: 'rail' });
  colliders.push({ x0: LAND1 - 0.4, z0: LAND0 - 3, x1: LAND1 + 3, z1: LAND1 + 3, h: 1.2, kind: 'rail' });
  colliders.push({ x0: LAND0 - 0.4, z0: LAND0 - 3, x1: LAND0 + 0.4, z1: DOCK.z0, h: 1.2, kind: 'rail' });
  colliders.push({ x0: LAND0 - 0.4, z0: DOCK.z1, x1: LAND0 + 0.4, z1: LAND1 + 3, h: 1.2, kind: 'rail' });
  // dock edges
  colliders.push({ x0: DOCK.x0 - 3, z0: DOCK.z0 - 3, x1: LAND0, z1: DOCK.z0 + 0.3, h: 1.2, kind: 'rail' });
  colliders.push({ x0: DOCK.x0 - 3, z0: DOCK.z1 - 0.3, x1: LAND0, z1: DOCK.z1 + 3, h: 1.2, kind: 'rail' });
  colliders.push({ x0: DOCK.x0 - 3, z0: DOCK.z0, x1: DOCK.x0 + 0.3, z1: DOCK.z1, h: 1.2, kind: 'rail' });

  // ---------------- blocks ----------------------------------------------------------------
  const addBox = (list) => { for (const c of list) { colliders.push({ ...c, kind: 'building' }); lots.push({ ...c, kind: 'building' }); } };
  let seed = 1;
  const nextSeed = () => (seed++ % 3) + 1;

  // Perimeter subdivision of a block into street-facing lots
  function perimeter(r, depth, wmin, wmax) {
    const out = [];
    const splitRun = (a0, a1) => { const xs = [a0]; let a = a0; while (a1 - a > wmax) { a += wmin + rnd() * (wmax - wmin); if (a1 - a < wmin) break; xs.push(a); } xs.push(a1); return xs; };
    // north and south runs (full width, corners included)
    for (const side of ['n', 's']) {
      const xs = splitRun(r.x0, r.x1);
      for (let k = 0; k < xs.length - 1; k++) {
        const fronts = [side]; if (k === 0) fronts.push('w'); if (k === xs.length - 2) fronts.push('e');
        const z0 = side === 'n' ? r.z0 : r.z1 - depth, z1 = side === 'n' ? r.z0 + depth : r.z1;
        out.push({ r: { x0: xs[k], z0, x1: xs[k + 1], z1 }, fronts, corner: fronts.length > 1 });
      }
    }
    for (const side of ['w', 'e']) {
      const zs = splitRun(r.z0 + depth, r.z1 - depth);
      for (let k = 0; k < zs.length - 1; k++) {
        const x0 = side === 'w' ? r.x0 : r.x1 - depth, x1 = side === 'w' ? r.x0 + depth : r.x1;
        out.push({ r: { x0, z0: zs[k], x1, z1: zs[k + 1] }, fronts: [side], corner: false });
      }
    }
    // alley: drop one non-corner lot so the courtyard is reachable
    const cand = out.filter((l) => !l.corner && Math.min(l.r.x1 - l.r.x0, l.r.z1 - l.r.z0) < 16);
    if (cand.length) { const al = cand[(rnd() * cand.length) | 0]; out.splice(out.indexOf(al), 1); }
    return out;
  }

  const courtyard = (r, depth, kind) => {
    const c = { x0: r.x0 + depth, z0: r.z0 + depth, x1: r.x1 - depth, z1: r.z1 - depth };
    B.flat(kind === 'green' ? 'grass' : 'asphalt', c.x0 - depth + 0.5, c.z0 - depth + 0.5, c.x1 + depth - 0.5, c.z1 + depth - 0.5, CURB_H + 0.005, kind === 'green' ? [c.x0 / 6, c.z0 / 6, c.x1 / 6, c.z1 / 6] : asphaltUV(c.x0, c.z0, c.x1, c.z1));
    // dumpsters and crates in back lots
    for (let i = 0; i < 3; i++) {
      const x = c.x0 + 2 + rnd() * (c.x1 - c.x0 - 4), z = c.z0 + 2 + rnd() * (c.z1 - c.z0 - 4);
      B.box('paint', x - 1, CURB_H, z - 0.7, x + 1, CURB_H + 1.3, z + 0.7, { color: hex(['#2d5a3b', '#3b4a6b', '#6b3b2d'][i % 3]) });
      B.box('darkMetal', x - 1.05, CURB_H + 1.3, z - 0.75, x + 1.05, CURB_H + 1.38, z + 0.75);
      colliders.push({ x0: x - 1, z0: z - 0.7, x1: x + 1, z1: z + 0.7, h: 1.4, kind: 'prop' });
      covers.push({ x0: x - 1, z0: z - 0.7, x1: x + 1, z1: z + 0.7 });
    }
    if (kind === 'green') for (let i = 0; i < 4; i++) props.trees.push({ x: c.x0 + 3 + rnd() * (c.x1 - c.x0 - 6), z: c.z0 + 3 + rnd() * (c.z1 - c.z0 - 6), s: 0.8 + rnd() * 0.5 });
  };

  const towerLogos = [['AURORA BANK', '#9fe0ff', '#0b1a2a'], ['NEXUS', '#ffffff', '#101010'], ['KAITO INSURANCE', '#ffd27a', '#1a1208'], ['HELIX', '#a8ffcf', '#08201a']];
  let logoIdx = 0;

  for (let bx = 0; bx < 4; bx++) for (let bz = 0; bz < 4; bz++) {
    const zone = ZONES[bz][bx];
    const r = blockRect(bx, bz);
    if (zone === 'residential') {
      const lotsL = perimeter(r, 15, 8, 13);
      for (const l of lotsL) addBox(walkup(B, rnd, l.r, l.fronts, { seed: nextSeed(), floors: 3 + ((rnd() * 3) | 0) }));
      courtyard(r, 15, 'green');
      if (bx === 1) sites.safehouse = { x: (r.x0 + r.x1) / 2, z: r.z1 + 2, door: { x: (r.x0 + r.x1) / 2, z: r.z1 } };
    } else if (zone === 'commercial') {
      const lotsL = perimeter(r, 20, 10, 18);
      for (const l of lotsL) {
        const blade = l.corner && rnd() < 0.6 ? [['HOTEL', '#ff4f6d', '#1a0a10'], ['BAR', '#53e0ff', '#081820'], ['NOODLES', '#ffcf3d', '#2a1608'], ['CLUB', '#d26bff', '#14061c'], ['DINER', '#ff6b3d', '#200a06']][(rnd() * 5) | 0] : null;
        addBox(midrise(B, rnd, l.r, l.fronts, { seed: nextSeed(), floors: 3 + ((rnd() * 4) | 0), blade }));
      }
      courtyard(r, 20, 'paved');
    } else if (zone === 'downtown') {
      // two or three towers with a small plaza
      const mx = (r.x0 + r.x1) / 2 + (rnd() - 0.5) * 8;
      const t1 = { x0: r.x0, z0: r.z0, x1: mx - 3, z1: r.z0 + 30 };
      const t2 = { x0: mx + 3, z0: r.z0, x1: r.x1, z1: r.z0 + 26 + rnd() * 8 };
      const t3 = { x0: r.x0, z0: r.z1 - 22, x1: r.x0 + 26, z1: r.z1 };
      const pl = { x0: r.x0, z0: t1.z1, x1: r.x1, z1: r.z1 };
      addBox(tower(B, rnd, t1, ['n', 'w'], { seed: nextSeed(), floors: 14 + ((rnd() * 12) | 0), logo: towerLogos[logoIdx++ % 4], crown: rnd() < 0.5 ? '#7fd8ff' : null }));
      addBox(tower(B, rnd, t2, ['n', 'e'], { seed: nextSeed(), floors: 10 + ((rnd() * 10) | 0) }));
      addBox(midrise(B, rnd, t3, ['s', 'w'], { seed: nextSeed(), floors: 6, style: 'concrete' }));
      // plaza paving
      B.flat('paving', pl.x0 + 26, pl.z0, pl.x1, pl.z1, CURB_H + 0.006, [pl.x0 / 4, pl.z0 / 4, pl.x1 / 4, pl.z1 / 4]);
      plazas.push({ x0: pl.x0 + 26, z0: pl.z0, x1: pl.x1, z1: pl.z1 });
      const fx = (pl.x0 + 26 + pl.x1) / 2, fz = (pl.z0 + pl.z1) / 2;
      props.planters.push({ x: fx - 9, z: fz }, { x: fx + 9, z: fz });
      props.benches.push({ x: fx, z: fz - 6, rot: 0 }, { x: fx, z: fz + 6, rot: Math.PI });
      for (let k = 0; k < 4; k++) props.trees.push({ x: pl.x0 + 30 + k * 7, z: pl.z1 - 3, s: 0.9 });
    } else if (zone === 'park') {
      parks.push({ ...r });
      B.flat('grass', r.x0, r.z0, r.x1, r.z1, CURB_H + 0.005, [r.x0 / 6, r.z0 / 6, r.x1 / 6, r.z1 / 6]);
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      // cross paths + ring
      B.flat('paving', cx - 2, r.z0, cx + 2, r.z1, CURB_H + 0.01, [cx / 4, r.z0 / 4, cx / 4 + 1, r.z1 / 4]);
      B.flat('paving', r.x0, cz - 2, r.x1, cz + 2, CURB_H + 0.01, [r.x0 / 4, cz / 4, r.x1 / 4, cz / 4 + 1]);
      B.flat('paving', cx - 9, cz - 9, cx + 9, cz + 9, CURB_H + 0.012, [cx / 4, cz / 4, cx / 4 + 4, cz / 4 + 4]);
      props.fountains.push({ x: cx, z: cz });
      circles.push({ x: cx, z: cz, r: 3.6, kind: 'fountain' });
      for (const [dx, dz, rot] of [[0, -6, 0], [0, 6, Math.PI], [-6, 0, Math.PI / 2], [6, 0, -Math.PI / 2]]) props.benches.push({ x: cx + dx * 1.15, z: cz + dz * 1.15, rot });
      for (const [dx, dz, rot] of [[3.5, -18, -Math.PI / 2], [-3.5, 18, Math.PI / 2], [-18, 3.5, Math.PI], [18, -3.5, 0]]) props.benches.push({ x: cx + dx, z: cz + dz, rot });
      for (let k = 0; k < 26; k++) {
        const x = r.x0 + 3 + rnd() * (r.x1 - r.x0 - 6), z = r.z0 + 3 + rnd() * (r.z1 - r.z0 - 6);
        if (Math.abs(x - cx) < 4.5 || Math.abs(z - cz) < 4.5 || (Math.abs(x - cx) < 12 && Math.abs(z - cz) < 12)) continue;
        props.trees.push({ x, z, s: 0.9 + rnd() * 0.6 });
      }
      for (const [dx, dz] of [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]]) props.lights.push({ x: cx + dx, z: cz + dz, rot: 0, park: true });
      // hedges along the edges, leaving entrances at the paths
      for (const [x0, z0, x1, z1] of [[r.x0 + 0.5, r.z0 + 0.5, cx - 3, r.z0 + 1.3], [cx + 3, r.z0 + 0.5, r.x1 - 0.5, r.z0 + 1.3], [r.x0 + 0.5, r.z1 - 1.3, cx - 3, r.z1 - 0.5], [cx + 3, r.z1 - 1.3, r.x1 - 0.5, r.z1 - 0.5],
        [r.x0 + 0.5, r.z0 + 1.3, r.x0 + 1.3, cz - 3], [r.x0 + 0.5, cz + 3, r.x0 + 1.3, r.z1 - 1.3], [r.x1 - 1.3, r.z0 + 1.3, r.x1 - 0.5, cz - 3], [r.x1 - 1.3, cz + 3, r.x1 - 0.5, r.z1 - 1.3]]) {
        props.hedges.push({ x0, z0, x1, z1 });
        colliders.push({ x0, z0, x1, z1, h: 1.0, kind: 'hedge' });
      }
      sites.park = { x: cx, z: cz };
    } else if (zone === 'police') {
      const st = { x0: r.x0, z0: r.z0, x1: r.x0 + 34, z1: r.z0 + 24 };
      addBox(special(B, rnd, st, ['n', 'w'], { style: 'police', floors: 3, seed: 1, store: 8801, sign: ['PORT AURORA POLICE', '#ffffff', '#16314f', true], trim: [0.75, 0.73, 0.68] }));
      // parking lot
      B.flat('asphalt', st.x1 + 1, r.z0, r.x1, r.z0 + 24, CURB_H + 0.006, asphaltUV(st.x1, r.z0, r.x1, r.z0 + 24));
      for (let k = 0; k < 4; k++) parking.push({ x: st.x1 + 5 + k * 5, z: r.z0 + 6, heading: Math.PI, police: true });
      sites.police = { x: st.x0 + 17, z: r.z0 - 2.5, carSpawn: { x: st.x1 + 10, z: r.z0 + 16 } };
      const lotsL = perimeter({ x0: r.x0, z0: r.z0 + 24, x1: r.x1, z1: r.z1 }, 18, 10, 16).filter((l) => l.r.z0 >= r.z0 + 24);
      for (const l of lotsL) addBox(midrise(B, rnd, l.r, l.fronts.filter((f) => f !== 'n'), { seed: nextSeed() }));
    } else if (zone === 'plaza') {
      plazas.push({ ...r });
      B.flat('paving', r.x0, r.z0, r.x1, r.z1, CURB_H + 0.006, [r.x0 / 4, r.z0 / 4, r.x1 / 4, r.z1 / 4]);
      // shops on the north side, diner on the south-west
      const n1 = { x0: r.x0, z0: r.z0, x1: r.x0 + 20, z1: r.z0 + 18 }, n2 = { x0: r.x0 + 20, z0: r.z0, x1: r.x0 + 40, z1: r.z0 + 18 }, n3 = { x0: r.x0 + 40, z0: r.z0, x1: r.x1, z1: r.z0 + 18 };
      addBox(midrise(B, rnd, n1, ['n', 'w', 's'], { seed: 1, floors: 4 }));
      addBox(midrise(B, rnd, n2, ['n', 's'], { seed: 2, floors: 5, blade: ['CINEMA', '#ffd34d', '#2a0a0a'] }));
      addBox(midrise(B, rnd, n3, ['n', 'e', 's'], { seed: 3, floors: 3 }));
      const diner = { x0: r.x0, z0: r.z1 - 14, x1: r.x0 + 18, z1: r.z1 };
      addBox(special(B, rnd, diner, ['s', 'e'], { style: 'stuccoPastel', floors: 1, seed: 2, store: 7711, sign: ['STARLITE DINER', '#ff5f8f', '#1b0b14', true], trim: [0.9, 0.3, 0.35] }));
      const cx = (r.x0 + r.x1) / 2 + 6, cz = r.z0 + 38;
      props.fountains.push({ x: cx, z: cz }); circles.push({ x: cx, z: cz, r: 3.6, kind: 'fountain' });
      for (let k = 0; k < 6; k++) props.trees.push({ x: r.x0 + 24 + k * 6.5, z: r.z1 - 4, s: 0.9 });
      props.benches.push({ x: cx - 7, z: cz, rot: Math.PI / 2 }, { x: cx + 7, z: cz, rot: -Math.PI / 2 }, { x: cx, z: cz + 7, rot: Math.PI });
      props.planters.push({ x: r.x1 - 6, z: r.z0 + 26 }, { x: r.x1 - 6, z: r.z0 + 46 });
      props.phonebooths.push({ x: r.x0 + 22, z: r.z0 + 21, rot: 0 });
      sites.plaza = { x: cx, z: cz };
    } else if (zone === 'hospital') {
      const h = { x0: r.x0 + 4, z0: r.z0, x1: r.x1 - 4, z1: r.z0 + 28 };
      addBox(special(B, rnd, h, ['n', 's'], { style: 'hospital', floors: 5, seed: 1, store: 6601, sign: ['ST. MARY HOSPITAL', '#d8262b', '#f4f4f2', false], trim: [0.85, 0.87, 0.88] }));
      B.flat('asphalt', r.x0, r.z0 + 28, r.x1, r.z1, CURB_H + 0.006, asphaltUV(r.x0, r.z0 + 28, r.x1, r.z1));
      for (let k = 0; k < 9; k++) parking.push({ x: r.x0 + 6 + k * 5.5, z: r.z1 - 8, heading: 0, lot: true });
      for (let k = 0; k < 9; k++) parking.push({ x: r.x0 + 6 + k * 5.5, z: r.z0 + 38, heading: Math.PI, lot: true });
      sites.hospital = { x: (h.x0 + h.x1) / 2, z: h.z0 - 2.5 };
    } else if (zone === 'gas') {
      // gas station at the NW corner, motel strip on the east
      const gx0 = r.x0, gz0 = r.z0, gx1 = r.x0 + 34, gz1 = r.z0 + 30;
      B.flat('concrete', gx0, gz0, gx1, gz1, CURB_H + 0.006, [gx0 / 4, gz0 / 4, gx1 / 4, gz1 / 4], [0.85, 0.85, 0.85]);
      const mart = { x0: gx0 + 18, z0: gz1 - 12, x1: gx1, z1: gz1 };
      addBox(special(B, rnd, mart, ['n', 'w'], { style: 'stucco', floors: 1, seed: 3, store: 5501, sign: ['QUIK GAS MART', '#ffffff', '#c3261b', true], trim: [0.8, 0.15, 0.12] }));
      // canopy
      const cnp = { x0: gx0 + 4, z0: gz0 + 4, x1: gx0 + 16, z1: gz0 + 16 };
      B.box('trim', cnp.x0, CURB_H + 4.6, cnp.z0, cnp.x1, CURB_H + 5.3, cnp.z1, { color: [0.95, 0.95, 0.95] });
      B.box('paint', cnp.x0 - 0.05, CURB_H + 4.9, cnp.z0 - 0.05, cnp.x1 + 0.05, CURB_H + 5.2, cnp.z1 + 0.05, { color: hex('#c3261b'), skip: 'pyny' });
      for (const [x, z] of [[cnp.x0 + 2, cnp.z0 + 2], [cnp.x1 - 2, cnp.z0 + 2], [cnp.x0 + 2, cnp.z1 - 2], [cnp.x1 - 2, cnp.z1 - 2]]) { B.box('trim', x - 0.25, CURB_H, z - 0.25, x + 0.25, CURB_H + 4.6, z + 0.25, { color: [0.9, 0.9, 0.9] }); circles.push({ x, z, r: 0.35, kind: 'pole' }); }
      for (const [x, z] of [[cnp.x0 + 6, cnp.z0 + 4], [cnp.x0 + 6, cnp.z1 - 4]]) { props.pumps.push({ x, z }); colliders.push({ x0: x - 1.6, z0: z - 0.5, x1: x + 1.6, z1: z + 0.5, h: 1.2, kind: 'prop' }); covers.push({ x0: x - 1.6, z0: z - 0.5, x1: x + 1.6, z1: z + 0.5 }); }
      sites.gas = { x: gx0 + 10, z: gz0 + 10 };
      const motel = { x0: r.x1 - 16, z0: r.z0, x1: r.x1, z1: r.z1 };
      addBox(special(B, rnd, motel, ['w', 'e', 's'], { style: 'stuccoPastel', floors: 2, seed: 1, sign: ['SEABREEZE MOTEL', '#7ef0ff', '#0a1c24', true], trim: [0.95, 0.9, 0.8] }));
      const back = { x0: r.x0, z0: r.z0 + 34, x1: r.x1 - 18, z1: r.z1 };
      addBox(midrise(B, rnd, { x0: back.x0, z0: back.z1 - 18, x1: back.x0 + 22, z1: back.z1 }, ['s', 'w'], { seed: 2, floors: 3 }));
      B.flat('asphalt', back.x0 + 23, back.z0, back.x1, back.z1, CURB_H + 0.006, asphaltUV(back.x0, back.z0, back.x1, back.z1));
      for (let k = 0; k < 3; k++) parking.push({ x: back.x0 + 28 + k * 5, z: back.z1 - 7, heading: 0, lot: true });
    }
  }

  // ---------------- docks -----------------------------------------------------------------
  {
    const d = DOCK;
    const wh = [
      { x0: d.x0 + 8, z0: d.z0 + 8, x1: d.x0 + 48, z1: d.z0 + 34 },
      { x0: d.x0 + 8, z0: d.z1 - 40, x1: d.x0 + 44, z1: d.z1 - 8 },
      { x0: d.x0 + 60, z0: d.z0 + 6, x1: d.x1 - 14, z1: d.z0 + 26 },
    ];
    wh.forEach((w, i) => addBox(special(B, rnd, w, ['e', 's', 'n'], { style: 'warehouse', floors: 3, seed: i + 1, y0: 0, trim: [0.45, 0.45, 0.42], sign: i === 0 ? ['PIER 9 SHIPPING', '#f3e9c8', '#2a3a44', false] : null })));
    // container stacks (cover + maze) in the yard
    const yard = { x0: d.x0 + 54, z0: d.z0 + 36, x1: d.x1 - 6, z1: d.z1 - 6 };
    sites.docks = { x: (yard.x0 + yard.x1) / 2, z: (yard.z0 + yard.z1) / 2, yard };
    const cols = ['#a13a2a', '#2f5d8a', '#3f7d3a', '#c9842a', '#6c6f73', '#7a2f5b'];
    const layout = [[0, 0, 0], [0, 0, 1], [14, 0, 0], [0, 18, 0], [14, 18, 0], [14, 18, 1], [28, 6, 0], [28, 26, 0], [6, 36, 0], [6, 36, 1], [30, 44, 0], [-2, 54, 0], [18, 58, 0], [32, 64, 0], [-2, 70, 0], [16, 76, 0]];
    for (const [ox, oz, lvl] of layout) {
      const x = yard.x0 + ox, z = yard.z0 + oz; if (x + 12.2 > yard.x1 || z + 2.5 > yard.z1) continue;
      const rot = ((ox + oz) / 2) % 2 === 0;
      props.containers.push({ x: x + 6.1, z: z + 1.25, y: lvl * 2.6, rot: rot ? 0 : 0, color: cols[(ox * 3 + oz + lvl) % cols.length] });
      if (lvl === 0) { colliders.push({ x0: x, z0: z, x1: x + 12.2, z1: z + 2.5, h: 2.6, kind: 'container' }); covers.push({ x0: x, z0: z, x1: x + 12.2, z1: z + 2.5 }); }
    }
    // crates & barrels scattered for cover
    for (let k = 0; k < 18; k++) {
      const x = yard.x0 + rnd() * (yard.x1 - yard.x0), z = yard.z0 + rnd() * (yard.z1 - yard.z0);
      if (colliders.some((c) => x > c.x0 - 1.5 && x < c.x1 + 1.5 && z > c.z0 - 1.5 && z < c.z1 + 1.5)) continue;
      props.crates.push({ x, z, s: 1.1 + rnd() * 0.3, rot: rnd() * 3 });
      colliders.push({ x0: x - 0.65, z0: z - 0.65, x1: x + 0.65, z1: z + 0.65, h: 1.3, kind: 'crate' }); covers.push({ x0: x - 0.65, z0: z - 0.65, x1: x + 0.65, z1: z + 0.65 });
    }
    // quay edge bollards + lights
    for (let z = d.z0 + 6; z < d.z1; z += 14) props.lights.push({ x: d.x0 + 2, z, rot: Math.PI / 2, dock: true });
    for (let x = d.x0 + 6; x < LAND0; x += 18) { props.lights.push({ x, z: d.z0 + 1.5, rot: 0, dock: true }); props.lights.push({ x, z: d.z1 - 1.5, rot: Math.PI, dock: true }); }
    sites.dockGate = { x: LAND0 - 6, z: 40 };
  }

  // ---------------- street furniture along roads --------------------------------------------
  const sideOff = ROAD_HALF + 0.55; // near curb
  const treeOff = ROAD_HALF + 1.5;
  const zoneAt = (x, z) => {
    for (let bx = 0; bx < 4; bx++) for (let bz = 0; bz < 4; bz++) {
      if (x > ROADS[bx] + ROAD_HALF - 0.5 && x < ROADS[bx + 1] - ROAD_HALF + 0.5 && z > ROADS[bz] + ROAD_HALF - 0.5 && z < ROADS[bz + 1] - ROAD_HALF + 0.5) return ZONES[bz][bx];
    }
    return 'promenade';
  };
  for (let i = 0; i < ROADS.length; i++) for (let j = 0; j < ROADS.length - 1; j++) {
    const r = ROADS[i], a = ROADS[j], b = ROADS[j + 1];
    for (const sgn of [-1, 1]) {
      // along z (vertical road at x=r), sidewalk at x = r + sgn*off
      for (const [ax, az, horiz] of [[r, null, false], [null, r, true]]) {
        void ax; void az;
        for (let t = a + 14; t <= b - 14; t += 2) {
          const along = t;
          const pos = (off) => (horiz ? { x: along, z: r + sgn * off } : { x: r + sgn * off, z: along });
          const k = Math.round((t - a - 14) / 2);
          const zone = zoneAt(pos(treeOff).x, pos(treeOff).z);
          const rotLight = horiz ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
          if (k % 13 === 0) { const p = pos(sideOff); props.lights.push({ ...p, rot: rotLight }); circles.push({ ...p, r: 0.18, kind: 'pole' }); }
          else if (k % 13 === 6 && zone !== 'promenade') {
            if (zone === 'park') continue;
            const p = pos(treeOff); props.trees.push({ ...p, s: 0.75 + rnd() * 0.35, pit: true }); circles.push({ ...p, r: 0.28, kind: 'tree' });
          } else if (k % 13 === 6 && zone === 'promenade') {
            const p = pos(ROAD_HALF + WALK_W + 4); props.palms.push({ ...p, s: 0.9 + rnd() * 0.3 }); circles.push({ ...p, r: 0.3, kind: 'tree' });
          } else if (k % 26 === 3 && zone !== 'park') {
            const p = pos(sideOff + 0.1); props.hydrants.push(p); circles.push({ ...p, r: 0.22, kind: 'hydrant' });
          } else if (k % 26 === 9) {
            const p = pos(sideOff + 0.2); props.bins.push(p); circles.push({ ...p, r: 0.3, kind: 'bin' });
          } else if (k % 39 === 16 && zone === 'commercial') {
            const p = pos(sideOff + 0.3); props.newsboxes.push({ ...p, rot: rotLight }); circles.push({ ...p, r: 0.3, kind: 'box' });
          } else if (k % 26 === 19 && zone === 'promenade') {
            const p = pos(ROAD_HALF + WALK_W + 2.5); props.benches.push({ ...p, rot: rotLight + Math.PI });
          }
          if (k % 3 === 1 && (zone === 'commercial' || zone === 'downtown') && k % 13 !== 0) { const p = pos(ROAD_HALF + 0.35); if (k % 6 === 1) props.meters.push(p); }
        }
        // parking spots on this side of the segment
        for (let t = a + 16; t <= b - 16; t += 6.2) {
          if (rnd() < 0.1) continue;
          const p = horiz ? { x: t, z: r + sgn * PARK_OFF } : { x: r + sgn * PARK_OFF, z: t };
          // heading = travel direction of the adjacent lane
          const heading = horiz ? (sgn > 0 ? Math.PI / 2 : -Math.PI / 2) : (sgn > 0 ? Math.PI : 0);
          parking.push({ ...p, heading });
        }
      }
    }
  }
  // bus shelters
  for (const [x, z, rot] of [[40, 80 - ROAD_HALF - 2.4, 0], [-80 + ROAD_HALF + 2.4, 40, -Math.PI / 2], [120, 160 - ROAD_HALF - 2.4, 0], [-120, -80 + ROAD_HALF + 2.4, Math.PI]]) {
    props.shelters.push({ x, z, rot }); colliders.push({ x0: x - 2, z0: z - 0.8, x1: x + 2, z1: z + 0.8, h: 2.5, kind: 'shelter' });
  }
  // de-duplicate props too close to buildings/driveways
  const blocked = (p, rad) => colliders.some((c) => c.kind === 'building' && p.x > c.x0 - rad && p.x < c.x1 + rad && p.z > c.z0 - rad && p.z < c.z1 + rad);
  props.trees = props.trees.filter((t) => !blocked(t, 1.2));
  props.benches = props.benches.filter((t) => !blocked(t, 0.6));
  for (const b of props.benches) colliders.push({ x0: b.x - 0.9, z0: b.z - 0.9, x1: b.x + 0.9, z1: b.z + 0.9, h: 0.9, kind: 'bench', round: true });

  const materials = cityMaterials();
  const group = B.build((key) => materials[key] || dynMats.get(key));
  group.name = 'city';
  return { group, colliders, circles, props, parking, lots, sites, covers, parks, plazas, bounds: { x0: DOCK.x0, z0: LAND0, x1: LAND1, z1: LAND1 }, spacing: SPACING };
}
