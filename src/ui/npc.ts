import type { WorldObject } from '../game/objects';
import type { Topic } from '../game/quests/quest';
import type { Renderer } from '../render/renderer';
import { escapeHtml, h, type UIContext } from './common';

/**
 * Seconds a line takes to scroll by: what its voice would take, about five Chinese characters a
 * second (the pace the voice brief assumes), as Diablo II scrolls a line for as long as it is
 * spoken. D2 has the recording's length; there is none yet.
 */
const SECONDS_PER_CHAR = 0.2;
const MIN_SECONDS = 4;
/** held at the end before the menu comes back */
const HOLD = 1.6;
/** walked this far from them, the townsperson's menu or line is left (as the shop shuts, ui.ts) */
const REACH = 4;

/**
 * Speaking to a townsperson as in Diablo II: their menu over them (交谈, their trade, 取消), and
 * what they say, scrolling up through a box as D2's lines do, which a click on it, Esc or 跳过
 * cuts short. A line a quest has them say at once plays before the menu (Game.talkTo); a line
 * heard, or cut short, tells the game (Game.npcSpoke), and leaving them does too (Game.npcLeft).
 */
export class NpcPanel {
  readonly el: HTMLElement;
  private menuEl: HTMLElement;
  private dlgEl: HTMLElement;
  private nameEl: HTMLElement;
  private viewEl: HTMLElement;
  private textEl: HTMLElement;
  /** the townsperson spoken to; null while shut */
  obj: WorldObject | null = null;
  /** the line being said */
  private topic: Topic | null = null;
  private t = 0;
  private dur = 0;
  /** where the line's rows start and end up (px), measured once a line, not each frame */
  private from = 0;
  private to = 0;

  constructor(
    private ui: UIContext & { openPanel(kind: 'shop'): void },
    private renderer: Renderer,
  ) {
    this.el = h('div');
    this.el.id = 'npc';
    this.menuEl = h('div', 'npc-menu ui-block');
    this.dlgEl = h('div', 'dialogue ui-block');
    this.nameEl = h('div', 'dlg-name');
    this.viewEl = h('div', 'dlg-view');
    this.textEl = h('div', 'dlg-text');
    this.viewEl.appendChild(this.textEl);
    const skip = h('button', 'btn dlg-skip', '跳过');
    skip.onclick = (e) => {
      e.stopPropagation();
      this.skip();
    };
    this.dlgEl.append(this.nameEl, this.viewEl, skip);
    // a click anywhere on the line cuts it short, as in D2
    this.dlgEl.addEventListener('click', () => this.skip());
    this.el.append(this.menuEl, this.dlgEl);
    window.addEventListener('resize', () => {
      if (this.topic) this.measure();
    });
  }

  get isOpen() {
    return !!this.obj;
  }

  /** a line is scrolling */
  get talking() {
    return !!this.topic;
  }

  /** `obj` spoken to: `opening` said first, if a quest has one, then the menu */
  open(obj: WorldObject, opening: Topic | null) {
    if (this.obj && this.obj !== obj) this.close();
    // spoken to again while a line of theirs scrolls: the click cuts it short, as one on the box does
    if (this.obj === obj && this.topic) {
      this.finish();
      return;
    }
    this.obj = obj;
    this.ui.sfx.play('ui.open');
    if (opening) this.say(opening);
    else this.showMenu();
  }

  /** the menu: talk, their trade (the merchant also repairs, as Charsi does), cancel */
  private showMenu() {
    const obj = this.obj;
    if (!obj) return;
    this.dlgEl.classList.remove('open');
    const m = this.menuEl;
    m.innerHTML = '';
    m.appendChild(h('div', 'npc-name', escapeHtml(obj.npc ?? obj.name)));
    const item = (label: string, act: () => void, cls = '') => {
      const b = h('div', `npc-opt${cls}`, label);
      b.onclick = (e) => {
        e.stopPropagation();
        this.ui.sfx.play('ui.click');
        act();
      };
      m.appendChild(b);
    };
    item('交谈', () => {
      const t = this.ui.game.npcTalk(obj);
      if (t) this.say(t);
    });
    if (obj.kind === 'vendor') {
      item('交易／修理', () => {
        this.close(true);
        this.ui.openPanel('shop');
      });
    }
    item('取消', () => this.close(), ' cancel');
    m.classList.add('open');
    this.place();
  }

  /** `t` scrolls up through the box */
  private say(t: Topic) {
    this.topic = t;
    this.menuEl.classList.remove('open');
    this.nameEl.textContent = this.obj?.npc ?? '';
    this.textEl.textContent = t.text;
    this.dlgEl.classList.add('open');
    this.t = 0;
    this.dur = Math.max(MIN_SECONDS, [...t.text].length * SECONDS_PER_CHAR);
    this.measure();
    this.scroll();
  }

  /** the line's first row starts at the box's bottom, and it scrolls until its last is in view */
  private measure() {
    const view = this.viewEl.clientHeight;
    const text = this.textEl.offsetHeight;
    const row = parseFloat(getComputedStyle(this.textEl).lineHeight) || 24;
    this.from = view - row;
    this.to = Math.min(0, view - text);
  }

  /** the line where it has scrolled to */
  private scroll() {
    const k = Math.min(1, this.t / this.dur);
    this.textEl.style.transform = `translateY(${Math.round(this.from + (this.to - this.from) * k)}px)`;
  }

  /** the line cut short (a click, Esc, 跳过): it counts as heard, as D2's does */
  skip() {
    if (this.topic) this.finish();
  }

  /** the line done: the game hears of it (a quest given, a reward handed over), and the menu comes back */
  private finish() {
    const t = this.topic;
    this.topic = null;
    this.dlgEl.classList.remove('open');
    if (t) this.ui.game.npcSpoke(t);
    if (this.obj) this.showMenu();
  }

  /** the townsperson left (取消, Esc, walking off, their trade opened): the game hears of it; a line still going counts as heard */
  close(quiet = false) {
    const obj = this.obj;
    if (!obj) return;
    if (this.topic) this.finish();
    this.obj = null;
    this.menuEl.classList.remove('open');
    this.dlgEl.classList.remove('open');
    if (!quiet) this.ui.sfx.play('ui.close');
    this.ui.game.npcLeft(obj);
    this.ui.dirty = true;
  }

  /** the menu over the townsperson's head, kept on screen */
  private place() {
    const obj = this.obj;
    if (!obj || !this.menuEl.classList.contains('open')) return;
    const s = this.renderer.projectP(obj.pos, 2.6);
    const w = this.menuEl.offsetWidth;
    const hgt = this.menuEl.offsetHeight;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, s.x - w / 2));
    const y = Math.max(8, Math.min(window.innerHeight - hgt - 90, s.y - hgt));
    this.menuEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** every frame: the line scrolls on; walked away, dead or elsewhere, the townsperson is left */
  update(dt: number) {
    const obj = this.obj;
    const g = this.ui.game;
    // the pause menu over it holds the line where it is
    if (!obj || g.paused) return;
    const p = g.player;
    if (p.dead || !g.level.objects.includes(obj) || Math.hypot(obj.pos.x - p.pos.x, obj.pos.z - p.pos.z) > REACH + obj.radius) {
      this.close();
      return;
    }
    if (this.topic) {
      this.t += dt;
      this.scroll();
      if (this.t >= this.dur + HOLD) this.finish();
    } else this.place();
  }
}

/**
 * The yellow mark that floats over a townsperson with quest news (D2's "!" over an NPC whose quest
 * ActiveFilter says so: Game.quests.hasNews)
 */
export class NpcMarks {
  private els = new Map<WorldObject, HTMLElement>();

  constructor(
    private ui: UIContext,
    private renderer: Renderer,
    private layer: HTMLElement,
  ) {}

  /** a new level: none of its people are marked yet */
  clear() {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }

  update() {
    const g = this.ui.game;
    const p = g.player;
    const seen = new Set<WorldObject>();
    for (const o of g.level.objects) {
      if (!o.npcId || !g.quests.hasNews(o.npcId) || Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 30) continue;
      seen.add(o);
      let el = this.els.get(o);
      if (!el) {
        el = h('div', 'npc-mark', '!');
        this.layer.appendChild(el);
        this.els.set(o, el);
      }
      const s = this.renderer.projectP(o.pos, 2.45);
      el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
    }
    for (const [o, el] of this.els) {
      if (seen.has(o)) continue;
      el.remove();
      this.els.delete(o);
    }
  }
}
