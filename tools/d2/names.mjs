// Our names for D2's proper nouns: tools/d2-names/<category>.json maps the D2 id to { name, en,
// official?, note? }. The game data only ever takes names from there (or, for generic words like
// gem and base item names, the official string): a row without one is left out and listed in
// tools/d2-names/report.md, so naming and building never block each other.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './load.mjs';

const DIR = path.join(ROOT, 'tools/d2-names');
const maps = {};
const unnamed = {};
const excluded = {};

/** the names of one category: get(id) → our name, or undefined (recorded for the report) */
export function names(category) {
  maps[category] ??= JSON.parse(fs.readFileSync(path.join(DIR, `${category}.json`), 'utf8'));
  const m = maps[category];
  return {
    has: (id) => !!m[id]?.name,
    /** the English the names file was written against, for rows the string tables lack */
    en: (id) => m[id]?.en,
    /** our name for a row; `official` is the official Chinese, which the name must differ from */
    get(id, en, official) {
      const n = m[id]?.name;
      if (!n) {
        const u = (unnamed[category] ??= []);
        if (!u.some((x) => x.id === id)) u.push({ id, en });
        return undefined;
      }
      // (some official strings end in a space)
      const off = official?.trim();
      if (n === off || n === m[id].official) throw new Error(`${category}.json ${id}: ${n} is the official name`);
      // a name written against another row's strings is a mix-up (vip once had its unique's name)
      const other = (a, b) => a && b && a.trim() !== b.trim();
      if (other(m[id].en, en) || other(m[id].official, off)) throw new Error(`${category}.json ${id}: written for "${m[id].en}" / ${m[id].official}, the row is "${en}" / ${off}`);
      return n;
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

/** tools/d2-names/report.md: the rows left unnamed, then what the scope rules left out */
export function writeReport() {
  const out = [
    '# 改名报告',
    '',
    '由 `tools/d2-import.mjs` 生成，不要手改。下面的行没有新名字，导入时不收录，所以不会出现在掉落里；在对应的 `tools/d2-names/<类别>.json` 里补上名字再导入就会收录。',
    '',
  ];
  const cats = Object.keys(unnamed).sort();
  if (!cats.length) out.push('所有收录范围内的行都有名字。', '');
  for (const c of cats) {
    out.push(`## ${c}.json（${unnamed[c].length}）`, '', '| D2 id | 英文 |', '| --- | --- |');
    for (const u of unnamed[c]) out.push(`| \`${u.id}\` | ${u.en ?? ''} |`);
    out.push('');
  }
  out.push('## 按范围排除的行', '', '这些行不起名也不收录：术士资料片新增的内容、仍是天梯专属的物品等。', '');
  for (const [c, reasons] of Object.entries(excluded)) {
    for (const [why, ids] of Object.entries(reasons)) out.push(`- ${c}，${why}（${ids.length}）：${ids.map((x) => `\`${x}\``).join('、')}`);
  }
  out.push('');
  fs.writeFileSync(path.join(DIR, 'report.md'), out.join('\n'));
  const n = cats.reduce((s, c) => s + unnamed[c].length, 0);
  console.log(`tools/d2-names/report.md: ${n} unnamed rows`);
}
