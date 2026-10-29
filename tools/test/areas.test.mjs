// Areas (src/world/areas.ts) on the old maps (the separate camp, the old wilderness, the trial
// ground's floors): each map is one area, every tile of it, with the level, the kind and the names
// of its theme; the layouts' waypoints and services become the objects they did. Then
// Game.teleportWithin on the overworld, across the camp's gate: the hero moves, the view is told to
// jump, a new area is announced, nothing is rebuilt. Then what the tools go by: areas by key and in
// order (by levels.txt Id), M2a's four dungeons (defined, not built), the connection graph and the
// way over built areas (routeTo, never through one not built), the waypoint list by Id, the way from
// a map into an area (Level.wayTo), a jump by area (Game.travelToArea) and the difficulty
// (Game.setDifficulty), whose waypoints are kept apart in the save.
const SEED = 7;
const FLOORS = 13;

export default async (load) => {
  const A0 = await load('/src/world/areas.ts');
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL, STONY_FIELD, BURIAL_GROUNDS, areaByKey, areaDef, areaForDepth, areaLevel, areaList, builtWaypoints, dungeonArea, isBuilt, nextArea, trialLevel: monsterLevel } = await load('/src/world/areas.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { THEMES, WILD_MAPS, isWild, dungeonFloor, levelLabel, themeForFloor } = await load('/src/world/levelgen.ts');
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
    // a trial floor's level is its floor's in every difficulty; the camp's and Blood Moor's are levels.json's (below)
    check(a.alvl.length === 3 && a.alvl[0] === lvl && (a.kind !== 'dungeon' || a.alvl.every((x) => x === lvl)), `${what}: area level ${a.alvl.join('/')}, want ${lvl}`);
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
    // Akara's counterpart, by her row's name (tools/d2-names/npcs.json), and her id, which her quests go by
    const merchant = level.objects.find((o) => o.kind === 'vendor');
    if (depth === 0) check(merchant?.name === '商人 · 亚喀蕾' && merchant.npcId === 'akara', `${what}: the merchant is ${merchant?.name} (${merchant?.npcId})`);
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
  const west = game.level;
  check(notes.areas.join(' ') === '->camp' && notes.levels === 1, `a new game announced ${notes.areas.join(' ')} over ${notes.levels} level(s)`);
  // either side of the camp's gate on the overworld
  const { map } = west.layout;
  const gateSeam = west.layout.seams.find((s) => s.a === CAMP_AREA && s.b === WILD_AREA);
  const step = { x: gateSeam.tb.x - gateSeam.ta.x, z: gateSeam.tb.z - gateSeam.ta.z };
  const spotAlong = (k0, k1) => {
    for (let k = k0; k !== k1; k += Math.sign(k1 - k0)) {
      const c = { x: gateSeam.tb.x + step.x * k, z: gateSeam.tb.z + step.z * k };
      if (map.circleClear(c.x, c.z, 0.45)) return c;
    }
    return null;
  };
  const out = spotAlong(4, 30);
  const out2 = out && spotAlong(Math.round(Math.hypot(out.x - gateSeam.tb.x, out.z - gateSeam.tb.z)) + 2, 40);
  const home = west.layout.start;
  if (!out || !out2) throw new Error('no walkable spots out past the camp gate');
  const p = game.player;
  notes.areas = [];
  game.teleportWithin(out);
  check(near(p.pos, out) && near(p.prevPos, out), `teleported to ${p.pos.x},${p.pos.z}, asked for ${out.x},${out.z}`);
  check(game.area?.id === WILD_AREA && !west.inTown(p.pos), `after the jump the hero is in ${game.area?.name}`);
  game.teleportWithin(out2);
  game.teleportWithin(home);
  const announced = notes.areas.join(' ');
  check(announced === 'camp>wild wild>camp', `three jumps announced ${announced || 'nothing'}, want camp>wild wild>camp`);
  check(notes.jumps === 3, `three jumps moved the view ${notes.jumps} times`);
  check(game.level === west && notes.levels === 1, `the jumps rebuilt the level (${notes.levels} levelChanged)`);
  check(p.state === 'idle' && !p.intent && !p.path, `after a jump the hero is ${p.state}, intent ${p.intent?.kind}`);

  // ── the way into an area: a tile of it on this map, else the exit or stairs there ──
  const wayOut = west.wayTo(WILD_AREA, home);
  check(wayOut && !wayOut.obj && west.areaAt(wayOut.pos.x, wayOut.pos.z).id === WILD_AREA && map.walkableAt(wayOut.pos.x, wayOut.pos.z), `on the overworld the way from the camp into Blood Moor is ${JSON.stringify(wayOut)}`);
  check(west.wayTo(CAMP_AREA, home)?.pos && near(west.wayTo(CAMP_AREA, home).pos, home), 'the way into the area the hero is in is not where they stand');
  // the Den by its mouth; Stony Field and the Burial Grounds are on the overworld, walked into; the Crypt's way closed while it has no map
  const toStony = west.wayTo(STONY_FIELD, home);
  check(west.wayTo(DEN_OF_EVIL, home)?.obj?.kind === 'stairs' && toStony && !toStony.obj && west.areaAt(toStony.pos.x, toStony.pos.z).id === STONY_FIELD && west.wayTo(BURIAL_GROUNDS, home)?.obj === undefined && west.wayTo(A0.CRYPT, home) === null, `the overworld's way into the den is ${west.wayTo(DEN_OF_EVIL, home)?.obj?.kind}, into Stony Field ${JSON.stringify(toStony)}, into the Crypt ${JSON.stringify(west.wayTo(A0.CRYPT, home))}`);
  // the old separate camp, its east half made wilderness for the test
  const camp = new Level(0, SEED);
  const cm = camp.layout.map;
  const east = Math.floor(cm.w * 0.6);
  for (let z = 0; z < cm.h; z++) for (let x = east; x < cm.w; x++) camp.areas[z * cm.w + x] = WILD_AREA;
  const campHome = camp.layout.start;
  const wayEast = camp.wayTo(WILD_AREA, campHome);
  check(wayEast && !wayEast.obj && wayEast.pos.x >= east && cm.walkableAt(wayEast.pos.x, wayEast.pos.z) && camp.areaAt(wayEast.pos.x, wayEast.pos.z).id === WILD_AREA, `with the camp's east half wild, the way there is ${JSON.stringify(wayEast)}`);
  camp.areas.fill(CAMP_AREA);
  const gate = camp.wayTo(WILD_AREA, campHome);
  check(gate?.obj?.kind === 'exit' && gate.obj.dest === WILD_AREA, `the old camp's way into the wilderness is ${gate?.obj?.kind} to ${gate?.obj?.dest}`);
  const wild = new Level(1, SEED);
  const ws = wild.layout.start;
  check(wild.wayTo(dungeonArea(1), ws)?.obj?.kind === 'stairs', `the wilderness's way into floor 1 is ${wild.wayTo(dungeonArea(1), ws)?.obj?.kind}`);
  check(wild.wayTo(CAMP_AREA, ws)?.obj?.kind === 'exit', `the wilderness's way back to the camp is ${wild.wayTo(CAMP_AREA, ws)?.obj?.kind}`);
  check(wild.wayTo(dungeonArea(2), ws) === null, 'the wilderness leads to floor 2');
  const f2 = new Level(WILD_MAPS + 2, SEED);
  check(f2.wayTo(dungeonArea(3), f2.layout.start)?.obj?.kind === 'stairs' && f2.wayTo(dungeonArea(1), f2.layout.start) === null, 'floor 2 does not lead to floor 3 by its stairs alone');

  // ── areas by key and in order: normal play's, and the trial ground's floors after one another ──
  const list = areaList();
  // by levels.txt Id (docs/M2A-STEP0.md 2.9)
  check(list.map((a) => a.key).join() === 'camp,wild,coldplains,stonyfield,denofevil,burialgrounds', `areaList(): ${list.map((a) => a.key).join()}`);
  check(list.every((a, i) => i === 0 || nextArea(list[i - 1]) === a) && nextArea(list.at(-1)) === undefined, 'nextArea does not follow the list, or goes on past its end');
  check(list.every((a) => isBuilt(a.id)) && isBuilt(STONY_FIELD) && isBuilt(BURIAL_GROUNDS) && !isBuilt(A0.CAVE_1) && !isBuilt(dungeonArea(1)), 'isBuilt is not the list');
  check(nextArea(areaDef(dungeonArea(3))) === areaDef(dungeonArea(4)), 'the trial ground does not go on floor by floor');
  check(list.every((a) => areaByKey(a.key) === a) && areaByKey('floor40') === areaDef(dungeonArea(40)), 'an area is not found by its key');
  check(areaByKey('floor0') === undefined && areaByKey('nowhere') === undefined && nextArea({ id: 999 }) === undefined, 'a key or an area that is not there is found');
  check([...list, areaDef(dungeonArea(7))].every((a) => /^[A-Z]/.test(a.en ?? '')), 'an area has no English name');
  // ── M2a's dungeons, the two BUILT lists, the connection graph (docs/M2A-STEP0.md 2.9) ──
  {
    const A = await load('/src/world/areas.ts');
    const { BUILT_WEST } = await load('/src/world/built-west.ts');
    const { BUILT_DUNGEONS } = await load('/src/world/built-dungeons.ts');
    for (const [id, key] of [[A.CAVE_1, 'cave1'], [A.CAVE_2, 'cave2'], [A.CRYPT, 'crypt'], [A.MAUSOLEUM, 'mausoleum']]) {
      const a = areaDef(id);
      const row = D2X_AREAS.find((r) => r.id === id);
      check(a?.key === key && areaByKey(key) === a && a.kind === 'dungeon' && !a.waypoint && a.name === row.name && a.en === row.nameEn && a.alvl.join() === row.lvl.join() && !isBuilt(id), `area ${id}: ${JSON.stringify(a)}`);
    }
    check(BUILT_WEST.join() === '1,2,3,4,17' && BUILT_DUNGEONS.join() === '8', `the BUILT lists: west ${BUILT_WEST}, dungeons ${BUILT_DUNGEONS}`);
    check(A.areaLinks(COLD_PLAINS).join() === '2,4,9,17' && A.areaLinks(A.CRYPT).join() === '17' && A.areaLinks(DEN_OF_EVIL).join() === '2' && A.areaLinks(dungeonArea(3)).length === 0, `links: Cold Plains ${A.areaLinks(COLD_PLAINS)}, the Crypt ${A.areaLinks(A.CRYPT)}, the Den ${A.areaLinks(DEN_OF_EVIL)}`);
    const route = (a, b) => A.routeTo(a, b)?.join() ?? 'none';
    check(route(CAMP_AREA, COLD_PLAINS) === '1,2,3' && route(CAMP_AREA, DEN_OF_EVIL) === '1,2,8' && route(DEN_OF_EVIL, COLD_PLAINS) === '8,2,3' && route(COLD_PLAINS, COLD_PLAINS) === '3', `routeTo: 1→3 ${route(1, 3)}, 1→8 ${route(1, 8)}, 8→3 ${route(8, 3)}`);
    // the west block's overworld, all built: Stony Field and the Burial Grounds by Cold Plains
    check(route(CAMP_AREA, STONY_FIELD) === '1,2,3,4' && route(CAMP_AREA, BURIAL_GROUNDS) === '1,2,3,17' && route(STONY_FIELD, BURIAL_GROUNDS) === '4,3,17' && route(DEN_OF_EVIL, STONY_FIELD) === '8,2,3,4', `routeTo: 1→4 ${route(1, 4)}, 1→17 ${route(1, 17)}, 4→17 ${route(4, 17)}, 8→4 ${route(8, 4)}`);
    // never through an area not built: none to one that isn't, nor to a built one only it leads to
    check(route(CAMP_AREA, A.CAVE_1) === 'none' && route(CAMP_AREA, A.CRYPT) === 'none' && route(STONY_FIELD, 10) === 'none' && route(CAMP_AREA, dungeonArea(1)) === 'none', `routeTo an area not built: ${route(1, 9)}, ${route(1, 18)}, ${route(4, 10)}`);
    BUILT_DUNGEONS.push(A.CAVE_2);
    try {
      check(isBuilt(A.CAVE_2) && route(CAMP_AREA, A.CAVE_2) === 'none', `the Cave's second level built without its first: ${route(1, 13)}`);
      BUILT_DUNGEONS.push(A.CAVE_1);
      check(route(CAMP_AREA, A.CAVE_2) === '1,2,3,9,13', `both the Cave's levels built: ${route(1, 13)}`);
    } finally {
      BUILT_DUNGEONS.length = 1;
    }
    // the waypoint list by Id: the camp's, Cold Plains', Stony Field's (the Burial Grounds have none),
    // whatever order they were touched in; one of an area this build lacks stays out of it
    check(builtWaypoints([COLD_PLAINS, CAMP_AREA]).join() === '1,3' && builtWaypoints([STONY_FIELD, BURIAL_GROUNDS, COLD_PLAINS, CAMP_AREA]).join() === '1,3,4' && builtWaypoints([STONY_FIELD, 5]).join() === '1,4', `waypoints: ${builtWaypoints([3, 1])}; ${builtWaypoints([4, 17, 3, 1])}; ${builtWaypoints([4, 5])}`);
    check(isBuilt(STONY_FIELD) && !isBuilt(A.CAVE_1) && BUILT_WEST.length === 5 && BUILT_DUNGEONS.length === 1, 'a BUILT list was left changed');
  }

  // the Act 1 areas' levels in the three difficulties are levels.json MonLvlEx, (N), (H), as areaLevel gives them
  for (const a of list) {
    const row = D2X_AREAS.find((r) => r.id === a.id);
    check(row && [0, 1, 2].every((d) => areaLevel(a, d) === row.lvl[d]), `${a.key}: area levels ${a.alvl.join('/')}, levels.json's ${row?.lvl.join('/')}`);
    // and their names are the rename table's (tools/d2-names/areas.json name and nameEn)
    check(row && a.name === row.name && a.en === row.nameEn, `${a.key}: named ${a.name} / ${a.en}, the rename table ${row?.name} / ${row?.nameEn}`);
  }
  check(areaDef(DEN_OF_EVIL).alvl.join() === '1,36,79' && areaLevel(areaDef(WILD_AREA)) === 1, `the den's levels ${areaDef(DEN_OF_EVIL).alvl.join('/')}, Blood Moor's normal ${areaLevel(areaDef(WILD_AREA))}`);

  // ── a jump by area, and the difficulty ──
  const saved = () => JSON.parse(localStorage.getItem('dii-save-v1'));
  check(game.travelToArea(dungeonArea(3)) && game.area.key === 'floor3' && game.level.depth === WILD_MAPS + 3, `travelToArea(floor 3) went to ${game.area.key}`);
  check(!game.travelToArea(999) && !game.travelToArea(A0.CAVE_1) && game.area.key === 'floor3', 'a jump to an area with no map went somewhere');
  check(p.waypoints.join() === String(CAMP_AREA), `the trial ground touched a waypoint: ${p.waypoints.join()}`);
  check(game.travelToArea(COLD_PLAINS) && game.area.id === COLD_PLAINS && game.level === west, `travelToArea(Cold Plains) went to ${game.area.key}`);
  // touched in nightmare, not in normal; nightmare is another game begun in the camp, its overworld made anew
  game.setDifficulty(1);
  const nm = game.level;
  check(nm !== west && nm.difficulty === 1 && game.area.id === CAMP_AREA, `nightmare on ${nm === west ? 'the normal overworld' : 'a new one'} (difficulty ${nm.difficulty}), in ${game.area.key}`);
  check(game.travelToArea(COLD_PLAINS) && game.area.id === COLD_PLAINS && game.level === nm, `nightmare: travelToArea(Cold Plains) went to ${game.area.key}`);
  const coldWp = nm.objects.find((o) => o.kind === 'waypoint' && nm.areaAt(o.pos.x, o.pos.z).id === COLD_PLAINS);
  game.interact(coldWp);
  let d = saved();
  check(p.difficulty === 1 && p.waypoints.join() === `${CAMP_AREA},${COLD_PLAINS}`, `nightmare: difficulty ${p.difficulty}, waypoints ${p.waypoints.join()}`);
  check(d.difficulty === 1 && d.unlocked === 1 && d.progress[1].waypoints.includes(COLD_PLAINS) && !d.progress[0].waypoints.includes(COLD_PLAINS), `nightmare saved ${JSON.stringify({ difficulty: d.difficulty, unlocked: d.unlocked, progress: d.progress })}`);
  game.setDifficulty(0);
  d = saved();
  check(p.difficulty === 0 && p.waypoints.join() === String(CAMP_AREA), `back in normal the waypoints are ${p.waypoints.join()}`);
  check(d.difficulty === 0 && d.unlocked === 1 && d.progress[1].waypoints.includes(COLD_PLAINS) && !d.progress[0].waypoints.includes(COLD_PLAINS), `Cold Plains' nightmare waypoint saved as ${JSON.stringify(d.progress)}`);
  game.setDifficulty(2);
  const again = (await load('/src/game/save.ts')).loadSave();
  check(again?.player.difficulty === 2 && again.player.waypoints.join() === String(CAMP_AREA), `hell reloads as difficulty ${again?.player.difficulty} with waypoints ${again?.player.waypoints.join()}`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${depths.length} depths, ${new Set(depths.map((d) => areaForDepth(d).kind)).size} kinds of area; three jumps across the camp gate announced ${announced}; ways, keys, jumps and difficulties as the tools use them`);
};
