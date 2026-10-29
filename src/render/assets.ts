import * as THREE from 'three';
import { GLTFLoader, type GLTF, type GLTFLoaderPlugin, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DEV_MODELS } from './dev-models';
import { MODEL_KEYS, MODEL_PACKS } from './model-list';

/**
 * Models in public/models (see CREDITS.md there), listed by tools/build-models.mjs: the props in a
 * few packs of those used in the same places (packs/<pack>.glb, each model a root node named by its
 * key), the animated characters in files of their own. The debug-only ones (dev-models.ts) load only
 * in `npm run dev`, when their switch is on: the production build doesn't carry them.
 *
 * Files load as they are asked for (ensure), the soonest wanted first: what the title needs before a
 * game can start (needs.ts CORE), a level's own as it is built (Renderer.buildLevel), the rest in the
 * background (stream). A model not in yet misses for assets.get as one that failed does: what asked
 * draws its stand-in (a rig drawn in code, no prop) and is made again once it comes (watch).
 */
const QUERY = typeof location !== 'undefined' ? location.search : '';
const wanted = (key: string) => !DEV_MODELS[key] || (import.meta.env.DEV && QUERY.includes(DEV_MODELS[key]));
const PACKED = new Set<string>(Object.values(MODEL_PACKS).flat());

/** how soon a file is wanted, soonest first: what a level waits on (its veil), the level the hero is on, where they can go next, the rest */
export const NOW = 0;
export const HERE = 1;
export const NEXT = 2;
export const LATER = 3;

interface Source {
  /** public/models/<file>.glb */
  file: string;
  /** the models in it */
  keys: readonly string[];
  pack: boolean;
  /** never asked for, waiting its turn, coming, between a failed try and the next, in */
  state: 'idle' | 'queued' | 'loading' | 'retry' | 'in';
  /** how soon it's wanted (NOW … LATER): the soonest it was asked for */
  prio: number;
  /** when it was asked for that soon: first come, first served */
  seq: number;
  tries: number;
  /** its quick tries all failed: what waits on it is let go, and it's tried again now and then */
  gaveUp: boolean;
  /** what waits on it coming or being given up on */
  settle: (() => void)[];
  /** while its bytes come: how to stop them, how many have come and of how many (0: not said) */
  fetch: Fetching | null;
  /** stopped to let something go first (makeWay): queued again, not a failed try */
  stopped: boolean;
}

interface Fetching {
  stop: AbortController;
  got: number;
  size: number;
}

/** files fetched at once, at most this many of them ones nothing waits on (NEXT, LATER): what a level asks for gets through */
const MAX_LOADS = 4;
const MAX_BACKGROUND = 2;
/** a try and a retry a moment later before what waits on a file is let go: a dropped request costs a whole pack */
const QUICK_TRIES = 2;
const RETRY_MS = 800;
/** then tries in the background, further and further apart up to a minute (some six minutes in all), so a file that's broken isn't fetched over and over */
const LATER_TRIES = 10;
const RETRY_MAX_MS = 60000;
/** a download that brings nothing for this long has stalled: a failed try, so nothing waits on it forever */
const STALL_MS = 15000;
/** how long a frame's share of making templates is (all the files coming share it): the rest waits for the next frame */
const SLICE_MS = 4;
/** behind a level's loading veil nothing moves to hitch: a frame's share is this much, so the veil lifts sooner */
const VEILED_SLICE_MS = 24;
/** a download stopped to make way (makeWay) has more than this share of its file to go: one nearly in finishes */
const STOP_LEFT = 0.5;
/** the bytes in that count as nearly in when the file's length isn't said */
const STOP_GOT = 512 * 1024;
/** the longest the files nothing waits on hold back for something that goes first (hold) */
const HOLD_MS = 10000;

export type ModelKey = (typeof MODEL_KEYS)[number];

export interface Template {
  gltf: GLTF;
  /** bind-pose bounds of the scene */
  size: THREE.Vector3;
  min: THREE.Vector3;
  center: THREE.Vector3;
}

const source = (file: string, keys: readonly string[], pack: boolean): Source => ({ file, keys, pack, state: 'idle', prio: LATER, seq: 0, tries: 0, gaveUp: false, settle: [], fetch: null, stopped: false });

class AssetLib {
  private templates = new Map<string, Template>();
  /** the templates' own geometries and materials, which their clones share: never disposed with a view */
  private shared = new WeakSet<object>();
  /** animation clips shared by every KayKit character (same rig) */
  kaykitClips: THREE.AnimationClip[] = [];
  private sources: Source[] = [
    ...Object.entries(MODEL_PACKS).map(([pack, keys]) => source(`packs/${pack}`, keys, true)),
    ...MODEL_KEYS.filter((k) => !PACKED.has(k) && wanted(k)).map((k) => source(k, [k], false)),
  ];
  private byKey = new Map<string, Source>(this.sources.flatMap((s) => s.keys.map((k) => [k, s] as const)));
  private loader: GLTFLoader | null = null;
  /** the meshopt decoder has its worker */
  private worker = false;
  private loads = 0;
  private backgroundLoads = 0;
  /** things the files not waited on (all but NOW) hold back for (hold) */
  private holds = 0;
  private seq = 0;
  /** the misses being noted, a set for each watch under way */
  private watching: Set<string>[] = [];
  /** model bytes fetched, for the tools */
  bytes = 0;
  /** when this frame's share of making templates began and the frame it's of; the frames drawn, and when the last was (pause) */
  private sliceStart = 0;
  private sliceFrame = -1;
  private frame = 0;
  private lastDraw = -Infinity;
  /** this frame's share: SLICE_MS, or VEILED_SLICE_MS behind the veil */
  private share = SLICE_MS;

  get(name: string): Template | undefined {
    const t = this.templates.get(name);
    if (!t && this.watching.length && this.byKey.has(name)) for (const w of this.watching) w.add(name);
    return t;
  }

  /** whether a model is in, without noting a miss */
  has(name: string): boolean {
    return this.templates.has(name);
  }

  /** whether every one of `keys` is in; those that aren't are noted as misses (watch) */
  all(keys: Iterable<string>): boolean {
    let ok = true;
    for (const k of keys) if (!this.get(k)) ok = false;
    return ok;
  }

  /** whether a model's file has been given up on for now: its stand-in stays, and it's tried again later */
  failed(name: string): boolean {
    return !!this.byKey.get(name)?.gaveUp && !this.templates.has(name);
  }

  /** whether some file of this build carries the model: one that none does never comes */
  serves(name: string): boolean {
    return this.byKey.has(name);
  }

  /** whether a model is in or given up on, or can't come at all (none of this build's): nothing to wait for */
  settled(name: string): boolean {
    const s = this.byKey.get(name);
    return !s || s.state === 'in' || s.gaveUp;
  }

  /**
   * `build` run, noting the models it asked for that aren't in yet but can come: what it made stands
   * in for them, to be made again once they are in. The misses are null when there were none
   */
  watch<T>(build: () => T): [T, Set<string> | null] {
    const missed = new Set<string>();
    this.watching.push(missed);
    try {
      return [build(), missed.size ? missed : null];
    } finally {
      this.watching.pop();
    }
  }

  /**
   * The files of `keys` loaded, before anything wanted later than `prio`: resolves once each is in or
   * given up on (QUICK_TRIES), never rejects. `progress` hears as each file settles
   */
  ensure(keys: Iterable<string>, prio = NOW, progress?: (done: number, total: number) => void): Promise<void> {
    const list = new Set<Source>();
    for (const k of keys) {
      const s = this.byKey.get(k);
      if (s && s.state !== 'in' && !s.gaveUp) list.add(s);
    }
    let done = 0;
    const waits = [...list].map((s) => {
      this.want(s, prio);
      return new Promise<void>((r) => s.settle.push(r)).then(() => progress?.(++done, list.size));
    });
    this.pump();
    return Promise.all(waits).then(() => {});
  }

  /** every file this build serves, as ensure does */
  ensureAll(prio = LATER, progress?: (done: number, total: number) => void): Promise<void> {
    return this.ensure(this.byKey.keys(), prio, progress);
  }

  /**
   * No file but those waited on (NOW) starts until `first` settles, or HOLD_MS: a level's tile
   * textures go first (Renderer.buildLevel holds before it asks for the level's models, until the
   * textures it asks for as it's built have come), so its ground shows as soon as it did before streaming
   */
  hold(first: Promise<unknown>) {
    this.holds++;
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      this.holds--;
      this.pump();
    };
    void first.then(release, release);
    setTimeout(release, HOLD_MS);
  }

  /**
   * The downloads under way that nothing waits on (not NOW) and that have most of their file to go,
   * stopped: what goes first (a level's tile textures as it's built, the files its veil waits on) has
   * the network to itself, as before models streamed. Each is queued again as it was, to start over
   * once nothing holds it back
   */
  makeWay() {
    for (const s of this.sources) {
      const f = s.fetch;
      if (!f || s.prio === NOW || s.stopped) continue;
      if (f.size ? f.size - f.got < f.size * STOP_LEFT : f.got > STOP_GOT) continue;
      s.stopped = true;
      f.stop.abort();
    }
  }

  /** every file not asked for yet queued in the background, those of `first` (keys) first, in that order */
  stream(first: Iterable<string> = []) {
    for (const k of first) {
      const s = this.byKey.get(k);
      if (s) this.want(s, LATER);
    }
    for (const s of this.sources) this.want(s, LATER);
    this.pump();
  }

  /** how the loading stands, for the tools */
  stats() {
    const count = (f: (s: Source) => boolean) => this.sources.filter(f).length;
    return {
      files: this.sources.length,
      in: count((s) => s.state === 'in'),
      coming: count((s) => s.state !== 'idle' && s.state !== 'in' && !s.gaveUp),
      failed: this.sources.filter((s) => s.gaveUp && s.state !== 'in').map((s) => s.file),
      bytes: this.bytes,
    };
  }

  /** asked for at `prio`: queued if it wasn't, sooner if it was for later */
  private want(s: Source, prio: number) {
    if (s.state === 'in') return;
    if (s.state === 'idle') s.state = 'queued';
    else if (prio >= s.prio) return;
    s.prio = prio;
    s.seq = ++this.seq;
  }

  /**
   * The soonest wanted of the queued files started, as many as may load at once; while something holds
   * the stream back or a file something waits on (NOW) is still coming, none but those: a level's veil
   * goes as soon as the network can bring what it waits on
   */
  private pump() {
    while (this.loads < MAX_LOADS) {
      let next: Source | null = null;
      for (const s of this.sources) if (s.state === 'queued' && (!next || s.prio < next.prio || (s.prio === next.prio && s.seq < next.seq))) next = s;
      if (!next) break;
      if (next.prio > NOW && (this.holds || this.awaited())) return;
      if (next.prio >= NEXT && this.backgroundLoads >= MAX_BACKGROUND) return;
      void this.run(next);
    }
    // every file in, or given up on and between tries: the decoding worker goes (a later try decodes on the main thread)
    if (this.worker && !this.loads && this.sources.every((s) => s.state === 'in' || s.gaveUp)) {
      MeshoptDecoder.useWorkers(0);
      this.worker = false;
    }
  }

  /** whether a file something waits on (NOW) is still coming: queued, under way or between its quick tries */
  private awaited(): boolean {
    return this.sources.some((s) => s.prio === NOW && s.state !== 'in' && s.state !== 'idle' && !s.gaveUp);
  }

  private async run(s: Source) {
    s.state = 'loading';
    const background = s.prio >= NEXT;
    this.loads++;
    if (background) this.backgroundLoads++;
    const ok = await this.attempt(s);
    this.loads--;
    if (background) this.backgroundLoads--;
    const stopped = s.stopped;
    s.stopped = false;
    if (ok) {
      s.state = 'in';
      s.gaveUp = false;
      this.settle(s);
    } else if (stopped) {
      // stopped to make way: queued again as it was, no try spent
      s.tries--;
      s.state = 'queued';
    } else if (s.tries < QUICK_TRIES) {
      s.state = 'retry';
      setTimeout(() => {
        s.state = 'queued';
        this.pump();
      }, RETRY_MS * s.tries);
    } else {
      // what waits on it goes on without it; it's tried again, further and further apart
      if (!s.gaveUp) console.warn('model failed', s.file, `after ${s.tries} tries: its stand-ins stay until a later try loads it`);
      s.gaveUp = true;
      s.state = 'retry';
      this.settle(s);
      if (s.tries < QUICK_TRIES + LATER_TRIES) {
        const wait = Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** (s.tries - QUICK_TRIES + 2));
        setTimeout(() => {
          s.state = 'queued';
          s.prio = LATER;
          s.seq = ++this.seq;
          this.pump();
        }, wait);
      }
    }
    this.pump();
  }

  private settle(s: Source) {
    const l = s.settle;
    s.settle = [];
    for (const f of l) f();
  }

  /** one go at a file, its models made templates; false if it failed or was stopped (makeWay), never thrown */
  private async attempt(s: Source): Promise<boolean> {
    s.tries++;
    try {
      const f: Fetching = (s.fetch = { stop: new AbortController(), got: 0, size: 0 });
      let buf: ArrayBuffer;
      try {
        buf = await fetchBytes(`${import.meta.env.BASE_URL}models/${s.file}.glb`, f);
      } finally {
        s.fetch = null;
      }
      this.bytes += buf.byteLength;
      if (!this.loader) {
        // tools/build-models.mjs writes meshopt-compressed files
        this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        this.loader.register((parser) => slicePictures(parser, () => this.pause(true)));
      }
      // decoded in a worker where there can be one
      if (!this.worker && typeof Worker !== 'undefined') {
        MeshoptDecoder.useWorkers(1);
        this.worker = true;
      }
      // parsing starts on a share of a frame of its own: what it does at once (some 10 ms for a pack on
      // a phone, its pictures aside: slicePictures) never piles onto another file's in one frame
      await this.pause(true);
      await this.add(s, await this.loader.parseAsync(buf, `${import.meta.env.BASE_URL}models/`));
      return true;
    } catch (e) {
      if (!s.stopped && s.tries >= QUICK_TRIES) console.warn('model failed', s.file, e);
      return false;
    }
  }

  /**
   * a file's models made templates: a pack's each from its root node, the scene a file of its own would
   * load as; a few at a time, with frames drawn between
   */
  private async add(s: Source, gltf: GLTF) {
    if (!s.pack) {
      if (!this.templates.has(s.keys[0])) await this.register(s.keys[0], gltf);
      return;
    }
    for (const root of [...gltf.scene.children]) {
      // GLTFLoader keeps a node's name as written there
      const key = root.userData.name;
      if (typeof key !== 'string' || !s.keys.includes(key)) {
        console.warn('model pack', s.file, 'holds', key, 'unlisted');
        continue;
      }
      if (this.templates.has(key)) continue;
      await this.pause();
      // its children in an unnamed group at the origin, as a file's scene is
      const scene = new THREE.Group();
      for (const c of [...root.children]) scene.add(c);
      ownNames(scene, gltf.parser);
      await this.register(key, { ...gltf, scene, scenes: [scene], animations: [] });
    }
    const lost = s.keys.filter((k) => !this.templates.has(k));
    if (lost.length) throw new Error(`${lost.join(' ')} not in ${s.file}`);
  }

  private async register(name: string, gltf: GLTF) {
    this.shareTextures(gltf.scene);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      this.shared.add(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) this.shared.add(mat);
    });
    gltf.scene.updateMatrixWorld(true);
    const box = await bodyBounds(gltf.scene, () => this.pause());
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
        for (const slot of TEXTURE_SLOTS) {
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

  /** whether a geometry or a material is a template's, shared by every clone of it */
  owns(x: object): boolean {
    return this.shared.has(x);
  }

  /** the renderer drew a frame (behind a loading veil: `veiled`): making templates keeps to a frame's share (pause) while it does */
  drew(veiled = false) {
    this.frame++;
    this.lastDraw = performance.now();
    this.share = veiled ? VEILED_SLICE_MS : SLICE_MS;
  }

  /**
   * Called now and then while templates are made (`task`: in a task of its own). Once this frame's
   * share (SLICE_MS, VEILED_SLICE_MS behind the veil; all the files coming share it) is spent, waits
   * until the next frame has been drawn while the game is drawing; when it isn't (at the title, on a
   * hidden page), for the next task only: there's no frame to keep, and a hidden page's timers would
   * wait a second or more
   */
  private async pause(task = false) {
    if (task) await nextTask();
    while (performance.now() - this.sliceStart >= this.share) {
      if (!this.drawing()) {
        await nextTask();
        this.sliceStart = performance.now();
        return;
      }
      await afterFrame();
      // the first back after a frame begins its share; the others back then wait for the next
      if (this.sliceFrame !== this.frame) {
        this.sliceFrame = this.frame;
        this.sliceStart = performance.now();
      }
    }
  }

  private drawing(): boolean {
    return performance.now() - this.lastDraw < 250 && typeof document !== 'undefined' && document.visibilityState === 'visible';
  }
}

/** the next task: a message to ourselves, which a hidden page doesn't hold back as it does timers (setTimeout where there's no page) */
const waiting: (() => void)[] = [];
let channel: MessageChannel | null = null;
function nextTask(): Promise<void> {
  if (typeof document === 'undefined' || typeof MessageChannel === 'undefined') return new Promise((r) => setTimeout(r, 0));
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = () => waiting.shift()?.();
  }
  const ch = channel;
  return new Promise((r) => {
    waiting.push(r);
    ch.port2.postMessage(0);
  });
}

/** once the next frame has been drawn; at once if the page is hidden meanwhile (its frames stop) */
function afterFrame(): Promise<void> {
  return new Promise((r) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      document.removeEventListener('visibilitychange', go);
      r();
    };
    document.addEventListener('visibilitychange', go);
    requestAnimationFrame(() => setTimeout(go, 0));
  });
}

/**
 * A file's pictures made one at a time, each in a task of its own and within a frame's share
 * (`pause`): each is a Blob, a URL and a fetch on the main thread, which for a pack's dozens came to
 * some 45 ms at once with the CPU four times slower (a phone). What each texture is stays three's
 */
function slicePictures(parser: GLTFParser, pause: () => Promise<void>): GLTFLoaderPlugin {
  const own = parser.loadImageSource.bind(parser);
  let turn: Promise<unknown> = Promise.resolve();
  parser.loadImageSource = (index, loader) => {
    // the next one's turn comes once this one is made, not once its picture has decoded (off the main thread)
    const made = turn.then(pause).then(() => ({ texture: own(index, loader) }));
    turn = made.catch(() => undefined);
    return made.then((m) => m.texture);
  };
  return { name: 'dii_slice_pictures' };
}

/** the material slots a model's pictures sit in */
export const TEXTURE_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap'] as const;

/** a file's bytes, counted in `f` as they come; one that comes back an error, stalls (STALL_MS without a byte) or is stopped throws */
async function fetchBytes(url: string, f: Fetching): Promise<ArrayBuffer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poke = () => {
    clearTimeout(timer);
    timer = setTimeout(() => f.stop.abort(), STALL_MS);
  };
  poke();
  try {
    const res = await fetch(url, { signal: f.stop.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    f.size = Number(res.headers.get('content-length')) || 0;
    if (!res.body) return await res.arrayBuffer();
    const parts: Uint8Array[] = [];
    let n = 0;
    const reader = res.body.getReader();
    for (;;) {
      poke();
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.byteLength;
      f.got = n;
    }
    const out = new Uint8Array(n);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.byteLength;
    }
    return out.buffer;
  } finally {
    clearTimeout(timer);
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

/**
 * bounds of the skinned body only (ignores weapons/shields parked on hand slots), vertex by vertex
 * through the bones: a few hundredths of a second for a body on a phone, so worked out a slice at a
 * time with frames drawn between (preciseBounds, `pause`)
 */
async function bodyBounds(scene: THREE.Object3D, pause: () => Promise<void>): Promise<THREE.Box3> {
  const box = new THREE.Box3();
  let skinned = false;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (skinned && !(m as THREE.SkinnedMesh).isSkinnedMesh) return;
    meshes.push(m);
  });
  for (const m of meshes) await preciseBounds(box, m, pause);
  return box;
}

const _v = new THREE.Vector3();

/** Box3.expandByObject(object, true) to the letter (the same points in the same order: the same box), pausing now and then for frames */
async function preciseBounds(box: THREE.Box3, object: THREE.Object3D, pause: () => Promise<void>) {
  object.updateWorldMatrix(false, false);
  const mesh = object as THREE.Mesh;
  const pos = mesh.geometry?.getAttribute('position');
  if (pos && !(object as THREE.InstancedMesh).isInstancedMesh) {
    for (let i = 0, l = pos.count; i < l; i++) {
      if (mesh.isMesh === true) mesh.getVertexPosition(i, _v);
      else _v.fromBufferAttribute(pos, i);
      _v.applyMatrix4(object.matrixWorld);
      box.expandByPoint(_v);
      if ((i & 511) === 511) await pause();
    }
  } else if (mesh.geometry) box.expandByObject(object, true);
  for (const c of object.children) await preciseBounds(box, c, pause);
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
