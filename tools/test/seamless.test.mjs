// A Level over the West overworld (src/world/overworld.ts), as the game plays it. For a few world
// seeds: the areas are the overworld's tile by tile, with their levels, and town only on the camp's
// tiles; each area gets its own monsters (its levels.txt kinds, in normal each at its row's level), on its own tiles, none in the camp;
// monsters can't walk, slide or path into the camp, and leave a hero who stands in it alone. Maps
// of one area shut nothing to monsters. The game on it, from a new game on, is tools/test/west.test.mjs.
const SEEDS = [1, 7, 42, 20261026];
/** a sim step, as main.ts runs them */
const DT = 1 / 60;

export default async (load) => {
  const { generateOverworld } = await load('/src/world/overworld.ts');
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, areaDef } = await load('/src/world/areas.ts');
  const { WILD_MAPS, bfsDistances } = await load('/src/world/levelgen.ts');
  const { findPath } = await load('/src/world/pathfinding.ts');
  const { Level } = await load('/src/game/level.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { moveBy, stepToward } = await load('/src/game/movement.ts');
  const { updateMonster } = await load('/src/game/ai.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const counts = [];

  for (const seed of SEEDS) {
    const ow = generateOverworld(seed);
    const what = `seed ${seed}`;
    const level = new Level(WILD_MAPS, ow.seed, ow);
    const { map, areaOf, start } = ow;
    const { w } = map;
    const mm = level.monsterMap;

    // ── the areas, tile by tile: the overworld's, their levels, town only on the camp's ──
    check(level.areas === areaOf, `${what}: Level.areas isn't the overworld's areaOf`);
    check(mm !== map, `${what}: monsters walk the hero's map`);
    let wrong = 0;
    let shut = 0;
    for (let i = 0; i < areaOf.length; i++) {
      const x = i % w;
      const z = (i / w) | 0;
      const c = { x: x + 0.5, z: z + 0.5 };
      const def = areaDef(areaOf[i]);
      const camp = areaOf[i] === CAMP_AREA;
      if (level.areaAt(c.x, c.z) !== def || level.alvlAt(c) !== def.alvl[0] || level.inTown(c) !== camp) wrong++;
      // the camp's tiles are shut to monsters, nothing else
      if (mm.walkable(x, z) !== (map.walkable(x, z) && !camp)) wrong++;
      if (camp && map.walkable(x, z)) shut++;
    }
    check(!wrong, `${what}: ${wrong} tile(s) where Level's area, level, inTown or the monsters' map is wrong`);
    check(shut > 500, `${what}: only ${shut} walkable camp tiles shut to monsters`);
    // the monsters' map is a view of the map, not a copy
    const t = map.tiles.findIndex((v, i) => v === 1 && areaOf[i] !== CAMP_AREA);
    map.tiles[t] = 2;
    check(!mm.walkable(t % w, (t / w) | 0), `${what}: a wall put on the map isn't one on the monsters' map`);
    map.tiles[t] = 1;

    // ── the monsters: each area's own, at its level, where the hero can walk to, none in the camp ──
    const reach = bfsDistances(map, start);
    const by = new Map();
    for (const m of level.monsters) {
      const a = level.areaAt(m.pos.x, m.pos.z);
      by.set(a.id, (by.get(a.id) ?? 0) + 1);
      const i = Math.floor(m.pos.z) * w + Math.floor(m.pos.x);
      if (!mm.walkableAt(m.pos.x, m.pos.z) || reach[i] < 0) problems.push(`${what}: a ${m.def.id} at ${m.pos.x.toFixed(1)},${m.pos.z.toFixed(1)} stands where monsters can't, or the hero can't get to`);
      // in normal a plain one at its own row's level (D2: Monster.cpp:196-201), the elite ranks over it
      const own = m.def.row.diff[0].level;
      if (m.rank === 'normal' && m.level !== own) problems.push(`${what}: a ${m.def.id} in ${a.key} is level ${m.level}, its row's is ${own}`);
      if (m.level < own) problems.push(`${what}: a ${m.rank} ${m.def.id} in ${a.key} is level ${m.level}, under its row's ${own}`);
      // of the area's kinds, its champions' and uniques', or what they bring (the shamans' and Bishibosh's fallen)
      const d2 = D2X_AREAS.find((x) => x.id === a.id);
      if (d2 && ![...d2.mon, ...d2.umon, 'fallen1'].includes(m.def.id)) problems.push(`${what}: a ${m.def.id} in ${a.key}, not one of its kinds`);
    }
    check(!by.has(CAMP_AREA), `${what}: ${by.get(CAMP_AREA)} monster(s) in the camp`);
    check(by.get(WILD_AREA) > 50 && by.get(COLD_PLAINS) > 50, `${what}: ${by.get(WILD_AREA) ?? 0} monsters in Blood Moor, ${by.get(COLD_PLAINS) ?? 0} in Cold Plains`);
    check(level.areaAt(level.monsters[0].pos.x, level.monsters[0].pos.z).kind !== 'town', `${what}: the first monster is in a town`);
    counts.push(`${by.get(WILD_AREA)}+${by.get(COLD_PLAINS)}`);
    // the same seed, the same monsters
    const again = new Level(WILD_MAPS, ow.seed, ow);
    check(again.monsters.length === level.monsters.length && again.monsters.every((m, k) => m.def === level.monsters[k].def && m.pos.x === level.monsters[k].pos.x), `${what}: built twice, the monsters differ`);

    // ── into the camp: the gate's two sides, a monster out past it ──
    const gate = ow.seams.find((s) => s.a === CAMP_AREA);
    const out = { x: gate.tb.x - gate.ta.x, z: gate.tb.z - gate.ta.z };
    const past = (k) => ({ x: gate.tb.x + out.x * k, z: gate.tb.z + out.z * k });
    check(!level.inTown(gate.tb) && level.inTown(gate.ta), `${what}: the gate's sides are ${level.areaAt(gate.ta.x, gate.ta.z).key} and ${level.areaAt(gate.tb.x, gate.tb.z).key}`);
    const m = level.monsters.find((x) => x.rank === 'normal' && x.def.ai === 'melee') ?? level.monsters[0];
    const g = { level };
    const inTownAlong = (steps) => {
      let n = 0;
      for (let k = 0; k < steps.length; k++) if (level.inTown(steps[k])) n++;
      return n;
    };
    // walking straight in, pushed in by its fellows (the moves separate() makes), on a path in: never a camp tile
    const trail = [];
    m.pos = past(2);
    for (let k = 0; k < 600; k++) {
      moveBy(g, m, -out.x * 0.08, -out.z * 0.08);
      trail.push({ ...m.pos });
    }
    check(!inTownAlong(trail), `${what}: walked at the gate, a monster got ${inTownAlong(trail)} step(s) into the camp`);
    trail.length = 0;
    m.pos = past(3);
    m.path = null;
    for (let k = 0; k < 20 / DT; k++) {
      stepToward(g, m, start, 4, DT, 0.1);
      trail.push({ ...m.pos });
    }
    check(!inTownAlong(trail), `${what}: heading for the camp's middle, a monster got ${inTownAlong(trail)} step(s) into it`);
    const pushed = mm.resolveCircle({ x: gate.tb.x - out.x * 0.55, z: gate.tb.z - out.z * 0.55 }, 0.4);
    check(!level.inTown(pushed), `${what}: a monster overlapping the camp's edge stays in it when pushed out`);
    const path = findPath(mm, past(2), start, 20000, 0.3) ?? [];
    check(!inTownAlong(path), `${what}: a monster's path to the camp's middle runs ${inTownAlong(path)} point(s) in it`);
    const heroPath = findPath(map, past(2), start, 20000, 0.3) ?? [];
    check(heroPath.length && Math.hypot(heroPath.at(-1).x - start.x, heroPath.at(-1).z - start.z) < 1, `${what}: the hero has no path from outside the gate to the camp's middle`);

    // ── a hero in the camp is no target: an awake monster at the gate goes home, one outside comes on ──
    const hero = { pos: { ...gate.ta }, dead: false, radius: 0.4, state: 'idle' };
    const quiet = { play() {} };
    const game = { player: hero, level, sfx: quiet, hooks: { message() {} }, fx: { burst() {} }, killMonster() {} };
    m.pos = past(2);
    m.homePos = past(9);
    m.awake = true;
    m.path = null;
    m.setState('idle');
    trail.length = 0;
    let swung = false;
    // D2's walk home is slow (75 % of Velocity: a zombie's is 0.38 m/s), so give it the time
    for (let k = 0; k < 25 / DT && !swung; k++) {
      updateMonster(game, m, DT);
      // this hero is too thin to be struck: the swing itself is the failure
      swung = m.state === 'attack' || m.state === 'charge';
      trail.push({ ...m.pos });
    }
    const home = Math.hypot(m.pos.x - m.homePos.x, m.pos.z - m.homePos.z);
    check(!inTownAlong(trail) && home < 1.5 && !swung, `${what}: with the hero in the camp a monster at the gate ended ${home.toFixed(1)} from home, ${swung ? 'swinging at them' : m.state}, ${inTownAlong(trail)} step(s) in the camp`);
    hero.pos = past(10);
    m.pos = past(3);
    m.homePos = past(3);
    m.path = null;
    m.setState('idle');
    const before = Math.hypot(hero.pos.x - m.pos.x, hero.pos.z - m.pos.z);
    for (let k = 0; k < 1 / DT && m.state !== 'attack'; k++) updateMonster(game, m, DT);
    const after = Math.hypot(hero.pos.x - m.pos.x, hero.pos.z - m.pos.z);
    check(after < before - 0.8, `${what}: with the hero out in Blood Moor the monster went from ${before.toFixed(1)} to ${after.toFixed(1)} of them`);
  }

  // ── maps of one area shut nothing ──
  for (const depth of [0, 1, WILD_MAPS + 1, WILD_MAPS + 6]) {
    const level = new Level(depth, 7);
    check(level.monsterMap === level.map, `depth ${depth}: monsters walk a map of their own`);
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(`  ${SEEDS.length} seeds: Blood Moor + Cold Plains monsters ${counts.join(' / ')}, none in or into the camp`);
};
