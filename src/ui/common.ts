import type { Sfx } from '../audio/sfx';
import { SKILL_BY_ID } from '../data/skills';
import type { Game } from '../game/game';
import { CHARGE_PREFIX, type Player } from '../game/player';
import type { Item } from '../items/item';
import type { SkillPicker } from './hud';
import type { Tooltip } from './tooltip';
import type { TouchControls } from './touch';

export type LeftPanel = 'char' | 'stash' | 'shop' | 'waypoint' | 'cube' | 'quests' | null;
export type RightPanel = 'inv' | 'skills' | null;

/**
 * What the HUD and the panels share, kept by the UI that builds them (src/ui/ui.ts): the panels
 * open, the item on the cursor, and the flag that has them drawn again.
 */
export interface UIContext {
  readonly game: Game;
  readonly sfx: Sfx;
  /** phone controls, on touch screens */
  readonly touch: TouchControls | null;
  readonly tooltip: Tooltip;
  readonly picker: SkillPicker;
  cursorItem: Item | null;
  left: LeftPanel;
  right: RightPanel;
  /** the stash's page shown: 0 the hero's own, 1… the shared ones (src/items/stash.ts); kept while playing */
  stashPage: number;
  /** the panels, the belt and the skill slots are drawn again on the next frame */
  dirty: boolean;
  /** a quest moved on since the quest log was last opened: its button says so */
  questNews: boolean;
  /** the items on show by uid, for their tooltips (refilled on every redraw) */
  readonly itemByUid: Map<string, Item>;
  message(text: string, color?: string, dur?: number): void;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export const SLOT_KEYS = ['左键', '右键', 'Q', 'W', 'E', 'R'];

/** the skill a skill bar entry casts (`chg:<id>` casts <id> from charges) */
export function bindSkill(id: string): string {
  return id.startsWith(CHARGE_PREFIX) ? id.slice(CHARGE_PREFIX.length) : id;
}

export function bindName(id: string): string {
  if (id === 'attack') return '攻击';
  const name = SKILL_BY_ID[bindSkill(id)]?.name ?? id;
  return id.startsWith(CHARGE_PREFIX) ? `${name}（充能）` : name;
}

export function bindUsable(p: Player, id: string): boolean {
  if (id === 'attack') return true;
  if (id.startsWith(CHARGE_PREFIX)) return !!p.chargeFor(bindSkill(id));
  return p.skillLevel(id) > 0;
}

/** the ✕ in a side panel's corner */
export function addClose(ui: UIContext, el: HTMLElement, side: 'left' | 'right') {
  const close = h('button', 'close', '✕');
  close.onclick = () => {
    if (side === 'left') ui.left = null;
    else ui.right = null;
    ui.sfx.play('ui.close');
    ui.dirty = true;
  };
  el.appendChild(close);
}
