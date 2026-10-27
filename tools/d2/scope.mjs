// The content scope: D2R before the Warlock expansion. The pinned tables already have the Warlock
// class and the content added with it, so it is taken out here; so is what is still ladder-only.
// Rows the expansion added carry no string in the D2CE string tables (pinned before it), which is
// how its uniques, sets, runewords and affixes are told apart.

export const WARLOCK = 'war';
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
