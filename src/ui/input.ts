export type InputMethod = 'keyboard' | 'mouse' | 'touch';

const KEYMAP: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Keyboard (KeyboardEvent.code), hold-left-mouse and a floating touch joystick, all active at once.
 * Produces a screen-space move vector (x right, y down) with magnitude 0..1.
 */
export class Input {
  private readonly keys = new Set<string>();
  mouseHeld = false;
  mouseX = 0;
  mouseY = 0;
  private mouseId = -1;
  private joyId = -1;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private joyX = 0;
  private joyY = 0;
  lastMethod: InputMethod;
  enabled = true;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private methodListeners: Array<(m: InputMethod) => void> = [];
  /** Called on Space / tap for skill moments (M2). */
  onAction: (() => void) | null = null;

  constructor(
    layer: HTMLElement,
    initial: InputMethod,
  ) {
    this.lastMethod = initial;
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    layer.appendChild(this.base);

    window.addEventListener('keydown', this.onKeyDown, { capture: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
    layer.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    // first pointer anywhere decides the hint (touch on a laptop, mouse on a tablet…)
    window.addEventListener('pointerdown', (e) => this.setMethod(e.pointerType === 'mouse' ? 'mouse' : 'touch'), { capture: true, passive: true });
  }

  onMethodChange(fn: (m: InputMethod) => void): void {
    this.methodListeners.push(fn);
  }

  private setMethod(m: InputMethod): void {
    if (m === this.lastMethod) return;
    this.lastMethod = m;
    for (const fn of this.methodListeners) fn(m);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) this.onAction?.();
    if (!(e.code in KEYMAP)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.keys.add(e.code);
    this.setMethod('keyboard');
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    this.keys.delete(e.code);
  };

  readonly clear = (): void => {
    this.keys.clear();
    this.mouseHeld = false;
    this.mouseId = -1;
    this.endJoy();
  };

  private joyRadius(): number {
    const m = Math.min(window.innerWidth, window.innerHeight);
    return Math.max(42, Math.min(72, m * 0.11));
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      this.mouseHeld = true;
      this.mouseId = e.pointerId;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.setMethod('mouse');
      this.onAction?.();
      return;
    }
    // touch / pen: the first finger drives the joystick, extra fingers are ignored here
    this.onAction?.();
    if (this.joyId !== -1) return;
    this.joyId = e.pointerId;
    this.joyBaseX = this.joyX = e.clientX;
    this.joyBaseY = this.joyY = e.clientY;
    this.setMethod('touch');
    this.showJoy();
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId === this.mouseId) {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse') {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    }
    if (e.pointerId !== this.joyId) return;
    this.joyX = e.clientX;
    this.joyY = e.clientY;
    const R = this.joyRadius();
    const dx = this.joyX - this.joyBaseX;
    const dy = this.joyY - this.joyBaseY;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      // base follows the thumb
      this.joyBaseX = this.joyX - (dx / d) * R;
      this.joyBaseY = this.joyY - (dy / d) * R;
    }
    this.showJoy();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.mouseId) {
      this.mouseHeld = false;
      this.mouseId = -1;
    }
    if (e.pointerId === this.joyId) this.endJoy();
  };

  private endJoy(): void {
    this.joyId = -1;
    this.base.classList.remove('on');
  }

  private showJoy(): void {
    const R = this.joyRadius();
    this.base.style.width = this.base.style.height = `${R * 2}px`;
    this.base.style.transform = `translate3d(${this.joyBaseX - R}px, ${this.joyBaseY - R}px, 0)`;
    const kx = this.joyX - this.joyBaseX;
    const ky = this.joyY - this.joyBaseY;
    this.knob.style.transform = `translate3d(${kx}px, ${ky}px, 0) translate(-50%, -50%)`;
    this.base.classList.add('on');
  }

  get joyActive(): boolean {
    return this.joyId !== -1;
  }

  /** Screen-space movement from keys + joystick (mouse is resolved in world space by the view). */
  screenMove(out: { x: number; y: number }): void {
    out.x = 0;
    out.y = 0;
    if (!this.enabled) return;
    for (const k of this.keys) {
      const v = KEYMAP[k];
      if (!v) continue;
      out.x += v[0];
      out.y += v[1];
    }
    const km = Math.hypot(out.x, out.y);
    if (km > 0) {
      out.x /= km;
      out.y /= km;
      return;
    }
    if (this.joyId !== -1) {
      const R = this.joyRadius();
      const dx = this.joyX - this.joyBaseX;
      const dy = this.joyY - this.joyBaseY;
      const d = Math.hypot(dx, dy);
      const dead = 8;
      if (d > dead) {
        const mag = Math.min(1, (d - dead) / (R - dead));
        // analog, with a floor so small drags still walk
        const m = 0.35 + 0.65 * mag;
        out.x = (dx / d) * m;
        out.y = (dy / d) * m;
      }
    }
  }
}
