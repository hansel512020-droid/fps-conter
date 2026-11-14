import * as THREE from 'three';
import { buildWeaponMesh } from '../weapons/WeaponMeshes.js';

const TEAM_STYLE = {
  T: { jacket: 0x8a7446, pants: 0x4a4536, head: 0x2a2724, skin: 0xd6a57c, boots: 0x2a241c, vest: 0x5b5240 },
  CT: { jacket: 0x2f4a6e, pants: 0x3a4252, head: 0x3c4b5e, skin: 0xd6a57c, boots: 0x1f232b, vest: 0x263548 },
};

function std(color, rough = 0.85, metal = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/**
 * Low-poly humanoid with simple procedural animation.
 * Root is at the feet. Faces -Z.
 */
export class CharacterModel {
  constructor(team) {
    const s = TEAM_STYLE[team];
    this.team = team;
    this.root = new THREE.Group();
    this.body = new THREE.Group();   // lowered when crouching
    this.root.add(this.body);
    this.mats = {
      jacket: std(s.jacket), pants: std(s.pants), head: std(s.head, 0.7), skin: std(s.skin, 0.6),
      boots: std(s.boots, 0.6, 0.1), vest: std(s.vest, 0.9),
    };
    const m = this.mats;

    // Torso
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.27), m.jacket);
    this.torso.position.y = 1.26;
    this.body.add(this.torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.31), m.vest);
    vest.position.y = 1.3;
    this.body.add(vest);
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.25), m.pants);
    hips.position.y = 0.9;
    this.body.add(hips);
    // Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.29), m.boots);
    belt.position.y = 0.99;
    this.body.add(belt);

    // Head + helmet/balaclava
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 1.56;
    this.body.add(this.headGroup);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), m.skin);
    neck.position.y = 0.02;
    this.headGroup.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), m.skin);
    head.position.y = 0.15;
    this.headGroup.add(head);
    if (team === 'CT') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m.head);
      helmet.position.y = 0.16;
      this.headGroup.add(helmet);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), std(0x111418, 0.2, 0.6));
      visor.position.set(0, 0.16, -0.12);
      this.headGroup.add(visor);
    } else {
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.138, 14, 12), m.head);
      mask.position.y = 0.15;
      this.headGroup.add(mask);
      const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), m.skin);
      eyes.position.set(0, 0.17, -0.12);
      this.headGroup.add(eyes);
    }

    // Arms (pivot at shoulders)
    this.armL = this._limb(0.11, 0.58, 0.12, m.jacket, m.skin, 0.1);
    this.armR = this._limb(0.11, 0.58, 0.12, m.jacket, m.skin, 0.1);
    this.armL.position.set(-0.29, 1.5, 0);
    this.armR.position.set(0.29, 1.5, 0);
    this.body.add(this.armL, this.armR);

    // Legs (pivot at hips)
    this.legL = this._limb(0.16, 0.86, 0.18, m.pants, m.boots, 0.14);
    this.legR = this._limb(0.16, 0.86, 0.18, m.pants, m.boots, 0.14);
    this.legL.position.set(-0.11, 0.88, 0);
    this.legR.position.set(0.11, 0.88, 0);
    this.body.add(this.legL, this.legR);

    // Weapon held in front
    this.weaponHolder = new THREE.Group();
    this.weaponHolder.position.set(0.12, 1.28, -0.3);
    this.body.add(this.weaponHolder);
    this.weaponMesh = null;
    this.setWeapon('rifle');

    // aim pose
    this.armR.rotation.x = -1.35; this.armR.rotation.z = -0.15;
    this.armL.rotation.x = -1.2; this.armL.rotation.z = 0.55;

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

    this.phase = 0;
    this.dead = false;
    this.deadT = 0;
    this.fallAxis = 1;
    this.hitFlash = 0;
  }

  _limb(w, len, d, mat, endMat, endLen) {
    const g = new THREE.Group();
    const main = new THREE.Mesh(new THREE.BoxGeometry(w, len - endLen, d), mat);
    main.position.y = -(len - endLen) / 2;
    g.add(main);
    const end = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, endLen, d * 1.15), endMat);
    end.position.y = -(len - endLen) - endLen / 2;
    end.position.z = -d * 0.08;
    g.add(end);
    return g;
  }

  setWeapon(key) {
    if (this.weaponKey === key) return;
    this.weaponKey = key;
    if (this.weaponMesh) this.weaponHolder.remove(this.weaponMesh);
    this.weaponMesh = buildWeaponMesh(key);
    this.weaponMesh.position.set(0, 0, 0.1);
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

  /** Updates pose from character state. */
  update(dt, ch) {
    const r = this.root;
    r.position.copy(ch.position);
    r.rotation.y = ch.yaw;
    if (this.dead) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.45);
      const e = 1 - Math.pow(1 - t, 3);
      if (this.fallDir === 'back') r.rotation.x = -e * Math.PI / 2 * this.fallAxis;
      else r.rotation.z = e * Math.PI / 2 * this.fallAxis;
      r.position.y = ch.position.y + e * 0.12;
      this.body.position.y = 0;
      return;
    }
    // crouch lowers torso and bends legs
    const c = ch.crouchT;
    this.body.position.y = -0.5 * c;
    this.headGroup.rotation.x = -ch.pitch * 0.5;
    this.torso.rotation.x = -ch.pitch * 0.15;
    this.weaponHolder.rotation.x = ch.pitch;
    this.weaponHolder.position.y = 1.28 - 0.02 * c;

    const speed = Math.hypot(ch.velocity.x, ch.velocity.z);
    const moving = speed > 0.3 && ch.onGround;
    this.phase += dt * (moving ? speed * 2.4 : 0);
    const amp = Math.min(1, speed / 4) * 0.65;
    const sw = Math.sin(this.phase) * amp;
    const legBend = 0.95 * c;
    this.legL.rotation.x = sw + legBend;
    this.legR.rotation.x = -sw + legBend;
    this.legL.position.y = 0.88 + 0.5 * c;
    this.legR.position.y = 0.88 + 0.5 * c;
    this.legL.position.z = 0.15 * c; this.legR.position.z = 0.15 * c;
    if (!ch.onGround) { this.legL.rotation.x = 0.3; this.legR.rotation.x = -0.35; }
    // slight body bob while running
    this.torso.position.y = 1.26 + Math.abs(Math.sin(this.phase)) * 0.02 * amp;

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const f = this.hitFlash > 0 ? 0.35 : 0;
      for (const k in this.mats) this.mats[k].emissive.setRGB(f, f * 0.3, f * 0.3);
    }
  }
}
