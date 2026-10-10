export class Input {
  mx = 0;
  my = 0;
  lmb = false;
  rmb = false;
  lmbPressed = false;
  rmbPressed = false;
  shift = false;
  alt = false;
  ctrl = false;
  wheel = 0;
  keys = new Set<string>();
  pressed = new Set<string>();
  /** true while the pointer is over an interactive UI element */
  overUI = false;
  /** set once the pointer went down on the world (not the UI) */
  worldDown = false;
  worldRDown = false;
  /** the touch stick's push on screen (x right, y up, length up to 1); null when let go */
  stick: { x: number; y: number } | null = null;
  /** touch skill buttons held, by bind slot (0 left, 1 right, 2–5 Q W E R), and those pressed this frame */
  touchHeld = new Set<number>();
  touchPressed = new Set<number>();
  private onFirstGesture: (() => void) | null;

  constructor(world: HTMLElement, onFirstGesture: () => void) {
    this.onFirstGesture = onFirstGesture;
    const gesture = () => {
      if (this.onFirstGesture) {
        this.onFirstGesture();
      }
    };
    window.addEventListener('pointermove', (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
      const t = e.target as HTMLElement;
      this.overUI = t !== world && !!t.closest?.('.ui-block');
    });
    world.addEventListener('pointerdown', (e) => {
      gesture();
      this.mx = e.clientX;
      this.my = e.clientY;
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
        this.worldDown = true;
      } else if (e.button === 2) {
        this.rmb = true;
        this.rmbPressed = true;
        this.worldRDown = true;
      }
    });
    window.addEventListener('pointerdown', gesture, { capture: true });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) {
        this.lmb = false;
        this.worldDown = false;
      } else if (e.button === 2) {
        this.rmb = false;
        this.worldRDown = false;
      }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => {
      this.lmb = this.rmb = false;
      this.worldDown = this.worldRDown = false;
      this.keys.clear();
      this.shift = this.alt = this.ctrl = false;
    });
    window.addEventListener('keydown', (e) => {
      gesture();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.shift = e.shiftKey;
      this.alt = e.altKey;
      this.ctrl = e.ctrlKey || e.metaKey;
      if (k === 'Alt' || k === 'Tab' || (k >= '1' && k <= '4') || k === 'F1') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
      this.shift = e.shiftKey;
      this.alt = e.altKey;
      this.ctrl = e.ctrlKey || e.metaKey;
    });
    world.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** call at end of each frame */
  endFrame() {
    this.lmbPressed = false;
    this.rmbPressed = false;
    this.pressed.clear();
    this.touchPressed.clear();
    this.wheel = 0;
  }
}
