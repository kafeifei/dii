// Treasure classes (src/items/d2/treasure.ts) and the drops wired on them (src/items/gen.ts dropTc,
// src/game/loot.ts): positive picks against NoDrop, negative picks in order, classes named by
// entries with their own picks, quality ratios inherited, empty classes, the 6-item cap, NoDrop for
// more players, group upgrades by level, the monster's class by rank and quest, chests' classes by
// area level, gold with its mul and gold find (none on the pile that reaches the cap); then the
// game's classes worked out exactly (uncapped, d2data's tcprecalc: tools/d2/validation.md), and
// 10 000 kills of each with the cap against that, item by item and quality by quality; and the
// game's monsters, chests and barrels dropping through them.
const N = 20000;

function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
function ok(c, what) {
  if (!c) throw new Error(what);
}
const near = (a, b, tol, what) => ok(Math.abs(a - b) <= tol, `${what}: ${a} not within ${tol} of ${b}`);

const QK = ['unique', 'set', 'rare', 'magic'];
const bump = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
const sum = (m) => [...m.values()].reduce((s, x) => s + x, 0);

/**
 * One drop of a class worked out exactly from the drop rules, with a cap of max items: the mean
 * and variance a kill of each statistic weigh gives an item (by default its code's count), each
 * item's expected count by its code and the quality ratios its chain hands it, the higher of
 * parent's and child's (picks), and the chance of each number of items (dist). The state is how
 * many items are out so far, each with its chance and the statistics' sums and squares over it;
 * at max it is done and nothing more is picked anywhere. A pick of a class with picks > 0 splits
 * the state by NoDrop and the entries' chances; the k-th pick of one with picks < 0 is the entry
 * whose range holds k.
 */
function exact(tcs, name, max = Infinity, weigh = (code) => [[code, 1]]) {
  const picks = new Map();
  const into = (out, n, st, w) => {
    let t = out.get(n);
    if (!t) out.set(n, (t = { p: 0, m1: new Map(), m2: new Map() }));
    t.p += st.p * w;
    for (const [k, v] of st.m1) bump(t.m1, k, v * w);
    for (const [k, v] of st.m2) bump(t.m2, k, v * w);
    return t;
  };
  const scale = (s, w) => [...s].reduce((out, [n, st]) => (into(out, n, st, w), out), new Map());
  const run = (tcName, s, parent) => {
    const tc = tcs[tcName];
    const q = Object.fromEntries(QK.map((k) => [k, Math.max(parent?.[k] ?? 0, tc[k] ?? 0)]));
    const key = QK.map((k) => q[k]).join('/');
    const total = tc.items.reduce((a, e) => a + e.prob, 0);
    const take = (e, s) => {
      if (e.tc) return run(e.tc, s, q);
      const out = new Map();
      const ws = weigh(e.item, q);
      for (const [n, st] of s) {
        if (n >= max) {
          into(out, n, st, 1);
          continue;
        }
        const t = into(out, n + 1, st, 1);
        for (const [k, w] of ws) {
          bump(t.m2, k, 2 * w * (st.m1.get(k) ?? 0) + st.p * w * w);
          bump(t.m1, k, st.p * w);
        }
        const pk = `${e.item}|${key}`;
        if (!picks.has(pk)) picks.set(pk, { code: e.item, q, n: 0 });
        picks.get(pk).n += st.p;
      }
      return out;
    };
    for (let k = 0; total && k < Math.max(Math.abs(tc.picks), 1); k++) {
      if (tc.picks < 0) {
        if (k >= total) break;
        let acc = 0;
        s = take(tc.items.find((e) => k < (acc += e.prob)), s);
      } else {
        const all = total + (tc.noDrop ?? 0);
        const next = scale(s, (tc.noDrop ?? 0) / all);
        for (const e of tc.items) for (const [n, st] of take(e, scale(s, e.prob / all))) into(next, n, st, 1);
        s = next;
      }
    }
    return s;
  };
  const end = run(name, new Map([[0, { p: 1, m1: new Map(), m2: new Map() }]]));
  const mean = new Map();
  const sq = new Map();
  for (const st of end.values()) {
    for (const [k, v] of st.m1) bump(mean, k, v);
    for (const [k, v] of st.m2) bump(sq, k, v);
  }
  const variance = new Map([...mean].map(([k, m]) => [k, Math.max(sq.get(k) - m * m, 0)]));
  return { mean, variance, picks, dist: new Map([...end].map(([n, st]) => [n, st.p])) };
}

/** the chance a normal lands more than z of its σ from its mean (erfc(z / √2), Abramowitz & Stegun 7.1.26) */
function tail(z) {
  const x = z / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  return t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
}

/**
 * Counts each z of their σ off their exact values, held to 3σ as a set: one count in 370 lands past
 * 3σ by chance, so among hundreds some always do, and the set gets 3σ's odds instead (a correct drop
 * fails one run in 370). None past the bound any of them passes only that rarely (4.5σ for 400), no
 * more past 3σ than chance puts there (its mean and 3 of its σ), and the z's squared averaging 1
 * within 3σ, so σ is the real spread and not a loose one.
 */
function zCheck(zs) {
  const p3 = tail(3);
  const n = zs.length;
  const each = 1 - (1 - p3) ** (1 / n);
  let lo = 3;
  let hi = 10;
  while (hi - lo > 1e-4) if (tail((lo + hi) / 2) > each) lo = (lo + hi) / 2;
  else hi = (lo + hi) / 2;
  for (const { z, what } of zs) ok(z <= hi, `${what}: ${z.toFixed(2)}σ off, past ${hi.toFixed(2)}σ`);
  const past = zs.filter((e) => e.z > 3);
  ok(past.length <= n * p3 + 3 * Math.sqrt(n * p3), `${past.length} of ${n} past 3σ: ${past.map((e) => e.what).join('; ')}`);
  const z2 = zs.reduce((a, e) => a + e.z * e.z, 0) / n;
  near(z2, 1, 3 * Math.sqrt(2 / n), `${n} z's squared average ${z2.toFixed(3)}`);
  return { n, bound: hi, past: past.map((e) => `${e.what} ${e.z.toFixed(2)}σ`), z2 };
}

/** per-kill counts over many kills: each one's mean a kill */
function tally() {
  const s1 = new Map();
  let kills = 0;
  return {
    add(counts) {
      kills++;
      for (const [k, v] of counts) bump(s1, k, v);
    },
    keys: () => [...s1.keys()],
    mean: (k) => (s1.get(k) ?? 0) / kills,
  };
}

export default async (load) => {
  const T = await load('/src/items/d2/treasure.ts');
  const Q = await load('/src/items/d2/quality.ts');
  const G = await load('/src/items/gen.ts');
  const L = await load('/src/game/loot.ts');
  const B = await load('/src/items/d2/bases.ts');
  const A = await load('/src/items/d2/affixes.ts');
  const LG = await load('/src/items/d2/legendary.ts');
  const { RNG } = await load('/src/core/math.ts');
  const { D2X_TREASURE_CLASSES: TCS } = await load('/src/data/d2x/treasure.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const { D2X_SUPERUNIQUES } = await load('/src/data/d2x/superuniques.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { lookedMonsters, monsterDef } = await load('/src/data/monsters.ts');
  const { areaDef, CAMP_AREA, WILD_AREA, COLD_PLAINS, dungeonArea } = await load('/src/world/areas.ts');
  const rng = new RNG(20261027);
  const codes = (picks) => picks.map((p) => p.code).join(',');

  // ── a made-up table: the rules one by one ──
  const S = {
    pos: { picks: 1, noDrop: 2, items: [{ item: 'a', prob: 1 }, { item: 'b', prob: 3 }] },
    neg: { picks: -3, items: [{ item: 'a', prob: 1 }, { item: 'b', prob: 2 }, { item: 'c', prob: 5 }] },
    short: { picks: -10, items: [{ item: 'a', prob: 1 }, { item: 'b', prob: 2 }] },
    pot: { picks: 2, items: [{ item: 'p', prob: 1 }] },
    champ: { picks: -2, items: [{ tc: 'one', prob: 1 }, { tc: 'pot', prob: 2 }] },
    one: { picks: 1, items: [{ item: 'x', prob: 1 }] },
    many: { picks: 10, items: [{ item: 'g', prob: 1 }] },
    empty: { picks: 1, items: [] },
    hollow: { picks: 3, items: [{ tc: 'empty', prob: 1 }] },
    root: { picks: 1, unique: 800, rare: 972, items: [{ tc: 'child', prob: 1 }] },
    child: { picks: 1, unique: 700, set: 500, items: [{ tc: 'leaf', prob: 1 }] },
    leaf: { picks: 1, items: [{ item: 'q', prob: 1 }] },
    grpA: { group: 9, level: 0, picks: 1, items: [{ item: 'a', prob: 1 }], next: 'grpB' },
    grpB: { group: 9, level: 5, picks: 1, items: [{ item: 'b', prob: 1 }], next: 'grpC' },
    grpC: { group: 9, level: 10, picks: 1, items: [{ item: 'c', prob: 1 }] },
  };
  // picks > 0: one roll in total + noDrop, 2 of 6 nothing, then by weight
  const seen = { none: 0, a: 0, b: 0 };
  for (let i = 0; i < N; i++) {
    const p = T.evalTc('pos', rng, { tcs: S });
    seen[p.length ? p[0].code : 'none']++;
  }
  near(seen.none / N, 1 / 3, 0.015, 'NoDrop 2 against 4: a third drops nothing');
  near(seen.a / N, 1 / 6, 0.012, 'a at 1 of 6');
  near(seen.b / N, 1 / 2, 0.015, 'b at 3 of 6');
  // picks < 0: the k-th pick is the entry whose range holds k, no roll
  eq(codes(T.evalTc('neg', rng, { tcs: S })), 'a,b,b', 'negative picks drop in order, each entry its chance times');
  eq(codes(T.evalTc('short', rng, { tcs: S })), 'a,b,b', 'negative picks stop at the total');
  // a named class runs with its own picks: the champion's item, then its two potions
  eq(codes(T.evalTc('champ', rng, { tcs: S })), 'x,p,p', 'a champion-like class: one pick of an item class and the potion class with 2 picks');
  // an empty class drops nothing, and naming it uses the pick up
  eq(T.evalTc('empty', rng, { tcs: S }).length, 0, 'an empty class');
  eq(T.evalTc('hollow', rng, { tcs: S }).length, 0, 'picks of an empty class');
  // at most 6 items a drop
  eq(T.evalTc('many', rng, { tcs: S }).length, 6, 'ten picks stop at 6 items');
  eq(T.evalTc('many', rng, { tcs: S, max: Infinity }).length, 10, 'without the cap all ten');
  // quality ratios: the higher of parent and child, the parent's where the child has none, the child's where the parent has none
  const q = T.evalTc('root', rng, { tcs: S })[0].tc;
  eq(JSON.stringify(q), JSON.stringify({ unique: 800, set: 500, rare: 972, magic: 0 }), 'quality ratios inherited down two classes');
  // NoDrop for more players (Items.cpp:2146-2165): Act 1 H2H A's 100 against 60
  const h2h = TCS['Act 1 H2H A'];
  eq(T.noDropFor(h2h, 1), 100, 'one player keeps NoDrop');
  eq(T.noDropFor(h2h, 2), 38, 'two players: 60 / (1 − 0.625²) × 0.625²');
  eq(T.noDropFor(h2h, 3), 19, 'three players');
  const dropRate = (players) => {
    let n = 0;
    for (let i = 0; i < N; i++) n += T.evalTc('Act 1 H2H A', rng, { players }).length;
    return n / N;
  };
  near(dropRate(1), 60 / 160, 0.012, 'H2H A drops 3 times in 8 for one player');
  near(dropRate(3), 60 / 79, 0.012, 'and more often for three');
  // group upgrades by level, only forward
  eq(T.tcAtLevel('grpA', 0, S), 'grpA', 'level 0 stays');
  eq(T.tcAtLevel('grpA', 4, S), 'grpA', 'below the next level stays');
  eq(T.tcAtLevel('grpA', 5, S), 'grpB', 'at the next level moves');
  eq(T.tcAtLevel('grpA', 30, S), 'grpC', 'to the last it reaches');
  eq(T.tcAtLevel('grpB', 1, S), 'grpB', 'never back');

  // ── the monster's class (MonsterMode.cpp:491-573) ──
  const tri = (tc) => ({ tc });
  const mon = {
    id: 'test',
    diff: [
      tri({ regular: 'pos', champ: 'champ', unique: 'neg', quest: 'one' }),
      tri({ regular: 'grpA', champ: 'grpA', unique: 'grpA' }),
      tri({ regular: 'grpA', champ: 'grpA', unique: 'grpA' }),
    ],
  };
  const mt = (m, spec) => T.monsterTc(m, { mlvl: 1, ...spec }, S);
  eq(mt(mon, { difficulty: 0, rank: 'regular' }), 'pos', 'regular');
  eq(mt(mon, { difficulty: 0, rank: 'champion' }), 'champ', 'champion');
  eq(mt(mon, { difficulty: 0, rank: 'unique' }), 'neg', 'unique');
  eq(mt({ ...mon, questTc: { quest: 6, cp: 1 } }, { difficulty: 0, rank: 'regular' }), 'one', 'the quest class until the quest is done');
  eq(mt({ ...mon, questTc: { quest: 6, cp: 1 } }, { difficulty: 0, rank: 'regular', questDone: true }), 'pos', 'and its own after');
  eq(mt(mon, { difficulty: 0, rank: 'regular', mlvl: 50 }), 'pos', 'normal never moves up');
  eq(mt(mon, { difficulty: 1, rank: 'regular', mlvl: 7 }), 'grpB', 'nightmare moves up to the monster level');
  eq(mt({ ...mon, boss: true }, { difficulty: 2, rank: 'regular', mlvl: 70 }), 'grpA', 'a boss does not');
  eq(mt({ ...mon, noRatio: true }, { difficulty: 2, rank: 'regular', mlvl: 70 }), 'grpA', 'nor a noRatio monster');
  const su = { tc: ['many', 'grpA', 'grpA'] };
  eq(mt(mon, { difficulty: 0, rank: 'regular', su }), 'many', "a superunique's own class");
  eq(mt(mon, { difficulty: 0, rank: 'unique', su: { tc: ['', 'grpA', 'grpA'] } }), undefined, "none in its column: nothing, not its monster's unique class (MonsterMode.cpp:508-513)");
  // the data's
  const z = D2X_MONSTERS.zombie1;
  eq(T.monsterTc(z, { difficulty: 0, rank: 'regular', mlvl: 1 }), 'Act 1 H2H A', 'zombie1');
  eq(T.monsterTc(z, { difficulty: 0, rank: 'champion', mlvl: 3 }), 'Act 1 Champ A', 'zombie1 champion');
  eq(T.monsterTc(z, { difficulty: 0, rank: 'unique', mlvl: 4 }), 'Act 1 Unique A', 'zombie1 unique');
  eq(T.monsterTc(D2X_MONSTERS.quillrat1, { difficulty: 0, rank: 'regular', mlvl: 1 }), 'Quill 1', 'a quill rat');
  eq(T.monsterTc(D2X_MONSTERS.andariel, { difficulty: 1, rank: 'regular', mlvl: 49 }), 'Andarielq (N)', 'Andariel, a boss: her own class in nightmare');
  const bishi = D2X_SUPERUNIQUES.find((s) => s.key === 'Bishibosh');
  eq(T.monsterTc(D2X_MONSTERS[bishi.mon], { difficulty: 0, rank: 'unique', mlvl: 5, su: bishi }), 'Act 1 Super A', "Bishibosh's superunique class");
  // nightmare: a zombie's class moves up its group as far as its level reaches, and no further
  for (const lvl of [36, 40, 45, 60]) {
    const n = T.monsterTc(z, { difficulty: 1, rank: 'regular', mlvl: lvl });
    const t = TCS[n];
    ok(n === z.diff[1].tc.regular || t.level <= lvl, `nightmare zombie at ${lvl}: ${n} is past its level`);
    ok(!t.next || TCS[t.next].level > lvl, `nightmare zombie at ${lvl}: ${n} stops short`);
  }

  // ── chests: Act 1's Chest A, B or C by area level (ObjMode.cpp:3909-3955) ──
  for (const a of D2X_AREAS) {
    for (const d of [0, 1, 2]) {
      const c = T.chestTc({ id: a.id, alvl: a.lvl[d] }, d);
      eq(c.name, a.chestTc[d], `area ${a.id} difficulty ${d}`);
      eq('ABC'[T.chestTcIndex(a.lvl[d], d)], c.name.slice(-1), `the formula agrees with area ${a.id}'s class in difficulty ${d}`);
    }
  }
  // the dungeon floors aren't Act 1 areas: their area level picks the class (Blood Moor 1 to Catacombs 4's 12 in thirds)
  eq(T.chestTc({ id: 1004, alvl: 4 }, 0).name, 'Act 1 Chest A', 'area level 4');
  eq(T.chestTc({ id: 1005, alvl: 5 }, 0).name, 'Act 1 Chest B', 'area level 5');
  eq(T.chestTc({ id: 1009, alvl: 30 }, 0).name, 'Act 1 Chest C', 'area level 30');
  eq(T.chestTc({ id: 1009, alvl: 40 }, 1).name, 'Act 1 (N) Chest C', 'nightmare');
  eq(T.chestTc({ id: 1009, alvl: 40 }, 1).index, 2, 'its index');
  // the index is the level a chest's items' quality is rolled at
  ok(Q.qualityChances({ code: 'cap', ilvl: 30, rollLvl: 0 }).unique > Q.qualityChances({ code: 'cap', ilvl: 30 }).unique, 'a chest rolls quality at its class index, not its item level');

  // ── gold: 1–6 × the item level, × mul / 256, + gold find ──
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < 4000; i++) {
    const g = T.goldAmount(10, rng);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
    eq(T.goldAmount(10, { next: () => 0.5 }, 5), 5 * 35, 'mul 1280 is five times');
    eq(T.goldAmount(10, { next: () => 0.5 }, undefined, 100), 70, '+100% gold find doubles it');
  }
  eq(`${lo}–${hi}`, '10–59', 'gold at item level 10');
  // the item that reaches the cap ends the drop before gold find goes on (Items.cpp:2543-2559): a
  // pile as the 6th item has none, as the 5th it has
  const gold = {
    sixth: { picks: -6, items: [{ item: 'hp1', prob: 5 }, { item: 'gld', prob: 1 }] },
    fifth: { picks: -6, items: [{ item: 'hp1', prob: 4 }, { item: 'gld', prob: 1 }, { item: 'hp1', prob: 1 }] },
  };
  const half = { next: () => 0.5 };
  const pile = (name, opts = {}) => G.dropTc(name, 10, { tcs: gold, gf: 100, rng: half, ...opts }).find(G.isGold).qty;
  eq(pile('sixth'), 35, 'the 6th item, no gold find');
  eq(pile('fifth'), 70, 'the 5th, +100%');
  eq(pile('sixth', { max: Infinity }), 70, 'no cap, no last item');

  // ── the game's classes against the exact drop ──
  // uncapped, the items a drop comes to are tcprecalc's, per kill (tools/d2/validation.md)
  const tcprecalc = { 'Act 1 H2H A': 0.375, 'Act 1 Champ A': 3, 'Act 1 Super A': 6, 'Blood Raven': 3.4167, Andarielq: 3.7561, Countess: 5.8321 };
  for (const [name, want] of Object.entries(tcprecalc)) near(sum(exact(TCS, name).mean), want, 1e-4, `${name}: items a drop, no cap`);
  const uncapped = (name, code) => exact(TCS, name).mean.get(code);
  near(uncapped('Act 1 Champ A', 'hp1'), 0.9412, 1e-4, "Champ A's minor healing potions");
  near(uncapped('Act 1 Champ A', 'gld'), 0.6, 1e-4, "Champ A's gold");
  near(uncapped('Blood Raven', 'gld'), 1.1667, 1e-4, "Blood Raven's gold");
  near(uncapped('Andarielq', 'axe'), 0.1042, 1e-4, "Andarielq's axes");
  near(uncapped('Countess', 'r07'), 0.5625, 1e-4, "the Countess's rune 7");
  // the cap, worked out: each of Andarielq's 7 picks drops one item in p = 22/41, all 7 in p^7 of
  // kills, cut to 6, so 7p − p^7 items and every item's count cut by that over 7p
  const aqTotal = TCS.Andarielq.items.reduce((a, e) => a + e.prob, 0);
  const p7 = aqTotal / (aqTotal + TCS.Andarielq.noDrop);
  near(p7, 22 / 41, 1e-12, "Andarielq's chance a pick");
  const aqCapped = exact(TCS, 'Andarielq', 6);
  near(sum(aqCapped.mean), 7 * p7 - p7 ** 7, 1e-12, 'Andarielq with the cap');
  for (const [k, v] of exact(TCS, 'Andarielq').mean) near(aqCapped.mean.get(k), (v * (7 * p7 - p7 ** 7)) / (7 * p7), 1e-12, `Andarielq's ${k} with the cap`);
  // the Countess: her items' 5 picks first, then the runes' 3, which the cap cuts when the items come to 4 or 5
  const ctCapped = exact(TCS, 'Countess', 6);
  ok(Math.max(...ctCapped.dist.keys()) === 6, 'the Countess reaches the cap');
  ok(ctCapped.mean.get('r07') < uncapped('Countess', 'r07') - 0.01, 'the cap takes some of her runes');
  near(ctCapped.mean.get('gld'), uncapped('Countess', 'gld'), 1e-12, 'never her gold');

  // 10 000 kills of each, with the cap: each item's count a kill (evalTc's picks) and each
  // quality's (dropTc, the items made as the game drops them) against the exact ones, z their
  // distance in σ, the exact spread of a kill's count over the kills (zCheck below). Seeded, and the
  // picks have their own stream, so a change to how items are made leaves them be.
  // The quality an item ends up with, exactly: qualityOdds' roll, then what making it does to that
  // (d2/quality.ts dropQuality, d2/affixes.ts rollAffixes): a unique with no row to make is rare and
  // a set item with none magic (ItemMode.cpp:6689-6700, 6787-6798), a rare with no rare affixes
  // magic, a magic item with no affixes superior or normal, low and superior normal where they don't apply
  const zero = { next: () => 0 };
  const made = (code, ilvl, q) => {
    // gold is made as a pile (gen.ts makeGold)
    if (code === G.GOLD) return { normal: 1 };
    const b = B.d2Base(code);
    const any = (kind, rare) => A.affixPool(b, ilvl, kind, rare).rows.length > 0;
    const superior = Q.pickSuperior(b, zero) ? 'superior' : 'normal';
    // a suffix is tried whenever no prefix came, a prefix half the time (affixes.ts rollMagicAffixes)
    const magicFails = any('suffix') ? 0 : any('prefix') ? 0.5 : 1;
    const rareFits = B.ownType(b).canRare && A.rareWords(b, 'prefix').length && A.rareWords(b, 'suffix').length && (any('prefix', true) || any('suffix', true));
    const out = {};
    const add = (k, p) => (out[k] = (out[k] ?? 0) + p);
    const magic = (p) => {
      add('magic', p * (1 - magicFails));
      add(superior, p * magicFails);
    };
    const rare = (p) => (rareFits ? add('rare', p) : magic(p));
    for (const [k, p] of Object.entries(Q.qualityOdds({ code, ilvl, tc: q }))) {
      if (!p) continue;
      if (k === 'unique') LG.pickUnique(b, ilvl, zero, { difficulty: 0 }) ? add('unique', p) : rare(p);
      else if (k === 'set') LG.pickSetItem(b, ilvl, zero) ? add('set', p) : magic(p);
      else if (k === 'rare') rare(p);
      else if (k === 'magic') magic(p);
      else if (k === 'superior') add(superior, p);
      else if (k === 'low') add(B.isWeapon(b) || B.isArmor(b) ? 'low' : 'normal', p);
      else add(k, p);
    }
    return out;
  };
  // the item levels D2 drops them at: its monster's level, a champion's 2 up, a superunique's 3
  const ILVL = { 'Act 1 H2H A': 1, 'Act 1 Champ A': 3, 'Act 1 Super A': 5, 'Blood Raven': 10, Andarielq: 12, Countess: 11 };
  const K = 10000;
  const prng = new RNG(1027);
  const qrng = new RNG(2710);
  const lines = [];
  const zs = [];
  for (const [name, ilvl] of Object.entries(ILVL)) {
    const odds = new Map();
    const quality = (code, q) => {
      const k = `${code}|${QK.map((x) => q[x]).join('/')}`;
      if (!odds.has(k)) odds.set(k, made(code, ilvl, q));
      return odds.get(k);
    };
    // a kill's statistics: each code's count, and each quality's count as the picks expect it
    const want = exact(TCS, name, 6, (code, q) => [[`item ${code}`, 1], ...Object.entries(quality(code, q)).map(([k, p]) => [`quality ${k}`, p])]);
    // a quality's spread is its expectation's over the picks and each item's own roll's
    const own = new Map();
    for (const { code, q, n } of want.picks.values()) for (const [k, p] of Object.entries(quality(code, q))) bump(own, `quality ${k}`, n * p * (1 - p));
    const total = (kind) => [...want.mean].filter(([k]) => k.startsWith(kind)).reduce((a, [, v]) => a + v, 0);
    near(total('quality'), total('item'), 1e-9, `${name}: every item has a quality`);
    const got = tally();
    for (let i = 0; i < K; i++) {
      const picks = T.evalTc(name, prng);
      ok(picks.length <= 6, `${name}: ${picks.length} items`);
      // a kill a game: uniques drop once a game
      G.newGameDrops();
      const counts = new Map();
      for (const p of picks) bump(counts, `item ${p.code}`, 1);
      for (const it of G.dropTc(name, ilvl, { difficulty: 0, rng: qrng })) bump(counts, `quality ${it.quality}`, 1);
      got.add(counts);
    }
    for (const k of got.keys()) ok(want.mean.has(k), `${name}: dropped ${k}, which it has none of`);
    let worst = 0;
    let compared = 0;
    for (const [k, v] of want.mean) {
      // 30 or more expected in the kills, for σ to mean something
      if (v * K < 30) continue;
      const sd = Math.sqrt((want.variance.get(k) + (own.get(k) ?? 0)) / K);
      const off = Math.abs(got.mean(k) - v);
      compared++;
      if (sd < 1e-12) ok(off < 1e-9, `${name}: ${k} came ${got.mean(k)} a kill, not always ${v}`);
      else {
        zs.push({ z: off / sd, what: `${name}: ${k} ${got.mean(k).toFixed(4)} a kill against ${v.toFixed(4)}` });
        worst = Math.max(worst, off / sd);
      }
    }
    lines.push(`${name} ${total('item').toFixed(4)} (${compared}, at most ${worst.toFixed(2)}σ off)`);
  }
  const zc = zCheck(zs);
  // Andariel drops Andarielq on her quest's first kill, and her own class after, which is Andarielq too
  const andariel = D2X_MONSTERS.andariel;
  ok(andariel.questTc && andariel.diff[0].tc.quest === 'Andarielq', 'Andariel has a quest class');
  eq(T.monsterTc(andariel, { difficulty: 0, rank: 'regular', mlvl: 12 }), 'Andarielq', "Andariel's first kill");
  eq(T.monsterTc(andariel, { difficulty: 0, rank: 'regular', mlvl: 12, questDone: true }), 'Andarielq', 'and after the quest');
  // the quality ratios reach the item: a unique's item class (magic 1024) makes every weapon and armor magic or better
  const pickQ = T.evalTc('Act 1 Uitem A', { next: () => 0 })[0].tc;
  eq(JSON.stringify(pickQ), JSON.stringify({ unique: 800, set: 800, rare: 800, magic: 1024 }), "Uitem A's ratios down to the base");
  const plain = T.evalTc('Act 1 H2H A', { next: () => 0.99 })[0];
  eq(JSON.stringify(plain?.tc), JSON.stringify({ unique: 0, set: 0, rare: 0, magic: 0 }), "a normal monster's none");
  let gear = 0;
  for (let i = 0; i < 1500; i++) {
    for (const it of G.dropTc('Act 1 Uitem A', 5)) {
      if (!G.isEquipment(it) || it.baseId === 'rin' || it.baseId === 'amu') continue;
      gear++;
      ok(['magic', 'rare', 'set', 'unique'].includes(it.quality), `a unique monster's ${it.baseId} came out ${it.quality}`);
    }
  }
  ok(gear > 1000, 'plenty of gear from Uitem A');
  // gold piles of Citem A: mul 1280, five times 1–6 at item level 1
  for (let i = 0; i < 1500; i++) for (const it of G.dropTc('Act 1 Citem A', 1)) if (G.isGold(it)) ok(it.qty % 5 === 0 && it.qty >= 5 && it.qty <= 25, `Citem A gold ${it.qty}`);

  // ── the game's monsters (every D2 one with a look drops by its own row), chests and barrels ──
  for (const def of lookedMonsters()) {
    for (const d of [0, 1, 2]) {
      for (const rank of ['normal', 'champion', 'unique', 'minion', 'boss']) {
        const tc = L.monsterLootTc({ def, rank, level: 5 }, d);
        ok(tc && TCS[tc], `${def.id} as ${rank} in difficulty ${d} drops from ${tc}`);
      }
    }
  }
  const hero = { mf: 0, gf: 0, difficulty: 0 };
  const zombie = (rank, level = 2) => ({ def: monsterDef('zombie1'), rank, level });
  for (let i = 0; i < 300; i++) {
    // Champ A: its item class (one pick, no NoDrop) and Cpot A's two potions; Unique A: one item, four potions
    eq(L.monsterLoot(zombie('champion', 4), hero).length, 3, 'a champion zombie always drops 3');
    eq(L.monsterLoot(zombie('unique', 4), hero).length, 5, 'a unique zombie always drops 5');
    for (const it of L.monsterLoot(zombie('normal', 7), hero)) eq(it.ilvl, 7, "a drop's item level is its monster's");
  }
  eq(L.monsterLootTc(zombie('minion'), 0), 'Act 1 H2H A', "a unique's minion drops a plain monster's");
  // a superunique drops its SuperUniques.txt class, not its monster's unique one (MonsterMode.cpp:507-517)
  eq(L.monsterLootTc(zombie('unique'), 0), 'Act 1 Unique A', 'a unique zombie drops Unique A');
  eq(L.monsterLootTc({ ...zombie('unique', 3), superUnique: 'Corpsefire' }, 0), 'Act 1 Super A', "Corpsefire drops its superunique class");
  eq(L.monsterLootTc({ ...zombie('unique', 3), superUnique: 'Corpsefire' }, 1), T.monsterTc(D2X_MONSTERS.zombie1, { difficulty: 1, rank: 'unique', mlvl: 3, su: D2X_SUPERUNIQUES.find((s) => s.key === 'Corpsefire') }), "Corpsefire's class in nightmare");
  ok(L.monsterLootTc({ ...zombie('unique', 3), superUnique: 'Corpsefire' }, 1).startsWith('Act 1 (N) Super'), "Corpsefire's nightmare class is a Super one");
  // the monster's own difficulty, the one its game is in, not the killer's (MonsterMode.cpp:491-573, pGame->nDifficulty)
  ok(L.monsterLootTc({ ...zombie('unique', 3), superUnique: 'Corpsefire', difficulty: 1 }).startsWith('Act 1 (N) Super'), "a nightmare Corpsefire's class by its own difficulty");
  {
    const hellZombie = { ...zombie('champion', 70), difficulty: 2 };
    const normalHero = { mf: 0, gf: 0, difficulty: 0 };
    let ilvls = 0;
    for (let i = 0; i < 50; i++) for (const it of L.monsterLoot(hellZombie, normalHero)) if (it.ilvl === 70) ilvls++;
    ok(ilvls > 0 && L.monsterLootTc(hellZombie).includes('(H)'), `a hell champion killed by a hero whose finder says normal drops from ${L.monsterLootTc(hellZombie)}`);
  }
  eq(L.monsterLootTc({ def: monsterDef('andariel'), rank: 'boss', level: 30 }, 0), 'Andarielq', 'Andariel drops her quest class');
  eq(L.monsterLootTc({ def: monsterDef('quillrat1'), rank: 'normal', level: 1 }, 0), 'Quill 1', 'a quill rat drops its own class');
  eq(L.monsterLootTc({ def: monsterDef('fallenshaman1'), rank: 'normal', level: 2 }, 0), 'Act 1 Cast A', "a shaman drops a caster's");
  eq(L.monsterLootTc({ def: monsterDef('fallenshaman1'), rank: 'unique', level: 5, superUnique: 'Bishibosh' }, 0), 'Act 1 Super A', 'Bishibosh drops his superunique class');
  let normal = 0;
  for (let i = 0; i < N; i++) normal += L.monsterLoot(zombie('normal'), hero, rng).length;
  near(normal / N, 0.375, 0.012, 'a zombie drops 3 times in 8');
  // a chest drops in 3 of 4, then Chest A's 4 picks against NoDrop 100; a barrel in 21 of 100
  const blood = areaDef(WILD_AREA);
  const opened = (kind, area) => {
    let some = 0;
    let items = 0;
    for (let i = 0; i < N; i++) {
      const got = L.containerLoot(kind, area, hero, rng);
      if (got.length) some++;
      items += got.length;
      for (const it of got) eq(it.ilvl, Math.max(1, area.alvl[0]), `a ${kind}'s item level is its area's`);
    }
    return { some: some / N, items: items / N };
  };
  const none4 = (100 / 142) ** 4;
  const chest = opened('chest', blood);
  near(chest.some, 0.75 * (1 - none4), 0.015, 'chests that drop something');
  near(chest.items, 0.75 * sum(exact(TCS, 'Act 1 Chest A', 6).mean), 0.03, 'items a chest');
  const barrel = opened('barrel', areaDef(COLD_PLAINS));
  near(barrel.some, 0.21 * (1 - none4), 0.012, 'barrels that drop something');
  ok(opened('chest', areaDef(CAMP_AREA)).items > 0, 'the camp has Chest A too');
  // in nightmare and hell a chest drops its area's (N) or (H) class at the area's level in that
  // difficulty (Items.cpp:1636-1646 by DATATBLS_GetMonsterLevelInArea; ObjMode.cpp:3929)
  for (const d of [1, 2]) {
    const area = areaDef(WILD_AREA);
    const levels = new Set();
    for (let i = 0; i < 400; i++) for (const it of L.containerLoot('chest', area, { mf: 0, gf: 0, difficulty: d }, rng)) levels.add(it.ilvl);
    const want = D2X_AREAS.find((a) => a.id === WILD_AREA).lvl[d];
    eq([...levels].join(), String(want), `a Blood Moor chest's item levels in difficulty ${d}`);
  }
  const deep = areaDef(dungeonArea(9));
  ok(deep.alvl[0] >= 9, `floor 9 is past Chest C's level (${deep.alvl[0]})`);
  eq(T.chestTc({ id: deep.id, alvl: deep.alvl[0] }, 0).name, 'Act 1 Chest C', 'a deep floor drops Chest C');
  console.log(`  per drop, capped: ${lines.join(', ')}; ${zc.n} counts, ${zc.past.length} past 3σ (${zc.past.join('; ')}), none past ${zc.bound.toFixed(2)}σ, z² ${zc.z2.toFixed(3)}; chests ${chest.items.toFixed(2)} items, barrels ${barrel.items.toFixed(2)}`);
};
