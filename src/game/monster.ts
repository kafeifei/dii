import { randInt, type P2 } from '../core/math';
import { UMOD_NAMES, monsterDef, type MonsterDef } from '../data/monsters';
import type { Difficulty } from '../items/d2/types';
import { Actor, type Resists } from './actor';
import { attackAt, attackElems, monStats, monsterMissile, type AttackMode, type MonAttack, type MonElem, type MonPlus, type MonRank } from './d2/monstats';
import { MPS_PER_VELOCITY } from './d2/stats';

export type MonsterRank = MonRank;

export interface MonsterOpts {
  /** the difficulty its numbers are of (D2's columns); normal if not given */
  difficulty?: Difficulty;
  /** the superunique it is (D2X_SUPERUNIQUES key), which drops its own class; minions aren't */
  superUnique?: string;
  /** picks a whole number in [lo, hi]: its life */
  roll?: (lo: number, hi: number) => number;
}

/**
 * A monster in play: one of Diablo II's (MonStats.txt, src/data/d2x/monsters.ts) as it spawned, at
 * its level, in its difficulty, a champion, unique or minion with its modifiers (MonUMod ids), its
 * numbers D2's (src/game/d2/monstats.ts) and its look the game's (src/data/monsters.ts).
 */
export class Monster extends Actor {
  faction = 'monster' as const;
  def: MonsterDef;
  difficulty: Difficulty;
  rank: MonsterRank;
  /** its champion or unique modifiers, MonUMod ids, the champion's kind first */
  mods: number[];
  displayName: string;
  /** the superunique it is (D2X_SUPERUNIQUES key), which drops its own class; minions aren't */
  superUnique?: string;
  /** the level its life, defense and experience came from; `level` adds the champion's or unique's */
  baseLevel: number;
  defense: number;
  /** its first attack's to-hit (an attack's own goes with it, DamagePacket.ar) */
  ar: number;
  /** its first attack's damage */
  dmg: [number, number];
  /** the run it chases with and its walk, m/s */
  speed: number;
  walkSpeed: number;
  attackSpeed: number;
  xp: number;
  res: Resists & { magic: number };
  /** life a second */
  regen: number;
  /** its modifiers' damage % and to-hit % */
  dmgPct: number;
  arPct: number;
  /** elemental damage its modifiers put on every attack */
  plus: MonPlus;
  /** % of the hero's leech that works on it */
  drain: number;
  /** speed change while chilled, % */
  coldEffect: number;
  awake = false;
  target: Actor | null = null;
  attackCd = 0;
  fleeTime = 0;
  thinkTimer = Math.random() * 0.3;
  /** shaman resurrect cooldown */
  specialCd = 2 + Math.random() * 3;
  /** when a lightning-enchanted one last loosed its bolts (Game.time) */
  boltsAt = -Infinity;
  homePos: P2;
  /** debuffs from player auras (reapplied each tick) */
  convictRes = 0;
  convictDef = 0;
  /** defense knocked off by "-X to monster defense per hit" */
  defLoss = 0;
  /** blinded: loses track of the player beyond arm's reach */
  blindTime = 0;
  /** "prevent monster heal" */
  noHealTime = 0;
  corpseRaisable = true;
  /** the pack leader (for minions) */
  leader: Monster | null = null;
  strafeDir = Math.random() < 0.5 ? 1 : -1;
  lastHitBy = 0;
  hasLos = false;
  losTimer = Math.random() * 0.25;
  chargeTime = 0;
  /** what the attack under way does when it lands: a blow, a missile, a raise */
  action: 'melee' | 'shoot' | 'raise' = 'melee';
  /** the mode the blow under way is in */
  mode: AttackMode = 'a1';

  /**
   * `def`: the D2 monster (its id, or its def); `mlvl` the level it spawns at (spawnLevel); `rank`
   * and `mods` what the spawn made of it
   */
  constructor(def: MonsterDef | string, mlvl: number, rank: MonsterRank, pos: P2, mods: number[] = [], o: MonsterOpts = {}) {
    super(pos);
    const d = typeof def === 'string' ? monsterDef(def) : def;
    if (!d) throw new Error(`no monster ${String(def)} with a look`);
    this.def = d;
    this.difficulty = o.difficulty ?? 0;
    this.rank = rank;
    this.mods = mods;
    this.superUnique = o.superUnique;
    this.homePos = { ...pos };
    this.radius = d.radius * (rank === 'champion' || rank === 'unique' ? 1.12 : 1);
    const s = monStats(d.row, this.difficulty, mlvl, rank, mods, o.roll ?? randInt);
    this.baseLevel = s.baseLevel;
    this.level = s.level;
    this.maxLife = s.life;
    this.life = s.life;
    this.defense = s.defense;
    this.xp = s.xp;
    this.regen = s.regen;
    this.res = { fire: s.res.fire, cold: s.res.cold, light: s.res.light, poison: s.res.poison, phys: s.res.phys, magic: s.res.magic };
    this.dmgPct = s.dmgPct;
    this.arPct = s.arPct;
    this.plus = s.plus;
    this.drain = s.drain;
    this.coldEffect = s.coldEffect;
    // D2's velocity on the hero's scale (game/d2/stats.ts MPS_PER_VELOCITY)
    this.speed = s.run * MPS_PER_VELOCITY;
    this.walkSpeed = s.walk * MPS_PER_VELOCITY;
    this.attackSpeed = d.attackSpeed;
    const first = this.attack(this.modes()[0] ?? 'a1');
    this.ar = first?.ar ?? 0;
    this.dmg = first ? [first.min, first.max] : [0, 0];
    this.chillAmount = Math.min(0.9, Math.max(0, -s.coldEffect / 100));
    this.displayName = d.name;
  }

  /** its attack modes that do damage of their own, A1 first: its row's in its difficulty, so worked out once */
  modes(): readonly AttackMode[] {
    if (!this.modesCache) {
      const t = this.def.row.diff[this.difficulty];
      this.modesCache = (['a1', 'a2', 's1'] as const).filter((m) => t[m] || (t.el ?? []).some((e) => e.mode.toLowerCase() === m));
    }
    return this.modesCache;
  }
  private modesCache?: AttackMode[];

  /** a mode's damage and to-hit now (D2 reads them at the monster's level as it attacks) */
  attack(mode: AttackMode): MonAttack | undefined {
    return attackAt(this.def.row, this.difficulty, this.level, mode, this.dmgPct, this.arPct);
  }

  /** a mode's elemental damage */
  elems(mode: AttackMode): MonElem[] {
    return attackElems(this.def.row, this.difficulty, this.level, mode);
  }

  /** the missile it shoots and the mode and level it shoots it at; its row's, worked out once */
  missile() {
    if (this.missileCache === undefined) this.missileCache = monsterMissile(this.def.row, this.difficulty) ?? null;
    return this.missileCache ?? undefined;
  }
  private missileCache?: ReturnType<typeof monsterMissile> | null;

  resists(): Resists {
    const c = this.convictRes;
    return {
      fire: this.res.fire - c,
      cold: this.res.cold - c,
      light: this.res.light - c,
      poison: this.res.poison - c,
      phys: this.res.phys,
      magic: this.res.magic,
    };
  }

  effectiveDefense(): number {
    return Math.max(0, Math.floor(this.defense * (1 - this.convictDef / 100)) - this.defLoss);
  }

  /** whether it has a modifier, by MonUMod id */
  has(mod: number): boolean {
    return this.mods.includes(mod);
  }

  /** its modifiers in words, the champion's kind first */
  modText(): string {
    return this.mods
      .map((m) => UMOD_NAMES[m])
      .filter(Boolean)
      .join('，');
  }
}
