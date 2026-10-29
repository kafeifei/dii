// The dungeons of the west this build has a map of (src/game/maps.ts DUNGEON_MAKERS makes each): M2a's
// D line adds the Cave's two levels, the Crypt and the Mausoleum here as it builds them. By
// levels.txt Id, in order (areas.ts merges this list with built-west.ts into BUILT); written as
// numbers, not areas.ts's names, as areas.ts reads this file while it is itself still loading.

/** the Den of Evil (levels.txt 8) */
export const BUILT_DUNGEONS: number[] = [8];
