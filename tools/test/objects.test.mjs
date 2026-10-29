// The objects a map sets down, used as Diablo II uses them (src/game/containers.ts, loot.ts, spawn.ts
// spawnOne; D2MOO ObjMode.cpp), on floors made by hand (lane D's maps aren't in yet), Math.random
// seeded. Each is called by our name for it (the rename tables, D2X_OBJECT_NAMES), never the
// official one. Each is used once: a chest, a barrel, a casket (which opens only on a drop, and stays
// shut to be tried again on none), a grave of its cluster, a rogue's corpse; a well is never spent but
// has its drinks, two, each back 30.04 s after it was taken, and takes one only when it did something.
// A locked chest takes exactly one key, the bag's first, a stack going down by one and away with its
// last, none from the stash or the cube, and stays shut without one; it drops twice. A spark chest
// (580's rules: Cave Level 2) always drops, magic or rare, 5 % rare, and again until a magic or better
// first item comes, up to 10 more; 397 (the Mausoleum's) by its own branches, its last 5 piles of gold
// and two strong healing and two strong mana potions. 18.08 % of the caskets and a maze's barrels opened
// raise the area's trap monster, D2's: the first zombie or skeleton class among the kinds it drew, as
// its normal list's row; an exploding barrel drops nothing, an old map's barrel raises nothing. Every
// drop rolled lands, none lost, none twice. The views draw each kind with nothing in and ask only
// for what objectNeeds says.

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

/** a 2D context that takes whatever is drawn and draws nothing: the views' glows are canvas textures */
const nothing2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = () => nothing2d)), set: (t, k, v) => ((t[k] = v), true) });

export default async (load) => {
  const random = Math.random;
  const make = document.createElement;
  document.createElement = (tag) => {
    const e = make(tag);
    if (String(tag).toLowerCase() === 'canvas') e.getContext = () => nothing2d;
    return e;
  };
  try {
    await run(load);
  } finally {
    Math.random = random;
    document.createElement = make;
  }
};

async function run(load) {
  await load('three');
  const { Game } = await load('/src/game/game.ts');
  const { Level } = await load('/src/game/level.ts');
  const { WorldObject, spent } = await load('/src/game/objects.ts');
  const C = await load('/src/game/containers.ts');
  const L = await load('/src/game/loot.ts');
  const { spawnOne, trapMonster } = await load('/src/game/spawn.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const { createItem, isEquipment } = await load('/src/items/gen.ts');
  const { ITEM_BASES } = await load('/src/data/items.ts');
  const { D2X_OBJECT_NAMES } = await load('/src/data/d2x/objects.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const { generateDungeon, WILD_MAPS } = await load('/src/world/levelgen.ts');
  const { areaDef, areaLevel, dungeonArea } = await load('/src/world/areas.ts');
  const { RNG } = await load('/src/core/math.ts');
  const { makeObjectView } = await load('/src/render/objviews.ts');
  const { objectNeeds } = await load('/src/render/needs.ts');
  const { assets } = await load('/src/render/assets.ts');
  const fs = await import('node:fs');
  const problems = [];
  const facts = [];
  const check = (ok, what) => ok || problems.push(what);
  const seed = (n) => (Math.random = seeded(n));
  seed(20261029);

  localStorage.clear();
  save.setSlot(0);
  const said = [];
  let invChanges = 0;
  const game = new Game({}, new Sfx());
  game.hooks = {
    message: (t) => said.push(t),
    openPanel() {},
    levelChanged() {},
    areaChanged() {},
    teleported() {},
    playerDied() {},
    inventoryChanged: () => invChanges++,
    getCursorItem: () => null,
    setCursorItem() {},
    hoveredGroundId: () => null,
    levelUp() {},
  };
  game.newGame('物件测试', 'paladin');
  const p = game.player;
  // the Cube is the first chest's of an area of level 4 or more (plan A2), not D2's: kept out of the counts
  p.cubeFound = true;

  /** a floor of area `area` made by hand: an old dungeon floor's rooms, all of it the area, no chests or barrels of its own */
  const floor = (area, s = 7, difficulty = 0) => {
    const lay = generateDungeon(2, s, dungeonArea(2));
    lay.areaOf = new Uint16Array(lay.map.w * lay.map.h).fill(area);
    lay.chests = [];
    lay.barrels = [];
    return new Level(WILD_MAPS + 2, s, lay, difficulty);
  };
  const CRYPT = 18;
  const lv = floor(CRYPT);
  game.level = lv;
  const at = { ...lv.layout.start };
  p.pos = { ...at };
  // every drop rolled, against what lands: none lost, none twice (Game.rollLoot is the instance's to swap, as the tools do)
  let rolled = 0;
  const realRoll = game.rollLoot.bind(game);
  game.rollLoot = (roll, by) => {
    const d = realRoll(roll, by);
    rolled += d.length;
    return d;
  };
  const landed = () => lv.ground.length;
  const counted = (what, fn) => {
    const [r0, g0] = [rolled, landed()];
    const out = fn();
    check(rolled - r0 === landed() - g0, `${what}: ${rolled - r0} rolled, ${landed() - g0} landed`);
    return out;
  };
  /** an object of `kind` at the floor's start, as level.ts makes them, put on the floor */
  const put = (kind, extra = {}) => {
    const o = new WorldObject(kind, at, C.objectName(kind, extra) ?? '', 0.5);
    Object.assign(o, extra);
    lv.objects.push(o);
    return o;
  };

  // ── names: ours from the rename tables, never the official one ──
  {
    const names = JSON.parse(fs.readFileSync(new URL('../d2-names/objects.json', import.meta.url), 'utf8'));
    const want = { chest: ['chest', {}], lockedchest: ['chest', { locked: true }], Barrel: ['barrel', {}], Casket: ['casket', { d2: 3 }], HoleAnim: ['casket', { d2: 28, hole: true }], RogueCorpse: ['remains', { d2: 54 }], Well: ['well', { d2: 138 }] };
    for (const [key, [kind, o]] of Object.entries(want)) {
      const n = C.objectName(kind, o);
      check(n && n === D2X_OBJECT_NAMES[key]?.name && n === names[key].name && n !== names[key].official, `${kind} ${JSON.stringify(o)} is called ${n} (${key}: ours ${names[key]?.name}, official ${names[key]?.official})`);
    }
    // an exploding barrel and a sparkly chest are called what their rows are; a map's wrong row id goes by the kind
    check(C.objectName('barrel', { d2: 11 }) === D2X_OBJECT_NAMES.Barrel.name && C.objectName('chest', { d2: 397 }) === D2X_OBJECT_NAMES.chest.name && C.objectName('casket', { d2: 5 }) === D2X_OBJECT_NAMES.Casket.name, 'an exploding barrel, a sparkly chest or a casket given a chest\'s row is misnamed');
    // and an old map's chests and barrels too
    const old = new Level(WILD_MAPS + 2, 3);
    const bad = old.objects.filter((o) => (o.kind === 'chest' || o.kind === 'barrel') && o.name !== C.objectName(o.kind));
    check(!bad.length && old.objects.some((o) => o.kind === 'barrel'), `an old floor's chests and barrels: ${bad.map((o) => o.name).join(' ')}`);
    facts.push(`names ${Object.keys(want).map((k) => D2X_OBJECT_NAMES[k].name).join(' ')}`);
  }

  // ── used once: a chest, a barrel, a rogue's corpse; a casket only on a drop ──
  {
    for (const [kind, extra] of [['chest', { d2: 5 }], ['barrel', { d2: 7 }], ['remains', { d2: 54 }]]) {
      const o = put(kind, extra);
      counted(`a ${kind} used`, () => game.interact(o));
      check(o.used && spent(o), `a ${kind} not spent once used`);
      const [r0, g0, m0] = [rolled, landed(), lv.monsters.length];
      for (let i = 0; i < 5; i++) game.interact(o);
      check(rolled === r0 && landed() === g0 && lv.monsters.length === m0, `a ${kind} used again gave ${rolled - r0} drops, ${lv.monsters.length - m0} monsters`);
    }
    // a casket: tried until it drops, shut (unspent, nothing landed) on every try that didn't
    let shut = 0;
    let caskets = 0;
    let tries = 0;
    for (let k = 0; k < 200; k++) {
      const o = put('casket', { d2: k % 4 ? 3 : 28, hole: !(k % 4) });
      caskets++;
      for (let t = 0; t < 60 && !o.used; t++) {
        tries++;
        const before = landed();
        counted('a casket tried', () => game.interact(o));
        if (!o.used) {
          shut++;
          check(landed() === before && !spent(o), 'a casket that dropped nothing opened or dropped');
        } else check(landed() > before, 'a casket opened on nothing');
      }
      check(o.used, 'a casket never opened in 60 tries');
      const [g0, m0] = [landed(), lv.monsters.length];
      game.interact(o);
      check(landed() === g0 && lv.monsters.length === m0, 'an opened casket gave more');
    }
    facts.push(`${caskets} caskets opened in ${tries} tries (${shut} on nothing, shut)`);
  }

  // ── a locked chest takes exactly one key, the bag's first; none from the stash or the cube ──
  {
    for (const g of [p.inventory, p.stash, p.cube]) for (const x of [...g.items]) if (ITEM_BASES[x.item.baseId]?.type === 'key') g.remove(x.item);
    const keys = () => ({
      bag: p.inventory.items.filter((x) => ITEM_BASES[x.item.baseId].type === 'key').map((x) => x.item.qty ?? 1),
      stash: p.stash.items.filter((x) => ITEM_BASES[x.item.baseId].type === 'key').reduce((n, x) => n + (x.item.qty ?? 1), 0),
      cube: p.cube.items.filter((x) => ITEM_BASES[x.item.baseId].type === 'key').reduce((n, x) => n + (x.item.qty ?? 1), 0),
    });
    const locked = () => put('chest', { d2: 5, locked: true });
    // none: it stays shut, the hero told, nothing dropped
    said.length = 0;
    const c0 = locked();
    counted('a locked chest without a key', () => game.interact(c0));
    check(!c0.used && !spent(c0) && said.some((t) => t.includes('钥匙')), `a locked chest without a key: used ${c0.used}, said ${said.join(' / ')}`);
    check(c0.name === D2X_OBJECT_NAMES.lockedchest.name, `a locked chest is called ${c0.name}`);
    const first = Object.assign(createItem('key'), { qty: 2 });
    const second = Object.assign(createItem('key'), { qty: 1 });
    check(p.inventory.add(first) && p.inventory.add(second), 'no room in the bag for the keys');
    check(p.stash.add(Object.assign(createItem('key'), { qty: 5 })) && p.cube.add(Object.assign(createItem('key'), { qty: 1 })), 'no room in the stash or cube for a key');
    const seen = [];
    const inv0 = invChanges;
    for (let i = 0; i < 4; i++) {
      const c = i ? locked() : c0;
      counted('a locked chest with a key', () => game.interact(c));
      seen.push(`${c.used ? 'open' : 'shut'} ${JSON.stringify(keys())}`);
      check(c.used === i < 3, `locked chest ${i + 1}: ${c.used ? 'opened' : 'stayed shut'} with keys ${JSON.stringify(keys())}`);
    }
    const k = keys();
    // 2 + 1 in the bag: the first stack down to 1, gone, then the second gone; the fourth chest finds none
    check(seen[0].includes('"bag":[1,1]') && seen[1].includes('"bag":[1]') && seen[2].includes('"bag":[]') && k.bag.length === 0 && k.stash === 5 && k.cube === 1, `the keys chest by chest: ${seen.join('; ')}`);
    check(!p.inventory.contains(first) && !p.inventory.contains(second), 'a used-up key stack stayed in the bag');
    check(invChanges - inv0 === 3, `the bag was told of ${invChanges - inv0} key uses, not 3`);
    facts.push(`keys: 3 locked chests opened with 2 + 1 in the bag (${seen.slice(0, 3).map((s) => s.match(/"bag":\[[^\]]*\]/)[0]).join(' → ')}), the fourth shut, the stash's 5 and the cube's 1 untouched`);
  }

  // ── what the chests drop: locked twice, 580 and 397 by their rules (loot.ts) ──
  {
    const hero = { mf: 0, gf: 0, difficulty: 0, quests: 'done' };
    const sig = (items) => items.map((i) => `${i.baseId}:${i.quality}:${i.qty ?? ''}`).join(',');
    const crypt = areaDef(CRYPT);
    // a locked chest: its roll, then two drops, whatever the roll (ObjMode.cpp:1263-1308)
    for (let s = 1; s <= 40; s++) {
      const got = L.chestLoot({ locked: true }, crypt, hero, new RNG(s));
      const r = new RNG(s);
      r.next();
      const want = [...L.chestDrop(crypt, hero, undefined, r), ...L.chestDrop(crypt, hero, undefined, r)];
      check(sig(got) === sig(want), `seed ${s}: a locked chest dropped ${sig(got)}, not its two drops ${sig(want)}`);
    }
    // 580 (Cave Level 2's): always drops, magic or rare; 5 % rare; on until a magic or better first item
    const cave2 = areaDef(13);
    let rare = 0;
    let empty = 0;
    let noMagic = 0;
    let plain = 0;
    const N = 1500;
    for (let s = 1; s <= N; s++) {
      const rng = new RNG(1000 + s);
      const q = new RNG(1000 + s).next();
      const got = L.chestLoot({ sparkly: 'unique' }, cave2, hero, rng);
      if (Math.floor(q * 100) < 5) rare++;
      if (!got.length) empty++;
      if (!got.some((i) => L.magicOrBetter(i))) noMagic++;
      // gear is made the chest's quality: magic, or rare (a throwing potion is only ever plain, ItemTypes.txt Normal)
      for (const it of got) if (isEquipment(it) && ITEM_BASES[it.baseId].itype !== 'tpot' && it.quality !== 'magic' && it.quality !== 'rare') plain++;
    }
    check(Math.abs(rare / N - 0.05) < 0.02, `580: ${rare} of ${N} spark chests rare, not about 5 %`);
    // (none at all only when its first try and 10 more each came first with gold, a potion or nothing)
    check(empty === 0 && noMagic < N * 0.05, `580: ${empty} spark chests dropped nothing, ${noMagic} nothing magic or better`);
    check(plain === 0, `580: ${plain} pieces of equipment dropped plain from a spark chest`);
    facts.push(`580: ${N} spark chests, ${rare} rare (5 %), every one dropping, ${noMagic} with nothing magic or better`);
    // 397 (the Mausoleum's): its branches by a roll of 10000 after the spark roll
    const maus = areaDef(19);
    const ilvl = areaLevel(maus, 0);
    /** an rng that answers the spark roll and 397's roll as asked, then seeded */
    const forced = (spark, branch, s) => {
      const r = new RNG(s);
      const q = [spark, branch];
      return { next: () => (q.length ? q.shift() : r.next()) };
    };
    const tail = (items) => {
      const t = items.slice(-9);
      return t.length === 9 && t.slice(0, 5).every((i) => i.baseId === 'gld' && i.qty >= ilvl && i.qty <= 6 * ilvl) && sig(t.slice(5)).startsWith('hp3') && t.slice(5).map((i) => i.baseId).join() === 'hp3,hp3,mp3,mp3';
    };
    let tails = 0;
    let uniques = 0;
    let goldEnds = 0;
    for (let s = 1; s <= 300; s++) {
      const t = L.consolationLoot(maus, hero, forced(0.5, 0.7, s));
      // spark roll 50, 397's 7000: the rest, always its gold and potions
      const all = L.chestLoot({ sparkly: 'consolation' }, maus, hero, forced(0.5, 0.7, s));
      check(tail(all) && sig(all) !== '' , `seed ${s}: 397 at 7000 ended ${sig(all.slice(-9))}`);
      check(t.length > 0, 'consolationLoot dropped nothing');
      // at 100, two tries at a unique: done at the first magic or better, else the rest
      const u = L.chestLoot({ sparkly: 'consolation' }, maus, hero, forced(0.5, 0.01, s));
      if (tail(u)) tails++;
      else if (u.some((i) => L.magicOrBetter(i))) uniques++;
      else problems.push(`seed ${s}: 397 at 100 ended neither magic nor in the rest: ${sig(u)}`);
      // at 4000, up to 10 magic drops until two are magic; gold up to 7 in all unless 7 others came
      const m = L.chestLoot({ sparkly: 'consolation' }, maus, hero, forced(0.5, 0.4, s));
      check(m.length > 0 && !tail(m), `seed ${s}: 397 at 4000 dropped ${sig(m)}`);
      if (m.length && m[m.length - 1].baseId === 'gld') goldEnds++;
      check(L.chestLoot({ sparkly: 'consolation' }, maus, hero, new RNG(s)).length > 0, `seed ${s}: a 397 dropped nothing`);
    }
    check(uniques > 0 && tails > 0, `397 at 100: ${uniques} done on a magic or better try, ${tails} on to the rest`);
    facts.push(`397: the rest (5 gold, 2 hp3, 2 mp3) every time at 7000; at 100 ${uniques} of 300 done on a unique try, ${tails} on to the rest; at 4000 ${goldEnds} ending in gold`);
  }

  // ── a well: two drinks, each back 30.04 s after it was taken; only a drink that did something counts ──
  {
    const w = put('well', { d2: 138 });
    game.time = 1000;
    p.life = p.stats.maxLife;
    p.mana = p.stats.maxMana;
    p.stamina = p.stats.maxStamina;
    p.poisonTime = p.chillTime = p.ampTime = 0;
    game.interact(w);
    check(C.wellCharges(w, game.time) === 2, `a well drunk from at full: ${w.charges} left`);
    const max = p.stats.maxLife;
    p.life = max * 0.2;
    game.interact(w);
    check(C.wellCharges(w, game.time) === 1 && Math.abs(p.life - max * 0.7) < 1e-6, `a drink at 20 %: life ${p.life} of ${max}, ${w.charges} left`);
    p.life = max * 0.2;
    game.time += 10;
    game.interact(w);
    check(C.wellCharges(w, game.time) === 0 && Math.abs(p.life - max * 0.7) < 1e-6, `the second drink: life ${p.life}, ${w.charges} left`);
    p.life = 1;
    game.interact(w);
    check(p.life === 1 && C.wellCharges(w, game.time) === 0 && !spent(w), `a dry well: life ${p.life}, ${w.charges} left, spent ${spent(w)}`);
    game.time = 1000 + 30.04 - 0.01;
    check(C.wellCharges(w, game.time) === 0, 'a drink came back early');
    game.time = 1000 + 30.04;
    check(C.wellCharges(w, game.time) === 1, `the first drink back after 30.04 s: ${w.charges}`);
    game.time = 1010 + 30.04;
    check(C.wellCharges(w, game.time) === 2, `the second back: ${w.charges}`);
    game.time += 500;
    check(C.wellCharges(w, game.time) === 2, `past full: ${w.charges}`);
    // poison at full life: cured, a drink taken
    p.life = max;
    p.poisonTime = 4;
    game.interact(w);
    check(p.poisonTime === 0 && w.charges === 1, `poison at full life: ${p.poisonTime} left, ${w.charges} drinks`);
    facts.push('a well: 2 drinks, 70 % life from 20 %, dry then back one by one 30.04 s after each, never past 2, poison cured');
  }

  // ── the trap monster: 18.08 % of the caskets and a maze's barrels, the area's own, D2's pick ──
  {
    const crypt = areaDef(CRYPT);
    // the first zombie or skeleton class among the kinds drawn, as the normal list's row (Crypt: skeleton1, zombie2)
    lv.spawned.get(CRYPT).kinds = ['zombie2', 'skeleton1'];
    check(trapMonster(lv, crypt) === 'zombie2', `the Crypt drawing zombie2 first: ${trapMonster(lv, crypt)}`);
    lv.spawned.get(CRYPT).kinds = ['skeleton1', 'zombie2'];
    check(trapMonster(lv, crypt) === 'skeleton1', `the Crypt drawing skeleton1 first: ${trapMonster(lv, crypt)}`);
    const moor = floor(2, 9);
    moor.spawned.get(2).kinds = ['quillrat1', 'fallen1', 'zombie1'];
    check(trapMonster(moor, areaDef(2)) === 'zombie1', `Blood Moor: ${trapMonster(moor, areaDef(2))}`);
    moor.spawned.get(2).kinds = ['quillrat1', 'fallen1'];
    check(trapMonster(moor, areaDef(2)) === null && spawnOne(moor, areaDef(2), moor.layout.start, new RNG(1)) === null, 'an area with no zombie or skeleton raised one');
    const one = spawnOne(lv, crypt, at, new RNG(5));
    check(one && one.def.id === 'skeleton1' && one.awake && one.rank === 'normal' && lv.monsters.includes(one) && Math.hypot(one.pos.x - at.x, one.pos.z - at.z) < 1.5, `spawnOne: ${one?.def.id} awake ${one?.awake} at ${JSON.stringify(one?.pos)}`);
    lv.spawned.get(CRYPT).kinds = ['zombie2', 'skeleton1'];
    // over many openings, over many seeds: one monster at most an opening, none on a shut try
    let raised = 0;
    const kinds = new Set();
    const before = lv.monsters.length;
    const N = 4000;
    for (let k = 0; k < N; k++) {
      if (k % 200 === 0) seed(77 + k);
      const o = put('casket', { d2: 3 });
      while (!o.used) {
        const m0 = lv.monsters.length;
        counted('a casket', () => game.interact(o));
        const added = lv.monsters.length - m0;
        check(added <= (o.used ? 1 : 0), `a casket ${o.used ? 'opened' : 'tried shut'} raised ${added}`);
        if (added) {
          raised++;
          kinds.add(lv.monsters[lv.monsters.length - 1].def.id);
        }
      }
    }
    check(lv.monsters.length - before === raised, `caskets raised ${lv.monsters.length - before} monsters on ${raised} openings`);
    const rate = raised / N;
    check(Math.abs(rate - 0.1808) < 0.02, `caskets raised a monster ${(rate * 100).toFixed(1)} % of the time, not about 18.08 %`);
    check([...kinds].every((k) => k === 'zombie2'), `the Crypt's caskets raised ${[...kinds].join(' ')}`);
    // a maze's barrels likewise; an exploding one drops nothing and raises nothing; an old map's raises nothing
    let b = 0;
    let bm = 0;
    for (let k = 0; k < 4000; k++) {
      const o = put('barrel', { d2: 7 });
      const m0 = lv.monsters.length;
      counted('a barrel', () => game.interact(o));
      b++;
      if (lv.monsters.length > m0) bm++;
    }
    check(Math.abs(bm / b - 0.1808) < 0.02, `a maze's barrels raised a monster ${((bm / b) * 100).toFixed(1)} % of the time`);
    const [r0, m0] = [rolled, lv.monsters.length];
    for (let k = 0; k < 300; k++) game.interact(put('barrel', { d2: 11, exploding: true }));
    check(rolled === r0 && lv.monsters.length === m0, `exploding barrels dropped ${rolled - r0}, raised ${lv.monsters.length - m0}`);
    for (let k = 0; k < 300; k++) game.interact(put('barrel'));
    check(lv.monsters.length === m0, `an old map's barrels raised ${lv.monsters.length - m0}`);
    facts.push(`trap monsters: caskets ${(rate * 100).toFixed(1)} % (zombie2 in the Crypt), a maze's barrels ${((bm / b) * 100).toFixed(1)} %, exploding and old barrels none`);
  }

  // ── every drop rolled landed ──
  facts.push(`${rolled} drops rolled, ${lv.ground.length} on the floor`);
  check(rolled === lv.ground.length, `${rolled} drops rolled, ${lv.ground.length} landed`);

  // ── the views: each kind drawn with nothing in, asking only for what objectNeeds says ──
  {
    const r = { time: 0, game: { time: 0, player: p }, fx: { add: { spawn() {} } }, level: lv, viewed: new WeakSet() };
    for (const [kind, extra] of [['casket', { d2: 3 }], ['casket', { d2: 28, hole: true }], ['remains', { d2: 54, flies: true }], ['remains', { d2: 55 }], ['well', { d2: 138 }]]) {
      const o = new WorldObject(kind, at, '', 0.5);
      Object.assign(o, extra);
      for (const used of [false, true]) {
        o.used = used;
        const [v, waits] = assets.watch(() => makeObjectView(r, o));
        v.update?.(0.1, o);
        const asked = [...(waits ?? [])];
        const said2 = objectNeeds(o, false);
        check(v.group.children.length > 0, `a ${kind} ${JSON.stringify(extra)} drew nothing`);
        check(asked.every((k) => said2.includes(k)), `a ${kind} ${JSON.stringify(extra)} asked for ${asked.join(' ')}, objectNeeds says ${said2.join(' ')}`);
        check(kind === 'remains' || asked.length > 0, `a ${kind} with no model in noted no miss, so it would never swap in`);
      }
    }
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${facts.join('\n  ')}`);
}
