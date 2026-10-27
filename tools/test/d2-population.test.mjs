// Who populates Blood Moor (2), Cold Plains (3) and the Den of Evil (8), by Diablo II's rules
// (src/game/d2/population.ts, src/game/spawn.ts), over world seeds in all three difficulties: the
// kinds an area draws are NumMon of its levels.txt list (mon in normal, nmon after), and nothing
// else stands there but what they bring (the shamans' fallen), its champions and uniques (of umon
// in normal) and its superunique with its group; the packs come as often as MonDen says for the
// rooms' walkable tiles (25/9 rolls a tile, each a pack on a roll under MonDen of 100000); the
// champion and unique packs stay within MonUMin–MonUMax (none in Blood Moor or the Den in normal,
// Cold Plains one); Corpsefire is in the Den once with his five zombies (six, seven), Bishibosh in
// Cold Plains once, by his fallen camp, with his two fallen (three, four), each come with his room
// before its packs and counted for the packs after. Uniques are named from the rename table's
// words, a minion is its leader's kind or its minion1.
const SEEDS = [1, 7, 42, 99, 2026, 31337];

export default async (load) => {
  const { generateOverworld } = await load('/src/world/overworld.ts');
  const { generateDen } = await load('/src/world/den.ts');
  const { Level } = await load('/src/game/level.ts');
  const { WILD_MAPS } = await load('/src/world/levelgen.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const { D2X_SUPERUNIQUES, D2X_UNIQUE_NAMES } = await load('/src/data/d2x/superuniques.ts');
  const P = await load('/src/game/d2/population.ts');
  const { RNG } = await load('/src/core/math.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const area = (id) => D2X_AREAS.find((a) => a.id === id);
  const SU = (key) => D2X_SUPERUNIQUES.find((s) => s.key === key);
  const titles = new Set(D2X_UNIQUE_NAMES.title.map((w) => w.name));
  const notes = [];

  // ── the kinds, on their own: NumMon of the list, never anything else ──
  for (const id of [2, 3, 8]) {
    const a = area(id);
    for (const d of [0, 1, 2]) {
      const list = d ? a.nmon : a.mon;
      const seen = new Set();
      for (let s = 1; s <= 400; s++) {
        const kinds = P.pickKinds(a, d, new RNG(s)).map((k) => k.id);
        check(kinds.length === Math.min(a.numMon, list.length) && new Set(kinds).size === kinds.length, `area ${id} d${d}: kinds ${kinds}`);
        for (const k of kinds) {
          check(list.includes(k), `area ${id} d${d}: ${k} isn't on its list`);
          seen.add(k);
        }
      }
      check(seen.size === list.length, `area ${id} d${d}: over 400 games only ${[...seen]} of ${list}`);
    }
  }

  // ── whole maps ──
  const tally = {};
  let championParty = 0;
  for (const d of [0, 1, 2]) {
    for (const seed of SEEDS) {
      const ow = generateOverworld(seed);
      const west = new Level(WILD_MAPS, ow.seed, ow, d);
      const denSeed = (Math.imul(seed ^ 0x0de0f, 0x9e3779b1) + 8) >>> 0;
      const den = new Level(WILD_MAPS, denSeed, generateDen(denSeed), d);
      for (const [L, id] of [[west, 2], [west, 3], [den, 8]]) {
        const a = area(id);
        const r = L.spawned.get(id);
        const what = `${a.en} d${d} seed ${seed}`;
        if (!r) {
          problems.push(`${what}: not spawned`);
          continue;
        }
        const ms = L.monsters.filter((m) => L.areaAt(m.pos.x, m.pos.z).id === id);
        const list = d ? a.nmon : a.mon;
        // the kinds and who stands there
        check(r.kinds.every((k) => list.includes(k)), `${what}: kinds ${r.kinds}`);
        const brought = new Set(r.kinds.flatMap((k) => D2X_MONSTERS[k].minions ?? []));
        for (const m of ms) {
          const su = m.superUnique ? SU(m.superUnique) : m.leader?.superUnique ? SU(m.leader.superUnique) : undefined;
          let ok;
          if (su) ok = m.def.id === su.mon || m.def.id === (D2X_MONSTERS[su.mon].minions?.[0] ?? su.mon);
          else if (m.rank === 'normal') ok = r.kinds.includes(m.def.id) || brought.has(m.def.id) || (d === 0 && a.umon.some((u) => D2X_MONSTERS[u].minions?.includes(m.def.id)));
          else if (m.rank === 'minion') ok = m.leader && (m.def.id === m.leader.def.id || m.leader.def.row.minions?.[0] === m.def.id);
          else ok = (d === 0 ? a.umon : r.kinds).includes(m.def.id);
          if (!ok) problems.push(`${what}: a ${m.rank} ${m.def.id} ${m.superUnique ?? ''} shouldn't be here`);
          // a champion's party (a fallen's or a shaman's) is its minions, a minion's +3 levels on its own
          // (MonsterUnique.cpp:2548-2558); a plain pack's party stays plain
          if (m.leader?.rank === 'champion') {
            check(m.rank === 'minion' && m.level === m.baseLevel + 3, `${what}: a champion's ${m.def.id} is ${m.rank} at ${m.level} (base ${m.baseLevel})`);
            championParty++;
          }
          if (m.leader?.rank === 'normal') check(m.rank === 'normal', `${what}: a plain ${m.leader.def.id}'s ${m.def.id} is ${m.rank}`);
        }
        // the packs: rolls × (MonDen + 1) / 100000 of them (a roll of 0–99999 at most MonDen)
        const p = (a.den[d] + 1) / 100000;
        const mean = r.rolls * p;
        const sd = Math.sqrt(r.rolls * p * (1 - p));
        check(r.rolls > 0 && Math.abs(r.packs - mean) <= 4.5 * sd + 1, `${what}: ${r.packs} packs from ${r.rolls} rolls, ${mean.toFixed(1)} ± ${sd.toFixed(1)} expected`);
        // champions and uniques within MonUMin–MonUMax: a pack is one only while under MonUMax
        const [min, max] = a.packs[d];
        check(r.bossPacks <= max && r.bossAt.every(([, n]) => n < max), `${what}: ${r.bossPacks} champion/unique packs let in at ${r.bossAt.map(([, n]) => n)}, MonUMax ${max}`);
        // a superunique comes with its room, before the room's packs, and counts for them (Game.cpp:1930-1935)
        for (const [k, room] of r.superUniqueRooms.entries()) {
          check(room < r.rooms, `${what}: ${r.superUniques[k]} after all ${r.rooms} rooms (room ${room})`);
          check(r.bossAt.every(([i, n]) => i < room || n >= 1), `${what}: a pack in or after ${r.superUniques[k]}'s room ${room} let in without counting him: ${JSON.stringify(r.bossAt)}`);
        }
        if (max === 0) check(!ms.some((m) => (m.rank === 'champion' || m.rank === 'unique') && !m.superUnique), `${what}: champions or uniques where MonUMax is 0`);
        const t = (tally[`${id}/${d}`] ??= { atMin: 0, n: 0, packs: 0, boss: 0, monsters: 0 });
        t.n++;
        // the superunique counts too, as D2's dwUniqueCount
        if (r.count >= min) t.atMin++;
        t.packs += r.packs;
        t.boss += r.bossPacks;
        t.monsters += ms.length;
        // the uniques' names: a title, a prefix, a suffix of the rename table's
        for (const m of ms) {
          if (m.rank !== 'unique' || m.superUnique) continue;
          const title = [...titles].find((x) => m.displayName.startsWith(x));
          check(title && m.displayName.length > title.length + 1, `${what}: a unique named ${m.displayName}`);
        }
        // the superuniques: once each, with their group
        for (const key of a.superuniques ?? []) {
          const su = SU(key);
          const them = ms.filter((m) => m.superUnique === key);
          check(them.length === 1 && r.superUniques.join() === key, `${what}: ${them.length} ${key}`);
          const boss = them[0];
          if (!boss) continue;
          const minions = L.monsters.filter((m) => m.leader === boss);
          const want = su.group[0] + d;
          const minionId = D2X_MONSTERS[su.mon].minions?.[0] ?? su.mon;
          check(minions.length === want && minions.every((m) => m.def.id === minionId && m.rank === 'minion'), `${what}: ${key} with ${minions.length} minions (${[...new Set(minions.map((m) => m.def.id))]}), want ${want} ${minionId}`);
          check(boss.displayName === su.name && boss.def.id === su.mon && boss.mods.slice(0, su.mods.length).join() === su.mods.join() && boss.mods.length === su.mods.length + d, `${what}: ${key} is ${boss.displayName}, ${boss.def.id}, mods ${boss.mods}`);
          // its row's level in normal, the area's after (Monster.cpp:196-201), + 3 (leveladd)
          const lvl = d ? a.lvl[d] : D2X_MONSTERS[su.mon].diff[0].level;
          check(boss.level === lvl + 3, `${what}: ${key} at level ${boss.level}, want ${lvl} + 3`);
          if (key === 'Bishibosh') {
            const camp = (L.layout.elites ?? []).find((c) => L.areaAt(c.x, c.z).id === 3);
            check(camp && Math.hypot(boss.pos.x - camp.x, boss.pos.z - camp.z) < 2, `${what}: Bishibosh ${camp ? Math.hypot(boss.pos.x - camp.x, boss.pos.z - camp.z).toFixed(1) : '-'} from his fallen camp`);
          }
          if (key === 'Corpsefire') {
            const spot = L.layout.superUniques?.find((s) => s.key === key)?.pos;
            check(spot && Math.hypot(boss.pos.x - spot.x, boss.pos.z - spot.z) < 1.5, `${what}: Corpsefire away from the den's far room`);
          }
        }
      }
      // superuniques never stand where the data doesn't put them
      check(!west.monsters.some((m) => m.superUnique === 'Corpsefire') && !den.monsters.some((m) => m.superUnique === 'Bishibosh'), `d${d} seed ${seed}: a superunique out of its area`);
    }
  }
  // MonUMin is reached nearly always: the forcing grows with the rooms done
  for (const [k, t] of Object.entries(tally)) {
    const [id, d] = k.split('/').map(Number);
    const [min] = area(id).packs[d];
    check(t.atMin >= t.n - 1, `area ${id} d${d}: MonUMin ${min} reached in ${t.atMin} of ${t.n} games`);
    notes.push(`${id}/d${d} ${(t.packs / t.n).toFixed(0)} packs (${(t.boss / t.n).toFixed(1)} elite), ${(t.monsters / t.n).toFixed(0)} monsters`);
  }

  check(championParty > 0, 'no champion brought its party over all the maps');
  notes.push(`${championParty} of the champions' party`);

  // ── the rules' small parts ──
  const rng = new RNG(5);
  // the Fallen come one by one with their party of 2–3; a shaman alone with 2–6 fallen1
  const fallen = D2X_MONSTERS.fallen1;
  const shaman = D2X_MONSTERS.fallenshaman1;
  for (let i = 0; i < 200; i++) {
    check(P.groupSize(fallen, rng) === 1, 'a fallen group of more than one');
    const party = P.party(shaman, rng);
    check(party.length >= 2 && party.length <= 6 && party.every((x) => x === 'fallen1'), `a shaman's party ${party}`);
    const g = P.groupSize(D2X_MONSTERS.corruptrogue1, rng);
    check(g >= 2 && g <= 3, `a corruptrogue1 group of ${g}`);
  }
  // one boss pack in five a champion (MonUMod constants row 0: 20)
  let champs = 0;
  for (let i = 0; i < 20000; i++) if (P.isChampion(rng)) champs++;
  check(Math.abs(champs / 20000 - 0.2) < 0.015, `${champs} of 20000 boss packs champions`);
  // a unique's modifiers: 1 in normal, 2 in nightmare, 3 in hell, never resistance in normal (upick 0)
  for (let i = 0; i < 300; i++) {
    for (const d of [0, 1, 2]) {
      const mods = P.uniqueMods(fallen, d, rng);
      check(mods.length === d + 1 && new Set(mods).size === mods.length, `unique mods ${mods} in d${d}`);
      if (d === 0) check(!mods.includes(8), 'magic resistance on a normal unique');
    }
    check([16, 36, 37, 38, 39].includes(P.championType(fallen, 0, rng)), 'a champion type outside the five');
  }
  // multiple shots never on a melee monster, on a quill rat it may
  check(!P.canAssign(fallen, 29) && P.canAssign(D2X_MONSTERS.quillrat1, 29), 'multishot on the wrong monster');

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(`  ${SEEDS.length} worlds × 3 difficulties: ${notes.join('; ')}`);
};
