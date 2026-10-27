// The world stage → src/data/d2x/: Act 1's areas (Levels.txt ids 1–39), every monster they spawn or
// bring with them and the pets of the game's two classes, the monster level table, champion and unique modifiers, Act 1's superuniques and
// the words random uniques are named from. Always the expansion columns. Monster life, defense,
// experience, to-hit and damage stay what MonStats.txt keeps: percentages of the D2X_MONLVL row of
// the monster's level, which the game applies at spawn (see D2xMonsterDiff).
//
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f, by file and line.
import { list, record, rows, rows27, strings, tables, writeD2x } from './load.mjs';
import { glossaryOfficial, names } from './names.mjs';
import { propReader } from './props.mjs';
import { GAME_CLASSES } from './scope.mjs';

const ACT1 = { first: 1, last: 39 };
const DIFF = ['', '(N)', '(H)'];

/**
 * Act 1's outdoor areas meet edge to edge, which Levels.txt does not say (its Vis columns name the
 * areas behind warps and the monastery's walked joins): D2MOO's link tables, DrlgOutPlace.cpp:29-47.
 * West: the camp, Blood Moor, Cold Plains, Stony Field, with Burial Grounds off Cold Plains; east:
 * Dark Wood, Black Marsh, Tamoe Highland, Monastery Gate. The two only meet through the Underground
 * Passage (a warp).
 */
const OUTDOOR = [[1, 2], [2, 3], [3, 4], [3, 17], [5, 6], [6, 7], [7, 26]];
/** areas only a portal leads to, no warp or walk: Tristram (the Cairn Stones) and the cow level (cubed in the camp) */
const PORTAL_ONLY = new Set([38, 39]);
/**
 * MonUMod.txt's constants D2 reads, by row index: rows 0–33 (MonsterUnique.cpp:203-851, the highest
 * being nDifficulty + 31). The 3.x tables filled rows 34–36 for the Warlock expansion (the curse
 * modifier's proc chances, the heralds' spawner missile); 2.7 has none past 33.
 */
const UMOD_CONSTANTS = 34;

/**
 * MonPreset's placeholders in Act 1 that stand for given monsters, which D2 spawns in their place
 * (D2MOO MonsterRegion.cpp:141-540): Blood Raven's (288-294), and the fallen and fallen shamans,
 * the first of their class but in Black Marsh, Tamoe Highland and the Pit (375-381, 421-451). The
 * others pick from the area's own monsters or place nothing.
 */
const PLACED = {
  place_bloodraven: ['bloodraven'],
  place_fallen: ['fallen1', 'fallen2', 'fallen3'],
  place_fallenshaman: ['fallenshaman1', 'fallenshaman2', 'fallenshaman3'],
};

/** NameStr keys the game shows no name for: critters, camp dummies, arrow traps */
const NO_NAME = new Set(['dummy', 'Dummy', 'a trap']);

/**
 * MonStats.txt columns → how they are taken, all of them, so a new column fails the import instead
 * of being dropped. Per-difficulty columns are listed by their normal name (the (N) and (H) forms
 * follow).
 */
const PER_DIFF = [
  'Level', 'minHP', 'maxHP', 'AC', 'Exp', 'A1MinD', 'A1MaxD', 'A1TH', 'A2MinD', 'A2MaxD', 'A2TH', 'S1MinD', 'S1MaxD', 'S1TH',
  ...[1, 2, 3].flatMap((i) => [`El${i}Pct`, `El${i}MinD`, `El${i}MaxD`, `El${i}Dur`]),
  'ResDm', 'ResMa', 'ResFi', 'ResLi', 'ResCo', 'ResPo', 'ToBlock', 'Drain', 'coldeffect', 'aidel', 'aidist',
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `aip${i}`),
  'TreasureClass', 'TreasureClassChamp', 'TreasureClassUnique', 'TreasureClassQuest',
  // terror zones and the Warlock expansion's heralds: neither is in the game, so these are not taken
  'TreasureClassDesecrated', 'TreasureClassDesecratedChamp', 'TreasureClassDesecratedUnique', 'TreasureClassHerald',
];
const SINGLE = [
  'Id', '*hcIdx', 'BaseId', 'NextInClass', 'NameStr', 'MonStatsEx', 'MonProp', 'MonType', 'AI', 'Code', 'enabled', 'areaId',
  'MinGrp', 'MaxGrp', 'PartyMin', 'PartyMax', 'minion1', 'minion2', 'SetBoss', 'BossXfer', 'spawn', 'spawnx', 'spawny', 'spawnmode', 'placespawn',
  'isSpawn', 'genericSpawn', 'sparsePopulate', 'Velocity', 'Run', 'Rarity', 'threat', 'Align', 'isMelee', 'npc', 'inTown', 'killable', 'interact',
  'inventory', 'switchai', 'opendoors', 'neverCount', 'demon', 'boss', 'primeevil', 'lUndead', 'hUndead', 'flying', 'noRatio', 'rangedtype',
  'noAura', 'petIgnore', 'zoo', 'deathDmg', 'nomultishot', 'nopreventmonsterheal', 'SendSkills', 'SkillDamage', 'DamageRegen', 'Crit',
  'rightArmItemType', 'leftArmItemType', 'canNotUseTwoHandedItems', 'ShieldBlockOverride', 'MonSound', 'UMonSound', 'TCQuestId', 'TCQuestCP',
  ...[1, 2, 3].flatMap((i) => [`El${i}Mode`, `El${i}Type`]),
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [`Skill${i}`, `Sk${i}mode`, `Sk${i}lvl`]),
  'MissA1', 'MissA2', 'MissS1', 'MissS2', 'MissS3', 'MissS4', 'MissC', 'MissSQ',
];
/** columns not taken, and why */
const IGNORED = {
  lineNumber: 'row order',
  expansion: 'marks rows the expansion added; this is the expansion',
  TransLvl: 'palette shift of the sprite',
  DescStr: 'the hover description string: official text',
  SplEndDeath: 'D2 special-case hooks in the client and server',
  SplGetModeChart: 'D2 special-case hooks',
  SplEndGeneric: 'D2 special-case hooks',
  SplClientEnd: 'D2 special-case hooks',
  CannotDesecrate: 'terror zones are not in the game',
  CannotHerald: "the Warlock expansion's heralds",
};
const colOf = (base, d) => (d === 0 ? base : `${base === 'minHP' ? 'MinHP' : base === 'maxHP' ? 'MaxHP' : base}${DIFF[d]}`);
const KNOWN = new Set([...SINGLE, ...Object.keys(IGNORED), ...PER_DIFF.flatMap((b) => [0, 1, 2].map((d) => colOf(b, d)))]);

/** the flags taken: MonStats column → our key */
const FLAGS = {
  isSpawn: 'spawns', isMelee: 'melee', npc: 'npc', inTown: 'town', killable: 'killable', interact: 'interact', inventory: 'inventory',
  switchai: 'switchAi', opendoors: 'opensDoors', neverCount: 'neverCount', demon: 'demon', boss: 'boss', primeevil: 'primeEvil',
  flying: 'flying', noRatio: 'noRatio', rangedtype: 'ranged', noAura: 'noAura', petIgnore: 'petIgnore', zoo: 'zoo', deathDmg: 'deathDmg',
  nomultishot: 'noMultishot', nopreventmonsterheal: 'noPreventHeal', SendSkills: 'sendSkills', genericSpawn: 'genericSpawn',
  sparsePopulate: 'sparse', placespawn: 'placeSpawn', SetBoss: 'setBoss', BossXfer: 'bossXfer', canNotUseTwoHandedItems: 'noTwoHanded',
};
/** MonStats2.txt: the part the game uses (size, reach, heights, light, selection); the rest is sprite layers */
const STATS2_FLAGS = {
  Shadow: 'shadow', noMap: 'noMap', isSel: 'sel', noSel: 'noSel', alSel: 'alwaysSel', shiftSel: 'shiftSel', corpseSel: 'corpseSel',
  isAtt: 'attackable', revive: 'revive', critter: 'critter', small: 'small', large: 'large', soft: 'soft', inert: 'inert',
  objCol: 'objCol', deadCol: 'deadCol', unflatDead: 'unflatDead', noUniqueShift: 'noUniqueShift',
};

/**
 * What a skill summons, by MonStats id: its summon column, and for Hydra (server function 144) the
 * two rows after it too, its three heads (SkillSor.cpp:1091-1160, hcIdx summon + 0…2).
 */
export function petsOf(s, monRows) {
  if (!s.summon) return [];
  const first = monRows.find((m) => m.Id === s.summon);
  if (!first) throw new Error(`skill ${s.skill}: summon ${s.summon} is not in monstats`);
  if (s.srvdofunc !== 144) return [s.summon];
  return [0, 1, 2].map((i) => {
    const m = monRows.find((x) => x['*hcIdx'] === first['*hcIdx'] + i);
    if (!m) throw new Error(`skill ${s.skill}: no monstats row ${first['*hcIdx'] + i}`);
    return m.Id;
  });
}

export async function buildWorld({ bases }) {
  const [levelsJ, monJ, mon2J, lvlJ, umodJ, propJ, equipJ, aiJ, suJ, uPreJ, uSufJ, uAppJ, presetJ, warpJ, skillsJ, missJ] = await tables(
    'levels', 'monstats', 'monstats2', 'monlvl', 'monumod', 'monprop', 'monequip', 'monai', 'superuniques',
    'uniqueprefix', 'uniquesuffix', 'uniqueappellation', 'monpreset', 'lvlwarp', 'skills', 'missiles',
  );
  const S = await strings('levels', 'monsters', 'npcs', 'item-nameaffixes');
  const { prop } = await propReader();
  // the monsters the expansion changed are read as 2.7 has them (see rows27); it added columns, checked below on the pinned rows
  const M27 = await rows27('monstats', 'Id');
  const MON = new Map(rows(monJ).map((m) => [m.Id, M27.get(m.Id) ?? m]));
  const MON2 = new Map(rows(mon2J).map((m) => [m.Id, m]));
  const SKILL = new Set(rows(skillsJ).filter((s) => s.skill).map((s) => s.skill));
  const MISSILE = new Set(rows(missJ).map((m) => m.Missile));
  // No official name may reach the data, whichever row it belongs to: an area, monster or name word
  // of ours that is another row's official name (腐尸 is the official Decayed) fails too.
  const officialNames = new Set(Object.values(S.zh).filter(Boolean).map((z) => z.trim()));
  const official = (key) => S.zh[key];
  const unknown = new Set();
  for (const m of rows(monJ)) for (const k of Object.keys(m)) if (!KNOWN.has(k)) unknown.add(k);
  if (unknown.size) throw new Error(`monstats: columns with no rule: ${[...unknown].join(', ')}`);

  // ───────────────────────── which monsters ─────────────────────────
  // What Act 1 spawns: the areas' mon (normal), nmon (nightmare and hell, MonsterRegion.cpp:944-962),
  // umon (normal champions and uniques, MonsterChoose.cpp:156-167) and cmon (critters) lists; the
  // superuniques and other units Act 1's map presets place (MonPreset.txt, act 1, with the monsters
  // its placeholders stand for); its bosses (areaId); the Act 1 hireling; Cain, a camp NPC once
  // rescued (cain5, Quests.cpp:150-158). Then what those bring: minion1/2 (pack members, and the
  // dead minions a fallen shaman raises, AiUtil.cpp:489-500) and spawn (what a nest or Blood Raven
  // summons).
  const LEVELS = rows(levelsJ).filter((r) => r.Id >= ACT1.first && r.Id <= ACT1.last).sort((a, b) => a.Id - b.Id);
  const presets = rows(presetJ).filter((r) => r.Act === 1).map((r) => r.Place);
  const SU = rows(suJ).filter((s) => presets.includes(s.Superunique)).sort((a, b) => a.hcIdx - b.hcIdx);
  const why = new Map();
  const want = (id, from) => {
    if (!id) return;
    if (!MON.has(id)) throw new Error(`${from}: monster ${id} is not in monstats`);
    if (!why.has(id)) why.set(id, from);
  };
  const listOf = (r, p) => {
    const out = [];
    for (let i = 1; i <= 25; i++) if (r[`${p}${i}`]) out.push(r[`${p}${i}`]);
    return out;
  };
  for (const r of LEVELS) for (const p of ['mon', 'nmon', 'umon', 'cmon']) for (const id of listOf(r, p)) want(id, `levels ${r.Id} ${p}`);
  for (const s of SU) want(s.Class, `superunique ${s.Superunique}`);
  for (const m of MON.values()) if (m.areaId >= ACT1.first && m.areaId <= ACT1.last) want(m.Id, `boss of area ${m.areaId}`);
  // MonPreset also names placeholders the map generator fills in (place_fallen, …) and the superuniques
  for (const p of presets) if (MON.has(p)) want(p, 'monpreset act 1');
  for (const p of presets) for (const id of PLACED[p] ?? []) want(id, `monpreset act 1 ${p}`);
  want('roguehire', 'the Act 1 hireling');
  want('cain5', 'Cain in the camp after his rescue');
  // the pets of the game's classes, which show the skill's name (the Hydra's NameStr is a skill string)
  const pets = new Map();
  for (const s of rows(skillsJ)) {
    if (!GAME_CLASSES.has(s.charclass)) continue;
    for (const id of petsOf(s, [...MON.values()])) {
      want(id, `summon of ${s.skill}`);
      pets.set(id, s.skill);
    }
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of [...why.keys()]) {
      const m = MON.get(id);
      for (const k of ['minion1', 'minion2', 'spawn']) {
        if (m[k] && !why.has(m[k])) {
          want(m[k], `${k} of ${id}`);
          grew = true;
        }
      }
    }
  }

  // ───────────────────────── monsters ─────────────────────────
  const monNames = names('monsters');
  const npcNames = names('npcs');
  const monsters = {};
  const tri = (r, base) => [0, 1, 2].map((d) => r[colOf(base, d)] ?? 0);
  const skillRef = (s, where) => {
    if (!SKILL.has(s)) throw new Error(`${where}: skill ${s} is not in skills.json`);
    return s;
  };
  for (const id of [...why.keys()].sort((a, b) => MON.get(a)['*hcIdx'] - MON.get(b)['*hcIdx'])) {
    const r = MON.get(id);
    const where = `monstats ${id}`;
    const o = { id, hcIdx: r['*hcIdx'] };
    if (r.BaseId && r.BaseId !== id) o.base = r.BaseId;
    if (r.NextInClass) o.next = r.NextInClass;
    o.nameKey = r.NameStr;
    if (pets.has(id)) o.petOf = pets.get(id);
    else if (!NO_NAME.has(r.NameStr)) {
      const nm = (r.npc ? npcNames : monNames).get(r.NameStr, S.en[r.NameStr], official(r.NameStr));
      // a monster with no name of ours is left out, like an unnamed item (the report lists it)
      if (!nm) continue;
      o.name = nm;
      o.en = S.en[r.NameStr];
    }
    if (r.MonType) o.type = r.MonType;
    o.ai = r.AI;
    // (d2data reads a code of digits as a number: hydra2 is 21)
    o.code = String(r.Code);
    if (!r.enabled) o.disabled = true;
    if (r.areaId) o.area = r.areaId;
    for (const [col, key] of Object.entries(FLAGS)) if (r[col]) o[key] = true;
    if (r.lUndead || r.hUndead) o.undead = r.hUndead ? 'high' : 'low';
    o.align = r.Align ?? 0;
    o.group = [r.MinGrp ?? 0, r.MaxGrp ?? 0];
    if (r.PartyMin || r.PartyMax) o.party = [r.PartyMin ?? 0, r.PartyMax ?? 0];
    const minions = [r.minion1, r.minion2].filter(Boolean);
    if (minions.length) o.minions = minions;
    if (r.spawn) o.spawn = { mon: r.spawn, x: r.spawnx ?? 0, y: r.spawny ?? 0, mode: r.spawnmode };
    o.velocity = r.Velocity ?? 0;
    o.run = r.Run ?? 0;
    o.rarity = r.Rarity ?? 0;
    o.threat = r.threat ?? 0;
    o.regen = r.DamageRegen ?? 0;
    if (r.Crit) o.crit = r.Crit;
    if (r.SkillDamage) o.skillDamage = skillRef(r.SkillDamage, where);
    const arms = [r.rightArmItemType, r.leftArmItemType];
    if (arms.some(Boolean)) o.arms = arms.map((a) => a ?? null);
    if (r.ShieldBlockOverride) o.shieldBlock = r.ShieldBlockOverride;
    const skills = [];
    for (let i = 1; i <= 8; i++) {
      if (!r[`Skill${i}`]) continue;
      const s = { skill: skillRef(r[`Skill${i}`], where), lvl: r[`Sk${i}lvl`] ?? 0 };
      if (r[`Sk${i}mode`]) s.mode = r[`Sk${i}mode`];
      skills.push(s);
    }
    if (skills.length) o.skills = skills;
    const miss = {};
    for (const k of ['A1', 'A2', 'S1', 'S2', 'S3', 'S4', 'C', 'SQ']) {
      const m = r[`Miss${k}`];
      if (!m) continue;
      if (!MISSILE.has(m)) throw new Error(`${where}: missile ${m} is not in missiles.json`);
      miss[k.toLowerCase()] = m;
    }
    if (Object.keys(miss).length) o.missiles = miss;
    if (r.MonSound) o.sound = r.MonSound;
    if (r.UMonSound && r.UMonSound !== r.MonSound) o.uniqueSound = r.UMonSound;

    // per difficulty
    const T = Object.fromEntries(PER_DIFF.map((b) => [b, tri(r, b)]));
    o.diff = [0, 1, 2].map((d) => {
      const x = { level: T.Level[d], hp: [T.minHP[d], T.maxHP[d]], ac: T.AC[d], xp: T.Exp[d] };
      for (const a of ['A1', 'A2', 'S1']) if (T[`${a}MaxD`][d] || T[`${a}TH`][d]) x[a.toLowerCase()] = [T[`${a}MinD`][d], T[`${a}MaxD`][d], T[`${a}TH`][d]];
      const el = [];
      for (const i of [1, 2, 3]) {
        if (!r[`El${i}Type`] || !(T[`El${i}Pct`][d] || T[`El${i}MaxD`][d])) continue;
        el.push({ mode: r[`El${i}Mode`], type: r[`El${i}Type`], pct: T[`El${i}Pct`][d], dmg: [T[`El${i}MinD`][d], T[`El${i}MaxD`][d]], len: T[`El${i}Dur`][d] });
      }
      if (el.length) x.el = el;
      x.res = ['ResDm', 'ResMa', 'ResFi', 'ResLi', 'ResCo', 'ResPo'].map((c) => T[c][d]);
      x.block = T.ToBlock[d];
      x.drain = T.Drain[d];
      x.coldEffect = T.coldeffect[d];
      x.ai = { delay: T.aidel[d], params: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => T[`aip${i}`][d]) };
      if (T.aidist[d]) x.ai.dist = T.aidist[d];
      while (x.ai.params.length && !x.ai.params[x.ai.params.length - 1]) x.ai.params.pop();
      const tc = {};
      for (const [k, col] of [['regular', 'TreasureClass'], ['champ', 'TreasureClassChamp'], ['unique', 'TreasureClassUnique'], ['quest', 'TreasureClassQuest']]) {
        if (T[col][d]) tc[k] = T[col][d];
      }
      x.tc = tc;
      return x;
    });
    if (r.TCQuestId) o.questTc = { quest: r.TCQuestId, cp: r.TCQuestCP ?? 0 };

    // MonStats2
    const s2 = MON2.get(r.MonStatsEx);
    if (!s2) throw new Error(`${where}: no monstats2 row ${r.MonStatsEx}`);
    o.size = [s2.SizeX ?? 0, s2.SizeY ?? 0];
    o.meleeRng = s2.MeleeRng ?? 0;
    o.height = s2.Height ?? 0;
    o.overlayHeight = s2.OverlayHeight ?? 0;
    o.pixHeight = s2.pixHeight ?? 0;
    o.baseW = s2.BaseW;
    o.hitClass = s2.HitClass ?? 0;
    if (s2.Light) o.light = { radius: s2.Light, rgb: [s2['light-r'] ?? 0, s2['light-g'] ?? 0, s2['light-b'] ?? 0] };
    for (const [col, key] of Object.entries(STATS2_FLAGS)) if (s2[col]) o[key] = true;
    if (s2.ResurrectMode && s2.ResurrectMode !== 'NU') o.resurrectMode = s2.ResurrectMode;
    if (s2.ResurrectSkill) o.resurrectSkill = skillRef(s2.ResurrectSkill, where);

    // MonProp: properties the monster spawns with, by difficulty
    if (r.MonProp) {
      const p = rows(propJ).find((x) => x.Id === r.MonProp);
      if (!p) throw new Error(`${where}: no monprop row ${r.MonProp}`);
      const byDiff = ['', ' (N)', ' (H)'].map((s) => {
        const out = [];
        for (let i = 1; i <= 6; i++) {
          if (!p[`prop${i}${s}`]) continue;
          const pr = prop(p[`prop${i}${s}`], p[`par${i}${s}`], p[`min${i}${s}`], p[`max${i}${s}`]);
          if (!pr) continue;
          if (p[`chance${i}${s}`]) pr.chance = p[`chance${i}${s}`];
          out.push(pr);
        }
        return out;
      });
      if (byDiff.some((x) => x.length)) o.props = byDiff;
    }
    // MonEquip: what it wields from spawn (onInit) or from a monster level on, and its quality
    const equip = [];
    for (const e of rows(equipJ).filter((x) => x.monster === id)) {
      for (let i = 1; i <= 3; i++) {
        if (!e[`item${i}`]) continue;
        if (!bases.has(e[`item${i}`])) throw new Error(`monequip ${id}: item ${e[`item${i}`]} is not an imported base`);
        equip.push({ item: e[`item${i}`], loc: e[`loc${i}`], quality: e[`mod${i}`] ?? 0, level: e.level ?? 0, ...(e.oninit ? { onInit: true } : {}) });
      }
    }
    if (equip.length) o.equip = equip;
    monsters[id] = o;
  }
  // references to monsters left out (unnamed) go with them
  const has = (id) => !!monsters[id];
  for (const m of Object.values(monsters)) {
    if (m.minions) m.minions = m.minions.filter(has);
    if (m.spawn && !has(m.spawn.mon)) delete m.spawn;
  }

  // ───────────────────────── AI parameters ─────────────────────────
  // MonAI.txt only documents what aip1–8 mean for each AI (the numbers are per monster, above)
  const ai = {};
  for (const a of [...new Set(Object.values(monsters).map((m) => m.ai))].sort()) {
    const r = rows(aiJ).find((x) => x.AI === a);
    if (!r) throw new Error(`monai: no row for AI ${a}`);
    ai[a] = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => r[`*aip${i}`] ?? null);
    while (ai[a].length && ai[a][ai[a].length - 1] === null) ai[a].pop();
  }

  // ───────────────────────── monster levels ─────────────────────────
  // MonLvl.txt's expansion columns (L-*): DATATBLS_CalculateMonsterStatsByLevel reads dwHP[difficulty
  // + 3] and so on in the expansion (MonsterTbls.cpp:562-731, the offset of 3 at 590)
  const monlvl = rows(lvlJ).sort((a, b) => a.Level - b.Level).map((r, i) => {
    if (r.Level !== i) throw new Error(`monlvl: row ${i} is level ${r.Level}`);
    const t = (c) => [0, 1, 2].map((d) => r[`L-${c}${DIFF[d]}`]);
    return { ac: t('AC'), th: t('TH'), hp: t('HP'), dm: t('DM'), xp: t('XP') };
  });

  // ───────────────────────── champion and unique modifiers ─────────────────────────
  const umods = [];
  const umodConstants = [];
  for (const r of rows(umodJ).sort((a, b) => a.id - b.id)) {
    if (r.id < UMOD_CONSTANTS) {
      if (r.constants === undefined) throw new Error(`monumod ${r.id}: no constant`);
      umodConstants.push({ value: r.constants, desc: r['*constant desc'] ?? '' });
    }
    if (!r.uniquemod) continue;
    const o = { id: r.id, key: r.uniquemod };
    if (!r.enabled) o.disabled = true;
    if (r.xfer) o.xfer = true;
    if (r.champion) o.champion = true;
    if (r.fPick) o.fpick = r.fPick;
    const ex = [r.exclude1, r.exclude2].filter(Boolean);
    if (ex.length) o.exclude = ex;
    o.cpick = [r.cpick ?? 0, r['cpick (N)'] ?? 0, r['cpick (H)'] ?? 0];
    o.upick = [r.upick ?? 0, r['upick (N)'] ?? 0, r['upick (H)'] ?? 0];
    umods.push(o);
  }

  // ───────────────────────── superuniques ─────────────────────────
  const superuniques = [];
  for (const s of SU) {
    const where = `superunique ${s.Superunique}`;
    const name = monNames.get(s.Name, S.en[s.Name], official(s.Name));
    if (!name || !monsters[s.Class]) continue;
    const o = { key: s.Superunique, name, en: S.en[s.Name], hcIdx: s.hcIdx, mon: s.Class };
    o.mods = [s.Mod1, s.Mod2, s.Mod3].filter(Boolean);
    for (const u of o.mods) if (!umods.some((x) => x.id === u)) throw new Error(`${where}: no monumod ${u}`);
    o.group = [s.MinGrp ?? 0, s.MaxGrp ?? 0];
    if (s.AutoPos) o.autoPos = true;
    if (s.Stacks) o.stacks = true;
    if (s.Replaceable) o.replaceable = true;
    o.tc = [s.TC, s['TC(N)'], s['TC(H)']];
    if (o.tc.some((t) => !t)) throw new Error(`${where}: a difficulty has no treasure class`);
    if (s.areaId) o.area = s.areaId;
    if (s.MonSound) o.sound = s.MonSound;
    superuniques.push(o);
  }

  // ───────────────────────── random unique names ─────────────────────────
  const words = (t, file) => {
    const nm = names(file);
    return Object.values(t).flatMap((key) => {
      const n = nm.get(key, S.en[key], official(key));
      return n ? [{ key, name: n, en: S.en[key] }] : [];
    });
  };
  const uniqueNames = { prefix: words(uPreJ, 'monster-prefixes'), suffix: words(uSufJ, 'monster-suffixes'), title: words(uAppJ, 'monster-titles') };
  for (const t of uniqueNames.title) if (!t.name.endsWith('·')) throw new Error(`monster-titles.json ${t.key}: ${t.name} must end in ·, it goes before the name`);

  // ───────────────────────── areas ─────────────────────────
  const areaNames = names('areas');
  const WARP = new Map(rows(warpJ).map((w) => [w.Id, w]));
  const warps = {};
  const lvlOf = (r, d) => r[`MonLvlEx${DIFF[d]}`] ?? 0;
  const L = new Map(LEVELS.map((r) => [r.Id, r]));
  // A chest drops its act's Chest A, B or C by where the area's level falls between the levels of
  // the act's first and last areas (Blood Moor and Catacombs Level 4): ObjMode.cpp:3909-3955
  const chestTc = (r, d) => {
    const lo = lvlOf(L.get(2), d);
    const hi = lvlOf(L.get(37), d);
    const step = Math.floor((Math.abs(hi - lo) + 1) / 3);
    const lvl = lvlOf(r, d);
    const i = lvl >= lo + step ? (lvl >= lo + 2 * step ? 2 : 1) : 0;
    return `Act 1${d ? ` ${DIFF[d]}` : ''} Chest ${'ABC'[i]}`;
  };
  // Walked joins, both ways: the outdoor edges and the Vis entries with no warp tile (Warp -1), the
  // monastery's: Monastery Gate–Outer Cloister–Barracks and Inner Cloister–Cathedral.
  // D2 keeps an area's Vis areas active with it (DrlgDrlg.cpp:235-305), which is how the next one
  // is there to walk into.
  const walk = new Map(LEVELS.map((r) => [r.Id, new Set()]));
  const join = (a, b) => {
    if (!walk.has(a) || !walk.has(b)) throw new Error(`walked join ${a}–${b} leaves Act 1`);
    walk.get(a).add(b);
    walk.get(b).add(a);
  };
  for (const [a, b] of OUTDOOR) join(a, b);
  for (const r of LEVELS) for (let i = 0; i < 8; i++) if (r[`Vis${i}`] && !(r[`Warp${i}`] >= 0)) join(r.Id, r[`Vis${i}`]);
  const areas = [];
  for (const r of LEVELS) {
    const where = `levels ${r.Id}`;
    const name = areaNames.get(String(r.Id), S.en[r.LevelName], official(r.LevelName));
    if (!name) continue;
    const o = { id: r.Id, key: r.Name, name, en: S.en[r.LevelName] };
    // the expansion's area levels (MonsterRegion.cpp:934-942); MonLvl is the classic game's, for reference
    o.lvl = [0, 1, 2].map((d) => lvlOf(r, d));
    o.lvlClassic = [0, 1, 2].map((d) => r[`MonLvl${DIFF[d]}`] ?? 0);
    o.size = [0, 1, 2].map((d) => [r[`SizeX${DIFF[d]}`] ?? 0, r[`SizeY${DIFF[d]}`] ?? 0]);
    o.drlg = r.DrlgType;
    o.levelType = r.LevelType;
    if (r.Waypoint !== 255) o.waypoint = r.Waypoint;
    if (r.Depend) o.depend = r.Depend;
    if (r.Quest) o.quest = r.Quest;
    // Vis0–7 name the areas next to this one, Warp0–7 the warp tile to each (tiles to one area are
    // alternatives); one with no warp is walked to (above)
    const links = new Map();
    for (let i = 0; i < 8; i++) {
      const to = r[`Vis${i}`];
      const w = r[`Warp${i}`];
      if (!to || !(w >= 0)) continue;
      if (!WARP.has(w)) throw new Error(`${where}: no lvlwarp ${w}`);
      warps[w] = { name: WARP.get(w).Name, dir: WARP.get(w).Direction };
      if (!links.has(to)) links.set(to, []);
      links.get(to).push(w);
    }
    if (links.size) o.warps = [...links].map(([to, tiles]) => ({ to, tiles }));
    if (walk.get(r.Id).size) o.walk = [...walk.get(r.Id)].sort((a, b) => a - b);
    o.numMon = r.NumMon ?? 0;
    for (const p of ['mon', 'nmon', 'umon']) o[p] = listOf(r, p).filter(has);
    const critters = [];
    for (let i = 1; i <= 4; i++) if (r[`cmon${i}`] && has(r[`cmon${i}`])) critters.push({ mon: r[`cmon${i}`], pct: r[`cpct${i}`] ?? 0 });
    if (critters.length) o.critters = critters;
    o.den = [0, 1, 2].map((d) => r[`MonDen${DIFF[d]}`] ?? 0);
    o.packs = [0, 1, 2].map((d) => [r[`MonUMin${DIFF[d]}`] ?? 0, r[`MonUMax${DIFF[d]}`] ?? 0]);
    if (r.MonWndr) o.wander = true;
    if (r.MonSpcWalk) o.spcWalk = r.MonSpcWalk;
    if (r.rangedspawn) o.rangedSpawn = true;
    o.chestTc = [0, 1, 2].map((d) => chestTc(r, d));
    const su = superuniques.filter((s) => s.area === r.Id).map((s) => s.key);
    if (su.length) o.superuniques = su;
    areas.push(o);
  }

  // ───────────────────────── checks ─────────────────────────
  // every area is reached from the camp through warps and walked joins, but the two behind portals
  const byId = new Map(areas.map((a) => [a.id, a]));
  const exits = (a) => [...(a.warps ?? []).map((w) => w.to), ...(a.walk ?? [])];
  for (const a of areas) for (const t of exits(a)) if (!byId.has(t)) throw new Error(`area ${a.id} leads to ${t}, which is not imported`);
  const reached = new Set([1]);
  for (const q = [1]; q.length; ) {
    for (const t of exits(byId.get(q.shift()))) {
      if (reached.has(t)) continue;
      reached.add(t);
      q.push(t);
    }
  }
  const cut = areas.filter((a) => reached.has(a.id) === PORTAL_ONLY.has(a.id));
  if (cut.length) throw new Error(`areas not reached from the camp, or reached though only a portal leads there: ${cut.map((a) => a.id).join(', ')}`);

  // no official proper noun, and no official transliteration the glossary replaces, may reach the data
  const ours = [
    ...Object.values(monsters).map((m) => m.name),
    ...superuniques.map((s) => s.name),
    ...areas.map((a) => a.name),
    ...Object.values(uniqueNames).flat().map((w) => w.name),
  ].filter(Boolean);
  const leaked = ours.filter((n) => officialNames.has(n.trim()));
  const terms = glossaryOfficial();
  for (const n of ours) {
    const t = terms.find((o) => n.includes(o));
    if (t) leaked.push(`${n} (${t})`);
  }
  if (leaked.length) throw new Error(`official proper-noun names in the world data:\n  ${[...new Set(leaked)].join('\n  ')}`);

  // ───────────────────────── write ─────────────────────────
  const T = (n) => `import type { ${n} } from './types';\n\n`;
  const nested = (arr) => list(arr).replace(/\n/g, '\n  ');
  writeD2x(
    'areas.ts',
    `${T('D2xArea')}/** Act 1's areas, Levels.txt ids 1–39, in id order */\nexport const D2X_AREAS: D2xArea[] = ${list(areas)};\n\n` +
      `/** the warp tiles the areas use (LvlWarp.txt), by id: D2's internal name and the side it faces */\nexport const D2X_WARPS: Record<number, { name: string; dir: string }> = ${record(warps)};\n`,
  );
  writeD2x(
    'monsters.ts',
    `${T('D2xMonster')}/**\n * Every monster Act 1 spawns or brings along, and the pets the game's classes summon, by MonStats\n * id. Life, defense, experience, to-hit and damage are percentages of the D2X_MONLVL row at the\n * monster's level (see D2xMonsterDiff).\n */\nexport const D2X_MONSTERS: Record<string, D2xMonster> = ${record(monsters)};\n\n` +
      `/** what each AI's parameters (D2xMonsterDiff.ai.params, aip1 first) mean, by AI (MonAI.txt; null: unused) */\nexport const D2X_MONSTER_AI: Record<string, (string | null)[]> = ${record(ai)};\n`,
  );
  writeD2x('monlvl.ts', `${T('D2xMonLvl')}/** monster stats by monster level, the expansion columns (MonLvl.txt L-*); index = level, 0–110 */\nexport const D2X_MONLVL: D2xMonLvl[] = ${list(monlvl)};\n`);
  writeD2x(
    'superuniques.ts',
    `${T('D2xMonUMod, D2xSuperUnique, D2xUniqueNameWord')}/** the superuniques Act 1's presets place (SuperUniques.txt) */\nexport const D2X_SUPERUNIQUES: D2xSuperUnique[] = ${list(superuniques)};\n\n` +
      `/** champion and unique modifiers (MonUMod.txt) */\nexport const D2X_MONUMODS: D2xMonUMod[] = ${list(umods)};\n\n` +
      `/** MonUMod.txt's constants column, rows 0–33, read by row index apart from the modifiers (D2MOO MONSTERUNIQUE_GetMonUModTxtRecord(i)->dwConstants) */\nexport const D2X_MONUMOD_CONSTANTS: { value: number; desc: string }[] = ${list(umodConstants)};\n\n` +
      `/** a random unique's name: title + prefix + suffix, the title (ending in ·) first */\nexport const D2X_UNIQUE_NAMES: { prefix: D2xUniqueNameWord[]; suffix: D2xUniqueNameWord[]; title: D2xUniqueNameWord[] } = {\n  prefix: ${nested(uniqueNames.prefix)},\n  suffix: ${nested(uniqueNames.suffix)},\n  title: ${nested(uniqueNames.title)},\n};\n`,
  );
  const n = Object.values(monsters);
  console.log(
    `world: ${areas.length} areas, ${n.length} monsters (${n.filter((m) => m.name).length} named), ${Object.keys(ai).length} AIs, ${monlvl.length} monster levels, ` +
      `${umods.length} monster modifiers, ${superuniques.length} superuniques, ${uniqueNames.prefix.length}+${uniqueNames.suffix.length}+${uniqueNames.title.length} unique name words`,
  );
  return { monsters, superuniques, umods, areas };
}
