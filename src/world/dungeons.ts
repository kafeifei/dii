import { D2X_AREAS, D2X_WARPS } from '../data/d2x/areas';
import { D2X_MAZES } from '../data/d2x/maze';
import type { Difficulty } from '../items/d2/types';
import { DEN_OF_EVIL } from './areas';
import { THEMES } from './levelgen';
import { generateMaze, type MazeResult, type MazeSpec, type MazeSpecial, type MazeStyle } from './maze';

/**
 * The west block's dungeons (dungeons.md 3.1): the Den of Evil under Blood Moor, Cave Levels 1 and 2
 * under Cold Plains, the Crypt and the Mausoleum under the Burial Grounds, each made by maze.ts as
 * D2 makes it. What leads where is the areas' own (D2xArea.warps), which superunique waits in a
 * boss room too (D2xArea.superuniques); a special room's presets are lvlprest.json's.
 */

// levels.json Ids (DEN_OF_EVIL is areas.ts's)
const CAVE_LEVEL_1 = 9;
const CAVE_LEVEL_2 = 13;
const CRYPT = 18;
const MAUSOLEUM = 19;
/** the lvlwarp.json rows the ways in and out stand on (D2X_WARPS): 4 Act 1 Cave Up, 5 Act 1 Cave Down, 8 Act 1 Crypt Up */
const CAVE_UP = 4;
const CAVE_DOWN = 5;
const CRYPT_UP = 8;
/**
 * The chests the chest rooms hold (Objects.txt): 580 PlaceUniqueChest, Cave Level 2's; 397, the sparkly
 * chest of the Mausoleum's Crypt*Consol.ds1 (decisions: 石窟二层用 580 闪光规则，安魂陵用 397 规则)
 */
const UNIQUE_CHEST = 580;
const CONSOLATION_CHEST = 397;
/** Cave Level 2's one preset (lvlprest.json Def 104 "Act 1 - Cave Treasure 2"): its Def is the seed its hall is carved from */
const CAVE_TREASURE_2 = 104;

const ROWS = new Map(D2X_AREAS.map((a) => [a.id, a]));

/** where area `id`'s warp on lvlwarp row `tile` leads */
function warpTo(id: number, tile: number): number {
  const w = ROWS.get(id)?.warps?.find((x) => x.tiles.includes(tile));
  if (!w) throw new Error(`area ${id} has no ${D2X_WARPS[tile]?.name ?? `warp ${tile}`}`);
  return w.to;
}

/** the superunique waiting in area `id` (D2xArea.superuniques: Corpsefire, Coldcrow, Bonebreak by their keys) */
function bossOf(id: number): string {
  const su = ROWS.get(id)?.superuniques?.[0];
  if (!su) throw new Error(`area ${id} has no superunique`);
  return su;
}

export interface DungeonDef {
  area: number;
  style: MazeStyle;
  /** in DRLGMAZE_GenerateLevel's order (DrlgMaze.cpp:498-557) */
  specials: MazeSpecial[];
  themes: boolean;
  fixed?: number;
}

/**
 * Each dungeon's specials, their lvlprest Defs (the west-opening one's; E, S, N follow) and Files:
 * - the Den of Evil: Prev 83 (2 files), then Corpsefire's Den Of Evil room 95 (1) (DrlgMaze.cpp:498-504); no theme rooms (3158-3161);
 * - Cave Level 1: Prev 83 (2), Down 91 (2), Coldcrow's 99 (1) (498-513);
 * - Cave Level 2: one preset map (Levels.txt DrlgType 2), its way up and its chest;
 * - the Crypt: Prev 139 (1), Bonebreak's 147 (1) (540-548);
 * - the Mausoleum: Prev 139 (1), the Crypt Chest room 151 (1) (550-557).
 */
export const DUNGEONS: Record<number, DungeonDef> = {
  [DEN_OF_EVIL]: {
    area: DEN_OF_EVIL,
    style: 'cave',
    themes: false,
    specials: [
      { kind: 'up', dest: warpTo(DEN_OF_EVIL, CAVE_UP), preset: 83, files: 2 },
      { kind: 'boss', superUnique: bossOf(DEN_OF_EVIL), preset: 95, files: 1 },
    ],
  },
  [CAVE_LEVEL_1]: {
    area: CAVE_LEVEL_1,
    style: 'cave',
    themes: true,
    specials: [
      { kind: 'up', dest: warpTo(CAVE_LEVEL_1, CAVE_UP), preset: 83, files: 2 },
      { kind: 'down', dest: warpTo(CAVE_LEVEL_1, CAVE_DOWN), preset: 91, files: 2 },
      { kind: 'boss', superUnique: bossOf(CAVE_LEVEL_1), preset: 99, files: 1 },
    ],
  },
  [CAVE_LEVEL_2]: {
    area: CAVE_LEVEL_2,
    style: 'cave',
    themes: false,
    fixed: CAVE_TREASURE_2,
    specials: [
      { kind: 'up', dest: warpTo(CAVE_LEVEL_2, CAVE_UP) },
      { kind: 'treasure', chest: UNIQUE_CHEST },
    ],
  },
  [CRYPT]: {
    area: CRYPT,
    style: 'crypt',
    themes: true,
    specials: [
      { kind: 'up', dest: warpTo(CRYPT, CRYPT_UP), preset: 139, files: 1 },
      { kind: 'boss', superUnique: bossOf(CRYPT), preset: 147, files: 1 },
    ],
  },
  [MAUSOLEUM]: {
    area: MAUSOLEUM,
    style: 'crypt',
    themes: true,
    specials: [
      { kind: 'up', dest: warpTo(MAUSOLEUM, CRYPT_UP), preset: 139, files: 1 },
      { kind: 'treasure', chest: CONSOLATION_CHEST, preset: 151, files: 1 },
    ],
  },
};

/** whether area `id` is one of these dungeons */
export function isDungeon(id: number): boolean {
  return id in DUNGEONS;
}

/** the spec of dungeon `id` for a game's seed and difficulty; it looks like the old dungeons' cave or crypt (levelgen.ts THEMES) */
export function dungeonSpec(id: number, seed: number, difficulty: Difficulty): MazeSpec {
  const d = DUNGEONS[id];
  if (!d || !D2X_MAZES[id]) throw new Error(`area ${id} is not a dungeon`);
  return { ...d, seed, difficulty, theme: d.style === 'cave' ? THEMES.cave : THEMES.crypt };
}

/** dungeon `id` for a game's seed and difficulty (maze.ts generateMaze) */
export function generateDungeonLevel(id: number, seed: number, difficulty: Difficulty): MazeResult {
  return generateMaze(dungeonSpec(id, seed, difficulty));
}
