import { transmute } from '../items/cube';
import { addClose, h, type UIContext } from './common';
import { renderGrid } from './inventory';

/** the Horadric Cube: its 3×4 space and the Transmute button */
export function renderCube(ui: UIContext, L: HTMLElement) {
  const p = ui.game.player;
  L.innerHTML = '';
  L.appendChild(h('h2', '', '赫拉迪姆魔盒'));
  addClose(ui, L, 'left');
  const wrap = h('div', 'cube-wrap');
  wrap.appendChild(renderGrid(ui, 'cube', p.cube));
  const go = h('button', 'btn cube-go', '转 化');
  go.onclick = () => {
    if (ui.cursorItem) return;
    const r = transmute(p.cube, p.level);
    ui.message(r.message, r.ok ? '#c8a86a' : '#ff6060', 2.5);
    ui.sfx.play(r.ok ? 'socket' : 'nomana');
    ui.dirty = true;
  };
  wrap.appendChild(go);
  L.appendChild(wrap);
  L.appendChild(h('div', 'goldline', '<span style="color:#8a8278;font-size:12px">放进配方所需的物品，按"转化"。Ctrl+点击在背包与魔盒间移动</span>'));
}
