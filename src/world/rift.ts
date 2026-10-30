import { RNG, type P2 } from '../core/math';
import { D2X_AREAS } from '../data/d2x/areas';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import type { D2xArea } from '../data/d2x/types';
import type { Difficulty } from '../items/d2/types';
import { defineRiftFloor, type AreaDef } from './areas';
import { bfsDistances, generateDungeon, THEMES, type Layout } from './levelgen';
import { generateWild } from './wild';

/**
 * Rifts (docs/RIFT.md): Diablo III's, on Diablo II's rules. A rift is a run of a few random floors,
 * each replaying an Act 1 area: its monsters, their levels and its superuniques, in the difficulty of
 * the rift's tier, denser. Killing fills the rift's progress; full, its guardian comes, the boss of
 * the stretch of the act it replays. The tiers are the act's stretches in its order, normal's eleven,
 * then nightmare's, then hell's: the game's progress replayed, the same for any hero.
 */

/** a stretch of Act 1, one tier a difficulty */
export interface RiftSegment {
  /** a stable code name: what the shared record of cleared tiers keeps (src/game/riftsave.ts) */
  key: string;
  /** the levels.txt ids of the areas it replays, in the order a hero comes to them */
  areas: number[];
  /** its guardian, the stretch's boss: a superunique's SuperUniques.txt key, or a boss's MonStats id */
  guardian: { su?: string; mon?: string };
}

/**
 * Act 1 cut into the stretches a hero clears it in, each ending at its boss: the Den of Evil's, Cold
 * Plains' (its cave on the way), the Burial Grounds' Blood Raven (Bonebreak in the crypt on the way),
 * Stony Field's, the Dark Wood's, the Black Marsh and Tristram's Griswold, the Forgotten Tower's
 * Countess (the Pit by Tamoe Highland with her), the monastery's Smith, the Jail's, the Cathedral's
 * and the Catacombs' Andariel
 */
export const RIFT_SEGMENTS: readonly RiftSegment[] = [
  { key: 'moor', areas: [2, 8], guardian: { su: 'Corpsefire' } },
  { key: 'plains', areas: [3, 9, 13], guardian: { su: 'Bishibosh' } },
  { key: 'barrows', areas: [17, 18, 19], guardian: { mon: 'bloodraven' } },
  { key: 'stony', areas: [4, 10, 14], guardian: { su: 'Rakanishu' } },
  { key: 'wood', areas: [5, 11, 15], guardian: { su: 'Treehead WoodFist' } },
  { key: 'marsh', areas: [6, 38], guardian: { su: 'Griswold' } },
  { key: 'tower', areas: [12, 16, 21, 22, 23, 24, 25], guardian: { su: 'The Countess' } },
  { key: 'monastery', areas: [7, 26, 27, 28], guardian: { su: 'The Smith' } },
  { key: 'jail', areas: [29, 30, 31], guardian: { su: 'Pitspawn Fouldog' } },
  { key: 'cathedral', areas: [32, 33], guardian: { su: 'Boneash' } },
  { key: 'catacombs', areas: [34, 35, 36, 37], guardian: { mon: 'andariel' } },
];

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { 0: '普通', 1: '噩梦', 2: '地狱' };
const DIFFICULTY_KEYS: Record<Difficulty, string> = { 0: 'n', 1: 'nm', 2: 'h' };

/** a tier: a stretch of the act in a difficulty */
export interface RiftTier {
  /** 1 on: normal's stretches, then nightmare's, then hell's */
  n: number;
  difficulty: Difficulty;
  segment: RiftSegment;
  /** what the shared record keeps once it is cleared: its difficulty and its stretch, not its number, so tiers added later shift none */
  key: string;
}

/** every tier, in order */
export const RIFT_TIERS: readonly RiftTier[] = ([0, 1, 2] as Difficulty[]).flatMap((difficulty) =>
  RIFT_SEGMENTS.map((segment, i) => ({ n: difficulty * RIFT_SEGMENTS.length + i + 1, difficulty, segment, key: `${DIFFICULTY_KEYS[difficulty]}:${segment.key}` })),
);

/**
 * The tiers open with `cleared` (the keys of those whose guardian has died): the first, and each up
 * to one past the furthest cleared. By the furthest, not tier by tier, so a tier added before it
 * later is open too
 */
export function openTiers(cleared: ReadonlySet<string>): number {
  let last = 0;
  for (const t of RIFT_TIERS) if (cleared.has(t.key)) last = t.n;
  return Math.min(RIFT_TIERS.length, last + 1);
}

const ROWS = new Map<number, D2xArea>(D2X_AREAS.map((a) => [a.id, a]));

/** an Act 1 area's levels.txt row */
export function areaRow(id: number): D2xArea {
  const row = ROWS.get(id);
  if (!row) throw new Error(`no Act 1 area ${id}`);
  return row;
}

/** what a tier's guardian is called: the rename table's name of its superunique or its monster */
export function guardianName(t: RiftTier): string {
  const g = t.segment.guardian;
  if (g.su) return D2X_SUPERUNIQUES.find((s) => s.key === g.su)?.name ?? g.su;
  return D2X_MONSTERS[g.mon ?? '']?.name ?? g.mon ?? '?';
}

/** a tier's guardian's MonStats row id: its superunique's monster, or the boss */
export function guardianMonster(t: RiftTier): string {
  const g = t.segment.guardian;
  return (g.su ? D2X_SUPERUNIQUES.find((s) => s.key === g.su)?.mon : g.mon) ?? '';
}

/** what a tier is called: 第 N 层, its difficulty and the stretch it replays, by the first area's name */
export function tierLabel(t: RiftTier): string {
  return `第 ${t.n} 层 · ${DIFFICULTY_NAMES[t.difficulty]} · ${areaRow(t.segment.areas[0]).name}`;
}

/** the areas a rift's floors are: RIFT_AREA + 1 for its first floor on (under the trial ground's 1000 and up) */
export const RIFT_AREA = 900;
/** how many floors a rift has at most */
export const RIFT_MAX_FLOORS = 4;
/** a rift's MonDen and elite packs against the area's (src/game/spawn.ts riftRegion): Diablo III's are denser; approximate */
export const RIFT_DENSITY = 1.5;

/** whether area `id` is a rift's floor */
export function isRiftArea(id: number): boolean {
  return id > RIFT_AREA && id <= RIFT_AREA + RIFT_MAX_FLOORS;
}

/**
 * The Act 1 areas a rift of tier `t` replays, floor by floor: two to four of its stretch's (each
 * once while there are enough), in the order a hero comes to them
 */
export function riftPlan(t: RiftTier, rng: RNG): number[] {
  const all = t.segment.areas;
  const floors = rng.int(2, Math.min(RIFT_MAX_FLOORS, Math.max(2, all.length)));
  const pool = [...all];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = Array.from({ length: floors }, (_, i) => pool[i % pool.length]);
  return picked.sort((a, b) => all.indexOf(a) - all.indexOf(b));
}

/** a rift floor's area: the one it replays, at its levels, named for the rift */
export function riftFloorArea(t: RiftTier, floor: number, source: number): AreaDef {
  const row = areaRow(source);
  return defineRiftFloor({
    id: RIFT_AREA + floor,
    key: `rift${floor}`,
    name: `秘境 · ${row.name}`,
    en: `Rift · ${row.nameEn}`,
    label: `秘境 ${t.n} 层`,
    alvl: [...row.lvl],
    kind: outdoor(row) ? 'outdoor' : 'dungeon',
    waypoint: false,
    rift: { source, more: RIFT_DENSITY, withhold: t.segment.guardian.su ? [t.segment.guardian.su] : [], guardian: guardianMonster(t) },
  });
}

/**
 * Whether an area is under the sky: the wilderness's tile set (LvlTypes 2) and Tristram's (11). The
 * monastery's courtyards are, in D2, but this game has no look for them yet: they borrow the crypt's
 */
function outdoor(row: D2xArea): boolean {
  return row.levelType === 2 || row.levelType === 11;
}

/**
 * A rift floor's map: its layout, with none of the ways of the map it was made as (the rift sets its
 * own: src/game/rift.ts), and where those ways go
 */
export interface RiftFloorMap {
  layout: Layout;
  /** where the way on to the next floor goes: the source's own way down, else the map's far end */
  down: P2;
  /** into the map from the way on, where someone coming back up it stands; without it, from it towards the start */
  downIn?: P2;
  /** where the way back stands (home from the first floor, up from the others) and into the map from it; without it, a step behind the start */
  up?: { pos: P2; inward: P2 };
}

/**
 * The map of a rift's floor `area` replaying area `source` where the game has no maze for it yet
 * (src/game/rift.ts riftFloorMap): a wilderness map for the areas under the sky, else a dungeon of
 * the trial ground's kind in the caves' look or the crypts' (the monastery's, the jail's, the
 * cathedral's and the catacombs' borrow the crypts' until they have their own). No waypoint, no way
 * on of the old maps': the rift sets its own. `down` is where the way to the next floor goes, the
 * map's far end
 */
export function riftFloorLayout(area: AreaDef, source: number, seed: number): RiftFloorMap {
  const row = areaRow(source);
  const L = outdoor(row) ? generateWild(seed) : generateDungeon(6, seed, area.id, row.levelType === 3 ? THEMES.cave : THEMES.crypt);
  const down = L.stairs ?? L.start;
  const layout: Layout = {
    ...L,
    stairs: undefined,
    waypoints: [],
    exits: [],
    entrances: [],
    superUniques: [],
    bossRoom: undefined,
    areaOf: new Uint16Array(L.map.w * L.map.h).fill(area.id),
  };
  return { layout, down };
}

/**
 * A rift's floor `area` on `maze`, the map the game grows its source dungeon as (src/world/maze.ts by
 * src/game/maps.ts DUNGEON_MAKERS), from the floor's own seed in the tier's difficulty: its rooms,
 * its look and light (a cave's none but the hero's, a crypt's torches), D2's objects in it (the
 * Layout's chests, barrels, shrines, caskets, rogue corpses, wells) and its superunique's room, all
 * the area's tiles the floor's. Its ways up and down are the rift's: the way back stands where the
 * dungeon's way up does, the way on where its way down does (Cave Level 1's), else at its far end
 * (farEnd). The maze keeps only the floor the way in reaches (maze.ts), so every tile of it is walked
 * to from the start
 */
export function riftMazeFloor(area: AreaDef, maze: Layout): RiftFloorMap {
  const up = maze.entrances?.find((e) => e.kind === 'up');
  const on = maze.entrances?.find((e) => e.kind === 'cave');
  const layout: Layout = {
    ...maze,
    stairs: undefined,
    waypoints: [],
    exits: [],
    entrances: [],
    presetMonsters: [],
    presets: maze.presets?.map((p) => ({ ...p, area: area.id })),
    areaOf: new Uint16Array(maze.map.w * maze.map.h).fill(area.id),
  };
  const far = on ? null : farEnd(layout);
  return {
    layout,
    down: on ? { x: on.x, z: on.z } : far!.pos,
    downIn: on ? { x: on.nx, z: on.nz } : far!.inward,
    up: up && { pos: { x: up.x, z: up.z }, inward: { x: up.nx, z: up.nz } },
  };
}

/** a tile's four neighbours, as a walk steps */
const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Where a maze floor with no way down of its own has its far end (docs/RIFT.md: the way on at each
 * floor's far end): the tile farthest from the start by walk with open floor all round it and none
 * of the floor's objects or its superunique on it or the tiles round it, so the way on stands in the
 * open; and into the map from it, back along the walk
 */
function farEnd(L: Layout): { pos: P2; inward: P2 } {
  const map = L.map;
  const walk = bfsDistances(map, L.start);
  const things: P2[] = [
    ...L.chests,
    ...L.barrels,
    ...(L.shrines ?? []),
    ...[...(L.caskets ?? []), ...(L.remains ?? []), ...(L.wells ?? [])].map((o) => o.pos),
    ...(L.superUniques ?? []).map((u) => u.pos),
  ];
  const open = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!map.walkable(x + dx, y + dy)) return false;
    return !things.some((t) => Math.abs(t.x - (x + 0.5)) < 1.5 && Math.abs(t.z - (y + 0.5)) < 1.5);
  };
  let best = -1;
  let anyBest = -1;
  for (let i = 0; i < walk.length; i++) {
    if (walk[i] < 0) continue;
    if (anyBest < 0 || walk[i] > walk[anyBest]) anyBest = i;
    if ((best < 0 || walk[i] > walk[best]) && open(i % map.w, (i / map.w) | 0)) best = i;
  }
  const at = best >= 0 ? best : anyBest;
  const pos = { x: (at % map.w) + 0.5, z: ((at / map.w) | 0) + 0.5 };
  // a few tiles back towards the start, each a step nearer by the walk
  let cx = at % map.w;
  let cy = (at / map.w) | 0;
  for (let k = 0; k < 4; k++) {
    const d = walk[cy * map.w + cx];
    const step = STEPS.find(([sx, sy]) => map.walkable(cx + sx, cy + sy) && walk[(cy + sy) * map.w + cx + sx] === d - 1);
    if (d <= 0 || !step) break;
    cx += step[0];
    cy += step[1];
  }
  const dx = cx + 0.5 - pos.x;
  const dz = cy + 0.5 - pos.z;
  const len = Math.hypot(dx, dz);
  return { pos, inward: len ? { x: dx / len, z: dz / len } : { x: 0, z: 1 } };
}
