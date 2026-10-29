// Models loading as they're wanted (src/render/assets.ts, needs.ts) and what stands in meanwhile
// (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/stream.mjs --url "http://localhost:5174/?dev&tod=0.5"
// In a context of its own whose network holds back the moor's pack, the dungeon pack and every monster
// body, the game starts on the title's models, its tile textures held back too for a moment: no model
// download starts until they're let go (they go first), and after that the stream goes on. On the
// moor: things stand in (props not drawn, decor and the way down drawn in code, monsters as procedural
// rigs); its files let through: every stand-in swapped, none left, no monster drawn in code. Into the
// Den with its pack still held: veiled after 1.5 s, the world held behind it (the game's clock stops);
// let through: the veil lifts, nothing stands in. A game again, the moor's pack and the monsters held:
// by waypoint from the camp to Cold Plains on the same map, its files are wanted NOW and it's veiled
// after 1.5 s, the world held; let through, the veil lifts, nothing left standing in. Then straight
// onto a trial floor whose pack fails outright: the level shows on its stand-ins within its two
// tries, no veil left up, the file said to have failed; once it loads again a try in the background
// swaps them in. Failing so again with its tries in the background spent, the network back: nothing
// tries it on its own, the floor below asks for it as it's built and it comes. Last ?gallery, which has
// every model there is: nothing stands in once it's up (a prop no file carries isn't waited for). Page
// errors fail the run. Shots at each step; the last line is "STREAM OK …" or "STREAM FAIL …".
export default async function (page, shot, log) {
  const url = page.url().split('?')[0];
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  pg.on('console', (m) => {
    // the 503s are the ones answered here
    if (m.type() === 'error' && !/status of 503/.test(m.text())) errors.push(`console ${m.text().slice(0, 200)}`);
  });
  // files held back are answered once let go; those marked down fail
  const held = new Map();
  const down = new Set();
  const letGo = (re) => {
    const q = held.get(re) ?? [];
    held.delete(re);
    // one the page has stopped meanwhile (assets.makeWay) can't go on: nothing to answer
    for (const r of q) r.continue().catch(() => {});
  };
  await ctx.route(/\/models\/.+\.glb/, (route) => {
    const u = route.request().url();
    if ([...down].some((re) => re.test(u))) return route.fulfill({ status: 503, body: 'down' });
    for (const [re, q] of held) if (re.test(u)) return void q.push(route);
    return route.continue();
  });
  const WILD = /packs\/wild\.glb/;
  const DUNGEON = /packs\/dungeon\.glb/;
  const MONSTERS = /\/mon_[a-z_]+\.glb/;
  const TEXTURES = /\/textures\/.+\.webp/;
  for (const re of [WILD, DUNGEON, MONSTERS, TEXTURES]) held.set(re, []);
  await ctx.route(TEXTURES, (route) => {
    const q = held.get(TEXTURES);
    if (q) q.push(route);
    else route.continue().catch(() => {});
  });
  // the model files fetched, and when the first level began to be built (Renderer.buildLevel), on the page's clock
  await ctx.addInitScript(() => {
    window.__glb = [];
    const f0 = window.fetch;
    window.fetch = function (input, init) {
      const u = String(input?.url ?? input);
      if (/\.glb/.test(u)) window.__glb.push([performance.now(), u.split('/models/').pop()]);
      return f0.call(this, input, init);
    };
    let r;
    Object.defineProperty(window, 'renderer', {
      configurable: true,
      get: () => r,
      set(v) {
        r = v;
        const own = v.buildLevel.bind(v);
        v.buildLevel = (level) => {
          window.__built ??= performance.now();
          return own(level);
        };
      },
    });
  });
  const fails = [];
  const facts = [];
  const expect = (ok, what) => ok || fails.push(what);
  const census = () =>
    pg.evaluate(() => {
      const r = window.renderer;
      const bodies = [...r.monsterViews.views.values()].filter((v) => v.body);
      return {
        standIns: r.standInCount(),
        props: r.lateProps.size,
        scenery: r.standIns.length,
        monsters: bodies.length,
        rigs: bodies.filter((v) => !v.body.rig.spec).length,
        veiled: r.veiled,
        failed: window.assets.stats().failed,
      };
    });
  const until = (f, ms = 30000) => pg.waitForFunction(f, null, { timeout: ms, polling: 100 }).then(() => true, () => false);
  const snap = (name) => shot(name, pg);
  try {
    // (the held textures would hold the page's load event too)
    await pg.goto(`${url}?dev&tod=0.5`, { waitUntil: 'domcontentloaded' });
    await until(() => window.game?.started);
    // the camp's tile textures held 1.5 s: no model download starts from the moment the camp begins to
    // be built until they're let go (none of the camp's is waited on); after that the stream goes on
    await pg.waitForTimeout(1500);
    const whileHeld = await pg.evaluate(() => window.__glb.filter(([t]) => t >= window.__built).map(([, f]) => f));
    const heldTextures = held.get(TEXTURES)?.length ?? 0;
    const releasedAt = await pg.evaluate(() => performance.now());
    letGo(TEXTURES);
    const after = () => pg.evaluate((at) => window.__glb.filter(([t]) => t >= at).map(([, f]) => f), releasedAt);
    for (let i = 0; i < 50 && !(await after()).length; i++) await pg.waitForTimeout(100);
    const afterHeld = await after();
    expect(heldTextures > 0 && !whileHeld.length && afterHeld.length > 0, `${heldTextures} textures held; models fetched meanwhile: ${whileHeld.join(' ') || 'none'}; after: ${afterHeld.length}`);
    facts.push(`camp: ${heldTextures} textures held, no model fetched meanwhile, ${afterHeld.length} once they came`);
    // to the moor's ruins, the monsters held still
    await pg.evaluate(() => {
      const g = window.game;
      const L = g.level;
      const p = L.layout.props.find((q) => L.areaAt(q.x, q.z).id === 2 && /h_pillar|d_rubble/.test(q.model)) ?? L.wayTo(2, g.player.pos).pos;
      g.teleportWithin(L.map.nearestWalkable(p.x + 2, p.z + 2) ?? p);
      for (const m of L.monsters) m.stunTime = 1e9;
    });
    await pg.waitForTimeout(1500);
    const held1 = await census();
    await snap('moor-standing-in');
    expect(held1.props > 0 && held1.rigs > 0, `the moor with its files held: ${JSON.stringify(held1)}`);
    letGo(WILD);
    letGo(MONSTERS);
    await until(() => !window.renderer.standInCount(), 60000);
    await pg.waitForTimeout(1200);
    const moor = await census();
    await snap('moor-swapped');
    expect(!moor.standIns && !moor.rigs && moor.monsters > 0, `the moor once its files came: ${JSON.stringify(moor)}`);
    facts.push(`moor: ${held1.standIns} standing in (${held1.props} prop models, ${held1.scenery} scenery, ${held1.rigs}/${held1.monsters} monsters as rigs), then ${moor.standIns}`);

    // the Den with its pack held: the veil after 1.5 s, the world held behind it
    await pg.evaluate(() => window.game.enterArea(8, 'stairs'));
    await pg.waitForTimeout(600);
    const early = await census();
    await pg.waitForTimeout(1600);
    const veil = await census();
    const [t1, shown] = await pg.evaluate(() => [window.game.time, !!document.querySelector('.overlay.veil.open')]);
    await pg.waitForTimeout(800);
    const t2 = await pg.evaluate(() => window.game.time);
    await snap('den-veiled');
    expect(!early.veiled && veil.veiled && shown, `the Den's veil: at 0.6 s ${early.veiled}, at 2.2 s ${veil.veiled}, shown ${shown}`);
    expect(t2 === t1, `the world ran behind the veil: its clock ${t1} → ${t2}`);
    letGo(DUNGEON);
    await until(() => !window.renderer.veiled);
    const lifted = await census();
    await pg.waitForTimeout(1000);
    await snap('den');
    expect(!lifted.veiled && !lifted.standIns, `the Den once its pack came: ${JSON.stringify(lifted)}`);
    facts.push(`den: veiled at 2.2 s with the world held, lifted with ${lifted.standIns} standing in`);

    // by waypoint from the camp to Cold Plains, on the same map, its pack and monsters held: what it's
    // made of is wanted first (NOW, ahead of the rest of the map), the veil up after 1.5 s with the
    // world held; let through, the veil lifts, and nothing is left standing in
    for (const re of [WILD, MONSTERS]) held.set(re, []);
    await pg.goto(`${url}?dev&tod=0.5`);
    await until(() => window.game?.started && window.game.level);
    await pg.waitForTimeout(800);
    const jump = await pg.evaluate(async () => {
      const g = window.game;
      const level = g.level;
      g.enterArea(3, 'waypoint');
      const { levelNeeds } = await import('/src/render/needs.ts');
      const a = window.assets;
      const files = [...new Set([...levelNeeds(level, 3)].map((k) => a.byKey.get(k)).filter((s) => s && s.state !== 'in').map((s) => s.file))];
      return { same: g.level === level, area: g.area?.id, files, now: files.filter((f) => a.sources.find((s) => s.file === f).prio === 0) };
    });
    await pg.waitForTimeout(600);
    const jumpEarly = await census();
    await pg.waitForTimeout(1600);
    const jumpVeil = await census();
    const [j1, jShown] = await pg.evaluate(() => [window.game.time, !!document.querySelector('.overlay.veil.open')]);
    await pg.waitForTimeout(800);
    const j2 = await pg.evaluate(() => window.game.time);
    await snap('plains-by-waypoint-veiled');
    expect(jump.same && jump.area === 3 && jump.files.length > 0 && jump.now.length === jump.files.length, `by waypoint to Cold Plains: on the same map ${jump.same}, in area ${jump.area}, its ${jump.files.length} files not in wanted NOW: ${jump.now.length} (${jump.files.join(' ')})`);
    expect(!jumpEarly.veiled && jumpVeil.veiled && jShown && j1 === j2, `Cold Plains by waypoint: veiled at 0.6 s ${jumpEarly.veiled}, at 2.2 s ${jumpVeil.veiled}, shown ${jShown}, the world's clock ${j1} → ${j2}`);
    letGo(WILD);
    letGo(MONSTERS);
    await until(() => !window.renderer.veiled);
    const jumpLifted = await census();
    await until(() => !window.renderer.standInCount(), 60000);
    await pg.waitForTimeout(800);
    const plains = await census();
    await snap('plains-by-waypoint');
    expect(!jumpLifted.veiled && !plains.standIns, `Cold Plains once its files came: ${JSON.stringify(jumpLifted)}, then ${JSON.stringify(plains)}`);
    facts.push(`by waypoint to Cold Plains: its ${jump.files.length} files wanted NOW, veiled at 2.2 s with the world held, lifted once they came, ${plains.standIns} standing in after`);

    // a pack that fails outright, straight onto a trial floor
    down.add(DUNGEON);
    await pg.goto(`${url}?dev&tod=0.5&lvl=2`);
    await until(() => window.game?.started && window.game.area?.key === 'floor2');
    await until(() => window.assets.stats().failed.length > 0, 15000);
    await pg.waitForTimeout(600);
    const failed = await census();
    await snap('floor-failed');
    expect(!failed.veiled && failed.standIns > 0 && failed.failed.includes('packs/dungeon'), `a failing pack: ${JSON.stringify(failed)}`);
    down.delete(DUNGEON);
    await until(() => !window.renderer.standInCount(), 30000);
    await pg.waitForTimeout(600);
    const back = await census();
    await snap('floor-tried-again');
    expect(!back.standIns && !back.failed.length, `the pack back up, tried again: ${JSON.stringify(back)}`);
    facts.push(`a pack failing: shown on ${failed.standIns} stand-ins, no veil; back up, ${back.standIns} left`);

    // failing again, and its tries in the background spent (as some 6.7 minutes into an outage): back
    // up, nothing tries it on its own; the floor below asks for it as it's built, and it comes
    down.add(DUNGEON);
    await pg.goto(`${url}?dev&tod=0.5&lvl=2`);
    await until(() => window.game?.started && window.game.area?.key === 'floor2');
    await until(() => window.assets.stats().failed.length > 0, 15000);
    await pg.evaluate(() => {
      const s = window.assets.sources.find((x) => x.file === 'packs/dungeon');
      clearTimeout(s.timer);
      s.timer = undefined;
      s.tries = 12;
    });
    down.delete(DUNGEON);
    await pg.waitForTimeout(2500);
    const spent = await census();
    expect(spent.standIns > 0 && spent.failed.includes('packs/dungeon'), `its tries spent, back up: ${JSON.stringify(spent)}`);
    await pg.evaluate(() => window.game.enterTrial(3));
    await until(() => window.game.area?.key === 'floor3');
    const asked = await until(() => !window.renderer.standInCount() && !window.assets.stats().failed.length, 15000);
    await pg.waitForTimeout(600);
    const below = await census();
    await snap('floor-below-asked-again');
    expect(asked && !below.standIns && !below.failed.length && !below.veiled, `the floor below asked for it again: ${JSON.stringify(below)}`);
    facts.push(`its tries spent and the network back: still failed ${spent.failed.join(' ')} after 2.5 s, the floor below asked for it as it was built, ${below.standIns} left standing in`);

    // the showroom: every model there is in before it's up, nothing left standing in
    await pg.goto(`${url}?dev&tod=0.5&gallery`);
    await until(() => window.game?.started, 60000);
    const whole = await until(() => !window.renderer.standInCount(), 15000);
    const gallery = await census();
    await snap('gallery');
    expect(whole && !gallery.standIns, `?gallery once up: ${JSON.stringify(gallery)}`);
    facts.push(`gallery: ${gallery.standIns} standing in`);
  } catch (e) {
    fails.push(`error ${e.message}`);
  }
  for (const e of errors) fails.push(e);
  await ctx.close();
  log(fails.length ? `STREAM FAIL ${fails.join(' | ')}` : `STREAM OK: ${facts.join('; ')}`);
}
