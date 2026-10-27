import { monsterLevel } from '../data/monsters';
import { THEMES, WILD_MAPS, dungeonFloor, isWild, themeForFloor } from './levelgen';

/**
 * Areas: the named places of the world, Diablo II's levels.txt rows. An area has a level (its
 * monsters' and its loot's), a kind and maybe a waypoint. The West overworld holds several side by
 * side, tile by tile (Level.areaAt); a dungeon, the Den of Evil or a floor of the trial ground, is a
 * map of its own.
 */

export type AreaKind = 'town' | 'outdoor' | 'dungeon';

export interface AreaDef {
  id: number;
  /** a stable code name, for sounds, music and saves */
  key: string;
  /** what its banner says on the way in */
  name: string;
  /** its name in English */
  en: string;
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
// the rest of the West overworld (src/world/overworld.ts) and the Den of Evil, by their levels.json Id like the two above
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

// Area levels are levels.json MonLvlEx (normal), repeated until there are difficulties; a Waypoint
// other than 255 there is `waypoint`. The names are line A's rename table (tools/d2-names/areas.json)
// with the English the user approved; Stony Field's and the Burial Grounds' English are ours until
// the table has theirs. The camp and Blood Moor are as hard as the endless dungeon's first floor was.
define({ id: CAMP_AREA, key: 'camp', name: THEMES.town.name, en: THEMES.town.en, label: '营地', alvl: [0, 0, 0], kind: 'town', waypoint: true });
define({ id: WILD_AREA, key: 'wild', name: THEMES.wild.name, en: THEMES.wild.en, alvl: alvl(1), kind: 'outdoor', waypoint: false });
define({ id: COLD_PLAINS, key: 'coldplains', name: '凛寒原野', en: 'Bitterfrost Wilds', alvl: [2, 2, 2], kind: 'outdoor', waypoint: true });
define({ id: STONY_FIELD, key: 'stonyfield', name: '列石荒野', en: 'Cairnstone Waste', alvl: [4, 4, 4], kind: 'outdoor', waypoint: true });
define({ id: DEN_OF_EVIL, key: 'denofevil', name: '邪秽巢穴', en: 'Festering Lair', alvl: [1, 1, 1], kind: 'dungeon', waypoint: false });
define({ id: BURIAL_GROUNDS, key: 'burialgrounds', name: '葬骨荒冢', en: 'Bonewake Barrows', alvl: [3, 3, 3], kind: 'outdoor', waypoint: false });

/**
 * The areas of normal play this build has a map of, in the order a hero comes to them: the camp,
 * Blood Moor, its Den of Evil, Cold Plains. Stony Field and the Burial Grounds join as they are built.
 */
const BUILT = [CAMP_AREA, WILD_AREA, DEN_OF_EVIL, COLD_PLAINS];

/** the area of dungeon floor `floor` (dungeonFloor) */
export function dungeonArea(floor: number): number {
  return DUNGEON_AREAS + floor;
}

/** the floor of the trial ground (the endless dungeon, a debug panel's way in) an area is; undefined for any other */
export function trialFloor(id: number): number | undefined {
  return id > DUNGEON_AREAS ? id - DUNGEON_AREAS : undefined;
}

/** an area's level, its monsters' and its loot's: normal's, until there are difficulties */
export function areaLevel(a: AreaDef): number {
  return a.alvl[0];
}

/** an area by id; the dungeon's floors are made as they are first asked for, since it has no bottom */
export function areaDef(id: number): AreaDef | undefined {
  const a = AREAS.get(id);
  const f = trialFloor(id);
  if (a || f === undefined) return a;
  const t = themeForFloor(f);
  return define({ id, key: `floor${f}`, name: `${t.name} · 第 ${f} 层`, en: `${t.en} · Level ${f}`, label: `第 ${f} 层`, alvl: alvl(f), kind: 'dungeon', waypoint: true });
}

/** an area by its key (AreaDef.key), as the tools name them: 'camp', 'wild', 'floor3' */
export function areaByKey(key: string): AreaDef | undefined {
  for (const a of AREAS.values()) if (a.key === key) return a;
  const f = /^floor([1-9]\d*)$/.exec(key);
  return f ? areaDef(dungeonArea(+f[1])) : undefined;
}

/**
 * An area of normal play this build has a map of: what a save resumes in and what the waypoint list
 * may show. Worked out as a save loads (plan B 区域结构), so a save needs no migration as areas come.
 */
export function isBuilt(id: number): boolean {
  return BUILT.includes(id);
}

/** the areas of normal play, in the order a hero comes to them (the trial ground's floors aren't) */
export function areaList(): AreaDef[] {
  return BUILT.map((id) => areaDef(id)!);
}

/**
 * The waypoints a hero can use of the areas `touched`: the ones this build has (isBuilt), in the
 * order a hero comes to them, the camp's always. What else was touched stays in the save
 */
export function builtWaypoints(touched: readonly number[]): number[] {
  return BUILT.filter((id) => areaDef(id)!.waypoint && (id === CAMP_AREA || touched.includes(id)));
}

/**
 * The area after `a` in the order a hero comes to them, or the trial ground's next floor (it has no
 * bottom); undefined after the last area there is, or for one this build lacks
 */
export function nextArea(a: AreaDef): AreaDef | undefined {
  const i = BUILT.indexOf(a.id);
  if (i >= 0) return i + 1 < BUILT.length ? areaDef(BUILT[i + 1]) : undefined;
  const f = trialFloor(a.id);
  return f === undefined ? undefined : areaDef(dungeonArea(f + 1));
}

/**
 * The area one of the old maps is, by its depth (src/world/levelgen.ts): the separate camp (only
 * ?gallery's now), the old wilderness, or a floor of the trial ground
 */
export function areaForDepth(depth: number): AreaDef {
  return areaDef(depth <= 0 ? CAMP_AREA : isWild(depth) ? WILD_AREA : dungeonArea(dungeonFloor(depth)))!;
}

/**
 * The depth of the old map an area is, the other way from areaForDepth (old saves went by depth):
 * the wilderness is its first map. Undefined for an area with no old map
 */
export function depthForArea(id: number): number | undefined {
  if (id === CAMP_AREA) return 0;
  // the first of its maps (isWild), when it has any
  if (id === WILD_AREA) return WILD_MAPS > 0 ? 1 : undefined;
  const f = trialFloor(id);
  return f === undefined ? undefined : WILD_MAPS + f;
}
