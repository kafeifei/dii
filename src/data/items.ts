import type { PlayerClass } from './classes';
import { D2_ITYPES } from './d2/itypes';
import { D2_GEMS, D2_RUNES } from './d2/socketables';
import { D2_WEAPONS } from './d2/weapons';

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
  | 'shield'
  | 'helm'
  | 'armor'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'ring'
  | 'amulet'
  | 'potion'
  | 'rune'
  | 'gem'
  | 'cube';

export type EquipSlot = 'head' | 'neck' | 'body' | 'weapon' | 'offhand' | 'hands' | 'waist' | 'feet' | 'ring1' | 'ring2';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'neck', 'body', 'weapon', 'offhand', 'hands', 'waist', 'feet', 'ring1', 'ring2'];

export type Category = 'weapon' | 'helm' | 'body' | 'shield' | 'gloves' | 'boots' | 'belt' | 'ring' | 'amulet';

export interface ItemBase {
  id: string;
  name: string;
  type: ItemType;
  /** Diablo II's item code and English name, for bases taken from its tables */
  code?: string;
  en?: string;
  /** Diablo II item type (Weapons.txt `type`), what affixes, runewords and recipes test */
  itype?: string;
  w: number;
  h: number;
  /** quality level: minimum item level to drop */
  qlvl: number;
  reqLvl?: number;
  reqStr?: number;
  reqDex?: number;
  dmg?: [number, number];
  twoHanded?: boolean;
  /** attacks per second */
  speed?: number;
  /** Diablo II weapon speed modifier (negative is faster) */
  wsm?: number;
  /** 0 normal, 1 exceptional, 2 elite */
  tier?: number;
  /** the normal, exceptional and elite versions of this base */
  tiers?: [string, string, string];
  /** % damage per point of strength / dexterity (Weapons.txt StrBonus / DexBonus) */
  strBonus?: number;
  dexBonus?: number;
  /** added to the item level when picking affixes (wands, staves, orbs) */
  magicLvl?: number;
  /** rolls skill bonuses for this class when found (D2 "staff mods") */
  staffMods?: PlayerClass;
  /** only this class can use it */
  cls?: PlayerClass;
  def?: [number, number];
  block?: number;
  maxSockets?: number;
  beltRows?: number;
  price: number;
  /** potion fields */
  heal?: number;
  manaHeal?: number;
  rejuv?: number; // fraction
  /** for icons */
  tint?: string;
  stackable?: boolean;
  noDrop?: boolean;
  /** vendors won't buy it */
  noSell?: boolean;
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

// weapons come from Diablo II's Weapons.txt (src/data/d2, made by tools/d2-import.mjs)
const B: ItemBase[] = [
  ...D2_WEAPONS,
  // ── shields ──
  { id: 'buckler', name: '小圆盾', type: 'shield', w: 2, h: 2, qlvl: 1, def: [4, 6], block: 25, maxSockets: 1, price: 30 },
  { id: 'roundshield', name: '圆盾', type: 'shield', w: 2, h: 2, qlvl: 5, def: [8, 12], block: 30, reqStr: 22, maxSockets: 2, price: 60 },
  { id: 'kiteshield', name: '鸢盾', type: 'shield', w: 2, h: 3, qlvl: 12, def: [16, 24], block: 35, reqStr: 47, maxSockets: 3, price: 140 },
  { id: 'towershield', name: '塔盾', type: 'shield', w: 2, h: 3, qlvl: 20, def: [24, 36], block: 42, reqStr: 75, maxSockets: 3, price: 240 },
  { id: 'gothicshield', name: '哥特盾', type: 'shield', w: 2, h: 4, qlvl: 30, def: [38, 54], block: 40, reqStr: 90, maxSockets: 4, price: 420 },
  // ── helms ──
  { id: 'cap', name: '布帽', type: 'helm', w: 2, h: 2, qlvl: 1, def: [3, 5], maxSockets: 2, price: 25 },
  { id: 'skullcap', name: '骷髅帽', type: 'helm', w: 2, h: 2, qlvl: 5, def: [8, 11], reqStr: 15, maxSockets: 2, price: 55 },
  { id: 'helm', name: '头盔', type: 'helm', w: 2, h: 2, qlvl: 11, def: [15, 18], reqStr: 26, maxSockets: 2, price: 110 },
  { id: 'fullhelm', name: '全盔', type: 'helm', w: 2, h: 2, qlvl: 18, def: [23, 26], reqStr: 41, maxSockets: 3, price: 190 },
  { id: 'greathelm', name: '巨盔', type: 'helm', w: 2, h: 2, qlvl: 26, def: [30, 35], reqStr: 63, maxSockets: 3, price: 300 },
  { id: 'crown', name: '王冠', type: 'helm', w: 2, h: 2, qlvl: 34, def: [38, 45], reqStr: 80, maxSockets: 3, price: 480 },
  // ── body armor ──
  { id: 'quiltedarmor', name: '布甲', type: 'armor', w: 2, h: 3, qlvl: 1, def: [8, 11], maxSockets: 2, price: 40 },
  { id: 'leatherarmor', name: '皮甲', type: 'armor', w: 2, h: 3, qlvl: 3, def: [14, 17], reqStr: 15, maxSockets: 2, price: 70 },
  { id: 'ringmail', name: '环甲', type: 'armor', w: 2, h: 3, qlvl: 9, def: [22, 26], reqStr: 36, maxSockets: 3, price: 140 },
  { id: 'scalemail', name: '鳞甲', type: 'armor', w: 2, h: 3, qlvl: 14, def: [30, 36], reqStr: 44, maxSockets: 3, price: 210 },
  { id: 'chainmail', name: '链甲', type: 'armor', w: 2, h: 3, qlvl: 18, def: [40, 45], reqStr: 48, maxSockets: 3, price: 260 },
  { id: 'breastplate', name: '胸甲', type: 'armor', w: 2, h: 3, qlvl: 22, def: [48, 55], reqStr: 65, maxSockets: 3, price: 330 },
  { id: 'platemail', name: '板甲', type: 'armor', w: 2, h: 3, qlvl: 28, def: [60, 70], reqStr: 82, maxSockets: 4, price: 450 },
  { id: 'gothicplate', name: '哥特板甲', type: 'armor', w: 2, h: 3, qlvl: 36, def: [80, 95], reqStr: 105, maxSockets: 4, price: 680 },
  // ── gloves ──
  { id: 'leathergloves', name: '皮手套', type: 'gloves', w: 2, h: 2, qlvl: 2, def: [2, 3], price: 25 },
  { id: 'heavygloves', name: '重手套', type: 'gloves', w: 2, h: 2, qlvl: 8, def: [5, 6], price: 60 },
  { id: 'chaingloves', name: '链甲手套', type: 'gloves', w: 2, h: 2, qlvl: 16, def: [8, 9], reqStr: 25, price: 120 },
  { id: 'gauntlets', name: '护手', type: 'gloves', w: 2, h: 2, qlvl: 26, def: [12, 15], reqStr: 60, price: 220 },
  // ── boots ──
  { id: 'boots', name: '皮靴', type: 'boots', w: 2, h: 2, qlvl: 2, def: [2, 3], price: 25 },
  { id: 'heavyboots', name: '重靴', type: 'boots', w: 2, h: 2, qlvl: 8, def: [5, 6], reqStr: 18, price: 60 },
  { id: 'chainboots', name: '链甲靴', type: 'boots', w: 2, h: 2, qlvl: 16, def: [8, 9], reqStr: 30, price: 120 },
  { id: 'greaves', name: '胫甲', type: 'boots', w: 2, h: 2, qlvl: 26, def: [12, 15], reqStr: 70, price: 220 },
  // ── belts ──
  { id: 'sash', name: '饰带', type: 'belt', w: 2, h: 1, qlvl: 2, def: [2, 2], beltRows: 1, price: 25 },
  { id: 'lightbelt', name: '轻扣带', type: 'belt', w: 2, h: 1, qlvl: 7, def: [3, 3], beltRows: 2, price: 50 },
  { id: 'belt', name: '腰带', type: 'belt', w: 2, h: 1, qlvl: 14, def: [5, 5], beltRows: 2, reqStr: 25, price: 100 },
  { id: 'heavybelt', name: '重腰带', type: 'belt', w: 2, h: 1, qlvl: 20, def: [7, 7], beltRows: 3, reqStr: 45, price: 170 },
  { id: 'platebelt', name: '板甲腰带', type: 'belt', w: 2, h: 1, qlvl: 30, def: [10, 10], beltRows: 3, reqStr: 60, price: 260 },
  // ── jewelry ──
  { id: 'ring', name: '戒指', type: 'ring', w: 1, h: 1, qlvl: 1, price: 100 },
  { id: 'amulet', name: '护身符', type: 'amulet', w: 1, h: 1, qlvl: 1, price: 160 },
  // ── potions ──
  { id: 'hp1', name: '轻型治疗药剂', type: 'potion', w: 1, h: 1, qlvl: 1, heal: 45, price: 25, tint: '#b81818' },
  { id: 'hp2', name: '治疗药剂', type: 'potion', w: 1, h: 1, qlvl: 8, heal: 90, price: 60, tint: '#c41a1a' },
  { id: 'hp3', name: '强效治疗药剂', type: 'potion', w: 1, h: 1, qlvl: 16, heal: 160, price: 110, tint: '#d61c1c' },
  { id: 'hp4', name: '超强治疗药剂', type: 'potion', w: 1, h: 1, qlvl: 26, heal: 280, price: 200, tint: '#ee2222' },
  { id: 'mp1', name: '轻型法力药剂', type: 'potion', w: 1, h: 1, qlvl: 1, manaHeal: 30, price: 25, tint: '#1c3cc4' },
  { id: 'mp2', name: '法力药剂', type: 'potion', w: 1, h: 1, qlvl: 8, manaHeal: 60, price: 60, tint: '#1f45d8' },
  { id: 'mp3', name: '强效法力药剂', type: 'potion', w: 1, h: 1, qlvl: 16, manaHeal: 110, price: 110, tint: '#2550ee' },
  { id: 'mp4', name: '超强法力药剂', type: 'potion', w: 1, h: 1, qlvl: 26, manaHeal: 190, price: 200, tint: '#3060ff' },
  { id: 'rejuv', name: '回复药剂', type: 'potion', w: 1, h: 1, qlvl: 10, rejuv: 0.35, price: 450, tint: '#9a2ad0' },
  { id: 'rejuvfull', name: '全效回复药剂', type: 'potion', w: 1, h: 1, qlvl: 28, rejuv: 1, price: 1500, tint: '#c040ff' },
];

// ── runes and gems (Diablo II's Gems.txt / Misc.txt) ──
const GEM_TINT: Record<string, string> = { amethyst: '#b05cff', topaz: '#ffd23a', sapphire: '#3a7aff', emerald: '#2ad06a', ruby: '#ff2a3a', diamond: '#e8f0ff', skull: '#d8d0c0' };
for (const r of D2_RUNES) B.push({ id: r.id, code: r.id, name: r.name, en: r.en, type: 'rune', itype: 'rune', w: 1, h: 1, qlvl: r.qlvl, reqLvl: r.reqLvl, price: r.price, tint: '#ffa31a' });
for (const g of D2_GEMS) B.push({ id: g.id, code: g.id, name: g.name, en: g.en, type: 'gem', itype: 'gem', w: 1, h: 1, qlvl: g.qlvl, reqLvl: g.reqLvl, price: g.price, tint: GEM_TINT[g.gem] });
// ── the Horadric Cube: found once, never sold ──
B.push({ id: 'cube', code: 'box', name: '赫拉迪姆魔盒', en: 'Horadric Cube', type: 'cube', w: 2, h: 2, qlvl: 0, price: 0, noDrop: true, noSell: true, tint: '#c8a86a' });

export const ITEM_BASES: Record<string, ItemBase> = Object.fromEntries(B.map((b) => [b.id, b]));
export const ALL_BASES = B;

export const EQUIPPABLE_BASES = B.filter((b) => categoryOf(b.type) !== null);

/** the Diablo II item type of a base: its own for D2 bases, the matching one for this game's armor */
const GAME_ITYPE: Partial<Record<ItemType, string>> = {
  shield: 'shld', helm: 'helm', armor: 'tors', gloves: 'glov', boots: 'boot', belt: 'belt', ring: 'ring', amulet: 'amul', rune: 'rune', gem: 'gem',
};
export function itypeOf(b: ItemBase): string | undefined {
  return b.itype ?? GAME_ITYPE[b.type];
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
      for (const p of D2_ITYPES[c]?.up ?? []) walk(p);
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

/** most sockets a base can have at an item level (ItemTypes.txt MaxSockets1/2/3 for 1-25/26-40/41+) */
export function maxSocketsAt(b: ItemBase, ilvl: number): number {
  const cap = b.maxSockets ?? 0;
  const t = D2_ITYPES[itypeOf(b) ?? ''];
  if (!t) return cap;
  return Math.min(cap, t.sockets[ilvl <= 25 ? 0 : ilvl <= 40 ? 1 : 2]);
}

/** blunt weapons do +50% damage to the undead (D2) */
export function isBlunt(b: ItemBase): boolean {
  return itypeSet(itypeOf(b)).has('blun');
}

/** a staff's gem: none on the plainest of each family, then by family and tier */
export function staffGem(id: string): string | undefined {
  const b = ITEM_BASES[id];
  const fam = b?.tiers?.[0] ?? id;
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
