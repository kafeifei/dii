// Saves (src/game/save.ts). The fixtures are what the game writes: a level 12 paladin, made and
// played through Game, saved by its own writer (version 4) in the camp, Blood Moor and the trial
// ground's floors (the endless dungeon's, at its depths), then turned into what versions 1, 2 and 3
// wrote at their depths 0, 1 and 5 (before version 3, depth 1 was the dungeon's first floor; since,
// it is the wilderness), their items on the game's own base ids as they were before the D2 bases
// (items migration 1), without the scrolls those builds didn't have. Each loads into version 4, in
// the camp whatever its depth, and is written back as it: every item still there on a D2 base
// (unknown ones by the stash, holding themselves as saved), and a tome of town portal (items
// migration 2: portals were free then), once, worn gear still usable, the points adding up, the waypoints areas (the dungeon's kept in
// the save, the camp's the only one listed), the save's text backed up first, once. Then: the 32 old
// armor bases and the rest of the old ids onto their D2 bases, keeping defense and requirements;
// migration steps and the backups they leave (every one from before version 4 and the hero's first
// stay), unknown items catching up when they come back, a version 4 round trip (the hireling read
// into the hero and written back the same), the hireling's gear (versions 1–3 with it: each item
// through each step once, none lost, an unknown one by the stash, as from version 4; one this build
// can't read kept as it was; a hero without one written back to the byte), where a version 4 save
// resumes (an area this build has, else the camp), newer and unbacked saves never written (the
// hireling with them), and Game saving the area the hero stands in.
const KEY = 'dii-save-v1';
const LEVEL = 12;
/** a save's migration counts before any step */
const ZERO = { items: 0, world: 0, skills: 0 };
/** the backups in storage (Web Storage's own listing: Object.keys sees nothing in the Node stand-in) */
const backups = () => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i).startsWith(`${KEY}-backup-`)) out.push(localStorage.key(i));
  return out.sort();
};
const clone = (x) => JSON.parse(JSON.stringify(x));
/** an item as a save holds it, of a base this build may not have */
const item = (baseId, more = {}) => ({ uid: `t${Math.random().toString(36).slice(2)}`, baseId, rarity: 'normal', ilvl: 1, name: baseId, mods: [], sockets: 0, socketed: [], reqLvl: 1, ...more });
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
/** experience before Diablo II's table (src/game/save.ts migrateXp) */
const oldXp = (L) => (L <= 1 ? 0 : Math.floor(60 * Math.pow(L - 1, 2.3) + 100 * (L - 1)));

const savedItems = (d) => {
  const placed = [...(d.inventory ?? []), ...(d.stash ?? []), ...(d.cube ?? [])].map((p) => p.item);
  return [...Object.values(d.equipment ?? {}), ...placed, ...(d.unplaced ?? []), ...(d.belt ?? []).flat()];
};
const playerItems = (p) => [...Object.values(p.equipment), ...p.inventory.items.map((x) => x.item), ...p.stash.items.map((x) => x.item), ...p.cube.items.map((x) => x.item), ...p.unplaced, ...p.belt.flat()];

/** the hero's D2 bases as the game named them before the D2 bases (src/items/legacy.ts OLD_BASES) */
const OLD_ID = { lsd: 'longsword', '9ls': 'runesword', ssd: 'shortsword', cap: 'cap', qui: 'quiltedarmor', buc: 'buckler', rin: 'ring', amu: 'amulet', hp1: 'hp1', mp1: 'mp1' };
/** an item as a build before the D2 bases wrote it: the old id, the old fields only */
const asOld = (it) => {
  if (!it || typeof it !== 'object' || it.baseId === 'unknown') return it;
  const o = { uid: it.uid, baseId: OLD_ID[it.baseId] ?? it.baseId, rarity: it.rarity, ilvl: it.ilvl, name: it.name, mods: [...(it.mods ?? [])], sockets: it.sockets, socketed: (it.socketed ?? []).map(asOld), reqLvl: Math.max(1, it.reqLvl) };
  if (it.defense !== undefined) o.defense = it.defense;
  if (it.legacy) o.legacy = it.legacy;
  return o;
};
/** the scrolls and tomes of the kit: no build before the D2 bases had any */
const SCROLLS = new Set(['tsc', 'isc', 'tbk', 'ibk']);
const notScroll = (it) => !SCROLLS.has(it?.baseId);
/** every item of a save written by a build before the D2 bases */
const oldItems = (d) => {
  for (const k of Object.keys(d.equipment ?? {})) d.equipment[k] = asOld(d.equipment[k]);
  for (const k of ['inventory', 'stash', 'cube']) if (d[k]) d[k] = d[k].filter((pl) => notScroll(pl.item));
  for (const list of [d.inventory, d.stash, d.cube]) for (const pl of list ?? []) pl.item = asOld(pl.item);
  if (d.unplaced) d.unplaced = d.unplaced.filter(notScroll).map(asOld);
  if (d.belt) d.belt = d.belt.map((col) => col.filter(notScroll).map(asOld));
  return d;
};
/** the tome of town portal items migration 2 gives a hero with no town portal in the bag, with its 5 charges */
const giftOf = (p) => p.inventory.items.map((x) => x.item).find((it) => it.baseId === 'tbk' && it.qty === 5);

export default async (load) => {
  const save = await load('/src/game/save.ts');
  const { isUnknown, socketMods, tooltip, displayName, itemDefense } = await load('/src/items/item.ts');
  const { ITEM_BASES } = await load('/src/data/items.ts');
  const { CLASSES } = await load('/src/data/classes.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { Player, xpForLevel } = await load('/src/game/player.ts');
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL, areaForDepth } = await load('/src/world/areas.ts');
  const { WILD_MAPS } = await load('/src/world/levelgen.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const reset = () => {
    localStorage.clear();
    save.setSlot(0);
  };
  const thisBuild = () => Object.fromEntries(Object.entries(save.MIGRATIONS).map(([k, steps]) => [k, steps.length]));
  /** stat and skill points add up for the level: a new character's, and 5 and 1 a level since */
  const pointsOk = (d) => sum(d.base) + d.statPoints === sum(CLASSES[d.cls ?? 'paladin'].base) + 5 * (d.level - 1) && sum(d.skills) + d.skillPoints === d.level;
  const pointsOf = (d) => `${sum(d.base)}+${d.statPoints} stat, ${sum(d.skills)}+${d.skillPoints} skill points at level ${d.level}`;

  // ── the hero, as the game makes, plays and saves one ──
  reset();
  const game = new Game({}, new Sfx());
  game.hooks = {
    message() {},
    openPanel() {},
    levelChanged() {},
    areaChanged() {},
    teleported() {},
    playerDied() {},
    inventoryChanged() {},
    getCursorItem: () => null,
    setCursorItem() {},
    hoveredGroundId: () => null,
    levelUp() {},
  };
  game.newGame('存档测试', 'paladin');
  const hero = game.player;
  hero.gainXp(xpForLevel(LEVEL) + Math.floor((xpForLevel(LEVEL + 1) - xpForLevel(LEVEL)) / 3));
  if (hero.level !== LEVEL) throw new Error(`the hero is level ${hero.level}, not ${LEVEL}`);
  // a long sword's strength and dexterity, the rest kept
  hero.base.str = 55;
  hero.base.dex = 39;
  hero.statPoints -= 30 + 19;
  for (let i = 0; i < 9; i++) {
    const s = hero.learnableSkills()[0];
    hero.skills[s.id] = (hero.skills[s.id] ?? 0) + 1;
    hero.skillPoints--;
  }
  const sword = createItem('lsd');
  sword.sockets = 2;
  sword.socketed = ['r01', 'r02'];
  hero.equipment.weapon = sword;
  hero.equipment.head = createItem('cap');
  hero.equipment.body = createItem('qui');
  const buckler = createItem('buc');
  buckler.sockets = 1;
  hero.equipment.offhand = buckler;
  for (const id of ['hp1', 'hp1', 'mp1']) hero.inventory.add(createItem(id));
  hero.stash.add(createItem('9ls'));
  hero.cube.add(createItem('rin', 'magic'));
  hero.cubeFound = true;
  hero.unplaced = [createItem('amu', 'magic')];
  hero.gold = 1200;
  hero.stashGold = 3400;
  hero.markDirty();
  /**
   * what version 4 writes at each of the old depths, played in this order, with the waypoints an
   * old version had touched by then (its depths: the camp's, and every dungeon floor's on arriving)
   */
  const at = new Map();
  const touched = [0];
  for (const depth of [0, 1, 1 + WILD_MAPS, 4 + WILD_MAPS, 5 + WILD_MAPS]) {
    game.enterLevel(depth, 'waypoint');
    if (depth > WILD_MAPS) touched.push(depth);
    at.set(depth, { d: JSON.parse(localStorage.getItem(KEY)), waypoints: [...touched] });
  }
  game.enterLevel(0, 'waypoint');
  if (!pointsOk(at.get(0).d)) throw new Error(`the hero's points don't add up: ${pointsOf(at.get(0).d)}`);

  /**
   * What version `v` wrote at its depth `depth`, from what version 4 writes. `v` is 1, 2 or 3, or
   * '1d': version 1 by the first D2 release, which had the cube and took the old runewords apart
   */
  function oldSave(v, depth) {
    const n = v === '1d' ? 1 : v;
    // before version 3 there was no wilderness: the dungeon's floors were depths 1 and on
    const today = (x) => (n < 3 && x > 0 ? x + WILD_MAPS : x);
    const back = (x) => (n < 3 && x > WILD_MAPS ? x - WILD_MAPS : x);
    const { d: d4, waypoints } = at.get(today(depth));
    const d = oldItems(clone(d4));
    const o = {
      v: n,
      name: d.name,
      cls: d.cls,
      level: d.level,
      xp: d.xp,
      base: d.base,
      statPoints: d.statPoints,
      skillPoints: d.skillPoints,
      skills: d.skills,
      equipment: d.equipment,
      inventory: d.inventory,
      stash: d.stash,
      cube: d.cube,
      cubeFound: d.cubeFound,
      unplaced: d.unplaced,
      belt: d.belt,
      gold: d.gold,
      stashGold: d.stashGold,
      binds: d.binds,
      activeAura: d.activeAura,
      depthReached: back(d.depthReached),
      waypoints: waypoints.map(back),
      depth,
      life: d.life,
      mana: d.mana,
      time: d.time,
    };
    if (n < 2) {
      // a hero from before the D2 items: an old long sword's strength and dexterity, the points kept
      o.statPoints += o.base.str - 40 + (o.base.dex - 25);
      o.base = { ...o.base, str: 40, dex: 25 };
      // the old runeword Ember Oath on the long sword: whole before the D2 items, taken apart by their first release
      o.equipment.weapon = v === '1d'
        ? { ...o.equipment.weapon, socketed: ['r08', 'r01'] }
        : { ...o.equipment.weapon, rarity: 'runeword', runewordId: 'rw_emberoath', name: '余烬誓言', socketed: ['r_ember', 'r_dawn'], reqLvl: 6, mods: [{ stat: 'dmgPct', value: 70 }, { stat: 'ias', value: 20 }] };
    }
    if (v === 1) {
      // the old runes and bases, the old experience table, no cube and nothing by the stash yet
      o.xp = oldXp(o.level) + Math.floor((oldXp(o.level + 1) - oldXp(o.level)) / 3);
      for (const pl of o.stash) if (pl.item.baseId === 'runesword') pl.item = { ...pl.item, baseId: 'runeblade', name: '符文之刃' };
      delete o.cube;
      delete o.cubeFound;
      delete o.unplaced;
    }
    if (v === '1d') delete o.unplaced;
    // what this build doesn't have: a ring, a relic in the bag, a potion in the belt, a rune in the buckler
    o.equipment.ring1 = item('zz_moonring', { rarity: 'magic', name: '月之戒指' });
    o.inventory.push({ item: item('zz_relic', { mods: [{ stat: 'str', value: 5 }] }), x: 9, y: 3 });
    o.belt[2].push(item('zz_potion'));
    o.equipment.offhand.socketed = ['zz_rune'];
    return o;
  }

  // ── versions 1, 2 and 3 at depths 0, 1 and 5 ──
  for (const v of [1, '1d', 2, 3]) {
    const n = v === '1d' ? 1 : v;
    for (const depth of [0, 1, 5]) {
      reset();
      const what = `v${v} at depth ${depth}`;
      const old = oldSave(v, depth);
      if (!pointsOk(old)) throw new Error(`${what}: the fixture's points don't add up: ${pointsOf(old)}`);
      const raw = JSON.stringify(old);
      localStorage.setItem(KEY, raw);
      const s = save.loadSave();
      if (!s) {
        problems.push(`${what}: didn't load`);
        continue;
      }
      const p = s.player;
      check(s.readOnly === null, `${what}: read-only (${s.readOnly})`);
      const backup = `${KEY}-backup-0-${n}`;
      check(backups().join() === backup && localStorage.getItem(backup) === raw, `${what}: backups ${backups().join(', ') || 'none'}, want ${backup} holding the save as it was`);
      // whatever the depth, in the camp: the old depths were the endless dungeon's
      check(s.area === CAMP_AREA, `${what}: resumes in area ${s.area}, not the camp`);
      // the waypoints touched, a dungeon floor's one deeper before version 3, behind the wilderness; the camp's the one listed
      const wps = old.waypoints.map((w) => (n < 3 && w > 0 ? w + WILD_MAPS : w)).sort((a, b) => a - b);
      check(p.waypoints.join() === String(CAMP_AREA), `${what}: waypoints ${p.waypoints}, want the camp's`);
      check(pointsOk(p), `${what}: ${pointsOf(p)}`);
      check(p.xp >= xpForLevel(LEVEL) && p.xp < xpForLevel(LEVEL + 1), `${what}: ${p.xp} experience at level ${p.level}`);
      // every item still there, the unknown ones by the stash, and a tome of town portal in the bag
      const before = savedItems(old).length;
      const after = playerItems(p);
      check(after.length === before + 1 && giftOf(p), `${what}: ${before} items saved, ${after.length} loaded, the tome of town portal ${!!giftOf(p)}`);
      const unknown = after.filter(isUnknown);
      check(unknown.length === 3 && unknown.every((u) => p.unplaced.includes(u)), `${what}: ${unknown.length} unknown items, ${unknown.filter((u) => p.unplaced.includes(u)).length} by the stash; want 3, all`);
      check(
        unknown.map((u) => u.raw?.item?.baseId).sort().join() === 'zz_moonring,zz_potion,zz_relic' && unknown.every((u) => u.raw.v === n && sum(u.raw.mig) === 0 && !!u.raw.damaged === (v === '1d')),
        `${what}: the unknown items hold ${unknown.map((u) => `${u.raw?.item?.baseId}@v${u.raw?.v}/${JSON.stringify(u.raw?.mig)}${u.raw?.damaged ? ' damaged' : ''}`).join(', ')}`,
      );
      check(unknown.every((u) => u.name === '未知物品' && tooltip(u).length > 1), `${what}: an unknown item is named ${unknown[0]?.name}`);
      const shield = p.equipment.offhand;
      check(shield?.socketed.join() === 'zz_rune' && tooltip(shield).some((l) => l.text.includes('认不出')), `${what}: the buckler's unknown rune became ${shield?.socketed.join()}, or its tooltip doesn't say`);
      // what the hero wears is still usable, or keeps the requirements it had
      for (const [slot, it] of Object.entries(p.equipment)) check(p.meetsReq(it) || it.legacy, `${what}: can't use the ${it.baseId} in ${slot} (${JSON.stringify(it.legacy)})`);
      // every item on a D2 base now, of the quality it was
      const onD2 = after.filter((it) => !isUnknown(it));
      check(onD2.every((it) => ITEM_BASES[it.baseId] && it.quality === (it.rarity === 'runeword' ? 'normal' : it.rarity)), `${what}: items on ${onD2.filter((it) => !ITEM_BASES[it.baseId] || !it.quality).map((it) => `${it.baseId}/${it.quality}`).join(', ')}`);
      check(p.equipment.head?.baseId === 'cap' && p.equipment.body?.baseId === 'qui' && p.equipment.offhand?.baseId === 'buc' && (v === 1 || p.cube.items[0]?.item.baseId === 'rin'), `${what}: armor and the ring became ${p.equipment.head?.baseId}, ${p.equipment.body?.baseId}, ${p.equipment.offhand?.baseId}, ${p.cube.items[0]?.item.baseId}`);
      // the old armor keeps the defense it rolled, and gets its new base's durability
      const savedBody = Object.values(old.equipment).find((it) => it?.baseId === 'quiltedarmor');
      check(p.equipment.body?.defense === savedBody?.defense && p.equipment.body.maxDur === ITEM_BASES.qui.dur, `${what}: the quilted armor's defense ${p.equipment.body?.defense} (saved ${savedBody?.defense}), durability ${p.equipment.body?.maxDur}`);
      const weapon = p.equipment.weapon;
      if (n < 2) {
        // the old long sword needs less than the D2 one: only its old requirements let the hero wield it
        check(weapon?.legacy?.str === 40 && p.meetsReq(weapon) && !p.meetsReq({ ...weapon, legacy: undefined }), `${what}: the long sword's old requirements ${JSON.stringify(weapon?.legacy)}`);
        const rwOk = weapon?.rarity === 'runeword' && weapon.runewordId === 'rw_emberoath' && weapon.socketed.join() === 'r08,r01';
        check(rwOk && weapon.mods.length >= 2 && tooltip(weapon).some((l) => l.text.startsWith('旧版符文之语')), `${what}: Ember Oath is ${weapon?.rarity} ${weapon?.runewordId} with ${weapon?.socketed.join()} and ${weapon?.mods.length} mods`);
      } else {
        check(weapon?.baseId === 'lsd' && !weapon.legacy && weapon.socketed.join() === 'r01,r02' && p.meetsReq(weapon), `${what}: the weapon is ${weapon?.baseId} with ${weapon?.socketed.join()}, legacy ${JSON.stringify(weapon?.legacy)}`);
      }
      const big = p.stash.items.find((x) => x.item.baseId === '9ls')?.item;
      check(big && displayName(big) === ITEM_BASES['9ls'].name && (v !== 1 || (big.legacy?.str === 103 && big.legacy.dex === 72)), `${what}: the stashed rune sword is ${big && displayName(big)}, legacy ${JSON.stringify(big?.legacy)}`);

      // written back as version 4
      save.writeSave(p, s.area);
      const d = JSON.parse(localStorage.getItem(KEY));
      check(d.v === 4 && JSON.stringify(d.mig) === JSON.stringify(thisBuild()), `${what}: written as v${d.v}, migrations ${JSON.stringify(d.mig)}`);
      check(savedItems(d).every((it) => it.baseId === 'unknown' || ITEM_BASES[it.baseId]), `${what}: written with bases ${savedItems(d).map((it) => it.baseId).join()}`);
      check(d.area === CAMP_AREA && !('depth' in d) && !('waypoints' in d), `${what}: written in area ${d.area}, depth ${d.depth}, waypoints ${d.waypoints}`);
      check(d.progress?.length === 3 && [...d.progress[0].waypoints].sort().join() === [...new Set(wps.map((w) => areaForDepth(w).id))].sort().join(), `${what}: written waypoints ${JSON.stringify(d.progress)}`);
      check(d.difficulty === 0 && d.unlocked === 0 && d.merc === null && d.corpse === null, `${what}: difficulty ${d.difficulty}/${d.unlocked}, merc ${d.merc}, corpse ${d.corpse}`);
      check(savedItems(d).length === before + 1 && pointsOk(d), `${what}: ${savedItems(d).length} items written (${before} were saved, and the tome), ${pointsOf(d)}`);

      // loaded again: nothing more to migrate or back up, nothing lost, no second tome
      const again = save.loadSave();
      check(backups().join() === backup && localStorage.getItem(backup) === raw, `${what}: loading the v4 save left backups ${backups().join(', ')}`);
      const items2 = playerItems(again.player);
      check(items2.length === before + 1 && items2.filter(isUnknown).length === 3, `${what}: reloaded ${items2.length} items, ${items2.filter(isUnknown).length} unknown`);
      check(again.area === CAMP_AREA && again.player.waypoints.join() === p.waypoints.join(), `${what}: reloaded in area ${again.area}, waypoints ${again.player.waypoints}`);

      // the same hero at that version again (an older build wrote it back): the first copy stays
      localStorage.setItem(KEY, JSON.stringify({ ...old, gold: old.gold + 1 }));
      save.loadSave();
      check(backups().join() === backup && localStorage.getItem(backup) === raw, `${what}: a later v${n} save of the same hero replaced the backup`);
    }
  }

  // ── every base the game had of its own, onto D2's (src/items/legacy.ts): nothing lost, defense and old requirements kept ──
  {
    reset();
    const { OLD_BASES } = await load('/src/items/legacy.ts');
    const { D2X_RUNEWORDS } = await load('/src/data/d2x/runewords.ts');
    const o = oldSave(3, 0);
    // one of each armor, ring, amulet and potion the game made up, at its old defense: odd values the D2 base can't roll
    const own = Object.values(OLD_BASES).filter((b) => !b.d2);
    const made = own.map((b, i) => item(b.id, ['shield', 'helm', 'armor', 'gloves', 'boots', 'belt'].includes(b.type) ? { defense: 50 + i, reqLvl: b.reqLvl } : {}));
    // an old magic shield with invented mods, an old unique and set item, and an old D2 runeword (Ancients' Pledge) on a kite shield
    made.push(item('roundshield', { rarity: 'magic', name: '坚固的圆盾', defense: 12, mods: [{ stat: 'defPct', value: 30 }], reqLvl: 4 }));
    made.push(item('leatherarmor', { rarity: 'unique', uniqueId: 'u_wanderer', name: '流浪者外衣', defense: 30, mods: [{ stat: 'frw', value: 20 }], reqLvl: 5 }));
    made.push(item('roundshield', { rarity: 'set', setItemId: 'sn_shield', name: '守夜人的提灯盾', defense: 11, mods: [{ stat: 'block', value: 10 }], reqLvl: 7 }));
    made.push(item('kiteshield', { rarity: 'runeword', runewordId: 'Runeword1', name: '先祖之誓', defense: 20, sockets: 3, socketed: ['r08', 'r09', 'r07'], mods: [{ stat: 'resCold', value: 30 }], reqLvl: 21 }));
    // and a magic long sword the first D2 release named with the official affix strings (suffix, prefix, base)
    const { D2_PREFIXES, D2_SUFFIXES } = await load('/src/data/d2/affixes.ts');
    const { D2X_PREFIXES, D2X_SUFFIXES } = await load('/src/data/d2x/affixes.ts');
    const oldPre = D2_PREFIXES.find((a) => a.en === 'Jagged');
    const oldSuf = D2_SUFFIXES.find((a) => a.en === 'of Maiming');
    const magicSword = item('longsword', { rarity: 'magic', name: `${oldSuf.name}${oldPre.name}长剑`, mods: [{ stat: 'dmgPct', value: 15 }, { stat: 'dmgMax', value: 3 }], reqLvl: 6 });
    o.stash = made.map((it, i) => ({ item: it, x: (i * 2) % 10, y: Math.floor(i / 5) * 2 }));
    o.inventory.push({ item: magicSword, x: 0, y: 0 });
    localStorage.setItem(KEY, JSON.stringify(o));
    const s = save.loadSave();
    const all = playerItems(s.player);
    check(all.length === savedItems(o).length + 1, `old bases: ${savedItems(o).length} items saved, ${all.length} loaded (with the tome)`);
    const byUid = new Map(all.map((it) => [it.uid, it]));
    for (const m of made) {
      const it = byUid.get(m.uid);
      const want = OLD_BASES[m.baseId].code;
      if (!it || it.baseId !== want || !ITEM_BASES[want]) {
        problems.push(`old bases: ${m.baseId} became ${it?.baseId}, want ${want}`);
        continue;
      }
      check(it.defense === m.defense && JSON.stringify(it.mods) === JSON.stringify(m.mods) && it.name === m.name, `old bases: the ${m.baseId} kept defense ${it.defense} (${m.defense}), mods ${JSON.stringify(it.mods)}, name ${it.name}`);
      const b = ITEM_BASES[want];
      // what it needs: never more than before, never more than its D2 base where it had less
      if (it.legacy) check(it.legacy.str <= (b.reqStr ?? 0) && it.legacy.lvl <= m.reqLvl, `old bases: the ${m.baseId}'s legacy ${JSON.stringify(it.legacy)}`);
      if (['shield', 'helm', 'armor', 'gloves', 'boots', 'belt'].includes(b.type)) check(it.legacy && it.maxDur === b.dur && it.dur === b.dur, `old bases: the ${m.baseId} has legacy ${JSON.stringify(it.legacy)}, durability ${it.dur}/${it.maxDur} (${b.dur})`);
    }
    // the plan's examples: roundshield is the Small Shield, platebelt the Plated Belt, the potions D2's
    const pairs = { roundshield: 'sml', gothicshield: 'gts', ringmail: 'rng', platemail: 'plt', crown: 'crn', platebelt: 'hbl', ring: 'rin', amulet: 'amu', rejuv: 'rvs', rejuvfull: 'rvl', hp4: 'hp4' };
    for (const [id, code] of Object.entries(pairs)) check(OLD_BASES[id]?.code === code, `old bases: ${id} goes to ${OLD_BASES[id]?.code}, want ${code}`);
    const small = byUid.get(made.find((m) => m.baseId === 'roundshield' && m.rarity === 'normal').uid);
    check(small && s.player.base.str >= 0 && small.legacy.str <= 22 && itemDefense(small) === small.defense, `old bases: the round shield (Small Shield) needs ${small?.legacy?.str} strength, defense ${small && itemDefense(small)}`);
    const magic = byUid.get(made.at(-4).uid);
    check(magic.quality === 'magic' && displayName(magic) === '坚固的圆盾' && itemDefense(magic) === Math.floor(12 * 1.3), `old bases: the old magic shield is ${displayName(magic)} with defense ${itemDefense(magic)}`);
    const uniq = byUid.get(made.at(-3).uid);
    const setItem = byUid.get(made.at(-2).uid);
    check(displayName(uniq) === '流浪者外衣' && displayName(setItem) === '守夜人的提灯盾' && tooltip(setItem).some((l) => l.text === '守夜人的誓约'), `old bases: the old unique and set item are ${displayName(uniq)}, ${displayName(setItem)}`);
    const rw = byUid.get(made.at(-1).uid);
    const pledge = D2X_RUNEWORDS.find((r) => r.id === 'Runeword1');
    check(rw.rarity === 'runeword' && rw.runewordRow === 'Runeword1' && displayName(rw) === pledge.name && displayName(rw) !== '先祖之誓' && rw.mods.length === 1, `old bases: Ancients' Pledge is ${displayName(rw)} (${rw.runewordRow}), ${rw.mods.length} mods`);
    const sw = byUid.get(magicSword.uid);
    const want = `${D2X_SUFFIXES.find((a) => a.en === 'of Maiming').name}${D2X_PREFIXES.find((a) => a.en === 'Jagged').name}长剑`;
    check(sw?.baseId === 'lsd' && displayName(sw) === want && sw.mods.length === 2 && sw.reqLvl === 6, `old bases: the official-named magic sword is ${sw && displayName(sw)}, want ${want}`);
  }

  // ── a slot's backups: they outlive their character; another one's at the same version takes the key ──
  reset();
  const first = JSON.stringify(oldSave(3, 0));
  localStorage.setItem(KEY, first);
  save.loadSave();
  save.deleteSave(0);
  check(!localStorage.getItem(KEY) && backups().join() === `${KEY}-backup-0-3` && localStorage.getItem(`${KEY}-backup-0-3`) === first, `deleting the character left ${localStorage.getItem(KEY) ? 'the save, ' : ''}backups ${backups().join() || 'none'}`);
  // another character in the slot, made by an older build since
  const other = JSON.stringify({ ...oldSave(3, 0), name: '另一个' });
  localStorage.setItem(KEY, other);
  save.loadSave();
  check(backups().join() === `${KEY}-backup-0-3` && localStorage.getItem(`${KEY}-backup-0-3`) === other, `another character in the slot: backups ${backups().join()}, of ${JSON.parse(localStorage.getItem(`${KEY}-backup-0-3`) ?? '{}').name}`);
  // another slot's backup is its own
  save.setSlot(1);
  localStorage.setItem(`${KEY}-1`, first);
  save.loadSave();
  check(backups().join() === `${KEY}-backup-0-3,${KEY}-backup-1-3`, `slot 1's backup: backups ${backups().join()}`);

  // ── backups over several migrations: every one from before version 4 and the hero's first stay, of the rest the latest ──
  const stepsBefore = save.MIGRATIONS.items.length;
  /** the backup key of a save at version 4 with the counts `mig` */
  const tagged = (mig) => `${KEY}-backup-0-${[4, mig.items, mig.world, mig.skills].join('.')}`;
  try {
    for (const [label, start] of [['made at v4', clone(at.get(0).d)], ['made at v4 before the D2 bases', { ...oldItems(clone(at.get(0).d)), mig: ZERO }], ['from v3', oldSave(3, 0)]]) {
      save.MIGRATIONS.items.length = stepsBefore;
      reset();
      const raw = JSON.stringify(start);
      localStorage.setItem(KEY, raw);
      // a save already at this build's counts is first backed up when the first test step comes
      const firstKey = start.v === 4 ? tagged(start.mig.items < stepsBefore ? start.mig : { ...start.mig, items: stepsBefore }) : `${KEY}-backup-0-3`;
      const latest = [];
      for (let i = 0; i < 3; i++) {
        save.MIGRATIONS.items.push(() => {});
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d.v === 4) latest.push(tagged(d.mig));
        const s = save.loadSave();
        save.writeSave(s.player, CAMP_AREA);
        const want = [...new Set([firstKey, ...latest.slice(-1)])].sort();
        check(backups().join() === want.join() && localStorage.getItem(firstKey) === raw, `backups ${label}, migration ${i + 1}: ${backups().join()}, want ${want.join()} with the first holding the save as it was`);
      }
    }
  } finally {
    save.MIGRATIONS.items.length = stepsBefore;
  }

  // ── migration steps: one on the items line after this build's, for the test ──
  const seen = [];
  /** the counts with the test step run too */
  const withStep = () => ({ ...thisBuild(), items: stepsBefore + 1 });
  /** marks every item it sees (the unknown ones it leaves alone), noting the old long sword and rune sword as it finds them */
  const step = (d) => {
    const all = savedItems(d).filter((it) => it && it.baseId !== 'unknown');
    for (const it of all) it.stepped = (it.stepped ?? 0) + 1;
    const sword = d.equipment?.weapon;
    seen.push({ sword: sword && `${sword.baseId} ${sword.runewordId} ${sword.socketed.join()} ${!!sword.legacy}`, bases: all.map((it) => it.baseId), xp: d.xp });
  };
  save.MIGRATIONS.items.push(step);
  try {
    // an old save: the step sees it as version 4 has it, items and all
    reset();
    const v1 = oldSave(1, 5);
    localStorage.setItem(KEY, JSON.stringify(v1));
    const s1 = save.loadSave();
    check(seen.length === 1, `v1 with a step: it ran ${seen.length} times`);
    const sw = seen[0];
    check(sw?.sword === 'lsd rw_emberoath r08,r01 true', `v1 with a step: the step saw the sword as ${sw?.sword}`);
    check(sw && sw.bases.includes('9ls') && sw.bases.every((b) => ITEM_BASES[b]) && sw.xp >= xpForLevel(LEVEL), `v1 with a step: it saw bases ${sw?.bases.join()} and ${sw?.xp} experience`);
    const stepped = playerItems(s1.player).filter((it) => !isUnknown(it));
    check(stepped.every((it) => it.stepped === 1), `v1 with a step: items stepped ${stepped.map((it) => it.stepped ?? 0).join()}`);
    save.writeSave(s1.player, CAMP_AREA);
    const w1 = JSON.parse(localStorage.getItem(KEY));
    check(w1.mig.items === stepsBefore + 1, `v1 with a step: written with migrations ${JSON.stringify(w1.mig)}`);
    save.loadSave();
    check(seen.length === 1 && backups().join() === `${KEY}-backup-0-1`, `v1 with a step, reloaded: the step ran ${seen.length} times, backups ${backups().join()}`);

    // a version 4 save from before the step: it runs, backed up beside the hero's copy from version 3
    reset();
    localStorage.setItem(`${KEY}-backup-0-3`, JSON.stringify(oldSave(3, 5)));
    const d0 = clone(at.get(5).d);
    // and an item this build doesn't know: the step sees it put aside, as unknown, at the counts before it
    d0.inventory.push({ item: item('zz_new'), x: 9, y: 3 });
    localStorage.setItem(KEY, JSON.stringify(d0));
    seen.length = 0;
    const s0 = save.loadSave();
    check(seen.length === 1 && s0.readOnly === null && backups().join() === `${KEY}-backup-0-3,${tagged(d0.mig)}`, `v4 before the step: it ran ${seen.length} times, backups ${backups().join()}`);
    check(seen[0] && !seen[0].bases.some((b) => b.startsWith('zz_')), `v4 before the step: the step saw ${seen[0]?.bases.join()}`);
    save.writeSave(s0.player, CAMP_AREA);
    const w0 = JSON.parse(localStorage.getItem(KEY));
    const aside = w0.unplaced.find((it) => it.raw?.item?.baseId === 'zz_new');
    check(w0.mig.items === stepsBefore + 1 && JSON.stringify(aside?.raw.mig) === JSON.stringify(d0.mig), `v4 before the step: written at ${JSON.stringify(w0.mig)}, the unknown item put aside at ${JSON.stringify(aside?.raw.mig)}`);

    // a version 4 save from before the D2 bases: both steps run, the test's seeing D2 bases
    reset();
    const pre = { ...oldItems(clone(at.get(5).d)), mig: ZERO };
    localStorage.setItem(KEY, JSON.stringify(pre));
    seen.length = 0;
    const s0b = save.loadSave();
    check(seen.length === 1 && seen[0].sword === 'lsd undefined r01,r02 false' && seen[0].bases.every((b) => ITEM_BASES[b]) && s0b.readOnly === null, `v4 before the D2 bases: the step saw ${seen[0]?.sword}, ${seen[0]?.bases.join()}`);
    check(playerItems(s0b.player).length === savedItems(pre).length + 1 && giftOf(s0b.player) && backups().join() === tagged(ZERO), `v4 before the D2 bases: ${playerItems(s0b.player).length} items (saved ${savedItems(pre).length}, and the tome), backups ${backups().join()}`);

    // unknown items written at items 0, in a save past the test step: one this build knows comes back
    // with the steps it missed (the D2 bases, the test's) run on it alone
    reset();
    const d1 = clone(at.get(5).d);
    d1.mig = withStep();
    for (const it of savedItems(d1)) it.stepped = 1;
    d1.inventory.push(
      { item: item('unknown', { raw: { v: 4, mig: ZERO, item: item('shortsword', { name: '短剑' }) } }), x: 9, y: 0 },
      // from a version 1 save: version 4's form first (the old rune), then the step
      { item: item('unknown', { raw: { v: 1, mig: ZERO, item: item('longsword', { sockets: 1, socketed: ['r_ember'] }) } }), x: 8, y: 0 },
      // from a save the first D2 release took apart: an old runeword again
      { item: item('unknown', { raw: { v: 1, mig: ZERO, damaged: true, item: item('longsword', { sockets: 2, socketed: ['r08', 'r01'] }) } }), x: 6, y: 0 },
      { item: item('unknown', { raw: { v: 1, mig: ZERO, item: item('zz_still', { socketed: ['r_ember'] }) } }), x: 7, y: 0 },
    );
    const held = clone(d1.inventory.at(-1).item.raw);
    localStorage.setItem(KEY, JSON.stringify(d1));
    seen.length = 0;
    const s2 = save.loadSave();
    const all = playerItems(s2.player);
    const short = all.find((it) => it.baseId === 'ssd');
    const long = all.find((it) => it.baseId === 'lsd' && it.socketed.join() === 'r08');
    const oath = all.find((it) => it.runewordId === 'rw_emberoath');
    // the save has had the step: it runs only on each item come back, alone (with the tome items step 2
    // gives the bag it stands in, which goes with it)
    check(seen.length === 3 && seen.every((x) => x.bases.filter((b) => b !== 'tbk').length === 1), `back from unknown: the step ran on ${seen.map((x) => x.bases.join('+')).join(', ')}`);
    check(short?.stepped === 1 && long?.stepped === 1 && long.legacy, `back from unknown: the short sword stepped ${short?.stepped}, the long sword ${long?.stepped} with ${long?.socketed.join()}, legacy ${JSON.stringify(long?.legacy)}`);
    check(oath?.rarity === 'runeword' && oath.socketed.join() === 'r08,r01' && oath.stepped === 1 && oath.legacy, `back from unknown: the taken-apart Ember Oath came back as ${oath?.rarity ?? 'nothing'} ${oath?.runewordId}, stepped ${oath?.stepped}`);
    check(playerItems(s2.player).filter((it) => !isUnknown(it)).every((it) => it.stepped === 1), `back from unknown: the rest stepped ${playerItems(s2.player).map((it) => it.stepped ?? '-').join()}`);
    const still = all.filter((it) => isUnknown(it));
    check(still.length === 1 && JSON.stringify(still[0].raw) === JSON.stringify(held), `back from unknown: the one still unknown holds ${JSON.stringify(still[0]?.raw)}`);
  } finally {
    save.MIGRATIONS.items.pop();
  }

  // ── a step that adds an item (a quest reward, say): an item come back from unknown is still itself ──
  save.MIGRATIONS.items.push((d) => d.inventory.unshift({ item: item('hp1', { reward: true }), x: 0, y: 3 }));
  try {
    reset();
    const d5 = clone(at.get(0).d);
    d5.mig = { ...d5.mig, items: save.MIGRATIONS.items.length };
    // held at this build's items count, so on a D2 base
    d5.unplaced.push(item('unknown', { raw: { v: 4, mig: { ...d5.mig, items: d5.mig.items - 1 }, item: item('ssd', { uid: 'held', name: '短剑' }) } }));
    localStorage.setItem(KEY, JSON.stringify(d5));
    const got = playerItems(save.loadSave().player);
    check(got.some((it) => it.uid === 'held' && it.baseId === 'ssd') && !got.some((it) => it.reward || isUnknown(it)), `a step that adds an item: loaded ${got.filter((it) => it.uid === 'held' || it.reward || isUnknown(it)).map((it) => it.baseId).join() || 'neither'}`);
  } finally {
    save.MIGRATIONS.items.pop();
  }

  // ── version 4, round trip: what this build doesn't use comes back ──
  reset();
  // a magic jewel as a build without its rows wrote it: the mods it was made with
  const jewel = item('jew', { rarity: 'magic', quality: 'magic', mods: [{ stat: 'str', value: 3 }] });
  const v4 = {
    ...clone(at.get(4 + WILD_MAPS).d),
    worldSeed: 4242,
    unlocked: 1,
    merc: { hire: 3, name: 7, level: 9, xp: 1234, equipment: { weapon: item('ssd') }, dead: false },
    corpse: { area: 17, pos: { x: 3, z: 4 }, difficulty: 0, equipment: { head: item('cap') } },
    respec: true,
    future: { kept: 'as is' },
  };
  const floorArea = areaForDepth(4 + WILD_MAPS).id;
  v4.progress = [
    { waypoints: [...v4.progress[0].waypoints, 17], quests: { den: 3 } },
    { waypoints: [CAMP_AREA], quests: { andariel: 1 } },
    { waypoints: [CAMP_AREA], quests: {} },
  ];
  v4.inventory = [
    { item: item('hp1'), x: 0, y: 0 },
    // an unknown item the player put in the bag stays there; one whose base is known now comes back as it
    { item: item('unknown', { raw: { v: 4, mig: ZERO, item: item('zz_still_unknown') } }), x: 5, y: 0 },
    { item: item('unknown', { raw: { v: 4, mig: ZERO, item: item('shortsword', { name: '短剑' }) } }), x: 7, y: 0 },
    // a jewel in a socket brings its mods
    { item: item('buc', { sockets: 1, socketed: [jewel] }), x: 2, y: 0 },
    // a runeword a later build has keeps its mods
    { item: item('ssd', { rarity: 'runeword', runewordId: 'rw_later', name: '后来的符文之语', sockets: 2, socketed: ['r01', 'r02'], mods: [{ stat: 'dmgPct', value: 50 }] }), x: 8, y: 0 },
  ];
  localStorage.setItem(KEY, JSON.stringify(v4));
  const s4 = save.loadSave();
  const p4 = s4.player;
  check(s4.readOnly === null && !backups().length, `v4: read-only ${s4.readOnly}, backups ${backups().join()}`);
  // left on the trial ground: back in the camp; the Burial Grounds' waypoint is kept, not listed
  check(s4.area === CAMP_AREA && s4.worldSeed === 4242 && p4.waypoints.join() === String(CAMP_AREA), `v4: resumes in area ${s4.area} (seed ${s4.worldSeed}), waypoints ${p4.waypoints}`);
  check(pointsOk(p4) && p4.xp === v4.xp, `v4: ${pointsOf(p4)}, ${p4.xp} experience (saved ${v4.xp})`);
  const kept = p4.inventory.items.find((x) => x.x === 5)?.item;
  check(kept && isUnknown(kept) && kept.raw.item.baseId === 'zz_still_unknown', `v4: the unknown item in the bag became ${kept?.baseId}`);
  const back = p4.inventory.items.find((x) => x.item.baseId === 'ssd' && !x.item.runewordId);
  check(back && back.x === 7 && !back.item.raw && back.item.name === '短剑', `v4: the unknown short sword came back as ${back?.item.baseId} at ${back?.x}`);
  const jewelled = p4.inventory.items.find((x) => x.item.baseId === 'buc')?.item;
  check(jewelled && socketMods(jewelled).some((m) => m.stat === 'str' && m.value === 3), `v4: the jewel in the buckler brings ${JSON.stringify(jewelled && socketMods(jewelled))}`);
  const later = p4.inventory.items.find((x) => x.item.runewordId)?.item;
  check(later?.rarity === 'runeword' && later.runewordId === 'rw_later' && later.mods.length === 1, `v4: the later runeword became ${later?.rarity} ${later?.runewordId} with ${later?.mods.length} mods`);
  const said = later ? tooltip(later).map((l) => l.text) : [];
  check(said.some((t) => t.startsWith('这个版本没有这个符文之语')) && !said.some((t) => t.startsWith('旧版')), `v4: the later runeword's tooltip says ${said.join(' / ')}`);
  for (const [slot, it] of Object.entries(p4.equipment)) check(p4.meetsReq(it), `v4: can't use the ${it.baseId} in ${slot}`);
  // the hireling read into the hero (Player.merc), her gear with her
  const m4 = p4.merc;
  check(m4 && !('raw' in m4) && m4.hire === 3 && m4.name === 7 && m4.level === 9 && m4.xp === 1234 && m4.dead === false && m4.life === undefined && m4.equipment.weapon?.baseId === 'ssd' && Object.keys(m4.equipment).join() === 'weapon', `v4: the hireling read as ${JSON.stringify(m4)}`);
  save.writeSave(p4, floorArea);
  const w4 = JSON.parse(localStorage.getItem(KEY));
  check(w4.worldSeed === 4242 && w4.unlocked === 1 && w4.respec === true && w4.future?.kept === 'as is', `v4: written seed ${w4.worldSeed}, unlocked ${w4.unlocked}, respec ${w4.respec}, future ${JSON.stringify(w4.future)}`);
  // written from the hero as she was read: the same, field for field
  check(JSON.stringify(w4.merc) === JSON.stringify(v4.merc) && w4.corpse?.equipment.head.baseId === 'cap', `v4: written merc ${JSON.stringify(w4.merc)} (read ${JSON.stringify(v4.merc)}), corpse ${JSON.stringify(w4.corpse)}`);
  // quests this build doesn't know keep their flags, read as D2 reads a record for a new game: a
  // reward left waiting (den: granted and pending) is from an earlier game (src/game/quests/record.ts loadQuestRecord)
  check(w4.progress[0].waypoints.includes(17) && w4.progress[0].quests.den === (3 | 0x8000) && w4.progress[1].quests.andariel === 1, `v4: written progress ${JSON.stringify(w4.progress)}`);
  check(w4.area === floorArea && w4.cls === 'paladin' && w4.inventory.length === 5, `v4: written in area ${w4.area} as ${w4.cls} with ${w4.inventory.length} in the bag`);
  const keptRaw = w4.inventory.find((x) => x.x === 5)?.item.raw;
  check(keptRaw?.v === 4 && JSON.stringify(keptRaw.mig) === JSON.stringify(ZERO) && keptRaw.item.baseId === 'zz_still_unknown', `v4: the unknown item was written holding ${JSON.stringify(keptRaw)}`);
  check(save.listSaves()[0]?.area === floorArea, `v4: the title screen lists area ${save.listSaves()[0]?.area}`);

  // ── the hireling's gear (docs/M2A-STEP0.md 2.3): versions 1–3 with her gear, each item through each
  // conversion once (a test step after this build's marks what it sees), none lost, her unknown one
  // by the stash; then a version 4 save with an unknown piece on her ──
  /** her gear in a save, or on the hero's hireling */
  const mercItems = (m) => Object.values(m?.equipment ?? {});
  save.MIGRATIONS.items.push((d) =>
    save.mapItems(d, (it) => {
      if (it.baseId !== 'unknown') it.stepped = (it.stepped ?? 0) + 1;
      return it;
    }),
  );
  try {
    for (const v of [1, '1d', 2, 3]) {
      reset();
      const what = `v${v} with a hireling`;
      const old = oldSave(v, 0);
      // a long sword with an old rune in it (versions before 2 had the game's own runes), a cap, and a mail this build doesn't know
      const sword = asOld({ ...createItem('lsd'), sockets: 1, socketed: ['r08'] });
      if (v === 1) sword.socketed = ['r_ember'];
      old.merc = { hire: 0, name: 4, level: 6, xp: 3000, equipment: { weapon: sword, head: asOld(createItem('cap')), body: item('zz_mercmail') }, life: 70, dead: false };
      const before = savedItems(old).length + mercItems(old.merc).length;
      localStorage.setItem(KEY, JSON.stringify(old));
      const s = save.loadSave();
      const p = s.player;
      const m = p.merc;
      check(m && m.hire === 0 && m.name === 4 && m.level === 6 && m.xp === 3000 && m.life === 70 && m.dead === false, `${what}: read as ${JSON.stringify(m && { ...m, equipment: Object.keys(m.equipment) })}`);
      const w = m?.equipment.weapon;
      check(w?.baseId === 'lsd' && w.socketed.join() === 'r08' && m.equipment.head?.baseId === 'cap' && !m.equipment.body, `${what}: her gear is ${JSON.stringify(Object.entries(m?.equipment ?? {}).map(([k, it]) => `${k} ${it.baseId} ${it.socketed?.join()}`))}`);
      const all = [...playerItems(p), ...mercItems(m)];
      check(all.length === before + 1 && giftOf(p), `${what}: ${before} items saved, ${all.length} loaded (want them and the tome)`);
      check(all.filter((it) => !isUnknown(it)).every((it) => it.stepped === 1), `${what}: steps reached ${all.filter((it) => !isUnknown(it) && it.stepped !== 1).map((it) => `${it.baseId}×${it.stepped ?? 0}`).join(', ')}`);
      const mail = p.unplaced.find((it) => it.raw?.item?.baseId === 'zz_mercmail');
      check(mail && isUnknown(mail) && p.unplaced.filter(isUnknown).length === 4, `${what}: her unknown mail by the stash ${!!mail}, ${p.unplaced.filter(isUnknown).length} unknown there`);
      // written and read again: nothing doubles, nothing steps again
      save.writeSave(p, s.area);
      const d = JSON.parse(localStorage.getItem(KEY));
      check(Object.keys(d.merc?.equipment ?? {}).sort().join() === 'head,weapon' && d.merc.xp === 3000 && savedItems(d).length + mercItems(d.merc).length === before + 1, `${what}: written merc ${JSON.stringify(d.merc && Object.keys(d.merc.equipment))}, ${savedItems(d).length + mercItems(d.merc).length} items`);
      const again = save.loadSave();
      const all2 = [...playerItems(again.player), ...mercItems(again.player.merc)];
      check(all2.length === before + 1 && all2.filter((it) => !isUnknown(it)).every((it) => it.stepped === 1) && all2.filter(isUnknown).length === 4, `${what}, reloaded: ${all2.length} items, stepped ${all2.map((it) => it.stepped ?? '-').join()}`);
    }
  } finally {
    save.MIGRATIONS.items.pop();
  }
  {
    reset();
    const d = clone(at.get(0).d);
    d.merc = { hire: 1, name: 0, level: 3, xp: 0, equipment: { weapon: item('zz_mercbow', { rarity: 'unique', name: '后来的弓' }), head: createItem('cap') }, dead: false };
    const before = savedItems(d).length + mercItems(d.merc).length;
    localStorage.setItem(KEY, JSON.stringify(d));
    const s = save.loadSave();
    const p = s.player;
    const bow = p.unplaced.find((it) => it.raw?.item?.baseId === 'zz_mercbow');
    check(bow && isUnknown(bow) && !p.merc.equipment.weapon && p.merc.equipment.head?.baseId === 'cap', `v4, an unknown bow on her: by the stash ${!!bow}, on her ${p.merc?.equipment.weapon?.baseId}`);
    check(playerItems(p).length + mercItems(p.merc).length === before, `v4, an unknown bow on her: ${before} items saved, ${playerItems(p).length + mercItems(p.merc).length} loaded`);
    save.writeSave(p, s.area);
    const w = JSON.parse(localStorage.getItem(KEY));
    check(Object.keys(w.merc.equipment).join() === 'head' && w.unplaced.some((it) => it.raw?.item?.baseId === 'zz_mercbow') && savedItems(w).length + mercItems(w.merc).length === before, `v4, an unknown bow on her: written ${JSON.stringify(Object.keys(w.merc.equipment))}, ${savedItems(w).length + mercItems(w.merc).length} items`);
    const p2 = save.loadSave().player;
    check(playerItems(p2).length + mercItems(p2.merc).length === before && p2.unplaced.filter((it) => it.raw?.item?.baseId === 'zz_mercbow').length === 1, `v4, an unknown bow on her, reloaded: ${playerItems(p2).length + mercItems(p2.merc).length} items`);
  }

  // ── a hireling this build can't read (a later build's Hireling.txt row) stays as it was; a field it
  // doesn't know on one it can stays on her; a hero without one writes what this build always wrote ──
  {
    reset();
    const d = clone(at.get(0).d);
    d.merc = { hire: 77, name: 1, level: 30, xp: 99, equipment: { weapon: item('ssd') }, dead: false, aura: 'Might' };
    localStorage.setItem(KEY, JSON.stringify(d));
    const s = save.loadSave();
    check(s.player.merc?.raw !== undefined && s.player.merc.dead === true, `a later build's hireling: read as ${JSON.stringify(s.player.merc)}`);
    save.writeSave(s.player, s.area);
    const w = JSON.parse(localStorage.getItem(KEY));
    check(JSON.stringify(w.merc) === JSON.stringify(d.merc), `a later build's hireling: written ${JSON.stringify(w.merc)}`);
    reset();
    const e = clone(at.get(0).d);
    e.merc = { hire: 0, name: 2, level: 4, xp: 400, equipment: {}, life: 30, dead: false, aura: 'Might' };
    localStorage.setItem(KEY, JSON.stringify(e));
    const s2 = save.loadSave();
    check(s2.player.merc?.raw === undefined && s2.player.merc?.xp === 400, `a hireling with a later field: read as ${JSON.stringify(s2.player.merc)}`);
    s2.player.merc.life = undefined;
    save.writeSave(s2.player, s2.area);
    const w2 = JSON.parse(localStorage.getItem(KEY));
    check(JSON.stringify(w2.merc) === JSON.stringify({ hire: 0, name: 2, level: 4, xp: 400, equipment: {}, dead: false, aura: 'Might' }), `a hireling with a later field, at full life: written ${JSON.stringify(w2.merc)}`);
  }
  {
    // the save this build's game wrote, with no hireling: read and written back, the same text (its
    // write time held), merc null
    reset();
    const raw = JSON.stringify(at.get(0).d);
    localStorage.setItem(KEY, raw);
    const s = save.loadSave();
    check(s.player.merc === null, `no hireling: read as ${JSON.stringify(s.player.merc)}`);
    const now = Date.now;
    Date.now = () => at.get(0).d.time;
    try {
      save.writeSave(s.player, s.area, s.worldSeed);
    } finally {
      Date.now = now;
    }
    const text = localStorage.getItem(KEY);
    check(text === raw, `no hireling: written back otherwise (${text.length} characters, ${raw.length} read)${text === raw ? '' : `: first difference at ${[...text].findIndex((c, i) => c !== raw[i])}, ${text.slice([...text].findIndex((c, i) => c !== raw[i]) - 40, [...text].findIndex((c, i) => c !== raw[i]) + 40)}`}`);
    check(JSON.parse(text).merc === null, 'no hireling: merc written as other than null');
  }

  // ── where a version 4 save resumes on a reload: an area this build has, else the camp ──
  for (const [where, area, want] of [
    ['Blood Moor', WILD_AREA, WILD_AREA],
    ['Cold Plains', COLD_PLAINS, COLD_PLAINS],
    ['the Den of Evil', DEN_OF_EVIL, DEN_OF_EVIL],
    ['Stony Field', 4, 4],
    ['the Dark Wood (not built)', 5, CAMP_AREA],
    ['the trial ground', floorArea, CAMP_AREA],
  ]) {
    reset();
    const d = { ...clone(at.get(0).d), area, worldSeed: 99 };
    d.progress = [{ waypoints: [CAMP_AREA, COLD_PLAINS, 5, floorArea], quests: {} }, { waypoints: [CAMP_AREA], quests: {} }, { waypoints: [CAMP_AREA], quests: {} }];
    localStorage.setItem(KEY, JSON.stringify(d));
    const s = save.loadSave();
    check(s?.area === want && s.worldSeed === 99, `v4 in ${where}: resumes in area ${s?.area} (want ${want}), seed ${s?.worldSeed}`);
    check(s?.player.waypoints.join() === `${CAMP_AREA},${COLD_PLAINS}`, `v4 in ${where}: waypoints ${s?.player.waypoints}, want the camp's and Cold Plains'`);
    save.writeSave(s.player, s.area, 123);
    const w = JSON.parse(localStorage.getItem(KEY));
    check(w.worldSeed === 123 && [...w.progress[0].waypoints].sort().join() === [CAMP_AREA, COLD_PLAINS, 5, floorArea].sort().join(), `v4 in ${where}: written seed ${w.worldSeed}, waypoints ${JSON.stringify(w.progress[0].waypoints)}`);
  }

  // ── a newer build's save: played, never written ──
  for (const [label, d] of [
    ['v5', { ...v4, v: 5 }],
    ['items 99', { ...v4, mig: { items: 99, world: 0, skills: 0 } }],
    ['a line this build lacks', { ...v4, mig: { ...thisBuild(), quests: 1 } }],
  ]) {
    reset();
    const raw = JSON.stringify(d);
    localStorage.setItem(KEY, raw);
    const s = save.loadSave();
    check(s && typeof s.readOnly === 'string' && s.readOnly.length > 0, `newer (${label}): not read-only`);
    if (!s) continue;
    // its unknown items stay unknown: this build can't give them the newer build's migrations
    check(s.player.inventory.items.filter((x) => isUnknown(x.item)).length === 2, `newer (${label}): ${s.player.inventory.items.filter((x) => isUnknown(x.item)).length} unknown items in the bag, want 2`);
    // its hireling read to be looked at, never written
    check(s.player.merc?.xp === 1234 && s.player.merc.equipment.weapon?.baseId === 'ssd', `newer (${label}): the hireling read as ${JSON.stringify(s.player.merc)}`);
    s.player.gold += 1000;
    s.player.merc.xp += 1000;
    delete s.player.merc.equipment.weapon;
    save.writeSave(s.player, CAMP_AREA);
    check(localStorage.getItem(KEY) === raw && !backups().length, `newer (${label}): written over, or backed up (${backups().join()})`);
  }
  // a character made afterwards is written as usual
  reset();
  save.writeSave(new Player({ x: 0, z: 0 }), CAMP_AREA);
  check(JSON.parse(localStorage.getItem(KEY) ?? 'null')?.v === 4, 'a new character after a read-only one was not written');

  // ── an old save that can't be backed up: played, never written ──
  reset();
  const raw3 = JSON.stringify(oldSave(3, 5));
  localStorage.setItem(KEY, raw3);
  const set = localStorage.setItem;
  localStorage.setItem = function (k, v) {
    if (String(k).includes('-backup-')) throw new Error('QuotaExceededError');
    return set.call(this, k, v);
  };
  try {
    const s = save.loadSave();
    check(s && typeof s.readOnly === 'string', `no backup: read-only ${s?.readOnly}`);
    if (s) save.writeSave(s.player, CAMP_AREA);
    check(localStorage.getItem(KEY) === raw3, 'no backup: the old save was written over');
  } finally {
    localStorage.setItem = set;
  }

  // ── the unknown items by the stash are pointed out once a game, not on every way into the camp ──
  reset();
  localStorage.setItem(KEY, JSON.stringify(oldSave(3, 0)));
  const msgs = [];
  game.hooks.message = (text) => msgs.push(text);
  game.continueGame(0);
  game.enterLevel(1, 'waypoint');
  game.enterLevel(0, 'waypoint');
  game.hooks.message = () => {};
  const told = msgs.filter((t) => t.includes('认不出')).length;
  check(told === 1 && game.player.unplaced.filter(isUnknown).length === 3, `unknown items by the stash: told ${told} times, ${game.player.unplaced.filter(isUnknown).length} there`);

  // ── Game saves the area the hero stands in, on the overworld that holds several ──
  reset();
  const west = game.level;
  const gate = west.layout.seams.find((sm) => sm.a === CAMP_AREA && sm.b === WILD_AREA);
  let spot = null;
  for (let k = 4; k < 40 && !spot; k++) {
    const c = { x: gate.tb.x + (gate.tb.x - gate.ta.x) * k, z: gate.tb.z + (gate.tb.z - gate.ta.z) * k };
    if (west.map.circleClear(c.x, c.z, 0.45)) spot = c;
  }
  if (!spot) throw new Error('no walkable spot past the camp gate');
  game.teleportWithin(spot);
  game.save();
  const inWild = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  check(inWild.area === WILD_AREA && inWild.worldSeed === game.worldSeed, `saved standing out past the camp gate: area ${inWild.area}, seed ${inWild.worldSeed} (the game's ${game.worldSeed})`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  v1 (both), v2, v3 at depths 0, 1, 5 → v4 in the camp on D2 bases with every item kept (3 unknown by the stash) and a tome of town portal once, usable gear, points adding up, backed up once; every old base onto its D2 one with its defense, mods and old requirements; steps see v4 items, keep the first and pre-v4 backups, catch restored items up; v4 round trip, the hireling read and written back the same; her gear from v1–v3 through each step once, none lost, unknown pieces by the stash; one this build can't read kept; no hireling, the same text; resuming in a built area or the camp; newer and unbacked saves never written`);
};
