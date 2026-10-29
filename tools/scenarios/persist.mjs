// What a player does with saves, through the real title (no ?dev), each step checked against storage
// (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/persist.mjs --url "http://localhost:5174/"
// Clears this browser's storage first (play.mjs runs its own profile). A new paladin touches Cold
// Plains' waypoint: a reload plays on with it, and so does the title's "continue" after saving and
// quitting. A copy of the tab (opened from it, carrying its sessionStorage, as a duplicated tab
// does) starts at the title, not in the game, and lists the hero as played in another window. Gold
// picked up in the first tab and not yet autosaved is then in the copy once it takes the hero over:
// the first tab saves it, hands it over and stops behind its notice, writing nothing more. Back in
// the first tab, its notice's button leads to the title. Then storage that refuses the write: the
// game says so and keeps saying it until a write goes in. Last, a townsperson's line cut off by
// quitting: the hero (now the copy's) is given the Den of Evil by Akara in a scrolling line, and
// mid-line ≡ → 保存并返回标题. The line counts as heard for that hero, saved before the quit (as Esc
// would cut it short in Diablo II on the way to its menu), and none of it is left behind: no dialogue
// or message (the refused write's may still be up) under the title, nor in the game of a hero made
// next, whose quest is untouched and whose quest log has no news; the first hero continued has the
// quest given. Then her reward cut off the same way (the den taken as cleared): its skill point is
// that hero's, once, saved, and its word on screen goes with them: none over the title, none in the
// next hero's game, whose points and quest are untouched. Then a window left in its menu: the copy,
// just after an autosave, picks up an item and a pile of gold and opens the menu at once (which saves
// them), and stays there, visible all along, for longer than save.ts's GONE_MS. Its claim on the hero
// is kept fresh meanwhile, so the first tab's title, opened only now, lists the hero as played in
// another window; picked there, the copy saves, hands it over and stops behind its notice, which is
// over its menu, and stays stopped when Esc shuts the menu under it. The first tab has the item and
// the gold, and keeps them in its own save. Then the hand-over's corners, the two tabs taking that hero
// from each other: the tab playing it, its storage event for the other's claim held back, opens its
// menu (which saves) before the event comes, and still writes a last time and hands over, so the other
// doesn't wait out its 3 s and has the gold it picked up; its notice says it saved, and hides the menu
// (the brightness where 继续游戏 lies under it barely ranges). Storage refusing that last write: the
// notice says the last progress wasn't saved, under the unsaved badge, and the other plays on from the
// last save that went in. A tab reloaded while its models are held back keeps its claim fresh past
// GONE_MS, so the other's title, opened only then, says the hero is in another window; picked there,
// the reloading tab hands it over at once, says so, and never starts, its models in or not. A tab
// reloaded with another window's fresh claim got into storage unheard of (written from its own page,
// which has no storage event for it) waits, once its models are in, for that window to hand the hero
// over, and reads what it wrote last. Page errors fail the run.
// The last line is "PERSIST OK …" or "PERSIST FAIL …".

export default async function (page, shot, log) {
  const errors = [];
  const fails = [];
  const facts = [];
  let step = 'start';
  page.setDefaultTimeout(30000);
  const watch = (pg, who) => pg.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  watch(page, 'tab 1');
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  const started = (pg) => pg.waitForFunction(() => window.game?.started && window.game.level, null, { timeout: 60000 });
  /** the hero's save as storage has it: its waypoints and gold */
  const stored = (pg) =>
    pg.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('dii-save-v1') || 'null');
      return d && { waypoints: d.progress?.[d.difficulty ?? 0]?.waypoints ?? [], gold: d.gold };
    });

  try {
    step = 'new hero';
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForSelector('.overlay.open .btn.new:not([disabled])', { timeout: 60000 });
    await page.click('.overlay.open .btn.new');
    await started(page);
    await page.waitForTimeout(1000);

    step = 'waypoint';
    const touched = await page.evaluate(() => {
      const L = game.level;
      const wp = L.objects.find((o) => o.kind === 'waypoint' && L.areaAt(o.pos.x, o.pos.z).id === 3);
      if (!wp) return null;
      game.teleportWithin(L.map.nearestWalkable(wp.pos.x + 1.2, wp.pos.z) ?? wp.pos, 'walk');
      game.interact(wp);
      game.hooks.closePanels?.();
      return [...game.player.waypoints];
    });
    expect(touched?.includes(3), `Cold Plains' waypoint not touched: ${JSON.stringify(touched)}`);
    expect((await stored(page))?.waypoints.includes(3), 'the touched waypoint is not in the save');

    step = 'reload';
    await page.reload();
    await started(page);
    expect((await page.evaluate(() => game.player.waypoints)).includes(3), 'a reload lost the waypoint');

    step = 'title and continue';
    await page.keyboard.press('Escape');
    await page.click('.overlay.open .btn.quit');
    await page.waitForSelector('.overlay.open .saves .btn.pick');
    await page.click('.overlay.open .saves .btn.pick');
    await started(page);
    expect((await page.evaluate(() => game.player.waypoints)).includes(3), 'saving, quitting and continuing lost the waypoint');
    facts.push('waypoint kept through a reload and the title');

    step = 'a copy of the tab';
    const [page2] = await Promise.all([page.waitForEvent('popup'), page.evaluate(() => void window.open(location.href, '_blank'))]);
    watch(page2, 'tab 2');
    await page2.setViewportSize({ width: 1280, height: 800 });
    await page2.waitForSelector('.overlay.open .saves .btn.pick', { timeout: 60000 });
    await page2.waitForTimeout(1500);
    const copy = await page2.evaluate(() => ({ playing: !!window.game?.started, row: document.querySelector('.overlay.open .saves .btn.pick span')?.textContent }));
    expect(!copy.playing, 'the copy went into the game and took the hero');
    expect(copy.row?.includes('正在另一个窗口里'), `the copy's title doesn't say the hero is played elsewhere: ${copy.row}`);
    expect(!(await page.evaluate(() => game.paused)), 'the first tab stopped when the copy only opened');
    await shot('copy-title', page2);

    step = 'taking the hero over';
    // gold picked up just now, before the first tab's autosave
    const gold = await page.evaluate(() => {
      game.player.gold += 1234;
      return game.player.gold;
    });
    await page2.click('.overlay.open .saves .btn.pick');
    await started(page2);
    await page2.waitForTimeout(500);
    expect((await page2.evaluate(() => game.player.gold)) === gold, `the copy has ${await page2.evaluate(() => game.player.gold)} gold, not ${gold}: the first tab's last moments were lost`);
    expect((await page2.evaluate(() => game.player.waypoints)).includes(3), 'the copy lost the waypoint');
    const first = await page.evaluate(() => ({ paused: game.paused, notice: !!document.querySelector('.hero-gone.open') }));
    expect(first.paused && first.notice, `the first tab plays on: ${JSON.stringify(first)}`);
    // the first tab writes nothing more: its gold changed now never reaches the save
    await page.evaluate(() => {
      game.player.gold = 1;
      game.save();
    });
    expect((await stored(page2)).gold === gold, 'the first tab still writes the hero');
    await shot('first-tab-stopped', page);
    facts.push('copy starts at the title; take-over hands over the latest progress; the old tab stops');

    step = 'back to the title';
    await Promise.all([page.waitForEvent('load'), page.click('.hero-gone .btn')]);
    await page.waitForSelector('.overlay.open .saves .btn.pick', { timeout: 60000 });
    expect(!(await page.evaluate(() => !!window.game?.started)), "the old tab's button went back into the game");

    step = 'storage refusing the write';
    const badge = await page2.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith('dii-save')) throw new DOMException('full', 'QuotaExceededError');
        return set.call(this, k, v);
      };
      game.save();
      const shown = !document.querySelector('.unsaved-badge')?.hidden;
      Storage.prototype.setItem = set;
      game.save();
      return { shown, gone: !!document.querySelector('.unsaved-badge')?.hidden };
    });
    expect(badge.shown && badge.gone, `the unsaved warning: ${JSON.stringify(badge)}`);
    facts.push('a refused write is shown until one goes in');

    step = 'a line cut off by quitting';
    // the Den of Evil's word in normal (src/game/quests/record.ts QFLAG) and the skill points, saved
    // for the hero named and as played if it's the one in the game; whether any of a townsperson's
    // dialogue is up, and what the messages on screen say (Hud.message)
    const STARTED = 2;
    const words = (pg, name) =>
      pg.evaluate((name) => {
        let saved = null;
        let savedPoints = null;
        for (let n = 0; n < 8; n++) {
          const d = JSON.parse(localStorage.getItem(n ? `dii-save-v1-${n}` : 'dii-save-v1') || 'null');
          if (d?.name !== name) continue;
          saved = d.progress?.[0]?.quests?.a1q1 ?? 0;
          savedPoints = d.skillPoints ?? null;
        }
        const g = window.game;
        const here = g.started && g.player.name === name;
        return {
          saved,
          savedPoints,
          played: here ? (g.player.quests[0].a1q1 ?? 0) : null,
          points: here ? g.player.skillPoints : null,
          state: here ? g.quests.script('a1q1').state : null,
          news: here ? g.quests.hasNews('akara') : null,
          dialogue: !!document.querySelector('.dialogue.open'),
          menu: !!document.querySelector('.npc-menu.open'),
          open: g.hooks.npc.isOpen,
          // the quest log's HUD button lit with news
          logNews: [...document.querySelectorAll('.hbtn.notify')].some((b) => b.textContent.startsWith('任')),
          messages: [...document.querySelectorAll('#messages > div')].map((e) => e.textContent),
        };
      }, name);
    const hero = await page2.evaluate(() => game.player.name);
    const was = await words(page2, hero);
    expect(was.played === 0 && was.news, `${hero} has had the Den of Evil already: ${JSON.stringify(was)}`);
    // spoken to, Akara gives the quest in a scrolling line; a moment in, the HUD's ≡ and 保存并返回标题
    await page2.evaluate(() => {
      const L = game.level;
      const a = L.objects.find((o) => o.npcId === 'akara');
      game.teleportWithin(L.map.nearestWalkable(a.pos.x + 1.6, a.pos.z + 1.6));
      game.interact(a);
    });
    await page2.waitForSelector('.dialogue.open');
    await page2.waitForTimeout(1500);
    const mid = await page2.evaluate(() => ({ talking: game.hooks.npc.talking, t: +game.hooks.npc.t.toFixed(2), dur: +game.hooks.npc.dur.toFixed(2), text: document.querySelector('.dialogue.open .dlg-text')?.textContent ?? '', messages: document.querySelectorAll('#messages > div').length }));
    expect(mid.talking && mid.t > 0 && mid.t < mid.dur && mid.text.includes('邪秽巢穴'), `not mid-line as the game is quit: ${JSON.stringify(mid)}`);
    await shot('akara-mid-line', page2);
    await page2.click('#hud .hbtn[title^="菜单"]');
    await page2.click('.overlay.open .btn.quit');
    await page2.waitForSelector('.overlay.open .saves .btn.pick');
    await page2.waitForTimeout(500);
    const quit = await words(page2, hero);
    expect(!quit.dialogue && !quit.menu && !quit.open, `her line is left under the title: ${JSON.stringify(quit)}`);
    expect(((quit.saved >> STARTED) & 1) === 1, `the line cut off by quitting isn't saved as heard for ${hero}: ${JSON.stringify(quit)}`);
    expect(!quit.messages.length, `${hero}'s messages left over the title: ${JSON.stringify(quit.messages)}`);
    await shot('title-after-quitting-mid-line', page2);
    // a hero made next: nothing of her line in their game, their quest untouched
    const next = '后来者';
    await page2.fill('.overlay.open .name', next);
    await page2.click('.overlay.open .btn.new');
    await started(page2);
    await page2.waitForTimeout(800);
    const made = await words(page2, next);
    expect(made.played === 0 && made.saved === 0 && made.state === 1 && made.news && !made.logNews, `${hero}'s line counted for ${next}: ${JSON.stringify(made)}`);
    expect(!made.dialogue && !made.menu && !made.open && !made.messages.length, `${hero}'s line or messages shown in ${next}'s game: ${JSON.stringify(made)}`);
    await shot('next-hero', page2);
    // the first hero continued: the quest given, by the line heard as the game was quit
    await page2.keyboard.press('Escape');
    await page2.click('.overlay.open .btn.quit');
    await page2.waitForSelector('.overlay.open .saves .btn.pick');
    await page2.locator('.overlay.open .saves .btn.pick').filter({ has: page2.locator('b', { hasText: new RegExp(`^${hero}$`) }) }).click();
    await started(page2);
    await page2.waitForTimeout(500);
    const back = await words(page2, hero);
    const logState = await page2.evaluate(() => game.quests.log('a1q1').state);
    expect(((back.played >> STARTED) & 1) === 1 && back.state === 2 && !back.news && logState === 'active' && !back.dialogue, `${hero} continued: ${JSON.stringify({ ...back, log: logState })}`);
    expect((await words(page2, next)).saved === 0, `${next}'s save has the quest`);
    facts.push(`a line cut off by quitting to the title counts for ${hero} (saved: the quest given), nothing for ${next}, no dialogue or message left behind (${mid.messages} up as the game was quit)`);

    step = 'a reward cut off by quitting';
    // the den taken as cleared (QFLAG.REWARDPENDING): spoken to, Akara hands over the reward in a
    // scrolling line; a moment in, ≡ and 保存并返回标题 again
    const points = await page2.evaluate(() => {
      const p = game.player;
      p.quests[0].a1q1 = (p.quests[0].a1q1 ?? 0) | (1 << 1);
      const L = game.level;
      const a = L.objects.find((o) => o.npcId === 'akara');
      game.teleportWithin(L.map.nearestWalkable(a.pos.x + 1.6, a.pos.z + 1.6));
      game.interact(a);
      return p.skillPoints;
    });
    await page2.waitForSelector('.dialogue.open');
    await page2.waitForTimeout(1500);
    const giving = await page2.evaluate(() => ({ talking: game.hooks.npc.talking, id: game.hooks.npc.topic?.id }));
    expect(giving.talking && giving.id === 'reward', `not mid-reward as the game is quit: ${JSON.stringify(giving)}`);
    await shot('akara-mid-reward', page2);
    await page2.click('#hud .hbtn[title^="菜单"]');
    await page2.click('.overlay.open .btn.quit');
    await page2.waitForSelector('.overlay.open .saves .btn.pick');
    await page2.waitForTimeout(500);
    const handed = await words(page2, hero);
    // REWARDGRANTED set, REWARDPENDING cleared: the skill point given once and saved
    expect((handed.saved & 3) === 1 && handed.savedPoints === points + 1, `the reward cut off by quitting isn't ${hero}'s, once, in the save: ${JSON.stringify(handed)} (${points} points before)`);
    expect(!handed.messages.length && !handed.dialogue, `${hero}'s reward left over the title: ${JSON.stringify(handed)}`);
    await shot('title-after-quitting-mid-reward', page2);
    // the next hero continued: their points and quest untouched, nothing of the reward on screen
    await page2.locator('.overlay.open .saves .btn.pick').filter({ has: page2.locator('b', { hasText: new RegExp(`^${next}$`) }) }).click();
    await started(page2);
    await page2.waitForTimeout(500);
    const after = await words(page2, next);
    expect(after.played === 0 && after.points === 0 && after.saved === 0 && after.savedPoints === 0 && !after.messages.length && !after.dialogue && !after.logNews, `${hero}'s reward in ${next}'s game: ${JSON.stringify(after)}`);
    await shot('next-hero-after-reward', page2);
    facts.push(`her reward cut off the same way is ${hero}'s (saved: +1 point, once), its word gone with them: none over the title, none in ${next}'s game`);

    step = 'a menu left open';
    // A (the copy, playing the hero made last) picks something up after its last save and opens the
    // menu at once, then stays there longer than save.ts's GONE_MS (10 s), as a window left beside
    // another would. B (the first tab, at the title) opens the title only then, and picks the hero
    const A = page2;
    const B = page;
    const heroA = await A.evaluate(() => game.player.name);
    /** the hero's save as storage has it: its key, when it was written, its gold, whether item `uid` is in it */
    const saveOf = (pg, uid = '') =>
      pg.evaluate(
        ({ name, uid }) => {
          for (let n = 0; n < 8; n++) {
            const key = n ? `dii-save-v1-${n}` : 'dii-save-v1';
            const raw = localStorage.getItem(key) ?? 'null';
            const d = JSON.parse(raw);
            if (d?.name === name) return { key, time: d.time, gold: d.gold, has: !!uid && raw.includes(`"${uid}"`) };
          }
          return null;
        },
        { name: heroA, uid },
      );
    // A watched from here on: whether its page ever stops being visible (a hidden page saves, which
    // would hide what this checks), and how many frames it runs
    await A.evaluate(async () => {
      const w = (window.__menuTest = {
        seen: [document.visibilityState],
        frames: 0,
        GroundItem: (await import('/src/game/objects.ts')).GroundItem,
        createItem: (await import('/src/items/gen.ts')).createItem,
      });
      document.addEventListener('visibilitychange', () => w.seen.push(document.visibilityState));
      setInterval(() => w.seen.push(document.visibilityState), 250);
      const tick = () => {
        w.frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // right after an autosave (every 8 s, Game.update), so none comes between the pickup and the menu;
    // nor does anything else that saves at once (a new area, a waypoint, a boss)
    const lastSave = await saveOf(A);
    await A.waitForFunction(({ key, time }) => JSON.parse(localStorage.getItem(key) ?? 'null')?.time !== time, lastSave, { timeout: 15000 });
    // an item and a pile of gold picked up, as clicking them would (Game.pickupGround), then Esc at once
    const picked = await A.evaluate((key) => {
      const w = window.__menuTest;
      const p = game.player;
      const it = w.createItem('cap');
      const gi = new w.GroundItem({ ...p.pos }, it, 0, p.pos);
      game.level.ground.push(gi);
      game.pickupGround(gi);
      const pile = new w.GroundItem({ ...p.pos }, null, 777, p.pos);
      game.level.ground.push(pile);
      game.pickupGround(pile);
      const raw = localStorage.getItem(key) ?? 'null';
      return { uid: it.uid, gold: p.gold, inBag: p.inventory.items.some((x) => x.item === it), saved: raw.includes(`"${it.uid}"`), savedGold: JSON.parse(raw)?.gold };
    }, lastSave.key);
    await A.keyboard.press('Escape');
    const menu = await A.evaluate(() => ({ paused: game.paused, open: game.hooks.menu.el.classList.contains('open'), at: Date.now() }));
    expect(picked.uid && picked.inBag && !picked.saved && picked.savedGold === picked.gold - 777, `A's pickup isn't new since its last save: ${JSON.stringify(picked)}`);
    expect(menu.paused && menu.open, `A's menu didn't open: ${JSON.stringify(menu)}`);
    const atMenu = await saveOf(A, picked.uid);
    expect(atMenu?.has && atMenu.gold === picked.gold, `opening the menu didn't save what A picked up: ${JSON.stringify(atMenu)}`);
    await shot('menu-left-open', A);
    await A.waitForTimeout(11000);
    // B's title, opened only now: the hero still played in A, whose menu has been up past GONE_MS
    await B.reload();
    await B.waitForSelector('.overlay.open .saves .btn.pick', { timeout: 60000 });
    const row = B.locator('.overlay.open .saves .btn.pick').filter({ has: B.locator('b', { hasText: new RegExp(`^${heroA}$`) }) });
    const listed = await row.locator('span').textContent();
    await shot('title-while-menu-open', B);
    // picked well past GONE_MS after A's menu opened: A's claim, unrefreshed since, would count as gone
    const pick = await B.evaluate((key) => ({ at: Date.now(), claim: JSON.parse(localStorage.getItem(`dii-tab:${key}`) ?? 'null') }), lastSave.key);
    const upFor = pick.at - menu.at;
    expect(upFor > 10000, `B picks the hero only ${upFor} ms after A's menu opened`);
    expect(listed?.includes('正在另一个窗口里'), `B's title doesn't say ${heroA} is played elsewhere, A's menu up ${upFor} ms: ${listed}`);
    expect(pick.claim?.time > menu.at, `A's claim on ${heroA} wasn't kept fresh while its menu was up: ${JSON.stringify(pick.claim)}, menu opened at ${menu.at}`);
    await row.click();
    await started(B);
    await B.waitForTimeout(500);
    const got = await B.evaluate((uid) => ({ gold: game.player.gold, item: game.player.inventory.items.some((x) => x.item.uid === uid) }), picked.uid);
    expect(got.item && got.gold === picked.gold, `B has ${JSON.stringify(got)}, not the item and ${picked.gold} gold A had: what A did before its menu was lost`);
    const gone = await A.evaluate(() => {
      const w = window.__menuTest;
      const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return { paused: game.paused, notice: !!document.querySelector('.hero-gone.open'), onTop: !!top?.closest('.hero-gone'), menu: game.hooks.menu.el.classList.contains('open'), seen: [...new Set(w.seen)], frames: w.frames };
    });
    expect(gone.seen.length === 1 && gone.seen[0] === 'visible', `A's page wasn't visible all along: ${gone.seen.join(', ')}`);
    expect(gone.frames > 100, `A ran only ${gone.frames} frames while its menu was up`);
    expect(gone.paused && gone.notice && gone.onTop, `A plays on, or its notice isn't over its menu: ${JSON.stringify(gone)}`);
    await shot('menu-tab-stopped', A);
    // Esc in A, as one would to shut the menu under the notice: the game there stays stopped and writes nothing
    await A.keyboard.press('Escape');
    await A.waitForTimeout(300);
    const still = await A.evaluate(() => {
      const paused = game.paused;
      game.player.gold = 1;
      game.save();
      return paused;
    });
    expect(still, 'A plays on once Esc shuts its menu under the notice');
    expect((await saveOf(B))?.gold !== 1, 'A still writes the hero');
    // B's own save keeps all of it
    await B.evaluate(() => game.save());
    const kept = await saveOf(B, picked.uid);
    expect(kept?.has && kept.gold === picked.gold, `B's save lost what A did: ${JSON.stringify(kept)}`);
    await shot('took-over-from-menu', B);
    facts.push(`a window left in its menu ${(upFor / 1000).toFixed(1)} s, visible, still holds ${heroA}: the other's title says so, and picking it there hands over the item and gold picked up just before the menu; that window stops behind its notice, over the menu`);

    // ── the hand-over's corners, the two tabs taking heroA from each other from here on ──
    const key = lastSave.key;
    /** the claim on heroA's save as storage has it (save.ts claimHero) */
    const claimOf = (pg) => pg.evaluate((key) => JSON.parse(localStorage.getItem(`dii-tab:${key}`) ?? 'null'), key);
    /** the tab playing heroA now, and the other */
    const roles = async () => {
      const plays = (pg) => pg.evaluate((name) => !!window.game?.started && !game.elsewhere && game.player.name === name, heroA);
      return (await plays(A)) ? [A, B] : [B, A];
    };
    /** a tab stopped behind its notice, back at its title by the notice's button: heroA listed, the models in */
    const backToTitle = async (pg) => {
      await Promise.all([pg.waitForEvent('load'), pg.click('.hero-gone.open .btn')]);
      await pg.waitForSelector('.overlay.open:not(.is-loading) .saves .btn.pick', { timeout: 60000 });
    };
    const rowOf = (pg) => pg.locator('.overlay.open .saves .btn.pick').filter({ has: pg.locator('b', { hasText: new RegExp(`^${heroA}$`) }) });
    /** the tab's next take-over from its title (Game.takeOver) recorded: window.__handed, true when it was handed the hero, false when its wait ran out */
    const watchTakeOver = (pg) =>
      pg.evaluate(() => {
        window.__handed = null;
        const take = game.takeOver.bind(game);
        game.takeOver = async (slot) => (window.__handed = await take(slot));
      });
    /** what the hand-over notice says, whether it is up, and whether the game there started and is paused */
    const noticeOf = (pg) =>
      pg.evaluate(() => ({
        open: !!document.querySelector('.hero-gone.open'),
        note: document.querySelector('.hero-gone .note')?.textContent ?? '',
        started: !!window.game?.started,
        paused: !!window.game?.paused,
      }));
    /**
     * how far the brightness ranges (0–255) over where the pause menu's 继续游戏 lies under the notice:
     * the menu showing through it (-1: no menu open)
     */
    const showThrough = async (pg) => {
      const r = await pg.evaluate(() => {
        const b = document.querySelector('.overlay.open .btn.resume')?.getBoundingClientRect();
        return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
      });
      if (!r) return -1;
      const png = await pg.screenshot({ clip: r });
      return pg.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let lo = 255;
        let hi = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          lo = Math.min(lo, l);
          hi = Math.max(hi, l);
        }
        return Math.round(hi - lo);
      }, png.toString('base64'));
    };
    /** the tab's model downloads held back until `release` (routing also keeps them out of the HTTP cache) */
    const holdModels = async (pg) => {
      let release;
      const gate = new Promise((r) => (release = r));
      await pg.route('**/models/**', async (route) => {
        await gate;
        // one the page gave up on meanwhile (assets.ts STALL_MS) has nowhere to go
        await route.continue().catch(() => {});
      });
      return release;
    };

    step = 'a save before the take-over event';
    // X plays heroA; Y, at its title, opens it. X's storage event for the claim is held back, as when its
    // menu's save (or the autosave) comes before the event: X still writes a last time and hands over,
    // so Y doesn't wait out its 3 s and has what X picked up since its last save. (Held back where the
    // page's listener hands it to the game, Game.heroClaimed: Chromium runs a window's listeners in the
    // order they were added, capturing or not, so one added now can't stop the page's own.)
    {
      const [X, Y] = await roles();
      await backToTitle(Y);
      const was = await claimOf(X);
      await X.evaluate(() => {
        window.__held = 0;
        window.__holding = true;
        const claimed = game.heroClaimed.bind(game);
        game.heroClaimed = () => {
          // from the storage event's dispatch; a save handing over calls it from anywhere else
          if (window.__holding && window.event?.type === 'storage') window.__held++;
          else claimed();
        };
      });
      // right after an autosave, gold picked up: only a last write from X brings it over
      const saved = await saveOf(X);
      await X.waitForFunction(({ key, time }) => JSON.parse(localStorage.getItem(key) ?? 'null')?.time !== time, saved, { timeout: 15000 });
      const gold = await X.evaluate(() => (game.player.gold += 4321));
      await watchTakeOver(Y);
      await rowOf(Y).click();
      // Y's claim is in X's storage, its event held back; X opens its menu, which saves, before the event comes
      await X.waitForFunction(({ key, tab }) => JSON.parse(localStorage.getItem(`dii-tab:${key}`) ?? 'null')?.tab !== tab, { key, tab: was?.tab });
      await X.keyboard.press('Escape');
      await started(Y);
      await Y.waitForTimeout(300);
      const y = await Y.evaluate(() => ({ handed: window.__handed, gold: game.player.gold }));
      const x = { ...(await noticeOf(X)), held: await X.evaluate(() => window.__held) };
      expect(y.handed === true, `Y waited out its 3 s: X didn't hand heroA over (handed: ${y.handed})`);
      expect(y.gold === gold, `Y has ${y.gold} gold, not the ${gold} X had: X's last moments were lost`);
      expect(x.held > 0 && x.open && x.paused, `X, its save before the event: ${JSON.stringify(x)}`);
      expect(x.note.includes('已经保存'), `X's notice: ${x.note}`);
      // the notice over X's open menu, which doesn't show through it
      const through = await showThrough(X);
      expect(through >= 0 && through < 12, `X's pause menu shows through its notice (brightness over 继续游戏 ranges ${through} levels)`);
      await shot('saved-before-the-event', X);
      // the event, come late, changes nothing more there
      const late = await X.evaluate(() => {
        window.__holding = false;
        game.heroClaimed();
        return { note: document.querySelector('.hero-gone .note')?.textContent ?? '', paused: game.paused };
      });
      expect(late.paused && late.note === x.note, `X after the late event: ${JSON.stringify(late)}`);
      facts.push(`a save before the take-over event still writes last and hands over (Y handed ${y.gold} gold at once); the notice hides the menu (${through} levels show through)`);
    }

    step = 'a last write refused';
    // storage refuses heroA's save in the tab playing it as the other opens it: that tab's notice says its
    // last progress wasn't saved (the unsaved badge over it), and the other plays on from the last save that went in
    {
      const [X, Y] = await roles();
      await backToTitle(Y);
      const kept = await saveOf(X);
      await X.evaluate(() => {
        game.player.gold += 555;
        const set = Storage.prototype.setItem;
        window.__setItem = set;
        Storage.prototype.setItem = function (k, v) {
          if (String(k).startsWith('dii-save')) throw new DOMException('full', 'QuotaExceededError');
          return set.call(this, k, v);
        };
      });
      await watchTakeOver(Y);
      await rowOf(Y).click();
      await started(Y);
      await Y.waitForTimeout(300);
      const x = await X.evaluate(() => {
        const notice = document.querySelector('.hero-gone');
        const badge = document.querySelector('.unsaved-badge');
        return { open: notice.classList.contains('open'), note: notice.querySelector('.note').textContent, badge: !badge.hidden, over: Number(getComputedStyle(badge).zIndex) > Number(getComputedStyle(notice).zIndex) };
      });
      const y = await Y.evaluate(() => ({ handed: window.__handed, gold: game.player.gold }));
      expect(x.open && x.badge && x.over, `X's notice and unsaved badge: ${JSON.stringify(x)}`);
      expect(x.note.includes('没能保存') && !x.note.includes('已经保存'), `X's notice says its progress was saved, its last write refused: ${x.note}`);
      expect(y.handed === true && y.gold === kept.gold, `Y: ${JSON.stringify(y)}, the last save that went in has ${kept.gold} gold`);
      await shot('last-write-refused', X);
      await X.evaluate(() => (Storage.prototype.setItem = window.__setItem));
      facts.push('a last write refused: the notice says so, under the unsaved badge, and the other plays on from the last save that went in');
    }

    step = 'a reload still loading';
    // R, playing heroA, is reloaded while its models are slow to come (held back here). Its claim is kept
    // fresh meanwhile: O's title, opened past GONE_MS, says heroA is in another window; O opens it, and R
    // hands it over at once, says so and never starts, its models in or not. O plays on
    {
      const [R, O] = await roles();
      const release = await holdModels(R);
      await R.reload();
      const claimed = await claimOf(R);
      await R.waitForTimeout(Math.max(0, (claimed?.time ?? 0) + 10500 - (await R.evaluate(() => Date.now()))));
      // O's title, built only now
      await backToTitle(O);
      const row = rowOf(O);
      const listed = await row.locator('span').textContent();
      const claim = await claimOf(O);
      const now = await O.evaluate(() => Date.now());
      expect(listed?.includes('正在另一个窗口里'), `O's title doesn't say ${heroA} is in another window while R loads it: ${listed}`);
      expect(claim?.time > claimed?.time && now - claim.time < 10000, `R's claim wasn't kept fresh as it loaded: ${JSON.stringify(claim)}, claimed ${JSON.stringify(claimed)}, now ${now}`);
      await watchTakeOver(O);
      await row.click();
      await started(O);
      const handed = await O.evaluate(() => window.__handed);
      const r1 = { ...(await noticeOf(R)), loading: await R.evaluate(() => !!document.querySelector('.overlay.is-loading')) };
      expect(handed === true, `O waited out its 3 s: R, still loading, didn't hand ${heroA} over (handed: ${handed})`);
      expect(r1.loading && r1.open && !r1.started && r1.note.includes('刷新'), `R, still loading as O opened ${heroA}: ${JSON.stringify(r1)}`);
      await shot('reload-handed-over', R);
      // R's models in: it doesn't start, and O plays on
      release();
      await R.waitForFunction(() => !document.querySelector('.overlay.is-loading'), null, { timeout: 60000 });
      await R.waitForTimeout(2000);
      await R.unrouteAll({ behavior: 'ignoreErrors' });
      const r2 = await noticeOf(R);
      const o2 = { ...(await noticeOf(O)), name: await O.evaluate(() => game.player.name) };
      expect(r2.open && !r2.started, `R started once its models came in: ${JSON.stringify(r2)}`);
      expect(o2.started && !o2.paused && !o2.open && o2.name === heroA, `O stopped, or isn't playing ${heroA}: ${JSON.stringify(o2)}`);
      await shot('reload-never-started', R);
      facts.push(`a reload still loading keeps its claim fresh (${Math.round((now - claimed.time) / 1000)} s in) and hands ${heroA} over to the window that opens it, never starting`);
    }

    step = "a reload finding another window's claim";
    // R, playing heroA, is reloaded; as its models come another window's claim on heroA gets into storage
    // unheard of there (written from R's own page, which has no storage event for it). Its models in, R
    // waits for that window to hand heroA over, as a title's pick does, and reads the save only then:
    // what that window wrote last is in R's game
    {
      const [R, O] = await roles();
      const release = await holdModels(R);
      await R.reload();
      const mine = (await claimOf(R))?.tab;
      await R.evaluate((key) => localStorage.setItem(`dii-tab:${key}`, JSON.stringify({ tab: 'tab-elsewhere', time: Date.now() })), key);
      release();
      // that window, played from O's page: R claims heroA back to wait for it; its last write, then the hand-over
      await O.waitForFunction(({ key, mine }) => JSON.parse(localStorage.getItem(`dii-tab:${key}`) ?? 'null')?.tab === mine, { key, mine }, { timeout: 60000, polling: 20 });
      const waiting = await R.evaluate(() => ({ started: !!window.game?.started, text: document.querySelector('.overlay.open .menu .loading')?.textContent ?? '' }));
      await shot('reload-waiting-for-hand-over', R);
      const last = await O.evaluate(
        ({ key, mine }) => {
          const d = JSON.parse(localStorage.getItem(key));
          d.gold += 999;
          localStorage.setItem(key, JSON.stringify(d));
          const c = JSON.parse(localStorage.getItem(`dii-tab:${key}`));
          localStorage.setItem(`dii-tab:${key}`, JSON.stringify({ ...c, handedTo: mine }));
          return d.gold;
        },
        { key, mine },
      );
      await started(R);
      await R.unrouteAll({ behavior: 'ignoreErrors' });
      await R.waitForTimeout(300);
      const got = await R.evaluate(() => game.player.gold);
      expect(!waiting.started && waiting.text.includes('接过'), `R didn't wait for the other window to hand ${heroA} over: ${JSON.stringify(waiting)}`);
      expect(got === last, `R has ${got} gold, not the ${last} the other window wrote last before handing ${heroA} over`);
      await shot('reload-waited-for-hand-over', R);
      facts.push(`a reload finding another window's claim as it starts waits for its hand-over and reads what it wrote last (${got} gold)`);
    }
  } catch (e) {
    fails.push(`${step}: ${e.message}`);
  }
  for (const e of errors) fails.push(e);
  log(fails.length ? `PERSIST FAIL ${fails.join(' | ')}` : `PERSIST OK: ${facts.join('; ')}`);
}
