// Diablo II's monster AI (src/game/d2/monai.ts, src/game/ai.ts). The parts that need no game: each
// AI's parameters by difficulty as D2MOO reads them, the Fallen's fright and how long it lasts, the
// corpse a shaman raises, the walks D2's tactics make, the Brute's and the Smith's haste, the cursed
// unique's Amplify Damage and the aura-enchanted ones' auras, the lancer's longer reach, the leash's
// distance. Then in a game on the West overworld, the hero standing still in a clearing of Blood
// Moor: a Fallen pack runs off when one of it dies and comes back, a shaman raises its fallen once
// the corpse lies dead (no experience the second time) and never one cleared from the map, a lead
// passes on in D2's order, a hit with no get-hit is one to a quill rat's AI, a multiple-shots unique
// looses three quills, a cursed unique's landed blow doubles the hero's physical damage taken, a
// unique's minion walks back to it and no more once it is dead, a struck sleeper wakes its pack; with
// a hireling made here, a monster goes for the nearer of the two, neither in the camp nor 55 subtiles
// off, takes the other once its target is dead, and fights her with the hero in the camp; a
// sleeping fallen notices the hero behind a tree or a rock out there, in the Den of Evil only in sight.
import assert from 'node:assert/strict';

const DT = 1 / 60;

export default async (load) => {
  const A = await load('/src/game/d2/monai.ts');
  const { D2X_MONSTERS: D2X, D2X_MONSTER_AI } = await load('/src/data/d2x/monsters.ts');
  const { M_PER_SUBTILE, MPS_PER_VELOCITY } = await load('/src/game/d2/stats.ts');
  const { Monster } = await load('/src/game/monster.ts');
  const { meleeReach, shoot, monsterDied } = await load('/src/game/ai.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { debugOpts } = await load('/src/game/debug.ts');
  const { WILD_AREA, DEN_OF_EVIL } = await load('/src/world/areas.ts');
  const { monsterStrike, applyDamage } = await load('/src/game/combat.ts');
  const { emptyPacket } = await load('/src/game/actor.ts');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a}, not ${b}`);

  // ── the parameters, per difficulty, by D2MOO's names for them ──
  // fallen1 aip1–4 [30,10,50,20] / [40,15,60,25] / [50,20,70,30]: command, approach distance, attack, A1
  assert.deepEqual([0, 1, 2].map((d) => A.param(D2X.fallen1, d, 'Fallen', 'approachDist')), [10, 15, 20]);
  assert.deepEqual([0, 1, 2].map((d) => A.param(D2X.fallen1, d, 'Fallen', 'command')), [30, 40, 50]);
  // MonAI.txt calls the Fallen's aip2 a wander chance; D2MOO's code reads it as a distance (AiThink.cpp:595)
  assert.equal(A.paramName(D2X.fallen1, 1), 'Non-command Wander behavior (% Chance)');
  assert.deepEqual([0, 1, 2].map((d) => A.param(D2X.quillrat1, d, 'QuillRat', 'activate')), [10, 15, 20]);
  assert.deepEqual([0, 1, 2].map((d) => A.param(D2X.cr_lancer1, d, 'CorruptLancer', 'alwaysRun')), [15, 12, 10]);
  assert.deepEqual([0, 1, 2].map((d) => A.param(D2X.fallenshaman1, d, 'FallenShaman', 'raiseRange')), [24, 24, 26]);
  assert.equal(A.param(D2X.zombie1, 0, 'Zombie', 'aware'), 10);
  assert.equal(D2X_MONSTER_AI.Zombie[A.AIP.Zombie.aware], 'Enemy Awareness (Range)');
  // the AI delay (aidel 15/14/13) and the notice range (no aidist: 35 subtiles)
  assert.deepEqual([0, 1, 2].map((d) => A.aiDelay(D2X.fallen1, d)), [15, 14, 13]);
  assert.equal(A.noticeRange(D2X.zombie1, 0), 35);
  assert.deepEqual([40, 30, 26, 24, 5].map(A.idleWithoutTarget), [25, 20, 16, 10, 10]);

  // ── the Fallen's fright: a corpse still dying within 15 subtiles, not one lying dead, not one farther ──
  const dying = (x, t) => ({ pos: { x, z: 0 }, dead: true, deathTime: t });
  const fallen = { pos: { x: 0, z: 0 }, dead: false, deathTime: 0 };
  const r15 = 15 * M_PER_SUBTILE;
  assert.ok(A.frightened(fallen, [dying(r15 - 0.05, 0.2)]), 'a death 14.9 subtiles off frightens it');
  assert.ok(!A.frightened(fallen, [dying(r15 + 0.05, 0.2)]), 'one 15.1 off does not');
  assert.ok(A.frightened(fallen, [dying(1, A.frames(A.DEATH_FRAMES) - 0.01)]), 'nor until it lies dead');
  assert.ok(!A.frightened(fallen, [dying(1, A.frames(A.DEATH_FRAMES))]), 'lying dead it frightens no more');
  assert.ok(!A.frightened(fallen, [{ ...dying(1, 0.1), dead: false }]), 'a living one is nothing');
  near(A.frames(A.DEATH_FRAMES), 1.76, 'the dying time');

  // ── the corpse a shaman raises ──
  const shaman = { pos: { x: 0, z: 0 }, rank: 'normal' };
  const c = (id, o = {}) => ({ id, pos: { x: o.x ?? 1, z: 0 }, dead: true, deathTime: o.t ?? 3, rank: o.rank ?? 'normal', kind: o.kind ?? 'fallen', spent: !!o.spent, owner: 'owner' in o ? o.owner : shaman });
  // a plain one: its own minions, the first spawned that lies dead, however far
  assert.equal(A.raiseTarget(shaman, 24, [c(1, { t: 0.5 }), c(2, { x: 90 }), c(3)], [])?.id, 2);
  assert.equal(A.raiseTarget(shaman, 24, [c(1, { spent: true }), c(2, { t: 1 })], []), null, 'none spent or still dying');
  // none left masterless by its death: raised again, it raises none of its old list
  assert.equal(A.raiseTarget(shaman, 24, [c(1, { owner: null }), c(2, { owner: null })], []), null, 'a masterless fallen raised');
  // a unique: any Fallen or Fallen Shaman lying dead within aip4, no champion or unique, the last one found
  const bishi = { pos: { x: 0, z: 0 }, rank: 'unique' };
  const round = [c(1), c(2, { kind: 'zombie' }), c(3, { rank: 'champion' }), c(4, { kind: 'fallenshaman' }), c(5, { x: 24 * M_PER_SUBTILE + 0.1 })];
  assert.equal(A.raiseTarget(bishi, 24, [], round)?.id, 4);
  assert.equal(A.raiseTarget(bishi, 24, [], round.slice(0, 3))?.id, 1);

  // ── D2's walks: close by (WalkCloseToUnit), away (Escape) ──
  let seq = [0.99, 0.3, 0.7, 0.2];
  const rnd = () => seq.shift();
  // n along one axis, under n along the other: 4 and ⌊0.99 × 4⌋ = 3, the axes swapped, z's turned
  const w = A.wanderPoint({ x: 0, z: 0 }, 4, rnd);
  near(w.x, 3 * M_PER_SUBTILE, 'a wander, x');
  near(w.z, -4 * M_PER_SUBTILE, 'a wander, z');
  const e = A.escapePoint({ x: 1, z: 1 }, { x: 2, z: 0 }, 12);
  near(e.x, 1 - 12 * M_PER_SUBTILE, 'escape x');
  near(e.z, 1 + 12 * M_PER_SUBTILE, 'escape z');
  seq = [];

  // ── the Brute's and the Smith's haste as they are hurt ──
  assert.deepEqual([100, 80, 40, 10].map(A.bruteHaste), [0, 20, 60, 60]);
  assert.deepEqual([100, 40, 0].map(A.smithHaste), [0, 30, 50]);

  // ── a cursed unique's Amplify Damage: level 5 → skill level 2, 4 subtiles, 275 frames, −100 % ──
  const amp = A.amplifyCurse(5);
  assert.deepEqual([amp.lvl, amp.res], [2, 100]);
  near(amp.radius, 4 * M_PER_SUBTILE, 'its reach');
  near(amp.seconds, 11, 'its length');

  // ── aura enchanted: a level-4 unique has six auras to draw from (Holy Shock from 20), each at level 1 ──
  const picks = [];
  for (let i = 0; i < 6; i++) picks.push(A.auraEnchant(4, (n) => (assert.equal(n, 6), i)));
  assert.deepEqual(picks.map((a) => a.skill), ['Might', 'Holy Fire', 'Blessed Aim', 'Holy Freeze', 'Conviction', 'Fanaticism']);
  assert.ok(picks.every((a) => a.lvl === 1));
  assert.equal(A.auraEnchant(67, (n) => n - 1).skill, 'Holy Shock');
  assert.equal(A.auraEnchant(67, (n) => n - 1).lvl, 8);
  // Might 1: 16 subtiles, +40 % damage; Conviction 1: −30 % resistances, dm56 −(40 + 60 × (110 / 7 = 15) / 100) = −49 %
  // defense. dmXY is D2Common_11033 (monai.ts dm, the one skillcalc reads too): the inner quotient truncated first
  const might = A.auraNumbers('Might', 1);
  near(might.radius, 16 * M_PER_SUBTILE, 'Might reach');
  assert.equal(might.dmgPct, 40);
  const conv = A.auraNumbers('Conviction', 1);
  assert.deepEqual([conv.res, conv.def], [30, 49]);
  assert.deepEqual(A.auraNumbers('Holy Freeze', 1).slow, 25 + Math.trunc((35 * Math.trunc(110 / 7)) / 100));
  // Fanaticism 3, dm34 10 → 40: 10 + 30 × (330 / 9 = 36) / 100 = 20 attack rate %; SkillCalc.txt's description, truncated once, reads 21
  assert.equal(A.auraNumbers('Fanaticism', 3).ratePct, 20);

  // ── reach: the spearmaiden's MeleeRng 2 is two of D2's unit distance, a subtile past the huntmaiden's ──
  const lancer = new Monster('cr_lancer1', 2, 'normal', { x: 0, z: 0 });
  const hunter = new Monster('corruptrogue1', 2, 'normal', { x: 0, z: 0 });
  near(meleeReach(lancer) - meleeReach(hunter), 1 * M_PER_SUBTILE, "the lancer's reach");

  // ── D2's steps: a walk at the hero ends steps − 1 of D2's unit distance off (half a subtile each), right at them for none or 20 on ──
  near(A.stepStop(3), 1 * M_PER_SUBTILE, 'RunToTargetUnitWithSteps(3)');
  near(A.stepStop(12), 5.5 * M_PER_SUBTILE, "the archer's walk to its aip8");
  assert.deepEqual([0, 1, 20, 25].map(A.stepStop), [0, 0, 0, 0]);

  // ── the leash's distance: D2's less the minion's size along each axis, octagonal, whole subtiles (AiUtil.cpp:47-67) ──
  const st = (x, z) => ({ x: x * M_PER_SUBTILE, z: z * M_PER_SUBTILE });
  const o0 = st(0.5, 0.5);
  // 25 and 0 subtiles off, size 2: 23 and 2, the longer and half the shorter, 24
  assert.equal(A.sizedDistance(st(25.5, 0.5), o0, 2), 24);
  assert.equal(A.sizedDistance(st(21.5, 10.5), o0, 2), 23);
  assert.deepEqual([20.5, 21.5, 22.5].map((x) => A.pastLeash(st(x, 0.5), o0, 2)), [false, false, true]);

  // ── in a game: a clearing in Blood Moor, the hero standing still ──
  localStorage.clear();
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
  game.hooks = { message() {}, openPanel() {}, levelChanged() {}, areaChanged() {}, teleported() {}, playerDied() {}, inventoryChanged() {}, getCursorItem: () => null, setCursorItem() {}, hoveredGroundId: () => null, levelUp() {} };
  game.newGame('怪物智能测试', 'paladin');
  // the hero kept alive while they fight it; the tests after this one share the module
  const god = debugOpts.god;
  debugOpts.god = true;
  try {
    const L = game.level;
    const p = game.player;
    const map = L.monsterMap;
    let spot = null;
    for (let z = 4; z < map.h - 4 && !spot; z += 2) {
      for (let x = 4; x < map.w - 4; x += 2) {
        if (L.areaAt(x, z).id === WILD_AREA && map.circleClear(x, z, 4.5) && map.circleClear(x + 3, z, 3) && map.circleClear(x - 3, z, 3)) {
          spot = { x, z };
          break;
        }
      }
    }
    assert.ok(spot, 'no clearing in Blood Moor');
    const clear = () => {
      L.monsters = L.monsters.filter((m) => dist(m.pos, spot) > 45);
      L.projectiles = [];
      L.deaths.length = 0;
      game.teleportWithin(spot);
      p.intent = null;
      p.path = null;
      p.ampTime = 0;
    };
    const place = (id, at, rank = 'normal', mods = []) => {
      const m = new Monster(id, D2X[id].diff[0].level, rank, at, mods);
      L.monsters = [...L.monsters, m];
      return m;
    };
    const run = (secs, each) => {
      for (let k = 0; k < secs / DT; k++) {
        p.intent = null;
        game.update(DT);
        if (each?.(k * DT) === true) return k * DT;
      }
      return null;
    };
    const at = (dx, dz) => ({ x: spot.x + dx, z: spot.z + dz });
    /** every tile a disc of radius r round c touches is one monsters walk on (the clearing's edges alone are looked at) */
    const openAt = (c, r) => {
      for (let z = Math.floor(c.z - r); z <= Math.floor(c.z + r); z++) {
        for (let x = Math.floor(c.x - r); x <= Math.floor(c.x + r); x++) {
          const nx = Math.max(x, Math.min(c.x, x + 1));
          const nz = Math.max(z, Math.min(c.z, z + 1));
          if ((nx - c.x) ** 2 + (nz - c.z) ** 2 < r * r && !map.walkable(x, z)) return false;
        }
      }
      return true;
    };
    /** open ground `r0`–`r1` m from the hero, as near `r0` as there is */
    const offHero = (r0, r1) => {
      for (let r = r0; r <= r1; r += 0.1) {
        for (let k = 0; k < 24; k++) {
          const q = { x: p.pos.x + Math.sin((k / 24) * Math.PI * 2) * r, z: p.pos.z + Math.cos((k / 24) * Math.PI * 2) * r };
          if (openAt(q, 0.6)) return q;
        }
      }
      return null;
    };

    // a Fallen pack, 3 m off: one dies, the rest run from the hero, then come back and strike
    clear();
    const pack = [];
    const lead = place('fallen1', at(3, 0));
    const party = [place('fallen1', at(3.6, 0.8)), place('fallen1', at(3.6, -0.8)), place('fallen1', at(4.2, 0))];
    for (const m of [lead, ...party]) (m.pack = pack), pack.push(m), (m.awake = true);
    for (const f of party) f.follow(lead);
    run(0.5);
    const victim = party[0];
    game.killMonster(victim, 'phys');
    const rest = [lead, party[1], party[2]];
    const d0 = rest.map((m) => dist(m.pos, p.pos));
    const far = rest.map((m, i) => d0[i]);
    let fled = 0;
    run(2.5, () => {
      rest.forEach((m, i) => (far[i] = Math.max(far[i], dist(m.pos, p.pos))));
    });
    for (let i = 0; i < rest.length; i++) if (far[i] > d0[i] + 1) fled++;
    assert.ok(fled >= 2, `only ${fled} of 3 fallen ran when one died: ${d0.map((d, i) => `${d.toFixed(1)} → ${far[i].toFixed(1)}`).join(', ')}`);
    assert.ok(rest.some((m) => m.aiFlag === 1), 'none keeps its fright for the next blow');
    // they stay off while the hero keeps away (none walks at a hero beyond its aip2, nor does the
    // leader cry them on beyond 15 subtiles); the hero comes up to the leader, within its aip2 and
    // its cry's reach: back it comes and strikes, its first blow needing no attack roll, and its
    // cry brings the rest
    const lp = lead.pos;
    const dl = Math.max(1e-6, dist(lp, p.pos));
    const toward = { x: lp.x + ((p.pos.x - lp.x) * 1.4) / dl, z: lp.z + ((p.pos.z - lp.z) * 1.4) / dl };
    game.teleportWithin(L.map.nearestWalkable(toward.x, toward.z, 1) ?? toward);
    assert.ok(dist(lp, p.pos) < A.param(D2X.fallen1, 0, 'Fallen', 'approachDist') * M_PER_SUBTILE, `the hero ${dist(lp, p.pos).toFixed(1)} m from the leader`);
    const back = run(12, () => rest.some((m) => m.state === 'attack'));
    assert.ok(back !== null, `the fallen never came back to strike: ${rest.map((m) => `${dist(m.pos, p.pos).toFixed(1)} ${m.state}`).join(', ')}`);
    const fleeLog = `${fled}/3 ran (${d0.map((d, i) => `${d.toFixed(1)}→${far[i].toFixed(1)} m`).join(', ')}), back and striking ${back.toFixed(1)} s after the hero came on`;

    // a shaman with its fallen, 4 m off: one killed is raised once it lies dead, and gives no experience again
    clear();
    const sh = place('fallenshaman1', at(4, 0));
    const fs = [place('fallen1', at(3.2, 0.9)), place('fallen1', at(3.2, -0.9))];
    const pk2 = [sh, ...fs];
    for (const m of pk2) (m.pack = pk2), (m.awake = true);
    for (const f of fs) f.follow(sh);
    run(0.3);
    // the hero far enough that the fallen don't bunch over the corpse
    game.teleportWithin(at(-1.5, 0));
    game.killMonster(fs[0], 'phys');
    const killedAt = game.time;
    let raisedAt = null;
    let deathAtRaise = 0;
    // a raise is a roll each time it thinks, and a fallen standing over the corpse puts it off: room for a long wait
    run(20, () => {
      if (!fs[0].dead) {
        raisedAt = game.time - killedAt;
        return true;
      }
      deathAtRaise = fs[0].deathTime;
      return false;
    });
    assert.ok(raisedAt !== null, `the shaman never raised its fallen (it is ${sh.state}, ${dist(sh.pos, p.pos).toFixed(1)} m off)`);
    assert.ok(deathAtRaise >= A.frames(A.DEATH_FRAMES) - DT, `raised while still dying, ${deathAtRaise.toFixed(2)} s in`);
    assert.ok(fs[0].noXp && fs[0].life === fs[0].maxLife, 'raised: all its life, no experience');
    const xp0 = p.xp;
    game.killMonster(fs[0], 'phys');
    assert.equal(p.xp, xp0, 'a raised fallen gave experience');
    // a fallen killed by cold is shattered: never raised
    game.killMonster(fs[1], 'cold');
    run(8);
    assert.ok(fs[1].dead, 'a shattered fallen got up');
    // one cleared from the map (40 s dead) leaves its shaman's list: never raised from nowhere
    const gone = place('fallen1', at(3.4, 0.3));
    gone.follow(sh);
    game.killMonster(gone, 'phys');
    run(0.5);
    gone.deathTime = 41;
    // the cleanup's 1-in-50 roll made to come up this step
    const rnd0 = Math.random;
    Math.random = () => 0;
    try {
      game.update(DT);
    } finally {
      Math.random = rnd0;
    }
    assert.ok(!L.monsters.includes(gone) && !sh.minions.includes(gone), "a cleared corpse is still on the map or its shaman's list");
    run(6);
    assert.ok(gone.dead && !L.monsters.includes(gone), 'a cleared corpse got up');

    // the lead passes on: a party's leader dies, its newest minion leads the rest (BossXfer)
    clear();
    const l2 = place('fallen1', at(9, 0));
    const ms = [place('fallen1', at(9.5, 0.5)), place('fallen1', at(9.5, -0.5))];
    for (const f of ms) f.follow(l2);
    l2.dead = true;
    monsterDied(game, l2);
    assert.ok(ms[1].leads && ms[0].leader === ms[1] && l2.leader === ms[1] && !l2.leads, 'the newest minion took the lead');
    // lying dead it still takes it, the first of D2's list still there (AiGeneral.cpp:583-620)
    const l3 = place('fallen1', at(9, 2));
    const ms3 = [place('fallen1', at(9.5, 2.5)), place('fallen1', at(9.5, 1.5))];
    for (const f of ms3) f.follow(l3);
    game.killMonster(ms3[1], 'phys');
    game.killMonster(l3, 'phys');
    assert.ok(ms3[1].leads && ms3[0].leader === ms3[1] && l3.leader === ms3[1], 'a dead newest minion took the lead');
    // in D2's order (AiGeneral.cpp:599-621): the dead leader at the head of the new one's list, then the
    // rest one by one at its head, so when that one dies too the lead goes to the first spawned, alive,
    // not to the first leader's corpse
    const l4 = place('fallen1', at(9, -2));
    const ms4 = [-0.5, 0, 0.5].map((dz) => place('fallen1', at(9.5, -2 + dz)));
    for (const f of ms4) f.follow(l4);
    game.killMonster(l4, 'phys');
    assert.deepEqual(ms4[2].minions, [l4, ms4[1], ms4[0]], "the new leader's list, its head last");
    game.killMonster(ms4[2], 'phys');
    const lead4 = [l4, ...ms4].find((m) => m.leads);
    assert.ok(lead4 === ms4[0] && [l4, ms4[1], ms4[2]].every((m) => m.leader === ms4[0]), `the lead went to ${lead4 === l4 ? "the first leader's corpse" : `minion ${ms4.indexOf(lead4)}`}`);
    assert.deepEqual(ms4[0].minions, [ms4[2], ms4[1], l4], "the third leader's list");

    // a shaman's death leaves its fallen masterless: raised by another, it raises none of them,
    // though its cry still reaches its old list (AIGENERAL_AllocCommandsForMinions)
    clear();
    const sh2 = place('fallenshaman1', at(4, 0));
    const fs2 = [place('fallen1', at(3.2, 0.9)), place('fallen1', at(3.2, -0.9))];
    for (const f of fs2) f.follow(sh2);
    game.killMonster(fs2[0], 'phys');
    game.killMonster(sh2, 'phys');
    assert.ok(fs2.every((f) => f.leader === null), 'its fallen still answer to a dead shaman');
    run(2.5);
    // got up as a raise has it (ai.ts raise)
    sh2.dead = false;
    sh2.life = sh2.maxLife;
    sh2.deathTime = 0;
    sh2.awake = true;
    sh2.setState('idle');
    sh2.thinkTimer = 0;
    assert.equal(sh2.minions.length, 2, 'its list');
    run(8);
    assert.ok(fs2[0].dead, 'a shaman raised again raised a fallen it no longer owns');

    // a get-hit stays its AI state through a stand: a unique quill rat hit as it first sees the
    // hero stops to roar (20 frames), and then, 4 m off past its aip1, shoots back rather than wander
    clear();
    const hitRat = place('quillrat1', at(4, 0), 'unique');
    hitRat.awake = true;
    hitRat.setState('hit', 0.28);
    run(0.4);
    assert.ok(hitRat.wasHit && hitRat.state === 'idle', `after its get-hit: ${hitRat.state}`);
    run(3, () => hitRat.state !== 'idle');
    assert.ok(hitRat.taunted && hitRat.state === 'cast', `after its roar it ${hitRat.state === 'move' ? 'wandered' : hitRat.state}`);

    // a hit with no get-hit is a hit to its AI all the same (AI state 19, SUnitDmg.cpp:2117-2143): a
    // quill rat 4 m off struck lightly shoots back rather than wander, and again after that shot (19
    // is a get-hit's 3 after its next mode, MonsterMode.cpp:1796-1812), then wanders
    clear();
    const ratAt = offHero(3.9, 4.4);
    assert.ok(ratAt, 'no open ground 4 m from the hero');
    const softRat = place('quillrat1', ratAt);
    softRat.awake = true;
    softRat.maxLife = softRat.life = 1000;
    const tap = emptyPacket();
    tap.phys = 1;
    tap.source = p;
    applyDamage(game, softRat, tap, p.pos);
    assert.ok(softRat.state !== 'hit' && softRat.wasHit && softRat.hitHeld, `a light hit: ${softRat.state}, hit ${softRat.wasHit}, held ${softRat.hitHeld}`);
    const ratActs = [];
    let ratWas = softRat.state;
    let afterShot = null;
    run(10, () => {
      if (softRat.state === ratWas) return false;
      ratWas = softRat.state;
      if (ratWas !== 'idle') ratActs.push(ratWas);
      else if (ratActs.length === 1 && !afterShot) afterShot = `hit ${softRat.wasHit}, held ${softRat.hitHeld}`;
      return ratActs.length >= 3;
    });
    assert.deepEqual(ratActs, ['cast', 'cast', 'move'], 'struck lightly, the quill rat');
    assert.equal(afterShot, 'hit true, held false', 'after its first shot');

    // multiple shots: a unique quill rat looses three, its minion one
    clear();
    const rat = place('quillrat1', at(3, 0), 'unique', [29]);
    shoot(game, rat, 'spike1', 1, 'a2', p.pos);
    assert.equal(L.projectiles.filter((x) => x.owner === rat).length, 3, 'a multiple-shots unique looses three');
    const minion = place('quillrat1', at(3, 1), 'minion', [29]);
    shoot(game, minion, 'spike1', 1, 'a2', p.pos);
    assert.equal(L.projectiles.filter((x) => x.owner === minion).length, 1, 'its minion one');
    const spike = L.projectiles.find((x) => x.owner === minion);
    near(Math.hypot(spike.vel.x, spike.vel.z), (11 * 75 * MPS_PER_VELOCITY) / 100, "a spike's speed");

    // cursed: a landed blow curses three times in four; under it physical damage is doubled
    clear();
    // 4 subtiles off the hero where they stand (teleportWithin puts them on a tile's middle), well
    // inside the curse's 3 subtiles' reach past the two bodies' edges
    const curser = place('fallen1', { x: p.pos.x + A.subtiles(4), z: p.pos.z }, 'unique', [7]);
    let cursed = 0;
    let lasts = 0;
    for (let i = 0; i < 200; i++) {
      p.ampTime = 0;
      const pk = emptyPacket();
      pk.spell = true;
      if (monsterStrike(game, curser, p, pk, true) && p.ampTime > 0) cursed++;
      lasts = Math.max(lasts, p.ampTime);
    }
    assert.ok(cursed > 120 && cursed < 180, `cursed ${cursed} times in 200`);
    // the unique fallen1 is level 4: Amplify Damage level 1, 200 frames
    near(lasts, A.amplifyCurse(curser.level).seconds, 'the curse lasts');
    near(lasts, 8, 'the curse lasts');
    const hit = (amped) => {
      p.ampTime = amped ? 5 : 0;
      p.ampRes = 100;
      p.life = p.stats.maxLife;
      const pk = emptyPacket();
      pk.phys = 10;
      return applyDamage(game, p, pk);
    };
    const plain = hit(false);
    near(hit(true), (plain * (100 - (p.stats.dr - 100))) / (100 - p.stats.dr), 'amplified damage');
    p.ampTime = 0;

    // the leash (D2GAME_AICORE_MinionLeash): a unique's minion 8 m (24 subtiles) off it walks back to
    // within 20 subtiles of it as it next thinks, the hero too far off to be noticed; a champion's
    // party's minion as far off stays where it is, and so does the unique's once it is dead, its
    // minions then owned by none (AIGENERAL_UpdateMinionList, AiGeneral.cpp:574-580)
    const unseen = A.subtiles(A.noticeRange(D2X.fallen1, 0)) + 0.5;
    const size = D2X.fallen1.size[0];
    // on open ground 12 m across, as the clearing above may not be
    let wide = null;
    for (let z = 8; z < map.h - 8 && !wide; z += 2) {
      for (let x = 8; x < map.w - 8; x += 2) {
        if (L.areaAt(x, z).id === WILD_AREA && openAt({ x, z }, 6)) {
          wide = { x, z };
          break;
        }
      }
    }
    assert.ok(wide, 'no open ground 12 m across in Blood Moor');
    const w = (dx, dz) => ({ x: wide.x + dx, z: wide.z + dz });
    /** the hero where none of `ms` notices them, nor the first, the leader, anything round it; still near enough that they act */
    const heroAway = (ms) => {
      const ok = () => ms.every((m, i) => dist(m.pos, p.pos) > unseen + (i ? 0 : A.subtiles(A.LEASH_WANDER * 1.5)) && dist(m.pos, p.pos) < 28);
      for (let r = 14; r <= 26; r++) {
        for (let k = 0; k < 24; k++) {
          const q = w(Math.sin((k / 24) * Math.PI * 2) * r, Math.cos((k / 24) * Math.PI * 2) * r);
          if (L.areaAt(q.x, q.z).id !== WILD_AREA || !openAt(q, 0.6)) continue;
          game.teleportWithin(q);
          p.intent = null;
          p.path = null;
          if (ok()) return true;
        }
      }
      return false;
    };
    /** a minion of `rank`'s 4.8 m one way from the open ground's middle, its leader 3.5 m the other, past the leash; the hero away */
    const farPair = (rank) => {
      clear();
      L.monsters = L.monsters.filter((m) => dist(m.pos, wide) > 45);
      const boss = place('fallen1', w(-3.2, -1.4), rank);
      const mm = place('fallen1', w(4.8, 0.5), 'minion');
      mm.follow(boss);
      if (rank === 'unique') mm.leashTo = boss;
      assert.ok(heroAway([boss, mm]), 'no ground for the hero away from the leash test');
      assert.ok(A.pastLeash(mm.pos, boss.pos, size), 'not past the leash');
      return [boss, mm];
    };
    const [, loose] = farPair('champion');
    const loose0 = { ...loose.pos };
    run(3);
    assert.ok(dist(loose.pos, loose0) < 0.3, `a champion's minion walked ${dist(loose.pos, loose0).toFixed(1)} m`);
    // as it next thinks, a walk to a spot 19 subtiles off its unique along one of D2's axes: its rolls
    // made 0.5, (19, 9) subtiles off, 20 by D2's distance, within the leash (and on the open ground)
    const [uq, tied] = farPair('unique');
    tied.thinkTimer = 0;
    uq.thinkTimer = 10;
    game.hitstop = 0;
    const rnd1 = Math.random;
    Math.random = () => 0.5;
    try {
      game.update(DT);
    } finally {
      Math.random = rnd1;
    }
    const goal = tied.move?.to;
    const spot19 = { x: uq.pos.x + A.subtiles(19), z: uq.pos.z + A.subtiles(9) };
    assert.ok(goal && dist(goal, spot19) < 1e-6, `its walk: ${goal ? `${A.inSubtiles(goal.x - uq.pos.x).toFixed(1)}, ${A.inSubtiles(goal.z - uq.pos.z).toFixed(1)} subtiles off its unique` : tied.state}`);
    assert.ok(!A.pastLeash(spot19, uq.pos, size), 'its spot is past the leash');
    const leashed = run(6, () => !A.pastLeash(tied.pos, uq.pos, size));
    assert.ok(leashed !== null, `a unique's minion stayed ${A.sizedDistance(tied.pos, uq.pos, size)} subtiles off it (${tied.state})`);
    const [uq2, tied2] = farPair('unique');
    game.killMonster(uq2, 'phys');
    assert.ok(tied2.leader === null && uq2.minions.includes(tied2), "a unique's minion still answers to it dead");
    const tied0 = { ...tied2.pos };
    run(3);
    assert.ok(tied2.leashTo === null && dist(tied2.pos, tied0) < 0.3, `a dead unique's minion walked ${dist(tied2.pos, tied0).toFixed(1)} m back to it`);
    const leashLog = `a unique's minion back within its leash ${leashed.toFixed(1)} s on`;

    // struck before it noticed the hero, a monster notices them as seeing them has it: its pack with
    // it, and a boss says so
    clear();
    const sleepers = [place('fallen1', at(3, 0)), place('fallen1', at(3.5, 0.6)), place('fallen1', at(3.5, -0.6))];
    for (const m of sleepers) {
      m.pack = sleepers;
      m.maxLife = m.life = 1000;
    }
    const said = [];
    const message0 = game.hooks.message;
    const boss0 = L.boss;
    game.hooks.message = (t) => said.push(t);
    L.boss = sleepers[0];
    try {
      applyDamage(game, sleepers[0], { ...tap }, p.pos);
    } finally {
      game.hooks.message = message0;
      L.boss = boss0;
    }
    assert.ok(sleepers.every((m) => m.awake), `struck, a sleeper woke ${sleepers.filter((m) => m.awake).length - 1} of its pack of 3`);
    assert.ok(said.some((t) => t.includes('被惊醒了')), 'a boss struck awake said nothing');

    // the hero's side (docs/M2A-STEP0.md 2.2), a hireling made here: a monster goes for the nearer
    // of the two; one in the camp, or 55 subtiles or more off, isn't a target; its target dead, it
    // takes the other; the hero in the camp, it fights her out in the field, she being near it
    let sides = '';
    {
      const { Merc } = await load('/src/game/merc.ts');
      const { friendlyTarget } = await load('/src/game/ai.ts');
      clear();
      // along a line from where the hero stands
      const off = (dx) => ({ x: p.pos.x + dx, z: p.pos.z });
      const merc = new Merc(off(2));
      merc.life = merc.maxLife = 1e6;
      // level 1 with no defense: a level 2 skeleton lands 95 % of its blows (hitChance's cap), so a few always land
      merc.level = 1;
      game.merc = merc;
      try {
        const sk = place('skeleton1', off(4));
        assert.equal(friendlyTarget(game, sk), merc, 'she 2 m off, the hero 4: not her');
        merc.pos = off(9);
        assert.equal(friendlyTarget(game, sk), p, 'she 5 m off, the hero 4: not the hero');
        // 55 subtiles from where it stands, the hero just within, then just past; she past it
        const R = 55 * M_PER_SUBTILE;
        merc.pos = off(-0.5);
        assert.equal(friendlyTarget(game, sk, off(R - 0.2)), p, 'the hero just within 55 subtiles: not the target');
        assert.equal(friendlyTarget(game, sk, off(R + 0.3)), null, 'both 55 subtiles or more off: a target all the same');
        // she in the camp, right by it: not her
        const camp = L.layout.start;
        assert.ok(L.inTown(camp));
        merc.pos = { ...camp };
        assert.notEqual(friendlyTarget(game, sk, camp), merc, 'she in the camp: a target all the same');
        // the hero in the camp, she out by it: it goes for her and strikes her (it is run though the hero is far off)
        game.teleportWithin(camp);
        merc.pos = at(2.2, 0);
        merc.prevPos = { ...merc.pos };
        sk.awake = true;
        assert.equal(friendlyTarget(game, sk), merc);
        const struck = run(12, () => merc.life < merc.maxLife);
        assert.ok(struck !== null && sk.target === merc, `the hero in the camp, she ${dist(merc.pos, sk.pos).toFixed(1)} m off: never struck (its target ${sk.target === merc ? 'her' : sk.target === p ? 'the hero' : 'none'}, ${sk.state})`);
        // back by her, the hero farther: her; she dies: the hero
        clear();
        merc.life = merc.maxLife;
        merc.pos = at(2, 0);
        merc.prevPos = { ...merc.pos };
        const sk2 = place('skeleton1', at(3.6, 0));
        sk2.awake = true;
        assert.ok(run(3, () => sk2.target === merc) !== null, 'it never went for her, the nearer');
        merc.dead = true;
        const switched = run(3, () => sk2.target === p);
        assert.ok(switched !== null, `she dead, it never took the hero: its target ${sk2.target === merc ? 'her still' : 'none'}`);
        sides = `the nearer of two, none in the camp or 55 subtiles off, the hireling struck ${struck.toFixed(1)} s in with the hero in the camp, the hero taken ${switched.toFixed(1)} s after she fell`;
      } finally {
        game.merc = null;
        clear();
      }
    }

    // noticing: a sleeping fallen within its notice range, the hero out of its sight or in it
    /** a spot 9–32 subtiles from `h` (inside the fallen's notice range of 35) in area `id`, clear, in the sight of it or out of it */
    const ringSpot = (Lv, id, h, inside) => {
      const m = Lv.monsterMap;
      for (let r = A.subtiles(9); r <= A.subtiles(32); r += A.subtiles(2.25)) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const q = { x: h.x + Math.sin(a) * r, z: h.z + Math.cos(a) * r };
          if (Lv.areaAt(q.x, q.z).id === id && m.circleClear(q.x, q.z, 0.5) && Lv.map.los(q, h) === inside) return q;
        }
      }
      return null;
    };
    /** the hero set where a spot of area `id` within notice range is out of their sight, the monsters round cleared away; that spot */
    const behindCover = (Lv, id) => {
      const m = Lv.monsterMap;
      for (let z = 4; z < m.h - 4; z += 3) {
        for (let x = 4; x < m.w - 4; x += 3) {
          if (Lv.areaAt(x, z).id !== id || !m.circleClear(x, z, 0.6)) continue;
          game.teleportWithin({ x, z });
          p.intent = null;
          p.path = null;
          if (Lv.areaAt(p.pos.x, p.pos.z).id !== id) continue;
          const q = ringSpot(Lv, id, p.pos, false);
          if (!q) continue;
          Lv.monsters = Lv.monsters.filter((o) => dist(o.pos, p.pos) > 40);
          Lv.projectiles = [];
          return q;
        }
      }
      return null;
    };
    /** a sleeping fallen at `q` on the map the hero is on */
    const sleeper = (q) => {
      const m = new Monster('fallen1', D2X.fallen1.diff[0].level, 'normal', q, []);
      game.level.monsters = [...game.level.monsters, m];
      return m;
    };
    // Blood Moor's rooms are LOS-drawn: D2 looks for no sight there (AiUtil.cpp:684-704)
    const behind = behindCover(L, WILD_AREA);
    assert.ok(behind, "no spot in Blood Moor out of the hero's sight");
    const moorSleeper = sleeper(behind);
    const moorD = dist(behind, p.pos);
    run(1.5);
    assert.ok(moorSleeper.awake, `a fallen ${moorD.toFixed(1)} m off behind cover in Blood Moor never noticed the hero`);
    // the Den of Evil's aren't: out of sight it sleeps on, in sight it wakes
    game.enterArea(DEN_OF_EVIL, 'stairs');
    const D = game.level;
    assert.equal(D.areaAt(p.pos.x, p.pos.z).id, DEN_OF_EVIL, 'not in the den');
    const dark = behindCover(D, DEN_OF_EVIL);
    const seen = dark && ringSpot(D, DEN_OF_EVIL, p.pos, true);
    assert.ok(dark && seen, `spots in the den: out of sight ${!!dark}, in sight ${!!seen}`);
    const denMs = [sleeper(dark), sleeper(seen)];
    const denD = dist(dark, p.pos);
    run(1.5);
    assert.ok(!denMs[0].awake && denMs[1].awake, `in the den: the one ${denD.toFixed(1)} m off out of sight awake ${denMs[0].awake}, the one in sight ${denMs[1].awake}`);
    const noticing = `a sleeper behind cover ${moorD.toFixed(1)} m off woke in Blood Moor, in the den one ${denD.toFixed(1)} m off slept on`;
    console.log(`  parameters by difficulty, fright, raises, walks, haste, curse, auras, reach, leash; in play: ${fleeLog}; a fallen raised ${raisedAt.toFixed(1)} s after it fell; the lead passed on in D2's order; a light hit shot back at twice; three quills; cursed ${cursed}/200; ${leashLog}; a struck sleeper woke its pack; ${sides}; ${noticing}`);
  } finally {
    debugOpts.god = god;
    localStorage.clear();
  }
};
