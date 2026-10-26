import type { StatKey } from './stats';

/**
 * Diablo II's shrines, the kinds that bless: they stand in the wilderness, each good for one touch.
 * The hero carries one blessing at a time (a new one replaces it), for 96 seconds as in Diablo II.
 */
export interface ShrineDef {
  id: string;
  name: string;
  /** what it does, said when it is touched */
  desc: string;
  /** how long the blessing lasts; 0 for what happens at once */
  secs: number;
  /** summed into the hero's stats while the blessing lasts */
  stats?: Partial<Record<StatKey, number>>;
  /** % more defense, % more experience: no item gives these */
  defPct?: number;
  xpPct?: number;
  /** puts life and mana back to full there and then */
  refill?: boolean;
  /** its glow, and the colour of what it says */
  color: string;
}

export const SHRINES: ShrineDef[] = [
  { id: 'armor', name: '护甲神殿', desc: '防御提高 100%', secs: 96, defPct: 100, color: '#c8d0e0' },
  { id: 'combat', name: '战斗神殿', desc: '攻击准确率提高 200%，伤害提高 100%', secs: 96, stats: { arPct: 200, dmgPctGlobal: 100 }, color: '#ff8a4a' },
  { id: 'experience', name: '经验神殿', desc: '获得的经验提高 50%', secs: 96, xpPct: 50, color: '#ffd24a' },
  { id: 'skill', name: '技能神殿', desc: '所有技能等级 +2', secs: 96, stats: { skillsAll: 2 }, color: '#8aa8ff' },
  { id: 'mana', name: '法力神殿', desc: '法力回复速度提高 400%', secs: 96, stats: { manaRegen: 400 }, color: '#4a6aff' },
  { id: 'resist', name: '抗性神殿', desc: '所有抗性提高 75%', secs: 96, stats: { resAll: 75 }, color: '#6aff9a' },
  { id: 'refill', name: '回复神殿', desc: '生命与法力全部恢复', secs: 0, refill: true, color: '#ff5a6a' },
];

export const SHRINE_BY_ID: Record<string, ShrineDef> = Object.fromEntries(SHRINES.map((s) => [s.id, s]));
