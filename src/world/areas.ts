import { D2X_AREAS } from '../data/d2x/areas';
import type { Difficulty } from '../items/d2/types';
import { BUILT_DUNGEONS } from './built-dungeons';
import { BUILT_WEST } from './built-west';
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
  /** a floor of a rift (src/world/rift.ts): the Act 1 area it replays, whose monsters it spawns */
  rift?: RiftSource;
}

/** what a rift floor replays (src/game/spawn.ts spawnArea reads it) */
export interface RiftSource {
  /** the levels.txt id of the Act 1 area: its monsters, superuniques and densities */
  source: number;
  /** its MonDen and MonUMin/MonUMax scaled by this */
  more: number;
  /** superuniques it holds back: the guardian's, which comes when the rift's progress is full */
  withhold: string[];
  /** the guardian's MonStats id, which may come on any floor (src/render/needs.ts fetches its look ahead) */
  guardian: string;
}

/** the camp */
export const CAMP_AREA = 1;
/** the wilderness outside it (Blood Moor) */
export const WILD_AREA = 2;
// the rest of the West overworld (src/world/overworld.ts) and the Den of Evil, by their levels.json Id like the two above
export const COLD_PLAINS = 3;
export const STONY_FIELD = 4;
export const DEN_OF_EVIL = 8;
/** Cold Plains' Cave, its two levels; the Burial Grounds' Crypt and Mausoleum (M2a's dungeons, src/world/dungeons.ts) */
export const CAVE_1 = 9;
/**
 * the Underground Passage's first level, behind Stony Field's cliff (levels.txt 10, Act 1 - Cave 3):
 * defined so its closed mouth names it, not built in M2a
 */
export const UNDERGROUND_PASSAGE = 10;
export const CAVE_2 = 13;
export const BURIAL_GROUNDS = 17;
export const CRYPT = 18;
export const MAUSOLEUM = 19;
/** dungeon floor f is area DUNGEON_AREAS + f */
const DUNGEON_AREAS = 1000;

/** a trial floor's level: floors 1-2 ease in, then two levels a floor (the old dungeon's monster level) */
export function trialLevel(floor: number): number {
  return floor <= 2 ? Math.max(1, floor) : floor * 2 - 2;
}

/** a trial floor's level, the same in every difficulty: it has no levels.json row, and the debug panel picks the floor and the difficulty apart */
function alvl(floor: number): [number, number, number] {
  const m = trialLevel(floor);
  return [m, m, m];
}

/** an Act 1 area's level in normal, nightmare and hell: levels.json MonLvlEx, MonLvlEx(N), MonLvlEx(H) (D2xArea.lvl) */
function d2Alvl(id: number): [number, number, number] {
  return [...d2Row(id).lvl];
}

/** an Act 1 area's levels.json row */
function d2Row(id: number) {
  const row = D2X_AREAS.find((a) => a.id === id);
  if (!row) throw new Error(`no Act 1 area ${id}`);
  return row;
}

/**
 * An Act 1 dungeon as its levels.json row has it: its names from the rename table (tools/d2-names/
 * areas.json, D2X_AREAS name and nameEn), its levels, a waypoint where its Waypoint isn't 255
 */
function d2Dungeon(id: number, key: string): AreaDef {
  const row = d2Row(id);
  return { id, key, name: row.name, en: row.nameEn, alvl: [...row.lvl], kind: 'dungeon', waypoint: row.waypoint !== undefined };
}

const AREAS = new Map<number, AreaDef>();

function define(a: AreaDef): AreaDef {
  AREAS.set(a.id, a);
  return a;
}

// Area levels are levels.json MonLvlEx, MonLvlEx(N) and MonLvlEx(H), the expansion's (MonsterRegion.cpp
// 936-942 reads wMonLvlEx; normal: the camp 0, Blood Moor and the den 1, Cold Plains 2); a Waypoint
// other than 255 there is `waypoint`. The names are line A's rename table (tools/d2-names/areas.json
// name and nameEn, D2X_AREAS), the camp's and Blood Moor's through their themes.
define({ id: CAMP_AREA, key: 'camp', name: THEMES.town.name, en: THEMES.town.en, label: '营地', alvl: d2Alvl(CAMP_AREA), kind: 'town', waypoint: true });
define({ id: WILD_AREA, key: 'wild', name: THEMES.wild.name, en: THEMES.wild.en, alvl: d2Alvl(WILD_AREA), kind: 'outdoor', waypoint: false });
define({ id: COLD_PLAINS, key: 'coldplains', name: '凛寒原野', en: 'Bitterfrost Plains', alvl: d2Alvl(COLD_PLAINS), kind: 'outdoor', waypoint: true });
define({ id: STONY_FIELD, key: 'stonyfield', name: '列石荒野', en: 'Stony Wastes', alvl: d2Alvl(STONY_FIELD), kind: 'outdoor', waypoint: true });
define({ id: DEN_OF_EVIL, key: 'denofevil', name: '邪秽巢穴', en: 'Den of Iniquity', alvl: d2Alvl(DEN_OF_EVIL), kind: 'dungeon', waypoint: false });
define({ id: BURIAL_GROUNDS, key: 'burialgrounds', name: '葬骨荒冢', en: 'Burial Barrows', alvl: d2Alvl(BURIAL_GROUNDS), kind: 'outdoor', waypoint: false });
// M2a's dungeons (docs/M2A-STEP0.md 2.9): their keys go into saves and the sound tables, and so never change
define(d2Dungeon(CAVE_1, 'cave1'));
define(d2Dungeon(CAVE_2, 'cave2'));
define(d2Dungeon(CRYPT, 'crypt'));
define(d2Dungeon(MAUSOLEUM, 'mausoleum'));
// not built (isBuilt): only named, where Stony Field's mouth into it says it isn't open yet (travel.ts tellClosed)
define(d2Dungeon(UNDERGROUND_PASSAGE, 'passage1'));

/**
 * The areas of normal play this build has a map of, by levels.txt Id: the West overworld's
 * (built-west.ts, the W line's) and the dungeons' (built-dungeons.ts, the D line's) together, the
 * west block's ten so far. Read afresh each time, the two lists being theirs
 */
function built(): number[] {
  return [...BUILT_WEST, ...BUILT_DUNGEONS].sort((a, b) => a - b);
}

/** the area of dungeon floor `floor` (dungeonFloor) */
export function dungeonArea(floor: number): number {
  return DUNGEON_AREAS + floor;
}

/** the floor of the trial ground (the endless dungeon, a debug panel's way in) an area is; undefined for any other */
export function trialFloor(id: number): number | undefined {
  return id > DUNGEON_AREAS ? id - DUNGEON_AREAS : undefined;
}

/**
 * An area's level in a difficulty (DATATBLS_GetMonsterLevelInArea): what its chests and barrels drop
 * at (Items.cpp:1636-1646, ObjMode.cpp:3929), and in nightmare and hell its monsters' (src/game/d2/
 * monstats.ts spawnLevel); a trial floor's monsters are at it in every difficulty.
 */
export function areaLevel(a: AreaDef, difficulty: Difficulty = 0): number {
  return a.alvl[difficulty];
}

/** a rift's floor as a rift opens (src/world/rift.ts), in place of the last rift's of that id */
export function defineRiftFloor(a: AreaDef & { rift: RiftSource }): AreaDef {
  return define(a);
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
  return built().includes(id);
}

/** the areas of normal play, by levels.txt Id (the trial ground's floors aren't) */
export function areaList(): AreaDef[] {
  return built().map((id) => areaDef(id)!);
}

/**
 * The waypoints a hero can use of the areas `touched`: the ones this build has (isBuilt), by levels.txt
 * Id as D2's waypoint list has them, the camp's always. What else was touched stays in the save
 */
export function builtWaypoints(touched: readonly number[]): number[] {
  return built().filter((id) => areaDef(id)!.waypoint && (id === CAMP_AREA || touched.includes(id)));
}

/**
 * The area after `a` by levels.txt Id among those this build has, or the trial ground's next floor
 * (it has no bottom); undefined after the last area there is, or for one this build lacks. The debug
 * panel's 下一个: the tools go by the connection graph (routeTo)
 */
export function nextArea(a: AreaDef): AreaDef | undefined {
  const list = built();
  const i = list.indexOf(a.id);
  if (i >= 0) return i + 1 < list.length ? areaDef(list[i + 1]) : undefined;
  const f = trialFloor(a.id);
  return f === undefined ? undefined : areaDef(dungeonArea(f + 1));
}

/**
 * Act 1's connection graph (docs/M2A-STEP0.md 2.9): an area to every one it borders (levels.json
 * WalkableN, walked across) and every one a warp of its leads into (Vis0–7, a cave mouth, a stair),
 * both ways, as either leads to the other
 */
const LINKS = (() => {
  const out = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!out.has(a)) out.set(a, new Set());
    if (!out.has(b)) out.set(b, new Set());
    out.get(a)!.add(b);
    out.get(b)!.add(a);
  };
  for (const r of D2X_AREAS) for (const to of [...(r.walk ?? []), ...(r.warps ?? []).map((w) => w.to)]) link(r.id, to);
  return out;
})();

/** the areas `id` leads to, walked across or through a warp, by Id (LINKS); none for an area off the graph (a trial floor) */
export function areaLinks(id: number): number[] {
  return [...(LINKS.get(id) ?? [])].sort((a, b) => a - b);
}

/**
 * The way from area `from` to area `to` over the areas this build has (isBuilt), each step one area to
 * the next it leads to (areaLinks), the fewest steps, the lower Id first where they tie: [from, …, to];
 * null when there is none that goes only through built areas. From an area to itself, itself
 */
export function routeTo(from: number, to: number): number[] | null {
  if (from === to) return [from];
  const list = built();
  if (!list.includes(from) || !list.includes(to)) return null;
  const back = new Map<number, number>([[from, from]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    for (const n of areaLinks(at)) {
      if (back.has(n) || !list.includes(n)) continue;
      back.set(n, at);
      if (n === to) {
        const way = [to];
        while (way[0] !== from) way.unshift(back.get(way[0])!);
        return way;
      }
      queue.push(n);
    }
  }
  return null;
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
