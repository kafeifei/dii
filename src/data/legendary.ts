import { D2_RUNEWORDS } from './d2/runewords';
import { D2_GEMS, D2_RUNES } from './d2/socketables';
import type { D2Gem, D2Rune, D2Runeword } from './d2/types';
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

// ─────────── runes, gems and runewords: Diablo II's own (src/data/d2) ───────────

/** a rune or gem: what it gives in a weapon, in a helm or body armor, and in a shield */
export type Socketable = D2Rune | D2Gem;

export const RUNES: D2Rune[] = D2_RUNES;
export const GEMS: D2Gem[] = D2_GEMS;
export const RUNE_BY_ID: Record<string, D2Rune> = Object.fromEntries(D2_RUNES.map((r) => [r.id, r]));
export const SOCKETABLE_BY_ID: Record<string, Socketable> = Object.fromEntries([...D2_RUNES, ...D2_GEMS].map((r) => [r.id, r]));

export type RunewordDef = D2Runeword;
export const RUNEWORDS: D2Runeword[] = D2_RUNEWORDS;

export const UNIQUE_BY_ID: Record<string, UniqueDef> = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));
export const RUNEWORD_BY_ID: Record<string, RunewordDef> = Object.fromEntries(RUNEWORDS.map((r) => [r.id, r]));

/**
 * The runewords this game made up before Diablo II's (their rows are in src/game/save.ts, for old
 * saves): items made from them keep them, but none can be made any more
 */
export const OLD_RUNEWORD_IDS = ['rw_emberoath', 'rw_longnight', 'rw_thunderwrath', 'rw_ironheart', 'rw_starlight', 'rw_windrunner', 'rw_abyssking'] as const;
export type OldRunewordId = (typeof OLD_RUNEWORD_IDS)[number];

export function isOldRuneword(id: string | undefined): boolean {
  return (OLD_RUNEWORD_IDS as readonly (string | undefined)[]).includes(id);
}
