// The camp's vendor, Diablo II's way: its shelves come from the base tables' NPC columns (Charsi's
// weapons and armour, Akara's staves, potions, scrolls and tomes: one stall carries both until
// each has their own, plan A6), stocked at the hero's level + 5, capped by act in Normal; prices
// are D2's transaction cost (d2/cost.ts) with npc.json's multipliers; sold items go back on the
// shelf, and Charsi's repairs mend what is worn. D2MOO references are to
// github.com/ThePhrozenKeep/D2MOO at commit d9d394f; SUnitNpc.cpp and SUnitProxy.cpp are D2Game's.
import { uid } from '../core/math';
import { D2X_LOW_QUALITY } from '../data/d2x/quality';
import type { D2xNpc } from '../data/d2x/types';
import type { EquipSlot } from '../data/items';
import { D2_BASES, ownType } from './d2/bases';
import { chargedSkills, isRepairable, transactionCost, wears, type Transaction } from './d2/cost';
import { isBroken, partRepair, repairItem } from './d2/durability';
import { UNIQUE_BY_ID } from './d2/legendary';
import { roll } from './d2/rand';
import type { D2Base, D2Quality, Difficulty, Rand } from './d2/types';
import { Grid } from './grid';
import { qualityOf, type Item } from './item';
import { makeItem, MATH_RAND } from './make';
import { addCharges, fillableTome, isBookScroll, tomeRoom } from './tomes';

/** who the camp's stall stands in for, in the order their shelves are filled */
export const CAMP_VENDORS: readonly D2xNpc[] = ['charsi', 'akara'];
/** who repairs in Act 1 (SUnitNpc.cpp:1763-1774: Charsi, Fara, Hratli, Halbu, Larzuk) */
export const REPAIRER: D2xNpc = 'charsi';

/** D2's store pages (StorePage.txt): armor, weapons, the weapons that don't fit there, misc */
export type StorePage = 'armo' | 'weap' | 'mag' | 'misc';
const PAGE_ORDER: StorePage[] = ['armo', 'weap', 'mag', 'misc'];
const PAGE_NAME: Record<StorePage, string> = { armo: '防具', weap: '武器', mag: '武器', misc: '杂货' };

/** an item's store page by its own item type (Items.cpp:683-703 ITEMS_GetStorePage), none for gold and the like */
export function storePageOf(code: string): StorePage | undefined {
  const b = D2_BASES[code];
  const s = b && ownType(b)?.store;
  return s === 'armo' || s === 'weap' || s === 'misc' ? s : undefined;
}

/** a page of the stall: an NPC's (misc is one page for all of them) */
export interface StoreTab {
  npc: D2xNpc | null;
  page: StorePage;
  /** D2's store pages are 10 × 10 */
  grid: Grid;
}

/** what pricing needs from the hero: the difficulty, "reduces all vendor prices", the quests done */
export interface TradeCtx {
  difficulty?: Difficulty;
  reduced?: number;
  quests?: ReadonlySet<string>;
}

/** the stall's stock, by tab */
export class Store {
  tabs: StoreTab[] = [];
  /** the tab on show (unset: the first), kept as the tab itself so a page that fills up later doesn't move it */
  selected: StoreTab | null = null;
  /** whose shelf each item is on: its price is that NPC's */
  readonly npcOf = new Map<Item, D2xNpc>();
  /** the items that never sell out (Items.txt PermStoreItem): buying one takes a copy */
  readonly perm = new Set<Item>();

  constructor(readonly npcs: readonly D2xNpc[]) {}

  /** the tabs with something on them, in D2's page order and the stall's NPC order, and their names */
  shown(): { tab: StoreTab; label: string }[] {
    const seen: Record<string, number> = {};
    return this.tabs
      .filter((t) => t.grid.items.length)
      .map((tab) => {
        const name = PAGE_NAME[tab.page];
        seen[name] = (seen[name] ?? 0) + 1;
        return { tab, label: seen[name] > 1 ? `${name} ${seen[name]}` : name };
      });
  }

  /** the tab on show: the one picked while it has anything, else the first */
  current(): StoreTab | undefined {
    const s = this.shown();
    return s.find((x) => x.tab === this.selected)?.tab ?? s[0]?.tab;
  }

  /** the grid on show */
  get grid(): Grid {
    return this.current()?.grid ?? EMPTY;
  }

  private tabFor(npc: D2xNpc, page: StorePage): StoreTab {
    const who = page === 'misc' ? null : npc;
    let t = this.tabs.find((x) => x.npc === who && x.page === page);
    if (!t) {
      t = { npc: who, page, grid: new Grid(10, 10) };
      this.tabs.push(t);
      // an NPC's weapons pages side by side
      const group = (t: StoreTab) => (t.page === 'mag' ? PAGE_ORDER.indexOf('weap') : PAGE_ORDER.indexOf(t.page));
      this.tabs.sort((a, b) => group(a) - group(b) || this.npcs.indexOf(a.npc!) - this.npcs.indexOf(b.npc!) || PAGE_ORDER.indexOf(a.page) - PAGE_ORDER.indexOf(b.page));
    }
    return t;
  }

  /**
   * On the NPC's page for it, where it fits (D2GAME_PlaceItem); a weapon that doesn't goes on the
   * next page (SUnitNpc.cpp:258-276). False when there is no room: D2 drops it
   */
  place(item: Item, npc: D2xNpc): boolean {
    const page = storePageOf(item.baseId);
    if (!page) return false;
    const ok = this.tabFor(npc, page).grid.add(item) || (page === 'weap' && this.tabFor(npc, 'mag').grid.add(item));
    if (ok) this.npcOf.set(item, npc);
    return ok;
  }

  remove(item: Item): boolean {
    for (const t of this.tabs) {
      if (t.grid.remove(item)) {
        this.npcOf.delete(item);
        this.perm.delete(item);
        return true;
      }
    }
    return false;
  }

  contains(item: Item): boolean {
    return this.tabs.some((t) => t.grid.contains(item));
  }

  all(): Item[] {
    return this.tabs.flatMap((t) => t.grid.items.map((p) => p.item));
  }

  /** the NPC that buys the item: one that stocks its base, else one with its page, else the first */
  buyerOf(item: Item): D2xNpc {
    const page = storePageOf(item.baseId);
    const b = D2_BASES[item.baseId];
    return this.npcs.find((n) => b?.shop?.[n]) ?? this.npcs.find((n) => stocksPage(n, page)) ?? this.npcs[0];
  }

  /** the NPC keeps this base for good, so one sold back isn't shelved (SUnitNpc.cpp:667-684) */
  keepsForGood(npc: D2xNpc, code: string): boolean {
    const b = D2_BASES[code];
    return !!(b?.perm && b.spawnable && (b.shop?.[npc]?.max || b.shop?.[npc]?.magicMax));
  }
}

const EMPTY = new Grid(10, 10);

const pagesCache = new Map<D2xNpc, Set<StorePage | undefined>>();
function stocksPage(npc: D2xNpc, page: StorePage | undefined): boolean {
  let s = pagesCache.get(npc);
  if (!s) {
    s = new Set(Object.values(D2_BASES).filter((b) => b.shop?.[npc]).map((b) => storePageOf(b.code)));
    pagesCache.set(npc, s);
  }
  return s.has(page);
}

/**
 * The item level a vendor stocks at (D2GAME_NPC_FillStoreInventory, SUnitNpc.cpp:381-389): the
 * hero's level + 5, in Normal at most 12, 20, 28, 36, 45 by act
 */
export function storeLevel(clvl: number, difficulty: Difficulty = 0, act = 0): number {
  const cap = [12, 20, 28, 36, 45][act];
  return difficulty === 0 && cap !== undefined ? Math.min(clvl + 5, cap) : clvl + 5;
}

/** LowQualityItems.txt "Cracked": a vendor never stocks or sells one back (SUnitNpc.cpp:205-219, 613-620) */
const CRACKED = D2X_LOW_QUALITY.find((q) => q.en === 'Cracked')?.id;
const isCracked = (item: Item) => item.quality === 'low' && item.qualityRow === CRACKED;

/**
 * A base's code for a Nightmare or Hell shop once the hero is past 25 (SUnitNpc.cpp:157-188): an
 * exceptional one now and then (elite in Hell), else its NightmareUpgrade / HellUpgrade
 */
function upgraded(b: D2Base, ilvl: number, difficulty: Difficulty, clvl: number, rng: Rand): string {
  if (difficulty === 0 || clvl <= 25) return b.code;
  const [, uber, ultra] = b.tiers ?? [];
  const r = roll(rng, 100000);
  if (difficulty === 1) {
    if (r < (ilvl << 6) + 4000 && uber && uber !== b.code) return uber;
    return b.upgrade?.[0] ?? b.code;
  }
  let code = b.code;
  if (r < 16 * ilvl + 1000 && ultra && ultra !== b.code) code = ultra;
  else if (r < (ilvl << 7) + 5000 && uber && uber !== b.code) code = uber;
  return b.upgrade?.[1] ?? code;
}

/**
 * D2GAME_NPC_GenerateStoreItem (SUnitNpc.cpp:149-298): the item made at the store's level with
 * the quality asked, a cracked one made again (up to 5 tries), never ethereal, repaired and
 * identified; undefined when it can't be made
 */
function storeItem(code: string, quality: D2Quality, ilvl: number, rng: Rand): Item | undefined {
  for (let i = 0; i < 5; i++) {
    const it = makeItem({ code, ilvl, quality, identified: true, noEth: true, repaired: true }, rng);
    if (!isCracked(it)) return it;
  }
  return undefined;
}

/**
 * A vendor's stock (D2GAME_NPC_FillStoreInventory, SUnitNpc.cpp:371-490, from the item cache
 * SUnitProxy.cpp:906-952): for every base whose NPC columns stock it and whose level the store
 * reaches, min … max of them below store level 25 (inferior on 9% under level 5, superior on 14%
 * from 5 and 25% from 10), and magic ones, magic min … max (one or two more from 25), where the
 * base can be magic and the store reaches its magic level; then one of each permanent item (arrows
 * and bolts as full stacks). Shelves fill in the stall's NPC order; what doesn't fit isn't stocked,
 * and after 33 such the NPC stops.
 */
export function fillStore(npcs: readonly D2xNpc[], clvl: number, difficulty: Difficulty = 0, rng: Rand = MATH_RAND, act = 0): Store {
  const store = new Store(npcs);
  const ilvl = storeLevel(clvl, difficulty, act);
  const bases = Object.values(D2_BASES);
  for (const npc of npcs) {
    let failed = 0;
    /** stock one; false once too many didn't fit (the NPC stops there: SUnitNpc.cpp:438-441) */
    const stock = (b: D2Base, quality: D2Quality, perm = false): boolean => {
      const it = storeItem(upgraded(b, ilvl, difficulty, clvl, rng), quality, ilvl, rng);
      if (it && perm && (b.code === 'aqv' || b.code === 'cqv')) it.qty = b.stack?.[1] ?? it.qty;
      if (it && store.place(it, npc)) {
        if (perm) store.perm.add(it);
      } else failed++;
      return failed <= 32;
    };
    const shelf = bases.filter((b) => b.spawnable && (b.shop?.[npc]?.max || b.shop?.[npc]?.magicMax));
    let full = false;
    fill: for (const b of shelf) {
      if (b.perm || b.qlvl > ilvl) continue;
      const s = b.shop![npc]!;
      const n = ilvl < 25 ? (s.min ?? 0) + roll(rng, (s.max ?? 0) - (s.min ?? 0) + 1) : 0;
      for (let j = 0; j < n; j++) {
        const r = roll(rng, 100);
        const q: D2Quality = ilvl >= 10 ? (r >= 75 ? 'superior' : 'normal') : ilvl >= 5 ? (r > 85 ? 'superior' : 'normal') : r > 90 ? 'low' : 'normal';
        if (!stock(b, q)) {
          full = true;
          break fill;
        }
      }
      if (b.shopMagic && (s.magicLvl ?? 255) <= ilvl) {
        const more = ilvl >= 25 ? roll(rng, 2) + 2 : 1;
        const m = (s.magicMin ?? 0) + roll(rng, more + (s.magicMax ?? 0) - (s.magicMin ?? 0));
        for (let j = 0; j < m; j++) stock(b, 'magic');
      }
    }
    if (!full) for (const b of shelf) if (b.perm && !stock(b, 'normal', true)) break;
  }
  return store;
}

// ───────────────────────── trading ─────────────────────────

/** a price at an NPC (d2/cost.ts transactionCost) */
export function priceAt(item: Item, kind: Transaction, npc: D2xNpc, ctx: TradeCtx = {}): number {
  // an item this build doesn't know has no price (it can't be sold: Item.raw keeps it for a build that does)
  return D2_BASES[item.baseId] ? transactionCost(item, kind, { npc, ...ctx }) : 0;
}

/** what the stall asks for an item on its shelves: its NPC's price */
export function buyPrice(store: Store, item: Item, ctx: TradeCtx = {}): number {
  return priceAt(item, 'buy', store.npcOf.get(item) ?? store.npcs[0], ctx);
}

/** what the stall pays for the hero's item */
export function sellPrice(store: Store | readonly D2xNpc[], item: Item, ctx: TradeCtx = {}): number {
  const s = Array.isArray(store) ? new Store(store) : (store as Store);
  return priceAt(item, 'sell', s.buyerOf(item), ctx);
}

/**
 * What the hero takes home: a permanent item's copy (a new uid), anything else itself, off the shelf
 * (SUNITNPC_RemovePurchasedItemFromStore, SUnitNpc.cpp:898-930, keeps the permanent ones)
 */
export function takeFromStore(store: Store, item: Item): Item {
  if (store.perm.has(item)) return { ...structuredClone(item), uid: uid('i') };
  store.remove(item);
  return item;
}

/**
 * Whether shift + right-click buys more than one (SUNITNPC_BuyItem's multibuy, D2Game SUnitNpc.cpp:1366-1391
 * as D2MOO decompiles it): only of what the NPC keeps for good, its permanent items
 */
export function multibuys(store: Store, item: Item): boolean {
  return store.perm.has(item);
}

/**
 * Buying a scroll while the bag holds a tome of its kind with room (SUNITNPC_BuyItem, D2Game
 * SUnitNpc.cpp:1392-1430 as D2MOO decompiles it, with sub_6FC4B430, ItemMode.cpp:5661-5702): it
 * goes straight into the tome, at the scroll's price. `fill` (shift + right-click) buys as many as
 * the tome has room for and the gold pays for, each at that price, for a permanent scroll
 * (multibuys). Paid from the gold carried, as every purchase at the stall is. The scroll stays on
 * the shelf when it is a permanent one, as all of Akara's are. Null when there is no such tome: it
 * is bought the usual way; n 0 when the gold doesn't stretch to one
 */
export function buyIntoTome(store: Store, scroll: Item, bag: Grid, purse: Purse, ctx: TradeCtx = {}, fill = false): { tome: Item; n: number; spent: number } | null {
  if (!isBookScroll(scroll)) return null;
  const tome = fillableTome(bag, scroll);
  if (!tome) return null;
  const each = buyPrice(store, scroll, ctx);
  const n = Math.min(fill && multibuys(store, scroll) ? Math.floor(purse.gold / each) : purse.gold >= each ? 1 : 0, tomeRoom(tome));
  if (n <= 0 || !pay(purse, n * each, false)) return { tome, n: 0, spent: 0 };
  addCharges(tome, n);
  if (!store.perm.has(scroll)) store.remove(scroll);
  return { tome, n, spent: n * each };
}

/** a stack's most (ITEMS_GetTotalMaxStack: Misc.txt / Weapons.txt maxstack) */
const maxStack = (it: Item) => D2_BASES[it.baseId]?.stack?.[1] ?? 1;

/**
 * Two stacks that are one kind (ITEMS_AreStackablesEqual, D2Common Items.cpp:4350-4385): the same
 * base and quality, a plain one (low, normal or superior), both ethereal or neither
 */
function sameStack(a: Item, b: Item): boolean {
  const plain = (it: Item) => ['low', 'normal', 'superior'].includes(qualityOf(it));
  return a.baseId === b.baseId && qualityOf(a) === qualityOf(b) && plain(a) && plain(b) && !!a.eth === !!b.eth;
}

/**
 * Shift + right-click on a permanent stack of an AutoStack item type (ItemTypes.txt AutoStack:
 * keys, arrows, bolts; SUNITNPC_BuyItem's multibuy, SUnitNpc.cpp:1432-1464 and 1601-1650 as D2MOO
 * decompiles it): priced one at a time (the shelf stack's quantity set to 1), it tops up the first
 * stack of its kind with room, worn (a quiver) before one in the bag (SUNITNPC_FindStackForStorePurchase,
 * 1160-1213), with as many as it has room for and the gold pays for; with no such stack, a new one
 * of as many as a stack holds and the gold pays for goes into the bag. Null when it isn't such an
 * item (it is bought the usual way); n 0 when the gold doesn't stretch to one, or the new stack has
 * no room in the bag
 */
export function buyIntoStack(store: Store, item: Item, worn: readonly Item[], bag: Grid, purse: Purse, ctx: TradeCtx = {}): { stack: Item; n: number; spent: number; added: boolean } | null {
  const b = D2_BASES[item.baseId];
  if (!b?.stack || !ownType(b)?.stacks || !multibuys(store, item)) return null;
  const each = buyPrice(store, { ...item, qty: 1 }, ctx);
  const afford = Math.floor(purse.gold / Math.max(each, 1));
  const kin = [...worn, ...bag.items.map((x) => x.item)].find((it) => sameStack(item, it) && (it.qty ?? 1) < maxStack(it));
  if (kin) {
    const n = Math.min(maxStack(kin) - (kin.qty ?? 1), afford);
    if (n <= 0 || !pay(purse, n * each, false)) return { stack: kin, n: 0, spent: 0, added: false };
    kin.qty = (kin.qty ?? 1) + n;
    return { stack: kin, n, spent: n * each, added: false };
  }
  const n = Math.min(maxStack(item), afford);
  const fresh = { ...takeFromStore(store, item), qty: n };
  if (n <= 0 || !bag.add(fresh)) return { stack: fresh, n: 0, spent: 0, added: false };
  pay(purse, n * each, false);
  return { stack: fresh, n, spent: n * each, added: true };
}

/**
 * Whether a sold item goes on the vendor's shelf (D2GAME_STORES_SellItem, SUnitNpc.cpp:617-655):
 * not cracked, broken, ethereal, socketed with something, or a carry-one unique
 */
export function resellable(item: Item): boolean {
  if (!D2_BASES[item.baseId] || isCracked(item) || isBroken(item) || item.eth || item.socketed.length) return false;
  const u = item.quality === 'unique' && item.uniqueRow !== undefined ? UNIQUE_BY_ID.get(item.uniqueRow) : undefined;
  return !u?.carry1;
}

/**
 * The item sold to the stall goes on its buyer's shelf, repaired with a full stack and identified
 * (SUnitNpc.cpp:657-756), unless that NPC keeps its base for good; false when it isn't shelved
 */
export function shelveSold(store: Store, item: Item): boolean {
  const npc = store.buyerOf(item);
  if (!resellable(item) || store.keepsForGood(npc, item.baseId)) return false;
  if (item.maxDur) item.dur = item.maxDur;
  const b = D2_BASES[item.baseId];
  if (b?.stack) item.qty = b.stack[1];
  item.identified = true;
  return store.place(item, npc);
}

// ───────────────────────── repairs ─────────────────────────

/** what mending an item costs at the repairer (0: nothing to repair) */
export function repairCost(item: Item, ctx: TradeCtx = {}): number {
  return needsRepair(item) ? priceAt(item, 'repair', REPAIRER, ctx) : 0;
}

/**
 * Whether there is anything to repair (SUnitNpc.cpp:1816-1827): it can be repaired and has
 * durability missing, a throwing stack short, or charges used
 */
export function needsRepair(item: Item): boolean {
  if (!isRepairable(item)) return false;
  const b = D2_BASES[item.baseId];
  if (ownType(b).throwable && b.stack && (item.qty ?? 0) < b.stack[1]) return true;
  if (chargedSkills(item).some((c) => c.left < c.max)) return true;
  return wears(item) && (item.dur ?? item.maxDur ?? 0) < (item.maxDur ?? 0);
}

/**
 * Repair all (ITEMS_GetAllRepairCosts, D2Common Items.cpp:4234-4345): the worn items whose durability or
 * throwing stack is short. An item with charges used is left to be repaired on its own, as D2MOO
 * reads the loop over its charged skills
 */
export function repairAllList(equipment: Partial<Record<EquipSlot, Item>>, ctx: TradeCtx = {}): { item: Item; cost: number }[] {
  const out: { item: Item; cost: number }[] = [];
  for (const it of Object.values(equipment)) {
    if (!it || !needsRepair(it) || chargedSkills(it).some((c) => c.left < c.max)) continue;
    out.push({ item: it, cost: priceAt(it, 'repair', REPAIRER, ctx) });
  }
  return out;
}

/** a purse: the gold carried, then the stash's, which repairs may draw on (SUnitNpc.cpp:1832-1842) */
export interface Purse {
  gold: number;
  stashGold: number;
}

/** take `cost` from the purse, carried gold first; false (nothing taken) when it is short */
export function pay(purse: Purse, cost: number, stash = true): boolean {
  if (purse.gold + (stash ? purse.stashGold : 0) < cost) return false;
  const fromBag = Math.min(purse.gold, cost);
  purse.gold -= fromBag;
  purse.stashGold -= cost - fromBag;
  return true;
}

/**
 * Repair one item at the repairer (SUnitNpc.cpp:1805-1872): paid in full it is mended; short of
 * gold, what the carried gold buys of its durability for all of it. Returns the gold spent and
 * whether it was all mended
 */
export function repairOne(item: Item, purse: Purse, ctx: TradeCtx = {}): { spent: number; full: boolean } | null {
  const cost = repairCost(item, ctx);
  if (!cost) return null;
  if (pay(purse, cost)) {
    repairItem(item);
    return { spent: cost, full: true };
  }
  const gold = purse.gold;
  if (partRepair(item, gold, cost)) {
    purse.gold = 0;
    return { spent: gold, full: false };
  }
  return null;
}
