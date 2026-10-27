// Diablo II speed breakpoints (src/game/d2/frames.ts): the published breakpoint tables, maxroll's
// "Breakpoints & Animations" (maxroll.gg/d2/resources/breakpoints-animations) and the Amazon Basin's
// attack cycle lengths (theamazonbasin.com/wiki/index.php/Attack_speed), come out of D2MOO's rules
// (Units.cpp) and the hand-entered frame counts; the rest is worked out by hand.
import assert from 'node:assert/strict';

export default async (load) => {
  const f = await load('/src/game/d2/frames.ts');
  const bp = (fn) => f.breakpoints(fn);

  // diminishing returns, and seconds
  assert.equal(f.effectiveSpeed(0), 0);
  assert.equal(f.effectiveSpeed(20), 17); // 2400 / 140
  assert.equal(f.effectiveSpeed(200), 75);
  assert.equal(f.toSeconds(25), 1);
  assert.equal(f.playbackRate(1, 25), 1);
  assert.equal(f.playbackRate(1.2, 15), 2); // a 1.2 s clip squeezed into 0.6 s

  // FCR (maxroll): Sorceress, her Lightning and Chain Lightning sequence (no −1), and Paladin
  assert.deepEqual(bp((x) => f.castAnim('sor', x).frames), [[0, 13], [9, 12], [20, 11], [37, 10], [63, 9], [105, 8], [200, 7]]);
  assert.deepEqual(bp((x) => f.castAnim('sor', x).action), [[0, 7], [20, 6], [63, 5], [200, 4]]);
  assert.deepEqual(
    bp((x) => f.castAnim('sorceress', x, { lightning: true }).frames),
    [[0, 19], [7, 18], [15, 17], [23, 16], [35, 15], [52, 14], [78, 13], [117, 12], [194, 11]],
  );
  assert.equal(f.castAnim('sor', 50, { lightning: true }).action, undefined);
  assert.deepEqual(bp((x) => f.castAnim('pal', x).frames), [[0, 15], [9, 14], [18, 13], [30, 12], [48, 11], [75, 10], [125, 9]]);
  assert.deepEqual(bp((x) => f.castAnim('paladin', x).action), [[0, 9], [15, 8], [39, 7], [86, 6]]);
  // EFCR stops at 75 (Units.cpp:1521): no FCR beats 200's 7 frames
  assert.equal(f.castAnim('sor', 10000).frames, 7);
  assert.throws(() => f.castAnim('pal', 0, { lightning: true }));

  // FHR (maxroll): Sorceress; Paladin with spears and staves (192) and everything else
  assert.deepEqual(
    bp((x) => f.hitRecoveryFrames('sor', x)),
    [[0, 15], [5, 14], [9, 13], [14, 12], [20, 11], [30, 10], [42, 9], [60, 8], [86, 7], [142, 6], [280, 5]],
  );
  const palOther = [[0, 9], [7, 8], [15, 7], [27, 6], [48, 5], [86, 4], [200, 3]];
  for (const w of ['hth', '1hs', '1ht', '2hs', 'bow', 'xbw']) assert.deepEqual(bp((x) => f.hitRecoveryFrames('pal', x, w)), palOther, w);
  const palSpear = [[0, 13], [3, 12], [7, 11], [13, 10], [20, 9], [32, 8], [48, 7], [75, 6], [129, 5], [280, 4]];
  for (const w of ['2ht', 'stf']) assert.deepEqual(bp((x) => f.hitRecoveryFrames('pal', x, w)), palSpear, w);
  assert.deepEqual(bp((x) => f.hitRecoveryFrames('sor', x, 'stf')), bp((x) => f.hitRecoveryFrames('sor', x)));

  // FBR (maxroll): Sorceress, up to 86; 200 → 3 is the same rule (rate 50 + 75 = 125: 1280 / 320 − 1)
  assert.deepEqual(bp((x) => f.blockFrames('sor', x)), [[0, 9], [7, 8], [15, 7], [27, 6], [48, 5], [86, 4], [200, 3]]);
  // Paladin, and under Holy Shield (Units.cpp:1460-1467)
  assert.deepEqual(bp((x) => f.blockFrames('pal', x)), [[0, 5], [13, 4], [32, 3], [86, 2]]);
  assert.deepEqual(bp((x) => f.blockFrames('pal', x, true)), [[0, 2], [86, 1]]);

  // attacks: the Amazon Basin's attack cycle lengths with no IAS, from its FramesPerDirection less
  // D2MOO's start frame (Units.cpp:2676-2692), and 25 / frames attacks a second
  const cycle = {
    pal: { hth: 13, '1hs': 14, '2hs': 17, '1ht': 16, '2ht': 19, stf: 17, bow: 15, xbw: 19 },
    sor: { hth: 14, '1hs': 17, '2hs': 21, '1ht': 16, '2ht': 20, stf: 15, bow: 16, xbw: 19 },
  };
  for (const [cls, row] of Object.entries(cycle))
    for (const [w, n] of Object.entries(row)) assert.equal(f.attackAnim(cls, w).frames, n, `${cls} ${w}`);
  assert.equal((1 / f.toSeconds(f.attackAnim('pal', 'hth').frames)).toFixed(4), '1.9231');
  assert.throws(() => f.attackAnim('pal', 'ht1'));

  // the rate: 100 + EIAS + SIAS − WSM, 30 less in a sequence, held to 15–175 (Units.cpp:1362-1410)
  assert.equal(f.attackRate(), 100);
  assert.equal(f.attackRate({ ias: 20, skillIas: 30, wsm: -10 }), 157);
  assert.equal(f.attackRate({ sequence: true }), 70);
  assert.equal(f.attackRate({ ias: 1000, skillIas: 100 }), 175);
  assert.equal(f.attackRate({ wsm: 200 }), 15);
  // Paladin with a one-hand sword: 20 IAS is EIAS 17, speed 299: ceil(3840 / 299) − 1 = 12
  assert.equal(f.attackAnim('pal', '1hs', { ias: 20 }).frames, 12);
  // capped at 175 (speed 448): ceil(3840 / 448) − 1 = 8, the hit at ceil(1792 / 448) = 4
  assert.deepEqual(f.attackAnim('pal', '1hs', { ias: 1000, skillIas: 100 }), { frames: 8, action: 4 });
  // at the floor of 15 (speed 38): ceil(3840 / 38) − 1 = 101
  assert.equal(f.attackAnim('pal', '1hs', { wsm: 200 }).frames, 101);
  // Sorceress with a staff, WSM 10: rate 90, speed 230, 16 frames from frame 2: ceil(4096 / 230) − 1 = 17;
  // the hit on frame 11 is 9 frames in: ceil(2304 / 230) = 11
  assert.deepEqual(f.attackAnim('sor', 'stf', { wsm: 10 }), { frames: 17, action: 11 });
  // a normal attack ignores the sequence flag; animFrames takes the sequence rule
  assert.equal(f.attackAnim('pal', 'hth', { sequence: true }).frames, 13);
  assert.equal(f.animFrames(19, 256, true), 19);
  assert.equal(f.animFrames(19, 256), 18);
  // IAS breakpoints for a Paladin with a Phase Blade (1hs, WSM −30): rate 137, 150 and 167 are
  // speeds 350, 384 and 427, the least for 10, 9 and 8 frames; EIAS 7, 20 and 37 take IAS 8, 24, 54
  assert.deepEqual(bp((x) => f.attackAnim('pal', '1hs', { ias: x, wsm: -30 }).frames), [[0, 11], [8, 10], [24, 9], [54, 8]]);

  // weapon classes: two hands take 2handedwclass (D2Composit.cpp:343-353), no weapon is hand to hand
  assert.equal(f.weaponClass(), 'hth');
  assert.equal(f.weaponClass({ wclass: '1hs', wclass2: '2hs', twoHanded: true }), '2hs');
  assert.equal(f.weaponClass({ wclass: 'stf', twoHanded: true }), 'stf');
  assert.equal(f.weaponClass({ wclass: '1ht' }), '1ht');
  assert.equal(f.weaponClass({ wclass: 'xyz' }), 'hth');
  const { D2X_WEAPONS } = await load('/src/data/d2x/weapons.ts');
  for (const w of D2X_WEAPONS) {
    const c = f.weaponClass(w);
    if (c !== 'ht1') f.attackAnim('pal', c); // every weapon a Paladin can hold has an attack row
  }
};
