// Our names for D2's proper nouns: tools/d2-names/<category>.json maps the D2 id to { name, nameEn,
// en, official?, note?, generic? }: name is ours in Chinese, nameEn ours in English, en and official
// the official English and Chinese it was written against. The game data only ever takes names from
// there (or, for generic words like gem and base item names, the official strings): a row without
// both names is left out and listed in tools/d2-names/report.md, so naming and building never block
// each other. A generic row (bases.json: generic words D2CE has no Chinese string for) has only
// the Chinese and keeps the official English.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './load.mjs';

const DIR = path.join(ROOT, 'tools/d2-names');
const maps = {};
const unnamed = {};
const noEnglish = {};
const excluded = {};

// What reads as the official name (style.md and style-en.md, hard rule 1). Only what a program can
// tell is here: a homophone, a respelling and whether a veteran knows the name at a glance are for
// a person to judge.

/** a Chinese name with 的 and 之, the middle dot and spaces taken out */
export const zhKey = (s) => (s ?? '').trim().replace(/[的之·・\s]/g, '');
/** two Chinese names that read as one: they differ only in 的 and 之, the middle dot or spaces (风的力 for 风之力) */
export const sameChinese = (a, b) => !!zhKey(a) && zhKey(a) === zhKey(b);

const SMALL = new Set(['of', 'the', 'a', 'an']);
/** an English name's words, lower case, without "of", "the", "a", "an" and a possessive 's */
const enWords = (s) =>
  (s ?? '').toLowerCase().replace(/['’]s\b/g, '').replace(/['’]/g, '').split(/[\s-]+/).filter((w) => w && !SMALL.has(w));
/** what an English name reads as: its words run together ("Wind Force" is Windforce) and in any order ("Oak Heart" is Heart of the Oak) */
export const enKeys = (s) => {
  const w = enWords(s);
  return w.length ? [w.join(''), [...w].sort().join(' ')] : [];
};
/** two English names that read the same: case, apostrophes, spaces, hyphens, "of", "the", "a", "an", a possessive 's and the order of the words aside */
export const sameEnglish = (a, b) => {
  const [x, y] = [enKeys(a), enKeys(b)];
  return x.length > 0 && y.length > 0 && (x[0] === y[0] || x[1] === y[1]);
};

/** `s` with each of `names` cut out, longest first: an official name inside one of ours is ours (长风之力 holds 风之力) */
export function withoutNames(s, names) {
  return [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length).reduce((acc, n) => acc.split(n).join('\u0000'), s);
}

const note = (to, category, id, en) => {
  const u = (to[category] ??= []);
  if (!u.some((x) => x.id === id)) u.push({ id, en });
};

/** the names of one category: named(id) → our names, or undefined (recorded for the report) */
export function names(category) {
  maps[category] ??= JSON.parse(fs.readFileSync(path.join(DIR, `${category}.json`), 'utf8'));
  const m = maps[category];
  /** our Chinese name for a row; `official` is the official Chinese, which the name must differ from by more than 的 and 之 */
  function get(id, en, official) {
    const n = m[id]?.name;
    if (!n) return note(unnamed, category, id, en);
    // (some official strings end in a space)
    const off = official?.trim();
    for (const o of [off, m[id].official]) {
      if (sameChinese(n, o)) throw new Error(`${category}.json ${id}: ${n} is the official name ${o}${n === o.trim() ? '' : ' with only 的, 之, · or spaces changed'}`);
    }
    // a name written against another row's strings is a mix-up (vip once had its unique's name)
    const other = (a, b) => a && b && a.trim() !== b.trim();
    if (other(m[id].en, en) || other(m[id].official, off)) throw new Error(`${category}.json ${id}: written for "${m[id].en}" / ${m[id].official}, the row is "${en}" / ${off}`);
    return n;
  }
  /** our English name for a row; `en` is the official English, which it must not read as */
  function english(id, en) {
    const n = m[id]?.nameEn;
    if (!n) return note(noEnglish, category, id, en);
    if (!/^[\x20-\x7E]+$/.test(n)) throw new Error(`${category}.json ${id}: nameEn "${n}" is not plain ASCII`);
    if (sameEnglish(n, en ?? m[id].en)) throw new Error(`${category}.json ${id}: nameEn "${n}" reads as the official English "${en ?? m[id].en}" (only case, spaces, hyphens, "of", "the", "a", "'s" or the order of the words changed)`);
    return n;
  }
  return {
    has: (id) => !!m[id]?.name,
    /** the English the names file was written against, for rows the string tables lack */
    en: (id) => m[id]?.en,
    /**
     * A row's names, { name, nameEn } (a generic row: { name }), or undefined when either is missing:
     * the row is then left out, and the report lists what it lacks.
     */
    named(id, en, official) {
      const name = get(id, en, official);
      if (!name) return undefined;
      if (m[id].generic) {
        if (m[id].nameEn) throw new Error(`${category}.json ${id}: a generic row keeps the official English, it has no nameEn`);
        return { name };
      }
      const nameEn = english(id, en);
      return nameEn ? { name, nameEn } : undefined;
    },
  };
}

/** the official transliterations the glossary replaces: no generated name may contain one */
export function glossaryOfficial() {
  const g = JSON.parse(fs.readFileSync(path.join(DIR, 'glossary.json'), 'utf8'));
  return g.map((x) => x.official).filter((o) => o && o.length >= 2);
}

/** a row the scope rules leave out, counted in the report by reason */
export function exclude(category, reason, id) {
  ((excluded[category] ??= {})[reason] ??= []).push(id);
}

/** the rows of one list in the report, by names file */
function table(out, rows, none) {
  const cats = Object.keys(rows).sort();
  if (!cats.length) out.push(none, '');
  for (const c of cats) {
    out.push(`### ${c}.json（${rows[c].length}）`, '', '| D2 id | 英文 |', '| --- | --- |');
    for (const u of rows[c]) out.push(`| \`${u.id}\` | ${u.en ?? ''} |`);
    out.push('');
  }
  return cats.reduce((s, c) => s + rows[c].length, 0);
}

/** tools/d2-names/report.md: the rows left unnamed, the rows with no English name, then what the scope rules left out */
export function writeReport() {
  const out = [
    '# 改名报告',
    '',
    '由 `tools/d2-import.mjs` 生成，不要手改。一行要有中文名（`name`）和英文名（`nameEn`）才收录；下面列出缺名字的行，它们导入时不收录，所以不会出现在掉落里。在对应的 `tools/d2-names/<类别>.json` 里补上再导入就会收录。',
    '',
    '## 缺中文名的行',
    '',
  ];
  const n = table(out, unnamed, '所有收录范围内的行都有中文名。');
  out.push('## 缺英文名的行', '', '有中文名、还没有英文名的行。英文名的规则见 `style-en.md`，音译用 `glossary-en.json`。', '');
  const e = table(out, noEnglish, '所有收录范围内的行都有英文名。');
  out.push(
    '## 范围说明',
    '',
    '- 天梯专属：只有在固定版本（3.x）和 2.7 里都是天梯专属的行才排除。',
    '  - 第 15 赛季把 9 件老暗金（Gravenspine、The Battlebranch、Bane Ash、Pluckeye、Piercerib、Blinkbats Form、The Ward、Manald Heal、Bloodletter）和天使套装（Angelic Raiment）的 4 件改成天梯专属。它们在 2.7（术士资料片之前）是普通物品，所以照 2.7 的行收录，中英文名都按两份规范起好了。',
    '  - 2.6 的符文之语正好相反：2.7 里是天梯专属，固定版本里已经开放，也收录。',
    '',
    '## 按范围排除的行',
    '',
    '这些行不起名也不收录：术士资料片新增的内容、底材不收录的物品、没有属性的未用行等。',
    '',
  );
  for (const [c, reasons] of Object.entries(excluded)) {
    for (const [why, ids] of Object.entries(reasons)) out.push(`- ${c}，${why}（${ids.length}）：${ids.map((x) => `\`${x}\``).join('、')}`);
  }
  out.push('');
  fs.writeFileSync(path.join(DIR, 'report.md'), out.join('\n'));
  console.log(`tools/d2-names/report.md: ${n} unnamed rows, ${e} with no English name`);
}
