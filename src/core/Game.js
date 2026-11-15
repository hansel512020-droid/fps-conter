import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Input } from './Input.js';
import { AudioEngine } from './Audio.js';
import { Bomb } from './Bomb.js';
import { GameMap } from '../world/GameMap.js';
import { buildArena01 } from '../world/maps/arena01.js';
import { rayAABB } from '../world/Physics.js';
import { Grenades } from '../world/Grenades.js';
import { Character } from '../entities/Character.js';
import { CharacterModel } from '../entities/CharacterModel.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { WEAPONS, EQUIPMENT } from '../weapons/WeaponDefs.js';
import { Effects } from '../fx/Effects.js';
import { NavGrid } from '../ai/NavGrid.js';
import { BotBrain } from '../ai/BotBrain.js';
import { HUD } from '../ui/HUD.js';
import { BuyMenu } from '../ui/BuyMenu.js';

const BOT_NAMES = {
  T: ['Volkov', 'Sable', 'Rojo', 'Kuro', 'Dagger', 'Marcos', 'Zeta', 'Falco'],
  CT: ['Mercer', 'Hale', 'Ortiz', 'Ryder', 'Nash', 'Bauer', 'Castro', 'Lynx'],
};
const ROUND_TIME = 115;
const FREEZE_TIME = 5;
const BUY_TIME = 20;
const END_TIME = 6;
const HALF_ROUNDS = 12;
const WIN_ROUNDS = 13;
const DEG = Math.PI / 180;
const BASE_FOV = 78;

const ECON = { winElim: 3250, winBomb: 3500, winDefuse: 3500, lossBase: 1400, lossStep: 500, lossMax: 3400, plantTeam: 800, plant: 300, defuse: 300, max: 16000, start: 800 };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xc4cfd9, 70, 260);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 400);
    this.scene.add(this.camera);

    this.time = 0;
    this.state = 'menu';
    // ctReactionScale: defenders holding an angle react a bit faster (keeps bot-vs-bot rounds balanced)
    this.settings = { team: 'T', difficulty: 'normal', sensitivity: 1, friendlyFire: false, ctReactionScale: 0.6 };
    this.stats = { shots: 0, grenades: 0, plants: 0, defuses: 0, explosions: 0, pickups: 0 };
    this.characters = [];
    this.bots = [];
    this.player = null;
    this.score = { T: 0, CT: 0 };
    this.roundNumber = 0;
    this.roundState = 'freeze';
    this.roundTimeLeft = ROUND_TIME;
    this.stateTimer = 0;
    this.buyTimeLeft = 0;
    this.spotted = new Map();
    this.punchPitch = 0; this.punchYaw = 0;
    this.flashAmount = 0; this.flashTimer = 0; this.flashTotal = 0;
    this.shakeAmt = 0;
    this.spotTimer = 0;
    this.deathCamYaw = 0; this.deathCamPitch = 0;
    this.spectating = null;
    this.spectateDelay = 0;
    this.teamPlan = { T: 'A' };
    this.intel = { T: { site: null, time: -100 }, CT: { site: null, time: -100 } };
    this.matchOver = false;
    this.targetFov = BASE_FOV;

    this._setupLights();
    this._setupSky();
    this.map = new GameMap(buildArena01());
    this.scene.add(this.map.group);
    this.nav = new NavGrid(this.map);
    this.effects = new Effects(this.scene);
    this.grenades = new Grenades(this, this.scene);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.hud = new HUD(this);
    this.hud.buildRadar(this.map);
    this.bomb = new Bomb(this);
    this.buyMenu = new BuyMenu(this);
    this.viewModel = null;

    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3(); this._tmp3 = new THREE.Vector3();
    this.onMenuRequest = null;

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.buyMenu.open) this.pause();
    };
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  weaponDef(key) { return WEAPONS[key]; }

  /* ---------- setup ---------- */
  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0xc9dcf5, 0x6e6250, 0.55);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    sun.position.set(55, 90, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  _setupSky() {
    const geo = new THREE.SphereGeometry(380, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x4f7fc6) }, horizon: { value: new THREE.Color(0xd9e3ec) },
        sunDir: { value: new THREE.Vector3(55, 90, 35).normalize() }, sunColor: { value: new THREE.Color(0xfff0d0) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top, horizon, sunDir, sunColor; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += sunColor * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
          c = mix(c, horizon * 0.9, smoothstep(0.0, -0.1, vDir.y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.viewModel) this.viewModel.resize(w / h);
    this.effects.setPointScale(h);
  }

  /* ---------- match control ---------- */
  start(settings) {
    Object.assign(this.settings, settings);
    this.audio.init();
    this.audio.resume();
    for (const c of this.characters) if (c.model) this.scene.remove(c.model.root);
    this.characters = []; this.bots = [];
    this.score = { T: 0, CT: 0 };
    this.roundNumber = 0;
    this.matchOver = false;
    const team = this.settings.team, enemy = team === 'T' ? 'CT' : 'T';
    this.player = new Character(this, { team, name: 'Tú', isBot: false });
    this.characters.push(this.player);
    const names = { T: [...BOT_NAMES.T].sort(() => Math.random() - 0.5), CT: [...BOT_NAMES.CT].sort(() => Math.random() - 0.5) };
    const mk = (t) => {
      const b = new Character(this, { team: t, name: names[t].pop(), isBot: true });
      b.model = new CharacterModel(t);
      this.scene.add(b.model.root);
      b.brain = new BotBrain(this, b, this.settings.difficulty);
      this.characters.push(b); this.bots.push(b);
    };
    for (let i = 0; i < 4; i++) mk(team);
    for (let i = 0; i < 5; i++) mk(enemy);
    for (const c of this.characters) { c.money = ECON.start; c.lossStreak = 0; c.kills = 0; c.deaths = 0; c.damageDealt = 0; c.alive = false; c.resetLoadout(); }
    if (this.settings.playerBot) {
      // debug: let a bot drive the player (used by balance tests)
      this.player.brain = new BotBrain(this, this.player, this.settings.difficulty);
      this.player.model = new CharacterModel(team);
      this.scene.add(this.player.model.root);
    }
    this._makeViewModel();
    this.sun.target.position.set(this.map.width / 2, 0, this.map.depth / 2);
    const sc = this.sun.shadow.camera;
    const r = Math.max(this.map.width, this.map.depth) * 0.62;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.updateProjectionMatrix();
    this.sun.position.set(this.map.width / 2 + 55, 95, this.map.depth / 2 + 35);
    this.hud.show();
    this.state = 'playing';
    this.startRound();
    this.input.requestLock();
  }

  _makeViewModel() {
    this.viewModel = new ViewModel(this.player.team);
    this.viewModel.resize(this.camera.aspect);
    this.viewModel.scene.environment = this.envMap;
    this.viewModel.scene.environmentIntensity = 0.7;
  }

  swapSides() {
    for (const c of this.characters) {
      c.team = c.team === 'T' ? 'CT' : 'T';
      c.money = ECON.start; c.lossStreak = 0; c.alive = false;
      c.resetLoadout();
      if (c.model) { this.scene.remove(c.model.root); c.model = new CharacterModel(c.team); this.scene.add(c.model.root); }
      if (c.brain) c.brain.site = null;
    }
    const s = this.score.T; this.score.T = this.score.CT; this.score.CT = s;
    this._makeViewModel();
    this.hud.message('Cambio de lado', this.player.team === 'T' ? 'Ahora eres atacante' : 'Ahora eres defensor', 4);
  }

  startRound() {
    if (this.matchOver) { this.start(this.settings); return; }
    this.roundNumber++;
    if (this.roundNumber === HALF_ROUNDS + 1) this.swapSides();
    this.roundState = 'freeze';
    this.stateTimer = FREEZE_TIME;
    this.roundTimeLeft = ROUND_TIME;
    this.buyTimeLeft = FREEZE_TIME + BUY_TIME;
    this.spotted.clear();
    this.grenades.reset();
    this.spectating = null;
    this.hud.setSpectate(null);
    this.hud.setScope(false);
    this.buyMenu.close();
    this.targetFov = BASE_FOV;
    // loadouts: dead players start over, survivors keep their gear
    for (const c of this.characters) {
      if (!c.alive) c.resetLoadout();
      else for (const w of c.weapons) if (w.isGun) w.refill();
    }
    const spawns = { T: this.map.spawnPoints('T').sort(() => Math.random() - 0.5), CT: this.map.spawnPoints('CT').sort(() => Math.random() - 0.5) };
    for (const c of this.characters) {
      const s = spawns[c.team].pop();
      c.respawn(s.pos.clone(), s.yaw);
    }
    // bomb carrier
    const ts = this.characters.filter((c) => c.team === 'T');
    let carrier = ts[Math.floor(Math.random() * ts.length)];
    if (this.player.team === 'T' && Math.random() < 0.35) carrier = this.player;
    this.bomb.reset(carrier);
    // team plans
    this.teamPlan.T = Math.random() < 0.5 ? 'A' : 'B';
    this.intel.T = { site: null, time: -100 }; this.intel.CT = { site: null, time: -100 };
    const cts = this.bots.filter((b) => b.team === 'CT');
    cts.forEach((b, i) => { b.brain.site = i % 2 === 0 ? 'A' : 'B'; });
    const tBots = this.bots.filter((b) => b.team === 'T');
    const lurkerIdx = Math.floor(Math.random() * tBots.length);
    tBots.forEach((b, i) => { b.brain.lurker = i === lurkerIdx && b !== carrier; });
    for (const b of this.bots) { b.brain.reset(); this.botBuy(b); b.selectBest(); }
    if (this.player.brain) { this.player.brain.reset(); this.botBuy(this.player); this.player.selectBest(); }
    this.punchPitch = 0; this.punchYaw = 0;
    const objective = this.player.team === 'T' ? 'Planta la bomba en A o B' : 'Impide que planten la bomba';
    this.hud.message(`Ronda ${this.roundNumber}`, objective, 3);
    this.audio.ui('round');
    if (carrier === this.player) setTimeout(() => this.hud.message('', 'Llevas la bomba (tecla 5)', 2.5), 3200);
  }

  endRound(winner, reason, type = 'elim') {
    if (this.roundState === 'ended') return;
    this.roundState = 'ended';
    this.stateTimer = END_TIME;
    this.score[winner]++;
    const name = winner === 'T' ? 'Atacantes' : 'Defensores';
    const won = winner === this.player.team;
    this.hud.message(`${name} ganan la ronda`, reason, END_TIME - 0.5);
    this.audio.ui(won ? 'win' : 'lose');
    // economy
    const winAmt = type === 'bomb' ? ECON.winBomb : type === 'defuse' ? ECON.winDefuse : ECON.winElim;
    for (const c of this.characters) {
      if (c.team === winner) { this.giveMoney(c, winAmt, 'victoria'); c.lossStreak = 0; }
      else {
        const amt = Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * c.lossStreak);
        this.giveMoney(c, amt, 'derrota');
        c.lossStreak++;
        if (c.team === 'T' && this.bomb.state !== 'none' && this.bomb.state !== 'carried' && this.bomb.state !== 'dropped') this.giveMoney(c, ECON.plantTeam, 'bomba plantada');
      }
    }
    if (this.score.T >= WIN_ROUNDS || this.score.CT >= WIN_ROUNDS) {
      this.matchOver = true;
      this.stateTimer = 10;
      const w = this.score.T > this.score.CT ? 'T' : 'CT';
      setTimeout(() => this.hud.message(w === this.player.team ? '¡VICTORIA!' : 'DERROTA', `${this.score.T} – ${this.score.CT} · nueva partida en unos segundos`, 9), 2500);
    }
  }

  giveMoney(c, amt, label = '') {
    const before = c.money;
    c.money = Math.max(0, Math.min(ECON.max, c.money + amt));
    if (c === this.player && c.money !== before) this.hud.moneyPop(c.money - before, label);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.onMenuRequest?.();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.audio.resume();
    this.input.requestLock();
  }

  /* ---------- buying ---------- */
  canBuy(ch) {
    if (!ch.alive) return { ok: false, reason: 'Estás muerto' };
    if (!(this.roundState === 'freeze' || (this.roundState === 'live' && this.buyTimeLeft > 0))) return { ok: false, reason: 'Se acabó el tiempo de compra' };
    if (this.map.zoneAt(ch.position) !== ch.team) return { ok: false, reason: 'Solo puedes comprar en tu zona de inicio' };
    return { ok: true };
  }

  canPurchase(ch, key) {
    const def = WEAPONS[key] || EQUIPMENT[key];
    if (!def) return { ok: false, msg: 'Objeto desconocido' };
    if (def.team && def.team !== ch.team) return { ok: false, msg: 'No disponible para tu equipo' };
    let price = def.price;
    if (key === 'vest') { if (ch.armor >= 100) return { ok: false, owned: true, msg: 'Ya tienes chaleco' }; }
    else if (key === 'vesthelm') { if (ch.armor >= 100 && ch.helmet) return { ok: false, owned: true, msg: 'Ya tienes chaleco y casco' }; if (ch.armor >= 100) price = 350; }
    else if (key === 'kit') { if (ch.kit) return { ok: false, owned: true, msg: 'Ya tienes el kit' }; }
    else {
      const existing = ch.weapons.find((w) => w.key === key);
      if (def.type === 'grenade') {
        if (existing && existing.mag >= def.maxCount) return { ok: false, owned: true, msg: 'Ya llevas el máximo' };
        const total = ch.grenades.reduce((s, g) => s + g.mag, 0);
        if (total >= 4) return { ok: false, msg: 'Máximo 4 granadas' };
      } else if (existing) return { ok: false, owned: true, msg: 'Ya tienes esta arma' };
    }
    if (ch.money < price) return { ok: false, msg: 'Dinero insuficiente', price };
    return { ok: true, price };
  }

  purchase(ch, key, force = false) {
    if (!force) { const c = this.canBuy(ch); if (!c.ok) return { ok: false, msg: c.reason }; }
    const r = this.canPurchase(ch, key);
    if (!r.ok) return r;
    const def = WEAPONS[key] || EQUIPMENT[key];
    ch.money -= r.price;
    if (key === 'vest') { ch.armor = 100; }
    else if (key === 'vesthelm') { ch.armor = 100; ch.helmet = true; }
    else if (key === 'kit') { ch.kit = true; }
    else ch.giveWeapon(key, def.type !== 'grenade' && ch === this.player);
    if (ch === this.player) { this.audio.buy(); this.hud.moneyPop(-r.price, def.name); }
    return { ok: true, msg: `Comprado: ${def.name}` };
  }

  botBuy(b) {
    const rifleKey = b.team === 'T' ? 'rifle' : 'carbine';
    const armorCost = b.armor < 50 ? 1000 : !b.helmet ? 350 : 0;
    const buy = (k) => this.purchase(b, k, true).ok;
    if (!b.primary) {
      if (b.money >= WEAPONS[rifleKey].price + armorCost + 200) { buy(rifleKey); if (armorCost) buy('vesthelm'); }
      else if (b.money >= WEAPONS.sniper.price + 1000 && Math.random() < 0.25) { buy('sniper'); buy('vesthelm'); }
      else if (b.money >= WEAPONS.smg.price + 650 + 100) { buy('smg'); buy('vest'); }
      else if (b.money >= WEAPONS.shotgun.price + 650 && Math.random() < 0.4) { buy('shotgun'); buy('vest'); }
      else if (b.money >= 650 + 700 && Math.random() < 0.5) { buy('vest'); buy('heavy_pistol'); }
      else if (b.money >= 1000 && this.roundNumber % HALF_ROUNDS === 1) { buy('vest'); }
    } else if (armorCost && b.money >= armorCost + 300) buy('vesthelm');
    if (b.team === 'CT' && !b.kit && b.money >= 400 + 600) buy('kit');
    for (const g of ['grenade_flash', 'grenade_smoke', 'grenade_he']) {
      if (b.money - WEAPONS[g].price >= 1200 && Math.random() < 0.6) buy(g);
    }
  }

  /* ---------- combat ---------- */
  hasLineOfSight(eye, target) {
    const world = this.map.collision;
    const pts = [target.position.clone().add(new THREE.Vector3(0, 1.2 * (target.height / 1.8), 0)), target.getEyePosition(new THREE.Vector3())];
    for (const p of pts) {
      const dir = p.clone().sub(eye);
      const dist = dir.length();
      if (dist < 0.01) return true;
      dir.divideScalar(dist);
      const hit = world.raycast(eye, dir, dist);
      if (hit && hit.t < dist - 0.05) continue;
      if (this.grenades.blocksSight(eye, p)) continue;
      return true;
    }
    return false;
  }

  traceBullet(origin, dir, maxDist, shooter) {
    const world = this.map.collision.raycast(origin, dir, maxDist);
    let best = null, bestT = world ? world.t : maxDist;
    for (const c of this.characters) {
      if (c === shooter || !c.alive) continue;
      const toC = this._tmp.copy(c.position).setY(c.position.y + 0.9).sub(origin);
      const along = toC.dot(dir);
      if (along < 0 || along > bestT + 1) continue;
      const perp = toC.lengthSq() - along * along;
      if (perp > 1.5 * 1.5) continue;
      for (const hb of c.getHitboxes()) {
        const t = rayAABB(origin, dir, hb.min, hb.max, bestT);
        if (t !== null && t < bestT) { bestT = t; best = { character: c, zone: hb.zone }; }
      }
    }
    if (best) return { t: bestT, point: origin.clone().addScaledVector(dir, bestT), character: best.character, zone: best.zone, normal: dir.clone().negate() };
    if (world) return { t: world.t, point: world.point, normal: world.normal, box: world.box };
    return null;
  }

  /** Handles trigger input for a character. Returns true if a shot was fired / grenade thrown. */
  fireWeapon(ch, triggerDown) {
    const w = ch.weapon;
    if (!w || !ch.alive) return false;
    if (this.roundState === 'freeze' || this.roundState === 'ended' && this.matchOver) triggerDown = false;
    const res = w.tryFire(this.time, triggerDown);
    if (!res) return false;
    const isPlayer = ch === this.player;
    if (res === 'dry') { if (isPlayer) this.audio.dryFire(); return false; }
    if (res === 'plant') { ch.plantHeld = true; return false; }
    const def = w.def;
    const origin = ch.getEyePosition(new THREE.Vector3());
    let yaw = ch.yaw, pitch = ch.pitch;
    if (isPlayer) { yaw += this.punchYaw; pitch += this.punchPitch; }
    const forward = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    // ----- grenades
    if (res.throw) {
      const start = origin.clone().addScaledVector(forward, 0.35).addScaledVector(right, 0.12);
      this.grenades.throwGrenade(ch, def, start, forward);
      this.stats.grenades++;
      if (isPlayer) this.viewModel.kick(def);
      if (w.mag <= 0) ch.removeWeapon(w); else w.draw(this.time);
      return true;
    }

    const spreadDeg = w.spreadFor({ speedRatio: ch.speedRatio, onGround: ch.onGround, crouching: ch.crouchT > 0.5 });
    const pellets = def.pellets || 1;
    const maxDist = def.type === 'melee' ? def.range : 300;
    const muzzle = isPlayer ? this.viewModel.getMuzzleWorld(this.camera, new THREE.Vector3()) : (ch.model ? ch.model.getMuzzleWorld(new THREE.Vector3()) : origin.clone());
    let hitSomeone = false, killed = false;
    for (let p = 0; p < pellets; p++) {
      const dir = forward.clone();
      if (spreadDeg > 0) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spreadDeg * DEG;
        const up = new THREE.Vector3().crossVectors(right, dir).normalize();
        dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      }
      const hit = this.traceBullet(origin, dir, maxDist, ch);
      if (def.type !== 'melee') {
        const end = hit ? hit.point : origin.clone().addScaledVector(dir, maxDist);
        if (p < 3) this.effects.tracer(muzzle, end, isPlayer ? 0.7 : 1);
      }
      if (!hit) continue;
      if (hit.character) {
        const victim = hit.character;
        let dmg = def.damage;
        if (def.falloff) dmg *= Math.pow(def.falloff, hit.t / 15);
        victim.takeDamage(dmg, hit.zone, ch, def.key);
        if ((p === 0 || Math.random() < 0.4) && victim !== this.player) { this.effects.blood(hit.point, dir); this.audio.hitFlesh(hit.point); }
        else if (victim === this.player && p === 0) this.audio.hitFlesh(null);
        if (victim.model) victim.model.flash();
        if (victim.brain) victim.brain.onDamaged(ch);
        if (victim === this.player) this.hud.damage();
        hitSomeone = true; if (!victim.alive) killed = true;
      } else if (p < 4) {
        const mat = hit.box?.material || 'concrete';
        this.effects.impact(hit.point, hit.normal, mat);
        if (p === 0) this.audio.impact(hit.point, mat);
      }
    }
    if (def.type !== 'melee') {
      if (!isPlayer) this.effects.muzzleFlash(muzzle, forward);
      this.audio.gunshot(def.sound, isPlayer ? null : muzzle);
    } else if (isPlayer) this.audio.gunshot('knife');
    if (isPlayer && hitSomeone) { this.hud.hitMarker(killed); this.audio.hitConfirm(); }

    if (isPlayer) {
      this.punchPitch += res.kick.pitch;
      this.punchYaw += res.kick.yaw;
      this.viewModel.kick(def);
      if (def.type === 'sniper') this.targetFov = BASE_FOV;
    } else {
      ch.pitch += res.kick.pitch * 0.35;
      ch.yaw += res.kick.yaw * 0.35;
    }
    if (def.type !== 'melee') for (const b of this.bots) if (b !== ch && b.alive) b.brain.hear(ch, 1);
    return true;
  }

  requestDefuse(ch) { ch.defuseHeld = true; }

  /** Team knowledge: an enemy was seen/heard near a bomb site. */
  reportEnemy(team, pos) {
    const zone = this.map.zoneAt(pos);
    let site = zone === 'A' || zone === 'B' ? zone : null;
    if (!site) {
      // near a site counts too
      for (const s of ['A', 'B']) { const c = this.map.sites[s + '_center']; if (c && c.distanceTo(pos) < 22) site = s; }
    }
    if (site) this.intel[team] = { site, time: this.time };
  }

  onBombPlanted(ch, zone) {
    this.stats.plants++;
    this.giveMoney(ch, ECON.plant, 'bomba plantada');
    this.hud.message('¡Bomba plantada!', `Sitio ${zone} · 40 segundos`, 3);
    this.audio.ui('round');
    for (const b of this.bots) { b.brain.goal = null; b.brain.repathTimer = 0; }
    this.roundTimeLeft = Math.max(this.roundTimeLeft, 1);
  }

  onBombDefused(ch) {
    this.stats.defuses++;
    this.giveMoney(ch, ECON.defuse, 'desactivación');
    this.endRound('CT', `${ch.name} desactivó la bomba`, 'defuse');
  }

  onBombExploded(pos) {
    this.stats.explosions++;
    this.effects.explosion(pos);
    this.effects.explosion(pos.clone().add(new THREE.Vector3(1.5, 0.5, -1)));
    this.audio.explosion(pos);
    for (const c of this.characters) {
      if (!c.alive) continue;
      const d = c.position.distanceTo(pos);
      if (d > 26) continue;
      const dmg = 500 * Math.pow(1 - d / 26, 2);
      c.takeDamage(dmg, 'stomach', this.bomb.planter, 'bomb');
    }
    if (this.player.alive) this.shake(Math.max(0.3, 1 - this.player.position.distanceTo(pos) / 60));
    else this.shake(0.4);
    this.endRound('T', 'La bomba ha explotado', 'bomb');
  }

  onCharacterDied(victim, attacker, weaponKey, headshot) {
    const me = victim === this.player || attacker === this.player;
    this.hud.killFeed(attacker, victim, weaponKey, headshot, me);
    if (attacker && attacker !== victim) {
      if (attacker.team !== victim.team) this.giveMoney(attacker, WEAPONS[weaponKey]?.killReward ?? 300, 'baja');
      else this.giveMoney(attacker, -300, 'fuego amigo');
    }
    if (victim === this.player) {
      this.hud.message('Has muerto', 'Observando hasta la siguiente ronda', 3);
      this.deathCamYaw = this.player.yaw; this.deathCamPitch = this.player.pitch;
      this.spectateDelay = 2;
      this.hud.setScope(false);
      this.targetFov = BASE_FOV;
      this.buyMenu.close();
    }
    this.checkRoundEnd();
  }

  checkRoundEnd() {
    if (this.roundState !== 'live') return;
    const aliveT = this.characters.filter((c) => c.team === 'T' && c.alive).length;
    const aliveCT = this.characters.filter((c) => c.team === 'CT' && c.alive).length;
    if (this.bomb.state === 'planted') {
      if (aliveCT === 0) this.endRound('T', 'Defensores eliminados');
      return;
    }
    if (aliveT === 0) this.endRound('CT', 'Atacantes eliminados');
    else if (aliveCT === 0) this.endRound('T', 'Defensores eliminados');
  }

  onFootstep(ch, loud) {
    const isPlayer = ch === this.player;
    this.audio.footstep(isPlayer ? null : ch.position, loud * (isPlayer ? 0.6 : 1));
    if (loud >= 1) for (const b of this.bots) if (b !== ch && b.alive && b.position.distanceTo(ch.position) < 9) b.brain.hear(ch, 0.25);
  }

  shake(a) { this.shakeAmt = Math.min(1.5, this.shakeAmt + a); }

  flash(dur) {
    this.flashTimer = Math.max(this.flashTimer, dur);
    this.flashTotal = Math.max(this.flashTotal, dur);
    if (dur > 1.5) this.audio.ringing(dur);
  }

  /* ---------- loop ---------- */
  _loop(now) {
    requestAnimationFrame(this._loop);
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05;
    if (this.state === 'playing') this.update(dt);
    this.render();
  }

  update(dt) {
    this.time += dt;
    const p = this.player, input = this.input;
    const bomb = this.bomb;

    // round state machine
    if (this.roundState === 'freeze') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) { this.roundState = 'live'; this.hud.message('¡Adelante!', '', 1.2); }
    } else if (this.roundState === 'live') {
      if (bomb.state !== 'planted') {
        this.roundTimeLeft -= dt;
        if (this.roundTimeLeft <= 0) { this.roundTimeLeft = 0; this.endRound('CT', 'Se agotó el tiempo'); }
      }
    } else if (this.roundState === 'ended') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.startRound();
    }
    this.buyTimeLeft -= dt;
    const frozen = this.roundState === 'freeze';

    // ----- player input
    const { dx, dy } = input.consumeMouse();
    const fovScale = this.camera.fov / BASE_FOV;
    const sens = this.settings.sensitivity * 0.0022 * fovScale;
    const lookDx = this.buyMenu.open ? 0 : dx, lookDy = this.buyMenu.open ? 0 : dy;
    if (p.alive) {
      p.yaw -= lookDx * sens;
      p.pitch = THREE.MathUtils.clamp(p.pitch - lookDy * sens, -89 * DEG, 89 * DEG);
    } else {
      this.deathCamYaw -= lookDx * sens;
      this.deathCamPitch = THREE.MathUtils.clamp(this.deathCamPitch - lookDy * sens, -89 * DEG, 89 * DEG);
    }
    const wish = {
      forward: (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0),
      right: (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0),
      jump: input.down('Space'), crouch: input.down('ControlLeft') || input.down('KeyC'),
      walk: input.down('ShiftLeft'),
    };
    if (frozen) { wish.forward = 0; wish.right = 0; wish.jump = false; }
    if (input.wasPressed('KeyB')) this.buyMenu.toggle();
    if (input.wasPressed('Escape') && this.buyMenu.open) this.buyMenu.close();
    if (!this.buyMenu.open) {
      let switched = false;
      for (let s = 1; s <= 5; s++) if (input.wasPressed('Digit' + s)) switched = p.selectSlot(s) || switched;
      if (input.wheel !== 0) { p.cycleWeapon(input.wheel > 0 ? 1 : -1); switched = true; }
      if (switched) { this.audio.weaponSwitch(); this.targetFov = BASE_FOV; }
      if (input.wasPressed('KeyR') && p.alive && p.weapon?.startReload(this.time)) { this.audio.reload(); this.targetFov = BASE_FOV; }
      if (input.buttonPressed(2) && p.alive && p.weapon?.def.scope) { p.weapon.toggleZoom(); }
    }
    this.hud.setScoreboard(input.down('Tab'));
    if (p.brain) {
      const bw = p.brain.update(dt);
      p.updateMovement(dt, frozen ? { forward: 0, right: 0 } : bw);
      if (p.model) p.model.setWeapon(p.weapon?.key || 'knife');
    } else {
      p.updateMovement(dt, wish);
      const playerTrigger = input.button(0) && p.alive && !frozen && !this.buyMenu.open;
      this.fireWeapon(p, playerTrigger);
    }
    if (p.alive && p.weapon?.def.scope) this.targetFov = p.weapon.scopeFov || BASE_FOV;
    else this.targetFov = BASE_FOV;
    if (p.alive && p.team === 'CT' && input.down('KeyE')) p.defuseHeld = true;

    // recoil recovery
    const rec = p.weapon ? p.weapon.def.recoil.recover : 8;
    const k = Math.exp(-rec * dt);
    this.punchPitch *= k; this.punchYaw *= k;

    // ----- bots
    for (const b of this.bots) {
      const w = b.brain.update(dt);
      b.updateMovement(dt, frozen ? { forward: 0, right: 0 } : w);
      if (b.model) b.model.setWeapon(b.weapon?.key || 'knife');
    }
    for (const c of this.characters) {
      for (const w of c.weapons) w.update(this.time, dt);
      if (c.model) c.model.update(dt, c);
    }
    for (const b of this.bots) {
      const w = b.weapon;
      if (w && w.reloading && !b._reloadSfx) { b._reloadSfx = true; this.audio.reload(b.position); }
      if (w && !w.reloading) b._reloadSfx = false;
    }

    // ----- bomb: plant / defuse / pickup
    if (bomb.state === 'carried' && bomb.carrier) {
      const c = bomb.carrier;
      bomb.plantTick(c, dt, !!c.plantHeld && c.weapon?.isBomb && this.roundState === 'live');
    }
    if (bomb.state === 'planted') {
      for (const c of this.characters) if (c.team === 'CT') bomb.defuseTick(c, dt, !!c.defuseHeld);
    }
    if (bomb.state === 'dropped') {
      for (const c of this.characters) if (c.team === 'T' && c.alive && bomb.tryPickup(c)) break;
    }
    for (const c of this.characters) { c.plantHeld = false; c.defuseHeld = false; }
    bomb.update(dt);
    this.grenades.update(dt);

    // ----- spotting enemies for radar (player's own vision)
    this.spotTimer -= dt;
    if (this.spotTimer <= 0 && p.alive) {
      this.spotTimer = 0.2;
      const eye = p.getEyePosition(this._tmp2);
      const fwd = p.getForward(this._tmp3);
      for (const c of this.characters) {
        if (c.team === p.team || !c.alive) continue;
        const d = this._tmp.copy(c.position).sub(p.position);
        const dist = d.length();
        if (dist > 80 || d.normalize().dot(fwd) < Math.cos(50 * DEG)) continue;
        if (this.hasLineOfSight(eye, c)) this.spotted.set(c.id, this.time);
      }
    }

    // ----- camera
    this.camera.fov += (this.targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();
    this.hud.setScope(p.alive && this.camera.fov < BASE_FOV - 10);
    if (p.alive) {
      this.spectating = null;
      p.getEyePosition(this.camera.position);
      if (p.onGround && p.speedRatio > 0.05) {
        this._bobT = (this._bobT || 0) + dt * 9 * (0.6 + p.speedRatio);
        this.camera.position.y += Math.abs(Math.sin(this._bobT)) * 0.018 * p.speedRatio;
      }
      this.camera.rotation.set(0, 0, 0, 'YXZ');
      this.camera.rotation.y = p.yaw + this.punchYaw;
      this.camera.rotation.x = p.pitch + this.punchPitch;
      this.camera.rotation.z = -this.punchYaw * 0.3;
    } else {
      this.spectateDelay -= dt;
      const mates = this.characters.filter((c) => c !== p && c.team === p.team && c.alive);
      if (this.spectateDelay <= 0 && mates.length) {
        if (!this.spectating || !this.spectating.alive) this.spectating = mates[0];
        if (input.buttonPressed(0)) this.spectating = mates[(mates.indexOf(this.spectating) + 1) % mates.length];
      } else this.spectating = null;
      if (this.spectating) {
        const s = this.spectating;
        s.getEyePosition(this.camera.position);
        this.camera.rotation.set(0, 0, 0, 'YXZ');
        this.camera.rotation.y = s.yaw;
        this.camera.rotation.x = s.pitch;
      } else {
        this.camera.position.set(p.position.x, p.position.y + 0.9, p.position.z);
        this.camera.rotation.set(0, 0, 0, 'YXZ');
        this.camera.rotation.y = this.deathCamYaw;
        this.camera.rotation.x = this.deathCamPitch;
      }
      this.hud.setSpectate(this.spectating ? this.spectating.name : null);
    }
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      this.camera.rotation.x += (Math.random() - 0.5) * 0.06 * s;
      this.camera.rotation.y += (Math.random() - 0.5) * 0.06 * s;
      this.camera.rotation.z += (Math.random() - 0.5) * 0.04 * s;
      this.shakeAmt *= Math.exp(-dt * 3.5);
    }
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);

    // flash overlay
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const hold = this.flashTotal * 0.55;
      this.flashAmount = this.flashTimer > hold ? 1 : Math.max(0, this.flashTimer / hold);
      if (this.flashTimer <= 0) { this.flashAmount = 0; this.flashTotal = 0; }
    }

    // ----- view model
    if (p.alive && p.weapon && this.camera.fov > BASE_FOV - 10) {
      this.viewModel.setWeapon(p.weapon.key);
      const w = p.weapon;
      const reloadProgress = w.reloadProgress(this.time);
      const drawProgress = THREE.MathUtils.clamp(1 - (w.drawEnd - this.time) / w.def.swapTime, 0, 1);
      this.viewModel.update(dt, { dx: lookDx, dy: lookDy, speedRatio: p.speedRatio, onGround: p.onGround, crouchT: p.crouchT, reloadProgress, drawProgress, vy: p.velocity.y });
      this.viewModel.visible = true;
    } else this.viewModel.visible = false;

    // ----- HUD extras: progress bars and hints
    if (bomb.planting && bomb.planting.ch === p) this.hud.progress('PLANTANDO', bomb.planting.progress, 'plant');
    else if (bomb.defusing && bomb.defusing.ch === p) this.hud.progress(p.kit ? 'DESACTIVANDO (KIT)' : 'DESACTIVANDO', bomb.defusing.progress, 'defuse');
    else this.hud.hideProgress();
    let hint = '';
    if (p.alive) {
      const zone = this.map.zoneAt(p.position);
      if (this.buyMenu.open) hint = '';
      else if (p.hasBomb && (zone === 'A' || zone === 'B') && this.roundState === 'live') hint = p.weapon?.isBomb ? 'Mantén el clic para plantar la bomba' : 'Pulsa 5 para sacar la bomba y plantarla';
      else if (p.team === 'CT' && bomb.state === 'planted' && p.position.distanceTo(bomb.position) < 1.7) hint = 'Mantén E para desactivar la bomba';
      else if (this.canBuy(p).ok && this.buyTimeLeft > 0) hint = `Pulsa B para comprar (${Math.ceil(this.buyTimeLeft)}s)`;
    }
    this.hud.hint(hint);
    this.buyMenu.update(dt);

    this.effects.update(dt);
    this.map.update(dt, this.time);
    const fwd = this.camera.getWorldDirection(this._tmp);
    this.audio.setListener(this.camera.position, fwd, new THREE.Vector3(0, 1, 0));
    this.hud.update(dt);
    input.endFrame();
  }

  /** Debug/test helper: advance the simulation without rendering. */
  simulate(seconds, step = 1 / 60) {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) this.update(step);
  }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.viewModel && this.state !== 'menu') this.viewModel.render(this.renderer);
  }
}
