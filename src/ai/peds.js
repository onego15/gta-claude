// Pedestrians: wander the sidewalk graph, wait for the walk signal at crossings, idle
// (phone / chat / folded arms), and panic when there's gunfire, explosions or reckless
// driving nearby. Streamed in and out around the player.
import * as THREE from 'three';
import { Human } from '../actors/human.js';
import { PED_IDS } from '../actors/charAssets.js';

const IDLES = ['phone', 'talk', 'fold'];
const _v = new THREE.Vector3();

export class PedAI {
  constructor(game, h, node) {
    this.game = game; this.h = h;
    this.state = 'walk'; this.node = node; this.target = null; this.link = null;
    this.side = 0.4 + Math.random() * 1.1; // keep right, at varying distance
    this.walkSpeed = 1.2 + Math.random() * 0.35;
    this.formal = /suit|office|trousersuit/.test(h.charId) || Math.random() < 0.15;
    this.timer = 0; this.threat = null; this.calmT = 0;
    this.pickNext();
  }
  pickNext(avoid = null) {
    const nodes = this.game.walk.nodes; const n = nodes[this.node];
    let opts = n.links.filter((l) => l.to !== this.prev);
    if (!opts.length) opts = n.links;
    if (avoid) {
      // fleeing: the neighbour that gets us farthest from the threat
      opts = [...opts].sort((a, b) => dist2(nodes[b.to], avoid) - dist2(nodes[a.to], avoid));
      this.link = opts[0];
    } else this.link = opts[(Math.random() * opts.length) | 0];
    this.prev = this.node; this.target = this.link.to;
  }
  alarm(pos, severity) {
    if (this.h.dead) return;
    const d = this.h.pos.distanceTo(pos);
    if (this.state !== 'flee' && this.state !== 'cower') {
      if (d < 9 && severity > 1 && Math.random() < 0.35) { this.state = 'cower'; this.timer = 2 + Math.random() * 2; }
      else this.state = 'flee';
      if (Math.random() < 0.5) this.game.audio.play('step', { pos: this.h.pos, volume: 0.2 });
    }
    this.threat = pos.clone(); this.calmT = 8 + Math.random() * 6;
    if (this.state === 'flee') this.pickNext(this.threat);
  }

  update(dt) {
    const h = this.h, g = this.game, nodes = g.walk.nodes;
    if (h.dead) return;
    if (h.knocked > 0) { h.move(dt, 0, 0, null, 3); h.pose.speed = 0; return; }
    h.pose.mode = 'loco'; h.pose.formal = this.formal && this.state === 'walk';
    if (this.state === 'cower') {
      h.crouch = true; h.pose.mode = 'crouch'; h.move(dt, 0, 0, this.threat ? Math.atan2(this.threat.x - h.pos.x, this.threat.z - h.pos.z) : null); h.pose.speed = 0;
      this.timer -= dt; if (this.timer <= 0) { h.crouch = false; this.state = 'flee'; this.pickNext(this.threat); }
      return;
    }
    if (this.state === 'idle') {
      this.timer -= dt; h.pose.mode = this.idleMode; h.pose.speed = 0; h.move(dt, 0, 0, null);
      if (this.timer <= 0) { this.state = 'walk'; this.pickNext(); }
      return;
    }
    const tn = nodes[this.target], fn = nodes[this.prev];
    // lane offset to the right of travel
    let dx = tn.x - fn.x, dz = tn.z - fn.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const rx = -dz, rz = dx;
    const side = this.link.cross ? this.side * 0.6 : this.side;
    const tx = tn.x + rx * side, tz = tn.z + rz * side;
    let wx = tx - h.pos.x, wz = tz - h.pos.z; const d = Math.hypot(wx, wz);
    let speed = this.state === 'flee' ? 5.4 : this.walkSpeed;
    // waiting at a crossing for the walk signal
    if (this.state === 'walk' && this.link.cross) {
      const roadAxis = this.link.cross.road === 'x' ? 0 : 1;
      const fromD = Math.hypot(h.pos.x - fn.x, h.pos.z - fn.z);
      if (fromD < 2.5 && !g.signals.canCross(roadAxis)) speed = 0;
    }
    // reached node
    if (d < 0.8) {
      this.node = this.target;
      if (this.state === 'walk' && Math.random() < 0.08) { this.state = 'idle'; this.timer = 6 + Math.random() * 12; this.idleMode = IDLES[(Math.random() * IDLES.length) | 0]; return; }
      this.pickNext(this.state === 'flee' ? this.threat : null);
      return;
    }
    wx /= d; wz /= d;
    // separation from other people
    for (const o of g.humans) {
      if (o === h || o.dead || o.vehicle) continue;
      const ox = h.pos.x - o.pos.x, oz = h.pos.z - o.pos.z, od = ox * ox + oz * oz;
      if (od < 1.2 && od > 1e-4) { const k = (1.2 - od) * 1.5; wx += ox * k; wz += oz * k; }
    }
    // step aside for approaching cars
    for (const v of g.vehicles.near(h.pos, 10)) {
      const sp = Math.abs(v.speed); if (sp < 3) continue;
      v.toLocal(h.pos, _v);
      if (_v.z > 0 && _v.z < 4 + sp * 1.2 && Math.abs(_v.x) < 2.5) {
        if (sp > 9 && this.state !== 'flee') this.alarm(v.pos, 1);
        const away = Math.sign(_v.x || 1); const c = Math.cos(v.heading), s = Math.sin(v.heading);
        wx += away * c * 2.5; wz += -away * s * 2.5; speed = Math.max(speed, 4.5);
      }
    }
    const wl = Math.hypot(wx, wz) || 1;
    const sp = h.move(dt, (wx / wl) * speed, (wz / wl) * speed, null, 8);
    h.pose.speed = sp;
    if (this.state === 'flee') { this.calmT -= dt; if (this.calmT <= 0) this.state = 'walk'; }
  }
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export class PedManager {
  constructor(game) { this.game = game; this.list = []; this.target = 24; }
  spawn(node) {
    const g = this.game; const n = g.walk.nodes[node];
    const id = PED_IDS[(Math.random() * PED_IDS.length) | 0];
    const h = new Human(g, id, { x: n.x + (Math.random() - 0.5) * 2, z: n.z + (Math.random() - 0.5) * 2, heading: Math.random() * 6.28 });
    h.ai = new PedAI(g, h, node); g.addHuman(h); this.list.push(h);
    return h;
  }
  alarm(pos, radius, severity = 1) {
    for (const h of this.list) if (!h.dead && h.ai && h.pos.distanceTo(pos) < radius) h.ai.alarm(pos, severity);
    // drivers panic too
    for (const v of this.game.vehicles.near(pos, radius)) if (v.ai && v.ai.mode === 'traffic') v.ai.panic = Math.max(v.ai.panic, 6 + severity * 3);
  }
  update(dt) {
    const g = this.game, p = g.player.wpos;
    for (const h of this.list) h.ai.update(dt);
    // despawn
    for (const h of [...this.list]) {
      const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z);
      if (d > 115 || (h.dead && (g.time - h.deadTime > 40 || d > 70))) { this.list.splice(this.list.indexOf(h), 1); g.removeHuman(h); }
    }
    const night = g.night; const target = Math.round(this.target * (1 - night * 0.45));
    const alive = this.list.filter((h) => !h.dead).length;
    if (alive < target && Math.random() < dt * 6) {
      const cam = g.camera.cam; const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
      for (let k = 0; k < 12; k++) {
        const ni = (Math.random() * g.walk.nodes.length) | 0; const n = g.walk.nodes[ni];
        const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < 35 || d > 95) continue;
        const dot = ((n.x - cam.position.x) * fwd.x + (n.z - cam.position.z) * fwd.z) / d;
        if (d < 75 && dot > 0.4) continue;
        this.spawn(ni); break;
      }
    }
  }
  initialFill() {
    const p = this.game.player.wpos; let n = 0;
    const nodes = this.game.walk.nodes.map((nd, i) => ({ i, d: Math.hypot(nd.x - p.x, nd.z - p.z) })).filter((o) => o.d > 8 && o.d < 90);
    while (n < this.target && nodes.length) { const k = (Math.random() * nodes.length) | 0; const h = this.spawn(nodes[k].i); n++; // start mid-way along a sidewalk
      const ai = h.ai; const a = this.game.walk.nodes[ai.prev], b = this.game.walk.nodes[ai.target]; const t = Math.random() * 0.8; h.pos.set(a.x + (b.x - a.x) * t, h.pos.y, a.z + (b.z - a.z) * t); }
  }
}
