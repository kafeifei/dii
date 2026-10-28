import { RNG, type P2 } from '../core/math';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { dressRooms, Furnisher, PROP_DEFS, WALL_DEFS, type Prop, type WallDecor } from './furnish';
import { clamp01, fbm, growWoods, valueNoise } from './outdoors';
import { TileMap, T_FLOOR, T_PROP, T_VOID, T_WALL } from './tilemap';

export type { Prop, WallDecor } from './furnish';

/** decorative townsfolk (not interactive) */
export interface Npc {
  model: string;
  x: number;
  z: number;
  rot: number;
  name: string;
}

export interface House extends Room {
  /** CC0 building model drawn over the solid block */
  model?: string;
  rot?: number;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DecorKind = 'bones' | 'rubble' | 'barrel' | 'skullpile' | 'tree' | 'tent' | 'campfire' | 'cage' | 'banner' | 'crate' | 'stalagmite' | 'crystal' | 'rock';

export interface Decor {
  kind: DecorKind;
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface Torch {
  x: number;
  z: number;
  /** direction the torch faces (into the room) */
  nx: number;
  nz: number;
}

export interface Theme {
  key: string;
  name: string;
  /** the name in English */
  en: string;
  wall: string;
  wallDark: string;
  ambient: string;
  ambientIntensity: number;
  torch: string;
  /** background clear colour */
  bg: string;
  /** under the sky: lit by the moon (or the sun), which throws the shadows */
  outdoor?: boolean;
}

export const THEMES: Record<string, Theme> = {
  town: {
    key: 'town', name: '放逐者营寨', en: "Exiles' Stockade", wall: '#5a4630', wallDark: '#33281b',
    ambient: '#6f7aa8', ambientIntensity: 0.55, torch: '#ffa040', bg: '#07080c', outdoor: true,
  },
  wild: {
    key: 'wild', name: '血沼荒原', en: 'Bloodmire Heath', wall: '#4a4436', wallDark: '#2a261e',
    ambient: '#6f7aa8', ambientIntensity: 0.55, torch: '#ffa040', bg: '#07080c', outdoor: true,
  },
  crypt: {
    key: 'crypt', name: '遗忘墓穴', en: 'Forgotten Crypt', wall: '#5e5850', wallDark: '#2e2a26',
    ambient: '#46506e', ambientIntensity: 0.18, torch: '#ff9a3c', bg: '#030304',
  },
  cave: {
    key: 'cave', name: '血岩洞窟', en: 'Bloodrock Caverns', wall: '#5c4030', wallDark: '#2c1d15',
    ambient: '#5e3a3a', ambientIntensity: 0.16, torch: '#ff7a2c', bg: '#040202',
  },
  ice: {
    key: 'ice', name: '霜寂地窖', en: 'Stillfrost Vaults', wall: '#6a7888', wallDark: '#2a323c',
    ambient: '#5070a0', ambientIntensity: 0.2, torch: '#9ad0ff', bg: '#020306',
  },
  hell: {
    key: 'hell', name: '燃烬深渊', en: 'Cinder Abyss', wall: '#4c2620', wallDark: '#200c0a',
    ambient: '#8a2a1a', ambientIntensity: 0.22, torch: '#ff5a20', bg: '#060100',
  },
};

/**
 * The wilderness maps between the camp and the crypt (Diablo II's Blood Moor). Depth counts every
 * level from the camp, so the crypt's first floor is depth WILD_MAPS + 1.
 */
export const WILD_MAPS = 1;

export function isWild(depth: number): boolean {
  return depth > 0 && depth <= WILD_MAPS;
}

/** a dungeon level's own floor number (the crypt's first is 1): its size, monsters, bosses and loot go by it */
export function dungeonFloor(depth: number): number {
  return depth - WILD_MAPS;
}

/** what the map, the waypoints and the character list call a level */
export function levelLabel(depth: number, camp = '营地'): string {
  if (depth <= 0) return camp;
  if (isWild(depth)) return THEMES.wild.name;
  return `第 ${dungeonFloor(depth)} 层`;
}

/** a dungeon floor's theme, by its floor number */
export function themeForFloor(floor: number): Theme {
  if (floor <= 0) return THEMES.town;
  if (floor <= 4) return THEMES.crypt;
  if (floor <= 8) return THEMES.cave;
  if (floor <= 12) return THEMES.ice;
  return THEMES.hell;
}

/** a way off the map that is walked through, not clicked: the camp's gate, the wilderness's edges */
export interface Exit {
  x: number;
  z: number;
  /** the level it leads to, by its depth (Level makes it the area that is) */
  dest: number;
  name: string;
  /** into the map from the exit: where someone coming the other way appears */
  nx: number;
  nz: number;
}

/**
 * A way onto another map: a cave mouth down into a dungeon (used), the way back up out of one (used),
 * or the road on to an area not built yet (walked into)
 */
export interface Entrance {
  x: number;
  z: number;
  /** the area it leads to */
  dest: number;
  name: string;
  kind: 'cave' | 'up' | 'road';
  /** into this map from it: where someone coming back appears */
  nx: number;
  nz: number;
}

/** a named unique pack a map sets down where it says (superuniques.json, by its areaId) */
export interface SuperUnique {
  pos: P2;
  /** its SuperUniques.txt row (D2X_SUPERUNIQUES key): its name and its drop */
  key: string;
  /** the monster it is one of (D2X_MONSTERS id); its row's mon decides */
  monster: string;
  name: string;
}

/** a waypoint and the area it serves (one big map will have a waypoint in each of several areas) */
export interface Waypoint {
  area: number;
  pos: P2;
}

/** what a place offers the hero: the town's people and the stash, a campfire to warm by */
export type ServiceKind = 'vendor' | 'stash' | 'campfire' | 'healer' | 'smith' | 'gambler' | 'identify' | 'hire';

export interface Service {
  kind: ServiceKind;
  pos: P2;
  /** who offers it, when it's someone: their name */
  npc?: string;
  /** and their MonStats id, which their quests and lines go by (akara) */
  npcId?: string;
}

/**
 * The camp's merchant: Akara's counterpart (D2 has her heal and sell the staves, potions, scrolls
 * and tomes; this one keeps Charsi's shelves too), named by her row (tools/d2-names/npcs.json)
 */
const MERCHANT = D2X_MONSTERS.akara;

export interface Layout {
  map: TileMap;
  theme: Theme;
  start: P2;
  stairs?: P2;
  waypoints: Waypoint[];
  rooms: Room[];
  spawnRooms: Room[];
  torches: Torch[];
  decor: Decor[];
  chests: P2[];
  barrels: P2[];
  pillars: Set<number>;
  /** the camp's merchant and stash, and the campfires (the camp's, the wilderness's monster camps) */
  services: Service[];
  exits?: Exit[];
  /** outdoor maps: per tile, how much grass, dirt, road and stone (four bytes, 0-255); the renderer blends their textures */
  ground?: Uint8Array;
  /** the wilderness's shrines */
  shrines?: P2[];
  /** monster camps: an elite pack waits by each */
  elites?: P2[];
  bossRoom?: Room;
  /** solid buildings (town only); their tiles are walls but render as houses */
  houses?: House[];
  /** furniture and other placed models */
  props: Prop[];
  wallDecor: WallDecor[];
  npcs?: Npc[];
  /** a map of several areas (the overworld): the area of every tile, row by row; without it the map is all one area */
  areaOf?: Uint16Array;
  /** the ways onto other maps: cave mouths, the way back up, roads on to areas not built yet */
  entrances?: Entrance[];
  /** named unique packs, each where it waits */
  superUniques?: SuperUnique[];
}

function roomCenter(r: Room): P2 {
  return { x: r.x + r.w / 2, z: r.y + r.h / 2 };
}

function carveRect(map: TileMap, x: number, y: number, w: number, h: number) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) map.set(i, j, T_FLOOR);
}

function carveCorridor(map: TileMap, a: P2, b: P2, rng: RNG, width: number) {
  const ax = Math.floor(a.x);
  const ay = Math.floor(a.z);
  const bx = Math.floor(b.x);
  const by = Math.floor(b.z);
  const hFirst = rng.chance(0.5);
  const hLine = (y: number, x0: number, x1: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let k = 0; k < width; k++) map.set(x, y + k, T_FLOOR);
  };
  const vLine = (x: number, y0: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let k = 0; k < width; k++) map.set(x + k, y, T_FLOOR);
  };
  if (hFirst) {
    hLine(ay, ax, bx);
    vLine(bx, ay, by);
  } else {
    vLine(ax, ay, by);
    hLine(by, ax, bx);
  }
}

function buildWalls(map: TileMap) {
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) !== T_VOID) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (map.get(x + dx, y + dy) === T_FLOOR) near = true;
      if (near) map.set(x, y, T_WALL);
    }
  }
}

function areaClear(map: TileMap, x: number, z: number, r: number): boolean {
  for (let dz = -r; dz <= r; dz += 0.5) for (let dx = -r; dx <= r; dx += 0.5) if (!map.walkableAt(x + dx, z + dz)) return false;
  return true;
}

function findClearSpot(map: TileMap, c: P2, r: number, offsets: number[][]): P2 | null {
  for (const [dx, dz] of offsets) {
    const p = { x: c.x + dx, z: c.z + dz };
    if (areaClear(map, p.x, p.z, r)) return p;
  }
  for (let rr = 1; rr < 6; rr++) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const p = { x: c.x + Math.sin(a) * rr, z: c.z + Math.cos(a) * rr };
      if (areaClear(map, p.x, p.z, r)) return p;
    }
  }
  return null;
}

/** bfsDistances' queue, kept from walk to walk: it grows to the biggest map and no more */
let bfsQueue = new Int32Array(0);
const BFS_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function bfsDistances(map: TileMap, from: P2): Int32Array {
  const d = new Int32Array(map.w * map.h).fill(-1);
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.z);
  // every tile goes in at most once
  if (bfsQueue.length < d.length) bfsQueue = new Int32Array(d.length);
  const q = bfsQueue;
  q[0] = sy * map.w + sx;
  d[q[0]] = 0;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const c = q[head++];
    const cx = c % map.w;
    const cy = (c / map.w) | 0;
    for (const [dx, dy] of BFS_DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.walkable(nx, ny)) continue;
      const ni = ny * map.w + nx;
      if (d[ni] !== -1) continue;
      d[ni] = d[c] + 1;
      q[tail++] = ni;
    }
  }
  return d;
}

/** wall tiles that face the camera (floor at +x or +z) are good torch spots */
function torchSpots(map: TileMap, room: Room): Torch[] {
  const spots: Torch[] = [];
  // north wall (y = room.y - 1), floor at +z
  for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
    if (map.get(x, room.y - 1) === T_WALL && map.walkable(x, room.y)) spots.push({ x: x + 0.5, z: room.y - 0.02, nx: 0, nz: 1 });
  }
  // west wall (x = room.x - 1), floor at +x
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    if (map.get(room.x - 1, y) === T_WALL && map.walkable(room.x, y)) spots.push({ x: room.x - 0.02, z: y + 0.5, nx: 1, nz: 0 });
  }
  return spots;
}

/**
 * `floor` is the dungeon's own floor number (dungeonFloor), `area` the area its waypoint is in;
 * `theme` its look, the floor's unless another is asked for (the Den of Evil's cave)
 */
export function generateDungeon(floor: number, seed: number, area: number, theme = themeForFloor(floor)): Layout {
  const rng = new RNG(seed);
  const size = 60 + Math.min(floor * 2, 30);
  const map = new TileMap(size, size);
  const rooms: Room[] = [];
  const target = Math.min(9 + Math.floor(floor / 2), 17);
  const cave = theme.key === 'cave' || theme.key === 'hell';
  for (let attempt = 0; attempt < 400 && rooms.length < target; attempt++) {
    const big = rng.chance(0.2);
    const w = big ? rng.int(11, 15) : rng.int(6, 10);
    const h = big ? rng.int(10, 14) : rng.int(6, 10);
    const x = rng.int(3, size - w - 4);
    const y = rng.int(3, size - h - 4);
    const r: Room = { x, y, w, h };
    if (rooms.some((o) => x < o.x + o.w + 3 && x + w + 3 > o.x && y < o.y + o.h + 3 && y + h + 3 > o.y)) continue;
    rooms.push(r);
  }
  for (const r of rooms) {
    if (cave) {
      // irregular blob room
      const c = roomCenter(r);
      for (let j = r.y; j < r.y + r.h; j++) {
        for (let i = r.x; i < r.x + r.w; i++) {
          const nx = (i + 0.5 - c.x) / (r.w / 2);
          const ny = (j + 0.5 - c.z) / (r.h / 2);
          const n = nx * nx + ny * ny + (rng.next() - 0.5) * 0.35;
          if (n < 1.0) map.set(i, j, T_FLOOR);
        }
      }
      carveRect(map, Math.floor(c.x) - 1, Math.floor(c.z) - 1, 3, 3);
    } else {
      carveRect(map, r.x, r.y, r.w, r.h);
    }
  }
  // MST (Prim) + a few extra loops
  const centers = rooms.map(roomCenter);
  const inTree = new Set<number>([0]);
  const edges: [number, number][] = [];
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < rooms.length; b++) {
        if (inTree.has(b)) continue;
        const d = Math.hypot(centers[a].x - centers[b].x, centers[a].z - centers[b].z);
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    edges.push(best);
    inTree.add(best[1]);
  }
  for (let k = 0; k < Math.floor(rooms.length / 4); k++) {
    const a = rng.int(0, rooms.length - 1);
    const b = rng.int(0, rooms.length - 1);
    if (a !== b) edges.push([a, b]);
  }
  for (const [a, b] of edges) carveCorridor(map, centers[a], centers[b], rng, rng.chance(0.3) ? 3 : 2);

  // pillars in big rectangular rooms
  const pillars = new Set<number>();
  if (!cave) {
    for (const r of rooms) {
      if (r.w >= 11 && r.h >= 10) {
        const ps = [
          [r.x + 2, r.y + 2],
          [r.x + r.w - 3, r.y + 2],
          [r.x + 2, r.y + r.h - 3],
          [r.x + r.w - 3, r.y + r.h - 3],
        ];
        for (const [px, py] of ps) {
          map.set(px, py, T_WALL);
          pillars.add(py * map.w + px);
        }
      }
    }
  }
  buildWalls(map);

  // start / stairs
  const startRoom = rooms[0];
  const start = roomCenter(startRoom);
  const dist = bfsDistances(map, start);
  let far = 1;
  let farD = -1;
  for (let i = 1; i < rooms.length; i++) {
    const c = centers[i];
    const d = dist[Math.floor(c.z) * map.w + Math.floor(c.x)];
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const stairsRoom = rooms[far];
  const stairsC = roomCenter(stairsRoom);
  const stairs = findClearSpot(map, stairsC, 1.2, [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) ?? stairsC;
  const waypoint = findClearSpot(map, start, 1.6, [[2.5, -1.5], [-2.5, -1.5], [2.5, 1.5], [-2.5, 1.5], [0, 2.5], [0, -2.5], [3, 0], [-3, 0]]) ?? { x: start.x, z: start.z + 2 };

  // torches
  const torches: Torch[] = [];
  for (const r of rooms) {
    const spots = torchSpots(map, r);
    const count = Math.min(spots.length, r.w > 10 ? 2 : 1);
    for (let k = 0; k < count; k++) {
      const s = spots.splice(rng.int(0, spots.length - 1), 1)[0];
      if (s && !torches.some((t) => Math.abs(t.x - s.x) + Math.abs(t.z - s.z) < 3)) torches.push(s);
    }
  }

  // decor
  const decor: Decor[] = [];
  const free = (x: number, z: number) => map.walkableAt(x, z) && Math.hypot(x - start.x, z - start.z) > 3 && Math.hypot(x - stairs.x, z - stairs.z) > 2;
  const decorKinds: Decor['kind'][] =
    theme.key === 'crypt' ? ['bones', 'skullpile', 'rubble', 'cage', 'banner'] :
    theme.key === 'cave' ? ['stalagmite', 'bones', 'rock', 'rubble'] :
    theme.key === 'ice' ? ['crystal', 'bones', 'rock', 'skullpile'] :
    ['stalagmite', 'skullpile', 'bones', 'rock'];
  for (const r of rooms) {
    const n = rng.int(0, 2);
    for (let k = 0; k < n; k++) {
      const x = rng.range(r.x + 0.8, r.x + r.w - 0.8);
      const z = rng.range(r.y + 0.8, r.y + r.h - 0.8);
      if (!free(x, z)) continue;
      decor.push({ kind: rng.pick(decorKinds), x, z, rot: rng.range(0, Math.PI * 2), scale: rng.range(0.8, 1.25) });
    }
  }

  // chests & barrels near room edges
  const chests: P2[] = [];
  const barrels: P2[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    if (rng.chance(0.35)) {
      const p = { x: r.x + rng.int(1, r.w - 2) + 0.5, z: r.y + 0.9 };
      if (free(p.x, p.z) && map.walkableAt(p.x, p.z - 0.9)) chests.push(p);
      else if (free(p.x, p.z)) chests.push(p);
    }
    const bc = rng.int(0, 3);
    for (let k = 0; k < bc; k++) {
      const p = { x: r.x + 0.8 + rng.next() * 1.2, z: r.y + rng.range(1, r.h - 1) };
      if (free(p.x, p.z)) barrels.push(p);
    }
  }

  const spawnRooms = rooms.filter((r) => r !== startRoom);
  const bossRoom = floor % 4 === 0 ? stairsRoom : undefined;

  // furniture: themed room layouts (solid pieces become T_PROP, level stays connected)
  const furn = new Furnisher(map, rng, start, [start, stairs, waypoint]);
  for (const p of [...chests, ...barrels]) furn.reserveAround(p, 1);
  for (const d of decor) furn.reserveAround(d, 0);
  dressRooms(furn, map, rng, theme, rooms, cave, { sparse: new Set(bossRoom ? [startRoom, bossRoom] : [startRoom]), torches });
  decor.push(...furn.decor);

  return {
    map, theme, start, stairs, waypoints: [{ area, pos: waypoint }], rooms, spawnRooms, torches, decor, chests, barrels, pillars, bossRoom,
    services: [], props: furn.props, wallDecor: furn.wall,
  };
}

/**
 * Dev showroom (?dev&gallery): every furniture model in rows under the camp lighting, wall pieces
 * along the north wall and the procedural decor in the last row, for reviewing art side by side.
 * It stands in for the camp, in the camp's `area`.
 */
export function generateGallery(area: number): Layout {
  const rng = new RNG(7);
  const size = 64;
  const map = new TileMap(size, size);
  carveRect(map, 3, 3, size - 6, size - 6);
  buildWalls(map);
  const start = { x: 5.5, z: 5.5 };
  const furn = new Furnisher(map, rng, start, [start]);
  let x = 5;
  let y = 9;
  let rowD = 0;
  for (const model of Object.keys(PROP_DEFS)) {
    const def = PROP_DEFS[model];
    if (x + def.w > size - 4) {
      x = 5;
      y += rowD + 1;
      rowD = 0;
    }
    furn.place(model, x, y, 0);
    x += def.w + 1;
    rowD = Math.max(rowD, def.d);
  }
  const torches: Torch[] = [];
  Object.keys(WALL_DEFS).forEach((model, i) => furn.hang(model, 6.5 + i * 2, 3, 0, 1));
  for (let tx = 4; tx < size - 4; tx += 6) torches.push({ x: tx + 0.5 + 1, z: 3, nx: 0, nz: 1 });
  const decor: Decor[] = (['campfire', 'tent', 'skullpile', 'cage', 'banner', 'stalagmite', 'crystal', 'bones', 'rubble', 'rock'] as DecorKind[]).map((kind, i) => ({
    kind,
    x: 6 + i * 3,
    z: y + rowD + 3,
    rot: 0,
    scale: 1,
  }));
  return {
    map, theme: THEMES.town, start, rooms: [], spawnRooms: [], torches, decor, chests: [{ x: 6, z: y + rowD + 6 }], barrels: [{ x: 9, z: y + rowD + 6 }],
    pillars: new Set(), services: [{ kind: 'stash', pos: { x: 12, z: y + rowD + 6 } }], waypoints: [{ area, pos: { x: 40, z: y + rowD + 6 } }],
    stairs: { x: 46, z: y + rowD + 6 }, props: furn.props, wallDecor: furn.wall, npcs: [],
  };
}

/** the camp, laid out by hand; `area` is the camp's area, its waypoint's */
export function generateTown(area: number): Layout {
  const rng = new RNG(1337);
  const theme = THEMES.town;
  const size = 46;
  const map = new TileMap(size, size);
  carveRect(map, 3, 3, size - 6, size - 6);
  // buildings (solid blocks; drawn with CC0 models, procedural cottages as fallback)
  const houses: House[] = [
    { x: 6, y: 6, w: 5, h: 6, model: 'x_tavern', rot: 0 },
    { x: 31, y: 6, w: 4, h: 4, model: 'x_home_A', rot: 0 },
    { x: 6, y: 31, w: 4, h: 5, model: 'x_home_B', rot: Math.PI / 2 },
    { x: 35, y: 15, w: 6, h: 5, model: 'x_blacksmith', rot: -Math.PI / 2 },
  ];
  for (const h of houses) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) map.set(x, y, T_WALL);
  // the gate in the east palisade, out to the wilderness
  carveRect(map, size - 3, 26, 3, 2);
  buildWalls(map);
  const gate: Exit = { x: size - 1.2, z: 27, dest: 1, name: THEMES.wild.name, nx: -1, nz: 0 };
  const campfire = { x: 23, z: 23 };
  const start = { x: 23, z: 26.5 };
  const vendor = { x: 19, z: 21 };
  const stash = { x: 27, z: 20.5 };
  const waypoint = { x: 26, z: 28 };
  const crypt = { x: 38.5, z: 33 };
  const decor: Decor[] = [{ kind: 'campfire', x: campfire.x, z: campfire.z, rot: 0, scale: 1 }];
  decor.push({ kind: 'tent', x: 15.5, z: 16.5, rot: 0.6, scale: 1 });
  decor.push({ kind: 'tent', x: 28.5, z: 14.5, rot: -0.4, scale: 1.1 });

  const furn = new Furnisher(map, rng, start, [start, waypoint, vendor, stash, campfire]);
  // the vendor's table; no crates or barrels in the camp, since they look like things to open.
  // Lanterns either side of the stash, so it reads from across the camp
  furn.place('d_table_long_decorated_A', 20, 17, 1);
  furn.place('d_stool', 22, 17, 1);
  furn.place('h_lantern_standing', 24, 20, 0);
  furn.place('h_lantern_standing', 30, 20, 0);
  furn.place('x_well', 15, 26, 0);
  // lantern posts along the paths
  for (const [x, y] of [
    [19, 25],
    [28, 25],
    [23, 31],
    [31, 23],
    [13, 22],
    [34, 31],
  ]) furn.place('h_post_lantern', x, y, rng.int(0, 3));
  // lanterns either side of the gate out
  furn.place('h_arch_gate', size - 3, 26, 1);
  furn.place('h_post_lantern', size - 4, 25, 0);
  furn.place('h_post_lantern', size - 4, 28, 0);

  // the camp's graveyard in the south-east, round an old crypt
  furn.place('h_crypt', 37, 31, 0);
  for (let x = 28; x <= 34; x += 2) furn.place(x === 30 ? 'h_fence_broken' : 'h_fence', x, 33, 0);
  for (let y = 35; y <= 40; y += 2) if (y !== 37) furn.place('h_fence', 27, y, 1);
  furn.place('h_fence_pillar', 27, 33, 0);
  furn.place('h_arch_gate', 27, 37, 1);
  const graves = ['h_grave_A', 'h_grave_B', 'h_gravestone', 'h_gravemarker_A', 'h_gravemarker_B', 'h_grave_A_destroyed'];
  for (let y = 35; y <= 40; y += 2) for (let x = 29; x <= 34; x += 2) if (rng.chance(0.8)) furn.place(rng.pick(graves), x, y, 0);
  furn.place('h_tree_dead_large', 35, 35, 1);
  furn.place('h_tree_dead_medium', 29, 40, 2);
  furn.scatter('h_lantern_standing', 33.5, 36.5);
  furn.scatter('h_skull_candle', 31.5, 38.6);

  // woods along the palisade
  const trees = ['x_tree_single_A', 'x_tree_single_B', 'x_tree_single_A', 'h_tree_pine_orange_medium', 'h_tree_pine_yellow_large', 'h_tree_dead_small'];
  const rocks = ['x_rock_single_A', 'x_rock_single_C', 'x_rock_single_E'];
  for (let k = 0; k < 70; k++) {
    const edge = rng.int(0, 3);
    const t = rng.int(4, size - 6);
    const off = rng.int(3, 6);
    const x = edge === 0 ? t : edge === 1 ? t : edge === 2 ? off : size - 1 - off;
    const y = edge === 0 ? off : edge === 1 ? size - 1 - off : t;
    // keep the way to the gate open
    if (Math.abs(y + 0.5 - gate.z) < 4 && x > size - 10) continue;
    furn.place(rng.chance(0.82) ? rng.pick(trees) : rng.pick(rocks), x, y, rng.int(0, 3), 1.2);
  }

  // townsfolk
  const npcs: Npc[] = [
    { model: 'barbarian', x: 25.5, z: 21.5, rot: 0, name: '流浪佣兵' },
    { model: 'rogue', x: 20.5, z: 24.5, rot: 0, name: '女游侠' },
    { model: 'rogue_hooded', x: 35.5, z: 34.5, rot: 0, name: '墓园守卫' },
  ];
  for (const n of npcs) {
    // face the campfire (the graveyard guard watches the crypt)
    const tx = n.model === 'rogue_hooded' ? crypt.x : campfire.x;
    const tz = n.model === 'rogue_hooded' ? crypt.z : campfire.z;
    n.rot = Math.atan2(tx - n.x, tz - n.z);
    if (map.get(Math.floor(n.x), Math.floor(n.z)) === T_FLOOR) map.set(Math.floor(n.x), Math.floor(n.z), T_PROP);
  }

  // ── under the sky: earth worn bare inside the palisade, tracks from the fire (one out of the gate),
  // grass outside and the woods round it all, on past the map's edge where they are only to look at ──
  const inside = (x: number, z: number) => x >= 2 && x <= size - 3 && z >= 2 && z <= size - 3;
  const woods = growWoods(
    rng,
    { x0: -22, z0: -22, x1: size + 22, z1: size + 22 },
    (x, z) => inside(x, z) || map.walkable(x, z),
    (x, z) => x >= size - 3 && Math.abs(z + 0.5 - gate.z) < 2.6,
  );
  const tracks: [P2, P2][] = [
    [campfire, { x: size, z: gate.z }],
    [campfire, vendor],
    [campfire, stash],
    [campfire, waypoint],
    [campfire, { x: 16, z: 27 }],
  ];
  const toSeg = (x: number, z: number, a: P2, b: P2) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
    return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
  };
  const grassNoise = valueNoise(rng);
  const ground = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      const n = fbm(grassNoise, x / 9, z / 9);
      // the middle is worn to earth; grass comes back toward the palisade, and is everywhere outside it
      const edge = Math.min(x - 2, size - 3 - x, z - 2, size - 3 - z);
      const grass = inside(x, z) ? clamp01(0.6 - edge * 0.07 + n * 0.7) : clamp01(0.8 + n * 0.5);
      let track = Math.max(0, ...tracks.map(([a, b]) => clamp01((1.7 - toSeg(cx, cz, a, b)) / 0.9)));
      const fire = Math.hypot(cx - campfire.x, cz - campfire.z);
      if (fire < 4.5) track = Math.max(track, clamp01((4.5 - fire) / 2) * 0.8);
      const stone = clamp01((2.4 - Math.hypot(cx - waypoint.x, cz - waypoint.z)) / 1.2) * 0.7;
      const i = (z * size + x) * 4;
      ground[i] = Math.round((1 - stone) * grass * (1 - track) * 255);
      ground[i + 1] = Math.round((1 - stone) * (1 - grass) * (1 - track) * 255);
      ground[i + 2] = Math.round(track * 255);
      ground[i + 3] = Math.round(stone * (1 - track) * 255);
    }
  }

  const torches: Torch[] = [];
  const services: Service[] = [
    { kind: 'vendor', pos: vendor, npc: MERCHANT.name, npcId: MERCHANT.id },
    { kind: 'stash', pos: stash },
    { kind: 'campfire', pos: campfire },
  ];
  return {
    map, theme, start, waypoints: [{ area, pos: waypoint }], rooms: [], spawnRooms: [], torches, decor, chests: [], barrels: [],
    pillars: new Set(), services, exits: [gate], ground, houses, props: [...furn.props, ...woods.props], wallDecor: [], npcs,
  };
}
