// The stash, Diablo II: Resurrected's (src/items/stash.ts, src/game/save.ts): the hero's own page and
// five shared pages, the shared ones the player's rather than the hero's. Their record round-trips
// beside the hero's save, which keeps only the personal page; old saves (versions 1 to 4) load with
// their stash as it was on the personal page, and see the shared pages too, as does a new hero in
// any difficulty. Quest items, the Horadric Cube among them, stay out of the shared pages; each page
// keeps its own gold, as D2R's do, each up to 2,500,000, and a withdrawal only what the hero can
// carry; dying costs none of the shared gold. Two tabs with two heroes merge their changes rather
// than write over each other's, keeping an item rather than losing it, and two mending one item keep
// one of it; one hero is in one tab at a time: the tab that opens it last has it, the one before
// writes it a last time if nothing was written over it, then never again. A newer build's record is
// never written, an older one is backed up first (version 1's one pool of gold becomes 共享 1's), an
// unreadable one kept aside. The item on the cursor is saved with the hero, among the items by the
// stash for a build that doesn't know it, and a hero who won't be saved can only look.
const KEY = 'dii-save-v1';
const SHARED = 'dii-shared';

export default async (load) => {
  const save = await load('/src/game/save.ts');
  const S = await load('/src/items/stash.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { isUnknown } = await load('/src/items/item.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { CAMP_AREA } = await load('/src/world/areas.ts');
  const problems = [];
  const facts = [];
  const check = (ok, what) => ok || problems.push(what);
  const thisBuild = () => Object.fromEntries(Object.entries(save.MIGRATIONS).map(([k, steps]) => [k, steps.length]));
  const record = () => JSON.parse(localStorage.getItem(SHARED));
  const heroSave = () => JSON.parse(localStorage.getItem(KEY));
  /** where an item lies in a record or a stash: "page x,y" ('-' when it isn't there) */
  const inRecord = (rec, uid) => {
    for (let pg = 0; pg < rec.pages.length; pg++) for (const pl of rec.pages[pg]) if (pl.item.uid === uid) return `${pg} ${pl.x},${pl.y}`;
    return '-';
  };
  const inStash = (s, uid) => {
    for (let pg = 0; pg < s.pages.length; pg++) for (const pl of s.pages[pg].items) if (pl.item.uid === uid) return `${pg} ${pl.x},${pl.y}`;
    return '-';
  };
  const placedUids = (list) => (list ?? []).map((pl) => pl.item.uid);
  /** a game as the page makes one, its hooks a stand-in for the UI's */
  const makeGame = () => {
    const g = new Game({}, new Sfx());
    const ui = { said: [], cursor: null };
    g.hooks = {
      message: (t) => ui.said.push(t),
      openPanel() {},
      levelChanged() {},
      areaChanged() {},
      teleported() {},
      playerDied() {},
      inventoryChanged() {},
      getCursorItem: () => ui.cursor,
      setCursorItem: (it) => (ui.cursor = it),
      hoveredGroundId: () => null,
      levelUp() {},
    };
    g.ui = ui;
    return g;
  };
  const started = (name, cls = 'paladin') => {
    const g = makeGame();
    g.newGame(name, cls);
    return g;
  };
  const reset = () => {
    localStorage.clear();
    save.setSlot(0);
  };

  // ── the record: beside the hero's save, round trip ──
  reset();
  const a = started('甲');
  const sword = createItem('lsd');
  const ring = createItem('rin', 'magic');
  const rune = createItem('r05');
  const mine = createItem('cap');
  a.shared.pages[0].place(sword, 0, 0);
  a.shared.pages[2].place(ring, 4, 5);
  a.shared.pages[4].place(rune, 9, 9);
  a.shared.gold[0] = 12345;
  a.shared.gold[3] = 678;
  a.player.stash.place(mine, 3, 3);
  a.save();
  const rec = record();
  const GOLD = JSON.stringify([12345, 0, 0, 678, 0]);
  check(rec.v === 2 && rec.pages.length === S.SHARED_PAGES && JSON.stringify(rec.gold) === GOLD && typeof rec.rev === 'string' && JSON.stringify(rec.mig) === JSON.stringify(thisBuild()), `the record: v ${rec.v}, ${rec.pages.length} pages, gold ${JSON.stringify(rec.gold)}, rev ${rec.rev}, mig ${JSON.stringify(rec.mig)}`);
  check(inRecord(rec, sword.uid) === '0 0,0' && inRecord(rec, ring.uid) === '2 4,5' && inRecord(rec, rune.uid) === '4 9,9' && inRecord(rec, mine.uid) === '-', `in the record: sword ${inRecord(rec, sword.uid)}, ring ${inRecord(rec, ring.uid)}, rune ${inRecord(rec, rune.uid)}, the personal cap ${inRecord(rec, mine.uid)}`);
  const hs = heroSave();
  check(JSON.stringify(placedUids(hs.stash)) === JSON.stringify([mine.uid]) && !('shared' in hs) && hs.stashGold === 0, `the hero's save holds only the personal page: ${JSON.stringify(placedUids(hs.stash))}`);
  {
    const back = save.loadShared();
    const s = back.stash;
    const same = (it) => JSON.stringify(s.items().find((x) => x.uid === it.uid)) === JSON.stringify(it);
    check(!s.readOnly && !back.overflow.length && JSON.stringify(s.gold) === GOLD && [sword, ring, rune].every(same) && inStash(s, ring.uid) === '2 4,5' && s.items().length === 3, `read back: ${s.items().length} items, gold ${JSON.stringify(s.gold)}, ring ${inStash(s, ring.uid)}, readOnly ${s.readOnly}`);
  }
  facts.push('round trip');

  // ── a new hero, in any difficulty, finds them; their own page starts empty ──
  {
    const b = started('乙', 'sorceress');
    check(b.shared.items().length === 3 && inStash(b.shared, sword.uid) === '0 0,0' && JSON.stringify(b.shared.gold) === GOLD && !b.player.stash.items.length && b.player.stashGold === 0, `a new hero: shared ${b.shared.items().length} items, gold ${JSON.stringify(b.shared.gold)}; own page ${b.player.stash.items.length}`);
    b.setDifficulty(2);
    check(b.shared.items().length === 3 && JSON.stringify(b.shared.gold) === GOLD, 'in hell, the shared pages are gone');
    b.save();
    const c = makeGame();
    check(c.continueGame(0) && c.player.name === '乙' && c.shared.items().length === 3 && c.player.difficulty === 2, `the new hero loaded again in hell: ${c.player.name}, ${c.shared.items().length} shared`);
  }
  facts.push('new heroes and other difficulties');

  // ── old saves: their stash on the personal page as it was, the shared pages beside it ──
  const oldItem = (baseId, more = {}) => ({ uid: `old-${baseId}-${Math.random().toString(36).slice(2)}`, baseId, rarity: 'normal', ilvl: 5, name: baseId, mods: [], sockets: 0, socketed: [], reqLvl: 1, ...more });
  for (const v of [undefined, 1, 2, 3]) {
    const stash = [
      { item: oldItem('longsword'), x: 0, y: 0 },
      { item: oldItem('ring', { rarity: 'magic', mods: [{ stat: 'str', value: 5 }] }), x: 5, y: 5 },
      { item: oldItem('hp1'), x: 9, y: 9 },
      { item: oldItem('quiltedarmor'), x: 7, y: 0 },
    ];
    const o = {
      ...(v ? { v } : {}),
      name: `旧英雄${v ?? 0}`,
      ...(v ? { cls: 'paladin' } : {}),
      level: 8, xp: 9000, base: { str: 25, dex: 20, vit: 25, ene: 15 }, statPoints: 35, skillPoints: 7, skills: {},
      equipment: {}, inventory: [], stash, belt: [[], [], [], []], gold: 10, stashGold: 777,
      binds: ['attack', null, null, null, null, null], activeAura: null, depthReached: 0, waypoints: [0], depth: 0, time: 1,
    };
    reset();
    localStorage.setItem(SHARED, JSON.stringify(rec));
    localStorage.setItem(KEY, JSON.stringify(o));
    const g = makeGame();
    const ok = g.continueGame(0);
    const p = g.player;
    const want = { longsword: 'lsd', ring: 'rin', hp1: 'hp1', quiltedarmor: 'qui' };
    const kept = stash.every(({ item, x, y }) => {
      const at = p.stash.items.find((pl) => pl.item.uid === item.uid);
      return at && at.x === x && at.y === y && at.item.baseId === want[item.baseId];
    });
    const what = `version ${v ?? '1 (no v)'}`;
    check(ok && kept && p.stash.items.length === 4 && p.stashGold === 777, `${what}: the personal page ${p.stash.items.map((pl) => `${pl.item.baseId}@${pl.x},${pl.y}`).join(' ')}, gold ${p.stashGold}`);
    check(g.shared.items().length === 3 && !g.shared.readOnly && JSON.stringify(g.shared.gold) === GOLD, `${what}: the shared pages ${g.shared.items().length}, gold ${JSON.stringify(g.shared.gold)}, ${g.shared.readOnly}`);
    g.save();
    const r2 = record();
    check(JSON.stringify(placedUids(heroSave().stash).sort()) === JSON.stringify(stash.map((pl) => pl.item.uid).sort()) && r2.pages.flat().length === 3, `${what} written back: the hero's stash ${placedUids(heroSave().stash).length}, the record's ${r2.pages.flat().length}`);
  }
  // version 4: written by this build, loaded with the shared pages beside it
  {
    reset();
    const g = started('四');
    const items = [createItem('lsd'), createItem('rin', 'rare'), createItem('box')];
    g.player.stash.place(items[0], 2, 1);
    g.player.stash.place(items[1], 0, 9);
    g.player.stash.place(items[2], 8, 8);
    g.player.stashGold = 4321;
    g.save();
    const before = JSON.stringify(heroSave().stash);
    localStorage.setItem(SHARED, JSON.stringify(rec));
    const h = makeGame();
    h.continueGame(0);
    const after = JSON.stringify(h.player.stash.items);
    check(after === before && h.player.stashGold === 4321 && h.shared.items().length === 3, `version 4: the personal page ${after === before ? 'as saved' : `changed: ${after}`}, gold ${h.player.stashGold}, shared ${h.shared.items().length}`);
  }
  facts.push('old saves (1 to 4) keep their stash on the personal page');

  // ── what may go in a shared page: not quest items (the cube, Wirt's Leg, a quest scroll), nor unknown ones ──
  {
    reset();
    const g = started('丙');
    const refused = ['box', 'leg', 'bks', 'hst'].filter((c) => S.sharedBlock(createItem(c)));
    check(refused.length === 4, `refused from the shared pages: ${refused.join()}`);
    check(['lsd', 'rin', 'tbk', 'r05', 'gcv', 'hp1'].every((c) => !S.sharedBlock(createItem(c))), 'an ordinary item refused');
    const unknown = { ...createItem('rin'), baseId: 'unknown', raw: { v: 9, mig: {}, item: {} } };
    check(isUnknown(unknown) && !!S.sharedBlock(unknown), 'an unknown item allowed');
    const cube = createItem('box');
    check(!!g.stashBlock(1, cube) && !!g.stashBlock(5, cube) && g.stashBlock(0, cube) === null, 'the cube: refused on a shared page, or not on the personal one');
  }
  facts.push('quest items refused');

  // ── gold: each page's own, as D2R keeps it; D2R's most a page, what the hero can carry ──
  {
    reset();
    const g = started('丁');
    const p = g.player;
    const shared = () => JSON.stringify(g.shared.gold);
    p.level = 5;
    p.gold = 30000;
    check(g.moveStashGold(0, 'deposit') === 30000 && p.stashGold === 30000 && p.gold === 0 && shared() === '[0,0,0,0,0]', `deposited on the personal page: ${p.stashGold}, shared ${shared()}`);
    p.gold = 20000;
    check(g.moveStashGold(3, 'deposit') === 20000 && shared() === '[0,0,20000,0,0]' && p.stashGold === 30000, `deposited on shared page 3: ${shared()}`);
    check(g.moveStashGold(5, 'withdraw') === 0 && p.gold === 0, `withdrawn on shared page 5, which has none: ${shared()}, carried ${p.gold}`);
    check(g.moveStashGold(3, 'withdraw') === 20000 && shared() === '[0,0,0,0,0]' && p.gold === 20000, `withdrawn on shared page 3: ${shared()}, carried ${p.gold}`);
    p.gold = 20000;
    g.moveStashGold(2, 'deposit');
    check(shared() === '[0,20000,0,0,0]' && g.moveStashGold(6, 'deposit') === 0 && g.moveStashGold(6, 'withdraw') === 0, `a page past the last: ${shared()}`);
    g.moveStashGold(2, 'withdraw');
    // a level 5 hero carries 50,000 at most (Units.cpp:3115)
    check(g.moveStashGold(0, 'withdraw') === 30000 && p.gold === 50000 && g.moveStashGold(0, 'deposit') === 50000, 'the personal page round trip');
    p.gold = 45000;
    check(g.moveStashGold(0, 'withdraw') === 5000 && p.gold === 50000 && p.stashGold === 45000, `a withdrawal past what the hero carries: ${p.gold} carried, ${p.stashGold} left`);
    check(g.moveStashGold(0, 'withdraw') === 0, 'withdrawn with the purse full');
    // D2R's most, 2,500,000 a page: one full, the next takes the rest
    g.shared.gold[0] = S.STASH_GOLD_MAX - 1000;
    p.gold = 5000;
    check(g.moveStashGold(1, 'deposit') === 1000 && g.shared.gold[0] === S.STASH_GOLD_MAX && p.gold === 4000, `共享 1 filled: ${g.shared.gold[0]}, ${p.gold} left carried`);
    check(g.moveStashGold(1, 'deposit') === 0, 'deposited past a page\'s most');
    check(g.moveStashGold(2, 'deposit') === 4000 && g.shared.gold[1] === 4000 && p.gold === 0, `共享 2 takes it: ${shared()}`);
    g.save();
    const n = started('戊');
    const want = JSON.stringify([S.STASH_GOLD_MAX, 4000, 0, 0, 0]);
    check(JSON.stringify(n.shared.gold) === want && n.player.stashGold === 0, `a new hero: the pages' gold ${JSON.stringify(n.shared.gold)}, own page ${n.player.stashGold}`);
    // dying costs a share of the carried and personal gold, none of the shared pages' (D2R)
    n.player.level = 10;
    n.player.gold = 1000;
    n.player.stashGold = 10000;
    n.killPlayer();
    check(n.player.stashGold < 10000 && JSON.stringify(n.shared.gold) === want, `dying: personal ${n.player.stashGold}, shared ${JSON.stringify(n.shared.gold)}`);
  }
  facts.push('gold per page');

  // ── two tabs at once ──
  {
    reset();
    const A = started('甲');
    const B = started('乙');
    const swordA = createItem('lsd');
    const ringB = createItem('rin', 'magic');
    A.shared.pages[0].place(swordA, 0, 0);
    A.syncShared();
    // B never read A's sword: its ring at the same spot gives way, both kept
    B.shared.pages[0].place(ringB, 0, 0);
    const adopted = B.syncShared();
    check(adopted && inRecord(record(), swordA.uid) === '0 0,0' && inRecord(record(), ringB.uid).startsWith('0 ') && inRecord(record(), ringB.uid) !== '0 0,0', `B over A: sword ${inRecord(record(), swordA.uid)}, ring ${inRecord(record(), ringB.uid)}`);
    check(inStash(B.shared, swordA.uid) === '0 0,0' && A.syncShared() && inStash(A.shared, ringB.uid) === inRecord(record(), ringB.uid), `each sees both: A has the ring at ${inStash(A.shared, ringB.uid)}`);
    // B takes the sword to its bag: written with B's hero; A, syncing before it acts, finds it gone
    const swordB = B.shared.items().find((it) => it.uid === swordA.uid);
    B.shared.pages[0].remove(swordB);
    B.player.inventory.add(swordB);
    B.syncShared();
    check(inRecord(record(), swordA.uid) === '-' && heroSave().inventory.some((pl) => pl.item.uid === swordA.uid) && heroSave().name === '乙', 'the sword taken by B: still in the record, or not in B\'s save');
    check(A.syncShared() && inStash(A.shared, swordA.uid) === '-', 'A still shows the sword B took');
    // gold: each tab's deposit on top of the other's, page by page
    A.player.gold = 1000;
    B.player.gold = 700;
    A.moveStashGold(1, 'deposit');
    A.syncShared();
    B.player.level = 1;
    B.moveStashGold(1, 'deposit');
    B.syncShared();
    check(record().gold[0] === 1700 && B.shared.gold[0] === 1700 && A.syncShared() && A.shared.gold[0] === 1700, `deposits from both on 共享 1: ${JSON.stringify(record().gold)}`);
    A.player.gold = 300;
    A.moveStashGold(4, 'deposit');
    A.syncShared();
    // B, at level 1, carries 10,000 at most: 200 of 共享 1's (Units.cpp:3115)
    B.player.gold = 9800;
    B.moveStashGold(1, 'withdraw');
    B.syncShared();
    check(JSON.stringify(record().gold) === '[1500,0,0,300,0]' && JSON.stringify(B.shared.gold) === '[1500,0,0,300,0]' && B.player.gold === 10000, `A on 共享 4, B taking from 共享 1: ${JSON.stringify(record().gold)}, B carries ${B.player.gold}`);
    A.syncShared();
    // a page full from both: what B put in past its most goes back to B
    A.player.level = B.player.level = 99;
    A.player.gold = 2_000_000;
    B.player.gold = 1_000_000;
    A.moveStashGold(1, 'deposit');
    A.syncShared();
    B.moveStashGold(1, 'deposit');
    B.syncShared();
    const over = 1500 + 2_000_000 + 1_000_000 - S.STASH_GOLD_MAX;
    check(record().gold[0] === S.STASH_GOLD_MAX && record().gold[3] === 300 && B.player.gold === over && B.shared.gold[0] === S.STASH_GOLD_MAX, `共享 1 over its most: ${JSON.stringify(record().gold)}, B carries ${B.player.gold}, want ${over} back`);
    A.syncShared();
    // both take the same item before either syncs: kept by both, not lost
    const amu = createItem('amu', 'magic');
    A.shared.pages[1].place(amu, 3, 3);
    A.syncShared();
    B.syncShared();
    const amuB = B.shared.items().find((it) => it.uid === amu.uid);
    A.shared.pages[1].remove(amu);
    A.player.inventory.add(amu);
    B.shared.pages[1].remove(amuB);
    B.player.inventory.add(amuB);
    A.syncShared();
    B.syncShared();
    check(inRecord(record(), amu.uid) === '-' && A.player.inventory.contains(amu) && B.player.inventory.contains(amuB), 'an item both took: lost');
    // moved here, changed there: as changed, where it was moved
    const shield = createItem('buc');
    A.shared.pages[2].place(shield, 0, 0);
    A.syncShared();
    B.syncShared();
    const shieldB = B.shared.items().find((it) => it.uid === shield.uid);
    shield.sockets = 1;
    shield.socketed = ['r05'];
    A.syncShared();
    B.shared.pages[2].remove(shieldB);
    B.shared.pages[2].place(shieldB, 6, 6);
    B.syncShared();
    const got = record().pages[2].find((pl) => pl.item.uid === shield.uid);
    check(got && got.x === 6 && got.y === 6 && got.item.socketed?.[0] === 'r05' && record().pages.flat().filter((pl) => pl.item.baseId === 'buc').length === 1, `moved by B, socketed by A: ${JSON.stringify(got && { x: got.x, y: got.y, s: got.item.socketed })}`);
    A.syncShared();
    // changed both ways: both kept
    const helm = createItem('cap');
    A.shared.pages[3].place(helm, 0, 0);
    A.syncShared();
    B.syncShared();
    const helmB = B.shared.items().find((it) => it.uid === helm.uid);
    helm.sockets = 2;
    helm.socketed = ['r05'];
    A.syncShared();
    helmB.identified = false;
    B.syncShared();
    check(record().pages[3].filter((pl) => pl.item.baseId === 'cap').length === 2, `changed in both tabs: ${record().pages[3].length} kept`);
    A.syncShared();
    // socketed in B, taken to A's bag: B's kept as another item, so no uid is in two places
    const skull = createItem('skp');
    skull.sockets = 1;
    A.shared.pages[4].place(skull, 0, 0);
    A.syncShared();
    B.syncShared();
    const skullB = B.shared.items().find((it) => it.uid === skull.uid);
    A.shared.pages[4].remove(skull);
    A.player.inventory.add(skull);
    A.syncShared();
    skullB.socketed = ['r05'];
    B.syncShared();
    const skulls = record().pages[4].filter((pl) => pl.item.baseId === 'skp');
    check(skulls.length === 1 && skulls[0].item.socketed?.[0] === 'r05' && skulls[0].item.uid !== skull.uid && A.player.inventory.contains(skull), `socketed in B, taken by A: ${JSON.stringify(skulls.map((pl) => [pl.item.uid === skull.uid, pl.item.socketed]))}`);
    check(A.syncShared() && A.shared.items().every((it) => it.uid !== skull.uid), 'A has the skull cap\'s uid on a shared page and in its bag');
    // the other way round: taken by B, socketed in A (which hasn't seen B take it)
    const cap2 = createItem('skp');
    cap2.sockets = 1;
    A.shared.pages[4].place(cap2, 4, 4);
    A.syncShared();
    B.syncShared();
    const cap2B = B.shared.items().find((it) => it.uid === cap2.uid);
    const cap2Uid = cap2.uid;
    B.shared.pages[4].remove(cap2B);
    B.player.inventory.add(cap2B);
    B.syncShared();
    cap2.socketed = ['r05'];
    A.syncShared();
    const cap2s = record().pages[4].filter((pl) => pl.item.baseId === 'skp' && pl.item.uid !== skulls[0].item.uid);
    check(cap2s.length === 1 && cap2s[0].item.socketed?.[0] === 'r05' && cap2s[0].item.uid !== cap2Uid && cap2B.uid === cap2Uid && B.player.inventory.contains(cap2B), `taken by B, socketed in A: ${JSON.stringify(cap2s.map((pl) => [pl.item.uid === cap2Uid, pl.item.socketed]))}`);
    check(B.syncShared() && B.shared.items().every((it) => it.uid !== cap2Uid), 'B has the second cap\'s uid on a shared page and in its bag');
    // socketed in B and written first, then taken to A's bag before A read that: the same, seen from A
    const cap3 = createItem('skp');
    cap3.sockets = 1;
    A.syncShared();
    A.shared.pages[4].place(cap3, 7, 7);
    A.syncShared();
    B.syncShared();
    const cap3Uid = cap3.uid;
    B.shared.items().find((it) => it.uid === cap3Uid).socketed = ['r05'];
    B.syncShared();
    A.shared.pages[4].remove(cap3);
    A.player.inventory.add(cap3);
    A.syncShared();
    const cap3s = record().pages[4].filter((pl) => pl.x === 7 && pl.y === 7);
    check(cap3s.length === 1 && cap3s[0].item.socketed?.[0] === 'r05' && cap3s[0].item.uid !== cap3Uid && cap3.uid === cap3Uid && A.shared.items().every((it) => it.uid !== cap3Uid), `socketed in B first, taken by A: ${JSON.stringify(cap3s.map((pl) => [pl.item.uid === cap3Uid, pl.item.socketed]))}`);
    B.syncShared();
    // B writes before A's last write has reached it (storage gets to other tabs a moment late): B's
    // record says what it had read, and A merges from there, so A's rune isn't taken for one B removed
    reset();
    const P = started('先');
    const Q = started('后');
    P.shared.pages[0].add(createItem('lsd'));
    P.syncShared();
    Q.syncShared();
    const rev1 = localStorage.getItem(SHARED);
    const r10 = createItem('r10');
    P.shared.pages[1].add(r10);
    P.syncShared();
    localStorage.setItem(SHARED, rev1);
    const gem = createItem('gcv');
    Q.shared.pages[1].add(gem);
    Q.syncShared();
    check(inRecord(record(), r10.uid) === '-' && record().base === JSON.parse(rev1).rev, `B's stale write: the rune ${inRecord(record(), r10.uid)}, base ${record().base}`);
    check(P.syncShared() && inRecord(record(), r10.uid) !== '-' && inRecord(record(), gem.uid) !== '-' && record().pages.flat().length === 3, `A after B's stale write: the rune ${inRecord(record(), r10.uid)}, the gem ${inRecord(record(), gem.uid)}, ${record().pages.flat().length} in all`);
    check(Q.syncShared() && inStash(Q.shared, r10.uid) !== '-', 'B never gets A\'s rune');
    // no room left once both are laid out: what fits nowhere goes to B's hero, by the camp stash
    reset();
    const A2 = started('满甲');
    const B2 = started('满乙');
    const full = Array.from({ length: 500 }, () => createItem('rin'));
    full.forEach((it, i) => A2.shared.pages[Math.floor(i / 100)].place(it, i % 10, Math.floor((i % 100) / 10)));
    A2.syncShared();
    const last = createItem('amu', 'magic');
    B2.shared.pages[0].place(last, 0, 0);
    B2.syncShared();
    check(record().pages.flat().length === 500 && B2.player.unplaced.includes(last) && heroSave().unplaced?.some((it) => it.uid === last.uid), `no room: ${record().pages.flat().length} in the record, the amulet by B's stash ${B2.player.unplaced.includes(last)}, in B's save ${heroSave().unplaced?.some((it) => it.uid === last.uid)}`);
    // a newer build wrote the record: B leaves it alone, and what B put in since goes back to B's hero, its gold too
    reset();
    const C = started('丙');
    const D = started('丁');
    const newer = { ...record(), v: 3, pages: [[{ item: createItem('lsd'), x: 0, y: 0 }], [], [], [], []] };
    localStorage.setItem(SHARED, JSON.stringify(newer));
    const z = createItem('rin', 'rare');
    D.shared.pages[1].place(z, 5, 5);
    D.player.gold = 900;
    D.moveStashGold(3, 'deposit');
    D.syncShared();
    check(!!D.shared.readOnly && D.player.unplaced.includes(z) && D.player.gold === 900 && record().v === 3 && record().pages[1].length === 0, `a newer build's record under D: readOnly ${D.shared.readOnly}, z by the stash ${D.player.unplaced.includes(z)}, gold back ${D.player.gold}, v ${record().v}`);
    D.syncShared();
    C.save();
    check(JSON.stringify(record()) === JSON.stringify(newer), 'the newer record written over');
    // a self-repairing item on a shared page mends there (D2 runs an item's event wherever it lies)
    reset();
    const M = started('修甲');
    const N = started('修乙');
    const mend = { ...createItem('lsd'), props: [{ c: 'rep-dur', p: 20, min: 20, max: 20 }] };
    mend.dur = 10;
    M.shared.pages[2].place(mend, 0, 0);
    M.syncShared();
    N.syncShared();
    const mendN = N.shared.items().find((it) => it.uid === mend.uid);
    M.player.mendItems(30, M.shared.pages);
    N.player.mendItems(60, N.shared.pages);
    check(mend.dur > 10 && mendN.dur > mend.dur, `mended on a shared page: ${mend.dur}, ${mendN.dur} (rep-dur 20, from 10)`);
    // both tabs mended it: one of it, as the more mended
    M.syncShared();
    N.syncShared();
    M.syncShared();
    const mends = record().pages[2].filter((pl) => pl.item.baseId === 'lsd');
    // A shows its own sword still, mended as far as B's
    check(mends.length === 1 && mends[0].item.dur === mendN.dur && M.shared.items().filter((it) => it.baseId === 'lsd').length === 1 && M.shared.pages[2].contains(mend) && mend.dur === mendN.dur, `mended in both tabs: ${mends.length} kept, durability ${mends.map((pl) => pl.item.dur)}, A has ${mend.dur}`);
    // mended in one, socketed in the other: one of it, socketed and mended
    mend.dur = 10;
    M.syncShared();
    N.syncShared();
    const mendN2 = N.shared.items().find((it) => it.uid === mend.uid);
    mend.dur = 14;
    M.syncShared();
    mendN2.sockets = 1;
    mendN2.socketed = ['r05'];
    N.syncShared();
    const both = record().pages[2].filter((pl) => pl.item.baseId === 'lsd');
    check(both.length === 1 && both[0].item.dur === 14 && both[0].item.socketed?.[0] === 'r05', `mended in A, socketed in B: ${JSON.stringify(both.map((pl) => [pl.item.dur, pl.item.socketed]))}`);
    // a game mends its shared pages as it plays; read-only ones it leaves as they are
    const G = started('修丙');
    const it3 = G.shared.items().find((it) => it.baseId === 'lsd');
    it3.dur = 10;
    G.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
    G.input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
    for (let i = 0; i < 40; i++) G.update(0.75);
    check(it3.dur > 10, `a game's update mends its shared pages: ${it3.dur}`);
  }
  facts.push('two tabs with two heroes merge, mend');

  // ── one hero in one tab: the last to open it has it, the one before stops writing it ──
  {
    const CLAIM = `dii-tab:${KEY}`;
    /** another tab opens the hero: its claim, as claimHero writes it there */
    const claimElsewhere = () => localStorage.setItem(CLAIM, JSON.stringify({ tab: 'tab-other', time: Date.now() }));
    reset();
    const A = started('同');
    const blade = createItem('lsd');
    A.shared.pages[0].place(blade, 0, 0);
    A.save();
    check(JSON.parse(localStorage.getItem(CLAIM))?.tab?.startsWith('tab'), `the hero claimed: ${localStorage.getItem(CLAIM)}`);
    // gold picked up since the last save, then another tab opens the hero: written a last time, then told
    A.player.gold = 4321;
    claimElsewhere();
    A.heroClaimed();
    check(heroSave().gold === 4321 && !!A.shared.readOnly && A.ui.said.some((t) => t.includes('另一个窗口')), `the last write: gold ${heroSave().gold}, shared readOnly ${A.shared.readOnly}`);
    // from then on nothing is written: the blade taken to the bag here stays on the shared page there
    const savedText = localStorage.getItem(KEY);
    const recText = localStorage.getItem(SHARED);
    A.shared.pages[0].remove(blade);
    A.player.inventory.add(blade);
    A.player.gold = 1;
    A.save();
    A.syncShared();
    check(localStorage.getItem(KEY) === savedText && localStorage.getItem(SHARED) === recText && !!A.stashBlock(1, createItem('rin')) && A.heldGrids().every((x) => !A.shared.pages.includes(x)), 'written after another tab took the hero');
    // the other tab (another game here, a claim of this page's own) has the hero and the blade
    const B = makeGame();
    check(B.continueGame(0) && B.player.gold === 4321 && inStash(B.shared, blade.uid) === '0 0,0' && !B.shared.readOnly, `the tab that has it: gold ${B.player.gold}, the blade ${inStash(B.shared, blade.uid)}`);
    const bladeB = B.shared.items().find((it) => it.uid === blade.uid);
    B.shared.pages[0].remove(bladeB);
    B.player.inventory.add(bladeB);
    B.save();
    A.save();
    const where = [heroSave().inventory.some((pl) => pl.item.uid === blade.uid), inRecord(record(), blade.uid) !== '-'];
    check(where.join() === 'true,false', `the blade, in the hero's save and the record: ${where.join()}`);
    // no last write over what the other tab wrote: it had saved the hero first
    reset();
    const C = started('迟');
    C.save();
    C.player.gold = 999;
    claimElsewhere();
    const theirs = JSON.stringify({ ...heroSave(), gold: 5 });
    localStorage.setItem(KEY, theirs);
    C.heroClaimed();
    check(localStorage.getItem(KEY) === theirs && !!C.shared.readOnly, `a last write over the other tab's save: gold ${heroSave().gold}`);
    // the storage event missed (a frozen tab): its next save finds the claim, writes nothing, says why
    reset();
    const D = started('冻');
    D.save();
    const before = localStorage.getItem(KEY);
    claimElsewhere();
    D.player.gold = 7;
    D.save();
    check(localStorage.getItem(KEY) === before && !!D.shared.readOnly && D.ui.said.some((t) => t.includes('另一个窗口')), 'a tab that missed the claim wrote the hero');
    // a hero of its own in the next tab: claimed apart, never in the way
    reset();
    const E = started('一');
    E.save();
    localStorage.setItem(`dii-tab:${KEY}-1`, JSON.stringify({ tab: 'tab-other', time: Date.now() }));
    E.player.gold = 11;
    E.save();
    check(heroSave().gold === 11 && !E.shared.readOnly, 'a claim on another slot stopped this one');
  }
  facts.push('one hero in one tab');

  // ── versions: a newer record is never written; an older one is backed up first; an unreadable one kept aside ──
  {
    reset();
    const it = createItem('lsd');
    localStorage.setItem(SHARED, JSON.stringify({ v: 1, mig: { ...thisBuild(), items: thisBuild().items + 1 }, pages: [[{ item: it, x: 1, y: 1 }], [], [], [], []], gold: 5, rev: 'x', time: 1 }));
    const g = started('新');
    const raw = localStorage.getItem(SHARED);
    g.shared.pages[1].add(createItem('rin'));
    g.save();
    check(!!g.shared.readOnly && localStorage.getItem(SHARED) === raw && g.ui.said.some((t) => t.includes('更新的版本')) && inStash(g.shared, it.uid) === '0 1,1', `a newer record: readOnly ${g.shared.readOnly}, unchanged ${localStorage.getItem(SHARED) === raw}`);
    // before the second items step (a tome of town portal for a hero without one): backed up, its items kept, nothing added
    reset();
    const old = { v: 1, mig: { ...thisBuild(), items: 1 }, pages: [[{ item: createItem('lsd'), x: 0, y: 0 }], [], [{ item: createItem('rin'), x: 9, y: 9 }], [], []], gold: 77, rev: 'old', time: 1 };
    const oldRaw = JSON.stringify(old);
    localStorage.setItem(SHARED, oldRaw);
    const h = started('迁');
    const bk = `${SHARED}-backup-1.1.${thisBuild().world}.${thisBuild().skills}`;
    check(localStorage.getItem(bk) === oldRaw, `the older record's backup ${bk}: ${localStorage.getItem(bk) ? 'differs' : 'missing'}`);
    check(h.shared.items().length === 2 && !h.shared.readOnly && JSON.stringify(h.shared.gold) === '[77,0,0,0,0]' && !h.shared.items().some((x) => x.baseId === 'tbk'), `the older record read: ${h.shared.items().map((x) => x.baseId).join()}, gold ${JSON.stringify(h.shared.gold)}`);
    h.save();
    check(JSON.stringify(record().mig) === JSON.stringify(thisBuild()) && record().v === 2 && JSON.stringify(record().gold) === '[77,0,0,0,0]' && record().pages.flat().length === 2, `written at this build's counts: v ${record().v}, ${JSON.stringify(record().mig)}, gold ${JSON.stringify(record().gold)}`);
    // version 1 at this build's counts: its one pool is 共享 1's, the record backed up first
    reset();
    const v1 = { v: 1, mig: thisBuild(), pages: [[], [{ item: createItem('rin'), x: 3, y: 3 }], [], [], []], gold: 250000, rev: 'v1', time: 1 };
    localStorage.setItem(SHARED, JSON.stringify(v1));
    const v1g = started('一版');
    const v1bk = `${SHARED}-backup-1.${Object.values(thisBuild()).join('.')}`;
    check(localStorage.getItem(v1bk) === JSON.stringify(v1) && JSON.stringify(v1g.shared.gold) === '[250000,0,0,0,0]' && v1g.shared.items().length === 1, `version 1: backup ${localStorage.getItem(v1bk) ? 'kept' : `missing (${v1bk})`}, gold ${JSON.stringify(v1g.shared.gold)}`);
    v1g.syncShared();
    check(record().v === 2 && JSON.stringify(record().gold) === '[250000,0,0,0,0]' && inRecord(record(), v1.pages[1][0].item.uid) === '1 3,3', `version 1 written as 2: v ${record().v}, gold ${JSON.stringify(record().gold)}`);
    // an item this build doesn't know: kept as it was, on its page
    reset();
    const odd = { uid: 'odd1', baseId: 'zz9', rarity: 'unique', ilvl: 80, name: 'zz9', mods: [], sockets: 0, socketed: [], reqLvl: 60 };
    localStorage.setItem(SHARED, JSON.stringify({ v: 1, mig: thisBuild(), pages: [[], [{ item: odd, x: 2, y: 2 }], [], [], []], gold: 0, rev: 'odd', time: 1 }));
    const u = started('怪');
    const ph = u.shared.pages[1].items[0]?.item;
    u.shared.pages[0].add(createItem('rin'));
    u.save();
    const kept = record().pages[1][0]?.item;
    check(ph && isUnknown(ph) && kept?.raw?.item?.baseId === 'zz9' && kept.raw.item.uid === 'odd1', `an unknown item: ${JSON.stringify(kept)}`);
    // unreadable: kept aside, the pages start empty and are written
    reset();
    localStorage.setItem(SHARED, '{"v":1,"pages":[[{"item":');
    const w = started('坏');
    w.shared.pages[0].add(createItem('rin'));
    w.save();
    const aside = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => k.startsWith(`${SHARED}-backup-unreadable-`));
    check(aside.length === 1 && localStorage.getItem(aside[0]) === '{"v":1,"pages":[[{"item":' && record().pages[0].length === 1 && w.ui.said.some((t) => t.includes('读不出来')), `an unreadable record: ${aside.length} kept aside, the new one ${record().pages[0].length}`);
  }
  facts.push('newer never written, older backed up, unreadable kept aside');

  // ── the item on the cursor: saved with the hero, back on the cursor; from a shared page too ──
  {
    reset();
    const g = started('持');
    const it = createItem('rin', 'unique');
    g.shared.pages[0].place(it, 0, 0);
    g.syncShared();
    // taken onto the cursor: the record without it, the hero's save with it, at once
    g.shared.pages[0].remove(it);
    g.ui.cursor = it;
    g.syncShared();
    const saved = heroSave();
    check(inRecord(record(), it.uid) === '-' && saved.cursor === it.uid && saved.unplaced.filter((x) => x.uid === it.uid).length === 1, `on the cursor: in the record ${inRecord(record(), it.uid)}, the save's cursor ${saved.cursor}, among unplaced ${saved.unplaced.some((x) => x.uid === it.uid)}`);
    const h = makeGame();
    h.continueGame(0);
    check(h.ui.cursor?.uid === it.uid && !h.player.unplaced.some((x) => x.uid === it.uid), `loaded: the cursor ${h.ui.cursor?.uid}, by the stash too ${h.player.unplaced.some((x) => x.uid === it.uid)}`);
    // a build without the cursor field (it writes the save without it): the ring by the camp stash, not lost
    const { cursor, ...older } = saved;
    localStorage.setItem(KEY, JSON.stringify(older));
    const o = makeGame();
    o.continueGame(0);
    check(cursor === it.uid && o.ui.cursor === null && o.player.unplaced.some((x) => x.uid === it.uid), `a save without the cursor field: the ring by the stash ${o.player.unplaced.some((x) => x.uid === it.uid)}`);
    h.newGame('新人', 'paladin');
    check(h.ui.cursor === null, 'a new hero starts with the last one\'s cursor item');
  }
  facts.push('the cursor saved');

  // ── a hero who won't be saved (a newer build's) only looks at the shared pages ──
  {
    reset();
    const g = started('读');
    g.shared.pages[0].add(createItem('rin'));
    g.save();
    const raw = localStorage.getItem(SHARED);
    localStorage.setItem(KEY, JSON.stringify({ ...heroSave(), v: 5 }));
    const h = makeGame();
    h.continueGame(0);
    h.shared.pages[0].items = [];
    h.shared.gold[0] = 99;
    h.save();
    check(!!h.shared.readOnly && localStorage.getItem(SHARED) === raw && h.heldGrids().every((x) => !h.shared.pages.includes(x)) && !!h.stashBlock(1, createItem('rin')), `a read-only hero: shared readOnly ${h.shared.readOnly}, the record ${localStorage.getItem(SHARED) === raw ? 'kept' : 'written'}`);
  }
  facts.push('a read-only hero only looks');

  // ── more than the pages hold, on load: the rest to the hero, by the camp stash, taken out of the record with the hero saved ──
  {
    reset();
    const many = Array.from({ length: 501 }, () => createItem('rin'));
    localStorage.setItem(SHARED, JSON.stringify({ v: 1, mig: thisBuild(), pages: [many.map((it) => ({ item: it, x: 0, y: 0 })), [], [], [], []], gold: 0, rev: 'many', time: 1 }));
    const g = started('满');
    check(g.shared.items().length === 500 && g.player.unplaced.length === 1 && g.level.ground.some((gi) => gi.item === g.player.unplaced[0]), `501 rings: ${g.shared.items().length} on the pages, ${g.player.unplaced.length} by the stash`);
    g.save();
    const r = record();
    const saved = heroSave();
    check(r.pages.flat().length === 500 && saved.unplaced.length === 1 && saved.unplaced[0].uid === g.player.unplaced[0].uid && !r.pages.flat().some((pl) => pl.item.uid === saved.unplaced[0].uid), `written: ${r.pages.flat().length} in the record, ${saved.unplaced.length} with the hero`);
  }
  facts.push('overflow to the hero');

  reset();
  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${facts.join('; ')}`);
};
