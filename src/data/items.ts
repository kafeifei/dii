export type ItemType =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'staff'
  | 'shield'
  | 'helm'
  | 'armor'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'ring'
  | 'amulet'
  | 'potion'
  | 'rune';

export type EquipSlot = 'head' | 'neck' | 'body' | 'weapon' | 'offhand' | 'hands' | 'waist' | 'feet' | 'ring1' | 'ring2';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'neck', 'body', 'weapon', 'offhand', 'hands', 'waist', 'feet', 'ring1', 'ring2'];

export type Category = 'weapon' | 'helm' | 'body' | 'shield' | 'gloves' | 'boots' | 'belt' | 'ring' | 'amulet';

export interface ItemBase {
  id: string;
  name: string;
  type: ItemType;
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
}

export function categoryOf(type: ItemType): Category | null {
  switch (type) {
    case 'sword':
    case 'axe':
    case 'mace':
    case 'staff':
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

const B: ItemBase[] = [
  // ── swords ──
  { id: 'shortsword', name: '短剑', type: 'sword', w: 1, h: 3, qlvl: 1, dmg: [2, 7], speed: 1.6, reqStr: 0, maxSockets: 2, price: 30 },
  { id: 'scimitar', name: '弯刀', type: 'sword', w: 1, h: 3, qlvl: 3, dmg: [2, 9], speed: 1.75, reqDex: 21, maxSockets: 2, price: 45 },
  { id: 'longsword', name: '长剑', type: 'sword', w: 1, h: 3, qlvl: 8, dmg: [3, 16], speed: 1.45, reqStr: 40, reqDex: 20, maxSockets: 3, price: 90 },
  { id: 'broadsword', name: '阔剑', type: 'sword', w: 2, h: 3, qlvl: 14, dmg: [7, 18], speed: 1.45, reqStr: 48, maxSockets: 3, price: 140 },
  { id: 'warsword', name: '战剑', type: 'sword', w: 1, h: 3, qlvl: 22, dmg: [9, 26], speed: 1.55, reqStr: 71, reqDex: 45, maxSockets: 3, price: 260 },
  { id: 'runeblade', name: '符文剑', type: 'sword', w: 1, h: 4, qlvl: 32, dmg: [15, 38], speed: 1.6, reqStr: 104, reqDex: 72, maxSockets: 4, price: 520 },
  { id: 'greatsword', name: '巨剑', type: 'sword', w: 2, h: 4, qlvl: 18, dmg: [16, 40], speed: 1.15, twoHanded: true, reqStr: 75, maxSockets: 4, price: 300 },
  // ── axes ──
  { id: 'handaxe', name: '手斧', type: 'axe', w: 1, h: 3, qlvl: 1, dmg: [3, 6], speed: 1.55, maxSockets: 2, price: 30 },
  { id: 'waraxe', name: '战斧', type: 'axe', w: 2, h: 3, qlvl: 10, dmg: [10, 18], speed: 1.35, reqStr: 67, maxSockets: 3, price: 150 },
  { id: 'cleaver', name: '劈刀', type: 'axe', w: 2, h: 3, qlvl: 26, dmg: [16, 32], speed: 1.4, reqStr: 95, maxSockets: 3, price: 380 },
  { id: 'greataxe', name: '巨斧', type: 'axe', w: 2, h: 4, qlvl: 16, dmg: [14, 46], speed: 1.05, twoHanded: true, reqStr: 84, maxSockets: 4, price: 320 },
  // ── maces ──
  { id: 'club', name: '棍棒', type: 'mace', w: 1, h: 3, qlvl: 1, dmg: [1, 7], speed: 1.6, maxSockets: 2, price: 25 },
  { id: 'mace', name: '钉锤', type: 'mace', w: 1, h: 3, qlvl: 6, dmg: [3, 12], speed: 1.5, reqStr: 27, maxSockets: 2, price: 70 },
  { id: 'flail', name: '链枷', type: 'mace', w: 2, h: 3, qlvl: 14, dmg: [2, 26], speed: 1.4, reqStr: 41, reqDex: 35, maxSockets: 3, price: 160 },
  { id: 'warhammer', name: '战锤', type: 'mace', w: 2, h: 3, qlvl: 24, dmg: [12, 32], speed: 1.35, reqStr: 90, maxSockets: 3, price: 330 },
  { id: 'maul', name: '巨槌', type: 'mace', w: 2, h: 4, qlvl: 20, dmg: [20, 42], speed: 1.05, twoHanded: true, reqStr: 100, maxSockets: 4, price: 340 },
  { id: 'sacredmace', name: '圣徒锤', type: 'mace', w: 1, h: 3, qlvl: 34, dmg: [18, 40], speed: 1.55, reqStr: 110, maxSockets: 3, price: 560 },
  // ── shields ──
  // ── staves (two-handed; the sorceress's weapon) ──
  { id: 'shortstaff', name: '短杖', type: 'staff', w: 1, h: 3, qlvl: 1, dmg: [1, 5], speed: 1.3, twoHanded: true, maxSockets: 2, price: 20 },
  { id: 'longstaff', name: '长杖', type: 'staff', w: 1, h: 4, qlvl: 8, dmg: [2, 8], speed: 1.25, twoHanded: true, maxSockets: 3, price: 60 },
  { id: 'gnarledstaff', name: '多节杖', type: 'staff', w: 1, h: 4, qlvl: 14, dmg: [4, 12], speed: 1.3, twoHanded: true, reqStr: 20, maxSockets: 3, price: 120 },
  { id: 'battlestaff', name: '战杖', type: 'staff', w: 1, h: 4, qlvl: 22, dmg: [6, 18], speed: 1.25, twoHanded: true, reqStr: 30, maxSockets: 4, price: 240 },
  { id: 'warstaff', name: '战争法杖', type: 'staff', w: 2, h: 4, qlvl: 32, dmg: [12, 28], speed: 1.2, twoHanded: true, reqStr: 45, maxSockets: 4, price: 480 },

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

export const ITEM_BASES: Record<string, ItemBase> = Object.fromEntries(B.map((b) => [b.id, b]));
export const ALL_BASES = B;

export const EQUIPPABLE_BASES = B.filter((b) => categoryOf(b.type) !== null);
