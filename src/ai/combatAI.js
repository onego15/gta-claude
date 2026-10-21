// On-foot combat behaviour for gang members and police officers: take cover behind
// containers/crates/cars, peek and fire in bursts, relocate when flanked, advance when the
// target is out of sight. Police at one star try to arrest instead of shooting.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class CombatAI {
  constructor(game, h, { target = null, accuracy = 1, prefDist = 14, useCover = true, police = false } = {}) {
    this.game = game; this.h = h; this.target = target;
    this.accuracy = accuracy; this.prefDist = prefDist; this.useCover = useCover; this.police = police;
    this.state = 'move'; this.timer = 0; this.cover = null; this.dest = null; this.relocT = 0;
    this.burst = 0; this.reaction = 0.4 + Math.random() * 0.5; this.seenT = 0; this.lastSeen = null; this.arrestT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
  }
  get tpos() { return this.target.wpos || this.target.pos; }

  findCover() {
    const g = this.game, h = this.h, tp = this.tpos;
    let best = null, bs = Infinity;
    const list = g.coverSpots(h.pos, 22);
    for (const c of list) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
      let dx = cx - tp.x, dz = cz - tp.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      // point on the far side of the box from the target
      const ext = Math.abs(dx) * (c.x1 - c.x0) / 2 + Math.abs(dz) * (c.z1 - c.z0) / 2;
      const px = cx + dx * (ext + 0.55), pz = cz + dz * (ext + 0.55);
      const dTarget = Math.hypot(px - tp.x, pz - tp.z);
      if (dTarget < 6 || dTarget > 34) continue;
      if (g.isCoverTaken(px, pz, h)) continue;
      const dSelf = Math.hypot(px - h.pos.x, pz - h.pos.z);
      const score = dSelf + Math.abs(dTarget - this.prefDist) * 0.6;
      if (score < bs) { bs = score; best = { x: px, z: pz, box: c }; }
    }
    return best;
  }
  coverValid() {
    if (!this.cover) return false;
    // still protected: the line from crouch height to the target is blocked nearby
    const tp = this.tpos; _a.set(this.cover.x, this.h.pos.y + 0.8, this.cover.z); _b.set(tp.x, tp.y + 1.2, tp.z);
    const d = _c.subVectors(_b, _a); const L = d.length(); d.divideScalar(L);
    const hit = this.game.world.raycast(_a, d, Math.min(L, 4));
    return !!hit;
  }

  update(dt) {
    const g = this.game, h = this.h;
    if (h.dead || !this.target) return;
    if (h.knocked > 0) { h.move(dt, 0, 0, null, 3); h.pose.speed = 0; return; }
    const tp = this.tpos;
    const eye = h.eyePos(_a); const tchest = (this.target.vehicle && this.target.seatState === 'seated') ? _b.set(tp.x, tp.y + 1.0, tp.z) : this.target.chestPos(_b);
    const dist = Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z);
    const los = dist < 70 && g.world.lineOfSight(eye, tchest);
    if (los) { this.seenT += dt; this.lastSeen = tp.clone(); } else this.seenT = 0;
    const faceT = Math.atan2(tp.x - h.pos.x, tp.z - h.pos.z);
    this.timer -= dt; this.relocT -= dt;
    h.aimPitch = THREE.MathUtils.clamp(Math.atan2(tchest.y - eye.y, dist) / 0.9, -1, 1);

    if (this.target.dead) { h.aiming = false; h.crouch = false; h.move(dt, 0, 0, faceT); h.pose.speed = 0; h.pose.mode = 'loco'; return; }

    // ---- police arrest (1 star): run up and cuff
    if (this.police && g.wanted.level <= 1 && !this.target.shotAtCopsRecently) {
      h.aiming = dist < 10; h.crouch = false; h.pose.mode = 'loco';
      const inCar = !!this.target.vehicle;
      const goal = inCar ? this.target.vehicle.doorWorld(_c) : tp;
      const gd = Math.hypot(goal.x - h.pos.x, goal.z - h.pos.z);
      const sp = gd > 1.4 ? (gd > 6 ? 5.6 : 2.5) : 0;
      const dx = (goal.x - h.pos.x) / (gd || 1), dz = (goal.z - h.pos.z) / (gd || 1);
      h.pose.speed = h.move(dt, dx * sp, dz * sp, gd < 6 ? faceT : null);
      const still = inCar ? Math.abs(this.target.vehicle.speed) < 1.2 : Math.hypot(this.target.vel.x, this.target.vel.z) < 2.5;
      if (gd < 1.8 && still) { this.arrestT += dt; if (this.arrestT > 1.3) g.bust(); } else this.arrestT = Math.max(0, this.arrestT - dt);
      return;
    }

    const w = h.weapon;
    const canShoot = () => w && los && this.seenT > this.reaction && dist < w.def.range * 0.6;
    const shoot = () => {
      if (!w) return;
      if (w.ammo <= 0) { if (w.startReload()) h.char.playOnce('Pistol_Reload', { part: 'upper', timeScale: 1.5 }); return; }
      if (!w.canFire) return;
      w.consume(); h.showGunT = 3;
      h.root.updateMatrixWorld(true);
      const muzzle = h.muzzleWorld(new THREE.Vector3());
      const tSpeed = this.target.vehicle ? Math.abs(this.target.vehicle.speed) : Math.hypot(this.target.vel.x, this.target.vel.z);
      const spread = (0.035 + dist * 0.0016 + tSpeed * 0.006 + (this.target.crouch ? 0.02 : 0)) / this.accuracy;
      g.combat.fire(h, muzzle, tchest.clone(), w.def, { spread });
      g.effects.muzzle(muzzle, _c.subVectors(tchest, muzzle).normalize());
      g.audio.play(w.def.sound, { pos: muzzle, volume: 0.9, reverb: 0.6 });
      h.char.playOnce('Pistol_Shoot', { part: 'upper', fade: 0.03, timeScale: 1.6 });
      w.cooldown = w.def.rate * (w.def.auto ? 1.2 : 2.2 + Math.random() * 1.5);
    };

    // ---- cover cycle
    if (this.state === 'move') {
      if (!this.dest || this.relocT <= 0) {
        this.relocT = 6 + Math.random() * 4;
        this.cover = this.useCover ? this.findCover() : null; this.bestD = undefined; this.noProg = 0;
        if (this.cover) this.dest = { x: this.cover.x, z: this.cover.z };
        else {
          // no cover: get to preferred range, slightly to the side
          const ang = faceT + Math.PI + this.strafe * (0.6 + Math.random() * 0.6);
          const r = THREE.MathUtils.clamp(this.prefDist, 6, Math.max(6, dist));
          this.dest = { x: tp.x + Math.sin(ang) * r, z: tp.z + Math.cos(ang) * r };
        }
      }
      const dx = this.dest.x - h.pos.x, dz = this.dest.z - h.pos.z, d = Math.hypot(dx, dz);
      h.crouch = false;
      h.aiming = los && d < 8;
      const sp = d > 0.6 ? (h.aiming ? 2.4 : 5.2) : 0;
      h.pose.mode = 'loco';
      h.pose.speed = h.move(dt, (dx / (d || 1)) * sp, (dz / (d || 1)) * sp, h.aiming ? faceT : null);
      if (h.aiming && canShoot() && Math.random() < 0.5) shoot();
      // blocked on the way (stacked containers, other people): fight from here
      if (d < (this.bestD ?? 1e9) - 0.3) { this.bestD = d; this.noProg = 0; } else this.noProg = (this.noProg || 0) + dt;
      if (this.noProg > 1.6) { this.noProg = 0; this.bestD = undefined; this.cover = null; this.dest = null; this.state = 'peek'; this.timer = 2 + Math.random() * 2; return; }
      if (d < 0.7) { this.bestD = undefined; this.state = this.cover ? 'cover' : 'peek'; this.timer = this.cover ? 0.8 + Math.random() * 1.5 : 2 + Math.random() * 2; }
      return;
    }
    if (this.state === 'cover') {
      h.crouch = true; h.aiming = false; h.pose.mode = 'crouch'; h.pose.speed = h.move(dt, 0, 0, faceT);
      if (!this.coverValid() || this.relocT < -6) { this.state = 'move'; this.dest = null; this.relocT = 0; return; }
      if (this.timer <= 0) { this.state = 'peek'; this.timer = 1.4 + Math.random() * 1.8; this.burst = 0; }
      return;
    }
    if (this.state === 'peek') {
      h.crouch = !!this.cover && Math.random() < 0; h.aiming = true; h.pose.mode = 'loco';
      // without cover, strafe a little while shooting
      let wx = 0, wz = 0;
      if (!this.cover) { const s = this.strafe * 1.6; wx = Math.cos(faceT) * s; wz = -Math.sin(faceT) * s; if (Math.random() < dt * 0.4) this.strafe *= -1; }
      h.pose.speed = h.move(dt, wx, wz, faceT);
      if (canShoot()) shoot();
      if (!los && this.timer < 0.8) {
        // lost sight: advance to the last seen position
        this.state = 'move'; this.dest = null; this.relocT = 0; this.prefDist = Math.max(6, this.prefDist - 4); return;
      }
      if (this.timer <= 0) {
        if (this.cover && this.coverValid()) { this.state = 'cover'; this.timer = 1 + Math.random() * 2; }
        else { this.state = 'move'; this.dest = null; this.relocT = 0; }
      }
    }
  }
}
