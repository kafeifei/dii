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
};
const TEXELS = 240;
const QUALITY = 85;

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
  await sharp(path.join(SRC, f)).resize(size, size).webp({ quality: QUALITY, effort: 6 }).toFile(out);
  console.log(`${f.padEnd(18)} → public/textures/${path.basename(out)}  ${size}²  ${Math.round(fs.statSync(out).size / 1024)} KB`);
}
const missing = wanted.filter((n) => !fs.existsSync(path.join(SRC, `${n}.png`)));
if (skipped.length) console.log(`skipped (no SPAN, the game doesn't lay them yet): ${skipped.join(', ')}`);
if (missing.length) console.log(`not in ${SRC}: ${missing.join(', ')}`);
