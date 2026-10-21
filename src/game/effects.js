// Lightweight VFX: GPU point particles (sparks, smoke, fire, dust, blood mist), bullet
// tracers, muzzle flashes with a pooled point light, and explosions.
import * as THREE from 'three';
import { glowTexture } from '../world/textures.js';

const VS = `
attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;
void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const FS_SOFT = `
varying vec4 vC; uniform sampler2D map;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a); if (gl_FragColor.a < 0.004) discard;
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

class Particles {
  constructor(max, blending, map) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 4); this.s = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.kind = new Uint8Array(max); this.base = new Float32Array(max * 4); this.grow = new Float32Array(max); this.s0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_SOFT, uniforms: { map: { value: map }, scale: { value: 600 } }, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, kind = 0, grow = 0) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = size; this.s[i] = size; this.grow[i] = grow;
    this.base[i * 4] = r; this.base[i * 4 + 1] = g; this.base[i * 4 + 2] = b; this.base[i * 4 + 3] = a; this.kind[i] = kind;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // swap-remove
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; }
          for (let k = 0; k < 4; k++) this.base[i * 4 + k] = this.base[j * 4 + k];
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.s0[i] = this.s0[j]; this.grow[i] = this.grow[j]; this.kind[i] = this.kind[j];
          i--;
        }
        continue;
      }
      const k = this.kind[i];
      // 0 = ballistic (sparks/debris), 1 = buoyant (smoke/fire), 2 = drag (dust/mist)
      if (k === 0) this.v[i * 3 + 1] -= 9.8 * dt;
      else if (k === 1) { this.v[i * 3 + 1] += 1.2 * dt; this.v[i * 3] *= 1 - dt * 0.8; this.v[i * 3 + 2] *= 1 - dt * 0.8; }
      else { const d = 1 - dt * 3; this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - 1.5 * dt; this.v[i * 3 + 2] *= d; }
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.p[i * 3 + 1] < 0.02 && k === 0) { this.p[i * 3 + 1] = 0.02; this.v[i * 3 + 1] *= -0.3; this.v[i * 3] *= 0.6; this.v[i * 3 + 2] *= 0.6; }
      const t = this.life[i] / this.maxLife[i];
      this.s[i] = this.s0[i] * (1 + this.grow[i] * (1 - t));
      this.c[i * 4] = this.base[i * 4]; this.c[i * 4 + 1] = this.base[i * 4 + 1]; this.c[i * 4 + 2] = this.base[i * 4 + 2];
      this.c[i * 4 + 3] = this.base[i * 4 + 3] * (k === 1 ? Math.min(1, (1 - t) * 6) * t : t);
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'rgba', 'size']) this.geo.attributes[a].needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const glow = glowTexture();
    this.add = new Particles(1500, THREE.AdditiveBlending, glow);
    this.norm = new Particles(1500, THREE.NormalBlending, smokeTexture());
    scene.add(this.add.points, this.norm.points);
    // tracers
    this.maxTr = 64; this.trPos = new Float32Array(this.maxTr * 6); this.trCol = new Float32Array(this.maxTr * 8); this.trLife = new Float32Array(this.maxTr); this.trI = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false; scene.add(this.tracers);
    // muzzle flashes: billboard sprites + two pooled lights (fixed count avoids shader recompiles)
    this.flashMat = new THREE.SpriteMaterial({ map: flashTexture(), color: '#ffd28a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashes = []; for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(this.flashMat.clone()); s.visible = false; scene.add(s); this.flashes.push({ s, t: 0 }); }
    this.lights = []; for (let i = 0; i < 2; i++) { const l = new THREE.PointLight('#ffb45a', 0, 9, 2); scene.add(l); this.lights.push({ l, t: 0 }); }
    this.boom = new THREE.PointLight('#ff8a3a', 0, 40, 1.6); scene.add(this.boom); this.boomT = 0;
    this.li = 0; this.fi = 0;
  }
  muzzle(pos, dir) {
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.s.position.copy(pos).addScaledVector(dir, 0.08); f.s.scale.setScalar(0.35 + Math.random() * 0.2); f.s.material.rotation = Math.random() * 6.28; f.s.visible = true; f.t = 0.05;
    const L = this.lights[this.li++ % this.lights.length]; L.l.position.copy(pos); L.l.intensity = 25; L.t = 0.06;
    for (let i = 0; i < 4; i++) this.norm.emit(pos.x, pos.y, pos.z, dir.x * 1.5 + (Math.random() - 0.5) * 0.4, dir.y * 1.5 + 0.3, dir.z * 1.5 + (Math.random() - 0.5) * 0.4, 0.6, 0.18, 0.8, 0.8, 0.8, 0.25, 2, 3);
  }
  tracer(a, b) {
    const i = this.trI++ % this.maxTr;
    // only draw the far part of the segment so it reads as a streak
    const p0 = a.clone().lerp(b, 0.15);
    this.trPos.set([p0.x, p0.y, p0.z, b.x, b.y, b.z], i * 6); this.trLife[i] = 0.07;
  }
  sparks(p, n = 12, normal = null) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 4);
      if (normal && v.dot(normal) < 0) v.addScaledVector(normal, -2 * v.dot(normal));
      this.add.emit(p.x, p.y, p.z, v.x, v.y, v.z, 0.25 + Math.random() * 0.35, 0.05 + Math.random() * 0.04, 1, 0.75, 0.35, 1, 0);
    }
  }
  impact(p, normal, kind = 'concrete') {
    if (kind === 'metal') { this.sparks(p, 10, normal); }
    const col = kind === 'grass' ? [0.35, 0.3, 0.2] : [0.62, 0.6, 0.56];
    for (let i = 0; i < 6; i++) {
      const v = normal.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5));
      this.norm.emit(p.x, p.y, p.z, v.x, v.y, v.z, 0.5 + Math.random() * 0.5, 0.12 + Math.random() * 0.1, col[0], col[1], col[2], 0.7, 2, 3);
    }
    if (kind !== 'metal') this.sparks(p, 3, normal);
  }
  // stylised, low-gore hit puff
  blood(p, dir) {
    for (let i = 0; i < 7; i++) {
      const v = dir.clone().multiplyScalar(1.2 + Math.random() * 1.5).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5));
      this.norm.emit(p.x, p.y, p.z, v.x, v.y, v.z, 0.35 + Math.random() * 0.3, 0.1 + Math.random() * 0.08, 0.45, 0.03, 0.03, 0.75, 2, 2);
    }
  }
  smoke(p, amount = 1) {
    this.norm.emit(p.x + (Math.random() - 0.5) * 0.4, p.y, p.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.8 + Math.random(), (Math.random() - 0.5) * 0.4, 2.5 + Math.random() * 1.5, 0.6 * amount, 0.18, 0.18, 0.19, 0.45, 1, 4);
  }
  fire(p) {
    this.add.emit(p.x + (Math.random() - 0.5) * 0.8, p.y, p.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.5, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.4, 0.7, 1, 0.45, 0.12, 0.9, 1, 1);
  }
  dust(p, n = 4) {
    for (let i = 0; i < n; i++) this.norm.emit(p.x, p.y + 0.1, p.z, (Math.random() - 0.5) * 1.5, Math.random() * 0.6, (Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 0.6, 0.3, 0.45, 0.43, 0.4, 0.35, 2, 4);
  }
  explosion(p) {
    for (let i = 0; i < 70; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 7);
      this.add.emit(p.x, p.y, p.z, v.x, v.y * 0.7, v.z, 0.5 + Math.random() * 0.6, 1.4 + Math.random(), 1, 0.5 + Math.random() * 0.2, 0.15, 1, 1, 2);
    }
    for (let i = 0; i < 50; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.3, Math.random() - 0.5).normalize().multiplyScalar(1 + Math.random() * 3);
      this.norm.emit(p.x, p.y + 0.5, p.z, v.x, v.y, v.z, 3 + Math.random() * 3, 1.6 + Math.random(), 0.12, 0.11, 0.1, 0.7, 1, 3);
    }
    this.sparks(p, 60);
    this.boom.position.copy(p); this.boom.intensity = 300; this.boomT = 0.6;
  }
  update(dt, camera, viewportH) {
    const sc = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.add.mat.uniforms.scale.value = sc; this.norm.mat.uniforms.scale.value = sc;
    this.add.update(dt); this.norm.update(dt);
    for (let i = 0; i < this.maxTr; i++) {
      this.trLife[i] = Math.max(0, this.trLife[i] - dt); const a = this.trLife[i] / 0.07;
      this.trCol.set([1, 0.85, 0.5, a * 0.15, 1, 0.9, 0.6, a * 0.9], i * 8);
    }
    this.tracers.geometry.attributes.position.needsUpdate = true; this.tracers.geometry.attributes.color.needsUpdate = true;
    for (const f of this.flashes) if (f.s.visible) { f.t -= dt; if (f.t <= 0) f.s.visible = false; }
    for (const L of this.lights) { L.t -= dt; L.l.intensity = L.t > 0 ? 25 * (L.t / 0.06) : 0; }
    if (this.boomT > 0) { this.boomT -= dt; this.boom.intensity = Math.max(0, this.boomT / 0.6) * 300; } else this.boom.intensity = 0;
  }
}

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 32 + (Math.random() - 0.5) * 18, y = 32 + (Math.random() - 0.5) * 18, r = 12 + Math.random() * 10;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c); return t;
}
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32);
  for (let i = 0; i < 5; i++) { g.rotate(Math.PI * 2 / 5); const gr = g.createLinearGradient(0, 0, 30, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -4); g.lineTo(30, 0); g.lineTo(0, 4); g.fill(); }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 14); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,180,60,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64);
  return new THREE.CanvasTexture(c);
}
