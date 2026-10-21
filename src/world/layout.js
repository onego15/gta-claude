// City plan for Port Aurora: a compact 4x4 block grid ringed by a waterfront promenade,
// with a dock district on the west side. Everything else (meshes, lanes, sidewalks,
// colliders) is derived from the data in this file.

export const SPACING = 80; // road centerline spacing
export const ROAD_HALF = 6; // half carriageway width (2 lanes + 2 parking strips)
export const LANE_OFF = 1.75; // lane center offset from road centerline
export const PARK_OFF = 4.75; // parking strip center offset
export const WALK_W = 4; // sidewalk width
export const CURB_H = 0.15;
export const ROADS = [-160, -80, 0, 80, 160]; // centerlines (same for x and z)
export const MIN = ROADS[0], MAX = ROADS[ROADS.length - 1];
export const LOT_INSET = ROAD_HALF + WALK_W; // distance from road centerline to lot edge
export const PROMENADE = 14; // land beyond outer sidewalks before the seawall
export const DOCK = { x0: MIN - 130, x1: MIN - LOT_INSET - PROMENADE + 2, z0: -60, z1: 120 };

// Block zoning. bx: 0..3 west->east, bz: 0..3 north->south
export const ZONES = [
  ['residential', 'residential', 'residential', 'residential'],
  ['commercial', 'downtown', 'park', 'commercial'],
  ['commercial', 'downtown', 'downtown', 'commercial'],
  ['police', 'plaza', 'hospital', 'gas'],
];

export function blockRect(bx, bz) {
  return {
    x0: ROADS[bx] + LOT_INSET, x1: ROADS[bx + 1] - LOT_INSET,
    z0: ROADS[bz] + LOT_INSET, z1: ROADS[bz + 1] - LOT_INSET,
  };
}

// Deterministic PRNG so the city is identical on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- ground classification -------------------------------------------------
const nearRoad = (v) => {
  for (const r of ROADS) if (Math.abs(v - r) <= ROAD_HALF) return r;
  return null;
};
export function onCarriageway(x, z) {
  const inX = x >= MIN - ROAD_HALF && x <= MAX + ROAD_HALF;
  const inZ = z >= MIN - ROAD_HALF && z <= MAX + ROAD_HALF;
  return (nearRoad(x) !== null && inZ) || (nearRoad(z) !== null && inX);
}
// Height of the walkable surface (roads at 0, sidewalks/lots raised by the curb).
export function groundHeight(x, z) {
  if (onCarriageway(x, z)) return 0;
  // dock apron is at road level, connected by a ramp road
  if (x < DOCK.x1 && x > DOCK.x0 && z > DOCK.z0 && z < DOCK.z1) return 0;
  return CURB_H;
}

// --- lane graph ------------------------------------------------------------
// Nodes are intersections (i,j). Each directed edge is a road segment with one lane.
export function buildRoadGraph() {
  const nodes = [];
  const idx = (i, j) => j * ROADS.length + i;
  for (let j = 0; j < ROADS.length; j++) for (let i = 0; i < ROADS.length; i++) nodes.push({ id: idx(i, j), i, j, x: ROADS[i], z: ROADS[j], out: [] });
  const edges = [];
  const link = (a, b) => {
    const A = nodes[a], B = nodes[b];
    const dx = Math.sign(B.x - A.x), dz = Math.sign(B.z - A.z);
    // right-hand traffic: the lane sits to the right of travel, right = (-dz, dx) with y up
    const e = { id: edges.length, from: a, to: b, dx, dz, ox: -dz * LANE_OFF, oz: dx * LANE_OFF };
    e.len = Math.hypot(B.x - A.x, B.z - A.z);
    edges.push(e); A.out.push(e.id);
  };
  for (let j = 0; j < ROADS.length; j++) for (let i = 0; i < ROADS.length; i++) {
    if (i + 1 < ROADS.length) { link(idx(i, j), idx(i + 1, j)); link(idx(i + 1, j), idx(i, j)); }
    if (j + 1 < ROADS.length) { link(idx(i, j), idx(i, j + 1)); link(idx(i, j + 1), idx(i, j)); }
  }
  return { nodes, edges, idx };
}

// --- sidewalk graph for pedestrians -----------------------------------------
// Corner nodes sit on the sidewalk at each intersection quadrant. Edges run along
// block sides (sidewalk) and across roads (crosswalks).
export function buildWalkGraph() {
  const off = ROAD_HALF + WALK_W * 0.5;
  const nodes = [];
  const key = new Map();
  const add = (x, z, tag) => { const k = `${x},${z}`; if (key.has(k)) return key.get(k); const n = { id: nodes.length, x, z, links: [], tag }; nodes.push(n); key.set(k, n.id); return n.id; };
  const link = (a, b, cross) => { nodes[a].links.push({ to: b, cross }); nodes[b].links.push({ to: a, cross }); };
  // corners around every intersection
  for (const rx of ROADS) for (const rz of ROADS) {
    const c = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.push(add(rx + sx * off, rz + sz * off));
    // crosswalks: c indexes [(-,-),(-,+),(+,-),(+,+)]
    link(c[0], c[2], { road: 'x', at: rz - off, rx, rz }); // north side crossing (along x)
    link(c[1], c[3], { road: 'x', at: rz + off, rx, rz });
    link(c[0], c[1], { road: 'z', at: rx - off, rx, rz });
    link(c[2], c[3], { road: 'z', at: rx + off, rx, rz });
  }
  // sidewalks along block sides
  for (let i = 0; i < ROADS.length; i++) for (let j = 0; j < ROADS.length; j++) {
    const rx = ROADS[i], rz = ROADS[j];
    if (i + 1 < ROADS.length) for (const sz of [-1, 1]) link(key.get(`${rx + off},${rz + sz * off}`), key.get(`${ROADS[i + 1] - off},${rz + sz * off}`), null);
    if (j + 1 < ROADS.length) for (const sx of [-1, 1]) link(key.get(`${rx + sx * off},${rz + off}`), key.get(`${rx + sx * off},${ROADS[j + 1] - off}`), null);
  }
  return { nodes };
}
