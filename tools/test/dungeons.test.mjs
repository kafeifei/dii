// The west's dungeons in the game (src/game/maps.ts DUNGEON_MAKERS, src/world/dungeons.ts, maze.ts):
// the Den of Evil, Cave Levels 1 and 2, the Crypt and the Mausoleum each built as a Level of its own
// from its level's seed (levelSeed: the world's + its Id), the same map for the same world and again
// on a reload, the Crypt's never the Mausoleum's; their stairs both ways where levels.json's warps
// go (the Den to Blood Moor, Cave Level 1 to Cold Plains and down to Cave Level 2 and back, the crypts
// up to the Burial Grounds, closed while it isn't built); the crypts 12, 24 and 36 rooms (and their
// specials) by difficulty, the Den D2's three-room L; caves lit by the hero alone (no torches, no lit
// props or wall pieces), crypts with torches; the spark chests by 580 and 397; D2's objects carried
// through the Layout into the Level; each map, monsters and all, made within 200 ms.
const SLOW_MS = 200;
const WORLDS = [1, 77, 4242, 0x5eed2a, 2026];

export default async (load) => {
  const A = await load('/src/world/areas.ts');
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, BURIAL_GROUNDS, DEN_OF_EVIL, CAVE_1, CAVE_2, CRYPT, MAUSOLEUM, isBuilt } = A;
  const M = await load('/src/game/maps.ts');
  const { dungeonLayout, dungeonSpec } = await load('/src/world/dungeons.ts');
  const { THEMES } = await load('/src/world/levelgen.ts');
  const { PROP_DEFS } = await load('/src/world/furnish.ts');
  const { D2X_OBJECTS } = await load('/src/data/d2x/objects.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const tiles = (L) => Array.from(L.layout.map.tiles).join('');
  const notes = [];
  const DUNGEONS = [DEN_OF_EVIL, CAVE_1, CAVE_2, CRYPT, MAUSOLEUM];

  localStorage.clear();
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
  const messages = [];
  game.hooks = {
    message: (t) => messages.push(t),
    openPanel() {},
    levelChanged() {},
    areaChanged() {},
    teleported() {},
    playerDied() {},
    inventoryChanged() {},
    getCursorItem: () => null,
    setCursorItem() {},
    hoveredGroundId: () => null,
    levelUp() {},
  };
  game.newGame('地下城', 'paladin');
  const p = game.player;

  // ── every dungeon built, a maker each, all of them areas of normal play ──
  check(DUNGEONS.every((id) => isBuilt(id) && typeof M.DUNGEON_MAKERS[id] === 'function'), `built: ${DUNGEONS.filter(isBuilt)}, makers: ${Object.keys(M.DUNGEON_MAKERS)}`);
  check(A.areaList().map((a) => a.id).join() === '1,2,3,8,9,13,18,19', `the areas of normal play: ${A.areaList().map((a) => a.id)}`);

  // ── each map: made from its level's seed, of its area all over, in its look, timed ──
  const times = new Map();
  for (const world of WORLDS) {
    game.newWorld(world);
    for (const id of DUNGEONS) {
      const t = performance.now();
      const L = game.maps.levelFor(id);
      const ms = performance.now() - t;
      times.set(id, Math.max(times.get(id) ?? 0, ms));
      const what = `area ${id} in world ${world}`;
      if (!L) {
        problems.push(`${what}: no map`);
        continue;
      }
      check(game.maps.levelFor(id) === L && game.mapOf(id) === L && game.maps.kept().includes(L), `${what}: not made once and kept`);
      const own = dungeonLayout(id, M.levelSeed(world, id), 0);
      check(tiles(L) === Array.from(own.map.tiles).join(''), `${what}: not the maze of its level's seed ${M.levelSeed(world, id)}`);
      check(L.areas.every((a) => a === id) && L.areaAt(L.layout.start.x, L.layout.start.z).id === id, `${what}: tiles of another area`);
      check(L.layout.theme === dungeonSpec(id, 1, 0).theme, `${what}: the look ${L.layout.theme.key}`);
      check(!L.objects.some((o) => o.kind === 'waypoint'), `${what}: a waypoint`);
      check(L.monsters.length > 5, `${what}: ${L.monsters.length} monsters`);
    }
    // two levels of one world never share a map: the Crypt and the Mausoleum are one maze row
    check(tiles(game.mapOf(CRYPT)) !== tiles(game.mapOf(MAUSOLEUM)), `world ${world}: the Crypt is the Mausoleum`);
  }
  for (const [id, ms] of times) check(ms < SLOW_MS, `area ${id}: ${ms.toFixed(0)} ms for its map`);
  notes.push(`maps in ${[...times].map(([id, ms]) => `${id} ${ms.toFixed(0)}`).join(', ')} ms at most`);

  // the same world, the same maps: another game in it, and a reload
  game.newWorld(4242);
  const first = new Map(DUNGEONS.map((id) => [id, tiles(game.maps.levelFor(id))]));
  game.newWorld(4242);
  check(DUNGEONS.every((id) => tiles(game.maps.levelFor(id)) === first.get(id)), 'the same world made other dungeons');
  game.newWorld(4243);
  check(DUNGEONS.filter((id) => id !== CAVE_2).every((id) => tiles(game.maps.levelFor(id)) !== first.get(id)), 'another world made the same dungeons');

  // ── the looks: caves lit by the hero alone, crypts by torches ──
  game.newWorld(77);
  for (const id of DUNGEONS) {
    const L = game.maps.levelFor(id).layout;
    const cave = dungeonSpec(id, 1, 0).style === 'cave';
    const lit = L.props.filter((x) => x.light || PROP_DEFS[x.model]?.light).length + L.wallDecor.filter((w) => w.light).length;
    if (cave) {
      check(L.theme === THEMES.grotto && !L.torches.length && !lit && !L.decor.some((d) => d.kind === 'campfire' || d.kind === 'crystal'), `area ${id}: ${L.torches.length} torches, ${lit} lit props, look ${L.theme.key}`);
    } else check(L.theme === THEMES.crypt && L.torches.length > 0, `area ${id}: ${L.torches.length} torches in a crypt`);
  }
  // the grotto is drawn with the caves' tiles until its own come (levelgen.ts GROTTO_TILES)
  const { GROTTO_TILES } = await load('/src/world/levelgen.ts');
  check(THEMES.grotto.key === (GROTTO_TILES ? 'grotto' : 'cave') && THEMES.grotto.name === '石窟', `the grotto theme: ${THEMES.grotto.key} ${THEMES.grotto.name}`);

  // ── the objects: what D2 rolled for them, on the Level ──
  {
    const c2 = game.maps.levelFor(CAVE_2);
    const spark = c2.objects.filter((o) => o.kind === 'chest' && o.sparkly);
    check(spark.length === 1 && spark[0].sparkly === 'unique' && D2X_OBJECTS[580].becomes.includes(spark[0].d2), `Cave Level 2's spark chests: ${JSON.stringify(spark.map((o) => [o.sparkly, o.d2]))}`);
    const mau = game.maps.levelFor(MAUSOLEUM);
    const cons = mau.objects.filter((o) => o.kind === 'chest' && o.sparkly);
    const room = mau.layout.presets.find((r) => r.kind === 'treasure');
    const inside = (q, r) => q.x >= r.x && q.x < r.x + r.w && q.z >= r.y && q.z < r.y + r.h;
    check(cons.length === 1 && cons[0].sparkly === 'consolation' && cons[0].d2 === 397 && room && inside(cons[0].pos, room.rect), `the Mausoleum's spark chests: ${JSON.stringify(cons.map((o) => [o.sparkly, o.d2]))}`);
    for (const id of [DEN_OF_EVIL, CAVE_1, CRYPT]) check(!game.maps.levelFor(id).objects.some((o) => o.sparkly), `area ${id}: a spark chest`);
    // every object of the Layout is on the Level, with its D2 row
    for (const id of DUNGEONS) {
      const L = game.maps.levelFor(id);
      const lay = L.layout;
      const count = (k) => L.objects.filter((o) => o.kind === k).length;
      const want = { chest: lay.chests.length, barrel: lay.barrels.length, shrine: lay.shrines.length, casket: lay.caskets.length, remains: lay.remains.length, well: lay.wells.length };
      const got = Object.fromEntries(Object.keys(want).map((k) => [k, count(k)]));
      check(JSON.stringify(got) === JSON.stringify(want), `area ${id}: objects ${JSON.stringify(got)}, the Layout ${JSON.stringify(want)}`);
      check(L.objects.filter((o) => ['chest', 'barrel', 'casket', 'remains', 'well'].includes(o.kind)).every((o) => D2X_OBJECTS[o.d2]), `area ${id}: an object without its Objects.txt row`);
    }
    const cave = game.maps.levelFor(CAVE_1);
    const crypt = game.maps.levelFor(CRYPT);
    notes.push(`objects: Cave Level 1 ${cave.layout.remains.length} corpses, ${cave.layout.wells.length} wells, ${cave.layout.chests.length} chests; the Crypt ${crypt.layout.caskets.length} caskets, ${crypt.layout.chests.length} chests, ${crypt.layout.barrels.length} barrels, ${crypt.layout.shrines.length} shrines`);
  }

  // ── rooms by difficulty: the crypts LvlMaze's 12, 24, 36 and their two specials; the Den the L ──
  for (const d of [0, 1, 2]) {
    if (d !== p.difficulty) game.switchDifficulty(d);
    for (const id of [CRYPT, MAUSOLEUM]) {
      const L = game.maps.levelFor(id);
      const n = L.layout.rooms.length;
      check(L.difficulty === d && n >= 12 * (d + 1) && n <= 12 * (d + 1) + 2, `area ${id} in difficulty ${d}: ${n} rooms`);
    }
    const den = game.maps.levelFor(DEN_OF_EVIL).layout;
    const [a, b, c] = den.rooms.map((r) => ({ x: r.x + r.w / 2, z: r.y + r.h / 2 }));
    const line = (a.x === b.x && b.x === c.x) || (a.z === b.z && b.z === c.z);
    check(den.rooms.length === 3 && !line, `the Den in difficulty ${d}: ${den.rooms.length} rooms${line ? ' in a line' : ''}`);
    if (d === 0) notes.push(`the crypts ${game.maps.levelFor(CRYPT).layout.rooms.length}/${game.maps.levelFor(MAUSOLEUM).layout.rooms.length} rooms in normal`);
  }
  game.switchDifficulty(0);

  // ── the stairs both ways ──
  game.newWorld(0x5eed2a);
  game.enterArea(CAMP_AREA, 'start');
  check(game.travelToArea(CAVE_1) && game.area.id === CAVE_1, `the tools' way to Cave Level 1: area ${game.area.id}`);
  const c1 = game.level;
  const up1 = c1.objects.find((o) => o.kind === 'stairs' && o.dest === COLD_PLAINS);
  const down1 = c1.objects.find((o) => o.kind === 'stairs' && o.dest === CAVE_2);
  check(up1 && !up1.closed && down1 && !down1.closed && dist(p.pos, up1.pos) < 3.5, `Cave Level 1's ways: up ${!!up1}, down ${!!down1}, the hero ${up1 ? dist(p.pos, up1.pos).toFixed(1) : '-'} from the way up`);
  game.interact(down1);
  const c2 = game.level;
  const up2 = c2.objects.find((o) => o.kind === 'stairs' && o.dest === CAVE_1);
  check(game.area.id === CAVE_2 && up2 && dist(p.pos, up2.pos) < 3.5, `down from Cave Level 1: area ${game.area.id}, ${up2 ? dist(p.pos, up2.pos).toFixed(1) : '-'} from the way back up`);
  check(!c2.objects.some((o) => o.kind === 'stairs' && o.dest !== CAVE_1), 'Cave Level 2 has another way out');
  game.interact(up2);
  check(game.level === c1 && game.area.id === CAVE_1 && dist(p.pos, down1.pos) < 3.5, `back up: the same Cave Level 1 ${game.level === c1}, ${dist(p.pos, down1.pos).toFixed(1)} from its way down`);
  game.interact(down1);
  check(game.level === c2, 'Cave Level 2 made anew on the way back down');
  game.interact(up2);
  // up out of the Cave: onto the overworld in Cold Plains (its mouth there is the W line's)
  game.interact(up1);
  check(game.area.id === COLD_PLAINS && game.level === game.mapOf(CAMP_AREA), `up out of the Cave: area ${game.area.id}`);
  // the Den's way up, to Blood Moor at its mouth
  game.travelToArea(DEN_OF_EVIL);
  const denUp = game.level.objects.find((o) => o.kind === 'stairs' && o.dest === WILD_AREA);
  check(denUp && !denUp.closed && dist(p.pos, denUp.pos) < 3.5, `the Den's way up: ${!!denUp}, the hero ${denUp ? dist(p.pos, denUp.pos).toFixed(1) : '-'} from it`);
  game.interact(denUp);
  const mouth = game.level.objects.find((o) => o.kind === 'stairs' && o.dest === DEN_OF_EVIL);
  check(game.area.id === WILD_AREA && mouth && dist(p.pos, mouth.pos) < 3.5, `up out of the Den: area ${game.area.id}, ${mouth ? dist(p.pos, mouth.pos).toFixed(1) : '-'} from its mouth`);
  // the crypts' ways up lead to the Burial Grounds, closed while it isn't built
  for (const id of [CRYPT, MAUSOLEUM]) {
    game.travelToArea(id);
    const L = game.level;
    const up = L.objects.find((o) => o.kind === 'stairs' && o.dest === BURIAL_GROUNDS);
    check(game.area.id === id && up && !!up.closed === !isBuilt(BURIAL_GROUNDS) && dist(p.pos, up.pos) < 3.5, `area ${id}: its way up ${up ? `to ${up.dest}, closed ${!!up.closed}` : 'missing'}, the hero ${up ? dist(p.pos, up.pos).toFixed(1) : '-'} from it`);
    if (up?.closed) {
      game.interact(up);
      check(game.level === L && messages.at(-1)?.includes('还没有开通'), `area ${id}: the closed way up went somewhere, or said ${messages.at(-1)}`);
    }
  }

  // ── saved in the Crypt, reloaded: the same Crypt, the hero in it ──
  game.travelToArea(CRYPT);
  const before = tiles(game.level);
  game.save();
  check(game.continueGame(undefined, true) && game.area.id === CRYPT && tiles(game.level) === before, `reloaded in the Crypt: area ${game.area.id}, the same map ${tiles(game.level) === before}`);
  game.enterArea(CAMP_AREA, 'waypoint');

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(`  ${DUNGEONS.length} dungeons in ${WORLDS.length} worlds from their levels' seeds; ${notes.join('; ')}; stairs both ways, the crypts' closed to the unbuilt Burial Grounds; a reload in the Crypt finds it again`);
};
