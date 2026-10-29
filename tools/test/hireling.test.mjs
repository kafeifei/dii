// The Act 1 hireling (src/game/d2/hireling.ts): who is on offer and at what level and price, her stats,
// skills and their numbers, experience and levels, the level-8 rule, her gear, and what raising her
// costs. Every expected number is worked out by hand from the D2R 2.7 Hireling.txt rows quoted here
// (each first checked against what the import made of it, D2X_HIRELINGS) and the Skills.txt columns
// skillcalc.test quotes, with D2MOO's integer steps: / truncates toward zero, >> floors.
import assert from 'node:assert/strict';

export default async (load) => {
  const h = await load('/src/game/d2/hireling.ts');
  const { D2X_HIRELINGS, D2X_HIRELING_NAMES, D2X_HIRELING_XP } = await load('/src/data/d2x/hirelings.ts');
  const { D2X_SKILLS } = await load('/src/data/d2x/skills.ts');
  const { ITEM_BASES } = await load('/src/data/items.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { M_PER_SUBTILE } = await load('/src/game/d2/stats.ts');
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} is not ${b}`);

  // ───────────────────────── the rows, against the import ─────────────────────────
  // Hireling.txt, Version 100, Act 1: the columns the rules read. Resist is the four ResistFire…Poison
  // (equal in every row), skills are [Skill, Chance, ChancePerLvl, Level, LvlPerLvl]. Every row shares
  // DefaultChance 75, NameFirst merc01 … NameLast merc41, resurrectcost 15 / 2 / 50000, equivalentcharclass ama.
  const FIRE = [['Inner Sight', 10, 0, 1, 10], ['Fire Arrow', 25, 5, 1, 10], ['Exploding Arrow', 0, 4, 1, 5]];
  const COLD = [['Inner Sight', 10, 0, 1, 10], ['Cold Arrow', 25, 5, 1, 10], ['Freezing Arrow', 0, 4, 1, 3]];
  const BAND = {
    3: { Gold: [100, 150], Exp: [100, 105], HP: 45, HPL: 9, Def: 15, DefL: 8, Str: 35, StrL: 10, Dex: 45, DexL: 16, AR: 10, ARL: 12, Dmg: [1, 3], DmgL: 2, Res: 0, ResL: 8, fire: FIRE, cold: COLD },
    36: {
      Gold: [6000, 7500], Exp: [110, 115], HP: 342, HPL: 18, Def: 279, DefL: 15, Str: 77, StrL: 10, Dex: 111, DexL: 16, AR: 406, ARL: 24, Dmg: [9, 11], DmgL: 4, Res: 66, ResL: 7,
      fire: [['Inner Sight', 10, 0, 12, 10], ['Fire Arrow', 67, 0, 12, 10], ['Exploding Arrow', 33, 10, 7, 5]],
      cold: [['Inner Sight', 10, 0, 12, 10], ['Cold Arrow', 67, 0, 12, 10], ['Freezing Arrow', 33, 10, 4, 3]],
    },
    67: {
      Gold: [12500, 14000], Exp: [120, 125], HP: 900, HPL: 30, Def: 744, DefL: 23, Str: 116, StrL: 10, Dex: 173, DexL: 16, AR: 1150, ARL: 36, Dmg: [25, 27], DmgL: 6, Res: 121, ResL: 5,
      fire: [['Inner Sight', 10, 0, 22, 10], ['Fire Arrow', 67, 0, 22, 10], ['Exploding Arrow', 111, 0, 12, 5]],
      cold: [['Inner Sight', 10, 0, 22, 10], ['Cold Arrow', 67, 0, 22, 10], ['Freezing Arrow', 111, 0, 7, 3]],
    },
  };
  // Id: difficulty (Difficulty − 1), element (HireDesc strhirespecial1 fire, 2 cold), its bands
  const IDS = { 0: [0, 'fire', [3, 36, 67]], 1: [0, 'cold', [3, 36, 67]], 2: [1, 'fire', [36, 67]], 3: [1, 'cold', [36, 67]], 4: [2, 'fire', [67]], 5: [2, 'cold', [67]] };
  // Skills.txt reqlevel, which the import copies to each hireling skill
  const REQ = { 'Inner Sight': 1, 'Fire Arrow': 1, 'Exploding Arrow': 12, 'Cold Arrow': 6, 'Freezing Arrow': 30 };
  assert.equal(D2X_HIRELINGS.length, 6);
  for (const [id, [diff, elem, bands]] of Object.entries(IDS)) {
    const r = D2X_HIRELINGS.find((x) => x.id === Number(id));
    assert.ok(r, `hireling ${id} imported`);
    assert.deepEqual([r.difficulty, r.element, r.monster, r.seller, r.cls, r.defaultChance], [diff, elem, 'roguehire', 'kashya', 'ama', 75], `hireling ${id}`);
    assert.deepEqual(r.resurrect, { mul: 15, div: 2, max: 50000 });
    assert.deepEqual(r.names, Array.from({ length: 41 }, (_, i) => `merc${String(i + 1).padStart(2, '0')}`), `hireling ${id} names`);
    assert.deepEqual(r.bands.map((b) => b.level), bands, `hireling ${id} bands`);
    const k = elem === 'fire' ? 0 : 1;
    for (const b of r.bands) {
      const w = BAND[b.level];
      const at = `hireling ${id} band ${b.level}`;
      assert.deepEqual(
        [b.gold, b.xpPerLvl, b.hp, b.hpPerLvl, b.def, b.defPerLvl, b.str, b.strPerLvl, b.dex, b.dexPerLvl, b.ar, b.arPerLvl, b.dmg, b.dmgPerLvl],
        [w.Gold[k], w.Exp[k], w.HP, w.HPL, w.Def, w.DefL, w.Str, w.StrL / 8, w.Dex, w.DexL / 8, w.AR, w.ARL, w.Dmg, w.DmgL / 8],
        at,
      );
      assert.deepEqual([b.resist, b.resistPerLvl], [[w.Res, w.Res, w.Res, w.Res], [w.ResL / 4, w.ResL / 4, w.ResL / 4, w.ResL / 4]], `${at} resistances`);
      assert.deepEqual(
        b.skills.map((s) => [s.skill, s.chance, s.chancePerLvl, s.level, s.lvlPerLvl * 32, s.reqLvl, s.mode]),
        w[elem].map(([s, c, cp, l, lp]) => [s, c, cp, l, lp, REQ[s], 4]),
        `${at} skills`,
      );
    }
  }
  assert.deepEqual(D2X_HIRELING_XP, { maxLevel: 98, notKillerShare: 86 / 256, perKillCap: 1 / 64 });
  assert.equal(h.MERC_MAX_LEVEL, 98);

  // ───────────────────────── bands ─────────────────────────
  // the highest band at or below her level, else the first (MonsterTbls.cpp:1718-1754)
  const bandOf = (id, l) => h.bandAt(id, l).level;
  assert.deepEqual([1, 2, 3, 35, 36, 66, 67, 98].map((l) => bandOf(0, l)), [3, 3, 3, 3, 36, 36, 67, 67]);
  assert.deepEqual([1, 30, 36, 67].map((l) => bandOf(2, l)), [36, 36, 36, 67]);
  assert.deepEqual([1, 67, 98].map((l) => bandOf(5, l)), [67, 67, 67]);
  assert.equal(h.hireling(h.hireling(3)), h.hireling(3));
  assert.throws(() => h.hireling(6), /no Hireling.txt Id 6/);

  // ───────────────────────── stats at a level ─────────────────────────
  // u = level − band. Life HP + u·HP/Lvl (≥ 40); Str + u·Str/Lvl / 8 and Dex + u·Dex/Lvl / 8 (≥ 10);
  // Def + u·Def/Lvl; AR + u·AR/Lvl; damage + u·Dmg/Lvl / 8 (max ≥ 1); resist + u·Resist/Lvl / 4.
  // Defense counts Dex / 4 (UNITS_GetDefense), attack rating 5 × Dex (a monster attacker's).
  const stats = (id, l) => {
    const s = h.mercStats(id, l);
    return [s.band, s.levelUps, s.life, s.str, s.dex, s.def, s.ar, s.defense, s.attackRating, s.dmg, s.resist[0]];
  };
  // level 3, u 0: the band's own; defense 15 + 45 / 4 = 26, attack rating 10 + 5 × 45 = 235
  assert.deepEqual(stats(0, 3), [3, 0, 45, 35, 45, 15, 10, 26, 235, [1, 3], 0]);
  // 7, u 4: life 45 + 36; str 35 + 40 / 8; dex 45 + 64 / 8; def 15 + 32; AR 10 + 48; dmg + 8 / 8; res 32 / 4
  assert.deepEqual(stats(0, 7), [3, 4, 81, 40, 53, 47, 58, 47 + 13, 58 + 265, [2, 4], 8]);
  // 12, u 9: 45 + 81; 35 + 90 / 8 (11); 45 + 144 / 8; 15 + 72; 10 + 108; + 18 / 8 (2); 72 / 4
  assert.deepEqual(stats(0, 12), [3, 9, 126, 46, 63, 87, 118, 87 + 15, 118 + 315, [3, 5], 18]);
  // 20, u 17: 45 + 153; 35 + 170 / 8 (21); 45 + 272 / 8; 15 + 136; 10 + 204; + 34 / 8 (4); 136 / 4
  assert.deepEqual(stats(0, 20), [3, 17, 198, 56, 79, 151, 214, 151 + 19, 214 + 395, [5, 7], 34]);
  // 35, u 32, the band's last: 45 + 288; 35 + 40; 45 + 64; 15 + 256; 10 + 384; + 64 / 8; 256 / 4
  assert.deepEqual(stats(0, 35), [3, 32, 333, 75, 109, 271, 394, 271 + 27, 394 + 545, [9, 11], 64]);
  // 36: the next band's own
  assert.deepEqual(stats(0, 36), [36, 0, 342, 77, 111, 279, 406, 279 + 27, 406 + 555, [9, 11], 66]);
  // 50, u 14: 342 + 252; 77 + 140 / 8 (17); 111 + 224 / 8; 279 + 210; 406 + 336; + 56 / 8; 66 + 98 / 4 (24)
  assert.deepEqual(stats(0, 50), [36, 14, 594, 94, 139, 489, 742, 489 + 34, 742 + 695, [16, 18], 90]);
  // 98, u 31 over 67: 900 + 930; 116 + 310 / 8 (38); 173 + 496 / 8; 744 + 713; 1150 + 1116; + 186 / 8 (23); 121 + 155 / 4 (38)
  assert.deepEqual(stats(0, 98), [67, 31, 1830, 154, 235, 1457, 2266, 1457 + 58, 2266 + 1175, [48, 50], 159]);
  // cold's rows differ only in gold, experience and skills
  assert.deepEqual(stats(1, 20), stats(0, 20));
  // level 1, u −2 (hired by a level-1 hero): life 45 − 18 held at 40; str 35 + −20 / 8 (−2); dex 45 + −32 / 8;
  // def 15 − 16 and AR 10 − 24 held at 0; dmg + −4 / 8 (0); res 0 − 16 / 4 held at 0
  assert.deepEqual(stats(0, 1), [3, -2, 40, 33, 41, 0, 0, 10, 205, [1, 3], 0]);
  // nightmare at 30, u −6 under 36: 342 − 108; 77 + −60 / 8 (−7); 111 − 12; 279 − 90; 406 − 144; 9 + −24 / 8; 66 + −42 / 4 (−10)
  assert.deepEqual(stats(2, 30), [36, -6, 234, 70, 99, 189, 262, 189 + 24, 262 + 495, [6, 8], 56]);
  assert.deepEqual(h.mercStats(0, 50).resist, [90, 90, 90, 90]);
  // life back a second: STAT_HPREGEN = life × 256 / 2000 256ths a frame, 25 frames a second
  near(h.mercStats(0, 3).regen, (5 * 25) / 256, 'regen at 3: 11520 / 2000 = 5'); // 0.488
  near(h.mercStats(0, 7).regen, (10 * 25) / 256, 'regen at 7: 20736 / 2000 = 10');
  near(h.mercStats(0, 98).regen, (234 * 25) / 256, 'regen at 98: 468480 / 2000 = 234');
  // what a level adds, as the rows have it (the eighths and quarters made points)
  assert.deepEqual(h.mercStats(0, 7).perLevel, { life: 9, str: 1.25, dex: 2, def: 8, ar: 12, dmg: 0.25, resist: [2, 2, 2, 2] });
  assert.deepEqual(h.mercStats(4, 70).perLevel, { life: 30, str: 1.25, dex: 2, def: 23, ar: 36, dmg: 0.75, resist: [1.25, 1.25, 1.25, 1.25] });
  // an arrow from a bow gets her damage − 1 at both ends (MonsterUnique.cpp:1303-1304)
  assert.deepEqual(h.arrowBonus(h.mercStats(0, 3).dmg), [0, 2]);
  assert.deepEqual(h.arrowBonus(h.mercStats(0, 20).dmg), [4, 6]);

  // ───────────────────────── skills and their levels ─────────────────────────
  // once her level reaches the skill's reqlevel: Level + (u × LvlPerLvl >> 5), kept to 0–32, none at 0
  const lv = (id, l) => h.mercSkills(id, l).map((s) => [s.skill, s.base]);
  assert.deepEqual(lv(0, 3), [['Inner Sight', 1], ['Fire Arrow', 1]]); // Exploding Arrow asks 12
  assert.deepEqual(lv(0, 7), [['Inner Sight', 2], ['Fire Arrow', 2]]); // 1 + (40 >> 5)
  assert.deepEqual(lv(0, 11), [['Inner Sight', 3], ['Fire Arrow', 3]]); // 1 + (80 >> 5)
  assert.deepEqual(lv(0, 12), [['Inner Sight', 3], ['Fire Arrow', 3], ['Exploding Arrow', 2]]); // 1 + (90 >> 5), 1 + (45 >> 5)
  assert.deepEqual(lv(0, 20), [['Inner Sight', 6], ['Fire Arrow', 6], ['Exploding Arrow', 3]]); // 1 + (170 >> 5), 1 + (85 >> 5)
  assert.deepEqual(lv(0, 30), [['Inner Sight', 9], ['Fire Arrow', 9], ['Exploding Arrow', 5]]); // 1 + (270 >> 5), 1 + (135 >> 5)
  assert.deepEqual(lv(0, 35), [['Inner Sight', 11], ['Fire Arrow', 11], ['Exploding Arrow', 6]]); // 1 + 10, 1 + (160 >> 5)
  assert.deepEqual(lv(0, 36), [['Inner Sight', 12], ['Fire Arrow', 12], ['Exploding Arrow', 7]]);
  assert.deepEqual(lv(0, 66), [['Inner Sight', 21], ['Fire Arrow', 21], ['Exploding Arrow', 11]]); // 12 + (300 >> 5), 7 + (150 >> 5)
  assert.deepEqual(lv(0, 98), [['Inner Sight', 31], ['Fire Arrow', 31], ['Exploding Arrow', 16]]); // 22 + (310 >> 5), 12 + (155 >> 5)
  assert.deepEqual(lv(1, 5), [['Inner Sight', 1]]); // Cold Arrow asks 6
  assert.deepEqual(lv(1, 6), [['Inner Sight', 1], ['Cold Arrow', 1]]); // 1 + (30 >> 5)
  assert.deepEqual(lv(1, 29), [['Inner Sight', 9], ['Cold Arrow', 9]]); // 1 + (260 >> 5); Freezing Arrow asks 30
  assert.deepEqual(lv(1, 30), [['Inner Sight', 9], ['Cold Arrow', 9], ['Freezing Arrow', 3]]); // 1 + (81 >> 5)
  assert.deepEqual(lv(1, 98), [['Inner Sight', 31], ['Cold Arrow', 31], ['Freezing Arrow', 9]]); // 7 + (93 >> 5)
  // below the band >> floors: at 1 (u −2) 1 + (−20 >> 5) = 0, at 2 (u −1) 1 + (−10 >> 5) = 0: no skills
  assert.deepEqual(lv(0, 1), []);
  assert.deepEqual(lv(0, 2), []);
  // nightmare at 30 (u −6): 12 + (−60 >> 5) = 10, 7 + (−30 >> 5) = 6; cold 4 + (−18 >> 5) = 3, and at 29 none
  assert.deepEqual(lv(2, 30), [['Inner Sight', 10], ['Fire Arrow', 10], ['Exploding Arrow', 6]]);
  assert.deepEqual(lv(3, 30), [['Inner Sight', 10], ['Cold Arrow', 10], ['Freezing Arrow', 3]]);
  assert.deepEqual(lv(3, 29), [['Inner Sight', 9], ['Cold Arrow', 9]]); // 12 + (−70 >> 5)
  assert.deepEqual(h.mercSkills(0, 20).map((s) => [s.mode, s.chance, s.chancePerLvl]), [[4, 10, 0], [4, 25, 5], [4, 0, 4]]);

  // their numbers (Skills.txt as skillcalc.test quotes it). Fire at 3: Inner Sight 1, −Param1 40 defense on
  // her foes for ln34 = 200 frames, 8 s, in ln56 = 27 sub-tiles; Fire Arrow 1: EMin 1 – EMax 4 fire, no
  // synergy before Exploding Arrow, ToHit 10, firearrow turning 3 + 2 × 0 % of the arrow's damage to fire
  let sk = h.mercSkills(0, 3);
  assert.deepEqual(sk[0].numbers.aura.stats, [{ stat: 'armorclass', value: -40 }]);
  assert.equal(sk[0].numbers.aura.seconds, 8);
  near(sk[0].numbers.aura.radius, 27 * M_PER_SUBTILE, 'Inner Sight radius');
  assert.deepEqual(Object.keys(sk[0].numbers), ['aura']);
  assert.deepEqual(sk[1].numbers, { elem: { type: 'fire', min: 1, max: 4 }, toHit: 10, convertPct: 3 });
  // fire at 20 (6, 6, 3): Inner Sight −(40 + 5 × 25) for 200 + 5 × 100 frames (28 s); Fire Arrow 6 is 1 + 5 × 2 –
  // 4 + 5 × 2 points, with Exploding Arrow's 3 × Param8 12 = 36 %: 2816 + floor(1013.76), 3584 + floor(1290.24)
  // in 256ths; ToHit 10 + 5 × 9; 3 + 5 × 2 % turned to fire. Exploding Arrow 3: 5 + 2 × 6 – 13 + 2 × 7, with Fire
  // Arrow's 6 × 14 = 84 %: 4352 + 3655, 6912 + 5806; ToHit 20 + 2 × 9; a blast of 5 sub-tiles (explodingarrowexp2)
  sk = h.mercSkills(0, 20);
  assert.deepEqual(sk[0].numbers.aura.stats, [{ stat: 'armorclass', value: -165 }]);
  assert.equal(sk[0].numbers.aura.seconds, 28);
  assert.deepEqual(sk[1].numbers, { elem: { type: 'fire', min: 3829 / 256, max: 4874 / 256 }, toHit: 55, convertPct: 13 });
  assert.deepEqual({ ...sk[2].numbers, blast: undefined }, { elem: { type: 'fire', min: 8007 / 256, max: 12718 / 256 }, toHit: 38, blast: undefined });
  near(sk[2].numbers.blast, 5 * M_PER_SUBTILE, 'Exploding Arrow blast');
  // cold at 30 (9, 9, 3): Inner Sight −(40 + 7 × 25 + 45) = −260 for 200 + 8 × 100 frames (40 s); Cold Arrow 9,
  // HitShift 7 (half points): 6 + 7 × 4 + 5 = 39, 8 + 7 × 4 + 5 = 41, no synergy without Ice Arrow, chill
  // ELen 100 + 8 × 30 frames (13.6 s), ToHit 10 + 8 × 9, 3 + 8 × 2 % to cold; Freezing Arrow 3: 40 + 2 × 10 and
  // 50 + 2 × 10 points, with Cold Arrow's 9 × 12 = 108 %: 15360 + floor(16588.8), 17920 + floor(19353.6);
  // a freeze of ELen 50 frames (2 s), ToHit 40 + 2 × 9, in 5 sub-tiles (freezingarrowexp3)
  sk = h.mercSkills(1, 30);
  assert.deepEqual(sk[0].numbers.aura.stats, [{ stat: 'armorclass', value: -260 }]);
  assert.equal(sk[0].numbers.aura.seconds, 40);
  assert.deepEqual(sk[1].numbers, { elem: { type: 'cold', min: 39 / 2, max: 41 / 2 }, elemSeconds: 13.6, toHit: 82, convertPct: 19 });
  assert.deepEqual({ ...sk[2].numbers, blast: undefined }, { elem: { type: 'cold', min: 31948 / 256, max: 37273 / 256 }, elemSeconds: 2, toHit: 58, blast: undefined });
  near(sk[2].numbers.blast, 5 * M_PER_SUBTILE, 'Freezing Arrow freeze radius');
  // +2 to all skills from her gear: 8, 8, 5; synergies still read the base levels (Exploding Arrow 3: 36 %,
  // Fire Arrow 6: 84 %). Fire Arrow 8: 15 – 18 points, 3840 + floor(1382.4), 4608 + floor(1658.88);
  // Exploding Arrow 5: 5 + 4 × 6 = 29 – 13 + 4 × 7 = 41, 7424 + floor(6236.16), 10496 + floor(8816.64)
  sk = h.mercSkills(0, 20, 2);
  assert.deepEqual(sk.map((s) => [s.base, s.level]), [[6, 8], [6, 8], [3, 5]]);
  assert.deepEqual(sk[1].numbers.elem, { type: 'fire', min: 5222 / 256, max: 6266 / 256 });
  assert.deepEqual(sk[2].numbers.elem, { type: 'fire', min: 13660 / 256, max: 19312 / 256 });
  assert.deepEqual(h.mercSkills(0, 20, (s) => (s === 'Fire Arrow' ? 1 : 0)).map((s) => s.level), [6, 7, 3]);
  assert.deepEqual(h.mercSkills(0, 20, 200).map((s) => s.level), [99, 99, 99], 'kept to 99');
  // the numbers are skillcalc's for that caster
  assert.throws(() => h.skillNumbers('No Such Skill', { lvl: 1 }), /no skill/);
  assert.ok(D2X_SKILLS['Inner Sight'].aura && !D2X_SKILLS['Fire Arrow'].aura);

  // ───────────────────────── her choice of attack ─────────────────────────
  // DefaultChance 75 for her plain arrow, then per skill she has Chance + max(u, 0) × ChancePerLvl / 4, a roll in 0 … sum
  // fire at 3: 75, Inner Sight + 10 = 85, Fire Arrow + 25 = 110 (75/111 plain, 11/111, 25/111)
  let w = h.actionWeights(0, 3);
  assert.deepEqual(w, { plain: 75, skills: [{ skill: 'Inner Sight', upTo: 85 }, { skill: 'Fire Arrow', upTo: 110 }], total: 110 });
  // fire at 20, u 17: + 10 = 85, + 25 + 85 / 4 (21) = 131, + 0 + 68 / 4 (17) = 148
  w = h.actionWeights(0, 20);
  assert.deepEqual(w, { plain: 75, skills: [{ skill: 'Inner Sight', upTo: 85 }, { skill: 'Fire Arrow', upTo: 131 }, { skill: 'Exploding Arrow', upTo: 148 }], total: 148 });
  assert.deepEqual([0, 74, 75, 85, 86, 131, 132, 148].map((r) => h.pickAction(w, r)), [null, null, 'Inner Sight', 'Inner Sight', 'Fire Arrow', 'Fire Arrow', 'Exploding Arrow', 'Exploding Arrow']);
  // band 36: 36 → + 10, + 67, + 33 = 185; 40 (u 4): Exploding Arrow + 33 + 40 / 4 = 195
  assert.equal(h.actionWeights(0, 36).total, 185);
  assert.deepEqual(h.actionWeights(0, 40).skills.map((s) => s.upTo), [85, 152, 195]);
  // cold at 5 has Inner Sight only
  assert.deepEqual(h.actionWeights(1, 5), { plain: 75, skills: [{ skill: 'Inner Sight', upTo: 85 }], total: 85 });
  // a skill D2 passes over (its aura state on her) takes no share: 75 + 46 = 121, + 17 = 138
  assert.deepEqual(h.actionWeights(0, 20, (s) => s === 'Inner Sight').skills, [{ skill: 'Fire Arrow', upTo: 121 }, { skill: 'Exploding Arrow', upTo: 138 }]);

  // ───────────────────────── who is on offer ─────────────────────────
  assert.deepEqual([0, 1, 2].map((d) => h.rowsOnOffer(d).map((r) => r.id)), [[0, 1], [2, 3], [4, 5]]);
  assert.equal(h.ROSTER_SIZE, 10);
  const names = h.rosterNames();
  assert.equal(names.length, 41);
  for (const r of D2X_HIRELINGS) assert.deepEqual(r.names, names, `hireling ${r.id} shares Kashya's names`);
  for (let i = 0; i < names.length; i++) assert.deepEqual(h.hirelingName(0, i), D2X_HIRELING_NAMES[names[i]], `name ${i}`);
  assert.ok(names.every((k) => D2X_HIRELING_NAMES[k]?.name && D2X_HIRELING_NAMES[k]?.nameEn));
  assert.equal(h.hirelingName(0, 41), undefined);
  assert.throws(() => h.rosterNames('akara'), /hires no one/);

  // the roster: a seed per name in order, then 10 picks, each moving on (round to the first) past a name taken
  const scripted = (picks) => {
    let seed = 1000;
    const left = [...picks];
    return { left, int: (min, max) => (max === 0xffffffff ? seed++ : left.shift()) };
  };
  let rng = scripted([5, 5, 40, 40, 0, 1, 2, 3, 4, 6]);
  let roster = h.rollRoster(rng);
  assert.deepEqual(roster.map((e) => e.seed), Array.from({ length: 41 }, (_, i) => 1000 + i));
  // 5; 5 taken → 6; 40; 40 taken → 0; 0 → 1; 1 → 2; 2 → 3; 3 → 4; 4 → 5, 6 taken → 7; 6 → 7 taken → 8
  assert.deepEqual(h.onOffer(roster).map((e) => e.name), [0, 1, 2, 3, 4, 5, 6, 7, 8, 40]);
  assert.ok(roster.every((e) => !e.hired));
  // with 3 names the fourth pick finds them all taken and stops there
  rng = scripted([0, 0, 0, 0, 7]);
  const small = h.rollRoster(rng, 3);
  assert.deepEqual(small.map((e) => e.offered), [true, true, true]);
  assert.deepEqual(rng.left, [7], 'four picks rolled');
  // the Sisters' reward: the first on offer in name order, none to a hero with a hireling
  assert.equal(h.freeHireling(roster, false).name, 0);
  assert.equal(h.freeHireling(roster, true), null);
  // hiring takes her off the list; the last one hired rolls a new roster, every name back
  roster = h.takeFromRoster(roster, 0, scripted([]));
  assert.equal(roster[0].hired, true);
  assert.equal(h.onOffer(roster).length, 9);
  assert.equal(h.freeHireling(roster, false).name, 1);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) roster = h.takeFromRoster(roster, n, scripted([]));
  assert.deepEqual(h.onOffer(roster).map((e) => e.name), [40]);
  roster = h.takeFromRoster(roster, 40, scripted([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]));
  assert.deepEqual(h.onOffer(roster).map((e) => e.name), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.ok(roster.every((e) => !e.hired) && roster[0].seed === 1000);

  // D2's seed: SEED_InitLowSeed(s) is (low s, high 666); a roll is high + 0x6AC690C5 × low, halves the next seed
  const lcg = (seed) => {
    let lo = BigInt(seed >>> 0);
    let hi = 666n;
    return () => {
      const v = hi + 0x6ac690c5n * lo;
      lo = v & 0xffffffffn;
      hi = v >> 32n;
      return Number(lo);
    };
  };
  const s1 = new h.D2Seed(1);
  assert.equal(s1.next(), 666 + 0x6ac690c5); // 1791398751, under 2^32: the high half becomes 0
  assert.equal(s1.next(), 791599131); // 0x6AC690C5 × 1791398751, its low 32 bits
  const s9 = new h.D2Seed(9);
  const r9 = lcg(9);
  assert.equal(s9.below(2), r9() & 1, 'a power of two masks');
  assert.equal(s9.below(5), r9() % 5);
  assert.equal(new h.D2Seed(-1).next(), lcg(0xffffffff)());
  // a name on offer: the first roll picks fire or cold (& 1), the second % 5 her level ups, at most the hero's
  // lead on the band. Found by the rolls: seeds 2, 6, 36, 4, 24 are fire rolling 0–4, 3, 1, 41, 5, 23 cold
  const offer = (seed, lvl, d = 0) => {
    const o = h.hireOffer(seed, lvl, d);
    return [o.element, o.level, o.price, o.xp];
  };
  for (const [seed, elem, roll] of [[2, 'fire', 0], [6, 'fire', 1], [36, 'fire', 2], [4, 'fire', 3], [24, 'fire', 4], [3, 'cold', 0], [1, 'cold', 1], [41, 'cold', 2], [5, 'cold', 3], [23, 'cold', 4]]) {
    const r = lcg(seed);
    assert.equal(r() & 1 ? 'cold' : 'fire', elem, `seed ${seed}`);
    assert.equal(r() % 5, roll, `seed ${seed}`);
    assert.equal(h.hireOffer(seed, 10, 0).level, 3 + roll, `seed ${seed} at hero level 10`);
  }
  // every seed by the same rolls
  for (let seed = 0; seed < 300; seed++) {
    const r = lcg(seed);
    const id = r() & 1;
    const roll = r() % 5;
    for (const lvl of [1, 4, 10]) {
      const o = h.hireOffer(seed, lvl, 0);
      assert.deepEqual([o.id, o.level], [id, Math.min(3 + roll, lvl)], `seed ${seed}, hero ${lvl}`);
    }
  }
  // price Gold × (100 + 15u) / 100, at least Gold; experience Exp/Lvl × L² × (L + 1)
  // fire 100: 100, 115, 130, 145, 160; cold 150: 150, 172 (172.5), 195, 217 (217.5), 240
  assert.deepEqual([2, 6, 36, 4, 24].map((s) => offer(s, 10)), [['fire', 3, 100, 3600], ['fire', 4, 115, 8000], ['fire', 5, 130, 15000], ['fire', 6, 145, 25200], ['fire', 7, 160, 39200]]);
  assert.deepEqual([3, 1, 41, 5, 23].map((s) => offer(s, 10)), [['cold', 3, 150, 3780], ['cold', 4, 172, 8400], ['cold', 5, 195, 15750], ['cold', 6, 217, 26460], ['cold', 7, 240, 41160]]);
  // the hero's level caps her: seed 24 (roll 4) at 5 is 3 + 2, at 3 the band's 3, at 2 and 1 his own (u < 0: price Gold)
  assert.deepEqual([5, 3, 2, 1].map((l) => offer(24, l)), [['fire', 5, 130, 15000], ['fire', 3, 100, 3600], ['fire', 2, 100, 1200], ['fire', 1, 100, 200]]);
  // nightmare 36 + roll: 6000 × 160 / 100 = 9600, 7500 × 1.6 = 12000; experience 110 × 40² × 41, 115 × 40² × 41
  assert.deepEqual(offer(24, 50, 1), ['fire', 40, 9600, 7216000]);
  assert.deepEqual(offer(23, 50, 1), ['cold', 40, 12000, 7544000]);
  // a level-30 hero in nightmare hires at 30 for 6000 (6000 × 10 / 100 is below Gold)
  assert.deepEqual(offer(24, 30, 1), ['fire', 30, 6000, 110 * 900 * 31]);
  // hell 67 + roll: 12500 × 1.6 = 20000, 14000 × 1.6 = 22400; and 12500 at 67
  assert.deepEqual(offer(24, 99, 2), ['fire', 71, 20000, 120 * 71 * 71 * 72]);
  assert.deepEqual(offer(23, 99, 2), ['cold', 71, 22400, 125 * 71 * 71 * 72]);
  assert.deepEqual(offer(2, 99, 2), ['fire', 67, 12500, 120 * 67 * 67 * 68]);
  assert.equal(h.hireLevel(3, 10, 4), 7);
  assert.equal(h.hireLevel(3, 5, 4), 5);
  assert.equal(h.hireLevel(36, 20, 0), 20);
  assert.deepEqual([3, 4, 5, 6, 7].map((l) => h.hirePrice(1, l)), [150, 172, 195, 217, 240]);
  assert.deepEqual([36, 40].map((l) => h.hirePrice(3, l)), [7500, 12000]);

  // ───────────────────────── when, and what it costs ─────────────────────────
  // Kashya: from level 8, or with the Sisters' reward granted
  assert.equal(h.HIRE_MIN_LEVEL, 8);
  assert.deepEqual([[7, false], [7, true], [8, false], [1, true], [30, false]].map(([l, q]) => h.mayHire(l, q)), [false, true, true, true, true]);
  // raising her: 15 × L² / 2, at most 50000 (81: 49207.5; 82: 50430)
  assert.deepEqual([1, 3, 5, 7, 10, 20, 30, 36, 81, 82, 98].map((l) => h.resurrectCost(0, l)), [7, 67, 187, 367, 750, 3000, 6750, 9720, 49207, 50000, 50000]);
  // paying: inventory gold first, then the stash
  assert.deepEqual(h.pay(150, 200, 0), { gold: 50, stashGold: 0 });
  assert.deepEqual(h.pay(150, 100, 500), { gold: 0, stashGold: 450 });
  assert.deepEqual(h.pay(149, 100, 49), { gold: 0, stashGold: 0 });
  assert.equal(h.pay(150, 100, 49), null);

  // ───────────────────────── experience ─────────────────────────
  // her threshold at L is Exp/Lvl of her band × L² × (L + 1); the next level's at the same band's
  const xp = (id, l) => [h.xpAt(id, l), h.nextXp(id, l)];
  assert.deepEqual(xp(0, 1), [200, 1200]);
  assert.deepEqual(xp(0, 3), [3600, 8000]);
  assert.deepEqual(xp(0, 7), [39200, 57600]);
  assert.deepEqual(xp(0, 35), [4410000, 4795200]); // 100 × 1225 × 36, 100 × 1296 × 37
  assert.deepEqual(xp(0, 36), [5274720, 5722420]); // 110 × 1296 × 37, 110 × 1369 × 38
  assert.deepEqual(xp(1, 36), [5514480, 5982530]); // 115 × …
  assert.deepEqual(xp(0, 97), [120 * 9409 * 98, 120 * 9604 * 99]);
  assert.deepEqual(xp(0, 98), [120 * 9604 * 99, 0]);
  assert.deepEqual([h.mercStats(0, 7).xp, h.mercStats(0, 7).nextXp], [39200, 57600]);
  // the level a total makes, counted up from 1
  assert.deepEqual([0, 1199, 1200, 3599, 3600, 7999, 8000, 4795199, 4795200, 5274720, 5722419, 5722420, 1e9].map((x) => h.levelForXp(0, x)), [1, 1, 2, 2, 3, 3, 4, 35, 36, 36, 36, 37, 98]);
  assert.equal(h.levelForXp(1, 105 * 1296 * 37), 36);
  assert.equal(h.levelForXp(1, 105 * 1296 * 37 - 1), 35);
  for (const id of [0, 1, 2, 5]) for (const l of [3, 7, 20, 36, 40, 67, 80]) if (l >= h.bandAt(id, 1).level) assert.equal(h.levelForXp(id, h.xpAt(id, l)), l, `hireling ${id} at ${l}`);

  // a kill: the hero's gain at her level, at most (next − this threshold) >> 6, then 86 / 256 when she didn't make it
  // level 3: (8000 − 3600) / 64 = 68; 86 × 68 / 256 = 22
  assert.equal(h.killShare(0, 3, 1000, 3, { killer: true }), 68);
  assert.equal(h.killShare(0, 3, 1000, 3, { killer: false }), 22);
  // level 5 (cap 10200 / 64 = 159): a monster of her level worth 100 gives it all, 86 × 100 / 256 = 33 shared
  assert.equal(h.killShare(0, 5, 100, 5, { killer: true }), 100);
  assert.equal(h.killShare(0, 5, 100, 5, { killer: false }), 33);
  // one 5 above worth 181 (a level-10 boss): all of it, held at 159; 86 × 159 / 256 = 53
  assert.equal(h.killShare(0, 5, 181, 10, { killer: true }), 159);
  assert.equal(h.killShare(0, 5, 181, 10, { killer: false }), 53);
  // level 10 (cap 35200 / 64 = 550): a level-3 monster worth 50 is 7 below, 159 / 256: 31; shared 10
  assert.equal(h.killShare(0, 10, 50, 3, { killer: true }), 31);
  assert.equal(h.killShare(0, 10, 50, 3, { killer: false }), 10);
  // her gear's +50 % goes in before the cap
  assert.equal(h.killShare(0, 10, 100, 10, { killer: true, addXpPct: 50 }), 150);
  assert.equal(h.killShare(0, 10, 1000, 10, { killer: true, addXpPct: 50 }), 550);
  // the caps of level 36 (fire 110 × 4070 / 64 = 6995, cold 115 × 4070 / 64 = 7313), as quest-merc §2.3 has them
  assert.equal(h.killShare(0, 36, 1e7, 36, { killer: true }), 6995);
  assert.equal(h.killShare(1, 36, 1e7, 36, { killer: true }), 7313);
  assert.equal(h.killShare(0, 5, 0, 5, { killer: true }), 0);

  // gaining: she climbs while the total reaches the next threshold at the band she started in
  assert.deepEqual(h.gainXp(0, 3, 3600, 4400, 10), { level: 4, xp: 8000, levelled: true });
  assert.deepEqual(h.gainXp(0, 3, 3600, 4399, 10), { level: 3, xp: 7999, levelled: false });
  assert.deepEqual(h.gainXp(0, 3, 3600, 30000, 10), { level: 6, xp: 33600, levelled: true }); // 8000, 15000, 25200 reached, 39200 not
  // nothing at or above her hero's level, nor at 98, nor for nothing
  assert.deepEqual(h.gainXp(0, 10, 110000, 500, 10), { level: 10, xp: 110000, levelled: false });
  assert.deepEqual(h.gainXp(0, 98, 120 * 9604 * 99, 500, 99), { level: 98, xp: 120 * 9604 * 99, levelled: false });
  assert.deepEqual(h.gainXp(0, 5, 15000, 0, 10), { level: 5, xp: 15000, levelled: false });
  // one kill may take her past her hero: D2 checks only before it (5 under a level-6 hero, 45000 makes 7)
  assert.deepEqual(h.gainXp(0, 5, 15000, 30000, 6), { level: 7, xp: 45000, levelled: true });
  // crossing into band 36 at 100 × 36² × 37 = 4795200, she is lifted to 110 × 36² × 37
  assert.deepEqual(h.gainXp(0, 35, 4795000, 300, 50), { level: 36, xp: 5274720, levelled: true });
  // and no further than 98 (hell: 120 × 97² × 98 + 10 000 000 passes 120 × 98² × 99)
  assert.deepEqual(h.gainXp(4, 97, 120 * 9409 * 98, 10000000, 99), { level: 98, xp: 120 * 9409 * 98 + 10000000, levelled: true });

  // ───────────────────────── her gear ─────────────────────────
  // a helm (circlets, primal helms, pelts are helms), body armour, a bow (Amazon bows count as bows); nothing else
  const slot = (code) => h.mercSlot(ITEM_BASES[code]);
  assert.deepEqual(['cap', 'ci0', 'ba1', 'dr1', 'qui', 'sbw', 'am1', 'lxb', 'am3', 'am5', 'buc', 'lgl', 'lbt', 'lbl', 'rin', 'amu', 'lsd'].map(slot),
    ['head', 'head', 'head', 'head', 'body', 'weapon', 'weapon', null, null, null, null, null, null, null, null, null, null]);
  // level 3 (str 35, dex 45): Short Bow (dex 15), Composite Bow (25 / 35), Long Bow (22 / 19), cap, Quilted Armor (12)
  const w3 = { level: 3, str: 35, dex: 45 };
  const wear = (code, who = w3, h2) => h.mercWear(createItem(code), who, h2);
  assert.deepEqual(['sbw', 'cbw', 'lbw', 'cap', 'qui'].map((c) => wear(c)), [{ slot: 'weapon' }, { slot: 'weapon' }, { slot: 'weapon' }, { slot: 'head' }, { slot: 'body' }]);
  // Long Battle Bow asks str 40, Plate Mail 65, a Circlet level 16: refused aloud
  assert.deepEqual(wear('lbb'), { refused: 'str' });
  assert.deepEqual(wear('plt'), { refused: 'str' });
  assert.deepEqual(wear('ci0'), { refused: 'level' });
  assert.deepEqual(wear('lbb', { level: 3, str: 40, dex: 49 }), { refused: 'dex' });
  assert.deepEqual(wear('lbb', { level: 3, str: 40, dex: 50 }), { slot: 'weapon' });
  // Stag Bow, an Amazon bow (str 30, dex 45, level 14): D2R 2.7's equivalentcharclass ama lets her, from 14
  assert.deepEqual(wear('am1'), { refused: 'level' });
  assert.deepEqual(wear('am1', { level: 14, str: 30, dex: 45 }), { slot: 'weapon' });
  assert.equal(ITEM_BASES.am1.classCode, 'ama');
  // without it (D2MOO's 1.14 rule) a class item is no hireling's but Act 5's barbarians'
  assert.deepEqual(wear('am1', { level: 14, str: 30, dex: 45 }, { ...h.hireling(0), cls: '' }), { refused: 'class' });
  // a barbarian's helm or a druid's pelt is a helm of another class; crossbows, Amazon spears, shields are not hers
  assert.deepEqual(wear('ba1', { level: 30, str: 100, dex: 100 }), { refused: 'class' });
  assert.deepEqual(wear('dr1', { level: 30, str: 100, dex: 100 }), { refused: 'class' });
  assert.deepEqual(['lxb', 'am3', 'buc', 'lgl', 'rin'].map((c) => wear(c, { level: 30, str: 100, dex: 100 })), Array(5).fill({ refused: 'not-hers' }));
  // ethereal: 10 less strength (Plate Mail 55)
  const eth = createItem('plt');
  eth.eth = true;
  assert.deepEqual(h.mercWear(eth, { level: 3, str: 55, dex: 45 }), { slot: 'body' });
  assert.deepEqual(h.mercWear(eth, { level: 3, str: 54, dex: 45 }), { refused: 'str' });
  // what D2 passes over without a word: a quest item, an unidentified one, a broken one
  assert.deepEqual(wear('leg'), { refused: 'quest' });
  assert.deepEqual(h.mercWear(createItem('sbw', 'magic', 10, { identified: false }), w3), { refused: 'unidentified' });
  const broken = createItem('cap');
  assert.ok(broken.maxDur > 0);
  broken.dur = 0;
  assert.deepEqual(h.mercWear(broken, w3), { refused: 'broken' });
  // potions she drinks: healing (rejuvenations are healing potions too), thawing, antidote
  assert.deepEqual(['hp1', 'hp5', 'rvs', 'rvl', 'wms', 'yps', 'mp1', 'vps', 'sbw'].map((c) => h.mercDrinks(createItem(c))), [true, true, true, true, true, true, false, false, false]);
  // and her gear never wears
  assert.equal(h.MERC_GEAR_WEARS, false);
};
