// Quests (src/game/quests, D2MOO D2QuestRecord.cpp and QUESTS/ACT1/A1Q1.cpp, A1Q2.cpp at d9d394f):
// the record's flags and D2's reading of it for a new game; a line of one game's heard in the next
// counting for nothing there; the Den of Evil played through Game from
// Akara's first word to her reward (once), the count said only for the den's own kills, started by
// walking in without her, its reward collected in a later game; each difficulty's record apart;
// saves keeping records (unknown quests too) and old saves loading with none; what counts in the
// den (not neverCount, only hostile); quest drops by the record (Andarielq); the Sisters' Burial
// Grounds on offer once the den is done, played from Kashya's first word to her reward: only the
// Burial Grounds' Blood Raven counts, and only with the hero in her room or one by it (D2's 10 m
// rooms, diagonals too), whoever killed her; the free hireling once, none to a hero with one dead or
// alive, the level-8 rule lifted; its flags through a reload, the title and the difficulties, each
// difficulty's apart; the names from the rename table; every line our own, filled, and on the
// review page, each one spoken with its takes, Kashya's among them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEW, reviewMarkdown } from '../dialogue-review.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/d2-names', f), 'utf8'));
/** slot 0's save (the tests share the save module: its ?dev slot, once on, would stay on for the rest) */
const KEY = 'dii-save-v1';

export default async (load) => {
  const R = await load('/src/game/quests/record.ts');
  const { QUEST_TICK } = await load('/src/game/quests/control.ts');
  const { countsInLevel, monstersLeft } = await load('/src/game/quests/denofevil.ts');
  const { fillLine } = await load('/src/game/quests/quest.ts');
  const { ACT1_QUESTS, QUEST_BY_KEY } = await load('/src/data/quests.ts');
  const DLG = await load('/src/data/dialogue.ts');
  const save = await load('/src/game/save.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { monsterLootTc } = await load('/src/game/loot.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const { CAMP_AREA, WILD_AREA, DEN_OF_EVIL, COLD_PLAINS, BURIAL_GROUNDS } = await load('/src/world/areas.ts');
  const { nearRaven, ROOM_M } = await load('/src/game/quests/sisters.ts');
  const { mayHireNow, placeMerc } = await load('/src/game/merc.ts');
  const { spawnGuardian } = await load('/src/game/spawn.ts');
  const { RNG } = await load('/src/core/math.ts');
  const F = R.QFLAG;
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const notes = [];

  // ── the record ──
  const r = {};
  R.setQuestState(r, 'a1q1', F.STARTED);
  R.setQuestState(r, 'a1q1', F.CUSTOM3);
  R.setQuestState(r, 'a1q1', F.PRIMARYGOALDONE);
  check(r.a1q1 === ((1 << 2) | (1 << 7) | (1 << 13)) && R.questState(r, 'a1q1', F.CUSTOM3) && !R.questState(r, 'a1q1', F.REWARDGRANTED), `set: ${r.a1q1}`);
  R.resetIntermediateStateFlags(r, 'a1q1');
  check(r.a1q1 === 1 << 13, `the steps reset (STARTED…CUSTOM7) leave ${r.a1q1}`);
  R.clearQuestState(r, 'a1q1', F.PRIMARYGOALDONE);
  check(!('a1q1' in r), 'a quest with no flag left stays in the record');
  // read for a new game (QUESTRECORD_CopyBufferToRecord with bResetStates)
  const read = R.loadQuestRecord({ a1q1: (1 << F.REWARDPENDING) | (1 << F.PRIMARYGOALDONE), a1q2: (1 << F.COMPLETEDNOW) | (1 << F.STARTED), a5q3: 5, bad: 'x', neg: -1, big: 1 << 20, frac: 1.5 });
  check(read.a1q1 === ((1 << F.REWARDPENDING) | (1 << F.COMPLETEDBEFORE)), `a reward left waiting reads as from an earlier game: ${read.a1q1}`);
  check(read.a1q2 === 1 << F.STARTED && read.a5q3 === 5, `this game's flags go, a later build's quest stays: ${JSON.stringify(read)}`);
  check(!('bad' in read || 'neg' in read || 'big' in read || 'frac' in read), `damaged words kept: ${JSON.stringify(read)}`);
  check(JSON.stringify(R.loadQuestRecord(null)) === '{}' && JSON.stringify(R.loadQuestRecord([1, 2])) === '{}', 'a record that is no record');
  check(R.questKeyOf(0) === 'a1q0' && R.questKeyOf(6) === 'a1q6' && R.questKeyOf(7) === undefined && R.questKeyOf(9) === 'a2q1' && R.questKeyOf(35) === 'a5q1', 'QUESTSTATEFLAG numbers to keys');
  check([...R.rewardedQuests({ a1q1: 1, a1q4: 2, a1q2: 4 })].sort().join() === 'a1q1,a1q4', 'rewarded quests (granted or pending)');

  // ── quest drops (MonsterMode.cpp:536-568): a monster's quest class until the record says done.
  // D2R gives Andariel (quest 6 at checkpoint 1) Andarielq as her regular class too, so for the
  // test her regular one is another for a moment ──
  const andy = { def: { row: D2X_MONSTERS.andariel }, rank: 'boss', level: 30 };
  const row = D2X_MONSTERS.andariel.diff[0].tc;
  const regular = row.regular;
  row.regular = 'Act 1 H2H A';
  const tcOf = (rec) => monsterLootTc(andy, 0, rec);
  try {
    check(D2X_MONSTERS.andariel.questTc?.quest === 6, `Andariel's quest drop is quest ${D2X_MONSTERS.andariel.questTc?.quest}`);
    check(tcOf(undefined) === 'Andarielq' && tcOf({}) === 'Andarielq', `a first kill drops ${tcOf({})}`);
    check(tcOf({ a1q6: 1 << F.COMPLETEDBEFORE }) === 'Act 1 H2H A' && tcOf({ a1q6: 1 << F.REWARDPENDING }) === 'Act 1 H2H A', 'done before or reward waiting: not the regular class');
    check(tcOf({ a1q6: 1 << F.REWARDGRANTED }) === 'Andarielq', 'D2 checks pending, completed before and the checkpoint, not granted');
    check(tcOf({ a1q1: 0xffff }) === 'Andarielq', "another quest's flags count");
  } finally {
    row.regular = regular;
  }

  // ── what counts in a level (MonsterRegion.cpp), by the monster's MonStats row ──
  const as = (id) => countsInLevel({ def: { row: D2X_MONSTERS[id] } });
  check(as('zombie1') && as('fallen1') && as('fallenshaman1') && as('quillrat1'), 'hostile monsters count');
  check(!as('rat') && !as('akara'), 'a critter or an ally counts');
  check(!as('trap-horzmissile'), 'a neverCount monster counts');

  // ── the names: the rename table's ──
  const names = json('quests.json');
  for (const q of ACT1_QUESTS) {
    const row = names[q.str];
    check(row && row.name === q.name && row.nameEn === q.nameEn, `${q.key}: ${q.name} / ${q.nameEn}, the table has ${row?.name} / ${row?.nameEn}`);
  }
  check(ACT1_QUESTS.length === 6 && new Set(ACT1_QUESTS.map((q) => q.key)).size === 6, 'six quests');

  // ── the lines: ours, filled from the rename tables, all on the review page ──
  const lines = [...Object.values(DLG.DEN_LINES), ...Object.values(DLG.DEN_LOG), ...Object.values(DLG.SISTERS_LINES), ...Object.values(DLG.SISTERS_LOG), ...Object.values(DLG.LOG_LINES), ...Object.values(DLG.GOSSIP).flat(), ...Object.values(DLG.GREETINGS).flatMap((g) => [...g.greeting, ...g.farewell])];
  const official = new Set();
  const officialEn = new Set();
  for (const f of ['quests.json', 'npcs.json', 'areas.json']) {
    for (const row of Object.values(json(f))) {
      if (row.official) official.add(row.official);
      if (row.en) officialEn.add(row.en);
    }
  }
  for (const g of json('glossary.json')) {
    if (g.official) official.add(g.official);
    for (const e of g.en.split(/\s*[/(]\s*/)) if (e.length > 3) officialEn.add(e.replace(/\)$/, ''));
  }
  officialEn.delete('Camp');
  // a name of ours may hold an official one whole (a word added to it: tools/d2-names/style.md), so
  // our names are cut out of a line before it is looked through for the official ones
  const ours = { zh: [], en: [] };
  for (const f of fs.readdirSync(path.join(root, 'tools/d2-names')).filter((f) => f.endsWith('.json'))) {
    for (const row of Object.values(json(f))) {
      ours.zh.push(row?.name, row?.new);
      ours.en.push(row?.nameEn, row?.newEn);
    }
  }
  const cut = (s, names) => [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length).reduce((acc, n) => acc.split(n).join('\u0000'), s);
  const review = fs.readFileSync(REVIEW, 'utf8');
  const mercName = (await load('/src/data/d2x/hirelings.ts')).D2X_HIRELING_NAMES.merc01;
  for (const line of lines) {
    const l = fillLine(line, { n: 3, name: [mercName.name, mercName.nameEn] });
    check(l.zh && l.en && !/[{}]/.test(l.zh + l.en), `a line unfilled or half there: ${JSON.stringify(l)}`);
    const [zh, en] = [cut(l.zh, ours.zh), cut(l.en, ours.en)];
    for (const o of official) check(!zh.includes(o), `an official name ${o}: ${l.zh}`);
    for (const o of officialEn) check(!en.includes(o), `an official name ${o}: ${l.en}`);
    check(!l.zh.includes('艾莉娜'), `the merchant's old name: ${l.zh}`);
    check(review.includes(l.zh), `not on the review page: ${l.zh}`);
  }
  check(review === (await reviewMarkdown(load)), 'the review page is behind the lines or the recordings: node tools/dialogue-review.mjs');
  // each line spoken aloud on the page with its recording, a take for each way of saying it, beside its words
  const { npcLine } = await load('/src/audio/sounds.ts');
  for (const s of DLG.spokenLines()) {
    s.lines.forEach((l, i) => {
      const take = `${npcLine(s.npc, s.id, s.quest)}.${i + 1}`;
      const row = review.split('\n').find((r) => r.includes(`| \`${take}\``));
      check(row?.includes(`| ${fillLine(l).zh} |`), `the review page doesn't give ${take} beside its words: ${row}`);
    });
  }
  // Kashya's four in the Sisters' Burial Grounds among them, as Akara's in the Den of Evil
  const quest = (npc, q) => DLG.spokenLines().filter((s) => s.npc === npc && s.quest === q).map((s) => npcLine(s.npc, s.id, s.quest)).join();
  check(quest('kashya', 'a1q2') === 'voice.kashya.a1q2_intro,voice.kashya.a1q2_remind,voice.kashya.a1q2_remind_out,voice.kashya.a1q2_reward' && quest('akara', 'a1q1').split(',').length === 4, `the quest lines spoken: ${quest('akara', 'a1q1')} ${quest('kashya', 'a1q2')}`);

  // ── the Den of Evil, played ──
  localStorage.clear();
  sessionStorage.clear();
  save.setSlot(0);
  let news = 0;
  const msgs = [];
  const game = new Game({}, new Sfx());
  game.hooks = {
    message: (t) => msgs.push(t),
    openPanel() {},
    levelChanged() {},
    areaChanged() {},
    teleported() {},
    playerDied() {},
    inventoryChanged() {},
    getCursorItem: () => null,
    setCursorItem() {},
    hoveredGroundId: () => null,
    levelUp() {},
    questsChanged: () => news++,
  };
  game.newGame('任务测试', 'paladin');
  const p = () => game.player;
  const word = (d = p().difficulty) => p().quests[d].a1q1 ?? 0;
  const has = (f, d) => ((word(d) >> f) & 1) === 1;
  const den = () => game.quests.script('a1q1');
  const akara = () => game.level.objects.find((o) => o.npcId === 'akara');
  /** a spot `k` steps out past the camp's gate on the overworld */
  const pastGate = (k = 8) => {
    const L = game.level;
    const g = L.layout.seams.find((s) => s.a === CAMP_AREA && s.b === WILD_AREA);
    return L.map.nearestWalkable(g.tb.x + (g.tb.x - g.ta.x) * k, g.tb.z + (g.tb.z - g.ta.z) * k);
  };
  const toAkara = () => game.teleportWithin(game.level.map.nearestWalkable(akara().pos.x + 1.5, akara().pos.z + 1.5));
  /** every monster that counts in the den killed but `keep` */
  const clearDen = (keep = 0) => {
    const L = game.mapOf(DEN_OF_EVIL);
    const alive = L.monsters.filter((m) => !m.dead && countsInLevel(m));
    for (const m of alive.slice(keep)) game.killMonster(m, 'phys');
    return monstersLeft(L);
  };
  const ticks = (n) => game.quests.update(QUEST_TICK * n + 1e-6);

  check(akara()?.npc === '亚喀蕾' && game.quests.hasNews('akara') && word() === 0, `a new game: ${akara()?.npc}, news ${game.quests.hasNews('akara')}, word ${word()}`);
  check(game.quests.log('a1q1').state === 'none' && game.quests.log('a1q2').state === 'none' && ACT1_QUESTS.filter((q) => q.key !== 'a1q1' && q.key !== 'a1q2').every((q) => game.quests.log(q.key).state === 'off'), 'the log of a new hero');
  // the Sisters wait on the den (ACT1Q1_SeqCallback, A1Q1.cpp:509-529): Kashya has nothing to say of them yet
  const kashya = () => game.level.objects.find((o) => o.npcId === 'kashya');
  check(kashya()?.npc === '柯霞' && game.quests.script('a1q2').state === 0 && !game.quests.hasNews('kashya') && game.quests.opening('kashya') === null && game.quests.talk('kashya') === null, `a new hero's Kashya (${kashya()?.npc}): state ${game.quests.script('a1q2').state}, news ${game.quests.hasNews('kashya')}`);
  // a line of one game's heard only once the next has begun (left up as its hero was quit, a difficulty left): nothing to the new game
  toAkara();
  const stale = game.talkTo(akara());
  game.newGame('任务测试', 'paladin');
  game.npcSpoke(stale);
  check(stale?.id === 'intro' && word() === 0 && den().state === 1 && game.quests.hasNews('akara'), `the last game's line heard in this one: word ${word()}, state ${den().state}`);
  // the rest in a game of its own: were that line counted, the check above says so, not a failure further on
  game.newGame('任务测试', 'paladin');
  toAkara();
  const intro = game.talkTo(akara());
  check(intro?.id === 'intro' && intro.text.includes('邪秽巢穴'), `Akara's first words: ${intro?.id}`);
  check(game.npcTalk(akara())?.id?.startsWith('gossip'), 'before the quest is given, 交谈 is small talk');
  if (intro) game.npcSpoke(intro);
  check(has(F.STARTED) && den().state === 2 && !game.quests.hasNews('akara'), `given: word ${word()}, state ${den().state}`);
  check(game.talkTo(akara()) === null && game.npcTalk(akara())?.id === 'remind', 'given, she reminds under 交谈');
  game.npcLeft(akara());
  check(den().last === 1 && game.quests.log('a1q1').state === 'active', `left her: status ${den().last}`);
  game.teleportWithin(pastGate());
  check(game.area.id === WILD_AREA && has(F.LEAVETOWN) && den().state === 3, `out of the camp: area ${game.area.id}, word ${word()}`);
  check(game.npcTalk(akara())?.id === 'remindOut', 'out of the camp, her reminder is the other one');
  game.enterArea(DEN_OF_EVIL, 'stairs');
  check(has(F.ENTERAREA) && den().last === 2, `in the den: word ${word()}, status ${den().last}`);
  const all = monstersLeft(game.level);
  check(all > 6, `the den has ${all} monsters`);
  const before = { points: p().skillPoints };
  clearDen(6);
  check(den().last === 2 && den().remaining === 6, `six left: status ${den().last}, ${den().remaining} left`);
  clearDen(5);
  check(den().last === 4 && den().remaining === 5 && msgs.some((m) => m.includes('还剩 5 只')), `five left: status ${den().last}, ${den().remaining}`);
  check(game.quests.log('a1q1').text.includes('还剩 5 只'), `the log at five: ${game.quests.log('a1q1').text}`);
  check(!game.isLit(game.level), 'lit before it is cleared');
  // five left in the den, kills on the moor: D2's status 4 again, but no count on screen and no news for the log
  game.enterArea(WILD_AREA, 'stairs');
  const counts = () => msgs.filter((m) => m.includes('还剩')).length;
  const [said, heard] = [counts(), news];
  const moor = game.level.monsters.filter((m) => !m.dead && countsInLevel(m)).slice(0, 4);
  for (const m of moor) game.killMonster(m, 'phys');
  check(game.area.id === WILD_AREA && moor.length === 4 && counts() === said && news === heard && den().last === 4 && den().remaining === 5, `kills outside the den: ${counts() - said} counts said, ${news - heard} news, status ${den().last}, ${den().remaining} left`);
  game.enterArea(DEN_OF_EVIL, 'stairs');
  clearDen(4);
  check(counts() === said + 1 && news > heard && msgs.at(-1).includes('还剩 4 只'), `a kill in the den: ${msgs.at(-1)}`);
  clearDen(0);
  check(has(F.REWARDPENDING) && has(F.PRIMARYGOALDONE) && !has(F.REWARDGRANTED) && !has(F.COMPLETEDNOW), `cleared: word ${word()}`);
  check(game.isLit(game.level) && game.quests.log('a1q1').state === 'reward', 'cleared, the den is lit and the log says to go back');
  check(msgs.some((m) => m.includes('已被肃清')), 'no word that the den is cleansed');
  ticks(8);
  check(den().last === 4, `the log turned before the timer: ${den().last}`);
  ticks(1);
  check(den().last === 5, `the log after nine quest ticks: ${den().last}`);
  game.enterArea(CAMP_AREA, 'waypoint');
  toAkara();
  check(game.quests.hasNews('akara'), 'Akara has no mark with the reward waiting');
  const reward = game.talkTo(akara());
  check(reward?.id === 'reward', `back, she says ${reward?.id}`);
  check(game.quests.script('a1q2').state === 0 && !game.quests.hasNews('kashya'), 'the Sisters on offer before the den is rewarded');
  const points = p().skillPoints;
  game.npcSpoke(reward);
  // the den's reward moves the act's sequence on: Kashya offers hers now (A1Q1.cpp:225-236 → A1Q2.cpp:509-534)
  check(game.quests.script('a1q2').state === 1 && game.quests.hasNews('kashya') && game.quests.opening('kashya')?.id === 'intro', `the den rewarded: the Sisters' state ${game.quests.script('a1q2').state}, Kashya's news ${game.quests.hasNews('kashya')}`);
  check(p().skillPoints === points + 1 && has(F.REWARDGRANTED) && !has(F.REWARDPENDING) && !has(F.STARTED) && !has(F.ENTERAREA), `rewarded: ${points} → ${p().skillPoints} points, word ${word()}`);
  game.npcSpoke(reward);
  check(game.talkTo(akara()) === null && p().skillPoints === points + 1, 'the reward handed over twice');
  check(game.quests.log('a1q1').state === 'done' && !game.quests.hasNews('akara'), 'done in the log');
  check(game.quests.unseen().join() === 'a1q1', 'the log has the done quest to show');
  // what 交谈 would have her say next (fetched ahead: src/game/townsfolk.ts fetchAhead) is what it says, and asking doesn't move her small talk on
  const next = game.quests.nextTalk('akara')?.id;
  check(next?.startsWith('gossip') && game.quests.nextTalk('akara')?.id === next && game.npcTalk(akara())?.id === next, `her next small talk ${next}, then ${game.quests.nextTalk('akara')?.id}`);
  const gossip = new Set();
  for (let i = 0; i < 6; i++) gossip.add(game.npcTalk(akara())?.id);
  check(gossip.size === 3, `her small talk once the den is done: ${[...gossip].join()}`);
  check(p().tradeCtx().quests.has('a1q1'), "the quest isn't among the hero's rewarded ones for prices");
  notes.push(`given, ${all} in the den, cleared, +1 point once`);

  // ── saved and played again: done stays done; nightmare's record untouched ──
  game.save();
  let saved = JSON.parse(localStorage.getItem(KEY));
  check((saved.progress[0].quests.a1q1 & 1) === 1 && JSON.stringify(saved.progress[1].quests) === '{}' && JSON.stringify(saved.progress[2].quests) === '{}', `the save's records: ${JSON.stringify(saved.progress.map((x) => x.quests))}`);
  game.continueGame();
  check(has(F.REWARDGRANTED) && p().skillPoints === points + 1 && !den().playable && !game.quests.hasNews('akara') && game.quests.log('a1q1').state === 'done', `played again: word ${word()}, playable ${den().playable}`);
  game.enterArea(DEN_OF_EVIL, 'stairs');
  clearDen(0);
  // (the save holds the goal reached in the game it was written in; read for a new game, it's gone)
  check((saved.progress[0].quests.a1q1 & (1 << F.PRIMARYGOALDONE)) !== 0 && word() === 1 << F.REWARDGRANTED && !game.isLit(game.level), `cleared again in a later game: word ${word()} (saved ${saved.progress[0].quests.a1q1}), lit ${game.isLit(game.level)}`);

  // ── nightmare: its own record, in a game of its own (D2 plays one difficulty a game) ──
  game.enterArea(CAMP_AREA, 'waypoint');
  game.setDifficulty(1);
  check(word(1) === 0 && den().playable && game.quests.hasNews('akara') && game.quests.log('a1q1').state === 'none', `nightmare: word ${word(1)}`);
  // another game: normal's maps, its den cleared there, are gone; a kill on nightmare's moor doesn't finish it
  check(game.mapOf(DEN_OF_EVIL) === null && game.area.id === CAMP_AREA, `normal's den kept into nightmare: ${game.mapOf(DEN_OF_EVIL) !== null}, in area ${game.area.id}`);
  game.teleportWithin(pastGate());
  const nmMoor = game.level.monsters.find((m) => !m.dead && countsInLevel(m));
  if (nmMoor) game.killMonster(nmMoor, 'phys');
  check(nmMoor?.difficulty === 1 && !has(F.REWARDPENDING, 1) && den().last !== 4, `nightmare's quest done by a kill on its moor: word ${word(1)}, monster in difficulty ${nmMoor?.difficulty}`);
  game.save();
  game.continueGame();
  game.enterArea(CAMP_AREA, 'waypoint');
  // walked into the den without Akara's word: the quest starts there (A1Q1.cpp:446-478)
  game.enterArea(DEN_OF_EVIL, 'stairs');
  check(has(F.ENTERAREA, 1) && !has(F.STARTED, 1) && den().last === 2 && !game.quests.hasNews('akara'), `nightmare's den unasked: word ${word(1)}, status ${den().last}`);
  check(monstersLeft(game.level) > 6 && game.level.monsters.every((m) => m.difficulty === 1), `nightmare's den: ${monstersLeft(game.level)} nightmare monsters`);
  clearDen(0);
  check(has(F.REWARDPENDING, 1) && (word(0) & 1) === 1 && !has(F.REWARDPENDING, 0), `nightmare cleared: ${word(1)}, normal ${word(0)}`);
  // not collected: saved, the next game offers it (D2: reward pending reads as completed before)
  game.save();
  game.continueGame();
  check(p().difficulty === 1 && has(F.REWARDPENDING) && has(F.COMPLETEDBEFORE) && !has(F.PRIMARYGOALDONE) && !den().playable, `nightmare next game: word ${word()}`);
  check(game.quests.hasNews('akara') && game.quests.log('a1q1').state === 'reward', 'the reward waiting from an earlier game has no mark');
  toAkara();
  const later = game.talkTo(akara());
  const pts = p().skillPoints;
  if (later) game.npcSpoke(later);
  check(later?.id === 'reward' && p().skillPoints === pts + 1 && has(F.REWARDGRANTED) && !has(F.REWARDPENDING), `the reward from the last game: ${later?.id}, points ${pts} → ${p().skillPoints}`);
  if (later) game.npcSpoke(later);
  check(p().skillPoints === pts + 1, 'the later reward handed over twice');
  game.save();
  saved = JSON.parse(localStorage.getItem(KEY));
  check((saved.progress[1].quests.a1q1 & 1) === 1 && (saved.progress[0].quests.a1q1 & 1) === 1 && JSON.stringify(saved.progress[2].quests) === '{}', `both records saved: ${JSON.stringify(saved.progress.map((x) => x.quests))}`);
  notes.push('nightmare apart, started in the den, its reward collected a game later');

  // ── saves: unknown quests kept; an old save has no quests ──
  saved.progress[0].quests.a2q1 = 5;
  saved.progress[2].quests = { a1q1: 'garbage', a1q2: 4 };
  localStorage.setItem(KEY, JSON.stringify(saved));
  game.continueGame();
  game.save();
  const again = JSON.parse(localStorage.getItem(KEY));
  check(again.progress[0].quests.a2q1 === 5 && JSON.stringify(again.progress[2].quests) === '{"a1q2":4}', `a later build's quest, a damaged word: ${JSON.stringify(again.progress.map((x) => x.quests))}`);
  const old = { v: 3, name: '旧存档', cls: 'paladin', level: 3, xp: 2000, base: { str: 25, dex: 20, vit: 25, ene: 15 }, statPoints: 10, skillPoints: 2, skills: { holy_bolt: 1 }, equipment: {}, inventory: [], stash: [], belt: [[], [], [], []], gold: 0, stashGold: 0, binds: ['attack'], activeAura: null, depthReached: 0, waypoints: [0], depth: 0, time: 1 };
  localStorage.setItem(KEY, JSON.stringify(old));
  check(game.continueGame() && p().quests.every((q) => JSON.stringify(q) === '{}') && game.quests.hasNews('akara'), 'an old save loads without quests');
  game.save();
  const up = JSON.parse(localStorage.getItem(KEY));
  check(up.v === 4 && up.progress.every((x) => JSON.stringify(x.quests) === '{}') && up.skillPoints === 2, `an old save written back: ${JSON.stringify(up.progress)}`);
  notes.push('records round-trip, unknown quests kept, old saves without');

  // ── the Sisters' Burial Grounds: D2's room rule (A1Q2.cpp:363-405), rooms of 10 m from the area's
  // corner (8 tiles at M_PER_D2_TILE), her own and the eight round it ──
  {
    const c = { x: 100, z: 200 };
    const at = (rx, rz) => ({ x: c.x + (rx + 0.5) * ROOM_M, z: c.z + (rz + 0.5) * ROOM_M });
    const raven = at(2, 3);
    check(ROOM_M === 10, `D2's room at our scale: ${ROOM_M} m`);
    check(nearRaven(c, at(2, 3), raven) && nearRaven(c, { x: c.x + 20.01, z: c.z + 30.01 }, { x: c.x + 29.99, z: c.z + 39.99 }), 'her own room');
    check([[1, 3], [3, 3], [2, 2], [2, 4]].every(([x, z]) => nearRaven(c, at(x, z), raven)), 'a room beside hers');
    check([[1, 2], [3, 4], [1, 4], [3, 2]].every(([x, z]) => nearRaven(c, at(x, z), raven)), 'a room on her diagonal');
    check([[0, 3], [4, 3], [2, 1], [2, 5], [0, 1], [4, 5]].every(([x, z]) => !nearRaven(c, at(x, z), raven)), 'a room two off counted near');
    // by rooms, not by metres: 11 m off in the next room counts, 1 m off across two room lines doesn't
    check(nearRaven(c, { x: c.x + 10.5, z: c.z + 35 }, { x: c.x + 21.5, z: c.z + 35 }), '11 m off, the next room');
    check(!nearRaven(c, { x: c.x + 9.9, z: c.z + 35 }, { x: c.x + 20.1, z: c.z + 35 }) && nearRaven(c, { x: c.x + 19.9, z: c.z + 35 }, { x: c.x + 20.1, z: c.z + 35 }), 'a room boundary');
    // past the area's corner the rooms run on (a room of the next area by her edge is near: DrlgDrlgRoom.cpp:769-811)
    check(nearRaven(c, { x: c.x - 3, z: c.z + 5 }, { x: c.x + 5, z: c.z + 5 }) && !nearRaven(c, { x: c.x - 13, z: c.z + 5 }, { x: c.x + 5, z: c.z + 5 }), 'rooms past the corner');
  }

  // ── the Sisters' Burial Grounds, played: a hero who did the den in an earlier game ──
  localStorage.clear();
  sessionStorage.clear();
  save.setSlot(0);
  game.newGame('姊妹测试', 'sorceress');
  p().quests[0].a1q1 = 1 << F.REWARDGRANTED;
  game.save();
  game.continueGame();
  const sis = () => game.quests.script('a1q2');
  const sword = (d = p().difficulty) => p().quests[d].a1q2 ?? 0;
  const shas = (f, d) => ((sword(d) >> f) & 1) === 1;
  const toKashya = () => game.teleportWithin(game.level.map.nearestWalkable(kashya().pos.x + 1.5, kashya().pos.z + 1.5));
  const heroSaid = [];
  const say = game.say.bind(game);
  game.say = (l) => {
    heroSaid.push(l);
    say(l);
  };
  /** every Blood Raven on the Burial Grounds' map, and the one with the quest */
  const ravens = () => (game.mapOf(BURIAL_GROUNDS)?.monsters ?? []).filter((m) => m.def.row.id === 'bloodraven');
  const raven = () => ravens().find((m) => m.quest === 'a1q2');
  /** the Burial Grounds' corner on the overworld: its rooms' origin */
  const corner = () => {
    const L = game.mapOf(BURIAL_GROUNDS);
    let x = Infinity;
    let z = Infinity;
    L.areas.forEach((id, i) => {
      if (id !== BURIAL_GROUNDS) return;
      x = Math.min(x, i % L.map.w);
      z = Math.min(z, Math.floor(i / L.map.w));
    });
    return { x, z };
  };
  const roomOf = (q, c = corner()) => [Math.floor((q.x - c.x) / ROOM_M), Math.floor((q.z - c.z) / ROOM_M)];
  /** the hero set down on a walkable tile of the Burial Grounds `d` rooms off hers (the first of `ds` there is one in), or null */
  const standOff = (m, ds) => {
    const L = game.mapOf(BURIAL_GROUNDS);
    const c = corner();
    const [rx, rz] = roomOf(m.pos, c);
    for (const d of ds) {
      for (let i = 0; i < L.areas.length; i++) {
        const x = i % L.map.w;
        const z = Math.floor(i / L.map.w);
        if (L.areas[i] !== BURIAL_GROUNDS || !L.map.walkable(x, z)) continue;
        const q = { x: x + 0.5, z: z + 0.5 };
        const [hx, hz] = roomOf(q, c);
        if (hx - rx !== d[0] || hz - rz !== d[1]) continue;
        game.teleportWithin(q);
        const [px, pz] = roomOf(p().pos, c);
        if (game.area.id === BURIAL_GROUNDS && px - rx === d[0] && pz - rz === d[1]) return d;
      }
    }
    return null;
  };
  const DIAGONALS = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
  const TWO_OFF = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]];
  check(sis().playable && sis().state === 1 && game.quests.hasNews('kashya') && game.quests.log('a1q2').state === 'none' && sword() === 0, `the den done before: the Sisters' state ${sis().state}, news ${game.quests.hasNews('kashya')}`);
  check(game.mapOf(BURIAL_GROUNDS) === game.level && ravens().length === 1 && !!raven(), `the Burial Grounds' Blood Ravens: ${ravens().length}, with the quest ${!!raven()}`);
  check(!mayHireNow(game) && p().level < 8 && !game.hasMerc(), `a level ${p().level} hero hires before the Sisters' reward`);
  // Kashya gives it, at once (her 81); 交谈 has nothing till it's given
  toKashya();
  check(game.npcTalk(kashya()) === null, 'Kashya has small talk before her quest is given');
  const sIntro = game.talkTo(kashya());
  check(sIntro?.id === 'intro' && sIntro.quest === 'a1q2' && sIntro.text.includes('绯鸦') && sIntro.text.includes('葬骨荒冢') && sIntro.text.includes('亚喀蕾'), `Kashya's first words: ${sIntro?.id} ${sIntro?.text}`);
  if (sIntro) game.npcSpoke(sIntro);
  check(shas(F.STARTED) && sis().state === 2 && !game.quests.hasNews('kashya') && game.talkTo(kashya()) === null && game.npcTalk(kashya())?.id === 'remind', `given: word ${sword()}, state ${sis().state}`);
  game.npcLeft(kashya());
  check(sis().last === 1 && game.quests.log('a1q2').state === 'active' && game.quests.log('a1q2').text.includes('凛寒原野'), `left Kashya: status ${sis().last}, log ${game.quests.log('a1q2').text}`);
  game.teleportWithin(pastGate());
  check(game.area.id === WILD_AREA && shas(F.LEAVETOWN) && sis().state === 3 && game.npcTalk(kashya())?.id === 'remindOut', `out of the camp: word ${sword()}, state ${sis().state}`);
  // into the Burial Grounds: the log says to find her, and the hero knows the place
  heroSaid.length = 0;
  const r1 = raven();
  game.teleportWithin(game.level.map.nearestWalkable(r1.pos.x + 12, r1.pos.z));
  check(game.area.id === BURIAL_GROUNDS && shas(F.ENTERAREA) && sis().last === 2 && heroSaid.includes('graveyard') && game.quests.log('a1q2').text.includes('绯鸦'), `in the Burial Grounds (area ${game.area.id}): word ${sword()}, status ${sis().last}, said ${heroSaid.join()}`);
  // only hers counts: a Blood Raven set down as a rift's guardian is (spawnGuardian: no quest), and the Burial Grounds' other dead, killed beside the hero
  const wordBefore = sword();
  const stray = spawnGuardian(game.level, game.area, { mon: 'bloodraven' }, game.level.map.nearestWalkable(p().pos.x + 1, p().pos.z), new RNG(7));
  check(stray && stray.quest === undefined && ravens().length >= 2, `a rift guardian's Blood Raven: quest ${stray?.quest}, ${ravens().length} on the map`);
  if (stray) game.killMonster(stray, 'phys');
  const others = game.level.monsters.filter((m) => !m.dead && !m.quest && game.level.areaAt(m.pos.x, m.pos.z).id === BURIAL_GROUNDS).slice(0, 3);
  for (const m of others) game.killMonster(m, 'phys');
  check(sword() === wordBefore && sis().state === 3 && !raven().dead && others.length === 3, `another Blood Raven or the Burial Grounds' dead did it: word ${sword()} (was ${wordBefore}), state ${sis().state}`);
  // killed with the hero two rooms off: done in this game, no reward (A1Q2.cpp:419-430), news for the log
  const far = standOff(r1, TWO_OFF);
  const newsBefore = news;
  game.killMonster(r1, 'phys');
  check(far && !shas(F.REWARDPENDING) && !shas(F.PRIMARYGOALDONE) && shas(F.COMPLETEDNOW) && sis().state === 4 && news > newsBefore, `killed two rooms off (${far}): word ${sword()}, state ${sis().state}`);
  check(msgs.some((m) => m.includes('不算你的')) && game.quests.log('a1q2').state === 'done' && game.quests.log('a1q2').text.includes('不算你的') && !game.quests.hasNews('kashya'), `missed: the log ${JSON.stringify(game.quests.log('a1q2'))}, Kashya's news ${game.quests.hasNews('kashya')}`);
  game.enterArea(CAMP_AREA, 'waypoint');
  toKashya();
  check(game.talkTo(kashya()) === null && game.npcTalk(kashya()) === null && !game.hasMerc(), 'Kashya has words or a reward for a kill not counted');
  // the next game: it's to do again, from where the record says (COMPLETEDNOW goes with the game), and she's back
  game.save();
  game.continueGame();
  check(sis().playable && sis().state === 3 && sis().last === 2 && !shas(F.COMPLETEDNOW) && shas(F.ENTERAREA) && game.quests.log('a1q2').state === 'active', `the next game: word ${sword()}, state ${sis().state}, status ${sis().last}`);
  const r2 = raven();
  check(r2 && !r2.dead && r2 !== r1, 'Blood Raven not back in the next game');
  toKashya();
  check(game.talkTo(kashya()) === null && game.npcTalk(kashya())?.id === 'remindOut', 'the next game, Kashya reminds the hero');
  // killed with the hero in a room on her diagonal, by the hero: done, the reward waiting
  game.teleportWithin(game.level.map.nearestWalkable(r2.pos.x + 12, r2.pos.z));
  const diag = standOff(r2, DIAGONALS);
  heroSaid.length = 0;
  game.killMonster(r2, 'phys');
  check(diag && shas(F.REWARDPENDING) && shas(F.PRIMARYGOALDONE) && !shas(F.COMPLETEDNOW) && !shas(F.REWARDGRANTED) && heroSaid.includes('quest_done'), `killed from her diagonal room (${diag}): word ${sword()}, said ${heroSaid.join()}`);
  check(msgs.some((m) => m.includes('绯鸦已经伏诛')) && game.quests.log('a1q2').state === 'reward' && game.quests.hasNews('kashya'), `done: the log ${JSON.stringify(game.quests.log('a1q2'))}`);
  // the saved record: done in this game, the reward waiting; nightmare's and hell's untouched
  saved = JSON.parse(localStorage.getItem(KEY));
  check((saved.progress[0].quests.a1q2 & (1 << F.REWARDPENDING)) !== 0 && !('a1q2' in saved.progress[1].quests) && !('a1q2' in saved.progress[2].quests), `saved as she died: ${JSON.stringify(saved.progress.map((x) => x.quests))}`);
  ticks(15);
  check(sis().last === 2, `the log turned before the timer: ${sis().last}`);
  ticks(1);
  check(sis().last === 3, `the log after sixteen quest ticks: ${sis().last}`);
  // the reward: a hireling for nothing, once; Kashya hires out before level 8 from then on
  game.enterArea(CAMP_AREA, 'waypoint');
  toKashya();
  const sReward = game.talkTo(kashya());
  check(sReward?.id === 'reward' && sReward.text.includes('斥候'), `back, Kashya says ${sReward?.id}`);
  if (sReward) game.npcSpoke(sReward);
  const st = p().merc;
  check(game.hasMerc() && st && !st.dead && game.merc?.kept === st && msgs.some((m) => m.includes('随你出征')), `the reward's hireling: ${JSON.stringify(st && { hire: st.hire, name: st.name, level: st.level })}, on the map ${!!game.merc}`);
  check(shas(F.REWARDGRANTED) && !shas(F.REWARDPENDING) && shas(F.STARTED) && shas(F.ENTERAREA) && sis().last === 13 && game.quests.log('a1q2').state === 'done' && !game.quests.hasNews('kashya'), `rewarded (D2 keeps the steps): word ${sword()}, status ${sis().last}`);
  check(mayHireNow(game) && p().level < 8, `the level-8 rule after the reward: ${mayHireNow(game)} at level ${p().level}`);
  // again: the speech under 交谈 in this visit, and nothing more handed over
  game.npcSpoke(sReward);
  const sAgain = game.npcTalk(kashya());
  check(game.talkTo(kashya()) === null && sAgain?.id === 'reward', `spoken to again: at once ${game.talkTo(kashya())?.id}, 交谈 ${sAgain?.id}`);
  if (sAgain) game.npcSpoke(sAgain);
  check(p().merc === st && game.merc?.kept === st && shas(F.REWARDGRANTED), 'the reward handed over twice');
  game.teleportWithin(pastGate());
  game.enterArea(CAMP_AREA, 'waypoint');
  toKashya();
  check(game.npcTalk(kashya()) === null && game.talkTo(kashya()) === null, 'back from out of the camp, Kashya repeats her reward');
  saved = JSON.parse(localStorage.getItem(KEY));
  check((saved.progress[0].quests.a1q2 & 1) === 1 && saved.merc?.hire === st.hire && saved.merc.name === st.name && !('a1q2' in saved.progress[1].quests) && !('a1q2' in saved.progress[2].quests), `saved with the reward: ${JSON.stringify({ quests: saved.progress.map((x) => x.quests), merc: saved.merc })}`);
  notes.push(`the Sisters given, missed from two rooms off, done from her diagonal room a game later, a free level ${st?.level} hireling once`);

  // ── a reload, the title: done stays done, the hireling not given again; nightmare's and hell's apart ──
  const DONE = (1 << F.REWARDGRANTED) | (1 << F.STARTED) | (1 << F.LEAVETOWN) | (1 << F.ENTERAREA);
  game.continueGame(undefined, true);
  check(!sis().playable && shas(F.REWARDGRANTED) && !game.quests.hasNews('kashya') && game.quests.log('a1q2').state === 'done' && p().merc?.name === st.name, `reloaded: word ${sword()}, playable ${sis().playable}`);
  game.continueGame(0);
  const r3 = raven();
  game.teleportWithin(game.level.map.nearestWalkable(r3.pos.x + 1, r3.pos.z));
  game.killMonster(r3, 'phys');
  check((sword() & ~(1 << F.UPDATEQUESTLOG)) === DONE && !game.quests.hasNews('kashya') && p().merc?.name === st.name, `from the title, killed again beside her: word ${sword()}`);
  game.enterArea(CAMP_AREA, 'waypoint');
  // nightmare: its own record; the den not done there, so not on offer; walked into without Kashya's
  // word it starts there; killed by the hireling beside the hero it is done (A1Q2.cpp:319-351 asks
  // not who); the hero has her, alive: no second hireling, and the rule lifted in nightmare too
  game.setDifficulty(1);
  check(sword(1) === 0 && sis().playable && sis().state === 0 && !game.quests.hasNews('kashya') && (sword(0) & 1) === 1, `nightmare: word ${sword(1)}, state ${sis().state}, normal ${sword(0)}`);
  game.teleportWithin(pastGate());
  const nm = raven();
  game.teleportWithin(game.level.map.nearestWalkable(nm.pos.x + 1, nm.pos.z));
  check(game.area.id === BURIAL_GROUNDS && shas(F.ENTERAREA, 1) && !shas(F.STARTED, 1) && sis().last === 2 && nm.difficulty === 1, `nightmare's Burial Grounds unasked: word ${sword(1)}, status ${sis().last}`);
  placeMerc(game);
  const her = game.merc;
  check(!!her && game.level.monsters.includes(nm) && roomOf(p().pos).join() === roomOf(nm.pos).join(), `the hireling beside the hero, in Blood Raven's room: ${!!her}`);
  game.killMonster(nm, 'phys', her);
  check(shas(F.REWARDPENDING, 1) && shas(F.PRIMARYGOALDONE, 1) && (sword(0) & ~(1 << F.UPDATEQUESTLOG)) === DONE, `killed by the hireling: nightmare ${sword(1)}, normal ${sword(0)}`);
  game.enterArea(CAMP_AREA, 'waypoint');
  toKashya();
  const nmReward = game.talkTo(kashya());
  if (nmReward) game.npcSpoke(nmReward);
  check(nmReward?.id === 'reward' && shas(F.REWARDGRANTED, 1) && p().merc?.name === st.name && msgs.at(-1).includes('已有佣兵') && mayHireNow(game), `nightmare's reward to a hero with a hireling: ${nmReward?.id}, word ${sword(1)}, ${msgs.at(-1)}`);
  // hell: a reward left waiting from an earlier game, the hireling dead by then: still none
  game.setDifficulty(2);
  p().quests[2].a1q2 = (1 << F.REWARDPENDING) | (1 << F.PRIMARYGOALDONE) | (1 << F.ENTERAREA);
  p().merc.dead = true;
  game.save();
  game.continueGame();
  check(p().difficulty === 2 && shas(F.COMPLETEDBEFORE) && !shas(F.PRIMARYGOALDONE) && !sis().playable && game.quests.hasNews('kashya') && game.quests.log('a1q2').state === 'reward', `hell's reward from an earlier game: word ${sword()}`);
  check(!mayHireNow(game), 'hell hires before its own reward');
  toKashya();
  const hellReward = game.talkTo(kashya());
  if (hellReward) game.npcSpoke(hellReward);
  check(hellReward?.id === 'reward' && shas(F.REWARDGRANTED) && !shas(F.REWARDPENDING) && p().merc?.dead === true && p().merc.name === st.name && msgs.at(-1).includes('已有佣兵') && mayHireNow(game), `hell's reward to a hero whose hireling is dead: ${hellReward?.id}, word ${sword()}, merc ${JSON.stringify(p().merc && { dead: p().merc.dead })}`);
  game.save();
  saved = JSON.parse(localStorage.getItem(KEY));
  check(saved.progress.every((x) => (x.quests.a1q2 & 1) === 1) && saved.merc?.dead === true && saved.merc.name === st.name, `each difficulty's reward saved, one hireling: ${JSON.stringify({ quests: saved.progress.map((x) => x.quests.a1q2), merc: saved.merc && { name: saved.merc.name, dead: saved.merc.dead } })}`);
  notes.push('the Sisters through a reload and the title; nightmare started in the Burial Grounds and done by the hireling, hell from an earlier game: no hireling to a hero with one, alive or dead');

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  flags and D2's new-game read; drops by the record; critters and neverCount left out; ${notes.join('; ')}; names and lines from the tables, on the review page`);
};
