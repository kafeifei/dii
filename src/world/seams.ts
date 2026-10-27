/**
 * Where the areas of one map meet (the West overworld, src/world/overworld.ts): how much of each
 * area there is around a point, so that what changes from one area to the next (the ground's
 * surfaces, the mist, the light's grade, the specks in the air) blends across their seam instead of
 * switching at a line. Diablo II changes an area's look with its tiles (levels.json SubTheme picks
 * each area's variant of the Act 1 outdoor fills: D2Common DrlgOutPlace.cpp sets
 * pOutdoor->nSubTheme from the level's dwSubTheme, DrlgTileSub.cpp rolls lvlsub.json Prob[nSubTheme])
 * and its sound with the hero's level; ours are the same changes, faded over a few tiles.
 */

/** an area's share of the ground round a point: `w` of 1 */
export interface AreaShare {
  area: number;
  w: number;
}

/**
 * The areas round (x, z) on a map of `areas` (AreaDef ids, row by row, w×h tiles) and the share of
 * each, most first, summing to 1: every tile within `radius` counts, the nearer the more ((1 - d/r)²).
 * It moves smoothly with the point, half and half on a straight seam and all one area `radius` in
 * from it. `out` is reused (its entries too), so a frame's call makes nothing new.
 */
export function areaShares(areas: Uint16Array, w: number, h: number, x: number, z: number, radius: number, out: AreaShare[] = []): AreaShare[] {
  let n = 0;
  let total = 0;
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(w - 1, Math.floor(x + r));
  const z0 = Math.max(0, Math.floor(z - r));
  const z1 = Math.min(h - 1, Math.floor(z + r));
  for (let tz = z0; tz <= z1; tz++) {
    const dz = tz + 0.5 - z;
    for (let tx = x0; tx <= x1; tx++) {
      const dx = tx + 0.5 - x;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= r) continue;
      const k = (1 - d / r) ** 2;
      const a = areas[tz * w + tx];
      let j = 0;
      while (j < n && out[j].area !== a) j++;
      if (j === n) {
        if (n < out.length) {
          out[n].area = a;
          out[n].w = 0;
        } else out.push({ area: a, w: 0 });
        n++;
      }
      out[j].w += k;
      total += k;
    }
  }
  if (!n) {
    // off the map: the nearest tile's, as Level.areaAt
    const tx = Math.min(w - 1, Math.max(0, Math.floor(x)));
    const tz = Math.min(h - 1, Math.max(0, Math.floor(z)));
    if (!out.length) out.push({ area: 0, w: 0 });
    out[0].area = areas[tz * w + tx];
    out[0].w = 1;
    out.length = 1;
    return out;
  }
  out.length = n;
  for (const s of out) s.w /= total;
  return out.sort((a, b) => b.w - a.w);
}

/**
 * Each tile's share of `slots` looks (an area's look, Diablo II's subtheme) on a map of `areas`,
 * `slotOf` the look an area wears: 1 a tile deep in an area, fading to the next area's over about
 * 2 × `radius` tiles either side of their seam (a box blur run twice, a soft triangle). Packed four
 * looks a texel, for the ground's shader: bytes, RGBA, row by row, one array for each four looks.
 */
export function lookMix(areas: Uint16Array, w: number, h: number, slotOf: (area: number) => number, slots: number, radius: number): Uint8Array[] {
  const n = w * h;
  const r = Math.max(0, Math.round(radius));
  const out = Array.from({ length: Math.ceil(slots / 4) }, () => new Uint8Array(n * 4));
  const slot = new Uint8Array(n);
  for (let i = 0; i < n; i++) slot[i] = slotOf(areas[i]);
  const f = new Float32Array(n);
  const tmp = new Float32Array(n);
  for (let s = 0; s < slots; s++) {
    for (let i = 0; i < n; i++) f[i] = slot[i] === s ? 1 : 0;
    for (let pass = 0; pass < 2; pass++) {
      blurRows(f, tmp, w, h, r);
      blurCols(tmp, f, w, h, r);
    }
    const o = out[s >> 2];
    const c = s & 3;
    // a blur of a partition of unity stays one: each tile's shares sum to 1 but for rounding
    for (let i = 0; i < n; i++) o[i * 4 + c] = Math.round(Math.min(1, Math.max(0, f[i])) * 255);
  }
  return out;
}

/** the mean of each tile and the `r` either side of it along its row, the edge tile standing in past the map */
function blurRows(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let z = 0; z < h; z++) {
    const row = z * w;
    const at = (x: number) => src[row + Math.min(w - 1, Math.max(0, x))];
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += at(x);
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum * k;
      sum += at(x + r + 1) - at(x - r);
    }
  }
}

/** blurRows down the columns */
function blurCols(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    const at = (z: number) => src[Math.min(h - 1, Math.max(0, z)) * w + x];
    let sum = 0;
    for (let z = -r; z <= r; z++) sum += at(z);
    for (let z = 0; z < h; z++) {
      dst[z * w + x] = sum * k;
      sum += at(z + r + 1) - at(z - r);
    }
  }
}
