import { RNG, type P2 } from '../core/math';
import { D2X_AREAS } from '../data/d2x/areas';
import { D2X_MAZES } from '../data/d2x/maze';
import { D2X_OBJECTS } from '../data/d2x/objects';
import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import type { Difficulty } from '../items/d2/types';
import { dressRooms, Furnisher, PROP_DEFS, type Prop } from './furnish';
import { THEMES, bfsDistances, type Entrance, type Layout, type PresetSpot, type Room, type SuperUnique, type Theme, type Torch } from './levelgen';
import { ObjectRoller, RANDOM_CHEST, SUB, type PlacedBarrel, type PlacedCasket, type PlacedChest, type PlacedObject, type PlacedRemains, type PlacedShrine, type SubRoom } from './objgroups';
import { fbm, valueNoise } from './outdoors';
import { TileMap, T_FLOOR, T_PROP, T_VOID, T_WALL } from './tilemap';
import { flood, OUT_SCALE } from './zone';

/**
 * Diablo II's dungeon mazes (Levels.txt DrlgType 1): the Den of Evil, the caves, the crypts. D2
 * grows a maze of same-sized rooms on a grid, each joined to its neighbours east, west, north or
 * south, as DRLGMAZE_GenerateLevel does (D2MOO source/D2Common/src/Drlg/DrlgMaze.cpp:314-871):
 * LvlMaze's Rooms by difficulty, each next room beside a random room on a random side, a new room
 * joined to each other one it touches one time in two (Merge 500); then the way in, the way down
 * and the boss's or the chest's room come on as dead ends, on the sides the turning nRand says;
 * then a few plain rooms become theme rooms. mazeGraph does just that, with D2's own random
 * numbers (D2Seed) and D2's order of rooms.
 *
 * generateMaze then cuts each room into our tiles at the overworld's scale (OUT_SCALE: a 24-tile
 * cave room is 30 of ours, an 8-tile crypt room 10): a cave room a noisy chamber with tunnels to the
 * middles of the sides it opens on, a crypt room a walled room or a corridor, by its shape and
 * which of its preset's two files D2 gave it. D2's DS1 maps are not in d2data, so how a room looks
 * inside is ours; what it holds is D2's: the stairs, the boss, the chest, and the objects each of
 * D2's 8×8-tile rooms rolls from its level's object groups, as objgroups.ts places them. Our
 * dressing (furnish.ts) goes round those, and its look-alikes of them are taken out again. Cave
 * Level 2 is one preset map in D2 (DrlgType 2); here it is one hall carved from a fixed seed.
 *
 * dungeons.ts says which area is which maze; src/game/maps.ts DUNGEON_MAKERS makes the game's from
 * each level's seed (levelSeed). The Layout carries what D2 rolled for each object (its Objects.txt
 * row, lock, trap, spark chest), its caskets, rogue corpses and wells, and its special rooms (presets).
 */

/** how a maze's rooms are cut: D2's Act 1 caves (LvlTypes.txt 3) or crypts (4) */
export type MazeStyle = 'cave' | 'crypt';

/**
 * A room D2 puts in as a dead end once the maze has grown (DRLGMAZE_ScanReplaceSpecialPreset): the
 * way up (lvlwarp Cave Up or Crypt Up), the way down (Cave Down), a superunique's room, the chest
 * room. `preset` and `files` are its lvlprest.json Def and Files, Def the west-opening one's (the
 * east, south and north ones follow it); a fixed map's specials have none.
 */
export type MazeSpecial = { preset?: number; files?: number } & (
  | { kind: 'up'; dest: number }
  | { kind: 'down'; dest: number }
  | { kind: 'boss'; superUnique: string }
  | { kind: 'treasure'; chest: number }
);

export interface MazeSpec {
  /** levels.json Id: its D2X_MAZES row says how many rooms, how big, what they roll */
  area: number;
  seed: number;
  difficulty: Difficulty;
  style: MazeStyle;
  theme: Theme;
  /** in the order D2 puts them in (DRLGMAZE_GenerateLevel, DrlgMaze.cpp:498-557) */
  specials: MazeSpecial[];
  /** it rolls theme rooms: all but the Den of Evil (DRLGMAZE_RollAct_1_2_3_BasicPresets, DrlgMaze.cpp:3158-3161) */
  themes: boolean;
  /** one preset map instead of a maze (DrlgType 2): the seed its hall is carved from, the same every game */
  fixed?: number;
}

/** a room of the maze as D2 grows it */
export interface MazeGraphRoom {
  /** its place on the grid, in rooms (D2's tile position over LvlMaze SizeX) */
  gx: number;
  gy: number;
  /** the sides it opens on: west 1, east 2, south 4, north 8 (DRLGMAZE_PickRoomPreset, DrlgMaze.cpp:161-184) */
  mask: number;
  /** the lvlprest.json Def D2 gives it */
  preset: number;
  /** which of that preset's files (DRLGMAZE_RollBasicPresets: a plain shape's two take turns) */
  variant: number;
  theme: boolean;
  /** the MazeSpec.specials it is, or -1 (Cave Level 2's one hall holds both of its own) */
  special: number;
  /** the rooms it opens to, by index */
  links: number[];
}

/** a maze room on the map */
export interface MazeCell extends MazeGraphRoom {
  /** its tiles */
  rect: Room;
  /** what it was cut as: a cave's chamber, a crypt's walled room or its corridor */
  shape: 'chamber' | 'room' | 'corridor';
}

/** where a special room's thing is: the stairs, the superunique's spot, the chest */
export interface MazeSpecialAt {
  kind: MazeSpecial['kind'];
  /** its room (MazeExtra.cells) */
  cell: number;
  pos: P2;
}

/** what a maze has that Layout has no fields for yet */
export interface MazeExtra {
  style: MazeStyle;
  /** a room's edge in tiles: LvlMaze SizeX × OUT_SCALE */
  cell: number;
  cells: MazeCell[];
  specials: MazeSpecialAt[];
  /** D2's 8×8-tile rooms (10×10 here), in the order their objects were rolled */
  objRooms: Room[];
  /** every chest, as Layout.chests has them, in the same order */
  chests: PlacedChest[];
  /** as Layout.barrels, in the same order */
  barrels: PlacedBarrel[];
  /** as Layout.shrines, in the same order */
  shrines: PlacedShrine[];
  caskets: PlacedCasket[];
  remains: PlacedRemains[];
  wells: PlacedObject[];
}

export interface MazeResult {
  layout: Layout;
  extra: MazeExtra;
}

// ───────────────────────────── D2's random numbers ─────────────────────────────

const MWC = 0x6ac690c5;
const TWO32 = 4294967296;

/**
 * D2's seed (D2MOO source/D2Common/include/D2Seed.h:39-62): a multiply-with-carry, low × 0x6AC690C5
 * + high, the 64-bit sum's halves the next low and high. Every caller here takes the low half.
 */
export class D2Seed {
  lo: number;
  hi: number;
  /** SEED_InitLowSeed (D2Seed.cpp): the high half starts at 666 */
  constructor(low: number) {
    this.lo = low >>> 0;
    this.hi = 666;
  }
  /** SEED_RollRandomNumber: the new low half, unsigned; worked in 16-bit halves so a double holds every step */
  roll(): number {
    const p1 = MWC * (this.lo & 0xffff);
    const p2 = MWC * (this.lo >>> 16);
    const p1lo = p1 % TWO32;
    const p2lo = p2 % 65536;
    const sum = p1lo + p2lo * 65536 + this.hi;
    const lo = sum % TWO32;
    this.hi = ((p1 - p1lo) / TWO32 + (p2 - p2lo) / 65536 + (sum - lo) / TWO32) % TWO32;
    this.lo = lo;
    return lo;
  }
  /** SEED_RollLimitedRandomNumber (D2Seed.h:49-62): & (n − 1) for a power of two, else % n; 0 with no roll for n ≤ 0 */
  limited(n: number): number {
    if (n <= 0) return 0;
    const r = this.roll();
    return n & (n - 1) ? r % n : r & (n - 1);
  }
}

/** a seed of its own for each use of the maze's seed, so changing one stream doesn't move the others */
function stream(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// ───────────────────────────── the maze, as D2 grows it ─────────────────────────────

/** D2's four directions (DRLGMAZE_AddAdjacentMazeRoom, DrlgMaze.cpp:917-937): 0 −x, 1 −y, 2 +x, 3 +y, which lvlprest names W, N, E, S */
const DX = [-1, 0, 1, 0];
const DY = [0, -1, 0, 1];
/** each direction's bit in a room's shape (DRLGMAZE_PickRoomPreset, DrlgMaze.cpp:161-184) */
const BIT = [1, 8, 2, 4];
/** a special preset's place after its west one, as lvlprest lists them W, E, S, N (e.g. Def 83–86 "Act 1 - Cave Prev W/E/S/N") */
const SIDE_ORDER = [0, 3, 1, 2];
/** the side nRand's special preset opens on: north, east, south, west (the tables at DrlgMaze.cpp:316-388) */
const OPEN = [1, 2, 3, 0];

interface StyleDef {
  /** the lvlprest Def the shapes count from, the shape with mask m being base + m: LVLPREST_ACT1_DOE_ENTRANCE 52 for caves, LVLPREST_ACT1_GRAVEYARD 108 for crypts (DrlgMaze.cpp:186-194) */
  base: number;
  /** lvlprest.json Files of the plain shapes (Def 53–67, 109–123) and of their theme ones (68–82, 124–138) */
  files: number;
  themeFiles: number;
}
const STYLES: Record<MazeStyle, StyleDef> = {
  cave: { base: 52, files: 2, themeFiles: 1 },
  crypt: { base: 108, files: 2, themeFiles: 1 },
};
/** a theme room's preset is its shape's + 15 (DrlgMaze.cpp:3193) */
const THEME_STEP = 15;

interface GRoom {
  gx: number;
  gy: number;
  seed: D2Seed;
  /** its orths, newest first, as DRLGROOM_AllocDrlgOrthsForRooms puts them (DrlgDrlgRoom.cpp:214-261) */
  links: { room: GRoom; dir: number }[];
  preset: number;
  /** DRLGPRESETROOMFLAG_HAS_MAP_DS1: a special or theme room, which nothing grows from or merges with */
  ds1: boolean;
  special: number;
  theme: boolean;
  variant: number;
  order: number;
}

/**
 * The maze for a spec, as DRLGMAZE_GenerateLevel grows an Act 1 cave or crypt (DrlgMaze.cpp:476-563),
 * then its theme rooms (3099-3205) and its files (3208-3330), on D2's seeds: the level's and each
 * room's own, made from the level's (DRLGROOM_AllocRoomEx, DrlgDrlgRoom.cpp:15-40), rolled where D2
 * rolls them. D2 keeps a level's rooms newest first (DRLGROOM_AddRoomExToLevel, 453-458), which
 * decides which room a scan finds; the rooms come back in the order they were made.
 */
export function mazeGraph(spec: MazeSpec): MazeGraphRoom[] {
  const maze = D2X_MAZES[spec.area];
  if (!maze || maze.drlg !== 1) throw new Error(`area ${spec.area} is not a maze`);
  const style = STYLES[spec.style];
  const level = new D2Seed(spec.seed);
  const rooms: GRoom[] = [];
  let made = 0;
  const alloc = (gx: number, gy: number): GRoom => {
    const seed = new D2Seed(level.roll());
    // its dwInitSeed
    seed.roll();
    return { gx, gy, seed, links: [], preset: 0, ds1: false, special: -1, theme: false, variant: 0, order: made++ };
  };
  // a room there already: one of the parent's orths' (DrlgMaze.cpp:963-970) or any other room
  // (DRLGMAZE_CheckRoomNotOverlaping, DrlgDrlgRoom.cpp:436-451); rooms side by side are fine
  const occupied = (gx: number, gy: number) => rooms.some((o) => o.gx === gx && o.gy === gy);
  const link = (a: GRoom, b: GRoom, dir: number) => {
    if (!a.links.some((l) => l.room === b)) a.links.unshift({ room: b, dir });
    if (!b.links.some((l) => l.room === a)) b.links.unshift({ room: a, dir: (dir + 2) & 3 });
  };
  // DRLGMAZE_PickRoomPreset(room, bResetFlag 1): the shape its orths make, the DS1 flag off
  const pick = (r: GRoom) => {
    let mask = 0;
    for (const l of r.links) mask |= BIT[l.dir];
    r.preset = style.base + mask;
    r.ds1 = false;
  };
  // DRLG_GetDirectionFromCoordinates (DrlgDrlg.cpp:473-503): the way b is from a
  const dirTo = (a: GRoom, b: GRoom) => (b.gx > a.gx ? 2 : b.gx < a.gx ? 0 : b.gy > a.gy ? 3 : 1);

  // DRLGMAZE_AddAdjacentMazeRoom with bMergeRooms (DrlgMaze.cpp:905-1025)
  const grow = (parent: GRoom, dir: number) => {
    const nr = alloc(parent.gx + DX[dir], parent.gy + DY[dir]);
    if (occupied(nr.gx, nr.gy)) return;
    link(parent, nr, dir);
    if (!parent.ds1) {
      // each room it touches side to side, not joined to it yet, joins it on that room's own seed's
      // roll % 1000 < Merge (980-1015: within 1 of it and nX != nY, so not corner to corner)
      for (const o of rooms) {
        if (o.ds1 || Math.abs(o.gx - nr.gx) + Math.abs(o.gy - nr.gy) !== 1 || nr.links.some((l) => l.room === o)) continue;
        if (o.seed.roll() % 1000 < maze.merge) {
          link(o, nr, dirTo(o, nr));
          pick(o);
        }
      }
    }
    rooms.unshift(nr);
    pick(parent);
    pick(nr);
  };

  // the first room in the middle (DrlgMaze.cpp:462-470), then a random room and a random side until
  // there are Rooms (476-496). D2 has no limit; this one only keeps a bug from looping forever
  rooms.unshift(alloc(0, 0));
  const want = maze.rooms[spec.difficulty];
  for (let n = 0; rooms.length < want; n++) {
    if (n > 100000) throw new Error(`maze ${spec.area} would not grow to ${want} rooms`);
    const r = rooms[level.limited(rooms.length)];
    const dir = r.seed.roll() & 3;
    if (!r.ds1) grow(r, dir);
  }

  // the specials (DRLGMAZE_ScanReplaceSpecialPreset, DrlgMaze.cpp:1666-1717): each the first room
  // that is a dead end opening on nRand's side, or else a new dead end hung on the first room with
  // that side free; then nRand turns to the next side
  let nRand = level.roll() & 3;
  spec.specials.forEach((sp, k) => {
    const open = OPEN[nRand];
    const attach = (open + 2) & 3;
    const shape = style.base + BIT[open];
    const preset = (sp.preset ?? 0) + SIDE_ORDER[open];
    const end = rooms.find((r) => !r.ds1 && r.preset === shape);
    if (end) {
      end.preset = preset;
      end.ds1 = true;
      end.special = k;
    } else {
      for (const r of rooms.slice()) {
        if (r.ds1) continue;
        // DRLGMAZE_LinkMazeRooms (DrlgMaze.cpp:1133-1188); a room it can't go beside is freed
        const nr = alloc(r.gx + DX[attach], r.gy + DY[attach]);
        if (occupied(nr.gx, nr.gy)) continue;
        link(r, nr, attach);
        rooms.unshift(nr);
        pick(r);
        nr.preset = preset;
        nr.ds1 = true;
        nr.special = k;
        break;
      }
    }
    nRand = (nRand + 1) & 3;
  });

  // theme rooms (DRLGMAZE_RollAct_1_2_3_BasicPresets, DrlgMaze.cpp:3150-3205): the 15 shapes
  // shuffled, then up to max(2, ⌊rooms/5⌋ + 1) plain rooms, the first of each shape in turn, made
  // their theme preset, within 2 × rooms turns (the four-way shape, 15, never comes up)
  if (spec.themes) {
    const offsets = Array.from({ length: 15 }, (_, i) => i);
    let at = level.roll() % 15;
    for (let i = 0; i < 15; i++) {
      const i2 = level.roll() % 15;
      const i1 = level.roll() % 15;
      [offsets[i1], offsets[i2]] = [offsets[i2], offsets[i1]];
    }
    let left = Math.max(2, Math.floor(rooms.length / 5) + 1);
    for (let turns = 2 * rooms.length; left && turns; turns--) {
      const id = offsets[at] + style.base;
      const r = rooms.find((o) => !o.ds1 && o.preset === id);
      if (r) {
        r.preset = id + THEME_STEP;
        r.ds1 = true;
        r.theme = true;
        left--;
      }
      at = (at + 1) % 15;
    }
  }

  // the files (DRLGMAZE_RollBasicPresets, DrlgMaze.cpp:3208-3330): each room's map picks one at
  // random (DRLGPRESET_AllocDrlgMap, DrlgPreset.cpp:1496-1503); a plain shape's then take turns
  // from a random one over the rooms of that shape. Then the room is built (DRLGPRESET_BuildArea,
  // DrlgPreset.cpp:1240-1294) before the next one picks: each of D2's rooms it is cut into
  // (DRLGPRESET_InitPresetRoomData → DRLGROOM_AllocRoomEx, DrlgPreset.cpp:953-958,
  // DrlgDrlgRoom.cpp:15-23) takes its seed from the level's, a roll the next room's file comes after:
  // a cave's 24×24 room is nine 8×8 rooms, a crypt's 8×8 one (one room up to 12×12, DrlgMaze.cpp:3337).
  // A preset with Scan (the ways in and out, lvlprest.json) also reads its DS1's units with the
  // level's seed then (DRLGPRESET_AddPresetUnitToDrlgMap, DrlgPreset.cpp:1313-1317, 667-755), a
  // roll for each floor trap, 581 chest and a few monsters in it; D2's DS1s aren't in d2data, so
  // those are taken to hold none (an approximation)
  const [sx, sy] = maze.size;
  const parts = sx <= 12 && sy <= 12 ? 1 : Math.ceil(sx / 8) * Math.ceil(sy / 8);
  const turns = new Map<number, number>();
  for (const r of rooms) {
    const files = r.special >= 0 ? (spec.specials[r.special].files ?? 1) : r.theme ? style.themeFiles : style.files;
    let file = level.limited(files);
    if (r.preset > style.base && r.preset < style.base + 16) {
      const last = turns.has(r.preset) ? turns.get(r.preset)! : level.limited(files);
      file = (last + 1) % files;
      turns.set(r.preset, file);
    }
    r.variant = file;
    for (let k = 0; k < parts; k++) level.roll();
  }

  const ordered = rooms.slice().sort((a, b) => a.order - b.order);
  const index = new Map(ordered.map((r, i) => [r, i]));
  return ordered.map((r) => {
    let mask = 0;
    for (const l of r.links) mask |= BIT[l.dir];
    return { gx: r.gx, gy: r.gy, mask, preset: r.preset, variant: r.variant, theme: r.theme, special: r.special, links: r.links.map((l) => index.get(l.room)!).sort((a, b) => a - b) };
  });
}

// ───────────────────────────── cutting the rooms into tiles ─────────────────────────────

/** void kept round the map, so walls close it in */
const MARGIN = 1;

// A cave room's geometry is ours (the DS1s aren't in d2data): a chamber of about half the room, rock
// kept round its edge, and a mouth 6 tiles wide at the middle of each side it opens on, cut 3 deep,
// so the next room's meets it tile for tile.
const CAVE_RIM = 2;
const CAVE_MOUTH = 3;
const CAVE_MOUTH_DEPTH = 3;
/** how far the noise moves a chamber's edge, and a tunnel's, in tiles; and how far it bends the shapes about (a warp of the ground they're measured on) */
const CHAMBER_NOISE = 3;
const TUNNEL_NOISE = 1.0;
const WARP = 3;
/** from a cave stairway's middle to the rock at its back, in tiles: the stairway is about 2 across (render/props.ts makeStairs) */
const STAIRS_BACK = 1;
// A crypt room (ours too): walls round an 8×8 floor with doors 4 tiles wide at the middles of its open
// sides, or corridors as wide from those sides to its middle.
const DOOR0 = 3;
const DOOR1 = 7;

type Noise = (x: number, y: number) => number;
/** a disc [x, y, r] and a capsule [ax, ay, bx, by, r], in the room's own tiles */
type Disc = [number, number, number];
type Capsule = [number, number, number, number, number];

/** what a room's cut leaves to put things at, in map tiles */
interface CellPoints {
  /** the middle of its (first) chamber */
  centre: P2;
  /** a special room's thing: the stairs, the superunique's spot, the chest */
  spot?: P2;
  /** a dead end's way back out into the map (Entrance nx, nz), and where someone coming in stands */
  inward?: P2;
  start?: P2;
}

function distSeg(px: number, py: number, c: Capsule): number {
  const dx = c[2] - c[0];
  const dy = c[3] - c[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - c[0]) * dx + (py - c[1]) * dy) / l2)) : 0;
  return Math.hypot(px - c[0] - dx * t, py - c[1] - dy * t);
}

/** a tunnel from a chamber at `from` to the middle of side d, bent a little: two capsules */
function tunnel(rng: RNG, from: [number, number], d: number, half: number, r: number): Capsule[] {
  const m: [number, number] = [half + DX[d] * half, half + DY[d] * half];
  const bend = rng.range(-3, 3);
  const b: [number, number] = [(from[0] + m[0]) / 2 + DY[d] * bend, (from[1] + m[1]) / 2 + DX[d] * bend];
  return [
    [from[0], from[1], b[0], b[1], r],
    [b[0], b[1], m[0], m[1], r],
  ];
}

/**
 * A cave room: noisy chambers, tunnels to the middles of the sides in `mask`, a mouth cut at each.
 * A special room is a dead end, its chamber at the far side, its stairs or chest against the far
 * wall; a boss's an open arena with the superunique in its middle (dungeons.md 3.1).
 */
function carveCave(map: TileMap, rect: Room, mask: number, variant: number, theme: boolean, kind: MazeSpecial['kind'] | undefined, rng: RNG, noise: Noise): CellPoints {
  const C = rect.w;
  const h = C / 2;
  const open = [0, 1, 2, 3].filter((d) => mask & BIT[d]);
  const discs: Disc[] = [];
  const caps: Capsule[] = [];
  // floor whatever the noise says: the chambers' middles, the tunnels' spines, a special's spot
  const coreDiscs: Disc[] = [];
  const coreCaps: Capsule[] = [];
  const out: CellPoints = { centre: { x: rect.x + h, z: rect.y + h } };
  let chambers: [number, number][];
  if (kind === 'boss') {
    discs.push([h, h, 11]);
    coreDiscs.push([h, h, 4]);
    chambers = [[h, h]];
    out.spot = { x: rect.x + h, z: rect.y + h };
  } else if (kind) {
    const far = (open[0] + 2) & 3;
    const c: [number, number] = [h + DX[far] * 4, h + DY[far] * 4];
    const s: [number, number] = [h + DX[far] * (h - 5), h + DY[far] * (h - 5)];
    discs.push([c[0], c[1], 9]);
    coreDiscs.push([s[0], s[1], 2.6], [c[0], c[1], 3]);
    coreCaps.push([c[0], c[1], s[0], s[1], 2]);
    chambers = [c];
    out.centre = { x: rect.x + c[0], z: rect.y + c[1] };
    out.spot = { x: rect.x + s[0], z: rect.y + s[1] };
    out.inward = { x: -DX[far], z: -DY[far] };
    out.start = { x: out.spot.x - DX[far] * 2, z: out.spot.z - DY[far] * 2 };
  } else if (theme || variant === 0) {
    // one chamber, a theme room's the biggest
    const j = theme ? 1.5 : 3;
    const c: [number, number] = [h + rng.range(-j, j), h + rng.range(-j, j)];
    discs.push([c[0], c[1], theme ? 11 : rng.range(9.5, 11)]);
    coreDiscs.push([c[0], c[1], 3]);
    chambers = [c];
    out.centre = { x: rect.x + c[0], z: rect.y + c[1] };
  } else {
    // the shape's other file: two chambers either side of the middle, joined
    const ax = rng.chance(0.5) ? 0 : 1;
    const a: [number, number] = [h + (ax ? 0 : 5.5) + rng.range(-1.5, 1.5), h + (ax ? 5.5 : 0) + rng.range(-1.5, 1.5)];
    const b: [number, number] = [h - (ax ? 0 : 5.5) + rng.range(-1.5, 1.5), h - (ax ? 5.5 : 0) + rng.range(-1.5, 1.5)];
    discs.push([a[0], a[1], rng.range(6.5, 8)], [b[0], b[1], rng.range(6.5, 8)]);
    caps.push([a[0], a[1], b[0], b[1], 3]);
    coreDiscs.push([a[0], a[1], 2.5], [b[0], b[1], 2.5]);
    coreCaps.push([a[0], a[1], b[0], b[1], 1.6]);
    chambers = [a, b];
    out.centre = { x: rect.x + a[0], z: rect.y + a[1] };
  }
  // pockets off the chambers, for their outlines: one to three off a plain room's, one off a special's
  const pockets = kind ? rng.int(0, 1) : rng.int(2, 4);
  for (let k = 0; k < pockets; k++) {
    const c = rng.pick(chambers);
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(6, 9);
    discs.push([c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d, rng.range(2.5, 4.5)]);
  }
  // a tunnel from the nearest chamber to each open side's middle
  for (const d of open) {
    const m: [number, number] = [h + DX[d] * h, h + DY[d] * h];
    const from = chambers.reduce((best, c) => (Math.hypot(c[0] - m[0], c[1] - m[1]) < Math.hypot(best[0] - m[0], best[1] - m[1]) ? c : best));
    const t = tunnel(rng, from, d, h, rng.range(2.2, 2.8));
    caps.push(...t);
    for (const c of t) coreCaps.push([c[0], c[1], c[2], c[3], 1.6]);
  }
  // a way in or out stands against the end of its dead end, as D2's Cave Prev / Down rooms have their
  // stairs in the rock: no floor behind it, the rock closing round its back in a shallow curve
  let behind: ((px: number, py: number) => boolean) | null = null;
  if (kind && kind !== 'boss') {
    const far = (open[0] + 2) & 3;
    const back = h - 5 + STAIRS_BACK;
    behind = (px, py) => {
      const along = (px - h) * DX[far] + (py - h) * DY[far];
      const across = Math.abs((px - h) * DY[far] - (py - h) * DX[far]);
      return along > back + Math.max(0, across - 2.5) * 0.7;
    };
  }
  for (let v = 0; v < C; v++) {
    for (let u = 0; u < C; u++) {
      const px = u + 0.5;
      const py = v + 0.5;
      if (behind?.(px, py)) continue;
      let floor = false;
      const mouth = open.some((d) =>
        d === 0 ? u < CAVE_MOUTH_DEPTH && Math.abs(py - h) < CAVE_MOUTH
        : d === 2 ? u >= C - CAVE_MOUTH_DEPTH && Math.abs(py - h) < CAVE_MOUTH
        : d === 1 ? v < CAVE_MOUTH_DEPTH && Math.abs(px - h) < CAVE_MOUTH
        : v >= C - CAVE_MOUTH_DEPTH && Math.abs(px - h) < CAVE_MOUTH);
      if (mouth) floor = true;
      else if (u >= CAVE_RIM && v >= CAVE_RIM && u < C - CAVE_RIM && v < C - CAVE_RIM) {
        if (coreDiscs.some((d) => Math.hypot(px - d[0], py - d[1]) < d[2]) || coreCaps.some((c) => distSeg(px, py, c) < c[4])) floor = true;
        else {
          const X = rect.x + u;
          const Y = rect.y + v;
          const n = fbm(noise, X / 7, Y / 7);
          const wx = px + fbm(noise, X / 13 + 31.7, Y / 13) * WARP;
          const wy = py + fbm(noise, X / 13, Y / 13 + 47.3) * WARP;
          let dc = Infinity;
          for (const d of discs) dc = Math.min(dc, Math.hypot(wx - d[0], wy - d[1]) - d[2]);
          if (dc + n * CHAMBER_NOISE < 0) floor = true;
          else {
            let dt = Infinity;
            for (const c of caps) dt = Math.min(dt, distSeg(px, py, c) - c[4]);
            floor = dt + n * TUNNEL_NOISE < 0;
          }
        }
      }
      if (floor) map.set(rect.x + u, rect.y + v, T_FLOOR);
    }
  }
  return out;
}

/**
 * A crypt room: a walled room with an 8×8 floor and doors at the middles of the sides in `mask`, or
 * a corridor from those sides to its middle. Pillars stand in a room's corners when `pillars` is
 * given (and get their tiles there). A special room's stairs or chest stand against its far wall,
 * a boss in its middle.
 */
function carveCrypt(map: TileMap, rect: Room, mask: number, shape: 'room' | 'corridor', pillars: Set<number> | null, kind: MazeSpecial['kind'] | undefined): CellPoints {
  const C = rect.w;
  const h = C / 2;
  const open = [0, 1, 2, 3].filter((d) => mask & BIT[d]);
  const set = (u: number, v: number) => map.set(rect.x + u, rect.y + v, T_FLOOR);
  if (shape === 'room') {
    for (let v = 1; v < C - 1; v++) for (let u = 1; u < C - 1; u++) set(u, v);
    for (const d of open) {
      for (let k = DOOR0; k < DOOR1; k++) {
        if (d === 0) set(0, k);
        else if (d === 2) set(C - 1, k);
        else if (d === 1) set(k, 0);
        else set(k, C - 1);
      }
    }
    if (pillars) {
      for (const [u, v] of [[2, 2], [C - 3, 2], [2, C - 3], [C - 3, C - 3]]) {
        map.set(rect.x + u, rect.y + v, T_WALL);
        pillars.add((rect.y + v) * map.w + rect.x + u);
      }
    }
  } else {
    for (let v = DOOR0; v < DOOR1; v++) for (let u = DOOR0; u < DOOR1; u++) set(u, v);
    for (const d of open) {
      for (let a = 0; a < C; a++) {
        if (d === 0 || d === 1 ? a >= DOOR1 : a < DOOR0) continue;
        for (let k = DOOR0; k < DOOR1; k++) {
          if (d === 0 || d === 2) set(a, k);
          else set(k, a);
        }
      }
    }
  }
  const out: CellPoints = { centre: { x: rect.x + h, z: rect.y + h } };
  if (kind === 'boss') out.spot = { ...out.centre };
  else if (kind) {
    // against the far wall, facing the door; who comes in stands two tiles out from it
    const far = (open[0] + 2) & 3;
    out.spot = { x: rect.x + h + DX[far] * 3, z: rect.y + h + DY[far] * 3 };
    out.inward = { x: -DX[far], z: -DY[far] };
    out.start = { x: out.spot.x - DX[far] * 2, z: out.spot.z - DY[far] * 2 };
  }
  return out;
}

/** where Cave Level 2's hall has its way up (the south end) and its chest (on a dais against the north wall), in its own tiles */
const HALL_UP: [number, number] = [15, 26];
const HALL_CHEST: [number, number] = [15, 5];

/** Cave Level 2's hall (lvlprest Def 104 "Act 1 - Cave Treasure 2", the whole 24×24-tile level): a long cave, the way up at one end, the treasure at the other */
function carveHall(map: TileMap, rect: Room, rng: RNG, noise: Noise): CellPoints {
  const C = rect.w;
  const h = C / 2;
  const discs: Disc[] = [[h, h, 10], [h, 6.5, 5.5], [h, C - 6, 5]];
  for (let k = 0; k < 3; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(7, 10);
    discs.push([h + Math.cos(a) * d, h + Math.sin(a) * d, rng.range(3, 4.5)]);
  }
  const hall: Capsule = [h, 6.5, h, C - 6, 6];
  const spine: Capsule = [HALL_CHEST[0], HALL_CHEST[1], HALL_UP[0], HALL_UP[1], 2.2];
  for (let v = CAVE_RIM; v < C - CAVE_RIM; v++) {
    for (let u = CAVE_RIM; u < C - CAVE_RIM; u++) {
      const px = u + 0.5;
      const py = v + 0.5;
      // the way up against the hall's south end, the rock round its back (carveCave's dead ends)
      if (py > HALL_UP[1] + STAIRS_BACK + Math.max(0, Math.abs(px - HALL_UP[0]) - 2.5) * 0.7) continue;
      const n = fbm(noise, (rect.x + u) / 7, (rect.y + v) / 7);
      let dc = distSeg(px, py, hall) - hall[4];
      for (const d of discs) dc = Math.min(dc, Math.hypot(px - d[0], py - d[1]) - d[2]);
      const sure = distSeg(px, py, spine) < spine[4] || Math.hypot(px - HALL_UP[0], py - HALL_UP[1]) < 2.6 || Math.hypot(px - HALL_CHEST[0], py - HALL_CHEST[1]) < 2.6;
      if (sure || dc + n * CHAMBER_NOISE < 0) map.set(rect.x + u, rect.y + v, T_FLOOR);
    }
  }
  return {
    centre: { x: rect.x + h, z: rect.y + h },
    spot: { x: rect.x + HALL_UP[0], z: rect.y + HALL_UP[1] },
    inward: { x: 0, z: -1 },
    start: { x: rect.x + HALL_UP[0], z: rect.y + HALL_UP[1] - 2 },
  };
}

/** void next to floor becomes wall, eight ways round, as the old dungeons' (levelgen.ts buildWalls, not exported) */
function buildWalls(map: TileMap) {
  const { w, h, tiles } = map;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y * w + x] !== T_VOID) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (map.get(x + dx, y + dy) === T_FLOOR) near = true;
      if (near) tiles[y * w + x] = T_WALL;
    }
  }
}

// ───────────────────────────── dressing ─────────────────────────────

/**
 * Furniture that looks like one of D2's objects, which a maze has real ones of: coffins like its
 * caskets, shrine stones, barrels and kegs, boxes, crates and trunks like its chests. The dressing's
 * are taken out again, so whatever looks as if it opens does.
 */
const LOOKALIKE = new Set([
  'h_coffin', 'h_coffin_decorated', 'h_shrine', 'h_shrine_candles', 'd_barrel_small', 'd_barrel_large_decorated', 'd_barrel_small_stack',
  'd_keg', 'd_keg_decorated', 'd_box_small', 'd_box_large', 'd_box_stacked', 'd_crates_stacked', 'd_trunk_large_B', 'd_trunk_small_A',
]);
const BONES = ['h_bone_A', 'h_bone_B', 'h_bone_C', 'h_ribcage', 'h_skull'];

/**
 * The props without the ones `drop` names, their solid footprints given back as floor (Furnisher.place
 * made them T_PROP; floor given back can't cut anything off)
 */
function dropProps(map: TileMap, props: Prop[], drop: (model: string) => boolean): Prop[] {
  return props.filter((p) => {
    if (!drop(p.model)) return true;
    const def = PROP_DEFS[p.model];
    if (def?.solid) {
      // place() turned it k quarter turns and jittered it less than an eighth
      const k = ((Math.round(p.rot / (Math.PI / 2)) % 4) + 4) % 4;
      const fw = k % 2 ? def.d : def.w;
      const fd = k % 2 ? def.w : def.d;
      const tx = Math.round(p.x - fw / 2);
      const ty = Math.round(p.z - fd / 2);
      for (let y = ty; y < ty + fd; y++) for (let x = tx; x < tx + fw; x++) if (map.get(x, y) === T_PROP) map.set(x, y, T_FLOOR);
    }
    return false;
  });
}

/** the inside tiles in front of each of a crypt room's doors, kept clear of the dressing */
function keepDoorways(f: Furnisher, rect: Room, mask: number) {
  for (const d of [0, 1, 2, 3]) {
    if (!(mask & BIT[d])) continue;
    const mid = { x: rect.x + rect.w / 2 + DX[d] * (rect.w / 2 - 1.5), z: rect.y + rect.h / 2 + DY[d] * (rect.h / 2 - 1.5) };
    f.reserveAround(mid, 2);
  }
}

/** a cave theme room's dressing (its DS1 unseen): an abandoned camp in the chamber, bones round it */
function dressCaveTheme(f: Furnisher, rng: RNG, c: P2) {
  const tx = Math.floor(c.x) - 1;
  const ty = Math.floor(c.z) - 1;
  if (!f.place('d_bed_frame', tx, ty, rng.int(0, 1))) f.place('d_bed_frame', tx + 2, ty + 1, 0);
  f.place('d_table_long_broken', tx + 3, ty - 1, rng.int(0, 3));
  f.scatter('d_sword_shield_broken', c.x - 1.5, c.z + 2);
  f.scatter('d_bottle_A_labeled_brown', c.x + 2, c.z + 1.5);
  for (let k = 0; k < 10; k++) f.scatter(rng.pick(BONES), c.x + rng.range(-6, 6), c.z + rng.range(-6, 6));
  for (let k = 0; k < 3; k++) f.placeDecor('skullpile', Math.floor(c.x + rng.range(-6, 6)), Math.floor(c.z + rng.range(-6, 6)), true);
}

/**
 * A crypt theme room's (CryptXTheme.ds1 unseen): a chapel, benches before a plaque on its north wall,
 * when that wall has no door; else a reading room, its tables, shelves on the walls
 */
function dressCryptTheme(f: Furnisher, map: TileMap, rng: RNG, r: Room, mask: number) {
  const x0 = r.x + 1;
  const y0 = r.y + 1;
  const x1 = r.x + r.w - 2;
  const y1 = r.y + r.h - 2;
  keepDoorways(f, r, mask);
  if (!(mask & BIT[1])) {
    const cx = r.x + (r.w >> 1);
    f.place('h_plaque_candles', cx, y0, 0);
    f.scatter('d_candle_triple', cx - 1.5, y0 + 0.5);
    f.scatter('d_candle_triple', cx + 2.5, y0 + 0.5);
    for (let y = y0 + 3; y < y1; y += 2) for (let x = x0 + 1; x < x1; x++) if (x !== cx) f.place(rng.chance(0.25) ? 'h_bench_decorated' : 'h_bench', x, y, 0);
  } else {
    for (let k = 0; k < 2; k++) {
      const tx = rng.int(x0 + 1, x1 - 2);
      const ty = rng.int(y0 + 1, y1 - 2);
      if (f.place('d_table_small_decorated_A', tx, ty, rng.int(0, 3))) {
        f.scatter('d_chair', tx + 0.5, ty + 1.5);
        f.scatter('d_candle_lit', tx + 1.5, ty + 0.5);
      }
    }
    for (let x = x0 + 1; x < x1; x += 2) if (map.get(x, r.y) === T_WALL) f.hang('d_shelves', x + 0.5, y0 - 0.02, 0, 1);
    for (let y = y0 + 1; y < y1; y += 2) if (map.get(r.x, y) === T_WALL) f.hang('d_shelves', x0 - 0.02, y + 0.5, 1, 0);
    f.scatter('d_bottle_A_labeled_brown', x0 + rng.range(1, r.w - 3), y0 + rng.range(1, r.h - 3));
  }
  for (let k = 0; k < 3; k++) f.scatter('h_skull_candle', x0 + rng.range(0.5, r.w - 2.5), y0 + rng.range(0.5, r.h - 2.5));
}

/** a room's wall tiles that face the camera (floor at +z or +x) mid-wall, where a torch hangs (as levelgen.ts torchSpots, not exported) */
function torchSpots(map: TileMap, r: Room): Torch[] {
  const out: Torch[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (map.get(x, y) !== T_WALL) continue;
      if (map.walkable(x, y + 1) && map.get(x - 1, y) === T_WALL && map.get(x + 1, y) === T_WALL) out.push({ x: x + 0.5, z: y + 1 - 0.02, nx: 0, nz: 1 });
      else if (map.walkable(x + 1, y) && map.get(x, y - 1) === T_WALL && map.get(x, y + 1) === T_WALL) out.push({ x: x + 1 - 0.02, z: y + 0.5, nx: 1, nz: 0 });
    }
  }
  return out;
}

// ───────────────────────────── the level ─────────────────────────────

/** the areas' names, the rename table's (D2X_AREAS name) */
const AREA_NAMES = new Map(D2X_AREAS.map((a) => [a.id, a.name]));
const SUPERUNIQUES = new Map(D2X_SUPERUNIQUES.map((s) => [s.key, s]));

/** a maze level for `spec`: the Layout the game builds a Level from, and what Layout has no fields for */
export function generateMaze(spec: MazeSpec): MazeResult {
  const maze = D2X_MAZES[spec.area];
  if (!maze) throw new Error(`no maze row for area ${spec.area}`);
  const fixed = spec.fixed !== undefined;
  const cave = spec.style === 'cave';
  const C = Math.round(maze.size[0] * OUT_SCALE);
  const graph: MazeGraphRoom[] = fixed ? [{ gx: 0, gy: 0, mask: 0, preset: 0, variant: 0, theme: false, special: -1, links: [] }] : mazeGraph(spec);
  const gx0 = Math.min(...graph.map((r) => r.gx));
  const gy0 = Math.min(...graph.map((r) => r.gy));
  const gw = Math.max(...graph.map((r) => r.gx)) - gx0 + 1;
  const gh = Math.max(...graph.map((r) => r.gy)) - gy0 + 1;
  const map = new TileMap(gw * C + 2 * MARGIN, gh * C + 2 * MARGIN);
  const rng = new RNG(spec.fixed ?? stream(spec.seed, 1));
  const noise = valueNoise(rng);
  const pillars = new Set<number>();

  // ── cut the rooms ──
  const cells: MazeCell[] = [];
  const points: CellPoints[] = [];
  for (const g of graph) {
    const rect: Room = { x: MARGIN + (g.gx - gx0) * C, y: MARGIN + (g.gy - gy0) * C, w: C, h: C };
    const kind = g.special >= 0 ? spec.specials[g.special].kind : undefined;
    let shape: MazeCell['shape'] = 'chamber';
    let p: CellPoints;
    if (fixed) p = carveHall(map, rect, rng, noise);
    else if (cave) p = carveCave(map, rect, g.mask, g.variant, g.theme, kind, rng, noise);
    else {
      // a dead end, a special or a theme room is a walled room; the rest go by their file, the first
      // a room and the second a corridor, so the two alternate as D2's files do
      const ways = [1, 2, 4, 8].filter((b) => g.mask & b).length;
      shape = ways <= 1 || kind || g.theme || g.variant === 0 ? 'room' : 'corridor';
      const withPillars = shape === 'room' && !kind && !g.theme && ways >= 3 && g.variant === 0;
      p = carveCrypt(map, rect, g.mask, shape, withPillars ? pillars : null, kind);
    }
    cells.push({ ...g, rect, shape });
    points.push(p);
  }

  // ── the specials' things ──
  const specials: MazeSpecialAt[] = [];
  const entrances: Entrance[] = [];
  const superUniques: SuperUnique[] = [];
  let start: P2 | null = null;
  let treasure: { pos: P2; chest: number } | null = null;
  // each special and the room it is in: a maze's own room, or the hall for all of Cave Level 2's
  const where = fixed ? spec.specials.map((_, k) => ({ k, i: 0 })) : cells.flatMap((c, i) => (c.special >= 0 ? [{ k: c.special, i }] : []));
  for (const { k, i } of where) {
    const sp = spec.specials[k];
    const p = points[i];
    // the hall's chest stands on its dais against the north wall, its way up at the south end
    const pos = fixed && sp.kind === 'treasure' ? { x: cells[0].rect.x + HALL_CHEST[0], z: cells[0].rect.y + HALL_CHEST[1] } : { ...p.spot! };
    specials.push({ kind: sp.kind, cell: i, pos });
    if (sp.kind === 'up' || sp.kind === 'down') {
      entrances.push({ x: pos.x, z: pos.z, dest: sp.dest, name: AREA_NAMES.get(sp.dest) ?? '', kind: sp.kind === 'up' ? 'up' : 'cave', nx: p.inward!.x, nz: p.inward!.z });
      if (sp.kind === 'up') start = { ...p.start! };
    } else if (sp.kind === 'boss') {
      const su = SUPERUNIQUES.get(sp.superUnique);
      if (su) superUniques.push({ pos: { ...pos }, key: su.key, monster: su.mon, name: su.name });
    } else treasure = { pos: { ...pos }, chest: sp.chest };
  }
  const from = start;
  if (!from) throw new Error(`maze ${spec.area} (seed ${spec.seed}) has no way in`);

  // ── the map: floor the way in doesn't reach goes back to rock, walls round the rest ──
  const seen = flood(map, from);
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === T_FLOOR && !seen[i]) map.tiles[i] = T_VOID;
  buildWalls(map);

  // ── D2's 8×8-tile rooms, which objects and monsters go by: a cave room cut 3 × 3, a crypt room
  // whole (DRLGPRESET_BuildArea, DrlgPreset.cpp:1240-1294; one room up to 12×12, DrlgMaze.cpp:3337) ──
  const R = Math.round(8 * OUT_SCALE);
  const per = Math.max(1, Math.round(C / R));
  const rooms: { room: Room; cell: number }[] = [];
  cells.forEach((c, i) => {
    for (let j = 0; j < per; j++) for (let k = 0; k < per; k++) rooms.push({ room: { x: c.rect.x + k * R, y: c.rect.y + j * R, w: R, h: R }, cell: i });
  });
  // in the order the hero comes to them: by the nearest floor's walk from the way in (one of solid
  // rock comes with its maze room's nearest)
  const walk = bfsDistances(map, from);
  const near = rooms.map(({ room: r }) => {
    let best = Infinity;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const d = walk[y * map.w + x];
        if (d >= 0 && d < best) best = d;
      }
    }
    return best;
  });
  const cellNear = cells.map((_, i) => Math.min(...near.filter((_, k) => rooms[k].cell === i)));
  const key = (k: number) => (Number.isFinite(near[k]) ? near[k] : cellNear[rooms[k].cell] + 0.5);
  const order = rooms.map((_, k) => k).sort((a, b) => key(a) - key(b) || a - b);
  const subRooms: SubRoom[] = order.map((k) => {
    const r = rooms[k].room;
    return { x: r.x * SUB, y: r.y * SUB, w: r.w * SUB, h: r.h * SUB };
  });

  // ── D2's objects, then our dressing round them, so the objects come at D2's density (Cave Level
  // 2's hall, one fixed map, is dressed first by its own seed, as D2's preset holds its own) ──
  const objSeed = new D2Seed(stream(spec.seed, 2));
  // the shrines' kinds on a seed of their own, as D2 rolls them on its object control seed (objgroups.ts ObjectRoller)
  const objs = new ObjectRoller(map, objSeed, { trap: maze.trap, lock: maze.lock }, { level: spec.area, control: new D2Seed(stream(spec.seed, 4)) });
  objs.occ.keep(from, 3);
  for (const e of entrances) objs.occ.keep({ x: e.x, z: e.z }, 3);
  for (const u of superUniques) objs.occ.keep(u.pos, 2);
  if (treasure) objs.occ.keep(treasure.pos, 1.5);
  /** every object placed so far */
  const placed = (): PlacedObject[] => [...objs.chests, ...objs.barrels, ...objs.shrines, ...objs.caskets, ...objs.remains, ...objs.wells];
  /** the tiles round an object the dressing keeps off: its Objects.txt size (subtiles) halved, at least one */
  const clearOf = (o: PlacedObject) => Math.max(1, Math.ceil(Math.max(...(D2X_OBJECTS[o.id]?.size ?? [1, 1])) / SUB / 2));
  const placeObjects = () => {
    if (treasure) objs.presetChest(treasure.chest, Math.floor(treasure.pos.x * SUB), Math.floor(treasure.pos.z * SUB));
    objs.populate(subRooms, maze.objGroups);
    // a cave theme room holds a chest of its preset's (581); how many the unseen Cave*Theme1.ds1
    // have isn't known, so one, nearest its chamber's middle. Its units are read as the room comes
    // (a theme preset has no Scan: DRLGPRESET_SpawnHardcodedPresetUnits, DrlgPreset.cpp:784-792),
    // and a 581 is left out on !(rand & 3), one time in four (AddPresetUnitToDrlgMap, 744-750)
    if (cave) {
      cells.forEach((c, i) => {
        if (!c.theme || !(objSeed.roll() & 3)) return;
        const mid = points[i].centre;
        const own = order.map((k, s) => ({ k, s })).filter(({ k }) => rooms[k].cell === i);
        own.sort((a, b) => Math.hypot(rooms[a.k].room.x + R / 2 - mid.x, rooms[a.k].room.y + R / 2 - mid.z) - Math.hypot(rooms[b.k].room.x + R / 2 - mid.x, rooms[b.k].room.y + R / 2 - mid.z));
        for (const { s } of own) {
          const spot = objs.createSpot(subRooms[s], 3, 3);
          if (!spot) continue;
          objs.presetChest(RANDOM_CHEST, spot[0], spot[1]);
          break;
        }
      });
    }
  };

  const furnRng = new RNG(spec.fixed ?? stream(spec.seed, 3));
  const torches: Torch[] = [];
  const furnish = (): Furnisher => {
    const keep: P2[] = [from, ...entrances.map((e) => ({ x: e.x, z: e.z })), ...superUniques.map((u) => u.pos)];
    if (treasure) keep.push(treasure.pos);
    const f = new Furnisher(map, furnRng, from, keep);
    f.reserveAround(from, 3);
    for (const e of entrances) f.reserveAround({ x: e.x, z: e.z }, 3);
    for (const o of placed()) f.reserveAround(o.pos, clearOf(o));
    // a torch or two on each crypt room's walls facing the camera, a corridor's one time in two;
    // D2's caves have none, only the hero's light (decisions: 洞里照原版不点火把)
    if (!cave) {
      for (const c of cells) {
        const spots = torchSpots(map, c.rect);
        const want = c.shape === 'corridor' ? (furnRng.chance(0.5) ? 1 : 0) : c.theme || c.special >= 0 ? 2 : 1;
        for (let k = 0; k < want && spots.length; k++) {
          const s = spots.splice(furnRng.int(0, spots.length - 1), 1)[0];
          if (!torches.some((t) => Math.abs(t.x - s.x) + Math.abs(t.z - s.z) < 3)) torches.push(s);
        }
      }
    }
    // the plain rooms by the theme's kinds of room (furnish.ts dressRooms): a cave room's nine
    // 8×8-tile rooms, a crypt room's floor, a corridor's crossing
    const plain: Room[] = [];
    cells.forEach((c, i) => {
      if (fixed || c.theme || c.special >= 0) return;
      if (cave) for (const r of rooms) if (r.cell === i) plain.push(r.room);
      if (!cave && c.shape === 'room') plain.push({ x: c.rect.x + 1, y: c.rect.y + 1, w: c.rect.w - 2, h: c.rect.h - 2 });
      if (!cave && c.shape === 'corridor') plain.push({ x: c.rect.x + DOOR0, y: c.rect.y + DOOR0, w: DOOR1 - DOOR0, h: DOOR1 - DOOR0 });
    });
    // a cave's rooms dressed as the old caves' whatever its look (levelgen.ts GROTTO_TILES)
    dressRooms(f, map, furnRng, cave ? THEMES.cave : spec.theme, plain, cave, { sparse: new Set(), torches });
    cells.forEach((c, i) => {
      const p = points[i];
      const kind = c.special >= 0 ? spec.specials[c.special].kind : undefined;
      if (c.theme) {
        if (cave) dressCaveTheme(f, furnRng, p.centre);
        else dressCryptTheme(f, map, furnRng, c.rect, c.mask);
      } else if (kind === 'boss') {
        // the boss's arena: bones, and candles round a crypt's
        for (let k = 0; k < 12; k++) f.scatter(furnRng.pick(BONES), p.centre.x + furnRng.range(-7, 7), p.centre.z + furnRng.range(-7, 7));
        if (!cave) for (let k = 0; k < 3; k++) f.scatter('h_skull_candle', p.centre.x + furnRng.range(-3, 3), p.centre.z + furnRng.range(-3, 3));
      } else if (kind === 'treasure' && treasure) {
        // the chest on its dais: candles either side in a crypt, bones and coin before it
        const t = treasure.pos;
        const side = Math.abs(p.inward?.x ?? 0) > 0 ? { x: 0, z: 1 } : { x: 1, z: 0 };
        if (!cave) keepDoorways(f, c.rect, c.mask);
        for (const s of [-1.6, 1.6]) f.scatter(cave ? 'h_skull' : 'd_candle_triple', t.x + side.x * s, t.z + side.z * s);
        if (!cave) for (const s of [-2.6, 2.6]) f.scatter('h_skull_candle', t.x + side.x * s, t.z + side.z * s);
        f.scatter('d_coin_stack_large', t.x + (p.inward?.x ?? 0) * 1.2, t.z + (p.inward?.z ?? 0) * 1.2);
      } else if (kind) {
        // a way in or out: a few bones
        for (let k = 0; k < (cave ? 5 : 2); k++) f.scatter(furnRng.pick(BONES), p.centre.x + furnRng.range(-4, 4), p.centre.z + furnRng.range(-4, 4));
      }
    });
    if (fixed) {
      // the hall, kept open: rocks and spires against its walls, bones, coin round the dais
      const r = cells[0].rect;
      const t = treasure?.pos ?? points[0].centre;
      const byWall: [number, number][] = [];
      const wallBeside = (x: number, y: number) => map.get(x + 1, y) === T_WALL || map.get(x - 1, y) === T_WALL || map.get(x, y + 1) === T_WALL || map.get(x, y - 1) === T_WALL;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (map.walkable(x, y) && wallBeside(x, y)) byWall.push([x, y]);
      const stones = ['x_rock_single_A', 'x_rock_single_B', 'x_rock_single_D', 'd_rubble_half'];
      for (let k = 0; k < 18 && byWall.length; k++) {
        const [x, y] = byWall[furnRng.int(0, byWall.length - 1)];
        if (k % 3) f.place(furnRng.pick(stones), x, y, furnRng.int(0, 3), 1.2);
        else f.placeDecor('stalagmite', x, y, true, furnRng.range(0.9, 1.5));
      }
      for (let k = 0; k < 12; k++) f.scatter(furnRng.pick(BONES), r.x + furnRng.range(3, r.w - 3), r.y + furnRng.range(3, r.h - 3));
      for (const [dx, dz] of [[-1.6, 0.4], [1.6, 0.4], [-0.9, 1.4], [0.9, 1.4]]) f.scatter('d_coin_stack_large', t.x + dx, t.z + dz);
    }
    // no look-alikes of the real objects, and in a cave no lights but the hero's: no candles, lanterns
    // or lit shelves, on the floor or on the walls
    f.props = dropProps(map, f.props, (m) => LOOKALIKE.has(m) || (cave && !!PROP_DEFS[m]?.light));
    if (cave) f.wall = f.wall.filter((w) => !w.light);
    return f;
  };
  let f: Furnisher;
  if (fixed) {
    f = furnish();
    placeObjects();
    // the hall was dressed first, as its preset is: what lies loose on the floor (bones, coin) where
    // an object came is taken up again, so nothing lies on a well or under a chest; the solid
    // pieces were rock to the objects already (Occupancy)
    const objects = placed();
    f.props = f.props.filter((p) => PROP_DEFS[p.model]?.solid || !objects.some((o) => Math.max(Math.abs(p.x - o.pos.x), Math.abs(p.z - o.pos.z)) < clearOf(o) + 0.5));
  } else {
    placeObjects();
    f = furnish();
  }

  // ── the monsters' rooms: D2's, but none reaching within 6 tiles' walk of the way in, and none
  // with too little floor to stand on (16 tiles, as zone.ts) ──
  const after = bfsDistances(map, from);
  const spawnRooms: Room[] = [];
  for (const k of order) {
    const r = rooms[k].room;
    let floor = 0;
    let close = false;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const d = after[y * map.w + x];
        if (d < 0) continue;
        floor++;
        if (d <= 6) close = true;
      }
    }
    if (floor >= 16 && !close) spawnRooms.push(r);
  }

  // the special rooms by their lvlprest Def (the side's: W, E, S, N after the west one), and Cave
  // Level 2's one hall by its own, as Layout.presets has them
  const presets: PresetSpot[] = fixed
    ? [{ kind: 'hall', d2: spec.fixed, rect: { ...cells[0].rect }, area: spec.area }]
    : cells.flatMap((c) => (c.special < 0 ? [] : [{ kind: spec.specials[c.special].kind, d2: c.preset, rect: { ...c.rect }, area: spec.area }]));

  const layout: Layout = {
    map,
    theme: spec.theme,
    start: { ...from },
    waypoints: [],
    rooms: cells.map((c) => c.rect),
    spawnRooms,
    torches,
    decor: f.decor,
    // the objects with what D2 rolled for them, which the game's objects take (level.ts): what using
    // them does is the objects' own (src/game/containers.ts, interact.ts)
    chests: objs.chests.map((c) => ({
      ...c.pos,
      d2: c.id,
      ...(c.locked ? { locked: true } : {}),
      ...(c.trap ? { trap: c.trap } : {}),
      ...(c.sparkly ? { sparkly: c.consolation ? ('consolation' as const) : ('unique' as const) } : {}),
    })),
    barrels: objs.barrels.map((b) => ({ ...b.pos, d2: b.id, ...(b.exploding ? { exploding: true } : {}), ...(b.opened ? { opened: true } : {}) })),
    pillars,
    services: [],
    shrines: objs.shrines.map((s) => ({ ...s.pos, kind: s.kind, d2: s.id, shrine: s.shrine })),
    caskets: objs.caskets,
    remains: objs.remains,
    wells: objs.wells,
    presets,
    props: f.props,
    wallDecor: f.wall,
    areaOf: new Uint16Array(map.w * map.h).fill(spec.area),
    entrances,
    superUniques,
  };
  const extra: MazeExtra = {
    style: spec.style,
    cell: C,
    cells,
    specials,
    objRooms: order.map((k) => rooms[k].room),
    chests: objs.chests,
    barrels: objs.barrels,
    shrines: objs.shrines,
    caskets: objs.caskets,
    remains: objs.remains,
    wells: objs.wells,
  };
  return { layout, extra };
}
