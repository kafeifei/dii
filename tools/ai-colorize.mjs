// 把概念图沿 Z 轴投影到网格顶点色(COLOR_0),并计算平滑法线。
// 用法: node tools/ai-colorize.mjs <in.glb> <concept.bmp> <out.glb>
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';

const [,, inPath, bmpPath, outPath] = process.argv;

// ── 解析 24/32 位未压缩 BMP ──
const bmp = readFileSync(bmpPath);
const dataOff = bmp.readUInt32LE(10);
const W = bmp.readInt32LE(18);
const rawH = bmp.readInt32LE(22);
const topDown = rawH < 0;
const H = Math.abs(rawH);
const bpp = bmp.readUInt16LE(28) / 8;
const rowSize = Math.ceil((W * bpp) / 4) * 4;
const px = (x, y) => {
  // 正高度行序自下而上,负高度自上而下
  x = Math.max(0, Math.min(W - 1, Math.round(x)));
  y = Math.max(0, Math.min(H - 1, Math.round(y)));
  const o = dataOff + (topDown ? y : H - 1 - y) * rowSize + x * bpp;
  return [bmp[o + 2], bmp[o + 1], bmp[o]]; // BGR -> RGB
};

// ── 检测前景包围盒:与同行左右边缘的背景色差超过阈值算前景 ──
let fx0 = W, fx1 = 0, fy0 = H, fy1 = 0;
for (let y = 0; y < H; y += 2) {
  const [br, bg, bb] = px(4, y);
  for (let x = 0; x < W; x += 2) {
    if (x > W * 0.77 && y > H * 0.9) continue; // 跳过右下角水印
    const [r, g, b] = px(x, y);
    if (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) > 60) {
      if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
      if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
    }
  }
}
console.log(`前景区域: x ${fx0}-${fx1}, y ${fy0}-${fy1}`);

const io = new NodeIO();
const doc = await io.read(inPath);

for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  const n = pos.getCount();
  const p = pos.getArray();

  // 包围盒
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  // 平滑法线(面法线累加)
  const nor = new Float32Array(n * 3);
  const ia = idx.getArray();
  for (let t = 0; t < ia.length; t += 3) {
    const a = ia[t], b = ia[t + 1], c = ia[t + 2];
    const ax = p[a*3], ay = p[a*3+1], az = p[a*3+2];
    const ux = p[b*3]-ax, uy = p[b*3+1]-ay, uz = p[b*3+2]-az;
    const vx = p[c*3]-ax, vy = p[c*3+1]-ay, vz = p[c*3+2]-az;
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    for (const i of [a, b, c]) { nor[i*3] += nx; nor[i*3+1] += ny; nor[i*3+2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nor[i*3], nor[i*3+1], nor[i*3+2]) || 1;
    nor[i*3] /= l; nor[i*3+1] /= l; nor[i*3+2] /= l;
  }

  // 顶点色:正面投影采样,背面按法线压暗
  const isBg = (x, y, r, g, b) => {
    const [br, bg2, bb] = px(4, y);
    return Math.abs(r - br) + Math.abs(g - bg2) + Math.abs(b - bb) < 60;
  };
  const sample = (u, v) => {
    for (const k of [1, 0.8, 0.6]) {
      const uu = (u - 0.5) * k + 0.5, vv = (v - 0.5) * k + 0.5;
      const x = fx0 + uu * (fx1 - fx0), y = fy1 - vv * (fy1 - fy0);
      const [r, g, b] = px(x, y);
      if (!isBg(x, y, r, g, b)) return [r, g, b];
    }
    return [58, 56, 60]; // 兜底:深灰铠甲色
  };
  const col = new Float32Array(n * 4);
  const lin = (c) => Math.pow(c / 255, 2.2); // sRGB -> 线性
  for (let i = 0; i < n; i++) {
    const u = (p[i*3] - minX) / (maxX - minX || 1);
    const v = (p[i*3+1] - minY) / (maxY - minY || 1);
    const [r, g, b] = sample(u, v);
    const facing = nor[i*3+2]; // 朝 +Z 为正面
    const shade = facing >= 0 ? 1 : 1 + facing * 0.35; // 背面最多压暗 35%
    col[i*4] = lin(r) * shade;
    col[i*4+1] = lin(g) * shade;
    col[i*4+2] = lin(b) * shade;
    col[i*4+3] = 1;
  }

  const buffer = doc.getRoot().listBuffers()[0];
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buffer));
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col).setBuffer(buffer));
  const mat = doc.createMaterial('hero').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
  prim.setMaterial(mat);
}

await io.write(outPath, doc);
console.log('已写出', outPath);
