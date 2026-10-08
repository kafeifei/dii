import { ITEM_BASES, type Category } from './items';
import type { StatKey } from './stats';

type ModRange = [StatKey, number, number];

export interface UniqueDef {
  id: string;
  name: string;
  baseId: string;
  level: number;
  reqLvl: number;
  mods: ModRange[];
  lore?: string;
}

export const UNIQUES: UniqueDef[] = [
  { id: 'u_firstfang', name: '初生之牙', baseId: 'shortsword', level: 3, reqLvl: 3,
    mods: [['dmgPct', 50, 70], ['str', 4, 6], ['lifeSteal', 4, 4], ['ias', 20, 20]], lore: '每一个猎手都从第一颗牙开始。' },
  { id: 'u_ashcleaver', name: '灰烬劈斩', baseId: 'handaxe', level: 5, reqLvl: 5,
    mods: [['dmgPct', 60, 80], ['fireMin', 3, 5], ['fireMax', 10, 14], ['resFire', 15, 15], ['lightRadius', 1, 1]] },
  { id: 'u_bonebreaker', name: '碎骨者', baseId: 'mace', level: 9, reqLvl: 8,
    mods: [['dmgPct', 80, 110], ['dmgMax', 4, 6], ['crit', 15, 15], ['ar', 50, 80]], lore: '骷髅最怕的东西。' },
  { id: 'u_oathblade', name: '誓约之刃', baseId: 'longsword', level: 14, reqLvl: 12,
    mods: [['dmgPct', 90, 120], ['skillsAll', 1, 1], ['lifeSteal', 5, 6], ['resAll', 10, 15], ['ar', 80, 120]], lore: '剑身上刻着一个早已被遗忘的名字。' },
  { id: 'u_stormcaller', name: '唤雷者', baseId: 'flail', level: 20, reqLvl: 18,
    mods: [['dmgPct', 100, 140], ['lightMin', 1, 1], ['lightMax', 40, 60], ['ias', 20, 20], ['resLight', 30, 30]] },
  { id: 'u_headsman', name: '刽子手', baseId: 'greataxe', level: 24, reqLvl: 22,
    mods: [['dmgPct', 150, 200], ['crit', 25, 25], ['str', 15, 20], ['lifePerKill', 6, 10]], lore: '它从不需要第二下。' },
  { id: 'u_hollowking', name: '空王之锤', baseId: 'warhammer', level: 32, reqLvl: 30,
    mods: [['dmgPct', 160, 220], ['skillsAll', 2, 2], ['magicMin', 10, 15], ['magicMax', 30, 45], ['manaSteal', 5, 5], ['life', 40, 60]] },
  { id: 'u_ashcrown', name: '灰烬王冠', baseId: 'skullcap', level: 8, reqLvl: 7,
    mods: [['defPct', 60, 90], ['resFire', 30, 40], ['life', 20, 30], ['str', 5, 5]] },
  { id: 'u_seereye', name: '先知之眼', baseId: 'amulet', level: 16, reqLvl: 15,
    mods: [['skillsAll', 1, 1], ['mana', 30, 40], ['fcr', 10, 10], ['resLight', 25, 30], ['lightRadius', 2, 2]] },
  { id: 'u_bloodmoon', name: '血月之戒', baseId: 'ring', level: 12, reqLvl: 11,
    mods: [['lifeSteal', 5, 7], ['str', 8, 12], ['life', 15, 25], ['ar', 40, 60]] },
  { id: 'u_wanderer', name: '流浪者外衣', baseId: 'leatherarmor', level: 5, reqLvl: 5,
    mods: [['defPct', 80, 100], ['frw', 20, 20], ['fhr', 20, 20], ['resAll', 10, 10], ['dex', 5, 5]] },
  { id: 'u_ironheart', name: '铁心胸甲', baseId: 'breastplate', level: 24, reqLvl: 22,
    mods: [['defPct', 120, 160], ['dr', 10, 15], ['life', 40, 60], ['thorns', 20, 30], ['resCold', 30, 40]] },
  { id: 'u_thiefhand', name: '盗贼之手', baseId: 'leathergloves', level: 4, reqLvl: 4,
    mods: [['defPct', 40, 60], ['mf', 20, 30], ['gf', 60, 100], ['ias', 10, 10], ['dex', 4, 6]] },
  { id: 'u_windwalker', name: '风行者', baseId: 'heavyboots', level: 12, reqLvl: 10,
    mods: [['defPct', 60, 90], ['frw', 40, 40], ['dex', 8, 12], ['resCold', 20, 30]] },
  { id: 'u_giantgirdle', name: '巨人束带', baseId: 'belt', level: 18, reqLvl: 16,
    mods: [['defPct', 80, 120], ['str', 12, 18], ['life', 30, 45], ['fhr', 20, 20]] },
  { id: 'u_bulwark', name: '不屈壁垒', baseId: 'kiteshield', level: 16, reqLvl: 14,
    mods: [['defPct', 100, 140], ['block', 20, 25], ['resAll', 20, 25], ['vit', 8, 10], ['fhr', 20, 20]] },
];

export interface SetItemDef {
  id: string;
  name: string;
  baseId: string;
  reqLvl: number;
  mods: ModRange[];
}

export interface SetDef {
  id: string;
  name: string;
  level: number;
  items: SetItemDef[];
  /** bonuses keyed by number of equipped pieces */
  bonuses: Record<number, [StatKey, number][]>;
}

export const SETS: SetDef[] = [
  {
    id: 's_nightwatch',
    name: '守夜人的誓约',
    level: 6,
    items: [
      { id: 'sn_helm', name: '守夜人的面甲', baseId: 'skullcap', reqLvl: 6, mods: [['defLocal', 15, 15], ['life', 20, 20], ['lightRadius', 1, 1]] },
      { id: 'sn_armor', name: '守夜人的斗篷', baseId: 'ringmail', reqLvl: 8, mods: [['defLocal', 30, 30], ['resCold', 25, 25], ['fhr', 10, 10]] },
      { id: 'sn_shield', name: '守夜人的提灯盾', baseId: 'roundshield', reqLvl: 7, mods: [['defLocal', 20, 20], ['block', 10, 10], ['resFire', 25, 25]] },
      { id: 'sn_belt', name: '守夜人的束带', baseId: 'lightbelt', reqLvl: 6, mods: [['vit', 6, 6], ['lifeRegen', 2, 2]] },
    ],
    bonuses: {
      2: [['life', 30]],
      3: [['resAll', 15], ['ar', 75]],
      4: [['skillsAll', 1], ['dmgPctGlobal', 30], ['frw', 20]],
    },
  },
  {
    id: 's_ember',
    name: '余烬骑士',
    level: 20,
    items: [
      { id: 'se_sword', name: '余烬骑士的剑', baseId: 'broadsword', reqLvl: 20, mods: [['dmgPct', 80, 80], ['fireMin', 8, 8], ['fireMax', 20, 20]] },
      { id: 'se_helm', name: '余烬骑士的盔', baseId: 'fullhelm', reqLvl: 20, mods: [['defLocal', 30, 30], ['str', 10, 10], ['resFire', 20, 20]] },
      { id: 'se_gloves', name: '余烬骑士的护手', baseId: 'chaingloves', reqLvl: 20, mods: [['ias', 20, 20], ['lifeSteal', 4, 4]] },
      { id: 'se_boots', name: '余烬骑士的胫甲', baseId: 'chainboots', reqLvl: 20, mods: [['frw', 20, 20], ['life', 30, 30]] },
    ],
    bonuses: {
      2: [['fireMin', 10], ['fireMax', 25]],
      3: [['resAll', 20], ['life', 50]],
      4: [['skillsAll', 2], ['dmgPctGlobal', 50], ['crit', 15]],
    },
  },
];

export const SET_ITEMS: Record<string, { set: SetDef; item: SetItemDef }> = {};
for (const s of SETS) for (const it of s.items) SET_ITEMS[it.id] = { set: s, item: it };

// ─────────── runes ───────────

export interface RuneDef {
  id: string;
  name: string;
  glyph: string;
  level: number;
  weapon: [StatKey, number][];
  armor: [StatKey, number][]; // helm, body, shield
  color: string;
}

export const RUNES: RuneDef[] = [
  { id: 'r_dawn', name: '晨', glyph: 'ᚠ', level: 1, weapon: [['ar', 50], ['lightRadius', 1]], armor: [['def', 15], ['lightRadius', 1]], color: '#e8d9a0' },
  { id: 'r_ember', name: '烬', glyph: 'ᚢ', level: 3, weapon: [['fireMin', 3], ['fireMax', 9]], armor: [['resFire', 20]], color: '#ff7a30' },
  { id: 'r_frost', name: '霜', glyph: 'ᚦ', level: 5, weapon: [['coldMin', 3], ['coldMax', 6]], armor: [['resCold', 20]], color: '#8ad8ff' },
  { id: 'r_thunder', name: '雷', glyph: 'ᚨ', level: 7, weapon: [['lightMin', 1], ['lightMax', 14]], armor: [['resLight', 20]], color: '#fff27a' },
  { id: 'r_venom', name: '蚀', glyph: 'ᚱ', level: 9, weapon: [['poisonDmg', 30]], armor: [['resPoison', 25]], color: '#7cff6a' },
  { id: 'r_stone', name: '岩', glyph: 'ᚲ', level: 12, weapon: [['dmgPct', 15]], armor: [['defPct', 15]], color: '#b6aa98' },
  { id: 'r_wind', name: '风', glyph: 'ᚷ', level: 15, weapon: [['ias', 15]], armor: [['frw', 10]], color: '#c8ffe8' },
  { id: 'r_blood', name: '血', glyph: 'ᚹ', level: 18, weapon: [['lifeSteal', 5]], armor: [['life', 25]], color: '#ff3040' },
  { id: 'r_shadow', name: '影', glyph: 'ᚺ', level: 22, weapon: [['crit', 15]], armor: [['dr', 5]], color: '#9a7cff' },
  { id: 'r_star', name: '星', glyph: 'ᚾ', level: 26, weapon: [['dmgPct', 30], ['ar', 100]], armor: [['resAll', 10]], color: '#fff8d0' },
  { id: 'r_oath', name: '誓', glyph: 'ᛁ', level: 30, weapon: [['skillsAll', 1]], armor: [['mf', 25]], color: '#ffd24a' },
  { id: 'r_abyss', name: '冥', glyph: 'ᛃ', level: 36, weapon: [['pierceRes', 15], ['dmgPct', 20]], armor: [['life', 60], ['dr', 8]], color: '#c040ff' },
];

export const RUNE_BY_ID: Record<string, RuneDef> = Object.fromEntries(RUNES.map((r) => [r.id, r]));

for (const r of RUNES) {
  ITEM_BASES[r.id] = {
    id: r.id,
    name: `「${r.name}」符文`,
    type: 'rune',
    w: 1,
    h: 1,
    qlvl: r.level,
    price: 50 + r.level * 30,
    tint: r.color,
  };
}

export interface RunewordDef {
  id: string;
  name: string;
  runes: string[];
  cats: Category[];
  reqLvl: number;
  mods: ModRange[];
}

export const RUNEWORDS: RunewordDef[] = [
  { id: 'rw_emberoath', name: '余烬誓言', runes: ['r_ember', 'r_dawn'], cats: ['weapon'], reqLvl: 6,
    mods: [['dmgPct', 60, 80], ['fireMin', 8, 8], ['fireMax', 18, 18], ['ias', 20, 20], ['lifeSteal', 3, 3]] },
  { id: 'rw_longnight', name: '长夜', runes: ['r_frost', 'r_shadow', 'r_dawn'], cats: ['body'], reqLvl: 22,
    mods: [['defPct', 80, 100], ['resCold', 30, 30], ['frw', 20, 20], ['fhr', 30, 30], ['life', 40, 40]] },
  { id: 'rw_thunderwrath', name: '雷霆之怒', runes: ['r_thunder', 'r_blood', 'r_thunder'], cats: ['weapon'], reqLvl: 18,
    mods: [['dmgPct', 120, 160], ['lightMin', 5, 5], ['lightMax', 80, 80], ['ias', 30, 30], ['crit', 20, 20]] },
  { id: 'rw_ironheart', name: '钢铁之心', runes: ['r_stone', 'r_oath'], cats: ['shield', 'body'], reqLvl: 30,
    mods: [['defPct', 120, 150], ['resAll', 25, 25], ['block', 20, 20], ['skillsAll', 1, 1], ['vit', 15, 15]] },
  { id: 'rw_starlight', name: '星辉', runes: ['r_star', 'r_dawn'], cats: ['helm'], reqLvl: 26,
    mods: [['defPct', 60, 80], ['skillsAll', 1, 1], ['mf', 30, 40], ['lightRadius', 3, 3], ['mana', 40, 40]] },
  { id: 'rw_windrunner', name: '逐风', runes: ['r_wind', 'r_venom'], cats: ['weapon'], reqLvl: 16,
    mods: [['dmgPct', 80, 110], ['ias', 40, 40], ['poisonDmg', 120, 120], ['frw', 25, 25]] },
  { id: 'rw_abyssking', name: '冥王', runes: ['r_abyss', 'r_blood', 'r_oath', 'r_shadow'], cats: ['weapon'], reqLvl: 38,
    mods: [['dmgPct', 250, 320], ['skillsAll', 2, 2], ['pierceRes', 20, 25], ['lifeSteal', 8, 8], ['crit', 30, 30], ['ias', 30, 30]] },
];

export const UNIQUE_BY_ID: Record<string, UniqueDef> = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));
export const RUNEWORD_BY_ID: Record<string, RunewordDef> = Object.fromEntries(RUNEWORDS.map((r) => [r.id, r]));
