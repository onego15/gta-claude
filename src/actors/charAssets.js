// Loads baked character models (humanforge / MakeHuman, CC0) and the shared retargeted
// animation set (Quaternius UAL, CC0) and produces ready-to-animate instances.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = `${import.meta.env.BASE_URL}assets/chars/`;
export const PED_IDS = ['m_denim', 'm_stripes', 'm_whitetee', 'm_jacket_brown', 'm_suit', 'm_overalls', 'm_redtee', 'm_old', 'f_greentee', 'f_shorts', 'f_sport', 'f_office', 'f_trousersuit', 'f_dress', 'f_old'];
export const GANG_IDS = ['gang_a', 'gang_b', 'gang_c'];
export const COP_IDS = ['cop_m', 'cop_f'];

// bones considered "upper body" for layered aiming/shooting
const UPPER = /Spine|Neck|Head|Shoulder|Arm|Hand/;

const store = { models: {}, clips: null, roster: null, perChar: {} };

export async function loadCharacters(onProgress, only = null) {
  const loader = new GLTFLoader();
  store.roster = await (await fetch(`${BASE}roster.json`)).json();
  const ids = only || ['player', ...PED_IDS, ...GANG_IDS, ...COP_IDS];
  let done = 0; const total = ids.length + 1;
  const anims = loader.loadAsync(`${BASE}anims.glb`).then((g) => { onProgress?.(++done / total); return g; });
  await Promise.all(ids.map(async (id) => {
    const g = await loader.loadAsync(`${BASE}${id}.glb`);
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const m = o.material;
        if (m.transparent && !/hair|eyebrow|eyelash|eyes/.test(o.name)) { m.transparent = false; m.alphaTest = 0.5; }
        if (/hair/.test(o.name)) { m.alphaTest = m.transparent ? 0.04 : 0.5; m.side = THREE.DoubleSide; }
        if (/eyes/.test(o.name)) o.castShadow = false;
        m.envMapIntensity = 0.6;
      }
    });
    store.models[id] = g.scene;
    onProgress?.(++done / total);
  }));
  const a = await anims;
  store.clips = a.animations;
  return store;
}

// Per-character clip set: hips translation is rescaled to the character's leg length.
function clipsFor(id) {
  if (store.perChar[id]) return store.perChar[id];
  const k = store.roster[id].hipsY / store.roster.anims.hipsY;
  const full = {}, upper = {}, lower = {};
  for (const c of store.clips) {
    const cc = c.clone();
    for (const t of cc.tracks) if (t.name.endsWith('.position')) for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
    full[c.name] = cc;
    upper[c.name] = new THREE.AnimationClip(`${c.name}_U`, cc.duration, cc.tracks.filter((t) => UPPER.test(t.name)));
    lower[c.name] = new THREE.AnimationClip(`${c.name}_L`, cc.duration, cc.tracks.filter((t) => !UPPER.test(t.name)));
  }
  store.perChar[id] = { full, upper, lower };
  return store.perChar[id];
}

export function instantiate(id) {
  const src = store.models[id];
  const model = SkeletonUtils.clone(src);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig/, '')] = o; });
  return { model, bones, clips: clipsFor(id), height: store.roster[id].height };
}

export function hasCharacters() { return !!store.clips; }
