// An item drop's quality, D2's way: the treasure class roll (ItemRatio.txt, magic find, the TC's
// quality ratios), then what making the item does to it (a unique with no row to make becomes rare,
// a set item magic, …), its durability, ethereal and sockets. Affixes, names and stats come after.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { D2X_ITEM_RATIO } from '../../data/d2x/itemratio';
import { D2X_LOW_QUALITY, D2X_QUALITY } from '../../data/d2x/quality';
import { D2X_SET_ITEMS } from '../../data/d2x/sets';
import type { D2xItemRatio, D2xQualityMod, D2xSetItem, D2xUnique } from '../../data/d2x/types';
import { D2X_UNIQUES } from '../../data/d2x/uniques';
import { d2Base, hasDurability, isArmor, isWeapon, ownType } from './bases';
import type { D2Base, D2Quality, Difficulty, Rand } from './types';

/** D2's ITEMS_RollLimitedRandomNumber: 0 … n − 1, and 0 when n ≤ 0 */
export function roll(rng: Rand, n: number): number {
  return n > 0 ? Math.floor(rng.next() * n) : 0;
}

/** C integer division: D2's level differences can be negative, and it truncates toward zero */
const idiv = (a: number, b: number) => Math.trunc(a / b);

/**
 * A treasure class's quality ratios: its Unique, Set, Rare and Magic columns, out of 1024. Down a
 * chain of TCs D2 keeps the higher of the parent's and the child's, a parent's 0 taking the
 * child's (D2MOO D2Game Items.cpp:2244-2260); the TC evaluator passes the result.
 */
export interface TcQuality {
  unique?: number;
  set?: number;
  rare?: number;
  magic?: number;
}

export interface QualityRoll {
  /** base code */
  code: string;
  /** the dropping monster's level (Items.cpp:1624-1645) */
  ilvl: number;
  /** the killer's magic find %, a minion's plus its owner's (Items.cpp:2334-2342) */
  mf?: number;
  tc?: TcQuality;
}

/**
 * The ItemRatio.txt row for a base (D2Common ItemsTbls.cpp:1361-1388): by Uber, exceptional or
 * elite weapons and armor that aren't quest items or throwing potions (Items.cpp:1168-1184), and
 * Class Specific, an own item type with a Class (Items.cpp:3517-3535). D2X_ITEM_RATIO holds the
 * Version 1 (expansion) rows only, the latest version D2 takes.
 */
export function itemRatio(b: D2Base): D2xItemRatio {
  const uber = (isWeapon(b) || isArmor(b)) && !b.quest && b.type !== 'tpot' && (b.tier ?? 0) > 0;
  const cls = !!ownType(b).cls;
  const row = D2X_ITEM_RATIO.find((r) => r.uber === uber && r.cls === cls);
  if (!row) throw new Error(`no item ratio row for ${b.code}`);
  return row;
}

/**
 * Each step's "chance" in D2GAME_DropTC (Items.cpp:2319-2451): the step succeeds when
 * roll(chance) < 128, always when chance ≤ 0; null is a step that doesn't happen.
 */
export interface QualityChances {
  unique: number | null;
  set: number | null;
  rare: number | null;
  magic: number | null;
  superior: number;
  normal: number;
}

type Ratio = { ratio: number; div: number; min: number };

/** magic find after diminishing returns, as D2 divides by it: 100 + effective MF */
const DIMINISH = {
  // 250 × MF / (MF + 250) (Items.cpp:2350)
  unique: (m: number) => idiv(50 * (5 * m - 500), m + 150) + 100,
  // 500 × MF / (MF + 500) (Items.cpp:2369)
  set: (m: number) => idiv(100 * (5 * m - 500), m + 400) + 100,
  // 600 × MF / (MF + 600) (Items.cpp:2390)
  rare: (m: number) => idiv(200 * (3 * m - 300), m + 500) + 100,
};

/**
 * (Ratio − (ilvl − qlvl) / Divisor) × 128, divided by the magic find, at least Min, then lowered by
 * the TC's ratio (Items.cpp:2346-2359 and the same for set, rare, magic). Magic find above 10%
 * diminishes for unique, set and rare; magic items take it whole (Items.cpp:2416-2418).
 */
function chanceOf(r: Ratio, diff: number, mf: number, tc: number, diminish?: (m: number) => number): number {
  const x = r.ratio - idiv(diff, r.div);
  let base = x << 7;
  if (mf !== 0) {
    const m = mf + 100;
    const d = diminish && m > 110 ? diminish(m) : m;
    if (d) base = idiv(12800 * x, d);
  }
  base = Math.max(base, r.min);
  return base - idiv(base * tc, 1024);
}

export function qualityChances(q: QualityRoll): QualityChances {
  const b = d2Base(q.code);
  const t = ownType(b);
  const row = itemRatio(b);
  const diff = q.ilvl - b.qlvl;
  const mf = q.mf ?? 0;
  const tc = q.tc ?? {};
  // superior and normal take neither magic find nor the TC (Items.cpp:2435, 2442)
  const out: QualityChances = {
    unique: null,
    set: null,
    rare: null,
    magic: null,
    superior: (row.superior.ratio - idiv(diff, row.superior.div)) << 7,
    normal: (row.normal.ratio - idiv(diff, row.normal.div)) << 7,
  };
  // magic find of −100% or less skips everything magic or better (Items.cpp:2344)
  if (mf === 0 || mf > -100) {
    out.unique = chanceOf(row.unique, diff, mf, tc.unique ?? 0, DIMINISH.unique);
    out.set = chanceOf(row.set, diff, mf, tc.set ?? 0, DIMINISH.set);
    // rare only for types with Rare (Items.cpp:2385); Magic types are always magic (2408-2411)
    if (t.canRare) out.rare = chanceOf(row.rare, diff, mf, tc.rare ?? 0, DIMINISH.rare);
    out.magic = t.magicOnly ? 0 : chanceOf(row.magic, diff, mf, tc.magic ?? 0);
  }
  return out;
}

const hits = (rng: Rand, chance: number | null) => chance !== null && (chance <= 0 || roll(rng, chance) < 128);

/**
 * The quality the treasure class drops the base with (D2GAME_DropTC, Items.cpp:2316-2451), in D2's
 * order: unique, set, rare, magic, superior, normal, else low. Normal types (potions, gems, runes)
 * are always normal (2319-2322). Quest items: Magic types are unique (2323-2326; D2 also makes its
 * items.txt "unique" quest items unique, which quest code passes as the quality), the rest normal
 * as ITEMS_RollItemQuality has it (Items.cpp:446-449).
 */
export function rollQuality(q: QualityRoll, rng: Rand): D2Quality {
  const b = d2Base(q.code);
  const t = ownType(b);
  if (t.normalOnly) return 'normal';
  if (b.quest) return t.magicOnly ? 'unique' : 'normal';
  const c = qualityChances(q);
  if (hits(rng, c.unique)) return 'unique';
  if (hits(rng, c.set)) return 'set';
  if (hits(rng, c.rare)) return 'rare';
  if (hits(rng, c.magic)) return 'magic';
  if (hits(rng, c.superior)) return 'superior';
  if (hits(rng, c.normal)) return 'normal';
  return 'low';
}

const ROLLED: D2Quality[] = ['unique', 'set', 'rare', 'magic', 'superior', 'normal', 'low'];

/** the exact odds of each rollQuality result, for tests and the debug panel */
export function qualityOdds(q: QualityRoll): Partial<Record<D2Quality, number>> {
  const b = d2Base(q.code);
  const t = ownType(b);
  if (t.normalOnly || (b.quest && !t.magicOnly)) return { normal: 1 };
  if (b.quest) return { unique: 1 };
  const c = qualityChances(q);
  const p = (chance: number | null) => (chance === null ? 0 : chance <= 0 ? 1 : Math.min(128, chance) / chance);
  const steps = [c.unique, c.set, c.rare, c.magic, c.superior, c.normal];
  const out: Partial<Record<D2Quality, number>> = {};
  let left = 1;
  steps.forEach((chance, i) => {
    out[ROLLED[i]] = left * p(chance);
    left -= out[ROLLED[i]]!;
  });
  out.low = left;
  return out;
}

// ───────────────────────── making the item ─────────────────────────

export interface DropSpec extends QualityRoll {
  difficulty?: Difficulty;
  /**
   * Make it with this quality instead of rolling one: D2's pItemDrop->nQuality (ItemMode.cpp:6347-6351),
   * for quest items, a TC entry that names a unique or set item, and cube outputs
   */
  quality?: D2Quality;
  /** with a unique or set quality: this UniqueItems / SetItems row when it is one that fits (ItemMode.cpp:6611-6614) */
  row?: number;
  /**
   * Unique rows already dropped in this game: D2 drops each unique once a game, quest items aside
   * (Items.cpp:67-112, ItemMode.cpp:6639); a unique made here is added. Left out, no limit.
   */
  dropped?: Set<number>;
  /** a hell bovine's drop: only they drop Cow King's Leathers (ItemsMagic.cpp:840) */
  hellBovine?: boolean;
}

export interface QualityDrop {
  /** low, normal or superior as made; magic and rare still fall back if no affixes fit (affix stage) */
  quality: D2Quality;
  identified: boolean;
  uniqueRow?: number;
  setRow?: number;
  /** a superior item's QualityItems row, a low quality item's LowQualityItems row */
  qualityRow?: number;
  dur?: number;
  maxDur?: number;
  eth?: true;
  sockets: number;
}

const MAGIC_OR_BETTER = new Set<D2Quality>(['magic', 'set', 'rare', 'unique', 'crafted']);

/** what making the item does to a quality before anything is rolled (ItemMode.cpp:6354-6379) */
function settle(q: D2Quality, b: D2Base): D2Quality {
  const t = ownType(b);
  if (t.magicOnly) {
    if (b.quest) q = 'unique';
    else if (!MAGIC_OR_BETTER.has(q)) q = 'magic';
  }
  if (!t.canRare && q === 'rare') q = 'magic';
  if (t.normalOnly) q = 'normal';
  return q;
}

function weighted<T extends { rarity: number }>(rows: T[], rng: Rand): T | undefined {
  // a rarity of 0 counts as 1 (ItemMode.cpp:6620, ItemsMagic.cpp:849-852)
  const w = (r: T) => Math.max(r.rarity, 1);
  let n = roll(rng, rows.reduce((s, r) => s + w(r), 0));
  for (const r of rows) {
    if (n < w(r)) return r;
    n -= w(r);
  }
  return undefined;
}

/**
 * The unique to make (ItemMode.cpp:6597-6670, the expansion branch): a spawnable row on this base
 * with lvl ≤ ilvl, picked by rarity; none, or one already dropped this game, and it isn't unique.
 */
export function pickUnique(b: D2Base, ilvl: number, rng: Rand, row?: number, dropped?: Set<number>): D2xUnique | undefined {
  const fits = D2X_UNIQUES.filter((u) => u.spawnable && u.code === b.code && u.lvl <= ilvl);
  if (!fits.length) return undefined;
  const u = fits.find((f) => f.id === row) ?? weighted(fits, rng);
  if (!u || (!b.quest && dropped?.has(u.id))) return undefined;
  dropped?.add(u.id);
  return u;
}

/** the set item to make (ItemsMagic.cpp:817-893): a row on this base with lvl ≤ ilvl, picked by rarity */
export function pickSetItem(b: D2Base, ilvl: number, rng: Rand, row?: number, hellBovine = false): D2xSetItem | undefined {
  const fits = D2X_SET_ITEMS.filter(
    (s) => s.spawnable && s.code === b.code && s.lvl <= ilvl && (s.set !== "Cow King's Leathers" || hellBovine),
  );
  if (!fits.length) return undefined;
  return fits.find((f) => f.id === row) ?? weighted(fits, rng);
}

// D2's exact own-type checks next to the weapon and armor flags (D2Common ItemMods.cpp:2735-2766)
const NOT_PLAIN_WEAPON = new Set(['staf', 'bow', 'xbow', 'scep', 'wand']);
const NOT_PLAIN_ARMOR = new Set(['shie', 'boot', 'glov', 'belt']);
const OWN_TYPES: [D2xQualityMod['on'][number], string][] = [
  ['shield', 'shie'],
  ['scepter', 'scep'],
  ['wand', 'wand'],
  ['staff', 'staf'],
  ['bow', 'bow'],
  ['bow', 'xbow'],
  ['boots', 'boot'],
  ['gloves', 'glov'],
  ['belt', 'belt'],
];

/** ITEMMODS_CanItemBeHighQuality (ItemMods.cpp:2735-2766) */
export function superiorFits(m: D2xQualityMod, b: D2Base): boolean {
  const on = new Set(m.on);
  if (on.has('weapon') && isWeapon(b) && !NOT_PLAIN_WEAPON.has(b.type)) return true;
  if (on.has('armor') && isArmor(b) && !NOT_PLAIN_ARMOR.has(b.type)) return true;
  return OWN_TYPES.some(([k, type]) => on.has(k) && b.type === type);
}

/**
 * A superior item's QualityItems row (ItemsMagic.cpp:959-1019): throwing weapons and bases without
 * durability only roll the first 4 rows (no durability mods). D2 rerolls among rows it hasn't
 * tried until one fits, which is a uniform pick among the ones that fit.
 */
export function pickSuperior(b: D2Base, rng: Rand): D2xQualityMod | undefined {
  const rows = ownType(b).throwable || b.noDur ? D2X_QUALITY.slice(0, 4) : D2X_QUALITY;
  const fits = rows.filter((m) => superiorFits(m, b));
  return fits.length ? fits[roll(rng, fits.length)] : undefined;
}

/** a new item's durability: up to half off its base's (Items.cpp:656-658, 684-686) */
function newDurability(b: D2Base, rng: Rand): { dur: number; maxDur: number } {
  const maxDur = Math.min(b.dur!, 255);
  const half = b.dur! >> 1;
  return { dur: Math.min(roll(rng, half) + half, 255), maxDur };
}

const SOCKET_CAP: Record<Difficulty, number> = { 0: 3, 1: 4, 2: 6 };

/** the most sockets a base can roll at an item level (D2Common Items.cpp:2916-2950) and difficulty (D2Game Items.cpp:174-186) */
export function maxSockets(b: D2Base, ilvl: number, difficulty: Difficulty = 0): number {
  const t = ownType(b);
  const lv = Math.max(ilvl, 1);
  const byLvl = t.sockets[lv > t.socketLvls[1] ? 2 : lv > t.socketLvls[0] ? 1 : 0];
  return Math.min(b.sockets ?? 0, byLvl, SOCKET_CAP[difficulty]);
}

/**
 * Quality and what goes with it for a new item: the TC roll or a given quality, then
 * ItemMode.cpp sub_6FC4C5F0 (6322-6812) and its end (6274-6292): low and superior fall back to
 * normal when they don't apply, a unique with no row to make becomes rare with 3× durability
 * (6689-6700), a set item magic with 2× (6787-6798); then ethereal, then sockets.
 */
export function dropQuality(spec: DropSpec, rng: Rand): QualityDrop {
  const b = d2Base(spec.code);
  const out: QualityDrop = { quality: settle(spec.quality ?? rollQuality(spec, rng), b), identified: false, sockets: 0 };
  const durable = hasDurability(b);
  if (durable) Object.assign(out, newDurability(b, rng));
  const scaleDur = (k: number) => {
    if (!durable) return;
    out.dur = Math.min(k * out.dur!, 255);
    out.maxDur = Math.min(k * out.maxDur!, 255);
  };

  switch (out.quality) {
    case 'low':
      // weapons and armor only (ItemsMagic.cpp:1022-1082); a third of the base's durability
      if (isWeapon(b) || isArmor(b)) {
        out.qualityRow = D2X_LOW_QUALITY[roll(rng, D2X_LOW_QUALITY.length)].id;
        if (durable) {
          const maxDur = Math.max(Math.floor(b.dur! / 3), 1);
          out.maxDur = maxDur;
          out.dur = Math.max(roll(rng, maxDur >> 1) + (maxDur >> 1), 1);
        }
      } else out.quality = 'normal';
      break;
    case 'superior': {
      const m = pickSuperior(b, rng);
      if (m) out.qualityRow = m.id;
      else out.quality = 'normal';
      break;
    }
    case 'unique': {
      const u = pickUnique(b, spec.ilvl, rng, spec.row, spec.dropped);
      if (u) out.uniqueRow = u.id;
      else {
        scaleDur(3);
        out.quality = 'rare';
      }
      break;
    }
    case 'set': {
      const s = pickSetItem(b, spec.ilvl, rng, spec.row, spec.hellBovine);
      if (s) out.setRow = s.id;
      else {
        scaleDur(2);
        out.quality = 'magic';
      }
      break;
    }
    default:
      break;
  }
  // magic, rare, set and unique are made unidentified (ItemMode.cpp:6651, ItemsMagic.cpp:537, 889, Items.cpp:161)
  out.identified = out.quality === 'low' || out.quality === 'normal' || out.quality === 'superior';

  // 5% ethereal: weapons and armor with durability, not low quality, set or quest (Items.cpp:228-260):
  // half the most durability plus one, and full
  if (
    durable &&
    (isWeapon(b) || isArmor(b)) &&
    out.quality !== 'low' &&
    out.quality !== 'set' &&
    !b.quest &&
    roll(rng, 100) < 5
  ) {
    out.eth = true;
    out.maxDur = Math.floor(out.maxDur! / 2) + 1;
    out.dur = out.maxDur;
  }

  if (out.quality === 'normal' || out.quality === 'superior') out.sockets = rollSockets(b, spec.ilvl, spec.difficulty, rng);
  return out;
}

/**
 * A normal or superior item's sockets, not on stacks (Items.cpp:166-224; called for qualities up
 * to superior, ItemMode.cpp:6287-6290): a third of them get 1 to the most. D2 takes the count from
 * the item's start seed, a fresh roll here. In the pinned d2data a base takes sockets (HasInv)
 * exactly when it has GemSockets.
 */
export function rollSockets(b: D2Base, ilvl: number, difficulty: Difficulty | undefined, rng: Rand): number {
  if (b.stack) return 0;
  const max = maxSockets(b, ilvl, difficulty);
  return max > 0 && roll(rng, 100) < 33 ? roll(rng, max) + 1 : 0;
}
