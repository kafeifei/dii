import type { Input } from '../core/input';

/** a phone or tablet (coarse pointer); `?touch` forces the touch layout on a desktop for testing */
export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
}

/** how far the stick's knob travels, in CSS pixels */
const STICK_R = 56;
/** the stick starts on a touch in this share of the screen, from the left */
const STICK_ZONE = 0.45;
const LONG_PRESS_MS = 450;

export interface TouchHooks {
  /** an item is being carried: taps in the panels then place or socket it straight away */
  carrying(): boolean;
  hideTooltip(): void;
  /** choose the skill for a bind slot (the 换 button then a skill button, or a tap on an empty one) */
  pickSkill(slot: number, anchor: HTMLElement): void;
}

interface ButtonPress {
  slot: number;
  el: HTMLElement;
  /** a tap picks this slot's skill instead of using it (empty slot, or the 换 button was on) */
  pick: boolean;
}

interface PanelPress {
  id: number;
  holder: HTMLElement;
  key: string;
  x: number;
  y: number;
  timer: number;
  long: boolean;
  /** its tooltip is already up: a tap now acts */
  second: boolean;
}

function div(cls: string, html = ''): HTMLDivElement {
  const e = document.createElement('div');
  e.className = cls;
  e.innerHTML = html;
  return e;
}

/**
 * Phone controls, laid over the desktop ones:
 * - a floating stick: a touch on open ground in the left part of the screen walks; a quick tap
 *   there is a tap on the world instead (pick up, talk, attack what was tapped)
 * - the skill bar becomes round buttons by the right thumb; holding one uses its skill on the
 *   nearest enemy (the game aims, see Game.touchSkill); 换 then a button picks that button's skill
 * - in the panels, a first tap shows an item's or skill's tooltip and a second acts (take the item,
 *   buy it, learn the skill); a long press is the right click (equip, use, buy)
 * - fullscreen where the browser allows it, and a hint to turn the phone sideways
 */
export class TouchControls {
  private stickId = -1;
  private origin = { x: 0, y: 0 };
  private stickAt = 0;
  private stickTravel = 0;
  private base: HTMLElement;
  private knob: HTMLElement;
  private presses = new Map<number, ButtonPress>();
  private panelPress: PanelPress | null = null;
  /** the item or skill whose tooltip a first tap showed */
  private selected: string | null = null;
  private swallowClick = false;
  /** the 换 button is on: the next skill button tapped gets a new skill */
  private editing = false;
  private editBtn: HTMLButtonElement;
  /** spans the screen inside the safe-area margins, to measure them */
  private probe: HTMLElement;
  private root: HTMLElement;

  constructor(
    private input: Input,
    private canvas: HTMLElement,
    private skillsEl: HTMLElement,
    root: HTMLElement,
    private hooks: TouchHooks,
  ) {
    document.body.classList.add('touch');
    this.base = div('stick-base');
    this.knob = div('stick-knob');
    this.base.appendChild(this.knob);
    root.appendChild(this.base);

    this.editBtn = document.createElement('button');
    this.editBtn.className = 'skill-edit ui-block';
    this.editBtn.textContent = '换';
    this.editBtn.title = '换技能：再点一个技能按钮';
    this.editBtn.onclick = () => this.setEditing(!this.editing);
    root.appendChild(this.editBtn);

    if (document.fullscreenEnabled) {
      const fs = document.createElement('button');
      fs.className = 'fs-btn ui-block';
      fs.title = '全屏';
      fs.textContent = '⛶';
      fs.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : this.enterFullscreen());
      root.appendChild(fs);
    }
    root.appendChild(div('rotate-hint', '<div class="phone"></div><div>把手机横过来玩</div>'));
    this.probe = div('safe-probe');
    this.probe.style.cssText = 'position:fixed;left:var(--sal);right:var(--sar);top:var(--sat);bottom:var(--sab);visibility:hidden;pointer-events:none';
    root.appendChild(this.probe);
    this.root = root;

    window.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.onMove(e), { capture: true });
    window.addEventListener('pointerup', (e) => this.onUp(e, false), { capture: true });
    window.addEventListener('pointercancel', (e) => this.onUp(e, true), { capture: true });
    window.addEventListener(
      'click',
      (e) => {
        if (!this.swallowClick || !e.isTrusted) return;
        this.swallowClick = false;
        e.stopImmediatePropagation();
        e.preventDefault();
      },
      { capture: true },
    );
    this.fitLayout();
    // iOS ignores user-scalable=no: a pinch across the stick and a button would zoom the page
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.fitLayout());
    window.visualViewport?.addEventListener('resize', () => this.fitLayout());
  }

  /** called when a game starts: on iPhone Safari, say once how to get rid of its bars */
  gameStarted() {
    const hint = this.iosHint();
    let seen = false;
    try {
      seen = localStorage.getItem('dii-ios-banner') === '1';
    } catch {
      // storage blocked: show it
    }
    if (!hint || seen || this.root.querySelector('.ios-banner')) return;
    const b = div('ios-banner ui-block', `<span>Safari 的地址栏会占掉一块屏幕。${hint.replace('想全屏玩：', '')}，就是全屏。</span>`);
    const ok = document.createElement('button');
    ok.textContent = '知道了';
    ok.onclick = () => {
      b.remove();
      try {
        localStorage.setItem('dii-ios-banner', '1');
      } catch {
        // storage blocked: it shows again next time
      }
    };
    b.appendChild(ok);
    this.root.appendChild(b);
  }

  /** fullscreen and landscape, where the browser allows it (not iPhone Safari: see iosHint) */
  enterFullscreen() {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {
        // refused (no user gesture, or the orientation can't be locked): play as it is
      });
  }

  /** iPhone Safari has no fullscreen for pages: a page opened from the home screen has no browser bar */
  iosHint(): string | null {
    const ios = /iPhone|iPod/.test(navigator.userAgent);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone && !document.fullscreenEnabled ? '想全屏玩：点 Safari 的分享按钮，选「添加到主屏幕」，再从主屏幕打开' : null;
  }

  private setEditing(on: boolean) {
    this.editing = on;
    this.editBtn.classList.toggle('on', on);
    this.skillsEl.classList.toggle('editing', on);
  }

  /**
   * Fit to the screen inside the safe-area margins: the side panels (404px wide) shrink so two fit
   * side by side, and the HUD shrinks with the height, so the minimap above and the skill buttons
   * below (336px together at full size) never meet. A phone on its side in Safari can be under 300px.
   */
  private fitLayout() {
    const r = this.probe.getBoundingClientRect();
    const w = r.width || window.innerWidth;
    const h = r.height || window.innerHeight;
    const pz = Math.min(1, (w / 2 - 6) / 404);
    const hs = Math.max(0.6, Math.min(1, (h - 30) / 336));
    document.documentElement.style.setProperty('--pz', pz.toFixed(3));
    document.documentElement.style.setProperty('--hs', hs.toFixed(3));
  }

  private onDown(e: PointerEvent) {
    // events this class makes itself pass straight through
    if (!e.isTrusted) return;
    // a click left over from a long press (which fires none) must not eat the next one
    this.swallowClick = false;
    const t = e.target as HTMLElement;

    // the stick
    if (t === this.canvas && this.stickId < 0 && e.clientX < window.innerWidth * STICK_ZONE) {
      e.stopImmediatePropagation();
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.stickAt = performance.now();
      this.stickTravel = 0;
      this.input.stick = { x: 0, y: 0 };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.knob.style.transform = '';
      this.base.classList.add('on');
      return;
    }

    // a skill button
    const slotEl = t.closest?.('.slot') as HTMLElement | null;
    if (slotEl && slotEl.parentElement === this.skillsEl) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.swallowClick = true;
      const slot = Array.prototype.indexOf.call(this.skillsEl.children, slotEl);
      const pick = this.editing || !slotEl.dataset.skill;
      slotEl.classList.add('pressed');
      this.hooks.hideTooltip();
      if (!pick) {
        this.input.touchHeld.add(slot);
        this.input.touchPressed.add(slot);
      }
      this.presses.set(e.pointerId, { slot, el: slotEl, pick });
      return;
    }

    // an item or a skill in a panel
    const holder = t.closest?.('.panel [data-uid], .panel [data-skill]') as HTMLElement | null;
    if (holder && !this.hooks.carrying()) {
      const key = holder.dataset.uid ? `i:${holder.dataset.uid}` : `s:${holder.dataset.skill}`;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.swallowClick = true;
      const press: PanelPress = { id: e.pointerId, holder, key, x: e.clientX, y: e.clientY, timer: 0, long: false, second: key === this.selected };
      if (holder.dataset.uid) {
        press.timer = window.setTimeout(() => {
          press.long = true;
          this.selected = null;
          this.hooks.hideTooltip();
          navigator.vibrate?.(12);
          this.forward(holder, 'pointerdown', 2, press.x, press.y);
        }, LONG_PRESS_MS);
      }
      this.panelPress = press;
      return;
    }
    if (this.selected) {
      this.selected = null;
      this.hooks.hideTooltip();
    }
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      e.stopImmediatePropagation();
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      this.stickTravel = Math.max(this.stickTravel, len);
      if (len > STICK_R) {
        // past the rim the stick follows the finger, so turning around is a short move
        this.origin.x = e.clientX - (dx / len) * STICK_R;
        this.origin.y = e.clientY - (dy / len) * STICK_R;
        this.base.style.left = `${this.origin.x}px`;
        this.base.style.top = `${this.origin.y}px`;
        dx = (dx / len) * STICK_R;
        dy = (dy / len) * STICK_R;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.stick = { x: dx / STICK_R, y: -dy / STICK_R };
      return;
    }
    // a finger on a skill button is no mouse hovering it: no tooltip over the fight
    if (this.presses.has(e.pointerId)) {
      e.stopImmediatePropagation();
      return;
    }
    const pp = this.panelPress;
    if (pp && e.pointerId === pp.id && Math.hypot(e.clientX - pp.x, e.clientY - pp.y) > 10) {
      // a drag: the panel scrolls, it was no tap
      clearTimeout(pp.timer);
      this.panelPress = null;
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    if (e.pointerId === this.stickId) {
      e.stopImmediatePropagation();
      this.stickId = -1;
      this.input.stick = null;
      this.base.classList.remove('on');
      // a quick tap where the stick starts is a tap on the world
      if (!cancelled && this.stickTravel < 12 && performance.now() - this.stickAt < 300) this.tapWorld(this.origin.x, this.origin.y);
      return;
    }
    const press = this.presses.get(e.pointerId);
    if (press) {
      e.stopImmediatePropagation();
      this.presses.delete(e.pointerId);
      this.input.touchHeld.delete(press.slot);
      press.el.classList.remove('pressed');
      if (press.pick && !cancelled) {
        this.setEditing(false);
        this.hooks.pickSkill(press.slot, press.el);
      }
      return;
    }
    const pp = this.panelPress;
    if (pp && e.pointerId === pp.id) {
      clearTimeout(pp.timer);
      this.panelPress = null;
      if (pp.long || cancelled) return;
      if (pp.second) {
        // second tap: act as a click would (take the item, buy it, learn the skill)
        this.selected = null;
        this.hooks.hideTooltip();
        this.forward(pp.holder, 'pointerdown', 0, pp.x, pp.y);
        this.forward(pp.holder, 'click', 0, pp.x, pp.y);
        // and bring a taken item to the finger
        this.forward(pp.holder, 'pointermove', 0, pp.x, pp.y);
      } else {
        // first tap: show its tooltip
        this.selected = pp.key;
        this.forward(pp.holder, 'pointermove', 0, pp.x, pp.y);
      }
    }
  }

  /** hand the game a click on the world at this point */
  private tapWorld(x: number, y: number) {
    this.forward(this.canvas, 'pointerdown', 0, x, y);
    setTimeout(() => this.forward(window, 'pointerup', 0, x, y), 60);
  }

  private forward(target: EventTarget, type: string, button: number, x: number, y: number) {
    const Ev = type === 'click' ? MouseEvent : PointerEvent;
    target.dispatchEvent(
      new Ev(type, { bubbles: true, cancelable: true, button, buttons: button === 2 ? 2 : 1, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true }),
    );
  }
}
