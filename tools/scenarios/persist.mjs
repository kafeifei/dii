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
// under the title, nor in the game of a hero made next, whose quest is untouched and whose quest log
// has no news; the first hero continued has the quest given. Page errors fail the run.
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
    // the Den of Evil's word in normal (src/game/quests/record.ts QFLAG), saved for the hero named and
    // as played if it's the one in the game, and whether any of a townsperson's dialogue is up
    const STARTED = 2;
    const words = (pg, name) =>
      pg.evaluate((name) => {
        let saved = null;
        for (let n = 0; n < 8; n++) {
          const d = JSON.parse(localStorage.getItem(n ? `dii-save-v1-${n}` : 'dii-save-v1') || 'null');
          if (d?.name === name) saved = d.progress?.[0]?.quests?.a1q1 ?? 0;
        }
        const g = window.game;
        const here = g.started && g.player.name === name;
        return {
          saved,
          played: here ? (g.player.quests[0].a1q1 ?? 0) : null,
          state: here ? g.quests.script('a1q1').state : null,
          news: here ? g.quests.hasNews('akara') : null,
          dialogue: !!document.querySelector('.dialogue.open'),
          menu: !!document.querySelector('.npc-menu.open'),
          open: g.hooks.npc.isOpen,
          // the quest log's HUD button lit with news
          logNews: [...document.querySelectorAll('.hbtn.notify')].some((b) => b.textContent.startsWith('任')),
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
    const mid = await page2.evaluate(() => ({ talking: game.hooks.npc.talking, t: +game.hooks.npc.t.toFixed(2), dur: +game.hooks.npc.dur.toFixed(2), text: document.querySelector('.dialogue.open .dlg-text')?.textContent ?? '' }));
    expect(mid.talking && mid.t > 0 && mid.t < mid.dur && mid.text.includes('邪秽巢穴'), `not mid-line as the game is quit: ${JSON.stringify(mid)}`);
    await shot('akara-mid-line', page2);
    await page2.click('#hud .hbtn[title^="菜单"]');
    await page2.click('.overlay.open .btn.quit');
    await page2.waitForSelector('.overlay.open .saves .btn.pick');
    await page2.waitForTimeout(500);
    const quit = await words(page2, hero);
    expect(!quit.dialogue && !quit.menu && !quit.open, `her line is left under the title: ${JSON.stringify(quit)}`);
    expect(((quit.saved >> STARTED) & 1) === 1, `the line cut off by quitting isn't saved as heard for ${hero}: ${JSON.stringify(quit)}`);
    await shot('title-after-quitting-mid-line', page2);
    // a hero made next: nothing of her line in their game, their quest untouched
    const next = '后来者';
    await page2.fill('.overlay.open .name', next);
    await page2.click('.overlay.open .btn.new');
    await started(page2);
    await page2.waitForTimeout(800);
    const made = await words(page2, next);
    expect(made.played === 0 && made.saved === 0 && made.state === 1 && made.news && !made.logNews, `${hero}'s line counted for ${next}: ${JSON.stringify(made)}`);
    expect(!made.dialogue && !made.menu && !made.open, `${hero}'s line shown in ${next}'s game: ${JSON.stringify(made)}`);
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
    facts.push(`a line cut off by quitting to the title counts for ${hero} (saved: the quest given), nothing for ${next}, no dialogue left behind`);
  } catch (e) {
    fails.push(`${step}: ${e.message}`);
  }
  for (const e of errors) fails.push(e);
  log(fails.length ? `PERSIST FAIL ${fails.join(' | ')}` : `PERSIST OK: ${facts.join('; ')}`);
}
