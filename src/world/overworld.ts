import { RNG, type P2 } from '../core/math';
import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import { BURIAL_GROUNDS, CAMP_AREA, CAVE_1, COLD_PLAINS, CRYPT, DEN_OF_EVIL, MAUSOLEUM, STONY_FIELD, UNDERGROUND_PASSAGE, WILD_AREA } from './areas';
import { BUILT_WEST } from './built-west';
import type { Prop } from './furnish';
import { THEMES, type Decor, type House, type Layout, type Npc, type PresetMonster, type PresetSpot, type Room, type Service, type ShrineSpot, type SuperUnique, type Waypoint } from './levelgen';
import { growWoods } from './outdoors';
import { campPreset } from './presets';
import { TileMap } from './tilemap';
import { CELL, OUT_SCALE, cellsOf, flood, generateZone, type Entrance, type Side, type SightSpec, type Zone, type ZonePort, type ZoneSpec } from './zone';

/**
 * The West overworld: the camp, Blood Moor and Cold Plains side by side on one map, walked across
 * without a loading screen, laid out the way Diablo II lays out Act 1's wilderness
 * (DrlgOutPlace.cpp DRLGOUTPLACE_CreateLevelConnections, gAct1WildernessDrlgLink). The areas go
 * down on a coarse grid of whole cells in D2's order; the openings in the borders between them are
 * fixed next, so both sides of a seam cut theirs in the same place; then each area is made in a
 * map of its own (zone.ts) and copied into the world's, with the area of every tile. Last, a walk
 * from the camp checks that every port, waypoint and entrance can be reached, and makes an area
 * again with its seed + 1 if not. The west block's five areas are all on it (M2a): the camp, Blood
 * Moor, Cold Plains, Stony Field and the Burial Grounds; what's under them (the Den, Cold Plains'
 * Cave, the Crypt, the Mausoleum) and the Underground Passage behind Stony Field's cliff are entered
 * by their mouths, each closed while its map isn't built (the passage's, in M2a).
 *
 * The game is played on it (Game.enterArea): Level takes it as it is, area by area, but the
 * renderer still dresses the map as one area. Still to do:
 * - spawnRooms is a room a cell, as D2's (about 80 in Blood Moor, 110 in Cold Plains). Level.populate's
 *   pack a room is four or five times today's wilderness then (about 380 monsters in Blood Moor and
 *   520 in Cold Plains, where the wilderness has 85), so levels.json MonDen and NumMon want
 *   converting first (plan A4).
 * - about 7.8k props, where the wilderness and the camp have 1.9k and 1.1k today.
 * - the camp's area is D2's 56 tiles wide at OUT_SCALE (72 at 1.25) round a 46-tile camp: 26 tiles
 *   of camp ground past the gate before Blood Moor's name and monsters. And west of the palisade
 *   (north or south too, with the camp at a corner of the map) the woods are MARGIN and a tile or
 *   two deep, where generateTown grew 22: the view mustn't run off the map there.
 */

/** woods past the areas' edges, so the view never runs off the map (wild.ts kept 22 tiles past its land) */
const MARGIN = 2 * CELL;
/** trees grow in the gaps between areas only this near one (docs/M2A.md 地图): the rest is never seen */
const WOODS_REACH = 32;
/** Rakanishu, Stony Field's superunique (superuniques.json, its names the rename table's) */
const RAKANISHU = D2X_SUPERUNIQUES.find((s) => s.key === 'Rakanishu')!;
/** times an area is made again before its world is given up on */
const REROLLS = 12;
/** worlds tried, the seed's and then the next seeds', before the last is taken as it is */
const WORLDS = 4;

type Linker = 'side' | 'moor' | 'town';

interface Link {
  area: number;
  /** levels.json SizeX, SizeY */
  size: [number, number];
  /** the area it's laid against, and how: sub_6FD81380 ('side'), sub_6FD81950 ('moor'), sub_6FD81720 ('town') */
  parent?: number;
  linker?: Linker;
}

/** D2's link table for the Act 1 wilderness, in its order: Stony Field first, each other area against the one it links to */
const WEST: Link[] = [
  { area: STONY_FIELD, size: [80, 80] },
  { area: COLD_PLAINS, size: [80, 80], parent: STONY_FIELD, linker: 'side' },
  { area: WILD_AREA, size: [80, 80], parent: COLD_PLAINS, linker: 'moor' },
  { area: CAMP_AREA, size: [56, 40], parent: WILD_AREA, linker: 'town' },
  { area: BURIAL_GROUNDS, size: [40, 48], parent: COLD_PLAINS, linker: 'side' },
];

/** the areas made (built-west.ts, by levels.txt Id): all of WEST */
export const BUILT = BUILT_WEST;

/**
 * The monsters area `id`'s presets set down that aren't its levels.txt kinds nor its superuniques
 * (Layout.presetMonsters: the Burial Grounds' Blood Raven), by D2X_MONSTERS id: what its prefetch
 * (src/render/needs.ts areaNeeds) brings besides
 */
export function presetMonstersOf(id: number): string[] {
  const g = DRESS[id]?.graveyard;
  return g ? [g.boss.monster] : [];
}

interface Dressing {
  /** a waypoint: with `by`, inside the port to that area, else in a free cell */
  waypoint?: { by?: number };
  /** the dungeon a cave mouth leads into, far from the camp */
  cave?: number;
  /** its sides that are cliffs, not woods, and the area a mouth in the cliff leads into, far from the camp */
  cliffs?: Side[];
  cliffCave?: number;
  stony?: boolean;
  graveyard?: ZoneSpec['graveyard'];
  sightUniques?: ZoneSpec['sightUniques'];
  shrines: number;
  sights: (rng: RNG) => SightSpec[];
}

/**
 * What each area puts in its cells, after D2's DRLGOUTWILD_InitAct1OutdoorLevel: a waypoint in
 * Cold Plains to Black Marsh (DRLGOUTDOORS_SpawnAct12Waypoint), five shrines in Blood Moor to Tamoe
 * Highland (DRLGOUTDOORS_SpawnAct12Shrines(pLevel, 5)), Blood Moor's Den of Evil and Cold Plains' Cave
 * far from the camp (DRLGOUTWILD_SpawnTownTransitionsAndCaves), and each area's own set pieces
 * (DRLGOUTWILD_SpawnSpecialPresets) with our sights for D2's: cottages are ruins, fallen camps
 * monster camps, the stone fills outcrops, and Blood Moor's pond a graveyard, until there's water.
 * Stony Field: cliffs on its north and west (docs/M2A.md 地图), the Underground Passage's mouth in
 * them, its own stony ground, and the Cairn Stones (DrlgOutWild.cpp:491-494) with Rakanishu, whom
 * the cairn's DS1 sets down; its Tower Tome (the same lines) is M2b's, with the quest. Its two stone
 * fills are ours, approximate: the area's rocks. The Burial Grounds: a graveyard filling the inside
 * (DrlgOutWild.cpp:586-588), the Crypt's and the Mausoleum's stairways in it and Blood Raven, whom
 * D2 sets down at its place_bloodraven (MonPreset act 1; D2MOO MonsterRegion.cpp:292-295), the one
 * whose death counts for Sisters' Burial Grounds (docs/M2A.md 怪物)
 */
const DRESS: Record<number, Dressing> = {
  [CAMP_AREA]: { shrines: 0, sights: () => [] },
  [WILD_AREA]: {
    cave: DEN_OF_EVIL,
    shrines: 5,
    sights: (rng) => {
      const s: SightSpec[] = [{ kind: 'graveyard', nearRoad: true }];
      // a second cottage one time in four (!(SEED_RollRandomNumber & 3)), then the first
      if (rng.int(0, 3) === 0) s.push({ kind: 'ruins', nearRoad: true });
      s.push({ kind: 'ruins', nearRoad: true }, { kind: 'stones', nearRoad: false }, { kind: 'stones', nearRoad: false });
      return s;
    },
  },
  [COLD_PLAINS]: {
    waypoint: { by: WILD_AREA },
    cave: CAVE_1,
    shrines: 5,
    sights: (rng) => {
      const s: SightSpec[] = [];
      // three times in four a cottage and half the time another (COTTAGES_2, _3); else two
      if (rng.int(0, 3) !== 0) {
        s.push({ kind: 'ruins', nearRoad: true });
        if (rng.int(0, 1) === 1) s.push({ kind: 'ruins', nearRoad: true });
      } else s.push({ kind: 'ruins', nearRoad: true }, { kind: 'ruins', nearRoad: true });
      // Bishibosh's fallen camp, then the two stone fills
      s.push({ kind: 'camp', nearRoad: false }, { kind: 'stones', nearRoad: false }, { kind: 'stones', nearRoad: false });
      return s;
    },
  },
  [STONY_FIELD]: {
    waypoint: {},
    cliffs: ['n', 'w'],
    cliffCave: UNDERGROUND_PASSAGE,
    stony: true,
    shrines: 5,
    sightUniques: { cairn: { key: RAKANISHU.key, monster: RAKANISHU.mon, name: RAKANISHU.name } },
    sights: () => [{ kind: 'cairn', nearRoad: false }, { kind: 'stones', nearRoad: false }, { kind: 'stones', nearRoad: false }],
  },
  [BURIAL_GROUNDS]: {
    graveyard: { crypt: CRYPT, mausoleum: MAUSOLEUM, boss: { monster: 'bloodraven', quest: 'a1q2' } },
    shrines: 0,
    sights: () => [],
  },
};

interface Box {
  x: number;
  z: number;
  w: number;
  h: number;
}

/** an area laid out, in world tiles; `built` ones are on the map */
export interface AreaBox extends Box {
  area: number;
  built: boolean;
}

interface Placed extends Box {
  /** D2's nRand[0]: the side of its parent it went (0 below, 1 left, 2 above, 3 right) */
  dir: number;
  /** D2's nRand[2]: which end it's flush with (1: sub_6FD81430, 0: sub_6FD81850) */
  alt: number;
}

/** a seam's opening between two built areas: the tile on each side of it */
export interface Seam {
  a: number;
  b: number;
  ta: P2;
  tb: P2;
}

export interface Overworld extends Layout {
  /** the world seed it was made from: the one asked for, or one after it when that world couldn't be finished */
  seed: number;
  /** what the hero can't reach from the camp: empty, unless every world tried had something */
  unreached: { area: number; what: string }[];
  /** the area of every tile, row by row (Level.areas) */
  areaOf: Uint16Array;
  /** cave mouths, and the roads on to areas not built yet, by the area they lead to */
  entrances: Entrance[];
  /** every area of the West laid out, in world tiles */
  boxes: AreaBox[];
  seams: Seam[];
  /** the built areas from the camp outward, the way the road comes to them */
  order: number[];
  /** the seed each built area was made with, after any rerolls */
  seeds: Record<number, number>;
  /** how many times an area was made again */
  rerolls: number;
}

const tilesOf = (d2Tiles: number, scale: number) => cellsOf(d2Tiles, scale) * CELL;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.h && b.z < a.z + a.h;

/**
 * D2's sub_6FD81430 (`first`) and sub_6FD81850: a w×h box against side `dir` of `a`, flush with one
 * end of that side, then moved along it by a4's offset (1: 16 tiles out past the end, 2: 8 in).
 */
function attach(a: Box, w: number, h: number, dir: number, first: boolean, a4: number, scale: number): Box {
  const o16 = tilesOf(16, scale);
  const o8 = tilesOf(8, scale);
  const along = (k1: number, k2: number, k3: number) => (a4 === 1 ? k1 : a4 === 2 ? k2 : a4 === 3 ? k3 : 0);
  if (first) {
    switch (dir) {
      case 0:
        return { x: a.x - along(o16, 0, 0), z: a.z + a.h, w, h };
      case 1:
        return { x: a.x - w, z: a.z + along(-o16, o8, 0), w, h };
      case 2:
        return { x: a.x + a.w - w + along(o16, 0, 0), z: a.z - h, w, h };
      default:
        return { x: a.x + a.w, z: a.z + a.h - h + along(o16, -o8, o8), w, h };
    }
  }
  switch (dir) {
    case 0:
      return { x: a.x + a.w - w + along(o16, 0, 0), z: a.z + a.h, w, h };
    case 1:
      return { x: a.x - w, z: a.z + a.h - h + along(o16, -o8, 0), w, h };
    case 2:
      return { x: a.x - along(o16, 0, 0), z: a.z - h, w, h };
    default:
      return { x: a.x + a.w, z: a.z + along(-o16, o8, -o8), w, h };
  }
}

/** the sides (and flush ends) a linker tries, in D2's order */
function* choices(linker: Linker, rng: RNG): Generator<{ dir: number; alt: number }> {
  if (linker === 'side') {
    // sub_6FD81380: a side at random (rand & 3), then each next one round
    const d0 = rng.int(0, 3);
    for (let k = 0; k < 4; k++) yield { dir: (d0 + k) % 4, alt: 1 };
    return;
  }
  // sub_6FD81950, sub_6FD81720: a side and an end at random (rand & 3, rand & 1), then (d, e) → (d + e, 1 - e), all eight
  let dir = rng.int(0, 3);
  let alt = rng.int(0, 1);
  for (let k = 0; k < 8; k++) {
    yield { dir, alt };
    dir = (dir + alt) % 4;
    alt = 1 - alt;
  }
}

/** the camp's placements D2 allows, by its side and end and Blood Moor's (sub_6FD82050's dword_6FDD05C0) */
const TOWN_OK = [
  1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1,
  0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1,
];

/** where the camp preset sits in the camp's area: against its west edge, in the middle north to south */
function campOrigin(box: { h: number }): P2 {
  return { x: 0, z: Math.floor((box.h - campPreset().h) / 2) };
}

/** the side of `a` that `b` lies against, or null if they don't touch along a side */
function touching(a: Box, b: Box): { side: Side; lo: number; hi: number } | null {
  const zlo = Math.max(a.z, b.z);
  const zhi = Math.min(a.z + a.h, b.z + b.h);
  const xlo = Math.max(a.x, b.x);
  const xhi = Math.min(a.x + a.w, b.x + b.w);
  if (b.x === a.x + a.w && zhi > zlo) return { side: 'e', lo: zlo, hi: zhi };
  if (b.x + b.w === a.x && zhi > zlo) return { side: 'w', lo: zlo, hi: zhi };
  if (b.z === a.z + a.h && xhi > xlo) return { side: 's', lo: xlo, hi: xhi };
  if (b.z + b.h === a.z && xhi > xlo) return { side: 'n', lo: xlo, hi: xhi };
  return null;
}

const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };

/**
 * Where the opening between a linked pair is, along the side `a` has against `b`, in world tiles:
 * the middle cell of the stretch they share (DRLGOUTPLACE_PlaceAct1245OutdoorBorders: nX = min +
 * |dx| * nDiff / 2); the camp's is its gate. Null if that cell would be a corner of either, which
 * holds a corner of the border rather than an opening.
 */
function seamAt(aArea: number, a: Box, bArea: number, b: Box): { side: Side; at: number } | null {
  const t = touching(a, b);
  if (!t) return null;
  let at = t.lo + Math.floor((t.hi - t.lo) / CELL / 2) * CELL + CELL / 2;
  if (aArea === CAMP_AREA || bArea === CAMP_AREA) {
    const camp = aArea === CAMP_AREA ? a : b;
    at = camp.z + campOrigin(camp).z + campPreset().gate.z;
  }
  const inner = (box: Box, horizontal: boolean) => {
    const k = Math.floor((at - (horizontal ? box.x : box.z)) / CELL);
    return k >= 1 && k <= (horizontal ? box.w : box.h) / CELL - 2;
  };
  const horizontal = t.side === 'n' || t.side === 's';
  return inner(a, horizontal) && inner(b, horizontal) ? { side: t.side, at } : null;
}

/** whether a new box may go where it was put (sub_6FD82050, and ours) */
function fits(link: Link, p: Placed, placed: Map<number, Placed>): boolean {
  // clear of every area laid already
  for (const o of placed.values()) if (overlaps(p, o)) return false;
  const parent = placed.get(link.parent!)!;
  if (link.linker === 'town') {
    // our one camp has its gate in the east palisade, so it sits west of Blood Moor; D2 has one for each side
    if (p.dir !== 1) return false;
    if (!TOWN_OK[p.dir + 4 * (p.alt + 2 * (parent.dir + 4 * parent.alt))]) return false;
  }
  // the Burial Grounds may not take the side of Cold Plains that Blood Moor has
  if (link.area === BURIAL_GROUNDS) for (const l of WEST) if (l.parent === link.parent && l.area !== link.area && placed.get(l.area)?.dir === p.dir) return false;
  // ours: the camp at the world's west edge, with nothing beside it or behind it
  const camp = link.area === CAMP_AREA ? p : placed.get(CAMP_AREA);
  const all: [number, Box][] = [...placed.entries(), [link.area, p]];
  if (camp) for (const [area, o] of all) if (area !== CAMP_AREA && o.x < camp.x + camp.w) return false;
  return !!seamAt(link.parent!, parent, link.area, p);
}

/**
 * An area's box, w×h tiles: D2's size scaled, whole cells. The camp's is never smaller than our camp
 * preset, rounded up to cells: D2's 56×40 scaled comes out shorter than its 46 tiles below 1.1 times.
 */
function sizeOf(area: number, d2: [number, number], scale: number): [number, number] {
  const w = tilesOf(d2[0], scale);
  const h = tilesOf(d2[1], scale);
  if (area !== CAMP_AREA) return [w, h];
  const fit = (n: number) => Math.ceil(n / CELL) * CELL;
  return [Math.max(w, fit(campPreset().w)), Math.max(h, fit(campPreset().h))];
}

/** the West's areas laid out by D2's links, trying each linker's choices in turn and backing up a link when one runs out (sub_6FD823C0) */
function layWest(rng: RNG, scale: number): Map<number, Placed> {
  const placed = new Map<number, Placed>();
  const go = (i: number): boolean => {
    if (i === WEST.length) return true;
    const link = WEST[i];
    if (link.parent === undefined) {
      const [w, h] = sizeOf(link.area, link.size, scale);
      placed.set(link.area, { x: 0, z: 0, w, h, dir: -1, alt: -1 });
      return go(i + 1);
    }
    const parent = placed.get(link.parent)!;
    for (const { dir, alt } of choices(link.linker!, rng)) {
      // Blood Moor lies long toward Cold Plains: 96×56 beside it, 56×96 above or below (sub_6FD81950)
      const [w, h] = sizeOf(link.area, link.linker === 'moor' ? (dir % 2 ? [96, 56] : [56, 96]) : link.size, scale);
      const box = attach(parent, w, h, dir, link.linker === 'side' || alt === 1, link.linker === 'town' ? 2 : 1, scale);
      const p: Placed = { ...box, dir, alt };
      if (!fits(link, p, placed)) continue;
      placed.set(link.area, p);
      if (go(i + 1)) return true;
      placed.delete(link.area);
    }
    return false;
  };
  if (!go(0)) throw new Error('the West overworld has no layout');
  return placed;
}

/** each built area's own seed from the world's */
function zoneSeed(seed: number, area: number): number {
  return (Math.imul(seed ^ 0x2545f491, 0x9e3779b1) + Math.imul(area, 0x85ebca6b)) >>> 0;
}

/** what the hero can't reach from the camp's start, nearest the camp first: an area cut off behind another isn't to blame for it */
export function unreachable(ow: Overworld): { area: number; what: string }[] {
  const { map } = ow;
  const seen = flood(map, ow.start);
  const reaches = (p: P2, r: number) => {
    for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++) {
      for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++) {
        if (map.inBounds(x, z) && seen[z * map.w + x] && Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) <= r) return true;
      }
    }
    return false;
  };
  const areaAt = (p: P2) => ow.areaOf[Math.floor(p.z) * map.w + Math.floor(p.x)];
  const out: { area: number; what: string }[] = [];
  for (const s of ow.seams) {
    if (!reaches(s.ta, 0.5)) out.push({ area: s.a, what: `its opening to area ${s.b}` });
    if (!reaches(s.tb, 0.5)) out.push({ area: s.b, what: `its opening to area ${s.a}` });
  }
  // used from beside them, as the game's objects are
  for (const w of ow.waypoints) if (!reaches(w.pos, 1.6)) out.push({ area: w.area, what: 'its waypoint' });
  for (const e of ow.entrances) if (!reaches(e, 2)) out.push({ area: areaAt(e), what: `the way to area ${e.dest}` });
  for (const s of ow.services) if (s.kind !== 'campfire' && !reaches(s.pos, 1.3)) out.push({ area: areaAt(s.pos), what: `the ${s.kind}` });
  return out.sort((a, b) => ow.order.indexOf(a.area) - ow.order.indexOf(b.area));
}

/**
 * The West overworld for a world seed: the same seed, the same map; `scale` is OUT_SCALE but where
 * the tests turn it. A world with something still out of reach after REROLLS goes is given up for
 * the next seed's, a little more time where throwing would be a game that doesn't start; past
 * WORLDS, the last is taken as it is, with its `unreached`.
 */
export function generateOverworld(seed: number, scale = OUT_SCALE): Overworld {
  let ow = makeWorld(seed >>> 0, scale);
  for (let k = 1; k < WORLDS && ow.unreached.length; k++) ow = makeWorld((seed + k) >>> 0, scale);
  if (ow.unreached.length) console.warn(`overworld ${seed}: area ${ow.unreached[0].area} can't reach ${ow.unreached[0].what}`);
  return ow;
}

function makeWorld(seed: number, scale: number): Overworld {
  const rng = new RNG(seed);
  const placed = layWest(rng, scale);
  const built = BUILT.map((area) => ({ area, ...placed.get(area)! }));
  const minX = Math.min(...built.map((b) => b.x));
  const minZ = Math.min(...built.map((b) => b.z));
  const W = Math.max(...built.map((b) => b.x + b.w)) - minX + 2 * MARGIN;
  const H = Math.max(...built.map((b) => b.z + b.h)) - minZ + 2 * MARGIN;
  const ox = MARGIN - minX;
  const oz = MARGIN - minZ;
  const boxes: AreaBox[] = WEST.map(({ area }) => {
    const p = placed.get(area)!;
    return { area, x: p.x + ox, z: p.z + oz, w: p.w, h: p.h, built: BUILT.includes(area) };
  });
  const boxOf = (area: number) => boxes.find((b) => b.area === area)!;

  // the built areas from the camp outward, by the links
  const order = [CAMP_AREA];
  for (let k = 0; k < order.length; k++) {
    for (const l of WEST) {
      const next = l.area === order[k] ? l.parent : l.parent === order[k] ? l.area : undefined;
      if (next !== undefined && BUILT.includes(next) && !order.includes(next)) order.push(next);
    }
  }
  const rank = (area: number) => (order.includes(area) ? order.indexOf(area) : order.length + WEST.findIndex((l) => l.area === area));

  // ── the ports, fixed before any area is made: both sides of a seam open in the same place ──
  const ports = new Map<number, ZonePort[]>(BUILT.map((a) => [a, []]));
  for (const l of WEST) {
    if (l.parent === undefined) continue;
    const a = boxOf(l.parent);
    const b = boxOf(l.area);
    if (!a.built && !b.built) continue;
    const s = seamAt(l.parent, a, l.area, b)!;
    if (a.built) ports.get(a.area)!.push({ side: s.side, at: s.at - (s.side === 'n' || s.side === 's' ? a.x : a.z), to: b.area, closed: !b.built });
    if (b.built) ports.get(b.area)!.push({ side: OPPOSITE[s.side], at: s.at - (s.side === 'n' || s.side === 's' ? b.x : b.z), to: a.area, closed: !a.built });
  }
  const campBox = boxOf(CAMP_AREA);
  // sizeOf makes room for the camp; nothing after this would notice if it hadn't, so make sure
  const co = campOrigin(campBox);
  if (co.z < 0 || co.x + campPreset().w > campBox.w || co.z + campPreset().h > campBox.h) {
    throw new Error(`the camp (${campPreset().w}×${campPreset().h}) doesn't fit its area (${campBox.w}×${campBox.h})`);
  }
  const specs = new Map<number, ZoneSpec>();
  const seeds: Record<number, number> = {};
  const specFor = (area: number, zs: number): ZoneSpec => {
    const box = boxOf(area);
    const d = DRESS[area];
    const spec: ZoneSpec = {
      area,
      seed: zs,
      cw: box.w / CELL,
      ch: box.h / CELL,
      // the way from the camp first: the road starts there
      ports: ports.get(area)!.sort((p, q) => rank(p.to) - rank(q.to)),
      shrines: d.shrines,
      sights: d.sights(new RNG(zs ^ 0x51c475)),
    };
    if (area === CAMP_AREA) spec.camp = campOrigin(box);
    if (d.waypoint) spec.waypoint = d.waypoint.by === undefined ? {} : { by: d.waypoint.by };
    const farFrom = { x: campBox.x + campBox.w / 2 - box.x, z: campBox.z + campBox.h / 2 - box.z };
    if (d.cave !== undefined) spec.cave = { dest: d.cave, farFrom };
    if (d.cliffs) spec.cliffs = d.cliffs;
    if (d.cliffCave !== undefined) spec.cliffCave = { dest: d.cliffCave, farFrom };
    if (d.stony) spec.stony = true;
    if (d.graveyard) spec.graveyard = d.graveyard;
    if (d.sightUniques) spec.sightUniques = d.sightUniques;
    return spec;
  };
  const zones = new Map<number, Zone>();
  for (const area of BUILT) {
    seeds[area] = zoneSeed(seed, area);
    specs.set(area, specFor(area, seeds[area]));
    zones.set(area, generateZone(specs.get(area)!));
  }

  for (let tries = 0; ; tries++) {
    const ow = compose(zones, boxes, order, seeds, W, H, seed);
    ow.unreached = unreachable(ow);
    ow.rerolls = tries;
    if (!ow.unreached.length || tries >= REROLLS) return ow;
    // the first area the walk from the camp can't get through, made again with the next seed
    const area = ow.unreached[0].area;
    seeds[area]++;
    specs.set(area, specFor(area, seeds[area]));
    zones.set(area, generateZone(specs.get(area)!));
  }
}

/** the built areas' maps copied into one, at their boxes, with woods in the margin and the gaps */
function compose(zones: Map<number, Zone>, boxes: AreaBox[], order: number[], seeds: Record<number, number>, W: number, H: number, seed: number): Overworld {
  const map = new TileMap(W, H);
  const areaOf = new Uint16Array(W * H);
  const ground = new Uint8Array(W * H * 4);
  const inArea = new Uint8Array(W * H);
  const built = boxes.filter((b) => b.built);
  const props: Prop[] = [];
  const decor: Decor[] = [];
  const chests: P2[] = [];
  const barrels: P2[] = [];
  const shrines: ShrineSpot[] = [];
  const elites: P2[] = [];
  const services: Service[] = [];
  const spawnRooms: Room[] = [];
  const waypoints: Waypoint[] = [];
  const entrances: Entrance[] = [];
  const houses: House[] = [];
  const npcs: Npc[] = [];
  const cliffs = new Set<number>();
  const superUniques: SuperUnique[] = [];
  const presetMonsters: PresetMonster[] = [];
  const presets: PresetSpot[] = [];
  let cairn: Overworld['cairn'];
  let start: P2 | undefined;
  const moved = (p: P2, b: Box): P2 => ({ x: p.x + b.x, z: p.z + b.z });
  for (const area of order) {
    const z0 = zones.get(area)!;
    const b = built.find((x) => x.area === area)!;
    for (let z = 0; z < z0.h; z++) {
      for (let x = 0; x < z0.w; x++) {
        const i = (b.z + z) * W + b.x + x;
        const j = z * z0.w + x;
        map.tiles[i] = z0.map.tiles[j];
        areaOf[i] = area;
        inArea[i] = 1;
        for (let k = 0; k < 4; k++) ground[i * 4 + k] = z0.ground[j * 4 + k];
      }
    }
    for (const j of z0.cliffs) cliffs.add((b.z + Math.floor(j / z0.w)) * W + b.x + (j % z0.w));
    if (z0.cairn) cairn = { center: moved(z0.cairn.center, b), stones: z0.cairn.stones.map((p) => moved(p, b)) };
    superUniques.push(...z0.superUniques.map((u) => ({ ...u, pos: moved(u.pos, b) })));
    presetMonsters.push(...z0.presetMonsters.map((m) => ({ ...m, pos: moved(m.pos, b) })));
    presets.push(...z0.presets.map((p) => ({ ...p, rect: { ...p.rect, x: p.rect.x + b.x, y: p.rect.y + b.z } })));
    for (const p of z0.props) props.push({ ...p, x: p.x + b.x, z: p.z + b.z });
    for (const d of z0.decor) decor.push({ ...d, x: d.x + b.x, z: d.z + b.z });
    chests.push(...z0.chests.map((p) => moved(p, b)));
    barrels.push(...z0.barrels.map((p) => moved(p, b)));
    shrines.push(...z0.shrines.map((p) => ({ ...p, ...moved(p, b) })));
    elites.push(...z0.elites.map((p) => moved(p, b)));
    services.push(...z0.services.map((s) => ({ ...s, pos: moved(s.pos, b) })));
    spawnRooms.push(...z0.spawnRooms.map((r) => ({ x: r.x + b.x, y: r.y + b.z, w: r.w, h: r.h })));
    if (z0.waypoint) waypoints.push({ area, pos: moved(z0.waypoint, b) });
    entrances.push(...z0.entrances.map((e) => ({ ...e, ...moved(e, b) })));
    houses.push(...(z0.houses ?? []).map((h) => ({ ...h, x: h.x + b.x, y: h.y + b.z })));
    npcs.push(...(z0.npcs ?? []).map((n) => ({ ...n, x: n.x + b.x, z: n.z + b.z })));
    if (z0.start) start = moved(z0.start, b);
  }

  // the seams' openings, each from both sides
  const seams: Seam[] = [];
  for (const a of order) {
    const za = zones.get(a)!;
    const ba = built.find((x) => x.area === a)!;
    for (const b of order) {
      if (a >= b) continue;
      const zb = zones.get(b)!;
      const bb = built.find((x) => x.area === b)!;
      const ka = za.portTo.indexOf(b);
      const kb = zb.portTo.indexOf(a);
      if (ka < 0 || kb < 0) continue;
      seams.push({ a, b, ta: moved(za.ports[ka], ba), tb: moved(zb.ports[kb], bb) });
    }
  }

  // the margin and the gaps between areas: the nearest area's, and woods within WOODS_REACH of one,
  // open only where a road runs on out
  const far = new Uint8Array(W * H);
  const near = (x: number, z: number) => {
    let best = built[0].area;
    let bd = Infinity;
    for (const b of built) {
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w - 1));
      const dz = Math.max(b.z - z, 0, z - (b.z + b.h - 1));
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = b.area;
      }
    }
    if (bd > WOODS_REACH * WOODS_REACH) far[z * W + x] = 1;
    return best;
  };
  const roadsOut = entrances.filter((e) => e.kind === 'road');
  const onRoadOut = (x: number, z: number, half: number) =>
    roadsOut.some((e) => {
      const px = x + 0.5 - e.x;
      const pz = z + 0.5 - e.z;
      const depth = -(px * e.nx + pz * e.nz);
      return depth > 0 && depth < MARGIN + 2 && Math.abs(px * e.nz - pz * e.nx) < half;
    });
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (inArea[i]) continue;
      areaOf[i] = near(x, z);
      const road = onRoadOut(x, z, 1.6) ? 1 : 0;
      ground[i * 4] = Math.round(0.2 * (1 - road) * 255);
      ground[i * 4 + 1] = Math.round(0.8 * (1 - road) * 255);
      ground[i * 4 + 2] = road * 255;
    }
  }
  const woods = growWoods(new RNG(seed ^ 0x3a7f), { x0: 0, z0: 0, x1: W, z1: H }, (x, z) => inArea[z * W + x] === 1, (x, z) => far[z * W + x] === 1 || onRoadOut(x, z, 3));
  props.push(...woods.props);

  return {
    seed,
    unreached: [],
    map,
    // the camp's, where the hero starts; each area's own look comes with the renderer's per-area chunks
    theme: THEMES.town,
    start: start!,
    waypoints,
    rooms: [],
    spawnRooms,
    torches: [],
    decor,
    chests,
    barrels,
    pillars: new Set(),
    services,
    // no walk-through exits: the areas run into each other, and the ways on out are entrances
    exits: [],
    ground,
    shrines,
    elites,
    houses,
    props,
    wallDecor: [],
    npcs,
    cliffs,
    cairn,
    presets,
    presetMonsters,
    superUniques,
    areaOf,
    entrances,
    boxes,
    seams,
    order,
    seeds: { ...seeds },
    rerolls: 0,
  };
}
