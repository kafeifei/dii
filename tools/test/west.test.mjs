// The normal game (src/game/game.ts) on the West overworld, as a new game plays it. It starts in
// the camp on the overworld, a world of its own; out into Blood Moor, a town portal there and
// back, dying and the waypoints move the hero across the one map without rebuilding it, and coming
// into the camp restocks the merchant. The Den of Evil's mouth leads down to a map of its own, a
// cave with Corpsefire (D2's zombie1 superunique) in its far room; its way up comes out at the mouth,
// the overworld as it was left, and the Den is kept as it was too. Cold Plains' waypoint is activated
// by using it, in the difficulty played, and listed; another difficulty is another game, the
// overworld made anew in the same world, its monsters of that difficulty. Stony Field and the Burial
// Grounds are on the same map, gone to by waypoint as a jump: Stony Field's waypoint is activated by
// using it and saved, listed after Cold Plains'; of the ways under the west block, Cold Plains' Cave
// and the Burial Grounds' Crypt and Mausoleum are open (tools/test/entrances.test.mjs walks them),
// the one with no map yet, the Underground Passage in Stony Field's cliff, is closed, and using it
// says so once, naming it, and goes nowhere. Chests and barrels roll
// at their area's level. The trial ground's floors are the debug panel's alone. A new game, or one
// continued, makes a new world; a reload plays on in the saved one, in the area it was saved in
// (Stony Field too). A built dungeon's map is made once by its maker (Maps DUNGEON_MAKERS) from the
// world's seed and its Id (levelSeed), kept and forgotten with the rest.
const KEY = 'dii-save-v1';
const DT = 1 / 60;

export default async (load) => {
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS, DEN_OF_EVIL, CAVE_1, CRYPT, MAUSOLEUM, UNDERGROUND_PASSAGE: PASSAGE, areaDef, dungeonArea, isBuilt } = await load('/src/world/areas.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { BUILT } = await load('/src/world/overworld.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { monsterLootTc } = await load('/src/game/loot.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  localStorage.clear();
  const notes = { areas: [], levels: 0, jumps: 0, messages: [], panels: [] };
  // an input with nothing pressed and a picker that finds nothing, for game.update
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
  game.hooks = {
    message: (t) => notes.messages.push(t),
    openPanel: (k) => notes.panels.push(k),
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
  const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');

  // ── a new game: in the camp, on the overworld ──
  game.newGame('西块测试', 'paladin');
  let west = game.level;
  const ow = west.layout;
  const p = game.player;
  check(Array.isArray(ow.seams) && ow.areaOf, 'a new game is not on the overworld');
  check(game.area?.id === CAMP_AREA && west.inTown(p.pos) && notes.levels === 1, `a new game started in ${game.area?.key}, ${notes.levels} level(s) built`);
  check(!west.monsters.some((m) => west.inTown(m.pos)), 'monsters in the camp on a new game');
  check(p.waypoints.join() === String(CAMP_AREA), `a new hero's waypoints are ${p.waypoints.join()}`);
  check(saved()?.worldSeed === game.worldSeed && saved()?.area === CAMP_AREA, `saved world seed ${saved()?.worldSeed} (the game's ${game.worldSeed}) in area ${saved()?.area}`);
  // the overworld's areas are areas of normal play: the waypoint list and a save's resume go by isBuilt
  check(BUILT.every(isBuilt), `the overworld builds ${BUILT.join()}, not all of normal play's`);
  check(areaDef(CAMP_AREA).name === '流离者营寨' && areaDef(WILD_AREA).en === 'Bloodmire Heath' && areaDef(COLD_PLAINS).en === 'Bitterfrost Plains' && areaDef(DEN_OF_EVIL).en === 'Den of Iniquity', 'the areas are not named as the rename table has them');

  // out past the gate into Blood Moor
  const gate = ow.seams.find((s) => s.a === CAMP_AREA);
  const out = { x: gate.tb.x - gate.ta.x, z: gate.tb.z - gate.ta.z };
  let moor = null;
  for (let k = 6; k < 40 && !moor; k++) {
    const c = { x: gate.tb.x + out.x * k, z: gate.tb.z + out.z * k };
    if (ow.map.circleClear(c.x, c.z, 0.6) && west.areaAt(c.x, c.z).id === WILD_AREA) moor = c;
  }
  if (!moor) throw new Error('no open ground out past the camp gate');
  notes.areas = [];
  game.teleportWithin(moor);
  check(game.area.id === WILD_AREA, `past the gate the hero is in ${game.area.key}`);

  // ── a town portal from Blood Moor and back: one map, two jumps ──
  p.facing = 0;
  game.openTownPortal();
  const far = west.objects.find((o) => o.kind === 'portal');
  check(far && !west.inTown(far.pos) && far.dest === CAMP_AREA && game.portalLevel === west, 'no town portal opened in Blood Moor');
  const shop0 = game.shop;
  game.interact(far);
  const home = west.objects.find((o) => o.kind === 'portal' && west.inTown(o.pos));
  check(game.level === west && west.inTown(p.pos) && home?.dest === WILD_AREA && home.name.includes(areaDef(WILD_AREA).name), `through the portal the hero is in ${game.area?.key}, the camp's end leads to ${home?.dest} (${home?.name})`);
  check(game.shop !== shop0, 'coming into the camp by portal did not restock the merchant');
  game.interact(home);
  check(game.level === west && dist(p.pos, far.pos) < 2.5 && !west.objects.some((o) => o.kind === 'portal') && !game.portalLevel, `back through the camp's end: ${dist(p.pos, far.pos).toFixed(1)} from the portal, ${west.objects.filter((o) => o.kind === 'portal').length} portal(s) left`);
  // dying in Blood Moor: up again in the camp, on the same map
  game.respawn();
  check(game.level === west && west.inTown(p.pos), 'respawned off the overworld or outside the camp');
  // walking (put) out and back in: the merchant restocks as the hero comes in
  game.teleportWithin(moor);
  const shop1 = game.shop;
  game.teleportWithin(ow.start);
  check(game.shop !== shop1, 'walking into the camp did not restock the merchant');
  check(notes.levels === 1, `going about the overworld built ${notes.levels - 1} more level(s)`);
  check(notes.areas.join(' ') === 'camp>wild wild>camp camp>wild wild>camp camp>wild wild>camp', `going about announced ${notes.areas.join(' ')}`);

  // ── the Den of Evil: down its mouth, a map of its own, and back up to the mouth ──
  const mouth = west.objects.find((o) => o.kind === 'stairs' && o.dest === DEN_OF_EVIL);
  const cave = ow.entrances.find((e) => e.kind === 'cave');
  check(mouth && cave && dist(mouth.pos, cave) < 1e-6 && west.areaAt(mouth.pos.x, mouth.pos.z).id === WILD_AREA && !mouth.closed, 'no open way down at the Den of Evil in Blood Moor');
  // the other ways down: the Cave's and the crypts' open, their maps built; the Underground Passage's, with none, closed
  const others = west.objects.filter((o) => o.kind === 'stairs' && o.dest !== DEN_OF_EVIL);
  check(others.map((o) => o.dest).sort((a, b) => a - b).join() === [CAVE_1, PASSAGE, CRYPT, MAUSOLEUM].join() && others.every((o) => !!o.closed === (o.dest === PASSAGE)), `the overworld's other stairs: ${others.map((o) => `${o.dest}${o.closed ? ' closed' : ''}`).join(', ')}`);
  // one of Blood Moor's monsters killed before going down stays dead
  const victim = west.monsters.find((m) => !m.dead && west.areaAt(m.pos.x, m.pos.z).id === WILD_AREA);
  game.killMonster(victim, 'phys');
  const westMonsters = west.monsters;
  game.teleportWithin({ x: mouth.pos.x + mouth.inward.x * 2, z: mouth.pos.z + mouth.inward.z * 2 });
  game.interact(mouth);
  const den = game.level;
  check(den !== west && game.area.id === DEN_OF_EVIL && notes.levels === 2, `down the mouth: area ${game.area.key}, ${notes.levels} level(s) built`);
  check(['cave', 'grotto'].includes(den.layout.theme.key) && !den.objects.some((o) => o.kind === 'waypoint') && !den.layout.stairs, `the den is ${den.layout.theme.key}, waypoints ${den.objects.filter((o) => o.kind === 'waypoint').length}, stairs down ${!!den.layout.stairs}`);
  check(den.areas.every((a) => a === DEN_OF_EVIL), 'the den is not all the Den of Evil');
  const up = den.objects.find((o) => o.kind === 'stairs' && o.dest === WILD_AREA);
  check(up && dist(p.pos, up.pos) < 3.5, `the hero arrived ${up ? dist(p.pos, up.pos).toFixed(1) : '-'} from the den's way up`);
  // in normal each at its own row's level (zombie1 and fallen1 1, brute1 and fallenshaman1 2), of the den's kinds
  const normal = den.monsters.filter((m) => m.rank === 'normal');
  const denKinds = ['zombie1', 'brute1', 'fallenshaman1', 'fallen1'];
  check(normal.length > 5 && normal.every((m) => denKinds.includes(m.def.id) && m.level === m.def.row.diff[0].level), `the den has ${normal.length} normal monsters: ${[...new Set(normal.map((m) => `${m.def.id}@${m.level}`))].join()}`);
  const corpsefire = den.monsters.find((m) => m.rank === 'unique' && m.displayName === '尸焰');
  const su = den.layout.superUniques?.[0];
  check(corpsefire?.def.id === 'zombie1' && corpsefire.level === 4 && su && dist(corpsefire.pos, su.pos) < 1.5, `Corpsefire is ${corpsefire?.def.id} level ${corpsefire?.level} at ${corpsefire ? dist(corpsefire.pos, su?.pos ?? corpsefire.pos).toFixed(1) : '-'} from the far room's spot`);
  // it drops its superunique class (superuniques.json Corpsefire), its minions a plain zombie's
  check(su?.key === 'Corpsefire' && corpsefire?.superUnique === 'Corpsefire' && monsterLootTc(corpsefire, 0) === 'Act 1 Super A', `Corpsefire is ${corpsefire?.superUnique} and drops from ${corpsefire && monsterLootTc(corpsefire, 0)}`);
  const minion = den.monsters.find((m) => m.leader === corpsefire);
  check(minion && !minion.superUnique && monsterLootTc(minion, 0) === 'Act 1 H2H A', `Corpsefire's minion drops from ${minion && monsterLootTc(minion, 0)}`);
  check(den.monsters.filter((m) => m.leader === corpsefire).length === 5, `Corpsefire came with ${den.monsters.filter((m) => m.leader === corpsefire).length} minions, superuniques.json has 5`);
  check(su && dist(su.pos, den.layout.start) > 15, `Corpsefire waits ${su ? dist(su.pos, den.layout.start).toFixed(1) : '-'} from the den's start`);
  // a chest in the den rolls at the den's level: what its roll (src/game/loot.ts containerLoot)
  // drops is at it, tried until it drops something (a chest drops in 3 of 4, a barrel in 21 of 100)
  const levels = [];
  const roll = game.rollLoot.bind(game);
  game.rollLoot = (r) => {
    for (let k = 0; k < 100 && !levels.length; k++) for (const it of r({ mf: 0, gf: 0, difficulty: 0 })) levels.push(it.ilvl);
    return roll(r);
  };
  const denChest = den.objects.find((o) => o.kind === 'chest');
  if (denChest) {
    game.interact(denChest);
    check(levels.length && levels.every((l) => l === areaDef(DEN_OF_EVIL).alvl[0]), `a chest in the den rolled at levels ${levels.join()}`);
  }
  // up and out: at the mouth, the overworld as it was
  game.interact(up);
  check(game.level === west && west.monsters === westMonsters && victim.dead && game.area.id === WILD_AREA && dist(p.pos, mouth.pos) < 3.5, `up out of the den: on the overworld ${game.level === west}, the dead stay dead ${victim.dead}, ${dist(p.pos, mouth.pos).toFixed(1)} from the mouth`);
  game.interact(mouth);
  check(game.level === den && notes.levels === 4, `down again, the den is ${game.level === den ? 'as it was' : 'made anew'}`);
  // a town portal from the den: into the camp on the overworld, and back down
  game.openTownPortal();
  game.interact(den.objects.find((o) => o.kind === 'portal'));
  const camp = west.objects.find((o) => o.kind === 'portal' && west.inTown(o.pos));
  check(game.level === west && west.inTown(p.pos) && camp?.dest === DEN_OF_EVIL, `through the den's portal: in town ${west.inTown(p.pos)}, the camp's end leads to ${camp?.dest}`);
  game.interact(camp);
  check(game.level === den && !den.objects.some((o) => o.kind === 'portal') && !west.objects.some((o) => o.kind === 'portal'), 'back through the portal: not in the den, or a portal left open');
  game.interact(up);

  // ── Cold Plains' waypoint: used, it is activated and listed; travel by it is a jump ──
  const wp = west.objects.find((o) => o.kind === 'waypoint' && west.areaAt(o.pos.x, o.pos.z).id === COLD_PLAINS);
  if (!wp) throw new Error("no waypoint in Cold Plains");
  check(!game.travel(PASSAGE) && !game.travel(5), 'travel to an area with no map went somewhere');
  const jumps = notes.jumps;
  check(game.travel(COLD_PLAINS) && game.area.id === COLD_PLAINS && dist(p.pos, wp.pos) < 2.5 && notes.jumps === jumps + 1, `the tools' way to Cold Plains: ${game.area.key}, ${dist(p.pos, wp.pos).toFixed(1)} from its waypoint`);
  check(p.waypoints.join() === String(CAMP_AREA), `going there touched its waypoint: ${p.waypoints.join()}`);
  notes.messages = [];
  game.interact(wp);
  check(p.waypoints.join() === `${CAMP_AREA},${COLD_PLAINS}` && notes.messages.includes('传送点已激活') && notes.panels.at(-1) === 'waypoint', `using Cold Plains' waypoint: waypoints ${p.waypoints.join()}, said ${notes.messages.join(' / ')}`);
  check(saved().progress[0].waypoints.includes(COLD_PLAINS), `Cold Plains' waypoint saved as ${JSON.stringify(saved().progress)}`);
  game.interact(wp);
  check(notes.messages.filter((t) => t === '传送点已激活').length === 1, 'the waypoint was activated twice');
  const built = notes.levels;
  game.travel(CAMP_AREA);
  const campWp = west.objects.find((o) => o.kind === 'waypoint' && west.inTown(o.pos));
  check(game.level === west && west.inTown(p.pos) && dist(p.pos, campWp.pos) < 2.5, `by waypoint to the camp: in town ${west.inTown(p.pos)}, ${dist(p.pos, campWp.pos).toFixed(1)} from its waypoint`);
  game.travel(COLD_PLAINS);
  check(game.area.id === COLD_PLAINS && notes.levels === built, `by waypoint to Cold Plains: ${game.area.key}, ${notes.levels - built} level(s) built`);
  // in nightmare only the camp's; back in normal, Cold Plains' again. Each is another game: the
  // overworld made anew in the same world, the hero at the camp's waypoint, its monsters of the difficulty
  game.setDifficulty(1);
  check(p.waypoints.join() === String(CAMP_AREA) && saved().progress[1].waypoints.join() === String(CAMP_AREA), `nightmare's waypoints ${p.waypoints.join()}`);
  const nm = game.level;
  const nmWp = nm.objects.find((o) => o.kind === 'waypoint' && nm.inTown(o.pos));
  check(nm !== west && nm.difficulty === 1 && nm.layout.seed === ow.seed && game.area.id === CAMP_AREA && dist(p.pos, nmWp.pos) < 2.5, `nightmare: a new overworld ${nm !== west}, its difficulty ${nm.difficulty}, the hero in ${game.area.key}, ${dist(p.pos, nmWp.pos).toFixed(1)} from the camp's waypoint`);
  const nmBlood = nm.monsters.filter((m) => m.rank === 'normal' && nm.areaAt(m.pos.x, m.pos.z).id === WILD_AREA);
  check(nmBlood.length && nmBlood.every((m) => m.level === areaDef(WILD_AREA).alvl[1]), `nightmare's Blood Moor monsters at levels ${[...new Set(nmBlood.map((m) => m.level))].join()}`);
  game.setDifficulty(0);
  check(p.waypoints.join() === `${CAMP_AREA},${COLD_PLAINS}`, `back in normal the waypoints are ${p.waypoints.join()}`);
  west = game.level;
  check(west.difficulty === 0 && west !== nm, 'back in normal on the nightmare overworld');

  // ── Stony Field and the Burial Grounds: on this map, gone to by waypoint as a jump ──
  check(west.objects.every((o) => o.kind !== 'exit'), `the overworld has exits: ${west.objects.filter((o) => o.kind === 'exit').map((o) => o.dest).join()}`);
  const builtBefore = notes.levels;
  const stonyWp = west.objects.find((o) => o.kind === 'waypoint' && west.areaAt(o.pos.x, o.pos.z).id === STONY_FIELD);
  check(!!stonyWp && !west.objects.some((o) => o.kind === 'waypoint' && west.areaAt(o.pos.x, o.pos.z).id === BURIAL_GROUNDS), 'Stony Field has no waypoint, or the Burial Grounds have one');
  check(game.travel(BURIAL_GROUNDS) && game.area.id === BURIAL_GROUNDS && game.level === west, `the tools' way to the Burial Grounds: ${game.area.key}`);
  check(game.travel(STONY_FIELD) && game.area.id === STONY_FIELD && game.level === west && notes.levels === builtBefore && dist(p.pos, stonyWp.pos) < 2.5, `the tools' way to Stony Field: ${game.area.key}, ${notes.levels - builtBefore} level(s) built, ${dist(p.pos, stonyWp.pos).toFixed(1)} from its waypoint`);
  notes.messages = [];
  game.interact(stonyWp);
  check(p.waypoints.join() === `${CAMP_AREA},${COLD_PLAINS},${STONY_FIELD}` && notes.messages.includes('传送点已激活') && saved().progress[0].waypoints.includes(STONY_FIELD), `using Stony Field's waypoint: waypoints ${p.waypoints.join()}, saved ${JSON.stringify(saved().progress[0].waypoints)}`);

  // ── the ways under the west block: each in its area, named for where it goes (the rename table's
  // names, the Underground Passage's too: areas.ts defines it); the built ones' the tools' way there,
  // the one with no map yet closed, used it says so once, naming it, and goes nowhere ──
  for (const dest of [CAVE_1, PASSAGE, CRYPT, MAUSOLEUM]) {
    const o = west.objects.find((x) => x.kind === 'stairs' && x.dest === dest);
    const name = areaDef(dest)?.name;
    if (!o) {
      problems.push(`no way to area ${dest}`);
      continue;
    }
    const area = west.areaAt(o.pos.x, o.pos.z).id;
    const shut = !isBuilt(dest);
    check(name === D2X_AREAS.find((a) => a.id === dest).name && !!o.closed === shut && o.name === `通往${name}` && area === (dest === CAVE_1 ? COLD_PLAINS : dest === PASSAGE ? STONY_FIELD : BURIAL_GROUNDS), `the way to area ${dest}: ${o.name}, closed ${o.closed}, in area ${area}`);
    check(shut ? west.wayTo(dest, p.pos) === null : west.wayTo(dest, p.pos)?.obj === o, `the way the tools find to area ${dest}: ${JSON.stringify(west.wayTo(dest, p.pos)?.pos)}`);
    if (!shut) continue;
    game.teleportWithin(west.layout.map.nearestWalkable(o.pos.x + o.inward.x * 1.5, o.pos.z + o.inward.z * 1.5));
    notes.messages = [];
    const built = notes.levels;
    game.interact(o);
    game.interact(o);
    check(game.level === west && game.area.id === area && notes.levels === built && notes.messages.join() === `通往${name}的路还没有开通`, `using the closed way to area ${dest}: said ${notes.messages.join(' / ') || 'nothing'}, in ${game.area.key}, ${notes.levels - built} level(s) built`);
  }
  game.travel(COLD_PLAINS);

  // ── chests and barrels at their area's level ──
  for (const [kind, area] of [['chest', COLD_PLAINS], ['barrel', WILD_AREA], ['chest', WILD_AREA]]) {
    const o = west.objects.find((x) => x.kind === kind && !x.used && west.areaAt(x.pos.x, x.pos.z).id === area);
    if (!o) continue;
    levels.length = 0;
    game.interact(o);
    check(levels.length && levels.every((l) => l === areaDef(area).alvl[0]), `a ${kind} in ${areaDef(area).key} rolled at levels ${levels.join()}`);
  }

  // ── what fits nowhere is laid by the stash once, however often the hero comes into the camp ──
  const ring = createItem('rin');
  p.unplaced = [ring];
  game.travel(CAMP_AREA);
  game.travel(COLD_PLAINS);
  game.travel(CAMP_AREA);
  check(west.ground.filter((g) => g.item === ring).length === 1, `the unplaced ring lies by the stash ${west.ground.filter((g) => g.item === ring).length} times`);
  game.rollLoot = roll;

  // ── the trial ground: the debug panel's floors, new each time, no waypoint touched ──
  game.enterTrial(3);
  const t1 = game.level;
  check(game.area.key === 'floor3' && t1 !== west && p.waypoints.join() === `${CAMP_AREA},${COLD_PLAINS},${STONY_FIELD}`, `the trial ground's floor 3: ${game.area.key}, waypoints ${p.waypoints.join()}`);
  game.enterTrial(3);
  check(game.level !== t1 && game.area.key === 'floor3', 'the trial ground gave the same floor again');
  const stairs = game.level.objects.find((o) => o.kind === 'stairs');
  check(stairs?.dest === dungeonArea(4), `the trial floor's stairs lead to area ${stairs?.dest}`);
  game.travel(CAMP_AREA);
  check(game.level === west && west.inTown(p.pos), 'by waypoint from the trial ground the hero is not in the camp');
  // in another difficulty from the camp: that game's floor, made once; changed on a floor, a new floor there
  const builtNow = notes.levels;
  game.enterTrial(3, 1);
  check(notes.levels === builtNow + 1 && game.level.difficulty === 1 && p.difficulty === 1 && game.area.key === 'floor3', `the trial ground in nightmare: ${notes.levels - builtNow} level(s) built, difficulty ${game.level.difficulty}`);
  game.setDifficulty(0);
  check(notes.levels === builtNow + 2 && game.level.difficulty === 0 && game.area.key === 'floor3', `back in normal on the trial floor: ${notes.levels - builtNow} level(s) built, in ${game.area.key}`);
  game.travel(CAMP_AREA);
  west = game.level;

  // ── a world a game: a new one each game and each continue, the saved one on a reload ──
  const seed = game.worldSeed;
  game.travel(COLD_PLAINS);
  game.save();
  game.continueGame(0, true);
  check(game.worldSeed === seed && game.area.id === COLD_PLAINS && game.level.layout.seed === ow.seed, `reloaded: seed ${game.worldSeed} (was ${seed}), in ${game.area.key}`);
  check(game.level !== west && game.player.waypoints.join() === `${CAMP_AREA},${COLD_PLAINS},${STONY_FIELD}`, 'reloaded on the old level, or the waypoints are lost');
  // saved in Stony Field, a reload plays on there, in the same world, its waypoint kept
  game.travel(STONY_FIELD);
  game.save();
  check(saved().area === STONY_FIELD, `saved in Stony Field as area ${saved().area}`);
  game.continueGame(0, true);
  check(game.worldSeed === seed && game.area.id === STONY_FIELD && game.level.layout.seed === ow.seed && game.player.waypoints.includes(STONY_FIELD), `reloaded from Stony Field: seed ${game.worldSeed} (was ${seed}), in ${game.area.key}, waypoints ${game.player.waypoints.join()}`);
  // and in the Burial Grounds (no waypoint there): beside where it starts, on the overworld
  game.travel(BURIAL_GROUNDS);
  game.save();
  game.continueGame(0, true);
  check(game.area.id === BURIAL_GROUNDS && game.level.layout.seed === ow.seed, `reloaded from the Burial Grounds: in ${game.area.key}`);
  game.continueGame(0);
  check(game.worldSeed !== seed && game.area.id === CAMP_AREA && game.player.waypoints.includes(COLD_PLAINS) && game.player.waypoints.includes(STONY_FIELD), `continued: seed ${game.worldSeed} (was ${seed}), in ${game.area.key}, waypoints ${game.player.waypoints.join()}`);
  const s2 = game.worldSeed;
  game.newGame('又一个', 'sorceress');
  check(game.worldSeed !== s2 && game.player.waypoints.join() === String(CAMP_AREA), 'a new game kept the last world, or its waypoints');

  // ── the dungeons' makers (docs/M2A-STEP0.md 2.10): a built dungeon's map made once, by its maker,
  // from the world's seed and its Id (levelSeed), in the difficulty played; kept with the rest and
  // forgotten with them. Every one of the west's, the Den's among them (tools/test/dungeons.test.mjs
  // plays them) ──
  {
    const M = await load('/src/game/maps.ts');
    const { BUILT_DUNGEONS } = await load('/src/world/built-dungeons.ts');
    const { CAVE_1 } = await load('/src/world/areas.ts');
    check(M.levelSeed(0xffffffff, 9) === 8 && M.levelSeed(1000, 18) === 1018, `levelSeed: ${M.levelSeed(0xffffffff, 9)}, ${M.levelSeed(1000, 18)}`);
    // the quests' word on the hireling (QuestHost), stubs until she is played
    check(game.hasMerc() === false && game.giveFreeMerc() === false, 'hasMerc or giveFreeMerc is not the stub');
    check(Object.keys(M.DUNGEON_MAKERS).join() === '8,9,13,18,19' && BUILT_DUNGEONS.join() === '8,9,13,18,19', `the makers: ${Object.keys(M.DUNGEON_MAKERS)}, built ${BUILT_DUNGEONS}`);
    const made = [];
    const real = M.DUNGEON_MAKERS[CAVE_1];
    M.DUNGEON_MAKERS[CAVE_1] = (seed, d) => {
      made.push([seed, d]);
      return real(seed, d);
    };
    const maps = new M.Maps(game);
    const at = BUILT_DUNGEONS.indexOf(CAVE_1);
    try {
      BUILT_DUNGEONS.splice(at, 1);
      check(!maps.hasMap(CAVE_1) && maps.levelFor(CAVE_1) === null, 'a dungeon not built has a map');
      BUILT_DUNGEONS.splice(at, 0, CAVE_1);
      const L = maps.levelFor(CAVE_1);
      check(!!L && maps.levelFor(CAVE_1) === L && maps.mapOf(CAVE_1) === L && maps.kept().includes(L), 'a built dungeon was not made once and kept');
      check(made.length === 1 && made[0][0] === M.levelSeed(game.worldSeed, CAVE_1) && made[0][1] === game.player.difficulty, `the maker was given ${JSON.stringify(made)}, the world's seed ${game.worldSeed}`);
      const den = maps.levelFor(DEN_OF_EVIL);
      check(!!den && maps.mapOf(DEN_OF_EVIL) === den && maps.kept().includes(den), 'the Den is not one of the dungeons kept');
      maps.forget();
      check(maps.mapOf(CAVE_1) === null && maps.mapOf(DEN_OF_EVIL) === null && !maps.kept().includes(L), 'a dungeon kept past forget()');
    } finally {
      M.DUNGEON_MAKERS[CAVE_1] = real;
      if (!BUILT_DUNGEONS.includes(CAVE_1)) BUILT_DUNGEONS.splice(at, 0, CAVE_1);
    }
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  camp → Blood Moor → the Den and back, portals both ways, a respawn and waypoints on one map (${notes.levels} levels built in all); Cold Plains' and Stony Field's waypoints activated by use; the ways down open where built, the Underground Passage's refused by name; a world a game, kept on a reload (Stony Field and the Burial Grounds too); a built dungeon made once from levelSeed by its maker`);
};
