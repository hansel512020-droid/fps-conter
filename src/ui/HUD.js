import { WEAPONS } from '../weapons/WeaponDefs.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      health: $('health'), armor: $('armor'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
      weaponName: $('weapon-name'), money: $('money'), timer: $('round-timer'), scoreT: $('score-t'), scoreCT: $('score-ct'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), vignette: $('damage-vignette'), flash: $('flash-overlay'),
      roundMsg: $('round-msg'), killfeed: $('killfeed'), inventory: $('inventory'), hint: $('hint'),
      scoreboard: $('scoreboard'), sbT: $('sb-t-body'), sbCT: $('sb-ct-body'),
      healthStat: $('health').parentElement, armorStat: $('armor').parentElement,
      bombStatus: $('bomb-status'), bombStatusText: $('bomb-status-text'), bombCarry: $('bomb-carry'),
      progress: $('progress'), progressLabel: $('progress-label'), progressPct: $('progress-pct'), progressFill: $('progress-fill'),
      moneyPop: $('money-pop'), scope: $('scope'), spectate: $('spectate'), spectateName: $('spectate-name'),
    };
    this.radar = $('radar-canvas');
    this.rctx = this.radar.getContext('2d');
    this.radarBase = null;
    this.hitTimer = 0;
    this.vignetteT = 0;
    this.msgTimer = 0;
    this.sbTimer = 0;
    this.lastInv = '';
    this.progressVisible = false;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  buildRadar(map) {
    const c = document.createElement('canvas');
    const scale = 6; // px per cell
    c.width = map.cols * scale; c.height = map.rows * scale;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, c.width, c.height);
    for (let z = 0; z < map.rows; z++) for (let x = 0; x < map.cols; x++) {
      const t = map.typeAt(x, z);
      const zone = map.b.getZone(x, z);
      if (t === 'wall') ctx.fillStyle = '#5a6672';
      else if (t === 'tall') ctx.fillStyle = '#434c56';
      else if (t === 'crate' || t === 'half') ctx.fillStyle = '#3a4149';
      else if (zone === 'A') ctx.fillStyle = 'rgba(255,181,71,0.35)';
      else if (zone === 'B') ctx.fillStyle = 'rgba(94,196,255,0.35)';
      else ctx.fillStyle = '#1b222b';
      ctx.fillRect(x * scale, z * scale, scale, scale);
    }
    ctx.font = 'bold 26px Rajdhani, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of ['A', 'B']) {
      const cc = map.sites[s + '_center'];
      if (!cc) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(s, cc.x / map.cell * scale, cc.z / map.cell * scale);
    }
    this.radarBase = c;
    this.radarScale = scale;
  }

  hitMarker(kill = false) {
    const h = this.el.hitmarker;
    h.classList.add('show');
    h.classList.toggle('kill', kill);
    this.hitTimer = kill ? 0.3 : 0.12;
  }

  damage() {
    this.vignetteT = 0.5;
    this.el.vignette.style.opacity = '1';
  }

  killFeed(attacker, victim, weaponKey, headshot, me) {
    const row = document.createElement('div');
    row.className = 'kf' + (me ? ' me' : '');
    const w = WEAPONS[weaponKey]?.short || weaponKey || '';
    row.innerHTML = `<span class="${attacker?.team || ''}">${attacker?.name || '?'}</span><span class="w">${w}${headshot ? ' ●' : ''}</span><span class="${victim.team}">${victim.name}</span>`;
    this.el.killfeed.appendChild(row);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.removeChild(this.el.killfeed.firstChild);
    setTimeout(() => { row.style.transition = 'opacity 0.5s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 500); }, 6000);
  }

  message(text, sub = '', duration = 3) {
    this.el.roundMsg.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    this.el.roundMsg.classList.add('show');
    this.msgTimer = duration;
  }

  hint(text) {
    if (!text) { this.el.hint.classList.remove('show'); return; }
    if (this.el.hint.textContent !== text) this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
  }

  setScoreboard(visible) { this.el.scoreboard.classList.toggle('hidden', !visible); }

  progress(label, pct, type = 'plant') {
    const e = this.el;
    e.progress.classList.remove('hidden');
    e.progress.classList.toggle('defuse', type === 'defuse');
    e.progressLabel.textContent = label;
    e.progressPct.textContent = Math.round(pct * 100) + '%';
    e.progressFill.style.width = (pct * 100).toFixed(1) + '%';
    this.progressVisible = true;
  }
  hideProgress() { if (this.progressVisible) { this.el.progress.classList.add('hidden'); this.progressVisible = false; } }

  moneyPop(delta, label = '') {
    if (!delta) return;
    const d = document.createElement('div');
    d.className = 'mp' + (delta < 0 ? ' neg' : '');
    d.textContent = (delta > 0 ? '+' : '−') + '$' + Math.abs(delta) + (label ? '  ' + label : '');
    this.el.moneyPop.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  setScope(on) { this.el.scope.classList.toggle('hidden', !on); this.root.classList.toggle('scoped', on); }

  setSpectate(name) {
    this.el.spectate.classList.toggle('hidden', !name);
    if (name) this.el.spectateName.textContent = name;
  }

  setBombStatus(text) {
    this.el.bombStatus.classList.toggle('hidden', !text);
    if (text) this.el.bombStatusText.textContent = text;
  }

  update(dt) {
    const g = this.game, p = g.player;
    const e = this.el;
    // vitals
    e.health.textContent = Math.max(0, Math.round(p.health));
    e.armor.textContent = Math.round(p.armor) + (p.helmet ? ' ⛑' : '');
    e.healthStat.classList.toggle('low', p.health <= 25);
    const w = p.weapon;
    if (w) {
      e.weaponName.textContent = w.def.name;
      if (w.isMelee || w.isBomb) { e.ammoMag.textContent = '—'; e.ammoReserve.textContent = ''; e.ammo.classList.remove('low'); }
      else if (w.isGrenade) { e.ammoMag.textContent = w.mag; e.ammoReserve.textContent = ''; e.ammo.classList.remove('low'); }
      else {
        e.ammoMag.textContent = w.mag;
        e.ammoReserve.textContent = w.reserve;
        e.ammo.classList.toggle('low', w.mag <= Math.ceil(w.def.mag * 0.2));
      }
    }
    e.money.textContent = '$ ' + p.money;
    // inventory
    const invKey = p.weapons.map((x) => x.key + (x.isGrenade ? x.mag : '')).join(',') + ':' + p.weaponIndex;
    if (invKey !== this.lastInv) {
      this.lastInv = invKey;
      e.inventory.innerHTML = p.weapons.map((x, i) => `<div class="inv ${i === p.weaponIndex ? 'active' : ''}"><b>${x.def.slot}</b>${x.def.short}${x.isGrenade && x.mag > 1 ? ' ×' + x.mag : ''}</div>`).join('');
    }
    e.bombCarry.classList.toggle('hidden', !p.hasBomb);
    // round / bomb
    const bomb = g.bomb;
    if (bomb.state === 'planted') {
      e.timer.textContent = '💣';
      e.timer.classList.add('urgent');
      this.setBombStatus(bomb.defusing ? 'DESACTIVANDO…' : `BOMBA PLANTADA EN ${bomb.site}`);
    } else {
      const t = Math.max(0, g.roundTimeLeft);
      e.timer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      e.timer.classList.toggle('urgent', t < 10 && g.roundState === 'live');
      this.setBombStatus(null);
    }
    e.scoreT.textContent = g.score.T;
    e.scoreCT.textContent = g.score.CT;
    // crosshair
    const spreadDeg = w && w.isGun ? w.spreadFor({ speedRatio: p.speedRatio, onGround: p.onGround, crouching: p.crouchT > 0.5 }) : 0;
    const px = Math.tan(spreadDeg * Math.PI / 180) * (innerHeight / 2) / Math.tan(g.camera.fov * Math.PI / 360);
    e.crosshair.style.setProperty('--gap', (4 + px * 2.2).toFixed(1) + 'px');
    this.root.classList.toggle('dead', !p.alive);
    // timers
    if (this.hitTimer > 0) { this.hitTimer -= dt; if (this.hitTimer <= 0) e.hitmarker.classList.remove('show'); }
    if (this.vignetteT > 0) { this.vignetteT -= dt; if (this.vignetteT <= 0) e.vignette.style.opacity = '0'; }
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) e.roundMsg.classList.remove('show'); }
    e.flash.style.opacity = String(Math.max(0, Math.min(1, g.flashAmount || 0)));
    // scoreboard
    if (!e.scoreboard.classList.contains('hidden')) {
      this.sbTimer -= dt;
      if (this.sbTimer <= 0) { this.sbTimer = 0.3; this._renderScoreboard(); }
    }
    this._drawRadar();
  }

  _renderScoreboard() {
    const g = this.game;
    const rows = (team) => g.characters.filter((c) => c.team === team).sort((a, b) => b.kills - a.kills).map((c) =>
      `<tr class="${c.alive ? '' : 'dead'} ${c === g.player ? 'me' : ''}"><td>${c.name}${c.hasBomb ? ' 💣' : ''}${c.kit ? ' ✂' : ''}</td><td>${c.kills}</td><td>${c.deaths}</td><td>${Math.round(c.damageDealt)}</td></tr>`).join('');
    this.el.sbT.innerHTML = rows('T');
    this.el.sbCT.innerHTML = rows('CT');
  }

  _drawRadar() {
    if (!this.radarBase) return;
    const g = this.game, p = g.player, map = g.map;
    const view = g.spectating || p;
    const ctx = this.rctx, W = this.radar.width, H = this.radar.height;
    ctx.clearRect(0, 0, W, H);
    const viewMeters = 64;
    const pxPerM = W / viewMeters;
    const s = this.radarScale / map.cell;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(view.yaw);
    ctx.scale(pxPerM / s, pxPerM / s);
    ctx.translate(-view.position.x * s, -view.position.z * s);
    ctx.drawImage(this.radarBase, 0, 0);
    ctx.restore();

    const project = (pos) => {
      const dx = pos.x - view.position.x, dz = pos.z - view.position.z;
      const cos = Math.cos(view.yaw), sin = Math.sin(view.yaw);
      let x = (dx * cos - dz * sin) * pxPerM, y = (dx * sin + dz * cos) * pxPerM;
      const r = Math.hypot(x, y), maxR = W / 2 - 8;
      if (r > maxR) { x *= maxR / r; y *= maxR / r; }
      return [W / 2 + x, H / 2 + y];
    };
    const dot = (ch, color, arrow) => {
      const [x, y] = project(ch.position);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      if (arrow) {
        ctx.rotate(-(ch.yaw - view.yaw));
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        if (!ch.alive) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, 3); ctx.moveTo(3, -3); ctx.lineTo(-3, 3); ctx.stroke(); }
      }
      ctx.restore();
    };
    const teamColor = p.team === 'T' ? '#ffb547' : '#5ec4ff';
    for (const c of g.characters) {
      if (c === view) continue;
      if (c.team === p.team) dot(c, c.alive ? teamColor : '#777', c.alive);
      else if (c.alive && g.time - (g.spotted.get(c.id) || -10) < 2.5) dot(c, '#ff4d4d', false);
    }
    // bomb marker
    const bomb = g.bomb;
    if (bomb.state === 'planted' || (bomb.state === 'dropped' && p.team === 'T')) {
      const [x, y] = project(bomb.position);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = bomb.state === 'planted' && Math.floor(g.time * 2) % 2 === 0 ? '#ff3b3b' : '#ffd38a';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#000'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('C', 0, 0.5);
      ctx.restore();
    }
    // viewer arrow
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = view === p ? '#ffffff' : teamColor;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
