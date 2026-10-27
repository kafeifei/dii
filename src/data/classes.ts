export type PlayerClass = 'paladin' | 'sorceress';

export interface ClassDef {
  id: PlayerClass;
  name: string;
  /** default hero name on the title screen */
  defaultName: string;
  desc: string;
  base: { str: number; dex: number; vit: number; ene: number };
  /** life = life0 + lifePerLvl·(L−1) + 2·vit, mana = mana0 + manaPerLvl·(L−1) + 2·ene */
  life0: number;
  lifePerLvl: number;
  mana0: number;
  manaPerLvl: number;
  trees: [string, string, string];
  /** starting kit: D2 base codes */
  weapon: string;
  offhand: string | null;
  firstSkill: string;
}

export const CLASSES: Record<PlayerClass, ClassDef> = {
  paladin: {
    id: 'paladin',
    name: '圣殿骑士',
    defaultName: '无名骑士',
    desc: '剑盾在手的圣光战士，以光环庇护自身、削弱敌人。',
    base: { str: 25, dex: 20, vit: 25, ene: 15 },
    life0: 30,
    lifePerLvl: 3,
    mana0: 10,
    manaPerLvl: 1.5,
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
    // Diablo II sorceress
    base: { str: 10, dex: 25, vit: 10, ene: 35 },
    life0: 40,
    lifePerLvl: 2,
    mana0: 10,
    manaPerLvl: 2,
    trees: ['火焰法术', '闪电法术', '冰冷法术'],
    weapon: 'sst',
    offhand: null,
    firstSkill: 'fire_bolt',
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as PlayerClass[];
