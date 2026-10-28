// The painted item pictures through the real UI (src/ui/itempics.ts on src/items/picture.ts; tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/icons.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage. A hero at level 40 wears uniques and set items (their own pictures and
// the bases' set pictures, in their colours), a magic pair of gloves and a ring in colour, the belt
// full of potions, the bag full (a long sword with a ruby first in its sockets, runes with their
// numbers, rings, amulets, charms and jewels in their looks, a shako too high for the hero in a red
// cell). Every item's <img> shows the drawn icon at once and its painted picture once it is in (never
// blank, the same box before and after), the look D2's rule gives (checked by key for a dozen items),
// a coloured or numbered one from a blob URL and a plain one from public/icons/items; no cell is
// coloured by quality, only the red one. The camp stash: the personal page with bases beside their
// uniques and set items, 共享 1 with a cap in each of D2's 21 colours and long swords (InvTrans 2:
// only the steel shifts); a set item's tooltip, the quality in its name's green; the cube with items
// in it; the merchant's shelves; an item on the cursor. Then a phone (844×390 at 3 device pixels,
// touch controls, CPU slowed 4×, a 4G-like network; its 2x files never asked for before), the game
// paused so the frames timed are the UI's: the bag, then the stash's personal page full, timed from opening it to every picture in (frame gaps and long tasks
// against the idle ones, the panel's draw, the work done here), opened again with nothing to wait
// for, 共享 2 after it loading only its own pictures; the merchant; then the same stash timed with
// the drawn icons only, as the game was before the pictures. Page and console errors fail the run.
// Shots: the bag with the equipment and belt, the uniques and set items beside their bases, the 21
// colours, the tooltip, the cube, the merchant, the cursor; phone-1-bag, phone-2-stash and
// phone-3-shop beside them. The last line is "ICONS OK …" or "ICONS FAIL …".

export default async function (desktop, shot, log) {
  const t0 = Date.now();
  const errors = [];
  const fails = [];
  const facts = [];
  let step = 'start';
  /** the page the steps act on: play.mjs's, then a phone's of its own */
  let page = desktop;
  const watch = (pg, who) => {
    pg.setDefaultTimeout(8000);
    pg.on('pageerror', (e) => errors.push(`${who} pageerror: ${e.message}`));
    pg.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`);
    });
  };
  watch(desktop, 'desktop');
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  const until = async (fn, arg, what, timeout = 8000) => {
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
      const S = (window.__i = {});
      S.make = (await import('/src/items/gen.ts')).createItem;
      // the game's own copy of src/ui/itempics.ts (an import here can be another one after an edit)
      S.pics = window.__itempics;
      const { D2X_UNIQUES } = await import('/src/data/d2x/uniques.ts');
      const { D2X_SET_ITEMS } = await import('/src/data/d2x/sets.ts');
      const { D2X_PREFIXES, D2X_SUFFIXES } = await import('/src/data/d2x/affixes.ts');
      S.affixes = { prefix: D2X_PREFIXES, suffix: D2X_SUFFIXES };
      S.gems = (await import('/src/data/d2x/socketables.ts')).D2X_GEMS;
      /** a unique or set item by D2's English name of its row (never shown: the game shows our names) */
      S.unique = (en, ilvl = 99) => {
        const u = D2X_UNIQUES.find((x) => x.en === en);
        if (!u) throw new Error(`no unique ${en}`);
        return S.make(u.code, 'unique', ilvl, { row: u.id });
      };
      S.setItem = (en, ilvl = 99) => {
        const s = D2X_SET_ITEMS.find((x) => x.en === en);
        if (!s) throw new Error(`no set item ${en}`);
        return S.make(s.code, 'set', ilvl, { row: s.id });
      };
      /** a magic item of that base with that one affix row (the colour's whoever rolled it) */
      S.magic = (code, kind, row) => ({ ...S.make(code, 'normal', 40), rarity: 'magic', quality: 'magic', [kind === 'prefix' ? 'prefixes' : 'suffixes']: [row] });
      S.affix = (kind, en) => S.affixes[kind].find((a) => a.en === en).id;
      S.goTo = (kind) => {
        const o = game.level.objects.find((x) => x.kind === kind && game.level.inTown(x.pos));
        const p = game.player;
        const spot = game.level.map.nearestWalkable(o.pos.x + o.radius + 0.8, o.pos.z) ?? o.pos;
        p.pos = { ...spot };
        p.prevPos = { ...spot };
        p.intent = null;
      };
      S.close = () => {
        game.hooks.left = null;
        game.hooks.right = null;
        game.hooks.dirty = true;
      };
      /** every item <img> shown: how many, still waiting for its picture, drawn, blank (not loaded), and the work queued */
      S.shown = () => {
        const imgs = [...document.querySelectorAll('.panel.open .gitem img, .panel.open .eqslot img, .belt .slot img, #cursorItem img')].filter((i) => i.offsetParent || i.closest('#cursorItem'));
        return {
          n: imgs.length,
          waiting: imgs.filter((i) => i.dataset.pic).length,
          drawn: imgs.filter((i) => i.src.startsWith('data:')).length,
          blank: imgs.filter((i) => !i.complete || !i.naturalWidth).length,
          pending: S.pics.picturesPending(),
        };
      };
      /** an item's look key and its <img>'s src kind where it is drawn: blob, file (with its name) or drawn */
      S.cell = (uid) => {
        const img = document.querySelector(`[data-uid="${uid}"] img`);
        const it = game.hooks.itemByUid.get(uid);
        const src = img?.src ?? '';
        return { key: it ? S.pics.itemLookKey(it) : null, src: src.startsWith('blob:') ? 'blob' : src.startsWith('data:') ? 'drawn' : (src.match(/icons\/items\/([a-z0-9]+)(\.1x)?\.webp/)?.slice(1).join('') ?? src) };
      };
      /** the boxes of the item <img>s in the open panels, by uid */
      S.boxes = () => Object.fromEntries([...document.querySelectorAll('.panel.open [data-uid] img')].map((i) => [i.parentElement.dataset.uid, [...Object.values(i.getBoundingClientRect().toJSON())].map((v) => Math.round(v * 10) / 10).join()]));
      (async () => (S.debug = (await import('/src/game/debug.ts')).debugOpts))().then(() => (S.debug.god = true));
    });

  const load = async (url) => {
    await ev(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    if (url) await page.goto(url, { timeout: 90000 });
    else await page.reload({ timeout: 90000 });
    await until(() => window.game?.started && window.game.level, null, 'the game to start', 90000);
    await helpers();
  };
  /** every shown item's painted picture in */
  const allIn = async (what, timeout = 10000) => {
    await until(() => {
      const s = window.__i.shown();
      return s.n > 0 && s.waiting === 0 && s.drawn === 0 && s.blank === 0 && s.pending === 0;
    }, null, `${what}: every picture in`, timeout);
    await frames(2);
  };

  /** the hero, its gear, belt and a full bag; the uids of the items checked by key */
  const kit = () =>
    ev(() => {
      const S = window.__i;
      const p = game.player;
      p.level = 40;
      p.base.str = 160;
      p.base.dex = 120;
      for (const pl of [...p.inventory.items]) p.inventory.remove(pl.item);
      p.equipment = {};
      p.belt = [[], [], [], []];
      const ids = {};
      const wear = (slot, it, name) => {
        p.equipment[slot] = it;
        if (name) ids[name] = it.uid;
      };
      wear('head', S.unique("Biggin's Bonnet"), 'bonnet');
      wear('body', S.setItem("Isenhart's Case"), 'case');
      wear('weapon', S.unique('The Gnasher'), 'gnasher');
      wear('offhand', S.setItem("Civerb's Ward"), 'ward');
      wear('hands', S.magic('lgl', 'suffix', S.affix('suffix', 'of Stability')), 'gloves');
      wear('waist', S.setItem("Hsarus' Iron Stay"));
      wear('feet', S.unique('Hotspur'), 'hotspur');
      wear('ring1', S.unique('Nagelring'));
      wear('ring2', S.magic('rin', 'prefix', S.affix('prefix', 'Glowing')));
      wear('neck', S.setItem("Civerb's Icon"));
      for (const [i, c] of ['hp3', 'hp5', 'mp3', 'rvs'].entries()) for (let k = 0; k < 4; k++) p.belt[i].push(S.make(c));
      const add = (it, name) => {
        const ok = p.inventory.add(it);
        if (ok && name) ids[name] = it.uid;
        return ok;
      };
      // a long sword with a flawed ruby first in its sockets: a normal item the gem colours (D2's rule)
      const sword = { ...S.make('lsd', 'normal', 30), sockets: 3, socketed: ['gfr', 'r08'] };
      add(sword, 'sword');
      add(S.unique('Harlequin Crest'), 'shako');
      add(S.magic('cap', 'suffix', S.affix('suffix', 'of Stability')), 'capStab');
      add(S.unique('Bladebone'), 'bladebone');
      for (const c of ['r01', 'r08', 'r20', 'r33']) add(S.make(c), c);
      for (let i = 0; i < 3; i++) add(S.make('rin', 'magic', 30));
      for (let i = 0; i < 2; i++) add(S.make('amu', 'magic', 30));
      for (const c of ['cm1', 'cm1', 'cm2', 'jew', 'jew']) add(S.make(c, 'magic', 40));
      for (const c of ['gpr', 'gsb', 'gfy', 'skz', 'isc', 'tsc', 'key']) add(S.make(c));
      for (const c of ['hp2', 'mp2', 'yps', 'wms', 'vps', 'hp1', 'mp1', 'hp4', 'mp4', 'hp5', 'mp5']) add(S.make(c));
      while (add(S.make('hp1')));
      p.markDirty();
      game.hooks.left = null;
      game.hooks.right = 'inv';
      game.hooks.dirty = true;
      return ids;
    });

  /** the expected look of each named item (D2's rule): file, colour and its ranges, a rune's number */
  const LOOKS = {
    bonnet: 'invcapu',
    case: 'invbrs|lgld.gb',
    gnasher: 'invhaxu',
    ward: 'invlrgu|lyel.g',
    gloves: 'invlgl|dyel.gb',
    hotspur: 'invlbt|cred.gb',
    sword: 'invlsd|dred.g',
    shako: 'invcap|cgrn.gb',
    capStab: 'invcap|dyel.gb',
    bladebone: 'inv2ax|lgry.g',
    r01: 'invrel|r1',
    r33: 'invrzod|r33',
  };
  const checkLooks = async (ids, where) => {
    for (const [name, uid] of Object.entries(ids)) {
      const want = LOOKS[name];
      if (!want) continue;
      const c = await ev((u) => window.__i.cell(u), uid);
      const plain = !want.includes('|');
      expect(c.key === want && (plain ? c.src === `${want}${(await ev(() => window.__i.pics.PIC_STATS.scale)) === '1x' ? '.1x' : ''}` : c.src === 'blob'), `${where}: ${name} shows ${c.key} from ${c.src}, not ${want}`);
    }
  };

  const steps = {
    async bag() {
      const before = await ev(() => ({ ...window.__i.pics.PIC_STATS }));
      const ids = await kit();
      await frames(1);
      // at once: every cell has its <img>, the drawn icon until the picture is in
      const first = await ev(() => ({ ...window.__i.shown(), boxes: window.__i.boxes() }));
      expect(first.n >= 30 && first.waiting > 0, `the bag drawn at once: ${JSON.stringify({ ...first, boxes: undefined })}`);
      await allIn('the bag');
      const after = await ev(() => ({ ...window.__i.shown(), boxes: window.__i.boxes(), stats: window.__i.pics.PIC_STATS }));
      const moved = Object.keys(first.boxes).filter((u) => after.boxes[u] && after.boxes[u] !== first.boxes[u]);
      expect(moved.length === 0, `${moved.length} pictures moved when painted: ${moved.slice(0, 3).map((u) => `${first.boxes[u]} → ${after.boxes[u]}`).join('; ')}`);
      await checkLooks(ids, 'the bag');
      // no cell coloured by quality, the red one kept
      const bg = await ev((ids) => {
        const of = (u) => getComputedStyle(document.querySelector(`[data-uid="${u}"]`)).backgroundColor;
        const magic = [...document.querySelectorAll('.panel.open .gitem.magic, .panel.open .gitem.unique, .panel.open .gitem.set, .panel.open .gitem.rare')].filter((e) => !e.classList.contains('unusable')).map((e) => getComputedStyle(e).backgroundColor);
        const slots = [...document.querySelectorAll('.panel.open .eqslot')].filter((e) => !e.classList.contains('unusable')).map((e) => getComputedStyle(e).backgroundColor);
        return { magic: [...new Set(magic)], slots: [...new Set(slots)], shako: of(ids.shako), shakoRed: document.querySelector(`[data-uid="${ids.shako}"]`).classList.contains('unusable') };
      }, ids);
      expect(bg.magic.join() === 'rgba(0, 0, 0, 0)' && bg.slots.length === 1 && bg.shakoRed && bg.shako === 'rgba(160, 20, 20, 0.35)', `cell colours: ${JSON.stringify(bg)}`);
      expect(after.stats.scale === '1x', `a desktop screen at 1 device pixel loads the ${after.stats.scale} files`);
      await shot('bag-equipment-belt');
      facts.push(`the bag, ${after.n} pictures (${after.stats.files - before.files} files), each drawn at once then painted in the same box; looks by D2's rule; no quality cell, the shako's red one kept`);
      steps.ids = ids;
    },

    async stash() {
      const ids = await ev(() => {
        const S = window.__i;
        const p = game.player;
        const ids = {};
        const put = (it, name) => {
          if (!p.stash.add(it)) throw new Error(`no room on the personal page for ${it.baseId}`);
          if (name) ids[name] = it.uid;
        };
        // a row each: a base, then its uniques and set items (their own pictures, the base's column, or
        // the base's in a colour), left to right
        for (const pl of [...p.stash.items]) p.stash.remove(pl.item);
        const rows = [
          [['hax'], ['The Gnasher', 'u'], ['2ax'], ['Bladebone', 'u'], ["Berserker's Hatchet", 's']],
          [['cap'], ["Biggin's Bonnet", 'u'], ['fhl'], ['Duskdeep', 'u'], ["Isenhart's Horns", 's']],
          [['lrg'], ['Stormguild', 'u'], ["Civerb's Ward", 's'], ['buc'], ['Pelta Lunata', 'u']],
          [["Hsarus' Iron Fist", 's'], ['mbt'], ["Hsarus' Iron Heel", 's'], ['Treads of Cthon', 'u']],
        ];
        let y = 0;
        for (const row of rows) {
          let x = 0;
          let h = 0;
          for (const [name, kind] of row) {
            const it = kind ? (kind === 'u' ? S.unique(name) : S.setItem(name)) : S.make(name);
            const [w, hh] = p.stash.size(it);
            if (!p.stash.canPlace(it, x, y)) throw new Error(`no room on the personal page for ${it.baseId} at ${x},${y}`);
            p.stash.place(it, x, y);
            ids[kind ? name : `base-${name}`] = it.uid;
            x += w;
            h = Math.max(h, hh);
          }
          y += h;
        }
        game.shared.pages[0].items.length = 0;
        // 共享 1: a cap in each of D2's colours: a magic one by an affix row of that colour, else a normal
        // one with a gem of it in its socket; bright white only uniques and set items have (Cerebus' Bite);
        // then long swords (InvTrans 2: only the steel shifts)
        const ORDER = ['whit', 'lgry', 'dgry', 'blac', 'lblu', 'dblu', 'cblu', 'lred', 'dred', 'cred', 'lgrn', 'dgrn', 'cgrn', 'lyel', 'dyel', 'lgld', 'dgld', 'lpur', 'dpur', 'oran', 'bwht'];
        const rowOf = (c) => {
          for (const kind of ['suffix', 'prefix']) {
            const a = S.affixes[kind].find((x) => x.color === c && x.itypes.some((t) => t === 'armo' || t === 'helm'));
            if (a) return [kind, a.id];
          }
          for (const kind of ['suffix', 'prefix']) {
            const a = S.affixes[kind].find((x) => x.color === c);
            if (a) return [kind, a.id];
          }
        };
        const page1 = game.shared.pages[0];
        ids.colours = [];
        for (const c of ORDER) {
          const r = rowOf(c);
          const gem = S.gems.find((g) => g.color === c);
          const it = r ? S.magic('cap', r[0], r[1]) : gem ? { ...S.make('cap', 'normal', 40), sockets: 1, socketed: [gem.id] } : c === 'bwht' ? S.unique("Cerebus' Bite") : null;
          if (it && page1.add(it)) ids.colours.push([c, it.uid]);
        }
        for (const c of ['cred', 'blac']) {
          const r = rowOf(c);
          const it = S.magic('lsd', r[0], r[1]);
          if (page1.add(it)) ids.colours.push([`${c} sword`, it.uid]);
        }
        game.hooks.stashPage = 0;
        S.goTo('stash');
        game.hooks.openPanel('stash');
        return ids;
      });
      await until(() => game.hooks.left === 'stash' && !!document.querySelector('.panel.left.open .stash-tabs'), null, 'the stash');
      await allIn('the personal page');
      const looks = await ev((ids) => Object.fromEntries(Object.entries(ids).filter(([k]) => k !== 'colours').map(([k, u]) => [k, window.__i.cell(u)])), ids);
      const want = {
        'base-hax': 'invhax', 'The Gnasher': 'invhaxu', 'base-2ax': 'inv2ax', Bladebone: 'inv2ax|lgry.g', "Berserker's Hatchet": 'inv2ax|dred.g',
        'base-fhl': 'invfhl', Duskdeep: 'invfhlu', "Isenhart's Horns": 'invfhlu|lgld.gb', 'base-lrg': 'invlrg', Stormguild: 'invlrgu', "Civerb's Ward": 'invlrgu|lyel.g',
        'base-mbt': 'invmbt', "Hsarus' Iron Heel": 'invmbt|dred.gb', 'Treads of Cthon': 'invmbt|lgrn.gb',
      };
      for (const [k, w] of Object.entries(want)) expect(looks[k]?.key === w, `the personal page: ${k} shows ${looks[k]?.key}, not ${w}`);
      await shot('stash-uniques-sets');
      // 共享 1: the colours
      await page.locator('.panel.left.open .stash-tabs .tab').nth(1).click();
      await page.mouse.move(640, 700);
      await frames(2);
      await allIn('共享 1');
      const cols = await ev((list) => list.map(([c, u]) => [c, window.__i.cell(u).key]), ids.colours);
      const bad = cols.filter(([c, k]) => !k.includes(`|${c.split(' ')[0]}.`));
      expect(cols.length === 23 && bad.length === 0, `共享 1's colours: ${cols.length - 2} and the swords, wrong ${JSON.stringify(bad)}`);
      await shot('stash-21-colours');
      facts.push(`the stash: ${Object.keys(want).length} bases, uniques and set items as D2 shows them; a cap (and Cerebus' Bite) in each of D2's ${cols.length - 2} colours, and long swords (InvTrans 2)`);
      // back to the personal page, a unique's tooltip: its quality in its name's colour
      await page.locator('.panel.left.open .stash-tabs .tab').nth(0).click();
      await frames(2);
      await page.locator(`.panel.left.open .gitem[data-uid="${ids['Civerb\'s Ward']}"]`).hover();
      await frames(3);
      const tip = await ev(() => {
        const t = document.querySelector('#tooltip');
        const first = t?.querySelector('.title');
        return t && t.style.display === 'block' ? { text: t.textContent.slice(0, 30), color: first ? getComputedStyle(first).color : '' } : null;
      });
      expect(tip && tip.color === 'rgb(34, 212, 34)', `the set item's tooltip: ${JSON.stringify(tip)}`);
      await shot('stash-tooltip');
      steps.stashIds = ids;
    },

    async cube() {
      await ev(() => {
        const S = window.__i;
        const p = game.player;
        for (const pl of [...p.cube.items]) p.cube.remove(pl.item);
        for (const it of [S.make('r10'), S.make('gpr'), S.make('rin', 'magic', 20), S.make('jew', 'magic', 40), S.unique('Nagelring')]) p.cube.add(it);
        game.hooks.left = 'cube';
        game.hooks.right = 'inv';
        game.hooks.dirty = true;
      });
      await until(() => game.hooks.left === 'cube' && document.querySelectorAll('.panel.left.open .gitem').length === 5, null, 'the cube');
      await allIn('the cube');
      await shot('cube');
      facts.push('the cube');
    },

    async shop() {
      await ev(() => {
        window.__i.goTo('vendor');
        game.hooks.openPanel('shop');
      });
      await until(() => game.hooks.left === 'shop' && document.querySelectorAll('.panel.left.open .gitem').length > 10, null, 'the shop');
      await allIn('the shop', 15000);
      const n = await ev(() => document.querySelectorAll('.panel.left.open .gitem').length);
      await shot('shop');
      facts.push(`the merchant's ${n} items`);
    },

    async cursor() {
      await ev((u) => {
        const p = game.player;
        const it = p.inventory.items.find((x) => x.item.uid === u).item;
        p.inventory.remove(it);
        game.hooks.setCursorItem(it);
        game.hooks.dirty = true;
      }, steps.ids.bladebone);
      // held over the camp between the panels, drawn again with the item taken
      await frames(2);
      await page.mouse.move(600, 380);
      await frames(3);
      await allIn('the cursor');
      const c = await ev(() => document.querySelector('#cursorItem img')?.src.slice(0, 5));
      expect(c === 'blob:', `the cursor's picture: ${c}`);
      await shot('cursor');
      await ev(() => {
        game.player.inventory.add(game.hooks.cursorItem);
        game.hooks.setCursorItem(null);
        window.__i.close();
      });
    },

    async phone() {
      // a phone of its own: a browser context at its size and pixels, touch, its files never asked for here
      const url = new URL(desktop.url());
      url.searchParams.set('touch', '');
      const ctx = await desktop.context().browser().newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      page = await ctx.newPage();
      watch(page, 'phone');
      await page.goto(url.toString(), { timeout: 90000 });
      const cdp = await ctx.newCDPSession(page);
      // the phone's shots beside play.mjs's own
      const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : (await import('node:os')).tmpdir();
      let k = 0;
      const phoneShot = async (name) => {
        const file = (await import('node:path')).join(out, `phone-${++k}-${name}.png`);
        await page.screenshot({ path: file });
        console.log('shot', file);
      };
      /** a phone's page: its CPU and network (the 2x files: never asked for before in this browser) */
      const phonePage = async (pictures) => {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await load(url.toString());
        const touch = await ev(() => ({ touch: document.body.classList.contains('touch'), dpr: devicePixelRatio }));
        expect(touch.touch && touch.dpr === 3, `not a phone: ${JSON.stringify(touch)}`);
        // without pictures: only the drawn icons, as the game was before them
        if (!pictures) await ev(() => import('/src/data/itempics.ts').then((m) => Object.keys(m.ITEM_PICTURES).forEach((k) => delete m.ITEM_PICTURES[k])));
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 70, downloadThroughput: (9e6 / 8) | 0, uploadThroughput: (2e6 / 8) | 0 });
      };
      /** the personal page full of things to show, 共享 2 with a few, by the stash, the game paused: the frames timed are the UI's */
      const fill = () =>
        ev(() => {
          const S = window.__i;
          const p = game.player;
          for (const pl of [...p.stash.items]) p.stash.remove(pl.item);
          const kinds = ['rin', 'amu', 'jew', 'cm1', 'cm2', 'cm3', 'r02', 'r05', 'r11', 'r14', 'r17', 'r22', 'r25', 'r30', 'gcb', 'gfg', 'glw', 'gsy', 'gpv', 'skf', 'cap', 'skp', 'lgl', 'vgl', 'lbt', 'mbl', 'buc', 'hax', 'wnd', 'dgr', 'jav', 'ssd', 'kit', 'msk', 'bhm', 'scp', 'gsc', 'tkf', 'bkf', 'ces'];
          const qs = ['magic', 'rare', 'unique', 'set', 'normal', 'superior'];
          let n = 0;
          for (let round = 0; round < 6; round++) {
            for (const [i, c] of kinds.entries()) {
              let it;
              try {
                it = S.make(c, qs[(i + round) % qs.length], 30 + round * 10);
              } catch {
                it = S.make(c, 'magic', 40);
              }
              if (p.stash.add(it)) n++;
            }
          }
          game.shared.pages[1].items.length = 0;
          for (const c of ['amu', 'rin', 'jew', 'r31', 'r32', 'gpy', 'gpb', 'cm3', 'ob1', 'ywn']) game.shared.pages[1].add(S.make(c, c.startsWith('r') || c.startsWith('g') ? 'normal' : 'magic', 50));
          S.close();
          game.hooks.stashPage = 0;
          S.goTo('stash');
          game.paused = true;
          return n;
        });
      /** the idle frames first, then the stash opened and timed to its last picture in; opened again; 共享 2 */
      const measure = (pictures) =>
        ev(async (pictures) => {
          const S = window.__i;
          const r1 = (v) => Math.round(v * 10) / 10;
          const rec = () => {
            const gaps = [];
            const long = [];
            let last = performance.now();
            let on = true;
            const tick = (t) => {
              gaps.push(t - last);
              last = t;
              if (on) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(e.duration)));
            po.observe({ type: 'longtask' });
            return () => {
              on = false;
              po.disconnect();
              const g = gaps.slice(1).sort((a, b) => a - b);
              return { frames: g.length, p50: r1(g[g.length >> 1] ?? 0), p95: r1(g[Math.floor(g.length * 0.95)] ?? 0), max: r1(g.at(-1) ?? 0), over50: g.filter((x) => x > 50).length, longTasks: long.length, longest: r1(Math.max(0, ...long)) };
            };
          };
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          // all in: every picture painted, or with none every drawn icon there
          const done = () => {
            const s = S.shown();
            return document.querySelector('.panel.left.open .gitem') && s.waiting === 0 && (s.drawn === 0 || !pictures) && s.blank === 0 && s.pending === 0;
          };
          let stop = rec();
          await wait(2500);
          const idle = stop();
          const draws = [];
          const draw = game.hooks.renderPanels.bind(game.hooks);
          game.hooks.renderPanels = () => {
            const t = performance.now();
            draw();
            draws.push(r1(performance.now() - t));
          };
          // the longest piece of work while this page's pictures come in
          S.pics.PIC_STATS.longestMs = 0;
          const s0 = { ...S.pics.PIC_STATS };
          stop = rec();
          const t = performance.now();
          game.hooks.openPanel('stash');
          let first = null;
          while (performance.now() - t < 60000) {
            await frame();
            if (!first && document.querySelector('.panel.left.open .gitem')) first = { at: r1(performance.now() - t), ...S.shown() };
            if (first && done()) break;
          }
          const allIn = r1(performance.now() - t);
          // on: the frames until it is all in, and a second after
          await wait(1000);
          const open = stop();
          const s1 = { ...S.pics.PIC_STATS };
          // opened again: every picture ready, nothing to load
          S.close();
          await wait(300);
          const t2 = performance.now();
          game.hooks.openPanel('stash');
          await frame();
          await frame();
          const again = { at: r1(performance.now() - t2), ...S.shown() };
          // 共享 2: only its own pictures load
          const s2 = { ...S.pics.PIC_STATS };
          document.querySelectorAll('.panel.left.open .stash-tabs .tab')[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
          const t3 = performance.now();
          while (performance.now() - t3 < 30000) {
            await frame();
            if (done()) break;
          }
          const page2At = r1(performance.now() - t3);
          const s3 = { ...S.pics.PIC_STATS };
          game.hooks.renderPanels = draw;
          const files = (g) => new Set(g.items.map((x) => S.pics.itemLookKey(x.item)?.split('|')[0]).filter(Boolean)).size;
          return {
            idle,
            open,
            first,
            allIn,
            draws,
            files: s1.files - s0.files,
            made: s1.made - s0.made,
            makeMs: r1(s1.makeMs - s0.makeMs),
            longestJob: r1(s1.longestMs),
          longestWhat: s1.longest,
            again,
            page2: { files: s3.files - s2.files, pictures: files(game.shared.pages[1]), at: page2At },
            pagePictures: files(game.player.stash),
          };
        }, pictures);

      // the bag, then the stash timed
      await phonePage(true);
      const ids = await kit();
      await allIn("the phone's bag", 30000);
      const bagStats = await ev(() => ({ ...window.__i.pics.PIC_STATS }));
      expect(bagStats.scale === '2x', `a phone at 3 device pixels loads the ${bagStats.scale} files`);
      await checkLooks(ids, "the phone's bag");
      await phoneShot('bag');
      const n = await fill();
      const m = await measure(true);
      log(`ICONS phone stash, painted (${n} items, ${m.pagePictures} pictures on the page): ${JSON.stringify(m)}`);
      expect(m.allIn < 30000 && m.first?.n > 0 && m.first.blank === 0, `the phone's stash: ${JSON.stringify(m)}`);
      expect(m.longestJob < 50, `a piece of the pictures' work took ${m.longestJob} ms`);
      expect(m.again.waiting === 0 && m.again.drawn === 0 && m.again.blank === 0, `the stash opened again waits for pictures: ${JSON.stringify(m.again)}`);
      expect(m.page2.files <= m.page2.pictures, `共享 2 loaded ${m.page2.files} files for its ${m.page2.pictures} pictures`);
      await ev(() => {
        game.paused = false;
        game.hooks.stashPage = 0;
        game.hooks.dirty = true;
      });
      await frames(3);
      await allIn("the phone's stash", 30000);
      await phoneShot('stash');
      await ev(() => {
        window.__i.goTo('vendor');
        game.hooks.openPanel('shop');
      });
      await until(() => game.hooks.left === 'shop' && document.querySelectorAll('.panel.left.open .gitem').length > 10, null, "the phone's shop");
      await allIn("the phone's shop", 40000);
      await phoneShot('shop');

      // the same with the drawn icons only, as before the pictures: what they add
      await phonePage(false);
      await kit();
      const n0 = await fill();
      const b = await measure(false);
      log(`ICONS phone stash, drawn icons only (${n0} items): ${JSON.stringify({ idle: b.idle, open: b.open, first: b.first, draws: b.draws, again: b.again })}`);
      await ev(() => {
        game.paused = false;
      });
      facts.push(
        `the phone (4× slower CPU, 4G, its 2x files cold), the personal page of ${n} items: drawn in ${m.draws[0]} ms (drawn icons only ${b.draws[0]} ms), every picture in ${m.allIn} ms (${m.files} files, ${m.made} made in ${m.makeMs} ms, the longest piece ${m.longestJob} ms); ` +
          `frames p95 ${m.open.p95} / max ${m.open.max} ms, ${m.open.over50} over 50 ms (drawn only ${b.open.p95} / ${b.open.max}, ${b.open.over50}; idle ${m.idle.p95} / ${m.idle.max}), long tasks ${m.open.longTasks} (longest ${m.open.longest} ms; drawn only ${b.open.longTasks}, ${b.open.longest} ms); ` +
          `opened again ${m.again.at} ms, nothing to wait for; 共享 2 ${m.page2.files} files for its ${m.page2.pictures} pictures`,
      );
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await ctx.close();
      page = desktop;
    },
  };

  await load();
  for (const [name, fn] of Object.entries(steps)) {
    if (typeof fn !== 'function') continue;
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
  log(fails.length ? `ICONS FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `ICONS OK (${secs} s): ${facts.join('; ')}`);
}
