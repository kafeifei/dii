// What a modified click on an item does (src/ui/quickmove.ts, Game.dropFromBag): ctrl or cmd is
// D2R's ctrl+click, a Mac's ctrl+click that a browser reports as the right button too, and shift
// alone is D2's shift+click. Ctrl+click from the bag goes into the stash's page shown or the cube,
// is sold with a merchant's open, else is dropped; from the stash or the cube it comes back to the
// bag; the shop's stock has none. A move that finds no room leaves the item where it was. A drop
// puts it on the ground by the hero, in the camp too, where it is picked up again; a dead hero drops
// nothing.

export default async (load) => {
  const Q = await load('/src/ui/quickmove.ts');
  const { Grid } = await load('/src/items/grid.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const ev = (button, keys = '') => ({ button, ctrlKey: keys.includes('c'), metaKey: keys.includes('m'), shiftKey: keys.includes('s') });
  const show = (p) => `${p.button}${p.ctrl ? '+ctrl' : ''}${p.shift ? '+shift' : ''}`;

  // ── the press: ctrl or cmd is ctrl+click; shift alone isn't; a Mac's ctrl with the right button is the left ──
  for (const [e, mac, want] of [
    [ev(0, 'c'), false, '0+ctrl'],
    [ev(0, 'm'), false, '0+ctrl'],
    [ev(0, 'c'), true, '0+ctrl'],
    [ev(0, 'm'), true, '0+ctrl'],
    [ev(2, 'c'), true, '0+ctrl'],
    [ev(2, 'cs'), true, '0+ctrl+shift'],
    [ev(2, 'c'), false, '2+ctrl'],
    [ev(2, 'm'), true, '2+ctrl'],
    [ev(2), true, '2'],
    [ev(0, 's'), false, '0+shift'],
    [ev(2, 's'), false, '2+shift'],
    [ev(0), true, '0'],
  ]) {
    const got = show(Q.readPress(e, mac));
    check(got === want, `${JSON.stringify(e)} on ${mac ? 'a Mac' : 'another'}: ${got}, not ${want}`);
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
  // a dead hero drops nothing
  p.dead = true;
  check(!game.dropFromBag(ring) && p.inventory.contains(ring), 'a dead hero dropped the ring');
  p.dead = false;
  localStorage.clear();

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log('  ctrl or cmd (a Mac\'s ctrl as the right button too), shift apart; bag to stash, cube, sale or the ground, back to the bag; no room, no move; a drop by the hero in the camp, picked up again; none dead');
};
