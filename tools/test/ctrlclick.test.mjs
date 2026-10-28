// What a modified click on an item does (src/ui/quickmove.ts, Game.dropFromBag): ctrl or cmd with
// the left button is D2R's ctrl+click, with the right button a right click still, and shift alone
// is D2's shift+click. Ctrl+click from the bag goes into the stash's page shown or the cube,
// is sold with a merchant's open, else is dropped; from the stash or the cube it comes back to the
// bag; the shop's stock has none. A move that finds no room leaves the item where it was. A drop
// puts it on the ground by the hero, in the camp too, where it is picked up again; a dead hero drops
// nothing.

export default async (load) => {
  const Q = await load('/src/ui/quickmove.ts');
  const { Grid } = await load('/src/items/grid.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { Game } = await load('/src/game/game.ts');
  const { GroundItem } = await load('/src/game/objects.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const ev = (button, keys = '') => ({ button, ctrlKey: keys.includes('c'), metaKey: keys.includes('m'), shiftKey: keys.includes('s') });
  const show = (p) => `${p.button}${p.ctrl ? '+ctrl' : ''}${p.shift ? '+shift' : ''}`;

  // ── the press: ctrl or cmd is ctrl+click; shift alone isn't; the right button with ctrl stays the right ──
  for (const [e, want] of [
    [ev(0, 'c'), '0+ctrl'],
    [ev(0, 'm'), '0+ctrl'],
    [ev(0, 'cs'), '0+ctrl+shift'],
    [ev(2, 'c'), '2+ctrl'],
    [ev(2, 'cs'), '2+ctrl+shift'],
    [ev(2, 'm'), '2+ctrl'],
    [ev(2), '2'],
    [ev(0, 's'), '0+shift'],
    [ev(2, 's'), '2+shift'],
    [ev(0), '0'],
  ]) {
    const got = show(Q.readPress(e));
    check(got === want, `${JSON.stringify(e)}: ${got}, not ${want}`);
  }

  // ── where ctrl+click sends it ──
  const table = {
    'inv stash': 'stash',
    'inv cube': 'cube',
    'inv shop': 'sell',
    'inv null': 'ground',
    'inv char': 'ground',
    'inv quests': 'ground',
    'inv waypoint': 'ground',
    'stash stash': 'bag',
    'cube cube': 'bag',
    'shop shop': null,
  };
  for (const [k, want] of Object.entries(table)) {
    const [from, left] = k.split(' ');
    const got = Q.quickMove(from, left === 'null' ? null : left);
    check(got === want, `ctrl+click in ${from} with ${left} open: ${got}, not ${want}`);
  }

  // ── a move: into the first space that takes it; none, it stays where it was ──
  {
    const bag = new Grid(10, 4);
    const page = new Grid(10, 10);
    const cap = createItem('cap');
    bag.place(cap, 3, 1);
    check(Q.moveItem(cap, bag, page) && !bag.contains(cap) && page.contains(cap), 'a cap into an empty page');
    check(Q.moveItem(cap, page, bag) && bag.contains(cap) && !page.contains(cap), 'the cap back into the bag');
    // a full page: nothing moves
    const full = new Grid(2, 2);
    full.place(createItem('cap'), 0, 0);
    const at = bag.items.find((x) => x.item === cap);
    const was = `${at.x},${at.y}`;
    check(!Q.moveItem(cap, bag, full) && bag.contains(cap) && `${bag.items.find((x) => x.item === cap).x},${bag.items.find((x) => x.item === cap).y}` === was && full.items.length === 1, 'a cap into a full page moved');
    // too big for where there's room: a two-hander into a 1-high strip
    const sword = createItem('lsd');
    bag.place(sword, 8, 0);
    check(!Q.moveItem(sword, bag, new Grid(10, 1)) && bag.contains(sword), 'a long sword into a strip one cell high moved');
    // not in `from`, or `from` itself: nothing
    const stray = createItem('rin', 'magic');
    check(!Q.moveItem(stray, bag, page) && !page.contains(stray), 'an item not in the bag moved');
    check(!Q.moveItem(cap, bag, bag) && bag.items.filter((x) => x.item === cap).length === 1, 'a move within one grid');
  }

  // ── dropped from the bag: on the ground by the hero, in the camp, picked up again ──
  localStorage.clear();
  save.setSlot(0);
  const said = [];
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const sfx = new Sfx();
  const played = [];
  sfx.play = (id) => played.push(id);
  const game = new Game(input, sfx);
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
  game.newGame('', 'paladin');
  const p = game.player;
  check(game.level.inTown(p.pos), 'the hero does not start in the camp');
  const ring = createItem('rin', 'magic');
  check(p.inventory.add(ring), 'no room in the bag for a ring');
  const before = game.level.ground.length;
  played.length = 0;
  check(game.dropFromBag(ring), 'the ring was not dropped');
  const gi = game.level.ground.find((g) => g.item === ring);
  check(!p.inventory.contains(ring) && gi && game.level.ground.length === before + 1, `dropped: in the bag ${p.inventory.contains(ring)}, on the ground ${!!gi}`);
  check(gi && Math.hypot(gi.pos.x - p.pos.x, gi.pos.z - p.pos.z) <= 1, `the ring lies ${gi ? Math.hypot(gi.pos.x - p.pos.x, gi.pos.z - p.pos.z).toFixed(2) : '-'} from the hero`);
  check(played.some((id) => id === 'item.drop_ring'), `the drop sounded ${played.join()}`);
  if (gi) game.pickupGround(gi);
  check(p.inventory.contains(ring) && !game.level.ground.includes(gi), 'the ring was not picked up again');
  // not in the bag: nothing dropped
  const stray = createItem('cap');
  check(!game.dropFromBag(stray) && !game.level.ground.some((g) => g.item === stray), 'an item not in the bag was dropped');
  // the cube (its contents are kept apart) and an item this build can't read stay in the bag, the hero told why
  const { UNKNOWN_BASE } = await load('/src/data/items.ts');
  const cube = createItem('box');
  const unknown = { ...createItem('cap'), baseId: UNKNOWN_BASE };
  for (const [it, what] of [[cube, 'the cube'], [unknown, 'an unknown item']]) {
    check(p.inventory.add(it), `no room in the bag for ${what}`);
    said.length = 0;
    const was = game.level.ground.length;
    check(!game.dropFromBag(it) && p.inventory.contains(it) && game.level.ground.length === was && said.length === 1 && !!game.dropBlock(it), `${what} dropped: in the bag ${p.inventory.contains(it)}, said ${said.join()}`);
    check(game.refuseDrop(it), `${what} off the cursor not refused`);
  }
  check(!game.dropBlock(ring) && !game.refuseDrop(ring), 'a ring refused');
  // ── the belt, D2's (src/items/belt.ts): potions start a column, scrolls only join their own kind ──
  {
    const B = await load('/src/items/belt.ts');
    const mk = (c) => createItem(c);
    const empty = [[], [], [], []];
    check(B.beltable(mk('tsc')) && B.beltable(mk('hp1')) && B.beltable(mk('vps')) && !B.beltable(mk('cap')) && !B.beltable(mk('key')) && !B.beltable(mk('tbk')), 'what the belt holds: potions and scrolls');
    check(B.freeBeltColumn(empty, 2, mk('hp1')) === 0 && B.freeBeltColumn(empty, 2, mk('tsc')) === -1 && B.freeBeltColumn(empty, 2, mk('vps')) === -1 && B.freeBeltColumn(empty, 2, mk('cap')) === -1, 'an empty belt: a healing potion takes a column, a scroll or a stamina potion none');
    const belt = [[mk('mp1')], [mk('hp1')], [mk('tsc')], []];
    check(B.freeBeltColumn(belt, 2, mk('hp3')) === 1 && B.freeBeltColumn(belt, 2, mk('mp5')) === 0 && B.freeBeltColumn(belt, 2, mk('tsc')) === 2 && B.freeBeltColumn(belt, 2, mk('isc')) === -1 && B.freeBeltColumn(belt, 2, mk('rvl')) === 3, 'beside its own kind: any healing size, any mana size, the same scroll; a new kind of potion in the empty column');
    check(B.freeBeltColumn(belt, 1, mk('hp3')) === 3 && B.freeBeltColumn(belt, 1, mk('tsc')) === -1, 'columns full: a potion to the empty one, a scroll nowhere');
    // picked up or bought (ITEMS_CheckIfAutoBeltable): what D2 belts by itself, or a potion beside its kind; never a scroll
    const kin = [[mk('tsc')], [mk('vps')], [mk('isc')], []];
    check(B.autoBeltable(kin, mk('hp1')) && B.autoBeltable(kin, mk('rvl')) && B.autoBeltable(kin, mk('vps')) && !B.autoBeltable(empty, mk('vps')), 'picked up: a healing or rejuvenation potion by itself, a stamina potion beside its kind only');
    check(!B.autoBeltable(kin, mk('tsc')) && !B.autoBeltable(kin, mk('isc')) && !B.autoBeltable(kin, mk('cap')), 'picked up: a scroll beside its kind, or a cap, went to the belt');
    // the game's: beltInsert by it, a scroll read from the belt (town portal, identify)
    p.belt = [[mk('hp1')], [], [], []];
    const scroll = mk('tsc');
    check(!game.beltInsert(scroll) && game.beltInsert(mk('hp2')) && p.belt[0].length === 1 && p.belt[1].length === 1, `beltless (one row): a scroll in ${JSON.stringify(p.belt.map((c) => c.map((x) => x.baseId)))}`);
    p.belt[2].push(scroll);
    check(game.readHeld(scroll) && !p.belt[2].length && !game.readHeld(scroll), 'a town portal scroll read from the belt, once');
    const id = mk('isc');
    p.belt[3].push(id);
    let picked = null;
    game.hooks.identifyWith = (s) => (picked = s);
    game.useBelt(3);
    check(picked === id && p.belt[3].includes(id), 'the belt\'s scroll of identify used: the identify cursor with it, still held');
    // a sash's two rows: a scroll picked up or bought stays out of the belt, beside its own kind too;
    // shift+click (beltInsert) still puts it there
    const waist = p.equipment.waist;
    p.equipment.waist = mk('lbl');
    p.markDirty();
    p.belt = [[mk('tsc')], [mk('hp1')], [], []];
    const tp2 = mk('tsc');
    const hp = mk('hp2');
    check(p.beltRows() === 2 && !game.autoBeltInsert(tp2) && p.belt[0].length === 1 && game.autoBeltInsert(hp) && p.belt[1].includes(hp), `bought: a scroll belted ${p.belt[0].length - 1}, a potion beside its kind ${p.belt[1].includes(hp)}`);
    check(game.beltInsert(tp2) && p.belt[0].includes(tp2), 'shift+click: the scroll not beside its own kind');
    p.belt[0].pop();
    const lying = new GroundItem({ ...p.pos }, tp2, 0, p.pos);
    game.level.ground.push(lying);
    game.pickupGround(lying);
    check(p.inventory.contains(tp2) && p.belt[0].length === 1 && !game.level.ground.includes(lying), `a scroll picked up: in the bag ${p.inventory.contains(tp2)}, the belt's column ${p.belt[0].length}`);
    p.inventory.remove(tp2);
    if (waist) p.equipment.waist = waist;
    else delete p.equipment.waist;
    p.markDirty();
    p.belt = [[], [], [], []];
  }

  // a dead hero drops nothing
  p.dead = true;
  check(!game.dropFromBag(ring) && p.inventory.contains(ring), 'a dead hero dropped the ring');
  p.dead = false;
  localStorage.clear();

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log('  ctrl or cmd with the left button, the right one a right click still, shift apart; bag to stash, cube, sale or the ground, back to the bag; no room, no move; a drop by the hero in the camp, picked up again; the cube and unknown items kept; D2\'s belt columns, scrolls read from it but never belted by a pickup or purchase; none dead');
};
