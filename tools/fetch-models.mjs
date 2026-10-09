// Downloads the raw CC0 model sources into models-src/ (gitignored).
// node tools/fetch-models.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('models-src');
const KK = 'https://raw.githubusercontent.com/KayKit-Game-Assets';
const ADV = `${KK}/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures`;
const SKL = `${KK}/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons`;
const DUN = `${KK}/KayKit-Dungeon-Remastered-1.0/main/addons/kaykit_dungeon_remastered/Assets/gltf`;
const PP = 'https://static.poly.pizza';

/** [local name, url] — KayKit by Kay Lousberg (CC0), Quaternius via poly.pizza (CC0) */
const SOURCES = [
  ['kaykit/Knight.glb', `${ADV}/Characters/gltf/Knight.glb`],
  ['kaykit/Barbarian.glb', `${ADV}/Characters/gltf/Barbarian.glb`],
  ['kaykit/Mage.glb', `${ADV}/Characters/gltf/Mage.glb`],
  ['kaykit/axe_1handed.gltf', `${ADV}/Assets/gltf/axe_1handed.gltf`],
  ['kaykit/axe_2handed.gltf', `${ADV}/Assets/gltf/axe_2handed.gltf`],
  ['kaykit/Skeleton_Minion.glb', `${SKL}/Characters/gltf/Skeleton_Minion.glb`],
  ['kaykit/Skeleton_Warrior.glb', `${SKL}/Characters/gltf/Skeleton_Warrior.glb`],
  ['kaykit/Skeleton_Rogue.glb', `${SKL}/Characters/gltf/Skeleton_Rogue.glb`],
  ['kaykit/Skeleton_Mage.glb', `${SKL}/Characters/gltf/Skeleton_Mage.glb`],
  ['kaykit/Skeleton_Blade.gltf', `${SKL}/Assets/gltf/Skeleton_Blade.gltf`],
  ['kaykit/Skeleton_Axe.gltf', `${SKL}/Assets/gltf/Skeleton_Axe.gltf`],
  ['kaykit/Skeleton_Crossbow.gltf', `${SKL}/Assets/gltf/Skeleton_Crossbow.gltf`],
  ['kaykit/Skeleton_Staff.gltf', `${SKL}/Assets/gltf/Skeleton_Staff.gltf`],
  ['kaykit/Skeleton_Shield_Small_A.gltf', `${SKL}/Assets/gltf/Skeleton_Shield_Small_A.gltf`],
  ['kaykit/Skeleton_Shield_Large_A.gltf', `${SKL}/Assets/gltf/Skeleton_Shield_Large_A.gltf`],
  ...[
    'torch_mounted', 'barrel_large', 'barrel_small_stack', 'trunk_large_A', 'trunk_medium_A', 'box_large', 'crates_stacked',
    'pillar_decorated', 'rubble_large', 'rubble_half', 'coin_stack_small', 'keg', 'sword_shield_broken', 'table_long_broken',
  ].map((n) => [`dungeon/${n}.glb`, `${DUN}/${n}.gltf.glb`]),
  ['quaternius/zombie.glb', `${PP}/c4002f69-6979-42e8-ad6e-2f4e14fc3a9d.glb`],
  ['quaternius/demon_small.glb', `${PP}/46b52ba4-5d2a-4fc8-85cc-3e980f199141.glb`],
  ['quaternius/demon_winged.glb', `${PP}/c2e39eb4-4b8e-4d31-b014-d637bf4e15c6.glb`],
  ['quaternius/demon_blue.glb', `${PP}/6fbb8914-bd11-45e1-a906-51ace2ca5d2d.glb`],
  ['quaternius/tribal.glb', `${PP}/1b4759ca-2c00-4718-90f6-2f84bc8e44f9.glb`],
  ['quaternius/orc.glb', `${PP}/52a479b3-a635-4a23-92cb-6697eaa5eed5.glb`],
  ['quaternius/spider.glb', `${PP}/4259fbdb-afb5-4d40-9108-363625dd6b6e.glb`],
  ['quaternius/ghost.glb', `${PP}/810f60a2-6e45-4c4e-a0d5-da91cd7288bd.glb`],
];

async function get(url, dest) {
  if (fs.existsSync(dest)) return fs.readFileSync(dest);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log('fetched', path.relative(ROOT, dest), buf.length);
  return buf;
}

for (const [name, url] of SOURCES) {
  const dest = path.join(ROOT, name);
  const buf = await get(url, dest);
  if (name.endsWith('.gltf')) {
    // pull external buffers and textures next to the .gltf
    const json = JSON.parse(buf.toString('utf8'));
    const uris = [...(json.buffers ?? []), ...(json.images ?? [])].map((x) => x.uri).filter((u) => u && !u.startsWith('data:'));
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    for (const u of uris) await get(base + u, path.join(path.dirname(dest), u));
  }
}
console.log('done');
