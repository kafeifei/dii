// Diablo II's monster AI, the parts that need no game: each AI's parameters by what D2MOO's code
// reads them as, D2's distances and frames on the game's scale, and the rules the AIs in
// src/game/ai.ts decide by. Pure functions.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f; "AiThink.cpp" is
// D2Game/src/AI/AiThink.cpp, "AiTactics.cpp" D2Game/src/AI/AiTactics.cpp.
import { FRAMES_PER_SEC, M_PER_SUBTILE } from '../../core/units';
import { D2X_MONSTER_AI } from '../../data/d2x/monsters';
import { D2X_SKILLS } from '../../data/d2x/skills';
import type { D2xMonster } from '../../data/d2x/types';
import { bandsAt } from './monstats';

/** seconds of `n` of D2's frames */
export const frames = (n: number) => n / FRAMES_PER_SEC;
/** metres of `n` of D2's subtiles */
export const subtiles = (n: number) => n * M_PER_SUBTILE;
/** subtiles of `m` metres */
export const inSubtiles = (m: number) => m / M_PER_SUBTILE;

/**
 * The parameters (MonStats aip1–aip8, aip1 at 0) each AI reads, by what D2MOO's code reads them as
 * (AiThink.cpp's D2C_*AIParams enums). MonAI.txt's words for them (D2X_MONSTER_AI) mostly agree;
 * where they don't the code stands: the Fallen's aip2 is how near the hero must be to be walked at
 * (AiThink.cpp:595, "Non-command Wander behavior" in MonAI.txt), the Corrupt Lancer's aip2 is its
 * chance to attack (AiThink.cpp:3580, "Use Skill1/Skill2/Skill3" in MonAI.txt).
 */
export const AIP = {
  Skeleton: { approach: 0, stall: 1, attack: 2, a1: 3 },
  Zombie: { approach: 0, aware: 1, a1: 3 },
  Bighead: { hurt: 0, circle: 1, fireHealthy: 2, fireHurt: 3 },
  BloodHawk: { charge: 0, wander: 1, attack: 2, runVel: 3, chargeVel: 4 },
  Fallen: { command: 0, approachDist: 1, attack: 2, a1: 3 },
  Brute: { attack: 2, a1: 3 },
  Wraith: { approach: 0, stall: 1, attack: 2 },
  CorruptRogue: { approach: 0, stall: 1, attack: 2, runVel: 3, run: 4 },
  Goatman: { approach: 0, stall: 1, attack: 2 },
  FallenShaman: { command: 0, shoot: 1, melee: 2, raiseRange: 3, shootRange: 4 },
  QuillRat: { activate: 0, shoot: 1, walk: 3 },
  Andariel: { sprayMelee: 0, stall: 1, ranged: 2, sprayRanged: 3 },
  CorruptArcher: { approach: 0, shoot: 1, stall: 2, run: 3, alwaysRun: 4, skill2: 5, skill3: 6, walkTo: 7 },
  CorruptLancer: { approach: 0, attack: 1, stall: 2, run: 3, alwaysRun: 4, skill1: 5, skill2: 6, skill3: 7 },
  SkeletonBow: { shoot: 0, stall: 1, approach: 2, steps: 3, keep: 4 },
  SkeletonMage: { shoot: 0, approachDist: 1, approach: 2, tooClose: 3, walkAway: 4, fireDist: 5, circle: 6, stall: 7 },
} as const;

export type AiName = keyof typeof AIP;

/** an AI parameter of a row in a difficulty (AI_GetParamValue, AiThink.cpp:236-239: wAiParam[n][difficulty]); 0 if the row has none */
export function aip(row: D2xMonster, difficulty: number, n: number): number {
  return row.diff[difficulty].ai.params[n] ?? 0;
}

/** an AI parameter by its name in AIP, for the row's own AI */
export function param<A extends AiName>(row: D2xMonster, difficulty: number, ai: A, name: keyof (typeof AIP)[A]): number {
  return aip(row, difficulty, AIP[ai][name] as number);
}

/** what MonAI.txt calls a row's AI parameter n (D2X_MONSTER_AI), for the tools */
export function paramName(row: D2xMonster, n: number): string | null {
  return D2X_MONSTER_AI[row.ai]?.[n] ?? null;
}

/** the frames between a monster's attacks and its next thought: MonStats aidel, 15 when none (MonsterMode.cpp:1097-1112) */
export function aiDelay(row: D2xMonster, difficulty: number): number {
  const d = row.diff[difficulty].ai.delay;
  return d > 0 ? d : 15;
}

/** how far off it notices the hero, subtiles: MonStats aidist, else 35 (AIUTIL_FindAiTarget, AiUtil.cpp:738-747) */
export function noticeRange(row: D2xMonster, difficulty: number): number {
  return row.diff[difficulty].ai.dist || 35;
}

/**
 * The frames a monster with no target stands before it looks again (AITACTICS_FindTargetOrIdleInNeutralMode,
 * AiTactics.cpp:51-66), by the hero's distance in subtiles: 25 from 35 on, the distance less 10 from
 * 25, else 10
 */
export function idleWithoutTarget(d: number): number {
  if (d >= 35) return 25;
  if (d >= 25) return Math.trunc(d) - 10;
  return 10;
}

/** a step of D2's path: MonStats2's newDist when the AI sets none, 5 subtiles (MonsterMode.cpp:1866-1869) */
export const PATH_STEP = 5;
/** a path is cut at 20 subtiles (PATH_SetDistance, MonsterMode.cpp:1827) */
export const PATH_MAX = 20;
/** steps from here on count as none (PATH_MAX_STEPNUM, Path.h:13; PATH_SetStepNum, Path.cpp:1553-1563) */
export const PATH_MAX_STEPNUM = 20;

/**
 * Metres between two units' edges at D2's unit distance `n` (D2Common_10399, Units.cpp:3700-3790):
 * twice the octagonal distance between their edges, so half a subtile a point
 */
export const unitGap = (n: number) => subtiles(Math.max(0, n) / 2);

/**
 * How near the hero a move at them with `steps` ends, metres between their edges: PATH_SetStepNum
 * keeps steps − 1, none for 0 or from PATH_MAX_STEPNUM on (Path.cpp:1553-1563), and a path at a unit
 * is done once their unit distance is no more than that (D2Common_10227, PathMisc.cpp:1279-1294).
 * So RunToTargetUnitWithSteps(3) ends a subtile off, a step count of 20 or more right at them.
 */
export function stepStop(steps: number): number {
  return unitGap(steps > 0 && steps < PATH_MAX_STEPNUM ? steps - 1 : 0);
}

/**
 * D2's distance from a unit to a point less the unit's size along each axis, octagonal (the longer
 * leg and half the shorter), in whole subtiles from whole-subtile spots as D2's are
 * (AIUTIL_GetDistanceToCoordinatesWithSize, AiUtil.cpp:47-60); `size` the unit's MonStats2 SizeX
 * makes it the FullUnitSize distance (AiUtil.cpp:64-67). Metres in.
 */
export function sizedDistance(a: { x: number; z: number }, b: { x: number; z: number }, size: number): number {
  const at = (v: number) => Math.floor(inSubtiles(v));
  const x = Math.abs(Math.abs(at(a.x) - at(b.x)) - size);
  const y = Math.abs(Math.abs(at(a.z) - at(b.z)) - size);
  return Math.trunc((Math.min(x, y) + 2 * Math.max(x, y)) / 2);
}

/**
 * The minion leash (D2GAME_AICORE_MinionLeash_6FCF0D10, AiThink.cpp:17427-17469): a unique's minion
 * more than LEASH subtiles from it (sizedDistance at the minion's size) walks back before it looks
 * for the hero, to a spot LEASH_WANDER off it (D2GAME_AICORE_WalkToOwner → AITACTICS_WanderToTarget,
 * AiTactics.cpp:536-577), its path's newDist LEASH_PATH (AITACTICS_SetVelocity(7, 0, 40))
 */
export const LEASH = 20;
export const LEASH_WANDER = 19;
export const LEASH_PATH = 40;

/** whether a minion `size` subtiles across at `pos` is past its leash from its owner at `owner` */
export const pastLeash = (pos: { x: number; z: number }, owner: { x: number; z: number }, size: number) => sizedDistance(pos, owner, size) > LEASH;

/**
 * The frames a monster's death takes before it lies dead (MONMODE_DEATH until MONMODE_DEAD): its
 * DD animation's, which is AnimData.d2's and not in d2data; here the game's death clips', 2.2 s
 * played at 1.25× (src/render/models.ts updateDeath): 1.76 s, 44 frames
 */
export const DEATH_FRAMES = 44;

/** a monster as these rules see it */
export interface AiUnit {
  pos: { x: number; z: number };
  dead: boolean;
  /** seconds since it died */
  deathTime: number;
}

/** whether it is still dying (MONMODE_DEATH), not yet lying dead */
export const dying = (m: AiUnit) => m.dead && m.deathTime < frames(DEATH_FRAMES);
/** whether it lies dead (MONMODE_DEAD) */
export const lyingDead = (m: AiUnit) => m.dead && m.deathTime >= frames(DEATH_FRAMES);

/**
 * The Fallen's fear (AITHINK_Fn006_Fallen, AiThink.cpp:533-567): a corpse among its rooms' last
 * deaths still dying (any monster's: each room keeps its last four deaths, whatever died,
 * D2Dungeon.cpp:1253-1260, MonsterMode.cpp:871) under 15 subtiles off, centre to centre
 * (AIUTIL_GetDistanceToCoordinates_NoUnitSize, D2's octagonal distance, here a straight one), sends
 * it running from the hero. `deaths`: the level's last deaths, its rooms' standing in for D2's
 */
export function frightened(fallen: AiUnit, deaths: readonly AiUnit[]): boolean {
  const r = subtiles(15);
  for (const c of deaths) {
    if (c === fallen || !dying(c)) continue;
    const dx = c.pos.x - fallen.pos.x;
    const dz = c.pos.z - fallen.pos.z;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/** a corpse a shaman may raise, as these rules see it */
export interface RaiseUnit extends AiUnit {
  rank: string;
  /** the MonStats row's AI class key: 'fallen', 'fallenshaman', … (lookKey) */
  kind: string;
  /** its corpse can't be raised (frozen or shattered: STATES_CheckStateMaskUdeadOnUnit) or was taken */
  spent: boolean;
  /** what put it there: a raise restores a corpse only where it stands clear (MONSTERSPAWN_CheckSkillPlacement) */
  blocked?: boolean;
  /** its minion owner (AIGENERAL_GetMinionOwner): its leader, none once that one died without passing its lead on */
  owner?: unknown;
}

/**
 * The corpse a Fallen Shaman raises (AITHINK_Fn013_FallenShaman, AiThink.cpp:1144-1166), or none.
 * A plain one, or a champion, raises its own (AIUTIL_TargetCallback_CountDeadMinions, AiUtil.cpp:490-501):
 * any of its minions lying dead, however far (the search squares aip4 but compares a plain
 * distance to it, so it reaches every one of them), still owned by it: a shaman raised after
 * its death left them masterless (monsterDied) raises none of them. The last the minion list
 * comes to stands, and D2's list is newest first, so the first one spawned. A unique (Bishibosh) raises any Fallen
 * or Fallen Shaman lying dead within aip4 subtiles, no champion's or unique's
 * (AITHINK_TargetCallback_FallenShaman, AiThink.cpp:1199-1240), the last the search comes to.
 * `minions`: its own, in the order they spawned; `near`: what lies round it, for a unique.
 */
export function raiseTarget<M extends RaiseUnit>(shaman: { pos: { x: number; z: number }; rank: string }, range: number, minions: readonly M[], near: readonly M[]): M | null {
  const ok = (c: M) => lyingDead(c) && !c.spent && !c.blocked;
  if (shaman.rank !== 'unique') {
    for (const c of minions) if (ok(c) && c.owner === shaman) return c;
    return null;
  }
  const r = subtiles(range);
  let pick: M | null = null;
  for (const c of near) {
    if (!ok(c) || (c.kind !== 'fallen' && c.kind !== 'fallenshaman') || c.rank === 'champion' || c.rank === 'unique') continue;
    const dx = c.pos.x - shaman.pos.x;
    const dz = c.pos.z - shaman.pos.z;
    if (dx * dx + dz * dz <= r * r) pick = c;
  }
  return pick;
}

/** D2's roll of a % chance (AIRollChanceParam, AiThink.cpp:247-250: a roll in [0, 100) under it) */
export const rolls = (pct: number, rnd: () => number) => Math.floor(rnd() * 100) < pct;

/**
 * Where AITACTICS_WalkCloseToUnit walks (AiTactics.cpp:503-534): `n` subtiles off along one of D2's
 * two axes, up to n − 1 along the other, each way at random; metres from `p`
 */
export function wanderPoint(p: { x: number; z: number }, n: number, rnd: () => number): { x: number; z: number } {
  let a = n;
  let b = Math.floor(rnd() * n);
  if (rnd() < 0.5) [a, b] = [b, a];
  if (rnd() < 0.5) a = -a;
  if (rnd() < 0.5) b = -b;
  return { x: p.x + subtiles(a), z: p.z + subtiles(b) };
}

/**
 * Where D2GAME_AICORE_Escape and AITACTICS_RunAwayFromTarget go (AiTactics.cpp:454-505): `n` subtiles
 * along each axis away from `from`, as D2's signs of the two differences have it
 */
export function escapePoint(p: { x: number; z: number }, from: { x: number; z: number }, n: number): { x: number; z: number } {
  return { x: p.x + Math.sign(p.x - from.x) * subtiles(n), z: p.z + Math.sign(p.z - from.z) * subtiles(n) };
}

/**
 * The velocity % a Brute adds as it walks at the hero (AITHINK_Fn007_Brute, AiThink.cpp:685-687):
 * 100 less its life %, the life % kept within 40–100, so up to 60 as it is hurt
 */
export const bruteHaste = (lifePct: number) => 100 - Math.min(100, Math.max(40, Math.trunc(lifePct)));
/** the Smith's (AITHINK_Fn098_Smith, AiThink.cpp:8759-8760): half of what life it has lost, % */
export const smithHaste = (lifePct: number) => (100 - Math.min(100, Math.max(0, Math.trunc(lifePct)))) >> 1;

/** D2's level-linear calc lnXY, par X + (lvl − 1) × par Y (SkillCalc.txt) */
function ln(s: string, a: number, b: number, lvl: number): number {
  const p = D2X_SKILLS[s]?.params ?? {};
  return (p[a] ?? 0) + (lvl - 1) * (p[b] ?? 0);
}
/**
 * dm, diminishing returns (D2Common_11033, D2Skills.cpp:3242-3252): par X + (par Y − par X) ×
 * (110 × lvl / (lvl + 6)) / 100, the inner quotient truncated first, kept to par Y. SkillCalc.txt's
 * own description of dmXY truncates once at the end and has no cap, so it can read one more
 * (Fanaticism's dm34 at level 3: 20 here, 21 by the description). The one dmXY: skillcalc.ts's
 * codes and the auras below both read it.
 */
export function dm(L: number, x: number, y: number): number {
  const v = x + Math.trunc(((y - x) * Math.trunc((110 * L) / (L + 6))) / 100);
  return v > y ? y : v;
}
/** a skill's dmXY at a level: dm over its params X and Y */
function dmPar(s: string, a: number, b: number, lvl: number): number {
  const p = D2X_SKILLS[s]?.params ?? {};
  return dm(lvl, p[a] ?? 0, p[b] ?? 0);
}
/**
 * The auras an aura-enchanted unique may get (MONSTERUNIQUE_UMod30_AuraEnchanted, MonsterUnique.cpp:604-656):
 * the skill, from which monster level on, and its level as multiplier × (mlvl + offset) / divisor,
 * 1–99. Thorns needs level 999: none in play.
 */
export const AURA_MODS = [
  { skill: 'Might', min: 0, off: 0, mul: 1, div: 6 },
  { skill: 'Holy Fire', min: 0, off: 0, mul: 1, div: 6 },
  { skill: 'Blessed Aim', min: 0, off: 0, mul: 1, div: 5 },
  { skill: 'Holy Freeze', min: 0, off: 0, mul: 1, div: 7 },
  { skill: 'Conviction', min: 0, off: 0, mul: 1, div: 8 },
  { skill: 'Fanaticism', min: 0, off: 0, mul: 1, div: 8 },
  { skill: 'Holy Shock', min: 20, off: 0, mul: 1, div: 8 },
  { skill: 'Thorns', min: 999, off: 0, mul: 0, div: 1 },
] as const;

/**
 * An aura-enchanted unique's aura: one of those its level allows, picked by `pick(n)` in [0, n)
 * (D2 seeds it with the unique's name seed, so the same unique always gets the same), at its level
 */
export function auraEnchant(level: number, pick: (n: number) => number): { skill: string; lvl: number } {
  const L = Math.max(1, level);
  const n = Math.max(1, AURA_MODS.filter((a) => a.min <= L).length);
  const a = AURA_MODS[Math.min(n - 1, pick(n))];
  return { skill: a.skill, lvl: Math.min(99, Math.max(1, Math.trunc((a.mul * (L + a.off)) / a.div))) };
}

/** what an aura does at a level, on D2's numbers (Skills.txt: its aurarangecalc and aurastatcalcs) */
export interface AuraNumbers {
  /** its reach, metres (ln12 subtiles) */
  radius: number;
  /** for its side: damage %, to-hit %, attack rate % */
  dmgPct?: number;
  arPct?: number;
  ratePct?: number;
  /** against the hero: resistances and defense off, %, slow % */
  res?: number;
  def?: number;
  slow?: number;
  /** a pulse of damage on the hero every `every` seconds (perdelay frames): its element and range */
  pulse?: { elem: 'fire' | 'cold' | 'light'; min: number; max: number; every: number };
}

export function auraNumbers(skill: string, lvl: number): AuraNumbers {
  const s = D2X_SKILLS[skill];
  const radius = subtiles(ln(skill, 1, 2, lvl));
  const every = frames(typeof s?.perDelay === 'number' ? s.perDelay : 50);
  const pulse = (elem: 'fire' | 'cold' | 'light') => {
    const e = s?.elem;
    return e?.min && e?.max ? { elem, min: bandsAt(e.min, lvl), max: bandsAt(e.max, lvl), every } : undefined;
  };
  switch (skill) {
    case 'Might':
      return { radius, dmgPct: ln(skill, 3, 4, lvl) };
    case 'Blessed Aim':
      return { radius, arPct: ln(skill, 3, 4, lvl) };
    case 'Fanaticism': {
      // its to-hit is the skill's ToHit by level, the damage its ln56 (half of it for the rest of the party)
      const th = s?.toHit && 'base' in s.toHit ? s.toHit.base + (lvl - 1) * s.toHit.perLvl : 0;
      return { radius, ratePct: dmPar(skill, 3, 4, lvl), arPct: th, dmgPct: ln(skill, 5, 6, lvl) };
    }
    case 'Conviction':
      return { radius, res: Math.min(150, ln(skill, 3, 4, lvl)), def: dmPar(skill, 5, 6, lvl) };
    case 'Holy Freeze':
      return { radius, slow: dmPar(skill, 3, 4, lvl), pulse: pulse('cold') };
    case 'Holy Fire':
      return { radius, pulse: pulse('fire') };
    case 'Holy Shock':
      return { radius, pulse: pulse('light') };
  }
  return { radius };
}

/**
 * A cursed unique's Amplify Damage (MONSTERUNIQUE_CastAmplifyDamage, MonsterUnique.cpp:984-1000): at
 * level mlvl / 5 + 1, over ln12 subtiles (1–40), for ln34 frames, −par5 % damage resistance
 */
export function amplifyCurse(mlvl: number): { lvl: number; radius: number; seconds: number; res: number } {
  const lvl = Math.max(1, Math.trunc(mlvl / 5) + 1);
  const s = 'Amplify Damage';
  return { lvl, radius: subtiles(Math.min(40, Math.max(1, ln(s, 1, 2, lvl)))), seconds: frames(ln(s, 3, 4, lvl)), res: D2X_SKILLS[s]?.params?.[5] ?? 100 };
}
