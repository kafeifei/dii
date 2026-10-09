// Merges a Meshy character export (one skinned glb per batch of clips) into a single glb
// carrying the clip names the game plays, written to models-src/ai/<char>.glb.
// Characters and their clips are listed in tools/meshy-chars.mjs. Then run tools/build-models.mjs.
// node tools/meshy-merge.mjs <char> [<char> ...]
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { CHARS } from './meshy-chars.mjs';

const FPS = 30;
/** the sim squeezes a whole attack / cast clip into the action and resolves it at this fraction */
const QUICK = { attack: { len: 0.8, at: 0.5 }, cast: { len: 0.8, at: 0.55 } };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** value of a LINEAR / STEP sampler at time t (rotations are nlerped) */
function sample(times, values, size, interp, t, out) {
  const n = times.length;
  let k = 0;
  while (k < n - 1 && times[k + 1] <= t) k++;
  const k1 = Math.min(n - 1, k + 1);
  const span = times[k1] - times[k];
  const a = interp === 'STEP' || span <= 0 ? 0 : Math.min(1, Math.max(0, (t - times[k]) / span));
  let sign = 1;
  if (size === 4) {
    let dot = 0;
    for (let i = 0; i < 4; i++) dot += values[k * 4 + i] * values[k1 * 4 + i];
    if (dot < 0) sign = -1;
  }
  for (let i = 0; i < size; i++) out[i] = values[k * size + i] * (1 - a) + sign * values[k1 * size + i] * a;
  if (size === 4) {
    const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    for (let i = 0; i < 4; i++) out[i] /= len;
  }
  return out;
}

// ── minimal column-major 4×4 math for forward kinematics ──
function compose([tx, ty, tz], [x, y, z, w], [sx, sy, sz]) {
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

/**
 * The moment a swing lands or a spell leaves the hand: the frame (past the first 15%) where
 * either hand reaches furthest forward of where the character stands, lunges included (the
 * avatar viewer measures it the same way). Characters face +Z.
 */
function poser(anim, root) {
  const tracks = new Map(); // node name → { translation, rotation, scale } samplers
  for (const ch of anim.listChannels()) {
    const name = ch.getTargetNode()?.getName();
    if (!name) continue;
    if (!tracks.has(name)) tracks.set(name, {});
    const s = ch.getSampler();
    tracks.get(name)[ch.getTargetPath()] = { times: s.getInput().getArray(), values: s.getOutput().getArray(), size: s.getOutput().getElementSize(), interp: s.getInterpolation() };
  }
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const chainTo = (name) => {
    const chain = [];
    for (let n = byName.get(name); n; n = n.getParentNode()) chain.unshift(n);
    return chain;
  };
  const worldAt = (chain, t) => {
    let m = compose([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
    for (const n of chain) {
      const tr = tracks.get(n.getName()) ?? {};
      const get = (p, rest, size) => (tr[p] ? sample(tr[p].times, tr[p].values, size, tr[p].interp, t, new Array(size)) : rest);
      m = mul(m, compose(get('translation', n.getTranslation(), 3), get('rotation', n.getRotation(), 4), get('scale', n.getScale(), 3)));
    }
    return m;
  };
  const end = Math.max(...anim.listChannels().map((c) => c.getSampler().getInput().getMax([])[0]));
  return { chainTo, worldAt, end };
}

function releaseTime(anim, root, range) {
  const { chainTo, worldAt, end } = poser(anim, root);
  const chains = { r: chainTo('RightHand'), l: chainTo('LeftHand') };
  const [from, to] = range ?? [end * 0.15, end];
  let best = (from + to) / 2;
  let bestZ = -Infinity;
  for (let t = from; t <= Math.min(to, end); t += 1 / FPS) {
    for (const hand of [chains.r, chains.l]) {
      if (!hand.length) continue;
      const z = worldAt(hand, t)[14];
      if (z > bestZ) {
        bestZ = z;
        best = t;
      }
    }
  }
  return { at: best, end };
}

/**
 * Ground speed a locomotion clip was authored for, in model units/s: a planted foot slides
 * backwards under the body at exactly that speed (clips are in place).
 */
function strideSpeed(anim, root) {
  const { chainTo, worldAt, end } = poser(anim, root);
  const v = [];
  for (const foot of [chainTo('LeftFoot'), chainTo('RightFoot')]) {
    if (!foot.length) continue;
    const s = [];
    for (let t = 0; t <= end; t += 1 / 60) {
      const m = worldAt(foot, t);
      s.push({ y: m[13], z: m[14] });
    }
    const minY = Math.min(...s.map((q) => q.y));
    const tol = (Math.max(...s.map((q) => q.y)) - minY) * 0.08;
    for (let i = 1; i < s.length; i++) if (s[i].y < minY + tol && s[i - 1].y < minY + tol) v.push((s[i - 1].z - s[i].z) * 60);
  }
  v.sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

async function merge(name) {
  const spec = CHARS[name];
  if (!spec) throw new Error(`unknown character ${name}; see tools/meshy-chars.mjs`);
  const SRC = path.resolve(spec.src);
  const doc = await io.read(path.join(SRC, spec.base));
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const hips = nodes.get('Hips');
  const bindHips = hips.getTranslation();

  const sources = new Map();
  const source = async (file) => {
    if (!sources.has(file)) sources.set(file, await io.read(path.join(SRC, file)));
    return sources.get(file);
  };

  // drop the base file's own clips; every clip is re-added below under its game name
  for (const anim of root.listAnimations()) {
    for (const c of anim.listChannels()) c.dispose();
    for (const s of anim.listSamplers()) s.dispose();
    anim.dispose();
  }

  for (const clip of spec.clips) {
    const src = await source(clip.file);
    // a batch names clips by library key; a single-clip export wraps it as Armature|<key>|baselayer
    const anim = src.getRoot().listAnimations().find((a) => a.getName() === clip.clip || a.getName().split('|')[1] === clip.clip);
    if (!anim) throw new Error(`${name}: ${clip.file} has no clip ${clip.clip}`);
    const channels = anim.listChannels();
    const end = Math.max(...channels.map((c) => c.getSampler().getInput().getMax([])[0]));
    let [t0, t1] = clip.window ?? [0, end];
    let note = '';
    if (clip.quick) {
      const q = QUICK[clip.quick];
      const rel = releaseTime(anim, src.getRoot(), clip.range);
      t0 = Math.min(Math.max(0, rel.at - q.len * q.at), Math.max(0, end - q.len));
      t1 = Math.min(end, t0 + q.len);
      note = ` lands ${rel.at.toFixed(2)} s → ${(((rel.at - t0) / (t1 - t0)) * 100).toFixed(0)}%`;
    }
    const count = Math.max(2, Math.round((t1 - t0) * FPS) + 1);
    const times = Float32Array.from({ length: count }, (_, i) => (i * (t1 - t0)) / (count - 1));
    const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
    const out = doc.createAnimation(clip.name);
    for (const ch of channels) {
      const pathName = ch.getTargetPath();
      const target = nodes.get(ch.getTargetNode()?.getName());
      if (!target || pathName === 'scale') continue; // scale tracks are all 1
      const smp = ch.getSampler();
      const srcTimes = smp.getInput().getArray();
      const srcValues = smp.getOutput().getArray();
      const size = smp.getOutput().getElementSize();
      const values = new Float32Array(count * size);
      const tmp = new Float32Array(size);
      const at = (i) => t0 + (clip.reverse ? t1 - t0 - times[i] : times[i]);
      for (let i = 0; i < count; i++) values.set(sample(srcTimes, srcValues, size, smp.getInterpolation(), at(i), tmp), i * size);
      if (clip.inPlace && target === hips && pathName === 'translation') {
        // start over the bind spot and end where it started: the sim moves the body, the clip must not
        const dx0 = values[0] - bindHips[0];
        const dz0 = values[2] - bindHips[2];
        const driftX = values[(count - 1) * 3] - values[0];
        const driftZ = values[(count - 1) * 3 + 2] - values[2];
        for (let i = 0; i < count; i++) {
          const k = i / (count - 1);
          values[i * 3] -= dx0 + driftX * k;
          values[i * 3 + 2] -= dz0 + driftZ * k;
        }
      }
      const output = doc.createAccessor().setType(size === 4 ? 'VEC4' : 'VEC3').setArray(values).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      out.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(pathName).setSampler(sampler));
    }
    // metres per second at the model's own height (~1.7 m); specs scale it to the in-game body
    if (/^(Walk|Run|Charge)$/.test(clip.name)) note += ` stride ${strideSpeed(anim, src.getRoot()).toFixed(2)} m/s`;
    console.log(`  ${clip.name.padEnd(10)} ← ${clip.file} ${clip.clip} [${t0.toFixed(2)}–${t1.toFixed(2)} s]${note}`);
  }

  // Meshy's single-clip exports carry full PBR (metallic 1); the game has no environment map, so
  // metal renders near-black. Keep colour and normal maps, make everything dielectric.
  for (const m of root.listMaterials()) {
    if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null).setRoughnessFactor(0.6);
    m.setMetallicFactor(0);
  }

  const texSize = name.startsWith('mon_') ? 512 : 1024;
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [texSize, texSize] }));
  // monsters and townsfolk are a few dozen pixels tall: Meshy's 30-60k triangles are wasted on them
  const tris = spec.tris ?? (name.startsWith('mon_') ? 12000 : name.startsWith('npc_') ? 15000 : 0);
  if (tris) {
    await MeshoptSimplifier.ready;
    const count = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
    const before = count();
    if (before > tris) {
      await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: tris / before, error: 0.01 }), prune());
      console.log(`  ${before} → ${count()} triangles`);
    }
  }
  // every Meshy export names its maps Material_0_baseColor etc.; the game shares textures by
  // name + size (for the KayKit atlases), so give each character its own
  root.listTextures().forEach((t, i) => t.setName(`${name}_${t.getName() || i}`).setURI(''));
  const OUT = path.resolve(`models-src/ai/${name}.glb`);
  await io.write(OUT, doc);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}

const names = process.argv.slice(2);
if (names[0] === '--probe') {
  // node tools/meshy-merge.mjs --probe <char> <file> <clip>: print when a clip lands
  const [, char, file, clipName] = names;
  const doc = await io.read(path.join(path.resolve(CHARS[char].src), file));
  const anim = doc.getRoot().listAnimations().find((a) => a.getName() === clipName);
  const { chainTo, worldAt, end } = poser(anim, doc.getRoot());
  // forward reach of the further hand over time, to pick a `range` by eye
  const line = [];
  for (let t = 0; t <= end; t += 0.1) line.push(`${t.toFixed(1)}:${Math.max(...['RightHand', 'LeftHand'].map((h) => worldAt(chainTo(h), t)[14])).toFixed(2)}`);
  console.log(line.join(' '));
  const rel = releaseTime(anim, doc.getRoot());
  console.log(`${clipName}: lands at ${rel.at.toFixed(2)} of ${rel.end.toFixed(2)} s`);
  process.exit(0);
}
if (!names.length) {
  console.log(`usage: node tools/meshy-merge.mjs <${Object.keys(CHARS).join('|')}> ...`);
  process.exit(1);
}
for (const n of names) {
  console.log(n);
  await merge(n);
}
