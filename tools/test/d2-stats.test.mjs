// Diablo II character formulas (src/game/d2/stats.ts): each case is worked out by hand from the
// D2MOO code the module cites, with CharStats values from src/data/d2x/classes.ts.
import assert from 'node:assert/strict';

export default async (load) => {
  const s = await load('/src/game/d2/stats.ts');
  const pal = s.charStats('paladin');
  const sor = s.charStats('sorceress');
  assert.equal(s.charStats('pal'), pal);
  assert.throws(() => s.charStats('xyz'));

  // starting attributes, and the vitals they give at level 1
  assert.deepEqual(s.startAttributes(pal), { str: 25, dex: 20, vit: 25, ene: 15 });
  assert.deepEqual(s.startAttributes(sor), { str: 10, dex: 25, vit: 10, ene: 35 });
  assert.equal(s.baseLife(pal, 1, 25), 55);
  assert.equal(s.baseLife(sor, 1, 10), 40);
  assert.equal(s.baseMana(pal, 1, 15), 15);
  assert.equal(s.baseMana(sor, 1, 35), 35);
  assert.equal(s.baseStamina(pal, 1, 25), 89);
  // growth: pal 2 life a level and 3 a vitality point; sor 1 life, 2 mana a level, 2 mana an energy point
  assert.equal(s.baseLife(pal, 10, 50), 55 + 2 * 9 + 3 * 25);
  assert.equal(s.baseLife(sor, 30, 10), 40 + 29);
  assert.equal(s.baseMana(sor, 30, 100), 35 + 2 * 29 + 2 * 65);
  assert.equal(s.baseMana(pal, 2, 15), 16.5);
  // quarter growth is kept: the assassin gets 1.75 mana an energy point, 1.25 stamina a level
  const ass = s.charStats('ass');
  assert.equal(s.baseMana(ass, 1, 26), 26.75);
  assert.equal(s.baseStamina(ass, 2, 20), 96.25);
  assert.deepEqual(s.levelUpPoints(pal, 3), { stat: 15, skill: 3 });

  // potions: the CharStats columns match D2MOO's hard-coded class shares
  const share = { ama: [150, 150], sor: [100, 200], nec: [100, 200], pal: [150, 150], bar: [200, 100], dru: [100, 200], ass: [150, 150] };
  for (const [code, [hp, mp]] of Object.entries(share)) {
    const cs = s.charStats(code);
    assert.equal(s.potionHeal(cs, 'life', 100), hp, `${code} life potion`);
    assert.equal(s.potionHeal(cs, 'mana', 100), mp, `${code} mana potion`);
  }
  assert.equal(s.potionDoubleChance(0), 0);
  assert.equal(s.potionDoubleChance(2), 0);
  assert.equal(s.potionDoubleChance(4), 2 / 400);
  // k = 0…24: floor(k / 2) sums to 144
  assert.equal(s.potionDoubleChance(25), 144 / 2500);
  assert.ok(s.potionDoubleChance(1000) < 1 && s.potionDoubleChance(1000) > s.potionDoubleChance(100));

  // mana regeneration in 256ths a frame: 100 mana → floor(25600 / 3000) = 8 a frame
  assert.equal(s.manaRegenPerSec(sor, 100), (8 * 25) / 256);
  assert.equal(s.manaRegenPerSec(sor, 100, 100), (16 * 25) / 256);
  assert.equal(s.manaRegenPerSec(sor, 5), 25 / 256);

  // movement: walk 6, run 9 (+50%), frw 20 → +17%, armor Speed 10 + 5 → −15%, at least 25%
  assert.equal(s.velocityPercent(pal), 100);
  assert.equal(s.moveVelocity(pal), 6);
  assert.equal(s.moveVelocity(pal, { running: true }), 9);
  assert.equal(s.velocityPercent(pal, { frw: 20 }), 117);
  assert.equal(s.velocityPercent(pal, { running: true, frw: 20 }), 167);
  assert.equal(s.velocityPercent(pal, { armorSpeed: 15 }), 85);
  assert.equal(s.velocityPercent(pal, { velocityPct: -200 }), 25);
  // run drain: RunDrain 20 → 40 256ths a frame; heavy body armor (Speed 10) doubles it
  assert.equal(s.runDrainPerSec(pal), 3.90625);
  assert.equal(s.runDrainPerSec(pal, { torsoSpeed: 5 }), 3.90625);
  assert.equal(s.runDrainPerSec(pal, { torsoSpeed: 10 }), 7.8125);
  assert.equal(s.runDrainPerSec(pal, { drainPct: 50 }), (20 * 25) / 256);
  assert.equal(s.runDrainPerSec(pal, { inTown: true }), 0);
  assert.equal(s.runDrainPerSec(ass), 2.9296875);
  // stamina back: 89 stamina is 22784 256ths, >> 8 = 89 a frame standing, >> 9 = 44 walking
  assert.equal(s.staminaRegenPerSec(89, 'stand', 0), (89 * 25) / 256);
  assert.equal(s.staminaRegenPerSec(89, 'walk', 10), (44 * 25) / 256);
  assert.equal(s.staminaRegenPerSec(89, 'walk', 0.5), 0, 'walking with under a point left out of town');
  assert.equal(s.staminaRegenPerSec(89, 'townWalk', 0), (44 * 25) / 256);
  assert.equal(s.staminaRegenPerSec(89, 'busy', 50), 0);
  assert.equal(s.staminaRegenPerSec(89, 'stand', 0, 50), ((89 + 44) * 25) / 256);
  assert.equal(s.staminaRegenPerSec(89, 'busy', 50, 1000), ((89 + 890) * 25) / 256, 'a stamina potion works running');

  // attack rating: 5 × (dex − 7) + ToHitFactor (pal +20, sor −15), then the % on all of it
  assert.equal(s.attackRating(pal, 20), 85);
  assert.equal(s.attackRating(sor, 25), 75);
  assert.equal(s.attackRating(pal, 20, 100, 50), 185 + 92);
  // defense: dex / 4 + armor, then %, then the override %; a negative total moves toward zero
  assert.equal(s.defense(20, 10), 15);
  assert.equal(s.defense(20, 10, 50), 22);
  assert.equal(s.defense(20, 10, 50, -50), 11);
  assert.equal(s.defense(0, -20, 50), -10);

  // chance to hit
  assert.equal(s.hitChance(100, 100, 1, 1), 50);
  assert.equal(s.hitChance(85, 6, 1, 1), 93); // factor floor(8500 / 91) = 93
  assert.equal(s.hitChance(1000, 0, 5, 5), 95);
  assert.equal(s.hitChance(0, 100, 5, 5), 5);
  assert.equal(s.hitChance(100, 100, 10, 30), 25);
  assert.equal(s.hitChance(100, 100, 30, 10), 75);
  assert.equal(s.hitChance(50, -50, 1, 1), 95);
  assert.equal(s.hitChance(0, 0, 1, 1), 95);

  // block: (BlockFactor + shield block) × (dex − 15) / (2 × level), at most 75, a third while running
  assert.equal(s.blockChance(pal, 25, 20, 1), 75);
  assert.equal(s.blockChance(pal, 25, 20, 10), 13); // 55 × 5 / 20 = 13.75
  assert.equal(s.blockChance(pal, 25, 20, 10, true), 4);
  assert.equal(s.blockChance(pal, 25, 20, 1, true), 25);
  assert.equal(s.blockChance(sor, 25, 115, 50), 45); // 45 × 100 / 100
  assert.equal(s.blockChance(pal, 25, 15, 1), 0);
  assert.equal(s.blockChance(pal, 25, 10, 1), 0);

  // resistances: the expansion penalty, caps and floor
  const r = (raw, o) => s.resistance('fire', raw, o);
  assert.equal(r(0, { diff: 'normal' }), 0);
  assert.equal(r(0, { diff: 'nightmare' }), -40);
  assert.equal(r(0, { diff: 'hell' }), -100);
  assert.equal(r(150, { diff: 'hell' }), 50);
  assert.equal(r(200, { diff: 'hell' }), 75);
  assert.equal(r(200, { diff: 'hell', maxBonus: 10 }), 85);
  assert.equal(r(200, { diff: 'hell', maxBonus: 30 }), 95);
  assert.equal(r(-200, { diff: 'normal' }), -100);
  assert.equal(r(-50, { diff: s.difficulty(2) }), -100);
  // physical reduction caps at 50, and neither it nor magic takes the penalty
  assert.equal(s.resistance('phys', 70, { diff: 'hell' }), 50);
  assert.equal(s.resistance('phys', 20, { diff: 'hell' }), 20);
  assert.equal(s.resistance('magic', 0, { diff: 'hell' }), 0);
  assert.equal(s.resistance('magic', 90, { diff: 'hell' }), 75);
  // pierce: off a hero always, off a monster only below immunity; monsters have no cap
  assert.equal(r(80, { pierce: 20, diff: 'normal' }), 60);
  assert.equal(r(120, { monster: true, pierce: 20 }), 120);
  assert.equal(r(50, { monster: true, pierce: 20 }), 30);
  assert.equal(r(-150, { monster: true }), -100);
  assert.equal(s.resistance('magic', 50, { monster: true, pierce: 20 }), 50);
  assert.deepEqual(s.heroResists({ fire: 80, cold: 30, phys: 60 }, { fire: 5 }, 'nightmare'), {
    phys: 50,
    magic: 0,
    fire: 40,
    light: -40,
    cold: -10,
    poison: -40,
  });

  // damage: flat reduction first, then the resistance; absorption after
  assert.equal(s.mitigate(100, 50), 50);
  assert.equal(s.mitigate(100, 50, 10), 45);
  assert.equal(s.mitigate(100, 120), 0);
  assert.equal(s.mitigate(100, -100), 200);
  assert.equal(s.mitigate(10, 0, 20), 0);
  assert.equal(s.FLAT_REDUCTION.fire, 'magic');
  assert.equal(s.FLAT_REDUCTION.poison, null);
  assert.deepEqual(s.absorb(100, 50), { dmg: 60, life: 40 });
  assert.deepEqual(s.absorb(100, 50, 10), { dmg: 50, life: 50 });
  assert.deepEqual(s.absorb(10, 0, 30), { dmg: 0, life: 10 });
};
