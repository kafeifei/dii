// The west block's ways down joined to its dungeons (the W line's mouths and stairways on the
// overworld, the D line's maps under them: src/world/zone.ts, presets.ts layGraveyard, maze.ts, Level
// entrances, travel.ts arrival). In a few worlds, from the camp: across the overworld to Cold Plains'
// Cave, down into Cave Level 1, on down into Cave Level 2, back up through Cave Level 1 and out at
// the mouth, then home; across to the Burial Grounds, down the Crypt's stairway and up again, down the
// Mausoleum's and up again, then home. Every way used lands the hero beside the way back (the one
// that leads where they came from, nearer it than any other way there), on the map kept from before;
// the overworld is never rebuilt. Stony Field's mouth into the Underground Passage, an area with no
// map, refuses by name and goes nowhere.
const WORLDS = [1, 77, 0x5eed2a];
/** how near the way back a hero coming through a way lands (travel.ts arrival: its radius and 1.6 m in) */
const BESIDE = 3.5;

export default async (load) => {
  const { CAMP_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS, CAVE_1, CAVE_2, CRYPT, MAUSOLEUM, UNDERGROUND_PASSAGE, areaDef, routeTo } = await load('/src/world/areas.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // the graph the walk follows (areas.ts routeTo over the built areas)
  const route = (a, b) => routeTo(a, b)?.join() ?? 'none';
  check(route(CAMP_AREA, CAVE_2) === '1,2,3,9,13' && route(CAMP_AREA, CRYPT) === '1,2,3,17,18' && route(CAMP_AREA, MAUSOLEUM) === '1,2,3,17,19' && route(CAMP_AREA, UNDERGROUND_PASSAGE) === 'none', `routeTo: 1→13 ${route(1, 13)}, 1→18 ${route(1, 18)}, 1→19 ${route(1, 19)}, 1→10 ${route(1, 10)}`);

  localStorage.clear();
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
  const notes = { levels: 0, messages: [] };
  game.hooks = {
    message: (t) => notes.messages.push(t),
    openPanel() {},
    levelChanged: () => notes.levels++,
    areaChanged() {},
    teleported() {},
    playerDied() {},
    inventoryChanged() {},
    getCursorItem: () => null,
    setCursorItem() {},
    hoveredGroundId: () => null,
    levelUp() {},
  };
  game.newGame('入口', 'paladin');
  const p = game.player;
  let trips = 0;

  for (const seed of WORLDS) {
    game.newWorld(seed);
    game.enterArea(CAMP_AREA, 'start');
    const west = game.level;
    const w = `world ${seed}`;
    check(game.area.id === CAMP_AREA && west === game.mapOf(COLD_PLAINS) && west === game.mapOf(BURIAL_GROUNDS), `${w}: not in the camp on the overworld`);
    const built = notes.levels;
    /** the way on the hero's map that leads to `dest` */
    const way = (dest) => game.level.objects.find((o) => (o.kind === 'stairs' || o.kind === 'exit') && o.dest === dest);
    /** walked (put) on the overworld to a step in front of its way down to `dest`, in area `area` */
    const before = (dest, area) => {
      const o = way(dest);
      if (!check(o && !o.closed, `${w}: no open way to area ${dest} on the overworld`)) return null;
      game.teleportWithin(west.map.nearestWalkable(o.pos.x + o.inward.x * 2, o.pos.z + o.inward.z * 2));
      check(game.level === west && game.area.id === area, `${w}: in front of the way to area ${dest} the hero is in ${game.area.key}, not area ${area}`);
      return o;
    };
    /**
     * `o` used: the hero is in area `to` on `map` (when given), beside the way there back to `from`,
     * nearer it than any other way on that map
     */
    const through = (o, to, from, map) => {
      game.interact(o);
      trips++;
      const back = way(from);
      const d = back ? dist(p.pos, back.pos) : Infinity;
      const nearest = game.level.objects.filter((x) => x.kind === 'stairs' || x.kind === 'exit').every((x) => x === back || dist(p.pos, x.pos) > d);
      check(game.area.id === to && (!map || game.level === map) && back && !back.closed && d < BESIDE && nearest, `${w}: through the way from area ${from} to ${to}: in ${game.area.key}${map && game.level !== map ? ' on another map' : ''}, ${d.toFixed(1)} from the way back${nearest ? '' : ', another way nearer'}`);
      return back;
    };
    const home = () => {
      game.teleportWithin(west.layout.start);
      check(game.area.id === CAMP_AREA && game.level === west, `${w}: not home in the camp`);
    };

    // ── Cold Plains' Cave: down two levels and back out at its mouth ──
    const mouth = before(CAVE_1, COLD_PLAINS);
    if (mouth) {
      const up1 = through(mouth, CAVE_1, COLD_PLAINS);
      const cave1 = game.level;
      check(cave1 !== west && cave1.areas.every((a) => a === CAVE_1), `${w}: Cave Level 1 is not a map of its own`);
      const down1 = way(CAVE_2);
      if (check(down1 && !down1.closed, `${w}: Cave Level 1 has no open way down`)) {
        const up2 = through(down1, CAVE_2, CAVE_1);
        const cave2 = game.level;
        check(cave2 !== cave1 && cave2.areas.every((a) => a === CAVE_2), `${w}: Cave Level 2 is not a map of its own`);
        through(up2, CAVE_1, CAVE_2, cave1);
      }
      if (up1) through(up1, COLD_PLAINS, CAVE_1, west);
      // and down again: the same Cave Level 1
      through(mouth, CAVE_1, COLD_PLAINS, cave1);
      if (up1) through(up1, COLD_PLAINS, CAVE_1, west);
    }
    home();

    // ── the Burial Grounds: down each stairway and up again beside it, not the other ──
    for (const dest of [CRYPT, MAUSOLEUM]) {
      const stair = before(dest, BURIAL_GROUNDS);
      if (!stair) continue;
      const up = through(stair, dest, BURIAL_GROUNDS);
      const crypt = game.level;
      check(crypt !== west && crypt.areas.every((a) => a === dest), `${w}: area ${dest} is not a map of its own`);
      if (up) through(up, BURIAL_GROUNDS, dest, west);
      home();
    }
    check(game.mapOf(CRYPT) !== game.mapOf(MAUSOLEUM), `${w}: the Crypt and the Mausoleum are one map`);

    // ── Stony Field's mouth into the Underground Passage, no map built: refused by name ──
    const passage = way(UNDERGROUND_PASSAGE);
    if (check(passage?.closed && west.areaAt(passage.pos.x, passage.pos.z).id === STONY_FIELD, `${w}: the way to the Underground Passage ${passage ? `closed ${!!passage.closed}` : 'missing'}`)) {
      game.teleportWithin(west.map.nearestWalkable(passage.pos.x + passage.inward.x * 1.5, passage.pos.z + passage.inward.z * 1.5));
      notes.messages = [];
      const levels = notes.levels;
      game.interact(passage);
      check(game.level === west && game.area.id === STONY_FIELD && notes.levels === levels && notes.messages.join() === `通往${areaDef(UNDERGROUND_PASSAGE).name}的路还没有开通`, `${w}: the way to the Underground Passage said ${notes.messages.join(' / ') || 'nothing'}, in ${game.area.key}`);
    }
    home();
    // a change of map at every way used (six in and out of the Cave, two at each crypt), none on the
    // overworld's jumps, and the overworld the same map throughout
    check(game.level === west && notes.levels - built === 10, `${w}: the map changed ${notes.levels - built} times on the way, not 10`);
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(`  ${WORLDS.length} worlds: camp → Cold Plains → Cave Level 1 → Cave Level 2 and back out at the mouth, camp → the Burial Grounds → the Crypt / the Mausoleum and back, ${trips} ways used, each landing beside the way back; the Underground Passage refused by name`);
};
