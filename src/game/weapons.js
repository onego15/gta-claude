// Weapon definitions, ammo bookkeeping and hand-held models (Kenney Weapon Pack, CC0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadGLB } from '../core/glb.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 34, rate: 0.2, mag: 12, spread: 0.010, range: 140, sound: 'pistol', auto: false, recoil: 0.03, model: 'pistol', reload: 1.35, len: 0.21 },
  smg: { name: 'SMG', dmg: 19, rate: 0.085, mag: 30, spread: 0.026, range: 110, sound: 'smg', auto: true, recoil: 0.016, model: 'uzi', reload: 1.7, len: 0.3 },
};

export class Weapon {
  constructor(type, reserve = 0) {
    this.type = type; this.def = WEAPONS[type];
    this.ammo = 0; this.reserve = reserve; this.cooldown = 0; this.reloading = 0;
  }
  addAmmo(n) { this.reserve += n; if (this.ammo === 0 && !this.reloading) this.finishReload(); }
  get canFire() { return this.cooldown <= 0 && this.reloading <= 0 && this.ammo > 0; }
  startReload() {
    if (this.reloading > 0 || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = this.def.reload; return true;
  }
  finishReload() { const need = this.def.mag - this.ammo; const take = Math.min(need, this.reserve); this.ammo += take; this.reserve -= take; }
  update(dt) {
    this.cooldown -= dt;
    if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) { this.reloading = 0; this.finishReload(); } }
  }
  consume() { this.ammo--; this.cooldown = this.def.rate; }
}

const models = {};
export async function loadWeapons() {
  const loader = new GLTFLoader();
  const metal = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.85 });
  const grip = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8, metalness: 0.1 });
  for (const [name, len] of [['pistol', 0.19], ['uzi', 0.28]]) {
    const g = await loadGLB(loader, `${import.meta.env.BASE_URL}assets/weapons/${name}.glb`);
    const root = g.scene;
    root.traverse((o) => { if (o.isMesh) { o.material = /dark/.test(o.material.name) ? grip : metal; o.castShadow = true; } });
    // normalise: barrel along +z, grip down, scaled to real size, origin at the grip
    const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3());
    const s = len / size.z;
    const holder = new THREE.Group(); root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root);
    // grip sits at the rear-bottom of the model
    root.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y - (b2.max.y - b2.min.y) * 0.62, -b2.min.z - len * 0.22);
    holder.add(root);
    const tip = new THREE.Object3D(); tip.position.set(0, (b2.max.y - b2.min.y) * 0.25, len * 0.8); holder.add(tip); holder.userData.tip = tip;
    models[name] = holder;
  }
}

// Hand-space placement tuned for the Mixamo-style RightHand bone of the baked characters.
export const GRIP = { pos: new THREE.Vector3(0.0, -0.005, -0.015), rot: new THREE.Euler(-1.797, -0.053, -1.777) };

export function weaponModel(name) {
  const src = models[name]; const m = src.clone(true);
  m.userData.tip = m.children[1];
  const wrap = new THREE.Group(); wrap.add(m);
  wrap.position.copy(GRIP.pos); wrap.rotation.copy(GRIP.rot);
  wrap.userData.tip = m.userData.tip;
  return wrap;
}
