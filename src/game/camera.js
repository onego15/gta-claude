// Third-person camera rig: free orbit on foot, over-the-shoulder when aiming, and a
// speed-sensitive chase camera in vehicles. Collides with buildings so it never clips.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();

export class CameraRig {
  constructor(game, cam) {
    this.game = game; this.cam = cam;
    this.yaw = Math.PI; this.pitch = -0.12; // yaw: camera looks along (sin yaw, cos yaw)
    this.dist = 4.3; this.curDist = 4.3; this.shakeAmt = 0; this.recoil = 0;
    this.pivot = new THREE.Vector3(); this.aimBlend = 0; this.carBlend = 0; this.lastLook = 0;
    this.fov = 58; this.sens = 0.0022;
    this.target = new THREE.Vector3();
    this.cinematic = null; // optional {pos, look} override (mission intro / death cam)
  }
  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }
  kick(a) { this.recoil += a; }
  // forward direction on the ground plane
  flatForward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  update(dt, input) {
    const g = this.game, p = g.player;
    const look = input.look;
    if (look.dx || look.dy) this.lastLook = g.time;
    this.yaw -= look.dx * this.sens * (this.aimBlend > 0.5 ? 0.6 : 1);
    this.pitch -= look.dy * this.sens * (this.aimBlend > 0.5 ? 0.6 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 0.85);
    // recoil climbs the view and recovers
    this.pitch += this.recoil * 0.6; this.recoil *= Math.exp(-dt * 18);
    const veh = p.vehicle && p.seatState === 'seated' ? p.vehicle : null;
    this.carBlend += ((veh ? 1 : 0) - this.carBlend) * Math.min(1, dt * 3);
    this.aimBlend += ((p.aiming && !veh ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 12);

    let desiredDist, height, side;
    if (veh) {
      // chase cam: auto-align behind the car when the player is not steering the view
      const sp = Math.abs(veh.speed);
      if (g.time - this.lastLook > 1.2 && sp > 2) {
        let target = veh.heading + (veh.speed < -1 ? Math.PI : 0);
        let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 2.6);
        this.pitch += (-0.2 - this.pitch) * Math.min(1, dt * 1.5);
      }
      desiredDist = veh.dims.L * 1.25 + 2.6 + sp * 0.05;
      height = veh.dims.H + 0.35; side = 0;
      this.pivot.lerp(_v.set(veh.pos.x, veh.pos.y + height, veh.pos.z), Math.min(1, dt * 14));
      this.fov += (60 + Math.min(16, sp * 0.4) - this.fov) * Math.min(1, dt * 3);
    } else {
      const a = this.aimBlend;
      desiredDist = THREE.MathUtils.lerp(p.crouch ? 3.6 : 4.2, 1.9, a);
      height = THREE.MathUtils.lerp(p.crouch ? 1.15 : 1.55, p.crouch ? 1.15 : 1.5, a);
      side = THREE.MathUtils.lerp(0.35, 0.62, a);
      const pp = p.wpos; _v.set(pp.x, pp.y + height, pp.z);
      this.pivot.lerp(_v, Math.min(1, dt * 20));
      this.fov += (THREE.MathUtils.lerp(58, 46, a) - this.fov) * Math.min(1, dt * 8);
    }
    // camera position: behind pivot, offset sideways (over the right shoulder)
    const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
    _d.set(Math.sin(this.yaw) * cp, sp2, Math.cos(this.yaw) * cp); // view dir
    const right = _t.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    // shoulder offset, shortened if a wall is beside the player
    let sideOk = side;
    if (side > 0) { const sh = g.world.raycast(this.pivot, right, side + 0.35, { ignoreLow: 1.6 }); if (sh) sideOk = Math.max(0, sh.dist - 0.35); }
    const origin = this.pivot.clone().addScaledVector(right, sideOk);
    // obstruction: pull the camera in front of walls
    const back = _d.clone().negate();
    const hit = g.world.raycast(origin, back, desiredDist + 0.3, { ignoreLow: 1.6 });
    let dist = desiredDist;
    if (hit) dist = Math.max(0.6, hit.dist - 0.35);
    // also keep clear of walls to the camera's sides (near-plane clipping)
    for (const sgn of [1, -1]) { const sv = right.clone().multiplyScalar(sgn); const tp = origin.clone().addScaledVector(back, dist); const sh = g.world.raycast(tp, sv, 0.4, { ignoreLow: 1.6 }); if (sh) dist = Math.max(0.6, dist - (0.4 - sh.dist) * 2); }
    // zoom in quickly, out slowly
    this.curDist += (dist - this.curDist) * Math.min(1, dt * (dist < this.curDist ? 20 : 4));
    const pos = origin.addScaledVector(back, this.curDist);
    pos.y = Math.max(pos.y, 0.35);
    // shake
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.15; pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s;
      this.shakeAmt *= Math.exp(-dt * 6);
    }
    if (this.cinematic) {
      this.cam.position.lerp(this.cinematic.pos, Math.min(1, dt * 2)); this.cam.lookAt(this.cinematic.look);
    } else {
      this.cam.position.copy(pos);
      this.target.copy(pos).addScaledVector(_d, 20);
      this.cam.lookAt(this.target);
    }
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }

  // world point under the crosshair (screen centre)
  aimPoint(maxDist = 150, ignore = null) {
    const g = this.game;
    const o = this.cam.position.clone(); const d = new THREE.Vector3(); this.cam.getWorldDirection(d);
    let best = maxDist;
    const wh = g.world.raycast(o, d, maxDist); if (wh) best = wh.dist;
    if (d.y < 0) best = Math.min(best, o.y / -d.y);
    for (const h of g.humans) { if (h === ignore || h.dead) continue; const r = h.raycast(o, d, best); if (r) best = Math.min(best, r.dist); }
    for (const v of g.vehicles.list) { if (v.pos.distanceToSquared(o) > (best + 6) ** 2) continue; const t = v.raycast(o, d, best); if (t !== null) best = Math.min(best, t); }
    return { point: o.addScaledVector(d, best), dist: best };
  }
}
