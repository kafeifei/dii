// The tomes and their scrolls, Diablo II's (src/items/tomes.ts): a scroll onto its tome adds a
// charge, up to the tome's 20 and only its own kind; bought while the bag holds a tome of its kind
// with room it goes straight in at the scroll's price, shift + right-click buying as many as the tome
// takes and the gold pays for; picked up it goes in too, and a tome picked up pours its charges into
// the bag's (the rest left on the ground). A town portal reads the tome first, then a scroll, using
// the charge as it opens; with nothing to read the hero says so, in the camp nothing is read. A new
// hero starts with CharStats.txt's kit; an old hero with no town portal in the bag is given a tome
// of town portal once. The tooltips show the charges and how to read and fill them.
const DT = 1 / 60;
const KEY = 'dii-save-v1';

export default async (load) => {
  const T = await load('/src/items/tomes.ts');
  const V = await load('/src/items/vendor.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { tooltip } = await load('/src/items/item.ts');
  const { Grid } = await load('/src/items/grid.ts');
  const { D2_BASES } = await load('/src/items/d2/bases.ts');
  const { D2X_CLASSES } = await load('/src/data/d2x/classes.ts');
  const { NOT_IN_GAME } = await load('/src/items/item.ts');
  const { Game } = await load('/src/game/game.ts');
  const { GroundItem } = await load('/src/game/objects.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const { CAMP_AREA, WILD_AREA } = await load('/src/world/areas.ts');
  const problems = [];
  const facts = [];
  const check = (ok, what) => ok || problems.push(what);
  const tome = (code, qty) => Object.assign(createItem(code), { qty });

  // ── the Books.txt rows: identify's and town portal's scroll and tome, nothing else ──
  check(T.bookOf('isc')?.tome === 'ibk' && T.bookOf('ibk')?.scroll === 'isc' && T.bookOf('tsc')?.tome === 'tbk' && T.bookOf('tbk')?.spell === T.TOWN_PORTAL_SPELL, `books: ${JSON.stringify([T.bookOf('isc'), T.bookOf('tsc')])}`);
  check(!T.bookOf('0sc') && !T.bookOf('bks') && !T.bookOf('hp1'), 'a scroll of knowledge, a quest scroll or a potion has a tome');
  check(T.tomeMax(createItem('tbk')) === 20 && T.tomeMax(createItem('ibk')) === D2_BASES.ibk.stack[1], 'a tome holds Misc.txt maxstack');

  // ── a scroll onto its tome: one more charge, up to 20, only its kind ──
  for (const [scroll, code] of [['tsc', 'tbk'], ['isc', 'ibk']]) {
    const t = tome(code, 18);
    check(T.scrollIntoTome(createItem(scroll), t) && t.qty === 19, `${scroll} onto a ${code} of 18: ${t.qty}`);
    check(T.scrollIntoTome(createItem(scroll), t) && t.qty === 20, `${scroll} onto a ${code} of 19: ${t.qty}`);
    check(!T.scrollIntoTome(createItem(scroll), t) && t.qty === 20, `${scroll} onto a full ${code}: ${t.qty}`);
  }
  check(!T.scrollIntoTome(createItem('isc'), tome('tbk', 3)) && !T.scrollIntoTome(createItem('tsc'), tome('ibk', 3)), 'a scroll went into the other kind of tome');
  check(T.tomeCharges(tome('tbk', 0)) === 0 && !T.readable(tome('tbk', 0)) && T.readable(createItem('tsc')), 'an empty tome reads, or a scroll does not');

  // ── the bag's tome a scroll would go into: one of its kind with room, the first ──
  const bag = new Grid(10, 4);
  const full = tome('tbk', 20);
  const roomy = tome('tbk', 7);
  bag.add(full);
  bag.add(tome('ibk', 3));
  bag.add(roomy);
  check(T.fillableTome(bag, createItem('tsc')) === roomy, 'a scroll of town portal would not go into the tome with room');
  check(T.fillableTome(bag, createItem('isc'))?.baseId === 'ibk' && !T.fillableTome(bag, createItem('hp1')), 'the tome of identify for its scroll, none for a potion');
  bag.add(createItem('tsc'));
  check(T.townPortalsIn(bag) === 20 + 7 + 1 && T.townPortalFrom(bag) === full, `town portals in the bag ${T.townPortalsIn(bag)}, read from ${T.townPortalFrom(bag)?.baseId}`);

  // ── the shop: a scroll bought goes into the tome; shift + right-click fills it, paying for each ──
  const store = V.fillStore(V.CAMP_VENDORS, 5, 0);
  const shelf = store.all().find((it) => it.baseId === 'tsc');
  const shelfTome = store.all().find((it) => it.baseId === 'tbk');
  check(shelf && store.perm.has(shelf) && shelfTome && shelfTome.qty >= 1 && shelfTome.qty <= 4, `Akara's shelf: a scroll of town portal ${!!shelf}, a tome with ${shelfTome?.qty} (D2: 1 to spawnstack − 1)`);
  const each = V.buyPrice(store, shelf);
  check(each === V.priceAt(shelf, 'buy', 'akara') && each > 0, `a scroll of town portal costs ${each}`);
  {
    const b = new Grid(10, 4);
    const t = tome('tbk', 3);
    b.add(t);
    const purse = { gold: 1000, stashGold: 5000 };
    const one = V.buyIntoTome(store, shelf, b, purse);
    check(one?.n === 1 && one.spent === each && t.qty === 4 && purse.gold === 1000 - each && purse.stashGold === 5000 && b.items.length === 1, `one bought into a tome of 3: ${JSON.stringify(one && { n: one.n, spent: one.spent })}, tome ${t.qty}, gold ${purse.gold}`);
    check(store.contains(shelf), 'a permanent scroll left the shelf');
    // fill: as many as it takes (16) and the gold pays for, each at the scroll's price
    const rich = { gold: 100000, stashGold: 0 };
    const filled = V.buyIntoTome(store, shelf, b, rich, {}, true);
    check(filled?.n === 16 && filled.spent === 16 * each && t.qty === 20 && rich.gold === 100000 - 16 * each, `filled from 4: ${filled?.n} for ${filled?.spent} (16 × ${each}), tome ${t.qty}`);
    const short = tome('tbk', 0);
    const b2 = new Grid(10, 4);
    b2.add(short);
    const poor = { gold: each * 3 + each - 1, stashGold: 0 };
    const part = V.buyIntoTome(store, shelf, b2, poor, {}, true);
    check(part?.n === 3 && short.qty === 3 && poor.gold === each - 1, `filled with gold for 3: ${part?.n}, tome ${short.qty}, gold left ${poor.gold}`);
    const none = V.buyIntoTome(store, shelf, b2, poor, {}, true);
    check(none?.n === 0 && short.qty === 3 && poor.gold === each - 1, `with gold for none: ${none?.n}, tome ${short.qty}`);
    // no tome with room: bought the usual way
    check(V.buyIntoTome(store, shelf, b, rich) === null && V.buyIntoTome(store, shelf, new Grid(10, 4), rich) === null, 'a scroll bought into a full tome, or with no tome');
    const id = store.all().find((it) => it.baseId === 'isc');
    check(V.buyIntoTome(store, id, b, rich) === null, 'a scroll of identify bought into a tome of town portal');
    // a tome as the shelf has it: its charges with it, priced by them (Books.txt CostPerCharge)
    const bought = V.takeFromStore(store, shelfTome);
    check(bought.qty === shelfTome.qty && bought.uid !== shelfTome.uid && V.buyPrice(store, shelfTome) === V.priceAt({ ...shelfTome }, 'buy', 'akara'), `a tome bought holds ${bought.qty}, the shelf's ${shelfTome.qty}`);
    facts.push(`scroll ${each}, 16 into a tome ${16 * each}, a tome of ${shelfTome.qty} ${V.buyPrice(store, shelfTome)}`);
  }

  // ── the game: a new hero's kit, picking up, reading a town portal ──
  localStorage.clear();
  save.setSlot(0);
  const said = [];
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
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
  for (const [cls, code] of [['sorceress', 'sor'], ['paladin', 'pal']]) {
    game.newGame('', cls);
    const p = game.player;
    const kit = D2X_CLASSES[code].items;
    const worn = Object.fromEntries(kit.filter((k) => k.loc).map((k) => [k.loc, k.code]));
    const bagCodes = p.inventory.items.map((x) => x.item.baseId).sort().join();
    check(p.equipment.weapon?.baseId === worn.rarm && (p.equipment.offhand?.baseId ?? undefined) === worn.larm, `${cls}: wears ${p.equipment.weapon?.baseId} and ${p.equipment.offhand?.baseId}, CharStats ${worn.rarm} and ${worn.larm}`);
    check(p.belt.every((c) => c.length === 1 && c[0].baseId === 'hp1') && kit.find((k) => k.code === 'hp1')?.n === 4, `${cls}: the belt holds ${p.belt.map((c) => c.map((x) => x.baseId).join('+') || '-').join(' ')}`);
    check(bagCodes === 'isc,tsc', `${cls}: the bag holds ${bagCodes}, CharStats tsc and isc`);
    check(p.equipment.weapon.dur === p.equipment.weapon.maxDur, `${cls}: the weapon starts at ${p.equipment.weapon.dur}/${p.equipment.weapon.maxDur}`);
  }
  const p = game.player;
  const west = game.level;
  const scroll0 = p.inventory.items.find((x) => x.item.baseId === 'tsc').item;

  // picking up: a scroll into the bag's tome with room; a tome's charges into it, the rest left lying
  const t = tome('tbk', 15);
  p.inventory.add(t);
  const drop = (item) => {
    const gi = new GroundItem({ ...p.pos }, item, 0, p.pos);
    west.ground.push(gi);
    return gi;
  };
  const items = () => p.inventory.items.length;
  const n0 = items();
  game.pickupGround(drop(createItem('tsc')));
  check(t.qty === 16 && items() === n0 && !west.ground.length, `a scroll picked up: tome ${t.qty}, ${items() - n0} more in the bag, ${west.ground.length} on the ground`);
  const other = tome('tbk', 10);
  const lying = drop(other);
  game.pickupGround(lying);
  check(t.qty === 20 && other.qty === 6 && west.ground.includes(lying) && items() === n0, `a tome of 10 picked up beside one of 16: ${t.qty}, ${other.qty} left on it, on the ground ${west.ground.includes(lying)}`);
  game.pickupGround(lying);
  check(!west.ground.length && p.inventory.contains(other) && items() === n0 + 1, 'the rest of the tome, the bag\'s one full, was not picked up as it is');
  p.inventory.remove(other);
  t.qty = 12;
  const small = tome('tbk', 3);
  game.pickupGround(drop(small));
  check(t.qty === 15 && !west.ground.length && !p.inventory.contains(small) && items() === n0, `a tome of 3 picked up beside one of 12: ${t.qty}, it is gone ${!p.inventory.contains(small)}`);
  t.qty = 20;
  game.pickupGround(drop(createItem('tsc')));
  check(items() === n0 + 1 && !west.ground.length, 'a scroll picked up beside a full tome did not go in the bag');
  game.pickupGround(drop(createItem('isc')));
  check(items() === n0 + 2, 'a scroll of identify went somewhere but the bag');
  for (const x of [...p.inventory.items]) if (x.item.baseId === 'tsc' && x.item !== scroll0) p.inventory.remove(x.item);
  for (const x of [...p.inventory.items]) if (x.item.baseId === 'isc' && p.inventory.items.filter((y) => y.item.baseId === 'isc').length > 1) p.inventory.remove(x.item);

  // reading a town portal: not in the camp; out on the moor the tome first, its charge used as the portal opens
  said.length = 0;
  t.qty = 2;
  game.castTownPortal();
  check(p.state !== 'cast' && t.qty === 2 && said.includes('你已经在营地里了'), `in the camp: ${p.state}, tome ${t.qty}, said ${said.join(' / ')}`);
  const gate = west.layout.seams.find((s) => s.a === CAMP_AREA && s.b === WILD_AREA);
  let moor = null;
  for (let k = 8; k < 40 && !moor; k++) {
    const c = { x: gate.tb.x + (gate.tb.x - gate.ta.x) * k, z: gate.tb.z + (gate.tb.z - gate.ta.z) * k };
    if (west.map.circleClear(c.x, c.z, 0.6) && west.areaAt(c.x, c.z).id === WILD_AREA) moor = c;
  }
  if (!moor) throw new Error('no open ground out past the camp gate');
  game.teleportWithin(moor);
  // nothing near to cut the cast short
  for (const m of west.monsters) if (!m.dead && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 30) game.killMonster(m, 'phys');
  west.ground.length = 0;
  const portals = () => west.objects.filter((o) => o.kind === 'portal').length;
  const cast = (from) => {
    game.castTownPortal(from);
    const casting = p.state === 'cast';
    for (let i = 0; i < 90 && p.state === 'cast'; i++) game.update(DT);
    return casting;
  };
  check(cast() && t.qty === 1 && portals() === 1 && p.inventory.contains(scroll0), `the key: tome ${t.qty}, ${portals()} portal(s), the scroll kept ${p.inventory.contains(scroll0)}`);
  game.castTownPortal();
  check(p.state === 'cast' && t.qty === 1, `cast begun: the tome still ${t.qty} until it opens`);
  for (let i = 0; i < 90 && p.state === 'cast'; i++) game.update(DT);
  check(t.qty === 0 && portals() === 1, `the tome's last: ${t.qty}, ${portals()} portal(s) (a new one closes the old)`);
  check(cast() && !p.inventory.contains(scroll0) && portals() === 1, `the tome empty, the scroll: used up ${!p.inventory.contains(scroll0)}`);
  said.length = 0;
  check(!cast() && portals() === 1 && said.includes('没有城镇传送卷轴了'), `nothing to read: said ${said.join(' / ')}`);
  said.length = 0;
  check(!cast(t) && said.some((s) => s.includes('里没有卷轴了')), `the empty tome right-clicked: said ${said.join(' / ')}`);
  // right-clicked, a scroll is read even with a tome in the bag
  t.qty = 5;
  const s2 = createItem('tsc');
  p.inventory.add(s2);
  check(cast(s2) && !p.inventory.contains(s2) && t.qty === 5, `a scroll right-clicked: used up ${!p.inventory.contains(s2)}, tome ${t.qty}`);
  // a cast cut short reads nothing
  game.castTownPortal();
  p.setState('hit', 0.2);
  for (let i = 0; i < 30; i++) game.update(DT);
  check(t.qty === 5, `a cast cut short used a charge: tome ${t.qty}`);

  // ── tooltips: the charges, the right-click hint, how to fill it ──
  const lines = (it) => tooltip(it, { level: 1, str: 10, dex: 10, cls: 'paladin', worn: [] }).map((l) => l.text);
  const tbk = lines(tome('tbk', 7));
  const ibk = lines(tome('ibk', 0));
  check(tbk.includes('数量: 7/20') && tbk.includes('右键点击打开回城传送门') && tbk.some((l) => l.startsWith('把城镇传送卷轴放到书上补充')) && !tbk.includes(NOT_IN_GAME), `the tome of town portal: ${tbk.join(' / ')}`);
  check(ibk.includes('数量: 0/20') && ibk.includes('右键点击，再点一件未辨识的物品') && ibk.some((l) => l.startsWith('把鉴定卷轴放到书上补充')), `the tome of identify: ${ibk.join(' / ')}`);
  check(lines(createItem('tsc')).includes('右键点击打开回城传送门'), `the scroll of town portal: ${lines(createItem('tsc')).join(' / ')}`);

  // ── an old hero: a tome of town portal once, none for a hero with one ──
  {
    const old = {
      v: 3, name: '旧英雄', cls: 'paladin', level: 5, xp: 6000, base: { str: 25, dex: 20, vit: 25, ene: 15 }, statPoints: 20, skillPoints: 4, skills: { sacred_strike: 1 },
      equipment: {}, inventory: [], stash: [], belt: [[], [], [], []], gold: 0, stashGold: 0, binds: ['attack'], activeAura: null, depthReached: 0, waypoints: [0], depth: 0, time: 1,
    };
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify(old));
    const s = save.loadSave();
    const gift = s.player.inventory.items.map((x) => x.item).filter((it) => it.baseId === 'tbk');
    check(gift.length === 1 && gift[0].qty === 5 && T.townPortalFrom(s.player.inventory) === gift[0], `an old hero with an empty bag got ${gift.map((g) => `${g.baseId}×${g.qty}`).join() || 'nothing'}`);
    save.writeSave(s.player, CAMP_AREA);
    const again = save.loadSave();
    check(again.player.inventory.items.filter((x) => x.item.baseId === 'tbk').length === 1, 'loaded again, a second tome');
    // a full bag: by the camp stash
    const crowded = { ...old, inventory: Array.from({ length: 40 }, (_, i) => ({ item: { uid: `c${i}`, baseId: 'hp1', rarity: 'normal', ilvl: 1, name: 'hp1', mods: [], sockets: 0, socketed: [], reqLvl: 1 }, x: i % 10, y: Math.floor(i / 10) })) };
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify(crowded));
    const c = save.loadSave();
    check(c.player.inventory.items.length === 40 && c.player.unplaced.some((it) => it.baseId === 'tbk' && it.qty === 5), `a full bag: ${c.player.inventory.items.length} in it, by the stash ${c.player.unplaced.map((it) => it.baseId).join()}`);
    // a version 4 save from before the step with a scroll of town portal in the bag: nothing given
    game.newGame('', 'paladin');
    game.save();
    const cur = JSON.parse(localStorage.getItem(KEY));
    localStorage.setItem(KEY, JSON.stringify({ ...cur, mig: { ...cur.mig, items: 1 } }));
    const withScroll = save.loadSave();
    check(!withScroll.player.inventory.items.some((x) => x.item.baseId === 'tbk') && withScroll.player.inventory.items.some((x) => x.item.baseId === 'tsc'), `a hero with a scroll got ${withScroll.player.inventory.items.map((x) => x.item.baseId).join()}`);
  }
  localStorage.clear();

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  charges to 20 by kind; bought into the tome, shift-filled (${facts.join('; ')}); picked up into it, tomes poured together; the portal reads the tome, then a scroll, as it opens; D2's kit; old heroes a tome once; tooltips`);
};
