// A rift played (src/game/rift.ts, docs/RIFT.md), tools/play.mjs scenario:
//   node tools/play.mjs tools/scenarios/rift.mjs --url "http://localhost:5200/?dev&tod=0.5"
// Reloads with empty storage. The obelisk in the camp opens its panel: 33 tiers, the first open.
// Opening tier 1 puts its way in beside the obelisk; through it the hero is on the first floor, the
// progress at the top left. Down to the next floor and back by its ways. Kills on every floor fill
// the bar; full, the guardian (the Den's Corpsefire) comes near the hero; its death leaves a way out,
// which asks again while items lie about, then brings the hero out by the obelisk, the rift closed
// and tier 2 open. Then, as a player plays (the same address without ?dev, a hero from the title,
// since only there does a reload play on): on a floor of tier 23 (hell, for a hero in normal) the
// hero takes hell's resistance penalty; once an autosave has put the floor's area in the save, the
// page is reloaded, and the hero is in the camp, under normal's rules again, the rift and its way in
// gone, the tiers cleared still open. Last, dying on a rift floor: the body stays there; reloaded,
// and again saved, quit to the title and continued, it waits in the camp, and taking it puts back
// every item the hero wore. Page and console errors fail the run. Shots: the panel, the way in, each
// floor, the guardian, the way out, back by the obelisk, the camp after the reload, the body in the
// camp. The last line is "RIFT OK …" or "RIFT FAIL …".

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
  const until = async (fn, arg, what, timeout = 5000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 50 });
    } catch {
      throw new Error(`timed out waiting for ${what}`);
    }
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 6) =>
    ev(
      (n) =>
        new Promise((r) => {
          let k = 0;
          const f = () => (++k >= n ? r() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
      n,
    );
  /** the "载入中…" veil gone and a few frames drawn: what's shot is what the player sees */
  const settle = async () => {
    await until(() => !document.querySelector('.overlay.is-loading.open'), null, 'the loading veil to lift', 20000).catch(() => {});
    await frames(20);
  };
  const bar = () => ev(() => ({ open: document.querySelector('#rift-bar')?.classList.contains('open'), text: document.querySelector('#rift-bar')?.textContent ?? '' }));
  /** the game started (a new hero, a reload played on, a hero continued) */
  const started = () => until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
  /** god mode on or off, by hand (no debug panel without ?dev) */
  const god = (on) =>
    ev(async (on) => {
      (await import('/src/game/debug.ts')).debugOpts.god = on;
    }, on);
  /** where the hero is now: in the camp, the rules' difficulty, the fire resistance, the rift */
  const where = () =>
    ev(() => {
      const p = game.player;
      p.recalc();
      return {
        camp: game.level.inTown(p.pos) && game.area?.id === 1,
        area: game.area?.id,
        ruled: p.ruled,
        difficulty: p.difficulty,
        fire: p.stats.res.fire,
        run: !!game.rift.run,
        wayIn: game.level.objects.some((o) => o.rift === 'in'),
        open: game.rift.openTiers(),
      };
    });
  /** the item uids the hero wears */
  const worn = () => ev(() => Object.values(game.player.equipment).filter(Boolean).map((it) => it.uid).sort());

  const steps = {
    async load() {
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      await ev(async () => {
        (await import('/src/game/debug.ts')).debugOpts.god = true;
      });
    },

    async panel() {
      const s = await ev(() => {
        const ob = game.level.objects.find((o) => o.kind === 'obelisk');
        if (!ob) return null;
        game.teleportWithin({ x: ob.pos.x + 1.5, z: ob.pos.z + 2 });
        game.interact(ob);
        return { inTown: game.level.inTown(ob.pos) };
      });
      expect(s?.inTown, 'no obelisk in the camp');
      await frames(8);
      const p = await ev(() => ({
        tiers: document.querySelectorAll('.rift-tier').length,
        locked: document.querySelectorAll('.rift-tier.locked').length,
        button: [...document.querySelectorAll('.rift-actions .btn')].map((b) => b.textContent),
      }));
      expect(p.tiers === 33 && p.locked === 32, `the panel lists ${p.tiers} tiers, ${p.locked} locked`);
      expect(p.button[0] === '开启第 1 层', `its button says ${p.button[0]}`);
      await shot('obelisk-panel');
    },

    async open() {
      await ev(() => document.querySelector('.rift-actions .btn').click());
      await frames(30);
      const s = await ev(() => ({ run: !!game.rift.run, way: !!game.level.objects.find((o) => o.rift === 'in'), panel: !!document.querySelector('.rift-list') }));
      expect(s.run && s.way, `opened: rift ${s.run}, way in ${s.way}`);
      await shot('way-in-by-the-obelisk');
    },

    async floors() {
      const n = await ev(() => {
        game.interact(game.level.objects.find((o) => o.rift === 'in'));
        return game.rift.run.floors.length;
      });
      await settle();
      let b = await bar();
      expect(b.open && b.text.includes('秘境 第 1 层 · 普通 · 1/'), `the bar says "${b.text}"`);
      facts.push(`${n} floors: ${await ev(() => game.rift.run.areas.map((a) => a.name).join(' → '))}`);
      await shot('floor-1');
      for (let f = 2; f <= n; f++) {
        await ev(() => game.interact(game.level.objects.find((o) => o.kind === 'stairs' && o.dest === game.rift.run.areas[game.rift.floorHere()]?.id)));
        await settle();
        b = await bar();
        expect(b.text.includes(`${f}/${n}`), `on floor ${f} the bar says "${b.text}"`);
        await shot(`floor-${f}`);
      }
      // back up the way it came, by the way down
      const up = await ev(() => {
        const way = game.level.objects.find((o) => o.kind === 'stairs' && o.dest === game.rift.run.areas[game.rift.floorHere() - 2]?.id);
        game.interact(way);
        return game.rift.floorHere();
      });
      expect(up === n - 1, `went up to floor ${up}`);
      await settle();
    },

    async guardian() {
      const s = await ev(() => {
        const run = game.rift.run;
        for (let f = 0; f < run.floors.length && !run.guardian; f++) {
          if (game.level !== run.floors[f]) game.enterArea(run.areas[f].id, 'stairs');
          for (const m of game.level.monsters) if (!m.dead && !run.guardian) game.killMonster(m, 'phys');
        }
        const g = run.guardian;
        return g && { name: g.displayName, d: Math.hypot(g.pos.x - game.player.pos.x, g.pos.z - game.player.pos.z), progress: `${run.progress}/${run.needed}` };
      });
      expect(s?.name === '尸焰', `the guardian is ${s?.name}`);
      expect(s && s.d < 8, `it came ${s?.d?.toFixed(1)} from the hero`);
      await settle();
      const b = await bar();
      expect(b.text.includes('镇守者 · 尸焰'), `the bar says "${b.text}"`);
      facts.push(`guardian at ${s?.progress}`);
      await shot('guardian');
    },

    async done() {
      const s = await ev(() => {
        const run = game.rift.run;
        game.killMonster(run.guardian, 'phys');
        return { done: run.done, out: !!game.level.objects.find((o) => o.rift === 'out'), open: game.rift.openTiers() };
      });
      expect(s.done && s.out && s.open === 2, `after the guardian: done ${s.done}, way out ${s.out}, open to tier ${s.open}`);
      await frames(30);
      await shot('way-out');
    },

    async leave() {
      const s = await ev(() => {
        const out = game.level.objects.find((o) => o.rift === 'out');
        game.teleportWithin({ x: out.pos.x + 1, z: out.pos.z + 1 });
        const items = game.rift.itemsLeft();
        game.interact(out);
        const asked = !!game.rift.run && !game.level.inTown(game.player.pos);
        game.interact(out);
        const ob = game.level.objects.find((o) => o.kind === 'obelisk');
        return { items, asked, closed: !game.rift.run, inTown: game.level.inTown(game.player.pos), byObelisk: ob && Math.hypot(ob.pos.x - game.player.pos.x, ob.pos.z - game.player.pos.z) };
      });
      expect(!s.items || s.asked, `left with ${s.items} items about, not asked`);
      expect(s.closed && s.inTown && s.byObelisk < 3, `out: closed ${s.closed}, in town ${s.inTown}, ${s.byObelisk?.toFixed(1)} from the obelisk`);
      await settle();
      const b = await bar();
      expect(!b.open, 'the bar shows in the camp');
      facts.push(`out by the obelisk, ${s.items} items left behind`);
      await shot('back-by-the-obelisk');
    },

    async reload() {
      // as a player plays: the address without ?dev, a new hero from the title
      const plain = new URL(page.url());
      plain.search = '';
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto(plain.href, { timeout: 60000 });
      await page.waitForSelector('.overlay.open .btn.new:not([disabled])', { timeout: 60000 });
      await page.click('.overlay.open .btn.new');
      await started();
      await god(true);
      const camp = await where();
      // normal's and nightmare's stretches cleared: hell's first tier open
      const s = await ev(() => {
        localStorage.setItem('dii-rift', JSON.stringify({ v: 1, cleared: ['n:catacombs', 'nm:catacombs'], time: Date.now() }));
        const ok = game.rift.begin(23);
        if (ok) game.interact(game.level.objects.find((o) => o.rift === 'in'));
        return ok;
      });
      expect(s, 'tier 23 would not open');
      const inside = await where();
      expect(inside.area > 900 && inside.ruled === 2 && inside.difficulty === 0 && inside.fire === camp.fire - 100, `on tier 23's floor: ${JSON.stringify(inside)} (the camp's fire resistance ${camp.fire})`);
      // an autosave puts the rift floor's area in the save
      await until(() => (JSON.parse(localStorage.getItem('dii-save-v1') ?? 'null')?.area ?? 0) > 900, null, 'an autosave on the rift floor', 15000);
      await page.reload({ timeout: 60000 });
      await started();
      await settle();
      const back = await where();
      expect(back.camp, `reloaded on a rift floor, the hero is in area ${back.area}`);
      expect(back.ruled === null && back.difficulty === 0 && back.fire === camp.fire, `reloaded, the hero's rules: ${JSON.stringify(back)} (the camp's fire resistance ${camp.fire})`);
      expect(!back.run && !back.wayIn, `reloaded, the rift is open ${back.run}, its way in ${back.wayIn}`);
      expect(back.open === 23, `reloaded, tiers open to ${back.open}`);
      facts.push(`reloaded on tier 23 (fire ${inside.fire} there, ${back.fire} in the camp): in the camp, the rift gone, tiers open to ${back.open}`);
      await shot('camp-after-reload');
    },

    async body() {
      await god(true);
      const before = await worn();
      expect(before.length >= 1, `the hero wears ${before.length} items`);
      const floor = await ev(() => {
        game.rift.begin(1);
        game.interact(game.level.objects.find((o) => o.rift === 'in'));
        return game.area?.id;
      });
      await god(false);
      await ev(() => game.killPlayer());
      await until(() => document.querySelector('.overlay.open .death-title'), null, 'the death screen', 10000);
      await frames(90);
      await ev(() => document.querySelector('.overlay .death-title').closest('.overlay').querySelector('.btn').click());
      await until(() => game.level.inTown(game.player.pos) && !game.player.dead, null, 'the hero back in the camp', 10000);
      await god(true);
      const died = await ev(() => {
        const c = game.player.corpses[0];
        return { bodies: game.player.corpses.length, onFloor: !!c && game.rift.levels().includes(c.level), run: !!game.rift.run };
      });
      expect(died.bodies === 1 && died.onFloor && died.run, `died on rift floor ${floor}: ${JSON.stringify(died)}`);
      await ev(() => game.save());
      await page.reload({ timeout: 60000 });
      await started();
      await settle();
      const r = await ev(() => {
        game.layOutCorpses();
        const b = game.level.objects.find((o) => o.kind === 'corpse');
        return { camp: game.level.inTown(game.player.pos), body: !!b && game.level.inTown(b.pos), bodies: game.player.corpses.length };
      });
      expect(r.camp && r.body && r.bodies === 1, `reloaded after dying in a rift: ${JSON.stringify(r)}`);
      await shot('body-in-the-camp');
      // saved, quit to the title and continued: in the camp still, then taken
      await page.keyboard.press('Escape');
      await page.click('.overlay.open .btn.quit');
      await page.waitForSelector('.overlay.open .saves .btn.pick');
      await page.click('.overlay.open .saves .btn.pick');
      await started();
      await frames(10);
      const t = await ev(() => {
        game.layOutCorpses();
        const b = game.level.objects.find((o) => o.kind === 'corpse');
        if (!b || !game.level.inTown(b.pos)) return null;
        game.teleportWithin(b.pos);
        game.interact(b);
        return game.player.corpses.length;
      });
      expect(t === 0, `continued from the title, the body: ${t === null ? 'not in the camp' : `${t} left`}`);
      const after = await worn();
      expect(JSON.stringify(after) === JSON.stringify(before), `the body gave back ${after.length} of ${before.length} worn items`);
      facts.push(`died on a rift floor: the body there, then in the camp after a reload and a continue, ${after.length}/${before.length} worn items back`);
    },
  };

  for (const [name, fn] of Object.entries(steps)) {
    step = name;
    try {
      await fn();
    } catch (e) {
      fails.push(`${name}: ${e.message}`);
      break;
    }
  }
  for (const e of errors) fails.push(e);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(fails.length ? `RIFT FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `RIFT OK (${secs} s): ${facts.join('; ')}`);
}
