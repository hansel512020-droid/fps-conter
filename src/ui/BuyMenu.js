import { WEAPONS, EQUIPMENT, BUY_CATEGORIES } from '../weapons/WeaponDefs.js';

/**
 * Buy menu (B). Mouse driven; pointer lock is released while open.
 */
export class BuyMenu {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.refreshTimer = 0;
    this.root = document.createElement('div');
    this.root.id = 'buymenu';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="bm-panel">
        <div class="bm-head"><span>EQUIPAMIENTO</span><span class="bm-money" id="bm-money">$ 0</span><span class="bm-time" id="bm-time"></span></div>
        <div class="bm-cols" id="bm-cols"></div>
        <div class="bm-foot"><span id="bm-msg"></span><button class="bm-close" id="bm-close">CERRAR (B)</button></div>
      </div>`;
    document.body.appendChild(this.root);
    this.cols = this.root.querySelector('#bm-cols');
    this.moneyEl = this.root.querySelector('#bm-money');
    this.timeEl = this.root.querySelector('#bm-time');
    this.msgEl = this.root.querySelector('#bm-msg');
    this.root.querySelector('#bm-close').addEventListener('click', () => this.close());
    this.buttons = new Map();
    for (const cat of BUY_CATEGORIES) {
      const col = document.createElement('div');
      col.className = 'bm-cat';
      col.innerHTML = `<h3>${cat.title}</h3>`;
      for (const key of cat.items) {
        const def = WEAPONS[key] || EQUIPMENT[key];
        const b = document.createElement('button');
        b.className = 'bm-item';
        b.dataset.key = key;
        b.innerHTML = `<span class="bm-name">${def.name}</span><span class="bm-price">$ ${def.price}</span>`;
        b.addEventListener('click', () => this.buy(key));
        col.appendChild(b);
        this.buttons.set(key, b);
      }
      this.cols.appendChild(col);
    }
  }

  toggle() { this.open ? this.close() : this.show(); }

  show() {
    const can = this.game.canBuy(this.game.player);
    if (!can.ok) { this.game.hud.message('', can.reason, 1.5); return; }
    this.open = true;
    this.root.classList.remove('hidden');
    this.game.input.releaseLock();
    this.refresh();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('hidden');
    if (this.game.state === 'playing') this.game.input.requestLock();
  }

  buy(key) {
    const r = this.game.purchase(this.game.player, key);
    this.msgEl.textContent = r.msg || '';
    this.msgEl.className = r.ok ? 'ok' : 'err';
    this.refresh();
  }

  refresh() {
    const g = this.game, p = g.player;
    this.moneyEl.textContent = '$ ' + p.money;
    const t = Math.max(0, g.buyTimeLeft);
    this.timeEl.textContent = `${Math.floor(t)}s`;
    for (const [key, b] of this.buttons) {
      const r = g.canPurchase(p, key);
      b.disabled = !r.ok;
      b.title = r.msg || '';
      const def = WEAPONS[key] || EQUIPMENT[key];
      b.classList.toggle('hidden', def.team && def.team !== p.team);
      b.classList.toggle('owned', r.owned);
    }
  }

  update(dt) {
    if (!this.open) return;
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) { this.refreshTimer = 0.25; this.refresh(); }
    if (!this.game.canBuy(this.game.player).ok) this.close();
  }
}
