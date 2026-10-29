import type { P2, RNG } from '../core/math';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import type { Furnisher, Prop } from './furnish';
import { generateTown, type Decor, type Entrance, type House, type Npc, type Service } from './levelgen';
import { BIG_ROCKS } from './outdoors';
import { T_FLOOR, T_VOID, T_WALL, type TileMap } from './tilemap';

/**
 * Presets: fixed pieces of map set down in an area at an origin, Diablo II's LvlPrest DS1 files
 * (DRLGOUTDOORS_SpawnOutdoorLevelPresetEx). D2's art isn't ours to use, so these are our own: the
 * camp, which D2 builds from one preset too (levels.json DrlgType 2 for the Rogue Encampment), and
 * the set pieces an outdoor area puts in some of its 8×8 cells (src/world/zone.ts).
 */

/** a road's end: a point and the way the road heads from it, into the area */
export interface Way {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

// ───────────────────────────── the camp ─────────────────────────────

export interface CampPreset {
  w: number;
  h: number;
  /** its tiles; T_VOID is ground it leaves to the area round it */
  tiles: Uint8Array;
  /** per tile, the four ground weights (Layout.ground) */
  ground: Uint8Array;
  props: Prop[];
  decor: Decor[];
  houses: House[];
  npcs: Npc[];
  services: Service[];
  /**
   * Kashya's place (docs/M2A-STEP0.md 2.12): her hirelings' service, where the camp's rogue stands now
   * (its npcs' 'rogue', the npc_rogue she is to be drawn from: docs/M2A.md 美术), named by her row
   * (tools/d2-names/npcs.json). Not among `services` yet: M2a's M line puts her there, in that rogue's
   * place, once hiring is played, so the camp is as it was until then
   */
  hire: Service;
  waypoint: P2;
  start: P2;
  /** the east gate, where the road out leaves the palisade: its one way out, so it is the camp's port */
  gate: Way;
}

let camp: CampPreset | undefined;

/**
 * The camp as a preset: generateTown's camp, the one the game has now (so the two can't drift),
 * cut to its palisade. What it grew past the palisade, the woods and the track out of the gate, is
 * for the area round it to make where the camp sits in the world. Positions are its own tiles.
 */
export function campPreset(): CampPreset {
  if (camp) return camp;
  const L = generateTown(0);
  const { map } = L;
  // its furniture stands on its own tiles; the woods it grew stand on the void round them
  const mine = (p: P2) => map.get(Math.floor(p.x), Math.floor(p.z)) !== T_VOID;
  const exit = L.exits![0];
  const rogue = (L.npcs ?? []).find((n) => n.model === 'rogue');
  if (!rogue) throw new Error("campPreset: the camp has no rogue where Kashya is to stand");
  const kashya = D2X_MONSTERS.kashya;
  camp = {
    w: map.w,
    h: map.h,
    tiles: map.tiles.slice(),
    ground: L.ground!.slice(),
    props: L.props.filter(mine),
    decor: L.decor,
    houses: L.houses ?? [],
    npcs: L.npcs ?? [],
    services: L.services,
    hire: { kind: 'hire', pos: { x: rogue.x, z: rogue.z }, npc: kashya.name, npcId: kashya.id },
    waypoint: L.waypoints[0].pos,
    start: L.start,
    // the exit's normal points back in; the road leaves the other way, from the map's edge
    gate: { x: exit.nx < 0 ? map.w : 0, z: exit.z, nx: -exit.nx, nz: -exit.nz },
  };
  return camp;
}

/** the camp's tiles written into `map` with its top-left at (ox, oz), and its pieces moved there */
export function stampCamp(map: TileMap, ox: number, oz: number) {
  const c = campPreset();
  for (let z = 0; z < c.h; z++) {
    for (let x = 0; x < c.w; x++) {
      const t = c.tiles[z * c.w + x];
      if (t !== T_VOID) map.set(ox + x, oz + z, t);
    }
  }
  const at = (p: P2): P2 => ({ x: p.x + ox, z: p.z + oz });
  return {
    props: c.props.map((p) => ({ ...p, x: p.x + ox, z: p.z + oz })),
    decor: c.decor.map((d) => ({ ...d, x: d.x + ox, z: d.z + oz })),
    houses: c.houses.map((h) => ({ ...h, x: h.x + ox, y: h.y + oz })),
    npcs: c.npcs.map((n) => ({ ...n, x: n.x + ox, z: n.z + oz })),
    services: c.services.map((s) => ({ ...s, pos: at(s.pos) })),
    hire: { ...c.hire, pos: at(c.hire.pos) },
    waypoint: at(c.waypoint),
    start: at(c.start),
    gate: { ...c.gate, x: c.gate.x + ox, z: c.gate.z + oz },
  };
}

// ───────────────────────────── cell presets ─────────────────────────────

/** the set pieces an outdoor area puts in its cells, for D2's Act 1 wilderness LvlPrest rows */
export type CellPreset = 'waypoint' | 'cave' | 'cliffcave' | 'shrine' | 'stones' | 'graveyard' | 'ruins' | 'camp' | 'cairn';

export interface CellPresetDef {
  /** how many cells it takes each way */
  cells: number;
  /** the clearing round its middle, in tiles */
  r: number;
  /** a footpath runs to it off the road (the waypoint stands on the road itself) */
  path: boolean;
  /** what its clearing is floored with */
  floor: 'dirt' | 'stone';
}

export const CELL_PRESETS: Record<CellPreset, CellPresetDef> = {
  // the waypoint and shrines take a cell each, as D2 flags one cell for each (DRLGOUTDOORS_SpawnAct12Waypoint, _SpawnAct12Shrines)
  waypoint: { cells: 1, r: 3, path: false, floor: 'stone' },
  // one cell, as D2's cave mouths (lvlprest.json "Act 1 - DOE Entrance", "Act 1 - Cave Entrance": 8×8)
  cave: { cells: 1, r: 3.5, path: true, floor: 'stone' },
  // a cave mouth at the foot of a cliff (Stony Field's way into the Underground Passage), in a border
  // cell: a notch in the rock, the cliff the ridge round it
  cliffcave: { cells: 1, r: 2.4, path: true, floor: 'stone' },
  shrine: { cells: 1, r: 3.5, path: false, floor: 'dirt' },
  // an outcrop in a cell of its own, no clearing ("Act 1 - Stone Fill 1/2": 8×8)
  stones: { cells: 1, r: 0, path: false, floor: 'stone' },
  // the sights of the wilderness map (src/world/wild.ts), kept as big as they are there, two cells
  // each way (16×16 tiles). D2's cottages, pond and fallen camps take one cell (lvlprest.json "Act 1 -
  // Cottages 1–3", "Pond", "Fallen Camp …": 8×8), 10×10 at our 1.25 times: ours are bigger by choice,
  // so the pieces wild.ts lays out still fit, not because D2's cells are bigger
  graveyard: { cells: 2, r: 6.5, path: true, floor: 'dirt' },
  ruins: { cells: 2, r: 6, path: true, floor: 'stone' },
  camp: { cells: 2, r: 7, path: true, floor: 'dirt' },
  // Stony Field's Cairn Stones (lvlprest 160, cairn2.ds1, which DrlgOutWild.cpp:491-494 sets down), as
  // big as our other sights: a ring of stones in a clearing, a footpath to it
  cairn: { cells: 2, r: 5.5, path: true, floor: 'dirt' },
};

/** what the presets leave for the level besides their props */
export interface PresetOut {
  chests: P2[];
  barrels: P2[];
  shrines: P2[];
  /** monster camps: an elite pack waits by each */
  elites: P2[];
  services: Service[];
  /** the rocks set down, for the stone the ground shows round them */
  rocks: P2[];
  /** the Cairn Stones, when a cairn was set down: their middle and each stone (Layout.cairn) */
  cairn?: { center: P2; stones: P2[] };
}

const ROCKS = ['x_rock_single_A', 'x_rock_single_B', 'x_rock_single_D'];
/** a Cairn Stone: the graveyard pack's stone post (the camp's rift obelisk too), stood up bigger, until the A line's stones (docs/M2A.md 美术) */
const CAIRN_STONE = 'h_fence_pillar';
const CAIRN_STONE_SCALE = 1.9;
/** the ring's radius in tiles */
const CAIRN_R = 2.7;
const GRAVES = ['h_grave_A', 'h_grave_B', 'h_gravestone', 'h_gravemarker_A', 'h_gravemarker_B', 'h_grave_A_destroyed'];

const tile = (p: P2) => ({ x: Math.floor(p.x), z: Math.floor(p.z) });

/** a chest or barrel goes on the list and its tile is kept, so no grove grows over it later */
function keep(furn: Furnisher, list: P2[], p: P2) {
  furn.reserveAround(p, 0);
  list.push(p);
}

/**
 * The ruins' low broken stone walls, cut into the map before anything is furnished: a door where the
 * footpath comes in (`onPath`) and a second way in opposite it, from `from`. As in wild.ts.
 */
export function carveRuins(map: TileMap, rng: RNG, c: P2, from: P2, onPath: (x: number, z: number) => boolean) {
  const rx = Math.floor(c.x) - 4;
  const rz = Math.floor(c.z) - 3;
  for (let z = rz; z <= rz + 6; z++) {
    for (let x = rx; x <= rx + 8; x++) {
      const edge = x === rx || x === rx + 8 || z === rz || z === rz + 6;
      if (!edge || onPath(x, z) || rng.chance(0.3)) continue;
      map.set(x, z, T_WALL);
    }
  }
  const back = { x: c.x * 2 - from.x, z: c.z * 2 - from.z };
  for (let z = rz; z <= rz + 6; z++) {
    for (let x = rx; x <= rx + 8; x++) {
      const near = Math.hypot(x + 0.5 - (c.x + (back.x - c.x) * 0.45), z + 0.5 - (c.z + (back.z - c.z) * 0.45)) < 1.8;
      if (near && map.get(x, z) === T_WALL) map.set(x, z, T_FLOOR);
    }
  }
}

/**
 * Furnish a cell preset whose middle is `c` (a tile's centre). `face` is the way it opens, toward
 * where its footpath comes from; only the cave mouth turns to it.
 */
export function dressPreset(kind: CellPreset, furn: Furnisher, rng: RNG, c: P2, face: P2, out: PresetOut) {
  const t = tile(c);
  switch (kind) {
    case 'waypoint': {
      // the pad is the ground's (stone); lanterns either side, so it reads from across the field
      furn.reserveAround(c, 2);
      furn.place('h_lantern_standing', t.x - 3, t.z - 1, 0);
      furn.place('h_lantern_standing', t.x + 3, t.z - 1, 0);
      break;
    }
    case 'cave': {
      // the mouth in a low ridge of rock behind it, bones before it; offsets are for facing +z
      furn.reserveAround(c, 1);
      const turn = (dx: number, dz: number) => ({ x: dx * face.z + dz * face.x, z: -dx * face.x + dz * face.z });
      const ridge: [number, number, boolean][] = [
        [-3.5, -3.5, true],
        [3.5, -3.5, true],
        [-2, -3, false],
        [-1, -3, false],
        [0, -3, false],
        [1, -3, false],
        [2, -3, false],
        [-3.5, -0.5, false],
        [3.5, -0.5, false],
      ];
      for (const [dx, dz, big] of ridge) {
        const o = turn(dx, dz);
        const x = c.x + o.x;
        const z = c.z + o.z;
        // a big rock's footprint is 2×2, so its middle sits on a tile corner
        const ok = big
          ? furn.place(rng.pick(BIG_ROCKS), Math.round(x) - 1, Math.round(z) - 1, rng.int(0, 3), 0.6)
          : furn.place(rng.pick(ROCKS), Math.floor(x), Math.floor(z), rng.int(0, 3), 0.6);
        if (ok) out.rocks.push(big ? { x: Math.round(x), z: Math.round(z) } : { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 });
      }
      const tree = turn(4.5, -2);
      furn.place('h_tree_dead_medium', Math.floor(c.x + tree.x), Math.floor(c.z + tree.z), rng.int(0, 3));
      for (let k = 0; k < 3; k++) {
        const o = turn(rng.range(-2, 2), rng.range(1.5, 3));
        furn.placeDecor('bones', Math.floor(c.x + o.x), Math.floor(c.z + o.z), false);
      }
      break;
    }
    case 'cliffcave': {
      // the mouth in the cliff's foot: the cliff is its ridge, a big rock fallen either side, bones
      // before it; offsets are for facing +z (face is into the area)
      furn.reserveAround(c, 1);
      const turn = (dx: number, dz: number) => ({ x: dx * face.z + dz * face.x, z: -dx * face.x + dz * face.z });
      for (const dx of [-3, 3]) {
        const o = turn(dx, 0.5);
        const x = Math.round(c.x + o.x);
        const z = Math.round(c.z + o.z);
        if (furn.place(rng.pick(BIG_ROCKS), x - 1, z - 1, rng.int(0, 3), 0.6)) out.rocks.push({ x, z });
      }
      for (let k = 0; k < 3; k++) {
        const o = turn(rng.range(-1.5, 1.5), rng.range(1.5, 2.8));
        furn.placeDecor('bones', Math.floor(c.x + o.x), Math.floor(c.z + o.z), false);
      }
      break;
    }
    case 'cairn': {
      // five standing stones round its middle, one at each corner of a pentagon: D2's StoneAlpha, Beta,
      // Gamma, Delta and Lambda (Objects.txt 17-21, cairn2.ds1). They're scenery in M2a; StoneTheta
      // (22), the order they're touched in and the way to Tristram come with the quest in M2b
      // (docs/M2A.md 凯恩之石). Rakanishu waits in the ring (overworld.ts DRESS)
      const stones: P2[] = [];
      const a0 = rng.range(0, Math.PI * 2);
      for (let k = 0; k < 5; k++) {
        const a = a0 + (k / 5) * Math.PI * 2;
        const x = Math.floor(c.x + Math.sin(a) * CAIRN_R);
        const z = Math.floor(c.z + Math.cos(a) * CAIRN_R);
        if (!furn.place(CAIRN_STONE, x, z, rng.int(0, 3), 0.5)) continue;
        furn.props[furn.props.length - 1].scale *= CAIRN_STONE_SCALE;
        stones.push({ x: x + 0.5, z: z + 0.5 });
      }
      // a few small stones fallen about the ring, and old bones
      for (let k = 0; k < 4; k++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(CAIRN_R + 1.2, CAIRN_R + 3);
        const x = Math.floor(c.x + Math.sin(a) * r);
        const z = Math.floor(c.z + Math.cos(a) * r);
        if (furn.place(rng.pick(ROCKS), x, z, rng.int(0, 3), 1)) out.rocks.push({ x: x + 0.5, z: z + 0.5 });
      }
      for (let k = 0; k < 2; k++) furn.placeDecor('bones', t.x + rng.int(-1, 1), t.z + rng.int(-1, 1), false, rng.range(0.8, 1.1));
      out.cairn = { center: { ...c }, stones };
      break;
    }
    case 'shrine': {
      // as wild.ts: lanterns either side of it
      out.shrines.push({ x: t.x + 0.5, z: t.z + 0.5 });
      furn.reserveAround(c, 1);
      for (const [dx, dz] of [[-2, -1], [2, -1]]) furn.place('h_lantern_standing', t.x + dx, t.z + dz, 0);
      break;
    }
    case 'stones': {
      // two boulders and smaller stones round them, filling the cell
      for (let k = 0; k < 7; k++) {
        const big = k < 2;
        const x = t.x + rng.int(-3, big ? 2 : 3);
        const z = t.z + rng.int(-3, big ? 2 : 3);
        if (furn.place(rng.pick(big ? BIG_ROCKS : ROCKS), x, z, rng.int(0, 3), 1)) out.rocks.push({ x: x + (big ? 1 : 0.5), z: z + (big ? 1 : 0.5) });
      }
      break;
    }
    case 'graveyard': {
      // as wild.ts: fenced on the far sides (north and west), so the fence never hides the graves from the camera
      const gx = t.x - 4;
      const gz = t.z - 3;
      furn.place('h_fence_pillar', gx, gz, 0);
      for (let x = gx + 1; x <= gx + 7; x += 2) furn.place(rng.chance(0.25) ? 'h_fence_broken' : 'h_fence', x, gz, 0);
      for (let z = gz + 1; z <= gz + 5; z += 2) if (rng.chance(0.8)) furn.place(rng.chance(0.25) ? 'h_fence_broken' : 'h_fence', gx, z, 1);
      for (let z = gz + 2; z <= gz + 6; z += 2) for (let x = gx + 2; x <= gx + 8; x += 2) if (rng.chance(0.7)) furn.place(rng.pick(GRAVES), x, z, 0);
      furn.place(rng.chance(0.5) ? 'h_tree_dead_large' : 'h_tree_dead_medium', gx + 9, gz, rng.int(0, 3));
      for (let k = 0; k < 3; k++) furn.scatter(rng.chance(0.5) ? 'h_skull_candle' : 'h_candle_melted', gx + rng.range(2, 8), gz + rng.range(2, 6));
      if (rng.chance(0.6)) keep(furn, out.chests, { x: gx + 5.5, z: gz + 1.5 });
      break;
    }
    case 'ruins': {
      // as wild.ts: pillars at the inner corners of the walls carveRuins cut, some fallen
      const rx = t.x - 4;
      const rz = t.z - 3;
      for (const [x, z] of [[rx + 1, rz + 1], [rx + 7, rz + 1], [rx + 1, rz + 5], [rx + 7, rz + 5]]) {
        if (rng.chance(0.65)) furn.place(rng.chance(0.5) ? 'h_pillar' : 'd_pillar', x, z, 0);
        else furn.place(rng.chance(0.5) ? 'd_rubble_half' : 'd_rubble_large', x, z, rng.int(0, 1));
      }
      for (let k = 0; k < 4; k++) furn.placeDecor(rng.chance(0.6) ? 'rubble' : 'bones', rx + rng.int(2, 6), rz + rng.int(2, 4), false, rng.range(0.8, 1.2));
      keep(furn, out.chests, { x: rx + 4.5, z: rz + 1.5 });
      for (let k = 0; k < 2; k++) {
        const p = { x: rx + rng.range(-1, 9), z: rz + rng.range(7.2, 8.2) };
        if (furn.free(Math.floor(p.x), Math.floor(p.z))) keep(furn, out.barrels, p);
      }
      break;
    }
    case 'camp': {
      // as wild.ts: a fire, tents round it facing in, a banner, a cage; an elite pack sits by the fire
      const fire = { x: t.x + 0.5, z: t.z + 0.5 };
      out.services.push({ kind: 'campfire', pos: fire });
      furn.placeDecor('campfire', t.x, t.z, true);
      keep(furn, out.chests, { x: t.x + 0.5 + rng.pick([-2.5, 2.5]), z: t.z - 1.5 });
      const a0 = rng.range(0, Math.PI * 2);
      const tents = rng.int(2, 3);
      for (let k = 0; k < tents; k++) {
        const a = a0 + (k / tents) * Math.PI * 2;
        furn.place('p_tent', Math.round(t.x + Math.sin(a) * 4 - 0.5), Math.round(t.z + Math.cos(a) * 4 - 0.5), rng.int(0, 3), 0.4);
      }
      const free = () => ({ x: t.x + rng.int(-5, 5), z: t.z + rng.int(-5, 5) });
      for (const model of ['p_banner', 'p_cage', 'p_skullpile', 'p_skullpile']) {
        for (let k = 0; k < 8; k++) {
          const p = free();
          if (Math.hypot(p.x - t.x, p.z - t.z) > 2 && furn.place(model, p.x, p.z, rng.int(0, 3), 0.6)) break;
        }
      }
      for (let k = 0; k < 3; k++) furn.placeDecor('bones', t.x + rng.int(-4, 4), t.z + rng.int(-4, 4), false);
      for (let k = 0; k < 3; k++) {
        const p = { x: t.x + rng.range(-5, 5), z: t.z + rng.range(-5, 5) };
        if (Math.hypot(p.x - t.x, p.z - t.z) > 2.5 && furn.free(Math.floor(p.x), Math.floor(p.z))) keep(furn, out.barrels, p);
      }
      out.elites.push({ x: t.x + 0.5, z: t.z + 2 });
      break;
    }
  }
}

// ───────────────────────────── the Burial Grounds' graveyard ─────────────────────────────

/** how the graveyard is set into its area: its inner cells, the way in, and where its two stairways lead */
export interface GraveyardSpec {
  /** the first inner cell's top-left tile, and how many cells each way (the 4×6 inside the border ring) */
  x0: number;
  z0: number;
  cw: number;
  ch: number;
  /** the road's end at the area's port, heading in: the gate is where it crosses the graveyard's edge */
  gate: Way;
  /** the areas its stairways go down into, and what they're called: the Crypt's and the Mausoleum's */
  crypt: { dest: number; name: string };
  mausoleum: { dest: number; name: string };
}

type GravePlot = 'gate' | 'mausoleum' | 'crypt' | 'raven' | 'graves';

/** what the graveyard leaves besides its props */
export interface GraveyardOut {
  /** the two stairways down, the Crypt's and the Mausoleum's (Entrance kind 'cave': closed while their maps aren't built) */
  entrances: Entrance[];
  /** the plot in the middle where the dead are dug up: where the preset monster (Blood Raven) stands */
  raven: P2;
}

/** an outdoor cell's side in tiles (zone.ts CELL) */
const CELL_TILES = 8;
/** the walks run along each cell's edge, two tiles wide where two cells meet: whether a tile is on one, by its place in its cell */
export const onGraveWalk = (lx: number, lz: number) => lx === 0 || lz === 0 || lx === CELL_TILES - 1 || lz === CELL_TILES - 1;
/** the graves' kinds, the broken one less often (as wild.ts's graveyard) */
const GRAVE_KINDS = ['h_grave_A', 'h_grave_B', 'h_gravestone', 'h_gravemarker_A', 'h_gravemarker_B', 'h_grave_A', 'h_grave_B', 'h_grave_A_destroyed'];

/**
 * The Burial Grounds' graveyard (D2's levels.json Graveyard, 40×48, whose inside is the graveyard
 * preset: DrlgOutWild.cpp:586-588). D2's DS1 isn't ours, so this is our own, laid on the 8×8 cell
 * grid: every inner cell a plot with walks round it, two tiles wide where plots meet. The gate where
 * the road from Cold Plains comes in, under an arch; the Mausoleum (a crypt house, its stairway down
 * before its door) in the plot farthest from the gate; the Crypt's stairway in the plot farthest from
 * both; in the middle the plot of opened graves where Blood Raven waits (D2's place_bloodraven,
 * MonPreset act 1); graves in rows in the rest, a dead tree here and there. Fenced along its far
 * sides (north and west) and only posts along the near ones, so the fence never hides the graves from
 * the camera. Every solid piece goes through the Furnisher, so the whole of it stays walkable round.
 */
export function layGraveyard(furn: Furnisher, rng: RNG, g: GraveyardSpec, out: PresetOut): GraveyardOut {
  const C = CELL_TILES;
  const n = g.cw * g.ch;
  const cellOf = (i: number) => ({ cx: i % g.cw, cz: (i / g.cw) | 0 });
  const origin = (i: number) => ({ x: g.x0 + cellOf(i).cx * C, z: g.z0 + cellOf(i).cz * C });
  const middle = (i: number): P2 => ({ x: origin(i).x + C / 2, z: origin(i).z + C / 2 });
  // the gate's cell: the first one the road comes into past the edge
  const inside = { x: g.gate.x + g.gate.nx * (C + 1.5), z: g.gate.z + g.gate.nz * (C + 1.5) };
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
  const gate = clamp(Math.floor((inside.z - g.z0) / C), g.ch) * g.cw + clamp(Math.floor((inside.x - g.x0) / C), g.cw);
  const steps = (a: number, b: number) => Math.abs(cellOf(a).cx - cellOf(b).cx) + Math.abs(cellOf(a).cz - cellOf(b).cz);
  /** the cell scoring highest, ties to the northernmost (the camera's far side), then at random */
  const best = (score: (i: number) => number, skip: Set<number>) => {
    let at = -1;
    let top = -Infinity;
    for (let i = 0; i < n; i++) {
      if (skip.has(i)) continue;
      const s = score(i) - cellOf(i).cz * 0.01 + rng.next() * 0.001;
      if (s > top) {
        top = s;
        at = i;
      }
    }
    return at;
  };
  const plots: GravePlot[] = Array.from({ length: n }, () => 'graves');
  plots[gate] = 'gate';
  const mausoleum = best((i) => steps(i, gate), new Set([gate]));
  plots[mausoleum] = 'mausoleum';
  const crypt = best((i) => Math.min(steps(i, gate), steps(i, mausoleum) * 1.5), new Set([gate, mausoleum]));
  plots[crypt] = 'crypt';
  const mid = { cx: (g.cw - 1) / 2, cz: (g.ch - 1) / 2 };
  const raven = best((i) => -Math.hypot(cellOf(i).cx - mid.cx, cellOf(i).cz - mid.cz), new Set([gate, mausoleum, crypt]));
  plots[raven] = 'raven';

  // the stairways and Blood Raven's ground are kept clear before anything else is set down
  const entrances: Entrance[] = [];
  const way = (to: { dest: number; name: string }, p: P2, face: P2) => {
    furn.reserveAround(p, 1);
    entrances.push({ x: p.x, z: p.z, dest: to.dest, name: to.name, kind: 'cave', nx: face.x, nz: face.z });
  };
  const m0 = origin(mausoleum);
  way(g.mausoleum, { x: m0.x + 3.5, z: m0.z + 6.5 }, { x: 0, z: 1 });
  const cryptAt = { x: middle(crypt).x + 0.5, z: middle(crypt).z + 0.5 };
  const toGate = { x: middle(gate).x - cryptAt.x, z: middle(gate).z - cryptAt.z };
  way(g.crypt, cryptAt, Math.abs(toGate.x) > Math.abs(toGate.z) ? { x: Math.sign(toGate.x), z: 0 } : { x: 0, z: Math.sign(toGate.z) || 1 });
  const ravenAt = { ...middle(raven) };
  furn.reserveAround(ravenAt, 1);

  // ── the fence: the far sides (north and west) whole but at the gate, a post every few tiles along the near ones ──
  const W = g.cw * C;
  const H = g.ch * C;
  const gateAlong = g.gate.nz !== 0 ? g.gate.x : g.gate.z;
  const atGate = (side: 'n' | 's' | 'e' | 'w', along: number) => {
    const on = (side === 'n' && g.gate.nz > 0) || (side === 's' && g.gate.nz < 0) || (side === 'w' && g.gate.nx > 0) || (side === 'e' && g.gate.nx < 0);
    return on && Math.abs(along - gateAlong) < 4.5;
  };
  for (let x = g.x0; x < g.x0 + W - 1; x += 2) if (!atGate('n', x + 1)) furn.place(rng.chance(0.2) ? 'h_fence_broken' : 'h_fence', x, g.z0, 0);
  for (let z = g.z0 + 1; z < g.z0 + H - 1; z += 2) if (!atGate('w', z + 1)) furn.place(rng.chance(0.2) ? 'h_fence_broken' : 'h_fence', g.x0, z, 1);
  for (let x = g.x0 + 3; x < g.x0 + W; x += 4) if (!atGate('s', x + 0.5)) furn.place('h_fence_pillar', x, g.z0 + H - 1, 0);
  for (let z = g.z0 + 3; z < g.z0 + H - 1; z += 4) if (!atGate('e', z + 0.5)) furn.place('h_fence_pillar', g.x0 + W - 1, z, 0);
  // the gate: an arch over the way in where it crosses the edge, a lantern either side within
  const across = g.gate.nz !== 0;
  const edge = { x: g.gate.x + g.gate.nx * C, z: g.gate.z + g.gate.nz * C };
  const ex = Math.floor(edge.x) + (g.gate.nx < 0 ? -1 : 0);
  const ez = Math.floor(edge.z) + (g.gate.nz < 0 ? -1 : 0);
  furn.place('h_arch_gate', across ? ex - 1 : ex, across ? ez : ez - 1, across ? 0 : 1);
  for (const s of [-3, 3]) {
    const lx = Math.floor(edge.x + g.gate.nx * 2 + (across ? s : 0));
    const lz = Math.floor(edge.z + g.gate.nz * 2 + (across ? 0 : s));
    furn.place('h_lantern_standing', lx, lz, 0);
  }

  // ── the plots ──
  const chest = rng.chance(0.6) ? rng.int(0, n - 1) : -1;
  for (let i = 0; i < n; i++) {
    const { x: tx, z: tz } = origin(i);
    switch (plots[i]) {
      case 'mausoleum':
        // the crypt house over its stairway (its door faces +z, toward the camera), a lantern either side
        furn.place('h_crypt', tx + 2, tz + 1, 0);
        furn.place('h_lantern_standing', tx + 1, tz + 6, 0);
        furn.place('h_lantern_standing', tx + 6, tz + 6, 0);
        break;
      case 'crypt':
        // the stairway down in the open, skull posts at its corners and candles by it
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) furn.place('h_post_skull', Math.floor(cryptAt.x) + dx, Math.floor(cryptAt.z) + dz, rng.int(0, 3));
        for (let k = 0; k < 2; k++) furn.scatter(rng.chance(0.5) ? 'h_skull_candle' : 'h_candle_melted', cryptAt.x + rng.pick([-1.6, 1.6]), cryptAt.z + rng.range(-1.6, 1.6));
        break;
      case 'raven':
        // graves dug open round the middle, bones strewn about: where the dead rise for her
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
          furn.place('h_grave_A_destroyed', Math.floor(ravenAt.x + Math.sin(a) * 2.8), Math.floor(ravenAt.z + Math.cos(a) * 2.8), 0);
        }
        for (let k = 0; k < 4; k++) furn.placeDecor('bones', tx + rng.int(1, 6), tz + rng.int(1, 6), false, rng.range(0.8, 1.2));
        furn.scatter('h_skull_candle', ravenAt.x + rng.range(-1, 1), ravenAt.z + 1.4);
        break;
      case 'graves': {
        // two rows of three, a tile apart, facing the camera; some gone, one a dead tree now and then
        const tree = rng.chance(0.25) ? rng.int(0, 5) : -1;
        for (let k = 0; k < 6; k++) {
          const gx = tx + 1 + (k % 3) * 2;
          const gz = tz + (k < 3 ? 2 : 5);
          if (k === tree) furn.place(rng.chance(0.5) ? 'h_tree_dead_medium' : 'h_tree_dead_small', gx, gz, rng.int(0, 3), 0.8);
          else if (rng.chance(0.78)) furn.place(rng.pick(GRAVE_KINDS), gx, gz, 0, 0.12);
        }
        if (i === chest) keep(furn, out.chests, { x: tx + 4.5, z: tz + 3.5 });
        break;
      }
      case 'gate':
        break;
    }
  }
  return { entrances, raven: ravenAt };
}
