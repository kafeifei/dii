import { monsterLevel } from '../data/monsters';
import { THEMES, WILD_MAPS, dungeonFloor, isWild, themeForFloor } from './levelgen';

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
/** the wilderness outside it */
export const WILD_AREA = 2;
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

/** the area of dungeon floor `floor` (dungeonFloor) */
export function dungeonArea(floor: number): number {
  return DUNGEON_AREAS + floor;
}

/** an area's level, its monsters' and its loot's: normal's, until there are difficulties */
export function areaLevel(a: AreaDef): number {
  return a.alvl[0];
}

/** an area by id; the dungeon's floors are made as they are first asked for, since it has no bottom */
export function areaDef(id: number): AreaDef | undefined {
  const a = AREAS.get(id);
  if (a || id <= DUNGEON_AREAS) return a;
  const f = id - DUNGEON_AREAS;
  return define({ id, key: `floor${f}`, name: `${themeForFloor(f).name} · 第 ${f} 层`, label: `第 ${f} 层`, alvl: alvl(f), kind: 'dungeon', waypoint: true });
}

/** an area by its key (AreaDef.key), as the tools name them: 'camp', 'wild', 'floor3' */
export function areaByKey(key: string): AreaDef | undefined {
  for (const a of AREAS.values()) if (a.key === key) return a;
  const f = /^floor([1-9]\d*)$/.exec(key);
  return f ? areaDef(dungeonArea(+f[1])) : undefined;
}

/** the areas from the camp down, in the order a hero comes to them: the camp, the wilderness, the dungeon's first `floors` floors */
export function areaList(floors: number): AreaDef[] {
  const out: AreaDef[] = [];
  for (let a: AreaDef | undefined = areaDef(CAMP_AREA); a && (a.kind !== 'dungeon' || a.id - DUNGEON_AREAS <= floors); a = nextArea(a)) out.push(a);
  return out;
}

/** the area after `a` on the way from the camp down (the dungeon has no last one); undefined for an area this build lacks */
export function nextArea(a: AreaDef): AreaDef | undefined {
  let depth = depthForArea(a.id);
  if (depth === undefined) return undefined;
  // past every map of it (the wilderness may be several)
  while (areaForDepth(depth).id === a.id) depth++;
  return areaForDepth(depth);
}

/** the area one of today's maps is, by its depth: the camp, the wilderness or a dungeon floor */
export function areaForDepth(depth: number): AreaDef {
  return areaDef(depth <= 0 ? CAMP_AREA : isWild(depth) ? WILD_AREA : dungeonArea(dungeonFloor(depth)))!;
}

/**
 * The depth of today's map an area is, the other way from areaForDepth (a save keeps the area, the
 * game still goes by depth): the wilderness is its first map. Undefined for an area this build lacks
 */
export function depthForArea(id: number): number | undefined {
  if (id === CAMP_AREA) return 0;
  // the first of its maps (isWild), when it has any
  if (id === WILD_AREA) return WILD_MAPS > 0 ? 1 : undefined;
  if (id > DUNGEON_AREAS) return WILD_MAPS + (id - DUNGEON_AREAS);
  return undefined;
}
