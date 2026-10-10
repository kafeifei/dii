import { chance, pick, randInt, uid, weightedPick } from '../core/math';
import { AFFIXES, RARE_FIRST, RARE_SECOND, type AffixDef } from '../data/affixes';
import { D2_PREFIXES, D2_SUFFIXES } from '../data/d2/affixes';
import { D2_GOOD_TCS } from '../data/d2/progression';
import type { D2Affix } from '../data/d2/types';
import { ALL_BASES, EQUIPPABLE_BASES, ITEM_BASES, categoryOf, itypeMatches, maxSocketsAt, type ItemBase } from '../data/items';
import { GEMS, RUNEWORDS, SETS, UNIQUES, type RunewordDef } from '../data/legendary';
import { classSkills } from '../data/skills';
import type { StatKey } from '../data/stats';
import { baseOf, itemCategory, type Item, type ItemMod, type Rarity } from './item';
import { propMods } from './props';

function rollMods(ranges: [StatKey, number, number][]): ItemMod[] {
  return ranges.map(([stat, min, max]) => ({ stat, value: randInt(min, max) }));
}

function baseDefense(b: ItemBase): number | undefined {
  return b.def ? randInt(b.def[0], b.def[1]) : undefined;
}

/** bases taken from Diablo II's tables roll Diablo II's affixes; this game's armor keeps its own */
function isD2Base(b: ItemBase): boolean {
  return !!b.code && categoryOf(b.type) === 'weapon';
}

export function createItem(baseId: string, rarity: Rarity = 'normal', ilvl = 1): Item {
  const b = ITEM_BASES[baseId];
  const item: Item = {
    uid: uid('i'),
    baseId,
    rarity: 'normal',
    ilvl,
    name: b.name,
    mods: [],
    defense: baseDefense(b),
    sockets: 0,
    socketed: [],
    reqLvl: b.reqLvl ?? Math.max(1, Math.floor(b.qlvl * 0.8)),
  };
  if (b.type === 'potion' || b.type === 'rune' || b.type === 'gem' || b.type === 'cube') {
    item.reqLvl = b.reqLvl ?? 1;
    return item;
  }
  switch (rarity) {
    case 'superior':
      applySuperior(item);
      break;
    case 'magic':
      applyMagic(item);
      break;
    case 'rare':
      applyRare(item);
      break;
    default:
      break;
  }
  return item;
}

function applySuperior(item: Item) {
  const b = ITEM_BASES[item.baseId];
  item.rarity = 'superior';
  item.name = '优质的' + b.name;
  if (b.dmg) item.mods.push({ stat: 'dmgPct', value: randInt(5, 15) });
  else if (b.def) item.mods.push({ stat: 'defPct', value: randInt(5, 15) });
}

// ───────────────────────── Diablo II affixes ─────────────────────────

/** D2's affix level: the item level, pulled down by the base's quality level, or raised by its magic level */
export function affixLevel(b: ItemBase, ilvl: number): number {
  const q = b.qlvl;
  const i = Math.max(Math.min(ilvl, 99), q);
  let a: number;
  if (b.magicLvl) a = i + b.magicLvl;
  else if (i < 99 - Math.floor(q / 2)) a = i - Math.floor(q / 2);
  else a = 2 * i - 99;
  return Math.max(1, Math.min(99, a));
}

function d2Pool(item: Item, kind: 'prefix' | 'suffix', used: Set<string>, rare: boolean): D2Affix[] {
  const b = baseOf(item);
  const alvl = affixLevel(b, item.ilvl);
  return (kind === 'prefix' ? D2_PREFIXES : D2_SUFFIXES).filter(
    (a) => a.freq > 0 && a.level <= alvl && (!a.maxLevel || alvl <= a.maxLevel) && !(rare && a.noRare) && !used.has(`${kind}${a.group}`) && itypeMatches(b, a.itypes, a.etypes),
  );
}

/** put a D2 affix on an item: its properties, any sockets or charges it gives, its level requirement */
export function applyD2Affix(item: Item, a: D2Affix) {
  const b = baseOf(item);
  item.mods.push(...propMods(a.props, itemCategory(item) === 'weapon'));
  for (const p of a.props) {
    if (p.c === 'sock') item.sockets = Math.min(b.maxSockets ?? 0, Math.max(item.sockets, p.p ? Number(p.p) : randInt(p.min, p.max)));
  }
  initCharges(item);
  item.reqLvl = Math.max(item.reqLvl, a.reqLvl);
}

export function initCharges(item: Item) {
  for (const m of item.mods) if (m.stat === 'charged' && m.param) (item.charges ??= {})[m.param] ??= m.value;
}

interface Picked {
  name: string;
}

function eligibleAffixes(item: Item, kind: 'prefix' | 'suffix', used: Set<string>): AffixDef[] {
  const cat = itemCategory(item);
  if (!cat) return [];
  return AFFIXES.filter((a) => a.kind === kind && a.level <= item.ilvl && a.cats.includes(cat) && !used.has(a.group));
}

function addAffix(item: Item, kind: 'prefix' | 'suffix', used: Set<string>, rare = false): Picked | undefined {
  if (isD2Base(baseOf(item))) {
    const a = weightedPick(d2Pool(item, kind, used, rare), (x) => x.freq);
    if (!a) return undefined;
    used.add(`${kind}${a.group}`);
    applyD2Affix(item, a);
    return a;
  }
  const pool = eligibleAffixes(item, kind, used);
  // favour higher tiers a little at high ilvl
  const a = weightedPick(pool, (x) => x.weight * (1 + x.level / 40));
  if (!a) return undefined;
  used.add(a.group);
  for (const m of a.mods) item.mods.push({ stat: m.stat, value: randInt(m.min, m.max) });
  item.reqLvl = Math.max(item.reqLvl, Math.floor(a.level * 0.85));
  return a;
}

/** a magic item's name: D2's Chinese order (suffix, prefix, base) for D2 bases */
function magicName(b: ItemBase, pre?: Picked, suf?: Picked): string {
  if (isD2Base(b)) return `${suf?.name ?? ''}${pre?.name ?? ''}${b.name}`;
  return `${pre ? pre.name : ''}${b.name}${suf ? ' ' + suf.name : ''}`;
}

function applyMagic(item: Item) {
  const b = ITEM_BASES[item.baseId];
  item.rarity = 'magic';
  const used = new Set<string>();
  const roll = Math.random();
  let pre: Picked | undefined;
  let suf: Picked | undefined;
  if (roll < 0.4) {
    pre = addAffix(item, 'prefix', used);
    suf = addAffix(item, 'suffix', used);
  } else if (roll < 0.7) {
    pre = addAffix(item, 'prefix', used);
  } else {
    suf = addAffix(item, 'suffix', used);
  }
  if (!pre && !suf) suf = addAffix(item, 'suffix', used) ?? undefined;
  item.name = magicName(b, pre, suf);
}

/** a magic item with one named D2 affix (cube recipes), plus maybe a random one of the other kind */
export function magicWithAffix(item: Item, kind: 'prefix' | 'suffix', a: D2Affix) {
  const b = baseOf(item);
  item.rarity = 'magic';
  const used = new Set<string>([`${kind}${a.group}`]);
  applyD2Affix(item, a);
  const other = kind === 'prefix' ? 'suffix' : 'prefix';
  const extra = chance(0.5) ? addAffix(item, other, used) : undefined;
  item.name = kind === 'prefix' ? magicName(b, a, extra) : magicName(b, extra, a);
}

function applyRare(item: Item) {
  item.rarity = 'rare';
  const used = new Set<string>();
  const count = randInt(3, item.ilvl >= 30 ? 6 : item.ilvl >= 15 ? 5 : 4);
  let p = 0;
  let s = 0;
  for (let i = 0; i < count; i++) {
    const wantPrefix = p < 3 && (s >= 3 || Math.random() < 0.5);
    if (wantPrefix) {
      if (addAffix(item, 'prefix', used, true)) p++;
    } else if (addAffix(item, 'suffix', used, true)) s++;
  }
  const cat = itemCategory(item)!;
  item.name = pick(RARE_FIRST) + pick(RARE_SECOND[cat]);
}

// ───────────────────────── staff mods ─────────────────────────

/** chance of each skill tier (skills needing level 1/6/12/18/24/30) by item level */
function staffTierOdds(ilvl: number): number[] {
  if (ilvl <= 11) return [80, 20, 0, 0, 0, 0];
  if (ilvl <= 18) return [30, 50, 20, 0, 0, 0];
  if (ilvl <= 24) return [10, 20, 50, 20, 0, 0];
  if (ilvl <= 36) return [0, 10, 20, 50, 20, 0];
  return [0, 0, 10, 20, 50, 20];
}

/**
 * Diablo II's staff mods: staves and orbs (Sorceress) and scepters (Paladin) roll up to three
 * +1-3 bonuses to single class skills, of a tier set by the item level. Each skill bonus carries
 * the skill's own level requirement. This game's trees stop at tier 5, so tier 6 falls to 5.
 */
export function addStaffMods(item: Item) {
  const b = baseOf(item);
  if (!b.staffMods) return;
  const z = Math.random() * 100;
  const n = z >= 90 ? 3 : z >= 70 ? 2 : z >= 30 ? 1 : 0;
  const skills = classSkills(b.staffMods);
  const tierOf = (lvl: number) => Math.min(5, Math.floor(lvl / 6));
  const odds = staffTierOdds(item.ilvl);
  const taken = new Set<string>();
  for (let i = 0; i < n; i++) {
    let tier = weightedPick([0, 1, 2, 3, 4, 5], (t) => odds[t])!;
    let pool = skills.filter((s) => tierOf(s.reqLevel) === tier && !taken.has(s.id));
    while (!pool.length && tier > 0) pool = skills.filter((s) => tierOf(s.reqLevel) === --tier && !taken.has(s.id));
    if (!pool.length) break;
    const s = pick(pool);
    taken.add(s.id);
    const v = Math.random() * 100;
    item.mods.push({ stat: 'skill', param: s.id, value: v < 60 ? 1 : v < 90 ? 2 : 3 });
    item.reqLvl = Math.max(item.reqLvl, s.reqLevel);
  }
}

// ───────────────────────── uniques and sets ─────────────────────────

function makeUnique(base: ItemBase, ilvl: number): Item | null {
  const options = UNIQUES.filter((u) => u.baseId === base.id && u.level <= ilvl);
  if (!options.length) return null;
  const u = pick(options);
  const item = createItem(base.id, 'normal', ilvl);
  item.rarity = 'unique';
  item.uniqueId = u.id;
  item.name = u.name;
  item.mods = rollMods(u.mods);
  item.reqLvl = u.reqLvl;
  return item;
}

function makeSetItem(base: ItemBase, ilvl: number): Item | null {
  const options = SETS.flatMap((s) => s.items.filter((it) => it.baseId === base.id && s.level <= ilvl));
  if (!options.length) return null;
  const si = pick(options);
  const item = createItem(base.id, 'normal', ilvl);
  item.rarity = 'set';
  item.setItemId = si.id;
  item.name = si.name;
  item.mods = rollMods(si.mods);
  item.reqLvl = si.reqLvl;
  return item;
}

/** D2-style diminishing returns on magic find for better rarities */
function effectiveMf(mf: number, factor: number): number {
  return (mf * factor) / (mf + factor);
}

export interface RollOpts {
  mf?: number;
  /** bonus rarity quality: 0 normal monster, 1 champion, 2 unique, 3 boss */
  quality?: number;
  base?: ItemBase;
}

function pickBase(ilvl: number, filter?: (b: ItemBase) => boolean): ItemBase {
  const candidates = EQUIPPABLE_BASES.filter((b) => b.qlvl <= ilvl && !b.noDrop && (!filter || filter(b)));
  // weapons (Diablo II's ~200) and everything else drop about as often, as D2's weapon and armor
  // treasure classes do, however many bases each side has
  const nWeapons = candidates.filter((b) => categoryOf(b.type) === 'weapon').length;
  const weaponShare = nWeapons ? (candidates.length - nWeapons) / nWeapons : 1;
  return weightedPick(candidates, (b) => {
    // prefer items close to ilvl
    const gap = ilvl - b.qlvl;
    const w = (gap < 12 ? 3 : gap < 24 ? 1.5 : 0.6) * (categoryOf(b.type) === 'weapon' ? weaponShare : 1);
    return b.type === 'ring' || b.type === 'amulet' ? w * 0.5 : w;
  })!;
}

/** a random base of a D2 item type (a recipe's "any polearm") at an item level */
export function pickBaseOfType(itype: string, ilvl: number): ItemBase | null {
  const c = EQUIPPABLE_BASES.filter((b) => itypeMatches(b, [itype]) && !b.noDrop);
  if (!c.length) return null;
  const fit = c.filter((b) => b.qlvl <= ilvl);
  return pick(fit.length ? fit : c);
}

export function rollEquipment(ilvl: number, opts: RollOpts = {}): Item {
  const mf = opts.mf ?? 0;
  const q = opts.quality ?? 0;
  const base = opts.base ?? pickBase(ilvl);
  const qMult = [1, 2, 3.5, 5][q] ?? 1;
  const uniqueChance = 0.012 * qMult * (1 + effectiveMf(mf, 250) / 100);
  const setChance = 0.02 * qMult * (1 + effectiveMf(mf, 500) / 100);
  const rareChance = 0.07 * qMult * (1 + effectiveMf(mf, 600) / 100);
  const magicChance = 0.32 * Math.min(2, qMult) * (1 + mf / 100);

  if (chance(uniqueChance)) {
    const u = makeUnique(base, ilvl);
    if (u) return u;
    // no unique for this base: fall back to rare (D2 gives a "failed unique" rare-ish)
    return withStaffMods(createItem(base.id, 'rare', ilvl));
  }
  if (chance(setChance)) {
    const s = makeSetItem(base, ilvl);
    if (s) return s;
    return withStaffMods(createItem(base.id, 'magic', ilvl));
  }
  const jewelry = base.type === 'ring' || base.type === 'amulet';
  if (chance(rareChance)) return withStaffMods(createItem(base.id, 'rare', ilvl));
  if (jewelry || chance(magicChance)) return withStaffMods(createItem(base.id, 'magic', ilvl));
  const item = withStaffMods(createItem(base.id, chance(0.12) ? 'superior' : 'normal', ilvl));
  // sockets on white items, up to what the base and the item level allow
  const cap = maxSocketsAt(base, ilvl);
  if (cap > 0 && chance(0.28)) {
    item.sockets = randInt(1, cap);
    item.name = `有孔的${item.rarity === 'superior' ? '优质' : ''}${base.name}`;
  }
  return item;
}

function withStaffMods(item: Item): Item {
  addStaffMods(item);
  return item;
}

export function potionForLevel(ilvl: number, kind: 'hp' | 'mp' | 'rejuv'): Item {
  if (kind === 'rejuv') return createItem(ilvl >= 28 && chance(0.25) ? 'rejuvfull' : 'rejuv');
  const tiers = ALL_BASES.filter((b) => b.type === 'potion' && b.id.startsWith(kind) && b.qlvl <= ilvl);
  const best = tiers.slice(-2);
  return createItem(pick(best).id);
}

// ───────────────────────── runes, gems, jewelry: D2's "Good" treasure classes ─────────────────────────

/** the Good class of the highest act and difficulty whose level the monster reaches */
function goodTc(mlvl: number) {
  let tc = D2_GOOD_TCS[0];
  for (const t of D2_GOOD_TCS) if (t.level <= mlvl) tc = t;
  return tc;
}

/** gem types within a grade: six gems at 3, skulls at 2 (Chipped Gem … Perfect Gem classes) */
export function rollGem(grade: number): Item {
  const g = weightedPick(GEMS.filter((x) => x.grade === grade), (x) => (x.gem === 'skull' ? 2 : 3))!;
  return createItem(g.id);
}

export function rollRune(mlvl: number): Item {
  const tc = goodTc(mlvl);
  const e = tc.entries.find((x) => x.kind === 'rune') ?? D2_GOOD_TCS.find((t) => t.entries.some((x) => x.kind === 'rune'))!.entries.find((x) => x.kind === 'rune')!;
  const [id] = weightedPick(e.runes!, (r) => r[1])!;
  return createItem(id);
}

/** one pick from the Good class: a ring or amulet, a gem or a rune */
export function rollGood(mlvl: number, mf: number): Item {
  const e = weightedPick(goodTc(mlvl).entries, (x) => x.w)!;
  if (e.kind === 'gem') return rollGem(e.grade!);
  if (e.kind === 'rune') return createItem(weightedPick(e.runes!, (r) => r[1])![0]);
  // Jewelry: rings 8, amulets 4 (the jewels and charms in it don't exist here)
  return rollEquipment(mlvl, { mf, base: ITEM_BASES[chance(2 / 3) ? 'ring' : 'amulet'] });
}

export type Drop = { kind: 'gold'; amount: number } | { kind: 'item'; item: Item };

export function rollMonsterDrops(mlvl: number, quality: number, mf: number, gf: number): Drop[] {
  const picks = [1, 2, 4, 7][quality] ?? 1;
  const noDrop = [0.58, 0.25, 0.05, 0][quality] ?? 0.5;
  const drops: Drop[] = [];
  for (let i = 0; i < picks; i++) {
    if (chance(noDrop)) continue;
    const r = Math.random();
    if (r < 0.32) {
      const amount = Math.max(1, Math.floor(randInt(mlvl * 2, mlvl * 6 + 8) * (1 + gf / 100)));
      drops.push({ kind: 'gold', amount });
    } else if (r < 0.58) {
      const rr = Math.random();
      drops.push({ kind: 'item', item: potionForLevel(mlvl, rr < 0.55 ? 'hp' : rr < 0.93 ? 'mp' : 'rejuv') });
    } else if (r < 0.64 + mlvl * 0.0015) {
      drops.push({ kind: 'item', item: rollGood(mlvl, mf) });
    } else {
      drops.push({ kind: 'item', item: rollEquipment(mlvl, { mf, quality }) });
    }
  }
  // bosses always drop at least one rare+ item
  if (quality >= 3) drops.push({ kind: 'item', item: rollEquipment(mlvl + 2, { mf: mf + 200, quality: 3 }) });
  return drops;
}

// ───────────────────────── runewords ─────────────────────────

/** a white or superior item whose sockets hold, in order, a runeword's runes, of a type it allows */
export function findRuneword(item: Item): RunewordDef | undefined {
  if (item.rarity !== 'normal' && item.rarity !== 'superior') return undefined;
  if (item.socketed.length !== item.sockets) return undefined;
  const b = baseOf(item);
  return RUNEWORDS.find((rw) => rw.runes.length === item.sockets && rw.runes.every((r, i) => item.socketed[i] === r) && itypeMatches(b, rw.itypes, rw.etypes));
}

export function applyRuneword(item: Item, rw: RunewordDef) {
  item.rarity = 'runeword';
  item.runewordId = rw.id;
  item.name = rw.name;
  // keep superior bonus mods and staff mods, add the runeword's
  item.mods = item.mods.concat(propMods(rw.props, itemCategory(item) === 'weapon'));
  initCharges(item);
  item.reqLvl = Math.max(item.reqLvl, rw.reqLvl);
}

/** Starting gear for a new character */
export function starterKit(): { weapon: Item; offhand: Item; potions: Item[] } {
  const weapon = createItem('shortsword');
  const offhand = createItem('buckler');
  const potions = [createItem('hp1'), createItem('hp1'), createItem('hp1'), createItem('hp1'), createItem('mp1'), createItem('mp1')];
  return { weapon, offhand, potions };
}

export function isEquipment(item: Item): boolean {
  return categoryOf(ITEM_BASES[item.baseId].type) !== null;
}

