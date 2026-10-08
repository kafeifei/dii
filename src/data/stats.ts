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
  | 'poisonDmg' // total over 3 seconds
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
  | 'chillOnHit';

export type StatBag = Partial<Record<StatKey, number>>;

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
  poisonDmg: '+{0} 毒素伤害（3秒内）',
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
};

function fmt(tpl: string, ...v: number[]): string {
  return tpl.replace(/\{(\d)\}/g, (_, i) => String(Math.round(v[+i])));
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
    'skillsAll', 'dmgPct', 'dmgPctGlobal', 'dmgMin', 'dmgMax', 'ar', 'arPct', 'ias', 'crit',
    'lifeSteal', 'manaSteal', 'poisonDmg', 'chillOnHit', 'pierceRes', 'fcr', 'fhr', 'frw', 'defPct', 'defLocal', 'def',
    'block', 'dr', 'str', 'dex', 'vit', 'ene', 'allAttr', 'life', 'lifePct', 'mana', 'manaPct', 'lifeRegen', 'manaRegen',
    'resAll', 'resFire', 'resCold', 'resLight', 'resPoison', 'thorns', 'lifePerKill', 'manaPerKill', 'mf', 'gf', 'lightRadius',
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
    if (tpl) lines.push(fmt(tpl, v));
  }
  return lines;
}
