import type { P2, RNG } from '../core/math';
import { D2X_AREAS } from '../data/d2x/areas';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import type { D2xArea, D2xSuperUnique } from '../data/d2x/types';
import { lookedMonsters, monsterDef } from '../data/monsters';
import type { Difficulty } from '../items/d2/types';
import { areaLevel, trialFloor, type AreaDef } from '../world/areas';
import type { Room, SuperUnique } from '../world/levelgen';
import { CHAMPMODS, spawnLevel } from './d2/monstats';
import * as P from './d2/population';
import type { Level } from './level';
import { Monster, type MonsterRank } from './monster';

/**
 * Monster population: what an area is filled with when its map is made, by Diablo II's rules
 * (src/game/d2/population.ts, from levels.txt's mon/nmon/umon, MonDen and MonUMin/MonUMax,
 * superuniques.txt). Level decides when (each area once, as it builds the map) and works out where
 * the hero can walk. placement() turns that into where one area's monsters may stand: on its own
 * tiles, in its rooms, where the hero can walk to. fill() decides what stands there.
 */

/** the box an area's tiles fill on a level's map: first and last column (x) and row (z), inclusive */
export interface AreaBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface SpawnOpts {
  /** the dungeon floor the area is as hard as (Level.floor) */
  floor: number;
  /** the box the area's tiles fill (areaBoxes) */
  box: AreaBox;
  /**
   * per map tile, row by row: ≥ 0 where the hero can walk to (bfsDistances). The caller works it
   * out, so a map of several areas walks it once for all, or area by area from each one's ways in
   */
  reach: ArrayLike<number>;
  /** where the hero comes onto the map */
  from: P2;
}

/** where in one area monsters may stand; made once per area, before anything is spawned in it */
interface Placement {
  /** the layout's spawn rooms whose middle is in the area, nearest the way in first; a trial floor's boss room left out */
  rooms: Room[];
  /** where a trial floor's boss waits, if its room's middle is in the area */
  boss?: P2;
  /** the monster camps in the area */
  camps: P2[];
  /** the named unique packs the layout sets down in the area */
  uniques: SuperUnique[];
  /** the tiles of a room in the area a monster can stand on and the hero walk to */
  walk(room: Room): number;
  /** the area's own such tiles, rooms or not (corridors, a doorstep): its real walkable size */
  area: number;
  /** a spot in the room, in the area and reachable; null if none turns up */
  randomIn(room: Room): P2 | null;
  /** a spot within r of c (either way), in the area and reachable, that a monster fits on; c itself if none turns up */
  near(c: P2, r: number): P2;
  /**
   * the index in `rooms` of the room a spot comes with: the one it is in, else (out of every room, as a
   * camp on open ground) the first one farther from the way in; rooms.length if none is
   */
  roomOf(p: P2): number;
}

/** what an area was filled with, for the tests and tools: its kinds this game and its packs */
export interface SpawnReport {
  /** the kinds it drew (MONSTERREGION_InitializeAll) */
  kinds: string[];
  /** pack rolls made and packs that came of them */
  rolls: number;
  packs: number;
  /** of those, the champion and unique ones, and for each the room it came in and the count it was let in at */
  bossPacks: number;
  bossAt: [room: number, count: number][];
  /** its champions and uniques, D2's dwUniqueCount: a champion pack counts each of its champions */
  count: number;
  /** the superuniques placed */
  superUniques: string[];
  /** the rooms it went through, and the one each superunique came with (Placement.roomOf), before that room's packs */
  rooms: number;
  superUniqueRooms: number[];
}

/** what fill() places its packs with */
interface Spawn {
  level: Level;
  rng: RNG;
  difficulty: Difficulty;
  /** the area's levels.txt columns, or the trial floor's stand-in */
  region: P.Region;
  /** the kinds it draws this game */
  kinds: P.Kind[];
  /** the level a monster of a row spawns at here */
  lvl: (id: string) => number;
  at: Placement;
  /** the area's champions and uniques so far (MonsterRegion dwUniqueCount) */
  count: number;
  report: SpawnReport;
}

const AREAS = new Map(D2X_AREAS.map((a) => [a.id, a]));
const SUPERUNIQUES = new Map(D2X_SUPERUNIQUES.map((s) => [s.key, s]));

/**
 * The trial ground's floors aren't D2's: each plays as the Act 1 maze level (DrlgType 1) nearest its
 * level in normal for MonDen, MonUMin/MonUMax and NumMon, drawing on every Act 1 monster with a look;
 * its champions and uniques are of the kinds it drew (it has no umon), as nightmare's are
 */
function trialRegion(alvl: number): P.Region {
  const mazes = D2X_AREAS.filter((a) => a.drlg === 1 && a.numMon > 0);
  const t = mazes.reduce((best, a) => (Math.abs(a.lvl[0] - alvl) < Math.abs(best.lvl[0] - alvl) ? a : best));
  const pool = lookedMonsters()
    .filter((d) => d.row.spawns && !d.boss && d.row.align === 0)
    .map((d) => d.id);
  return { numMon: t.numMon, mon: pool, nmon: pool, umon: [], den: t.den, packs: t.packs };
}

/** fills one area of a level with its monsters (Level.monsters, and Level.boss when the boss room is in it); what it did */
export function spawnArea(level: Level, area: AreaDef, rng: RNG, opts: SpawnOpts): SpawnReport {
  const report: SpawnReport = { kinds: [], rolls: 0, packs: 0, bossPacks: 0, bossAt: [], count: 0, superUniques: [], rooms: 0, superUniqueRooms: [] };
  const d = level.difficulty;
  const floor = trialFloor(area.id);
  const row: D2xArea | undefined = AREAS.get(area.id);
  if (floor === undefined && !row) return report;
  const alvl = areaLevel(area, d);
  const region: P.Region = row ?? trialRegion(alvl);
  const kinds = P.pickKinds(region, d, rng);
  if (floor !== undefined) region.umon = kinds.map((k) => k.id);
  // a trial floor's monsters are all at its level, whatever the difficulty; an area's by D2's rule
  const lvl = (id: string) => (floor !== undefined ? alvl : spawnLevel(D2X_MONSTERS[id], d, alvl));
  report.kinds = kinds.map((k) => k.id);
  const s: Spawn = { level, rng, difficulty: d, region, kinds, lvl, at: placement(level, area, rng, opts, floor !== undefined), count: 0, report };
  const sus = (row?.superuniques ?? []).map((key) => SUPERUNIQUES.get(key)).filter((su): su is D2xSuperUnique => !!su);
  fill(s, sus);
  if (floor !== undefined && s.at.boss) floorBoss(s, floor, s.at.boss);
  report.count = s.count;
  return report;
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

/** where an area's monsters may stand; a trial floor keeps its boss room for its boss */
function placement(level: Level, area: AreaDef, rng: RNG, opts: SpawnOpts, trial: boolean): Placement {
  const L = level.layout;
  const map = L.map;
  const { reach } = opts;
  const inArea = (p: P2) => level.areaAt(p.x, p.z).id === area.id;
  const reachable = (p: P2) => {
    const i = Math.floor(p.z) * map.w + Math.floor(p.x);
    return map.walkableAt(p.x, p.z) && reach[i] >= 0 && inArea(p);
  };
  // each room's standing tiles and how far in it is from where the hero comes on
  const tiles = new Map<Room, { walk: number; from: number }>();
  const survey = (r: Room) => {
    let walk = 0;
    let from = Infinity;
    for (let z = Math.max(0, r.y); z < Math.min(map.h, r.y + r.h); z++) {
      for (let x = Math.max(0, r.x); x < Math.min(map.w, r.x + r.w); x++) {
        const i = z * map.w + x;
        if (!map.walkable(x, z) || reach[i] < 0 || level.areas[i] !== area.id) continue;
        walk++;
        from = Math.min(from, reach[i]);
      }
    }
    tiles.set(r, { walk, from });
  };
  // D2 populates every room (the Den's far one with Corpsefire too); only a trial floor's boss has its own
  const bossRoom = trial && L.bossRoom && inArea(middle(L.bossRoom)) ? L.bossRoom : undefined;
  const rooms = L.spawnRooms.filter((r) => r !== bossRoom && inArea(middle(r)));
  rooms.forEach(survey);
  let walkable = 0;
  for (let z = opts.box.z0; z <= opts.box.z1; z++) {
    for (let x = opts.box.x0; x <= opts.box.x1; x++) {
      const i = z * map.w + x;
      if (level.areas[i] === area.id && reach[i] >= 0 && map.walkable(x, z)) walkable++;
    }
  }
  // D2 peoples a room as the hero first comes near it (D2GAME_PopulateRoom): nearest the way in first
  rooms.sort((a, b) => tiles.get(a)!.from - tiles.get(b)!.from);
  return {
    rooms,
    // a step south of the room's middle, about where the stairs down are
    boss: bossRoom && { x: bossRoom.x + bossRoom.w / 2, z: bossRoom.y + bossRoom.h / 2 + 1.5 },
    camps: (L.elites ?? []).filter(inArea),
    uniques: (L.superUniques ?? []).filter((u) => inArea(u.pos)),
    walk: (room) => tiles.get(room)?.walk ?? 0,
    area: walkable,
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
        // monsters keep out of a town on the map (Level.monsterMap)
        if (reachable(p) && level.monsterMap.circleClear(p.x, p.z, 0.3)) return p;
      }
      return { ...c };
    },
    roomOf(p) {
      const inside = rooms.findIndex((r) => p.x >= r.x && p.x < r.x + r.w && p.z >= r.y && p.z < r.y + r.h);
      if (inside >= 0) return inside;
      const d = reach[Math.floor(p.z) * map.w + Math.floor(p.x)];
      const next = d >= 0 ? rooms.findIndex((r) => tiles.get(r)!.from > d) : -1;
      return next < 0 ? rooms.length : next;
    },
  };
}

/**
 * D2's population of an area (D2GAME_PopulateRoom, MonsterRegion.cpp:625-737), room by room: a pack
 * roll for every 3×3 subtiles of the room (ROLLS_PER_TILE), a pack on a roll under MonDen. So over
 * D2's area, SizeX × SizeY tiles, it rolls SizeX × SizeY × 25/9 times; ours rolls as many for each of
 * the area's walkable tiles (its real size against D2's), shared out among its rooms by their own,
 * since packs stand in rooms. A pack is a champion or unique one by MONSTERCHOOSE_GetBossSpawnType
 * (bossPack), else a plain group of a kind by rarity.
 * A superunique comes with its room, before the room's packs: D2 spawns a room's preset units, then
 * populates it (GAME_PopulateRoom, Game.cpp:1930-1935; also 1749-1752), and the superunique counts
 * toward MonUMin/MonUMax at once (++dwUniqueCount, MonsterUnique.cpp:2459), so for the rooms after.
 * D2's wandering monsters (levels.txt MonWndr) are Act 1's rogue scouts (MonsterRegion.cpp:858-903),
 * which this game hasn't, so none come.
 */
function fill(s: Spawn, sus: readonly D2xSuperUnique[]) {
  const { rng, at, difficulty: d, region } = s;
  const den = region.den[d];
  const packs = region.packs[d];
  // where each superunique stands and the room it comes with
  const presets = sus.flatMap((su) => {
    const p = superUniqueSpot(s, su);
    return p ? [{ su, p, room: at.roomOf(p) }] : [];
  });
  const inRooms = at.rooms.reduce((n, r) => n + at.walk(r), 0);
  const share = inRooms ? at.area / inRooms : 0;
  s.report.rooms = at.rooms.length;
  for (let i = 0; i <= at.rooms.length; i++) {
    for (const u of presets) if (u.room === i) superUnique(s, u.su, u.p, i);
    const room = at.rooms[i];
    // no MonDen, no population (MonsterRegion.cpp:622); the preset units come all the same
    if (!room || !den) continue;
    const rolls = Math.floor(at.walk(room) * share * P.ROLLS_PER_TILE);
    s.report.rolls += rolls;
    for (let k = 0; k < rolls; k++) {
      if (!P.packRoll(den, rng)) continue;
      const id = P.pickKind(s.kinds, rng, 20);
      // nothing to choose from ends the room (MonsterRegion.cpp:659-662)
      if (!id) break;
      s.report.packs++;
      if (P.bossPack(s.count, packs, i + 1, at.rooms.length, rng)) {
        s.report.bossPacks++;
        s.report.bossAt.push([i, s.count]);
        const boss = P.pickBossKind(region, s.kinds, d, rng);
        const c = boss && at.randomIn(room);
        if (c) bossPack(s, boss, c);
      } else {
        const c = at.randomIn(room);
        if (c) group(s, id, c);
      }
    }
  }
}

/**
 * One monster of row `id` at p, if it has a look, in `pack`: the monsters that spawned together,
 * which notice the hero as one (src/game/ai.ts)
 */
function put(s: Spawn, id: string, rank: MonsterRank, p: P2, pack: Monster[], mods: number[] = [], su?: string): Monster | null {
  const def = monsterDef(id);
  if (!def) return null;
  const m = new Monster(def, s.lvl(id), rank, p, mods, { difficulty: s.difficulty, superUnique: su, roll: (lo, hi) => s.rng.int(lo, hi) });
  m.pack = pack;
  pack.push(m);
  s.level.monsters.push(m);
  if (m.aura) s.level.auras.push(m);
  return m;
}

/**
 * A monster with the party its row brings (MONSTERSPAWN_SpawnMinionParty, MonsterSpawn.cpp:1099-1158),
 * the party led by it when it leads (SetBoss: its minion list). A champion's pack mate spawns with
 * its party (flags 0, MonsterRegion.cpp:680) and is then made a champion, whose
 * MONSTERUNIQUE_SpawnMinions spawns none (MonsterUnique.cpp:2480) but gives that list UMods 1–4 as
 * minions (2548-2558; PromoteToChampion, 2981-3006): a shaman's fallen come with a minion's life,
 * levels and experience
 */
function withParty(s: Spawn, id: string, rank: MonsterRank, p: P2, pack: Monster[], mods: number[] = []): Monster | null {
  const m = put(s, id, rank, p, pack, mods);
  if (!m) return null;
  const leads = !!m.def.row.setBoss;
  for (const mid of P.party(m.def.row, s.rng)) {
    const f = put(s, mid, leads && rank === 'champion' ? 'minion' : 'normal', s.at.near(p, 2.2), pack);
    if (f && leads) f.follow(m);
  }
  return m;
}

/** a plain pack: MinGrp–MaxGrp of the kind, each with its party (MONSTERREGION_SpawnMonsterGroup, MonsterRegion.cpp:740-797) */
function group(s: Spawn, id: string, c: P2) {
  const n = P.groupSize(D2X_MONSTERS[id], s.rng);
  const pack: Monster[] = [];
  for (let i = 0; i < n; i++) withParty(s, id, 'normal', i ? s.at.near(c, 1.6) : c, pack);
}

/**
 * A champion or unique pack (MONSTERUNIQUE_SpawnUniqueGroup, MonsterUnique.cpp:2080-2092): its leader
 * brings no party; a champion (one in five) of a rolled kind with 1–3 more made plain champions, each
 * of those with its party, every one counting toward MonUMax; else a unique, rolled modifiers and
 * name, and 3–6 minions with its passed-on modifiers
 */
function bossPack(s: Spawn, id: string, c: P2) {
  const { rng, difficulty: d } = s;
  const row = D2X_MONSTERS[id];
  if (!monsterDef(id)) return;
  const pack: Monster[] = [];
  if (P.isChampion(rng)) {
    if (!put(s, id, 'champion', c, pack, [P.championType(row, d, rng)])) return;
    s.count++;
    const mates = P.championMates(rng);
    for (let i = 0; i < mates; i++) {
      if (withParty(s, id, 'champion', s.at.near(c, 1.8), pack, [CHAMPMODS])) s.count++;
    }
    return;
  }
  const mods = P.uniqueMods(row, d, rng);
  const boss = put(s, id, 'unique', c, pack, mods);
  if (!boss) return;
  s.count++;
  boss.displayName = P.uniqueName(rng);
  minions(s, boss, P.uniqueMinions(row, rng), mods);
}

/**
 * A unique's minions round it, led by it, with the modifiers it passes on, each kept near it
 * (MONSTERUNIQUE_SpawnMinions, MonsterUnique.cpp:2475-2543: AIUTIL_SetOwnerGUIDAndType, the leash's owner)
 */
function minions(s: Spawn, boss: Monster, m: { id: string; n: number }, mods: number[]) {
  const pass = P.xferMods(mods);
  for (let i = 0; i < m.n; i++) {
    const mm = put(s, m.id, 'minion', s.at.near(boss.pos, 2), boss.pack ?? [], pass);
    if (!mm) continue;
    mm.follow(boss);
    mm.leashTo = boss;
  }
}

/**
 * Where a superunique stands, as the data puts it (D2GAME_SpawnSuperUnique_6FC6F690, MonsterUnique.cpp:2636-2823):
 * on the layout's spot for it (the Den's far room), else by the area's monster camp (Bishibosh's
 * fallen camp in Cold Plains), else in the room farthest in
 */
function superUniqueSpot(s: Spawn, su: D2xSuperUnique): P2 | null {
  const last = s.at.rooms[s.at.rooms.length - 1];
  const spot = s.at.uniques.find((u) => u.key === su.key)?.pos ?? s.at.camps[0] ?? (last && s.at.randomIn(last));
  return spot ? s.at.near(spot, 0.5) : null;
}

/** a superunique at p, with room `room`: its own modifiers and a random one per difficulty above normal, its table's minions */
function superUnique(s: Spawn, su: D2xSuperUnique, p: P2, room: number) {
  const row = D2X_MONSTERS[su.mon];
  if (!row) return;
  const mods = P.superUniqueMods(su, row, s.difficulty, s.rng);
  const boss = put(s, su.mon, 'unique', p, [], mods, su.key);
  if (!boss) return;
  s.count++;
  s.report.superUniques.push(su.key);
  s.report.superUniqueRooms.push(room);
  boss.displayName = su.name;
  minions(s, boss, P.uniqueMinions(row, s.rng, su, s.difficulty), mods);
}

/**
 * A trial floor's boss, every fourth floor, Act 1's in turn as they come in the act: the Smith (his
 * superunique), Blood Raven with her party of zombies, Andariel
 */
function floorBoss(s: Spawn, floor: number, c: P2) {
  const cycle = Math.floor(floor / 4) % 3;
  const id = ['andariel', 'smith', 'bloodraven'][cycle];
  let boss: Monster | null;
  if (id === 'smith') {
    const su = SUPERUNIQUES.get('The Smith')!;
    boss = put(s, id, 'unique', s.at.near(c, 0.5), [], P.superUniqueMods(su, D2X_MONSTERS[id], s.difficulty, s.rng), su.key);
    if (boss) boss.displayName = su.name;
  } else boss = withParty(s, id, 'boss', s.at.near(c, 0.5), []);
  if (boss) s.level.boss = boss;
}

function middle(r: Room): P2 {
  return { x: r.x + r.w / 2, z: r.y + r.h / 2 };
}
