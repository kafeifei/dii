// The west's dungeons as the player sees them (src/game/maps.ts DUNGEON_MAKERS, src/world/maze.ts):
//   node tools/play.mjs tools/scenarios/dungeons.mjs --url http://localhost:5183/ --dev --out <dir>
//   (and --w 844 --h 390 for a phone's screen, to judge how dark the caves are)
// Each of the Den of Evil, Cave Levels 1 and 2, the Crypt and the Mausoleum entered by the debug
// panel's way (Game.travelToArea): its own map, at its start by the way up; then a room further in
// and the boss's or the chest's room. A cave has no light of its own but the stairs' glow (no
// torches, no lit props: the renderer's static lights none), a crypt its torches. Monsters held still
// and the hero unhurt, so the shots show the place. Shots: <key>-start, <key>-in, <key>-far. The last
// line is "DUNGEONS OK …" or "DUNGEONS FAIL …".

const DUNGEONS = [8, 9, 13, 18, 19];

export default async function (page, shot, log) {
  const t0 = Date.now();
  const errors = [];
  const fails = [];
  const facts = [];
  let step = 'start';
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  const until = async (fn, arg, what, timeout = 5000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 50 });
    } catch {
      throw new Error(`timed out waiting for ${what}`);
    }
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 6) =>
    ev(
      (n) =>
        new Promise((r) => {
          let k = 0;
          const f = () => (++k >= n ? r() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
      n,
    );
  /** the "载入中…" veil gone and a few frames drawn */
  const settle = async () => {
    await until(() => !document.querySelector('.overlay.is-loading.open'), null, 'the loading veil to lift', 20000).catch(() => {});
    await frames(30);
  };

  const steps = {
    async load() {
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      const phone = await ev(async () => {
        (await import('/src/game/debug.ts')).debugOpts.god = true;
        // a phone-sized window (--w 844 --h 390) seen as a phone sees it: its closer view (renderer resize)
        const small = window.innerHeight < 500;
        if (small) window.renderer.setTouchView(true);
        return small;
      });
      if (phone) facts.push('as on a phone');
    },

    async dungeons() {
      for (const id of DUNGEONS) {
        const s = await ev((id) => {
          const ok = game.travelToArea(id);
          const L = game.level;
          const p = game.player;
          // the monsters held where they stand, so the shots are of the place
          for (const m of L.monsters) m.stunTime = 1e9;
          const up = L.objects.find((o) => o.kind === 'stairs' && (L.layout.entrances ?? []).some((e) => e.kind === 'up' && e.x === o.pos.x && e.z === o.pos.z));
          return { ok, area: game.area?.id, key: game.area?.key, name: game.area?.name, theme: L.layout.theme.key, torches: L.layout.torches.length, fromUp: up ? Math.hypot(p.pos.x - up.pos.x, p.pos.z - up.pos.z) : null };
        }, id);
        expect(s.ok && s.area === id, `the way to area ${id} went to ${s.area}`);
        expect(s.fromUp !== null && s.fromUp < 3.5, `${s.key}: the hero ${s.fromUp?.toFixed(1)} from its way up`);
        await settle();
        const lights = await ev(() => {
          const r = window.renderer;
          let n = 0;
          r.scenery?.lightsNear(0, 0, 1e5, () => n++);
          return n;
        });
        const cave = id === 8 || id === 9 || id === 13;
        if (cave) expect(s.torches === 0 && lights === 0, `${s.key}: ${s.torches} torches, ${lights} static lights in a cave`);
        else expect(s.torches > 0 && lights > 0, `${s.key}: ${s.torches} torches, ${lights} static lights in a crypt`);
        await shot(`${s.key}-start`);
        // a room further in, then the farthest one from the way in (the boss's or the chest's)
        const spots = await ev(() => {
          const L = game.level;
          const lay = L.layout;
          const mid = (r) => L.map.nearestWalkable(r.x + r.w / 2, r.y + r.h / 2);
          const fromStart = (q) => Math.hypot(q.x - lay.start.x, q.z - lay.start.z);
          const rooms = lay.rooms.map(mid).filter(Boolean).sort((a, b) => fromStart(a) - fromStart(b));
          // the spark chest (Cave Level 2's, the Mausoleum's), else the boss's room
          const spark = L.objects.find((o) => o.kind === 'chest' && o.sparkly);
          const boss = (lay.presets ?? []).find((r) => r.kind === 'boss');
          const far = spark ? L.map.nearestWalkable(spark.pos.x + 1.5, spark.pos.z + 1.5) : boss ? mid(boss.rect) : rooms.at(-1);
          return { in: rooms[Math.min(1, rooms.length - 1)], far };
        });
        for (const [k, at] of [['in', spots.in], ['far', spots.far]]) {
          if (!at) continue;
          await ev((at) => game.teleportWithin(at), at);
          await frames(40);
          await shot(`${s.key}-${k}`);
        }
        facts.push(`${s.name} (${s.theme}, ${s.torches} torches, ${lights} static lights)`);
      }
      await ev(() => game.travelToArea(1));
    },
  };

  for (const [name, fn] of Object.entries(steps)) {
    step = name;
    try {
      await fn();
    } catch (e) {
      fails.push(`${name}: ${e.message}`);
      break;
    }
  }
  for (const e of errors) fails.push(e);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(fails.length ? `DUNGEONS FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `DUNGEONS OK (${secs} s): ${facts.join('; ')}`);
}
