import { WEAPONS, kickVector } from './WeaponDefs.js';

/**
 * Weapon instance state: ammo, fire timing, reload, recoil index, zoom.
 * The actual bullet trace / throw / plant is performed by the Game (needs world access).
 */
export class Weapon {
  constructor(key) {
    this.def = WEAPONS[key];
    this.key = key;
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.nextFire = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.shotIndex = 0;
    this.lastShotTime = -10;
    this.spreadExtra = 0;    // accumulated inaccuracy from consecutive shots (deg)
    this.triggerWasDown = false;
    this.drawEnd = 0;
    this.zoom = 0;           // sniper scope level
  }

  get isMelee() { return this.def.type === 'melee'; }
  get isGrenade() { return this.def.type === 'grenade'; }
  get isBomb() { return this.def.type === 'bomb'; }
  get isGun() { return !this.isMelee && !this.isGrenade && !this.isBomb; }
  get fireInterval() { return 60 / this.def.rpm; }
  get needsReload() { return this.isGun && this.mag === 0; }
  get drawn() { return true; }

  draw(now) {
    this.drawEnd = now + this.def.swapTime;
    this.reloading = false;
    this.triggerWasDown = false;
    this.zoom = 0;
  }

  update(now, dt) {
    if (this.reloading && now >= this.reloadEnd) {
      if (this.def.shellReload) {
        if (this.mag < this.def.mag && this.reserve > 0) { this.mag++; this.reserve--; }
        if (this.mag < this.def.mag && this.reserve > 0) this.reloadEnd = now + this.def.reload;
        else this.reloading = false;
      } else {
        const need = this.def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }
    // recoil pattern resets when you stop shooting for a bit
    if (now - this.lastShotTime > 0.42) this.shotIndex = 0;
    this.spreadExtra = Math.max(0, this.spreadExtra - this.def.spread.recover * dt * (1 + this.spreadExtra));
  }

  canReload() {
    return this.isGun && !this.reloading && this.mag < this.def.mag && this.reserve > 0;
  }

  startReload(now) {
    if (!this.canReload()) return false;
    this.reloading = true;
    this.reloadEnd = now + this.def.reload;
    this.shotIndex = 0;
    this.zoom = 0;
    return true;
  }

  /** Reload progress 0..1 for animation, or -1 when not reloading. */
  reloadProgress(now) {
    if (!this.reloading) return -1;
    const total = this.def.shellReload ? this.def.reload : this.def.reload;
    return 1 - (this.reloadEnd - now) / total;
  }

  toggleZoom() {
    if (!this.def.scope) return;
    this.zoom = (this.zoom + 1) % (this.def.scope.length + 1);
  }

  /** Camera FOV override when scoped, else null. */
  get scopeFov() { return this.zoom > 0 && this.def.scope ? this.def.scope[this.zoom - 1] : null; }

  /**
   * Attempt to fire. `triggerDown` is the raw trigger state so semi-auto needs re-press.
   * Returns null if nothing happened, 'dry' if clicked empty, 'plant' for the bomb while held,
   * or an object { kick, spreadExtra, throw? } when a shot is fired / grenade thrown.
   */
  tryFire(now, triggerDown) {
    const pressedNow = triggerDown && !this.triggerWasDown;
    this.triggerWasDown = triggerDown;
    if (!triggerDown) return null;
    if (now < this.drawEnd) return null;
    if (this.isBomb) return 'plant';
    if (this.reloading) {
      // shotguns can interrupt a shell-by-shell reload to fire
      if (this.def.shellReload && this.mag > 0 && pressedNow) this.reloading = false;
      else return null;
    }
    if (!this.def.auto && !pressedNow) return null;
    if (now < this.nextFire) return null;
    if (!this.isMelee && this.mag <= 0) {
      if (pressedNow) { this.nextFire = now + 0.25; return 'dry'; }
      return null;
    }
    this.nextFire = now + this.fireInterval;
    if (!this.isMelee) this.mag--;
    if (this.isGrenade) return { kick: { yaw: 0, pitch: 0 }, spreadExtra: 0, throw: true };
    const kick = kickVector(this.def, this.shotIndex);
    this.shotIndex++;
    this.lastShotTime = now;
    const spreadBefore = this.spreadExtra;
    this.spreadExtra = Math.min(6, this.spreadExtra + this.def.spread.perShot);
    if (this.def.type === 'sniper') this.zoom = 0;
    return { kick, spreadExtra: spreadBefore };
  }

  /** Total cone (deg, half angle) for a character in a given movement state. */
  spreadFor({ speedRatio = 0, onGround = true, crouching = false }) {
    const s = this.def.spread;
    const base = this.zoom > 0 && this.def.scopedSpread !== undefined ? this.def.scopedSpread : s.base;
    let v = base + this.spreadExtra + s.move * speedRatio * speedRatio * (this.zoom > 0 ? 0.5 : 1);
    if (!onGround) v += s.air;
    if (crouching && onGround) v *= s.crouch;
    return v;
  }

  refill() {
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloading = false;
    this.zoom = 0;
  }
}
