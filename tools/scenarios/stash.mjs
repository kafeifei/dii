// The stash through the real UI, Diablo II: Resurrected's with five shared pages (src/items/stash.ts;
// tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/stash.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage. At the camp stash: six tabs (个人, 共享 1…5), the personal one shown.
// Items go onto several pages: from the cursor onto 共享 1 and 共享 5, by ctrl+click from the bag
// onto 共享 3, a cap onto the personal page; the Horadric Cube is refused on a shared page (it stays
// on the cursor, the hero is told) and goes onto the personal page; gold onto 共享 1, each page's
// its own as in D2R, and onto the personal page. The page shown is kept with the panel shut and
// opened again; the shared record holds what went in before the game saves. Saved, a reload (?dev:
// a new hero) finds the shared pages as they were, its own page and gold empty. A second tab with a
// hero of its own (?dev&slot=1) puts an amulet on 共享 2 and gold on 共享 4: the first sees them come
// in, takes the amulet to its bag, and the second sees it gone; the amulet is then in one place of
// all the saves, the first hero's. Then the second tab opens the first tab's hero (as the title's
// list would): the first saves it a last time, hands it over and stops behind its notice, writing nothing more;
// the second takes the long sword from 共享 1 and, shut, saves the hero with it: the sword and the
// amulet each in one place, the hero's save. Then at a phone's size with the touch controls: a new
// hero again, the shared pages there, a tap switching tabs. Page and console errors fail the run.
// Shots: the tabs, 共享 1 with its items, the new hero's 共享 1, the two tabs, the first tab stopped as its
// hero is elsewhere, the phone's personal page and 共享 3. The last line is "STASH OK …" or "STASH FAIL …".

const CELL = 34;

export default async function (page, shot, log) {
  const t0 = Date.now();
  const errors = [];
  const fails = [];
  const facts = [];
  let step = 'start';
  page.setDefaultTimeout(8000);
  const watch = (pg, who) => {
    pg.on('pageerror', (e) => errors.push(`${who} pageerror: ${e.message}`));
    pg.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`);
    });
  };
  watch(page, 'tab 1');
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  const untilOn = async (pg, fn, arg, what, timeout = 5000) => {
    try {
      await pg.waitForFunction(fn, arg, { timeout, polling: 50 });
    } catch {
      throw new Error(`timed out waiting for ${what}`);
    }
  };
  const until = (fn, arg, what, timeout) => untilOn(page, fn, arg, what, timeout);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frames = (pg = page, n = 4) =>
    pg.evaluate(
      (n) =>
        new Promise((r) => {
          let k = 0;
          const f = () => (++k >= n ? r() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
      n,
    );

  /** the page's helpers (after a load) */
  const helpers = (pg = page) =>
    pg.evaluate(async () => {
      const S = (window.__s = {});
      S.make = (await import('/src/items/gen.ts')).createItem;
      S.name = (await import('/src/items/item.ts')).displayName;
      S.said = [];
      const message = game.hooks.message.bind(game.hooks);
      game.hooks.message = (t, c, d) => {
        S.said.push(t);
        message(t, c, d);
      };
      /** the hero beside the camp stash, its panel open */
      S.toStash = () => {
        const o = game.level.objects.find((x) => x.kind === 'stash' && game.level.inTown(x.pos));
        const p = game.player;
        const spot = game.level.map.nearestWalkable(o.pos.x + o.radius + 0.8, o.pos.z) ?? o.pos;
        p.pos = { ...spot };
        p.prevPos = { ...spot };
        p.intent = null;
        game.hooks.openPanel('stash');
      };
      /** where each item lies: "page x,y" by uid (page 0 the personal one) */
      S.where = () => {
        const out = {};
        game.player.stash.items.forEach((pl) => (out[pl.item.uid] = `0 ${pl.x},${pl.y}`));
        game.shared.pages.forEach((g, i) => g.items.forEach((pl) => (out[pl.item.uid] = `${i + 1} ${pl.x},${pl.y}`)));
        return out;
      };
      S.bag = () => game.player.inventory.items.map((x) => x.item);
      (async () => (S.debug = (await import('/src/game/debug.ts')).debugOpts))().then(() => (S.debug.god = true));
    });

  const load = async (url, clear = true) => {
    if (clear)
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    if (url) await page.goto(url, { timeout: 60000 });
    else await page.reload({ timeout: 60000 });
    await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
    await helpers();
  };
  const tab = (pg, i) => pg.locator('.panel.left.open .stash-tabs .tab').nth(i);
  const onTab = (pg) => pg.evaluate(() => [...document.querySelectorAll('.panel.left.open .stash-tabs .tab')].findIndex((t) => t.classList.contains('on')));
  /** a click on the stash grid shown where an item of w × h put at x, y has its middle */
  const clickCell = (pg, x, y, w = 1, h = 1) => pg.locator('.panel.left.open .grid').click({ position: { x: (x + w / 2) * CELL + 1, y: (y + h / 2) * CELL + 1 } });
  /** an item made in the page and put on the cursor; its uid */
  const onCursor = (pg, code, quality = 'normal') =>
    pg.evaluate(
      ([code, quality]) => {
        const it = window.__s.make(code, quality);
        game.hooks.setCursorItem(it);
        return it.uid;
      },
      [code, quality],
    );
  const openStash = async (pg = page) => {
    await pg.evaluate(() => window.__s.toStash());
    await untilOn(pg, () => game.hooks.left === 'stash' && document.querySelectorAll('.panel.left.open .stash-tabs .tab').length > 0, null, 'the stash');
    await frames(pg);
  };

  const ids = {};
  const steps = {
    async tabs() {
      await load();
      await openStash();
      const t = await ev(() => ({
        labels: [...document.querySelectorAll('.panel.left.open .stash-tabs .tab')].map((x) => x.textContent),
        bag: !!document.querySelector('.panel.right.open.inv'),
        gold: document.querySelector('.panel.left.open .goldline span')?.textContent,
      }));
      expect(t.labels.join() === '个人,共享 1,共享 2,共享 3,共享 4,共享 5', `the tabs: ${t.labels.join()}`);
      expect((await onTab(page)) === 0 && t.bag && t.gold === '储存金币：0', `opened on tab ${await onTab(page)}, bag ${t.bag}, gold ${t.gold}`);
      await shot('stash-tabs');
    },

    async put() {
      // a long sword from the cursor onto 共享 1
      await tab(page, 1).click();
      expect((await onTab(page)) === 1, 'the tab clicked is not lit');
      ids.sword = await onCursor(page, 'lsd');
      await clickCell(page, 0, 0, 2, 3);
      // a ring onto 共享 5
      await tab(page, 5).click();
      ids.ring = await onCursor(page, 'rin', 'magic');
      await clickCell(page, 4, 4);
      // the bag's scroll of identify by ctrl+click onto 共享 3
      await tab(page, 3).click();
      ids.scroll = await ev(() => window.__s.bag().find((it) => it.baseId === 'isc').uid);
      await page.locator(`.panel.right.open .gitem[data-uid="${ids.scroll}"]`).click({ modifiers: ['Control'] });
      // the Horadric Cube: refused on a shared page, it stays on the cursor; onto the personal page it goes
      ids.cube = await onCursor(page, 'box');
      await clickCell(page, 6, 6, 2, 2);
      const refused = await ev((id) => ({ cursor: game.hooks.cursorItem?.uid === id, said: window.__s.said.at(-1) }), ids.cube);
      expect(refused.cursor && refused.said === '任务物品不能放进共享储物箱', `the cube on 共享 3: still on the cursor ${refused.cursor}, said ${refused.said}`);
      await tab(page, 0).click();
      await clickCell(page, 8, 8, 2, 2);
      ids.cap = await onCursor(page, 'cap');
      await clickCell(page, 0, 0, 2, 2);
      const w = await ev(() => ({ where: window.__s.where(), cursor: !!game.hooks.cursorItem, bagScroll: window.__s.bag().some((it) => it.baseId === 'isc') }));
      expect(w.where[ids.sword] === '1 0,0' && w.where[ids.ring] === '5 4,4' && w.where[ids.scroll]?.startsWith('3 ') && w.where[ids.cube] === '0 8,8' && w.where[ids.cap] === '0 0,0' && !w.cursor && !w.bagScroll, `where they went: ${JSON.stringify(w)}`);
      // gold: onto 共享 1, onto the personal page from 个人
      await ev(() => (game.player.gold = 5000));
      await tab(page, 1).click();
      await page.locator('.panel.left.open .goldline button', { hasText: '存入全部' }).click();
      await ev(() => (game.player.gold = 3000));
      await tab(page, 0).click();
      await page.locator('.panel.left.open .goldline button', { hasText: '存入全部' }).click();
      const g = await ev(() => ({ shared: game.shared.gold, own: game.player.stashGold, carried: game.player.gold }));
      expect(JSON.stringify(g.shared) === '[5000,0,0,0,0]' && g.own === 3000 && g.carried === 0, `gold: ${JSON.stringify(g)}`);
      // 共享 2 shows its own gold, none
      await tab(page, 2).click();
      await frames();
      const g2 = await ev(() => document.querySelector('.panel.left.open .goldline span')?.textContent);
      expect(g2 === '共享金币：0', `共享 2's gold: ${g2}`);
      // the page shown is kept: shut, opened again, on 共享 1 still
      await tab(page, 1).click();
      await page.keyboard.press('Escape');
      await until(() => !game.hooks.left, null, 'the stash to shut');
      await openStash();
      expect((await onTab(page)) === 1, `opened again on tab ${await onTab(page)}`);
      const shown = await ev(() => [...document.querySelectorAll('.panel.left.open .grid .gitem')].map((e) => e.dataset.uid));
      const gold = await ev(() => document.querySelector('.panel.left.open .goldline span')?.textContent);
      expect(shown.length === 1 && shown[0] === ids.sword && gold === '共享金币：5000', `共享 1 shows ${shown.length} items, ${gold}`);
      // the sword's tooltip, as in the bag
      await page.locator(`.panel.left.open .gitem[data-uid="${ids.sword}"]`).hover();
      await frames();
      const tip = await ev(() => (document.getElementById('tooltip')?.style.display === 'block' ? document.getElementById('tooltip').innerText : ''));
      const name = await ev((u) => window.__s.name(game.shared.items().find((it) => it.uid === u)), ids.sword);
      expect(tip.split('\n')[0] === name, `the sword's tooltip: ${tip.replace(/\n/g, ' / ')}`);
      await shot('shared-1');
      await page.mouse.move(5, 5);
      facts.push('cursor and ctrl+click onto pages 1, 3, 5; the cube refused, kept on the personal page; gold on each page its own; the page kept');
    },

    async newHero() {
      // written as they changed, before any save
      const early = await ev(() => JSON.parse(localStorage.getItem('dii-shared-dev') ?? 'null'));
      const inEarly = new Set((early?.pages ?? []).flat().map((pl) => pl.item.uid));
      expect(early?.gold?.[0] === 5000 && [ids.sword, ids.ring, ids.scroll].every((u) => inEarly.has(u)), `the record before saving: ${early ? `${early.pages.map((p) => p.length).join('/')}, gold ${early.gold}` : 'none'}`);
      await ev(() => game.save());
      const rec = await ev(() => JSON.parse(localStorage.getItem('dii-shared-dev')));
      const inRec = new Set(rec.pages.flat().map((pl) => pl.item.uid));
      expect(rec.v === 2 && JSON.stringify(rec.gold) === '[5000,0,0,0,0]' && [ids.sword, ids.ring, ids.scroll].every((u) => inRec.has(u)) && !inRec.has(ids.cube) && !inRec.has(ids.cap), `the record: ${rec.pages.map((p) => p.length).join('/')}, gold ${rec.gold}`);
      // ?dev: a reload is a new hero
      await load(undefined, false);
      await openStash();
      const n = await ev(() => ({ name: game.player.name, where: window.__s.where(), own: game.player.stash.items.length, ownGold: game.player.stashGold, shared: game.shared.gold }));
      expect(n.where[ids.sword] === '1 0,0' && n.where[ids.ring] === '5 4,4' && n.where[ids.scroll]?.startsWith('3 ') && n.own === 0 && n.ownGold === 0 && n.shared[0] === 5000, `the new hero: ${JSON.stringify(n)}`);
      await tab(page, 1).click();
      await frames();
      await shot('new-hero-shared-1');
      facts.push(`a new hero finds ${Object.keys(n.where).length} on the shared pages, 5000 on 共享 1`);
    },

    async twoTabs() {
      // a second tab of the same browser, as window.open makes one (play.mjs's page has a context of
      // its own), with a hero of its own: ?dev&slot=1 keeps it apart from the first's
      const url2 = new URL(page.url());
      url2.searchParams.set('slot', '1');
      const [page2] = await Promise.all([page.waitForEvent('popup', { timeout: 30000 }), ev((u) => void window.open(u, '_blank'), url2.toString())]);
      watch(page2, 'tab 2');
      await page2.setViewportSize({ width: 1280, height: 800 });
      await untilOn(page2, () => window.game?.started && window.game.level, null, 'the second tab to start', 60000);
      await helpers(page2);
      await openStash(page2);
      expect((await page2.evaluate(() => game.shared.items().length)) === 3, 'the second tab has not the shared pages');
      /** where an item is in all the saves: the record's page, each hero's save ("-" for none) */
      const everywhere = (pg, u) =>
        pg.evaluate((u) => {
          const read = (k) => JSON.parse(localStorage.getItem(k) ?? 'null');
          const rec = read('dii-shared-dev');
          const out = [];
          rec?.pages.forEach((p, i) => p.some((pl) => pl.item.uid === u) && out.push(`共享 ${i + 1}`));
          for (const k of ['dii-save-dev', 'dii-save-dev-1']) {
            const s = read(k);
            if (!s) continue;
            const all = [...s.inventory, ...s.stash, ...s.cube].map((pl) => pl.item).concat(s.unplaced ?? [], Object.values(s.equipment ?? {}), (s.belt ?? []).flat());
            if (all.some((it) => it?.uid === u)) out.push(`${k} (${s.name})`);
          }
          return out;
        }, u);
      // the second tab puts an amulet on 共享 2
      await tab(page2, 2).click();
      const amu = await onCursor(page2, 'amu', 'rare');
      await clickCell(page2, 2, 2);
      await frames(page2);
      expect((await page2.evaluate((u) => window.__s.where()[u], amu)) === '2 2,2', 'the amulet is not on the second tab\'s 共享 2');
      // the first sees it come in
      await tab(page, 2).click();
      await until((u) => window.__s.where()[u] === '2 2,2' && !!document.querySelector(`.panel.left.open .gitem[data-uid="${u}"]`), amu, 'the amulet to show in the first tab');
      await shot('two-tabs-first');
      // the first takes it to its bag; the second sees it gone
      await page.locator(`.panel.left.open .gitem[data-uid="${amu}"]`).click({ modifiers: ['Control'] });
      await frames();
      await untilOn(page2, (u) => !window.__s.where()[u] && !document.querySelector(`.panel.left.open .gitem[data-uid="${u}"]`), amu, 'the amulet to go from the second tab');
      const one = await ev((u) => window.__s.bag().some((it) => it.uid === u), amu);
      const two = await page2.evaluate((u) => window.__s.bag().some((it) => it.uid === u) || !!window.__s.where()[u], amu);
      const rec = await ev(() => JSON.parse(localStorage.getItem('dii-shared-dev')));
      expect(one && !two && !rec.pages.flat().some((pl) => pl.item.uid === amu) && rec.pages.flat().length === 3, `the amulet: in the first tab's bag ${one}, anywhere in the second ${two}, the record ${rec.pages.flat().length}`);
      const names = { one: await ev(() => game.player.name), two: await page2.evaluate(() => game.player.name) };
      const amuAt = await everywhere(page, amu);
      expect(amuAt.join() === `dii-save-dev (${names.one})`, `the amulet in the saves: ${amuAt.join(' / ') || 'nowhere'}`);
      // gold onto 共享 4 in the second tab: the first sees it there, 共享 1's as it was
      await page2.evaluate(() => (game.player.gold = 2000));
      await tab(page2, 4).click();
      await page2.locator('.panel.left.open .goldline button', { hasText: '存入全部' }).click();
      await tab(page, 4).click();
      await until(() => document.querySelector('.panel.left.open .goldline span')?.textContent === '共享金币：2000', null, '共享 4\'s gold in the first tab');
      expect(JSON.stringify(await ev(() => game.shared.gold)) === '[5000,0,0,2000,0]', `the first tab's pages' gold: ${JSON.stringify(await ev(() => game.shared.gold))}`);
      await shot('two-tabs-gold');
      await page2.screenshot({ path: await shotPath('two-tabs-second') });
      facts.push('a second hero\'s amulet came in, went to the first\'s bag, left the second, in one save; its gold on 共享 4');

      // the second tab opens the first tab's hero, as from the title's list: that tab has it from now on
      const at = await page2.evaluate(() => {
        game.save();
        return game.continueGame(0);
      });
      expect(at && (await page2.evaluate(() => game.player.name)) === names.one, `the second tab's hero now: ${await page2.evaluate(() => game.player.name)}`);
      // the first tab saved, handed the hero over and stopped behind its notice (Game.heroElsewhere)
      await until(() => !!document.querySelector('.hero-gone.open') && game.paused && !!game.shared.readOnly, null, 'the first tab to stop', 5000);
      const savedBefore = await ev(() => localStorage.getItem('dii-save-dev'));
      expect((await page2.evaluate((u) => window.__s.bag().some((it) => it.uid === u), amu)), 'the second tab\'s hero has not the amulet the first took');
      // the first tab can't move anything now: its notice covers the panels, and its stash is only looked at
      const t1 = await ev((u) => ({ where: window.__s.where()[u], blocked: getComputedStyle(document.querySelector('.hero-gone')).display !== 'none', readOnly: !!game.shared.readOnly }), ids.sword);
      expect(t1.where === '1 0,0' && t1.blocked && t1.readOnly, `the first tab, its hero elsewhere: ${JSON.stringify(t1)}`);
      await shot('two-tabs-first-elsewhere');
      // the second takes the sword to its bag; shut, it saves the hero with it
      await openStash(page2);
      await tab(page2, 1).click();
      await frames(page2);
      await page2.locator(`.panel.left.open .gitem[data-uid="${ids.sword}"]`).click({ modifiers: ['Control'] });
      await frames(page2);
      expect(await page2.evaluate((u) => window.__s.bag().some((it) => it.uid === u), ids.sword), 'the sword is not in the second tab\'s bag');
      await page2.close({ runBeforeUnload: true });
      await frames();
      // the first tab saving (its autosave, or shut) writes nothing
      await ev(() => game.save());
      const swordAt = await everywhere(page, ids.sword);
      const amuEnd = await everywhere(page, amu);
      const wrote = (await ev(() => localStorage.getItem('dii-save-dev'))) !== savedBefore;
      expect(swordAt.join() === `dii-save-dev (${names.one})` && amuEnd.join() === `dii-save-dev (${names.one})` && wrote, `after the second tab shut: the sword ${swordAt.join(' / ') || 'nowhere'}, the amulet ${amuEnd.join(' / ') || 'nowhere'}, the second tab saved ${wrote}`);
      facts.push('the same hero opened in the second tab: the first saved, handed it over and stopped, the sword taken there saved with the hero, nothing lost');
    },

    async phone() {
      await page.setViewportSize({ width: 844, height: 390 });
      const url = new URL(page.url());
      url.searchParams.set('touch', '');
      await load(url.toString(), false);
      await openStash();
      const touch = await ev(() => document.body.classList.contains('touch'));
      expect(touch, 'not in the touch layout');
      // all of it on screen beside the bag, nothing to scroll to: the tabs, the page, the gold and its buttons
      const box = await ev(() => {
        const L = document.querySelector('.panel.left.open');
        const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        const panel = L.getBoundingClientRect();
        const btn = [...L.querySelectorAll('.goldline button')].at(-1).getBoundingClientRect();
        return { panel: [panel.left, panel.right, panel.bottom].map(Math.round), btn: Math.round(btn.bottom), bag: Math.round(r('.panel.right.open').left), scroll: L.scrollHeight - L.clientHeight, w: innerWidth, h: innerHeight };
      });
      expect(box.panel[0] >= 0 && box.panel[1] <= box.bag + 2 && box.panel[2] <= box.h && box.btn <= box.h && box.scroll <= 1, `the phone's stash: ${JSON.stringify(box)}`);
      await shot('phone-personal');
      // a tap: 共享 3, with the scroll of identify
      await tab(page, 3).click();
      await frames();
      const shown = await ev(() => ({ on: [...document.querySelectorAll('.panel.left.open .stash-tabs .tab')].findIndex((t) => t.classList.contains('on')), items: [...document.querySelectorAll('.panel.left.open .grid .gitem')].map((e) => e.dataset.uid) }));
      expect(shown.on === 3 && shown.items.includes(ids.scroll), `the phone's 共享 3: tab ${shown.on}, ${shown.items.length} items`);
      // the bag's scroll of town portal tapped twice (its tooltip, then taken), then a tap on the page drawn small: in where tapped
      const tp = await ev(() => window.__s.bag().find((it) => it.baseId === 'tsc').uid);
      await page.locator(`.panel.right.open .gitem[data-uid="${tp}"]`).click();
      await page.locator(`.panel.right.open .gitem[data-uid="${tp}"]`).click();
      await until((u) => game.hooks.cursorItem?.uid === u, tp, 'the scroll on the finger');
      // drawn again with the scroll taken: the page's grid as it is now
      await frames();
      const g = await page.locator('.panel.left.open .grid').boundingBox();
      const k = g.width / (10 * CELL + 2);
      await page.mouse.click(g.x + (5.5 * CELL + 1) * k, g.y + (5.5 * CELL + 1) * k);
      await frames();
      const put = await ev((u) => ({ at: window.__s.where()[u], cursor: !!game.hooks.cursorItem }), tp);
      expect(put.at === '3 5,5' && !put.cursor, `tapped onto the phone's 共享 3: ${JSON.stringify(put)} (drawn at ${k.toFixed(2)})`);
      await shot('phone-shared-3');
      await page.setViewportSize({ width: 1280, height: 800 });
      facts.push('the phone shows the tabs beside the bag');
    },
  };

  // the second tab's shot goes beside play.mjs's own, numbered after the last
  let shotDir = null;
  const shotPath = async (name) => {
    if (!shotDir) {
      const path = await import('node:path');
      const fs = await import('node:fs');
      const out = process.argv[process.argv.indexOf('--out') + 1];
      shotDir = out && process.argv.includes('--out') ? out : (await import('node:os')).tmpdir();
      fs.mkdirSync(shotDir, { recursive: true });
      shotPath.join = path.join;
    }
    return shotPath.join(shotDir, `tab2-${name}.png`);
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
  log(fails.length ? `STASH FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `STASH OK (${secs} s): ${facts.join('; ')}`);
}
