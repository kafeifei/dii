// The recorded music as it's played in the game (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/music.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage and starts the sound with a click, as a player would, then takes the
// hero round the West overworld and its cave: the camp streams music.town, its takes in turn (each
// run to its end); walked out over the camp's seam into Blood Moor, music.wild crossfades in over
// it, once, with the ambience; stepping to and fro over the seam switches no more often than the
// ambience does (Sfx SWITCH_HOLD), and back in Blood Moor before its track has faded out, that same
// stream is brought back and played on, none cut off; Cold Plains plays the same track on; the Den
// of Evil plays music.dungeon, coming out music.wild again; a waypoint and a respawn to the camp
// switch to music.town; a reload (the save read back, as UI.resume does) plays the saved area's
// track from the next click. Every track is a Stream on one of the two reused <audio> elements,
// fading in to its gain (src/audio/files.ts) and out on a GainNode; its file is fetched as media
// (200 or 206, audio/mp4) and never decoded whole into an AudioBuffer. The level heard at the
// master, the other buses muted a moment, is the file's own at that point times the gains it's
// played by (within LIVE_DB); in Blood Moor a hit and a death are well over it (LIVE_FIGHT_DB), and
// the ambience is measured beside it (tools/scenarios/sfx.mjs holds whole tracks under it). Page
// errors fail the run. The last line is "MUSIC OK …" or "MUSIC FAIL …".
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** the areas walked, and the track each plays (src/audio/sounds.ts ENVIRONS, by levels.json SoundEnv) */
const CAMP = 1;
const MOOR = 2;
const PLAINS = 3;
const DEN = 8;
const TRACK = { [CAMP]: 'music.town', [MOOR]: 'music.wild', [PLAINS]: 'music.wild', [DEN]: 'music.dungeon' };
/** how far the music heard at the master may be from the file's own level times its gains, in dB */
const LIVE_DB = 1;
/**
 * how far a hit and a death, at their loudest 400 ms, are over the music's level at least, in dB
 * (tools/scenarios/sfx.mjs holds each track's whole length to the same, and its swells under them)
 */
const LIVE_FIGHT_DB = 6;
/** seconds each level is measured over */
const SPAN = 5;
/** Sfx's SWITCH_HOLD and MUSIC_IN, MUSIC_OUT (src/audio/sfx.ts), in seconds */
const HOLD = 2;
const FADE_IN = 5;
const FADE_OUT = 3;

/** the RMS of public/audio/<file> from `t0` to `t1` seconds, both ears, decoded by ffmpeg at 48 kHz */
function fileRms(file, t0, t1) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(new URL(`../../public/audio/${file}`, import.meta.url)), '-ss', String(t0), '-t', String(t1 - t0), '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let s = 0;
  for (const v of f) s += v * v;
  return Math.sqrt(s / f.length);
}

const db = (x) => 20 * Math.log10(x);
/** a music file's path, as the game asks for it */
const MUSIC_URL = /^\/audio\/music\.[^/]+\.m4a$/;

export default async function (page, shot, log) {
  const t0 = Date.now();
  const errors = [];
  const fails = [];
  const facts = [];
  let step = 'start';
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  // every request for a music file: how it was asked for, and what came back
  const media = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (!MUSIC_URL.test(u.pathname)) return;
    media.push({ file: u.pathname.split('/').pop(), status: r.status(), type: r.headers()['content-type'], as: r.request().resourceType() });
  });
  page.on('requestfailed', (r) => {
    // a stream let go of mid-download (the element's src removed) is aborted: that's expected
    if (MUSIC_URL.test(new URL(r.url()).pathname) && !/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const until = async (fn, arg, what, timeout = 8000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 50 });
    } catch {
      throw new Error(`timed out waiting for ${what}`);
    }
  };

  /** the page's helpers, set up again after a load: notes on the tracks and ambiences started, and the decodes */
  const helpers = () =>
    ev(async () => {
      const S = (window.__m = {});
      const snd = game.sfx;
      S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      S.debug = (await import('/src/game/debug.ts')).debugOpts;
      // god mode, so nothing in Blood Moor ends the walk early
      S.debug.god = true;
      const { areaKey } = await import('/src/audio/sounds.ts');
      S.tracks = [];
      S.ambs = [];
      S.decoded = [];
      // every time the music changes: to which area's, and whether it was one brought back (Stream.revive)
      S.switches = [];
      S.lost = 0;
      const seen = new Set();
      const start = snd.startArea.bind(snd);
      snd.startArea = (a, fade) => {
        const was = snd.music;
        const r = start(a, fade);
        if (snd.music !== was) S.switches.push(`${areaKey(a)}${seen.has(snd.music) ? '(back)' : ''}`);
        seen.add(snd.music);
        return r;
      };
      const track = snd.track.bind(snd);
      snd.track = (a) => {
        S.tracks.push(areaKey(a));
        return track(a);
      };
      const amb = snd.ambience.bind(snd);
      snd.ambience = (s, rise) => {
        S.ambs.push(s.bed);
        return amb(s, rise);
      };
      const decode = snd.decode.bind(snd);
      snd.decode = (url, mono) => {
        S.decoded.push(url);
        return decode(url, mono);
      };
      /** what plays: the track's file (a Stream's) or its composed kind (a Score's), and its level */
      S.now = () => {
        const m = snd.music;
        const el = m?.el;
        return {
          area: game.area?.id,
          file: el ? (el.getAttribute('src') ?? '').split('/').pop() : null,
          kind: m?.kind ?? null,
          paused: el ? el.paused : null,
          at: el ? el.currentTime : null,
          loop: el ? el.loop : null,
          gain: m?.gain ? m.gain.gain.value : null,
          pooled: el ? snd.players.all.some((p) => p.el === el) : null,
          playing: snd.playing.music,
        };
      };
      /** the hero set down at `at` and the area announced, as a step of a walk does (Game.update) */
      S.step = (at) => {
        const p = game.player;
        p.pos = { ...at };
        p.prevPos = { ...at };
        snd.setListener(p.pos);
        game.updateArea(false, 'walk');
        return game.area.id;
      };
      S.seam = (a, b) => {
        const ow = game.level.layout;
        const s = ow.seams.find((x) => x.a === a && x.b === b);
        if (s) return s;
        const r = ow.seams.find((x) => x.a === b && x.b === a);
        return r && { a, b, ta: r.tb, tb: r.ta };
      };
      /** a walkable spot `k` tiles from the middle of the seam a|b, toward b (negative: back into a) */
      S.across = (a, b, k) => {
        const s = S.seam(a, b);
        const dx = s.tb.x - s.ta.x;
        const dz = s.tb.z - s.ta.z;
        const d = Math.hypot(dx, dz) || 1;
        const mid = { x: (s.ta.x + s.tb.x) / 2, z: (s.ta.z + s.tb.z) / 2 };
        const at = { x: mid.x + (dx / d) * k, z: mid.z + (dz / d) * k };
        return game.level.map.nearestWalkable(at.x, at.z) ?? at;
      };
    });

  /**
   * once there's an AudioContext: what the master sends on (the compressor's input) tapped by an
   * AudioWorklet, which hands back the sum of squares of each 100 ms of it while a measure runs
   */
  const tap = () =>
    ev(async () => {
      const S = window.__m;
      const snd = game.sfx;
      const ctx = snd.ctx;
      const code = `registerProcessor('meter', class extends AudioWorkletProcessor {
        constructor() { super(); this.s = 0; this.n = 0; }
        process([input]) {
          // with nothing coming in, a block of silence in both ears
          for (const c of input) for (const v of c) this.s += v * v;
          this.n += input.length ? input.length * input[0].length : 256;
          if (this.n >= sampleRate / 10 * 2) {
            this.port.postMessage([this.s, this.n]);
            this.s = 0;
            this.n = 0;
          }
          return true;
        }
      });`;
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      const node = new AudioWorkletNode(ctx, 'meter', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
      snd.master.connect(node);
      S.meter = null;
      node.port.onmessage = ({ data: [s, n] }) => {
        const m = S.meter;
        if (!m) return;
        m.sum += s;
        m.n += n;
        // the loudest 400 ms: four of the blocks
        m.blocks.push(s / n);
        if (m.blocks.length >= 4) m.loudest = Math.max(m.loudest, m.blocks.slice(-4).reduce((x, y) => x + y, 0) / 4);
      };
      S.node = node;
      // a stream cut off without its fade out, its element taken for another
      const proto = snd.music.constructor.prototype;
      if (!proto.__lose) {
        proto.__lose = proto.lose;
        proto.lose = function () {
          if (window.__m) window.__m.lost++;
          return proto.__lose.call(this);
        };
      }
      /** `secs` of the master with only `bus` let through (the others muted for it), with the music's place in its file */
      S.measure = async (bus, secs, during) => {
        const buses = { music: snd.musicBus, amb: snd.ambBus, sfx: snd.sfxBus };
        const was = Object.fromEntries(Object.entries(buses).map(([k, g]) => [k, g.gain.value]));
        for (const [k, g] of Object.entries(buses)) if (k !== bus) g.gain.value = 0;
        // what's in the pipe still from before
        await new Promise((r) => setTimeout(r, 300));
        const el = snd.music?.el;
        const from = el?.currentTime;
        S.meter = { sum: 0, n: 0, blocks: [], loudest: 0 };
        during?.();
        await new Promise((r) => setTimeout(r, secs * 1000));
        const m = S.meter;
        S.meter = null;
        const to = el?.currentTime;
        for (const [k, g] of Object.entries(buses)) g.gain.value = was[k];
        return {
          rms: Math.sqrt(m.sum / Math.max(1, m.n)),
          loudest: Math.sqrt(m.loudest),
          file: el ? (el.getAttribute('src') ?? '').split('/').pop() : null,
          from,
          to,
          levels: { music: snd.musicBus.gain.value, master: snd.master.gain.value, track: snd.music?.gain?.gain.value },
        };
      };
    });

  /** what plays now, and what it should be: the area's track, streamed and playing */
  const playing = async (what, area) => {
    const n = await ev(() => window.__m.now());
    const id = TRACK[area];
    const files = await ev((id) => game.sfx.files[id]?.files ?? [], id);
    expect(n.area === area, `${what}: the hero is in area ${n.area}, not ${area}`);
    expect(n.playing === id, `${what}: the sound names ${n.playing}, not ${id}`);
    expect(files.includes(n.file) && n.kind === null, `${what}: plays ${n.file ?? n.kind}, not one of ${files.join(', ')}`);
    expect(n.pooled && n.paused === false, `${what}: the stream is ${n.pooled ? '' : 'not '}on a pooled element, paused ${n.paused}`);
    expect(n.loop === (files.length === 1), `${what}: ${files.length} take(s), looping ${n.loop}`);
    return n;
  };
  /** the track's fade in done: at its gain, and moving on in its file */
  const fadedIn = async (what, area) => {
    const id = TRACK[area];
    const want = await ev((id) => game.sfx.files[id].gain ?? 1, id);
    await until((want) => Math.abs((game.sfx.music?.gain?.gain.value ?? 0) - want) < 1e-4, want, `${what}: the track to fade in to ${want}`, (FADE_IN + 3) * 1000);
    const a = await ev(() => game.sfx.music.el.currentTime);
    await wait(500);
    const b = await ev(() => game.sfx.music.el.currentTime);
    expect(b - a > 0.3, `${what}: the stream stands still (${a.toFixed(2)} → ${b.toFixed(2)} s in half a second)`);
    return want;
  };
  /** the music alone at the master, against its file's own level there times the gains it's played by */
  const live = async (what) => {
    const m = await ev((secs) => window.__m.measure('music', secs), SPAN);
    if (!expect(m.file && m.to > m.from, `${what}: nothing streamed while measuring (${JSON.stringify(m)})`)) return null;
    const file = fileRms(m.file, m.from, m.to);
    const want = file * m.levels.track * m.levels.music * m.levels.master;
    const d = db(m.rms) - db(want);
    expect(Math.abs(d) <= LIVE_DB, `${what}: the music at the master is ${db(m.rms).toFixed(1)} dBFS, ${d.toFixed(1)} dB off its file's ${db(file).toFixed(1)} dBFS times the gains (${m.file} ${m.from.toFixed(1)}–${m.to.toFixed(1)} s)`);
    return { ...m, d, db: db(m.rms) };
  };

  const steps = {
    async load() {
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      await helpers();
      const before = await ev(() => ({ ctx: !!game.sfx.ctx, area: game.area?.id, playing: game.sfx.playing.music }));
      expect(!before.ctx && before.area === CAMP && before.playing === TRACK[CAMP], `before the first click: ${JSON.stringify(before)}`);
      expect(media.length === 0, `${media.length} music request(s) before the first click`);
      // the first click: the sound starts with it, the camp's track first
      await page.mouse.click(640, 400);
      await until(() => game.sfx.ctx?.state === 'running' && game.sfx.music?.el && !game.sfx.music.el.paused, null, 'the camp track to play after the first click');
      await tap();
    },

    async camp() {
      const n = await playing('the camp', CAMP);
      expect(n.file === 'music.town.1.m4a', `the camp starts on ${n.file}, not its first take`);
      const g = await fadedIn('the camp', CAMP);
      const m = await live('the camp');
      const amb = await ev((secs) => window.__m.measure('amb', secs), SPAN);
      if (m) facts.push(`camp: music ${m.db.toFixed(1)} dBFS (${m.d >= 0 ? '+' : ''}${m.d.toFixed(1)} dB off its file, gain ${g}), ambience ${db(amb.rms).toFixed(1)}`);
      // its takes in turn: each run to its end, the next starts, at the level it was (no fade again)
      const order = [n.file];
      for (let k = 0; k < 2; k++) {
        const r = await ev(async () => {
          const s = game.sfx.music;
          const el = s.el;
          const was = el.getAttribute('src');
          el.currentTime = el.duration - 1;
          const t = performance.now();
          while (el.getAttribute('src') === was || el.paused || el.currentTime < 0.2) {
            if (performance.now() - t > 6000) return { error: `still on ${was.split('/').pop()} at ${el.currentTime.toFixed(1)} of ${el.duration.toFixed(1)} s, paused ${el.paused}` };
            await new Promise((r) => setTimeout(r, 20));
          }
          return { file: el.getAttribute('src').split('/').pop(), ms: Math.round(performance.now() - t), gain: s.gain.gain.value, same: game.sfx.music === s };
        });
        if (!expect(!r.error, `take ${k + 2}: ${r.error}`)) break;
        order.push(r.file);
        expect(r.same && Math.abs(r.gain - g) < 1e-4, `take ${k + 2} (${r.file}): another track (${!r.same}) or not at its level (${r.gain})`);
        facts.push(`${r.file} on ${r.ms} ms after the last take's end was sought`);
      }
      expect(order.join(' ') === 'music.town.1.m4a music.town.2.m4a music.town.1.m4a', `the camp's takes played ${order.join(' ')}`);
      await shot('camp');
    },

    async walkOut() {
      // a few tiles inside the camp, the last switch long done; then walked out by the game itself
      const r0 = await ev(() => {
        const S = window.__m;
        game.teleportWithin(S.across(1, 2, -3));
        S.tracks.length = 0;
        S.ambs.length = 0;
        S.town = game.sfx.music;
        S.out = S.across(1, 2, 4);
        game.player.intent = { kind: 'move', point: S.out };
        return { area: game.area.id, town: !!S.town };
      });
      expect(r0.area === CAMP && r0.town, `set down in area ${r0.area}, not the camp, or no track playing`);
      await until(() => game.area.id === 2, null, 'the hero to walk out into Blood Moor', 15000);
      // the crossfade: a second on, the camp's track going and the wilderness's coming
      await wait(1000);
      const x = await ev(() => {
        const S = window.__m;
        return { out: S.town.gain.gain.value, in: game.sfx.music.gain?.gain.value, same: game.sfx.music === S.town };
      });
      expect(!x.same && x.out > 0.01 && x.in > 0.003, `walking out the music doesn't crossfade: the camp's at ${x.out}, Blood Moor's at ${x.in}`);
      await until(() => window.__m.dist(game.player.pos, window.__m.out) < 1.5 || !game.player.intent, null, 'the walk to end', 15000);
      await playing('Blood Moor', MOOR);
      await wait((FADE_OUT + 0.5) * 1000);
      const r = await ev(() => {
        const S = window.__m;
        return { tracks: S.tracks.slice(), ambs: S.ambs.slice(), src: S.town.el.getAttribute('src'), paused: S.town.el.paused, held: game.sfx.players.all.filter((p) => p.owner).length };
      });
      expect(r.tracks.join(' ') === 'wild' && r.ambs.join(' ') === 'wild', `walking out: tracks started ${r.tracks.join(' ') || 'none'}, ambiences ${r.ambs.join(' ') || 'none'}`);
      expect(r.paused && r.src === null && r.held === 1, `the camp's track after fading out: paused ${r.paused}, src ${r.src}, ${r.held} element(s) held`);
      await fadedIn('Blood Moor', MOOR);
      const m = await live('Blood Moor');
      const amb = await ev((secs) => window.__m.measure('amb', secs), SPAN);
      // a hit and a death, as the hero hears them up close; the game held still meanwhile, so no
      // monster of Blood Moor's is heard with them
      await ev(() => {
        game.paused = true;
        return game.sfx.preload(['combat.hit', 'monster.die']);
      });
      await wait(1500);
      const hit = await ev((secs) => window.__m.measure('sfx', secs, () => game.sfx.play('combat.hit')), 1);
      const die = await ev((secs) => window.__m.measure('sfx', secs, () => game.sfx.play('monster.die')), 1.5);
      await ev(() => (game.paused = false));
      if (m) {
        facts.push(`Blood Moor: music ${m.db.toFixed(1)} dBFS (${m.d >= 0 ? '+' : ''}${m.d.toFixed(1)} dB off its file; loudest 400 ms ${db(m.loudest).toFixed(1)}), ambience ${db(amb.rms).toFixed(1)}, a hit ${db(hit.loudest).toFixed(1)} and a death ${db(die.loudest).toFixed(1)} at their loudest 400 ms`);
        expect(db(hit.loudest) - m.db >= LIVE_FIGHT_DB && db(die.loudest) - m.db >= LIVE_FIGHT_DB, `the music isn't well under the fighting: a hit ${db(hit.loudest).toFixed(1)}, a death ${db(die.loudest).toFixed(1)} dBFS at their loudest 400 ms, the music ${m.db.toFixed(1)}`);
      }
      await shot('blood-moor');
    },

    async seam() {
      // to and fro over the camp's seam, a step every quarter second: the music switches with the
      // ambience, at most once in SWITCH_HOLD; and back in Blood Moor before the wilderness's track
      // has faded out, it's that same stream brought back, played on from where it was, not cut off
      // and begun again
      await fadedIn('Blood Moor', MOOR);
      const r = await ev(
        async ({ HOLD }) => {
          const S = window.__m;
          const snd = game.sfx;
          S.tracks.length = 0;
          S.ambs.length = 0;
          S.switches.length = 0;
          S.lost = 0;
          const wild = snd.music;
          const at = wild.el.currentTime;
          const inCamp = S.across(1, 2, -1.5);
          const out = S.across(1, 2, 1.5);
          const areas = [];
          const t = snd.ctx.currentTime;
          for (let k = 0; k < 12; k++) {
            areas.push(S.step(k % 2 ? out : inCamp));
            await new Promise((r) => setTimeout(r, 250));
          }
          S.step(out);
          const secs = snd.ctx.currentTime - t;
          await new Promise((r) => setTimeout(r, (HOLD + 0.5) * 1000));
          const el = snd.music.el;
          return {
            areas: areas.join(''),
            secs,
            tracks: S.tracks.slice(),
            ambs: S.ambs.slice(),
            switches: S.switches.slice(),
            lost: S.lost,
            same: snd.music === wild,
            src: (el?.getAttribute('src') ?? '').split('/').pop(),
            on: el ? el.currentTime - at : 0,
            took: snd.ctx.currentTime - t,
          };
        },
        { HOLD },
      );
      const most = Math.ceil(r.secs / HOLD) + 1;
      expect(r.areas === '121212121212', `the steps went through areas ${r.areas}`);
      expect(r.switches.length === r.ambs.length && r.switches.length <= most, `${r.areas.length} steps over the seam in ${r.secs.toFixed(1)} s: the music switched ${r.switches.join(' ') || 'never'}, the ambience ${r.ambs.join(' ') || 'never'} (at most ${most})`);
      expect(r.same && r.lost === 0 && r.on > r.took - 1, `back in Blood Moor: ${r.same ? 'the same stream' : `another stream (${r.src})`}, ${r.lost} cut off, ${r.on.toFixed(1)} s on in its file over ${r.took.toFixed(1)} s`);
      await playing('back in Blood Moor after the seam', MOOR);
      facts.push(`seam: ${r.areas.length} steps in ${r.secs.toFixed(1)} s, the music switched ${r.switches.join(' ')}, none cut off`);
    },

    async coldPlains() {
      await fadedIn('Blood Moor', MOOR);
      const r = await ev(() => {
        const S = window.__m;
        game.teleportWithin(S.across(2, 3, -3));
        S.tracks.length = 0;
        S.ambs.length = 0;
        S.wild = game.sfx.music;
        S.at = S.wild.el.currentTime;
        S.out = S.across(2, 3, 4);
        game.player.intent = { kind: 'move', point: S.out };
        return game.area.id;
      });
      expect(r === MOOR, `set down in area ${r}, not Blood Moor`);
      await until(() => game.area.id === 3, null, 'the hero to walk into Cold Plains', 15000);
      await wait(1500);
      await playing('Cold Plains', PLAINS);
      const s = await ev(() => {
        const S = window.__m;
        return { same: game.sfx.music === S.wild, tracks: S.tracks.slice(), on: S.wild.el.currentTime - S.at, gain: S.wild.gain.gain.value };
      });
      expect(s.same && s.tracks.length === 0 && s.on > 1, `into Cold Plains the music started again (${s.tracks.join(' ') || 'same stream'}) or stood still (${s.on.toFixed(1)} s on)`);
      await fadedIn('Cold Plains', PLAINS);
    },

    async den() {
      const r = await ev(() => {
        const S = window.__m;
        S.tracks.length = 0;
        return { ok: game.enterArea(8, 'stairs'), area: game.area?.id };
      });
      expect(r.ok && r.area === DEN, `into the den: ${JSON.stringify(r)}`);
      await until(() => game.sfx.music?.el && !game.sfx.music.el.paused, null, "the den's track to play");
      await playing('the Den of Evil', DEN);
      const g = await fadedIn('the Den of Evil', DEN);
      const m = await live('the Den of Evil');
      const bed = await ev((secs) => window.__m.measure('amb', secs), SPAN);
      if (m) facts.push(`the den: music ${m.db.toFixed(1)} dBFS (${m.d >= 0 ? '+' : ''}${m.d.toFixed(1)} dB off its file, gain ${g}), its bed ${db(bed.rms).toFixed(1)}`);
      await shot('den');
      const out = await ev(() => {
        const S = window.__m;
        const ok = game.enterArea(2, 'exit');
        return { ok, area: game.area?.id, tracks: S.tracks.slice() };
      });
      expect(out.ok && out.area === MOOR, `out of the den: ${JSON.stringify(out)}`);
      await until(() => game.sfx.music?.el && !game.sfx.music.el.paused, null, "Blood Moor's track to play again");
      await playing('out of the den', MOOR);
      const t = await ev(() => window.__m.tracks.slice());
      expect(t.join(' ') === 'denofevil wild', `into the den and out: tracks started ${t.join(' ')}`);
    },

    async waypoint() {
      const r = await ev(() => {
        window.__m.switches.length = 0;
        return { ok: game.travel(1), area: game.area?.id };
      });
      expect(r.ok && r.area === CAMP, `by waypoint to the camp: ${JSON.stringify(r)}`);
      await until(() => game.sfx.music?.el && !game.sfx.music.el.paused, null, "the camp's track after the waypoint");
      const n = await playing('the camp by waypoint', CAMP);
      expect(n.file === 'music.town.1.m4a', `by waypoint the camp starts on ${n.file}`);
      const t = await ev(() => window.__m.switches.slice());
      expect(t.join(' ') === 'camp', `by waypoint the music switched ${t.join(' ')}`);
    },

    async respawn() {
      // out into Blood Moor (a jump), dead there, brought back in the camp
      await ev(() => game.teleportWithin(window.__m.across(1, 2, 8)));
      await until(() => game.sfx.music?.el?.getAttribute('src')?.endsWith('music.wild.1.m4a') && !game.sfx.music.el.paused, null, "Blood Moor's track before dying");
      const d = await ev(() => {
        const S = window.__m;
        S.debug.god = false;
        game.killPlayer();
        S.debug.god = true;
        S.switches.length = 0;
        return { dead: game.player.dead, area: game.area.id };
      });
      expect(d.dead && d.area === MOOR, `dying in Blood Moor: ${JSON.stringify(d)}`);
      await until(() => document.querySelector('.overlay .death-title')?.closest('.overlay')?.classList.contains('open'), null, 'the death screen', 8000);
      await ev(() => document.querySelector('.overlay .death-title').closest('.overlay').querySelector('.btn').click());
      await until(() => !game.player.dead && game.area?.id === 1, null, 'the respawn in the camp');
      await until(() => game.sfx.music?.el && !game.sfx.music.el.paused, null, "the camp's track after the respawn");
      await playing('the camp after a respawn', CAMP);
      // the camp's track begun again, or if it hadn't faded out yet, brought back
      const t = await ev(() => window.__m.switches.slice());
      expect(/^camp(\(back\))?$/.test(t.join(' ')), `respawning: the music switched ${t.join(' ') || 'never'}`);
    },

    async reload() {
      // saved in Blood Moor, the page reloaded, the save read back as UI.resume does a reload mid-game
      // (?dev starts a new game on a load, which saves over the dev slot: the save is put back first)
      const save = await ev(() => {
        game.teleportWithin(window.__m.across(1, 2, 8));
        game.save();
        return localStorage.getItem('dii-save-dev');
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start again', 60000);
      await helpers();
      const r = await ev((save) => {
        localStorage.setItem('dii-save-dev', save);
        const ok = game.continueGame(undefined, true);
        return { ok, area: game.area?.id, ctx: !!game.sfx.ctx, playing: game.sfx.playing.music };
      }, save);
      expect(!!save && r.ok && r.area === MOOR && !r.ctx && r.playing === TRACK[MOOR], `the save read back: ${JSON.stringify(r)}`);
      await page.mouse.click(640, 400);
      await until(() => game.sfx.ctx?.state === 'running' && game.sfx.music?.el && !game.sfx.music.el.paused, null, "Blood Moor's track after the reload's first click");
      await playing('after a reload', MOOR);
      await fadedIn('after a reload', MOOR);
    },

    async streamed() {
      // every music file came as media, whole or in ranges, and none was fetched to decode
      const decoded = await ev(() => window.__m.decoded.filter((u) => u.includes('/audio/music.')));
      expect(decoded.length === 0, `music decoded whole: ${decoded.join(', ')}`);
      const bad = media.filter((m) => !(m.status === 200 || m.status === 206) || m.type !== 'audio/mp4' || m.as !== 'media');
      expect(media.length > 0 && bad.length === 0, `music requests: ${JSON.stringify(bad.length ? bad : media)}`);
      const files = [...new Set(media.map((m) => m.file))].sort();
      expect(files.join(' ') === 'music.dungeon.1.m4a music.town.1.m4a music.town.2.m4a music.wild.1.m4a', `music files asked for: ${files.join(' ')}`);
      const st = [...new Set(media.map((m) => m.status))].join('/');
      facts.push(`${media.length} music requests (${st}, audio/mp4, as media) for ${files.length} files, none decoded`);
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
  log(fails.length ? `MUSIC FAIL ${fails.join('; ')} (${secs} s); ${facts.join('; ')}` : `MUSIC OK ${facts.join('; ')} in ${secs} s`);
}
