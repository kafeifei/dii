// D2 magic and rare affixes (src/items/d2/affixes.ts): the affix level by hand, the eligible rows
// against a filter written here from the tables, the weighted pick against its exact odds, magic
// prefix/suffix odds, rare counts and sides, rare names, automagic, staff mod tiers and values,
// the level requirement, and the fallbacks when nothing fits.
const N = 40000;

function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: ${a} ≠ ${b}`);
}
function near(a, b, tol, what) {
  if (Math.abs(a - b) > tol) throw new Error(`${what}: ${a.toFixed(4)} not within ${tol} of ${b.toFixed(4)}`);
}
function ok(c, what) {
  if (!c) throw new Error(what);
}
const sigma = (p, n) => 4 * Math.sqrt((p * (1 - p)) / n) + 1e-3;

export default async (load) => {
  const A = await load('/src/items/d2/affixes.ts');
  const Q = await load('/src/items/d2/quality.ts');
  const { d2Base, D2_BASES } = await load('/src/items/d2/bases.ts');
  const { D2X_PREFIXES, D2X_SUFFIXES, D2X_AUTOMAGIC } = await load('/src/data/d2x/affixes.ts');
  const { D2X_RARE_PREFIXES, D2X_RARE_SUFFIXES } = await load('/src/data/d2x/rare.ts');
  const { D2X_ITEM_TYPES } = await load('/src/data/d2x/itemtypes.ts');
  const { D2X_UNIQUES } = await load('/src/data/d2x/uniques.ts');
  const { CLASS_SKILLS } = await load('/src/items/d2/classskills.ts');
  const { RNG } = await load('/src/core/math.ts');
  const rng = new RNG(20261026);

  // ── affix level (ItemsMagic.cpp:132-158) ──
  const hax = d2Base('hax'); // qlvl 3
  eq(A.affixLevel(hax, 10), 10 - 1, 'hand axe ilvl 10');
  eq(A.affixLevel(hax, 1), 3 - 1, 'ilvl below qlvl counts as qlvl');
  eq(A.affixLevel(hax, 99), 99, 'ilvl 99');
  const high = Object.values(D2_BASES).find((b) => b.qlvl === 85 && !b.magicLvl);
  eq(A.affixLevel(high, 60), 2 * 85 - 99, 'qlvl 85 at ilvl 60: 2 × 85 − 99');
  eq(A.affixLevel(high, 50), 2 * 85 - 99, 'qlvl 85 at ilvl 50 counts as 85');
  const ci0 = d2Base('ci0');
  eq(A.affixLevel(ci0, 40), Math.max(40, ci0.qlvl) + 3, 'circlet: + magic level 3');
  eq(A.affixLevel(d2Base('wnd'), 99), 99, 'wand at 99: capped');
  eq(A.affixLevel(d2Base('wnd'), 20), 21, 'wand: + magic level 1');

  // ── eligible rows against a filter written from the tables ──
  const chain = (t, s = new Set()) => {
    if (!t || s.has(t)) return s;
    s.add(t);
    for (const u of D2X_ITEM_TYPES[t]?.up ?? []) chain(u, s);
    return s;
  };
  const expected = (b, ilvl, kind, rare) => {
    const types = chain(b.type);
    const alvl = A.affixLevel(b, ilvl);
    const cls = D2X_ITEM_TYPES[b.type].cls;
    const rows = { prefix: D2X_PREFIXES, suffix: D2X_SUFFIXES, auto: D2X_AUTOMAGIC }[kind];
    return rows
      .filter((a) => (kind === 'auto' ? a.group === b.autoPrefix : a.spawnable) && a.freq > 0 && (!rare || a.rare))
      .filter((a) => !a.cls || !cls || a.cls === cls)
      .filter((a) => a.itypes.some((t) => types.has(t)) && !(a.etypes ?? []).some((t) => types.has(t)))
      .filter((a) => a.level <= alvl && (!a.maxLevel || alvl <= a.maxLevel))
      .filter((a) => a.props[0].c !== 'sock' || Q.maxSockets(b, ilvl, 2) > 0)
      .map((a) => a.id)
      .join();
  };
  const SAMPLE = ['hax', '9ha', 'rin', 'amu', 'jew', 'cm1', 'cm3', 'ob1', 'wnd', 'sst', 'scp', 'ne1', 'pa1', 'am1', 'am5', 'ktr', '7ar', 'ci0', 'ci3', 'cap', 'lbt', 'lbl', 'buc', 'qui', 'tkf', 'jav', 'ba1', 'dr1', 'aqv', 'hdm'];
  for (const code of SAMPLE) {
    const b = d2Base(code);
    for (const ilvl of [1, 8, 20, 35, 60, 85, 99])
      for (const kind of ['prefix', 'suffix', 'auto'])
        for (const rare of [false, true])
          eq(A.affixPool(b, ilvl, kind, rare).rows.map((a) => a.id).join(), expected(b, ilvl, kind, rare), `${code} ${ilvl} ${kind} ${rare ? 'rare' : 'magic'} pool`);
  }
  // a few rows by hand: a weapon row with staves as etype skips them; a Paladin row skips
  // Necromancer shields; Mechanic's (420) needs a base that takes sockets; Archer's (auto 2) never
  // on rare bows
  const has = (b, ilvl, kind, id, rare) => A.affixPool(b, ilvl, kind, rare).rows.some((a) => a.id === id);
  const notStaff = D2X_PREFIXES.find((a) => a.etypes?.includes('staf') && a.itypes.includes('weap') && a.spawnable && a.freq && a.level < 40);
  ok(has(hax, 60, 'prefix', notStaff.id) && !has(d2Base('sst'), 60, 'prefix', notStaff.id), `${notStaff.en}: axes, not staves`);
  const palShield = [...D2X_PREFIXES, ...D2X_SUFFIXES].find((a) => a.cls === 'pal' && a.itypes.includes('shld') && a.spawnable && a.freq);
  const kind = D2X_PREFIXES.includes(palShield) ? 'prefix' : 'suffix';
  ok(has(d2Base('buc'), 99, kind, palShield.id), 'paladin row on a buckler (no class)');
  ok(has(d2Base('pa1'), 99, kind, palShield.id), 'paladin row on an auric shield');
  ok(!has(d2Base('ne1'), 99, kind, palShield.id), 'paladin row not on a voodoo head');
  ok(has(hax, 30, 'prefix', 420) && !has(d2Base('hdm'), 50, 'prefix', 420), "Mechanic's needs sockets");
  ok(has(d2Base('am1'), 85, 'auto', 2) && !has(d2Base('am1'), 85, 'auto', 2, true), "Archer's: magic bows only");

  // ── the weighted pick against its exact odds: weight / (total + 1), the last row +1 ──
  for (const [code, ilvl, kind] of [['hax', 30, 'prefix'], ['ob1', 30, 'suffix'], ['amu', 70, 'prefix']]) {
    const b = d2Base(code);
    const pool = A.affixPool(b, ilvl, kind);
    const w = (a) => (b.magicLvl ? a.level * a.freq : a.freq);
    eq(pool.total, pool.rows.reduce((s, a) => s + w(a), 0), `${code} total weight`);
    const n = new Map();
    for (let i = 0; i < N; i++) {
      const a = A.pickAffix(pool, b, rng);
      n.set(a.id, (n.get(a.id) ?? 0) + 1);
    }
    pool.rows.forEach((a, i) => {
      const p = (w(a) + (i === pool.rows.length - 1 ? 1 : 0)) / (pool.total + 1);
      near((n.get(a.id) ?? 0) / N, p, sigma(p, N), `${code} ${kind} ${a.en}`);
    });
  }

  // ── magic: 1/4 prefix only, 1/4 both, 1/2 suffix only; never one group twice ──
  {
    const c = { pre: 0, both: 0, suf: 0 };
    for (let i = 0; i < N; i++) {
      const m = A.rollMagicAffixes(hax, 30, rng);
      ok(m, 'hand axe always magic');
      ok(m.prefixes.length <= 1 && m.suffixes.length <= 1, 'one prefix and one suffix at most');
      if (m.prefixes.length && m.suffixes.length) {
        c.both++;
        ok(A.affixRow('prefix', m.prefixes[0]).group !== A.affixRow('suffix', m.suffixes[0]).group, 'magic: same group twice');
      } else if (m.prefixes.length) c.pre++;
      else c.suf++;
    }
    near(c.pre / N, 0.25, sigma(0.25, N), 'prefix only');
    near(c.both / N, 0.25, sigma(0.25, N), 'both');
    near(c.suf / N, 0.5, sigma(0.5, N), 'suffix only');
  }

  // ── rare: {3,4,4,5,5,5,6,6} affixes, jewels 3–4; ≤ 3 a side; rare rows; one per group; name words ──
  const wordFits = (w, b) => {
    const types = chain(b.type);
    return w.itypes.some((t) => types.has(t)) && !(w.etypes ?? []).some((t) => types.has(t));
  };
  for (const [code, ilvl, dist] of [
    ['amu', 85, { 3: 1 / 8, 4: 2 / 8, 5: 3 / 8, 6: 2 / 8 }],
    ['hax', 30, { 3: 1 / 8, 4: 2 / 8, 5: 3 / 8, 6: 2 / 8 }],
    ['jew', 50, { 3: 1 / 2, 4: 1 / 2 }],
  ]) {
    const b = d2Base(code);
    const n = {};
    for (let i = 0; i < N / 2; i++) {
      const r = A.rollRareAffixes(b, ilvl, rng);
      ok(r, `${code}: rare`);
      ok(r.prefixes.length <= 3 && r.suffixes.length <= 3, `${code}: more than 3 a side`);
      const rows = [...r.prefixes.map((id) => A.affixRow('prefix', id)), ...r.suffixes.map((id) => A.affixRow('suffix', id))];
      ok(rows.every((a) => a.rare), `${code}: a magic-only row on a rare`);
      eq(new Set(rows.map((a) => a.group)).size, rows.length, `${code}: one group twice`);
      ok(rows.every((a) => a.level <= A.affixLevel(b, ilvl)), `${code}: row above the affix level`);
      ok(wordFits(D2X_RARE_PREFIXES.find((w) => w.id === r.rareName[0]), b), `${code}: rare prefix word`);
      ok(wordFits(D2X_RARE_SUFFIXES.find((w) => w.id === r.rareName[1]), b), `${code}: rare suffix word`);
      n[rows.length] = (n[rows.length] ?? 0) + 1;
    }
    for (const [k, p] of Object.entries(dist)) near((n[k] ?? 0) / (N / 2), p, sigma(p, N / 2), `${code} ${k} affixes`);
    eq(Object.keys(n).length, Object.keys(dist).length, `${code}: affix counts`);
  }
  for (const code of ['hax', 'rin', 'jew', 'ob1', 'am1', 'ci0', 'lbl']) {
    const b = d2Base(code);
    eq(A.rareWords(b, 'prefix').map((w) => w.id).join(), D2X_RARE_PREFIXES.filter((w) => wordFits(w, b)).map((w) => w.id).join(), `${code} rare prefix words`);
    eq(A.rareWords(b, 'suffix').map((w) => w.id).join(), D2X_RARE_SUFFIXES.filter((w) => wordFits(w, b)).map((w) => w.id).join(), `${code} rare suffix words`);
  }
  eq(A.rollRareAffixes(d2Base('cm1'), 50, rng), undefined, 'charms are never rare');

  // ── the item: automagic, staff mods, fallbacks, requirement ──
  const make = (spec, quality) => A.rollAffixes(Q.dropQuality({ ...spec, quality }, rng), spec, rng);
  let archers = 0;
  for (let i = 0; i < 4000; i++) {
    const o = make({ code: 'ob1', ilvl: 30 }, i % 2 ? 'normal' : 'rare');
    ok(o.autoAffix !== undefined && A.affixRow('auto', o.autoAffix).group === 303, 'orbs always get a group 303 automagic');
    const r = make({ code: 'am1', ilvl: 85 }, 'rare');
    ok(r.autoAffix !== 2, "a rare bow with Archer's");
    if (make({ code: 'am1', ilvl: 85 }, 'magic').autoAffix === 2) archers++;
    const u = make({ code: 'am1', ilvl: 85 }, 'unique');
    ok(u.quality !== 'unique' || (u.autoAffix === undefined && !u.staffMods), 'uniques: no automagic or staff mods');
  }
  ok(archers > 0, "magic bows get Archer's");

  // staff mods: 31 / 40 / 20 / 9 %, tiers around the item level, +1 60 % / +2 30 % / +3 10 %
  const wnd = d2Base('wnd');
  const nec = CLASS_SKILLS.nec.map((s) => s[0]);
  const tierOf = (name) => Math.floor(nec.indexOf(name) / 5) + 1;
  {
    const counts = [0, 0, 0, 0];
    const tiers = {};
    const vals = [0, 0, 0, 0];
    let mods = 0;
    let dagger = 0;
    for (let i = 0; i < N; i++) {
      const m = A.rollStaffMods(wnd, 40, false, rng) ?? [];
      counts[m.length]++;
      for (const p of m) {
        mods++;
        eq(p.c, 'skill', 'staff mod property');
        eq(p.min, p.max, 'staff mod value');
        vals[p.min]++;
        tiers[tierOf(p.p)] = (tiers[tierOf(p.p)] ?? 0) + 1;
        if (p.p === 'Poison Dagger') dagger++;
      }
    }
    [0.31, 0.4, 0.2, 0.09].forEach((p, k) => near(counts[k] / N, p, sigma(p, N), `${k} staff mods`));
    // ilvl 40: middle tier 5, so tiers 6 / 5 / 4 / 3 at 19 / 50 / 20 / 11 %
    for (const [t, p] of [[6, 0.19], [5, 0.5], [4, 0.2], [3, 0.11]]) near((tiers[t] ?? 0) / mods, p, sigma(p, mods), `staff mod tier ${t}`);
    for (const [v, p] of [[1, 0.6], [2, 0.3], [3, 0.1]]) near(vals[v] / mods, p, sigma(p, mods), `staff mod +${v}`);
    ok(dagger / mods < 0.002, 'Poison Dagger is rerolled on wands');
  }
  for (let i = 0; i < 3000; i++) {
    for (const p of A.rollStaffMods(wnd, 5, false, rng) ?? []) ok(tierOf(p.p) <= 2, 'item level 5: tiers 1–2');
    for (const p of A.rollStaffMods(wnd, 60, true, rng) ?? []) ok(tierOf(p.p) <= 4 && p.min === 1, 'low quality: tier ≤ 4, +1');
    const s = A.rollStaffMods(wnd, 60, false, rng, 60);
    ok(s && s.length >= 1, 'item level counted in: at least one');
    eq(A.rollStaffMods(hax, 60, false, rng), undefined, 'no staff mods on axes');
  }
  // Smite needs a shield: a lone mod only lands on it after six Smite rolls in a row. With three
  // mods in tier 1 the rerolls can run out and the last roll stands, as in D2.
  let smite = 0;
  let lone = 0;
  let smiteOfMany = 0;
  for (let i = 0; i < N; i++) {
    const m = A.rollStaffMods(d2Base('scp'), 3, false, rng) ?? [];
    if (m.length === 1) {
      lone++;
      if (m[0].p === 'Smite') smite++;
    } else if (m.some((p) => p.p === 'Smite')) smiteOfMany++;
  }
  ok(smite / lone < 0.001, 'Smite is rerolled on scepters');
  ok(smiteOfMany > 0, 'six misses: the last roll stands');

  // the level requirement (Items.cpp:1214-1441)
  const req = (o, cls) => A.requiredLevel({ baseId: 'hax', quality: 'magic', socketed: [], ...o }, cls);
  const pre = D2X_PREFIXES.find((a) => a.reqLvl > 20 && a.itypes.includes('weap'));
  const suf = D2X_SUFFIXES.find((a) => a.reqLvl > 5 && a.reqLvl < pre.reqLvl && a.itypes.includes('weap'));
  eq(req({ prefixes: [pre.id], suffixes: [suf.id] }), pre.reqLvl, 'magic: the higher affix');
  eq(req({ quality: 'normal', prefixes: [pre.id] }), hax.reqLvl, 'normal items ignore affix rows');
  const charged = D2X_SUFFIXES.find((a) => a.reqCls && a.reqClsLvl < a.reqLvl);
  eq(req({ suffixes: [charged.id] }), Math.max(hax.reqLvl, charged.reqLvl), 'charged suffix');
  eq(req({ suffixes: [charged.id] }, charged.reqCls), Math.max(hax.reqLvl, charged.reqClsLvl), 'charged suffix, its class');
  eq(req({ quality: 'crafted', prefixes: [pre.id], suffixes: [suf.id] }), pre.reqLvl + 10 + 6, 'crafted: +10, +3 an affix');
  const gnasher = D2X_UNIQUES.find((u) => u.code === 'hax');
  eq(req({ quality: 'unique', uniqueRow: gnasher.id }), Math.max(gnasher.reqLvl, hax.reqLvl), 'unique row');
  eq(req({ quality: 'normal', socketed: ['r01'] }), 11, 'a 1 rune socketed: level 11');
  eq(A.requiredLevel({ baseId: 'wnd', quality: 'normal', socketed: [], staffMods: [{ c: 'skill', p: 'Bone Spear', min: 1, max: 1 }] }), 18, 'staff mod skill level');
  const am1 = d2Base('am1');
  eq(A.requiredLevel({ baseId: 'am1', quality: 'magic', socketed: [], autoAffix: 2 }), 45, "magic: Archer's level");
  eq(A.requiredLevel({ baseId: 'am1', quality: 'normal', socketed: [], autoAffix: 2 }), am1.reqLvl, 'normal: automagic not counted');

  // rollAffixes on top of dropQuality
  for (let i = 0; i < 2000; i++) {
    const spec = { code: 'hax', ilvl: 30 };
    const m = make(spec, 'magic');
    eq(m.quality, 'magic', 'magic axe');
    ok(!m.identified && (m.prefixes || m.suffixes), 'magic axe affixes');
    ok(m.prefixes?.length !== 0 && m.suffixes?.length !== 0, 'no empty affix lists');
    eq(m.reqLvl, A.requiredLevel({ ...m, baseId: 'hax', socketed: [] }), 'reqLvl');
    const r = make(spec, 'rare');
    ok(r.quality === 'rare' && r.rareName && (r.prefixes?.length ?? 0) + (r.suffixes?.length ?? 0) >= 3, 'rare axe');
    ok(A.affixProps(r).length >= 3, 'rare props');
  }
  // fallbacks: elixirs take no affix and no quality row, so magic is made normal; charms aren't rare
  const elx = A.rollAffixes({ quality: 'magic', identified: false, sockets: 0 }, { code: 'elx', ilvl: 30 }, rng);
  ok(elx.quality === 'normal' && elx.identified && !elx.prefixes && !elx.suffixes, 'elixir magic → normal');
  const cm = A.rollAffixes({ quality: 'rare', identified: false, sockets: 0 }, { code: 'cm1', ilvl: 30 }, rng);
  ok(cm.quality === 'magic' && !cm.rareName && (cm.prefixes || cm.suffixes), 'charm rare → magic');

  // same seed, same items; and quick
  const run = (seed) => {
    const g = new RNG(seed);
    const out = [];
    for (let i = 0; i < 300; i++) {
      const spec = { code: ['hax', 'rin', 'ob1', 'wnd', 'am1', 'jew'][i % 6], ilvl: 1 + (i % 99) };
      out.push(A.rollAffixes(Q.dropQuality({ ...spec, quality: i % 3 ? 'rare' : 'magic' }, g), spec, g));
    }
    return JSON.stringify(out);
  };
  eq(run(7), run(7), 'deterministic');
  const t = performance.now();
  for (let i = 0; i < 10000; i++) make({ code: 'amu', ilvl: 80 }, 'rare');
  const ms = performance.now() - t;
  ok(ms < 1500, `10k rare amulets in ${ms.toFixed(0)} ms`);
};
