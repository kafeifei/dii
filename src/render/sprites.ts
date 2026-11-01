import * as THREE from 'three';

/**
 * The effect pictures in public/fx (tools/fx-sheets.mjs, which keeps these grids): CC0 flipbooks
 * from Unity Labs' fluid sims and Kenney's particle sprites. Each is premultiplied; `own` keeps its
 * coverage in its alpha (smoke that darkens what's behind), the rest take it from their brightness.
 */
export const SHEETS = {
  fireball: { cols: 8, rows: 8, frames: 64, own: false },
  flame: { cols: 16, rows: 4, frames: 64, own: false },
  blaze: { cols: 16, rows: 4, frames: 64, own: false },
  explosion: { cols: 5, rows: 5, frames: 25, own: true },
  smoke: { cols: 8, rows: 8, frames: 64, own: true },
  sprites: { cols: 5, rows: 4, frames: 20, own: false },
  bolts: { cols: 4, rows: 1, frames: 4, own: false },
  ground: { cols: 4, rows: 2, frames: 8, own: false },
} as const;
export type SheetName = keyof typeof SHEETS;

/** the tiles of the sprites sheet */
export const SPRITE = {
  dot: 0,
  star: 1,
  starBurst: 2,
  crackle: 3, // 3–6: four patches of crackling lightning
  glint: 7, // a sharp four-pointed star
  puff: 8,
  cross: 9, // a ring crossed by four points
  shine: 10, // a six-rayed star round a small ring
  sweep: 11, // a wide arc bowed up
  debris: 12, // bits flung about
  thinRing: 13,
  beam: 14, // a soft bar standing up
  halo: 15, // a star in a ring
  sparkle: 16, // a soft four-pointed star
  arc: 17, // a swish round most of a circle
  orb: 18,
} as const;

/** the tiles of the ground sheet */
export const GROUND = { glow: 0, swirl: 1, ring: 2, scorch: 3, glow2: 4, swirl2: 5, softRing: 6, smokeRing: 7 } as const;

/** the forks of the bolts sheet, drawn stretched between two points (SpriteOpts.to) */
export const BOLT = { fork: 0, tangle: 1, thread: 2, wisp: 3 } as const;

/**
 * How a sprite is turned: to the camera, standing up on the ground and turned to it, lying on the
 * ground, or (a sprite with `to`) stretched between two points and turned about that line to the camera
 */
export type Face = 'cam' | 'up' | 'flat' | 'beam';
const FACE: Record<Face, number> = { cam: 0, up: 1, flat: 2, beam: 3 };

export interface SpriteOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** width in metres */
  size: number;
  /** height over width (1) */
  aspect?: number;
  /** size multiplier at the end of its life (1) */
  endSize?: number;
  /** seconds; a sprite drawn for one frame only (draw) needs none */
  life?: number;
  color?: THREE.Color | string;
  /** brightness: colour × this, past 1 to bloom (1) */
  glow?: number;
  alpha?: number;
  /** 1 adds its light (fire, sparks), 0 covers what's behind (smoke), between is both (1) */
  add?: number;
  /** the frame or tile it starts on (0) */
  frame?: number;
  /** frames a second through the flipbook; 0 holds `frame` (0) */
  fps?: number;
  /** a flipbook that comes round again rather than stopping on its last frame (true) */
  loop?: boolean;
  /** turned in its plane, radians, and turning per second */
  rot?: number;
  spin?: number;
  face?: Face;
  gravity?: number;
  drag?: number;
  /** share of its life spent fading in (0) and out (0.4) */
  fadeIn?: number;
  fadeOut?: number;
  /** the far end of a beam, which runs from x, y, z to it, `size` wide (its face is then 'beam') */
  to?: { x: number; y: number; z: number };
}

const tmp = new THREE.Color();
const loader = new THREE.TextureLoader();
const textures = new Map<SheetName, THREE.Texture>();

/** the sheet's picture, loading from public/fx the first time it's asked for */
function sheetTexture(name: SheetName, ready: () => void): THREE.Texture {
  let t = textures.get(name);
  if (!t) {
    t = loader.load(`${import.meta.env.BASE_URL}fx/${name}.webp`, ready);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.set(name, t);
  }
  return t;
}

/** per sprite: pos 3, vel 3, colour 3, alpha, size, aspect, endSize, life, maxLife, frame, fps, loop, rot, spin, age, gravity, drag, fadeIn, add, face, axis 3, fadeOut */
const STRIDE = 30;

/** a beam's middle, axis and length over its width into `out` (its pos, axis and aspect) */
function beam(o: SpriteOpts, out: number[]) {
  const t = o.to!;
  const dx = t.x - o.x;
  const dy = t.y - o.y;
  const dz = t.z - o.z;
  const l = Math.hypot(dx, dy, dz) || 1e-3;
  out[0] = (o.x + t.x) / 2;
  out[1] = (o.y + t.y) / 2;
  out[2] = (o.z + t.z) / 2;
  out[3] = dx / l;
  out[4] = dy / l;
  out[5] = dz / l;
  out[6] = l / o.size;
}
const bm = [0, 0, 0, 0, 1, 0, 1];

/**
 * Billboards off one sheet, drawn in one instanced call: sprites that live and move on their own
 * (spawn), and ones the renderer puts down for this frame only (draw: a bolt's ball of fire where
 * the bolt is). Nothing shows till the sheet has loaded.
 */
export class SpriteBatch {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  /** share of spawns kept (the particle-effects setting) */
  density = 1;
  private sheet: (typeof SHEETS)[SheetName];
  private max: number;
  private count = 0;
  private s: Float32Array;
  private now: SpriteOpts[] = [];
  private a: THREE.InstancedBufferAttribute;
  private b: THREE.InstancedBufferAttribute;
  private c: THREE.InstancedBufferAttribute;
  private d: THREE.InstancedBufferAttribute;

  constructor(
    private name: SheetName,
    max: number,
  ) {
    this.sheet = SHEETS[name];
    this.max = max;
    this.s = new Float32Array(max * STRIDE);
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    // pos and turn; width, height, frame, face; premultiplied colour and how much it covers; a beam's axis
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.c = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.d = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', this.a);
    geo.setAttribute('iB', this.b);
    geo.setAttribute('iC', this.c);
    geo.setAttribute('iD', this.d);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null }, uGrid: { value: new THREE.Vector2(this.sheet.cols, this.sheet.rows) } },
      defines: this.sheet.own ? { OWN_ALPHA: 1 } : {},
      vertexShader: /* glsl */ `
        attribute vec4 iA;
        attribute vec4 iB;
        attribute vec4 iC;
        attribute vec3 iD;
        uniform vec2 uGrid;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          float c = cos(iA.w), s = sin(iA.w);
          vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iB.xy;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          if (iB.w > 2.5) { up = iD; right = normalize(cross(iD, vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))); }
          else if (iB.w > 1.5) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, -1.0); }
          else if (iB.w > 0.5) { right = normalize(vec3(right.x, 0.0, right.z)); up = vec3(0.0, 1.0, 0.0); }
          gl_Position = projectionMatrix * viewMatrix * vec4(iA.xyz + right * q.x + up * q.y, 1.0);
          float f = floor(iB.z + 0.5);
          float col = mod(f, uGrid.x);
          float row = floor(f / uGrid.x);
          vUv = vec2((col + position.x + 0.5) / uGrid.x, (uGrid.y - 1.0 - row + position.y + 0.5) / uGrid.y);
          vCol = iC;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          #ifdef OWN_ALPHA
          float a = t.a;
          #else
          float a = max(t.r, max(t.g, t.b));
          #endif
          if (a < 0.004) discard;
          // premultiplied: the colour adds, the alpha covers (vCol.a is how much it covers, 0 for pure light)
          gl_FragColor = vec4(t.rgb * vCol.rgb, a * vCol.a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = this.sheet.own ? 18 : 21;
  }

  /** its sheet asked for (once a level is built: not in the way of the title's models); it shows once that has come */
  load() {
    const u = this.mesh.material.uniforms.uMap;
    if (!u.value) u.value = sheetTexture(this.name, () => (this.mesh.visible = true));
  }

  spawn(o: SpriteOpts) {
    if (this.count >= this.max || (this.density < 1 && Math.random() > this.density)) return;
    const i = this.count++;
    const s = this.s;
    const k = i * STRIDE;
    if (o.to) beam(o, bm);
    s[k] = o.to ? bm[0] : o.x;
    s[k + 1] = o.to ? bm[1] : o.y;
    s[k + 2] = o.to ? bm[2] : o.z;
    s[k + 3] = o.vx ?? 0;
    s[k + 4] = o.vy ?? 0;
    s[k + 5] = o.vz ?? 0;
    const col = o.color === undefined ? tmp.setRGB(1, 1, 1) : typeof o.color === 'string' ? tmp.set(o.color) : tmp.copy(o.color);
    const g = o.glow ?? 1;
    s[k + 6] = col.r * g;
    s[k + 7] = col.g * g;
    s[k + 8] = col.b * g;
    s[k + 9] = o.alpha ?? 1;
    s[k + 10] = o.size;
    s[k + 11] = o.to ? bm[6] : (o.aspect ?? 1);
    s[k + 12] = o.endSize ?? 1;
    s[k + 13] = o.life ?? 0;
    s[k + 14] = o.life ?? 0;
    s[k + 15] = o.frame ?? 0;
    s[k + 16] = o.fps ?? 0;
    s[k + 17] = o.loop === false ? 0 : 1;
    s[k + 18] = o.rot ?? 0;
    s[k + 19] = o.spin ?? 0;
    s[k + 20] = 0;
    s[k + 21] = o.gravity ?? 0;
    s[k + 22] = o.drag ?? 0;
    s[k + 23] = o.fadeIn ?? 0;
    s[k + 24] = o.add ?? 1;
    s[k + 25] = o.to ? FACE.beam : FACE[o.face ?? 'cam'];
    s[k + 26] = o.to ? bm[3] : 0;
    s[k + 27] = o.to ? bm[4] : 1;
    s[k + 28] = o.to ? bm[5] : 0;
    s[k + 29] = o.fadeOut ?? 0.4;
  }

  /** a sprite for this frame only */
  draw(o: SpriteOpts) {
    this.now.push(o);
  }

  clear() {
    this.count = 0;
    this.now.length = 0;
    this.mesh.geometry.instanceCount = 0;
  }

  update(dt: number) {
    const s = this.s;
    const frames = this.sheet.frames;
    let i = 0;
    while (i < this.count) {
      const k = i * STRIDE;
      s[k + 13] -= dt;
      if (s[k + 13] <= 0) {
        const last = --this.count;
        if (i !== last) s.copyWithin(k, last * STRIDE, last * STRIDE + STRIDE);
        continue;
      }
      const dr = Math.exp(-s[k + 22] * dt);
      s[k + 3] *= dr;
      s[k + 4] = s[k + 4] * dr - s[k + 21] * dt;
      s[k + 5] *= dr;
      s[k] += s[k + 3] * dt;
      s[k + 1] += s[k + 4] * dt;
      s[k + 2] += s[k + 5] * dt;
      s[k + 18] += s[k + 19] * dt;
      s[k + 20] += dt;
      i++;
    }
    const n = Math.min(this.max, this.count + this.now.length);
    const A = this.a.array as Float32Array;
    const B = this.b.array as Float32Array;
    const C = this.c.array as Float32Array;
    const D = this.d.array as Float32Array;
    for (let j = 0; j < this.count; j++) {
      const k = j * STRIDE;
      const t = s[k + 13] / s[k + 14]; // 1 → 0
      const age = s[k + 20];
      const fi = s[k + 23];
      const fo = s[k + 29];
      const alpha = s[k + 9] * (fo > 0 ? Math.min(1, t / fo) : 1) * (fi > 0 ? Math.min(1, (1 - t) / fi) : 1);
      const size = s[k + 10] * (s[k + 12] + (1 - s[k + 12]) * t);
      let f = s[k + 15] + age * s[k + 16];
      f = s[k + 17] ? f % frames : Math.min(frames - 1, f);
      this.put(A, B, C, j, s[k], s[k + 1], s[k + 2], s[k + 18], size, size * s[k + 11], f, s[k + 25], s[k + 6] * alpha, s[k + 7] * alpha, s[k + 8] * alpha, alpha * (1 - s[k + 24]));
      D[j * 3] = s[k + 26];
      D[j * 3 + 1] = s[k + 27];
      D[j * 3 + 2] = s[k + 28];
    }
    for (let j = this.count; j < n; j++) {
      const o = this.now[j - this.count];
      const col = o.color === undefined ? tmp.setRGB(1, 1, 1) : typeof o.color === 'string' ? tmp.set(o.color) : tmp.copy(o.color);
      const al = (o.alpha ?? 1) * (o.glow ?? 1);
      const f = (o.frame ?? 0) % frames;
      if (o.to) beam(o, bm);
      const [x, y, z] = o.to ? bm : [o.x, o.y, o.z];
      this.put(A, B, C, j, x, y, z, o.rot ?? 0, o.size, o.size * (o.to ? bm[6] : (o.aspect ?? 1)), f, o.to ? FACE.beam : FACE[o.face ?? 'cam'], col.r * al, col.g * al, col.b * al, (o.alpha ?? 1) * (1 - (o.add ?? 1)));
      D[j * 3] = o.to ? bm[3] : 0;
      D[j * 3 + 1] = o.to ? bm[4] : 1;
      D[j * 3 + 2] = o.to ? bm[5] : 0;
    }
    this.now.length = 0;
    this.mesh.geometry.instanceCount = n;
    this.a.needsUpdate = this.b.needsUpdate = this.c.needsUpdate = this.d.needsUpdate = true;
    this.a.addUpdateRange(0, n * 4);
    this.b.addUpdateRange(0, n * 4);
    this.c.addUpdateRange(0, n * 4);
    this.d.addUpdateRange(0, n * 3);
  }

  private put(A: Float32Array, B: Float32Array, C: Float32Array, j: number, x: number, y: number, z: number, rot: number, w: number, h: number, f: number, face: number, r: number, g: number, b: number, cover: number) {
    const q = j * 4;
    A[q] = x;
    A[q + 1] = y;
    A[q + 2] = z;
    A[q + 3] = rot;
    B[q] = w;
    B[q + 1] = h;
    B[q + 2] = Math.floor(f);
    B[q + 3] = face;
    C[q] = r;
    C[q + 1] = g;
    C[q + 2] = b;
    C[q + 3] = cover;
  }
}
