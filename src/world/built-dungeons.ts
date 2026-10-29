// The dungeons of the west this build has a map of (src/game/maps.ts DUNGEON_MAKERS makes each, D2's
// maze: src/world/maze.ts). By levels.txt Id, in order (areas.ts merges this list with built-west.ts
// into BUILT); written as numbers, not areas.ts's names, as areas.ts reads this file while it is
// itself still loading. Their ways up lead where levels.json's warps say, each landing beside the way
// down it came by (travel.ts arrival): the Den to Blood Moor, Cave Level 1 to Cold Plains (its mouth
// there is the W line's), Cave Level 2 to Cave Level 1, the Crypt and the Mausoleum to the Burial
// Grounds' two stairways (a way to an area not built is closed: Level, Entrance).

/** the Den of Evil, Cave Levels 1 and 2, the Crypt, the Mausoleum (levels.txt 8, 9, 13, 18, 19) */
export const BUILT_DUNGEONS: number[] = [8, 9, 13, 18, 19];
