// Keyboard / mouse (pointer lock) / gamepad input with edge detection.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set(); this.pressed = new Set(); this.released = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, pressed: 0, released: 0, wheel: 0 };
    this.locked = false; this.enabled = true;
    this.virtual = null; // scripted input for automated play/recording
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = 0; });
    el.addEventListener('mousedown', (e) => {
      if (!this.locked && this.wantLock) { el.requestPointerLock?.(); }
      const bit = 1 << e.button; this.mouse.buttons |= bit; this.mouse.pressed |= bit;
    });
    addEventListener('mouseup', (e) => { const bit = 1 << e.button; this.mouse.buttons &= ~bit; this.mouse.released |= bit; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
    this.wantLock = true;
  }
  down(code) { return this.virtual ? this.virtual.keys.has(code) : this.keys.has(code); }
  hit(code) { return this.virtual ? this.virtual.pressed.has(code) : this.pressed.has(code); }
  btn(i) { return this.virtual ? !!(this.virtual.buttons & (1 << i)) : !!(this.mouse.buttons & (1 << i)); }
  btnHit(i) { return this.virtual ? !!(this.virtual.pressed2 & (1 << i)) : !!(this.mouse.pressed & (1 << i)); }
  get look() {
    if (this.virtual) return { dx: this.virtual.dx || 0, dy: this.virtual.dy || 0 };
    const gp = this.pad();
    let dx = this.mouse.dx, dy = this.mouse.dy;
    if (gp) { dx += dead(gp.axes[2]) * 14; dy += dead(gp.axes[3]) * 10; }
    return { dx, dy };
  }
  // movement axes in [-1,1]
  get move() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const gp = this.pad();
    if (gp && !this.virtual) { x += dead(gp.axes[0]); y -= dead(gp.axes[1]); }
    if (this.virtual?.move) { x = this.virtual.move.x; y = this.virtual.move.y; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  pad() { const ps = navigator.getGamepads?.(); return ps && ps[0] && ps[0].connected ? ps[0] : null; }
  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.pressed = 0; this.mouse.released = 0; this.mouse.wheel = 0;
    if (this.virtual) { this.virtual.pressed = new Set(); this.virtual.pressed2 = 0; }
  }
}
const dead = (v) => (Math.abs(v || 0) < 0.15 ? 0 : v);
