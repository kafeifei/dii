import * as THREE from 'three';
import { ITEM_BASES } from '../data/items';
import type { DecorKind } from '../world/levelgen';
import type { Item } from '../items/item';
import { assets, type ModelKey } from './assets';
import { glowTexture, runeCircleTexture } from './textures';

const matCache = new Map<string, THREE.Material>();
export function stdMat(color: string, rough = 0.85, metal = 0, emissive?: string, ei = 1): THREE.MeshStandardMaterial {
  const k = `${color}|${rough}|${metal}|${emissive ?? ''}|${ei}`;
  let m = matCache.get(k) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = ei;
    }
    matCache.set(k, m);
  }
  return m;
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/**
 * Instance of a CC0 prop model, standing on y=0. `center` recentres it on x/z (otherwise the
 * model's own origin is kept, e.g. a torch's wall mount). Returns null if the packs aren't loaded.
 */
export function assetProp(key: ModelKey, scale: number | [number, number, number], opts: { center?: boolean; ownMaterials?: boolean } = {}): THREE.Group | null {
  if (!assets.ready || assets.failed) return null;
  const t = assets.get(key);
  if (!t) return null;
  const sv = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  const o = t.gltf.scene.clone(true);
  o.scale.copy(sv);
  const center = opts.center ?? true;
  o.position.set(center ? -t.center.x * sv.x : 0, -t.min.y * sv.y, center ? -t.center.z * sv.z : 0);
  if (opts.ownMaterials) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = (m.material as THREE.Material).clone();
    });
  }
  const g = new THREE.Group();
  g.add(o);
  return g;
}

function pickKey<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function glowSprite(color: string, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }),
  );
  s.scale.setScalar(size);
  return s;
}

function topCentroid(root: THREE.Object3D, band: number): THREE.Vector3 {
  root.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  root.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  const top = Math.max(...pts.map((p) => p.y));
  const sel = pts.filter((p) => p.y > top - band);
  const c = new THREE.Vector3();
  for (const p of sel) c.add(p);
  return c.divideScalar(Math.max(1, sel.length)).setY(top - band * 0.5);
}

let torchMatCache: THREE.MeshBasicMaterial | null = null;
function torchMat(map: THREE.Texture | null): THREE.MeshBasicMaterial {
  if (!torchMatCache) torchMatCache = new THREE.MeshBasicMaterial({ map, color: '#c8b8a8' });
  return torchMatCache;
}

export function makeTorch(color: string): { group: THREE.Group; flame: THREE.Sprite } {
  const model = assetProp('d_torch_mounted', 0.8, { center: false });
  if (model) {
    // the model's own flame sits right next to the torch light and blows out to white; draw it unlit
    model.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = torchMat((m.material as THREE.MeshStandardMaterial).map);
    });
    const g = new THREE.Group();
    model.position.y = 1.3;
    g.add(model);
    // sit the glow on the model's own flame: centroid of its topmost vertices
    const fx = topCentroid(model, 0.12);
    const flame = glowSprite(color, 0.9);
    flame.position.copy(fx);
    g.add(flame);
    const core = glowSprite('#fff0c0', 0.35);
    core.position.copy(fx).setY(fx.y - 0.04);
    g.add(core);
    return { group: g, flame };
  }
  const g = new THREE.Group();
  const iron = stdMat('#2a2420', 0.6, 0.6);
  add(g, new THREE.BoxGeometry(0.08, 0.08, 0.25), iron, 0, 1.45, 0.12);
  add(g, new THREE.CylinderGeometry(0.04, 0.03, 0.35, 5), stdMat('#3a2616'), 0, 1.6, 0.26, 0.35, 0, 0);
  add(g, new THREE.CylinderGeometry(0.07, 0.05, 0.08, 6), iron, 0, 1.78, 0.32);
  const flame = glowSprite(color, 0.9);
  flame.position.set(0, 1.92, 0.33);
  g.add(flame);
  const core = glowSprite('#fff0c0', 0.3);
  core.position.set(0, 1.86, 0.33);
  g.add(core);
  return { group: g, flame };
}

export function makeChest(big = false): { group: THREE.Group; lid: THREE.Group } {
  const model = big ? assetProp('d_trunk_large_A', 0.72, { ownMaterials: true }) : assetProp('d_trunk_medium_A', 0.82, { ownMaterials: true });
  if (model) {
    // single-mesh trunk: no lid to swing, the renderer dims it once looted
    model.userData.looted = false;
    return { group: model, lid: new THREE.Group() };
  }
  const g = new THREE.Group();
  const s = big ? 1.4 : 1;
  const wood = stdMat('#5a3a1e');
  const iron = stdMat('#4a4a4a', 0.5, 0.7);
  add(g, new THREE.BoxGeometry(0.8 * s, 0.42 * s, 0.5 * s), wood, 0, 0.21 * s, 0);
  add(g, new THREE.BoxGeometry(0.84 * s, 0.06, 0.54 * s), iron, 0, 0.05, 0);
  add(g, new THREE.BoxGeometry(0.06, 0.44 * s, 0.54 * s), iron, -0.25 * s, 0.22 * s, 0);
  add(g, new THREE.BoxGeometry(0.06, 0.44 * s, 0.54 * s), iron, 0.25 * s, 0.22 * s, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.42 * s, -0.25 * s);
  g.add(lid);
  add(lid, new THREE.BoxGeometry(0.82 * s, 0.14 * s, 0.52 * s), wood, 0, 0.07 * s, 0.25 * s);
  add(lid, new THREE.BoxGeometry(0.86 * s, 0.05, 0.08), iron, 0, 0.12 * s, 0.25 * s);
  add(lid, new THREE.BoxGeometry(0.1, 0.12, 0.06), stdMat('#c8a040', 0.4, 0.8), 0, 0.0, 0.52 * s);
  return { group: g, lid };
}

export function makeBarrel(): THREE.Group {
  const model = assetProp('d_barrel_large', 0.36);
  if (model) return model;
  const g = new THREE.Group();
  const wood = stdMat('#6a4a2a');
  const iron = stdMat('#3a3a3a', 0.5, 0.6);
  add(g, new THREE.CylinderGeometry(0.28, 0.24, 0.75, 9), wood, 0, 0.38, 0);
  add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.05, 9), iron, 0, 0.62, 0);
  add(g, new THREE.CylinderGeometry(0.27, 0.27, 0.05, 9), iron, 0, 0.15, 0);
  return g;
}

export function makeStairs(town: boolean): THREE.Group {
  const g = new THREE.Group();
  const stone = stdMat(town ? '#5a5248' : '#4a4640');
  const black = new THREE.MeshBasicMaterial({ color: '#000000' });
  add(g, new THREE.BoxGeometry(1.8, 0.02, 1.8), black, 0, 0.012, 0);
  for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(1.5, 0.08, 0.32), stone, 0, 0.0 - i * 0.02, -0.55 + i * 0.32);
  const rim = stdMat('#3a3632');
  add(g, new THREE.BoxGeometry(2.1, 0.25, 0.18), rim, 0, 0.12, -0.98);
  add(g, new THREE.BoxGeometry(0.18, 0.25, 2.1), rim, -0.98, 0.12, 0);
  add(g, new THREE.BoxGeometry(0.18, 0.25, 2.1), rim, 0.98, 0.12, 0);
  if (town) {
    // archway
    add(g, new THREE.BoxGeometry(0.3, 2.2, 0.3), rim, -1, 1.1, -1);
    add(g, new THREE.BoxGeometry(0.3, 2.2, 0.3), rim, 1, 1.1, -1);
    add(g, new THREE.BoxGeometry(2.4, 0.35, 0.4), rim, 0, 2.3, -1);
  }
  return g;
}

export function makeWaypoint(): { group: THREE.Group; rune: THREE.Mesh } {
  const g = new THREE.Group();
  const stone = stdMat('#6a6660');
  add(g, new THREE.CylinderGeometry(1.25, 1.35, 0.16, 16), stone, 0, 0.08, 0);
  const rune = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: runeCircleTexture('#60b0ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#80c8ff' }),
  );
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.17;
  g.add(rune);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    add(g, new THREE.BoxGeometry(0.22, 1.0, 0.22), stone, Math.sin(a) * 1.2, 0.5, Math.cos(a) * 1.2);
    const gem = add(g, new THREE.OctahedronGeometry(0.1), stdMat('#000', 0.3, 0, '#60b0ff', 2), Math.sin(a) * 1.2, 1.12, Math.cos(a) * 1.2);
    gem.name = 'gem';
  }
  return { group: g, rune };
}

export function makePortal(color: string): { group: THREE.Group; disc: THREE.Mesh; ring: THREE.Mesh } {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 24),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.scale.set(1, 1.6, 1);
  disc.position.y = 1.1;
  g.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  ring.scale.set(1, 1.6, 1);
  ring.position.y = 1.1;
  g.add(ring);
  // face the camera direction (camera sits at +x +z)
  g.rotation.y = Math.PI / 4;
  return { group: g, disc, ring };
}

export function makeCampfire(): THREE.Group {
  const g = new THREE.Group();
  const stone = stdMat('#5a5650');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    add(g, new THREE.IcosahedronGeometry(0.16, 0), stone, Math.sin(a) * 0.6, 0.08, Math.cos(a) * 0.6);
  }
  const log = stdMat('#3a2414');
  for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(0.06, 0.07, 0.8, 5), log, 0, 0.12, 0, Math.PI / 2, (i / 4) * Math.PI, 0.25);
  add(g, new THREE.CircleGeometry(0.4, 10), stdMat('#ff6010', 1, 0, '#ff4a10', 2), 0, 0.03, 0, -Math.PI / 2, 0, 0);
  return g;
}

export function makeTree(scale: number, dead: boolean): THREE.Group {
  const g = new THREE.Group();
  const bark = stdMat('#3a2a1c');
  add(g, new THREE.CylinderGeometry(0.1, 0.18, 1.6, 6), bark, 0, 0.8, 0);
  if (dead) {
    for (let i = 0; i < 4; i++) add(g, new THREE.CylinderGeometry(0.03, 0.06, 0.9, 4), bark, 0, 1.4, 0, 0.7, (i / 4) * Math.PI * 2, 0.4);
  } else {
    const leaf = stdMat('#1e3018');
    add(g, new THREE.ConeGeometry(0.9, 1.4, 7), leaf, 0, 1.8, 0);
    add(g, new THREE.ConeGeometry(0.7, 1.2, 7), stdMat('#243a1c'), 0, 2.45, 0);
    add(g, new THREE.ConeGeometry(0.45, 0.9, 7), leaf, 0, 3.0, 0);
  }
  g.scale.setScalar(scale);
  return g;
}

const DECOR_MODELS: Partial<Record<DecorKind, [ModelKey, number][]>> = {
  crate: [
    ['d_box_large', 0.4],
    ['d_crates_stacked', 0.36],
    ['d_table_long_broken', 0.3],
  ],
  barrel: [
    ['d_barrel_small_stack', 0.38],
    ['d_keg', 0.34],
  ],
  rubble: [
    ['d_rubble_half', 0.2],
    ['d_rubble_large', 0.13],
  ],
  bones: [['d_sword_shield_broken', 0.45]],
};

export function makeDecor(kind: DecorKind, themeKey: string): THREE.Group {
  const opts = DECOR_MODELS[kind];
  // bones stay mostly procedural; now and then a broken sword & shield instead
  if (opts && (kind !== 'bones' || Math.random() < 0.3)) {
    const [key, sc] = pickKey(opts);
    const model = assetProp(key, sc);
    if (model) return model;
  }
  const g = new THREE.Group();
  const bone = stdMat('#d8d0bc');
  switch (kind) {
    case 'bones':
      for (let i = 0; i < 5; i++) add(g, new THREE.BoxGeometry(0.05, 0.05, 0.35 + Math.random() * 0.2), bone, (Math.random() - 0.5) * 0.6, 0.03, (Math.random() - 0.5) * 0.6, 0, Math.random() * 3, 0);
      add(g, new THREE.IcosahedronGeometry(0.1, 0), bone, 0.1, 0.08, 0.05);
      break;
    case 'skullpile':
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.3;
        add(g, new THREE.IcosahedronGeometry(0.11, 0), bone, Math.sin(a) * r, 0.1 + (i > 4 ? 0.16 : 0), Math.cos(a) * r);
      }
      break;
    case 'rubble':
    case 'rock': {
      const c = kind === 'rock' ? (themeKey === 'town' ? '#5a5a52' : '#4a4038') : '#5a544c';
      const n = kind === 'rock' ? 2 : 6;
      for (let i = 0; i < n; i++) {
        const s = kind === 'rock' ? 0.3 + Math.random() * 0.25 : 0.08 + Math.random() * 0.12;
        add(g, new THREE.IcosahedronGeometry(s, 0), stdMat(c), (Math.random() - 0.5) * 0.7, s * 0.6, (Math.random() - 0.5) * 0.7, Math.random(), Math.random(), 0);
      }
      break;
    }
    case 'cage': {
      const iron = stdMat('#2a2a2a', 0.5, 0.7);
      add(g, new THREE.CylinderGeometry(0.45, 0.45, 0.06, 8), iron, 0, 0.03, 0);
      add(g, new THREE.CylinderGeometry(0.45, 0.45, 0.06, 8), iron, 0, 1.4, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(g, new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), iron, Math.sin(a) * 0.43, 0.7, Math.cos(a) * 0.43);
      }
      add(g, new THREE.IcosahedronGeometry(0.11, 0), bone, 0.1, 0.12, 0);
      break;
    }
    case 'banner': {
      add(g, new THREE.CylinderGeometry(0.04, 0.05, 2.6, 5), stdMat('#3a2a1c'), 0, 1.3, 0);
      const cloth = new THREE.MeshStandardMaterial({ color: '#6a1414', side: THREE.DoubleSide, flatShading: true });
      add(g, new THREE.PlaneGeometry(0.6, 1.1), cloth, 0.32, 1.9, 0);
      break;
    }
    case 'stalagmite':
      for (let i = 0; i < 3; i++) add(g, new THREE.ConeGeometry(0.15 + Math.random() * 0.15, 0.6 + Math.random() * 1.0, 5), stdMat(themeKey === 'hell' ? '#3a1a14' : '#4a3a2c'), (Math.random() - 0.5) * 0.5, 0.4, (Math.random() - 0.5) * 0.5);
      break;
    case 'crystal':
      for (let i = 0; i < 4; i++) {
        const h = 0.4 + Math.random() * 0.8;
        const m = add(g, new THREE.OctahedronGeometry(0.15, 0), stdMat('#6ab0e0', 0.2, 0.1, '#2a70b0', 1.2), (Math.random() - 0.5) * 0.5, h / 2, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
        m.scale.set(1, h / 0.3, 1);
      }
      break;
    case 'tent': {
      const canvas = new THREE.MeshStandardMaterial({ color: '#8a7a5a', flatShading: true, side: THREE.DoubleSide });
      const t = add(g, new THREE.ConeGeometry(1.4, 1.8, 4, 1, true), canvas, 0, 0.9, 0, 0, Math.PI / 4, 0);
      t.scale.set(1.2, 1, 1);
      add(g, new THREE.CylinderGeometry(0.04, 0.04, 2, 4), stdMat('#3a2a1c'), 0, 1.0, 0);
      break;
    }
    case 'crate': {
      const wood = stdMat('#6a4a28');
      add(g, new THREE.BoxGeometry(0.6, 0.6, 0.6), wood, 0, 0.3, 0);
      add(g, new THREE.BoxGeometry(0.62, 0.08, 0.62), stdMat('#4a3018'), 0, 0.58, 0);
      break;
    }
    case 'campfire':
      return makeCampfire();
    case 'tree':
      return makeTree(1, false);
  }
  return g;
}

// ─────────────────────────── ground items ───────────────────────────

export function makeGroundItem(item: Item | null, color: string): THREE.Group {
  const g = new THREE.Group();
  if (!item) {
    const coins = assetProp('d_coin_stack_small', 0.32);
    if (coins) return coins;
    const gold = stdMat('#e8c040', 0.35, 0.9, '#5a4008', 0.6);
    for (let i = 0; i < 5; i++) add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.025, 8), gold, (Math.random() - 0.5) * 0.18, 0.02 + i * 0.02, (Math.random() - 0.5) * 0.18);
    return g;
  }
  const b = ITEM_BASES[item.baseId];
  const c = new THREE.Color(color);
  const m = stdMat(`#${c.getHexString()}`, 0.5, 0.4, `#${c.clone().multiplyScalar(0.25).getHexString()}`, 1);
  const metal = stdMat('#a8a8b0', 0.35, 0.8);
  switch (b.type) {
    case 'sword':
    case 'axe':
    case 'mace':
      add(g, new THREE.BoxGeometry(0.07, 0.03, 0.75), metal, 0, 0.03, 0.05, 0, 0.6, 0);
      add(g, new THREE.BoxGeometry(0.22, 0.04, 0.05), m, 0.18, 0.04, -0.2, 0, 0.6, 0);
      break;
    case 'shield':
      add(g, new THREE.CylinderGeometry(0.25, 0.25, 0.05, 10), m, 0, 0.03, 0);
      break;
    case 'helm':
      add(g, new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.0, 0);
      break;
    case 'armor':
      add(g, new THREE.BoxGeometry(0.4, 0.08, 0.5), m, 0, 0.04, 0, 0, 0.4, 0);
      break;
    case 'gloves':
    case 'boots':
      add(g, new THREE.BoxGeometry(0.14, 0.1, 0.24), m, -0.1, 0.05, 0, 0, 0.3, 0);
      add(g, new THREE.BoxGeometry(0.14, 0.1, 0.24), m, 0.1, 0.05, 0.05, 0, 0.5, 0);
      break;
    case 'belt':
      add(g, new THREE.TorusGeometry(0.18, 0.035, 4, 10), m, 0, 0.03, 0, Math.PI / 2, 0, 0);
      break;
    case 'ring':
      add(g, new THREE.TorusGeometry(0.07, 0.022, 5, 10), stdMat('#e8c040', 0.3, 0.9), 0, 0.03, 0, Math.PI / 2, 0, 0);
      add(g, new THREE.OctahedronGeometry(0.035), m, 0.07, 0.05, 0);
      break;
    case 'amulet':
      add(g, new THREE.TorusGeometry(0.12, 0.012, 4, 12), stdMat('#c8a040', 0.3, 0.9), 0, 0.02, 0, Math.PI / 2, 0, 0);
      add(g, new THREE.OctahedronGeometry(0.06), m, 0, 0.05, 0.13);
      break;
    case 'potion': {
      const pm = stdMat(b.tint ?? '#c01010', 0.2, 0, b.tint ?? '#c01010', 0.5);
      add(g, new THREE.SphereGeometry(0.1, 8, 6), pm, 0, 0.1, 0);
      add(g, new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6), stdMat('#d8d8d0', 0.3), 0, 0.22, 0);
      break;
    }
    case 'rune':
      add(g, new THREE.BoxGeometry(0.16, 0.05, 0.2), stdMat('#5a5048', 0.6, 0, b.tint ?? '#ff9020', 0.6), 0, 0.03, 0);
      break;
  }
  return g;
}

// ─────────────────────────── projectiles ───────────────────────────

export function makeProjectile(kind: string): { group: THREE.Group; light: string | null } {
  const g = new THREE.Group();
  switch (kind) {
    case 'arrow': {
      add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4), stdMat('#6a5030'), 0, 0, 0, Math.PI / 2, 0, 0);
      add(g, new THREE.ConeGeometry(0.035, 0.1, 4), stdMat('#888', 0.4, 0.8), 0, 0, 0.38, Math.PI / 2, 0, 0);
      return { group: g, light: null };
    }
    case 'firebolt':
      g.add(glowSprite('#ff7020', 0.7));
      g.add(glowSprite('#fff0a0', 0.25));
      return { group: g, light: '#ff6a20' };
    case 'fireball':
      g.add(glowSprite('#ff5010', 1.2));
      g.add(glowSprite('#ffe080', 0.45));
      return { group: g, light: '#ff5010' };
    case 'iceshard': {
      add(g, new THREE.OctahedronGeometry(0.12), stdMat('#c0e8ff', 0.2, 0, '#60b0ff', 1.5), 0, 0, 0).scale.set(0.6, 0.6, 2.2);
      g.add(glowSprite('#60b0ff', 0.6, 0.7));
      return { group: g, light: '#60a0ff' };
    }
    case 'poisonspit':
      g.add(glowSprite('#60ff40', 0.5));
      return { group: g, light: null };
    case 'holybolt':
      g.add(glowSprite('#fff0b0', 0.7));
      g.add(glowSprite('#ffffff', 0.25));
      return { group: g, light: '#ffe8a0' };
    case 'chargedbolt':
      g.add(glowSprite('#80a0ff', 0.45));
      g.add(glowSprite('#ffffff', 0.15));
      return { group: g, light: null };
    default:
      g.add(glowSprite('#ffffff', 0.4));
      return { group: g, light: null };
  }
}

export function makeHammer(): THREE.Group {
  const g = new THREE.Group();
  const holy = stdMat('#e0e8ff', 0.3, 0.6, '#6080ff', 1.6);
  add(g, new THREE.BoxGeometry(0.34, 0.2, 0.2), holy, 0, 0, 0.18);
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5), stdMat('#c8c8ff', 0.3, 0.5, '#4060ff', 1), 0, 0, -0.05, Math.PI / 2, 0, 0);
  g.add(glowSprite('#7090ff', 1.0, 0.8));
  return g;
}

/** a timber cottage occupying a w×d tile block whose corner is at (x, z) */
export function makeHouse(w: number, d: number, x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x + w / 2, 0, z + d / 2);
  const wallH = 1.9;
  const plaster = stdMat('#8a7a62');
  const timber = stdMat('#3a2616');
  const roofMat = stdMat('#4a2a1e');
  add(g, new THREE.BoxGeometry(w - 0.1, wallH, d - 0.1), plaster, 0, wallH / 2, 0);
  // timber frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.BoxGeometry(0.18, wallH, 0.18), timber, (sx * (w - 0.1)) / 2, wallH / 2, (sz * (d - 0.1)) / 2);
  add(g, new THREE.BoxGeometry(w, 0.14, d), timber, 0, wallH, 0);
  add(g, new THREE.BoxGeometry(w - 0.05, 0.12, d - 0.05), timber, 0, 0.9, 0);
  // gabled roof along the longer side
  const long = w >= d;
  const span = long ? d : w;
  const len = (long ? w : d) + 0.5;
  const rise = span * 0.45;
  const slope = Math.hypot(span / 2 + 0.25, rise);
  const ang = Math.atan2(rise, span / 2 + 0.25);
  for (const s of [-1, 1]) {
    const m = add(g, new THREE.BoxGeometry(long ? len : slope, 0.12, long ? slope : len), roofMat, 0, wallH + rise / 2, 0);
    if (long) {
      m.position.z = (s * (span / 2 + 0.25)) / 2;
      m.rotation.x = s * ang;
    } else {
      m.position.x = (s * (span / 2 + 0.25)) / 2;
      m.rotation.z = -s * ang;
    }
  }
  // gable ends
  const tri = new THREE.Shape();
  tri.moveTo(-span / 2, 0);
  tri.lineTo(span / 2, 0);
  tri.lineTo(0, rise);
  tri.closePath();
  const tg = new THREE.ShapeGeometry(tri);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(tg, plaster);
    m.material = new THREE.MeshStandardMaterial({ color: '#7a6a52', side: THREE.DoubleSide, flatShading: true });
    m.position.y = wallH;
    if (long) {
      m.rotation.y = Math.PI / 2;
      m.position.x = (s * (w - 0.1)) / 2;
    } else m.position.z = (s * (d - 0.1)) / 2;
    g.add(m);
  }
  // door and a lit window facing the camera side
  add(g, new THREE.BoxGeometry(0.6, 1.1, 0.06), stdMat('#2a1a0e'), 0.3, 0.55, d / 2);
  add(g, new THREE.BoxGeometry(0.45, 0.4, 0.06), stdMat('#000', 1, 0, '#ffb050', 1.4), -w / 4, 1.2, d / 2);
  add(g, new THREE.BoxGeometry(0.06, 0.4, 0.45), stdMat('#000', 1, 0, '#ffb050', 1.4), w / 2, 1.2, 0);
  return g;
}
