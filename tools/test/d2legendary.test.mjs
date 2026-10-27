// D2 uniques, set items and runewords (src/items/d2/legendary.ts, props.ts): which row a unique or
// set drop becomes, the drop condition, rolled properties by Properties.txt function, per-level
// values, the two layers of set bonuses, and which runeword a full set of runes makes.
const N = 20000;

function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
function near(a, b, tol, what) {
  if (Math.abs(a - b) > tol) throw new Error(`${what}: ${a.toFixed(4)} not within ${tol} of ${b.toFixed(4)}`);
}
function ok(c, what) {
  if (!c) throw new Error(what);
}

export default async (load) => {
  const L = await load('/src/items/d2/legendary.ts');
  const P = await load('/src/items/d2/props.ts');
  const Q = await load('/src/items/d2/quality.ts');
  const { d2Base, itemMaxSockets } = await load('/src/items/d2/bases.ts');
  const { CLASS_SKILLS } = await load('/src/items/d2/classskills.ts');
  const { D2X_UNIQUES } = await load('/src/data/d2x/uniques.ts');
  const { D2X_SET_ITEMS, D2X_SETS } = await load('/src/data/d2x/sets.ts');
  const { D2X_RUNEWORDS } = await load('/src/data/d2x/runewords.ts');
  const { RNG } = await load('/src/core/math.ts');
  const rng = new RNG(20261026);
  const unique = (key) => D2X_UNIQUES.find((u) => u.key === key);
  const setItem = (key) => D2X_SET_ITEMS.find((s) => s.key === key);
  const runeword = (en, itype) => D2X_RUNEWORDS.find((r) => r.en === en && (!itype || r.itypes.includes(itype)));
  const propOf = (props, c, p) => props.filter((x) => x.c === c && (p === undefined || x.p === p));

  // ── drop condition (UniqueItems DropConditionCalc)
  ok(L.dropCondMet(undefined, 0), 'no condition');
  ok(L.dropCondMet(`"cond('Difficulty', hell)"`, 2), 'hell in hell');
  ok(!L.dropCondMet(`"cond('Difficulty', hell)"`, 0), 'hell in normal');
  ok(L.dropCondMet(`cond('Difficulty', nightmare)`, 1), 'unquoted nightmare');
  ok(!L.dropCondMet(`cond('Level', 5)`, 2), 'an unknown condition never holds');

  // ── which unique: base, lvl ≤ ilvl, spawnable, condition, rarity
  const hax = d2Base('hax');
  eq(L.pickUnique(hax, 6, rng), undefined, 'the Gnasher is lvl 7');
  eq(L.pickUnique(hax, 7, rng)?.key, 'The Gnasher', 'the Gnasher at 7');
  eq(L.pickUnique(d2Base('crs'), 99, rng), undefined, 'crystal sword: Azurewrath is not spawnable');
  const gnasher = unique('The Gnasher');
  gnasher.dropCond = `"cond('Difficulty', hell)"`;
  try {
    eq(L.pickUnique(hax, 50, rng, { difficulty: 0 }), undefined, 'a hell-only Gnasher in normal');
    eq(L.pickUnique(hax, 50, rng, { difficulty: 2 })?.key, 'The Gnasher', 'a hell-only Gnasher in hell');
    eq(Q.dropQuality({ code: 'hax', ilvl: 50, quality: 'unique', difficulty: 1 }, rng).quality, 'rare', 'its drop falls back to rare');
  } finally {
    delete gnasher.dropCond;
  }
  // amulets: 12 uniques of mixed rarity; at ilvl 99 the pick follows rarity
  const amus = D2X_UNIQUES.filter((u) => u.code === 'amu' && u.spawnable);
  const total = amus.reduce((s, u) => s + Math.max(u.rarity, 1), 0);
  const seen = new Map();
  for (let i = 0; i < N; i++) {
    const u = L.pickUnique(d2Base('amu'), 99, rng);
    seen.set(u.id, (seen.get(u.id) ?? 0) + 1);
  }
  for (const u of amus) {
    const p = Math.max(u.rarity, 1) / total;
    near((seen.get(u.id) ?? 0) / N, p, 4 * Math.sqrt((p * (1 - p)) / N) + 1e-3, `amulet ${u.key}`);
  }
  // a given row, and once a game
  const viper = amus.find((u) => u.lvl === 0) ?? amus[0];
  eq(L.pickUnique(d2Base('amu'), 99, rng, { row: viper.id })?.id, viper.id, 'the asked-for row');
  const dropped = new Set([gnasher.id]);
  eq(L.pickUnique(hax, 50, rng, { dropped }), undefined, 'a dropped unique');

  // ── which set item: Cow King's only from hell bovines
  eq(L.pickSetItem(d2Base('lbl'), 10, rng)?.set, 'Death\'s Disguise', 'a sash: Death\'s Guard');
  eq(L.pickSetItem(d2Base('xap'), 99, rng), undefined, 'war hat: no Cow King\'s Horns but from hell bovines');
  eq(L.pickSetItem(d2Base('xap'), 99, rng, { hellBovine: true })?.key, "Cow King's Horns", 'a hell bovine\'s war hat');

  // ── rolling properties
  // the Gnasher: fixed str 8, ow 50, cb 20, dmg% 60–70 evenly
  const counts = new Map();
  for (let i = 0; i < 4400; i++) {
    const r = L.rollUnique(gnasher, 10, rng);
    eq(propOf(r.props, 'str')[0].min, 8, 'Gnasher str');
    const d = propOf(r.props, 'dmg%')[0];
    eq(d.min, d.max, 'a rolled value: min = max');
    ok(d.min >= 60 && d.min <= 70, `Gnasher dmg% ${d.min}`);
    counts.set(d.min, (counts.get(d.min) ?? 0) + 1);
  }
  eq(counts.size, 11, 'every dmg% from 60 to 70');
  for (const n of counts.values()) near(n / 4400, 1 / 11, 0.025, 'dmg% evenly');
  // res-all and all-stats are one roll, one property
  const zero = P.rollProps([{ c: 'str', min: 0, max: 0 }, { c: 'res-all', min: 10, max: 20 }], hax, 10, rng);
  eq(zero.props.length, 1, 'a 0 is not added; res-all one property');
  // damage pairs stay pairs; procs keep chance and level, level 0 from the item level
  const storm = unique('Stormrider');
  let r = L.rollUnique(storm, 49, rng);
  const cb = propOf(r.props, 'hit-skill', 'Charged Bolt')[0];
  eq(cb.min, 10, 'proc chance');
  eq(cb.max, Math.trunc((49 - 1) / 4) + 1, 'proc level from ilvl 49');
  eq(L.rollUnique(storm, 99, rng).props.find((p) => p.p === 'Charged Bolt').max, 20, 'proc level at most 20');
  const ltng = propOf(r.props, 'dmg-ltng')[0];
  ok(ltng.min === 1 && ltng.max === 200, 'lightning damage 1–200 stays a pair');
  eq(P.skillLevel('Meteor', -2, 74), Math.trunc((74 - 24) / Math.trunc(75 / 2)), 'negative max: by the level past reqlevel');
  // per level: eighths, attack rating halves; worked out at a character level
  const schaefer = L.rollUnique(unique("Schaefer's Hammer"), 85, rng);
  const ar = propOf(schaefer.props, 'att/lvl')[0];
  eq(ar.p, 16, 'att/lvl keeps par');
  eq(P.propValue(ar, 10), 80, "Schaefer's +8 attack rating a level");
  const eagle = L.rollUnique(unique('Eaglehorn'), 80, rng);
  eq(P.propValue(propOf(eagle.props, 'dmg%/lvl')[0], 50), 100, 'Eaglehorn +2% damage a level');
  eq(P.propsAt(eagle.props, 50).find((p) => p.c === 'att/lvl').min, 300, 'propsAt: flat at clvl 50');
  // sockets, durability
  const goad = unique('Steelgoad');
  r = L.rollUnique(goad, 30, rng);
  ok(r.dur >= 20 && r.dur <= 40, `Steelgoad dur ${r.dur}`);
  // sock (func 14): min … max, else par, at most the item's cells and ITEMS_GetMaxSockets: its
  // GemSockets and its type's MaxSock at the item level
  const sockets = (key, ilvl) => L.rollUnique(unique(key), ilvl, rng).sockets;
  eq(itemMaxSockets(d2Base(unique('Blade of Ali Baba').code), 99), 2, 'a tulwar takes 2 sockets');
  eq(sockets('Blade of Ali Baba', 99), 2, "Blade of Ali Baba's sock 3 in a tulwar: 2");
  eq(sockets('Hone Sundan', 99), 3, "Hone Sundan's sock 3 in a 6-socket yari: 3");
  const rm = new Set();
  for (let i = 0; i < 200; i++) rm.add(sockets('Runemaster', 20));
  eq([...rm].sort().join(), '3,4', 'Runemaster 3–5 at ilvl 20, where an axe takes 4');
  // skill-rand: a sorceress skill 36–60 at level 3; randclassskill: +3 to a random class
  const ormus = unique("Ormus' Robes");
  const sorc = new Set(CLASS_SKILLS.sor.slice(0, 25).map((s) => s[0]));
  for (let i = 0; i < 50; i++) {
    const s = propOf(L.rollUnique(ormus, 80, rng).props, 'skill')[0];
    ok(sorc.has(s.p) && s.min === 3, `Ormus' skill ${s.p}`);
  }
  const torch = unique('Hellfire Torch');
  const classes = new Set();
  for (let i = 0; i < 400; i++) {
    const c = L.rollUnique(torch, 99, rng).props.find((p) => ['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass'].includes(p.c));
    eq(c.min, 3, 'Hellfire Torch +3');
    classes.add(c.c);
  }
  eq(classes.size, 7, 'every class');

  // ── set items: rolled props and green slots
  const ward = setItem("Civerb's Ward");
  const icon = setItem("Civerb's Icon");
  const cudgel = setItem("Civerb's Cudgel");
  const rw = L.rollSetItem(ward, 20, rng);
  eq(rw.setBonus.length, 2, 'Ward: two slots');
  const mana = rw.setBonus[0][0];
  ok(mana.c === 'mana' && mana.min === mana.max && mana.min >= 21 && mana.min <= 22, 'Ward slot 1 rolled');
  const rc = L.rollSetItem(cudgel, 20, rng);
  eq(rc.setBonus, undefined, 'Cudgel: add func 0, no slots');
  eq(propOf(rc.props, 'dmg/lvl')[0]?.p, 8, 'Cudgel: its per-level max damage is a plain property');
  // a switched slot's dur and charges stay in the slot (its ITEMSET list); its sockets are the item's
  const odd = L.rollSetItem(
    { ...ward, bonus: [[{ c: 'dur', min: 10, max: 10 }, { c: 'sock', min: 1, max: 1 }], [{ c: 'charged', p: 'Teleport', min: 10, max: 5 }]] },
    20,
    rng,
  );
  eq(odd.dur, undefined, "a slot's dur is not the item's");
  eq(odd.charges, undefined, "nor are a slot's charges");
  eq(odd.sockets, 1, "a slot's sockets are");
  ok(propOf(odd.props, 'sock').length === 1, 'and their property with them');
  eq(JSON.stringify(odd.setBonus[0]), JSON.stringify([{ c: 'dur', min: 10, max: 10 }]), 'slot 1 keeps its dur');
  eq(propOf(odd.setBonus[1], 'charged', 'Teleport').length, 1, 'slot 2 its charged skill');
  const tele = odd.setCharges[1].Teleport;
  ok(Object.keys(odd.setCharges[0]).length === 0 && tele >= 2 && tele <= 10, `and its charges: ${tele}`);
  const oddWard = { setRow: ward.id, setBonus: odd.setBonus };
  ok(!L.setBonuses([oddWard]).props.some((p) => p.c === 'dur'), 'Ward alone: slot 1 off, no dur');
  ok(L.setBonuses([oddWard, { setRow: icon.id }]).props.some((p) => p.c === 'dur' && p.min === 10), 'with the Icon: on');
  // through dropQuality: a set sash gets its props and slots, a unique its props
  const sash = L.rollLegendary(Q.dropQuality({ code: 'lbl', ilvl: 10, quality: 'set' }, rng), { ilvl: 10 }, rng);
  ok(sash.props.length && sash.setBonus, 'a set sash rolled');
  // dur is func 1 into maxdurability: the most only, the current as it was; an ethereal drop is
  // at its new most (D2Game Items.cpp:257-259)
  let goadDrop;
  do goadDrop = Q.dropQuality({ code: 'vou', ilvl: 30, quality: 'unique', row: goad.id }, rng);
  while (goadDrop.eth);
  const goadMade = L.rollLegendary(goadDrop, { ilvl: 30 }, rng);
  const add = goadMade.maxDur - goadDrop.maxDur;
  ok(add >= 20 && add <= 40, `Steelgoad: ${add} more most durability`);
  eq(goadMade.dur, goadDrop.dur, 'Steelgoad: current durability as it was');
  eq(propOf(goadMade.props, 'dur').length, 0, 'dur is not kept as a property');
  const goadEth = L.rollLegendary({ ...goadDrop, eth: true }, { ilvl: 30 }, rng);
  eq(goadEth.dur, goadEth.maxDur, 'an ethereal Steelgoad: at its new most');

  // ── set bonuses
  const worn = (...rows) => rows.map((s) => ({ setRow: s.id, setBonus: L.rollSetItem(s, 30, rng).setBonus }));
  let b = L.setBonuses(worn(ward, icon));
  eq(JSON.stringify(b.slots), JSON.stringify([[true, false], [true, false]]), 'Ward + Icon: Ward\'s Icon slot, Icon\'s 2-piece slot');
  eq(b.sets[0].worn, 2, 'two pieces');
  eq(b.sets[0].partial.map((p) => p.c).join(), 'res-fire', 'the 2-piece partial bonus');
  eq(b.sets[0].full.length, 0, 'no full bonus');
  b = L.setBonuses(worn(ward, cudgel));
  eq(JSON.stringify(b.slots[0]), JSON.stringify([false, true]), 'Ward + Cudgel: the Cudgel slot');
  b = L.setBonuses(worn(ward, icon, cudgel));
  eq(JSON.stringify(b.slots), JSON.stringify([[true, true], [true, true], []]), 'full Civerb\'s: every slot');
  eq(b.sets[0].full.length, D2X_SETS.find((s) => s.id === "Civerb's Vestments").full.length, 'full bonus');
  ok(b.props.some((p) => p.c === 'mana') && b.props.some((p) => p.c === 'res-cold'), 'slot props summed');
  b = L.setBonuses(worn(icon, icon));
  eq(b.sets[0].worn, 1, 'two of the same piece count once');
  eq(b.props.length, 0, 'and give nothing');
  eq(JSON.stringify(L.setBonuses([{}, ...worn(icon)]).slots[0]), '[]', 'a non-set item');
  // items without their rolled slots: the slots are on, but the table's ranges add nothing
  b = L.setBonuses([{ setRow: ward.id }, { setRow: icon.id }]);
  eq(JSON.stringify(b.slots[0]), '[true,false]', "an unrolled Ward's Icon slot is on");
  ok(!b.props.some((p) => p.c === 'mana'), 'but gives no mana 21–22');
  // every count of pieces: the partial lines up to it, the full bonus only with all of them
  for (const id of ["Tal Rasha's Wrappings", "Natalya's Odium"]) {
    const set = D2X_SETS.find((s) => s.id === id);
    for (let k = 1; k <= set.pieces.length; k++) {
      const s = L.setBonuses(worn(...set.pieces.slice(0, k).map(setItem))).sets[0];
      eq(s.worn, k, `${id}: ${k} worn`);
      const lines = set.partial.filter((p) => p.n <= k).flatMap((p) => p.props);
      eq(JSON.stringify(s.partial), JSON.stringify(lines), `${id}: the partial lines of ${k}`);
      if (k < set.pieces.length) eq(s.full.length, 0, `${id}: no full bonus with ${k}`);
      else eq(s.full, set.full, `${id}: the full bonus with all ${k}`);
    }
  }
  // Natalya's Odium, 4 pieces: 2 reduce magic damage, 3 add defense, 4 poison resistance
  const nat = D2X_SETS.find((s) => s.id === "Natalya's Odium");
  const natalya = (k) => L.setBonuses(worn(...nat.pieces.slice(0, k).map(setItem))).sets[0];
  eq(nat.pieces.length, 4, "Natalya's: 4 pieces");
  eq(natalya(2).partial.map((p) => p.c).join(), 'red-mag', "Natalya's 2 pieces");
  eq(natalya(3).partial.map((p) => p.c).join(), 'red-mag,ac', "Natalya's 3 pieces");
  eq(natalya(4).partial.map((p) => p.c).join(), 'red-mag,ac,res-pois', "Natalya's 4 pieces");
  eq(natalya(3).full.length, 0, "Natalya's 3 of 4: no full bonus");
  eq(natalya(4).full, nat.full, "Natalya's 4 of 4: the full bonus");
  // set-wide bonuses roll nothing: single values are fixed, procs name their level
  const PAIRS = new Set(['dmg-fire', 'dmg-ltng', 'dmg-cold', 'dmg-pois', 'dmg-mag', 'dmg-norm', 'dmg-elem']);
  const PROCS = /^(hit|gethit|att|kill|death|levelup)-skill$|^charged$/;
  for (const s of D2X_SETS) {
    for (const p of [...s.partial.flatMap((x) => x.props), ...s.full]) {
      if (PROCS.test(p.c)) ok(p.max > 0, `${s.id} ${p.c}: a level`);
      else ok(p.min === p.max || PAIRS.has(p.c), `${s.id} ${p.c} ranges`);
    }
  }

  // ── runewords
  const stealth = runeword('Stealth');
  const armor = { baseId: 'qui', quality: 'normal', sockets: 2, socketed: ['r07', 'r05'] };
  eq(stealth.runes.join(), '7,5', 'Stealth is Tal Eth');
  eq(L.findRuneword(armor)?.id, stealth.id, 'Tal Eth in 2-socket armor');
  eq(L.findRuneword({ ...armor, quality: 'low' })?.id, stealth.id, 'low quality makes runewords');
  eq(L.findRuneword({ ...armor, quality: 'superior' })?.id, stealth.id, 'superior too');
  eq(L.findRuneword({ ...armor, quality: 'magic' }), undefined, 'not magic');
  eq(L.findRuneword({ ...armor, socketed: ['r05', 'r07'] }), undefined, 'runes in order');
  eq(L.findRuneword({ ...armor, sockets: 3 }), undefined, 'every socket filled');
  eq(L.findRuneword({ ...armor, sockets: 3, socketed: ['r07', 'r05', 'r01'] }), undefined, 'the word\'s rune count');
  eq(L.findRuneword({ ...armor, socketed: ['r07', 'gsv'] }), undefined, 'a gem matches nothing');
  eq(L.findRuneword({ ...armor, baseId: 'hax' }), undefined, 'Stealth is body armor only');
  // Hustle: the same runes, one word for armor and one for weapons
  const hustle = ['r13', 'r18', 'r02'];
  eq(L.findRuneword({ baseId: 'qui', quality: 'normal', sockets: 3, socketed: hustle })?.id, runeword('Hustle', 'tors').id, 'Hustle armor');
  eq(L.findRuneword({ baseId: 'hax', quality: 'normal', sockets: 3, socketed: hustle })?.id, runeword('Hustle', 'weap').id, 'Hustle weapon');
  // making them, with the last rune as the item the properties work on: Black's charges
  const club = { baseId: 'clb', quality: 'normal', sockets: 3, socketed: ['r10', 'r16', 'r04'] };
  const black = L.makeRuneword(club, 20, rng);
  eq(black.runewordRow, runeword('Black').id, 'Black in a club');
  const ce = propOf(black.props, 'charged', 'Corpse Explosion')[0];
  ok(ce.min === 12 && ce.max === 4, 'Black: 12 charges of level 4');
  for (let i = 0; i < 200; i++) {
    const n = L.makeRuneword(club, 20, rng).charges['Corpse Explosion'];
    ok(n >= 2 && n <= 12, `Black starts with 2–12 charges: ${n}`);
  }
  // no word's skill takes its level from the item level, nor has sock: try them on Black. The
  // level is the rune's item level's, and sock acts on the rune, which takes none
  const blackRow = runeword('Black');
  const blackProps = blackRow.props;
  blackRow.props = [...blackProps, { c: 'hit-skill', p: 'Charged Bolt', min: 10, max: 0 }, { c: 'sock', min: 2, max: 2 }];
  try {
    const made = L.makeRuneword(club, 41, rng);
    eq(propOf(made.props, 'hit-skill', 'Charged Bolt')[0].max, Math.trunc((41 - 1) / 4) + 1, 'a proc at the rune\'s level 41');
    eq(made.sockets, undefined, 'a runeword\'s sock: no sockets');
    eq(propOf(made.props, 'sock').length, 0, 'and no property');
  } finally {
    blackRow.props = blackProps;
  }
  // Famine's ethereal acts on the rune, which has no durability: the axe stays as it is
  const famine = L.makeRuneword({ baseId: 'axe', quality: 'normal', sockets: 4, socketed: ['r19', 'r27', 'r09', 'r31'] }, 60, rng);
  eq(famine.runewordRow, runeword('Famine').id, 'Famine in an axe');
  eq(famine.eth, undefined, 'Famine: not made ethereal');
  ok(famine.props.every((p) => p.c !== 'ethereal'), 'ethereal is not kept as a property');
};
