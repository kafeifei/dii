// Making an item Diablo II's way, for every place the game makes one (drops, chests, the shop, the
// cube, the debug panel, the starting kit): src/items/d2 rolls the quality, affixes, uniques, set
// items and their properties; this puts what they rolled into an Item, with what making it does to
// the item itself (its defense, durability, sockets, stack). D2MOO references are to
// github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { uid } from '../core/math';
import { D2X_QUALITY } from '../data/d2x/quality';
import type { D2Prop } from '../data/d2x/types';
import { affixPool, affixRow, pickAffix, requiredLevel, rollAffixes, type AffixDrop, type AffixSpec } from './d2/affixes';
import { d2Base, hasDurability, isArmor, isWeapon, ownType } from './d2/bases';
import { makeRuneword, rollLegendary, SET_ITEM_BY_ID, UNIQUE_BY_ID } from './d2/legendary';
import { rollProps, type RolledProps } from './d2/props';
import { dropQuality, newDurability, type DropSpec } from './d2/quality';
import { roll } from './d2/rand';
import type { D2Base, D2Quality, Rand } from './d2/types';
import { displayName, type Item } from './item';

/** the game's own random source as D2's item rolls take it */
export const MATH_RAND: Rand = { next: () => Math.random() };

export interface MakeSpec extends DropSpec, AffixSpec {
  /** made identified (bought, the starting kit); otherwise as D2 drops it: magic and better unidentified */
  identified?: boolean;
  /**
   * repaired as made: a vendor's stock (SUnitNpc.cpp:258, 2564), D2GAME_NPC_RepairItem
   * (SUnitNpc.cpp:110-145) filling its durability and a throwing stack
   */
  repaired?: boolean;
}

/** what the item's rolled properties do to it as they go on: sockets, ethereal, more durability, charges */
function absorb(item: Item, r: RolledProps) {
  item.props = [...(item.props ?? []), ...r.props];
  if (r.sockets !== undefined) item.sockets = r.sockets;
  if (r.eth) item.eth = true;
  if (r.dur && item.maxDur !== undefined) item.maxDur = Math.min(item.maxDur + r.dur, 255);
  if (r.charges) item.charges = { ...item.charges, ...r.charges };
}

/**
 * A new armor's defense (D2Game Items.cpp:660-662): MinAC + a roll up to MaxAC, three quarters of
 * it on a low quality one (at least 1: ItemsMagic.cpp:1074-1078). Each enhanced defense property
 * then sets it to the base's MaxAC + 1, or one more than it already is (ItemMods.cpp:801-803 with
 * sub_6FD92CF0, 885-905), and ethereal makes it half again (ItemMods.cpp:2531-2549), the last
 * thing done to the item.
 */
function rollDefense(item: Item, rng: Rand) {
  const b = d2Base(item.baseId);
  if (!isArmor(b) || !('ac' in b)) return;
  let ac = b.ac[0] + roll(rng, b.ac[1] - b.ac[0] + 1);
  if (item.quality === 'low') ac = Math.max(Math.trunc((75 * ac) / 100), 1);
  for (const p of item.props ?? []) if (p.c === 'ac%') ac = Math.max(ac + 1, b.ac[1] + 1);
  if (item.eth) ac = Math.trunc((3 * ac) / 2);
  item.defense = ac;
}

/**
 * Maximum durability % (Properties.txt dur%, func 13: ItemMods.cpp:4233-4294): the most durability
 * goes up by the percentage and the item is repaired to it
 */
function applyDurPct(item: Item) {
  if (item.maxDur === undefined) return;
  const pct = (item.props ?? []).filter((p) => p.c === 'dur%').reduce((s, p) => s + p.min, 0);
  if (!pct) return;
  item.maxDur = Math.min(255, item.maxDur + Math.trunc((item.maxDur * pct) / 100));
  item.dur = item.maxDur;
}

/**
 * A stack's size as made (D2Game Items.cpp:668-683): throwing weapons roll min … max, and magic or
 * better ones are 1 (ITEMS_IsMagSetRarUniCrfOrTmp); misc stacks (tomes, keys, arrows) come with
 * Misc.txt's spawnstack
 */
function rollQuantity(item: Item, rng: Rand) {
  const b = d2Base(item.baseId);
  if (!b.stack) return;
  const [min, max, spawn] = b.stack;
  if (isWeapon(b)) {
    const q = item.quality ?? 'normal';
    item.qty = q === 'low' || q === 'normal' || q === 'superior' ? Math.max(roll(rng, max - min) + min, 1) : 1;
  } else item.qty = Math.max(1, spawn || min);
}

/** the Item an AffixDrop (and its legendary part) becomes: every value rolled, nothing derived yet */
function itemOf(spec: MakeSpec, d: AffixDrop & ReturnType<typeof rollLegendary>, rng: Rand): Item {
  const b = d2Base(spec.code);
  const item: Item = {
    uid: uid('i'),
    baseId: spec.code,
    rarity: d.quality,
    quality: d.quality,
    ilvl: spec.ilvl,
    name: '',
    mods: [],
    sockets: d.sockets,
    socketed: [],
    identified: spec.identified ?? d.identified,
    reqLvl: d.reqLvl,
  };
  if (d.dur !== undefined) {
    item.dur = d.dur;
    item.maxDur = d.maxDur;
  }
  if (d.eth) item.eth = true;
  if (d.prefixes?.length) item.prefixes = d.prefixes;
  if (d.suffixes?.length) item.suffixes = d.suffixes;
  if (d.autoAffix !== undefined) item.autoAffix = d.autoAffix;
  if (d.rareName) item.rareName = d.rareName;
  if (d.staffMods) item.staffMods = d.staffMods;
  if (d.qualityRow !== undefined) item.qualityRow = d.qualityRow;
  if (d.uniqueRow !== undefined) item.uniqueRow = d.uniqueRow;
  if (d.setRow !== undefined) item.setRow = d.setRow;
  if (d.setBonus) item.setBonus = d.setBonus;
  if (d.setCharges) item.setCharges = d.setCharges;
  // a unique's or set item's own rolled properties (rollLegendary did what they do to the item)
  if (d.props) item.props = d.props;
  if (d.charges) item.charges = { ...d.charges };
  // a superior item's QualityItems row (ItemsMagic.cpp:959-1019), low quality has none to roll
  if (d.quality === 'superior' && d.qualityRow !== undefined) {
    const row = D2X_QUALITY.find((q) => q.id === d.qualityRow);
    if (row) absorb(item, rollProps(row.props, b, spec.ilvl, rng));
  }
  // magic and rare affixes and the automagic row: each row's properties rolled (ITEMMODS_AssignProperty)
  const rows: D2Prop[] = [
    ...(d.prefixes ?? []).flatMap((id) => affixRow('prefix', id).props),
    ...(d.suffixes ?? []).flatMap((id) => affixRow('suffix', id).props),
    ...(d.autoAffix !== undefined ? affixRow('auto', d.autoAffix).props : []),
  ];
  if (rows.length) absorb(item, rollProps(rows, b, spec.ilvl, rng));
  applyDurPct(item);
  rollDefense(item, rng);
  rollQuantity(item, rng);
  // with its properties rolled: a skill-rand's skill asks its level too (d2/affixes.ts requiredLevel)
  item.reqLvl = requiredLevel({ ...item, quality: d.quality, socketed: [] });
  item.name = displayName({ ...item, identified: true });
  return item;
}

/** a new item of a base: its quality rolled with the magic find and the TC's ratios, or the one asked for */
export function makeItem(spec: MakeSpec, rng: Rand = MATH_RAND): Item {
  const q = dropQuality(spec, rng);
  const a = rollAffixes(q, spec, rng);
  const l = rollLegendary(a, spec, rng);
  const item = itemOf(spec, l, rng);
  if (spec.repaired) repair(item);
  return item;
}

/**
 * D2GAME_NPC_RepairItem (SUnitNpc.cpp:110-145): full durability and a throwing stack full, on an
 * item that can be repaired: identified and not ethereal (Items.cpp:460-469)
 */
function repair(item: Item) {
  if (item.identified === false || item.eth) return;
  if (item.maxDur !== undefined) item.dur = item.maxDur;
  const b = d2Base(item.baseId);
  if (b.stack && ownType(b).throwable) item.qty = b.stack[1];
}

/**
 * A magic item with one named affix (a cube recipe's pre= or suf=): the row given, and as a magic
 * item rolls its other side, half the time an affix of the other kind not in its group
 * (ItemsMagic.cpp:269-274, groups 171-193)
 */
export function makeMagicWith(spec: MakeSpec, kind: 'prefix' | 'suffix', row: number, rng: Rand = MATH_RAND): Item {
  const b = d2Base(spec.code);
  const named = affixRow(kind, row);
  const item = makeItem({ ...spec, quality: 'normal' }, rng);
  const other = kind === 'prefix' ? 'suffix' : 'prefix';
  const extra = roll(rng, 2) ? pickAffix(affixPool(b, spec.ilvl, other, false, new Set([named.group])), b, rng) : undefined;
  const ids = { prefix: [] as number[], suffix: [] as number[] };
  ids[kind].push(named.id);
  if (extra) ids[other].push(extra.id);
  // the plain item's own rolls go (a ring or amulet is made magic whatever is asked): only the named affix and its partner stay
  const out: Item = { ...item, rarity: 'magic', quality: 'magic', props: [], sockets: 0, identified: spec.identified ?? item.identified };
  delete out.qualityRow;
  delete out.prefixes;
  delete out.suffixes;
  delete out.charges;
  if (ids.prefix.length) out.prefixes = ids.prefix;
  if (ids.suffix.length) out.suffixes = ids.suffix;
  const rows = [
    ...ids.prefix.map((id) => affixRow('prefix', id).props),
    ...ids.suffix.map((id) => affixRow('suffix', id).props),
    out.autoAffix !== undefined ? affixRow('auto', out.autoAffix).props : [],
  ].flat();
  absorb(out, rollProps(rows, b, spec.ilvl, rng));
  out.reqLvl = requiredLevel({ ...out, quality: 'magic', socketed: [] });
  rollDefense(out, rng);
  out.name = displayName({ ...out, identified: true });
  return out;
}

/**
 * The runeword an item makes now that its last rune is in (legendary.ts makeRuneword, its rune's
 * item level the base's here: the game's runes don't keep their own), or false when it makes none
 */
export function applyRunewordTo(item: Item, rng: Rand = MATH_RAND): boolean {
  const q = (item.quality ?? (item.rarity === 'runeword' ? 'normal' : item.rarity)) as D2Quality;
  // a jewel matches no rune: its base code stands in for it
  const socketed = item.socketed.map((f) => (typeof f === 'string' ? f : f.baseId));
  const made = makeRuneword({ baseId: item.baseId, quality: q, sockets: item.sockets, socketed }, item.ilvl, rng);
  if (!made) return false;
  item.quality = q;
  item.rarity = 'runeword';
  item.runewordRow = made.runewordRow;
  item.runewordId = made.runewordRow;
  item.props = [...(item.props ?? []), ...made.props];
  if (made.dur && item.maxDur !== undefined) item.maxDur = Math.min(255, item.maxDur + made.dur);
  if (made.charges) item.charges = { ...item.charges, ...made.charges };
  item.name = displayName(item);
  return true;
}

/**
 * The most durability an item's own dur properties gave it, which an upgrade keeps (upgradeTo). Only
 * unique and set item rows have dur (no affix, quality or runeword row does), so it is what the item
 * has over its base's as made: the base's most, halved and one more on an ethereal drop (not on one
 * an ethereal property made: d2/quality.ts dropQuality, d2/legendary.ts applyRolled), kept within
 * the row's range
 */
function ownDurPoints(item: Item, b: D2Base): number {
  const row =
    item.quality === 'unique' && item.uniqueRow !== undefined ? UNIQUE_BY_ID.get(item.uniqueRow)
    : item.quality === 'set' && item.setRow !== undefined ? SET_ITEM_BY_ID.get(item.setRow)
    : undefined;
  const dur = (row?.props ?? []).filter((p) => p.c === 'dur');
  if (!row || !dur.length || item.maxDur === undefined || !hasDurability(b)) return 0;
  const lo = dur.reduce((s, p) => s + Math.min(p.min, p.max), 0);
  const hi = dur.reduce((s, p) => s + Math.max(p.min, p.max), 0);
  const full = Math.min(b.dur!, 255);
  const own = item.eth && !row.props.some((p) => p.c === 'ethereal') ? Math.floor(full / 2) + 1 : full;
  return Math.min(Math.max(item.maxDur - own, lo), hi);
}

/**
 * The cube's upgrade to an exceptional or elite base (CubeMain output "mod" with exc / eli,
 * PlrTrade.cpp:611-657): D2 copies the item onto the new base and makes its base stats again
 * (D2Game Items.cpp:614-700 D2GAME_InitItemStats). Armor's defense is a new roll in the new base's
 * MinAC–MaxAC: enhanced defense's bump to MaxAC + 1 and ethereal's half again were done to the old
 * base stat and are gone (enhanced defense % stays, a property). Durability is the new base's, up to
 * half off (Items.cpp:656-658, 684-686), plus what the item's own dur properties add, which sit in
 * its property list the copy keeps: an ethereal drop's halving was the old base stat's. A weapon's
 * damage is read off its base, ethereal ×1.5 as D2 makes it again on load (D2Common
 * Items.cpp:5468-5476). An old item's kept requirements (legacy) were its old base's: it now has the
 * new base's, and the level it was made with.
 */
export function upgradeTo(item: Item, code: string, rng: Rand = MATH_RAND) {
  const extra = ownDurPoints(item, d2Base(item.baseId));
  if (item.legacy) {
    item.reqLvl = Math.max(item.reqLvl, item.legacy.lvl);
    delete item.legacy;
  }
  item.baseId = code;
  const b = d2Base(code);
  if (hasDurability(b)) {
    const d = newDurability(b, rng);
    item.dur = d.dur;
    item.maxDur = Math.min(d.maxDur + extra, 255);
  } else {
    delete item.dur;
    delete item.maxDur;
  }
  if (isArmor(b) && 'ac' in b) item.defense = b.ac[0] + roll(rng, b.ac[1] - b.ac[0] + 1);
  else delete item.defense;
  rollQuantity(item, rng);
}

/**
 * A recipe's mods on what it makes, as crafted properties (PlrTrade.cpp:840-855
 * ITEMMODS_AddCraftPropertyList): an upgrade's levelreq, which requiredLevel adds (D2Common
 * Items.cpp:1435). Its sock mod is the cube's to roll (cube.ts)
 */
export function addCraftProps(item: Item, mods: readonly D2Prop[], rng: Rand = MATH_RAND) {
  const rest = mods.filter((m) => m.c !== 'sock');
  if (!rest.length) return;
  const b = d2Base(item.baseId);
  absorb(item, rollProps(rest, b, item.ilvl, rng));
}
