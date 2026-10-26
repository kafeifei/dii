import type { RNG } from '../core/math';
import { PROP_DEFS, type Prop } from './furnish';

/** what grows in the woods round the land under the sky, and how often */
export const TREES: [string, number][] = [
  ['h_tree_dead_large', 3],
  ['h_tree_dead_medium', 3],
  ['h_tree_dead_small', 2],
  ['x_tree_single_A', 3],
  ['x_tree_single_B', 3],
  ['h_tree_pine_orange_medium', 2],
  ['h_tree_pine_yellow_large', 1],
];
export const BIG_ROCKS = ['x_rock_single_C', 'x_rock_single_E'];

export function pickWeighted(rng: RNG, list: [string, number][]): string {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rng.next() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[0][0];
}

/** seeded 2D value noise in [-1, 1], eased between lattice points */
export function valueNoise(rng: RNG): (x: number, y: number) => number {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rng.next() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
  const at = (x: number, y: number) => vals[perm[(perm[x & 255] + y) & 255]];
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = ease(x - x0);
    const ty = ease(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** four octaves of it, still in about [-1, 1] */
export function fbm(noise: (x: number, y: number) => number, x: number, y: number): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    v += noise(x * f + o * 17.3, y * f - o * 9.1) * amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / 0.9375;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The woods round some land, over the box [x0, x1) × [z0, z1) (which may run past the map: trees
 * there are only to look at): thick by the land's edge, thinner further out, none where `keep` says.
 * Also gives each tile's distance from the land, for the ground under the trees.
 */
export function growWoods(
  rng: RNG,
  box: { x0: number; z0: number; x1: number; z1: number },
  land: (x: number, z: number) => boolean,
  keep: (x: number, z: number) => boolean,
): { props: Prop[]; fromLand: (x: number, z: number) => number } {
  const w = box.x1 - box.x0;
  const h = box.z1 - box.z0;
  const dist = new Int16Array(w * h).fill(-1);
  const q: number[] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (!land(x + box.x0, z + box.z0)) continue;
      dist[z * w + x] = 0;
      q.push(z * w + x);
    }
  }
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const x = i % w;
    const z = (i / w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  const props: Prop[] = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const d = dist[z * w + x];
      if (d < 1 || keep(x + box.x0, z + box.z0)) continue;
      if (!rng.chance(d <= 2 ? 0.5 : d <= 5 ? 0.3 : 0.13)) continue;
      const model = rng.chance(0.06) ? rng.pick(BIG_ROCKS) : pickWeighted(rng, TREES);
      props.push({
        model,
        x: x + box.x0 + 0.5 + rng.range(-0.3, 0.3),
        z: z + box.z0 + 0.5 + rng.range(-0.3, 0.3),
        rot: rng.range(0, Math.PI * 2),
        scale: PROP_DEFS[model].s * rng.range(0.85, 1.3),
      });
    }
  }
  const fromLand = (x: number, z: number) => {
    const ix = x - box.x0;
    const iz = z - box.z0;
    return ix < 0 || iz < 0 || ix >= w || iz >= h ? 99 : dist[iz * w + ix];
  };
  return { props, fromLand };
}
