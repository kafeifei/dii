import type { Category } from './items';
import type { StatKey } from './stats';

export interface AffixDef {
  id: string;
  name: string;
  kind: 'prefix' | 'suffix';
  /** min item level */
  level: number;
  /** exclusive group: an item can't roll two affixes of the same group */
  group: string;
  cats: Category[];
  mods: { stat: StatKey; min: number; max: number }[];
  weight: number;
}

const WEAPON: Category[] = ['weapon'];
const ARMOR: Category[] = ['helm', 'body', 'shield', 'gloves', 'boots', 'belt'];
const JEWEL: Category[] = ['ring', 'amulet'];
const ALL: Category[] = [...WEAPON, ...ARMOR, ...JEWEL];
const BODYLIKE: Category[] = ['helm', 'body', 'shield', 'belt'];

let n = 0;
function tiers(
  kind: AffixDef['kind'],
  group: string,
  cats: Category[],
  weight: number,
  list: [string, number, ...[StatKey, number, number][]][],
): AffixDef[] {
  return list.map(([name, level, ...mods]) => ({
    id: `${group}_${n++}`,
    name,
    kind,
    level,
    group,
    cats,
    weight,
    mods: mods.map(([stat, min, max]) => ({ stat, min, max })),
  }));
}

export const AFFIXES: AffixDef[] = [
  // ───────── prefixes ─────────
  ...tiers('prefix', 'ed', WEAPON, 10, [
    ['坚固的', 1, ['dmgPct', 20, 30]],
    ['锐利的', 6, ['dmgPct', 31, 40]],
    ['精良的', 12, ['dmgPct', 41, 50]],
    ['残暴的', 20, ['dmgPct', 51, 65]],
    ['野蛮的', 30, ['dmgPct', 66, 80]],
    ['凶残的', 40, ['dmgPct', 81, 100]],
  ]),
  ...tiers('prefix', 'edar', WEAPON, 6, [
    ['老兵的', 4, ['dmgPct', 15, 25], ['ar', 15, 30]],
    ['斗士的', 14, ['dmgPct', 26, 40], ['ar', 31, 60]],
    ['勇士的', 26, ['dmgPct', 41, 60], ['ar', 61, 100]],
    ['冠军的', 38, ['dmgPct', 61, 80], ['ar', 101, 150]],
  ]),
  ...tiers('prefix', 'ar', ['weapon', 'gloves', 'ring', 'amulet', 'helm'], 7, [
    ['精准的', 1, ['ar', 10, 20]],
    ['专注的', 6, ['ar', 21, 40]],
    ['明察的', 14, ['ar', 41, 65]],
    ['鹰眼的', 24, ['ar', 66, 100]],
    ['神射的', 36, ['ar', 101, 150]],
  ]),
  ...tiers('prefix', 'dmgmax', ['weapon', 'gloves', 'ring', 'amulet'], 5, [
    ['尖刺的', 3, ['dmgMax', 1, 3]],
    ['锯齿的', 12, ['dmgMax', 4, 7]],
    ['撕裂的', 24, ['dmgMax', 8, 12]],
  ]),
  ...tiers('prefix', 'edef', ARMOR, 10, [
    ['结实的', 1, ['defPct', 10, 20]],
    ['坚韧的', 8, ['defPct', 21, 30]],
    ['强固的', 16, ['defPct', 31, 40]],
    ['钢铸的', 26, ['defPct', 41, 55]],
    ['神圣的', 36, ['defPct', 56, 75]],
  ]),
  ...tiers('prefix', 'flatdef', ARMOR, 6, [
    ['加固的', 1, ['defLocal', 5, 10]],
    ['镶钉的', 10, ['defLocal', 11, 25]],
    ['铁壁的', 22, ['defLocal', 26, 45]],
  ]),
  ...tiers('prefix', 'mana', [...JEWEL, 'helm', 'body', 'shield', 'weapon'], 7, [
    ['灵动的', 1, ['mana', 5, 10]],
    ['冥思的', 8, ['mana', 11, 20]],
    ['秘法的', 18, ['mana', 21, 30]],
    ['星界的', 30, ['mana', 31, 45]],
  ]),
  ...tiers('prefix', 'resfire', [...ARMOR, ...JEWEL], 6, [
    ['耐火的', 1, ['resFire', 5, 10]],
    ['防火的', 10, ['resFire', 11, 20]],
    ['炎晶的', 22, ['resFire', 21, 30]],
  ]),
  ...tiers('prefix', 'rescold', [...ARMOR, ...JEWEL], 6, [
    ['耐寒的', 1, ['resCold', 5, 10]],
    ['御寒的', 10, ['resCold', 11, 20]],
    ['霜晶的', 22, ['resCold', 21, 30]],
  ]),
  ...tiers('prefix', 'reslight', [...ARMOR, ...JEWEL], 6, [
    ['绝缘的', 1, ['resLight', 5, 10]],
    ['避雷的', 10, ['resLight', 11, 20]],
    ['雷晶的', 22, ['resLight', 21, 30]],
  ]),
  ...tiers('prefix', 'respoison', [...ARMOR, ...JEWEL], 5, [
    ['解毒的', 1, ['resPoison', 5, 10]],
    ['净化的', 10, ['resPoison', 11, 20]],
    ['翠晶的', 22, ['resPoison', 21, 30]],
  ]),
  ...tiers('prefix', 'resall', [...BODYLIKE, ...JEWEL], 3, [
    ['七彩的', 12, ['resAll', 5, 10]],
    ['虹光的', 24, ['resAll', 11, 15]],
    ['棱镜的', 36, ['resAll', 16, 22]],
  ]),
  ...tiers('prefix', 'mf', ['helm', 'gloves', 'boots', 'ring', 'amulet'], 4, [
    ['寻宝者的', 6, ['mf', 5, 12]],
    ['幸运的', 18, ['mf', 13, 25]],
  ]),
  ...tiers('prefix', 'skills', ['amulet', 'weapon', 'helm'], 2, [
    ['圣徒的', 20, ['skillsAll', 1, 1]],
    ['先知的', 38, ['skillsAll', 2, 2]],
  ]),
  ...tiers('prefix', 'elemfire', ['ring', 'amulet', 'gloves'], 3, [
    ['灼热的', 4, ['fireMin', 1, 2], ['fireMax', 3, 6]],
    ['熔岩的', 18, ['fireMin', 3, 6], ['fireMax', 8, 14]],
  ]),
  // ───────── suffixes ─────────
  ...tiers('suffix', 'str', ['weapon', 'helm', 'body', 'gloves', 'belt', 'ring', 'amulet', 'shield'], 8, [
    ['之力', 1, ['str', 1, 3]],
    ['之蛮力', 8, ['str', 4, 7]],
    ['之巨力', 18, ['str', 8, 12]],
    ['之泰坦', 30, ['str', 13, 18]],
  ]),
  ...tiers('suffix', 'dex', ['weapon', 'helm', 'gloves', 'boots', 'ring', 'amulet'], 8, [
    ['之灵巧', 1, ['dex', 1, 3]],
    ['之敏捷', 8, ['dex', 4, 7]],
    ['之矫健', 18, ['dex', 8, 12]],
    ['之鬼魅', 30, ['dex', 13, 18]],
  ]),
  ...tiers('suffix', 'vit', ['body', 'helm', 'shield', 'belt', 'ring', 'amulet', 'boots'], 8, [
    ['之坚毅', 1, ['vit', 1, 3]],
    ['之活力', 8, ['vit', 4, 7]],
    ['之生机', 18, ['vit', 8, 12]],
    ['之不朽', 30, ['vit', 13, 18]],
  ]),
  ...tiers('suffix', 'ene', ['helm', 'ring', 'amulet', 'shield', 'weapon'], 6, [
    ['之心智', 1, ['ene', 1, 3]],
    ['之智慧', 8, ['ene', 4, 7]],
    ['之贤者', 18, ['ene', 8, 12]],
  ]),
  ...tiers('suffix', 'life', [...ARMOR, ...JEWEL], 9, [
    ['之狼', 1, ['life', 5, 10]],
    ['之熊', 8, ['life', 11, 20]],
    ['之象', 16, ['life', 21, 30]],
    ['之巨人', 26, ['life', 31, 45]],
    ['之泰坦巨人', 38, ['life', 46, 60]],
  ]),
  ...tiers('suffix', 'regen', [...ARMOR, ...JEWEL], 5, [
    ['之复苏', 1, ['lifeRegen', 1, 2]],
    ['之再生', 12, ['lifeRegen', 3, 5]],
  ]),
  ...tiers('suffix', 'manaregen', ['ring', 'amulet', 'helm', 'shield'], 4, [
    ['之冥想', 4, ['manaRegen', 15, 30]],
    ['之静思', 16, ['manaRegen', 31, 60]],
  ]),
  ...tiers('suffix', 'ias', ['weapon', 'gloves'], 6, [
    ['之疾刃', 4, ['ias', 10, 10]],
    ['之迅击', 14, ['ias', 20, 20]],
    ['之风暴', 26, ['ias', 30, 30]],
  ]),
  ...tiers('suffix', 'frw', ['boots'], 10, [
    ['之旅者', 1, ['frw', 10, 10]],
    ['之疾行', 10, ['frw', 20, 20]],
    ['之神速', 22, ['frw', 30, 30]],
  ]),
  ...tiers('suffix', 'fcr', ['amulet', 'ring', 'weapon'], 4, [
    ['之咒法', 6, ['fcr', 10, 10]],
    ['之魔导', 18, ['fcr', 20, 20]],
  ]),
  ...tiers('suffix', 'fhr', ['body', 'shield', 'belt', 'helm'], 4, [
    ['之坚忍', 4, ['fhr', 10, 10]],
    ['之不屈', 16, ['fhr', 20, 20]],
  ]),
  ...tiers('suffix', 'leech', ['weapon', 'ring', 'amulet', 'gloves'], 6, [
    ['之水蛭', 3, ['lifeSteal', 2, 3]],
    ['之吸血', 12, ['lifeSteal', 4, 5]],
    ['之血族', 24, ['lifeSteal', 6, 8]],
  ]),
  ...tiers('suffix', 'mleech', ['weapon', 'ring', 'amulet', 'helm'], 4, [
    ['之汲魂', 6, ['manaSteal', 2, 3]],
    ['之噬魂', 18, ['manaSteal', 4, 6]],
  ]),
  ...tiers('suffix', 'mfs', ['ring', 'amulet', 'boots', 'gloves', 'helm'], 4, [
    ['之幸运', 4, ['mf', 5, 15]],
    ['之机缘', 18, ['mf', 16, 25]],
  ]),
  ...tiers('suffix', 'gf', [...ARMOR, ...JEWEL], 4, [
    ['之贪婪', 1, ['gf', 20, 40]],
    ['之财富', 14, ['gf', 41, 80]],
  ]),
  ...tiers('suffix', 'light', ['helm', 'ring', 'amulet', 'body'], 3, [['之光明', 1, ['lightRadius', 1, 2]]]),
  ...tiers('suffix', 'thorns', ['body', 'shield', 'helm'], 4, [
    ['之荆棘', 4, ['thorns', 2, 6]],
    ['之刺猬', 16, ['thorns', 8, 18]],
  ]),
  ...tiers('suffix', 'crit', ['weapon', 'gloves'], 4, [
    ['之处决', 10, ['crit', 5, 10]],
    ['之斩首', 26, ['crit', 11, 20]],
  ]),
  ...tiers('suffix', 'block', ['shield'], 8, [
    ['之格挡', 4, ['block', 5, 10]],
    ['之守卫', 16, ['block', 11, 20]],
  ]),
  ...tiers('suffix', 'efire', WEAPON, 6, [
    ['之余烬', 2, ['fireMin', 1, 3], ['fireMax', 4, 8]],
    ['之烈焰', 12, ['fireMin', 4, 8], ['fireMax', 10, 18]],
    ['之炼狱', 26, ['fireMin', 10, 16], ['fireMax', 22, 36]],
  ]),
  ...tiers('suffix', 'ecold', WEAPON, 6, [
    ['之寒霜', 2, ['coldMin', 1, 2], ['coldMax', 3, 6]],
    ['之冰川', 12, ['coldMin', 3, 6], ['coldMax', 8, 14]],
    ['之永冬', 26, ['coldMin', 8, 12], ['coldMax', 18, 28]],
  ]),
  ...tiers('suffix', 'elight', WEAPON, 6, [
    ['之火花', 2, ['lightMin', 1, 1], ['lightMax', 5, 10]],
    ['之雷鸣', 12, ['lightMin', 1, 3], ['lightMax', 14, 26]],
    ['之天雷', 26, ['lightMin', 2, 5], ['lightMax', 32, 54]],
  ]),
  ...tiers('suffix', 'epoison', WEAPON, 5, [
    ['之毒蛇', 2, ['poisonDmg', 8, 14]],
    ['之瘟疫', 14, ['poisonDmg', 24, 40]],
    ['之腐蚀', 28, ['poisonDmg', 60, 90]],
  ]),
  ...tiers('suffix', 'kill', ['weapon', 'gloves', 'ring', 'amulet'], 3, [
    ['之收割', 8, ['lifePerKill', 2, 5]],
    ['之献祭', 8, ['manaPerKill', 1, 3]],
  ]),
];

export const RARE_FIRST = [
  '厄运', '灾祸', '鲜血', '白骨', '亡魂', '风暴', '暗影', '苍白', '狂怒', '渴血', '雷鸣', '冰霜',
  '野兽', '疫病', '巨人', '烈焰', '黑暗', '死亡', '恐惧', '腐朽', '灵魂', '孤狼', '鸦羽', '荆棘',
  '寂静', '深渊', '血月', '铁誓', '余烬', '寒鸦',
];

export const RARE_SECOND: Record<Category, string[]> = {
  weapon: ['之牙', '獠牙', '啸叫', '撕裂者', '收割者', '裂口', '咬噬', '之刺', '之锋', '断罪'],
  helm: ['之冠', '之颅', '之面', '之眼', '之盔', '之角'],
  body: ['之壳', '之皮', '之斗篷', '之铠', '之鳞', '之衣'],
  shield: ['之壁', '之卫', '之盾', '之墙', '之门'],
  gloves: ['之握', '之爪', '之拳', '之手', '之钳'],
  boots: ['之足', '之行', '之奔', '之踵', '之迹'],
  belt: ['之扣', '之束', '之环', '之缚', '之链'],
  ring: ['之环', '之圈', '之戒', '之约', '之誓'],
  amulet: ['之符', '之星', '之眼', '之心', '之印'],
};
