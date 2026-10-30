// The Den of Evil from Akara's first word to her reward, as Diablo II plays it (src/game/quests,
// D2MOO A1Q1.cpp), through the real UI (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/quests.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage, and clicks once so the game has sound. In the camp the merchant (亚喀蕾,
// Akara's counterpart) has the yellow mark of quest news, and what she'd say next is fetched ahead
// (her quest's first words, her greetings and farewells: fetched, not decoded). On a slow connection
// from then on (about Chrome's "3G": 1.6 Mbps, 300 ms), spoken to, she gives the quest in a scrolling
// line, said in her voice from its start as it scrolls (the text by the voice's clock, as long as its
// take runs; no greeting before a quest's word), and 跳过 cuts both short; then her menu: 交谈 has her
// remind the hero, its recording held back a few seconds as a slow connection would: its text
// scrolls on at its pace without it, and when it comes it joins the text where that has got to (what
// is heard matched against the take, at the text's clock); spoken to again mid-line, or Esc, cuts it
// short, voice and all; 取消 leaves her with a farewell and the log says to find the den. Clicked
// again at once she says nothing, nor bids a second farewell; walked off and back, she greets the hero
// and bids farewell each visit, never in the take heard last, beside the hero's own lines (a line of
// the hero's goes on under her greeting, and the hero may speak over it); her trade opened from her
// menu brings no farewell, until it's shut. Each take is listened to where it leaves its voice for
// the sound bus: as loud as a line is while it plays, and silent a moment after it's cut. Out of
// the camp (the record's LEAVETOWN), into the
// den (ENTERAREA, the log's "clear it"), its D2 monsters (Corpsefire and his pack among them) killed
// through the game until five or fewer are left (the log counts them; kills out on the moor say
// nothing of it), Corpsefire last, holding it up alone, then him: the quest is done
// (its message, the record's reward pending) and the den lights up. Back in the camp she is marked
// again; spoken to, she hands over the reward (+1 skill point) once and never again, aloud, her
// small talk too. The quest log
// shows it done. With the den rewarded, Kashya (柯霞) is marked: she offers the Sisters' Burial
// Grounds (D2MOO A1Q2.cpp) in a line that scrolls unvoiced (to be recorded at M2a's close), her menu
// 交谈/雇佣/取消, her hire panel shut to a hero under level 8 till the reward; out to the Burial
// Grounds (ENTERAREA, the hero's line for the graveyard), Blood Raven killed with the hero two of
// D2's rooms off counts for nothing (the log and a message say so), a reload brings her back, and
// killed from a room on her diagonal she is done; back at Kashya her reward is a hireling for
// nothing, once, beside the hero, her hire panel open whatever the level. Saved and played again
// both stay done, and nightmare's record is untouched. Page and console errors fail the run. Shots:
// the mark, the dialogue, the menu, her reminder scrolling while its recording is held back, the
// log, the log counting, the den dark and lit, the mark for the reward, the reward line, the log
// done; Kashya marked, her hire panel before, her quest given, the log; Blood Raven, the log after
// the far kill, her fallen; Kashya marked for the reward, her reward line, the hireling beside the
// hero, the hire panel after, the log done; the nightmare log. The last line is "QUESTS OK …" or
// "QUESTS FAIL …".

/** src/world/areas.ts */
const CAMP_AREA = 1;
const DEN_OF_EVIL = 8;
/** src/game/quests/record.ts QFLAG */
const F = { REWARDGRANTED: 0, REWARDPENDING: 1, STARTED: 2, LEAVETOWN: 3, ENTERAREA: 4, UPDATEQUESTLOG: 12, PRIMARYGOALDONE: 13, COMPLETEDNOW: 14 };
/** src/audio/sfx.ts: how long a townsperson's text waits for its recording to be decoded */
const SPEECH_WAIT = 0.25;
/** her reminder's take, held back a while as a slow connection would */
const HELD = 'voice.akara.a1q1_remind.1.m4a';
/** about Chrome's "3G" */
const SLOW = { offline: false, latency: 300, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 };

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
  /** the connection slow (SLOW, the cache off), or as it was */
  let cdp = null;
  const slow = async (on) => {
    cdp ??= await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: on });
    await cdp.send('Network.emulateNetworkConditions', on ? SLOW : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  };
  /** her reminder's take held back until release() */
  let release = () => {};
  const held = new Promise((r) => (release = r));
  await page.route(`**/audio/${HELD}`, async (route) => {
    await held;
    await route.continue();
  });
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

  /** the page's helpers (after a load) */
  const helpers = () =>
    ev(async (flags) => {
      const S = (window.__q = { F: flags });
      S.debug = (await import('/src/game/debug.ts')).debugOpts;
      S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      /** the Den of Evil's word in difficulty d (the one played) */
      S.word = (d = game.player.difficulty) => game.player.quests[d].a1q1 ?? 0;
      S.has = (f, d) => ((S.word(d) >> f) & 1) === 1;
      S.den = () => game.quests.script('a1q1');
      S.akara = () => game.level.objects.find((o) => o.npcId === 'akara');
      /** the hero stood beside Akara, toward the camera, so her mark and her menu are in view */
      S.toAkara = () => {
        const a = S.akara();
        game.teleportWithin(game.level.map.nearestWalkable(a.pos.x + 1.6, a.pos.z + 1.6));
        return a;
      };
      /** a walkable spot in area `id` about `far` tiles from where its seam with `from` opens, toward `to` */
      S.spotIn = (id, from, to, far) => {
        const L = game.level;
        const seam = (a, b) => L.layout.seams.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        const s1 = seam(from, id);
        const s2 = seam(id, to);
        const p1 = s1.a === id ? s1.ta : s1.tb;
        const p2 = s2.a === id ? s2.ta : s2.tb;
        const t = Math.min(0.9, far / S.dist(p1, p2));
        return L.map.nearestWalkable(p1.x + (p2.x - p1.x) * t, p1.z + (p2.z - p1.z) * t);
      };
      S.alive = () => game.level.monsters.filter((m) => !m.dead);
      // the Sisters' Burial Grounds (a1q2): its word, Kashya, the Burial Grounds' Blood Raven, D2's rooms there
      S.sword = (d = game.player.difficulty) => game.player.quests[d].a1q2 ?? 0;
      S.shas = (f, d) => ((S.sword(d) >> f) & 1) === 1;
      S.sis = () => game.quests.script('a1q2');
      S.kashya = () => game.level.objects.find((o) => o.npcId === 'kashya');
      S.toKashya = () => {
        const k = S.kashya();
        game.teleportWithin(game.level.map.nearestWalkable(k.pos.x + 1.6, k.pos.z + 1.6));
        return k;
      };
      const merc = await import('/src/game/merc.ts');
      const sisters = await import('/src/game/quests/sisters.ts');
      S.mayHire = () => merc.mayHireNow(game);
      S.mercName = (st) => merc.mercName(st);
      S.ravens = () => (game.mapOf(17)?.monsters ?? []).filter((m) => m.def.row.id === 'bloodraven');
      S.raven = () => S.ravens().find((m) => m.quest === 'a1q2' && !m.dead);
      S.corner = () => {
        const L = game.mapOf(17);
        let x = Infinity;
        let z = Infinity;
        L.areas.forEach((id, i) => {
          if (id !== 17) return;
          x = Math.min(x, i % L.map.w);
          z = Math.min(z, Math.floor(i / L.map.w));
        });
        return { x, z };
      };
      S.roomOf = (q, c) => [Math.floor((q.x - c.x) / sisters.ROOM_M), Math.floor((q.z - c.z) / sisters.ROOM_M)];
      /** the hero set down in the Burial Grounds `d` rooms off `m`'s (the first of `ds` with ground to stand on); null if none */
      S.standOff = (m, ds) => {
        const L = game.mapOf(17);
        const c = S.corner();
        const [rx, rz] = S.roomOf(m.pos, c);
        for (const d of ds) {
          for (let i = 0; i < L.areas.length; i++) {
            const x = i % L.map.w;
            const z = Math.floor(i / L.map.w);
            if (L.areas[i] !== 17 || !L.map.walkable(x, z)) continue;
            const q = { x: x + 0.5, z: z + 0.5 };
            const [hx, hz] = S.roomOf(q, c);
            if (hx - rx !== d[0] || hz - rz !== d[1]) continue;
            game.teleportWithin(q);
            const [px, pz] = S.roomOf(game.player.pos, c);
            if (game.area.id === 17 && px - rx === d[0] && pz - rz === d[1]) return d.join();
          }
        }
        return null;
      };
      S.ui = () => ({ talking: !!document.querySelector('.dialogue.open'), menu: !!document.querySelector('.npc-menu.open'), text: document.querySelector('.dialogue.open .dlg-text')?.textContent ?? '', opts: [...document.querySelectorAll('.npc-menu.open .npc-opt')].map((e) => e.textContent) });
      S.messages = () => [...document.querySelectorAll('#messages div')].map((e) => e.textContent).join(' | ');
      /** every message put up since, as the HUD's own list drops them as they fade */
      S.said = [];
      const message = game.hooks.message.bind(game.hooks);
      game.hooks.message = (t, c, d) => {
        S.said.push(t);
        message(t, c, d);
      };
      /** the quest log's HUD button lit with news */
      S.logNews = () => [...document.querySelectorAll('.hbtn.notify')].some((b) => b.textContent.startsWith('任'));
      S.debug.god = true;
      /** the townsperson's panel (src/ui/npc.ts): game.hooks is the UI */
      S.npc = game.hooks.npc;
      /** what she said aloud, as each started: the line, its take's file and buffer, where in it it started, its voice and an ear on it */
      S.spoken = [];
      /** how long each file took to decode, ms */
      S.decoded = {};
      /** once the game has sound: each take she says noted, and listened to where it goes into the sound bus */
      S.listen = () => {
        const sfx = game.sfx;
        const fileOf = new WeakMap();
        const decode = sfx.buffers.decode;
        sfx.buffers.decode = async (u, mono) => {
          const b = await decode(u, mono);
          fileOf.set(b, u.split('/').pop());
          return b;
        };
        // decoding alone, timed (the bytes fetched ahead, or come over the network, are in by then)
        const decodeAudio = sfx.ctx.decodeAudioData.bind(sfx.ctx);
        const urlOf = new WeakMap();
        const bytes = sfx.bytes.bind(sfx);
        sfx.bytes = (u) => bytes(u).then((b) => (urlOf.set(b, u), b));
        sfx.ctx.decodeAudioData = async (data) => {
          const u = (urlOf.get(data) ?? '?').split('/').pop();
          const t = performance.now();
          const b = await decodeAudio(data);
          S.decoded[u] = Math.round(performance.now() - t);
          return b;
        };
        const sound = sfx.sound.bind(sfx);
        sfx.sound = (id, def, opts, take) => {
          const v = sound(id, def, opts, take);
          if (v && id.startsWith('voice.akara.')) {
            const an = sfx.ctx.createAnalyser();
            an.fftSize = 4096;
            v.tail.connect(an);
            S.spoken.push({ id, file: take ? fileOf.get(take.buf) : null, buf: take?.buf, lead: take?.lead ?? 0, v, an, at: performance.now() });
          }
          return v;
        };
      };
      /**
       * Where in its take `x` is heard now: the last 4096 samples on its way to the sound bus found in
       * the take, near `near` s in; with the speech's clock and the text's at that moment
       */
      S.where = (x, near) => {
        const d = new Float32Array(x.an.fftSize);
        x.an.getFloatTimeDomainData(d);
        const now = game.sfx.ctx.currentTime;
        const s = S.npc.speech;
        const clock = { el: s?.elapsed() ?? -1, t: S.npc.t };
        const ch = x.buf.getChannelData(0);
        const rate = x.buf.sampleRate;
        const n = d.length;
        let e1 = 0;
        for (let i = 0; i < n; i += 2) e1 += d[i] * d[i];
        let best = -2;
        let at = 0;
        const lo = Math.max(0, Math.round((near - 0.5) * rate) - n);
        const hi = Math.min(ch.length - n, Math.round((near + 0.5) * rate) - n);
        for (let k = lo; k <= hi; k += 2) {
          let sum = 0;
          let e2 = 0;
          for (let i = 0; i < n; i += 2) {
            sum += d[i] * ch[k + i];
            e2 += ch[k + i] * ch[k + i];
          }
          const c = sum / Math.sqrt(e1 * e2 + 1e-12);
          if (c > best) {
            best = c;
            at = (k + n) / rate;
          }
        }
        // where the take should be by its voice's start (Sfx.sound starts it 5 ms on, at x.lead)
        const want = x.lead + (now - x.v.start - 0.005);
        return { at: +at.toFixed(3), want: +want.toFixed(3), corr: +best.toFixed(2), ...clock };
      };
      /** the hero's lines sounding now: their ids and when each is to end */
      S.heroSaying = () => game.sfx.voices.filter((v) => /^voice\.(paladin|sorceress)\./.test(v.id) && v.end > game.sfx.ctx.currentTime).map((v) => ({ id: v.id, end: v.end }));
      const d = new Float32Array(4096);
      /** a take's level as it goes into the sound bus, over its last 4096 samples, dB */
      S.level = (x) => {
        x.an.getFloatTimeDomainData(d);
        let s = 0;
        for (const y of d) s += y * y;
        return 10 * Math.log10(s / d.length + 1e-12);
      };
      /** the loudest any of `xs` is over `ms`, in 50 ms steps */
      S.loudest = async (xs, ms = 400) => {
        let top = -120;
        for (let t = 0; t < ms; t += 50) {
          for (const x of xs) top = Math.max(top, S.level(x));
          await new Promise((r) => setTimeout(r, 50));
        }
        return +top.toFixed(1);
      };
      /** her lines sounding now */
      S.saying = () => S.spoken.filter((x) => x.v.end > game.sfx.ctx.currentTime).map((x) => x.id);
      /** what she has said since the `n`th: the lines, and their takes */
      S.since = (n) => S.spoken.slice(n).map((x) => `${x.id}:${x.file}`);
    }, F);
  /** a line of hers sounding, with its voice heard on the sound bus, and how it goes with its text */
  const hearing = async (id) => {
    await until((id) => window.__q.saying().includes(id), id, `her voice saying ${id}`, 3000);
    return ev(async (id) => {
      const S = window.__q;
      const x = S.spoken.findLast((x) => x.id === id);
      const loud = await S.loudest([x], 500);
      return { loud, file: x.file, secs: +(x.v.end - x.v.start).toFixed(2), dur: +S.npc.dur.toFixed(2), t: +S.npc.t.toFixed(2), said: +(S.npc.speech?.elapsed() ?? -1).toFixed(2), joined: S.npc.speech?.joined ?? null, after: Math.round(x.at - (S.asked ?? x.at)), decoded: S.decoded[x.file] ?? null };
    }, id);
  };
  /** none of her lines sounding, all of them silent */
  const hushed = () =>
    ev(async () => {
      const S = window.__q;
      await new Promise((r) => setTimeout(r, 250));
      return { saying: S.saying(), loud: await S.loudest(S.spoken, 200) };
    });
  /** a line heard is at least this loud going into the sound bus (a take at -18 LUFS, at NPC_LINE), silence under the other */
  const HEARD_DB = -50;
  const SILENT_DB = -75;
  /** the takes of her farewells, in turn */
  const farewells = [];
  /** the quest log opened with its key, its cells' states and the detail's words */
  const openLog = async () => {
    await page.keyboard.press('l');
    // read as first drawn: a quest done since the log was last open flares in that drawing only
    await until(() => !!document.querySelector('.panel.left.open .qgrid'), null, 'the quest log');
    const l = await ev(() => ({
      cells: [...document.querySelectorAll('.panel.left.open .qcell')].map((c) => `${c.dataset.quest}:${[...c.classList].filter((k) => k !== 'qcell').join('.')}`),
      state: document.querySelector('.panel.left.open .qstate')?.textContent,
      text: document.querySelector('.panel.left.open .qtext')?.textContent,
    }));
    await frames(3);
    return l;
  };
  const closeLog = async () => {
    await page.keyboard.press('l');
    await until(() => !document.querySelector('.panel.left.open'), null, 'the quest log to close');
  };
  const pick = (label) => page.locator('.npc-menu.open .npc-opt', { hasText: label }).click();

  const steps = {
    async load() {
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      await helpers();
      // a click lets the game's sound start (the hero walks a step toward it)
      await page.mouse.click(200, 160);
      await until(() => window.game.sfx.ctx?.state === 'running', null, 'the sound to start');
      await ev(() => window.__q.listen());
      const s = await ev(() => {
        const S = window.__q;
        S.west = game.level;
        const a = S.akara();
        return { name: a?.name, npc: a?.npc, news: game.quests.hasNews('akara'), word: S.word(), log: game.quests.log('a1q1').state, area: game.area?.id };
      });
      expect(s.area === CAMP_AREA, `started in area ${s.area}`);
      expect(s.npc === '亚喀蕾' && s.name === '商人 · 亚喀蕾', `the merchant is ${s.npc} (${s.name})`);
      expect(s.news && s.word === 0 && s.log === 'none', `a new hero: news ${s.news}, word ${s.word}, log ${s.log}`);
    },

    async mark() {
      await ev(() => window.__q.toAkara());
      await frames(12);
      const m = await ev(() => {
        const el = document.querySelector('.npc-mark');
        const r = el?.getBoundingClientRect();
        const a = window.__q.akara();
        const s = window.renderer.projectP(a.pos, 1);
        return r ? { x: r.left, y: r.top, ax: s.x, ay: s.y, w: innerWidth, h: innerHeight } : null;
      });
      expect(m && m.x > 0 && m.x < m.w && m.y > 0 && m.y < m.ay && Math.abs(m.x - m.ax) < 30, `the mark over Akara: ${JSON.stringify(m)}`);
      await shot('akara-marked');
    },

    async talk() {
      // fetched ahead since the hero came into the camp, not decoded: her first words, her greetings and farewells
      const ahead = await ev(async () => {
        const s = game.sfx;
        const out = {};
        for (const [u, p] of s.ahead) out[u.split('/').pop()] = (await p).byteLength;
        const intro = '/audio/voice.akara.a1q1_intro.1.m4a';
        return { files: out, decoded: s.buffers.has(intro) };
      });
      const files = Object.keys(ahead.files);
      const wanted = ['voice.akara.a1q1_intro.1.m4a', ...[1, 2, 3].flatMap((n) => [`voice.akara.greeting.${n}.m4a`, `voice.akara.farewell.${n}.m4a`])];
      expect(wanted.every((f) => ahead.files[f] > 10000) && !ahead.decoded, `fetched ahead in the camp: ${JSON.stringify(ahead)}`);
      // a slow connection from here on
      await slow(true);
      // spoken to: she gives the quest at once, scrolling up
      await ev(() => {
        window.__q.asked = performance.now();
        game.interact(window.__q.akara());
      });
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her line');
      // in her voice from its start, the text going by it: as long as the take runs, where it has got to
      const voice = await hearing('voice.akara.a1q1_intro');
      expect(voice.loud > HEARD_DB, `her voice isn't heard: ${JSON.stringify(voice)}`);
      expect(voice.file === 'voice.akara.a1q1_intro.1.m4a' && voice.dur > 20 && Math.abs(voice.secs - voice.dur) < 0.05 && Math.abs(voice.t - voice.said) < 0.15, `her line doesn't go with her voice: ${JSON.stringify(voice)}`);
      expect(voice.joined === 0 && voice.after < SPEECH_WAIT * 1000, `on a slow connection her first words weren't heard from their start: ${JSON.stringify(voice)}`);
      facts.push(`on a slow connection: fetched ahead ${files.length} takes (the intro ${Math.round(ahead.files['voice.akara.a1q1_intro.1.m4a'] / 1024)} KB), the intro decoded in ${voice.decoded} ms and heard from its start ${voice.after} ms after she was spoken to`);
      expect(!(await ev(() => window.__q.since(0).some((s) => s.includes('greeting')))), "she greeted the hero before the quest's word");
      await page.waitForTimeout(2000);
      const said = await ev(() => window.__q.ui());
      expect(said.talking && !said.menu && said.text.includes('邪秽巢穴') && said.text.includes('血沼荒原'), `her first words: ${JSON.stringify(said)}`);
      expect(!said.text.includes('艾莉娜') && !said.text.includes('阿卡拉'), 'an old or official name in her line');
      await shot('akara-gives-the-quest');
      const pos = await ev(() => document.querySelector('.dlg-text').style.transform);
      expect(/translateY\(-?\d+px\)/.test(pos), `the line doesn't scroll (${pos})`);
      await page.locator('.dialogue .dlg-skip').click();
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after the line');
      const cut = await hushed();
      expect(!cut.saying.length && cut.loud < SILENT_DB, `cut short, her voice goes on: ${JSON.stringify(cut)}`);
      facts.push(`her voice: the intro's take ${voice.dur} s, the text by it (${voice.t} s at ${voice.said}), heard at ${voice.loud} dB, cut to ${cut.loud} dB`);
      const after = await ev(() => {
        const S = window.__q;
        return { ui: S.ui(), started: S.has(S.F.STARTED), state: S.den().state, news: game.quests.hasNews('akara'), mark: !!document.querySelector('.npc-mark') };
      });
      expect(after.started && after.state === 2, `cut short, the quest isn't given: started ${after.started}, state ${after.state}`);
      expect(!after.news && !after.mark, `her mark stays: news ${after.news}, mark ${after.mark}`);
      expect(after.ui.opts.join('/') === '交谈/交易／修理/取消', `her menu: ${after.ui.opts.join('/')}`);
      await frames(4);
      await shot('akara-menu');
      // 交谈: she reminds the hero, its recording held back (a slow connection): the text scrolls on at its pace without it
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reminder');
      const remind = await ev(() => window.__q.ui().text);
      expect(remind.includes('营门'), `her reminder: ${remind}`);
      await page.waitForTimeout(2500);
      const waiting = await ev(() => {
        const S = window.__q;
        const s = S.npc.speech;
        return { saying: S.saying(), held: game.sfx.ahead.has('/audio/voice.akara.a1q1_remind.1.m4a'), secs: s?.secs, dur: S.npc.dur, joined: s?.joined, el: +(s?.elapsed() ?? -1).toFixed(2), t: +S.npc.t.toFixed(2), at: document.querySelector('.dlg-text').style.transform };
      });
      expect(waiting.held && !waiting.saying.length && waiting.joined === null && waiting.secs > 9 && waiting.dur === waiting.secs && waiting.el > 2 && Math.abs(waiting.t - waiting.el) < 0.1, `her reminder's text without its recording: ${JSON.stringify(waiting)}`);
      await shot('akara-reminder-held-back');
      // let it come: it joins the text where that has got to, and is heard there
      release();
      const joined = await ev(async () => {
        const s = window.__q.npc.speech;
        const t0 = performance.now();
        while (s.joined === null && !s.stopped && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 10));
        return { joined: s.joined, el: s.elapsed(), stopped: s.stopped };
      });
      expect(joined.joined > 2 && Math.abs(joined.joined - joined.el) < 0.08, `her reminder come late didn't join its text where it had got to: ${JSON.stringify(joined)}`);
      await page.waitForTimeout(900);
      const sync = await ev(() => {
        const S = window.__q;
        const x = S.spoken.findLast((x) => x.id === 'voice.akara.a1q1_remind');
        const lead = x.lead - S.npc.speech.joined;
        const w = S.where(x, lead + S.npc.speech.elapsed());
        return { ...w, lead: +lead.toFixed(3), loud: +S.level(x).toFixed(1) };
      });
      // what's heard is where the text's clock is: the take at its lead plus the clock
      expect(sync.corr > 0.8 && Math.abs(sync.at - sync.want) < 0.03 && Math.abs(sync.at - (sync.lead + sync.el)) < 0.06 && Math.abs(sync.t - sync.el) < 0.1 && sync.loud > HEARD_DB, `her reminder joined late isn't heard where its text is: ${JSON.stringify(sync)}`);
      facts.push(`her reminder held back 2.5 s: joined ${joined.joined.toFixed(2)} s in, heard at ${sync.at} s of its take with the text's clock at ${sync.el.toFixed(2)} (+${sync.lead} s lead), matched at ${sync.corr}`);
      await slow(false);
      await page.waitForTimeout(300);
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu, spoken to mid-line');
      const recut = await ev(() => ({ ui: window.__q.ui(), at: document.querySelector('.npc-menu.open').style.transform }));
      expect(!recut.ui.talking && recut.ui.opts.length === 3 && /translate\(\d+px, \d+px\)/.test(recut.at), `spoken to mid-line: ${JSON.stringify(recut)}`);
      const stopped = await hushed();
      expect(!stopped.saying.length && stopped.loud < SILENT_DB, `spoken to mid-line, her voice goes on: ${JSON.stringify(stopped)}`);
      // again, and Esc cuts it short
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reminder again');
      await hearing('voice.akara.a1q1_remind');
      await page.keyboard.press('Escape');
      await until(() => !!document.querySelector('.npc-menu.open') && !document.querySelector('.dialogue.open'), null, 'her menu after Esc');
      const escaped = await hushed();
      expect(!escaped.saying.length && escaped.loud < SILENT_DB, `Esc, and her voice goes on: ${JSON.stringify(escaped)}`);
      // 取消: she's left, with a farewell, and the log says to find the den
      await pick('取消');
      await until(() => !document.querySelector('.npc-menu.open'), null, 'her menu to close');
      const bye = await hearing('voice.akara.farewell');
      expect(bye.loud > HEARD_DB, `her farewell isn't heard: ${JSON.stringify(bye)}`);
      farewells.push(bye.file);
      const left = await ev(() => window.__q.den().last);
      expect(left === 1, `the log's status after leaving her: ${left}`);
    },

    async visits() {
      // clicked again at once, the same visit: no greeting; left again: no second farewell
      await page.waitForTimeout(2500);
      const n = await ev(() => window.__q.spoken.length);
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu, at once again');
      await page.waitForTimeout(700);
      await pick('取消');
      await page.waitForTimeout(700);
      const again = await ev((n) => window.__q.since(n), n);
      expect(!again.length, `clicked again at once, she said ${again.join(' ')}`);
      // walked off and back four times: a greeting and a farewell each visit, never the take heard last;
      // the first time with a line of the hero's going on, which her greeting doesn't cut off, the
      // second with the hero speaking over her greeting
      const greetings = [];
      const beside = [];
      for (let k = 0; k < 4; k++) {
        await ev(() => {
          const a = window.__q.akara();
          game.teleportWithin(game.level.map.nearestWalkable(a.pos.x - 9, a.pos.z + 9));
        });
        await frames(6);
        const off = await ev(() => ({ far: window.__q.dist(game.player.pos, window.__q.akara().pos), area: game.area?.id }));
        await ev(() => window.__q.toAkara());
        await frames(3);
        if (k === 0) {
          await page.waitForTimeout(1500);
          await ev(() => game.say('shrine'));
          await until(() => window.__q.heroSaying().length > 0, null, "the hero's line", 4000);
        }
        const hero = await ev(() => window.__q.heroSaying());
        await ev(() => game.interact(window.__q.akara()));
        if (k === 1) await ev(() => game.say('waypoint'));
        if (k < 2) {
          // as soon as her greeting is heard (the hero's lines run under 2 s)
          await until(() => window.__q.saying().includes('voice.akara.greeting'), null, 'her greeting', 3000);
          if (k === 1) await until(() => window.__q.heroSaying().length > 0, null, 'the hero speaking over her greeting', 1500).catch(() => {});
          const both = await ev(() => ({ hero: window.__q.heroSaying(), her: window.__q.saying() }));
          if (k === 0) {
            const same = both.hero.length === 1 && hero.length === 1 && both.hero[0].id === hero[0].id && Math.abs(both.hero[0].end - hero[0].end) < 1e-6;
            expect(same, `her greeting cut off the hero's line: ${JSON.stringify({ before: hero, after: both.hero })}`);
            beside.push(`the hero's ${hero[0]?.id.split('.').pop()} went on under her greeting`);
          } else {
            expect(both.hero.length === 1 && both.her.includes('voice.akara.greeting'), `the hero kept from speaking over her greeting: ${JSON.stringify(both)}`);
            beside.push(`the hero's ${both.hero[0]?.id.split('.').pop()} said over it`);
          }
        }
        const hi = await hearing('voice.akara.greeting');
        expect(hi.loud > HEARD_DB && off.far > 9 && off.area === CAMP_AREA, `visit ${k + 1} (from ${off.far.toFixed(1)} m off, in area ${off.area}): her greeting ${JSON.stringify(hi)}`);
        greetings.push(hi.file);
        await until(() => !window.__q.saying().length, null, 'her greeting to end', 4000);
        await pick('取消');
        farewells.push((await hearing('voice.akara.farewell')).file);
        await until(() => !window.__q.saying().length, null, 'her farewell to end', 4000);
      }
      const twice = (xs) => xs.some((x, i) => i > 0 && x === xs[i - 1]);
      expect(!twice(greetings) && !twice(farewells) && greetings.every(Boolean) && farewells.length === 5 && farewells.every(Boolean), `four visits' greetings ${greetings.join(' ')}, five farewells ${farewells.join(' ')}`);
      // her trade, opened from her menu: no farewell; shut, she bids one
      await ev(() => {
        const a = window.__q.akara();
        game.teleportWithin(game.level.map.nearestWalkable(a.pos.x - 9, a.pos.z + 9));
      });
      await frames(6);
      await ev(() => window.__q.toAkara());
      await frames(3);
      await ev(() => game.interact(window.__q.akara()));
      await hearing('voice.akara.greeting');
      await until(() => !window.__q.saying().length, null, 'her greeting to end', 4000);
      const m = await ev(() => window.__q.spoken.length);
      await pick('交易／修理');
      await until(() => game.hooks.left === 'shop', null, 'her trade');
      await page.waitForTimeout(800);
      const trading = await ev((m) => window.__q.since(m), m);
      expect(!trading.length, `her trade opened, she said ${trading.join(' ')}`);
      await page.keyboard.press('Escape');
      await until(() => game.hooks.left === null, null, 'her trade to shut');
      const shut = await hearing('voice.akara.farewell');
      expect(shut.loud > HEARD_DB, `her trade shut, no farewell: ${JSON.stringify(shut)}`);
      await until(() => !window.__q.saying().length, null, 'her farewell to end', 4000);
      facts.push(`visits: greetings ${greetings.map((f) => f.match(/\.(\d)\.m4a/)[1]).join('')}, farewells ${farewells.map((f) => f.match(/\.(\d)\.m4a/)[1]).join('')}, none clicked again at once, one as her trade shut; ${beside.join(', ')}`);
    },

    async questLog() {
      const l = await openLog();
      expect(l.cells.length === 6, `the log shows ${l.cells.length} quests`);
      expect(l.cells[0] === 'a1q1:active.on' && l.cells[1] === 'a1q2:none' && l.cells.slice(2).every((c) => /:off$/.test(c)), `the log's quests: ${l.cells.join(' ')}`);
      expect(l.state === '进行中' && l.text.includes('邪秽巢穴') && l.text.includes('亚喀蕾'), `the log says ${l.state}: ${l.text}`);
      await shot('quest-log');
      await closeLog();
    },

    async out() {
      const spot = await ev(() => window.__q.spotIn(2, 1, 3, 16));
      await ev((at) => game.teleportWithin(at), spot);
      await frames(4);
      const r = await ev(() => ({ area: game.area?.id, leave: window.__q.has(window.__q.F.LEAVETOWN), state: window.__q.den().state }));
      expect(r.area === 2 && r.leave && r.state === 3, `out on the moor: area ${r.area}, LEAVETOWN ${r.leave}, state ${r.state}`);
    },

    async den() {
      const into = await ev((id) => {
        const S = window.__q;
        const ok = game.enterArea(id, 'stairs');
        const p = game.player;
        game.teleportWithin(game.level.map.nearestWalkable(p.pos.x + 3, p.pos.z + 3) ?? p.pos);
        // Corpsefire (his SuperUniques.txt row) and his pack
        const cf = S.alive().find((m) => m.superUnique === 'Corpsefire');
        return { ok, area: game.area?.id, enter: S.has(S.F.ENTERAREA), last: S.den().last, alive: S.alive().length, hemi: window.renderer.hemi.intensity, corpsefire: !!cf, pack: cf ? cf.minions.filter((m) => !m.dead).length : 0 };
      }, DEN_OF_EVIL);
      expect(into.ok && into.area === DEN_OF_EVIL, `into the den: ${JSON.stringify(into)}`);
      expect(into.enter && into.last === 2, `in the den: ENTERAREA ${into.enter}, the log's status ${into.last}`);
      expect(into.alive > 6, `only ${into.alive} monsters in the den`);
      expect(into.corpsefire && into.pack > 0, `Corpsefire in the den ${into.corpsefire}, his pack ${into.pack}`);
      await frames(20);
      await shot('den-dark');
      // all but three, through the game (God mode keeps the hero up); Corpsefire among the three
      const few = await ev(() => {
        const S = window.__q;
        const alive = S.alive().sort((a, b) => (b.superUnique === 'Corpsefire') - (a.superUnique === 'Corpsefire'));
        for (const m of alive.slice(3)) game.killMonster(m, 'phys');
        return { left: S.alive().length, remaining: S.den().remaining, last: S.den().last, msgs: S.messages() };
      });
      expect(few.left === 3 && few.remaining === 3 && few.last === 4, `three left: ${JSON.stringify(few)}`);
      expect(few.msgs.includes('还剩 3 只'), `the count isn't told: ${few.msgs}`);
      const l = await openLog();
      expect(l.text.includes('还剩 3 只'), `the log with three left: ${l.text}`);
      await shot('quest-log-counting');
      await closeLog();
      // three left, kills out on the moor: the den's count isn't said again and the log has no news
      const moor = await ev(async () => {
        const S = window.__q;
        game.enterArea(2, 'stairs');
        const said = S.said.length;
        const kill = S.alive().slice(0, 4);
        for (const m of kill) game.killMonster(m, 'phys');
        await new Promise((r) => setTimeout(r, 300));
        const out = { area: game.area?.id, killed: kill.length, said: S.said.slice(said).filter((t) => t.includes('还剩')), news: S.logNews(), last: S.den().last, remaining: S.den().remaining };
        game.enterArea(8, 'stairs');
        return out;
      });
      expect(moor.area === 2 && moor.killed === 4 && !moor.said.length && !moor.news && moor.last === 4 && moor.remaining === 3, `kills on the moor: ${JSON.stringify(moor)}`);
      // the last three: Corpsefire standing alone holds it up; with him dead, done
      const last = await ev(() => {
        const S = window.__q;
        for (const m of S.alive()) if (m.superUnique !== 'Corpsefire') game.killMonster(m, 'phys');
        return { alive: S.alive().map((m) => m.superUnique ?? m.def.row.id), remaining: S.den().remaining, pending: S.has(S.F.REWARDPENDING) };
      });
      expect(last.alive.join() === 'Corpsefire' && last.remaining === 1 && !last.pending, `Corpsefire alone: ${JSON.stringify(last)}`);
      const done = await ev(() => {
        const S = window.__q;
        for (const m of S.alive()) game.killMonster(m, 'phys');
        return { pending: S.has(S.F.REWARDPENDING), goal: S.has(S.F.PRIMARYGOALDONE), granted: S.has(S.F.REWARDGRANTED), lit: game.isLit(game.level), msgs: S.messages(), log: game.quests.log('a1q1') };
      });
      expect(done.pending && done.goal && !done.granted, `cleared: pending ${done.pending}, goal ${done.goal}, granted ${done.granted}`);
      expect(done.lit, 'the den is not lit');
      expect(done.msgs.includes('邪秽巢穴里的邪物已被肃清') && done.msgs.includes('亚喀蕾'), `the messages: ${done.msgs}`);
      expect(done.log.state === 'reward', `the log: ${JSON.stringify(done.log)}`);
      await page.waitForTimeout(3500);
      const hemi = await ev(() => window.renderer.hemi.intensity);
      expect(hemi > into.hemi * 2, `the den's light went from ${into.hemi.toFixed(2)} to ${hemi.toFixed(2)}`);
      await shot('den-lit');
      // the log's status turns to "go back" a few quest ticks later (ACT1Q1_Timer_StatusCycler)
      await until(() => window.__q.den().last === 5, null, 'the log to say to go back', 12000);
      facts.push(`den: ${into.alive} monsters (Corpsefire and ${into.pack} of his), done with him last, light ${into.hemi.toFixed(2)} → ${hemi.toFixed(2)}`);
    },

    async reward() {
      await ev(() => {
        game.enterArea(1, 'waypoint');
        window.__q.toAkara();
      });
      await frames(12);
      const before = await ev(() => ({ points: game.player.skillPoints, news: game.quests.hasNews('akara'), mark: !!document.querySelector('.npc-mark'), west: game.level === window.__q.west }));
      expect(before.west && before.news && before.mark, `back in the camp: ${JSON.stringify(before)}`);
      await shot('akara-marked-for-the-reward');
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reward line');
      const thanks = await hearing('voice.akara.a1q1_reward');
      expect(thanks.loud > HEARD_DB && Math.abs(thanks.secs - thanks.dur) < 0.05 && thanks.joined === 0, `her reward's voice (fetched ahead back in the camp, heard from its start): ${JSON.stringify(thanks)}`);
      await page.waitForTimeout(1300);
      const said = await ev(() => window.__q.ui().text);
      expect(said.includes('门'), `her reward line: ${said}`);
      await shot('akara-rewards');
      await page.locator('.dialogue .dlg-skip').click();
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after the reward');
      const thanked = await hushed();
      expect(!thanked.saying.length && thanked.loud < SILENT_DB, `cut short, her reward's voice goes on: ${JSON.stringify(thanked)}`);
      const after = await ev(() => {
        const S = window.__q;
        return { points: game.player.skillPoints, granted: S.has(S.F.REWARDGRANTED), pending: S.has(S.F.REWARDPENDING), started: S.has(S.F.STARTED), news: game.quests.hasNews('akara'), msgs: S.messages() };
      });
      expect(after.points === before.points + 1, `skill points ${before.points} → ${after.points}`);
      expect(after.granted && !after.pending && !after.started && !after.news, `after the reward: ${JSON.stringify(after)}`);
      expect(after.msgs.includes('技能点 +1'), `the messages: ${after.msgs}`);
      // again: nothing more to hand over; 交谈 is small talk
      await pick('取消');
      await ev(() => game.interact(window.__q.akara()));
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu, spoken to again');
      const again = await ev(() => window.__q.ui());
      expect(!again.talking, `she speaks at once again: ${again.text}`);
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her small talk');
      const gossip = await ev(() => window.__q.ui().text);
      const talkId = await ev(() => `voice.akara.${window.__q.npc.topic.id}`);
      const talked = await hearing(talkId);
      expect(talked.loud > HEARD_DB && Math.abs(talked.secs - talked.dur) < 0.05, `her small talk's voice (${talkId}): ${JSON.stringify(talked)}`);
      await page.keyboard.press('Escape');
      const quiet = await hushed();
      expect(!quiet.saying.length && quiet.loud < SILENT_DB, `Esc, and her small talk's voice goes on: ${JSON.stringify(quiet)}`);
      await pick('取消');
      const end = await ev(() => game.player.skillPoints);
      expect(end === after.points, `skill points ${after.points} → ${end} speaking to her again`);
      expect(!gossip.includes('腐味'), `her small talk is the reward again: ${gossip}`);
      const l = await openLog();
      expect(l.cells[0].startsWith('a1q1:done') && l.cells[0].includes('fresh') && l.state === '已完成', `the log: ${l.cells[0]} ${l.state} ${l.text}`);
      await page.waitForTimeout(600);
      await shot('quest-log-done');
      await closeLog();
      const seen = await ev(() => window.__q.has(window.__q.F.UPDATEQUESTLOG));
      expect(seen, 'the log did not mark it seen (UPDATEQUESTLOG)');
      facts.push(`reward: +1 skill point (${before.points} → ${after.points}), once`);
    },

    async kashya() {
      // the den rewarded: Kashya offers hers now, her mark over her
      await ev(() => window.__q.toKashya());
      await frames(12);
      const m = await ev(() => {
        const S = window.__q;
        const k = S.kashya();
        const s = window.renderer.projectP(k.pos, 1);
        const marks = [...document.querySelectorAll('.npc-mark')].map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.left, y: r.top }));
        const over = marks.find((r) => Math.abs(r.x - s.x) < 30 && r.y < s.y);
        return { npc: k.npc, news: game.quests.hasNews('kashya'), state: S.sis().state, word: S.sword(), over: !!over, level: game.player.level };
      });
      expect(m.npc === '柯霞' && m.news && m.state === 1 && m.word === 0 && m.over, `Kashya once the den is rewarded: ${JSON.stringify(m)}`);
      await shot('kashya-marked');
      // before her reward a hero under level 8 can't hire (SUnitNpc.cpp:951)
      if (m.level < 8) {
        await ev(() => game.hooks.openPanel('hire'));
        await until(() => !!document.querySelector('.panel.left.open'), null, 'her hire panel');
        const note = await ev(() => document.querySelector('.panel.left.open .pending-note')?.textContent ?? '');
        expect(note.includes('8 级') && note.includes('众姊妹之冢'), `the hire panel before the reward: ${note}`);
        await shot('hire-before-the-sisters');
        await page.keyboard.press('Escape');
        await until(() => !document.querySelector('.panel.left.open'), null, 'her hire panel to close');
      }
      // spoken to: she gives it at once, a line that scrolls unvoiced (to be recorded at M2a's close), by its length
      await ev(() => game.interact(window.__q.kashya()));
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her line');
      await page.waitForTimeout(1500);
      const said = await ev(() => {
        const S = window.__q;
        const t = S.npc.topic;
        return { ...S.ui(), id: t?.id, quest: t?.quest, dur: +S.npc.dur.toFixed(2), chars: [...(t?.text ?? '')].length, speech: !!S.npc.speech, voiced: game.sfx.voices.some((v) => v.id.startsWith('voice.kashya.')), at: document.querySelector('.dlg-text').style.transform };
      });
      expect(said.talking && !said.menu && said.id === 'intro' && said.quest === 'a1q2' && said.text.includes('绯鸦') && said.text.includes('葬骨荒冢') && said.text.includes('凛寒原野'), `Kashya's first words: ${JSON.stringify(said)}`);
      expect(!said.speech && !said.voiced && said.dur > 20 && /translateY\(-?\d+px\)/.test(said.at), `her unvoiced line, scrolled by its length: ${JSON.stringify({ dur: said.dur, chars: said.chars, speech: said.speech, at: said.at })}`);
      expect(!said.text.includes('卡夏') && !said.text.includes('血鸦') && !said.text.includes('埋骨之地'), 'an official name in her line');
      await shot('kashya-gives-the-quest');
      await page.locator('.dialogue .dlg-skip').click();
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after the line');
      const after = await ev(() => {
        const S = window.__q;
        return { ui: S.ui(), started: S.shas(S.F.STARTED), state: S.sis().state, news: game.quests.hasNews('kashya') };
      });
      expect(after.started && after.state === 2 && !after.news, `cut short, the quest isn't given: ${JSON.stringify(after)}`);
      expect(after.ui.opts.join('/') === '交谈/雇佣/取消', `her menu: ${after.ui.opts.join('/')}`);
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reminder');
      const remind = await ev(() => window.__q.ui().text);
      expect(remind.includes('营门') && remind.includes('凛寒原野'), `her reminder: ${remind}`);
      await page.keyboard.press('Escape');
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after Esc');
      await pick('取消');
      await until(() => !document.querySelector('.npc-menu.open'), null, 'her menu to close');
      const left = await ev(() => window.__q.sis().last);
      expect(left === 1, `the log's status after leaving her: ${left}`);
      const l = await openLog();
      expect(l.cells[1].startsWith('a1q2:active') && l.cells[0].startsWith('a1q1:done'), `the log's quests: ${l.cells.join(' ')}`);
      await ev(() => document.querySelector('.panel.left.open .qcell[data-quest="a1q2"]').click());
      await frames(3);
      const picked = await ev(() => ({ state: document.querySelector('.panel.left.open .qstate')?.textContent, text: document.querySelector('.panel.left.open .qtext')?.textContent }));
      expect(picked.state === '进行中' && picked.text.includes('柯霞') && picked.text.includes('绯鸦'), `the Sisters in the log: ${JSON.stringify(picked)}`);
      await shot('quest-log-sisters');
      await closeLog();
    },

    async graves() {
      // out of the camp, then into the Burial Grounds by her: the log says to find her, and the hero knows the place
      await ev(() => game.teleportWithin(window.__q.spotIn(2, 1, 3, 16)));
      await frames(4);
      const out = await ev(() => ({ area: game.area?.id, leave: window.__q.shas(window.__q.F.LEAVETOWN), state: window.__q.sis().state }));
      expect(out.area === 2 && out.leave && out.state === 3, `out on the moor: ${JSON.stringify(out)}`);
      // nothing of the hero's being said, so the place's line has the floor
      await until(() => !game.sfx.voices.some((v) => /^voice\.(paladin|sorceress)\./.test(v.id) && v.end > game.sfx.ctx.currentTime), null, "the hero's lines to end", 8000);
      await page.waitForTimeout(1500);
      const into = await ev(() => {
        const S = window.__q;
        const r = S.raven();
        game.teleportWithin(game.level.map.nearestWalkable(r.pos.x + 6, r.pos.z + 6));
        return { area: game.area?.id, enter: S.shas(S.F.ENTERAREA), last: S.sis().last, ravens: S.ravens().length, quest: r.quest, boss: r.rank, minions: r.minions.filter((x) => !x.dead).length };
      });
      expect(into.area === 17 && into.enter && into.last === 2, `into the Burial Grounds: ${JSON.stringify(into)}`);
      expect(into.ravens === 1 && into.quest === 'a1q2', `the Burial Grounds' Blood Raven: ${JSON.stringify(into)}`);
      await until(() => window.__q.heroSaying().some((v) => v.id.endsWith('.graveyard')), null, "the hero's line for the graveyard", 3000).catch(() => expect(false, "the hero didn't say the graveyard's line"));
      await frames(30);
      await shot('graves-blood-raven');
      // killed with the hero two rooms off: done in this game without a reward; the log says so
      const far = await ev(() => {
        const S = window.__q;
        const r = S.raven();
        const d = S.standOff(r, [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]]);
        game.killMonster(r, 'phys');
        return { d, pending: S.shas(S.F.REWARDPENDING), now: S.shas(S.F.COMPLETEDNOW), state: S.sis().state, log: game.quests.log('a1q2'), said: S.said.filter((t) => t.includes('绯鸦')) };
      });
      expect(far.d && !far.pending && far.now && far.state === 4 && far.log.state === 'done' && far.log.text.includes('不算你的'), `killed two rooms off: ${JSON.stringify(far)}`);
      expect(far.said.some((t) => t.includes('不算你的')), `the message for a kill too far off: ${far.said.join(' | ')}`);
      const l = await openLog();
      expect(l.cells[1].startsWith('a1q2:done') && l.text.includes('不算你的'), `the log after a far kill: ${l.cells[1]} ${l.text}`);
      await shot('quest-log-sisters-missed');
      await closeLog();
      // a reload is the next game: she's back, and it's to do again from where the record says
      const again = await ev(() => {
        const S = window.__q;
        game.save();
        const ok = game.continueGame(undefined, true);
        S.west = game.level;
        const r = S.raven();
        return { ok, area: game.area?.id, alive: !!r && !r.dead, state: S.sis().state, last: S.sis().last, now: S.shas(S.F.COMPLETEDNOW), playable: S.sis().playable };
      });
      expect(again.ok && again.area === 17 && again.alive && again.state === 3 && again.last === 2 && !again.now && again.playable, `reloaded in the Burial Grounds: ${JSON.stringify(again)}`);
      await frames(10);
      // killed with the hero in a room on her diagonal: done, the reward waiting
      const near = await ev(() => {
        const S = window.__q;
        const r = S.raven();
        const d = S.standOff(r, [[1, 1], [-1, -1], [1, -1], [-1, 1]]);
        game.killMonster(r, 'phys');
        return { d, pending: S.shas(S.F.REWARDPENDING), goal: S.shas(S.F.PRIMARYGOALDONE), granted: S.shas(S.F.REWARDGRANTED), log: game.quests.log('a1q2'), news: game.quests.hasNews('kashya'), msgs: S.messages() };
      });
      expect(near.d && near.pending && near.goal && !near.granted && near.log.state === 'reward' && near.news, `killed from her diagonal room: ${JSON.stringify(near)}`);
      expect(near.msgs.includes('绯鸦已经伏诛') && near.msgs.includes('柯霞'), `the messages: ${near.msgs}`);
      await page.waitForTimeout(600);
      await shot('graves-blood-raven-slain');
      // the log turns to "go back" sixteen quest ticks later (ACT1Q2_Timer_StatusCycler)
      await until(() => window.__q.sis().last === 3, null, 'the log to say to go back', 16000);
      facts.push(`the Sisters: missed from two rooms off (${far.d}), done from a room on her diagonal (${near.d}) after a reload`);
    },

    async sistersReward() {
      await ev(() => {
        game.enterArea(1, 'waypoint');
        window.__q.toKashya();
      });
      await frames(12);
      const before = await ev(() => ({ news: game.quests.hasNews('kashya'), merc: !!game.player.merc, level: game.player.level, hire: window.__q.mayHire() }));
      expect(before.news && !before.merc && (before.level >= 8 || !before.hire), `back at Kashya: ${JSON.stringify(before)}`);
      await shot('kashya-marked-for-the-reward');
      await ev(() => game.interact(window.__q.kashya()));
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her reward line');
      await page.waitForTimeout(1300);
      const line = await ev(() => ({ ...window.__q.ui(), id: window.__q.npc.topic?.id }));
      expect(line.talking && line.id === 'reward' && line.text.includes('斥候'), `her reward line: ${JSON.stringify(line)}`);
      await shot('kashya-rewards');
      await page.locator('.dialogue .dlg-skip').click();
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after the reward');
      await frames(20);
      const after = await ev(() => {
        const S = window.__q;
        const st = game.player.merc;
        const m = game.merc;
        return { granted: S.shas(S.F.REWARDGRANTED), pending: S.shas(S.F.REWARDPENDING), news: game.quests.hasNews('kashya'), merc: st && { hire: st.hire, name: st.name, shown: S.mercName(st), level: st.level, dead: st.dead }, near: m ? +S.dist(m.pos, game.player.pos).toFixed(1) : null, msgs: S.messages(), hire: S.mayHire() };
      });
      expect(after.granted && !after.pending && !after.news && after.merc && !after.merc.dead && after.near !== null && after.near < 4, `the reward's hireling: ${JSON.stringify(after)}`);
      expect(after.msgs.includes('随你出征') && after.hire, `the reward's message and the hire rule: ${JSON.stringify(after)}`);
      await pick('取消');
      await frames(10);
      await shot('kashya-hireling-joined');
      // 交谈 in the same visit: the speech again, and nothing more
      await ev(() => game.interact(window.__q.kashya()));
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu, spoken to again');
      await pick('交谈');
      await until(() => !!document.querySelector('.dialogue.open'), null, 'her speech again');
      const again = await ev(() => window.__q.npc.topic?.id);
      await page.keyboard.press('Escape');
      await until(() => !!document.querySelector('.npc-menu.open'), null, 'her menu after Esc');
      const once = await ev((name) => game.player.merc?.name === name && window.__q.shas(window.__q.F.REWARDGRANTED), after.merc?.name);
      expect(again === 'reward' && once, `spoken to again: ${again}, one hireling ${once}`);
      // the hire panel lists her scouts now, whatever the hero's level
      await pick('雇佣');
      await until(() => !!document.querySelector('.panel.left.open'), null, 'her hire panel');
      const panel = await ev(() => ({ note: document.querySelector('.panel.left.open .pending-note')?.textContent ?? null, offers: document.querySelectorAll('.panel.left.open .hire-list > *').length }));
      expect(panel.note === null && panel.offers > 0, `the hire panel after the reward: ${JSON.stringify(panel)}`);
      await shot('hire-after-the-sisters');
      await page.keyboard.press('Escape');
      await until(() => !document.querySelector('.panel.left.open'), null, 'her hire panel to close');
      const l = await openLog();
      // (not flared again: the log showed it done once already, after the far kill, and D2 never clears that flag, PlrMsg.cpp:3665-3679)
      expect(l.cells[1].startsWith('a1q2:done') && l.state === '已完成' && l.text.includes('柯霞的斥候'), `the log: ${l.cells[1]} ${l.state} ${l.text}`);
      await page.waitForTimeout(600);
      await shot('quest-log-sisters-done');
      await closeLog();
      facts.push(`the Sisters' reward: ${after.merc?.shown} (level ${after.merc?.level}) for nothing, once, beside the hero (${after.near} m); hiring open at level ${before.level}`);
    },

    async saveAndContinue() {
      const r = await ev(() => {
        const S = window.__q;
        game.save();
        const d = JSON.parse(localStorage.getItem('dii-save-dev'));
        const points = game.player.skillPoints;
        const ok = game.continueGame();
        S.west = game.level;
        return {
          ok,
          sisters: d.progress.map((x) => x.quests.a1q2 ?? 0),
          sistersAfter: { granted: S.shas(S.F.REWARDGRANTED), playable: S.sis().playable, news: game.quests.hasNews('kashya'), log: game.quests.log('a1q2').state, merc: game.player.merc?.name ?? null, hadMerc: d.merc?.name ?? null },
          saved: d.progress.map((x) => x.quests.a1q1 ?? 0),
          points: [points, game.player.skillPoints],
          granted: S.has(S.F.REWARDGRANTED),
          playable: S.den().playable,
          news: game.quests.hasNews('akara'),
          log: game.quests.log('a1q1').state,
          nightmare: JSON.stringify(game.player.quests[1]),
        };
      });
      expect(r.ok, 'the save would not load');
      expect((r.saved[0] & 1) === 1 && r.saved[1] === 0 && r.saved[2] === 0, `the save's words ${r.saved.join(', ')}`);
      expect(r.points[0] === r.points[1] && r.granted && !r.playable && !r.news && r.log === 'done', `played again: ${JSON.stringify(r)}`);
      expect(r.nightmare === '{}', `nightmare's record: ${r.nightmare}`);
      expect((r.sisters[0] & 1) === 1 && r.sisters[1] === 0 && r.sisters[2] === 0, `the save's Sisters words ${r.sisters.join(', ')}`);
      const a = r.sistersAfter;
      expect(a.granted && !a.playable && !a.news && a.log === 'done' && a.merc && a.merc === a.hadMerc, `the Sisters played again: ${JSON.stringify(a)}`);
    },

    async nightmare() {
      const r = await ev(() => {
        const S = window.__q;
        game.setDifficulty(1);
        const out = { word: S.word(1), log: game.quests.log('a1q1').state, news: game.quests.hasNews('akara'), normal: S.word(0), playable: S.den().playable, sisters: { word: S.sword(1), log: game.quests.log('a1q2').state, news: game.quests.hasNews('kashya'), state: S.sis().state, normal: S.sword(0) } };
        return out;
      });
      expect(r.word === 0 && r.log === 'none' && r.news && r.playable, `nightmare: ${JSON.stringify(r)}`);
      expect((r.normal & 1) === 1, `normal's word in nightmare: ${r.normal}`);
      expect(r.sisters.word === 0 && r.sisters.log === 'none' && !r.sisters.news && r.sisters.state === 0 && (r.sisters.normal & 1) === 1, `the Sisters in nightmare: ${JSON.stringify(r.sisters)}`);
      const l = await openLog();
      expect(l.cells[0].startsWith('a1q1:none') && l.cells[1].startsWith('a1q2:none'), `nightmare's log: ${l.cells[0]} ${l.cells[1]}`);
      await shot('quest-log-nightmare');
      await closeLog();
      await ev(() => game.setDifficulty(0));
      facts.push('nightmare untouched, the Sisters too');
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
  log(fails.length ? `QUESTS FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `QUESTS OK (${secs} s): ${facts.join('; ')}`);
}
