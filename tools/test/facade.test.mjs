// What the tools, the scenarios and the tests reach on a Game (src/game/game.ts), kept while M2a's
// step 0 moves its code out into modules (docs/M2A-STEP0.md 1.2): every method still on Game, those
// TypeScript calls private included; lastDungeon still read and written on the instance (bot.mjs sets
// it to null); and the methods the tools swap on an instance (bot.mjs killMonster, west.test rollLoot)
// still called through it, so a swapped one sees what the game does.
const METHODS = [
  // the tools' and the scenarios'
  'teleportWithin', 'interact', 'killMonster', 'save', 'enterArea', 'newGame', 'moveStashGold', 'travel',
  'continueGame', 'enterLevel', 'pickupGround', 'travelToArea', 'killPlayer', 'setDifficulty', 'syncShared',
  'respawn', 'npcSpoke', 'castTownPortal', 'isLit', 'enterTrial', 'beltInsert', 'talkTo', 'npcTalk', 'stashBlock',
  'dropFromBag', 'useBelt', 'autoBeltInsert', 'useSkillAt', 'refuseDrop', 'readHeld', 'onProc', 'npcLeft', 'mapOf',
  'drink', 'openTownPortal', 'heroClaimed', 'dropBlock', 'wake', 'takeOver', 'spawnDrops', 'resume',
  'readTownPortal', 'heldGrids', 'drinkable', 'closePortals', 'claimToResume',
  // private to TypeScript, called by the tests
  'layOutCorpses', 'updateArea', 'rollLoot',
];
const DT = 1 / 60;

export default async (load) => {
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { CAMP_AREA, WILD_AREA } = await load('/src/world/areas.ts');
  const save = await load('/src/game/save.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);

  const missing = METHODS.filter((k) => typeof Game.prototype[k] !== 'function');
  check(!missing.length, `Game has no method ${missing.join(', ')}`);

  localStorage.clear();
  save.setSlot(0);
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
  game.hooks = {
    message() {},
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
  game.newGame('门面', 'paladin');
  const west = game.level;
  const p = game.player;

  // lastDungeon: read and written on the instance
  game.enterTrial(1);
  check(game.lastDungeon && game.lastDungeon === game.level, 'a trial floor is not lastDungeon');
  game.lastDungeon = null;
  check(game.lastDungeon === null, 'lastDungeon set to null reads back as something else');
  game.travel(CAMP_AREA);

  // killMonster swapped on the instance: a monster the hero strikes dead goes through it
  const killed = [];
  const kill = game.killMonster;
  game.killMonster = function (m, ...rest) {
    killed.push(m);
    return kill.call(this, m, ...rest);
  };
  const foe = west.monsters
    .filter((m) => !m.dead && m.rank === 'normal' && west.areaAt(m.pos.x, m.pos.z).id === WILD_AREA)
    .reduce((a, m) => (Math.hypot(m.pos.x - west.layout.start.x, m.pos.z - west.layout.start.z) < Math.hypot(a.pos.x - west.layout.start.x, a.pos.z - west.layout.start.z) ? m : a));
  game.teleportWithin(west.map.nearestWalkable(foe.pos.x + 1.5, foe.pos.z) ?? foe.pos);
  foe.life = 1;
  for (let t = 0; t < 20 * 60 && !foe.dead && !p.dead; t++) {
    game.useSkillAt('attack', foe, foe.pos, t === 0);
    if (p.life < p.d.maxLife / 2) p.life = p.d.maxLife;
    game.update(DT);
  }
  check(foe.dead && killed.includes(foe), `the hero's kill ${foe.dead ? 'went round' : 'never came to'} the swapped killMonster`);
  game.killMonster = kill;

  // rollLoot swapped on the instance: a chest opened rolls through it
  let rolled = 0;
  const roll = game.rollLoot;
  game.rollLoot = function (...a) {
    rolled++;
    return roll.apply(this, a);
  };
  // an unlocked one: the overworld's chests roll locks as D2's do (about 8% in the Blood Moor) and this hero has no key
  const chest = west.objects.find((o) => o.kind === 'chest' && !o.used && !o.locked && !west.inTown(o.pos));
  game.interact(chest);
  check(rolled === 1, `a chest opened rolled ${rolled} time(s) through the swapped rollLoot`);
  game.rollLoot = roll;

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${METHODS.length} methods on Game; lastDungeon read and written; killMonster and rollLoot swapped on the instance are what the game calls`);
};
