// Durability, Diablo II's way: a weapon wears on the hits it lands, armor when its wearer is struck
// (a piece picked by where the blow lands), at 0 the item is broken and gives nothing until it is
// repaired; indestructible items never wear, self-repairing ones get a point back now and then, and
// ethereal ones can't be repaired. D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit
// d9d394f; SUnitDmg.cpp, Items.cpp and ItemMode.cpp are D2Game's.
import type { EquipSlot } from '../../data/items';
import type { Item } from '../item';
import { d2Base, isArmor, isWeapon, ownType } from './bases';
import { chargedSkills, isRepairable, propTotal, wears, type CostItem } from './cost';
import { roll } from './rand';
import type { Rand } from './types';

/** C integer division, toward zero */
const idiv = (a: number, b: number) => Math.trunc(a / b);

/**
 * Broken: it wears and has no durability left. D2 flags armor broken as it reaches 0
 * (Items.cpp:1695-1699, ItemMode.cpp:5714-5733) and sets a weapon's durability to 0 (Items.cpp:1701-
 * 1720); either way it gives nothing until repaired.
 */
export function isBroken(item: CostItem): boolean {
  return wears(item) && (item.dur ?? item.maxDur ?? 0) <= 0;
}

/** what wearing an item down did: a point lost, or the last one */
export type Wear = 'worn' | 'broke';

/**
 * ITEMS_UpdateDurability (Items.cpp:1649-1735): a weapon or armor piece that wears loses a point on
 * 4% of the calls, armor and throwing weapons on 10%; at 0 it is broken (a broken one stays so)
 */
export function wearDown(item: Item, rng: Rand): Wear | null {
  const b = d2Base(item.baseId);
  const armor = isArmor(b);
  if ((!armor && !isWeapon(b)) || !wears(item)) return null;
  const chance = armor || ownType(b).throwable ? 10 : 4;
  if (roll(rng, 100) >= chance) return null;
  const d = (item.dur ?? item.maxDur ?? 0) - 1;
  if (d > 0) {
    item.dur = Math.min(d, item.maxDur ?? d);
    return 'worn';
  }
  if (d < 0) return null;
  item.dur = 0;
  return 'broke';
}

/**
 * Where a blow lands on the defender's armor, by body location and weight (SUnitDmg.cpp:2285-2294):
 * head 3, torso 5, either arm 4 (only armor wears: a shield, not the weapon), belt, feet and gloves 2
 */
export const STRUCK_WEIGHTS: readonly [EquipSlot, number][] = [
  ['head', 3],
  ['body', 5],
  ['weapon', 4],
  ['offhand', 4],
  ['waist', 2],
  ['feet', 2],
  ['hands', 2],
];

/**
 * The defender's half of SUNITDMG_DrainItemDurability (SUnitDmg.cpp:2341-2372), on a successful
 * melee hit: one worn armor piece by the weights above, counted round from a random location, and
 * it wears down as any item does. A broken piece still takes its share of the blows.
 */
export function struckArmor(equipment: Partial<Record<EquipSlot, Item>>, rng: Rand): { item: Item; wear: Wear | null } | null {
  const items = STRUCK_WEIGHTS.map(([slot]) => {
    const it = equipment[slot];
    return it && isArmor(d2Base(it.baseId)) ? it : undefined;
  });
  const total = STRUCK_WEIGHTS.reduce((s, [, w], i) => s + (items[i] ? w : 0), 0);
  if (!total) return null;
  let i = roll(rng, STRUCK_WEIGHTS.length);
  let w = roll(rng, total);
  do {
    const it = items[i];
    if (it) {
      const weight = STRUCK_WEIGHTS[i][1];
      if (w < weight) return { item: it, wear: wearDown(it, rng) };
      w -= weight;
    }
    i = (i + 1) % STRUCK_WEIGHTS.length;
  } while (w >= 0);
  return null;
}

/**
 * Frames between the points a self-repairing item gets back (item_replenish_durability n): 2500 / n
 * + 1, at least 125 (ItemMode.cpp:4986-5030 sub_6FC4A350), 25 frames a second; 0 when it doesn't
 */
export function replenishFrames(item: CostItem): number {
  const n = propTotal(item, 'rep-dur');
  return n > 0 ? Math.max(idiv(2500, n) + 1, 125) : 0;
}

/**
 * A self-repairing item over `frames` frames, with `carried` frames left from before: a point back
 * each replenishFrames, up to its most. A broken one doesn't mend (ItemMode.cpp:4975-4986). Returns
 * the frames carried to the next call.
 */
export function replenish(item: Item, frames: number, carried = 0): number {
  const every = replenishFrames(item);
  const max = item.maxDur ?? 0;
  if (!every || !wears(item) || isBroken(item) || (item.dur ?? max) >= max) return 0;
  let t = carried + frames;
  let dur = item.dur ?? max;
  while (t >= every && dur < max) {
    dur++;
    t -= every;
  }
  item.dur = dur;
  return dur >= max ? 0 : t;
}

/**
 * D2GAME_NPC_RepairItem (SUnitNpc.cpp:110-145) on an item that can be repaired (cost.ts
 * isRepairable): a throwing stack refilled, every charged skill recharged (ItemMode.cpp:6032-6066),
 * durability to its most (a broken item mended: ItemMode.cpp:5735-5772)
 */
export function repairItem(item: Item): boolean {
  if (!isRepairable(item)) return false;
  const b = d2Base(item.baseId);
  if (ownType(b).throwable && b.stack) item.qty = Math.min(b.stack[1] + propTotal(item, 'stack'), 511);
  for (const c of chargedSkills(item)) if (c.left < c.max) (item.charges ??= {})[c.skill] = c.max;
  if (item.maxDur) item.dur = item.maxDur;
  return true;
}

/**
 * What gold short of a repair's price buys (SUnitNpc.cpp:1849-1867): durability in proportion,
 * paid with all the gold there is; a broken item can't be mended in part. Returns the points
 * mended (0: nothing done).
 */
export function partRepair(item: Item, gold: number, cost: number): number {
  const max = item.maxDur ?? 0;
  const dur = item.dur ?? max;
  if (dur >= max || gold <= 0 || isBroken(item)) return 0;
  const divisor = idiv(cost * 1024, max - dur);
  if (divisor <= 0 || divisor >= gold * 1024) return 0;
  const points = idiv(gold * 1024, divisor);
  item.dur = Math.min(max, dur + points);
  return item.dur - dur;
}
