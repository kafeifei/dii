import * as THREE from 'three';
import { GLTFLoader, type GLTF, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DEV_MODELS } from './dev-models';
import { MODEL_KEYS, MODEL_PACKS } from './model-list';

/**
 * Models in public/models (see CREDITS.md there), listed by tools/build-models.mjs: the props in a
 * few packs of those used in the same places (packs/<pack>.glb, each model a root node named by its
 * key), the animated characters in files of their own. The debug-only ones (dev-models.ts) load only
 * in `npm run dev`, when their switch is on: the production build doesn't carry them.
 */
const QUERY = typeof location !== 'undefined' ? location.search : '';
const wanted = (key: string) => !DEV_MODELS[key] || (import.meta.env.DEV && QUERY.includes(DEV_MODELS[key]));
const PACKED = new Set<string>(Object.values(MODEL_PACKS).flat());

interface Source {
  /** public/models/<file>.glb */
  file: string;
  /** the models in it */
  keys: readonly string[];
  pack: boolean;
}
const SOURCES: Source[] = [
  ...Object.entries(MODEL_PACKS).map(([pack, keys]) => ({ file: `packs/${pack}`, keys, pack: true })),
  ...MODEL_KEYS.filter((k) => !PACKED.has(k) && wanted(k)).map((k) => ({ file: k, keys: [k], pack: false })),
];
const WANTED = SOURCES.reduce((n, s) => n + s.keys.length, 0);

/** tries at a file while the game waits to start, a moment apart: a dropped request costs a whole pack */
const TRIES = 3;
const RETRY_MS = 600;
/** then tries in the background, further and further apart up to a minute (some six minutes in all), so a file that's broken isn't fetched over and over */
const LATER_TRIES = 10;
const RETRY_MAX_MS = 60000;

export type ModelKey = (typeof MODEL_KEYS)[number];

export interface Template {
  gltf: GLTF;
  /** bind-pose bounds of the scene */
  size: THREE.Vector3;
  min: THREE.Vector3;
  center: THREE.Vector3;
}

class AssetLib {
  private templates = new Map<string, Template>();
  /** the templates' own geometries and materials, which their clones share: never disposed with a view */
  private shared = new WeakSet<object>();
  /** animation clips shared by every KayKit character (same rig) */
  kaykitClips: THREE.AnimationClip[] = [];
  ready = false;
  failed = false;
  private loading: Promise<void> | null = null;

  load(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.loading) return this.loading;
    // tools/build-models.mjs writes meshopt-compressed files
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    let done = 0;
    const missed: Source[] = [];
    this.loading = Promise.all(
      SOURCES.map(async (s) => {
        let ok = false;
        for (let i = 0; i < TRIES && !ok; i++) {
          if (i) await new Promise((r) => setTimeout(r, RETRY_MS * i));
          ok = await this.attempt(loader, s, i === TRIES - 1);
        }
        if (!ok) missed.push(s);
        onProgress?.(++done, SOURCES.length);
      }),
    ).then(() => {
      this.ready = true;
      this.failed = this.templates.size < WANTED / 2;
      // what's still missing keeps its stand-in (a drawn rig or house, no prop) until it comes
      for (const s of missed) this.retry(loader, s, RETRY_MS * 4, LATER_TRIES);
    });
    return this.loading;
  }

  /** one go at a file, its models made templates; false if it failed (said so when `warn`), never thrown, so the start never waits on it */
  private async attempt(loader: GLTFLoader, s: Source, warn: boolean): Promise<boolean> {
    try {
      this.add(s, await loader.loadAsync(`${import.meta.env.BASE_URL}models/${s.file}.glb`));
      return true;
    } catch (e) {
      if (warn) console.warn('model failed', s.file, e);
      return false;
    }
  }

  /** a file that wouldn't load, tried again later and later on: what it holds shows from then on */
  private retry(loader: GLTFLoader, s: Source, wait: number, left: number) {
    setTimeout(async () => {
      if (await this.attempt(loader, s, left === 1)) this.failed = this.templates.size < WANTED / 2;
      else if (left > 1) this.retry(loader, s, Math.min(wait * 2, RETRY_MAX_MS), left - 1);
    }, wait);
  }

  /** a file's models made templates: a pack's each from its root node, the scene a file of its own would load as */
  private add(s: Source, gltf: GLTF) {
    if (!s.pack) return this.register(s.keys[0], gltf);
    for (const root of [...gltf.scene.children]) {
      // GLTFLoader keeps a node's name as written there
      const key = root.userData.name;
      if (typeof key !== 'string' || !s.keys.includes(key)) {
        console.warn('model pack', s.file, 'holds', key, 'unlisted');
        continue;
      }
      // its children in an unnamed group at the origin, as a file's scene is
      const scene = new THREE.Group();
      for (const c of [...root.children]) scene.add(c);
      ownNames(scene, gltf.parser);
      this.register(key, { ...gltf, scene, scenes: [scene], animations: [] });
    }
    for (const k of s.keys) if (!this.templates.has(k)) console.warn('model failed', k, `not in ${s.file}`);
  }

  private register(name: string, gltf: GLTF) {
    this.shareTextures(gltf.scene);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      this.shared.add(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) this.shared.add(mat);
    });
    gltf.scene.updateMatrixWorld(true);
    const box = bodyBounds(gltf.scene);
    this.templates.set(name, { gltf, size: box.getSize(new THREE.Vector3()), min: box.min.clone(), center: box.getCenter(new THREE.Vector3()) });
    if (name === 'skeleton_minion') this.kaykitClips = gltf.animations.map(retarget);
  }

  /** every KayKit file embeds its pack's 1024² atlas; keep one GPU copy per atlas */
  private textures = new Map<string, THREE.Texture>();
  private shareTextures(root: THREE.Object3D) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const m = mat as THREE.MeshStandardMaterial;
        for (const slot of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
          const t = m[slot];
          if (!t || !t.name) continue;
          const img = t.image as { width?: number; height?: number } | undefined;
          const key = `${t.name}|${img?.width}x${img?.height}`;
          const shared = this.textures.get(key);
          if (!shared) this.textures.set(key, t);
          else if (shared !== t) {
            m[slot] = shared;
            t.dispose();
          }
        }
      }
    });
  }

  get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  /** whether a geometry or a material is a template's, shared by every clone of it */
  owns(x: object): boolean {
    return this.shared.has(x);
  }
}

/**
 * GLTFLoader names objects apart across a whole file (a model's node named by its key, under the
 * pack's root node named so too, comes out key_1) and unnamed meshes by their place in it: the names
 * a file of the model's own gives them, back. tools/build-models.mjs packs only models whose names
 * come out all different that way, as here.
 */
function ownNames(scene: THREE.Object3D, parser: GLTFParser) {
  const meshes: [THREE.Object3D, number][] = [];
  scene.traverse((o) => {
    const i = parser.associations.get(o)?.meshes;
    if (i !== undefined) meshes.push([o, i]);
    if (o !== scene && typeof o.userData.name === 'string') o.name = THREE.PropertyBinding.sanitizeNodeName(o.userData.name);
  });
  // a model's meshes sit together in the pack, in the order its own file has them
  const first = Math.min(...meshes.map(([, i]) => i));
  for (const [o, i] of meshes) {
    if (typeof o.userData.name !== 'string') o.name = THREE.PropertyBinding.sanitizeNodeName(parser.json.meshes[i].name || `mesh_${i - first}`);
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
