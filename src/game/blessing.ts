// A Diablo II shrine's blessing on the hero (D2MOO source/D2Game/src/OBJECTS/ObjMode.cpp at commit
// d9d394f): which boon it is and what it adds to the hero's stats while it lasts, by Shrines.txt
// (src/data/d2x/shrines.ts). Only the tables: touching a shrine is src/game/shrines.ts's.
import { D2X_SHRINES, type D2xShrine } from '../data/d2x/shrines';
import type { StatKey } from '../data/stats';
import type { Player } from './player';

/**
 * A shrine's blessing on the hero: a boon's state, held in the one curse slot D2 gives a unit (the
 * shrine states are curses, States.txt curse; sub_6FD10EC0, D2Game Skills.cpp:1289-1345, frees the
 * unit's curse stat list for a new one), so a new shrine's replaces it, a monster's curse ends it and
 * it ends a curse. It ends at death (States.txt plrstaydeath: none of the shrine states; D2Common_10469,
 * D2StatList.cpp:1945-1970, from PlrModes.cpp:755) and is never saved, as D2 saves no states.
 */
export interface Blessing {
  /** its shrine, Shrines.txt Code: 6–15 */
  code: number;
  /** seconds left */
  left: number;
  /** a combat shrine's attack rating, worked out as it was touched (D2GAME_SHRINES_CombatBoost, ObjMode.cpp:2171-2191) */
  ar?: number;
}

/** what a blessing adds to the hero's stats (Player.recalc) */
export interface BlessingBonus {
  stats: Partial<Record<StatKey, number>>;
  /** % more defense (skill_armor_percent): no item gives it */
  defPct: number;
  /** % more experience (item_addexperience), on top of the items' */
  xpPct: number;
}

/**
 * A boon's stat on the hero, by its Code, as its handler sets it (the table, ObjMode.cpp:2150-2159;
 * D2GAME_SHRINES_DefensiveBoost 2307-2331, CombatBoost 2171-2191, Stamina 2275-2297, SkillBoost
 * 2334-2349), Arg0 and Arg1 its numbers:
 * - 6 armor: skill_armor_percent +Arg0 (OBJMODE_CalculateShrineStatBonus takes it as it is, 2256-2258);
 * - 7 combat: tohit, the attack rating worked out as it was touched (Blessing.ar), and damagepercent +Arg1;
 * - 8–11 resist fire, cold, lightning, poison: that resistance +Arg0;
 * - 12 skill: +2 to every skill (SKILLS_GetBonusSkillLevel, D2Skills.cpp:1936-1941, by the state; Arg0 is 2);
 * - 13 mana recharge: manarecoverybonus +Arg0 %;
 * - 14 stamina: staminarecoverybonus +1000 (2296), so stamina comes back faster than running spends it
 *   (stats.ts staminaRegenPerSec); its skill_staminapercent is Arg0 × the hero's own of it (none) / 100
 *   (the default case, 2269-2270), so nothing, and its stamina 2 × that;
 * - 15 experience: item_addexperience +Arg0.
 */
export function blessingBonus(b: Blessing | null | undefined): BlessingBonus {
  const out: BlessingBonus = { stats: {}, defPct: 0, xpPct: 0 };
  const s = b ? D2X_SHRINES[b.code] : undefined;
  if (!b || !s) return out;
  const RES: Partial<Record<number, StatKey>> = { 8: 'resFire', 9: 'resCold', 10: 'resLight', 11: 'resPoison' };
  switch (b.code) {
    case 6:
      out.defPct = s.arg0;
      break;
    case 7:
      out.stats.ar = b.ar ?? 0;
      out.stats.dmgPctGlobal = s.arg1;
      break;
    case 12:
      out.stats.skillsAll = SKILL_SHRINE_LEVELS;
      break;
    case 13:
      out.stats.manaRegen = s.arg0;
      break;
    case 14:
      out.stats.staminaRegen = STAMINA_SHRINE_RECOVERY;
      break;
    case 15:
      out.xpPct = s.arg0;
      break;
    default:
      if (RES[b.code]) out.stats[RES[b.code]!] = s.arg0;
  }
  return out;
}
/** the skill shrine's levels, D2's own number for it (D2Skills.cpp:1913-1921, 1936-1941) */
export const SKILL_SHRINE_LEVELS = 2;
/** the stamina shrine's staminarecoverybonus (ObjMode.cpp:2296) */
const STAMINA_SHRINE_RECOVERY = 1000;

/** a blessing over: the stamina shrine's leaves stamina full (OBJMODE_RemoveStaminaShrine, ObjMode.cpp:2300-2304) */
export function endBlessing(p: Player) {
  const b = p.shrine;
  if (!b) return;
  p.shrine = null;
  p.markDirty();
  if (b.code === 14) p.stamina = p.stats.maxStamina;
}

/** a shrine's row (Shrines.txt) */
export const shrineRow = (code: number | undefined): D2xShrine | undefined => (code === undefined ? undefined : D2X_SHRINES[code]);

/** what a shrine of kind `code` is called, ours (the rename table's), when hovered and touched */
export const shrineName = (code: number | undefined): string => shrineRow(code)?.name ?? '';

/** each kind's glow and the colour of what it says: the game's own, by what it does */
export function shrineColor(code: number | undefined): string {
  const c = code ?? 0;
  if (c === 1) return '#ff7a8a';
  if (c === 2) return '#ff5a5a';
  if (c === 3 || c === 13) return '#5a7aff';
  if (c === 6) return '#c8d0e0';
  if (c === 7) return '#ff8a4a';
  if (c >= 8 && c <= 11) return ['#ff6a3a', '#7ad0ff', '#ffe060', '#6aff7a'][c - 8];
  if (c === 12) return '#8aa8ff';
  if (c === 14) return '#e0c070';
  if (c === 15) return '#ffd24a';
  return '#c070ff';
}
