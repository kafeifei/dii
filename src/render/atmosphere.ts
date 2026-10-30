import * as THREE from 'three';
import type { P2 } from '../core/math';
import type { Effects } from './effects';

/** ground mist: its colour, how thick, and a glow of its own (lava under the smoke) */
export interface MistLook {
  color: THREE.ColorRepresentation;
  opacity: number;
  emissive?: string;
}

/** each theme's mist; under the sky an area's own (src/render/looks.ts) takes over */
export const MIST: Record<string, MistLook> = {
  town: { color: '#7a86a0', opacity: 0.2 },
  wild: { color: '#7a86a0', opacity: 0.24 },
  crypt: { color: '#a89a88', opacity: 0.3 },
  cave: { color: '#a87a68', opacity: 0.24 },
  grotto: { color: '#988c7a', opacity: 0.24 },
  ice: { color: '#c8dcf4', opacity: 0.42 },
  hell: { color: '#c06040', opacity: 0.34, emissive: '#3a0c04' },
};

/** tileable fractal value noise, for the mist */
function noiseTexture(): THREE.Texture {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const vals = new Float32Array(S * S);
  const rnd = (n: number) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return g;
  };
  const octaves = [4, 8, 16, 32].map((n) => ({ n, g: rnd(n) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      let amp = 0.5;
      let sum = 0;
      for (const { n, g } of octaves) {
        const fx = (x / S) * n;
        const fy = (y / S) * n;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        // wrap the lattice so the texture tiles
        const at = (i: number, j: number) => g[((j + n) % n) * n + ((i + n) % n)];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * amp;
        sum += amp;
        amp *= 0.5;
      }
      vals[y * S + x] = v / sum;
    }
  }
  // stretch to the full range: summed octaves crowd around the middle
  let lo = 1;
  let hi = 0;
  for (const v of vals) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (let k = 0; k < vals.length; k++) {
    const c = Math.round(((vals[k] - lo) / (hi - lo)) * 255);
    data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = c;
    data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

let noise: THREE.Texture | null = null;

/** the mist's tileable fractal noise (grey, 128²), shared with the ground's blending */
export function sharedNoise(): THREE.Texture {
  return (noise ??= noiseTexture());
}

/**
 * Drifting ground mist over the level: two see-through layers at different heights scrolling apart,
 * which reads as depth from the camera's angle. Lit like everything else, so it glows around the
 * torches and the hero and stays dark in the dark.
 */
export class Mist {
  readonly group = new THREE.Group();
  private time = { value: 0 };

  private mask: THREE.DataTexture;
  private look: MistLook;
  /** each layer's material and its share of the look's thickness */
  private layers: { mat: THREE.MeshLambertMaterial; share: number }[] = [];

  /** `open(x, y)`: whether mist lies on that tile (the floor, not the rock between rooms) */
  constructor(w: number, h: number, theme: string, open: (x: number, y: number) => boolean) {
    noise ??= noiseTexture();
    const look = (this.look = MIST[theme] ?? MIST.crypt);
    const m = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (open(x, y)) m.fill(255, (y * w + x) * 4, (y * w + x) * 4 + 4);
    this.mask = new THREE.DataTexture(m, w, h);
    this.mask.magFilter = this.mask.minFilter = THREE.LinearFilter;
    this.mask.needsUpdate = true;
    const mask = { value: this.mask };
    const layers: [number, number, number][] = [
      // height, opacity share, scroll speed
      [0.1, 1, 1],
      [0.55, 0.6, -0.7],
    ];
    for (const [y, share, speed] of layers) {
      const mat = new THREE.MeshLambertMaterial({
        color: look.color,
        emissive: look.emissive ?? '#000000',
        alphaMap: noise,
        transparent: true,
        opacity: look.opacity * share,
        depthWrite: false,
      });
      this.layers.push({ mat, share });
      const size = { value: new THREE.Vector2(w, h) };
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.time;
        shader.uniforms.uSize = size;
        shader.uniforms.uMask = mask;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uSize;\nuniform sampler2D uMask;')
          .replace(
            '#include <alphamap_fragment>',
            `{
              vec2 wp = vAlphaMapUv * uSize;
              float t = uTime * ${speed.toFixed(2)};
              float n1 = texture2D(alphaMap, wp / 11.0 + t * vec2(0.011, 0.006)).g;
              float n2 = texture2D(alphaMap, mat2(0.8, -0.6, 0.6, 0.8) * wp / 6.5 - t * vec2(0.007, 0.013)).g;
              diffuseColor.a *= smoothstep(0.4, 0.85, n1 * 0.6 + n2 * 0.5);
              // the plane's v runs against the tile rows
              diffuseColor.a *= texture2D(uMask, vec2(vAlphaMapUv.x, 1.0 - vAlphaMapUv.y)).g;
            }`,
          )
          // a haze, not a wall of light: a spell's flash must not turn it milky
          .replace('#include <opaque_fragment>', 'outgoingLight *= min(1.0, 0.22 / max(1e-4, max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b))));\n#include <opaque_fragment>');
      };
      mat.customProgramCacheKey = () => `mist-${speed}`;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
      plane.position.set(w / 2, y, h / 2);
      plane.receiveShadow = true;
      plane.renderOrder = 2;
      this.group.add(plane);
    }
  }

  update(dt: number) {
    this.time.value += dt;
  }

  /**
   * under the sky: `look` (the theme's, or the areas' about the hero, blended) tinted toward the
   * sky's light, `thick` times its thickness
   */
  setSky(sky: THREE.Color, thick: number, look: MistLook = this.look) {
    for (const l of this.layers) {
      l.mat.color.set(look.color).lerp(sky, 0.3);
      l.mat.opacity = look.opacity * l.share * thick;
    }
  }

  dispose() {
    this.mask.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }
}

/**
 * Specks drifting through the air: dust in the crypt and the caves, frost falling in the ice
 * cellars, embers rising and ash falling in hell, fireflies by night under the sky, seeds adrift
 * in the sun over the moor and frost blowing across Cold Plains. Dust and frost below ground only
 * show near the hero, where the light would catch them.
 */
export type MoteKind = 'dust' | 'cave' | 'grotto' | 'ice' | 'hell' | 'fireflies' | 'seeds' | 'frost';

/** each theme's specks; under the sky an area's own (src/render/looks.ts) take over */
export const THEME_MOTES: Record<string, MoteKind> = { crypt: 'dust', cave: 'cave', grotto: 'grotto', ice: 'ice', hell: 'hell', town: 'fireflies', wild: 'fireflies' };

/** the dust's colour below ground: the crypt's pale, the old caves' ruddy, Act 1's earth caves' a dry fawn */
const DUST_COLOR: Partial<Record<MoteKind, string>> = { dust: '#e8d4b4', cave: '#e0a888', grotto: '#d8c8aa' };

/**
 * One frame's specks of `kind` round the hero and the view's centre, `rate` times as many (an
 * area's share of the air where two meet). `night`: 1 by night (and below ground), 0 by day.
 */
export function ambientMotes(fx: Effects, kind: MoteKind, dt: number, hero: P2, view: P2, night = 1, rate = 1) {
  const r = Math.random;
  const around = (c: P2, rad: number) => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * rad;
    return { x: c.x + Math.sin(a) * d, z: c.z + Math.cos(a) * d, d };
  };
  const chance = (perSecond: number) => r() < perSecond * rate * dt;
  switch (kind) {
    case 'dust':
    case 'cave':
    case 'grotto': {
      if (!chance(22)) return;
      const p = around(hero, 7);
      fx.add.spawn({
        x: p.x, y: 0.3 + r() * 2, z: p.z,
        vx: (r() - 0.5) * 0.2, vy: (r() - 0.5) * 0.08, vz: (r() - 0.5) * 0.2,
        color: DUST_COLOR[kind]!, size: 0.05 + r() * 0.05, life: 4 + r() * 4,
        alpha: 0.5 * (1 - p.d / 7.5), endSize: 1, fadeIn: 0.3,
      });
      return;
    }
    case 'ice': {
      if (!chance(30)) return;
      const p = around(hero, 9);
      fx.norm.spawn({
        x: p.x, y: 2.6 + r() * 1.2, z: p.z,
        vx: 0.08 + (r() - 0.5) * 0.1, vy: -0.28 - r() * 0.12, vz: (r() - 0.5) * 0.1,
        color: '#e8f4ff', size: 0.05 + r() * 0.05, life: 9, alpha: 0.75 * (1 - p.d / 9.5), endSize: 1, fadeIn: 0.15, floor: true,
      });
      return;
    }
    case 'hell': {
      if (chance(16)) {
        const p = around(view, 13);
        fx.add.spawn({
          x: p.x, y: r() * 0.4, z: p.z,
          vx: (r() - 0.5) * 0.4, vy: 0.5 + r() * 0.6, vz: (r() - 0.5) * 0.4,
          color: r() < 0.5 ? '#ff5a18' : '#ffa040', size: 0.05 + r() * 0.07, life: 2.5 + r() * 2.5, drag: 0.2, endSize: 0.4, fadeIn: 0.15,
        });
      }
      if (chance(8)) {
        const p = around(hero, 8);
        fx.norm.spawn({
          x: p.x, y: 2.4 + r(), z: p.z,
          vx: (r() - 0.5) * 0.3, vy: -0.25 - r() * 0.15, vz: (r() - 0.5) * 0.3,
          color: '#2a2422', size: 0.06 + r() * 0.06, life: 8, alpha: 0.7, endSize: 1, fadeIn: 0.2, floor: true,
        });
      }
      return;
    }
    case 'fireflies': {
      // by night
      if (!chance(2.5 * night)) return;
      const p = around(view, 13);
      fx.add.spawn({
        x: p.x, y: 0.4 + r() * 1.2, z: p.z,
        vx: (r() - 0.5) * 0.5, vy: (r() - 0.5) * 0.15, vz: (r() - 0.5) * 0.5,
        color: '#d0ff70', size: 0.08, life: 3 + r() * 3, alpha: 0.9, endSize: 0.8, fadeIn: 0.35,
      });
      return;
    }
    case 'seeds': {
      // by day: thistledown on the wind, catching the sun
      if (!chance(4 * (1 - night))) return;
      const p = around(view, 13);
      fx.norm.spawn({
        x: p.x, y: 0.6 + r() * 1.8, z: p.z,
        vx: 0.3 + r() * 0.2, vy: (r() - 0.45) * 0.12, vz: 0.1 + (r() - 0.5) * 0.2,
        color: '#f2ead2', size: 0.08 + r() * 0.04, life: 5 + r() * 4, alpha: 0.6, endSize: 1, fadeIn: 0.25,
      });
      return;
    }
    case 'frost': {
      // day and night: fine frost blown slantwise, settling
      if (!chance(14)) return;
      const p = around(view, 13);
      fx.norm.spawn({
        x: p.x - 1.5, y: 2.8 + r() * 1.4, z: p.z,
        vx: 0.45 + r() * 0.25, vy: -0.3 - r() * 0.15, vz: (r() - 0.5) * 0.15,
        color: '#eef6ff', size: 0.08 + r() * 0.06, life: 9, alpha: 0.7, endSize: 1, fadeIn: 0.2, floor: true,
      });
      return;
    }
    default:
      // every kind has its specks above
      kind satisfies never;
  }
}

/**
 * Make the bright cracks of a lava floor texture glow by themselves, pulsing slowly, so they light
 * the dark and catch the bloom.
 */
export function applyLavaGlow(mat: THREE.Material, time: { value: number }) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, r) => {
    prev.call(mat, shader, r);
    shader.uniforms.uLavaTime = time;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLavaTime;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float crack = smoothstep(0.16, 0.42, diffuseColor.r) * smoothstep(0.08, 0.2, diffuseColor.r - diffuseColor.b);
          float pulse = 0.75 + 0.25 * sin(uLavaTime * 1.3 + vMapUv.x * 6.0 + vMapUv.y * 4.0);
          totalEmissiveRadiance += diffuseColor.rgb * crack * pulse * 2.8;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey}|lava`;
}
