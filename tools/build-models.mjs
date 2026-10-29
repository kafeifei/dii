// Optimizes models-src/ into public/models/ (run fetch-models.mjs first).
// node tools/build-models.mjs            rebuild them all
// node tools/build-models.mjs --prune    only drop the UNUSED ones' files and rewrite the list, no rebuild
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// paths from the repo root, wherever this runs from
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'models-src');
const OUT = path.join(ROOT, 'public/models');
const PRUNE = process.argv.includes('--prune');
fs.mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
if (!PRUNE) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.glb')) fs.rmSync(path.join(OUT, f));
const built = [];

/**
 * Sources nothing in the game can show any more, left unbuilt (they stay in models-src): the old
 * monsters' bodies, which no look draws (src/data/monsters.ts LOOKS); the long trunk the stash was
 * before it became the gold-bound chest; the KayKit shelf, which no room hangs (src/world/furnish.ts)
 */
const UNUSED = new Set(['mon_dragon', 'mon_mushroom', 'mon_skullfly', 'd_trunk_large_A', 'd_shelf_large']);

/** KayKit clips we actually play; every KayKit character shares this rig */
const KAYKIT_CLIPS = new Set([
  'Idle', 'Idle_B', 'Idle_Combat', 'Unarmed_Idle', '2H_Melee_Idle', 'Walking_A', 'Walking_D_Skeletons', 'Running_A', 'Running_B',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin', 'Unarmed_Melee_Attack_Punch_A', '1H_Ranged_Shoot',
  'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcast_Summon', 'Block', 'Block_Hit', 'Hit_A', 'Hit_B',
  'Death_A', 'Death_B', 'Death_C_Skeletons', 'Death_C_Skeletons_Resurrect', 'Skeletons_Awaken_Standing', 'Cheer', 'Taunt', 'PickUp',
]);

/**
 * Triangles and texture size a model needs at the isometric camera's distance (Meshy delivers far
 * more): the player's own character is looked at most, small things least. `error` caps how far
 * simplification may move the surface (fraction of the model's size), so detail that matters stays.
 */
const SMALL = /^(g_|w_|axe_|skeleton_(blade|axe|staff|crossbow|shield)|h_(bone|skull|candle)|d_(candle|bottle|coin|keyring)|x_rock)/;
const LARGE = /^(x_(tavern|blacksmith|home_|well)|h_crypt|h_arch_gate|p_entrance)/;
function budget(name) {
  if (name === 'paladin' || name === 'sorceress') return { tris: 20000, error: 0.006 };
  if (name.startsWith('npc_')) return { tris: 9000, error: 0.012, texture: 512 };
  if (name.startsWith('mon_')) return { tris: 7000, error: 0.015 };
  if (SMALL.test(name)) return { tris: 1500, error: 0.02, texture: 256 };
  if (LARGE.test(name)) return { tris: 6000, error: 0.015 };
  if (/^[dhxpw]_/.test(name)) return { tris: 3000, error: 0.015 };
  return null;
}

const triangles = (root) => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);

function dropAnim(anim) {
  // disposing an Animation alone leaves its samplers (and their accessors) behind
  for (const c of anim.listChannels()) c.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

async function build(src, out, opts = {}) {
  const key = out.replace('.glb', '');
  if (UNUSED.has(key)) return;
  if (PRUNE) {
    // the file built last stays as it is
    if (!fs.existsSync(path.join(OUT, out))) throw new Error(`${out} isn't built yet: run without --prune`);
    built.push(key);
    return;
  }
  // an AI-generated replacement (tools/ai-props.mjs) takes over the pack model's key
  if (!src.startsWith('ai/') && fs.existsSync(path.join(SRC, 'ai-props', out))) src = `ai-props/${out}`;
  const doc = await io.read(path.join(SRC, src));
  const root = doc.getRoot();
  for (const anim of root.listAnimations()) {
    const name = anim.getName();
    const keep = opts.keepAnims === 'all' ? true : opts.keepAnims ? opts.keepAnims(name) : false;
    if (!keep) dropAnim(anim);
  }
  // Quaternius exports sometimes duplicate every clip with and without the armature prefix
  const seen = new Set();
  for (const anim of root.listAnimations()) {
    const short = anim.getName().split('|').pop();
    if (seen.has(short)) dropAnim(anim);
    else {
      seen.add(short);
      anim.setName(short);
    }
  }
  const b = budget(key);
  const before = triangles(root);
  await doc.transform(dedup(), prune(), weld(), resample());
  // lockBorder keeps a chest lid cut from its body from pulling apart along the cut
  if (b && before > b.tris) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: b.tris / before, error: b.error, lockBorder: out === 'd_chest_gold.glb' }), prune());
  if (b?.texture && root.listTextures().some((t) => (t.getSize()?.[0] ?? 0) > b.texture)) {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [b.texture, b.texture] }));
  }
  // meshopt-compressed (the runtime loader decodes it): a quarter to a half of the plain size
  await doc.transform(quantize({ quantizeNormal: 10, quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(path.join(OUT, out), doc);
  built.push(key);
  const kb = Math.round(fs.statSync(path.join(OUT, out)).size / 1024);
  const after = triangles(root);
  console.log(`${out.padEnd(28)} ${String(kb).padStart(5)} KB  anims=${root.listAnimations().length}${after < before ? `  tris ${Math.round(before)} → ${Math.round(after)}` : ''}`);
}

// KayKit characters are all replaced by AI ones; the knight (?knight) and the minion carrying the
// shared animation library stay for comparison, in `npm run dev` only (src/render/dev-models.ts)
await build('kaykit/Skeleton_Minion.glb', 'skeleton_minion.glb', { keepAnims: (n) => KAYKIT_CLIPS.has(n) });
await build('kaykit/Knight.glb', 'knight.glb');
for (const n of ['axe_1handed', 'axe_2handed', 'Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Crossbow', 'Skeleton_Staff', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A']) {
  await build(`kaykit/${n}.gltf`, `${n.toLowerCase()}.glb`);
}
// Quaternius monsters: all replaced by AI ones (models-src/ai/mon_*)
for (const f of fs.readdirSync(path.join(SRC, 'dungeon'))) await build(`dungeon/${f}`, `d_${f}`, { keepAnims: f.startsWith('chest') ? 'all' : undefined });
// AI-generated characters (tools/ai-*.mjs pipeline writes finished glb into models-src/ai)
if (fs.existsSync(path.join(SRC, 'ai'))) {
  for (const f of fs.readdirSync(path.join(SRC, 'ai'))) if (f.endsWith('.glb')) await build(`ai/${f}`, f, { keepAnims: 'all' });
}
const gltfs = (dir) => fs.readdirSync(path.join(SRC, dir)).filter((f) => f.endsWith('.gltf'));
for (const f of gltfs('halloween')) await build(`halloween/${f}`, `h_${f.replace('.gltf', '.glb')}`);
for (const f of gltfs('hexagon')) await build(`hexagon/${f}`, `x_${f.replace('.gltf', '.glb').replace('building_', '').replace('_red', '')}`);

// AI models that don't stand in for a pack model (new monsters and the like)
if (fs.existsSync(path.join(SRC, 'ai-props'))) {
  for (const f of fs.readdirSync(path.join(SRC, 'ai-props'))) if (f.endsWith('.glb') && !built.includes(f.replace('.glb', ''))) await build(`ai-props/${f}`, f);
}

if (PRUNE) {
  for (const f of fs.readdirSync(OUT)) {
    if (!f.endsWith('.glb')) continue;
    if (UNUSED.has(f.replace('.glb', ''))) {
      fs.rmSync(path.join(OUT, f));
      console.log(`dropped ${f}`);
    } else if (!built.includes(f.replace('.glb', ''))) console.warn(`${f}: no source builds it any more; left in place, and not loaded`);
  }
}

// the runtime preloads exactly what was built
built.sort();
fs.writeFileSync(
  path.join(ROOT, 'src/render/model-list.ts'),
  `// generated by tools/build-models.mjs — do not edit\nexport const MODEL_FILES = [\n${built.map((b) => `  '${b}',`).join('\n')}\n] as const;\n`,
);
console.log(`${built.length} models, list written to src/render/model-list.ts`);
