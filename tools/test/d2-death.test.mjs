// Diablo II death penalty and corpse (src/game/d2/death.ts): each case is worked out by hand from
// D2MOO PLAYER_ApplyDeathPenalty (Player.cpp:679-795) and the corpse handler (PlrModes.cpp:429-650).
import assert from 'node:assert/strict';

export default async (load) => {
  const d = await load('/src/game/d2/death.ts');
  const { xpForLevel, MAX_XP } = await load('/src/game/d2/xp.ts');

  // gold: level % (at most 20) of inventory and stash, out of the inventory first; its rest drops
  assert.deepEqual(d.deathGold(10, 1000, 5000), { lost: 600, dropped: 400, stashGold: 5000 });
  assert.deepEqual(d.deathGold(5, 1000, 0), { lost: 50, dropped: 950, stashGold: 0 });
  assert.deepEqual(d.deathGold(30, 1000, 9000), { lost: 2000, dropped: 0, stashGold: 8000 });
  assert.deepEqual(d.deathGold(20, 0, 10000), { lost: 2000, dropped: 0, stashGold: 8000 });
  assert.deepEqual(d.deathGold(1, 99, 0), { lost: 0, dropped: 99, stashGold: 0 });
  assert.deepEqual(d.deathGold(99, 0, 0), { lost: 0, dropped: 0, stashGold: 0 });

  // experience: none on normal, 5 / 10 % of the level's span on nightmare / hell
  const start = xpForLevel(40);
  assert.equal(xpForLevel(41) - start, 1964461);
  const mid = start + 1000000;
  assert.deepEqual(d.deathXp(40, mid, 'normal'), { xp: mid, lost: 0 });
  assert.deepEqual(d.deathXp(40, mid, 'nightmare'), { xp: mid - 98223, lost: 98223 });
  assert.deepEqual(d.deathXp(40, mid, 'hell'), { xp: mid - 196446, lost: 196446 });
  assert.deepEqual(d.deathXp(40, mid, 2), d.deathXp(40, mid, 'hell'));
  // never down to the level's start: one past it, the loss counted down to the start
  assert.deepEqual(d.deathXp(40, start + 196447, 'hell'), { xp: start + 1, lost: 196446 });
  assert.deepEqual(d.deathXp(40, start + 196446, 'hell'), { xp: start + 1, lost: 196446 });
  assert.deepEqual(d.deathXp(40, start + 10, 'hell'), { xp: start + 1, lost: 10 });
  assert.deepEqual(d.deathXp(40, start, 'hell'), { xp: start + 1, lost: 0 });
  assert.deepEqual(d.deathXp(1, 400, 'hell'), { xp: 400, lost: 0 });
  assert.deepEqual(d.deathXp(99, MAX_XP, 'hell'), { xp: MAX_XP, lost: 0 });
  // the top levels exactly: 10 % of 98's span of 291058498
  const at98 = xpForLevel(98) + 100000000;
  assert.deepEqual(d.deathXp(98, at98, 'hell'), { xp: at98 - 29105849, lost: 29105849 });

  // all of it, and the corpse's 75 %
  assert.deepEqual(d.deathPenalty({ level: 40, xp: mid, gold: 1000, stashGold: 100000, diff: 'hell' }), {
    goldLost: 20200,
    goldDropped: 0,
    stashGold: 80800,
    xp: mid - 196446,
    xpLost: 196446,
    corpseXp: 147334,
  });
  assert.equal(d.deathPenalty({ level: 12, xp: 100000, gold: 300, stashGold: 0, diff: 'normal' }).corpseXp, 0);
  // past 2^20 the corpse's 75 % divides first (MONSTERUNIQUE_CalculatePercentage): 75 × trunc(lost / 100)
  const at60 = xpForLevel(60) + 5000000;
  const p60 = d.deathPenalty({ level: 60, xp: at60, gold: 0, stashGold: 0, diff: 'hell' });
  assert.equal(p60.xpLost, 1100964);
  assert.equal(p60.corpseXp, 75 * 11009); // 825675, not 825723
  assert.equal(d.deathPenalty({ level: 98, xp: at98, gold: 0, stashGold: 0, diff: 'hell' }).corpseXp, 21829350);

  // the corpse takes the gear and the cursor item; the belt keeps its first row
  const eq = { head: 'cap', weapon: 'sword' };
  const c = d.corpseSplit(eq, [['h1', 'h2', 'h3'], ['m1'], [], ['r1', 'r2']], 'ring');
  assert.deepEqual(c.equipment, eq);
  assert.notEqual(c.equipment, eq);
  assert.deepEqual(c.items, ['ring']);
  assert.deepEqual(c.belt, [['h1'], ['m1'], [], ['r1']]);
  assert.deepEqual(c.loose, ['h2', 'r2', 'h3']); // D2's box order: the second row left to right, then the third
  assert.deepEqual(d.corpseSplit({}, [[], [], [], []]), { equipment: {}, items: [], belt: [[], [], [], []], loose: [] });
};
