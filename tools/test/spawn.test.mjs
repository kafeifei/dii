// Monster population (src/game/spawn.ts). Level fills its map's areas as it builds it, none in the
// camp; the same seed fills them the same. Then spawnArea on its own, on a trial floor cut in two
// areas for the test (the boss room wholly on one side): each call places monsters only on its own
// area's tiles, at the floor's level (D2's champion +2, a berserk one, unique and minion +3 on
// top), and the boss only in the area with its room, one of Act 1's bosses. Last, Level on that cut floor: each area
// spawns from an rng of its own, so the east gets the same monsters whether the west gets any.
// What spawns, D2's rules, is tools/test/d2-population.test.mjs.
const SEEDS = [1, 7, 0x5eed, 20261026];
/** how far above the floor's level each rank stands: D2's leveladd +3, a champion's one back (MonsterUnique.cpp:268-298) */
const RANK_LVL = { normal: 0, minion: 3, champion: 2, unique: 3, boss: 0 };
/** a berserk champion (MonUMod 39) gets no UMod16, so not its level back (MonsterUnique.cpp:413-434) */
const rankLvl = (m) => (m.rank === 'champion' && m.mods.includes(39) ? 3 : RANK_LVL[m.rank]);
/** a trial floor's boss by floor, Act 1's in turn: the Smith (his superunique), Blood Raven, Andariel */
const BOSS = { 4: 'smith', 8: 'bloodraven', 12: 'andariel' };

/** every monster in order: what, rank, level, where, mods, name and leader (its index) */
const listing = (ms) => ms.map((m) => `${m.def.id} ${m.rank} ${m.level} ${m.pos.x.toFixed(4)},${m.pos.z.toFixed(4)} ${m.mods.join('+')} ${m.displayName} ${m.leader ? ms.indexOf(m.leader) : '-'}`).join('\n');

export default async (load) => {
  const { Level } = await load('/src/game/level.ts');
  const { areaBoxes, spawnArea } = await load('/src/game/spawn.ts');
  const { RNG } = await load('/src/core/math.ts');
  const { CAMP_AREA, areaDef, areaForDepth, areaLevel, dungeonArea } = await load('/src/world/areas.ts');
  const { WILD_MAPS, bfsDistances } = await load('/src/world/levelgen.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const tileArea = (level, p) => level.areas[Math.floor(p.z) * level.map.w + Math.floor(p.x)];

  // ── Level: once per area at build time, none in the camp, the same seed the same monsters ──
  for (const seed of SEEDS) {
    const camp = new Level(0, seed);
    check(!camp.monsters.length && !camp.boss, `the camp (seed ${seed}) has ${camp.monsters.length} monsters`);
    for (const depth of [WILD_MAPS + 1, WILD_MAPS + 4]) {
      const a = new Level(depth, seed);
      const b = new Level(depth, seed);
      check(a.monsters.length > 0 && listing(a.monsters) === listing(b.monsters), `depth ${depth}, seed ${seed}: ${a.monsters.length} monsters, built twice they differ`);
    }
  }

  // ── spawnArea: one area of two ──
  const depth = WILD_MAPS + 4;
  const west = areaForDepth(depth);
  // a deeper floor's area, so its monsters' levels tell the two apart
  const east = areaDef(dungeonArea(8));
  /** floor 4 from the seed, east of a cut made the deeper area: down the middle, or along the boss room's nearer side if it is in the way */
  const cutFloor = (seed) => {
    const level = new Level(depth, seed);
    const { map, bossRoom } = level.layout;
    if (!bossRoom) throw new Error(`floor 4 (seed ${seed}) has no boss room`);
    const mid = Math.floor(map.w / 2);
    let cut = mid;
    if (bossRoom.x < mid && mid < bossRoom.x + bossRoom.w) cut = mid - bossRoom.x < bossRoom.x + bossRoom.w - mid ? bossRoom.x : bossRoom.x + bossRoom.w;
    for (let z = 0; z < map.h; z++) for (let x = cut; x < map.w; x++) level.areas[z * map.w + x] = east.id;
    level.monsters = [];
    level.boss = null;
    return { level, cut, bossIn: bossRoom.x >= cut ? east : west };
  };
  const counts = [];
  let elites = 0;
  for (const seed of SEEDS) {
    const { level, cut, bossIn } = cutFloor(seed);
    const { map, start } = level.layout;
    const boxes = areaBoxes(level);
    const box = (a) => JSON.stringify(boxes.get(a.id));
    check(boxes.size === 2, `seed ${seed}: ${boxes.size} area boxes on a map cut in two`);
    check(box(west) === JSON.stringify({ x0: 0, z0: 0, x1: cut - 1, z1: map.h - 1 }), `seed ${seed}: the west's box is ${box(west)}, cut at x ${cut}`);
    check(box(east) === JSON.stringify({ x0: cut, z0: 0, x1: map.w - 1, z1: map.h - 1 }), `seed ${seed}: the east's box is ${box(east)}, cut at x ${cut}`);
    const reach = bfsDistances(map, start);
    const n = [];
    for (const area of [west, east]) {
      const opts = { floor: level.floor, box: boxes.get(area.id), reach, from: start };
      level.monsters = [];
      level.boss = null;
      spawnArea(level, area, new RNG(seed), opts);
      const what = `seed ${seed}, ${area === west ? 'west' : 'east'} of x ${cut} (${area.name})`;
      const ms = level.monsters;
      n.push(ms.length);
      elites += ms.filter((m) => m.rank !== 'boss' && m.rank !== 'normal' && !m.superUnique).length;
      const off = ms.filter((m) => tileArea(level, m.pos) !== area.id);
      check(!off.length, `${what}: ${off.length} monster(s) outside it, e.g. ${off[0]?.def.id} at ${off[0]?.pos.x.toFixed(1)},${off[0]?.pos.z.toFixed(1)}`);
      const wrong = ms.filter((m) => m.level !== areaLevel(area) + rankLvl(m));
      check(!wrong.length, `${what}: ${wrong.length} monster(s) not at area level ${areaLevel(area)} (+ rank), e.g. ${wrong[0]?.rank} at ${wrong[0]?.level}`);
      check(!!level.boss === (area === bossIn), `${what}: boss ${level.boss?.def.id ?? 'none'}, the boss room is ${bossIn === west ? 'west' : 'east'}`);
      const floor = area === west ? 4 : 8;
      check(!level.boss || (level.boss.def.id === BOSS[floor] && ms.includes(level.boss)), `${what}: Level.boss is ${level.boss?.def.id}, not floor ${floor}'s ${BOSS[floor]} among its monsters`);
      const again = cutFloor(seed).level;
      spawnArea(again, area, new RNG(seed), opts);
      check(listing(again.monsters) === listing(ms), `${what}: the same rng spawned different monsters`);
    }
    counts.push(n.join('/'));

    // ── Level on the cut floor: an rng per area ──
    // Level.populate is private in TypeScript: Level runs it as it builds the map, before a test can cut it
    const both = cutFloor(seed).level;
    both.populate(seed);
    const alone = cutFloor(seed).level;
    // the west made the camp, which gets no monsters
    for (let i = 0; i < alone.areas.length; i++) if (alone.areas[i] === west.id) alone.areas[i] = CAMP_AREA;
    alone.populate(seed);
    const eastOf = (lv) => lv.monsters.filter((m) => tileArea(lv, m.pos) === east.id);
    const what = `Level, seed ${seed}`;
    check(both.monsters.length > eastOf(both).length && eastOf(both).length > 0, `${what}: ${both.monsters.length} monsters, ${eastOf(both).length} of them east`);
    check(alone.monsters.length > 0 && eastOf(alone).length === alone.monsters.length, `${what}: with the west the camp, ${alone.monsters.length} monsters, ${eastOf(alone).length} of them east`);
    check(listing(eastOf(both)) === listing(alone.monsters), `${what}: the east spawned differently once the west spawned nothing`);
  }

  check(elites > 0, 'no champions, uniques or minions on any cut floor');
  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${SEEDS.length} seeds built twice alike, the camp empty; floor 4 cut in two areas, monsters west/east by seed: ${counts.join(', ')}, ${elites} champions, uniques and minions`);
};
