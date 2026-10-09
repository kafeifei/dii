// Optimizes models-src/ into public/models/ (run fetch-models.mjs first).
// node tools/build-models.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, weld } from '@gltf-transform/functions';

const SRC = path.resolve('models-src');
const OUT = path.resolve('public/models');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** KayKit clips we actually play; every KayKit character shares this rig */
const KAYKIT_CLIPS = new Set([
  'Idle', 'Idle_B', 'Idle_Combat', 'Unarmed_Idle', '2H_Melee_Idle', 'Walking_A', 'Walking_D_Skeletons', 'Running_A', 'Running_B',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Spin', 'Unarmed_Melee_Attack_Punch_A', '1H_Ranged_Shoot',
  'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Spellcast_Summon', 'Block', 'Block_Hit', 'Hit_A', 'Hit_B',
  'Death_A', 'Death_B', 'Death_C_Skeletons', 'Death_C_Skeletons_Resurrect', 'Skeletons_Awaken_Standing', 'Cheer', 'Taunt', 'PickUp',
]);

function dropAnim(anim) {
  // disposing an Animation alone leaves its samplers (and their accessors) behind
  for (const c of anim.listChannels()) c.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}

async function build(src, out, opts = {}) {
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
  await doc.transform(dedup(), prune(), weld(), resample(), quantize({ quantizeNormal: 10, quantizePosition: 14 }));
  await io.write(path.join(OUT, out), doc);
  const kb = Math.round(fs.statSync(path.join(OUT, out)).size / 1024);
  console.log(`${out.padEnd(28)} ${String(kb).padStart(5)} KB  anims=${root.listAnimations().length}`);
}

// KayKit characters: only the minion carries the shared animation library
await build('kaykit/Skeleton_Minion.glb', 'skeleton_minion.glb', { keepAnims: (n) => KAYKIT_CLIPS.has(n) });
for (const [s, o] of [
  ['kaykit/Knight.glb', 'knight.glb'],
  ['kaykit/Barbarian.glb', 'barbarian.glb'],
  ['kaykit/Mage.glb', 'mage.glb'],
  ['kaykit/Skeleton_Warrior.glb', 'skeleton_warrior.glb'],
  ['kaykit/Skeleton_Rogue.glb', 'skeleton_rogue.glb'],
  ['kaykit/Skeleton_Mage.glb', 'skeleton_mage.glb'],
]) await build(s, o);
for (const n of ['axe_1handed', 'axe_2handed', 'Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Crossbow', 'Skeleton_Staff', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A']) {
  await build(`kaykit/${n}.gltf`, `${n.toLowerCase()}.glb`);
}
for (const f of fs.readdirSync(path.join(SRC, 'quaternius'))) await build(`quaternius/${f}`, `q_${f}`, { keepAnims: 'all' });
for (const f of fs.readdirSync(path.join(SRC, 'dungeon'))) await build(`dungeon/${f}`, `d_${f}`);
