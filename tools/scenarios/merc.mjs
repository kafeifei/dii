// The hireling through the real UI (src/game/merc.ts, mercai.ts, src/ui/hire.ts, merc.ts; tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/merc.mjs --url http://localhost:5183/ --dev
// Reloads with empty storage. A level-8 hero with gold in the camp goes to Kashya (the camp rogue's
// body, taller and tinted, where the rogue stood), her menu's 雇佣 opens the list; a scout is hired
// (the bag pays first), her panel opens beside the bag and her portrait is up; a bow, a cap and
// armour go onto her from the cursor and one comes off again, the save holding each item once; a
// second scout hired over her asks first and her three pieces come back to the bag, counted; the new
// one, given a bow, follows the hero into Blood Moor and shoots what comes (her kills hers); the hero
// falls and she with them; at Kashya she is raised for her price, once. Page and console errors fail
// the run. Shots: Kashya, the list, her panel, geared, the question, fighting, raised. The last line
// is "MERC OK …" or "MERC FAIL …".

export default async function (page, shot, log) {
  const t0 = Date.now();
  const errors = [];
  const fails = [];
  const facts = [];
  let step = 'start';
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  const until = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 50 }).then(() => true, () => false);
  /** the hero's items, and the save's, each by uid: the same set, none twice */
  const counted = () =>
    page.evaluate(async () => {
      const M = await import('/src/game/merc.ts');
      const mine = M.heroItems(window.game).map((i) => i.uid);
      // ?dev's own slot (PROJECT-MAP: dii-save-dev)
      const d = JSON.parse(localStorage.getItem('dii-save-dev') || 'null');
      const saved = d ? [...Object.values(d.equipment), ...[...d.inventory, ...d.stash, ...d.cube].map((x) => x.item), ...d.unplaced, ...d.belt.flat(), ...Object.values(d.merc?.equipment ?? {}), ...(d.corpse ? [...Object.values(d.corpse.equipment ?? {}), ...(d.corpse.items ?? [])] : [])].map((i) => i.uid) : [];
      return { mine: mine.length, saved: saved.length, same: [...mine].sort().join() === [...saved].sort().join(), twice: saved.length - new Set(saved).size };
    });

  try {
    step = 'new hero';
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForFunction(() => window.game?.started && window.game.level, null, { timeout: 60000 });
    await page.evaluate(() => window.assets?.ensureAll());
    await until(() => !window.renderer?.standInCount?.(), null, 30000);
    await page.waitForTimeout(800);

    step = 'kashya';
    const k = await page.evaluate(() => {
      const g = window.game;
      const p = g.player;
      p.level = 8;
      p.gold = 4000;
      p.stashGold = 3000;
      p.markDirty();
      const o = g.level.objects.find((x) => x.serves?.includes('hire'));
      if (!o) return null;
      g.teleportWithin({ x: o.pos.x + 1.6, z: o.pos.z + 1.6 });
      g.clockRate = 0;
      g.clock = 0.45;
      const rogues = (g.level.layout.npcs ?? []).filter((n) => n.model === 'rogue').length;
      return { name: o.name, npcId: o.npcId, at: o.pos, rogues };
    });
    expect(k && k.npcId === 'kashya', `Kashya in the camp: ${JSON.stringify(k)}`);
    await page.waitForTimeout(900);
    await shot('kashya');

    step = 'hire list';
    await page.evaluate(() => {
      const g = window.game;
      g.talkTo(g.level.objects.find((x) => x.serves?.includes('hire')));
    });
    await until(() => document.querySelector('.npc-menu.open'));
    const opts = await page.evaluate(() => [...document.querySelectorAll('.npc-menu.open .npc-opt')].map((e) => e.textContent));
    expect(opts.includes('雇佣') && !opts.some((o) => o.startsWith('交易')), `her menu: ${opts.join(' / ')}`);
    await page.locator('.npc-menu.open .npc-opt', { hasText: '雇佣' }).click();
    expect(await until(() => document.querySelectorAll('.hire-row').length > 0), 'the list never showed');
    const rows = await page.evaluate(() => document.querySelectorAll('.hire-row').length);
    facts.push(`${rows} on offer`);
    await shot('hire-list');

    step = 'hire';
    const before = await page.evaluate(() => ({ gold: window.game.player.gold, stash: window.game.player.stashGold }));
    await page.locator('.hire-row').first().click();
    expect(await until(() => !!window.game.player.merc && !!window.game.merc), 'not hired');
    const hired = await page.evaluate(async () => {
      const g = window.game;
      const H = await import('/src/game/d2/hireling.ts');
      const st = g.player.merc;
      return { price: H.hirePrice(st.hire, st.level), gold: g.player.gold, stash: g.player.stashGold, left: g.hooks.left, portrait: document.querySelector('#merc-portrait.open')?.textContent ?? null, level: st.level };
    });
    expect(hired.gold === before.gold - hired.price && hired.stash === before.stash, `paid ${before.gold} → ${hired.gold} (price ${hired.price}), stash ${hired.stash}`);
    expect(hired.left === 'merc' && hired.portrait, `her panel ${hired.left}, portrait ${hired.portrait}`);
    facts.push(`hired at ${hired.level} for ${hired.price}`);
    await page.waitForTimeout(400);
    await shot('merc-panel');

    step = 'gear';
    const put = async (id) => {
      await page.evaluate(async (id) => {
        const { createItem } = await import('/src/items/gen.ts');
        const g = window.game;
        g.hooks.setCursorItem(createItem(id));
      }, id);
      const slot = await page.evaluate(async (id) => {
        const H = await import('/src/game/d2/hireling.ts');
        const { ITEM_BASES } = await import('/src/data/items.ts');
        return H.mercSlot(ITEM_BASES[id]);
      }, id);
      await page.waitForTimeout(150);
      await page.locator(`.merc-slot[data-slot="${slot}"]`).click();
      await page.waitForTimeout(150);
    };
    for (const id of ['sbw', 'cap', 'qui']) await put(id);
    const geared = await page.evaluate(() => {
      const e = window.game.player.merc.equipment;
      return { head: e.head?.baseId, body: e.body?.baseId, weapon: e.weapon?.baseId, cursor: window.game.hooks.cursorItem?.baseId ?? null };
    });
    expect(geared.head === 'cap' && geared.body === 'qui' && geared.weapon === 'sbw' && !geared.cursor, `her gear ${JSON.stringify(geared)}`);
    let c = await counted();
    expect(c.same && !c.twice, `with her gear on: ${JSON.stringify(c)}`);
    await shot('merc-geared');
    // the cap off onto the cursor, into the bag, and back on her
    await page.locator('.merc-slot[data-slot="head"]').click();
    const off = await page.evaluate(() => ({ cursor: window.game.hooks.cursorItem?.baseId, head: window.game.player.merc.equipment.head?.baseId ?? null }));
    expect(off.cursor === 'cap' && !off.head, `taken off: ${JSON.stringify(off)}`);
    c = await counted();
    expect(c.same && !c.twice, `the cap on the cursor: ${JSON.stringify(c)}`);
    await page.locator('.merc-slot[data-slot="head"]').click();
    expect(await page.evaluate(() => window.game.player.merc.equipment.head?.baseId === 'cap' && !window.game.hooks.cursorItem), 'the cap not back on her');

    step = 'replace';
    const n0 = await page.evaluate(async () => (await import('/src/game/merc.ts')).heroItems(window.game).length);
    const bag0 = await page.evaluate(() => window.game.player.inventory.items.length);
    await page.evaluate(() => window.game.hooks.openPanel('hire'));
    await until(() => document.querySelectorAll('.hire-row').length > 0);
    await page.locator('.hire-row').first().click();
    expect(await until(() => !!document.querySelector('.hire-ask')), 'no question before letting her go');
    const ask = await page.evaluate(() => document.querySelector('.hire-ask')?.textContent ?? '');
    expect(/3 件装备会还给你/.test(ask) && /背包/.test(ask) && /个人储物箱/.test(ask) && /储物箱旁边/.test(ask), `the question: ${ask}`);
    await shot('hire-ask');
    const was = await page.evaluate(() => window.game.player.merc);
    await page.locator('.hire-yes').click();
    expect(await until((w) => window.game.player.merc && window.game.player.merc.name !== w, was.name), 'not replaced');
    const after = await page.evaluate(async () => {
      const M = await import('/src/game/merc.ts');
      const p = window.game.player;
      return { n: M.heroItems(window.game).length, bag: p.inventory.items.map((x) => x.item.baseId), gear: Object.keys(p.merc.equipment).length };
    });
    expect(after.n === n0 && after.gear === 0 && ['sbw', 'cap', 'qui'].every((id) => after.bag.includes(id)) && after.bag.length === bag0 + 3, `after: ${JSON.stringify(after)} (was ${n0}, bag ${bag0})`);
    c = await counted();
    expect(c.same && !c.twice, `after the hand-back: ${JSON.stringify(c)}`);
    facts.push(`replaced: her 3 pieces back in the bag, ${n0} items before and after`);

    step = 'fight';
    // the bow from the bag onto the new one
    await page.evaluate(async () => {
      const g = window.game;
      const p = g.player;
      const bow = p.inventory.items.find((x) => x.item.baseId === 'sbw').item;
      p.inventory.remove(bow);
      g.hooks.setCursorItem(bow);
    });
    await page.waitForTimeout(150);
    await page.locator('.merc-slot[data-slot="weapon"]').click();
    await page.evaluate(async () => {
      const g = window.game;
      const { debugOpts } = await import('/src/game/debug.ts');
      debugOpts.god = true;
      g.hooks.left = null;
      g.hooks.right = null;
      g.hooks.dirty = true;
      // a clearing in Blood Moor with monsters about
      const L = g.level;
      const live = L.monsters.filter((m) => !m.dead && L.areaAt(m.pos.x, m.pos.z).id === 2);
      const pick = live.find((m) => L.map.nearestWalkable(m.pos.x - 6, m.pos.z));
      const at = L.map.nearestWalkable(pick.pos.x - 6, pick.pos.z);
      g.teleportWithin(at);
      window.__mercKills = [];
      const kill = g.killMonster.bind(g);
      g.killMonster = (m, elem, killer) => {
        if (!m.dead) window.__mercKills.push(killer === g.merc ? 'merc' : String(killer));
        return kill(m, elem, killer);
      };
    });
    // her arrow in flight
    const shooting = await until(() => window.game.level.projectiles.some((pr) => pr.owner === window.game.merc && pr.age > 0.08), null, 20000);
    expect(shooting, 'she never shot');
    await shot('merc-fighting');
    await page.waitForTimeout(8000);
    const fight = await page.evaluate(() => ({ kills: window.__mercKills, life: window.game.merc?.life, dead: window.game.merc?.dead, xp: window.game.player.merc.xp }));
    expect(fight.kills.includes('merc'), `her kills: ${fight.kills.join(',')}`);
    facts.push(`in Blood Moor: ${fight.kills.filter((k) => k === 'merc').length} of ${fight.kills.length} kills hers`);

    step = 'death';
    await page.evaluate(async () => {
      const { debugOpts } = await import('/src/game/debug.ts');
      debugOpts.god = false;
      window.game.killPlayer();
    });
    const fell = await page.evaluate(() => ({ hero: window.game.player.dead, her: window.game.player.merc.dead }));
    expect(fell.hero && fell.her, `fell: ${JSON.stringify(fell)}`);
    await page.evaluate(() => window.game.respawn());
    await page.waitForTimeout(500);
    const cost = await page.evaluate(async () => {
      const g = window.game;
      const M = await import('/src/game/merc.ts');
      const o = g.level.objects.find((x) => x.serves?.includes('hire'));
      g.teleportWithin({ x: o.pos.x + 1.6, z: o.pos.z + 1.6 });
      g.player.gold = 5000;
      g.hooks.openPanel('hire');
      return M.raiseCost(g);
    });
    expect(await until(() => !!document.querySelector('.hire-raise button')), 'no raise at Kashya');
    await shot('raise');
    const g0 = await page.evaluate(() => window.game.player.gold);
    await page.locator('.hire-raise button').click();
    await page.waitForTimeout(200);
    const raised = await page.evaluate(() => ({ gold: window.game.player.gold, dead: window.game.player.merc.dead, on: !!window.game.merc && !window.game.merc.dead, raise: !!document.querySelector('.hire-raise') }));
    expect(raised.gold === g0 - cost && !raised.dead && raised.on && !raised.raise, `raised: ${JSON.stringify(raised)}, cost ${cost}, gold was ${g0}`);
    facts.push(`fell with the hero, raised for ${cost}`);
    await page.waitForTimeout(500);
    await shot('raised');
  } catch (e) {
    fails.push(`${step}: ${e.message}`);
  }
  if (errors.length) fails.push(...errors.slice(0, 5));
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (fails.length) log(`MERC FAIL (${secs} s) ${fails.join(' | ')}`);
  else log(`MERC OK (${secs} s) ${facts.join('; ')}`);
}
