import { chance, pick, randInt, uid, weightedPick } from '../core/math';
import { AFFIXES, RARE_FIRST, RARE_SECOND, type AffixDef } from '../data/affixes';
import { ALL_BASES, EQUIPPABLE_BASES, ITEM_BASES, categoryOf, type ItemBase } from '../data/items';
import { RUNES, RUNEWORDS, SETS, UNIQUES, type RunewordDef } from '../data/legendary';
import type { StatKey } from '../data/stats';
import { itemCategory, type Item, type ItemMod, type Rarity } from './item';

function rollMods(ranges: [StatKey, number, number][]): ItemMod[] {
  return ranges.map(([stat, min, max]) => ({ stat, value: randInt(min, max) }));
}

function baseDefense(b: ItemBase): number | undefined {
  return b.def ? randInt(b.def[0], b.def[1]) : undefined;
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
  if (b.type === 'potion' || b.type === 'rune') {
    item.reqLvl = b.type === 'rune' ? b.qlvl : 1;
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

function eligibleAffixes(item: Item, kind: 'prefix' | 'suffix', used: Set<string>): AffixDef[] {
  const cat = itemCategory(item);
  if (!cat) return [];
  return AFFIXES.filter((a) => a.kind === kind && a.level <= item.ilvl && a.cats.includes(cat) && !used.has(a.group));
}

function addAffix(item: Item, kind: 'prefix' | 'suffix', used: Set<string>): AffixDef | undefined {
  const pool = eligibleAffixes(item, kind, used);
  // favour higher tiers a little at high ilvl
  const a = weightedPick(pool, (x) => x.weight * (1 + x.level / 40));
  if (!a) return undefined;
  used.add(a.group);
  for (const m of a.mods) item.mods.push({ stat: m.stat, value: randInt(m.min, m.max) });
  item.reqLvl = Math.max(item.reqLvl, Math.floor(a.level * 0.85));
  return a;
}

function applyMagic(item: Item) {
  const b = ITEM_BASES[item.baseId];
  item.rarity = 'magic';
  const used = new Set<string>();
  const roll = Math.random();
  let pre: AffixDef | undefined;
  let suf: AffixDef | undefined;
  if (roll < 0.4) {
    pre = addAffix(item, 'prefix', used);
    suf = addAffix(item, 'suffix', used);
  } else if (roll < 0.7) {
    pre = addAffix(item, 'prefix', used);
  } else {
    suf = addAffix(item, 'suffix', used);
  }
  if (!pre && !suf) suf = addAffix(item, 'suffix', used) ?? undefined;
  item.name = `${pre ? pre.name : ''}${b.name}${suf ? ' ' + suf.name : ''}`;
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
      if (addAffix(item, 'prefix', used)) p++;
    } else if (addAffix(item, 'suffix', used)) s++;
  }
  const cat = itemCategory(item)!;
  item.name = pick(RARE_FIRST) + pick(RARE_SECOND[cat]);
}

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

function pickBase(ilvl: number): ItemBase {
  const candidates = EQUIPPABLE_BASES.filter((b) => b.qlvl <= ilvl && !b.noDrop);
  return weightedPick(candidates, (b) => {
    // prefer items close to ilvl
    const gap = ilvl - b.qlvl;
    const w = gap < 12 ? 3 : gap < 24 ? 1.5 : 0.6;
    return b.type === 'ring' || b.type === 'amulet' ? w * 0.5 : w;
  })!;
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
    return createItem(base.id, 'rare', ilvl);
  }
  if (chance(setChance)) {
    const s = makeSetItem(base, ilvl);
    if (s) return s;
    return createItem(base.id, 'magic', ilvl);
  }
  const jewelry = base.type === 'ring' || base.type === 'amulet';
  if (chance(rareChance)) return createItem(base.id, 'rare', ilvl);
  if (jewelry || chance(magicChance)) return createItem(base.id, 'magic', ilvl);
  const item = createItem(base.id, chance(0.12) ? 'superior' : 'normal', ilvl);
  // sockets on white items
  if (base.maxSockets && chance(0.28)) {
    const cap = Math.min(base.maxSockets, ilvl < 10 ? 2 : ilvl < 22 ? 3 : 4);
    item.sockets = randInt(1, cap);
    item.name = `有孔的${item.rarity === 'superior' ? '优质' : ''}${base.name}`;
  }
  return item;
}

export function potionForLevel(ilvl: number, kind: 'hp' | 'mp' | 'rejuv'): Item {
  if (kind === 'rejuv') return createItem(ilvl >= 28 && chance(0.25) ? 'rejuvfull' : 'rejuv');
  const tiers = ALL_BASES.filter((b) => b.type === 'potion' && b.id.startsWith(kind) && b.qlvl <= ilvl);
  const best = tiers.slice(-2);
  return createItem(pick(best).id);
}

export function rollRune(ilvl: number): Item {
  const candidates = RUNES.filter((r) => r.level <= ilvl + 2);
  const r = weightedPick(candidates, (x) => Math.pow(0.6, RUNES.indexOf(x)) * 10)!;
  return createItem(r.id);
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
    } else if (r < 0.62 + mlvl * 0.0015) {
      drops.push({ kind: 'item', item: rollRune(mlvl) });
    } else {
      drops.push({ kind: 'item', item: rollEquipment(mlvl, { mf, quality }) });
    }
  }
  // bosses always drop at least one rare+ item
  if (quality >= 3) drops.push({ kind: 'item', item: rollEquipment(mlvl + 2, { mf: mf + 200, quality: 3 }) });
  return drops;
}

export function findRuneword(item: Item): RunewordDef | undefined {
  if (item.rarity !== 'normal' && item.rarity !== 'superior') return undefined;
  if (item.socketed.length !== item.sockets) return undefined;
  const cat = itemCategory(item);
  if (!cat) return undefined;
  return RUNEWORDS.find((rw) => rw.cats.includes(cat) && rw.runes.length === item.sockets && rw.runes.every((r, i) => item.socketed[i] === r));
}

export function applyRuneword(item: Item, rw: RunewordDef) {
  item.rarity = 'runeword';
  item.runewordId = rw.id;
  item.name = rw.name;
  // keep superior bonus mods, add runeword mods
  item.mods = item.mods.concat(rollMods(rw.mods));
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
