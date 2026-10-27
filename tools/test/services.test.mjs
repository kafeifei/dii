// The camp's item services on Diablo II's rules: prices worked out again from the tables the way
// ITEMS_CalculateTransactionCost does (D2Common Items.cpp:1962-2554: base cost, identified rows,
// sockets, ethereal and class quarters, npc.json multipliers, the vendor's limit, reduced prices,
// quest multipliers, tomes by their scrolls, repairs by the durability missing), durability (4% of
// hits for a weapon, 10% of blows for armor by body location 3:5:4:2:2:2, broken gives nothing,
// indestructible, self-repair every 2500/n + 1 frames, ethereal never repaired), sockets (D2's
// checks, runewords on the last rune, nothing comes out), the camp's shelves (the NPC columns at
// the hero's level + 5 capped at 12 in Normal, permanent stock, resale) and identification.
function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}
function ok(c, what) {
  if (!c) throw new Error(what);
}
const idiv = (a, b) => Math.trunc(a / b);
/** a source that hands out these rolls (each as a fraction of the range it is rolled in), then 0 */
const fixed = (...xs) => ({ next: () => (xs.length ? xs.shift() : 0) });

export default async (load) => {
  const C = await load('/src/items/d2/cost.ts');
  const D = await load('/src/items/d2/durability.ts');
  const S = await load('/src/items/d2/sockets.ts');
  const { D2_BASES } = await load('/src/items/d2/bases.ts');
  const M = await load('/src/items/make.ts');
  const G = await load('/src/items/gen.ts');
  const I = await load('/src/items/item.ts');
  const V = await load('/src/items/vendor.ts');
  const { D2X_NPC_PRICES } = await load('/src/data/d2x/npc.ts');
  const { D2X_STAT_DESC, D2X_TOOLTIP_STRINGS: STR } = await load('/src/data/d2x/statdesc.ts');
  const { D2X_RUNEWORDS } = await load('/src/data/d2x/runewords.ts');
  const { Player } = await load('/src/game/player.ts');
  const { RNG } = await load('/src/core/math.ts');
  const rng = new RNG(20261027);
  const facts = [];
  const make = (code, o = {}) => M.makeItem({ code, ilvl: 10, quality: 'normal', identified: true, noEth: true, noSockets: true, ...o }, rng);
  const price = (it, kind, npc = 'charsi', spec = {}) => C.transactionCost(it, kind, { npc, ...spec });
  const charsi = D2X_NPC_PRICES.charsi;
  const mult = (x) => Math.round(x * 1024);

  // ── prices: the base's cost through Charsi's multipliers (960 and 512 of 1024) ──
  const ssd = make('ssd');
  const cost = D2_BASES.ssd.cost;
  eq(price(ssd, 'buy'), idiv(cost * mult(charsi.heroBuys), 1024), 'a short sword at Charsi: cost × 960 / 1024');
  eq(price(ssd, 'sell'), idiv(cost * mult(charsi.heroSells), 1024), 'and sold: × 512 / 1024');
  eq(price(ssd, 'buy', 'akara'), cost, 'Akara asks the cost itself');
  // armor by its defense of the base's most
  const qui = make('qui');
  eq(price(qui, 'sell'), idiv(idiv(qui.defense * D2_BASES.qui.cost, D2_BASES.qui.ac[1]) * 512, 1024), `quilted armor at defense ${qui.defense} of ${D2_BASES.qui.ac[1]}`);
  // a low quality item: half off
  const low = { ...ssd, quality: 'low', rarity: 'low', qualityRow: 1 };
  eq(price(low, 'buy'), idiv((cost + idiv(cost, -2)) * 960, 1024), 'low quality: half the cost off');
  // ethereal and class items: a quarter of what the vendor pays, the same asking price
  eq(price({ ...ssd, eth: true }, 'sell'), idiv(idiv(cost, 4) * 512, 1024), 'ethereal fetches a quarter');
  eq(price({ ...ssd, eth: true }, 'buy'), price(ssd, 'buy'), 'and costs the same');
  const targe = make('pa1');
  ok(price(targe, 'sell') <= idiv(price(targe, 'buy'), 4), `a Paladin's shield fetches a quarter: ${price(targe, 'sell')} of ${price(targe, 'buy')}`);
  // what fills a socket adds half its own cost
  const holed = { ...make('ssd'), sockets: 2, socketed: ['gcv'] };
  eq(price(holed, 'sell') - price(ssd, 'sell'), idiv((cost + D2_BASES.gcv.cost / 2) * 512, 1024) - idiv(cost * 512, 1024), 'a chipped amethyst in it: half its cost');
  // a magic item: its stats at ItemStatCost's Multiply / Add, only once identified
  const sword = { ...ssd, rarity: 'magic', quality: 'magic', identified: true, suffixes: [], props: [{ c: 'str', min: 5, max: 5 }] };
  const [m, a] = D2X_STAT_DESC.strength.cost;
  eq(price(sword, 'sell'), idiv((cost + a + idiv(5 * cost * m, 1024)) * 512, 1024), `+5 strength: Add ${a} + 5 × cost × ${m} / 1024`);
  eq(price({ ...sword, identified: false }, 'sell'), price(ssd, 'sell'), 'unidentified it fetches what its base does');
  ok(price({ ...sword, identified: false }, 'sell') < price(sword, 'sell'), 'so less than identified');
  // the vendor's limit on what it pays, and nothing past it however good
  const rare = make('lsd', { quality: 'rare', ilvl: 40 });
  eq(price(rare, 'sell'), Math.min(price(rare, 'sell'), charsi.maxPay[0]), 'a sale fetches at most the limit');
  ok(price(make('lsd', { quality: 'unique', ilvl: 40 }), 'sell') <= 5000, 'Normal pays at most 5000');
  ok(price(rare, 'sell', 'charsi', { difficulty: 2 }) <= charsi.maxPay[2], 'Hell at most its own');
  // reduced prices: buying and repairs, not selling; quest multipliers on top
  const r10 = price(ssd, 'buy', 'charsi', { reduced: 10 });
  eq(r10, price(ssd, 'buy') - idiv(price(ssd, 'buy') * 10, 100), '10% cheaper buys');
  eq(price(ssd, 'sell', 'charsi', { reduced: 10 }), price(ssd, 'sell'), 'and sells the same');
  const q = charsi.quests[0];
  eq(price(ssd, 'buy', 'charsi', { quests: new Set([q.quest]) }), idiv(price(ssd, 'buy') * mult(q.heroBuys), 1024), `after ${q.quest} Charsi asks × ${mult(q.heroBuys)} / 1024`);
  // a tome by its scrolls; arrows by the 1024
  const tome = { ...make('ibk'), qty: 7 };
  eq(price(tome, 'buy', 'akara'), D2_BASES.ibk.cost + 7 * D2_BASES.ibk.chargeCost, `a tome of identify with 7: ${D2_BASES.ibk.cost} + 7 × ${D2_BASES.ibk.chargeCost}`);
  eq(price(make('isc'), 'buy', 'akara'), D2_BASES.isc.cost, 'a scroll of identify');
  const arrows = { ...make('aqv'), qty: 350 };
  eq(price(arrows, 'buy'), idiv(idiv(350 * D2_BASES.aqv.cost, 1024) * 960, 1024), 'arrows: 350 × cost / 1024');
  facts.push(`short sword ${price(ssd, 'buy')}/${price(ssd, 'sell')}, tome of 7 ${price(tome, 'buy', 'akara')}`);

  // ── repairs: by the share of durability missing, Charsi's 128 / 1024; never ethereal ──
  const worn = { ...make('ssd'), dur: 6, maxDur: 24 };
  eq(price(worn, 'repair'), idiv(idiv(cost * 18, 24) * mult(charsi.repair), 1024) || 1, '18 of 24 missing');
  eq(V.repairCost({ ...worn, dur: 24 }), 0, 'nothing to repair at full');
  eq(V.repairCost({ ...worn, eth: true }), 0, 'ethereal items are never repaired');
  ok(!C.isRepairable({ ...worn, eth: true }) && C.isRepairable(worn), 'ITEMS_IsRepairable');
  const mending = { ...worn, props: [{ c: 'rep-dur', p: 5, min: 5, max: 5 }] };
  eq(price(mending, 'repair'), Math.max(idiv(idiv(cost * 23, 24) * 128, 1024), 1), 'a self-repairing item: all but its last point');
  const unbreakable = { ...worn, props: [{ c: 'indestruct', min: 1, max: 1 }] };
  ok(!C.wears(unbreakable) && V.repairCost(unbreakable) === 0, 'indestructible: nothing wears, nothing to repair');
  ok(!C.wears({ ...worn, socketed: ['r33'], sockets: 1 }) && C.wears({ ...worn, socketed: ['r31'], sockets: 1 }), 'rune 33 in a socket makes it indestructible');
  // charges used: a repair recharges, and costs for it
  const wand = { ...make('wnd'), props: [{ c: 'charged', p: 'Teleport', min: 10, max: 3 }], charges: { Teleport: 4 } };
  ok(V.needsRepair(wand) && C.rechargeCost(wand) > 0, `charges to refill: ${C.rechargeCost(wand)}`);
  D.repairItem(wand);
  eq(wand.charges.Teleport, 10, 'recharged');
  ok(V.repairAllList({ weapon: { ...wand, charges: { Teleport: 1 } }, body: { ...qui, dur: 1 } }).length === 1, 'repair all leaves charged items to be repaired on their own');
  // gold: carried first, then the stash; short, part of the durability for all that's carried
  const purse = { gold: 2, stashGold: 1000 };
  const r = V.repairOne({ ...worn }, purse);
  ok(r?.full && purse.gold === 0 && purse.stashGold === 1002 - r.spent, `the stash pays the rest: ${JSON.stringify(r)} ${JSON.stringify(purse)}`);
  const longWorn = { ...make('lsd'), dur: 4, maxDur: 44 };
  const full = V.repairCost(longWorn);
  const poor = { gold: 50, stashGold: 0 };
  const part = V.repairOne(longWorn, poor);
  eq(longWorn.dur, 4 + idiv(50 * 1024, idiv(full * 1024, 40)), `part of a ${full} gold repair for 50`);
  ok(part && !part.full && part.spent === 50 && poor.gold === 0, `all the gold carried: ${JSON.stringify(part)}`);
  ok(V.repairOne({ ...longWorn, dur: 4 }, { gold: 1, stashGold: 0 }) === null, 'not even a point for 1 gold');

  // ── durability ──
  const n = 20000;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const w = { ...make('ssd'), dur: 20, maxDur: 24 };
    if (D.wearDown(w, rng) === 'worn') hits++;
  }
  ok(Math.abs(hits / n - 0.04) < 0.006, `a weapon wears on 4% of hits: ${((hits / n) * 100).toFixed(1)}%`);
  let blows = 0;
  for (let i = 0; i < n; i++) if (D.wearDown({ ...qui, dur: 10 }, rng) === 'worn') blows++;
  ok(Math.abs(blows / n - 0.1) < 0.01, `armor on 10%: ${((blows / n) * 100).toFixed(1)}%`);
  const last = { ...make('ssd'), dur: 1, maxDur: 24 };
  eq(D.wearDown(last, fixed(0)), 'broke', 'the last point breaks it');
  ok(D.isBroken(last) && D.wearDown(last, fixed(0)) === null, 'broken, it stays so');
  ok(D.wearDown(unbreakable, fixed(0)) === null, 'indestructible never wears');
  // where blows land: 3:5:4:2:2:2 over head, torso, shield, belt, feet, gloves; never the weapon
  const kit = { head: make('cap'), body: make('qui'), weapon: make('ssd'), offhand: make('buc'), waist: make('lbl'), feet: make('lbt'), hands: make('lgl') };
  const landed = {};
  for (let i = 0; i < n; i++) {
    const h = D.struckArmor(kit, rng);
    const slot = Object.keys(kit).find((k) => kit[k] === h.item);
    landed[slot] = (landed[slot] ?? 0) + 1;
  }
  const want = { head: 3, body: 5, offhand: 4, waist: 2, feet: 2, hands: 2 };
  for (const [slot, w] of Object.entries(want)) ok(Math.abs(landed[slot] / n - w / 18) < 0.012, `${slot} struck ${((landed[slot] / n) * 100).toFixed(1)}%, expected ${((w / 18) * 100).toFixed(1)}%`);
  ok(!landed.weapon, 'the weapon is not armor');
  ok(D.struckArmor({ weapon: make('ssd') }, rng) === null, 'nothing to wear without armor');
  // self-repair: a point every 2500/n + 1 frames, none while broken
  eq(D.replenishFrames(mending), 501, 'repairs 1 durability in 20 seconds (rep-dur 5)');
  const healing = { ...mending, dur: 10 };
  let carried = D.replenish(healing, 1001);
  eq(healing.dur, 11, 'one point in 1001 frames');
  carried = D.replenish(healing, 1, carried);
  eq(healing.dur, 12, 'the next frame the second');
  const brokenMend = { ...mending, dur: 0 };
  D.replenish(brokenMend, 5000);
  eq(brokenMend.dur, 0, 'a broken item does not mend');
  // broken gear gives nothing and shows red
  const p = new Player({ x: 0, z: 0 });
  p.equipment.body = make('qui');
  p.markDirty();
  const withArmor = p.stats.def;
  p.equipment.body.dur = 0;
  p.markDirty();
  ok(p.stats.def < withArmor && p.unusable(p.equipment.body), `broken armor gives no defense: ${p.stats.def} < ${withArmor}`);
  p.equipment.body.dur = 1;
  p.markDirty();
  eq(p.stats.def, withArmor, 'mended, it counts again');
  // the hero's items mend wherever they are
  const ring = { ...mending, dur: 3 };
  p.inventory.add(ring);
  p.mendItems(30);
  ok(ring.dur > 3, `self-repair from the bag: ${ring.dur}`);

  // ── sockets ──
  const plain = { ...make('ssd'), sockets: 2, socketed: [] };
  const amethyst = G.createItem('gcv');
  eq(S.socketBlock(plain, amethyst), null, 'a gem into a socketed normal sword');
  eq(S.socketBlock({ ...plain, identified: false }, amethyst), 'unidentified', 'not into an unidentified item');
  eq(S.socketBlock(plain, make('ssd')), 'notFiller', 'only gems, runes and jewels');
  eq(S.socketBlock(plain, { ...M.makeItem({ code: 'jew', ilvl: 20 }, rng), identified: false }), 'fillerUnidentified', 'an unidentified jewel');
  eq(S.socketBlock({ ...plain, sockets: 0 }, amethyst), 'noSockets', 'none without sockets');
  eq(S.socketBlock({ ...plain, socketed: ['gcv', 'gcv'] }, amethyst), 'full', 'none when full');
  const magicHoled = { ...plain, rarity: 'magic', quality: 'magic' };
  ok(S.socketBlock(magicHoled, amethyst) === null && !M.insertFiller(magicHoled, G.createItem('r07')), 'a magic item takes them too, and is no runeword');
  // a runeword on its last rune, its properties rolled; jewels go in whole
  const stealth = D2X_RUNEWORDS.find((rw) => rw.runes.join() === '7,5' && rw.itypes.includes('tors'));
  const armor = { ...make('qui'), sockets: 2, socketed: [] };
  ok(!M.insertFiller(armor, G.createItem('r07', 'normal', 30)) && armor.rarity === 'normal', 'the first rune makes nothing yet');
  ok(M.insertFiller(armor, G.createItem('r05', 'normal', 30)) && armor.rarity === 'runeword' && armor.runewordRow === stealth.id, `the last makes ${stealth.name}`);
  eq(I.displayName(armor), stealth.name, 'named as the runeword');
  const jewel = M.makeItem({ code: 'jew', ilvl: 20, identified: true }, rng);
  const jeweled = { ...make('qui'), sockets: 1, socketed: [] };
  M.insertFiller(jeweled, jewel);
  ok(jeweled.socketed[0] === jewel, 'a jewel goes in whole');
  ok(G.rollRune(12).ilvl === 12 && G.rollGem(0, 9).ilvl === 9, 'dropped runes and gems keep the monster level');

  // ── the camp's shelves ──
  eq(V.storeLevel(1), 6, 'the hero level + 5');
  eq(V.storeLevel(30), 12, 'at most 12 in Normal Act 1');
  eq(V.storeLevel(30, 1), 35, 'not capped in Nightmare');
  for (const clvl of [1, 4, 9, 20]) {
    const store = V.fillStore(V.CAMP_VENDORS, clvl, 0, rng);
    const ilvl = V.storeLevel(clvl);
    const items = store.all();
    const bad = [];
    const counts = {};
    for (const it of items) {
      const b = D2_BASES[it.baseId];
      const npc = store.npcOf.get(it);
      const s = b.shop?.[npc];
      if (!s) bad.push(`${it.baseId} not on ${npc}'s shelf`);
      if (!b.perm && b.qlvl > ilvl) bad.push(`${it.baseId} qlvl ${b.qlvl} > ${ilvl}`);
      if (it.ilvl !== ilvl) bad.push(`${it.baseId} at ilvl ${it.ilvl}`);
      if (it.identified === false || it.eth || (it.maxDur && it.dur !== it.maxDur)) bad.push(`${it.baseId} unidentified, ethereal or worn`);
      if (it.quality === 'magic' && (!b.shopMagic || (s?.magicLvl ?? 255) > ilvl)) bad.push(`${it.baseId} magic past its magic level`);
      if (it.quality === 'low' && (ilvl >= 5 || it.qualityRow === 0)) bad.push(`${it.baseId} low quality at ${ilvl} (row ${it.qualityRow})`);
      if (it.quality === 'superior' && ilvl < 5) bad.push(`${it.baseId} superior below 5`);
      const k = `${npc}:${it.baseId}:${it.quality === 'magic' ? 'm' : 'n'}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const [k, c] of Object.entries(counts)) {
      const [npc, code, kind] = k.split(':');
      const s = D2_BASES[code].shop[npc];
      const max = D2_BASES[code].perm ? 1 : kind === 'm' ? (s.magicMax ?? 0) : (s.max ?? 0);
      if (c > max) bad.push(`${k}: ${c} > ${max}`);
    }
    ok(!bad.length, `shelves at clvl ${clvl}: ${bad.slice(0, 5).join('; ')}`);
    ok(['isc', 'ibk', 'tsc', 'tbk', 'hp1', 'mp1'].every((c) => items.filter((it) => it.baseId === c && store.perm.has(it)).length === 1), 'one of each of Akara\'s permanent stock');
    ok(items.some((it) => store.npcOf.get(it) === 'charsi' && D2_BASES[it.baseId].type === 'tors') || clvl < 4, 'Charsi\'s armour');
    facts.push(`clvl ${clvl}: ${items.length} items on ${store.shown().map((s) => s.label).join('/')}`);
  }
  const store = V.fillStore(V.CAMP_VENDORS, 10, 0, rng);
  const aqv = store.all().find((it) => it.baseId === 'aqv');
  eq(aqv.qty, D2_BASES.aqv.stack[1], 'arrows on the shelf as a full stack');
  // buying: a permanent item is copied, anything else leaves the shelf, each at its NPC's price
  const scroll = store.all().find((it) => it.baseId === 'isc');
  const bought = V.takeFromStore(store, scroll);
  ok(bought !== scroll && bought.uid !== scroll.uid && store.contains(scroll), 'a scroll is copied off the shelf');
  const blade = store.all().find((it) => store.npcOf.get(it) === 'charsi' && D2_BASES[it.baseId].type === 'swor' && !store.perm.has(it));
  if (blade) {
    eq(V.buyPrice(store, blade), price(blade, 'buy', 'charsi'), "a sword at Charsi's price");
    ok(V.takeFromStore(store, blade) === blade && !store.contains(blade), 'bought, it leaves the shelf');
    ok(V.shelveSold(store, blade) && store.contains(blade), 'sold back, it is shelved again');
  }
  ok(!V.shelveSold(store, G.createItem('hp1')), 'a permanent item sold back is not shelved twice');
  ok(!V.shelveSold(store, { ...make('ssd'), eth: true }), 'ethereal items are not resold');
  ok(!V.shelveSold(store, { ...make('ssd'), sockets: 1, socketed: ['gcv'] }), 'nor ones with something socketed');
  eq(V.sellPrice(V.CAMP_VENDORS, G.createItem('hp1')), price(G.createItem('hp1'), 'sell', 'akara'), 'a potion is sold to Akara');

  // ── identifying and stacks ──
  const tomes = Array.from({ length: 400 }, () => G.createItem('ibk').qty);
  ok(Math.min(...tomes) === 1 && Math.max(...tomes) === 4, `a new tome holds 1 to 4 scrolls (min … spawnstack − 1): ${Math.min(...tomes)}–${Math.max(...tomes)}`);
  const unid = M.makeItem({ code: 'lsd', ilvl: 30, quality: 'rare' }, rng);
  ok(unid.identified === false && I.displayName(unid) === D2_BASES.lsd.name, 'a rare drops unidentified, named by its base');
  const shown = I.tooltip(unid, { level: 30, str: 200, dex: 200, cls: 'paladin' }).map((l) => l.text);
  const hidden = I.propLines({ ...unid, identified: true }, 30).map((l) => l.text);
  ok(hidden.length && hidden.every((t) => !shown.includes(t)) && shown.includes(STR.ItemStats1b), `its properties hidden, "${STR.ItemStats1b}" said: ${shown.join(' / ')}`);
  // a scroll identifies it; then it shows and sells for what it is
  const before = V.sellPrice(V.CAMP_VENDORS, unid);
  unid.identified = true;
  ok(I.displayName(unid) !== D2_BASES.lsd.name && V.sellPrice(V.CAMP_VENDORS, unid) > before, `identified: ${I.displayName(unid)}, ${before} → ${V.sellPrice(V.CAMP_VENDORS, unid)}`);

  // an item this build doesn't know (a later build's, kept as saved): no price, nothing to wear or mend
  const unknown = { uid: 'u1', baseId: 'unknown', rarity: 'normal', ilvl: 1, name: '?', mods: [], sockets: 0, socketed: [], reqLvl: 1, raw: { v: 9, mig: {}, item: {} } };
  ok(V.sellPrice(V.CAMP_VENDORS, unknown) === 0 && !V.needsRepair(unknown) && !D.isBroken(unknown) && !V.resellable(unknown), 'an unknown item: no price, no wear');
  p.inventory.add(unknown);
  p.mendItems(1);

  console.log(`  ${facts.join('; ')}`);
};
