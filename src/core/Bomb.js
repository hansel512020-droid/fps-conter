import * as THREE from 'three';
import { buildWeaponMesh } from '../weapons/WeaponMeshes.js';

export const BOMB_TIMER = 40;
export const DEFUSE_TIME = 10;
export const DEFUSE_TIME_KIT = 5;

/**
 * The C4: carried by an attacker, droppable, plantable at a site, defusable.
 */
export class Bomb {
  constructor(game) {
    this.game = game;
    this.state = 'none';      // none | carried | dropped | planted | defused | exploded
    this.carrier = null;
    this.planter = null;
    this.position = new THREE.Vector3();
    this.site = null;
    this.timeLeft = BOMB_TIMER;
    this.planting = null;     // { ch, progress }
    this.defusing = null;     // { ch, progress }
    this.beepTimer = 0;
    this.mesh = buildWeaponMesh('bomb');
    this.mesh.visible = false;
    this.light = new THREE.PointLight(0xff2020, 0, 4, 2);
    this.mesh.add(this.light);
    this.light.position.set(0, 0.15, 0);
    game.scene.add(this.mesh);
    this.led = this.mesh.getObjectByName('led');
  }

  reset(carrier) {
    this.state = 'none';
    this.carrier = null; this.planter = null; this.site = null;
    this.planting = null; this.defusing = null;
    this.timeLeft = BOMB_TIMER;
    this.mesh.visible = false;
    this.light.intensity = 0;
    if (carrier) this.giveTo(carrier);
  }

  giveTo(ch) {
    this.state = 'carried';
    this.carrier = ch;
    if (!ch.hasBomb) ch.giveWeapon('bomb', false);
    this.mesh.visible = false;
  }

  drop(pos) {
    if (this.state !== 'carried') return;
    const ch = this.carrier;
    const w = ch.weapons.find((x) => x.isBomb);
    if (w) ch.removeWeapon(w);
    this.carrier = null;
    this.state = 'dropped';
    this.position.copy(pos);
    this.position.y = Math.max(0.03, pos.y);
    this.mesh.visible = true;
    this.mesh.position.copy(this.position).setY(this.position.y + 0.06);
    this.mesh.rotation.set(0, Math.random() * 6.28, 0);
    this.game.hud.message('', 'La bomba ha caído', 2);
  }

  tryPickup(ch) {
    if (this.state !== 'dropped' || !ch.alive || ch.team !== 'T') return false;
    if (ch.position.distanceTo(this.position) > 1.8) return false;
    this.giveTo(ch);
    this.game.stats.pickups++;
    this.game.audio.pickup(ch === this.game.player ? null : ch.position);
    if (ch === this.game.player) this.game.hud.message('', 'Has recogido la bomba', 2);
    return true;
  }

  /** Progresses planting while `active`. Returns true the frame the bomb gets planted. */
  plantTick(ch, dt, active) {
    if (this.state !== 'carried' || this.carrier !== ch) return false;
    const zone = this.game.map.zoneAt(ch.position);
    const canPlant = active && ch.alive && ch.onGround && (zone === 'A' || zone === 'B');
    if (!canPlant) { if (this.planting) this.planting = null; return false; }
    if (!this.planting) { this.planting = { ch, progress: 0, tick: 0 }; }
    this.planting.progress += dt / this.game.weaponDef('bomb').plantTime;
    this.planting.tick += dt;
    if (this.planting.tick > 0.5) { this.planting.tick = 0; this.game.audio.plantClick(ch === this.game.player ? null : ch.position); }
    if (this.planting.progress >= 1) {
      this.plant(ch, zone);
      return true;
    }
    return false;
  }

  plant(ch, zone) {
    const w = ch.weapons.find((x) => x.isBomb);
    if (w) ch.removeWeapon(w);
    this.carrier = null;
    this.planter = ch;
    this.site = zone;
    this.state = 'planted';
    this.planting = null;
    this.timeLeft = BOMB_TIMER;
    this.beepTimer = 0;
    this.position.copy(ch.position);
    this.mesh.visible = true;
    this.mesh.position.copy(this.position).setY(this.position.y + 0.06);
    this.mesh.rotation.set(0, ch.yaw + Math.PI / 2, 0);
    this.game.onBombPlanted(ch, zone);
  }

  /** Progresses defusing while `active`. Returns true the frame the bomb is defused. */
  defuseTick(ch, dt, active) {
    if (this.state !== 'planted') return false;
    const near = ch.alive && ch.position.distanceTo(this.position) < 1.7;
    if (!active || !near) {
      if (this.defusing && this.defusing.ch === ch) this.defusing = null;
      return false;
    }
    if (this.defusing && this.defusing.ch !== ch) return false; // someone else is on it
    if (!this.defusing) { this.defusing = { ch, progress: 0, tick: 0 }; }
    const total = ch.kit ? DEFUSE_TIME_KIT : DEFUSE_TIME;
    this.defusing.progress += dt / total;
    this.defusing.tick += dt;
    if (this.defusing.tick > 0.4) { this.defusing.tick = 0; this.game.audio.plantClick(ch === this.game.player ? null : ch.position); }
    if (this.defusing.progress >= 1) {
      this.state = 'defused';
      this.defusing = null;
      this.light.intensity = 0;
      this.game.onBombDefused(ch);
      return true;
    }
    return false;
  }

  get isTicking() { return this.state === 'planted'; }

  update(dt) {
    if (this.state === 'carried' && this.carrier && !this.carrier.alive) this.drop(this.carrier.position);
    if (this.state !== 'planted') return;
    this.timeLeft -= dt;
    // beeps speed up as the timer runs down
    const interval = this.timeLeft > 20 ? 1.0 : this.timeLeft > 10 ? 0.5 : this.timeLeft > 4 ? 0.25 : 0.12;
    this.beepTimer -= dt;
    if (this.beepTimer <= 0) {
      this.beepTimer = interval;
      this.game.audio.bombBeep(this.position, 1 + (BOMB_TIMER - this.timeLeft) / BOMB_TIMER * 0.4);
      this.light.intensity = 3;
    }
    this.light.intensity = Math.max(0, this.light.intensity - dt * 12);
    if (this.led) this.led.material.emissiveIntensity = this.light.intensity > 0.5 ? 4 : 0.3;
    if (this.timeLeft <= 0) {
      this.state = 'exploded';
      this.mesh.visible = false;
      this.light.intensity = 0;
      this.defusing = null;
      this.game.onBombExploded(this.position.clone());
    }
  }
}
