// Vehicle management: AI drivers that follow lanes, obey signals, keep their distance and
// react to danger; ambient traffic and parked-car streaming around the player; car-car
// collisions.
import * as THREE from 'three';
import { Vehicle, obbOverlap } from '../vehicles/vehicle.js';
import { CAR_COLORS } from '../vehicles/carModel.js';
import { Human } from '../actors/human.js';
import { PED_IDS } from '../actors/charAssets.js';

const _l = new THREE.Vector3();
const TYPES = [['sedan', 30], ['hatch', 20], ['suv', 14], ['van', 9], ['pickup', 10], ['sports', 5], ['taxi', 12]];
function pickType(rnd) {
  let t = rnd() * TYPES.reduce((a, b) => a + b[1], 0);
  for (const [k, w] of TYPES) { t -= w; if (t <= 0) return k; }
  return 'sedan';
}

export class DriverAI {
  constructor(game, v, edge, { mode = 'traffic' } = {}) {
    this.game = game; this.v = v; this.mode = mode; // traffic | police | flee | parked
    this.cruise = 9.5 + Math.random() * 3;
    this.panic = 0; this.stuckT = 0; this.reverseT = 0; this.honkT = 0; this.waitT = 0;
    this.chase = null; // target human for police
    this.route = [];
    this.setEdge(edge, null);
  }
  setEdge(e, next) {
    const net = this.game.roads;
    this.edge = e; this.next = next || this.chooseNext(e);
    this.path = net.buildPath(this.edge, this.next); this.seg = 0;
  }
  chooseNext(e) {
    if (this.route.length && this.route[0].from === e.to) return this.route.shift();
    this.route = [];
    return this.game.roads.pickNext(e);
  }
  // re-attach to the nearest lane (after an off-road chase or a crash)
  relane() {
    const n = this.game.roads.nearestEdge(this.v.pos.x, this.v.pos.z, this.v.heading);
    this.setEdge(n.edge, null);
    this.seg = 0;
  }
  onAttacked(by) {
    if (this.mode === 'traffic') { this.panic = 12; this.honkT = 0; }
    void by;
  }

  _project() {
    const { pts } = this.path; const p = this.v.pos;
    // advance segment index while we're past the end of the current one
    for (let iter = 0; iter < 4; iter++) {
      if (this.seg >= pts.length - 1) break;
      const a = pts[this.seg], b = pts[this.seg + 1];
      const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1;
      const t = ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2;
      if (t > 1) this.seg++; else break;
    }
    if (this.seg >= this.path.nextStart) {
      const n = this.next; this.setEdge(n, null);
    }
    const a = this.path.pts[this.seg], b = this.path.pts[Math.min(this.seg + 1, this.path.pts.length - 1)];
    const vx = b.x - a.x, vz = b.z - a.z, L = Math.hypot(vx, vz) || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (L * L)));
    this.lateral = Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
    return this.path.cum[this.seg] + t * L;
  }
  _pointAt(s) {
    const { pts, cum } = this.path;
    if (s >= cum[cum.length - 1]) return pts[pts.length - 1];
    let i = this.seg; while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const k = (s - cum[i]) / (cum[i + 1] - cum[i] || 1);
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, z: pts[i].z + (pts[i + 1].z - pts[i].z) * k };
  }

  update(dt) {
    const v = this.v, g = this.game;
    if (!v.driver || v.driver.dead || v.dead) { v.input.throttle = 0; v.input.brake = 0.4; v.input.steer = 0; v.input.handbrake = !v.dead; return; }
    this.panic = Math.max(0, this.panic - dt);
    const speed = v.speed;
    let target, desired;
    const chasing = this.mode === 'police' && this.chase && !this.chase.dead;
    const tp = chasing ? this.chase.wpos : null;
    const directChase = chasing && tp.distanceTo(v.pos) < (this.chase.vehicle ? 45 : 30);

    if (this.reverseT > 0) {
      this.reverseT -= dt;
      v.input.throttle = 0; v.input.brake = 1; v.input.steer = -this.revSteer; v.input.handbrake = false;
      if (this.reverseT <= 0 && !directChase) this.relane();
      return;
    }

    if (directChase) {
      target = { x: tp.x, z: tp.z };
      const d = tp.distanceTo(v.pos);
      if (this.chase.vehicle) desired = Math.min(26, 8 + d * 0.6);
      else desired = d < 12 ? 0 : Math.min(14, d * 0.6);
      this.offroad = true;
    } else {
      if (this.offroad) { this.relane(); this.offroad = false; }
      if (chasing && this.routeTimer === undefined) this.routeTimer = 0;
      if (chasing) {
        this.routeTimer -= dt;
        if (this.routeTimer <= 0) { this.routeTimer = 2; const goal = g.roads.nearestNode(tp.x, tp.z); this.route = g.roads.route(this.edge, goal); if (this.route.length && this.route[0].from === this.edge.to && this.next !== this.route[0]) { this.next = this.route.shift(); this.path = g.roads.buildPath(this.edge, this.next); } }
      }
      const s = this._project();
      const look = 4.5 + Math.abs(speed) * 0.55;
      target = this._pointAt(s + look);
      // lost the lane badly (pushed off): rejoin
      if (this.lateral > 9) { this.relane(); }
      desired = this.mode === 'police' && chasing ? 22 : this.panic > 0 ? 17 : this.cruise;
      // slow for turns
      const remain = this.path.cum[1] - s;
      const turn = g.roads.turnType(this.edge, this.next);
      if (turn !== 'straight' && remain < 22) desired = Math.min(desired, chasing ? 9 : 5.5 + Math.max(0, remain) * 0.15);
      if (s > this.path.cum[1] && s < this.path.cum[this.path.nextStart] && turn !== 'straight') desired = Math.min(desired, chasing ? 10 : 6);
      // signals: stop at the line when red / amber
      const ignoreSignals = (this.mode === 'police' && v.siren) || this.panic > 0;
      if (!ignoreSignals && remain > -0.5 && remain < 30) {
        const st = g.signals.state(this.edge.axis);
        if (st === 'r' || (st === 'y' && remain > speed * speed / 8 + 2)) {
          desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 3.2 * (remain - 0.6))));
          if (remain < 1.0) desired = 0;
        }
      }
    }

    // obstacles ahead: vehicles, people
    let blockedBy = null;
    const hz = v.dims.hz;
    const scanLen = 6 + Math.abs(speed) * 1.6;
    const steerBias = v.steerAngle; // look into the turn
    for (const o of g.vehicles.near(v.pos, scanLen + 8)) {
      if (o === v) continue;
      if (chasing && o === this.chase.vehicle) continue;
      v.toLocal(o.pos, _l);
      const lx = _l.x + steerBias * _l.z * 0.8;
      if (_l.z > 0 && _l.z < scanLen + o.dims.hz && Math.abs(lx) < 1.5 + o.dims.hx * 0.5) {
        const gap = _l.z - hz - o.dims.hz;
        const allowed = Math.sqrt(Math.max(0, 2 * 5 * (gap - 1.8)));
        if (allowed < desired) { desired = allowed; blockedBy = o; }
      }
    }
    for (const h of g.humans) {
      if (h.dead || h.vehicle || h.removed) continue;
      if (h === this.chase) continue;
      const dx = h.pos.x - v.pos.x, dz = h.pos.z - v.pos.z; if (dx * dx + dz * dz > (scanLen + 6) ** 2) continue;
      v.toLocal(h.pos, _l);
      const lx = _l.x + steerBias * _l.z * 0.8;
      if (_l.z > 0 && _l.z < scanLen + 3 && Math.abs(lx) < 1.6) {
        const gap = _l.z - hz;
        const allowed = Math.sqrt(Math.max(0, 2 * 6 * (gap - 2.0)));
        if (allowed < desired) { desired = allowed; blockedBy = h; }
      }
    }
    // honk at the player blocking the road
    if (blockedBy && (blockedBy === g.player || blockedBy.driver === g.player) && Math.abs(speed) < 1) {
      this.honkT += dt; if (this.honkT > 2.5 && Math.random() < dt * 0.8) { g.audio.play('horn', { pos: v.pos, volume: 0.6, rate: 0.9 + Math.random() * 0.2 }); this.honkT = 1.5; }
    } else this.honkT = Math.max(0, this.honkT - dt);
    // waited behind a parked/abandoned obstacle for a long time: squeeze past it
    if (blockedBy && Math.abs(speed) < 0.5 && !(blockedBy.ai || blockedBy.driver)) this.waitT += dt; else this.waitT = Math.max(0, this.waitT - dt * 2);
    if (this.waitT > 4 && blockedBy) { this.reverseT = 1.2; this.revSteer = 1; this.waitT = 0; }

    // pure pursuit steering
    v.toLocal(new THREE.Vector3(target.x, v.pos.y, target.z), _l);
    const Ld = Math.max(2, Math.hypot(_l.x, _l.z));
    const alpha = Math.atan2(_l.x, _l.z);
    const delta = Math.atan(2 * v.P.base * Math.sin(alpha) / Ld);
    const maxSteer = 0.62 / (1 + Math.abs(speed) / 15);
    v.input.steer = THREE.MathUtils.clamp(-delta / maxSteer, -1, 1);
    if (_l.z < 0 && directChase && Ld < 12) v.input.steer = -v.input.steer;
    // speed control
    const err = desired - speed;
    if (err > 0) { v.input.throttle = THREE.MathUtils.clamp(err * 0.45, 0.15, 1); v.input.brake = 0; }
    else { v.input.throttle = 0; v.input.brake = THREE.MathUtils.clamp(-err * 0.35, 0, 1); }
    if (desired < 0.1 && Math.abs(speed) < 0.6) { v.input.brake = 1; v.input.throttle = 0; }
    v.input.handbrake = false;
    // stuck (pinned against something without a reason we know)
    if (desired > 3 && Math.abs(speed) < 0.6 && !blockedBy) { this.stuckT += dt; if (this.stuckT > 1.8) { this.reverseT = 1.3; this.revSteer = v.input.steer >= 0 ? 1 : -1; this.stuckT = 0; } }
    else this.stuckT = Math.max(0, this.stuckT - dt);
  }
}

export class VehicleManager {
  constructor(game) {
    this.game = game; this.list = [];
    this.rnd = Math.random;
    this.trafficTarget = 18;
    const sh = game.city.sites.safehouse;
    this.parkedSpots = game.city.parking.map((p, i) => ({ ...p, i, vehicle: null, seed: (i * 2654435761) % 1000 / 1000 })).filter((p) => Math.hypot(p.x - sh.x, p.z - sh.z) > 16);
  }
  add(v) { this.list.push(v); this.game.scene.add(v.group); return v; }
  remove(v) {
    const i = this.list.indexOf(v); if (i >= 0) this.list.splice(i, 1);
    if (v.driver && v.driver !== this.game.player) { this.game.removeHuman(v.driver); v.driver = null; }
    if (v.spot) v.spot.vehicle = null;
    v.dispose();
  }
  near(p, r) { const r2 = r * r; return this.list.filter((v) => (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2 < r2); }

  spawnTraffic(edge, t, { type = null, police = false, color = null } = {}) {
    const g = this.game;
    const tp = type || pickType(this.rnd);
    const livery = police ? 'police' : tp === 'taxi' ? 'taxi' : null;
    const carType = tp === 'taxi' || police ? 'sedan' : tp;
    const x = edge.S.x + (edge.E.x - edge.S.x) * t, z = edge.S.z + (edge.E.z - edge.S.z) * t;
    const v = new Vehicle(g, carType, { color: color || CAR_COLORS[(this.rnd() * CAR_COLORS.length) | 0], livery, x, z, heading: edge.heading });
    this.add(v);
    const id = police ? (this.rnd() < 0.75 ? 'cop_m' : 'cop_f') : PED_IDS[(this.rnd() * PED_IDS.length) | 0];
    const d = new Human(g, id, { x, z, team: police ? 'cop' : 'civ' });
    g.addHuman(d); d.seatIn(v); d.isDriver = true;
    v.ai = new DriverAI(g, v, edge, { mode: police ? 'police' : 'traffic' });
    v.vel.set(Math.sin(edge.heading) * 6, Math.cos(edge.heading) * 6);
    return v;
  }

  spawnParked(spot) {
    const g = this.game;
    const tp = spot.police ? 'sedan' : pickType(() => spot.seed);
    const livery = spot.police ? 'police' : tp === 'taxi' ? 'taxi' : null;
    const v = new Vehicle(g, tp === 'taxi' ? 'sedan' : tp, { color: CAR_COLORS[Math.floor(spot.seed * 97) % CAR_COLORS.length], livery, x: spot.x, z: spot.z, heading: spot.heading });
    v.spot = spot; spot.vehicle = v; v.parkedAt = { x: spot.x, z: spot.z };
    v.input.handbrake = true;
    return this.add(v);
  }

  // find a spawn point on a lane: distance window from the player, preferably unseen
  _findSpawn(minD, maxD) {
    const g = this.game, p = g.player.wpos, cam = g.camera.cam;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    for (let k = 0; k < 20; k++) {
      const e = g.roads.edges[(this.rnd() * g.roads.edges.length) | 0];
      const t = 0.1 + this.rnd() * 0.75;
      const x = e.S.x + (e.E.x - e.S.x) * t, z = e.S.z + (e.E.z - e.S.z) * t;
      const d = Math.hypot(x - p.x, z - p.z); if (d < minD || d > maxD) continue;
      const dirDot = ((x - cam.position.x) * fwd.x + (z - cam.position.z) * fwd.z) / d;
      if (d < 130 && dirDot > 0.35) continue; // visible to the camera
      if (this.list.some((v) => (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2 < 14 * 14)) continue;
      return { edge: e, t, x, z };
    }
    return null;
  }

  update(dt) {
    const g = this.game, p = g.player.wpos;
    // AI
    for (const v of this.list) if (v.ai && v.driver && v.driver !== g.player) v.ai.update(dt);
    for (const v of this.list) v.update(dt);
    // car-car collisions
    for (let i = 0; i < this.list.length; i++) for (let j = i + 1; j < this.list.length; j++) {
      const a = this.list[i], b = this.list[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, R = a.radius + b.radius;
      if (dx * dx + dz * dz > R * R) continue;
      const c = obbOverlap(a, b); if (!c) continue;
      const ma = a.P.mass * (a.parkedAt && !a.driver ? 1.3 : 1), mb = b.P.mass * (b.parkedAt && !b.driver ? 1.3 : 1);
      const wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.pos.x += c.nx * c.depth * wa; a.pos.z += c.nz * c.depth * wa; b.pos.x -= c.nx * c.depth * wb; b.pos.z -= c.nz * c.depth * wb;
      const rvx = a.vel.x - b.vel.x, rvz = a.vel.y - b.vel.y; const vn = rvx * c.nx + rvz * c.nz;
      if (vn < 0) {
        const jimp = -(1 + 0.3) * vn / (1 / ma + 1 / mb);
        a.vel.x += c.nx * jimp / ma; a.vel.y += c.nz * jimp / ma; b.vel.x -= c.nx * jimp / mb; b.vel.y -= c.nz * jimp / mb;
        a.angVel += (Math.random() - 0.5) * -vn * 0.06; b.angVel += (Math.random() - 0.5) * -vn * 0.06;
        const px = (a.pos.x + b.pos.x) / 2, pz = (a.pos.z + b.pos.z) / 2;
        a.onImpact(-vn * wa * 1.6, px, pz); b.onImpact(-vn * wb * 1.6, px, pz);
        if (-vn > 3) {
          for (const [x, y] of [[a, b], [b, a]]) if (x.ai && y.driver === g.player) { x.ai.onAttacked(g.player); if (x.police) g.wanted.crime('ramCop'); }
        }
        if (a.parkedAt && !a.driver) a.parkedAt = null; if (b.parkedAt && !b.driver) b.parkedAt = null;
      }
    }
    // streaming: traffic
    const traffic = this.list.filter((v) => v.ai && v.ai.mode === 'traffic');
    for (const v of traffic) {
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
      if (d > 210 && !v.persistent) this.remove(v);
    }
    // abandoned/dead traffic cars far away
    for (const v of [...this.list]) {
      if (v.persistent || v === g.player.vehicle || v === g.lastPlayerCar) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
      if (!v.ai && !v.spot && d > 180) this.remove(v);
      else if (v.ai && (!v.driver || v.driver.dead) && d > 150) this.remove(v);
      else if (v.dead && d > 120) this.remove(v);
    }
    const target = g.wanted.level > 2 ? this.trafficTarget - 6 : this.trafficTarget;
    if (traffic.length < target && Math.random() < dt * 4) {
      const s = this._findSpawn(70, 170);
      if (s) this.spawnTraffic(s.edge, s.t);
    }
    // streaming: parked cars near the player
    if (!this._parkT || (this._parkT -= dt) <= 0) {
      this._parkT = 0.5;
      for (const s of this.parkedSpots) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (!s.vehicle && d < 100 && d > 50 && s.seed < (s.police ? 0.9 : 0.34) && !this.list.some((v) => (v.pos.x - s.x) ** 2 + (v.pos.z - s.z) ** 2 < 25)) this.spawnParked(s);
        else if (s.vehicle && d > 160) {
          const v = s.vehicle;
          if (v !== g.lastPlayerCar && !v.driver && !v.persistent) this.remove(v);
          else { s.vehicle = null; v.spot = null; }
        }
      }
    }
  }
  // populate the immediate area at game start (no visibility check)
  initialFill() {
    const p = this.game.player.wpos;
    for (const s of this.parkedSpots) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < 100 && s.seed < (s.police ? 0.9 : 0.34)) this.spawnParked(s); }
    let n = 0;
    for (let k = 0; k < 200 && n < this.trafficTarget; k++) {
      const e = this.game.roads.edges[(this.rnd() * this.game.roads.edges.length) | 0];
      const t = 0.1 + this.rnd() * 0.75;
      const x = e.S.x + (e.E.x - e.S.x) * t, z = e.S.z + (e.E.z - e.S.z) * t;
      const d = Math.hypot(x - p.x, z - p.z); if (d < 25 || d > 170) continue;
      if (this.list.some((v) => (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2 < 16 * 16)) continue;
      this.spawnTraffic(e, t); n++;
    }
  }
}
