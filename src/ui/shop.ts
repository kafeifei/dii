import { repairAllList, pay } from '../items/vendor';
import { repairItem } from '../items/d2/durability';
import { areaDef } from '../world/areas';
import { addClose, h, type UIContext } from './common';
import { isRepairing, renderGrid, toggleRepair } from './inventory';

// The camp's services, on the left with the bag beside them: the stash, the merchant, the waypoint.

export function renderStash(ui: UIContext, L: HTMLElement) {
  const p = ui.game.player;
  L.innerHTML = '';
  L.appendChild(h('h2', '', '储 物 箱'));
  addClose(ui, L, 'left');
  L.appendChild(renderGrid(ui, 'stash', p.stash));
  const gl = h('div', 'goldline');
  gl.innerHTML = `<span>储存金币：${p.stashGold}</span>`;
  const dep = h('button', 'btn', '存入全部');
  dep.onclick = () => {
    p.stashGold += p.gold;
    p.gold = 0;
    ui.sfx.play('ui.coins');
    ui.dirty = true;
  };
  const wd = h('button', 'btn', '取出全部');
  wd.onclick = () => {
    p.gold += p.stashGold;
    p.stashGold = 0;
    ui.sfx.play('ui.coins');
    ui.dirty = true;
  };
  const box = h('div');
  box.style.display = 'flex';
  box.style.gap = '6px';
  box.append(dep, wd);
  gl.appendChild(box);
  L.appendChild(gl);
}

/**
 * The merchant: Diablo II's camp shelves by page (src/items/vendor.ts), buying and selling at D2's
 * prices, and repairs (one item with the repair cursor, or everything worn)
 */
export function renderShop(ui: UIContext, L: HTMLElement) {
  L.innerHTML = '';
  // titled with the merchant's object, which the layout's vendor service names
  const vendor = ui.game.level.objects.find((o) => o.kind === 'vendor');
  L.appendChild(h('h2', '', vendor?.name ?? '商人'));
  addClose(ui, L, 'left');
  const store = ui.game.shop;
  const on = store.current();
  const tabs = h('div', 'tabs shop-tabs');
  store.shown().forEach((s) => {
    const t = h('div', `tab${s.tab === on ? ' on' : ''}`, s.label);
    t.onclick = () => {
      store.selected = s.tab;
      ui.sfx.play('ui.click');
      ui.dirty = true;
    };
    tabs.appendChild(t);
  });
  L.appendChild(tabs);
  L.appendChild(renderGrid(ui, 'shop', store.grid));
  const p = ui.game.player;
  L.appendChild(h('div', 'goldline', `<span>你的金币：${p.gold}${p.stashGold ? `（储物箱 ${p.stashGold}）` : ''}</span><span style="color:#8a8278;font-size:12px">点击购买 · 把物品放进来出售</span>`));
  // repairs, D2's (Charsi's in Act 1): the repair cursor for one item, or everything worn; the stash's gold pays too
  const ctx = p.tradeCtx();
  const all = repairAllList(p.equipment, ctx);
  const total = all.reduce((n, r) => n + r.cost, 0);
  const row = h('div', 'shop-actions');
  const one = h('button', `btn${isRepairing() ? ' on' : ''}`, '修理');
  one.onclick = () => toggleRepair(ui);
  const every = h('button', 'btn', all.length ? `全部修理（${total} 金币）` : '全部修理');
  every.disabled = !all.length;
  every.onclick = () => {
    if (!pay(p, total)) {
      ui.message('金币不足', '#ff4040', 1);
      ui.sfx.play('ui.no_gold');
      ui.game.say('no_gold');
      return;
    }
    for (const r of all) repairItem(r.item);
    p.markDirty();
    ui.sfx.play('ui.coins');
    ui.message(`全部修好了：−${total} 金币`, '#c8a86a', 1.5);
    ui.dirty = true;
  };
  row.append(one, every);
  L.appendChild(row);
}

export function renderWaypoints(ui: UIContext, L: HTMLElement) {
  L.innerHTML = '';
  L.appendChild(h('h2', '', '传 送 点'));
  addClose(ui, L, 'left');
  const list = h('div', 'wplist');
  const p = ui.game.player;
  // the areas whose waypoint is touched, in the order a hero comes to them (Player.waypoints)
  for (const id of p.waypoints) {
    const here = ui.game.area?.id === id;
    const w = h('div', `wp${here ? ' cur' : ''}`, areaDef(id)?.name ?? '?');
    w.onclick = () => {
      if (ui.game.area?.id === id) return;
      // shut now: a jump on the same map builds nothing that would redraw the panels
      ui.left = null;
      ui.dirty = true;
      ui.game.travel(id);
    };
    list.appendChild(w);
  }
  L.appendChild(list);
}
