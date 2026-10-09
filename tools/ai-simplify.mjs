import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [,, inPath, outPath, targetTris] = process.argv;
const io = new NodeIO();
const doc = await io.read(inPath);
const count = () => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return t;
};
const before = count();
const ratio = Math.min(1, (+targetTris || 10000) / before);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }), dedup(), prune());
await io.write(outPath, doc);
console.log(`tris ${before} -> ${count()}`);
