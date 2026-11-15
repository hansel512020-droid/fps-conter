import * as THREE from 'three';
import { buildWeaponMesh } from './WeaponMeshes.js';

const REST = {
  rifle: { pos: [0.15, -0.15, -0.30], rot: [0.03, 0.16, -0.05] },
  carbine: { pos: [0.15, -0.15, -0.30], rot: [0.03, 0.16, -0.05] },
  smg: { pos: [0.14, -0.14, -0.28], rot: [0.03, 0.16, -0.05] },
  shotgun: { pos: [0.15, -0.15, -0.30], rot: [0.03, 0.16, -0.05] },
  sniper: { pos: [0.15, -0.16, -0.30], rot: [0.03, 0.14, -0.05] },
  pistol: { pos: [0.14, -0.12, -0.28], rot: [0, 0.0, 0] },
  heavy_pistol: { pos: [0.14, -0.12, -0.28], rot: [0, 0.0, 0] },
  knife: { pos: [0.17, -0.13, -0.27], rot: [0.25, -0.75, 0.35] },
  grenade_he: { pos: [0.19, -0.14, -0.3], rot: [0.3, -0.5, 0.2] },
  grenade_flash: { pos: [0.19, -0.14, -0.3], rot: [0.3, -0.5, 0.2] },
  grenade_smoke: { pos: [0.19, -0.14, -0.3], rot: [0.3, -0.5, 0.2] },
  bomb: { pos: [0.1, -0.2, -0.34], rot: [0.45, -0.25, 0.05] },
};

const SLEEVE = { T: 0x4a4030, CT: 0x22303f };

/**
 * First-person weapon rendered in its own scene/camera (no clipping with walls).
 */
export class ViewModel {
  constructor(team) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
    this.scene.add(this.camera);
    this.team = team;

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4030, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
    this.sun.position.set(2, 4, 1);
    this.scene.add(this.sun);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 3, 2);
    this.scene.add(this.flashLight);

    this.rig = new THREE.Group();
    this.rig.scale.setScalar(0.62);
    this.camera.add(this.rig);
    this.weaponKey = null;
    this.weaponMesh = null;
    this.arms = new THREE.Group();
    this.rig.add(this.arms);
    this._buildArms();

    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeFlashTexture(), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthTest: false, transparent: true, opacity: 0 }));
    this.flashSprite.scale.set(0.22, 0.22, 1);
    this.rig.add(this.flashSprite);

    this.swayX = 0; this.swayY = 0;
    this.bobT = 0;
    this.recoilZ = 0; this.recoilRot = 0; this.recoilSide = 0;
    this.flashTimer = 0;
    this.landT = 0;
    this.prevOnGround = true;
    this.prevVy = 0;
    this.tmpPos = new THREE.Vector3();
    this.tmpRot = new THREE.Euler();
    this.visible = true;
  }

  _buildArms() {
    this.armMats = {
      sleeve: new THREE.MeshStandardMaterial({ color: SLEEVE[this.team], roughness: 0.9 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.75 }),
    };
  }

  /** Builds a limb segment between two points in rig space. */
  _limb(from, to, thick, mat) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), mat);
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    return m;
  }

  _hand(at, size, mat, rot = [0, 0, 0]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    m.position.set(...at);
    m.rotation.set(...rot);
    return m;
  }

  _buildArmsFor(key) {
    this.arms.clear();
    const { sleeve, glove } = this.armMats;
    const parts = [];
    if (key === 'pistol') {
      parts.push(this._hand([0.0, -0.085, 0.035], [0.075, 0.1, 0.07], glove, [0.1, 0, 0]));
      parts.push(this._limb([0.02, -0.12, 0.06], [0.24, -0.42, 0.42], 0.08, sleeve));
      parts.push(this._hand([-0.03, -0.1, 0.02], [0.06, 0.08, 0.07], glove, [0, 0.3, 0.2]));
      parts.push(this._limb([-0.04, -0.13, 0.05], [-0.2, -0.42, 0.4], 0.08, sleeve));
    } else if (key === 'knife') {
      parts.push(this._hand([0.0, -0.015, 0.07], [0.06, 0.07, 0.1], glove));
      parts.push(this._limb([0.02, -0.06, 0.12], [0.24, -0.42, 0.44], 0.08, sleeve));
    } else if (key.startsWith('grenade')) {
      parts.push(this._hand([0.0, -0.045, 0.02], [0.075, 0.07, 0.09], glove));
      parts.push(this._limb([0.02, -0.09, 0.08], [0.24, -0.42, 0.44], 0.08, sleeve));
    } else if (key === 'bomb') {
      parts.push(this._hand([0.16, 0.02, 0.02], [0.06, 0.08, 0.1], glove));
      parts.push(this._limb([0.18, -0.02, 0.08], [0.3, -0.4, 0.42], 0.08, sleeve));
      parts.push(this._hand([-0.16, 0.02, 0.02], [0.06, 0.08, 0.1], glove));
      parts.push(this._limb([-0.18, -0.02, 0.08], [-0.28, -0.4, 0.42], 0.08, sleeve));
    } else {
      // rifles / smg: right hand on the grip, left hand on the handguard
      parts.push(this._hand([0.0, -0.1, 0.07], [0.075, 0.11, 0.08], glove, [-0.25, 0, 0]));
      parts.push(this._limb([0.03, -0.19, 0.13], [0.26, -0.44, 0.4], 0.085, sleeve));
      const hz = key === 'smg' ? -0.2 : -0.36;
      parts.push(this._hand([0.0, -0.06, hz], [0.075, 0.085, 0.1], glove, [0, 0, 0.25]));
      parts.push(this._limb([-0.02, -0.1, hz + 0.02], [-0.22, -0.44, 0.36], 0.085, sleeve));
    }
    for (const p of parts) { p.castShadow = false; this.arms.add(p); }
  }

  setWeapon(key) {
    if (key === this.weaponKey) return;
    this.weaponKey = key;
    if (this.weaponMesh) this.rig.remove(this.weaponMesh);
    this.weaponMesh = buildWeaponMesh(key);
    this.weaponMesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.rig.add(this.weaponMesh);
    const rest = REST[key] || REST.rifle;
    this.restPos = new THREE.Vector3(...rest.pos);
    this.restRot = new THREE.Euler(...rest.rot);
    this.muzzle = this.weaponMesh.getObjectByName('muzzle');
    this._buildArmsFor(key);
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  throwAnim() { this.throwT = 0.4; }

  kick(def) {
    if (def.type === 'grenade') { this.throwAnim(); return; }
    const s = def.type === 'pistol' ? 0.6 : def.type === 'melee' ? 1.2 : def.type === 'sniper' || def.type === 'shotgun' ? 2.2 : 1;
    this.recoilZ += 0.045 * s;
    this.recoilRot += 0.07 * s;
    this.recoilSide += (Math.random() - 0.5) * 0.02;
    if (def.type !== 'melee') {
      this.flashTimer = 0.045;
      this.flashSprite.material.rotation = Math.random() * Math.PI * 2;
      this.flashSprite.scale.setScalar(0.16 + Math.random() * 0.14);
    }
  }

  /** Muzzle position in main-camera-local space -> world (both cameras share orientation). */
  getMuzzleWorld(mainCamera, out = new THREE.Vector3()) {
    if (!this.muzzle) return out.copy(mainCamera.position);
    this.muzzle.getWorldPosition(out); // in VM camera space == main camera local space (camera at origin)
    return mainCamera.localToWorld(out);
  }

  update(dt, s) {
    // s: { dx, dy, speedRatio, onGround, crouchT, reloadProgress (0..1 or -1), drawProgress (0..1), vy }
    const k = 1 - Math.exp(-dt * 10);
    this.swayX += ((-s.dx * 0.0009) - this.swayX) * k;
    this.swayY += ((-s.dy * 0.0009) - this.swayY) * k;
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.05, 0.05);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.04, 0.04);

    const moving = s.onGround && s.speedRatio > 0.05;
    this.bobT += dt * (moving ? 9 * (0.6 + s.speedRatio) : 0);
    const bobAmp = moving ? 0.012 * s.speedRatio * (s.crouchT > 0.5 ? 0.5 : 1) : 0;
    const bobX = Math.sin(this.bobT) * bobAmp;
    const bobY = Math.abs(Math.cos(this.bobT)) * bobAmp * 0.9;

    // landing dip
    if (s.onGround && !this.prevOnGround) this.landT = Math.min(0.5, Math.abs(this.prevVy) * 0.04);
    this.prevOnGround = s.onGround; this.prevVy = s.vy;
    this.landT = Math.max(0, this.landT - dt * 1.6);
    const landDip = Math.sin(Math.min(1, this.landT / 0.3) * Math.PI) * 0.05;

    // recoil recovery
    this.recoilZ *= Math.exp(-dt * 14);
    this.recoilRot *= Math.exp(-dt * 12);
    this.recoilSide *= Math.exp(-dt * 10);

    // reload animation: weapon dips and tilts
    let rlY = 0, rlRot = 0, rlRotZ = 0;
    if (s.reloadProgress >= 0) {
      const p = s.reloadProgress;
      const env = Math.sin(Math.min(1, p * 1.15) * Math.PI);
      rlY = -0.12 * env;
      rlRot = 0.35 * env;
      rlRotZ = -0.45 * env;
    }
    // draw animation: rises from below
    let drawY = 0, drawRot = 0;
    if (s.drawProgress < 1) {
      const p = 1 - s.drawProgress;
      drawY = -0.35 * p * p;
      drawRot = 0.8 * p;
    }
    // crouch: weapon slightly closer
    const crouchZ = 0.02 * s.crouchT;
    // grenade throw: wind back then snap forward
    let thZ = 0, thRot = 0, thY = 0;
    if (this.throwT > 0) {
      this.throwT -= dt;
      const t = 1 - Math.max(0, this.throwT) / 0.4;
      const back = t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.25);
      thZ = 0.12 * back; thRot = -0.9 * back; thY = 0.08 * back;
      if (t > 0.3 && t < 0.6) thZ -= 0.15 * ((t - 0.3) / 0.3);
    }

    const r = this.restPos || new THREE.Vector3();
    this.rig.position.set(
      r.x + this.swayX + bobX + this.recoilSide,
      r.y + this.swayY + bobY + rlY + drawY + thY - landDip - (s.onGround ? 0 : 0.01),
      r.z + this.recoilZ + crouchZ + thZ,
    );
    const rr = this.restRot || new THREE.Euler();
    this.rig.rotation.set(
      rr.x - this.recoilRot + rlRot + drawRot + thRot + this.swayY * 1.5,
      rr.y + this.swayX * 1.2,
      rr.z + rlRotZ + bobX * 1.5,
    );

    // muzzle flash sprite
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flashSprite.material.opacity = 1;
      if (this.muzzle) {
        this.muzzle.getWorldPosition(this.tmpPos);
        this.rig.worldToLocal(this.tmpPos);
        this.flashSprite.position.copy(this.tmpPos);
      }
      this.flashLight.intensity = 6;
      this.flashLight.position.copy(this.flashSprite.position).applyMatrix4(this.rig.matrixWorld);
    } else {
      this.flashSprite.material.opacity = 0;
      this.flashLight.intensity = 0;
    }
  }

  render(renderer) {
    if (!this.visible) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.25, 'rgba(255,210,120,0.9)');
  g.addColorStop(0.6, 'rgba(255,140,40,0.25)');
  g.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // star spikes
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,230,170,0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { makeFlashTexture };
