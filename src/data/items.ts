import { FRAMES_PER_SEC } from '../core/units';
import type { PlayerClass } from './classes';
import { D2X_ARMOR } from './d2x/armor';
import { D2X_ITEM_TYPES } from './d2x/itemtypes';
import { D2X_MISC } from './d2x/misc';
import { D2X_GEMS, D2X_RUNES } from './d2x/socketables';
import type { D2xArmor, D2xMisc, D2xWeapon } from './d2x/types';
import { D2X_WEAPONS } from './d2x/weapons';

export type ItemType =
  | 'sword'
  | 'axe'
  | 'club'
  | 'mace'
  | 'hammer'
  | 'scepter'
  | 'wand'
  | 'dagger'
  | 'spear'
  | 'polearm'
  | 'staff'
  | 'orb'
  | 'bow'
  | 'crossbow'
  | 'javelin'
  | 'throwing'
  | 'claw'
  | 'shield'
  | 'helm'
  | 'armor'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'ring'
  | 'amulet'
  | 'charm'
  | 'jewel'
  | 'potion'
  | 'scroll'
  | 'tome'
  | 'key'
  | 'quiver'
  | 'gold'
  | 'rune'
  | 'gem'
  | 'cube'
  | 'misc'
  | 'unknown';

export type EquipSlot = 'head' | 'neck' | 'body' | 'weapon' | 'offhand' | 'hands' | 'waist' | 'feet' | 'ring1' | 'ring2';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'neck', 'body', 'weapon', 'offhand', 'hands', 'waist', 'feet', 'ring1', 'ring2'];

export type Category = 'weapon' | 'helm' | 'body' | 'shield' | 'gloves' | 'boots' | 'belt' | 'ring' | 'amulet';

/**
 * A base item, as the game reads it: Diablo II's Weapons / Armor / Misc row (src/data/d2x), keyed by
 * its item code (id = code)
 */
export interface ItemBase {
  id: string;
  name: string;
  type: ItemType;
  /** Diablo II's item code (the id) and English name */
  code?: string;
  en?: string;
  /** Diablo II item type (ItemTypes.txt code), what affixes, runewords and recipes test */
  itype?: string;
  w: number;
  h: number;
  /** quality level: minimum item level to drop */
  qlvl: number;
  reqLvl?: number;
  reqStr?: number;
  reqDex?: number;
  /** the damage the game swings with: two-handed damage for two-handed weapons */
  dmg?: [number, number];
  /** one-handed damage of a weapon that has both (two-handed swords), and thrown damage */
  dmg1?: [number, number];
  throwDmg?: [number, number];
  twoHanded?: boolean;
  /** the old bases' attacks per second (src/items/legacy.ts): attacks follow D2's frames now (wclass, wsm) */
  speed?: number;
  /** Diablo II weapon speed modifier (negative is faster) */
  wsm?: number;
  /** the animation class it attacks with (Weapons.txt wclass), and wielded in two hands (2handedwclass): game/d2/frames.ts */
  wclass?: string;
  wclass2?: string;
  /** 0 normal, 1 exceptional, 2 elite */
  tier?: number;
  /** the normal, exceptional and elite versions of this base (codes) */
  tiers?: [string, string, string];
  /** % damage per point of strength / dexterity (Weapons.txt StrBonus / DexBonus) */
  strBonus?: number;
  dexBonus?: number;
  /** added to the item level when picking affixes (wands, staves, orbs, circlets) */
  magicLvl?: number;
  /** rolls skill bonuses for this class when found (D2 "staff mods") */
  staffMods?: PlayerClass;
  /** only this class can use it: this game's class, or classCode for any D2 class */
  cls?: PlayerClass;
  classCode?: string;
  /** why no hero of this game can use it, though it drops, sells and takes sockets */
  noUse?: string;
  def?: [number, number];
  block?: number;
  /** body armor and shield walk/run slowdown (Armor.txt speed) */
  armorSpeed?: number;
  maxSockets?: number;
  /** which of a gem's lists applies in its sockets: 0 weapon, 1 helm and armor, 2 shield (Items.txt gemapplytype) */
  gemType?: 0 | 1 | 2;
  /** most durability; unset: none */
  dur?: number;
  beltRows?: number;
  /** stack: [min, max, as dropped] */
  stack?: [number, number, number];
  price: number;
  /** potions: life and mana restored over seconds, or the share of both restored at once */
  heal?: number;
  healSec?: number;
  manaHeal?: number;
  manaSec?: number;
  rejuv?: number; // fraction
  /** for icons */
  tint?: string;
  /** the art it is drawn with: one of the game's own base ids from before the D2 bases */
  look?: string;
  stackable?: boolean;
  noDrop?: boolean;
  /** vendors won't buy it */
  noSell?: boolean;
  /** the quest it belongs to (Misc/Weapons/Armor.txt quest): the Horadric Cube, Wirt's Leg… D2R keeps these out of the shared stash */
  quest?: number;
}

export function categoryOf(type: ItemType): Category | null {
  switch (type) {
    case 'sword':
    case 'axe':
    case 'club':
    case 'mace':
    case 'hammer':
    case 'scepter':
    case 'wand':
    case 'dagger':
    case 'spear':
    case 'polearm':
    case 'staff':
    case 'orb':
    case 'bow':
    case 'crossbow':
    case 'javelin':
    case 'throwing':
    case 'claw':
      return 'weapon';
    case 'shield':
      return 'shield';
    case 'helm':
      return 'helm';
    case 'armor':
      return 'body';
    case 'gloves':
      return 'gloves';
    case 'boots':
      return 'boots';
    case 'belt':
      return 'belt';
    case 'ring':
      return 'ring';
    case 'amulet':
      return 'amulet';
    default:
      return null;
  }
}

export function slotsFor(type: ItemType): EquipSlot[] {
  switch (categoryOf(type)) {
    case 'weapon':
      return ['weapon'];
    case 'shield':
      return ['offhand'];
    case 'helm':
      return ['head'];
    case 'body':
      return ['body'];
    case 'gloves':
      return ['hands'];
    case 'boots':
      return ['feet'];
    case 'belt':
      return ['waist'];
    case 'ring':
      return ['ring1', 'ring2'];
    case 'amulet':
      return ['neck'];
    default:
      return [];
  }
}

// ───────────────────────── Diablo II's bases as the game's ─────────────────────────

/** D2 item type → this game's item type */
const TYPE_OF: Record<string, ItemType> = {
  swor: 'sword', axe: 'axe', club: 'club', mace: 'mace', hamm: 'hammer', scep: 'scepter', wand: 'wand', knif: 'dagger',
  spea: 'spear', aspe: 'spear', pole: 'polearm', staf: 'staff', orb: 'orb', bow: 'bow', abow: 'bow', xbow: 'crossbow',
  jave: 'javelin', ajav: 'javelin', tkni: 'throwing', taxe: 'throwing', tpot: 'throwing', h2h: 'claw', h2h2: 'claw',
  tors: 'armor', helm: 'helm', circ: 'helm', phlm: 'helm', pelt: 'helm', shie: 'shield', ashd: 'shield', head: 'shield',
  glov: 'gloves', boot: 'boots', belt: 'belt',
  ring: 'ring', amul: 'amulet', scha: 'charm', mcha: 'charm', lcha: 'charm', jewl: 'jewel',
  hpot: 'potion', mpot: 'potion', rpot: 'potion', spot: 'potion', apot: 'potion', wpot: 'potion',
  scro: 'scroll', book: 'tome', key: 'key', bowq: 'quiver', xboq: 'quiver', gold: 'gold', rune: 'rune',
  gema: 'gem', gemt: 'gem', gems: 'gem', geme: 'gem', gemr: 'gem', gemd: 'gem', gemz: 'gem',
};

/** D2 class codes this game has as classes */
const GAME_CLASS: Record<string, PlayerClass> = { sor: 'sorceress', pal: 'paladin' };

/** what this game has no attack for: bows and crossbows shoot, javelins and throwing weapons are thrown */
const NO_USE: Partial<Record<ItemType, string>> = {
  bow: '本游戏没有射击', crossbow: '本游戏没有射击', javelin: '本游戏没有投掷', throwing: '本游戏没有投掷',
};


const idOf = (en: string) => en.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The art of the armor, by the normal version's code: the game's own armor ids from before, which
 * the models and icons are keyed on (exceptional and elite versions look like their normal one)
 */
const ARMOR_LOOK: Record<string, string> = {
  cap: 'cap', skp: 'skullcap', hlm: 'helm', fhl: 'fullhelm', ghm: 'greathelm', crn: 'crown', msk: 'fullhelm', bhm: 'skullcap',
  ci0: 'crown', ci1: 'crown',
  buc: 'buckler', sml: 'roundshield', lrg: 'kiteshield', kit: 'kiteshield', tow: 'towershield', gts: 'gothicshield', bsh: 'roundshield', spk: 'roundshield',
  qui: 'quiltedarmor', lea: 'leatherarmor', hla: 'leatherarmor', stu: 'leatherarmor', rng: 'ringmail', scl: 'scalemail', chn: 'chainmail',
  brs: 'breastplate', spl: 'chainmail', plt: 'platemail', fld: 'platemail', gth: 'gothicplate', ful: 'gothicplate', aar: 'gothicplate', ltp: 'breastplate',
  lgl: 'leathergloves', vgl: 'heavygloves', mgl: 'chaingloves', tgl: 'chaingloves', hgl: 'gauntlets',
  lbt: 'boots', vbt: 'heavyboots', mbt: 'chainboots', tbt: 'chainboots', hbt: 'greaves',
  lbl: 'sash', vbl: 'lightbelt', mbl: 'belt', tbl: 'heavybelt', hbl: 'platebelt',
};
/** class armor and anything else: by type */
const TYPE_LOOK: Record<string, string> = { phlm: 'greathelm', pelt: 'cap', helm: 'helm', circ: 'crown', head: 'buckler', shie: 'roundshield', tors: 'chainmail', glov: 'leathergloves', boot: 'boots', belt: 'belt' };
/** the Paladin's tall shields */
const TALL_SHIELDS = new Set(['pa3', 'pa4']);

const GEM_TINT: Record<string, string> = { amethyst: '#b05cff', topaz: '#ffd23a', sapphire: '#3a7aff', emerald: '#2ad06a', ruby: '#ff2a3a', diamond: '#e8f0ff', skull: '#d8d0c0' };
const POTION_TINT: Record<string, string> = {
  hp1: '#b81818', hp2: '#c41a1a', hp3: '#d61c1c', hp4: '#ee2222', hp5: '#ff3030',
  mp1: '#1c3cc4', mp2: '#1f45d8', mp3: '#2550ee', mp4: '#3060ff', mp5: '#4070ff',
  rvs: '#9a2ad0', rvl: '#c040ff', vps: '#d8c040', yps: '#40c040', wms: '#e07020',
};

/** what a base sells for and costs here: the economy is the game's own until the shops follow D2 (weapons and armor at 40% of their cost) */
function priceOf(b: { cost: number }, consumable: boolean): number {
  return consumable ? Math.max(1, b.cost) : Math.max(5, Math.round(b.cost * 0.4));
}

function common(b: D2xWeapon | D2xArmor | D2xMisc, type: ItemType): ItemBase {
  const t = D2X_ITEM_TYPES[b.type];
  const out: ItemBase = { id: b.code, code: b.code, name: b.name, en: b.en, type, itype: b.type, w: b.w, h: b.h, qlvl: b.qlvl, price: 0 };
  if (b.reqLvl) out.reqLvl = b.reqLvl;
  if (b.reqStr) out.reqStr = b.reqStr;
  if (b.reqDex) out.reqDex = b.reqDex;
  if (b.tiers) out.tiers = b.tiers;
  if (b.tier !== undefined) out.tier = b.tier;
  if (b.magicLvl) out.magicLvl = b.magicLvl;
  if (b.sockets) out.maxSockets = b.sockets;
  if (b.gemType !== undefined) out.gemType = b.gemType;
  if (!b.noDur && b.dur) out.dur = b.dur;
  if (b.stack) out.stack = b.stack;
  const cls = b.cls ?? t?.cls;
  if (cls) {
    out.classCode = cls;
    if (GAME_CLASS[cls]) out.cls = GAME_CLASS[cls];
  }
  if (t?.staffMods && GAME_CLASS[t.staffMods]) out.staffMods = GAME_CLASS[t.staffMods];
  if (b.quest) out.quest = b.quest;
  if (!b.spawnable || b.quest) out.noDrop = true;
  return out;
}

function weaponBase(b: D2xWeapon): ItemBase {
  const type = TYPE_OF[b.type] ?? 'sword';
  const out = common(b, type);
  out.look = idOf(b.en);
  out.dmg = b.twoHanded && b.dmg2 ? b.dmg2 : (b.dmg1 ?? b.dmg2 ?? [1, 2]);
  if (b.twoHanded) out.twoHanded = true;
  if (b.oneOrTwo && b.dmg1) out.dmg1 = b.dmg1;
  if (b.throwDmg) out.throwDmg = b.throwDmg;
  out.wsm = b.wsm;
  out.wclass = b.wclass;
  if (b.wclass2) out.wclass2 = b.wclass2;
  out.strBonus = b.strBonus ?? 0;
  if (b.dexBonus) out.dexBonus = b.dexBonus;
  if (NO_USE[type]) out.noUse = NO_USE[type];
  out.price = priceOf(b, false);
  return out;
}

function armorBase(b: D2xArmor): ItemBase {
  const type = TYPE_OF[b.type] ?? 'armor';
  const out = common(b, type);
  const fam = b.tiers?.[0] ?? b.code;
  out.look = TALL_SHIELDS.has(fam) ? 'towershield' : (ARMOR_LOOK[fam] ?? TYPE_LOOK[b.type] ?? 'chainmail');
  out.def = b.ac;
  if (b.block) out.block = b.block;
  if (b.speed) out.armorSpeed = b.speed;
  if (b.beltSlots) out.beltRows = Math.max(0, b.beltSlots / 4 - 1);
  out.price = priceOf(b, false);
  return out;
}

function miscBase(b: D2xMisc): ItemBase {
  let type = TYPE_OF[b.type] ?? 'misc';
  if (b.code === 'box') type = 'cube';
  const out = common(b, type);
  const consumable = type === 'potion' || type === 'scroll' || type === 'tome' || type === 'key' || type === 'quiver';
  out.price = priceOf(b, consumable);
  if (type === 'potion') {
    // Misc.txt stat1/calc1 over len frames (25 a second): hpregen and manarecovery heal over time,
    // a rejuvenation's hitpoints and mana are percentages at once (D2Game SkillItem.cpp potions)
    for (const [stat, v] of b.stats ?? []) {
      if (stat === 'hpregen') {
        out.heal = v;
        out.healSec = (b.len ?? FRAMES_PER_SEC) / FRAMES_PER_SEC;
      } else if (stat === 'manarecovery') {
        out.manaHeal = v;
        out.manaSec = (b.len ?? FRAMES_PER_SEC) / FRAMES_PER_SEC;
      } else if (stat === 'hitpoints') out.rejuv = v / 100;
    }
    out.tint = POTION_TINT[b.code];
    out.stackable = true;
  }
  if (type === 'rune') out.tint = '#ffa31a';
  if (type === 'gem') {
    const g = D2X_GEMS.find((x) => x.id === b.code);
    if (g) out.tint = GEM_TINT[g.gem];
  }
  if (type === 'cube') {
    out.noSell = true;
    out.tint = '#c8a86a';
  }
  if (type === 'gold') out.noDrop = true;
  // quest items and other non-spawning misc (body parts, ears) never drop or sell here
  if (b.quest || !b.spawnable) out.noSell = true;
  return out;
}

const B: ItemBase[] = [...D2X_WEAPONS.map(weaponBase), ...D2X_ARMOR.map(armorBase), ...D2X_MISC.map(miscBase)];
// the runes' and gems' own rows carry what they need beyond Misc.txt: the rune names ("N 号符文")
for (const r of D2X_RUNES) {
  const b = B.find((x) => x.id === r.id);
  if (b) b.reqLvl = r.reqLvl;
}
// ── what a save's item becomes when this build doesn't know its base (a newer build's, say) ──
/** the unknown item's base: it holds the item as saved (Item.raw) until a build that knows it loads the save */
export const UNKNOWN_BASE = 'unknown';
B.push({ id: UNKNOWN_BASE, name: '未知物品', type: 'unknown', w: 1, h: 1, qlvl: 0, price: 0, noDrop: true, noSell: true, tint: '#8a8278' });

export const ITEM_BASES: Record<string, ItemBase> = Object.fromEntries(B.map((b) => [b.id, b]));
export const ALL_BASES = B;

/** what can be worn, and drops */
export const EQUIPPABLE_BASES = B.filter((b) => categoryOf(b.type) !== null);

/** the game's own art id a base is drawn with (models and icons were made for those) */
export function lookOf(id: string | undefined): string {
  return (id && ITEM_BASES[id]?.look) || id || '';
}

/** the Diablo II item type of a base */
export function itypeOf(b: ItemBase): string | undefined {
  return b.itype;
}

const itypeCache = new Map<string, Set<string>>();
/** a D2 item type with all the types it counts as (Sword → Blade → Melee Weapon → Weapon) */
export function itypeSet(code: string | undefined): Set<string> {
  if (!code) return new Set();
  let s = itypeCache.get(code);
  if (!s) {
    s = new Set();
    const walk = (c: string) => {
      if (s!.has(c)) return;
      s!.add(c);
      for (const p of D2X_ITEM_TYPES[c]?.up ?? []) walk(p);
    };
    walk(code);
    itypeCache.set(code, s);
  }
  return s;
}

/** does this base count as any of `inc` and none of `exc` (affix and runeword item types) */
export function itypeMatches(b: ItemBase, inc: string[], exc?: string[]): boolean {
  const s = itypeSet(itypeOf(b));
  return inc.some((t) => s.has(t)) && !(exc ?? []).some((t) => s.has(t));
}

/** blunt weapons do +50% damage to the undead (D2) */
export function isBlunt(b: ItemBase): boolean {
  return itypeSet(itypeOf(b)).has('blun');
}

/** a staff's gem: none on the plainest of each family, then by family and tier */
export function staffGem(id: string): string | undefined {
  const b = ITEM_BASES[id];
  const fam = lookOf(b?.tiers?.[0] ?? id);
  const tier = b?.tier ?? 0;
  if (fam === 'shortstaff' && tier === 0) return undefined;
  const hues: Record<string, string[]> = {
    shortstaff: ['', '#c0a0ff', '#e0c0ff'],
    longstaff: ['#a0c0ff', '#70a8ff', '#4a90ff'],
    gnarledstaff: ['#80e090', '#50d070', '#30c050'],
    battlestaff: ['#60a0ff', '#ff4060', '#ff2040'],
    warstaff: ['#ff6a20', '#ff8a10', '#ffd040'],
  };
  return hues[fam]?.[tier] || '#a0c0ff';
}
