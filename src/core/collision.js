// Static collision world: axis-aligned boxes (buildings, props) and circles (poles, trees)
// in a uniform grid, with circle push-out, OBB queries and ray casts.
import * as THREE from 'three';

const CELL = 16;
export class CollisionWorld {
  constructor(boxes, circles) {
    this.boxes = boxes; this.circles = circles;
    this.grid = new Map();
    boxes.forEach((b, i) => this._insert(b.x0, b.z0, b.x1, b.z1, { t: 'b', i }));
    circles.forEach((c, i) => this._insert(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, { t: 'c', i }));
    this._stamp = 0; this._seenB = new Uint32Array(boxes.length); this._seenC = new Uint32Array(circles.length);
  }
  _insert(x0, z0, x1, z1, ref) {
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
      const k = gx * 73856093 ^ gz * 19349663;
      let arr = this.grid.get(k); if (!arr) { arr = []; this.grid.set(k, arr); } arr.push(ref);
    }
  }
  // iterate unique refs overlapping rect
  query(x0, z0, x1, z1, fn) {
    const s = ++this._stamp;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
      const arr = this.grid.get(gx * 73856093 ^ gz * 19349663); if (!arr) continue;
      for (const r of arr) {
        if (r.t === 'b') { if (this._seenB[r.i] === s) continue; this._seenB[r.i] = s; if (fn(this.boxes[r.i], 'b') === false) return; }
        else { if (this._seenC[r.i] === s) continue; this._seenC[r.i] = s; if (fn(this.circles[r.i], 'c') === false) return; }
      }
    }
  }

  // Push a circle (x,z,r) out of static geometry. y: feet height, ignores obstacles lower than stepH.
  resolveCircle(p, r, { y = 0, stepH = 0.45, height = 1.8 } = {}) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      this.query(p.x - r, p.z - r, p.x + r, p.z + r, (o, t) => {
        if (t === 'b') {
          if (o.h !== undefined && o.h < y + stepH) return;
          if ((o.y0 ?? 0) > y + height) return;
          const cx = Math.max(o.x0, Math.min(p.x, o.x1)), cz = Math.max(o.z0, Math.min(p.z, o.z1));
          let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) return;
          if (d2 < 1e-8) { // center inside box: push out along the smallest axis
            const l = p.x - o.x0, rr = o.x1 - p.x, n = p.z - o.z0, s = o.z1 - p.z; const m = Math.min(l, rr, n, s);
            if (m === l) p.x = o.x0 - r; else if (m === rr) p.x = o.x1 + r; else if (m === n) p.z = o.z0 - r; else p.z = o.z1 + r;
          } else { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
          hit = true;
        } else {
          const dx = p.x - o.x, dz = p.z - o.z, rr = r + o.r, d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) return;
          const d = Math.sqrt(d2); p.x = o.x + (dx / d) * rr; p.z = o.z + (dz / d) * rr; hit = true;
        }
      });
    }
    return hit;
  }

  // Oriented box (vehicle) vs static world: returns array of contacts {nx,nz,depth,px,pz}
  obbContacts(cx, cz, hx, hz, angle, out = []) {
    out.length = 0;
    const c = Math.cos(angle), s = Math.sin(angle);
    // box axes: forward (sin, cos) length hz, right (cos, -sin) length hx
    const fx = s, fz = c, rx = c, rz = -s;
    const ext = Math.abs(hx) + Math.abs(hz);
    this.query(cx - ext, cz - ext, cx + ext, cz + ext, (o, t) => {
      if (t === 'c') {
        // circle vs OBB
        const dx = o.x - cx, dz = o.z - cz;
        const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
        const qf = Math.max(-hz, Math.min(hz, lf)), qr = Math.max(-hx, Math.min(hx, lr));
        const ddf = lf - qf, ddr = lr - qr; const d2 = ddf * ddf + ddr * ddr;
        if (d2 > o.r * o.r) return;
        const d = Math.sqrt(d2);
        if (d > 1e-6) {
          const wx = (ddf * fx + ddr * rx) / d, wz = (ddf * fz + ddr * rz) / d; // from box to circle
          out.push({ nx: -wx, nz: -wz, depth: o.r - d, px: cx + qf * fx + qr * rx, pz: cz + qf * fz + qr * rz, obj: o });
        } else {
          out.push({ nx: -Math.sign(lf || 1) * fx, nz: -Math.sign(lf || 1) * fz, depth: o.r + hz - Math.abs(lf), px: o.x, pz: o.z, obj: o });
        }
        return;
      }
      if (o.h !== undefined && o.h < 0.4) return;
      // SAT between OBB and AABB (2D)
      const bx = (o.x0 + o.x1) / 2, bz = (o.z0 + o.z1) / 2, bhx = (o.x1 - o.x0) / 2, bhz = (o.z1 - o.z0) / 2;
      const dx = bx - cx, dz = bz - cz;
      const axes = [[1, 0], [0, 1], [fx, fz], [rx, rz]];
      let minDepth = Infinity, nx = 0, nz = 0;
      for (const [ax, az] of axes) {
        const ra = Math.abs(hz * (fx * ax + fz * az)) + Math.abs(hx * (rx * ax + rz * az));
        const rb = bhx * Math.abs(ax) + bhz * Math.abs(az);
        const dist = dx * ax + dz * az;
        const ov = ra + rb - Math.abs(dist);
        if (ov <= 0) return;
        if (ov < minDepth) { minDepth = ov; const sg = dist > 0 ? -1 : 1; nx = ax * sg; nz = az * sg; }
      }
      // contact point: box corner deepest along -n
      let best = -Infinity, px = cx, pz = cz;
      for (const [sf, sr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const qx = cx + fx * hz * sf + rx * hx * sr, qz = cz + fz * hz * sf + rz * hx * sr;
        const d = -(qx * nx + qz * nz);
        if (d > best) { best = d; px = qx; pz = qz; }
      }
      out.push({ nx, nz, depth: minDepth, px, pz, obj: o });
    });
    return out;
  }

  // 3D ray vs boxes (with heights) and circles (as cylinders). Returns {dist, point, normal, obj} or null
  raycast(origin, dir, maxDist, { ignoreLow = 0 } = {}) {
    let best = null;
    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    // step through the grid region of the ray's bounding box (rays are short in practice)
    const x0 = Math.min(origin.x, ex), x1 = Math.max(origin.x, ex), z0 = Math.min(origin.z, ez), z1 = Math.max(origin.z, ez);
    let bestT = maxDist;
    this.query(x0, z0, x1, z1, (o, t) => {
      if (t === 'b') {
        const h = o.h ?? 100; if (h < ignoreLow) return;
        const y0 = o.y0 ?? -1;
        let tmin = 0, tmax = bestT, nAxis = -1, nSign = 0;
        const lo = [o.x0, y0, o.z0], hi = [o.x1, h, o.z1], or = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
        for (let a = 0; a < 3; a++) {
          if (Math.abs(d[a]) < 1e-9) { if (or[a] < lo[a] || or[a] > hi[a]) return; continue; }
          let t1 = (lo[a] - or[a]) / d[a], t2 = (hi[a] - or[a]) / d[a]; let sgn = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
          if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sgn; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return;
        }
        if (nAxis < 0 || tmin >= bestT) return;
        bestT = tmin;
        const n = new THREE.Vector3(); n.setComponent(nAxis, nSign);
        best = { dist: tmin, normal: n, obj: o };
      } else {
        const ch = o.h ?? 4; if (ch < ignoreLow) return;
        // 2D circle intersection
        const fx = origin.x - o.x, fz = origin.z - o.z;
        const a = dir.x * dir.x + dir.z * dir.z; if (a < 1e-9) return;
        const b = 2 * (fx * dir.x + fz * dir.z), cc = fx * fx + fz * fz - o.r * o.r;
        const disc = b * b - 4 * a * cc; if (disc < 0) return;
        const tt = (-b - Math.sqrt(disc)) / (2 * a);
        if (tt < 0 || tt >= bestT) return;
        const y = origin.y + dir.y * tt; if (y > ch || y < 0) return;
        bestT = tt;
        const px = origin.x + dir.x * tt, pz = origin.z + dir.z * tt;
        best = { dist: tt, normal: new THREE.Vector3(px - o.x, 0, pz - o.z).normalize(), obj: o };
      }
    });
    if (best) best.point = origin.clone().addScaledVector(dir, best.dist);
    return best;
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); if (len < 0.01) return true; d.divideScalar(len);
    const h = this.raycast(a, d, len, { ignoreLow: 1.2 });
    return !h;
  }
}
