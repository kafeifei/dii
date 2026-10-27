// Magic and rare affixes, D2's way: the affix level, which MagicPrefix / MagicSuffix / AutoMagic rows
// can roll on a base, the weighted pick, a magic item's prefix and/or suffix, a rare item's name
// words and 3–6 affixes, class items' automagic and staff mods, and the level requirement they
// make. Items keep row ids (prefixes, suffixes, autoAffix, rareName); names and stats are read
// from the rows later. D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f;
// ItemsMagic.cpp and ItemMode.cpp are D2Game's, ItemMods.cpp D2Common's.
import { D2X_AUTOMAGIC, D2X_PREFIXES, D2X_SUFFIXES } from '../../data/d2x/affixes';
import { D2X_RARE_PREFIXES, D2X_RARE_SUFFIXES } from '../../data/d2x/rare';
import type { D2Prop, D2xAffix, D2xRareWord } from '../../data/d2x/types';
import { CLASS_SKILL_BY_NAME, CLASS_SKILLS } from './classskills';
import { d2Base, isType, ownType } from './bases';
import { SET_ITEM_BY_ID, UNIQUE_BY_ID } from './legendary';
import { maxSockets, pickSuperior, roll, rollSockets, type DropSpec, type QualityDrop } from './quality';
import type { D2Base, D2Item, D2Quality, Rand } from './types';

export type AffixKind = 'prefix' | 'suffix' | 'auto';

const TABLES: Record<AffixKind, D2xAffix[]> = { prefix: D2X_PREFIXES, suffix: D2X_SUFFIXES, auto: D2X_AUTOMAGIC };
const BY_ID = Object.fromEntries(
  Object.entries(TABLES).map(([k, rows]) => [k, new Map(rows.map((a) => [a.id, a]))]),
) as Record<AffixKind, Map<number, D2xAffix>>;

/** a MagicPrefix, MagicSuffix or AutoMagic row by id */
export function affixRow(kind: AffixKind, id: number): D2xAffix {
  const a = BY_ID[kind].get(id);
  if (!a) throw new Error(`no ${kind} row ${id}`);
  return a;
}

const MAX_LEVEL = 99;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The affix level (ItemsMagic.cpp:132-158 ITEMS_ComputeCraftedMagicAffixLevel, used for every
 * magic affix roll): the item level, at least the base's qlvl, plus the base's magic level
 * (wands, staves, orbs, circlets); without one, minus half the qlvl, and near level 99 twice the
 * item level less 99 instead. 1 to 99.
 */
export function affixLevel(b: D2Base, ilvl: number): number {
  const lvl = Math.max(ilvl, b.qlvl);
  if (b.magicLvl) return clamp(lvl + b.magicLvl, 1, MAX_LEVEL);
  const half = Math.trunc(b.qlvl / 2);
  return clamp(lvl >= MAX_LEVEL - half ? 2 * lvl - MAX_LEVEL : lvl - half, 1, MAX_LEVEL);
}

/**
 * ITEMMODS_CanItemHaveMagicAffix and ITEMMODS_CanItemHaveRareAffix (ItemMods.cpp:2656-2733): no
 * etype the base is, and an itype it is
 */
function fitsType(a: { itypes: string[]; etypes?: string[] }, b: D2Base): boolean {
  if (a.etypes?.some((t) => isType(b, t))) return false;
  return a.itypes.some((t) => isType(b, t));
}

/** ItemsMagic.cpp:160-169: a class-specific row only on that class's items or on items of no class */
function classFits(a: D2xAffix, b: D2Base): boolean {
  const cls = ownType(b).cls;
  return !a.cls || !cls || cls === a.cls;
}

/** a row's weight (ItemsMagic.cpp:195-203): its frequency, times its level on bases with a magic level */
export function affixWeight(a: D2xAffix, b: D2Base): number {
  return b.magicLvl ? a.level * a.freq : a.freq;
}

const staticPools = new Map<string, D2xAffix[]>();
/**
 * The rows that can ever roll on the base (ItemsMagic.cpp:293-334, before level and group): spawnable
 * (not asked for automagic, ItemMode.cpp:6305), a frequency, the rare flag on rare items, the base's
 * automagic group, its class and its types.
 */
function staticPool(b: D2Base, kind: AffixKind, rare: boolean): D2xAffix[] {
  const key = `${b.code}/${kind}/${rare ? 'r' : 'm'}`;
  let pool = staticPools.get(key);
  if (pool) return pool;
  pool = TABLES[kind].filter(
    (a) =>
      (kind === 'auto' ? a.group === b.autoPrefix : a.spawnable) &&
      a.freq > 0 &&
      (!rare || a.rare) &&
      classFits(a, b) &&
      fitsType(a, b),
  );
  staticPools.set(key, pool);
  return pool;
}

export interface AffixPool {
  /** shared between calls: don't change it */
  rows: readonly D2xAffix[];
  /** the sum of every eligible row's weight, rows past D2's 511-entry list included */
  total: number;
}

/** D2's candidate list holds 511 rows; the weights of any past that still count (ItemsMagic.cpp:350-356) */
const POOL_CAP = 511;
const NO_GROUPS: ReadonlySet<number> = new Set();

function capped(rows: D2xAffix[], b: D2Base): AffixPool {
  return { rows: rows.slice(0, POOL_CAP), total: rows.reduce((s, a) => s + affixWeight(a, b), 0) };
}

const levelPools = new Map<string, AffixPool & { all: D2xAffix[] }>();
/**
 * The rows that can roll now (ItemsMagic.cpp:293-357): level ≤ the affix level ≤ maxlevel, and no
 * group the item already has among its prefixes and suffixes, either side (ItemsMagic.cpp:171-193).
 * Rows that add sockets need a base that takes them at its item level (ItemMods.cpp:2662-2664;
 * D2MOO's decompile reads as refusing them outright, but Mechanic's and Jeweler's items spawn).
 * Cached by base and affix level, as drops ask for the same few again and again.
 */
export function affixPool(b: D2Base, ilvl: number, kind: AffixKind, rare = false, groups = NO_GROUPS): AffixPool {
  const alvl = affixLevel(b, ilvl);
  const socketable = maxSockets(b, ilvl, 2) > 0;
  const key = `${b.code}/${kind}/${rare ? 'r' : 'm'}/${alvl}/${socketable ? 's' : ''}`;
  let lp = levelPools.get(key);
  if (!lp) {
    const all = staticPool(b, kind, rare).filter(
      (a) => a.level <= alvl && !(a.maxLevel && alvl > a.maxLevel) && (a.props[0]?.c !== 'sock' || socketable),
    );
    lp = { ...capped(all, b), all };
    levelPools.set(key, lp);
  }
  return groups.size ? capped(lp.all.filter((a) => !groups.has(a.group)), b) : lp;
}

/**
 * The weighted pick (ItemsMagic.cpp:205-230): a roll of 0 … total, taking weights off row by row
 * until it goes below 0; a roll of exactly the total falls through to the last row.
 */
export function pickAffix(pool: AffixPool, b: D2Base, rng: Rand): D2xAffix | undefined {
  if (!pool.rows.length) return undefined;
  let n = roll(rng, pool.total + 1);
  let a: D2xAffix | undefined;
  for (a of pool.rows) {
    n -= affixWeight(a, b);
    if (n < 0) break;
  }
  return a;
}

export interface Affixes {
  prefixes: number[];
  suffixes: number[];
}

const groupsOf = (pre: number[], suf: number[]) =>
  new Set([...pre.map((id) => affixRow('prefix', id).group), ...suf.map((id) => affixRow('suffix', id).group)]);

/**
 * A magic item's affixes (D2Game Items.cpp:118-163 with ItemsMagic.cpp:269-274): a prefix half the
 * time, then a suffix half the time, or certainly when no prefix came; neither and it isn't magic.
 * So 1/4 prefix only, 1/4 both, 1/2 suffix only where both kinds fit.
 */
export function rollMagicAffixes(b: D2Base, ilvl: number, rng: Rand): Affixes | undefined {
  const prefixes: number[] = [];
  const suffixes: number[] = [];
  const pre = roll(rng, 2) ? pickAffix(affixPool(b, ilvl, 'prefix'), b, rng) : undefined;
  if (pre) prefixes.push(pre.id);
  const suf = !pre || roll(rng, 2) ? pickAffix(affixPool(b, ilvl, 'suffix', false, groupsOf(prefixes, [])), b, rng) : undefined;
  if (suf) suffixes.push(suf.id);
  return pre || suf ? { prefixes, suffixes } : undefined;
}

const WORDS = { prefix: D2X_RARE_PREFIXES, suffix: D2X_RARE_SUFFIXES };
const wordCache = new Map<string, D2xRareWord[]>();
/** ITEMMODS_CanItemHaveRareAffix (ItemMods.cpp:2700-2733): the rare name words for the base */
export function rareWords(b: D2Base, side: 'prefix' | 'suffix'): readonly D2xRareWord[] {
  const key = `${b.code}/${side}`;
  let words = wordCache.get(key);
  if (!words) {
    words = WORDS[side].filter((w) => fitsType(w, b));
    wordCache.set(key, words);
  }
  return words;
}

/** how many affixes a rare item tries for (ItemsMagic.cpp:461-474); jewels 3 or 4 */
const RARE_COUNTS = [3, 4, 4, 5, 5, 5, 6, 6];
const RARE_SIDE_MAX = 3;

export interface RareAffixes extends Affixes {
  rareName: [number, number];
}

/**
 * A rare item (ItemsMagic.cpp:436-557 D2GAME_RollRareItem): a rare prefix word and a suffix word,
 * each uniform among the ones for the base (ItemsMagic.cpp:559-613), else it isn't rare. Then up to
 * the count of rare-flagged affixes (ItemsMagic.cpp:312-324): a coin picks the side until a side
 * has 3 or runs dry, a side that runs dry not using up a try. None and it isn't rare.
 */
export function rollRareAffixes(b: D2Base, ilvl: number, rng: Rand): RareAffixes | undefined {
  if (!ownType(b).canRare) return undefined;
  const pw = rareWords(b, 'prefix');
  const sw = rareWords(b, 'suffix');
  if (!pw.length || !sw.length) return undefined;
  const rareName: [number, number] = [pw[roll(rng, pw.length)].id, sw[roll(rng, sw.length)].id];
  const count = b.type === 'jewl' ? roll(rng, 2) + 3 : RARE_COUNTS[roll(rng, 8)];
  const prefixes: number[] = [];
  const suffixes: number[] = [];
  const groups = new Set<number>();
  let preDone = false;
  let sufDone = false;
  for (let i = 0; i < count && !(preDone && sufDone); i++) {
    const suffix = !sufDone && (preDone || roll(rng, 2) === 1);
    const a = pickAffix(affixPool(b, ilvl, suffix ? 'suffix' : 'prefix', true, groups), b, rng);
    const side = suffix ? suffixes : prefixes;
    if (a) {
      side.push(a.id);
      groups.add(a.group);
    } else i--;
    if (!a || side.length >= RARE_SIDE_MAX) {
      if (suffix) sufDone = true;
      else preDone = true;
    }
  }
  return prefixes.length || suffixes.length ? { prefixes, suffixes, rareName } : undefined;
}

/**
 * A base's automagic mod (ItemMode.cpp:6293-6316, after everything else, for low, normal, superior,
 * magic, rare and crafted items): an AutoMagic row of the base's auto prefix group, by the same
 * rules, spawnable or not; rare and crafted items only take rare-flagged rows.
 */
export function rollAutomagic(b: D2Base, ilvl: number, quality: D2Quality, rng: Rand, groups?: ReadonlySet<number>): number | undefined {
  if (!b.autoPrefix) return undefined;
  const rare = quality === 'rare' || quality === 'crafted';
  return pickAffix(affixPool(b, ilvl, 'auto', rare, groups), b, rng)?.id;
}

/**
 * Staff mods (D2Game Items.cpp:2717-2741 and 2743-2856, the expansion version): for item types with
 * StaffMods, 0–3 "+N to a skill" of that class. 31% none, 40% one, 20% two, 9% three. Skills come
 * in tiers of 5 (the class's skills in row order); the item level picks a middle tier (1 up to 5
 * past level 36), each mod lands a tier above it 19%, on it 50%, one below 20%, two below 11%, at
 * least the first. A skill needing another item type (itypea1: Smite a shield, Poison Dagger a
 * dagger) or already rolled is rerolled up to 6 times, and the last roll stands even so. N is 1
 * (60%), 2 (30%) or 3 (10%). Low quality items stay at tier 4 or below, at +1. `dropLvl` is the
 * item level when the drop asks for it (ITEMDROPFLAG_STAFFMODUSEILVL), else 0.
 */
export function rollStaffMods(b: D2Base, ilvl: number, low: boolean, rng: Rand, dropLvl = 0): D2Prop[] | undefined {
  const skills = CLASS_SKILLS[ownType(b).staffMods ?? ''];
  if (!skills) return undefined;
  const r = dropLvl + roll(rng, 100);
  const count = r > 90 ? 3 : r > 70 ? 2 : r > 30 || dropLvl ? 1 : 0;
  if (!count) return undefined;
  const base = ilvl > 36 ? 5 : ilvl > 24 ? 4 : ilvl > 18 ? 3 : ilvl > 11 ? 2 : 1;
  const picked: number[] = [];
  const mods = new Map<number, number>();
  for (let j = 0; j < count; j++) {
    const t = roll(rng, 100);
    let tier = Math.max(t > 80 ? base + 1 : t > 30 ? base : t > 10 ? base - 1 : base - 2, 1);
    if (low) tier = Math.min(tier, 4);
    let s = 0;
    for (let i = 0; i < 6; i++) {
      s = 5 * (tier - 1) + roll(rng, 5);
      const need = skills[s][2];
      if ((!need || isType(b, need)) && !picked.includes(s)) {
        picked.push(s);
        break;
      }
    }
    let n = 1;
    if (!low) {
      const v = Math.trunc(dropLvl / 2) + roll(rng, 100);
      n = v >= 90 ? 3 : v >= 60 ? 2 : 1;
    }
    // the same skill again sets its stat anew (STATLIST_SetStatIfListIsValid)
    mods.set(s, n);
  }
  return [...mods].map(([s, n]) => ({ c: 'skill', p: skills[s][0], min: n, max: n }));
}

// ───────────────────────── the item ─────────────────────────

export interface AffixSpec extends Pick<DropSpec, 'code' | 'ilvl' | 'difficulty'> {
  /** ITEMDROPFLAG_STAFFMODUSEILVL: staff mods count the item level in (more and stronger mods) */
  staffModIlvl?: boolean;
}

/** a QualityDrop with its affixes: the quality is final, magic and rare having fallen back if nothing fit */
export interface AffixDrop extends QualityDrop {
  prefixes?: number[];
  suffixes?: number[];
  autoAffix?: number;
  rareName?: [number, number];
  staffMods?: D2Prop[];
  /** the level to use it for a hero of no class (requiredLevel gives a class's) */
  reqLvl: number;
}

const STAFF_MOD_QUALITIES = new Set<D2Quality>(['low', 'normal', 'superior', 'magic', 'rare', 'crafted']);

/**
 * The affix part of making an item (ItemMode.cpp:6380-6550, 6274-6318) on what dropQuality made: a
 * rare item that gets no name or affixes is made magic, a magic one with no affix superior, a
 * superior one with no QualityItems row normal (each fallback a new item, sockets rolled as for a
 * normal or superior item: ItemMode.cpp:6283-6290). Then staff mods (on every quality but set and
 * unique: D2Game Items.cpp:134, 162, 410, ItemsMagic.cpp:554, 997, 1093) and automagic.
 */
export function rollAffixes(drop: QualityDrop, spec: AffixSpec, rng: Rand): AffixDrop {
  const b = d2Base(spec.code);
  const out: AffixDrop = { ...drop, reqLvl: 0 };
  const fellTo = (q: D2Quality) => {
    out.quality = q;
    out.identified = true;
    if (q === 'normal' || q === 'superior') out.sockets = rollSockets(b, spec.ilvl, spec.difficulty, rng);
  };
  if (out.quality === 'rare') {
    const r = rollRareAffixes(b, spec.ilvl, rng);
    if (r) Object.assign(out, r);
    else out.quality = 'magic';
  }
  if (out.quality === 'magic') {
    const m = rollMagicAffixes(b, spec.ilvl, rng);
    if (m) {
      out.prefixes = m.prefixes;
      out.suffixes = m.suffixes;
    } else {
      const s = pickSuperior(b, rng);
      if (s) out.qualityRow = s.id;
      fellTo(s ? 'superior' : 'normal');
    }
  }
  if (out.prefixes && !out.prefixes.length) delete out.prefixes;
  if (out.suffixes && !out.suffixes.length) delete out.suffixes;

  if (STAFF_MOD_QUALITIES.has(out.quality)) {
    const mods = rollStaffMods(b, spec.ilvl, out.quality === 'low', rng, spec.staffModIlvl ? spec.ilvl : 0);
    if (mods) out.staffMods = mods;
    const auto = rollAutomagic(b, spec.ilvl, out.quality, rng, groupsOf(out.prefixes ?? [], out.suffixes ?? []));
    if (auto !== undefined) out.autoAffix = auto;
  }
  out.reqLvl = requiredLevel({ ...out, baseId: spec.code, socketed: [] });
  return out;
}

// ───────────────────────── level requirement ─────────────────────────

export type ReqItem = Pick<D2Item, 'baseId' | 'quality' | 'prefixes' | 'suffixes' | 'autoAffix' | 'staffMods' | 'uniqueRow' | 'setRow' | 'socketed'>;

/**
 * The level to use an item (D2Common Items.cpp:1214-1441 ITEMS_GetRequiredLevel): the highest of
 * its affixes' levelreq (classlevelreq for a hero of the row's class), magic and rare items' with
 * the automagic row's; crafted items that plus 10 and 3 per affix, at most 98; a unique or set item
 * its row's. At least the base's, its socketed items' and each staff mod skill's.
 */
export function requiredLevel(item: ReqItem, heroCls?: string): number {
  const req = (a: D2xAffix) => (a.reqCls && a.reqCls === heroCls ? (a.reqClsLvl ?? 0) : a.reqLvl);
  const affixes = () => [
    ...(item.prefixes ?? []).map((id) => affixRow('prefix', id)),
    ...(item.suffixes ?? []).map((id) => affixRow('suffix', id)),
  ];
  const auto = () => (item.autoAffix !== undefined ? [affixRow('auto', item.autoAffix)] : []);
  let lvl = 0;
  switch (item.quality) {
    case 'magic':
    case 'rare':
      for (const a of [...affixes(), ...auto()]) lvl = Math.max(lvl, req(a));
      break;
    case 'crafted': {
      const rows = affixes();
      for (const a of rows) lvl = Math.max(lvl, req(a));
      lvl = Math.min(lvl + 10 + 3 * rows.length, MAX_LEVEL - 1);
      break;
    }
    case 'unique':
      lvl = (item.uniqueRow !== undefined && UNIQUE_BY_ID.get(item.uniqueRow)?.reqLvl) || 0;
      break;
    case 'set':
      lvl = (item.setRow !== undefined && SET_ITEM_BY_ID.get(item.setRow)?.reqLvl) || 0;
      break;
    default:
      break;
  }
  lvl = Math.max(lvl, d2Base(item.baseId).reqLvl);
  for (const s of item.socketed) lvl = Math.max(lvl, typeof s === 'string' ? d2Base(s).reqLvl : requiredLevel(s, heroCls));
  for (const m of item.staffMods ?? []) lvl = Math.max(lvl, CLASS_SKILL_BY_NAME[m.p as string]?.[1] ?? 0);
  return lvl;
}

/** every property the item's affix rows and staff mods give, for rolling its stats */
export function affixProps(item: Pick<D2Item, 'prefixes' | 'suffixes' | 'autoAffix' | 'staffMods'>): D2Prop[] {
  return [
    ...(item.prefixes ?? []).flatMap((id) => affixRow('prefix', id).props),
    ...(item.suffixes ?? []).flatMap((id) => affixRow('suffix', id).props),
    ...(item.autoAffix !== undefined ? affixRow('auto', item.autoAffix).props : []),
    ...(item.staffMods ?? []),
  ];
}
