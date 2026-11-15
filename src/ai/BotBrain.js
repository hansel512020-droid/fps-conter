import * as THREE from 'three';

const DIFF = {
  easy:   { reaction: 0.7, turn: 3.0, error: 4.5, burst: [2, 4], pause: [0.5, 1.0], range: 45, fov: 95, headChance: 0.08, crouch: 0.1, strafe: 0.3, aimDrift: 0.5, nade: 0.1 },
  normal: { reaction: 0.4, turn: 5.5, error: 2.4, burst: [3, 6], pause: [0.3, 0.6], range: 65, fov: 115, headChance: 0.22, crouch: 0.25, strafe: 0.45, aimDrift: 0.35, nade: 0.25 },
  hard:   { reaction: 0.22, turn: 9.0, error: 1.2, burst: [5, 10], pause: [0.15, 0.35], range: 90, fov: 140, headChance: 0.42, crouch: 0.35, strafe: 0.6, aimDrift: 0.25, nade: 0.4 },
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
 * FPS bot: perception with reaction time, burst fire with aim error, objective-driven
 * navigation (bomb sites, bomb carry/plant/defuse), grenade usage, flash blindness.
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
    this.goal = null;           // Vector3
    this.goalKind = '';
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
    this.nade = null;
    this.utilityUsed = false;
    this.action = null;         // 'plant' | 'defuse'
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  reset() {
    this.target = null; this.targetVisible = false;
    this.path = []; this.pathGoal = null; this.goal = null; this.goalKind = '';
    this.repathTimer = 0;
    this.burstLeft = 0; this.burstPause = 0;
    this.lastSeenTime = -10;
    this.stuckTimer = 0;
    this.lookYaw = this.ch.yaw;
    this.nade = null; this.utilityUsed = false; this.action = null;
    this.waitTimer = rand(0.3, 2.0); // stagger leaving spawn
    this.reactionScale = this.ch.team === 'CT' ? (this.game.settings.ctReactionScale || 1) : 1;
    this.goal = this.ch.position.clone();
    this.goalKind = 'spawn';
  }

  hear(source, loudness = 1) {
    if (!source.alive || source.team === this.ch.team) return;
    const dist = source.position.distanceTo(this.ch.position);
    if (dist > 38 * loudness) return;
    if (loudness >= 1) this.game.reportEnemy(this.ch.team, source.position);
    if (this.targetVisible) return;
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

  get blind() { return this.game.time < this.ch.blindUntil; }

  _perceive() {
    const ch = this.ch, g = this.game, now = g.time;
    if (this.blind) { this.targetVisible = false; return; }
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
      g.reportEnemy(ch.team, e.position);
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
      // a defender holding an angle reacts faster to enemies appearing in front of them
      if ((this.goalKind === 'hold' || this.goalKind === 'guard') && !this.path.length) {
        const dx = nearest.position.x - ch.position.x, dz = nearest.position.z - ch.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        const dot = (dx * fwd.x + dz * fwd.z) / dist;
        if (dot > 0.8) this.firstSeenTime = now - this.d.reaction * 0.55;
      }
      this.aimHead = Math.random() < this.d.headChance;
      this.lastSeenPos.copy(nearest.position);
      this.lastSeenTime = now;
    } else {
      this.targetVisible = false;
    }
  }

  _siteGoal(site, wait, preferCover = false) {
    const g = this.game, map = g.map;
    let best = null, bestScore = -1;
    const tries = preferCover ? 7 : 1;
    for (let i = 0; i < tries; i++) {
      const cell = map.randomSiteCell(site);
      const c = g.nav.ok(cell[0], cell[1]) ? cell : g.nav.nearestCell(map.center(cell[0], cell[1]));
      let score = Math.random() * 0.5;
      if (preferCover) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const t = map.typeAt(c[0] + dx, c[1] + dz);
          if (t === 'crate' || t === 'tall' || t === 'half') score += 2;      // cover you can peek over / around
          else if (t === 'wall') score += 0.8;
        }
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    this.goal = map.center(best[0], best[1]);
    this.waitTimer = wait;
  }

  /** Decides where to go when not fighting. */
  _pickObjective() {
    const g = this.game, ch = this.ch, bomb = g.bomb, map = g.map;
    this.action = null;
    if (ch.team === 'T') {
      const plan = g.teamPlan.T;
      if (bomb.state === 'dropped') {
        // closest attacker goes for the bomb
        let best = null, bd = Infinity;
        for (const c of g.characters) if (c.team === 'T' && c.alive) { const d = c.position.distanceTo(bomb.position); if (d < bd) { bd = d; best = c; } }
        if (best === ch || ch.position.distanceTo(bomb.position) < 15) {
          this.goal = bomb.position.clone(); this.goalKind = 'bomb'; this.waitTimer = 1; return;
        }
      }
      if (bomb.state === 'planted') {
        this._siteGoal(bomb.site, rand(3, 7), true); this.goalKind = 'guard'; return;
      }
      if (ch.hasBomb) {
        if (map.zoneAt(ch.position) === plan) { this.goal = ch.position.clone(); this.goalKind = 'plantspot'; this.waitTimer = 0.1; return; }
        this._siteGoal(plan, 0.5); this.goalKind = 'site'; return;
      }
      // one attacker lurks the other site to split the defence, the rest push the planned site
      const target = this.lurker && !g.intel.T.site ? (plan === 'A' ? 'B' : 'A') : plan;
      this._siteGoal(target, rand(1.5, 4), target !== plan); this.goalKind = 'site'; return;
    }
    // defenders
    if (bomb.state === 'planted') {
      if (bomb.defusing && bomb.defusing.ch !== ch) { this._siteGoal(bomb.site, rand(2, 5), true); this.goalKind = 'guard'; return; }
      this.goal = bomb.position.clone(); this.goalKind = 'defuse'; this.waitTimer = 0.5; return;
    }
    if (!this.site) this.site = Math.random() < 0.5 ? 'A' : 'B';
    const intel = g.intel.CT;
    if (intel.site && g.time - intel.time < 25 && intel.site !== this.site && Math.random() < 0.8) this.site = intel.site;
    else if (map.zoneAt(ch.position) === this.site && Math.random() < 0.08) this.site = this.site === 'A' ? 'B' : 'A';
    // defenders settle into a covered spot and stay there a good while
    this._siteGoal(this.site, rand(8, 20), true); this.goalKind = 'hold';
    this.wantCrouch = Math.random() < this.d.crouch + 0.25;
  }

  _chooseGun() {
    const ch = this.ch;
    const w = ch.weapon;
    if (w && w.isGun && (w.mag > 0 || w.reserve > 0)) return;
    const i = ch.weapons.findIndex((x) => x.isGun && (x.mag > 0 || x.reserve > 0));
    if (i >= 0) ch.selectWeapon(i, this.game.time);
    else if (!(w && w.isMelee)) ch.selectSlot(3);
  }

  _startNade(targetPos) {
    const ch = this.ch;
    const idx = ch.weapons.findIndex((x) => x.isGrenade && x.mag > 0);
    if (idx < 0) return false;
    ch.selectWeapon(idx, this.game.time);
    this.nade = { target: targetPos.clone(), at: this.game.time + ch.weapon.def.swapTime + 0.15 };
    return true;
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

    // ----- grenade throw in progress
    if (this.nade) {
      if (engaging && Math.random() < 0.02) { this.nade = null; this._chooseGun(); }
      else {
        const t = this.nade.target;
        const eye = ch.getEyePosition(this._tmp);
        const dx = t.x - eye.x, dz = t.z - eye.z, hd = Math.hypot(dx, dz);
        const desiredYaw = Math.atan2(-dx, -dz);
        const desiredPitch = Math.min(0.9, 0.25 + hd * 0.012);
        ch.yaw = turnToward(ch.yaw, desiredYaw, d.turn * dt);
        ch.pitch = turnToward(ch.pitch, desiredPitch, d.turn * dt);
        if (now >= this.nade.at && ch.weapon && ch.weapon.isGrenade) {
          const thrown = g.fireWeapon(ch, true);
          if (thrown) { this.nade = null; this.utilityUsed = true; this._chooseGun(); }
        } else g.fireWeapon(ch, false);
        return w;
      }
    }

    if (engaging) {
      this.action = null;
      const t = this.target;
      if (!(weapon && (weapon.isGun || weapon.isMelee))) this._chooseGun();
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
      const turnRate = d.turn * (seen < 0.15 ? 0.6 : 1);
      ch.yaw = turnToward(ch.yaw, desiredYaw, turnRate * dt);
      ch.pitch = turnToward(ch.pitch, desiredPitch, turnRate * dt);
      ch.pitch = THREE.MathUtils.clamp(ch.pitch, -1.4, 1.4);
      const errYaw = Math.abs(wrapAngle(desiredYaw - ch.yaw)), errPitch = Math.abs(desiredPitch - ch.pitch);
      const onTarget = errYaw < (3 + d.error) * DEG && errPitch < (3 + d.error) * DEG;

      const cw = ch.weapon;
      if (cw && cw.isGun && cw.mag === 0 && !cw.reloading) {
        if (cw.reserve > 0 && (hd > 12 || Math.random() < 0.5)) cw.startReload(now);
        else {
          const alt = ch.weapons.findIndex((x) => x.isGun && x.mag > 0);
          if (alt >= 0) ch.selectWeapon(alt, now); else ch.selectSlot(3);
        }
      }
      if (cw && cw.def.scope && cw.zoom === 0 && hd > 15 && !cw.reloading) cw.toggleZoom();
      if (cw && cw.isMelee && hd > cw.def.range * 0.8) w.forward = 1;

      let trigger = false;
      if (seen >= d.reaction * (this.reactionScale || 1) && onTarget && !(cw && cw.reloading)) {
        if (this.burstPause > 0) this.burstPause -= dt;
        else {
          if (this.burstLeft <= 0) this.burstLeft = cw && cw.def.type === 'sniper' ? 1 : randInt(d.burst[0], d.burst[1]);
          trigger = true;
        }
      }
      if (cw && cw.isMelee) trigger = hd < cw.def.range;
      const fired = g.fireWeapon(ch, trigger);
      if (fired) {
        this.burstLeft--;
        if (this.burstLeft <= 0) this.burstPause = rand(d.pause[0], d.pause[1]);
      }

      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.35, 0.9);
        this.strafeDir = Math.random() < d.strafe ? (Math.random() < 0.5 ? -1 : 1) : 0;
        this.wantCrouch = Math.random() < d.crouch;
        if (hd > 30 && Math.random() < 0.4) this.strafeDir = 0;
        if (cw && cw.def.type === 'sniper') this.strafeDir = 0;
      }
      if (!(cw && cw.isMelee)) {
        w.right = this.strafeDir;
        w.crouch = this.wantCrouch;
        if (hd < 3 && t.weapon?.isMelee) w.forward = -1;
      }
      this.path.length = 0;
      this.pathGoal = null;
      this.repathTimer = 0;
    } else {
      // ----- blind: back off and spray where the enemy was
      if (this.blind) {
        w.forward = -0.6; w.right = Math.sin(now * 3) > 0 ? 0.5 : -0.5;
        const recent = this.target && now - this.lastSeenTime < 1.5 && Math.random() < 0.5;
        g.fireWeapon(ch, recent && !!(weapon && weapon.isGun));
        return w;
      }
      // reload / weapon housekeeping when it's quiet
      if (weapon && weapon.isGun && weapon.canReload() && weapon.mag < weapon.def.mag * 0.45) weapon.startReload(now);
      if (!this.action && !(weapon && weapon.isGun)) this._chooseGun();
      if (weapon && weapon.zoom > 0) weapon.toggleZoom();

      let goalPos = null;
      let lookAt = null;
      const remembered = this.target && now - this.lastSeenTime < 6;
      if (remembered) {
        goalPos = this.lastSeenPos;
        lookAt = this.lastSeenPos;
        const dist = ch.position.distanceTo(goalPos);
        if (dist < 2.5) { this.lastSeenTime = -10; this.target = null; this.goal = null; }
        // throw a grenade at the last known position
        else if (dist > 8 && dist < 30 && now - this.lastSeenTime > 0.8 && Math.random() < d.nade * dt && ch.grenades.length) {
          if (this._startNade(this.lastSeenPos)) return w;
        }
      } else {
        this.target = null;
        if (!this.goal) this._pickObjective();
        goalPos = this.goal;
        // attackers throw utility onto the site when approaching it
        if (ch.team === 'T' && !this.utilityUsed && g.bomb.state !== 'planted' && ch.grenades.length && g.roundState === 'live') {
          const sc = g.map.sites[g.teamPlan.T + '_center'];
          const dist = sc ? ch.position.distanceTo(sc) : 100;
          if (dist > 12 && dist < 28 && Math.random() < 0.5 * dt) { if (this._startNade(sc)) return w; }
        }
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
        if (!cells) this.goal = null;
      }

      const goalDist = goalPos ? Math.hypot(goalPos.x - ch.position.x, goalPos.z - ch.position.z) : 0;
      const atGoal = goalPos && goalDist < (this.goalKind === 'defuse' || this.goalKind === 'bomb' ? 0.9 : 1.2);
      if (!this.path.length && goalPos && !atGoal && goalDist < 4) {
        // final approach: walk straight to the exact goal point (bomb, defuse spot)
        const mx = (goalPos.x - ch.position.x) / goalDist, mz = (goalPos.z - ch.position.z) / goalDist;
        ch.yaw = turnToward(ch.yaw, Math.atan2(-mx, -mz), d.turn * 1.3 * dt);
        const f = ch.getFlatForward(this._tmp), r = ch.getRight(this._tmp2);
        w.forward = mx * f.x + mz * f.z; w.right = mx * r.x + mz * r.z;
        g.fireWeapon(ch, false);
      } else if (this.path.length && !atGoal) {
        const wp = this.path[0];
        const dx = wp.x - ch.position.x, dz = wp.z - ch.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.7) this.path.shift();
        else {
          const mx = dx / dist, mz = dz / dist;
          const moveYaw = Math.atan2(-mx, -mz);
          let desiredYaw = moveYaw;
          if (lookAt) desiredYaw = Math.atan2(-(lookAt.x - ch.position.x), -(lookAt.z - ch.position.z));
          ch.yaw = turnToward(ch.yaw, desiredYaw, d.turn * 1.3 * dt);
          ch.pitch = turnToward(ch.pitch, 0, 2 * dt);
          const f = ch.getFlatForward(this._tmp), r = ch.getRight(this._tmp2);
          w.forward = mx * f.x + mz * f.z;
          w.right = mx * r.x + mz * r.z;
          const len = Math.hypot(w.forward, w.right) || 1;
          w.forward /= len; w.right /= len;
          w.walk = ch.team === 'CT' && goalPos && ch.position.distanceTo(goalPos) < 6 && !lookAt && this.goalKind === 'hold';
        }
        g.fireWeapon(ch, false);
      } else {
        // ----- arrived: act on the objective
        this.path.length = 0;
        const bomb = g.bomb;
        if (this.goalKind === 'plantspot' && ch.hasBomb && g.roundState === 'live') {
          const bw = ch.weapons.findIndex((x) => x.isBomb);
          if (ch.weaponIndex !== bw) ch.selectWeapon(bw, now);
          this.action = 'plant';
          ch.pitch = turnToward(ch.pitch, -0.6, 2 * dt);
          g.fireWeapon(ch, true); // 'plant' is handled by the game via plantHeld
          return w;
        }
        if (this.goalKind === 'defuse' && bomb.state === 'planted' && ch.position.distanceTo(bomb.position) < 1.6) {
          this.action = 'defuse';
          g.requestDefuse(ch);
          const dxb = bomb.position.x - ch.position.x, dzb = bomb.position.z - ch.position.z;
          ch.yaw = turnToward(ch.yaw, Math.atan2(-dxb, -dzb), 3 * dt);
          ch.pitch = turnToward(ch.pitch, -0.7, 2 * dt);
          g.fireWeapon(ch, false);
          return w;
        }
        if (this.goalKind === 'defuse' && bomb.state === 'planted') { this.goal = null; this.repathTimer = 0; }
        this.action = null;
        g.fireWeapon(ch, false);
        // idle: look around (defenders face where attackers come from), then pick the next objective
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.lookTimer = rand(1.2, 3);
          if (this.goalKind === 'hold' || this.goalKind === 'guard') {
            const threat = g.map.spawnCenter[ch.team === 'CT' ? 'T' : 'CT'];
            const base = Math.atan2(-(threat.x - ch.position.x), -(threat.z - ch.position.z));
            this.lookYaw = base + (Math.random() - 0.5) * 1.6;
          } else this.lookYaw = ch.yaw + (Math.random() - 0.5) * 2.6;
        }
        // rotate when the team learns where the attackers are
        if (ch.team === 'CT' && this.goalKind === 'hold') {
          const intel = g.intel.CT;
          if (intel.site && intel.site !== this.site && now - intel.time > 2 && now - intel.time < 25) { this.site = intel.site; this.goal = null; }
        }
        ch.yaw = turnToward(ch.yaw, this.lookYaw, 1.6 * dt);
        ch.pitch = turnToward(ch.pitch, 0, 2 * dt);
        w.crouch = this.goalKind === 'hold' && this.wantCrouch;
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) { this.goal = null; this.wantCrouch = Math.random() < d.crouch * 0.6; }
        // react to bomb state changes quickly
        if ((bomb.state === 'planted' && this.goalKind !== 'guard' && this.goalKind !== 'defuse') || (bomb.state === 'dropped' && ch.team === 'T' && this.goalKind !== 'bomb')) this.goal = null;
      }
    }

    // stuck detection
    if (this.path.length) {
      if (ch.position.distanceToSquared(this.lastPos) < 0.004) this.stuckTimer += dt; else this.stuckTimer = 0;
      if (this.stuckTimer > 0.6) w.jump = true;
      if (this.stuckTimer > 1.6) { this.stuckTimer = 0; this.repathTimer = 0; this.goal = null; this.path.length = 0; }
    } else this.stuckTimer = 0;
    this.lastPos.copy(ch.position);
    return w;
  }
}
