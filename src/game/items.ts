import { DROP_SOUND, type HeroLine } from '../audio/sounds';
import type { P2 } from '../core/math';
import { isGold, type Drop } from '../items/gen';
import { baseOf, displayName, isUnknown, type Item } from '../items/item';
import { fillableTome, isBookScroll, isTome, isTownPortal, mergeTome, readable, readFrom, scrollIntoTome, tomeCharges, tomeMax } from '../items/tomes';
import { autoBeltable, freeBeltColumn } from '../items/belt';
import { depositable, sharedBlock, withdrawable } from '../items/stash';
import type { Grid } from '../items/grid';
import { charStats, potionHeal } from './d2/stats';
import type { Game } from './game';
import type { Level } from './level';
import { GroundItem } from './objects';

/** what the game remembers of the hero's items (Game.finds) */
export interface Finds {
  /** the unknown items by the stash were pointed out this game: they may wait there for long */
  toldUnknown: boolean;
  /** the finds the hero has remarked on: picked up again, an item isn't new */
  remarked: WeakSet<Item>;
}

/** the grids the hero's items lie in, the shared pages too while they can change, for reading a scroll or tome from */
export function heldGrids(g: Game): Grid[] {
  const p = g.player;
  return [p.inventory, p.stash, ...(g.shared.readOnly ? [] : g.shared.pages), p.cube];
}

/** why `it` can't go on page `page` of the stash (0 the hero's own, 1… the shared ones), or null */
export function stashBlock(g: Game, page: number, it: Item): string | null {
  return page > 0 ? (g.shared.readOnly ?? sharedBlock(it)) : null;
}

/**
 * Gold into or out of the page of the stash shown (0 the hero's own, Player.stashGold; 1… a shared
 * one's own, as D2R keeps it). As much as fits, D2's way (src/items/stash.ts); how much moved
 */
export function moveStashGold(g: Game, page: number, op: 'deposit' | 'withdraw'): number {
  const p = g.player;
  const sh = g.shared;
  if (page > 0 && (sh.readOnly || page > sh.gold.length)) return 0;
  const banked = page > 0 ? sh.gold[page - 1] : p.stashGold;
  const n = op === 'deposit' ? depositable(p.gold, banked) : -withdrawable(banked, p.gold, p.level);
  p.gold -= n;
  if (page > 0) sh.gold[page - 1] += n;
  else p.stashGold += n;
  return Math.abs(n);
}

/**
 * put the items that fit nowhere (old saves, bigger D2 items), and the ones this build doesn't
 * know, on the ground around the stash
 */
export function layOutUnplaced(g: Game, level: Level) {
  const p = g.player;
  // the camp is kept while the game lasts: what lies there already stays where it is
  const fresh = p.unplaced.filter((it) => !level.ground.some((gi) => gi.item === it));
  if (!fresh.length) return;
  const stash = level.objects.find((o) => o.kind === 'stash' && level.inTown(o.pos));
  const at = stash ? stash.pos : level.layout.start;
  fresh.forEach((it, i) => {
    const a = (i / fresh.length) * Math.PI * 2;
    const r = 1.6 + (i % 2) * 0.7;
    const spot = level.map.nearestWalkable(at.x + Math.sin(a) * r, at.z + Math.cos(a) * r) ?? at;
    level.ground.push(new GroundItem(spot, it, 0));
  });
  const unknown = fresh.filter(isUnknown).length;
  if (unknown < fresh.length) g.hooks.message(`${fresh.length - unknown} 件物品背包和储物箱都放不下，放在了储物箱旁边`, '#c8a86a', 5);
  if (unknown && !g.finds.toldUnknown) {
    g.hooks.message(`${unknown} 件物品这个版本认不出，原样放在了储物箱旁边`, '#c8a86a', 5);
    g.finds.toldUnknown = true;
  }
}

export function spawnDrops(g: Game, pos: P2, drops: Drop[]) {
  const map = g.level.map;
  for (const d of drops) {
    let spot: P2 = pos;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 1.1;
      const c = { x: pos.x + Math.sin(a) * r, z: pos.z + Math.cos(a) * r };
      if (map.walkableAt(c.x, c.z) && map.los(pos, c)) {
        spot = c;
        break;
      }
    }
    if (isGold(d.item)) {
      // gold lies as a pile, picked up into the purse
      g.level.ground.push(new GroundItem(spot, null, d.item.qty ?? 1, pos));
      g.sfx.play('item.gold', { pos: spot });
    } else {
      g.level.ground.push(new GroundItem(spot, d.item, 0, pos));
      const it = d.item;
      const b = baseOf(it);
      // each kind of item lands with its own sound (a rune's is its stinger); a unique's stinger goes over it
      const drop = DROP_SOUND[b.type] ?? 'item.drop';
      g.sfx.play(drop, { pos: spot });
      if (it.rarity === 'unique' || it.rarity === 'set') {
        g.sfx.play('item.drop_unique', { pos: spot });
        g.fx.burst('unique_drop', spot, { color: it.rarity === 'set' ? '#22d422' : '#c8a86a' });
      } else if (b.type === 'rune') g.fx.burst('unique_drop', spot, { color: '#ffa31a' });
    }
  }
}

export function dropItem(g: Game, item: Item) {
  const p = g.player;
  const a = p.facing;
  const spot = { x: p.pos.x + Math.sin(a) * 0.8, z: p.pos.z + Math.cos(a) * 0.8 };
  const ok = g.level.map.walkableAt(spot.x, spot.z) ? spot : { ...p.pos };
  g.level.ground.push(new GroundItem(ok, item, 0, p.pos));
  const dropped = DROP_SOUND[baseOf(item).type] ?? 'item.drop';
  g.sfx.play(dropped, { pos: ok });
}

/**
 * Why `item` can't be put on the ground, or null: the cube, whose contents are kept apart
 * (Player.cube), and an item this build can't read (isUnknown), kept as it was for a build that
 * can. Nothing the hero holds is thrown away by a click; ground items aren't kept in the save
 */
export function dropBlock(g: Game, item: Item): string | null {
  if (baseOf(item).type === 'cube') return '魔盒不能丢在地上：里面的东西会跟着丢失';
  if (isUnknown(item)) return '这个版本认不出这件物品，不能丢在地上';
  return null;
}

/** `item` can't go on the ground (dropBlock): the hero is told, and true */
export function refuseDrop(g: Game, item: Item): boolean {
  const why = dropBlock(g, item);
  if (!why) return false;
  g.hooks.message(why, '#ff6060', 2);
  g.sfx.play('ui.cant_use');
  return true;
}

/**
 * An item ctrl+clicked in the bag with no stash, cube or merchant open: out of the bag onto the
 * ground by the hero, as from the cursor (dropItem), in the camp too. D2R's: D2 1.x drops only what
 * is on the cursor (Rcv0x17_DropItemOnGround, D2Game PlrMsg.cpp:1851-1877). Not by a dead hero,
 * nor the cube or an item this build can't read (refuseDrop, which says why)
 */
export function dropFromBag(g: Game, item: Item): boolean {
  const p = g.player;
  if (p.dead || !g.level || !p.inventory.contains(item) || refuseDrop(g, item)) return false;
  p.inventory.remove(item);
  dropItem(g, item);
  // a charm works from the bag only (Player.activeCharms)
  p.markDirty();
  return true;
}

/**
 * Put `item` in the belt where Diablo II would (items/belt.ts freeBeltColumn): beside its own
 * kind, else a potion D2 belts by itself into an empty column. False, and nothing moved, when there
 * is no such place
 */
export function beltInsert(g: Game, item: Item): boolean {
  const p = g.player;
  const col = freeBeltColumn(p.belt, p.beltRows(), item);
  if (col < 0) return false;
  p.belt[col].push(item);
  return true;
}

/**
 * An item picked up or bought into the belt, where D2 puts one by itself (items/belt.ts
 * autoBeltable: a potion, never a scroll): false, and nothing moved, when it doesn't go there
 */
export function autoBeltInsert(g: Game, item: Item): boolean {
  return autoBeltable(g.player.belt, item) && beltInsert(g, item);
}

/** whether the hero holds `it` where it can be read from: a grid (heldGrids) or the belt */
export function holds(g: Game, it: Item): boolean {
  return heldGrids(g).some((grid) => grid.contains(it)) || g.player.belt.some((c) => c.includes(it));
}

/**
 * Read a scroll or tome the hero holds (tomes.ts readFrom): a tome loses a charge, a scroll is used
 * up, one in the belt too. False when it isn't held or there is nothing left to read
 */
export function readHeld(g: Game, it: Item): boolean {
  if (readFrom(heldGrids(g), it)) return true;
  const col = g.player.belt.find((c) => c.includes(it));
  if (!col || !readable(it)) return false;
  col.splice(col.indexOf(it), 1);
  return true;
}

export function pickupGround(g: Game, gi: GroundItem) {
  const L = g.level;
  const idx = L.ground.indexOf(gi);
  if (idx < 0) return;
  const p = g.player;
  if (gi.gold > 0) {
    p.gold += gi.gold;
    L.ground.splice(idx, 1);
    g.sfx.play('item.gold', { pos: gi.pos });
    g.fx.text(gi.pos, `${gi.gold} 金币`, '#e8d890');
    g.hooks.inventoryChanged();
    return;
  }
  const item = gi.item!;
  const taken = () => {
    L.ground.splice(idx, 1);
    const k = p.unplaced.indexOf(item);
    if (k >= 0) p.unplaced.splice(k, 1);
    g.sfx.play('item.pickup', { pos: gi.pos });
  };
  // a scroll goes into a tome of its kind in the bag with room, a tome's charges into one (the
  // rest stay on it, on the ground), as D2 picks them up (ItemMode.cpp:1173-1191, tomes.ts)
  const tome = isBookScroll(item) ? fillableTome(p.inventory, item) : undefined;
  if (tome && scrollIntoTome(item, tome)) {
    taken();
    g.hooks.message(`${displayName(item)}放进了${displayName(tome)}（${tomeCharges(tome)}/${tomeMax(tome)}）`, '#c8a86a', 1.2);
    g.hooks.inventoryChanged();
    return;
  }
  const merged = isTome(item) ? mergeTome(p.inventory, item) : undefined;
  if (merged) {
    if (merged.gone) taken();
    else g.sfx.play('item.pickup', { pos: gi.pos });
    g.hooks.message(`${displayName(item)}的卷轴并进了背包里的那本（${tomeCharges(merged.into)}/${tomeMax(merged.into)}）`, '#c8a86a', 1.2);
    g.hooks.inventoryChanged();
    return;
  }
  if (autoBeltInsert(g, item) || p.inventory.add(item)) {
    taken();
    // a find worth a word, the first time it's picked up
    const find: HeroLine | null = item.rarity === 'unique' ? 'unique' : item.rarity === 'set' ? 'set_item' : baseOf(item).type === 'rune' ? 'rune' : null;
    if (find && !g.finds.remarked.has(item)) {
      g.finds.remarked.add(item);
      g.say(find);
    }
    g.hooks.inventoryChanged();
  } else {
    g.hooks.message('背包已满', '#ff6060', 1.5);
    g.sfx.play('ui.no_room');
    g.say('bag_full');
  }
}

/** a potion this game has an effect for: healing, mana, rejuvenation (not stamina, antidote, thawing yet) */
export function drinkable(g: Game, item: Item): boolean {
  const b = baseOf(item);
  return b.type === 'potion' && !!(b.heal || b.manaHeal || b.rejuv);
}

export function drink(g: Game, item: Item) {
  const p = g.player;
  const b = baseOf(item);
  // D2's potions: their Misc.txt amount over their length, by the class's share (CharStats
  // HealthPotionPercent / ManaPotionPercent: game/d2/stats.ts potionHeal)
  const cs = charStats(p.cls);
  if (b.heal) {
    const sec = b.healSec ?? 3;
    p.healQueue.push({ perSec: potionHeal(cs, 'life', b.heal) / sec, left: sec });
    g.fx.burst('potion_hp', p.pos);
  }
  if (b.manaHeal) {
    const sec = b.manaSec ?? 3;
    p.manaQueue.push({ perSec: potionHeal(cs, 'mana', b.manaHeal) / sec, left: sec });
    g.fx.burst('potion_mp', p.pos);
  }
  if (b.rejuv) {
    p.life = Math.min(p.stats.maxLife, p.life + p.stats.maxLife * b.rejuv);
    p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.maxMana * b.rejuv);
    g.fx.burst('potion_hp', p.pos);
    g.fx.burst('potion_mp', p.pos);
  }
  g.sfx.play('item.drink', { pos: p.pos });
}

/**
 * The belt's column `col` used (its key, or a right click on it): its bottom item drunk, or a
 * scroll read as from the bag, town portal cast, identify's cursor taken up
 */
export function useBelt(g: Game, col: number) {
  const p = g.player;
  if (p.dead) return;
  const stack = p.belt[col];
  if (!stack) return;
  if (!stack.length) return g.say('no_potion');
  if (isTownPortal(stack[0])) return g.castTownPortal(stack[0]);
  if (stack[0].baseId === 'isc') return g.hooks.identifyWith?.(stack[0]);
  if (!drinkable(g, stack[0])) return;
  const item = stack.shift()!;
  drink(g, item);
  g.hooks.inventoryChanged();
}
