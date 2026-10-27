// The characters stage → src/data/d2x/: the seven classes before the Warlock, the three difficulties,
// experience and its level-difference rules, the quality ratios a drop rolls with, NPC prices, the
// gamble list and Act 1's hirelings. Always the expansion rows and columns. D2 keeps many of these in
// fixed point (quarters, eighths, 1024ths); they are converted here, so the game reads plain points,
// fractions and seconds. All of them are k / 2^n, exact as doubles: flooring a product reproduces
// D2's integer maths, and the comments say where D2 floors.
//
// The rules the numbers plug into are cited from D2MOO (github.com/ThePhrozenKeep/D2MOO, the
// reverse-engineered game code) at commit d9d394f, by file and line.
import { REF27, STR, list, load, record, rows, strings, tables, writeD2x } from './load.mjs';
import { exclude, glossaryOfficial, names } from './names.mjs';
import { WARLOCK } from './scope.mjs';

const DIFFICULTIES = ['normal', 'nightmare', 'hell'];

/**
 * DifficultyLevels.txt columns → our keys, all of them, so a new column fails the import instead of
 * being dropped. null: not taken. D2R dropped D2's UberCodeOdds*, UltraCodeOdds* (D2MOO loads them,
 * DataTbls.cpp:1112-1115, but nothing reads them) and renamed HireableBossDamagePercent.
 */
const DIFFICULTY_COLS = {
  Name: null,
  ResistPenalty: 'resistPenalty',
  // the classic game's penalty: this is the expansion
  ResistPenaltyNonExpansion: null,
  DeathExpPenalty: 'deathXpLoss',
  MonsterSkillBonus: 'monsterSkillBonus',
  MonsterFreezeDivisor: 'monsterFreezeDivisor',
  MonsterColdDivisor: 'monsterColdDivisor',
  AiCurseDivisor: 'aiCurseDivisor',
  LifeStealDivisor: 'lifeStealDivisor',
  ManaStealDivisor: 'manaStealDivisor',
  UniqueDamageBonus: 'uniqueDamageBonus',
  ChampionDamageBonus: 'championDamageBonus',
  PlayerDamagePercentVSPlayer: 'playerVsPlayer',
  PlayerDamagePercentVSMercenary: 'playerVsMerc',
  PlayerDamagePercentVSPrimeEvil: 'playerVsPrimeEvil',
  PlayerHitReactBufferVSPlayer: 'hitReactBufferVsPlayer',
  PlayerHitReactBufferVSMonster: 'hitReactBufferVsMonster',
  MercenaryDamagePercentVSPlayer: 'mercVsPlayer',
  MercenaryDamagePercentVSMercenary: 'mercVsMerc',
  MercenaryDamagePercentVSBoss: 'mercVsBoss',
  MercenaryMaxStunLength: 'mercMaxStun',
  PrimeEvilDamagePercentVSPlayer: 'primeEvilVsPlayer',
  PrimeEvilDamagePercentVSMercenary: 'primeEvilVsMerc',
  PrimeEvilDamagePercentVSPet: 'primeEvilVsPet',
  PetDamagePercentVSPlayer: 'petVsPlayer',
  MonsterCEDamagePercent: 'corpseExplosionDamage',
  MonsterFireEnchantExplosionDamagePercent: 'fireEnchantExplosionDamage',
  StaticFieldMin: 'staticFieldMin',
  GambleRare: 'gambleRare',
  GambleSet: 'gambleSet',
  GambleUnique: 'gambleUnique',
  GambleUber: 'gambleUber',
  GambleUltra: 'gambleUltra',
  ResistFloor: 'resistFloor',
  lineNumber: null,
};

/** quest record numbers (D2MOO Quests.h:17-70, QUESTSTATEFLAG_*) → act and quest, for npc.txt's quest discounts */
function questOf(flag) {
  const starts = [[1, 1], [9, 2], [17, 3], [25, 4], [35, 5]];
  const counts = { 1: 6, 2: 6, 3: 6, 4: 3, 5: 6 };
  for (const [first, act] of starts) if (flag >= first && flag < first + counts[act]) return `a${act}q${flag - first + 1}`;
  throw new Error(`npc.txt: quest flag ${flag} is no act's quest`);
}

/** HireDesc strings → the arrow element of the Act 1 hirelings */
const HIRE_ELEMENT = { strhirespecial1: 'fire', strhirespecial2: 'cold' };

export async function buildCharacters({ bases }) {
  const [charJ, classJ, skillsJ, diffJ, expJ, ratioJ, npcJ, hireJ, monJ] =
    await tables('charstats', 'playerclass', 'skills', 'difficultylevels', 'experience', 'itemratio', 'npc', 'hireling', 'monstats');
  // Gamble.txt as 2.7 has it: the 3.x table took the four daggers out (see rows27)
  const gambleJ = await load(REF27, 'gamble');
  const S = await strings('item-modifiers', 'mercenaries', 'monsters');
  const need = (r, col, where) => {
    if (r[col] === undefined) throw new Error(`${where}: no ${col}`);
    return r[col];
  };
  const skillByName = new Map(rows(skillsJ).filter((s) => s.skill).map((s) => [s.skill.toLowerCase(), s]));
  const skill = (n, where) => {
    const s = skillByName.get(String(n).toLowerCase());
    if (!s) throw new Error(`${where}: skill ${n} is not in skills.json`);
    return s;
  };
  const base = (code, where) => {
    if (!bases.has(code)) throw new Error(`${where}: item ${code} is not an imported base`);
    return code;
  };

  // ───────────────────────── classes ─────────────────────────
  // Class ids are PlayerClass.txt's row order; CharStats.txt has the same rows (and an "Expansion"
  // divider, which d2data leaves out), matched up by the class name.
  const order = rows(classJ).sort((a, b) => a.lineNumber - b.lineNumber);
  const classes = {};
  for (const [id, pc] of order.entries()) {
    if (pc.Code === WARLOCK) {
      exclude('charstats', '术士资料片新增', pc.Code);
      continue;
    }
    const where = `charstats ${pc['Player Class']}`;
    const r = rows(charJ).find((x) => x.class === pc['Player Class']);
    if (!r) throw new Error(`${where}: no row`);
    const n = (col) => need(r, col, where);
    // growth is in quarter points: D2 adds LifePerLevel << 6 to life kept in 256ths (D2MOO PlayerStats.cpp:96-111, 157-186)
    const q = (col) => n(col) / 4;
    const tabs = [1, 2, 3].map((page) => {
      const key = n(`StrSkillTab${page}`);
      const strip = (s) => s?.replace(/^(%\+d|\+%d)\s+(to\s+)?/, '');
      if (!S.zh[key]) throw new Error(`${where}: no string ${key}`);
      // the tab's +skills property: skilltab's parameter is class × 3 + page − 1 (Properties.txt)
      return { id: id * 3 + page - 1, page, name: strip(S.zh[key]), en: strip(S.en[key]) };
    });
    const items = [];
    for (let i = 1; i <= 10; i++) {
      if (!r[`item${i}`]) continue;
      const it = { code: base(r[`item${i}`], where), n: r[`item${i}count`] ?? 1 };
      if (r[`item${i}loc`]) it.loc = r[`item${i}loc`];
      items.push(it);
    }
    const c = {
      id,
      en: pc['Player Class'],
      str: n('str'),
      dex: n('dex'),
      vit: n('vit'),
      ene: n('int'),
      stamina: n('stamina'),
      hpadd: n('hpadd'),
      lifePerLvl: q('LifePerLevel'),
      manaPerLvl: q('ManaPerLevel'),
      staminaPerLvl: q('StaminaPerLevel'),
      lifePerVit: q('LifePerVitality'),
      staminaPerVit: q('StaminaPerVitality'),
      manaPerEne: q('ManaPerMagic'),
      statPerLvl: n('StatPerLevel'),
      skillPerLvl: n('SkillsPerLevel'),
      toHitFactor: n('ToHitFactor'),
      blockFactor: n('BlockFactor'),
      manaRegen: n('ManaRegen'),
      walk: n('WalkVelocity'),
      run: n('RunVelocity'),
      // 2 × RunDrain 256ths of a point a frame, 25 frames a second (D2MOO PlrModes.cpp:265)
      runDrain: (n('RunDrain') * 2 * 25) / 256,
      hpPotion: n('HealthPotionPercent'),
      mpPotion: n('ManaPotionPercent'),
      minCastDelay: n('MinimumCastingDelay'),
      light: n('LightRadius'),
    };
    if (r.StartSkill) c.startSkill = skill(r.StartSkill, where).skill;
    c.tabs = tabs;
    c.items = items;
    classes[pc.Code] = c;
  }

  // ───────────────────────── difficulties ─────────────────────────
  const difficulties = rows(diffJ)
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((r, i) => {
      if (r.Name.toLowerCase() !== DIFFICULTIES[i]) throw new Error(`difficultylevels: row ${i} is ${r.Name}`);
      const unknown = Object.keys(r).filter((k) => !(k in DIFFICULTY_COLS));
      if (unknown.length) throw new Error(`difficultylevels: columns with no key: ${unknown.join(', ')}`);
      const o = { id: DIFFICULTIES[i] };
      for (const [col, key] of Object.entries(DIFFICULTY_COLS)) if (key) o[key] = need(r, col, `difficultylevels ${r.Name}`);
      return o;
    });

  // ───────────────────────── experience ─────────────────────────
  const E = rows(expJ);
  const maxRow = E.find((r) => r.Level === 'MaxLvl');
  const levels = E.filter((r) => typeof r.Level === 'number').sort((a, b) => a.Level - b.Level);
  const classNames = order.filter((pc) => pc.Code !== WARLOCK).map((pc) => pc['Player Class']);
  for (const r of [maxRow, ...levels]) {
    if (classNames.some((c) => r[c] !== r[classNames[0]])) throw new Error(`experience ${r.Level}: the classes differ`);
  }
  const maxLevel = maxRow[classNames[0]];
  // ExpRatio of the MaxLvl row is the shift the ratios are in (10: 1024ths), D2MOO SUnitDmg.cpp:3078-3093
  const ratioOne = 2 ** maxRow.ExpRatio;
  const xp = levels.filter((r) => r.Level < maxLevel).map((r) => r[classNames[0]]);
  const xpRatio = levels.filter((r) => r.Level <= maxLevel).map((r) => r.ExpRatio / ratioOne);
  if (xp.length !== maxLevel || xpRatio.length !== maxLevel + 1) throw new Error('experience: missing levels');
  // SUNITDMG_ComputeExperienceGain, D2MOO SUnitDmg.cpp:3044-3076: a monster at or below the hero's level
  // gives lower[hero − monster]; one above gives higher[monster − hero] below level 25, and
  // hero / monster of it from 25 on (both indexes stop at 10). In 256ths there.
  const LOWER = [256, 256, 256, 256, 256, 256, 207, 159, 110, 61, 13];
  const HIGHER = [256, 256, 256, 256, 256, 256, 225, 174, 92, 38, 5];
  const levelDiff = { lower: LOWER.map((f) => f / 256), higher: HIGHER.map((f) => f / 256), ratioFrom: 25 };

  // ───────────────────────── item quality ratios ─────────────────────────
  // ItemRatio.txt, the expansion rows (Version 1): D2MOO DATATBLS_GetItemRatioTxtRecord (ItemsTbls.cpp:1361-1393)
  // picks by two flags: "Uber" is an exceptional or elite weapon or armor (Items.cpp:1168-1184, not quest
  // items), "Class Specific" a base whose own item type names a class (Items.cpp:3517-3535).
  const ratios = rows(ratioJ)
    .filter((r) => r.Version === 1)
    .map((r) => {
      const t = (k, min) => (min ? { ratio: r[k], div: r[`${k}Divisor`], min: r[`${k}Min`] } : { ratio: r[k], div: r[`${k}Divisor`] });
      return { uber: !!r.Uber, cls: !!r['Class Specific'], unique: t('Unique', 1), set: t('Set', 1), rare: t('Rare', 1), magic: t('Magic', 1), superior: t('HiQuality'), normal: t('Normal') };
    });
  for (const uber of [false, true]) for (const cls of [false, true]) {
    if (ratios.filter((x) => x.uber === uber && x.cls === cls).length !== 1) throw new Error(`itemratio: not one Version 1 row for uber ${uber}, class ${cls}`);
  }

  // ───────────────────────── NPC prices ─────────────────────────
  // NPC.txt names prices from the NPC's side: "sell mult" is what the hero pays, "buy mult" what the
  // NPC pays the hero, both of the item's value, in 1024ths (D2MOO Items.cpp:2387-2447)
  const mult = (v) => v / 1024;
  const prices = {};
  for (const r of rows(npcJ).sort((a, b) => a.lineNumber - b.lineNumber)) {
    const where = `npc ${r.npc}`;
    const o = { heroBuys: mult(need(r, 'sell mult', where)), heroSells: mult(need(r, 'buy mult', where)), repair: mult(need(r, 'rep mult', where)) };
    o.maxPay = ['max buy', 'max buy (N)', 'max buy (H)'].map((c) => need(r, c, where));
    const quests = [];
    for (const x of ['A', 'B', 'C']) {
      if (!r[`questflag ${x}`]) continue;
      const m = (c) => mult(need(r, `quest${c}mult ${x}`, where));
      quests.push({ quest: questOf(r[`questflag ${x}`]), heroBuys: m('sell'), heroSells: m('buy'), repair: m('rep') });
    }
    if (quests.length) o.quests = quests;
    prices[r.npc] = o;
  }

  // ───────────────────────── gambling ─────────────────────────
  const gamble = [];
  for (const r of rows(gambleJ)) {
    if (bases.has(r.code)) gamble.push(r.code);
    else exclude('gamble', '底材不收录', r.code);
  }

  // ───────────────────────── hirelings ─────────────────────────
  // Hireling.txt, the expansion rows (Version 100) of Act 1. Each Id is one kind of hireling hired
  // in one difficulty; its rows are level bands, and a hireling's stats grow from the band with the
  // highest level not above its own (D2MOO DATATBLS_GetHirelingTxtRecordFromIdAndLevel, MonsterTbls.cpp:1718-1755).
  const mercNames = names('mercenaries');
  const monByIdx = new Map(rows(monJ).map((m) => [m['*hcIdx'], m]));
  // a hireling is named from NameFirst to NameLast in string-table order (D2MOO SUnitNpc.cpp:68-76)
  const mercTable = rows(await load(STR, 'mercenaries'));
  const strId = new Map(mercTable.map((e) => [e.Key, e.id]));
  const nameRange = (first, last) => mercTable.filter((e) => e.id >= strId.get(first) && e.id <= strId.get(last)).map((e) => e.Key);
  const mercNameOf = {};
  const hirelings = new Map();
  for (const r of rows(hireJ).filter((x) => x.Version === 100 && x.Act === 1)) {
    const where = `hireling ${r.Id} level ${r.Level}`;
    const n = (col) => need(r, col, where);
    const skills = [];
    for (let i = 1; i <= 6; i++) {
      if (!r[`Skill${i}`]) continue;
      const s = skill(r[`Skill${i}`], where);
      const k = (c) => need(r, `${c}${i}`, where);
      skills.push({ skill: s.skill, reqLvl: s.reqlevel ?? 1, mode: k('Mode'), chance: k('Chance'), chancePerLvl: k('ChancePerLvl'), level: k('Level'), lvlPerLvl: k('LvlPerLvl') / 32 });
    }
    const band = {
      level: n('Level'),
      gold: n('Gold'),
      xpPerLvl: n('Exp/Lvl'),
      hp: n('HP'),
      hpPerLvl: n('HP/Lvl'),
      def: n('Defense'),
      defPerLvl: n('Def/Lvl'),
      str: n('Str'),
      strPerLvl: n('Str/Lvl') / 8,
      dex: n('Dex'),
      dexPerLvl: n('Dex/Lvl') / 8,
      ar: n('AR'),
      arPerLvl: n('AR/Lvl'),
      dmg: [n('Dmg-Min'), n('Dmg-Max')],
      dmgPerLvl: n('Dmg/Lvl') / 8,
      resist: ['ResistFire', 'ResistCold', 'ResistLightning', 'ResistPoison'].map(n),
      resistPerLvl: ['ResistFire', 'ResistCold', 'ResistLightning', 'ResistPoison'].map((c) => n(`${c}/Lvl`) / 4),
      skills,
    };
    const mon = monByIdx.get(n('Class'));
    const seller = monByIdx.get(n('Seller'));
    if (!mon || !seller) throw new Error(`${where}: monster ${r.Class} or seller ${r.Seller} is not in monstats`);
    if (!HIRE_ELEMENT[r.HireDesc]) throw new Error(`${where}: unknown HireDesc ${r.HireDesc}`);
    const typeKey = r.Hireling.replace(/\s/g, '');
    if (S.en[typeKey] !== r.Hireling) throw new Error(`${where}: no string ${typeKey} for "${r.Hireling}"`);
    const nameKeys = nameRange(n('NameFirst'), n('NameLast'));
    for (const key of nameKeys) {
      const nm = mercNames.named(key, S.en[key], S.zh[key]);
      if (nm) mercNameOf[key] = nm;
    }
    const type = mercNames.named(typeKey, S.en[typeKey], S.zh[typeKey]);
    const head = {
      id: n('Id'),
      difficulty: n('Difficulty') - 1,
      element: HIRE_ELEMENT[r.HireDesc],
      monster: mon.Id,
      seller: seller.Id,
      cls: n('equivalentcharclass'),
      ...(type ? { type: type.name, typeEn: type.nameEn } : {}),
      names: nameKeys.filter((k) => mercNameOf[k]),
      defaultChance: n('DefaultChance'),
      maxLvlAbove: n('HiringMaxLevelDifference'),
      resurrect: { mul: n('resurrectcostmultiplier'), div: n('resurrectcostdivisor'), max: n('resurrectcostmax') },
    };
    const h = hirelings.get(head.id);
    if (!h) hirelings.set(head.id, { ...head, bands: [band] });
    else {
      // what is not per band must not differ between an Id's bands
      for (const [k, v] of Object.entries(head)) if (JSON.stringify(h[k]) !== JSON.stringify(v)) throw new Error(`${where}: ${k} differs from the Id's first band`);
      if (band.level <= h.bands[h.bands.length - 1].level) throw new Error(`${where}: bands out of level order`);
      h.bands.push(band);
    }
  }
  if (hirelings.size !== 6) throw new Error(`hireling: ${hirelings.size} Act 1 hirelings, expected fire and cold in three difficulties`);
  // a hireling's level is capped one below the hero's highest (D2MOO MonsterAI.cpp:220, SUnitDmg.cpp:3215)
  const hirelingXp = { maxLevel: maxLevel - 1, notKillerShare: 86 / 256, perKillCap: 1 / 64 };

  // no official proper noun, and no official transliteration the glossary replaces, may reach the data
  const terms = glossaryOfficial();
  const ours = [...Object.values(mercNameOf).map((n) => n.name), ...[...hirelings.values()].map((h) => h.type).filter(Boolean)];
  for (const nm of ours) {
    const t = terms.find((o) => nm.includes(o));
    if (t) throw new Error(`hireling name ${nm} holds the official ${t}`);
  }
  for (const k of ['name', 'nameEn']) if (new Set(Object.values(mercNameOf).map((n) => n[k])).size !== Object.keys(mercNameOf).length) throw new Error(`mercenaries.json: two hirelings share a ${k}`);

  // ───────────────────────── write ─────────────────────────
  const T = (names) => `import type { ${names} } from './types';\n\n`;
  writeD2x('classes.ts', `${T('D2xClass')}/** the classes by code (ama, sor, nec, pal, bar, dru, ass): CharStats.txt with growth in whole points */\nexport const D2X_CLASSES: Record<string, D2xClass> = ${record(classes)};\n`);
  writeD2x('difficulty.ts', `${T('D2xDifficulty')}/** normal, nightmare, hell (DifficultyLevels.txt) */\nexport const D2X_DIFFICULTIES: D2xDifficulty[] = ${list(difficulties)};\n`);
  writeD2x(
    'experience.ts',
    `${T('D2xXpLevelDiff')}/** the highest character level; no experience is gained at it (D2MOO SUnitDmg.cpp:3039) */\nexport const D2X_MAX_LEVEL = ${maxLevel};\n\n` +
      `/** total experience at which a hero reaches level L + 1, index L (D2X_XP[0] = 0: level 1) */\nexport const D2X_XP: number[] = ${JSON.stringify(xp)};\n\n` +
      `/** the share of a kill's experience a hero of level L gets, index L (experience.txt ExpRatio) */\nexport const D2X_XP_RATIO: number[] = ${JSON.stringify(xpRatio)};\n\n` +
      `/** how a kill's experience scales with the level difference, before D2X_XP_RATIO */\nexport const D2X_XP_LEVEL_DIFF: D2xXpLevelDiff = ${JSON.stringify(levelDiff)};\n`,
  );
  writeD2x('itemratio.ts', `${T('D2xItemRatio')}/** the quality rolls of a dropped item: one row for each of uber × class specific (ItemRatio.txt, expansion) */\nexport const D2X_ITEM_RATIO: D2xItemRatio[] = ${list(ratios)};\n`);
  writeD2x('npc.ts', `${T('D2xNpcPrices')}/** price multipliers and the most an NPC pays, by NPC (monstats id) */\nexport const D2X_NPC_PRICES: Record<string, D2xNpcPrices> = ${record(prices)};\n`);
  writeD2x('gamble.ts', `/** the base items gambling picks from (Gamble.txt) */\nexport const D2X_GAMBLE: string[] = ${JSON.stringify(gamble)};\n`);
  writeD2x(
    'hirelings.ts',
    `${T('D2xHireling, D2xHirelingXp')}/** Act 1's hirelings by Id: fire and cold for each difficulty (Hireling.txt, expansion rows) */\nexport const D2X_HIRELINGS: D2xHireling[] = ${list([...hirelings.values()])};\n\n` +
      `/** our names for the hirelings, Chinese and English, by D2 string key (a hireling's names are keys into this) */\nexport const D2X_HIRELING_NAMES: Record<string, { name: string; nameEn: string }> = ${record(mercNameOf)};\n\n` +
      `export const D2X_HIRELING_XP: D2xHirelingXp = ${JSON.stringify(hirelingXp)};\n`,
  );
  console.log(
    `characters: ${Object.keys(classes).length} classes, ${difficulties.length} difficulties, ${xp.length} levels, ${ratios.length} item ratio rows, ` +
      `${Object.keys(prices).length} NPC price rows, ${gamble.length} gamble bases, ${hirelings.size} hirelings with ` +
      `${[...hirelings.values()].reduce((s, h) => s + h.bands.length, 0)} level bands, ${Object.keys(mercNameOf).length} hireling names`,
  );
  // the skills stage takes in what the hirelings cast
  return { hirelingSkills: [...new Set([...hirelings.values()].flatMap((h) => h.bands.flatMap((b) => b.skills.map((s) => s.skill))))] };
}
