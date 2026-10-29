import { randInt, type P2 } from '../core/math';
import { UMOD_NAMES, monsterDef, type MonsterDef } from '../data/monsters';
import type { Difficulty } from '../items/d2/types';
import { Actor, type Resists } from './actor';
import { attackAt, attackElems, monStats, monsterMissile, type AttackMode, type MonAttack, type MonElem, type MonPlus, type MonRank } from './d2/monstats';
import { auraEnchant, auraNumbers, type AuraNumbers } from './d2/monai';
import { MPS_PER_VELOCITY } from './d2/stats';
import type { Friendly } from './merc';

export type MonsterRank = MonRank;

/** what an attack or a cast does as it goes off (src/game/ai.ts fire) */
export interface MonsterAct {
  kind: 'blow' | 'missile' | 'raise' | 'cry' | 'teleport' | 'summon' | 'spray';
  /** the D2 mode it plays in */
  mode: AttackMode | 's2' | 'sq';
  missile?: string;
  level?: number;
  /** what it is aimed at: the corpse raised, the spot teleported to or summoned at */
  corpse?: Monster;
  to?: P2;
  /** missiles it looses one after another (a sequence's) */
  count?: number;
}

/** a move under way: walking or running at the hero (to null) or to a spot, for so far */
export interface MonsterMove {
  to: P2 | null;
  speed: number;
  /** metres it may still go before it thinks again (D2's path, its newDist long) */
  left: number;
  /** how near it stops */
  reach: number;
  /** at the hero: how near its steps stop it, centre to centre (ai.ts go, A.stepStop); 0 for none */
  near?: number;
  /** seconds it has made no headway */
  stuck: number;
  /** D2's WalkToTargetUnitWithFlags(7) (AiTactics.cpp:340-366): if it can't go, it next looks by sight (1), and wanders or stands instead (2) */
  fallback?: boolean;
  /** if it can't go, its pack leader's order is dropped (AiThink.cpp:656-659) */
  dropCmd?: boolean;
}

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
  /** what it moves at now (the AI's move under way, src/game/ai.ts) and its plain walk, m/s */
  speed: number;
  walkSpeed: number;
  /** its velocity % before the AI's (monStats velPct) */
  velPct: number;
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
  /** it has noticed the hero (D2's AI flag 8, AiUtil.cpp:855-861): from then on it needs no line of sight to find them */
  awake = false;
  /**
   * the friendly it goes for, as it last thought (src/game/ai.ts friendlyTarget): the nearer of the
   * hero and the hireling within reach of being a target; null when neither was, when it goes by the hero
   */
  target: Friendly | null = null;
  /** the hero's weapon made it flee ("hit causes monster to flee"), seconds */
  fleeTime = 0;
  /** seconds until it next thinks, while it stands (D2's AITHINK event) */
  thinkTimer = Math.random() * 0.3;
  /** what the attack or cast under way does when it goes off (src/game/ai.ts) */
  act: MonsterAct | null = null;
  /** the move under way */
  move: MonsterMove | null = null;
  /** D2's dwAiParam[0] and [1]: what its AI keeps between thoughts (a Fallen's fright, a lancer's charge, Blood Raven's count) */
  aiFlag = 0;
  aiCount = 0;
  /** D2's AI command (AIGENERAL_CopyAiCommand): 1, its pack leader's order to attack */
  cmd = 0;
  /**
   * Its AI state is a get-hit's (sub_6FCF2E70, AiUtil.cpp:1276-1280): 3, its last mode other than
   * neutral a get-hit, or 19, a hit it took with none (src/game/combat.ts applyDamage)
   */
  wasHit = false;
  /** that hit had no get-hit (AI state 19): its next mode other than neutral keeps it, as 3 (MonsterMode.cpp:1796-1812) */
  hitHeld = false;
  /** a walk at the hero it couldn't make: it next looks for them by sight alone (AI flag 0x40, AiTactics.cpp:347-353) */
  mustSee = false;
  /** a unique or boss has seen the hero within 20 subtiles and roared (AI flag 0x10, AiThink.cpp:17532-17541) */
  taunted = false;
  /** raised or summoned: killed again it gives no experience and drops nothing (UNITFLAG_NOXP | UNITFLAG_NOTC, SkillMonst.cpp:1266) */
  noXp = false;
  /** an aura-enchanted unique's aura (MonUMod 30), what it does, and the time to its next pulse */
  aura: { skill: string; lvl: number; n: AuraNumbers } | null = null;
  auraPulse = 0;
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
  /** its corpse can still be raised: not shattered by cold, not taken by a raise under way */
  corpseRaisable = true;
  /** the one it is a minion of: a party's leader, a unique (D2's minion owner, AIGENERAL_GetMinionOwner) */
  leader: Monster | null = null;
  /** a leader's minions, in the order they spawned (D2's minion list) */
  minions: Monster[] = [];
  /** it is its own minion owner, a party's leader or a unique (AIGENERAL_GetMinionOwner(m) == m): it may order its pack on */
  leads = false;
  /**
   * The unique it spawned a minion of, which it keeps near (D2's AI owner, dwOwnerGUID, set by
   * AIUTIL_SetOwnerGUIDAndType as a unique's minions spawn, MonsterUnique.cpp:2538-2541, and by
   * nothing else; src/game/ai.ts leash), none once that one is dead
   */
  leashTo: Monster | null = null;
  /** the pack it spawned with, which notices the hero as one */
  pack: Monster[] | null = null;
  lastHitBy = 0;
  hasLos = false;
  losTimer = Math.random() * 0.25;
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
    this.velPct = s.velPct;
    this.walkSpeed = s.walk * MPS_PER_VELOCITY;
    this.speed = this.walkSpeed;
    this.attackSpeed = d.attackSpeed;
    const first = this.attack(this.modes()[0] ?? 'a1');
    this.ar = first?.ar ?? 0;
    this.dmg = first ? [first.min, first.max] : [0, 0];
    this.chillAmount = Math.min(0.9, Math.max(0, -s.coldEffect / 100));
    this.displayName = d.name;
    // an aura-enchanted unique's aura: D2 picks it with the unique's name seed (MonsterUnique.cpp:625-640), here by where it stands
    if (rank === 'unique' && mods.includes(30)) {
      const a = auraEnchant(this.level, (n) => ((Math.imul(Math.floor(pos.x * 16), 73856093) ^ Math.imul(Math.floor(pos.z * 16), 19349663)) >>> 0) % n);
      this.aura = { ...a, n: auraNumbers(a.skill, a.lvl) };
    }
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

  /** whether a modifier works on it: on its own, as a champion's or unique's, not as a minion's (bUnique, MonsterUnique.cpp:2016-2020) */
  hasOwn(mod: number): boolean {
    return (this.rank === 'champion' || this.rank === 'unique') && this.mods.includes(mod);
  }

  /** its speed with `bonus` % more velocity, as an AI's move sets (AITACTICS_SetVelocity; Units.cpp:1683-1702: at least 25 %) */
  moveSpeed(bonus = 0): number {
    return (this.def.row.velocity * Math.max(25, this.velPct + bonus) * MPS_PER_VELOCITY) / 100;
  }

  /** a minion of `leader`, in its list; the leader owns itself (AIGENERAL_SetOwnerData, MonsterSpawn.cpp:1117-1120) */
  follow(leader: Monster) {
    this.leader = leader;
    leader.minions.push(this);
    leader.leads = true;
  }

  /** its modifiers in words, the champion's kind first */
  modText(): string {
    return this.mods
      .map((m) => UMOD_NAMES[m])
      .filter(Boolean)
      .join('，');
  }
}
