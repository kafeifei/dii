// The item pictures (tools/icons): the list follows D2's rules (a picture per file, shared by a
// line's tiers; variants for rings, amulets, jewels and charms; a unique's or set item's own file,
// else its base's column, else its base's picture, a fixed file overriding the variant roll); the
// prompt is the approved style's, built as the samples built it; the descriptions and picks name
// pictures and guides that exist; and every file in public/icons/items/ is a pick's, recorded in
// tools/icons/made/, at exactly w×68 by h×68 px (2x) or w×34 by h×34 (1x).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPictures, pictureOf } from '../icons/pictures.mjs';
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
      check(byId.get(id)?.group === f.replace(/\.json$/, ''), `picks/${f}: ${id} is not a ${f.replace(/\.json$/, '')} picture`);
    }
  }

  // public/icons/items: a pick's files, recorded, at the cells' exact size
  const made = Object.assign({}, ...readDir('made').map(([, m]) => m));
  const out = path.join(root, 'public/icons/items');
  const files = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith('.webp')) : [];
  for (const f of files) {
    const [id, scale] = f.replace(/\.webp$/, '').split('.');
    const p = byId.get(id);
    const m = made[id];
    check(p && picks[id] && m, `public/icons/items/${f}: no pick or no record`);
    if (!p || !m) continue;
    check(m.run === picks[id].run && m.seed === picks[id].seed, `${id}: made from run ${m.run} s${m.seed}, picked run ${picks[id].run} s${picks[id].seed}`);
    const cell = scale === '1x' ? 34 : 68;
    const size = webpSize(path.join(out, f));
    check(size?.[0] === p.w * cell && size?.[1] === p.h * cell, `${f}: ${size} px, not ${p.w * cell}x${p.h * cell}`);
  }
  for (const id of Object.keys(picks)) for (const f of [`${id}.webp`, `${id}.1x.webp`]) check(files.includes(f), `${id} is picked but ${f} is missing: node tools/ai-icons.mjs`);

  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`  ${pictures.length} pictures (${counts.pictures.base} base, ${counts.pictures.variant} variants, ${counts.pictures.unique} unique, ${counts.pictures.set} set); ${Object.keys(picks).length} picked, ${files.length} files`);
};
