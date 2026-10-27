// Diablo II experience (src/game/d2/xp.ts): each case is worked out by hand from the D2MOO code the
// module cites (SUnitDmg.cpp:3024-3149), with experience.txt from src/data/d2x/experience.ts.
import assert from 'node:assert/strict';

export default async (load) => {
  const x = await load('/src/game/d2/xp.ts');
  const { D2_XP, D2_XP_RATIO } = await load('/src/data/d2/progression.ts');

  // the tables: the same as the game uses now, and D2MOO's level-gap factors in 256ths
  for (let L = 2; L <= x.MAX_LEVEL; L++) {
    assert.equal(x.xpForLevel(L), D2_XP[L - 1]);
    assert.equal(x.levelForXp(x.xpForLevel(L)), L);
    assert.equal(x.levelForXp(x.xpForLevel(L) - 1), L - 1);
  }
  assert.equal(x.xpForLevel(1), 0);
  assert.equal(x.levelForXp(0), 1);
  assert.equal(x.levelForXp(Number.MAX_SAFE_INTEGER), 99);
  assert.equal(x.MAX_XP, 3520485254);
  for (let L = 1; L < x.MAX_LEVEL; L++) assert.equal(x.ratioXp(1024, L), D2_XP_RATIO[L], `ratio at level ${L}`);
  const lower = [256, 256, 256, 256, 256, 256, 207, 159, 110, 61, 13]; // SUnitDmg.cpp:3047-3050
  const higher = [256, 256, 256, 256, 256, 256, 225, 174, 92, 38, 5]; // SUnitDmg.cpp:3061-3064
  for (let d = 0; d <= 12; d++) {
    assert.equal(x.levelGapXp(256, 40, 40 - d), lower[Math.min(d, 10)], `${d} levels below`);
    assert.equal(x.levelGapXp(256, 10, 10 + d), higher[Math.min(d, 10)], `${d} levels above`);
  }

  // the level gap: monsters 6+ below, and 6+ above while the hero is below 25
  assert.equal(x.killXp(100, 10, 10), 100);
  assert.equal(x.killXp(100, 15, 10), 100);
  assert.equal(x.killXp(100, 16, 10), 80); // 207 × 100 / 256 = 80.9
  assert.equal(x.killXp(100, 40, 1), 5); // 13 / 256
  assert.equal(x.killXp(100, 10, 15), 100);
  assert.equal(x.killXp(100, 10, 16), 87); // 225 / 256
  assert.equal(x.killXp(100, 10, 30), 1); // 5 / 256 = 1.95
  assert.equal(x.killXp(1282, 15, 12), 1282); // Andariel on normal (level 12, 1282) to a level-15 hero: all of it
  assert.equal(x.killXp(50, 41, 3), 2); // a level-3 monster (monlvl.txt normal 50) to a level-41 hero: 13 × 50 / 256 = 2.5
  // from 25 a stronger monster gives hero / monster level, one level up already
  assert.equal(x.killXp(1000, 24, 31), 679); // 174 / 256 = 679.7
  assert.equal(x.killXp(1000, 25, 31), 806); // 25 / 31 = 806.5
  assert.equal(x.killXp(1000, 30, 31), 967);
  assert.equal(x.killXp(1000, 30, 30), 1000);
  assert.equal(x.killXp(1000, 30, 40), 750);

  // ExpRatio from 70, nothing at 99; "+X% experience" after it
  assert.equal(x.killXp(1000, 69, 69), 1000);
  assert.equal(x.killXp(1000, 70, 70), 953); // × 976 / 1024
  assert.equal(x.killXp(1000, 98, 98), 5); // × 6 / 1024
  assert.equal(x.killXp(1000, 99, 99), 0);
  assert.equal(x.killXp(1000, 10, 10, 50), 1500);
  assert.equal(x.killXp(1000, 70, 70, 50), 1429); // 953 + 476
  assert.equal(x.killXp(1000, 16, 10, 7), 808 + 56); // 207 × 1000 / 256 = 808, + 7 %
  assert.equal(x.killXp(0, 10, 10, 50), 0);

  // big numbers divide first: past 2^20 the 256ths and the 1024ths drop their low digits
  assert.equal(x.percentOf(2000000, 207, 256), 207 * 7812);
  assert.equal(x.killXp(2000000, 10, 10), 1024 * 1953);
  assert.equal(x.killXp(2000000, 16, 10), 1024 * 1579); // 207 × 7812 = 1617084, then 1024ths
  assert.equal(x.killXp(2000000, 70, 70), 1906250); // up to 2^21 from 70: × 976 / 1024 exactly
  assert.equal(x.killXp(3000000, 70, 70), 976 * 2929);
  assert.equal(x.killXp(1e7, 10, 10), 1024 * 8191); // a monster's worth stops at 2^23 − 1
  assert.equal(x.percentOf(5, 3, 0), 0);

  // adding: the level follows the total, held at the level-99 threshold
  assert.deepEqual(x.addXp(0, 499), { xp: 499, level: 1, gained: 499 });
  assert.deepEqual(x.addXp(0, 500), { xp: 500, level: 2, gained: 500 });
  assert.deepEqual(x.addXp(500, 3500), { xp: 4000, level: 4, gained: 3500 });
  assert.deepEqual(x.addXp(x.MAX_XP - 10, 100), { xp: x.MAX_XP, level: 99, gained: 10 });
};
