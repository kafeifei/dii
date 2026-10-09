import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorState } from '../game/actor';
import { assets, type ModelKey } from './assets';
import type { AnimInput } from './rig';

/** something carried in a hand slot: another model file, or a procedural mesh built in body units */
export interface Attachment {
  model: ModelKey | (() => THREE.Object3D);
  hand: 'r' | 'l';
  scale?: number;
  glow?: string | null;
  /**
   * Long hafts (staves) held loosely upright, built along +Y from the foot: the grip follows the
   * palm but the haft only tilts with the wrist while attacking — welded to a rolling wrist, a
   * staff taller than its bearer swings wildly. The value is the grip height along the haft.
   */
  upright?: number;
  /**
   * For rigs without weapon slots (Meshy): the object is held at the hand, its +Y aimed along
   * `dir` (actor space, +Z forward) in the idle pose, and carried rigidly by the wrist from
   * there — so it doesn't matter how the hand bone's axes happen to point.
   * `grip` is the hand's position in the object's own frame, `slide` moves the hold point along
   * the forearm (+ toward the fingers, − toward the elbow; shields sit on the forearm).
   */
  aim?: { dir: [number, number, number]; grip?: [number, number, number]; slide?: number };
}

/** an object held in the actor's frame and placed from the hand bone every frame */
interface Held {
  obj: THREE.Object3D;
  bone: THREE.Object3D;
  /** hand position in the object's frame */
  grip: THREE.Vector3;
  slide: number;
  /** orientation in the idle pose (actor space) */
  rest: THREE.Quaternion;
  /** wrist rotation that maps to `rest` in the idle pose */
  offset: THREE.Quaternion;
  /** upright hafts drift toward the wrist only while attacking; aimed ones always follow it */
  loose: boolean;
  /** 0 = rest orientation, 1 = follows the wrist */
  follow: number;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

export interface MoveClip {
  clip: string;
  /** world speed (units/s) at which the clip plays at 1× */
  ref: number;
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
   * along x, 'crawl' lifts legs splayed around the body in turn, 'hover' only bobs and sways
   */
  motion?: 'flap' | 'crawl' | 'hover';
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
}

/**
 * Vertex motion for one-piece creatures (see ModelSpec.motion), in the mesh's own space:
 * 'flap' lifts everything beyond the body along x on a sine (wings), 'crawl' raises the outer
 * part of each leg in a wave running round the body.
 */
function addMotion(mat: THREE.Material, kind: 'flap' | 'crawl', u: Record<string, THREE.IUniform>) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    const move =
      kind === 'flap'
        ? `float span = (uBoxMax.x - uBoxMin.x) * 0.5;
          float side = transformed.x - (uBoxMax.x + uBoxMin.x) * 0.5;
          float w = clamp((abs(side) - span * 0.2) / (span * 0.8), 0.0, 1.0);
          transformed.y += sin(uMoveT) * w * w * span * 0.6 * uMoveK;
          transformed.x -= sign(side) * (1.0 - cos(sin(uMoveT) * w)) * span * 0.25 * uMoveK;`
        : `vec2 c = (uBoxMax.xz + uBoxMin.xz) * 0.5;
          vec2 d = transformed.xz - c;
          float reach = max(uBoxMax.x - uBoxMin.x, uBoxMax.z - uBoxMin.z) * 0.5;
          float w = clamp((length(d) - reach * 0.3) / (reach * 0.7), 0.0, 1.0);
          float a = atan(d.y, d.x);
          float lift = max(0.0, sin(uMoveT + a * 4.0));
          transformed.y += lift * w * (uBoxMax.y - uBoxMin.y) * 0.35 * uMoveK;`;
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
  private time = Math.random() * 10;
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
    this.baseCenterZ = tpl.center.z * s;
    this.inner.add(this.body);
    this.root.add(this.inner);

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
      if (a.upright !== undefined || a.aim) {
        // lives in the actor's frame (world units), placed every frame in updateHeld
        if (typeof a.model === 'function') obj = a.model();
        else {
          const t = assets.get(a.model);
          if (!t) continue;
          obj = t.gltf.scene.clone(true);
        }
        if (a.scale) obj.scale.multiplyScalar(a.scale);
        const rest = new THREE.Quaternion();
        if (a.aim) rest.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...a.aim.dir).normalize());
        const grip = a.aim ? new THREE.Vector3(...(a.aim.grip ?? [0, 0, 0])).multiplyScalar(a.scale ?? 1) : new THREE.Vector3(0, a.upright, 0);
        this.root.add(obj);
        this.held.push({ obj, bone, grip, slide: a.aim?.slide ?? 0.07, rest, offset: new THREE.Quaternion(), loose: !a.aim, follow: a.aim ? 1 : 0.2 });
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
        this.mats.push({ mat, emissive: mat.emissive.clone(), color: mat.color.clone(), opacity: mat.opacity });
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
      this.mixer.setTime(0);
      this.root.updateMatrixWorld(true);
      const rootQ = this.root.getWorldQuaternion(_q1);
      for (const h of this.held) h.offset.copy(h.bone.getWorldQuaternion(_q2).invert().multiply(rootQ).multiply(h.rest));
    }
    this.mixer.setTime(Math.random() * 2);
    this.updateHeld(1, false);
  }

  private updateHeld(dt: number, attacking: boolean) {
    if (!this.held.length) return;
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.getWorldQuaternion(_q1).invert();
    for (const h of this.held) {
      if (h.loose) h.follow += ((attacking ? 1 : 0.2) - h.follow) * (1 - Math.exp(-10 * dt));
      // hold point: along the forearm → hand line, past the wrist for the palm (the rig has no
      // finger bones), behind it for something strapped to the forearm
      const at = h.bone.getWorldPosition(_v1);
      const fore = h.bone.parent!.getWorldPosition(_v2);
      at.addScaledVector(fore.sub(at).normalize(), -h.slide);
      this.root.worldToLocal(at);
      const wrist = _q2.copy(rootInv).multiply(h.bone.getWorldQuaternion(_q3)).multiply(h.offset);
      h.obj.quaternion.copy(h.rest).slerp(wrist, h.follow);
      h.obj.position.copy(at).sub(_v2.copy(h.grip).applyQuaternion(h.obj.quaternion));
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

  private pickMove(speed: number, moves: MoveClip[]): { clip: THREE.AnimationClip; ts: number } | null {
    let best: { clip: THREE.AnimationClip; ts: number } | null = null;
    let bestD = Infinity;
    for (const mv of moves) {
      const clip = this.clips.get(mv.clip);
      if (!clip) continue;
      const d = Math.abs(Math.log(Math.max(0.1, speed) / mv.ref));
      if (d < bestD) {
        bestD = d;
        best = { clip, ts: Math.min(2.2, Math.max(0.55, speed / mv.ref)) };
      }
    }
    return best;
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
      this.mixer.update(dt);
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
      this.mixer.update(dt);
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
          const clip = this.pick(a.state === 'cast' ? (c.cast ?? c.attack) : c.attack, true);
          if (clip) this.play(clip, false, clip.duration / dur, 0.06);
        }
        break;
      }
      case 'hit':
      case 'block': {
        if (restarted) {
          const clip = this.pick(a.state === 'block' ? (c.block ?? c.hit) : c.hit, true);
          if (clip) this.play(clip, false, Math.max(1, clip.duration / Math.max(0.25, dur)), 0.05);
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
    this.mixer.update(dt);
    this.updateHeld(dt, a.state === 'attack');
  }

  /** wing beats / leg cycle speed by state, a lunge on attacks, a sway for hovering skulls */
  private updateMotion(dt: number, a: AnimInput) {
    const attacking = a.state === 'attack' || a.state === 'cast';
    const moving = a.state === 'move' || a.state === 'charge';
    const rate = this.spec.motion === 'crawl' ? (attacking ? 14 : moving ? 4 + a.speed * 3 : 1.5) : attacking ? 18 : moving ? 11 : 8;
    this.moveU.uMoveT.value += dt * rate;
    const k = attacking ? Math.sin(Math.min(1, a.stateTime / Math.max(0.1, a.stateDur)) * Math.PI) : 0;
    this.inner.position.z = -this.baseCenterZ + k * 0.35;
    this.inner.rotation.x = k * (this.spec.motion === 'crawl' ? -0.25 : 0.35);
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

  dispose() {
    this.mixer.stopAllAction();
    for (const mi of this.mats) mi.mat.dispose();
    this.root.removeFromParent();
  }
}
