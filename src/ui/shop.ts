import { repairAllList, pay } from '../items/vendor';
import { repairItem } from '../items/d2/durability';
import { STASH_GOLD_MAX, STASH_TABS } from '../items/stash';
import { areaDef } from '../world/areas';
import { addClose, h, type UIContext } from './common';
import { isRepairing, renderGrid, stashGrid, toggleRepair } from './inventory';

// The camp's services, on the left with the bag beside them: the stash, the merchant, the waypoint.

/**
 * The stash, D2R's: a tab for the hero's own page and one for each shared page (src/items/stash.ts),
 * the page shown kept while playing (UIContext.stashPage), and the gold of the page shown, each
 * page's its own as in D2R
 */
export function renderStash(ui: UIContext, L: HTMLElement) {
  const g = ui.game;
  const p = g.player;
  L.innerHTML = '';
  L.appendChild(h('h2', '', '储 物 箱'));
  addClose(ui, L, 'left');
  const tabs = h('div', 'tabs stash-tabs');
  STASH_TABS.forEach((label, i) => {
    const t = h('div', `tab${i === ui.stashPage ? ' on' : ''}`, label);
    // what each page is, by the pointer (a phone's tap only switches)
    if (!ui.touch) t.dataset.tip = i ? '所有角色共用：任务物品放不进去' : '只属于这个角色';
    t.onclick = () => {
      if (ui.stashPage === i) return;
      ui.stashPage = i;
      ui.sfx.play('ui.click');
      ui.dirty = true;
    };
    tabs.appendChild(t);
  });
  L.appendChild(tabs);
  L.appendChild(renderGrid(ui, 'stash', stashGrid(ui)));
  const page = ui.stashPage;
  const shared = page > 0;
  const locked = shared ? g.shared.readOnly : null;
  const banked = shared ? (g.shared.gold[page - 1] ?? 0) : p.stashGold;
  const gl = h('div', 'goldline');
  const sum = h('span', '', `${shared ? '共享金币' : '储存金币'}：${banked}`);
  // the personal page's gold is lost in part on dying, as D2's is (game/d2/death.ts); a shared page's isn't
  sum.dataset.tip = shared ? `这一页的金币，所有角色共用；每页最多 ${STASH_GOLD_MAX}，死亡时不会损失` : `最多 ${STASH_GOLD_MAX}`;
  gl.appendChild(sum);
  const move = (op: 'deposit' | 'withdraw') => {
    // the page's gold as another tab may have left it, then this one's change written (Game.syncShared)
    if (shared) g.syncShared();
    const had = shared ? (g.shared.gold[page - 1] ?? 0) : p.stashGold;
    const n = g.moveStashGold(page, op);
    if (n) {
      ui.sfx.play('ui.coins');
      if (shared) g.syncShared();
    } else if (locked) {
      ui.message(locked, '#ff8060', 2);
      ui.sfx.play('ui.denied');
    } else if (op === 'withdraw' && had > 0) {
      // more than the hero can carry: 10,000 a level (src/items/stash.ts withdrawable)
      ui.message('身上带不下更多金币了', '#ff6060', 1.5);
      g.say('cant_carry');
    } else if (op === 'deposit' && p.gold > 0) {
      ui.message('储物箱放不下更多金币了', '#ff6060', 1.5);
      ui.sfx.play('ui.denied');
    }
    ui.dirty = true;
  };
  const dep = h('button', 'btn', '存入全部');
  dep.onclick = () => move('deposit');
  const wd = h('button', 'btn', '取出全部');
  wd.onclick = () => move('withdraw');
  dep.disabled = wd.disabled = !!locked;
  const box = h('div');
  box.style.display = 'flex';
  box.style.gap = '6px';
  box.append(dep, wd);
  gl.appendChild(box);
  L.appendChild(gl);
  if (locked) L.appendChild(h('div', 'stash-note', locked));
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
