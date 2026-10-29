import * as THREE from 'three';
import type { WorldObject } from '../game/objects';
import type { Player } from '../game/player';
import { SHRINE_BY_ID } from '../data/shrines';
import { CAMP_AREA } from '../world/areas';
import { assets } from './assets';
import { playerLook, vendorLook } from './looks';
import { ModelRig, type ModelSpec } from './models';
import { specNeeds } from './needs';
import { assetProp, glowSprite, makeBarrel, makeBrazier, makeChest, makePortal, makeStairs, makeWaypoint, MODELS, sharedResource } from './props';
import type { Renderer } from './renderer';
import { Rig, type AnimInput, type RigLook } from './rig';
import { playerSpec, vendorSpec } from './specs';
import { glowTexture } from './textures';
import { CAM_YAW, tintOwn } from './views';

export interface CharRig {
  root: THREE.Group;
  update(dt: number, a: AnimInput): void;
  dispose(): void;
}

/**
 * The CC0 model's rig once its models are in (the body and what it carries), else the procedural rig
 * standing in for it; `waits` are the models it missed (assets.watch), null when it's the model's own
 */
export function makeCharRig(spec: () => ModelSpec, look: () => RigLook): { rig: CharRig; waits: Set<string> | null } {
  const [rig, waits] = assets.watch((): CharRig => {
    const s = spec();
    return assets.all(specNeeds(s)) ? new ModelRig(s) : new Rig(look());
  });
  return { rig, waits };
}

export interface ObjView {
  group: THREE.Group;
  update?: (dt: number, o: WorldObject) => void;
  lightColor?: string;
  lightIntensity?: number;
  /** what else to let go with it (the merchant's rig) */
  free?: () => void;
  /** the models it stands in for until they're in */
  waits?: Set<string> | null;
}

export function makeObjectView(r: Renderer, o: WorldObject): ObjView {
  const g = new THREE.Group();
  g.position.set(o.pos.x, 0, o.pos.z);
  switch (o.kind) {
    case 'chest': {
      const { group, lid } = makeChest();
      group.rotation.y = Math.PI / 4 + Math.PI;
      g.add(group);
      const looted = () => {
        if (group.userData.looted !== false) return;
        group.userData.looted = true;
        tintOwn(group, sharedResource, (m) => m.color.multiplyScalar(0.7));
      };
      // one looted before this view was made (the hero gone and back) is open already, not opening again
      if (o.used) {
        lid.rotation.x = -1.9;
        looted();
      }
      return {
        group: g,
        update: (dt, ob) => {
          if (!ob.used) return;
          lid.rotation.x = Math.max(-1.9, lid.rotation.x - dt * 6);
          looted();
        },
      };
    }
    case 'stash': {
      // the one chest in the camp, the gold-bound kind that opens in the dungeon too, made big and
      // set on a pool of warm light so it is easy to find
      const { group } = makeChest();
      group.rotation.y = Math.PI / 4 + Math.PI;
      group.scale.multiplyScalar(1.8);
      // lit from within, not by the camp's pooled lights, which go to whatever is nearest
      tintOwn(group, sharedResource, (m) => {
        m.color.multiplyScalar(1.5);
        m.emissive = new THREE.Color('#6a4210');
        m.emissiveIntensity = 0.55;
      });
      g.add(group);
      // and a pool of warm light on the ground around it, drawn without lights
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffa040', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      pool.position.y = 0.03;
      g.add(pool);
      return {
        group: g,
        update: () => void ((pool.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(r.time * 1.6) * 0.08),
        lightColor: '#ffb060',
        lightIntensity: 10,
      };
    }
    case 'barrel': {
      const b = makeBarrel();
      g.add(b);
      // one broken before this view was made lies broken, not breaking again
      if (o.used) b.scale.set(1.4, 0.15, 1.4);
      return {
        group: g,
        update: (dt, ob) => {
          if (ob.used) {
            b.scale.y = Math.max(0.15, b.scale.y - dt * 6);
            b.scale.x = b.scale.z = Math.min(1.4, b.scale.x + dt * 2);
          }
        },
      };
    }
    case 'stairs': {
      // the way into the dungeon from under the sky is the big one, with braziers
      const town = !!r.level?.layout.theme.outdoor;
      // the stairway opens toward +z: turn it to face the camera
      const site = new THREE.Group();
      site.rotation.y = CAM_YAW;
      g.add(site);
      site.add(makeStairs(town));
      if (!town) {
        // further down: a dim glow from the stairwell, so the way on shows in a dark room
        const glow = glowSprite('#ff4a18', 2.2, 0.35);
        glow.position.set(0, 0.5, 0.25);
        site.add(glow);
        return { group: g, lightColor: '#ff5a28', lightIntensity: 8 };
      }
      // the way down from the camp: a red glow from the stairwell, rising embers and a brazier on
      // each side of the arch, all drawn without lights so they show from across the camp
      const glow = glowSprite('#ff4a18', 3.2, 0.55);
      glow.position.set(0, 0.6, 0.3);
      site.add(glow);
      const braziers = [-1.65, 1.65].map((x) => {
        const b = makeBrazier();
        b.position.set(x, 0, 1.0);
        site.add(b);
        return b.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), CAM_YAW);
      });
      return {
        group: g,
        update: () => {
          (glow.material as THREE.SpriteMaterial).opacity = 0.45 + Math.sin(r.time * 2.2) * 0.12;
          if (Math.random() < 0.6) {
            r.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 1.2, y: 0.1, z: o.pos.z + (Math.random() - 0.5) * 1.2, vy: 0.9 + Math.random() * 0.8, color: '#ff6a20', size: 0.09, life: 1.6 });
          }
          for (const b of braziers) {
            r.fx.add.spawn({ x: o.pos.x + b.x + (Math.random() - 0.5) * 0.18, y: 1.05, z: o.pos.z + b.z + (Math.random() - 0.5) * 0.18, vy: 1.2, color: Math.random() < 0.5 ? '#ffb040' : '#ff6020', size: 0.16, life: 0.45 });
          }
        },
        lightColor: '#ff6a30',
        lightIntensity: 26,
      };
    }
    case 'waypoint': {
      const { group, rune } = makeWaypoint();
      // bright enough to stay a blue glow over the lit stone once the frame is tone mapped
      (rune.material as THREE.MeshBasicMaterial).color.multiplyScalar(2.2);
      g.add(group);
      return {
        group: g,
        update: (dt) => {
          rune.rotation.z += dt * 0.3;
          (rune.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(r.time * 2) * 0.2;
        },
        lightColor: '#4a90ff',
        lightIntensity: 7,
      };
    }
    case 'portal': {
      // the far end, home to the camp, is blue; the camp's, back out, red
      const color = o.dest === CAMP_AREA ? '#4a8aff' : '#ff4a4a';
      const { group, disc, ring } = makePortal(color);
      g.add(group);
      // it opens as it first shows; a view made again (the hero back through it) finds it open
      group.scale.setScalar(r.viewed.has(o) ? 1 : 0.01);
      return {
        group: g,
        update: (dt) => {
          group.scale.setScalar(Math.min(1, group.scale.x + dt * 3));
          disc.rotation.z += dt * 2;
          ring.rotation.z -= dt;
          (disc.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(r.time * 5) * 0.2;
          if (Math.random() < 0.5) r.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 0.8, y: 0.2 + Math.random() * 1.8, z: o.pos.z + (Math.random() - 0.5) * 0.8, vy: 0.8, color, size: 0.15, life: 0.8 });
        },
        lightColor: color,
        lightIntensity: 22,
      };
    }
    case 'shrine': {
      // the shrine stone, lit by its own colour until it has been touched
      const color = SHRINE_BY_ID[o.shrine ?? '']?.color ?? '#ffffff';
      const model = assetProp(MODELS.shrine, 0.6);
      if (model) {
        model.rotation.y = CAM_YAW;
        g.add(model);
      }
      const glow = glowSprite(color, 1.8, 0.7);
      glow.position.y = 1.2;
      g.add(glow);
      const view: ObjView = {
        group: g,
        lightColor: color,
        lightIntensity: 9,
        update: (dt, ob) => {
          if (ob.used) {
            if (glow.visible) {
              glow.visible = false;
              view.lightColor = undefined;
            }
            return;
          }
          (glow.material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(r.time * 2.4) * 0.15;
          if (Math.random() < dt * 5) {
            r.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 0.7, y: 0.3 + Math.random() * 0.9, z: o.pos.z + (Math.random() - 0.5) * 0.7, vy: 0.6, color, size: 0.1, life: 1.2 });
          }
        },
      };
      return view;
    }
    case 'vendor': {
      // what its rig misses is noted for the view (makeObjView): it's made again once that's in
      const { rig } = makeCharRig(vendorSpec, vendorLook);
      g.add(rig.root);
      const shadow = r.makeShadow(0.5);
      r.dynGroup.add(shadow);
      shadow.position.set(o.pos.x, 0.02, o.pos.z);
      return {
        group: g,
        free: () => {
          rig.dispose();
          shadow.removeFromParent();
        },
        update: (dt) => {
          const p = r.game.player;
          const ang = Math.atan2(p.pos.x - o.pos.x, p.pos.z - o.pos.z);
          rig.root.rotation.y += (ang - rig.root.rotation.y) * Math.min(1, dt * 3);
          rig.update(dt, { state: 'idle', stateTime: 0, stateDur: 0, speed: 0, dead: false, deathTime: 0, hitFlash: 0, chilled: false, poisoned: false, blood: 'red', killedBy: 'phys' });
        },
      };
    }
    case 'obelisk': {
      // the rifts' obelisk in the camp (src/game/rift.ts): a tall stone, a violet glow at its head
      const model = assetProp(MODELS.obelisk, [1.5, 2.6, 1.5]);
      if (model) {
        model.rotation.y = CAM_YAW;
        g.add(model);
      }
      const glow = glowSprite('#b070ff', 1.7, 0.7);
      glow.position.y = 2.7;
      g.add(glow);
      return {
        group: g,
        lightColor: '#a060ff',
        lightIntensity: 10,
        update: (dt) => {
          (glow.material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(r.time * 1.7) * 0.15;
          if (Math.random() < dt * 4) {
            r.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 0.9, y: 0.2 + Math.random() * 2.2, z: o.pos.z + (Math.random() - 0.5) * 0.9, vy: 0.5, color: '#b070ff', size: 0.1, life: 1.4 });
          }
        },
      };
    }
    case 'corpse': {
      // the hero's body as it fell, in the gear left on it (game/corpse.ts)
      const c = o.corpse;
      if (!c) break;
      const body = { cls: c.cls, equipment: c.equipment } as Player;
      const { rig } = makeCharRig(() => playerSpec(body), () => playerLook(body));
      rig.root.rotation.y = (o.id * 2.39996) % (Math.PI * 2);
      g.add(rig.root);
      const lying: AnimInput = { state: 'dead', stateTime: 0, stateDur: 0, speed: 0, dead: true, deathTime: 2, hitFlash: 0, chilled: false, poisoned: false, blood: 'red', killedBy: 'phys' };
      // already down when first seen
      rig.update(5, lying);
      // a view let go past VIEW_FAR (views.ts) takes its rig with it, as the merchant's
      return { group: g, free: () => rig.dispose(), update: (dt) => rig.update(dt, lying) };
    }
  }
  return { group: g };
}
