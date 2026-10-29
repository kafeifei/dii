// How the model library loads (src/render/assets.ts), on a network stubbed here and a stand-in for
// GLTFLoader that makes a pack's models from its listed keys: what's asked for NOW starts while the
// background is still streaming, and before what's queued for later; a file that fails is tried once
// more and then let go (failed, settled: what waited goes on with its stand-in), and one that fails
// once comes the second time; nothing but NOW starts while something holds the stream back (a level's
// tile textures), and the rest starts once that settles; a key no file serves is never waited on, and
// only the misses that can come are noted (watch).
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
  const fetch0 = globalThis.fetch;
  const warn0 = console.warn;
  globalThis.fetch = async (url) => {
    const file = /models\/(.+)\.glb$/.exec(String(url))[1];
    fetched.push(file);
    await gates.get(file);
    const left = fails.get(file) ?? 0;
    if (left > 0) {
      fails.set(file, left - 1);
      return new Response('down', { status: 503 });
    }
    return new Response(new TextEncoder().encode(file));
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
  const lib = () => Object.assign(new Lib(), { loader });
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
      fails.set('mon_yeti', 0);
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
    globalThis.fetch = fetch0;
    console.warn = warn0;
  }
  if (problems.length) throw new Error(problems.join('\n'));
  console.log('  NOW ahead of the background, a retry then let go, held back until released, no wait on what can\'t come');
};
