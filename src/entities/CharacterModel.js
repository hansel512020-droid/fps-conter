import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildWeaponMesh } from '../weapons/WeaponMeshes.js';

const TEAM_STYLE = {
  T: { jacket: 0x7d6a45, pants: 0x4b4636, head: 0x24211e, skin: 0xd6a57c, boots: 0x2a241c, vest: 0x514838, glove: 0x2a2520, accent: 0xb7462e },
  CT: { jacket: 0x2c4466, pants: 0x343b49, head: 0x3a4757, skin: 0xd6a57c, boots: 0x1f232b, vest: 0x222c3a, glove: 0x1b1e24, accent: 0x5ec4ff },
};

function std(color, rough = 0.85, metal = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

// shared geometries (cheap to reuse)
const GEO = {};
function geo(key, make) { return GEO[key] || (GEO[key] = make()); }
const capsule = (r, len, key) => geo(key || `cap${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));
const rbox = (w, h, d, r = 0.02, key) => geo(key || `rb${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const sphere = (r, key) => geo(key || `sp${r}`, () => new THREE.SphereGeometry(r, 16, 12));

/**
 * Procedural humanoid built from capsules and rounded boxes, with a two-bone
 * walk cycle, crouch pose, aim pose and a fall-over death.
 * Root is at the feet, faces -Z.
 */
export class CharacterModel {
  constructor(team) {
    const s = TEAM_STYLE[team];
    this.team = team;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mats = {
      jacket: std(s.jacket, 0.9), pants: std(s.pants, 0.9), head: std(s.head, 0.7), skin: std(s.skin, 0.6),
      boots: std(s.boots, 0.55, 0.1), vest: std(s.vest, 0.85), glove: std(s.glove, 0.8), accent: std(s.accent, 0.6),
      dark: std(0x1a1c20, 0.5, 0.3),
    };
    const m = this.mats;
    const mesh = (g, mat) => { const o = new THREE.Mesh(g, mat); o.castShadow = true; return o; };

    // ----- torso
    this.torso = new THREE.Group();
    this.torso.position.y = 1.02;
    this.body.add(this.torso);
    const chest = mesh(capsule(0.2, 0.3, 'chest'), m.jacket);
    chest.scale.set(1.15, 1, 0.72);
    chest.position.y = 0.3;
    this.torso.add(chest);
    const vest = mesh(rbox(0.46, 0.4, 0.32, 0.06, 'vest'), m.vest);
    vest.position.y = 0.3;
    this.torso.add(vest);
    // pouches on the vest front
    for (let i = -1; i <= 1; i++) {
      const p = mesh(rbox(0.1, 0.12, 0.07, 0.015, 'pouch'), m.vest);
      p.position.set(i * 0.13, 0.2, -0.19);
      this.torso.add(p);
    }
    // backpack / radio
    const pack = mesh(rbox(0.3, 0.3, 0.14, 0.04, 'pack'), m.vest);
    pack.position.set(0, 0.32, 0.2);
    this.torso.add(pack);
    // shoulder pads
    for (const sx of [-1, 1]) {
      const sh = mesh(sphere(0.095, 'shoulder'), m.jacket);
      sh.position.set(sx * 0.26, 0.47, 0);
      this.torso.add(sh);
    }
    // belt + pelvis
    const pelvis = mesh(rbox(0.38, 0.22, 0.28, 0.06, 'pelvis'), m.pants);
    pelvis.position.y = -0.05;
    this.torso.add(pelvis);
    const belt = mesh(rbox(0.42, 0.06, 0.31, 0.02, 'belt'), m.dark);
    belt.position.y = 0.06;
    this.torso.add(belt);

    // ----- head
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.52;
    this.torso.add(this.headGroup);
    const neck = mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.12, 10), m.skin);
    neck.position.y = 0.03;
    this.headGroup.add(neck);
    const head = mesh(sphere(0.125, 'head'), m.skin);
    head.position.y = 0.17;
    head.scale.set(1, 1.1, 1.05);
    this.headGroup.add(head);
    if (team === 'CT') {
      const helmet = mesh(geo('helmet', () => new THREE.SphereGeometry(0.15, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58)), m.head);
      helmet.position.y = 0.185;
      helmet.scale.set(1, 1, 1.08);
      this.headGroup.add(helmet);
      const brim = mesh(geo('brim', () => new THREE.TorusGeometry(0.15, 0.018, 8, 24)), m.head);
      brim.rotation.x = Math.PI / 2;
      brim.position.y = 0.17;
      this.headGroup.add(brim);
      const goggles = mesh(rbox(0.2, 0.06, 0.08, 0.02, 'goggles'), m.dark);
      goggles.position.set(0, 0.2, -0.13);
      this.headGroup.add(goggles);
      const lens = mesh(rbox(0.17, 0.035, 0.02, 0.01, 'lens'), std(0x4a7fb5, 0.15, 0.7));
      lens.position.set(0, 0.2, -0.17);
      this.headGroup.add(lens);
      const strap = mesh(rbox(0.28, 0.025, 0.3, 0.005, 'strap'), m.dark);
      strap.position.set(0, 0.18, 0);
      this.headGroup.add(strap);
    } else {
      const mask = mesh(sphere(0.133, 'mask'), m.head);
      mask.position.y = 0.17;
      mask.scale.set(1, 1.1, 1.05);
      this.headGroup.add(mask);
      const eyes = mesh(rbox(0.17, 0.04, 0.05, 0.01, 'eyes'), m.skin);
      eyes.position.set(0, 0.19, -0.125);
      this.headGroup.add(eyes);
      const band = mesh(rbox(0.29, 0.05, 0.29, 0.01, 'band'), m.accent);
      band.position.set(0, 0.25, 0);
      this.headGroup.add(band);
      const tail = mesh(rbox(0.05, 0.16, 0.02, 0.005, 'tail'), m.accent);
      tail.position.set(0.05, 0.17, 0.15);
      tail.rotation.x = 0.4;
      this.headGroup.add(tail);
    }

    // ----- arms (shoulder pivot -> upper arm, elbow pivot -> forearm + hand)
    const mkArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.3, 0.45, 0);
      const upper = mesh(capsule(0.065, 0.24, 'upperarm'), m.jacket);
      upper.position.y = -0.15;
      sh.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      sh.add(elbow);
      const fore = mesh(capsule(0.055, 0.24, 'forearm'), m.jacket);
      fore.position.y = -0.14;
      elbow.add(fore);
      const hand = mesh(rbox(0.08, 0.1, 0.07, 0.025, 'hand'), m.glove);
      hand.position.y = -0.31;
      elbow.add(hand);
      this.torso.add(sh);
      return { sh, elbow };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // ----- legs (hip pivot -> thigh, knee pivot -> shin + boot)
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.11, 0.92, 0);
      const thigh = mesh(capsule(0.09, 0.3, 'thigh'), m.pants);
      thigh.position.y = -0.2;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      const shin = mesh(capsule(0.07, 0.3, 'shin'), m.pants);
      shin.position.y = -0.2;
      knee.add(shin);
      if (team === 'CT') {
        const pad = mesh(rbox(0.13, 0.12, 0.08, 0.03, 'pad'), m.dark);
        pad.position.set(0, -0.08, -0.06);
        knee.add(pad);
      }
      const boot = mesh(rbox(0.15, 0.13, 0.27, 0.04, 'boot'), m.boots);
      boot.position.set(0, -0.44, -0.04);
      knee.add(boot);
      this.body.add(hip);
      return { hip, knee };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // ----- weapon held in front of the chest
    this.weaponHolder = new THREE.Group();
    this.weaponHolder.position.set(0.1, 0.27, -0.32);
    this.torso.add(this.weaponHolder);
    this.weaponMesh = null;
    this.setWeapon('rifle');

    this.phase = 0;
    this.dead = false;
    this.deadT = 0;
    this.fallAxis = 1;
    this.hitFlash = 0;
    this._aimPose(0);
  }

  _aimPose(pitch) {
    // Euler XYZ: Rz swings the hanging arm sideways, then Rx swings it forward (-Z).
    // right arm: upper arm down-forward, forearm forward to the grip
    this.armR.sh.rotation.set(0.75 + pitch * 0.6, 0, -0.15);
    this.armR.elbow.rotation.set(0.95, 0, 0);
    // left arm: reaches across the chest to the handguard
    this.armL.sh.rotation.set(1.15 + pitch * 0.6, 0, 0.55);
    this.armL.elbow.rotation.set(0.45, 0, 0);
  }

  setWeapon(key) {
    if (this.weaponKey === key) return;
    this.weaponKey = key;
    if (this.weaponMesh) this.weaponHolder.remove(this.weaponMesh);
    this.weaponMesh = buildWeaponMesh(key);
    this.weaponMesh.position.set(0, 0, 0.12);
    if (key.startsWith('grenade') || key === 'bomb') this.weaponMesh.position.set(0.15, -0.05, 0.05);
    this.weaponHolder.add(this.weaponMesh);
  }

  getMuzzleWorld(out = new THREE.Vector3()) {
    const m = this.weaponMesh?.getObjectByName('muzzle');
    if (!m) return out.copy(this.root.position).add(new THREE.Vector3(0, 1.3, 0));
    return m.getWorldPosition(out);
  }

  reset() {
    this.dead = false; this.deadT = 0;
    this.root.rotation.set(0, 0, 0);
    this.body.position.y = 0;
    this.root.visible = true;
  }

  die() {
    this.dead = true; this.deadT = 0;
    this.fallAxis = Math.random() < 0.5 ? 1 : -1;
    this.fallDir = Math.random() < 0.6 ? 'back' : 'side';
  }

  flash() { this.hitFlash = 0.12; }

  update(dt, ch) {
    const r = this.root;
    r.position.copy(ch.position);
    r.rotation.y = ch.yaw;
    if (this.dead) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.5);
      const e = 1 - Math.pow(1 - t, 3);
      if (this.fallDir === 'back') r.rotation.x = -e * Math.PI / 2 * this.fallAxis;
      else r.rotation.z = e * Math.PI / 2 * this.fallAxis;
      r.position.y = ch.position.y + e * 0.1;
      // limbs go limp
      this.armL.sh.rotation.set(-0.3 * e, 0, 0.5 * e); this.armR.sh.rotation.set(-0.2 * e, 0, -0.6 * e);
      this.armL.elbow.rotation.set(-0.3, 0, 0); this.armR.elbow.rotation.set(-0.3, 0, 0);
      this.legL.hip.rotation.x = 0.15 * e; this.legR.hip.rotation.x = -0.25 * e;
      this.legL.knee.rotation.x = 0.3 * e; this.legR.knee.rotation.x = 0.5 * e;
      return;
    }
    const c = ch.crouchT;
    const speed = Math.hypot(ch.velocity.x, ch.velocity.z);
    const moving = speed > 0.3 && ch.onGround;
    this.phase += dt * (moving ? speed * 2.3 : 0);
    const amp = Math.min(1, speed / 4.5);
    const sw = Math.sin(this.phase);

    // torso: lowered when crouching, slight lean and bob when running
    this.body.position.y = -0.48 * c;
    this.torso.rotation.x = -0.18 * c - ch.pitch * 0.12 + Math.abs(sw) * 0.03 * amp;
    this.torso.rotation.y = Math.sin(this.phase) * 0.06 * amp;
    this.torso.position.y = 1.02 + Math.abs(Math.cos(this.phase)) * 0.025 * amp;
    this.headGroup.rotation.x = -ch.pitch * 0.55 + 0.18 * c;
    this.weaponHolder.rotation.x = ch.pitch;
    this._aimPose(ch.pitch);

    // legs: two-bone cycle; crouch bends knees
    const legSwing = 0.65 * amp;
    const kneeBend = (p) => Math.max(0, -Math.sin(p)) * 1.1 * amp; // bend while the leg swings back/forward
    this.legL.hip.rotation.x = sw * legSwing + 0.95 * c;
    this.legR.hip.rotation.x = -sw * legSwing + 0.95 * c;
    this.legL.knee.rotation.x = -kneeBend(this.phase) - 1.35 * c;
    this.legR.knee.rotation.x = -kneeBend(this.phase + Math.PI) - 1.35 * c;
    this.legL.hip.position.y = 0.92 + 0.48 * c; this.legR.hip.position.y = 0.92 + 0.48 * c;
    this.legL.hip.position.z = 0.12 * c; this.legR.hip.position.z = 0.12 * c;
    if (!ch.onGround) { this.legL.hip.rotation.x = 0.35; this.legR.hip.rotation.x = -0.3; this.legL.knee.rotation.x = -0.6; this.legR.knee.rotation.x = -0.9; }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = this.hitFlash > 0 ? 0.35 : 0;
      for (const k in this.mats) this.mats[k].emissive.setRGB(f, f * 0.3, f * 0.3);
    }
  }
}
