import type { P2, RNG } from '../core/math';
import type { Furnisher, Prop } from './furnish';
import { generateTown, type Decor, type House, type Npc, type Service } from './levelgen';
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
    waypoint: at(c.waypoint),
    start: at(c.start),
    gate: { ...c.gate, x: c.gate.x + ox, z: c.gate.z + oz },
  };
}

// ───────────────────────────── cell presets ─────────────────────────────

/** the set pieces an outdoor area puts in its cells, for D2's Act 1 wilderness LvlPrest rows */
export type CellPreset = 'waypoint' | 'cave' | 'shrine' | 'stones' | 'graveyard' | 'ruins' | 'camp';

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
}

const ROCKS = ['x_rock_single_A', 'x_rock_single_B', 'x_rock_single_D'];
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
