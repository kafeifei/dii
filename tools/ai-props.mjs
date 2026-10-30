// Swap pack props for AI-generated ones (made by the avatar project's pipeline/batch.mjs).
// Each replacement takes over the old model's key, so the code that places it doesn't change:
// it is scaled and moved into the old model's bounds (fits its box, same footing, same wall side).
//
//   node tools/ai-props.mjs [key ...]      writes models-src/ai-props/<key>.glb
//   node tools/build-models.mjs            builds those instead of the pack originals
//
// The list is tools/ai-props-list.mjs.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { PROPS, ASSETS } from './ai-props-list.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const OUT = path.resolve('models-src/ai-props');
fs.mkdirSync(OUT, { recursive: true });

/**
 * Cut the triangles above `above` (0 = bottom, 1 = top of the mesh) into their own mesh node
 * called `name`, e.g. a chest lid the game swings open. Both halves keep sharing the vertices.
 */
function splitTop(doc, holder, { name, above }) {
  const node = holder.listChildren().find((n) => n.getMesh());
  const prim = node.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  const ys = Array.from({ length: pos.getCount() }, (_, i) => pos.getElement(i, [])[1]);
  const cut = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * above;
  const low = [];
  const high = [];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const tri = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
    ((ys[tri[0]] + ys[tri[1]] + ys[tri[2]]) / 3 > cut ? high : low).push(...tri);
  }
  const indices = (list) => doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(idx.getBuffer());
  prim.setIndices(indices(low));
  const top = prim.clone().setIndices(indices(high));
  const mesh = doc.createMesh(name).addPrimitive(top);
  holder.addChild(doc.createNode(name).setMesh(mesh).setTranslation(node.getTranslation()).setRotation(node.getRotation()).setScale(node.getScale()));
}

/** a primitive's normals made again, smooth: each vertex the area-weighted mean of its faces' */
function smoothNormals(doc, prim) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  const n = new Float32Array(pos.getCount() * 3);
  const [a, b, c] = [[], [], []];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const tri = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
    pos.getElement(tri[0], a);
    pos.getElement(tri[1], b);
    pos.getElement(tri[2], c);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of tri) for (let k = 0; k < 3; k++) n[i * 3 + k] += f[k];
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(n).setBuffer(pos.getBuffer()));
}

/**
 * Keep the biggest object of each mesh and drop stray ones: Meshy sometimes adds a loose pole or
 * block beside a thin object. An object is the connected pieces (joined by shared positions, so UV
 * seams don't split them) whose bounds touch: a blade, guard and grip are separate pieces.
 */
function keepLargest(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const n = pos.getCount();
      const parent = Int32Array.from({ length: n }, (_, i) => i);
      const find = (i) => {
        while (parent[i] !== i) i = parent[i] = parent[parent[i]];
        return i;
      };
      const union = (a, b) => {
        a = find(a);
        b = find(b);
        if (a !== b) parent[a] = b;
      };
      const seen = new Map();
      const v = [];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v);
        const key = v.map((x) => Math.round(x * 1e4)).join(',');
        if (seen.has(key)) union(i, seen.get(key));
        else seen.set(key, i);
      }
      for (let t = 0; t < idx.getCount(); t += 3) {
        union(idx.getScalar(t), idx.getScalar(t + 1));
        union(idx.getScalar(t), idx.getScalar(t + 2));
      }
      // triangles and bounds per piece
      const pieces = new Map();
      for (let t = 0; t < idx.getCount(); t += 3) {
        const r = find(idx.getScalar(t));
        let pc = pieces.get(r);
        if (!pc) pieces.set(r, (pc = { tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
        pc.tris++;
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx.getScalar(t + k), v);
          for (let a = 0; a < 3; a++) {
            pc.min[a] = Math.min(pc.min[a], v[a]);
            pc.max[a] = Math.max(pc.max[a], v[a]);
          }
        }
      }
      // group pieces whose bounds touch (within 1% of the whole size) into objects
      const all = [...pieces.values()];
      const lo = [0, 1, 2].map((a) => Math.min(...all.map((pc) => pc.min[a])));
      const hi = [0, 1, 2].map((a) => Math.max(...all.map((pc) => pc.max[a])));
      const pad = Math.hypot(...hi.map((x, a) => x - lo[a])) * 0.01;
      const roots = [...pieces.keys()];
      const group = new Map(roots.map((r) => [r, r]));
      const top = (r) => (group.get(r) === r ? r : top(group.get(r)));
      const touch = (a, b) => [0, 1, 2].every((k) => a.min[k] - pad <= b.max[k] && b.min[k] - pad <= a.max[k]);
      for (let i = 0; i < roots.length; i++)
        for (let j = i + 1; j < roots.length; j++) if (touch(pieces.get(roots[i]), pieces.get(roots[j]))) group.set(top(roots[i]), top(roots[j]));
      const tris = new Map();
      for (const r of roots) tris.set(top(r), (tris.get(top(r)) ?? 0) + pieces.get(r).tris);
      const best = [...tris].sort((a, b) => b[1] - a[1])[0][0];
      const keep = new Set(roots.filter((r) => top(r) === best));
      const list = [];
      for (let t = 0; t < idx.getCount(); t += 3) if (keep.has(find(idx.getScalar(t)))) list.push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
      const dropped = pieces.size - keep.size;
      if (dropped) console.log(`  kept ${list.length / 3} of ${idx.getCount() / 3} triangles, dropped ${dropped} of ${pieces.size} pieces`);
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(idx.getBuffer()));
      compactPrimitive(prim);
    }
  }
}

/** every vertex of the scene in scene space */
function scenePoints(scene) {
  const pts = [];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const v = [];
      for (let i = 0; i < pos.getCount(); i++) {
        const [x, y, z] = pos.getElement(i, v);
        pts.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]);
      }
    }
  });
  return pts;
}

/**
 * Re-origin a held piece on the spot the hand takes, under a new top node:
 * - `grip: { at, axis }`: `at` of the way along its long axis (y, or z for a crossbow), centred on
 *   the haft there (a centred axe has its haft off to one side); the heavier side of the head is
 *   turned to +x, so the edge or bit leads a swing
 * - `strap`: the middle of a shield's back (it faces +z)
 */
function reOrigin(doc, scene, p) {
  const pts = scenePoints(scene);
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i])));
  let c;
  let flip = false;
  if (p.grip) {
    const ax = p.grip.axis === 'z' ? 2 : 1;
    const len = hi[ax] - lo[ax];
    const level = lo[ax] + len * p.grip.at;
    const band = pts.filter((q) => Math.abs(q[ax] - level) < len * 0.025);
    c = [0, 1, 2].map((i) => band.reduce((sum, q) => sum + q[i], 0) / band.length);
    c[ax] = level;
    if (ax === 1) {
      const head = pts.filter((q) => q[1] > lo[1] + len * 0.6);
      flip = head.reduce((sum, q) => sum + q[0], 0) / head.length - c[0] < -0.02 * len;
    }
  } else c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]];
  const top = doc.createNode(`${p.key}_held`);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    top.addChild(child);
  }
  scene.addChild(top);
  // a half turn about y, then the hold point to the origin
  top.setRotation(flip ? [0, 1, 0, 0] : [0, 0, 0, 1]);
  top.setTranslation(flip ? [c[0], -c[1], c[2]] : c.map((x) => -x));
}

const only = process.argv.slice(2);
const todo = PROPS.filter((p) => !only.length || only.includes(p.key));
if (only.length && todo.length !== only.length) throw new Error(`unknown keys: ${only.filter((k) => !PROPS.some((p) => p.key === k))}`);

for (const p of todo) {
  const srcFile = path.resolve(ASSETS, p.file ?? `${p.src}/model.glb`);
  if (!fs.existsSync(srcFile)) {
    console.log(`${p.key.padEnd(30)} … no ${p.src ?? p.file} yet`);
    continue;
  }
  // without an original to stand in for, keep the generated size: footing at 0, centred on x / z
  const orig = p.orig ? getBounds((await io.read(path.resolve('models-src', p.orig))).getRoot().listScenes()[0]) : null;
  const doc = await io.read(srcFile);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  if (p.largest) keepLargest(doc);

  // turn first (Meshy faces the concept's viewer along +Z; `yaw` fixes props drawn from an angle).
  // Without one, a long thing lying across where the original lay lengthwise gets a quarter turn.
  const raw = getBounds(scene);
  const long = (bb) => {
    const w = bb.max[0] - bb.min[0];
    const d = bb.max[2] - bb.min[2];
    return w > d * 1.3 ? 'x' : d > w * 1.3 ? 'z' : null;
  };
  const autoYaw = orig && long(orig) && long(raw) && long(orig) !== long(raw) ? 90 : 0;
  const holder = doc.createNode(p.key);
  // `pitch` (about x, applied first) tips things drawn upright that lie along z in the original
  const yaw = ((p.yaw ?? autoYaw) * Math.PI) / 180;
  const pitch = ((p.pitch ?? 0) * Math.PI) / 180;
  const [sy, cy, sp, cp] = [Math.sin(yaw / 2), Math.cos(yaw / 2), Math.sin(pitch / 2), Math.cos(pitch / 2)];
  holder.setRotation([cy * sp, sy * cp, -sy * sp, cy * cp]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    holder.addChild(child);
  }
  scene.addChild(holder);
  const b = getBounds(scene);

  // as big as fits inside the original's box (or matches one side with fit: 'width' | 'height' |
  // 'depth', for things drawn in other proportions than the original), times `scale`,
  // standing where it stood
  // a new model fits `box` [w, h, d] (centred, standing on 0) or keeps its generated size
  const box = orig ?? (p.box ? { min: [-p.box[0] / 2, 0, -p.box[2] / 2], max: [p.box[0] / 2, p.box[1], p.box[2] / 2] } : { min: [b.min[0], 0, b.min[2]], max: [b.max[0], b.max[1] - b.min[1], b.max[2]] });
  const ratio = (i) => (box.max[i] - box.min[i]) / (b.max[i] - b.min[i]);
  const s = (p.fit ? ratio({ width: 0, height: 1, depth: 2 }[p.fit]) : Math.min(ratio(0), ratio(1), ratio(2))) * (p.scale ?? 1);
  // along x / z: centred, or flush with the original's min / max side (things hung on a wall)
  const at = (o, side) => (side === 'min' ? box.min[o] - b.min[o] * s : side === 'max' ? box.max[o] - b.max[o] * s : (box.min[o] + box.max[o]) / 2 - ((b.min[o] + b.max[o]) / 2) * s);
  holder.setScale([s, s, s]);
  holder.setTranslation([at(0, p.alignX), box.min[1] - b.min[1] * s, at(2, p.alignZ)]);

  if (p.tris) {
    await MeshoptSimplifier.ready;
    const count = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, q) => k + q.getIndices().getCount() / 3, 0), 0);
    // `smooth`: its normals split at every face edge hold the welded mesh in pieces too small to
    // simplify; drop them, weld, simplify, and make them again, smooth
    if (p.smooth) for (const m of root.listMeshes()) for (const q of m.listPrimitives()) q.setAttribute('NORMAL', null);
    if (count() > p.tris) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: p.tris / count(), error: p.error ?? 0.01 }));
    if (p.smooth) for (const m of root.listMeshes()) for (const q of m.listPrimitives()) smoothNormals(doc, q);
  }
  if (p.split) splitTop(doc, holder, p.split);
  if (p.grip || p.strap) reOrigin(doc, scene, p);

  // flat, rough, dielectric: the game lights props with torches and no environment map
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(p.roughness ?? 0.85).setMetallicRoughnessTexture(null);
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [p.texture ?? 512, p.texture ?? 512] }));
  // the runtime shares textures by name + size (KayKit atlases); every AI texture must be unique
  root.listTextures().forEach((t, i) => t.setName(`${p.key}_${i}`).setURI(''));

  // `dir`: a model kept in the repo (models-src/ai, committed) rather than in models-src/ai-props
  const out = path.join(p.dir ? path.resolve('models-src', p.dir) : OUT, `${p.key}.glb`);
  await io.write(out, doc);
  const nb = getBounds(scene);
  const dims = (bb) => bb.max.map((v, i) => (v - bb.min[i]).toFixed(2)).join('×');
  console.log(`${p.key.padEnd(30)} ← ${(p.src ?? p.file).padEnd(22)} ${dims(box)} → ${dims(nb)}  ${Math.round(fs.statSync(out).size / 1024)} KB`);
}
