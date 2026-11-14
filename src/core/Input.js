/**
 * Keyboard / mouse input with pointer lock.
 * Keys are tracked by `event.code` so layout doesn't matter.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // pressed this frame
    this.released = new Set();
    this.buttons = new Set();
    this.buttonsPressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.wantLock = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Tab', 'Space', 'KeyR'].includes(e.code) || e.code.startsWith('Digit')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) { this.requestLock(); return; }
      this.buttons.add(e.button);
      this.buttonsPressed.add(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.buttons.delete(e.button); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch {
      this.canvas.requestPointerLock();
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }
  button(b) { return this.buttons.has(b); }
  buttonPressed(b) { return this.buttonsPressed.has(b); }

  consumeMouse() {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0; this.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.buttonsPressed.clear();
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
