import * as THREE from 'three';
import type { ActorState } from '../game/actor';
import type { Blood, Elem } from '../data/monsters';

export type WeaponShape =
  | 'sword' | 'greatsword' | 'axe' | 'greataxe' | 'mace' | 'maul' | 'bow' | 'staff' | 'spear' | 'cleaver' | 'claws' | 'none' | 'scythe';
export type ShieldShape = 'buckler' | 'round' | 'kite' | 'tower' | 'gothic' | null;
export type HeadShape = 'human' | 'skull' | 'imp' | 'zombie' | 'demon' | 'hood' | 'ghoul';
export type HelmShape = 'cap' | 'skull' | 'helm' | 'full' | 'great' | 'crown' | null;

export interface RigLook {
  type: 'humanoid' | 'spider';
  scale: number;
  skin: string;
  cloth: string;
  pants?: string;
  armor?: string | null;
  metal?: number;
  head: HeadShape;
  helm?: HelmShape;
  helmColor?: string;
  weapon: WeaponShape;
  weaponColor?: string;
  weaponGlow?: string | null;
  shield?: ShieldShape;
  shieldColor?: string;
  shieldTrim?: string;
  hunch?: number;
  limb?: number;
  bulk?: number;
  horns?: boolean;
  eyes?: string | null;
  cape?: string | null;
  /** tabard over the chest: [cloth, emblem] */
  tabard?: [string, string] | null;
  hair?: string;
  robe?: string | null;
  floating?: boolean;
  ghost?: boolean;
  emissive?: string | null;
  tint?: string | null;
}

export interface AnimInput {
  state: ActorState;
  stateTime: number;
  stateDur: number;
  speed: number;
  dead: boolean;
  deathTime: number;
  hitFlash: number;
  chilled: boolean;
  poisoned: boolean;
  blood: Blood;
  killedBy: Elem;
  bow?: boolean;
  /** the state lasts D2's frames (the hero's): one-shot clips play over exactly stateDur, however short or long */
  exact?: boolean;
}

// ── shared geometry cache ──
const geoCache = new Map<string, THREE.BufferGeometry>();
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `b${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}
function sphere(r: number, detail = 1): THREE.BufferGeometry {
  const k = `s${r.toFixed(3)},${detail}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.IcosahedronGeometry(r, detail);
    geoCache.set(k, g);
  }
  return g;
}
function cyl(rt: number, rb: number, h: number, seg = 6): THREE.BufferGeometry {
  const k = `c${rt.toFixed(3)},${rb.toFixed(3)},${h.toFixed(3)},${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geoCache.set(k, g);
  }
  return g;
}
function cone(r: number, h: number, seg = 5): THREE.BufferGeometry {
  const k = `n${r.toFixed(3)},${h.toFixed(3)},${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.ConeGeometry(r, h, seg);
    geoCache.set(k, g);
  }
  return g;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Debris {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
}

export class Rig {
  root = new THREE.Group();
  pose = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  neck = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  elbowL = new THREE.Group();
  elbowR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  kneeL = new THREE.Group();
  kneeR = new THREE.Group();
  holdR = new THREE.Group();
  holdL = new THREE.Group();
  spiderLegs: THREE.Group[] = [];
  mats: THREE.MeshStandardMaterial[] = [];
  private baseEmissive = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private walkPhase = Math.random() * 10;
  private walkAmp = 0;
  private time = Math.random() * 10;
  private lastStateTime = 0;
  private lastState: ActorState = 'idle';
  private variant = 0;
  private shattered = false;
  private debris: Debris[] = [];
  private hipY = 0.85;
  private faded = false;
  look: RigLook;

  constructor(look: RigLook) {
    this.look = look;
    this.root.add(this.pose);
    if (look.type === 'spider') this.buildSpider();
    else this.buildHumanoid();
    this.pose.scale.setScalar(look.scale);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
  }

  mat(color: string, opts: { metal?: number; rough?: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0,
      flatShading: true,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    if (this.look.tint) m.color.lerp(new THREE.Color(this.look.tint), 0.35);
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    } else if (this.look.emissive) {
      m.emissive = new THREE.Color(this.look.emissive);
      m.emissiveIntensity = 0.25;
    }
    this.baseEmissive.set(m, m.emissive.clone().multiplyScalar(m.emissiveIntensity));
    m.emissiveIntensity = 1;
    m.emissive.copy(this.baseEmissive.get(m)!);
    this.mats.push(m);
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    (parent ?? this.torso).add(m);
    return m;
  }

  // ─────────────────────────── humanoid ───────────────────────────
  private buildHumanoid() {
    const L = this.look;
    const limb = L.limb ?? 1;
    const bulk = L.bulk ?? 1;
    const ghost = !!L.ghost;
    const skin = this.mat(L.skin, ghost ? { transparent: true, opacity: 0.75, emissive: L.skin, emissiveIntensity: 0.5 } : {});
    const cloth = this.mat(L.cloth, ghost ? { transparent: true, opacity: 0.7, emissive: L.cloth, emissiveIntensity: 0.4 } : {});
    const pants = L.pants ? this.mat(L.pants) : cloth;
    const armor = L.armor ? this.mat(L.armor, { metal: L.metal ?? 0.5, rough: 0.45 }) : null;
    const dark = this.mat('#1a1410');

    this.pose.add(this.hips);
    this.hipY = 0.85;
    this.hips.position.y = this.hipY;
    if (L.floating) {
      this.hipY = 1.0;
      this.hips.position.y = this.hipY;
    }

    // legs or robe
    if (L.robe) {
      const robe = this.mat(L.robe, ghost ? { transparent: true, opacity: 0.7, emissive: L.robe, emissiveIntensity: 0.45 } : {});
      const skirt = this.mesh(cyl(0.2 * bulk, 0.42 * bulk, 0.95, 7), robe, 0, -0.45, 0, this.hips);
      skirt.name = 'skirt';
      if (L.floating) {
        const tail = this.mesh(cone(0.38 * bulk, 0.5, 7), robe, 0, -1.15, 0, this.hips);
        tail.rotation.x = Math.PI;
      }
    } else {
      for (const side of [1, -1]) {
        const leg = side === 1 ? this.legL : this.legR;
        const knee = side === 1 ? this.kneeL : this.kneeR;
        leg.position.set(0.12 * bulk * side, 0, 0);
        this.hips.add(leg);
        this.mesh(box(0.17 * limb, 0.46, 0.2 * limb), pants, 0, -0.23, 0, leg);
        knee.position.set(0, -0.45, 0);
        leg.add(knee);
        this.mesh(box(0.15 * limb, 0.36, 0.17 * limb), pants, 0, -0.18, 0, knee);
        this.mesh(box(0.18 * Math.max(limb, 0.8), 0.12, 0.28), armor ?? dark, 0, -0.36, 0.04, knee);
      }
    }

    // torso
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);
    this.mesh(box(0.42 * bulk, 0.22, 0.26 * bulk), pants, 0, -0.05, 0, this.hips);
    if (limb < 0.75) {
      // ribcage for skeletal creatures
      this.mesh(box(0.1, 0.55, 0.1), skin, 0, 0.27, -0.04);
      for (let i = 0; i < 4; i++) this.mesh(box(0.38 * bulk, 0.04, 0.22), skin, 0, 0.2 + i * 0.1, 0);
    } else {
      this.mesh(box(0.5 * bulk, 0.56, 0.3 * bulk), cloth, 0, 0.3, 0);
    }
    if (armor) {
      this.mesh(box(0.55 * bulk, 0.42, 0.35 * bulk), armor, 0, 0.36, 0);
      this.mesh(box(0.47 * bulk, 0.09, 0.32 * bulk), this.mat('#3a2a1a'), 0, 0.06, 0);
    }
    if (L.tabard) {
      const tb = this.mat(L.tabard[0]);
      const em = this.mat(L.tabard[1], { emissive: L.tabard[1], emissiveIntensity: 0.25 });
      const front = armor ? 0.18 * bulk : 0.16 * bulk;
      this.mesh(box(0.34 * bulk, 0.62, 0.02), tb, 0, 0.18, front);
      this.mesh(box(0.06, 0.34, 0.025), em, 0, 0.3, front + 0.005);
      this.mesh(box(0.22, 0.06, 0.025), em, 0, 0.36, front + 0.005);
      this.mesh(box(0.47 * bulk, 0.07, 0.33 * bulk), this.mat('#3a2412'), 0, 0.02, 0);
    }
    if (L.cape) {
      const capeMat = this.mat(L.cape);
      capeMat.side = THREE.DoubleSide;
      const capeMesh = this.mesh(box(0.5 * bulk, 0.95, 0.03), capeMat, 0, 0.12, -0.19);
      capeMesh.rotation.x = 0.12;
      capeMesh.name = 'cape';
    }
    if (L.hunch) this.torso.rotation.x = L.hunch;

    // head
    this.neck.position.y = 0.62;
    this.torso.add(this.neck);
    this.buildHead(skin, cloth);

    // arms
    for (const side of [1, -1]) {
      const arm = side === 1 ? this.armL : this.armR;
      const elbow = side === 1 ? this.elbowL : this.elbowR;
      arm.position.set(0.32 * bulk * side, 0.54, 0);
      this.torso.add(arm);
      this.mesh(box(0.13 * limb, 0.34, 0.14 * limb), L.robe && limb >= 0.75 ? cloth : skin, 0, -0.16, 0, arm);
      if (armor) this.mesh(box(0.2 * bulk, 0.14, 0.22), armor, 0.02 * side, 0.0, 0, arm);
      elbow.position.set(0, -0.33, 0);
      arm.add(elbow);
      this.mesh(box(0.12 * limb, 0.3, 0.12 * limb), skin, 0, -0.14, 0, elbow);
      const handSize = L.weapon === 'claws' ? 0.16 : 0.1;
      this.mesh(box(handSize, 0.11, handSize + 0.02), skin, 0, -0.32, 0.01, elbow);
      if (L.weapon === 'claws') {
        const clawMat = this.mat('#e8e0c8');
        for (let k = -1; k <= 1; k++) {
          const c = this.mesh(cone(0.025, 0.18, 4), clawMat, k * 0.045, -0.44, 0.04, elbow);
          c.rotation.x = Math.PI;
        }
      }
    }
    this.holdR.position.set(0, -0.32, 0.02);
    this.elbowR.add(this.holdR);
    this.holdL.position.set(0.0, -0.2, 0.0);
    this.elbowL.add(this.holdL);
    this.buildWeapon();
    this.buildShield();
    this.armL.rotation.z = 0.08;
    this.armR.rotation.z = -0.08;
  }

  private buildHead(skin: THREE.MeshStandardMaterial, cloth: THREE.MeshStandardMaterial) {
    const L = this.look;
    const n = this.neck;
    const eyeMat = L.eyes ? this.mat('#000', { emissive: L.eyes, emissiveIntensity: 2.5 }) : this.mat('#0a0606');
    switch (L.head) {
      case 'human': {
        this.mesh(box(0.22, 0.25, 0.23), skin, 0, 0.14, 0, n);
        this.mesh(box(0.23, 0.08, 0.24), this.mat(L.hair ?? '#2a1c12'), 0, 0.27, -0.01, n);
        this.mesh(box(0.23, 0.14, 0.06), this.mat(L.hair ?? '#2a1c12'), 0, 0.2, -0.1, n);
        this.mesh(box(0.04, 0.025, 0.02), eyeMat, 0.05, 0.16, 0.115, n);
        this.mesh(box(0.04, 0.025, 0.02), eyeMat, -0.05, 0.16, 0.115, n);
        break;
      }
      case 'skull': {
        this.mesh(sphere(0.13, 0), skin, 0, 0.15, 0, n);
        this.mesh(box(0.14, 0.07, 0.12), skin, 0, 0.05, 0.03, n);
        this.mesh(box(0.05, 0.05, 0.02), eyeMat, 0.05, 0.16, 0.11, n);
        this.mesh(box(0.05, 0.05, 0.02), eyeMat, -0.05, 0.16, 0.11, n);
        break;
      }
      case 'zombie': {
        const h = this.mesh(box(0.22, 0.24, 0.22), skin, 0, 0.12, 0.03, n);
        h.rotation.z = 0.25;
        this.mesh(box(0.16, 0.07, 0.1), this.mat('#3a1a1a'), 0, 0.02, 0.08, n);
        this.mesh(box(0.045, 0.03, 0.02), eyeMat, 0.05, 0.15, 0.14, n);
        this.mesh(box(0.045, 0.03, 0.02), eyeMat, -0.04, 0.13, 0.14, n);
        break;
      }
      case 'imp':
      case 'demon':
      case 'ghoul': {
        const big = L.head === 'imp' ? 1.25 : 1;
        this.mesh(sphere(0.15 * big, 0), skin, 0, 0.14, 0.02, n);
        this.mesh(box(0.16 * big, 0.08, 0.14), skin, 0, 0.04, 0.08, n);
        this.mesh(box(0.05, 0.03, 0.02), eyeMat, 0.06 * big, 0.16, 0.14 * big, n);
        this.mesh(box(0.05, 0.03, 0.02), eyeMat, -0.06 * big, 0.16, 0.14 * big, n);
        if (L.horns || L.head === 'demon') {
          const hornMat = this.mat('#d8c8a8');
          for (const s of [1, -1]) {
            const hc = this.mesh(cone(0.04, 0.22, 4), hornMat, 0.1 * s * big, 0.3, 0, n);
            hc.rotation.z = -0.5 * s;
            hc.rotation.x = -0.3;
          }
        }
        if (L.head === 'ghoul') {
          // long jaw
          this.mesh(box(0.14, 0.1, 0.16), this.mat('#2a1010'), 0, 0.0, 0.1, n);
        }
        break;
      }
      case 'hood': {
        const hood = this.mesh(cone(0.2, 0.42, 6), cloth, 0, 0.18, -0.02, n);
        hood.rotation.x = -0.15;
        this.mesh(box(0.16, 0.16, 0.06), this.mat('#050505'), 0, 0.1, 0.11, n);
        this.mesh(box(0.035, 0.03, 0.02), eyeMat, 0.04, 0.12, 0.15, n);
        this.mesh(box(0.035, 0.03, 0.02), eyeMat, -0.04, 0.12, 0.15, n);
        break;
      }
    }
    // helm
    if (L.helm) {
      const hm = this.mat(L.helmColor ?? '#8a8a8a', { metal: 0.6, rough: 0.4 });
      switch (L.helm) {
        case 'cap':
          this.mesh(box(0.25, 0.1, 0.26), hm, 0, 0.27, 0, n);
          break;
        case 'skull':
          this.mesh(box(0.26, 0.14, 0.27), hm, 0, 0.25, 0, n);
          this.mesh(box(0.06, 0.04, 0.05), this.mat('#ddd'), 0, 0.33, 0.1, n);
          break;
        case 'helm':
          this.mesh(box(0.27, 0.2, 0.28), hm, 0, 0.22, 0, n);
          this.mesh(box(0.04, 0.14, 0.04), hm, 0, 0.12, 0.14, n);
          break;
        case 'full':
          this.mesh(box(0.28, 0.3, 0.29), hm, 0, 0.17, 0, n);
          this.mesh(box(0.2, 0.025, 0.02), this.mat('#050505'), 0, 0.17, 0.15, n);
          break;
        case 'great': {
          this.mesh(box(0.3, 0.34, 0.31), hm, 0, 0.17, 0, n);
          this.mesh(box(0.22, 0.03, 0.02), this.mat('#050505'), 0, 0.17, 0.16, n);
          const crest = this.mesh(box(0.04, 0.12, 0.3), this.mat('#8a1a1a'), 0, 0.38, 0, n);
          crest.rotation.x = 0.1;
          break;
        }
        case 'crown': {
          const gold = this.mat('#e8c060', { metal: 0.8, rough: 0.3 });
          this.mesh(cyl(0.15, 0.15, 0.08, 8), gold, 0, 0.3, 0, n);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.mesh(cone(0.03, 0.1, 4), gold, Math.sin(a) * 0.14, 0.38, Math.cos(a) * 0.14, n);
          }
          break;
        }
      }
    }
  }

  private buildWeapon() {
    const L = this.look;
    const h = this.holdR;
    const metal = this.mat(L.weaponColor ?? '#b8b8c0', { metal: 0.7, rough: 0.35, emissive: L.weaponGlow ?? undefined, emissiveIntensity: L.weaponGlow ? 0.6 : 0 });
    const wood = this.mat('#4a3020');
    const g = new THREE.Group();
    // weapon points along +Y from the grip; rotate so it points forward when arm hangs
    g.rotation.x = Math.PI / 2;
    h.add(g);
    switch (L.weapon) {
      case 'sword':
        this.mesh(box(0.06, 0.78, 0.018), metal, 0, 0.5, 0, g);
        this.mesh(box(0.22, 0.04, 0.05), this.mat('#8a6a30', { metal: 0.6 }), 0, 0.1, 0, g);
        this.mesh(box(0.035, 0.16, 0.035), wood, 0, 0.0, 0, g);
        break;
      case 'greatsword':
        this.mesh(box(0.09, 1.15, 0.022), metal, 0, 0.72, 0, g);
        this.mesh(box(0.3, 0.05, 0.06), this.mat('#6a5a40', { metal: 0.6 }), 0, 0.13, 0, g);
        this.mesh(box(0.04, 0.26, 0.04), wood, 0, -0.02, 0, g);
        break;
      case 'axe':
        this.mesh(cyl(0.025, 0.025, 0.75, 5), wood, 0, 0.28, 0, g);
        this.mesh(box(0.03, 0.22, 0.24), metal, 0, 0.56, 0.1, g);
        break;
      case 'greataxe':
        this.mesh(cyl(0.03, 0.03, 1.2, 5), wood, 0, 0.45, 0, g);
        this.mesh(box(0.035, 0.36, 0.34), metal, 0, 0.92, 0.14, g);
        this.mesh(box(0.035, 0.26, 0.2), metal, 0, 0.92, -0.1, g);
        break;
      case 'mace': {
        this.mesh(cyl(0.025, 0.025, 0.6, 5), wood, 0, 0.22, 0, g);
        this.mesh(sphere(0.1, 0), metal, 0, 0.55, 0, g);
        for (let i = 0; i < 4; i++) {
          const sp = this.mesh(cone(0.03, 0.1, 4), metal, Math.sin(i * 1.57) * 0.1, 0.55, Math.cos(i * 1.57) * 0.1, g);
          sp.rotation.z = -Math.sin(i * 1.57) * 1.57;
          sp.rotation.x = Math.cos(i * 1.57) * 1.57;
        }
        break;
      }
      case 'maul':
        this.mesh(cyl(0.03, 0.03, 1.1, 5), wood, 0, 0.4, 0, g);
        this.mesh(box(0.22, 0.24, 0.4), metal, 0, 0.9, 0, g);
        break;
      case 'cleaver':
        this.mesh(box(0.04, 0.2, 0.04), wood, 0, 0.05, 0, g);
        this.mesh(box(0.03, 0.75, 0.32), metal, 0, 0.55, 0.12, g);
        break;
      case 'spear':
        this.mesh(cyl(0.02, 0.02, 1.2, 5), wood, 0, 0.3, 0, g);
        this.mesh(cone(0.05, 0.22, 4), metal, 0, 1.0, 0, g);
        break;
      case 'staff': {
        g.rotation.x = 0.1;
        this.mesh(cyl(0.028, 0.03, 1.5, 5), wood, 0, 0.3, 0, g);
        const orb = this.mesh(sphere(0.08, 1), this.mat('#000', { emissive: L.weaponGlow ?? '#ff8040', emissiveIntensity: 3 }), 0, 1.1, 0, g);
        orb.name = 'orb';
        break;
      }
      case 'scythe':
        this.mesh(cyl(0.025, 0.025, 1.5, 5), wood, 0, 0.45, 0, g);
        this.mesh(box(0.03, 0.08, 0.6), metal, 0, 1.15, 0.28, g);
        break;
      case 'bow': {
        // held in the left hand
        g.rotation.x = 0;
        this.holdR.remove(g);
        this.holdL.add(g);
        g.rotation.set(0, 0, 0);
        g.position.set(0, -0.05, 0.12);
        const bowGeo = new THREE.TorusGeometry(0.45, 0.025, 4, 12, Math.PI * 0.9);
        const bm = new THREE.Mesh(bowGeo, wood);
        bm.rotation.z = Math.PI / 2 + Math.PI * 0.05;
        bm.rotation.y = Math.PI / 2;
        g.add(bm);
        break;
      }
      default:
        break;
    }
  }

  private buildShield() {
    const L = this.look;
    if (!L.shield) return;
    const sm = this.mat(L.shieldColor ?? '#6a4a2a', { metal: 0.3, rough: 0.6 });
    const trim = this.mat(L.shieldTrim ?? '#a0a0a8', { metal: 0.7, rough: 0.35 });
    const g = new THREE.Group();
    g.position.set(0.1, -0.05, 0.02);
    g.rotation.y = Math.PI / 2;
    this.holdL.add(g);
    switch (L.shield) {
      case 'buckler': {
        const c = this.mesh(cyl(0.2, 0.2, 0.05, 10), sm, 0, 0, 0, g);
        c.rotation.z = Math.PI / 2;
        const b = this.mesh(sphere(0.06, 0), trim, 0.04, 0, 0, g);
        b.scale.x = 0.6;
        break;
      }
      case 'round': {
        const c = this.mesh(cyl(0.28, 0.28, 0.05, 12), sm, 0, 0, 0, g);
        c.rotation.z = Math.PI / 2;
        const r = this.mesh(new THREE.TorusGeometry(0.28, 0.025, 4, 14), trim, 0.01, 0, 0, g);
        r.rotation.y = Math.PI / 2;
        this.mesh(sphere(0.06, 0), trim, 0.04, 0, 0, g);
        break;
      }
      case 'kite': {
        this.mesh(box(0.05, 0.55, 0.36), sm, 0, 0.05, 0, g);
        const tip = this.mesh(cone(0.18, 0.25, 4), sm, 0, -0.33, 0, g);
        tip.rotation.x = Math.PI;
        tip.rotation.y = Math.PI / 4;
        tip.scale.x = 0.3;
        this.mesh(box(0.06, 0.04, 0.38), trim, 0, 0.32, 0, g);
        this.mesh(box(0.06, 0.45, 0.04), trim, 0.01, 0.05, 0, g);
        break;
      }
      case 'tower':
        this.mesh(box(0.06, 0.85, 0.48), sm, 0, 0.05, 0, g);
        this.mesh(box(0.07, 0.05, 0.5), trim, 0, 0.46, 0, g);
        this.mesh(box(0.07, 0.05, 0.5), trim, 0, -0.36, 0, g);
        break;
      case 'gothic':
        this.mesh(box(0.06, 0.95, 0.46), sm, 0, 0.05, 0, g);
        this.mesh(box(0.07, 0.95, 0.04), trim, 0.01, 0.05, 0, g);
        this.mesh(box(0.07, 0.04, 0.46), trim, 0.01, 0.2, 0, g);
        this.mesh(cone(0.08, 0.18, 4), trim, 0, 0.6, 0, g);
        break;
    }
  }

  // ─────────────────────────── spider ───────────────────────────
  private buildSpider() {
    const L = this.look;
    const body = this.mat(L.skin, { rough: 0.5 });
    const mark = this.mat(L.cloth, { emissive: L.cloth, emissiveIntensity: 0.3 });
    const eyeMat = this.mat('#000', { emissive: L.eyes ?? '#ff2020', emissiveIntensity: 2.5 });
    this.pose.add(this.hips);
    this.hipY = 0.45;
    this.hips.position.y = this.hipY;
    this.hips.add(this.torso);
    const abd = this.mesh(sphere(0.34, 1), body, 0, 0.12, -0.38);
    abd.scale.set(1, 0.8, 1.2);
    const m = this.mesh(sphere(0.14, 0), mark, 0, 0.32, -0.42);
    m.scale.set(1, 0.4, 1.4);
    this.mesh(sphere(0.2, 1), body, 0, 0.0, 0.05);
    this.mesh(sphere(0.12, 0), body, 0, 0.0, 0.28);
    for (const [x, y] of [[0.05, 0.05], [-0.05, 0.05], [0.09, 0.02], [-0.09, 0.02]]) this.mesh(sphere(0.025, 0), eyeMat, x, y, 0.38);
    // fangs
    for (const s of [1, -1]) {
      const f = this.mesh(cone(0.025, 0.12, 4), this.mat('#ddd'), 0.04 * s, -0.08, 0.38);
      f.rotation.x = Math.PI * 0.85;
    }
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? 1 : -1;
      const k = i % 4;
      const leg = new THREE.Group();
      leg.position.set(0.12 * side, 0, 0.18 - k * 0.12);
      leg.rotation.y = side * (Math.PI / 2) + (k - 1.5) * 0.35 * side;
      this.torso.add(leg);
      const upper = this.mesh(box(0.05, 0.05, 0.45), body, 0, 0.12, 0.2, leg);
      upper.rotation.x = -0.5;
      const lower = this.mesh(box(0.04, 0.04, 0.55), body, 0, -0.08, 0.52, leg);
      lower.rotation.x = 0.9;
      this.spiderLegs.push(leg);
    }
  }

  // ─────────────────────────── animation ───────────────────────────
  update(dt: number, a: AnimInput) {
    this.time += dt;
    // flash & status tint
    const flash = a.hitFlash;
    for (const m of this.mats) {
      const base = this.baseEmissive.get(m)!;
      m.emissive.copy(base);
      if (flash > 0) m.emissive.add(new THREE.Color(flash * 0.9, flash * 0.75, flash * 0.6));
      if (a.chilled) m.emissive.add(new THREE.Color(0.02, 0.08, 0.22));
      if (a.poisoned) m.emissive.add(new THREE.Color(0.02, 0.15, 0.0));
    }

    if (a.dead) {
      this.updateDeath(dt, a);
      return;
    }
    if (this.look.type === 'spider') {
      this.updateSpider(dt, a);
      return;
    }
    const moving = a.state === 'move' || a.state === 'charge';
    this.walkAmp = lerp(this.walkAmp, moving ? 1 : 0, Math.min(1, dt * 10));
    if (moving) this.walkPhase += dt * (a.speed * 2.3 + 1.5);
    const ph = this.walkPhase;
    const amp = this.walkAmp;
    const floating = !!this.look.floating;

    // reset pose
    this.armL.rotation.set(0, 0, 0.08);
    this.armR.rotation.set(0, 0, -0.08);
    this.elbowL.rotation.set(0, 0, 0);
    this.elbowR.rotation.set(0, 0, 0);
    this.torso.rotation.set(this.look.hunch ?? 0, 0, 0);
    this.pose.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);

    // locomotion
    const stride = a.state === 'charge' ? 1.1 : 0.7;
    this.legL.rotation.x = Math.sin(ph) * stride * amp;
    this.legR.rotation.x = -Math.sin(ph) * stride * amp;
    this.kneeL.rotation.x = Math.max(0, Math.sin(ph + 1.4)) * 0.9 * amp;
    this.kneeR.rotation.x = Math.max(0, -Math.sin(ph + 1.4)) * 0.9 * amp;
    const bob = floating ? Math.sin(this.time * 2.2) * 0.08 : Math.abs(Math.sin(ph)) * 0.06 * amp;
    this.hips.position.y = this.hipY + bob;
    this.armL.rotation.x = -Math.sin(ph) * 0.5 * amp;
    this.armR.rotation.x = Math.sin(ph) * 0.5 * amp;
    this.elbowL.rotation.x = -0.25 * amp;
    this.elbowR.rotation.x = -0.25 * amp;
    if (a.state === 'charge') this.torso.rotation.x += 0.35;
    else this.torso.rotation.x += 0.08 * amp;
    // breathing idle
    if (!moving) {
      this.torso.rotation.x += Math.sin(this.time * 1.8) * 0.015;
      this.armL.rotation.z += Math.sin(this.time * 1.8) * 0.02;
      this.armR.rotation.z -= Math.sin(this.time * 1.8) * 0.02;
    }
    // zombie arms reach forward
    if (this.look.head === 'zombie') {
      this.armL.rotation.x -= 1.2;
      this.armR.rotation.x -= 1.1;
    }
    if (this.look.shield) {
      this.armL.rotation.x -= 0.5;
      this.elbowL.rotation.x -= 0.9;
      this.armL.rotation.z += 0.15;
    }
    if (this.look.weapon !== 'none' && this.look.weapon !== 'claws' && this.look.weapon !== 'bow') {
      this.elbowR.rotation.x -= 0.4;
    }

    const p = a.stateDur > 0 ? clamp01(a.stateTime / a.stateDur) : 0;
    const newAction = a.state !== this.lastState || a.stateTime < this.lastStateTime;
    if (newAction && a.state === 'attack') this.variant = Math.random() < 0.5 ? 0 : 1;
    this.lastState = a.state;
    this.lastStateTime = a.stateTime;

    switch (a.state) {
      case 'attack':
        if (a.bow || this.look.weapon === 'bow') this.animBow(p);
        else if (this.look.weapon === 'staff') this.animCast(p);
        else if (this.look.weapon === 'claws' || this.look.weapon === 'none') this.animClaw(p);
        else if (this.variant === 0) this.animChop(p);
        else this.animSlash(p);
        break;
      case 'cast':
        this.animCast(p);
        break;
      case 'hit': {
        const k = Math.sin(p * Math.PI);
        this.torso.rotation.x -= 0.4 * k;
        this.neck.rotation.x -= 0.3 * k;
        this.armL.rotation.x -= 0.4 * k;
        this.armR.rotation.x -= 0.4 * k;
        break;
      }
      case 'block': {
        const k = Math.sin(p * Math.PI);
        this.armL.rotation.x = -1.3 * k - 0.5 * (1 - k);
        this.torso.rotation.x -= 0.12 * k;
        break;
      }
      default:
        break;
    }
    // cape sway
    const cape = this.torso.getObjectByName('cape');
    if (cape) cape.rotation.x = 0.12 + amp * 0.35 + Math.sin(this.time * 3) * 0.04;
    const orb = this.root.getObjectByName('orb') as THREE.Mesh | undefined;
    if (orb) orb.scale.setScalar(1 + Math.sin(this.time * 6) * 0.15);
  }

  /** overhead chop */
  private animChop(p: number) {
    let ax: number;
    let tw = 0;
    let lean = 0;
    if (p < 0.42) {
      const t = easeOut(p / 0.42);
      ax = lerp(0, -2.7, t);
      tw = 0.3 * t;
      lean = -0.08 * t;
    } else if (p < 0.6) {
      const t = (p - 0.42) / 0.18;
      ax = lerp(-2.7, -0.3, t * t);
      tw = lerp(0.3, -0.25, t);
      lean = lerp(-0.08, 0.3, t);
    } else {
      const t = easeOut((p - 0.6) / 0.4);
      ax = lerp(-0.3, 0, t);
      tw = lerp(-0.25, 0, t);
      lean = lerp(0.3, 0, t);
    }
    this.armR.rotation.x = ax;
    this.elbowR.rotation.x = -0.2;
    this.torso.rotation.y = tw;
    this.torso.rotation.x += lean;
  }

  /** horizontal sweep */
  private animSlash(p: number) {
    let az: number;
    let tw: number;
    if (p < 0.4) {
      const t = easeOut(p / 0.4);
      az = lerp(-0.1, -1.5, t);
      tw = lerp(0, 0.6, t);
    } else if (p < 0.6) {
      const t = (p - 0.4) / 0.2;
      az = lerp(-1.5, 0.9, t);
      tw = lerp(0.6, -0.7, t);
    } else {
      const t = easeOut((p - 0.6) / 0.4);
      az = lerp(0.9, -0.1, t);
      tw = lerp(-0.7, 0, t);
    }
    this.armR.rotation.x = -1.45;
    this.armR.rotation.z = az;
    this.elbowR.rotation.x = -0.15;
    this.torso.rotation.y = tw;
    this.torso.rotation.x += 0.12;
  }

  private animClaw(p: number) {
    const k = p < 0.5 ? easeOut(p / 0.5) : 1 - easeOut((p - 0.5) / 0.5);
    this.armR.rotation.x = lerp(this.armR.rotation.x, -2.2, k);
    this.armL.rotation.x = lerp(this.armL.rotation.x, -1.6, p > 0.4 ? k : 0);
    this.torso.rotation.x += 0.3 * (p > 0.45 ? k : -k * 0.5);
  }

  private animBow(p: number) {
    const k = p < 0.7 ? easeOut(p / 0.7) : 1 - (p - 0.7) / 0.3;
    this.armL.rotation.x = -1.55;
    this.armL.rotation.z = 0.0;
    this.elbowL.rotation.x = 0;
    this.armR.rotation.x = -1.5;
    this.armR.rotation.z = 0.4;
    this.elbowR.rotation.x = -1.6 * k;
    this.torso.rotation.y = -0.5;
  }

  private animCast(p: number) {
    const k = Math.sin(clamp01(p) * Math.PI);
    this.armL.rotation.x = -0.4 - 1.5 * k;
    this.armR.rotation.x = -0.4 - 1.5 * k;
    this.armL.rotation.z = 0.3 * k;
    this.armR.rotation.z = -0.3 * k;
    this.torso.rotation.x -= 0.15 * k;
  }

  private updateSpider(dt: number, a: AnimInput) {
    const moving = a.state === 'move';
    this.walkAmp = lerp(this.walkAmp, moving ? 1 : 0, Math.min(1, dt * 10));
    if (moving) this.walkPhase += dt * (a.speed * 4 + 2);
    this.spiderLegs.forEach((leg, i) => {
      const ph = this.walkPhase + i * 1.3 + (i % 2) * Math.PI;
      leg.rotation.x = Math.sin(ph) * 0.35 * this.walkAmp;
      leg.position.y = Math.max(0, Math.cos(ph)) * 0.06 * this.walkAmp;
    });
    this.hips.position.y = this.hipY + Math.sin(this.time * 3) * 0.02;
    this.torso.rotation.x = 0;
    if (a.state === 'attack') {
      const p = a.stateDur > 0 ? clamp01(a.stateTime / a.stateDur) : 0;
      const k = Math.sin(p * Math.PI);
      this.torso.rotation.x = -0.5 * k + (p > 0.5 ? 0.6 * k : 0);
      this.hips.position.y += 0.15 * k;
    }
  }

  private updateDeath(dt: number, a: AnimInput) {
    const t = a.deathTime;
    const shatter = a.blood === 'bone' || a.killedBy === 'cold' || a.blood === 'ghost';
    if (shatter && !this.shattered) {
      this.shattered = true;
      this.root.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      this.pose.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });
      for (const m of meshes) {
        this.root.attach(m);
        const out = new THREE.Vector3(m.position.x, 0, m.position.z).normalize();
        this.debris.push({
          mesh: m,
          vel: new THREE.Vector3(out.x * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 3, out.z * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2),
          ang: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        });
      }
      if (a.killedBy === 'cold') {
        for (const m of this.mats) {
          m.color.lerp(new THREE.Color('#9ad8ff'), 0.7);
          m.transparent = true;
          m.opacity = 0.85;
        }
      }
    }
    if (this.shattered) {
      for (const d of this.debris) {
        if (d.mesh.position.y <= 0.03 && d.vel.lengthSq() < 0.05) continue;
        d.vel.y -= 14 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += d.ang.x * dt;
        d.mesh.rotation.y += d.ang.y * dt;
        d.mesh.rotation.z += d.ang.z * dt;
        if (d.mesh.position.y < 0.03) {
          d.mesh.position.y = 0.03;
          d.vel.y *= -0.3;
          d.vel.x *= 0.5;
          d.vel.z *= 0.5;
          d.ang.multiplyScalar(0.5);
          if (Math.abs(d.vel.y) < 0.4) d.vel.set(0, 0, 0);
        }
      }
    } else {
      const k = easeOut(clamp01(t / 0.5));
      this.pose.rotation.x = -Math.PI / 2 * k;
      this.pose.position.y = 0.05 * k;
      this.armL.rotation.x = -1.2 * k;
      this.armR.rotation.x = -1.6 * k;
      this.legL.rotation.x = 0.2 * k;
      this.legR.rotation.x = -0.15 * k;
      if (a.killedBy === 'fire') {
        for (const m of this.mats) m.color.lerp(new THREE.Color('#120806'), Math.min(1, dt * 2));
      }
    }
    // sink & fade old corpses
    if (t > 34) {
      this.root.position.y = -(t - 34) * 0.12;
      if (!this.faded) {
        this.faded = true;
        for (const m of this.mats) m.transparent = true;
      }
      for (const m of this.mats) m.opacity = Math.max(0, 1 - (t - 34) / 5);
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
  }
}
