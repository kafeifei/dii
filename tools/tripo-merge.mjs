// Brings a rigged, animated Tripo Studio export into models-src/ai/<key>.glb, the form
// tools/build-models.mjs expects (tools/meshy-merge.mjs does the same for Meshy characters).
// Exports live in models-src/tripo/ (not committed); fetch one again with @tripo3d/cli, e.g.
//   tripo process animate <project> --rig-type octopod --animations preset:octopod:walk -o models-src/tripo/spider.glb
// node tools/tripo-merge.mjs [<key> ...]
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';

/**
 *   file     the export in models-src/tripo/
 *   project  the Tripo Studio project it came from
 *   clips    Tripo clip name → the name the game plays it under
 *   steps    the preset plays the same step this many times over: keep the first, as a loop
 *   pace     speed-up for the clips: Tripo's presets amble
 *   stride   scale the swing of each leg's upper two joints about their mean over the step, by
 *            leg pair (the presets take short steps, the front paws shorter than the hind ones)
 *   idle     hold this clip's first frame as a still 'Idle' (code adds the twitches); 'rest' holds
 *            the bind pose instead
 *   rename   bones Tripo leaves as bone_N (or misnames), named for the code that poses them
 *            (src/render/legs.ts); keys are the names in the export
 *   mirror   legs whose retargeted track is wrong, rebuilt from the opposite leg: mirrored across
 *            the body and half a step later (`from` / `to` joint chains hip first, below `parent`)
 *   tris     simplify to about this many triangles (Tripo's raw meshes run to a million and more)
 *   keyed    clips keyed here, for a rig that comes with none (Tripo's avian rig has no presets):
 *            name → { dur, bones: { bone: (u) => [[axis, angle], ...] }, body: (u) => [[axis, angle], ...] },
 *            u the clip's progress 0–1. A bone turns about each axis (given in the rest pose's frame,
 *            Tripo's: +X ahead, +Y up, +Z the creature's right) in its own frame, so it is carried by
 *            its parent's turn; `body` turns the whole of it about BODY_PIVOT's bone, by its root
 */

// ── the foul crow's clips (D2 foulcrow1, Code BK, flying: modes NU WL GH A1 DT; MonStats2 has no RN) ──
// Tripo's avian rig stands the bird upright, wings spread flat, so every clip first tips it forward
// to fly level, head and tail along the ground and wings beating up and down: at the game's camera
// (39° down) an upright body with spread wings reads as a bat.
/** its axes in the rest pose (Tripo's frame): the spine runs up and a little ahead; BACK is up once it flies level */
const SPINE = [0.39, 0.92, 0];
const BACK = [-0.92, 0.39, 0];
const LAT = [0, 0, 1];
const ease = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** keys [u, value, …] eased between: the value at u */
const kf = (u, ...k) => {
  if (u <= k[0]) return k[1];
  for (let i = 2; i < k.length; i += 2) if (u <= k[i]) return k[i - 1] + (k[i + 1] - k[i - 1]) * ease((u - k[i - 2]) / (k[i] - k[i - 2]));
  return k[k.length - 1];
};
/** a wing beat's phase, 0 at the top of the stroke: the downstroke takes `down` of the beat */
const beat = (u, down) => {
  const w = ((u % 1) + 1) % 1;
  return w < down ? (w / down) * Math.PI : Math.PI + ((w - down) / (1 - down)) * Math.PI;
};
/**
 * A wing beat `n` times over the clip between `top` and `bottom` (rad at the shoulder, up +), the
 * forearm and hand trailing it so the wing whips, the hand folding back on the upstroke
 */
const flapping = (top, bottom, down, n = 1) => (u) => {
  const p = beat(u * n, down);
  const mid = (top + bottom) / 2;
  const amp = (top - bottom) / 2;
  return { s: mid + amp * Math.cos(p), f: 0.24 * Math.cos(p - 0.7), h: 0.2 * Math.cos(p - 1.3), sw: 0.35 * Math.max(0, -Math.sin(p - 0.4)) };
};
/** both wings' bones from `lift(u)` → { s, f, h, sw }: the right wing turns the other way about the spine */
const wings = (lift) => {
  const side = (k) => ({
    [`Wing_${k > 0 ? 'Left' : 'Right'}_0`]: (u) => [[SPINE, k * lift(u).s]],
    [`Wing_${k > 0 ? 'Left' : 'Right'}_1`]: (u) => [[SPINE, k * lift(u).f], [BACK, k * lift(u).sw * 0.4]],
    [`Wing_${k > 0 ? 'Left' : 'Right'}_2`]: (u) => [[SPINE, k * lift(u).h], [BACK, k * lift(u).sw]],
  });
  return { ...side(1), ...side(-1) };
};
/** both legs: the hip swung back (−) or ahead, the knee folded, the toes curled */
const legs = (hip, knee, toes = () => 0) => {
  const out = {};
  for (const s of ['Left', 'Right']) {
    out[`0_${s}_Limb_0`] = (u) => [[LAT, hip(u)]];
    out[`0_${s}_Limb_1`] = (u) => [[LAT, knee(u)]];
    out[`0_${s}_Limb_2`] = (u) => [[LAT, toes(u)]];
  }
  return out;
};
/** the tail's two middle feathers, lifted (−) or dropped */
const tail = (f) => ({ Tail_0: (u) => [[LAT, f(u)]], Tail_Mid_0: (u) => [[LAT, f(u)]] });
/** flying level: the body tipped forward this far, the head lifted back to look ahead */
const LEVEL = -1.05;
const TUCK = { hip: -0.8, knee: 0.7, toes: 0.5 };
/** the dying crow's three quick beats */
const LAST_FLAIL = flapping(0.7, -0.6, 0.45, 3);
const CROW = {
  // hovering where it is (D2 draws its birds never still): tipped half-way, legs hanging, a quicker deeper beat
  Idle: {
    dur: 0.5,
    body: (u) => [[LAT, -0.7 + 0.04 * Math.sin(u * 2 * Math.PI)]],
    bones: {
      ...wings(flapping(0.78, -0.62, 0.5)),
      ...legs(() => -0.15, () => 0.35, () => 0.3),
      Neck: () => [[LAT, 0.35]],
      Head_0: () => [[LAT, 0.2]],
      ...tail((u) => -0.1 + 0.05 * Math.sin(u * 2 * Math.PI)),
    },
  },
  // flying level, legs tucked back under the tail
  Fly: {
    dur: 0.6,
    body: () => [[LAT, LEVEL]],
    bones: {
      ...wings(flapping(0.62, -0.52, 0.42)),
      ...legs(() => TUCK.hip, () => TUCK.knee, () => TUCK.toes),
      Neck: (u) => [[LAT, 0.55 + 0.04 * Math.cos(u * 2 * Math.PI)]],
      Head_0: () => [[LAT, 0.35]],
      ...tail((u) => -0.35 + 0.06 * Math.sin(u * 2 * Math.PI)),
    },
  },
  // its swoop's blow (A1): rears up braking, wings high, talons thrust ahead, then rakes them down
  // and back as the beak stabs, landing half-way (where the sim resolves it), and flies on
  Attack: {
    dur: 0.8,
    body: (u) => [[LAT, kf(u, 0, LEVEL, 0.3, -0.35, 0.5, -0.85, 1, LEVEL)]],
    bones: {
      ...wings((u) => ({ s: kf(u, 0, 0.1, 0.3, 0.75, 0.5, -0.55, 0.75, 0.3, 1, 0.1), f: kf(u, 0, 0, 0.35, 0.25, 0.55, -0.25, 1, 0), h: kf(u, 0, 0, 0.4, 0.2, 0.6, -0.2, 1, 0), sw: kf(u, 0, 0, 0.3, 0.2, 0.5, 0, 1, 0) })),
      ...legs((u) => kf(u, 0, TUCK.hip, 0.35, 1.0, 0.55, -0.2, 1, TUCK.hip), (u) => kf(u, 0, TUCK.knee, 0.35, 0.1, 0.55, 0.3, 1, TUCK.knee), (u) => kf(u, 0, TUCK.toes, 0.3, -0.4, 0.5, 0.7, 1, TUCK.toes)),
      Neck: (u) => [[LAT, kf(u, 0, 0.55, 0.3, 0.95, 0.5, 0.05, 1, 0.55)]],
      Head_0: (u) => [[LAT, kf(u, 0, 0.35, 0.3, 0.45, 0.5, -0.1, 1, 0.35)]],
      ...tail((u) => kf(u, 0, -0.35, 0.3, 0.25, 0.6, -0.1, 1, -0.35)),
    },
  },
  // struck: thrown up and back, wings flung high, and level again
  Hit: {
    dur: 0.45,
    body: (u) => [[LAT, kf(u, 0, LEVEL, 0.25, -0.55, 1, LEVEL)], [SPINE, kf(u, 0, 0, 0.25, 0.3, 1, 0)]],
    bones: {
      ...wings((u) => ({ s: kf(u, 0, 0.1, 0.2, 0.7, 1, 0.1), f: kf(u, 0, 0, 0.25, 0.3, 1, 0), h: kf(u, 0, 0, 0.3, 0.25, 1, 0), sw: 0 })),
      ...legs((u) => kf(u, 0, TUCK.hip, 0.25, -0.1, 1, TUCK.hip), () => TUCK.knee, () => TUCK.toes),
      Neck: (u) => [[LAT, kf(u, 0, 0.55, 0.2, 1.0, 1, 0.55)]],
      Head_0: () => [[LAT, 0.35]],
    },
  },
  // dead: a last flail, then tumbling over onto its back, wings slack and splayed on the ground (up
  // for the bird is down once it lies on its back), legs curled up in the air
  Death: {
    dur: 1.5,
    body: (u) => [[LAT, kf(u, 0, LEVEL, 0.4, -1.4, 0.9, -1.12)], [SPINE, kf(u, 0, 0, 0.3, 0.5, 0.85, 3.0, 1, 3.1)]],
    bones: {
      ...wings((u) => (u < 0.35 ? { ...LAST_FLAIL(u), sw: 0 } : { s: kf(u, 0.35, LAST_FLAIL(0.35).s, 0.85, 0.12), f: kf(u, 0.35, LAST_FLAIL(0.35).f, 0.85, 0.05), h: kf(u, 0.35, LAST_FLAIL(0.35).h, 0.85, 0.05), sw: kf(u, 0.35, 0, 0.85, 0.25) })),
      ...legs((u) => kf(u, 0, TUCK.hip, 0.6, 0.7), (u) => kf(u, 0, TUCK.knee, 0.6, 1.1), (u) => kf(u, 0, TUCK.toes, 0.6, 0.9)),
      Neck: (u) => [[LAT, kf(u, 0, 0.55, 0.3, 0.9, 0.9, -0.35)]],
      Head_0: (u) => [[LAT, kf(u, 0, 0.35, 0.9, -0.3)]],
      ...tail((u) => kf(u, 0, -0.35, 0.9, 0.1)),
    },
  },
};

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
  // D2's quill rat; only the quadruped walk comes rigged, the rest is posed in code (src/render/legs.ts)
  // (--rig-type quadruped --animations preset:quadruped:walk; the full 1.4M-triangle mesh)
  mon_quillrat: {
    file: 'quillrat/quillrat.glb',
    project: 'c6d02a67-f436-494d-b1fa-5b8fdb020481',
    clips: { 'preset:quadruped:walk': 'Walk' },
    steps: 3,
    // about a body length a second at 1× (specs.ts QUILLRAT_STRIDE): D2's walk (velocity 3, some
    // 1.5 m/s for a rat 1.1 m long) then plays it at about 1.4×
    pace: 1.5,
    stride: [2, 1.5],
    idle: 'rest',
    tris: 7000,
    rename: {
      // the hind right leg is named one bone down from its left twin: its thigh is bone_36 and
      // shin..foot carry the names thigh..shin (the left leg's toe has no twin)
      bone_36: '1_Right_Limb_0',
      'tripo::1_Right_Limb_0': '1_Right_Limb_1',
      'tripo::1_Right_Limb_1': '1_Right_Limb_2',
      'tripo::1_Right_Limb_2': '1_Right_Limb_3',
      // the shoulder blades; the right one is misnamed as a fifth spine bone
      bone_15: 'Scapula_Left',
      'tripo::Spine_4': 'Scapula_Right',
      // the tail, root to tip
      bone_40: 'Tail_0',
      bone_41: 'Tail_1',
      'tripo::Tail_0': 'Tail_2',
    },
    // the walk was retargeted by the old names, so that leg kicks about out of step
    mirror: {
      parent: 'Spine_0',
      from: ['1_Left_Limb_0', '1_Left_Limb_1', '1_Left_Limb_2', '1_Left_Limb_3'],
      to: ['1_Right_Limb_0', '1_Right_Limb_1', '1_Right_Limb_2', '1_Right_Limb_3'],
    },
  },
  // D2's foul crow: Tripo's avian rig (rig_avian on an image-to-model from the avatar's act1 foulcrow
  // concept, drawn from words alone; project files in models-src/tripo/foulcrow/tripo.json), which has
  // no clips: they are keyed here (CROW). Wings flap cleanly about the spine up to about ±0.8 rad;
  // folded past 1.2 the mesh tears (2026-10-26 test), so the clips stay inside that
  mon_foulcrow: {
    file: 'foulcrow/rig.glb',
    project: '0471efbb-5d6e-4b3f-8ac1-fd873b64147f',
    clips: {},
    keyed: CROW,
    tris: 7000,
    rename: {
      bone_3: 'Neck',
      // shoulder, forearm, hand of each wing (the feathers' own bones hang off the forearm and hand)
      bone_9: 'Wing_Left_0',
      bone_10: 'Wing_Left_1',
      bone_11: 'Wing_Left_2',
      bone_22: 'Wing_Right_0',
      bone_23: 'Wing_Right_1',
      bone_24: 'Wing_Right_2',
      bone_50: 'Tail_0',
      bone_51: 'Tail_1',
      bone_56: 'Tail_Mid_0',
      bone_57: 'Tail_Mid_1',
    },
  },
};

/** the bone whose rest position the whole body turns about in a keyed clip's `body` */
const BODY_PIVOT = 'Spine_0';

/** a node's rest rotation in the scene (Tripo's frame) */
function restWorldQ(node) {
  const q = new THREE.Quaternion();
  new THREE.Matrix4().fromArray(node.getWorldMatrix()).decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
}

/** the clips of `keyed` (CREATURES' `keyed`) baked at FPS onto the rig's bones, in its rest frame */
function bakeKeyed(doc, keyed, nodes) {
  const buffer = doc.getRoot().listBuffers()[0];
  const turns = (list) => list.map(([axis, angle]) => [new THREE.Vector3(...axis).normalize(), angle]);
  const root = nodes.get('Root');
  const pivot = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(nodes.get(BODY_PIVOT).getWorldMatrix()));
  const parentW = new THREE.Matrix4().fromArray(root.getParentNode()?.getWorldMatrix() ?? new THREE.Matrix4().toArray());
  const parentInv = parentW.clone().invert();
  const rootRest = new THREE.Matrix4().compose(new THREE.Vector3(...root.getTranslation()), new THREE.Quaternion(...root.getRotation()), new THREE.Vector3(...root.getScale()));
  for (const [name, clip] of Object.entries(keyed)) {
    const frames = Math.max(2, Math.round(clip.dur * FPS));
    const input = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(Float32Array.from({ length: frames + 1 }, (_, i) => (i * clip.dur) / frames));
    const anim = doc.createAnimation(name);
    const add = (node, path, values) => {
      const output = doc.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(values).setBuffer(buffer);
      const smp = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(smp));
    };
    for (const [bone, f] of Object.entries(clip.bones)) {
      const node = nodes.get(bone);
      if (!node) throw new Error(`${name}: no bone ${bone}`);
      const rest = new THREE.Quaternion(...node.getRotation());
      const toLocal = restWorldQ(node).invert();
      const values = new Float32Array((frames + 1) * 4);
      for (let i = 0; i <= frames; i++) {
        const q = rest.clone();
        for (const [axis, angle] of turns(f(i / frames))) q.multiply(new THREE.Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(toLocal), angle));
        q.toArray(values, i * 4);
      }
      add(node, 'rotation', values);
    }
    if (clip.body) {
      // the root turned about the pivot: its new transform is parent⁻¹ · (about the pivot) · its rest world
      const rot = new Float32Array((frames + 1) * 4);
      const pos = new Float32Array((frames + 1) * 3);
      const t = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      for (let i = 0; i <= frames; i++) {
        const turn = new THREE.Quaternion();
        for (const [axis, angle] of turns(clip.body(i / frames))) turn.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
        const about = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
        parentInv.clone().multiply(about).multiply(parentW).multiply(rootRest).decompose(t, q, s);
        q.toArray(rot, i * 4);
        t.toArray(pos, i * 3);
      }
      add(root, 'rotation', rot);
      add(root, 'translation', pos);
    }
  }
}

// the avian rig's export is meshopt-compressed
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const FPS = 30;

/** value of a LINEAR / STEP sampler at time t, rotations nlerped (as tools/meshy-merge.mjs) */
function sample(times, values, size, interp, t, out) {
  const n = times.length;
  let k = 0;
  while (k < n - 1 && times[k + 1] <= t) k++;
  const k1 = Math.min(n - 1, k + 1);
  const span = times[k1] - times[k];
  const a = interp === 'STEP' || span <= 0 ? 0 : Math.min(1, Math.max(0, (t - times[k]) / span));
  const sign = size === 4 && values[k * 4] * values[k1 * 4] + values[k * 4 + 1] * values[k1 * 4 + 1] + values[k * 4 + 2] * values[k1 * 4 + 2] + values[k * 4 + 3] * values[k1 * 4 + 3] < 0 ? -1 : 1;
  for (let i = 0; i < size; i++) out[i] = values[k * size + i] * (1 - a) + sign * values[k1 * size + i] * a;
  if (size === 4) {
    const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
    for (let i = 0; i < 4; i++) out[i] /= len;
  }
  return out;
}

/**
 * Rebuilds a clip as one loop of `steps`, sampled evenly (an even number of frames, so half a
 * step is a whole number of them), with `stride` and `mirror` applied. Scale tracks are dropped.
 */
function loopStep(doc, anim, spec, nodes) {
  const buffer = doc.getRoot().listBuffers()[0];
  const chans = anim.listChannels();
  const end = Math.max(...chans.map((c) => c.getSampler().getInput().getMax([])[0]));
  const T = end / (spec.steps ?? 1);
  const frames = 2 * Math.max(1, Math.round((T * FPS) / 2));
  // track arrays by node and path, `frames + 1` samples with the last the first again
  const tracks = new Map();
  const key = (node, p) => `${node.getName()}|${p}`;
  for (const ch of chans) {
    const p = ch.getTargetPath();
    if (p === 'scale') continue;
    const smp = ch.getSampler();
    const size = smp.getOutput().getElementSize();
    const src = smp.getOutput().getArray();
    const times = smp.getInput().getArray();
    const values = new Float32Array((frames + 1) * size);
    const tmp = new Array(size);
    for (let i = 0; i < frames; i++) values.set(sample(times, src, size, smp.getInterpolation(), (i * T) / frames, tmp), i * size);
    values.copyWithin(frames * size, 0, size);
    tracks.set(key(ch.getTargetNode(), p), { node: ch.getTargetNode(), path: p, size, values });
  }
  const quat = (tr, i) => new THREE.Quaternion().fromArray(tr.values, i * 4);

  // longer strides: the upper two joints of each leg swing further about their mean pose over the
  // step (the paws' own flick is left as it is)
  if (spec.stride) {
    for (const tr of tracks.values()) {
      const leg = /^(\d)_(Left|Right)_Limb_[01]$/.exec(tr.node.getName());
      const k = leg && spec.stride[+leg[1]];
      if (tr.path !== 'rotation' || !k || k === 1) continue;
      const mean = new THREE.Quaternion(0, 0, 0, 0);
      const first = quat(tr, 0);
      for (let i = 0; i < frames; i++) {
        const q = quat(tr, i);
        const s = q.dot(first) < 0 ? -1 : 1;
        mean.set(mean.x + s * q.x, mean.y + s * q.y, mean.z + s * q.z, mean.w + s * q.w);
      }
      mean.normalize();
      const inv = mean.clone().invert();
      const axis = new THREE.Vector3();
      for (let i = 0; i <= frames; i++) {
        const d = inv.clone().multiply(quat(tr, i));
        if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
        const angle = 2 * Math.acos(Math.min(1, d.w));
        if (angle < 1e-6) continue;
        axis.set(d.x, d.y, d.z).normalize();
        mean.clone().multiply(d.setFromAxisAngle(axis, angle * k)).toArray(tr.values, i * 4);
      }
    }
  }

  // a leg rebuilt from its twin: its joints turn as the twin's did half a step before, measured
  // from the rest pose in the shared parent's frame and mirrored across the body
  const m = spec.mirror;
  if (m) {
    const parentQ = new THREE.Quaternion();
    new THREE.Matrix4().fromArray(nodes.get(m.parent).getWorldMatrix()).decompose(new THREE.Vector3(), parentQ, new THREE.Vector3());
    // Tripo's +Z is the creature's right: the body's mid-plane normal, in the parent's frame
    const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(parentQ.invert());
    const reflect = (q) => {
      const d = 2 * (q.x * nrm.x + q.y * nrm.y + q.z * nrm.z);
      return q.set(d * nrm.x - q.x, d * nrm.y - q.y, d * nrm.z - q.z, q.w);
    };
    const restOf = (names) => {
      const acc = new THREE.Quaternion();
      return names.map((n) => acc.multiply(new THREE.Quaternion().fromArray(nodes.get(n).getRotation())).clone());
    };
    const restL = restOf(m.from);
    const restR = restOf(m.to);
    const out = m.to.map(() => new Float32Array((frames + 1) * 4));
    for (let i = 0; i <= frames; i++) {
      const j = (i + frames / 2) % frames;
      const acc = new THREE.Quaternion();
      let prev = new THREE.Quaternion();
      m.from.forEach((name, b) => {
        const tr = tracks.get(`${name}|rotation`);
        acc.multiply(tr ? quat(tr, j) : new THREE.Quaternion().fromArray(nodes.get(name).getRotation()));
        const delta = reflect(acc.clone().multiply(restL[b].clone().invert()));
        const world = delta.multiply(restR[b]);
        prev.clone().invert().multiply(world).toArray(out[b], i * 4);
        prev = world;
      });
    }
    for (const [k, tr] of tracks) if (m.to.includes(tr.node.getName())) tracks.delete(k);
    m.to.forEach((name, b) => tracks.set(`${name}|rotation`, { node: nodes.get(name), path: 'rotation', size: 4, values: out[b] }));
  }

  for (const c of chans) c.dispose();
  for (const smp of anim.listSamplers()) smp.dispose();
  const input = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(Float32Array.from({ length: frames + 1 }, (_, i) => (i * T) / frames));
  for (const tr of tracks.values()) {
    const output = doc.createAccessor().setType(tr.size === 4 ? 'VEC4' : 'VEC3').setArray(tr.values).setBuffer(buffer);
    const smp = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(tr.node).setTargetPath(tr.path).setSampler(smp));
  }
}

async function merge(key) {
  const spec = CREATURES[key];
  const doc = await io.read(path.resolve('models-src/tripo', spec.file));
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];

  // three.js drops the ':' from node names anyway
  for (const n of root.listNodes()) {
    const name = n.getName();
    n.setName(spec.rename?.[name] ?? name.replace(/^tripo::/, ''));
  }
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));

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
    if (spec.steps || spec.stride || spec.mirror) loopStep(doc, anim, spec, nodes);
    for (const s of anim.listSamplers()) times.add(s.getInput());
  }
  // samplers share their time accessors: scale each once
  for (const t of times) t.setArray(t.getArray().map((v) => v / spec.pace));
  // clips keyed here, on the rest pose (before the turn to face +Z below)
  if (spec.keyed) bakeKeyed(doc, spec.keyed, nodes);

  // Tripo faces +X; the game's models face +Z (after the clips, which are worked on in Tripo's frame)
  const scene = root.listScenes()[0];
  const facing = doc.createNode('Facing').setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
  for (const n of scene.listChildren()) {
    scene.removeChild(n);
    facing.addChild(n);
  }
  scene.addChild(facing);

  if (spec.idle) {
    // a still: the first frame of a clip, or the bind pose
    const src = root.listAnimations().find((a) => a.getName() === (spec.idle === 'rest' ? 'Walk' : spec.idle));
    const idle = doc.createAnimation('Idle');
    const span = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
    for (const ch of src.listChannels()) {
      const out = ch.getSampler().getOutput();
      const node = ch.getTargetNode();
      const v = spec.idle !== 'rest' ? out.getElement(0, []) : ch.getTargetPath() === 'rotation' ? node.getRotation() : ch.getTargetPath() === 'translation' ? node.getTranslation() : node.getScale();
      const hold = doc.createAccessor().setType(out.getType()).setArray(new Float32Array([...v, ...v])).setBuffer(buffer);
      const smp = doc.createAnimationSampler().setInput(span).setOutput(hold).setInterpolation('STEP');
      idle.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(smp));
    }
  }

  // Tripo ships full PBR (metallic 1); the game has no environment map, so metal renders near-black.
  // Keep colour and normal maps, make everything dielectric (as tools/meshy-merge.mjs does).
  for (const m of root.listMaterials()) {
    if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null).setRoughnessFactor(0.6);
    m.setMetallicFactor(0);
  }
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [512, 512] }));
  if (spec.tris) {
    // at a few dozen pixels tall a million triangles is waste, and the source must stay small
    await MeshoptSimplifier.ready;
    const count = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
    const before = count();
    if (before > spec.tris) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: spec.tris / before, error: 0.02 }), prune());
    console.log(`  ${before} → ${count()} triangles`);
  }
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
