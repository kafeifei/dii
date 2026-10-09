// AI-painted floor and wall textures (the avatar project's concept/textures, made tileable by
// its pipeline/seamless.py) → public/textures/<theme>_<floor|wall>.webp
// node tools/ai-textures.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = '../avatar/concept/textures';
const OUT = path.resolve('public/textures');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(SRC).filter((f) => /^[a-z]+_(floor|wall)\.png$/.test(f))) {
  const out = path.join(OUT, f.replace('.png', '.webp'));
  await sharp(path.join(SRC, f)).resize(1024, 1024).webp({ quality: 85 }).toFile(out);
  console.log(`${f.padEnd(18)} → public/textures/${path.basename(out)}  ${Math.round(fs.statSync(out).size / 1024)} KB`);
}
