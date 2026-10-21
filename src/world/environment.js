// Sky, sun/moon lighting, fog, sea and the day/night cycle.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { waterNormalTexture } from './textures.js';
import { setNightFactor } from './materials.js';
import { mulberry32 } from './layout.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Environment {
  constructor(renderer, scene, opts = {}) {
    this.renderer = renderer; this.scene = scene;
    this.time = opts.time ?? 17.6; // hours
    this.daySpeed = opts.daySpeed ?? 24 / (24 * 60); // game hours per real second (1 day = 24 min)
    this.sky = new Sky(); this.sky.scale.setScalar(4500); scene.add(this.sky);
    this.skyGain = { value: 0.55 };
    const patchSky = (sky) => {
      sky.material.uniforms.skyGain = this.skyGain;
      sky.material.fragmentShader = sky.material.fragmentShader.replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform float skyGain;').replace('gl_FragColor = vec4( texColor, 1.0 );', 'vec3 sc = texColor * skyGain; sc = sc / (1.0 + max(vec3(0.0), sc - 0.7) * 1.2); gl_FragColor = vec4( sc, 1.0 );');
    };
    patchSky(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    u.cloudCoverage.value = 0.32; u.cloudDensity.value = 0.45; u.cloudScale.value = 0.00022; u.cloudSpeed.value = 0.00003;

    // night dome with stars (drawn over the sky with fading opacity)
    this.night = this._nightDome(); scene.add(this.night);

    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; const S = opts.shadowExtent ?? 70;
    sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 1; sc.far = 600;
    this.sun.shadow.mapSize.set(opts.shadowMap ?? 2048, opts.shadowMap ?? 2048);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bcd4ff', '#5a5048', 0.8); scene.add(this.hemi);
    scene.fog = new THREE.Fog('#c9d6e0', 120, 900);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky); patchSky(this.envSky);
    this.envNight = this.night.clone(); this.envNight.material = this.night.material.clone(); this.envScene.add(this.envNight);
    this.envTarget = null; this.lastEnvTime = -99;

    this.water = this._water(); scene.add(this.water);
    this.hills = this._hills(); scene.add(this.hills);
    this.sunDir = new THREE.Vector3();
    this.nightFactor = 0;
    this.update(0, new THREE.Vector3());
  }

  _nightDome() {
    const g = new THREE.SphereGeometry(4000, 32, 16);
    const rnd = mulberry32(8);
    const n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2, v = Math.acos(rnd() * 0.95);
      pos[i * 3] = Math.cos(u) * Math.sin(v) * 3900; pos[i * 3 + 1] = Math.cos(v) * 3900; pos[i * 3 + 2] = Math.sin(u) * Math.sin(v) * 3900;
      const b = 0.4 + rnd() * 0.6; col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b * (0.9 + rnd() * 0.2);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uOpacity; varying vec3 vP;
        void main(){ float h = clamp(vP.y, -0.2, 1.0);
          vec3 c = mix(vec3(0.05,0.07,0.12), vec3(0.008,0.012,0.03), smoothstep(0.0, 0.6, h));
          c += vec3(0.12,0.08,0.05) * exp(-max(h,0.0)*14.0) * 0.6; // city glow on the horizon
          gl_FragColor = vec4(c, uOpacity); }`,
    });
    const dome = new THREE.Mesh(g, mat);
    dome.add(stars); dome.userData.stars = stars;
    dome.renderOrder = -1;
    return dome;
  }

  _water() {
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1); geo.rotateX(-Math.PI / 2);
    const nm = waterNormalTexture(); nm.repeat.set(220, 220);
    const mat = new THREE.MeshStandardMaterial({ color: '#16323d', roughness: 0.08, metalness: 0.0, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2 });
    const m = new THREE.Mesh(geo, mat); m.position.y = -1.0; m.receiveShadow = true; m.name = 'sea';
    this.waterNormal = nm;
    return m;
  }

  _hills() {
    // distant hills & skyline silhouettes on the horizon
    const g = new THREE.Group();
    const rnd = mulberry32(31);
    const mat = new THREE.MeshStandardMaterial({ color: '#4f5d55', roughness: 1, flatShading: true });
    const geo = new THREE.ConeGeometry(1, 1, 7, 1);
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.1;
      if (a > 0.3 && a < 1.9) continue; // open sea toward the south-east
      const d = 1500 + rnd() * 500, h = 80 + rnd() * 220, w = 260 + rnd() * 300;
      const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * d, -2, Math.sin(a) * d); m.scale.set(w, h, w * 0.7); m.rotation.y = rnd() * 3;
      g.add(m);
    }
    // a distant skyline cluster across the bay
    const bmat = new THREE.MeshStandardMaterial({ color: '#56606b', roughness: 0.9, emissive: '#ffd9a0', emissiveIntensity: 0 });
    this.skylineMat = bmat;
    for (let i = 0; i < 40; i++) {
      const a = -0.9 + rnd() * 0.5, d = 1300 + rnd() * 120;
      const w = 20 + rnd() * 30, h = 30 + rnd() * 120;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bmat); m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d); g.add(m);
    }
    return g;
  }

  // returns 0 (day) .. 1 (night)
  update(dt, focus) {
    this.time = (this.time + dt * this.daySpeed) % 24;
    const t = this.time;
    // sun path: rises ~6:00 in the east (+x), sets ~19:00 in the west
    const dayPhase = (t - 6.2) / 13.0; // 0 at sunrise, 1 at sunset
    const elev = Math.sin(dayPhase * Math.PI) * 62 * (Math.PI / 180);
    const az = Math.PI * (0.15 + dayPhase * 0.7);
    this.sunDir.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev) * 0.6 + 0.35).normalize();
    if (dayPhase < 0 || dayPhase > 1) this.sunDir.y = Math.min(this.sunDir.y, -0.05);
    const sunUp = smooth(-0.05, 0.12, this.sunDir.y);
    const night = 1 - smooth(-0.12, 0.08, this.sunDir.y);
    this.nightFactor = night;
    const u = this.sky.material.uniforms; u.sunPosition.value.copy(this.sunDir); u.time.value += dt;
    this.envSky.material.uniforms.sunPosition.value.copy(this.sunDir); this.envSky.material.uniforms.time.value = u.time.value;
    this.night.material.uniforms.uOpacity.value = night;
    this.night.userData.stars.material.opacity = night;
    this.envNight.material.uniforms.uOpacity.value = night;

    // light: warm low sun, cool moon at night
    const low = 1 - smooth(0.05, 0.45, this.sunDir.y);
    const sunCol = new THREE.Color().setRGB(1, 0.93 - low * 0.32, 0.84 - low * 0.5);
    const moonCol = new THREE.Color('#8fa6d8');
    const moonDir = new THREE.Vector3(-this.sunDir.x, Math.abs(this.sunDir.y) + 0.35, -this.sunDir.z).normalize();
    const dir = sunUp > 0.02 ? this.sunDir : moonDir;
    this.sun.color.copy(sunUp > 0.02 ? sunCol : moonCol);
    this.sun.intensity = (sunUp > 0.02 ? 3.2 * sunUp : 0.45 * night) * (this.sunScale ?? 2.2);
    this.hemi.intensity = 0.8 + 0.35 * night;
    this.hemi.color.set(night > 0.5 ? '#4a5a86' : '#bcd4ff').lerp(new THREE.Color('#ffc59a'), low * (1 - night) * 0.4);
    this.hemi.groundColor.set(night > 0.5 ? '#1a1612' : '#5a5048');
    // fog
    const fogDay = new THREE.Color('#a9bccb').lerp(new THREE.Color('#d9a27a'), low * (1 - night) * 0.6);
    const fogNight = new THREE.Color('#0d1320');
    this.scene.fog.color.copy(fogDay).lerp(fogNight, night);
    this.scene.fog.near = 160 + 80 * (1 - night); this.scene.fog.far = 1400 - 600 * night;
    // shadow camera follows the focus point
    const f = focus;
    this.sun.position.set(f.x + dir.x * 250, f.y + dir.y * 250, f.z + dir.z * 250);
    this.sun.target.position.copy(f);
    // texel snapping to reduce shimmering
    this.sun.target.updateMatrixWorld();
    this.water.position.x = Math.round(f.x / 40) * 40 * 0; // static
    this.waterNormal.offset.x += dt * 0.004; this.waterNormal.offset.y += dt * 0.0025;
    this.skylineMat.emissiveIntensity = night * 0.35;
    setNightFactor(night);
    // regenerate the environment map every ~0.15 game hours
    if (Math.abs(t - this.lastEnvTime) > 0.15 || !this.envTarget) {
      this.lastEnvTime = t;
      this.envSky.material.uniforms.showSunDisc.value = 0;
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = this.pmrem.fromScene(this.envScene, 0.02, 1, 2000);
      this.scene.environment = this.envTarget.texture;
      this.scene.environmentIntensity = (this.envScale ?? 0.42) * (0.35 + 0.65 * (1 - night));
    }
    return night;
  }
}
