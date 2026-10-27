// Uniques, set items and runewords, D2's way: which UniqueItems / SetItems row a unique or set
// drop becomes, rolling its properties (and a set item's green bonus slots), which bonuses a worn
// set gives, and which runeword a full set of socketed runes makes. Items keep the row and the
// rolled properties; nothing here reads the hero beyond the worn set items it is handed. D2MOO
// references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f; ItemMode.cpp and
// ItemsMagic.cpp are D2Game's, Items.cpp and ItemMods.cpp D2Common's unless named.
import { D2X_SET_ITEMS, D2X_SETS } from '../../data/d2x/sets';
import { D2X_RUNES } from '../../data/d2x/socketables';
import { D2X_RUNEWORDS } from '../../data/d2x/runewords';
import type { D2Prop, D2xRuneword, D2xSet, D2xSetItem, D2xUnique } from '../../data/d2x/types';
import { D2X_UNIQUES } from '../../data/d2x/uniques';
import { d2Base, isType } from './bases';
import { rollProps, type RolledProps } from './props';
import { roll } from './rand';
import type { DropSpec, QualityDrop } from './quality';
import type { D2Base, D2Item, D2Quality, Difficulty, Rand } from './types';

export const UNIQUE_BY_ID = new Map(D2X_UNIQUES.map((u) => [u.id, u]));
export const SET_ITEM_BY_ID = new Map(D2X_SET_ITEMS.map((s) => [s.id, s]));
export const SET_BY_ID = new Map(D2X_SETS.map((s) => [s.id, s]));
export const RUNEWORD_BY_ID = new Map(D2X_RUNEWORDS.map((r) => [r.id, r]));

// ───────────────────────── which row ─────────────────────────

const DIFFICULTY_WORDS: Record<string, Difficulty> = { normal: 0, nightmare: 1, hell: 2 };

/**
 * A UniqueItems.txt DropConditionCalc (D2R's column, absent from D2MOO), kept as the table writes
 * it. The tables only use cond('Difficulty', <difficulty>): drops only in that difficulty. An
 * expression this doesn't read never holds, so an unknown condition keeps the row out.
 */
export function dropCondMet(cond: string | undefined, difficulty: Difficulty = 0): boolean {
  if (!cond) return true;
  const m = /^"?\s*cond\(\s*'Difficulty'\s*,\s*(\w+)\s*\)\s*"?$/i.exec(cond);
  const want = m ? DIFFICULTY_WORDS[m[1].toLowerCase()] : undefined;
  return want !== undefined && want === difficulty;
}

/** the rarity pick (ItemMode.cpp:6617-6637, ItemsMagic.cpp:837-881): a rarity of 0 counts as 1 */
function weighted<T extends { rarity: number }>(rows: T[], rng: Rand): T | undefined {
  const w = (r: T) => Math.max(r.rarity, 1);
  let n = roll(rng, rows.reduce((s, r) => s + w(r), 0));
  for (const r of rows) {
    if (n < w(r)) return r;
    n -= w(r);
  }
  return undefined;
}

export type PickSpec = Pick<DropSpec, 'row' | 'dropped' | 'difficulty' | 'hellBovine'>;

/**
 * The unique to make (ItemMode.cpp:6597-6670, the expansion branch): a spawnable row on this base
 * with lvl ≤ ilvl whose drop condition holds, picked by rarity, or the given row when it is one of
 * them. None, or one already dropped this game, and it isn't unique: dropQuality makes it rare.
 */
export function pickUnique(b: D2Base, ilvl: number, rng: Rand, spec: PickSpec = {}): D2xUnique | undefined {
  const fits = D2X_UNIQUES.filter(
    (u) => u.spawnable && u.code === b.code && u.lvl <= ilvl && dropCondMet(u.dropCond, spec.difficulty),
  );
  if (!fits.length) return undefined;
  const u = fits.find((f) => f.id === spec.row) ?? weighted(fits, rng);
  if (!u || (!b.quest && spec.dropped?.has(u.id))) return undefined;
  spec.dropped?.add(u.id);
  return u;
}

/**
 * The set item to make (ItemsMagic.cpp:817-893): a row on this base with lvl ≤ ilvl, picked by
 * rarity; Cow King's Leathers only from hell bovines (ItemsMagic.cpp:840). None and it isn't a
 * set item: dropQuality makes it magic.
 */
export function pickSetItem(b: D2Base, ilvl: number, rng: Rand, spec: PickSpec = {}): D2xSetItem | undefined {
  const fits = D2X_SET_ITEMS.filter(
    (s) => s.spawnable && s.code === b.code && s.lvl <= ilvl && (s.set !== "Cow King's Leathers" || !!spec.hellBovine),
  );
  if (!fits.length) return undefined;
  return fits.find((f) => f.id === spec.row) ?? weighted(fits, rng);
}

// ───────────────────────── rolling them ─────────────────────────

/** a unique's properties, rolled as it is made (ITEMMODS_AssignProperty PROPMODE_UNIQUE, ItemMods.cpp:2380-2397) */
export function rollUnique(u: D2xUnique, ilvl: number, rng: Rand): RolledProps {
  return rollProps(u.props, d2Base(u.code), ilvl, rng);
}

export interface RolledSetItem extends RolledProps {
  /** bonus slots 1..5 as rolled, [] for an empty one; unset when the row's add func is 0 */
  setBonus?: D2Prop[][];
  /** the charges left of each slot's charged skills ({} for a slot without), unset when no slot has any */
  setCharges?: Record<string, number>[];
}

function merge(into: RolledProps, r: RolledProps) {
  if (r.sockets !== undefined) into.sockets = r.sockets;
  if (r.eth) into.eth = true;
  if (r.dur) into.dur = (into.dur ?? 0) + r.dur;
  if (r.charges) into.charges = { ...into.charges, ...r.charges };
}

/**
 * A set item's properties and bonus slots, rolled as it is made (PROPMODE_SET, ItemMods.cpp:2397-2440):
 * the slots' values are fixed then and only switched on and off later. With add func 0 they go in
 * with no state, on like any property (ItemMods.cpp:2414-2425), so they join the props. Otherwise
 * each slot's stats go in its ITEMSET state list, which the add func switches (Items.cpp:7423-7491),
 * so only what funcs 14 and 23 do to the item itself stays for good: sockets, whose stat func 14
 * sets on the item and not in the list, and ethereal (ItemMods.cpp:3776-3781, 4298-4301). A slot's
 * most durability (func 1, into the state list: 2828-2875) stays in the slot as a dur property,
 * counting toward its item's maxDur while it is on, and its charges (func 19, the same list:
 * 3891-3892) are kept by slot in setCharges.
 */
export function rollSetItem(s: D2xSetItem, ilvl: number, rng: Rand): RolledSetItem {
  const b = d2Base(s.code);
  const out: RolledSetItem = rollProps(s.props, b, ilvl, rng);
  const slots = (s.bonus ?? []).map((slot) => rollProps(slot, b, ilvl, rng));
  if (!s.addFunc) {
    for (const r of slots) {
      out.props.push(...r.props);
      merge(out, r);
    }
    return out;
  }
  out.setBonus = slots.map((r) => {
    if (r.sockets !== undefined) out.sockets = r.sockets;
    if (r.eth) out.eth = true;
    // the sock property goes with the sockets onto the item: STATLIST_SetUnitStat(pItem, …)
    out.props.push(...r.props.filter((p) => p.c === 'sock'));
    const slot = r.props.filter((p) => p.c !== 'sock');
    return r.dur ? [...slot, { c: 'dur', min: r.dur, max: r.dur }] : slot;
  });
  if (slots.some((r) => r.charges)) out.setCharges = slots.map((r) => r.charges ?? {});
  return out;
}

export interface LegendaryDrop {
  props?: D2Prop[];
  setBonus?: D2Prop[][];
  setCharges?: Record<string, number>[];
  charges?: Record<string, number>;
}

/**
 * The legendary part of making an item, on what dropQuality (and rollAffixes) made: a unique or set
 * item gets its rolled properties, and what they do to the item itself: sockets (sock), ethereal
 * (ethereal, durability left as it is), more most durability (dur), charges.
 */
export function rollLegendary<T extends QualityDrop>(drop: T, spec: Pick<DropSpec, 'ilvl'>, rng: Rand): T & LegendaryDrop {
  const out: T & LegendaryDrop = { ...drop };
  let r: RolledSetItem | undefined;
  if (drop.quality === 'unique' && drop.uniqueRow !== undefined) {
    const u = UNIQUE_BY_ID.get(drop.uniqueRow);
    if (u) r = rollUnique(u, spec.ilvl, rng);
  } else if (drop.quality === 'set' && drop.setRow !== undefined) {
    const s = SET_ITEM_BY_ID.get(drop.setRow);
    if (s) r = rollSetItem(s, spec.ilvl, rng);
  }
  if (!r) return out;
  applyRolled(out, r);
  if (r.setBonus) out.setBonus = r.setBonus;
  if (r.setCharges) out.setCharges = r.setCharges;
  return out;
}

/**
 * Puts rolled properties and their side effects on an item or drop. A dur property raises the most
 * durability only (func 1), so a plain item keeps the durability its base rolled; one the drop made
 * ethereal is at its new most, as D2 sets the current to the whole most, dur included, after
 * halving the base's own (D2Game Items.cpp:257-259).
 */
function applyRolled(out: LegendaryDrop & Pick<QualityDrop, 'sockets' | 'eth' | 'dur' | 'maxDur'>, r: RolledProps) {
  const madeEth = out.eth;
  out.props = r.props;
  if (r.sockets !== undefined) out.sockets = r.sockets;
  if (r.eth) out.eth = true;
  if (r.dur && out.maxDur !== undefined) {
    out.maxDur += r.dur;
    if (madeEth) out.dur = out.maxDur;
  }
  if (r.charges) out.charges = { ...out.charges, ...r.charges };
}

// ───────────────────────── worn sets ─────────────────────────

export type WornSetItem = Pick<D2Item, 'setRow' | 'setBonus'>;

export interface WornSet {
  set: D2xSet;
  /** distinct pieces of it worn */
  worn: number;
  /** the partial bonuses on (PCode2a … PCode5b), and the full set's (FCode1 … 8) once every piece is worn */
  partial: D2Prop[];
  full: D2Prop[];
}

export interface SetBonuses {
  /**
   * for each worn item, in order: which of its bonus slots are on (none for a non-set item). A slot
   * that is on also gives its own item what belongs to it: a dur property's most durability, and
   * the charges setCharges keeps for that slot.
   */
  slots: boolean[][];
  sets: WornSet[];
  /** every bonus property that is on: the items' green slots, then each set's partial and full ones */
  props: D2Prop[];
}

/** the set and the piece's place in it (its index in Sets.txt order, SetItems' nSetItems: DataTbls ItemsTbls.cpp:977-997) */
function pieceOf(s: D2xSetItem): [D2xSet, number] | undefined {
  const set = SET_BY_ID.get(s.set);
  const i = set?.pieces.indexOf(s.key) ?? -1;
  return set && i >= 0 ? [set, i] : undefined;
}

/**
 * What a set item's add func switches on (Items.cpp:7423-7491 sub_6FDA4380), given the pieces of
 * its set worn as a bitmask by place in the set, itself included (ITEMS_GetSetItemsMask, Items.cpp:4437-4473):
 * add func 1 turns slot k on while the k-th other piece is worn (pieces in set order, this one
 * skipped); add func 2 turns slots 1 … n − 1 on with n distinct pieces worn.
 */
export function slotsOn(s: D2xSetItem, mask: number): boolean[] {
  // add func 0: no slots, rollSetItem made them plain properties
  const n = s.addFunc ? (s.bonus?.length ?? 0) : 0;
  const on = new Array<boolean>(n).fill(false);
  // a piece its set doesn't list has no place to count from: nothing on
  const at = pieceOf(s);
  if (!at) return on;
  const own = at[1];
  if (s.addFunc === 1) {
    for (let i = 0; i < 6; i++) {
      const k = i > own ? i - 1 : i;
      if (i !== own && k < n && mask & (1 << i)) on[k] = true;
    }
  } else if (s.addFunc === 2) {
    const worn = popcount(mask);
    for (let k = 0; k < Math.min(worn - 1, n); k++) on[k] = true;
  }
  return on;
}

const popcount = (m: number) => {
  let c = 0;
  for (; m; m &= m - 1) c++;
  return c;
};

/**
 * The set bonuses of what is worn: pass the equipped items that count, as D2 skips broken ones and
 * ones whose requirements aren't met (Items.cpp:4459). Pieces count once each however many copies
 * are worn (a bit per place in the set). Each item's green slots by its add func (slotsOn), and
 * once per set (one stat list per set id: Items.cpp:7497-7560) the partial bonuses of every count
 * up to the pieces worn and, with all of them, the full set's (ItemMods.cpp:2584-2650
 * ITEMMODS_UpdateFullSetBoni). D2MOO's decompile caps the count at pieces − 1 first, which would
 * never reach the full bonus; the game gives a full set every partial line and the full bonus
 * (Tal Rasha's set shows its 2-, 3- and 4-piece lines), so the cap here is the piece count.
 */
export function setBonuses(worn: readonly WornSetItem[]): SetBonuses {
  const masks = new Map<string, number>();
  const rows = worn.map((w) => (w.setRow !== undefined ? SET_ITEM_BY_ID.get(w.setRow) : undefined));
  for (const s of rows) {
    const at = s && pieceOf(s);
    if (at) masks.set(at[0].id, (masks.get(at[0].id) ?? 0) | (1 << at[1]));
  }
  const props: D2Prop[] = [];
  const slots = worn.map((w, i) => {
    const s = rows[i];
    if (!s) return [];
    const on = slotsOn(s, masks.get(s.set) ?? 0);
    // the slots' values are the item's own rolls (rollSetItem): an item without them adds nothing,
    // as the table's slots may be ranges (Civerb's Ward's mana 21–22)
    const rolled = w.setBonus ?? [];
    on.forEach((o, k) => o && props.push(...(rolled[k] ?? [])));
    return on;
  });
  const sets: WornSet[] = [];
  for (const [id, mask] of masks) {
    const set = SET_BY_ID.get(id)!;
    const n = Math.min(popcount(mask), set.pieces.length);
    const partial = set.partial.filter((p) => p.n <= n).flatMap((p) => p.props);
    const full = n >= set.pieces.length ? set.full : [];
    sets.push({ set, worn: n, partial, full });
    props.push(...partial, ...full);
  }
  return { slots, sets, props };
}

// ───────────────────────── runewords ─────────────────────────

const RUNE_NUM = new Map(D2X_RUNES.map((r) => [r.id, r.num]));

/** qualities a runeword can be made in: not magic up to tempered (Items.cpp:3257-3262) */
const RUNEWORD_QUALITIES = new Set<D2Quality>(['low', 'normal', 'superior']);

/**
 * The runeword these runes (by number, in socket order) make in this base (Items.cpp:3250-3330
 * ITEMS_GetRunesTxtRecordFromItem): the first Runes.txt row with the same runes in the same order
 * whose etypes the base isn't and one of whose itypes it is. The rune count must be the socket
 * count: the caller checks the item is full, and D2's runes must match the word's to the last one
 * (D2MOO's decompile only compares the word's own runes; the game takes Stealth in 2 sockets only).
 */
export function runewordFor(b: D2Base, runes: readonly number[]): D2xRuneword | undefined {
  if (b.quest || !runes.length) return undefined;
  return D2X_RUNEWORDS.find(
    (rw) =>
      rw.runes.length === runes.length &&
      rw.runes.every((n, i) => runes[i] === n) &&
      !rw.etypes?.some((t) => isType(b, t)) &&
      rw.itypes.some((t) => isType(b, t)),
  );
}

export type RunewordItem = Pick<D2Item, 'baseId' | 'quality' | 'sockets' | 'socketed'>;

/**
 * The runeword an item makes as it is: low, normal or superior quality, every socket filled
 * (Items.cpp:3280-3286), and only runes in them (a gem or jewel matches no word).
 */
export function findRuneword(item: RunewordItem): D2xRuneword | undefined {
  if (!RUNEWORD_QUALITIES.has(item.quality) || !item.sockets || item.socketed.length !== item.sockets) return undefined;
  const runes: number[] = [];
  for (const s of item.socketed) {
    const n = typeof s === 'string' ? RUNE_NUM.get(s) : undefined;
    if (n === undefined) return undefined;
    runes.push(n);
  }
  return runewordFor(d2Base(item.baseId), runes);
}

/** what making a runeword gives the item: no sockets or ethereal, as those act on the rune (makeRuneword) */
export interface RunewordMade extends Omit<RolledProps, 'sockets' | 'eth'> {
  runewordRow: string;
}

/**
 * Making the runeword once the last rune goes in (ITEMMODS_UpdateRuneword, ItemMods.cpp:2554-2581,
 * called with that rune: D2Game ItemMode.cpp:4693): its properties go in the item's runeword stat
 * list, on top of the runes' own, but every property function is handed the rune as the item it
 * works on (ItemMods.cpp:2574). So proc and charged skill levels come from the rune's item level,
 * `runeIlvl`, not the base's (funcs 11, 19: 3668, 3677, 3811, 3849), and sock and ethereal act on
 * the rune, which takes no sockets and has no durability (func 14: 3718-3730, func 23: 4298): they
 * do nothing, and Famine is not made ethereal. Undefined when the item makes none.
 */
export function makeRuneword(item: RunewordItem, runeIlvl: number, rng: Rand): RunewordMade | undefined {
  const rw = findRuneword(item);
  if (!rw) return undefined;
  // findRuneword took every socket for a rune id
  const rune = d2Base(String(item.socketed[item.socketed.length - 1]));
  const { sockets: _sockets, eth: _eth, ...r } = rollProps(rw.props, rune, runeIlvl, rng);
  return { ...r, runewordRow: rw.id };
}
