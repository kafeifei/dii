// AI-painted floor, wall and ground textures (the avatar project's concept/textures, drawn by its
// pipeline/textures.mjs and made tileable by its pipeline/seamless.py) →
// public/textures/<theme>_<floor|wall>.webp and the outdoor ground's <theme>_<grass|dirt|road>.webp
//   node tools/ai-textures.mjs [name ...]     (only those; AVATAR=<dir> from a worktree)
// Each is TEXELS texels a metre across the metres one picture spans where the game lays it (SPAN),
// rounded up to a multiple of 64 px. That is the smallest that looked the same as the 1024² pictures
// did in the game (2026-10-29, the camp, Blood Moor, Cold Plains and the Den, frozen frames compared:
// a 1280×800 screen at 2× drawn at 100%, at the game's zoom and the nearest the wheel goes, and a
// phone at 3×): at 160 the fine grain only lands on other pixels, at 128 the ground and the walls go
// soft zoomed all the way in. The ground lies at the camera's slant, so it needs fewer texels a metre
// than a model's picture (tools/build-models.mjs TEXELS). A picture with no SPAN is made 1024².
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
const TEXELS = 160;
const QUALITY = 85;

const wanted = process.argv.slice(2);
for (const f of fs.readdirSync(SRC).filter((f) => /^[a-z]+_(floor|wall|grass|dirt|road)\.png$/.test(f))) {
  const name = f.replace('.png', '');
  if (wanted.length && !wanted.includes(name)) continue;
  const size = SPAN[name] ? Math.min(1024, Math.ceil((TEXELS * SPAN[name]) / 64) * 64) : 1024;
  const out = path.join(OUT, `${name}.webp`);
  await sharp(path.join(SRC, f)).resize(size, size).webp({ quality: QUALITY, effort: 6 }).toFile(out);
  console.log(`${f.padEnd(18)} → public/textures/${path.basename(out)}  ${size}²  ${Math.round(fs.statSync(out).size / 1024)} KB${SPAN[name] ? '' : '  (no SPAN for it yet)'}`);
}
