// Retargets Quaternius UAL clips (UE-mannequin bone names) onto the MakeHuman/Mixamo rig
// used by humanforge characters. World-space rotation deltas are transferred from the
// source rest pose onto a direction-aligned copy of the target rest pose.
import * as THREE from 'three';

const SIDES = { l: 'Left', r: 'Right' };
export const BONE_MAP = (() => {
  const m = {
    pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
  };
  for (const [s, S] of Object.entries(SIDES)) {
    Object.assign(m, {
      [`clavicle_${s}`]: `${S}Shoulder`, [`upperarm_${s}`]: `${S}Arm`, [`lowerarm_${s}`]: `${S}ForeArm`, [`hand_${s}`]: `${S}Hand`,
      [`thigh_${s}`]: `${S}UpLeg`, [`calf_${s}`]: `${S}Leg`, [`foot_${s}`]: `${S}Foot`, [`ball_${s}`]: `${S}ToeBase`,
    });
    for (const [f, F] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky'], ['thumb', 'Thumb']])
      for (let i = 1; i <= 3; i++) m[`${f}_0${i}_${s}`] = `${S}Hand${F}${i}`;
  }
  return m;
})();

const strip = (n) => n.replace(/^mixamorig:?/, '');

// Primary child used to define a bone's direction.
function primaryChild(bone) {
  const kids = bone.children.filter((c) => c.isBone);
  if (!kids.length) return null;
  const pref = kids.find((k) => /spine|neck|head|forearm|lowerarm|hand$|leg$|calf|foot|toe|ball|2$|02/i.test(k.name));
  return pref || kids[0];
}

export function createRetargeter(srcRoot, tgtRoot) {
  srcRoot.updateMatrixWorld(true); tgtRoot.updateMatrixWorld(true);
  const src = {}; srcRoot.traverse((o) => { if (o.isBone) src[o.name] = o; });
  const tgt = {}; tgtRoot.traverse((o) => { if (o.isBone) tgt[strip(o.name)] = o; });
  const pairs = []; // in target hierarchy order
  tgtRoot.traverse((o) => {
    if (!o.isBone) return;
    const sName = Object.keys(BONE_MAP).find((k) => BONE_MAP[k] === strip(o.name));
    if (sName && src[sName]) pairs.push({ t: o, s: src[sName] });
  });
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  // rest data
  const srcRestQ = new Map(), tgtRestLocal = new Map();
  for (const { s, t } of pairs) { srcRestQ.set(s, wq(s)); tgtRestLocal.set(t, { p: t.position.clone(), q: t.quaternion.clone() }); }
  // aligned target rest (world) - top-down
  const alignedW = new Map();
  const tgtPair = new Map(pairs.map((p) => [p.t, p.s]));
  for (const { s, t } of pairs) {
    const parentW = alignedW.get(t.parent) || (t.parent ? wq(t.parent) : new THREE.Quaternion());
    let w = parentW.clone().multiply(t.quaternion);
    const tc = primaryChild(t), sc = primaryChild(s);
    if (tc && sc) {
      const tDir = tc.position.clone().applyQuaternion(w).normalize();
      const sDir = wp(sc).sub(wp(s)).normalize();
      const fix = new THREE.Quaternion().setFromUnitVectors(tDir, sDir);
      w = fix.multiply(w);
    }
    alignedW.set(t, w);
  }
  const hipsT = pairs[0].t, pelvisS = pairs[0].s;
  const srcPelvisRest = wp(pelvisS), tgtHipsRestW = wp(hipsT);
  const scale = tgtHipsRestW.y / srcPelvisRest.y;
  const tgtHipsParentInv = hipsT.parent.matrixWorld.clone().invert();

  // Apply the current source pose onto the target skeleton.
  function apply() {
    srcRoot.updateMatrixWorld(true);
    const curW = new Map();
    for (const { s, t } of pairs) {
      const delta = wq(s).multiply(srcRestQ.get(s).clone().invert());
      const w = delta.multiply(alignedW.get(t));
      const parentW = curW.get(t.parent) || wq(t.parent);
      t.quaternion.copy(parentW.clone().invert().multiply(w));
      curW.set(t, w);
    }
    const d = wp(pelvisS).sub(srcPelvisRest).multiplyScalar(scale);
    const p = tgtHipsRestW.clone().add(d).applyMatrix4(tgtHipsParentInv);
    hipsT.position.copy(p);
    tgtRoot.updateMatrixWorld(true);
  }

  function reset() { for (const { t } of pairs) { const r = tgtRestLocal.get(t); t.position.copy(r.p); t.quaternion.copy(r.q); } }

  // Bake a clip into target tracks.
  function bake(clip, srcMixerRoot, fps = 30, opts = {}) {
    const mixer = new THREE.AnimationMixer(srcMixerRoot);
    const action = mixer.clipAction(clip); action.play();
    const n = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(n);
    const qv = pairs.map(() => new Float32Array(n * 4));
    const pv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const tt = Math.min(clip.duration, i / fps);
      times[i] = tt; mixer.setTime(tt); apply();
      pairs.forEach(({ t }, j) => t.quaternion.toArray(qv[j], i * 4));
      hipsT.position.toArray(pv, i * 3);
    }
    if (opts.lockHipsXZ) for (let i = 0; i < n; i++) { pv[i * 3] = pv[0]; pv[i * 3 + 2] = pv[2]; }
    // make quaternion sequences continuous
    for (const arr of qv) for (let i = 1; i < n; i++) {
      const dot = arr[i*4]*arr[i*4-4] + arr[i*4+1]*arr[i*4-3] + arr[i*4+2]*arr[i*4-2] + arr[i*4+3]*arr[i*4-1];
      if (dot < 0) for (let k = 0; k < 4; k++) arr[i*4+k] *= -1;
    }
    const tracks = pairs.map(({ t }, j) => new THREE.QuaternionKeyframeTrack(`${t.name}.quaternion`, times, qv[j]));
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsT.name}.position`, times, pv));
    mixer.stopAllAction(); mixer.uncacheRoot(srcMixerRoot);
    reset();
    return new THREE.AnimationClip(opts.name || clip.name, clip.duration, tracks);
  }
  return { apply, reset, bake, pairs };
}
