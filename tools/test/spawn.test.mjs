// Monster population (src/game/spawn.ts). Level fills its map's areas as it builds it: on the depths
// and seeds below, exactly the monsters it spawned before spawning moved out of Level, and none in
// the camp. Then spawnArea on its own, on a dungeon floor cut in two areas for the test (the boss
// room wholly on one side): each call places monsters only on its own area's tiles, at its own
// area level, and the boss only in the area with its room. Last, Level on that cut floor: each area
// spawns from an rng of its own, so the east gets the same monsters whether the west gets any.
const SEEDS = [1, 7, 0x5eed, 20261026];
/** how far above the area level each rank stands (spawn.ts) */
const RANK_LVL = { normal: 0, minion: 1, champion: 2, unique: 2, boss: 3 };
/**
 * what Level spawned at c602d8f, before spawn.ts, by depth/seed (depth 1 is the wilderness, 2, 5
 * and 9 dungeon floors 1, 4 and 8): how many monsters, which of them is the boss (-1: none), a hash
 * of the whole list (listing below) and how many of each monster, rank and level. Changing what
 * spawns (Diablo II's tables) changes these, on purpose; moving code around must not.
 */
const BEFORE = {
  '1/1': [85, -1, 'cb54a83b', 'imp/champion/3x2 imp/normal/1x18 skeleton/minion/2x4 skeleton/normal/1x20 skeleton/unique/3x1 zombie/normal/1x40'],
  '1/7': [82, -1, '28fe46b2', 'imp/normal/1x13 skeleton/minion/2x3 skeleton/normal/1x36 skeleton/unique/3x1 zombie/normal/1x29'],
  '1/24301': [97, -1, '3c26f4bc', 'imp/minion/2x5 imp/normal/1x40 imp/unique/3x1 skeleton/normal/1x34 zombie/champion/3x3 zombie/normal/1x14'],
  '1/20261026': [89, -1, '275da3b1', 'imp/champion/3x4 imp/normal/1x36 skeleton/minion/2x4 skeleton/normal/1x28 skeleton/unique/3x1 zombie/normal/1x16'],
  '2/1': [47, -1, 'ce0eac04', 'imp/normal/1x11 skeleton/minion/2x4 skeleton/normal/1x20 skeleton/unique/3x1 zombie/normal/1x11'],
  '2/7': [45, -1, 'b8b3c1a8', 'skeleton/minion/2x4 skeleton/normal/1x14 skeleton/unique/3x1 zombie/normal/1x26'],
  '2/24301': [41, -1, '64805227', 'imp/normal/1x11 skeleton/minion/2x3 skeleton/normal/1x16 skeleton/unique/3x1 zombie/normal/1x10'],
  '2/20261026': [48, -1, 'd72ded7d', 'imp/normal/1x18 skeleton/minion/2x4 skeleton/unique/3x1 zombie/normal/1x25'],
  '5/1': [51, 47, '48c82dd8', 'butcher/boss/9x1 imp/normal/6x4 shaman/normal/6x1 skelarcher/minion/7x4 skelarcher/normal/6x4 skelarcher/unique/8x1 skeleton/normal/6x8 skelmage/normal/6x3 skullfly/normal/6x4 zombie/champion/8x4 zombie/minion/7x3 zombie/normal/6x13 zombie/unique/8x1'],
  '5/7': [46, 42, '58f2bda3', 'butcher/boss/9x1 imp/normal/6x3 shaman/normal/6x1 skelarcher/minion/7x4 skelarcher/normal/6x5 skelarcher/unique/8x1 skeleton/normal/6x4 skelmage/champion/8x4 skullfly/normal/6x14 zombie/champion/8x2 zombie/normal/6x7'],
  '5/24301': [56, 52, '2eadd758', 'butcher/boss/9x1 imp/minion/7x4 imp/normal/6x7 imp/unique/8x1 skelarcher/champion/8x4 skeleton/minion/7x5 skeleton/normal/6x10 skeleton/unique/8x1 skelmage/normal/6x5 skullfly/normal/6x3 zombie/normal/6x15'],
  '5/20261026': [50, 46, '37888fe2', 'butcher/boss/9x1 imp/champion/8x4 imp/normal/6x9 shaman/normal/6x2 skelarcher/champion/8x3 skelarcher/normal/6x2 skeleton/minion/7x4 skeleton/normal/6x2 skeleton/unique/8x1 skelmage/minion/7x3 skelmage/unique/8x1 skullfly/normal/6x3 zombie/champion/8x3 zombie/normal/6x12'],
  '9/1': [76, 72, '07831326', 'bat/normal/14x13 ghoul/champion/16x4 ghoul/normal/14x2 imp/normal/14x19 lich/boss/17x1 mushroom/minion/15x5 mushroom/unique/16x1 shaman/normal/14x4 skelarcher/normal/14x4 skeleton/minion/15x3 skeleton/normal/14x11 skeleton/unique/16x1 skelmage/normal/14x2 skullfly/normal/14x6'],
  '9/7': [54, 50, '7baf3a12', 'bat/minion/15x5 bat/unique/16x1 ghoul/normal/14x4 imp/normal/14x4 lich/boss/17x1 skelarcher/champion/16x4 skelarcher/normal/14x3 skeleton/champion/16x2 skeleton/normal/14x15 skullfly/normal/14x10 spider/normal/14x5'],
  '9/24301': [55, 51, '07f9d558', 'bat/minion/15x3 bat/normal/14x10 bat/unique/16x1 ghoul/minion/15x3 ghoul/normal/14x4 ghoul/unique/16x1 lich/boss/17x1 skelarcher/champion/16x3 skeleton/normal/14x10 skelmage/normal/14x2 skullfly/normal/14x5 spider/normal/14x12'],
  '9/20261026': [54, 50, 'deabf832', 'bat/normal/14x4 ghoul/minion/15x3 ghoul/normal/14x5 ghoul/unique/16x1 imp/champion/16x6 imp/minion/15x4 imp/normal/14x3 imp/unique/16x1 lich/boss/17x1 shaman/normal/14x1 skelarcher/normal/14x6 skeleton/normal/14x5 skelmage/champion/16x4 skullfly/normal/14x10'],
};

/** FNV-1a, to pin a long listing to a short string */
const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
/** every monster in order: what, rank, level, where, mods, name and leader (its index) */
const listing = (ms) => ms.map((m) => `${m.def.id} ${m.rank} ${m.level} ${m.pos.x.toFixed(4)},${m.pos.z.toFixed(4)} ${m.mods.join('+')} ${m.displayName} ${m.leader ? ms.indexOf(m.leader) : '-'}`).join('\n');
/** how many of each monster/rank/level, sorted */
const kinds = (ms) => {
  const n = new Map();
  for (const m of ms) n.set(`${m.def.id}/${m.rank}/${m.level}`, (n.get(`${m.def.id}/${m.rank}/${m.level}`) ?? 0) + 1);
  return [...n].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}x${v}`).join(' ');
};

export default async (load) => {
  const { Level } = await load('/src/game/level.ts');
  const { areaBoxes, spawnArea } = await load('/src/game/spawn.ts');
  const { RNG } = await load('/src/core/math.ts');
  const { CAMP_AREA, areaDef, areaForDepth, areaLevel, dungeonArea } = await load('/src/world/areas.ts');
  const { WILD_MAPS, bfsDistances } = await load('/src/world/levelgen.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const tileArea = (level, p) => level.areas[Math.floor(p.z) * level.map.w + Math.floor(p.x)];

  // ── Level: once per area at build time, as before spawn.ts ──
  if (WILD_MAPS !== 1) throw new Error(`BEFORE was recorded with one wilderness map, there are ${WILD_MAPS}`);
  for (const seed of SEEDS) {
    const camp = new Level(0, seed);
    check(!camp.monsters.length && !camp.boss, `the camp (seed ${seed}) has ${camp.monsters.length} monsters`);
  }
  for (const [key, [n, boss, h, set]] of Object.entries(BEFORE)) {
    const [depth, seed] = key.split('/').map(Number);
    const level = new Level(depth, seed);
    const ms = level.monsters;
    const what = `depth ${depth}, seed ${seed}`;
    const b = level.boss ? ms.indexOf(level.boss) : -1;
    if (ms.length !== n || b !== boss || kinds(ms) !== set) {
      problems.push(`${what}: ${ms.length} monsters, boss #${b}, ${kinds(ms)}\n    before: ${n} monsters, boss #${boss}, ${set}`);
    } else {
      check(hash(listing(ms)) === h, `${what}: the same monsters as before, but not where, named or modded as they were (hash ${hash(listing(ms))}, before ${h})`);
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
      check(ms.filter((m) => m.rank !== 'boss' && m.rank !== 'normal').length > 0, `${what}: no champions, uniques or minions`);
      const off = ms.filter((m) => tileArea(level, m.pos) !== area.id);
      check(!off.length, `${what}: ${off.length} monster(s) outside it, e.g. ${off[0]?.def.id} at ${off[0]?.pos.x.toFixed(1)},${off[0]?.pos.z.toFixed(1)}`);
      const wrong = ms.filter((m) => m.level !== areaLevel(area) + RANK_LVL[m.rank]);
      check(!wrong.length, `${what}: ${wrong.length} monster(s) not at area level ${areaLevel(area)} (+ rank), e.g. ${wrong[0]?.rank} at ${wrong[0]?.level}`);
      check(!!level.boss === (area === bossIn), `${what}: boss ${level.boss?.def.id ?? 'none'}, the boss room is ${bossIn === west ? 'west' : 'east'}`);
      check(!level.boss || (level.boss.rank === 'boss' && ms.includes(level.boss)), `${what}: Level.boss isn't one of its monsters`);
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

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${Object.keys(BEFORE).length} depth/seeds as before spawn.ts; floor 4 cut in two areas, monsters west/east by seed: ${counts.join(', ')}`);
};
