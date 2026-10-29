// The models the game loads (src/render/model-list.ts, which tools/build-models.mjs writes) are the
// files in public/models, no more and no fewer: each animated character a file of its own, each prop
// a root node named by its key in the pack listed for it (packs/<pack>.glb), nothing listed without
// its file or node, nothing shipped that nothing loads. A pack holds each of its pictures once and
// nothing that moves. The debug-only ones (src/render/dev-models.ts, left out of dist by
// vite.config.ts) are files of their own. And whatever the maps place, the heroes hold and the drops
// lie as is a model that's built, so a model taken out of the build (build-models.mjs UNUSED) was one
// the game couldn't show.
import crypto from 'node:crypto';
import fs from 'node:fs';

const SEEDS = [1, 7, 0x5eed, 20261026];
const FLOORS = 12;

/** a GLB's JSON, and its binary chunk */
function readGlb(file) {
  const b = fs.readFileSync(file);
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString());
  const bin = b.subarray(20 + len + 8);
  return { json, bin };
}

export default async (load) => {
  // three and its glTF loader first, as monster-models.test.mjs has them: brought in by a game
  // module first (props.ts, through assets.ts), three comes in a second time when a test asks for it
  await load('three');
  await load('three/examples/jsm/loaders/GLTFLoader.js');
  const { MODEL_KEYS, MODEL_PACKS } = await load('/src/render/model-list.ts');
  const { DEV_MODELS } = await load('/src/render/dev-models.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const listed = new Set(MODEL_KEYS);
  const dir = new URL('../../public/models/', import.meta.url);
  const glbs = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)) : []);

  // the packs: each listed one a file, holding its models as root nodes and nothing else
  const packOf = new Map();
  for (const [pack, keys] of Object.entries(MODEL_PACKS)) {
    for (const k of keys) {
      check(listed.has(k), `pack ${pack} lists ${k}, which model-list.ts doesn't`);
      check(!packOf.has(k), `${k} is in packs ${packOf.get(k)} and ${pack}`);
      packOf.set(k, pack);
    }
    const file = new URL(`packs/${pack}.glb`, dir);
    if (!check(fs.existsSync(file), `pack ${pack} has no file public/models/packs/${pack}.glb`)) continue;
    const { json, bin } = readGlb(file);
    const roots = (json.scenes[json.scene ?? 0].nodes ?? []).map((i) => json.nodes[i]);
    const names = roots.map((n) => n.name).sort();
    check(JSON.stringify(names) === JSON.stringify([...keys].sort()), `packs/${pack}.glb holds ${names.join(' ')}, not what's listed`);
    for (const n of roots) check(n.mesh === undefined && !n.matrix && !n.translation && !n.rotation && !n.scale, `packs/${pack}.glb: ${n.name}'s root node isn't a bare one at the origin`);
    check(!json.animations?.length && !json.skins?.length, `packs/${pack}.glb has clips or skins`);
    const seen = new Map();
    for (const img of json.images ?? []) {
      const v = json.bufferViews[img.bufferView];
      const h = crypto.createHash('sha1').update(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)).digest('hex');
      check(!seen.has(h), `packs/${pack}.glb holds the picture ${img.name} twice (as ${seen.get(h)} too)`);
      seen.set(h, img.name);
    }
  }
  for (const p of glbs(new URL('packs/', dir))) check(MODEL_PACKS[p], `public/models/packs/${p}.glb isn't a pack model-list.ts lists`);

  // the rest, files of their own
  const files = glbs(dir);
  for (const f of files) check(listed.has(f) && !packOf.has(f), `public/models/${f}.glb isn't a model of its own in model-list.ts${packOf.has(f) ? ` (it's in pack ${packOf.get(f)})` : ''}`);
  for (const m of MODEL_KEYS) if (!packOf.has(m)) check(files.includes(m), `${m} is in model-list.ts but public/models has no file of it, nor a pack`);
  for (const m of Object.keys(DEV_MODELS)) check(listed.has(m) && !packOf.has(m), `dev model ${m} isn't built as a file of its own`);

  // the maps of play: the overworld (the camp in it), the Den of Evil, the trial ground's floors
  const { generateOverworld } = await load('/src/world/overworld.ts');
  const { generateDen } = await load('/src/world/den.ts');
  const { generateDungeon } = await load('/src/world/levelgen.ts');
  const { dungeonArea } = await load('/src/world/areas.ts');
  const placed = new Set();
  const scan = (L) => {
    for (const p of L.props ?? []) placed.add(p.model);
    for (const w of L.wallDecor ?? []) placed.add(w.model);
    for (const h of L.houses ?? []) if (h.model) placed.add(h.model);
  };
  for (const s of SEEDS) {
    scan(generateOverworld(s));
    scan(generateDen(s));
    for (let f = 1; f <= FLOORS; f++) scan(generateDungeon(f, s + f, dungeonArea(f)));
  }
  for (const m of placed) check(listed.has(m), `the maps place ${m}, not a built model`);

  // what every weapon and shield base is held as, by a hero and on the floor
  const { ITEM_BASES } = await load('/src/data/items.ts');
  const { heldModel } = await load('/src/render/props.ts');
  const held = new Set();
  for (const b of Object.values(ITEM_BASES)) {
    const h = heldModel(b);
    if (h) held.add(h[0]);
  }
  for (const m of held) check(listed.has(m), `items are held as ${m}, not a built model`);

  if (problems.length) throw new Error(problems.join('\n'));
  const packs = Object.keys(MODEL_PACKS);
  console.log(`  ${MODEL_KEYS.length} models (${packOf.size} in ${packs.length} packs, ${files.length} files of their own, ${Object.keys(DEV_MODELS).length} of those for npm run dev only), all built; maps place ${placed.size}, items are held as ${held.size}, all built`);
};
