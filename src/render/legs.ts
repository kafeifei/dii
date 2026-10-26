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
  pitch: number;
  roll: number;
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

export class LegRig {
  private chains: Chain[] = [];
  private stepK = 0;
  private time = Math.random() * 10;
  readonly body: BodyOffset = { lunge: 0, rise: 0, pitch: 0, roll: 0 };

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
