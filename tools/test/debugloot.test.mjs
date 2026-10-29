// The debug panel's loot (src/items/debugloot.ts): every item of a kind, quality and item level
// asked for, ethereal and punched when asked, runes and gems by their levels, and what can't be made
// (a rare charm, a ring with sockets) told apart rather than made as something else.
function ok(c, what) {
  if (!c) throw new Error(what);
}

export default async (load) => {
  const { debugLoot } = await load('/src/items/debugloot.ts');
  const { baseOf } = await load('/src/items/item.ts');
  const { categoryOf } = await load('/src/data/items.ts');
  const { d2Base, itemMaxSockets } = await load('/src/items/d2/bases.ts');
  const spec = (more) => ({ lo: 1, hi: 99, kinds: ['weapon'], qualities: [], ethereal: false, sockets: 0, identified: false, difficulty: 0, mf: 0, ...more });

  // each quality on each kind of gear, inside the item levels
  const t0 = performance.now();
  for (const q of ['normal', 'magic', 'rare', 'set', 'unique']) {
    const r = debugLoot(spec({ lo: 40, hi: 60, kinds: ['helm', 'body', 'weapon'], qualities: [q] }), 30);
    ok(r.items.length === 30 && !r.missed.length, `${q}: ${r.items.length} made, ${r.missed.length} missed`);
    for (const it of r.items) {
      const want = q === 'normal' ? ['low', 'normal', 'superior'] : [q];
      ok(want.includes(it.rarity), `${q} asked, ${it.rarity} made (${it.baseId})`);
      ok(it.ilvl >= 40 && it.ilvl <= 60, `${q}: item level ${it.ilvl} outside 40–60`);
      ok(['helm', 'body', 'weapon'].includes(categoryOf(baseOf(it).type)), `${q}: a ${baseOf(it).type} made`);
    }
  }
  // several qualities: each comes up
  const mixed = debugLoot(spec({ kinds: ['ring', 'amulet'], qualities: ['magic', 'rare', 'unique'] }), 60);
  for (const q of ['magic', 'rare', 'unique']) ok(mixed.items.some((it) => it.rarity === q), `no ${q} among 60 jewellery`);
  ok(mixed.items.every((it) => ['ring', 'amulet'].includes(baseOf(it).type)), 'jewellery asked, something else made');

  // ethereal and punched: every one, the sockets as many as asked or the base's most
  const eth = debugLoot(spec({ lo: 70, hi: 70, kinds: ['weapon', 'body'], qualities: ['unique', 'rare', 'normal'], ethereal: true, sockets: 4 }), 30);
  ok(eth.items.length === 30, `ethereal and punched: ${eth.items.length} made`);
  for (const it of eth.items) {
    ok(it.eth, `${it.rarity} ${it.baseId} not ethereal`);
    const most = itemMaxSockets(d2Base(it.baseId), 70);
    ok(it.sockets === Math.min(4, most) && it.sockets > 0, `${it.baseId}: ${it.sockets} sockets, asked 4, it takes ${most}`);
  }
  // set items are never ethereal: none made, none passed off as another quality
  const setEth = debugLoot(spec({ kinds: ['helm'], qualities: ['set'], ethereal: true }), 5);
  ok(!setEth.items.length && setEth.missed.length === 5 && setEth.unused.join() === 'set', `ethereal set helms: ${setEth.items.length} made, unused ${setEth.unused}`);
  const mixedEth = debugLoot(spec({ kinds: ['helm'], qualities: ['set', 'unique'], ethereal: true }), 10);
  ok(mixedEth.items.every((it) => it.rarity === 'unique' && it.eth) && mixedEth.unused.join() === 'set', 'ethereal set or unique helms: not all ethereal uniques, or set not said');
  // a quality a kind can't have is left out for the kind, the others still made: charms are never rare
  const charms = debugLoot(spec({ kinds: ['charm'], qualities: ['rare', 'magic'] }), 20);
  ok(charms.items.length === 20 && charms.items.every((it) => it.rarity === 'magic'), `charms, rare or magic: ${charms.items.map((it) => it.rarity).join()}`);
  // rings take no sockets
  const rings = debugLoot(spec({ kinds: ['ring', 'rune'], sockets: 2 }), 40);
  ok(rings.missed.every((k) => k === 'ring') && rings.missed.length > 0 && rings.items.every((it) => baseOf(it).type === 'rune'), 'punched rings were made, or runes missed');

  // a set item needs its row's level: from the low end up until one fits
  const low = debugLoot(spec({ lo: 1, hi: 99, kinds: ['helm'], qualities: ['set'] }), 20);
  ok(low.items.length === 20 && low.items.every((it) => it.rarity === 'set'), `set helms at 1–99: ${low.items.length}`);
  // identified when asked, unidentified as dropped otherwise
  ok(debugLoot(spec({ qualities: ['rare'], identified: true }), 10).items.every((it) => it.identified), 'identified asked, some not');
  ok(debugLoot(spec({ qualities: ['rare'] }), 10).items.every((it) => !it.identified), 'rare items made identified unasked');
  // none asked: rolled with the hero's magic find, whatever comes
  ok(debugLoot(spec({ kinds: ['gloves'], mf: 300 }), 20).items.every((it) => baseOf(it).type === 'gloves'), 'rolled gloves are not gloves');

  // runes and gems by their own levels; the nearest when none is in between
  const runes = debugLoot(spec({ lo: 60, hi: 99, kinds: ['rune'] }), 40).items;
  ok(runes.every((it) => Number(it.baseId.slice(1)) >= 28), `runes at 60–99: ${runes.map((it) => it.baseId).join()}`);
  ok(debugLoot(spec({ lo: 1, hi: 5, kinds: ['rune'] }), 10).items.every((it) => it.baseId === 'r01' || it.baseId === 'r02'), 'runes below the first: not the first two');
  const gems = debugLoot(spec({ lo: 50, hi: 99, kinds: ['gem'] }), 20).items;
  ok(gems.every((it) => it.baseId.startsWith('gp') || it.baseId === 'skz'), `gems at 50–99: ${gems.map((it) => it.baseId).join()}`);
  // gold, a pile by its item level
  const gold = debugLoot(spec({ lo: 30, hi: 30, kinds: ['gold'] }), 5).items;
  ok(gold.every((it) => it.baseId === 'gld' && it.qty >= 30 && it.qty <= 180), `gold at 30: ${gold.map((it) => it.qty).join()}`);
  // quick enough for a click: the panel's most, 50, of the slowest asks well under a second
  const t1 = performance.now();
  debugLoot(spec({ kinds: ['weapon', 'helm', 'body', 'shield'], qualities: ['normal', 'unique'], ethereal: true, sockets: 6 }), 50);
  const ms = performance.now() - t1;
  ok(ms < 1000, `50 ethereal punched items took ${Math.round(ms)} ms`);
  ok(performance.now() - t0 < 10000, 'the loot test took over 10 s');
};
