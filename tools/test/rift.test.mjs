// Rifts (src/world/rift.ts, src/game/rift.ts, src/game/riftsave.ts; docs/RIFT.md). The ladder: 33
// tiers, Act 1's eleven stretches in each difficulty, every area and guardian one the game has.
// Which tiers are open: one past the furthest cleared. The shared record of cleared tiers: two tabs
// clearing at once both keep theirs, a newer version's is never written. Every tier's floors: its
// areas' monsters at their levels in its difficulty, the guardian held back. Then a rift played: the
// obelisk, the way in, the hero under the tier's rules there and the played difficulty's again in the
// camp, the progress filling and the guardian coming, its death clearing the tier for every hero, a
// body left in a rift brought to the camp once it closes, a save made in one resuming in the camp.
import assert from 'node:assert/strict';

export default async (load) => {
  const R = await load('/src/world/rift.ts');
  const { RiftProgress } = await load('/src/game/riftsave.ts');
  const { Level } = await load('/src/game/level.ts');
  const { spawnGuardian } = await load('/src/game/spawn.ts');
  const { monsterLootTc } = await load('/src/game/loot.ts');
  const { RNG } = await load('/src/core/math.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { D2X_SUPERUNIQUES } = await load('/src/data/d2x/superuniques.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const { monsterDef } = await load('/src/data/monsters.ts');
  const { spawnLevel } = await load('/src/game/d2/monstats.ts');
  const { CAMP_AREA, areaDef, isBuilt } = await load('/src/world/areas.ts');
  const { WILD_MAPS, bfsDistances } = await load('/src/world/levelgen.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');

  // ── the ladder ──
  const T = R.RIFT_TIERS;
  assert.equal(T.length, 33);
  assert.deepEqual(T.map((t) => t.n), Array.from({ length: 33 }, (_, i) => i + 1));
  assert.equal(new Set(T.map((t) => t.key)).size, 33, 'tier keys repeat');
  assert.deepEqual([T[0].difficulty, T[10].difficulty, T[11].difficulty, T[22].difficulty, T[32].difficulty], [0, 0, 1, 2, 2]);
  for (const seg of R.RIFT_SEGMENTS) {
    for (const id of seg.areas) assert.ok(D2X_AREAS.some((a) => a.id === id && a.mon.length), `${seg.key}: area ${id} has no monsters`);
    const g = seg.guardian;
    const mon = g.su ? D2X_SUPERUNIQUES.find((s) => s.key === g.su)?.mon : g.mon;
    assert.ok(mon && monsterDef(mon), `${seg.key}: guardian ${g.su ?? g.mon} has no look`);
    // a superunique guardian is one of its stretch's own
    if (g.su) assert.ok(seg.areas.some((id) => D2X_AREAS.find((a) => a.id === id).superuniques?.includes(g.su)), `${seg.key}: ${g.su} isn't in its areas`);
  }
  assert.equal(R.tierLabel(T[13]), '第 14 层 · 噩梦 · 葬骨荒冢');
  assert.equal(R.guardianName(T[0]), '尸焰');
  assert.equal(R.guardianName(T[10]), '昂妲蕾');

  // ── open tiers: one past the furthest cleared ──
  assert.equal(R.openTiers(new Set()), 1);
  assert.equal(R.openTiers(new Set(['n:moor'])), 2);
  assert.equal(R.openTiers(new Set(['h:moor'])), 24, 'a tier cleared opens those before it');
  assert.equal(R.openTiers(new Set(['h:catacombs', 'x:unknown'])), 33);

  // ── the shared record: two tabs, a newer version ──
  localStorage.clear();
  const a = new RiftProgress();
  const b = new RiftProgress();
  a.cleared();
  b.cleared();
  a.clear('n:moor');
  b.clear('n:plains');
  assert.ok(b.flush() && a.flush(), 'flushing failed');
  assert.deepEqual([...new RiftProgress().cleared()].sort(), ['n:moor', 'n:plains'], 'one tab wrote over the other');
  localStorage.setItem('dii-rift', JSON.stringify({ v: 1, cleared: ['n:moor', 'n:plains', 'zz:later'], time: 1 }));
  a.clear('n:barrows');
  assert.ok(a.flush());
  assert.ok(JSON.parse(localStorage.getItem('dii-rift')).cleared.includes('zz:later'), 'a key this build lacks was dropped');
  const newer = JSON.stringify({ v: 9, cleared: ['n:moor'], future: true });
  localStorage.setItem('dii-rift', newer);
  a.clear('n:stony');
  assert.equal(a.flush(), false, 'a newer record was written');
  assert.equal(localStorage.getItem('dii-rift'), newer, 'a newer record changed');
  localStorage.setItem('dii-rift', '{oops');
  const c = new RiftProgress();
  c.clear('n:moor');
  assert.ok(c.flush(), 'an unreadable record blocked writing');
  assert.ok([...Array(localStorage.length).keys()].some((i) => localStorage.key(i).startsWith('dii-rift-unreadable-')), 'the unreadable record was not kept aside');

  // ── every tier's floors ──
  const counts = [];
  let t0 = performance.now();
  let slowest = 0;
  for (const t of T) {
    const rng = new RNG(1000 + t.n);
    const plan = R.riftPlan(t, rng);
    assert.ok(plan.length >= 2 && plan.length <= 4 && plan.every((id) => t.segment.areas.includes(id)), `tier ${t.n}: plan ${plan}`);
    let total = 0;
    plan.forEach((source, i) => {
      const t1 = performance.now();
      const area = R.riftFloorArea(t, i + 1, source);
      const { layout, down } = R.riftFloorLayout(area, source, 77 + i);
      const L = new Level(WILD_MAPS, 77 + i, layout, t.difficulty);
      slowest = Math.max(slowest, performance.now() - t1);
      const what = `tier ${t.n} floor ${i + 1} (area ${source})`;
      assert.ok(!L.objects.some((o) => o.kind === 'waypoint' || o.kind === 'stairs' || o.kind === 'exit'), `${what}: an old map's way is left`);
      assert.ok(L.map.walkableAt(down.x, down.z), `${what}: the way down isn't on the floor`);
      const reach = bfsDistances(L.map, L.layout.start);
      assert.ok(reach[Math.floor(down.z) * L.map.w + Math.floor(down.x)] >= 0, `${what}: the way down can't be walked to`);
      assert.ok(L.monsters.length > 0, `${what}: no monsters`);
      const row = D2X_AREAS.find((x) => x.id === source);
      const kinds = new Set([...(t.difficulty ? row.nmon : row.mon), ...row.umon]);
      for (const m of L.monsters) {
        assert.equal(m.difficulty, t.difficulty, `${what}: a monster of difficulty ${m.difficulty}`);
        if (t.segment.guardian.su) assert.notEqual(m.superUnique, t.segment.guardian.su, `${what}: the guardian spawned with the floor`);
        else assert.notEqual(m.def.id, t.segment.guardian.mon, `${what}: the guardian spawned with the floor`);
        if (m.rank === 'normal' && !m.leader && kinds.has(m.def.id)) {
          assert.equal(m.level, spawnLevel(D2X_MONSTERS[m.def.id], t.difficulty, row.lvl[t.difficulty]), `${what}: ${m.def.id} at level ${m.level}`);
        }
      }
      total += L.monsters.length;
      // the guardian comes on any floor: at its D2 level, its name, in the floor's difficulty
      if (i === plan.length - 1) {
        const boss = spawnGuardian(L, area, t.segment.guardian, L.layout.start, new RNG(5));
        assert.ok(boss, `tier ${t.n}: no guardian`);
        assert.equal(boss.displayName ?? boss.def.row.name, R.guardianName(t), `tier ${t.n}: the guardian is ${boss.displayName}`);
        assert.equal(boss.difficulty, t.difficulty);
        if (t.segment.guardian.su) assert.equal(boss.superUnique, t.segment.guardian.su);
      }
    });
    counts.push(total);
  }
  const ms = performance.now() - t0;
  assert.ok(slowest < 400, `a floor took ${slowest.toFixed(0)} ms to make`);

  // a rift's kills drop a quest monster's regular class, never its quest's: D2R 2.7's Andariel has
  // Andarielq for both, so a row of hers with a regular class of another name
  const row = D2X_MONSTERS.andariel;
  const twin = { ...row, diff: row.diff.map((d) => ({ ...d, tc: { ...d.tc, regular: 'Act 1 Chest C' } })) };
  const andy = { def: { row: twin }, rank: 'boss', level: 12, difficulty: 0 };
  assert.ok(row.questTc, 'Andariel has no quest class to test');
  assert.equal(monsterLootTc(andy, 0, undefined), 'Andarielq', 'a first kill out of a rift isn\'t the quest\'s');
  assert.equal(monsterLootTc(andy, 0, 'done'), 'Act 1 Chest C', 'the rift drops the quest class');

  // ── a rift played ──
  localStorage.clear();
  sessionStorage.clear();
  save.setSlot(0);
  const msgs = [];
  const panels = [];
  const game = new Game({}, new Sfx());
  game.hooks = {
    message: (t) => msgs.push(t),
    openPanel: (k) => panels.push(k),
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
  game.newGame('秘境测试', 'paladin');
  const p = game.player;
  const camp = game.level;
  const ob = camp.objects.find((o) => o.kind === 'obelisk');
  assert.ok(ob && camp.inTown(ob.pos), 'no obelisk in the camp');
  game.interact(ob);
  assert.deepEqual(panels, ['rift']);
  assert.equal(game.rift.openTiers(), 1);
  assert.equal(game.rift.begin(2), false, 'a closed tier opened');
  assert.ok(game.rift.begin(1));
  const run = game.rift.run;
  const way = camp.objects.find((o) => o.rift === 'in');
  assert.ok(way && way.dest === run.areas[0].id, 'no way in by the obelisk');
  game.interact(way);
  assert.equal(game.level, run.floors[0], 'the way in led elsewhere');
  assert.equal(game.rift.floorHere(), 1);
  assert.equal(p.ruled, 0);
  // every floor's ways: home from the first, up and down between them
  run.floors.forEach((L, i) => {
    const ways = L.objects.filter((o) => o.rift === 'home' || o.kind === 'stairs');
    assert.equal(ways.length, 1 + (i < run.floors.length - 1 ? 1 : 0), `floor ${i + 1}: ${ways.map((o) => o.name)}`);
  });
  // down to the second floor and back: beside the way taken
  const downWay = run.floors[0].objects.find((o) => o.kind === 'stairs');
  game.interact(downWay);
  assert.equal(game.level, run.floors[1]);
  const upWay = run.floors[1].objects.find((o) => o.kind === 'stairs' && o.dest === run.areas[0].id);
  assert.ok(Math.hypot(p.pos.x - upWay.pos.x, p.pos.z - upWay.pos.z) < 4, 'came down far from the way back up');
  game.interact(upWay);
  assert.equal(game.level, run.floors[0]);
  assert.ok(Math.hypot(p.pos.x - downWay.pos.x, p.pos.z - downWay.pos.z) < 4, 'came up far from the way down');

  // killing fills the progress; full, the guardian comes near the hero
  const fill = () => {
    for (const L of run.floors) {
      if (run.guardian) break;
      if (game.level !== L) game.enterArea(run.areas[run.floors.indexOf(L)].id, 'stairs');
      for (const m of L.monsters.filter((m) => !m.dead)) {
        if (run.guardian) break;
        game.killMonster(m, 'phys');
      }
    }
  };
  fill();
  assert.ok(run.guardian, `no guardian at ${run.progress}/${run.needed}`);
  assert.equal(run.guardian.superUnique, 'Corpsefire');
  assert.ok(Math.hypot(run.guardian.pos.x - p.pos.x, run.guardian.pos.z - p.pos.z) < 8, 'the guardian came far from the hero');
  // each floor gave its share and no more
  run.got.forEach((got, i) => assert.ok(got >= run.share[i], `floor ${i + 1} gave ${got} of its ${run.share[i]}`));
  const before = run.progress;
  const other = game.level.monsters.find((m) => !m.dead && m !== run.guardian && !run.guardian.minions.includes(m));
  if (other) game.killMonster(other, 'phys');
  assert.equal(run.progress, before, 'kills counted past full');
  game.killMonster(run.guardian, 'phys');
  assert.ok(run.done, 'the guardian died and the rift isn\'t done');
  assert.equal(game.rift.openTiers(), 2, 'the tier was not cleared');
  assert.ok(JSON.parse(localStorage.getItem('dii-rift-dev') ?? localStorage.getItem('dii-rift')).cleared.includes('n:moor'), 'the cleared tier is not in storage');
  const out = game.level.objects.find((o) => o.rift === 'out');
  assert.ok(out, 'no way out where the guardian fell');
  // items on its floors: the way out asks again first
  game.level.ground.push(new (await load('/src/game/objects.ts')).GroundItem(p.pos, (await load('/src/items/gen.ts')).createItem('cap')));
  game.interact(out);
  assert.equal(game.level, run.floors[game.rift.floorHere() - 1], 'left with items on the floor, not asked');
  assert.ok(msgs.at(-1).includes('再进一次'), msgs.at(-1));
  game.interact(out);
  assert.ok(game.level.inTown(p.pos), 'the way out didn\'t lead to the camp');
  assert.equal(game.rift.run, null, 'the way out left the rift open');
  assert.equal(p.ruled, null);
  const ob2 = game.level.objects.find((o) => o.kind === 'obelisk');
  assert.ok(Math.hypot(p.pos.x - ob2.pos.x, p.pos.z - ob2.pos.z) < 3, 'came out far from the obelisk');
  assert.ok(!game.level.objects.some((o) => o.rift === 'in'), 'the way in stayed');

  // a hell tier for a hero in normal: its rules there, normal's again in the camp
  localStorage.setItem('dii-rift-dev', JSON.stringify({ v: 1, cleared: ['n:catacombs', 'nm:catacombs'], time: 1 }));
  localStorage.setItem('dii-rift', JSON.stringify({ v: 1, cleared: ['n:catacombs', 'nm:catacombs'], time: 1 }));
  assert.equal(game.rift.openTiers(), 23);
  const resCamp = p.stats.res.fire;
  assert.ok(game.rift.begin(23));
  game.interact(game.level.objects.find((o) => o.rift === 'in'));
  assert.equal(p.difficulty, 0);
  assert.equal(p.rules, 2);
  p.recalc();
  assert.equal(p.stats.res.fire, resCamp - 100, 'hell\'s resistance penalty doesn\'t hold in the rift');
  assert.ok(game.level.monsters.every((m) => m.difficulty === 2 && m.level >= 67), 'a monster below hell\'s levels');
  // dying there leaves the body on the floor; the rift stays open; closed, the body waits in the camp
  const floor = game.level;
  game.killPlayer();
  game.respawn();
  assert.ok(game.level.inTown(p.pos));
  assert.equal(p.rules, 0, 'the rift\'s rules followed the hero home');
  assert.ok(game.rift.run, 'dying closed the rift');
  assert.equal(p.corpses.length, 1);
  assert.equal(p.corpses[0].level, floor, 'the body isn\'t where the hero fell');
  // saved now and loaded, the hero is in the camp
  game.enterArea(game.rift.run.areas[0].id, 'stairs');
  game.save();
  const loaded = save.loadSave();
  assert.equal(loaded.area, CAMP_AREA, 'a save in a rift resumes there');
  assert.ok(!isBuilt(game.rift.run.areas[0].id));
  game.interact(game.level.objects.find((o) => o.rift === 'home'));
  assert.ok(game.level.inTown(p.pos));
  assert.ok(game.rift.run, 'the way home closed the rift');
  game.rift.close();
  assert.equal(game.rift.run, null);
  game.layOutCorpses();
  const body = game.level.objects.find((o) => o.kind === 'corpse');
  assert.ok(body && game.level.inTown(body.pos), 'the body didn\'t come to the camp');
  assert.equal(areaDef(CAMP_AREA).kind, 'town');

  // another hero's game: the open rift is the last game's, the tiers cleared the player's
  assert.ok(game.rift.begin(1));
  game.newGame('另一个', 'sorceress');
  assert.equal(game.rift.run, null, 'a new game found the last one\'s rift open');
  assert.ok(game.level.objects.some((o) => o.kind === 'obelisk') && !game.level.objects.some((o) => o.rift === 'in'), 'the new camp\'s obelisk or way in');
  assert.equal(game.rift.openTiers(), 23, 'a new hero lost the tiers cleared');

  const avg = Math.round(counts.reduce((x, y) => x + y, 0) / counts.length);
  console.log(`  33 tiers, ${counts.length} rifts made in ${(ms / 1000).toFixed(1)} s (slowest floor ${slowest.toFixed(0)} ms), monsters a rift ${Math.min(...counts)}–${Math.max(...counts)} (mean ${avg}); played tier 1 to its guardian and tier 23's rules`);
};
