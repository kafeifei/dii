// Areas (src/world/areas.ts) on today's maps: each map is one area, every tile of it, with the
// level, the kind and the names the maps had before there were areas; the layouts' waypoints and
// services become the objects they did. Then Game.teleportWithin on the camp, its east part made
// wilderness: the hero moves, the view is told to jump, a new area is announced, nothing is rebuilt.
// Then what the tools go by: areas by key and in order, the way from a map into an area
// (Level.wayTo), a jump by area (Game.travelToArea) and the difficulty (Game.setDifficulty), whose
// waypoints are kept apart in the save.
const SEED = 7;
const FLOORS = 13;

export default async (load) => {
  const { CAMP_AREA, WILD_AREA, areaByKey, areaDef, areaForDepth, areaList, dungeonArea, nextArea } = await load('/src/world/areas.ts');
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

  // ── the way into an area: a tile of it on this map, else the exit or stairs there ──
  const wayEast = camp.wayTo(WILD_AREA, home);
  check(wayEast && !wayEast.obj && wayEast.pos.x >= east && camp.map.walkableAt(wayEast.pos.x, wayEast.pos.z) && camp.areaAt(wayEast.pos.x, wayEast.pos.z).id === WILD_AREA, `with the camp's east half wild, the way there is ${JSON.stringify(wayEast)}`);
  check(camp.wayTo(CAMP_AREA, home)?.pos && near(camp.wayTo(CAMP_AREA, home).pos, home), 'the way into the area the hero is in is not where they stand');
  camp.areas.fill(CAMP_AREA);
  const gate = camp.wayTo(WILD_AREA, home);
  check(gate?.obj?.kind === 'exit' && gate.obj.dest === 1, `the camp's way into the wilderness is ${gate?.obj?.kind} to ${gate?.obj?.dest}`);
  const wild = new Level(1, SEED);
  const ws = wild.layout.start;
  check(wild.wayTo(dungeonArea(1), ws)?.obj?.kind === 'stairs', `the wilderness's way into floor 1 is ${wild.wayTo(dungeonArea(1), ws)?.obj?.kind}`);
  check(wild.wayTo(CAMP_AREA, ws)?.obj?.kind === 'exit', `the wilderness's way back to the camp is ${wild.wayTo(CAMP_AREA, ws)?.obj?.kind}`);
  check(wild.wayTo(dungeonArea(2), ws) === null, 'the wilderness leads to floor 2');
  const f2 = new Level(WILD_MAPS + 2, SEED);
  check(f2.wayTo(dungeonArea(3), f2.layout.start)?.obj?.kind === 'stairs' && f2.wayTo(dungeonArea(1), f2.layout.start) === null, 'floor 2 does not lead to floor 3 by its stairs alone');

  // ── areas by key and in order ──
  const list = areaList(5);
  check(list.map((a) => a.key).join() === 'camp,wild,floor1,floor2,floor3,floor4,floor5', `areaList(5): ${list.map((a) => a.key).join()}`);
  check(list.every((a, i) => i === 0 || nextArea(list[i - 1]) === a), 'nextArea does not follow the list');
  check(list.every((a) => areaByKey(a.key) === a) && areaByKey('floor40') === areaDef(dungeonArea(40)), 'an area is not found by its key');
  check(areaByKey('floor0') === undefined && areaByKey('nowhere') === undefined && nextArea({ id: 999 }) === undefined, 'a key or an area that is not there is found');

  // ── a jump by area, and the difficulty ──
  const saved = () => JSON.parse(localStorage.getItem('dii-save-v1'));
  check(game.travelToArea(dungeonArea(3)) && game.area.key === 'floor3' && game.level.depth === WILD_MAPS + 3, `travelToArea(floor 3) went to ${game.area.key}`);
  check(!game.travelToArea(999) && game.area.key === 'floor3', 'a jump to an area with no map went somewhere');
  const normal = [...p.waypoints];
  check(normal.includes(WILD_MAPS + 3), `floor 3's waypoint not touched: ${normal.join()}`);
  game.setDifficulty(1);
  let d = saved();
  check(p.difficulty === 1 && p.waypoints.join() === '0', `nightmare: difficulty ${p.difficulty}, waypoints ${p.waypoints.join()}`);
  check(d.difficulty === 1 && d.unlocked === 1 && d.progress[1].waypoints.join() === String(CAMP_AREA) && d.progress[0].waypoints.includes(dungeonArea(3)), `nightmare saved ${JSON.stringify({ difficulty: d.difficulty, unlocked: d.unlocked, progress: d.progress })}`);
  game.travelToArea(dungeonArea(4));
  game.setDifficulty(0);
  d = saved();
  check(p.difficulty === 0 && p.waypoints.join() === normal.join(), `back in normal the waypoints are ${p.waypoints.join()}, were ${normal.join()}`);
  check(d.difficulty === 0 && d.unlocked === 1 && d.progress[1].waypoints.includes(dungeonArea(4)) && !d.progress[0].waypoints.includes(dungeonArea(4)), `floor 4's nightmare waypoint saved as ${JSON.stringify(d.progress)}`);
  game.setDifficulty(2);
  const again = (await load('/src/game/save.ts')).loadSave();
  check(again?.player.difficulty === 2 && again.player.waypoints.join() === '0', `hell reloads as difficulty ${again?.player.difficulty} with waypoints ${again?.player.waypoints.join()}`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${depths.length} depths, ${new Set(depths.map((d) => areaForDepth(d).kind)).size} kinds of area; three jumps in the camp announced ${announced}; ways, keys, jumps and difficulties as the tools use them`);
};
