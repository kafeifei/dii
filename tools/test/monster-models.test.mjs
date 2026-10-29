// The Act 1 bodies brought in for D2's monsters (tools/meshy-merge.mjs mon_rogue_fallen,
// tools/tripo-merge.mjs mon_quillrat) and how src/render/specs.ts dresses them: the hunter's
// one-handed weapon and shield rolled from every piece D2 lists (MonStats2 RHv / SHv), the
// spearwoman's spear and the ranger's bow aimed at the attack's landing, every model named one the
// game builds. The quill rat as merged: small, its walk one loop, the hind right leg (misnamed by
// Tripo) stepping as the left one mirrored half a step later, and src/render/legs.ts QuadRig finding
// its legs and rolling it over onto its side when it dies. And every monster a built area or the
// trial ground can spawn (levels.txt mon/nmon/umon, what they bring, the superuniques, Act 1's
// bosses) has a look (src/data/monsters.ts) whose body is a model the game builds.
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

export default async (load) => {
  const THREE = await load('three');
  const { GLTFLoader } = await load('three/examples/jsm/loaders/GLTFLoader.js');
  const { monsterSpec } = await load('/src/render/specs.ts');
  const { MODEL_KEYS } = await load('/src/render/model-list.ts');
  const { QuadRig } = await load('/src/render/legs.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const built = new Set(MODEL_KEYS);
  const mon = (model, id = 1) => ({ id, def: { model, scale: 1 }, rank: 'normal' });

  // the hunter: over many monsters, every weapon look and with and without a shield
  const held = new Set();
  let shields = 0;
  for (let id = 1; id <= 300; id++) {
    const s = monsterSpec(mon('corruptrogue', id));
    check(s.model === 'mon_rogue_fallen' && s.clips.attack[0] === 'Attack', `hunter ${id}: ${s.model} ${s.clips.attack}`);
    const r = s.attach.find((a) => a.hand === 'r');
    held.add(r.model);
    if (s.attach.some((a) => a.hand === 'l' && a.hold === 'shield')) shields++;
    for (const a of s.attach) check(built.has(a.model), `hunter ${id} carries ${a.model}, not a built model`);
  }
  for (const w of ['axe_1handed', 'w_club', 'w_mace', 'skeleton_blade', 'w_hammer']) check(held.has(w), `no hunter carries ${w}`);
  // SHv: nil and three shields
  check(shields > 180 && shields < 270, `${shields}/300 hunters with a shield, about 3/4 expected`);
  const lancer = monsterSpec(mon('cr_lancer'));
  const spear = lancer.attach[0];
  check(spear.model === 'w_spear' && spear.hold === 'level' && spear.aim && lancer.clips.attack[0] === 'Thrust', `spearwoman ${JSON.stringify(lancer.attach)} ${lancer.clips.attack}`);
  const ranger = monsterSpec(mon('cr_archer'));
  const bow = ranger.attach[0];
  check(typeof bow.model === 'function' && bow.hand === 'l' && bow.aim && ranger.clips.attack[0] === 'Shoot', `ranger ${ranger.clips.attack}`);
  const rat = monsterSpec(mon('quillrat'));
  check(rat.model === 'mon_quillrat' && rat.legs === 'quadruped' && rat.clips.move[0].clip === 'Walk', `quill rat ${rat.model} ${rat.legs}`);
  for (const m of ['mon_rogue_fallen', 'mon_quillrat']) check(built.has(m), `${m} not in the built models`);

  // every monster that can spawn has a look, drawn by a built model
  const { monsterDef, lookedMonsters } = await load('/src/data/monsters.ts');
  const { areaList } = await load('/src/world/areas.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const { D2X_SUPERUNIQUES } = await load('/src/data/d2x/superuniques.ts');
  const { Monster } = await load('/src/game/monster.ts');
  const can = new Set(['smith', 'bloodraven', 'andariel', 'zombie2']);
  for (const a of areaList()) {
    const row = D2X_AREAS.find((x) => x.id === a.id);
    for (const id of [...(row?.mon ?? []), ...(row?.nmon ?? []), ...(row?.umon ?? [])]) can.add(id);
    for (const key of row?.superuniques ?? []) can.add(D2X_SUPERUNIQUES.find((s) => s.key === key).mon);
  }
  for (const id of [...can]) for (const mid of D2X_MONSTERS[id]?.minions ?? []) can.add(mid);
  for (const d of lookedMonsters()) if (d.row.spawns && !d.boss) can.add(d.id);
  for (const id of can) {
    const def = monsterDef(id);
    if (!def) {
      problems.push(`${id} can spawn but has no look`);
      continue;
    }
    const s = monsterSpec(new Monster(def, def.row.diff[0].level, 'normal', { x: 0, z: 0 }));
    check(built.has(s.model), `${id} is drawn as ${s.model}, not a built model`);
    check(def.name && !/[A-Za-z]/.test(def.name), `${id} is named ${def.name}`);
  }

  // the merged quill rat
  const file = 'models-src/ai/mon_quillrat.glb';
  check(fs.statSync(file).size < 3e6, `${file} is ${fs.statSync(file).size} bytes`);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const tris = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
  check(tris <= 7500, `${tris} triangles`);
  // no textures to decode in Node
  for (const t of doc.getRoot().listTextures()) t.dispose();
  const bin = await io.writeBinary(doc);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), '', res, rej));
  const walk = gltf.animations.find((a) => a.name === 'Walk');
  check(walk && gltf.animations.some((a) => a.name === 'Idle'), `clips ${gltf.animations.map((a) => a.name)}`);
  const scene = gltf.scene;
  for (const n of ['1_Right_Limb_0', '1_Right_Limb_3', 'Scapula_Left', 'Scapula_Right', 'Tail_2']) check(scene.getObjectByName(n)?.isBone, `no bone ${n}`);
  for (const tr of walk.tracks) {
    const n = tr.getValueSize();
    const v = tr.values;
    const end = v.length - n;
    let d = 0;
    for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(v[i] - v[end + i]));
    if (d > 1e-5) check(false, `${tr.name} doesn't loop (${d.toFixed(4)})`);
  }
  // feet in the body's frame: the right hind paw where the left one was half a step before,
  // across the body
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(walk).play();
  const foot = (name, t) => {
    mixer.setTime((((t % 1) + 1) % 1) * walk.duration);
    scene.updateMatrixWorld(true);
    return scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  };
  let worst = 0;
  for (let k = 0; k < 1; k += 1 / 24) {
    const r = foot('1_Right_Limb_3', k);
    const l = foot('1_Left_Limb_3', k - 0.5);
    worst = Math.max(worst, Math.hypot(r.x + l.x, r.y - l.y, r.z - l.z));
  }
  check(worst < 0.02, `hind right paw off the mirrored left by ${worst.toFixed(3)} (body length 1)`);

  // QuadRig on it: four legs found, a dead rat rolled onto its side and lifted clear of the ground
  mixer.stopAllAction();
  scene.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  const rig = QuadRig.find(scene, size);
  check(rig, 'QuadRig found no legs');
  if (rig) {
    const thigh = scene.getObjectByName('1_Right_Limb_0');
    const rest = thigh.quaternion.clone();
    const a = { state: 'dead', stateTime: 0, stateDur: 0, speed: 0, dead: true, deathTime: 2, hitFlash: 0, chilled: false, poisoned: false, blood: 'red', killedBy: 'phys' };
    rig.pose(0.016, a, null);
    check(Math.abs(rig.body.roll) > 1.4 && rig.body.rise > 0.1 && Math.abs(rig.body.side) > 0.1, `dead: roll ${rig.body.roll.toFixed(2)} rise ${rig.body.rise.toFixed(2)} side ${rig.body.side.toFixed(2)}`);
    check(thigh.quaternion.angleTo(rest) > 0.1, 'the legs did not curl');
    rig.reset();
    check(thigh.quaternion.angleTo(rest) < 1e-6, 'reset left the legs bent');
    rig.pose(0.016, { ...a, dead: false, state: 'cast', stateTime: 0.4, stateDur: 1 }, null);
    check(rig.body.pitch > 0.05, `hunched for the quills: pitch ${rig.body.pitch.toFixed(2)}`);
  }

  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`  hunter weapons ${[...held].join(', ')}; ${shields}/300 with shields; quill rat ${tris} triangles, ${(fs.statSync(file).size / 1024).toFixed(0)} KB, hind paws mirrored within ${worst.toFixed(3)}`);
};
