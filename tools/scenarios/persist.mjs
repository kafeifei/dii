// What a player does with saves, through the real title (no ?dev), each step checked against storage
// (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/persist.mjs --url "http://localhost:5174/"
// Clears this browser's storage first (play.mjs runs its own profile). A new paladin touches Cold
// Plains' waypoint: a reload plays on with it, and so does the title's "continue" after saving and
// quitting. A copy of the tab (opened from it, carrying its sessionStorage, as a duplicated tab
// does) starts at the title, not in the game, and lists the hero as played in another window. Gold
// picked up in the first tab and not yet autosaved is then in the copy once it takes the hero over:
// the first tab saves it, hands it over and stops behind its notice, writing nothing more. Back in
// the first tab, its notice's button leads to the title. Last, storage that refuses the write: the
// game says so and keeps saying it until a write goes in. Page errors fail the run.
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
  } catch (e) {
    fails.push(`${step}: ${e.message}`);
  }
  for (const e of errors) fails.push(e);
  log(fails.length ? `PERSIST FAIL ${fails.join(' | ')}` : `PERSIST OK: ${facts.join('; ')}`);
}
