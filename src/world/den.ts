import type { Difficulty } from '../items/d2/types';
import { DEN_OF_EVIL } from './areas';
import { dungeonLayout } from './dungeons';
import type { Layout } from './levelgen';

/**
 * The Den of Evil (levels.json Id 8, "Act 1 - Cave 1"): one cave level under Blood Moor, its mouth
 * there (overworld.ts DRESS) and its one way out a stair back up to it. D2 makes it a maze of rooms
 * (DrlgType 1; lvlmaze.json Level 8: one room, then its two specials), and so does this: maze.ts as
 * dungeons.ts has it, the three-room L of D2's — the way up (Cave Prev) and Corpsefire's room (Cave
 * Den Of Evil, superuniques.json areaId 8) on two sides of the middle room, no theme rooms, no
 * waypoint (Waypoint 255). A level's seed is its own (src/game/maps.ts levelSeed).
 */
export function generateDen(seed: number, difficulty: Difficulty = 0): Layout {
  return dungeonLayout(DEN_OF_EVIL, seed, difficulty);
}
