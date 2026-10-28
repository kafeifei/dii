// The Den of Evil from Akara's first word to her reward, as Diablo II plays it (src/game/quests,
// D2MOO A1Q1.cpp), through the real UI (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/quests.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage. In the camp the merchant (亚珈萝, Akara's counterpart) has the yellow
// mark of quest news; spoken to, she gives the quest in a scrolling line (cut short with 跳过), then
// her menu: 交谈 has her remind the hero (spoken to again mid-line, or Esc, cuts it short), 取消
// leaves her and the log says to find the den. Out of the camp (the record's LEAVETOWN), into the
// den (ENTERAREA, the log's "clear it"), its monsters killed through the game until five or fewer
// are left (the log counts them; kills out on the moor say nothing of it), then all: the quest is done
// (its message, the record's reward pending) and the den lights up. Back in the camp she is marked
// again; spoken to, she hands over the reward (+1 skill point) once and never again. The quest log
// shows it done; saved and played again it stays done, and nightmare's record is untouched. Page
// and console errors fail the run. Shots: the mark, the dialogue, the menu, the log, the log
// counting, the den dark and lit, the mark for the reward, the reward line, the log done, the
// nightmare log. The last line is "QUESTS OK …" or "QUESTS FAIL …".

/** src/world/areas.ts */
const CAMP_AREA = 1;
const DEN_OF_EVIL = 8;
/** src/game/quests/record.ts QFLAG */
const F = { REWARDGRANTED: 0, REWARDPENDING: 1, STARTED: 2, LEAVETOWN: 3, ENTERAREA: 4, UPDATEQUESTLOG: 12, PRIMARYGOALDONE: 13 };

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

  /** the page's helpers (after a load) */
  const helpers = () =>
    ev(async (flags) => {
      const S = (window.__q = { F: flags });
      S.debug = (await import('/src/game/debug.ts')).debugOpts;
      S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      /** the Den of Evil's word in difficulty d (the one played) */
      S.word = (d = game.player.difficulty) => game.player.quests[d].a1q1 ?? 0;
      S.has = (f, d) => ((S.word(d) >> f) & 1) === 1;
      S.den = () => game.quests.script('a1q1');
      S.akara = () => game.level.objects.find((o) => o.npcId === 'akara');
      /** the hero stood beside Akara, toward the camera, so her mark and her menu are in view */
      S.toAkara = () => {
        const a = S.akara();
        game.teleportWithin(game.level.map.nearestWalkable(a.pos.x + 1.6, a.pos.z + 1.6));
        return a;
      };
      /** a walkable spot in area `id` about `far` tiles from where its seam with `from` opens, toward `to` */
      S.spotIn = (id, from, to, far) => {
        const L = game.level;
        const seam = (a, b) => L.layout.seams.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        const s1 = seam(from, id);
        const s2 = seam(id, to);
        const p1 = s1.a === id ? s1.ta : s1.tb;
        const p2 = s2.a === id ? s2.ta : s2.tb;
        const t = Math.min(0.9, far / S.dist(p1, p2));
        return L.map.nearestWalkable(p1.x + (p2.x - p1.x) * t, p1.z + (p2.z - p1.z) * t);
      };
      S.alive = () => game.level.monsters.filter((m) => !m.dead);
      S.ui = () => ({ talking: !!document.querySelector('.dialogue.open'), menu: !!document.querySelector('.npc-menu.open'), text: document.querySelector('.dialogue.open .dlg-text')?.textContent ?? '', opts: [...document.querySelectorAll('.npc-menu.open .npc-opt')].map((e) => e.textContent) });
      S.messages = () => [...document.querySelectorAll('#messages div')].map((e) => e.textContent).join(' | ');
      /** every message put up since, as the HUD's own list drops them as they fade */
      S.said = [];
      const message = game.hooks.message.bind(game.hooks);
      game.hooks.message = (t, c, d) => {
        S.said.push(t);
        message(t, c, d);
      };
      /** the quest log's HUD button lit with news */
      S.logNews = () => [...document.querySelectorAll('.hbtn.notify')].some((b) => b.textContent.startsWith('任'));
      S.debug.god = true;
    }, F);
  /** the quest log opened with its key, its cells' states and the detail's words */
  const openLog = async () => {
    await page.keyboard.press('l');
    // read as first drawn: a quest done since the log was last open flares in that drawing only
    await until(() => !!document.querySelector('.panel.left.open .qgrid'), null, 'the quest log');
    const l = await ev(() => ({
      cells: [...document.querySelectorAll('.panel.left.open .qcell')].map((c) => `${c.dataset.quest}:${[...c.classList].filter((k) => k !== 'qcell').join('.')}`),
      state: document.querySelector('.panel.left.open .qstate')?.textContent,
      text: document.querySelector('.panel.left.open .qtext')?.textContent,
    }));
    await frames(3);
    return l;
  };
  const closeLog = async () => {
    await page.keyboard.press('l');
    await until(() => !document.querySelector('.panel.left.open'), null, 'the quest log to close');
  };
  const pick = (label) => page.locator('.npc-menu.open .npc-opt', { hasText: label }).click();

  const steps = {
    async load() {
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      await helpers();
      const s = await ev(() => {
        const S = window.__q;
        S.west = game.level;
        const a = S.akara();
        return { name: a?.name, npc: a?.npc, news: game.quests.hasNews('akara'), word: S.word(), log: game.quests.log('a1q1').state, area: game.area?.id };
      });
      expect(s.area === CAMP_AREA, `started in area ${s.area}`);
      expect(s.npc === '亚珈萝' && s.name === '商人 · 亚珈萝', `the merchant is ${s.npc} (${s.name})`);
      expect(s.news && s.word === 0 && s.log === 'none', `a new hero: news ${s.news}, word ${s.word}, log ${s.log}`);
    },

    async mark() {
      await ev(() => window.__q.toAkara());
      await frames(12);
      const m = await ev(() => {
        const el = document.querySelector('.npc-mark');
        const r = el?.getBoundingClientRect();
        const a = window.__q.akara();
        const s = window.renderer.projectP(a.pos, 1);
        return r ? { x: r.left, y: r.top, ax: s.x, ay: s.y, w: innerWidth, h: innerHeight } : null;
      });
      expect(m && m.x > 0 && m.x < m.w && m.y > 0 && m.y < m.ay && Math.abs(m.x - m.ax) < 30, `the mark over Akara: ${JSON.stringify(m)}`);
      await shot('akara-marked');
    },

    async talk() {
      // spoken to: she gives the quest at once, scrolling up
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her line');
      await page.waitForTimeout(2500);
      const said = await ev(() => window.__q.ui());
      expect(said.talking && !said.menu && said.text.includes('邪秽巢穴') && said.text.includes('血沼荒原'), `her first words: ${JSON.stringify(said)}`);
      expect(!said.text.includes('艾莉娜') && !said.text.includes('阿卡拉'), 'an old or official name in her line');
      await shot('akara-gives-the-quest');
      const pos = await ev(() => document.querySelector('.dlg-text').style.transform);
      expect(/translateY\(-?\d+px\)/.test(pos), `the line doesn't scroll (${pos})`);
      await page.locator('.dialogue .dlg-skip').click();
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after the line');
      const after = await ev(() => {
        const S = window.__q;
        return { ui: S.ui(), started: S.has(S.F.STARTED), state: S.den().state, news: game.quests.hasNews('akara'), mark: !!document.querySelector('.npc-mark') };
      });
      expect(after.started && after.state === 2, `cut short, the quest isn't given: started ${after.started}, state ${after.state}`);
      expect(!after.news && !after.mark, `her mark stays: news ${after.news}, mark ${after.mark}`);
      expect(after.ui.opts.join('/') === '交谈/交易／修理/取消', `her menu: ${after.ui.opts.join('/')}`);
      await frames(4);
      await shot('akara-menu');
      // 交谈: she reminds the hero; spoken to again mid-line, the line is cut short and her menu is back
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reminder');
      const remind = await ev(() => window.__q.ui().text);
      expect(remind.includes('营门'), `her reminder: ${remind}`);
      await page.waitForTimeout(600);
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu, spoken to mid-line');
      const recut = await ev(() => ({ ui: window.__q.ui(), at: document.querySelector('.npc-menu.open').style.transform }));
      expect(!recut.ui.talking && recut.ui.opts.length === 3 && /translate\(\d+px, \d+px\)/.test(recut.at), `spoken to mid-line: ${JSON.stringify(recut)}`);
      // again, and Esc cuts it short
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reminder again');
      await page.keyboard.press('Escape');
      await until(() => !!document.querySelector('.npc-menu.open') && !document.querySelector('.dialogue.open'), null, 'her menu after Esc');
      // 取消: she's left, and the log says to find the den
      await pick('取消');
      await until(() => !document.querySelector('.npc-menu.open'), null, 'her menu to close');
      const left = await ev(() => window.__q.den().last);
      expect(left === 1, `the log's status after leaving her: ${left}`);
    },

    async questLog() {
      const l = await openLog();
      expect(l.cells.length === 6, `the log shows ${l.cells.length} quests`);
      expect(l.cells[0] === 'a1q1:active.on' && l.cells.slice(1).every((c) => /:off$/.test(c)), `the log's quests: ${l.cells.join(' ')}`);
      expect(l.state === '进行中' && l.text.includes('邪秽巢穴') && l.text.includes('亚珈萝'), `the log says ${l.state}: ${l.text}`);
      await shot('quest-log');
      await closeLog();
    },

    async out() {
      const spot = await ev(() => window.__q.spotIn(2, 1, 3, 16));
      await ev((at) => game.teleportWithin(at), spot);
      await frames(4);
      const r = await ev(() => ({ area: game.area?.id, leave: window.__q.has(window.__q.F.LEAVETOWN), state: window.__q.den().state }));
      expect(r.area === 2 && r.leave && r.state === 3, `out on the moor: area ${r.area}, LEAVETOWN ${r.leave}, state ${r.state}`);
    },

    async den() {
      const into = await ev((id) => {
        const S = window.__q;
        const ok = game.enterArea(id, 'stairs');
        const p = game.player;
        game.teleportWithin(game.level.map.nearestWalkable(p.pos.x + 3, p.pos.z + 3) ?? p.pos);
        return { ok, area: game.area?.id, enter: S.has(S.F.ENTERAREA), last: S.den().last, alive: S.alive().length, hemi: window.renderer.hemi.intensity };
      }, DEN_OF_EVIL);
      expect(into.ok && into.area === DEN_OF_EVIL, `into the den: ${JSON.stringify(into)}`);
      expect(into.enter && into.last === 2, `in the den: ENTERAREA ${into.enter}, the log's status ${into.last}`);
      expect(into.alive > 6, `only ${into.alive} monsters in the den`);
      await frames(20);
      await shot('den-dark');
      // all but three, through the game (God mode keeps the hero up)
      const few = await ev(() => {
        const S = window.__q;
        for (const m of S.alive().slice(3)) game.killMonster(m, 'phys');
        return { left: S.alive().length, remaining: S.den().remaining, last: S.den().last, msgs: S.messages() };
      });
      expect(few.left === 3 && few.remaining === 3 && few.last === 4, `three left: ${JSON.stringify(few)}`);
      expect(few.msgs.includes('还剩 3 只'), `the count isn't told: ${few.msgs}`);
      const l = await openLog();
      expect(l.text.includes('还剩 3 只'), `the log with three left: ${l.text}`);
      await shot('quest-log-counting');
      await closeLog();
      // three left, kills out on the moor: the den's count isn't said again and the log has no news
      const moor = await ev(async () => {
        const S = window.__q;
        game.enterArea(2, 'stairs');
        const said = S.said.length;
        const kill = S.alive().slice(0, 4);
        for (const m of kill) game.killMonster(m, 'phys');
        await new Promise((r) => setTimeout(r, 300));
        const out = { area: game.area?.id, killed: kill.length, said: S.said.slice(said).filter((t) => t.includes('还剩')), news: S.logNews(), last: S.den().last, remaining: S.den().remaining };
        game.enterArea(8, 'stairs');
        return out;
      });
      expect(moor.area === 2 && moor.killed === 4 && !moor.said.length && !moor.news && moor.last === 4 && moor.remaining === 3, `kills on the moor: ${JSON.stringify(moor)}`);
      // the last three: done
      const done = await ev(() => {
        const S = window.__q;
        for (const m of S.alive()) game.killMonster(m, 'phys');
        return { pending: S.has(S.F.REWARDPENDING), goal: S.has(S.F.PRIMARYGOALDONE), granted: S.has(S.F.REWARDGRANTED), lit: game.isLit(game.level), msgs: S.messages(), log: game.quests.log('a1q1') };
      });
      expect(done.pending && done.goal && !done.granted, `cleared: pending ${done.pending}, goal ${done.goal}, granted ${done.granted}`);
      expect(done.lit, 'the den is not lit');
      expect(done.msgs.includes('邪秽巢穴里的邪物已被肃清') && done.msgs.includes('亚珈萝'), `the messages: ${done.msgs}`);
      expect(done.log.state === 'reward', `the log: ${JSON.stringify(done.log)}`);
      await page.waitForTimeout(3500);
      const hemi = await ev(() => window.renderer.hemi.intensity);
      expect(hemi > into.hemi * 2, `the den's light went from ${into.hemi.toFixed(2)} to ${hemi.toFixed(2)}`);
      await shot('den-lit');
      // the log's status turns to "go back" a few quest ticks later (ACT1Q1_Timer_StatusCycler)
      await until(() => window.__q.den().last === 5, null, 'the log to say to go back', 12000);
      facts.push(`den: ${into.alive} monsters, light ${into.hemi.toFixed(2)} → ${hemi.toFixed(2)}`);
    },

    async reward() {
      await ev(() => {
        game.enterArea(1, 'waypoint');
        window.__q.toAkara();
      });
      await frames(12);
      const before = await ev(() => ({ points: game.player.skillPoints, news: game.quests.hasNews('akara'), mark: !!document.querySelector('.npc-mark'), west: game.level === window.__q.west }));
      expect(before.west && before.news && before.mark, `back in the camp: ${JSON.stringify(before)}`);
      await shot('akara-marked-for-the-reward');
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reward line');
      await page.waitForTimeout(1800);
      const said = await ev(() => window.__q.ui().text);
      expect(said.includes('门'), `her reward line: ${said}`);
      await shot('akara-rewards');
      await page.locator('.dialogue .dlg-skip').click();
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after the reward');
      const after = await ev(() => {
        const S = window.__q;
        return { points: game.player.skillPoints, granted: S.has(S.F.REWARDGRANTED), pending: S.has(S.F.REWARDPENDING), started: S.has(S.F.STARTED), news: game.quests.hasNews('akara'), msgs: S.messages() };
      });
      expect(after.points === before.points + 1, `skill points ${before.points} → ${after.points}`);
      expect(after.granted && !after.pending && !after.started && !after.news, `after the reward: ${JSON.stringify(after)}`);
      expect(after.msgs.includes('技能点 +1'), `the messages: ${after.msgs}`);
      // again: nothing more to hand over; 交谈 is small talk
      await pick('取消');
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu, spoken to again');
      const again = await ev(() => window.__q.ui());
      expect(!again.talking, `she speaks at once again: ${again.text}`);
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her small talk');
      const gossip = await ev(() => window.__q.ui().text);
      await page.keyboard.press('Escape');
      await pick('取消');
      const end = await ev(() => game.player.skillPoints);
      expect(end === after.points, `skill points ${after.points} → ${end} speaking to her again`);
      expect(!gossip.includes('腐味'), `her small talk is the reward again: ${gossip}`);
      const l = await openLog();
      expect(l.cells[0].startsWith('a1q1:done') && l.cells[0].includes('fresh') && l.state === '已完成', `the log: ${l.cells[0]} ${l.state} ${l.text}`);
      await page.waitForTimeout(600);
      await shot('quest-log-done');
      await closeLog();
      const seen = await ev(() => window.__q.has(window.__q.F.UPDATEQUESTLOG));
      expect(seen, 'the log did not mark it seen (UPDATEQUESTLOG)');
      facts.push(`reward: +1 skill point (${before.points} → ${after.points}), once`);
    },

    async saveAndContinue() {
      const r = await ev(() => {
        const S = window.__q;
        game.save();
        const d = JSON.parse(localStorage.getItem('dii-save-dev'));
        const points = game.player.skillPoints;
        const ok = game.continueGame();
        S.west = game.level;
        return {
          ok,
          saved: d.progress.map((x) => x.quests.a1q1 ?? 0),
          points: [points, game.player.skillPoints],
          granted: S.has(S.F.REWARDGRANTED),
          playable: S.den().playable,
          news: game.quests.hasNews('akara'),
          log: game.quests.log('a1q1').state,
          nightmare: JSON.stringify(game.player.quests[1]),
        };
      });
      expect(r.ok, 'the save would not load');
      expect((r.saved[0] & 1) === 1 && r.saved[1] === 0 && r.saved[2] === 0, `the save's words ${r.saved.join(', ')}`);
      expect(r.points[0] === r.points[1] && r.granted && !r.playable && !r.news && r.log === 'done', `played again: ${JSON.stringify(r)}`);
      expect(r.nightmare === '{}', `nightmare's record: ${r.nightmare}`);
    },

    async nightmare() {
      const r = await ev(() => {
        const S = window.__q;
        game.setDifficulty(1);
        const out = { word: S.word(1), log: game.quests.log('a1q1').state, news: game.quests.hasNews('akara'), normal: S.word(0), playable: S.den().playable };
        return out;
      });
      expect(r.word === 0 && r.log === 'none' && r.news && r.playable, `nightmare: ${JSON.stringify(r)}`);
      expect((r.normal & 1) === 1, `normal's word in nightmare: ${r.normal}`);
      const l = await openLog();
      expect(l.cells[0].startsWith('a1q1:none'), `nightmare's log: ${l.cells[0]}`);
      await shot('quest-log-nightmare');
      await closeLog();
      await ev(() => game.setDifficulty(0));
      facts.push('nightmare untouched');
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
  log(fails.length ? `QUESTS FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `QUESTS OK (${secs} s): ${facts.join('; ')}`);
}
