/**
 * A* over the map's walkable grid with 8-way movement (no corner cutting),
 * plus line-of-walk checks for path smoothing.
 */
class MinHeap {
  constructor() { this.a = []; }
  push(node) {
    const a = this.a; a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export class NavGrid {
  constructor(map) {
    this.map = map;
    this.cols = map.cols; this.rows = map.rows;
    this.walk = map.walkable;
    // penalise cells adjacent to walls so paths hug the middle of corridors
    this.cost = new Float32Array(this.cols * this.rows);
    for (let z = 0; z < this.rows; z++) for (let x = 0; x < this.cols; x++) {
      let c = 1;
      for (const [dx, dz] of DIRS) if (!this.ok(x + dx, z + dz)) c += 0.6;
      this.cost[z * this.cols + x] = c;
    }
    this.gScore = new Float32Array(this.cols * this.rows);
    this.came = new Int32Array(this.cols * this.rows);
    this.closed = new Uint8Array(this.cols * this.rows);
    this.walkableCells = [];
    for (let z = 0; z < this.rows; z++) for (let x = 0; x < this.cols; x++) if (this.ok(x, z)) this.walkableCells.push([x, z]);
  }

  ok(x, z) { return x >= 0 && z >= 0 && x < this.cols && z < this.rows && this.walk[z * this.cols + x] === 1; }

  /** Nearest walkable cell to a world position. */
  nearestCell(pos) {
    let [cx, cz] = this.map.cellOf(pos.x, pos.z);
    if (this.ok(cx, cz)) return [cx, cz];
    let best = null, bd = Infinity;
    for (let r = 1; r <= 4 && !best; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!this.ok(x, z)) continue;
        const c = this.map.center(x, z);
        const d = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
        if (d < bd) { bd = d; best = [x, z]; }
      }
    }
    return best || [cx, cz];
  }

  randomCell() { return this.walkableCells[Math.floor(Math.random() * this.walkableCells.length)]; }

  /** Returns array of [x,z] cells from start to goal (inclusive) or null. */
  findPath(sx, sz, gx, gz) {
    if (!this.ok(sx, sz) || !this.ok(gx, gz)) return null;
    const W = this.cols;
    this.gScore.fill(Infinity);
    this.closed.fill(0);
    const h = (x, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return (dx + dz) + (1.414 - 2) * Math.min(dx, dz); };
    const open = new MinHeap();
    const si = sz * W + sx;
    this.gScore[si] = 0;
    this.came[si] = -1;
    open.push({ i: si, x: sx, z: sz, f: h(sx, sz) });
    let iter = 0;
    while (open.size && iter++ < 20000) {
      const cur = open.pop();
      if (this.closed[cur.i]) continue;
      this.closed[cur.i] = 1;
      if (cur.x === gx && cur.z === gz) {
        const path = [];
        let i = cur.i;
        while (i !== -1) { path.push([i % W, (i / W) | 0]); i = this.came[i]; }
        return path.reverse();
      }
      for (const [dx, dz, c] of DIRS) {
        const nx = cur.x + dx, nz = cur.z + dz;
        if (!this.ok(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (!this.ok(cur.x + dx, cur.z) || !this.ok(cur.x, cur.z + dz))) continue; // no corner cutting
        const ni = nz * W + nx;
        if (this.closed[ni]) continue;
        const g = this.gScore[cur.i] + c * this.cost[ni];
        if (g < this.gScore[ni]) {
          this.gScore[ni] = g;
          this.came[ni] = cur.i;
          open.push({ i: ni, x: nx, z: nz, f: g + h(nx, nz) });
        }
      }
    }
    return null;
  }

  /** True if a straight line between the two cells crosses only walkable cells (with margin). */
  lineWalkable(ax, az, bx, bz) {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) * 3 + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      // sample a small neighbourhood to keep clearance from walls
      for (const [ox, oz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
        if (!this.ok(Math.round(x + ox), Math.round(z + oz))) return false;
      }
    }
    return true;
  }

  /** Converts a cell path to world waypoints and removes redundant ones. */
  smooth(path) {
    if (!path || path.length === 0) return [];
    const pts = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      while (j > i + 1 && !this.lineWalkable(path[i][0], path[i][1], path[j][0], path[j][1])) j--;
      pts.push(path[j]);
      i = j;
    }
    return pts.map(([x, z]) => this.map.center(x, z));
  }
}
