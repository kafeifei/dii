import { areaDef } from '../world/areas';
import { addClose, h, type UIContext } from './common';
import { renderGrid } from './inventory';

// The camp's services, on the left with the bag beside them: the stash, the merchant, the waypoint.

/** gold to refill charges: Diablo II charges by skill level per missing charge */
function rechargeCost(missing: number, lvl: number): number {
  return missing * (10 + lvl * 6);
}

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

export function renderShop(ui: UIContext, L: HTMLElement) {
  L.innerHTML = '';
  // titled with the merchant's object, which the layout's vendor service names
  const vendor = ui.game.level.objects.find((o) => o.kind === 'vendor');
  L.appendChild(h('h2', '', vendor?.name ?? '商人'));
  addClose(ui, L, 'left');
  L.appendChild(renderGrid(ui, 'shop', ui.game.shop));
  L.appendChild(h('div', 'goldline', `<span>你的金币：${ui.game.player.gold}</span><span style="color:#8a8278;font-size:12px">点击购买 · 把物品放进来出售</span>`));
  // like Diablo II's repair: refill the charges on worn and carried items
  const p = ui.game.player;
  const spent = p.spentCharges();
  if (spent.length) {
    const cost = spent.reduce((n, c) => n + rechargeCost(c.missing, c.lvl), 0);
    const btn = h('button', 'cube-go', `补充充能（${cost} 金币）`);
    btn.onclick = () => {
      if (p.gold < cost) return ui.message('金币不够', '#ff4040', 1);
      p.gold -= cost;
      for (const c of spent) (c.item.charges ??= {})[c.param] = (c.item.charges[c.param] ?? 0) + c.missing;
      ui.sfx.play('ui.coins');
      ui.message('充能已补满', '#c8a86a', 1);
      ui.dirty = true;
    };
    L.appendChild(btn);
  }
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
