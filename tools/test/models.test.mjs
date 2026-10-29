// The models the game loads (src/render/model-list.ts, which tools/build-models.mjs writes) are the
// files in public/models, no more and no fewer: none listed without a file, none shipped that nothing
// loads. The debug-only ones (src/render/dev-models.ts, left out of dist by vite.config.ts) are among
// them. And whatever the maps place, the heroes hold and the drops lie as is a model that's built, so
// a model taken out of the build (build-models.mjs UNUSED) was one the game couldn't show.
import fs from 'node:fs';

const SEEDS = [1, 7, 0x5eed, 20261026];
const FLOORS = 12;

export default async (load) => {
  // three and its glTF loader first, as monster-models.test.mjs has them: brought in by a game
  // module first (props.ts, through assets.ts), three comes in a second time when a test asks for it
  await load('three');
  await load('three/examples/jsm/loaders/GLTFLoader.js');
  const { MODEL_FILES } = await load('/src/render/model-list.ts');
  const { DEV_MODELS } = await load('/src/render/dev-models.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const listed = new Set(MODEL_FILES);
  const files = fs.readdirSync(new URL('../../public/models', import.meta.url)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
  for (const f of files) check(listed.has(f), `public/models/${f}.glb isn't in model-list.ts`);
  for (const m of MODEL_FILES) check(files.includes(m), `${m} is in model-list.ts but public/models has no file`);
  for (const m of Object.keys(DEV_MODELS)) check(listed.has(m), `dev model ${m} isn't built`);

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
  console.log(`  ${MODEL_FILES.length} models (${Object.keys(DEV_MODELS).length} for npm run dev only), all with files; maps place ${placed.size}, items are held as ${held.size}, all built`);
};
