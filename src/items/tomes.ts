// Diablo II's tomes and their scrolls (Books.txt: a row for Identify, isc and ibk, and one for Town
// Portal, tsc and tbk). A tome holds up to its stack's most of its scrolls as charges (Misc.txt
// maxstack, 20): a scroll dropped on it, bought or picked up while it has room goes in as one, and
// reading it uses one. A scroll is used up when read. D2MOO references are to
// github.com/ThePhrozenKeep/D2MOO at commit d9d394f; ItemMode.cpp is D2Game's.
import { D2_BASES } from './d2/bases';
import type { Grid } from './grid';
import type { Item } from './item';

/** Misc.txt pSpell of the identify and town portal scrolls and tomes */
export const IDENTIFY_SPELL = 1;
export const TOWN_PORTAL_SPELL = 2;

/** a Books.txt row: its scroll's and tome's codes, and the spell both cast */
export interface Book {
  scroll: string;
  tome: string;
  spell: number;
}

/**
 * The Books.txt rows by the codes of their scroll and tome. D2 finds an item's row by its code in
 * ScrollSpellCode or BookSpellCode (sub_6FC54240, ItemsMagic.cpp:790-813); the import keeps only
 * the tomes' CostPerCharge, so the pairs are found by the pSpell each row shares with its two items'
 * Misc.txt rows (1 identify, 2 town portal). A scroll with no tome (the Scroll of Knowledge, the
 * quests' scrolls) has none
 */
const BOOKS = (() => {
  const out = new Map<string, Book>();
  const all = Object.values(D2_BASES);
  const spellOf = (b: (typeof all)[number]) => ('spell' in b ? b.spell : undefined);
  for (const t of all) {
    const spell = spellOf(t);
    if (t.type !== 'book' || !spell) continue;
    const s = all.find((x) => x.type === 'scro' && spellOf(x) === spell);
    if (!s) continue;
    const row = { scroll: s.code, tome: t.code, spell };
    out.set(s.code, row);
    out.set(t.code, row);
  }
  return out;
})();

/** the Books.txt row of a scroll or tome */
export function bookOf(code: string): Book | undefined {
  return BOOKS.get(code);
}

/** a tome (Misc.txt type book) with its scrolls */
export function isTome(it: Item): boolean {
  return bookOf(it.baseId)?.tome === it.baseId;
}

/** a scroll that has a tome */
export function isBookScroll(it: Item): boolean {
  return bookOf(it.baseId)?.scroll === it.baseId;
}

/** a scroll or tome of town portal */
export function isTownPortal(it: Item): boolean {
  return bookOf(it.baseId)?.spell === TOWN_PORTAL_SPELL;
}

/** the charges in a tome (STAT_QUANTITY, unset one as every stack's; never below 0) */
export function tomeCharges(t: Item): number {
  return Math.max(0, t.qty ?? 1);
}

/** the most a tome holds: its stack's most (Misc.txt maxstack; ITEMS_GetTotalMaxStack) */
export function tomeMax(t: Item): number {
  return D2_BASES[t.baseId]?.stack?.[1] ?? 0;
}

/** how many more charges a tome takes */
export function tomeRoom(t: Item): number {
  return Math.max(0, tomeMax(t) - tomeCharges(t));
}

/** whether a scroll or tome can be read now: a scroll always, a tome with a charge left */
export function readable(it: Item): boolean {
  return isBookScroll(it) || (isTome(it) && tomeCharges(it) > 0);
}

/** `n` more charges in a tome, as far as it has room; how many went in */
export function addCharges(t: Item, n: number): number {
  const k = Math.max(0, Math.min(n, tomeRoom(t)));
  t.qty = tomeCharges(t) + k;
  return k;
}

/**
 * The tome in the bag a scroll, or a tome's charges, would go into: the first of its kind with room
 * (INVENTORY_FindFillableBook, D2Common D2Inventory.cpp:1643-1692, which looks only in the
 * backpack's grid)
 */
export function fillableTome(bag: Grid, it: Item): Item | undefined {
  const row = bookOf(it.baseId);
  if (!row) return undefined;
  return bag.items.map((p) => p.item).find((t) => t !== it && t.baseId === row.tome && tomeRoom(t) > 0);
}

/**
 * A scroll dropped on its tome, from the cursor or picked up (sub_6FC49AE0, ItemMode.cpp:4717-4826):
 * one more charge, and the scroll is gone. False when the tome isn't the scroll's or is full
 */
export function scrollIntoTome(scroll: Item, tome: Item): boolean {
  const row = bookOf(scroll.baseId);
  if (!row || row.scroll !== scroll.baseId || row.tome !== tome.baseId) return false;
  return addCharges(tome, 1) === 1;
}

/**
 * A tome picked up while the bag holds one of its kind with room (sub_6FC43BF0, ItemMode.cpp:
 * 1431-1500): its charges go into that one. When they all fit the picked-up tome is gone (one with
 * none left too); else the bag's is filled and the rest stay on the picked-up one, where it lies.
 * Undefined when there is no such tome: it is picked up as anything else
 */
export function mergeTome(bag: Grid, tome: Item): { into: Item; gone: boolean } | undefined {
  if (!isTome(tome)) return undefined;
  const into = fillableTome(bag, tome);
  if (!into) return undefined;
  const have = tomeCharges(tome);
  const moved = addCharges(into, have);
  tome.qty = have - moved;
  return { into, gone: moved === have };
}

/** a belt's columns, each a stack whose first item is the bottom one (Player.belt) */
type Belt = readonly (readonly Item[])[];

/**
 * The town portal the hero would read (the P key): a tome of town portal in the bag with a charge
 * first, then a scroll of it in the bag, then one in the belt, the lowest of the first column that
 * has one. D2 has no one key for it: its hotkeys cast the tome's skill (Book of Townportal) or the
 * scroll's (Scroll of Townportal), and each reads the first such item in the hero's item list, the
 * one held longest, from the bag or the belt alike (SKILLS_SrvDo113_Scroll_Book, D2Game
 * SkillItem.cpp:898-956: node page 1 the bag, read by sub_6FC47D30; 2 the belt, by sub_6FC49220).
 * The one key here takes the tome first, the skill D2's players bind, and a scroll after it, the
 * bag's before the belt's: no list order is kept
 */
export function townPortalFrom(bag: Grid, belt: Belt = []): Item | undefined {
  const items = bag.items.map((p) => p.item);
  const scroll = (it: Item) => isBookScroll(it) && isTownPortal(it);
  return items.find((it) => isTome(it) && isTownPortal(it) && tomeCharges(it) > 0) ?? items.find(scroll) ?? belt.flat().find(scroll);
}

/** how many town portals the hero holds: the bag's scrolls of town portal and its tomes' charges, and the belt's scrolls */
export function townPortalsIn(bag: Grid, belt: Belt = []): number {
  let n = 0;
  for (const { item } of bag.items) if (isTownPortal(item)) n += isTome(item) ? tomeCharges(item) : 1;
  for (const it of belt.flat()) if (isBookScroll(it) && isTownPortal(it)) n++;
  return n;
}

/**
 * Read a scroll or tome held in one of `grids` (sub_6FC47D30, ItemMode.cpp:3809-3885): a tome
 * loses a charge, a scroll is used up. False when it isn't there or there is nothing left to read
 */
export function readFrom(grids: readonly Grid[], it: Item): boolean {
  const g = grids.find((x) => x.contains(it));
  if (!g || !readable(it)) return false;
  if (isTome(it)) it.qty = tomeCharges(it) - 1;
  else g.remove(it);
  return true;
}
