// D2's recolouring of an item picture, approximated on our true-colour paintings: the same algorithm
// as tools/icons/colours.py (which the gallery and the similarity screen use), on canvas pixels.
//
// D2 shifts a picture's palette: D2CMP_MixPalette(the base's InvTrans, a colour) (D2MOO D2Common
// Items/Items.cpp:3693-4015, src/items/picture.ts says which colour). InvTrans (Weapons/Armor/
// Misc.txt) says which palette ranges a colour moves: 0 none, and in the game's scope 2 (grey2), 5
// (greybrown) and 8 (invgreybrown, which D2Win D2Comp.cpp:3108-3109 loads as shift 8). Those shift
// tables are game files we neither have nor want, and our pictures are not palette art, so this is
// our own: a mask per InvTrans (grey: low saturation, iron and steel; brown: warm, dull and not
// bright, leather and wood; gold and gems stay as painted), and per named colour a gradient map of
// the masked pixels' luminance onto that colour's ramp, its lightness scaled. 5 and 8 alike.
import type { D2xColor } from '../data/d2x/types';

/** Colors.txt's 21, each the ramp's colour at its own luminance and the lightness scale (colours.py COLOURS) */
const COLOURS: Record<D2xColor, [number, number, number, number]> = {
  whit: [222, 220, 212, 1.25],
  lgry: [168, 168, 166, 1.08],
  dgry: [92, 92, 94, 0.72],
  blac: [44, 42, 40, 0.5],
  lblu: [112, 150, 226, 1.08],
  dblu: [44, 62, 140, 0.8],
  cblu: [70, 150, 255, 1.04],
  lred: [216, 92, 80, 1.05],
  dred: [132, 30, 24, 0.78],
  cred: [240, 50, 38, 1.02],
  lgrn: [116, 196, 96, 1.05],
  dgrn: [44, 104, 40, 0.78],
  cgrn: [72, 228, 72, 1.02],
  lyel: [236, 218, 112, 1.12],
  dyel: [168, 148, 44, 0.86],
  lgld: [228, 188, 92, 1.1],
  dgld: [158, 118, 42, 0.86],
  lpur: [188, 122, 218, 1.05],
  dpur: [92, 42, 122, 0.78],
  oran: [238, 132, 42, 1.02],
  bwht: [255, 255, 250, 1.45],
};
/** the "crystal" colours: saturated, their shadows keeping a little of the colour as if it glowed */
const CRYSTAL = new Set<D2xColor>(['cblu', 'cred', 'cgrn']);
/** a little of the painting stays under the new colour; the ramps a little muted, as the grade mutes every picture */
const STRENGTH = 0.92;
const CHROMA = 0.85;

/** the ranges an InvTrans moves: 2 the grey ones, 5 and 8 the grey and the brown; any other none */
export function rangesOf(invTrans: number): { grey: boolean; brown: boolean } | null {
  if (invTrans === 2) return { grey: true, brown: false };
  if (invTrans === 5 || invTrans === 8) return { grey: true, brown: true };
  return null;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const LUM = [0.299, 0.587, 0.114];

/**
 * RGBA pixels (a canvas's ImageData.data) shifted in place as an item of that colour on a base of
 * that InvTrans; alpha as it was, clear pixels untouched. Returns false when the InvTrans moves nothing.
 */
export function recolourPixels(px: Uint8ClampedArray, colour: D2xColor, invTrans: number): boolean {
  const rs = rangesOf(invTrans);
  const def = COLOURS[colour];
  if (!rs || !def) return false;
  const c = [def[0] / 255, def[1] / 255, def[2] / 255];
  const scale = def[3];
  const lc = c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2];
  const crystal = CRYSTAL.has(colour);
  const lowK = 1 / Math.max(lc, 1e-3);
  const highK = 1 / Math.max(1 - lc, 1e-3);
  const out = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) {
    // a clear pixel shows nothing whatever its colour: most of a picture's canvas, left alone
    if (px[i + 3] === 0) continue;
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = (mx - mn) / Math.max(mx, 1e-6);
    let w = 0;
    if (rs.grey) w = 1 - smooth(0.12, 0.28, sat);
    if (rs.brown) {
      const d = Math.max(mx - mn, 1e-6);
      let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      if (hue < 0) hue += 6;
      hue *= 60;
      const warm = smooth(5, 15, hue) * (1 - smooth(48, 60, hue));
      const brown = warm * smooth(0.12, 0.25, sat) * (1 - smooth(0.62, 0.8, mx)) * (1 - smooth(0.7, 0.9, sat));
      w = Math.max(w, brown);
    }
    w *= STRENGTH;
    if (w <= 0) continue;
    // the ramp at the pixel's luminance: black up to the colour at its own luminance, then to white
    const l2 = Math.min(Math.max((r * LUM[0] + g * LUM[1] + b * LUM[2]) * scale, 0), 1);
    for (let k = 0; k < 3; k++) {
      let v = l2 <= lc ? c[k] * l2 * lowK : c[k] + (1 - c[k]) * (l2 - lc) * highK;
      if (crystal) v = Math.max(v, c[k] * 0.22);
      out[k] = v;
    }
    if (!crystal) {
      const grey = out[0] * LUM[0] + out[1] * LUM[1] + out[2] * LUM[2];
      for (let k = 0; k < 3; k++) out[k] = grey + (out[k] - grey) * CHROMA;
    }
    const src = [r, g, b];
    for (let k = 0; k < 3; k++) {
      const v = Math.min(Math.max(out[k], 0), 1);
      px[i + k] = Math.round((src[k] * (1 - w) + v * w) * 255);
    }
  }
  return true;
}
