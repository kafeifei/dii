// What dying costs a Diablo II hero and what the corpse keeps: D2MOO PLAYER_ApplyDeathPenalty
// (Player.cpp:679-795), run as the death starts (PlrModes.cpp:741-749), and the corpse made where the
// hero fell once the death animation ends (D2GAME_CORPSE_Handler, PlrModes.cpp:429-650, called at
// PlrModes.cpp:791-794). Pure functions, nothing wired: Game.killPlayer would apply deathPenalty
// and corpseSplit, drop the gold and leave the corpse; the respawn in town keeps the rest.
// Single player only: the rules for a hero killed by a player or a player's minion (the gold drops
// for the killer, no experience is lost; Player.cpp:690-733, 760-772) and game type 3's (a floor of
// 500 × level, inventory gold only; Player.cpp:707-715) are left out.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import type { D2xDifficulty } from '../../data/d2x/types';
import { difficulty, type DifficultyId } from './stats';
import { MAX_LEVEL, percentOf, xpForLevel } from './xp';

/** the gold lost is the hero's level in %, at most this (Player.cpp:686) */
export const GOLD_LOSS_MAX_PCT = 20;
/** the share of the lost experience the corpse holds, given back to its owner on pickup (PlrModes.cpp:515-517, 715-722) */
export const CORPSE_XP_PCT = 75;
/** corpses D2 keeps for a hero; dying with more drops the gear on the ground instead (PlrModes.cpp:446-489) */
export const MAX_CORPSES = 15;
/** belt boxes with no belt on: belts.txt row 2 "default", numboxes 4 (ItemMode.cpp:2592-2597) */
export const BELTLESS_BOXES = 4;
/** a belt is 4 boxes wide, so with none on only its first row is left */
const BELT_COLUMNS = 4;

/**
 * Gold a death costs (Player.cpp:682-688, 734-758): min(level, 20) % of inventory and stash gold,
 * taken from the inventory first and the stash after. Whatever inventory gold is left falls in a
 * pile where the hero fell (Player.cpp:553-597); the hero carries none away.
 */
export function deathGold(level: number, gold: number, stashGold: number): { lost: number; dropped: number; stashGold: number } {
  const lost = Math.trunc(((gold + stashGold) * Math.min(level, GOLD_LOSS_MAX_PCT)) / 100);
  if (lost > gold) return { lost, dropped: 0, stashGold: gold + stashGold - lost };
  return { lost, dropped: gold - lost, stashGold };
}

/**
 * Experience a death costs (Player.cpp:774-793): the difficulty's DeathExpPenalty % (normal 0,
 * nightmare 5, hell 10) of the current level's span, but never down to the level's start: D2 then
 * sets one point past it and counts the loss as reaching the start (so one more than the drop, and
 * a hero exactly at the start even gains a point). Level 1 loses nothing. At 99 D2 takes the span
 * up to experience.txt's row 99 too, but experience is held at the level's start (xp.MAX_XP), so it
 * counts no loss and sets MAX_XP + 1; that point is dropped here on purpose, to keep experience at
 * most MAX_XP. The product is exact here: D2MOO's int32 math overflows from level 93, where the
 * thresholds pass 2^31.
 */
export function deathXp(level: number, xp: number, diff: D2xDifficulty | DifficultyId | number): { xp: number; lost: number } {
  if (level <= 1 || level >= MAX_LEVEL) return { xp, lost: 0 };
  const pct = (typeof diff === 'object' ? diff : difficulty(diff)).deathXpLoss;
  const start = xpForLevel(level);
  let lost = Math.trunc(((xpForLevel(level + 1) - start) * pct) / 100);
  if (!lost) return { xp, lost: 0 };
  let next = xp - lost;
  if (next <= start) {
    lost = Math.max(0, lost + next - start);
    next = start + 1;
  }
  return { xp: next, lost };
}

export interface DeathIn {
  level: number;
  xp: number;
  /** inventory gold */
  gold: number;
  stashGold: number;
  /** a DifficultyLevels row, its id, or 0 normal, 1 nightmare, 2 hell */
  diff: D2xDifficulty | DifficultyId | number;
}

export interface DeathPenalty {
  /** gold lost (STAT_GOLDLOST), from deathGold */
  goldLost: number;
  /** the inventory gold left, dropped in a pile where the hero fell; inventory gold is now 0 */
  goldDropped: number;
  stashGold: number;
  xp: number;
  /** experience lost as D2 counts it (deathXp) */
  xpLost: number;
  /** experience the corpse holds: CORPSE_XP_PCT % of xpLost, dividing first past 2^20 (PlrModes.cpp:515-517) */
  corpseXp: number;
}

/** everything a hero's death changes, but the gear (corpseSplit) */
export function deathPenalty(o: DeathIn): DeathPenalty {
  const g = deathGold(o.level, o.gold, o.stashGold);
  const x = deathXp(o.level, o.xp, o.diff);
  return {
    goldLost: g.lost,
    goldDropped: g.dropped,
    stashGold: g.stashGold,
    xp: x.xp,
    xpLost: x.lost,
    corpseXp: percentOf(x.lost, CORPSE_XP_PCT, 100),
  };
}

export interface CorpseSplit<S extends string, T> {
  /** every equipped item, D2's 12 body locations with both weapon sets (PlrModes.cpp:525-628) */
  equipment: Partial<Record<S, T>>;
  /** the corpse's inventory: the item on the cursor, body location −1 in the same loop */
  items: T[];
  /** the belt the hero keeps: with the belt on the corpse, only the first row (BELTLESS_BOXES) */
  belt: T[][];
  /** belt potions past the first row, in D2's box order: into the inventory where they fit, else to the ground (ItemMode.cpp:2587-2630) */
  loose: T[];
}

/**
 * What the corpse takes and what the hero keeps. The inventory, cube and stash stay with the hero.
 * `belt` is D2's 4 columns, each bottom (the first row) first.
 */
export function corpseSplit<S extends string, T>(equipment: Partial<Record<S, T>>, belt: T[][], cursor?: T | null): CorpseSplit<S, T> {
  const rows = BELTLESS_BOXES / BELT_COLUMNS;
  const loose: T[] = [];
  const depth = Math.max(0, ...belt.map((col) => col.length));
  for (let r = rows; r < depth; r++) {
    for (const col of belt) if (col[r] !== undefined) loose.push(col[r]);
  }
  return {
    equipment: { ...equipment },
    items: cursor ? [cursor] : [],
    belt: belt.map((col) => col.slice(0, rows)),
    loose,
  };
}
