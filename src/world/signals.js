// Traffic signals: one global two-phase cycle (N/S then E/W) shared by every intersection,
// plus mast-arm signal heads whose lamp materials are switched each frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, ROAD_HALF, CURB_H } from './layout.js';

const G = 12, Y = 3, R = 1.5; const CYCLE = 2 * (G + Y + R);

export class Signals {
  constructor() {
    this.t = 4;
    const mk = (c) => new THREE.MeshStandardMaterial({ color: '#111', emissive: c, emissiveIntensity: 0, roughness: 0.3 });
    // [axis][lamp] axis 0 = traffic moving along z (N/S), 1 = along x (E/W)
    this.mats = [0, 1].map(() => ({ r: mk('#ff2a1a'), y: mk('#ffb21a'), g: mk('#2aff8a') }));
    this.walk = [0, 1].map(() => ({ go: mk('#e8f4ff'), stop: mk('#ff6a1a') }));
  }
  // state of axis: 'g' | 'y' | 'r'
  state(axis) {
    const t = (this.t + (axis ? G + Y + R : 0)) % CYCLE;
    return t < G ? 'g' : t < G + Y ? 'y' : 'r';
  }
  // seconds until this axis turns green (0 if green)
  // pedestrians may cross a road when the traffic on that road is red
  canCross(roadAxis) { return this.state(roadAxis) === 'r' && ((this.t + (roadAxis ? G + Y + R : 0)) % CYCLE) < CYCLE - 2.5; }
  update(dt) {
    this.t = (this.t + dt) % CYCLE;
    for (let a = 0; a < 2; a++) {
      const s = this.state(a), m = this.mats[a];
      m.r.emissiveIntensity = s === 'r' ? 5 : 0.04; m.y.emissiveIntensity = s === 'y' ? 5 : 0.04; m.g.emissiveIntensity = s === 'g' ? 5 : 0.04;
      // walk signal for crossing the road with traffic axis a
      const go = this.canCross(a); this.walk[a].go.emissiveIntensity = go ? 2.5 : 0.03; this.walk[a].stop.emissiveIntensity = go ? 0.03 : 2.5;
    }
  }

  build(colliderCircles) {
    const metal = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.55, metalness: 0.6 });
    const housing = new THREE.MeshStandardMaterial({ color: '#1c1e1f', roughness: 0.6, metalness: 0.3 });
    const geos = { metal: [], housing: [], lamps: [0, 1].map(() => ({ r: [], y: [], g: [] })), walk: [0, 1].map(() => ({ go: [], stop: [] })) };
    const h = ROAD_HALF + 0.8;
    const place = (g, x, y, z, rotY) => { g.rotateY(rotY); g.translate(x, y, z); return g; };
    for (const rx of ROADS) for (const rz of ROADS) {
      // approaches: direction of travel d into the intersection
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const fromX = rx - dx * 80, fromZ = rz - dz * 80;
        if (fromX < ROADS[0] || fromX > ROADS[4] || fromZ < ROADS[0] || fromZ > ROADS[4]) continue;
        const axis = dz !== 0 ? 0 : 1;
        const ox = -dz, oz = dx; // right of travel
        // pole on the far-right corner
        const px = rx + dx * h + ox * h, pz = rz + dz * h + oz * h;
        const face = Math.atan2(-dx, -dz); // head faces oncoming traffic
        geos.metal.push(place(new THREE.CylinderGeometry(0.11, 0.14, 6.2, 8), px, CURB_H + 3.1, pz, 0));
        // mast arm reaching over the lanes
        const armLen = 5.2;
        const arm = new THREE.CylinderGeometry(0.06, 0.08, armLen, 6); arm.rotateZ(Math.PI / 2);
        arm.rotateY(Math.atan2(-oz, ox) + Math.PI); arm.translate(px - ox * armLen / 2, CURB_H + 5.9, pz - oz * armLen / 2);
        geos.metal.push(arm);
        for (const k of [0.62, 1]) {
          const hx = px - ox * armLen * k, hz = pz - oz * armLen * k;
          geos.housing.push(place(new THREE.BoxGeometry(0.36, 1.05, 0.28), hx, CURB_H + 5.35, hz, face));
          const lamp = (key, y) => { const g = new THREE.CircleGeometry(0.11, 12); g.translate(0, 0, 0.145); geos.lamps[axis][key].push(place(g, hx, CURB_H + y, hz, face)); };
          lamp('r', 5.7); lamp('y', 5.37); lamp('g', 5.04);
          // visors
          for (const y of [5.79, 5.46, 5.13]) { const v = new THREE.BoxGeometry(0.28, 0.02, 0.14); v.translate(0, 0, 0.21); geos.housing.push(place(v, hx, CURB_H + y, hz, face)); }
        }
        // pedestrian signal on the pole, facing across the road the pedestrians will cross
        const pf = Math.atan2(ox, oz) + Math.PI;
        geos.housing.push(place(new THREE.BoxGeometry(0.34, 0.6, 0.2), px, CURB_H + 2.7, pz, pf));
        const wg = (key, y, roadAxis) => { const g = new THREE.PlaneGeometry(0.24, 0.22); g.translate(0, 0, 0.105); geos.walk[roadAxis][key].push(place(g, px, CURB_H + y, pz, pf)); };
        // this ped head is used to cross the road perpendicular to travel, i.e. the road with axis 1-axis
        wg('stop', 2.84, 1 - axis); wg('go', 2.56, 1 - axis);
        colliderCircles.push({ x: px, z: pz, r: 0.18, h: 6, kind: 'pole' });
      }
    }
    const group = new THREE.Group(); group.name = 'signals';
    const add = (list, mat, shadow = true) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list, false), mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); };
    add(geos.metal, metal); add(geos.housing, housing);
    for (let a = 0; a < 2; a++) { for (const k of ['r', 'y', 'g']) add(geos.lamps[a][k], this.mats[a][k], false); for (const k of ['go', 'stop']) add(geos.walk[a][k], this.walk[a][k], false); }
    return group;
  }
}
