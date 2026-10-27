// Diablo II's monsters in play (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/monsters.mjs --url "http://localhost:5174/?dev" --out <dir>
// In ?dev, through Blood Moor and Cold Plains on the overworld and down into the Den of Evil: logs
// each area's kinds this game (Level.spawned) and what stands there by kind and rank, which must be
// of its levels.txt lists (mon, umon), what they bring and its superunique's group; then, with the
// hero kept alive (the debug panel's god mode), each kind up close fighting the hero, and Bishibosh
// and Corpsefire with their packs, before and after they wake; Bishibosh's fire-enchanted fallen die
// without his burst, he with it. Last the trial ground's floor bosses
// (floors 4, 8, 12: the Smith, Blood Raven, Andariel, in normal, nightmare and hell), each at the
// floor's level in the difficulty picked. Page and console errors fail the run.
// The last line is "MONSTERS OK <summary>" or "MONSTERS FAIL <reasons>".
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
          if (!m || !S.beside(m, m.def.ai === 'melee' ? 1.6 : 4, 3.4)) return { error: `no spot by a ${k}` };
          m.awake = true;
          S.foe = m;
          S.hurt0 = p.life;
          return { name: m.displayName, level: m.level, life: m.maxLife, ar: m.ar, def: m.defense, dmg: m.dmg, ai: m.def.ai };
        },
        { id, k },
      );
      if (r.error) {
        expect(false, r.error);
        continue;
      }
      // long enough for a blow or a shot to land, the hero striking back once it has (a fallen of
      // 1 life would fall to the first swing before it swung), or after 2 s if it is slow to start
      const seen = { attack: false };
      for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(100);
        const s = await ev((back) => {
          const m = window.__mon.foe;
          const p = game.player;
          if (back && !m.dead && p.state !== 'attack' && p.state !== 'cast') game.useSkillAt('attack', m, { ...m.pos }, true);
          p.life = Math.max(p.life, p.stats.maxLife * 0.5);
          return { state: m.state, dead: m.dead, proj: game.level.projectiles.filter((x) => x.owner === m).length };
        }, seen.attack || i >= 20);
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
      // the pack still: asleep where it spawned
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
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(100);
      await ev(() => {
        const p = game.player;
        p.life = Math.max(p.life, p.stats.maxLife * 0.5);
      });
    }
    await frames();
    await shot(`trial-${floor}-${id}`);
  }

  if (errors.length) fails.push(...errors.slice(0, 8));
  log(fails.length ? `MONSTERS FAIL ${fails.join(' | ')}` : `MONSTERS OK ${facts.join(', ')}`);
}
