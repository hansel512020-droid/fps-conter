import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './Physics.js';
import {
  concreteFloor, wallMaterial, crateMaterial, groundOutsideMaterial, labelTexture, asphaltMaterial, brickMaterial, panelMaterial,
  trimMaterial, containerMaterial, barrelMaterial, sandbagMaterial, buildingMaterial, softBlobTexture, hazardTexture,
} from './textures.js';

const WALL_H = 4.2;
const HEIGHTS = { crate: 1.0, tall: 2.0, half: 1.15 };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** Builds one geometry of floor quads (world-space UVs) for a set of cells. */
function floorGeometry(cells, S, tile) {
  const pos = [], uv = [], nrm = [], idx = [];
  cells.forEach(([x, z], i) => {
    const x0 = x * S, x1 = (x + 1) * S, z0 = z * S, z1 = (z + 1) * S;
    pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    uv.push(x0 / tile, z0 / tile, x1 / tile, z0 / tile, x1 / tile, z1 / tile, x0 / tile, z1 / tile);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
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
    this.animated = [];
    this.rnd = mulberry32(1337);
    this._build();
    this.spawnCenter = {};
    for (const team of ['T', 'CT']) {
      const pts = this.spawnPoints(team);
      const c = new THREE.Vector3();
      for (const p of pts) c.add(p.pos);
      this.spawnCenter[team] = pts.length ? c.divideScalar(pts.length) : c;
    }
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

  /** Visual region of a column: used to vary wall / floor materials. */
  _region(x, z) {
    const zone = this.b.getZone(x, z);
    if (zone === 'A' || zone === 'B' || zone === 'T' || zone === 'CT') return 'site';
    if (x <= 17) return 'west';
    if (x >= 38) return 'east';
    return 'mid';
  }

  update(dt, time) {
    for (const a of this.animated) a(dt, time);
  }

  /* ---------- construction ---------- */
  _build() {
    const b = this.b, S = this.cell;
    const addMerged = (geos, mat, shadow = true) => {
      if (!geos.length) return null;
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const t = b.get(x, z);
        this.walkable[z * this.cols + x] = t === 'floor' ? 1 : 0;
        const zone = b.getZone(x, z);
        if (zone === 'A' || zone === 'B') this.sites[zone].push([x, z]);
      }
    }

    // ----- floors: concrete in sites/spawns, asphalt in the lanes
    const floorCells = { concrete: [], asphalt: [] };
    for (let z = 0; z < this.rows; z++) for (let x = 0; x < this.cols; x++) {
      if (b.get(x, z) === 'wall') continue;
      (this._region(x, z) === 'site' ? floorCells.concrete : floorCells.asphalt).push([x, z]);
    }
    for (const [key, mat] of [['concrete', concreteFloor()], ['asphalt', asphaltMaterial()]]) {
      if (!floorCells[key].length) continue;
      const mesh = new THREE.Mesh(floorGeometry(floorCells[key], S, mat.userData.tile), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.collision.addBox(new THREE.Vector3(-50, -2, -50), new THREE.Vector3(this.width + 50, 0, this.depth + 50), 'concrete', 'floor');

    // outside ground
    const gmat = groundOutsideMaterial();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), gmat);
    ground.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 700 / gmat.userData.tile; });
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.width / 2, -0.03, this.depth / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    // ----- walls (merged horizontal runs, material by region) + base trim + cap
    const wallMats = { mid: wallMaterial(), west: brickMaterial(), east: panelMaterial(), site: panelMaterial() };
    const wallGeos = { mid: [], west: [], east: [], site: [] };
    const trimGeos = [], capGeos = [];
    const trimMat = trimMaterial();
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.9, metalness: 0.1 });
    const exposed = (x, z) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (b.get(x + dx, z + dz) !== 'wall') return true;
      return false;
    };
    const regionOfWall = (x, z) => {
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (b.get(x + dx, z + dz) !== 'wall') { const r = this._region(x + dx, z + dz); return r === 'site' ? (x <= 17 ? 'west' : x >= 38 ? 'east' : 'mid') : r; }
      return 'mid';
    };
    for (let z = 0; z < this.rows; z++) {
      let x = 0;
      while (x < this.cols) {
        if (b.get(x, z) === 'wall' && exposed(x, z)) {
          const region = regionOfWall(x, z);
          let x1 = x;
          while (x1 + 1 < this.cols && b.get(x1 + 1, z) === 'wall' && exposed(x1 + 1, z) && regionOfWall(x1 + 1, z) === region) x1++;
          const w = (x1 - x + 1) * S;
          const mat = wallMats[region];
          const g = boxGeometry(w, WALL_H, S, mat.userData.tile);
          g.translate(x * S + w / 2, WALL_H / 2, z * S + S / 2);
          wallGeos[region].push(g);
          const trim = boxGeometry(w + 0.08, 0.9, S + 0.08, trimMat.userData.tile);
          trim.translate(x * S + w / 2, 0.45, z * S + S / 2);
          trimGeos.push(trim);
          const cap = new THREE.BoxGeometry(w + 0.12, 0.28, S + 0.12);
          cap.translate(x * S + w / 2, WALL_H + 0.14, z * S + S / 2);
          capGeos.push(cap);
          this.collision.addBox(new THREE.Vector3(x * S, 0, z * S), new THREE.Vector3((x1 + 1) * S, WALL_H, (z + 1) * S), 'concrete', 'wall');
          x = x1 + 1;
        } else x++;
      }
    }
    for (const r in wallGeos) addMerged(wallGeos[r], wallMats[r]);
    addMerged(trimGeos, trimMat);
    addMerged(capGeos, capMat);

    // ----- crates, containers, half walls
    const crateMat = crateMaterial();
    const halfMat = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.85, metalness: 0.05 });
    const crateGeos = [], halfGeos = [];
    const containerGeos = [[], [], [], []];
    for (let z = 0; z < this.rows; z++) {
      for (let x = 0; x < this.cols; x++) {
        const t = b.get(x, z);
        if (t !== 'crate' && t !== 'tall' && t !== 'half') continue;
        const h = HEIGHTS[t];
        if (t === 'half') {
          const g = new THREE.BoxGeometry(S, h, S);
          g.translate(x * S + S / 2, h / 2, z * S + S / 2);
          halfGeos.push(g);
          // concrete barrier: a lip on top
          const lip = new THREE.BoxGeometry(S + 0.06, 0.1, S + 0.06);
          lip.translate(x * S + S / 2, h + 0.05, z * S + S / 2);
          halfGeos.push(lip);
        } else if (t === 'crate') {
          const w = S - 0.12;
          const g = boxGeometry(w, h, w, crateMat.userData.tile);
          g.translate(x * S + S / 2, h / 2, z * S + S / 2);
          crateGeos.push(g);
        } else {
          const idx = (x * 7 + z * 13) % 4;
          const w = S - 0.1;
          const mat = containerMaterial(idx);
          const g = boxGeometry(w, h, w, mat.userData.tile);
          g.translate(x * S + S / 2, h / 2, z * S + S / 2);
          containerGeos[idx].push(g);
        }
        this.collision.addBox(new THREE.Vector3(x * S, 0, z * S), new THREE.Vector3((x + 1) * S, h, (z + 1) * S), t === 'tall' ? 'metal' : t === 'crate' ? 'wood' : 'concrete', t);
      }
    }
    addMerged(crateGeos, crateMat);
    addMerged(halfGeos, halfMat);
    containerGeos.forEach((geos, i) => addMerged(geos, containerMaterial(i)));

    // ----- bomb site markers
    const hazard = hazardTexture();
    for (const site of ['A', 'B']) {
      const cells = this.sites[site];
      if (!cells.length) continue;
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      for (const [x, z] of cells) { minx = Math.min(minx, x); maxx = Math.max(maxx, x + 1); minz = Math.min(minz, z); maxz = Math.max(maxz, z + 1); }
      const w = (maxx - minx) * S, d = (maxz - minz) * S;
      const cx = minx * S + w / 2, cz = minz * S + d / 2;
      const color = site === 'A' ? 0xffb547 : 0x5ec4ff;
      const outline = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false }));
      outline.rotation.x = -Math.PI / 2;
      outline.position.set(cx, 0.015, cz);
      this.group.add(outline);
      // hazard stripe border
      const stripeMat = new THREE.MeshStandardMaterial({ map: hazard.clone(), roughness: 0.9, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -1 });
      stripeMat.map.repeat.set(w / 1.2, 1);
      stripeMat.map.needsUpdate = true;
      const stripeMatV = stripeMat.clone(); stripeMatV.map = hazard.clone(); stripeMatV.map.repeat.set(d / 1.2, 1); stripeMatV.map.needsUpdate = true;
      const strips = [
        [cx, minz * S + 0.2, w, 0.4, 0, stripeMat], [cx, maxz * S - 0.2, w, 0.4, 0, stripeMat],
        [minx * S + 0.2, cz, d, 0.4, Math.PI / 2, stripeMatV], [maxx * S - 0.2, cz, d, 0.4, Math.PI / 2, stripeMatV],
      ];
      for (const [sx, sz, len, wid, rot, mat] of strips) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, wid), mat);
        m.rotation.set(-Math.PI / 2, 0, rot);
        m.position.set(sx, 0.02, sz);
        m.receiveShadow = true;
        this.group.add(m);
      }
      const label = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: labelTexture(site, '#ffffff'), transparent: true, opacity: 0.3, depthWrite: false }));
      label.rotation.x = -Math.PI / 2;
      label.position.set(cx, 0.025, cz);
      this.group.add(label);
      // sign post in a corner of the site
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 10), new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.7 }));
      post.position.set(minx * S + 0.6, 2.5, minz * S + 0.6);
      post.castShadow = true;
      this.group.add(post);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: labelTexture(site, '#111111', site === 'A' ? '#ffb547' : '#5ec4ff'), side: THREE.DoubleSide }));
      sign.position.set(post.position.x + 0.9, 4.4, post.position.z);
      this.group.add(sign);
      this.sites[site + '_center'] = new THREE.Vector3(cx, 0, cz);
      this.collision.addBox(new THREE.Vector3(post.position.x - 0.1, 0, post.position.z - 0.1), new THREE.Vector3(post.position.x + 0.1, 5, post.position.z + 0.1), 'metal', 'post');
    }

    // ----- floor stains
    const stainTex = softBlobTexture(11, 128, 14);
    const stainMat = new THREE.MeshBasicMaterial({ map: stainTex, color: 0x1a1612, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const stainGeos = [];
    const walk = [];
    for (let z = 0; z < this.rows; z++) for (let x = 0; x < this.cols; x++) if (b.get(x, z) === 'floor') walk.push([x, z]);
    for (let i = 0; i < 45; i++) {
      const [x, z] = walk[Math.floor(this.rnd() * walk.length)];
      const s = 1.5 + this.rnd() * 3;
      const g = new THREE.PlaneGeometry(s, s);
      g.rotateX(-Math.PI / 2);
      g.rotateY(this.rnd() * 6.28);
      g.translate((x + 0.5) * S + (this.rnd() - 0.5), 0.012, (z + 0.5) * S + (this.rnd() - 0.5));
      stainGeos.push(g);
    }
    const stains = new THREE.Mesh(mergeGeometries(stainGeos, false), stainMat);
    this.group.add(stains);

    // ----- props
    this._buildProps();
    this._buildSkyline();
  }

  _buildProps() {
    const b = this.b, S = this.cell;
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.5, metalness: 0.8 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 2.5, roughness: 0.4 });
    const sandMat = sandbagMaterial();
    const woodMat = crateMaterial();
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.8 });
    const block = (pos, hw, h, material, tag) => {
      this.collision.addBox(new THREE.Vector3(pos.x - hw, 0, pos.z - hw), new THREE.Vector3(pos.x + hw, h, pos.z + hw), material, tag);
    };
    for (const p of b.props) {
      const pos = this.center(p.x, p.z);
      const [cx, cz] = [p.x, p.z];
      switch (p.kind) {
        case 'lamp': {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.5, 10), lampMat);
          pole.position.set(pos.x, 2.75, pos.z);
          pole.castShadow = true;
          this.group.add(pole);
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.25, 10), lampMat);
          base.position.set(pos.x, 0.12, pos.z);
          this.group.add(base);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), lampMat);
          arm.position.set(pos.x + 0.55, 5.4, pos.z);
          this.group.add(arm);
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.4), lampMat);
          head.position.set(pos.x + 1.1, 5.35, pos.z);
          this.group.add(head);
          const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), bulbMat);
          bulb.position.set(pos.x + 1.1, 5.25, pos.z);
          this.group.add(bulb);
          const light = new THREE.PointLight(0xffd9a0, 14, 20, 1.6);
          light.position.set(pos.x + 1.1, 5.0, pos.z);
          this.group.add(light);
          this.lights.push(light);
          block(pos, 0.12, 5.5, 'metal', 'pole');
          this.walkable[cz * this.cols + cx] = 0;
          break;
        }
        case 'barrels': {
          const n = 3;
          const spots = [[-0.45, -0.4], [0.5, -0.3], [0.0, 0.5]];
          for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 16), barrelMaterial((cx + i) % 3));
            m.position.set(pos.x + spots[i][0], 0.475, pos.z + spots[i][1]);
            m.rotation.y = this.rnd() * 6.28;
            m.castShadow = true; m.receiveShadow = true;
            this.group.add(m);
            const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), pipeMat);
            top.position.set(m.position.x, 0.96, m.position.z);
            this.group.add(top);
          }
          block(pos, 0.9, 0.98, 'metal', 'barrels');
          this.walkable[cz * this.cols + cx] = 0;
          break;
        }
        case 'sandbags': {
          const rows = [[0, 0.17, 4], [0.2, 0.47, 3], [0.1, 0.74, 2]];
          const along = p.axis === 'z' ? 'z' : 'x';
          for (const [off, y, count] of rows) {
            for (let i = 0; i < count; i++) {
              const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), sandMat);
              bag.scale.set(1.25, 0.7, 1);
              const t = (i - (count - 1) / 2) * 0.48;
              bag.position.set(pos.x + (along === 'x' ? t : off * 0.6), y, pos.z + (along === 'z' ? t : off * 0.6));
              bag.rotation.set(0, along === 'x' ? 0 : Math.PI / 2, Math.PI / 2);
              bag.rotation.y += (this.rnd() - 0.5) * 0.3;
              bag.castShadow = true; bag.receiveShadow = true;
              this.group.add(bag);
            }
          }
          const hw = along === 'x' ? [1.0, 0.45] : [0.45, 1.0];
          this.collision.addBox(new THREE.Vector3(pos.x - hw[0], 0, pos.z - hw[1]), new THREE.Vector3(pos.x + hw[0], 0.95, pos.z + hw[1]), 'concrete', 'sandbags');
          this.walkable[cz * this.cols + cx] = 0;
          break;
        }
        case 'pallets': {
          const n = p.count || 3;
          for (let i = 0; i < n; i++) {
            const pal = new THREE.Group();
            for (let s = 0; s < 5; s++) { const slat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.14), woodMat); slat.position.set(0, 0.13, -0.5 + s * 0.25); pal.add(slat); }
            for (let s = 0; s < 3; s++) { const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), woodMat); beam.position.set(-0.5 + s * 0.5, 0.06, 0); pal.add(beam); }
            pal.position.set(pos.x, i * 0.16, pos.z);
            pal.rotation.y = (this.rnd() - 0.5) * 0.25;
            pal.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
            this.group.add(pal);
          }
          this.collision.addBox(new THREE.Vector3(pos.x - 0.6, 0, pos.z - 0.6), new THREE.Vector3(pos.x + 0.6, n * 0.16 + 0.02, pos.z + 0.6), 'wood', 'pallets');
          break;
        }
        case 'pipe': {
          // vertical pipe running up a wall face; p.side: which neighbour is the wall
          const dir = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[p.side || 'n'];
          const px = pos.x + dir[0] * (S / 2 - 0.2), pz = pos.z + dir[1] * (S / 2 - 0.2);
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, WALL_H + 0.4, 12), pipeMat);
          pipe.position.set(px, (WALL_H + 0.4) / 2, pz);
          pipe.castShadow = true;
          this.group.add(pipe);
          for (const y of [0.8, 2.4, 3.9]) {
            const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.3), pipeMat);
            bracket.position.set(px, y, pz);
            bracket.rotation.y = dir[0] !== 0 ? Math.PI / 2 : 0;
            this.group.add(bracket);
          }
          const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 12), pipeMat);
          elbow.rotation.z = Math.PI / 2;
          elbow.position.set(px, WALL_H + 0.3, pz);
          this.group.add(elbow);
          break;
        }
        case 'ac': {
          const dir = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[p.side || 'n'];
          const unit = new THREE.Mesh(new THREE.BoxGeometry(dir[0] !== 0 ? 0.5 : 1.1, 0.7, dir[0] !== 0 ? 1.1 : 0.5), pipeMat);
          unit.position.set(pos.x + dir[0] * (S / 2 - 0.28), 2.8, pos.z + dir[1] * (S / 2 - 0.28));
          unit.castShadow = true;
          this.group.add(unit);
          const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.8 }));
          grille.position.copy(unit.position).add(new THREE.Vector3(-dir[0] * 0.26, 0, -dir[1] * 0.26));
          grille.rotation.set(dir[1] !== 0 ? Math.PI / 2 : 0, 0, dir[0] !== 0 ? Math.PI / 2 : 0);
          this.group.add(grille);
          break;
        }
        case 'tank': {
          // elevated water tank on four legs (walkable underneath)
          const tankMat = containerMaterial(2);
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 20), tankMat);
          tank.position.set(pos.x, 5.0, pos.z);
          tank.castShadow = true;
          this.group.add(tank);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.8, 20), pipeMat);
          cap.position.set(pos.x, 6.6, pos.z);
          this.group.add(cap);
          for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.9, 8), pipeMat);
            leg.position.set(pos.x + lx * 1.1, 1.95, pos.z + lz * 1.1);
            leg.castShadow = true;
            this.group.add(leg);
            this.collision.addBox(new THREE.Vector3(leg.position.x - 0.12, 0, leg.position.z - 0.12), new THREE.Vector3(leg.position.x + 0.12, 3.9, leg.position.z + 0.12), 'metal', 'leg');
          }
          this.collision.addBox(new THREE.Vector3(pos.x - 1.7, 3.8, pos.z - 1.7), new THREE.Vector3(pos.x + 1.7, 6.3, pos.z + 1.7), 'metal', 'tank');
          break;
        }
      }
    }
    // floodlight towers at the four corners of the yard (outside the walls, visual)
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x3f454c, roughness: 0.55, metalness: 0.7 });
    for (const [tx, tz] of [[-3, -3], [this.width + 3, -3], [-3, this.depth + 3], [this.width + 3, this.depth + 3]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, 16, 10), towerMat);
      pole.position.set(tx, 8, tz);
      pole.castShadow = true;
      this.group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.6), towerMat);
      head.position.set(tx, 16, tz);
      head.lookAt(this.width / 2, 16, this.depth / 2);
      this.group.add(head);
      for (let i = -1; i <= 1; i++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.1), bulbMat);
        lamp.position.set(i * 0.7, -0.05, -0.33);
        head.add(lamp);
      }
    }
  }

  _buildSkyline() {
    // distant warehouses / towers around the yard, fading into the fog
    const rnd = mulberry32(99);
    const cx = this.width / 2, cz = this.depth / 2;
    const geos = [[], [], [], []];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.1;
      const dist = 95 + rnd() * 90;
      const w = 14 + rnd() * 30, d = 14 + rnd() * 30, h = 8 + rnd() * (rnd() < 0.2 ? 40 : 16);
      const x = cx + Math.cos(a) * dist, z = cz + Math.sin(a) * dist;
      const idx = Math.floor(rnd() * 4);
      const g = boxGeometry(w, h, d, buildingMaterial(idx).userData.tile);
      g.translate(x, h / 2 - 0.5, z);
      geos[idx].push(g);
    }
    geos.forEach((gs, i) => {
      if (!gs.length) return;
      const m = new THREE.Mesh(mergeGeometries(gs, false), buildingMaterial(i));
      m.castShadow = false; m.receiveShadow = false;
      this.group.add(m);
    });
    // cranes
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xc8502a, roughness: 0.6, metalness: 0.4 });
    for (const [x, z, rot] of [[cx + 120, cz - 70, 0.6], [cx - 130, cz + 40, -1.2]]) {
      const crane = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.BoxGeometry(2.5, 48, 2.5), craneMat); mast.position.y = 24; crane.add(mast);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 2), craneMat); jib.position.set(18, 48, 0); crane.add(jib);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 3), craneMat); counter.position.set(-14, 46, 0); crane.add(counter);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3.5), new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.7 })); cab.position.set(3, 45.5, 0); crane.add(cab);
      crane.position.set(x, 0, z); crane.rotation.y = rot;
      this.group.add(crane);
    }
    // clouds
    const cloudTex = softBlobTexture(23, 256, 20);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.55 + rnd() * 0.25, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m);
      const a = rnd() * Math.PI * 2, dist = 120 + rnd() * 160;
      s.position.set(cx + Math.cos(a) * dist, 90 + rnd() * 70, cz + Math.sin(a) * dist);
      const sc = 90 + rnd() * 120;
      s.scale.set(sc, sc * (0.35 + rnd() * 0.2), 1);
      this.group.add(s);
      const speed = 0.4 + rnd() * 0.5;
      this.animated.push((dt) => { s.position.x += speed * dt; if (s.position.x > cx + 320) s.position.x = cx - 320; });
    }
  }
}
