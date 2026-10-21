// Small geometry toolkit: quads/boxes with explicit UVs and vertex colors, collected per
// material into a few merged meshes (one draw call per material).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export class Batcher {
  constructor() { this.parts = new Map(); }
  // raw arrays per key
  _get(key) {
    let p = this.parts.get(key);
    if (!p) { p = { pos: [], nor: [], uv: [], col: [], idx: [], n: 0 }; this.parts.set(key, p); }
    return p;
  }
  // Quad from 4 corners (counter-clockwise when seen from the front), uvs [u0,v0,u1,v1]
  quad(key, a, b, c, d, uv = [0, 0, 1, 1], color = [1, 1, 1]) {
    const p = this._get(key);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    for (const v of [a, b, c, d]) { p.pos.push(v.x, v.y, v.z); p.nor.push(n.x, n.y, n.z); p.col.push(color[0], color[1], color[2]); }
    p.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    p.idx.push(p.n, p.n + 1, p.n + 2, p.n, p.n + 2, p.n + 3);
    p.n += 4;
  }
  // Vertical wall quad from (x0,z0) to (x1,z1), facing to the right of the direction of travel
  wall(key, x0, z0, x1, z1, y0, y1, uv, color) {
    this.quad(key, new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y0, z1), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x0, y1, z0), uv, color);
  }
  // Horizontal quad (facing up unless down=true)
  flat(key, x0, z0, x1, z1, y, uv, color, down = false) {
    if (!down) this.quad(key, new THREE.Vector3(x0, y, z1), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x0, y, z0), uv, color);
    else this.quad(key, new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, y, z1), uv, color);
  }
  // Axis-aligned box. uvScale: world meters per UV unit (planar per face). faces: skip list
  box(key, x0, y0, z0, x1, y1, z1, { color = [1, 1, 1], uvScale = 1, skip = '' } = {}) {
    const s = 1 / uvScale;
    if (!skip.includes('py')) this.flat(key, x0, z0, x1, z1, y1, [x0 * s, -z1 * s, x1 * s, -z0 * s], color);
    if (!skip.includes('ny')) this.flat(key, x0, z0, x1, z1, y0, [x0 * s, z0 * s, x1 * s, z1 * s], color, true);
    // +z face (south) runs west->east
    if (!skip.includes('pz')) this.wall(key, x0, z1, x1, z1, y0, y1, [x0 * s, y0 * s, x1 * s, y1 * s], color);
    if (!skip.includes('nz')) this.wall(key, x1, z0, x0, z0, y0, y1, [-x1 * s, y0 * s, -x0 * s, y1 * s], color);
    if (!skip.includes('px')) this.wall(key, x1, z1, x1, z0, y0, y1, [-z1 * s, y0 * s, -z0 * s, y1 * s], color);
    if (!skip.includes('nx')) this.wall(key, x0, z0, x0, z1, y0, y1, [z0 * s, y0 * s, z1 * s, y1 * s], color);
  }
  // Append an arbitrary indexed BufferGeometry (with optional transform & color)
  geometry(key, geo, matrix, color = [1, 1, 1]) {
    const g = geo.index ? geo : geo;
    const p = this._get(key);
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv');
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    const col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); if (matrix) v.applyMatrix4(matrix);
      nn.fromBufferAttribute(nor, i); if (nm) nn.applyMatrix3(nm).normalize();
      p.pos.push(v.x, v.y, v.z); p.nor.push(nn.x, nn.y, nn.z);
      if (uv) p.uv.push(uv.getX(i), uv.getY(i)); else p.uv.push(0, 0);
      if (col) p.col.push(col.getX(i) * color[0], col.getY(i) * color[1], col.getZ(i) * color[2]); else p.col.push(color[0], color[1], color[2]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) p.idx.push(p.n + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) p.idx.push(p.n + i);
    p.n += pos.count;
  }
  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, p] of this.parts) {
      if (!p.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
      g.setIndex(p.n > 65535 ? new THREE.Uint32BufferAttribute(p.idx, 1) : new THREE.Uint16BufferAttribute(p.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mat = typeof materials === 'function' ? materials(key) : materials[key];
      if (!mat) { console.warn('no material for', key); continue; }
      const m = new THREE.Mesh(g, mat);
      m.name = key;
      m.castShadow = castShadow && !mat.userData.noShadow; m.receiveShadow = receiveShadow;
      group.add(m);
    }
    return group;
  }
}

export function mergeInto(geos) { return mergeGeometries(geos, false); }

export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
