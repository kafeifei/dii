// The light sharpen of the 1x pictures. The game ships the 2x pictures only (src/ui/itempics.ts); on a
// screen of one device pixel per CSS pixel it draws one down to 1x and sharpens it here the way
// tools/icons/box/grade.py sharpen() sharpened the exported 1x files: PIL's UnsharpMask(0.6, 50, 0) on
// premultiplied colour, alpha untouched and colour kept within it. PIL's integer steps are followed
// (its Gaussian is three box passes per axis, each rounded to a byte; libImaging BoxBlur.c and
// UnsharpMask.c), so on the same pixels this gives PIL's bytes (tools/test/itempics.test.mjs).

/** grade.py sharpen()'s radius (px) and percent; its threshold is 0 */
export const SHARPEN = { radius: 0.6, percent: 50 };

const f = Math.fround;

/** BoxBlur.c _gaussian_blur_radius: the box radius three passes take for a Gaussian of this radius, in C's float steps */
function boxRadius(radius: number, passes: number): number {
  const sigma2 = f(f(f(radius) * f(radius)) / passes);
  const L = f(Math.sqrt(12.0 * sigma2 + 1.0));
  const l = f(Math.floor((L - 1.0) / 2.0));
  let a = f(f(f(2 * l) + 1) * f(f(l * f(l + 1)) - f(3 * sigma2)));
  a = f(a / f(6 * f(sigma2 - f(f(l + 1) * f(l + 1)))));
  return f(l + a);
}

/**
 * One box pass along n values at offset, step apart (ImagingLineBoxBlur32): the window of r each side,
 * the two pixels beyond it weighted by the fraction, the edges repeated, rounded to a byte
 */
function boxLine(src: Uint8Array, dst: Uint8Array, offset: number, step: number, n: number, r: number, ww: number, fw: number) {
  const last = n - 1;
  const at = (i: number) => src[offset + (i < 0 ? 0 : i > last ? last : i) * step];
  for (let x = 0; x < n; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += at(x + k);
    dst[offset + x * step] = Math.floor((acc * ww + (at(x - r - 1) + at(x + r + 1)) * fw + (1 << 23)) / (1 << 24));
  }
}

/** ImagingBoxBlur on 3 channels: passes horizontal passes, then as many vertical ones (each through a copy, as PIL's in-place line copy does) */
function boxBlur(px: Uint8Array, w: number, h: number, radius: number, passes: number) {
  const r = Math.trunc(radius);
  // ImagingHorizontalBoxBlur: (UINT32)(1 << 24) / (floatRadius * 2 + 1) is a float division, truncated
  const ww = Math.trunc(f((1 << 24) / f(f(radius * 2) + 1)));
  const fw = Math.floor(((1 << 24) - (r * 2 + 1) * ww) / 2);
  const tmp = new Uint8Array(px.length);
  for (let p = 0; p < passes; p++) {
    tmp.set(px);
    for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) boxLine(tmp, px, y * w * 3 + c, 3, w, r, ww, fw);
  }
  for (let p = 0; p < passes; p++) {
    tmp.set(px);
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) boxLine(tmp, px, x * 3 + c, w * 3, h, r, ww, fw);
  }
}

/**
 * grade.py sharpen() on RGBA pixels as a canvas gives them (not premultiplied), in place: premultiply
 * (PIL RGBA→RGBa), unsharp mask, colour kept within alpha, back (RGBa→RGBA); alpha is left as it is
 */
export function sharpen(px: Uint8ClampedArray, w: number, h: number, { radius, percent } = SHARPEN) {
  const n = w * h;
  const pm = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3];
    for (let c = 0; c < 3; c++) {
      // MULDIV255: c × a / 255, rounded
      const t = px[i * 4 + c] * a + 128;
      pm[i * 3 + c] = ((t >> 8) + t) >> 8;
    }
  }
  const blur = pm.slice();
  boxBlur(blur, w, h, boxRadius(radius, 3), 3);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3];
    for (let c = 0; c < 3; c++) {
      const v = pm[i * 3 + c];
      const diff = v - blur[i * 3 + c];
      // C's int division truncates toward zero; clip8; then np.minimum with alpha
      let s = diff !== 0 ? Math.min(255, Math.max(0, v + Math.trunc((diff * percent) / 100))) : v;
      if (s > a) s = a;
      px[i * 4 + c] = a === 0 || a === 255 ? s : Math.min(255, Math.floor((s * 255) / a));
    }
  }
}
