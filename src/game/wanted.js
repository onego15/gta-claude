// Wanted level and police response: crimes raise the level (★1-5), police cars are
// dispatched on the road network, officers deploy on foot, and breaking line of sight
// long enough lowers the level until the city calms down again.
import * as THREE from 'three';
import { CombatAI } from '../ai/combatAI.js';
import { PedAI } from '../ai/peds.js';
import { Human } from '../actors/human.js';

const CARS = [0, 1, 2, 3, 4, 5];
const FOOT = [0, 2, 4, 6, 8, 10];
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Wanted {
  constructor(game) {
    this.game = game; this.level = 0; this.unseenT = 0; this.seen = false; this.lastKnown = new THREE.Vector3();
    this.units = []; this.foot = []; this.spawnT = 0; this.copKills = 0; this.chaseTime = 0;
    this.flash = false;
  }
  get cooldown() { return 9 + this.level * 4; }
  setLevel(l, reason) {
    l = Math.max(0, Math.min(5, l));
    if (l > this.level) { this.unseenT = 0; this.responseT = 25; this.lastKnown.copy(this.game.player.wpos); this.game.hud.starsPulse(); }
    const was = this.level; this.level = l;
    if (l === 0 && was > 0) this.standDown();
    void reason;
  }
  // a crime happened at pos; witnesses decide whether it counts
  crime(type, pos = this.game.player.wpos) {
    const g = this.game;
    if (g.state !== 'play') return;
    const copSees = this.copWitness(pos, 60);
    const civNear = g.humans.some((h) => h.team === 'civ' && !h.dead && h.pos.distanceTo(pos) < 30);
    let min = 0, inc = 0;
    switch (type) {
      case 'shoot': if (copSees) min = 2; else if (civNear) min = 1; break;
      case 'assault': if (copSees || civNear) min = 1; break;
      case 'kill': min = copSees ? 2 : 1; if (this.level >= 1) this.heat = (this.heat || 0) + 1; break;
      case 'carjack': if (copSees) min = 1; else if (civNear && Math.random() < 0.5) min = 1; break;
      case 'copCar': min = 1; break;
      case 'ramCop': min = Math.max(1, this.level); break;
      case 'attackCop': min = 2; g.player.shotAtCopsRecently = true; break;
      case 'killCop': min = 3; this.copKills++; if (this.copKills % 4 === 0) inc = 1; g.player.shotAtCopsRecently = true; break;
      case 'explosion': min = copSees ? 3 : 2; break;
      default: break;
    }
    if ((this.heat || 0) >= 5 && this.level < 3) { inc = 1; this.heat = 0; }
    const nl = Math.max(this.level + inc, min);
    if (nl > this.level) this.setLevel(nl, type);
    if (this.level > 0 && (copSees || min > 0)) { this.unseenT = 0; this.lastKnown.copy(pos); }
  }
  copWitness(pos, range) {
    const g = this.game;
    for (const h of g.humans) {
      if (h.team !== 'cop' || h.dead) continue;
      const hp = h.vehicle ? h.vehicle.pos : h.pos;
      if (hp.distanceTo(pos) > range) continue;
      _v.set(hp.x, hp.y + 1.6, hp.z); _w.set(pos.x, pos.y + 1.2, pos.z);
      if (g.world.lineOfSight(_v, _w)) return true;
    }
    return false;
  }

  standDown() {
    const g = this.game;
    for (const v of this.units) if (v.ai) { v.ai.mode = 'traffic'; v.ai.chase = null; v.siren = false; v.persistent = false; }
    for (const h of this.foot) {
      if (h.dead) continue;
      h.combat = null; h.aiming = false; h.crouch = false;
      const n = g.nearestWalkNode(h.pos);
      h.ai = new PedAI(g, h, n); g.peds.list.push(h);
    }
    this.units = []; this.foot = [];
    g.player.shotAtCopsRecently = false; this.copKills = 0; this.heat = 0;
    g.hud.notify('You lost the cops.');
  }
  // remove every police unit immediately (respawn after death/arrest)
  reset() {
    const g = this.game;
    for (const v of this.units) g.vehicles.remove(v);
    for (const h of this.foot) g.removeHuman(h);
    this.units = []; this.foot = []; this.level = 0; this.unseenT = 0; this.copKills = 0; this.heat = 0;
    g.player.shotAtCopsRecently = false;
  }

  spawnUnit() {
    const g = this.game; const p = g.player.wpos;
    const s = g.vehicles._findSpawn(80, 170); if (!s) return;
    const v = g.vehicles.spawnTraffic(s.edge, s.t, { police: true });
    v.persistent = true; v.siren = true; v.ai.chase = g.player; v.ai.mode = 'police';
    v.ai.cruise = 18; v.maxSpeed *= 1.08 + this.level * 0.03; v.accelMax *= 1.1;
    v.crew = 2; // driver + passenger
    this.units.push(v);
    void p;
  }
  deploy(v) {
    // officers leave the car and fight on foot
    const g = this.game; const drv = v.driver; if (!drv) return;
    v.ai.deployed = true;
    drv.exitVehicle(); drv.copExiting = v;
    if (v.crew > 1) {
      const p = v.toWorld(-v.dims.hx - 0.6, 0, v.model.doorPos.z, new THREE.Vector3());
      const c = new Human(g, Math.random() < 0.7 ? 'cop_m' : 'cop_f', { x: p.x, z: p.z, heading: v.heading + Math.PI / 2, team: 'cop' });
      g.addHuman(c); this.arm(c); this.foot.push(c); v.crew = 1;
      g.world.resolveCircle(c.pos, 0.4, {});
    }
  }
  arm(h) {
    h.give(this.level >= 4 ? 'smg' : 'pistol', 400);
    h.damageScale = 0.32 + this.level * 0.05;
    h.combat = new CombatAI(this.game, h, { target: this.game.player, accuracy: 0.75 + this.level * 0.1, prefDist: 12 + Math.random() * 6, useCover: Math.random() < 0.6, police: true });
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (this.level === 0) { this.flash = false; return; }
    this.chaseTime += dt;
    const pp = p.wpos;
    // seen by any police?
    let seen = false;
    for (const h of g.humans) {
      if (h.team !== 'cop' || h.dead) continue;
      const hp = h.vehicle ? h.vehicle.pos : h.pos; const d = hp.distanceTo(pp);
      if (d < 18) { seen = true; break; }
      if (d > 75) continue;
      _v.set(hp.x, hp.y + 1.5, hp.z); _w.set(pp.x, pp.y + 1.2, pp.z);
      if (g.world.lineOfSight(_v, _w)) { seen = true; break; }
    }
    this.seen = seen;
    if (seen) { this.unseenT = 0; this.responseT = 0; this.lastKnown.copy(pp); }
    else {
      // police are still responding to the call: the search timer only starts once they arrive
      this.responseT = Math.max(0, (this.responseT || 0) - dt);
      if (this.responseT <= 0) this.unseenT += dt;
      if (this.unseenT > this.cooldown) { this.unseenT = 0; this.setLevel(this.level - 1, 'cooldown'); if (this.level === 0) return; }
    }
    this.flash = !seen;
    // dispatch
    this.units = this.units.filter((v) => g.vehicles.list.includes(v));
    this.foot = this.foot.filter((h) => !h.removed && !h.dead);
    const activeCars = this.units.filter((v) => !v.dead && v.driver && v.ai && !v.ai.deployed).length;
    this.spawnT -= dt;
    if (activeCars < CARS[this.level] && this.spawnT <= 0) { this.spawnT = 4 - this.level * 0.4; this.spawnUnit(); }
    // units left far behind are recycled so the dispatcher can send fresh ones nearby
    for (const v of [...this.units]) {
      const d = v.pos.distanceTo(pp);
      if (d > 230 && (v.dead || !v.ai || !v.ai.deployed)) { this.units.splice(this.units.indexOf(v), 1); g.vehicles.remove(v); }
    }
    for (const v of this.units) {
      if (!v.ai) continue;
      // police lose track: drive to the last known position instead of the player
      v.ai.chase = seen || this.unseenT < 3 ? p : null;
      if (!v.ai.chase && v.driver && !v.ai.deployed) { v.ai.searchTarget = this.lastKnown; v.ai.chase = { wpos: this.lastKnown, pos: this.lastKnown, vel: { x: 0, z: 0 }, dead: false, vehicle: null }; }
      // deploy officers when close to a player on foot
      if (!v.ai.deployed && v.driver && !v.dead && !p.vehicle && Math.abs(v.speed) < 3 && v.pos.distanceTo(pp) < 18 && this.foot.length < FOOT[this.level]) this.deploy(v);
      // the driver who just got out becomes a foot officer
      const d = v.ai.deployed && !v.driver ? null : null; void d;
    }
    for (const h of g.humans) if (h.copExiting && !h.vehicle && !h.combat) { this.arm(h); this.foot.push(h); h.copExiting = null; }
    // cops on foot left far behind give up
    for (const h of this.foot) if (h.pos.distanceTo(pp) > 140) { g.removeHuman(h); h.removed = true; }
    // siren audio from the nearest unit
    let near = null, nd = Infinity;
    for (const v of this.units) { if (!v.siren || v.dead) continue; const d = v.pos.distanceTo(g.camera.cam.position); if (d < nd) { nd = d; near = v; } }
    g.audio.setSiren(near ? near.pos : null, !!near, this.level >= 3);
  }
}
