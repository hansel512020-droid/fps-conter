import * as THREE from 'three';

const EPS = 0.001;

/**
 * Static collision world made of axis-aligned boxes.
 * Handles capsule-as-AABB character movement with sliding, and ray casts.
 */
export class CollisionWorld {
  constructor(cellSize = 8) {
    this.boxes = [];
    this.cellSize = cellSize;
    this.grid = new Map(); // "cx,cz" -> box index list
  }

  addBox(min, max, material = 'concrete', tag = null) {
    const box = { min: min.clone(), max: max.clone(), material, tag, id: this.boxes.length };
    this.boxes.push(box);
    const c0x = Math.floor(min.x / this.cellSize), c1x = Math.floor(max.x / this.cellSize);
    const c0z = Math.floor(min.z / this.cellSize), c1z = Math.floor(max.z / this.cellSize);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const k = cx + ',' + cz;
        let list = this.grid.get(k);
        if (!list) { list = []; this.grid.set(k, list); }
        list.push(box);
      }
    }
    return box;
  }

  _candidates(minx, minz, maxx, maxz, out) {
    out.length = 0;
    const c0x = Math.floor(minx / this.cellSize), c1x = Math.floor(maxx / this.cellSize);
    const c0z = Math.floor(minz / this.cellSize), c1z = Math.floor(maxz / this.cellSize);
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.grid.get(cx + ',' + cz);
        if (!list) continue;
        for (const b of list) {
          if (!seen.has(b.id)) { seen.add(b.id); out.push(b); }
        }
      }
    }
    return out;
  }

  /** Does the AABB (min,max) overlap any solid box? */
  overlaps(min, max) {
    const cand = this._candidates(min.x, min.z, max.x, max.z, this._tmpList || (this._tmpList = []));
    for (const b of cand) {
      if (min.x < b.max.x && max.x > b.min.x &&
          min.y < b.max.y && max.y > b.min.y &&
          min.z < b.max.z && max.z > b.min.z) return true;
    }
    return false;
  }

  /**
   * Move an AABB character. `pos` is the feet position (bottom center).
   * Returns { onGround, hitCeiling, hitWall }.
   */
  moveCharacter(pos, vel, halfW, height, dt) {
    const res = { onGround: false, hitCeiling: false, hitWall: false };
    const cand = this._tmpList2 || (this._tmpList2 = []);
    const dx = vel.x * dt, dy = vel.y * dt, dz = vel.z * dt;
    const reach = Math.abs(dx) + Math.abs(dz) + halfW + 0.5;
    this._candidates(pos.x - reach, pos.z - reach, pos.x + reach, pos.z + reach, cand);

    // X axis
    if (dx !== 0) {
      pos.x += dx;
      for (const b of cand) {
        if (pos.x - halfW < b.max.x && pos.x + halfW > b.min.x &&
            pos.y < b.max.y && pos.y + height > b.min.y &&
            pos.z - halfW < b.max.z && pos.z + halfW > b.min.z) {
          if (dx > 0) pos.x = b.min.x - halfW - EPS; else pos.x = b.max.x + halfW + EPS;
          vel.x = 0; res.hitWall = true;
        }
      }
    }
    // Z axis
    if (dz !== 0) {
      pos.z += dz;
      for (const b of cand) {
        if (pos.x - halfW < b.max.x && pos.x + halfW > b.min.x &&
            pos.y < b.max.y && pos.y + height > b.min.y &&
            pos.z - halfW < b.max.z && pos.z + halfW > b.min.z) {
          if (dz > 0) pos.z = b.min.z - halfW - EPS; else pos.z = b.max.z + halfW + EPS;
          vel.z = 0; res.hitWall = true;
        }
      }
    }
    // Y axis
    pos.y += dy;
    for (const b of cand) {
      if (pos.x - halfW < b.max.x && pos.x + halfW > b.min.x &&
          pos.y < b.max.y && pos.y + height > b.min.y &&
          pos.z - halfW < b.max.z && pos.z + halfW > b.min.z) {
        if (dy <= 0) { pos.y = b.max.y + EPS; vel.y = 0; res.onGround = true; }
        else { pos.y = b.min.y - height - EPS; vel.y = 0; res.hitCeiling = true; }
      }
    }
    // Ground probe (so we stay grounded on flat floors even with tiny dy)
    if (!res.onGround && vel.y <= 0) {
      const probe = 0.05;
      for (const b of cand) {
        if (pos.x - halfW < b.max.x && pos.x + halfW > b.min.x &&
            pos.z - halfW < b.max.z && pos.z + halfW > b.min.z &&
            pos.y >= b.max.y - EPS && pos.y - probe <= b.max.y) {
          res.onGround = true; pos.y = b.max.y + EPS; vel.y = 0;
          break;
        }
      }
    }
    if (pos.y < 0) { pos.y = 0; vel.y = 0; res.onGround = true; }
    return res;
  }

  /**
   * Ray vs all boxes. Returns nearest { t, point, normal, box } or null.
   */
  raycast(origin, dir, maxDist = 500) {
    let best = null;
    let bestT = maxDist;
    const invx = 1 / dir.x, invy = 1 / dir.y, invz = 1 / dir.z;
    // Walk the cells along the ray (2D DDA over x/z); cheap enough for our sizes.
    const cs = this.cellSize;
    const visited = this._rayVisited || (this._rayVisited = new Set());
    visited.clear();
    let cx = Math.floor(origin.x / cs), cz = Math.floor(origin.z / cs);
    const stepX = dir.x > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    let tMaxX = dir.x !== 0 ? (((cx + (stepX > 0 ? 1 : 0)) * cs) - origin.x) / dir.x : Infinity;
    let tMaxZ = dir.z !== 0 ? (((cz + (stepZ > 0 ? 1 : 0)) * cs) - origin.z) / dir.z : Infinity;
    const tDeltaX = dir.x !== 0 ? Math.abs(cs / dir.x) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(cs / dir.z) : Infinity;
    let t = 0;
    let guard = 0;
    while (t < bestT && guard++ < 400) {
      const list = this.grid.get(cx + ',' + cz);
      if (list) {
        for (const b of list) {
          if (visited.has(b.id)) continue;
          visited.add(b.id);
          const hit = rayBox(origin, dir, invx, invy, invz, b, bestT);
          if (hit !== null && hit < bestT) { bestT = hit; best = b; }
        }
      }
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
      if (cx < -2 || cz < -2 || cx > 200 || cz > 200) break;
    }
    if (!best) return null;
    const point = origin.clone().addScaledVector(dir, bestT);
    return { t: bestT, point, normal: boxNormal(point, best), box: best };
  }
}

function rayBox(o, d, invx, invy, invz, b, maxT) {
  let tmin = (b.min.x - o.x) * invx, tmax = (b.max.x - o.x) * invx;
  if (tmin > tmax) { const s = tmin; tmin = tmax; tmax = s; }
  let tymin = (b.min.y - o.y) * invy, tymax = (b.max.y - o.y) * invy;
  if (tymin > tymax) { const s = tymin; tymin = tymax; tymax = s; }
  if (tmin > tymax || tymin > tmax) return null;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;
  let tzmin = (b.min.z - o.z) * invz, tzmax = (b.max.z - o.z) * invz;
  if (tzmin > tzmax) { const s = tzmin; tzmin = tzmax; tzmax = s; }
  if (tmin > tzmax || tzmin > tmax) return null;
  if (tzmin > tmin) tmin = tzmin;
  if (tzmax < tmax) tmax = tzmax;
  if (tmax < 0) return null;
  const t = tmin >= 0 ? tmin : tmax;
  return t <= maxT ? t : null;
}

function boxNormal(p, b) {
  const dx1 = Math.abs(p.x - b.min.x), dx2 = Math.abs(p.x - b.max.x);
  const dy1 = Math.abs(p.y - b.min.y), dy2 = Math.abs(p.y - b.max.y);
  const dz1 = Math.abs(p.z - b.min.z), dz2 = Math.abs(p.z - b.max.z);
  const m = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);
  if (m === dx1) return new THREE.Vector3(-1, 0, 0);
  if (m === dx2) return new THREE.Vector3(1, 0, 0);
  if (m === dy1) return new THREE.Vector3(0, -1, 0);
  if (m === dy2) return new THREE.Vector3(0, 1, 0);
  if (m === dz1) return new THREE.Vector3(0, 0, -1);
  return new THREE.Vector3(0, 0, 1);
}

/** Ray vs AABB helper usable for hitboxes. Returns t or null. */
export function rayAABB(origin, dir, min, max, maxT = Infinity) {
  const b = { min, max };
  return rayBox(origin, dir, 1 / dir.x, 1 / dir.y, 1 / dir.z, b, maxT);
}
