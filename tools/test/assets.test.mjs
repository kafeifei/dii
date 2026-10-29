// How the model library loads (src/render/assets.ts), on a network stubbed here and a stand-in for
// GLTFLoader that makes a pack's models from its listed keys: what's asked for NOW starts while the
// background is still streaming, and before what's queued for later; a file that fails is tried once
// more and then let go (failed, settled: what waited goes on with its stand-in), and one that fails
// once comes the second time; one let go whose tries in the background are spent is tried again at
// once when a level asks for it (not waited on), coming if it can; nothing but NOW starts while a NOW file is still coming or something
// holds the stream back (a level's tile textures), and the rest starts once that settles; making way
// stops a background download with most of its file to go (queued again, no try spent, started over
// once let go) and lets one nearly in finish; what yields with the background (Sfx's lines fetched
// ahead) is told to make way with it and told it may go once nothing holds the network; a key no file
// serves is never waited on, and only the misses that can come are noted (watch). The libraries made
// here have their tries in the background stopped before the real fetch is back.
export default async (load) => {
  const THREE = await load('three');
  const { assets, NOW, LATER } = await load('/src/render/assets.ts');
  const { MODEL_PACKS } = await load('/src/render/model-list.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const Lib = assets.constructor;
  const fetched = [];
  const fails = new Map();
  const gates = new Map();
  /** files that come most of the way at once, the rest once this opens */
  const tails = new Map();
  const fetch0 = globalThis.fetch;
  const warn0 = console.warn;
  globalThis.fetch = async (url, opts = {}) => {
    const file = /models\/(.+)\.glb$/.exec(String(url))[1];
    fetched.push(file);
    // a stopped download (its signal aborted) fails as fetch does
    const stopped = new Promise((_, no) => opts.signal?.addEventListener('abort', () => no(new DOMException('stopped', 'AbortError'))));
    stopped.catch(() => {});
    await Promise.race([gates.get(file), stopped]);
    const left = fails.get(file) ?? 0;
    if (left > 0) {
      fails.set(file, left - 1);
      return new Response('down', { status: 503 });
    }
    const bytes = new TextEncoder().encode(file);
    const tail = tails.get(file);
    if (!tail) return new Response(bytes);
    const cut = Math.ceil(bytes.length * 0.8);
    const body = new ReadableStream({
      async start(c) {
        c.enqueue(bytes.slice(0, cut));
        await tail;
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    return new Response(body, { headers: { 'content-length': String(bytes.length) } });
  };
  console.warn = () => {};
  /** what GLTFLoader would make of the file: a pack's models each a root node named by its key */
  const loader = {
    async parseAsync(buf) {
      const file = new TextDecoder().decode(buf);
      const keys = file.startsWith('packs/') ? MODEL_PACKS[file.slice(6)] : [file];
      const scene = new THREE.Group();
      for (const k of keys) {
        const root = new THREE.Group();
        root.userData.name = k;
        scene.add(root);
      }
      return { scene, scenes: [scene], animations: [], parser: { associations: new Map(), json: { meshes: [] } } };
    },
  };
  /** the libraries made here, done with at the end (dispose) */
  const libs = [];
  const lib = () => {
    const l = Object.assign(new Lib(), { loader });
    libs.push(l);
    return l;
  };
  /**
   * a library's tries in the background stopped (a file given up on is tried again seconds to minutes
   * on): one left waiting would fetch through the real fetch once this test has put it back (a
   * 'model failed … Failed to parse URL' stack), or through another test's stand-in for it (sfx.test.mjs)
   */
  const dispose = (l) => {
    for (const s of l.sources) {
      clearTimeout(s.timer);
      s.timer = undefined;
    }
  };
  const gate = (file) => {
    let open = () => {};
    gates.set(file, new Promise((r) => (open = r)));
    return () => {
      gates.delete(file);
      open();
    };
  };
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  try {
    // the background streams two at a time; NOW goes ahead of what's queued for later
    {
      const a = lib();
      // the keys given first are streamed first: the drops pack, then the graveyard's
      const open = [gate('packs/drops'), gate('packs/graveyard')];
      a.stream(['g_ring', 'h_crypt']);
      await tick();
      check(fetched.join() === 'packs/drops,packs/graveyard', `streaming began with ${fetched.join()}`);
      const now = a.ensure(['mon_lich'], NOW);
      await tick();
      check(fetched[2] === 'mon_lich', `NOW went after ${fetched.join()}`);
      await now;
      check(a.has('mon_lich') && !a.has('mon_bat'), 'the file asked for NOW is in, the rest not yet');
      for (const o of open) o();
      await a.ensure(['g_ring', 'h_crypt', 'x_well']);
      check(a.has('g_ring') && a.has('h_crypt') && a.has('x_well') && a.settled('x_well'), 'the packs came');
      await a.ensureAll();
      check(a.stats().in === a.stats().files && !a.stats().coming, `ensureAll left ${JSON.stringify(a.stats())}`);
    }
    // a failed try is tried again; failing twice it's let go, its stand-in kept, nothing left waiting
    {
      fetched.length = 0;
      const b = lib();
      fails.set('mon_bat', 1);
      fails.set('mon_yeti', 99);
      const t0 = Date.now();
      await b.ensure(['mon_bat', 'mon_yeti'], NOW);
      const waited = Date.now() - t0;
      check(b.has('mon_bat') && fetched.filter((f) => f === 'mon_bat').length === 2, `mon_bat after a failure: in ${b.has('mon_bat')}, fetched ${fetched.filter((f) => f === 'mon_bat').length}×`);
      check(!b.has('mon_yeti') && b.failed('mon_yeti') && b.settled('mon_yeti') && fetched.filter((f) => f === 'mon_yeti').length === 2, `mon_yeti failing: in ${b.has('mon_yeti')}, failed ${b.failed('mon_yeti')}, fetched ${fetched.filter((f) => f === 'mon_yeti').length}×`);
      check(waited < 3000, `the waiting took ${waited} ms`);
      check(b.stats().failed.includes('mon_yeti'), `stats: ${JSON.stringify(b.stats())}`);
      // asked for again once given up on: not waited on (it's tried again in the background)
      const t1 = Date.now();
      await b.ensure(['mon_yeti'], NOW);
      check(Date.now() - t1 < 50, 'a file given up on was waited on again');
      // that try over (it fails), its next one waits some seconds off: stopped at the end (dispose)
      await tick(20);
      fails.set('mon_yeti', 0);
    }
    // given up on, and its tries in the background spent (some 6.7 minutes of them, as after a long
    // outage): a level asking for it again tries it at once, nothing waiting on it; still down, its
    // tries in the background start over; back up, it comes
    {
      fetched.length = 0;
      const g = lib();
      const s = g.sources.find((x) => x.file === 'mon_butcher');
      const count = () => fetched.filter((f) => f === 'mon_butcher').length;
      const spent = () => {
        clearTimeout(s.timer);
        s.timer = undefined;
        s.tries = 12;
      };
      fails.set('mon_butcher', 99);
      await g.ensure(['mon_butcher'], NOW);
      check(g.failed('mon_butcher') && s.state === 'retry' && s.timer && count() === 2, `mon_butcher failing: failed ${g.failed('mon_butcher')}, ${s.state}, a later try ${s.timer ? 'waiting' : 'not waiting'}, fetched ${count()}×`);
      spent();
      const t0 = Date.now();
      await g.ensure(['mon_butcher'], NOW);
      const waited = Date.now() - t0;
      await tick(20);
      check(waited < 50 && count() === 3 && g.failed('mon_butcher') && s.state === 'retry' && s.timer && s.tries === 2, `asked for again, still down: waited ${waited} ms, fetched ${count()}×, failed ${g.failed('mon_butcher')}, ${s.state}, ${s.tries} tries, a later try ${s.timer ? 'waiting' : 'not waiting'}`);
      fails.set('mon_butcher', 0);
      spent();
      await g.ensure(['mon_butcher'], NOW);
      await tick(20);
      check(g.has('mon_butcher') && !g.failed('mon_butcher') && g.settled('mon_butcher') && count() === 4 && !s.timer, `asked for again, back up: in ${g.has('mon_butcher')}, failed ${g.failed('mon_butcher')}, fetched ${count()}×`);
    }
    // while a file something waits on (NOW) is coming, nothing else starts; the rest once it's in
    {
      fetched.length = 0;
      const f = lib();
      const open = gate('mon_skeleton');
      const now = f.ensure(['mon_skeleton'], NOW);
      f.stream();
      await tick(20);
      check(fetched.join() === 'mon_skeleton', `while the NOW file came, fetched ${fetched.join()}`);
      open();
      await now;
      await tick(20);
      check(fetched.length > 1, `once it was in, fetched ${fetched.join()}`);
      await f.ensureAll();
    }
    // held back: only NOW starts until what holds it settles
    {
      fetched.length = 0;
      const c = lib();
      let release = () => {};
      c.hold(new Promise((r) => (release = r)));
      const later = c.ensure(['mon_wraith'], LATER);
      const now = c.ensure(['mon_demon'], NOW);
      await now;
      await tick(20);
      check(fetched.join() === 'mon_demon', `while held, fetched ${fetched.join()}`);
      release();
      await later;
      check(c.has('mon_wraith'), 'what was held back came once released');
    }
    // making way: the background download with most of its file to go stops and is queued again with
    // no try spent, starting over once let go; the one nearly in finishes
    {
      fetched.length = 0;
      const e = lib();
      const src = (f) => e.sources.find((s) => s.file === f);
      const openGhoul = gate('mon_ghoul');
      let tailOpen = () => {};
      tails.set('mon_imp', new Promise((r) => (tailOpen = r)));
      e.stream(['mon_ghoul', 'mon_imp']);
      await tick(20);
      check(fetched.join() === 'mon_ghoul,mon_imp', `the background began with ${fetched.join()}`);
      let release = () => {};
      e.hold(new Promise((r) => (release = r)));
      e.makeWay();
      await tick(20);
      const g = src('mon_ghoul');
      check(g.state === 'queued' && g.tries === 0 && !e.failed('mon_ghoul') && !e.settled('mon_ghoul'), `the download with most to go: ${g.state}, ${g.tries} tries`);
      check(src('mon_imp').state === 'loading', `the one nearly in: ${src('mon_imp').state}`);
      tailOpen();
      await e.ensure(['mon_imp'], LATER);
      await tick(20);
      check(e.has('mon_imp') && fetched.length === 2, `while held: in ${e.has('mon_imp')}, fetched ${fetched.join()}`);
      release();
      openGhoul();
      await e.ensure(['mon_ghoul'], LATER);
      check(e.has('mon_ghoul') && fetched.filter((f) => f === 'mon_ghoul').length === 2 && src('mon_ghoul').tries === 1, `started over once let go: in ${e.has('mon_ghoul')}, fetched ${fetched.filter((f) => f === 'mon_ghoul').length}×`);
      tails.delete('mon_imp');
      await e.ensureAll();
    }
    // what yields with the background (Sfx's lines fetched ahead): told to make way with it, and told
    // it may go once nothing holds the network, not while something does
    {
      const h = lib();
      const told = [];
      h.yieldWith({ makeWay: () => told.push('makeWay'), free: () => told.push(`free ${h.busy()}`) });
      let release = () => {};
      h.hold(new Promise((r) => (release = r)));
      const now = h.ensure(['mon_zombie'], NOW);
      h.makeWay();
      await now;
      await tick(20);
      check(told.join() === 'makeWay', `while held: told ${told.join()}`);
      release();
      await tick(20);
      check(told.length > 1 && told.slice(1).every((t) => t === 'free false'), `once released: told ${told.join()}`);
    }
    // keys no file serves are never waited on; only misses that can come are noted
    {
      const d = lib();
      const t = Date.now();
      await d.ensure(['no_such_model']);
      check(Date.now() - t < 50 && d.settled('no_such_model'), 'a key no file serves was waited on');
      const [, missed] = d.watch(() => {
        d.get('mon_spider');
        d.get('no_such_model');
      });
      check(missed && [...missed].join() === 'mon_spider', `misses noted: ${missed && [...missed].join()}`);
      const [, none] = d.watch(() => 1);
      check(none === null, 'a build that missed nothing has misses');
    }
  } finally {
    // before the real fetch is back: mon_yeti, given up on, would be tried again some seconds on
    for (const l of libs) dispose(l);
    globalThis.fetch = fetch0;
    console.warn = warn0;
  }
  if (problems.length) throw new Error(problems.join('\n'));
  console.log('  NOW ahead of the background and alone while it comes, a retry then let go, asked for again once its tries are spent and in, held back until released, way made by stopping what had most to go, what yields with it told, no wait on what can\'t come');
};
