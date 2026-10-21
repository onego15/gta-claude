// Missions: a tiny step-based scripting layer plus world markers and pickups.
import * as THREE from 'three';
import { Vehicle } from '../vehicles/vehicle.js';
import { Human } from '../actors/human.js';
import { CombatAI } from '../ai/combatAI.js';
import { GANG_IDS } from '../actors/charAssets.js';

// ---------- world markers --------------------------------------------------------------
function markerMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float t; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.25 * sin(t * 3.0 + vUv.y * 8.0)); gl_FragColor = vec4(color * 1.6, a); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}
export class Marker {
  constructor(scene, pos, { color = '#ffd23a', radius = 1.4, height = 2.2, icon = null } = {}) {
    this.group = new THREE.Group(); this.group.position.copy(pos); this.radius = radius; this.iconY = height + 0.8;
    this.mat = markerMaterial(color);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 40, 1, true), this.mat); cyl.position.y = height / 2; this.group.add(cyl);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.85, radius, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; this.group.add(ring);
    if (icon) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = color; g.beginPath(); g.arc(64, 64, 56, 0, 6.29); g.fill(); g.fillStyle = '#111'; g.font = 'bold 76px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, 64, 70);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, sizeAttenuation: false })); sp.scale.setScalar(0.045); sp.position.y = height + 0.8; this.group.add(sp); this.sprite = sp;
    }
    scene.add(this.group);
  }
  update(t) { this.mat.uniforms.t.value = t; if (this.sprite) this.sprite.position.y = this.iconY + Math.sin(t * 2) * 0.12; }
  contains(p, r = this.radius) { return Math.hypot(p.x - this.group.position.x, p.z - this.group.position.z) < r; }
  dispose() { this.group.removeFromParent(); }
}
// bouncing chevron above a target object (car / pickup / enemy)
export class Chevron {
  constructor(scene, color = '#ffd23a') {
    const s = new THREE.Shape(); s.moveTo(-0.35, 0.25); s.lineTo(0, -0.2); s.lineTo(0.35, 0.25); s.lineTo(0.35, 0.05); s.lineTo(0, -0.4); s.lineTo(-0.35, 0.05);
    this.mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    this.mesh.renderOrder = 10; scene.add(this.mesh);
  }
  update(pos, y, t, cam) { this.mesh.position.set(pos.x, y + 0.5 + Math.sin(t * 4) * 0.12, pos.z); this.mesh.rotation.y = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z); }
  dispose() { this.mesh.removeFromParent(); }
}

// ---------- pickups ---------------------------------------------------------------------
export class Pickup {
  constructor(game, pos, kind, amount, { respawn = 60 } = {}) {
    this.game = game; this.kind = kind; this.amount = amount; this.pos = pos.clone(); this.respawn = respawn; this.timer = 0;
    const color = { health: '#3cff6e', armor: '#4aa8ff', pistol: '#ffd23a', smg: '#ffb13a', cash: '#7dff5a', case: '#ffd23a' }[kind];
    this.group = new THREE.Group(); this.group.position.copy(pos);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 0.7; this.group.add(glow);
    let core;
    if (kind === 'health') { core = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: '#f2f2f2', emissive: '#ff2a2a', emissiveIntensity: 0.6 }); core.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.14), m), new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), m)); }
    else if (kind === 'armor') core = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.12), new THREE.MeshStandardMaterial({ color: '#1e2a3a', emissive: '#2a6aff', emissiveIntensity: 0.4 }));
    else if (kind === 'case') core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.12), new THREE.MeshStandardMaterial({ color: '#3a2a1a', metalness: 0.4, roughness: 0.5, emissive: '#ffb020', emissiveIntensity: 0.15 }));
    else if (kind === 'cash') core = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: '#4f8a3a', emissive: '#3aff3a', emissiveIntensity: 0.25 }));
    else core = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.08), new THREE.MeshStandardMaterial({ color: '#25272b', metalness: 0.8, roughness: 0.35, emissive: color, emissiveIntensity: 0.15 }));
    core.position.y = 0.7; this.core = core; this.group.add(core);
    game.scene.add(this.group);
  }
  update(dt, t) {
    if (this.timer > 0) { this.timer -= dt; this.group.visible = this.timer <= 0; return; }
    this.core.rotation.y = t * 2; this.core.position.y = 0.7 + Math.sin(t * 3) * 0.08;
    const p = this.game.player;
    if (!p.dead && !p.vehicle && p.pos.distanceTo(this.pos) < 1.2) {
      if (this.apply()) { this.game.audio.play('pickup', { volume: 0.8 }); this.timer = this.respawn; this.group.visible = false; if (this.respawn <= 0) this.dead = true; this.onTaken?.(); }
    }
  }
  apply() {
    const p = this.game.player, hud = this.game.hud;
    switch (this.kind) {
      case 'health': if (p.hp >= p.maxHp) return false; p.hp = Math.min(p.maxHp, p.hp + this.amount); hud.notify('Health restored'); return true;
      case 'armor': if (p.armor >= 100) return false; p.armor = Math.min(100, p.armor + this.amount); hud.notify('Body armor'); return true;
      case 'pistol': p.give('pistol', this.amount); hud.notify(`Pistol ammo +${this.amount}`); return true;
      case 'smg': p.give('smg', this.amount); p.equip('smg'); hud.notify(`SMG +${this.amount}`); return true;
      case 'cash': p.money += this.amount; hud.notify(`+$${this.amount}`); return true;
      case 'case': return true;
      default: return false;
    }
  }
  dispose() { this.group.removeFromParent(); }
}

// ---------- missions ---------------------------------------------------------------------
export class MissionSystem {
  constructor(game) {
    this.game = game; this.active = null; this.step = null; this.passed = new Set();
    this.objs = []; // things to clean up
    const s = game.city.sites;
    this.defs = [
      { id: 'wheels', title: 'Clean Getaway', giver: 'Marco', start: new THREE.Vector3(s.safehouse.x - 4, 0.15, s.safehouse.z + 1.5), run: (m) => this.wheels(m) },
      { id: 'docks', title: 'Dockside Sweep', giver: 'Marco', start: new THREE.Vector3(s.dockGate.x + 2, 0, s.dockGate.z + 6), run: (m) => this.docks(m) },
      { id: 'heat', title: 'Hot Package', giver: 'Lena', start: new THREE.Vector3(s.plaza.x + 8, 0.15, s.plaza.z - 10), run: (m) => this.heat(m) },
    ];
    this.starts = this.defs.map((d) => ({ def: d, marker: null }));
    this.refreshStarts();
  }
  available(d) { const i = this.defs.indexOf(d); return i === 0 || this.passed.has(this.defs[i - 1].id); }
  refreshStarts() {
    for (const st of this.starts) {
      const show = !this.active && this.available(st.def);
      if (show && !st.marker) st.marker = new Marker(this.game.scene, st.def.start, { color: '#ffd23a', radius: 0.9, height: 1.4, icon: st.def.giver[0] });
      if (!show && st.marker) { st.marker.dispose(); st.marker = null; }
    }
  }
  get target() { return this.step?.target || null; }

  start(def) {
    const g = this.game;
    this.active = def; this.refreshStarts(); this.startTime = g.time; this.timer = null;
    g.hud.bigMessage(def.title, 'MISSION', '#ffd23a', 2.6);
    g.audio.play('pickup', { volume: 0.6, rate: 0.7 });
    def.run(this);
  }
  setStep(text, target = null, update = null, opts = {}) {
    this.step = { text, target, update, ...opts };
    this.game.hud.objective(text);
  }
  cleanup() {
    for (const o of this.objs) { if (o instanceof Vehicle) { if (o !== this.game.player.vehicle) { o.persistent = false; } } else if (o instanceof Human) { if (!o.dead) this.game.removeHuman(o); } else o.dispose?.(); }
    this.objs = []; this.chev?.dispose(); this.chev = null; this.marker?.dispose(); this.marker = null;
  }
  pass(reward) {
    const g = this.game;
    this.passed.add(this.active.id); g.player.money += reward;
    g.hud.bigMessage('MISSION PASSED', `$${reward}`, '#ffd23a', 4); g.audio.play('pass', { volume: 1 });
    this.cleanup(); this.active = null; this.step = null; this.timer = null; g.hud.objective(''); this.refreshStarts();
    if (this.passed.size === this.defs.length && !this.allDone) { this.allDone = true; setTimeout(() => g.hud.notify('All missions complete. Port Aurora is yours.'), 4500); }
  }
  fail(reason) {
    const g = this.game; if (!this.active) return;
    g.hud.bigMessage('MISSION FAILED', reason, '#ff4a3a', 4); g.audio.play('fail', { volume: 0.9 });
    this.cleanup(); this.active = null; this.step = null; this.timer = null; g.hud.objective(''); this.refreshStarts();
  }

  update(dt) {
    const g = this.game, p = g.player, t = g.time;
    for (const st of this.starts) if (st.marker) {
      st.marker.update(t);
      if (!this.active && !p.dead && g.state === 'play' && st.marker.contains(p.wpos, 1.5) && (!p.vehicle || st.def.id !== 'docks')) {
        if (g.wanted.level > 0) { if (!this._warnT || t - this._warnT > 4) { g.hud.notify('Lose the cops before starting a mission.'); this._warnT = t; } }
        else this.start(st.def);
      }
    }
    if (!this.active || !this.step) return;
    this.marker?.update(t);
    if (this.timer !== null) { this.timer -= dt; if (this.timer <= 0) { this.fail("Time's up"); return; } }
    if (p.dead) return; // handled by wasted
    this.step.update?.(dt);
    if (this.chev) this.chev.mesh.visible = !!this.step?.chevronOn && !p.vehicle;
    if (this.chev && this.step?.chevronOn) { const o = this.step.chevronOn; this.chev.update(o.pos, (o.dims ? o.dims.H : 1.9) + o.pos.y, t, g.camera.cam); }
  }
  setMarker(pos, opts) { this.marker?.dispose(); this.marker = pos ? new Marker(this.game.scene, pos, opts) : null; }
  setChevron(obj, color) { if (!this.chev) this.chev = new Chevron(this.game.scene, color); this.chev.mesh.visible = !!obj; if (this.step) this.step.chevronOn = obj; }

  // ---- 1: drive a car to the docks --------------------------------------------------
  wheels() {
    const g = this.game, s = g.city.sites;
    const car = new Vehicle(g, 'sports', { color: '#0f6f7a', x: s.safehouse.x + 7, z: s.safehouse.z + 3.25, heading: -Math.PI / 2 });
    for (const o of g.vehicles.near(car.pos, 6)) if (!o.driver) g.vehicles.remove(o);
    g.vehicles.add(car); car.persistent = true; car.input.handbrake = true; car.missionCar = true; this.objs.push(car);
    g.hud.subtitle('Marco: "Buyer\'s waiting at the docks. Take the Vortex — and don\'t scratch the paint."', 5);
    const dest = new THREE.Vector3(s.dockGate.x - 22, 0, s.dockGate.z - 4);
    const getIn = () => {
      this.setStep('Get in the ~y~Vortex~w~.', car.pos, () => {
        if (car.dead) return this.fail('The car was destroyed');
        if (p().vehicle === car && p().seatState === 'seated') drive();
      });
      this.setChevron(car, '#4ad7ff'); this.setMarker(null);
    };
    const p = () => g.player;
    const drive = () => {
      if (this.timer === null) this.timer = 140;
      this.setChevron(null);
      this.setMarker(dest, { color: '#ffd23a', radius: 3.2, height: 1.6 });
      this.setStep('Drive the Vortex to the ~y~docks~w~.', dest, () => {
        if (car.dead) return this.fail('The car was destroyed');
        if (p().vehicle !== car) return getIn();
        if (this.marker.contains(car.pos, 3.4)) {
          if (Math.abs(car.speed) < 1.5) { this.pass(500 + Math.round(car.hp / 10)); car.persistent = false; }
          else g.hud.help('Stop inside the marker.');
        }
      });
    };
    getIn();
  }

  // ---- 2: gunfight at the container yard -------------------------------------------
  docks() {
    const g = this.game, y = g.city.sites.docks.yard;
    g.player.give('smg', 90); g.player.equip('smg');
    g.hud.subtitle('Marco: "The Vipers are sitting on our shipment in the container yard. Clear them out. Here — take the SMG."', 6);
    const enemies = [];
    const rnd = Math.random;
    const spots = g.coverSpots(new THREE.Vector3((y.x0 + y.x1) / 2, 0, (y.z0 + y.z1) / 2), 40);
    for (let i = 0; i < 7; i++) {
      const c = spots[(i * 5 + 3) % spots.length];
      const x = c ? (c.x0 + c.x1) / 2 + (rnd() - 0.5) * 2 : y.x0 + rnd() * (y.x1 - y.x0);
      const z = c ? c.z1 + 1 : y.z0 + rnd() * (y.z1 - y.z0);
      const h = new Human(g, GANG_IDS[i % GANG_IDS.length], { x, z, heading: rnd() * 6, team: 'gang', hp: 90 });
      g.world.resolveCircle(h.pos, 0.5, {});
      g.addHuman(h); h.give(i % 3 === 0 ? 'smg' : 'pistol', 999); h.damageScale = 0.45;
      h.combat = null; h.guard = true; h.pose.mode = i % 2 ? 'fold' : 'talk';
      enemies.push(h); this.objs.push(h);
    }
    const yardC = new THREE.Vector3((y.x0 + y.x1) / 2, 0, (y.z0 + y.z1) / 2);
    const alert = () => { for (const e of enemies) if (!e.dead && !e.combat) { e.guard = false; e.combat = new CombatAI(g, e, { target: g.player, accuracy: 0.8, prefDist: 10 + rnd() * 10, useCover: true }); } };
    this.alertGang = alert;
    this.setStep('Kill the ~r~Vipers~w~ in the container yard.', yardC, () => {
      const pd = g.player.wpos.distanceTo(yardC);
      if (pd < 50 || enemies.some((e) => e.dead || e.hp < e.maxHp)) alert();
      const left = enemies.filter((e) => !e.dead).length;
      this.step.text = `Kill the ~r~Vipers~w~ in the container yard. (${left} left)`; g.hud.objective(this.step.text);
      if (left === 0) grab();
    }, { enemies });
    const grab = () => {
      const pos = yardC.clone(); pos.y = 0;
      const pk = new Pickup(g, pos, 'case', 1, { respawn: 0 }); this.objs.push(pk); g.pickups.push(pk);
      this.setStep('Grab the ~y~cash case~w~.', pos, () => { if (pk.dead) this.pass(1500); });
      this.setChevron(pk.group ? { pos: pk.pos, dims: { H: 1.2 } } : null);
    };
  }

  // ---- 3: pick up a package, escape the police --------------------------------------
  heat() {
    const g = this.game, s = g.city.sites;
    g.hud.subtitle('Lena: "Package is at the gas station on the south-east corner. Grab it and bring it to the safehouse. Quietly."', 6);
    const pkPos = new THREE.Vector3(s.gas.x + 6, 0.15, s.gas.z + 2);
    const pk = new Pickup(g, pkPos, 'case', 1, { respawn: 0 }); this.objs.push(pk); g.pickups.push(pk);
    this.setMarker(null);
    this.setStep('Pick up the ~y~package~w~ at the gas station.', pkPos, () => {
      if (pk.dead) {
        g.wanted.setLevel(3, 'mission');
        g.hud.subtitle('Lena: "It\'s a setup — cops everywhere! Get to the safehouse garage, it\'ll hide you."', 6);
        escape();
      }
    });
    this.setChevron({ pos: pkPos, dims: { H: 1.2 } });
    const garage = new THREE.Vector3(s.safehouse.x + 9, 0.15, s.safehouse.z + 0.5);
    const escape = () => {
      this.setChevron(null);
      this.setMarker(garage, { color: '#ffd23a', radius: 3.4, height: 1.6 });
      this.setStep('Escape the ~b~police~w~ and reach the ~y~safehouse garage~w~.', garage, () => {
        if (this.marker.contains(g.player.wpos, 3.6)) {
          g.wanted.setLevel(0, 'garage');
          g.hud.notify('The garage door rolls down. The heat is off.');
          this.pass(2500);
        }
      });
    };
  }
}
