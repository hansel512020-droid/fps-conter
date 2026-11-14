/**
 * Grid-based level description. Each cell is `cell` meters wide.
 * Cell types: 'wall' (full height), 'floor', 'crate' (1m, jumpable), 'tall' (2m crate), 'half' (1.2m cover wall).
 */
export class MapBuilder {
  constructor(cols, rows, cell = 2) {
    this.cols = cols; this.rows = rows; this.cell = cell;
    this.type = new Array(cols * rows).fill('wall');
    this.zone = new Array(cols * rows).fill(null);
    this.spawns = { T: [], CT: [] };
    this.props = [];
  }
  idx(x, z) { return z * this.cols + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.cols && z < this.rows; }
  set(x, z, t) { if (this.inBounds(x, z)) this.type[this.idx(x, z)] = t; }
  get(x, z) { return this.inBounds(x, z) ? this.type[this.idx(x, z)] : 'wall'; }
  getZone(x, z) { return this.inBounds(x, z) ? this.zone[this.idx(x, z)] : null; }

  rect(x0, z0, x1, z1, t) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, z, t);
    return this;
  }
  carve(x0, z0, x1, z1, zone = null) {
    this.rect(x0, z0, x1, z1, 'floor');
    if (zone) this.zoneRect(x0, z0, x1, z1, zone);
    return this;
  }
  fill(x0, z0, x1, z1) { return this.rect(x0, z0, x1, z1, 'wall'); }
  crate(x, z, h = 1) { this.set(x, z, h >= 2 ? 'tall' : 'crate'); return this; }
  crates(x0, z0, x1, z1, h = 1) { return this.rect(x0, z0, x1, z1, h >= 2 ? 'tall' : 'crate'); }
  half(x0, z0, x1, z1) { return this.rect(x0, z0, x1, z1, 'half'); }
  zoneRect(x0, z0, x1, z1, zone) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.inBounds(x, z)) this.zone[this.idx(x, z)] = zone;
    return this;
  }
  spawn(team, x, z, yaw) { this.spawns[team].push({ x, z, yaw }); return this; }
  prop(kind, x, z, opts = {}) { this.props.push({ kind, x, z, ...opts }); return this; }
}
