// Lane geometry and routing on top of the road graph from layout.js.
import { buildRoadGraph, ROAD_HALF } from '../world/layout.js';

const STOP = ROAD_HALF + 3.2 + 1.0; // stop line distance from the intersection centre
const START = ROAD_HALF + 3.2 - 0.5;

export class RoadNet {
  constructor() {
    const g = buildRoadGraph();
    this.nodes = g.nodes; this.edges = g.edges;
    for (const e of this.edges) {
      const A = this.nodes[e.from], B = this.nodes[e.to];
      e.S = { x: A.x + e.dx * START + e.ox, z: A.z + e.dz * START + e.oz };
      e.E = { x: B.x - e.dx * STOP + e.ox, z: B.z - e.dz * STOP + e.oz };
      e.laneLen = Math.hypot(e.E.x - e.S.x, e.E.z - e.S.z);
      e.axis = e.dz !== 0 ? 0 : 1;
      e.heading = Math.atan2(e.dx, e.dz);
    }
  }
  // edges leaving the end node of e (no U-turns unless it's the only way)
  nextOptions(e) {
    const B = this.nodes[e.to];
    const opts = B.out.map((i) => this.edges[i]).filter((n) => n.to !== e.from);
    return opts.length ? opts : B.out.map((i) => this.edges[i]);
  }
  turnType(e, n) {
    const cross = e.dx * n.dz - e.dz * n.dx;
    if (Math.abs(cross) < 0.5) return 'straight';
    // heading convention: +x is to the left of +z travel
    return cross > 0 ? 'right' : 'left';
  }
  pickNext(e, rnd = Math.random) {
    const opts = this.nextOptions(e);
    const w = opts.map((n) => (this.turnType(e, n) === 'straight' ? 2.2 : 1));
    let t = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) { t -= w[i]; if (t <= 0) return opts[i]; }
    return opts[opts.length - 1];
  }
  // polyline: current lane from its start, a smooth turn, and the next lane
  buildPath(e, n) {
    const pts = [{ x: e.S.x, z: e.S.z }, { x: e.E.x, z: e.E.z }];
    const B = this.nodes[e.to];
    const c = this.turnType(e, n) === 'straight' ? { x: (e.E.x + n.S.x) / 2, z: (e.E.z + n.S.z) / 2 } : { x: B.x + e.ox + n.ox, z: B.z + e.oz + n.oz };
    const N = 8;
    for (let i = 1; i < N; i++) {
      const t = i / N, u = 1 - t;
      pts.push({ x: u * u * e.E.x + 2 * u * t * c.x + t * t * n.S.x, z: u * u * e.E.z + 2 * u * t * c.z + t * t * n.S.z });
    }
    const nextStart = pts.length;
    pts.push({ x: n.S.x, z: n.S.z }, { x: n.E.x, z: n.E.z });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    return { pts, cum, nextStart, edge: e, next: n };
  }
  // nearest lane to a point, preferring lanes aligned with heading
  nearestEdge(x, z, heading = null) {
    let best = null, bd = Infinity;
    for (const e of this.edges) {
      const vx = e.E.x - e.S.x, vz = e.E.z - e.S.z, L2 = vx * vx + vz * vz;
      let t = ((x - e.S.x) * vx + (z - e.S.z) * vz) / L2; t = Math.max(0, Math.min(1, t));
      const px = e.S.x + vx * t, pz = e.S.z + vz * t;
      let d = Math.hypot(x - px, z - pz);
      if (heading !== null) { let dh = e.heading - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); d += Math.abs(dh) * 6; }
      if (d < bd) { bd = d; best = { edge: e, t, dist: d, x: px, z: pz }; }
    }
    return best;
  }
  nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  // shortest edge route (Dijkstra on the small grid) from the end of edge `from` to node `goal`
  route(fromEdge, goalNode) {
    const N = this.nodes.length; const dist = new Array(N).fill(Infinity); const prev = new Array(N).fill(null);
    const start = fromEdge.to; dist[start] = 0; const open = new Set([start]);
    while (open.size) {
      let u = null, ud = Infinity; for (const k of open) if (dist[k] < ud) { ud = dist[k]; u = k; }
      open.delete(u); if (u === goalNode.id) break;
      for (const ei of this.nodes[u].out) {
        const e = this.edges[ei]; if (u === start && e.to === fromEdge.from) continue;
        const nd = dist[u] + e.len; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = e; open.add(e.to); }
      }
    }
    const out = []; let k = goalNode.id;
    while (prev[k] && k !== start) { out.unshift(prev[k]); k = prev[k].from; }
    return out;
  }
  // GPS polyline from a world point to a world point following roads
  gps(fx, fz, tx, tz) {
    const a = this.nearestNode(fx, fz), b = this.nearestNode(tx, tz);
    const pts = [{ x: fx, z: fz }];
    // simple BFS on nodes
    const prev = new Map([[a.id, null]]); const q = [a.id];
    while (q.length) { const u = q.shift(); if (u === b.id) break; for (const ei of this.nodes[u].out) { const v = this.edges[ei].to; if (!prev.has(v)) { prev.set(v, u); q.push(v); } } }
    const chain = []; let k = b.id; while (k !== null && k !== undefined) { chain.unshift(k); k = prev.get(k); }
    for (const id of chain) pts.push({ x: this.nodes[id].x, z: this.nodes[id].z });
    pts.push({ x: tx, z: tz });
    return pts;
  }
}
