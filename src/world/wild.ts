import { RNG, type P2 } from '../core/math';
import { Furnisher } from './furnish';
import { THEMES, type Exit, type Layout, type Room } from './levelgen';
import { BIG_ROCKS, TREES, clamp01, fbm, growWoods, pickWeighted, valueNoise } from './outdoors';
import { TileMap, T_FLOOR, T_WALL } from './tilemap';

/**
 * The wilderness outside the camp (Diablo II's Blood Moor): open ground under the sky instead of
 * rooms and corridors. A winding road runs from a path into the woods at the west edge (back to the
 * camp) to the crypt at the east; woods close the land in. Sights stand off the road, each in a
 * clearing with a footpath to it. Which sights a map has is the scene's to say: this one has no
 * rivers or cliffs across the way, they break up the pace.
 */

/** woods between the walkable land and the edge of the map: deep enough that the view never runs off it */
const BAND = 22;
/** the land the woods close in */
const CW = 104;
const CH = 64;
const W = CW + BAND * 2;
const H = CH + BAND * 2;

type SightKind = 'graveyard' | 'ruins' | 'camp' | 'shrine';

/** how far each sight's clearing reaches */
const SIGHT_R: Record<SightKind, number> = { graveyard: 6.5, ruins: 6, camp: 7, shrine: 3.5 };

/** the sights along the road, the first three in the first half of the way */
const SIGHTS_EARLY: SightKind[] = ['shrine', 'ruins', 'graveyard'];
const SIGHTS_LATE: SightKind[] = ['camp', 'ruins', 'shrine'];

const ROCKS = ['x_rock_single_A', 'x_rock_single_B', 'x_rock_single_D'];
const GRAVES = ['h_grave_A', 'h_grave_B', 'h_gravestone', 'h_gravemarker_A', 'h_gravemarker_B', 'h_grave_A_destroyed'];

/** points along a Catmull-Rom curve through `pts`, about `step` apart */
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

/** lower each tile's distance to the line through `pts`, out to `reach` */
function stampDistance(field: Float32Array, pts: P2[], reach: number) {
  for (const p of pts) {
    const x0 = Math.max(0, Math.floor(p.x - reach));
    const x1 = Math.min(W - 1, Math.ceil(p.x + reach));
    const z0 = Math.max(0, Math.floor(p.z - reach));
    const z1 = Math.min(H - 1, Math.ceil(p.z + reach));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
        const i = z * W + x;
        if (d < field[i]) field[i] = d;
      }
    }
  }
}

export function generateWild(seed: number): Layout {
  const rng = new RNG(seed);
  const theme = THEMES.wild;
  const map = new TileMap(W, H);
  const edgeNoise = valueNoise(rng);
  const groveNoise = valueNoise(rng);
  const rockNoise = valueNoise(rng);
  const soilNoise = valueNoise(rng);

  // ── the road: in from the woods at the west, wandering north and south, to the crypt at the east ──
  const zMid = BAND + CH / 2;
  const ctrl: P2[] = [{ x: 0, z: zMid + rng.range(-10, 10) }];
  ctrl.push({ x: BAND + 3, z: ctrl[0].z + rng.range(-3, 3) });
  const legs = 5;
  for (let i = 1; i < legs; i++) {
    const prev = ctrl[ctrl.length - 1];
    ctrl.push({ x: BAND + 3 + ((CW - 18) * i) / legs, z: Math.max(BAND + 10, Math.min(BAND + CH - 10, prev.z + rng.range(-15, 15))) });
  }
  const crypt = { x: Math.floor(BAND + CW - 13) + 0.5, z: Math.floor(Math.max(BAND + 14, Math.min(BAND + CH - 12, ctrl[ctrl.length - 1].z + rng.range(-8, 8)))) + 0.5 };
  ctrl.push(crypt);
  const road = spline(ctrl, 0.4);
  const roadDist = new Float32Array(W * H).fill(99);
  stampDistance(roadDist, road, 5);
  // where the road is as it crosses x
  const roadZ = (x: number) => road.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best)).z;

  // ── sights: along the road at even spacing, off to alternate sides ──
  const along: number[] = [0];
  for (let i = 1; i < road.length; i++) along.push(along[i - 1] + Math.hypot(road[i].x - road[i - 1].x, road[i].z - road[i - 1].z));
  const total = along[along.length - 1];
  const atLength = (l: number) => {
    let i = along.findIndex((a) => a >= l);
    if (i <= 0) i = 1;
    const a = road[i - 1];
    const b = road[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { p: a, nx: -(b.z - a.z) / len, nz: (b.x - a.x) / len };
  };
  const shuffled = (list: SightKind[]) => {
    const l = [...list];
    for (let i = l.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  };
  const kinds = [...shuffled(SIGHTS_EARLY), ...shuffled(SIGHTS_LATE)];
  const sights: { kind: SightKind; c: P2; r: number; from: P2 }[] = [];
  const toRoad = (c: P2) => road.reduce((m, p) => Math.min(m, Math.hypot(p.x - c.x, p.z - c.z)), Infinity);
  let side = rng.chance(0.5) ? 1 : -1;
  kinds.forEach((kind, i) => {
    const r = SIGHT_R[kind];
    const at = 0.16 + (0.68 * i) / (kinds.length - 1);
    // each where it is due, off to its side; failing that, a little earlier or later, or across the road
    for (let t = 0; t < 40; t++) {
      const spread = t < 20 ? 0.07 : 0.14;
      const { p, nx, nz } = atLength(total * Math.min(0.9, Math.max(0.1, t === 0 ? at : at + rng.range(-spread, spread))));
      const s = t % 2 === 0 ? side : -side;
      // a shrine stands by the road; the rest a little way off it
      const off = kind === 'shrine' ? r + rng.range(1.5, 3) : r + rng.range(3, 9);
      const c = { x: Math.floor(p.x + nx * off * s) + 0.5, z: Math.floor(p.z + nz * off * s) + 0.5 };
      const inside = c.x - r > BAND + 2 && c.x + r < BAND + CW - 2 && c.z - r > BAND + 2 && c.z + r < BAND + CH - 2;
      const clear = sights.every((o) => Math.hypot(o.c.x - c.x, o.c.z - c.z) > o.r + r + 3) && Math.hypot(crypt.x - c.x, crypt.z - c.z) > r + 12;
      if (inside && clear && toRoad(c) > r + (kind === 'shrine' ? 0.5 : 1.5)) {
        sights.push({ kind, c, r, from: p });
        break;
      }
    }
    side = -side;
  });
  // footpaths from the road to each sight
  const pathDist = new Float32Array(W * H).fill(99);
  for (const s of sights) {
    if (s.kind === 'shrine') continue;
    const n = Math.ceil(Math.hypot(s.c.x - s.from.x, s.c.z - s.from.z) / 0.4);
    const pts: P2[] = [];
    const bend = rng.range(-1.5, 1.5);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const w = Math.sin(t * Math.PI) * bend;
      const dx = s.c.x - s.from.x;
      const dz = s.c.z - s.from.z;
      const len = Math.hypot(dx, dz) || 1;
      pts.push({ x: s.from.x + dx * t - (dz / len) * w, z: s.from.z + dz * t + (dx / len) * w });
    }
    stampDistance(pathDist, pts, 3);
  }

  // ── the land: a noisy-edged block inside the woods, the road cut through to the west edge ──
  const exitX = BAND - 5;
  const start = { x: BAND + 2.5, z: Math.floor(roadZ(BAND + 2.5)) + 0.5 };
  const sightAt = (x: number, z: number) => sights.find((s) => Math.hypot(x + 0.5 - s.c.x, z + 0.5 - s.c.z) < s.r);
  const land = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const e = Math.min(x - BAND, BAND + CW - 1 - x, z - BAND, BAND + CH - 1 - z);
      const i = z * W + x;
      const inLand = e + fbm(edgeNoise, x / 14, z / 14) * 8 > 0;
      const onRoad = roadDist[i] < 1.8 && x >= exitX - 1;
      if (inLand || onRoad || pathDist[i] < 1.3 || sightAt(x, z) || Math.hypot(x + 0.5 - crypt.x, z + 0.5 - crypt.z) < 9) {
        land[i] = 1;
        map.tiles[i] = T_FLOOR;
      }
    }
  }

  // ── ruins: low broken stone walls, a door where the footpath comes in ──
  for (const s of sights) {
    if (s.kind !== 'ruins') continue;
    const rx = Math.floor(s.c.x) - 4;
    const rz = Math.floor(s.c.z) - 3;
    for (let z = rz; z <= rz + 6; z++) {
      for (let x = rx; x <= rx + 8; x++) {
        const edge = x === rx || x === rx + 8 || z === rz || z === rz + 6;
        const i = z * W + x;
        if (!edge || pathDist[i] < 1.6 || rng.chance(0.3)) continue;
        map.tiles[i] = T_WALL;
      }
    }
    // a second way in, opposite the first
    const back = { x: s.c.x * 2 - s.from.x, z: s.c.z * 2 - s.from.z };
    for (let z = rz; z <= rz + 6; z++) {
      for (let x = rx; x <= rx + 8; x++) {
        if (Math.hypot(x + 0.5 - (s.c.x + (back.x - s.c.x) * 0.45), z + 0.5 - (s.c.z + (back.z - s.c.z) * 0.45)) < 1.8 && map.tiles[z * W + x] === T_WALL) map.tiles[z * W + x] = T_FLOOR;
      }
    }
  }

  // ── what stands on the land: sights, groves and rocks, everything still reachable ──
  const furn = new Furnisher(map, rng, start, [start, crypt]);
  const chests: P2[] = [];
  const barrels: P2[] = [];
  const shrines: P2[] = [];
  const elites: P2[] = [];
  const rooms: Room[] = [];
  let campfire: P2 | undefined;
  for (const s of sights) furn.reserveAround(s.c, 1);
  const tile = (p: P2) => ({ x: Math.floor(p.x), z: Math.floor(p.z) });

  for (const s of sights) {
    const c = tile(s.c);
    switch (s.kind) {
      case 'graveyard': {
        // fenced on the far sides (north and west), so the fence never hides the graves from the camera
        const gx = c.x - 4;
        const gz = c.z - 3;
        furn.place('h_fence_pillar', gx, gz, 0);
        for (let x = gx + 1; x <= gx + 7; x += 2) furn.place(rng.chance(0.25) ? 'h_fence_broken' : 'h_fence', x, gz, 0);
        for (let z = gz + 1; z <= gz + 5; z += 2) if (rng.chance(0.8)) furn.place(rng.chance(0.25) ? 'h_fence_broken' : 'h_fence', gx, z, 1);
        for (let z = gz + 2; z <= gz + 6; z += 2) for (let x = gx + 2; x <= gx + 8; x += 2) if (rng.chance(0.7)) furn.place(rng.pick(GRAVES), x, z, 0);
        furn.place(rng.chance(0.5) ? 'h_tree_dead_large' : 'h_tree_dead_medium', gx + 9, gz, rng.int(0, 3));
        for (let k = 0; k < 3; k++) furn.scatter(rng.chance(0.5) ? 'h_skull_candle' : 'h_candle_melted', gx + rng.range(2, 8), gz + rng.range(2, 6));
        if (rng.chance(0.6)) chests.push({ x: gx + 5.5, z: gz + 1.5 });
        rooms.push({ x: gx, y: gz, w: 9, h: 7 });
        break;
      }
      case 'ruins': {
        const rx = c.x - 4;
        const rz = c.z - 3;
        // pillars at the inner corners, some fallen
        for (const [x, z] of [[rx + 1, rz + 1], [rx + 7, rz + 1], [rx + 1, rz + 5], [rx + 7, rz + 5]]) {
          if (rng.chance(0.65)) furn.place(rng.chance(0.5) ? 'h_pillar' : 'd_pillar', x, z, 0);
          else furn.place(rng.chance(0.5) ? 'd_rubble_half' : 'd_rubble_large', x, z, rng.int(0, 1));
        }
        for (let k = 0; k < 4; k++) furn.placeDecor(rng.chance(0.6) ? 'rubble' : 'bones', rx + rng.int(2, 6), rz + rng.int(2, 4), false, rng.range(0.8, 1.2));
        chests.push({ x: rx + 4.5, z: rz + 1.5 });
        for (let k = 0; k < 2; k++) {
          const p = { x: rx + rng.range(-1, 9), z: rz + rng.range(7.2, 8.2) };
          if (map.walkableAt(p.x, p.z)) barrels.push(p);
        }
        rooms.push({ x: rx + 1, y: rz + 1, w: 7, h: 5 });
        break;
      }
      case 'camp': {
        // a fire, tents round it facing in, a banner, a cage; an elite pack sits by the fire
        campfire = { x: c.x + 0.5, z: c.z + 0.5 };
        furn.placeDecor('campfire', c.x, c.z, true);
        const chest = { x: c.x + 0.5 + rng.pick([-2.5, 2.5]), z: c.z - 1.5 };
        furn.reserveAround(chest, 0);
        chests.push(chest);
        const a0 = rng.range(0, Math.PI * 2);
        const tents = rng.int(2, 3);
        for (let k = 0; k < tents; k++) {
          const a = a0 + (k / tents) * Math.PI * 2;
          furn.place('p_tent', Math.round(c.x + Math.sin(a) * 4 - 0.5), Math.round(c.z + Math.cos(a) * 4 - 0.5), rng.int(0, 3), 0.4);
        }
        const free = () => ({ x: c.x + rng.int(-5, 5), z: c.z + rng.int(-5, 5) });
        for (const model of ['p_banner', 'p_cage', 'p_skullpile', 'p_skullpile']) {
          for (let t = 0; t < 8; t++) {
            const p = free();
            if (Math.hypot(p.x - c.x, p.z - c.z) > 2 && furn.place(model, p.x, p.z, rng.int(0, 3), 0.6)) break;
          }
        }
        for (let k = 0; k < 3; k++) furn.placeDecor('bones', c.x + rng.int(-4, 4), c.z + rng.int(-4, 4), false);
        for (let k = 0; k < 3; k++) {
          const p = { x: c.x + rng.range(-5, 5), z: c.z + rng.range(-5, 5) };
          if (Math.hypot(p.x - c.x, p.z - c.z) > 2.5 && map.walkableAt(p.x, p.z)) barrels.push(p);
        }
        elites.push({ x: c.x + 0.5, z: c.z + 2 });
        break;
      }
      case 'shrine': {
        shrines.push({ x: c.x + 0.5, z: c.z + 0.5 });
        furn.reserveAround(s.c, 1);
        for (const [dx, dz] of [[-2, -1], [2, -1]]) furn.place('h_lantern_standing', c.x + dx, c.z + dz, 0);
        break;
      }
    }
  }

  // the crypt at the end of the road: the mausoleum behind the way down, graves about it
  const ct = tile(crypt);
  furn.place('h_crypt', ct.x - 1, ct.z - 7, 0);
  for (const [dx, dz] of [[-4, -2], [3, -2], [-5, 1], [4, 1], [-3, 3], [5, -4], [-5, -4]]) if (rng.chance(0.75)) furn.place(rng.pick(GRAVES), ct.x + dx, ct.z + dz, 0);
  furn.place('h_tree_dead_large', ct.x + 4, ct.z - 6, rng.int(0, 3));
  furn.place('h_post_lantern', ct.x - 3, ct.z + 1, 0);
  furn.place('h_post_lantern', ct.x + 3, ct.z + 1, 0);
  rooms.push({ x: ct.x - 6, y: ct.z - 3, w: 12, h: 8 });

  // groves and rock outcrops, off the road, the paths and the clearings
  const keep = (x: number, z: number) => {
    const i = z * W + x;
    if (roadDist[i] < 3.4 || pathDist[i] < 2) return true;
    if (sights.some((s) => Math.hypot(x + 0.5 - s.c.x, z + 0.5 - s.c.z) < s.r + 1.5)) return true;
    return Math.hypot(x + 0.5 - start.x, z + 0.5 - start.z) < 8 || Math.hypot(x + 0.5 - crypt.x, z + 0.5 - crypt.z) < 10;
  };
  const rockTiles: P2[] = [];
  for (let z = BAND - 8; z < BAND + CH + 8; z++) {
    for (let x = BAND - 8; x < BAND + CW + 8; x++) {
      if (!land[z * W + x] || keep(x, z)) continue;
      const g = fbm(groveNoise, x / 9, z / 9);
      const r = fbm(rockNoise, x / 7, z / 7);
      if (g > 0.3 && rng.chance(0.45)) furn.place(pickWeighted(rng, TREES), x, z, rng.int(0, 3), 0.8);
      else if (r > 0.5 && rng.chance(0.2)) {
        const big = rng.chance(0.3);
        if (furn.place(rng.pick(big ? BIG_ROCKS : ROCKS), x, z, rng.int(0, 3), 1)) rockTiles.push({ x: x + (big ? 1 : 0.5), z: z + (big ? 1 : 0.5) });
      }
    }
  }

  // places for monster packs: spread over the open land, none near the way in
  const reachable = (p: P2) => map.walkableAt(p.x, p.z);
  const spots: P2[] = [];
  for (let k = 0; k < 400 && spots.length < 14; k++) {
    const p = { x: rng.range(BAND + 3, BAND + CW - 3), z: rng.range(BAND + 3, BAND + CH - 3) };
    if (!reachable(p) || Math.hypot(p.x - start.x, p.z - start.z) < 20) continue;
    if (spots.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 10) || sights.some((s) => Math.hypot(s.c.x - p.x, s.c.z - p.z) < s.r + 3)) continue;
    spots.push(p);
    rooms.push({ x: Math.floor(p.x) - 3, y: Math.floor(p.z) - 3, w: 6, h: 6 });
  }

  // ── the woods: thick by the land, thinner further in, never on the road ──
  const woods = growWoods(rng, { x0: 0, z0: 0, x1: W, z1: H }, (x, z) => land[z * W + x] === 1, (x, z) => roadDist[z * W + x] < 2.6);
  const props = [...furn.props, ...woods.props];

  // ── the ground: road on the road, trampled earth in the clearings and under the trees, grass elsewhere ──
  const ground = new Uint8Array(W * H * 4);
  const stone = new Float32Array(W * H);
  for (const r of rockTiles) {
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
      const roadW = Math.max(clamp01((2.0 - roadDist[i]) / 0.7), clamp01((1.3 - pathDist[i]) / 0.6) * 0.85);
      let dirt = clamp01(0.3 - fbm(soilNoise, x / 11, z / 11) * 1.3) * 0.75;
      let st = stone[i];
      const s = sightAt(x, z);
      if (s) {
        const k = 1 - Math.hypot(x + 0.5 - s.c.x, z + 0.5 - s.c.z) / s.r;
        if (s.kind === 'ruins') st = Math.max(st, clamp01(k * 2.2) * 0.85);
        else dirt = Math.max(dirt, clamp01(k * 1.8) * 0.8);
      }
      if (map.tiles[i] === T_WALL) st = 1;
      const dc = Math.hypot(x + 0.5 - crypt.x, z + 0.5 - crypt.z);
      if (dc < 8) st = Math.max(st, clamp01((8 - dc) / 4) * 0.6);
      if (!land[i]) dirt = Math.max(dirt, 0.5 + Math.min(0.3, woods.fromLand(x, z) * 0.05));
      const rest = 1 - roadW;
      ground[i * 4] = Math.round((1 - st) * (1 - dirt) * rest * 255);
      ground[i * 4 + 1] = Math.round(dirt * (1 - st) * rest * 255);
      ground[i * 4 + 2] = Math.round(roadW * 255);
      ground[i * 4 + 3] = Math.round(st * rest * 255);
    }
  }

  const exits: Exit[] = [{ x: exitX + 0.5, z: Math.floor(roadZ(exitX)) + 0.5, dest: 0, name: THEMES.town.name, nx: 1, nz: 0 }];
  return {
    map, theme, start, stairs: crypt, rooms: [], spawnRooms: rooms, torches: [], decor: furn.decor, chests, barrels,
    pillars: new Set(), campfire, exits, ground, shrines, elites, props, wallDecor: [],
  };
}
