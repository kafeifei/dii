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
}

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

const HAND_BONES = { r: ['handslotr', 'handslot.r'], l: ['handslotl', 'handslot.l'] };

interface MatInfo {
  mat: THREE.MeshStandardMaterial;
  emissive: THREE.Color;
  color: THREE.Color;
  opacity: number;
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
  private cur: THREE.AnimationAction | null = null;
  private curClip: THREE.AnimationClip | null = null;
  private lastState: ActorState | null = null;
  private lastStateTime = 0;
  private wasDead = false;
  private faded = false;
  private reviving = 0;
  private baseY = 0;
  private time = Math.random() * 10;
  private flash = new THREE.Color();

  constructor(readonly spec: ModelSpec) {
    const tpl = assets.get(spec.model)!;
    this.body = cloneSkinned(tpl.gltf.scene);
    const h = spec.height * BODY_SCALE;
    const s = spec.fitWidth ? h / Math.max(tpl.size.x, tpl.size.z) : h / tpl.size.y;
    this.inner.scale.setScalar(s);
    this.baseY = -tpl.min.y * s + (spec.float ?? 0);
    this.inner.position.set(-tpl.center.x * s, this.baseY, -tpl.center.z * s);
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
      if (typeof a.model === 'function') {
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
    this.mixer.setTime(Math.random() * 2);
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
    this.mixer.update(dt);
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
