// The skill calc evaluator (src/game/d2/skillcalc.ts): Fog's rules on small calcs, the Rogue Scout's
// five skills at levels 1–60, and ten of the heroes' skills against what D2's tooltip shows. Every
// expected value is worked out by hand from the D2R 2.7 rows quoted here (Skills.txt, Missiles.txt
// in tools/.d2cache and the m2a tables); each row is first checked against what the import made of
// it (D2X_SKILLS, D2X_MISSILES), so the arithmetic stands on the game's own data.
//
// The rules the hand arithmetic follows (D2MOO D2Skills.cpp): elemental damage is (E + bands) <<
// HitShift in 256ths, bands adding EMinLev1 a level to 8, EMinLev2 to 16, EMinLev3 to 22, EMinLev4
// to 28, EMinLev5 on; a synergy adds floor(256ths × % / 100); the tooltip shows >> 8. Lengths add
// ELevLen1 to 8, ELevLen2 to 16, ELevLen3 on, in frames (25 a second). Mana is (mana + (lvl − 1) ×
// lvlmana) << manashift 256ths.
import assert from 'node:assert/strict';

export default async (load) => {
  const sc = await load('/src/game/d2/skillcalc.ts');
  const { D2X_SKILLS } = await load('/src/data/d2x/skills.ts');
  const { D2X_MISSILES } = await load('/src/data/d2x/missiles.ts');
  const { D2X_SKILL_CALC, D2X_MISSILE_CALC } = await load('/src/data/d2x/calc.ts');
  const { M_PER_SUBTILE } = await load('/src/game/d2/stats.ts');
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} is not ${b}`);
  const S = D2X_SKILLS;

  // ───────────────────────── the rows, against the import ─────────────────────────
  // What the import makes of a row (tools/d2/skills.mjs): damage × 2^HitShift / 256 points, mana ×
  // 2^manashift / 256 points, lengths ÷ 25 seconds; params and calcs as written.
  const pts = (row, v) => (v * 2 ** row.HitShift) / 256;
  const bands = (row, base, lev) => [base, ...lev].map((v) => pts(row, v));
  function checkRow(name, row) {
    const s = S[name];
    assert.ok(s, `${name} imported`);
    if (row.EMin !== undefined || row.EMax !== undefined) {
      assert.deepEqual(s.elem.min, bands(row, row.EMin ?? 0, row.EMinLev ?? [0, 0, 0, 0, 0]), `${name} EMin`);
      assert.deepEqual(s.elem.max, bands(row, row.EMax ?? 0, row.EMaxLev ?? [0, 0, 0, 0, 0]), `${name} EMax`);
    }
    assert.equal(s.elem?.type, row.EType, `${name} EType`);
    assert.equal(s.elem?.sym, row.EDmgSymPerCalc, `${name} EDmgSymPerCalc`);
    assert.equal(s.elem?.lenSym, row.ELenSymPerCalc, `${name} ELenSymPerCalc`);
    if (row.ELen !== undefined) assert.deepEqual(s.elem.len, [row.ELen, ...(row.ELevLen ?? [0, 0, 0])].map((f) => f / 25), `${name} ELen`);
    else assert.equal(s.elem?.len, undefined, `${name} has no ELen`);
    if (row.mana !== undefined || row.lvlmana !== undefined) {
      const k = 2 ** row.manashift / 256;
      assert.deepEqual(s.mana, { base: (row.mana ?? 0) * k, perLvl: (row.lvlmana ?? 0) * k, ...(row.minmana ? { min: row.minmana } : {}) }, `${name} mana`);
    } else assert.equal(s.mana, undefined, `${name} costs nothing`);
    if (row.ToHit !== undefined) assert.deepEqual(s.toHit, { base: row.ToHit, perLvl: row.LevToHit ?? 0 }, `${name} ToHit`);
    assert.deepEqual(s.params, row.Param, `${name} params`);
    assert.deepEqual(s.calcs, row.calc, `${name} calcs`);
    if (row.aura) assert.deepEqual({ len: s.aura.len, range: s.aura.range, stats: s.aura.stats }, row.aura, `${name} aura`);
    if (row.passive) assert.deepEqual(s.passive.stats, row.passive, `${name} passive`);
    if (row.MinDam !== undefined) {
      assert.deepEqual(s.phys.min, bands(row, row.MinDam, row.MinLevDam), `${name} MinDam`);
      assert.deepEqual(s.phys.max, bands(row, row.MaxDam, row.MaxLevDam), `${name} MaxDam`);
    }
  }

  // Skills.txt (D2R 2.7), the columns the calcs read; EMinLev and the like are the five bands
  const ROWS = {
    'Inner Sight': {
      HitShift: 8, EMin: 40, EMinLev: [25, 45, 60, 80, 100], EMax: 0, mana: 10, manashift: 7, minmana: 1,
      Param: { 1: 40, 2: 25, 3: 200, 4: 100, 5: 27, 6: 0 },
      aura: { len: 'ln34', range: 'ln56', stats: [{ stat: 'armorclass', calc: '-edmn' }] },
    },
    'Fire Arrow': {
      HitShift: 8, EType: 'fire', EMin: 1, EMinLev: [2, 3, 6, 12, 24], EMax: 4, EMaxLev: [2, 3, 7, 14, 27],
      EDmgSymPerCalc: "(skill('Exploding Arrow'.blvl)) * par8", mana: 24, manashift: 5, minmana: 1, ToHit: 10, LevToHit: 9, Param: { 8: 12 },
    },
    'Exploding Arrow': {
      HitShift: 8, EType: 'fire', EMin: 5, EMinLev: [6, 12, 14, 16, 20], EMax: 13, EMaxLev: [7, 13, 15, 18, 23],
      EDmgSymPerCalc: "(skill('Fire Arrow'.blvl)) * par8", mana: 20, lvlmana: 1, manashift: 6, minmana: 1, ToHit: 20, LevToHit: 9, Param: { 8: 14 },
    },
    'Cold Arrow': {
      HitShift: 7, EType: 'cold', EMin: 6, EMinLev: [4, 5, 8, 16, 42], EMax: 8, EMaxLev: [4, 5, 9, 17, 44], ELen: 100, ELevLen: [30, 30, 30],
      EDmgSymPerCalc: "(skill('Ice Arrow'.blvl)) * par8", mana: 28, lvlmana: 1, manashift: 5, minmana: 1, ToHit: 10, LevToHit: 9, Param: { 8: 12 },
    },
    'Freezing Arrow': {
      HitShift: 8, EType: 'cold', EMin: 40, EMinLev: [10, 15, 20, 22, 24], EMax: 50, EMaxLev: [10, 15, 20, 22, 24], ELen: 50,
      EDmgSymPerCalc: "(skill('Cold Arrow'.blvl))*par8", ELenSymPerCalc: "(skill('Ice Arrow'.blvl)) * par7",
      mana: 36, lvlmana: 1, manashift: 6, minmana: 1, ToHit: 40, LevToHit: 9, Param: { 1: 5, 7: 5, 8: 12 }, calc: { 1: 'par1' },
    },
    'Fire Bolt': {
      HitShift: 7, EType: 'fire', EMin: 6, EMinLev: [3, 4, 8, 18, 54], EMax: 12, EMaxLev: [3, 6, 10, 20, 56],
      EDmgSymPerCalc: "(skill('Fire Ball'.blvl)+skill('Meteor'.blvl))*par8", mana: 5, manashift: 7, minmana: 1, Param: { 8: 16 },
    },
    'Charged Bolt': {
      HitShift: 7, EType: 'ltng', EMin: 4, EMinLev: [1, 1, 2, 3, 4], EMax: 8, EMaxLev: [1, 1, 2, 3, 4],
      EDmgSymPerCalc: "(skill('Lightning'.blvl))*par8", mana: 24, lvlmana: 4, manashift: 5, minmana: 1, Param: { 1: 3, 2: 1, 8: 6 }, calc: { 1: 'min(24,ln12)' },
    },
    'Ice Bolt': {
      HitShift: 7, EType: 'cold', EMin: 6, EMinLev: [2, 4, 6, 8, 10], EMax: 10, EMaxLev: [3, 5, 7, 9, 11], ELen: 150, ELevLen: [35, 35, 35],
      EDmgSymPerCalc: "(skill('Frost Nova'.blvl)+skill('Ice Blast'.blvl)+skill('Glacial Spike'.blvl)+skill('Blizzard'.blvl)+skill('Frozen Orb'.blvl))*par8",
      mana: 3, manashift: 8, minmana: 1, Param: { 8: 15 },
    },
    'Frost Nova': {
      HitShift: 7, EType: 'cold', EMin: 4, EMinLev: [6, 8, 10, 12, 14], EMax: 8, EMaxLev: [7, 9, 11, 13, 15], ELen: 200, ELevLen: [25, 25, 25],
      EDmgSymPerCalc: "(skill('Blizzard'.blvl)+skill('Frozen Orb'.blvl))*par8", mana: 9, lvlmana: 1, manashift: 8, minmana: 1, Param: { 8: 10 }, calc: { 1: 0 },
    },
    Blizzard: {
      HitShift: 8, EType: 'cold', EMin: 45, EMinLev: [15, 30, 45, 55, 65], EMax: 75, EMaxLev: [16, 31, 46, 56, 66], ELen: 100,
      EDmgSymPerCalc: "(skill('Ice Bolt'.blvl)+skill('Ice Blast'.blvl)+skill('Glacial Spike'.blvl))*par8",
      mana: 23, lvlmana: 1, manashift: 8, minmana: 1, Param: { 1: 7, 3: 4, 8: 5 }, calc: { 1: 'par1', 2: 'par3' },
    },
    'Holy Bolt': {
      HitShift: 8, EType: 'mag', EMin: 8, EMinLev: [8, 10, 13, 16, 20], EMax: 16, EMaxLev: [8, 11, 15, 18, 23],
      EDmgSymPerCalc: "skill('Fist of the Heavens'.blvl)*par8", mana: 32, lvlmana: 1, manashift: 4, minmana: 1,
      Param: { 1: 1, 2: 2, 3: 6, 4: 4, 7: 20, 8: 50 },
      calc: { 1: "ln12 * (100 + skill('Prayer'.blvl) * par7) / 100", 2: "ln34 * (100 + skill('Prayer'.blvl) * par7) / 100" },
    },
    Might: { HitShift: 8, Param: { 1: 16, 2: 2, 3: 40, 4: 10 }, aura: { len: undefined, range: 'ln12', stats: [{ stat: 'damagepercent', calc: 'ln34' }] } },
    Prayer: {
      HitShift: 8, EMin: 2, EMinLev: [1, 1, 2, 2, 3], EMax: 0, mana: 16, lvlmana: 3, manashift: 4, minmana: 1, Param: { 1: 16, 2: 2 },
      aura: { len: undefined, range: 'ln12', stats: [{ stat: 'hitpoints', calc: 'edns' }] },
    },
    'Holy Fire': {
      HitShift: 7, EType: 'fire', EMin: 2, EMinLev: [1, 4, 6, 7, 8], EMax: 6, EMaxLev: [2, 5, 7, 8, 9],
      EDmgSymPerCalc: "skill('Resist Fire'.blvl)*par8+skill('Salvation'.blvl)*par7", Param: { 1: 6, 2: 1, 5: 6, 6: 100, 7: 10, 8: 21 },
      aura: { len: undefined, range: 'ln12', stats: undefined },
      passive: [{ stat: 'firemindam', calc: 'enms*par5/256' }, { stat: 'firemaxdam', calc: 'exms*par5/256' }],
    },
    'Fist of the Heavens': {
      HitShift: 8, EType: 'ltng', EMin: 150, EMinLev: [15, 30, 45, 55, 65], EMax: 200, EMaxLev: [15, 30, 45, 55, 65],
      EDmgSymPerCalc: "skill('Holy Shock'.blvl)*par8", mana: 25, manashift: 8, minmana: 1, Param: { 1: 6, 2: 1, 3: 1, 4: 2, 5: 6, 6: 2, 8: 7 },
      calc: { 1: 'ln34', 2: 'ln56', 4: 'ln12' }, aura: { len: undefined, range: 20, stats: undefined },
    },
    'Holy Shock': {
      HitShift: 8, EType: 'ltng', EMin: 1, EMax: 10, EMaxLev: [6, 8, 10, 12, 15], EDmgSymPerCalc: "skill('Resist Lightning'.blvl)*par8+skill('Salvation'.blvl)*par7",
      Param: { 1: 6, 2: 1, 5: 6, 6: 100, 7: 4, 8: 12 },
      aura: { len: undefined, range: 'ln12', stats: undefined },
      passive: [{ stat: 'lightmindam', calc: 1 }, { stat: 'lightmaxdam', calc: 'exms*par5/256' }],
    },
    'Holy Shield': {
      HitShift: 8, MinDam: 3, MinLevDam: [2, 3, 4, 4, 4], MaxDam: 6, MaxLevDam: [2, 3, 4, 4, 4], mana: 35, manashift: 8, minmana: 1,
      Param: { 1: 750, 2: 625, 3: 25, 4: 15, 5: 10, 6: 40, 8: 15 }, calc: { 1: "ln34+skill('Defiance'.blvl)*par8" },
    },
    Teleport: { HitShift: 8, mana: 24, lvlmana: -1, manashift: 8, minmana: 1 },
  };
  for (const [name, row] of Object.entries(ROWS)) checkRow(name, row);

  // Missiles.txt (D2R 2.7): the missiles the five arrows and the cross-checks read
  assert.deepEqual([D2X_MISSILES.firearrow.funcs.dmg, D2X_MISSILES.firearrow.calcs.dmg, D2X_MISSILES.firearrow.dmgParams], [1, 'dl12', { 1: 3, 2: 2 }], 'firearrow: pSrvDmgFunc 1, DmgCalc1 dl12, dParam 3 / 2');
  assert.deepEqual([D2X_MISSILES.coldarrow.funcs.dmg, D2X_MISSILES.coldarrow.calcs.dmg, D2X_MISSILES.coldarrow.dmgParams], [1, 'dl12', { 1: 3, 2: 2 }], 'coldarrow: the same');
  assert.deepEqual([D2X_MISSILES.explodingarrow.funcs.hit, D2X_MISSILES.explodingarrow.sub.hit], [4, ['explodingarrowexp2']], 'explodingarrow: pSrvHitFunc 4, HitSubMissile1');
  assert.deepEqual([D2X_MISSILES.explodingarrowexp2.funcs.hit, D2X_MISSILES.explodingarrowexp2.hitParams[1], D2X_MISSILES.explodingarrowexp2.skill], [1, 5, 'Exploding Arrow'], 'explodingarrowexp2: pSrvHitFunc 1, sHitPar1 5');
  assert.deepEqual([D2X_MISSILES.freezingarrow.funcs.hit, D2X_MISSILES.freezingarrow.sub.hit], [4, ['freezingarrowexp3']], 'freezingarrow');
  assert.deepEqual([D2X_MISSILES.freezingarrowexp3.funcs.hit, D2X_MISSILES.freezingarrowexp3.hitParams[1], D2X_MISSILES.freezingarrowexp3.skill], [1, 5, 'Freezing Arrow'], 'freezingarrowexp3');
  // fistoftheheavensbolt: HitShift 8, EMin 40 / MinELev 6 10 16 32 48, EMax 50 / the same, EDmgSymPerCalc skill('Holy Bolt'.blvl) * 15
  assert.deepEqual(D2X_MISSILES.fistoftheheavensbolt.elem, { type: 'mag', min: [40, 6, 10, 16, 32, 48], max: [50, 6, 10, 16, 32, 48], sym: "skill('Holy Bolt'.blvl) * 15" });
  assert.deepEqual(S['Fist of the Heavens'].desc.missiles, ['fistoftheheavensbolt'], 'descmissile1');
  assert.deepEqual(D2X_MISSILES.blizzardcenter.range, [100, 0], 'blizzardcenter: Range 100');
  assert.deepEqual(S.Blizzard.desc.lines2[0].calcA, "miss('blizzardcenter'.rang)", "Blizzard's duration line");

  // ───────────────────────── Fog's rules ─────────────────────────
  // on Might's codes at level 1: par1 16, ln12 16
  const fog = (expr, ctx = { lvl: 1 }) => sc.skillCalc('Might', expr, ctx);
  assert.equal(fog('2+3*4'), 14);
  assert.equal(fog('(2+3)*4'), 20);
  assert.equal(fog('7/2'), 3, '/ truncates');
  assert.equal(fog('-7/2'), -3, 'the minus binds first, and / truncates toward 0');
  assert.equal(fog('7/0'), 0, '/ 0 is 0');
  assert.equal(fog('2^10'), 1024);
  assert.equal(fog('2^0'), 1, 'a ^ b is 1 for b ≤ 0');
  assert.equal(fog('-2^2'), 4, 'unary minus before ^');
  assert.equal(fog('2^3^2'), 64, '^ goes left to right');
  assert.equal(fog('65536*65536'), 0, 'int32: 2^32 wraps to 0');
  assert.equal(fog('2147483647+1'), -2147483648, 'int32 overflow');
  assert.equal(fog('1 < 2'), 1);
  assert.equal(fog('3 != 3'), 0);
  assert.equal(fog('(1 > 2) ? 10 : 20'), 20);
  // a bare comparison binds looser than ?: here: 1 > (2 ? 10 : 20), and the calc stops at the ?: with 10
  assert.equal(fog('1 > 2 ? 10 : 20'), 10);
  // an operator after the : writes the ?: out first: (c ? 10 : 20) * 3, cut at the ?: by default
  assert.equal(fog('(1 > 2) ? 10 : 20 * 3'), 20);
  assert.equal(fog('(1 > 2) ? 10 : 20 * 3', { lvl: 1, ternaryEnds: false }), 60);
  assert.throws(() => fog('(1 > 2) ? 10 + 1 : 20'), /lacks its operands/, 'an operator in the ? branch does not compile');
  assert.throws(() => fog('(1 > 2) ? -1 : 2'), /lacks its operands/, 'a - after ? is a subtraction');
  assert.throws(() => fog('min(-5, 3)'), /lacks its operands/, "a - after a function's ( is a subtraction");
  assert.equal(fog('min(0-5, 3)'), -5);
  assert.equal(fog('(2+3'), 5, 'a ( left open is closed at the end');
  assert.equal(fog('2*(3+4'), 7, '… where it ends the calc');
  assert.equal(fog('max(ln12, 100)'), 100);
  assert.equal(fog('MIN(ln12, 5)'), 5, 'function names in any case');
  assert.throws(() => fog('LN12'), /no skill calc code/, 'codes keep their case');
  assert.throws(() => fog('foo'));
  assert.throws(() => fog(''));
  assert.throws(() => fog("skill('No Such Skill'.blvl)"), /no skill/);
  assert.throws(() => fog("skill('Fire Arrow'.nope)"), /no code/);
  assert.equal(fog(25), 25, 'a number is itself');
  assert.equal(fog(undefined), 0, 'no calc reads 0');

  // Zeal's calc2 (Skills.txt): ((lvl < 5) ? 0 : ((lvl-4) * par4))+skill('Sacrifice'.blvl)*par8, par4 6, par8 12.
  // Level 10, Sacrifice 5: D2MOO stops at the ?: with (10 − 4) × 6 = 36; evaluated on, + 5 × 12 = 96
  assert.equal(S.Zeal.calcs[2], "((lvl < 5) ? 0 : ((lvl-4) * par4))+skill('Sacrifice'.blvl)*par8");
  assert.deepEqual([S.Zeal.params[4], S.Zeal.params[8]], [6, 12]);
  assert.equal(sc.skillValue('Zeal', 'clc2', { lvl: 10, skills: { Sacrifice: 5 } }), 36);
  assert.equal(sc.skillValue('Zeal', 'clc2', { lvl: 10, skills: { Sacrifice: 5 }, ternaryEnds: false }), 96);
  assert.equal(sc.skillValue('Zeal', 'clc2', { lvl: 3, skills: { Sacrifice: 5 }, ternaryEnds: false }), 60);

  // dmXY is D2MOO's (D2Common_11033): Fanaticism's dm34, par3 10 → par4 40. Level 3: 110 × 3 / 9 = 36,
  // 30 × 36 / 100 = 10, so 20; SkillCalc.txt's description, 110 × 3 × 30 / 900 = 11, reads 21. Level 100:
  // 11000 / 106 = 103, 30 × 103 / 100 = 30, 40, at par4; the description gives 31 over it, 41
  assert.deepEqual([S.Fanaticism.params[3], S.Fanaticism.params[4]], [10, 40]);
  assert.equal(D2X_SKILL_CALC.dm34.expr, '((110 * lvl) * (par4 - par3)) / (100 * (lvl + 6)) + par3');
  assert.equal(sc.skillValue('Fanaticism', 'dm34', { lvl: 1 }), 14, '10 + 30 × 15 / 100');
  assert.equal(sc.skillValue('Fanaticism', 'dm34', { lvl: 3 }), 20);
  assert.equal(sc.skillCalc('Fanaticism', D2X_SKILL_CALC.dm34.expr, { lvl: 3 }), 21);
  assert.equal(sc.skillValue('Fanaticism', 'dm34', { lvl: 100 }), 40);
  assert.equal(sc.skillCalc('Fanaticism', D2X_SKILL_CALC.dm34.expr, { lvl: 100 }), 41);
  // lnXY is the description's to the letter. Might at 1, 2, 20, 60: ln12 = 16 + 2 (lvl − 1), ln34 = 40 +
  // 10 (lvl − 1), and no par5–par8
  const lns = { ln12: [16, 18, 54, 134], ln34: [40, 50, 230, 630], ln56: [0, 0, 0, 0], ln78: [0, 0, 0, 0] };
  for (const [code, want] of Object.entries(lns)) {
    assert.deepEqual([1, 2, 20, 60].map((l) => sc.skillValue('Might', code, { lvl: l })), want, code);
    assert.deepEqual([1, 2, 20, 60].map((l) => sc.skillCalc('Might', D2X_SKILL_CALC[code].expr, { lvl: l })), want, `${code}'s description`);
  }
  // below level 1 the level-banded codes read 0, the params do not
  assert.deepEqual([sc.skillValue('Might', 'ln34', { lvl: 0 }), sc.skillValue('Might', 'par3', { lvl: 0 })], [0, 40]);

  // ───────────────────────── every code, every calc of the data ─────────────────────────
  const anyCtx = (lvl) => ({ lvl, ulvl: 30, mastery: { fire: 10, cold: 10, ltng: 10, pois: 10 }, stat: () => 7, skills: Object.fromEntries(Object.keys(S).map((k) => [k, 3])) });
  for (const code of Object.keys(D2X_SKILL_CALC)) {
    if (sc.UNSUPPORTED_CODES[code]) {
      assert.throws(() => sc.skillValue('Fist of the Heavens', code, anyCtx(5)), new RegExp(code), code);
      continue;
    }
    for (const skill of ['Fist of the Heavens', 'Inner Sight', 'Holy Shield', 'Hydra']) {
      const v = sc.skillValue(skill, code, anyCtx(5));
      assert.ok(Number.isInteger(v), `${skill} ${code}: ${v}`);
    }
  }
  for (const code of Object.keys(D2X_MISSILE_CALC)) {
    if (sc.UNSUPPORTED_MISSILE_CODES[code]) assert.throws(() => sc.missileValue('fistoftheheavensbolt', code, anyCtx(5)), new RegExp(code), code);
    else assert.ok(Number.isInteger(sc.missileValue('fistoftheheavensbolt', code, anyCtx(5))), code);
  }
  assert.equal(Object.keys(D2X_SKILL_CALC).length + Object.keys(D2X_MISSILE_CALC).length, 127 + 47, 'the import has its 127 + 47 codes');
  // every calc the import keeps evaluates, at levels 0, 1, 20 and 60; only Inferno's mana a second cannot
  const columns = (s) => [
    ...['lines', 'lines2', 'lines3'].flatMap((b) => (s.desc?.[b] ?? []).flatMap((l) => [l.calcA, l.calcB])),
    ...(s.desc?.damCalc ?? []), s.phys?.sym, s.elem?.sym, s.elem?.lenSym, s.toHit && 'calc' in s.toHit ? s.toHit.calc : undefined,
    ...Object.values(s.calcs ?? {}), s.aura?.len, s.aura?.range, ...(s.aura?.stats ?? []).map((x) => x.calc), s.perDelay,
    ...(s.passive?.stats ?? []).map((x) => x.calc), s.pet?.max, ...(s.summon?.skills ?? []).map((x) => x.lvl), ...(s.charge?.calcs ?? []),
  ].filter((c) => c !== undefined && c !== null);
  let evaluated = 0;
  for (const [name, s] of Object.entries(S)) {
    for (const c of columns(s)) {
      for (const l of [0, 1, 20, 60]) {
        if (c === 'mps') {
          assert.throws(() => sc.skillCalc(name, c, anyCtx(l)), /manashift/);
          continue;
        }
        assert.ok(Number.isInteger(sc.skillCalc(name, c, anyCtx(l))), `${name} ${c} at ${l}`);
        evaluated++;
      }
    }
  }
  for (const [name, m] of Object.entries(D2X_MISSILES)) {
    for (const c of [m.calcs?.srv, m.calcs?.hit, m.calcs?.dmg, m.elem?.sym].filter((x) => x !== undefined)) {
      for (const l of [0, 1, 20]) assert.ok(Number.isInteger(sc.missileCalc(name, c, anyCtx(l))), `${name} ${c} at ${l}`);
    }
  }
  assert.ok(evaluated > 2000, `${evaluated} calcs`);

  // ───────────────────────── the Rogue Scout's skills, levels 1–60 ─────────────────────────
  const L = [1, 2, 8, 9, 16, 17, 20, 22, 23, 28, 29, 60];
  const val = (skill, code, ctx) => L.map((l) => sc.skillValue(skill, code, { lvl: l, ...ctx }));

  // Inner Sight. Enemy defense −edmn: 40, + 25 a level to 8 (215), + 45 to 16 (575), + 60 to 22 (935),
  // + 80 to 28 (1415), + 100 on (60: 1415 + 32 × 100). Length ln34 = 200 + 100 (lvl − 1) frames.
  // Radius ln56 = 27 + 0, sub-tiles at every level (the tooltip's 27 × 2 / 3 = 18 yards)
  assert.deepEqual(val('Inner Sight', 'edmn'), [40, 65, 215, 260, 575, 635, 815, 935, 1015, 1415, 1515, 4615]);
  assert.deepEqual(val('Inner Sight', 'len'), [200, 300, 900, 1000, 1700, 1800, 2100, 2300, 2400, 2900, 3000, 6100]);
  assert.deepEqual(val('Inner Sight', 'rng'), L.map(() => 27));
  assert.deepEqual(sc.auraStats('Inner Sight', { lvl: 1 }), [{ stat: 'armorclass', value: -40 }]);
  assert.deepEqual(sc.auraStats('Inner Sight', { lvl: 60 }), [{ stat: 'armorclass', value: -4615 }]);
  assert.equal(sc.auraSeconds('Inner Sight', { lvl: 1 }), 8, '200 frames');
  assert.equal(sc.auraSeconds('Inner Sight', { lvl: 20 }), 84, '2100 frames');
  near(sc.auraRadius('Inner Sight', { lvl: 1 }), 27 * M_PER_SUBTILE, 'Inner Sight radius');
  near(sc.auraRadius('Inner Sight', { lvl: 60 }), 27 * M_PER_SUBTILE, 'the radius does not grow');
  assert.equal(sc.skillCalc('Inner Sight', 'ln56*2', { lvl: 1 }) / 3, 18, "the tooltip's yards");
  assert.equal(sc.manaCost('Inner Sight', 1), 5, '10 << 7 = 1280 256ths');

  // Fire Arrow, HitShift 8: min 1 + 2 a level to 8 (15), + 3 to 16 (39), + 6 to 22 (75), + 12 to 28
  // (147), + 24 on; max 4, + 2 (18), + 3 (42), + 7 (84), + 14 (168), + 27
  assert.deepEqual(val('Fire Arrow', 'enma'), [1, 3, 15, 18, 39, 45, 63, 75, 87, 147, 171, 915]);
  assert.deepEqual(val('Fire Arrow', 'exma'), [4, 6, 18, 21, 42, 49, 70, 84, 98, 168, 195, 1032]);
  // its synergy, Exploding Arrow 12% a level: level 1 with 3, 36%: 256 + floor(92.16) = 348, 1024 + floor(368.64) = 1392
  assert.deepEqual(sc.elemDamage('Fire Arrow', { lvl: 1, skills: { 'Exploding Arrow': 3 } }), { type: 'fire', min: 348 / 256, max: 1392 / 256 });
  // level 20 with 20, 240%: 63 × 256 = 16128 + floor(38707.2) = 54835 (214 shown); 17920 + 43008 = 60928 (238)
  assert.deepEqual(sc.elemDamage('Fire Arrow', { lvl: 20, skills: { 'Exploding Arrow': 20 } }), { type: 'fire', min: 54835 / 256, max: 238 });
  assert.deepEqual(['enma', 'exma'].map((c) => sc.skillValue('Fire Arrow', c, { lvl: 20, skills: { 'Exploding Arrow': 20 } })), [214, 238]);
  assert.deepEqual(val('Fire Arrow', 'toht'), L.map((l) => 10 + 9 * (l - 1)), 'ToHit 10 + 9 a level');
  assert.equal(sc.toHitBonus('Fire Arrow', { lvl: 20 }), 181);
  assert.equal(sc.manaCost('Fire Arrow', 1), 3, '24 << 5 = 768 256ths');
  // D2R's conversion: firearrow's DmgCalc1 dl12 = 3 + 2 (lvl − 1) % of the physical as fire, kept to 100
  assert.deepEqual([1, 20, 49, 50, 60].map((l) => sc.convertPct('firearrow', { lvl: l })), [3, 41, 99, 100, 100]);
  assert.equal(sc.missileValue('firearrow', 'dl12', { lvl: 50 }), 101, 'the calc itself is not kept');
  assert.equal(sc.skillCalc('Fire Arrow', S['Fire Arrow'].desc.lines[3].calcA, { lvl: 20 }), 41, "the tooltip's 3+(lvl-1)*2");
  assert.equal(sc.convertPct('explodingarrow', { lvl: 5 }), 0, 'no such damage function');

  // Exploding Arrow: min 5 + 6 a level (47), + 12 (143), + 14 (227), + 16 (323), + 20; max 13 + 7 (62),
  // + 13 (166), + 15 (256), + 18 (364), + 23
  assert.deepEqual(val('Exploding Arrow', 'enma'), [5, 11, 47, 59, 143, 157, 199, 227, 243, 323, 343, 963]);
  assert.deepEqual(val('Exploding Arrow', 'exma'), [13, 20, 62, 75, 166, 181, 226, 256, 274, 364, 387, 1100]);
  // its synergy, Fire Arrow 14% a level: level 1 with 5, 70%: 1280 + 896 = 2176; 3328 + floor(2329.6) = 5657
  assert.deepEqual(sc.elemDamage('Exploding Arrow', { lvl: 1, skills: { 'Fire Arrow': 5 } }), { type: 'fire', min: 2176 / 256, max: 5657 / 256 });
  // the synergy reads Fire Arrow's base level: 3 points (5 with items) give 42%: 1280 + floor(537.6) = 1817
  assert.equal(sc.elemDamage('Exploding Arrow', { lvl: 1, skills: { 'Fire Arrow': { blvl: 3, lvl: 5 } } }).min, 1817 / 256);
  assert.equal(sc.skillCalc('Exploding Arrow', "skill('Fire Arrow'.lvl)", { lvl: 1, skills: { 'Fire Arrow': { blvl: 3, lvl: 5 } } }), 5);
  // mana (20 + (lvl − 1)) << 6: 1280, 1344… 256ths; ToHit 20 + 9 a level
  assert.deepEqual([1, 2, 20, 60].map((l) => sc.manaCost('Exploding Arrow', l)), [5, 5.25, 9.75, 19.75]);
  assert.deepEqual([1, 20, 60].map((l) => sc.toHitBonus('Exploding Arrow', { lvl: l })), [20, 191, 551]);
  // the blast: explodingarrow's hit (SrvHit04) makes explodingarrowexp2, whose hit (SrvHit01) reaches sHitPar1 5 sub-tiles
  near(sc.skillBlastRadius('Exploding Arrow', { lvl: 1 }), 5 * M_PER_SUBTILE, 'Exploding Arrow blast');
  near(sc.skillBlastRadius('Exploding Arrow', { lvl: 60 }), 5 * M_PER_SUBTILE, 'Exploding Arrow blast at 60');
  near(sc.blastRadius('explodingarrowexp2', { lvl: 7 }), 5 * M_PER_SUBTILE, 'explodingarrowexp2');
  assert.equal(sc.blastRadius('explodingarrow', { lvl: 7 }), undefined, 'the arrow itself does not blast');
  assert.equal(sc.skillBlastRadius('Fire Arrow', { lvl: 3 }), undefined);

  // Cold Arrow, HitShift 7, so a point is 2: min 6 + 4 a level (34), + 5 (74), + 8 (122), + 16 (218),
  // + 42; max 8 + 4 (36), + 5 (76), + 9 (130), + 17 (232), + 44. Points are half; the tooltip floors
  const coldMin = [6, 10, 34, 39, 74, 82, 106, 122, 138, 218, 260, 1562];
  const coldMax = [8, 12, 36, 41, 76, 85, 112, 130, 147, 232, 276, 1640];
  assert.deepEqual(L.map((l) => sc.elemDamage('Cold Arrow', { lvl: l })), L.map((_, i) => ({ type: 'cold', min: coldMin[i] / 2, max: coldMax[i] / 2 })));
  assert.deepEqual(val('Cold Arrow', 'enma'), [3, 5, 17, 19, 37, 41, 53, 61, 69, 109, 130, 781]);
  assert.deepEqual(val('Cold Arrow', 'exma'), [4, 6, 18, 20, 38, 42, 56, 65, 73, 116, 138, 820]);
  // cold length ELen 100 frames, + 30 a level: 100, 130, 310 (8), 550 (16), 670 (20), 1870 (60)
  assert.deepEqual(val('Cold Arrow', 'edln'), [100, 130, 310, 340, 550, 580, 670, 730, 760, 910, 940, 1870]);
  assert.deepEqual([1, 2, 20, 60].map((l) => sc.elemSeconds('Cold Arrow', { lvl: l })), [4, 5.2, 26.8, 74.8]);
  // its synergy is Ice Arrow's, which the hireling lacks; given 5 levels, 60%: 768 + floor(460.8) = 1228, 1024 + floor(614.4) = 1638
  assert.deepEqual(sc.elemDamage('Cold Arrow', { lvl: 1, skills: { 'Ice Arrow': 5 } }), { type: 'cold', min: 1228 / 256, max: 1638 / 256 });
  // mana (28 + (lvl − 1)) << 5: 896, 928 256ths…
  assert.deepEqual([1, 2, 20, 60].map((l) => sc.manaCost('Cold Arrow', l)), [3.5, 3.625, 5.875, 10.875]);
  assert.deepEqual([1, 20, 60].map((l) => sc.convertPct('coldarrow', { lvl: l })), [3, 41, 100]);

  // Freezing Arrow: min 40 + 10 a level (110), + 15 (230), + 20 (350), + 22 (482), + 24; max the same + 10
  assert.deepEqual(val('Freezing Arrow', 'enma'), [40, 50, 110, 125, 230, 250, 310, 350, 372, 482, 506, 1250]);
  assert.deepEqual(val('Freezing Arrow', 'exma'), [50, 60, 120, 135, 240, 260, 320, 360, 382, 492, 516, 1260]);
  // its synergy, Cold Arrow 12% a level: 10 levels, 120%: 10240 + 12288 = 22528 (88), 12800 + 15360 = 28160 (110)
  assert.deepEqual(sc.elemDamage('Freezing Arrow', { lvl: 1, skills: { 'Cold Arrow': 10 } }), { type: 'cold', min: 88, max: 110 });
  // freeze length ELen 50 frames, no bands: 2 seconds at every level; Ice Arrow adds 5% a level (10: 75, 3: 50 + floor(7.5) = 57)
  assert.deepEqual(val('Freezing Arrow', 'edln'), L.map(() => 50));
  assert.equal(sc.elemSeconds('Freezing Arrow', { lvl: 60 }), 2);
  assert.equal(sc.skillValue('Freezing Arrow', 'edln', { lvl: 1, skills: { 'Ice Arrow': 10 } }), 75);
  assert.equal(sc.skillValue('Freezing Arrow', 'edln', { lvl: 1, skills: { 'Ice Arrow': 3 } }), 57);
  // freeze radius: freezingarrowexp3's sHitPar1 5 sub-tiles (its skill's calc1, par1 5, would be the same); the tooltip's par1 × 2 / 3 yards
  near(sc.skillBlastRadius('Freezing Arrow', { lvl: 30 }), 5 * M_PER_SUBTILE, 'Freezing Arrow radius');
  assert.equal(sc.skillValue('Freezing Arrow', 'clc1', { lvl: 30 }), 5);
  assert.equal(sc.skillCalc('Freezing Arrow', S['Freezing Arrow'].desc.lines2[0].calcA, { lvl: 1 }), 10, 'par1*2, shown / 3');
  // mana (36 + (lvl − 1)) << 6: 2304 256ths…; ToHit 40 + 9 a level
  assert.deepEqual([1, 2, 20, 60].map((l) => sc.manaCost('Freezing Arrow', l)), [9, 9.25, 13.75, 23.75]);
  assert.equal(sc.toHitBonus('Freezing Arrow', { lvl: 30 }), 40 + 9 * 29);

  // a fire hireling at level 20, 17 over her band's 3 (D2X_HIRELINGS[0]): each skill Level + (17 × SLvlPerLvl >> 5),
  // D2MOO MonsterAI.cpp:272-276, so Inner Sight and Fire Arrow 1 + (170 >> 5) = 6, Exploding Arrow 1 + (85 >> 5) = 3
  const merc = { 'Inner Sight': 6, 'Fire Arrow': 6, 'Exploding Arrow': 3 };
  const { D2X_HIRELINGS } = await load('/src/data/d2x/hirelings.ts');
  assert.deepEqual(D2X_HIRELINGS[0].bands[0].skills.map((k) => [k.skill, k.level, k.lvlPerLvl * 32]), [['Inner Sight', 1, 10], ['Fire Arrow', 1, 10], ['Exploding Arrow', 1, 5]]);
  // Inner Sight 6: −(40 + 5 × 25) = −165 defense, 200 + 500 = 700 frames
  assert.deepEqual(sc.auraStats('Inner Sight', { lvl: 6, skills: merc }), [{ stat: 'armorclass', value: -165 }]);
  assert.equal(sc.auraSeconds('Inner Sight', { lvl: 6, skills: merc }), 28);
  // Fire Arrow 6: 1 + 5 × 2 = 11, 4 + 10 = 14 points; Exploding Arrow 3 gives 36%: 2816 + floor(1013.76) = 3829, 3584 + floor(1290.24) = 4874
  assert.deepEqual(sc.elemDamage('Fire Arrow', { lvl: 6, skills: merc }), { type: 'fire', min: 3829 / 256, max: 4874 / 256 });
  // Exploding Arrow 3: 5 + 2 × 6 = 17, 13 + 2 × 7 = 27; Fire Arrow 6 gives 84%: 4352 + floor(3655.68) = 8007, 6912 + floor(5806.08) = 12718
  assert.deepEqual(sc.elemDamage('Exploding Arrow', { lvl: 3, skills: merc }), { type: 'fire', min: 8007 / 256, max: 12718 / 256 });

  // ───────────────────────── ten of the heroes' skills, against what D2 shows ─────────────────────────
  // Level 1 is what the tooltip shows at one point; level 20 and the synergies by the same arithmetic.
  const shown = (skill, l, ctx = {}) => [sc.skillValue(skill, 'enma', { lvl: l, ...ctx }), sc.skillValue(skill, 'exma', { lvl: l, ...ctx })];

  // Fire Bolt, HitShift 7: 6 → 3, 12 → 6: "3-6", 2.5 mana (5 << 7). Level 20: 6 + 7 × 3 + 8 × 4 + 4 × 8 = 91
  // (45.5), 12 + 21 + 48 + 40 = 121 (60.5). Fire Ball 20 + Meteor 20, 640%: 11648 + floor(74547.2) = 86195
  // (336), 15488 + floor(99123.2) = 114611 (447)
  assert.deepEqual(shown('Fire Bolt', 1), [3, 6]);
  assert.equal(sc.manaCost('Fire Bolt', 1), 2.5);
  assert.deepEqual(shown('Fire Bolt', 2), [4, 7], '9 and 15 halves');
  assert.deepEqual(sc.elemDamage('Fire Bolt', { lvl: 20 }), { type: 'fire', min: 45.5, max: 60.5 });
  assert.deepEqual(shown('Fire Bolt', 20, { skills: { 'Fire Ball': 20, Meteor: 20 } }), [336, 447]);

  // Charged Bolt, HitShift 7: "2-4", min(24, ln12) = 3 bolts, 3 mana (24 << 5); + 1 bolt and 0.5 mana a level.
  // Level 20: 4 + 7 + 8 + 4 × 2 = 27 (13), 31 (15), 22 bolts, 12.5 mana; the bolts stop at 24 from level 22
  assert.deepEqual(shown('Charged Bolt', 1), [2, 4]);
  assert.deepEqual([1, 2, 20, 21, 22, 23, 40].map((l) => sc.skillValue('Charged Bolt', 'clc1', { lvl: l })), [3, 4, 22, 23, 24, 24, 24]);
  assert.deepEqual([1, 2, 20].map((l) => sc.manaCost('Charged Bolt', l)), [3, 3.5, 12.5]);
  assert.deepEqual(shown('Charged Bolt', 20), [13, 15]);
  // Lightning 20, 120%: 3456 + floor(4147.2) = 7603 (29), 3968 + floor(4761.6) = 8729 (34)
  assert.deepEqual(shown('Charged Bolt', 20, { skills: { Lightning: 20 } }), [29, 34]);

  // Ice Bolt, HitShift 7: "3-5", 6 seconds (150 frames), 3 mana. Level 20: 6 + 14 + 32 + 24 = 76 (38),
  // 10 + 21 + 40 + 28 = 99 (49); 150 + 19 × 35 = 815 frames, 32.6 seconds
  assert.deepEqual(shown('Ice Bolt', 1), [3, 5]);
  assert.equal(sc.elemSeconds('Ice Bolt', { lvl: 1 }), 6);
  assert.equal(sc.manaCost('Ice Bolt', 1), 3);
  assert.deepEqual(shown('Ice Bolt', 2), [4, 6]);
  assert.deepEqual(shown('Ice Bolt', 20), [38, 49]);
  assert.equal(sc.skillValue('Ice Bolt', 'edln', { lvl: 20 }), 815);

  // Frost Nova, HitShift 7: "2-4", 8 seconds (200 frames), 9 mana, + 1 a level. Level 20: 4 + 42 + 64 + 40
  // = 150 (75), 8 + 49 + 72 + 44 = 173 (86); 200 + 19 × 25 = 675 frames, 27 seconds; 28 mana
  assert.deepEqual(shown('Frost Nova', 1), [2, 4]);
  assert.equal(sc.elemSeconds('Frost Nova', { lvl: 1 }), 8);
  assert.deepEqual([1, 2, 20].map((l) => sc.manaCost('Frost Nova', l)), [9, 10, 28]);
  assert.deepEqual(shown('Frost Nova', 2), [5, 7]);
  assert.deepEqual(shown('Frost Nova', 20), [75, 86]);
  assert.equal(sc.elemSeconds('Frost Nova', { lvl: 20 }), 27);

  // Blizzard: "45-75", 23 mana, 4 seconds (blizzardcenter's Range 100 frames). Level 20: 45 + 105 + 240
  // + 180 = 570, 75 + 112 + 248 + 184 = 619. Ice Bolt, Ice Blast, Glacial Spike 20 each, 300%: × 4
  assert.deepEqual(shown('Blizzard', 1), [45, 75]);
  assert.equal(sc.manaCost('Blizzard', 1), 23);
  assert.equal(sc.skillCalc('Blizzard', S.Blizzard.desc.lines2[0].calcA, { lvl: 1 }), 100);
  assert.equal(sc.missileValue('blizzardcenter', 'rang', { lvl: 20 }), 100);
  assert.deepEqual(shown('Blizzard', 2), [60, 91]);
  assert.deepEqual(shown('Blizzard', 20), [570, 619]);
  assert.deepEqual(shown('Blizzard', 20, { skills: { 'Ice Bolt': 20, 'Ice Blast': 20, 'Glacial Spike': 20 } }), [2280, 2476]);
  assert.equal(sc.skillValue('Blizzard', 'clc1', { lvl: 1 }), 7, 'its area, par1');

  // Holy Bolt: "8-16" to undead, heals 1-6 (ln12 1 + 2, ln34 6 + 4, × (100 + Prayer × 20) / 100), 2 mana
  // (32 << 4 = 512 256ths, + 16 a level). Level 20: 8 + 56 + 80 + 52 = 196, 16 + 56 + 88 + 60 = 220; heals
  // 39-82. Prayer 10 triples the heal: 3-18; Prayer 5 at 20: 82 × 200 / 100 = 164. Fist of the Heavens 5,
  // 250%: 2048 + 5120 = 7168 (28), 4096 + 10240 = 14336 (56)
  assert.deepEqual(shown('Holy Bolt', 1), [8, 16]);
  assert.deepEqual(['clc1', 'clc2'].map((c) => sc.skillValue('Holy Bolt', c, { lvl: 1 })), [1, 6]);
  assert.equal(sc.manaCost('Holy Bolt', 1), 2);
  assert.deepEqual(shown('Holy Bolt', 2), [16, 24]);
  assert.deepEqual(['clc1', 'clc2'].map((c) => sc.skillValue('Holy Bolt', c, { lvl: 2 })), [3, 10]);
  assert.deepEqual(shown('Holy Bolt', 20), [196, 220]);
  assert.deepEqual(['clc1', 'clc2'].map((c) => sc.skillValue('Holy Bolt', c, { lvl: 20 })), [39, 82]);
  assert.equal(sc.manaCost('Holy Bolt', 20), 816 / 256);
  assert.deepEqual(['clc1', 'clc2'].map((c) => sc.skillValue('Holy Bolt', c, { lvl: 1, skills: { Prayer: 10 } })), [3, 18]);
  assert.equal(sc.skillValue('Holy Bolt', 'clc2', { lvl: 20, skills: { Prayer: 5 } }), 164);
  assert.deepEqual(shown('Holy Bolt', 1, { skills: { 'Fist of the Heavens': 5 } }), [28, 56]);

  // Might: +40% damage (ln34 40 + 10), radius ln12 16 sub-tiles (10.7 yards), + 2 a level. Level 20: +230%, 54
  assert.deepEqual(sc.auraStats('Might', { lvl: 1 }), [{ stat: 'damagepercent', value: 40 }]);
  assert.deepEqual(sc.auraStats('Might', { lvl: 20 }), [{ stat: 'damagepercent', value: 230 }]);
  near(sc.auraRadius('Might', { lvl: 1 }), 16 * M_PER_SUBTILE, 'Might radius');
  near(sc.auraRadius('Might', { lvl: 20 }), 54 * M_PER_SUBTILE, 'Might radius at 20');
  assert.equal(sc.manaCost('Might', 1), 0, 'an aura with no mana costs none');

  // Prayer: heals 2 (edmn: EMin 2, + 1 a level to 8, + 1 to 16, + 2 on), its stat hitpoints in 256ths (edns
  // 512); 1 mana (16 << 4), + 3 << 4 = 48 256ths a level. Level 20: 2 + 7 + 8 + 4 × 2 = 25, 6400; 1168 256ths
  assert.equal(sc.skillValue('Prayer', 'edmn', { lvl: 1 }), 2);
  assert.deepEqual(sc.auraStats('Prayer', { lvl: 1 }), [{ stat: 'hitpoints', value: 512 }]);
  assert.equal(sc.manaCost('Prayer', 1), 1);
  assert.equal(sc.skillValue('Prayer', 'edmn', { lvl: 20 }), 25);
  assert.deepEqual(sc.auraStats('Prayer', { lvl: 20 }), [{ stat: 'hitpoints', value: 6400 }]);
  assert.equal(sc.manaCost('Prayer', 20), 1168 / 256);
  near(sc.auraRadius('Prayer', { lvl: 1 }), 16 * M_PER_SUBTILE, 'Prayer radius');
  assert.equal(sc.elemDamage('Prayer', { lvl: 1 }).type, null, 'no element: the E columns are only numbers');

  // Holy Fire, HitShift 7: the aura's "1-3" (2 → 256, 6 → 768 256ths), its max shown × (100 + par6) / 100 = 2,
  // 6; "adds 6-18" to attacks (edns × par5 6 / 256), the passive stats the same; radius ln12 6 + 1 a level.
  // Level 2: 3 → 384, 8 → 1024: 1-4, attacks 9-24. Level 20: 65 → 8320 (32), 88 → 11264 (44); attacks
  // 8320 × 6 / 256 = 195, 264. Resist Fire 20, 420%: 256 + floor(1075.2) = 1331, 768 + floor(3225.6) = 3993
  assert.deepEqual(shown('Holy Fire', 1), [1, 3]);
  assert.equal(sc.skillCalc('Holy Fire', S['Holy Fire'].desc.lines[1].calcB, { lvl: 1 }), 6);
  assert.deepEqual(['calcA', 'calcB'].map((c) => sc.skillCalc('Holy Fire', S['Holy Fire'].desc.lines[2][c], { lvl: 1 })), [6, 18]);
  assert.deepEqual(sc.passiveStats('Holy Fire', { lvl: 1 }), [{ stat: 'firemindam', value: 6 }, { stat: 'firemaxdam', value: 18 }]);
  assert.deepEqual(shown('Holy Fire', 2), [1, 4]);
  assert.deepEqual(sc.passiveStats('Holy Fire', { lvl: 2 }), [{ stat: 'firemindam', value: 9 }, { stat: 'firemaxdam', value: 24 }]);
  assert.deepEqual(shown('Holy Fire', 20), [32, 44]);
  assert.deepEqual(sc.passiveStats('Holy Fire', { lvl: 20 }), [{ stat: 'firemindam', value: 195 }, { stat: 'firemaxdam', value: 264 }]);
  assert.deepEqual([1, 20].map((l) => sc.skillValue('Holy Fire', 'rng', { lvl: l })), [6, 25]);
  assert.deepEqual(sc.elemDamage('Holy Fire', { lvl: 1, skills: { 'Resist Fire': 20 } }), { type: 'fire', min: 1331 / 256, max: 3993 / 256 });

  // Fist of the Heavens: "150-200" lightning, its holy bolts "40-50" (descmissile1 fistoftheheavensbolt), 6
  // of them (calc4 ln12), 25 mana, within aurarangecalc 20 sub-tiles. Level 20: 150 + 105 + 240 + 180 = 675,
  // 725; bolts 40 + 42 + 80 + 64 = 226, 236; 25 bolts. Holy Bolt 20 adds 300% to the bolts, before their
  // HitShift (missile synergy): 40 + 120 = 160, 200; at 20, 226 + 678 = 904, 236 + 708 = 944
  assert.deepEqual(shown('Fist of the Heavens', 1), [150, 200]);
  assert.deepEqual(['m1en', 'm1ex'].map((c) => sc.skillValue('Fist of the Heavens', c, { lvl: 1 })), [40, 50]);
  assert.equal(sc.skillValue('Fist of the Heavens', 'clc4', { lvl: 1 }), 6);
  assert.equal(sc.manaCost('Fist of the Heavens', 1), 25);
  near(sc.auraRadius('Fist of the Heavens', { lvl: 1 }), 20 * M_PER_SUBTILE, 'Fist of the Heavens reach');
  assert.deepEqual(shown('Fist of the Heavens', 20), [675, 725]);
  assert.deepEqual(['m1en', 'm1ex'].map((c) => sc.skillValue('Fist of the Heavens', c, { lvl: 20 })), [226, 236]);
  assert.equal(sc.skillValue('Fist of the Heavens', 'clc4', { lvl: 20 }), 25);
  assert.deepEqual(['m1en', 'm1ex'].map((c) => sc.skillValue('Fist of the Heavens', c, { lvl: 1, skills: { 'Holy Bolt': 20 } })), [160, 200]);
  assert.deepEqual(['m1en', 'm1ex'].map((c) => sc.skillValue('Fist of the Heavens', c, { lvl: 20, skills: { 'Holy Bolt': 20 } })), [904, 944]);
  // the bolt on its own at level 1 with Holy Bolt 3, 45%: 40 + floor(18) = 58, 50 + floor(22.5) = 72
  assert.deepEqual(sc.missileElem('fistoftheheavensbolt', { lvl: 1, skills: { 'Holy Bolt': 3 } }), { type: 'mag', min: 58, max: 72, seconds: 0 });

  // ───────────────────────── the other rules the helpers keep ─────────────────────────
  // the min takes a synergy only over a point or with its first band set: Holy Shock's min, 1 << 8 = 256
  // with no bands, stays at 1 (lightmindam is 1 too); its max, 10 << 8 = 2560, takes Resist Lightning 10's
  // 120%: 2560 + 3072 = 5632
  assert.deepEqual(['edns', 'edxs'].map((c) => sc.skillValue('Holy Shock', c, { lvl: 1, skills: { 'Resist Lightning': 10 } })), [256, 5632]);
  assert.equal(sc.skillValue('Holy Shock', 'edns', { lvl: 2, skills: { 'Resist Lightning': 10 } }), 256);
  // mastery: only the "with mastery" codes take it. Fire Bolt 1 with 30%: 768 + floor(230.4) = 998, 1536 + floor(460.8) = 1996
  const mastered = { lvl: 1, mastery: { fire: 30 } };
  assert.deepEqual(sc.elemDamage('Fire Bolt', mastered), { type: 'fire', min: 998 / 256, max: 1996 / 256 });
  assert.deepEqual(['enma', 'exma', 'edmn', 'edmx', 'enms', 'edns'].map((c) => sc.skillValue('Fire Bolt', c, mastered)), [3, 7, 3, 6, 998, 768]);
  assert.equal(sc.skillValue('Fire Bolt', 'mael', mastered), 30);
  assert.equal(sc.skillValue('Frost Nova', 'mael', { lvl: 1, mastery: { fire: 30 } }), 0, 'another element');
  // physical damage: Holy Shield's smite, MinDam 3 + 2 / 3 / 4 a level, MaxDam 6: 3-6; level 20 3 + 14 + 24 + 16 = 57, 60
  assert.deepEqual(['pnma', 'pxma'].map((c) => sc.skillValue('Holy Shield', c, { lvl: 1 })), [3, 6]);
  assert.deepEqual(sc.physDamage('Holy Shield', { lvl: 20 }), { min: 57, max: 60 });
  // a weapon's share, SrcDam 128 / 128: all of it; Cold Arrow's own attack shifts it by its HitShift 7, so half
  assert.deepEqual(sc.physDamage('Fire Arrow', { lvl: 1 }, [10, 20]), { min: 10, max: 20 });
  assert.deepEqual(sc.physDamage('Cold Arrow', { lvl: 1 }, [10, 20]), { min: 5, max: 10 });
  // mana: Teleport 24, − 1 a level, at least minmana 1 for a cast; its mana and usmc codes are not kept to it
  assert.deepEqual([1, 20, 24, 30].map((l) => sc.manaCost('Teleport', l)), [24, 5, 1, 1]);
  assert.deepEqual(['mana', 'usmc'].map((c) => sc.skillValue('Teleport', c, { lvl: 30 })), [-5, -1280]);
  assert.equal(sc.skillCalc('Teleport', S.Teleport.desc.lines[0].calcA, { lvl: 30 }), 1, 'its tooltip, max(usmc, 1)');
  // the levels: lvl is the skill's own, blvl its points; one the caster lacks reads 0
  assert.deepEqual(['lvl', 'blvl'].map((c) => sc.skillValue('Fire Arrow', c, { lvl: 5, blvl: 3 })), [5, 3]);
  assert.equal(sc.skillCalc('Cold Arrow', "skill('Ice Arrow'.blvl)", { lvl: 1 }), 0);
  assert.equal(sc.skillCalc('Cold Arrow', "skill('Ice Arrow'.lvl)", { lvl: 1, skills: { 'Ice Arrow': { blvl: 2, lvl: 4 } } }), 4);
  assert.throws(() => sc.skillCalc('Cold Arrow', "skill('Ice Arrow'.par8)", { lvl: 1 }), /only named/, "a skill the import only names has no row to read");
  // missile codes
  assert.deepEqual(['hpa1', 'lvl', 'rang', 'dl12', 'dpa2'].map((c) => sc.missileValue('explodingarrowexp2', c, { lvl: 4 })), [5, 4, 1, 0, 0]);
  assert.equal(sc.missileValue('firearrow', 'dl12', { lvl: 4 }), 3 + 2 * 3);
  assert.equal(sc.missileCalc('fistoftheheavensbolt', 'miss(\'firearrow\'.rang)', { lvl: 1 }), 0, "a missile calc's miss() has no callback");
  assert.throws(() => sc.missileCalc('fistoftheheavensbolt', "5 + miss('firearrow'.rang)", { lvl: 1 }), /used as a number/, '… and pops nothing, so its link is what + adds');
  // what the caller has to give
  assert.throws(() => sc.skillValue('No Such Skill', 'lvl', { lvl: 1 }), /no skill/);
  assert.throws(() => sc.skillValue('Fire Arrow', 'lvl', { lvl: -1 }), /no level/);
  assert.throws(() => sc.skillValue('Fire Arrow', 'lvl', { lvl: 1.5 }), /no level/);
  assert.throws(() => sc.skillValue('Fire Arrow', 'ulvl', { lvl: 1 }), /ulvl/);
  assert.equal(sc.skillValue('Fire Arrow', 'ulvl', { lvl: 1, ulvl: 12 }), 12);
  assert.throws(() => sc.skillCalc('Hydra', S.Hydra.passive.stats[0].calc, { lvl: 1 }), /CalcCtx.stat/);
  assert.equal(sc.skillCalc('Hydra', S.Hydra.passive.stats[0].calc, { lvl: 1, stat: (s, k) => (s === 'passive_fire_mastery' && k === 'accr' ? 35 : 0) }), 35);
  assert.throws(() => sc.skillValue('Fire Arrow', 'nope', { lvl: 1 }), /no SkillCalc code/);
};
