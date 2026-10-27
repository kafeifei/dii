// tools/d2/validation.md: checks the treasure stage against d2data's tcprecalc.json, the drop
// rates d2data precalculates from the same tables (counts: how often each entry of a class comes up
// per run, nodrop aside; droprate: the chance a pick is not "no drop", by player count). The classes
// are D2R 2.7's, so they are checked against 2.7's: the automatic classes item by item, every
// reachable class's direct entries, and the drop rate of each item for a few classes, expanded down
// to the items. Also against the pinned 3.x tables, and a seeded simulation of the drop rules on the
// generated data.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, REF27, ROOT, load, rows } from './load.mjs';
import { OUT_OF_SCOPE_TC } from './scope.mjs';
import { itemTypeTcs, itemsInOrder, parseTc } from './treasure.mjs';

const OUT = path.join(ROOT, 'tools/d2/validation.md');
/** classes whose item-level drop rates the report lists */
// (Andariel itself is not reachable: D2R's MonStats names Andarielq in all her columns; shown for comparison)
const SHOWN = ['Act 1 Equip A', 'Act 1 H2H A', 'Act 1 Champ A', 'Act 1 Super A', 'Blood Raven', 'Andariel', 'Andarielq', 'Countess', 'Act 1 (H) Champ A', 'Andarielq (H)', 'Countess (H)'];
const SIMULATED = ['Andarielq', 'Countess', 'Act 1 H2H A'];
const RUNS = 10000;
const AUTO = /^(weap|armo|mele|bow|abow)\d+$/;

const key = (raw) => String(raw).replace(/"/g, '').split(',')[0].trim();
/** tcprecalc gives a few classes (Countess Rune in 2.7, Duriel) already expanded to items, as "<class> - <item>" */
const expanded = (name, p) => Object.keys(p.counts).some((k) => k.startsWith(`${name} - `));
const entryKey = (name, raw) => (String(raw).startsWith(`${name} - `) ? String(raw).slice(name.length + 3) : key(raw));
// rounded to 12 places first, so float noise does not flip the last digit shown
const fmt = (x) => (x === undefined ? '—' : x === 0 ? '0' : x < 0.0001 ? x.toExponential(2) : (Math.round(x * 1e12) / 1e12).toFixed(4));

/** expected count of each entry per run of a class, nodrop included, children not expanded */
function direct(tc) {
  const total = tc.items.reduce((s, e) => s + e.prob, 0);
  const out = new Map();
  const add = (k, n) => out.set(k, (out.get(k) ?? 0) + n);
  if (tc.picks > 0) {
    for (const e of tc.items) add(e.tc ?? e.item, (tc.picks * e.prob) / (total + (tc.noDrop ?? 0)));
  } else {
    // negative picks: the k-th of −picks drops is the entry whose cumulative range holds k (Items.cpp:2112-2118)
    const n = Math.min(-tc.picks, total);
    let at = 0;
    for (const e of tc.items) {
      add(e.tc ?? e.item, Math.max(0, Math.min(at + e.prob, n) - at));
      at += e.prob;
    }
  }
  return { out, total };
}
/** expected count of each item per run of a class, expanded through its sub-classes */
function leaves(name, get, memo = new Map()) {
  if (memo.has(name)) return memo.get(name);
  const tc = get(name);
  if (!tc) throw new Error(`no treasure class ${name}`);
  const acc = new Map();
  for (const [k, n] of direct(tc).out) {
    if (get(k)) for (const [i, m] of leaves(k, get, memo)) acc.set(i, (acc.get(i) ?? 0) + n * m);
    else acc.set(k, (acc.get(k) ?? 0) + n);
  }
  memo.set(name, acc);
  return acc;
}
/** the same from tcprecalc: counts × droprate for one player */
function leavesPre(name, P, memo = new Map()) {
  if (memo.has(name)) return memo.get(name);
  const p = P[name];
  const acc = new Map();
  const rate = p.droprate['1'];
  for (const [raw, n] of Object.entries(p.counts)) {
    const k = entryKey(name, raw);
    if (P[k]) for (const [i, m] of leavesPre(k, P, memo)) acc.set(i, (acc.get(i) ?? 0) + n * rate * m);
    else acc.set(k, (acc.get(k) ?? 0) + n * rate);
  }
  memo.set(name, acc);
  return acc;
}
const maxDiff = (a, b) => {
  let d = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) d = Math.max(d, Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0)));
  return d;
};

/** the drop rules on the generated data, one kill: picks, nodrop, negative picks, sub-classes (D2GAME_DropTC_6FC51360, Items.cpp:2062-2232) */
function simulate(name, tcs, rnd, drops) {
  const tc = tcs[name];
  const total = tc.items.reduce((s, e) => s + e.prob, 0);
  const pick = (r) => {
    let at = 0;
    for (const e of tc.items) if (r < (at += e.prob)) return e;
  };
  const n = Math.abs(tc.picks);
  // a class with nothing in it drops nothing (Items.cpp:2106-2109)
  if (!total) return;
  for (let k = 0; k < n; k++) {
    let e;
    if (tc.picks < 0) {
      if (k >= total) break;
      e = pick(k);
    } else {
      const r = Math.floor(rnd() * (total + (tc.noDrop ?? 0)));
      if (r < (tc.noDrop ?? 0)) continue;
      e = pick(r - (tc.noDrop ?? 0));
    }
    if (e.tc) simulate(e.tc, tcs, rnd, drops);
    else drops.push(e.item);
  }
}
/** mulberry32: a small seeded generator, so the report does not change between runs */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function writeValidation({ tcs, auto, dropped, bases, baseNames }) {
  const [P, tcJ, weaponsJ, armorJ, miscJ, itypesJ] = await Promise.all(['tcprecalc', 'treasureclassex', 'weapons', 'armor', 'misc', 'itemtypes'].map((n) => load(DATA, n)));
  const [P27, tc27J, weapons27J, armor27J, misc27J, itypes27J] = await Promise.all(['tcprecalc', 'treasureclassex', 'weapons', 'armor', 'misc', 'itemtypes'].map((n) => load(REF27, n)));
  const label = (c) => (baseNames.has(c) ? `\`${c}\` ${baseNames.get(c)}` : `\`${c}\``);
  const md = [
    '# 掉落表校验报告',
    '',
    '由 `tools/d2-import.mjs`（`tools/d2/validate.mjs`）生成，不要手改。掉落表按 D2R 2.7（术士资料片之前的最后一版）的 TreasureClassEx 导入（见 `tools/d2/treasure.mjs`），对照的是 d2data 的 `tcprecalc.json`：它按同样的表预先算好每个掉落表各项的期望次数（`counts`，不含「不掉」）和每次抽取不落空的概率（`droprate`，按玩家人数），2.7 和固定版本（3.3）各一份。下面都按 1 个玩家算，不计每次最多 6 件的上限（Items.cpp:2076-2078、2540-2544）。',
    '',
  ];

  // ───────────────────────── 1. automatic classes ─────────────────────────
  const rawAuto = itemTypeTcs({ itemTypes: rows(itypesJ), items: itemsInOrder(weaponsJ, armorJ, miscJ) });
  const cmpAuto = (built, pre) => {
    const names = [...new Set([...[...built].filter(([, t]) => t.items.length).map(([n]) => n), ...Object.keys(pre).filter((n) => AUTO.test(n))])];
    const bad = [];
    let worst = 0;
    for (const n of names) {
      const t = built.get(n);
      const mine = t ? direct(t).out : new Map();
      const theirs = new Map(Object.entries(pre[n]?.counts ?? {}).map(([k, v]) => [key(k), v]));
      const d = maxDiff(mine, theirs);
      worst = Math.max(worst, d);
      if (d > 1e-12) bad.push(n);
    }
    return { names, bad, worst };
  };
  const a1 = cmpAuto(rawAuto, P);
  const auto27 = itemTypeTcs({ itemTypes: rows(itypes27J), items: itemsInOrder(weapons27J, armor27J, misc27J) });
  const a2 = cmpAuto(auto, P27);
  const a3 = cmpAuto(auto27, P27);
  const autoUsed = [...auto.keys()].filter((n) => tcs[n]);
  const changed = autoUsed.filter((n) => {
    const r = rawAuto.get(n).items.map((e) => e.item).join();
    return r !== auto.get(n).items.map((e) => e.item).join();
  });
  md.push(
    '## 1. 自动掉落表（weapN、armoN、meleN、bowN、abowN）',
    '',
    'treasureclassex 里引用、但没有定义的这些表，按 D2MOO `DATATBLS_CreateItemTypeTreasureClasses`（MonsterTbls.cpp:2752-2851）在导入时生成：ItemTypes 里带 TreasureClass 标记的类型，按 3、6……96 级各一张表，收这一类型（含 type2 和 Equiv 上溯）里可掉落、非任务、物品等级在（N−3, N] 的底材，权重是底材自身类型的 Rarity（至少 1），投掷药水只进它自己类型的表。',
    '',
    `- 用固定版本的全部底材（含术士物品）重建，和同版本的 tcprecalc 逐件比对：${a1.names.length} 张表，${a1.names.length - a1.bad.length} 张完全一致，最大偏差 ${fmt(a1.worst)}${a1.bad.length ? `；不一致：${a1.bad.join('、')}` : ''}。`,
    `- 用 D2R 2.7（术士资料片之前）的底材重建，和 2.7 的 tcprecalc 比对：${a3.names.length} 张，${a3.names.length - a3.bad.length} 张一致，最大偏差 ${fmt(a3.worst)}${a3.bad.length ? `；不一致：${a3.bad.join('、')}` : ''}。`,
    `- 生成的数据（只用收录范围内的底材）和 2.7 的 tcprecalc 比对：${a2.names.length} 张，${a2.names.length - a2.bad.length} 张一致，最大偏差 ${fmt(a2.worst)}${a2.bad.length ? `；不一致：${a2.bad.join('、')}` : ''}。`,
    `- 收录的 ${autoUsed.length} 张自动表里，${changed.length} 张因为去掉术士物品而和固定版本不同：${changed.map((n) => `${n}（去掉 ${rawAuto.get(n).items.filter((e) => !bases.has(e.item)).map((e) => `\`${e.item}\``).join('、')}）`).join('、') || '无'}。`,
    '',
  );

  // ───────────────────────── 2. direct entries ─────────────────────────
  const TC27 = new Map(rows(tc27J).filter((r) => r['Treasure Class']).map((r) => [r['Treasure Class'], r]));
  const get27 = (n) => auto27.get(n) ?? (TC27.has(n) ? parseTc(TC27.get(n), (w) => (TC27.has(w) || auto27.has(w) ? 'tc' : 'item')) : undefined);
  const explicit = Object.keys(tcs).filter((n) => !auto.has(n));
  const badDirect = [];
  let worstDirect = 0;
  let missing = 0;
  for (const n of explicit) {
    const p = P27[n];
    if (!p) {
      missing++;
      continue;
    }
    const t = get27(n);
    const { out: entries, total } = direct({ ...t, noDrop: 0 });
    const out = expanded(n, p) ? leaves(n, (x) => (x === n ? { ...t, noDrop: 0 } : get27(x))) : entries;
    const theirs = new Map(Object.entries(p.counts).map(([k, v]) => [entryKey(n, k), v]));
    const rate = t.picks > 0 ? total / (total + (t.noDrop ?? 0)) : 1;
    const d = Math.max(maxDiff(out, theirs), Math.abs(rate - p.droprate['1']));
    worstDirect = Math.max(worstDirect, d);
    if (d > 1e-12) badDirect.push(n);
  }
  md.push(
    '## 2. 每张显式掉落表的直接子项',
    '',
    `收录的 ${explicit.length} 张显式掉落表，逐张用 2.7 的原始行算各项的期望次数和不落空概率，和 2.7 的 tcprecalc 比对：${explicit.length - missing - badDirect.length} 张一致${missing ? `，${missing} 张 tcprecalc 里没有` : ''}，最大偏差 ${fmt(worstDirect)}${badDirect.length ? `；不一致：${badDirect.join('、')}` : ''}。`,
    '',
  );

  // ───────────────────────── 3. item drop rates ─────────────────────────
  const TC33 = new Map(rows(tcJ).filter((r) => r['Treasure Class']).map((r) => [r['Treasure Class'], r]));
  const get33 = (n) => rawAuto.get(n) ?? (TC33.has(n) ? parseTc(TC33.get(n), (w) => (TC33.has(w) || rawAuto.has(w) ? 'tc' : 'item')) : undefined);
  const ours = (n) => tcs[n];
  md.push(
    '## 3. 关键掉落表的逐件掉率',
    '',
    '每杀一次（或开一次）期望掉出的件数，一路展开到底材。「本游戏」是生成的数据，「2.7」用 2.7 的原始表和底材，「tcprecalc」用 2.7 的预算结果逐层相乘，「固定版本」用 d2data 固定版本（3.3）的原始表（含术士内容），只作对照。每张表列期望最高的 8 项。',
    '',
  );
  for (const n of SHOWN) {
    const used = !!tcs[n];
    const mine = used ? leaves(n, ours) : null;
    const raw = leaves(n, get27);
    const pre = leavesPre(n, P27);
    const newer = get33(n) ? leaves(n, get33) : null;
    const sum = (m) => [...m.values()].reduce((s, x) => s + x, 0);
    md.push(
      `### ${n}`,
      '',
      `${used ? '' : '本游戏不用这张表（没有怪物、超级暗金怪或宝箱引用它），只作对照。'}2.7 对 tcprecalc 的最大偏差 ${fmt(maxDiff(raw, pre))}；每次合计：${used ? `本游戏 ${fmt(sum(mine))} 件，` : ''}2.7 ${fmt(sum(raw))} 件${newer ? `，固定版本 ${fmt(sum(newer))} 件` : ''}。`,
      '',
      '| 物品 | 本游戏 | 2.7 | tcprecalc | 固定版本 |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const [k] of [...(mine ?? raw)].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      md.push(`| ${label(k)} | ${mine ? fmt(mine.get(k)) : '—'} | ${fmt(raw.get(k))} | ${fmt(pre.get(k))} | ${newer ? fmt(newer.get(k) ?? 0) : '—'} |`);
    }
    md.push('');
  }

  // ───────────────────────── 4. out-of-scope entries ─────────────────────────
  md.push('## 4. 去掉的范围外条目', '', '2.7 的掉落表没有术士资料片的条目。收录的表里如果还有不在范围内的条目（恐怖地带的分解护符和 Desecrated 表，没有收录的物品），在这里列出；它们去掉后，其余概率按剩下的权重算。', '');
  if (!dropped.length) md.push('无。', '');
  else {
    md.push('| 掉落表 | 去掉的条目 | 权重 | 原因 |', '| --- | --- | --- | --- |');
    for (const d of dropped) {
      const t = get27(d.tc);
      const total = t.items.reduce((s, e) => s + e.prob, 0) + (t.noDrop ?? 0);
      md.push(`| ${d.tc} | ${d.entry} | ${d.prob}/${total} | ${d.why} |`);
    }
    md.push('');
  }

  // ───────────────────────── 5. against the pinned 3.x tables ─────────────────────────
  // What the pinned table would have given, its out-of-scope entries taken out the way the treasure
  // stage takes them out (classes of the expansion, items not imported, classes left with nothing),
  // against what the game gets: each entry's expected count per run and the quality factors. Rows
  // written differently with the same effect (Act 1 Champ A's Cpot weight 2 → 1 under picks −2) do
  // not count.
  const trimmed = new Map();
  const trim33 = (n) => {
    if (trimmed.has(n)) return trimmed.get(n);
    const t = get33(n);
    trimmed.set(n, t);
    const gone = (e) => (e.tc ? OUT_OF_SCOPE_TC.test(e.tc) || (get33(e.tc).items.length > 0 && !trim33(e.tc).items.length) : !bases.has(e.item));
    const out = { ...t, items: t.items.filter((e) => !gone(e)) };
    trimmed.set(n, out);
    return out;
  };
  const QF = ['unique', 'set', 'rare', 'magic'];
  const effect = (t) => {
    const { out } = direct(t);
    return { counts: new Map([...out].map(([k, v]) => [k, Math.round(v * 1e9) / 1e9])), q: QF.map((q) => t[q] ?? 0).join('/') };
  };
  const show = (e) => `${[...e.counts].map(([k, v]) => `${k} ${fmt(v)}`).join('，')}${e.q !== '0/0/0/0' ? `；品质 ${e.q}` : ''}`;
  const diffs = [];
  let absent = 0;
  for (const n of explicit) {
    if (!TC33.has(n)) {
      absent++;
      continue;
    }
    const a = effect(trim33(n));
    const b = effect(tcs[n]);
    if (a.q !== b.q || maxDiff(a.counts, b.counts) > 1e-9) diffs.push([n, a, b]);
  }
  md.push(
    '## 5. 和固定版本（3.3）的差异',
    '',
    `固定版本的掉落表是术士资料片之后的：资料片把它的掉落表条目写进老表时（地狱的 Citem、Uitem 和 Andarielq），一并改了这些行的权重，去掉那些条目后仍和 2.7 不同，所以掉落表按 2.7 导入。收录的显式掉落表里 ${explicit.length - absent} 张在固定版本里也有，其中 ${diffs.length} 张的效果（每次各项的期望次数，含「不掉」；品质系数 暗金/套装/稀有/魔法）不同，列在这里${absent ? `；另有 ${absent} 张固定版本里没有` : ''}。「固定版本」一栏已去掉术士条目。`,
    '',
  );
  if (diffs.length) {
    md.push('| 掉落表 | 固定版本 | 本游戏（2.7） |', '| --- | --- | --- |');
    for (const [n, a, b] of diffs) md.push(`| ${n} | ${show(a)} | ${show(b)} |`);
    md.push('');
  }

  // ───────────────────────── 6. simulation ─────────────────────────
  md.push(
    '## 6. 模拟',
    '',
    `在生成的数据上按掉落规则（负数 Picks 按顺序、nodrop、子表各自的 Picks）用固定种子各模拟 ${RUNS} 次，和第 3 节的期望比对。z 是（模拟 − 期望）/ 标准误差，按泊松近似；6 件以上一栏是一次掉落超过 6 件、会被上限截掉的比例。`,
    '',
    '| 掉落表 | 期望件数 | 模拟件数 | 最大 \\|z\\|（期望 ≥ 0.01 的物品） | 超过 6 件 |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const n of SIMULATED) {
    const rnd = seeded(0x5eed + n.length);
    const counts = new Map();
    let over = 0;
    let all = 0;
    for (let i = 0; i < RUNS; i++) {
      const drops = [];
      simulate(n, tcs, rnd, drops);
      if (drops.length > 6) over++;
      all += drops.length;
      for (const d of drops) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const exp = leaves(n, ours);
    let z = 0;
    for (const [k, v] of exp) if (v >= 0.01) z = Math.max(z, Math.abs((counts.get(k) ?? 0) / RUNS - v) / Math.sqrt(v / RUNS));
    const e = [...exp.values()].reduce((s, x) => s + x, 0);
    md.push(`| ${n} | ${fmt(e)} | ${fmt(all / RUNS)} | ${z.toFixed(2)} | ${((100 * over) / RUNS).toFixed(1)}% |`);
  }
  md.push('');

  fs.writeFileSync(OUT, md.join('\n'));
  const ok = !a1.bad.length && !badDirect.length;
  console.log(`tools/d2/validation.md: automatic classes ${a1.names.length - a1.bad.length}/${a1.names.length} match tcprecalc, direct entries ${explicit.length - missing - badDirect.length}/${explicit.length - missing}`);
  if (!ok) throw new Error('treasure classes do not match tcprecalc.json: see tools/d2/validation.md');
}
