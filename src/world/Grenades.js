import * as THREE from 'three';
import { buildWeaponMesh } from '../weapons/WeaponMeshes.js';

const GRAVITY = 20;
const SMOKE_RADIUS = 4.6;
const SMOKE_LIFE = 16;

/**
 * Thrown grenades (HE, flash, smoke): projectile physics with bounces,
 * detonation effects, and smoke volumes that block line of sight.
 */
export class Grenades {
  constructor(game, scene) {
    this.game = game;
    this.scene = scene;
    this.list = [];
    this.smokes = [];
    this.smokeTex = makeSmokeTexture();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  reset() {
    for (const g of this.list) this.scene.remove(g.mesh);
    for (const s of this.smokes) this.scene.remove(s.group);
    this.list = [];
    this.smokes = [];
  }

  throwGrenade(owner, def, origin, dir, strength = 1) {
    const mesh = buildWeaponMesh(def.key);
    mesh.scale.setScalar(1.2);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(def.throwSpeed * strength);
    vel.y += 2.5 * strength; // small upward arc
    // inherit some of the thrower's velocity
    vel.addScaledVector(owner.velocity, 0.5);
    this.list.push({
      owner, def, kind: def.grenade, mesh, pos: origin.clone(), vel, fuse: def.fuse, age: 0,
      resting: false, restTime: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    });
  }

  update(dt) {
    const world = this.game.map.collision;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.age += dt;
      if (!g.resting) {
        g.vel.y -= GRAVITY * dt;
        const disp = this._tmp.copy(g.vel).multiplyScalar(dt);
        const dist = disp.length();
        if (dist > 1e-5) {
          const dir = this._tmp2.copy(disp).divideScalar(dist);
          const hit = world.raycast(g.pos, dir, dist + 0.08);
          if (hit) {
            // bounce
            g.pos.copy(hit.point).addScaledVector(hit.normal, 0.09);
            const vn = g.vel.dot(hit.normal);
            g.vel.addScaledVector(hit.normal, -vn * (1 + 0.42));
            g.vel.multiplyScalar(0.72); // friction / energy loss
            if (Math.abs(vn) > 2.5) this.game.audio.bounce(g.pos);
            if (hit.normal.y > 0.7 && g.vel.length() < 1.2) { g.resting = true; g.vel.set(0, 0, 0); }
          } else {
            g.pos.add(disp);
          }
        }
        if (g.pos.y < 0.08) { g.pos.y = 0.08; if (g.vel.y < 0) g.vel.y = -g.vel.y * 0.4; g.vel.x *= 0.8; g.vel.z *= 0.8; if (g.vel.length() < 1.2) { g.resting = true; g.vel.set(0, 0, 0); } }
        g.mesh.rotation.x += g.spin.x * dt;
        g.mesh.rotation.y += g.spin.y * dt;
        g.mesh.rotation.z += g.spin.z * dt;
      } else g.restTime += dt;
      g.mesh.position.copy(g.pos);

      const shouldDetonate = g.kind === 'smoke' ? (g.age >= g.fuse && (g.resting || g.age > 4)) : g.age >= g.fuse;
      if (shouldDetonate) {
        this.detonate(g);
        this.scene.remove(g.mesh);
        this.list.splice(i, 1);
      }
    }
    // smokes
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.age += dt;
      const grow = Math.min(1, s.age / 1.2);
      const fade = s.age > SMOKE_LIFE - 2.5 ? Math.max(0, (SMOKE_LIFE - s.age) / 2.5) : 1;
      s.radius = SMOKE_RADIUS * (0.3 + 0.7 * grow);
      for (const sp of s.sprites) {
        const k = grow;
        sp.sprite.position.copy(s.pos).addScaledVector(sp.offset, k);
        sp.sprite.position.y += Math.sin(s.age * 0.5 + sp.phase) * 0.15;
        const sc = sp.size * (0.5 + 0.5 * k) * 2;
        sp.sprite.scale.set(sc, sc, 1);
        sp.sprite.material.rotation = sp.rot + s.age * sp.spin;
        sp.sprite.material.opacity = 0.8 * fade * sp.alpha;
      }
      if (s.age >= SMOKE_LIFE) { this.scene.remove(s.group); this.smokes.splice(i, 1); }
    }
  }

  detonate(g) {
    const game = this.game;
    if (g.kind === 'he') {
      game.effects.explosion(g.pos);
      game.audio.explosion(g.pos);
      for (const c of game.characters) {
        if (!c.alive) continue;
        const center = this._tmp.copy(c.position).setY(c.position.y + 0.9);
        const d = center.distanceTo(g.pos);
        if (d > 11) continue;
        // line of sight from the blast (lifted a bit off the ground)
        const from = this._tmp2.copy(g.pos).setY(g.pos.y + 0.3);
        const dir = center.clone().sub(from); const dist = dir.length(); dir.divideScalar(dist);
        const hit = game.map.collision.raycast(from, dir, dist);
        if (hit && hit.t < dist - 0.3) continue;
        const dmg = 98 * Math.pow(Math.max(0, 1 - d / 11), 1.4);
        if (dmg < 1) continue;
        c.takeDamage(dmg, 'stomach', g.owner, 'grenade_he');
        if (c.brain) c.brain.onDamaged(g.owner);
        if (c === game.player) { game.hud.damage(); game.shake(Math.min(1, dmg / 60)); }
        else if (g.owner === game.player) game.hud.hitMarker(!c.alive);
      }
      if (game.player.alive) {
        const d = game.player.position.distanceTo(g.pos);
        if (d < 20) game.shake(Math.max(0, 1 - d / 20) * 0.6);
      }
    } else if (g.kind === 'flash') {
      game.effects.flashBurst(g.pos);
      game.audio.flashbang(g.pos);
      for (const c of game.characters) {
        if (!c.alive) continue;
        const eye = c.getEyePosition(this._tmp);
        const d = eye.distanceTo(g.pos);
        if (d > 32) continue;
        const dir = this._tmp2.copy(g.pos).sub(eye); const dist = dir.length(); dir.divideScalar(dist);
        const hit = game.map.collision.raycast(eye, dir, dist);
        if (hit && hit.t < dist - 0.2) continue;
        if (game.grenades.blocksSight(eye, g.pos)) continue;
        const fwd = c.getForward(new THREE.Vector3());
        const dot = fwd.dot(dir);
        const facing = dot > 0.45 ? 1 : dot > 0 ? 0.6 : 0.3;
        const dur = Math.max(0.4, (4.2 - d / 10) * facing);
        c.blindUntil = Math.max(c.blindUntil, game.time + dur);
        if (c === game.player) game.flash(dur);
      }
    } else if (g.kind === 'smoke') {
      this.spawnSmoke(g.pos);
      game.audio.smokePop(g.pos);
    }
  }

  spawnSmoke(pos) {
    const group = new THREE.Group();
    const sprites = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.SpriteMaterial({ map: this.smokeTex, color: new THREE.Color().setHSL(0.6, 0.03, 0.42 + Math.random() * 0.16), transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m);
      group.add(s);
      const off = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4 - 0.1, (Math.random() - 0.5) * 2).normalize().multiplyScalar(SMOKE_RADIUS * (0.15 + Math.random() * 0.6));
      sprites.push({ sprite: s, offset: off, size: 3.2 + Math.random() * 2.2, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.3, phase: Math.random() * 6, alpha: 0.8 + Math.random() * 0.2 });
    }
    this.scene.add(group);
    this.smokes.push({ pos: pos.clone().setY(pos.y + 1.2), group, sprites, age: 0, radius: 0 });
  }

  /** Segment a->b crosses an active smoke volume? */
  blocksSight(a, b) {
    for (const s of this.smokes) {
      if (s.age < 0.6) continue;
      const r = s.radius * 0.85;
      // closest point on segment to the sphere center
      const ab = this._tmp.copy(b).sub(a);
      const t = THREE.MathUtils.clamp(this._tmp2.copy(s.pos).sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
      const p = ab.multiplyScalar(t).add(a);
      if (p.distanceToSquared(s.pos) < r * r) return true;
    }
    return false;
  }

  insideSmoke(p) {
    for (const s of this.smokes) if (s.age > 0.6 && p.distanceTo(s.pos) < s.radius * 0.9) return true;
    return false;
  }
}

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  // irregular blotches
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, r = 8 + Math.random() * 16;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, 'rgba(0,0,0,0.25)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
