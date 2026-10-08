export type SkillKind = 'attack' | 'spell' | 'aura' | 'buff';

export interface SkillParams {
  [k: string]: number;
}

export interface SkillDef {
  id: string;
  name: string;
  tree: 0 | 1 | 2;
  row: number;
  col: number;
  reqLevel: number;
  prereqs: string[];
  kind: SkillKind;
  glyph: string;
  color: string;
  desc: string;
  synergies?: { skill: string; pct: number }[];
  mana: (lvl: number) => number;
  /** synergy is a damage multiplier bonus in percent */
  params: (lvl: number, synergy: number) => SkillParams;
  describe: (p: SkillParams) => string[];
  /** cooldown seconds (optional) */
  cooldown?: number;
}

export const TREE_NAMES = ['战斗技能', '进攻光环', '防御光环'];

const r = Math.round;

export const SKILLS: SkillDef[] = [
  // ───── Combat ─────
  {
    id: 'sacred_strike', name: '圣击', tree: 0, row: 0, col: 1, reqLevel: 1, prereqs: [], kind: 'attack', glyph: '✠', color: '#e8c060',
    desc: '一次灌注圣光的重击，必定击退敌人。',
    mana: () => 2,
    params: (l) => ({ ed: 40 + 15 * (l - 1), ar: 20 + 10 * l, knock: 1 }),
    describe: (p) => [`伤害 +${p.ed}%`, `准确率 +${p.ar}%`, '击退敌人'],
  },
  {
    id: 'zeal', name: '狂热', tree: 0, row: 1, col: 0, reqLevel: 6, prereqs: ['sacred_strike'], kind: 'attack', glyph: '⚔', color: '#ff9a50',
    desc: '快速连续攻击周围的敌人。',
    mana: () => 2,
    params: (l) => ({ hits: Math.min(5, 2 + Math.floor(l / 2)), ed: 20 + 12 * (l - 1), ar: 10 + 6 * l }),
    describe: (p) => [`攻击次数：${p.hits}`, `伤害 +${p.ed}%`, `准确率 +${p.ar}%`],
  },
  {
    id: 'blessed_hammer', name: '祝圣之锤', tree: 0, row: 2, col: 2, reqLevel: 12, prereqs: ['sacred_strike'], kind: 'spell', glyph: '⚒', color: '#a8b8ff',
    desc: '召唤一柄螺旋飞出的圣锤，造成魔法伤害。魔法伤害无视大多数抗性。',
    synergies: [{ skill: 'vigor', pct: 14 }, { skill: 'meditation', pct: 8 }],
    mana: (l) => r(5 + 0.25 * l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((12 + 8 * (l - 1)) * m), max: r((16 + 10 * (l - 1)) * m) };
    },
    describe: (p) => [`魔法伤害：${p.min}-${p.max}`],
  },
  {
    id: 'charge', name: '冲锋', tree: 0, row: 3, col: 0, reqLevel: 18, prereqs: ['zeal'], kind: 'attack', glyph: '➶', color: '#ffd080',
    desc: '冲向敌人并发动一次强力打击，将其击飞。',
    mana: () => 9,
    params: (l) => ({ ed: 100 + 25 * (l - 1), ar: 50 + 10 * l }),
    describe: (p) => [`伤害 +${p.ed}%`, `准确率 +${p.ar}%`],
  },
  {
    id: 'heavens_wrath', name: '天罚', tree: 0, row: 4, col: 1, reqLevel: 24, prereqs: ['charge', 'blessed_hammer'], kind: 'spell', glyph: '☇', color: '#fff27a',
    desc: '召唤天雷轰击目标区域，并迸发出圣光弹。',
    synergies: [{ skill: 'holy_shield', pct: 10 }, { skill: 'conviction', pct: 8 }],
    cooldown: 1,
    mana: (l) => r(20 + l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { lmin: r((40 + 20 * (l - 1)) * m), lmax: r((80 + 30 * (l - 1)) * m), bolts: Math.min(12, 6 + Math.floor(l / 3)), boltDmg: r((10 + 6 * (l - 1)) * m) };
    },
    describe: (p) => [`闪电伤害：${p.lmin}-${p.lmax}`, `圣光弹：${p.bolts} 枚，每枚 ${p.boltDmg} 魔法伤害`, '冷却时间：1 秒'],
  },
  // ───── Offensive auras ─────
  {
    id: 'might', name: '力量光环', tree: 1, row: 0, col: 0, reqLevel: 1, prereqs: [], kind: 'aura', glyph: '✊', color: '#ff6a40',
    desc: '光环：提高你的伤害。',
    mana: () => 0,
    params: (l) => ({ dmg: 40 + 10 * (l - 1), radius: 6 }),
    describe: (p) => [`伤害 +${p.dmg}%`],
  },
  {
    id: 'holy_fire', name: '圣火光环', tree: 1, row: 1, col: 1, reqLevel: 6, prereqs: ['might'], kind: 'aura', glyph: '♨', color: '#ff7a20',
    desc: '光环：周期性灼烧附近的敌人，并为攻击附加火焰伤害。',
    synergies: [{ skill: 'resist_all', pct: 15 }],
    mana: () => 0,
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((2 + 2 * (l - 1)) * m), max: r((6 + 3.5 * (l - 1)) * m), radius: 4 + l * 0.15 };
    },
    describe: (p) => [`每秒火焰伤害：${p.min}-${p.max}`, `攻击附加火焰伤害：${p.min * 4}-${p.max * 4}`, `半径：${p.radius.toFixed(1)} 码`],
  },
  {
    id: 'holy_freeze', name: '冰霜光环', tree: 1, row: 2, col: 1, reqLevel: 12, prereqs: ['holy_fire'], kind: 'aura', glyph: '❄', color: '#8ad8ff',
    desc: '光环：减缓附近敌人的速度，并为攻击附加冰冷伤害。',
    synergies: [{ skill: 'resist_all', pct: 12 }],
    mana: () => 0,
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { slow: Math.min(60, 30 + 2 * l), min: r((2 + 1.5 * (l - 1)) * m), max: r((4 + 2.5 * (l - 1)) * m), radius: 4.5 + l * 0.15 };
    },
    describe: (p) => [`敌人减速：${p.slow}%`, `每秒冰冷伤害：${p.min}-${p.max}`, `攻击附加冰冷伤害：${p.min * 3}-${p.max * 3}`],
  },
  {
    id: 'concentration', name: '专注光环', tree: 1, row: 3, col: 0, reqLevel: 18, prereqs: ['might'], kind: 'aura', glyph: '◎', color: '#ffb0f0',
    desc: '光环：大幅提高伤害，祝圣之锤同样受益。',
    mana: () => 0,
    params: (l) => ({ dmg: 60 + 15 * (l - 1), hammer: 30 + 8 * (l - 1) }),
    describe: (p) => [`伤害 +${p.dmg}%`, `祝圣之锤伤害 +${p.hammer}%`],
  },
  {
    id: 'conviction', name: '审判光环', tree: 1, row: 4, col: 2, reqLevel: 24, prereqs: ['holy_freeze'], kind: 'aura', glyph: '⚖', color: '#d0a0ff',
    desc: '光环：削弱附近敌人的防御与元素抗性。',
    mana: () => 0,
    params: (l) => ({ res: Math.min(85, 30 + 5 * (l - 1)), def: Math.min(80, 40 + 3 * (l - 1)), radius: 6 }),
    describe: (p) => [`敌人抗性 -${p.res}%`, `敌人防御 -${p.def}%`],
  },
  // ───── Defensive auras ─────
  {
    id: 'prayer', name: '祷言光环', tree: 2, row: 0, col: 0, reqLevel: 1, prereqs: [], kind: 'aura', glyph: '✚', color: '#80ff9a',
    desc: '光环：持续回复你的生命。',
    mana: () => 0,
    params: (l) => ({ heal: r((2 + 1.5 * (l - 1)) * 10) / 10 }),
    describe: (p) => [`每秒回复生命：${p.heal}`],
  },
  {
    id: 'resist_all', name: '抵抗光环', tree: 2, row: 1, col: 1, reqLevel: 6, prereqs: ['prayer'], kind: 'aura', glyph: '⛨', color: '#ffe080',
    desc: '光环：提高所有元素抗性。',
    mana: () => 0,
    params: (l) => ({ res: Math.min(150, 35 + 6 * (l - 1)) }),
    describe: (p) => [`所有抗性 +${p.res}%`],
  },
  {
    id: 'vigor', name: '活力光环', tree: 2, row: 2, col: 2, reqLevel: 12, prereqs: [], kind: 'aura', glyph: '➹', color: '#a0ffd0',
    desc: '光环：提高移动速度和生命回复。',
    mana: () => 0,
    params: (l) => ({ frw: Math.min(60, 15 + 3 * (l - 1)), regen: l }),
    describe: (p) => [`跑步速度 +${p.frw}%`, `每秒回复生命：${p.regen}`],
  },
  {
    id: 'meditation', name: '冥想光环', tree: 2, row: 3, col: 0, reqLevel: 18, prereqs: ['prayer'], kind: 'aura', glyph: '☯', color: '#80b0ff',
    desc: '光环：大幅加快法力回复。',
    mana: () => 0,
    params: (l) => ({ regen: 65 + 20 * (l - 1) }),
    describe: (p) => [`法力回复 +${p.regen}%`],
  },
  {
    id: 'holy_shield', name: '神圣之盾', tree: 2, row: 4, col: 1, reqLevel: 24, prereqs: ['resist_all'], kind: 'buff', glyph: '⛉', color: '#ffffff',
    desc: '用圣光强化你的护甲与盾牌（持续一段时间）。',
    mana: () => 35,
    params: (l) => ({ dur: 60 + 15 * l, def: 50 + 15 * (l - 1), block: Math.min(40, 15 + l), dr: Math.min(25, 5 + l) }),
    describe: (p) => [`持续时间：${p.dur} 秒`, `防御 +${p.def}%`, `格挡几率 +${p.block}%`, `物理伤害减少 ${p.dr}%`],
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** the plain weapon attack, always available */
export const BASIC_ATTACK = 'attack';
