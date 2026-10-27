import { RNG, type P2 } from '../core/math';
import { areaDef } from './areas';
import { Furnisher, type Prop } from './furnish';
import type { Decor, House, Npc, Room, Service } from './levelgen';
import { BIG_ROCKS, TREES, clamp01, fbm, growWoods, pickWeighted, valueNoise } from './outdoors';
import { CELL_PRESETS, campPreset, carveRuins, dressPreset, stampCamp, type CellPreset, type PresetOut, type Way } from './presets';
import { TileMap, T_FLOOR, T_VOID, T_WALL } from './tilemap';

/**
 * An outdoor area made Diablo II's way (DrlgOutdoors.cpp DRLGOUTDOORS_GenerateLevel, DrlgOutWild.cpp
 * DRLGOUTWILD_InitAct1OutdoorLevel): a grid of 8×8-tile cells. The ring of cells round the edge is
 * border, woods (later cliffs too) that close the area in, opened only at its ports; some cells hold
 * presets (the waypoint, a cave mouth, shrines, stone fills, the sights of wild.ts); a road runs from
 * port to waypoint to port, footpaths run off it to the cave and the sights; the rest is open land
 * with groves and rocks. Every cell inside the border is a room for monsters. It is made in a map
 * of its own, so the Furnisher's flood fills stay small; the overworld (overworld.ts) copies it into
 * the big one.
 */

/** D2's outdoor cell, in tiles (DRLGOUTDOORS_GenerateLevel: nGridWidth = nWidth / 8) */
export const CELL = 8;
/** our areas are D2's this many times over each way: the one knob for their size (plan: 区域大小先按原版放大 1.25 倍) */
export const OUT_SCALE = 1.25;

/** a D2 length in tiles, scaled, in whole cells */
export function cellsOf(d2Tiles: number, scale = OUT_SCALE): number {
  return Math.max(1, Math.round((d2Tiles * scale) / CELL));
}

export type Side = 'n' | 'e' | 's' | 'w';

/** an opening in the border, where the area runs on into the next */
export interface ZonePort {
  side: Side;
  /** where along that side the opening's middle is, in the zone's tiles */
  at: number;
  /** the area on the other side */
  to: number;
  /** that area isn't on the map yet: the road ends at an entrance on to it */
  closed?: boolean;
}

export interface SightSpec {
  kind: CellPreset;
  /** set by a road, as D2 sets cottages and its pond (DRLGOUTDOORS_SpawnRandomOutdoorDS1), rather than anywhere (DRLGOUTDOORS_SpawnOutdoorLevelPreset) */
  nearRoad: boolean;
}

export interface ZoneSpec {
  area: number;
  seed: number;
  /** its size in cells */
  cw: number;
  ch: number;
  /** its openings; the first is the one toward the camp, where the road starts */
  ports: ZonePort[];
  /** the camp stamped in with its top-left at this tile (the camp's own area); its gate is the road's start */
  camp?: P2;
  /** a waypoint; with `by`, in the cell inside the port to that area */
  waypoint?: { by?: number };
  /** a cave mouth into area `dest`, in the free cell farthest from `farFrom` (zone tiles) */
  cave?: { dest: number; farFrom: P2 };
  shrines: number;
  sights: SightSpec[];
}

/** a way into an area that isn't part of this map: a cave mouth, or the road on to an area not built yet */
export interface Entrance {
  x: number;
  z: number;
  /** the area it leads to */
  dest: number;
  name: string;
  kind: 'cave' | 'road';
  /** into this map from it: where someone coming back appears */
  nx: number;
  nz: number;
}

export interface Zone {
  area: number;
  seed: number;
  w: number;
  h: number;
  map: TileMap;
  /** per tile, how much grass, dirt, road and stone (Layout.ground) */
  ground: Uint8Array;
  props: Prop[];
  decor: Decor[];
  chests: P2[];
  barrels: P2[];
  shrines: P2[];
  elites: P2[];
  services: Service[];
  spawnRooms: Room[];
  waypoint?: P2;
  entrances: Entrance[];
  /** the middle of the tile just inside each port's opening, and the area it opens to, in port order */
  ports: P2[];
  portTo: number[];
  /** the camp's: where a new hero stands, its buildings and people */
  start?: P2;
  houses?: House[];
  npcs?: Npc[];
}

type Use = 'border' | 'palisade' | 'open' | 'approach' | 'road' | CellPreset;

/** half an opening's width in tiles */
const PORT_HALF = 3;
/** how far in from the edge an opening runs, through the border cell and a little past it */
const PORT_DEPTH = CELL + 4;
/** the woods line stays at least this far in from the edge, so a seam is shut wherever there's no port */
const EDGE_MIN = 4;
/** D2's eight neighbours, in its order (DRLGOUTDOORS_SpawnRandomOutdoorDS1) */
const NEAR8: [number, number][] = [[-1, 0], [0, -1], [0, 1], [1, 0], [-1, -1], [1, 1], [1, -1], [-1, 1]];

const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const ahead = (w: Way, d: number): P2 => ({ x: w.x + w.nx * d, z: w.z + w.nz * d });

/** points along a Catmull-Rom curve through `pts`, about `step` apart (as wild.ts) */
function spline(pts: P2[], step: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

/** a footpath straight from a to b with a gentle bend, about 0.4 apart (as wild.ts) */
function bent(a: P2, b: P2, bend: number): P2[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const n = Math.ceil(len / 0.4);
  const pts: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const w = Math.sin(t * Math.PI) * bend;
    pts.push({ x: a.x + dx * t - (dz / len) * w, z: a.z + dz * t + (dx / len) * w });
  }
  return pts;
}

/** lower each tile's distance to the line through `pts`, out to `reach` (as wild.ts) */
function stampDistance(field: Float32Array, w: number, h: number, pts: P2[], reach: number) {
  for (const p of pts) {
    const x0 = Math.max(0, Math.floor(p.x - reach));
    const x1 = Math.min(w - 1, Math.ceil(p.x + reach));
    const z0 = Math.max(0, Math.floor(p.z - reach));
    const z1 = Math.min(h - 1, Math.ceil(p.z + reach));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = z * w + x;
        const dx = x + 0.5 - p.x;
        const dz = z + 0.5 - p.z;
        // the points come thick along a line, so most tiles are nearer one already: skip the hypot
        if (dx * dx + dz * dz > field[i] * field[i] * 1.0001) continue;
        const d = Math.hypot(dx, dz);
        if (d < field[i]) field[i] = d;
      }
    }
  }
}

/** walkable tiles reachable from `from`, the four ways */
export function flood(map: TileMap, from: P2): Uint8Array {
  const { w, h, tiles } = map;
  const seen = new Uint8Array(w * h);
  const sx = Math.floor(from.x);
  const sz = Math.floor(from.z);
  if (!map.walkable(sx, sz)) return seen;
  const q = new Int32Array(w * h);
  let tail = 0;
  q[tail++] = sz * w + sx;
  seen[q[0]] = 1;
  for (let head = 0; head < tail; head++) {
    const c = q[head];
    const x = c % w;
    const z = (c / w) | 0;
    if (x + 1 < w && !seen[c + 1] && tiles[c + 1] === T_FLOOR) (seen[c + 1] = 1), (q[tail++] = c + 1);
    if (x > 0 && !seen[c - 1] && tiles[c - 1] === T_FLOOR) (seen[c - 1] = 1), (q[tail++] = c - 1);
    if (z + 1 < h && !seen[c + w] && tiles[c + w] === T_FLOOR) (seen[c + w] = 1), (q[tail++] = c + w);
    if (z > 0 && !seen[c - w] && tiles[c - w] === T_FLOOR) (seen[c - w] = 1), (q[tail++] = c - w);
  }
  return seen;
}

function edgeWay(p: ZonePort, w: number, h: number): Way {
  switch (p.side) {
    case 'w':
      return { x: 0, z: p.at, nx: 1, nz: 0 };
    case 'e':
      return { x: w, z: p.at, nx: -1, nz: 0 };
    case 'n':
      return { x: p.at, z: 0, nx: 0, nz: 1 };
    case 's':
      return { x: p.at, z: h, nx: 0, nz: -1 };
  }
}

export function generateZone(spec: ZoneSpec): Zone {
  const { cw, ch } = spec;
  const W = cw * CELL;
  const H = ch * CELL;
  const N = cw * ch;
  const rng = new RNG(spec.seed);
  const map = new TileMap(W, H);
  const edgeNoise = valueNoise(rng);
  const groveNoise = valueNoise(rng);
  const rockNoise = valueNoise(rng);
  const soilNoise = valueNoise(rng);
  const town = areaDef(spec.area)?.kind === 'town';

  // ── the cells: the ring round the edge is border (DRLGOUTPLACE_PlaceAct1245OutdoorBorders) ──
  const use: Use[] = [];
  for (let i = 0; i < N; i++) {
    const cx = i % cw;
    const cz = (i / cw) | 0;
    use.push(cx === 0 || cz === 0 || cx === cw - 1 || cz === ch - 1 ? 'border' : 'open');
  }
  const ci = (cx: number, cz: number) => cz * cw + cx;
  const cellAt = (p: P2) => ci(clampI(Math.floor(p.x / CELL), 0, cw - 1), clampI(Math.floor(p.z / CELL), 0, ch - 1));
  const middle = (c: number): P2 => ({ x: (c % cw) * CELL + CELL / 2, z: ((c / cw) | 0) * CELL + CELL / 2 });

  // the camp's palisade goes down first, and the cells it stands in are its own
  const cp = spec.camp ? campPreset() : undefined;
  const co = spec.camp ?? { x: 0, z: 0 };
  const stamp = spec.camp ? stampCamp(map, co.x, co.z) : undefined;
  const campOwns = (x: number, z: number) => {
    if (!cp) return false;
    const lx = x - co.x;
    const lz = z - co.z;
    return lx >= 0 && lz >= 0 && lx < cp.w && lz < cp.h && cp.tiles[lz * cp.w + lx] !== T_VOID;
  };
  if (cp) {
    for (let c = 0; c < N; c++) {
      const x0 = (c % cw) * CELL;
      const z0 = ((c / cw) | 0) * CELL;
      if (x0 < co.x + cp.w && x0 + CELL > co.x && z0 < co.z + cp.h && z0 + CELL > co.z) use[c] = 'palisade';
    }
  }
  const inCampCell = (x: number, z: number) => use[ci(Math.floor(x / CELL), Math.floor(z / CELL))] === 'palisade';

  // ── ports: an opening in the border cell each is in, and the cell inside it kept for the way in
  // (D2 flags the link cell, DRLGOUTPLACE_PlaceAct1245OutdoorBorders) ──
  const portWays = spec.ports.map((p) => edgeWay(p, W, H));
  const ways: Way[] = [...(stamp ? [stamp.gate] : []), ...portWays];
  const approach = portWays.map((w) => {
    const c = cellAt(ahead(w, 0.5));
    const a = c + w.nx + w.nz * cw;
    if (use[a] === 'open') use[a] = 'approach';
    return a;
  });

  /** the inner cells in D2's shuffled order: as many swaps of two random cells as there are cells (DRLGOUTDOORS_SpawnOutdoorLevelPreset) */
  const shuffled = () => {
    const list: number[] = [];
    for (let cz = 1; cz < ch - 1; cz++) for (let cx = 1; cx < cw - 1; cx++) list.push(ci(cx, cz));
    for (let k = 0; k < list.length; k++) {
      const a = rng.int(0, list.length - 1);
      const b = rng.int(0, list.length - 1);
      [list[a], list[b]] = [list[b], list[a]];
    }
    return list;
  };

  // ── the waypoint: Cold Plains' in the cell with its link to Blood Moor, moved one cell in off the
  // border; anyone else's in a random free cell (DRLGOUTDOORS_SpawnAct12Waypoint) ──
  let wpCell = -1;
  if (spec.waypoint) {
    const by = spec.waypoint.by;
    const k = by === undefined ? -1 : spec.ports.findIndex((p) => p.to === by);
    wpCell = k >= 0 ? approach[k] : (shuffled().find((c) => use[c] === 'open') ?? -1);
    if (wpCell >= 0) use[wpCell] = 'waypoint';
  }

  // ── the cave: D2 walks the inner cells from a random one and keeps the first farthest from the camp,
  // by the longer distance each way and half the shorter (DRLGOUTDOORS_SpawnPresetFarAway). It asks
  // that the cells all round the mouth be free too (DrlgOutWild.cpp: SpawnPresetFarAway(…,
  // LVLPREST_ACT1_DOE_ENTRANCE, -1, 1, 15); TestOutdoorLevelPreset with nOffset 1 and nFlags 15 grows
  // the 1×1 test to 3×3, all inside the grid and spawn-valid, which a border cell (nUnkb00) isn't),
  // so the mouth is never against the border ring ──
  let caveCell = -1;
  if (spec.cave) {
    const nw = cw - 2;
    const nh = ch - 2;
    const rx = rng.int(0, nw - 1);
    const rz = rng.int(0, nh - 1);
    const clearRound = (c: number) => {
      const cx = c % cw;
      const cz = (c / cw) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (cx + dx < 1 || cz + dz < 1 || cx + dx > cw - 2 || cz + dz > ch - 2 || use[ci(cx + dx, cz + dz)] !== 'open') return false;
      return true;
    };
    const farthest = (ok: (c: number) => boolean) => {
      let best = -1;
      let at = -1;
      for (let i = 0; i < nh; i++) {
        for (let j = 0; j < nw; j++) {
          const c = ci(((j + rx) % nw) + 1, ((i + rz) % nh) + 1);
          if (!ok(c)) continue;
          const m = middle(c);
          const dx = Math.abs(m.x - spec.cave!.farFrom.x);
          const dz = Math.abs(m.z - spec.cave!.farFrom.z);
          const d = Math.max(dx, dz) + Math.min(dx, dz) / 2;
          if (d > best) {
            best = d;
            at = c;
          }
        }
      }
      return at;
    };
    // where D2 finds no room it only warns (FOG_DisplayWarning "fAdded") and the area has no cave;
    // ours takes the farthest free cell then, cleared round or not
    caveCell = farthest(clearRound);
    if (caveCell < 0) caveCell = farthest((c) => use[c] === 'open');
    if (caveCell >= 0) use[caveCell] = 'cave';
  }

  // ── roads, laid cell by cell: the cheapest way through open cells, each cell a little dearer or
  // cheaper at random so the road wanders ──
  const wander = new Float32Array(N);
  for (let c = 0; c < N; c++) wander[c] = rng.range(0, 1.5);
  const passable = (c: number) => use[c] === 'open' || use[c] === 'approach' || use[c] === 'road';
  const route = (from: number[], to: Set<number>): number[] | null => {
    const dist = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    for (const s of from) dist[s] = 0;
    for (;;) {
      let u = -1;
      for (let c = 0; c < N; c++) if (!done[c] && dist[c] < Infinity && (u < 0 || dist[c] < dist[u])) u = c;
      if (u < 0) return null;
      if (to.has(u)) {
        const path = [u];
        while (prev[path[0]] >= 0) path.unshift(prev[path[0]]);
        return path;
      }
      done[u] = 1;
      const ux = u % cw;
      const uz = (u / cw) | 0;
      for (const [dx, dz] of NEAR8) {
        const vx = ux + dx;
        const vz = uz + dz;
        if (vx < 0 || vz < 0 || vx >= cw || vz >= ch) continue;
        const v = ci(vx, vz);
        if (!to.has(v) && !passable(v)) continue;
        // a diagonal step only between two open cells, so a road never clips a preset or the border
        if (dx && dz && !(passable(ci(ux + dx, uz)) && passable(ci(ux, uz + dz)))) continue;
        const d = dist[u] + (1 + wander[v]) * (dx && dz ? Math.SQRT2 : 1);
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
  };

  // every road and footpath so far, as points and as the cells they cross (D2's path cells, nUnkb07)
  const roads: P2[][] = [];
  const paths: P2[][] = [];
  const network: P2[] = [];
  const netCells = new Set<number>();
  const nearestOnNet = (p: P2) => network.reduce((b, q) => ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < (b.x - p.x) ** 2 + (b.z - p.z) ** 2 ? q : b));
  const add = (pts: P2[], list: P2[][]) => {
    list.push(pts);
    network.push(...pts);
    for (const p of pts) {
      const c = cellAt(p);
      netCells.add(c);
      if (use[c] === 'open') use[c] = 'road';
    }
  };
  /** the control points of a way from a road end (or off the roads so far) through the cells to `to` */
  const lay = (from: Way | null, to: Set<number>, jitter: number): P2[] | null => {
    if (!from && !network.length) return null;
    const cells = route(from ? [cellAt(ahead(from, 3))] : [...netCells], to);
    if (!cells) return null;
    const ctrl: P2[] = [];
    if (from) ctrl.push({ x: from.x, z: from.z }, ahead(from, 3));
    else ctrl.push(nearestOnNet(middle(cells.find((c) => !netCells.has(c)) ?? cells[cells.length - 1])));
    for (const c of cells) {
      if (to.has(c)) break;
      // on the roads so far, or the port's (or the gate's) own cell, which the straight start covers
      if ((!from && netCells.has(c)) || use[c] === 'border' || use[c] === 'palisade') continue;
      const m = middle(c);
      ctrl.push({ x: m.x + rng.range(-jitter, jitter), z: m.z + rng.range(-jitter, jitter) });
    }
    return ctrl;
  };
  const toWay = (w: Way) => new Set([cellAt(ahead(w, 3))]);
  const wayEnd = (w: Way) => [ahead(w, 3), { x: w.x, z: w.z }];

  // the main road: from the way in to the waypoint, if there is one, then on to every other way, each
  // branching off the road so far
  const rest = ways.slice(1);
  let first: P2[] | null = null;
  if (wpCell >= 0) {
    first = lay(ways[0], new Set([wpCell]), 2);
    if (first) first.push(middle(wpCell));
  } else if (rest.length) {
    const w = rest.shift()!;
    first = lay(ways[0], toWay(w), 2);
    if (first) first.push(...wayEnd(w));
  }
  if (first) add(spline(first, 0.4), roads);
  for (const w of rest) {
    const ctrl = lay(null, toWay(w), 2);
    if (ctrl) add(spline([...ctrl, ...wayEnd(w)], 0.4), roads);
  }

  /** a footpath off the roads to `to`, ending at `end`; returns the point it comes in from */
  const footpath = (to: Set<number>, end: P2): P2 | null => {
    const ctrl = lay(null, to, 1.5);
    if (!ctrl) return null;
    const from = ctrl[ctrl.length - 1];
    add(ctrl.length === 1 ? bent(from, end, rng.range(-1.5, 1.5)) : spline([...ctrl, end], 0.4), paths);
    return from;
  };

  // the cave mouth, at its cell's middle, opening toward its footpath
  let cave: P2 | undefined;
  let caveFace: P2 = { x: 0, z: 1 };
  if (caveCell >= 0) {
    const m = middle(caveCell);
    cave = { x: m.x + 0.5, z: m.z + 0.5 };
    const from = footpath(new Set([caveCell]), cave);
    if (from) {
      const dx = from.x - cave.x;
      const dz = from.z - cave.z;
      caveFace = Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) || 1 };
    }
  }

  // ── shrines: five in each Act 1 outdoor area, in random free cells (DRLGOUTDOORS_SpawnAct12Shrines(pLevel, 5)) ──
  const shrinePts: P2[] = [];
  for (const c of shuffled()) {
    if (shrinePts.length >= spec.shrines) break;
    if (use[c] !== 'open') continue;
    use[c] = 'shrine';
    const m = middle(c);
    shrinePts.push({ x: Math.floor(m.x + rng.range(-1, 1)) + 0.5, z: Math.floor(m.z + rng.range(-1, 1)) + 0.5 });
  }

  // ── the sights: each on free inner cells, by a road if D2 sets it so, else anywhere free ──
  interface Sight {
    kind: CellPreset;
    cells: number[];
    c: P2;
    from?: P2;
  }
  const sights: Sight[] = [];
  const fits = (cx: number, cz: number, n: number) => {
    for (let dz = 0; dz < n; dz++) {
      for (let dx = 0; dx < n; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 1 || z < 1 || x > cw - 2 || z > ch - 2 || use[ci(x, z)] !== 'open') return false;
      }
    }
    return true;
  };
  const take = (kind: CellPreset, cx: number, cz: number) => {
    const n = CELL_PRESETS[kind].cells;
    const cells: number[] = [];
    for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) cells.push(ci(cx + dx, cz + dz));
    for (const c of cells) use[c] = kind;
    const j = n > 1 ? 1 : 0;
    const c = { x: Math.floor(cx * CELL + (n * CELL) / 2 + rng.range(-j, j)) + 0.5, z: Math.floor(cz * CELL + (n * CELL) / 2 + rng.range(-j, j)) + 0.5 };
    sights.push({ kind, cells, c });
  };
  for (const s of spec.sights) {
    const n = CELL_PRESETS[s.kind].cells;
    let done = false;
    if (s.nearRoad) {
      for (const c of shuffled()) {
        if (!netCells.has(c)) continue;
        for (const [dx, dz] of NEAR8) {
          const x = (c % cw) + dx;
          const z = ((c / cw) | 0) + dz;
          if (!fits(x, z, n)) continue;
          take(s.kind, x, z);
          done = true;
          break;
        }
        if (done) break;
      }
    }
    if (done) continue;
    for (const c of shuffled()) {
      if (!fits(c % cw, (c / cw) | 0, n)) continue;
      take(s.kind, c % cw, (c / cw) | 0);
      break;
    }
  }
  for (const s of sights) if (CELL_PRESETS[s.kind].path) s.from = footpath(new Set(s.cells), s.c) ?? undefined;

  // the waypoint by the road through its cell, on whichever side leaves the most room
  let waypoint: P2 | undefined;
  if (wpCell >= 0) {
    const m = middle(wpCell);
    const off = (p: P2) => network.reduce((d, q) => Math.min(d, Math.hypot(q.x - p.x, q.z - p.z)), Infinity);
    const spots = [[0, -3], [0, 3], [-3, 0], [3, 0], [-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].map(([dx, dz]) => ({ x: Math.floor(m.x + dx) + 0.5, z: Math.floor(m.z + dz) + 0.5 }));
    waypoint = spots.reduce((b, p) => (off(p) > off(b) ? p : b));
  }

  const clearings: { c: P2; r: number; floor: 'dirt' | 'stone' }[] = [];
  if (waypoint) clearings.push({ c: waypoint, r: CELL_PRESETS.waypoint.r, floor: 'stone' });
  if (cave) clearings.push({ c: cave, r: CELL_PRESETS.cave.r, floor: 'stone' });
  for (const c of shrinePts) clearings.push({ c, r: CELL_PRESETS.shrine.r, floor: 'dirt' });
  for (const s of sights) if (CELL_PRESETS[s.kind].r > 0) clearings.push({ c: s.c, r: CELL_PRESETS[s.kind].r, floor: CELL_PRESETS[s.kind].floor });
  // each clearing's tiles, worked out once: 1 inside it, 2 within the groves' 1.5 more; and the
  // stone or earth it puts on the ground
  const CLEAR_PAD = 1.5;
  const clear = new Uint8Array(W * H);
  const clearStone = new Float64Array(W * H);
  const clearDirt = new Float64Array(W * H);
  for (const k of clearings) {
    const reach = Math.ceil(k.r + CLEAR_PAD);
    for (let z = Math.max(0, Math.floor(k.c.z) - reach); z <= Math.min(H - 1, Math.floor(k.c.z) + reach); z++) {
      for (let x = Math.max(0, Math.floor(k.c.x) - reach); x <= Math.min(W - 1, Math.floor(k.c.x) + reach); x++) {
        const i = z * W + x;
        const d = Math.hypot(x + 0.5 - k.c.x, z + 0.5 - k.c.z);
        if (d < k.r + CLEAR_PAD) clear[i] |= 2;
        if (d >= k.r) continue;
        clear[i] |= 1;
        if (k.floor === 'stone') clearStone[i] = Math.max(clearStone[i], clamp01((1 - d / k.r) * 2.2) * 0.85);
        else clearDirt[i] = Math.max(clearDirt[i], clamp01((1 - d / k.r) * 1.8) * 0.8);
      }
    }
  }
  const inClearing = (x: number, z: number, pad: 0 | typeof CLEAR_PAD = 0) => (clear[z * W + x] & (pad ? 2 : 1)) !== 0;

  const roadDist = new Float32Array(W * H).fill(99);
  for (const r of roads) stampDistance(roadDist, W, H, r, 5);
  const pathDist = new Float32Array(W * H).fill(99);
  for (const p of paths) stampDistance(pathDist, W, H, p, 3);
  const inPort = (x: number, z: number) =>
    portWays.some((w) => {
      const px = x + 0.5 - w.x;
      const pz = z + 0.5 - w.z;
      const depth = px * w.nx + pz * w.nz;
      return depth >= 0 && depth < PORT_DEPTH && Math.abs(px * w.nz - pz * w.nx) < PORT_HALF;
    });

  // ── the land: everything in from the edge, with a noisy line into the border cells, and the roads,
  // the openings and the clearings cut through; the camp's own tiles stay as it has them ──
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (campOwns(x, z)) continue;
      const i = z * W + x;
      const d = Math.min(x, W - 1 - x, z, H - 1 - z);
      // fbm is within ±1, so past CELL + 4 the noise can't take the land's edge that far in
      const inLand = d >= EDGE_MIN && (d > CELL + 4 || d + fbm(edgeNoise, x / 14, z / 14) * 5 > CELL - 1);
      if (inLand || roadDist[i] < 1.8 || pathDist[i] < 1.3 || inPort(x, z) || inClearing(x, z)) map.tiles[i] = T_FLOOR;
    }
  }
  for (const s of sights) if (s.kind === 'ruins') carveRuins(map, rng, s.c, s.from ?? nearestOnNet(s.c), (x, z) => pathDist[z * W + x] < 1.6);

  // land the roads don't reach (islands the noisy edge left in the woods) goes back to woods
  const start = ahead(ways[0], 3);
  const seen = flood(map, start);
  for (let i = 0; i < W * H; i++) if (map.tiles[i] === T_FLOOR && !seen[i] && !campOwns(i % W, (i / W) | 0)) map.tiles[i] = T_VOID;
  const land = (x: number, z: number) => map.tiles[z * W + x] !== T_VOID;

  // ── what stands on the land: the presets, then groves and rocks, everything still reachable ──
  const keepClear: P2[] = [];
  for (const w of ways) keepClear.push(ahead(w, 2.5), ahead(w, 4));
  if (waypoint) keepClear.push(waypoint);
  if (cave) keepClear.push(cave);
  const furn = new Furnisher(map, rng, start, keepClear);
  for (const k of clearings) furn.reserveAround(k.c, 1);
  const out: PresetOut = { chests: [], barrels: [], shrines: [], elites: [], services: [], rocks: [] };
  const south = { x: 0, z: 1 };
  if (waypoint) dressPreset('waypoint', furn, rng, waypoint, south, out);
  if (cave) dressPreset('cave', furn, rng, cave, caveFace, out);
  for (const c of shrinePts) dressPreset('shrine', furn, rng, c, south, out);
  for (const s of sights) dressPreset(s.kind, furn, rng, s.c, south, out);

  // groves and rock outcrops, off the roads, the openings and the clearings (as wild.ts); thinner round the camp
  const keep = (x: number, z: number) => {
    const i = z * W + x;
    if (roadDist[i] < 3.4 || pathDist[i] < 2 || inPort(x, z) || inClearing(x, z, 1.5)) return true;
    return ways.some((w) => Math.hypot(x + 0.5 - w.x, z + 0.5 - w.z) < 6);
  };
  const thick = town ? 0.4 : 1;
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (!land(x, z) || inCampCell(x, z) || keep(x, z)) continue;
      const g = fbm(groveNoise, x / 9, z / 9);
      const r = fbm(rockNoise, x / 7, z / 7);
      if (g > 0.3 && rng.chance(0.45 * thick)) furn.place(pickWeighted(rng, TREES), x, z, rng.int(0, 3), 0.8);
      else if (r > 0.5 && rng.chance(0.2 * thick)) {
        const big = rng.chance(0.3);
        if (furn.place(rng.pick(big ? BIG_ROCKS : ['x_rock_single_A', 'x_rock_single_B', 'x_rock_single_D']), x, z, rng.int(0, 3), 1)) out.rocks.push({ x: x + (big ? 1 : 0.5), z: z + (big ? 1 : 0.5) });
      }
    }
  }

  // ── the woods: thick by the land, thinner further in, never on a road or in an opening ──
  const woods = growWoods(rng, { x0: 0, z0: 0, x1: W, z1: H }, land, (x, z) => roadDist[z * W + x] < 2.6 || inPort(x, z));

  // ── the ground: the camp's own inside its palisade; elsewhere road on the roads, earth in the
  // clearings and under the trees, stone round the rocks, grass the rest (as wild.ts) ──
  const ground = new Uint8Array(W * H * 4);
  const stone = new Float32Array(W * H);
  for (const r of out.rocks) {
    for (let z = Math.floor(r.z) - 2; z <= Math.floor(r.z) + 2; z++) {
      for (let x = Math.floor(r.x) - 2; x <= Math.floor(r.x) + 2; x++) {
        if (x < 0 || z < 0 || x >= W || z >= H) continue;
        stone[z * W + x] = Math.max(stone[z * W + x], clamp01(1.1 - Math.hypot(x + 0.5 - r.x, z + 0.5 - r.z) * 0.6));
      }
    }
  }
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (cp && campOwns(x, z)) {
        const j = ((z - co.z) * cp.w + x - co.x) * 4;
        for (let k = 0; k < 4; k++) ground[i * 4 + k] = cp.ground[j + k];
        continue;
      }
      const roadW = Math.max(clamp01((2.0 - roadDist[i]) / 0.7), clamp01((1.3 - pathDist[i]) / 0.6) * 0.85);
      let dirt = Math.max(clamp01(0.3 - fbm(soilNoise, x / 11, z / 11) * 1.3) * 0.75, clearDirt[i]);
      let st = Math.max(stone[i], clearStone[i]);
      if (map.tiles[i] === T_WALL) st = 1;
      if (!land(x, z)) dirt = Math.max(dirt, 0.5 + Math.min(0.3, woods.fromLand(x, z) * 0.05));
      const rest = 1 - roadW;
      ground[i * 4] = Math.round((1 - st) * (1 - dirt) * rest * 255);
      ground[i * 4 + 1] = Math.round(dirt * (1 - st) * rest * 255);
      ground[i * 4 + 2] = Math.round(roadW * 255);
      ground[i * 4 + 3] = Math.round(st * rest * 255);
    }
  }

  // ── rooms for monsters. D2 makes every cell without a preset an 8×8 room (DRLGOUTDOORS_GenerateLevel:
  // DRLGOUTPLACE_CreateOutdoorRoomEx(…, 8, 8, …)), the waypoint's and the shrines' too (only flags on
  // the cell), and a preset's own rooms are peopled as its lvlprest.json Populate says: 1 for the cave
  // mouths ("Act 1 - DOE Entrance", "Cave Entrance"), the stone fills, the cottages, the pond and the
  // fallen camps, so the sights are guarded. A two-cell sight stands for D2's one-cell preset, so it is
  // one room. None in the border (woods here), on the camp's doorstep or in a town ──
  const spawnRooms: Room[] = [];
  if (!town) {
    const doorstep = new Set(spec.ports.map((p, k) => (areaDef(p.to)?.kind === 'town' ? approach[k] : -1)));
    const room = (cx: number, cz: number, n: number) => {
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      let walk = 0;
      for (let z = z0; z < z0 + n * CELL; z++) for (let x = x0; x < x0 + n * CELL; x++) if (map.walkable(x, z)) walk++;
      if (walk >= 16) spawnRooms.push({ x: x0, y: z0, w: n * CELL, h: n * CELL });
    };
    const big = sights.filter((s) => s.cells.length > 1);
    const inBig = new Set(big.flatMap((s) => s.cells));
    for (let c = 0; c < N; c++) if (use[c] !== 'border' && use[c] !== 'palisade' && !doorstep.has(c) && !inBig.has(c)) room(c % cw, (c / cw) | 0, 1);
    for (const s of big) room(s.cells[0] % cw, (s.cells[0] / cw) | 0, CELL_PRESETS[s.kind].cells);
  }

  const entrances: Entrance[] = [];
  if (cave && spec.cave) entrances.push({ x: cave.x, z: cave.z, dest: spec.cave.dest, name: areaDef(spec.cave.dest)?.name ?? '', kind: 'cave', nx: caveFace.x, nz: caveFace.z });
  spec.ports.forEach((p, k) => {
    if (!p.closed) return;
    const w = portWays[k];
    const e = ahead(w, 1.5);
    entrances.push({ x: e.x, z: e.z, dest: p.to, name: areaDef(p.to)?.name ?? '', kind: 'road', nx: w.nx, nz: w.nz });
  });

  return {
    area: spec.area,
    seed: spec.seed,
    w: W,
    h: H,
    map,
    ground,
    props: [...(stamp?.props ?? []), ...furn.props, ...woods.props],
    decor: [...(stamp?.decor ?? []), ...furn.decor],
    chests: out.chests,
    barrels: out.barrels,
    shrines: out.shrines,
    elites: out.elites,
    services: [...(stamp?.services ?? []), ...out.services],
    spawnRooms,
    waypoint: waypoint ?? stamp?.waypoint,
    entrances,
    ports: portWays.map((w) => ({ x: Math.floor(w.x + w.nx * 0.5) + 0.5, z: Math.floor(w.z + w.nz * 0.5) + 0.5 })),
    portTo: spec.ports.map((p) => p.to),
    start: stamp?.start,
    houses: stamp?.houses,
    npcs: stamp?.npcs,
  };
}
