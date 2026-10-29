// The item pictures (tools/icons): the list follows D2's rules (a picture per file, shared by a
// line's tiers; variants for rings, amulets, jewels and charms; a unique's or set item's own file,
// else its base's column, else its base's picture, a fixed file overriding the variant roll); the
// prompt is the approved style's, built as the samples built it; the descriptions and picks name
// pictures and guides that exist; public/icons/items/ holds the atlases and nothing else, each the
// one recorded in tools/icons/made/atlases.json, every pick recorded in tools/icons/made/ and placed
// in the atlas of its kind (tools/icons/atlas.mjs) at a rect of exactly its cells (w×68 by h×68 px),
// inside the atlas and apart from the others, each rect showing a picture inside its clear margin (the
// pixels its record has) and nothing showing outside the rects; the packer packs, splits what won't fit and places each once;
// and the credits name the models.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CELL, MAX_SIDE, atlasOf, pack, pixelsOf } from '../icons/atlas.mjs';
import { buildPictures, listOf, pictureOf } from '../icons/pictures.mjs';
import { FRAME, GUIDE_PREFIX, MATERIAL, STYLE, canvasFor, promptFor } from '../icons/style.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = (d) => path.join(root, 'tools/icons', d);
const readDir = (d) => (fs.existsSync(dir(d)) ? fs.readdirSync(dir(d)).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir(d), f), 'utf8'))]) : []);

/** a WebP file's canvas size, from its VP8X header (lossy colour with alpha) or its VP8L one */
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)];
  }
  return null;
}

export default async () => {
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const { pictures, byId, counts } = await buildPictures();

  // the files in the game's scope, and what is painted of them
  check(counts.scope.files === 303, `${counts.scope.files} picture files in src/data/d2x, not 303`);
  check(counts.pictures.variant === 23, `${counts.pictures.variant} variants, not 23 (rings 5, amulets 3, jewels 6, charms 3 × 3)`);
  for (const id of ['invrin', 'invamu', 'invchm']) check(!byId.has(id), `${id} is listed: a variant type never shows its base's own file`);
  const cap = byId.get('invcap');
  check(['cap', 'xap', 'uap'].every((c) => cap?.codes.some((x) => x.code === c)) && cap?.lead === 'cap', 'Cap, War Hat and Shako share invcap, painted as the Cap');
  check(byId.get('invuhms')?.kind === 'set' && byId.get('invuhms').base?.[0] === 'invghm', 'the Spired Helm set item has its own picture, a version of invghm');
  for (const p of pictures) {
    check(canvasFor(p.w, p.h), `${p.id}: no canvas for ${p.w}x${p.h}`);
    check(p.codes.length > 0, `${p.id}: no base shows it`);
  }

  const uid = (k) => pictures.flatMap((p) => p.uniques).find((u) => u.key === k)?.id;
  const cases = [
    [{ code: 'rin', quality: 'unique', id: uid('Nagelring'), varIndex: 3 }, 'invrin4'],
    [{ code: 'amu', quality: 'unique', id: uid("Seraph's Hymn"), varIndex: 0 }, 'invamu2'],
    [{ code: 'vip', quality: 'unique', id: uid('Amulet of the Viper') }, 'invvip'],
    [{ code: '7cr', quality: 'unique', id: uid('Azurewrath') }, 'invcrs'],
    [{ code: 'uap', quality: 'unique', id: uid('Harlequin Crest') }, 'invcap'],
    [{ code: 'uhm', quality: 'set', id: 103 }, 'invuhms'],
    [{ code: 'uap', quality: 'magic' }, 'invcap'],
    [{ code: 'cm3', quality: 'normal', varIndex: 2 }, 'invch9'],
  ];
  for (const [item, want] of cases) check(pictureOf(byId, item) === want, `${JSON.stringify(item)} shows ${pictureOf(byId, item)}, not ${want}`);

  // the prompt: [guide prefix] description [material] style suffix, frame
  const axe = byId.get('inv2ax');
  const pr = promptFor(axe, { desc: 'A double axe.' });
  check(pr === `A double axe. ${MATERIAL} ${STYLE.suffix}${FRAME}`, `inv2ax's prompt: ${pr}`);
  check(promptFor(axe, { desc: 'A double axe.', material: false }).indexOf(MATERIAL) < 0, 'material: false leaves the material line out');
  check(promptFor(byId.get('invrin1'), { desc: 'A ring.' }).indexOf(MATERIAL) < 0, 'a ring takes no material line');
  check(promptFor(axe, { desc: 'A double axe.' }, { guide: true }).startsWith(GUIDE_PREFIX), 'a guide puts the guide prefix first');
  check(!/diablo|blizzard/i.test(STYLE.suffix + FRAME), 'the style never names the game it follows');

  // the descriptions and picks
  const guides = new Set([...fs.readFileSync(dir('box/guides.py'), 'utf8').matchAll(/^ {4}"([a-z0-9-]+)": \(/gm)].map((m) => m[1]));
  for (const [f, d] of readDir('desc')) {
    for (const [id, e] of Object.entries(d)) {
      check(byId.has(id), `desc/${f}: no picture ${id}`);
      check(!e.guide || guides.has(e.guide), `desc/${f} ${id}: no guide ${e.guide}`);
    }
  }
  const picks = {};
  for (const [f, d] of readDir('picks')) {
    for (const [id, p] of Object.entries(d)) {
      picks[id] = p;
      check(byId.has(id) && listOf(byId.get(id)) === f.replace(/\.json$/, ''), `picks/${f}: ${id} belongs in picks/${byId.has(id) ? listOf(byId.get(id)) : '?'}.json`);
    }
  }

  // the packer: a few pictures where they always go; a kind too big for one atlas split in its order,
  // every part within MAX_SIDE, every picture placed once, at its cells, apart from the others
  check(JSON.stringify(pack('t', [{ id: 'a', w: 2, h: 3 }, { id: 'b', w: 1, h: 1 }, { id: 'c', w: 1, h: 4 }, { id: 'd', w: 2, h: 2 }])) === '[{"name":"t","w":204,"h":340,"rects":{"c":[0,0,68,272],"a":[68,0,136,204],"d":[68,204,136,136],"b":[0,272,68,68]}}]', 'pack() moved four pictures');
  const many = Array.from({ length: 1300 }, (_, i) => ({ id: `p${i}`, w: 1 + (i % 2), h: 1 + (i % 4) }));
  const parts = pack('big', many);
  const placed = parts.flatMap((a) => Object.keys(a.rects));
  check(parts.length > 1 && parts.every((a, i) => a.name === `big-${i + 1}` && a.w <= MAX_SIDE && a.h <= MAX_SIDE), `1300 pictures packed as ${parts.map((a) => `${a.name} ${a.w}x${a.h}`).join(', ')}`);
  check(placed.length === many.length && new Set(placed).size === many.length, `1300 pictures placed ${placed.length} times, ${new Set(placed).size} of them`);
  for (const a of parts) {
    const grid = new Uint8Array((a.w / CELL) * (a.h / CELL));
    for (const [id, [x, y, w, h]] of Object.entries(a.rects)) {
      const it = many[+id.slice(1)];
      check(w === it.w * CELL && h === it.h * CELL && x + w <= a.w && y + h <= a.h, `${a.name} ${id}: ${[x, y, w, h]}`);
      for (let cy = y / CELL; cy < (y + h) / CELL; cy++) for (let cx = x / CELL; cx < (x + w) / CELL; cx++) check(!grid[cy * (a.w / CELL) + cx]++, `${a.name}: ${id} overlaps another`);
    }
  }

  // public/icons/items: the atlases, each the one recorded; every pick in the atlas of its kind, at its cells' size, apart
  const made = Object.assign({}, ...readDir('made').filter(([f]) => f !== 'atlases.json').map(([, m]) => m));
  const atlases = fs.existsSync(dir('made/atlases.json')) ? JSON.parse(fs.readFileSync(dir('made/atlases.json'), 'utf8')) : {};
  const out = path.join(root, 'public/icons/items');
  const files = fs.existsSync(out) ? fs.readdirSync(out) : [];
  for (const f of files) check(f.endsWith('.webp') && atlases[f.slice(0, -5)], `public/icons/items/${f}: not an atlas of made/atlases.json`);
  const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  const inAtlas = {};
  for (const id of Object.keys(picks)) {
    const p = byId.get(id);
    const m = made[id];
    if (!check(p && m?.atlas, `${id} is picked but in no atlas: node tools/ai-icons.mjs`)) continue;
    check(m.run === picks[id].run && m.seed === picks[id].seed, `${id}: made from run ${m.run} s${m.seed}, picked run ${picks[id].run} s${picks[id].seed}`);
    const name = path.basename(m.atlas.file, '.webp');
    check(name === atlasOf(p) || name.startsWith(`${atlasOf(p)}-`), `${id} is in ${name}, not in ${atlasOf(p)}`);
    const [x, y, w, h] = m.atlas.rect;
    check(w === p.w * CELL && h === p.h * CELL && x % CELL === 0 && y % CELL === 0, `${id}: at ${m.atlas.rect} in ${name}, not its ${p.w}x${p.h} cells`);
    (inAtlas[name] ??= []).push([id, m.atlas.rect]);
  }
  for (const [id, m] of Object.entries(made)) check(picks[id] || !m.atlas, `${id} is in an atlas but not picked`);
  for (const [name, a] of Object.entries(atlases)) {
    const file = path.join(out, `${name}.webp`);
    if (!check(fs.existsSync(file), `made/atlases.json has ${name}, but public/icons/items/${name}.webp is missing: node tools/ai-icons.mjs`)) continue;
    check(sha1(file) === a.sha1, `public/icons/items/${name}.webp isn't the one made/atlases.json records`);
    const size = webpSize(file);
    check(size?.[0] === a.w && size?.[1] === a.h && a.w <= MAX_SIDE && a.h <= MAX_SIDE, `${name}.webp: ${size} px, recorded ${a.w}x${a.h}`);
    const rects = inAtlas[name] ?? [];
    check(rects.length === a.pictures && rects.length > 0, `${name}: ${rects.length} pictures placed in it, ${a.pictures} recorded`);
    // what it shows: a picture in each rect, clear 2 px in from its edge (the export's margin is 4), and nothing outside the rects
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== a.w || info.height !== a.h) continue;
    const covered = new Uint8Array(a.w * a.h);
    for (const [id, [x, y, w, h]] of rects) {
      let ring = 0;
      let solid = 0;
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const k = (y + row) * a.w + x + col;
          if (x + w > a.w || y + h > a.h) break;
          if (covered[k]++) {
            check(false, `${name}: ${id} overlaps another picture`);
            row = h;
            break;
          }
          const al = data[k * 4 + 3];
          if (row < 2 || col < 2 || row >= h - 2 || col >= w - 2) ring += al;
          else if (al > 200) solid++;
        }
      }
      check(x + w <= a.w && y + h <= a.h, `${name}: ${id} at ${[x, y, w, h]} is outside its ${a.w}x${a.h}`);
      check(ring === 0 && solid > w * h * 0.03, `${name}: ${id}'s rect isn't a picture (margin alpha ${ring}, ${solid} solid px)`);
      // the pixels recorded for it, what the game's map is checked against (tools/test/itempics.test.mjs)
      check(made[id].atlas.pixels === pixelsOf(data, a.w, [x, y, w, h]), `${name}: ${id}'s rect doesn't show the pixels its record has: node tools/ai-icons.mjs`);
    }
    let stray = 0;
    for (let k = 0; k < covered.length; k++) if (!covered[k] && data[k * 4 + 3]) stray++;
    check(stray === 0, `${name}: ${stray} px show outside its pictures`);
  }
  // the credits name every model and licence the records do (ai-icons.mjs writes them from the records)
  const credits = path.join(root, 'public/icons/CREDITS.md');
  if (files.length) {
    const text = fs.existsSync(credits) ? fs.readFileSync(credits, 'utf8') : '';
    for (const m of Object.values(made)) for (const n of [m.model, m.license, m.matte, m.matteLicense]) check(text.includes(n), `public/icons/CREDITS.md doesn't name ${n}: node tools/ai-icons.mjs`);
  }

  if (problems.length) throw new Error(problems.join('\n'));
  const kb = Object.values(atlases).reduce((s, a) => s + a.bytes, 0) / 1024;
  console.log(`  ${pictures.length} pictures (${counts.pictures.base} base, ${counts.pictures.variant} variants, ${counts.pictures.unique} unique, ${counts.pictures.set} set); ${Object.keys(picks).length} picked, in ${files.length} atlases (${kb.toFixed(0)} KB), each picture where the map says`);
};
