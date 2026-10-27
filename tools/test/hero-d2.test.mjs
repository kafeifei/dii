// The Diablo II formulas wired into the hero and combat (src/game/player.ts recalc and gainXp,
// combat.ts, playerctl.ts, game.ts's kills and deaths, corpse.ts, save.ts's body): the hero's vitals,
// rating, defense, block, resistances and speeds are game/d2's for the class, level and gear; kills
// give killXp; hit chance both ways goes by levels, a running hero is always hit in melee and blocks a
// third as often; running spends stamina; a death costs D2's gold and experience and leaves a body
// with the gear that the hero takes back, that the save keeps and that waits in the camp when loaded;
// an old save keeps its levels and points, its derived numbers worked out anew.
import assert from 'node:assert/strict';

const KEY = 'dii-save-v1';

export default async (load) => {
  const S = await load('/src/game/d2/stats.ts');
  const F = await load('/src/game/d2/frames.ts');
  const X = await load('/src/game/d2/xp.ts');
  const D = await load('/src/game/d2/death.ts');
  const save = await load('/src/game/save.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { Monster } = await load('/src/game/monster.ts');
  const { MONSTERS } = await load('/src/data/monsters.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { ITEM_BASES } = await load('/src/data/items.ts');
  const { monsterStrike, playerStrike, hitOdds, applyDamage } = await load('/src/game/combat.ts');
  const { updatePlayer, startAttack, startCast } = await load('/src/game/playerctl.ts');
  const { emptyPacket } = await load('/src/game/actor.ts');
  const { CAMP_AREA } = await load('/src/world/areas.ts');
  const { WILD_MAPS } = await load('/src/world/levelgen.ts');
  const notes = [];

  localStorage.clear();
  save.setSlot(0);
  let cursor = null;
  const game = new Game({}, new Sfx());
  game.hooks = {
    message() {},
    openPanel() {},
    levelChanged() {},
    areaChanged() {},
    teleported() {},
    playerDied() {},
    inventoryChanged() {},
    getCursorItem: () => cursor,
    setCursorItem(it) {
      cursor = it;
    },
    hoveredGroundId: () => null,
    levelUp() {},
  };

  // ── a new paladin and sorceress: CharStats' vitals, rating, defense, block and speeds ──
  game.newGame('公式测试', 'sorceress');
  {
    const p = game.player;
    const d = p.stats;
    const cs = S.charStats('sor');
    assert.equal(d.maxLife, 40, 'sorceress life: vit 10 + hpadd 30');
    assert.equal(d.maxMana, 35, 'sorceress mana: energy 35');
    assert.equal(d.maxStamina, 74);
    assert.equal(p.stamina, 74);
    // no shield: no block; a short staff is a staff ('stf') attack
    assert.equal(d.block, 0);
    assert.equal(d.wclass, 'stf');
    assert.equal(d.attackTime, F.toSeconds(F.attackAnim('sor', 'stf', { wsm: ITEM_BASES.sst.wsm }).frames));
    assert.equal(d.castTime, F.toSeconds(13), 'a sorceress casts in 13 frames at 0 FCR');
    assert.equal(d.hitRecovery, F.toSeconds(15), 'a sorceress recovers in 15 frames at 0 FHR');
    assert.equal(d.ar, S.attackRating(cs, 25), 'ToHitFactor −15 and 5 × (dex − 7)');
    assert.equal(d.walkSpeed * 1.5, d.runSpeed);
    assert.ok(Math.abs(d.runSpeed - 4.6) < 1e-9, 'running is the game\'s old pace');
  }
  game.newGame('公式测试', 'paladin');
  const p = game.player;
  const pal = S.charStats('pal');
  {
    const d = p.stats;
    assert.equal(d.maxLife, 55, 'paladin life: vit 25 + hpadd 30');
    assert.equal(d.maxMana, 15);
    assert.equal(d.maxStamina, 89);
    const buckler = p.equipment.offhand;
    assert.equal(d.def, S.defense(20, buckler.defense), 'dex / 4 and the buckler');
    assert.equal(d.block, S.blockChance(pal, ITEM_BASES.buc.block ?? 0, 20, 1), 'a buckler blocks nothing of its own: 30 × 5 / 2 = 75');
    assert.equal(d.wclass, '1hs');
    assert.equal(d.attackTime, F.toSeconds(14), 'a paladin swings a short sword in 14 frames');
    assert.equal(d.attackAction, F.toSeconds(7));
    assert.equal(d.castTime, F.toSeconds(15));
    assert.equal(d.hitRecovery, F.toSeconds(9));
    assert.equal(d.blockTime, F.toSeconds(5));
    // IAS, FCR, FHR and FBR through the breakpoints
    // a ring is never plain in D2: its rolled properties go, these stay
    const ring = createItem('rin');
    ring.props = [];
    ring.mods = [{ stat: 'ias', value: 20 }, { stat: 'fcr', value: 20 }, { stat: 'fhr', value: 27 }, { stat: 'fbr', value: 86 }];
    p.equipment.ring1 = ring;
    p.markDirty();
    const e = p.stats;
    assert.equal(e.attackTime, F.toSeconds(F.attackAnim('pal', '1hs', { ias: 20 }).frames));
    assert.ok(e.attackTime < d.attackTime);
    assert.equal(e.castTime, F.toSeconds(F.castAnim('pal', 20).frames));
    assert.equal(e.hitRecovery, F.toSeconds(F.hitRecoveryFrames('pal', 27)));
    assert.equal(e.blockTime, F.toSeconds(F.blockFrames('pal', 86)));
    delete p.equipment.ring1;
    // a vitality point: 3 life and a stamina point; an energy point 1.5 mana
    p.base.vit++;
    p.base.ene++;
    p.markDirty();
    assert.equal(p.stats.maxLife, 58);
    assert.equal(p.stats.maxStamina, 90);
    assert.equal(p.stats.maxMana, 16);
    p.base.vit--;
    p.base.ene--;
    p.markDirty();
  }

  // ── levels: D2's table, 5 attribute points and a skill point a level, life 2 a level ──
  {
    const before = { stat: p.statPoints, skill: p.skillPoints };
    assert.equal(p.gainXp(X.xpForLevel(3)), 2);
    assert.equal(p.level, 3);
    assert.equal(p.statPoints - before.stat, 10);
    assert.equal(p.skillPoints - before.skill, 2);
    assert.equal(p.stats.maxLife, 55 + 2 * 2);
    assert.equal(p.life, p.stats.maxLife);
  }

  // ── a kill's experience: the level gap and ExpRatio (killXp) ──
  game.enterLevel(1, 'waypoint');
  {
    for (const [mlvl, shrine] of [[3, 0], [12, 0], [1, 0]]) {
      const m = new Monster(MONSTERS.zombie, mlvl, 'normal', { ...p.pos });
      game.level.monsters.push(m);
      const xp0 = p.xp;
      const want = X.killXp(m.xp, p.level, m.level, shrine);
      game.killMonster(m, 'phys');
      assert.equal(p.xp - xp0, want, `a level ${mlvl} zombie at hero level ${p.level}`);
    }
    // a monster 8 levels up gives 92/256 of its experience below hero level 25, 9 up 38/256
    assert.equal(X.killXp(1000, 3, 11), Math.trunc((1000 * 92) / 256));
    assert.equal(X.killXp(1000, 3, 12), Math.trunc((1000 * 38) / 256));
  }

  // ── hit chance both ways, with the levels; a running hero is always hit and blocks a third as often ──
  {
    const m = new Monster(MONSTERS.zombie, 5, 'normal', { x: p.pos.x + 1, z: p.pos.z });
    game.level.monsters.push(m);
    assert.equal(hitOdds(m.ar, p.stats.def, m.level, p.level), S.hitChance(m.ar, p.stats.def, 5, p.level) / 100);
    assert.equal(hitOdds(10, 10000, 1, 1), 0.05, 'never under 5 %');
    assert.equal(hitOdds(10000, 0, 1, 1), 0.95, 'never over 95 %');
    // the hero's strike rating: +X% from the skill goes with the items' on all of it
    assert.equal(S.attackRating(pal, p.stats.dex, 0, 50), Math.trunc(p.stats.ar * 1.5));
    // a zombie that can't hit: AR 1 against huge defense, the hero with no shield
    const shield = p.equipment.offhand;
    delete p.equipment.offhand;
    p.markDirty();
    m.ar = 1;
    const strikes = (running) => {
      let hits = 0;
      for (let i = 0; i < 400; i++) {
        p.life = 1e6;
        p.running = running;
        p.setState('move');
        const before = p.life;
        const pk = emptyPacket();
        pk.phys = 1;
        pk.source = m;
        p.lastBlockTime = -Infinity;
        monsterStrike(game, m, p, pk, true);
        if (p.life < before) hits++;
      }
      return hits;
    };
    const walking = strikes(false);
    const running = strikes(true);
    const odds = hitOdds(1, p.stats.def, m.level, p.level);
    assert.ok(odds < 0.5 && Math.abs(walking / 400 - odds) < 0.06, `walking, the zombie lands ${odds * 100} %: ${walking} of 400`);
    assert.equal(running, 400, 'running, every blow lands');
    notes.push(`AR 1 zombie: ${walking}/400 walking, ${running}/400 running`);
    // blows wear armor down (items/d2/durability.ts): this shield won't break
    delete shield.dur;
    delete shield.maxDur;
    p.equipment.offhand = shield;
    p.markDirty();
    // block: a third while running (D2 integer division)
    const blk = p.stats.block;
    assert.ok(blk > 0);
    let blocked = { run: 0, walk: 0 };
    m.ar = 100000;
    for (const run of [false, true]) {
      for (let i = 0; i < 3000; i++) {
        p.life = 1e6;
        p.running = run;
        p.setState(run ? 'move' : 'idle');
        const before = p.life;
        const pk = emptyPacket();
        pk.phys = 1;
        pk.source = m;
        monsterStrike(game, m, p, pk, true);
        if (p.life === before) blocked[run ? 'run' : 'walk']++;
      }
    }
    const want = { walk: blk / 100, run: Math.trunc(blk / 3) / 100 };
    // hits miss 5 % at most, so "unhurt" is block or a miss
    assert.ok(Math.abs(blocked.walk / 3000 - (want.walk + (1 - want.walk) * 0.05)) < 0.04, `standing blocks ${blocked.walk}/3000 at ${blk} %`);
    assert.ok(Math.abs(blocked.run / 3000 - want.run) < 0.03, `running blocks ${blocked.run}/3000 at ${Math.trunc(blk / 3)} %`);
    notes.push(`block ${blk} %: ${blocked.walk}/3000 standing, ${blocked.run}/3000 running`);
    // a block plays its frames, then not again before FBR / 8 + 15 frames
    p.lastBlockTime = -Infinity;
    p.setState('idle');
    for (let i = 0; i < 200 && p.state !== 'block'; i++) {
      const pk = emptyPacket();
      pk.phys = 1;
      pk.source = m;
      monsterStrike(game, m, p, pk, true);
    }
    assert.equal(p.state, 'block');
    assert.equal(p.stateDur, p.stats.blockTime);
    // hit recovery: a blow of a quarter of life or more always, under a sixteenth never
    assert.equal(F.hitRecoveryOdds(p.stats.maxLife / 4, p.stats.maxLife), 1);
    assert.equal(F.hitRecoveryOdds(p.stats.maxLife / 17, p.stats.maxLife), 0);
    assert.equal(F.hitRecoveryOdds(p.stats.maxLife / 10, p.stats.maxLife), 0.375);
    p.setState('idle');
    p.life = p.stats.maxLife;
    const big = emptyPacket();
    big.phys = p.stats.maxLife / 2;
    applyDamage(game, p, big, m.pos);
    assert.equal(p.state, 'hit');
    assert.equal(p.stateDur, p.stats.hitRecovery);
    p.life = p.stats.maxLife;
    p.setState('idle');
    // the hero's swing lands on the action frame
    startAttack(game, p, 'attack', m, m.pos);
    assert.equal(p.actionAt, p.stats.attackAction);
    assert.equal(p.stateDur, p.stats.attackTime);
    p.setState('idle');
    game.level.monsters = game.level.monsters.filter((x) => x !== m);
  }

  // ── resistances: the difficulty's penalty, the cap and +max ──
  {
    // a ring is never plain in D2: its rolled properties go, these stay
    const ring = createItem('rin');
    ring.props = [];
    ring.mods = [{ stat: 'resFire', value: 120 }, { stat: 'maxResFire', value: 10 }, { stat: 'resCold', value: 30 }];
    p.equipment.ring2 = ring;
    // fire 120 over a cap of 75 + 10, less the penalty: 85, 80, 20
    for (const [d, fire, cold] of [[0, 85, 30], [1, 80, -10], [2, 20, -70]]) {
      p.difficulty = d;
      p.markDirty();
      assert.equal(p.stats.res.fire, fire, `fire, difficulty ${d}`);
      assert.equal(p.stats.res.cold, cold, `cold, difficulty ${d}`);
      assert.equal(p.stats.res.light, [0, -40, -100][d]);
    }
    // damage through them: hell's −100 lightning doubles it
    const pk = emptyPacket();
    pk.light = 10;
    p.life = p.stats.maxLife;
    const before = p.life;
    applyDamage(game, p, pk);
    assert.equal(before - p.life, 20);
    p.difficulty = 0;
    delete p.equipment.ring2;
    p.markDirty();
    p.setState('idle');
  }

  // ── stamina: running out of town spends it, D2's drain; at none the hero walks; standing brings it back ──
  {
    const d = p.stats;
    assert.ok(!game.level.inTown(p.pos));
    p.stamina = d.maxStamina;
    p.runMode = true;
    p.intent = { kind: 'steer', dir: { x: 1, z: 0 } };
    p.setState('move');
    updatePlayer(game, p, 0.5);
    assert.ok(p.running);
    const drain = S.runDrainPerSec(pal);
    assert.ok(Math.abs(p.stamina - (d.maxStamina - drain * 0.5)) < 1e-9, `stamina ${p.stamina}`);
    p.stamina = 0.1;
    updatePlayer(game, p, 0.5);
    assert.equal(p.stamina, 0);
    assert.equal(p.running, false);
    updatePlayer(game, p, 0.5);
    assert.equal(p.running, false, 'out of stamina, the hero walks');
    assert.equal(p.moveSpeed(), d.walkSpeed);
    assert.equal(p.stamina, 0, 'walking with nothing left brings none back');
    p.intent = null;
    p.setState('idle');
    updatePlayer(game, p, 1);
    assert.ok(Math.abs(p.stamina - S.staminaRegenPerSec(d.maxStamina, 'stand', 0)) < 1e-9);
    // the switch: walking spends nothing
    p.runMode = false;
    p.intent = { kind: 'steer', dir: { x: -1, z: 0 } };
    p.setState('move');
    const st = p.stamina;
    updatePlayer(game, p, 0.5);
    assert.equal(p.running, false);
    assert.ok(p.stamina > st);
    p.runMode = true;
    p.intent = null;
    p.setState('idle');
    p.stamina = d.maxStamina;
  }

  // ── potions by class: a paladin's healing potion heals half again ──
  {
    p.healQueue = [];
    game.drink(createItem('hp1'));
    const q = p.healQueue[0];
    assert.ok(Math.abs(q.perSec * q.left - ITEM_BASES.hp1.heal * 1.5) < 1e-9);
    p.healQueue = [];
  }

  // ── death in normal: level % of all the gold, no experience; the body keeps the gear ──
  const wornBefore = () => Object.fromEntries(Object.entries(p.equipment).map(([k, it]) => [k, it.uid]));
  {
    p.gold = 1000;
    p.stashGold = 3000;
    const xp0 = p.xp;
    const worn = wornBefore();
    p.belt = [[createItem('hp1'), createItem('hp1')], [createItem('hp1')], [], []];
    const pos = { ...p.pos };
    const L = game.level;
    game.killPlayer();
    assert.equal(game.lastDeath.goldLost, Math.trunc(4000 * p.level / 100));
    assert.equal(p.stashGold, 3000);
    assert.equal(p.xp, xp0, 'normal costs no experience');
    cursor = createItem('cap');
    game.respawn();
    assert.equal(cursor, null, 'the cursor\'s item went on the body');
    assert.deepEqual(Object.keys(p.equipment), [], 'the hero comes back with nothing on');
    assert.equal(p.gold, 0);
    assert.deepEqual(p.belt.map((c) => c.length), [1, 1, 0, 0], 'the belt keeps its first row');
    assert.equal(p.corpses.length, 1);
    const c = p.corpses[0];
    assert.equal(c.level, L);
    assert.deepEqual(Object.fromEntries(Object.entries(c.equipment).map(([k, it]) => [k, it.uid])), worn);
    assert.equal(c.items.length, 1);
    assert.ok(L.ground.some((g) => g.gold === 1000 - game.lastDeath.goldLost), 'the gold left lies by the body');
    // back to the wilderness: the body is there; taking it puts the gear back on
    game.enterLevel(1, 'waypoint');
    assert.equal(game.level, L);
    const o = L.objects.find((x) => x.kind === 'corpse');
    assert.ok(o && Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < 1e-9);
    game.interact(o);
    assert.deepEqual(wornBefore(), worn);
    assert.equal(p.corpses.length, 0);
    assert.ok(!L.objects.includes(o));
    assert.ok(p.inventory.items.some((x) => x.item.baseId === 'cap'), 'the cursor\'s item into the inventory');
  }

  // ── death in nightmare: 5 % of the level's experience, 75 % of it back from the body ──
  {
    p.difficulty = 1;
    p.markDirty();
    p.gainXp(X.xpForLevel(10) - p.xp + 1000);
    const xp0 = p.xp;
    const lvl = p.level;
    game.killPlayer();
    const span = X.xpForLevel(lvl + 1) - X.xpForLevel(lvl);
    assert.equal(xp0 - p.xp, Math.trunc((span * 5) / 100));
    assert.equal(p.level, lvl, 'no level is lost');
    game.respawn();
    const c = p.corpses[0];
    assert.equal(c.xp, D.deathPenalty({ level: lvl, xp: xp0, gold: 0, stashGold: 0, diff: 1 }).corpseXp);
    // a body whose map is gone (a dungeon floor two floors back) waits in the camp, still holding its experience
    game.enterLevel(1 + WILD_MAPS, 'waypoint');
    const floor = game.level;
    const cap = createItem('cap');
    p.equipment.head = cap;
    p.markDirty();
    game.killPlayer();
    game.respawn();
    assert.equal(p.corpses.length, 2);
    const b = p.corpses[1];
    assert.equal(b.level, floor);
    assert.equal(b.equipment.head, cap);
    game.enterLevel(2 + WILD_MAPS, 'waypoint');
    game.enterLevel(3 + WILD_MAPS, 'waypoint');
    game.enterLevel(0, 'waypoint');
    game.layOutCorpses();
    assert.equal(b.level, null, 'its floor is gone');
    const camp = game.level.objects.filter((o) => o.kind === 'corpse');
    assert.equal(camp.length, 1, 'the floor\'s body lies in the camp');
    assert.equal(camp[0].corpse, b);
    const bx = b.xp;
    assert.ok(bx > 0);
    let x0 = p.xp;
    game.interact(camp[0]);
    assert.equal(p.xp - x0, bx);
    assert.equal(p.equipment.head, cap);
    // the wilderness body is where it fell, with the rest of the gear and its experience
    game.enterLevel(1, 'waypoint');
    const o = game.level.objects.find((x) => x.kind === 'corpse');
    assert.equal(o?.corpse, c);
    x0 = p.xp;
    const cx = c.xp;
    game.interact(o);
    assert.equal(p.xp - x0, cx);
    assert.equal(p.corpses.length, 0);
    assert.ok(p.equipment.weapon && p.equipment.offhand, 'the weapon and shield are back on');
    assert.equal(p.equipment.head, cap);
    p.difficulty = 0;
    p.markDirty();
  }

  // ── the save keeps a body with items, not its experience; loaded, it waits in the camp ──
  {
    game.enterLevel(1, 'waypoint');
    const worn = wornBefore();
    game.killPlayer();
    game.respawn();
    assert.equal(p.corpses.length, 1);
    game.save();
    const saved = JSON.parse(localStorage.getItem(KEY));
    assert.ok(saved.corpse);
    assert.deepEqual(Object.fromEntries(Object.entries(saved.corpse.equipment).map(([k, it]) => [k, it.uid])), worn);
    assert.equal(saved.corpse.xp, undefined);
    assert.ok(game.continueGame(0));
    const q = game.player;
    assert.equal(q.corpses.length, 1);
    assert.equal(q.corpses[0].level, null);
    assert.equal(q.corpses[0].xp, 0);
    assert.ok(game.level.inTown(game.level.layout.start));
    game.layOutCorpses();
    const o = game.level.objects.find((x) => x.kind === 'corpse');
    assert.ok(o, 'the body is in the camp');
    game.interact(o);
    assert.deepEqual(Object.fromEntries(Object.entries(q.equipment).map(([k, it]) => [k, it.uid])), worn);
    game.save();
    assert.equal(JSON.parse(localStorage.getItem(KEY)).corpse, null);
  }

  // ── an old save keeps its levels and points; what follows from them is worked out anew ──
  {
    localStorage.clear();
    save.setSlot(0);
    const old = {
      v: 3, name: '老角色', cls: 'paladin', level: 14, xp: X.xpForLevel(14) + 10, base: { str: 40, dex: 45, vit: 50, ene: 15 },
      statPoints: 5, skillPoints: 2, skills: { sacred_strike: 12 }, equipment: {}, inventory: [], stash: [], belt: [[], [], [], []],
      gold: 10, stashGold: 0, binds: ['attack', null, null, null, null, null], activeAura: null, depthReached: 3, waypoints: [0], depth: 0,
      life: 999, mana: 999, time: 1,
    };
    localStorage.setItem(KEY, JSON.stringify(old));
    const s = save.loadSave();
    const h = s.player;
    assert.equal(h.level, 14);
    assert.equal(h.statPoints, 5);
    assert.equal(h.skillPoints, 2);
    assert.deepEqual(h.base, old.base);
    assert.equal(h.stats.maxLife, Math.floor(S.baseLife(pal, 14, 50)));
    assert.equal(h.stats.maxMana, Math.floor(S.baseMana(pal, 14, 15)));
    assert.equal(h.life, h.stats.maxLife, 'life held to the new maximum');
    assert.equal(h.stamina, h.stats.maxStamina);
    assert.equal(h.stats.ar, S.attackRating(pal, 45));
    notes.push(`v3 level 14 paladin: ${h.stats.maxLife} life, ${h.stats.maxMana} mana, ${h.stats.maxStamina} stamina, AR ${h.stats.ar}`);
  }
  localStorage.clear();
  console.log(`  ${notes.join('; ')}`);
};
