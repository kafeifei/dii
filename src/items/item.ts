import { ITEM_BASES, categoryOf, type ItemBase, type Category } from '../data/items';
import { className, skillRef, skillTab } from '../data/d2/skillmap';
import { SKILL_BY_ID } from '../data/skills';
import { RUNE_BY_ID, RUNEWORD_BY_ID, SET_ITEMS, SOCKETABLE_BY_ID, UNIQUE_BY_ID, type Socketable } from '../data/legendary';
import { addStat, describeStats, INERT_STATS, PARAM_STATS, type StatBag, type StatKey } from '../data/stats';
import { propMods, rollMax } from './props';

export type Rarity = 'normal' | 'superior' | 'magic' | 'rare' | 'unique' | 'set' | 'runeword';

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

export interface Item {
  uid: string;
  baseId: string;
  rarity: Rarity;
  ilvl: number;
  /** the name it was made with, kept in the save; what it shows is displayName(item) */
  name: string;
  mods: ItemMod[];
  defense?: number;
  sockets: number;
  socketed: string[];
  uniqueId?: string;
  setItemId?: string;
  runewordId?: string;
  /**
   * Rows of the magic prefix and suffix tables the item rolled, and a rare item's two name words
   * (rows of the rare prefix and suffix word tables): what displayName will build the name from
   * once the renamed tables fill them in. Unset on every item made so far
   */
  prefixes?: number[];
  suffixes?: number[];
  rareName?: [number, number];
  reqLvl: number;
  /** charges left, by skill, for "level N skill (X/Y charges)" */
  charges?: Record<string, number>;
  /**
   * An item from a save made before the Diablo II items keeps the requirements it had: the level
   * (its D2 runes don't raise it, only runes socketed since), and its old base's strength / dexterity
   */
  legacy?: { lvl: number; str: number; dex: number; runes: number };
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
const INERT_COLOR = '#6a6a78';

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

/** which of a rune's or gem's three lists applies in this item */
export function socketList(s: Socketable, item: Item) {
  const cat = itemCategory(item);
  return cat === 'weapon' ? s.weapon : cat === 'shield' ? s.shield : s.armor;
}

/** mods from the runes and gems in an item's sockets */
export function socketMods(item: Item): ItemMod[] {
  const out: ItemMod[] = [];
  const onWeapon = itemCategory(item) === 'weapon';
  for (const id of item.socketed) {
    const s = SOCKETABLE_BY_ID[id];
    if (s) out.push(...propMods(socketList(s, item), onWeapon, rollMax));
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
  return sumMods(socketMods(item), clvl, sumMods(item.mods, clvl));
}

/** the mods that carry a skill or class: skill bonuses, auras, procs, charges */
export function paramMods(item: Item): ItemMod[] {
  return [...item.mods, ...socketMods(item)].filter((m) => PARAM_STATS.has(m.stat));
}

export function itemDefense(item: Item): number {
  if (item.defense === undefined) return 0;
  const m = itemMods(item);
  return Math.floor(item.defense * (1 + (m.defPct ?? 0) / 100) + (m.defLocal ?? 0));
}

export function weaponDamage(item: Item, clvl = 1): [number, number] {
  const b = baseOf(item);
  if (!b.dmg) return [0, 0];
  const m = itemMods(item, clvl);
  const ed = 1 + (m.dmgPct ?? 0) / 100;
  const min = Math.floor(b.dmg[0] * ed + (m.dmgMin ?? 0));
  const max = Math.max(min + 1, Math.floor(b.dmg[1] * ed + (m.dmgMax ?? 0)));
  return [min, max];
}

/** Stats that apply globally to the wearer (local ones handled separately) */
export function globalItemStats(item: Item, clvl = 1): StatBag {
  const m = itemMods(item, clvl);
  const raw = { ...m };
  delete m.dmgPct;
  delete m.dmgMin;
  delete m.dmgMax;
  delete m.defPct;
  delete m.defLocal;
  if (itemCategory(item) !== 'weapon') {
    // jewelry/armor flat damage adds to weapon damage globally
    if (raw.dmgMin) m.dmgMin = raw.dmgMin;
    if (raw.dmgMax) m.dmgMax = raw.dmgMax;
  }
  return m;
}

/** the level an item needs: its own, raised by any rune or gem in it (D2) */
export function itemReqLvl(item: Item): number {
  let r = item.legacy ? item.legacy.lvl : item.reqLvl;
  item.socketed.forEach((id, i) => {
    if (!item.legacy || i >= item.legacy.runes) r = Math.max(r, SOCKETABLE_BY_ID[id]?.reqLvl ?? 1);
  });
  return r;
}

/** strength and dexterity an item needs, after "requirements -X%" */
export function itemReqStats(item: Item): { str: number; dex: number } {
  const b = baseOf(item);
  const ease = 1 + (itemMods(item).ease ?? 0) / 100;
  const str = item.legacy ? item.legacy.str : (b.reqStr ?? 0);
  const dex = item.legacy ? item.legacy.dex : (b.reqDex ?? 0);
  return { str: Math.floor(str * ease), dex: Math.floor(dex * ease) };
}

export function itemTypeName(item: Item): string {
  return baseOf(item).name;
}

/**
 * The name an item shows, wherever one is shown. With the renamed tables it will be built from
 * the item's rows (prefixes, suffixes, rareName), so a renamed affix renames the items already
 * made; an item without them, like every one made so far, shows the name it was saved with
 */
export function displayName(item: Item): string {
  return item.name;
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
  cls?: string;
}

const PROC_TEXT: Partial<Record<StatKey, string>> = {
  procHit: '击中时',
  procStruck: '被击中时',
  procAttack: '攻击时',
  procKill: '消灭一名敌人时',
  procDeath: '死亡时',
  procLevelUp: '升级时',
};

/** a mod with a skill or class, as a tooltip line; `live` is false when it can't work in this game */
export function describeParamMod(m: ItemMod, item: Item | null): { text: string; live: boolean } {
  const p = m.param ?? '';
  switch (m.stat) {
    case 'skill': {
      const s = skillRef(p);
      return { text: `+${m.value} ${s.name}（仅限${className(s.cls ?? '')}）`, live: !!s.id };
    }
    case 'oskill': {
      const s = skillRef(p);
      return { text: `+${m.value} ${s.name}`, live: !!s.id };
    }
    case 'skillTab': {
      const t = skillTab(Number(p));
      return { text: `+${m.value} ${t.name}（仅限${className(t.cls)}）`, live: t.cls === 'sor' || t.cls === 'pal' };
    }
    case 'clsSkills':
      return { text: `+${m.value} ${className(p)}技能等级`, live: p === 'sor' || p === 'pal' };
    case 'aura': {
      const s = skillRef(p);
      const aura = s.name.endsWith('光环') ? s.name : `${s.name}光环`;
      return { text: `装备时获得 ${m.value} 级${aura}`, live: !!s.id };
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

/** tooltip lines for a bag of mods plus the parametric ones, greying what does nothing here */
export function modLines(mods: ItemMod[], clvl: number, item: Item | null, skip: StatKey[] = []): TooltipLine[] {
  const lines: TooltipLine[] = [];
  for (const m of mods) {
    if (!PARAM_STATS.has(m.stat)) continue;
    const d = describeParamMod(m, item);
    lines.push({ text: d.text, color: d.live ? MOD_COLOR : INERT_COLOR });
  }
  const bag = sumMods(mods, clvl);
  const inert: StatBag = {};
  for (const k of Object.keys(bag) as StatKey[]) {
    if (INERT_STATS.has(k)) {
      inert[k] = bag[k];
      delete bag[k];
    }
  }
  const perLvl = new Set(mods.filter((m) => m.perLvl).map((m) => m.stat));
  for (const l of describeStats(bag, skip)) lines.push({ text: l, color: MOD_COLOR });
  // "+X (based on character level)" for the per-level ones
  if (perLvl.size) {
    for (const ln of lines) for (const k of perLvl) if (statLine(k, bag) === ln.text) ln.text += '（基于角色等级）';
  }
  for (const l of describeStats(inert)) lines.push({ text: l, color: INERT_COLOR });
  return lines;
}

function statLine(k: StatKey, bag: StatBag): string | undefined {
  return bag[k] ? describeStats({ [k]: bag[k] })[0] : undefined;
}

export function tooltip(item: Item, ctx?: ReqContext, priceLine?: string): TooltipLine[] {
  const b = baseOf(item);
  const lines: TooltipLine[] = [];
  const color = itemColor(item);
  const clvl = ctx?.level ?? 1;
  const name = displayName(item);
  if (item.rarity === 'runeword') {
    lines.push({ text: name, color });
    lines.push({ text: `'${item.socketed.map((r) => RUNE_BY_ID[r]?.letter ?? '?').join('')}'`, color: RARITY_COLOR.unique });
    lines.push({ text: b.name, color: SOCKETED_COLOR });
    if (!RUNEWORD_BY_ID[item.runewordId ?? '']) lines.push({ text: '旧版符文之语（已不能再制作）', small: true, color: '#8a8278' });
  } else if (item.rarity === 'unique' || item.rarity === 'set' || item.rarity === 'rare') {
    lines.push({ text: name, color });
    lines.push({ text: b.name, color });
  } else {
    lines.push({ text: name, color });
  }

  if (b.type === 'potion') {
    if (b.heal) lines.push({ text: `回复 ${b.heal} 点生命（5秒内）` });
    if (b.manaHeal) lines.push({ text: `回复 ${b.manaHeal} 点法力（5秒内）` });
    if (b.rejuv) lines.push({ text: `立即回复 ${Math.round(b.rejuv * 100)}% 生命与法力` });
    lines.push({ text: '右键点击使用', small: true, color: '#999' });
    if (priceLine) lines.push({ text: priceLine, small: true });
    return lines;
  }
  if (b.type === 'cube') {
    lines.push({ text: '右键点击打开', small: true, color: '#999' });
    lines.push({ text: '放入物品后按"转化"，按赫拉迪姆的配方合成', small: true, color: '#aaa' });
    lines.push({ text: '拿着物品点魔盒，不用打开就能放进去', small: true, color: '#aaa' });
    return lines;
  }
  if (b.type === 'rune' || b.type === 'gem') {
    const s = SOCKETABLE_BY_ID[b.id];
    lines.push({ text: '可镶嵌于有孔的物品中', color: '#aaa', small: true });
    const part = (label: string, props: typeof s.weapon, onWeapon: boolean) => {
      const ls = modLines(propMods(props, onWeapon, rollMax), clvl, null).map((l) => l.text);
      lines.push({ text: `${label}：${ls.join('，') || '—'}` });
    };
    part('武器', s.weapon, true);
    part('头盔/铠甲', s.armor, false);
    part('盾牌', s.shield, false);
    lines.push({ text: `需要等级：${s.reqLvl}`, color: ctx && ctx.level < s.reqLvl ? '#ff4040' : undefined });
    if (priceLine) lines.push({ text: priceLine, small: true });
    return lines;
  }

  if (b.dmg) {
    const [mn, mx] = weaponDamage(item, clvl);
    const enhanced = mn !== b.dmg[0] || mx !== b.dmg[1];
    lines.push({ text: `${b.twoHanded ? '双手' : '单手'}伤害：${mn} - ${mx}`, color: enhanced ? MOD_COLOR : undefined });
    const ws = b.wsm ?? 0;
    lines.push({ text: `攻击速度：${ws <= -20 ? '非常快' : ws < 0 ? '快' : ws === 0 ? '普通' : ws <= 10 ? '慢' : '非常慢'}`, small: true });
  }
  if (item.defense !== undefined) {
    const d = itemDefense(item);
    lines.push({ text: `防御：${d}`, color: d !== item.defense ? MOD_COLOR : undefined });
  }
  if (b.block) lines.push({ text: `格挡几率：${b.block}%` });
  if (b.beltRows) lines.push({ text: `腰带格数：${(b.beltRows + 1) * 4}` });
  if (ctx) {
    const req = itemReqStats(item);
    const lvl = itemReqLvl(item);
    if (b.cls) lines.push({ text: `（仅限${className(b.cls === 'sorceress' ? 'sor' : 'pal')}）`, color: ctx.cls && ctx.cls !== b.cls ? '#ff4040' : undefined });
    if (req.dex) lines.push({ text: `需要敏捷：${req.dex}`, color: ctx.dex < req.dex ? '#ff4040' : undefined });
    if (req.str) lines.push({ text: `需要力量：${req.str}`, color: ctx.str < req.str ? '#ff4040' : undefined });
    if (lvl > 1) lines.push({ text: `需要等级：${lvl}`, color: ctx.level < lvl ? '#ff4040' : undefined });
  }
  if (b.tier) lines.push({ text: b.tier === 2 ? '精英' : '扩展', color: '#aaa', small: true });

  const all = [...item.mods, ...socketMods(item)];
  const skip: StatKey[] = [];
  if (b.dmg) skip.push('dmgMin', 'dmgMax');
  if (item.defense !== undefined) skip.push('defLocal');
  const ml = modLines(all, clvl, item, skip);
  for (const l of ml) lines.push(l);

  if (item.sockets > 0) {
    lines.push({ text: `镶孔（${item.socketed.length}/${item.sockets}）`, color: MOD_COLOR });
  }
  if (item.rarity === 'superior') lines.push({ text: '优质', color: '#aaa', small: true });
  if (ml.some((l) => l.color === INERT_COLOR)) lines.push({ text: '灰色属性在本作中没有效果', color: INERT_COLOR, small: true });

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
  if (b.noSell) return 0;
  const mult: Record<Rarity, number> = { normal: 1, superior: 1.3, magic: 2, rare: 3.5, unique: 5, set: 5, runeword: 6 };
  return Math.max(1, Math.floor((b.price * mult[item.rarity] * (1 + item.mods.length * 0.15)) / 4));
}

export function buyPrice(item: Item): number {
  return baseOf(item).price;
}

export function canSocket(item: Item): boolean {
  return item.sockets > item.socketed.length && item.rarity !== 'runeword';
}

export function isRuneword(item: Item): boolean {
  return !!item.runewordId && !!RUNEWORD_BY_ID[item.runewordId];
}
