import * as THREE from 'three';
import { buildWeaponMesh } from './WeaponMeshes.js';

const REST = {
  rifle: { pos: [0.16, -0.17, -0.30], rot: [0, 0.03, 0] },
  carbine: { pos: [0.16, -0.17, -0.30], rot: [0, 0.03, 0] },
  smg: { pos: [0.15, -0.16, -0.28], rot: [0, 0.03, 0] },
  pistol: { pos: [0.13, -0.15, -0.30], rot: [0, 0.0, 0] },
  knife: { pos: [0.16, -0.19, -0.26], rot: [0.1, -0.5, 0.3] },
};

const SLEEVE = { T: 0x8a7446, CT: 0x2f4a6e };

/**
 * First-person weapon rendered in its own scene/camera (no clipping with walls).
 */
export class ViewModel {
  constructor(team) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
    this.scene.add(this.camera);
    this.team = team;

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4030, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
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
    const sleeve = new THREE.MeshStandardMaterial({ color: SLEEVE[this.team], roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd6a57c, roughness: 0.6 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x1f1f22, roughness: 0.8 });
    // right arm: from grip down-right toward the camera
    const ra = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.42), sleeve);
    ra.position.set(0.02, -0.17, 0.28);
    ra.rotation.set(0.35, 0.15, 0);
    const rh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.09), glove);
    rh.position.set(0.0, -0.1, 0.07);
    rh.rotation.set(-0.3, 0, 0);
    // left arm: from handguard toward the camera on the left
    const la = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.5), sleeve);
    la.position.set(-0.17, -0.2, -0.05);
    la.rotation.set(0.25, -0.55, 0);
    const lh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.1), glove);
    lh.position.set(-0.01, -0.07, -0.32);
    lh.rotation.set(0, 0.1, 0.3);
    this.arms.add(ra, rh, la, lh);
    this.armsParts = { ra, rh, la, lh, skin };
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
    // arms placement differs for pistol/knife
    const { la, lh } = this.armsParts;
    if (key === 'pistol') { la.position.set(-0.08, -0.17, 0.02); la.rotation.set(0.3, -0.3, 0); lh.position.set(-0.03, -0.08, -0.05); }
    else if (key === 'knife') { la.visible = false; lh.visible = false; }
    else { la.position.set(-0.17, -0.2, -0.05); la.rotation.set(0.25, -0.55, 0); lh.position.set(-0.01, -0.07, -0.32); }
    if (key !== 'knife') { la.visible = true; lh.visible = true; }
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  kick(def) {
    const s = def.type === 'pistol' ? 0.6 : def.type === 'melee' ? 1.2 : 1;
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

    const r = this.restPos || new THREE.Vector3();
    this.rig.position.set(
      r.x + this.swayX + bobX + this.recoilSide,
      r.y + this.swayY + bobY + rlY + drawY - landDip - (s.onGround ? 0 : 0.01),
      r.z + this.recoilZ + crouchZ,
    );
    const rr = this.restRot || new THREE.Euler();
    this.rig.rotation.set(
      rr.x - this.recoilRot + rlRot + drawRot + this.swayY * 1.5,
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
