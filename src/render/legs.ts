import * as THREE from 'three';
import type { AnimInput } from './rig';

/**
 * Code-driven leg poses for Tripo's many-legged rigs (tools/tripo-merge.mjs), layered on top of
 * the clip. Tripo's octopod walk only really steps the back legs and it has no bite or death, so:
 * - walking: the front two pairs step too, on the clip's own cycle, in alternating diagonals
 * - attack: rear up with the front legs raised and the fangs open, then slam down at the half-way
 *   point, where the sim lands the bite
 * - hit: a flinch; death: the legs curl in under the body as it sinks
 *
 * Legs are bones `<pair>_<Left|Right>_Limb_<segment>`, pair 0 at the back; pedipalps and fangs are
 * `Palp_<side>_<n>` / `Fang_<side>_<n>`. Each joint bends about a hinge across its leg ('lift',
 * positive raises the leg) and swings about the vertical ('swing', positive moves it forward). Both
 * axes are worked out from the rest pose, in the parent bone's space, so they ride along with the clip.
 */

interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  lift: THREE.Vector3;
  swing: THREE.Vector3;
}

interface Chain {
  /** leg pair (0 = back), or -1 for pedipalps and fangs */
  pair: number;
  left: boolean;
  kind: 'leg' | 'palp' | 'fang';
  joints: Joint[];
}

/** where the body goes while the legs do their thing, in the actor's frame (world units) */
export interface BodyOffset {
  lunge: number;
  rise: number;
  /** sideways, to the actor's left */
  side: number;
  pitch: number;
  roll: number;
}

/** a rig posed in code after the mixer has run (models.ts ModelRig.advance) */
export interface PosedRig {
  readonly body: BodyOffset;
  /** before the mixer runs */
  reset(): void;
  /** after the mixer; `phase` is how far through its walk cycle the clip is (null when it isn't walking) */
  pose(dt: number, a: AnimInput, phase: number | null): void;
}

/** in a step, which half of the cycle each front leg lifts in: diagonals alternate */
const STEP_PHASE: Record<string, number> = { '3L': 0.5, '3R': 0, '2L': 0, '2R': 0.5 };
/**
 * death curl per leg joint, hip outward (positive lifts, negative folds in under the body): the
 * thigh goes up near vertical, the knee folds hard so the shin points down and in, and the foot
 * tucks under
 */
const CURL = [0.5, -1.8, -0.5, -0.55, -0.3];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class LegRig implements PosedRig {
  private chains: Chain[] = [];
  private stepK = 0;
  private time = Math.random() * 10;
  readonly body: BodyOffset = { lunge: 0, rise: 0, side: 0, pitch: 0, roll: 0 };

  /** null when the model has no such bones */
  static find(body: THREE.Object3D): LegRig | null {
    const rig = new LegRig(body);
    return rig.chains.some((c) => c.kind === 'leg') ? rig : null;
  }

  private constructor(body: THREE.Object3D) {
    // body space: +Z forward, +Y up, in the rest pose as loaded
    body.updateMatrixWorld(true);
    const bodyInv = body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const toBody = (o: THREE.Object3D) => body.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const groups = new Map<string, Chain & { seg: Map<number, THREE.Bone> }>();
    body.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      const m = /^(?:(\d)_(Left|Right)_Limb|(Palp|Fang)_(Left|Right))_(\d)$/.exec(o.name);
      if (!m) return;
      const left = (m[2] ?? m[4]) === 'Left';
      const kind = m[3] ? (m[3].toLowerCase() as 'palp' | 'fang') : 'leg';
      const key = `${kind}${m[1] ?? ''}${left ? 'L' : 'R'}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { pair: m[1] ? +m[1] : -1, left, kind, joints: [], seg: new Map() }));
      g.seg.set(+m[5], o as THREE.Bone);
    });
    const up = new THREE.Vector3(0, 1, 0);
    for (const g of groups.values()) {
      const bones = [...g.seg.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      // the leg's outward direction on the ground, hip to tip
      const out = toBody(bones[bones.length - 1]).sub(toBody(bones[0])).setY(0);
      if (out.lengthSq() < 1e-8) out.set(g.left ? 1 : -1, 0, 0);
      out.normalize();
      const liftBody = new THREE.Vector3().crossVectors(out, up).normalize();
      // a turn about +Y carries the tip along up × out: make positive swing go forward (+Z)
      const swingBody = up.clone().multiplyScalar(new THREE.Vector3().crossVectors(up, out).z >= 0 ? 1 : -1);
      for (const bone of bones) {
        const parentInBody = bodyInv.clone().multiply(bone.parent!.getWorldQuaternion(new THREE.Quaternion())).invert();
        g.joints.push({
          bone,
          rest: bone.quaternion.clone(),
          lift: liftBody.clone().applyQuaternion(parentInBody),
          swing: swingBody.clone().applyQuaternion(parentInBody),
        });
      }
      this.chains.push(g);
    }
  }

  /** before the mixer runs: bones the clip doesn't drive would otherwise keep last frame's bend */
  reset() {
    for (const c of this.chains) for (const j of c.joints) j.bone.quaternion.copy(j.rest);
  }

  /**
   * after the mixer: bend on top of the clip. `phase` is how far through its walk cycle the clip
   * is (null when it isn't walking).
   */
  pose(dt: number, a: AnimInput, phase: number | null) {
    this.time += dt;
    const b = this.body;
    b.lunge = b.rise = b.pitch = b.roll = 0;
    this.stepK += ((phase !== null && !a.dead ? 1 : 0) - this.stepK) * (1 - Math.exp(-8 * dt));

    if (a.dead) {
      const d = smooth(0, 0.7, a.deathTime);
      // a last twitch while the legs draw in
      const tw = Math.sin(a.deathTime * 38) * 0.18 * (1 - smooth(0.2, 0.9, a.deathTime));
      for (const c of this.chains) {
        c.joints.forEach((j, i) => this.bend(j, (CURL[i] ?? -0.6) * d * (c.kind === 'leg' ? 1 : 0.6) + (i === 1 ? tw : 0), 0));
      }
      b.rise = -0.22 * d;
      b.roll = 0.18 * d;
      return;
    }

    const p = a.state === 'attack' || a.state === 'cast' ? Math.min(1, a.stateTime / Math.max(0.1, a.stateDur)) : -1;
    // rear up until just before the half-way point, then strike and recover
    const wind = p < 0 ? 0 : smooth(0, 0.42, p) * (1 - smooth(0.42, 0.52, p));
    const strike = p < 0 ? 0 : smooth(0.42, 0.52, p) * (1 - smooth(0.6, 0.95, p));
    const flinch = a.state === 'hit' || a.state === 'block' ? Math.sin(Math.PI * Math.min(1, a.stateTime / Math.max(0.15, a.stateDur))) : 0;
    const idle = phase === null && p < 0 && !flinch ? 1 : 0;

    for (const c of this.chains) {
      const side = c.left ? 1 : -1;
      if (c.kind === 'palp') {
        // feeling about while idle, pulled in for the bite
        const feel = idle * 0.18 * Math.sin(this.time * 2.3 + side * 1.7);
        c.joints.forEach((j, i) => this.bend(j, (i === 0 ? 0.6 * wind + feel : -0.4 * wind) - 0.3 * strike, 0));
        continue;
      }
      if (c.kind === 'fang') {
        // open wide, then stab shut
        c.joints.forEach((j, i) => this.bend(j, i === 0 ? 0.7 * wind - 0.35 * strike : 0.2 * wind, 0));
        continue;
      }
      let lift0 = 0.25 * flinch;
      let swing0 = 0;
      if (c.pair >= 2 && this.stepK > 0.01 && phase !== null) {
        const u = (phase + STEP_PHASE[`${c.pair}${c.left ? 'L' : 'R'}`]) * Math.PI * 2;
        lift0 += this.stepK * 0.45 * Math.max(0, Math.sin(u));
        swing0 += this.stepK * -0.3 * Math.cos(u);
      }
      if (c.pair === 3) {
        // the front pair does the striking
        lift0 += 1.0 * wind - 0.3 * strike;
        swing0 += 0.35 * wind + 0.2 * strike;
        if (idle) lift0 += 0.12 * Math.max(0, Math.sin(this.time * 1.1 + side)) ** 6;
      } else if (c.pair === 2) lift0 += 0.35 * wind;
      c.joints.forEach((j, i) => {
        if (i === 0) this.bend(j, lift0, swing0);
        else if (c.pair === 3) this.bend(j, i === 1 ? 0.6 * wind : -0.55 * wind + 0.2 * strike, 0);
      });
    }
    b.pitch = -0.35 * wind + 0.12 * strike - 0.1 * flinch;
    b.lunge = -0.12 * wind + 0.4 * strike - 0.12 * flinch;
    b.rise = 0.06 * wind;
  }

  private bend(j: Joint, lift: number, swing: number) {
    if (Math.abs(lift) < 1e-4 && Math.abs(swing) < 1e-4) return;
    _q.setFromAxisAngle(_v.copy(j.lift), lift);
    _qs.setFromAxisAngle(_w.copy(j.swing), swing);
    j.bone.quaternion.premultiply(_q).premultiply(_qs);
  }
}

/** a joint QuadRig turns: its rest rotation and the body's axes in its parent's frame */
interface QJoint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  /** about the body's right-to-left axis, positive lifts the nose (a limb: swings the foot forward) */
  up: THREE.Vector3;
  /** about the vertical, positive turns to the body's left */
  left: THREE.Vector3;
  /** about the forward axis */
  roll: THREE.Vector3;
}

interface QLeg {
  front: boolean;
  left: boolean;
  joints: QJoint[];
}

/**
 * Code-driven poses for Tripo's quadruped rig (the quill rat), over its walk and a still bind pose.
 * Bones: `Spine_<n>` hips to chest, `Head_<n>`, `Tail_<n>`, legs `<pair>_<Left|Right>_Limb_<n>` with
 * pair 0 in front (tools/tripo-merge.mjs names the ones Tripo got wrong). D2's quill rat bites with
 * its first attack and shoots quills with its second (D2MOO AiThink.cpp:1050-1115 AITHINK_Fn014_QuillRat:
 * MONMODE_ATTACK1 in melee, MONMODE_ATTACK2 for the quills), so:
 * - attack: rear back, then lunge in with the head down at the half-way point, where the bite lands
 * - cast: hunch the back up with the head tucked in, then shake the quills loose at half-way
 * - hit: a flinch; death: it rolls over onto its side, legs kicking, then curled and still
 * - idle: sniffing and looking about, tail swaying; the walk is the clip's
 */
export class QuadRig implements PosedRig {
  private spine: QJoint[] = [];
  private head: QJoint[] = [];
  private tail: QJoint[] = [];
  private legs: QLeg[] = [];
  private time = Math.random() * 10;
  /** which way it rolls over when it dies */
  private rollTo = Math.random() < 0.5 ? 1 : -1;
  readonly body: BodyOffset = { lunge: 0, rise: 0, side: 0, pitch: 0, roll: 0 };

  /** `size` is the body's bind-pose bounds in world units; null when the model has no such bones */
  static find(body: THREE.Object3D, size: THREE.Vector3): QuadRig | null {
    const rig = new QuadRig(body, size);
    return rig.legs.length === 4 && rig.spine.length ? rig : null;
  }

  private constructor(body: THREE.Object3D, private size: THREE.Vector3) {
    // body space: +Z forward, +Y up, +X to the left, in the rest pose as loaded
    body.updateMatrixWorld(true);
    const bodyInv = body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const joint = (bone: THREE.Bone): QJoint => {
      const parentInBody = bodyInv.clone().multiply(bone.parent!.getWorldQuaternion(new THREE.Quaternion())).invert();
      return {
        bone,
        rest: bone.quaternion.clone(),
        up: new THREE.Vector3(-1, 0, 0).applyQuaternion(parentInBody),
        left: new THREE.Vector3(0, 1, 0).applyQuaternion(parentInBody),
        roll: new THREE.Vector3(0, 0, 1).applyQuaternion(parentInBody),
      };
    };
    const legs = new Map<string, { front: boolean; left: boolean; seg: Map<number, THREE.Bone> }>();
    const named = { Spine: new Map<number, THREE.Bone>(), Head: new Map<number, THREE.Bone>(), Tail: new Map<number, THREE.Bone>() };
    body.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      const leg = /^(\d)_(Left|Right)_Limb_(\d)$/.exec(o.name);
      if (leg) {
        const key = leg[1] + leg[2];
        if (!legs.has(key)) legs.set(key, { front: leg[1] === '0', left: leg[2] === 'Left', seg: new Map() });
        legs.get(key)!.seg.set(+leg[3], o as THREE.Bone);
        return;
      }
      const m = /^(Spine|Head|Tail)_(\d)$/.exec(o.name);
      if (m) named[m[1] as keyof typeof named].set(+m[2], o as THREE.Bone);
    });
    const chain = (seg: Map<number, THREE.Bone>) => [...seg.entries()].sort((a, b) => a[0] - b[0]).map((e) => joint(e[1]));
    for (const l of legs.values()) this.legs.push({ front: l.front, left: l.left, joints: chain(l.seg) });
    // Spine_0 is the hips the hind legs hang from: bending starts above it
    this.spine = chain(named.Spine).slice(1);
    this.head = chain(named.Head);
    this.tail = chain(named.Tail);
  }

  reset() {
    for (const j of this.all()) j.bone.quaternion.copy(j.rest);
  }

  private *all(): Generator<QJoint> {
    yield* this.spine;
    yield* this.head;
    yield* this.tail;
    for (const l of this.legs) yield* l.joints;
  }

  pose(dt: number, a: AnimInput, phase: number | null) {
    this.time += dt;
    const t = this.time;
    const b = this.body;
    b.lunge = b.rise = b.side = b.pitch = b.roll = 0;
    if (a.dead) {
      this.die(a.deathTime);
      return;
    }
    const p = Math.min(1, a.stateTime / Math.max(0.1, a.stateDur));
    const bite = a.state === 'attack' ? p : -1;
    const quills = a.state === 'cast' ? p : -1;
    const flinch = a.state === 'hit' || a.state === 'block' ? Math.sin(Math.PI * Math.min(1, a.stateTime / Math.max(0.15, a.stateDur))) : 0;
    const idle = phase === null && bite < 0 && quills < 0 && !flinch ? 1 : 0;

    // the bite: rear back until just before half-way, then lunge in head down and recover
    const wind = bite < 0 ? 0 : smooth(0, 0.4, bite) * (1 - smooth(0.4, 0.5, bite));
    const strike = bite < 0 ? 0 : smooth(0.4, 0.5, bite) * (1 - smooth(0.62, 0.95, bite));
    // the quills: hunch over, shake them loose around half-way, settle
    const hunch = quills < 0 ? 0 : smooth(0, 0.38, quills) * (1 - smooth(0.72, 1, quills));
    const shake = quills < 0 ? 0 : smooth(0.4, 0.47, quills) * (1 - smooth(0.6, 0.8, quills)) * Math.sin(a.stateTime * 60);

    const look = idle * 0.3 * Math.sin(t * 0.45 + this.rollTo);
    const sniff = idle * 0.06 * Math.sin(t * 15) * Math.max(0, Math.sin(t * 0.9)) ** 4;
    const bob = phase === null ? 0 : 0.05 * Math.sin(phase * Math.PI * 4);
    this.head.forEach((j, i) => {
      const up = i === 0 ? 0.35 * wind - 0.5 * strike - 0.45 * hunch + 0.3 * flinch + bob : 0.2 * wind - 0.3 * strike - 0.2 * hunch + sniff;
      this.bend(j, up, i === 0 ? look : 0, 0);
    });
    const breath = idle * 0.025 * Math.sin(t * 2.2);
    this.spine.forEach((j, i) => {
      // arched: the back rises from the hips and the chest bows back down to the shoulders
      const arch = i === 0 ? 0.5 : i === this.spine.length - 1 ? -0.4 : 0.05;
      this.bend(j, arch * hunch + 0.08 * wind - 0.1 * strike + 0.1 * flinch + breath, 0, (i % 2 ? -0.16 : 0.16) * shake);
    });
    const sway = phase === null ? 0.12 * Math.sin(t * 1.1) * idle : 0.2 * Math.sin(phase * Math.PI * 2);
    this.tail.forEach((j) => this.bend(j, 0.15 * hunch - 0.1 * flinch, sway + 0.3 * shake, 0));
    for (const l of this.legs) {
      // front paws reach in with the bite while the hind legs push off; braced through the shake
      const reach = l.front ? 0.3 * strike - 0.1 * wind : -0.3 * strike;
      l.joints.forEach((j, i) => {
        if (i === 0) this.bend(j, reach + (l.front ? -0.12 : 0.1) * hunch, 0, 0);
        else if (i === 1) this.bend(j, (l.front ? -0.3 : 0.2) * strike, 0, 0);
      });
    }
    b.lunge = -0.06 * wind + 0.24 * strike - 0.1 * flinch;
    // positive pitch dips the nose
    b.pitch = -0.1 * wind + 0.16 * strike + 0.12 * hunch - 0.1 * flinch;
    b.rise = 0.02 * wind + 0.02 * hunch;
    b.roll = 0.1 * shake + 0.08 * flinch * this.rollTo + idle * 0.015 * Math.sin(t * 40) * Math.max(0, Math.sin(t * 0.37)) ** 12;
  }

  /** over onto its side, the legs kicking a little, then curled up and still */
  private die(d: number) {
    const b = this.body;
    const r = smooth(0.05, 0.6, d);
    // a little bounce as it lands
    const settle = d > 0.6 ? 0.12 * Math.sin(Math.min(1, (d - 0.6) / 0.35) * Math.PI) : 0;
    const roll = this.rollTo * (1.65 * r - settle);
    const kick = Math.sin(d * 28) * 0.35 * smooth(0.3, 0.5, d) * (1 - smooth(0.6, 1.5, d));
    for (const l of this.legs) {
      const k = l.front ? kick : -kick;
      l.joints.forEach((j, i) => this.bend(j, (i === 0 ? 0.45 : i === 1 ? -0.7 : -0.4) * r + (i === 0 ? k : 0), 0, 0));
    }
    this.head.forEach((j, i) => this.bend(j, i === 0 ? -0.35 * r : -0.2 * r, 0.2 * r * this.rollTo, 0));
    this.tail.forEach((j) => this.bend(j, -0.2 * r, 0.25 * r, 0));
    // rolled about the ground line under its middle: lifted so the lowest corner of its bounds
    // (rounded off a little) stays on the ground, and shifted to keep its middle where it was
    const w = this.size.x * 0.4;
    const h = this.size.y;
    const s = Math.sin(roll);
    const c = Math.cos(roll);
    b.roll = roll;
    b.rise = -Math.min(-w * s, w * s, -w * s + h * c, w * s + h * c) - 0.04 * r;
    b.side = (h / 2) * s;
  }

  private bend(j: QJoint, up: number, left: number, roll: number) {
    if (Math.abs(up) > 1e-4) j.bone.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(j.up), up));
    if (Math.abs(left) > 1e-4) j.bone.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(j.left), left));
    if (Math.abs(roll) > 1e-4) j.bone.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(j.roll), roll));
  }
}
