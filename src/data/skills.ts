import type { PlayerClass } from './classes';

/** passives are learned but never cast: their effect is folded into the player's stats */
export type SkillKind = 'attack' | 'spell' | 'aura' | 'buff' | 'passive';

export interface SkillParams {
  [k: string]: number;
}

export interface SkillDef {
  id: string;
  cls: PlayerClass;
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

const r = Math.round;

export const SKILLS: SkillDef[] = [
  // ───── Combat ─────
  {
    id: 'sacred_strike', cls: 'paladin', name: '圣击', tree: 0, row: 0, col: 1, reqLevel: 1, prereqs: [], kind: 'attack', glyph: '✠', color: '#e8c060',
    desc: '一次灌注圣光的重击，必定击退敌人。',
    mana: () => 2,
    params: (l) => ({ ed: 40 + 15 * (l - 1), ar: 20 + 10 * l, knock: 1 }),
    describe: (p) => [`伤害 +${p.ed}%`, `准确率 +${p.ar}%`, '击退敌人'],
  },
  {
    id: 'zeal', cls: 'paladin', name: '狂热', tree: 0, row: 1, col: 0, reqLevel: 6, prereqs: ['sacred_strike'], kind: 'attack', glyph: '⚔', color: '#ff9a50',
    desc: '快速连续攻击周围的敌人。',
    mana: () => 2,
    params: (l) => ({ hits: Math.min(5, 2 + Math.floor(l / 2)), ed: 20 + 12 * (l - 1), ar: 10 + 6 * l }),
    describe: (p) => [`攻击次数：${p.hits}`, `伤害 +${p.ed}%`, `准确率 +${p.ar}%`],
  },
  {
    id: 'blessed_hammer', cls: 'paladin', name: '祝圣之锤', tree: 0, row: 2, col: 2, reqLevel: 12, prereqs: ['sacred_strike'], kind: 'spell', glyph: '⚒', color: '#a8b8ff',
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
    id: 'charge', cls: 'paladin', name: '冲锋', tree: 0, row: 3, col: 0, reqLevel: 18, prereqs: ['zeal'], kind: 'attack', glyph: '➶', color: '#ffd080',
    desc: '冲向敌人并发动一次强力打击，将其击飞。',
    mana: () => 9,
    params: (l) => ({ ed: 100 + 25 * (l - 1), ar: 50 + 10 * l }),
    describe: (p) => [`伤害 +${p.ed}%`, `准确率 +${p.ar}%`],
  },
  {
    id: 'heavens_wrath', cls: 'paladin', name: '天罚', tree: 0, row: 4, col: 1, reqLevel: 24, prereqs: ['charge', 'blessed_hammer'], kind: 'spell', glyph: '☇', color: '#fff27a',
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
    id: 'might', cls: 'paladin', name: '力量光环', tree: 1, row: 0, col: 0, reqLevel: 1, prereqs: [], kind: 'aura', glyph: '✊', color: '#ff6a40',
    desc: '光环：提高你的伤害。',
    mana: () => 0,
    params: (l) => ({ dmg: 40 + 10 * (l - 1), radius: 6 }),
    describe: (p) => [`伤害 +${p.dmg}%`],
  },
  {
    id: 'holy_fire', cls: 'paladin', name: '圣火光环', tree: 1, row: 1, col: 1, reqLevel: 6, prereqs: ['might'], kind: 'aura', glyph: '♨', color: '#ff7a20',
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
    id: 'holy_freeze', cls: 'paladin', name: '冰霜光环', tree: 1, row: 2, col: 1, reqLevel: 12, prereqs: ['holy_fire'], kind: 'aura', glyph: '❄', color: '#8ad8ff',
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
    id: 'concentration', cls: 'paladin', name: '专注光环', tree: 1, row: 3, col: 0, reqLevel: 18, prereqs: ['might'], kind: 'aura', glyph: '◎', color: '#ffb0f0',
    desc: '光环：大幅提高伤害，祝圣之锤同样受益。',
    mana: () => 0,
    params: (l) => ({ dmg: 60 + 15 * (l - 1), hammer: 30 + 8 * (l - 1) }),
    describe: (p) => [`伤害 +${p.dmg}%`, `祝圣之锤伤害 +${p.hammer}%`],
  },
  {
    id: 'conviction', cls: 'paladin', name: '审判光环', tree: 1, row: 4, col: 2, reqLevel: 24, prereqs: ['holy_freeze'], kind: 'aura', glyph: '⚖', color: '#d0a0ff',
    desc: '光环：削弱附近敌人的防御与元素抗性。',
    mana: () => 0,
    params: (l) => ({ res: Math.min(85, 30 + 5 * (l - 1)), def: Math.min(80, 40 + 3 * (l - 1)), radius: 6 }),
    describe: (p) => [`敌人抗性 -${p.res}%`, `敌人防御 -${p.def}%`],
  },
  // ───── Defensive auras ─────
  {
    id: 'prayer', cls: 'paladin', name: '祷言光环', tree: 2, row: 0, col: 0, reqLevel: 1, prereqs: [], kind: 'aura', glyph: '✚', color: '#80ff9a',
    desc: '光环：持续回复你的生命。',
    mana: () => 0,
    params: (l) => ({ heal: r((2 + 1.5 * (l - 1)) * 10) / 10 }),
    describe: (p) => [`每秒回复生命：${p.heal}`],
  },
  {
    id: 'resist_all', cls: 'paladin', name: '抵抗光环', tree: 2, row: 1, col: 1, reqLevel: 6, prereqs: ['prayer'], kind: 'aura', glyph: '⛨', color: '#ffe080',
    desc: '光环：提高所有元素抗性。',
    mana: () => 0,
    params: (l) => ({ res: Math.min(150, 35 + 6 * (l - 1)) }),
    describe: (p) => [`所有抗性 +${p.res}%`],
  },
  {
    id: 'vigor', cls: 'paladin', name: '活力光环', tree: 2, row: 2, col: 2, reqLevel: 12, prereqs: [], kind: 'aura', glyph: '➹', color: '#a0ffd0',
    desc: '光环：提高移动速度和生命回复。',
    mana: () => 0,
    params: (l) => ({ frw: Math.min(60, 15 + 3 * (l - 1)), regen: l }),
    describe: (p) => [`跑步速度 +${p.frw}%`, `每秒回复生命：${p.regen}`],
  },
  {
    id: 'meditation', cls: 'paladin', name: '冥想光环', tree: 2, row: 3, col: 0, reqLevel: 18, prereqs: ['prayer'], kind: 'aura', glyph: '☯', color: '#80b0ff',
    desc: '光环：大幅加快法力回复。',
    mana: () => 0,
    params: (l) => ({ regen: 65 + 20 * (l - 1) }),
    describe: (p) => [`法力回复 +${p.regen}%`],
  },
  {
    id: 'holy_shield', cls: 'paladin', name: '神圣之盾', tree: 2, row: 4, col: 1, reqLevel: 24, prereqs: ['resist_all'], kind: 'buff', glyph: '⛉', color: '#ffffff',
    desc: '用圣光强化你的护甲与盾牌（持续一段时间）。',
    mana: () => 35,
    params: (l) => ({ dur: 60 + 15 * l, def: 50 + 15 * (l - 1), block: Math.min(40, 15 + l), dr: Math.min(25, 5 + l) }),
    describe: (p) => [`持续时间：${p.dur} 秒`, `防御 +${p.def}%`, `格挡几率 +${p.block}%`, `物理伤害减少 ${p.dr}%`],
  },
  // ═════════════ Sorceress ═════════════
  // ───── Fire ─────
  {
    id: 'fire_bolt', cls: 'sorceress', name: '火焰弹', tree: 0, row: 0, col: 1, reqLevel: 1, prereqs: [], kind: 'spell', glyph: '✹', color: '#ff7a30',
    desc: '射出一枚火焰弹。',
    synergies: [{ skill: 'fire_ball', pct: 10 }, { skill: 'meteor', pct: 10 }],
    mana: () => 3,
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((4 + 3 * (l - 1)) * m), max: r((8 + 4 * (l - 1)) * m) };
    },
    describe: (p) => [`火焰伤害：${p.min}-${p.max}`],
  },
  {
    id: 'warmth', cls: 'sorceress', name: '温暖', tree: 0, row: 1, col: 2, reqLevel: 6, prereqs: [], kind: 'passive', glyph: '☀', color: '#ffb040',
    desc: '被动：加快法力回复。',
    mana: () => 0,
    params: (l) => ({ regen: 30 + 12 * (l - 1) }),
    describe: (p) => [`法力回复 +${p.regen}%`],
  },
  {
    id: 'fire_ball', cls: 'sorceress', name: '火球', tree: 0, row: 2, col: 0, reqLevel: 12, prereqs: ['fire_bolt'], kind: 'spell', glyph: '✺', color: '#ff5010',
    desc: '射出一颗火球，命中后爆炸，波及周围的敌人。',
    synergies: [{ skill: 'fire_bolt', pct: 12 }, { skill: 'meteor', pct: 12 }],
    mana: (l) => r(6 + 0.5 * l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((18 + 9 * (l - 1)) * m), max: r((28 + 12 * (l - 1)) * m), radius: 1.4 + 0.03 * l };
    },
    describe: (p) => [`火焰伤害：${p.min}-${p.max}`, `爆炸半径：${p.radius.toFixed(1)} 码`],
  },
  {
    id: 'fire_wall', cls: 'sorceress', name: '火墙', tree: 0, row: 3, col: 1, reqLevel: 18, prereqs: ['fire_ball'], kind: 'spell', glyph: '▥', color: '#ff4a10',
    desc: '在目标处竖起一道火墙，持续灼烧穿过它的敌人。',
    synergies: [{ skill: 'fire_bolt', pct: 6 }, { skill: 'fire_ball', pct: 6 }],
    cooldown: 0.8,
    mana: (l) => r(18 + 0.5 * l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { dps: r((24 + 12 * (l - 1)) * m), dur: 3.6, len: Math.min(7, 4 + 0.15 * l) };
    },
    describe: (p) => [`每秒火焰伤害：${p.dps}`, `持续时间：${p.dur} 秒`, `长度：${p.len.toFixed(1)} 码`],
  },
  {
    id: 'meteor', cls: 'sorceress', name: '陨石', tree: 0, row: 4, col: 1, reqLevel: 24, prereqs: ['fire_wall'], kind: 'spell', glyph: '☄', color: '#ff3a00',
    desc: '召唤一颗陨石砸向目标区域。',
    synergies: [{ skill: 'fire_bolt', pct: 10 }, { skill: 'fire_ball', pct: 10 }, { skill: 'fire_wall', pct: 10 }],
    cooldown: 1,
    mana: (l) => r(17 + l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((80 + 25 * (l - 1)) * m), max: r((110 + 32 * (l - 1)) * m), radius: 2.2 };
    },
    describe: (p) => [`火焰伤害：${p.min}-${p.max}`, `半径：${p.radius} 码`, '冷却时间：1 秒'],
  },
  // ───── Lightning ─────
  {
    id: 'charged_bolt', cls: 'sorceress', name: '电荷弹', tree: 1, row: 0, col: 1, reqLevel: 1, prereqs: [], kind: 'spell', glyph: '✧', color: '#a0b8ff',
    desc: '放出数枚游走不定的电荷弹。',
    synergies: [{ skill: 'nova', pct: 6 }],
    mana: (l) => r(3 + 0.25 * l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { bolts: Math.min(12, 3 + Math.floor(l / 2)), min: r((2 + (l - 1)) * m), max: r((7 + 2 * (l - 1)) * m) };
    },
    describe: (p) => [`电荷弹数量：${p.bolts}`, `每枚闪电伤害：${p.min}-${p.max}`],
  },
  {
    id: 'static_field', cls: 'sorceress', name: '静电力场', tree: 1, row: 1, col: 0, reqLevel: 6, prereqs: ['charged_bolt'], kind: 'spell', glyph: '◉', color: '#c0d0ff',
    desc: '削减周围所有敌人当前生命的四分之一（首领减半）。',
    mana: () => 9,
    params: (l) => ({ pct: 25, radius: Math.min(9, 3.4 + 0.4 * l) }),
    describe: (p) => [`敌人当前生命 -${p.pct}%`, `半径：${p.radius.toFixed(1)} 码`],
  },
  {
    id: 'nova', cls: 'sorceress', name: '新星', tree: 1, row: 2, col: 2, reqLevel: 12, prereqs: ['charged_bolt'], kind: 'spell', glyph: '✴', color: '#d0d8ff',
    desc: '以自身为中心迸发一圈闪电。',
    synergies: [{ skill: 'charged_bolt', pct: 8 }],
    mana: (l) => r(15 + l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((8 + 6 * (l - 1)) * m), max: r((26 + 10 * (l - 1)) * m), radius: 4.5 };
    },
    describe: (p) => [`闪电伤害：${p.min}-${p.max}`, `半径：${p.radius} 码`],
  },
  {
    id: 'teleport', cls: 'sorceress', name: '传送', tree: 1, row: 3, col: 0, reqLevel: 18, prereqs: ['static_field'], kind: 'spell', glyph: '⇝', color: '#b0a0ff',
    desc: '瞬间移动到目标位置。',
    mana: (l) => Math.max(10, 24 - l),
    params: (l) => ({ range: Math.min(18, 10 + l) }),
    describe: (p) => [`距离：${p.range} 码`],
  },
  {
    id: 'chain_lightning', cls: 'sorceress', name: '连锁闪电', tree: 1, row: 4, col: 1, reqLevel: 24, prereqs: ['nova'], kind: 'spell', glyph: 'ϟ', color: '#e8eeff',
    desc: '一道闪电在敌人之间跳跃。',
    synergies: [{ skill: 'charged_bolt', pct: 8 }, { skill: 'nova', pct: 8 }],
    mana: (l) => r(12 + l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((30 + 12 * (l - 1)) * m), max: r((90 + 20 * (l - 1)) * m), jumps: Math.min(10, 3 + Math.floor(l / 2)), range: 5 };
    },
    describe: (p) => [`闪电伤害：${p.min}-${p.max}`, `跳跃次数：${p.jumps}`],
  },
  // ───── Cold ─────
  {
    id: 'ice_bolt', cls: 'sorceress', name: '冰弹', tree: 2, row: 0, col: 0, reqLevel: 1, prereqs: [], kind: 'spell', glyph: '❅', color: '#90d8ff',
    desc: '射出一枚冰弹，冻缓敌人。',
    synergies: [{ skill: 'frost_nova', pct: 10 }, { skill: 'glacial_spike', pct: 10 }, { skill: 'blizzard', pct: 10 }],
    mana: () => 3,
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((4 + 2.5 * (l - 1)) * m), max: r((7 + 3.5 * (l - 1)) * m), chill: 2 + 0.3 * l };
    },
    describe: (p) => [`冰冷伤害：${p.min}-${p.max}`, `冻缓时间：${p.chill.toFixed(1)} 秒`],
  },
  {
    id: 'frozen_armor', cls: 'sorceress', name: '冰封装甲', tree: 2, row: 0, col: 2, reqLevel: 1, prereqs: [], kind: 'buff', glyph: '⛊', color: '#c0ecff',
    desc: '用寒冰包裹身体，提高防御（持续一段时间）。',
    mana: () => 7,
    params: (l) => ({ dur: 120 + 12 * l, def: 35 + 6 * (l - 1) }),
    describe: (p) => [`持续时间：${p.dur} 秒`, `防御 +${p.def}%`],
  },
  {
    id: 'frost_nova', cls: 'sorceress', name: '冰霜新星', tree: 2, row: 1, col: 1, reqLevel: 6, prereqs: ['frozen_armor'], kind: 'spell', glyph: '❆', color: '#a0e4ff',
    desc: '以自身为中心爆发一圈寒冰，冻缓周围所有敌人。',
    synergies: [{ skill: 'ice_bolt', pct: 6 }],
    mana: (l) => r(9 + 0.5 * l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((6 + 4 * (l - 1)) * m), max: r((10 + 6 * (l - 1)) * m), radius: 4, chill: 3 + 0.2 * l };
    },
    describe: (p) => [`冰冷伤害：${p.min}-${p.max}`, `冻缓时间：${p.chill.toFixed(1)} 秒`],
  },
  {
    id: 'glacial_spike', cls: 'sorceress', name: '冰尖柱', tree: 2, row: 2, col: 0, reqLevel: 12, prereqs: ['ice_bolt'], kind: 'spell', glyph: '✳', color: '#70c0ff',
    desc: '射出一根冰锥，命中后炸开，冻住周围的敌人。',
    synergies: [{ skill: 'ice_bolt', pct: 8 }, { skill: 'blizzard', pct: 8 }],
    mana: (l) => r(10 + 0.5 * l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((18 + 8 * (l - 1)) * m), max: r((28 + 11 * (l - 1)) * m), radius: 1.6, chill: 2.5 + 0.1 * l };
    },
    describe: (p) => [`冰冷伤害：${p.min}-${p.max}`, `爆炸半径：${p.radius} 码`, `冻缓时间：${p.chill.toFixed(1)} 秒`],
  },
  {
    id: 'blizzard', cls: 'sorceress', name: '暴风雪', tree: 2, row: 3, col: 1, reqLevel: 18, prereqs: ['glacial_spike', 'frost_nova'], kind: 'spell', glyph: '❄', color: '#d0f0ff',
    desc: '召唤冰雹持续砸向目标区域。',
    synergies: [{ skill: 'ice_bolt', pct: 6 }, { skill: 'glacial_spike', pct: 6 }],
    cooldown: 1.2,
    mana: (l) => r(23 + l),
    params: (l, syn) => {
      const m = 1 + syn / 100;
      return { min: r((20 + 10 * (l - 1)) * m), max: r((34 + 14 * (l - 1)) * m), shards: 22 + l, radius: 2.8, dur: 3.2 };
    },
    describe: (p) => [`每块冰雹冰冷伤害：${p.min}-${p.max}`, `冰雹数量：${p.shards}`, `持续时间：${p.dur} 秒`, '冷却时间：1.2 秒'],
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function classSkills(cls: PlayerClass): SkillDef[] {
  return SKILLS.filter((s) => s.cls === cls);
}

/** the plain weapon attack, always available */
export const BASIC_ATTACK = 'attack';
