// Game orchestration: owns the world, actors and systems, runs the frame loop and
// routes gameplay events (gunshots, kills, crimes, explosions) between systems.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCity } from '../world/city.js';
import { buildProps, windUniform } from '../world/props.js';
import { Environment } from '../world/environment.js';
import { Signals } from '../world/signals.js';
import { mulberry32, buildWalkGraph, ZONES, ROADS, ROAD_HALF, DOCK } from '../world/layout.js';
import { setNightFactor } from '../world/materials.js';
import { CollisionWorld } from '../core/collision.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { RoadNet } from '../ai/roadnet.js';
import { VehicleManager } from '../ai/traffic.js';
import { PedManager, PedAI } from '../ai/peds.js';
import { Effects } from './effects.js';
import { CameraRig } from './camera.js';
import { Combat } from './combat.js';
import { Player } from './player.js';
import { Wanted } from './wanted.js';
import { MissionSystem, Pickup } from './missions.js';
import { HUD } from '../ui/hud.js';
import { prewarmCars } from '../vehicles/vehicle.js';

const CIRCLE_H = { pole: 6, tree: 6, hydrant: 0.8, bin: 1.0, box: 1.1, fountain: 1.0 };
const AREA = { residential: 'Northshore', commercial: 'Market Row', downtown: 'Midtown', park: 'Aurora Park', police: 'Precinct 9', plaza: 'Civic Plaza', hospital: 'St. Clare', gas: 'Eastgate' };
const _v = new THREE.Vector3();

export class Game {
  constructor(container, qp) {
    this.qp = qp; this.time = 0; this.state = 'loading'; this.timeScale = 1;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, qp.has('lowres') ? 1 : 1.5));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.6;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 5000);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.5, 1.15); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    addEventListener('resize', () => this.resize());
    this.input = new Input(r.domElement);
    this.audio = new Audio();
  }
  resize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight); }

  // heavy world construction, called after assets load
  build() {
    const qp = this.qp;
    this.city = buildCity(); this.scene.add(this.city.group);
    this.props = buildProps(this.city, mulberry32(5)); this.scene.add(this.props.group);
    this.signals = new Signals();
    for (const c of this.city.circles) if (c.h === undefined) c.h = CIRCLE_H[c.kind] ?? 2;
    this.scene.add(this.signals.build(this.city.circles));
    this.world = new CollisionWorld(this.city.colliders, this.city.circles);
    this.env = new Environment(this.renderer, this.scene, { time: +(qp.get('time') || 17.4) });
    if (qp.has('freeze')) this.env.daySpeed = 0;
    this.roads = new RoadNet(); this.walk = buildWalkGraph();
    this.effects = new Effects(this.scene);
    this.camera = new CameraRig(this, this.cam);
    this.combat = new Combat(this);
    this.humans = [];
    this.hud = new HUD(this);
    prewarmCars();
    const s = this.city.sites;
    this.player = new Player(this, { x: s.safehouse.x - 13, z: s.safehouse.z + 1.5, heading: Math.PI / 2 });
    this.addHuman(this.player);
    this.player.give('pistol', 60);
    this.camera.yaw = Math.PI / 2; // look east along the sidewalk toward the first mission marker
    this.vehicles = new VehicleManager(this);
    this.peds = new PedManager(this);
    this.wanted = new Wanted(this);
    this.missions = new MissionSystem(this);
    this.pickups = [
      new Pickup(this, new THREE.Vector3(s.hospital.x + 3, 0.15, s.hospital.z - 2), 'health', 100, { respawn: 45 }),
      new Pickup(this, new THREE.Vector3(s.police.x - 6, 0.15, s.police.z - 2), 'armor', 100, { respawn: 90 }),
      new Pickup(this, new THREE.Vector3(s.safehouse.x - 2, 0.15, s.safehouse.z + 1.2), 'pistol', 36, { respawn: 60 }),
      new Pickup(this, new THREE.Vector3(s.park.x + 6, 0.15, s.park.z + 6), 'health', 50, { respawn: 60 }),
      new Pickup(this, new THREE.Vector3(s.docks.x + 20, 0, s.docks.z - 30), 'smg', 60, { respawn: 120 }),
    ];
    this.vehicles.initialFill();
    this.peds.initialFill();
    this.gpsRoute = null; this.gpsT = 0; this.night = 0;
    this.camera.update(0.016, { look: { dx: 0, dy: 0 } });
    this.env.update(0, this.player.pos);
    window.__game = this;
  }

  addHuman(h) { this.humans.push(h); return h; }
  removeHuman(h) {
    const i = this.humans.indexOf(h); if (i >= 0) this.humans.splice(i, 1);
    const j = this.peds?.list.indexOf(h); if (j >= 0) this.peds.list.splice(j, 1);
    if (h.vehicle && h.vehicle.driver === h) h.vehicle.driver = null;
    h.remove();
  }
  nearestWalkNode(p) { let b = 0, bd = Infinity; this.walk.nodes.forEach((n, i) => { const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; }
  coverSpots(p, r) {
    const out = this.city.covers.filter((c) => Math.abs((c.x0 + c.x1) / 2 - p.x) < r && Math.abs((c.z0 + c.z1) / 2 - p.z) < r);
    for (const v of this.vehicles.near(p, r)) if (Math.abs(v.speed) < 0.5 && !v.dead) { const e = Math.max(v.dims.hx, v.dims.hz) * 0.8; out.push({ x0: v.pos.x - e, x1: v.pos.x + e, z0: v.pos.z - e, z1: v.pos.z + e }); }
    return out;
  }
  isCoverTaken(x, z, self) { return this.humans.some((h) => h !== self && h.combat && h.combat.cover && Math.hypot(h.combat.cover.x - x, h.combat.cover.z - z) < 1.4); }

  // ---------------- events ---------------------------------------------------------------
  onHumanDamaged(h, from, n) {
    if (h === this.player) { this.hud.damageFlash(Math.min(0.8, n / 40)); this.camera.shake(0.12); return; }
    if (from === this.player) {
      if (h.team === 'civ') this.wanted.crime('assault', h.pos);
      else if (h.team === 'cop') this.wanted.crime('attackCop', h.pos);
      else if (h.team === 'gang' && h.guard) this.missions.alertGang?.();
    }
    if (h.ai instanceof PedAI && from) h.ai.alarm(from.wpos || from.pos, 2);
  }
  onHumanKilled(h, from, head) {
    if (h === this.player) { this.wasted(); return; }
    if (from === this.player) {
      if (h.team === 'civ') this.wanted.crime('kill', h.pos);
      else if (h.team === 'cop') this.wanted.crime('killCop', h.pos);
      if (h.team === 'gang' && Math.random() < 0.6) { const pk = new Pickup(this, h.pos.clone().setY(h.pos.y), 'cash', 40 + ((Math.random() * 80) | 0), { respawn: 0 }); this.pickups.push(pk); }
    }
    this.peds.alarm(h.pos, 25, 2);
    void head;
  }
  onGunshot(shooter, origin, point) {
    this.peds.alarm(origin, 45, 2);
    this.peds.alarm(point, 12, 2);
    if (shooter === this.player) {
      if (!this._shotCrimeT || this.time - this._shotCrimeT > 0.8) { this._shotCrimeT = this.time; this.wanted.crime('shoot', origin); }
      for (const h of this.humans) if (h.guard && h.pos.distanceTo(origin) < 70) this.missions.alertGang?.();
    }
  }
  onExplosion(p, vehicle, by) {
    this.peds.alarm(p, 60, 3);
    for (const h of [...this.humans]) {
      if (h.dead) continue; const d = h.wpos.distanceTo(p); if (d > 7) continue;
      const dir = _v.subVectors(h.wpos, p).setY(0).normalize().clone();
      h.takeDamage((7 - d) * 22, { from: by, dir });
      if (!h.dead && !h.vehicle) h.knockdown(dir);
    }
    for (const v of this.vehicles.list) {
      if (v === vehicle || v.dead) continue; const d = v.pos.distanceTo(p); if (d > 8) continue;
      v.damage((8 - d) * 80); const dir = _v.subVectors(v.pos, p).normalize(); v.vel.x += dir.x * (8 - d); v.vel.y += dir.z * (8 - d);
    }
    if (by === this.player) this.wanted.crime('explosion', p);
  }
  onCarjack(jacker, v, victim) {
    if (jacker !== this.player) return;
    if (!victim.dead) {
      victim.knockdown(new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)));
      const n = this.nearestWalkNode(victim.pos); victim.ai = new PedAI(this, victim, n); this.peds.list.push(victim); victim.isDriver = false;
      setTimeout(() => victim.ai?.alarm(jacker.wpos, 2), 2200);
      if (victim.team === 'cop') this.wanted.crime('attackCop');
    }
    this.wanted.crime(v.police ? 'copCar' : 'carjack', v.pos);
  }
  onHorn(v) { this.peds.alarm(v.pos, 6, 0); }
  onPlayerEnteredVehicle(v) {
    this.lastPlayerCar = v; v.ai = null; v.input.handbrake = false;
    if (v.spot) { v.spot.vehicle = null; v.spot = null; }
    if (v.parkedAt) v.parkedAt = null;
    const i = this.wanted.units.indexOf(v); if (i >= 0) this.wanted.units.splice(i, 1);
    v.persistent = true;
    if (this.lastPersistent && this.lastPersistent !== v && !this.lastPersistent.missionCar) this.lastPersistent.persistent = false;
    this.lastPersistent = v;
  }

  // ---------------- death / arrest -------------------------------------------------------
  wasted() {
    if (this.state !== 'play') return;
    this.state = 'dead'; this.deathT = 0; this.timeScale = 0.35;
    this.hud.bigMessage('WASTED', '', '#ff4a3a', 4.5); this.audio.play('fail', { volume: 0.9 });
    this.missions.fail('You died');
    this.respawnAt = this.city.sites.hospital; this.respawnCost = 100;
  }
  bust() {
    if (this.state !== 'play') return;
    this.state = 'busted'; this.deathT = 0; this.timeScale = 0.5;
    const p = this.player; p.controlsLocked = true; p.aiming = false;
    if (p.vehicle && p.seatState === 'seated') p.exitVehicle();
    this.hud.bigMessage('BUSTED', '', '#6aa4ff', 4.5); this.audio.play('fail', { volume: 0.9 });
    this.missions.fail('You were arrested');
    this.respawnAt = this.city.sites.police; this.respawnCost = 150;
  }
  respawn() {
    const p = this.player, at = this.respawnAt;
    this.wanted.reset();
    if (p.vehicle) { if (p.root.parent !== this.scene) this.scene.attach(p.root); if (p.vehicle.driver === p) p.vehicle.driver = null; p.vehicle = null; p.seatState = null; }
    p.dead = false; p.hp = p.maxHp; p.armor = 0; p.knocked = 0; p.controlsLocked = false; p.crouch = false; p.airborne = false;
    p.money = Math.max(0, p.money - this.respawnCost);
    if (this.state === 'busted') for (const w of Object.values(p.weapons)) w.reserve = Math.floor(w.reserve / 2);
    p.pos.set(at.x, 0.15, at.z + 1.5); p.vel.set(0, 0, 0); p.heading = 0; p.char.clearOneShot();
    p.char.mixer.stopAllAction(); p.char.actions.clear();
    p.root.rotation.set(0, 0, 0);
    this.camera.yaw = 0; this.camera.pitch = -0.12; this.camera.pivot.set(at.x, 1.6, at.z);
    // calm the city: clear panic, remove bodies nearby
    for (const h of this.peds.list) if (h.ai) { h.ai.state = 'walk'; }
    for (const h of [...this.humans]) if (h.dead && h !== p) this.removeHuman(h);
    this.state = 'play'; this.timeScale = 1;
    this.hud.notify(this.respawnAt === this.city.sites.hospital ? `Hospital bill: $${this.respawnCost}` : `Bail paid: $${this.respawnCost}`);
  }

  // ---------------- frame ----------------------------------------------------------------
  update(rawDt) {
    const input = this.input;
    const playing = this.state === 'play' || this.state === 'dead' || this.state === 'busted';
    if (!playing) return;
    const dt = Math.min(0.05, rawDt) * this.timeScale;
    this.time += dt;
    windUniform.value += dt;
    // death / arrest sequence
    if (this.state !== 'play') {
      this.deathT += rawDt;
      const f = this.deathT < 3 ? 0 : Math.min(1, (this.deathT - 3) / 1);
      this.hud.setFade(this.deathT > 4.6 ? Math.max(0, 1 - (this.deathT - 4.6) * 2) : f);
      if (this.deathT > 4 && !this._respawned) { this._respawned = true; this.respawn(); this.state = 'respawning'; }
    }
    if (this.state === 'respawning') { this.deathT += rawDt; this.hud.setFade(Math.max(0, 1 - (this.deathT - 4) * 2)); if (this.deathT > 4.6) { this.state = 'play'; this._respawned = false; this.hud.setFade(0); } }
    this.signals.update(dt);
    this.player.update(dt, input);
    this.vehicles.update(dt);
    this.peds.update(dt);
    // NPC combatants and seat transitions
    for (const h of this.humans) {
      if (h === this.player) continue;
      if (h.combat) h.combat.update(dt);
      else if (h.guard && !h.dead) { h.pose.speed = 0; }
      if (h.vehicle && h.seatState && h.seatState !== 'seated' && h.seatState !== 'deadSeat') h.updateSeat(dt);
    }
    for (const h of this.humans) for (const w of Object.values(h.weapons)) if (h !== this.player) w.update(dt);
    // animate humans with distance LOD
    const cp = this.cam.position;
    for (const h of this.humans) {
      if (h === this.player) continue;
      const d = h.wpos.distanceTo(cp);
      h.char.lod = d > 70 ? 4 : d > 35 ? 2 : 1;
      h.animate(dt);
    }
    // remove old corpses that aren't managed elsewhere
    for (const h of [...this.humans]) if (h.dead && h !== this.player && !h.ai && this.time - h.deadTime > 45) this.removeHuman(h);
    this.wanted.update(dt);
    this.missions.update(dt);
    for (const pk of this.pickups) pk.update(dt, this.time);
    this.pickups = this.pickups.filter((pk) => { if (pk.dead) { pk.dispose(); return false; } return true; });
    this.camera.update(rawDt * (this.state === 'play' ? 1 : 0.6), input);
    this.audio.setListener(this.cam);
    this.updateHelp();
    this.updateGps(dt);
    this.updateAudio(dt);
    this.night = this.env.update(dt, this.player.wpos);
    setNightFactor(this.night);
    for (const n of this.props.night) n.mat[n.prop] = n.base * this.night;
    this.effects.update(dt, this.cam, this.renderer.domElement.height);
    this.aimTarget = this.player.aiming ? this.findAimTarget() : null;
    this.areaName = this.areaAt(this.player.wpos);
    this.hud.update(dt);
    input.endFrame();
  }

  findAimTarget() {
    const o = this.cam.position, d = new THREE.Vector3(); this.cam.getWorldDirection(d);
    let best = null, bd = 120;
    for (const h of this.humans) { if (h === this.player || h.dead) continue; const r = h.raycast(o, d, bd); if (r) { bd = r.dist; best = h; } }
    if (best && this.world.raycast(o, d, bd)) return null;
    return best;
  }
  areaAt(p) {
    if (p.x < ROADS[0] - ROAD_HALF - 4 && p.z > DOCK.z0 - 5 && p.z < DOCK.z1 + 5) return 'Harbor Docks';
    for (let bx = 0; bx < 4; bx++) for (let bz = 0; bz < 4; bz++) if (p.x > ROADS[bx] && p.x < ROADS[bx + 1] && p.z > ROADS[bz] && p.z < ROADS[bz + 1]) return AREA[ZONES[bz][bx]];
    return 'Bayfront';
  }
  updateHelp() {
    const p = this.player; if (this.state !== 'play' || p.dead) return;
    if (!p.vehicle) {
      for (const v of this.vehicles.near(p.pos, 5)) {
        if (v.dead || Math.abs(v.speed) > 6) continue;
        if (v.doorWorld(_v).distanceTo(p.pos) < 3.5 || v.pos.distanceTo(p.pos) < v.dims.hz + 1) { this.hud.help(v.driver ? 'Press <b>F</b> to steal the car' : 'Press <b>F</b> to enter the car'); break; }
      }
    } else if (p.seatState === 'seated' && this.time - (this._carHelpT ?? -99) < 6) this.hud.help('<b>W/S</b> drive · <b>A/D</b> steer · <b>Space</b> handbrake · <b>H</b> horn · <b>F</b> exit');
    if (p.vehicle && p.seatState === 'seated' && this._carHelpT === undefined) this._carHelpT = this.time;
  }
  updateGps(dt) {
    this.gpsT -= dt; if (this.gpsT > 0) return; this.gpsT = 0.5;
    const t = this.missions.target; const p = this.player.wpos;
    if (!t || Math.hypot(t.x - p.x, t.z - p.z) < 20) { this.gpsRoute = t ? [{ x: p.x, z: p.z }, { x: t.x, z: t.z }] : null; return; }
    this.gpsRoute = this.roads.gps(p.x, p.z, t.x, t.z);
  }
  updateAudio() {
    const a = this.audio; if (!a.enabled) return;
    const p = this.player, v = p.vehicle && p.seatState !== 'opening' ? p.vehicle : null;
    if (v && !v.dead) {
      const sp = Math.abs(v.speed); const gear = sp / (v.maxSpeed / 4.2); const rpm = 0.3 + (gear % 1) * 0.7 + Math.min(1, gear) * 0.2;
      a.loop('engine', 'engine')?.set(0.28 + v.input.throttle * 0.2, 0.55 + rpm * 0.9);
      a.loop('skid', 'skid')?.set(Math.min(0.5, Math.max(0, v.slip - 2.5) * 0.08));
    } else { a.loops.engine?.set(0); a.loops.skid?.set(0); }
    // nearest AI car engine hum
    let near = null, nd = 30;
    for (const c of this.vehicles.list) { if (c === v || !c.driver || c.dead) continue; const d = c.pos.distanceTo(this.cam.position); if (d < nd) { nd = d; near = c; } }
    if (near) a.loopAt('traffic', 'engine', near.pos, 0.18, 0.5 + Math.abs(near.speed) * 0.03, 6); else a.loops.traffic?.set(0);
    a.setAmbience(this.night, !!v, v ? Math.abs(v.speed) : 0);
  }

  render() { this.composer.render(); }
}
