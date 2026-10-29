// The areas of the West overworld (src/world/overworld.ts) this build has a map of: M2a's W line put
// Stony Field and the Burial Grounds in. By levels.txt Id, in order (areas.ts merges this list with
// built-dungeons.ts into BUILT); written as numbers, not areas.ts's names, as areas.ts reads this
// file while it is itself still loading.

/** the camp, Blood Moor, Cold Plains, Stony Field, the Burial Grounds (levels.txt 1, 2, 3, 4, 17) */
export const BUILT_WEST: number[] = [1, 2, 3, 4, 17];
