import { WEAPONS, kickVector } from './WeaponDefs.js';

/**
 * Weapon instance state: ammo, fire timing, reload, recoil index.
 * The actual bullet trace is performed by the Game (needs world access).
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
  }

  get isMelee() { return this.def.type === 'melee'; }
  get fireInterval() { return 60 / this.def.rpm; }
  get needsReload() { return !this.isMelee && this.mag === 0; }

  draw(now) {
    this.drawEnd = now + this.def.swapTime;
    this.reloading = false;
    this.triggerWasDown = false;
  }

  update(now, dt) {
    if (this.reloading && now >= this.reloadEnd) {
      const need = this.def.mag - this.mag;
      const take = Math.min(need, this.reserve);
      this.mag += take;
      this.reserve -= take;
      this.reloading = false;
    }
    // recoil pattern resets when you stop shooting for a bit
    if (now - this.lastShotTime > 0.42) this.shotIndex = 0;
    this.spreadExtra = Math.max(0, this.spreadExtra - this.def.spread.recover * dt * (1 + this.spreadExtra));
  }

  canReload() {
    return !this.isMelee && !this.reloading && this.mag < this.def.mag && this.reserve > 0;
  }

  startReload(now) {
    if (!this.canReload()) return false;
    this.reloading = true;
    this.reloadEnd = now + this.def.reload;
    this.shotIndex = 0;
    return true;
  }

  /**
   * Attempt to fire. `triggerDown` is the raw trigger state so semi-auto needs re-press.
   * Returns null if nothing happened, 'dry' if clicked empty, or a kick object when a shot is fired.
   */
  tryFire(now, triggerDown) {
    const pressedNow = triggerDown && !this.triggerWasDown;
    this.triggerWasDown = triggerDown;
    if (!triggerDown) return null;
    if (now < this.drawEnd || this.reloading) return null;
    if (!this.def.auto && !pressedNow) return null;
    if (now < this.nextFire) return null;
    if (!this.isMelee && this.mag <= 0) {
      if (pressedNow) { this.nextFire = now + 0.25; return 'dry'; }
      return null;
    }
    this.nextFire = now + this.fireInterval;
    if (!this.isMelee) this.mag--;
    const kick = kickVector(this.def, this.shotIndex);
    this.shotIndex++;
    this.lastShotTime = now;
    const spreadBefore = this.spreadExtra;
    this.spreadExtra = Math.min(4, this.spreadExtra + this.def.spread.perShot);
    return { kick, spreadExtra: spreadBefore };
  }

  /** Total cone (deg, half angle) for a character in a given movement state. */
  spreadFor({ speedRatio = 0, onGround = true, crouching = false }) {
    const s = this.def.spread;
    let v = s.base + this.spreadExtra + s.move * speedRatio * speedRatio;
    if (!onGround) v += s.air;
    if (crouching && onGround) v *= s.crouch;
    return v;
  }

  refill() {
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloading = false;
  }
}
