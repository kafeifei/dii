// The hireling's own panel (M2a's M line, docs/M2A-STEP0.md 2.12): her name, level, experience, life,
// numbers and skills, and her helm, armour and bow to put on and take off. Not made yet: the panel says so.
import { addClose, h, type UIContext } from './common';

/** the hireling's panel (UI.openPanel('merc')) */
export function renderMerc(ui: UIContext, L: HTMLElement) {
  L.innerHTML = '';
  L.appendChild(h('h2', '', '佣 兵'));
  addClose(ui, L, 'left');
  L.appendChild(h('div', 'pending-note', '还没做'));
}
