import { ITEM_BASES, categoryOf, type ItemBase, type Category } from '../data/items';
import { RUNE_BY_ID, RUNEWORD_BY_ID, SET_ITEMS, UNIQUE_BY_ID } from '../data/legendary';
import { addStat, describeStats, type StatBag, type StatKey } from '../data/stats';

export type Rarity = 'normal' | 'superior' | 'magic' | 'rare' | 'unique' | 'set' | 'runeword';

export interface ItemMod {
  stat: StatKey;
  value: number;
}

export interface Item {
  uid: string;
  baseId: string;
  rarity: Rarity;
  ilvl: number;
  name: string;
  mods: ItemMod[];
  defense?: number;
  sockets: number;
  socketed: string[];
  uniqueId?: string;
  setItemId?: string;
  runewordId?: string;
  reqLvl: number;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  normal: '#d8d8d8',
  superior: '#d8d8d8',
  magic: '#7a7aff',
  rare: '#ffff6e',
  unique: '#c8a86a',
  set: '#22d422',
  runeword: '#c8a86a',
};

export const SOCKETED_COLOR = '#8a8a8a';
export const RUNE_COLOR = '#ffa31a';
export const MOD_COLOR = '#7a7aff';

export function baseOf(item: Item): ItemBase {
  return ITEM_BASES[item.baseId];
}

export function itemCategory(item: Item): Category | null {
  return categoryOf(baseOf(item).type);
}

export function itemColor(item: Item): string {
  const b = baseOf(item);
  if (b.type === 'rune') return RUNE_COLOR;
  if ((item.rarity === 'normal' || item.rarity === 'superior') && item.sockets > 0) return SOCKETED_COLOR;
  return RARITY_COLOR[item.rarity];
}

/** mods contributed by socketed runes (when not a runeword: runewords include runes too) */
export function runeStats(item: Item): StatBag {
  const bag: StatBag = {};
  const cat = itemCategory(item);
  for (const rid of item.socketed) {
    const r = RUNE_BY_ID[rid];
    if (!r) continue;
    const list = cat === 'weapon' ? r.weapon : r.armor;
    for (const [k, v] of list) addStat(bag, k, v);
  }
  return bag;
}

/** All mods on the item (explicit + runes), unmerged with base properties */
export function itemMods(item: Item): StatBag {
  const bag: StatBag = {};
  for (const m of item.mods) addStat(bag, m.stat, m.value);
  const rb = runeStats(item);
  for (const k in rb) addStat(bag, k as StatKey, rb[k as StatKey]!);
  return bag;
}

export function itemDefense(item: Item): number {
  if (item.defense === undefined) return 0;
  const m = itemMods(item);
  return Math.floor(item.defense * (1 + (m.defPct ?? 0) / 100) + (m.defLocal ?? 0));
}

export function weaponDamage(item: Item): [number, number] {
  const b = baseOf(item);
  if (!b.dmg) return [0, 0];
  const m = itemMods(item);
  const ed = 1 + (m.dmgPct ?? 0) / 100;
  const min = Math.floor(b.dmg[0] * ed + (m.dmgMin ?? 0));
  const max = Math.max(min + 1, Math.floor(b.dmg[1] * ed + (m.dmgMax ?? 0)));
  return [min, max];
}

/** Stats that apply globally to the wearer (local ones handled separately) */
export function globalItemStats(item: Item): StatBag {
  const m = itemMods(item);
  delete m.dmgPct;
  delete m.dmgMin;
  delete m.dmgMax;
  delete m.defPct;
  delete m.defLocal;
  if (itemCategory(item) !== 'weapon') {
    // jewelry/armor flat damage adds to weapon damage globally
    const raw = itemMods(item);
    if (raw.dmgMin) m.dmgMin = raw.dmgMin;
    if (raw.dmgMax) m.dmgMax = raw.dmgMax;
  }
  return m;
}

export function itemTypeName(item: Item): string {
  return baseOf(item).name;
}

export interface TooltipLine {
  text: string;
  color?: string;
  small?: boolean;
}

export interface ReqContext {
  level: number;
  str: number;
  dex: number;
}

export function tooltip(item: Item, ctx?: ReqContext, priceLine?: string): TooltipLine[] {
  const b = baseOf(item);
  const lines: TooltipLine[] = [];
  const color = itemColor(item);
  if (item.rarity === 'runeword') {
    lines.push({ text: item.name, color });
    lines.push({ text: `'${item.socketed.map((r) => RUNE_BY_ID[r]?.name ?? '?').join('')}'`, color: RARITY_COLOR.unique });
    lines.push({ text: b.name, color: SOCKETED_COLOR });
  } else if (item.rarity === 'unique' || item.rarity === 'set' || item.rarity === 'rare') {
    lines.push({ text: item.name, color });
    lines.push({ text: b.name, color });
  } else {
    lines.push({ text: item.name, color });
  }

  if (b.type === 'potion') {
    if (b.heal) lines.push({ text: `回复 ${b.heal} 点生命（5秒内）` });
    if (b.manaHeal) lines.push({ text: `回复 ${b.manaHeal} 点法力（5秒内）` });
    if (b.rejuv) lines.push({ text: `立即回复 ${Math.round(b.rejuv * 100)}% 生命与法力` });
    lines.push({ text: '右键点击使用', small: true, color: '#999' });
    if (priceLine) lines.push({ text: priceLine, small: true });
    return lines;
  }
  if (b.type === 'rune') {
    const r = RUNE_BY_ID[b.id];
    lines.push({ text: '可镶嵌于有孔的物品中', color: '#aaa', small: true });
    lines.push({ text: '武器：' + describeStats(Object.fromEntries(r.weapon)).join('，') });
    lines.push({ text: '头盔/铠甲/盾牌：' + describeStats(Object.fromEntries(r.armor)).join('，') });
    lines.push({ text: `需要等级：${r.level}`, color: ctx && ctx.level < r.level ? '#ff4040' : undefined });
    if (priceLine) lines.push({ text: priceLine, small: true });
    return lines;
  }

  if (b.dmg) {
    const [mn, mx] = weaponDamage(item);
    const enhanced = mn !== b.dmg[0] || mx !== b.dmg[1];
    lines.push({ text: `${b.twoHanded ? '双手' : '单手'}伤害：${mn} - ${mx}`, color: enhanced ? MOD_COLOR : undefined });
    lines.push({ text: `攻击速度：${b.speed! >= 1.6 ? '非常快' : b.speed! >= 1.45 ? '快' : b.speed! >= 1.25 ? '普通' : '慢'}`, small: true });
  }
  if (item.defense !== undefined) {
    const d = itemDefense(item);
    lines.push({ text: `防御：${d}`, color: d !== item.defense ? MOD_COLOR : undefined });
  }
  if (b.block) lines.push({ text: `格挡几率：${b.block}%` });
  if (b.beltRows) lines.push({ text: `腰带格数：${(b.beltRows + 1) * 4}` });
  if (ctx) {
    if (b.reqDex) lines.push({ text: `需要敏捷：${b.reqDex}`, color: ctx.dex < b.reqDex ? '#ff4040' : undefined });
    if (b.reqStr) lines.push({ text: `需要力量：${b.reqStr}`, color: ctx.str < b.reqStr ? '#ff4040' : undefined });
    if (item.reqLvl > 1) lines.push({ text: `需要等级：${item.reqLvl}`, color: ctx.level < item.reqLvl ? '#ff4040' : undefined });
  }

  const mods = itemMods(item);
  const skip: StatKey[] = [];
  if (b.dmg) skip.push('dmgPct', 'dmgMin', 'dmgMax');
  if (item.defense !== undefined) skip.push('defLocal');
  const descLines = describeStats(mods, skip);
  // still show enhanced damage % as a property line
  if (b.dmg && mods.dmgPct) descLines.unshift(`+${Math.round(mods.dmgPct)}% 增强伤害`);
  for (const l of descLines) lines.push({ text: l, color: MOD_COLOR });

  if (item.sockets > 0) {
    lines.push({ text: `镶孔（${item.socketed.length}/${item.sockets}）`, color: MOD_COLOR });
  }
  if (item.rarity === 'superior') lines.push({ text: '优质', color: '#aaa', small: true });

  if (item.uniqueId) {
    const u = UNIQUE_BY_ID[item.uniqueId];
    if (u?.lore) lines.push({ text: u.lore, color: '#a08a5a', small: true });
  }
  if (item.setItemId) {
    const s = SET_ITEMS[item.setItemId];
    if (s) {
      lines.push({ text: '', small: true });
      lines.push({ text: s.set.name, color: RARITY_COLOR.unique });
      for (const it of s.set.items) lines.push({ text: it.name, color: RARITY_COLOR.set, small: true });
      for (const [cnt, bonus] of Object.entries(s.set.bonuses)) {
        const bag: StatBag = {};
        for (const [k, v] of bonus) addStat(bag, k, v);
        lines.push({ text: `（${cnt}件）${describeStats(bag).join('，')}`, color: '#c8a86a', small: true });
      }
    }
  }
  if (priceLine) lines.push({ text: priceLine, small: true });
  return lines;
}

export function sellPrice(item: Item): number {
  const b = baseOf(item);
  const mult: Record<Rarity, number> = { normal: 1, superior: 1.3, magic: 2, rare: 3.5, unique: 5, set: 5, runeword: 6 };
  return Math.max(1, Math.floor((b.price * mult[item.rarity] * (1 + item.mods.length * 0.15)) / 4));
}

export function buyPrice(item: Item): number {
  return baseOf(item).price;
}

export function canSocket(item: Item): boolean {
  return item.sockets > item.socketed.length && (item.rarity !== 'runeword');
}

export function isRuneword(item: Item): boolean {
  return !!item.runewordId && !!RUNEWORD_BY_ID[item.runewordId];
}
