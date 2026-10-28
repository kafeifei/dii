// Diablo II's belt: what it holds and which column a new one goes in, as D2Common has it (D2MOO at
// d9d394f: ITEMS_CheckIfBeltable, Items.cpp:1600-1620; ITEMS_ComparePotionTypes, 1624-1734; INVENTORY_GetFreeBeltSlot,
// D2Inventory.cpp:1739-1803). Picking up, buying, shift+clicking from the bag and a corpse taken back
// all put an item in by it (Game.beltInsert). The hero's belt is four columns, each a stack whose
// first item is the bottom one, the next used (Player.belt).
import type { D2xMisc } from '../data/d2x/types';
import { D2_BASES, ownType } from './d2/bases';
import type { Item } from './item';

/** what one column holds of a kind besides the same item: healing potions of any size, mana potions, rejuvenation ones */
const KINDS: readonly (readonly string[])[] = [
  ['hp1', 'hp2', 'hp3', 'hp4', 'hp5'],
  ['mp1', 'mp2', 'mp3', 'mp4', 'mp5'],
  ['rvs', 'rvl'],
];

/**
 * Whether it goes in the belt at all (ITEMS_CheckIfBeltable: its item type's Beltable, ItemTypes.txt):
 * potions and scrolls, one cell in size
 */
export function beltable(it: Item): boolean {
  const b = D2_BASES[it.baseId];
  return !!b && !!ownType(b)?.beltable && b.w === 1 && b.h === 1;
}

/** Misc.txt autobelt: it may start a column of its own (the potions D2 belts by itself; not a scroll) */
function autoBelt(it: Item): boolean {
  return !!(D2_BASES[it.baseId] as D2xMisc | undefined)?.autobelt;
}

/** two items one column takes together (ITEMS_ComparePotionTypes): the same base, or of one kind (KINDS) */
export function beltKin(a: Item, b: Item): boolean {
  return a.baseId === b.baseId || KINDS.some((k) => k.includes(a.baseId) && k.includes(b.baseId));
}

/**
 * The column a new `it` goes in, `rows` high (INVENTORY_GetFreeBeltSlot): the first whose bottom
 * item is its kind (beltKin) with room; else, for an item D2 belts by itself (Misc.txt autobelt:
 * the potions it heals, mana and rejuvenation with), the first empty one. A scroll, or a stamina,
 * antidote or thawing potion, starts no column of its own: put in the belt by hand first. -1: none
 */
export function freeBeltColumn(belt: readonly (readonly Item[])[], rows: number, it: Item): number {
  if (!beltable(it)) return -1;
  const kin = belt.findIndex((c) => c.length > 0 && c.length < rows && beltKin(it, c[0]));
  if (kin >= 0 || !autoBelt(it)) return kin;
  return belt.findIndex((c) => c.length === 0);
}
