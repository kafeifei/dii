// 把正/背两张概念图烘焙成一张贴图图集(左半正面、右半背面),按面法线 Z 分配 UV。
// 相比顶点色,贴图分辨率不受顶点数限制,金纹/布纹细节都能保住。
// 背景先用 BFS 外延填色(inpaint),避免轮廓接缝处渗入背景黑边。
// 依赖 macOS 的 sips 做 BMP<->PNG 转换,避免引入图像库。
// 用法: node tools/ai-texture.mjs <in.glb> <front.bmp> <back.bmp> <out.glb> [atlasHeight=1152]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';

const [,, inPath, frontBmp, backBmp, outPath, atlasHeightArg] = process.argv;

// ── 解析 24/32 位未压缩 BMP ──
function readBmp(path) {
  const buf = readFileSync(path);
  const dataOff = buf.readUInt32LE(10);
  const W = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const topDown = rawH < 0;
  const H = Math.abs(rawH);
  const bpp = buf.readUInt16LE(28) / 8;
  const rowSize = Math.ceil((W * bpp) / 4) * 4;
  const px = (x, y) => {
    x = Math.max(0, Math.min(W - 1, Math.round(x)));
    y = Math.max(0, Math.min(H - 1, Math.round(y)));
    const o = dataOff + (topDown ? y : H - 1 - y) * rowSize + x * bpp;
    return [buf[o + 2], buf[o + 1], buf[o]]; // BGR -> RGB
  };
  return { W, H, px };
}

// ── 前景包围盒 + 前景掩码 ──
// 与同行左右两端背景色差取最小值,超过阈值算前景(烟雾等背景纹理通常延伸到图边,
// 至少一端颜色相近);包围盒再按行列前景密度 2% 修剪,排除零星误判。
function analyze(img) {
  const { W, H, px } = img;
  const mask = new Uint8Array(W * H); // 1 = 前景
  const colCnt = new Int32Array(W), rowCnt = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    const refs = [px(4, y), px(W - 5, y)];
    for (let x = 0; x < W; x++) {
      const [r, g, b] = px(x, y);
      const d = Math.min(...refs.map(([br, bg, bb]) => Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb)));
      if (d > 70) {
        mask[y * W + x] = 1;
        colCnt[x]++; rowCnt[y]++;
      }
    }
  }
  let fx0 = 0, fx1 = W - 1, fy0 = 0, fy1 = H - 1;
  while (fx0 < fx1 && colCnt[fx0] < H * 0.02) fx0++;
  while (fx1 > fx0 && colCnt[fx1] < H * 0.02) fx1--;
  while (fy0 < fy1 && rowCnt[fy0] < W * 0.02) fy0++;
  while (fy1 > fy0 && rowCnt[fy1] < W * 0.02) fy1--;
  return { ...img, mask, fx0, fx1, fy0, fy1 };
}

const front = analyze(readBmp(frontBmp));
const back = analyze(readBmp(backBmp));
console.log(`正面前景 x ${front.fx0}-${front.fx1} y ${front.fy0}-${front.fy1};背面前景 x ${back.fx0}-${back.fx1} y ${back.fy0}-${back.fy1}`);

// ── 拼图集:左半正面、右半背面,RGB 平铺 ──
const AW = front.W + back.W, AH = Math.max(front.H, back.H);
const atlas = new Uint8Array(AW * AH * 3);
const fg = new Uint8Array(AW * AH); // 1 = 前景(含非边界连通的暗部)
for (const [img, ox] of [[front, 0], [back, front.W]]) {
  for (let y = 0; y < img.H; y++) for (let x = 0; x < img.W; x++) {
    const [r, g, b] = img.px(x, y);
    const o = (y * AW + ox + x) * 3;
    atlas[o] = r; atlas[o + 1] = g; atlas[o + 2] = b;
    fg[y * AW + ox + x] = img.mask[y * img.W + x];
  }
}

// ── 背景从图边界洪泛标记(角色内部的暗色缝隙不算背景,保留原色) ──
const outer = new Uint8Array(AW * AH);
{
  const q = new Int32Array(AW * AH);
  let qh = 0, qt = 0;
  const push = (i) => { if (!outer[i] && !fg[i]) { outer[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < AW; x++) { push(x); push((AH - 1) * AW + x); }
  for (let y = 0; y < AH; y++) { push(y * AW); push(y * AW + AW - 1); }
  while (qh < qt) {
    const i = q[qh++], x = i % AW, y = (i / AW) | 0;
    if (x > 0) push(i - 1); if (x < AW - 1) push(i + 1);
    if (y > 0) push(i - AW); if (y < AH - 1) push(i + AW);
  }
}
// ── inpaint:外部背景像素用 BFS 取最近前景色填充,防黑边渗入 ──
{
  const q = new Int32Array(AW * AH);
  let qh = 0, qt = 0;
  for (let i = 0; i < AW * AH; i++) if (!outer[i]) {
    const x = i % AW, y = (i / AW) | 0;
    if ((x > 0 && outer[i - 1]) || (x < AW - 1 && outer[i + 1]) || (y > 0 && outer[i - AW]) || (y < AH - 1 && outer[i + AW])) q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++], x = i % AW, y = (i / AW) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < AW - 1 ? i + 1 : -1, y > 0 ? i - AW : -1, y < AH - 1 ? i + AW : -1]) {
      if (j >= 0 && outer[j]) {
        outer[j] = 0;
        atlas[j * 3] = atlas[i * 3]; atlas[j * 3 + 1] = atlas[i * 3 + 1]; atlas[j * 3 + 2] = atlas[i * 3 + 2];
        q[qt++] = j;
      }
    }
  }
}

// ── 写 24 位 BMP,sips 缩放并转 PNG ──
const AH2 = Math.min(+atlasHeightArg || 1152, AH);
const AW2 = Math.round((AW * AH2) / AH);
{
  const rowSize = Math.ceil((AW * 3) / 4) * 4;
  const bmp = Buffer.alloc(54 + rowSize * AH);
  bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(AW, 18); bmp.writeInt32LE(-AH, 22); // 负高度 = 自上而下
  bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const s = (y * AW + x) * 3, d = 54 + y * rowSize + x * 3;
    bmp[d] = atlas[s + 2]; bmp[d + 1] = atlas[s + 1]; bmp[d + 2] = atlas[s];
  }
  writeFileSync('/tmp/ai-hero/atlas.bmp', bmp);
  execFileSync('sips', ['-z', String(AH2), String(AW2), '-s', 'format', 'png', '/tmp/ai-hero/atlas.bmp', '--out', '/tmp/ai-hero/atlas.png'], { stdio: 'pipe' });
}
console.log(`图集 ${AW}x${AH} -> ${AW2}x${AH2}`);

// ── 网格:按面法线 Z 正负分正/背,复制跨侧共享顶点,各自投影 UV ──
const io = new NodeIO();
const doc = await io.read(inPath);
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const p = prim.getAttribute('POSITION').getArray();
  const ia = prim.getIndices().getArray();
  const n = p.length / 3;

  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  // 平滑法线按原索引算,复制顶点后照搬,避免接缝处出现光照硬边
  const nor = new Float32Array(n * 3);
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

  const remap = new Map(); // 原索引*2+side -> 新索引
  const newPos = [], newNor = [], newUv = [], newIdx = [];
  const vert = (i, side) => {
    const key = i * 2 + side;
    let ni = remap.get(key);
    if (ni !== undefined) return ni;
    ni = newPos.length / 3;
    remap.set(key, ni);
    newPos.push(p[i*3], p[i*3+1], p[i*3+2]);
    newNor.push(nor[i*3], nor[i*3+1], nor[i*3+2]);
    const u = (p[i*3] - minX) / (maxX - minX || 1);
    const v = (maxY - p[i*3+1]) / (maxY - minY || 1);
    const img = side ? back : front;
    const iu = side ? 1 - u : u;
    const ix = img.fx0 + iu * (img.fx1 - img.fx0); // 背面视图左右镜像
    const iy = img.fy0 + v * (img.fy1 - img.fy0);
    newUv.push((ix + (side ? front.W : 0)) / AW, iy / AH);
    return ni;
  };
  for (let t = 0; t < ia.length; t += 3) {
    const a = ia[t], b = ia[t + 1], c = ia[t + 2];
    const ux = p[b*3]-p[a*3], uy = p[b*3+1]-p[a*3+1];
    const vx = p[c*3]-p[a*3], vy = p[c*3+1]-p[a*3+1];
    // 面法线 z 分量符号决定采正面还是背面图
    const fnz = ux * vy - uy * vx;
    const side = fnz >= 0 ? 0 : 1;
    newIdx.push(vert(a, side), vert(b, side), vert(c, side));
  }

  const buffer = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.getAttribute(sem).dispose();
  prim.setAttribute('POSITION', acc('VEC3', new Float32Array(newPos)));
  prim.setAttribute('NORMAL', acc('VEC3', new Float32Array(newNor)));
  prim.setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(newUv)));
  prim.setIndices(acc('SCALAR', new Uint32Array(newIdx)));

  const tex = doc.createTexture('heroAtlas').setImage(readFileSync('/tmp/ai-hero/atlas.png')).setMimeType('image/png');
  const mat = doc.createMaterial('hero').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1);
  prim.setMaterial(mat);
  console.log(`顶点 ${n} -> ${newPos.length / 3}(跨侧复制),三角 ${ia.length / 3}`);
}

await io.write(outPath, doc);
console.log('已写出', outPath);
