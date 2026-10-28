// Diablo II's belt: what it holds and which column a new one goes in, as D2Common has it (D2MOO at
// d9d394f: ITEMS_CheckIfBeltable, Items.cpp:1600-1620; ITEMS_ComparePotionTypes, 1624-1734; INVENTORY_GetFreeBeltSlot,
// D2Inventory.cpp:1739-1803). Shift+clicking from the bag and a corpse taken back put an item in by
// it (Game.beltInsert); picking up and buying only what D2 belts by itself (autoBeltable,
// Game.autoBeltInsert); by hand, anything it holds goes in the column clicked (placeInColumn). The
// hero's belt is four columns, each a stack whose first item is the bottom one, the next used
// (Player.belt).
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

/** the scrolls INVENTORY_HasSimilarPotionInBelt leaves out by their codes (D2Inventory.cpp:1719): identify's and town portal's */
const NOT_SIMILAR: ReadonlySet<string> = new Set(['isc', 'tsc']);

/**
 * Whether a pickup or a purchase puts it in the belt by itself (ITEMS_CheckIfAutoBeltable, D2Common
 * Items.cpp:1737-1745, asked before INVENTORY_PlaceItemInFreeBeltSlot by a pickup, D2Game
 * ItemMode.cpp:1226, and a purchase, SUnitNpc.cpp:1511): belt-able, and either an item D2 belts by
 * itself (Misc.txt autobelt) or one whose kind is at the bottom of a column already
 * (INVENTORY_HasSimilarPotionInBelt, D2Inventory.cpp:1714-1736), which leaves the scrolls of
 * identify and town portal out by name (1719). As D2MOO decompiles it, ITEMS_CheckIfAutoBeltable
 * compares that function's TRUE or FALSE with -1 (Items.cpp:1744), which is always true: every
 * belt-able item, a scroll too, would go in beside its kind. The scrolls left out by name say what
 * was meant, and that is followed here: a scroll goes in the belt only by shift+click or by hand
 */
export function autoBeltable(belt: readonly (readonly Item[])[], it: Item): boolean {
  if (!beltable(it)) return false;
  return autoBelt(it) || (!NOT_SIMILAR.has(it.baseId) && belt.some((c) => c.length > 0 && beltKin(it, c[0])));
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

/**
 * `it` put on column `col` by hand, the column `rows` high (D2Game Rcv0x23_ItemToBelt, PlrMsg.cpp:
 * 2397-2424, to sub_6FC48940, ItemMode.cpp:4138-4228, and INVENTORY_PlaceItemInBeltSlot, D2Common
 * D2Inventory.cpp:1695-1711): any item the belt holds goes in the slot clicked, whatever kind the
 * column holds already; here on top of the column. False, and nothing moved, when the belt doesn't
 * hold it or the column is full
 */
export function placeInColumn(belt: Item[][], rows: number, col: number, it: Item): boolean {
  const c = belt[col];
  if (!c || !beltable(it) || c.length >= rows) return false;
  c.push(it);
  return true;
}
