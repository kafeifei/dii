// What the models are asked for by (src/render/needs.ts) covers what the builders make things of:
// the title's core holds everything the camp shows on the overworld (several seeds), both heroes with
// every weapon and shield they can hold (and the staff and orb built in code), every drop on the
// ground and a corpse; the builders' own keys (props.ts: torches, chests, barrels, the way down,
// waypoints, decor, items lying about), asked for with nothing in (each a miss, assets.watch), come
// from the files the needs ask for; a level's needs are the union of its areas'; and where the hero
// can go next (areaNeeds) brings the files each area of the west block turns out to need: the
// overworld's (the Burial Grounds' Blood Raven, set down by its preset, among them) and the dungeons'.
const SEEDS = [1, 7, 0x5eed, 20261026];

/** a 2D context that takes whatever is drawn and draws nothing: the builders' glows are canvas textures */
const nothing2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = () => nothing2d)), set: (t, k, v) => ((t[k] = v), true) });

export default async (load) => {
  const make = document.createElement;
  document.createElement = (tag) => {
    const e = make(tag);
    if (String(tag).toLowerCase() === 'canvas') e.getContext = () => nothing2d;
    return e;
  };
  try {
    await run(load);
  } finally {
    document.createElement = make;
  }
};

async function run(load) {
  await load('three');
  const { MODEL_PACKS } = await load('/src/render/model-list.ts');
  const { assets } = await load('/src/render/assets.ts');
  const N = await load('/src/render/needs.ts');
  const P = await load('/src/render/props.ts');
  const S = await load('/src/render/specs.ts');
  const { ITEM_BASES, UNKNOWN_BASE } = await load('/src/data/items.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { DEV_MODELS } = await load('/src/render/dev-models.ts');
  const { Level } = await load('/src/game/level.ts');
  const { WILD_MAPS } = await load('/src/world/levelgen.ts');
  const { generateOverworld } = await load('/src/world/overworld.ts');
  const { generateDen } = await load('/src/world/den.ts');
  const { CAMP_AREA, DEN_OF_EVIL, WILD_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS, CAVE_1, CAVE_2, CRYPT, MAUSOLEUM, dungeonArea } = await load('/src/world/areas.ts');
  const { DUNGEON_MAKERS, levelSeed } = await load('/src/game/maps.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const packOf = new Map(Object.entries(MODEL_PACKS).flatMap(([p, ks]) => ks.map((k) => [k, `packs/${p}`])));
  const file = (k) => packOf.get(k) ?? k;
  const files = (keys) => new Set([...keys].map(file));
  const core = new Set(N.CORE);
  const outside = (keys, of) => [...keys].filter((k) => !of.has(k));

  // the camp on the overworld, all its things, from the core
  for (const seed of SEEDS) {
    const ow = generateOverworld(seed);
    const level = new Level(WILD_MAPS, ow.seed, ow, 0);
    const camp = N.levelNeeds(level, CAMP_AREA);
    check(!outside(camp, core).length, `seed ${seed}: the camp needs ${outside(camp, core).join(' ')}, not in the core`);
    // a level's needs are its areas' together
    const all = N.levelNeeds(level);
    const parts = new Set([...new Set(level.areas)].flatMap((a) => [...N.levelNeeds(level, a)]));
    check(outside(all, parts).length === 0 && outside(parts, all).length === 0, `seed ${seed}: the overworld's needs aren't its areas' (${outside(all, parts).join(' ')} | ${outside(parts, all).join(' ')})`);
    // what each area past the camp turns out to need comes with what's asked for before the map is made
    for (const a of [WILD_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS]) {
      const ahead = files(N.areaNeeds(a));
      const real = [...files(N.levelNeeds(level, a))].filter((f) => !ahead.has(f) && !files(core).has(f));
      check(!real.length, `seed ${seed}: area ${a} needs ${real.join(' ')}, which areaNeeds doesn't bring`);
    }
    const den = new Level(WILD_MAPS, seed, generateDen(seed), 0);
    const ahead = files(N.areaNeeds(DEN_OF_EVIL));
    const real = [...files(N.levelNeeds(den))].filter((f) => !ahead.has(f) && !files(core).has(f));
    check(!real.length, `seed ${seed}: the Den needs ${real.join(' ')}, which areaNeeds doesn't bring`);
    // and the dungeons under the west block, each from its maker as the game makes it
    for (const id of [CAVE_1, CAVE_2, CRYPT, MAUSOLEUM]) {
      const s = levelSeed(seed, id);
      const L = new Level(WILD_MAPS, s, DUNGEON_MAKERS[id](s, 0), 0);
      const wanted = files(N.areaNeeds(id));
      const missed = [...files(N.levelNeeds(L))].filter((f) => !wanted.has(f) && !files(core).has(f));
      check(!missed.length, `seed ${seed}: area ${id} needs ${missed.join(' ')}, which areaNeeds doesn't bring`);
    }
  }
  // a trial floor's monsters are any with a look: areaNeeds brings every body file
  const floor = new Level(WILD_MAPS + 3, 99, undefined, 0);
  const fl = files(N.areaNeeds(dungeonArea(3)));
  const lost = [...files(N.levelNeeds(floor))].filter((f) => !fl.has(f) && !files(core).has(f));
  check(!lost.length, `trial floor 3 needs ${lost.join(' ')}, which areaNeeds doesn't bring`);

  // both heroes with every weapon and shield there is, the staff and orb built in code too, and as a corpse
  const missed = (build) => assets.watch(build)[1] ?? new Set();
  for (const cls of ['paladin', 'sorceress']) {
    for (const [id, b] of Object.entries(ITEM_BASES)) {
      if (id === UNKNOWN_BASE || (!P.heldModel(b) && b.type !== 'staff' && b.type !== 'orb')) continue;
      const eq = b.type === 'shield' ? { offhand: createItem(id) } : { weapon: createItem(id) };
      const spec = S.playerSpec({ cls, equipment: eq });
      const asked = new Set([...N.specNeeds(spec), ...missed(() => (spec.attach ?? []).forEach((a) => typeof a.model === 'function' && a.model()))]);
      check(!outside(asked, core).length, `a ${cls} holding ${id} needs ${outside(asked, core).join(' ')}, not in the core`);
    }
    const corpse = N.objectNeeds({ kind: 'corpse', corpse: { cls, equipment: {} } }, true);
    check(corpse.length && !outside(corpse, core).length, `a ${cls}'s corpse needs ${corpse.join(' ')}`);
  }
  // every drop lying on the ground, and gold
  for (const id of Object.keys(ITEM_BASES)) {
    if (id === UNKNOWN_BASE) continue;
    const item = createItem(id);
    const asked = missed(() => P.makeGroundItem(item, '#ffffff'));
    check(!outside(asked, core).length, `${id} on the ground asks for ${outside(asked, core).join(' ')}, not in the core`);
    check(!outside(asked, new Set(P.groundModels(item))).length, `${id} on the ground asks for ${[...asked].join(' ')}, groundModels says ${P.groundModels(item).join(' ')}`);
  }
  check(!outside(missed(() => P.makeGroundItem(null, '#e8c040')), core).length, 'gold on the ground asks for a model not in the core');

  // the builders ask for what the needs say they're made of (by file: a file loads whole)
  const same = (asked, said, what) => {
    const extra = [...files(asked)].filter((f) => !files(said).has(f));
    check(!extra.length, `${what} asks for ${[...asked].join(' ')}; the needs say ${[...said].join(' ')} (${extra.join(' ')} left out)`);
  };
  for (const kind of ['bones', 'rubble', 'barrel', 'skullpile', 'tent', 'campfire', 'cage', 'banner', 'crate', 'stalagmite', 'crystal', 'rock']) {
    same(missed(() => P.makeDecor(kind, 'cave')), P.decorModels(kind), `decor ${kind}`);
  }
  for (const dead of [true, false]) same(missed(() => P.makeTree(1, dead)), P.decorModels('tree'), `a ${dead ? 'dead' : 'living'} tree`);
  same(missed(() => P.makeTorch('#ff8040')), [P.MODELS.torch], 'a torch');
  const obj = (kind, outdoor = false) => N.objectNeeds({ kind }, outdoor);
  same(missed(() => P.makeChest()), obj('chest'), 'a chest');
  same(missed(() => P.makeBarrel()), obj('barrel'), 'a barrel');
  same(missed(() => P.makeWaypoint()), obj('waypoint'), 'a waypoint');
  same(missed(() => (P.makeStairs(true), P.makeBrazier())), obj('stairs', true), 'the way down from under the sky');
  same(missed(() => P.makeStairs(false)), obj('stairs'), 'the way further down');
  // the order the rest streams in: the moor's and the plains' before the dungeons'
  const order = N.streamOrder().map(file);
  check(order.indexOf('packs/wild') < order.indexOf('packs/dungeon') && order.indexOf('packs/wild') >= 0, `stream order ${[...new Set(order)].join(' ')}`);

  if (problems.length) throw new Error(problems.join('\n'));
  const shipped = [...files(core)].filter((f) => !DEV_MODELS[f]);
  console.log(`  core: ${shipped.length} files (${shipped.join(' ')}; a dev hero's when its switch is on); the camp, the heroes' gear, drops and corpses all in it over ${SEEDS.length} seeds; the builders' keys within their needs`);
}
