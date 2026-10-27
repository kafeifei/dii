// Areas (src/world/areas.ts) on today's maps: each map is one area, every tile of it, with the
// level, the kind and the names the maps had before there were areas; the layouts' waypoints and
// services become the objects they did. Then Game.teleportWithin on the camp, its east part made
// wilderness: the hero moves, the view is told to jump, a new area is announced, nothing is rebuilt.
const SEED = 7;
const FLOORS = 13;

export default async (load) => {
  const { CAMP_AREA, WILD_AREA, areaDef, areaForDepth, dungeonArea } = await load('/src/world/areas.ts');
  const { THEMES, WILD_MAPS, isWild, dungeonFloor, levelLabel, themeForFloor } = await load('/src/world/levelgen.ts');
  const { monsterLevel } = await load('/src/data/monsters.ts');
  const { Level } = await load('/src/game/level.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 1e-6;

  // ── the registry ──
  const depths = [0];
  for (let d = 1; d <= WILD_MAPS + FLOORS; d++) depths.push(d);
  for (const depth of depths) {
    const a = areaForDepth(depth);
    const what = `depth ${depth} (area ${a?.id})`;
    if (!a) {
      problems.push(`${what}: no area`);
      continue;
    }
    check(areaDef(a.id) === a, `${what}: areaDef gives another object`);
    // the banner says what the level-name message said, the minimap what it did
    const f = dungeonFloor(depth);
    const oldName = depth === 0 ? THEMES.town.name : isWild(depth) ? THEMES.wild.name : `${themeForFloor(f).name} · 第 ${f} 层`;
    check(a.name === oldName, `${what}: named ${a.name}, the level was ${oldName}`);
    check((a.label ?? a.name) === levelLabel(depth), `${what}: the minimap would say ${a.label ?? a.name}, not ${levelLabel(depth)}`);
    const [kind, id, lvl, wp] =
      depth === 0 ? ['town', CAMP_AREA, 0, true] : isWild(depth) ? ['outdoor', WILD_AREA, monsterLevel(1), false] : ['dungeon', dungeonArea(f), monsterLevel(f), true];
    check(a.id === id && a.kind === kind && a.waypoint === wp, `${what}: ${a.kind} #${a.id}, waypoint ${a.waypoint}; want ${kind} #${id}, waypoint ${wp}`);
    check(a.alvl.length === 3 && a.alvl.every((x) => x === lvl), `${what}: area level ${a.alvl.join('/')}, want ${lvl}`);
  }
  check(areaDef(999) === undefined, 'an unknown area id has a def');
  check(new Set(depths.map((d) => areaForDepth(d).key)).size === depths.length, 'two areas share a key');

  // ── the maps: one area each, the area's level for the monsters, the layout's lists made into objects ──
  for (const depth of [0, 1, WILD_MAPS + 1, WILD_MAPS + 4, WILD_MAPS + 9]) {
    const level = new Level(depth, SEED);
    const a = areaForDepth(depth);
    const { map, start, waypoints, services } = level.layout;
    const what = `${a.name} (depth ${depth})`;
    check(level.areas.length === map.w * map.h && level.areas.every((x) => x === a.id), `${what}: not every tile is in area ${a.id}`);
    check(level.areaAt(start.x, start.z) === a, `${what}: the start is in ${level.areaAt(start.x, start.z).name}`);
    check(level.areaAt(-5, -5) === a && level.areaAt(map.w + 5, map.h + 5) === a, `${what}: off the map isn't the nearest tile's area`);
    check(level.inTown(start) === (depth === 0), `${what}: inTown ${level.inTown(start)}`);
    const want = depth === 0 ? 0 : monsterLevel(level.floor);
    check(level.alvlAt(start) === want, `${what}: area level ${level.alvlAt(start)}, the floor's monster level is ${want}`);
    const normal = level.monsters.filter((m) => m.rank === 'normal');
    check(depth === 0 || (normal.length && normal.every((m) => m.level === want)), `${what}: normal monsters at levels ${[...new Set(normal.map((m) => m.level))].join(', ')}, want ${want}`);
    check(waypoints.every((w) => w.area === a.id), `${what}: a waypoint in area ${waypoints.map((w) => w.area).join(', ')}`);
    const wpObjs = level.objects.filter((o) => o.kind === 'waypoint');
    check(wpObjs.length === waypoints.length && waypoints.every((w) => wpObjs.some((o) => near(o.pos, w.pos))), `${what}: ${waypoints.length} waypoints, ${wpObjs.length} waypoint objects`);
    check(waypoints.length === (a.waypoint ? 1 : 0), `${what}: ${waypoints.length} waypoints, the area ${a.waypoint ? 'has' : 'has none'}`);
    const kinds = services.map((s) => s.kind).sort().join(' ') || 'none';
    if (depth === 0) check(kinds === 'campfire stash vendor', `${what}: services ${kinds}, want the merchant, the stash and the fire`);
    else if (isWild(depth)) check(services.every((s) => s.kind === 'campfire'), `${what}: services ${kinds}, want only the monster camps' fires`);
    else check(!services.length, `${what}: services ${kinds} on a dungeon floor`);
    for (const kind of ['vendor', 'stash']) {
      const s = services.filter((x) => x.kind === kind);
      const o = level.objects.filter((x) => x.kind === kind);
      check(o.length === s.length && s.every((x) => o.some((y) => near(y.pos, x.pos))), `${what}: ${s.length} ${kind} services, ${o.length} objects`);
    }
    if (depth === 0) check(level.objects.find((o) => o.kind === 'vendor')?.name === '商人 · 艾莉娜', `${what}: the merchant is ${level.objects.find((o) => o.kind === 'vendor')?.name}`);
  }

  // ── Game.teleportWithin, with hooks that only take notes ──
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const notes = { areas: [], levels: 0, jumps: 0 };
  const game = new Game({}, new Sfx());
  game.hooks = {
    message() {},
    openPanel() {},
    levelChanged: () => notes.levels++,
    areaChanged: (area, prev) => notes.areas.push(`${prev?.key ?? '-'}>${area.key}`),
    teleported: () => notes.jumps++,
    playerDied() {},
    inventoryChanged() {},
    getCursorItem: () => null,
    setCursorItem() {},
    hoveredGroundId: () => null,
    levelUp() {},
  };
  game.newGame('测试', 'paladin');
  const camp = game.level;
  check(notes.areas.join(' ') === '->camp' && notes.levels === 1, `a new game announced ${notes.areas.join(' ')} over ${notes.levels} level(s)`);
  // the camp's east half is wilderness, for the test
  const { map } = camp.layout;
  const east = Math.floor(map.w * 0.6);
  for (let z = 0; z < map.h; z++) for (let x = east; x < map.w; x++) camp.areas[z * map.w + x] = WILD_AREA;
  const spotIn = (x0, x1) => {
    for (let z = 4; z < map.h - 4; z++) for (let x = x0; x < x1; x++) if (map.circleClear(x + 0.5, z + 0.5, 0.45)) return { x: x + 0.5, z: z + 0.5 };
    return null;
  };
  const out = spotIn(east + 2, map.w - 4);
  const home = spotIn(4, east - 2);
  const out2 = spotIn(out ? Math.floor(out.x) + 1 : east + 3, map.w - 4);
  if (!out || !home || !out2) throw new Error('no walkable spots either side of the camp');
  const p = game.player;
  notes.areas = [];
  game.teleportWithin(out);
  check(near(p.pos, out) && near(p.prevPos, out), `teleported to ${p.pos.x},${p.pos.z}, asked for ${out.x},${out.z}`);
  check(game.area?.id === WILD_AREA && !camp.inTown(p.pos), `after the jump the hero is in ${game.area?.name}`);
  game.teleportWithin(out2);
  game.teleportWithin(home);
  const announced = notes.areas.join(' ');
  check(announced === 'camp>wild wild>camp', `three jumps announced ${announced || 'nothing'}, want camp>wild wild>camp`);
  check(notes.jumps === 3, `three jumps moved the view ${notes.jumps} times`);
  check(game.level === camp && notes.levels === 1, `the jumps rebuilt the level (${notes.levels} levelChanged)`);
  check(p.state === 'idle' && !p.intent && !p.path, `after a jump the hero is ${p.state}, intent ${p.intent?.kind}`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${depths.length} depths, ${new Set(depths.map((d) => areaForDepth(d).kind)).size} kinds of area; three jumps in the camp announced ${announced}`);
};
