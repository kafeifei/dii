// The content scope: D2R before the Warlock expansion. The pinned tables already have the Warlock
// class and the content added with it, so it is taken out here; so is what is still ladder-only
// both there and in 2.7 (stillLadderOnly).
// Rows the expansion added carry no string in the D2CE string tables (pinned before it), which is
// how its uniques, sets, runewords and affixes are told apart.
// What it changed in rows that were there before it is read from D2R 2.7 (rows27 in load.mjs).

export const WARLOCK = 'war';
/** the classes the game has: their whole skill trees, and what those summon, are taken */
export const GAME_CLASSES = new Set(['pal', 'sor']);
/** item types the Warlock expansion added: grimoires, its class items, colossal jewels, crafted sunder charms */
export const WARLOCK_TYPES = new Set(['grim', 'warl', 'cjwl', 'csch']);
export const WARLOCK_SETS = new Set(["Bane's Garments", "Horazon's Splendor", "Warlord's Glory"]);
/** skill tabs 21–23 are the Warlock's three */
export const isWarlockTab = (tab) => +tab >= 21 && +tab <= 23;

/** the newest ladder season the tables know */
export function latestSeason(...tables) {
  let s = 0;
  for (const t of tables) for (const r of Object.values(t)) s = Math.max(s, r.firstLadderSeason ?? 0);
  return s;
}
/** ladder-only until a season that has not ended yet (or with no end at all) */
export const ladderOnly = (r, season) => !!r.firstLadderSeason && !(r.lastLadderSeason < season);
/**
 * Left out as ladder-only: ladder-only in the pinned tables and, for a row 2.7 has, in 2.7 too, each
 * against its own tables' latest season (firstLadderSeason/lastLadderSeason). Season 15 made nine old
 * uniques and Angelic Raiment ladder-only, which 2.7 has as ordinary items: they are in, as 2.7 has
 * them. The 2.6 runewords went the other way, ladder-only in 2.7 and ordinary now: in too.
 */
export const stillLadderOnly = (pinned, season, old, season27) => ladderOnly(pinned, season) && (!old || ladderOnly(old, season27));

/**
 * Treasure classes out of scope: the Warlock expansion's (its Worldstone shards, Terrorize
 * consumables and heralds) and the terror zones' (sunder charms and the desecrated classes: the game
 * has no terror zones). The treasure classes come from 2.7, which has none of the expansion's (the
 * 3.x table also wrote its classes into older ones, "Act 3 Worldstone Shard Parent Citem A" in hell's
 * Citem A): an entry naming one is taken out.
 */
export const OUT_OF_SCOPE_TC = /Worldstone|Terrorize|Herald|Sunder|Desecrated/;
