// How near the hero must stand to use a thing, as Diablo II tests it when a player clicks one (D2MOO
// source at commit d9d394f, D2Game PLAYER/PlrMsg.cpp:446-640, by the unit the thing is): an object
// (a chest, barrel, shrine, casket, rogue corpse, well, waypoint, town portal, the stash) within two
// subtiles of its edge (UNITS_IsObjectInInteractRange, D2Common Units.cpp:3604-3684); a townsperson,
// a monster unit, within 6 of D2's unit distance (PlrMsg.cpp:494-523); the hero's own body, a player
// unit, within 8 (458-475); a warp tile (the stairs, the cave mouths, the roads on) within 4. All of it
// in D2 subtiles, a quarter of a metre here (src/core/units.ts), each unit at the subtile it stands on.
import { M_PER_SUBTILE } from '../core/units';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_OBJECTS } from '../data/d2x/objects';
import type { P2 } from '../core/math';
import type { ObjKind, WorldObject } from './objects';

/** a position's D2 subtile */
const sub = (v: number) => Math.floor(v / M_PER_SUBTILE);

/** D2's size of a player, x and y (UNITS_GetUnitSizeX: COLLISION_UNIT_SIZE_SMALL, UNITS_GetUnitSizeY: 2; Units.cpp:206-207, 249-250) */
export const PLAYER_SIZE = 2;
/** a warp tile's size (UNITS_GetUnitSizeX of a UNIT_TILE: none, Units.cpp:231-232) */
const TILE_SIZE = 0;

/** D2Common_10399's table for units within 8 subtiles both ways, by dx + 8 × dy (Units.cpp:3702-3712): −1 is no distance at all */
const NEAR = [
  -1, -1, -1, 0, 2, 4, 6, 8,
  -1, -1, 0, 1, 2, 4, 6, 8,
  -1, 0, 0, 2, 3, 5, 7, 8,
  0, 1, 2, 2, 4, 5, 7, 8,
  2, 2, 3, 4, 5, 6, 7, 9,
  4, 4, 5, 5, 6, 7, 8, 9,
  6, 6, 7, 7, 7, 8, 10, 10,
  8, 8, 8, 8, 9, 9, 10, 11,
];

/**
 * D2's distance between two units of x sizes `sa` and `sb` (D2Common_10399, Units.cpp:3700-3797),
 * what the player's clicks on a monster, a player, an item or a tile are measured by: within 8
 * subtiles both ways and both sizes under 4, the table, one less with a size of 3, one more with a size
 * of 1 or none, 0 where the table has none; else each axis's gap less half of each size, then the
 * shorter + 2 × the longer
 */
export function d2UnitDistance(a: P2, sa: number, b: P2, sb: number): number {
  const dx = Math.abs(sub(b.x) - sub(a.x));
  const dy = Math.abs(sub(b.z) - sub(a.z));
  if (dx >= 8 || dy >= 8 || sa >= 4 || sb >= 4) {
    const gap = (sb >>> 1) + (sa >>> 1);
    const x = Math.max(0, dx - gap);
    const y = Math.max(0, dy - gap);
    return x <= y ? x + 2 * y : y + 2 * x;
  }
  let d = NEAR[dx + 8 * dy];
  if (d < 0) return 0;
  if (sa === 3 || sb === 3) d--;
  d = Math.max(0, d);
  if (sa <= 1 || sb <= 1) d++;
  return d;
}

/**
 * Whether a player at `hero` can use an object of `size` subtiles at `at` (UNITS_IsObjectInInteractRange,
 * Units.cpp:3604-3684): no distance between them at all (D2Common_10399 0), or within two subtiles of
 * the object's box, from x − size / 2 for its size (the far side a subtile further out, as D2 counts),
 * but the four corners where both ways are two off (a unit of height 2, the player's, isn't let
 * past them); an object of no size, within one subtile of it.
 */
export function inObjectRange(hero: P2, at: P2, size: readonly [number, number]): boolean {
  const [sx, sy] = size;
  if (d2UnitDistance(hero, PLAYER_SIZE, at, sx) === 0) return true;
  const x1 = sub(hero.x);
  const y1 = sub(hero.z);
  const x = sub(at.x) - Math.trunc(sx / 2);
  const y = sub(at.z) - Math.trunc(sy / 2);
  if (sx < 1 || sy < 1) return x1 >= x - 1 && x1 <= x + 1 && y1 >= y - 1 && y1 <= y + 1;
  if (x1 < x - 2 || x1 > sx + x + 2 || y1 < y - 2 || y1 > sy + y + 2) return false;
  // (PLAYER_SIZE is the player's height too: not over 2, so the corners are cut)
  if (y1 >= y - 1) {
    if (y1 <= sy + y + 1) return true;
    return x1 >= x - 1 && x1 <= sx + x + 1;
  }
  return x1 >= x - 1 && x1 <= sx + x + 1;
}

/**
 * The Objects.txt row a kind of ours stands for when the map gave it none (WorldObject.d2), for its
 * size: a chest as the act's large chest (5), a barrel 7, a casket 6 (3), a rogue's corpse 54, a well
 * the caves' (138), a shrine the wilderness's deer shrine (2), a waypoint the Act 1 one outside (119)
 * or inside (157, a dungeon's), the town portal (59), the stash (267, the Bank)
 */
const ROW_OF: Partial<Record<ObjKind, number>> = { chest: 5, barrel: 7, casket: 3, remains: 54, well: 138, shrine: 2, portal: 59, stash: 267 };
const WAYPOINT_OUT = 119;
const WAYPOINT_IN = 157;

/** an object's D2 size in subtiles: its row's, its kind's stand-in's, or (the rift's obelisk, D2 has none) its own breadth */
export function objectSize(o: WorldObject, indoors = false): [number, number] {
  const row = (o.d2 !== undefined ? D2X_OBJECTS[o.d2] : undefined) ?? D2X_OBJECTS[o.kind === 'waypoint' ? (indoors ? WAYPOINT_IN : WAYPOINT_OUT) : (ROW_OF[o.kind] ?? -1)];
  if (row) return [row.size[0], row.size[1]];
  const n = Math.max(1, Math.round((2 * o.radius) / M_PER_SUBTILE));
  return [n, n];
}

/** the D2 distance a townsperson is used from (PlrMsg.cpp:513: nDistance ≤ 6) */
export const NPC_REACH = 6;
/** a player unit's, the hero's body (PlrMsg.cpp:463: ≤ 8) */
export const BODY_REACH = 8;
/** a warp tile's (PlrMsg.cpp: UNIT_TILE, nDistance > 4 walks on) */
export const TILE_REACH = 4;

/**
 * Whether the hero at `hero` is near enough to use `o`, by D2's test for what it is (the head of this
 * file): an object by its box (inObjectRange, objectSize); a townsperson by D2's unit distance against
 * its MonStats2 size (D2xMonster.size); the hero's body as a player; the stairs, cave mouths and roads on as warp
 * tiles. `indoors`: the map is a dungeon's, whose waypoint is D2's small inside one.
 */
export function inReach(hero: P2, o: WorldObject, indoors = false): boolean {
  switch (o.kind) {
    case 'vendor':
      return d2UnitDistance(hero, PLAYER_SIZE, o.pos, D2X_MONSTERS[o.npcId ?? '']?.size[0] ?? PLAYER_SIZE) <= NPC_REACH;
    case 'corpse':
      return d2UnitDistance(hero, PLAYER_SIZE, o.pos, PLAYER_SIZE) <= BODY_REACH;
    case 'stairs':
    case 'exit':
      return d2UnitDistance(hero, PLAYER_SIZE, o.pos, TILE_SIZE) <= TILE_REACH;
    default:
      return inObjectRange(hero, o.pos, objectSize(o, indoors));
  }
}
