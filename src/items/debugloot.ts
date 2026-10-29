// The debug panel's loot (src/ui/debug.ts): items of the kinds, qualities and item levels it is set
// to. Each is made Diablo II's way (make.ts makeItem), in the quality asked for as D2 makes a quest
// item or a treasure class entry that names one (DropSpec quality), or rolled as a unique monster's
// item is when none is asked for. What the panel picks itself, D2 having no say, is its own and
// says so: the base, rune or gem (evenly among those that fit), ethereal without the 5% roll, and
// sockets punched to a count.
import { pick, randInt } from '../core/math';
import { ALL_BASES, ITEM_BASES, categoryOf, type Category, type ItemBase } from '../data/items';
import { GEMS } from '../data/legendary';
import { D2X_RUNES } from '../data/d2x/socketables';
import { d2Base, itemMaxSockets, ownType } from './d2/bases';
import { pickSetItem, pickUnique } from './d2/legendary';
import { canBeEthereal } from './d2/quality';
import { goldAmount } from './d2/treasure';
import type { Difficulty } from './d2/types';
import { createItem, makeGold, tcQuality } from './gen';
import type { Item, Rarity } from './item';
import { makeItem, MATH_RAND } from './make';

export type LootKind = Category | 'charm' | 'jewel' | 'gold' | 'rune' | 'gem';
export type LootQuality = 'normal' | 'magic' | 'rare' | 'set' | 'unique';

export interface LootSpec {
  /** the item levels, both ends in */
  lo: number;
  hi: number;
  kinds: readonly LootKind[];
  /** none: each item's quality rolled as a unique monster's item's is (Act 1 Uitem A), with `mf` */
  qualities: readonly LootQuality[];
  ethereal: boolean;
  /** sockets punched to this many, as many as the base takes at its item level; 0 leaves them as made */
  sockets: number;
  identified: boolean;
  difficulty: Difficulty;
  mf: number;
}

export interface LootDrop {
  items: Item[];
  /** the kinds that had nothing to make an item of at these settings, one entry an item */
  missed: LootKind[];
  /** the qualities asked for that none of the gear asked for can be made in (set items are never ethereal) */
  unused: LootQuality[];
}

/** the kinds made with a quality, ethereal and sockets; gold, runes and gems are made as they are */
export function takesQuality(kind: LootKind): boolean {
  return kind !== 'gold' && kind !== 'rune' && kind !== 'gem';
}

/** white: what "normal" asks for, as D2 drops it (low, normal or superior) */
const WHITE = new Set<Rarity>(['low', 'normal', 'superior']);
/** how often an item is made again for what only a roll gives: white, or ethereal on a rolled quality */
const TRIES = 40;

function kindOf(b: ItemBase): LootKind | null {
  return b.type === 'charm' || b.type === 'jewel' ? b.type : categoryOf(b.type);
}

/** the kind an item is of, as the panel sorts loot (null: a potion, a tome, …) */
export function lootKindOf(item: Item): LootKind | null {
  const b = ITEM_BASES[item.baseId];
  if (!b) return null;
  return b.type === 'gold' || b.type === 'rune' || b.type === 'gem' ? b.type : kindOf(b);
}

const byKind = new Map<LootKind, ItemBase[]>();
function basesOf(kind: LootKind): ItemBase[] {
  let list = byKind.get(kind);
  if (!list) byKind.set(kind, (list = ALL_BASES.filter((b) => !b.noDrop && kindOf(b) === kind)));
  return list;
}

/** can the base be made in the quality at the item level, and be ethereal and take sockets if asked */
function fits(b: ItemBase, q: LootQuality | null, ilvl: number, s: LootSpec): boolean {
  if (b.qlvl > ilvl) return false;
  const d = d2Base(b.id);
  const t = ownType(d);
  if (q === 'normal' ? t.magicOnly : q && t.normalOnly) return false;
  if (q === 'rare' && !t.canRare) return false;
  // the rows dropQuality would make it of: none and it falls back to rare or magic
  if (q === 'unique' && !pickUnique(d, ilvl, MATH_RAND, { difficulty: s.difficulty })) return false;
  if (q === 'set' && !pickSetItem(d, ilvl, MATH_RAND)) return false;
  if (s.ethereal && !canBeEthereal(d, q ?? 'magic')) return false;
  if (s.sockets && !itemMaxSockets(d, ilvl)) return false;
  return true;
}

/**
 * The runes or gems at the levels (a rune's Misc.txt level, a gem's level to use it: they have no
 * other), or the nearest to them when none is in between
 */
function nearest<T>(rows: readonly T[], lvl: (t: T) => number, lo: number, hi: number): T[] {
  const gap = (r: T) => Math.max(lo - lvl(r), lvl(r) - hi, 0);
  const best = Math.min(...rows.map(gap));
  return rows.filter((r) => gap(r) === best);
}

/** Make `n` items of the spec (fewer when some kind has nothing that fits: `missed`) */
export function debugLoot(s: LootSpec, n: number): LootDrop {
  const lo = Math.max(1, Math.min(99, Math.round(Math.min(s.lo, s.hi))));
  const hi = Math.max(lo, Math.min(99, Math.round(Math.max(s.lo, s.hi))));
  const out: LootDrop = { items: [], missed: [], unused: [] };
  // the bases that fit, by kind, quality and item level; more fit the higher the level
  const memo = new Map<string, ItemBase[]>();
  const candidates = (kind: LootKind, q: LootQuality | null, ilvl: number) => {
    const key = `${kind}/${q}/${ilvl}`;
    let c = memo.get(key);
    if (!c) memo.set(key, (c = basesOf(kind).filter((b) => fits(b, q, ilvl, s))));
    return c;
  };

  const gear = (kind: LootKind): Item | null => {
    // a quality asked for that this kind can be made in at the highest level (charms are never rare)
    const qs = s.qualities.filter((q) => candidates(kind, q, hi).length);
    if (s.qualities.length && !qs.length) return null;
    const q = qs.length ? pick(qs) : null;
    if (!candidates(kind, q, hi).length) return null;
    // a level in the range, up from it until something fits (a set helm, say, only from its row's level)
    let ilvl = randInt(lo, hi);
    while (!candidates(kind, q, ilvl).length) ilvl = randInt(ilvl + 1, hi);
    const bases = candidates(kind, q, ilvl);
    for (let i = 0; i < TRIES; i++) {
      const b = pick(bases);
      const item = makeItem({
        code: b.id,
        ilvl,
        // white is rolled as a normal monster drops it, not made normal: its low and superior come up too
        quality: q === 'normal' ? undefined : (q ?? undefined),
        tc: q ? undefined : tcQuality(2),
        mf: q ? 0 : s.mf,
        difficulty: s.difficulty,
        identified: s.identified || undefined,
        ethereal: s.ethereal,
      });
      if (q === 'normal' ? !WHITE.has(item.rarity) : q && item.rarity !== q) continue;
      // a rolled quality can come up set or low, which are never ethereal
      if (s.ethereal && !item.eth) continue;
      // the panel's own, as many as the base takes at its item level (ITEMS_GetMaxSockets, D2Common
      // Items.cpp:2915-2970) whatever the quality or difficulty: D2 drops sockets only on white items,
      // capped by difficulty (d2/quality.ts maxSockets)
      if (s.sockets) item.sockets = Math.min(s.sockets, itemMaxSockets(d2Base(b.id), ilvl));
      return item;
    }
    return null;
  };

  for (let i = 0; i < n; i++) {
    const kind = pick(s.kinds);
    let item: Item | null;
    if (kind === 'gold') {
      const ilvl = randInt(lo, hi);
      item = makeGold(goldAmount(ilvl, MATH_RAND), ilvl);
    } else if (kind === 'rune') {
      const r = pick(nearest(D2X_RUNES, (x) => x.qlvl, lo, hi));
      item = createItem(r.id, 'normal', Math.max(r.qlvl, randInt(lo, hi)));
    } else if (kind === 'gem') {
      const g = pick(nearest(GEMS, (x) => x.reqLvl, lo, hi));
      item = createItem(g.id, 'normal', randInt(lo, hi));
    } else item = gear(kind);
    if (item) out.items.push(item);
    else out.missed.push(kind);
  }
  const gearAsked = s.kinds.filter(takesQuality);
  if (gearAsked.length) out.unused = s.qualities.filter((q) => !gearAsked.some((k) => candidates(k, q, hi).length));
  return out;
}
