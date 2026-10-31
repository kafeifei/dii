import * as THREE from 'three';

/**
 * The effect pictures in public/fx (tools/fx-sheets.mjs, which keeps these grids): CC0 flipbooks
 * from Unity Labs' fluid sims and Kenney's particle sprites. Each is premultiplied; `own` keeps its
 * coverage in its alpha (smoke that darkens what's behind), the rest take it from their brightness.
 */
export const SHEETS = {
  fireball: { cols: 8, rows: 8, frames: 64, own: false },
  flame: { cols: 16, rows: 4, frames: 64, own: false },
  explosion: { cols: 5, rows: 5, frames: 25, own: true },
  sprites: { cols: 4, rows: 4, frames: 16, own: false },
  ground: { cols: 2, rows: 2, frames: 4, own: false },
} as const;
export type SheetName = keyof typeof SHEETS;

/** the tiles of the sprites sheet */
export const SPRITE = {
  dot: 0,
  star: 1,
  starBurst: 2,
  flare: 3,
  crackle: 4, // 4–7: four patches of crackling lightning
  tongue: 8, // 8, 9: a single flame
  gout: 10, // a gout of flame bursting up
  puff: 11,
  cloud: 12,
  embers: 13,
  burst: 14,
  streak: 15,
} as const;

/** the tiles of the ground sheet */
export const GROUND = { glow: 0, swirl: 1, ring: 2, scorch: 3 } as const;

/** how a sprite is turned: to the camera, standing up on the ground and turned to it, or lying on the ground */
export type Face = 'cam' | 'up' | 'flat';
const FACE: Record<Face, number> = { cam: 0, up: 1, flat: 2 };

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
  /** share of its life spent fading in (0) */
  fadeIn?: number;
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

/** per sprite: pos 3, vel 3, colour 3, alpha, size, aspect, endSize, life, maxLife, frame, fps, loop, rot, spin, age, gravity, drag, fadeIn, add, face */
const STRIDE = 26;

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
    // pos and turn; width, height, frame, face; premultiplied colour and how much it covers
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.c = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', this.a);
    geo.setAttribute('iB', this.b);
    geo.setAttribute('iC', this.c);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null }, uGrid: { value: new THREE.Vector2(this.sheet.cols, this.sheet.rows) } },
      defines: this.sheet.own ? { OWN_ALPHA: 1 } : {},
      vertexShader: /* glsl */ `
        attribute vec4 iA;
        attribute vec4 iB;
        attribute vec4 iC;
        uniform vec2 uGrid;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          float c = cos(iA.w), s = sin(iA.w);
          vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iB.xy;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          if (iB.w > 1.5) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, -1.0); }
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
    s[k] = o.x;
    s[k + 1] = o.y;
    s[k + 2] = o.z;
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
    s[k + 11] = o.aspect ?? 1;
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
    s[k + 25] = FACE[o.face ?? 'cam'];
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
    for (let j = 0; j < this.count; j++) {
      const k = j * STRIDE;
      const t = s[k + 13] / s[k + 14]; // 1 → 0
      const age = s[k + 20];
      const fi = s[k + 23];
      const alpha = s[k + 9] * Math.min(1, t * 2.5) * (fi > 0 ? Math.min(1, (1 - t) / fi) : 1);
      const size = s[k + 10] * (s[k + 12] + (1 - s[k + 12]) * t);
      let f = s[k + 15] + age * s[k + 16];
      f = s[k + 17] ? f % frames : Math.min(frames - 1, f);
      this.put(A, B, C, j, s[k], s[k + 1], s[k + 2], s[k + 18], size, size * s[k + 11], f, s[k + 25], s[k + 6] * alpha, s[k + 7] * alpha, s[k + 8] * alpha, alpha * (1 - s[k + 24]));
    }
    for (let j = this.count; j < n; j++) {
      const o = this.now[j - this.count];
      const col = o.color === undefined ? tmp.setRGB(1, 1, 1) : typeof o.color === 'string' ? tmp.set(o.color) : tmp.copy(o.color);
      const al = (o.alpha ?? 1) * (o.glow ?? 1);
      const f = (o.frame ?? 0) % frames;
      this.put(A, B, C, j, o.x, o.y, o.z, o.rot ?? 0, o.size, o.size * (o.aspect ?? 1), f, FACE[o.face ?? 'cam'], col.r * al, col.g * al, col.b * al, (o.alpha ?? 1) * (1 - (o.add ?? 1)));
    }
    this.now.length = 0;
    this.mesh.geometry.instanceCount = n;
    this.a.needsUpdate = this.b.needsUpdate = this.c.needsUpdate = true;
    this.a.addUpdateRange(0, n * 4);
    this.b.addUpdateRange(0, n * 4);
    this.c.addUpdateRange(0, n * 4);
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
