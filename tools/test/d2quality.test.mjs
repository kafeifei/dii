// D2 item quality (src/items/d2/quality.ts): the itemratio rows, D2's chance numbers worked out by
// hand from D2MOO's D2GAME_DropTC, the roll's frequencies against the exact odds, and what making
// the item does: unique → rare at 3× durability, set → magic at 2×, ethereal, sockets.
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

export default async (load) => {
  const Q = await load('/src/items/d2/quality.ts');
  const { d2Base } = await load('/src/items/d2/bases.ts');
  const { RNG } = await load('/src/core/math.ts');
  const rng = new RNG(20261026);

  // itemratio rows: normal, exceptional, class-specific
  const r = (code) => Q.itemRatio(d2Base(code));
  ok(!r('hax').uber && !r('hax').cls, 'hand axe: the plain row');
  ok(r('9ha').uber && !r('9ha').cls, 'hatchet: the uber row');
  ok(r('7p7').uber, 'elite war pike: uber');
  ok(!r('am1').uber && r('am1').cls, 'stag bow: class specific');
  ok(!r('rin').uber && !r('rin').cls, 'ring: the plain row');

  // chances by hand. Hand axe (qlvl 3) at ilvl 85, no MF: diff 82
  let c = Q.qualityChances({ code: 'hax', ilvl: 85 });
  eq(c.unique, (400 - 82) * 128, 'unique, no MF');
  eq(c.set, (160 - 41) * 128, 'set, no MF');
  eq(c.rare, Math.max((100 - 41) * 128, 3200), 'rare, no MF');
  eq(c.magic, Math.max((34 - 27) * 128, 192), 'magic, no MF');
  eq(c.superior, (12 - 10) * 128, 'superior');
  eq(c.normal, (2 - 41) * 128, 'normal: ≤ 0, always');
  // 300% MF: unique 250·300/550 → 136, set 500·300/800 → 187, rare 600·300/900 → 200, magic 300
  c = Q.qualityChances({ code: 'hax', ilvl: 85, mf: 300 });
  eq(c.unique, Math.trunc((12800 * 318) / 236), 'unique, 300 MF');
  eq(c.set, Math.max(Math.trunc((12800 * 119) / 287), 5600), 'set, 300 MF: the min');
  eq(c.rare, Math.max(Math.trunc((12800 * 59) / 300), 3200), 'rare, 300 MF: the min');
  eq(c.magic, Math.max(Math.trunc((12800 * 7) / 400), 192), 'magic, 300 MF');
  // 10% MF and below doesn't diminish
  eq(Q.qualityChances({ code: 'hax', ilvl: 85, mf: 10 }).unique, Math.trunc((12800 * 318) / 110), 'unique, 10 MF');
  // a TC's unique ratio of 1024 makes it certain; 512 halves the chance number
  eq(Q.qualityChances({ code: 'hax', ilvl: 85, tc: { unique: 1024 } }).unique, 0, 'TC unique 1024');
  eq(Q.qualityChances({ code: 'hax', ilvl: 85, tc: { unique: 512 } }).unique, (318 * 128) / 2, 'TC unique 512');
  // ilvl below qlvl: −3 / 2 truncates toward zero, to −1
  eq(Q.qualityChances({ code: '9ha', ilvl: 28 }).set, (160 + 1) * 128, 'negative difference');
  // MF of −100 or less: nothing magic or better
  c = Q.qualityChances({ code: 'hax', ilvl: 20, mf: -100 });
  ok(c.unique === null && c.magic === null, 'MF −100');
  // rings are always magic once unique, set and rare miss; potions always normal
  eq(Q.qualityChances({ code: 'rin', ilvl: 10 }).magic, 0, 'ring magic');
  eq(Q.qualityOdds({ code: 'hp1', ilvl: 50 }).normal, 1, 'potion');

  // the roll against the exact odds
  for (const spec of [
    { code: 'hax', ilvl: 12 },
    { code: 'hax', ilvl: 85, mf: 400, tc: { unique: 983, set: 983, rare: 983, magic: 1024 } },
    { code: 'am1', ilvl: 30, mf: 100 },
    { code: 'cap', ilvl: 2 },
  ]) {
    const odds = Q.qualityOdds(spec);
    const n = {};
    for (let i = 0; i < N; i++) {
      const q = Q.rollQuality(spec, rng);
      n[q] = (n[q] ?? 0) + 1;
    }
    let sum = 0;
    for (const [q, p] of Object.entries(odds)) {
      sum += p;
      near((n[q] ?? 0) / N, p, 4 * Math.sqrt((p * (1 - p)) / N) + 1e-3, `${spec.code} ${q}`);
    }
    near(sum, 1, 1e-9, `${spec.code} odds sum`);
  }

  // making it. Hand axe: dur 28, the Gnasher is its only unique (lvl 7), no set item on it
  const hax = d2Base('hax');
  for (let i = 0; i < 200; i++) {
    const d = Q.dropQuality({ code: 'hax', ilvl: 5, quality: 'unique' }, rng);
    eq(d.quality, 'rare', 'unique below the Gnasher\'s level');
    if (!d.eth) {
      eq(d.maxDur, 3 * hax.dur, 'failed unique: 3× most durability');
      ok(d.dur >= 3 * (hax.dur >> 1) && d.dur < 3 * hax.dur, 'failed unique: 3× durability');
    }
    const s = Q.dropQuality({ code: 'hax', ilvl: 50, quality: 'set' }, rng);
    eq(s.quality, 'magic', 'set with no set item on the base');
    if (!s.eth) eq(s.maxDur, 2 * hax.dur, 'failed set: 2× most durability');
  }
  let u = Q.dropQuality({ code: 'hax', ilvl: 10, quality: 'unique' }, rng);
  eq(u.quality, 'unique', 'the Gnasher');
  eq(u.uniqueRow, 0, 'the Gnasher row');
  ok(!u.identified, 'uniques drop unidentified');
  // once a game
  const dropped = new Set();
  eq(Q.dropQuality({ code: 'hax', ilvl: 10, quality: 'unique', dropped }, rng).quality, 'unique', 'first Gnasher');
  eq(Q.dropQuality({ code: 'hax', ilvl: 10, quality: 'unique', dropped }, rng).quality, 'rare', 'second Gnasher');
  // the Sash's set item is Death's Guard (lvl 8)
  const sash = Q.dropQuality({ code: 'lbl', ilvl: 10, quality: 'set' }, rng);
  eq(sash.quality, 'set', 'a set sash');
  ok(sash.setRow !== undefined && !sash.eth, 'set items are never ethereal');

  // rings and potions; superior rows by kind; low quality
  for (let i = 0; i < 2000; i++) {
    ok(['magic', 'rare', 'set', 'unique'].includes(Q.dropQuality({ code: 'rin', ilvl: 30 }, rng).quality), 'rings');
    eq(Q.dropQuality({ code: 'hp1', ilvl: 30 }, rng).quality, 'normal', 'potions');
  }
  const WEAPON_ROWS = new Set([0, 1, 3, 4, 5, 6]);
  const ARMOR_ROWS = new Set([2, 4, 7]);
  for (let i = 0; i < 500; i++) {
    const w = Q.dropQuality({ code: 'hax', ilvl: 30, quality: 'superior' }, rng);
    ok(WEAPON_ROWS.has(w.qualityRow), `axe superior row ${w.qualityRow}`);
    const a = Q.dropQuality({ code: 'cap', ilvl: 30, quality: 'superior' }, rng);
    ok(ARMOR_ROWS.has(a.qualityRow), `cap superior row ${a.qualityRow}`);
    const j = Q.dropQuality({ code: 'jav', ilvl: 30, quality: 'superior' }, rng);
    ok(j.qualityRow < 4 && j.qualityRow !== 2, `javelin superior row ${j.qualityRow}`);
    const l = Q.dropQuality({ code: 'cap', ilvl: 1, quality: 'low' }, rng);
    eq(l.quality, 'low', 'low quality cap');
    ok(l.qualityRow >= 0 && l.qualityRow < 4 && l.maxDur === Math.floor(12 / 3) && !l.eth && !l.sockets, 'low quality cap');
  }
  eq(Q.pickSuperior(d2Base('tbk'), rng), undefined, 'no superior row fits a tome');
  eq(Q.dropQuality({ code: 'tbk', ilvl: 30, quality: 'superior' }, rng).quality, 'normal', 'superior tome: normal');

  // ethereal ~5% of weapons and armor, never low or set; sockets ~33% of normal and superior items
  let eth = 0;
  let sock = 0;
  let plain = 0;
  for (let i = 0; i < N; i++) {
    const d = Q.dropQuality({ code: 'hax', ilvl: 20 }, rng);
    if (d.eth) {
      eth++;
      ok(d.quality !== 'low' && d.quality !== 'set', 'ethereal low or set');
      eq(d.dur, d.maxDur, 'ethereal: full durability');
    }
    if (d.quality === 'normal' || d.quality === 'superior') {
      plain++;
      if (d.sockets) sock++;
      ok(d.sockets <= 2, 'hand axe: at most 2 sockets');
    } else eq(d.sockets, 0, `${d.quality} with sockets`);
  }
  near(eth / N, 0.05, 0.006, 'ethereal rate');
  near(sock / plain, 0.33, 0.015, 'socket rate');
  eq(Q.maxSockets(d2Base('7p7'), 85, 2), 6, 'war pike in hell');
  eq(Q.maxSockets(d2Base('7p7'), 85, 0), 3, 'war pike in normal');
  eq(Q.maxSockets(d2Base('7p7'), 85, 1), 4, 'war pike in nightmare');
  ok(Q.maxSockets(d2Base('cap'), 10, 2) <= 2, 'cap');
  for (let i = 0; i < 300; i++) eq(Q.dropQuality({ code: 'jav', ilvl: 50, quality: 'normal', difficulty: 2 }, rng).sockets, 0, 'stacks take no sockets');
  // ITEMDROPFLAG_NEVERETH and NOSOCKETS (Items.cpp:196, 230): the starting kit, vendors, the cube
  for (let i = 0; i < 1000; i++) {
    const d = Q.dropQuality({ code: 'hax', ilvl: 30, quality: 'normal', noEth: true, noSockets: true }, rng);
    ok(!d.eth && !d.sockets, 'never ethereal, no sockets');
  }
};
