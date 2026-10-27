// Types for the tables tools/d2-import.mjs generates in this folder: Diablo II's item data in the
// content scope (D2R before the Warlock expansion), with our names. Codes are D2's own: item codes
// (weapons/armor/misc), item type codes (ItemTypes.txt), property codes (Properties.txt, lower case).
import type { D2Prop, GemKind } from '../d2/types';

export type { D2Prop, GemKind };

/** an item type (ItemTypes.txt) */
export interface D2xItemType {
  /** the English type name, for reference */
  name: string;
  /** what it also counts as (Equiv1/2): affixes, runewords and recipes name types up this chain */
  up?: string[];
  bodyLoc?: string[];
  /** the only class that can use it (ama, ass, bar, dru, nec, pal, sor) */
  cls?: string;
  /** the class whose skills its staff mods roll (wands nec, staves sor, scepters pal, …) */
  staffMods?: string;
  /** weight of the type when an automatic treasure class picks a base */
  rarity: number;
  /** most sockets at item level 1..socketLvls[0], up to socketLvls[1], and above */
  sockets: [number, number, number];
  socketLvls: [number, number];
  /** has automatic treasure classes (weap3, armo3, bow3, mele3, … in steps of 3 levels) */
  tc?: true;
  canRare?: true;
  /** only ever normal quality (potions, gems, runes, …) */
  normalOnly?: true;
  /** never normal: magic or better (rings, amulets, charms, jewels) */
  magicOnly?: true;
  throwable?: true;
  beltable?: true;
  stacks?: true;
  repair?: true;
  /** can be worn */
  equip?: true;
  /** the ammunition type it shoots, and for ammunition the type that shoots it */
  shoots?: string;
  quiver?: string;
  /** shop tab: weap, armo or misc */
  store?: string;
}

export type D2xNpc =
  | 'charsi' | 'gheed' | 'akara' | 'fara' | 'lysander' | 'drognan' | 'hratli' | 'alkor' | 'ormus'
  | 'elzix' | 'asheara' | 'cain' | 'halbu' | 'jamella' | 'larzuk' | 'malah' | 'anya';

/** how many an NPC stocks, normal (min–max) and magic (magicMin–magicMax), and the magic level cap */
export interface D2xShop {
  min?: number;
  max?: number;
  magicMin?: number;
  magicMax?: number;
  magicLvl?: number;
}

/** what weapons, armor and misc items share */
interface D2xBase {
  code: string;
  /** our name: the official one for generic words, renamed where it holds a proper noun */
  name: string;
  en: string;
  type: string;
  /** gems: their grade type (gem0 chipped … gem4 perfect) */
  type2?: string;
  w: number;
  h: number;
  /** item level the base drops from; reqLvl is the level to use it */
  qlvl: number;
  reqLvl: number;
  reqStr?: number;
  reqDex?: number;
  /** only this class can use it (bows and other classes' items still drop, sell and take sockets) */
  cls?: string;
  /** normal, exceptional and elite codes of this base, and which one this is */
  tiers?: [string, string, string];
  tier?: 0 | 1 | 2;
  /** weight within an automatic treasure class */
  rarity: number;
  spawnable: boolean;
  cost: number;
  gambleCost?: number;
  dur?: number;
  /** no durability: never wears out */
  noDur?: true;
  /** most sockets the base can have, and which gem mods apply: 0 weapon, 1 armor/helm, 2 shield */
  sockets?: number;
  gemType?: 0 | 1 | 2;
  /** added to the item level when rolling affixes (wands, staves, orbs, circlets) */
  magicLvl?: number;
  /** automagic group class items roll on their own (D2X_AUTOMAGIC by group) */
  autoPrefix?: number;
  /** stack size: [min, max, as dropped] */
  stack?: [number, number, number];
  /** the quest it belongs to; questDiff: only in the difficulty it was found in */
  quest?: number;
  questDiff?: true;
  /** what nightmare and hell shops sell in its place */
  upgrade?: [string | null, string | null];
  light?: number;
  missile?: number;
  /** % of strength and dexterity added to damage */
  strBonus?: number;
  dexBonus?: number;
  shop?: Partial<Record<D2xNpc, D2xShop>>;
}

export interface D2xWeapon extends D2xBase {
  /** one-handed damage, two-handed damage, thrown damage */
  dmg1?: [number, number];
  dmg2?: [number, number];
  throwDmg?: [number, number];
  twoHanded?: true;
  /** two-handed swords: one hand for barbarians */
  oneOrTwo?: true;
  /** weapon speed modifier: negative is faster */
  wsm: number;
  /** animation class one-handed, and two-handed when it differs */
  wclass: string;
  wclass2?: string;
  hitClass: string;
  /** melee reach added */
  range?: number;
  /** needs ammunition */
  quivered?: true;
}

export interface D2xArmor extends D2xBase {
  ac: [number, number];
  block?: number;
  /** walk and run slowdown */
  speed?: number;
  /** shield smite and boot kick damage */
  dmg?: [number, number];
  /** belts: potion slots */
  beltSlots?: number;
}

export interface D2xMisc extends D2xBase {
  beltable?: true;
  autobelt?: true;
  useable?: true;
  /** what using it does (pSpell: 1 identify, 2 town portal, 3 potion over time, 5 rejuvenate, 6 cure, …) */
  spell?: number;
  /** stats it grants with their amounts, over len frames (25 frames a second) */
  stats?: [string, number][];
  len?: number;
  state?: string;
  /** states it ends (poison, freeze, cold) */
  cures?: string[];
  /** gems: the next grade up */
  next?: string;
}

/** a magic prefix or suffix, or an automagic mod; id is its row in the table */
export interface D2xAffix {
  id: number;
  name: string;
  en: string;
  /** lowest item level it rolls on, and highest when set */
  level: number;
  maxLevel?: number;
  reqLvl: number;
  /** a hero of class reqCls needs level reqClsLvl instead of reqLvl (the charged-skill suffixes) */
  reqCls?: string;
  reqClsLvl?: number;
  /** only one affix per group on an item */
  group: number;
  /** spawn weight */
  freq: number;
  /** false: made only by cube recipes or not at all */
  spawnable: boolean;
  /** can roll on rare items */
  rare?: true;
  /** only on items for this class */
  cls?: string;
  /** rolls on these item types (or below them), not on etypes */
  itypes: string[];
  etypes?: string[];
  props: D2Prop[];
  /** price: cost × priceMul / 1024 + priceAdd */
  priceMul?: number;
  priceAdd?: number;
}

/** one word of a rare item's name (prefix word + suffix word), for these item types */
export interface D2xRareWord {
  id: number;
  name: string;
  en: string;
  itypes: string[];
  etypes?: string[];
}

/** a superior item's mods, and the kinds of item they roll on */
export interface D2xQualityMod {
  id: number;
  on: ('armor' | 'weapon' | 'shield' | 'scepter' | 'wand' | 'staff' | 'bow' | 'boots' | 'gloves' | 'belt')[];
  props: D2Prop[];
}

/** a low-quality item's prefix (crude, cracked, damaged, low quality) */
export interface D2xLowQuality {
  id: number;
  name: string;
  en: string;
}

export interface D2xUnique {
  /** the row's *ID; key is its UniqueItems.txt index (several rows can share one, like the jewel Rainbow Facet) */
  id: number;
  key: string;
  name: string;
  en: string;
  /** base item code */
  code: string;
  /** item level needed to drop, and level to use */
  lvl: number;
  reqLvl: number;
  rarity: number;
  spawnable: boolean;
  costMult?: number;
  costAdd?: number;
  /** only one may be carried */
  carry1?: true;
  /** D2's drop condition expression, as written (e.g. "cond('Difficulty', hell)") */
  dropCond?: string;
  props: D2Prop[];
}

export interface D2xSetItem {
  id: number;
  key: string;
  /** the set's id */
  set: string;
  name: string;
  en: string;
  code: string;
  lvl: number;
  reqLvl: number;
  rarity: number;
  spawnable: boolean;
  costMult?: number;
  costAdd?: number;
  props: D2Prop[];
  /**
   * How the bonus slots turn on (D2MOO D2Common Items.cpp sub_6FDA4380):
   * 0: always, like props; 1: slot n while the set's n-th other piece is worn (pieces in set order,
   * this one skipped); 2: slot n with n + 1 pieces of the set worn.
   */
  addFunc: number;
  /** bonus slots 1..5, each up to two properties */
  bonus?: D2Prop[][];
}

export interface D2xSet {
  id: string;
  name: string;
  en: string;
  /** set item keys, in set order */
  pieces: string[];
  /** with n pieces worn */
  partial: { n: number; props: D2Prop[] }[];
  /** with every piece worn */
  full: D2Prop[];
}

export interface D2xRuneword {
  id: string;
  name: string;
  en: string;
  /** rune numbers in order (1 = r01) */
  runes: number[];
  itypes: string[];
  etypes?: string[];
  /** the highest rune's level requirement */
  reqLvl: number;
  props: D2Prop[];
}

interface D2xSocketable {
  id: string;
  name: string;
  en: string;
  qlvl: number;
  reqLvl: number;
  cost: number;
  weapon: D2Prop[];
  /** helms and body armor */
  armor: D2Prop[];
  shield: D2Prop[];
}

export interface D2xRune extends D2xSocketable {
  num: number;
  /** what a socket and the icon show: the number */
  glyph: string;
}

export interface D2xGem extends D2xSocketable {
  gem: GemKind;
  /** 0 chipped, 1 flawed, 2 standard, 3 flawless, 4 perfect */
  grade: number;
  next?: string;
}
