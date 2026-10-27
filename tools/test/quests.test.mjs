// Quests (src/game/quests, D2MOO D2QuestRecord.cpp and QUESTS/ACT1/A1Q1.cpp at d9d394f): the
// record's flags and D2's reading of it for a new game; the Den of Evil played through Game from
// Akara's first word to her reward (once), the count said only for the den's own kills, started by
// walking in without her, its reward collected in a later game; each difficulty's record apart;
// saves keeping records (unknown quests too) and old saves loading with none; what counts in the
// den (not neverCount, only hostile); quest drops by the record (Andarielq); the names from the
// rename table; every line our own, filled, and on the review page.
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
  const { D2_MONSTER_OF, monsterLootTc } = await load('/src/game/loot.ts');
  const { MONSTERS } = await load('/src/data/monsters.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const { CAMP_AREA, WILD_AREA, DEN_OF_EVIL } = await load('/src/world/areas.ts');
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
  // D2R gives Andariel (the floor bosses' stand-in, quest 6 at checkpoint 1) Andarielq as her
  // regular class too, so for the test her regular one is another for a moment ──
  const andy = { def: MONSTERS.overlord, rank: 'boss', level: 30 };
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

  // ── what counts in a level (MonsterRegion.cpp) ──
  const as = (row) => {
    D2_MONSTER_OF.__test = row;
    const k = countsInLevel({ def: { id: '__test' } });
    delete D2_MONSTER_OF.__test;
    return k;
  };
  check(countsInLevel({ def: MONSTERS.zombie }) && countsInLevel({ def: { id: 'no_such_row' } }), 'hostile monsters, and ones with no row, count');
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
  const lines = [...Object.values(DLG.DEN_LINES), ...Object.values(DLG.DEN_LOG), ...Object.values(DLG.LOG_LINES), ...Object.values(DLG.GOSSIP).flat()];
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
  const review = fs.readFileSync(REVIEW, 'utf8');
  for (const line of lines) {
    const l = fillLine(line, { n: 3 });
    check(l.zh && l.en && !/[{}]/.test(l.zh + l.en), `a line unfilled or half there: ${JSON.stringify(l)}`);
    for (const o of official) check(!l.zh.includes(o), `an official name ${o}: ${l.zh}`);
    for (const o of officialEn) check(!l.en.includes(o), `an official name ${o}: ${l.en}`);
    check(!l.zh.includes('艾莉娜'), `the merchant's old name: ${l.zh}`);
    check(review.includes(l.zh), `not on the review page: ${l.zh}`);
  }
  check(review === (await reviewMarkdown(load)), 'the review page is behind the lines: node tools/dialogue-review.mjs');

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

  check(akara()?.npc === '亚珈萝' && game.quests.hasNews('akara') && word() === 0, `a new game: ${akara()?.npc}, news ${game.quests.hasNews('akara')}, word ${word()}`);
  check(game.quests.log('a1q1').state === 'none' && ACT1_QUESTS.filter((q) => q.key !== 'a1q1').every((q) => game.quests.log(q.key).state === 'off'), 'the log of a new hero');
  toAkara();
  const intro = game.talkTo(akara());
  check(intro?.id === 'intro' && intro.text.includes('邪秽巢穴'), `Akara's first words: ${intro?.id}`);
  check(game.npcTalk(akara())?.id?.startsWith('gossip'), 'before the quest is given, 交谈 is small talk');
  game.npcSpoke(intro);
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
  const points = p().skillPoints;
  game.npcSpoke(reward);
  check(p().skillPoints === points + 1 && has(F.REWARDGRANTED) && !has(F.REWARDPENDING) && !has(F.STARTED) && !has(F.ENTERAREA), `rewarded: ${points} → ${p().skillPoints} points, word ${word()}`);
  game.npcSpoke(reward);
  check(game.talkTo(akara()) === null && p().skillPoints === points + 1, 'the reward handed over twice');
  check(game.quests.log('a1q1').state === 'done' && !game.quests.hasNews('akara'), 'done in the log');
  check(game.quests.unseen().join() === 'a1q1', 'the log has the done quest to show');
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
  // the den kept from normal, its monsters dead there, doesn't finish nightmare's quest at the next kill
  game.killMonster(game.mapOf(WILD_AREA).monsters.find((m) => !m.dead), 'phys');
  check(!has(F.REWARDPENDING, 1) && monstersLeft(game.mapOf(DEN_OF_EVIL)) === 0, `nightmare's quest done by normal's dead: word ${word(1)}`);
  game.save();
  game.continueGame();
  game.enterArea(CAMP_AREA, 'waypoint');
  // walked into the den without Akara's word: the quest starts there (A1Q1.cpp:446-478)
  game.enterArea(DEN_OF_EVIL, 'stairs');
  check(has(F.ENTERAREA, 1) && !has(F.STARTED, 1) && den().last === 2 && !game.quests.hasNews('akara'), `nightmare's den unasked: word ${word(1)}, status ${den().last}`);
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

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  flags and D2's new-game read; drops by the record; critters and neverCount left out; ${notes.join('; ')}; names and lines from the tables, on the review page`);
};
