import type { P2, RNG } from '../core/math';
import type { Decor, DecorKind, Room, Theme } from './levelgen';
import { T_FLOOR, T_PROP, T_WALL, type TileMap } from './tilemap';

/** a placed model (CC0 prop), by asset key; the renderer resolves and instances it */
export interface Prop {
  model: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  light?: string;
}

/** a model hung on a camera-facing wall face */
export interface WallDecor {
  model: string;
  x: number;
  z: number;
  /** wall normal, pointing into the room */
  nx: number;
  nz: number;
  y: number;
  scale: number;
  light?: string;
}

interface PropDef {
  /** model scale */
  s: number;
  /** footprint in tiles at rot 0 (w along x, d along z) */
  w: number;
  d: number;
  solid: boolean;
  light?: string;
}

const CANDLE = '#ffb060';
const LANTERN = '#ffc070';

/** KayKit props face +Z; ~0.55 keeps them in proportion with the (chibi) characters */
export const PROP_DEFS: Record<string, PropDef> = {
  // dungeon furniture
  d_table_long_decorated_A: { s: 0.55, w: 1, d: 2, solid: true },
  d_table_long_tablecloth_decorated_A: { s: 0.55, w: 1, d: 2, solid: true },
  d_table_medium_decorated_A: { s: 0.5, w: 1, d: 1, solid: true },
  d_table_medium_broken: { s: 0.5, w: 1, d: 1, solid: true },
  d_table_small_decorated_A: { s: 0.6, w: 1, d: 1, solid: true },
  d_table_long_broken: { s: 0.45, w: 1, d: 2, solid: true },
  d_chair: { s: 0.55, w: 1, d: 1, solid: false },
  d_stool: { s: 0.55, w: 1, d: 1, solid: false },
  d_bed_frame: { s: 0.55, w: 1, d: 2, solid: true },
  d_bed_decorated: { s: 0.5, w: 1, d: 2, solid: true },
  d_barrel_small: { s: 0.5, w: 1, d: 1, solid: true },
  d_barrel_large_decorated: { s: 0.42, w: 1, d: 1, solid: true },
  d_barrel_small_stack: { s: 0.45, w: 1, d: 1, solid: true },
  d_box_small: { s: 0.55, w: 1, d: 1, solid: true },
  d_box_large: { s: 0.5, w: 1, d: 1, solid: true },
  d_box_stacked: { s: 0.5, w: 2, d: 2, solid: true },
  d_crates_stacked: { s: 0.45, w: 1, d: 1, solid: true },
  d_keg: { s: 0.45, w: 1, d: 1, solid: true },
  d_keg_decorated: { s: 0.45, w: 2, d: 1, solid: true },
  d_trunk_large_B: { s: 0.6, w: 1, d: 1, solid: true },
  d_trunk_small_A: { s: 0.7, w: 1, d: 1, solid: false },
  d_coin_stack_large: { s: 0.45, w: 1, d: 1, solid: false },
  d_candle_lit: { s: 0.6, w: 1, d: 1, solid: false, light: CANDLE },
  d_candle_triple: { s: 0.7, w: 1, d: 1, solid: false, light: CANDLE },
  d_pillar: { s: 0.5, w: 1, d: 1, solid: true },
  d_column: { s: 0.8, w: 1, d: 1, solid: true },
  d_sword_shield_broken: { s: 0.45, w: 1, d: 1, solid: false },
  d_bottle_A_labeled_brown: { s: 0.6, w: 1, d: 1, solid: false },
  // crypt / graveyard
  h_coffin: { s: 0.55, w: 1, d: 2, solid: true },
  h_coffin_decorated: { s: 0.55, w: 1, d: 2, solid: true },
  h_grave_A: { s: 0.5, w: 1, d: 1, solid: true },
  h_grave_A_destroyed: { s: 0.5, w: 1, d: 1, solid: true },
  h_grave_B: { s: 0.5, w: 1, d: 1, solid: true },
  h_gravestone: { s: 0.55, w: 1, d: 1, solid: true },
  h_gravemarker_A: { s: 0.6, w: 1, d: 1, solid: true },
  h_gravemarker_B: { s: 0.6, w: 1, d: 1, solid: true },
  h_floor_dirt_grave: { s: 0.5, w: 2, d: 2, solid: false },
  h_shrine_candles: { s: 0.6, w: 1, d: 1, solid: true, light: CANDLE },
  h_shrine: { s: 0.6, w: 1, d: 1, solid: true },
  h_plaque_candles: { s: 0.5, w: 1, d: 1, solid: true, light: CANDLE },
  h_bench: { s: 0.5, w: 1, d: 1, solid: true },
  h_bench_decorated: { s: 0.5, w: 1, d: 1, solid: true, light: CANDLE },
  h_skull_candle: { s: 0.5, w: 1, d: 1, solid: false, light: CANDLE },
  h_candle_melted: { s: 0.8, w: 1, d: 1, solid: false, light: CANDLE },
  h_candle_thin: { s: 0.8, w: 1, d: 1, solid: false, light: CANDLE },
  h_skull: { s: 0.4, w: 1, d: 1, solid: false },
  h_ribcage: { s: 0.6, w: 1, d: 1, solid: false },
  h_bone_A: { s: 0.6, w: 1, d: 1, solid: false },
  h_bone_B: { s: 0.6, w: 1, d: 1, solid: false },
  h_bone_C: { s: 0.6, w: 1, d: 1, solid: false },
  h_post_skull: { s: 0.5, w: 1, d: 1, solid: true },
  h_post_lantern: { s: 0.55, w: 1, d: 1, solid: true, light: LANTERN },
  h_lantern_standing: { s: 0.55, w: 1, d: 1, solid: false, light: LANTERN },
  h_pillar: { s: 0.45, w: 1, d: 1, solid: true },
  h_tree_dead_small: { s: 0.55, w: 1, d: 1, solid: true },
  h_tree_dead_medium: { s: 0.5, w: 1, d: 1, solid: true },
  h_tree_dead_large: { s: 0.5, w: 1, d: 1, solid: true },
  h_tree_pine_yellow_large: { s: 0.45, w: 2, d: 2, solid: true },
  h_tree_pine_orange_medium: { s: 0.5, w: 1, d: 1, solid: true },
  h_fence: { s: 0.5, w: 2, d: 1, solid: true },
  h_fence_broken: { s: 0.5, w: 2, d: 1, solid: true },
  h_fence_pillar: { s: 0.5, w: 1, d: 1, solid: true },
  h_arch_gate: { s: 0.5, w: 2, d: 1, solid: false },
  h_crypt: { s: 0.5, w: 3, d: 4, solid: true },
  // nature (hexagon pack, tiny source units) and KayKit rock piles
  x_rock_single_A: { s: 4, w: 1, d: 1, solid: true },
  x_rock_single_B: { s: 4.5, w: 1, d: 1, solid: true },
  x_rock_single_C: { s: 5.5, w: 2, d: 2, solid: true },
  x_rock_single_D: { s: 4.5, w: 1, d: 1, solid: true },
  x_rock_single_E: { s: 5, w: 2, d: 2, solid: true },
  d_rubble_half: { s: 0.3, w: 1, d: 1, solid: true },
  d_rubble_large: { s: 0.25, w: 2, d: 1, solid: true },
  x_tree_single_A: { s: 2.6, w: 1, d: 1, solid: true },
  x_tree_single_B: { s: 2.4, w: 1, d: 1, solid: true },
  // town buildings
  x_home_A: { s: 5.6, w: 4, d: 4, solid: true },
  x_home_B: { s: 4.8, w: 4, d: 5, solid: true },
  x_tavern: { s: 4.6, w: 5, d: 6, solid: true },
  x_blacksmith: { s: 4.4, w: 6, d: 5, solid: true },
  x_well: { s: 2.8, w: 2, d: 2, solid: true },
};

/** wall-mounted pieces: [scale, height of the model origin] */
const WALL_DEFS: Record<string, { s: number; y: number; light?: string }> = {
  d_banner_patternA_red: { s: 0.45, y: 0 },
  d_banner_patternB_red: { s: 0.45, y: 0 },
  d_banner_shield_red: { s: 0.42, y: 0 },
  d_banner_thin_red: { s: 0.45, y: 0 },
  d_sword_shield: { s: 0.4, y: 1.45 },
  d_keyring_hanging: { s: 0.45, y: 1.55 },
  d_shelves: { s: 0.45, y: 0 },
  d_shelf_small_candles: { s: 0.55, y: 0.95, light: CANDLE },
};

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Places furniture on a dungeon map. Solid pieces become T_PROP tiles; every solid placement is
 * checked so the whole level stays reachable from the start.
 */
export class Furnisher {
  props: Prop[] = [];
  wall: WallDecor[] = [];
  /** procedural pieces (stalagmites, crystals, cages…) */
  decor: Decor[] = [];
  private used = new Set<number>();
  private reachable: number;

  constructor(
    private map: TileMap,
    private rng: RNG,
    private start: P2,
    keepClear: P2[],
  ) {
    for (const p of keepClear) this.reserveAround(p, 2);
    this.reachable = this.countReachable();
  }

  reserveAround(p: P2, r: number) {
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.z);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) this.used.add(y * this.map.w + x);
  }

  private countReachable(): number {
    const { map } = this;
    const sx = Math.floor(this.start.x);
    const sy = Math.floor(this.start.z);
    const seen = new Uint8Array(map.w * map.h);
    const q = [sy * map.w + sx];
    seen[q[0]] = 1;
    let n = 0;
    while (q.length) {
      const i = q.pop()!;
      n++;
      const x = i % map.w;
      const y = (i / map.w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const j = ny * map.w + nx;
        if (!seen[j] && map.walkable(nx, ny)) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    return n;
  }

  free(x: number, y: number): boolean {
    return this.map.get(x, y) === T_FLOOR && !this.used.has(y * this.map.w + x);
  }

  /** place `model` with its footprint's top-left tile at (tx,ty); k = quarter turns */
  place(model: string, tx: number, ty: number, k = 0, jitter = 0): boolean {
    const def = PROP_DEFS[model];
    if (!def) return false;
    const fw = k % 2 ? def.d : def.w;
    const fd = k % 2 ? def.w : def.d;
    const tiles: number[] = [];
    for (let y = ty; y < ty + fd; y++) {
      for (let x = tx; x < tx + fw; x++) {
        if (!this.free(x, y)) return false;
        tiles.push(y * this.map.w + x);
      }
    }
    if (def.solid) {
      for (const i of tiles) this.map.tiles[i] = T_PROP;
      const n = this.countReachable();
      if (n < this.reachable - tiles.length) {
        for (const i of tiles) this.map.tiles[i] = T_FLOOR;
        return false;
      }
      this.reachable = n;
    }
    for (const i of tiles) this.used.add(i);
    const j = jitter ? (this.rng.next() - 0.5) * jitter : 0;
    this.props.push({ model, x: tx + fw / 2, z: ty + fd / 2, rot: (k * Math.PI) / 2 + j, scale: def.s, light: def.light });
    return true;
  }

  /** small non-blocking clutter at a free point (no tile reservation needed beyond its own) */
  scatter(model: string, x: number, z: number) {
    const def = PROP_DEFS[model];
    if (!def || !this.map.walkableAt(x, z)) return;
    const i = Math.floor(z) * this.map.w + Math.floor(x);
    if (this.used.has(i)) return;
    this.used.add(i);
    this.props.push({ model, x, z, rot: this.rng.range(0, Math.PI * 2), scale: def.s * this.rng.range(0.85, 1.15), light: def.light });
  }

  /** a procedural decor piece on a free tile; tall ones block like furniture */
  placeDecor(kind: DecorKind, tx: number, ty: number, solid: boolean, scale = 1): boolean {
    if (!this.free(tx, ty)) return false;
    const i = ty * this.map.w + tx;
    if (solid) {
      this.map.tiles[i] = T_PROP;
      const n = this.countReachable();
      if (n < this.reachable - 1) {
        this.map.tiles[i] = T_FLOOR;
        return false;
      }
      this.reachable = n;
    }
    this.used.add(i);
    this.decor.push({ kind, x: tx + 0.5 + (this.rng.next() - 0.5) * 0.3, z: ty + 0.5 + (this.rng.next() - 0.5) * 0.3, rot: this.rng.range(0, Math.PI * 2), scale });
    return true;
  }

  hang(model: string, x: number, z: number, nx: number, nz: number) {
    const def = WALL_DEFS[model];
    if (def) this.wall.push({ model, x, z, nx, nz, y: def.y, scale: def.s, light: def.light });
  }
}

// ───────────────────────────── room dressing ─────────────────────────────

type RoomKind = 'ossuary' | 'chapel' | 'storeroom' | 'hall' | 'library' | 'barracks' | 'graveyard' | 'bonepit' | 'rocks' | 'camp' | 'colonnade' | 'empty';

const KINDS: Record<string, [RoomKind, number][]> = {
  crypt: [['ossuary', 3], ['chapel', 2], ['storeroom', 2], ['hall', 2], ['library', 2], ['barracks', 1], ['graveyard', 2], ['bonepit', 1], ['colonnade', 1], ['empty', 1]],
  cave: [['rocks', 4], ['camp', 2], ['bonepit', 2], ['storeroom', 1], ['empty', 1]],
  ice: [['rocks', 3], ['ossuary', 2], ['storeroom', 1], ['graveyard', 1], ['bonepit', 1], ['library', 1], ['colonnade', 1], ['empty', 1]],
  hell: [['bonepit', 3], ['chapel', 2], ['graveyard', 2], ['rocks', 1], ['ossuary', 1], ['empty', 1]],
};

/** wall decorations that suit each room kind */
const WALL_SETS: Partial<Record<RoomKind, string[]>> = {
  chapel: ['d_banner_patternA_red', 'd_banner_patternB_red', 'd_banner_shield_red', 'd_shelf_small_candles'],
  hall: ['d_banner_patternA_red', 'd_banner_shield_red', 'd_sword_shield', 'd_banner_thin_red'],
  library: ['d_shelves', 'd_shelves', 'd_shelves', 'd_shelf_small_candles'],
  storeroom: ['d_shelves', 'd_keyring_hanging', 'd_shelf_small_candles'],
  barracks: ['d_sword_shield', 'd_keyring_hanging', 'd_banner_thin_red'],
  ossuary: ['d_shelf_small_candles', 'd_banner_thin_red'],
  graveyard: ['d_banner_thin_red', 'd_shelf_small_candles'],
  colonnade: ['d_banner_patternA_red', 'd_banner_patternB_red', 'd_sword_shield'],
  empty: ['d_banner_thin_red', 'd_shelf_small_candles'],
};

function pickWeighted<T>(rng: RNG, list: [T, number][]): T {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rng.next() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[0][0];
}

/** tiles in a room that open onto a corridor (plus a ring around them) are kept walkable */
function reserveDoors(f: Furnisher, map: TileMap, r: Room) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (map.get(x, y) !== T_FLOOR) continue;
      const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      if (!edge) continue;
      for (const [dx, dy] of DIRS) {
        const ox = x + dx;
        const oy = y + dy;
        const outside = ox < r.x || oy < r.y || ox >= r.x + r.w || oy >= r.y + r.h;
        if (outside && map.walkable(ox, oy)) f.reserveAround({ x: x + 0.5, z: y + 0.5 }, 1);
      }
    }
  }
}

export interface DressOptions {
  /** rooms to leave mostly open (start, boss) */
  sparse: Set<Room>;
  torches: { x: number; z: number }[];
}

export function dressRooms(f: Furnisher, map: TileMap, rng: RNG, theme: Theme, rooms: Room[], cave: boolean, opts: DressOptions) {
  const kinds = KINDS[theme.key] ?? KINDS.crypt;
  for (const r of rooms) reserveDoors(f, map, r);
  for (const r of rooms) {
    const sparse = opts.sparse.has(r);
    let kind: RoomKind = sparse ? 'empty' : pickWeighted(rng, kinds);
    // furniture layouts need a rectangular room of decent size
    const rect = !cave && r.w >= 6 && r.h >= 6;
    if (!rect && !['rocks', 'bonepit', 'camp', 'empty'].includes(kind)) kind = cave ? 'rocks' : 'bonepit';
    if (kind === 'colonnade' && (r.w < 8 || r.h < 8 || r.w >= 11)) kind = 'hall';
    dressRoom(f, map, rng, theme, r, kind);
    if (!cave) hangWallDecor(f, map, rng, r, kind, opts.torches);
  }
}

function hangWallDecor(f: Furnisher, map: TileMap, rng: RNG, r: Room, kind: RoomKind, torches: { x: number; z: number }[]) {
  const set = WALL_SETS[kind];
  if (!set) return;
  const spots: { x: number; z: number; nx: number; nz: number }[] = [];
  for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (map.get(x, r.y - 1) === T_WALL && map.get(x, r.y) !== T_WALL) spots.push({ x: x + 0.5, z: r.y - 0.02, nx: 0, nz: 1 });
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) if (map.get(r.x - 1, y) === T_WALL && map.get(r.x, y) !== T_WALL) spots.push({ x: r.x - 0.02, z: y + 0.5, nx: 1, nz: 0 });
  const taken: { x: number; z: number }[] = [...torches];
  const want = kind === 'library' ? 6 : rng.int(2, 4);
  for (let k = 0; k < want && spots.length; k++) {
    const s = spots.splice(rng.int(0, spots.length - 1), 1)[0];
    if (taken.some((t) => Math.abs(t.x - s.x) + Math.abs(t.z - s.z) < 1.6)) continue;
    taken.push(s);
    f.hang(rng.pick(set), s.x, s.z, s.nx, s.nz);
  }
}

function dressRoom(f: Furnisher, map: TileMap, rng: RNG, theme: Theme, r: Room, kind: RoomKind) {
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w - 1;
  const y1 = r.y + r.h - 1;
  const cx = Math.floor(r.x + r.w / 2);
  const cy = Math.floor(r.y + r.h / 2);
  const rx = () => rng.range(r.x + 0.6, r.x + r.w - 0.6);
  const rz = () => rng.range(r.y + 0.6, r.y + r.h - 0.6);
  const hell = theme.key === 'hell';
  const bones = ['h_bone_A', 'h_bone_B', 'h_bone_C', 'h_ribcage', 'h_skull'];
  switch (kind) {
    case 'ossuary': {
      const coffins = ['h_coffin', 'h_coffin_decorated'];
      // along the north wall (long side along x) and the west wall (along z)
      for (let x = x0 + 1; x + 1 <= x1 - 1; x += 3) f.place(rng.pick(coffins), x, y0, 1);
      for (let y = y0 + 2; y + 1 <= y1 - 1; y += 3) f.place(rng.pick(coffins), x0, y, 0);
      if (r.w >= 8) for (let x = x0 + 2; x + 1 <= x1 - 1; x += 4) f.place(rng.pick(coffins), x, y1, 1);
      for (let k = 0; k < 3; k++) f.scatter('h_skull_candle', rx(), rz());
      for (let k = 0; k < 4; k++) f.scatter(rng.pick(bones), rx(), rz());
      break;
    }
    case 'chapel': {
      f.place(hell ? 'h_shrine' : 'h_shrine_candles', cx, y0, 0);
      f.place('h_plaque_candles', cx, y0 + 1, 0);
      f.scatter('d_candle_triple', cx - 1 + 0.5, y0 + 0.5);
      f.scatter('d_candle_triple', cx + 1 + 0.5, y0 + 0.5);
      for (let y = y0 + 3; y <= y1 - 1; y += 2) {
        for (let x = x0 + 1; x <= x1 - 1; x++) {
          if (Math.abs(x - cx) <= 0) continue; // aisle
          f.place(rng.chance(0.2) ? 'h_bench_decorated' : 'h_bench', x, y, 0);
        }
      }
      if (hell) for (const [x, y] of [[x0, y0], [x1, y0]]) f.place('h_post_skull', x, y, 0);
      break;
    }
    case 'storeroom': {
      const small = ['d_barrel_small', 'd_box_small', 'd_box_large', 'd_crates_stacked', 'd_keg', 'd_barrel_large_decorated', 'd_barrel_small_stack'];
      const corners: [number, number, number, number][] = [
        [x0, y0, 1, 1],
        [x1, y0, -1, 1],
        [x0, y1, 1, -1],
        [x1, y1, -1, -1],
      ];
      for (const [x, y, dx, dy] of corners) {
        if (rng.chance(0.3) && f.place('d_box_stacked', dx > 0 ? x : x - 1, dy > 0 ? y : y - 1, 0)) continue;
        f.place(rng.pick(small), x, y, rng.int(0, 3));
        if (rng.chance(0.7)) f.place(rng.pick(small), x + dx, y, rng.int(0, 3));
        if (rng.chance(0.6)) f.place(rng.pick(small), x, y + dy, rng.int(0, 3));
      }
      for (let x = x0 + 3; x <= x1 - 3; x += 3) if (rng.chance(0.6)) f.place(rng.chance(0.5) ? 'd_trunk_large_B' : 'd_keg_decorated', x, y0, 0);
      if (rng.chance(0.5)) f.scatter('d_candle_lit', rx(), rz());
      break;
    }
    case 'hall': {
      const long = r.h >= r.w;
      const table = rng.chance(0.5) ? 'd_table_long_decorated_A' : 'd_table_long_tablecloth_decorated_A';
      // one or two long tables down the middle with seats along both sides
      const tables = (long ? r.w : r.h) >= 9 ? [-1, 2] : [0];
      for (const off of tables) {
        const segs = Math.max(1, Math.floor(((long ? r.h : r.w) - 4) / 2));
        for (let s = 0; s < segs; s++) {
          const tx = long ? cx + off : x0 + 2 + s * 2;
          const ty = long ? y0 + 2 + s * 2 : cy + off;
          if (!f.place(table, tx, ty, long ? 0 : 1)) continue;
          for (let t = 0; t < 2; t++) {
            if (long) {
              f.scatter('d_chair', tx - 1 + 0.5, ty + t + 0.5);
              f.scatter('d_chair', tx + 1 + 0.5, ty + t + 0.5);
            } else {
              f.scatter('d_chair', tx + t + 0.5, ty - 1 + 0.5);
              f.scatter('d_chair', tx + t + 0.5, ty + 1 + 0.5);
            }
          }
        }
      }
      for (const [x, y] of [[x0, y0], [x1, y1]]) f.place('d_table_medium_decorated_A', x, y, 0);
      f.scatter('d_candle_triple', x0 + 0.5, y1 + 0.5);
      break;
    }
    case 'library': {
      // reading tables with chairs; the walls carry the shelves
      for (let k = 0; k < 2; k++) {
        const tx = rng.int(x0 + 2, x1 - 2);
        const ty = rng.int(y0 + 2, y1 - 2);
        if (f.place('d_table_small_decorated_A', tx, ty, rng.int(0, 3))) {
          f.scatter('d_chair', tx + 0.5, ty + 1.5);
          f.scatter('d_candle_lit', tx + 1.5, ty + 0.5);
        }
      }
      for (let y = y0 + 1; y <= y1 - 1; y += 2) f.place(rng.chance(0.5) ? 'd_box_small' : 'd_trunk_large_B', x1, y, 3);
      f.scatter('d_bottle_A_labeled_brown', rx(), rz());
      break;
    }
    case 'barracks': {
      const bed = rng.chance(0.5) ? 'd_bed_frame' : 'd_bed_decorated';
      for (let y = y0 + 1; y + 1 <= y1 - 1; y += 2) if (f.place(bed, x0, y, 1)) f.scatter('d_trunk_small_A', x0 + 2.5, y + 0.5);
      for (let x = x0 + 2; x + 1 <= x1 - 1; x += 2) f.place(bed, x, y0, 0);
      if (f.place('d_table_small_decorated_A', cx + 1, cy + 1, 0)) {
        f.scatter('d_stool', cx + 0.5, cy + 1.5);
        f.scatter('d_stool', cx + 2.5, cy + 1.5);
      }
      f.scatter('d_sword_shield_broken', rx(), rz());
      break;
    }
    case 'graveyard': {
      const graves = ['h_grave_A', 'h_grave_B', 'h_gravestone', 'h_gravemarker_A', 'h_gravemarker_B', 'h_grave_A_destroyed'];
      for (let y = y0 + 1; y <= y1 - 1; y += 2) {
        for (let x = x0 + 1; x <= x1 - 1; x += 2) {
          if (rng.chance(0.25)) continue;
          if (f.place(rng.pick(graves), x, y, 0) && rng.chance(0.3)) f.scatter('h_candle_melted', x + 0.5, y + 1.3);
        }
      }
      f.place(rng.pick(['h_tree_dead_small', 'h_tree_dead_medium']), x1, y0, rng.int(0, 3));
      if (hell) f.place('h_post_skull', x0, y1, 0);
      else f.scatter('h_lantern_standing', x0 + 0.5, y1 + 0.5);
      break;
    }
    case 'bonepit': {
      const area = r.w * r.h;
      for (let k = 0; k < area / 6; k++) f.scatter(rng.pick(bones), rx(), rz());
      for (let k = 0; k < Math.max(1, area / 30); k++) f.scatter('h_skull_candle', rx(), rz());
      for (let k = 0; k < area / 30; k++) f.placeDecor(rng.chance(0.5) ? 'skullpile' : 'cage', rng.int(x0, x1), rng.int(y0, y1), true);
      if (hell) {
        for (let k = 0; k < area / 20; k++) f.place('h_post_skull', rng.int(x0, x1), rng.int(y0, y1), rng.int(0, 3));
        for (let k = 0; k < area / 40; k++) f.place(rng.pick(['h_tree_dead_large', 'h_tree_dead_medium']), rng.int(x0, x1), rng.int(y0, y1), rng.int(0, 3), 0.6);
        for (let k = 0; k < area / 25; k++) f.placeDecor('stalagmite', rng.int(x0, x1), rng.int(y0, y1), true, rng.range(0.9, 1.4));
      } else if (rng.chance(0.5)) f.place('h_coffin', rng.int(x0, x1 - 1), rng.int(y0, y1 - 1), rng.int(0, 3));
      break;
    }
    case 'rocks': {
      const area = r.w * r.h;
      const big = ['x_rock_single_C', 'x_rock_single_E', 'd_rubble_large'];
      const small = ['x_rock_single_A', 'x_rock_single_B', 'x_rock_single_D', 'd_rubble_half'];
      // boulders hug the walls, smaller stones and spires fill in
      for (let k = 0; k < area / 14; k++) {
        const side = rng.int(0, 3);
        const tx = side === 0 ? x0 : side === 1 ? x1 - 1 : rng.int(x0, x1 - 1);
        const ty = side === 2 ? y0 : side === 3 ? y1 - 1 : rng.int(y0, y1 - 1);
        f.place(rng.pick(big), tx, ty, rng.int(0, 3), 1.2);
      }
      for (let k = 0; k < area / 12; k++) f.place(rng.pick(small), rng.int(x0, x1), rng.int(y0, y1), rng.int(0, 3), 1.2);
      const spire: DecorKind = theme.key === 'ice' ? 'crystal' : 'stalagmite';
      for (let k = 0; k < area / 10; k++) f.placeDecor(spire, rng.int(x0, x1), rng.int(y0, y1), true, rng.range(0.9, 1.5));
      for (let k = 0; k < area / 12; k++) f.scatter(rng.pick(bones), rx(), rz());
      if (theme.key === 'cave' && rng.chance(0.5)) f.place('h_tree_dead_small', rng.int(x0, x1), rng.int(y0, y1), rng.int(0, 3), 1);
      break;
    }
    case 'camp': {
      // an abandoned camp: bedroll, supplies and a dying lantern
      const tx = rng.int(x0 + 1, Math.max(x0 + 1, x1 - 2));
      const ty = rng.int(y0 + 1, Math.max(y0 + 1, y1 - 2));
      f.place('d_bed_frame', tx, ty, rng.int(0, 1));
      f.place('d_trunk_large_B', tx + 2, ty, rng.int(0, 3));
      f.place(rng.pick(['d_barrel_small', 'd_box_small', 'd_crates_stacked']), tx + 2, ty + 1, rng.int(0, 3));
      f.scatter('h_lantern_standing', tx + 1.5, ty + 2.5);
      f.scatter('d_bottle_A_labeled_brown', tx + 0.5, ty + 2.5);
      for (let k = 0; k < 2; k++) f.scatter(rng.pick(bones), rx(), rz());
      break;
    }
    case 'colonnade': {
      const pillar = rng.chance(0.5) ? 'd_pillar' : 'h_pillar';
      for (let x = x0 + 1; x <= x1 - 1; x += 3) {
        f.place(pillar, x, y0 + 1, 0);
        f.place(pillar, x, y1 - 1, 0);
      }
      f.scatter('d_candle_triple', cx + 0.5, cy + 0.5);
      break;
    }
    case 'empty': {
      if (theme.key !== 'crypt') for (let k = 0; k < (r.w * r.h) / 20; k++) f.placeDecor(theme.key === 'ice' ? 'crystal' : 'stalagmite', rng.int(x0, x1), rng.int(y0, y1), true);
      if (rng.chance(0.6)) f.scatter(rng.pick(bones), rx(), rz());
      if (rng.chance(0.4)) f.scatter('d_candle_lit', rx(), rz());
      break;
    }
  }
}
