/** the body a monster is drawn with (src/render/specs.ts); the later ones are named for D2's MonStats ids */
export type MonsterModel =
  | 'zombie' | 'skeleton' | 'skelarcher' | 'imp' | 'shaman' | 'ghoul' | 'wraith' | 'spider' | 'demon' | 'butcher' | 'lich' | 'overlord'
  | 'skullfly' | 'skelmage' | 'bat' | 'mushroom' | 'yeti' | 'dragon'
  | 'corruptrogue' | 'cr_lancer' | 'cr_archer' | 'quillrat';
export type Blood = 'red' | 'bone' | 'green' | 'ghost' | 'black' | 'fire';
export type Elem = 'phys' | 'fire' | 'cold' | 'light' | 'poison' | 'magic';
export type ProjectileKind = 'arrow' | 'firebolt' | 'iceshard' | 'poisonspit' | 'lightning' | 'fireball';

export interface MonsterDef {
  id: string;
  name: string;
  model: MonsterModel;
  life: number;
  dmg: [number, number];
  def: number;
  ar: number;
  speed: number;
  attackSpeed: number;
  range: number;
  radius: number;
  scale: number;
  xp: number;
  ai: 'melee' | 'ranged' | 'shaman' | 'boss';
  projectile?: ProjectileKind;
  projectileElem?: Elem;
  meleeElem?: Elem;
  res?: Partial<Record<'fire' | 'cold' | 'light' | 'poison' | 'phys', number>>;
  blood: Blood;
  minDepth: number;
  maxDepth: number;
  weight: number;
  pack: [number, number];
  undead?: boolean;
  /** Diablo II's demon flag: what "+X% damage to demons" counts */
  demon?: boolean;
  flee?: boolean;
  /** companion monsters spawned with the pack */
  escort?: { id: string; count: [number, number] };
  boss?: boolean;
  color: string;
  color2: string;
}

export const MONSTERS: Record<string, MonsterDef> = {
  zombie: {
    id: 'zombie', name: '腐尸', model: 'zombie', life: 13, dmg: [2, 5], def: 4, ar: 20, speed: 1.5, attackSpeed: 0.8, range: 1.1,
    radius: 0.42, scale: 1.0, xp: 12, ai: 'melee', blood: 'red', minDepth: 1, maxDepth: 7, weight: 10, pack: [3, 6], undead: true,
    res: { poison: 30 }, color: '#5d6b4a', color2: '#3a3326',
  },
  skeleton: {
    id: 'skeleton', name: '骷髅战士', model: 'skeleton', life: 10, dmg: [1, 5], def: 8, ar: 30, speed: 2.6, attackSpeed: 1.15, range: 1.15,
    radius: 0.38, scale: 1.0, xp: 13, ai: 'melee', blood: 'bone', minDepth: 1, maxDepth: 12, weight: 10, pack: [3, 6], undead: true,
    res: { poison: 50, cold: 20 }, color: '#d8d0bc', color2: '#6a5a40',
  },
  skelarcher: {
    id: 'skelarcher', name: '骷髅弓手', model: 'skelarcher', life: 8, dmg: [1, 4], def: 5, ar: 35, speed: 2.4, attackSpeed: 0.75, range: 8,
    radius: 0.38, scale: 1.0, xp: 15, ai: 'ranged', projectile: 'arrow', projectileElem: 'phys', blood: 'bone', minDepth: 3, maxDepth: 14,
    weight: 6, pack: [2, 4], undead: true, res: { poison: 50 }, color: '#cfc6b0', color2: '#4a3a28',
  },
  imp: {
    id: 'imp', demon: true, name: '堕落小鬼', model: 'imp', life: 6, dmg: [1, 3], def: 3, ar: 22, speed: 3.1, attackSpeed: 1.0, range: 1.0,
    radius: 0.33, scale: 0.72, xp: 8, ai: 'melee', blood: 'red', minDepth: 1, maxDepth: 9, weight: 9, pack: [3, 6], flee: true,
    escort: { id: 'shaman', count: [0, 1] }, color: '#a83a24', color2: '#3a1a10',
  },
  shaman: {
    id: 'shaman', demon: true, name: '小鬼萨满', model: 'shaman', life: 11, dmg: [2, 6], def: 4, ar: 25, speed: 2.6, attackSpeed: 0.6, range: 7,
    radius: 0.34, scale: 0.8, xp: 26, ai: 'shaman', projectile: 'firebolt', projectileElem: 'fire', blood: 'red', minDepth: 3, maxDepth: 10,
    weight: 0, pack: [1, 1], res: { fire: 50 }, color: '#8a2a5a', color2: '#d8b040',
  },
  ghoul: {
    id: 'ghoul', name: '食尸鬼', model: 'ghoul', life: 16, dmg: [3, 6], def: 8, ar: 35, speed: 3.0, attackSpeed: 1.1, range: 1.2,
    radius: 0.45, scale: 1.1, xp: 16, ai: 'melee', blood: 'green', minDepth: 5, maxDepth: 15, weight: 9, pack: [3, 5], undead: true,
    res: { poison: 40, cold: 20 }, color: '#5a7a68', color2: '#2a3a30',
  },
  spider: {
    id: 'spider', name: '剧毒巨蛛', model: 'spider', life: 13, dmg: [2, 4], def: 8, ar: 40, speed: 3.6, attackSpeed: 1.4, range: 1.2,
    radius: 0.5, scale: 1.0, xp: 15, ai: 'melee', meleeElem: 'poison', blood: 'green', minDepth: 5, maxDepth: 16, weight: 7, pack: [3, 6],
    res: { poison: 75 }, color: '#2a2a22', color2: '#8a1a1a',
  },
  wraith: {
    id: 'wraith', name: '冰魂', model: 'wraith', life: 14, dmg: [2, 5], def: 10, ar: 40, speed: 2.8, attackSpeed: 0.7, range: 7.5,
    radius: 0.4, scale: 1.05, xp: 18, ai: 'ranged', projectile: 'iceshard', projectileElem: 'cold', blood: 'ghost', minDepth: 9, maxDepth: 20,
    weight: 8, pack: [2, 4], undead: true, res: { cold: 75, phys: 30, poison: 100 }, color: '#9ad0ff', color2: '#2a4060',
  },
  demon: {
    id: 'demon', demon: true, name: '炎魔', model: 'demon', life: 24, dmg: [4, 8], def: 14, ar: 50, speed: 2.4, attackSpeed: 0.9, range: 1.5,
    radius: 0.6, scale: 1.35, xp: 28, ai: 'melee', meleeElem: 'fire', blood: 'fire', minDepth: 12, maxDepth: 99, weight: 8, pack: [2, 4],
    res: { fire: 75, light: 30 }, color: '#7a2214', color2: '#ff6a20',
  },
  hellimp: {
    id: 'hellimp', demon: true, name: '炼狱小鬼', model: 'imp', life: 8, dmg: [2, 4], def: 8, ar: 40, speed: 3.6, attackSpeed: 1.4, range: 1.0,
    radius: 0.33, scale: 0.78, xp: 10, ai: 'melee', meleeElem: 'fire', blood: 'fire', minDepth: 13, maxDepth: 99, weight: 8, pack: [4, 7],
    flee: true, res: { fire: 60 }, color: '#d8501a', color2: '#2a0a04',
  },
  // ── bosses ──
  skullfly: {
    id: 'skullfly', name: '飞颅', model: 'skullfly', life: 6, dmg: [1, 4], def: 6, ar: 30, speed: 3.6, attackSpeed: 1.3, range: 1.0,
    radius: 0.32, scale: 0.8, xp: 11, ai: 'melee', blood: 'bone', minDepth: 2, maxDepth: 11, weight: 5, pack: [3, 5], undead: true,
    res: { poison: 100, cold: 30 }, color: '#d8d0bc', color2: '#3a2a4a',
  },
  skelmage: {
    id: 'skelmage', name: '骷髅法师', model: 'skelmage', life: 9, dmg: [2, 5], def: 5, ar: 30, speed: 2.3, attackSpeed: 0.6, range: 7.5,
    radius: 0.36, scale: 1.0, xp: 17, ai: 'ranged', projectile: 'iceshard', projectileElem: 'cold', blood: 'bone', minDepth: 3, maxDepth: 12,
    weight: 5, pack: [2, 3], undead: true, res: { poison: 50, cold: 50 }, color: '#c8c0b0', color2: '#3a4a6a',
  },
  bat: {
    id: 'bat', name: '洞穴巨蝠', model: 'bat', life: 9, dmg: [2, 3], def: 9, ar: 38, speed: 4.0, attackSpeed: 1.4, range: 1.1,
    radius: 0.38, scale: 0.9, xp: 13, ai: 'melee', blood: 'red', minDepth: 5, maxDepth: 10, weight: 7, pack: [3, 6],
    color: '#6a7a30', color2: '#3a1a2a',
  },
  mushroom: {
    id: 'mushroom', name: '孢子魔', model: 'mushroom', life: 18, dmg: [3, 6], def: 10, ar: 38, speed: 1.9, attackSpeed: 0.7, range: 6.5,
    radius: 0.45, scale: 1.0, xp: 22, ai: 'ranged', projectile: 'poisonspit', projectileElem: 'poison', blood: 'green', minDepth: 5, maxDepth: 11,
    weight: 5, pack: [2, 4], res: { poison: 75 }, color: '#3a6aa0', color2: '#c8b090',
  },
  yeti: {
    id: 'yeti', name: '霜原雪人', model: 'yeti', life: 28, dmg: [4, 8], def: 14, ar: 48, speed: 2.2, attackSpeed: 0.8, range: 1.4,
    radius: 0.6, scale: 1.4, xp: 32, ai: 'melee', meleeElem: 'cold', blood: 'red', minDepth: 9, maxDepth: 14, weight: 7, pack: [2, 3],
    res: { cold: 75 }, color: '#c8d8e8', color2: '#4a7a9a',
  },
  dragon: {
    id: 'dragon', demon: true, name: '炼狱幼龙', model: 'dragon', life: 22, dmg: [4, 8], def: 15, ar: 52, speed: 2.8, attackSpeed: 0.8, range: 7,
    radius: 0.55, scale: 1.3, xp: 30, ai: 'ranged', projectile: 'firebolt', projectileElem: 'fire', blood: 'fire', minDepth: 13, maxDepth: 99,
    weight: 6, pack: [2, 3], res: { fire: 75 }, color: '#8a4a20', color2: '#ff8030',
  },
  butcher: {
    id: 'butcher', name: '血屠夫', model: 'butcher', life: 60, dmg: [5, 11], def: 20, ar: 90, speed: 2.9, attackSpeed: 1.0, range: 1.7,
    radius: 0.75, scale: 1.6, xp: 400, ai: 'boss', blood: 'red', minDepth: 99, maxDepth: 99, weight: 0, pack: [1, 1], boss: true,
    res: { fire: 25, cold: 25, light: 25, poison: 25 }, color: '#7a5a4a', color2: '#5a0a0a',
  },
  lich: {
    id: 'lich', name: '霜冠巫妖', model: 'lich', life: 50, dmg: [6, 12], def: 30, ar: 100, speed: 2.4, attackSpeed: 0.8, range: 8,
    radius: 0.6, scale: 1.4, xp: 600, ai: 'boss', projectile: 'iceshard', projectileElem: 'cold', blood: 'ghost', minDepth: 99, maxDepth: 99,
    weight: 0, pack: [1, 1], boss: true, undead: true, res: { cold: 75, fire: 20, light: 40, poison: 100 }, color: '#6a8aaa', color2: '#c0e8ff',
  },
  overlord: {
    id: 'overlord', demon: true, name: '深渊领主', model: 'overlord', life: 56, dmg: [6, 13], def: 30, ar: 110, speed: 2.7, attackSpeed: 0.9, range: 2.0,
    radius: 0.85, scale: 1.9, xp: 900, ai: 'boss', projectile: 'fireball', projectileElem: 'fire', blood: 'fire', minDepth: 99, maxDepth: 99,
    weight: 0, pack: [1, 1], boss: true, res: { fire: 75, cold: 30, light: 30, poison: 40 }, color: '#4a1410', color2: '#ff8030',
  },
};

export function bossForDepth(depth: number): MonsterDef {
  const cycle = Math.floor(depth / 4) % 3;
  return [MONSTERS.butcher, MONSTERS.lich, MONSTERS.overlord][cycle === 0 ? 2 : cycle - 1];
}

export type MonsterMod = 'strong' | 'fast' | 'magicres' | 'stoneskin' | 'fireench' | 'coldench' | 'lightench' | 'manaburn' | 'vampiric';

export const MOD_NAMES: Record<MonsterMod, string> = {
  strong: '特别强壮',
  fast: '特别快速',
  magicres: '抗魔',
  stoneskin: '石肤',
  fireench: '火焰强化',
  coldench: '冰冷强化',
  lightench: '闪电强化',
  manaburn: '法力燃烧',
  vampiric: '吸血',
};

export const ALL_MODS = Object.keys(MOD_NAMES) as MonsterMod[];

export const UNIQUE_FIRST = ['骨碎', '血牙', '腐心', '暗噬', '灰爪', '冷眼', '裂魂', '黑舌', '铁颚', '毒囊', '火喉', '寒骨', '影棘', '尸鸦'];
export const UNIQUE_SECOND = ['掠夺者', '屠戮者', '低语者', '贪食者', '剥皮者', '守墓人', '吞噬者', '哀嚎者', '碎颅者', '收尸人'];

/** floors 1-2 ease in; afterwards monsters gain two levels per floor */
export function monsterLevel(depth: number): number {
  return depth <= 2 ? Math.max(1, depth) : depth * 2 - 2;
}
