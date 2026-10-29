// Optimizes models-src/ into public/models/ (run fetch-models.mjs first): each animated character a
// file of its own (<key>.glb), every other model (a prop) a root node named by its key in the pack of
// the models used in the same places (packs/<pack>.glb). src/render/model-list.ts lists them all.
// Pictures are cut to the size the game shows them at (TEXELS below, tools/texel-density.json).
// node tools/build-models.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { compressTexture, dedup, listTextureSlots, mergeDocuments, meshopt, prune, quantize, resample, simplify, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// paths from the repo root, wherever this runs from
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'models-src');
const OUT = path.join(ROOT, 'public/models');
const PACK_DIR = path.join(OUT, 'packs');
fs.mkdirSync(PACK_DIR, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
// the last build's output goes, so a model no longer built leaves no file behind
for (const dir of [OUT, PACK_DIR]) for (const f of fs.readdirSync(dir)) if (f.endsWith('.glb')) fs.rmSync(path.join(dir, f));
const built = [];
/** the props built so far, by pack */
const packs = new Map();

/**
 * Sources nothing in the game can show any more, left unbuilt (they stay in models-src): the old
 * monsters' bodies, which no look draws (src/data/monsters.ts LOOKS); the long trunk the stash was
 * before it became the gold-bound chest; the KayKit shelf, which no room hangs (src/world/furnish.ts)
 */
const UNUSED = new Set(['mon_dragon', 'mon_mushroom', 'mon_skullfly', 'd_trunk_large_A', 'd_shelf_large']);

/** the models the game animates, the heroes, the townsfolk and the monsters: each a file of its own */
const CHARACTER = /^(mon_|npc_)|^(paladin|sorceress|ai_hero|knight|skeleton_minion)$/;

/** what stands in the camp besides its buildings: its gates, lantern posts, fire, tents and waypoint, the vendor's table, the stash (the gold-bound chest, the trunk where that's missing) */
const CAMP = new Set(['h_arch_gate', 'h_post_lantern', 'p_campfire', 'p_tent', 'p_waypoint', 'd_table_long_decorated_A', 'd_stool', 'd_chest_gold', 'd_trunk_medium_A']);

/**
 * Every other model, a prop, goes in a pack of those used in the same places: one file to fetch for
 * them all, each picture in it once. The first pack whose test a key passes takes it, so a model used
 * in several places goes with the first of them a game comes to (the camp, then the moor, then the
 * dungeons): what the camp needs is in the camp's packs.
 */
const PACKS = [
  // held by the heroes, the monsters and the townsfolk (src/render/specs.ts), and lying on the floor once dropped (props.ts heldModel)
  ['weapons', (k) => /^(w_|axe_|skeleton_(blade|axe|crossbow|staff|shield))/.test(k)],
  // what the other drops and gold lie on the floor as (props.ts GROUND_MODELS, makeGroundItem)
  ['drops', (k) => /^(g_|d_coin_)/.test(k)],
  ['camp', (k) => /^x_(tavern|home_|blacksmith|well)/.test(k) || CAMP.has(k)],
  // graves, fences and crypts, the camp's graveyard's and the moor's, and the candles, lanterns and shrines about them
  ['graveyard', (k) => /^h_(crypt|grave|fence|lantern|skull_candle|candle_melted|shrine$|post_skull)/.test(k)],
  // rocks and trees, inside the palisade and out
  ['nature', (k) => /^(x_(rock|tree)_|h_tree_)/.test(k)],
  // the moor's monster camps, ruins and remains (strewn through the dungeons too), its cave mouths and the barrels broken open there
  ['wild', (k) => /^(p_(banner|cage|skullpile|entrance|brazier)|d_(rubble_|pillar$|sword_shield_broken$|barrel_large$)|h_(pillar$|bone_|ribcage$|skull$))/.test(k)],
  // the rest: the dungeons' furniture and hangings, torches, pillars, stalagmites and crystals
  ['dungeon', () => true],
];

/** KayKit clips we actually play; every KayKit character shares this rig */
const KAYKIT_CLIPS = new Set([
  'Idle', 'Idle_B', 'Idle_Combat', 'Unarmed_Idle', '2H_Melee_Idle', 'Walking_A', 'Walking_D_Skeletons', 'Running_A', 'Running_B',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin', 'Unarmed_Melee_Attack_Punch_A', '1H_Ranged_Shoot',
  'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcast_Summon', 'Block', 'Block_Hit', 'Hit_A', 'Hit_B',
  'Death_A', 'Death_B', 'Death_C_Skeletons', 'Death_C_Skeletons_Resurrect', 'Skeletons_Awaken_Standing', 'Cheer', 'Taunt', 'PickUp',
]);

/**
 * Triangles a model needs at the isometric camera's distance (Meshy delivers far more): the player's
 * own character is looked at most, small things least. `error` caps how far simplification may move
 * the surface (fraction of the model's size), so detail that matters stays. `texture` caps its
 * pictures' size (they are sized by how big they are seen: pictureWidth).
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

/**
 * Pictures are as big as the game ever shows them, and no bigger. The camera is orthographic, its
 * half-height `zoom` metres (src/render/renderer.ts): 7.2 by default, 4.5 at the nearest the wheel
 * goes; on a phone the screen's height over 84 (42 CSS px a metre). So a metre is CSS height / (2 ×
 * zoom) × the pixel ratio device pixels: 126 on a phone at DPR 3 drawn at 100%, 178 on a 1280×800
 * laptop at 2× zoomed all the way in, 186 on a 16-inch one in full screen at the 'auto' 1.5×, 200 on
 * a 5K screen at 100% at the game's own zoom, 240 on a 5K / Studio Display at the 'auto' 1.5× zoomed
 * all the way in (the most the default setting shows). A picture gets the smallest of SIZES (never
 * more than it comes at, nor than its budget's `texture`) that gives TEXELS texels a metre where its
 * model is drawn biggest (tools/texel-density.json, measured in the game by tools/texel-density.mjs,
 * a mean over each mesh's surface: see there): a colour picture one texel a device pixel at 200 px a
 * metre, a data picture (normals) half that, its detail being only shading. Past 200 px a metre (240
 * zoomed all the way in at 'auto' on a 5K screen, 320 there at 1:1, the 「高」 preset) a cut picture
 * shows a little softer. A model the measure hasn't seen keeps its pictures as they come; one
 * cut is encoded as WebP at QUALITY (as tools/ai-props.mjs makes them), one kept is left as it is.
 */
const TEXELS = { colour: 200, data: 100 };
const SIZES = [64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048];
const QUALITY = 85;
const DENSITY = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/texel-density.json'), 'utf8')).models;
/** the material slots whose pictures are colour (sRGB); the rest are data */
const COLOUR = new Set(['baseColorTexture', 'emissiveTexture']);

/** the width a picture `width` across needs, filling `slots` on the models `keys` */
function pictureWidth(keys, slots, width) {
  let need = 0;
  for (const key of keys) {
    for (const slot of slots) {
      const d = DENSITY[key]?.[slot];
      const w = d ? (SIZES.find((s) => s >= (1024 * TEXELS[COLOUR.has(slot) ? 'colour' : 'data']) / d) ?? width) : width;
      need = Math.max(need, Math.min(w, budget(key)?.texture ?? Infinity));
    }
  }
  return Math.min(width, need || width);
}

/** each picture in `doc` cut to the width its models need (`keysOf(texture)`: the models it's on) */
async function sizePictures(doc, keysOf, label) {
  for (const t of doc.getRoot().listTextures()) {
    const size = t.getSize();
    if (!size) continue;
    const was = Math.max(...size);
    const w = pictureWidth(keysOf(t), listTextureSlots(t), was);
    if (w >= was) continue;
    await compressTexture(t, { encoder: sharp, targetFormat: 'webp', quality: QUALITY, effort: 100, resize: [w, w] });
    resized.push(`${label}: ${t.getName()} ${was} → ${w}`);
  }
  if (doc.getRoot().listTextures().some((t) => t.getMimeType() === 'image/webp')) doc.createExtension(EXTTextureWebP).setRequired(true);
}
/** what sizePictures cut, said at the end */
const resized = [];

/** the keys of a pack's models a texture is on: the root nodes (named by key) above its meshes */
function packKeys(t) {
  const keys = new Set();
  for (const mat of t.listParents().filter((p) => p.propertyType === PropertyType.MATERIAL)) {
    for (const prim of mat.listParents().filter((p) => p.propertyType === PropertyType.PRIMITIVE)) {
      for (const mesh of prim.listParents().filter((p) => p.propertyType === PropertyType.MESH)) {
        for (let node of mesh.listParents().filter((p) => p.propertyType === PropertyType.NODE)) {
          for (let up = node.getParentNode(); up; up = up.getParentNode()) node = up;
          keys.add(node.getName());
        }
      }
    }
  }
  return [...keys];
}

const triangles = (root) => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);

function dropAnim(anim) {
  // disposing an Animation alone leaves its samplers (and their accessors) behind
  for (const c of anim.listChannels()) c.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

/** three's PropertyBinding.sanitizeNodeName, which GLTFLoader names objects through */
const sanitize = (name) => name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');

/**
 * Why a prop can't go in a pack, or null: one that moves loads as a character does. And the runtime
 * gives a packed model's objects back the names a file of its own would load with (a node's name, else
 * its mesh's, else mesh_<index>; src/render/assets.ts ownNames), which only works out the same where
 * they are all different and each mesh is one object, a single primitive.
 */
function unpackable(root) {
  if (root.listAnimations().length || root.listSkins().length) return 'it has clips or a skin';
  const meshes = root.listMeshes();
  if (meshes.some((m) => m.listPrimitives().length > 1)) return 'a mesh of several primitives';
  const names = root.listNodes().map((n) => (n.getName() ? sanitize(n.getName()) : n.getMesh() ? sanitize(n.getMesh().getName() || `mesh_${meshes.indexOf(n.getMesh())}`) : ''));
  const named = names.filter(Boolean);
  if (new Set(named).size < named.length) return 'two of its objects would have the same name';
  return null;
}

async function build(src, out, opts = {}) {
  const key = out.replace('.glb', '');
  if (UNUSED.has(key)) return;
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
  // meshopt-compressed (the runtime loader decodes it): a quarter to a half of the plain size. Fewer
  // bits make it no smaller (12 for positions, 11 for uvs, tried 2026-10-29: within 0.3%), and the
  // normals are written as 8-bit octahedral whatever quantize says (EXT_meshopt_compression's filter)
  await doc.transform(quantize({ quantizeNormal: 10, quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  built.push(key);
  const after = triangles(root);
  const note = `anims=${root.listAnimations().length}${after < before ? `  tris ${Math.round(before)} → ${Math.round(after)}` : ''}`;
  const why = CHARACTER.test(key) ? 'a character' : unpackable(root);
  if (!why) {
    // processed exactly as a file of its own, then merged into its pack once all are built (its
    // pictures sized there, by all the models sharing each)
    const pack = PACKS.find(([, test]) => test(key))[0];
    if (!packs.has(pack)) packs.set(pack, []);
    packs.get(pack).push({ key, doc });
    console.log(`${key.padEnd(36)} → packs/${pack}  ${note}`);
    return;
  }
  if (!CHARACTER.test(key)) console.log(`${key}: a file of its own, not packed: ${why}`);
  await sizePictures(doc, () => [key], out);
  await io.write(path.join(OUT, out), doc);
  const kb = Math.round(fs.statSync(path.join(OUT, out)).size / 1024);
  console.log(`${out.padEnd(36)} ${String(kb).padStart(5)} KB  ${note}`);
}

/**
 * A texture GLTFLoader loads once for all the materials using it, colour space and all: one that
 * stands for colour in one (base colour, emission: sRGB) and for data in another (normals,
 * roughness: linear) would come out wrong in one of them. Copies of a picture merge only into one
 * used the same way.
 */
function checkTextureUse(doc, pack) {
  const COLOUR = new Set(['baseColorTexture', 'emissiveTexture']);
  for (const t of doc.getRoot().listTextures()) {
    const uses = new Set(doc.getGraph().listParentEdges(t).filter((e) => e.getParent().propertyType === PropertyType.MATERIAL).map((e) => COLOUR.has(e.getName())));
    if (uses.size > 1) throw new Error(`packs/${pack}: texture ${t.getName()} is used as colour and as data`);
  }
}

/** a pack: each model's scene under a root node of its key's name, at the origin as its own file's scene is */
async function writePack(pack, members) {
  const doc = new Document();
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);
  let pictures = 0;
  for (const { key, doc: src } of members.sort((a, b) => (a.key < b.key ? -1 : 1))) {
    pictures += src.getRoot().listTextures().length;
    const map = mergeDocuments(doc, src);
    const was = map.get(src.getRoot().getDefaultScene() ?? src.getRoot().listScenes()[0]);
    const node = doc.createNode(key);
    for (const n of was.listChildren()) node.addChild(n);
    scene.addChild(node);
    was.dispose();
  }
  // one buffer, as a GLB has; and each picture once, the materials of the models sharing one swapped onto it
  await doc.transform(unpartition(), dedup({ propertyTypes: [PropertyType.TEXTURE] }));
  checkTextureUse(doc, pack);
  await sizePictures(doc, packKeys, `packs/${pack}`);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const file = path.join(PACK_DIR, `${pack}.glb`);
  await io.write(file, doc);
  const kb = Math.round(fs.statSync(file).size / 1024);
  const kept = doc.getRoot().listTextures().length;
  console.log(`${`packs/${pack}.glb`.padEnd(36)} ${String(kb).padStart(5)} KB  ${members.length} models, ${kept} pictures${kept < pictures ? ` (${pictures - kept} shared)` : ''}`);
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

const byPack = [...packs.keys()].sort();
for (const p of byPack) await writePack(p, packs.get(p));

// the runtime loads exactly what was built
built.sort();
const list = (keys, pad) => keys.map((k) => `${pad}'${k}',`).join('\n');
fs.writeFileSync(
  path.join(ROOT, 'src/render/model-list.ts'),
  `// generated by tools/build-models.mjs — do not edit
/** every model the game can show, by key */
export const MODEL_KEYS = [
${list(built, '  ')}
] as const;

/**
 * The props by pack: public/models/packs/<pack>.glb holds each as a root node named by its key. The
 * rest, the animated characters, are files of their own (public/models/<key>.glb).
 */
export const MODEL_PACKS: Readonly<Record<string, readonly (typeof MODEL_KEYS)[number][]>> = {
${byPack.map((p) => `  ${p}: [\n${list(packs.get(p).map((m) => m.key).sort(), '    ')}\n  ],`).join('\n')}
};
`,
);
const packed = byPack.reduce((n, p) => n + packs.get(p).length, 0);
console.log(`pictures cut to the size they are seen at (${resized.length}):\n  ${resized.join('\n  ')}`);
console.log(`${built.length} models (${packed} of them in ${byPack.length} packs), list written to src/render/model-list.ts`);
