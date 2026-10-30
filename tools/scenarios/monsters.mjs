// Diablo II's monsters in play (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/monsters.mjs --url "http://localhost:5174/?dev" --out <dir>
// In ?dev, through Blood Moor and Cold Plains on the overworld and down into the Den of Evil: logs
// each area's kinds this game (Level.spawned) and what stands there by kind and rank, which must be
// of its levels.txt lists (mon, umon), what they bring and its superunique's group; then, with the
// hero kept alive (the debug panel's god mode), each kind up close fighting the hero, and Bishibosh
// and Corpsefire with their packs, before and after they wake; Bishibosh's fire-enchanted fallen die
// without his burst, he with it. Last the trial ground's floor bosses
// (floors 4, 8, 12: the Smith, Blood Raven, Andariel, in normal, nightmare and hell), each at the
// floor's level in the difficulty picked, each fighting the hero as D2's AI has it.
// Then each D2 AI at work (src/game/ai.ts), set up in a clearing with the hero standing still: a
// Fallen pack running from the hero as one of it dies and back once the hero comes on, a shaman
// raising its fallen once the corpse lies dead, quill rats shooting their quills, the spearmaiden
// striking from farther than the huntmaiden, a pack noticing the hero as one, Bishibosh raising his,
// and enchanted uniques: lightning's charged bolts when hit, fire's burst and cold's frost ring as
// they die, multiple shots' three quills, the cursed one's Amplify Damage, an aura's. The west
// block (M2a): the Burial Grounds' Blood Raven on her own body, her Nest raising a zombie at her feet
// (drawn getting up, its Rise, while it stands in S1) and the undead round her falling as she dies; a
// foul crow nest in Stony Field hatching its crows.
// Every wait is on the game's clock: the scenario steps the sim itself (run, S.run: the page's loop
// held, Game.headless, as tools/bot.mjs does), so a page that draws few frames runs as much game time
// as one that draws many, and each check has its bound in game seconds. Where a check stands the hero
// and a monster is D2's own length for it, from its row (its AI's ranges, its blow's reach, its aura's
// radius) through monai.ts and src/core/units.ts.
// Page and console errors fail the run. The last line is "MONSTERS OK <summary>" or "MONSTERS FAIL <reasons>".
const MOOR = 2;
const PLAINS = 3;
const DEN = 8;

export default async function (page, shot, log) {
  const errors = [];
  const fails = [];
  const facts = [];
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const expect = (ok, what) => {
    if (!ok) fails.push(what);
    return !!ok;
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frames = () => ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  await ev(async () => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ timeout: 60000 });
  await page.waitForFunction(() => window.game?.started && window.game.level, null, { timeout: 60000 });
  await ev(async () => {
    const S = (window.__mon = {});
    const { debugOpts } = await import('/src/game/debug.ts');
    debugOpts.god = true;
    S.areas = (await import('/src/data/d2x/areas.ts')).D2X_AREAS;
    S.monsters = (await import('/src/data/d2x/monsters.ts')).D2X_MONSTERS;
    S.supers = (await import('/src/data/d2x/superuniques.ts')).D2X_SUPERUNIQUES;
    S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    /** the hero beside a monster, `r` from it where they can see each other (and `ok` has the spot), the camera close */
    S.beside = (m, r, zoom, ok = () => true) => {
      const p = game.player;
      const map = game.level.map;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const spot = { x: m.pos.x + Math.sin(a) * r, z: m.pos.z + Math.cos(a) * r };
        if (!map.circleClear(spot.x, spot.z, 0.45) || !map.los(spot, m.pos) || game.level.inTown(spot) || !ok(spot)) continue;
        game.teleportWithin(spot);
        p.intent = null;
        p.path = null;
        p.life = p.stats.maxLife;
        renderer.zoomTarget = zoom;
        renderer.zoom = zoom;
        renderer.updateFrustum?.();
        return true;
      }
      return false;
    };
    S.A = await import('/src/game/d2/monai.ts');
    S.applyDamage = (await import('/src/game/combat.ts')).applyDamage;
    const { monsterDef } = await import('/src/data/monsters.ts');
    /** an AI parameter of row `id` in the difficulty played that is a length, metres (monai.ts AIP, subtiles) */
    S.aipM = (id, ai, name) => S.A.subtiles(S.A.param(S.monsters[id], game.player.difficulty, ai, name));
    /**
     * how near the hero a monster of row `id` stands when its AI strikes (findTarget's bCombat): its
     * blow's reach (ai.ts meleeReach: its arm and D2's MeleeRng) to the hero's edge
     */
    S.blowAt = (id) => {
      const d = monsterDef(id);
      return d.range + S.A.unitGap(d.row.meleeRng) + game.player.radius;
    };
    /** how near the hero a monster that shoots must be for its AI to shoot: a quill rat's aip1, a shaman's aip5 (AIP), else 10 subtiles */
    S.shootFrom = (m) => {
      const ai = m.def.row.ai;
      if (ai === 'QuillRat') return S.aipM(m.def.id, ai, 'activate');
      if (ai === 'FallenShaman') return S.aipM(m.def.id, ai, 'shootRange');
      return S.A.subtiles(10);
    };
    /**
     * The hero after a monster that shoots and backs off (a quill rat: each think inside its aip1 it
     * shoots at 35 % or backs off, past it it only wanders, and inside its blow's reach it only bites,
     * AiThink.cpp:1050-1123): back to 0.7 of `at` from it once it is past 0.9 of `at` or within its
     * blow's reach (S.blowAt); round it to a clear spot it can see if the straight way back isn't one
     */
    S.after = (m, at) => {
      const p = game.player;
      const d = S.dist(m.pos, p.pos);
      if (m.dead || (d <= 0.9 * at && d > S.blowAt(m.def.id))) return;
      const k = (0.7 * at) / Math.max(1e-6, d);
      const to = { x: m.pos.x + (p.pos.x - m.pos.x) * k, z: m.pos.z + (p.pos.z - m.pos.z) * k };
      const map = game.level.map;
      if (d > 0.1 && map.circleClear(to.x, to.z, 0.45) && map.los(to, m.pos)) game.teleportWithin(to);
      else S.beside(m, 0.7 * at, renderer.zoomTarget);
    };
    /** `r` from the hero `deg` degrees round from +x: S.place's dx, dz */
    S.off = (r, deg) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
    /**
     * The game run on the scenario's own steps, the page's loop held (Game.headless, as tools/bot.mjs):
     * `secs` of game time at most, a step 1/60 s as main.ts makes them, whatever the page's frame rate;
     * `poll(arg, t)` every `every` s of it, `t` the time run, until it returns something (no poll: the
     * hero held). What it returned (null if nothing), the time run, and whether the game stood still
     */
    S.run = (secs, poll, arg, every) => {
      const STEP = 1 / 60;
      const per = Math.max(1, Math.round(every / STEP));
      const n = Math.round(secs / STEP);
      const was = game.headless;
      game.headless = true;
      const t0 = game.time;
      try {
        for (let k = 1; k <= n; k++) {
          const before = game.time;
          game.update(STEP);
          if (game.time === before) return { r: null, t: game.time - t0, stalled: true };
          if (k % per && k < n) continue;
          if (!poll) {
            S.hold();
            continue;
          }
          const r = poll(arg, game.time - t0);
          if (r !== undefined && r !== null && r !== false) return { r, t: game.time - t0 };
        }
        return { r: null, t: game.time - t0 };
      } finally {
        game.headless = was;
      }
    };
    // the game's own Monster class (an import here could be another copy of the module after a hot reload)
    S.Monster = game.level.monsters[0]?.constructor ?? (await import('/src/game/monster.ts')).Monster;
    /** a clearing of the area with the hero in it, the monsters round it cleared away, the camera close */
    S.clearing = (area, zoom = 5.2) => {
      const L = game.level;
      const map = L.monsterMap;
      const p = game.player;
      let best = null;
      for (let z = 6; z < map.h - 6 && !best; z += 3) {
        for (let x = 6; x < map.w - 6; x += 3) {
          if (L.areaAt(x, z).id !== area || L.inTown({ x, z })) continue;
          const open = [[0, 0, 5], [4, 0, 3], [-4, 0, 3], [0, 4, 3], [0, -4, 3], [8, 0, 2], [-8, 0, 2]].every(([dx, dz, r]) => map.circleClear(x + dx, z + dz, r));
          // nothing standing in the way of a look across it (trees, rocks)
          if (open && [[7, 0], [-7, 0], [0, 5], [0, -5], [5, 5], [-5, -5]].every(([dx, dz]) => L.map.los({ x, z }, { x: x + dx, z: z + dz }))) {
            best = { x, z };
            break;
          }
        }
      }
      if (!best) return null;
      L.monsters = L.monsters.filter((m) => S.dist(m.pos, best) > 45);
      L.projectiles = [];
      L.deaths.length = 0;
      game.teleportWithin(best);
      p.intent = null;
      p.path = null;
      p.ampTime = 0;
      p.life = p.stats.maxLife;
      renderer.zoomTarget = zoom;
      renderer.zoom = zoom;
      renderer.updateFrustum?.();
      S.at = best;
      return best;
    };
    /** a monster of row `id` `dx`, `dz` off the hero, its numbers its row's level's in the difficulty played */
    S.place = (id, dx, dz, rank = 'normal', mods = [], pack = null) => {
      const L = game.level;
      const d = game.player.difficulty;
      const m = new S.Monster(id, S.monsters[id].diff[d].level, rank, { x: game.player.pos.x + dx, z: game.player.pos.z + dz }, mods, { difficulty: d });
      if (pack) {
        m.pack = pack;
        pack.push(m);
      }
      L.monsters = [...L.monsters, m];
      if (m.aura) L.auras.push(m);
      return m;
    };
    /** the hero stands: no intent, kept alive */
    S.hold = () => {
      const p = game.player;
      p.intent = null;
      p.path = null;
      p.life = Math.max(p.life, p.stats.maxLife * 0.5);
    };
    /** an area's report and its monsters by kind and rank, checked against its levels.txt row */
    S.census = (id) => {
      const L = game.level;
      const a = S.areas.find((x) => x.id === id);
      const d = game.player.difficulty;
      const r = L.spawned.get(id);
      const ms = L.monsters.filter((m) => L.areaAt(m.pos.x, m.pos.z).id === id);
      const by = {};
      for (const m of ms) by[`${m.def.id}/${m.rank}`] = (by[`${m.def.id}/${m.rank}`] ?? 0) + 1;
      const list = d ? a.nmon : a.mon;
      const allowed = new Set([...list, ...a.umon]);
      for (const k of [...allowed]) for (const mid of S.monsters[k]?.minions ?? []) allowed.add(mid);
      for (const key of a.superuniques ?? []) {
        const su = S.supers.find((s) => s.key === key);
        allowed.add(su.mon);
        for (const mid of S.monsters[su.mon]?.minions ?? []) allowed.add(mid);
      }
      const stray = [...new Set(ms.map((m) => m.def.id))].filter((k) => !allowed.has(k));
      return {
        name: a.name,
        kinds: r?.kinds ?? [],
        kindsOk: !!r && r.kinds.every((k) => list.includes(k)),
        packs: r?.packs ?? 0,
        bossPacks: r?.bossPacks ?? 0,
        max: a.packs[d][1],
        total: ms.length,
        by,
        stray,
        supers: ms.filter((m) => m.superUnique).map((m) => `${m.displayName} L${m.level} +${L.monsters.filter((x) => x.leader === m).length}`),
        uniques: ms.filter((m) => m.rank === 'unique' && !m.superUnique).map((m) => `${m.displayName}[${m.modText()}]`),
      };
    };
  });

  const census = async (id) => {
    const c = await ev((id) => window.__mon.census(id), id);
    log(`${c.name} (${id}): kinds ${c.kinds.join(', ')}; ${c.packs} packs, ${c.bossPacks} champion/unique (MonUMax ${c.max}); ${c.total} monsters: ${Object.entries(c.by).map(([k, n]) => `${k}×${n}`).join(' ')}`);
    if (c.supers.length) log(`  superuniques: ${c.supers.join(', ')}`);
    if (c.uniques.length) log(`  uniques: ${c.uniques.join(', ')}`);
    expect(c.kindsOk && c.kinds.length, `${c.name}: kinds ${c.kinds}`);
    expect(!c.stray.length, `${c.name}: ${c.stray.join(', ')} isn't of its lists`);
    expect(c.bossPacks <= c.max, `${c.name}: ${c.bossPacks} elite packs over MonUMax ${c.max}`);
    expect(c.total > 0, `${c.name}: no monsters`);
    facts.push(`${c.name} ${c.total}`);
    return c;
  };

  /** each kind of the area up close, the hero fighting it */
  const fightEach = async (id, label) => {
    const kinds = await ev((id) => {
      const L = game.level;
      return [...new Set(L.monsters.filter((m) => !m.dead && m.rank === 'normal' && L.areaAt(m.pos.x, m.pos.z).id === id).map((m) => m.def.id))];
    }, id);
    for (const k of kinds) {
      // the last kind's dead done dying and the hero's swing over first: a Fallen within 15 subtiles of
      // a corpse still dying runs from the hero (monai.ts frightened), and past its aip2 doesn't come
      // back; the nearest of the next kind may stand by the one just killed. Up to 4 s of game time
      await run(4, () => {
        const S = window.__mon;
        const p = game.player;
        S.hold();
        return !game.level.deaths.some((c) => S.A.dying(c) && S.dist(c.pos, p.pos) < 15) && p.state !== 'attack' && p.state !== 'cast';
      }, undefined, 1 / 60);
      const r = await ev(
        ({ id, k }) => {
          const S = window.__mon;
          const L = game.level;
          const p = game.player;
          const all = L.monsters.filter((x) => !x.dead && x.rank === 'normal' && x.def.id === k && L.areaAt(x.pos.x, x.pos.z).id === id).sort((a, b) => S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos));
          // inside its blow's reach (S.blowAt), so it strikes as it thinks; one that shoots inside
          // the range its AI shoots from (S.shootFrom) and outside its blow's. The nearest may stand
          // where nothing round it is clear (a den wall, a tree): the next one then, each a little
          // nearer or further
          const at = (x) => (x.missile() ? [0.7, 0.6, 0.8].map((f) => f * S.shootFrom(x)) : [0.85, 0.75, 0.95].map((f) => f * S.blowAt(x.def.id)));
          const m = all.find((x) => at(x).some((r) => S.beside(x, r, 3.4)));
          if (!m) return { error: `no spot by any of ${all.length} ${k}` };
          m.awake = true;
          // whatever it was about (a slow zombie's wander), it thinks again now
          m.move = null;
          m.thinkTimer = 0;
          S.foe = m;
          S.fg = { range: m.missile() ? S.shootFrom(m) : 0, seen: null, d: S.dist(m.pos, p.pos) };
          return { name: m.displayName, level: m.level, life: m.maxLife, ar: m.ar, def: m.defense, dmg: m.dmg, ai: m.def.row.ai, ranged: !!m.missile(), d: S.fg.d };
        },
        { id, k },
      );
      if (r.error) {
        expect(false, r.error);
        continue;
      }
      // up to 10 s of game time for a blow (15 for a shot) to start, its AI's rolls given many
      // thoughts; the hero never strikes first (a fallen of 1 life would fall to the first swing
      // before it swung), and strikes back for 0.8 s once it has. One that shoots is kept near:
      // each think in its aip1 a quill rat shoots at 35 % or backs off 2 subtiles each way, and past
      // its aip1 it only wanders (AiThink.cpp:1077-1110), so the hero goes after it
      await run(r.ranged ? 15 : 10, (_, t) => {
        const S = window.__mon;
        const F = S.fg;
        const m = S.foe;
        const p = game.player;
        p.life = Math.max(p.life, p.stats.maxLife * 0.5);
        if (F.seen === null && (m.state === 'attack' || m.state === 'cast' || game.level.projectiles.some((x) => x.owner === m))) F.seen = t;
        if (F.seen !== null && !m.dead && p.state !== 'attack' && p.state !== 'cast') game.useSkillAt('attack', m, { ...m.pos }, true);
        if (F.range && F.seen === null && !m.dead && S.dist(m.pos, p.pos) > 0.85 * F.range) S.beside(m, 0.7 * F.range, 3.4);
        return F.seen !== null && t - F.seen >= 0.8;
      });
      const { seen, end } = await ev(() => {
        const S = window.__mon;
        const m = S.foe;
        return { seen: S.fg.seen, end: `now ${S.dist(m.pos, game.player.pos).toFixed(2)} m off, ${m.dead ? 'dead' : m.state}, fright ${m.aiFlag}` };
      });
      await frames();
      await shot(`${label}-${k}`);
      expect(seen !== null, `a ${k} never attacked the hero in ${r.ranged ? 15 : 10} s, the hero ${r.d.toFixed(2)} m off (${end})`);
      log(`  ${k} ${r.name}: level ${r.level}, ${r.life} life, defense ${r.def}, A1 ${r.dmg.join('–')} at ${r.ar}, fought as ${r.ai}${seen !== null ? `, attacking ${seen.toFixed(1)} s in from ${r.d.toFixed(2)} m` : ' (no attack seen)'}`);
    }
  };

  /** a superunique and its pack: asleep, then fighting */
  const superShot = async (key, label) => {
    const r = await ev((key) => {
      const S = window.__mon;
      const L = game.level;
      const b = L.monsters.find((m) => m.superUnique === key && !m.dead);
      if (!b) return { error: `no ${key}` };
      // nearer in where his room is tight
      if (![5, 4, 3, 2.2].some((r) => S.beside(b, r, 5.2))) return { error: `no spot by ${key}` };
      // the pack still: asleep where it spawned (out in the wilderness it notices the hero at once,
      // seen or not, as in D2; in the den only once it sees them)
      for (const m of L.monstersNear(b.pos, 12)) m.awake = false;
      S.foe = b;
      return { name: b.displayName, level: b.level, life: b.maxLife, mods: b.modText(), minions: L.monsters.filter((m) => m.leader === b).map((m) => m.def.id) };
    }, key);
    if (r.error) return expect(false, r.error);
    log(`  ${key}: ${r.name} level ${r.level}, ${r.life} life, ${r.mods}; minions ${r.minions.join(', ')}`);
    await run(0.4);
    await frames();
    await shot(`${label}-pack`);
    await ev(() => {
      const S = window.__mon;
      for (const m of game.level.monstersNear(S.foe.pos, 12)) m.awake = true;
    });
    await run(1.5);
    await frames();
    await shot(`${label}-fight`);
    return true;
  };

  /**
   * `secs` of game time at most, the scenario stepping it (S.run), `poll` (given `arg` and the time
   * run; none: the hero held) every `every` s of it until it returns something: that, or null. The
   * poll is sent as its source, as page.evaluate sends a function: it reads only the page and `arg`
   */
  const run = async (secs, poll, arg, every = 0.1) => {
    // a level's loading veil holds the world in play (main.ts): so it does here
    await page.waitForFunction(() => !window.renderer.veiled, null, { timeout: 30000 });
    const out = await ev(({ secs, src, arg, every }) => window.__mon.run(secs, src ? (0, eval)(`(${src})`) : null, arg, every), { secs, src: poll ? poll.toString() : null, arg, every });
    expect(!out.stalled, `the game stood still ${out.t.toFixed(2)} s into a run of ${secs} s`);
    return out.r;
  };

  /**
   * The Burial Grounds' Blood Raven (the preset one, the only one with a quest): her own body and long
   * bow; up close she casts her Nest and a zombie gets up at her feet, no one's minion (shot); killed,
   * the undead within 35 subtiles of her fall 1–5 s later, nobody's kill (no experience, no drop)
   */
  const bloodRaven = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!game.travelToArea(17)) return { error: 'no Burial Grounds' };
      const L = game.level;
      const ravens = L.monsters.filter((m) => m.def.id === 'bloodraven');
      const b = ravens[0];
      if (ravens.length !== 1 || !b) return { error: `${ravens.length} Blood Ravens on the overworld` };
      if (![2.6, 3.2, 2].some((r) => S.beside(b, r, 3.8))) return { error: 'no spot by Blood Raven' };
      // her chance at a Nest over 100 % from her next thought on, her roar done
      b.awake = true;
      b.taunted = true;
      b.aiCount = 1000;
      b.thinkTimer = 0;
      S.raven = { b, tally: b.aiTally, xp: 0, ground: 0 };
      return { quest: b.quest, model: b.def.model, voice: b.def.voice, level: b.level, life: b.maxLife, party: b.pack.filter((m) => m !== b && !m.dead).length };
    });
    if (r0.error) return expect(false, r0.error);
    log(`Blood Raven in the Burial Grounds: quest ${r0.quest}, the ${r0.model} look, cry ${r0.voice}, level ${r0.level}, ${r0.life} life, ${r0.party} of her party about`);
    expect(r0.quest === 'a1q2' && r0.model === 'bloodraven', `the Burial Grounds' Blood Raven: quest ${r0.quest}, look ${r0.model}`);
    // her cast's moment: a zombie of hers at her feet (polled each 0.1 s; the shot as it gets up)
    const up = await run(6, () => {
      const S = window.__mon;
      const b = S.raven.b;
      S.hold();
      b.aiCount = 1000;
      const z = game.level.monsters.find((m) => m.def.id === 'zombie2' && m.noXp && !m.dead && S.dist(m.pos, b.pos) < 0.6);
      if (z) S.raven.z = z;
      return z ? { off: S.dist(z.pos, b.pos) / S.A.subtiles(1), mine: z.leader === b || b.minions.includes(z), rising: z.thinkTimer, rise: z.rise?.len ?? 0, tally: b.aiTally } : null;
    });
    if (!expect(up, 'Blood Raven raised no zombie in 6 s')) return;
    await frames();
    await shot('raven-raise');
    log(`  her Nest: a zombie ${up.off.toFixed(1)} subtiles from her feet, ${up.mine ? 'HERS' : "no one's"}, getting up for ${up.rising.toFixed(1)} s more; ${up.tally} cast so far`);
    expect(up.off <= 2.5 && !up.mine, `her zombie ${up.off.toFixed(1)} subtiles off, hers ${up.mine}`);
    // it gets up in S1 (Monster.riseUp): drawn rising, its Rise clip, all the while it stands (shot part-way), then up
    const drawnAs = () =>
      ev(() => {
        const z = window.__mon.raven.z;
        const rig = renderer.monsterViews.views.get(z)?.body?.rig;
        return { clip: rig?.curClip?.name ?? null, t: z.rise ? game.level.time - z.rise.at : null, state: z.state, thinking: z.thinkTimer };
      });
    const first = await drawnAs();
    await run(0.75, null);
    await frames();
    const part = await drawnAs();
    await shot('raven-raise-rising');
    await run(Math.max(0.1, up.rise - part.t + 0.3), null);
    await frames();
    const risen = await drawnAs();
    await shot('raven-raise-risen');
    log(`  her zombie drawn ${first.clip} at ${first.t?.toFixed(2)} s and ${part.clip} at ${part.t?.toFixed(2)} s of its ${up.rise.toFixed(2)} s rise (standing: ${part.state}), then ${risen.clip} at ${risen.t?.toFixed(2)} s`);
    expect(up.rise > 1.5 && first.clip === 'Rise' && part.clip === 'Rise' && part.state === 'idle' && risen.clip !== 'Rise', `her zombie's rise: ${up.rise} s, drawn ${first.clip}, ${part.clip} (${part.state}), then ${risen.clip}`);
    // the rest of her count, then her death: the undead round her fall, nobody's kill
    const d = await ev(() => {
      const S = window.__mon;
      const L = game.level;
      const b = S.raven.b;
      const p = game.player;
      const r = S.A.subtiles(35);
      const undead = L.monsters.filter((m) => !m.dead && m !== b && m.def.undead && S.dist(m.pos, b.pos) <= r);
      const beyond = L.monsters.filter((m) => !m.dead && m.def.undead && S.dist(m.pos, b.pos) > r + 0.3 && S.dist(m.pos, b.pos) < r + 6);
      game.killMonster(b, 'phys');
      S.raven.undead = undead;
      S.raven.beyond = beyond;
      S.raven.xp = p.xp;
      S.raven.ground = L.ground.length;
      S.raven.t0 = game.time;
      // nothing runs from her death until the scenario steps it: 0.8 s and 5.2 s of it exactly
      game.headless = true;
      return { undead: undead.length, beyond: beyond.length };
    });
    log(`  killed: ${d.undead} undead within 35 subtiles of her, ${d.beyond} just past it`);
    // by the game's clock since her death, polled each step
    const since = (secs) => run(secs + 0.5, (secs) => (window.__mon.hold(), game.time - window.__mon.raven.t0 >= secs - 1e-9 || null), secs, 1 / 60);
    await since(0.8);
    const early = await ev(() => window.__mon.raven.undead.filter((m) => m.dead).length);
    await since(5.2);
    const after = await ev(() => {
      const S = window.__mon;
      const R = S.raven;
      game.headless = false;
      return { fell: R.undead.filter((m) => m.dead).length, stood: R.beyond.filter((m) => !m.dead).length, xp: game.player.xp - R.xp, ground: game.level.ground.length - R.ground };
    });
    await frames();
    await shot('raven-dead');
    log(`  ${early} of them down within 0.8 s, ${after.fell} of ${d.undead} by 5.2 s; ${after.stood} of ${d.beyond} past 35 subtiles standing; ${after.xp} experience and ${after.ground} drops from their fall`);
    expect(early === 0 && after.fell === d.undead && after.xp === 0 && after.ground === 0, `her dead: ${early} fell within 0.8 s, ${after.fell}/${d.undead} by 5.2 s, ${after.xp} experience, ${after.ground} drops`);
    facts.push(`Blood Raven's Nest at her feet, ${after.fell} undead fell with her`);
  };

  /**
   * A foul crow nest in Stony Field (one of its own, else one set down in a clearing): the hero within
   * 20 subtiles, it hatches a crow at its exit every 100 frames (shot as one comes out), no one's minion
   */
  const crowNest = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!game.travelToArea(4)) return { error: 'no Stony Field' };
      const L = game.level;
      // where a crow comes out: MonStats SpawnX, SpawnY off it, which must be clear for a body of
      // size 2 (ai.ts exitClear, D2's MONSTERSPAWN_CanSpawnAtSpawnerExit): one whose exit is blocked
      // never hatches
      const exitOf = (m) => ({ x: m.pos.x + S.A.subtiles(m.def.row.spawn?.x ?? 0), z: m.pos.z + S.A.subtiles(m.def.row.spawn?.y ?? 0) });
      const opens = (m) => {
        const e = exitOf(m);
        return L.monsterMap.circleClear(e.x, e.z, S.A.subtiles(1)) && !L.inTown(e);
      };
      // the hero inside its 20 subtiles (past them it stands, ai.ts foulCrowNest)
      const near = [0.6, 0.5, 0.7].map((f) => f * S.A.subtiles(20));
      // one of its own away from Rakanishu's pack at the cairn, its exit clear, else one set down in a clearing
      let n = L.monsters.find((m) => m.def.id === 'crownest1' && !m.dead && L.areaAt(m.pos.x, m.pos.z).id === 4 && opens(m) && !L.monsters.some((o) => o.superUnique && S.dist(o.pos, m.pos) < 15));
      const own = !!n;
      if (!n || !near.some((r) => S.beside(n, r, 3.8))) {
        if (!S.clearing(4, 3.8)) return { error: 'no clearing in Stony Field' };
        n = S.place('crownest1', near[0], -1);
      }
      // what stood round it gone, for a clear look at the crows coming out
      L.monsters = L.monsters.filter((m) => m === n || m.dead || S.dist(m.pos, n.pos) > 10);
      // hatched in a while if never yet: its timer from now
      n.aiStamp = L.time - 3;
      n.thinkTimer = 0;
      S.nest = { n, exit: exitOf(n), seen: new Set(), at: [] };
      return { own, open: opens(n), tally: n.aiTally, d: S.dist(n.pos, game.player.pos) / S.A.subtiles(1) };
    });
    if (r0.error) return expect(false, r0.error);
    log(`a foul crow nest in Stony Field (${r0.own ? 'its own' : 'set down'}), the hero ${r0.d.toFixed(1)} subtiles off, ${r0.tally} hatched before`);
    const poll = () => {
      const S = window.__mon;
      const N = S.nest;
      S.hold();
      for (const c of game.level.monsters) {
        if (c.def.id !== 'foulcrow1' || !c.noXp || N.seen.has(c)) continue;
        N.seen.add(c);
        N.at.push({ t: game.time, off: S.dist(c.pos, N.exit) / S.A.subtiles(1), mine: c.leader !== null });
        return N.at[N.at.length - 1];
      }
      return null;
    };
    // polled each step: a crow where it comes out, the gap between two to a step
    const first = await run(4, poll, undefined, 1 / 60);
    if (!expect(first, `the nest hatched nothing in 4 s (its exit ${r0.open ? 'clear' : 'blocked'})`)) return;
    await frames();
    await shot('nest-hatch');
    const second = await run(15, poll, undefined, 1 / 60);
    const gap = second ? second.t - first.t : null;
    log(`  a crow ${first.off.toFixed(1)} subtiles from its exit, ${first.mine ? 'a minion' : "no one's"}; the next ${gap === null ? 'never' : `${gap.toFixed(1)} s later`}`);
    expect(first.off <= 2.5 && !first.mine && gap !== null && gap >= 3.9, `the nest: a crow ${first.off.toFixed(1)} subtiles off its exit, a minion ${first.mine}, the next ${gap}`);
    facts.push(`the nest hatched ${gap === null ? 1 : 2} ${gap === null ? '' : `${gap.toFixed(1)} s apart`}`);
  };

  /** a Fallen pack 3 m off: one dies, the rest run from the hero; the hero comes on, they come back and strike */
  const fallenFlee = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(2)) return { error: 'no clearing in Blood Moor' };
      const pack = [];
      const lead = S.place('fallen1', 3, 0, 'normal', [], pack);
      const party = [S.place('fallen1', 3.6, 0.8, 'normal', [], pack), S.place('fallen1', 3.6, -0.8, 'normal', [], pack), S.place('fallen1', 4.2, 0, 'normal', [], pack)];
      for (const f of party) f.follow(lead);
      S.fl = { lead, party, rest: [lead, party[1], party[2]] };
      return { ok: true };
    });
    if (r0.error) return expect(false, r0.error);
    await run(1.2);
    const k = await ev(() => {
      const S = window.__mon;
      const p = game.player;
      game.killMonster(S.fl.party[0], 'phys');
      S.fl.t0 = game.time;
      S.fl.d0 = S.fl.rest.map((m) => S.dist(m.pos, p.pos));
      S.fl.far = S.fl.d0.slice();
      return { awake: S.fl.rest.every((m) => m.awake), d0: S.fl.d0 };
    });
    // how far each got: while the corpse dies (DEATH_FRAMES, 1.76 s) one mid-blow thinks within its
    // blow and its aidel (1.6 s) and runs 12 subtiles at +50 %; 3.5 s of game time covers it
    const track = () => {
      const S = window.__mon;
      S.hold();
      S.fl.rest.forEach((m, i) => (S.fl.far[i] = Math.max(S.fl.far[i], S.dist(m.pos, game.player.pos))));
    };
    await run(0.7, track);
    await frames();
    await shot('fallen-flee');
    await run(2.8, track);
    const fled = await ev(() => {
      const S = window.__mon;
      return { far: S.fl.far, flags: S.fl.rest.map((m) => m.aiFlag), n: S.fl.rest.filter((m, i) => S.fl.far[i] > S.fl.d0[i] + 1).length };
    });
    expect(fled.n >= 2, `only ${fled.n} of 3 fallen ran as one died`);
    // the hero comes on, inside their aip2 (a Fallen walks at a hero within it, or on a leader's cry):
    // 0.6 of it short of the middle of them, back they come
    const near = await ev(() => {
      const S = window.__mon;
      const p = game.player;
      const r = S.fl.rest;
      S.fl.near = 0.6 * S.aipM('fallen1', 'Fallen', 'approachDist');
      const mid = { x: (r[0].pos.x + r[1].pos.x + r[2].pos.x) / 3, z: (r[0].pos.z + r[1].pos.z + r[2].pos.z) / 3 };
      const k = S.fl.near / Math.max(S.fl.near, S.dist(mid, p.pos));
      const to = { x: mid.x + (p.pos.x - mid.x) * k, z: mid.z + (p.pos.z - mid.z) * k };
      game.teleportWithin(game.level.map.nearestWalkable(to.x, to.z, 2) ?? to);
      S.fl.t1 = game.time;
      return S.fl.near;
    });
    const back = await run(12, () => {
      const S = window.__mon;
      S.hold();
      const m = S.fl.rest.find((x) => x.state === 'attack');
      if (m) return { after: game.time - S.fl.t1, flag: m.aiFlag };
      // not yet (one wandered off past it): the hero goes on, up to the nearest, as near
      if (game.time - S.fl.t1 > 4 && !S.fl.closer) {
        S.fl.closer = true;
        const p = game.player;
        const n = S.fl.rest.filter((x) => !x.dead).sort((a, b) => S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos))[0];
        if (n) S.beside(n, S.fl.near, 5.2);
      }
      return null;
    });
    await frames();
    await shot('fallen-return');
    expect(back, 'the fallen never came back to strike in 12 s');
    log(`  Fallen: one killed, ${fled.n}/3 ran (${k.d0.map((d, i) => `${d.toFixed(1)}→${fled.far[i].toFixed(1)} m`).join(', ')}), fright kept for the next blow: ${fled.flags.join('/')}; the hero came on to ${near.toFixed(2)} m of them, back and striking ${back ? back.after.toFixed(1) : '—'} s after`);
    facts.push(`fallen fled ${fled.n}/3`);
  };

  /** a shaman and its fallen 4 m off: one killed, raised once it lies dead */
  const shamanRaise = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(2)) return { error: 'no clearing for the shaman' };
      const pack = [];
      const sh = S.place('fallenshaman1', 4, 0, 'normal', [], pack);
      const fs = [S.place('fallen1', 3.2, 0.9, 'normal', [], pack), S.place('fallen1', 3.4, -0.9, 'normal', [], pack)];
      for (const f of fs) f.follow(sh);
      S.sh = { sh, fs };
      return { ok: true };
    });
    if (r0.error) return expect(false, r0.error);
    await run(0.8);
    await ev(() => {
      const S = window.__mon;
      // the hero a step off, so the fallen don't stand over the corpse
      game.teleportWithin({ x: game.player.pos.x - 1.5, z: game.player.pos.z });
      game.killMonster(S.sh.fs[0], 'phys');
      S.sh.t0 = game.time;
    });
    const casting = await run(12, () => {
      const S = window.__mon;
      S.hold();
      const s = S.sh.sh;
      if (s.state === 'cast' && s.act?.kind === 'raise') return { at: game.time - S.sh.t0, lying: S.sh.fs[0].deathTime };
      return S.sh.fs[0].dead ? null : { at: game.time - S.sh.t0, lying: -1 };
    });
    await frames();
    await shot('shaman-raising');
    const up = await run(3, () => (window.__mon.hold(), window.__mon.sh.fs[0].dead ? null : { at: game.time - window.__mon.sh.t0, noXp: window.__mon.sh.fs[0].noXp }));
    await run(0.4);
    await frames();
    await shot('shaman-raised');
    expect(up?.noXp, `the shaman's fallen wasn't raised (${JSON.stringify(casting)})`);
    expect(!casting || casting.lying < 0 || casting.lying >= 1.7, `raised while still dying (${casting?.lying})`);
    log(`  Fallen Shaman: its fallen killed, the raise begun ${casting ? casting.at.toFixed(1) : '—'} s after (the corpse lying dead ${casting && casting.lying >= 0 ? casting.lying.toFixed(1) : '?'} s), up at ${up ? up.at.toFixed(1) : '—'} s with no experience to give`);
    facts.push('shaman raised');
  };

  /** quill rats inside their aip1: their quills fly (A2, spike1 at its D2 speed) */
  const quillRats = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(2, 4.4)) return { error: 'no clearing for the quill rats' };
      // 0.7 of their aip1 (10 subtiles) off, the hero after the nearer one as it backs off (S.after)
      S.ratAt = S.aipM('quillrat1', 'QuillRat', 'activate');
      S.rats = [S.place('quillrat1', ...S.off(0.7 * S.ratAt, 13)), S.place('quillrat1', ...S.off(0.7 * S.ratAt, -23))];
      for (const r of S.rats) r.awake = true;
      S.ratShots = new Set();
      S.ratFollow = -Infinity;
      return { at: S.ratAt };
    });
    if (r0.error) return expect(false, r0.error);
    // 15 s of game time: a rat kept in range shoots about once in 3 s (a cast and its aidel, a 35 %
    // roll each think between). Polled each step, every quill counted; the hero after them each 0.3 s
    const SECS = 15;
    const poll = (stopAtFirst, t) => {
      const S = window.__mon;
      S.hold();
      const p = game.player;
      if (game.time - S.ratFollow >= 0.3 - 1e-9) {
        S.ratFollow = game.time;
        const r = S.rats.filter((m) => !m.dead).sort((a, b) => S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos))[0];
        if (r) S.after(r, S.ratAt);
      }
      const live = game.level.projectiles.filter((x) => S.rats.includes(x.owner));
      for (const x of live) S.ratShots.add(x.id);
      return stopAtFirst && live.length ? t : null;
    };
    const t1 = await run(SECS, poll, true, 1 / 60);
    if (t1 !== null) {
      await frames();
      await shot('quillrats-fire');
      await run(SECS - t1, poll, false, 1 / 60);
    }
    const r = await ev(() => {
      const S = window.__mon;
      const sp = game.level.projectiles.find((x) => S.rats.includes(x.owner));
      return { shots: S.ratShots.size, d: S.rats.map((m) => S.dist(m.pos, game.player.pos).toFixed(1)), speed: sp ? Math.hypot(sp.vel.x, sp.vel.z) : null };
    });
    expect(r.shots > 0, `the quill rats never shot in ${SECS} s, ${(0.7 * r0.at).toFixed(2)} m off`);
    log(`  quill rats: ${r.shots} quills in ${SECS} s from ${(0.7 * r0.at).toFixed(2)} m (their aip1 ${r0.at.toFixed(2)} m; the hero after them as they back off), now ${r.d.join(' and ')} m off${r.speed ? `, flying ${r.speed.toFixed(2)} m/s` : ''}`);
    facts.push(`quills ${r.shots}`);
  };

  /** a pack wakes as one: its leader within notice range, a minion beyond it */
  const packWake = async () => {
    const r = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(2)) return { error: 'no clearing for the pack' };
      const pack = [];
      // the fallen's notice range (MonStats aidist, else 35 subtiles): the leader inside it, the minion well past it
      const notice = S.A.subtiles(S.A.noticeRange(S.monsters.fallen1, 0));
      const lead = S.place('fallen1', 0.8 * notice, 0, 'normal', [], pack);
      const far = S.place('fallen1', 1.5 * notice, 0, 'normal', [], pack);
      far.follow(lead);
      S.pw = { lead, far, notice };
      return { notice, lead: S.dist(lead.pos, game.player.pos) };
    });
    if (r.error) return expect(false, r.error);
    const woke = await run(3, () => {
      const S = window.__mon;
      S.hold();
      return S.pw.lead.awake ? { far: S.pw.far.awake, d: S.dist(S.pw.far.pos, game.player.pos) } : null;
    });
    expect(woke?.far, `the pack didn't wake as one in 3 s (${JSON.stringify(woke)})`);
    log(`  a pack noticing the hero: its leader ${r.lead.toFixed(1)} m off (notice ${r.notice.toFixed(1)} m), its minion ${woke ? woke.d.toFixed(1) : '?'} m off woke with it: ${!!woke?.far}`);
  };

  /** the spearmaiden and the huntmaiden come on from afar: where each stands as it strikes */
  const lancerReach = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(3)) return { error: 'no clearing in Cold Plains' };
      // from past where both run in: the spearmaiden's aip5, the huntmaiden's 20 subtiles (normal)
      const from = 1.2 * Math.max(S.aipM('cr_lancer1', 'CorruptLancer', 'alwaysRun'), S.A.subtiles(20));
      S.lr = { lancer: S.place('cr_lancer1', from, 0), hunter: S.place('corruptrogue1', -from, 0), at: {} };
      S.lr.lancer.awake = S.lr.hunter.awake = true;
      // their reaches' difference, centre to centre, where a walk at the hero stops (ai.ts heroReach, 0.9 of it)
      const reach = (m) => m.def.range + S.A.unitGap(m.def.row.meleeRng);
      return { from, more: 0.9 * (reach(S.lr.lancer) - reach(S.lr.hunter)) };
    });
    if (r0.error) return expect(false, r0.error);
    // polled each step: each one's distance as its first blow begins
    const poll = (stopAtThrust, t) => {
      const S = window.__mon;
      S.hold();
      const p = game.player;
      for (const k of ['lancer', 'hunter']) {
        const m = S.lr[k];
        if (m.state === 'attack' && S.lr.at[k] === undefined) S.lr.at[k] = S.dist(m.pos, p.pos);
      }
      const both = S.lr.at.lancer !== undefined && S.lr.at.hunter !== undefined;
      return both || (stopAtThrust && S.lr.lancer.state === 'attack') ? t : null;
    };
    const t1 = await run(8, poll, true, 1 / 60);
    if (t1 !== null) {
      await frames();
      await shot('lancer-reach');
      await run(8 - t1, poll, false, 1 / 60);
    }
    const r = await ev(() => window.__mon.lr.at);
    expect(r.lancer !== undefined && r.hunter !== undefined && r.lancer > r.hunter + 0.6 * r0.more, `the spearmaiden struck from ${r.lancer?.toFixed(2)} m, the huntmaiden from ${r.hunter?.toFixed(2)} m in 8 s (${r0.more.toFixed(2)} m more wanted)`);
    log(`  reach: from ${r0.from.toFixed(2)} m, the spearmaiden (MeleeRng 2) struck from ${r.lancer?.toFixed(2)} m, the huntmaiden from ${r.hunter?.toFixed(2)} m (D2's reach ${r0.more.toFixed(2)} m more)`);
  };

  /** Bishibosh raises a fallen of his once it lies dead (any Fallen within his aip4, a unique's search) */
  const bishiboshRaise = async () => {
    const r = await ev(() => {
      const S = window.__mon;
      const L = game.level;
      const b = L.monsters.find((m) => m.superUnique === 'Bishibosh' && !m.dead);
      if (!b) return { error: 'no Bishibosh' };
      // his search: the Fallen lying dead within his aip4 (raiseTarget). The nearest minion of his,
      // set down within half of it if it stands farther, so it lies inside it however he steps about
      const range = S.A.subtiles(S.A.param(b.def.row, b.difficulty, 'FallenShaman', 'raiseRange'));
      const f = L.monsters.filter((m) => m.leader === b && !m.dead).sort((x, y) => S.dist(x.pos, b.pos) - S.dist(y.pos, b.pos))[0];
      if (!f) return { error: 'no minion of Bishibosh' };
      if (S.dist(f.pos, b.pos) > 0.5 * range) {
        const spot = [...Array(16).keys()].map((k) => ({ x: b.pos.x + Math.sin((k / 16) * Math.PI * 2) * 0.4 * range, z: b.pos.z + Math.cos((k / 16) * Math.PI * 2) * 0.4 * range })).find((q) => L.monsterMap.circleClear(q.x, q.z, f.radius));
        if (!spot) return { error: `no spot for a minion within ${(0.5 * range).toFixed(1)} m of Bishibosh` };
        f.pos = { ...spot };
        f.prevPos = { ...spot };
        f.move = null;
        L.monstersMoved([f]);
      }
      // the hero off the corpse to be (nothing may stand on it as it gets up)
      if (![5, 4, 3].some((r) => S.beside(b, r, 5.2, (q) => S.dist(q, f.pos) >= 2))) return { error: 'no spot by Bishibosh' };
      for (const m of L.monstersNear(b.pos, 14)) m.awake = true;
      const off = S.dist(f.pos, b.pos);
      game.killMonster(f, 'phys');
      S.bb = { b, f, t0: game.time };
      return { range, off };
    });
    if (r.error) return expect(false, r.error);
    const up = await run(14, () => {
      const S = window.__mon;
      S.hold();
      return S.bb.f.dead ? null : { at: game.time - S.bb.t0 };
    });
    await frames();
    await shot('bishibosh-raised');
    expect(up, `Bishibosh didn't raise his fallen in 14 s (${r.off.toFixed(1)} m from him, his aip4 ${r.range.toFixed(1)} m)`);
    log(`  Bishibosh raised his fallen ${up ? up.at.toFixed(1) : '—'} s after it fell ${r.off.toFixed(1)} m from him (his aip4 ${r.range.toFixed(1)} m)`);
  };

  /** enchanted uniques: what each modifier does */
  const enchanted = async () => {
    // multiple shots (29) on a quill rat inside its aip1, cursed (7) on a fallen in its blow's reach,
    // an aura (Holy Freeze, on a 30) with the hero well inside its radius (Skills.txt ln12: 6 subtiles at level 1)
    const r2 = await ev(() => {
      const S = window.__mon;
      const L = game.level;
      if (!S.clearing(2, 4.4)) return { error: 'no clearing for the uniques' };
      const n = S.A.auraNumbers('Holy Freeze', 1);
      S.en = { ratAt: S.aipM('quillrat1', 'QuillRat', 'activate'), follow: -Infinity, multi: 0, amp: 0, chill: 0, chillFrom: null };
      S.en.rat = S.place('quillrat1', ...S.off(0.65 * S.en.ratAt, -30), 'unique', [29]);
      S.en.cur = S.place('fallen1', ...S.off(0.75 * S.blowAt('fallen1'), 0), 'unique', [7]);
      S.en.aura = S.place('fallen1', ...S.off(0.6 * n.radius, 225), 'unique', [30]);
      S.en.aura.aura = { skill: 'Holy Freeze', lvl: 1, n };
      if (!L.auras.includes(S.en.aura)) L.auras.push(S.en.aura);
      for (const m of [S.en.rat, S.en.cur, S.en.aura]) m.awake = true;
      // the hero bare, no defense and no block, so the cursed one's blows land at D2's 95 % cap and
      // the curse (three landed blows in four) comes within a few swings: not on the odds of a few
      S.en.bare = () => {
        const d = game.player.stats;
        d.def = 0;
        d.block = 0;
      };
      return { slow: n.slow, radius: n.radius, auraOff: S.dist(S.en.aura.pos, game.player.pos), ampFor: S.A.amplifyCurse(S.en.cur.level).seconds };
    });
    if (r2.error) return expect(false, r2.error);
    // 20 s of game time (the rat shoots about once in 3 s, quillRats), polled each step, the most
    // quills in flight at once counted; the rat backs off: the hero after it each 0.3 s (S.after),
    // the cursed one at their heels
    const SECS = 20;
    const poll = (shotTaken, t) => {
      const S = window.__mon;
      const E = S.en;
      const p = game.player;
      S.hold();
      E.bare();
      const r = E.rat;
      if (game.time - E.follow >= 0.3 - 1e-9) {
        E.follow = game.time;
        S.after(r, E.ratAt);
      }
      const spikes = game.level.projectiles.filter((x) => x.owner === r).length;
      E.multi = Math.max(E.multi, spikes);
      E.amp = Math.max(E.amp, p.ampTime);
      const chill = p.chillTime > 0 ? p.chillAmount : 0;
      if (chill > E.chill) {
        E.chill = chill;
        E.chillFrom = S.dist(E.aura.pos, p.pos);
      }
      if (!shotTaken && spikes >= 3) return { t };
      return shotTaken && E.multi >= 3 && E.amp > 0 && E.chill > 0 ? { t } : null;
    };
    const first = await run(SECS, poll, false, 1 / 60);
    await frames();
    await shot('multishot-cursed-aura');
    if (first) await run(SECS - first.t, poll, true, 1 / 60);
    const { multi, chill, chillFrom, ...got } = await ev(() => {
      const E = window.__mon.en;
      return { multi: E.multi, amp: E.amp, chill: E.chill, chillFrom: E.chillFrom };
    });
    let amp = got.amp;
    if (!amp) {
      // the hero went after the rat: now they stand by the cursed one, in its blow's reach, until a blow of its lands
      await ev(() => {
        const S = window.__mon;
        if (!S.en.cur.dead) S.beside(S.en.cur, 0.75 * S.blowAt('fallen1'), 4.4);
      });
      amp = (await run(30, () => (window.__mon.hold(), window.__mon.en.bare(), game.player.ampTime > 0 ? game.player.ampTime : null))) ?? 0;
    }
    // the hero's own defense and block again
    await ev(() => game.player.markDirty());
    expect(multi >= 3, `a multiple-shots quill rat had ${multi} quills in flight at most in ${SECS} s`);
    expect(amp > 0, `the cursed unique's blows never cursed the hero in ${SECS} s and 30 s more beside it`);
    expect(Math.abs(chill - r2.slow / 100) < 1e-9, `the Holy Freeze unique ${r2.auraOff.toFixed(2)} m off (its radius ${r2.radius.toFixed(2)} m) slowed the hero ${chill}, not ${r2.slow} %`);
    // lightning enchanted (17), struck: its charged bolts
    const r0 = await ev(() => {
      const S = window.__mon;
      S.clearing(2, 4.4);
      const l = S.place('fallen1', 2.2, 0, 'unique', [17]);
      l.awake = true;
      // a blow's damage as it lands, the hero's swing aside
      S.applyDamage(game, l, { phys: 1, fire: 0, cold: 0, light: 0, magic: 0, poison: 0, source: game.player, spell: true }, game.player.pos);
      return { bolts: game.level.projectiles.filter((x) => x.kind === 'chargedbolt').length };
    });
    await run(0.25);
    await frames();
    await shot('lightning-enchanted');
    expect(r0.bolts === 8, `a lightning-enchanted unique struck loosed ${r0.bolts} bolts`);
    // fire enchanted (9) and cold enchanted (18), killed: the burst and the frost ring
    const r1 = await ev(() => {
      const S = window.__mon;
      const L = game.level;
      const f = S.place('zombie1', -2.2, 0.6, 'unique', [9]);
      const c = S.place('zombie1', 0.4, 2.4, 'unique', [18]);
      const b0 = L.blasts.length;
      const p = game.player;
      p.life = p.stats.maxLife;
      game.killMonster(f, 'phys');
      game.killMonster(c, 'phys');
      return { blasts: L.blasts.length - b0, kinds: L.blasts.slice(b0).map((b) => b.kind) };
    });
    await run(0.45);
    await frames();
    await shot('fire-cold-enchanted-deaths');
    expect(r1.blasts === 2, `fire and cold enchanted deaths made ${r1.blasts} blasts`);
    log(`  enchanted: multiple shots ${multi} quills at once; cursed: Amplify Damage on the hero for ${amp.toFixed(1)} s (D2: ${r2.ampFor} s); Holy Freeze (radius ${r2.radius.toFixed(2)} m): the hero slowed ${(chill * 100).toFixed(0)} %${chillFrom === null ? '' : ` ${chillFrom.toFixed(2)} m from it`}; lightning's ${r0.bolts} charged bolts when struck; fire's and cold's deaths: ${r1.kinds.join(' and ')}`);
    facts.push('enchantments');
  };

  // ── Blood Moor and Cold Plains, on the overworld ──
  for (const [id, label] of [
    [MOOR, 'moor'],
    [PLAINS, 'plains'],
  ]) {
    await ev((id) => game.travelToArea(id), id);
    await page.waitForTimeout(600);
    await census(id);
    await fightEach(id, label);
  }
  await superShot('Bishibosh', 'bishibosh');
  await bishiboshRaise();
  // his fire enchantment passes to his fallen (xfer) but only he bursts as he dies (MonsterUnique.cpp:1052-1058)
  {
    const r = await ev(() => {
      const L = game.level;
      const b = L.monsters.find((m) => m.superUnique === 'Bishibosh' && !m.dead);
      const f = b && L.monsters.find((m) => m.leader === b && !m.dead && m.has(9));
      if (!b || !f) return { error: `Bishibosh ${!!b}, a fire-enchanted minion ${!!f}` };
      const n0 = L.blasts.length;
      game.killMonster(f, 'phys');
      const n1 = L.blasts.length;
      game.killMonster(b, 'phys');
      return { minion: n1 - n0, boss: L.blasts.length - n1 };
    });
    if (r.error) expect(false, r.error);
    else {
      expect(r.minion === 0 && r.boss === 1, `fire-enchanted deaths: a minion ${r.minion} burst(s), Bishibosh ${r.boss}`);
      log(`  fire enchanted: Bishibosh's minion ${r.minion} burst, Bishibosh ${r.boss}`);
    }
  }

  // ── each AI at work, in clearings: Cold Plains, then Blood Moor ──
  await lancerReach();
  await ev(() => game.travelToArea(2));
  await page.waitForTimeout(600);
  await fallenFlee();
  await shamanRaise();
  await quillRats();
  await packWake();
  await enchanted();

  // ── the west block: Blood Raven in the Burial Grounds, a foul crow nest in Stony Field ──
  await bloodRaven();
  await crowNest();

  // ── the Den of Evil ──
  await ev(() => {
    const L = game.level;
    const mouth = L.objects.find((o) => o.kind === 'stairs' && o.dest === 8);
    game.teleportWithin({ x: mouth.pos.x + mouth.inward.x * 2, z: mouth.pos.z + mouth.inward.z * 2 });
    game.interact(mouth);
  });
  await page.waitForTimeout(800);
  const den = await ev(() => game.area.id);
  expect(den === DEN, `went down into area ${den}`);
  await census(DEN);
  await fightEach(DEN, 'den');
  await superShot('Corpsefire', 'corpsefire');

  // ── the trial ground's bosses, a difficulty each ──
  for (const [floor, d, id] of [
    [4, 0, 'smith'],
    [8, 1, 'bloodraven'],
    [12, 2, 'andariel'],
  ]) {
    const r = await ev(
      ({ floor, d }) => {
        const S = window.__mon;
        game.enterTrial(floor, d);
        const L = game.level;
        const b = L.boss;
        if (!b) return { error: `no boss on floor ${floor}` };
        S.beside(b, 4, 5.2);
        b.awake = true;
        const others = L.monsters.filter((m) => m !== b);
        return {
          id: b.def.id,
          name: b.displayName,
          rank: b.rank,
          level: b.level,
          floorLevel: game.area.alvl[d],
          diff: L.difficulty,
          life: b.maxLife,
          model: b.def.model,
          levels: [...new Set(others.filter((m) => m.rank === 'normal').map((m) => m.level))],
          kinds: [...new Set(others.map((m) => m.def.id))],
        };
      },
      { floor, d },
    );
    if (r.error) {
      expect(false, r.error);
      continue;
    }
    log(`trial floor ${floor} (difficulty ${r.diff}, level ${r.floorLevel}): ${r.name} (${r.id}, ${r.rank}, the ${r.model} look) level ${r.level}, ${r.life} life; ${r.kinds.join(', ')} at ${r.levels.join(', ')}`);
    expect(r.id === id && r.diff === d, `floor ${floor}'s boss is ${r.id} in difficulty ${r.diff}`);
    expect(r.levels.every((l) => l === r.floorLevel), `floor ${floor}'s monsters at levels ${r.levels}, the floor's ${r.floorLevel}`);
    // what the boss does with the hero 4 m off for 6 s: its states, its missiles (most at once), its summons
    await ev(() => {
      const S = window.__mon;
      S.boss = { b: game.level.boss, states: new Set(), most: 0, shots: new Set(), summoned: 0 };
    });
    // 6 s of game time, polled each 0.1 s; the shot at its first attack from 0.5 s on
    const poll = (shotTaken, t) => {
      const S = window.__mon;
      const B = S.boss;
      S.hold();
      B.states.add(B.b.state);
      const mine = game.level.projectiles.filter((x) => x.owner === B.b);
      for (const x of mine) B.shots.add(x.id);
      B.most = Math.max(B.most, mine.length);
      // her Nest's zombies are no one's minions: her own count of them (Monster.aiTally)
      B.summoned = B.b.aiTally;
      return !shotTaken && t >= 0.5 - 1e-9 && (B.b.state === 'attack' || B.b.state === 'cast' || mine.length > 0) ? t : null;
    };
    const t1 = await run(6, poll, false);
    const shotTaken = t1 !== null;
    if (shotTaken) {
      await frames();
      await shot(`trial-${floor}-${id}`);
      await run(6 - t1, poll, true);
    }
    if (!shotTaken) await shot(`trial-${floor}-${id}`);
    const B = await ev(() => {
      const B = window.__mon.boss;
      return { states: [...B.states], shots: B.shots.size, most: B.most, summoned: B.summoned, d: window.__mon.dist(B.b.pos, game.player.pos) };
    });
    log(`  in 6 s: ${B.states.join(', ')}; ${B.shots} missiles (${B.most} at once), ${B.summoned} summoned; ${B.d.toFixed(1)} m off at the end`);
    expect(B.states.includes('attack') || B.states.includes('cast') || B.shots > 0, `${id} never attacked`);
  }

  if (errors.length) fails.push(...errors.slice(0, 8));
  log(fails.length ? `MONSTERS FAIL ${fails.join(' | ')}` : `MONSTERS OK ${facts.join(', ')}`);
}
