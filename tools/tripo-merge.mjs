// Brings a rigged, animated Tripo Studio export into models-src/ai/<key>.glb, the form
// tools/build-models.mjs expects (tools/meshy-merge.mjs does the same for Meshy characters).
// Exports live in models-src/tripo/ (not committed); fetch one again with @tripo3d/cli, e.g.
//   tripo process animate <project> --rig-type octopod --animations preset:octopod:walk -o models-src/tripo/spider.glb
// node tools/tripo-merge.mjs [<key> ...]
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

/**
 *   file     the export in models-src/tripo/
 *   project  the Tripo Studio project it came from
 *   clips    Tripo clip name → the name the game plays it under
 *   pace     speed-up for the clips: Tripo's presets amble
 *   idle     hold this clip's first frame as a still 'Idle' (code adds the twitches)
 *   rename   bones Tripo leaves as bone_N, named for the code that poses them (src/render/legs.ts)
 */
const CREATURES = {
  mon_spider: {
    file: 'spider.glb',
    project: 'd0bd6dd2-2a5b-4a7f-ac49-a04320a8d5a6',
    clips: { 'preset:octopod:walk': 'Walk' },
    pace: 6,
    idle: 'Walk',
    rename: {
      // the rear left leg's lower half (the right one is named)
      bone_50: '0_Left_Limb_2',
      bone_51: '0_Left_Limb_3',
      // pedipalps, then the fangs hanging under the head
      bone_4: 'Palp_Right_0',
      bone_5: 'Palp_Right_1',
      bone_6: 'Palp_Left_0',
      bone_7: 'Palp_Left_1',
      bone_54: 'Fang_Right_0',
      bone_55: 'Fang_Right_1',
      bone_56: 'Fang_Right_2',
      bone_57: 'Fang_Left_0',
      bone_58: 'Fang_Left_1',
      bone_59: 'Fang_Left_2',
    },
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

async function merge(key) {
  const spec = CREATURES[key];
  const doc = await io.read(path.resolve('models-src/tripo', spec.file));
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];

  // Tripo faces +X; the game's models face +Z
  const scene = root.listScenes()[0];
  const facing = doc.createNode('Facing').setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
  for (const n of scene.listChildren()) {
    scene.removeChild(n);
    facing.addChild(n);
  }
  scene.addChild(facing);

  // three.js drops the ':' from node names anyway
  for (const n of root.listNodes()) {
    const name = n.getName();
    n.setName(spec.rename?.[name] ?? name.replace(/^tripo::/, ''));
  }

  const times = new Set();
  for (const anim of root.listAnimations()) {
    const name = spec.clips[anim.getName()];
    if (!name) {
      for (const c of anim.listChannels()) c.dispose();
      for (const s of anim.listSamplers()) s.dispose();
      anim.dispose();
      continue;
    }
    anim.setName(name);
    for (const s of anim.listSamplers()) times.add(s.getInput());
  }
  // samplers share their time accessors: scale each once
  for (const t of times) t.setArray(t.getArray().map((v) => v / spec.pace));

  if (spec.idle) {
    const src = root.listAnimations().find((a) => a.getName() === spec.idle);
    const idle = doc.createAnimation('Idle');
    const span = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
    for (const ch of src.listChannels()) {
      const out = ch.getSampler().getOutput();
      const v = out.getElement(0, []);
      const hold = doc.createAccessor().setType(out.getType()).setArray(new Float32Array([...v, ...v])).setBuffer(buffer);
      const smp = doc.createAnimationSampler().setInput(span).setOutput(hold).setInterpolation('STEP');
      idle.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(smp));
    }
  }

  // Tripo ships full PBR (metallic 1); the game has no environment map, so metal renders near-black.
  // Keep colour and normal maps, make everything dielectric (as tools/meshy-merge.mjs does).
  for (const m of root.listMaterials()) {
    if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null).setRoughnessFactor(0.6);
    m.setMetallicFactor(0);
  }
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [512, 512] }));
  // the runtime shares textures by name + size: give each creature its own
  root.listTextures().forEach((t, i) => t.setName(`${key}_${i}`).setURI(''));
  // build-models.mjs reads these without a meshopt decoder
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();

  const out = path.resolve(`models-src/ai/${key}.glb`);
  await io.write(out, doc);
  const clips = root.listAnimations().map((a) => `${a.getName()} ${a.listSamplers()[0].getInput().getMax([])[0].toFixed(2)}s`);
  console.log(`${key} ← ${spec.file}  ${clips.join(', ')}  → ${path.relative(process.cwd(), out)}`);
}

const keys = process.argv.slice(2);
for (const k of keys.length ? keys : Object.keys(CREATURES)) await merge(k);
