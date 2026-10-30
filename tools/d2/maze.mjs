// The dungeon stage → src/data/d2x/maze.ts, objects.ts and monseq.ts: what the west block's dungeons
// are laid out and furnished from, and how its monsters' skills play.
// - LvlMaze.txt's rows for the Den of Evil, Cave Levels 1 and 2, the Crypt and the Mausoleum
//   (Levels.txt 8, 9, 13, 18, 19), with the object groups each of their rooms rolls (Levels.txt
//   ObjGrp/ObjPrb, Themes) and what their chests' traps and locks roll;
// - those groups (ObjGroup.txt) and the objects they and the west block's map presets place
//   (Objects.txt): size, the populate, init and operate functions D2 dispatches on, Parm, lock, trap
//   and what kind of container each is;
// - the sequences (MonSeq.txt) the west block's monsters play for their skills: Blood Raven's
//   summoning and Quick Strike, the nest's laying, the shamans' raising, a skeleton's rising;
// - the shrines (Shrines.txt → shrines.ts): every row, what a shrine object rolls its kind among and
//   what each kind does, with our names (tools/d2-names/shrines.json); the four shrines an Act 1
//   wilderness area's shrine cells hold (LvlSub type 5), which the old wilderness's shrines are
//   made as too.
// Every row as D2R 2.7 has it (load(REF27, …), see rows27 in load.mjs). The generated files carry
// their own types, which say what each field means in D2MOO's game code.
//
// The west block is what the camp reaches without the Underground Passage (Levels.txt 10, the only
// way east, world.mjs OUTDOOR): the camp, Blood Moor, Cold Plains, Stony Field, Burial Grounds and
// the dungeons under them.
//
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f, by file and line.
import { REF27, list, load, record, rows, writeD2x } from './load.mjs';
import { names } from './names.mjs';

/** the dungeons M2a builds, by Levels.txt id: the Den of Evil, Cave Levels 1 and 2, the Crypt, the Mausoleum */
const MAZE_LEVELS = [8, 9, 13, 18, 19];
const CAMP = 1;
/** the Underground Passage's first level, behind Stony Field's cliff: the west block ends at its door */
const PASSAGE = 10;

/**
 * Monsters the west block's map presets place that no area's lists name: Blood Raven, at her
 * placeholder (MonPreset act 1 place_bloodraven, D2MOO MonsterRegion.cpp:292-295) in Burial Grounds,
 * whose inside is the graveyard preset (DrlgOutWild.cpp:586-588). The superuniques come with their
 * areas (D2xArea.superuniques).
 */
const PLACED = { 17: ['bloodraven'] };
/** the Act 1 hireling, hired in the camp */
const HIRELING = 'roguehire';

/**
 * Objects the west block's map presets place, as far as the code and the research tell (the DS1 maps
 * are not in d2data):
 * - 580 PlaceUniqueChest: a sparkly chest of the act's kinds — Cave Level 2's treasure (lvlprest 104
 *   CaveRoom2.ds1), as the M2a decisions have it;
 * - 581 PlaceRandomTreasureChest: a chest of the act's kinds, what the caves' presets hold;
 * - 397 the sparkly chest the Mausoleum's chest room holds (Crypt*Consol.ds1): the Maggot Lair reuses
 *   that preset (DrlgMaze.cpp:550-557) and spawns Lilith at its 397 (SUnit.cpp:1124-1135);
 * - Stony Field's Cairn Stones, StoneAlpha…StoneLambda and StoneTheta (cairn2.ds1, lvlprest 160), and
 *   its Tower Tome (tome.ds1, lvlprest 162): DrlgOutWild.cpp:491-494.
 */
const PRESET_OBJECTS = [580, 581, 397, 17, 18, 19, 20, 21, 22, 8];
/**
 * Objects the game has of its own making that D2 has as objects too, for the size the hero reaches
 * them by (UNITS_IsObjectInInteractRange, D2Common Units.cpp:3604-3684; src/game/reach.ts): the town
 * portal (59 TownPortal), the Act 1 waypoint outside and inside (119 WaypointOutsideAct1, 157
 * WaypointInsideAct1) and the stash (267 Bank)
 */
const REACH_OBJECTS = [59, 119, 157, 267];

/**
 * The preset placeholders (Objects.txt 574–582 stand for others, OBJECTS_SpawnPresetObject,
 * Objects.cpp:215-249) and what an Act 1 one becomes: one of the act's thirteen chests, picked at
 * random (OBJECTS_SpawnPresetChest, Objects.cpp:103-169, the list at 146-155); 580's is made sparkly
 * (OBJECTS_SpawnSpecialChest, 172-202; in the Maggot Lair only 51 % of the time).
 */
const ACT1_CHESTS = [5, 6, 139, 140, 141, 144, 176, 177, 198, 240, 241, 242, 243];
const PLACEHOLDERS = { 580: { becomes: ACT1_CHESTS, sparkly: true }, 581: { becomes: ACT1_CHESTS } };

/**
 * What a PopulateFn makes its clusters of (D2MOO Objects.cpp): PopulateFn1 a fixed set by the object
 * it is given, each one picked at random, and nothing for any other object (972-1166, the sets at
 * 976-1008, nothing at 1065-1068); PopulateFn4 barrels by the barrel's own row whatever the group
 * names, the first of a cluster exploding one time in 3, the rest one in 4 (1647, 1666, 1708).
 */
const CLUSTER = {
  1: [79, 53, 1],
  3: [3, 28],
  4: [4, 9, 52, 94, 95],
  79: [79, 53, 1],
  89: [89, 284],
  208: [208, 209],
  209: [208, 209],
};
const BARRELS = [7, 11];
function clusterOf(r) {
  if (r.PopulateFn === 4) return BARRELS;
  if (r.PopulateFn !== 1) return undefined;
  if (!CLUSTER[r['*ID']]) throw new Error(`objects ${r['*ID']}: PopulateFn1 places nothing for it`);
  return CLUSTER[r['*ID']];
}
/** PopulateFn6 puts flies on a rogue's corpse when rand % 100 > 70 (Objects.cpp:1417): 29 % */
const FLIES = { object: 103, pct: 29 };
/** a shrine that must be the level's healing one becomes its Parm1, or the healing well when that is 0 (Objects.cpp:1594-1606) */
const HEALING_WELL = 84;
/** the object classes the game code knows (D2MOO NUM_OBJECTS, Objects.cpp:373-377): the rows past it are placeholders */
const NUM_OBJECTS = 573;

/** OperateFn → what using the object does (D2MOO's operate table, ObjMode.cpp:79-157) */
const OPERATE = {
  0: 'none',
  1: 'casket',
  2: 'shrine',
  3: 'urn',
  4: 'chest',
  5: 'barrel',
  6: 'tome',
  7: 'explodingBarrel',
  9: 'stone',
  11: 'torch',
  14: 'corpse',
  15: 'portal',
  22: 'well',
  23: 'waypoint',
  32: 'stash',
};
/**
 * % of uses that drop the area's chest class, by kind (OBJMODE_DropFromChestTCWithQuality): a
 * casket only opens on a drop (ObjMode.cpp:2450), a corpse always drops (2596), a chest 75 % —
 * always when locked or sparkly (1296), an urn and a barrel on rand % 100 ≤ 20 (2568, 2816).
 */
const DROP = { casket: 100, corpse: 100, chest: 75, urn: 21, barrel: 21 };
/** InitFns that roll a trap when the object appears (urn 2, chest 3, sparkly chest 57: Objects.cpp:613-704) */
const TRAP_INIT = new Set([2, 3, 57]);
/**
 * The fires a trapped chest's trap of kind 5 or 7 lights, the large one on the chest and the small one a
 * subtile along x (D2GAME_OBJECTS_TrapHandler5_7, ObjMode.cpp:1081-1102: OBJECT_FIRE_LARGE 162,
 * OBJECT_FIRE_SMALL 160)
 */
const TRAP_FIRES = [162, 160];
/** OperateFns that raise a trap monster on 18.08 % of openings (casket 1, barrel 5: ObjMode.cpp:2458, 2810) */
const TRAP_OPERATE = new Set([1, 5]);
/** the InitFn that marks a spark chest (OBJECTS_InitFunction57_SparklyChest, Objects.cpp:671-704) */
const SPARKLY_INIT = 57;
/** the class the chest operate function opens by its own rules (ObjMode.cpp:1294, 1327-1541) */
const CONSOLATION = 397;
/** the population handler skips objects whose Gore is above the setting, 2 (Objects.cpp:2128) */
const GORE_MAX = 2;

/**
 * The kinds of object the game sets down and shows a hover name for (src/game/level.ts): their
 * Objects.txt Name string keys get our names from tools/d2-names/objects.json (rule 5), and so does
 * lockedchest, the string a locked chest hovers with. D2CE has no object strings: the official
 * English and Chinese they were written against are the names file's (D2R 2.7's objects.json).
 * A shrine is called by the shrine it is (D2X_SHRINES, its names from tools/d2-names/shrines.json);
 * the Cairn Stones and the Tower Tome are named with their quests (M2b).
 */
const NAMED_KINDS = new Set(['chest', 'barrel', 'explodingBarrel', 'casket', 'corpse', 'well']);
const LOCKED_CHEST = 'lockedchest';

/** MonSeq.txt's events (SequenceTbls.h:8-15) */
const SEQ_EVENT = { 1: 'melee', 2: 'missile', 3: 'sound', 4: 'skill' };

/**
 * The shrines InitFn01 makes another as it sets a shrine's kind (Objects.cpp:531-544): the two
 * exchange shrines the health and the mana shrine, the Enirhs shrine the gem shrine. No shrine ends
 * as one of these, nor as the null shrine 0 (effect class 0 is never asked for: OBJECTS_GetShrineId
 * takes class 0 as 2, Objects.cpp:554-557; Parm0 0 picks from row 1 on, 522), so they get no names.
 */
const SHRINE_BECOMES = { 4: 2, 5: 3, 16: 18 };
/**
 * The Act 1 wilderness's shrine cells (DRLGOUTDOORS_SpawnAct12Shrines(pLevel, 5), DrlgOutWild.cpp:
 * 217-220, for Blood Moor (2) to Tamoe Highland (7)): five cells a level, the first taking a sub of
 * the level's SubShrine LvlSub type (5) picked by rand & 3, each next one the next, round the four
 * (DrlgOutdoors.cpp:577-646; the sub by its flag bit, DrlgOutPlace.cpp:2675-2681, DrlgTileSub.cpp:
 * 299-357). Each sub's DS1 holds a shrine object, known here by the sub's name: the DS1 maps aren't in
 * d2data.
 */
const WILD_SHRINES = { levels: [2, 3, 4, 5, 6, 7], cells: 5, subType: 5 };
const WILD_SHRINE_SUBS = [
  ['Healing Well', 'HealingWell'],
  ['Deer Shrine', 'DeerShrine'],
  ['Forest Shrine', 'ForestAltar'],
  ['Horn Shrine', 'HornShrine'],
];

// ───────────────────────── columns ─────────────────────────
// Every column of every table read, taken or not, so a new one fails the import instead of being dropped.
const per8 = (base, from = 0) => [0, 1, 2, 3, 4, 5, 6, 7].slice(from).map((i) => `${base}${i}`);
/** LvlMaze.txt: what D2MOO loads, Level, Rooms×3, SizeX, SizeY and Merge (LevelsTbls.cpp:767-782), with the name and row; expansion marks the rows the expansion added */
const MAZE_COLS = new Set(['Name', 'Level', 'Rooms', 'Rooms(N)', 'Rooms(H)', 'SizeX', 'SizeY', 'Merge', 'lineNumber', 'expansion']);
/** ObjGroup.txt (ObjectsTbls.cpp:209-243; D2R has no SHRINES, WELLS) */
const GROUP_COLS = new Set(['GroupName', '*ID', ...per8('ID'), ...per8('DENSITY'), ...per8('PROB'), 'expansion']);
/** MonSeq.txt (SequenceTbls.cpp:1297-1329; D2R has no dir) */
const SEQ_COLS = new Set(['sequence', 'mode', 'frame', 'event']);
/** Objects.txt columns taken into the data */
const OBJ_TAKEN = [
  '*ID', 'Class', 'Name', '*Description', 'SizeX', 'SizeY', 'Xspace', 'Yspace', 'SubClass', 'PopulateFn', 'InitFn', 'OperateFn',
  'Parm0', 'Parm1', 'Parm2', 'Parm3', 'Parm4', 'Orientation', 'Selectable0', 'HasCollision0', 'HasCollision1', 'IsAttackable0',
  'PreOperate', 'Lockable', 'Damage',
];
/** Objects.txt columns not taken, and why */
const OBJ_IGNORED = [
  [
    [
      'Token', 'Draw', 'Red', 'Green', 'Blue', 'HD', 'TR', 'LG', 'RA', 'LA', 'RH', 'LH', 'SH', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8',
      'TotalPieces', 'Xoffset', 'Yoffset', 'NameOffset', 'Overlay', 'DrawUnder', 'Left', 'Top', 'Width', 'Height', 'ClientFn', 'Sync',
      'EnvEffect', 'AutoMap', ...per8('FrameCnt'), ...per8('FrameDelta'), ...per8('CycleAnim'), ...per8('Lit'), ...per8('BlocksLight'),
      ...per8('Start'), ...per8('OrderFlag'), ...per8('Mode'),
    ],
    'how the client draws, lights and animates it, and its automap cell: the game draws its own',
  ],
  [[...per8('Selectable', 1), ...per8('HasCollision', 2)], 'its later modes: the game keeps an object’s state itself (an opened container is spent, a well has uses)'],
  [['IsDoor', 'BlocksVis', 'BlockMissile', 'CollisionSubst', 'OpenWarp'], 'doors, sight and missiles (Units.cpp:512-533): none of these is a door, and the game’s props decide what stops a missile'],
  [['MonsterOK'], 'whether a monster may operate it (doors, ObjMode.cpp:2994): no monster opens a container'],
  [['Restore', 'RestoreVirgins'], 'how D2 brings it back when a room it left is loaded again (SUnitInactive.cpp:732-737): the game keeps a level whole'],
  [['ShrineFunction'], 'D2MOO’s game code reads it nowhere'],
  [['Gore'], `the population handler skips objects above ${GORE_MAX} (Objects.cpp:2128); checked below, so not needed`],
  [['expansion'], 'marks the rows the expansion added'],
];
const OBJ_COLS = new Set([...OBJ_TAKEN, ...OBJ_IGNORED.flatMap(([cols]) => cols)]);
/** Shrines.txt columns taken into the data (D2MOO loads Code, Arg0, Arg1, Duration in frames, reset time in minutes, rarity, the two strings, effectclass and LevelMin: ObjectsTbls.cpp:257-275) */
const SHRINE_TAKEN = ['Code', 'Name', 'StringName', 'effectclass', 'LevelMin', 'Arg0', 'Arg1', 'Duration in frames', 'reset time in minutes'];
/** Shrines.txt columns not taken, and why */
const SHRINE_IGNORED = [
  [['rarity'], 'D2MOO loads it (ObjectsTbls.cpp:266, D2ShrinesTxt nRarity) and reads it nowhere'],
  [
    ['StringPhrase'],
    'the line D2 shows over a shrine as it is used (string 3683 + its kind, ObjMode.cpp:2391-2402): the game says what the blessing does in words of its own, an official line not being ours to show',
  ],
  [['*Shrine Type', '*Effect'], 'the table’s own notes'],
  [['lineNumber'], 'd2data’s row number'],
];
const SHRINE_COLS = new Set([...SHRINE_TAKEN, ...SHRINE_IGNORED.flatMap(([cols]) => cols)]);
/** LvlSub.txt: the rows of a type, in order, each a sub by its DS1; read for the wilderness's shrine subs (Type, Name), the rest how D2 lays a sub's tiles, which the game doesn't */
const LVLSUB_COLS = new Set([
  'Name', 'Type', 'File', 'CheckAll', 'BordType', 'GridSize', 'Dt1Mask', ...[0, 1, 2, 3, 4].flatMap((i) => [`Prob${i}`, `Trials${i}`, `Max${i}`]), 'expansion',
]);
function columns(table, rs, known) {
  const unknown = new Set();
  for (const r of rs) for (const k of Object.keys(r)) if (!known.has(k)) unknown.add(k);
  if (unknown.size) throw new Error(`${table}: columns with no rule: ${[...unknown].join(', ')}`);
}

export async function buildMaze({ areas, monsters, superuniques }) {
  const [mazeJ, levelsJ, groupJ, objectsJ, seqJ, modeJ, shrinesJ, lvlsubJ] = await Promise.all(
    ['lvlmaze', 'levels', 'objgroup', 'objects', 'monseq', 'monmode', 'shrines', 'lvlsub'].map((n) => load(REF27, n)),
  );
  const mazeRows = rows(mazeJ);
  const groupRows = rows(groupJ);
  const objectRows = rows(objectsJ);
  // (d2data keys MonSeq by row, so the values come in file order)
  const seqRows = rows(seqJ);
  const shrineRows = rows(shrinesJ);
  const lvlsubRows = rows(lvlsubJ);
  columns('lvlmaze', mazeRows, MAZE_COLS);
  columns('objgroup', groupRows, GROUP_COLS);
  columns('objects', objectRows, OBJ_COLS);
  columns('monseq', seqRows, SEQ_COLS);
  columns('shrines', shrineRows, SHRINE_COLS);
  columns('lvlsub', lvlsubRows, LVLSUB_COLS);
  const LEVEL = new Map(rows(levelsJ).map((r) => [r.Id, r]));
  // objects by *ID, D2's class: d2data keys them by file row, one past it after the Expansion divider it leaves out
  const OBJ = new Map(objectRows.map((r) => [r['*ID'], r]));
  const GROUP = new Map(groupRows.map((r) => [r['*ID'], r]));

  // ───────────────────────── mazes ─────────────────────────
  // D2 takes a level's first row in file order (LevelsTbls.cpp:791-806). d2data keys LvlMaze by Level,
  // which would keep one of two rows of a level, and leaves out the Expansion divider: every row it
  // leaves out must come after the ones read.
  const lines = new Set(mazeRows.map((r) => r.lineNumber));
  const gaps = [];
  for (let i = 0; i <= Math.max(...lines); i++) if (!lines.has(i)) gaps.push(i);
  const mazes = {};
  const usedGroups = new Set();
  for (const id of MAZE_LEVELS) {
    const where = `lvlmaze ${id}`;
    const m = mazeRows.find((r) => r.Level === id);
    if (!m) throw new Error(`${where}: no row`);
    if (gaps.some((g) => g < m.lineNumber)) throw new Error(`${where}: a row d2data left out comes before it (line ${gaps.find((g) => g < m.lineNumber)})`);
    const lv = LEVEL.get(id);
    if (!lv) throw new Error(`levels ${id}: no row`);
    const objGroups = [];
    for (let i = 0; i < 8; i++) {
      const group = lv[`ObjGrp${i}`] ?? 0;
      // group 0 is none (Objects.cpp:2113)
      if (!group) continue;
      const o = { group, prob: lv[`ObjPrb${i}`] ?? 0 };
      // D2MOO sets the roll to 100 by the SubClass of the object row numbered like the group (Objects.cpp:2108-2111)
      if (OBJ.get(group)?.SubClass) o.healSkip = true;
      objGroups.push(o);
      usedGroups.add(group);
    }
    // the classic game's normal MonLvl, whatever the difficulty: wMonLvl[0] (Objects.cpp:613-668, LevelsTbls.cpp:97)
    const mlvl = lv.MonLvl ?? 0;
    mazes[id] = {
      id,
      key: m.Name,
      drlg: lv.DrlgType,
      rooms: [m.Rooms, m['Rooms(N)'], m['Rooms(H)']].map((n) => n ?? 0),
      size: [m.SizeX ?? 0, m.SizeY ?? 0],
      merge: m.Merge ?? 0,
      objGroups,
      themes: lv.Themes ?? 0,
      trap: Math.floor(mlvl / 8) + 5,
      lock: Math.floor(mlvl / 2) + 8,
    };
  }

  // ───────────────────────── object groups ─────────────────────────
  // D2 indexes ObjGroup by compiled row (ObjectsTbls.cpp:246-254); *ID is that row only while no row is missing before it
  const groups = {};
  const wanted = new Map();
  const want = (id, from) => {
    if (!OBJ.has(id)) throw new Error(`${from}: object ${id} is not in objects.txt`);
    if (!wanted.has(id)) wanted.set(id, from);
  };
  for (const g of [...usedGroups].sort((a, b) => a - b)) {
    const where = `objgroup ${g}`;
    for (let i = 0; i <= g; i++) if (!GROUP.has(i)) throw new Error(`${where}: row ${i} is missing before it, so *ID is not its index`);
    const r = GROUP.get(g);
    if (r.expansion) throw new Error(`${where}: an expansion row`);
    const objects = [];
    // the members up to the first empty one: D2 stops there (Objects.cpp:2123)
    for (let i = 0; i < 8 && r[`ID${i}`]; i++) {
      const o = { id: r[`ID${i}`], density: r[`DENSITY${i}`] ?? 0, prob: r[`PROB${i}`] ?? 0 };
      if (o.density >= 128) throw new Error(`${where}: density ${o.density} (D2 asserts below 128, Objects.cpp:2141)`);
      want(o.id, where);
      objects.push(o);
    }
    if (objects.reduce((s, o) => s + o.prob, 0) > 100) throw new Error(`${where}: PROB adds up past 100`);
    groups[g] = { id: g, key: r.GroupName, objects };
  }
  // every member must be one the population handler places at all
  for (const g of Object.values(groups)) for (const o of g.objects) if ((OBJ.get(o.id).Gore ?? 0) > GORE_MAX) throw new Error(`objgroup ${g.id}: object ${o.id} has Gore above ${GORE_MAX}`);
  for (const id of PRESET_OBJECTS) want(id, 'a west block preset');
  for (const id of REACH_OBJECTS) want(id, 'an object the hero reaches by its size');

  // ───────────────────────── shrines ─────────────────────────
  // D2 indexes Shrines.txt by row and dispatches on its Code (DATATBLS_GetShrinesTxtRecord,
  // ObjectsTbls.cpp:278-283; ObjMode.cpp:2404-2421): they must be one
  shrineRows.forEach((r, i) => {
    if ((r.Code ?? 0) !== i) throw new Error(`shrines row ${i}: Code ${r.Code}`);
  });
  const shrineNames = names('shrines');
  const shrines = shrineRows.map((r, i) => {
    const s = { code: i, key: r.StringName, en: r.Name ?? '' };
    if (i > 0 && !(i in SHRINE_BECOMES)) {
      const n = shrineNames.named(r.StringName, r.Name);
      if (!n) throw new Error(`shrines ${i}: no names for ${r.StringName} in tools/d2-names/shrines.json`);
      Object.assign(s, n);
    }
    s.effectClass = r.effectclass ?? 0;
    s.levelMin = r.LevelMin ?? 0;
    s.arg0 = r.Arg0 ?? 0;
    s.arg1 = r.Arg1 ?? 0;
    s.frames = r['Duration in frames'] ?? 0;
    s.reset = r['reset time in minutes'] ?? 0;
    return s;
  });
  // (each becomes one of its own effect class, so what a shrine object can be stays its Parm0's)
  for (const [from, to] of Object.entries(SHRINE_BECOMES)) if (shrines[from].effectClass !== shrines[to].effectClass) throw new Error(`shrines ${from} becomes ${to}, of another effect class`);
  // the wilderness's shrine subs: the levels' SubShrine type, its rows in order, each the object its name says
  const subs = lvlsubRows.filter((r) => r.Type === WILD_SHRINES.subType && !r.expansion);
  if (subs.map((r) => r.Name).join() !== WILD_SHRINE_SUBS.map(([n]) => n).join()) throw new Error(`lvlsub type ${WILD_SHRINES.subType}: ${subs.map((r) => r.Name).join(', ')}`);
  for (const id of WILD_SHRINES.levels) if (LEVEL.get(id)?.SubShrine !== WILD_SHRINES.subType) throw new Error(`levels ${id}: SubShrine ${LEVEL.get(id)?.SubShrine}`);
  const byClass = new Map(objectRows.map((r) => [r.Class, r]));
  const wildShrines = WILD_SHRINE_SUBS.map(([sub, cls]) => {
    const r = byClass.get(cls);
    if (!r || r.OperateFn !== 2) throw new Error(`lvlsub ${sub}: no shrine object ${cls}`);
    want(r['*ID'], `the wilderness's shrine sub ${sub}`);
    return r['*ID'];
  });

  // ───────────────────────── objects ─────────────────────────
  // and what those bring along: cluster companions, flies, a shrine's healing self, a placeholder's chests
  for (let grew = true; grew; ) {
    const n = wanted.size;
    for (const id of [...wanted.keys()]) {
      const r = OBJ.get(id);
      for (const c of clusterOf(r) ?? []) want(c, `cluster of ${id}`);
      if (r.PopulateFn === 6) want(FLIES.object, `flies on ${id}`);
      if (r.OperateFn === 2) want(healAs(r), `healing shrine of ${id}`);
      for (const c of PLACEHOLDERS[id]?.becomes ?? []) want(c, `placeholder ${id}`);
      if (TRAP_INIT.has(r.InitFn)) for (const f of TRAP_FIRES) want(f, `the fire trap of ${id}`);
    }
    grew = wanted.size > n;
  }
  const objects = {};
  for (const id of [...wanted.keys()].sort((a, b) => a - b)) {
    const r = OBJ.get(id);
    const where = `objects ${id}`;
    const op = r.OperateFn ?? 0;
    if (!(op in OPERATE)) throw new Error(`${where}: OperateFn ${op} has no kind here`);
    if (id >= NUM_OBJECTS && !PLACEHOLDERS[id]) throw new Error(`${where}: a placeholder with no rule`);
    const kind = PLACEHOLDERS[id] ? 'placeholder' : OPERATE[op];
    const o = { id, key: r.Class, nameKey: r.Name, desc: String(r['*Description'] ?? '').replace(/^"|"$/g, '') };
    o.size = [r.SizeX ?? 0, r.SizeY ?? 0];
    if (r.Xspace || r.Yspace) o.space = [r.Xspace ?? 0, r.Yspace ?? 0];
    if (r.SubClass) o.subclass = r.SubClass;
    o.populate = r.PopulateFn ?? 0;
    o.init = r.InitFn ?? 0;
    o.operate = op;
    const parm = [0, 1, 2, 3, 4].map((i) => r[`Parm${i}`] ?? 0);
    while (parm.length && !parm[parm.length - 1]) parm.pop();
    if (parm.length) o.parm = parm;
    o.orientation = r.Orientation ?? 0;
    // a placeholder is never a unit: what it becomes is clicked, blocks and breaks
    if (kind !== 'placeholder') {
      if (r.Selectable0) o.selectable = true;
      if (r.HasCollision0) o.blocks = true;
      if (r.HasCollision1) o.blocksOpen = true;
      if (r.IsAttackable0) o.attackable = true;
      if (r.PreOperate) o.preOperate = true;
    }
    o.kind = kind;
    const sparkly = o.init === SPARKLY_INIT || !!PLACEHOLDERS[id]?.sparkly;
    // a spark chest always drops (ObjMode.cpp:1296), 397's rules too (1327-1541)
    if (DROP[kind] !== undefined) o.drop = sparkly ? 100 : DROP[kind];
    if (TRAP_INIT.has(o.init)) o.trap = 'rolled';
    else if (TRAP_OPERATE.has(op)) o.trap = 'monster';
    if (r.Lockable) o.lockable = true;
    if (sparkly) o.sparkly = true;
    if (id === CONSOLATION) o.consolation = true;
    if (clusterOf(r)) o.cluster = clusterOf(r);
    if (o.populate === 6) o.flies = FLIES.pct;
    if (kind === 'shrine') {
      // InitFn 1 by Parm0 (Objects.cpp:489-548): 1 a health shrine, 2 a mana one, else a boon (or, one in
      // ten, a special one: effect classes 4 and 1); 0 any shrine of the area's level
      if (o.init !== 1) throw new Error(`${where}: a shrine whose InitFn is ${o.init}`);
      const p0 = r.Parm0 ?? 0;
      o.shrine = p0 === 0 ? 'any' : p0 === 1 ? 'health' : p0 === 2 ? 'mana' : 'magic';
      o.healAs = healAs(r);
    }
    if (kind === 'well') {
      // InitFn 16 gives 2 × Parm2 uses (Objects.cpp:601-604); each comes back Parm0 + 1 frames after it
      // is spent (ObjMode.cpp:3802, 265-306); a use restores Parm1/256 of life (Parm3 & 2), mana
      // (Parm3 & 1) and stamina (3729-3770)
      if (o.init !== 16) throw new Error(`${where}: a well whose InitFn is ${o.init}`);
      const [p0, p1, p2, p3] = [0, 1, 2, 3].map((i) => r[`Parm${i}`] ?? 0);
      o.well = { uses: 2 * p2, regen: (p0 + 1) / 25, restore: p1 / 256, life: !!(p3 & 2), mana: !!(p3 & 1) };
    }
    if (PLACEHOLDERS[id]) o.becomes = PLACEHOLDERS[id].becomes;
    if (kind === 'explodingBarrel' || kind === 'torch') o.damage = r.Damage ?? 0;
    objects[id] = o;
  }
  // their hover names, by string key: every kind the game shows, a locked chest's own (NAMED_KINDS)
  const objNames = names('objects');
  const objectNames = {};
  const nameOf = (key, where) => {
    if (objectNames[key]) return;
    const n = objNames.named(key, objNames.en(key));
    if (!n) throw new Error(`${where}: no names for its string ${key} in tools/d2-names/objects.json`);
    objectNames[key] = { ...n, en: objNames.en(key) };
  };
  for (const o of Object.values(objects)) {
    if (!NAMED_KINDS.has(o.kind)) continue;
    nameOf(o.nameKey, `objects ${o.id}`);
    if (o.lockable) nameOf(LOCKED_CHEST, `objects ${o.id} locked`);
  }
  // a group's member with no PopulateFn places nothing (Objects.cpp:2132-2148): only clusters bring it
  for (const g of Object.values(groups)) {
    for (const m of g.objects) if (!objects[m.id].populate && !Object.values(objects).some((o) => o.cluster?.includes(m.id))) throw new Error(`objgroup ${g.id}: object ${m.id} is never placed`);
  }

  // ───────────────────────── monster sequences ─────────────────────────
  // the west block: from the camp over walked joins and warps, short of the Underground Passage
  const byId = new Map(areas.map((a) => [a.id, a]));
  const west = new Set([CAMP]);
  for (const q = [CAMP]; q.length; ) {
    const a = byId.get(q.shift());
    for (const t of [...(a.walk ?? []), ...(a.warps ?? []).map((w) => w.to)]) {
      if (t === PASSAGE || west.has(t)) continue;
      west.add(t);
      q.push(t);
    }
  }
  for (const id of MAZE_LEVELS) if (!west.has(id)) throw new Error(`level ${id} is not in the west block`);
  const mons = new Set();
  const addMon = (id, from) => {
    if (!monsters[id]) throw new Error(`${from}: monster ${id} is not in the world data`);
    mons.add(id);
  };
  for (const id of west) {
    const a = byId.get(id);
    for (const m of [...a.mon, ...a.nmon, ...a.umon, ...(a.critters ?? []).map((c) => c.mon)]) addMon(m, `area ${id}`);
    for (const m of PLACED[id] ?? []) addMon(m, `area ${id} preset`);
  }
  for (const s of superuniques) if (west.has(s.area)) addMon(s.mon, `superunique ${s.key}`);
  addMon(HIRELING, 'the Act 1 hireling');
  for (let grew = true; grew; ) {
    const n = mons.size;
    for (const id of [...mons]) for (const m of [...(monsters[id].minions ?? []), ...(monsters[id].spawn ? [monsters[id].spawn.mon] : [])]) addMon(m, `brought by ${id}`);
    grew = mons.size > n;
  }
  // a Sk mode of more than three letters, or no monster mode, names a sequence (MonsterTbls.cpp:94-150)
  const MODES = new Set(rows(modeJ).map((r) => r.code));
  // D2 plays a sequence on from its first row, for as many rows as it has (SequenceTbls.cpp:1317-1327,
  // 1249): they must follow each other
  const SEQ = new Map();
  const at = new Map();
  for (const [i, r] of seqRows.entries()) {
    if (!SEQ.has(r.sequence)) SEQ.set(r.sequence, []);
    else if (at.get(r.sequence) !== i - 1) throw new Error(`monseq ${r.sequence}: its rows are not together (row ${i})`);
    SEQ.get(r.sequence).push(r);
    at.set(r.sequence, i);
  }
  const seqNames = new Set();
  for (const id of mons) {
    for (const s of monsters[id].skills ?? []) {
      if (!s.mode || (s.mode.length <= 3 && MODES.has(s.mode))) continue;
      if (!SEQ.has(s.mode)) throw new Error(`monster ${id} skill ${s.skill}: mode ${s.mode} is neither a mode nor a sequence`);
      seqNames.add(s.mode);
    }
  }
  const monseq = {};
  for (const name of [...seqNames].sort()) {
    const frames = [];
    const events = [];
    for (const [i, r] of SEQ.get(name).entries()) {
      // a sequence plays other modes' frames, never another sequence ('xx')
      if (!MODES.has(r.mode) || r.mode === 'xx') throw new Error(`monseq ${name} row ${i}: mode ${r.mode}`);
      frames.push([r.mode, r.frame ?? 0]);
      if (r.event) {
        if (!SEQ_EVENT[r.event]) throw new Error(`monseq ${name} row ${i}: event ${r.event}`);
        events.push({ at: i, type: SEQ_EVENT[r.event] });
      }
    }
    monseq[name] = { frames, events };
  }

  // ───────────────────────── write ─────────────────────────
  writeD2x(
    'maze.ts',
    `import type { D2xTri } from './types';\n\n${MAZE_TYPES}\n` +
      `/** the west block's dungeons by Levels.txt id: the Den of Evil 8, Cave Levels 1 and 2 (9, 13), the Crypt 18, the Mausoleum 19 */\nexport const D2X_MAZES: Record<number, D2xMaze> = ${record(mazes)};\n`,
  );
  writeD2x(
    'objects.ts',
    `${OBJECT_TYPES}\n/** the object groups the west block's dungeons roll (ObjGroup.txt), by row */\nexport const D2X_OBJGROUPS: Record<number, D2xObjGroup> = ${record(groups)};\n\n` +
      `/**\n * The objects those groups place, with what their populate functions bring along, and the ones the\n * west block's map presets place (Objects.txt), by class: ${PRESET_OBJECTS.join(', ')} for the presets.\n */\nexport const D2X_OBJECTS: Record<number, D2xObject> = ${record(objects)};\n\n` +
      `/**\n * The hover names of the objects the game shows (chests, barrels, caskets and their graves, rogue corpses,\n * wells), ours (tools/d2-names/objects.json), by their Objects.txt Name string key (D2xObject.nameKey),\n * and ${LOCKED_CHEST}, a locked chest's\n */\nexport const D2X_OBJECT_NAMES: Record<string, D2xObjectName> = ${record(objectNames)};\n`,
  );
  writeD2x('monseq.ts', `${SEQ_TYPES}\n/** the sequences the west block's monsters play for their skills, by name (D2xMonster skills' mode) */\nexport const D2X_MONSEQ: Record<string, D2xMonSeq> = ${record(monseq)};\n`);
  writeD2x(
    'shrines.ts',
    `${SHRINE_TYPES}\n/** Shrines.txt, every row, by Code (its row) */\nexport const D2X_SHRINES: D2xShrine[] = ${list(shrines)};\n\n` +
      `/**\n * The Act 1 wilderness's shrine cells: the levels that have them, how many, and the shrine object each\n * of the four subs they take in turn holds (LvlSub type ${WILD_SHRINES.subType}: ${WILD_SHRINE_SUBS.map(([n]) => n).join(', ')})\n */\n` +
      `export const D2X_WILD_SHRINES = ${JSON.stringify({ levels: WILD_SHRINES.levels, cells: WILD_SHRINES.cells, objects: wildShrines })};\n`,
  );
  console.log(
    `maze: ${Object.keys(mazes).length} dungeon levels, ${Object.keys(groups).length} object groups, ${Object.keys(objects).length} objects (${Object.keys(objectNames).length} hover names), ` +
      `${Object.keys(monseq).length} sequences of the west block's ${mons.size} monsters (${west.size} areas); ${shrines.length} shrines (${shrines.filter((s) => s.name).length} named)`,
  );
  return { mazes, groups, objects, objectNames, monseq, shrines };
}

/** the shrine a shrine object becomes when it must be the level's healing one (Objects.cpp:1594-1606) */
function healAs(r) {
  const to = r.Parm1 ?? 0;
  return to && to < NUM_OBJECTS ? to : HEALING_WELL;
}

// ───────────────────────── the types the files carry ─────────────────────────
const MAZE_TYPES = `/**
 * A dungeon level of the west block: its LvlMaze.txt row, what the maze grows from, and what each of
 * its rooms rolls to furnish itself (Levels.txt ObjGrp/ObjPrb, Themes). Sizes are D2 tiles (5×5
 * subtiles each), before our maps scale them.
 */
export interface D2xMaze {
  /** Levels.txt id */
  id: number;
  /** LvlMaze.txt Name, e.g. "Act 1 - Cave 2" */
  key: string;
  /** Levels.txt DrlgType: 1 a maze grown from this row (DrlgMaze.cpp:314-871), 2 one preset map (Cave Level 2, lvlprest 104), which never reads it */
  drlg: number;
  /**
   * The rooms the maze grows to before its special rooms (the way in, the way down, the boss's, the
   * chest's) come on as dead ends, by difficulty (Rooms, Rooms(N), Rooms(H); DrlgMaze.cpp:476-563):
   * the first in the middle, each next one beside a random room on a random side (905-1025).
   */
  rooms: D2xTri;
  /** one room's size in tiles, x × y: 24 a cave's, 8 a crypt's */
  size: [number, number];
  /** per mille: a new room is joined to each other room it touches, besides the one it grew from, on rand % 1000 < merge (DrlgMaze.cpp:980-1015, 1193-1238) */
  merge: number;
  /**
   * The object groups (D2X_OBJGROUPS) each populated room rolls, in order (ObjGrp0–7 with ObjPrb0–7):
   * one passes on rand % 100 ≤ prob, so prob + 1 %, and then one of its objects is placed
   * (Objects.cpp:2104-2149); a room with a waypoint rolls none (2044-2047). healSkip: once ¾ of the
   * level's rooms are populated with no healing shrine yet (ObjRgn.cpp:189-193), D2MOO makes this roll
   * 100, which passes only for a prob of 100 — so the group is skipped — when the object row numbered
   * like the group has a SubClass (Objects.cpp:2108-2111): for the caves' groups 4 and 6 an urn's and a
   * chest's. The healing shrine D2 then makes comes from a shrine group that still rolls
   * (PopulateFn2, Objects.cpp:1525-1529, 1594-1606).
   */
  objGroups: { group: number; prob: number; healSkip?: true }[];
  /**
   * Levels.txt Themes: fillers a room may get instead of its object groups, by bit — 1 nothing, 2
   * barrels, 8 a grid of random items, 16 armor stands, 32 weapon racks (Objects.cpp:2013-2022,
   * 2064-2101). The crypts' 8 never fires in D2MOO, which compares the filler's number with the count of
   * themes (2097).
   */
  themes: number;
  /** % of its chests and urns trapped when they appear: the classic game's normal MonLvl / 8 + 5, whatever the difficulty (InitFn 2, 3, 57: Objects.cpp:613-704) */
  trap: number;
  /** % of its lockable chests locked when they appear: that MonLvl / 2 + 8 (Objects.cpp:651-660) */
  lock: number;
}
`;

const OBJECT_TYPES = `/**
 * An object group (ObjGroup.txt row): the objects a room that rolls it may get. One is picked where
 * rand % 100 falls under the running sum of PROB (past the sum, none) and its PopulateFn places it; a
 * member whose PopulateFn is 0 places nothing — the crypts' HoleAnim, which comes in the caskets'
 * clusters instead (Objects.cpp:2120-2149).
 */
export interface D2xObjGroup {
  id: number;
  /** GroupName, e.g. "Crypt caskets" */
  key: string;
  /**
   * The members up to the first empty one, where D2 stops (Objects.cpp:2123): the object
   * (D2X_OBJECTS), its DENSITY — how many a room gets, density × (the room's width × height in
   * subtiles >> 7) >> 8, so 5 for 125 in an 8×8-tile room (Objects.cpp:1071, 1314, 1661; shrines and
   * wells take one, whatever it says) — and its PROB.
   */
  objects: { id: number; density: number; prob: number }[];
}

/**
 * What using an object does, by OperateFn (D2MOO's table, ObjMode.cpp:79-157): casket 1 (2441-2472),
 * shrine 2 (2359-2437), urn 3 (2551-2583), chest 4 (1251-1545), barrel 5 (2781-2827), tome 6 (the Tower
 * Tome, A1Q5.cpp:80), explodingBarrel 7 (2829-2889: it hurts everything within 3 subtiles and sets off
 * the exploding barrels within 2), stone 9 (a Cairn Stone, A1Q4.cpp:690), torch 11 (2916-2939: a fire
 * lit or put out; the fires a chest's trap lights, which burn the players near them,
 * OBJMODE_UpdateTrapProximity 328-351), corpse 14 (2585-2614), portal 15, well 22 (3711-3808), waypoint 23,
 * stash 32 (the Bank; those three the game's own, here for their sizes); placeholder, a
 * preset's stand-in that becomes another object (Objects.cpp:215-249); none, nothing to use.
 */
export type D2xObjectKind =
  | 'casket' | 'shrine' | 'urn' | 'chest' | 'barrel' | 'tome' | 'explodingBarrel' | 'stone' | 'torch' | 'corpse' | 'portal' | 'well' | 'waypoint' | 'stash' | 'placeholder' | 'none';

/**
 * An object (Objects.txt row). Sizes are D2 subtiles (a tile is 5×5). Three function numbers say what
 * it does: PopulateFn how a room's object group places it (Objects.cpp:2011-2150), InitFn what it rolls
 * when it appears (252-436), OperateFn what using it does (ObjMode.cpp:79-157).
 */
export interface D2xObject {
  /** its class: the *ID, D2's index (D2MOO ObjectsIds.h) */
  id: number;
  /** Class, e.g. "Casket6" */
  key: string;
  /** Name: the key of its hover name in D2's strings, for reference */
  nameKey: string;
  /** the table's own note (*Description), for reference */
  desc: string;
  /** subtiles, x × y */
  size: [number, number];
  /** Xspace, Yspace: a barrel cluster steps this far between barrels (PopulateFn4 by the barrel's, Objects.cpp:1695) */
  space?: [number, number];
  /** SubClass bits: 1 shrine, 8 a container, 32 well, 64 waypoint (ObjectsTbls.h:7-17) */
  subclass?: number;
  /** PopulateFn: 1 clusters (972-1166), 2 a shrine (1512-1627), 3 one or more alone (1297-1332), 4 barrel clusters (1635-1726), 6 a corpse with flies (1407-1430), 8 a well (1433-1510); 0 not by a group */
  populate: number;
  /** InitFn: 1 shrine (489-548), 2 urn (613-623), 3 chest (637-668), 4 Tower Tome, 6 Cairn Stone, 16 well (601-604), 57 sparkly chest (671-704); 79 a placeholder's; 0 none */
  init: number;
  operate: number;
  /** Parm0–4 with the trailing zeros left off, as its functions read them (shrine, well) */
  parm?: number[];
  /** Orientation: a shrine of 1 stands against the room's low-y edge, of 2 against its low-x edge, else anywhere (PopulateFn2, Objects.cpp:1548-1561) */
  orientation: number;
  /** it can be clicked when it appears (Selectable0); this and the four below are left off a placeholder, which is never a unit */
  selectable?: true;
  /** it blocks movement when it appears (HasCollision0) */
  blocks?: true;
  /** it still blocks once opened (HasCollision1): D2 frees an opened casket's, urn's or corpse's spot when not (ObjMode.cpp:2463-2466, 2573-2576, 2604-2607), a broken barrel's always (2807) */
  blocksOpen?: true;
  /** attacks break it open (IsAttackable0, Objects.cpp:357-364) */
  attackable?: true;
  /** 1 in 14 appear already opened, spent (PreOperate, Objects.cpp:418-423) */
  preOperate?: true;
  kind: D2xObjectKind;
  /**
   * % of uses that drop the area's chest class (D2xArea.chestTc; OBJMODE_DropFromChestTCWithQuality,
   * ObjMode.cpp:3909-3958): a casket opens only when that dropped something, and is tried again when it
   * dropped nothing (2450); a corpse 100 (2596); a chest 75, always when it was locked (1296) and 100
   * when sparkly; an urn and a barrel 21 (2568, 2816).
   */
  drop?: number;
  /**
   * rolled: trapped when it appears, the level's D2xMaze.trap % (InitFn 2, 3, 57); the trap goes off
   * 35 frames after it is opened, one of eight alike, (rand & 7) + 1: lightning, fire bolt (2 and 6),
   * poison cloud, nova, fire (5 and 7: the fires 162 and 160) or one or two of the level's trap monster
   * (ObjMode.cpp:1547-1588, 1044-1175); below level 40 lightning, nova and (but in level 25) poison
   * cloud go off as the fire bolt, and from 75 the trap monsters do (OBJMODE_DispatchTrap, 354-440).
   * monster: 18.08 % of openings raise one trap monster, rand % 10000 ≥ 8192 (2458, 2810).
   * The trap monster is the first zombie or skeleton kind among the level's monsters, as its first row
   * (zombie1, skeleton1, …), spawned as the level's variant (ObjRgn.cpp:268-314, ObjMode.cpp:1065-1078).
   */
  trap?: 'rolled' | 'monster';
  /** it may be locked when it appears, the level's D2xMaze.lock %: then it needs a key and drops twice (ObjMode.cpp:1264-1277) */
  lockable?: true;
  /** a spark chest: it always drops, of forced magic quality (5 % rare), and drops again up to 10 times until a magic or better item comes (ObjMode.cpp:1280-1323) */
  sparkly?: true;
  /** 397: it opens by its own rules instead, one roll of 10000 for unique, set or rare tries or up to 10 forced-magic drops, then gold and potions (ObjMode.cpp:1294, 1327-1541) */
  consolation?: true;
  /** what its PopulateFn makes its clusters of, picked at random (PopulateFn1); barrels: the first exploding one time in 3, the rest one in 4, at most 8 a room (Objects.cpp:1666, 1683, 1708) */
  cluster?: number[];
  /** % of these that get flies (object 103) on them (PopulateFn6, Objects.cpp:1417) */
  flies?: number;
  /**
   * a shrine's kind by Parm0 (InitFn 1, Objects.cpp:489-548): what it picks its shrine (D2X_SHRINES) among,
   * by effect class: health (1: class 2), mana (2: class 3), magic (3 and more: a boon, class 4, or one
   * time in ten a special one, class 1, as Objects.txt calls such objects magic shrines), any (0: any
   * shrine of the area's level)
   */
  shrine?: 'any' | 'health' | 'mana' | 'magic';
  /** the object a shrine becomes when it must be the level's healing one: Parm1, or the healing well 84 (Objects.cpp:1594-1606) */
  healAs?: number;
  /** a well: its uses (2 × Parm2), the seconds each takes to come back ((Parm0 + 1) / 25), the share of life, mana and stamina a use restores (Parm1 / 256), and whether it restores life (Parm3 & 2) and mana (Parm3 & 1); it also cures poison and freezing and heals the user's pets (ObjMode.cpp:3711-3808, 265-306; Objects.cpp:601-604) */
  well?: { uses: number; regen: number; restore: number; life: boolean; mana: boolean };
  /** a placeholder's: the objects it becomes, one at random (Objects.cpp:103-202) */
  becomes?: number[];
  /** an exploding barrel's or a trap fire's Damage: % of the 1/32–1/8 of a target's life it rolls (ObjEval.cpp:16-90) */
  damage?: number;
}

/** an object's hover name: ours in Chinese and English, and the official English it was written against */
export interface D2xObjectName {
  name: string;
  nameEn: string;
  en: string;
}
`;

const SHRINE_TYPES = `/**
 * A shrine (Shrines.txt row): what a shrine object is, once it has rolled its kind as it appears
 * (OBJECTS_InitFunction01_Shrine, D2MOO Objects.cpp:489-548), and what touching it does by its Code
 * (the handlers' table, ObjMode.cpp:2142-2168, run by OBJECTS_OperateFunction02_Shrine, 2359-2437).
 */
export interface D2xShrine {
  /** Code: its row, which D2 indexes it by and dispatches on */
  code: number;
  /** StringName: its name's string key, ours by it (tools/d2-names/shrines.json) */
  key: string;
  /** Name: Blizzard's English for it */
  en: string;
  /** ours, for the shrines a shrine can be: not 0 (the null shrine), 4, 5 or 16, which InitFn01 makes another (Objects.cpp:531-544) */
  name?: string;
  nameEn?: string;
  /**
   * effectclass: what a shrine object picks its kind among (OBJRGN's lists by class, ObjRgn.cpp:47-78):
   * 2 health, 3 mana, 4 a boon (with the refilling shrine), 1 a special one; 0 the null shrine alone
   */
  effectClass: number;
  /** LevelMin: the lowest Levels.txt Id it is kept in, the pick tried again up to 8 times below it (Objects.cpp:520-528, 565-578) */
  levelMin: number;
  /** Arg0, Arg1: what its handler reads, the % or points of its boon, the specials' counts and % */
  arg0: number;
  arg1: number;
  /** Duration in frames: how long a boon's state lasts, at 25 frames a second */
  frames: number;
  /** reset time in minutes: it can be touched again 1200 × this + 1 frames after (ObjMode.cpp:2423-2426, OBJMODE_ResetShrine 252-262); 0, never */
  reset: number;
}
`;

const SEQ_TYPES = `/**
 * A monster sequence (MonSeq.txt): the animation a skill plays when its MonStats Sk mode names a
 * sequence instead of a mode (MonsterTbls.cpp:94-150), stitched from other modes' frames. D2 moves
 * speed / 256 rows a game frame, speed being the unit's animation speed with its attack or cast rate
 * on top (Units.cpp:1020-1036, 1348-1430, 1508-1530): how long a row lasts is AnimData's, which
 * d2data does not have.
 */
export interface D2xMonSeq {
  /** the rows in play order: [monster mode, that mode's frame] */
  frames: [string, number][];
  /** the rows (0-based) an event fires on, and what it is (SequenceTbls.h:8-15, SequenceTbls.cpp:1245-1283) */
  events: { at: number; type: 'melee' | 'missile' | 'sound' | 'skill' }[];
}
`;
