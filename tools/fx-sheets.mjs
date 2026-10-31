// The skills' effect pictures: CC0 flipbooks and particle sprites → public/fx/<sheet>.webp
//   node tools/fx-sheets.mjs
// The sources are downloaded once into models-src/fx/ (not in the repo):
//   - Unity Labs' VFX image sequences (CC0, rendered from Houdini fluid sims):
//     https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks
//   - Kenney's Particle Pack 1.1 (CC0): https://kenney.nl/assets/particle-pack
// Each sheet is a grid of frames (a flipbook, played in order) or of tiles (sprites picked by
// index); the grid and what each tile is are src/render/sprites.ts SHEETS and SPRITE, kept in step
// with SHEETS below. Every picture is stored premultiplied: where it's black it adds nothing and
// covers nothing. A sheet with `alpha` keeps its own coverage (smoke that darkens what's behind);
// the rest take it from their brightness in the game (sprites.ts), so they are RGB only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, 'models-src/fx');
const OUT = path.join(ROOT, 'public/fx');
fs.mkdirSync(OUT, { recursive: true });

const UNITY = 'https://unity3d.com/files/labs/downloads/vfx/assets01';
const KENNEY_PARTICLES = { page: 'https://kenney.nl/assets/particle-pack', id: '6173736574732f7061727469636c652d7061636b' };

/**
 * The sheets: `from` a Unity Labs flipbook (its name; the picture is <name>_<cols>x<rows>.tga) or
 * Kenney particles (`tiles`, laid out row by row, `tile` pixels each); `size` the sheet's pixels
 */
const SHEETS = {
  // a ball of fire turning over, 8×8 frames looping: fire bolt, fire ball, the meteor's head
  fireball: { unity: 'FireBall01', grid: [8, 8], size: [1024, 1024], quality: 80 },
  // a tongue of flame, 16×4 frames looping: holy fire's flames, fire wall, burning
  flame: { unity: 'Flame03', grid: [16, 4], size: [1024, 512], quality: 82 },
  // a fireball blooming into black smoke, 5×5 frames once: blasts and impacts; keeps its coverage
  explosion: { unity: 'Explosion01', grid: [5, 5], size: [1024, 1024], quality: 80, alpha: true },
  // single sprites, 4×4 tiles of 128: src/render/sprites.ts SPRITE
  sprites: {
    kenney: ['circle_05', 'star_04', 'star_09', 'flare_01', 'spark_01', 'spark_02', 'spark_03', 'spark_04', 'flame_05', 'flame_06', 'muzzle_01', 'smoke_04', 'smoke_07', 'fire_01', 'scorch_02', 'trace_04'],
    grid: [4, 4],
    size: [512, 512],
    quality: 85,
  },
  // ground pieces, 2×2 tiles of 512: an aura's glow, a swirl, a ring, a scorch
  ground: { kenney: ['light_01', 'twirl_02', 'circle_03', 'scorch_03'], grid: [2, 2], size: [1024, 1024], quality: 85 },
};

/** `url` saved at `file` once */
async function fetchOnce(url, file, headers = {}) {
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}

/** a Unity Labs flipbook's TGA, downloaded and unzipped into its own folder */
async function unityTga(name, [cols, rows]) {
  const dir = path.join(CACHE, 'unitylabs', name);
  const tga = path.join(dir, `${name}_${cols}x${rows}.tga`);
  if (!fs.existsSync(tga)) {
    const zip = await fetchOnce(`${UNITY}/${name}/${name}-flipbooks.zip`, path.join(dir, `${name}-flipbooks.zip`));
    execFileSync('unzip', ['-o', '-q', zip, path.basename(tga), '-d', dir]);
  }
  return tga;
}

/** Kenney's Particle Pack, downloaded (its page hands out a signed link) and unzipped; the folder of its black-background PNGs */
async function kenneyParticles() {
  const dir = path.join(CACHE, 'kenney-particle-pack');
  const png = path.join(dir, 'PNG (Black background)');
  if (fs.existsSync(png)) return png;
  const page = await fetch(KENNEY_PARTICLES.page);
  const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const link = await fetch(`https://kenney.nl/download-link/${KENNEY_PARTICLES.id}`, { headers: { cookie, referer: KENNEY_PARTICLES.page } }).then((r) => r.json());
  if (!link.url) throw new Error(`Kenney's download link: ${JSON.stringify(link)}`);
  const zip = await fetchOnce(link.url, path.join(dir, 'particle-pack.zip'), { cookie, referer: KENNEY_PARTICLES.page });
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  return png;
}

/** an uncompressed TGA (type 2, 24 or 32 bit) as RGBA pixels */
function readTga(file) {
  const b = fs.readFileSync(file);
  const type = b[2];
  const w = b.readUInt16LE(12);
  const h = b.readUInt16LE(14);
  const ch = b[16] / 8;
  if (type !== 2 || (ch !== 3 && ch !== 4)) throw new Error(`${file}: TGA type ${type}, ${b[16]} bit`);
  const top = (b[17] & 0x20) !== 0;
  const off = 18 + b[0];
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = top ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = off + (sy * w + x) * ch;
      const d = (y * w + x) * 4;
      px[d] = b[s + 2];
      px[d + 1] = b[s + 1];
      px[d + 2] = b[s];
      px[d + 3] = ch === 4 ? b[s + 3] : 255;
    }
  }
  return { px, w, h };
}

/** RGBA pixels with their colour multiplied by their coverage */
function premultiply(px) {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    px[i] = Math.round(px[i] * a);
    px[i + 1] = Math.round(px[i + 1] * a);
    px[i + 2] = Math.round(px[i + 2] * a);
  }
  return px;
}

for (const [name, s] of Object.entries(SHEETS)) {
  const [W, H] = s.size;
  let img;
  if (s.unity) {
    const { px, w, h } = readTga(await unityTga(s.unity, s.grid));
    img = sharp(premultiply(px), { raw: { width: w, height: h, channels: 4 } }).resize(W, H, { kernel: 'lanczos3' });
  } else {
    const dir = await kenneyParticles();
    const [cols] = s.grid;
    const tw = W / cols;
    const th = H / s.grid[1];
    const parts = [];
    for (let i = 0; i < s.kenney.length; i++) {
      const input = await sharp(path.join(dir, `${s.kenney[i]}.png`)).resize(tw, th, { kernel: 'lanczos3' }).toBuffer();
      parts.push({ input, left: (i % cols) * tw, top: Math.floor(i / cols) * th });
    }
    img = sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite(parts);
  }
  // an RGB sheet drops its coverage (black is nothing: the game reads its coverage from its brightness)
  const buf = s.alpha
    ? await sharp(await img.png().toBuffer()).webp({ quality: s.quality, alphaQuality: 85, effort: 6 }).toBuffer()
    : await sharp(await img.removeAlpha().png().toBuffer()).webp({ quality: s.quality, effort: 6 }).toBuffer();
  fs.writeFileSync(path.join(OUT, `${name}.webp`), buf);
  console.log(`${name}.webp`, `${W}×${H}`, `${(buf.length / 1024).toFixed(0)} KB`);
}
