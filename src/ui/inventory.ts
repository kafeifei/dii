import { ITEM_BASES, slotsFor, type EquipSlot } from '../data/items';
import { GEMS, RUNE_BY_ID } from '../data/legendary';
import { createItem, findRuneword, applyRuneword } from '../items/gen';
import type { Grid } from '../items/grid';
import { baseOf, buyPrice, canSocket, displayName, sellPrice, type Item } from '../items/item';
import type { HeroLine } from '../audio/sounds';
import { h, type UIContext } from './common';
import { CELL, itemIcon } from './icons';

// The bag panel (the paper doll over the bag) and the item grids every panel shares (the bag, the
// stash, the cube, the shop's stock): taking, dropping, socketing, equipping, buying and selling.

type GridKind = 'inv' | 'stash' | 'shop' | 'cube';

/** runes and gems go into sockets */
const socketable = (it: Item) => {
  const t = baseOf(it).type;
  return t === 'rune' || t === 'gem';
};
const GEM_COLOR: Record<string, string> = Object.fromEntries(GEMS.map((g) => [g.id, ITEM_BASES[g.id].tint ?? '#fff']));

// paper doll layout (x, y, w, h in px)
const DOLL: Record<EquipSlot, [number, number, number, number, string]> = {
  head: [137, 0, 68, 68, '头部'],
  neck: [215, 24, 34, 34, '项链'],
  weapon: [0, 34, 68, 136, '武器'],
  body: [137, 78, 68, 102, '躯干'],
  offhand: [272, 34, 68, 136, '副手'],
  hands: [0, 180, 68, 68, '手部'],
  ring1: [95, 190, 34, 34, '戒指'],
  waist: [137, 190, 68, 34, '腰带'],
  ring2: [213, 190, 34, 34, '戒指'],
  feet: [272, 180, 68, 68, '足部'],
};

// ─────────────────────────── item ops ───────────────────────────
function socketInto(ui: UIContext, target: Item, rune: Item): boolean {
  if (!canSocket(target) || !socketable(rune)) return false;
  target.socketed.push(rune.baseId);
  const rw = findRuneword(target);
  if (rw) {
    applyRuneword(target, rw);
    ui.message(`符文之语：${displayName(target)}！`, '#c8a86a', 4);
    ui.sfx.play('item.runeword');
  } else ui.sfx.play('item.socket');
  ui.game.player.markDirty();
  return true;
}

function gridOf(ui: UIContext, kind: GridKind): Grid {
  const p = ui.game.player;
  return kind === 'inv' ? p.inventory : kind === 'stash' ? p.stash : kind === 'cube' ? p.cube : ui.game.shop;
}

function onGridDown(ui: UIContext, kind: GridKind, gridEl: HTMLElement, e: PointerEvent) {
  e.preventDefault();
  const p = ui.game.player;
  const grid = gridOf(ui, kind);
  const rect = gridEl.getBoundingClientRect();
  // the panel may be drawn scaled (phones): measure in the grid's own pixels
  const k = gridEl.offsetWidth ? rect.width / gridEl.offsetWidth : 1;
  const px = (e.clientX - rect.left) / k;
  const py = (e.clientY - rect.top) / k;
  const cx = Math.floor(px / CELL);
  const cy = Math.floor(py / CELL);
  const under = grid.at(cx, cy);

  if (e.button === 2) {
    if (!under || ui.cursorItem) return;
    const it = under.item;
    if (kind === 'shop') return buy(ui, it);
    const b = baseOf(it);
    if (b.type === 'cube') {
      openCube(ui);
      return;
    }
    if (b.type === 'potion') {
      grid.remove(it);
      ui.game.drink(it);
    } else if (kind === 'inv') {
      autoEquip(ui, it);
    }
    ui.dirty = true;
    return;
  }
  if (e.button !== 0) return;

  if (ui.cursorItem) {
    const c = ui.cursorItem;
    if (kind === 'shop') {
      sell(ui, c);
      ui.cursorItem = null;
      ui.dirty = true;
      return;
    }
    if (kind === 'cube' && baseOf(c).type === 'cube') return;
    // dropped on the cube (in the bag or the stash): straight in, wherever it fits
    if (under && baseOf(under.item).type === 'cube') {
      if (p.cube.add(c)) {
        ui.cursorItem = null;
        ui.message(`${displayName(c)} 放进了魔盒`, '#c8a86a', 1.2);
        ui.sfx.play('item.move');
      } else ui.message('魔盒里放不下了', '#ff6060');
      ui.dirty = true;
      return;
    }
    if (under && socketable(c) && canSocket(under.item)) {
      if (socketInto(ui, under.item, c)) {
        ui.cursorItem = null;
        ui.dirty = true;
      }
      return;
    }
    const b = baseOf(c);
    let tx = Math.round(px / CELL - b.w / 2);
    let ty = Math.round(py / CELL - b.h / 2);
    tx = Math.max(0, Math.min(grid.w - b.w, tx));
    ty = Math.max(0, Math.min(grid.h - b.h, ty));
    const over = grid.overlapping(tx, ty, b.w, b.h);
    if (over.length === 0) {
      grid.place(c, tx, ty);
      ui.cursorItem = null;
      ui.sfx.play('item.move');
    } else if (over.length === 1) {
      grid.remove(over[0].item);
      grid.place(c, tx, ty);
      ui.cursorItem = over[0].item;
      ui.sfx.play('item.move');
    }
    ui.dirty = true;
    return;
  }
  if (!under) return;
  const it = under.item;
  if (kind === 'shop') return buy(ui, it);
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    if (ui.left === 'shop' && kind === 'inv') {
      grid.remove(it);
      sell(ui, it);
    } else if (ui.left === 'stash' || ui.left === 'cube') {
      const other = ui.left === 'stash' ? p.stash : p.cube;
      if (kind === 'inv' && baseOf(it).type === 'cube') return;
      const dest = kind === 'inv' ? other : p.inventory;
      if (dest.add(it)) grid.remove(it);
      else {
        ui.message(kind === 'inv' ? (ui.left === 'stash' ? '储物箱已满' : '魔盒已满') : '背包已满', '#ff6060');
        if (kind !== 'inv') ui.game.say('bag_full');
      }
    } else if (baseOf(it).type === 'potion' && kind === 'inv') {
      if (ui.game.beltInsert(it)) grid.remove(it);
    }
    ui.sfx.play('item.move');
    ui.dirty = true;
    return;
  }
  grid.remove(it);
  ui.cursorItem = it;
  ui.sfx.play('item.move');
  ui.dirty = true;
}

/** the cube right-clicked: its panel, beside the bag */
function openCube(ui: UIContext) {
  ui.left = 'cube';
  ui.right = 'inv';
  ui.dirty = true;
  ui.sfx.play('ui.open');
}

function buy(ui: UIContext, it: Item) {
  const p = ui.game.player;
  const price = buyPrice(it);
  if (p.gold < price) {
    ui.message('金币不足', '#ff6060');
    ui.sfx.play('ui.no_gold');
    ui.game.say('no_gold');
    return;
  }
  const b = baseOf(it);
  const copy = b.type === 'potion' ? createItem(b.id) : it;
  if (!(b.type === 'potion' && ui.game.beltInsert(copy)) && !p.inventory.add(copy)) {
    ui.message('背包已满', '#ff6060');
    ui.game.say('bag_full');
    return;
  }
  p.gold -= price;
  if (b.type !== 'potion') ui.game.shop.remove(it);
  ui.sfx.play('ui.coins');
  ui.dirty = true;
}

function sell(ui: UIContext, it: Item) {
  const p = ui.game.player;
  if (baseOf(it).noSell) {
    ui.message('商人不收这个', '#ff6060');
    ui.cursorItem = it;
    return;
  }
  const v = sellPrice(it);
  p.gold += v;
  if (baseOf(it).type !== 'potion') ui.game.shop.add(it);
  ui.message(`出售 ${displayName(it)}：+${v} 金币`, '#e8d890', 1.5);
  ui.sfx.play('ui.coins');
}

/** what the hero says to an item it can't use: another class's, too high a level for it, too strong for it */
const UNMET_LINE: Record<'class' | 'level' | 'stats', HeroLine> = { class: 'cant_use', level: 'low_level', stats: 'too_weak' };

/** why it can't go there, and what the hero says to that; or null */
function equipError(ui: UIContext, it: Item, slot: EquipSlot): { text: string; line: HeroLine } | null {
  const p = ui.game.player;
  const b = baseOf(it);
  if (!slotsFor(b.type).includes(slot)) return { text: '无法装备在这里', line: 'cant_use' };
  const unmet = p.unmetReq(it);
  if (unmet) return { text: '不满足装备需求', line: UNMET_LINE[unmet] };
  if (slot === 'offhand') {
    const w = p.equipment.weapon;
    if (w && baseOf(w).twoHanded) return { text: '双手武器无法搭配盾牌', line: 'cant_use' };
  }
  return null;
}

function equipTo(ui: UIContext, it: Item, slot: EquipSlot): Item | null | false {
  const p = ui.game.player;
  const err = equipError(ui, it, slot);
  if (err) {
    ui.message(err.text, '#ff6060', 1.5);
    ui.sfx.play('ui.cant_use');
    ui.game.say(err.line);
    return false;
  }
  const b = baseOf(it);
  if (slot === 'weapon' && b.twoHanded && p.equipment.offhand) {
    const sh = p.equipment.offhand;
    if (!p.inventory.add(sh)) {
      ui.message('背包没有空间放下盾牌', '#ff6060');
      ui.game.say('bag_full');
      return false;
    }
    delete p.equipment.offhand;
  }
  const old = p.equipment[slot] ?? null;
  p.equipment[slot] = it;
  p.markDirty();
  ui.sfx.play('item.equip');
  return old;
}

function autoEquip(ui: UIContext, it: Item) {
  const p = ui.game.player;
  const slots = slotsFor(baseOf(it).type);
  if (!slots.length) return;
  let slot = slots[0];
  if (slots.length > 1) slot = slots.find((s) => !p.equipment[s]) ?? slots[0];
  const placed = p.inventory.items.find((x) => x.item === it);
  p.inventory.remove(it);
  const old = equipTo(ui, it, slot);
  if (old === false) {
    if (placed) p.inventory.place(it, placed.x, placed.y);
    else p.inventory.add(it);
    return;
  }
  if (old) {
    if (!(placed && p.inventory.canPlace(old, placed.x, placed.y) && (p.inventory.place(old, placed.x, placed.y), true)) && !p.inventory.add(old)) {
      ui.cursorItem = old;
    }
  }
}

function onEquipDown(ui: UIContext, slot: EquipSlot, e: PointerEvent) {
  e.preventDefault();
  const p = ui.game.player;
  const cur = p.equipment[slot];
  if (e.button === 2) {
    if (cur && !ui.cursorItem && p.inventory.add(cur)) {
      delete p.equipment[slot];
      p.markDirty();
      ui.sfx.play('item.equip');
      ui.dirty = true;
    }
    return;
  }
  if (ui.cursorItem) {
    const c = ui.cursorItem;
    if (cur && socketable(c) && canSocket(cur)) {
      if (socketInto(ui, cur, c)) ui.cursorItem = null;
      ui.dirty = true;
      return;
    }
    const old = equipTo(ui, c, slot);
    if (old === false) return;
    ui.cursorItem = old;
    ui.dirty = true;
    return;
  }
  if (cur) {
    delete p.equipment[slot];
    p.markDirty();
    ui.cursorItem = cur;
    ui.sfx.play('item.equip');
    ui.dirty = true;
  }
}

// ─────────────────────────── rendering ───────────────────────────
export function renderGrid(ui: UIContext, kind: GridKind, grid: Grid): HTMLElement {
  const el = h('div', 'grid');
  el.style.width = `${grid.w * CELL + 2}px`;
  el.style.height = `${grid.h * CELL + 2}px`;
  const p = ui.game.player;
  for (const pl of grid.items) {
    const it = pl.item;
    const b = baseOf(it);
    const d = h('div', `gitem ${it.rarity}${b.type !== 'potion' && b.type !== 'cube' && !socketable(it) && kind !== 'shop' && !p.meetsReq(it) ? ' unusable' : ''}`);
    d.style.left = `${pl.x * CELL + 1}px`;
    d.style.top = `${pl.y * CELL + 1}px`;
    d.style.width = `${b.w * CELL}px`;
    d.style.height = `${b.h * CELL}px`;
    d.dataset.uid = it.uid;
    d.dataset.src = kind;
    d.innerHTML = `<img src="${itemIcon(it)}" />`;
    // carrying something: the cube lights up, it can go straight in
    if (ui.cursorItem && b.type === 'cube') d.classList.add('hl');
    if (it.sockets > 0) {
      const s = h('div', 'sockets');
      for (let i = 0; i < it.sockets; i++) {
        const id = it.socketed[i];
        const r = id ? RUNE_BY_ID[id] : null;
        const sk = h('div', 'sock', r ? r.letter.slice(0, 1) : '');
        if (id && GEM_COLOR[id]) sk.style.background = `radial-gradient(circle at 40% 35%, #fff 0, ${GEM_COLOR[id]} 35%, #000 100%)`;
        s.appendChild(sk);
      }
      d.appendChild(s);
    }
    ui.itemByUid.set(it.uid, it);
    el.appendChild(d);
  }
  el.addEventListener('pointerdown', (e) => onGridDown(ui, kind, el, e));
  return el;
}

export function renderInventory(ui: UIContext, R: HTMLElement): void {
  const p = ui.game.player;
  R.innerHTML = '';
  R.appendChild(h('h2', '', '背 包'));
  const close = h('button', 'close', '✕');
  close.onclick = () => {
    ui.right = null;
    ui.sfx.play('ui.close');
    ui.dirty = true;
  };
  R.appendChild(close);
  const doll = h('div', 'paperdoll');
  for (const slot of Object.keys(DOLL) as EquipSlot[]) {
    const [x, y, w, hh, label] = DOLL[slot];
    const it = p.equipment[slot];
    const s = h('div', `eqslot ${it ? it.rarity : ''}`);
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.width = `${w}px`;
    s.style.height = `${hh}px`;
    if (it) {
      s.innerHTML = `<img src="${itemIcon(it)}" />`;
      s.dataset.uid = it.uid;
      s.dataset.src = 'eq';
      ui.itemByUid.set(it.uid, it);
    } else s.innerHTML = `<span class="ph">${label}</span>`;
    if (ui.cursorItem && slotsFor(baseOf(ui.cursorItem).type).includes(slot)) s.classList.add('hl');
    s.addEventListener('pointerdown', (e) => onEquipDown(ui, slot, e));
    doll.appendChild(s);
  }
  R.appendChild(doll);
  R.appendChild(renderGrid(ui, 'inv', p.inventory));
  const gl = h('div', 'goldline', `<span>金币：${p.gold}</span><span style="color:#8a8278;font-size:12px">${ui.touch ? '点一下看说明，再点拿起 · 长按使用/装备' : '右键使用/装备 · Ctrl+点击快捷操作'}</span>`);
  R.appendChild(gl);
}
