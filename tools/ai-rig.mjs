// 给 AI 生成的静态人形网格程序化绑骨,并内置游戏需要的全套动画。
// 骨骼位置按包围盒启发式摆放,蒙皮用"顶点到骨段距离"的平滑权重。
// 骨架: root(贴地,死亡倒地用) > hips > spine > head/armL/armR, hips > legL/legR;
// armL/armR 下各挂一个 handslotl/handslotr 空节点,命名对齐 models.ts 的 HAND_BONES。
// 动画: Idle Walk Run Attack Attack2 Cast Hit Death(定格倒地)。
// 用法: node tools/ai-rig.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';

const [,, inPath, outPath] = process.argv;
const io = new NodeIO();
const doc = await io.read(inPath);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const p = pos.getArray();
const n = pos.getCount();

let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
for (let i = 0; i < n; i++) {
  const x = p[i*3], y = p[i*3+1], z = p[i*3+2];
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
const h = maxY - minY, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, hw = (maxX - minX) / 2;
const Y = (f) => minY + f * h, X = (f) => cx + f * hw;
console.log(`网格尺寸 x=${(maxX-minX).toFixed(3)} y=${h.toFixed(3)} z=${(maxZ-minZ).toFixed(3)}`);

// 骨段: [名字, 父级, 关节点(头), 骨段尾点(蒙皮用), 距离惩罚系数]
const B = [
  ['hips',  'root',  [cx, Y(0.50), cz], [cx, Y(0.60), cz], 1.0],
  ['spine', 'hips',  [cx, Y(0.60), cz], [cx, Y(0.80), cz], 1.0],
  ['head',  'spine', [cx, Y(0.80), cz], [cx, Y(1.00), cz], 1.0],
  ['armL',  'spine', [X(-0.42), Y(0.74), cz], [X(-1.0), Y(0.42), cz], 1.25],
  ['armR',  'spine', [X(0.42),  Y(0.74), cz], [X(1.0),  Y(0.42), cz], 1.25],
  ['legL',  'hips',  [X(-0.26), Y(0.48), cz], [X(-0.4), Y(0.0), cz], 1.0],
  ['legR',  'hips',  [X(0.26),  Y(0.48), cz], [X(0.4),  Y(0.0), cz], 1.0],
];
const idx = Object.fromEntries(B.map((b, i) => [b[0], i]));

// root 贴地,不参与蒙皮,只用于整体倒地/朝向
const rootPos = [cx, Y(0), cz];
const rootNode = doc.createNode('root').setTranslation(rootPos);
scene.addChild(rootNode);

// 建关节层级(平移为相对父关节)
const nodes = B.map(([name]) => doc.createNode(name));
const headOf = (name) => (name === 'root' ? rootPos : B[idx[name]][2]);
B.forEach(([name, parent, headPos], i) => {
  const pp = headOf(parent);
  nodes[i].setTranslation([headPos[0] - pp[0], headPos[1] - pp[1], headPos[2] - pp[2]]);
  if (parent === 'root') rootNode.addChild(nodes[i]);
  else nodes[idx[parent]].addChild(nodes[i]);
});

// 武器挂点:放在手臂末端(骨段尾点),跟随手臂运动。
// 必须也注册成 skin joint(有 IBM、无顶点引用),否则 build-models 的 prune() 会把空节点删掉。
const slotNodes = [];
const slotHeads = [];
for (const [slotName, armName] of [['handslotl', 'armL'], ['handslotr', 'armR']]) {
  const [, , head, tail] = B[idx[armName]];
  const slot = doc.createNode(slotName).setTranslation([tail[0] - head[0], tail[1] - head[1], tail[2] - head[2]]);
  // KayKit 武器柄沿 +Y:绕 X 前倾 75°,让剑/斧自然指向前方而不是竖直朝天
  const a = (75 * Math.PI) / 360;
  slot.setRotation([Math.sin(a), 0, 0, Math.cos(a)]);
  nodes[idx[armName]].addChild(slot);
  slotNodes.push(slot);
  slotHeads.push(tail);
}

// 蒙皮权重:取距离最近的两根骨,反比平方混合
const segDist = (vx, vy, vz, a, b) => {
  const ax = a[0], ay = a[1], az = a[2];
  const dx = b[0] - ax, dy = b[1] - ay, dz = b[2] - az;
  const t = Math.max(0, Math.min(1, ((vx - ax) * dx + (vy - ay) * dy + (vz - az) * dz) / (dx*dx + dy*dy + dz*dz)));
  return Math.hypot(vx - (ax + t * dx), vy - (ay + t * dy), vz - (az + t * dz));
};
const joints = new Uint16Array(n * 4);
const weights = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const vx = p[i*3], vy = p[i*3+1], vz = p[i*3+2];
  const ds = B.map(([,, a, b, mul]) => segDist(vx, vy, vz, a, b) * mul + 1e-4);
  const order = ds.map((d, j) => [d, j]).sort((u, v) => u[0] - v[0]);
  const [d0, j0] = order[0], [d1, j1] = order[1];
  let w0 = 1 / (d0 * d0), w1 = 1 / (d1 * d1);
  if (d1 > d0 * 2) w1 = 0; // 明显更近就独占
  const s = w0 + w1;
  joints[i*4] = j0; joints[i*4+1] = j1;
  weights[i*4] = w0 / s; weights[i*4+1] = w1 / s;
}

const buffer = root.listBuffers()[0];
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));

// 逆绑定矩阵(骨骼无旋转,纯平移的逆);末尾两个是手部挂点
const jointHeads = [...B.map((b) => b[2]), ...slotHeads];
const ibm = new Float32Array(jointHeads.length * 16);
jointHeads.forEach((headPos, i) => {
  const m = ibm.subarray(i * 16);
  m[0] = m[5] = m[10] = m[15] = 1;
  m[12] = -headPos[0]; m[13] = -headPos[1]; m[14] = -headPos[2];
});
const skin = doc.createSkin('heroRig').setInverseBindMatrices(
  doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
[...nodes, ...slotNodes].forEach((nd) => skin.addJoint(nd));
meshNode.setSkin(skin);

// ── 动画 ──
// 轴向约定:模型面朝 +Z。绕 X 旋转 = 前后摆(四肢自然下垂时,负角度向前甩);
// 绕 Y = 水平横扫;绕 Z = 侧向抬放手臂。
const quatX = (deg) => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
const quatY = (deg) => { const a = (deg * Math.PI) / 360; return [0, Math.sin(a), 0, Math.cos(a)]; };
const quatZ = (deg) => { const a = (deg * Math.PI) / 360; return [0, 0, Math.sin(a), Math.cos(a)]; };
const allNodes = { ...Object.fromEntries(B.map(([name], i) => [name, nodes[i]])), root: rootNode };
const makeAnim = (name, tracks) => {
  const anim = doc.createAnimation(name);
  for (const [bone, times, quats] of tracks) {
    const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer);
    const output = doc.createAccessor().setType('VEC4').setArray(new Float32Array(quats.flat())).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    const channel = doc.createAnimationChannel().setTargetNode(allNodes[bone]).setTargetPath('rotation').setSampler(sampler);
    anim.addSampler(sampler).addChannel(channel);
  }
  return anim;
};

const I = [0, 0, 0, 1];
makeAnim('Idle', [
  ['spine', [0, 1, 2], [quatX(2), quatX(-1.5), quatX(2)]],
  ['head',  [0, 1, 2], [quatX(-1.5), quatX(1.5), quatX(-1.5)]],
  ['armL',  [0, 1, 2], [quatZ(-2), quatZ(2), quatZ(-2)]],
  ['armR',  [0, 1, 2], [quatZ(2), quatZ(-2), quatZ(2)]],
]);
makeAnim('Walk', [
  ['legL',  [0, 0.4, 0.8], [quatX(30), quatX(-30), quatX(30)]],
  ['legR',  [0, 0.4, 0.8], [quatX(-30), quatX(30), quatX(-30)]],
  ['armL',  [0, 0.4, 0.8], [quatX(-18), quatX(18), quatX(-18)]],
  ['armR',  [0, 0.4, 0.8], [quatX(18), quatX(-18), quatX(18)]],
  ['spine', [0, 0.2, 0.4, 0.6, 0.8], [quatX(4), quatX(2), quatX(4), quatX(2), quatX(4)]],
]);
makeAnim('Run', [
  ['legL',  [0, 0.25, 0.5], [quatX(48), quatX(-48), quatX(48)]],
  ['legR',  [0, 0.25, 0.5], [quatX(-48), quatX(48), quatX(-48)]],
  ['armL',  [0, 0.25, 0.5], [quatX(-32), quatX(32), quatX(-32)]],
  ['armR',  [0, 0.25, 0.5], [quatX(32), quatX(-32), quatX(32)]],
  ['spine', [0, 0.5], [quatX(10), quatX(10)]],
]);
makeAnim('Attack', [ // 过顶劈砍
  ['armR',  [0, 0.12, 0.3, 0.5], [I, quatX(-130), quatX(45), I]],
  ['spine', [0, 0.12, 0.3, 0.5], [I, quatX(-8), quatX(12), I]],
]);
makeAnim('Attack2', [ // 水平横扫
  ['armR',  [0, 0.14, 0.34, 0.55], [I, quatY(60), quatY(-75), I]],
  ['spine', [0, 0.14, 0.34, 0.55], [I, quatY(15), quatY(-18), I]],
]);
makeAnim('Cast', [ // 双手前推施法
  ['armL',  [0, 0.15, 0.35, 0.7], [I, quatX(16), quatX(-72), I]],
  ['armR',  [0, 0.15, 0.35, 0.7], [I, quatX(16), quatX(-72), I]],
  ['spine', [0, 0.15, 0.35, 0.7], [I, quatX(5), quatX(-7), I]],
]);
makeAnim('Hit', [ // 受击后仰
  ['spine', [0, 0.1, 0.35], [I, quatX(-14), I]],
  ['head',  [0, 0.1, 0.35], [I, quatX(-12), I]],
]);
makeAnim('Death', [ // 后仰再向前扑倒,定格在最后一帧
  ['root',  [0, 0.2, 0.55, 0.95, 1.2], [I, quatX(-12), quatX(40), quatX(84), quatX(84)]],
  ['spine', [0, 0.2, 0.6, 1.2], [I, quatX(-6), quatX(16), quatX(16)]],
  ['head',  [0, 0.3, 0.8, 1.2], [I, quatX(-10), quatX(12), quatX(12)]],
  ['armL',  [0, 0.4, 0.9, 1.2], [I, quatZ(-20), quatZ(-34), quatZ(-34)]],
  ['armR',  [0, 0.4, 0.9, 1.2], [I, quatZ(20), quatZ(34), quatZ(34)]],
]);

await io.write(outPath, doc);
console.log('骨骼', B.length, '根 + root + 双手挂点;动画', root.listAnimations().map((a) => a.getName()).join(' '), '已写出', outPath);
