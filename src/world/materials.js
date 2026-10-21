// Shared materials for the city. Emissive materials are registered so the day/night
// cycle can fade window lights, shop interiors and neon signs.
import * as THREE from 'three';
import * as T from './textures.js';

export const emissiveMats = []; // { mat, base, kind }
const reg = (mat, base, kind = 'window') => { emissiveMats.push({ mat, base, kind }); return mat; };

let cache = null;
export function cityMaterials() {
  if (cache) return cache;
  const asphalt = T.asphaltTexture();
  const m = {
    asphalt: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0, color: '#ffffff' }),
    marking: new THREE.MeshStandardMaterial({ map: T.roadMarkingTexture(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    zebra: new THREE.MeshStandardMaterial({ map: T.crosswalkTexture(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    sidewalk: new THREE.MeshStandardMaterial({ map: T.sidewalkTexture(), roughness: 0.88, vertexColors: true }),
    curb: new THREE.MeshStandardMaterial({ map: T.concreteTexture(2, '#b3b0a8'), roughness: 0.85 }),
    grass: new THREE.MeshStandardMaterial({ map: T.grassTexture(), roughness: 0.95 }),
    paving: new THREE.MeshStandardMaterial({ map: T.pavingTexture(), roughness: 0.85 }),
    concrete: new THREE.MeshStandardMaterial({ map: T.concreteTexture(4, '#8e8b84'), roughness: 0.9, vertexColors: true }),
    roof: new THREE.MeshStandardMaterial({ map: T.roofTexture(), roughness: 0.95, vertexColors: true }),
    trim: new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true }),
    metal: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.65, vertexColors: true }),
    darkMetal: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.5, color: '#2a2c2f', vertexColors: true }),
    glass: new THREE.MeshStandardMaterial({ color: '#203040', roughness: 0.05, metalness: 0.9, vertexColors: true }),
    dirt: new THREE.MeshStandardMaterial({ color: '#6b5a44', roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.8, vertexColors: true }),
    paint: new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: true }),
  };
  m.glass.envMapIntensity = 1.4;
  cache = m;
  return m;
}

const facadeMats = new Map();
export function facadeMaterial(style, seed) {
  const k = `${style}:${seed}`;
  if (facadeMats.has(k)) return facadeMats.get(k);
  const t = T.facadeTexture(style, seed);
  const mat = new THREE.MeshStandardMaterial({
    map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, emissiveMap: t.emissive,
    emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 1, metalness: 1, vertexColors: true,
  });
  mat.envMapIntensity = style.startsWith('glass') ? 1.5 : 1.0;
  reg(mat, 1.0, 'window');
  facadeMats.set(k, mat);
  return mat;
}

const storeMats = new Map();
export function storeMaterial(seed) {
  if (storeMats.has(seed)) return storeMats.get(seed);
  const t = T.storefrontTexture(seed);
  const mat = new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, metalness: 1, roughness: 1, emissiveMap: t.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  reg(mat, 1.15, 'shop');
  storeMats.set(seed, mat);
  return mat;
}

const signMats = new Map();
export function signMaterial(text, opts) {
  const k = text + JSON.stringify(opts);
  if (signMats.has(k)) return signMats.get(k);
  const t = T.signTexture(text, opts);
  const mat = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.5 });
  reg(mat, opts.neon ? 2.6 : 0.9, opts.neon ? 'neon' : 'sign');
  signMats.set(k, mat);
  return mat;
}

const awningMats = new Map();
export function awningMaterial(c1, c2) {
  const k = c1 + c2;
  if (awningMats.has(k)) return awningMats.get(k);
  const cv = T.canvas(128, 64), g = cv.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * 16, 0, 16, 64); }
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 56, 128, 8);
  const tex = T.toTexture(cv);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  awningMats.set(k, mat);
  return mat;
}

// Day/night: 0 = full day, 1 = full night
export function setNightFactor(f) {
  for (const e of emissiveMats) {
    const k = e.kind === 'neon' ? Math.min(1, f * 1.4 + 0.1) : e.kind === 'shop' ? Math.min(1, f * 1.3 + 0.06) : f;
    e.mat.emissiveIntensity = e.base * k;
  }
}
