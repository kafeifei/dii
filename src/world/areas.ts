import { monsterLevel } from '../data/monsters';
import { THEMES, dungeonFloor, isWild, themeForFloor } from './levelgen';

/**
 * Areas: the named places of the world, Diablo II's levels.txt rows. An area has a level (its
 * monsters' and its loot's), a kind and maybe a waypoint. Today each map is one area, every tile of
 * it; the seamless Act 1 map will hold several side by side, tile by tile (Level.areaAt).
 */

export type AreaKind = 'town' | 'outdoor' | 'dungeon';

export interface AreaDef {
  id: number;
  /** a stable code name, for sounds, music and saves */
  key: string;
  /** what its banner says on the way in */
  name: string;
  /** the shorter name the minimap shows, when it has one */
  label?: string;
  /** the area level in normal, nightmare and hell */
  alvl: [number, number, number];
  kind: AreaKind;
  /** it has a waypoint */
  waypoint: boolean;
}

/** the camp */
export const CAMP_AREA = 1;
/** the wilderness outside it (Blood Moor) */
export const WILD_AREA = 2;
// the rest of the West overworld (src/world/overworld.ts), by their levels.json Id like the two above
export const COLD_PLAINS = 3;
export const STONY_FIELD = 4;
export const DEN_OF_EVIL = 8;
export const BURIAL_GROUNDS = 17;
/** dungeon floor f is area DUNGEON_AREAS + f */
const DUNGEON_AREAS = 1000;

/** one difficulty for now: nightmare and hell repeat normal until there are difficulties */
function alvl(floor: number): [number, number, number] {
  const m = monsterLevel(floor);
  return [m, m, m];
}

const AREAS = new Map<number, AreaDef>();

function define(a: AreaDef): AreaDef {
  AREAS.set(a.id, a);
  return a;
}

define({ id: CAMP_AREA, key: 'camp', name: THEMES.town.name, label: '营地', alvl: [0, 0, 0], kind: 'town', waypoint: true });
// as hard as the first floor, and no waypoint: the camp is a walk away
define({ id: WILD_AREA, key: 'wild', name: THEMES.wild.name, alvl: alvl(1), kind: 'outdoor', waypoint: false });
// Area levels are levels.json MonLvlEx (normal), repeated until there are difficulties; a Waypoint
// other than 255 there is `waypoint`. The names are line A's rename table (tools/d2-names/areas.json)
// as it stands, until its import replaces this list.
define({ id: COLD_PLAINS, key: 'coldplains', name: '凛寒原野', alvl: [2, 2, 2], kind: 'outdoor', waypoint: true });
define({ id: STONY_FIELD, key: 'stonyfield', name: '列石荒野', alvl: [4, 4, 4], kind: 'outdoor', waypoint: true });
define({ id: DEN_OF_EVIL, key: 'denofevil', name: '邪秽巢穴', alvl: [1, 1, 1], kind: 'dungeon', waypoint: false });
define({ id: BURIAL_GROUNDS, key: 'burialgrounds', name: '葬骨荒冢', alvl: [3, 3, 3], kind: 'outdoor', waypoint: false });

/** the area of dungeon floor `floor` (dungeonFloor) */
export function dungeonArea(floor: number): number {
  return DUNGEON_AREAS + floor;
}

/** an area by id; the dungeon's floors are made as they are first asked for, since it has no bottom */
export function areaDef(id: number): AreaDef | undefined {
  const a = AREAS.get(id);
  if (a || id <= DUNGEON_AREAS) return a;
  const f = id - DUNGEON_AREAS;
  return define({ id, key: `floor${f}`, name: `${themeForFloor(f).name} · 第 ${f} 层`, label: `第 ${f} 层`, alvl: alvl(f), kind: 'dungeon', waypoint: true });
}

/** the area one of today's maps is, by its depth: the camp, the wilderness or a dungeon floor */
export function areaForDepth(depth: number): AreaDef {
  return areaDef(depth <= 0 ? CAMP_AREA : isWild(depth) ? WILD_AREA : dungeonArea(dungeonFloor(depth)))!;
}
