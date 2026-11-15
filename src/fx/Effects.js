import * as THREE from 'three';
import { makeFlashTexture } from '../weapons/ViewModel.js';

const MAX_PARTICLES = 1500;
const MAX_TRACERS = 48;
const MAX_DECALS = 160;

/**
 * Pooled visual effects: tracers, particle bursts, bullet-hole decals, muzzle flashes.
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // --- particles (single Points object)
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMaxLife = new Float32Array(MAX_PARTICLES);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pNext = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    const pmat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: makeDotTexture() }, uScale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uScale;
        void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vColor;
        void main() { vec4 t = texture2D(uTex, gl_PointCoord); if (t.a < 0.05) discard; gl_FragColor = vec4(vColor * t.rgb, t.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.particles = new THREE.Points(geo, pmat);
    this.particles.frustumCulled = false;
    this.pmat = pmat;
    scene.add(this.particles);

    // --- tracers
    this.tracers = [];
    const tgeo = new THREE.BoxGeometry(1, 1, 1);
    const tmat = new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(tgeo, tmat.clone());
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0 });
    }
    this.tNext = 0;

    // --- decals
    this.decals = [];
    const dgeo = new THREE.PlaneGeometry(1, 1);
    this.decalMat = new THREE.MeshBasicMaterial({ map: makeHoleTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < MAX_DECALS; i++) {
      const m = new THREE.Mesh(dgeo, this.decalMat);
      m.visible = false;
      scene.add(m);
      this.decals.push(m);
    }
    this.dNext = 0;

    // --- muzzle flashes (for other characters)
    this.flashes = [];
    const ftex = makeFlashTexture();
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftex, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      const l = new THREE.PointLight(0xffc070, 0, 10, 2);
      scene.add(s, l);
      this.flashes.push({ sprite: s, light: l, t: 0 });
    }
    this.fNext = 0;
  }

  /* ---------- emitters ---------- */
  _emit(pos, vel, color, life, size, grav) {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAX_PARTICLES;
    this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
    this.pVel[i * 3] = vel.x; this.pVel[i * 3 + 1] = vel.y; this.pVel[i * 3 + 2] = vel.z;
    this.pCol[i * 3] = color.r; this.pCol[i * 3 + 1] = color.g; this.pCol[i * 3 + 2] = color.b;
    this.pLife[i] = life; this.pMaxLife[i] = life; this.pSize[i] = size; this.pGrav[i] = grav;
  }

  impact(point, normal, material = 'concrete') {
    const n = normal;
    const base = material === 'metal' ? new THREE.Color(1.0, 0.85, 0.5) : material === 'wood' ? new THREE.Color(0.55, 0.38, 0.2) : new THREE.Color(0.62, 0.6, 0.56);
    const count = material === 'metal' ? 14 : 10;
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
      if (v.dot(n) < 0) v.negate();
      v.addScaledVector(n, 1.2).normalize().multiplyScalar(material === 'metal' ? 4 + Math.random() * 5 : 1.5 + Math.random() * 3);
      const c = base.clone().multiplyScalar(0.7 + Math.random() * 0.6);
      this._emit(point, v, c, material === 'metal' ? 0.25 + Math.random() * 0.2 : 0.35 + Math.random() * 0.35, material === 'metal' ? 0.035 : 0.05, material === 'metal' ? 12 : 9);
    }
    // dust puff
    for (let i = 0; i < 5; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8).addScaledVector(n, 0.7);
      this._emit(point, v, new THREE.Color(0.5, 0.48, 0.44), 0.5 + Math.random() * 0.4, 0.25 + Math.random() * 0.2, -0.3);
    }
    // decal
    const d = this.decals[this.dNext];
    this.dNext = (this.dNext + 1) % MAX_DECALS;
    d.visible = true;
    d.position.copy(point).addScaledVector(n, 0.006);
    d.lookAt(point.clone().add(n));
    d.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.1 + Math.random() * 0.04;
    d.scale.set(s, s, s);
  }

  blood(point, dir) {
    const red = new THREE.Color(0.45, 0.03, 0.03);
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.3), (Math.random() - 0.5)).normalize().multiplyScalar(1 + Math.random() * 2.5).addScaledVector(dir, 1.5);
      this._emit(point, v, red.clone().multiplyScalar(0.7 + Math.random() * 0.6), 0.3 + Math.random() * 0.3, 0.05 + Math.random() * 0.05, 10);
    }
  }

  tracer(from, to, bright = 1) {
    const t = this.tracers[this.tNext];
    this.tNext = (this.tNext + 1) % MAX_TRACERS;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const m = t.mesh;
    m.visible = true;
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    m.scale.set(0.012, 0.012, len);
    m.material.opacity = 0.75 * bright;
    t.life = 0.07; t.max = 0.07;
  }

  muzzleFlash(pos, dir) {
    const f = this.flashes[this.fNext];
    this.fNext = (this.fNext + 1) % this.flashes.length;
    f.sprite.visible = true;
    f.sprite.position.copy(pos).addScaledVector(dir, 0.1);
    f.sprite.scale.setScalar(0.35 + Math.random() * 0.2);
    f.sprite.material.rotation = Math.random() * 6.28;
    f.light.position.copy(pos).addScaledVector(dir, 0.3);
    f.light.intensity = 30;
    f.t = 0.05;
  }

  explosion(pos) {
    const p = pos.clone(); p.y = Math.max(p.y, 0.2);
    // fireball
    for (let i = 0; i < 60; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8, (Math.random() - 0.5)).normalize().multiplyScalar(3 + Math.random() * 9);
      const c = new THREE.Color().setHSL(0.06 + Math.random() * 0.05, 1, 0.5 + Math.random() * 0.2);
      this._emit(p, v, c, 0.25 + Math.random() * 0.35, 0.5 + Math.random() * 0.6, 2);
    }
    // sparks
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).normalize().multiplyScalar(8 + Math.random() * 14);
      this._emit(p, v, new THREE.Color(1, 0.85, 0.5), 0.4 + Math.random() * 0.6, 0.06, 14);
    }
    // dust / smoke
    for (let i = 0; i < 50; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5 + 0.1, (Math.random() - 0.5)).normalize().multiplyScalar(2 + Math.random() * 6);
      const g = 0.25 + Math.random() * 0.2;
      this._emit(p, v, new THREE.Color(g, g * 0.95, g * 0.9), 1.2 + Math.random() * 1.2, 0.9 + Math.random() * 0.9, -0.6);
    }
    // debris
    for (let i = 0; i < 20; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 1.2, (Math.random() - 0.5)).normalize().multiplyScalar(5 + Math.random() * 8);
      this._emit(p, v, new THREE.Color(0.2, 0.18, 0.16), 1 + Math.random(), 0.12, 18);
    }
    for (let i = 0; i < 3; i++) {
      const f = this.flashes[this.fNext];
      this.fNext = (this.fNext + 1) % this.flashes.length;
      f.sprite.visible = true;
      f.sprite.position.copy(p).setY(p.y + 0.8 + i * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
      f.sprite.scale.setScalar(7 + i * 2);
      f.sprite.material.rotation = Math.random() * 6.28;
      f.light.position.copy(p).setY(p.y + 1.2);
      f.light.intensity = i === 0 ? 500 : 0;
      f.light.distance = 35;
      f.t = 0.22 + i * 0.05;
    }
    // scorch mark
    const d = this.decals[this.dNext];
    this.dNext = (this.dNext + 1) % MAX_DECALS;
    d.visible = true;
    d.position.set(p.x, 0.012, p.z);
    d.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    d.scale.setScalar(3.2);
  }

  flashBurst(pos) {
    const f = this.flashes[this.fNext];
    this.fNext = (this.fNext + 1) % this.flashes.length;
    f.sprite.visible = true;
    f.sprite.position.copy(pos);
    f.sprite.scale.setScalar(4);
    f.sprite.material.rotation = Math.random() * 6.28;
    f.light.position.copy(pos);
    f.light.intensity = 600;
    f.light.distance = 40;
    f.t = 0.12;
    for (let i = 0; i < 24; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(6 + Math.random() * 10);
      this._emit(pos, v, new THREE.Color(1, 1, 0.9), 0.2 + Math.random() * 0.2, 0.08, 6);
    }
  }

  /* ---------- update ---------- */
  update(dt) {
    this.time += dt;
    // particles
    const pos = this.pPos, vel = this.pVel;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pSize[i] = 0; pos[i * 3 + 1] = -100; continue; }
      vel[i * 3 + 1] -= this.pGrav[i] * dt;
      const drag = Math.exp(-dt * 2.5);
      vel[i * 3] *= drag; vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.01 && vel[i * 3 + 1] < 0) { pos[i * 3 + 1] = 0.01; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; }
      // dust grows & fades: size is scaled with remaining life for sparks
      const k = this.pLife[i] / this.pMaxLife[i];
      if (this.pGrav[i] < 0) { this.pSize[i] *= 1 + dt * 1.2; }
      else this.pSize[i] *= k > 0.3 ? 1 : 0.9;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.size.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = 0.75 * (t.life / t.max);
    }
    for (const f of this.flashes) {
      if (f.t <= 0) continue;
      f.t -= dt;
      if (f.t <= 0) { f.sprite.visible = false; f.light.intensity = 0; f.light.distance = 10; }
      else f.light.intensity *= Math.exp(-dt * 10);
    }
  }

  setPointScale(heightPx) { this.pmat.uniforms.uScale.value = heightPx * 0.9; }
}

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function makeHoleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(10,8,6,0.95)');
  g.addColorStop(0.35, 'rgba(20,16,12,0.8)');
  g.addColorStop(0.6, 'rgba(40,36,30,0.35)');
  g.addColorStop(1, 'rgba(40,36,30,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
