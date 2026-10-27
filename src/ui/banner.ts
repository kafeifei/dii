import type { AreaDef } from '../world/areas';
import { h } from './common';

/** seconds since walking out of an area within which walking back in isn't a new way in */
const REENTRY = 4;

/**
 * The name of the area the hero comes into, large at the top of the screen and fading, as Diablo II
 * says it on the way in (levels.json LevelEntry: "Entering The Blood Moor"). Once each way in:
 * stepping back and forth over a seam into an area left a moment ago says nothing again, but a
 * jump there (a waypoint, a portal, a respawn) or coming onto a new map always does.
 */
export class AreaBanner {
  readonly el: HTMLElement;
  private nameEl: HTMLElement;
  /** when the hero last walked out of each area (performance.now(), ms) */
  private left = new Map<number, number>();
  /** the next area is said whatever: the hero jumped, or came onto another map */
  private jumped = true;
  /** how many times a name has been shown (the tools count them) */
  shown = 0;

  constructor(root: HTMLElement) {
    this.el = h('div');
    this.el.id = 'area-banner';
    this.nameEl = h('div', 'ab-name');
    this.el.append(h('div', 'ab-sub', '进入'), this.nameEl);
    root.appendChild(this.el);
  }

  /** the hero is arriving by a jump or on another map: whatever area that is (Game says it at once), it is said */
  jump() {
    this.jumped = true;
  }

  /** every frame: a jump that stayed in its area is over */
  update() {
    this.jumped = false;
  }

  /** Game's areaChanged */
  areaChanged(area: AreaDef, prev: AreaDef | null) {
    const now = performance.now();
    if (prev) this.left.set(prev.id, now);
    const back = now - (this.left.get(area.id) ?? -Infinity) < REENTRY * 1000;
    const say = this.jumped || !back;
    this.jumped = false;
    if (!say) return;
    this.nameEl.textContent = area.name;
    this.el.dataset.area = area.key;
    this.shown++;
    this.el.dataset.shown = String(this.shown);
    // the fade runs again from the start, over one still going
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
  }
}
