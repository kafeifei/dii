// Diablo II's experience: what a kill gives a hero and the level it makes, from experience.txt
// (src/data/d2x/experience.ts). Pure functions: Game.killMonster passes killXp(m.xp, p.level,
// m.level, addXpPct) to Player.gainXp, which takes addXp's total and level. One hero and no party:
// D2 gives a hero in no party the whole kill (D2MOO SUnitDmg.cpp:2993-2996); the hireling's share
// comes with hirelings.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f. Integer steps are D2's
// (C division truncates toward zero, hence Math.trunc).
import { D2X_MAX_LEVEL, D2X_XP, D2X_XP_LEVEL_DIFF, D2X_XP_RATIO } from '../../data/d2x/experience';

export const MAX_LEVEL = D2X_MAX_LEVEL;

/** the most experience a hero holds, the level-99 threshold (SUnitDmg.cpp:3137-3139) */
export const MAX_XP = D2X_XP[MAX_LEVEL - 1];

/** total experience a hero of level L has at least (DATATBLS_GetLevelThreshold(L − 1)) */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return D2X_XP[Math.min(level, MAX_LEVEL) - 1];
}

/** the level that much experience makes (DATATBLS_GetCurrentLevelFromExp, DataTbls.cpp:132-147) */
export function levelForXp(xp: number): number {
  let L = 1;
  while (L < MAX_LEVEL && xp >= D2X_XP[L]) L++;
  return L;
}

/**
 * D2's value × mult / div (MONSTERUNIQUE_CalculatePercentage, MonsterUnique.cpp:237-265): past
 * 2^20 it divides first, so big values lose their low digits. D2 multiplies the small case in 32
 * bits; nothing here comes near that.
 */
export function percentOf(value: number, mult: number, div: number): number {
  if (!div) return 0;
  if (value <= 0x100000) {
    if (mult <= 0x10000) return Math.trunc((mult * value) / div);
    if (div <= mult >> 4) return value * Math.trunc(mult / div);
  } else if (div <= value >> 4) {
    return mult * Math.trunc(value / div);
  }
  return Math.trunc((mult * value) / div);
}

// the level-gap tables in 256ths, as D2 has them (SUnitDmg.cpp:3047-3050, 3061-3064)
const LOWER = D2X_XP_LEVEL_DIFF.lower.map((f) => Math.round(f * 256));
const HIGHER = D2X_XP_LEVEL_DIFF.higher.map((f) => Math.round(f * 256));
/** ExpRatio is in 1024ths: experience.txt's MaxLvl row has ExpRatio 10, the shift (SUnitDmg.cpp:3081) */
const RATIO_SHIFT = 10;
const RATIO = D2X_XP_RATIO.map((r) => Math.round(r * (1 << RATIO_SHIFT)));
/** D2 caps a monster's experience so the 256ths cannot overflow (SUnitDmg.cpp:3031) */
const MON_XP_CAP = 0x7fffffff >> 8;

/**
 * A monster's experience after the level gap (SUnitDmg.cpp:3044-3076). A monster at or below the
 * hero's level gives all of it down to 5 levels below, then 207, 159, 110, 61 and from 10 below
 * 13 256ths. One above gives all up to 5 levels above, then 225, 174, 92, 38 and from 10 above
 * 5 256ths while the hero is below level 25; from 25 on it gives hero level / monster level of it.
 */
export function levelGapXp(monXp: number, heroLevel: number, monLevel: number): number {
  const xp = Math.min(monXp, MON_XP_CAP);
  if (monLevel <= heroLevel) {
    const f = LOWER[Math.min(heroLevel - monLevel, LOWER.length - 1)];
    return f === 256 ? xp : percentOf(xp, f, 256);
  }
  if (heroLevel < D2X_XP_LEVEL_DIFF.ratioFrom) {
    const f = HIGHER[Math.min(monLevel - heroLevel, HIGHER.length - 1)];
    return f === 256 ? xp : percentOf(xp, f, 256);
  }
  return percentOf(xp, heroLevel, monLevel);
}

/**
 * What a hero of `level` keeps of it, ExpRatio (SUnitDmg.cpp:3078-3093): all of it below level 70,
 * then down to 5 1024ths at 99. Past 2^20 (2^21 from level 70) D2 shifts before it multiplies, so
 * there it drops the last 10 bits.
 */
export function ratioXp(xp: number, level: number): number {
  if (xp <= 0) return xp;
  const r = RATIO[level] ?? 0;
  if (xp <= 0x7fffffff >> (RATIO_SHIFT + (r >> RATIO_SHIFT))) return Math.floor((xp * r) / (1 << RATIO_SHIFT));
  return r * Math.floor(xp / (1 << RATIO_SHIFT));
}

/**
 * The experience a hero of `heroLevel` gets for killing a monster of `monLevel` worth `monXp`
 * (SUNITDMG_ComputeExperienceGain, SUnitDmg.cpp:3024-3104): none at the top level, the level gap,
 * ExpRatio, then "+X% experience gained" (`addXpPct`, the experience shrine's included) on that.
 * A monster worth nothing gives nothing (SUnitDmg.cpp:2934-2937).
 */
export function killXp(monXp: number, heroLevel: number, monLevel: number, addXpPct = 0): number {
  if (monXp <= 0 || heroLevel >= MAX_LEVEL) return 0;
  const xp = ratioXp(levelGapXp(monXp, heroLevel, monLevel), heroLevel);
  return addXpPct ? xp + percentOf(xp, addXpPct, 100) : xp;
}

/**
 * Experience added to a hero's total (SUNITDMG_AddExperienceForPlayer, SUnitDmg.cpp:3129-3149):
 * kept to MAX_XP; the level follows from the new total. Levelling gives every level's points at once
 * (stats.levelUpPoints) and refills mana, stamina and, if alive, life (PLAYERSTATS_LevelUp,
 * PlayerStats.cpp:75-113). Picking up one's corpse gives its experience back this way too, with no
 * level gap or ExpRatio (PlrModes.cpp:715-722).
 */
export function addXp(xp: number, gained: number): { xp: number; level: number; gained: number } {
  const next = Math.min(xp + gained, MAX_XP);
  return { xp: next, level: levelForXp(next), gained: next - xp };
}
