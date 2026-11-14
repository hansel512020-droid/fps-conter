import * as THREE from 'three';

const DIFF = {
  easy:   { reaction: 0.7, turn: 3.0, error: 4.5, burst: [2, 4], pause: [0.5, 1.0], range: 45, fov: 95, headChance: 0.08, crouch: 0.1, strafe: 0.3, aimDrift: 0.5 },
  normal: { reaction: 0.4, turn: 5.5, error: 2.4, burst: [3, 6], pause: [0.3, 0.6], range: 65, fov: 115, headChance: 0.22, crouch: 0.25, strafe: 0.45, aimDrift: 0.35 },
  hard:   { reaction: 0.22, turn: 9.0, error: 1.2, burst: [5, 10], pause: [0.15, 0.35], range: 90, fov: 140, headChance: 0.42, crouch: 0.35, strafe: 0.6, aimDrift: 0.25 },
};

const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function turnToward(current, target, maxStep) {
  const d = wrapAngle(target - current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/**
 * Simple but capable FPS bot: perception with reaction time, burst fire with aim error,
 * objective-driven navigation (sites), investigation of last known enemy positions.
 */
export class BotBrain {
  constructor(game, ch, difficulty = 'normal') {
    this.game = game;
    this.ch = ch;
    this.d = DIFF[difficulty] || DIFF.normal;
    this.wish = { forward: 0, right: 0, jump: false, crouch: false, walk: false };
    this.target = null;
    this.targetVisible = false;
    this.lastSeenPos = new THREE.Vector3();
    this.lastSeenTime = -10;
    this.firstSeenTime = 0;
    this.path = [];
    this.pathGoal = null;
    this.repathTimer = 0;
    this.goalCell = null;
    this.waitTimer = 0;
    this.site = null;
    this.perceptionTimer = Math.random() * 0.1;
    this.aimOffset = new THREE.Vector3();
    this.aimOffsetTimer = 0;
    this.aimHead = false;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = 0;
    this.strafeTimer = 0;
    this.wantCrouch = false;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.lookYaw = ch.yaw;
    this.lookTimer = 0;
    this.skillJitter = rand(0.85, 1.15);
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  reset() {
    this.target = null; this.targetVisible = false;
    this.path = []; this.pathGoal = null; this.goalCell = null;
    this.waitTimer = 0; this.repathTimer = 0;
    this.burstLeft = 0; this.burstPause = 0;
    this.lastSeenTime = -10;
    this.site = Math.random() < 0.5 ? 'A' : 'B';
    this.stuckTimer = 0;
    this.lookYaw = this.ch.yaw;
    // delay leaving spawn a little so bots don't all stack
    this.waitTimer = rand(0.2, 1.8);
    this.goalCell = this.game.nav.nearestCell(this.ch.position);
  }

  hear(source, loudness = 1) {
    if (!source.alive || source.team === this.ch.team) return;
    const dist = source.position.distanceTo(this.ch.position);
    if (dist > 38 * loudness) return;
    if (this.targetVisible) return;
    // approximate position knowledge: further away => less precise
    this.lastSeenPos.copy(source.position).add(new THREE.Vector3((Math.random() - 0.5) * dist * 0.15, 0, (Math.random() - 0.5) * dist * 0.15));
    this.lastSeenTime = this.game.time - 0.5;
    this.target = source;
    this.repathTimer = 0;
  }

  onDamaged(attacker) {
    if (!attacker || attacker === this.ch || attacker.team === this.ch.team || !attacker.alive) return;
    this.lastSeenPos.copy(attacker.position);
    this.lastSeenTime = this.game.time;
    if (this.target !== attacker) {
      this.target = attacker;
      this.firstSeenTime = this.game.time - this.d.reaction * 0.6;
    }
    this.repathTimer = 0;
  }

  _perceive() {
    const ch = this.ch, g = this.game, now = g.time;
    const eye = ch.getEyePosition(this._tmp);
    const fwd = ch.getFlatForward(this._tmp2);
    let keep = false, nearest = null, nearestD = Infinity;
    const cosFov = Math.cos((this.d.fov / 2) * DEG);
    for (const e of g.characters) {
      if (e.team === ch.team || !e.alive) continue;
      const dx = e.position.x - ch.position.x, dz = e.position.z - ch.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.d.range) continue;
      const dot = dist > 0.01 ? (dx * fwd.x + dz * fwd.z) / dist : 1;
      const hurtBy = e === ch.lastAttacker && now - ch.lastDamageTime < 2;
      if (dot < cosFov && !hurtBy && !(e === this.target && dist < 6)) continue;
      if (!g.hasLineOfSight(eye, e)) continue;
      if (ch.team === g.player.team) g.spotted.set(e.id, now);
      if (e === this.target) keep = true;
      if (dist < nearestD) { nearestD = dist; nearest = e; }
    }
    if (keep) {
      if (!this.targetVisible) this.firstSeenTime = now;
      this.targetVisible = true;
      this.lastSeenPos.copy(this.target.position);
      this.lastSeenTime = now;
    } else if (nearest) {
      this.target = nearest;
      this.targetVisible = true;
      this.firstSeenTime = now;
      this.aimHead = Math.random() < this.d.headChance;
      this.lastSeenPos.copy(nearest.position);
      this.lastSeenTime = now;
    } else {
      this.targetVisible = false;
    }
  }

  _pickObjective() {
    const g = this.game, map = g.map, ch = this.ch;
    if (!this.site) this.site = Math.random() < 0.5 ? 'A' : 'B';
    const inSite = map.zoneAt(ch.position) === this.site;
    if (inSite) {
      // patrol / hold inside the site; small chance to rotate to the other site
      if (Math.random() < (ch.team === 'CT' ? 0.08 : 0.04)) this.site = this.site === 'A' ? 'B' : 'A';
      const cell = map.randomSiteCell(this.site);
      this.goalCell = g.nav.ok(cell[0], cell[1]) ? cell : g.nav.nearestCell(map.center(cell[0], cell[1]));
      this.waitTimer = ch.team === 'CT' ? rand(3, 8) : rand(1.5, 4);
    } else {
      const cell = map.randomSiteCell(this.site);
      this.goalCell = g.nav.ok(cell[0], cell[1]) ? cell : g.nav.nearestCell(map.center(cell[0], cell[1]));
      this.waitTimer = rand(1, 3);
    }
  }

  update(dt) {
    const ch = this.ch, g = this.game, now = g.time, d = this.d;
    const w = this.wish;
    w.forward = 0; w.right = 0; w.jump = false; w.crouch = false; w.walk = false;
    if (!ch.alive) return w;

    this.perceptionTimer -= dt;
    if (this.perceptionTimer <= 0) { this.perceptionTimer = 0.1; this._perceive(); }
    if (this.target && !this.target.alive) { this.target = null; this.targetVisible = false; }

    const weapon = ch.weapon;
    const engaging = this.target && this.targetVisible;

    if (engaging) {
      const t = this.target;
      // aim point with wandering error
      this.aimOffsetTimer -= dt;
      if (this.aimOffsetTimer <= 0) {
        this.aimOffsetTimer = rand(0.15, 0.4);
        const err = d.error * DEG * this.skillJitter;
        this.aimOffset.set((Math.random() - 0.5) * 2 * err, (Math.random() - 0.5) * 2 * err, 0);
      }
      const aimY = this.aimHead ? t.eyeHeight + 0.05 : 1.15 * (t.height / 1.8);
      const eye = ch.getEyePosition(this._tmp);
      const dx = t.position.x - eye.x, dy = t.position.y + aimY - eye.y, dz = t.position.z - eye.z;
      const hd = Math.hypot(dx, dz);
      const desiredYaw = Math.atan2(-dx, -dz) + this.aimOffset.x * (0.6 + d.aimDrift * Math.sin(now * 7));
      const desiredPitch = Math.atan2(dy, hd) + this.aimOffset.y * (0.6 + d.aimDrift * Math.cos(now * 6));
      const seen = now - this.firstSeenTime;
      // turn speed ramps up a bit after acquiring
      const turnRate = d.turn * (seen < 0.15 ? 0.6 : 1);
      ch.yaw = turnToward(ch.yaw, desiredYaw, turnRate * dt);
      ch.pitch = turnToward(ch.pitch, desiredPitch, turnRate * dt);
      ch.pitch = THREE.MathUtils.clamp(ch.pitch, -1.4, 1.4);
      const errYaw = Math.abs(wrapAngle(desiredYaw - ch.yaw)), errPitch = Math.abs(desiredPitch - ch.pitch);
      const onTarget = errYaw < (3 + d.error) * DEG && errPitch < (3 + d.error) * DEG;

      // weapon management
      if (weapon && !weapon.isMelee && weapon.mag === 0 && !weapon.reloading) {
        if (weapon.reserve > 0 && (hd > 12 || Math.random() < 0.5)) weapon.startReload(now);
        else {
          const alt = ch.weapons.findIndex((x) => !x.isMelee && x.mag > 0);
          if (alt >= 0) ch.selectWeapon(alt, now); else ch.selectSlot(3);
        }
      }
      // melee rush if only a knife
      if (weapon && weapon.isMelee && hd > weapon.def.range * 0.8) {
        w.forward = 1;
      }

      let trigger = false;
      if (seen >= d.reaction && onTarget && !(weapon && weapon.reloading)) {
        if (this.burstPause > 0) this.burstPause -= dt;
        else {
          if (this.burstLeft <= 0) this.burstLeft = randInt(d.burst[0], d.burst[1]);
          trigger = true;
        }
      }
      if (weapon && weapon.isMelee) trigger = hd < weapon.def.range;
      const fired = g.fireWeapon(ch, trigger);
      if (fired) {
        this.burstLeft--;
        if (this.burstLeft <= 0) this.burstPause = rand(d.pause[0], d.pause[1]);
      }

      // movement while fighting: strafe / crouch / stand still
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.35, 0.9);
        const r = Math.random();
        this.strafeDir = r < d.strafe ? (Math.random() < 0.5 ? -1 : 1) : 0;
        this.wantCrouch = Math.random() < d.crouch;
        if (hd > 30 && Math.random() < 0.4) this.strafeDir = 0;
      }
      if (!(weapon && weapon.isMelee)) {
        w.right = this.strafeDir;
        w.crouch = this.wantCrouch;
        // close range: back off a little from a knife-wielder, otherwise hold
        if (hd < 3 && t.weapon?.isMelee) w.forward = -1;
      }
      this.path.length = 0;
      this.pathGoal = null;
      this.repathTimer = 0;
      // stay on the objective after fight
    } else {
      // reload when it's quiet
      if (weapon && weapon.canReload() && weapon.mag < weapon.def.mag * 0.45) weapon.startReload(now);
      if (weapon && weapon.isMelee) { const i = ch.weapons.findIndex((x) => !x.isMelee && (x.mag > 0 || x.reserve > 0)); if (i >= 0) ch.selectWeapon(i, now); }

      let goalPos = null;
      let lookAt = null;
      if (this.target && now - this.lastSeenTime < 6) {
        goalPos = this.lastSeenPos;
        lookAt = this.lastSeenPos;
        if (ch.position.distanceTo(goalPos) < 2.5) { this.lastSeenTime = -10; this.target = null; this.goalCell = null; }
      } else {
        this.target = null;
        if (!this.goalCell) this._pickObjective();
        goalPos = g.map.center(this.goalCell[0], this.goalCell[1]);
      }

      // path management
      this.repathTimer -= dt;
      if (goalPos && (!this.pathGoal || this.pathGoal.distanceToSquared(goalPos) > 0.5 || this.repathTimer <= 0)) {
        const s = g.nav.nearestCell(ch.position), e = g.nav.nearestCell(goalPos);
        const cells = g.nav.findPath(s[0], s[1], e[0], e[1]);
        this.path = cells ? g.nav.smooth(cells) : [];
        if (this.path.length && this.path[0].distanceTo(ch.position) < 0.8) this.path.shift();
        this.pathGoal = goalPos.clone();
        this.repathTimer = 2.5;
        if (!cells) { this.goalCell = null; }
      }

      const atGoal = goalPos && Math.hypot(goalPos.x - ch.position.x, goalPos.z - ch.position.z) < 1.0;
      if (this.path.length && !atGoal) {
        const wp = this.path[0];
        const dx = wp.x - ch.position.x, dz = wp.z - ch.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.7) { this.path.shift(); }
        else {
          const mx = dx / dist, mz = dz / dist;
          const moveYaw = Math.atan2(-mx, -mz);
          let desiredYaw = moveYaw;
          if (lookAt) { desiredYaw = Math.atan2(-(lookAt.x - ch.position.x), -(lookAt.z - ch.position.z)); }
          ch.yaw = turnToward(ch.yaw, desiredYaw, d.turn * 1.3 * dt);
          ch.pitch = turnToward(ch.pitch, 0, 2 * dt);
          const f = ch.getFlatForward(this._tmp), r = ch.getRight(this._tmp2);
          w.forward = mx * f.x + mz * f.z;
          w.right = mx * r.x + mz * r.z;
          // normalise so bots move at full speed
          const len = Math.hypot(w.forward, w.right) || 1;
          w.forward /= len; w.right /= len;
          // careful approach near the objective for defenders
          w.walk = ch.team === 'CT' && goalPos && ch.position.distanceTo(goalPos) < 6 && !lookAt;
        }
      } else {
        // idle at goal: look around and wait
        this.path.length = 0;
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.lookTimer = rand(1.2, 3);
          this.lookYaw = ch.yaw + (Math.random() - 0.5) * 2.6;
        }
        ch.yaw = turnToward(ch.yaw, this.lookYaw, 1.6 * dt);
        ch.pitch = turnToward(ch.pitch, 0, 2 * dt);
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) this.goalCell = null;
      }
      g.fireWeapon(ch, false);
    }

    // stuck detection
    if (this.path.length) {
      if (ch.position.distanceToSquared(this.lastPos) < 0.004) this.stuckTimer += dt; else this.stuckTimer = 0;
      if (this.stuckTimer > 0.6) w.jump = true;
      if (this.stuckTimer > 1.6) { this.stuckTimer = 0; this.repathTimer = 0; this.goalCell = null; this.path.length = 0; }
    } else this.stuckTimer = 0;
    this.lastPos.copy(ch.position);
    return w;
  }
}
