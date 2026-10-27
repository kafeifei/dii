import { D2X_CLASSES } from './d2x/classes';

export type PlayerClass = 'paladin' | 'sorceress';

export interface ClassDef {
  id: PlayerClass;
  name: string;
  /** default hero name on the title screen */
  defaultName: string;
  desc: string;
  /** a new hero's attributes: CharStats.txt's; life, mana and stamina follow from its growth (game/d2/stats.ts) */
  base: { str: number; dex: number; vit: number; ene: number };
  trees: [string, string, string];
  /** starting kit: D2 base codes */
  weapon: string;
  offhand: string | null;
  firstSkill: string;
}

/** the attributes CharStats.txt starts a class on */
function startAttrs(code: string): ClassDef['base'] {
  const cs = D2X_CLASSES[code];
  return { str: cs.str, dex: cs.dex, vit: cs.vit, ene: cs.ene };
}

export const CLASSES: Record<PlayerClass, ClassDef> = {
  paladin: {
    id: 'paladin',
    name: '圣殿骑士',
    defaultName: '无名骑士',
    desc: '剑盾在手的圣光战士，以光环庇护自身、削弱敌人。',
    base: startAttrs('pal'),
    trees: ['战斗技能', '进攻光环', '防御光环'],
    weapon: 'ssd',
    offhand: 'buc',
    firstSkill: 'sacred_strike',
  },
  sorceress: {
    id: 'sorceress',
    name: '法师',
    defaultName: '无名法师',
    desc: '驾驭火焰、闪电与冰霜的施法者，身躯脆弱，法力充沛。',
    base: startAttrs('sor'),
    trees: ['火焰法术', '闪电法术', '冰冷法术'],
    weapon: 'sst',
    offhand: null,
    firstSkill: 'fire_bolt',
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as PlayerClass[];
