// One hero in one tab, the hand-over's corners (src/game/game.ts, src/game/save.ts; the browser's side is
// tools/scenarios/persist.mjs). A save that finds another tab's claim before that claim's storage event
// hands the hero over just as the event would: a last write if nothing was written over the hero since,
// the hand-over, the game stopped, once. The tab giving the hero up is told whether its play is in what
// the other tab reads (GameHooks.heroGone): saved when its last write went in, or the other tab wrote
// first with nothing played here since; unsaved when storage refused the last write, the other tab wrote
// first over play here, or the save is a newer build's. A reload still loading its hero keeps the claim
// fresh, gives the hero up at once to a tab that opens it meanwhile and never starts; finding another
// tab's fresh claim as it starts, it waits for that tab to hand the hero over and reads what it wrote
// last, unless yet another tab opens the hero meanwhile. The other tabs are claims written into storage
// as their claimHero would write them: this run is one page, with one tab id.
const KEY = 'dii-save-v1';
const CLAIM = `dii-tab:${KEY}`;

export default async (load) => {
  const save = await load('/src/game/save.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const problems = [];
  const facts = [];
  const check = (ok, what) => ok || problems.push(what);
  const heroSave = () => JSON.parse(localStorage.getItem(KEY));
  const claim = () => JSON.parse(localStorage.getItem(CLAIM) ?? 'null');
  /** another tab opens the hero: its claim, as its claimHero writes it */
  const claimElsewhere = (tab = 'tab-other') => localStorage.setItem(CLAIM, JSON.stringify({ tab, time: Date.now() }));
  /** a game as the page makes one, its hooks a stand-in for the UI's: what it said, what its hand-over notice said, the unsaved badge */
  const makeGame = () => {
    const g = new Game({}, new Sfx());
    const ui = { said: [], gone: [], unsaved: false, cursor: null };
    g.hooks = {
      message: (t) => ui.said.push(t),
      openPanel() {},
      levelChanged() {},
      areaChanged() {},
      teleported() {},
      playerDied() {},
      inventoryChanged() {},
      getCursorItem: () => ui.cursor,
      setCursorItem: (it) => (ui.cursor = it),
      hoveredGroundId: () => null,
      levelUp() {},
      heroGone: (how) => ui.gone.push(how),
      saveState: (ok) => (ui.unsaved = !ok),
    };
    g.ui = ui;
    return g;
  };
  const started = (name) => {
    const g = makeGame();
    g.newGame(name);
    return g;
  };
  const reset = () => {
    localStorage.clear();
    sessionStorage.clear();
    save.setSlot(0);
  };
  /** Date.now moved on by `ms` while `fn` runs (a wait for a hand-over running out at once) */
  const later = async (ms, fn) => {
    const real = Date.now;
    Date.now = () => real() + ms;
    try {
      return await fn();
    } finally {
      Date.now = real;
    }
  };

  // ── a save before the claim's storage event: the event's hand-over, once ──
  {
    reset();
    const A = started('先存');
    A.save();
    // gold picked up since, then another tab opens the hero; the autosave (or the menu's save) comes before the event
    A.player.gold = 4321;
    claimElsewhere();
    A.save();
    check(heroSave().gold === 4321, `the save before the event didn't write the hero a last time: gold ${heroSave().gold}`);
    check(claim()?.handedTo === 'tab-other', `the save before the event didn't hand the hero over: ${JSON.stringify(claim())}`);
    check(A.elsewhere && A.paused && !!A.shared.readOnly && A.ui.gone.join() === 'saved', `after the save before the event: elsewhere ${A.elsewhere}, paused ${A.paused}, shared readOnly ${A.shared.readOnly}, notices ${A.ui.gone}`);
    // the event, come after, and saves and syncs after it: nothing more written, the notice not again
    const text = localStorage.getItem(KEY);
    A.player.gold = 1;
    A.heroClaimed();
    A.save();
    A.syncShared();
    check(localStorage.getItem(KEY) === text && A.ui.gone.length === 1, `after the hand-over: written ${localStorage.getItem(KEY) !== text}, notices ${A.ui.gone}`);
    // a shared-page sync coming first does the same
    reset();
    const S = started('先同步');
    S.save();
    S.player.gold = 1234;
    claimElsewhere();
    S.syncShared();
    check(heroSave().gold === 1234 && claim()?.handedTo === 'tab-other' && S.ui.gone.join() === 'saved', `a sync before the event: gold ${heroSave().gold}, claim ${JSON.stringify(claim())}, notices ${S.ui.gone}`);
  }
  facts.push('a save or sync before the claim\'s event writes last and hands over, once');

  // ── what the notice says: saved only when the last write went in ──
  {
    // the other tab wrote the hero first (its wait for this one ran out): no last write over it, handed
    // over all the same; what was played here since the last save isn't in it
    reset();
    const B = started('后存');
    B.save();
    B.time += 2;
    B.player.gold = 999;
    claimElsewhere();
    const theirs = JSON.stringify({ ...heroSave(), gold: 5 });
    localStorage.setItem(KEY, theirs);
    B.save();
    check(localStorage.getItem(KEY) === theirs && claim()?.handedTo === 'tab-other' && B.elsewhere && B.ui.gone.join() === 'unsaved', `the other tab wrote first over play here: kept ${localStorage.getItem(KEY) === theirs}, claim ${JSON.stringify(claim())}, notices ${B.ui.gone}`);
    // nothing played here since the last save (a tab frozen or hidden since it saved, or back from the
    // back-forward cache): all of it is in what the other tab read
    reset();
    const F = started('冻住');
    F.save();
    claimElsewhere();
    localStorage.setItem(KEY, JSON.stringify({ ...heroSave(), gold: 6 }));
    F.heroClaimed();
    check(claim()?.handedTo === 'tab-other' && F.elsewhere && F.ui.gone.join() === 'saved', `the other tab wrote first, nothing played here since: claim ${JSON.stringify(claim())}, notices ${F.ui.gone}`);
    // storage refuses the last write: the badge, and the notice says it wasn't saved
    reset();
    const C = started('满');
    C.save();
    const kept = heroSave().gold;
    C.player.gold = kept + 777;
    localStorage.setItem = function (k, v) {
      if (String(k).startsWith('dii-save')) throw new Error('QuotaExceededError');
      return Object.getPrototypeOf(this).setItem.call(this, k, v);
    };
    try {
      claimElsewhere();
      C.heroClaimed();
    } finally {
      delete localStorage.setItem;
    }
    check(heroSave().gold === kept && claim()?.handedTo === 'tab-other' && C.ui.unsaved && C.ui.gone.join() === 'unsaved', `the last write refused: gold ${heroSave().gold} (kept ${kept}), claim ${JSON.stringify(claim())}, badge ${C.ui.unsaved}, notices ${C.ui.gone}`);
    // a newer build's save, never written here: handed over at once, not left to the claimer's 3 s
    reset();
    const g = started('新版');
    g.save();
    localStorage.setItem(KEY, JSON.stringify({ ...heroSave(), v: 5 }));
    const N = makeGame();
    N.continueGame(0);
    const text = localStorage.getItem(KEY);
    claimElsewhere();
    N.heroClaimed();
    check(localStorage.getItem(KEY) === text && claim()?.handedTo === 'tab-other' && N.elsewhere && N.paused && N.ui.gone.join() === 'unsaved', `a newer build's hero: written ${localStorage.getItem(KEY) !== text}, claim ${JSON.stringify(claim())}, stopped ${N.paused}, notices ${N.ui.gone}`);
  }
  facts.push("the notice says saved only when the play here is in what the other tab reads (not when the write was refused, the other tab wrote over play here, or the save is a newer build's)");

  // ── a reload still loading its hero ──
  {
    reset();
    started('重载').save();
    // the page reloaded: a new game, the hero claimed as the page starts (main.ts), the models still coming
    const R = makeGame();
    R.claimToResume();
    const at = claim()?.time;
    // kept fresh while the models come: the page beats on each frame while resumeClaimed (main.ts)
    await later(3500, () => save.heartbeat());
    check(R.resumeClaimed && claim()?.time > at, `a reload's claim isn't kept fresh: resumeClaimed ${R.resumeClaimed}, ${at} → ${claim()?.time}`);
    // another tab opens the hero now (its storage event): handed over at once, the notice says so
    claimElsewhere();
    R.heroClaimed();
    check(!R.resumeClaimed && claim()?.handedTo === 'tab-other' && R.ui.gone.join() === 'unplayed', `a take-over during the load: resumeClaimed ${R.resumeClaimed}, claim ${JSON.stringify(claim())}, notices ${R.ui.gone}`);
    // the models in: it never starts
    const on = await R.resume();
    check(!on && !R.started && R.ui.gone.length === 1, `a reload given up started once its models came in: ${on}, started ${R.started}`);
    // nothing in the way: it plays on, where it was
    reset();
    started('接着玩').save();
    const P = makeGame();
    P.claimToResume();
    let told = false;
    const played = await P.resume(() => (told = true));
    check(played && P.started && !P.resumeClaimed && !told && P.player.name === '接着玩', `a reload with nothing in its way: ${played}, started ${P.started}, waited ${told}`);
  }
  facts.push('a reload still loading keeps its claim fresh, gives the hero up to a take-over and never starts');

  // ── a reload finding another tab's fresh claim as it starts ──
  {
    // that tab hands the hero over, after writing it a last time: read only then
    reset();
    started('等交接').save();
    const R = makeGame();
    R.claimToResume();
    claimElsewhere('tab-late');
    const handing = new Promise((done) =>
      setTimeout(() => {
        localStorage.setItem(KEY, JSON.stringify({ ...heroSave(), gold: 2468 }));
        localStorage.setItem(CLAIM, JSON.stringify({ ...claim(), handedTo: claim().tab }));
        done();
      }, 200),
    );
    let told = false;
    const on = await R.resume(() => (told = true));
    await handing;
    check(on && told && R.started && R.player.gold === 2468, `a reload waiting for a hand-over: ${on}, waited ${told}, gold ${R.player.gold} (2468 written last)`);
    // yet another tab opens it while this one waits, its storage event not in yet: that one has it
    reset();
    started('又被开').save();
    const Q = makeGame();
    Q.claimToResume();
    claimElsewhere('tab-late');
    const resumed = Q.resume();
    await new Promise((r) => setTimeout(r, 200));
    claimElsewhere('tab-later');
    const gone = await later(5000, () => resumed);
    check(!gone && !Q.started && Q.ui.gone.join() === 'unplayed' && claim()?.tab === 'tab-later' && claim()?.handedTo === 'tab-later', `opened elsewhere during the wait: ${gone}, started ${Q.started}, notices ${Q.ui.gone}, claim ${JSON.stringify(claim())}`);
  }
  facts.push('a reload finding another tab\'s claim waits for its hand-over and reads what it wrote last, or gives the hero up to a later claim');

  reset();
  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${facts.join('; ')}`);
};
