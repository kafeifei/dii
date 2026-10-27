import type { P2, RNG } from '../core/math';
import { ALL_MODS, MONSTERS, UNIQUE_FIRST, UNIQUE_SECOND, bossForDepth, type MonsterDef, type MonsterMod } from '../data/monsters';
import { areaLevel, type AreaDef } from '../world/areas';
import type { Room } from '../world/levelgen';
import type { Level } from './level';
import { Monster, type MonsterRank } from './monster';

/**
 * Monster population: what an area is filled with when its map is made. Level decides when (each
 * area once, as it builds the map) and works out where the hero can walk. placement() turns that
 * into where one area's monsters may stand: on its own tiles, where the hero can walk to. fill()
 * decides what stands there: the pool the monsters come from, the packs, the champions and uniques
 * leading some of them, the wanderers, the monster camps' elites and the boss with its guards.
 * Diablo II's tables (levels.txt's mon/nmon/umon and MonDen, superuniques) will replace fill().
 */

/** the box an area's tiles fill on a level's map: first and last column (x) and row (z), inclusive */
export interface AreaBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface SpawnOpts {
  /** the dungeon floor the area is as hard as (Level.floor): which monsters come, and how many lead packs */
  floor: number;
  /** the box the area's tiles fill (areaBoxes) */
  box: AreaBox;
  /**
   * per map tile, row by row: ≥ 0 where the hero can walk to (bfsDistances). The caller works it
   * out, so a map of several areas walks it once for all, or area by area from each one's ways in
   */
  reach: ArrayLike<number>;
  /** where the hero comes onto the map: no wanderers close by */
  from: P2;
}

/** where in one area monsters may stand; made once per area, before anything is spawned in it */
interface Placement {
  /** the layout's spawn rooms whose middle is in the area, but the boss room */
  rooms: Room[];
  /** where the boss waits, if its room's middle is in the area */
  boss?: P2;
  /** the monster camps in the area */
  camps: P2[];
  /** a spot in the room, in the area and reachable; null if none turns up */
  randomIn(room: Room): P2 | null;
  /** a spot within r of c (either way), in the area and reachable, that a monster fits on; c itself if none turns up */
  near(c: P2, r: number): P2;
  /** one try at a tile's middle anywhere in the area (often a corridor): null unless it is reachable and not close to where the hero comes on */
  anywhere(): P2 | null;
}

/** what fill() places its packs with */
interface Spawn {
  level: Level;
  rng: RNG;
  floor: number;
  /** the area's monster level */
  mlvl: number;
  at: Placement;
}

/** fills one area of a level with its monsters (Level.monsters, and Level.boss when the boss room is in it) */
export function spawnArea(level: Level, area: AreaDef, rng: RNG, opts: SpawnOpts) {
  fill({ level, rng, floor: opts.floor, mlvl: areaLevel(area), at: placement(level, area, rng, opts) });
}

/** the box each area's tiles fill on a level's map, in one pass over it, by area id (in the order the rows come to them) */
export function areaBoxes(level: Level): Map<number, AreaBox> {
  const { w, h } = level.map;
  const boxes = new Map<number, AreaBox>();
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const id = level.areas[z * w + x];
      const b = boxes.get(id);
      if (!b) {
        boxes.set(id, { x0: x, z0: z, x1: x, z1: z });
        continue;
      }
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.z1 = z;
    }
  }
  return boxes;
}

function placement(level: Level, area: AreaDef, rng: RNG, opts: SpawnOpts): Placement {
  const L = level.layout;
  const map = L.map;
  const { box, reach, from } = opts;
  const inArea = (p: P2) => level.areaAt(p.x, p.z).id === area.id;
  const reachable = (p: P2) => {
    const i = Math.floor(p.z) * map.w + Math.floor(p.x);
    return map.walkableAt(p.x, p.z) && reach[i] >= 0 && inArea(p);
  };
  const bossRoom = L.bossRoom && inArea(middle(L.bossRoom)) ? L.bossRoom : undefined;
  return {
    rooms: L.spawnRooms.filter((r) => r !== L.bossRoom && inArea(middle(r))),
    // a step south of the room's middle, about where the stairs down are
    boss: bossRoom && { x: bossRoom.x + bossRoom.w / 2, z: bossRoom.y + bossRoom.h / 2 + 1.5 },
    camps: (L.elites ?? []).filter(inArea),
    randomIn(room) {
      for (let k = 0; k < 20; k++) {
        const p = { x: rng.range(room.x + 0.6, room.x + room.w - 0.6), z: rng.range(room.y + 0.6, room.y + room.h - 0.6) };
        if (reachable(p)) return p;
      }
      return null;
    },
    near(c, r) {
      for (let k = 0; k < 12; k++) {
        const p = { x: c.x + rng.range(-r, r), z: c.z + rng.range(-r, r) };
        if (reachable(p) && map.circleClear(p.x, p.z, 0.3)) return p;
      }
      return { ...c };
    },
    anywhere() {
      const p = { x: rng.int(box.x0 + 1, box.x1 - 1) + 0.5, z: rng.int(box.z0 + 1, box.z1 - 1) + 0.5 };
      return reachable(p) && Math.hypot(p.x - from.x, p.z - from.z) >= 12 ? p : null;
    },
  };
}

/** what an area is filled with; it only asks s.at where things go */
function fill(s: Spawn) {
  const { level, rng, floor: f, mlvl, at } = s;
  const pool = monsterPool(f);
  const rooms = at.rooms;
  // early floors are gentler: one unique pack and no champions on floor 1
  const uniqueCount = f <= 1 ? 1 : 1 + (rng.chance(0.5) ? 1 : 0);
  const championCount = f <= 1 ? 0 : f <= 3 ? rng.int(1, 2) : rng.int(1, 3);
  const order = rooms.map((_, i) => i);
  // shuffle deterministic
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((ri, idx) => {
    const room = rooms[ri];
    const packs = room.w * room.h > 90 ? 2 : 1;
    for (let p = 0; p < packs; p++) {
      const c = at.randomIn(room);
      if (!c) continue;
      const def = pickDef(pool, rng);
      const kind: MonsterRank = idx < uniqueCount && p === 0 ? 'unique' : idx < uniqueCount + championCount && p === 0 ? 'champion' : 'normal';
      spawnPack(s, def, kind, c);
    }
  });
  // extra wanderers in corridors
  const extra = 4 + f;
  for (let k = 0; k < extra; k++) {
    const p = at.anywhere();
    if (p) spawnPack(s, pickDef(pool, rng), 'normal', p, 2);
  }
  // the wilderness's monster camps: an elite pack by each fire
  for (const c of at.camps) {
    const melee = pool.filter((d) => d.ai === 'melee');
    spawnPack(s, rng.pick(melee.length ? melee : pool), 'champion', at.near(c, 1));
  }
  // boss
  if (at.boss) {
    const c = at.boss;
    const boss = new Monster(bossForDepth(f), mlvl + 3, 'boss', at.near(c, 0.5));
    level.boss = boss;
    level.monsters.push(boss);
    // retinue: melee bodyguards (a ranged escort stacked on a caster boss is a wall of missiles)
    const guards = pool.filter((d) => d.ai === 'melee');
    const ret = guards.length ? rng.pick(guards) : MONSTERS.skeleton;
    for (let i = 0; i < 3; i++) level.monsters.push(new Monster(ret, mlvl, 'normal', at.near(c, 3)));
  }
}

/** the monsters an area as hard as dungeon floor f draws its packs from (escorts and bosses have weight 0: they come otherwise) */
function monsterPool(f: number): MonsterDef[] {
  return Object.values(MONSTERS).filter((m) => m.weight > 0 && f >= m.minDepth && f <= m.maxDepth);
}

/** one of the pool, by weight */
function pickDef(pool: MonsterDef[], rng: RNG): MonsterDef {
  let total = 0;
  for (const m of pool) total += m.weight;
  let r = rng.next() * total;
  for (const m of pool) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return pool[0];
}

/** a pack around c: champions, a unique with its minions, or a normal pack with its escort */
function spawnPack(s: Spawn, def: MonsterDef, rank: MonsterRank, c: P2, maxCount?: number) {
  const { rng, mlvl } = s;
  const near = s.at.near;
  const monsters = s.level.monsters;
  let count = rng.int(def.pack[0], def.pack[1]);
  if (maxCount) count = Math.min(count, maxCount);
  if (rank === 'champion') {
    const mods: MonsterMod[] = rng.chance(0.5) ? [rng.pick(ALL_MODS)] : [];
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const m = new Monster(def, mlvl + 2, 'champion', near(c, 1.8), mods);
      m.displayName = `${def.name}（精英）`;
      monsters.push(m);
    }
    return;
  }
  if (rank === 'unique') {
    const mods: MonsterMod[] = [];
    const nm = rng.int(1, Math.min(3, 1 + Math.floor(s.floor / 4)));
    while (mods.length < nm) {
      const m = rng.pick(ALL_MODS);
      if (!mods.includes(m)) mods.push(m);
    }
    const boss = new Monster(def, mlvl + 2, 'unique', c, mods);
    boss.displayName = rng.pick(UNIQUE_FIRST) + rng.pick(UNIQUE_SECOND);
    monsters.push(boss);
    const minions = rng.int(3, 5);
    const minionMods = mods.filter((m) => m === 'fireench' || m === 'coldench' || m === 'lightench');
    for (let i = 0; i < minions; i++) {
      const mm = new Monster(def, mlvl + 1, 'minion', near(c, 2), minionMods);
      mm.leader = boss;
      monsters.push(mm);
    }
    return;
  }
  for (let i = 0; i < count; i++) monsters.push(new Monster(def, mlvl, 'normal', near(c, 1.6)));
  if (def.escort) {
    const n = rng.int(def.escort.count[0], def.escort.count[1]);
    const ed = MONSTERS[def.escort.id];
    if (ed && s.floor >= ed.minDepth) for (let i = 0; i < n; i++) monsters.push(new Monster(ed, mlvl, 'normal', near(c, 2.2)));
  }
}

function middle(r: Room): P2 {
  return { x: r.x + r.w / 2, z: r.y + r.h / 2 };
}
