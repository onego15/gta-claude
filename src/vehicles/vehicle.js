// Arcade vehicle physics + presentation (wheels, suspension sway, lights, door, damage).
// Car models are built once per type/livery and cloned, so spawning traffic is cheap.
import * as THREE from 'three';
import { buildCar, CAR_TYPES } from './carModel.js';
import { groundHeight } from '../world/layout.js';

const templates = new Map();
function template(type, livery) {
  const key = `${type}|${livery || ''}`;
  if (!templates.has(key)) templates.set(key, buildCar(type, { color: '#ffffff', livery }));
  return templates.get(key);
}
export function prewarmCars() { for (const t of Object.keys(CAR_TYPES)) template(t, null); template('sedan', 'police'); template('sedan', 'taxi'); }

// Clone a template and remap the references we animate per instance.
function instantiateCar(type, color, livery) {
  const tpl = template(type, livery);
  const group = tpl.group.clone(true);
  const map = new Map(); const a = [], b = [];
  tpl.group.traverse((o) => a.push(o)); group.traverse((o) => b.push(o));
  a.forEach((o, i) => map.set(o, b[i]));
  const paint = tpl.paint.clone(); if (!livery) paint.color.set(color);
  const head = tpl.lights.head.clone(), tail = tpl.lights.tail.clone();
  const lightbar = tpl.lights.lightbar ? { red: tpl.lights.lightbar.red.clone(), blue: tpl.lights.lightbar.blue.clone() } : null;
  const taxiSign = tpl.lights.taxiSign ? tpl.lights.taxiSign.clone() : null;
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === tpl.paint) o.material = paint;
    else if (o.material === tpl.lights.head) o.material = head;
    else if (o.material === tpl.lights.tail) o.material = tail;
    else if (lightbar && o.material === tpl.lights.lightbar.red) o.material = lightbar.red;
    else if (lightbar && o.material === tpl.lights.lightbar.blue) o.material = lightbar.blue;
    else if (taxiSign && o.material === tpl.lights.taxiSign) o.material = taxiSign;
  });
  return {
    group, body: map.get(tpl.body), doorPivot: map.get(tpl.doorPivot), paint,
    wheels: tpl.wheels.map((w) => ({ ...w, pivot: map.get(w.pivot), spin: map.get(w.spin) })),
    lights: { head, tail, lightbar, taxiSign }, dims: tpl.dims, seat: tpl.seat, doorPos: tpl.doorPos, params: tpl.params,
  };
}

const _v = new THREE.Vector3();
let nextId = 1;

export class Vehicle {
  constructor(game, type, { color = '#8c1c1c', livery = null, x = 0, z = 0, heading = 0 } = {}) {
    this.id = nextId++;
    this.game = game; this.type = type; this.livery = livery;
    const m = this.model = instantiateCar(type, color, livery);
    this.group = m.group; this.group.position.set(x, groundHeight(x, z), z);
    this.group.traverse((o) => { if (o.isMesh) o.userData.vehicle = this; });
    this.P = m.params; this.dims = m.dims;
    this.heading = heading; this.vel = new THREE.Vector2(); this.angVel = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.steerAngle = 0; this.wheelRot = 0;
    this.driver = null; this.ai = null; // AI controller
    this.hp = 1000; this.dead = false; this.burnTimer = 0;
    this.police = livery === 'police'; this.siren = false; this.sirenT = Math.random() * 10;
    this.doorOpen = 0; this.doorTarget = 0;
    this.lightsOn = false; this.roll = 0; this.pitch = 0; this.accel = 0;
    this.maxSpeed = this.P.maxSpeed * 0.62; // m/s
    this.accelMax = 6.2 * this.P.power;
    this.radius = Math.hypot(this.dims.hx, this.dims.hz);
    this.lastHit = 0; this.slip = 0; this.persistent = false; this.age = 0;
    this.contacts = [];
  }
  get pos() { return this.group.position; }
  get speed() { return this.vel.x * Math.sin(this.heading) + this.vel.y * Math.cos(this.heading); }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  // local (x left, z forward) -> world
  toWorld(lx, ly, lz, out = new THREE.Vector3()) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return out.set(this.pos.x + lx * c + lz * s, this.pos.y + ly, this.pos.z - lx * s + lz * c);
  }
  toLocal(p, out = new THREE.Vector3()) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, c = Math.cos(this.heading), s = Math.sin(this.heading);
    return out.set(dx * c - dz * s, p.y - this.pos.y, dx * s + dz * c);
  }
  doorWorld(out = new THREE.Vector3()) { return this.toWorld(this.model.doorPos.x, 0, this.model.doorPos.z, out); }

  update(dt) {
    this.age += dt;
    const inp = this.dead ? { throttle: 0, brake: 0.3, steer: 0, handbrake: true } : this.input;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    let vf = this.vel.x * s + this.vel.y * c; // forward speed
    let vl = this.vel.x * c - this.vel.y * s; // lateral (local +x)
    // steering: less lock at speed
    const maxSteer = 0.62 / (1 + Math.abs(vf) / 15);
    this.steerAngle += (inp.steer * maxSteer - this.steerAngle) * Math.min(1, dt * 7);
    // longitudinal forces
    let a = 0;
    if (inp.throttle > 0) {
      if (vf < -0.5) a += 13 * inp.throttle;
      else a += inp.throttle * this.accelMax * Math.max(0, 1 - Math.max(0, vf) / this.maxSpeed) * (vf < 4 ? 1.25 : 1);
    }
    if (inp.brake > 0) {
      if (vf > 0.5) a -= 14 * inp.brake;
      else if (vf > -9) a -= 5.5 * inp.brake;
    }
    if (!inp.throttle && !inp.brake) a -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, 1.4);
    if (inp.handbrake) a -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, 6);
    a -= vf * Math.abs(vf) * 0.0028;
    vf += a * dt;
    this.accel = a;
    // lateral grip: lower with the handbrake -> drifts
    const grip = inp.handbrake ? 1.6 : this.dead ? 3 : 8.5;
    const oldVl = vl;
    vl *= Math.exp(-grip * dt);
    this.slip = Math.abs(oldVl);
    // yaw rate from bicycle model
    let yaw = -vf * Math.tan(this.steerAngle) / this.P.base;
    if (inp.handbrake) yaw *= 1.45;
    this.angVel += (yaw - this.angVel) * Math.min(1, dt * (inp.handbrake ? 3.5 : 9));
    // velocity stays in the old frame; rotating the body creates slip next frame
    this.vel.set(vf * s + vl * c, vf * c - vl * s);
    this.heading += this.angVel * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    this._collideWorld(dt);
    const gy = groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    this._visuals(dt, vf);
    if (this.hp <= 0 && !this.dead) this._startBurning();
    if (this.burnTimer > 0) { this.burnTimer -= dt; if (this.burnTimer <= 0) this.explode(); }
  }

  _collideWorld() {
    const C = this.game.world.obbContacts(this.pos.x, this.pos.z, this.dims.hx, this.dims.hz, this.heading, this.contacts);
    for (const k of C) {
      this.pos.x += k.nx * k.depth; this.pos.z += k.nz * k.depth;
      const vn = this.vel.x * k.nx + this.vel.y * k.nz;
      if (vn < 0) {
        this.vel.x -= k.nx * vn * 1.25; this.vel.y -= k.nz * vn * 1.25;
        // friction along the wall
        this.vel.multiplyScalar(0.985);
        const rx = k.px - this.pos.x, rz = k.pz - this.pos.z;
        this.angVel += (rx * k.nz - rz * k.nx) * vn * 0.04;
        this.onImpact(-vn, k.px, k.pz);
      }
    }
  }

  onImpact(impact, px, pz) {
    if (impact < 2.5) return;
    const now = this.game.time;
    if (impact > 4 && now - this.lastHit > 0.25) {
      this.lastHit = now;
      _v.set(px, this.pos.y + 0.6, pz);
      this.game.audio.play('impact', { pos: _v, volume: Math.min(1, impact / 14), rate: 0.9 + Math.random() * 0.2 });
      this.game.effects.sparks(_v, Math.min(30, impact * 2));
      if (this.driver === this.game.player) this.game.camera.shake(Math.min(0.6, impact * 0.03));
    }
    this.damage(Math.max(0, impact - 4) * 9);
  }

  damage(n, from) {
    if (this.dead) return;
    this.hp -= n;
    if (from && from === this.game.player && this.ai) this.ai.onAttacked?.(from);
  }
  _startBurning() { if (this.burnTimer <= 0) this.burnTimer = 4.5; }
  explode() {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.siren = false;
    const p = this.pos.clone(); p.y += 1;
    this.game.effects.explosion(p);
    this.game.audio.play('explosion', { pos: p, volume: 1.4, ref: 20, reverb: 0.8 });
    this.game.camera.shake(Math.max(0, 1.2 - p.distanceTo(this.game.camera.cam.position) / 40));
    this.paintBurnt();
    this.vel.x += (Math.random() - 0.5) * 2; this.angVel += (Math.random() - 0.5) * 1.5;
    this.game.onExplosion(p, this, this.lastDamager);
  }
  paintBurnt() {
    this.model.paint.color.set('#151312'); this.model.paint.map = null; this.model.paint.clearcoat = 0; this.model.paint.roughness = 0.9; this.model.paint.metalness = 0.1; this.model.paint.needsUpdate = true;
    this.model.lights.head.emissiveIntensity = 0; this.model.lights.tail.emissiveIntensity = 0;
  }

  _visuals(dt, vf) {
    const m = this.model;
    this.wheelRot += (vf / this.dims.wheelR) * dt;
    for (const w of m.wheels) {
      w.spin.rotation.x = this.wheelRot;
      if (w.front) w.pivot.rotation.y = -this.steerAngle;
    }
    // body sway from lateral / longitudinal acceleration
    const lat = vf * this.angVel;
    this.roll += (THREE.MathUtils.clamp(lat * 0.006, -0.07, 0.07) - this.roll) * Math.min(1, dt * 6);
    this.pitch += (THREE.MathUtils.clamp(-this.accel * 0.004, -0.05, 0.05) - this.pitch) * Math.min(1, dt * 6);
    m.body.rotation.z = this.roll; m.body.rotation.x = this.pitch;
    this.group.rotation.y = this.heading;
    // door
    this.doorOpen += THREE.MathUtils.clamp(this.doorTarget - this.doorOpen, -dt * 3.5, dt * 3.5);
    m.doorPivot.rotation.y = -this.doorOpen * 1.1;
    if (this.dead) return;
    // lights
    const braking = this.input.brake > 0.1 && vf > 0.3;
    const night = this.game.night;
    this.lightsOn = night > 0.35 && (this.driver || this.ai);
    m.lights.head.emissiveIntensity = this.lightsOn ? 4 : 0.05;
    m.lights.tail.emissiveIntensity = braking ? 4 : this.lightsOn ? 1.2 : 0.2;
    if (m.lights.taxiSign) m.lights.taxiSign.emissiveIntensity = night > 0.3 ? 2 : 0.2;
    if (m.lights.lightbar) {
      this.sirenT += dt;
      const ph = Math.floor(this.sirenT * 7) % 4;
      m.lights.lightbar.red.emissiveIntensity = this.siren && (ph === 0 || ph === 1) ? 8 : 0;
      m.lights.lightbar.blue.emissiveIntensity = this.siren && (ph === 2 || ph === 3) ? 8 : 0;
    }
    // damage smoke / fire
    if (this.hp < 450) {
      const front = this.toWorld(0, this.dims.H * 0.7, this.dims.hz * 0.6, _v);
      if (Math.random() < dt * (this.hp < 200 ? 30 : 10)) this.game.effects.smoke(front, this.hp < 200 ? 1.5 : 0.8);
      if (this.burnTimer > 0 && Math.random() < dt * 40) this.game.effects.fire(front);
    }
  }

  // world-space hit test against the oriented body box
  raycast(origin, dir, maxDist) {
    const o = this.toLocal(origin, new THREE.Vector3());
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const d = new THREE.Vector3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);
    const lo = [-this.dims.hx, 0.15, -this.dims.hz], hi = [this.dims.hx, this.dims.H, this.dims.hz];
    let t0 = 0, t1 = maxDist; const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < lo[a] || oo[a] > hi[a]) return null; continue; }
      let ta = (lo[a] - oo[a]) / dd[a], tb = (hi[a] - oo[a]) / dd[a]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
    }
    return t0;
  }

  dispose() {
    this.group.removeFromParent();
    this.model.paint.dispose(); this.model.lights.head.dispose(); this.model.lights.tail.dispose();
  }
}

// Oriented-box vs oriented-box (2D SAT). Returns {nx, nz, depth} pushing a away from b, or null.
export function obbOverlap(a, b) {
  const ax = [[Math.sin(a.heading), Math.cos(a.heading)], [Math.cos(a.heading), -Math.sin(a.heading)]];
  const bx = [[Math.sin(b.heading), Math.cos(b.heading)], [Math.cos(b.heading), -Math.sin(b.heading)]];
  const ah = [a.dims.hz, a.dims.hx], bh = [b.dims.hz, b.dims.hx];
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  let best = Infinity, nx = 0, nz = 0;
  for (const [x, z] of [...ax, ...bx]) {
    const ra = ah[0] * Math.abs(ax[0][0] * x + ax[0][1] * z) + ah[1] * Math.abs(ax[1][0] * x + ax[1][1] * z);
    const rb = bh[0] * Math.abs(bx[0][0] * x + bx[0][1] * z) + bh[1] * Math.abs(bx[1][0] * x + bx[1][1] * z);
    const d = dx * x + dz * z; const ov = ra + rb - Math.abs(d);
    if (ov <= 0) return null;
    if (ov < best) { best = ov; const sg = d > 0 ? -1 : 1; nx = x * sg; nz = z * sg; }
  }
  return { nx, nz, depth: best };
}
