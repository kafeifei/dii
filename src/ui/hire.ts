// Kashya's hirelings (M2a's M line, docs/M2A-STEP0.md 2.12): her list of Rogue Scouts on offer, their
// levels, prices and what they can do (src/game/d2/hireling.ts hireOffer), hiring one, and handing the
// last one's gear back to the hero first. Not made yet: the panel says so.
import { addClose, h, type UIContext } from './common';

/** the hire panel (UI.openPanel('hire'), from her menu's 雇佣) */
export function renderHire(ui: UIContext, L: HTMLElement) {
  L.innerHTML = '';
  L.appendChild(h('h2', '', '雇 佣'));
  addClose(ui, L, 'left');
  L.appendChild(h('div', 'pending-note', '还没做'));
}
