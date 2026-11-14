import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Input } from './Input.js';
import { AudioEngine } from './Audio.js';
import { GameMap } from '../world/GameMap.js';
import { buildArena01 } from '../world/maps/arena01.js';
import { rayAABB } from '../world/Physics.js';
import { Character } from '../entities/Character.js';
import { CharacterModel } from '../entities/CharacterModel.js';
import { ViewModel } from '../weapons/ViewModel.js';
import { Effects } from '../fx/Effects.js';
import { NavGrid } from '../ai/NavGrid.js';
import { BotBrain } from '../ai/BotBrain.js';
import { HUD } from '../ui/HUD.js';

const BOT_NAMES = {
  T: ['Volkov', 'Sable', 'Rojo', 'Kuro', 'Dagger', 'Marcos', 'Zeta', 'Falco'],
  CT: ['Mercer', 'Hale', 'Ortiz', 'Ryder', 'Nash', 'Bauer', 'Castro', 'Lynx'],
};
const ROUND_TIME = 115;
const FREEZE_TIME = 4;
const END_TIME = 5;
const DEG = Math.PI / 180;

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
    // image-based lighting so metals/PBR materials have something to reflect
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 400);
    this.scene.add(this.camera);

    this.time = 0;
    this.state = 'menu';
    this.settings = { team: 'T', difficulty: 'normal', sensitivity: 1 };
    this.characters = [];
    this.bots = [];
    this.player = null;
    this.score = { T: 0, CT: 0 };
    this.roundNumber = 0;
    this.roundState = 'freeze';
    this.roundTimeLeft = ROUND_TIME;
    this.stateTimer = 0;
    this.spotted = new Map();
    this.punchPitch = 0; this.punchYaw = 0;
    this.flashAmount = 0;
    this.spotTimer = 0;
    this.deathCamYaw = 0; this.deathCamPitch = 0;

    this._setupLights();
    this._setupSky();
    this.map = new GameMap(buildArena01());
    this.scene.add(this.map.group);
    this.nav = new NavGrid(this.map);
    this.effects = new Effects(this.scene);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.hud = new HUD(this);
    this.hud.buildRadar(this.map);
    this.viewModel = null;

    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3(); this._tmp3 = new THREE.Vector3();
    this.onMenuRequest = null;

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

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
    // tear down previous match
    for (const c of this.characters) if (c.model) this.scene.remove(c.model.root);
    this.characters = []; this.bots = [];
    this.score = { T: 0, CT: 0 };
    this.roundNumber = 0;
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
    for (const c of this.characters) this._giveLoadout(c);
    this.viewModel = new ViewModel(team);
    this.viewModel.resize(this.camera.aspect);
    this.viewModel.scene.environment = this.envMap;
    this.viewModel.scene.environmentIntensity = 0.7;
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

  _giveLoadout(c) {
    c.weapons = [];
    c.giveWeapon('knife', false);
    c.giveWeapon('pistol', false);
    c.giveWeapon(c.team === 'T' ? 'rifle' : 'carbine', false);
    c.armor = 100; c.helmet = true;
    c.selectBest();
  }

  startRound() {
    this.roundNumber++;
    this.roundState = 'freeze';
    this.stateTimer = FREEZE_TIME;
    this.roundTimeLeft = ROUND_TIME;
    this.spotted.clear();
    const spawns = { T: this.map.spawnPoints('T').sort(() => Math.random() - 0.5), CT: this.map.spawnPoints('CT').sort(() => Math.random() - 0.5) };
    for (const c of this.characters) {
      const s = spawns[c.team].pop();
      c.respawn(s.pos.clone(), s.yaw);
      c.armor = 100; c.helmet = true;
      if (c.brain) c.brain.reset();
    }
    this.punchPitch = 0; this.punchYaw = 0;
    this.hud.message(`Ronda ${this.roundNumber}`, this.player.team === 'T' ? 'Elimina a los defensores' : 'Elimina a los atacantes', 3);
    this.audio.ui('round');
  }

  endRound(winner, reason) {
    if (this.roundState === 'ended') return;
    this.roundState = 'ended';
    this.stateTimer = END_TIME;
    this.score[winner]++;
    const name = winner === 'T' ? 'Atacantes' : 'Defensores';
    const won = winner === this.player.team;
    this.hud.message(`${name} ganan la ronda`, reason, END_TIME - 0.5);
    this.audio.ui(won ? 'win' : 'lose');
    for (const c of this.characters) c.money = Math.min(16000, c.money + (c.team === winner ? 3250 : 1400));
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
      if (!hit || hit.t >= dist - 0.05) return true;
    }
    return false;
  }

  /** Full bullet trace: returns the nearest of world / characters. */
  traceBullet(origin, dir, maxDist, shooter) {
    const world = this.map.collision.raycast(origin, dir, maxDist);
    let best = null, bestT = world ? world.t : maxDist;
    for (const c of this.characters) {
      if (c === shooter || !c.alive) continue;
      // quick reject by distance to ray
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

  /**
   * Handles trigger input for a character. Returns true if a shot was fired this call.
   */
  fireWeapon(ch, triggerDown) {
    const w = ch.weapon;
    if (!w || !ch.alive) return false;
    if (this.roundState === 'freeze') triggerDown = false;
    const res = w.tryFire(this.time, triggerDown);
    if (!res) return false;
    const isPlayer = ch === this.player;
    if (res === 'dry') { if (isPlayer) this.audio.dryFire(); return false; }
    const def = w.def;
    const origin = ch.getEyePosition(new THREE.Vector3());
    // base direction includes recoil punch for the player
    let yaw = ch.yaw, pitch = ch.pitch;
    if (isPlayer) { yaw += this.punchYaw; pitch += this.punchPitch; }
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    // spread
    const spreadDeg = w.spreadFor({ speedRatio: ch.speedRatio, onGround: ch.onGround, crouching: ch.crouchT > 0.5 });
    if (spreadDeg > 0) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spreadDeg * DEG;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    const maxDist = def.type === 'melee' ? def.range : 300;
    const hit = this.traceBullet(origin, dir, maxDist, ch);

    // muzzle position for effects
    const muzzle = isPlayer ? this.viewModel.getMuzzleWorld(this.camera, new THREE.Vector3()) : (ch.model ? ch.model.getMuzzleWorld(new THREE.Vector3()) : origin.clone());
    if (def.type !== 'melee') {
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, maxDist);
      this.effects.tracer(muzzle, end, isPlayer ? 0.7 : 1);
      if (!isPlayer) this.effects.muzzleFlash(muzzle, dir);
      this.audio.gunshot(def.sound, isPlayer ? null : muzzle);
    } else if (isPlayer) this.audio.gunshot('knife');

    if (hit) {
      if (hit.character) {
        const victim = hit.character;
        let dmg = def.damage;
        if (def.falloff) dmg *= Math.pow(def.falloff, hit.t / 15);
        const dealt = victim.takeDamage(dmg, hit.zone, ch, def.key);
        this.effects.blood(hit.point, dir);
        this.audio.hitFlesh(hit.point);
        if (victim.model) victim.model.flash();
        if (victim.brain) victim.brain.onDamaged(ch);
        if (isPlayer) { this.hud.hitMarker(!victim.alive); this.audio.hitConfirm(); this.spotted.set(victim.id, this.time); }
        if (victim === this.player) { this.hud.damage(); }
        void dealt;
      } else {
        const mat = hit.box?.material || 'concrete';
        this.effects.impact(hit.point, hit.normal, mat);
        this.audio.impact(hit.point, mat);
      }
    }

    // recoil
    if (isPlayer) {
      this.punchPitch += res.kick.pitch;
      this.punchYaw += res.kick.yaw;
      this.viewModel.kick(def);
    } else {
      ch.pitch += res.kick.pitch * 0.35;
      ch.yaw += res.kick.yaw * 0.35;
    }
    // bots hear gunfire
    if (def.type !== 'melee') for (const b of this.bots) if (b !== ch && b.alive) b.brain.hear(ch, 1);
    return true;
  }

  onCharacterDied(victim, attacker, weaponKey, headshot) {
    const me = victim === this.player || attacker === this.player;
    this.hud.killFeed(attacker, victim, weaponKey, headshot, me);
    if (victim === this.player) {
      this.hud.message('Has muerto', 'Observando hasta la siguiente ronda', 4);
      this.deathCamYaw = this.player.yaw; this.deathCamPitch = this.player.pitch;
    }
    if (this.roundState !== 'live') return;
    const aliveT = this.characters.filter((c) => c.team === 'T' && c.alive).length;
    const aliveCT = this.characters.filter((c) => c.team === 'CT' && c.alive).length;
    if (aliveT === 0) this.endRound('CT', 'Atacantes eliminados');
    else if (aliveCT === 0) this.endRound('T', 'Defensores eliminados');
  }

  onFootstep(ch, loud) {
    const isPlayer = ch === this.player;
    this.audio.footstep(isPlayer ? null : ch.position, loud * (isPlayer ? 0.6 : 1));
    if (loud >= 1) for (const b of this.bots) if (b !== ch && b.alive && b.position.distanceTo(ch.position) < 9) b.brain.hear(ch, 0.25);
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

    // round state machine
    if (this.roundState === 'freeze') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) { this.roundState = 'live'; this.hud.message('¡Adelante!', '', 1.2); }
    } else if (this.roundState === 'live') {
      this.roundTimeLeft -= dt;
      if (this.roundTimeLeft <= 0) { this.roundTimeLeft = 0; this.endRound('CT', 'Se agotó el tiempo'); }
    } else if (this.roundState === 'ended') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.startRound();
    }

    // ----- player input
    const { dx, dy } = input.consumeMouse();
    const sens = this.settings.sensitivity * 0.0022;
    if (p.alive) {
      p.yaw -= dx * sens;
      p.pitch = THREE.MathUtils.clamp(p.pitch - dy * sens, -89 * DEG, 89 * DEG);
    } else {
      this.deathCamYaw -= dx * sens;
      this.deathCamPitch = THREE.MathUtils.clamp(this.deathCamPitch - dy * sens, -89 * DEG, 89 * DEG);
    }
    const frozen = this.roundState === 'freeze';
    const wish = {
      forward: (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0),
      right: (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0),
      jump: input.down('Space'), crouch: input.down('ControlLeft') || input.down('KeyC'),
      walk: input.down('ShiftLeft'),
    };
    if (frozen) { wish.forward = 0; wish.right = 0; wish.jump = false; }
    if (input.wasPressed('Digit1')) p.selectSlot(1);
    if (input.wasPressed('Digit2')) p.selectSlot(2);
    if (input.wasPressed('Digit3')) p.selectSlot(3);
    if (input.wheel !== 0) p.cycleWeapon(input.wheel > 0 ? 1 : -1);
    if (input.wasPressed('KeyR') && p.alive && p.weapon?.startReload(this.time)) this.audio.reload();
    if (input.wasPressed('Digit1') || input.wasPressed('Digit2') || input.wasPressed('Digit3') || input.wheel !== 0) this.audio.weaponSwitch();
    this.hud.setScoreboard(input.down('Tab'));
    p.updateMovement(dt, wish);
    this.fireWeapon(p, input.button(0) && p.alive && !frozen);

    // recoil recovery
    const rec = p.weapon ? p.weapon.def.recoil.recover : 8;
    const k = Math.exp(-rec * dt);
    this.punchPitch *= k; this.punchYaw *= k;

    // ----- bots
    for (const b of this.bots) {
      const w = b.brain.update(dt);
      b.updateMovement(dt, frozen ? { forward: 0, right: 0 } : w);
      if (b.model) b.model.setWeapon(b.weapon?.key || 'rifle');
    }
    for (const c of this.characters) {
      for (const w of c.weapons) w.update(this.time, dt);
      if (c.model) c.model.update(dt, c);
    }
    // bot reload sounds (approximate: when reloading starts)
    for (const b of this.bots) {
      const w = b.weapon;
      if (w && w.reloading && !b._reloadSfx) { b._reloadSfx = true; this.audio.reload(b.position); }
      if (w && !w.reloading) b._reloadSfx = false;
    }

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
    if (p.alive) {
      p.getEyePosition(this.camera.position);
      // subtle head bob
      if (p.onGround && p.speedRatio > 0.05) {
        this._bobT = (this._bobT || 0) + dt * 9 * (0.6 + p.speedRatio);
        this.camera.position.y += Math.abs(Math.sin(this._bobT)) * 0.018 * p.speedRatio;
      }
      this.camera.rotation.set(0, 0, 0, 'YXZ');
      this.camera.rotation.y = p.yaw + this.punchYaw;
      this.camera.rotation.x = p.pitch + this.punchPitch;
      this.camera.rotation.z = -this.punchYaw * 0.3;
    } else {
      // death cam: hover above the body
      this.camera.position.set(p.position.x, p.position.y + 0.9, p.position.z);
      this.camera.rotation.set(0, 0, 0, 'YXZ');
      this.camera.rotation.y = this.deathCamYaw;
      this.camera.rotation.x = this.deathCamPitch;
    }
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);

    // ----- view model
    if (p.alive && p.weapon) {
      this.viewModel.setWeapon(p.weapon.key);
      const w = p.weapon;
      const reloadProgress = w.reloading ? 1 - (w.reloadEnd - this.time) / w.def.reload : -1;
      const drawProgress = THREE.MathUtils.clamp(1 - (w.drawEnd - this.time) / w.def.swapTime, 0, 1);
      this.viewModel.update(dt, { dx, dy, speedRatio: p.speedRatio, onGround: p.onGround, crouchT: p.crouchT, reloadProgress, drawProgress, vy: p.velocity.y });
      this.viewModel.visible = true;
    } else this.viewModel.visible = false;

    this.effects.update(dt);
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
