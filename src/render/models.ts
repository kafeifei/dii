import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorState } from '../game/actor';
import { assets, type ModelKey } from './assets';
import { LegRig, QuadRig, type PosedRig } from './legs';
import type { AnimInput } from './rig';

/** something carried in a hand slot: another model file, or a procedural mesh built in body units */
export interface Attachment {
  model: ModelKey | (() => THREE.Object3D);
  hand: 'r' | 'l';
  scale?: number;
  glow?: string | null;
  /**
   * How a rig without weapon slots (Meshy) holds it. The piece has its origin where the hand takes
   * it (tools/ai-props.mjs `grip` / `strap`), and that sits in the palm, measured off the skinned
   * hand mesh (palmGrip) since the rig has no finger bones. In the idle pose it is posed in the
   * actor's frame, then carried by the forearm: Meshy's clips are made for empty hands and let the
   * wrists flop, which would swing a held blade about — a fist round a haft locks the wrist.
   * - 'grip': up and forward out of the fist, the +X edge or bit leading
   * - 'pistol': level and pointing ahead (a crossbow)
   * - 'shield': the fist behind its middle, the face turned forward and out
   * - 'upright': a staff kept upright, tilting with the wrist only while attacking — welded to a
   *   rolling wrist, a staff taller than its bearer swings wildly
   * - 'level': a shaft (+Y) held level and pointing ahead (a spear at the ready)
   */
  hold?: 'grip' | 'pistol' | 'shield' | 'upright' | 'level';
  /**
   * take the pose at the attack's landing frame (half-way through the first attack clip) rather
   * than in the idle stance: a drawn bow upright, a spear's point on the target when it thrusts
   */
  aim?: boolean;
}

/** an object held in the actor's frame and placed from the hand and forearm bones every frame */
interface Held {
  obj: THREE.Object3D;
  hand: THREE.Object3D;
  /** the palm grip in the hand's frame */
  pos: THREE.Vector3;
  /** carries the orientation: the forearm, or the hand for a staff */
  turn: THREE.Object3D;
  /** pose in the idle stance (actor frame), and the `turn` rotation that gives it */
  rest: THREE.Quaternion;
  rot: THREE.Quaternion;
  /** distance out along the piece's +Z from the palm (a shield's back clears the fist) */
  push: number;
  /** upright staves follow the wrist's tilt only while attacking */
  loose: boolean;
  /** 0 = rest pose, 1 = follows the bone */
  follow: number;
  /** posed at the attack's landing frame (Attachment.aim) */
  aim: boolean;
}

/** idle poses in the actor frame (+Z ahead, +X to the left), for the right hand */
const REST: Record<NonNullable<Attachment['hold']>, THREE.Quaternion> = (() => {
  const pose = (x: THREE.Vector3, y: THREE.Vector3) => {
    y.normalize();
    x.addScaledVector(y, -x.dot(y)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  const up = 0.6; // radians above level
  return {
    grip: pose(new THREE.Vector3(0, -Math.cos(up), Math.sin(up)), new THREE.Vector3(-0.15, Math.sin(up), Math.cos(up))),
    pistol: pose(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)),
    // carried on the left arm: face (+Z) forward and out to the left
    shield: pose(new THREE.Vector3(0.9, 0, -0.45), new THREE.Vector3(0, 1, 0)),
    upright: new THREE.Quaternion(),
    level: pose(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.1, 1)),
  };
})();

/** the palm grip of each hand of a Meshy model, in the hand's frame; the same for every instance */
const gripCache = new Map<string, THREE.Vector3 | null>();

/**
 * Where a fist would close on a Meshy hand, from the bind pose: the hand-weighted vertices give the
 * finger direction (their long axis) and the palm normal (the thin one, toward the body — Meshy
 * binds an A-pose with the palms in). The grip sits across the palm at the knuckle line, just off
 * its surface, in the middle of the hand's width.
 */
function palmGrip(sk: THREE.SkinnedMesh, hand: THREE.Bone): THREE.Vector3 | null {
  const bones = sk.skeleton.bones;
  const hi = bones.indexOf(hand);
  if (hi < 0) return null;
  const bindPos = (i: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.skeleton.boneInverses[i]).invert());
  const W = bindPos(hi);
  const H = bindPos(0);
  const pos = sk.geometry.getAttribute('position');
  const si = sk.geometry.getAttribute('skinIndex');
  const sw = sk.geometry.getAttribute('skinWeight');
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
    if (w > 0.6) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(sk.bindMatrix));
  }
  if (pts.length < 20) return null;
  const [f, t, n] = principalAxes(pts);
  const C = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
  if (f.dot(_v1.subVectors(C, W)) < 0) f.negate();
  if (n.dot(_v1.subVectors(H, W)) < 0) n.negate();
  const along = (p: THREE.Vector3, axis: THREE.Vector3) => _v1.subVectors(p, W).dot(axis);
  const L = Math.max(...pts.map((p) => along(p, f)));
  const band = pts.filter((p) => Math.abs(along(p, f) - L * 0.42) < L * 0.12);
  const palm = band.map((p) => along(p, n)).sort((a, b) => a - b)[Math.floor(band.length * 0.75)] ?? 0;
  const across = band.reduce((a, p) => a + along(p, t), 0) / Math.max(1, band.length);
  return W.addScaledVector(f, L * 0.42).addScaledVector(n, palm + 0.012).addScaledVector(t, across).applyMatrix4(sk.skeleton.boneInverses[hi]);
}

/** unit principal axes of a point cloud, largest spread first */
function principalAxes(pts: THREE.Vector3[]): THREE.Vector3[] {
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of pts) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += d[i] * d[j];
  }
  // Jacobi rotations
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let it = 0; it < 30; it++) {
    let p = 0;
    let q = 1;
    for (const [i, j] of [
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(A[i][j]) > Math.abs(A[p][q])) [p, q] = [i, j];
    if (Math.abs(A[p][q]) < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
    const c1 = Math.cos(th);
    const s1 = Math.sin(th);
    for (let k = 0; k < 3; k++) {
      const akp = A[k][p];
      const akq = A[k][q];
      A[k][p] = c1 * akp - s1 * akq;
      A[k][q] = s1 * akp + c1 * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = A[p][k];
      const aqk = A[q][k];
      A[p][k] = c1 * apk - s1 * aqk;
      A[q][k] = s1 * apk + c1 * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = V[k][p];
      const vkq = V[k][q];
      V[k][p] = c1 * vkp - s1 * vkq;
      V[k][q] = s1 * vkp + c1 * vkq;
    }
  }
  return [0, 1, 2]
    .sort((a, b) => A[b][b] - A[a][a])
    .map((i) => new THREE.Vector3(V[0][i], V[1][i], V[2][i]).normalize());
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v3 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();

export interface MoveClip {
  clip: string;
  /** world speed (units/s) at which the clip plays at 1× */
  ref: number;
}

/** the slowest and fastest a move clip plays (nearestMove): the feet slide beyond them */
export const MOVE_RATE_MIN = 0.4;
export const MOVE_RATE_MAX = 3;

/**
 * The move clip nearest the speed (of those `has` finds), played at speed / ref so the feet keep to
 * the ground, as D2 plays a walk at its velocity % (Units.cpp:1684-1700); `rate` is that before the
 * bounds, which only catch extremes: at D2's own speeds every Act 1 monster's walk and +100 % lurch
 * and the heroes' walk, run and charge fall between them (a zombie's walk 0.44×, a spider's lurch
 * 2.9×; tools/test/monster-models.test.mjs)
 */
export function nearestMove(speed: number, moves: MoveClip[], has: (clip: string) => boolean = () => true): { move: MoveClip; rate: number; ts: number } | null {
  let best: { move: MoveClip; rate: number; ts: number } | null = null;
  let bestD = Infinity;
  for (const mv of moves) {
    if (!has(mv.clip)) continue;
    const d = Math.abs(Math.log(Math.max(0.1, speed) / mv.ref));
    if (d < bestD) {
      bestD = d;
      const rate = speed / mv.ref;
      best = { move: mv, rate, ts: Math.min(MOVE_RATE_MAX, Math.max(MOVE_RATE_MIN, rate)) };
    }
  }
  return best;
}

export interface ModelSpec {
  model: ModelKey;
  /** 'kaykit' bodies are driven by the shared skeleton_minion clip library */
  rig: 'kaykit' | 'quat';
  /** world height of the body (or footprint width with fitWidth) */
  height: number;
  fitWidth?: boolean;
  /** KayKit accessory meshes (weapons, hats, capes) to keep; the rest are hidden. Omit to keep all. */
  show?: string[];
  attach?: Attachment[];
  /** emissive glow on these accessory meshes */
  glow?: { meshes: string[]; color: string } | null;
  tint?: string | null;
  tintAmount?: number;
  emissive?: string | null;
  opacity?: number;
  /** hover height for floating creatures */
  float?: number;
  /**
   * one-piece creatures without a skeleton, moved in the vertex shader: 'flap' beats wings spread
   * along x, 'hover' only bobs and sways
   */
  motion?: 'flap' | 'hover';
  /**
   * a Tripo rig with only a walk (tools/tripo-merge.mjs): everything else is posed in code on top
   * of the clips (src/render/legs.ts), by its rig type
   */
  legs?: 'octopod' | 'quadruped';
  clips: {
    idle: string[];
    move: MoveClip[];
    attack: string[];
    cast?: string[];
    hit?: string[];
    block?: string[];
    charge?: MoveClip;
    death: string[];
    revive?: string;
  };
}

/** chibi packs have big heads; shrink bodies a little so they don't dwarf 1-tile corridors */
const BODY_SCALE = 0.9;

/** KayKit / ai_hero hand slots, then plain Mixamo-style hands (Meshy rigs) */
const HAND_BONES = { r: ['handslotr', 'handslot.r', 'RightHand'], l: ['handslotl', 'handslot.l', 'LeftHand'] };

interface MatInfo {
  mat: THREE.MeshStandardMaterial;
  emissive: THREE.Color;
  color: THREE.Color;
  opacity: number;
  transparent: boolean;
}

/**
 * What tells one model rig from another (ModelRig.reset hands a rig on to another actor of the same
 * key): the whole spec, or null for one carrying something built in code, which can't be compared
 */
export function rigKey(spec: ModelSpec): string | null {
  if (spec.attach?.some((a) => typeof a.model === 'function')) return null;
  return JSON.stringify(spec);
}

/**
 * Vertex motion for one-piece creatures (see ModelSpec.motion), in the mesh's own space: 'flap'
 * lifts everything beyond the body along x on a sine (wings).
 */
function addMotion(mat: THREE.Material, kind: 'flap', u: Record<string, THREE.IUniform>) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    const move = `float span = (uBoxMax.x - uBoxMin.x) * 0.5;
          float side = transformed.x - (uBoxMax.x + uBoxMin.x) * 0.5;
          float w = clamp((abs(side) - span * 0.2) / (span * 0.8), 0.0, 1.0);
          transformed.y += sin(uMoveT) * w * w * span * 0.6 * uMoveK;
          transformed.x -= sign(side) * (1.0 - cos(sin(uMoveT) * w)) * span * 0.25 * uMoveK;`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uMoveT;\nuniform float uMoveK;\nuniform vec3 uBoxMin;\nuniform vec3 uBoxMax;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n{\n${move}\n}`);
  };
  mat.customProgramCacheKey = () => `motion-${kind}`;
}

export class ModelRig {
  root = new THREE.Group();
  private inner = new THREE.Group();
  private body: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private clips = new Map<string, THREE.AnimationClip>();
  /** twin copies so a clip can cross-fade into itself (back-to-back attacks) */
  private twins = new Map<THREE.AnimationClip, THREE.AnimationClip>();
  private mats: MatInfo[] = [];
  private held: Held[] = [];
  private cur: THREE.AnimationAction | null = null;
  private curClip: THREE.AnimationClip | null = null;
  private lastState: ActorState | null = null;
  private lastStateTime = 0;
  private wasDead = false;
  private faded = false;
  private reviving = 0;
  private baseY = 0;
  private baseCenterZ = 0;
  /** where the body sits in the root as made, for reset */
  private readonly basePos = new THREE.Vector3();
  private time = Math.random() * 10;
  private legs: PosedRig | null = null;
  private flash = new THREE.Color();
  /** shared by every material of a `motion` creature */
  private moveU = { uMoveT: { value: Math.random() * 10 }, uMoveK: { value: 1 }, uBoxMin: { value: new THREE.Vector3() }, uBoxMax: { value: new THREE.Vector3() } };

  constructor(readonly spec: ModelSpec) {
    const tpl = assets.get(spec.model)!;
    this.body = cloneSkinned(tpl.gltf.scene);
    const h = spec.height * BODY_SCALE;
    const s = spec.fitWidth ? h / Math.max(tpl.size.x, tpl.size.z) : h / tpl.size.y;
    this.inner.scale.setScalar(s);
    this.baseY = -tpl.min.y * s + (spec.float ?? 0);
    this.inner.position.set(-tpl.center.x * s, this.baseY, -tpl.center.z * s);
    this.basePos.copy(this.inner.position);
    this.baseCenterZ = tpl.center.z * s;
    this.inner.add(this.body);
    this.root.add(this.inner);
    // hinge axes come from the rest pose, before any clip has moved a bone
    if (spec.legs === 'octopod') this.legs = LegRig.find(this.body);
    else if (spec.legs === 'quadruped') this.legs = QuadRig.find(this.body, tpl.size.clone().multiplyScalar(s));

    // accessories
    if (spec.show) {
      const keep = new Set(spec.show);
      this.body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !keep.has(m.name) && !keep.has(m.parent?.name ?? '')) m.visible = false;
      });
    }
    const glowSet = new Set<THREE.Object3D>();
    for (const a of spec.attach ?? []) {
      const bone = this.findBone(HAND_BONES[a.hand]);
      if (!bone) continue;
      let obj: THREE.Object3D;
      if (a.hold) {
        // lives in the actor's frame (world units), placed every frame in updateHeld
        const key = `${spec.model}|${a.hand}`;
        if (!gripCache.has(key)) {
          let sk: THREE.SkinnedMesh | null = null;
          this.body.traverse((o) => {
            const m = o as THREE.SkinnedMesh;
            if (m.isSkinnedMesh && m.skeleton.bones.includes(bone as THREE.Bone) && (!sk || m.geometry.getAttribute('position').count > sk.geometry.getAttribute('position').count)) sk = m;
          });
          gripCache.set(key, sk ? palmGrip(sk, bone as THREE.Bone) : null);
        }
        const grip = gripCache.get(key);
        if (!grip) continue;
        if (typeof a.model === 'function') obj = a.model();
        else {
          const t = assets.get(a.model);
          if (!t) continue;
          obj = t.gltf.scene.clone(true);
        }
        if (a.scale) obj.scale.multiplyScalar(a.scale);
        this.root.add(obj);
        const loose = a.hold === 'upright';
        // the left hand mirrors the right-hand poses across the body
        const rest = REST[a.hold].clone();
        if (a.hand === 'l' && a.hold !== 'shield') rest.set(rest.x, -rest.y, -rest.z, rest.w);
        this.held.push({ obj, hand: bone, pos: grip, turn: loose ? bone : bone.parent!, rest, rot: new THREE.Quaternion(), push: a.hold === 'shield' ? 0.05 : 0, loose, follow: loose ? 0.2 : 1, aim: !!a.aim });
        if (a.glow) obj.traverse((o) => glowSet.add(o));
        continue;
      } else if (typeof a.model === 'function') {
        // procedural attachments are built in world units: undo the body scale
        obj = a.model();
        this.root.updateMatrixWorld(true);
        obj.scale.setScalar(1 / bone.getWorldScale(new THREE.Vector3()).x);
      } else {
        const t = assets.get(a.model);
        if (!t) continue;
        obj = t.gltf.scene.clone(true);
      }
      if (a.scale) obj.scale.multiplyScalar(a.scale);
      bone.add(obj);
      if (a.glow) obj.traverse((o) => glowSet.add(o));
    }
    if (spec.glow) {
      const names = new Set(spec.glow.meshes);
      this.body.traverse((o) => {
        if (names.has(o.name)) o.traverse((c) => glowSet.add(c));
      });
    }
    const glowColor = spec.glow?.color ?? spec.attach?.find((a) => a.glow)?.glow ?? null;

    if (spec.motion) {
      const box = new THREE.Box3();
      this.body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!);
      });
      this.moveU.uBoxMin.value.copy(box.min);
      this.moveU.uBoxMax.value.copy(box.max);
    }

    // per-instance materials so hit flashes and tints don't leak between actors
    const tint = spec.tint ? new THREE.Color(spec.tint) : null;
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      const conv = (src: THREE.Material) => {
        const mat = (src as THREE.MeshStandardMaterial).clone();
        // KayKit atlases are pale and glossy; under the close player light they blow out
        if (spec.rig === 'kaykit') {
          mat.roughness = Math.max(mat.roughness, 0.85);
          mat.color.multiplyScalar(0.78);
        }
        if (tint) mat.color.lerp(tint, spec.tintAmount ?? 0.45);
        if (spec.emissive) mat.emissive.set(spec.emissive);
        if (glowColor && glowSet.has(m)) {
          mat.emissive.set(glowColor).multiplyScalar(0.55);
        }
        if (spec.opacity !== undefined && spec.opacity < 1) {
          mat.transparent = true;
          mat.opacity = spec.opacity;
        }
        if (spec.motion && spec.motion !== 'hover') addMotion(mat, spec.motion, this.moveU);
        this.mats.push({ mat, emissive: mat.emissive.clone(), color: mat.color.clone(), opacity: mat.opacity, transparent: mat.transparent });
        return mat;
      };
      m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
    });

    // animation
    this.mixer = new THREE.AnimationMixer(this.body);
    const lib = spec.rig === 'kaykit' ? assets.kaykitClips : tpl.gltf.animations;
    for (const c of lib) this.clips.set(c.name, c);
    this.play(this.pick(spec.clips.idle), true, 1, 0);
    if (this.held.length) {
      // the forearm (or wrist) rotation that gives each piece its rest pose in the idle stance, or
      // half-way through the attack for an aimed one
      const fit = (aim: boolean) => {
        this.root.updateMatrixWorld(true);
        const rootQ = this.root.getWorldQuaternion(_q1);
        for (const h of this.held) if (h.aim === aim) h.rot.copy(h.turn.getWorldQuaternion(_q2).invert().multiply(rootQ).multiply(h.rest));
      };
      this.mixer.setTime(0);
      fit(false);
      const attack = this.held.some((h) => h.aim) ? this.pick(spec.clips.attack) : null;
      if (attack) {
        this.play(attack, false, 1, 0);
        this.mixer.setTime(attack.duration * 0.5);
        fit(true);
        this.play(this.pick(spec.clips.idle), true, 1, 0);
      }
    }
    this.mixer.setTime(Math.random() * 2);
    this.updateHeld(1, false);
  }

  private updateHeld(dt: number, attacking: boolean) {
    if (!this.held.length) return;
    // only the bones from the root down to each hand placed as the clips left them (`turn` is the
    // hand or its parent): the rest of the rig is placed with the scene, after
    for (const h of this.held) h.hand.updateWorldMatrix(true, false);
    const toRoot = _m1.copy(this.root.matrixWorld).invert();
    this.root.matrixWorld.decompose(_v3, _q1, _v2);
    const rootInv = _q1.invert();
    for (const h of this.held) {
      if (h.loose) h.follow += ((attacking ? 1 : 0.2) - h.follow) * (1 - Math.exp(-10 * dt));
      h.turn.matrixWorld.decompose(_v3, _q3, _v2);
      const q = _q2.copy(rootInv).multiply(_q3).multiply(h.rot);
      if (h.loose) h.obj.quaternion.copy(h.rest).slerp(q, h.follow);
      else h.obj.quaternion.copy(q);
      // the piece's origin is where the hand takes it
      h.obj.position.copy(_v1.copy(h.pos).applyMatrix4(h.hand.matrixWorld).applyMatrix4(toRoot));
      if (h.push) h.obj.position.add(_v2.set(0, 0, h.push).applyQuaternion(h.obj.quaternion));
    }
  }

  private findBone(names: string[]): THREE.Object3D | null {
    for (const n of names) {
      const b = this.body.getObjectByName(n);
      if (b) return b;
    }
    return null;
  }

  private pick(names: string[] | undefined, random = false): THREE.AnimationClip | null {
    if (!names) return null;
    const avail = names.map((n) => this.clips.get(n)).filter((c): c is THREE.AnimationClip => !!c);
    if (!avail.length) return null;
    return random ? avail[Math.floor(Math.random() * avail.length)] : avail[0];
  }

  /** the attack clip for the mode it is in (AnimInput.clip), the first there is if the look has none for it; a random one with no mode */
  private attackClip(names: string[], i: number | undefined): THREE.AnimationClip | null {
    if (i === undefined) return this.pick(names, true);
    return this.clips.get(names[i]) ?? this.pick(names);
  }

  /** the move clip this body has nearest the speed, and the rate it plays at (nearestMove) */
  private pickMove(speed: number, moves: MoveClip[]): { clip: THREE.AnimationClip; ts: number } | null {
    const best = nearestMove(speed, moves, (c) => this.clips.has(c));
    return best ? { clip: this.clips.get(best.move.clip)!, ts: best.ts } : null;
  }

  private play(clip: THREE.AnimationClip | null, loop: boolean, ts: number, fade: number) {
    if (!clip) return;
    if (clip === this.curClip && !loop) {
      // restart the same one-shot: cross-fade from a twin so it doesn't snap
      let twin = this.twins.get(clip);
      if (!twin) {
        twin = clip.clone();
        this.twins.set(clip, twin);
        this.twins.set(twin, clip);
      }
      clip = twin;
    }
    const act = this.mixer.clipAction(clip);
    act.reset();
    act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    act.clampWhenFinished = !loop;
    act.timeScale = ts;
    act.setEffectiveWeight(1);
    if (this.cur && this.cur !== act && fade > 0) act.crossFadeFrom(this.cur, fade, false);
    else if (this.cur && this.cur !== act) this.cur.stop();
    act.play();
    this.cur = act;
    this.curClip = clip;
  }

  update(dt: number, a: AnimInput) {
    this.time += dt;
    const c = this.spec.clips;
    // flash & status tint
    const f = a.hitFlash;
    for (const mi of this.mats) {
      mi.mat.emissive.copy(mi.emissive);
      if (f > 0) mi.mat.emissive.add(this.flash.setRGB(f * 0.9, f * 0.75, f * 0.6));
      if (a.chilled) mi.mat.emissive.add(this.flash.setRGB(0.02, 0.08, 0.22));
      if (a.poisoned) mi.mat.emissive.add(this.flash.setRGB(0.02, 0.15, 0));
    }

    if (a.dead) {
      this.updateDeath(dt, a);
      this.advance(dt, a);
      this.updateHeld(dt, false);
      return;
    }
    if (this.wasDead) {
      // resurrected
      this.wasDead = false;
      this.faded = false;
      this.root.position.y = 0;
      for (const mi of this.mats) {
        mi.mat.color.copy(mi.color);
        mi.mat.opacity = mi.opacity;
        mi.mat.transparent = mi.opacity < 1;
      }
      const rv = c.revive ? this.clips.get(c.revive) : null;
      if (rv) {
        this.play(rv, false, 1.4, 0.05);
        this.reviving = rv.duration / 1.4;
      }
      this.lastState = null;
    }
    if (this.reviving > 0) {
      this.reviving -= dt;
      this.advance(dt, a);
      this.updateHeld(dt, false);
      return;
    }

    const restarted = a.state !== this.lastState || a.stateTime < this.lastStateTime - 1e-4;
    this.lastState = a.state;
    this.lastStateTime = a.stateTime;
    const dur = Math.max(0.12, a.stateDur);
    switch (a.state) {
      case 'move': {
        const mv = this.pickMove(a.speed, c.move);
        if (mv) {
          if (restarted || this.curClip !== mv.clip) this.play(mv.clip, true, mv.ts, 0.15);
          else if (this.cur) this.cur.timeScale = mv.ts;
        }
        break;
      }
      case 'charge': {
        const mv = c.charge ? this.pickMove(a.speed, [c.charge]) : this.pickMove(a.speed, c.move);
        if (mv && (restarted || this.curClip !== mv.clip)) this.play(mv.clip, true, mv.ts, 0.1);
        break;
      }
      case 'attack':
      case 'cast': {
        if (restarted) {
          const clip = a.state === 'cast' && c.cast ? this.pick(c.cast, true) : this.attackClip(c.attack, a.clip);
          if (clip) this.play(clip, false, clip.duration / dur, 0.06);
        }
        break;
      }
      case 'hit':
      case 'block': {
        if (restarted) {
          const clip = this.pick(a.state === 'block' ? (c.block ?? c.hit) : c.hit, true);
          if (clip) this.play(clip, false, a.exact ? clip.duration / Math.max(0.04, a.stateDur) : Math.max(1, clip.duration / Math.max(0.25, dur)), 0.05);
        }
        break;
      }
      default: {
        const clip = this.pick(c.idle);
        if (clip && this.curClip !== clip) this.play(clip, true, 1, 0.2);
        break;
      }
    }
    if (this.spec.float) this.inner.position.y = this.baseY + Math.sin(this.time * 2.2) * 0.08;
    if (this.spec.motion) this.updateMotion(dt, a);
    this.advance(dt, a);
    this.updateHeld(dt, a.state === 'attack');
  }

  /** run the clips, then let code bend a many-legged rig's legs and carry its body on top */
  private advance(dt: number, a: AnimInput) {
    this.legs?.reset();
    this.mixer.update(dt);
    if (!this.legs) return;
    const clip = this.curClip;
    const walking = !a.dead && (a.state === 'move' || a.state === 'charge') && this.cur && clip && this.spec.clips.move.some((m) => m.clip === clip.name);
    this.legs.pose(dt, a, walking ? (this.cur!.time % clip!.duration) / clip!.duration : null);
    const b = this.legs.body;
    this.inner.position.x = this.basePos.x + b.side;
    this.inner.position.z = -this.baseCenterZ + b.lunge;
    this.inner.position.y = this.baseY + b.rise;
    this.inner.rotation.x = b.pitch;
    this.inner.rotation.z = b.roll;
  }

  /** wing beat speed by state, a lunge on attacks, a sway for hovering skulls */
  private updateMotion(dt: number, a: AnimInput) {
    const attacking = a.state === 'attack' || a.state === 'cast';
    const moving = a.state === 'move' || a.state === 'charge';
    const rate = attacking ? 18 : moving ? 11 : 8;
    this.moveU.uMoveT.value += dt * rate;
    const k = attacking ? Math.sin(Math.min(1, a.stateTime / Math.max(0.1, a.stateDur)) * Math.PI) : 0;
    this.inner.position.z = -this.baseCenterZ + k * 0.35;
    this.inner.rotation.x = k * 0.35;
    if (this.spec.motion === 'hover') this.inner.rotation.z = Math.sin(this.time * 1.7) * 0.12;
    if (this.spec.motion === 'flap' && this.spec.float) this.inner.position.y += Math.sin(this.moveU.uMoveT.value) * 0.06;
  }

  private updateDeath(dt: number, a: AnimInput) {
    const t = a.deathTime;
    if (!this.wasDead) {
      this.wasDead = true;
      this.reviving = 0;
      const clip = this.pick(this.spec.clips.death, true);
      this.play(clip, false, a.blood === 'ghost' ? 1.6 : 1.25, 0.08);
      if (a.killedBy === 'cold') {
        for (const mi of this.mats) {
          mi.mat.color.lerp(new THREE.Color('#9ad8ff'), 0.65);
          mi.mat.emissive.set('#103048');
        }
      }
    }
    if (a.killedBy === 'cold') for (const mi of this.mats) mi.mat.emissive.set('#103048');
    if (a.killedBy === 'fire') for (const mi of this.mats) mi.mat.color.lerp(new THREE.Color('#120806'), Math.min(1, dt * 2));
    if (this.spec.float) this.inner.position.y = Math.max(-0.1, this.inner.position.y - dt * 2);
    if (this.spec.motion) {
      // no death clip: stop, and keel over
      this.moveU.uMoveK.value = Math.max(0, this.moveU.uMoveK.value - dt * 3);
      this.inner.rotation.z += (1.3 - this.inner.rotation.z) * Math.min(1, dt * 5);
    }
    // ghosts dissolve right away; everything else lies there for a while, then sinks
    const fadeStart = a.blood === 'ghost' ? 0.6 : 34;
    const fadeLen = a.blood === 'ghost' ? 1.2 : 5;
    if (t > fadeStart) {
      if (a.blood !== 'ghost') this.root.position.y = -(t - fadeStart) * 0.12;
      if (!this.faded) {
        this.faded = true;
        for (const mi of this.mats) mi.mat.transparent = true;
      }
      const k = Math.max(0, 1 - (t - fadeStart) / fadeLen);
      for (const mi of this.mats) mi.mat.opacity = mi.opacity * k;
    }
  }

  /**
   * Back as it was made, for another actor with the same spec (the renderer keeps rigs of monsters
   * gone from view for the next that comes): standing idle, its colours its own, nothing fading
   */
  reset() {
    this.mixer.stopAllAction();
    this.cur = this.curClip = null;
    this.lastState = null;
    this.lastStateTime = 0;
    this.wasDead = this.faded = false;
    this.reviving = 0;
    this.time = Math.random() * 10;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.visible = true;
    this.inner.position.copy(this.basePos);
    this.inner.rotation.set(0, 0, 0);
    this.moveU.uMoveK.value = 1;
    for (const mi of this.mats) {
      mi.mat.color.copy(mi.color);
      mi.mat.emissive.copy(mi.emissive);
      mi.mat.opacity = mi.opacity;
      mi.mat.transparent = mi.transparent;
    }
    this.play(this.pick(this.spec.clips.idle), true, 1, 0);
    this.mixer.setTime(Math.random() * 2);
    this.updateHeld(1, false);
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const mi of this.mats) mi.mat.dispose();
    // the skeletons are the clone's own, each with a texture of its bones on the GPU
    this.body.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose());
    this.root.removeFromParent();
  }
}
