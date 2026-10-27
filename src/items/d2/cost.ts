// What Diablo II's vendors ask for an item, pay for it and charge to repair it:
// ITEMS_CalculateTransactionCost (D2Common Items.cpp:1962-2516) with its parts for staff mods,
// bonus stats and charges (2595-2650, 1841-1958, 1789-1838), the npc.json multipliers and
// ITEMS_IsRepairable (460-532). An unidentified item is priced on its base alone; an ethereal or
// class-only item fetches a quarter. The game's Item is read as D2 keeps the item: its rows and
// rolled properties, what fills its sockets, durability, stack. D2MOO references are to
// github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { D2X_NPC_PRICES } from '../../data/d2x/npc';
import { D2X_SKILL_REFS, D2X_SKILLS } from '../../data/d2x/skills';
import { D2X_GEMS, D2X_RUNES } from '../../data/d2x/socketables';
import { D2X_PROPERTIES, D2X_STAT_DESC } from '../../data/d2x/statdesc';
import type { D2Prop } from '../../data/d2x/types';
import type { Item, Socketed } from '../item';
import { affixRow } from './affixes';
import { D2_BASES, d2Base, hasDurability, isArmor, isType, isWeapon, ownType } from './bases';
import { SET_ITEM_BY_ID, UNIQUE_BY_ID } from './legendary';
import type { D2Base, D2Quality, Difficulty } from './types';

/** C integer division, toward zero */
const idiv = (a: number, b: number) => Math.trunc(a / b);

/** what a price is worked out for: the hero buying it, selling it, or having it repaired */
export type Transaction = 'buy' | 'sell' | 'repair';

/** who the hero trades with, and what changes the price on the hero's side */
export interface TradeSpec {
  /** the vendor: an npc.json key (akara, charsi, gheed, …) */
  npc: string;
  difficulty?: Difficulty;
  /** quests whose reward is granted or pending: their vendors' multipliers apply on top (Items.cpp:2417-2449) */
  quests?: ReadonlySet<string>;
  /** the hero's "reduces all vendor prices" % (item_reducedprices, at most 99: Items.cpp:2026-2031) */
  reduced?: number;
}

/** what pricing reads of an item: the game's Item (src/items/item.ts) */
export type CostItem = Pick<
  Item,
  'baseId' | 'rarity' | 'quality' | 'identified' | 'prefixes' | 'suffixes' | 'autoAffix' | 'uniqueRow' | 'setRow' | 'props' | 'staffMods' | 'socketed' | 'eth' | 'dur' | 'maxDur' | 'qty' | 'defense' | 'charges'
>;

/** D2's quality numbers (D2Items.h ITEMQUAL_*): magic … tempered price their affixes */
const RANK: Record<D2Quality, number> = { low: 1, normal: 2, superior: 3, magic: 4, set: 5, rare: 6, unique: 7, crafted: 8 };
const MAGIC = 4;
const TEMPERED = 9;

/** the item's D2 quality: a runeword's is its base item's, an old item's its rarity */
function qualityOf(item: CostItem): D2Quality {
  return item.quality ?? (item.rarity === 'runeword' ? 'normal' : (item.rarity as D2Quality));
}

// ───────────────────────── what is on the item ─────────────────────────

const SOCKETABLE = new Map([...D2X_RUNES, ...D2X_GEMS].map((s) => [s.id, s]));

/** the code of what fills a socket */
const fillerCode = (s: Socketed) => (typeof s === 'string' ? s : s.baseId);

/** a gem's or rune's list for the item's gemapplytype (0 weapon, 1 armor and helms, 2 shields); a jewel's own rolls */
function fillerProps(b: D2Base, s: Socketed): D2Prop[] {
  if (typeof s !== 'string') return [...(s.props ?? []), ...(s.staffMods ?? [])];
  const g = SOCKETABLE.get(s);
  if (!g) return [];
  const t = b.gemType ?? (isWeapon(b) ? 0 : isType(b, 'shld') ? 2 : 1);
  return t === 0 ? g.weapon : t === 2 ? g.shield : g.armor;
}

/** what itemProps reads */
export type PropItem = Pick<CostItem, 'baseId' | 'props' | 'staffMods' | 'socketed'>;

/** every property on the item as its stats have them: its own, its staff mods and its sockets' fillers' (an unknown item's own only) */
export function itemProps(item: PropItem): D2Prop[] {
  const b = D2_BASES[item.baseId];
  const own = [...(item.props ?? []), ...(item.staffMods ?? [])];
  return b ? [...own, ...item.socketed.flatMap((s) => fillerProps(b, s))] : own;
}

/** a stat-like property's total on the item (rep-dur, rep-quant, stack…): func 17 codes keep it in par */
export function propTotal(item: PropItem, code: string): number {
  return itemProps(item)
    .filter((p) => p.c === code)
    .reduce((s, p) => s + (Number(p.p ?? 0) || p.min), 0);
}

/** STAT_ITEM_INDESCTRUCTIBLE: never wears out, nothing to repair */
export function isIndestructible(item: PropItem): boolean {
  return itemProps(item).some((p) => p.c === 'indestruct');
}

/** ITEMS_HasDurability (Items.cpp:2862-2876): a base with durability, some most durability, not indestructible */
export function wears(item: CostItem): boolean {
  const b = D2_BASES[item.baseId];
  return !!b && hasDurability(b) && !!item.maxDur && !isIndestructible(item);
}

/** the charged skills on the item: skill, level, most charges and charges left */
export function chargedSkills(item: Pick<CostItem, 'props' | 'charges'>): { skill: string; lvl: number; max: number; left: number }[] {
  return (item.props ?? [])
    .filter((p) => p.c === 'charged')
    .map((p) => ({ skill: String(p.p), lvl: p.max, max: p.min, left: item.charges?.[String(p.p)] ?? p.min }));
}

/**
 * ITEMS_IsRepairable (Items.cpp:460-532): identified and not ethereal, and charges used, or its
 * type repairs (ItemTypes.txt Repair) and it is a throwing stack or wears
 */
export function isRepairable(item: CostItem): boolean {
  const b = D2_BASES[item.baseId];
  if (!b || item.identified === false || item.eth) return false;
  if (chargedSkills(item).some((c) => c.left < c.max)) return true;
  const t = ownType(b);
  if (!t.repair) return false;
  if (t.throwable && b.stack) return true;
  return wears(item);
}

// ───────────────────────── the price's parts ─────────────────────────

/** sell (what the hero pays), buy (what the vendor pays) and repair, as D2 carries them through */
interface Costs {
  sell: number;
  buy: number;
  rep: number;
}

/** a row's share of a cost: add + cost × mult / 1024, or past 65535 mult × (cost / 1024), as D2 keeps it in 32 bits */
function rowPart(cost: number, mult = 0, add = 0): number {
  return add + (cost > 65535 && mult ? mult * idiv(cost, 1024) : idiv(cost * mult, 1024));
}

/** a row's share of all three (an affix's dwMultiply / dwAdd, a unique's or set item's cost mult / add) */
function rowParts(c: Costs, mult = 0, add = 0): Costs {
  return { sell: rowPart(c.sell, mult, add), buy: rowPart(c.buy, mult, add), rep: rowPart(c.rep, mult, add) };
}

/** a skill's price columns (Skills.txt cost mult / cost add) and its level requirement */
function skillRow(name: string) {
  const s = D2X_SKILLS[name] ?? D2X_SKILL_REFS[name];
  return s ? { mult: s.cost?.mult ?? 0, add: s.cost?.add ?? 0, reqLvl: s.reqLvl } : undefined;
}

/**
 * ITEMS_CalculateAdditionalCostsForItemSkill (Items.cpp:2595-2650): on a type with staff mods, each
 * +N to a skill adds (2N − 1) × (cost add + cost × cost mult / 1024), a quarter of that to what the
 * vendor pays
 */
function staffSkillCosts(item: CostItem, b: D2Base, c: Costs, div: number) {
  if (!ownType(b).staffMods) return;
  let sell = 0;
  let buy = 0;
  let rep = 0;
  for (const p of itemProps(item)) {
    if (p.c !== 'skill') continue;
    const s = skillRow(String(p.p));
    if (!s) continue;
    const n = 2 * p.min - 1;
    if (c.sell > 65535 && s.mult) {
      sell += n * (s.add + c.sell * idiv(s.mult, 1024));
      buy += n * (s.add + c.buy * idiv(s.mult, 4096));
      rep += n * (s.add + c.rep * idiv(s.mult, 1024));
    } else {
      sell += n * (s.add + idiv(s.mult * c.sell, 1024));
      buy += n * (s.add + idiv(s.mult * c.buy, 4096));
      rep += n * (s.add + idiv(s.mult * c.rep, 1024));
    }
  }
  c.sell += idiv(sell, div);
  c.buy += idiv(buy, div);
  c.rep += idiv(rep, div);
}

/** one stat of the item's: its value, and the skill and level its layer packs (procs, charges, +skills) */
interface StatEntry {
  stat: string;
  v: number;
  skill?: string;
  lvl?: number;
}

/**
 * The item's stats from its properties, one per stat and layer as D2's stat list sums them: each
 * code's Properties.txt funcs (D2Common ItemMods.cpp's property functions). Damage goes on the
 * pairs the base has (funcs 5 and 6, 3078-3327: a weapon's one- or two-handed and thrown damage,
 * all three anywhere else), enhanced damage on both its percentages (func 7, 3329-3420)
 */
export function itemStats(props: readonly D2Prop[], b: D2Base): StatEntry[] {
  const out = new Map<string, StatEntry>();
  const add = (stat: string | undefined, v: number, layer: string | number = '', skill?: string, lvl?: number) => {
    if (!stat || !v) return;
    const k = `${stat}|${layer}`;
    const e = out.get(k);
    if (e) e.v += v;
    else out.set(k, { stat, v, skill, lvl });
  };
  const weapon = isWeapon(b);
  const w = b as { dmg1?: [number, number]; dmg2?: [number, number] };
  const throwable = !!ownType(b).throwable;
  /** funcs 5 / 6: the min (0) or max (1) of a damage pair, onto the base's own pairs */
  const damage = (i: 0 | 1, v: number) => {
    const one = !!w.dmg1?.[i];
    const two = !!w.dmg2?.[i];
    if (!weapon || one || !two) add(i ? 'maxdamage' : 'mindamage', v);
    if (!weapon || two || !one) add(i ? 'secondary_maxdamage' : 'secondary_mindamage', v);
    if (!weapon || throwable) add(i ? 'item_throw_maxdamage' : 'item_throw_mindamage', v);
  };
  for (const p of props) {
    for (const d of D2X_PROPERTIES[p.c] ?? []) {
      switch (d.func) {
        case 5:
          damage(0, p.min);
          break;
        case 6:
          damage(1, p.min);
          break;
        case 7:
          add('item_mindamage_percent', p.min);
          add('item_maxdamage_percent', p.min);
          break;
        case 15:
          // func 15 hands the normal damage pair to func 5 (ItemMods.cpp:3962-3990)
          if (d.stat === 'mindamage') damage(0, p.min);
          else add(d.stat, p.min);
          break;
        case 16:
          if (d.stat === 'maxdamage') damage(1, p.max);
          else add(d.stat, p.max);
          break;
        case 17:
          // per level, and lengths: the value is par
          add(d.stat, Number(p.p ?? 0) || p.min);
          break;
        case 10:
          add(d.stat, p.min, String(p.p ?? d.val ?? ''));
          break;
        case 11:
        case 19:
          add(d.stat, p.min, `${p.p}|${p.max}`, String(p.p), p.max);
          break;
        case 21:
          add(d.stat, p.min, d.val ?? 0);
          break;
        case 22:
          add(d.stat, p.min, String(p.p), String(p.p));
          break;
        case 12:
        case 20:
        case 23:
        case 25:
        case 36:
          // rolled into other codes as made, or a flag with no price
          break;
        default:
          add(d.stat, p.min, p.p !== undefined ? String(p.p) : '');
      }
    }
  }
  return [...out.values()];
}

/**
 * ITEMS_CalculateAdditionalCostsForBonusStats (Items.cpp:1841-1958): each stat the item's own lists
 * add (affixes, a superior row, a runeword, its sockets' fillers) adds Add + value × cost × Multiply
 * / 1024 of ItemStatCost; a skill's level takes the skill's cost mult / add instead (encode 1, and
 * 2 and 3 by the level in the layer), at a quarter for what the vendor pays. By-time stats (encode
 * 4, their value the day's average) are priced on their value as rolled.
 */
function bonusStatCosts(item: CostItem, b: D2Base, c: Costs, div: number) {
  let sell = 0;
  let buy = 0;
  let rep = 0;
  for (const e of itemStats(itemProps(item), b)) {
    const d = D2X_STAT_DESC[e.stat];
    if (d?.enc === 1 || d?.enc === 2 || d?.enc === 3) {
      const s = skillRow(e.skill ?? '');
      if (!s) continue;
      const v = d.enc === 1 ? e.v : (e.lvl ?? 0);
      if (v * c.sell > 65535 && s.mult) {
        sell += s.add + s.mult * idiv(v * c.sell, 1024);
        buy += s.add + s.mult * idiv(v * c.buy, 4096);
        rep += s.add + s.mult * idiv(v * c.rep, 1024);
      } else {
        sell += s.add + idiv(v * c.sell * s.mult, 1024);
        buy += s.add + idiv(v * s.mult * c.buy, 4096);
        rep += s.add + idiv(v * s.mult * c.rep, 1024);
      }
      continue;
    }
    const [mult, add] = d?.cost ?? [0, 0];
    if (e.v * c.sell > 65535 && mult) {
      sell += add + mult * idiv(e.v * c.sell, 1024);
      buy += add + mult * idiv(e.v * c.buy, 1024);
      rep += add + mult * idiv(e.v * c.rep, 1024);
    } else {
      sell += add + idiv(e.v * c.sell * mult, 1024);
      buy += add + idiv(e.v * mult * c.buy, 1024);
      rep += add + idiv(e.v * mult * c.rep, 1024);
    }
  }
  c.sell += idiv(sell, div);
  c.buy += idiv(buy, div);
  c.rep += idiv(rep, div);
}

/**
 * ITEMS_CalculateAdditionalCostsForChargedSkills (Items.cpp:1789-1838) at 10000: what recharging
 * adds to a repair, per charged skill with charges used: (cost add + 10000 × (level + 2 × (reqlevel
 * / 6) + 2) × cost mult / 1024) × the share of its charges used
 */
export function rechargeCost(item: Pick<CostItem, 'props' | 'charges'>): number {
  let cost = 0;
  for (const c of chargedSkills(item)) {
    if (c.left >= c.max) continue;
    const s = skillRow(c.skill);
    if (!s) continue;
    const base = 10000 * (c.lvl + 2 * idiv(s.reqLvl, 6) + 2);
    const add = base > 65535 && s.mult ? s.mult * idiv(base, 1024) : idiv(base * s.mult, 1024);
    cost += idiv((s.add + add) * (c.max - c.left), c.max);
  }
  return cost;
}

/** a multiplier out of 1024, as npc.json keeps it (0.9375 is 960) */
const m1024 = (x: number) => Math.round(x * 1024);

/**
 * What the item costs the hero to buy, fetches when sold, or costs to repair, at a vendor
 * (ITEMS_CalculateTransactionCost, Items.cpp:1962-2516): its base cost (a tome's per scroll in it,
 * ammunition's per arrow, armor's by its defense of the base's most), then if identified its
 * automagic, affix, unique or set rows and bonus stats, a low quality item half off; half of each
 * socket filler's cost; a quarter of what the vendor pays for ethereal and class items; repairs by
 * the share of durability missing; the vendor's multipliers; stacks by their size. A sale fetches
 * at most the vendor's limit (npc.json max buy); repairs and purchases take the hero's reduced
 * prices. Never less than 1; a repair of what can't be repaired is 0.
 */
export function transactionCost(item: CostItem, kind: Transaction, spec: TradeSpec): number {
  const npc = D2X_NPC_PRICES[spec.npc];
  if (!npc) throw new Error(`no vendor ${spec.npc}`);
  if (kind === 'repair' && !isRepairable(item)) return 0;
  const b = d2Base(item.baseId);
  const t = ownType(b);
  const qty = Math.max(item.qty ?? 0, 0) || 1;
  const reduced = Math.min(spec.reduced ?? 0, 99);
  const maxStack = Math.min((b.stack?.[1] ?? 0) + propTotal(item, 'stack'), 511);
  const book = isType(b, 'book');

  let c: Costs = { sell: 0, buy: 0, rep: 0 };
  let div = 1;
  if (book) {
    // a tome: its cost and Books.txt CostPerCharge for each scroll in it (Items.cpp:2061-2068)
    c.sell = c.buy = b.cost + qty * (b.chargeCost ?? 0);
  } else if (t.quiver) {
    // arrows and bolts: their cost is for 1024 of them, and a refill of the stack (2073-2086)
    c.sell = c.buy = idiv(qty * b.cost, 1024);
    c.rep = idiv(maxStack * b.cost, 1024);
  } else {
    c.sell = c.buy = c.rep = b.cost;
    // a stack's parts are a share of one of its items' (2088-2112)
    if (b.stack) div = Math.max(maxStack, 1);
  }
  // armor by its own defense of the base's most (2119-2131)
  if (isArmor(b) && 'ac' in b && b.ac[1] - b.ac[0] !== -1 && b.ac[1]) {
    const ac = item.defense ?? 0;
    c.sell = c.buy = c.rep = idiv(ac * b.cost, b.ac[1]);
  }
  const q = RANK[qualityOf(item)] ?? 2;
  if (q < MAGIC || q > TEMPERED) staffSkillCosts(item, b, c, div);
  if (item.identified !== false) {
    let part: Costs = { sell: 0, buy: 0, rep: 0 };
    const plus = (r: Costs) => (part = { sell: part.sell + r.sell, buy: part.buy + r.buy, rep: part.rep + r.rep });
    // (a row this build doesn't have prices nothing)
    const row = (kind: 'prefix' | 'suffix' | 'auto', id: number) => {
      try {
        return affixRow(kind, id);
      } catch {
        return undefined;
      }
    };
    if (item.autoAffix !== undefined) {
      const a = row('auto', item.autoAffix);
      part = rowParts(c, a?.priceMul, a?.priceAdd);
    }
    const affixes = (ids: number[] | undefined, kind: 'prefix' | 'suffix', n: number) => {
      for (const id of (ids ?? []).slice(0, n)) {
        const a = row(kind, id);
        plus(rowParts(c, a?.priceMul, a?.priceAdd));
      }
    };
    const unique = item.uniqueRow !== undefined ? UNIQUE_BY_ID.get(item.uniqueRow) : undefined;
    const setItem = item.setRow !== undefined ? SET_ITEM_BY_ID.get(item.setRow) : undefined;
    // a unique without its row is priced as a magic item (the switch falls through: 2203-2224)
    const quality = qualityOf(item);
    switch (quality === 'unique' && !unique ? 'magic' : quality) {
      case 'rare':
      case 'crafted':
        affixes(item.prefixes, 'prefix', 3);
        affixes(item.suffixes, 'suffix', 3);
        bonusStatCosts(item, b, c, div);
        break;
      case 'unique':
        plus(rowParts(c, unique!.costMult, unique!.costAdd));
        break;
      case 'magic':
        affixes(item.prefixes, 'prefix', 1);
        affixes(item.suffixes, 'suffix', 1);
        bonusStatCosts(item, b, c, div);
        break;
      case 'superior':
        bonusStatCosts(item, b, c, div);
        break;
      case 'set':
        if (setItem) plus(rowParts(c, setItem.costMult, setItem.costAdd));
        break;
      case 'low':
        part = { sell: idiv(c.sell, -2), buy: idiv(c.buy, -2), rep: idiv(c.rep, -2) };
        break;
      default:
        break;
    }
    c.sell += idiv(part.sell, div);
    c.buy += idiv(part.buy, div);
    c.rep += idiv(part.rep, div);
    if (q >= MAGIC && q <= TEMPERED) staffSkillCosts(item, b, c, div);
  }
  // half of each socket filler's own cost (2310-2325); a quarter of what the vendor pays for
  // ethereal and class items (2326-2339)
  for (const s of item.socketed) {
    // (a later build's rune this one doesn't know adds nothing)
    const half = idiv(D2_BASES[fillerCode(s)]?.cost ?? 0, 2);
    c = { sell: c.sell + half, buy: c.buy + half, rep: c.rep + half };
  }
  if (item.eth) c.buy = idiv(c.buy, 4);
  if (t.cls) c.buy = idiv(c.buy, 4);

  const wearing = wears(item);
  const maxDur = item.maxDur ?? 0;
  const dur = item.dur ?? maxDur;
  if (kind === 'sell') {
    // a broken ethereal item fetches nothing (2341-2350)
    if (item.eth && wearing && dur <= 0) c.buy = 0;
  } else if (kind === 'repair' && !t.quiver && !t.throwable && wearing) {
    // by the share of durability missing; a self-repairing item's all but its last point (2351-2385)
    if (dur < maxDur) {
      if (propTotal(item, 'rep-dur')) c.rep = dur < maxDur - 1 ? idiv(c.rep * (maxDur - 1), maxDur) : 0;
      else c.rep = idiv(c.rep * (maxDur - dur), maxDur);
    } else c.rep = 0;
  }

  // the vendor's multipliers (2387-2416; the buy branch tests the sell multiplier, as D2 does)
  const sellMult = m1024(npc.heroBuys);
  const buyMult = m1024(npc.heroSells);
  const repMult = m1024(npc.repair);
  c.sell = c.sell <= 65535 || !sellMult ? idiv(c.sell * sellMult, 1024) : sellMult * idiv(c.sell, 1024);
  c.buy = c.buy <= 65535 || !sellMult ? idiv(c.buy * buyMult, 1024) : idiv(c.buy, 1024) * buyMult;
  c.rep = c.rep <= 65535 || !repMult ? idiv(c.rep * repMult, 1024) : repMult * idiv(c.rep, 1024);
  for (const qm of npc.quests ?? []) {
    if (!spec.quests?.has(qm.quest)) continue;
    const [s, bu, r] = [m1024(qm.heroBuys), m1024(qm.heroSells), m1024(qm.repair)];
    c.sell = c.sell > 65535 && s ? s * idiv(c.sell, 1024) : idiv(c.sell * s, 1024);
    c.buy = c.buy > 65535 && bu ? bu * idiv(c.buy, 1024) : idiv(c.buy * bu, 1024);
    c.rep = c.rep > 65535 && r ? r * idiv(c.rep, 1024) : idiv(c.rep * r, 1024);
  }

  // by the stack (2451-2482): a throwing stack fetches its full stack less the refill it needs
  if (!book && !t.quiver) {
    c.sell *= qty;
    if (b.stack && isRepairable(item)) {
      c.rep = qty < maxStack && !propTotal(item, 'rep-quant') ? c.rep * (maxStack - qty) : 0;
      c.buy = c.buy * maxStack - c.rep;
    } else c.buy *= qty;
  }
  // a repair recharges too (2486-2492); a sale fetches at most the vendor's limit (2494-2497), the rest less reduced prices (2499-2510)
  if (kind === 'repair' && !item.eth) c.rep += rechargeCost(item);
  let cost = Math.min(c.buy, npc.maxPay[spec.difficulty ?? 0]);
  if (kind === 'repair') cost = c.rep - idiv(c.rep * reduced, 100);
  else if (kind === 'buy') cost = c.sell - idiv(c.sell * reduced, 100);
  return Math.max(cost, 1);
}
