import { D2X_CLASSES } from '../data/d2x/classes';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_LOW_QUALITY } from '../data/d2x/quality';
import { D2X_RARE_PREFIXES, D2X_RARE_SUFFIXES } from '../data/d2x/rare';
import { D2X_TOOLTIP_STRINGS as S } from '../data/d2x/statdesc';
import type { D2Prop } from '../data/d2x/types';
import { ITEM_BASES, UNKNOWN_BASE, categoryOf, type ItemBase, type Category } from '../data/items';
import { className, skillRef, skillTab } from '../data/d2/skillmap';
import { SKILL_BY_ID } from '../data/skills';
import { RUNE_BY_ID, RUNEWORD_BY_ID, SET_ITEMS, SOCKETABLE_BY_ID, UNIQUE_BY_ID, isOldRuneword, type Socketable } from '../data/legendary';
import { addStat, describeStats, INERT_STATS, PARAM_STATS, type StatBag, type StatKey } from '../data/stats';
import { affixRow, requiredLevel } from './d2/affixes';
import { classOnly, describeProps, fmt, type DescLine } from './d2/describe';
import { SET_BY_ID, SET_ITEM_BY_ID, UNIQUE_BY_ID as D2_UNIQUES, setBonuses, slotsOn } from './d2/legendary';
import type { D2Quality } from './d2/types';
import { ITEM_STATE_CODES, modProps, propMods, rollMax } from './props';

/** an item's quality as shown: Diablo II's qualities, and runewords (a normal or superior item with a runeword) */
export type Rarity = 'low' | 'normal' | 'superior' | 'magic' | 'rare' | 'unique' | 'set' | 'crafted' | 'runeword';

export interface ItemMod {
  stat: StatKey;
  value: number;
  /** a skill (D2 name or this game's id), a D2 class code or a skill tab number */
  param?: string;
  /** skill level for procs and charges */
  lvl?: number;
  /** value is in eighths of a point per character level */
  perLvl?: boolean;
}

/**
 * An item, as the save keeps it (version 4's items, src/game/save.ts). baseId is a Diablo II base
 * code (src/data/items.ts); what it rolled is kept as D2 keeps it, rows and rolled properties, and
 * everything it gives is worked out from them (src/items/props.ts). Items from before the D2 items
 * keep the StatKey mods they were made with (mods) and the name they had.
 */
export interface Item {
  uid: string;
  baseId: string;
  rarity: Rarity;
  /** D2's quality (a runeword's is its base item's: normal or superior); unset on items from before it, read rarity */
  quality?: D2Quality;
  ilvl: number;
  /** the name it was made with, kept in the save; what it shows is displayName(item) */
  name: string;
  /** what an item from before the D2 items gives, as it was made; [] on every D2 item */
  mods: ItemMod[];
  /**
   * Every property it rolled, values in (min = max where D2 rolls one; per-level ones keep their
   * amount per level as par): affixes, a superior row, automagic, a unique's, a set item's own, a
   * runeword's. Staff mods and set bonus slots are kept apart
   */
  props?: D2Prop[];
  /** staff mods: +N to class skills ("skill" properties, min = max = N) */
  staffMods?: D2Prop[];
  /** rows of the magic prefix and suffix tables it rolled (D2xAffix.id), and its automagic row */
  prefixes?: number[];
  suffixes?: number[];
  autoAffix?: number;
  /** a rare or crafted item's name words: rows of the rare prefix and suffix tables */
  rareName?: [number, number];
  /** superior: its QualityItems row; low quality: its LowQualityItems row */
  qualityRow?: number;
  /** UniqueItems / SetItems row, by *ID (some keys repeat) */
  uniqueRow?: number;
  setRow?: number;
  /** a set item's green bonus slots as rolled, and the charges of each slot's charged skills */
  setBonus?: D2Prop[][];
  setCharges?: Record<string, number>[];
  /** a runeword's Runes.txt row (D2xRuneword.id) */
  runewordRow?: string;
  /** an armor's own defense as rolled (its base's, raised by enhanced defense, ethereal); kept as saved on old items */
  defense?: number;
  sockets: number;
  socketed: Socketed[];
  /** an old item's invented unique and set item (src/data/legendary.ts); a runeword's id (old invented ones too) */
  uniqueId?: string;
  setItemId?: string;
  runewordId?: string;
  /** false until identified (a scroll, a book); unset, like every item from before, is identified */
  identified?: boolean;
  /** durability left and at most; unset on items without any */
  dur?: number;
  maxDur?: number;
  /** ethereal: stronger, can't be repaired */
  eth?: boolean;
  /** how many there are in a stack (tomes' charges, keys, arrows); unset is one */
  qty?: number;
  /** the level it needs as made; itemReqLvl works out what it needs now */
  reqLvl: number;
  /** charges left, by skill, for "level N skill (X/Y charges)" */
  charges?: Record<string, number>;
  /**
   * An item from a save made before the Diablo II items, or before the D2 bases, keeps the
   * requirements it had: the level (runes don't raise it, only runes socketed since), and its old
   * base's strength / dexterity where the D2 base asks more
   */
  legacy?: { lvl: number; str: number; dex: number; runes: number };
  /**
   * On an unknown item (UNKNOWN_BASE): the item as saved, with the save's version and migration
   * counts (src/game/save.ts), so a build that knows it can put it back and catch it up
   */
  raw?: {
    v: number;
    mig: Partial<Record<string, number>>;
    item: unknown;
    /** from a save the first D2 release took the old runewords apart in */
    damaged?: boolean;
  };
}

/** what fills a socket: a rune's or gem's base id, or a whole item with its own mods (a jewel) */
export type Socketed = string | Item;

/** the base id of what fills a socket */
export function socketId(s: Socketed): string {
  return typeof s === 'string' ? s : s.baseId;
}

/** D2's colours by quality (crafted orange; low quality white like normal) */
export const RARITY_COLOR: Record<Rarity, string> = {
  low: '#d8d8d8',
  normal: '#d8d8d8',
  superior: '#d8d8d8',
  magic: '#7a7aff',
  rare: '#ffff6e',
  unique: '#c8a86a',
  set: '#22d422',
  crafted: '#ffa800',
  runeword: '#c8a86a',
};

export const SOCKETED_COLOR = '#8a8a8a';
export const RUNE_COLOR = '#ffa31a';
export const MOD_COLOR = '#7a7aff';
export const SET_BONUS_COLOR = '#22d422';
const INERT_COLOR = '#6a6a78';
const RED = '#ff4040';
/** what a greyed line says: it is shown as D2 has it, but does nothing here */
export const NOT_IN_GAME = '本游戏未实现';

export function baseOf(item: Item): ItemBase {
  return ITEM_BASES[item.baseId];
}

/** an item this build doesn't know, standing in for the one the save had (Item.raw) */
export function isUnknown(item: Item): boolean {
  return item.baseId === UNKNOWN_BASE;
}

/** D2's quality of an item (a runeword's base item's) */
export function qualityOf(item: Item): D2Quality {
  return item.quality ?? (item.rarity === 'runeword' ? 'normal' : (item.rarity as D2Quality));
}

/** identified: every item from before identification existed is */
export function isIdentified(item: Item): boolean {
  return item.identified !== false;
}

export function itemCategory(item: Item): Category | null {
  return categoryOf(baseOf(item).type);
}

export function itemColor(item: Item): string {
  const b = baseOf(item);
  if (b.type === 'rune') return RUNE_COLOR;
  // normal and superior items with sockets or ethereal are grey (D2)
  if ((item.rarity === 'normal' || item.rarity === 'superior') && (item.sockets > 0 || item.eth)) return SOCKETED_COLOR;
  return RARITY_COLOR[item.rarity] ?? RARITY_COLOR.normal;
}

/** which of a rune's or gem's three lists applies in this item: its base's gemapplytype (Items.txt) */
export function socketList(s: Socketable, item: Item) {
  const b = baseOf(item);
  const t = b.gemType ?? (itemCategory(item) === 'weapon' ? 0 : itemCategory(item) === 'shield' ? 2 : 1);
  return t === 0 ? s.weapon : t === 2 ? s.shield : s.armor;
}

/** the properties of what fills the sockets: runes' and gems' lists, jewels' own */
export function socketProps(item: Item): D2Prop[] {
  const out: D2Prop[] = [];
  for (const f of item.socketed) {
    if (typeof f !== 'string') {
      out.push(...ownProps(f));
      continue;
    }
    const s = SOCKETABLE_BY_ID[f];
    if (s) out.push(...socketList(s, item));
  }
  return out;
}

/** an item's own rolled properties and staff mods */
export function ownProps(item: Item): D2Prop[] {
  return [...(item.props ?? []), ...(item.staffMods ?? [])];
}

const modCache = new WeakMap<object, ItemMod[]>();
/** props as mods, kept per rolled list (lists are replaced, never changed in place) */
function cachedMods(props: D2Prop[] | undefined, onWeapon: boolean): ItemMod[] {
  if (!props?.length) return [];
  let m = modCache.get(props);
  if (!m) {
    m = propMods(props, onWeapon, rollMax);
    modCache.set(props, m);
  }
  return m;
}

/** the item's own mods: an old item's, then what its properties and staff mods give */
export function ownMods(item: Item): ItemMod[] {
  const w = itemCategory(item) === 'weapon';
  return [...item.mods, ...cachedMods(item.props, w), ...cachedMods(item.staffMods, w)];
}

/** mods from the runes, gems and jewels in an item's sockets */
export function socketMods(item: Item): ItemMod[] {
  const out: ItemMod[] = [];
  const onWeapon = itemCategory(item) === 'weapon';
  for (const f of item.socketed) {
    // a jewel brings what it rolled
    if (typeof f !== 'string') {
      out.push(...ownMods(f));
      continue;
    }
    const s = SOCKETABLE_BY_ID[f];
    if (s) out.push(...cachedMods(socketList(s, item), onWeapon));
  }
  return out;
}

/** a mod's value at a character level ("+X per level" mods grow with it) */
export function modValue(m: ItemMod, clvl: number): number {
  return m.perLvl ? Math.floor((m.value * clvl) / 8) : m.value;
}

function sumMods(mods: ItemMod[], clvl: number, bag: StatBag = {}): StatBag {
  for (const m of mods) if (!PARAM_STATS.has(m.stat)) addStat(bag, m.stat, modValue(m, clvl));
  return bag;
}

/** All numeric mods on the item (its own and its sockets'), at a character level */
export function itemMods(item: Item, clvl = 1): StatBag {
  return sumMods(socketMods(item), clvl, sumMods(ownMods(item), clvl));
}

/** the mods that carry a skill or class: skill bonuses, auras, procs, charges */
export function paramMods(item: Item): ItemMod[] {
  return [...ownMods(item), ...socketMods(item)].filter((m) => PARAM_STATS.has(m.stat));
}

/**
 * The item's defense: its own (rolled base, or an old item's as saved) by enhanced defense, plus
 * flat defense on it (D2: armorclass × (100 + item_armor_percent) / 100, then + armorclass stats)
 */
export function itemDefense(item: Item, clvl = 1, extraPct = 0): number {
  if (item.defense === undefined) return 0;
  const m = itemMods(item, clvl);
  return Math.floor(item.defense * (1 + ((m.defPct ?? 0) + extraPct) / 100) + (m.defLocal ?? 0));
}

/**
 * A weapon's own damage as making it left it (D2 keeps it in the item's damage stats): its base's,
 * three quarters on a low quality one (ItemsMagic.cpp:1047-1072: at least 1 and 2, the thrown pair's
 * floors the other way round, as D2 has them), half again when ethereal (ItemMods.cpp:2531-2549)
 */
function ownDamage(item: Item, dmg: [number, number], thrown = false): [number, number] {
  let [min, max] = dmg;
  if (item.quality === 'low') {
    min = Math.max(Math.trunc((75 * min) / 100), thrown ? 2 : 1);
    max = Math.max(Math.trunc((75 * max) / 100), thrown ? 1 : 2);
  }
  return item.eth ? [Math.trunc((3 * min) / 2), Math.trunc((3 * max) / 2)] : [min, max];
}

/** a weapon's damage pair with the enhanced and flat damage on it (and in its sockets) */
function enhancedDamage(item: Item, dmg: [number, number], clvl: number, extraPct: number): [number, number] {
  const m = itemMods(item, clvl);
  const ed = 1 + ((m.dmgPct ?? 0) + extraPct) / 100;
  const min = Math.floor(dmg[0] * ed + (m.dmgMin ?? 0));
  const max = Math.max(min + 1, Math.floor(dmg[1] * (ed + (m.dmgMaxPct ?? 0) / 100) + (m.dmgMax ?? 0)));
  return [min, max];
}

/**
 * The damage it swings with (two-handed for two-handed weapons), or its one-handed damage; extraPct
 * is enhanced damage from elsewhere that is the weapon's own (a set bonus slot on it)
 */
export function weaponDamage(item: Item, clvl = 1, oneHand = false, extraPct = 0): [number, number] {
  const b = baseOf(item);
  const raw = oneHand && b.dmg1 ? b.dmg1 : b.dmg;
  if (!raw) return [0, 0];
  return enhancedDamage(item, ownDamage(item, raw), clvl, extraPct);
}

/**
 * A throwing weapon's thrown damage (Items.txt minmisdam / maxmisdam), changed as the other pairs
 * are: by low quality (ItemsMagic.cpp:1066-1071), ethereal (ItemMods.cpp:2544-2545) and flat
 * damage (ItemMods.cpp:1355-1373), and thrown with the enhanced damage % (Missile.cpp:626-667)
 */
export function throwDamage(item: Item, clvl = 1, extraPct = 0): [number, number] {
  const t = baseOf(item).throwDmg;
  return t ? enhancedDamage(item, ownDamage(item, t, true), clvl, extraPct) : [0, 0];
}

/**
 * What an item gives the wearer, its local stats taken out. Armor (an item with its own defense)
 * keeps its enhanced and flat defense (itemDefense), a weapon its enhanced and flat damage
 * (weaponDamage). Anywhere else flat defense is the hero's: armorclass is a unit stat, item_armor_percent
 * only raises an item's own (sub_6FD92CF0, ItemMods.cpp:888-905); enhanced damage off the weapon
 * adds to the hero's damage % (SUnitDmg.cpp:200-229 sums the unit's item_min/maxdamage_percent with
 * strength's), and flat damage to the weapon's. No non-weapon row rolls dmg%/lvl (max damage % only).
 */
export function globalItemStats(item: Item, clvl = 1): StatBag {
  const m = itemMods(item, clvl);
  if (item.defense === undefined && m.defLocal) addStat(m, 'def', m.defLocal);
  delete m.defLocal;
  delete m.defPct;
  if (itemCategory(item) === 'weapon') {
    delete m.dmgMin;
    delete m.dmgMax;
  } else if (m.dmgPct) addStat(m, 'dmgPctGlobal', m.dmgPct);
  delete m.dmgPct;
  delete m.dmgMaxPct;
  return m;
}

/** an item with a D2 quality, so D2's level requirement applies to it */
function hasRows(item: Item): boolean {
  return item.quality !== undefined;
}

/** an item from before the D2 items' rows: what it gives is its old mods, its level what it was made with */
function oldMade(item: Item): boolean {
  return item.mods.length > 0;
}

/**
 * The level an item needs (D2Common Items.cpp:1214-1441, d2/affixes.ts requiredLevel): its rows',
 * its base's and its sockets' fillers'; `cls` is the hero's D2 class code (charged-skill suffixes
 * ask another level of their class). An old item keeps its level, raised only by runes socketed since.
 */
export function itemReqLvl(item: Item, cls?: string): number {
  const fill = (s: Socketed) => (typeof s === 'string' ? (ITEM_BASES[s]?.reqLvl ?? SOCKETABLE_BY_ID[s]?.reqLvl ?? 1) : itemReqLvl(s, cls));
  if (item.legacy) {
    let r = item.legacy.lvl;
    item.socketed.forEach((s, i) => {
      if (i >= item.legacy!.runes) r = Math.max(r, fill(s));
    });
    return r;
  }
  if (hasRows(item) && ITEM_BASES[item.baseId]) {
    try {
      // a jewel in it counts with its own rows
      const socketed = item.socketed.map((s) => (typeof s === 'string' || hasRows(s) ? s : s.baseId)) as (string | Item)[];
      const d2 = requiredLevel({ ...item, quality: qualityOf(item), socketed } as Parameters<typeof requiredLevel>[0], cls);
      // an old item's level came from affixes it has no rows of: it keeps it
      return oldMade(item) ? Math.max(d2, item.reqLvl) : d2;
    } catch {
      /* a row this build doesn't have: what it was made with */
    }
  }
  let r = item.reqLvl;
  for (const s of item.socketed) r = Math.max(r, fill(s));
  return r;
}

/**
 * Strength and dexterity an item needs (D2Common Items.cpp:1088-1103): its base's (an old item's
 * where it keeps them), plus "requirements %" of them (DATATBLS_ApplyRatio, toward zero), less 10
 * when ethereal
 */
export function itemReqStats(item: Item): { str: number; dex: number } {
  const b = baseOf(item);
  const ease = itemMods(item).ease ?? 0;
  const str = item.legacy ? item.legacy.str : (b.reqStr ?? 0);
  const dex = item.legacy ? item.legacy.dex : (b.reqDex ?? 0);
  const eth = item.eth ? 10 : 0;
  return { str: str + Math.trunc((str * ease) / 100) - eth, dex: dex + Math.trunc((dex * ease) / 100) - eth };
}

/** who an item's requirements are checked against */
export interface Wearer {
  level: number;
  str: number;
  dex: number;
  /** the game's class (sorceress, paladin) or a D2 class code */
  cls?: string;
}

/**
 * Whether the hero can use the item (D2Common Items.cpp:1044-1165 ITEMS_CheckRequirements): its
 * strength, dexterity and level met, identified, of no other class; and one this game has an
 * attack for (no bows or throwing yet)
 */
export function meetsReqs(item: Item, who: Wearer): boolean {
  const b = baseOf(item);
  if (!isIdentified(item) || b.noUse) return false;
  const cls = classCode(who.cls);
  if (b.classCode && b.classCode !== cls) return false;
  const req = itemReqStats(item);
  return who.level >= itemReqLvl(item, cls) && who.str >= req.str && who.dex >= req.dex;
}

export function itemTypeName(item: Item): string {
  return baseOf(item).name;
}

// ───────────────────────── names ─────────────────────────

const RARE_PRE = new Map(D2X_RARE_PREFIXES.map((w) => [w.id, w.name]));
const RARE_SUF = new Map(D2X_RARE_SUFFIXES.map((w) => [w.id, w.name]));
const LOW = new Map(D2X_LOW_QUALITY.map((q) => [q.id, q.name]));

/** an affix row's name, or nothing when this build doesn't have the row */
function affixName(kind: 'prefix' | 'suffix', id: number): string | undefined {
  try {
    return affixRow(kind, id).name;
  } catch {
    return undefined;
  }
}

/** the runeword an item is (Runes.txt row), if this build has it */
export function runewordOf(item: Item) {
  return RUNEWORD_BY_ID[item.runewordRow ?? item.runewordId ?? ''];
}

/**
 * The name an item shows, wherever one is shown, made the way the official Simplified Chinese
 * client makes it (D2CE ui.json): magic "%2%0%1" (suffix, prefix, base), prefix only "%0%1",
 * suffix only "%1%0"; rare "%0%1" (the two name words); superior "精良" and low quality's word
 * before the base, "镶宝" before a normal item with something socketed; uniques, set items and
 * runewords by their row. Names come from our renamed tables (src/data/d2x), so a renamed affix
 * renames the items already made. Unidentified, it is the base's name. An old item without rows
 * shows the name it was saved with.
 */
export function displayName(item: Item): string {
  const b = baseOf(item);
  if (!b || isUnknown(item)) return b?.name ?? item.name;
  const q = qualityOf(item);
  if (!isIdentified(item) && q !== 'low' && q !== 'normal' && q !== 'superior') return b.name;
  if (item.rarity === 'runeword') return runewordOf(item)?.name ?? item.name;
  switch (q) {
    case 'unique': {
      const u = item.uniqueRow !== undefined ? D2_UNIQUES.get(item.uniqueRow) : undefined;
      return u?.name ?? UNIQUE_BY_ID[item.uniqueId ?? '']?.name ?? item.name;
    }
    case 'set': {
      const s = item.setRow !== undefined ? SET_ITEM_BY_ID.get(item.setRow) : undefined;
      return s?.name ?? SET_ITEMS[item.setItemId ?? '']?.item.name ?? item.name;
    }
    case 'rare':
    case 'crafted': {
      const [a, z] = item.rareName ?? [-1, -1];
      const pre = RARE_PRE.get(a);
      const suf = RARE_SUF.get(z);
      return pre && suf ? fmt(S.RareFormat, pre, suf) : item.name;
    }
    case 'magic': {
      const pre = item.prefixes?.length ? affixName('prefix', item.prefixes[0]) : undefined;
      const suf = item.suffixes?.length ? affixName('suffix', item.suffixes[0]) : undefined;
      if (pre && suf) return fmt(S.MagicFormat, pre, b.name, suf);
      if (pre) return fmt(S.ItemNameMagicFormatPrefixOnly, pre, b.name);
      if (suf) return fmt(S.ItemNameMagicFormatSuffixOnly, b.name, suf);
      return item.name || b.name;
    }
    case 'superior':
      return fmt(S.HiqualityFormat, S.Hiquality, b.name);
    case 'low': {
      const w = LOW.get(item.qualityRow ?? -1);
      return w ? fmt(S.LowqualityFormat, w, b.name) : b.name;
    }
    default:
      return item.socketed.length ? fmt(S.GemmedNormalName, S.Gemmed, b.name) : b.name;
  }
}

// ───────────────────────── tooltips ─────────────────────────

export interface TooltipLine {
  text: string;
  color?: string;
  small?: boolean;
}

export interface ReqContext extends Wearer {
  /** what the hero wears: a set item's bonuses go by the pieces of its set among them */
  worn?: Item[];
}

const PROC_TEXT: Partial<Record<StatKey, string>> = {
  procHit: '击中时',
  procStruck: '被击中时',
  procAttack: '攻击时',
  procKill: '消灭一名敌人时',
  procDeath: '死亡时',
  procLevelUp: '升级时',
};

/** the game's class (paladin, sorceress) as a D2 class code */
export function classCode(cls: string | undefined): string | undefined {
  return cls === 'sorceress' ? 'sor' : cls === 'paladin' ? 'pal' : cls;
}

/** a mod with a skill or class, as a tooltip line; `live` is false when it can't work in this game */
export function describeParamMod(m: ItemMod, item: Item | null): { text: string; live: boolean } {
  const p = m.param ?? '';
  switch (m.stat) {
    case 'skill': {
      const s = skillRef(p);
      return { text: `+${m.value} ${s.name} ${classOnly(className(s.cls ?? ''))}`, live: !!s.id };
    }
    case 'oskill': {
      const s = skillRef(p);
      return { text: `+${m.value} ${s.name}`, live: !!s.id };
    }
    case 'skillTab': {
      const t = skillTab(Number(p));
      return { text: `+${m.value} ${t.name} ${classOnly(className(t.cls))}`, live: t.cls === 'sor' || t.cls === 'pal' };
    }
    case 'clsSkills':
      return { text: `+${m.value} ${className(p)}技能等级`, live: p === 'sor' || p === 'pal' };
    case 'aura': {
      const s = skillRef(p);
      const aura = s.name.endsWith('光环') ? s.name : `${s.name}光环`;
      return { text: `装备时获得 ${m.value} 级${aura}`, live: !!s.id && SKILL_BY_ID[s.id]?.kind === 'aura' };
    }
    case 'charged': {
      const s = skillRef(p);
      const left = item?.charges?.[p] ?? m.value;
      const kind = s.id ? SKILL_BY_ID[s.id]?.kind : undefined;
      return { text: `${m.lvl} 级${s.name}（${left}/${m.value} 次充能）`, live: kind === 'spell' || kind === 'buff' };
    }
    default: {
      const s = skillRef(p);
      return { text: `${m.value}% 几率在${PROC_TEXT[m.stat] ?? ''}施放 ${m.lvl} 级${s.name}`, live: !!s.id };
    }
  }
}

/** whether a property does what it says in this game: the stats it maps to are live, and its skill is one the game has */
export function propLive(p: D2Prop, item: Item | null = null): boolean {
  if (ITEM_STATE_CODES.has(p.c) || p.c === 'indestruct' || p.c === 'ethereal') return true;
  const mods = propMods([p], true, rollMax);
  if (!mods.length) return false;
  return mods.every((m) => (PARAM_STATS.has(m.stat) ? describeParamMod(m, item).live : !INERT_STATS.has(m.stat)));
}

/**
 * Codes propMods reads only with a partner (props.ts): cold damage's length, poison's top and length.
 * Alone they give nothing; D2 writes them on their partner's line (d2/describe.ts PAIRS), and that
 * partner says whether the line works
 */
const PARTNERS: Record<string, readonly string[]> = {
  'cold-len': ['cold-min', 'cold-max', 'dmg-cold'],
  'pois-max': ['pois-min'],
  'pois-len': ['pois-min'],
};

/** whether a line's properties all do what they say here, a partnered code by its partner on the line */
export function lineLive(props: readonly D2Prop[], item: Item | null = null): boolean {
  return props.every((p) => (PARTNERS[p.c] ? props.some((q) => PARTNERS[p.c].includes(q.c)) : propLive(p, item)));
}

/** our monster names by MonStats hcIdx (reanimate's parameter) */
let monsterNames: Map<number, string> | undefined;
function monsterName(id: number): string | undefined {
  monsterNames ??= new Map(Object.values(D2X_MONSTERS).flatMap((m) => (m.name ? [[m.hcIdx, m.name] as const] : [])));
  return monsterNames.get(id);
}

/** what a tooltip's D2 lines need from the game: its own skill, class and tree names, and our monster names */
function describeCtx(clvl: number, charges?: Record<string, number>) {
  return {
    clvl,
    charges,
    skillName: (s: string) => skillRef(s).name,
    skillClass: (s: string) => skillRef(s).cls ?? undefined,
    className: (c: string) => className(c),
    tabName: (t: number) => skillTab(t).name,
    monsterName,
  };
}

/** D2 lines as tooltip lines, greying (and saying so) what does nothing here */
function asLines(lines: DescLine[], item: Item | null, color: string): TooltipLine[] {
  return lines.map((l) => {
    const live = lineLive(l.props, item);
    return live ? { text: l.text, color } : { text: `${l.text}（${NOT_IN_GAME}）`, color: INERT_COLOR };
  });
}

/** an item's property lines the D2 way: its own, its sockets' fillers' and an old item's mods */
export function propLines(item: Item, clvl: number): TooltipLine[] {
  const props = [...ownProps(item), ...socketProps(item)];
  const lines = asLines(describeProps(props, describeCtx(clvl, item.charges)), item, MOD_COLOR);
  if (item.mods.length) lines.push(...modLines(item.mods, clvl, item));
  return lines;
}

/**
 * Tooltip lines for an old item's mods, greying what does nothing here: what a D2 property says
 * one for one in D2's words (props.ts modProps), the rest (poison's total, the game's own stats)
 * in the game's
 */
export function modLines(mods: ItemMod[], clvl: number, item: Item | null, skip: StatKey[] = []): TooltipLine[] {
  const { props, rest } = modProps(mods.filter((m) => !skip.includes(m.stat)));
  const lines = asLines(describeProps(props, describeCtx(clvl, item?.charges)), item, MOD_COLOR);
  for (const m of rest) {
    if (!PARAM_STATS.has(m.stat)) continue;
    const d = describeParamMod(m, item);
    lines.push(d.live ? { text: d.text, color: MOD_COLOR } : { text: `${d.text}（${NOT_IN_GAME}）`, color: INERT_COLOR });
  }
  const bag = sumMods(rest, clvl);
  const inert: StatBag = {};
  for (const k of Object.keys(bag) as StatKey[]) {
    if (INERT_STATS.has(k)) {
      inert[k] = bag[k];
      delete bag[k];
    }
  }
  const perLvl = new Set(rest.filter((m) => m.perLvl).map((m) => m.stat));
  for (const l of describeStats(bag, skip)) lines.push({ text: l, color: MOD_COLOR });
  // "+X (based on character level)" for the per-level ones
  if (perLvl.size) {
    for (const ln of lines) for (const k of perLvl) if (statLine(k, bag) === ln.text) ln.text += S.increaseswithplaylevelX;
  }
  for (const l of describeStats(inert)) lines.push({ text: `${l}（${NOT_IN_GAME}）`, color: INERT_COLOR });
  return lines;
}

function statLine(k: StatKey, bag: StatBag): string | undefined {
  return bag[k] ? describeStats({ [k]: bag[k] })[0] : undefined;
}

/** D2's weapon class words by item type (the tooltip's "<class> - <speed>") */
const WEAPON_CLASS: Record<string, string> = {
  swor: 'WeaponDescSword', knif: 'WeaponDescDagger', tkni: 'WeaponDescDagger', axe: 'WeaponDescAxe', taxe: 'WeaponDescAxe',
  club: 'WeaponDescMace', mace: 'WeaponDescMace', hamm: 'WeaponDescMace', scep: 'WeaponDescMace', wand: 'WeaponDescStaff',
  staf: 'WeaponDescStaff', orb: 'WeaponDescOrb', spea: 'WeaponDescSpear', aspe: 'WeaponDescSpear', pole: 'WeaponDescPoleArm',
  bow: 'WeaponDescBow', abow: 'WeaponDescBow', xbow: 'WeaponDescCrossBow', jave: 'WeaponDescJavelin', ajav: 'WeaponDescJavelin',
  h2h: 'WeaponDescH2H', h2h2: 'WeaponDescH2H',
};

/** the attack speed word by weapon speed modifier (the bands the game used before; D2's client isn't in D2MOO) */
function speedWord(wsm: number): string {
  return S[wsm <= -20 ? 'WeaponAttackVeryFast' : wsm < 0 ? 'WeaponAttackFast' : wsm === 0 ? 'WeaponAttackNormal' : wsm <= 10 ? 'WeaponAttackSlow' : 'WeaponAttackVerySlow'];
}

/** a gem's or rune's lists, a line each, as D2 shows them on the stone */
function socketableLines(s: Socketable, clvl: number): TooltipLine[] {
  const ctx = describeCtx(clvl);
  const list = (props: D2Prop[]) => describeProps(props, ctx).map((l) => l.text).join('，') || '—';
  return [
    { text: S.ExInsertSockets, color: '#aaa', small: true },
    { text: `${S.StrGemX3} ${list(s.weapon)}` },
    { text: `${S.StrGemX4} ${list(s.armor)}` },
    { text: `${S.StrGemX1} ${list(s.armor)}` },
    { text: `${S.StrGemX2} ${list(s.shield)}` },
  ];
}

/** set items by their SetItems index (a set lists its pieces by it) */
const SET_ITEM_BY_KEY = new Map([...SET_ITEM_BY_ID.values()].map((s) => [s.key, s]));

/**
 * The green lines of a set item and its set (d2/legendary.ts setBonuses, slotsOn): its own bonus
 * slots green while on, else grey with what turns them on (add func 2: a count of pieces, 1: one
 * piece); the set's name, its pieces green where worn, and its partial and full bonuses, gold when
 * on. Each bonus is a line of its own, as D2 lists them. A worn piece counts while the hero meets
 * its requirements, as the hero's stats count it (game/player.ts recalc, Items.cpp:4459).
 */
function setLines(item: Item, ctx: ReqContext | undefined, clvl: number): TooltipLine[] {
  const row = item.setRow !== undefined ? SET_ITEM_BY_ID.get(item.setRow) : undefined;
  const set = row ? SET_BY_ID.get(row.set) : undefined;
  if (!row || !set) return [];
  // what counts is worn and usable; the item looked at counts only when it is worn
  const worn = ctx ? (ctx.worn ?? []).filter((w) => w.setRow !== undefined && meetsReqs(w, ctx)) : [];
  const wearing = worn.includes(item);
  const wornKeys = new Set(worn.map((w) => SET_ITEM_BY_ID.get(w.setRow!)?.key));
  if (!wearing) wornKeys.delete(row.key);
  const mask = set.pieces.reduce((m, key, i) => (wornKeys.has(key) || key === row.key ? m | (1 << i) : m), 0);
  const on = wearing ? slotsOn(row, mask) : [];
  const dctx = describeCtx(clvl);
  const lines: TooltipLine[] = [];
  // one line per bonus, the tag of what turns it on before it while off; greyed what does nothing here
  const say = (props: D2Prop[], live: boolean, color: string, tag = '') => {
    for (const l of describeProps(props.filter((p) => p.c !== 'dur'), dctx)) {
      if (!lineLive(l.props, item)) lines.push({ text: `${tag}${l.text}（${NOT_IN_GAME}）`, color: INERT_COLOR, small: true });
      else lines.push(live ? { text: `${tag}${l.text}`, color, small: tag !== '' } : { text: `${tag}${l.text}`, color: INERT_COLOR, small: true });
    }
  };
  const others = set.pieces.filter((k) => k !== row.key);
  (item.setBonus ?? []).forEach((slot, k) => {
    const need = row.addFunc === 2 ? `（${k + 2} 件）` : `（与${SET_ITEM_BY_KEY.get(others[k] ?? '')?.name ?? '?'}）`;
    say(slot, !!on[k], SET_BONUS_COLOR, on[k] ? '' : need);
  });
  lines.push({ text: '', small: true });
  lines.push({ text: set.name, color: RARITY_COLOR.unique });
  for (const key of set.pieces) {
    lines.push({ text: SET_ITEM_BY_KEY.get(key)?.name ?? key, color: wornKeys.has(key) ? SET_BONUS_COLOR : INERT_COLOR, small: true });
  }
  const n = wearing ? (setBonuses(worn).sets.find((s) => s.set.id === set.id)?.worn ?? 0) : 0;
  for (const p of set.partial) say(p.props, n >= p.n, RARITY_COLOR.unique, `（${p.n} 件）`);
  say(set.full, n >= set.pieces.length, RARITY_COLOR.unique, '（全套）');
  return lines;
}

/**
 * An item's tooltip, in D2's order: the name in its quality's colour (and the base's name under a
 * unique, set, rare or runeword), damage or defense and block, durability, class, requirements
 * (red when unmet), the weapon's class and speed, then the property lines highest priority first,
 * ethereal and sockets; unidentified, the properties are hidden. Set items add their green bonuses
 * by what of the set is worn.
 */
export function tooltip(item: Item, ctx?: ReqContext, priceLine?: string): TooltipLine[] {
  const b = baseOf(item);
  const lines: TooltipLine[] = [];
  const color = itemColor(item);
  const clvl = ctx?.level ?? 1;
  const name = displayName(item);
  const known = isIdentified(item);
  const q = qualityOf(item);
  lines.push({ text: name, color });
  if (item.rarity === 'runeword') {
    lines.push({ text: b.name, color: SOCKETED_COLOR });
    lines.push({ text: `'${item.socketed.map((r) => RUNE_BY_ID[socketId(r)]?.glyph ?? '?').join(' · ')}'`, color: RARITY_COLOR.unique });
    // one this build doesn't have: an old invented one, or a later build's (its mods are on the item)
    if (!runewordOf(item)) {
      lines.push({ text: isOldRuneword(item.runewordId) ? '旧版符文之语（已不能再制作）' : '这个版本没有这个符文之语（属性照常生效）', small: true, color: '#8a8278' });
    }
  } else if (known && (q === 'unique' || q === 'set' || q === 'rare' || q === 'crafted')) {
    lines.push({ text: b.name, color });
  }
  const price = () => {
    if (priceLine) lines.push({ text: priceLine, small: true });
    return lines;
  };

  switch (b.type) {
    case 'potion': {
      const cs = ctx?.cls ? D2X_CLASSES[classCode(ctx.cls) ?? ''] : undefined;
      const sec = (n = 0) => +n.toFixed(1);
      if (b.heal) lines.push({ text: `回复 ${Math.floor((b.heal * (cs?.hpPotion ?? 100)) / 100)} 点生命（${sec(b.healSec)} 秒内）` });
      if (b.manaHeal) lines.push({ text: `回复 ${Math.floor((b.manaHeal * (cs?.mpPotion ?? 100)) / 100)} 点法力（${sec(b.manaSec)} 秒内）` });
      if (b.rejuv) lines.push({ text: `立即回复 ${Math.round(b.rejuv * 100)}% 生命与法力` });
      if (!b.heal && !b.manaHeal && !b.rejuv) lines.push({ text: NOT_IN_GAME, color: INERT_COLOR });
      lines.push({ text: '右键点击使用', small: true, color: '#999' });
      return price();
    }
    case 'unknown':
      lines.push({ text: '这个版本认不出这件物品', color: '#aaa', small: true });
      lines.push({ text: '它原样保存在存档里，换用认得它的版本就会恢复', color: '#aaa', small: true });
      return lines;
    case 'cube':
      lines.push({ text: '右键点击打开', small: true, color: '#999' });
      lines.push({ text: '放入物品后按"转化"，按配方合成', small: true, color: '#aaa' });
      lines.push({ text: '拿着物品点魔盒，不用打开就能放进去', small: true, color: '#aaa' });
      return lines;
    case 'rune':
    case 'gem': {
      const s = SOCKETABLE_BY_ID[b.id];
      if (s) lines.push(...socketableLines(s, clvl));
      const lvl = s?.reqLvl ?? b.reqLvl ?? 0;
      if (lvl > 1) lines.push({ text: fmt(S.ItemStats1p, lvl), color: ctx && ctx.level < lvl ? RED : undefined });
      return price();
    }
    case 'scroll':
    case 'tome':
      if (b.stack) lines.push({ text: fmt(S.ItemStats1i, item.qty ?? 1, b.stack[1]) });
      lines.push({ text: b.id === 'isc' || b.id === 'ibk' ? '右键点击，再点一件未辨识的物品' : NOT_IN_GAME, small: true, color: b.id === 'isc' || b.id === 'ibk' ? '#999' : INERT_COLOR });
      return price();
    case 'key':
    case 'quiver':
      if (b.stack) lines.push({ text: fmt(S.ItemStats1i, item.qty ?? 1, b.stack[1]) });
      lines.push({ text: NOT_IN_GAME, small: true, color: INERT_COLOR });
      return price();
    case 'misc':
    case 'gold':
      return price();
    default:
      break;
  }

  // a charm says where it works under its name
  if (b.type === 'charm') lines.push({ text: S.Charmdes, color: '#aaa', small: true });

  // damage, defense, block: blue where the item's properties or ethereal change it, not where low quality does
  if (b.dmg && categoryOf(b.type) === 'weapon') {
    const pair = (text: string, got: [number, number], own: [number, number]) =>
      lines.push({ text: fmt(text, got[0], got[1]), color: item.eth || got[0] !== own[0] || got[1] !== own[1] ? MOD_COLOR : undefined });
    if (b.dmg1) pair(S.ItemStats1l, weaponDamage(item, clvl, true), ownDamage(item, b.dmg1));
    pair(b.twoHanded ? S.ItemStats1m : S.ItemStats1l, weaponDamage(item, clvl), ownDamage(item, b.dmg));
    if (b.throwDmg) pair(S.strItemStatThrowDamageRange, throwDamage(item, clvl), ownDamage(item, b.throwDmg, true));
  }
  if (item.defense !== undefined) {
    const d = itemDefense(item, clvl);
    lines.push({ text: fmt(S.ItemStats1h, d), color: d !== item.defense || item.eth ? MOD_COLOR : undefined });
  }
  if (b.type === 'shield') {
    // the chance to block shown with the hero's class bonus (CharStats BlockFactor)
    const bf = ctx?.cls ? (D2X_CLASSES[classCode(ctx.cls) ?? '']?.blockFactor ?? 0) : 0;
    lines.push({ text: fmt(S.ItemStats1r, (b.block ?? 0) + bf + (itemMods(item, clvl).block ?? 0)) });
  }
  if (b.beltRows !== undefined && b.type === 'belt') lines.push({ text: fmt(S.BeltStorageModifierInfo, (b.beltRows + 1) * 4) });
  // durability: none shown on indestructible items
  const indestructible = ownProps(item).some((p) => p.c === 'indestruct');
  if (item.maxDur !== undefined && !indestructible) lines.push({ text: fmt(S.ItemStats1d, item.dur ?? item.maxDur, item.maxDur), color: (item.dur ?? 1) <= 0 ? RED : undefined });
  if (b.stack && categoryOf(b.type) === 'weapon') lines.push({ text: fmt(S.ItemStats1i, item.qty ?? 1, b.stack[1]) });
  if (ctx) {
    const req = itemReqStats(item);
    const lvl = itemReqLvl(item, classCode(ctx.cls));
    if (b.classCode) lines.push({ text: classOnly(className(b.classCode)), color: classCode(ctx.cls) !== b.classCode ? RED : undefined });
    if (b.noUse) lines.push({ text: `不能使用（${b.noUse}）`, color: RED });
    if (req.dex > 0) lines.push({ text: fmt(S.ItemStats1f, req.dex), color: ctx.dex < req.dex ? RED : undefined });
    if (req.str > 0) lines.push({ text: fmt(S.ItemStats1e, req.str), color: ctx.str < req.str ? RED : undefined });
    if (lvl > 1) lines.push({ text: fmt(S.ItemStats1p, lvl), color: ctx.level < lvl ? RED : undefined });
  }
  if (b.itype && WEAPON_CLASS[b.itype] && b.wsm !== undefined) lines.push({ text: fmt(S[WEAPON_CLASS[b.itype]], speedWord(b.wsm)), small: true });
  if (b.tier) lines.push({ text: b.tier === 2 ? '精英' : '扩展', color: '#aaa', small: true });
  if (b.type === 'jewel') lines.push({ text: S.ExInsertSockets, color: '#aaa', small: true });

  if (!known) {
    lines.push({ text: S.ItemStats1b, color: RED });
    return price();
  }
  const pl = propLines(item, clvl);
  lines.push(...pl);
  // ethereal and sockets close the list (D2: one line when both)
  if (item.eth && item.sockets > 0) lines.push({ text: fmt(S.strItemModEtherealSocketed, item.sockets), color: MOD_COLOR });
  else if (item.eth) lines.push({ text: S.strethereal, color: MOD_COLOR });
  else if (item.sockets > 0) lines.push({ text: fmt(S.Socketable, item.sockets), color: MOD_COLOR });
  if (item.sockets > 0) {
    // a later build's rune or gem: it fills its socket, doing nothing here
    const unknown = item.socketed.filter((s) => typeof s === 'string' && !SOCKETABLE_BY_ID[s]).length;
    if (unknown) lines.push({ text: `其中 ${unknown} 个镶嵌物这个版本认不出，没有效果`, color: INERT_COLOR, small: true });
    if (item.socketed.length < item.sockets) lines.push({ text: `已镶嵌 ${item.socketed.length}/${item.sockets}`, color: '#aaa', small: true });
  }

  if (item.uniqueId) {
    const u = UNIQUE_BY_ID[item.uniqueId];
    if (u?.lore) lines.push({ text: u.lore, color: '#a08a5a', small: true });
  }
  if (item.setRow !== undefined) lines.push(...setLines(item, ctx, clvl));
  else if (item.setItemId) {
    // an old invented set item: its set's bonuses by count
    const s = SET_ITEMS[item.setItemId];
    if (s) {
      lines.push({ text: '', small: true });
      lines.push({ text: s.set.name, color: RARITY_COLOR.unique });
      for (const it of s.set.items) lines.push({ text: it.name, color: RARITY_COLOR.set, small: true });
      // a line per bonus, worded as the D2 sets' are
      for (const [cnt, bonus] of Object.entries(s.set.bonuses)) {
        for (const l of modLines(bonus.map(([stat, value]) => ({ stat, value })), clvl, null)) {
          lines.push({ text: `（${cnt} 件）${l.text}`, color: l.color === MOD_COLOR ? '#c8a86a' : l.color, small: true });
        }
      }
    }
  }
  return price();
}

/** what a vendor pays: the game's own economy until the shops follow D2's (A6) */
export function sellPrice(item: Item): number {
  const b = baseOf(item);
  if (b.noSell) return 0;
  const mult: Record<Rarity, number> = { low: 0.6, normal: 1, superior: 1.3, magic: 2, rare: 3.5, unique: 5, set: 5, crafted: 4, runeword: 6 };
  const n = item.mods.length + (item.props?.length ?? 0);
  return Math.max(1, Math.floor((b.price * (mult[item.rarity] ?? 1) * (1 + n * 0.15)) / 4));
}

export function buyPrice(item: Item): number {
  return baseOf(item).price;
}

export function canSocket(item: Item): boolean {
  return item.sockets > item.socketed.length && item.rarity !== 'runeword';
}

export function isRuneword(item: Item): boolean {
  return item.rarity === 'runeword' && !!runewordOf(item);
}
