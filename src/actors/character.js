// Animated human: weight-blended animation layers driven by a simple per-frame "pose"
// description (locomotion speed, aiming, one-shots, driving...).
import * as THREE from 'three';
import { instantiate } from './charAssets.js';

// Natural ground speeds of the locomotion clips (m/s at timeScale 1), tuned by eye to
// minimise foot sliding.
const LOCO = [
  { name: 'Idle_Loop', speed: 0 },
  { name: 'Walk_Loop', speed: 1.45 },
  { name: 'Jog_Fwd_Loop', speed: 3.6 },
  { name: 'Sprint_Loop', speed: 6.2 },
];
const LOCO_FORMAL = 'Walk_Formal_Loop';

export class Character {
  constructor(id, opts = {}) {
    const inst = instantiate(id);
    this.id = id;
    this.model = inst.model; this.bones = inst.bones; this.clips = inst.clips; this.height = inst.height;
    this.root = new THREE.Group(); this.root.add(this.model);
    this.root.userData.character = this;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = new Map(); // key -> { action, w, target }
    this.heading = 0; // radians, forward = (sin, cos)
    this.idleClip = opts.idleClip || 'Idle_Loop';
    this.walkClip = opts.walkClip || 'Walk_Loop';
    this.oneShot = null; // { key, onDone, lock }
    this.blendSpeed = 8;
    this.pitchExtra = 0;
    this.mixer.addEventListener('finished', (e) => {
      if (this.oneShot && e.action === this.oneShot.action) {
        const cb = this.oneShot.onDone; if (!this.oneShot.hold) this.oneShot = null; cb?.();
      }
    });
    this.phase = 0;
  }

  get position() { return this.root.position; }

  _act(name, part = 'full') {
    const key = `${name}|${part}`;
    let a = this.actions.get(key);
    if (!a) {
      const clip = this.clips[part][name];
      if (!clip) { console.warn('missing clip', name); return null; }
      const action = this.mixer.clipAction(clip);
      action.enabled = true; action.setEffectiveWeight(0); action.play();
      a = { action, w: 0, target: 0, name, part };
      this.actions.set(key, a);
    }
    return a;
  }

  // Start a one-shot clip that overrides the base layers (or just the upper body).
  playOnce(name, { part = 'full', fade = 0.15, timeScale = 1, hold = false, onDone, startAt = 0 } = {}) {
    const a = this._act(name, part); if (!a) return;
    a.action.reset(); a.action.setLoop(THREE.LoopOnce, 1); a.action.clampWhenFinished = true; a.action.timeScale = timeScale;
    a.action.time = startAt;
    a.action.play();
    this.oneShot = { key: `${name}|${part}`, action: a.action, part, onDone, hold, fade };
    if (fade === 0) a.w = 1;
  }
  clearOneShot() { this.oneShot = null; }

  // pose: { speed, aiming, pitch, mode: 'loco'|'drive'|'sit'|'phone'|'talk'|'crouch', formal }
  update(dt, pose = {}) {
    // animation LOD: distant characters advance their mixer every few frames
    this._acc = (this._acc || 0) + dt; this._f = (this._f || 0) + 1;
    if (this.lod > 1 && this._f % this.lod !== 0 && !this.oneShot) { this.root.rotation.y = this.heading; return; }
    dt = Math.min(0.25, this._acc); this._acc = 0;
    const targets = new Map();
    const set = (name, part, w) => { const k = `${name}|${part}`; targets.set(k, (targets.get(k) || 0) + w); this._act(name, part); };
    const os = this.oneShot;
    const speed = pose.speed || 0;
    const mode = pose.mode || 'loco';
    const lowerPart = pose.aiming || (os && os.part === 'upper') ? 'lower' : 'full';

    if (os && os.part === 'full') {
      set(os.key.split('|')[0], 'full', 1);
    } else {
      if (mode === 'drive') set('Driving_Loop', 'full', 1);
      else if (mode === 'sit') set('Sitting_Idle_Loop', 'full', 1);
      else if (mode === 'sitTalk') set('Sitting_Talking_Loop', 'full', 1);
      else if (mode === 'phone') set('Idle_TalkingPhone_Loop', 'full', 1);
      else if (mode === 'talk') set('Idle_Talking_Loop', 'full', 1);
      else if (mode === 'fold') set('Idle_FoldArms_Loop', 'full', 1);
      else if (mode === 'crouch') { if (speed > 0.3) set('Crouch_Fwd_Loop', lowerPart, 1); else set('Crouch_Idle_Loop', lowerPart, 1); }
      else if (mode === 'fall') set('Jump_Loop', 'full', 1);
      else {
        // 1D locomotion blend
        const loco = LOCO.map((l) => ({ ...l }));
        loco[0].name = this.idleClip;
        loco[1].name = pose.formal ? LOCO_FORMAL : this.walkClip;
        let i = 0; while (i < loco.length - 2 && speed > loco[i + 1].speed) i++;
        const a = loco[i], b = loco[i + 1];
        const t = Math.min(1, Math.max(0, (speed - a.speed) / (b.speed - a.speed)));
        set(a.name, lowerPart, 1 - t); set(b.name, lowerPart, t);
        // timescale to match ground speed
        for (const l of [a, b]) {
          const act = this._act(l.name, lowerPart);
          if (l.speed > 0) act.action.timeScale = THREE.MathUtils.clamp(speed / l.speed, 0.6, 1.6);
        }
      }
      if (pose.aiming || (os && os.part === 'upper')) {
        if (os && os.part === 'upper') set(os.key.split('|')[0], 'upper', 1);
        else {
          const p = THREE.MathUtils.clamp(pose.pitch || 0, -1, 1); // +1 = up
          if (p >= 0) { set('Pistol_Aim_Neutral', 'upper', 1 - p); set('Pistol_Aim_Up', 'upper', p); } else { set('Pistol_Aim_Neutral', 'upper', 1 + p); set('Pistol_Aim_Down', 'upper', -p); }
        }
      }
    }
    // blend weights toward targets
    const k = 1 - Math.exp(-(os?.fade === 0 ? 60 : this.blendSpeed) * dt);
    for (const [key, a] of this.actions) {
      const t = targets.get(key) || 0;
      a.w += (t - a.w) * k;
      if (t === 0 && a.w < 0.002) a.w = 0;
      a.action.setEffectiveWeight(a.w);
    }
    this.mixer.update(dt);
    // extra spine pitch for precise aiming
    if (pose.aiming && this.bones.Spine1) {
      const extra = (pose.pitch || 0) * 0.25;
      this.bones.Spine1.rotateX(-extra); this.bones.Spine2?.rotateX(-extra * 0.6);
    }
    this.root.rotation.y = this.heading;
  }

  // world position of a bone
  bonePos(name, out = new THREE.Vector3()) { const b = this.bones[name]; return b ? b.getWorldPosition(out) : out.copy(this.root.position); }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
}
