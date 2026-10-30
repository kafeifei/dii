import type * as THREE from 'three';
import type { Merc } from '../game/merc';
import { assets, HERE } from './assets';
import { mercNeeds } from './needs';
import { makeCharRig, type CharRig } from './objviews';
import type { Renderer } from './renderer';
import type { AnimInput, RigLook } from './rig';
import { mercSpec } from './specs';

// The views of the hero's friends on the map besides the hero: the hireling (src/game/merc.ts,
// Game.merc). The renderer calls these as it builds a level, every frame, and when the tools count
// what stands in for models (Renderer.standInCount); the hero's own view stays the renderer's. Her
// body is merc_rogue (specs.ts mercSpec), streamed with the monsters': until it is in she is drawn as
// a procedural rogue (mercLook), asked for at once, and swapped for her model as it comes, as the
// hero's and the monsters' are.

/** her view: her rig, its shadow, the models it stands in for, and for whom it was made */
interface FriendView {
  merc: Merc;
  rig: CharRig;
  shadow: THREE.Mesh;
  waits: Set<string> | null;
}

const views = new WeakMap<Renderer, FriendView>();

/** the procedural rogue standing in for her model: a bow, red leather, a hood down */
function mercLook(): RigLook {
  return { type: 'humanoid', scale: 0.92, skin: '#d8b090', cloth: '#7a2e24', pants: '#3a2418', head: 'human', hair: '#5a3020', weapon: 'bow', weaponColor: '#6a4a2a', cape: '#4a1a14' };
}

/** her view let go */
function free(v: FriendView) {
  v.rig.dispose();
  v.rig.root.removeFromParent();
  v.shadow.removeFromParent();
}

/** a view for her: her model's rig, or the stand-in with her model asked for at once */
function make(r: Renderer, m: Merc): FriendView {
  const { rig, waits } = makeCharRig(mercSpec, mercLook);
  r.dynGroup.add(rig.root);
  rig.root.position.set(m.pos.x, 0, m.pos.z);
  rig.root.rotation.y = m.facing;
  const shadow = r.makeShadow(m.radius);
  r.dynGroup.add(shadow);
  if (waits) void assets.ensure(mercNeeds(), HERE);
  return { merc: m, rig, shadow, waits };
}

/** a level being built: the friends' views on the last one let go */
export function clearFriends(r: Renderer) {
  const v = views.get(r);
  if (!v) return;
  free(v);
  views.delete(r);
}

/** what her rig plays this frame, from her state, as the renderer's anim() makes a monster's */
function animOf(m: Merc, speed: number): AnimInput {
  return {
    state: m.state,
    stateTime: m.stateTime,
    stateDur: m.stateDur,
    speed,
    dead: m.dead,
    deathTime: m.deathTime,
    hitFlash: m.hitFlash,
    chilled: m.chillTime > 0,
    poisoned: m.poisonTime > 0,
    blood: 'red',
    killedBy: m.killedBy,
    // her shot lasts the frames her AI gives it (mercai.ts SHOT_FRAMES): the clip fits them
    exact: m.state === 'attack' || m.state === 'hit',
  };
}

/** each frame, after the hero's view: a view for each friend on the level that has none, each animated, those gone let go */
export function syncFriends(r: Renderer, dt: number) {
  const m = r.game.merc;
  let v = views.get(r);
  if (v && (v.merc !== m || !m)) {
    free(v);
    views.delete(r);
    v = undefined;
  }
  if (!m) return;
  // her stand-in goes once her model is in, as the monsters' (Renderer.swappable: in, warmed, the frame's swap)
  if (v?.waits && r['swappable'](v.waits, true, true)) {
    free(v);
    v = undefined;
  }
  if (!v) {
    v = make(r, m);
    views.set(r, v);
  }
  const at = r['at'](m);
  v.rig.root.position.x = at.x;
  v.rig.root.position.z = at.z;
  const d = Math.atan2(Math.sin(m.facing - v.rig.root.rotation.y), Math.cos(m.facing - v.rig.root.rotation.y));
  if (!m.dead) v.rig.root.rotation.y += d * Math.min(1, dt * 12);
  const moving = m.state === 'move' ? m.goalSpeed : 0;
  v.rig.update(dt, animOf(m, moving));
  v.shadow.visible = !m.dead;
  v.shadow.position.set(at.x, 0.02, at.z);
}

/** how many of the friends' views stand in for models not in yet */
export function friendStandIns(r: Renderer): number {
  return views.get(r)?.waits ? 1 : 0;
}
