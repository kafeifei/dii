import type { PlayerClass } from '../classes';
import { CLASSES } from '../classes';
import { D2X_SKILL_REFS, D2X_SKILLS } from '../d2x/skills';
import { SKILL_BY_ID } from '../skills';

/** Diablo II skills this game has, by their D2 name */
export const D2_TO_GAME: Record<string, string> = {
  'Fire Bolt': 'fire_bolt', Warmth: 'warmth', 'Fire Ball': 'fire_ball', 'Fire Wall': 'fire_wall', Meteor: 'meteor',
  'Charged Bolt': 'charged_bolt', 'Static Field': 'static_field', Nova: 'nova', Teleport: 'teleport', 'Chain Lightning': 'chain_lightning',
  'Ice Bolt': 'ice_bolt', 'Frozen Armor': 'frozen_armor', 'Frost Nova': 'frost_nova', 'Glacial Spike': 'glacial_spike', Blizzard: 'blizzard',
  Zeal: 'zeal', 'Blessed Hammer': 'blessed_hammer', Charge: 'charge', 'Fist of the Heavens': 'heavens_wrath',
  Might: 'might', 'Holy Fire': 'holy_fire', 'Holy Freeze': 'holy_freeze', Concentration: 'concentration', Conviction: 'conviction',
  Prayer: 'prayer', Salvation: 'resist_all', Vigor: 'vigor', Meditation: 'meditation', 'Holy Shield': 'holy_shield',
};

/** D2 class codes */
export const D2_CLASS: Record<string, PlayerClass | undefined> = { sor: 'sorceress', pal: 'paladin' };
const OTHER_CLASS: Record<string, string> = { ama: '亚马逊', nec: '死灵法师', bar: '野蛮人', dru: '德鲁伊', ass: '刺客', war: '术士' };

export function className(code: string): string {
  const c = D2_CLASS[code];
  return c ? CLASSES[c].name : (OTHER_CLASS[code] ?? code);
}

/** D2 skill tab numbers (0-2 Amazon, 3-5 Sorceress, 6-8 Necromancer, 9-11 Paladin, …) */
const TAB_CLASS = ['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war'];
const OTHER_TABS = [
  ['弓和弩技能', '被动和魔法技能', '标枪和长矛技能'], null,
  ['诅咒术', '毒素和白骨术', '召唤术'], null,
  ['战斗技能', '精通类技能', '呐喊技能'], ['召唤技能', '变形技能', '元素技能'], ['陷阱', '影身训练', '武学技艺'], ['术士技能', '术士技能', '术士技能'],
];
export function skillTab(param: number): { cls: string; tree: number; name: string } {
  const cls = TAB_CLASS[Math.floor(param / 3)] ?? '?';
  const tree = param % 3;
  const own = D2_CLASS[cls];
  return { cls, tree, name: own ? CLASSES[own].trees[tree] : (OTHER_TABS[Math.floor(param / 3)]?.[tree] ?? '技能') };
}

export interface SkillRef {
  /** this game's skill, when it has one */
  id?: string;
  name: string;
  /** D2 class code, null for skills of no class */
  cls: string | null;
  reqLvl: number;
}

/** an item's skill parameter (a D2 skill name, or one of this game's skill ids) → what it is */
export function skillRef(param: string): SkillRef {
  const own = SKILL_BY_ID[param];
  if (own) return { id: own.id, name: own.name, cls: own.cls === 'sorceress' ? 'sor' : 'pal', reqLvl: own.reqLevel };
  const id = D2_TO_GAME[param];
  if (id) {
    const g = SKILL_BY_ID[id];
    return { id, name: g.name, cls: g.cls === 'sorceress' ? 'sor' : 'pal', reqLvl: g.reqLevel };
  }
  // our names for every other skill an item names (src/data/d2x, never the official strings)
  const d2 = D2X_SKILLS[param] ?? D2X_SKILL_REFS[param];
  return { name: d2?.name ?? param, cls: d2?.cls ?? null, reqLvl: d2?.reqLvl ?? 1 };
}
