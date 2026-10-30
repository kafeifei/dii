// Diablo II's shrines (src/game/shrines.ts, blessing.ts, world/shrinekinds.ts; D2MOO Objects.cpp,
// ObjMode.cpp): Shrines.txt's rows as the importer gave them; the kind a shrine object rolls as it
// appears (InitFn01: its Parm0's class, one in ten of the boons' objects a special one, up to eight
// picks while above the level, the exchange and Enirhs shrines made the health, mana and gem
// shrines), drawn many times against the odds worked out from the table; where the game's maps put
// shrines, over many seeds: the wilderness's five cells an area of Blood Moor, Cold Plains and Stony
// Field with the four subs' objects in turn, none in the Burial Grounds or the camp; the mazes' by
// their object groups, each kind its object's class; the old maps' as their D2 level's. Each kind's
// effect on a hero: the refills, the boons' stats for their frames (one at a time: a new one, a curse
// and death end it, the same one again starts it over), the specials' portal, gem, fire, monster and
// potions; a shrine touched again only after its reset time, never for those without; our names.
const N = 20000;

/** mulberry32: a small seeded generator in [0, 1), standing in for Math.random */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default async (load) => {
  const random = Math.random;
  try {
    await run(load);
  } finally {
    Math.random = random;
  }
};

async function run(load) {
  await load('three');
  const { D2X_SHRINES, D2X_WILD_SHRINES } = await load('/src/data/d2x/shrines.ts');
  const { D2X_OBJECTS, D2X_OBJGROUPS } = await load('/src/data/d2x/objects.ts');
  const { D2X_MAZES } = await load('/src/data/d2x/maze.ts');
  const K = await load('/src/world/shrinekinds.ts');
  const { D2Seed } = await load('/src/world/maze.ts');
  const S = await load('/src/game/shrines.ts');
  const B = await load('/src/game/blessing.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Level } = await load('/src/game/level.ts');
  const { WorldObject } = await load('/src/game/objects.ts');
  const { Monster } = await load('/src/game/monster.ts');
  const { monsterDef } = await load('/src/data/monsters.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { generateDungeon, WILD_MAPS } = await load('/src/world/levelgen.ts');
  const { dungeonArea, CAMP_AREA } = await load('/src/world/areas.ts');
  const { generateOverworld } = await load('/src/world/overworld.ts');
  const { dungeonLayout } = await load('/src/world/dungeons.ts');
  const { updatePlayer } = await load('/src/game/playerctl.ts');
  const { killXp } = await load('/src/game/d2/xp.ts');
  const { FRAMES_PER_SEC } = await load('/src/core/units.ts');
  const fs = await import('node:fs');
  const problems = [];
  const facts = [];
  const check = (ok, what) => ok || problems.push(what);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // ── the table ──
  const cls = (c) => D2X_SHRINES.filter((s) => s.effectClass === c).map((s) => s.code);
  check(D2X_SHRINES.length === 23 && D2X_SHRINES.every((s, i) => s.code === i), `${D2X_SHRINES.length} shrines, by code`);
  check(cls(4).join() === '1,6,7,8,9,10,11,12,13,14,15' && cls(1).join() === '16,17,18,19,20,21,22' && cls(2).join() === '2,4' && cls(3).join() === '3,5', 'the effect classes');
  const sec = (c) => D2X_SHRINES[c].frames / FRAMES_PER_SEC;
  check(sec(6) === 96 && sec(7) === 96 && sec(8) === 144 && sec(12) === 96 && sec(13) === 96 && sec(14) === 192 && sec(15) === 144, 'the boons last 2400, 3600 and 4800 frames');

  // ── a shrine's kind, drawn many times against the table's odds (Objects.cpp:489-581) ──
  {
    // a pick of class c's list, again while above the level, eight at most: each one at the level
    // (1/n) Σ q^k over the eight, each above it only as the eighth, q^7/n (q: the share above it)
    const odds = (c, level) => {
      const list = cls(c);
      const n = list.length;
      const above = (x) => D2X_SHRINES[x].levelMin > level;
      const q = list.filter(above).length / n;
      let stay = 0;
      for (let k = 0; k < 8; k++) stay += q ** k;
      const out = new Map();
      for (const x of list) {
        const to = K.SHRINE_BECOMES[x] ?? x;
        out.set(to, (out.get(to) ?? 0) + (above(x) ? q ** 7 : stay) / n);
      }
      return out;
    };
    for (const [object, level] of [
      [2, 2],
      [81, 3],
      [83, 4],
      [277, 8],
      [277, 13],
      [84, 2],
      [275, 9],
      [276, 9],
      [77, 18],
      [165, 19],
    ]) {
      const r = new D2Seed(object * 1000 + level);
      const got = new Map();
      for (let i = 0; i < N; i++) {
        const c = K.rollShrine(object, level, r);
        got.set(c, (got.get(c) ?? 0) + 1);
      }
      const p0 = D2X_OBJECTS[object].parm[0];
      const want = new Map();
      const add = (m, k) => {
        for (const [c, p] of m) want.set(c, (want.get(c) ?? 0) + p * k);
      };
      if (p0 === 1) add(odds(2, level), 1);
      else if (p0 === 2) add(odds(3, level), 1);
      else {
        add(odds(4, level), 0.9);
        add(odds(1, level), 0.1);
      }
      const bad = [...new Set([...want.keys(), ...got.keys()])].filter((c) => !near((got.get(c) ?? 0) / N, want.get(c) ?? 0, 0.012));
      check(!bad.length, `object ${object} in level ${level}: ${bad.map((c) => `${c} ${((got.get(c) ?? 0) / N).toFixed(3)} for ${(want.get(c) ?? 0).toFixed(3)}`).join(', ')}`);
      check(![0, 4, 5, 16].some((c) => got.has(c)), `object ${object}: a shrine none ends as`);
      if (object === 2) facts.push(`a Blood Moor boon shrine: ${[...got].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${D2X_SHRINES[c].name} ${((n / N) * 100).toFixed(1)}%`).join(', ')}`);
    }
    // Parm0 0 (no Act 1 object has it): any row from 1, made as InitFn01 makes them
    const r = new D2Seed(9);
    const any = new Set(Array.from({ length: 4000 }, () => K.rollShrine(-1, 40, r)));
    check(![0, 4, 5, 16].some((c) => any.has(c)) && any.size === 19, `Parm0 0: ${[...any].sort((a, b) => a - b)}`);
  }

  // ── where the maps put them, over many seeds ──
  {
    const W = D2X_WILD_SHRINES;
    const allowed = (object) => {
      const p0 = D2X_OBJECTS[object]?.parm?.[0];
      return new Set(p0 === 1 ? [2] : p0 === 2 ? [3] : [...cls(4), ...cls(1)].map((c) => K.SHRINE_BECOMES[c] ?? c));
    };
    // the wilderness: five a wild area, its subs' objects in turn from rand & 3
    const seen = new Map();
    for (const seed of [1, 2, 3, 77, 4242, 0x5eed2a]) {
      const L = generateOverworld(seed);
      const byArea = new Map();
      for (const s of L.shrines ?? []) {
        const a = L.areaOf[Math.floor(s.z) * L.map.w + Math.floor(s.x)];
        (byArea.get(a) ?? byArea.set(a, []).get(a)).push(s);
      }
      check([...byArea.keys()].sort().join() === '2,3,4', `seed ${seed}: shrines in areas ${[...byArea.keys()]}`);
      for (const [a, list] of byArea) {
        check(list.length === 5, `seed ${seed} area ${a}: ${list.length} shrines`);
        const i0 = W.objects.indexOf(list[0].d2);
        check(i0 >= 0 && list.every((s, i) => s.d2 === W.objects[(i0 + i) % 4]), `seed ${seed} area ${a}: objects ${list.map((s) => s.d2)}`);
        for (const s of list) seen.set(s.d2, (seen.get(s.d2) ?? 0) + 1);
      }
    }
    facts.push(`the wilderness's cells: ${[...seen].map(([o, n]) => `${D2X_OBJECTS[o].key} ${n}`).join(', ')}`);
    // the mazes: each by its groups, its kind its object's class
    const kinds = new Map();
    for (const id of [8, 9, 13, 18, 19]) {
      // the shrines of the level's groups, and the healing ones they become
      const objects = new Set(D2X_MAZES[id].objGroups.flatMap((g) => D2X_OBJGROUPS[g.group].objects.map((o) => o.id)).filter((o) => D2X_OBJECTS[o].kind === 'shrine'));
      for (const o of [...objects]) objects.add(D2X_OBJECTS[o].healAs);
      for (let seed = 1; seed <= 12; seed++) {
        for (const s of dungeonLayout(id, seed * 7919, seed % 3).shrines ?? []) {
          check(objects.has(s.d2), `maze ${id} seed ${seed}: shrine object ${s.d2}`);
          check(allowed(s.d2).has(s.shrine), `maze ${id} seed ${seed}: object ${s.d2} rolled shrine ${s.shrine}`);
          kinds.set(s.shrine, (kinds.get(s.shrine) ?? 0) + 1);
        }
      }
    }
    check(kinds.has(2) && kinds.has(3), `the mazes' shrines: ${[...kinds.keys()]}`);
    facts.push(`the mazes' shrines over 60 maps: ${[...kinds].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${D2X_SHRINES[c].name} ${n}`).join(', ')}`);
    // the old wilderness (wild.ts, Blood Moor's: a rift's floors replaying the wilderness are made so) as
    // Blood Moor's cells, the four subs in turn; the old dungeons set none
    let old = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const wild = new Level(1, seed).objects.filter((o) => o.kind === 'shrine');
      old += wild.length;
      const i0 = W.objects.indexOf(wild[0]?.d2);
      check(!wild.length || (i0 >= 0 && wild.every((o, i) => o.d2 === W.objects[(i0 + i) % 4] && allowed(o.d2).has(o.shrine) && o.name === D2X_SHRINES[o.shrine].name)), `the old wilderness seed ${seed}: ${wild.map((o) => `${o.d2}:${o.shrine}`)}`);
      check(!new Level(WILD_MAPS + 1 + seed, seed).objects.some((o) => o.kind === 'shrine'), `an old dungeon floor ${seed} has a shrine`);
    }
    check(old > 0, 'the old wilderness had no shrine on 6 maps');
    // a rift floor replaying the Burial Grounds (an outdoor area D2 gives no shrine cells): none
    {
      const RF = await load('/src/world/rift.ts');
      const { RIFT_TIERS, riftFloorArea, riftFloorLayout } = RF;
      const a = riftFloorArea(RIFT_TIERS[2], 1, 17);
      const L = riftFloorLayout(a, 17, 5).layout;
      const lv = new Level(WILD_MAPS + 2, 5, L, 0);
      check((L.shrines ?? []).length > 0 && !lv.objects.some((o) => o.kind === 'shrine'), `a Burial Grounds rift floor: ${(L.shrines ?? []).length} spots, ${lv.objects.filter((o) => o.kind === 'shrine').length} shrines`);
    }
    facts.push(`${old} shrines on 6 old wilderness maps, the wilderness's subs`);
  }

  // ── each kind on a hero ──
  Math.random = seeded(20261029);
  localStorage.clear();
  save.setSlot(0);
  const said = [];
  const game = new Game({}, new Sfx());
  game.hooks = {
    message: (t) => said.push(t),
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
  game.newGame('祭坛测试', 'sorceress');
  const p = game.player;
  p.level = 20;
  p.skills.fire_bolt = 1;
  p.markDirty();
  // a floor of Stony Field (4) made by hand, empty of monsters
  const lay = generateDungeon(2, 11, dungeonArea(2));
  lay.areaOf = new Uint16Array(lay.map.w * lay.map.h).fill(4);
  lay.chests = [];
  lay.barrels = [];
  lay.shrines = [];
  const lv = new Level(WILD_MAPS + 2, 11, lay, 0);
  lv.monsters = [];
  game.level = lv;
  const at = { ...lay.start };
  p.pos = { ...at };
  const shrine = (code, pos = at) => {
    const o = new WorldObject('shrine', pos, S.shrineName(code), 0.6);
    o.shrine = code;
    o.d2 = 2;
    lv.objects.push(o);
    return o;
  };
  const touch = (code) => {
    const o = shrine(code);
    said.length = 0;
    game.interact(o);
    return o;
  };

  // refilling, health, mana
  p.life = 1;
  p.mana = 0;
  touch(1);
  check(p.life === p.stats.maxLife && p.mana === p.stats.maxMana, `refilling: ${p.life}/${p.stats.maxLife} ${p.mana}/${p.stats.maxMana}`);
  p.life = p.mana = 1;
  touch(2);
  check(p.life === p.stats.maxLife && p.mana === 1, 'health');
  touch(3);
  check(p.mana === p.stats.maxMana, 'mana');
  check(said.some((t) => t.startsWith(D2X_SHRINES[3].name)), `what it says: ${said}`);

  // the boons
  const base = { def: p.stats.def, ar: p.stats.ar, dmg: p.stats.dmgPct, res: { ...p.stats.res }, skill: p.skillLevel('fire_bolt'), mana: p.stats.manaRegenPct };
  touch(6);
  check(p.shrine?.code === 6 && near(p.shrine.left, 96, 1e-9), `armor blessing ${JSON.stringify(p.shrine)}`);
  check(p.stats.def === base.def + Math.trunc((base.def * 100) / 100), `armor: defense ${base.def} → ${p.stats.def}`);
  const arWant = S.combatShrineAr(p, 200);
  touch(7);
  check(p.shrine?.code === 7 && p.shrine.ar === arWant && p.stats.dmgPct === base.dmg + 200 && p.stats.def === base.def, `combat: ar +${p.shrine?.ar} (${arWant}), damage ${base.dmg} → ${p.stats.dmgPct}, the armor one gone`);
  check(p.stats.ar > base.ar * 2, `combat: attack rating ${base.ar} → ${p.stats.ar}`);
  for (const [code, k] of [
    [8, 'fire'],
    [9, 'cold'],
    [10, 'light'],
    [11, 'poison'],
  ]) {
    touch(code);
    const others = ['fire', 'cold', 'light', 'poison'].filter((x) => x !== k);
    check(p.stats.res[k] === Math.min(75, base.res[k] + 75) && others.every((x) => p.stats.res[x] === base.res[x]), `resist ${k}: ${base.res[k]} → ${p.stats.res[k]}`);
    check(near(p.shrine.left, 144, 1e-9), `resist ${k} lasts ${p.shrine.left}`);
  }
  touch(12);
  check(p.skillLevel('fire_bolt') === base.skill + 2, `skill: fire bolt ${base.skill} → ${p.skillLevel('fire_bolt')}`);
  touch(13);
  check(p.stats.manaRegenPct === base.mana + 400, `mana recharge: ${base.mana} → ${p.stats.manaRegenPct}`);
  // stamina: full at once, and running doesn't spend it while it lasts
  p.stamina = 1;
  touch(14);
  check(p.stamina === p.stats.maxStamina && near(p.shrine.left, 192, 1e-9), `stamina: ${p.stamina}/${p.stats.maxStamina}`);
  {
    const far = { x: at.x + 30, z: at.z };
    p.runMode = true;
    p.intent = { kind: 'move', point: lay.map.nearestWalkable(far.x, far.z) ?? far };
    p.setState('move');
    const s0 = p.stamina;
    for (let i = 0; i < 100; i++) updatePlayer(game, p, 1 / 25);
    check(p.stamina >= s0 - 1e-6, `stamina shrine: running took stamina ${s0} → ${p.stamina}`);
    p.pos = { ...at };
    p.intent = null;
    p.setState('idle');
  }
  touch(15);
  check(B.blessingBonus(p.shrine).xpPct === 50 && killXp(1000, 20, 20, 50) > killXp(1000, 20, 20, 0), 'experience: +50 %');
  // the same again: its time from the start; ticking down and gone
  p.shrine.left = 3;
  touch(15);
  check(near(p.shrine.left, 144, 1e-9), 'the same shrine again starts its time over');
  S.updateBlessing(game, 0.5);
  check(p.shrine && near(p.shrine.left, 143.5, 1e-6), `ticks down: ${p.shrine?.left}`);
  p.shrine.left = 0.01;
  S.updateBlessing(game, 0.05);
  check(!p.shrine, 'a blessing outlives its time');
  // a curse ends it, it ends a curse; death ends it
  touch(6);
  p.ampTime = 5;
  touch(8);
  check(p.ampTime === 0 && p.shrine.code === 8, 'a shrine left a curse on');
  p.ampTime = 0;
  {
    const C = await load('/src/game/combat.ts');
    const { emptyPacket } = await load('/src/game/actor.ts');
    // a cursed unique's Amplify Damage (MonUMod 7) as its blow lands: the curse slot taken
    const m = new Monster(monsterDef('zombie1'), 5, 'unique', { x: p.pos.x + 0.5, z: p.pos.z }, [7]);
    let cursed = false;
    for (let i = 0; i < 400 && !cursed; i++) {
      const pk = emptyPacket();
      pk.phys = 1;
      pk.spell = true;
      C.monsterStrike(game, m, p, pk);
      cursed = p.ampTime > 0;
      p.life = p.stats.maxLife;
    }
    check(cursed && !p.shrine, `a curse: cursed ${cursed}, the blessing ${JSON.stringify(p.shrine)}`);
  }
  touch(12);
  game.killPlayer();
  check(!p.shrine, 'death left the blessing');
  game.respawn();
  p.dead = false;
  p.life = p.stats.maxLife;
  game.level = lv;
  p.pos = { ...at };

  // reset: refilling back after 1200 × 2 + 1 frames of the map's time, health after 5 minutes', experience and the specials never
  {
    const refill = touch(1);
    const exp = touch(15);
    const gem = touch(18);
    lv.time += (1200 * 2 + 1) / FRAMES_PER_SEC - 0.05;
    S.updateShrines(lv);
    check(refill.used, 'refilling back early');
    lv.time += 0.1;
    S.updateShrines(lv);
    check(!refill.used && exp.used && gem.used, `refilling back on time (${refill.used}), experience and gem never (${exp.used}, ${gem.used})`);
    const hp = touch(2);
    lv.time += (1200 * 5 + 1) / FRAMES_PER_SEC + 0.01;
    S.updateShrines(lv);
    check(!hp.used, 'health shrine not back after 5 minutes');
    // once touched, nothing more till it is back
    p.life = 1;
    const once = touch(2);
    p.life = 1;
    game.interact(once);
    check(p.life === 1, 'a touched shrine touched again');
    p.life = p.stats.maxLife;
  }

  // the specials
  {
    // portal: a town portal to the camp where the hero stands
    game.trip.portal = null;
    touch(17);
    check(game.trip.portal && game.trip.portal.far.dest === CAMP_AREA && lv.objects.includes(game.trip.portal.far), 'portal shrine: no portal');
    // gem: the bag's first gem that has a better one, upgraded onto the ground; none, a chipped one
    for (const x of [...p.inventory.items]) p.inventory.remove(x.item);
    const perfect = createItem('gpr');
    const chipped = createItem('gcr');
    p.inventory.add(perfect);
    p.inventory.add(chipped);
    const g0 = lv.ground.length;
    touch(18);
    const dropped = lv.ground.slice(g0).map((x) => x.item?.baseId);
    check(!p.inventory.contains(chipped) && p.inventory.contains(perfect) && dropped.join() === 'gfr', `gem shrine: dropped ${dropped}, chipped kept ${p.inventory.contains(chipped)}`);
    p.inventory.remove(perfect);
    const g1 = lv.ground.length;
    touch(18);
    const chip = lv.ground.slice(g1).map((x) => x.item?.baseId);
    check(chip.length === 1 && ['gcw', 'gcr', 'gcg', 'gcb', 'gcy', 'gcv'].includes(chip[0]), `gem shrine with no gem: ${chip}`);
    // fire: half the life of everyone round it, the hero too; sixteen fireballs
    const def = monsterDef('zombie1');
    const close = new Monster(def, 5, 'normal', { x: at.x + 1, z: at.z });
    const away = new Monster(def, 5, 'normal', { x: at.x + 40, z: at.z });
    lv.monsters = [close, away];
    close.life = away.life = 30;
    p.life = 100;
    const pr0 = lv.projectiles.length;
    touch(19);
    check(close.life === 15 && away.life === 30 && p.life === 50 && !close.dead, `fire shrine: near ${close.life}, far ${away.life}, hero ${p.life}`);
    check(lv.projectiles.length - pr0 === 16 && lv.projectiles.slice(pr0).every((x) => x.kind === 'fireball' && x.faction === 'player'), `fire shrine: ${lv.projectiles.length - pr0} missiles`);
    lv.projectiles = [];
    // monster: the nearest plain one made a champion or a unique
    const a = new Monster(def, 5, 'normal', { x: at.x + 2, z: at.z });
    const b = new Monster(def, 5, 'normal', { x: at.x + 4, z: at.z });
    lv.monsters = [a, b];
    touch(20);
    const made = lv.monsters.find((m) => m.rank !== 'normal');
    check(!lv.monsters.includes(a) && lv.monsters.includes(b) && made && (made.rank === 'champion' || made.rank === 'unique') && Math.hypot(made.pos.x - a.pos.x, made.pos.z - a.pos.z) < 0.01, `monster shrine: ${lv.monsters.map((m) => m.rank)}`);
    // exploding, poison: 5–9 potions at the hero's feet, six bursts thrown
    for (const [code, item, kind] of [
      [21, 'opm', 'fire'],
      [22, 'gpm', 'poison'],
    ]) {
      lv.blasts = [];
      const g2 = lv.ground.length;
      touch(code);
      const pots = lv.ground.slice(g2).map((x) => x.item);
      check(pots.length >= 5 && pots.length <= 9 && pots.every((it) => it.baseId === item && (it.qty ?? 1) === 1), `shrine ${code}: ${pots.length} potions ${pots.map((x) => x.baseId)}`);
      check(lv.blasts.length > 0 && lv.blasts.length <= 6 && lv.blasts.every((x) => x.kind === kind && x.faction === 'player'), `shrine ${code}: ${lv.blasts.length} bursts`);
    }
  }

  // names: ours, never the official ones
  {
    const names = JSON.parse(fs.readFileSync(new URL('../d2-names/shrines.json', import.meta.url), 'utf8'));
    for (const s of D2X_SHRINES.filter((x) => x.name)) {
      const n = names[s.key];
      check(n && n.name === s.name && n.name !== n.official && n.nameEn !== n.en && S.shrineName(s.code) === s.name, `shrine ${s.code}: ${s.name}`);
    }
    facts.push(`names ${D2X_SHRINES.filter((x) => x.name).map((x) => x.name).join(' ')}`);
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 30).join('\n  ')}`);
  console.log(`  ${facts.join('; ')}`);
}
