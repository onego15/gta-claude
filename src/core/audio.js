// WebAudio sound system. Gunshots, explosions, sirens, footsteps and the city ambience are
// synthesised at startup; engine / skid / impact loops are Kenney CC0 samples.
// Positional sounds use a simple distance + stereo-pan model relative to the camera.
import * as THREE from 'three';

const BASE = `${import.meta.env.BASE_URL}assets/audio/`;

export class Audio {
  constructor() {
    this.ctx = null; this.buffers = {}; this.enabled = false;
    this.listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };
    this.loops = {};
    this.volume = 0.8;
  }

  // Must be called from a user gesture.
  async start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    // simple reverb for gunshots (city echo)
    this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(1.6, 2.5);
    const vg = ctx.createGain(); vg.gain.value = 0.35; this.verb.connect(vg); vg.connect(this.master);
    this._synthAll();
    await Promise.all(['engine', 'skid', 'impact'].map(async (n) => {
      try { const r = await fetch(`${BASE}${n}.ogg`); this.buffers[n] = await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn('audio', n, e); }
    }));
    this.enabled = true;
    this._startAmbience();
  }

  _impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 600 ? i / 600 : 1); }
    return b;
  }
  _buf(sec, fn) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * sec), b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const st = {}; for (let i = 0; i < n; i++) d[i] = fn(i / sr, i, st);
    return b;
  }
  _synthAll() {
    const rnd = Math.random;
    // pistol: sharp crack + body thump, low-passed noise tail
    this.buffers.pistol = this._buf(0.5, (t, i, s) => {
      s.lp = s.lp || 0; const n = rnd() * 2 - 1; s.lp += (n - s.lp) * (t < 0.01 ? 0.9 : 0.25);
      const crack = n * Math.exp(-t * 90) * 1.0;
      const body = s.lp * Math.exp(-t * 14) * 0.9;
      const thump = Math.sin(2 * Math.PI * (120 - t * 160) * t) * Math.exp(-t * 30) * 0.8;
      return (crack + body + thump) * 0.9;
    });
    this.buffers.smg = this._buf(0.3, (t, i, s) => {
      s.lp = s.lp || 0; const n = rnd() * 2 - 1; s.lp += (n - s.lp) * 0.3;
      return (n * Math.exp(-t * 120) + s.lp * Math.exp(-t * 22) * 0.8 + Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 40) * 0.5) * 0.8;
    });
    this.buffers.explosion = this._buf(2.6, (t, i, s) => {
      s.lp = s.lp || 0; s.lp2 = s.lp2 || 0; const n = rnd() * 2 - 1; s.lp += (n - s.lp) * 0.06; s.lp2 += (s.lp - s.lp2) * 0.1;
      return (s.lp2 * 6 * Math.exp(-t * 1.6) + n * Math.exp(-t * 18) * 0.6 + Math.sin(2 * Math.PI * (45 - t * 10) * t) * Math.exp(-t * 3) * 0.7) * 0.9;
    });
    this.buffers.ricochet = this._buf(0.35, (t) => Math.sin(2 * Math.PI * (3200 - t * 5000) * t) * Math.exp(-t * 14) * 0.25 + (rnd() * 2 - 1) * Math.exp(-t * 60) * 0.3);
    this.buffers.thud = this._buf(0.18, (t, i, s) => { s.lp = s.lp || 0; s.lp += ((rnd() * 2 - 1) - s.lp) * 0.08; return s.lp * 3 * Math.exp(-t * 30); });
    this.buffers.step = this._buf(0.09, (t, i, s) => { s.lp = s.lp || 0; s.lp += ((rnd() * 2 - 1) - s.lp) * 0.35; return s.lp * Math.exp(-t * 60) * (t < 0.004 ? t / 0.004 : 1); });
    this.buffers.reload = this._buf(0.6, (t) => { const c1 = t < 0.05 ? (rnd() * 2 - 1) * Math.exp(-t * 80) : 0; const c2 = t > 0.42 && t < 0.5 ? (rnd() * 2 - 1) * Math.exp(-(t - 0.42) * 70) : 0; return (c1 + c2) * 0.6; });
    this.buffers.click = this._buf(0.05, (t) => (rnd() * 2 - 1) * Math.exp(-t * 200) * 0.5);
    this.buffers.door = this._buf(0.35, (t, i, s) => { s.lp = s.lp || 0; s.lp += ((rnd() * 2 - 1) - s.lp) * 0.12; return s.lp * 2.5 * Math.exp(-t * 18) + Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 25) * 0.4; });
    this.buffers.horn = this._buf(0.6, (t) => { const env = Math.min(1, t * 40) * Math.min(1, (0.6 - t) * 20); return (Math.sign(Math.sin(2 * Math.PI * 400 * t)) * 0.3 + Math.sign(Math.sin(2 * Math.PI * 500 * t)) * 0.3) * env * 0.35; });
    this.buffers.pickup = this._buf(0.4, (t) => { const f = t < 0.12 ? 880 : t < 0.24 ? 1175 : 1760; return Math.sin(2 * Math.PI * f * t) * Math.exp(-((t % 0.12)) * 10) * 0.25; });
    this.buffers.pass = this._buf(2.2, (t) => {
      const notes = [523, 659, 784, 1047, 784, 1047]; const k = Math.min(notes.length - 1, Math.floor(t / 0.16)); const lt = t - k * 0.16;
      const f = notes[k]; const env = k === notes.length - 1 ? Math.exp(-lt * 1.5) : Math.exp(-lt * 6);
      return (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 0.5 * t)) * env * 0.18;
    });
    this.buffers.fail = this._buf(2.0, (t) => { const f = 220 * Math.pow(0.5, t / 1.8); return (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sign(Math.sin(2 * Math.PI * f * 1.01 * t))) * Math.exp(-t * 1.2) * 0.2; });
    this.buffers.hit = this._buf(0.08, (t) => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 60) * 0.3);
    // ambience: brown noise "city bed" with slow swells
    this.buffers.city = this._buf(8, (t, i, s) => { s.b = s.b || 0; s.b = (s.b + 0.02 * (rnd() * 2 - 1)) / 1.02; const sw = 0.7 + 0.3 * Math.sin(t * 0.8) * Math.sin(t * 0.33 + 1); return s.b * 3.2 * sw; });
    this.buffers.wind = this._buf(6, (t, i, s) => { s.lp = s.lp || 0; s.lp += ((rnd() * 2 - 1) - s.lp) * 0.02; return s.lp * 2.0 * (0.6 + 0.4 * Math.sin(t * 1.05)); });
  }

  // listener follows the camera
  setListener(cam) {
    this.listener.pos.copy(cam.position);
    this.listener.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
  }

  _spatial(pos, ref = 8, maxD = 260) {
    if (!pos) return { gain: 1, pan: 0 };
    const d = pos.distanceTo(this.listener.pos);
    const gain = d < ref ? 1 : Math.max(0, ref / d - ref / maxD);
    const dir = new THREE.Vector3().subVectors(pos, this.listener.pos); const len = dir.length() || 1;
    return { gain, pan: THREE.MathUtils.clamp(dir.dot(this.listener.right) / len, -1, 1) * 0.8, d };
  }

  play(name, { pos = null, volume = 1, rate = 1, ref = 8, reverb = 0, detune = 0.05 } = {}) {
    if (!this.enabled || !this.buffers[name]) return;
    const ctx = this.ctx; const sp = this._spatial(pos, ref);
    if (sp.gain * volume < 0.005) return;
    const src = ctx.createBufferSource(); src.buffer = this.buffers[name];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * detune);
    const g = ctx.createGain(); g.gain.value = sp.gain * volume;
    const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan;
    // distant sounds are muffled
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sp.d ? THREE.MathUtils.clamp(16000 - sp.d * 90, 1200, 16000) : 16000;
    src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this.sfx);
    if (reverb) { const rg = ctx.createGain(); rg.gain.value = reverb * Math.min(1, sp.gain * 2 + 0.2) * volume; pan.connect(rg); rg.connect(this.verb); }
    src.start();
    return src;
  }

  // persistent loop with live volume / rate / pan control
  loop(key, name, { volume = 0, rate = 1, bus = 'sfx' } = {}) {
    if (!this.enabled || !this.buffers[name]) return null;
    if (this.loops[key]) return this.loops[key];
    const ctx = this.ctx; const src = ctx.createBufferSource(); src.buffer = this.buffers[name]; src.loop = true; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = volume; const pan = ctx.createStereoPanner();
    src.connect(g); g.connect(pan); pan.connect(bus === 'amb' ? this.amb : this.sfx); src.start();
    const L = { src, g, pan, set: (v, r, p = 0) => {
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(Math.max(0, v), t, 0.05);
      if (r !== undefined) src.playbackRate.setTargetAtTime(r, t, 0.05);
      pan.pan.setTargetAtTime(p, t, 0.05);
    } };
    this.loops[key] = L; return L;
  }
  loopAt(key, name, pos, volume, rate, ref = 10) {
    const L = this.loop(key, name); if (!L) return; const sp = this._spatial(pos, ref); L.set(volume * sp.gain, rate, sp.pan);
  }

  _startAmbience() {
    this.loop('city', 'city', { volume: 0.35, bus: 'amb' });
    this.loop('wind', 'wind', { volume: 0.12, bus: 'amb' });
    // siren: two detuned oscillators with a wailing LFO
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; const o2 = ctx.createOscillator(); o2.type = 'square';
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = 380;
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency); o1.frequency.value = 980; o2.frequency.value = 985;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0; const pan = ctx.createStereoPanner();
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(pan); pan.connect(this.sfx);
    o1.start(); o2.start(); lfo.start();
    this.siren = { g, pan, lfo };
  }
  setSiren(pos, on, fast = false) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    if (!on || !pos) { this.siren.g.gain.setTargetAtTime(0, t, 0.2); return; }
    const sp = this._spatial(pos, 14, 400);
    this.siren.g.gain.setTargetAtTime(0.13 * sp.gain, t, 0.1); this.siren.pan.pan.setTargetAtTime(sp.pan, t, 0.1);
    this.siren.lfo.frequency.setTargetAtTime(fast ? 2.2 : 0.35, t, 0.3);
  }
  setAmbience(night, inCar, speed) {
    if (!this.enabled) return;
    this.loops.city?.set((inCar ? 0.18 : 0.32) * (1 - night * 0.4));
    this.loops.wind?.set(0.08 + Math.min(0.25, speed * 0.006));
  }
}
