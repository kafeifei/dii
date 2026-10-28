// The tomes and their scrolls through the real UI, as Diablo II has them (src/items/tomes.ts;
// tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/tomes.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage. A new hero carries CharStats.txt's kit: a scroll of town portal and
// one of identify in the bag, four minor healing potions in the belt. At the merchant (the 杂货
// page) a tome of town portal is bought with the charges its shelf copy has; the bag's scroll is
// dropped on it (one more charge); a scroll bought goes straight into it at the scroll's price, its
// tooltip saying so, and shift + right-click fills it to 20, paying for each. The tome's tooltip
// shows its charges and the hints. Out on Blood Moor a right-click on it in the bag casts a town
// portal, using a charge as the portal opens; P reads it too; the HUD's portal button counts what
// is left. Then at a phone's size with the touch controls: the shop's tooltip, and a long press on
// a scroll filling the tome. Page and console errors fail the run. Shots: the kit, the shop's
// tooltip, the tome filled, the tome's tooltip, the portal from the tome, the phone's HUD, shop and
// tome. The last line is "TOMES OK …" or "TOMES FAIL …".

const CAMP_AREA = 1;
const WILD_AREA = 2;

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
  /** the item element of `uid` in a grid of the open panels */
  const cell = (uid) => page.locator(`.panel.open .gitem[data-uid="${uid}"]`);
  const tooltipText = () => ev(() => (document.getElementById('tooltip')?.style.display === 'block' ? document.getElementById('tooltip').innerText : ''));

  /** the page's helpers (after a load) */
  const helpers = () =>
    ev(() => {
      const S = (window.__t = {});
      S.bag = () => game.player.inventory.items.map((x) => x.item);
      S.tome = () => S.bag().find((it) => it.baseId === 'tbk');
      S.shelf = (code) => game.shop.all().find((it) => it.baseId === code);
      S.said = [];
      const message = game.hooks.message.bind(game.hooks);
      game.hooks.message = (t, c, d) => {
        S.said.push(t);
        message(t, c, d);
      };
      /** a walkable spot in area `id` about `far` tiles from where its seam with `from` opens, toward `to` */
      S.spotIn = (id, from, to, far) => {
        const L = game.level;
        const seam = (a, b) => L.layout.seams.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        const s1 = seam(from, id);
        const s2 = seam(id, to);
        const p1 = s1.a === id ? s1.ta : s1.tb;
        const p2 = s2.a === id ? s2.ta : s2.tb;
        const t = Math.min(0.9, far / Math.hypot(p2.x - p1.x, p2.z - p1.z));
        return L.map.nearestWalkable(p1.x + (p2.x - p1.x) * t, p1.z + (p2.z - p1.z) * t);
      };
      /** the hero beside the merchant, the shop open on its misc page */
      S.toShop = () => {
        const v = game.level.objects.find((o) => o.kind === 'vendor');
        const p = game.player;
        const spot = game.level.map.nearestWalkable(v.pos.x + v.radius + 0.8, v.pos.z) ?? v.pos;
        p.pos = { ...spot };
        p.prevPos = { ...spot };
        p.intent = null;
        game.hooks.openPanel('shop');
        const misc = game.shop.shown().find((s) => s.tab.page === 'misc');
        game.shop.selected = misc?.tab ?? null;
        game.hooks.dirty = true;
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

  const steps = {
    async kit() {
      await load();
      const k = await ev(() => ({
        area: game.area?.id,
        bag: window.__t.bag().map((it) => it.baseId).sort().join(),
        belt: game.player.belt.map((c) => c.map((it) => it.baseId).join('+')).join(' '),
        portals: document.querySelector('.hbtn .count')?.textContent,
      }));
      expect(k.area === CAMP_AREA, `started in area ${k.area}`);
      expect(k.bag === 'isc,tsc' && k.belt === 'hp1 hp1 hp1 hp1', `the kit: bag ${k.bag}, belt ${k.belt}`);
      expect(k.portals === '1', `the HUD's portal button counts ${k.portals}`);
      await page.keyboard.press('i');
      await until(() => !!document.querySelector('.panel.right.open [data-uid]'), null, 'the bag');
      await frames();
      await shot('kit');
      await page.keyboard.press('i');
    },

    async shop() {
      await ev(() => {
        window.__t.toShop();
        game.player.gold = 5000;
      });
      await until(() => !!document.querySelector('.panel.left.open .gitem'), null, 'the shop');
      await frames();
      // the tome off the shelf, with the charges its shelf copy has
      const shelfTome = await ev(() => ({ uid: window.__t.shelf('tbk').uid, qty: window.__t.shelf('tbk').qty, price: Number(0) }));
      await cell(shelfTome.uid).hover();
      const tomePrice = await tooltipText();
      await cell(shelfTome.uid).click();
      const bought = await ev(() => ({ qty: window.__t.tome()?.qty, gold: game.player.gold }));
      expect(bought.qty === shelfTome.qty && bought.qty >= 1 && bought.qty <= 4, `the tome bought holds ${bought.qty}, the shelf's ${shelfTome.qty}`);
      facts.push(`a tome of ${bought.qty} for ${5000 - bought.gold} (${tomePrice.split('\n').find((l) => l.startsWith('购买价格'))})`);
      // the bag's scroll onto it
      const ids = await ev(() => ({ scroll: window.__t.bag().find((it) => it.baseId === 'tsc').uid, tome: window.__t.tome().uid }));
      await cell(ids.scroll).click();
      await until(() => !!game.hooks.cursorItem, null, 'the scroll on the cursor');
      await cell(ids.tome).click();
      const dropped = await ev(() => ({ qty: window.__t.tome().qty, cursor: !!game.hooks.cursorItem, scrolls: window.__t.bag().filter((it) => it.baseId === 'tsc').length }));
      expect(dropped.qty === bought.qty + 1 && !dropped.cursor && dropped.scrolls === 0, `the scroll dropped on the tome: ${JSON.stringify(dropped)}`);
      // a scroll bought: straight into the tome, its tooltip says so
      const scroll = await ev(() => window.__t.shelf('tsc').uid);
      await cell(scroll).hover();
      await frames(2);
      const tip = await tooltipText();
      expect(tip.includes('放进背包里的城镇传送之书') && tip.includes(`Shift+右键补满：${20 - dropped.qty} 张`), `the shop's tooltip: ${tip.replace(/\n/g, ' / ')}`);
      await shot('shop-scroll-tooltip');
      const g0 = await ev(() => game.player.gold);
      await cell(scroll).click();
      const one = await ev(() => ({ qty: window.__t.tome().qty, gold: game.player.gold, bag: window.__t.bag().length, shelf: !!window.__t.shelf('tsc') }));
      const each = g0 - one.gold;
      expect(one.qty === dropped.qty + 1 && one.bag === 2 && one.shelf && each > 0, `one bought: ${JSON.stringify(one)}, ${each} gold`);
      // shift + right-click: filled to 20, each scroll paid for
      await cell(scroll).click({ button: 'right', modifiers: ['Shift'] });
      const filled = await ev(() => ({ qty: window.__t.tome().qty, gold: game.player.gold, said: window.__t.said.at(-1) }));
      const n = 20 - one.qty;
      expect(filled.qty === 20 && one.gold - filled.gold === n * each, `filled: ${filled.qty}, paid ${one.gold - filled.gold} for ${n} at ${each} (${filled.said})`);
      await frames();
      await shot('tome-filled');
      // full now: a scroll bought goes into the bag
      await cell(scroll).click();
      const after = await ev(() => window.__t.bag().filter((it) => it.baseId === 'tsc').length);
      expect(after === 1, `a scroll bought beside the full tome: ${after} in the bag`);
      facts.push(`a scroll ${each}, ${n} more to fill it ${n * each}`);
      // the tome's tooltip
      await cell(ids.tome).hover();
      await frames(2);
      const tt = await tooltipText();
      expect(tt.includes('数量: 20/20') && tt.includes('右键点击打开回城传送门') && tt.includes('把城镇传送卷轴放到书上补充'), `the tome's tooltip: ${tt.replace(/\n/g, ' / ')}`);
      await shot('tome-tooltip');
      await page.mouse.move(5, 5);
    },

    async portal() {
      const spot = await ev(() => window.__t.spotIn(2, 1, 3, 16));
      await ev((at) => {
        game.teleportWithin(at);
        for (const m of game.level.monsters) if (!m.dead && Math.hypot(m.pos.x - at.x, m.pos.z - at.z) < 25) game.killMonster(m, 'phys');
        game.level.ground.length = 0;
      }, spot);
      await frames(6);
      const area = await ev(() => game.area?.id);
      expect(area === WILD_AREA, `out on area ${area}`);
      await ev(() => {
        game.hooks.left = null;
        game.hooks.right = null;
        game.hooks.dirty = true;
      });
      await page.keyboard.press('i');
      await until(() => !!document.querySelector('.panel.right.open [data-uid]'), null, 'the bag');
      const uid = await ev(() => window.__t.tome().uid);
      await cell(uid).click({ button: 'right' });
      const casting = await ev(() => ({ state: game.player.state, qty: window.__t.tome().qty }));
      expect(casting.state === 'cast' && casting.qty === 20, `right-clicked: ${JSON.stringify(casting)} (the charge goes as it opens)`);
      await until(() => game.level.objects.some((o) => o.kind === 'portal'), null, 'the portal to open');
      await page.waitForTimeout(400);
      const opened = await ev(() => ({ qty: window.__t.tome().qty, count: document.querySelector('.hbtn .count')?.textContent, scrolls: window.__t.bag().filter((it) => it.baseId === 'tsc').length }));
      expect(opened.qty === 19 && opened.count === String(19 + opened.scrolls), `opened: tome ${opened.qty}, the HUD counts ${opened.count}`);
      await page.keyboard.press('i');
      await frames(6);
      await shot('portal-from-tome');
      // P reads the tome again, not the scroll
      await until(() => game.player.state === 'idle' || game.player.state === 'move', null, 'the cast to end');
      await page.keyboard.press('p');
      await until(() => window.__t.tome().qty === 18, null, 'P to read the tome');
      const p = await ev(() => ({ scrolls: window.__t.bag().filter((it) => it.baseId === 'tsc').length, portals: game.level.objects.filter((o) => o.kind === 'portal').length }));
      expect(p.scrolls === 1 && p.portals === 1, `P: ${JSON.stringify(p)}`);
      facts.push('the tome right-clicked and P: 20 → 19 → 18, the scroll kept');
    },

    async phone() {
      await page.setViewportSize({ width: 844, height: 390 });
      const url = new URL(page.url());
      url.searchParams.set('touch', '');
      await load(url.toString());
      await frames(6);
      const hud = await ev(() => document.querySelector('.hbtn .count')?.textContent);
      expect(hud === '1', `the phone's portal button counts ${hud}`);
      await shot('phone-hud');
      await ev(() => {
        window.__t.toShop();
        game.player.gold = 5000;
      });
      await until(() => !!document.querySelector('.panel.left.open .gitem'), null, 'the shop');
      await frames();
      const touch = await ev(() => document.body.classList.contains('touch'));
      expect(touch, 'not in the touch layout');
      // a tap shows the tome's tooltip, a second buys it
      const tomeUid = await ev(() => window.__t.shelf('tbk').uid);
      await cell(tomeUid).click();
      await cell(tomeUid).click();
      const t = await ev(() => window.__t.tome()?.qty);
      expect(t >= 1 && t <= 4, `tapped twice, a tome of ${t}`);
      const scroll = await ev(() => window.__t.shelf('tsc').uid);
      await cell(scroll).click();
      await frames(2);
      const tip = await tooltipText();
      expect(tip.includes('长按补满'), `the phone's tooltip: ${tip.replace(/\n/g, ' / ')}`);
      await shot('phone-shop-tooltip');
      // a long press: the tome filled
      const box = await cell(scroll).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
      const filled = await ev(() => ({ qty: window.__t.tome().qty, said: window.__t.said.at(-1) }));
      expect(filled.qty === 20, `long-pressed: ${JSON.stringify(filled)}`);
      await frames();
      await shot('phone-tome-filled');
      // a tap on the tome in the bag: its tooltip, the hint as a phone has it
      await cell(await ev(() => window.__t.tome().uid)).click();
      await frames(2);
      const tt = await tooltipText();
      expect(tt.includes('数量: 20/20') && tt.includes('长按打开回城传送门'), `the phone's tome tooltip: ${tt.replace(/\n/g, ' / ')}`);
      await shot('phone-tome-tooltip');
      await page.setViewportSize({ width: 1280, height: 800 });
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
  log(fails.length ? `TOMES FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `TOMES OK (${secs} s): ${facts.join('; ')}`);
}
