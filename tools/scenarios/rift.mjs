// A rift played (src/game/rift.ts, docs/RIFT.md), tools/play.mjs scenario:
//   node tools/play.mjs tools/scenarios/rift.mjs --url "http://localhost:5200/?dev&tod=0.5"
// Reloads with empty storage. The obelisk in the camp opens its panel: 33 tiers, the first open.
// Opening tier 1 puts its way in beside the obelisk; through it the hero is on the first floor, the
// progress at the top left. Down to the next floor and back by its ways. Kills on every floor fill
// the bar; full, the guardian (the Den's Corpsefire) comes near the hero; its death leaves a way out,
// which asks again while items lie about, then brings the hero out by the obelisk, the rift closed
// and tier 2 open. Page and console errors fail the run. Shots: the panel, the way in, each floor,
// the guardian, the way out, back by the obelisk. The last line is "RIFT OK …" or "RIFT FAIL …".

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
