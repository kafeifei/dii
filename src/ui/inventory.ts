import { ITEM_BASES, slotsFor, type EquipSlot } from '../data/items';
import { GEMS, RUNE_BY_ID } from '../data/legendary';
import { isBroken } from '../items/d2/durability';
import { isSocketFiller, socketBlock, type SocketBlock } from '../items/d2/sockets';
import type { Grid } from '../items/grid';
import { baseOf, displayName, isIdentified, isUnknown, socketId, type Item } from '../items/item';
import { insertFiller } from '../items/make';
import { isTownPortal, readable, readFrom, scrollIntoTome } from '../items/tomes';
import { buyIntoStack, buyIntoTome, buyPrice, multibuys, repairCost, repairOne, sellPrice, shelveSold, takeFromStore } from '../items/vendor';
import type { HeroLine } from '../audio/sounds';
import { h, type UIContext } from './common';
import { CELL, itemIcon } from './icons';

// The bag panel (the paper doll over the bag) and the item grids every panel shares (the bag, the
// stash, the cube, the shop's stock): taking, dropping, socketing, equipping, buying, selling and
// repairing.

type GridKind = 'inv' | 'stash' | 'shop' | 'cube';

/** what a socket filler that can't go in says (d2/sockets.ts); a full or socketless item just swaps places */
const SOCKET_BLOCKED: Partial<Record<SocketBlock, string>> = {
  unidentified: '未鉴定的物品不能镶嵌',
  fillerUnidentified: '先鉴定这颗珠宝',
};
/** identify scrolls and the tome of identify (Misc.txt spell 1) */
const identifies = (it: Item) => it.baseId === 'isc' || it.baseId === 'ibk';
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
/**
 * A gem, rune or jewel on the cursor dropped on an item with sockets (D2's rules: d2/sockets.ts):
 * in it goes, for good, and the last rune of a runeword makes it. 'swap' when the item has no
 * socket free (it is just swapped with), 'no' when it can't go in
 */
function socketInto(ui: UIContext, target: Item, filler: Item): 'in' | 'swap' | 'no' {
  const why = socketBlock(target, filler);
  if (why === 'full' || why === 'noSockets' || why === 'notFiller') return 'swap';
  if (why) {
    ui.message(SOCKET_BLOCKED[why] ?? '不能镶嵌', '#ff6060', 1.5);
    ui.sfx.play('ui.cant_use');
    return 'no';
  }
  if (insertFiller(target, filler)) {
    ui.message(`符文之语：${displayName(target)}！`, '#c8a86a', 4);
    ui.sfx.play('item.runeword');
  } else ui.sfx.play('item.socket');
  ui.game.player.markDirty();
  return 'in';
}

/** the merchant's repair cursor: the next item clicked in the bag or on the hero is repaired */
let repairing = false;

/** whether the repair cursor is up (the tooltip shows repair costs then) */
export function isRepairing(): boolean {
  return repairing;
}

export function toggleRepair(ui: UIContext) {
  repairing = !repairing;
  if (repairing) ui.message('点一件背包里或身上的物品修理它', '#c8a86a', 2);
  ui.sfx.play('ui.click');
  ui.dirty = true;
}

/** repair `it` at the merchant (vendor.ts repairOne): in full, or as far as the gold carried goes */
function repairWith(ui: UIContext, it: Item): boolean {
  repairing = false;
  ui.dirty = true;
  const p = ui.game.player;
  if (ui.left !== 'shop') return false;
  if (!repairCost(it, p.tradeCtx())) {
    ui.message(it.eth ? '无形物品无法修理' : '这件物品不用修理', '#aaa', 1.2);
    return true;
  }
  const done = repairOne(it, p, p.tradeCtx());
  if (!done) {
    ui.message('金币不足', '#ff6060');
    ui.sfx.play('ui.no_gold');
    ui.game.say('no_gold');
    return true;
  }
  p.markDirty();
  ui.message(done.full ? `修好了${displayName(it)}：−${done.spent} 金币` : `金币只够修一部分：−${done.spent} 金币`, '#e8d890', 1.5);
  ui.sfx.play('ui.coins');
  return true;
}

/**
 * The merchant's yes / no, as Diablo II asks it: a left click on an item on the shelf asks before
 * buying it, an item dropped on the shelf asks before selling it; a right click buys at once
 * (shift + right-click as many as D2's multibuy takes: buy), a ctrl + left click on an item in the
 * bag sells at once. Sources: D2R's own tooltip lines (InventoryItemTooltipAppenderBuy "Right Click
 * to Buy", …Sell "Ctrl + Left Click to Sell"), classic.battle.net's Arreat Summit (Basics: Vendors,
 * "control-left-clicking … without the confirmation"; Basics: Controls, shift + right-click on a
 * scroll fills the tome, on a key the key stack), the Diablo Wiki's Item page (a left click gets a
 * yes / no box, a right click buys at once). What it is about stays where it is meanwhile: a sale's
 * item on the cursor, a purchase's on the shelf
 */
let trade: { kind: 'buy' | 'sell'; item: Item } | null = null;

/** the merchant's question up, if it still stands: the shop open, the item still on the shelf or the cursor */
export function tradeAsked(ui: UIContext): { kind: 'buy' | 'sell'; item: Item; price: number } | null {
  const t = trade;
  if (!t || ui.left !== 'shop') return null;
  const shop = ui.game.shop;
  const ctx = ui.game.player.tradeCtx();
  if (t.kind === 'buy' && shop.all().includes(t.item)) return { ...t, price: buyPrice(shop, t.item, ctx) };
  if (t.kind === 'sell' && ui.cursorItem === t.item) return { ...t, price: sellPrice(shop, t.item, ctx) };
  return null;
}

/** the question answered (or let go: no, Esc, the shop shut) */
export function answerTrade(ui: UIContext, yes: boolean) {
  const t = tradeAsked(ui);
  trade = null;
  ui.dirty = true;
  if (!t || !yes) return;
  if (t.kind === 'buy') buy(ui, t.item);
  else if (sell(ui, t.item)) ui.cursorItem = null;
}

/** forget the question (the shop shut) */
export function dropTrade() {
  trade = null;
}

function ask(ui: UIContext, kind: 'buy' | 'sell', item: Item) {
  trade = { kind, item };
  ui.tooltip.hide();
  ui.sfx.play('ui.click');
  ui.dirty = true;
}

/** the scroll or tome a right-click picked to identify with: the next item clicked */
let identifier: Item | null = null;

function startIdentify(ui: UIContext, scroll: Item) {
  if (!readable(scroll)) {
    ui.message('鉴定之书里没有卷轴了', '#ff6060', 1.5);
    return;
  }
  identifier = scroll;
  ui.message('点一件未辨识的物品鉴定它', '#c8a86a', 2);
  ui.sfx.play('ui.click');
}

/** identify `target` with the picked scroll or tome: a scroll is used up, a tome loses one charge (D2 Misc.txt spell 1) */
function identifyWith(ui: UIContext, target: Item): boolean {
  const s = identifier;
  identifier = null;
  if (!s || s === target) return false;
  if (isIdentified(target)) {
    ui.message('这件物品不用鉴定', '#aaa', 1.2);
    return true;
  }
  const p = ui.game.player;
  if (!readFrom([p.inventory, p.stash, p.cube], s)) return false;
  target.identified = true;
  target.name = displayName(target);
  p.markDirty();
  ui.message(`鉴定了：${displayName(target)}`, '#c8a86a', 2);
  ui.sfx.play('item.socket');
  ui.dirty = true;
  return true;
}

function gridOf(ui: UIContext, kind: GridKind): Grid {
  const p = ui.game.player;
  return kind === 'inv' ? p.inventory : kind === 'stash' ? p.stash : kind === 'cube' ? p.cube : ui.game.shop.grid;
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
    // a right click buys it there and then; shift + right-click as many as D2's multibuy takes; on a phone, the long press
    if (kind === 'shop') {
      trade = null;
      return buy(ui, it, e.shiftKey || e.pointerType === 'touch');
    }
    const b = baseOf(it);
    if (b.type === 'cube') {
      openCube(ui);
      return;
    }
    if (identifies(it)) {
      startIdentify(ui, it);
      return;
    }
    // a tome or scroll of town portal: read, the hero casts it (Game.castTownPortal)
    if (isTownPortal(it)) {
      ui.game.castTownPortal(it);
      ui.dirty = true;
      return;
    }
    if (b.type === 'potion' && ui.game.drinkable(it)) {
      grid.remove(it);
      ui.game.drink(it);
    } else if (kind === 'inv') {
      autoEquip(ui, it);
    }
    ui.dirty = true;
    return;
  }
  if (e.button !== 0) return;
  if (identifier) {
    if (under && kind !== 'shop' && identifyWith(ui, under.item)) return;
    identifier = null;
  }
  if (repairing && !ui.cursorItem) {
    if (under && kind === 'inv' && repairWith(ui, under.item)) return;
    repairing = false;
    ui.dirty = true;
  }

  if (ui.cursorItem) {
    const c = ui.cursorItem;
    // a scroll onto its tome (identify's or town portal's): one more charge, up to the tome's most (tomes.ts)
    if (under && kind !== 'shop' && scrollIntoTome(c, under.item)) {
      ui.cursorItem = null;
      ui.sfx.play('item.move');
      ui.dirty = true;
      return;
    }
    if (kind === 'shop') {
      // dropped on the shelf: the merchant asks first; what they won't take stays on the cursor
      if (sellable(ui, c)) ask(ui, 'sell', c);
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
    if (under && isSocketFiller(c) && under.item.sockets > 0) {
      const r = socketInto(ui, under.item, c);
      if (r === 'in') ui.cursorItem = null;
      ui.dirty = true;
      if (r !== 'swap') return;
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
  if (kind === 'shop') {
    // a left click on the shelf: the merchant asks first; on an empty spot the question is let go
    if (under) ask(ui, 'buy', under.item);
    else if (trade) {
      trade = null;
      ui.dirty = true;
    }
    return;
  }
  if (!under) return;
  const it = under.item;
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    // ctrl + left click sells at once, without the merchant's question (shift + click is the belt's)
    if (ui.left === 'shop' && kind === 'inv' && !e.shiftKey) {
      if (sellable(ui, it)) {
        grid.remove(it);
        sell(ui, it);
      }
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

/**
 * buy from the shelf at its NPC's price (vendor.ts): a permanent item's copy, anything else itself.
 * A scroll goes into the bag's tome of its kind while it has room; `fill` (shift + right-click, D2's
 * multibuy), as many as it takes and the gold pays for (vendor.ts buyIntoTome). `fill` on a key,
 * arrows or bolts tops up a stack (vendor.ts buyIntoStack); on a potion that went into the belt,
 * more of them while the belt has room for them and the gold lasts (SUNITNPC_BuyItem, SUnitNpc.cpp:1465-1535:
 * the first one may go into the bag, the rest only into the belt)
 */
function buy(ui: UIContext, it: Item, fill = false) {
  const p = ui.game.player;
  const store = ui.game.shop;
  const stack = fill ? buyIntoStack(store, it, Object.values(p.equipment).filter((x): x is Item => !!x), p.inventory, p, p.tradeCtx()) : null;
  if (stack) {
    if (!stack.n) {
      if (p.gold < buyPrice(store, { ...it, qty: 1 }, p.tradeCtx())) {
        ui.message('金币不足', '#ff6060');
        ui.sfx.play('ui.no_gold');
        ui.game.say('no_gold');
      } else {
        ui.message('背包已满', '#ff6060');
        ui.game.say('bag_full');
      }
      return;
    }
    ui.message(`${displayName(stack.stack)}：+${stack.n}（${stack.stack.qty}/${baseOf(stack.stack).stack?.[1]}）：−${stack.spent} 金币`, '#e8d890', 1.5);
    ui.sfx.play('ui.coins');
    ui.tooltip.hide();
    ui.dirty = true;
    return;
  }
  const into = buyIntoTome(store, it, p.inventory, p, p.tradeCtx(), fill);
  if (into) {
    if (!into.n) {
      ui.message('金币不足', '#ff6060');
      ui.sfx.play('ui.no_gold');
      ui.game.say('no_gold');
      return;
    }
    ui.message(`${into.n} 张${displayName(it)}放进了${displayName(into.tome)}（${into.tome.qty}/${baseOf(into.tome).stack?.[1]}）：−${into.spent} 金币`, '#e8d890', 1.5);
    ui.sfx.play('ui.coins');
    // its tooltip offered to fill the tome as it was: the next move shows it as it is
    ui.tooltip.hide();
    ui.dirty = true;
    return;
  }
  const price = buyPrice(store, it, p.tradeCtx());
  if (p.gold < price) {
    ui.message('金币不足', '#ff6060');
    ui.sfx.play('ui.no_gold');
    ui.game.say('no_gold');
    return;
  }
  const perm = store.perm.has(it);
  const got = perm ? takeFromStore(store, it) : it;
  const belted = baseOf(got).type === 'potion' && ui.game.beltInsert(got);
  if (!belted && !p.inventory.add(got)) {
    ui.message('背包已满', '#ff6060');
    ui.game.say('bag_full');
    return;
  }
  p.gold -= price;
  if (!perm) takeFromStore(store, it);
  if (fill && belted && multibuys(store, it)) {
    while (p.gold >= price && ui.game.beltInsert(takeFromStore(store, it))) p.gold -= price;
  }
  ui.sfx.play('ui.coins');
  ui.dirty = true;
}

/** whether the merchant takes it; said when not */
function sellable(ui: UIContext, it: Item): boolean {
  if (!baseOf(it).noSell && !isUnknown(it)) return true;
  ui.message('商人不收这个', '#ff6060');
  return false;
}

/** sell to the stall at D2's price; what it can sell again goes on its shelf (vendor.ts shelveSold). False: not taken, it goes back on the cursor */
function sell(ui: UIContext, it: Item): boolean {
  const p = ui.game.player;
  if (!sellable(ui, it)) {
    ui.cursorItem = it;
    return false;
  }
  const v = sellPrice(ui.game.shop, it, p.tradeCtx());
  p.gold += v;
  shelveSold(ui.game.shop, it);
  ui.message(`出售 ${displayName(it)}：+${v} 金币`, '#e8d890', 1.5);
  ui.sfx.play('ui.coins');
  return true;
}

/** what the hero says to an item it can't use: another class's, too high a level for it, too strong for it */
const UNMET_LINE: Record<'class' | 'level' | 'stats' | 'unusable', HeroLine> = { class: 'cant_use', level: 'low_level', stats: 'too_weak', unusable: 'cant_use' };

/** why it can't go there, and what the hero says to that; or null */
function equipError(ui: UIContext, it: Item, slot: EquipSlot): { text: string; line: HeroLine } | null {
  const p = ui.game.player;
  const b = baseOf(it);
  if (!slotsFor(b.type).includes(slot)) return { text: '无法装备在这里', line: 'cant_use' };
  if (!isIdentified(it)) return { text: '未辨识的物品不能装备', line: 'cant_use' };
  if (b.noUse) return { text: `不能使用：${b.noUse}`, line: 'cant_use' };
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
  if (identifier) {
    if (cur && identifyWith(ui, cur)) return;
    identifier = null;
  }
  if (repairing && !ui.cursorItem) {
    if (cur && repairWith(ui, cur)) return;
    repairing = false;
    ui.dirty = true;
  }
  if (ui.cursorItem) {
    const c = ui.cursorItem;
    if (cur && isSocketFiller(c) && cur.sockets > 0) {
      const r = socketInto(ui, cur, c);
      if (r === 'in') ui.cursorItem = null;
      ui.dirty = true;
      if (r !== 'swap') return;
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
    const wearable = slotsFor(b.type).length > 0 || b.type === 'charm';
    // red: what the hero can't use, and what is broken (it gives nothing until repaired)
    const d = h('div', `gitem ${it.rarity}${(wearable && kind !== 'shop' && !p.meetsReq(it)) || isBroken(it) ? ' unusable' : ''}`);
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
        const f = it.socketed[i];
        const id = f === undefined ? undefined : socketId(f);
        const r = id ? RUNE_BY_ID[id] : null;
        // a rune shows its number; one or a gem this build doesn't know (a later build's) still fills its socket: a question mark
        const sk = h('div', 'sock', r ? r.glyph : typeof f === 'string' && !GEM_COLOR[f] ? '?' : '');
        const tint = id && (GEM_COLOR[id] ?? (typeof f === 'object' ? (ITEM_BASES[id]?.tint ?? '#8a8278') : undefined));
        // a gem in its colour, a jewel in its base's
        if (tint) sk.style.background = `radial-gradient(circle at 40% 35%, #fff 0, ${tint} 35%, #000 100%)`;
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
    // red while it gives nothing: worn, but the hero no longer meets its requirements (D2's unusable flag)
    const s = h('div', `eqslot ${it ? it.rarity : ''}${it && p.unusable(it) ? ' unusable' : ''}`);
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
