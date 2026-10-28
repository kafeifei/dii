// Diablo II: Resurrected's stash: the hero's own page (Player.stash, with its gold) and the shared
// pages every hero of this browser opens (SharedStash), each 10 × 10 with gold of its own, as D2R's
// are. D2R has three shared pages; this game has five, the user's choice. The shared pages belong to
// the player, not the hero: they are kept on their own beside the heroes' saves (src/game/save.ts
// loadShared, syncShared), and two tabs of the game with two heroes merge their changes to them
// (mergeStash) rather than one writing over the other's. D2 1.x had no shared pages: D2MOO
// references (github.com/ThePhrozenKeep/D2MOO at commit d9d394f) are to its personal stash and its gold.
import { uid } from '../core/math';
import { Grid } from './grid';
import { baseOf, isUnknown, type Item } from './item';

export const STASH_W = 10;
export const STASH_H = 10;
/** the shared pages: D2R has three, this game five */
export const SHARED_PAGES = 5;
/** what the stash panel's tabs say: the hero's own page, then the shared ones */
export const STASH_TABS = ['个人', ...Array.from({ length: SHARED_PAGES }, (_, i) => `共享 ${i + 1}`)];

/**
 * The most gold a page of the stash holds: D2R's, fixed, for the personal page and each shared page
 * alike (its shared stash file keeps gold in each page's header). D2 1.10 grew the personal one with
 * the level (UNITS_GetStashGoldLimit, D2Common Units.cpp:3482-3498)
 */
export const STASH_GOLD_MAX = 2_500_000;

/** the most gold a hero carries: 10,000 a level (UNITS_GetInventoryGoldLimit, Units.cpp:3115-3118) */
export function carryLimit(level: number): number {
  return 10000 * Math.max(1, level);
}

/** how much of `carried` gold a deposit puts in a page holding `banked`: what it has room for (D2Game PlrTrade.cpp:1326-1341) */
export function depositable(carried: number, banked: number): number {
  return Math.max(0, Math.min(carried, STASH_GOLD_MAX - banked));
}

/**
 * How much of a page's `banked` gold a withdrawal hands a hero of `level` carrying `carried`: what
 * they can carry (D2 refuses a withdrawal past it, PlrTrade.cpp:1310-1323; its dialog offers the most)
 */
export function withdrawable(banked: number, carried: number, level: number): number {
  return Math.max(0, Math.min(banked, carryLimit(level) - carried));
}

/**
 * Why an item can't go in a shared page; null when it can. D2R keeps quest items out (their
 * Misc/Weapons/Armor.txt quest column: the Horadric Cube, Wirt's Leg, the staff's parts…), and an
 * item this build doesn't know may be one
 */
export function sharedBlock(it: Item): string | null {
  if (isUnknown(it)) return '认不出的物品不能放进共享储物箱';
  if (baseOf(it)?.quest) return '任务物品不能放进共享储物箱';
  return null;
}

/** the shared pages and each one's gold, as this tab has them */
export class SharedStash {
  readonly pages: Grid[] = Array.from({ length: SHARED_PAGES }, () => new Grid(STASH_W, STASH_H));
  /** each page's gold, up to STASH_GOLD_MAX, by page */
  gold: number[] = Array<number>(SHARED_PAGES).fill(0);
  /** why they can't be changed this time (a newer build's, a hero that won't be saved), or null */
  readOnly: string | null = null;

  /** every item in the pages */
  items(): Item[] {
    return this.pages.flatMap((g) => g.items.map((p) => p.item));
  }
}

// ── two tabs at once: each one's changes merged onto the other's ──

/** an item of the shared pages, where it lies and as it is (its JSON, to tell a change) */
export interface StashEntry {
  item: Item;
  page: number;
  x: number;
  y: number;
  json: string;
  /** its JSON but for the durability, which mending raises in every tab that has the page (Player.mendItems) */
  core: string;
  /** its durability then (the item itself may have mended since) */
  dur: number;
}

/** a state of the shared pages: their items by uid, and each page's gold */
export interface StashState {
  entries: Map<string, StashEntry>;
  gold: number[];
}

export function stashEntry(item: Item, page: number, x: number, y: number): StashEntry {
  return { item, page, x, y, json: JSON.stringify(item), core: JSON.stringify({ ...item, dur: undefined }), dur: item.dur ?? 0 };
}

/** the item itself changed (socketed, identified, a tome read…); a mend alone isn't, durability lost is */
export function changed(a: StashEntry, b: StashEntry): boolean {
  return a.core !== b.core || a.dur < b.dur;
}

/** moved or changed, mended too: what has to be written */
function touched(a: StashEntry, b: StashEntry): boolean {
  return a.page !== b.page || a.x !== b.x || a.y !== b.y || a.json !== b.json;
}

/**
 * `a`, mended as far as `b` was since `base`: two tabs mending one self-repairing item keep the more
 * mended, not two of it. Not when `a` lost durability itself (that is a change of its own)
 */
function withMend(a: StashEntry, b: StashEntry | undefined, base: StashEntry | undefined): StashEntry {
  if (b && b.dur > a.dur && (!base || a.dur >= base.dur)) a.item.dur = b.dur;
  return a;
}

/**
 * The pages as they are. Items go by uid: one without, or with another's, is given its own (a save
 * is read as it is), so no two collapse into one
 */
export function stashState(s: SharedStash): StashState {
  const entries = new Map<string, StashEntry>();
  s.pages.forEach((g, page) => {
    for (const pl of g.items) {
      if (!pl.item.uid || entries.has(pl.item.uid)) pl.item.uid = uid('i');
      entries.set(pl.item.uid, stashEntry(pl.item, page, pl.x, pl.y));
    }
  });
  // a copy: the pages' gold changes in place
  return { entries, gold: [...s.gold] };
}

/** whether two states hold the same items in the same places, and the same gold */
export function sameState(a: StashState, b: StashState): boolean {
  if (a.gold.length !== b.gold.length || a.gold.some((g, i) => g !== b.gold[i]) || a.entries.size !== b.entries.size) return false;
  for (const [id, e] of a.entries) {
    const f = b.entries.get(id);
    if (!f || touched(e, f)) return false;
  }
  return true;
}

/** a merge's outcome */
export interface StashMerge {
  /** what stays as the other tab left it */
  keep: StashEntry[];
  /** what this tab moved, changed or put in: laid out after the rest, it gives way where both want a spot */
  mine: StashEntry[];
  /** each page's gold */
  gold: number[];
  /** gold this tab put in past a page's most: it goes back to the hero */
  refund: number;
}

/**
 * Another tab wrote the shared pages since this one last read them (`base`): this tab's changes
 * since then (`ours`) go onto what that tab left (`theirs`), a three-way merge by item. What one
 * tab took out and the other left as it was is gone; what one moved or changed is as that one has
 * it; what either put in stays; what both mended is as the more mended. Where both changed the same
 * item, or one took out what the other changed, it is kept rather than lost, even as two of it, the
 * second with a uid of its own: a dupe over a loss. Each page's gold: theirs, and what this tab put
 * in or took out
 */
export function mergeStash(base: StashState, ours: StashState, theirs: StashState): StashMerge {
  const keep: StashEntry[] = [];
  const mine: StashEntry[] = [];
  for (const [id, t] of theirs.entries) {
    const b = base.entries.get(id);
    const o = ours.entries.get(id);
    if (o && b && touched(o, b)) {
      // only moved (or mended) here, changed there: theirs, where this tab put it
      if (!changed(o, b) && changed(t, b)) mine.push({ ...withMend(t, o, b), page: o.page, x: o.x, y: o.y });
      else mine.push(withMend(o, t, b));
      // changed both ways: theirs too, as another item
      if (changed(o, b) && changed(t, b) && changed(t, o)) {
        t.item.uid = uid('i');
        keep.push(t);
      }
      continue;
    }
    if (!o && b) {
      // taken out here: gone, unless changed there, then kept as another item (this tab's hero has its uid)
      if (!changed(t, b)) continue;
      t.item.uid = uid('i');
      keep.push(t);
      continue;
    }
    // as they have it: our own object where only their mending tells the two apart, so what this tab shows stays itself
    if (o && o.core === t.core && o.page === t.page && o.x === t.x && o.y === t.y && t.dur >= o.dur) keep.push(withMend(o, t, b));
    else keep.push(withMend(t, o, b));
  }
  for (const [id, o] of ours.entries) {
    if (theirs.entries.has(id)) continue;
    const b = base.entries.get(id);
    if (!b) mine.push(o);
    else if (changed(o, b)) {
      // changed here, taken out there (to a hero, who has it by this uid): kept as another item
      o.item.uid = uid('i');
      mine.push(o);
    }
  }
  let refund = 0;
  const gold = theirs.gold.map((g, i) => {
    const put = (ours.gold[i] ?? 0) - (base.gold[i] ?? 0);
    let n = g + put;
    // over the page's most with gold put in here: that goes back (theirs alone may be over it, a later build's)
    if (put > 0 && n > STASH_GOLD_MAX) {
      const back = Math.min(put, n - Math.max(STASH_GOLD_MAX, g));
      n -= back;
      refund += back;
    }
    return Math.max(0, n);
  });
  return { keep, mine, gold, refund };
}

/**
 * Lay items out on the pages, emptied first: each where it was, else anywhere on its page, else on
 * any page; `first` before `then`. Returns what fits nowhere, for the caller to hand the hero
 */
export function layOut(s: SharedStash, first: StashEntry[], then: StashEntry[] = []): Item[] {
  for (const g of s.pages) g.items = [];
  const later: StashEntry[] = [];
  for (const e of [...first, ...then]) {
    const g = s.pages[e.page];
    if (g && g.canPlace(e.item, e.x, e.y)) g.place(e.item, e.x, e.y);
    else later.push(e);
  }
  const out: Item[] = [];
  for (const e of later) {
    const g = s.pages[e.page];
    if (!g?.add(e.item) && !s.pages.some((p) => p.add(e.item))) out.push(e.item);
  }
  return out;
}
