import * as THREE from 'three';
import { Weapon } from '../weapons/Weapon.js';
import { SLOT_ORDER } from '../weapons/WeaponDefs.js';

export const MOVE = {
  run: 5.6, walk: 2.9, crouch: 2.1,
  groundAccel: 11, airAccel: 1.6, gravity: 24, jump: 7.4,
  halfWidth: 0.36, standHeight: 1.8, crouchHeight: 1.28,
  eyeStand: 1.64, eyeCrouch: 1.12,
};

const ZONE_MULT = { head: null, chest: 1.0, stomach: 1.25, legs: 0.75 };

let nextId = 1;

/**
 * Shared state and movement for players and bots.
 * `position` is the feet position (bottom center of the AABB).
 */
export class Character {
  constructor(game, { team, name, isBot = false }) {
    this.game = game;
    this.id = nextId++;
    this.team = team;
    this.name = name;
    this.isBot = isBot;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.crouchT = 0;        // 0 standing .. 1 crouched (animated)
    this.onGround = false;
    this.walking = false;
    this.health = 100;
    this.armor = 0;
    this.helmet = false;
    this.kit = false;
    this.lossStreak = 0;
    this.blindUntil = -10;
    this.alive = true;
    this.deathTime = 0;
    this.money = 800;
    this.kills = 0;
    this.deaths = 0;
    this.damageDealt = 0;
    this.weapons = [];
    this.weaponIndex = 0;
    this.lastAttacker = null;
    this.lastDamageTime = -10;
    this.stepDist = 0;
    this.speedRatio = 0;
    this.model = null;
  }

  /* ---------- weapons ---------- */
  giveWeapon(key, select = true) {
    const existing = this.weapons.find((w) => w.key === key);
    if (existing) {
      if (existing.isGrenade) existing.mag = Math.min(existing.def.maxCount, existing.mag + 1);
      else existing.refill();
      return existing;
    }
    const current = this.weapon;
    const w = new Weapon(key);
    // replace a weapon occupying the same slot (grenades and knife stack/stay)
    const idx = w.isGrenade ? -1 : this.weapons.findIndex((o) => o.def.slot === w.def.slot && o.def.slot !== 3);
    if (idx >= 0) this.weapons.splice(idx, 1, w); else this.weapons.push(w);
    this.weapons.sort((a, b) => SLOT_ORDER.indexOf(a.key) - SLOT_ORDER.indexOf(b.key));
    const keepIdx = this.weapons.indexOf(current);
    this.weaponIndex = keepIdx >= 0 ? keepIdx : 0;
    if (select) this.selectWeapon(this.weapons.indexOf(w));
    return w;
  }
  removeWeapon(w) {
    const i = this.weapons.indexOf(w);
    if (i < 0) return;
    const wasCurrent = i === this.weaponIndex;
    this.weapons.splice(i, 1);
    if (this.weaponIndex > i) this.weaponIndex--;
    if (wasCurrent) { this.weaponIndex = -1; this.selectBest(); }
    if (this.weaponIndex >= this.weapons.length) this.weaponIndex = Math.max(0, this.weapons.length - 1);
  }
  hasWeapon(key) { return this.weapons.some((w) => w.key === key); }
  get weapon() { return this.weapons[this.weaponIndex] || null; }
  get primary() { return this.weapons.find((w) => w.def.slot === 1) || null; }
  get hasBomb() { return this.weapons.some((w) => w.isBomb); }
  get grenades() { return this.weapons.filter((w) => w.isGrenade); }
  selectWeapon(i, now = this.game.time) {
    if (i < 0 || i >= this.weapons.length || i === this.weaponIndex) return false;
    this.weaponIndex = i;
    this.weapons[i].draw(now);
    return true;
  }
  /** Selects the next weapon in a slot (cycles within the slot, e.g. grenades). */
  selectSlot(slot) {
    const idxs = this.weapons.map((w, i) => (w.def.slot === slot ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return false;
    const cur = idxs.indexOf(this.weaponIndex);
    const next = idxs[(cur + 1) % idxs.length];
    return this.selectWeapon(next);
  }
  selectBest() {
    // best gun first, then knife; never auto-select grenades or the bomb
    const i = this.weapons.findIndex((w) => w.isGun);
    const j = i >= 0 ? i : this.weapons.findIndex((w) => w.isMelee);
    const k = j >= 0 ? j : 0;
    if (k !== this.weaponIndex) { this.weaponIndex = k; this.weapons[k]?.draw(this.game.time); }
  }
  cycleWeapon(dir) {
    if (this.weapons.length < 2) return;
    const i = (this.weaponIndex + dir + this.weapons.length) % this.weapons.length;
    this.selectWeapon(i);
  }
  /** Removes everything but the knife and gives the default pistol. */
  resetLoadout() {
    this.weapons = [];
    this.weaponIndex = 0;
    this.giveWeapon('knife', false);
    this.giveWeapon('pistol', false);
    this.armor = 0; this.helmet = false; this.kit = false;
    this.selectBest();
  }

  /* ---------- geometry ---------- */
  get height() { return THREE.MathUtils.lerp(MOVE.standHeight, MOVE.crouchHeight, this.crouchT); }
  get eyeHeight() { return THREE.MathUtils.lerp(MOVE.eyeStand, MOVE.eyeCrouch, this.crouchT); }
  getEyePosition(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z); }
  getForward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  getFlatForward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  getRight(out = new THREE.Vector3()) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  get maxSpeed() {
    const w = this.weapon;
    let wm = w ? w.def.speed : 1;
    if (w && w.zoom > 0 && w.def.scopedSpeed) wm *= w.def.scopedSpeed;
    const base = this.crouchT > 0.5 ? MOVE.crouch : this.walking ? MOVE.walk : MOVE.run;
    return base * wm;
  }

  /** Axis-aligned hitboxes in world space for bullet tests. */
  getHitboxes() {
    const p = this.position, f = this.height / MOVE.standHeight;
    const hw = 0.22, hx = p.x, hz = p.z;
    const eye = this.eyeHeight;
    return [
      { zone: 'head', min: new THREE.Vector3(hx - 0.14, p.y + eye - 0.1, hz - 0.14), max: new THREE.Vector3(hx + 0.14, p.y + eye + 0.17, hz + 0.14) },
      { zone: 'chest', min: new THREE.Vector3(hx - hw, p.y + 1.12 * f, hz - 0.18), max: new THREE.Vector3(hx + hw, p.y + eye - 0.1, hz + 0.18) },
      { zone: 'stomach', min: new THREE.Vector3(hx - hw, p.y + 0.88 * f, hz - 0.18), max: new THREE.Vector3(hx + hw, p.y + 1.12 * f, hz + 0.18) },
      { zone: 'legs', min: new THREE.Vector3(hx - 0.2, p.y, hz - 0.16), max: new THREE.Vector3(hx + 0.2, p.y + 0.88 * f, hz + 0.16) },
    ];
  }

  /* ---------- lifecycle ---------- */
  respawn(pos, yaw) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.crouching = false; this.crouchT = 0;
    this.lastAttacker = null;
    this.blindUntil = -10;
    for (const w of this.weapons) if (!w.isGrenade) w.refill();
    this.selectBest();
    if (this.model) this.model.reset();
  }

  takeDamage(amount, zone, attacker, weaponKey) {
    if (!this.alive) return 0;
    // friendly fire is off (bullets still stop on teammates, they just don't hurt)
    if (attacker && attacker !== this && attacker.team === this.team && !this.game.settings.friendlyFire) return 0;
    let dmg = amount;
    const hsMult = weaponKey && this.game.weaponDef(weaponKey)?.hsMult;
    if (zone === 'head') dmg *= hsMult ?? attacker?.weapon?.def.hsMult ?? 4;
    else dmg *= ZONE_MULT[zone] ?? 1;
    // armor: kevlar covers torso, helmet covers head
    const protectedZone = (zone === 'head' && this.helmet) || ((zone === 'chest' || zone === 'stomach') && this.armor > 0);
    if (protectedZone && this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor -= absorbed;
      dmg -= absorbed;
      if (this.armor <= 0) { this.armor = 0; this.helmet = false; }
    }
    dmg = Math.max(1, Math.round(dmg));
    this.health -= dmg;
    this.lastAttacker = attacker;
    this.lastDamageTime = this.game.time;
    if (attacker && attacker !== this) attacker.damageDealt += Math.min(dmg, Math.max(0, this.health + dmg));
    if (this.health <= 0) {
      this.health = 0;
      this.die(attacker, weaponKey, zone === 'head');
    }
    return dmg;
  }

  die(attacker, weaponKey, headshot) {
    if (!this.alive) return;
    this.alive = false;
    this.deaths++;
    this.deathTime = this.game.time;
    this.velocity.set(0, 0, 0);
    if (attacker && attacker !== this) {
      if (attacker.team !== this.team) attacker.kills++;
      else attacker.kills--;
    }
    if (this.model) this.model.die();
    this.game.onCharacterDied(this, attacker, weaponKey, headshot);
  }

  /* ---------- movement ---------- */
  /**
   * wish = { forward: -1..1, right: -1..1, jump: bool, crouch: bool, walk: bool }
   */
  updateMovement(dt, wish) {
    const world = this.game.map.collision;
    const now = this.game.time;
    if (!this.alive) {
      // dead bodies just fall to the ground
      this.velocity.y -= MOVE.gravity * dt;
      this.velocity.x *= 0.9; this.velocity.z *= 0.9;
      const r = world.moveCharacter(this.position, this.velocity, 0.3, 0.4, dt);
      this.onGround = r.onGround;
      return;
    }
    // crouch (don't stand up under a ceiling)
    const wantCrouch = !!wish.crouch;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) this.crouching = true;
      else {
        const min = new THREE.Vector3(this.position.x - MOVE.halfWidth, this.position.y + 0.05, this.position.z - MOVE.halfWidth);
        const max = new THREE.Vector3(this.position.x + MOVE.halfWidth, this.position.y + MOVE.standHeight, this.position.z + MOVE.halfWidth);
        if (!world.overlaps(min, max)) this.crouching = false;
      }
    }
    const crouchTarget = this.crouching ? 1 : 0;
    this.crouchT += (crouchTarget - this.crouchT) * Math.min(1, dt * 14);
    if (Math.abs(this.crouchT - crouchTarget) < 0.01) this.crouchT = crouchTarget;
    this.walking = !!wish.walk;

    // wish direction
    const fwd = this.getFlatForward(_v1), right = this.getRight(_v2);
    const wishDir = _v3.set(0, 0, 0).addScaledVector(fwd, wish.forward || 0).addScaledVector(right, wish.right || 0);
    if (wishDir.lengthSq() > 1) wishDir.normalize();
    const maxSpeed = this.maxSpeed;
    const targetVx = wishDir.x * maxSpeed, targetVz = wishDir.z * maxSpeed;

    if (this.onGround) {
      const k = 1 - Math.exp(-MOVE.groundAccel * dt);
      this.velocity.x += (targetVx - this.velocity.x) * k;
      this.velocity.z += (targetVz - this.velocity.z) * k;
      if (wish.jump && now - (this._lastJump || -10) > 0.25) {
        this.velocity.y = MOVE.jump;
        this.onGround = false;
        this._lastJump = now;
      }
    } else {
      // limited air control
      const k = 1 - Math.exp(-MOVE.airAccel * dt);
      if (wishDir.lengthSq() > 0.01) {
        this.velocity.x += (targetVx - this.velocity.x) * k;
        this.velocity.z += (targetVz - this.velocity.z) * k;
      }
    }
    this.velocity.y -= MOVE.gravity * dt;
    if (this.velocity.y < -40) this.velocity.y = -40;

    const r = world.moveCharacter(this.position, this.velocity, MOVE.halfWidth, this.height, dt);
    this.onGround = r.onGround;
    if (r.onGround && this.velocity.y < 0) this.velocity.y = 0;

    // footsteps
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedRatio = Math.min(1, hs / (MOVE.run * (this.weapon ? this.weapon.def.speed : 1)));
    if (this.onGround && hs > 0.5) {
      this.stepDist += hs * dt;
      const stride = this.crouchT > 0.5 ? 1.2 : this.walking ? 1.6 : 2.1;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const loud = this.walking ? 0.25 : this.crouchT > 0.5 ? 0.35 : 1;
        this.game.onFootstep(this, loud);
      }
    } else if (!this.onGround) this.stepDist = 1.9;
  }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
