// The chests no map gives an Objects.txt row of (the overworld's, the old maps': the trial ground's
// floors and a rift's floors made by them) as D2 makes a preset's random chest (src/game/level.ts,
// world/objgroups.ts presetChestRoll; D2MOO Objects.cpp:103-169, 637-668): one of Act 1's thirteen,
// trapped under its D2 level's MonLvl / 8 + 5 % (classic normal MonLvl), (rand & 7) + 1, locked under
// MonLvl / 2 + 8 %, drawn many times against those rates; on the game's maps, the overworld's every
// chest so rolled in the D2 level of the area it stands in, none in the camp, the mazes' as their
// groups rolled them; and an overworld chest's trap goes off when it is opened, as a maze chest's does.
const N = 40000;

export default async (load) => {
  await load('three');
  const { presetChestRoll, chestRolls } = await load('/src/world/objgroups.ts');
  const { D2Seed } = await load('/src/world/maze.ts');
  const { D2X_OBJECTS } = await load('/src/data/d2x/objects.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { D2X_MAZES } = await load('/src/data/d2x/maze.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Level } = await load('/src/game/level.ts');
  const C = await load('/src/game/containers.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const { WILD_MAPS } = await load('/src/world/levelgen.ts');
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS, DEN_OF_EVIL, CAVE_1, CRYPT } = await load('/src/world/areas.ts');
  const { FRAMES_PER_SEC } = await load('/src/core/units.ts');
  const problems = [];
  const facts = [];
  const check = (ok, what) => ok || problems.push(what);
  const ACT1 = D2X_OBJECTS[581].becomes;
  const monLvl = (id) => D2X_AREAS.find((a) => a.id === id).lvlClassic[0];

  // ── the rolls, many times, against D2's rates ──
  for (const id of [WILD_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS, DEN_OF_EVIL, 7]) {
    const rates = chestRolls(monLvl(id));
    check(rates.trap === Math.floor(monLvl(id) / 8) + 5 && rates.lock === Math.floor(monLvl(id) / 2) + 8, `level ${id}: ${JSON.stringify(rates)}`);
    const r = new D2Seed(4242 + id);
    let trapped = 0;
    let locked = 0;
    const kinds = new Map();
    const rows = new Map();
    for (let i = 0; i < N; i++) {
      const c = presetChestRoll(r, rates);
      if (c.trap) {
        trapped++;
        kinds.set(c.trap, (kinds.get(c.trap) ?? 0) + 1);
      }
      if (c.locked) locked++;
      rows.set(c.d2, (rows.get(c.d2) ?? 0) + 1);
    }
    const sd = (p) => Math.sqrt((p * (1 - p)) / N);
    check(Math.abs(trapped / N - rates.trap / 100) < 4 * sd(rates.trap / 100), `level ${id}: ${((trapped / N) * 100).toFixed(2)} % trapped, D2 ${rates.trap} %`);
    check(Math.abs(locked / N - rates.lock / 100) < 4 * sd(rates.lock / 100), `level ${id}: ${((locked / N) * 100).toFixed(2)} % locked, D2 ${rates.lock} %`);
    check([...kinds.keys()].every((k) => k >= 1 && k <= 8) && kinds.size === 8 && [...kinds.values()].every((n) => Math.abs(n / trapped - 1 / 8) < 0.03), `level ${id}: trap kinds ${[...kinds].map(([k, n]) => `${k}:${n}`)}`);
    check(rows.size === 13 && [...rows.keys()].every((d) => ACT1.includes(d)) && [...rows.values()].every((n) => Math.abs(n / N - 1 / 13) < 0.01), `level ${id}: the chests ${[...rows].map(([d, n]) => `${d}:${n}`)}`);
    facts.push(`level ${id} (MonLvl ${monLvl(id)}): ${((trapped / N) * 100).toFixed(1)} % trapped (${rates.trap}), ${((locked / N) * 100).toFixed(1)} % locked (${rates.lock})`);
  }

  // ── on the game's maps ──
  localStorage.clear();
  save.setSlot(0);
  const game = new Game({}, new Sfx());
  game.hooks = { message() {}, openPanel() {}, levelChanged() {}, areaChanged() {}, teleported() {}, playerDied() {}, inventoryChanged() {}, getCursorItem: () => null, setCursorItem() {}, hoveredGroundId: () => null, levelUp() {} };
  game.newGame('宝箱', 'paladin');
  const p = game.player;
  p.cubeFound = true;
  let wild = 0;
  let wildTrapped = 0;
  let wildLocked = 0;
  const byArea = new Map();
  for (const world of [1, 77, 4242, 2026, 0x5eed2a]) {
    game.newWorld(world);
    const ow = game.maps.levelFor(CAMP_AREA);
    for (const o of ow.objects.filter((x) => x.kind === 'chest')) {
      const a = ow.areaAt(o.pos.x, o.pos.z);
      if (a.kind === 'town') {
        check(!o.trap && !o.locked, `world ${world}: a camp chest trapped or locked`);
        continue;
      }
      wild++;
      byArea.set(a.id, (byArea.get(a.id) ?? 0) + 1);
      check(ACT1.includes(o.d2) && (!o.trap || (o.trap >= 1 && o.trap <= 8)), `world ${world} area ${a.id}: a chest ${o.d2} trap ${o.trap}`);
      check(o.name === C.objectName('chest', o), `world ${world}: a chest called ${o.name}`);
      if (o.trap) wildTrapped++;
      if (o.locked) wildLocked++;
    }
    // the mazes keep their groups' rolls: every chest a row of their groups' or presets' (none plain)
    for (const id of [CAVE_1, CRYPT]) {
      const L = game.maps.levelFor(id);
      for (const o of L.objects.filter((x) => x.kind === 'chest')) check(o.d2 !== undefined && D2X_OBJECTS[o.d2]?.kind === 'chest', `world ${world} maze ${id}: a chest ${o.d2}`);
    }
  }
  check(wild > 0 && wildLocked > 0, `the overworld: ${wild} chests, ${wildLocked} locked`);
  facts.push(`the overworld in 5 worlds: ${wild} chests (${[...byArea].map(([a, n]) => `area ${a} ${n}`).join(', ')}), ${wildTrapped} trapped, ${wildLocked} locked`);
  // the trial ground's floors, as the Den of Evil's
  let trial = 0;
  let trialRolled = 0;
  for (let s = 1; s <= 30; s++) {
    const L = new Level(WILD_MAPS + 1 + (s % 5), s);
    for (const o of L.objects.filter((x) => x.kind === 'chest')) {
      trial++;
      if (o.trap || o.locked) trialRolled++;
      check(ACT1.includes(o.d2), `trial floor ${s}: chest ${o.d2}`);
    }
  }
  facts.push(`30 trial floors: ${trial} chests, ${trialRolled} trapped or locked`);

  // ── an overworld chest's trap goes off ──
  {
    game.newWorld(77);
    const ow = game.maps.levelFor(CAMP_AREA);
    game.level = ow;
    const chest = ow.objects.find((o) => o.kind === 'chest' && !ow.inTown(o.pos));
    check(!!chest, 'no chest on the overworld');
    if (chest) {
      chest.trap = 5;
      chest.locked = false;
      p.pos = { x: chest.pos.x + 0.5, z: chest.pos.z };
      game.interact(chest);
      check(chest.used && C.trapWaiting(ow, chest), `an overworld chest's fire trap: opened ${chest.used}, set off ${C.trapWaiting(ow, chest)}`);
      ow.time += C.TRAP_DELAY / FRAMES_PER_SEC;
      C.updateTraps(game, ow);
      check(!C.trapWaiting(ow, chest) && chest.fires?.length >= 1, `an overworld chest's fire trap: fires ${chest.fires?.length}`);
    }
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 30).join('\n  ')}`);
  console.log(`  ${facts.join('; ')}`);
};
