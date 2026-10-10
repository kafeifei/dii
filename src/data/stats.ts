/** Every numeric property that items, skills and auras can contribute. */
export type StatKey =
  | 'str'
  | 'dex'
  | 'vit'
  | 'ene'
  | 'allAttr'
  | 'life'
  | 'mana'
  | 'lifePct'
  | 'manaPct'
  | 'def' // flat defense (global)
  | 'defLocal' // flat defense on this armor piece
  | 'defPct' // enhanced defense, local to the armor piece
  | 'dmgMin' // flat min dmg (local to weapon)
  | 'dmgMax'
  | 'dmgPct' // enhanced damage, local to weapon
  | 'dmgPctGlobal' // global damage bonus (skills, auras, jewelry)
  | 'ar'
  | 'arPct'
  | 'fireMin'
  | 'fireMax'
  | 'coldMin'
  | 'coldMax'
  | 'lightMin'
  | 'lightMax'
  | 'poisonDmg' // total damage, over the sources' average length
  | 'poisonLen' // poison length in frames (25/s), summed over sources…
  | 'poisonSrc' // …and how many sources there are, to average it (as Diablo II does)
  | 'magicMin'
  | 'magicMax'
  | 'resFire'
  | 'resCold'
  | 'resLight'
  | 'resPoison'
  | 'resAll'
  | 'ias'
  | 'frw'
  | 'fcr'
  | 'fhr'
  | 'lifeSteal'
  | 'manaSteal'
  | 'lifeRegen'
  | 'manaRegen' // percent bonus
  | 'mf'
  | 'gf'
  | 'crit' // deadly strike: chance for double physical damage
  | 'thorns'
  | 'lightRadius'
  | 'block'
  | 'skillsAll'
  | 'lifePerKill'
  | 'manaPerKill'
  | 'dr' // physical damage reduced %
  | 'pierceRes' // enemy resistance reduction %
  | 'chillOnHit'
  // ── from Diablo II's item properties ──
  | 'ease' // requirements % (negative is easier)
  | 'cb' // crushing blow %
  | 'ow' // open wounds %
  | 'ignoreDef'
  | 'targetDef' // -% target defense
  | 'monDefPerHit' // -X monster defense per hit
  | 'dmgUndead'
  | 'arUndead'
  | 'dmgDemon'
  | 'arDemon'
  | 'absFire'
  | 'absCold'
  | 'absLight'
  | 'absMagic'
  | 'absFirePct'
  | 'absColdPct'
  | 'absLightPct'
  | 'maxResFire'
  | 'maxResCold'
  | 'maxResLight'
  | 'maxResPoison'
  | 'drFlat' // physical damage reduced by X
  | 'mdr' // magic damage reduced by X
  | 'dmgToMana' // % of damage taken goes to mana
  | 'extraFire' // +% fire skill damage
  | 'extraCold'
  | 'extraLight'
  | 'extraPoison'
  | 'extraMagic'
  | 'pierceFire' // -% enemy fire resistance
  | 'pierceCold'
  | 'pierceLight'
  | 'piercePoison'
  | 'fbr'
  | 'knock'
  | 'slowTarget'
  | 'freeze' // freezes target (seconds)
  | 'halfFreeze'
  | 'cantFreeze'
  | 'blind'
  | 'preventHeal'
  | 'rip'
  | 'flee' // hit causes monster to flee %
  | 'cheap' // vendor prices reduced %
  | 'defMissile'
  | 'poisonLenRes'
  | 'demonHeal'
  | 'fireSkills' // +X to fire skills (any class)
  // stored on items but with no effect in this game (no durability, stamina or ranged attacks)
  | 'indestructible'
  | 'repDur'
  | 'ethereal'
  | 'stamina'
  | 'staminaDrain'
  | 'staminaRegen'
  | 'pierceArrow'
  | 'explosiveArrow'
  | 'chargeNoConsume'
  // with a parameter on the item mod (a skill, a class, a skill tab): never in a StatBag
  | 'skill' // +X to one skill, own class only
  | 'oskill' // +X to a skill, any class
  | 'skillTab' // +X to one skill tree (param: D2 tab number)
  | 'clsSkills' // +X to a class's skills (param: D2 class code)
  | 'aura' // level X aura when equipped (param: skill)
  | 'procHit' // X% chance to cast level `lvl` (param) on striking
  | 'procStruck' // … when struck
  | 'procAttack' // … on attack
  | 'procKill' // … when you kill an enemy
  | 'procDeath' // … when you die
  | 'procLevelUp' // … when you level up
  | 'charged'; // level `lvl` skill (param) with X charges

export type StatBag = Partial<Record<StatKey, number>>;

/** stats that carry a parameter: kept on the item mods, never summed into a StatBag */
export const PARAM_STATS = new Set<StatKey>(['skill', 'oskill', 'skillTab', 'clsSkills', 'aura', 'procHit', 'procStruck', 'procAttack', 'procKill', 'procDeath', 'procLevelUp', 'charged']);

/** stats this game records but that do nothing here, shown greyed in tooltips */
export const INERT_STATS = new Set<StatKey>(['defMissile', 'indestructible', 'repDur', 'ethereal', 'stamina', 'staminaDrain', 'staminaRegen', 'pierceArrow', 'explosiveArrow', 'chargeNoConsume', 'rip']);

export function addStat(bag: StatBag, key: StatKey, v: number) {
  bag[key] = (bag[key] ?? 0) + v;
}

export function mergeInto(target: StatBag, src: StatBag) {
  for (const k in src) addStat(target, k as StatKey, src[k as StatKey]!);
}

/** Paired stats displayed as a range on one line */
const PAIRS: [StatKey, StatKey, string][] = [
  ['dmgMin', 'dmgMax', '+{0}-{1} 伤害'],
  ['fireMin', 'fireMax', '+{0}-{1} 火焰伤害'],
  ['coldMin', 'coldMax', '+{0}-{1} 冰冷伤害'],
  ['lightMin', 'lightMax', '+{0}-{1} 闪电伤害'],
  ['magicMin', 'magicMax', '+{0}-{1} 魔法伤害'],
];

const SINGLE: Partial<Record<StatKey, string>> = {
  str: '+{0} 力量',
  dex: '+{0} 敏捷',
  vit: '+{0} 体力',
  ene: '+{0} 精力',
  allAttr: '+{0} 所有属性',
  life: '+{0} 生命',
  mana: '+{0} 法力',
  lifePct: '生命上限 +{0}%',
  manaPct: '法力上限 +{0}%',
  def: '+{0} 防御',
  defLocal: '+{0} 防御',
  defPct: '+{0}% 增强防御',
  dmgMin: '+{0} 最小伤害',
  dmgMax: '+{0} 最大伤害',
  dmgPct: '+{0}% 增强伤害',
  dmgPctGlobal: '+{0}% 伤害',
  ar: '+{0} 准确率',
  arPct: '准确率 +{0}%',
  poisonDmg: '+{0} 毒素伤害（{1}秒内）',
  resFire: '火焰抗性 +{0}%',
  resCold: '冰冷抗性 +{0}%',
  resLight: '闪电抗性 +{0}%',
  resPoison: '毒素抗性 +{0}%',
  resAll: '所有抗性 +{0}',
  ias: '+{0}% 攻击速度提高',
  frw: '+{0}% 跑步速度提高',
  fcr: '+{0}% 施法速度提高',
  fhr: '+{0}% 打击恢复速度提高',
  lifeSteal: '每次击中偷取 {0}% 生命',
  manaSteal: '每次击中偷取 {0}% 法力',
  lifeRegen: '生命回复 +{0}/秒',
  manaRegen: '法力回复速度 +{0}%',
  mf: '获得魔法装备几率提高 {0}%',
  gf: '额外金币 +{0}%',
  crit: '{0}% 几率造成致命一击',
  thorns: '攻击者受到 {0} 点伤害',
  lightRadius: '+{0} 光照范围',
  block: '+{0}% 格挡几率',
  skillsAll: '+{0} 所有技能等级',
  lifePerKill: '每杀死一个敌人 +{0} 生命',
  manaPerKill: '每杀死一个敌人 +{0} 法力',
  dr: '物理伤害减少 {0}%',
  pierceRes: '敌人元素抗性 -{0}%',
  chillOnHit: '击中时冰冻目标',
  // Diablo II wording, after the official Simplified Chinese
  ease: '需求 {0}%',
  cb: '{0}% 几率粉碎打击',
  ow: '{0}% 几率造成开放性伤口',
  ignoreDef: '忽略目标的防御',
  targetDef: '-{0}% 目标防御',
  monDefPerHit: '每一击降低怪物防御 {0}',
  dmgUndead: '+{0}% 对亡灵的伤害',
  arUndead: '+{0} 对亡灵的准确率',
  dmgDemon: '+{0}% 对恶魔的伤害',
  arDemon: '+{0} 对恶魔的准确率',
  absFire: '+{0} 火焰伤害吸收',
  absCold: '+{0} 冰冷伤害吸收',
  absLight: '+{0} 闪电伤害吸收',
  absMagic: '+{0} 魔法伤害吸收',
  absFirePct: '火焰伤害吸收 +{0}%',
  absColdPct: '冰冷伤害吸收 +{0}%',
  absLightPct: '闪电伤害吸收 +{0}%',
  maxResFire: '+{0}% 火焰抗性上限',
  maxResCold: '+{0}% 冰冷抗性上限',
  maxResLight: '+{0}% 闪电抗性上限',
  maxResPoison: '+{0}% 毒素抗性上限',
  drFlat: '伤害降低 {0}',
  mdr: '魔法伤害降低 {0}',
  dmgToMana: '{0}% 受到的伤害转换为法力',
  extraFire: '+{0}% 火焰技能伤害',
  extraCold: '+{0}% 冰冷技能伤害',
  extraLight: '+{0}% 闪电技能伤害',
  extraPoison: '+{0}% 毒素技能伤害',
  extraMagic: '+{0}% 魔法技能伤害',
  pierceFire: '-{0}% 敌人的火焰抗性',
  pierceCold: '-{0}% 敌人的冰冷抗性',
  pierceLight: '-{0}% 敌人的闪电抗性',
  piercePoison: '-{0}% 敌人的毒素抗性',
  fbr: '+{0}% 更快速格挡',
  knock: '击退',
  slowTarget: '使目标减速 {0}%',
  freeze: '冻结目标 +{0} 秒',
  halfFreeze: '冻结时间减半',
  cantFreeze: '无法被冻结',
  blind: '命中可致盲目标',
  preventHeal: '防止怪物治愈',
  rip: '消灭的怪物就此安息',
  flee: '{0}% 几率命中使怪物逃跑',
  cheap: '所有商人的收费减少 {0}%',
  defMissile: '+{0} 远程防御',
  poisonLenRes: '中毒时间缩短 {0}%',
  demonHeal: '+{0} 每次消灭恶魔恢复的生命',
  fireSkills: '+{0} 火焰技能',
  indestructible: '无法破坏',
  repDur: '每 {0} 秒修复 1 点耐久度',
  ethereal: '无形（无法修复）',
  stamina: '+{0} 最大耐力',
  staminaDrain: '{0}% 降低耐力消耗',
  staminaRegen: '治愈耐力外加 {0}%',
  pierceArrow: '+{0}% 穿刺攻击',
  explosiveArrow: '射出爆炸箭或弩矢',
  chargeNoConsume: '+{0}% 几率终结技不消耗充能层数',
};

function fmt(tpl: string, ...v: number[]): string {
  return tpl.replace(/\{(\d)\}/g, (_, i) => String(Math.round(v[+i])));
}

/** how long poison from a bag of stats lasts: the average of its sources, 3 s if it doesn't say */
export function poisonSeconds(bag: StatBag): number {
  const n = bag.poisonSrc ?? 0;
  return n > 0 ? Math.round(((bag.poisonLen ?? 0) / n / 25) * 10) / 10 : 3;
}

/** Turns a stat bag into tooltip lines, in a stable order. */
export function describeStats(bag: StatBag, skip: StatKey[] = []): string[] {
  const lines: string[] = [];
  const used = new Set<StatKey>(skip);
  for (const [a, b, tpl] of PAIRS) {
    const va = bag[a];
    const vb = bag[b];
    if (va && vb && !used.has(a)) {
      lines.push(fmt(tpl, va, vb));
      used.add(a);
      used.add(b);
    }
  }
  const order: StatKey[] = [
    'skillsAll', 'fireSkills', 'ias', 'fcr', 'fhr', 'fbr', 'frw', 'dmgPct', 'dmgPctGlobal', 'dmgMin', 'dmgMax', 'ar', 'arPct', 'crit', 'cb', 'ow',
    'ignoreDef', 'targetDef', 'monDefPerHit', 'dmgUndead', 'arUndead', 'dmgDemon', 'arDemon',
    'lifeSteal', 'manaSteal', 'poisonDmg', 'chillOnHit', 'freeze', 'slowTarget', 'blind', 'flee', 'knock', 'preventHeal',
    'pierceRes', 'extraFire', 'extraCold', 'extraLight', 'extraPoison', 'extraMagic', 'pierceFire', 'pierceCold', 'pierceLight', 'piercePoison',
    'defPct', 'defLocal', 'def', 'defMissile', 'block', 'dr', 'drFlat', 'mdr',
    'str', 'dex', 'vit', 'ene', 'allAttr', 'life', 'lifePct', 'mana', 'manaPct', 'lifeRegen', 'manaRegen', 'dmgToMana',
    'resAll', 'resFire', 'resCold', 'resLight', 'resPoison', 'maxResFire', 'maxResCold', 'maxResLight', 'maxResPoison',
    'absFire', 'absFirePct', 'absCold', 'absColdPct', 'absLight', 'absLightPct', 'absMagic',
    'cantFreeze', 'halfFreeze', 'poisonLenRes', 'thorns', 'lifePerKill', 'manaPerKill', 'demonHeal', 'mf', 'gf', 'cheap', 'lightRadius', 'ease',
    'indestructible', 'repDur', 'ethereal', 'stamina', 'staminaDrain', 'staminaRegen', 'pierceArrow', 'explosiveArrow', 'chargeNoConsume', 'rip',
  ];
  // all resists equal → collapse
  if (!used.has('resAll') && bag.resFire && bag.resFire === bag.resCold && bag.resFire === bag.resLight && bag.resFire === bag.resPoison) {
    lines.push(fmt(SINGLE.resAll!, bag.resFire + (bag.resAll ?? 0)));
    used.add('resAll').add('resFire').add('resCold').add('resLight').add('resPoison');
  }
  for (const k of order) {
    if (used.has(k)) continue;
    const v = bag[k];
    if (!v) continue;
    const tpl = SINGLE[k];
    if (k === 'poisonDmg') lines.push(fmt(tpl!.replace('{1}', String(poisonSeconds(bag))), v));
    else if (tpl) lines.push(fmt(tpl, v));
  }
  return lines;
}
