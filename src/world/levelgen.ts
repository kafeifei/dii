import { RNG, type P2 } from '../core/math';
import { TileMap, T_FLOOR, T_VOID, T_WALL } from './tilemap';

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
  floor: string;
  floorAlt: string;
  wall: string;
  wallDark: string;
  ambient: string;
  ambientIntensity: number;
  torch: string;
  /** background clear colour */
  bg: string;
  texture: 'flagstone' | 'cave' | 'grass' | 'ice' | 'hell';
  wallTexture: 'brick' | 'rock' | 'palisade' | 'ice' | 'hell';
}

export const THEMES: Record<string, Theme> = {
  town: {
    key: 'town', name: '流亡者营地', floor: '#4a4a34', floorAlt: '#3d3f2b', wall: '#5a4630', wallDark: '#33281b',
    ambient: '#6f7aa8', ambientIntensity: 0.55, torch: '#ffa040', bg: '#07080c', texture: 'grass', wallTexture: 'palisade',
  },
  crypt: {
    key: 'crypt', name: '遗忘墓穴', floor: '#56524c', floorAlt: '#4a4741', wall: '#5e5850', wallDark: '#2e2a26',
    ambient: '#46506e', ambientIntensity: 0.18, torch: '#ff9a3c', bg: '#030304', texture: 'flagstone', wallTexture: 'brick',
  },
  cave: {
    key: 'cave', name: '血岩洞窟', floor: '#5a4436', floorAlt: '#4c392c', wall: '#5c4030', wallDark: '#2c1d15',
    ambient: '#5e3a3a', ambientIntensity: 0.16, torch: '#ff7a2c', bg: '#040202', texture: 'cave', wallTexture: 'rock',
  },
  ice: {
    key: 'ice', name: '霜寂地窖', floor: '#55606c', floorAlt: '#4a5460', wall: '#6a7888', wallDark: '#2a323c',
    ambient: '#5070a0', ambientIntensity: 0.2, torch: '#9ad0ff', bg: '#020306', texture: 'ice', wallTexture: 'ice',
  },
  hell: {
    key: 'hell', name: '燃烬深渊', floor: '#4a2a22', floorAlt: '#3a1e18', wall: '#4c2620', wallDark: '#200c0a',
    ambient: '#8a2a1a', ambientIntensity: 0.22, torch: '#ff5a20', bg: '#060100', texture: 'hell', wallTexture: 'hell',
  },
};

export function themeForDepth(depth: number): Theme {
  if (depth <= 0) return THEMES.town;
  if (depth <= 4) return THEMES.crypt;
  if (depth <= 8) return THEMES.cave;
  if (depth <= 12) return THEMES.ice;
  return THEMES.hell;
}

export interface Layout {
  map: TileMap;
  theme: Theme;
  depth: number;
  start: P2;
  stairs?: P2;
  waypoint?: P2;
  rooms: Room[];
  spawnRooms: Room[];
  torches: Torch[];
  decor: Decor[];
  chests: P2[];
  barrels: P2[];
  pillars: Set<number>;
  vendor?: P2;
  stash?: P2;
  campfire?: P2;
  bossRoom?: Room;
  /** solid buildings (town only); their tiles are walls but render as houses */
  houses?: Room[];
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

export function bfsDistances(map: TileMap, from: P2): Int32Array {
  const d = new Int32Array(map.w * map.h).fill(-1);
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.z);
  const q: number[] = [sy * map.w + sx];
  d[q[0]] = 0;
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const cx = c % map.w;
    const cy = (c / map.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.walkable(nx, ny)) continue;
      const ni = ny * map.w + nx;
      if (d[ni] !== -1) continue;
      d[ni] = d[c] + 1;
      q.push(ni);
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

export function generateDungeon(depth: number, seed: number): Layout {
  const rng = new RNG(seed);
  const theme = themeForDepth(depth);
  const size = 60 + Math.min(depth * 2, 30);
  const map = new TileMap(size, size);
  const rooms: Room[] = [];
  const target = Math.min(9 + Math.floor(depth / 2), 17);
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
    const n = rng.int(1, 4);
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
  const bossRoom = depth % 4 === 0 ? stairsRoom : undefined;

  return {
    map, theme, depth, start, stairs, waypoint, rooms, spawnRooms, torches, decor, chests, barrels, pillars, bossRoom,
  };
}

export function generateTown(): Layout {
  const rng = new RNG(1337);
  const theme = THEMES.town;
  const size = 46;
  const map = new TileMap(size, size);
  carveRect(map, 3, 3, size - 6, size - 6);
  // houses (solid blocks)
  const houses: Room[] = [
    { x: 7, y: 7, w: 6, h: 4 },
    { x: 31, y: 8, w: 5, h: 5 },
    { x: 8, y: 31, w: 5, h: 6 },
  ];
  for (const h of houses) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) map.set(x, y, T_WALL);
  buildWalls(map);
  const campfire = { x: 23, z: 23 };
  const start = { x: 23, z: 26.5 };
  const vendor = { x: 19, z: 21 };
  const stash = { x: 27, z: 20.5 };
  const waypoint = { x: 26, z: 28 };
  const stairs = { x: 38.5, z: 38.5 };
  const decor: Decor[] = [{ kind: 'campfire', x: campfire.x, z: campfire.z, rot: 0, scale: 1 }];
  decor.push({ kind: 'tent', x: 16, z: 18, rot: 0.6, scale: 1 });
  decor.push({ kind: 'tent', x: 30, z: 16, rot: -0.4, scale: 1.1 });
  decor.push({ kind: 'crate', x: 20.5, z: 19.5, rot: 0.2, scale: 1 });
  decor.push({ kind: 'crate', x: 21.3, z: 19.2, rot: 0.9, scale: 0.8 });
  decor.push({ kind: 'banner', x: 36.5, z: 36.5, rot: 0, scale: 1 });
  for (let k = 0; k < 30; k++) {
    const edge = rng.int(0, 3);
    const t = rng.range(5, size - 5);
    const off = rng.range(4, 6.5);
    const x = edge === 0 ? t : edge === 1 ? t : edge === 2 ? off : size - off;
    const z = edge === 0 ? off : edge === 1 ? size - off : t;
    if (!map.walkableAt(x, z)) continue;
    if (Math.hypot(x - stairs.x, z - stairs.z) < 4) continue;
    decor.push({ kind: rng.chance(0.75) ? 'tree' : 'rock', x, z, rot: rng.range(0, 6.28), scale: rng.range(0.8, 1.4) });
  }
  const torches: Torch[] = [];
  return {
    map, theme, depth: 0, start, stairs, waypoint, rooms: [], spawnRooms: [], torches, decor, chests: [], barrels: [],
    pillars: new Set(), vendor, stash, campfire, houses,
  };
}
