// The west block's dungeon data (src/data/d2x/maze.ts, objects.ts, monseq.ts, from tools/d2/maze.mjs)
// as the maze generator, the objects and the monster AI will read it, against values worked out by
// hand from D2R 2.7's tables (LvlMaze, Levels, ObjGroup, Objects, MonSeq) and D2MOO's rules: the
// rooms each dungeon grows to by difficulty, what a room rolls and how many it gets, what each
// object is and drops, and the sequences Blood Raven, the nests, the shamans and the skeletons play.
import assert from 'node:assert/strict';

export default async (load) => {
  const { D2X_MAZES: MAZE } = await load('/src/data/d2x/maze.ts');
  const { D2X_OBJGROUPS: GROUP, D2X_OBJECTS: OBJ } = await load('/src/data/d2x/objects.ts');
  const { D2X_MONSEQ: SEQ } = await load('/src/data/d2x/monseq.ts');
  const { D2X_MONSTERS: MON } = await load('/src/data/d2x/monsters.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');

  // ── the mazes (LvlMaze.txt) ──
  assert.deepEqual(Object.keys(MAZE).map(Number), [8, 9, 13, 18, 19]);
  // the Den of Evil: 1 room of 24×24 tiles in every difficulty, so the Prev and Corpsefire rooms make
  // it an L of 3 (dungeons.md 1.3); Cave Level 1: 4 basic rooms; merge 500 per mille
  assert.deepEqual([MAZE[8].rooms, MAZE[8].size, MAZE[8].merge], [[1, 1, 1], [24, 24], 500]);
  assert.deepEqual([MAZE[9].rooms, MAZE[9].size, MAZE[9].merge], [[4, 4, 4], [24, 24], 500]);
  // Cave Level 2 is one preset map (DrlgType 2): its row is never read, and says Merge 0
  assert.deepEqual([MAZE[13].drlg, MAZE[13].rooms, MAZE[13].merge], [2, [1, 1, 1], 0]);
  // the crypts grow with the difficulty: 12, 24, 36 rooms of 8×8 tiles
  for (const id of [18, 19]) assert.deepEqual([MAZE[id].drlg, MAZE[id].rooms, MAZE[id].size, MAZE[id].merge], [1, [12, 24, 36], [8, 8], 500], `maze ${id}`);
  for (const id of [8, 9]) assert.equal(MAZE[id].drlg, 1);

  // ── what a room rolls (Levels.txt ObjGrp/ObjPrb, Themes) ──
  const rolls = (id) => MAZE[id].objGroups.map((g) => [g.group, g.prob]);
  // the Den: Cave Wells 35, Rogues 45 — so 36 % and 46 % a room (rand % 100 ≤ prob)
  assert.deepEqual(rolls(8), [[6, 35], [4, 45]]);
  assert.deepEqual(rolls(9), [[6, 30], [4, 3]]);
  assert.deepEqual(rolls(13), [[6, 25]]);
  // the crypts: caskets 75, shrines 4, chests 50, barrels 75
  for (const id of [18, 19]) assert.deepEqual(rolls(id), [[7, 75], [8, 4], [9, 50], [10, 75]], `maze ${id}`);
  // themes: only the crypts have one (8, the item grid, which D2MOO never fires)
  assert.deepEqual([8, 9, 13, 18, 19].map((id) => MAZE[id].themes), [0, 0, 0, 8, 8]);
  // D2MOO makes a group's roll 100 by Objects.txt's row numbered like the group: 4 (LargeUrn) and 6
  // (LargeChestL) have a SubClass, 7–10 (Barrel, TowerTome, Urn2, Bench) none
  for (const id of [8, 9, 13]) assert.ok(MAZE[id].objGroups.every((g) => g.healSkip), `maze ${id} healSkip`);
  for (const id of [18, 19]) assert.ok(MAZE[id].objGroups.every((g) => !g.healSkip), `maze ${id} healSkip`);
  // traps and locks by the classic normal MonLvl (Den 1, caves 2, crypts 3): ⌊l/8⌋ + 5 and ⌊l/2⌋ + 8
  assert.deepEqual([8, 9, 13, 18, 19].map((id) => [MAZE[id].trap, MAZE[id].lock]), [[5, 8], [5, 9], [5, 9], [5, 9], [5, 9]]);
  const classic = new Map(D2X_AREAS.map((a) => [a.id, a.lvlClassic[0]]));
  for (const id of [8, 9, 13, 18, 19]) assert.equal(MAZE[id].lock, Math.floor(classic.get(id) / 2) + 8, `maze ${id} lock from D2X_AREAS`);

  // ── the groups (ObjGroup.txt) ──
  assert.deepEqual(Object.keys(GROUP).map(Number), [4, 6, 7, 8, 9, 10]);
  for (const g of Object.values(GROUP)) {
    assert.equal(g.objects.reduce((s, o) => s + o.prob, 0), 100, `group ${g.id} PROB`);
    for (const o of g.objects) assert.ok(OBJ[o.id], `group ${g.id}: object ${o.id}`);
  }
  assert.deepEqual(GROUP[6].objects.map((o) => o.id), [138, 275, 276, 277]);
  assert.deepEqual(GROUP[7].objects.map((o) => [o.id, o.prob]), [[3, 75], [28, 25]]);
  assert.deepEqual(GROUP[9].objects.map((o) => [o.id, o.density]), [[5, 48], [6, 48], [240, 30], [241, 30], [242, 30]]);
  // how many a room of 8×8 tiles (40×40 subtiles) gets: density × (1600 >> 7) >> 8 = density × 12 >> 8
  const perRoom = (d) => (d * ((40 * 40) >> 7)) >> 8;
  assert.equal(perRoom(GROUP[7].objects[0].density), 5, 'casket clusters');
  assert.equal(perRoom(GROUP[9].objects[0].density), 2, 'large chests');
  assert.equal(perRoom(GROUP[9].objects[2].density), 1, 'other chests');
  assert.equal(perRoom(GROUP[10].objects[0].density), 3, 'barrel clusters');
  assert.equal(perRoom(GROUP[4].objects[0].density), 1, 'rogue corpses');

  // ── the objects (Objects.txt) ──
  // everything an object names is in the table too
  for (const o of Object.values(OBJ)) {
    for (const c of [...(o.cluster ?? []), ...(o.becomes ?? []), ...(o.healAs ? [o.healAs] : [])]) assert.ok(OBJ[c], `object ${o.id} names ${c}`);
    if (o.flies) assert.ok(OBJ[103], 'flies');
    // the game names objects itself: no name of D2's rides along
    assert.ok(!('name' in o), `object ${o.id} has a name`);
  }
  const pick = (id, ...keys) => keys.map((k) => OBJ[id][k]);
  // a casket: 5×3 subtiles, clusters of caskets and holes, always drops (it stays shut on nothing),
  // 18.08 % a trap monster, and still blocks once opened
  assert.deepEqual(pick(3, 'kind', 'size', 'cluster', 'drop', 'trap', 'blocksOpen'), ['casket', [5, 3], [3, 28], 100, 'monster', true]);
  // the hole: a casket's operate function, but no PopulateFn — group 7's 25 % for it places nothing
  assert.deepEqual(pick(28, 'kind', 'populate', 'preOperate'), ['casket', 0, true]);
  // a barrel: broken by attacks, 1 in 14 already broken, 21 % a drop, the same trap monster chance
  assert.deepEqual(pick(7, 'kind', 'cluster', 'drop', 'trap', 'attackable', 'preOperate', 'space', 'blocksOpen'), ['barrel', [7, 11], 21, 'monster', true, true, [2, 2], undefined]);
  assert.deepEqual(pick(11, 'kind', 'drop', 'damage', 'populate'), ['explodingBarrel', undefined, 100, 0]);
  // rogue corpses: always drop, 29 % with flies, no longer in the way once searched
  for (const id of [54, 55, 56]) assert.deepEqual(pick(id, 'kind', 'drop', 'flies', 'blocks', 'blocksOpen'), ['corpse', 100, 29, true, undefined], `corpse ${id}`);
  // the crypts' chests: 75 % a drop, trapped and locked by the level's chances, a key for a locked one
  for (const id of [5, 6, 240, 241, 242]) assert.deepEqual(pick(id, 'kind', 'drop', 'trap', 'lockable', 'sparkly'), ['chest', 75, 'rolled', true, undefined], `chest ${id}`);
  // shrines by Parm0: the crypts' healthorama and mana well stand against a wall (Orientation 1); the
  // healing one a level must have is the cave's health shrine, the crypts' healthorama or healing well
  assert.deepEqual(pick(77, 'kind', 'shrine', 'orientation', 'healAs'), ['shrine', 'health', 1, 84]);
  assert.deepEqual(pick(165, 'kind', 'shrine', 'orientation', 'healAs'), ['shrine', 'mana', 1, 77]);
  assert.deepEqual([275, 276, 277].map((id) => pick(id, 'shrine', 'healAs')), [['health', 275], ['mana', 275], ['magic', 275]]);
  // the cave well: Parm 750, 128, 1, 3 — 2 uses, each back in 751 frames, half of life, mana and stamina
  assert.deepEqual(pick(138, 'kind', 'size', 'parm', 'well'), ['well', [4, 4], [750, 128, 1, 3], { uses: 2, regen: 30.04, restore: 0.5, life: true, mana: true }]);
  // the presets' chests: 580 and 581 become one of Act 1's 13, 580's sparkly; 397 is sparkly by its
  // InitFn and opens by its own rules
  const act1 = [5, 6, 139, 140, 141, 144, 176, 177, 198, 240, 241, 242, 243];
  assert.deepEqual(pick(580, 'kind', 'becomes', 'sparkly'), ['placeholder', act1, true]);
  assert.deepEqual(pick(581, 'kind', 'becomes', 'sparkly'), ['placeholder', act1, undefined]);
  for (const id of act1) assert.deepEqual(pick(id, 'kind', 'trap', 'lockable'), ['chest', 'rolled', true], `chest ${id}`);
  assert.deepEqual(pick(397, 'kind', 'init', 'sparkly', 'consolation', 'drop', 'lockable'), ['chest', 57, true, true, 100, true]);
  // a placeholder never stands in the world itself
  for (const id of [580, 581]) assert.deepEqual(pick(id, 'selectable', 'blocks'), [undefined, undefined]);
  // Stony Field's Cairn Stones: five to click (OperateFn 9) and StoneTheta; its Tower Tome
  for (const id of [17, 18, 19, 20, 21]) assert.deepEqual(pick(id, 'kind', 'size', 'selectable'), ['stone', [3, 3], true], `stone ${id}`);
  assert.deepEqual(pick(22, 'kind', 'selectable'), ['none', undefined]);
  assert.equal(OBJ[8].kind, 'tome');

  // ── the sequences (MonSeq.txt) ──
  assert.deepEqual(Object.keys(SEQ).sort(), ['seq_bloodravencast', 'seq_brquickstrike', 'seq_nestlay', 'seq_shamanresurrect', 'seq_skeletonraise']);
  const MODES = new Set(['DT', 'NU', 'WL', 'GH', 'A1', 'A2', 'BL', 'SC', 'S1', 'S2', 'S3', 'S4', 'DD', 'KB', 'RN']);
  for (const [name, s] of Object.entries(SEQ)) {
    for (const [mode] of s.frames) assert.ok(MODES.has(mode), `${name}: mode ${mode}`);
    for (const e of s.events) assert.ok(e.at >= 0 && e.at < s.frames.length, `${name}: event at ${e.at}`);
  }
  const run = (mode, from, to) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => [mode, from < to ? from + i : from - i]);
  // Blood Raven's Quick Strike is one arrow, not three: A1 frames 0–6 and a single missile event on
  // the last (monseq.json rows 305–311)
  assert.deepEqual(SEQ.seq_brquickstrike, { frames: run('A1', 0, 6), events: [{ at: 6, type: 'missile' }] });
  // her summoning: S1 0–19, the zombie made on row 15 (three quarters in)
  assert.deepEqual(SEQ.seq_bloodravencast, { frames: run('S1', 0, 19), events: [{ at: 15, type: 'skill' }] });
  // a crow nest lays on row 25 of S1 0–30; a shaman raises on row 12 of A2 0–16
  assert.deepEqual(SEQ.seq_nestlay, { frames: run('S1', 0, 30), events: [{ at: 25, type: 'skill' }] });
  assert.deepEqual(SEQ.seq_shamanresurrect, { frames: run('A2', 0, 16), events: [{ at: 12, type: 'missile' }] });
  // a skeleton rises by its death backwards, DT 10 down to 0, with no event
  assert.deepEqual(SEQ.seq_skeletonraise, { frames: run('DT', 10, 0), events: [] });
  // each of these monsters' sequence skills finds its sequence
  for (const id of ['bloodraven', 'crownest1', 'fallenshaman1', 'skeleton1']) {
    for (const s of MON[id].skills) if (s.mode.startsWith('seq_')) assert.ok(SEQ[s.mode], `${id} ${s.skill}: ${s.mode}`);
  }
  assert.deepEqual(MON.bloodraven.skills.map((s) => s.mode), ['seq_bloodravencast', 'seq_brquickstrike']);
};
