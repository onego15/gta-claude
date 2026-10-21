// Hitscan shooting shared by the player and NPCs.
import * as THREE from 'three';

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Combat {
  constructor(game) { this.game = game; }

  // Cast a shot. origin = muzzle, target = aim point. Returns hit description.
  fire(shooter, origin, target, def, { spread = def.spread, tracer = true } = {}) {
    const g = this.game;
    _d.subVectors(target, origin).normalize();
    // random cone spread
    if (spread > 0) {
      const u = new THREE.Vector3(-_d.z, 0, _d.x).normalize(), v = new THREE.Vector3().crossVectors(_d, u);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      _d.addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
    }
    const dir = _d.clone(); _o.copy(origin);
    let best = { dist: def.range, type: null };
    const wh = g.world.raycast(_o, dir, def.range);
    if (wh) best = { dist: wh.dist, type: 'world', normal: wh.normal, obj: wh.obj };
    if (dir.y < 0) { const tg = (_o.y - 0.0) / -dir.y; if (tg < best.dist) best = { dist: tg, type: 'ground', normal: new THREE.Vector3(0, 1, 0) }; }
    for (const h of g.humans) {
      if (h === shooter || h.dead || h.removed) continue;
      if (h.pos.distanceToSquared(_o) > (best.dist + 2) ** 2) continue;
      const r = h.raycast(_o, dir, best.dist);
      if (r && r.dist < best.dist) best = { dist: r.dist, type: 'human', target: h, head: r.head };
    }
    for (const v of g.vehicles.list) {
      if (v === shooter?.vehicle) continue;
      if (v.pos.distanceToSquared(_o) > (best.dist + 6) ** 2) continue;
      const t = v.raycast(_o, dir, best.dist);
      if (t !== null && t < best.dist) best = { dist: t, type: 'vehicle', target: v };
    }
    const point = _o.clone().addScaledVector(dir, best.dist);
    best.point = point; best.dir = dir;
    if (tracer) g.effects.tracer(origin, point);
    // apply
    if (best.type === 'human') {
      const h = best.target;
      const dmg = def.dmg * (best.head ? 2.6 : 1) * (shooter?.team === 'player' ? 1 : shooter?.damageScale ?? 0.55);
      g.effects.blood(point, dir);
      if (shooter === g.player) g.hud.hitMarker(h.hp - dmg <= 0);
      h.takeDamage(dmg, { from: shooter, dir, head: best.head });
    } else if (best.type === 'vehicle') {
      const v = best.target;
      g.effects.impact(point, dir.clone().negate(), 'metal');
      v.lastDamager = shooter;
      v.damage(def.dmg * 0.9, shooter);
      if (Math.random() < 0.35) g.audio.play('ricochet', { pos: point, volume: 0.5 });
      // bullets can hit the driver through the windows
      if (v.driver && Math.random() < 0.18 && v.driver !== shooter) v.driver.takeDamage(def.dmg * 0.6, { from: shooter, dir });
    } else if (best.type) {
      const kind = best.obj && /container|prop|pole|crate/.test(best.obj.kind || '') ? 'metal' : 'concrete';
      g.effects.impact(point, best.normal, kind);
      if (Math.random() < 0.15) g.audio.play('ricochet', { pos: point, volume: 0.35 });
    }
    // near-miss whizz / fear for anyone close to the bullet line
    g.onGunshot(shooter, origin, point);
    return best;
  }
}
