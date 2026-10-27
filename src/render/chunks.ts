import * as THREE from 'three';

/**
 * Static scenery is built in chunks this many tiles square, and only the chunks a view reaches are
 * in the scene (plan B 无缝大地图要解决的问题: walls in 16-tile chunks, culled to the view)
 */
export const CHUNK = 16;

/** what sees the scenery in a frame: the camera, and the lights casting shadows */
export interface Viewers {
  /** the camera's view */
  main: THREE.Frustum;
  /** the sun's (or the moon's) shadow camera, when it casts */
  sun: THREE.Frustum | null;
  /** the way its light goes (unit, downward), with `sun` */
  sunDir: THREE.Vector3;
  /** a light casting shadows all round, as far as it reaches */
  lamp: THREE.Sphere | null;
}

/** a box against a view: wholly outside, partly in, wholly inside */
export const OUT = 0;
export const PART = 1;
export const IN = 2;

/** where box (x0..x1, y0..y1, z0..z1), grown by `m` all round, is against frustum `f` */
export function boxInFrustum(f: THREE.Frustum, b: ArrayLike<number>, m = 0): number {
  const x0 = b[0] - m;
  const y0 = b[1] - m;
  const z0 = b[2] - m;
  const x1 = b[3] + m;
  const y1 = b[4] + m;
  const z1 = b[5] + m;
  let side = IN;
  for (const pl of f.planes) {
    const n = pl.normal;
    // the corner furthest along the plane's normal (inward), then the nearest
    const far = n.x * (n.x > 0 ? x1 : x0) + n.y * (n.y > 0 ? y1 : y0) + n.z * (n.z > 0 ? z1 : z0) + pl.constant;
    if (far < 0) return OUT;
    const near = n.x * (n.x > 0 ? x0 : x1) + n.y * (n.y > 0 ? y0 : y1) + n.z * (n.z > 0 ? z0 : z1) + pl.constant;
    if (near < 0) side = PART;
  }
  return side;
}

/** where the box, grown by `m`, is against sphere `s` */
export function boxInSphere(s: THREE.Sphere, b: ArrayLike<number>, m = 0): number {
  const c = s.center;
  const r = s.radius + m;
  let near = 0;
  let far = 0;
  for (let k = 0; k < 3; k++) {
    const v = k === 0 ? c.x : k === 1 ? c.y : c.z;
    const lo = b[k] - m;
    const hi = b[k + 3] + m;
    const dn = v < lo ? lo - v : v > hi ? v - hi : 0;
    const df = Math.max(Math.abs(v - lo), Math.abs(v - hi));
    near += dn * dn;
    far += df * df;
  }
  if (near > r * r) return OUT;
  return far <= r * r ? IN : PART;
}

/** whether sphere (x, y, z, r) is at least partly in frustum `f` */
export function sphereInFrustum(f: THREE.Frustum, x: number, y: number, z: number, r: number): boolean {
  for (const pl of f.planes) if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -r) return false;
  return true;
}

/** how much further a shadow is looked for than a body reaches: the shadow map's soft edge */
const PENUMBRA = 0.5;

/**
 * Whether sphere (x, y, z, r) can throw a shadow into frustum `f` (the camera's) by light going
 * `d`: whether the ray from it along `d`, down to the ground (what stands on it takes the shadow),
 * passes through the view. What casts only outside the view needn't be drawn into the shadow map.
 */
export function shadowInView(f: THREE.Frustum, d: THREE.Vector3, x: number, y: number, z: number, r: number): boolean {
  r += PENUMBRA;
  let s0 = 0;
  let s1 = d.y < -1e-6 ? (y + r) / -d.y : 1e4;
  for (const pl of f.planes) {
    const n = pl.normal;
    // inside where n·p + constant ≥ -r; along the ray that is b + a·s
    const a = n.x * d.x + n.y * d.y + n.z * d.z;
    const b = n.x * x + n.y * y + n.z * z + pl.constant + r;
    if (Math.abs(a) < 1e-9) {
      if (b < 0) return false;
      continue;
    }
    const s = -b / a;
    if (a > 0) s0 = Math.max(s0, s);
    else s1 = Math.min(s1, s);
    if (s0 > s1) return false;
  }
  return true;
}

/**
 * Where a box is against the shadows that matter: those the shadow cameras draw and that can fall
 * in the view. `main` is where it is against the view: one wholly in view and in the sun's camera
 * casts wholly; otherwise its shadows are looked for one by one
 */
function boxInShadows(v: Viewers, b: ArrayLike<number>, main: number, m = 0): number {
  let side = OUT;
  if (v.sun) {
    const sun = boxInFrustum(v.sun, b, m);
    const cx = (b[0] + b[3]) / 2;
    const cy = (b[1] + b[4]) / 2;
    const cz = (b[2] + b[5]) / 2;
    const r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 + m;
    if (sun !== OUT && shadowInView(v.main, v.sunDir, cx, cy, cz, r)) side = sun === IN && main === IN ? IN : PART;
  }
  if (side === IN || !v.lamp) return side;
  return Math.max(side, boxInSphere(v.lamp, b, m));
}

/** whether a body (sphere x, y, z, r) throws a shadow that matters (boxInShadows) */
export function sphereInShadows(v: Viewers, x: number, y: number, z: number, r: number): boolean {
  if (v.sun && sphereInFrustum(v.sun, x, y, z, r) && shadowInView(v.main, v.sunDir, x, y, z, r)) return true;
  if (!v.lamp) return false;
  const c = v.lamp.center;
  const d = v.lamp.radius + r;
  return (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 <= d * d;
}

/** the shadow passes' depth materials by kind of mesh (ownDepth) */
const depthByKind = new Map<string, [THREE.MeshDepthMaterial, THREE.MeshDistanceMaterial]>();

/**
 * A caster's depth materials for the shadow passes, one pair for each kind of mesh: skinned,
 * instanced, instanced with colours. Left to itself three draws every caster with one depth
 * material, and handing that from a skinned monster to an instanced prop and back looks its shader
 * up anew each time (WebGLRenderer.setProgram, needsProgramChange): a quarter of a millisecond a
 * frame in Blood Moor. Plain meshes keep three's own, which then only they use; a cut-out material
 * (alpha test) already gets one of its own from three, which a custom one would bypass.
 */
export function ownDepth(mesh: THREE.Mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (mats.some((m) => m.alphaTest > 0 || m.alphaToCoverage || (m as THREE.MeshStandardMaterial).displacementMap)) return;
  const im = mesh as THREE.InstancedMesh;
  const kind = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? 'skinned' : im.isInstancedMesh ? (im.instanceColor ? 'instanced, coloured' : 'instanced') : null;
  if (!kind) return;
  let pair = depthByKind.get(kind);
  if (!pair) depthByKind.set(kind, (pair = [new THREE.MeshDepthMaterial(), new THREE.MeshDistanceMaterial()]));
  mesh.customDepthMaterial = pair[0];
  mesh.customDistanceMaterial = pair[1];
}

/** an empty box, x0 y0 z0 x1 y1 z1 */
const emptyBox = () => new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);

function growBox(b: Float64Array, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  b[0] = Math.min(b[0], x0);
  b[1] = Math.min(b[1], y0);
  b[2] = Math.min(b[2], z0);
  b[3] = Math.max(b[3], x1);
  b[4] = Math.max(b[4], y1);
  b[5] = Math.max(b[5], z1);
}

/** a light standing in the scenery, for the renderer's pools of point lights */
export interface StaticLight {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  flicker: number;
  distance: number;
}

/** one chunk of the scenery */
export interface Chunk {
  readonly cx: number;
  readonly cz: number;
  /** its walls, torches, decor…, in the scene only while a view reaches it */
  readonly group: THREE.Group;
  readonly lights: StaticLight[];
  /** glows that flicker */
  readonly flames: THREE.Sprite[];
  /** where torch flames throw sparks */
  readonly spots: THREE.Vector3[];
  /** what it holds, x0 y0 z0 x1 y1 z1 (finish) */
  box: Float64Array;
  /** in the scene */
  attached: boolean;
  /** in the camera's view (or nearly) */
  inView: boolean;
}

/** how far a light may stand from the thing it is in the chunk of */
const LIGHT_SLACK = 2;

/** margins (m) a chunk is shown at and hidden at: apart, so one on the edge of the view doesn't flap */
const SHOW_MARGIN = 1;
const HIDE_MARGIN = 4;

/**
 * A level's static scenery by 16-tile chunk: walls, pillars, floor tiles, torches and decor, each
 * placed in the chunk it stands in. A chunk is put in the scene only while the camera or a shadow-
 * casting light reaches it, so a big map costs the scene graph, the culling and the lights no more
 * than the bit around the hero. Its things are static: their matrices are made once (finish).
 */
export class Scenery {
  readonly group = new THREE.Group();
  readonly cols: number;
  readonly rows: number;
  private chunks: (Chunk | undefined)[];
  private list: Chunk[] = [];
  private shown: Chunk[] = [];

  constructor(w: number, h: number) {
    this.cols = Math.max(1, Math.ceil(w / CHUNK));
    this.rows = Math.max(1, Math.ceil(h / CHUNK));
    this.chunks = new Array(this.cols * this.rows);
  }

  /** the chunk a point is in (made on first asking); off the map, the nearest */
  at(x: number, z: number): Chunk {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CHUNK)));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor(z / CHUNK)));
    const i = cz * this.cols + cx;
    let c = this.chunks[i];
    if (!c) {
      c = { cx, cz, group: new THREE.Group(), lights: [], flames: [], spots: [], box: emptyBox(), attached: false, inView: false };
      this.chunks[i] = c;
      this.list.push(c);
    }
    return c;
  }

  /** `obj` (placed in world space) into the chunk at x, z */
  add(obj: THREE.Object3D, x: number, z: number): Chunk {
    const c = this.at(x, z);
    c.group.add(obj);
    return c;
  }

  /** every chunk made */
  get all(): readonly Chunk[] {
    return this.list;
  }

  /**
   * Done adding: matrices made once (the flames, which flicker, keep theirs live) and each chunk's
   * box measured from what it holds and the lights in it
   */
  finish() {
    const box = new THREE.Box3();
    for (const c of this.list) {
      const flames = new Set<THREE.Object3D>(c.flames);
      c.group.updateMatrixWorld(true);
      c.group.traverse((o) => {
        if (o === c.group || flames.has(o)) return;
        o.updateMatrix();
        o.matrixAutoUpdate = false;
      });
      c.group.matrixAutoUpdate = false;
      box.setFromObject(c.group);
      c.box = emptyBox();
      if (!box.isEmpty()) growBox(c.box, box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z);
      // its lights and spark spots count too; a chunk of nothing at all is its square of ground
      for (const l of c.lights) growBox(c.box, l.pos.x, l.pos.y, l.pos.z, l.pos.x, l.pos.y, l.pos.z);
      for (const s of c.spots) growBox(c.box, s.x, s.y, s.z, s.x, s.y, s.z);
      if (c.box[3] < c.box[0]) growBox(c.box, c.cx * CHUNK, 0, c.cz * CHUNK, (c.cx + 1) * CHUNK, 0, (c.cz + 1) * CHUNK);
    }
  }

  /** the chunks a view reaches into the scene, the rest out of it (with a margin, so none flaps) */
  update(v: Viewers) {
    this.shown.length = 0;
    for (const c of this.list) {
      const m = c.attached ? HIDE_MARGIN : SHOW_MARGIN;
      const main = boxInFrustum(v.main, c.box, m);
      const show = main !== OUT || boxInShadows(v, c.box, main, m) !== OUT;
      c.inView = main !== OUT;
      if (show !== c.attached) {
        c.attached = show;
        if (show) this.group.add(c.group);
        else this.group.remove(c.group);
      }
      if (show) this.shown.push(c);
    }
  }

  /** the chunks in the scene this frame */
  get visible(): readonly Chunk[] {
    return this.shown;
  }

  /** each light standing within `r` of x, z (the chunks round it, not the whole map) */
  lightsNear(x: number, z: number, r: number, fn: (l: StaticLight) => void) {
    // a light sits a little off what holds it (a torch's out from its wall): look a little further
    const pad = r + LIGHT_SLACK;
    const x0 = Math.max(0, Math.floor((x - pad) / CHUNK));
    const x1 = Math.min(this.cols - 1, Math.floor((x + pad) / CHUNK));
    const z0 = Math.max(0, Math.floor((z - pad) / CHUNK));
    const z1 = Math.min(this.rows - 1, Math.floor((z + pad) / CHUNK));
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.chunks[cz * this.cols + cx];
        if (!c) continue;
        for (const l of c.lights) if ((l.pos.x - x) ** 2 + (l.pos.z - z) ** 2 < r * r) fn(l);
      }
    }
  }

  /** every chunk out of the scene and its own GPU buffers freed (prop and template geometry is shared) */
  dispose() {
    for (const c of this.list) {
      c.group.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (!m.isInstancedMesh) return;
        if (!m.userData.sharedGeometry) m.geometry.dispose();
        m.dispose();
      });
      c.group.removeFromParent();
    }
    this.list = [];
    this.shown = [];
    this.chunks = [];
    this.group.removeFromParent();
  }
}

/** one mesh of a prop model, drawn for all its instances on the map */
interface Part {
  /** drawn in the view: the instances in it */
  view: THREE.InstancedMesh;
  /** drawn only into the shadow maps: the instances whose shadows can fall in view (none for an unlit part) */
  shadow: THREE.InstancedMesh | null;
  /** every instance's matrix, chunk after chunk */
  mats: Float32Array;
  /** every instance's bounding sphere, x y z r */
  spheres: Float32Array;
  /** filled this cull */
  nView: number;
  nShadow: number;
}

/** a part's instances in one chunk */
interface Run {
  part: Part;
  start: number;
  count: number;
  box: Float64Array;
}

interface PropChunk {
  box: Float64Array;
  runs: Run[];
}

/** one prop model's meshes, as the renderer has them ready to draw */
export interface PropPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  /** the mesh's place in the model */
  matrix: THREE.Matrix4;
  /** it is opaque and lit: it casts and receives shadows */
  lit: boolean;
}

/**
 * The level's props (trees, rocks, furniture, houses) drawn a model at a time, culled one by one:
 * each frame, of the 16-tile chunks the views reach, the instances the camera sees are copied into
 * the part's view mesh, and those whose shadows can fall in view into its shadow mesh, which draws
 * into the shadow maps only. A third or so of a chunk's trees are in view at a time, and the sun's
 * camera takes in four times the view, so this draws about a third of the triangles batching by
 * chunk did, in a draw or two for each model.
 */
export class PropBatches {
  readonly group = new THREE.Group();
  private byKey = new Map<string, THREE.Matrix4[]>();
  private parts: Part[] = [];
  private cells: PropChunk[] = [];
  /** the views last culled for, to skip a frame where nothing moved */
  private last = new Float64Array(64);

  /** `shadowFrusta`: the lights' shadow-camera frusta (LightShadow.getFrustum), the only ones a shadow mesh draws for */
  constructor(private shadowFrusta: THREE.Frustum[]) {}

  /** an instance of model `key` placed by `m` (the model's own space to the world) */
  add(key: string, m: THREE.Matrix4) {
    let l = this.byKey.get(key);
    if (!l) this.byKey.set(key, (l = []));
    l.push(m);
  }

  /** done adding: the meshes made, `parts` giving each model's (null for one not loaded) */
  build(parts: (key: string) => PropPart[] | null) {
    const chunkOf = (m: THREE.Matrix4) => `${Math.floor(m.elements[12] / CHUNK)},${Math.floor(m.elements[14] / CHUNK)}`;
    const cells = new Map<string, PropChunk>();
    const tmp = new THREE.Matrix4();
    const c = new THREE.Vector3();
    const shadowOnly = this.shadowFrusta;
    for (const [key, all] of this.byKey) {
      const pp = parts(key);
      if (!pp) continue;
      // chunk by chunk, so each chunk's instances are a run
      const order = all.map((m) => ({ m, k: chunkOf(m) })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
      for (const pd of pp) {
        const n = order.length;
        if (!pd.geometry.boundingSphere) pd.geometry.computeBoundingSphere();
        const gs = pd.geometry.boundingSphere!;
        const mats = new Float32Array(n * 16);
        const spheres = new Float32Array(n * 4);
        order.forEach(({ m }, i) => {
          tmp.multiplyMatrices(m, pd.matrix);
          tmp.toArray(mats, i * 16);
          c.copy(gs.center).applyMatrix4(tmp);
          spheres.set([c.x, c.y, c.z, gs.radius * tmp.getMaxScaleOnAxis()], i * 4);
        });
        const make = () => {
          const im = new THREE.InstancedMesh(pd.geometry, pd.material, n);
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.count = 0;
          im.visible = false;
          im.userData.sharedGeometry = true;
          im.matrixAutoUpdate = false;
          this.group.add(im);
          return im;
        };
        const view = make();
        // culled here, instance by instance
        view.frustumCulled = false;
        view.castShadow = false;
        view.receiveShadow = pd.lit;
        let shadow: THREE.InstancedMesh | null = null;
        if (pd.lit) {
          shadow = make();
          shadow.castShadow = true;
          shadow.receiveShadow = false;
          ownDepth(shadow);
          // never in the camera's view: only the shadow cameras' frusta let it draw
          shadow.intersectsFrustum = (f: THREE.Frustum) => shadowOnly.includes(f);
        }
        const part: Part = { view, shadow, mats, spheres, nView: 0, nShadow: 0 };
        this.parts.push(part);
        let i = 0;
        while (i < n) {
          const k = order[i].k;
          let j = i;
          const box = emptyBox();
          while (j < n && order[j].k === k) {
            const [x, y, z, r] = spheres.subarray(j * 4, j * 4 + 4);
            growBox(box, x - r, y - r, z - r, x + r, y + r, z + r);
            j++;
          }
          let cell = cells.get(k);
          if (!cell) cells.set(k, (cell = { box: emptyBox(), runs: [] }));
          growBox(cell.box, box[0], box[1], box[2], box[3], box[4], box[5]);
          cell.runs.push({ part, start: i, count: j - i, box });
          i = j;
        }
      }
    }
    this.cells = [...cells.values()];
    this.byKey.clear();
    this.last.fill(NaN);
  }

  /** the instances each view sees, into the meshes that draw them (skipped when no view moved) */
  cull(v: Viewers) {
    if (!this.changed(v)) return;
    for (const p of this.parts) p.nView = p.nShadow = 0;
    for (const cell of this.cells) {
      const main = boxInFrustum(v.main, cell.box);
      const shade = boxInShadows(v, cell.box, main);
      if (main === OUT && shade === OUT) continue;
      for (const run of cell.runs) {
        const p = run.part;
        const rm = main === PART ? boxInFrustum(v.main, run.box) : main;
        if (rm !== OUT) p.nView = this.copy(p.view, p.nView, run, rm === IN ? null : v, false);
        if (!p.shadow) continue;
        const rs = shade === PART ? boxInShadows(v, run.box, rm) : shade;
        if (rs !== OUT) p.nShadow = this.copy(p.shadow, p.nShadow, run, rs === IN ? null : v, true);
      }
    }
    for (const p of this.parts) {
      this.done(p.view, p.nView);
      if (p.shadow) this.done(p.shadow, p.nShadow);
    }
  }

  /**
   * The run's instances into `im` from slot `at`: all of them, or with `v` those whose spheres the
   * camera (or the shadow cameras, `shadow`) sees. The slots filled after
   */
  private copy(im: THREE.InstancedMesh, at: number, run: Run, v: Viewers | null, shadow: boolean): number {
    const p = run.part;
    const dst = im.instanceMatrix.array as Float32Array;
    if (!v) {
      dst.set(p.mats.subarray(run.start * 16, (run.start + run.count) * 16), at * 16);
      return at + run.count;
    }
    const s = p.spheres;
    const src = p.mats;
    for (let i = run.start; i < run.start + run.count; i++) {
      const x = s[i * 4];
      const y = s[i * 4 + 1];
      const z = s[i * 4 + 2];
      const r = s[i * 4 + 3];
      if (!(shadow ? sphereInShadows(v, x, y, z, r) : sphereInFrustum(v.main, x, y, z, r))) continue;
      const o = at * 16;
      const f = i * 16;
      for (let k = 0; k < 16; k++) dst[o + k] = src[f + k];
      at++;
    }
    return at;
  }

  private done(im: THREE.InstancedMesh, n: number) {
    im.count = n;
    im.visible = n > 0;
    if (!n) return;
    const a = im.instanceMatrix;
    a.clearUpdateRanges();
    a.addUpdateRange(0, n * 16);
    a.needsUpdate = true;
  }

  /** whether a view moved since the last cull (and it is remembered) */
  private changed(v: Viewers): boolean {
    const L = this.last;
    let i = 0;
    let moved = false;
    const put = (x: number) => {
      const was = L[i];
      // NaN stands for a view that isn't there: the same as another NaN
      if (was !== x && !(Number.isNaN(was) && Number.isNaN(x))) moved = true;
      L[i++] = x;
    };
    for (const f of [v.main, v.sun]) {
      for (let k = 0; k < 6; k++) {
        const pl = f?.planes[k];
        put(pl ? pl.normal.x : NaN);
        put(pl ? pl.normal.y : NaN);
        put(pl ? pl.normal.z : NaN);
        put(pl ? pl.constant : NaN);
      }
    }
    put(v.sun ? v.sunDir.x : NaN);
    put(v.sun ? v.sunDir.y : NaN);
    put(v.sun ? v.sunDir.z : NaN);
    put(v.lamp ? v.lamp.center.x : NaN);
    put(v.lamp ? v.lamp.center.y : NaN);
    put(v.lamp ? v.lamp.center.z : NaN);
    put(v.lamp ? v.lamp.radius : NaN);
    return moved;
  }

  /** how many instances each view draws now, for the tools */
  get drawn(): { view: number; shadow: number } {
    let view = 0;
    let shadow = 0;
    for (const p of this.parts) {
      view += p.nView;
      shadow += p.nShadow;
    }
    return { view, shadow };
  }

  /** the meshes' GPU buffers freed (the geometry is the model templates', kept) */
  dispose() {
    for (const p of this.parts) {
      p.view.dispose();
      p.shadow?.dispose();
    }
    this.parts = [];
    this.cells = [];
    this.group.clear();
    this.group.removeFromParent();
  }
}
