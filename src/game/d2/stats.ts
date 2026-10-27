// Diablo II's character formulas: attributes, life/mana/stamina, potions, movement, attack rating,
// defense, chance to hit and block and resistances, from CharStats.txt (src/data/d2x/classes.ts) and
// DifficultyLevels.txt; experience is in xp.ts. Pure functions, nothing wired.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f. D2 keeps life, mana
// and stamina in 256ths of a point and everything else here in integers; the integer steps are kept
// where they change a result (C division truncates toward zero, hence Math.trunc).
import type { PlayerClass } from '../../data/classes';
import { D2X_CLASSES } from '../../data/d2x/classes';
import { D2X_DIFFICULTIES } from '../../data/d2x/difficulty';
import type { D2xClass, D2xDifficulty } from '../../data/d2x/types';

export type ClassCode = 'ama' | 'sor' | 'nec' | 'pal' | 'bar' | 'dru' | 'ass';
export type DifficultyId = D2xDifficulty['id'];

const CODE_OF: Record<PlayerClass, ClassCode> = { paladin: 'pal', sorceress: 'sor' };

/** a class's CharStats row, by the game's class id or D2's code */
export function charStats(cls: PlayerClass | ClassCode): D2xClass {
  const cs = D2X_CLASSES[CODE_OF[cls as PlayerClass] ?? cls];
  if (!cs) throw new Error(`no CharStats row for ${cls}`);
  return cs;
}

/** a DifficultyLevels row: by id, or 0 normal, 1 nightmare, 2 hell */
export function difficulty(d: DifficultyId | number): D2xDifficulty {
  const row = typeof d === 'number' ? D2X_DIFFICULTIES[d] : D2X_DIFFICULTIES.find((r) => r.id === d);
  if (!row) throw new Error(`no difficulty ${d}`);
  return row;
}

// ───────────────────────── attributes and vitals ─────────────────────────

export interface Attributes {
  str: number;
  dex: number;
  vit: number;
  /** D2's "energy" (CharStats int) */
  ene: number;
}

/** a new hero's attributes (D2MOO PlayerStats.cpp:42-45) */
export function startAttributes(cs: D2xClass): Attributes {
  return { str: cs.str, dex: cs.dex, vit: cs.vit, ene: cs.ene };
}

// A new hero has vit + hpadd life, ene mana and `stamina` stamina (PlayerStats.cpp:48-53); each level
// adds the per-level growth (PlayerStats.cpp:96-108) and each point of vitality or energy above the
// start adds the per-point growth, whether spent (PlayerStats.cpp:157-158, 178-185) or from items
// (D2StatList.cpp:359-404, ops 8 and 9). So the totals depend only on level and the attribute.
// The growth is in quarters and D2 keeps the fraction: floor these to show them.

/** life before +life and +% life, at level `level` with `vit` vitality in all */
export function baseLife(cs: D2xClass, level: number, vit: number): number {
  return cs.vit + cs.hpadd + cs.lifePerLvl * (level - 1) + cs.lifePerVit * (vit - cs.vit);
}

/** mana before +mana and +% mana, at level `level` with `ene` energy in all */
export function baseMana(cs: D2xClass, level: number, ene: number): number {
  return cs.ene + cs.manaPerLvl * (level - 1) + cs.manaPerEne * (ene - cs.ene);
}

/** stamina before +stamina, at level `level` with `vit` vitality in all */
export function baseStamina(cs: D2xClass, level: number, vit: number): number {
  return cs.stamina + cs.staminaPerLvl * (level - 1) + cs.staminaPerVit * (vit - cs.vit);
}

/** skill points a level gives: D2 adds one a level whatever SkillsPerLevel says (PlayerStats.cpp:113) */
export const SKILL_POINTS_PER_LEVEL = 1;

/** the attribute and skill points `levels` level-ups give (PlayerStats.cpp:111-113) */
export function levelUpPoints(cs: D2xClass, levels: number): { stat: number; skill: number } {
  return { stat: levels * cs.statPerLvl, skill: levels * SKILL_POINTS_PER_LEVEL };
}

/**
 * Mana regenerated a second (D2MOO PlrModes.cpp:1195-1219): each frame (25 a second) adds maxMana /
 * (25 × ManaRegen) 256ths of a point, at least 1, raised by "regenerate mana %". So the pool refills
 * in about ManaRegen seconds; potion recovery (STAT_MANARECOVERY) comes on top.
 */
export function manaRegenPerSec(cs: D2xClass, maxMana: number, recoveryPct = 0): number {
  // a ManaRegen of 0 means 300 seconds (7500 frames, PlrModes.cpp:1207-1211)
  const perFrame = Math.max(1, Math.trunc((maxMana * 256) / (25 * (cs.manaRegen || 300))));
  return (Math.trunc((perFrame * (recoveryPct + 100)) / 100) * 25) / 256;
}

// ───────────────────────── potions ─────────────────────────

/**
 * What a healing or mana potion gives this class: D2MOO hard-codes the class shares
 * (Items.cpp:4571-4613: life ×1.5 for ama/pal/ass, ×2 bar; mana ×2 sor/nec/dru, ×1.5 ama/pal/ass),
 * D2R has them as CharStats HealthPotionPercent/ManaPotionPercent; the two agree.
 */
export function potionHeal(cs: D2xClass, kind: 'life' | 'mana', amount: number): number {
  return (amount * (kind === 'life' ? cs.hpPotion : cs.mpPotion)) / 100;
}

/**
 * The chance a potion's effect doubles (SkillItem.cpp:196, 212): roll % 100 < random(0…attr − 1) / 2,
 * with vitality for life and energy for mana.
 */
export function potionDoubleChance(attr: number): number {
  const n = Math.floor(attr);
  if (n <= 0) return 0;
  let hits = 0;
  for (let k = 0; k < n; k++) hits += Math.min(100, k >> 1);
  return hits / (100 * n);
}

// ───────────────────────── movement ─────────────────────────

export interface MoveOpts {
  running?: boolean;
  /** faster run/walk % */
  frw?: number;
  /** the Speed column of the worn body armor and shield, summed (each is −Speed % velocity) */
  armorSpeed?: number;
  /** other velocity % changes, such as a chill's slow */
  velocityPct?: number;
}

/**
 * Velocity % of the walk speed (D2MOO Units.cpp:1678-1702): 100, +(100 × Run / Walk − 100) while
 * running (Units.cpp:708), + frw with diminishing returns frw × 150 / (frw + 150) (Units.cpp:1237,
 * 1242-1253), − each armor's Speed (Items.cpp:5364), and other slows; never below 25.
 */
export function velocityPercent(cs: D2xClass, o: MoveOpts = {}): number {
  const frw = o.frw ?? 0;
  const effFrw = frw ? Math.trunc((frw * 150) / (frw + 150)) : 0;
  const run = o.running && cs.walk ? Math.trunc((100 * cs.run) / cs.walk) - 100 : 0;
  return Math.max(25, 100 + run + effFrw - (o.armorSpeed ?? 0) + (o.velocityPct ?? 0));
}

/** walk or run speed on the scale of CharStats WalkVelocity and monstats Velocity (Units.cpp:1293, 1702) */
export function moveVelocity(cs: D2xClass, o: MoveOpts = {}): number {
  return (cs.walk * velocityPercent(cs, o)) / 100;
}

/**
 * Stamina a second spent running (D2MOO PlrModes.cpp:256-293): none in town; each frame 2 × RunDrain
 * 256ths, × (torso armor Speed / 10 + 1), less "slower stamina drain %", at least 1.
 */
export function runDrainPerSec(cs: D2xClass, o: { torsoSpeed?: number; drainPct?: number; inTown?: boolean } = {}): number {
  if (o.inTown) return 0;
  // cs.runDrain is already 2 × RunDrain × 25 / 256: back to 256ths a frame for the integer steps
  let lost = Math.round((cs.runDrain * 256) / 25) * (Math.trunc((o.torsoSpeed ?? 0) / 10) + 1);
  if (o.drainPct) lost += Math.trunc((lost * o.drainPct) / -100);
  return (Math.max(1, lost) * 25) / 256;
}

// ───────────────────────── attack, defense, hit and block ─────────────────────────

/**
 * Attack rating: to-hit stats + 5 × (dex − 7) + ToHitFactor (D2MOO Units.cpp:2407-2430), then the
 * % bonuses (items, weapon mastery, the attack skill's own) on all of it (SUnitDmg.cpp:2507-2541).
 * `flatAr` holds every "+X to attack rating", the weapon's own and vs undead/demons included.
 */
export function attackRating(cs: D2xClass, dex: number, flatAr = 0, arPct = 0): number {
  const ar = flatAr + 5 * (dex - 7) + cs.toHitFactor;
  return ar + Math.trunc((ar * arPct) / 100);
}

/**
 * Defense (D2MOO Units.cpp:2349-2404): dex / 4 + armor class (the items' defense and "+X defense"),
 * then "+% defense" from items and skills (Holy Shield's among them), on a negative total toward
 * zero; then a curse-style override % on the result.
 */
export function defense(dex: number, armor: number, defPct = 0, overridePct = 0): number {
  const def = Math.trunc(dex / 4) + armor;
  const total = def + Math.trunc((def * defPct) / (def <= 0 ? -100 : 100));
  return total + Math.trunc((total * overridePct) / 100);
}

/**
 * Chance to hit, % (D2MOO SUnitDmg.cpp:2446-2563): 100 × AR / (AR + DR), × 2 × alvl / (alvl + dlvl),
 * kept to 5–95. Negative defense counts as attack rating. `ar` is the attacker's full rating
 * (attackRating, or a monster's), `def` the target's (defense, or a monster's).
 */
export function hitChance(ar: number, def: number, alvl: number, dlvl: number): number {
  let toHit = Math.trunc(ar);
  let dr = Math.trunc(def);
  if (dr < 0) {
    toHit -= dr;
    dr = 0;
  }
  if (toHit < 0) {
    dr -= toHit;
    toHit = 0;
  }
  const sum = toHit + dr;
  const factor = sum ? Math.trunc((100 * toHit) / sum) : 100;
  // levels are at least 1 in D2; the guard only keeps a bad input from dividing by zero
  const a = Math.max(1, alvl);
  const d = Math.max(1, dlvl);
  return Math.min(95, Math.max(5, Math.trunc((2 * a * factor) / (a + d))));
}

/** the block cap (Units.cpp:2474) */
export const BLOCK_CAP = 75;

/**
 * Chance to block with a shield, % (D2MOO Units.cpp:2462-2478, expansion rule): (BlockFactor +
 * block stats) × (dex − 15) / (2 × level), at most 75; a third of it while running
 * (SUnitDmg.cpp:2716-2723). `toBlock` is the shield's Block plus "+% chance to block"; with no
 * shield there is no block at all.
 */
export function blockChance(cs: D2xClass, toBlock: number, dex: number, level: number, running = false): number {
  let b = Math.trunc(((cs.blockFactor + toBlock) * (dex - 15)) / (2 * Math.max(1, level)));
  b = Math.min(BLOCK_CAP, b);
  if (running) b = Math.trunc(b / 3);
  return Math.max(0, b);
}

// ───────────────────────── resistances and damage reduction ─────────────────────────

/** phys is "damage reduced by %" (STAT_DAMAGERESIST), magic is magic resistance */
export type ResKind = 'phys' | 'magic' | 'fire' | 'light' | 'cold' | 'poison';

export const RES_CAP = 75;
/** what "+X% to maximum resistance" can raise the cap to (SUnitDmg.cpp:996) */
export const RES_HARD_CAP = 95;
/** "damage reduced by %" cap for heroes (SUnitDmg.cpp:991) */
export const DR_CAP = 50;
export const RES_FLOOR = -100;
/** "X% of fire damage absorbed" and the like (SUnitDmg.cpp:1042) */
export const ABSORB_PCT_CAP = 40;

/** which flat reduction applies before the %: "damage reduced by X" or "magic damage reduced by X" (SUnitDmg.cpp:764-772) */
export const FLAT_REDUCTION: Record<ResKind, 'phys' | 'magic' | null> = {
  phys: 'phys',
  magic: 'magic',
  fire: 'magic',
  light: 'magic',
  cold: 'magic',
  poison: null,
};

/** the kinds "-X% enemy resistance" pierces (SUnitDmg.cpp:764-772) */
const PIERCED: Record<ResKind, boolean> = { phys: false, magic: false, fire: true, light: true, cold: true, poison: true };

export interface ResOpts {
  /** the defender is a monster: no difficulty penalty, no cap, and pierce stops at immunity */
  monster?: boolean;
  /** "+X% to maximum resistance" of this kind (the hero's) */
  maxBonus?: number;
  /** the attacker's pierce of this kind */
  pierce?: number;
  /** the hero's difficulty, for its ResistPenalty (expansion: 0 / −40 / −100) */
  diff?: D2xDifficulty | DifficultyId;
}

/**
 * The resistance that applies (D2MOO SUnitDmg.cpp:939-1010): pierce comes off (not off a monster's
 * 100+), a hero takes the difficulty's penalty on the four elements (SUnitDmg.cpp:966-971); a hero's
 * positive total is capped at 75 + max bonus (95 at most), or 50 for physical; nothing goes below
 * −100. For damage D2 then reads at most 100 (mitigate).
 */
export function resistance(kind: ResKind, raw: number, o: ResOpts = {}): number {
  let res = raw;
  const pierce = o.pierce ?? 0;
  if (pierce && PIERCED[kind] && (res < 100 || !o.monster)) res -= pierce;
  if (!o.monster && kind !== 'phys' && kind !== 'magic' && o.diff !== undefined) {
    res += (typeof o.diff === 'string' ? difficulty(o.diff) : o.diff).resistPenalty;
  }
  if (res <= 0) return Math.max(RES_FLOOR, res);
  if (o.monster) return res;
  const cap = kind === 'phys' ? DR_CAP : Math.min(RES_CAP + (o.maxBonus ?? 0), RES_HARD_CAP);
  return Math.min(cap, res);
}

/** a hero's resistances as the character screen shows them: the four elements, magic and damage reduction % */
export function heroResists(
  raw: Partial<Record<ResKind, number>>,
  maxBonus: Partial<Record<ResKind, number>>,
  diff: D2xDifficulty | DifficultyId,
): Record<ResKind, number> {
  const out = {} as Record<ResKind, number>;
  for (const k of Object.keys(PIERCED) as ResKind[]) out[k] = resistance(k, raw[k] ?? 0, { maxBonus: maxBonus[k], diff });
  return out;
}

/**
 * Damage after the defender's flat reduction (FLAT_REDUCTION's kind) and then its resistance
 * (SUnitDmg.cpp:1016-1025); 100 or more stops it all, a negative one adds to it.
 */
export function mitigate(dmg: number, res: number, flat = 0): number {
  const v = dmg - flat;
  if (v <= 0) return 0;
  return (v * (100 - Math.min(100, res))) / 100;
}

/**
 * Elemental absorption after resistance (SUnitDmg.cpp:1036-1057): the % (at most 40) then the flat
 * amount turn damage into life.
 */
export function absorb(dmg: number, pct = 0, flat = 0): { dmg: number; life: number } {
  let life = pct > 0 ? (dmg * Math.min(ABSORB_PCT_CAP, pct)) / 100 : 0;
  let left = dmg - life;
  if (flat > 0) {
    const f = Math.min(flat, left);
    left -= f;
    life += f;
  }
  return { dmg: left, life };
}
