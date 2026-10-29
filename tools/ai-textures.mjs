// AI-painted floor, wall and ground textures (the avatar project's concept/textures, drawn by its
// pipeline/textures.mjs and made tileable by its pipeline/seamless.py) →
// public/textures/<theme>_<floor|wall>.webp and the outdoor ground's <theme>_<grass|dirt|road>.webp
//   node tools/ai-textures.mjs [name ...]     (only those; AVATAR=<dir> from a worktree)
// Only the pictures the game lays (those with a SPAN) are written; the rest in the avatar folder (art
// not used yet) are skipped and named, so they never ship by accident. Give one a SPAN when the game
// starts using it.
//
// Each is TEXELS texels a metre across the metres one picture spans where the game lays it (SPAN),
// rounded up to a multiple of 64 px and at most the 1024² the avatar project paints. The camera is
// orthographic, so any surface, the ground at its slant as much as a wall, has one direction drawn
// unforeshortened: as many device pixels a metre as the screen shows (renderer.pxPerUnit × the pixel
// ratio). The GPU keeps to mip level 0 while that direction has a texel for every pixel, so a picture
// of TEXELS a metre draws as sharp as the old 1024² ones up to TEXELS device pixels a metre. 240 is the
// most the default (automatic, at most 1.5×) render scale shows: a 5K / Studio Display zoomed all the
// way in. Frozen frames against the 1024² pictures (2026-10-29, the camp, Blood Moor, Cold Plains, the
// Den and the gallery's wall) look the same at 240 px a metre; at 320 (the 「高」 preset on a 5K, 1:1)
// the ground and the walls are a little softer side by side magnified, not at their own size (numbers
// in docs/PROJECT-MAP.md). 160 a metre, before, went soft past about 180 px a metre.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// the avatar project sits next to this one (AVATAR=<dir> from a worktree)
const SRC = path.join(process.env.AVATAR ?? '../avatar', 'concept/textures');
const OUT = path.resolve('public/textures');
fs.mkdirSync(OUT, { recursive: true });

/**
 * The metres one picture spans where the game lays it: the outdoor ground's in src/render/arealooks.ts
 * GROUND_LOOKS, a dungeon's floor 4 and the walls (and the ruins' tops) 2 (renderer.ts applyWorldUv)
 */
const SPAN = {
  wild_grass: 4,
  wild_dirt: 4.5,
  wild_road: 3.5,
  town_floor: 4,
  crypt_floor: 4,
  cave_floor: 4,
  hell_floor: 4,
  ice_floor: 4,
  town_wall: 2,
  crypt_wall: 2,
  cave_wall: 2,
  hell_wall: 2,
  ice_wall: 2,
  // M2a: the Act 1 caves' floor and walls (the Cave's two levels, the D line's maze, laid as the
  // dungeons above), and Stony Field's ground for the W line, in the earth's place of the moor's mix
  // (GROUND_LOOKS' wild_dirt) at the same metres
  grotto_floor: 4,
  grotto_wall: 2,
  stony_dirt: 4.5,
};
const TEXELS = 240;
const QUALITY = 85;

/**
 * Pictures whose broad light and dark patches are evened out before they're cut, by how far (`amount`,
 * 0 none, 1 flat) and how broad a patch counts (`sigma`, px of the 1024² picture): the luminance
 * blurred that wide (wrapping round, the picture being a tile) is a patch's brightness, and every
 * texel is scaled toward the picture's mean by it, so the detail in a patch stays and only its
 * glow goes. grotto_floor's pale bedrock patches, a hand across each, lined up in a lattice once it
 * tiled across a cave floor: the spread of its luminance blurred over 3% of its width, over its
 * mean, goes from 7.9% to 3.0% (the cave and crypt floors shipped before: 9.4% and 6.5%), its mean
 * luma stays 53.
 */
const EVEN = {
  grotto_floor: { sigma: 28, amount: 0.8 },
};

/** a separable box blur of a w×h float plane, wrapping at its edges: three passes of radius r, about a Gaussian of sigma r */
function blurWrapped(src, w, h, r) {
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  const pass = (from, to, n, m, stride, step) => {
    // n lines of m texels: line i starts at i * stride, texel j at + j * step
    for (let i = 0; i < n; i++) {
      const o = i * stride;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += from[o + (((k % m) + m) % m) * step];
      for (let j = 0; j < m; j++) {
        to[o + j * step] = sum / (2 * r + 1);
        sum += from[o + ((j + r + 1) % m) * step] - from[o + (((j - r) % m) + m) % m * step];
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(a, b, h, w, w, 1);
    pass(b, a, w, h, 1, w);
  }
  return a;
}

/** the picture with its broad patches evened out (EVEN), as an sRGB PNG of the same size */
async function evenOut(file, { sigma, amount }) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const srgb = (v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = 0.2126 * lin(data[i * 3]) + 0.7152 * lin(data[i * 3 + 1]) + 0.0722 * lin(data[i * 3 + 2]);
  const patch = blurWrapped(L, w, h, Math.round((sigma * w) / 1024));
  const mean = L.reduce((s, v) => s + v, 0) / L.length;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < w * h; i++) {
    const k = (mean / patch[i]) ** amount;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = srgb(lin(data[i * 3 + c]) * k);
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

const wanted = process.argv.slice(2);
const skipped = [];
for (const f of fs.readdirSync(SRC).filter((f) => /^[a-z]+_(floor|wall|grass|dirt|road)\.png$/.test(f))) {
  const name = f.replace('.png', '');
  if (wanted.length && !wanted.includes(name)) continue;
  if (!SPAN[name]) {
    skipped.push(name);
    continue;
  }
  const size = Math.min(1024, Math.ceil((TEXELS * SPAN[name]) / 64) * 64);
  const out = path.join(OUT, `${name}.webp`);
  const src = EVEN[name] ? await evenOut(path.join(SRC, f), EVEN[name]) : path.join(SRC, f);
  await sharp(src).resize(size, size).webp({ quality: QUALITY, effort: 6 }).toFile(out);
  const evened = EVEN[name] ? `  (patches evened: sigma ${EVEN[name].sigma} px, ${EVEN[name].amount})` : '';
  console.log(`${f.padEnd(18)} → public/textures/${path.basename(out)}  ${size}²  ${Math.round(fs.statSync(out).size / 1024)} KB${evened}`);
}
const missing = wanted.filter((n) => !fs.existsSync(path.join(SRC, `${n}.png`)));
if (skipped.length) console.log(`skipped (no SPAN, the game doesn't lay them yet): ${skipped.join(', ')}`);
if (missing.length) console.log(`not in ${SRC}: ${missing.join(', ')}`);
