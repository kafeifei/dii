// Ctrl+click and shift+click on items through the real UI, Diablo II: Resurrected's ctrl+click and
// D2's shift+click (src/ui/quickmove.ts; tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/ctrlclick.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage. Real ctrl and cmd (Meta) clicks on the bag's and the panels' cells. At
// the camp stash: a cap ctrl+clicked from the bag onto the personal page, a ring cmd+clicked onto
// 共享 2 and ctrl+clicked back; a right click with ctrl held (ctrl is the walk key too) is a right
// click still: a potion in the bag is drunk, nothing moves, and the context menu stays off; the bag full,
// the ring stays on its page and the hero is told; a page full, the long sword stays in the bag; the
// Horadric Cube is refused on a shared page and goes onto the personal one and back. The cube
// opened: the ring into it and back, the cube itself not into itself. At the merchant: the ring
// sold, the cube refused and left where it was. Shift+click: a potion into the belt, with the belt
// full it stays and nothing is said; a scroll stays until one is put on the belt by hand, then the
// next joins it, and that column read in the camp says so; the sword just taken. Nothing open: the sword dropped at the hero's feet with
// its sound, in the camp, its label clicked and picked up again; the cube refused, by ctrl+click and
// off the cursor (its contents are kept apart); with the character panel open, the scroll of
// identify dropped too. Then at a phone's size with the touch controls the bag and stash
// as they were. Page and console errors fail the run. Shots: the stash, the cube, the shop, the
// ground, the hint's tooltip, the phone's stash. The last line is "CTRLCLICK OK …" or "CTRLCLICK FAIL …".

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
  const frames = (n = 4) =>
    ev(
      (n) =>
        new Promise((r) => {
          let k = 0;
          const f = () => (++k >= n ? r() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
      n,
    );

  /** the page's helpers (after a load) */
  const helpers = () =>
    ev(async () => {
      const S = (window.__c = {});
      S.make = (await import('/src/items/gen.ts')).createItem;
      S.name = (await import('/src/items/item.ts')).displayName;
      S.said = [];
      const message = game.hooks.message.bind(game.hooks);
      game.hooks.message = (t, c, d) => {
        S.said.push(t);
        message(t, c, d);
      };
      S.played = [];
      const play = game.sfx.play.bind(game.sfx);
      game.sfx.play = (id, o) => {
        S.played.push(id);
        return play(id, o);
      };
      S.goTo = (kind) => {
        const o = game.level.objects.find((x) => x.kind === kind && game.level.inTown(x.pos));
        const p = game.player;
        const spot = game.level.map.nearestWalkable(o.pos.x + o.radius + 0.8, o.pos.z) ?? o.pos;
        p.pos = { ...spot };
        p.prevPos = { ...spot };
        p.intent = null;
      };
      S.toStash = () => {
        S.goTo('stash');
        game.hooks.openPanel('stash');
      };
      S.toShop = () => {
        S.goTo('vendor');
        game.hooks.openPanel('shop');
      };
      /** where an item is: "bag x,y", "stash <page> x,y", "cube x,y", "belt <col>", "ground", "cursor", "worn <slot>" or "" */
      S.at = (u) => {
        const p = game.player;
        const inGrid = (g) => g.items.find((x) => x.item.uid === u);
        let pl;
        if ((pl = inGrid(p.inventory))) return `bag ${pl.x},${pl.y}`;
        if ((pl = inGrid(p.stash))) return `stash 0 ${pl.x},${pl.y}`;
        for (let i = 0; i < game.shared.pages.length; i++) if ((pl = inGrid(game.shared.pages[i]))) return `stash ${i + 1} ${pl.x},${pl.y}`;
        if ((pl = inGrid(p.cube))) return `cube ${pl.x},${pl.y}`;
        const col = p.belt.findIndex((c) => c.some((it) => it.uid === u));
        if (col >= 0) return `belt ${col}`;
        if (game.level.ground.some((g) => g.item?.uid === u)) return 'ground';
        if (game.hooks.cursorItem?.uid === u) return 'cursor';
        const slot = Object.entries(p.equipment).find(([, it]) => it?.uid === u);
        return slot ? `worn ${slot[0]}` : '';
      };
      /** an item made into the bag; its uid */
      S.give = (code, q = 'normal') => {
        const it = S.make(code, q);
        if (!game.player.inventory.add(it)) return null;
        game.hooks.dirty = true;
        return it.uid;
      };
      (async () => (S.debug = (await import('/src/game/debug.ts')).debugOpts))().then(() => (S.debug.god = true));
    });

  const load = async (url) => {
    await ev(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    if (url) await page.goto(url, { timeout: 60000 });
    else await page.reload({ timeout: 60000 });
    await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
    await helpers();
  };
  const at = (u) => ev((u) => window.__c.at(u), u);
  const lastSaid = () => ev(() => window.__c.said.at(-1));
  /** the item's element in an open panel ('left' or 'right') */
  const cellOf = (u, side) => page.locator(`.panel.${side}.open .gitem[data-uid="${u}"]`);
  /** a real click on the item's cell with a modifier held (Playwright's mouse) */
  const modClick = async (u, side, mod = 'Control') => {
    await cellOf(u, side).click({ modifiers: [mod] });
    await frames(2);
  };
  const tab = (i) => page.locator('.panel.left.open .stash-tabs .tab').nth(i);
  const openStash = async () => {
    await ev(() => window.__c.toStash());
    await until(() => game.hooks.left === 'stash' && !!document.querySelector('.panel.left.open .stash-tabs') && !!document.querySelector('.panel.right.open.inv'), null, 'the stash');
    await frames();
  };

  const ids = {};
  const steps = {
    async stash() {
      await load();
      ids.cap = await ev(() => window.__c.give('cap'));
      ids.ring = await ev(() => window.__c.give('rin', 'magic'));
      ids.sword = await ev(() => window.__c.give('lsd'));
      ids.cube = await ev(() => window.__c.give('box'));
      ids.scroll = await ev(() => game.player.inventory.items.find((x) => x.item.baseId === 'isc').item.uid);
      await openStash();
      // ctrl: the cap onto the personal page shown
      await ev(() => (window.__c.played.length = 0));
      await modClick(ids.cap, 'right', 'Control');
      expect((await at(ids.cap)).startsWith('stash 0 ') && (await ev(() => window.__c.played.includes('item.move'))), `ctrl+click the cap: ${await at(ids.cap)}`);
      // cmd: the ring onto 共享 2, ctrl+clicked back
      await tab(2).click();
      await frames(2);
      await modClick(ids.ring, 'right', 'Meta');
      expect((await at(ids.ring)).startsWith('stash 2 '), `cmd+click the ring with 共享 2 shown: ${await at(ids.ring)}`);
      await modClick(ids.ring, 'left', 'Control');
      expect((await at(ids.ring)).startsWith('bag '), `ctrl+click the ring on 共享 2: ${await at(ids.ring)}`);
      // a right click with ctrl held stays the right click: a potion drunk, not moved; no context menu
      const drink = await ev(() => window.__c.give('hp1'));
      await frames(2);
      const menus = await ev(() => {
        window.__c.menus = [];
        const f = (e) => window.__c.menus.push(e.defaultPrevented);
        window.addEventListener('contextmenu', f, { capture: false });
        return true;
      });
      await cellOf(drink, 'right').click({ button: 'right', modifiers: ['Control'] });
      await frames(2);
      const drunk = { at: await at(drink), menus: await ev(() => window.__c.menus) };
      expect(menus && drunk.at === '' && drunk.menus.every(Boolean), `ctrl + right click on a potion: ${JSON.stringify(drunk)}`);
      facts.push('ctrl + right click drank a potion, nothing moved');
      // the bag full: the ring stays on its page, the hero is told
      await modClick(ids.ring, 'right', 'Control');
      const ringAt = await at(ids.ring);
      const junk = await ev(() => {
        const out = [];
        for (let k = 0; k < 60; k++) {
          const u = window.__c.give('rin', 'normal');
          if (!u) break;
          out.push(u);
        }
        return out;
      });
      await frames(2);
      await modClick(ids.ring, 'left', 'Control');
      expect((await at(ids.ring)) === ringAt && (await lastSaid()) === '背包已满', `the bag full: the ring ${await at(ids.ring)} (was ${ringAt}), said ${await lastSaid()}`);
      await ev((junk) => {
        const g = game.player.inventory;
        g.items = g.items.filter((x) => !junk.includes(x.item.uid));
        game.hooks.dirty = true;
      }, junk);
      await frames(2);
      await modClick(ids.ring, 'left', 'Control');
      expect((await at(ids.ring)).startsWith('bag '), `the bag emptied, the ring back: ${await at(ids.ring)}`);
      // a page full: the sword stays where it was in the bag
      await tab(4).click();
      await ev(() => {
        const g = game.shared.pages[3];
        while (g.add(window.__c.make('cap'))) {}
        game.hooks.dirty = true;
      });
      await frames(2);
      const swordAt = await at(ids.sword);
      await modClick(ids.sword, 'right', 'Control');
      expect((await at(ids.sword)) === swordAt && (await lastSaid()) === '储物箱已满', `共享 4 full: the sword ${await at(ids.sword)} (was ${swordAt}), said ${await lastSaid()}`);
      await ev(() => {
        game.shared.pages[3].items = [];
        game.hooks.dirty = true;
      });
      // the cube: refused on a shared page, onto the personal one and back
      await tab(1).click();
      await frames(2);
      const cubeAt = await at(ids.cube);
      await modClick(ids.cube, 'right', 'Control');
      expect((await at(ids.cube)) === cubeAt && (await lastSaid()) === '任务物品不能放进共享储物箱', `the cube on 共享 1: ${await at(ids.cube)}, said ${await lastSaid()}`);
      await tab(0).click();
      await frames(2);
      await modClick(ids.cube, 'right', 'Control');
      expect((await at(ids.cube)).startsWith('stash 0 '), `the cube onto the personal page: ${await at(ids.cube)}`);
      await shot('stash');
      await modClick(ids.cube, 'left', 'Control');
      expect((await at(ids.cube)).startsWith('bag '), `the cube back: ${await at(ids.cube)}`);
      expect(!(await ev(() => game.hooks.cursorItem)), 'something was left on the cursor');
      facts.push('bag ⇄ the page shown by ctrl and cmd; full bag, full page and the cube on a shared page refused, nothing moved');
    },

    async cube() {
      // the cube right-clicked in the bag: its panel
      await cellOf(ids.cube, 'right').click({ button: 'right' });
      await until(() => game.hooks.left === 'cube', null, 'the cube');
      await frames(2);
      await modClick(ids.ring, 'right', 'Control');
      expect((await at(ids.ring)).startsWith('cube '), `ctrl+click the ring with the cube open: ${await at(ids.ring)}`);
      const cubeAt = await at(ids.cube);
      await modClick(ids.cube, 'right', 'Control');
      expect((await at(ids.cube)) === cubeAt, `the cube into itself: ${await at(ids.cube)}`);
      await shot('cube');
      await modClick(ids.ring, 'left', 'Control');
      expect((await at(ids.ring)).startsWith('bag '), `ctrl+click the ring in the cube: ${await at(ids.ring)}`);
      facts.push('bag ⇄ cube; the cube not into itself');
    },

    async shop() {
      await ev(() => window.__c.toShop());
      await until(() => game.hooks.left === 'shop' && !!document.querySelector('.panel.right.open.inv'), null, 'the shop');
      await frames();
      const gold = await ev(() => game.player.gold);
      await modClick(ids.ring, 'right', 'Control');
      const after = await ev(() => game.player.gold);
      expect((await at(ids.ring)) === '' && after > gold && (await lastSaid())?.startsWith('出售 '), `ctrl+click the ring at the merchant: ${await at(ids.ring) || 'gone'}, gold ${gold} → ${after}, said ${await lastSaid()}`);
      const cubeAt = await at(ids.cube);
      await modClick(ids.cube, 'right', 'Control');
      expect((await at(ids.cube)) === cubeAt && (await lastSaid()) === '商人不收这个' && !(await ev(() => game.hooks.cursorItem)), `the cube at the merchant: ${await at(ids.cube)} (was ${cubeAt}), said ${await lastSaid()}`);
      await shot('shop');
      facts.push(`the ring sold for ${after - gold}; the cube refused, left where it was`);
    },

    async shift() {
      // a potion from the belt's last column into the bag, so the belt has room for it
      const pot = await ev(() => {
        const it = game.player.belt[3].pop();
        game.player.inventory.add(it);
        game.hooks.dirty = true;
        return it.uid;
      });
      await frames(2);
      await modClick(pot, 'right', 'Shift');
      expect((await at(pot)).startsWith('belt '), `shift+click the potion: ${await at(pot)}`);
      // the belt full: it stays in the bag, and nothing is said (D2: PlrMsg.cpp Rcv0x63)
      const pot2 = await ev(() => window.__c.give('hp1'));
      await frames(2);
      const potAt = await at(pot2);
      const saidBefore = await ev(() => window.__c.said.length);
      await ev(() => (window.__c.played.length = 0));
      await modClick(pot2, 'right', 'Shift');
      const quiet = await ev((n) => ({ said: window.__c.said.slice(n), played: window.__c.played }), saidBefore);
      expect((await at(pot2)) === potAt && !quiet.said.length && !quiet.played.length, `the belt full: the potion ${await at(pot2)}, said ${JSON.stringify(quiet)}`);
      // a scroll starts no column of its own: it stays; put on an emptied column by hand, the next joins it
      const tp = await ev(() => [window.__c.give('tsc'), window.__c.give('tsc')]);
      await ev(() => {
        const p = game.player;
        // a sash: two rows, room for a second scroll above the first
        p.equipment.waist = window.__c.make('lbl');
        p.markDirty();
        for (const it of p.belt[2].splice(0)) p.inventory.add(it);
        game.hooks.dirty = true;
      });
      await frames(2);
      const tpAt = await at(tp[0]);
      await modClick(tp[0], 'right', 'Shift');
      expect((await at(tp[0])) === tpAt, `shift+click a scroll with no column of scrolls: ${await at(tp[0])}`);
      await cellOf(tp[0], 'right').click();
      await frames(2);
      await page.locator('.belt .slot').nth(2).click();
      await frames(2);
      expect((await at(tp[0])) === 'belt 2', `the scroll put on the belt by hand: ${await at(tp[0])}`);
      await modClick(tp[1], 'right', 'Shift');
      expect((await at(tp[1])) === 'belt 2', `shift+click the second scroll: ${await at(tp[1])}`);
      // its column used: town portal read from the belt (in the camp, the hero says no)
      await page.locator('.belt .slot').nth(2).click({ button: 'right' });
      await frames(2);
      expect((await lastSaid()) === '你已经在营地里了' && (await at(tp[1])) === 'belt 2', `the belt's scroll used in the camp: said ${await lastSaid()}`);
      // shift+click on what isn't a potion: taken, as by a click
      await modClick(ids.sword, 'right', 'Shift');
      expect((await at(ids.sword)) === 'cursor', `shift+click the sword: ${await at(ids.sword)}`);
      await ev(() => {
        game.player.inventory.add(game.hooks.cursorItem);
        game.hooks.setCursorItem(null);
      });
      await frames(2);
      facts.push('shift+click: a potion into the belt (full: stays, nothing said), a scroll beside its own kind only, a sword just taken');
    },

    async ground() {
      await page.keyboard.press('Escape');
      await until(() => !game.hooks.left && !game.hooks.right, null, 'the panels to shut');
      await page.keyboard.press('i');
      await until(() => game.hooks.right === 'inv' && !game.hooks.left, null, 'the bag alone');
      await frames(2);
      const town = await ev(() => game.level.inTown(game.player.pos));
      await ev(() => (window.__c.played.length = 0));
      await modClick(ids.sword, 'right', 'Control');
      const g = await ev((u) => {
        const gi = game.level.ground.find((x) => x.item?.uid === u);
        const p = game.player.pos;
        return gi ? { d: Math.hypot(gi.pos.x - p.x, gi.pos.z - p.z), sound: window.__c.played.includes('item.drop_weapon') } : null;
      }, ids.sword);
      expect(town && g && g.d <= 1 && g.sound && (await at(ids.sword)) === 'ground', `ctrl+click the sword, nothing open: ${JSON.stringify(g)}, in the camp ${town}`);
      // the cube is not thrown away: it stays in the bag, the hero told why
      await modClick(ids.cube, 'right', 'Control');
      expect((await at(ids.cube)).startsWith('bag ') && (await lastSaid())?.startsWith('魔盒不能丢在地上'), `ctrl+click the cube, nothing open: ${await at(ids.cube)}, said ${await lastSaid()}`);
      // nor from the cursor: a click on the ground leaves it there
      await ev((u) => {
        const it = game.player.inventory.items.find((x) => x.item.uid === u).item;
        game.player.inventory.remove(it);
        game.hooks.setCursorItem(it);
      }, ids.cube);
      await page.keyboard.press('Escape');
      await until(() => !game.hooks.left && !game.hooks.right, null, 'the panels to shut');
      await page.mouse.click(640, 300);
      await frames(4);
      expect((await at(ids.cube)) === 'cursor' && (await lastSaid())?.startsWith('魔盒不能丢在地上'), `the cube clicked onto the ground: ${await at(ids.cube)}, said ${await lastSaid()}`);
      await ev(() => {
        game.player.inventory.add(game.hooks.cursorItem);
        game.hooks.setCursorItem(null);
      });
      await page.keyboard.press('i');
      await until(() => game.hooks.right === 'inv' && !game.hooks.left, null, 'the bag alone again');
      await frames(2);
      facts.push('the cube kept, by ctrl+click and off the cursor');
      // with the character panel open: dropped too
      await page.keyboard.press('c');
      await until(() => game.hooks.left === 'char', null, 'the character panel');
      await frames(2);
      await modClick(ids.scroll, 'right', 'Control');
      expect((await at(ids.scroll)) === 'ground', `ctrl+click the scroll with the character panel open: ${await at(ids.scroll)}`);
      await page.keyboard.press('Escape');
      await until(() => !game.hooks.left && !game.hooks.right, null, 'the panels to shut');
      const name = await ev((u) => window.__c.name(game.level.ground.find((x) => x.item?.uid === u).item), ids.sword);
      await until((n) => [...document.querySelectorAll('.glabel')].some((e) => e.textContent === n), name, 'the sword\'s label');
      await frames(2);
      await shot('ground');
      // its label clicked: picked up again
      await page.locator('.glabel', { hasText: name }).first().click();
      await until((u) => window.__c.at(u).startsWith('bag '), ids.sword, 'the sword back in the bag', 8000);
      const sname = await ev((u) => window.__c.name(game.level.ground.find((x) => x.item?.uid === u).item), ids.scroll);
      await until((n) => [...document.querySelectorAll('.glabel')].some((e) => e.textContent === n), sname, 'the scroll\'s label');
      await page.locator('.glabel', { hasText: sname }).first().click();
      await until((u) => window.__c.at(u).startsWith('bag '), ids.scroll, 'the scroll back in the bag', 8000);
      facts.push('nothing open (and the character panel): dropped by the hero with its sound in the camp, picked up again');
      // the hint's tooltip, by the pointer
      await page.keyboard.press('i');
      await until(() => !!document.querySelector('.panel.right.open .goldline span:last-child'), null, 'the bag');
      await frames(2);
      await page.locator('.panel.right.open .goldline span').last().hover();
      await frames(2);
      const tip = await ev(() => (document.getElementById('tooltip')?.style.display === 'block' ? document.getElementById('tooltip').innerText : ''));
      expect(tip.includes('Ctrl+点击') && tip.includes('丢在脚下') && tip.includes('Shift+点击药水'), `the hint's tooltip: ${tip}`);
      // the hint itself says what ctrl+click does
      const hint = await ev(() => document.querySelector('.panel.right.open .goldline span:last-child').textContent);
      expect(hint.includes('Ctrl+点击 存取/出售/丢下'), `the bag's hint: ${hint}`);
      await shot('hint');
      await page.mouse.move(5, 5);
    },

    async phone() {
      await page.setViewportSize({ width: 844, height: 390 });
      const url = new URL(page.url());
      url.searchParams.set('touch', '');
      await load(url.toString());
      await openStash();
      const t = await ev(() => ({ touch: document.body.classList.contains('touch'), hint: document.querySelector('.panel.right.open .goldline span:last-child')?.textContent }));
      expect(t.touch && t.hint?.includes('长按'), `the phone's bag: ${JSON.stringify(t)}`);
      await shot('phone-stash');
      await page.setViewportSize({ width: 1280, height: 800 });
      facts.push('the phone keeps its taps (no ctrl there)');
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
  log(fails.length ? `CTRLCLICK FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `CTRLCLICK OK (${secs} s): ${facts.join('; ')}`);
}
