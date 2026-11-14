import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './Physics.js';
import { concreteFloor, wallMaterial, crateMaterial, metalMaterial, groundOutsideMaterial, labelTexture } from './textures.js';

const WALL_H = 4.2;
const HEIGHTS = { crate: 1.0, tall: 2.0, half: 1.15 };

/** Scales BoxGeometry UVs so textures tile in world units. */
function boxGeometry(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const vi = f * 4 + i;
      uv.setXY(vi, uv.getX(vi) * su / tile, uv.getY(vi) * sv / tile);
    }
  }
  return g;
}

export class GameMap {
  constructor(builder) {
    this.b = builder;
    this.cols = builder.cols; this.rows = builder.rows; this.cell = builder.cell;
    this.width = this.cols * this.cell; this.depth = this.rows * this.cell;
    this.group = new THREE.Group();
    this.collision = new CollisionWorld(8);
    this.walkable = new Uint8Array(this.cols * this.rows);
    this.sites = { A: [], B: [] };
    this.lights = [];
    this._build();
  }

  /* ---------- queries ---------- */
  cellOf(x, z) { return [Math.floor(x / this.cell), Math.floor(z / this.cell)]; }
  center(cx, cz) { return new THREE.Vector3((cx + 0.5) * this.cell, 0, (cz + 0.5) * this.cell); }
  isWalkable(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows && this.walkable[cz * this.cols + cx] === 1; }
  typeAt(cx, cz) { return this.b.get(cx, cz); }
  zoneAt(pos) {
    const [cx, cz] = this.cellOf(pos.x, pos.z);
    return this.b.getZone(cx, cz);
  }
  siteCells(site) { return this.sites[site]; }
  randomSiteCell(site) { const c = this.sites[site]; return c[Math.floor(Math.random() * c.length)]; }
  spawnPoints(team) {
    return this.b.spawns[team].map((s) => ({ pos: this.center(s.x, s.z), yaw: s.yaw }));
  }
  floorHeightAt(x, z) {
    const [cx, cz] = this.cellOf(x, z);
    const t = this.b.get(cx, cz);
    return HEIGHTS[t] || 0;
  }

  /* ---------- construction ---------- */
  _build() {
    const b = this.b, S = this.cell;
    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const t = b.get(x, z);
        this.walkable[z * this.cols + x] = t === 'floor' ? 1 : 0;
        const zone = b.getZone(x, z);
        if (zone === 'A' || zone === 'B') this.sites[zone].push([x, z]);
      }
    }

    // Floor
    const floorMat = concreteFloor();
    const floorGeo = new THREE.PlaneGeometry(this.width, this.depth);
    const fuv = floorGeo.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * this.width / floorMat.userData.tile, fuv.getY(i) * this.depth / floorMat.userData.tile);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.width / 2, 0, this.depth / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    this.collision.addBox(new THREE.Vector3(-50, -2, -50), new THREE.Vector3(this.width + 50, 0, this.depth + 50), 'concrete', 'floor');

    // Outside ground (beyond the walls, just visual)
    const gmat = groundOutsideMaterial();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gmat);
    ground.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 600 / gmat.userData.tile; });
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.width / 2, -0.02, this.depth / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Walls: merge horizontal runs; only walls touching a non-wall cell are rendered (interior solid mass is skipped)
    const wallMat = wallMaterial();
    const wallGeos = [];
    const exposed = (x, z) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = b.get(x + dx, z + dz);
        if (t !== 'wall') return true;
      }
      return false;
    };
    for (let z = 0; z < this.rows; z++) {
      let x = 0;
      while (x < this.cols) {
        if (b.get(x, z) === 'wall' && exposed(x, z)) {
          let x1 = x;
          while (x1 + 1 < this.cols && b.get(x1 + 1, z) === 'wall' && exposed(x1 + 1, z)) x1++;
          const w = (x1 - x + 1) * S;
          const g = boxGeometry(w, WALL_H, S, wallMat.userData.tile);
          g.translate(x * S + w / 2, WALL_H / 2, z * S + S / 2);
          wallGeos.push(g);
          this.collision.addBox(new THREE.Vector3(x * S, 0, z * S), new THREE.Vector3((x1 + 1) * S, WALL_H, (z + 1) * S), 'concrete', 'wall');
          x = x1 + 1;
        } else {
          // non-exposed walls still need collision if a player could somehow reach them: not reachable, skip.
          x++;
        }
      }
    }
    if (wallGeos.length) {
      const walls = new THREE.Mesh(mergeGeometries(wallGeos, false), wallMat);
      walls.castShadow = true; walls.receiveShadow = true;
      this.group.add(walls);
    }

    // Wall cap trim (dark band on top of walls) for visual definition
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.9, metalness: 0.1 });
    const capGeos = [];
    for (let z = 0; z < this.rows; z++) {
      let x = 0;
      while (x < this.cols) {
        if (b.get(x, z) === 'wall' && exposed(x, z)) {
          let x1 = x;
          while (x1 + 1 < this.cols && b.get(x1 + 1, z) === 'wall' && exposed(x1 + 1, z)) x1++;
          const w = (x1 - x + 1) * S + 0.1;
          const g = new THREE.BoxGeometry(w, 0.25, S + 0.1);
          g.translate(x * S + (w - 0.1) / 2, WALL_H + 0.125, z * S + S / 2);
          capGeos.push(g);
          x = x1 + 1;
        } else x++;
      }
    }
    if (capGeos.length) {
      const caps = new THREE.Mesh(mergeGeometries(capGeos, false), capMat);
      caps.castShadow = true; caps.receiveShadow = true;
      this.group.add(caps);
    }

    // Crates, tall crates, half walls
    const crateMat = crateMaterial(), metalMat = metalMaterial();
    const halfMat = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.85, metalness: 0.05 });
    const crateGeos = [], tallGeos = [], halfGeos = [];
    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const t = b.get(x, z);
        if (t === 'crate' || t === 'tall' || t === 'half') {
          const h = HEIGHTS[t];
          const inset = t === 'half' ? 0 : 0.06;
          const w = S - inset * 2;
          const mat = t === 'crate' ? crateMat : t === 'tall' ? metalMat : halfMat;
          const g = t === 'half' ? new THREE.BoxGeometry(S, h, S) : boxGeometry(w, h, w, mat.userData.tile);
          g.translate(x * S + S / 2, h / 2, z * S + S / 2);
          (t === 'crate' ? crateGeos : t === 'tall' ? tallGeos : halfGeos).push(g);
          this.collision.addBox(new THREE.Vector3(x * S, 0, z * S), new THREE.Vector3((x + 1) * S, h, (z + 1) * S), t === 'tall' ? 'metal' : t === 'crate' ? 'wood' : 'concrete', t);
        }
      }
    }
    const addMerged = (geos, mat) => {
      if (!geos.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    addMerged(crateGeos, crateMat);
    addMerged(tallGeos, metalMat);
    addMerged(halfGeos, halfMat);

    // Bomb site markers
    for (const site of ['A', 'B']) {
      const cells = this.sites[site];
      if (!cells.length) continue;
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      for (const [x, z] of cells) { minx = Math.min(minx, x); maxx = Math.max(maxx, x + 1); minz = Math.min(minz, z); maxz = Math.max(maxz, z + 1); }
      const w = (maxx - minx) * S, d = (maxz - minz) * S;
      const color = site === 'A' ? 0xffb547 : 0x5ec4ff;
      // painted floor outline
      const outline = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false }));
      outline.rotation.x = -Math.PI / 2;
      outline.position.set(minx * S + w / 2, 0.015, minz * S + d / 2);
      this.group.add(outline);
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
      border.rotation.x = -Math.PI / 2;
      border.position.copy(outline.position).setY(0.02);
      this.group.add(border);
      // big letter on the floor
      const label = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: labelTexture(site, '#ffffff'), transparent: true, opacity: 0.35, depthWrite: false }));
      label.rotation.x = -Math.PI / 2;
      label.position.set(outline.position.x, 0.025, outline.position.z);
      this.group.add(label);
      // hanging sign on a post
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.7 }));
      post.position.set(minx * S + 0.6, 2.5, minz * S + 0.6);
      post.castShadow = true;
      this.group.add(post);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: labelTexture(site, '#111111', site === 'A' ? '#ffb547' : '#5ec4ff'), side: THREE.DoubleSide }));
      sign.position.set(post.position.x + 0.9, 4.4, post.position.z);
      this.group.add(sign);
      this.sites[site + '_center'] = new THREE.Vector3(outline.position.x, 0, outline.position.z);
      this.collision.addBox(new THREE.Vector3(post.position.x - 0.1, 0, post.position.z - 0.1), new THREE.Vector3(post.position.x + 0.1, 5, post.position.z + 0.1), 'metal', 'post');
    }

    // Props
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.5, metalness: 0.8 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 2.5, roughness: 0.4 });
    for (const p of b.props) {
      if (p.kind === 'lamp') {
        const pos = this.center(p.x, p.z);
        // place at the cell edge nearest a wall, fallback center
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.5, 8), lampMat);
        pole.position.set(pos.x, 2.75, pos.z);
        pole.castShadow = true;
        this.group.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), lampMat);
        arm.position.set(pos.x + 0.55, 5.4, pos.z);
        this.group.add(arm);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.4), lampMat);
        head.position.set(pos.x + 1.1, 5.35, pos.z);
        this.group.add(head);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), bulbMat);
        bulb.position.set(pos.x + 1.1, 5.25, pos.z);
        this.group.add(bulb);
        const light = new THREE.PointLight(0xffd9a0, 18, 22, 1.6);
        light.position.set(pos.x + 1.1, 5.0, pos.z);
        this.group.add(light);
        this.lights.push(light);
        this.collision.addBox(new THREE.Vector3(pos.x - 0.12, 0, pos.z - 0.12), new THREE.Vector3(pos.x + 0.12, 5.5, pos.z + 0.12), 'metal', 'pole');
        this.walkable[p.z * this.cols + p.x] = 0; // keep bots from pathing through the pole
      }
    }
  }
}
