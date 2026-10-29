// The West overworld, where a game is played (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/overworld.mjs --url "http://localhost:5179/?dev&tod=0.5"
// Reloads with empty storage, then walks the hero out of the camp, through Blood Moor and into Cold
// Plains, hop by hop along found paths (Game.teleportWithin), and checks the areas are announced
// camp > Blood Moor > Cold Plains with no level rebuilt. Through each seam's opening the air turns
// from the one area's to the other's (src/render/arealooks.ts: half each at the opening, all one
// area past AIR_SEAM), the ground wears the three areas' looks, the minimap (by the next frame) and
// the music the hero's area names follow (the sound started with a click: its recorded track streaming, or with none
// shipped, its composed music), and stepping to and fro over a seam doesn't say the area's name again
// (src/ui/banner.ts). Then on from Cold Plains into Stony Field and the Burial Grounds, walked
// through their seams (each announced, the minimap naming it the next frame): Stony Field's cliffs
// along its north and west, the Underground Passage's mouth at the cliff's foot (used, it says it isn't
// open yet and goes nowhere), the Cairn Stones with Rakanishu in them, its waypoint lit and listed
// after Cold Plains'; the Burial Grounds' graveyard gate, the Mausoleum's and the Crypt's stairways
// (each taken down into its own map, the hero beside its way up, and back up beside the stairway it
// went down), Blood Raven the one monster with a quest; back to Cold Plains by waypoint. Then 30 s of sim
// by the camp's edge, a pack of Blood Moor's monsters woken just outside it: 10 s with the hero out
// there, 20 s with them just inside; no monster may ever stand on a camp tile. Page and console
// errors fail the run. Shots: the camp's palisade gate, the camp's seam, Blood Moor's seam with Cold
// Plains, Cold Plains' waypoint, Stony Field's seam, its cliff, the passage's mouth, the cairn, the
// graveyard's gate, inside the Mausoleum and the Crypt and back up at each one's stairway, and the
// camp's edge after the sim. The last line is "OVERWORLD OK …" or "OVERWORLD FAIL …".

/** the areas walked through, in order (src/world/areas.ts CAMP_AREA, WILD_AREA, COLD_PLAINS) */
const ROUTE = [1, 2, 3];
/** sim steps, as main.ts runs them */
const DT = 1 / 60;
/** seconds of sim with the hero outside the camp, then inside it */
const OUTSIDE = 10;
const INSIDE = 20;
/** monsters woken by the camp's edge for the sim */
const PACK = 25;
/** how far round the hero the air is the areas' (src/render/renderer.ts AIR_SEAM) */
const AIR_SEAM = 12;
/** the music each area names (src/audio/sounds.ts, by levels.json SoundEnv) */
const MUSIC = { 1: 'music.town', 2: 'music.wild', 3: 'music.wild' };
/** and the music composed in its place where it has no recording (src/audio/score.ts) */
const SCORE = { 1: 'town', 2: 'outdoor', 3: 'outdoor' };

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
  /** a few frames drawn, so the view has caught up before a shot */
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

  const steps = {
    async load() {
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      const s = await ev(async () => {
        const L = game.level;
        const ow = L.layout;
        const S = (window.__ow = { areas: [], levels: 0 });
        S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
        S.path = (await import('/src/world/pathfinding.ts')).findPath;
        // god mode, so the walk and the sim can't end in a respawn
        (await import('/src/game/debug.ts')).debugOpts.god = true;
        // the hooks take notes, then do what they do
        const h = game.hooks;
        const area = h.areaChanged.bind(h);
        const level = h.levelChanged.bind(h);
        h.areaChanged = (a, prev) => {
          S.areas.push(`${prev?.id ?? '-'}>${a.id}`);
          area(a, prev);
        };
        h.levelChanged = (l) => {
          S.levels++;
          level(l);
        };
        S.west = L;
        return {
          seamless: Array.isArray(ow.seams) && !!ow.areaOf,
          depth: L.depth,
          area: game.area?.id,
          town: L.inTown(game.player.pos),
          monsters: L.monsters.length,
          inCamp: L.monsters.filter((m) => L.inTown(m.pos)).length,
          size: `${L.map.w}x${L.map.h}`,
          seed: ow.seed,
        };
      });
      expect(s.seamless, 'the level is not the overworld');
      expect(s.area === ROUTE[0] && s.town, `started in area ${s.area}, in town ${s.town}`);
      expect(s.inCamp === 0, `${s.inCamp} monster(s) in the camp at the start`);
      facts.push(`seed ${s.seed}, ${s.size}, ${s.monsters} monsters`);
      await frames();
      await shot('camp-start');
      // the sound on, as a player's first click starts it: the music then follows the hero
      await page.mouse.click(640, 400);
      await until(() => game.sfx.ctx?.state === 'running' && game.sfx.music, null, 'the sound to start');
    },

    async walk() {
      // the legs: the camp's start to its seam, across Blood Moor to Cold Plains' seam, on to its waypoint
      const plan = await ev(() => {
        const L = game.level;
        const ow = L.layout;
        const seam = (a, b) => {
          const s = ow.seams.find((x) => x.a === a && x.b === b);
          if (s) return s;
          const r = ow.seams.find((x) => x.a === b && x.b === a);
          return r && { a, b, ta: r.tb, tb: r.ta };
        };
        const gate = seam(1, 2);
        const moor = seam(2, 3);
        const wp = L.objects.find((o) => o.kind === 'waypoint' && L.areaAt(o.pos.x, o.pos.z).id === 3);
        window.__ow.gate = gate;
        window.__ow.moor = moor;
        window.__ow.wp = wp;
        return { gate: !!gate, moor: !!moor, wp: !!wp };
      });
      if (!expect(plan.gate && plan.moor && plan.wp, `seams camp/moor ${plan.gate}, moor/plains ${plan.moor}, Cold Plains waypoint ${plan.wp}`)) return;

      /** walk one leg: a path found on the hero's map, hopped along a tile at a time */
      const leg = (to, what) =>
        ev(
          ({ to, what }) => {
            const S = window.__ow;
            const L = game.level;
            const p = game.player;
            const path = S.path(L.map, p.pos, to, 400000, 0.3);
            if (!path) return { error: `no path ${what}` };
            let hops = 0;
            const trail = [];
            for (const pt of path) {
              const d = S.dist(p.pos, pt);
              const n = Math.max(1, Math.ceil(d));
              const from = { ...p.pos };
              for (let k = 1; k <= n; k++) {
                const at = { x: from.x + ((pt.x - from.x) * k) / n, z: from.z + ((pt.z - from.z) * k) / n };
                game.teleportWithin(at);
                hops++;
                trail.push({ ...p.pos, area: L.areaAt(p.pos.x, p.pos.z).id });
              }
            }
            S.trail = (S.trail ?? []).concat(trail);
            return { hops, end: S.dist(p.pos, to), area: game.area.id, same: game.level === S.west };
          },
          { to, what },
        );
      const go = async (to, what) => {
        const r = await leg(to, what);
        if (r.error) throw new Error(r.error);
        expect(r.end < 1.5 && r.same, `${what}: ended ${r.end.toFixed(1)} from the spot, same level ${r.same}`);
        return r;
      };

      // to the camp's seam; the palisade gate is the path's point 26 tiles short of it (overworld.ts)
      const g = await ev(() => window.__ow.gate);
      await go(g.ta, 'to the camp seam');
      const gateSpot = await ev(() => {
        const S = window.__ow;
        const pts = S.trail.filter((t) => t.area === 1);
        let best = pts[0];
        for (const t of pts) if (Math.abs(S.dist(t, S.gate.ta) - 26) < Math.abs(S.dist(best, S.gate.ta) - 26)) best = t;
        return { x: best.x, z: best.z };
      });
      await ev((at) => game.teleportWithin(at), gateSpot);
      await frames();
      await shot('palisade-gate');
      await ev((at) => game.teleportWithin(at), g.ta);
      await frames();
      await shot('camp-seam');
      const m = await ev(() => window.__ow.moor);
      await go(g.tb, 'out of the camp');
      await go(m.ta, 'across Blood Moor');
      await frames();
      await shot('moor-plains-seam');
      await go(m.tb, 'into Cold Plains');
      const wp = await ev(() => {
        const o = window.__ow.wp;
        return game.level.map.nearestWalkable(o.pos.x + o.radius + 1.2, o.pos.z + 0.6) ?? o.pos;
      });
      await go(wp, "to Cold Plains' waypoint");
      await frames();
      await shot('coldplains-waypoint');

      const s = await ev(() => {
        const S = window.__ow;
        const trailAreas = [];
        for (const t of S.trail) if (trailAreas.at(-1) !== t.area) trailAreas.push(t.area);
        return { areas: S.areas.slice(), levels: S.levels, trail: trailAreas, hops: S.trail.length, area: game.area.id, west: game.level === S.west };
      });
      expect(s.areas.join(' ') === '1>2 2>3', `areaChanged fired ${s.areas.join(' ') || 'nothing'}, expected 1>2 2>3`);
      expect(s.trail.join('>') === ROUTE.join('>'), `the walk went through areas ${s.trail.join('>')}`);
      expect(s.levels === 0 && s.west, `${s.levels} levelChanged on the walk, same level ${s.west}`);
      facts.push(`walked ${s.hops} hops, areas ${s.areas.join(' ')}`);
    },

    async seams() {
      const air = [];
      const mist = {};
      for (const [s, what] of [
        [await ev(() => window.__ow.gate), 'camp|moor'],
        [await ev(() => window.__ow.moor), 'moor|plains'],
      ]) {
        const dir = { x: Math.sign(Math.round(s.tb.x - s.ta.x)), z: Math.sign(Math.round(s.tb.z - s.ta.z)) };
        const mid = { x: (s.ta.x + s.tb.x) / 2, z: (s.ta.z + s.tb.z) / 2 };
        for (const k of [-AIR_SEAM - 2, 0, AIR_SEAM + 2]) {
          const at = { x: mid.x + dir.x * k, z: mid.z + dir.z * k };
          await ev((at) => game.teleportWithin(game.level.map.nearestWalkable(at.x, at.z) ?? at), at);
          // the minimap names the area the hero lands in on the next frame, not at its next draw (5 a second)
          await frames(1);
          const minimap = await ev(() => document.querySelector('#minimap .lvl')?.textContent);
          // a few frames for the renderer's air
          await frames(3);
          const r = await ev(() => ({
            area: game.area.id,
            label: game.area.label ?? game.area.name,
            shares: renderer.airShares.map((x) => ({ area: x.area, w: x.w })),
            mist: renderer.atmos.mist.opacity,
            music: game.sfx.playing.music,
            // what plays: the stream's file, or the composed music's kind
            track: game.sfx.music?.el?.getAttribute('src')?.split('/').pop() ?? game.sfx.music?.kind ?? null,
            files: game.sfx.files[game.sfx.playing.music]?.files ?? null,
            sfx: game.sfx.area === game.area,
          }));
          const share = (a) => r.shares.find((x) => x.area === a)?.w ?? 0;
          const want = k < 0 ? s.a : k > 0 ? s.b : null;
          if (want !== null) {
            expect(r.area === want && share(want) > 0.98, `${what} ${k} tiles on: area ${r.area}, the air ${JSON.stringify(r.shares)}`);
            mist[want] = r.mist;
          } else {
            expect(share(s.a) >= 0.25 && share(s.b) >= 0.25, `${what} at the opening the air is ${JSON.stringify(r.shares)}`);
            air.push(`${what} ${share(s.a).toFixed(2)}/${share(s.b).toFixed(2)}`);
          }
          expect(minimap === r.label, `${what} ${k} tiles on, the next frame the minimap says ${minimap}, not ${r.label}`);
          expect(r.sfx && r.music === MUSIC[r.area], `${what} ${k} tiles on the sound names ${r.music} for area ${r.area} (Sfx's area is the hero's: ${r.sfx})`);
          const plays = r.files ? r.files.includes(r.track) : r.track === SCORE[r.area];
          expect(plays, `${what} ${k} tiles on ${r.track ?? 'nothing'} plays, not ${r.files ? r.files.join(' or ') : `the ${SCORE[r.area]} music composed`}`);
        }
      }
      expect(mist[1] < mist[2] && mist[2] < mist[3], `the mist camp ${mist[1]}, moor ${mist[2]}, plains ${mist[3]}`);
      // to and fro over Blood Moor's seam with Cold Plains, walked (no jump): its name isn't said again
      const d = await ev(() => {
        const S = window.__ow;
        const p = game.player;
        const banner = document.getElementById('area-banner');
        const shown = () => +(banner.dataset.shown ?? 0);
        game.teleportWithin(S.moor.ta);
        const before = shown();
        const areas = [];
        for (let k = 0; k < 6; k++) {
          const at = k % 2 ? S.moor.ta : S.moor.tb;
          p.pos = { ...at };
          p.prevPos = { ...at };
          game.updateArea();
          areas.push(game.area.id);
        }
        const said = shown() - before;
        // and back into Cold Plains to stay, as the walk left it
        game.teleportWithin(S.moor.tb);
        const key = renderer.ground?.mesh.material.customProgramCacheKey() ?? '';
        return { areas: areas.join(''), said, key, shown: shown() };
      });
      expect(d.areas === '323232' && d.said === 0, `to and fro over the seam (areas ${d.areas}) said the name ${d.said} more time(s)`);
      expect(d.key.startsWith('ground-5-'), `the ground's shader is ${d.key}, not one of five looks (the camp, Blood Moor, Cold Plains, Stony Field, the Burial Grounds)`);
      facts.push(`air at the openings ${air.join(', ')}; mist ${[1, 2, 3].map((a) => mist[a].toFixed(2)).join('/')}; ${d.shown} names said`);
      await frames();
      await shot('coldplains-seam');
    },

    async west() {
      // ── on from Cold Plains into Stony Field and the Burial Grounds, walked through their seams ──
      const plan = await ev(() => {
        const ow = game.level.layout;
        const seam = (a, b) => {
          const s = ow.seams.find((x) => x.a === a && x.b === b);
          if (s) return s;
          const r = ow.seams.find((x) => x.a === b && x.b === a);
          return r && { a, b, ta: r.tb, tb: r.ta };
        };
        const S = window.__ow;
        S.stonySeam = seam(3, 4);
        S.barrowSeam = seam(3, 17);
        S.areas.length = 0;
        return { stony: !!S.stonySeam, barrow: !!S.barrowSeam, cliffs: ow.cliffs?.size ?? 0 };
      });
      if (!expect(plan.stony && plan.barrow && plan.cliffs > 0, `seams to Stony Field ${plan.stony}, the Burial Grounds ${plan.barrow}, ${plan.cliffs} cliff tiles`)) return;
      /** a path found on the hero's map, hopped along a tile at a time (as the walk above) */
      const go = async (to, what) => {
        const r = await ev(
          ({ to, what }) => {
            const S = window.__ow;
            const L = game.level;
            const p = game.player;
            const path = S.path(L.map, p.pos, to, 600000, 0.3);
            if (!path) return { error: `no path ${what}` };
            for (const pt of path) {
              const n = Math.max(1, Math.ceil(S.dist(p.pos, pt)));
              const from = { ...p.pos };
              for (let k = 1; k <= n; k++) game.teleportWithin({ x: from.x + ((pt.x - from.x) * k) / n, z: from.z + ((pt.z - from.z) * k) / n });
            }
            return { end: S.dist(p.pos, to), same: game.level === S.west };
          },
          { to, what },
        );
        if (r.error) throw new Error(r.error);
        expect(r.end < 1.5 && r.same, `${what}: ended ${r.end.toFixed(1)} from the spot, same level ${r.same}`);
      };
      const label = () => ev(() => ({ minimap: document.querySelector('#minimap .lvl')?.textContent, label: game.area.label ?? game.area.name, area: game.area.id }));
      /** a step in front of the way down into area `dest` */
      const before = (dest) =>
        ev((dest) => {
          const o = game.level.objects.find((x) => x.kind === 'stairs' && x.dest === dest);
          return o && game.level.map.nearestWalkable(o.pos.x + o.inward.x * 2.2, o.pos.z + o.inward.z * 2.2);
        }, dest);
      /** that way used twice: closed, one message that it isn't open, nowhere gone */
      const useClosed = (dest) =>
        ev((dest) => {
          const o = game.level.objects.find((x) => x.kind === 'stairs' && x.dest === dest);
          const said = [];
          const h = game.hooks;
          const msg = h.message;
          h.message = (t, ...r) => (said.push(t), msg.call(h, t, ...r));
          const area = game.area.id;
          game.interact(o);
          game.interact(o);
          h.message = msg;
          return { said, closed: !!o.closed, name: o.name, stayed: game.level === window.__ow.west && game.area.id === area };
        }, dest);
      // the message names where it goes, as the way's own name does (areas.ts defines the Underground Passage for it)
      const closedOk = (u, what) => expect(u.closed && u.stayed && u.said.length === 1 && u.said[0] === `${u.name}的路还没有开通`, `${what} (${u.name}): closed ${u.closed}, said ${u.said.join(' / ') || 'nothing'}, stayed ${u.stayed}`);

      // Stony Field: in through its seam, the minimap naming it the next frame
      const s = await ev(() => window.__ow.stonySeam);
      await go(s.ta, 'to the Stony Field seam');
      await go(s.tb, 'into Stony Field');
      await frames(1);
      let l = await label();
      expect(l.area === 4 && l.minimap === l.label, `in Stony Field: area ${l.area}, the minimap says ${l.minimap}, not ${l.label}`);
      await frames();
      await shot('stony-seam');
      // the foot of its cliff, the north side's middle (else the west's)
      const cliff = await ev(() => {
        const L = game.level;
        const b = L.layout.boxes.find((x) => x.area === 4);
        for (const [x0, z0, dx, dz] of [[b.x + b.w / 2, b.z, 0, 1], [b.x, b.z + b.h / 2, 1, 0]]) {
          for (let k = 3; k < 20; k++) {
            const p = { x: Math.floor(x0 + dx * k) + 0.5, z: Math.floor(z0 + dz * k) + 0.5 };
            if (L.layout.cliffs.has(Math.floor(p.z - dz) * L.map.w + Math.floor(p.x - dx)) && L.map.walkableAt(p.x, p.z)) return L.map.nearestWalkable(p.x + dx * 2.5, p.z + dz * 2.5);
          }
        }
        return null;
      });
      if (expect(cliff, "no ground at the foot of Stony Field's cliff")) {
        await go(cliff, "to the foot of Stony Field's cliff");
        await frames();
        await shot('stony-cliff');
      }
      // the Underground Passage's mouth in the cliff: closed
      const mouth = await before(10);
      if (expect(mouth, 'no way to the Underground Passage')) {
        await go(mouth, "to the Underground Passage's mouth");
        closedOk(await useClosed(10), "the Underground Passage's mouth");
        await frames();
        await shot('stony-passage-mouth');
      }
      // the Cairn Stones, Rakanishu among them
      const cairn = await ev(() => {
        const L = game.level;
        const c = L.layout.cairn;
        const rak = L.monsters.find((m) => m.superUnique === 'Rakanishu');
        return c && { at: L.map.nearestWalkable(c.center.x + 2, c.center.z + 4), stones: c.stones.length, rak: rak ? window.__ow.dist(rak.pos, c.center) : null, name: rak?.displayName };
      });
      if (expect(cairn && cairn.stones === 5 && cairn.rak !== null && cairn.rak < 2, `the cairn ${JSON.stringify(cairn)}`)) {
        await go(cairn.at, 'to the Cairn Stones');
        await frames();
        await shot('stony-cairn');
      }
      // its waypoint lit, listed after Cold Plains'
      const wp = await ev(() => {
        const L = game.level;
        const o = L.objects.find((x) => x.kind === 'waypoint' && L.areaAt(x.pos.x, x.pos.z).id === 4);
        if (!o) return null;
        game.teleportWithin(L.map.nearestWalkable(o.pos.x + 1.2, o.pos.z + 0.6));
        // its panel isn't wanted here: the hook notes it instead of opening it
        const h = game.hooks;
        const open = h.openPanel;
        const panels = [];
        h.openPanel = (k) => panels.push(k);
        game.interact(o);
        h.openPanel = open;
        return { waypoints: game.player.waypoints.slice(), panels };
      });
      expect(wp && wp.waypoints[0] === 1 && wp.waypoints.at(-1) === 4 && wp.panels.join() === 'waypoint', `Stony Field's waypoint: the hero's waypoints ${wp?.waypoints.join()}, panels ${wp?.panels.join()}`);

      // the Burial Grounds: back to Cold Plains by waypoint, walked in through the seam
      await ev(() => game.travel(3));
      const b = await ev(() => window.__ow.barrowSeam);
      await go(b.ta, 'to the Burial Grounds seam');
      await go(b.tb, 'into the Burial Grounds');
      await frames(1);
      l = await label();
      expect(l.area === 17 && l.minimap === l.label, `in the Burial Grounds: area ${l.area}, the minimap says ${l.minimap}, not ${l.label}`);
      const gate = await ev(() => {
        const S = window.__ow;
        const t = S.barrowSeam.tb;
        const d = { x: Math.sign(Math.round(t.x - S.barrowSeam.ta.x)), z: Math.sign(Math.round(t.z - S.barrowSeam.ta.z)) };
        return game.level.map.nearestWalkable(t.x + d.x * 6, t.z + d.z * 6);
      });
      await go(gate, "to the graveyard's gate");
      await frames();
      await shot('barrow-gate');
      // the Mausoleum and the Crypt: down each stairway into its own map, the hero beside its way up;
      // up again, beside the stairway they went down (not the other), on the overworld as it was
      for (const [dest, name] of [[19, 'barrow-mausoleum'], [18, 'barrow-crypt']]) {
        const to = await before(dest);
        if (!expect(to, `no way into area ${dest}`)) continue;
        await go(to, `to the way into area ${dest}`);
        const down = await ev((dest) => {
          const S = window.__ow;
          const o = game.level.objects.find((x) => x.kind === 'stairs' && x.dest === dest);
          game.interact(o);
          const up = game.level.objects.find((x) => x.kind === 'stairs' && x.dest === 17);
          return { area: game.area.id, own: game.level !== S.west, open: !o.closed, d: up ? S.dist(game.player.pos, up.pos) : null };
        }, dest);
        expect(down.open && down.area === dest && down.own && down.d !== null && down.d < 3.5, `down the way into area ${dest}: in area ${down.area}, its own map ${down.own}, ${down.d?.toFixed(1)} from its way up`);
        await frames();
        await shot(`${name}-under`);
        const back = await ev((dest) => {
          const S = window.__ow;
          game.interact(game.level.objects.find((x) => x.kind === 'stairs' && x.dest === 17));
          const ways = game.level.objects.filter((x) => x.kind === 'stairs' && (x.dest === 18 || x.dest === 19));
          const d = (x) => S.dist(game.player.pos, x.pos);
          const mine = ways.find((x) => x.dest === dest);
          return { area: game.area.id, same: game.level === S.west, d: mine ? d(mine) : null, nearest: !!mine && ways.every((x) => x === mine || d(x) > d(mine)) };
        }, dest);
        expect(back.area === 17 && back.same && back.d !== null && back.d < 3.5 && back.nearest, `back up from area ${dest}: in area ${back.area}, the overworld ${back.same}, ${back.d?.toFixed(1)} from its stairway, nearer it than the other ${back.nearest}`);
        await frames();
        await shot(name);
      }
      const quested = await ev(() => {
        const L = game.level;
        return L.monsters.filter((m) => m.quest).map((m) => ({ id: m.def.id, quest: m.quest, area: L.areaAt(m.pos.x, m.pos.z).id }));
      });
      expect(quested.length === 1 && quested[0].id === 'bloodraven' && quested[0].quest === 'a1q2' && quested[0].area === 17, `the monsters with a quest: ${JSON.stringify(quested)}`);
      const r = await ev(() => ({ areas: window.__ow.areas.slice(), levels: window.__ow.levels }));
      // over the seams, then down and up each stairway, a map each way
      expect(r.areas.join(' ') === '3>4 4>3 3>17 17>19 19>17 17>18 18>17' && r.levels === 4, `areaChanged fired ${r.areas.join(' ')}, ${r.levels} levelChanged`);
      facts.push(`west block: ${plan.cliffs} cliff tiles, ${cairn?.name} at the cairn, areas ${r.areas.join(' ')}`);
      // back to Cold Plains' waypoint, where the sim's walk out starts; the sim counts its own levelChanged
      await ev(() => {
        game.travel(3);
        window.__ow.levels = 0;
      });
    },

    async sim() {
      const r = await ev(
        ({ DT, OUTSIDE, INSIDE, PACK }) => {
          const S = window.__ow;
          const L = game.level;
          const mm = L.monsterMap;
          const p = game.player;
          const { ta, tb } = S.gate;
          const out = { x: tb.x - ta.x, z: tb.z - ta.z };
          const len = Math.hypot(out.x, out.z) || 1;
          out.x /= len;
          out.z /= len;
          const side = { x: -out.z, z: out.x };
          S.areas.length = 0;
          // the hero 4 tiles out past the camp's seam, in Blood Moor
          game.teleportWithin({ x: tb.x + out.x * 4, z: tb.z + out.z * 4 });
          // a pack of Blood Moor's monsters woken around them, between 2 and 9 tiles out
          const moor = L.monsters.filter((m) => !m.dead && L.areaAt(m.pos.x, m.pos.z).id === 2).sort((a, b) => S.dist(a.pos, tb) - S.dist(b.pos, tb));
          let placed = 0;
          for (const m of moor.slice(0, PACK * 3)) {
            if (placed >= PACK) break;
            for (let k = 0; k < 30; k++) {
              const a = 2 + Math.random() * 7;
              const b = (Math.random() - 0.5) * 12;
              const c = { x: tb.x + out.x * a + side.x * b, z: tb.z + out.z * a + side.z * b };
              if (!mm.circleClear(c.x, c.z, m.radius) || L.inTown(c)) continue;
              m.pos = { ...c };
              m.prevPos = { ...c };
              m.awake = true;
              m.path = null;
              placed++;
              break;
            }
          }
          const was = game.headless;
          game.headless = true;
          const times = [];
          let worst = 0;
          let worstAt = '';
          let projInTown = 0;
          let hitInTown = 0;
          let swingsInTown = 0;
          const steps = (secs, phase) => {
            for (let k = 0; k < secs / DT; k++) {
              const life = p.life;
              const t = performance.now();
              game.update(DT);
              times.push(performance.now() - t);
              const n = L.monsters.filter((m) => L.inTown(m.pos)).length;
              if (n > worst) {
                worst = n;
                worstAt = `${phase} ${(k * DT).toFixed(1)} s`;
              }
              if (L.projectiles.some((pr) => pr.faction === 'monster' && L.inTown(pr.pos))) projInTown++;
              if (L.inTown(p.pos) && L.monsters.some((m) => !m.dead && (m.state === 'attack' || m.state === 'charge') && S.dist(m.pos, p.pos) < 3)) swingsInTown++;
              if (L.inTown(p.pos) && p.life < life) hitInTown++;
            }
          };
          steps(OUTSIDE, 'outside');
          const near = L.monsters.filter((m) => !m.dead && S.dist(m.pos, tb) < 10).length;
          // into the camp, on the tile at its edge
          game.teleportWithin(ta);
          steps(INSIDE, 'inside');
          game.headless = was;
          const alive = L.monsters.filter((m) => !m.dead);
          const atEdge = alive.filter((m) => S.dist(m.pos, ta) < 4).length;
          const awayHome = alive.filter((m) => m.awake && S.dist(m.pos, m.homePos) > 2 && S.dist(m.pos, ta) < 30).length;
          times.sort((a, b) => a - b);
          const pct = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
          return {
            placed,
            near,
            worst,
            worstAt,
            inCamp: L.monsters.filter((m) => L.inTown(m.pos)).length,
            atEdge,
            awayHome,
            projInTown,
            hitInTown,
            swingsInTown,
            heroInTown: L.inTown(p.pos),
            dead: p.dead,
            levels: S.levels,
            areas: S.areas.slice(),
            mean: times.reduce((a, b) => a + b, 0) / times.length,
            p50: pct(0.5),
            p95: pct(0.95),
            max: times.at(-1),
          };
        },
        { DT, OUTSIDE, INSIDE, PACK },
      );
      expect(r.placed >= PACK * 0.8, `only ${r.placed} monsters put by the camp's edge`);
      expect(r.worst === 0 && r.inCamp === 0, `${r.worst} monster(s) in the camp at worst (${r.worstAt}), ${r.inCamp} at the end`);
      expect(r.heroInTown && !r.dead, `the hero ended in town ${r.heroInTown}, dead ${r.dead}`);
      expect(r.levels === 0, `${r.levels} levelChanged during the sim`);
      // from Cold Plains' waypoint to Blood Moor by the camp, then into it
      expect(r.areas.join(' ') === '3>2 2>1', `areaChanged in the sim fired ${r.areas.join(' ')}`);
      facts.push(
        `sim: ${r.placed} woken, ${r.near} by the edge after ${OUTSIDE} s outside, ${r.atEdge} within 4 of the hero after ${INSIDE} s inside, ${r.awayHome} awake and off home; ${r.worst} ever in the camp; monster missiles in the camp on ${r.projInTown} step(s), swings by the hero in town on ${r.swingsInTown}, hero hurt in town on ${r.hitInTown}`,
      );
      facts.push(`step ${r.mean.toFixed(2)} ms mean, p50 ${r.p50.toFixed(2)}, p95 ${r.p95.toFixed(2)}, max ${r.max.toFixed(1)}`);
      await frames();
      await shot('camp-edge-after-sim');
    },
  };

  try {
    for (const [name, fn] of Object.entries(steps)) {
      step = name;
      await fn();
    }
    step = 'end';
  } catch (e) {
    fails.push(`${step}: ${String(e.message ?? e).split('\n')[0]}`);
  }
  await page.waitForTimeout(100);
  const errs = [...new Set(errors)];
  if (errs.length) fails.push(`${errs.length} page error(s): ${errs.slice(0, 5).join(' | ')}`);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(fails.length ? `OVERWORLD FAIL ${fails.join('; ')} (${secs} s); ${facts.join('; ')}` : `OVERWORLD OK ${facts.join('; ')} in ${secs} s`);
}
