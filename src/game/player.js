// The player: on-foot movement relative to the camera, aiming/shooting, jumping,
// crouching, and driving.
import * as THREE from 'three';
import { Human } from '../actors/human.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3();

export class Player extends Human {
  constructor(game, opts) {
    super(game, 'player', { ...opts, team: 'player', hp: 100 });
    this.footsteps = true; this.money = 250; this.vy = 0; this.airborne = false;
    this.sprintStamina = 1;
    this.onLand = () => { this.char.playOnce('Jump_Land', { fade: 0.05, timeScale: 1.5 }); this.game.audio.play('step', { pos: this.pos, volume: 0.6, rate: 0.7 }); };
  }

  update(dt, input) {
    const g = this.game, cam = g.camera;
    for (const w of Object.values(this.weapons)) w.update(dt);
    if (this.dead) { this.pose.speed = 0; this.animate(dt); return; }
    if (this.controlsLocked) { this.pose.speed = 0; this.aiming = false; this.animate(dt); return; }

    if (this.vehicle) { this.updateDriving(dt, input); this.animate(dt); return; }

    // ---- on foot ----------------------------------------------------------------------
    if (this.knocked > 0) { this.move(dt, 0, 0, null, 4); this.pose.speed = 0; this.animate(dt); return; }
    const mv = input.move;
    const fwd = cam.flatForward(_v); const right = _a.set(-fwd.z, 0, fwd.x);
    let wx = fwd.x * mv.y - right.x * mv.x, wz = fwd.z * mv.y - right.z * mv.x;
    const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
    this.aiming = (input.btn(2) || this.forceAimT > 0) && !!this.weapon && !this.airborne;
    this.forceAimT = Math.max(0, (this.forceAimT || 0) - dt);
    if (input.hit('KeyC')) this.crouch = !this.crouch;
    let speed;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    if (this.aiming) speed = this.crouch ? 1.2 : 1.9;
    else if (this.crouch) speed = 1.6;
    else if (input.down('AltLeft')) speed = 1.45;
    else if (sprint && this.sprintStamina > 0.05) speed = 6.2;
    else speed = 3.6;
    if (sprint && wl > 0.1 && !this.aiming) { this.sprintStamina = Math.max(0, this.sprintStamina - dt * 0.12); if (this.crouch) this.crouch = false; }
    else this.sprintStamina = Math.min(1, this.sprintStamina + dt * 0.2);
    const face = this.aiming ? cam.yaw : null;
    if (this.airborne) {
      this.vy -= 13 * dt; this.pos.y += this.vy * dt;
      this.move(dt, this.vel.x, this.vel.z, null, 1);
    } else {
      const sp = this.move(dt, wx * speed, wz * speed, face);
      this.pose.speed = sp;
      if (input.hit('Space') && !this.crouch && !this.aiming) {
        this.airborne = true; this.vy = 4.6; this.char.playOnce('Jump_Start', { fade: 0.05, timeScale: 1.6 });
      }
    }
    this.pose.mode = this.airborne ? 'fall' : this.crouch ? 'crouch' : 'loco';
    // aim pitch follows the camera
    this.aimPitch = THREE.MathUtils.clamp(cam.pitch / 0.9, -1, 1);

    // weapons
    if (this.weapon) {
      if (input.hit('KeyQ') || input.mouse.wheel) this.cycleWeapon();
      if (input.hit('Digit1') && this.weapons.pistol) this.equip('pistol');
      if (input.hit('Digit2') && this.weapons.smg) this.equip('smg');
      if (input.hit('KeyR') && this.weapon.startReload()) this.onReload();
      const trig = this.weapon.def.auto ? input.btn(0) : input.btnHit(0);
      if (trig) {
        if (!this.aiming) { this.forceAimT = 0.6; this.heading = cam.yaw; }
        if (this.weapon.ammo <= 0 && this.weapon.reloading <= 0) {
          if (this.weapon.startReload()) this.onReload(); else if (input.btnHit(0)) g.audio.play('click', { pos: this.pos });
        } else if (this.weapon.canFire && this.aimSettled()) this.shoot();
      }
    }
    // vehicles
    if (input.hit('KeyF') || input.hit('Enter')) this.tryEnter();
    this.animate(dt);
  }

  aimSettled() { let d = this.game.camera.yaw - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) < 0.35; }

  cycleWeapon() {
    const keys = Object.keys(this.weapons); if (keys.length < 2) return;
    const i = keys.indexOf(this.weapon.type); this.equip(keys[(i + 1) % keys.length]);
    this.showGunT = 1.5; this.game.audio.play('click', { pos: this.pos, rate: 0.7 });
  }
  onReload() {
    this.char.playOnce('Pistol_Reload', { part: 'upper', fade: 0.1, timeScale: 2.0 / this.weapon.def.reload });
    this.game.audio.play('reload', { pos: this.pos, volume: 0.8 });
    this.showGunT = 2;
  }
  shoot() {
    const g = this.game, w = this.weapon;
    w.consume(); this.showGunT = 2.5;
    this.char.root.updateMatrixWorld(true);
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    const aim = g.camera.aimPoint(w.def.range, this).point;
    // keep the shot from going backwards when the target is behind the muzzle
    const toAim = _v.subVectors(aim, muzzle); if (toAim.dot(_a.set(Math.sin(this.heading), 0, Math.cos(this.heading))) < 0.2) aim.copy(muzzle).addScaledVector(_a, 30);
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    g.combat.fire(this, muzzle, aim, w.def, { spread: w.def.spread * (this.aiming ? 1 : 2.2) * (moving ? 1.6 : 1) * (this.crouch ? 0.7 : 1) });
    const dir = _v.subVectors(aim, muzzle).normalize();
    g.effects.muzzle(muzzle, dir);
    g.audio.play(w.def.sound, { volume: 0.9, reverb: 0.6 });
    g.camera.kick(w.def.recoil); g.camera.shake(0.05);
    if (!w.def.auto || Math.random() < 0.3) this.char.playOnce('Pistol_Shoot', { part: 'upper', fade: 0.03, timeScale: w.def.auto ? 2.5 : 1.6 });
    g.hud.crosshairKick();
    if (w.ammo === 0 && w.startReload()) this.onReload();
  }

  tryEnter() {
    const g = this.game;
    let best = null, bd = 4.5;
    for (const v of g.vehicles.near(this.pos, 8)) {
      if (v.dead || v.pendingDriver) continue;
      const d = v.doorWorld(_v).distanceTo(this.pos);
      const dc = v.pos.distanceTo(this.pos) - v.dims.hz;
      const dd = Math.min(d, dc + 0.5);
      if (dd < bd && Math.abs(v.speed) < 6) { bd = dd; best = v; }
    }
    if (best) { this.crouch = false; this.enterVehicle(best); }
  }

  updateDriving(dt, input) {
    const v = this.vehicle;
    if (this.seatState !== 'seated') { this.updateSeat(dt); this.pose.speed = 0; if (this.seatState === 'seated') this.game.onPlayerEnteredVehicle(v); return; }
    const mv = input.move;
    const sp = v.speed;
    v.input.steer = mv.x;
    if (mv.y > 0) { v.input.throttle = mv.y; v.input.brake = 0; }
    else if (mv.y < 0) { v.input.throttle = 0; v.input.brake = -mv.y; }
    else { v.input.throttle = 0; v.input.brake = 0; }
    v.input.handbrake = input.down('Space');
    if (input.hit('KeyH')) { this.game.audio.play('horn', { pos: v.pos, volume: 0.8, detune: 0 }); this.game.onHorn(v); }
    if (v.police && input.hit('KeyG')) v.siren = !v.siren;
    if ((input.hit('KeyF') || input.hit('Enter')) && Math.abs(sp) < 9) {
      if (Math.abs(sp) > 3) v.input.brake = 1;
      this.exitVehicle();
    }
    this.pose.speed = 0;
  }
}
