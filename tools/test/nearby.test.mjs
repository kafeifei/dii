// The sim's loops over monsters look only near the hero (src/game/monstergrid.ts). The grid finds
// what a loop over every monster would, by centre (near) and by body (touching), through moves,
// a new list and a forced resync. On the West overworld, a new game's thousand monsters: while the
// hero fights in Blood Moor only those near are stepped, the far ones never change, the grid still
// agrees with a loop over all of them after every step, and a corpse far off ages by the time gone
// once the dead are next cleared, the time spent on its map only: while the hero is on another,
// they keep. Back, the survivors are home and drawn there. Paths keep their buffers from map to
// map. It prints how long a sim step takes with the overworld's monsters, and with 400 awake round
// the hero.
const DT = 1 / 60;
const ACTIVE = 30;

export default async (load) => {
  const { MonsterGrid } = await load('/src/game/monstergrid.ts');
  const { RNG } = await load('/src/core/math.ts');
  const { WILD_AREA } = await load('/src/world/areas.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { debugOpts } = await load('/src/game/debug.ts');
  const { findPath, pathBuffers } = await load('/src/world/pathfinding.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const ids = (list) => list.map((m) => m.id).sort((a, b) => a - b).join();

  // ── the grid alone: what a loop over all would find ──
  {
    const rng = new RNG(5);
    const W = 232;
    const H = 256;
    let list = Array.from({ length: 900 }, (_, id) => ({ id, pos: { x: rng.next() * W, z: rng.next() * H }, radius: 0.3 + rng.next() * 0.6 }));
    const grid = new MonsterGrid(W, H);
    const agree = (what) => {
      for (let k = 0; k < 40; k++) {
        const p = { x: rng.next() * (W + 20) - 10, z: rng.next() * (H + 20) - 10 };
        const r = rng.next() * 35;
        grid.sync(list);
        const near = list.filter((m) => dist(m.pos, p) <= r);
        const touching = list.filter((m) => dist(m.pos, p) <= r + m.radius);
        if (ids(grid.near(p, r)) !== ids(near)) return check(false, `${what}: near(${p.x.toFixed(1)}, ${p.z.toFixed(1)}, ${r.toFixed(1)}) differs from a loop over all`);
        if (ids(grid.touching(p, r)) !== ids(touching)) return check(false, `${what}: touching(${p.x.toFixed(1)}, ${p.z.toFixed(1)}, ${r.toFixed(1)}) differs from a loop over all`);
      }
    };
    agree('as bucketed');
    // walking about, a step at a time, each put in its cell after its step
    for (let step = 0; step < 200; step++) {
      for (const m of list.slice(0, 300)) {
        m.pos.x = Math.min(W - 0.01, Math.max(0, m.pos.x + (rng.next() - 0.5) * 0.4));
        m.pos.z = Math.min(H - 0.01, Math.max(0, m.pos.z + (rng.next() - 0.5) * 0.4));
        grid.moved(m);
      }
    }
    agree('after 200 steps of moves');
    // a list cleared of some, and one grown: bucketed anew
    list = list.filter((m) => m.id % 7);
    agree('a new list');
    list.push({ id: 1000, pos: { x: 10, z: 10 }, radius: 0.5 });
    agree('a longer list');
    // jumped far without being put in its cell (a level re-entered): a forced sync finds it
    list[0].pos = { x: 200, z: 200 };
    grid.sync(list, true);
    check(grid.near({ x: 200, z: 200 }, 0.5).includes(list[0]), 'a forced sync left a monster in its old cell');
  }

  // ── the game on the West overworld ──
  localStorage.clear();
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
  game.hooks = { message() {}, openPanel() {}, levelChanged() {}, areaChanged() {}, teleported() {}, playerDied() {}, inventoryChanged() {}, getCursorItem: () => null, setCursorItem() {}, hoveredGroundId: () => null, levelUp() {} };
  game.newGame('近处测试', 'paladin');
  debugOpts.god = true;
  const L = game.level;
  const p = game.player;
  // into Blood Moor, by the thickest crowd of its monsters
  let at = null;
  let most = 0;
  for (const m of L.monsters) {
    if (L.areaAt(m.pos.x, m.pos.z).id !== WILD_AREA || !L.map.circleClear(m.pos.x, m.pos.z, 0.5)) continue;
    const n = L.monsters.filter((o) => dist(o.pos, m.pos) < 12).length;
    if (n > most) (most = n), (at = { ...m.pos });
  }
  game.teleportWithin(at);
  const all = L.monsters.length;
  // the far ones, as they were: a step must never touch them
  const far = L.monsters.filter((m) => dist(m.pos, p.pos) > ACTIVE + 15).map((m) => ({ m, x: m.pos.x, z: m.pos.z, los: m.losTimer, state: m.state }));
  let disagree = 0;
  let stepMs = 0;
  const STEPS = 600;
  for (let i = 0; i < STEPS; i++) {
    // the hero stands and swings at whatever is close, so the crowd comes and fights
    const foe = L.monstersNear(p.pos, 3).find((m) => !m.dead);
    if (foe && !p.intent) p.intent = { kind: 'attack', target: foe, skill: 'attack', hold: true };
    const t = performance.now();
    game.update(DT);
    stepMs += performance.now() - t;
    if (i % 20 === 0) {
      const probes = [p.pos, ...L.monsters.slice(0, 3).map((m) => m.pos)];
      for (const q of probes) {
        if (ids(L.monstersNear(q, ACTIVE)) !== ids(L.monsters.filter((m) => dist(m.pos, q) <= ACTIVE))) disagree++;
        if (ids(L.monstersTouching(q, 5)) !== ids(L.monsters.filter((m) => dist(m.pos, q) <= 5 + m.radius))) disagree++;
      }
    }
  }
  check(!disagree, `${disagree} time(s) the grid and a loop over all monsters found different ones`);
  const touched = far.filter((f) => f.m.pos.x !== f.x || f.m.pos.z !== f.z || f.m.losTimer !== f.los || f.m.state !== f.state);
  check(!touched.length, `${touched.length} of ${far.length} monsters far from the hero were stepped or moved`);
  const awake = L.monsters.filter((m) => m.awake && !m.dead).length;
  const killed = L.monsters.filter((m) => m.dead).length;
  check(awake > 5, `only ${awake} monster(s) woke round the hero`);

  // ── a corpse far off ages when the dead are next cleared ──
  const victim = L.monsters.find((m) => !m.dead && dist(m.pos, p.pos) > 60);
  game.killMonster(victim, 'phys');
  const t0 = game.time;
  for (let i = 0; i < 3000 && victim.deathTime === 0; i++) game.update(DT);
  check(victim.deathTime > 0 && Math.abs(victim.deathTime - (game.time - t0)) < 1e-6, `a corpse far off aged ${victim.deathTime.toFixed(3)} s in ${(game.time - t0).toFixed(3)} s`);

  // ── 400 awake round the hero: what a step costs then ──
  const crowd = L.monsters.filter((m) => !m.dead).slice(0, 400);
  crowd.forEach((m, i) => {
    const a = (i / crowd.length) * Math.PI * 2;
    const spot = L.map.nearestWalkable(p.pos.x + Math.sin(a) * (4 + (i % 20)), p.pos.z + Math.cos(a) * (4 + (i % 20)), 10) ?? p.pos;
    m.pos = { ...spot };
    m.prevPos = { ...spot };
    m.awake = true;
  });
  // they jumped: bucketed anew, as a level's reentry does
  L.monsters = [...L.monsters];
  let crowdMs = 0;
  for (let i = 0; i < 120; i++) {
    const t = performance.now();
    game.update(DT);
    crowdMs += performance.now() - t;
  }

  // ── away on another map, the corpses here keep (they age by the time spent on this map); back,
  // the survivors are home and drawn there, not sliding in from where they were ──
  const left = L.monsters.find((m) => !m.dead && dist(m.pos, p.pos) > 60);
  game.killMonster(left, 'phys');
  const onWest = L.time;
  const stray = L.monsters.find((m) => !m.dead && m !== left && dist(m.pos, p.pos) > 60);
  stray.pos = { x: stray.homePos.x + 3, z: stray.homePos.z };
  stray.prevPos = { ...stray.pos };

  // ── paths keep their buffers, map to map ──
  const big = pathBuffers().tiles;
  check(big >= L.map.w * L.map.h, `the path buffers hold ${big} tiles on a ${L.map.w}×${L.map.h} map`);
  game.enterArea(8, 'stairs');
  const den = game.level;
  const goal = den.map.nearestWalkable(den.layout.start.x + 30, den.layout.start.z + 30, 30) ?? den.layout.start;
  for (let i = 0; i < 20; i++) findPath(den.map, den.layout.start, goal, 20000, 0.3);
  check(pathBuffers().tiles === big, `paths on the den made the buffers ${pathBuffers().tiles} tiles (they were ${big})`);
  const heap = pathBuffers().heap;
  for (let i = 0; i < 20; i++) findPath(den.map, den.layout.start, goal, 20000, 0.3);
  check(pathBuffers().heap === heap, 'the same paths again grew the heap');

  // fifty seconds in the den, then back on the overworld
  for (let i = 0; i < 50 / DT; i++) game.update(DT);
  debugOpts.god = false;
  game.enterArea(WILD_AREA, 'waypoint');
  check(game.level === L, 'back from the den onto another map than the overworld');
  check(stray.pos.x === stray.homePos.x && stray.prevPos.x === stray.homePos.x && stray.prevPos.z === stray.homePos.z, 'a monster sent home as the hero came back is drawn from where it was');
  for (let i = 0; i < 3000 && left.deathTime === 0; i++) game.update(DT);
  const away = game.time - L.time;
  check(L.monsters.includes(left) && left.deathTime > 0 && Math.abs(left.deathTime - (L.time - onWest)) < 1e-6, `a corpse aged ${left.deathTime.toFixed(2)} s while the hero spent ${(L.time - onWest).toFixed(2)} s on its map (${away.toFixed(1)} s away in all)`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(
    `  grid = a loop over all; ${all} monsters on the overworld, ${far.length} far ones never stepped while ${awake} awake fought (${killed} killed): ${(stepMs / STEPS).toFixed(2)} ms a step; 400 awake round the hero: ${(crowdMs / 120).toFixed(2)} ms a step; path buffers ${big} tiles, kept on the den`,
  );
};
