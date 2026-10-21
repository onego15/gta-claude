// A person in the world (player, pedestrian, gang member or police officer): wraps the
// animated Character with movement, collision, health, weapons and vehicle seating.
import * as THREE from 'three';
import { Character } from './character.js';
import { groundHeight } from '../world/layout.js';
import { Weapon, weaponModel } from '../game/weapons.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
let nextId = 1;
export const SEAT_DY = -0.42; // root offset below the seat surface for the Driving_Loop pose

export class Human {
  constructor(game, id, { x = 0, z = 0, heading = 0, team = 'civ', hp = 100 } = {}) {
    this.id = nextId++;
    this.game = game; this.charId = id; this.team = team;
    this.char = new Character(id, { idleClip: 'Idle_Loop' });
    this.root = this.char.root; this.pos = this.root.position;
    this.pos.set(x, groundHeight(x, z), z);
    this.char.heading = heading;
    this.root.traverse((o) => { if (o.isMesh) o.userData.human = this; });
    game.scene.add(this.root);
    this.vel = new THREE.Vector3(); this.radius = 0.33;
    this.hp = hp; this.maxHp = hp; this.armor = 0; this.dead = false; this.deadTime = 0;
    this.vehicle = null; this.seatState = null; // entering/exiting/seated
    this.weapon = null; this.weapons = {};
    this.aiming = false; this.aimPitch = 0; this.aimYaw = 0; this.showGunT = 0;
    this.pose = { speed: 0, aiming: false, pitch: 0, mode: 'loco' };
    this.knocked = 0; this.crouch = false; this.lastDamager = null; this.lastHitT = -99;
    this.stepPhase = 0; this.height = this.char.height || 1.75;
    this.gunMount = null;
  }
  get heading() { return this.char.heading; }
  set heading(v) { this.char.heading = v; }
  get alive() { return !this.dead; }
  // world position (the root is parented to the car body while seated)
  get wpos() { return this.vehicle && this.root.parent !== this.game.scene ? this.vehicle.pos : this.pos; }

  give(type, ammo) {
    if (!this.weapons[type]) this.weapons[type] = new Weapon(type, 0);
    this.weapons[type].addAmmo(ammo);
    if (!this.weapon) this.equip(type);
  }
  equip(type) {
    this.weapon = this.weapons[type] || null;
    if (this.gunMount) { this.gunMount.removeFromParent(); this.gunMount = null; }
    if (!this.weapon) return;
    const hand = this.char.bones.RightHand; if (!hand) return;
    const m = weaponModel(this.weapon.def.model);
    hand.add(m); this.gunMount = m; m.visible = false;
  }
  muzzleWorld(out = new THREE.Vector3()) {
    if (this.gunMount && this.gunMount.visible) { const tip = this.gunMount.userData.tip; return tip.getWorldPosition(out); }
    return out.copy(this.pos).add(_w.set(Math.sin(this.heading) * 0.4, 1.4, Math.cos(this.heading) * 0.4));
  }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.dead || this.knocked > 0 ? 0.3 : this.crouch ? 1.0 : this.height - 0.1), this.pos.z); }
  chestPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.dead || this.knocked > 0 ? 0.25 : this.crouch ? 0.8 : this.height * 0.72), this.pos.z); }

  // Move with desired horizontal velocity (wx, wz). Turns toward faceHeading if given.
  move(dt, wx, wz, faceHeading = null, accel = 14) {
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx - this.vel.x) * k; this.vel.z += (wz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let target = faceHeading;
    if (target === null && sp > 0.3) target = Math.atan2(this.vel.x, this.vel.z);
    if (target !== null) {
      let d = target - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
    }
    this.collide();
    return sp;
  }
  collide() {
    const y = this.pos.y;
    this.game.world.resolveCircle(this.pos, this.radius, { y, stepH: 0.4, height: 1.7 });
    // vehicles: push out of their oriented boxes
    for (const v of this.game.vehicles.near(this.pos, 6)) {
      const l = v.toLocal(this.pos, _v);
      const hx = v.dims.hx + this.radius, hz = v.dims.hz + this.radius;
      if (Math.abs(l.x) < hx && Math.abs(l.z) < hz && l.y < 1.8) {
        const sp = Math.abs(v.speed);
        if (sp > 4 && !this.dead && this !== v.driver && this.vehicle !== v) this.hitByCar(v, sp);
        const px = hx - Math.abs(l.x), pz = hz - Math.abs(l.z);
        if (px < pz) l.x = Math.sign(l.x || 1) * hx; else l.z = Math.sign(l.z || 1) * hz;
        const c = Math.cos(v.heading), s = Math.sin(v.heading);
        this.pos.x = v.pos.x + l.x * c + l.z * s; this.pos.z = v.pos.z - l.x * s + l.z * c;
      }
    }
    const gy = groundHeight(this.pos.x, this.pos.z);
    if (this.airborne) { if (this.pos.y <= gy && this.vy <= 0) { this.pos.y = gy; this.airborne = false; this.onLand?.(); } }
    else this.pos.y += (gy - this.pos.y) * 0.5;
  }

  hitByCar(v, sp) {
    if (this.knocked > 0 && this.game.time - this.lastHitT < 0.6) return;
    const dmg = sp * 5.5;
    const dir = new THREE.Vector3(v.vel.x, 0, v.vel.y).normalize();
    this.vel.set(dir.x * sp * 0.6, 0, dir.z * sp * 0.6);
    this.game.audio.play('thud', { pos: this.pos, volume: Math.min(1, sp / 10) });
    v.damage(sp * 0.5);
    this.takeDamage(dmg, { from: v.driver, dir, car: true });
    if (!this.dead) this.knockdown(dir);
  }

  knockdown(dir) {
    this.knocked = 2.6; this.lastHitT = this.game.time;
    this.heading = Math.atan2(-dir.x, -dir.z); // face the impact, fall backwards
    this.char.playOnce('Hit_Knockback', { fade: 0.08, hold: true, onDone: () => {
      if (this.dead) return;
      this.char.playOnce('LayToIdle', { fade: 0.2, onDone: () => { this.knocked = 0; } });
    } });
  }

  takeDamage(n, { from = null, dir = null, head = false, car = false } = {}) {
    if (this.dead) return;
    if (this.godMode) n = 0;
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.7); this.armor -= a; n -= a; }
    this.hp -= n; this.lastDamager = from; this.lastHitT = this.game.time;
    this.game.onHumanDamaged(this, from, n);
    if (this.hp <= 0) { this.die(dir, from, head); return; }
    if (!car && this.knocked <= 0 && !this.vehicle) this.char.playOnce(head ? 'Hit_Head' : 'Hit_Chest', { part: 'upper', fade: 0.06, timeScale: 1.4 });
  }

  die(dir, from, head) {
    this.dead = true; this.hp = 0; this.deadTime = this.game.time;
    if (this.gunMount) this.gunMount.visible = false;
    if (dir) this.heading = Math.atan2(-dir.x, -dir.z);
    if (this.vehicle && this.root.parent !== this.game.scene) {
      // killed at the wheel: slump over, stay in the seat
      if (this.char.bones.Spine1) this.char.bones.Spine1.rotation.x += 0.5;
      this.seatState = 'deadSeat';
    } else {
      if (this.vehicle) { this.game.scene.attach(this.root); this.vehicle = null; this.seatState = null; }
      this.char.playOnce('Death01', { fade: 0.1, hold: true });
    }
    this.game.onHumanKilled(this, from, head);
  }

  // ray vs capsule (+ head sphere). Returns {dist, head} or null
  raycast(origin, dir, maxDist) {
    if (this.dead || !this.root.parent) return null;
    let y0 = this.pos.y + 0.1, y1 = this.pos.y + this.height - 0.28, r = 0.27;
    let headC = null;
    if (this.vehicle) return null;
    if (this.knocked > 0) { y1 = this.pos.y + 0.5; r = 0.45; }
    else if (this.crouch) { y1 = this.pos.y + 1.0; headC = this.char.bones.Head ? this.char.bones.Head.getWorldPosition(new THREE.Vector3()) : null; }
    else headC = this.char.bones.Head ? this.char.bones.Head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(this.pos.x, this.pos.y + this.height - 0.12, this.pos.z);
    let best = null;
    if (headC) {
      headC.y += 0.06;
      const t = raySphere(origin, dir, headC, 0.14);
      if (t !== null && t < maxDist) best = { dist: t, head: true };
    }
    // infinite vertical cylinder test, then clamp to height span
    const ox = origin.x - this.pos.x, oz = origin.z - this.pos.z;
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a > 1e-8) {
      const b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t > 0 && t < maxDist) { const y = origin.y + dir.y * t; if (y >= y0 && y <= y1 && (!best || t < best.dist)) best = { dist: t, head: false }; }
      }
    }
    return best;
  }

  // per-frame animation update; subclasses / controllers fill this.pose first
  animate(dt) {
    const p = this.pose;
    if (this.knocked > 0) this.knocked -= dt;
    p.aiming = this.aiming && !this.dead && this.knocked <= 0;
    p.pitch = this.aimPitch;
    if (this.gunMount) {
      this.showGunT = this.aiming ? 2.5 : Math.max(0, this.showGunT - dt);
      this.gunMount.visible = !this.dead && !this.vehicle && this.showGunT > 0 && this.knocked <= 0;
    }
    this.char.update(dt, p);
    // footsteps
    if (!this.vehicle && !this.dead && p.speed > 0.5 && p.mode === 'loco') {
      const prev = this.stepPhase; this.stepPhase += dt * (p.speed < 2 ? 1.85 : p.speed < 5 ? 2.6 : 3.1);
      if (Math.floor(prev) !== Math.floor(this.stepPhase) && this.footsteps) this.game.audio.play('step', { pos: this.pos, volume: 0.25 + p.speed * 0.04, rate: 0.8 + Math.random() * 0.4 });
    }
  }

  // ---- vehicles ----------------------------------------------------------------------
  // Begin entering vehicle v (door must be reachable). Ejects an existing driver.
  enterVehicle(v) {
    if (v.dead) return false;
    this.vehicle = v; this.seatState = 'opening'; this.seatT = 0; this.aiming = false;
    this.vel.set(0, 0, 0);
    v.doorTarget = 1; v.pendingDriver = this;
    this.game.audio.play('door', { pos: v.pos, volume: 0.7 });
    this.char.playOnce('Interact', { part: 'upper', fade: 0.15, timeScale: 1.6 });
    return true;
  }
  exitVehicle() {
    const v = this.vehicle; if (!v || this.seatState !== 'seated') return false;
    this.seatState = 'exiting'; this.seatT = 0; v.doorTarget = 1;
    v.input.throttle = 0; v.input.steer = 0; v.input.brake = 0; v.input.handbrake = true;
    this.game.audio.play('door', { pos: v.pos, volume: 0.6 });
    return true;
  }
  // instantly seat (spawned drivers)
  seatIn(v) {
    this.vehicle = v; v.driver = this; this.seatState = 'seated';
    v.model.body.add(this.root);
    this.root.position.set(v.model.seat.x, v.model.seat.y + SEAT_DY, v.model.seat.z); this.heading = 0;
    this.pose.mode = 'drive'; this.vel.set(0, 0, 0);
  }
  // remove from vehicle at the door (ragdoll-free ejection used for carjacking)
  ejectFromVehicle() {
    const v = this.vehicle; if (!v) return;
    const p = v.doorWorld(new THREE.Vector3()); this.game.scene.add(this.root);
    if (this.dead) this.char.playOnce('Death01', { fade: 0.05, hold: true, startAt: 0.4 });
    this.pos.set(p.x, groundHeight(p.x, p.z), p.z); this.heading = v.heading - Math.PI / 2;
    this.root.rotation.set(0, this.heading, 0);
    if (v.driver === this) v.driver = null;
    this.vehicle = null; this.seatState = null; this.pose.mode = 'loco';
  }
  updateSeat(dt) {
    const v = this.vehicle; if (!v) return;
    this.seatT += dt;
    const seat = v.model.seat, door = v.model.doorPos;
    const body = v.model.body;
    if (this.seatState === 'opening') {
      // stand at the door facing the car
      const dp = v.doorWorld(_v);
      this.pos.x += (dp.x - this.pos.x) * Math.min(1, dt * 10); this.pos.z += (dp.z - this.pos.z) * Math.min(1, dt * 10);
      let d = (v.heading - Math.PI / 2) - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); this.heading += d * Math.min(1, dt * 12);
      this.pose.speed = 0; this.pose.mode = 'loco';
      if (this.seatT > 0.4) {
        if (v.driver && v.driver !== this) {
          const victim = v.driver; victim.ejectFromVehicle(); victim.onCarjacked?.(this);
          this.game.onCarjack(this, v, victim);
        }
        v.driver = this; v.pendingDriver = null;
        body.attach(this.root); // keep world transform, now local to the car body
        this.seatState = 'entering'; this.seatT = 0;
        this.enterFrom = this.root.position.clone();
      }
    } else if (this.seatState === 'entering') {
      const k = Math.min(1, this.seatT / 0.6), s = k * k * (3 - 2 * k);
      _v.set(seat.x, seat.y + SEAT_DY, seat.z);
      this.root.position.lerpVectors(this.enterFrom, _v, s);
      this.root.position.y = this.enterFrom.y + (_v.y - this.enterFrom.y) * s + Math.sin(s * Math.PI) * 0.12;
      this.heading = THREE.MathUtils.lerp(-Math.PI / 2, 0, s);
      this.pose.mode = k > 0.35 ? 'drive' : 'loco'; this.pose.speed = 0;
      if (k >= 1) { this.seatState = 'closing'; this.seatT = 0; v.doorTarget = 0; }
    } else if (this.seatState === 'closing') {
      this.pose.mode = 'drive';
      if (this.seatT > 0.3) { this.seatState = 'seated'; this.game.audio.play('door', { pos: v.pos, volume: 0.8, rate: 1.2 }); }
    } else if (this.seatState === 'seated') {
      this.pose.mode = 'drive'; this.heading = 0;
      this.root.position.set(seat.x, seat.y + SEAT_DY, seat.z);
    } else if (this.seatState === 'exiting') {
      this.pose.mode = 'drive';
      if (this.seatT > 0.3) {
        const k = Math.min(1, (this.seatT - 0.3) / 0.55), s = k * k * (3 - 2 * k);
        const from = _v.set(seat.x, seat.y + SEAT_DY, seat.z), to = _w.set(door.x - 0.15, 0, door.z);
        this.root.position.lerpVectors(from, to, s);
        this.root.position.y += Math.sin(s * Math.PI) * 0.12;
        this.heading = THREE.MathUtils.lerp(0, Math.PI / 2, s);
        this.pose.mode = k < 0.6 ? 'drive' : 'loco';
        if (k >= 1) {
          this.game.scene.attach(this.root);
          this.heading = this.root.rotation.y;
          this.pos.y = groundHeight(this.pos.x, this.pos.z);
          v.driver = null; v.doorTarget = 0; v.input.handbrake = true;
          this.vehicle = null; this.seatState = null; this.pose.mode = 'loco';
          this.game.audio.play('door', { pos: v.pos, volume: 0.8, rate: 1.2, detune: 0 });
          this.collide();
        }
      }
    }
  }

  remove() {
    this.root.removeFromParent();
    this.char.dispose();
    this.removed = true;
  }
}

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc; if (disc < 0) return null;
  const t = -b - Math.sqrt(disc); return t > 0 ? t : null;
}
