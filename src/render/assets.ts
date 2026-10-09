import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * CC0 model packs (see public/models/CREDITS.md):
 *  - KayKit Adventurers / Skeletons / Dungeon Remastered by Kay Lousberg
 *  - Quaternius monsters (via poly.pizza)
 */
const FILES = [
  'knight', 'barbarian', 'mage', 'skeleton_minion', 'skeleton_warrior', 'skeleton_rogue', 'skeleton_mage',
  'axe_1handed', 'axe_2handed', 'skeleton_blade', 'skeleton_axe', 'skeleton_crossbow', 'skeleton_staff',
  'skeleton_shield_small_a', 'skeleton_shield_large_a',
  'q_zombie', 'q_demon_small', 'q_demon_winged', 'q_demon_blue', 'q_tribal', 'q_orc', 'q_spider', 'q_ghost',
  'd_torch_mounted', 'd_barrel_large', 'd_barrel_small_stack', 'd_trunk_large_A', 'd_trunk_medium_A', 'd_box_large', 'd_crates_stacked',
  'd_pillar_decorated', 'd_rubble_large', 'd_rubble_half', 'd_coin_stack_small', 'd_keg', 'd_sword_shield_broken', 'd_table_long_broken',
] as const;

export type ModelKey = (typeof FILES)[number];

export interface Template {
  gltf: GLTF;
  /** bind-pose bounds of the scene */
  size: THREE.Vector3;
  min: THREE.Vector3;
  center: THREE.Vector3;
}

class AssetLib {
  private templates = new Map<string, Template>();
  /** animation clips shared by every KayKit character (same rig) */
  kaykitClips: THREE.AnimationClip[] = [];
  ready = false;
  failed = false;
  private loading: Promise<void> | null = null;

  load(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.loading) return this.loading;
    const loader = new GLTFLoader();
    let done = 0;
    this.loading = Promise.all(
      FILES.map(async (name) => {
        try {
          const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
          gltf.scene.updateMatrixWorld(true);
          const box = bodyBounds(gltf.scene);
          this.templates.set(name, { gltf, size: box.getSize(new THREE.Vector3()), min: box.min.clone(), center: box.getCenter(new THREE.Vector3()) });
          if (name === 'skeleton_minion') this.kaykitClips = gltf.animations.map(retarget);
        } catch (e) {
          console.warn('model failed', name, e);
        }
        onProgress?.(++done, FILES.length);
      }),
    ).then(() => {
      this.ready = true;
      this.failed = this.templates.size < FILES.length / 2;
    });
    return this.loading;
  }

  get(name: ModelKey): Template | undefined {
    return this.templates.get(name);
  }
}

/** bounds of the skinned body only (ignores weapons/shields parked on hand slots) */
function bodyBounds(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  let skinned = false;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (skinned && !(m as THREE.SkinnedMesh).isSkinnedMesh) return;
    box.expandByObject(m, true);
  });
  return box;
}

/**
 * KayKit clips carry translation/scale keys for every bone. Keep only rotations (plus root and hips
 * translation) so the clips can drive any KayKit body without imposing the skeleton's proportions.
 */
function retarget(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => {
    if (t.name.endsWith('.scale')) return false;
    if (t.name.endsWith('.position')) return /^(root|hips)\./.test(t.name);
    return true;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export const assets = new AssetLib();
