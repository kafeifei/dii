// Diablo II's monster numbers (src/game/d2/monstats.ts, src/game/monster.ts), worked out by hand
// below from the tables: MonStats.txt's percentages (src/data/d2x/monsters.ts) of MonLvl.txt's
// expansion columns (src/data/d2x/monlvl.ts) at the monster's level, floored as DATATBLS_ApplyRatio
// does. Normal monsters at their own row's level, nightmare and hell at the area's (Blood Moor 36
// and 67), a champion's, unique's and minion's modifiers (MonUMod.txt constants: life +200/+300/+100 %
// in normal, +3 levels and ×5 experience, a champion a level and 2/5 of it back, damage and to-hit
// up by ChampionDmgBonus 90 %), the superuniques' own (Bishibosh's magic resistance and fire,
// Corpsefire's spectral hit, its poison a rate in 256ths a frame), velocities at 75 % (Monster.cpp:214)
// with what an AI adds move by move on top, the shamans' chain missiles, and D2's to-hit both ways.
import assert from 'node:assert/strict';

export default async (load) => {
  const { Monster } = await load('/src/game/monster.ts');
  const { monsterDef } = await load('/src/data/monsters.ts');
  const S = await load('/src/game/d2/monstats.ts');
  const { hitChance } = await load('/src/game/d2/stats.ts');
  const { hitOdds } = await load('/src/game/combat.ts');
  const { MPS_PER_VELOCITY } = await load('/src/game/d2/stats.ts');
  const { D2X_MONSTERS: D2X } = await load('/src/data/d2x/monsters.ts');
  const { monsterPacket } = await load('/src/game/ai.ts');
  const lo = (l) => l;
  // life rolled at the bottom or the top of MinHP–MaxHP
  const atMin = { roll: (a) => a };
  const atMax = { roll: (a, b) => b };
  const mk = (id, lvl, rank = 'normal', mods = [], o = {}) => new Monster(monsterDef(id), lvl, rank, { x: 0, z: 0 }, mods, o);
  /** life range, defense, experience, A1 and A2 (min, max, to-hit), level */
  const check = (what, m, want) => {
    const t = m.def.row.diff[m.difficulty];
    const hp = S.monStats(m.def.row, m.difficulty, m.baseLevel, m.rank, m.mods, lo).hp;
    if (want.hp) assert.deepEqual(hp, want.hp, `${what}: life ${hp}`);
    if (want.life !== undefined) assert.equal(m.maxLife, want.life, `${what}: rolled life`);
    if (want.def !== undefined) assert.equal(m.defense, want.def, `${what}: defense`);
    if (want.xp !== undefined) assert.equal(m.xp, want.xp, `${what}: experience`);
    if (want.level !== undefined) assert.equal(m.level, want.level, `${what}: level`);
    for (const mode of ['a1', 'a2', 's1']) {
      if (!want[mode]) continue;
      const a = m.attack(mode);
      assert.deepEqual(a && [a.min, a.max, a.ar], want[mode], `${what}: ${mode} of ${JSON.stringify(t[mode])} is ${a && [a.min, a.max, a.ar]}`);
    }
    if (want.res) for (const [k, v] of Object.entries(want.res)) assert.equal(m.res[k], v, `${what}: ${k} resistance`);
  };

  // ── normal, each at its own level (MonStats Level) ──
  // zombie1, level 1: MonLvl L1 hp 7, ac 6, th 8, dm 2, xp 30. MinHP 101 % → 7·101/100 = 7, MaxHP
  // 181 % → 12; AC 84 % → 5; Exp 111 % → 33; A1 51/151/101 → 1–3, to-hit 8; A2 101/151/101 → 2–3, 8
  check('zombie1', mk('zombie1', 1, 'normal', [], atMax), { hp: [7, 12], life: 12, def: 5, xp: 33, level: 1, a1: [1, 3, 8], a2: [2, 3, 8], res: { poison: 50 } });
  // fallen1, level 1: MinHP 21 % → 1, MaxHP 61 % → 4 (D2's 1–4 life); AC 84 % → 5; Exp 61 % → 18;
  // A1 and A2 51/101/101 → 1–2, to-hit 8
  check('fallen1', mk('fallen1', 1, 'normal', [], atMin), { hp: [1, 4], life: 1, def: 5, xp: 18, a1: [1, 2, 8], a2: [1, 2, 8] });
  // quillrat1, level 1: 21/81 % → 1–5; AC 5; Exp 71 % → 21; A1 51/101/101 → 1–2, 8; A2 (the
  // quills) 15/25/134 → 0–0, to-hit 134 % of 8 = 10; its spike1 missile adds 1–2 at level 0 + 1
  check('quillrat1', mk('quillrat1', 1), { hp: [1, 5], def: 5, xp: 21, a1: [1, 2, 8], a2: [0, 0, 10] });
  const spike = S.missileDamage('spike1', 1);
  assert.deepEqual([spike.src, ...spike.phys], [1, 1, 2], `spike1 at level 1: ${JSON.stringify(spike)}`);
  assert.deepEqual(S.monsterMissile(monsterDef('quillrat1').row, 0), { mode: 'a2', missile: 'spike1', level: 1 });
  // MonLvl L2: hp 9, ac 12, th 12, dm 3, xp 40
  // brute1, level 2: 129/215 % → 11–19; AC 84 % → 10; Exp 121 % → 48; A1 67/101/101 → 2–3, 12; A2 101/134/101 → 3–4, 12
  check('brute1', mk('brute1', 2), { hp: [11, 19], def: 10, xp: 48, a1: [2, 3, 12], a2: [3, 4, 12] });
  // corruptrogue1, level 2: 58/101 % → 5–9; AC 10; Exp 78 % → 31; A1 34/101/101 → 1–3, 12
  check('corruptrogue1', mk('corruptrogue1', 2), { hp: [5, 9], def: 10, xp: 31, a1: [1, 3, 12] });
  // cr_lancer1, level 2: 86/129 % → 7–11; AC 10; Exp 91 % → 36; A1 67/134/101 → 2–4, 12
  check('cr_lancer1', mk('cr_lancer1', 2), { hp: [7, 11], def: 10, xp: 36, a1: [2, 4, 12] });
  // fallenshaman1, level 2: 58/101 % → 5–9; AC 10; Exp 81 % → 32; A1 34/101/101 → 1–3, 12; 25 % fire
  // resistance; its fire (ShamanFire, level 1 + MonsterSkillBonus 0) is shafire1's 1–4
  check('fallenshaman1', mk('fallenshaman1', 2), { hp: [5, 9], def: 10, xp: 32, a1: [1, 3, 12], res: { fire: 25 } });
  assert.deepEqual(S.monsterMissile(monsterDef('fallenshaman1').row, 0), { mode: 's1', missile: 'shafire1', level: 1, skill: 'ShamanFire' });
  // a fallenshaman3's is shafire3, its place in the class on from shafire1 (SkillMonst.cpp:176-187)
  assert.equal(S.monsterMissile(monsterDef('fallenshaman3').row, 0).missile, 'shafire3');
  assert.equal(S.chainIndex(D2X.fallenshaman4), 3);
  // spike1 (Vel 10, VelLev 8, MaxVel 10) flies at 10 + 1 × 8 / 8 = 11 velocity at level 1, 75 % of
  // it, for 40 frames: MaxVel caps no missile's start (Missiles.cpp:120-125); 10 + 8 = 18 in hell (level 8)
  const sf = S.missileFlight('spike1', 1);
  assert.deepEqual([sf.speed, sf.life], [8.25 * MPS_PER_VELOCITY, 1.6]);
  assert.equal(S.missileFlight('spike1', 8).speed, 13.5 * MPS_PER_VELOCITY);
  // a fallenshaman4's shafire4: 16, no VelLev
  assert.equal(S.missileFlight(S.monsterMissile(monsterDef('fallenshaman4').row, 0).missile, 1).speed, 12 * MPS_PER_VELOCITY);
  const fire = S.missileDamage('shafire1', 1);
  assert.deepEqual([fire.src, fire.elem.type, fire.elem.min, fire.elem.max], [0, 'fire', 1, 4], `shafire1: ${JSON.stringify(fire)}`);
  // in nightmare the skill is 1 + 3 levels up: 1 + 10 × 3 = 31 to 4 + 30 = 34
  const nmFire = S.missileDamage('shafire1', S.monsterMissile(monsterDef('fallenshaman1').row, 1).level);
  assert.deepEqual([nmFire.elem.min, nmFire.elem.max], [31, 34]);

  // ── nightmare and hell: Blood Moor's level, 36 and 67 (levels.txt MonLvlEx) ──
  assert.equal(S.spawnLevel(monsterDef('zombie1').row, 1, 36), 36);
  assert.equal(S.spawnLevel(monsterDef('zombie1').row, 0, 36), 1, 'in normal its own level');
  assert.equal(S.spawnLevel(monsterDef('andariel').row, 2, 80), 75, "a boss keeps its own level (Andariel's 75 in hell)");
  // nightmare zombie1 at 36: MonLvl L36 (N) hp 525, ac 528, th 738, dm 31, xp 2568; MonStats (N)
  // 105/150 % → 551–787; AC 80 % → 422; Exp 105 % → 2696; A1 60/140/105 → 18–43, 774; A2 70/150/110 → 21–46, 811
  check('nightmare zombie1', mk('zombie1', 36, 'normal', [], { difficulty: 1 }), {
    hp: [551, 787], def: 422, xp: 2696, level: 36, a1: [18, 43, 774], a2: [21, 46, 811], res: { poison: 75 },
  });
  // hell zombie1 at 67: L67 (H) hp 4112, ac 1334, th 2724, dm 76, xp 26733 → 4317–6168, AC 1067, Exp
  // 28069; A1 45–106, 2860; A2 53–114, 2996; 50 % physical, 120 % cold and 75 % poison resistance
  check('hell zombie1', mk('zombie1', 67, 'normal', [], { difficulty: 2 }), {
    hp: [4317, 6168], def: 1067, xp: 28069, level: 67, a1: [45, 106, 2860], a2: [53, 114, 2996], res: { phys: 50, cold: 120, poison: 75 },
  });

  // ── champions, uniques, minions ──
  // a champion corruptrogue1 (normal, level 2, life 9): +200 % → 27; level 2 + 3 − 1 = 4; Exp
  // 31 × 5 − 2 × (155 / 5) = 93; damage +100 × 90 / 100 = 90 %, to-hit +75 × 90 / 100 = 67 %. Its
  // A1 at level 4 (dm 4, th 26): 34 % → 1 + 0, 101 % → 4 + 3 = 7; to-hit 26 + 17 = 43. No regen; 95 % velocity
  const champ = mk('corruptrogue1', 2, 'champion', [16], atMax);
  check('champion corruptrogue1', champ, { life: 27, level: 4, xp: 93, a1: [1, 7, 43] });
  assert.equal(champ.regen, 0);
  assert.equal(champ.walkSpeed, ((5 * 95) / 100) * MPS_PER_VELOCITY);
  // a unique fallen1 that is extra strong (life 4): +300 % → 16; level 4; Exp 90; damage +150 × 90 /
  // 100 = 135 %, to-hit +90 %: A1 at level 4: 2 + 2 = 4 to 4 + 5 = 9, to-hit 26 + 23 = 49
  check('unique strong fallen1', mk('fallen1', 1, 'unique', [5], atMax), { life: 16, level: 4, xp: 90, a1: [4, 9, 49] });
  // its minion (life 4): +100 % → 8, level 4, Exp 90; extra strong a minion's: +75 × 90 / 100 = 67 %
  // damage, +50 × 90 / 100 = 45 % to-hit: A1 2 + 1 = 3 to 4 + 2 = 6, 26 + 11 = 37
  check('minion fallen1', mk('fallen1', 1, 'minion', [5], atMax), { life: 8, level: 4, xp: 90, a1: [3, 6, 37] });
  // the champion types: possessed doubles the life (9 → 27 → 54); berserk keeps a quarter and gets
  // no level back (27 → 7, level 5, Exp 155), +270 % damage and to-hit
  check('possessed', mk('corruptrogue1', 2, 'champion', [38], atMax), { life: 54, level: 4 });
  const berserk = mk('corruptrogue1', 2, 'champion', [39], atMax);
  check('berserk', berserk, { life: 7, level: 5, xp: 155 });
  assert.deepEqual([berserk.dmgPct, berserk.arPct], [270, 270]);
  // ghostly: 80 % physical resistance and cold on its blows, 33–50 % of dm 4 = 1–2, 150 frames
  const ghost = mk('corruptrogue1', 2, 'champion', [36], atMax);
  assert.deepEqual([ghost.res.phys, ...ghost.plus.cold, ghost.plus.coldFrames], [80, 1, 2, 150]);
  // fanatic: −70 % defense (10 → 3)
  assert.equal(mk('corruptrogue1', 2, 'champion', [37]).defense, 3);

  // Bishibosh: fallenshaman1 (level 2) with magic resistance and fire enchanted (superuniques.txt
  // Mod1 8, Mod2 9): life 9 → 36, level 5, Exp 160; +40 cold, fire, lightning, then +75 fire (25 → 65
  // → 140); fire on every blow: 66–100 % of dm 4 at level 5 = 2–4
  const bishi = mk('fallenshaman1', 2, 'unique', [8, 9], { ...atMax, superUnique: 'Bishibosh' });
  check('Bishibosh', bishi, { life: 36, level: 5, xp: 160, res: { cold: 40, fire: 140, light: 40 } });
  assert.deepEqual(bishi.plus.fire, [2, 4]);
  // his fallen1 minions: a minion's share of fire enchanted in normal is 0 % (constants 16, 19)
  assert.deepEqual(mk('fallen1', 1, 'minion', [8, 9]).plus.fire, [0, 0]);
  // Corpsefire: zombie1 with spectral hit: life 12 → 48, level 4; +20 cold, fire, lightning
  const corpsefire = mk('zombie1', 1, 'unique', [27], { ...atMax, superUnique: 'Corpsefire' });
  check('Corpsefire', corpsefire, { life: 48, level: 4, xp: 165, res: { cold: 20, fire: 20, light: 20 } });
  // his spectral hit (MonsterUnique.cpp:1351-1427): 66–100 % of dm 4 at level 4 = 2–4 of one element;
  // as poison that is a rate in 256ths a frame for 40 frames: 2 × 40 / 256 = 0.3125 to 0.625 in all
  const spectral = { fire: 0, light: 0, magic: 0, cold: 0, poison: 0 };
  for (let i = 0; i < 400; i++) {
    const pk = monsterPacket(corpsefire, 'a1');
    for (const k of Object.keys(spectral)) if (pk[k]) spectral[k]++;
    if (pk.fire) assert.ok(pk.fire >= 2 && pk.fire <= 4, `Corpsefire's spectral fire ${pk.fire}`);
    if (pk.cold) assert.ok(pk.cold >= 2 && pk.cold <= 4 && pk.chill === 40 / 25, `Corpsefire's spectral cold ${pk.cold} for ${pk.chill} s`);
    if (pk.poison) assert.ok(pk.poison >= (2 * 40) / 256 && pk.poison <= (4 * 40) / 256 && pk.poisonLen === 40 / 25, `Corpsefire's spectral poison ${pk.poison} over ${pk.poisonLen} s`);
  }
  assert.ok(Object.values(spectral).every((n) => n > 40), `Corpsefire's spectral elements over 400 blows: ${JSON.stringify(spectral)}`);

  // ── speed: Velocity at 75 %, what its AI adds move by move on top (AITACTICS_SetVelocity) ──
  // a zombie1 (Velocity 1) walks at 75 %, and runs at the hero at +100 (AiThink.cpp:351): 175 %
  const z = mk('zombie1', 1);
  assert.equal(z.walkSpeed, 0.75 * MPS_PER_VELOCITY);
  assert.equal(z.speed, z.walkSpeed);
  assert.equal(z.moveSpeed(100), 1.75 * MPS_PER_VELOCITY);
  // a corruptrogue1 (5) at its MonAI Run Velocity, 100 (AiThink.cpp:894): 5 × 175 %; −50 % kept at 25 %
  assert.equal(mk('corruptrogue1', 2).moveSpeed(100), 5 * 1.75 * MPS_PER_VELOCITY);
  assert.equal(mk('fallen1', 1).moveSpeed(-60), 5 * 0.25 * MPS_PER_VELOCITY);
  // extra fast on a fallen (Velocity 5): + 2048 / 5 − 128 = 281, kept to 100 → 175 %
  assert.equal(mk('fallen1', 1, 'minion', [6]).walkSpeed, 5 * 1.75 * MPS_PER_VELOCITY);
  // regen: life × 256 × Regen 2 >> 12 a frame: 12 life → 1/256 a frame, 25/256 a second
  assert.equal(mk('zombie1', 1, 'normal', [], atMax).regen, 25 / 256);

  // ── to-hit both ways, D2's: 100 × AR / (AR + DR), × 2 × alvl / (alvl + dlvl), 5–95 % ──
  // a zombie1's A1 (8) against a level-1 hero's defense 10: 100 × 8 / 18 = 44, × 2 / 2 = 44 %
  assert.equal(hitChance(z.attack('a1').ar, 10, z.level, 1), 44);
  // a level-1 hero's 50 against its defense 5: 90; against the hell zombie (1067, level 67) at
  // level 30 with 600: 100 × 600 / 1667 = 35, × 60 / 97 = 21 %
  assert.equal(hitChance(50, z.defense, 1, z.level), 90);
  const hz = mk('zombie1', 67, 'normal', [], { difficulty: 2 });
  assert.equal(hitOdds(600, hz.effectiveDefense(), 30, hz.level), 0.21);

  console.log(`  zombie1 7–12 life, fallen1 1–4, brute1 11–19, the nightmare zombie 551–787 and hell's 4317–6168; Bishibosh 36 life, fire 2–4; champions, uniques and minions by MonUMod`);
};
