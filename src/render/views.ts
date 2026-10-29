import type * as THREE from 'three';
import type { P2 } from '../core/math';

/**
 * a view is made for a thing once it comes this near the hero (the monsters' are seen from 28);
 * further where the view reaches further, zoomed out on a wide screen (Renderer.viewReach)
 */
export const VIEW_NEAR = 30;
/**
 * and let go only once it is this far (or as much past a further reach): one walking along the
 * edge doesn't make and free the same views over and over (plan B 无缝大地图要解决的问题: views
 * released past about 40 tiles)
 */
export const VIEW_FAR = 40;

/** the camera's turn about the upright (Renderer): it never turns, so what faces the viewer is turned by this */
export const CAM_YAW = Math.PI / 4;

/**
 * The views of the things near the hero (monsters, items on the ground, objects): made as they come
 * within VIEW_NEAR, kept until they are past VIEW_FAR or gone from the level. On the West overworld
 * the hero never leaves the map, so views of what they walked past would pile up otherwise.
 */
export class NearViews<K extends { pos: P2 }, V> {
  readonly views = new Map<K, V>();

  constructor(
    private make: (k: K) => V,
    private free: (k: K, v: V) => void,
  ) {}

  /**
   * A view for each of `near` (the things within VIEW_NEAR of `hero`, or some more) that has none;
   * the views of things past `far`, or `gone`, let go
   */
  sync(hero: P2, near: Iterable<K>, gone?: (k: K) => boolean, far = VIEW_FAR) {
    for (const k of near) if (!this.views.has(k)) this.views.set(k, this.make(k));
    for (const [k, v] of this.views) {
      const dx = k.pos.x - hero.x;
      const dz = k.pos.z - hero.z;
      if (dx * dx + dz * dz > far * far || gone?.(k)) {
        this.views.delete(k);
        this.free(k, v);
      }
    }
  }

  /** every view let go (a new level) */
  clear() {
    for (const [k, v] of this.views) this.free(k, v);
    this.views.clear();
  }
}

/**
 * Views put by when let go, by what they look like, for the next thing that looks the same: a
 * monster coming into view takes the rig of one gone from it instead of building a skinned model
 * anew. Enough of each for a pack or two, and so many in all (about the monsters round a crowded
 * waypoint, so going back by waypoint builds few). Full, the look least lately put by or taken
 * makes room (one of another level's, say, whose monsters don't come again); past `perKey` of one
 * look they are disposed.
 */
export class Pool<V> {
  /** by look, the one least lately used first */
  private idle = new Map<string, V[]>();
  private count = 0;

  constructor(
    private dispose: (v: V) => void,
    readonly perKey = 24,
    readonly max = 128,
  ) {}

  /** one put by under `key`, if there is one */
  take(key: string): V | undefined {
    const list = this.touch(key);
    const v = list?.pop();
    if (v !== undefined) this.count--;
    return v;
  }

  /** put by under `key`, the oldest of the look least lately used disposed when full; or disposed when there are enough of `key` */
  give(key: string, v: V) {
    let list = this.touch(key);
    if (!list) this.idle.set(key, (list = []));
    if (list.length >= this.perKey) {
      this.dispose(v);
      return;
    }
    for (const [k, l] of this.idle) {
      if (this.count < this.max) break;
      if (k === key) continue;
      while (l.length && this.count >= this.max) {
        this.dispose(l.shift()!);
        this.count--;
      }
      if (!l.length) this.idle.delete(k);
    }
    if (this.count >= this.max) {
      this.dispose(v);
      return;
    }
    list.push(v);
    this.count++;
  }

  /** the looks not to `keep` disposed (a new level, without those monsters) */
  retain(keep: (key: string) => boolean) {
    for (const [k, l] of this.idle) {
      if (keep(k)) continue;
      for (const v of l) this.dispose(v);
      this.count -= l.length;
      this.idle.delete(k);
    }
  }

  /** how many are put by */
  get size() {
    return this.count;
  }

  /** every one disposed */
  clear() {
    for (const list of this.idle.values()) for (const v of list) this.dispose(v);
    this.idle.clear();
    this.count = 0;
  }

  /** `key`'s list, moved to the end: the latest used */
  private touch(key: string): V[] | undefined {
    const list = this.idle.get(key);
    if (list) {
      this.idle.delete(key);
      this.idle.set(key, list);
    }
    return list;
  }
}

/**
 * A let-go view's own geometries and materials disposed (an object's or an item's is made anew when
 * the hero comes back): not those `shared` says are shared, nor a sprite's geometry (three's one
 * for every sprite), nor any texture (textures.ts and the models keep them)
 */
export function disposeView(root: THREE.Object3D, shared: (x: object) => boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
    if (m.isMesh && !shared(m.geometry)) m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!shared(mat)) mat.dispose();
  });
}

/**
 * `f` on each of a view's materials that has a colour, the ones `shared` says are shared (stdMat's,
 * a model's) copied for the view first: views are let go and made again as the hero comes and goes,
 * and a tint on a shared material would add up each time, on every view that shares it (a chest's
 * inside floor). The copies are the view's own, disposed with it (disposeView)
 */
export function tintOwn(root: THREE.Object3D, shared: (x: object) => boolean, f: (m: THREE.MeshStandardMaterial) => void) {
  // each material once, however many of the view's meshes use it
  const done = new Map<THREE.Material, THREE.Material>();
  const own = (m: THREE.Material) => {
    let c = done.get(m);
    if (c) return c;
    c = m;
    if ((m as THREE.MeshStandardMaterial).color) {
      if (shared(m)) c = m.clone();
      f(c as THREE.MeshStandardMaterial);
    }
    done.set(m, c);
    return c;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
  });
}
