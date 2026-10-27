// The game's items on the Diablo II item system (src/items/item.ts, make.ts, d2/describe.ts): the
// bases from src/data/d2x, items made through src/items/d2 with the hero's magic find, names as the
// official Simplified Chinese client composes them from our renamed words, tooltip lines by
// ItemStatCost (descpriority order, D2's strings, greyed when the game has no effect for them),
// defense and requirements as D2 works them out (low quality, ethereal, flat defense and enhanced
// damage off armor and weapons), charms in the bag, worn sets, runewords, jewels, identification,
// what is made never ethereal (the kit, vendors, the cube) and the cube on D2 codes.
const N = 3000;

function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
function ok(c, what) {
  if (!c) throw new Error(what);
}

export default async (load) => {
  const I = await load('/src/items/item.ts');
  const M = await load('/src/items/make.ts');
  const G = await load('/src/items/gen.ts');
  const D = await load('/src/items/d2/describe.ts');
  const A = await load('/src/items/d2/affixes.ts');
  const { ITEM_BASES, EQUIPPABLE_BASES } = await load('/src/data/items.ts');
  const { D2X_UNIQUES } = await load('/src/data/d2x/uniques.ts');
  const { D2X_SET_ITEMS, D2X_SETS } = await load('/src/data/d2x/sets.ts');
  const { D2X_RUNEWORDS } = await load('/src/data/d2x/runewords.ts');
  const { D2X_PREFIXES, D2X_SUFFIXES } = await load('/src/data/d2x/affixes.ts');
  const { D2X_RARE_PREFIXES, D2X_RARE_SUFFIXES } = await load('/src/data/d2x/rare.ts');
  const { D2X_STAT_DESC, D2X_TOOLTIP_STRINGS: S } = await load('/src/data/d2x/statdesc.ts');
  const { PROP_CODES } = await load('/src/items/props.ts');
  const { Player } = await load('/src/game/player.ts');
  const { Grid } = await load('/src/items/grid.ts');
  const { transmute } = await load('/src/items/cube.ts');
  const { RNG } = await load('/src/core/math.ts');
  const rng = new RNG(20261026);
  const texts = (lines) => lines.map((l) => l.text);
  const ctx = { clvl: 10, skillName: (s) => s, skillClass: () => undefined, className: (c) => c, tabName: (t) => `tab${t}` };
  const describe = (props, clvl = 10) => D.describeProps(props, { ...ctx, clvl }).map((l) => l.text);

  // ── bases: every D2 weapon, armor and misc row, by code ──
  ok(ITEM_BASES.lsd && ITEM_BASES.lsd.name === '长剑' && ITEM_BASES.lsd.dmg[1] === 19, 'the long sword');
  ok(ITEM_BASES.sbw?.noUse && ITEM_BASES.sbw.type === 'bow', 'bows drop but no hero here can shoot them');
  ok(ITEM_BASES.cm3.type === 'charm' && ITEM_BASES.jew.type === 'jewel' && ITEM_BASES.isc.type === 'scroll' && ITEM_BASES.ibk.type === 'tome', 'charms, jewels, scrolls and tomes');
  ok(ITEM_BASES.hp1.heal === 30 && ITEM_BASES.rvs.rejuv === 0.35 && ITEM_BASES.gld.type === 'gold', 'potions and gold are Misc.txt rows');
  eq(ITEM_BASES.r07.name, '7 号符文', 'runes are numbered');
  ok(ITEM_BASES.pa1.classCode === 'pal' && ITEM_BASES.pa1.cls === 'paladin' && ITEM_BASES.ne1.classCode === 'nec' && !ITEM_BASES.ne1.cls, 'class items');
  ok(ITEM_BASES.hbl.beltRows === 3 && ITEM_BASES.lbl.beltRows === 1, 'belt rows by Armor.txt belt slots');

  // ── names as the zhCN client composes them, from our words ──
  const pre = D2X_PREFIXES.find((a) => a.spawnable && a.freq && a.itypes.includes('weap'));
  const suf = D2X_SUFFIXES.find((a) => a.spawnable && a.freq && a.itypes.includes('weap'));
  const magic = (o) => ({ uid: 't', baseId: 'lsd', rarity: 'magic', quality: 'magic', ilvl: 30, name: 'saved', mods: [], sockets: 0, socketed: [], reqLvl: 1, ...o });
  eq(I.displayName(magic({ prefixes: [pre.id], suffixes: [suf.id] })), `${suf.name}${pre.name}长剑`, 'magic: suffix, prefix, base (MagicFormat %2%0%1)');
  eq(I.displayName(magic({ prefixes: [pre.id] })), `${pre.name}长剑`, 'magic, prefix only');
  eq(I.displayName(magic({ suffixes: [suf.id] })), `${suf.name}长剑`, 'magic, suffix only (%1%0)');
  eq(I.displayName(magic({})), 'saved', 'an old magic item without rows keeps its name');
  eq(I.displayName(magic({ rarity: 'rare', quality: 'rare', rareName: [D2X_RARE_PREFIXES[0].id, D2X_RARE_SUFFIXES[0].id] })), D2X_RARE_PREFIXES[0].name + D2X_RARE_SUFFIXES[0].name, 'rare: the two words (RareFormat %0%1)');
  eq(I.displayName(magic({ rarity: 'superior', quality: 'superior' })), `${S.Hiquality}长剑`, 'superior');
  eq(I.displayName(magic({ rarity: 'normal', quality: 'normal', sockets: 2, socketed: ['r01'] })), `${S.Gemmed}长剑`, 'a normal item with something socketed');
  eq(I.displayName(magic({ prefixes: [pre.id], identified: false })), '长剑', 'unidentified: the base name');
  const gnasher = D2X_UNIQUES.find((u) => u.key === 'The Gnasher');
  eq(I.displayName({ ...magic({}), baseId: 'hax', rarity: 'unique', quality: 'unique', uniqueRow: gnasher.id }), gnasher.name, 'a unique by its row');
  ok(gnasher.name !== gnasher.en, 'unique names are ours');

  // ── making items: quality, rows, rolled values, what they do to the item ──
  let sawRare = false;
  for (let i = 0; i < 400; i++) {
    const it = M.makeItem({ code: 'lsd', ilvl: 40, mf: 300 }, rng);
    ok(ITEM_BASES[it.baseId] && it.quality && it.rarity === it.quality, `made ${it.baseId} ${it.quality}`);
    if (it.quality === 'magic' || it.quality === 'rare') {
      ok(!it.identified, 'magic and rare drop unidentified');
      // one value where D2 rolls one; pairs keep min and max, procs and charges chance or charges and level
      const two = ['dmg-fire', 'dmg-ltng', 'dmg-cold', 'dmg-mag', 'dmg-pois', 'dmg-norm', 'dmg-elem', 'hit-skill', 'gethit-skill', 'att-skill', 'kill-skill', 'death-skill', 'levelup-skill', 'charged'];
      const unrolled = (it.props ?? []).filter((p) => p.min !== p.max && !p.c.endsWith('/lvl') && !two.includes(p.c));
      ok(!unrolled.length, `affix values rolled: ${JSON.stringify(unrolled)}`);
      eq(it.reqLvl, A.requiredLevel({ ...it, socketed: [] }), 'level requirement from its rows');
    }
    if (it.quality === 'rare') {
      sawRare = true;
      ok(it.rareName && I.displayName({ ...it, identified: true }) !== '长剑', 'a rare item has its two words');
    }
    if (it.quality === 'normal' || it.quality === 'superior') ok(it.identified, 'normal and superior drop identified');
  }
  ok(sawRare, 'some rares at 300% magic find');
  // magic find: more magic or better
  const better = (mf) => {
    let n = 0;
    for (let i = 0; i < N; i++) {
      const q = M.makeItem({ code: 'cap', ilvl: 20, mf }, rng).quality;
      if (q !== 'normal' && q !== 'superior' && q !== 'low') n++;
    }
    return n / N;
  };
  const b0 = better(0);
  const b500 = better(500);
  ok(b500 > b0 * 1.5, `magic find raises magic or better: ${b0.toFixed(3)} → ${b500.toFixed(3)}`);

  // armor defense: rolled in Min–MaxAC; enhanced defense sets the base to MaxAC + 1; ethereal half again
  for (let i = 0; i < 200; i++) {
    const it = G.createItem('qui');
    ok(it.defense >= 8 && it.defense <= 11, `quilted armor's defense ${it.defense}`);
  }
  const sup = M.makeItem({ code: 'qui', ilvl: 10, quality: 'superior', row: 0 }, rng);
  if ((sup.props ?? []).some((p) => p.c === 'ac%')) eq(sup.defense, 12, 'a superior armor with enhanced defense: MaxAC + 1');
  const eth = { ...G.createItem('qui'), eth: true, defense: 15 };
  eq(I.itemReqStats(eth).str, 2, 'ethereal: requirements − 10 (12 → 2)');
  const ease = { ...G.createItem('qui'), props: [{ c: 'ease', min: -20, max: -20 }] };
  eq(I.itemReqStats(ease).str, 12 + Math.trunc((12 * -20) / 100), 'requirements % toward zero');

  // low quality: three quarters of the base's damage (at least 1 and 2; thrown 2 and 1) and defense (at least 1)
  for (let i = 0; i < 50; i++) {
    const crude = M.makeItem({ code: 'lsd', ilvl: 1, quality: 'low' }, rng);
    eq(crude.quality, 'low', 'made low quality');
    eq(I.weaponDamage(crude).join(), '2,14', 'a low quality long sword: 75% of 3-19');
    const rag = M.makeItem({ code: 'qui', ilvl: 1, quality: 'low' }, rng);
    ok(rag.defense >= 6 && rag.defense <= 8, `a low quality quilted armor's defense ${rag.defense} (75% of 8-11)`);
  }
  const lowJav = M.makeItem({ code: 'jav', ilvl: 1, quality: 'low' }, rng);
  ok(I.weaponDamage(lowJav).join() === '1,3' && I.throwDamage(lowJav).join() === '4,10', `a low quality javelin: ${I.weaponDamage(lowJav)} / thrown ${I.throwDamage(lowJav)}`);
  // thrown damage takes ethereal and enhanced damage as the others do
  const ethJav = { ...M.makeItem({ code: 'jav', ilvl: 1, quality: 'normal' }, rng), eth: true, props: [{ c: 'dmg%', min: 50, max: 50 }] };
  eq(I.throwDamage(ethJav).join(), '13,31', 'an ethereal javelin with 50% enhanced damage throws 6-14 × 1.5 × 1.5');
  ok(texts(I.tooltip(ethJav, { level: 1, str: 99, dex: 99 })).includes(D.fmt(S.strItemStatThrowDamageRange, 13, 31)), 'and its tooltip says so');

  // never ethereal, no sockets, repaired: the starting kit, a vendor's stock, the cube
  for (let i = 0; i < 400; i++) {
    const kit = G.createItem('lsd');
    ok(!kit.eth && kit.sockets === 0, 'the starting kit: never ethereal, no sockets');
    const sold = G.rollEquipment(20, { identified: true });
    ok(!sold.eth && sold.dur === sold.maxDur, `a vendor's ${sold.baseId}: never ethereal, repaired (${sold.dur}/${sold.maxDur})`);
  }
  // a unique that falls back to rare keeps its 3× durability, repaired
  const failed = M.makeItem({ code: 'lsd', ilvl: 1, quality: 'unique', identified: true, noEth: true, repaired: true }, rng);
  ok(failed.quality === 'rare' && failed.maxDur === 3 * ITEM_BASES.lsd.dur && failed.dur === failed.maxDur, `a failed unique: ${failed.quality} ${failed.dur}/${failed.maxDur}`);

  // ── tooltip lines: D2's strings, descpriority order, combined pairs and groups ──
  const ed = describe([{ c: 'dmg%', min: 50, max: 50 }]);
  eq(ed.join(), '+50% 强化伤害', 'dmg% shows as Enhanced Damage');
  eq(describe([{ c: 'dmg-fire', min: 3, max: 9 }]).join(), '+ 3-9 火焰伤害', 'a damage pair on one line');
  eq(describe([{ c: 'fire-min', min: 4, max: 4 }, { c: 'fire-max', min: 4, max: 4 }]).join(), '+4 火焰伤害', 'equal min and max');
  eq(describe([{ c: 'res-all', min: 15, max: 15 }]).join(), '+15 所有抗性', 'all resistances as one line');
  eq(describe([{ c: 'res-fire', min: 15, max: 15 }, { c: 'res-cold', min: 10, max: 10 }]).length, 2, 'unequal resistances apart');
  eq(describe([{ c: 'all-stats', min: 5, max: 5 }]).join(), '+5 所有属性', 'all attributes');
  eq(describe([{ c: 'str', min: 3, max: 3 }, { c: 'str', min: 4, max: 4 }]).join(), '+7 力量', 'the same stat sums');
  eq(describe([{ c: 'hp/lvl', p: 8, min: 8, max: 8 }], 20).join(), `+20 生命 ${S.increaseswithplaylevelX}`, 'per level: value × level >> 3, and the note');
  eq(describe([{ c: 'att/lvl', p: 4, min: 4, max: 4 }], 20).join(), `+40 命中值 ${S.increaseswithplaylevelX}`, 'attack rating per level is in halves');
  eq(describe([{ c: 'dmg-pois', p: 75, min: 128, max: 128 }]).join(), '+38 毒素伤害，持续3秒', 'poison: its total over whole seconds');
  eq(describe([{ c: 'hit-skill', p: 'Frost Nova', min: 10, max: 3 }]).join(), '10% 几率在击中时施放3级Frost Nova', 'a proc');
  eq(describe([{ c: 'charged', p: 'Teleport', min: 30, max: 1 }]).join(), '1级Teleport (30/30 次充能)', 'charges');
  eq(describe([{ c: 'sor', min: 2, max: 2 }]).join(), '+2 sor技能等级', 'class skills');
  // highest priority first: all skills (156) above faster cast (142) above strength (67)
  eq(describe([{ c: 'str', min: 5, max: 5 }, { c: 'allskills', min: 1, max: 1 }, { c: 'cast1', min: 10, max: 10 }]).join('|'), '+1 所有技能|+10% 更快速施法|+5 力量', 'descpriority order');
  ok(D2X_STAT_DESC.item_allskills.pri > D2X_STAT_DESC.item_fastercastrate.pri, 'the priorities are ItemStatCost descpriority');
  // every property of every unique, set item, set and runeword describes without trouble, and every
  // property with a described stat has a line
  const silent = new Set(['sock', 'dur', 'ethereal', 'cold-len', 'pois-len', 'levelreq', 'bloody', 'fade', 'state', 'dmg-throw', 'pierce-immunity-cold', 'randclassskill', 'skill-rand']);
  const allProps = [...D2X_UNIQUES.flatMap((u) => u.props), ...D2X_SET_ITEMS.flatMap((s) => [...s.props, ...(s.bonus ?? []).flat()]), ...D2X_SETS.flatMap((s) => [...s.partial.flatMap((p) => p.props), ...s.full]), ...D2X_RUNEWORDS.flatMap((r) => r.props)];
  const quiet = new Set();
  for (const p of allProps) {
    const rolled = { ...p, min: Math.max(1, p.min), max: Math.max(1, p.max) };
    if (!describe([rolled]).length && !silent.has(p.c)) quiet.add(p.c);
    ok(PROP_CODES.includes(p.c) || ['bloody', 'fade', 'state', 'cold-len'].includes(p.c), `props.ts reads ${p.c}`);
  }
  eq([...quiet].join(), '', 'properties without a line');

  // greyed: what does nothing here says so
  const nec = { ...G.createItem('wnd'), props: [{ c: 'skill', p: 'Bone Spear', min: 2, max: 2 }, { c: 'str', min: 3, max: 3 }] };
  const tl = I.tooltip(nec, { level: 30, str: 50, dex: 50, cls: 'paladin' });
  const bone = tl.find((l) => l.text.includes('骨矛'));
  ok(bone && bone.text.endsWith(`（${I.NOT_IN_GAME}）`) && bone.color !== I.MOD_COLOR, `another class's skill greyed: ${bone?.text}`);
  ok(tl.some((l) => l.text === '+3 力量' && l.color === I.MOD_COLOR), 'strength is live');
  const hidden = I.tooltip({ ...nec, identified: false }, { level: 30, str: 50, dex: 50 });
  ok(hidden.some((l) => l.text === S.ItemStats1b) && !hidden.some((l) => l.text === '+3 力量'), 'unidentified: no properties, and it says so');
  const reqs = I.tooltip(G.createItem('lsd'), { level: 1, str: 10, dex: 50 });
  ok(reqs.find((l) => l.text === '需要力量: 55')?.color === '#ff4040' && !reqs.find((l) => l.text === '需要敏捷: 39')?.color, 'unmet requirements in red');
  ok(reqs.some((l) => l.text.startsWith('耐久度: ')), 'durability');

  // ── the hero: identified items only, charms from the bag, sets by pieces worn ──
  const p = new Player({ x: 0, z: 0 });
  p.level = 30;
  p.base = { str: 100, dex: 100, vit: 50, ene: 50 };
  const charm = { ...G.createItem('cm1'), rarity: 'magic', quality: 'magic', props: [{ c: 'str', min: 6, max: 6 }], reqLvl: 1 };
  p.markDirty();
  const str0 = p.stats.str;
  p.inventory.add(charm);
  p.markDirty();
  eq(p.stats.str, str0 + 6, 'a charm in the bag counts');
  charm.identified = false;
  p.markDirty();
  eq(p.stats.str, str0, 'an unidentified charm does not');
  charm.identified = true;
  p.inventory.remove(charm);
  p.stash.add(charm);
  p.markDirty();
  eq(p.stats.str, str0, 'nor one in the stash');
  ok(!p.meetsReq({ ...G.createItem('lsd'), identified: false }), 'unidentified gear can not be worn');
  ok(!p.meetsReq(G.createItem('ne1')) && p.meetsReq(G.createItem('pa1')), 'class items: only the class');
  ok(!p.meetsReq(G.createItem('sbw')), 'no bows here');
  // a set: two pieces worn turn on their 2-piece bonuses
  const set = D2X_SETS.find((s) => s.partial.some((x) => x.n === 2 && x.props.some((pp) => pp.c === 'res-fire')) && s.pieces.length >= 2);
  const pieces = set.pieces.slice(0, 2).map((key) => D2X_SET_ITEMS.find((x) => x.key === key));
  const made = pieces.map((row) => M.makeItem({ code: row.code, ilvl: 99, quality: 'set', row: row.id, identified: true }, rng));
  ok(made.every((m, i) => m.setRow === pieces[i].id), 'set items made by row');
  const fire0 = p.stats.res.fire;
  for (const m of made) {
    const slot = { shield: 'offhand', helm: 'head', armor: 'body', gloves: 'hands', boots: 'feet', belt: 'waist', ring: 'ring1', amulet: 'neck' }[ITEM_BASES[m.baseId].type] ?? 'weapon';
    p.equipment[slot === 'ring1' && p.equipment.ring1 ? 'ring2' : slot] = m;
  }
  p.markDirty();
  const own = made.flatMap((m) => m.props ?? []).filter((pp) => pp.c === 'res-fire' || pp.c === 'res-all').reduce((s, pp) => s + pp.min, 0);
  const bonus = set.partial.find((x) => x.n === 2).props.filter((pp) => pp.c === 'res-fire').reduce((s, pp) => s + pp.min, 0);
  ok(p.stats.res.fire >= Math.min(75, fire0 + own + bonus), `${set.name}: 2 pieces give the 2-piece fire resistance (${fire0} → ${p.stats.res.fire}, own ${own}, bonus ${bonus})`);
  const setTip = texts(I.tooltip(made[0], { level: 30, str: 100, dex: 100, cls: 'paladin', worn: made }));
  ok(setTip.includes(set.name) && setTip.some((t) => t.startsWith('（2 件）')), 'the set item shows its set and bonuses');

  // a piece counts only while the hero meets its requirements, strength too (Civerb's Ward needs 34)
  const weak = new Player({ x: 0, z: 0 });
  weak.level = 30;
  weak.base = { str: 10, dex: 100, vit: 50, ene: 50 };
  const needy = made.find((m) => I.itemReqStats(m).str > 10);
  if (needy) {
    for (const m of made) weak.equipment[ITEM_BASES[m.baseId].type === 'amulet' ? 'neck' : ITEM_BASES[m.baseId].type === 'shield' ? 'offhand' : 'body'] = m;
    weak.markDirty();
    const ownFire = made.flatMap((m) => m.props ?? []).filter((pp) => pp.c === 'res-fire' || pp.c === 'res-all').reduce((s, pp) => s + pp.min, 0);
    eq(weak.stats.res.fire, Math.min(75, ownFire), `${set.name}: a piece the hero is too weak for doesn't count`);
    const weakTip = I.tooltip(made[0], { level: 30, str: 10, dex: 100, cls: 'paladin', worn: made });
    ok(weakTip.filter((l) => l.text.startsWith('（2 件）')).every((l) => l.color !== I.RARITY_COLOR.unique), 'and the tooltip shows its 2-piece bonus off');
  }
  // every bonus a line of its own
  const big = D2X_SETS.find((s) => s.full.length >= 3);
  const bigMade = big.pieces.map((key) => D2X_SET_ITEMS.find((x) => x.key === key)).map((row) => M.makeItem({ code: row.code, ilvl: 99, quality: 'set', row: row.id, identified: true }, rng));
  const full = texts(I.tooltip(bigMade[0], { level: 99, str: 500, dex: 500, cls: 'paladin', worn: bigMade })).filter((t) => t.startsWith('（全套）'));
  ok(full.length >= 3 && full.every((t) => !t.includes('，')), `${big.name}'s full set bonuses, a line each: ${full.join(' / ')}`);

  // flat defense off armor is the hero's; enhanced damage off a weapon the hero's damage % (level 50 for the Cat's Eye)
  const pal = new Player({ x: 0, z: 0 });
  pal.level = 50;
  pal.base = { str: 100, dex: 100, vit: 50, ene: 50 };
  pal.equipment.weapon = G.createItem('lsd');
  pal.equipment.body = G.createItem('qui');
  pal.markDirty();
  const def0 = pal.stats.def;
  const pct0 = pal.stats.dmgPct;
  const stout = { ...G.createItem('cm3'), rarity: 'magic', quality: 'magic', prefixes: [121], props: [{ c: 'ac', min: 11, max: 11 }], reqLvl: 9 };
  pal.inventory.add(stout);
  pal.markDirty();
  eq(pal.stats.def, def0 + 11, 'a grand charm\'s +11 defense');
  pal.inventory.remove(stout);
  const catsEye = D2X_UNIQUES.find((u) => u.key === "The Cat's Eye");
  pal.equipment.neck = M.makeItem({ code: 'amu', ilvl: 99, quality: 'unique', row: catsEye.id, identified: true }, rng);
  pal.markDirty();
  const dexDef = Math.floor(pal.stats.dex / 4) - Math.floor(100 / 4);
  eq(pal.stats.def, def0 + 100 + dexDef, "the Cat's Eye's +100 defense");
  pal.equipment.neck = null;
  const blanched = { ...G.createItem('jew'), rarity: 'magic', quality: 'magic', props: [{ c: 'ac', min: 6, max: 6 }], reqLvl: 1 };
  pal.equipment.weapon = { ...G.createItem('lsd'), sockets: 1, socketed: [blanched] };
  pal.markDirty();
  eq(pal.stats.def, def0 + 6, 'a jewel\'s +6 defense in a weapon');
  const cinnabar = { ...G.createItem('jew'), rarity: 'magic', quality: 'magic', props: [{ c: 'dmg%', min: 10, max: 10 }], reqLvl: 1 };
  pal.equipment.body = { ...G.createItem('qui'), sockets: 1, socketed: [cinnabar] };
  pal.markDirty();
  eq(pal.stats.dmgPct, pct0 + 10, 'a jewel\'s +10% enhanced damage in armor');

  // reanimate names our monster; an old item's mods in D2's words; a charm says where it works under its name
  ok(texts(I.propLines({ ...G.createItem('lsd'), props: [{ c: 'reanimate', p: 1, min: 10, max: 10 }] }, 1))[0].includes('归魂骸'), 'reanimate as one of our monsters');
  const oldShield = texts(I.propLines({ ...G.createItem('buc'), mods: [{ stat: 'defPct', value: 30 }, { stat: 'defLocal', value: 9 }] }, 1));
  ok(oldShield.includes(describe([{ c: 'ac%', min: 30, max: 30 }])[0]) && oldShield.includes(describe([{ c: 'ac', min: 9, max: 9 }])[0]), `an old shield's mods as D2 says them: ${oldShield.join(' / ')}`);
  const charmTip = texts(I.tooltip(stout, { level: 1, str: 10, dex: 10 }));
  ok(charmTip[1] === S.Charmdes && charmTip.indexOf(S.Charmdes) < charmTip.findIndex((t) => t.startsWith('需要等级')), `a charm's line under its name: ${charmTip.join(' / ')}`);

  // ── runewords and jewels in sockets ──
  const stealth = D2X_RUNEWORDS.find((r) => r.en === 'Stealth');
  const armor = { ...G.createItem('qui'), sockets: 2, socketed: ['r07', 'r05'] };
  ok(G.applyRuneword(armor) && armor.rarity === 'runeword' && armor.runewordRow === stealth.id && I.displayName(armor) === stealth.name, `Stealth: ${I.displayName(armor)}`);
  ok(I.itemReqLvl(armor) === Math.max(ITEM_BASES.r07.reqLvl, ITEM_BASES.r05.reqLvl), 'a runeword needs its runes\' level');
  const jewel = { ...G.createItem('jew'), rarity: 'magic', quality: 'magic', props: [{ c: 'dex', min: 4, max: 4 }], reqLvl: 1 };
  const helm = { ...G.createItem('cap'), sockets: 1, socketed: [jewel] };
  ok(I.itemMods(helm).dex === 4 && texts(I.propLines(helm, 1)).includes('+4 敏捷'), 'a jewel brings its rolled properties');
  ok(I.socketMods({ ...G.createItem('cap'), sockets: 1, socketed: ['gcv'] }).length > 0, 'a gem by its helm list');

  // ── the cube on D2 codes: 3 healing + 3 mana potions + a chipped gem → a rejuvenation potion ──
  const cube = new Grid(3, 4);
  for (const id of ['hp1', 'hp2', 'hp1', 'mp1', 'mp1', 'mp2', 'gcv']) cube.add(G.createItem(id));
  const r = transmute(cube, 10);
  ok(r.ok && cube.items.length === 1 && cube.items[0].item.baseId === 'rvs', `cube: ${r.message}`);
  // six perfect gems and a magic amulet: an amulet with MagicPrefix row 331 (pre=331), its name ours
  const prism = D2X_PREFIXES.find((a) => a.id === 331);
  for (let i = 0; i < 20; i++) {
    const c2 = new Grid(3, 4);
    for (const id of ['gpv', 'gpy', 'gpb', 'gpg', 'gpr', 'gpw']) c2.add(G.createItem(id));
    c2.add(M.makeItem({ code: 'amu', ilvl: 30, quality: 'magic', identified: true }, rng));
    const r2 = transmute(c2, 30);
    const amu = c2.items[0]?.item;
    ok(r2.ok && amu?.baseId === 'amu' && amu.prefixes?.join() === '331' && (amu.suffixes?.length ?? 0) <= 1 && I.displayName(amu).endsWith(`${prism.name}护符`) && amu.identified, `prismatic amulet: ${r2.message} ${JSON.stringify(amu?.prefixes)} ${JSON.stringify(amu?.suffixes)}`);
  }

  // what the cube makes is never ethereal, and its sockets come from the recipe (3 chipped gems + a magic weapon: 1-2)
  for (let i = 0; i < 300; i++) {
    const c3 = new Grid(3, 4);
    for (const id of ['gcv', 'gcy', 'gcb']) c3.add(G.createItem(id));
    c3.add(M.makeItem({ code: 'lsd', ilvl: 30, quality: 'magic', identified: true }, rng));
    const r3 = transmute(c3, 30);
    const out = c3.items[0]?.item;
    ok(r3.ok && out?.quality === 'magic' && !out.eth && out.sockets >= 1 && out.sockets <= 2, `socketed magic weapon: ${r3.message} eth ${out?.eth}, ${out?.sockets} sockets`);
  }

  // the cube's upgrades make the base's stats again (PlrTrade.cpp:611-657, D2GAME_InitItemStats):
  // Greyform (Quilted Armor, 8-11) onto Ghost Armor (102-117), +5 levels as a crafted levelreq
  const greyform = D2X_UNIQUES.find((u) => u.key === 'Greyform');
  const upgrade = (it, runes) => {
    const c = new Grid(3, 4);
    for (const id of runes) c.add(G.createItem(id));
    c.add(it);
    const r = transmute(c, 30);
    ok(r.ok && c.items.length === 1, `upgrade: ${r.message}`);
    return c.items[0].item;
  };
  for (let i = 0; i < 20; i++) {
    const grey = M.makeItem({ code: 'qui', ilvl: 30, quality: 'unique', row: greyform.id, identified: true }, rng);
    const up = upgrade(grey, ['r07', 'r13', 'gpw']);
    ok(up.baseId === 'xui' && up.defense >= 102 && up.defense <= 117, `Greyform upgraded: ${up.baseId}, defense ${up.defense}`);
    eq(I.itemDefense(up), up.defense + 20, 'its +20 defense on the new roll');
    ok(up.maxDur === ITEM_BASES.xui.dur && up.dur >= ITEM_BASES.xui.dur >> 1 && up.dur <= up.maxDur, `durability made again: ${up.dur}/${up.maxDur}`);
    eq(I.itemReqLvl(up), ITEM_BASES.xui.reqLvl + 5, 'Ghost Armor\'s level and the recipe\'s 5');
    eq(up.reqLvl, ITEM_BASES.xui.reqLvl + 5, 'as made');
    ok(texts(I.tooltip(up, { level: 30, str: 100, dex: 100 })).includes(D.fmt(S.ItemStats1h, up.defense + 20)), 'the tooltip shows it');
  }
  // its own dur properties stay (Steelgoad's +20-40 as rolled), an ethereal drop's halving doesn't
  const goad = D2X_UNIQUES.find((u) => u.key === 'Steelgoad');
  const sg = M.makeItem({ code: 'vou', ilvl: 99, quality: 'unique', row: goad.id, identified: true, noEth: true }, rng);
  const sgDur = sg.maxDur - ITEM_BASES.vou.dur;
  ok(sg.uniqueRow === goad.id && sgDur >= 20 && sgDur <= 40, `Steelgoad's +${sgDur} durability`);
  const sgEth = { ...sg, uid: 'eth', eth: true, maxDur: Math.floor(ITEM_BASES.vou.dur / 2) + 1 + sgDur };
  for (const it of [sg, sgEth]) {
    const up = upgrade(it, ['r08', 'r12', 'gpg']);
    ok(up.baseId === '9vo' && up.maxDur === ITEM_BASES['9vo'].dur + sgDur && up.dur <= up.maxDur, `Steelgoad upgraded${it.eth ? ', ethereal' : ''}: ${up.dur}/${up.maxDur}`);
  }
  // a unique that fell to rare had 3× its base's durability, the old base stat's (no Crystal Sword unique drops)
  const fell = M.makeItem({ code: 'crs', ilvl: 30, quality: 'unique', identified: true, noEth: true }, rng);
  ok(fell.quality === 'rare' && fell.maxDur === 3 * ITEM_BASES.crs.dur, `a Crystal Sword unique falls to rare: ${fell.quality} ${fell.maxDur}`);
  eq(upgrade(fell, ['r09', 'r11', 'gpb']).maxDur, ITEM_BASES['9cr'].dur, "upgraded, the new base's durability");
  // an armor's rolled range (Pelta Lunata's +8-12) too
  const pelta = D2X_UNIQUES.find((u) => u.key === 'Pelta Lunata');
  const pl = M.makeItem({ code: 'buc', ilvl: 30, quality: 'unique', row: pelta.id, identified: true, noEth: true }, rng);
  const plDur = pl.maxDur - ITEM_BASES.buc.dur;
  eq(upgrade(pl, ['r07', 'r13', 'gpw']).maxDur, ITEM_BASES.xuc.dur + plDur, `Pelta Lunata's +${plDur} durability kept`);

  // ── the level an item needs: its skills' (Items.cpp:1400-1433) and a recipe's levelreq ──
  const uniq = (key, code) => M.makeItem({ code, ilvl: 99, quality: 'unique', row: D2X_UNIQUES.find((u) => u.key === key).id, identified: true }, rng);
  eq(I.itemReqLvl(uniq('Rusthandle', 'gsc')), 18, "Rusthandle: Vengeance's 18 over the row's 17");
  eq(I.itemReqLvl(uniq('Stormeye', 'wsp')), 30, "Stormeye: Fist of the Heavens' 30 over the row's 23");
  const tele = { baseId: 'rin', quality: 'normal', socketed: [], props: [{ c: 'oskill', p: 'Teleport', min: 1, max: 1 }] };
  eq(A.requiredLevel(tele), 24, '+1 to Teleport (any class): its 18 and 6 more');
  eq(A.requiredLevel(tele, 'sor'), 18, 'and for a sorceress its own 18');
  eq(A.requiredLevel({ baseId: 'lsd', quality: 'normal', socketed: [], props: [{ c: 'levelreq', min: 7, max: 7 }] }), (ITEM_BASES.lsd.reqLvl ?? 0) + 7, 'levelreq on top');

  // ── tooltip lines: pairs read together, zero sums, what does nothing here ──
  // a weapon's "of Frost" (cold-min, cold-max, cold-len): cold damage works here, its length is part of its line
  const frost = D2X_SUFFIXES.find((a) => a.id === 23);
  ok(frost.props.some((pp) => pp.c === 'cold-len'), 'of Frost has a cold length');
  const frosty = { ...G.createItem('lsd'), rarity: 'magic', quality: 'magic', suffixes: [23], props: frost.props.map((pp) => ({ ...pp, max: pp.min })) };
  const cold = I.propLines(frosty, 10).find((l) => l.text.includes(describe(frost.props.filter((pp) => pp.c !== 'cold-len').map((pp) => ({ ...pp, max: pp.min })))[0]));
  ok(cold && cold.color === I.MOD_COLOR && !cold.text.includes(I.NOT_IN_GAME), `of Frost's cold damage is live: ${cold?.text}`);
  const pois = I.propLines({ ...G.createItem('lsd'), props: [{ c: 'pois-min', min: 128, max: 128 }, { c: 'pois-max', min: 128, max: 128 }, { c: 'pois-len', min: 75, max: 75 }] }, 10);
  ok(pois.length === 1 && pois[0].color === I.MOD_COLOR && !pois[0].text.includes(I.NOT_IN_GAME), `poison damage over 3 seconds is live: ${pois.map((l) => l.text).join(' / ')}`);
  ok(!I.lineLive([{ c: 'pois-len', min: 75, max: 75 }]), 'a lone poison length is not');
  // Malice's -1 light radius and its El's +1: no line (a stat summing to 0 leaves D2's stat list)
  eq(describe([{ c: 'light', min: -1, max: -1 }, { c: 'light', min: 1, max: 1 }]).length, 0, '-1 and +1 light radius');
  const malice = { ...G.createItem('lsd'), sockets: 3, socketed: ['r06', 'r01', 'r05'] };
  ok(G.applyRuneword(malice) && malice.rarity === 'runeword', 'Malice');
  const lightLine = describe([{ c: 'light', min: 1, max: 1 }])[0].replace(/[+-]?\d+/, '');
  ok(!texts(I.propLines(malice, 10)).some((t) => t.includes(lightLine)), `Malice shows no light radius: ${texts(I.propLines(malice, 10)).join(' / ')}`);
  // vendor prices are D2's (src/items/vendor.ts): "reduces all vendor prices" and self-repair work
  const cheap = I.propLines({ ...G.createItem('rin'), props: [{ c: 'cheap', min: 10, max: 10 }] }, 1)[0];
  ok(!cheap.text.includes(I.NOT_IN_GAME) && cheap.color === I.MOD_COLOR, `cheaper prices live: ${cheap.text}`);
  const mend = I.propLines({ ...G.createItem('lsd'), props: [{ c: 'rep-dur', p: 5, min: 5, max: 5 }] }, 1)[0];
  ok(!mend.text.includes(I.NOT_IN_GAME) && mend.color === I.MOD_COLOR, `self-repair live: ${mend.text}`);
  // "(仅限…)" as D2R writes it, old items' lines too
  const zeal = I.describeParamMod({ stat: 'skill', value: 1, param: 'Zeal' }, null).text;
  ok(zeal.includes('(仅限') && !zeal.includes('（'), `class only, half-width brackets: ${zeal}`);
  ok(texts(I.tooltip(G.createItem('pa1'), { level: 30, str: 100, dex: 100, cls: 'paladin' })).some((t) => t.startsWith('(仅限')), 'a class item says so the same way');

  // ── worn items the hero no longer meets give nothing (ItemMode.cpp:1995-2091) ──
  const knight = new Player({ x: 0, z: 0 });
  knight.level = 30;
  const plate = G.createItem('plt');
  const need = I.itemReqStats(plate).str;
  knight.base = { str: need - 5, dex: 50, vit: 50, ene: 50 };
  const strRing = { ...G.createItem('rin'), rarity: 'magic', quality: 'magic', props: [{ c: 'str', min: 10, max: 10 }], reqLvl: 1 };
  knight.equipment.ring1 = strRing;
  knight.equipment.body = plate;
  knight.markDirty();
  const def1 = knight.stats.def;
  ok(!knight.unusable(plate) && def1 >= plate.defense, `the ring's strength holds the plate up (${need} needed)`);
  knight.equipment.ring1 = null;
  knight.markDirty();
  ok(knight.unusable(plate) && knight.stats.def === Math.floor(knight.stats.dex / 4), `without the ring the plate gives nothing: def ${knight.stats.def}`);
  knight.equipment.ring1 = strRing;
  knight.markDirty();
  ok(!knight.unusable(plate) && knight.stats.def === def1, 'and with it back it works again');
  // its own strength counts toward its own requirement while it is on (Items.cpp:1019-1040)
  const selfPlate = { ...G.createItem('plt'), rarity: 'magic', quality: 'magic', props: [{ c: 'str', min: 10, max: 10 }], reqLvl: 1 };
  knight.equipment.ring1 = strRing;
  knight.equipment.body = selfPlate;
  knight.markDirty();
  knight.equipment.ring1 = null;
  knight.markDirty();
  ok(!knight.unusable(selfPlate), 'a plate with +10 strength holds itself up once on');

  // ── gold is the gld misc item, its amount its stack ──
  const gold = G.makeGold(37);
  ok(gold.baseId === 'gld' && gold.qty === 37 && G.isGold(gold) && I.displayName(gold) === ITEM_BASES.gld.name, 'gold');
  let golds = 0;
  for (let i = 0; i < 200; i++) for (const d of G.rollMonsterDrops(12, 1, 0, 0)) if (G.isGold(d.item)) golds += d.item.qty > 0 ? 1 : 0;
  ok(golds > 0, 'monsters drop gold items');

  // ── what drops: through the D2 item maker, on D2 bases ──
  for (let i = 0; i < 300; i++) {
    for (const d of G.rollMonsterDrops(12, i % 4, 100, 0)) {
      if (d.kind === 'item') ok(ITEM_BASES[d.item.baseId] && d.item.quality && EQUIPPABLE_BASES.length, `dropped ${d.item.baseId}`);
    }
  }
  console.log(`  bases from d2x; magic, rare, superior, low and socketed names composed (%2%0%1, %0%1…); magic or better ${(b0 * 100).toFixed(1)}% → ${(b500 * 100).toFixed(1)}% at 500% MF; defense, requirements, D2 tooltip lines; charms, sets, runewords, jewels, the cube`);
};
