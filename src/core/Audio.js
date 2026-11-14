/**
 * Procedural sound engine (WebAudio). No external assets.
 * All sounds are synthesized: filtered noise bursts, tonal thumps, clicks.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.voices = 0;
    this.maxVoices = 24;
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    this.master.connect(comp).connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.listener = this.ctx.listener;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  setListener(pos, forward, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t); l.forwardY.setValueAtTime(forward.y, t); l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t); l.upY.setValueAtTime(up.y, t); l.upZ.setValueAtTime(up.z, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Creates output node chain; returns the node sounds should connect to. */
  _out(pos, refDist = 4, maxDist = 90) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.maxDistance = maxDist;
    p.rolloffFactor = 1.1;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  _voice(dur) {
    if (this.voices >= this.maxVoices) return false;
    this.voices++;
    setTimeout(() => { this.voices--; }, dur * 1000 + 50);
    return true;
  }

  _noiseBurst(out, { dur = 0.2, gain = 0.5, lp = 4000, hp = 100, q = 0.7, decay = 0.08, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = lp; lpf.Q.value = q;
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + Math.max(0.02, decay * 4));
    src.connect(hpf).connect(lpf).connect(g).connect(out);
    src.start(t0, Math.random() * 1.0);
    src.stop(t0 + dur + 0.05);
  }

  _thump(out, { f0 = 160, f1 = 40, dur = 0.12, gain = 0.6, delay = 0, type = 'sine' }) {
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  gunshot(kind, pos = null) {
    if (!this.ctx || !this._voice(0.4)) return;
    const out = this._out(pos, 6, 140);
    const far = pos ? 1 : 0;
    switch (kind) {
      case 'pistol':
        this._noiseBurst(out, { dur: 0.12, gain: 0.55, lp: 5500, hp: 300, decay: 0.035 });
        this._thump(out, { f0: 220, f1: 60, dur: 0.08, gain: 0.5 });
        break;
      case 'smg':
        this._noiseBurst(out, { dur: 0.1, gain: 0.5, lp: 6000, hp: 350, decay: 0.03 });
        this._thump(out, { f0: 260, f1: 70, dur: 0.06, gain: 0.4 });
        break;
      case 'sniper':
        this._noiseBurst(out, { dur: 0.35, gain: 0.9, lp: 3000, hp: 80, decay: 0.12 });
        this._thump(out, { f0: 140, f1: 30, dur: 0.25, gain: 0.9 });
        break;
      case 'shotgun':
        this._noiseBurst(out, { dur: 0.3, gain: 0.85, lp: 2600, hp: 90, decay: 0.1 });
        this._thump(out, { f0: 120, f1: 35, dur: 0.2, gain: 0.8 });
        break;
      case 'knife':
        this._noiseBurst(out, { dur: 0.08, gain: 0.25, lp: 7000, hp: 1500, decay: 0.02 });
        break;
      default: // rifle
        this._noiseBurst(out, { dur: 0.2, gain: 0.7, lp: 4200, hp: 200, decay: 0.06 });
        this._thump(out, { f0: 180, f1: 45, dur: 0.11, gain: 0.65 });
        if (far) this._noiseBurst(out, { dur: 0.3, gain: 0.15, lp: 1200, hp: 100, decay: 0.12, delay: 0.02 });
    }
  }

  impact(pos, material = 'concrete') {
    if (!this.ctx || !this._voice(0.15)) return;
    const out = this._out(pos, 3, 50);
    if (material === 'metal') {
      this._thump(out, { f0: 1800, f1: 900, dur: 0.07, gain: 0.18, type: 'triangle' });
      this._noiseBurst(out, { dur: 0.06, gain: 0.2, lp: 8000, hp: 2000, decay: 0.02 });
    } else if (material === 'wood') {
      this._noiseBurst(out, { dur: 0.08, gain: 0.3, lp: 2500, hp: 300, decay: 0.025 });
    } else {
      this._noiseBurst(out, { dur: 0.08, gain: 0.3, lp: 4000, hp: 600, decay: 0.02 });
    }
  }

  hitFlesh(pos) {
    if (!this.ctx || !this._voice(0.15)) return;
    const out = this._out(pos, 3, 50);
    this._noiseBurst(out, { dur: 0.1, gain: 0.35, lp: 900, hp: 120, decay: 0.03 });
    this._thump(out, { f0: 110, f1: 60, dur: 0.07, gain: 0.3 });
  }

  hitConfirm() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + 0.06);
  }

  footstep(pos, loud = 1) {
    if (!this.ctx || !this._voice(0.1)) return;
    const out = this._out(pos, 2, 30);
    this._noiseBurst(out, { dur: 0.07, gain: 0.12 * loud, lp: 700 + Math.random() * 300, hp: 80, decay: 0.02 });
  }

  reload(pos = null) {
    if (!this.ctx) return;
    const out = this._out(pos, 2, 20);
    this._noiseBurst(out, { dur: 0.05, gain: 0.25, lp: 5000, hp: 1200, decay: 0.012 });
    this._noiseBurst(out, { dur: 0.05, gain: 0.2, lp: 3000, hp: 800, decay: 0.015, delay: 0.55 });
    this._thump(out, { f0: 900, f1: 400, dur: 0.05, gain: 0.12, delay: 1.1, type: 'triangle' });
  }

  dryFire() {
    if (!this.ctx) return;
    this._thump(this.master, { f0: 1500, f1: 700, dur: 0.04, gain: 0.1, type: 'triangle' });
  }

  weaponSwitch() {
    if (!this.ctx) return;
    this._noiseBurst(this.master, { dur: 0.05, gain: 0.15, lp: 4000, hp: 1000, decay: 0.012 });
  }

  ui(kind) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const notes = kind === 'win' ? [523, 659, 784] : kind === 'lose' ? [392, 330, 262] : [440, 660];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0 + i * 0.12);
      g.gain.linearRampToValueAtTime(0.12, t0 + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.12 + 0.3);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.12); o.stop(t0 + i * 0.12 + 0.32);
    });
  }
}
