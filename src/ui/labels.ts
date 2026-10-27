import { ITEM_BASES } from '../data/items';
import { GOLD } from '../items/gen';
import { displayName, itemColor, tooltip } from '../items/item';
import type { Renderer } from '../render/renderer';
import { h, type UIContext } from './common';

/** the names of the items and gold lying near the player; a click on one picks it up */
export class GroundLabels {
  /** the ground item whose label is under the pointer */
  hovered: number | null = null;
  private els = new Map<number, { el: HTMLDivElement; w: number; h: number }>();

  constructor(
    private ui: UIContext,
    private renderer: Renderer,
    private layer: HTMLElement,
  ) {}

  /** a new level: none of these lie on it */
  clear() {
    for (const l of this.els.values()) l.el.remove();
    this.els.clear();
    this.hovered = null;
  }

  update() {
    const ui = this.ui;
    const g = ui.game;
    const r = this.renderer;
    const p = g.player;
    const seen = new Set<number>();
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const items = g.level.ground
      .filter((gi) => Math.hypot(gi.pos.x - p.pos.x, gi.pos.z - p.pos.z) < 18 && gi.age > 0.35)
      .map((gi) => ({ gi, s: r.projectP(gi.pos, 0.2) }))
      .sort((a, b) => b.s.y - a.s.y);
    for (const { gi, s } of items) {
      seen.add(gi.id);
      let rec = this.els.get(gi.id);
      if (!rec) {
        const el = h('div', 'glabel');
        if (gi.item) {
          el.textContent = displayName(gi.item);
          el.style.color = itemColor(gi.item);
        } else {
          el.textContent = `${gi.gold} ${ITEM_BASES[GOLD].name}`;
          el.style.color = '#e8e0c0';
        }
        el.addEventListener('pointerenter', () => (this.hovered = gi.id));
        el.addEventListener('pointerleave', () => {
          if (this.hovered === gi.id) this.hovered = null;
        });
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (e.button !== 0 || ui.cursorItem) return;
          ui.sfx.ensure();
          g.player.intent = { kind: 'pickup', ground: gi };
        });
        el.addEventListener('pointermove', (e) => {
          if (gi.item) {
            const pl = g.player;
            ui.tooltip.show(tooltip(gi.item, { level: pl.level, str: pl.stats.str, dex: pl.stats.dex, cls: pl.cls, worn: Object.values(pl.equipment).filter((x) => !!x) }), e.clientX, e.clientY);
          }
        });
        el.addEventListener('pointerleave', () => ui.tooltip.hide());
        this.layer.appendChild(el);
        rec = { el, w: el.offsetWidth, h: el.offsetHeight };
        this.els.set(gi.id, rec);
      }
      let x = s.x - rec.w / 2;
      let y = s.y - rec.h - 6;
      for (let iter = 0; iter < 20; iter++) {
        const hit = placed.find((q) => x < q.x + q.w && x + rec!.w > q.x && y < q.y + q.h && y + rec!.h > q.y);
        if (!hit) break;
        y = hit.y - rec.h - 1;
      }
      placed.push({ x, y, w: rec.w, h: rec.h });
      rec.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    for (const [id, rec] of this.els) {
      if (!seen.has(id)) {
        rec.el.remove();
        this.els.delete(id);
        if (this.hovered === id) this.hovered = null;
      }
    }
  }
}
