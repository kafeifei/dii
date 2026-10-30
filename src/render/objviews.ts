import * as THREE from 'three';
import { wellCharges } from '../game/containers';
import type { WorldObject } from '../game/objects';
import type { Player } from '../game/player';
import { SHRINE_BY_ID } from '../data/shrines';
import { CAMP_AREA } from '../world/areas';
import { assets } from './assets';
import { playerLook, vendorLook } from './looks';
import { ModelRig, type ModelSpec } from './models';
import { OBJECT_MODELS, specNeeds } from './needs';
import { assetProp, glowSprite, makeBarrel, makeBrazier, makeChest, makePortal, makeStairs, makeWaypoint, MODELS, sharedResource, stdMat } from './props';
import type { Renderer } from './renderer';
import { Rig, type AnimInput, type RigLook } from './rig';
import { KASHYA_BUILD, kashyaSpec, playerSpec, vendorSpec } from './specs';
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
      // its trap fires, once its fire trap has gone off (WorldObject.fires): a glow on the ground under
      // each and flames licking up, the large one's taller (D2's FireLarge and FireSmall)
      let lit = 0;
      const glows: THREE.Sprite[] = [];
      const due: number[] = [];
      const flames = (dt: number, ob: WorldObject) => {
        const fires = ob.fires ?? [];
        for (; lit < fires.length; lit++) {
          const f = fires[lit];
          const glow = glowSprite('#ff6a20', f.large ? 2.2 : 1.5, f.large ? 0.8 : 0.6);
          glow.position.set(f.x - o.pos.x, 0.45, f.z - o.pos.z);
          g.add(glow);
          glows.push(glow);
          due.push(0);
        }
        for (const [i, f] of fires.entries()) {
          const s = f.large ? 1 : 0.7;
          // flames at a steady rate, whatever the frame rate: 50 a second from the large one, 35 from the small
          for (due[i] += dt * (f.large ? 50 : 35); due[i] >= 1; due[i]--) {
            r.fx.add.spawn({ x: f.x + (Math.random() - 0.5) * 0.5 * s, y: 0.2 + Math.random() * 0.2, z: f.z + (Math.random() - 0.5) * 0.5 * s, vy: (1.8 + Math.random() * 2) * s, color: Math.random() < 0.4 ? '#ffc050' : '#ff5010', size: (0.55 + Math.random() * 0.5) * s, life: 0.6, drag: 1, gravity: -1.5, endSize: 0.2 });
          }
          glows[i].material.opacity = (f.large ? 0.72 : 0.52) + Math.random() * 0.12;
        }
      };
      return {
        group: g,
        update: (dt, ob) => {
          flames(dt, ob);
          if (!ob.used) {
            // a spark chest (580's or 397, WorldObject.sparkly) glitters until it's opened, as D2's does (bSparkChest)
            if (ob.sparkly && Math.random() < dt * 9) {
              r.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 0.8, y: 0.25 + Math.random() * 0.6, z: o.pos.z + (Math.random() - 0.5) * 0.8, vy: 0.4, color: Math.random() < 0.5 ? '#fff2b0' : '#ffd060', size: 0.07, life: 0.7 });
            }
            return;
          }
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
      // what its rig misses is noted for the view (makeObjView): it's made again once that's in.
      // Kashya, who hires out (serves 'hire'), is the camp rogue's body, taller, broader and tinted (specs.ts kashyaSpec)
      const kashya = !!o.serves?.includes('hire');
      const { rig } = makeCharRig(kashya ? kashyaSpec : vendorSpec, vendorLook);
      if (kashya) rig.root.scale.set(KASHYA_BUILD.x, 1, KASHYA_BUILD.z);
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
    case 'casket':
      return o.hole ? makeGrave(o, g) : makeCasket(o, g);
    case 'remains':
      return makeRemains(r, o, g);
    case 'well':
      return makeWell(r, o, g);
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

// ── a maze's objects (their models: needs.ts OBJECT_MODELS; drawn in code while one isn't in, or where there is none) ──

/** stdMat's, shared and so never disposed with a view let go (disposeView); the geometries are the view's own */
const mazeMats = () => ({
  stone: stdMat('#6c665c', 0.95),
  lid: stdMat('#5a554c', 0.95),
  dark: stdMat('#141210', 1),
  earth: stdMat('#3e3326', 1),
  cloth: stdMat('#5a3a30', 1),
  rag: stdMat('#3c2c26', 1),
  leather: stdMat('#3a2a20', 0.9),
  bone: stdMat('#c8bca0', 0.9),
  water: stdMat('#203848', 0.2, 0.1),
  fly: stdMat('#101010', 1),
});

/** turned to face the camera, each a little its own way, so a cluster doesn't look stamped */
function siteOf(o: WorldObject, g: THREE.Group): THREE.Group {
  const site = new THREE.Group();
  site.rotation.y = CAM_YAW + ((o.id * 1.618) % 1) * 0.6 - 0.3;
  g.add(site);
  return site;
}

/** a casket: the dungeon pack's coffin, its lid pushed askew and darkened once opened; till it's in, a stone coffin whose lid slides off */
function makeCasket(o: WorldObject, g: THREE.Group): ObjView {
  const site = siteOf(o, g);
  const model = assetProp(OBJECT_MODELS.casket, 0.55);
  if (model) {
    site.add(model);
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      model.rotation.z = 0.06;
      model.position.y = 0.02;
      tintOwn(model, sharedResource, (m) => m.color.multiplyScalar(0.6));
    };
    if (o.used) open();
    return { group: g, update: (_dt, ob) => void (ob.used && open()) };
  }
  const m = mazeMats();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 1.1), m.stone);
  box.position.y = 0.19;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 1.15), m.lid);
  lid.position.y = 0.42;
  site.add(box, lid);
  const open = () => {
    lid.position.set(0.32, 0.3, 0.1);
    lid.rotation.z = -0.35;
  };
  if (o.used) open();
  return { group: g, update: (_dt, ob) => void (ob.used && open()) };
}

/** the grave among a crypt's caskets (Objects.txt 28): the graveyard pack's grave, its broken one once dug open; till they're in, a mound and the pit it leaves */
function makeGrave(o: WorldObject, g: THREE.Group): ObjView {
  const site = siteOf(o, g);
  const whole = assetProp(OBJECT_MODELS.grave, 0.5);
  const broken = assetProp(OBJECT_MODELS.graveOpened, 0.5);
  const m = mazeMats();
  const mound = whole ?? new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.8, 0.35, 1.2), m.earth);
  const pit = broken ?? new THREE.Mesh(new THREE.CircleGeometry(0.45, 14).rotateX(-Math.PI / 2).scale(0.8, 1, 1.2), m.dark);
  if (!broken) pit.position.y = 0.02;
  site.add(mound, pit);
  const show = (dug: boolean) => {
    mound.visible = !dug;
    pit.visible = dug;
  };
  show(o.used);
  return { group: g, update: (_dt, ob) => show(ob.used) };
}

/** a rogue's corpse (Objects.txt 54–56): a body under a cloak, her bow and quiver by her, flies over 29 % of them; no model has one, so in code */
function makeRemains(r: Renderer, o: WorldObject, g: THREE.Group): ObjView {
  const site = siteOf(o, g);
  // lying across the view, not end on to it
  site.rotation.y += Math.PI / 2;
  const m = mazeMats();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 8).rotateX(Math.PI / 2), m.cloth);
  body.position.set(0, 0.15, 0.05);
  const legs = [-0.08, 0.08].map((x) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 3, 6).rotateX(Math.PI / 2), m.leather);
    leg.position.set(x * 1.4, 0.08, -0.45);
    leg.rotation.y = x * 1.5;
    return leg;
  });
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), m.cloth);
  hood.position.set(0, 0.14, 0.45);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), m.bone);
  skull.position.set(0.03, 0.12, 0.55);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.36, 3, 6).rotateZ(Math.PI / 2), m.cloth);
  arm.position.set(0.3, 0.07, 0.22);
  arm.rotation.y = -0.5;
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.025, 4, 14, Math.PI * 0.75).rotateX(Math.PI / 2), m.leather);
  bow.position.set(0.18, 0.04, -0.05);
  bow.rotation.y = 2.2;
  const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 6).rotateZ(Math.PI / 2), m.leather);
  quiver.position.set(-0.3, 0.07, 0.15);
  quiver.rotation.y = 0.6;
  site.add(body, ...legs, hood, skull, arm, bow, quiver);
  // searched, her cloak turned back
  const searched = (used: boolean) => void (body.material = hood.material = arm.material = used ? m.rag : m.cloth);
  searched(o.used);
  if (!o.flies) return { group: g, update: (_dt, ob) => searched(ob.used) };
  const flies = Array.from({ length: 5 }, () => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), m.fly);
    site.add(f);
    return f;
  });
  return {
    group: g,
    update: (_dt, ob) => {
      searched(ob.used);
      flies.forEach((f, i) => {
        const t = r.time * (2.1 + i * 0.37) + i * 1.9;
        f.position.set(Math.sin(t) * 0.35, 0.35 + Math.sin(t * 1.7) * 0.12, Math.cos(t * 1.3) * 0.45);
      });
    },
  };
}

/**
 * A cave's well (Objects.txt 138): the camp's well, smaller; till it's in, a stone ring round dark
 * water. A cool glint over it while it has a drink left (containers.ts wellCharges), none while it's
 * dry: a cave is lit only by the hero, and the glint says which wells are worth the walk
 */
function makeWell(r: Renderer, o: WorldObject, g: THREE.Group): ObjView {
  const site = siteOf(o, g);
  const model = assetProp(OBJECT_MODELS.well, 1.9);
  let water: THREE.Mesh | null = null;
  if (model) site.add(model);
  else {
    const m = mazeMats();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.55, 16, 1, true), m.stone);
    ring.position.y = 0.27;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.07, 6, 16).rotateX(Math.PI / 2), m.stone);
    rim.position.y = 0.55;
    water = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2), m.water);
    water.position.y = 0.32;
    site.add(ring, rim, water);
  }
  const glint = glowSprite('#7ab8ff', 1.3, 0.5);
  glint.position.y = 0.8;
  g.add(glint);
  const view: ObjView = {
    group: g,
    lightColor: '#6aa8ff',
    lightIntensity: 3,
    update: (dt, ob) => {
      const wet = wellCharges(ob, r.game.time) > 0;
      glint.visible = wet;
      view.lightColor = wet ? '#6aa8ff' : undefined;
      if (water) water.visible = wet;
      (glint.material as THREE.SpriteMaterial).opacity = 0.35 + Math.sin(r.time * 1.9) * 0.1;
      if (wet && Math.random() < dt * 2) r.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 0.6, y: 0.5, z: o.pos.z + (Math.random() - 0.5) * 0.6, vy: 0.3, color: '#a0d8ff', size: 0.06, life: 1 });
    },
  };
  return view;
}
