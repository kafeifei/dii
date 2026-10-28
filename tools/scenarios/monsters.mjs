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
// they die, multiple shots' three quills, the cursed one's Amplify Damage, an aura's.
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
    /** the hero beside a monster, `r` from it where they can see each other, the camera close */
    S.beside = (m, r, zoom) => {
      const p = game.player;
      const map = game.level.map;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const spot = { x: m.pos.x + Math.sin(a) * r, z: m.pos.z + Math.cos(a) * r };
        if (!map.circleClear(spot.x, spot.z, 0.45) || !map.los(spot, m.pos) || game.level.inTown(spot)) continue;
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
      const r = await ev(
        ({ id, k }) => {
          const S = window.__mon;
          const L = game.level;
          const p = game.player;
          const m = L.monsters.filter((x) => !x.dead && x.rank === 'normal' && x.def.id === k && L.areaAt(x.pos.x, x.pos.z).id === id).sort((a, b) => S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos))[0];
          // in its blow's reach (a quill rat's, a shaman's shots: a little off), so the slow ones strike too
          if (!m || !S.beside(m, m.missile() ? 2.5 : 1.3, 3.4)) return { error: `no spot by a ${k}` };
          m.awake = true;
          // whatever it was about (a slow zombie's wander), it thinks again now
          m.move = null;
          m.thinkTimer = 0;
          S.foe = m;
          S.hurt0 = p.life;
          return { name: m.displayName, level: m.level, life: m.maxLife, ar: m.ar, def: m.defense, dmg: m.dmg, ai: m.def.row.ai, ranged: !!m.missile() };
        },
        { id, k },
      );
      if (r.error) {
        expect(false, r.error);
        continue;
      }
      // long enough for a blow or a shot to land, the hero striking back once it has (a fallen of
      // 1 life would fall to the first swing before it swung), or after 4 s if it is slow to start.
      // One that shoots is never struck first (a quill rat of 2–4 life dies to one swing) and is
      // kept near: each think in its aip1 it shoots at 35 % or backs off 2 subtiles each way, and
      // past its aip1 (3.3 m) it only wanders (AiThink.cpp:1077-1110), so the hero goes after it
      const seen = { attack: false };
      const tries = r.ranged ? 150 : 80;
      for (let i = 0; i < tries; i++) {
        await page.waitForTimeout(100);
        const s = await ev(({ back, follow }) => {
          const S = window.__mon;
          const m = S.foe;
          const p = game.player;
          if (back && !m.dead && p.state !== 'attack' && p.state !== 'cast') game.useSkillAt('attack', m, { ...m.pos }, true);
          if (follow && !m.dead && S.dist(m.pos, p.pos) > 2.6) S.beside(m, 2, 3.4);
          p.life = Math.max(p.life, p.stats.maxLife * 0.5);
          return { state: m.state, dead: m.dead, proj: game.level.projectiles.filter((x) => x.owner === m).length };
        }, { back: seen.attack || (!r.ranged && i >= 40), follow: r.ranged && !seen.attack && i % 3 === 2 });
        if (s.state === 'attack' || s.state === 'cast' || s.proj) seen.attack = true;
        if (seen.attack && i >= 8) break;
      }
      await frames();
      await shot(`${label}-${k}`);
      expect(seen.attack, `a ${k} never attacked the hero`);
      log(`  ${k} ${r.name}: level ${r.level}, ${r.life} life, defense ${r.def}, A1 ${r.dmg.join('–')} at ${r.ar}, fought as ${r.ai}${seen.attack ? '' : ' (no attack seen)'}`);
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
    await page.waitForTimeout(400);
    await frames();
    await shot(`${label}-pack`);
    await ev(() => {
      const S = window.__mon;
      for (const m of game.level.monstersNear(S.foe.pos, 12)) m.awake = true;
    });
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(100);
      await ev(() => {
        const p = game.player;
        p.life = Math.max(p.life, p.stats.maxLife * 0.5);
      });
    }
    await frames();
    await shot(`${label}-fight`);
    return true;
  };

  /** sim-time steps of the page's own frames: `ms` of waiting, the hero held, `poll` each 100 ms until it returns something */
  const watch = async (ms, poll) => {
    for (let t = 0; t < ms; t += 100) {
      await page.waitForTimeout(100);
      const r = await ev(poll ?? (() => (window.__mon.hold(), undefined)));
      if (r !== undefined && r !== null && r !== false) return r;
    }
    return null;
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
    await watch(1200);
    const k = await ev(() => {
      const S = window.__mon;
      const p = game.player;
      game.killMonster(S.fl.party[0], 'phys');
      S.fl.t0 = game.time;
      S.fl.d0 = S.fl.rest.map((m) => S.dist(m.pos, p.pos));
      S.fl.far = S.fl.d0.slice();
      return { awake: S.fl.rest.every((m) => m.awake), d0: S.fl.d0 };
    });
    let shotTaken = false;
    for (let t = 0; t < 2600; t += 100) {
      await page.waitForTimeout(100);
      await ev(() => {
        const S = window.__mon;
        S.hold();
        S.fl.rest.forEach((m, i) => (S.fl.far[i] = Math.max(S.fl.far[i], S.dist(m.pos, game.player.pos))));
      });
      if (!shotTaken && t >= 700) {
        await frames();
        await shot('fallen-flee');
        shotTaken = true;
      }
    }
    const fled = await ev(() => {
      const S = window.__mon;
      return { far: S.fl.far, flags: S.fl.rest.map((m) => m.aiFlag), n: S.fl.rest.filter((m, i) => S.fl.far[i] > S.fl.d0[i] + 1).length };
    });
    expect(fled.n >= 2, `only ${fled.n} of 3 fallen ran as one died`);
    // the hero comes on, 2.5 m short of them: back they come (D2 walks a Fallen at a hero within its aip2, or a leader's cry)
    await ev(() => {
      const S = window.__mon;
      const p = game.player;
      const r = S.fl.rest;
      const mid = { x: (r[0].pos.x + r[1].pos.x + r[2].pos.x) / 3, z: (r[0].pos.z + r[1].pos.z + r[2].pos.z) / 3 };
      const k = 2.5 / Math.max(2.5, S.dist(mid, p.pos));
      const to = { x: mid.x + (p.pos.x - mid.x) * k, z: mid.z + (p.pos.z - mid.z) * k };
      game.teleportWithin(game.level.map.nearestWalkable(to.x, to.z, 2) ?? to);
      S.fl.t1 = game.time;
    });
    const back = await watch(12000, () => {
      const S = window.__mon;
      S.hold();
      const m = S.fl.rest.find((x) => x.state === 'attack');
      if (m) return { after: game.time - S.fl.t1, flag: m.aiFlag };
      // not yet: the hero goes on, up to the nearest (a Fallen walks at a hero within its aip2, 10 subtiles)
      if (game.time - S.fl.t1 > 4 && !S.fl.closer) {
        S.fl.closer = true;
        const p = game.player;
        const n = S.fl.rest.filter((x) => !x.dead).sort((a, b) => S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos))[0];
        if (n) S.beside(n, 1.8, 5.2);
      }
      return null;
    });
    await frames();
    await shot('fallen-return');
    expect(back, 'the fallen never came back to strike');
    log(`  Fallen: one killed, ${fled.n}/3 ran (${k.d0.map((d, i) => `${d.toFixed(1)}→${fled.far[i].toFixed(1)} m`).join(', ')}), fright kept for the next blow: ${fled.flags.join('/')}; the hero came on, back and striking ${back ? back.after.toFixed(1) : '—'} s after`);
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
    await watch(800);
    await ev(() => {
      const S = window.__mon;
      // the hero a step off, so the fallen don't stand over the corpse
      game.teleportWithin({ x: game.player.pos.x - 1.5, z: game.player.pos.z });
      game.killMonster(S.sh.fs[0], 'phys');
      S.sh.t0 = game.time;
    });
    const casting = await watch(12000, () => {
      const S = window.__mon;
      S.hold();
      const s = S.sh.sh;
      if (s.state === 'cast' && s.act?.kind === 'raise') return { at: game.time - S.sh.t0, lying: S.sh.fs[0].deathTime };
      return S.sh.fs[0].dead ? null : { at: game.time - S.sh.t0, lying: -1 };
    });
    await frames();
    await shot('shaman-raising');
    const up = await watch(3000, () => (window.__mon.hold(), window.__mon.sh.fs[0].dead ? null : { at: game.time - window.__mon.sh.t0, noXp: window.__mon.sh.fs[0].noXp }));
    await watch(400);
    await frames();
    await shot('shaman-raised');
    expect(up?.noXp, `the shaman's fallen wasn't raised (${JSON.stringify(casting)})`);
    expect(!casting || casting.lying < 0 || casting.lying >= 1.7, `raised while still dying (${casting?.lying})`);
    log(`  Fallen Shaman: its fallen killed, the raise begun ${casting ? casting.at.toFixed(1) : '—'} s after (the corpse lying dead ${casting && casting.lying >= 0 ? casting.lying.toFixed(1) : '?'} s), up at ${up ? up.at.toFixed(1) : '—'} s with no experience to give`);
    facts.push('shaman raised');
  };

  /** quill rats 2.6 m off: their quills fly (A2, spike1 at its D2 speed) */
  const quillRats = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(2, 4.4)) return { error: 'no clearing for the quill rats' };
      S.rats = [S.place('quillrat1', 2.6, 0.6), S.place('quillrat1', 2.4, -1)];
      for (const r of S.rats) r.awake = true;
      S.ratShots = new Set();
      return { ok: true };
    });
    if (r0.error) return expect(false, r0.error);
    let shotTaken = false;
    for (let t = 0; t < 8000; t += 100) {
      await page.waitForTimeout(100);
      const n = await ev((follow) => {
        const S = window.__mon;
        S.hold();
        const p = game.player;
        // each think in their aip1 (10 subtiles, 3.3 m) they shoot at 35 % or back off; past it they
        // only wander (AiThink.cpp:1077-1110): the hero keeps after the nearer one, inside it
        const r = S.rats.filter((m) => !m.dead).sort((a, b) => S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos))[0];
        if (follow && r && S.dist(r.pos, p.pos) > 2.8) {
          const k = 2.2 / S.dist(r.pos, p.pos);
          const to = { x: r.pos.x + (p.pos.x - r.pos.x) * k, z: r.pos.z + (p.pos.z - r.pos.z) * k };
          if (game.level.map.circleClear(to.x, to.z, 0.45)) game.teleportWithin(to);
        }
        const live = game.level.projectiles.filter((x) => S.rats.includes(x.owner));
        for (const x of live) S.ratShots.add(x.id);
        return live.length;
      }, t % 300 === 0);
      if (n && !shotTaken) {
        await frames();
        await shot('quillrats-fire');
        shotTaken = true;
      }
    }
    const r = await ev(() => {
      const S = window.__mon;
      const sp = game.level.projectiles.find((x) => S.rats.includes(x.owner));
      return { shots: S.ratShots.size, d: S.rats.map((m) => S.dist(m.pos, game.player.pos).toFixed(1)), speed: sp ? Math.hypot(sp.vel.x, sp.vel.z) : null };
    });
    expect(r.shots > 0, 'the quill rats never shot');
    log(`  quill rats: ${r.shots} quills in 8 s (the hero after them as they back off), now ${r.d.join(' and ')} m off${r.speed ? `, flying ${r.speed.toFixed(2)} m/s` : ''}`);
    facts.push(`quills ${r.shots}`);
  };

  /** a pack wakes as one: its leader within notice range, a minion beyond it */
  const packWake = async () => {
    const r = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(2)) return { error: 'no clearing for the pack' };
      const pack = [];
      const lead = S.place('fallen1', 7, 0, 'normal', [], pack);
      const far = S.place('fallen1', 13, 0, 'normal', [], pack);
      far.follow(lead);
      S.pw = { lead, far, notice: S.A.subtiles(S.A.noticeRange(lead.def.row, 0)) };
      return { notice: S.pw.notice };
    });
    if (r.error) return expect(false, r.error);
    const woke = await watch(3000, () => {
      const S = window.__mon;
      S.hold();
      return S.pw.lead.awake ? { far: S.pw.far.awake, d: S.dist(S.pw.far.pos, game.player.pos) } : null;
    });
    expect(woke?.far, `the pack didn't wake as one (${JSON.stringify(woke)})`);
    log(`  a pack noticing the hero: its leader 7 m off (notice ${r.notice.toFixed(1)} m), its minion ${woke ? woke.d.toFixed(1) : '?'} m off woke with it: ${!!woke?.far}`);
  };

  /** the spearmaiden and the huntmaiden come on from 6 m: where each stands as it strikes */
  const lancerReach = async () => {
    const r0 = await ev(() => {
      const S = window.__mon;
      if (!S.clearing(3)) return { error: 'no clearing in Cold Plains' };
      S.lr = { lancer: S.place('cr_lancer1', 6, 0), hunter: S.place('corruptrogue1', -6, 0), at: {} };
      S.lr.lancer.awake = S.lr.hunter.awake = true;
      // their reaches' difference, centre to centre, where a walk at the hero stops (ai.ts heroReach, 0.9 of it)
      const reach = (m) => m.def.range + S.A.unitGap(m.def.row.meleeRng);
      return { more: 0.9 * (reach(S.lr.lancer) - reach(S.lr.hunter)) };
    });
    if (r0.error) return expect(false, r0.error);
    let shotTaken = false;
    for (let t = 0; t < 8000; t += 50) {
      await page.waitForTimeout(50);
      const s = await ev(() => {
        const S = window.__mon;
        S.hold();
        const p = game.player;
        for (const k of ['lancer', 'hunter']) {
          const m = S.lr[k];
          if (m.state === 'attack' && S.lr.at[k] === undefined) S.lr.at[k] = S.dist(m.pos, p.pos);
        }
        return { lancer: S.lr.at.lancer, hunter: S.lr.at.hunter, thrusting: S.lr.lancer.state === 'attack' };
      });
      if (s.thrusting && !shotTaken) {
        await frames();
        await shot('lancer-reach');
        shotTaken = true;
      }
      if (s.lancer !== undefined && s.hunter !== undefined && shotTaken) break;
    }
    const r = await ev(() => window.__mon.lr.at);
    expect(r.lancer !== undefined && r.hunter !== undefined && r.lancer > r.hunter + 0.6 * r0.more, `the spearmaiden struck from ${r.lancer?.toFixed(2)} m, the huntmaiden from ${r.hunter?.toFixed(2)} m (${r0.more.toFixed(2)} m more wanted)`);
    log(`  reach: the spearmaiden (MeleeRng 2) struck from ${r.lancer?.toFixed(2)} m, the huntmaiden from ${r.hunter?.toFixed(2)} m (D2's reach ${r0.more.toFixed(2)} m more)`);
  };

  /** Bishibosh raises a fallen of his once it lies dead (any Fallen within his aip4, a unique's search) */
  const bishiboshRaise = async () => {
    const r = await ev(() => {
      const S = window.__mon;
      const L = game.level;
      const b = L.monsters.find((m) => m.superUnique === 'Bishibosh' && !m.dead);
      const f = b && L.monsters.find((m) => m.leader === b && !m.dead);
      if (!b || !f) return { error: `Bishibosh ${!!b}, a minion ${!!f}` };
      if (![5, 4, 3].some((r) => S.beside(b, r, 5.2))) return { error: 'no spot by Bishibosh' };
      for (const m of L.monstersNear(b.pos, 14)) m.awake = true;
      game.killMonster(f, 'phys');
      S.bb = { b, f, t0: game.time };
      return { ok: true };
    });
    if (r.error) return expect(false, r.error);
    const up = await watch(14000, () => {
      const S = window.__mon;
      S.hold();
      return S.bb.f.dead ? null : { at: game.time - S.bb.t0 };
    });
    await frames();
    await shot('bishibosh-raised');
    expect(up, "Bishibosh didn't raise his fallen");
    log(`  Bishibosh raised his fallen ${up ? up.at.toFixed(1) : '—'} s after it fell`);
  };

  /** enchanted uniques: what each modifier does */
  const enchanted = async () => {
    // multiple shots (29) on a quill rat, cursed (7) on a fallen at the hero, an aura (Holy Freeze, on a 30)
    const r2 = await ev(() => {
      const S = window.__mon;
      const L = game.level;
      if (!S.clearing(2, 4.4)) return { error: 'no clearing for the uniques' };
      S.en = {};
      S.en.rat = S.place('quillrat1', 1.4, -0.8, 'unique', [29]);
      S.en.cur = S.place('fallen1', 1.0, 0, 'unique', [7]);
      S.en.aura = S.place('fallen1', -2.2, -2, 'unique', [30]);
      S.en.aura.aura = { skill: 'Holy Freeze', lvl: 1, n: S.A.auraNumbers('Holy Freeze', 1) };
      if (!L.auras.includes(S.en.aura)) L.auras.push(S.en.aura);
      for (const m of [S.en.rat, S.en.cur, S.en.aura]) m.awake = true;
      // the hero bare, no defense and no block, so the cursed one's blows land at D2's 95 % cap and
      // the curse (three landed blows in four) comes within a few swings: not on the odds of a few
      S.en.bare = () => {
        const d = game.player.stats;
        d.def = 0;
        d.block = 0;
      };
      return { slow: S.en.aura.aura.n.slow, ampFor: S.A.amplifyCurse(S.en.cur.level).seconds };
    });
    if (r2.error) return expect(false, r2.error);
    let multi = 0;
    let amp = 0;
    let chill = 0;
    let shotTaken = false;
    for (let t = 0; t < 14000; t += 100) {
      await page.waitForTimeout(100);
      const s = await ev((follow) => {
        const S = window.__mon;
        const p = game.player;
        S.hold();
        S.en.bare();
        // the rat backs off: the hero keeps near it, the cursed one at their heels
        const r = S.en.rat;
        if (follow && !r.dead && S.dist(r.pos, p.pos) > 2.4) {
          const k = 2 / S.dist(r.pos, p.pos);
          const to = { x: r.pos.x + (p.pos.x - r.pos.x) * k, z: r.pos.z + (p.pos.z - r.pos.z) * k };
          if (game.level.map.circleClear(to.x, to.z, 0.45)) game.teleportWithin(to);
        }
        const spikes = game.level.projectiles.filter((x) => x.owner === S.en.rat).length;
        return { spikes, amp: p.ampTime, chill: p.chillTime > 0 ? p.chillAmount : 0 };
      }, t % 1000 === 0);
      multi = Math.max(multi, s.spikes);
      amp = Math.max(amp, s.amp);
      chill = Math.max(chill, s.chill);
      if (s.spikes >= 3 && !shotTaken) {
        await frames();
        await shot('multishot-cursed-aura');
        shotTaken = true;
      }
      if (multi >= 3 && amp > 0 && chill > 0 && shotTaken) break;
    }
    if (!shotTaken) await shot('multishot-cursed-aura');
    if (!amp) {
      // the hero went after the rat: now they stand by the cursed one until a blow of its lands
      await ev(() => {
        const S = window.__mon;
        if (!S.en.cur.dead) S.beside(S.en.cur, 1.0, 4.4);
      });
      amp = (await watch(30000, () => (window.__mon.hold(), window.__mon.en.bare(), game.player.ampTime > 0 ? game.player.ampTime : null))) ?? 0;
    }
    // the hero's own defense and block again
    await ev(() => game.player.markDirty());
    expect(multi >= 3, `a multiple-shots quill rat had ${multi} quills in flight at most`);
    expect(amp > 0, "the cursed unique's blows never cursed the hero");
    expect(Math.abs(chill - r2.slow / 100) < 1e-9, `the Holy Freeze unique slowed the hero ${chill}, not ${r2.slow} %`);
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
    await page.waitForTimeout(250);
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
    await page.waitForTimeout(450);
    await frames();
    await shot('fire-cold-enchanted-deaths');
    expect(r1.blasts === 2, `fire and cold enchanted deaths made ${r1.blasts} blasts`);
    log(`  enchanted: multiple shots ${multi} quills at once; cursed: Amplify Damage on the hero for ${amp.toFixed(1)} s (D2: ${r2.ampFor} s); Holy Freeze: the hero slowed ${(chill * 100).toFixed(0)} %; lightning's ${r0.bolts} charged bolts when struck; fire's and cold's deaths: ${r1.kinds.join(' and ')}`);
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
    let shotTaken = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(100);
      const s = await ev(() => {
        const S = window.__mon;
        const B = S.boss;
        S.hold();
        B.states.add(B.b.state);
        const mine = game.level.projectiles.filter((x) => x.owner === B.b);
        for (const x of mine) B.shots.add(x.id);
        B.most = Math.max(B.most, mine.length);
        B.summoned = B.b.minions.filter((m) => m.noXp).length;
        return { attacking: B.b.state === 'attack' || B.b.state === 'cast' || mine.length > 0 };
      });
      if (s.attacking && !shotTaken && i >= 5) {
        await frames();
        await shot(`trial-${floor}-${id}`);
        shotTaken = true;
      }
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
