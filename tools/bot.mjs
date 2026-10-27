// Balance bot scenario for tools/play.mjs: fast-forwards the sim with an automated player.
// node tools/play.mjs tools/bot.mjs --url "http://localhost:PORT/?dev" [--class sorceress] [--start-area wild] [--to floor7] [--level 1] [--minutes 40]
// The hero goes area by area (src/world/areas.ts, from the camp down) from --start-area until past
// --to: fighting what is near, then on into the next area, across the map when it is on it, or else by
// the exit or the stairs that lead there (a dungeon's floors are linked by stairs). --level starts the
// hero at that level, its points spent and wearing gear rolled at it. Each class spends its points and
// fights as BUILDS says, with the skills it has learned. Options may come from the environment too
// (CLASS, START_AREA, TO, LEVEL, MINUTES), the way tools/balance.mjs passes them.
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : (process.env[k.toUpperCase().replace(/-/g, '_')] ?? d);
};

/**
 * What each class does, by skill id. `points`: where its points go, in order, each [skill, the level to
 * take it to]; a skill a point can't go into yet is passed over until it can, a missing prerequisite is
 * learned first, a skill this build doesn't have is left out. `attacks`: what it fights with, the first
 * learned one there is mana for (the weapon when none). `auras`: the one to keep on, the first learned.
 * `buffs`: [skill, the Player field that is its time left] to cast again as it wears off. `manaShare`:
 * how many of the potions bought are mana. A class with no build, or none of whose skills are left,
 * spends on and fights with its own latest skills.
 */
const BUILDS = {
  // zeal under concentration
  paladin: {
    points: [['zeal', 20], ['might', 1], ['prayer', 1], ['holy_fire', 1], ['holy_freeze', 1], ['charge', 1], ['concentration', 20], ['vigor', 1], ['might', 20]],
    attacks: ['zeal'],
    auras: ['concentration', 'might'],
    buffs: [],
    manaShare: 1 / 3,
  },
  // fire bolt, then fire ball, with warmth for the mana and frozen armor for the hits
  sorceress: {
    points: [['frozen_armor', 1], ['warmth', 1], ['fire_bolt', 8], ['fire_ball', 20], ['fire_wall', 1], ['meteor', 20], ['fire_bolt', 20], ['warmth', 20]],
    attacks: ['fire_ball', 'fire_bolt'],
    auras: [],
    buffs: [['frozen_armor', 'frozenArmor']],
    manaShare: 1 / 2,
  },
};

export default async function (page, shot, log) {
  const o = {
    cls: opt('class', ''),
    startArea: opt('start-area', 'wild'),
    to: opt('to', 'floor7'),
    level: +opt('level', 1),
    maxMinutes: +opt('minutes', 40),
    builds: BUILDS,
  };
  const setup = await page.evaluate(async (o) => {
    const { baseOf, displayName, sellPrice } = await import('/src/items/item.ts');
    const { slotsFor } = await import('/src/data/items.ts');
    const { SKILL_BY_ID, SKILLS } = await import('/src/data/skills.ts');
    const { CLASS_IDS } = await import('/src/data/classes.ts');
    const { createItem, rollEquipment } = await import('/src/items/gen.ts');
    const { xpForLevel } = await import('/src/game/player.ts');
    const { areaByKey, nextArea } = await import('/src/world/areas.ts');
    const g = game;
    const cls = o.cls || g.player.cls;
    /** how far off a spell is cast from */
    const SPELL_RANGE = 9;
    if (!CLASS_IDS.includes(cls)) return { error: `no class ${cls} (${CLASS_IDS.join(', ')})` };
    // the route, compared by id: the page's copies of the modules may not be the game's
    const start = areaByKey(o.startArea);
    const end = areaByKey(o.to);
    if (!start || !end) return { error: `no area ${start ? o.to : o.startArea}` };
    const route = [start];
    while (route.length < 500 && route[route.length - 1].id !== end.id) {
      const n = nextArea(route[route.length - 1]);
      if (!n) break;
      route.push(n);
    }
    if (route[route.length - 1].id !== end.id) return { error: `${o.to} doesn't come after ${o.startArea}` };
    const endIdx = route.length - 1;
    // getting into the area after the last one ends the run
    const finish = nextArea(end);
    if (finish) route.push(finish);
    // the skills the build names that this build of the game has, for the hero's class
    const own = (id) => SKILL_BY_ID[id]?.cls === cls;
    const b = o.builds[cls] ?? { points: [], attacks: [], auras: [], buffs: [], manaShare: 1 / 3 };
    const build = {
      points: b.points.filter(([id]) => own(id)),
      attacks: b.attacks.filter(own),
      auras: b.auras.filter(own),
      buffs: b.buffs.filter(([id]) => own(id)),
      manaShare: b.manaShare,
    };
    /** a skill that hurts what it is aimed at (a fallback's attack: not a teleport or a passive) */
    const hurts = (s) => s.kind === 'attack' || (s.kind === 'spell' && Object.keys(s.params(1, 0)).some((k) => /min|max|dps|dmg/i.test(k)));
    /** the class's own skills, latest first: what a class without a build goes by */
    const latest = SKILLS.filter((s) => s.cls === cls).sort((x, y) => y.reqLevel - x.reqLevel);

    // the sim is stepped here; the page's own update/render loop is skipped (much faster headless)
    g.headless = true;
    g.newGame('', cls);
    const STEP = 1 / 60;
    const stats = { route: route.slice(0, endIdx + 1).map((a) => a.key), deaths: 0, levels: [], kills: 0, uniques: 0, sets: 0, rares: 0, runes: 0, potionsUsed: 0, timeline: [], deathList: [] };
    window.__bot = stats;
    const kill = g.killMonster.bind(g);
    g.killMonster = (m, ...a) => {
      if (!m.dead) stats.kills++;
      return kill(m, ...a);
    };
    const p = () => g.player;
    const score = () => {
      const d = p().stats;
      const avg = (d.wMin + d.wMax) / 2 * (1 + d.dmgPct / 100) + (d.fire[0] + d.fire[1] + d.cold[0] + d.cold[1] + d.light[0] + d.light[1]) / 2 + d.poison / 3;
      const dps = avg * d.attacksPerSec * Math.min(1, d.ar / 400 + 0.5);
      const res = (d.res.fire + d.res.cold + d.res.light + d.res.poison) / 4;
      const ehp = d.maxLife * (1 + d.def / 300) * (1 + Math.max(0, res) / 100) * (1 + d.block / 100);
      return Math.sqrt(dps * ehp) * (1 + d.lifeSteal / 50);
    };
    const tryEquip = (item) => {
      const pl = p();
      const slots = slotsFor(baseOf(item).type);
      if (!slots.length || !pl.meetsReq(item)) return false;
      const b = baseOf(item);
      let best = null;
      const before = score();
      for (const slot of slots) {
        if (slot === 'offhand' && pl.equipment.weapon && baseOf(pl.equipment.weapon).twoHanded) continue;
        const old = pl.equipment[slot];
        const oldOff = pl.equipment.offhand;
        pl.equipment[slot] = item;
        if (slot === 'weapon' && b.twoHanded) delete pl.equipment.offhand;
        pl.markDirty(); pl.recalc();
        const s = score();
        if (old) pl.equipment[slot] = old; else delete pl.equipment[slot];
        if (oldOff) pl.equipment.offhand = oldOff;
        pl.markDirty(); pl.recalc();
        if (s > before * 1.01 && (!best || s > best.s)) best = { slot, s };
      }
      if (!best) return false;
      const old = pl.equipment[best.slot];
      pl.inventory.remove(item);
      if (best.slot === 'weapon' && b.twoHanded && pl.equipment.offhand) { const sh = pl.equipment.offhand; delete pl.equipment.offhand; pl.gold += sellPrice(sh); }
      pl.equipment[best.slot] = item;
      if (old) pl.gold += sellPrice(old);
      pl.markDirty(); pl.recalc();
      return true;
    };
    const mana = (id) => SKILL_BY_ID[id]?.mana(p().skillLevel(id)) ?? 0;
    /** `id` itself if a point can go into it now, or else a prerequisite of it that can take one */
    const pointFor = (id, seen = new Set()) => {
      const pl = p();
      const def = SKILL_BY_ID[id];
      if (!def || seen.has(id)) return null;
      seen.add(id);
      if (pl.canLearn(def)) return id;
      if (pl.level < def.reqLevel) return null;
      for (const pre of def.prereqs) if (!pl.skillBase(pre)) { const s = pointFor(pre, seen); if (s) return s; }
      return null;
    };
    const nextPoint = () => {
      const pl = p();
      for (const [id, cap] of build.points) if (pl.skillBase(id) < cap) { const s = pointFor(id); if (s) return s; }
      if (build.points.length) return null;
      // no build: the latest skill that hurts, else the latest of any
      const open = latest.filter((s) => pl.canLearn(s));
      return (open.find(hurts) ?? open[0])?.id ?? null;
    };
    const spend = () => {
      const pl = p();
      while (pl.statPoints > 0) {
        let k = 'vit';
        if (pl.base.str < 30 + pl.level * 1.6) k = 'str';
        else if (pl.base.dex < 25 + pl.level * 0.8) k = 'dex';
        pl.base[k]++; pl.statPoints--;
      }
      let guard = 0;
      while (pl.skillPoints > 0 && guard++ < 50) {
        const id = nextPoint();
        if (!id) break;
        pl.skills[id] = (pl.skills[id] ?? 0) + 1;
        pl.skillPoints--;
      }
      pl.markDirty(); pl.recalc();
      const aura = build.auras.find((a) => pl.skillBase(a)) ?? (build.points.length ? null : latest.find((s) => s.kind === 'aura' && pl.skillBase(s.id))?.id);
      if (aura && pl.activeAura !== aura) { pl.activeAura = aura; pl.markDirty(); }
      // simulated town trip: keep the belt stocked with potions while gold allows
      const potionCount = pl.belt.reduce((a, c) => a + c.length, 0);
      if (potionCount < 4 && pl.gold > 200) {
        for (let k = 0; k < 6 && pl.gold > 100; k++) {
          const tier = pl.level >= 26 ? 'hp4' : pl.level >= 16 ? 'hp3' : pl.level >= 8 ? 'hp2' : 'hp1';
          const it = createItem((k + 1) % Math.round(1 / build.manaShare) === 0 ? tier.replace('hp', 'mp') : tier);
          if (g.beltInsert(it)) { pl.gold -= baseOf(it).price; stats.bought = (stats.bought ?? 0) + 1; }
        }
      }
    };
    /** what to hit with: the build's first attack learned and paid for, else the latest learned one that hurts, else the weapon */
    const attackSkill = () => {
      const pl = p();
      const ready = (id) => pl.skillLevel(id) > 0 && pl.mana >= mana(id) && !((pl.cooldowns[id] ?? 0) > 0);
      return build.attacks.find(ready) ?? latest.find((s) => hurts(s) && ready(s.id))?.id ?? 'attack';
    };
    /** how a monster is gone for: a spell from where it is in sight and near enough (the game casts at any range), the rest as the game does it */
    const engage = (m, d) => {
      const skill = attackSkill();
      if (SKILL_BY_ID[skill]?.kind === 'spell' && (d > SPELL_RANGE || !g.level.map.los(p().pos, m.pos))) return { kind: 'move', point: { ...m.pos } };
      return { kind: 'attack', target: m, skill, hold: true };
    };
    /** mana to drink at: enough for the build's first attack learned */
    const thirsty = () => {
      const main = build.attacks.find((id) => p().skillLevel(id) > 0);
      return p().mana < Math.max(8, main ? mana(main) : 0);
    };
    const drink = (kind) => {
      const pl = p();
      for (let i = 0; i < 4; i++) if (pl.belt[i].length && (kind === 'hp' ? (pl.belt[i][0].baseId.startsWith('hp') || pl.belt[i][0].baseId.startsWith('rv')) : pl.belt[i][0].baseId.startsWith('mp'))) { g.useBelt(i); stats.potionsUsed++; return true; }
      const inv = pl.inventory.items.find((x) => x.item.baseId.startsWith(kind) || (kind === 'hp' && x.item.baseId.startsWith('rv')));
      if (inv) { pl.inventory.remove(inv.item); g.drink(inv.item); stats.potionsUsed++; return true; }
      return false;
    };

    // --level: as if played there, its points spent and wearing the best of a pile of gear rolled at it
    if (o.level > 1) {
      const pl = p();
      pl.xp = xpForLevel(Math.min(99, o.level));
      pl.gainXp(0);
      pl.gold += pl.level * 100;
      spend();
      for (let i = 0; i < 60; i++) {
        // identified, as gear found and worn on the way would be
        const it = rollEquipment(pl.level, { quality: 2, identified: true });
        if (pl.inventory.add(it) && !tryEquip(it)) pl.inventory.remove(it);
      }
      pl.life = pl.stats.maxLife;
      pl.mana = pl.stats.maxMana;
    }
    g.travelToArea(start.id);

    let idx = 0;
    let lastArea = -1;
    let areaStart = 0;
    let areaDeaths = 0;
    let potionCd = 0;
    let think = 0;
    let stuck = 0;
    let lastPos = { x: 0, z: 0 };
    let simTime = 0;
    // stall diagnostics: no real progress for 30s of sim time
    let stallAnchor = { x: 0, z: 0 };
    let stallSince = 0;
    let stallsLogged = 0;
    let lastPick = '';
    const runChunk = (seconds) => {
      const steps = Math.floor(seconds / STEP);
      for (let i = 0; i < steps && idx <= endIdx; i++) {
        simTime += STEP;
        const pl = p();
        const cur = route[idx];
        if (pl.dead) {
          stats.deaths++;
          const around = g.level.monsters.filter((m) => !m.dead && Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) < 7);
          const desc = {};
          for (const m of around) { const k = `${m.def.id}/${m.rank}${m.mods.length ? '(' + m.mods.join('+') + ')' : ''}`; desc[k] = (desc[k] ?? 0) + 1; }
          stats.timeline.push(`death in ${cur.key} lvl ${pl.level} t=${Math.round(simTime)} by ${JSON.stringify(desc)} proj=${g.level.projectiles.length}`);
          stats.deathList.push({ area: cur.key, lvl: pl.level, causes: desc, proj: g.level.projectiles.length });
          g.respawn();
          areaDeaths++;
          // stuck on a floor: do what a player does and start a fresh game of it (a new layout)
          if (areaDeaths % 4 === 0) g.lastDungeon = null;
          g.travelToArea(cur.id);
          continue;
        }
        potionCd -= STEP;
        think -= STEP;
        if (potionCd <= 0 && pl.life < pl.stats.maxLife * 0.45) { if (drink('hp')) potionCd = 1.2; }
        if (potionCd <= 0 && thirsty()) { if (drink('mp')) potionCd = 1.5; }
        if (think <= 0) {
          think = 0.1;
          spend();
          // inventory management
          for (const pi of [...pl.inventory.items]) {
            const it = pi.item;
            const b = baseOf(it);
            if (b.type === 'potion') { if (g.beltInsert(it)) pl.inventory.remove(it); continue; }
            // keep a few runes for runewords; sell the rest so the bag never clogs
            if (b.type === 'rune') {
              if (pl.inventory.items.filter((x) => baseOf(x.item).type === 'rune').length > 6) { pl.inventory.remove(it); pl.gold += sellPrice(it); }
              continue;
            }
            if (!tryEquip(it) && pl.inventory.items.length > 8) { pl.inventory.remove(it); pl.gold += sellPrice(it); }
          }
          if (pl.state === 'idle' || pl.state === 'move') {
            // buffs as they wear off
            for (const [id, left] of build.buffs) if (pl.skillLevel(id) > 0 && !(pl[left] > 0) && pl.mana >= mana(id)) { g.useSkillAt(id, null, { ...pl.pos }, true); lastPick = `buff:${id}`; break; }
          }
          if (pl.state === 'idle' || pl.state === 'move') {
            const near = g.level.monsters.filter((m) => !m.dead).map((m) => ({ m, d: Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) })).sort((a, b) => a.d - b.d);
            const loot = g.level.ground.filter((gi) => !gi.gold && gi.item && pl.inventory.findSpace(gi.item) && Math.hypot(gi.pos.x - pl.pos.x, gi.pos.z - pl.pos.z) < 8).sort((a, b) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) - Math.hypot(b.pos.x - pl.pos.x, b.pos.z - pl.pos.z))[0];
            if (near.length && near[0].d < 7 && !(pl.intent && pl.intent.kind === 'attack' && !pl.intent.target.dead)) {
              pl.intent = engage(near[0].m, near[0].d);
              lastPick = 'near-attack:' + (pl.intent.skill ?? 'closing in');
            } else if (!pl.intent && loot && pl.inventory.items.length < 24 && (!near.length || near[0].d > 6)) {
              const it = loot.item;
              if (it.rarity === 'unique') stats.uniques++;
              if (it.rarity === 'set') stats.sets++;
              if (it.rarity === 'rare') stats.rares++;
              if (baseOf(it).type === 'rune') stats.runes++;
              pl.intent = { kind: 'pickup', ground: loot };
              lastPick = `pickup ${displayName(it)} @${loot.pos.x.toFixed(1)},${loot.pos.z.toFixed(1)} tile=${g.level.map.get(Math.floor(loot.pos.x), Math.floor(loot.pos.z))} inv=${pl.inventory.items.length}`;
            } else if (!pl.intent) {
              if (near.length && near[0].d < 40) {
                pl.intent = engage(near[0].m, near[0].d);
                lastPick = 'far-attack:' + (pl.intent.skill ?? 'closing in');
              } else {
                // on into the next area, or back into this one (walked out of it, say)
                const to = g.area.id === cur.id ? route[idx + 1] : cur;
                const way = to && g.level.wayTo(to.id, pl.pos);
                if (way?.obj) pl.intent = { kind: 'interact', obj: way.obj };
                else if (way) pl.intent = { kind: 'move', point: way.pos };
                // nothing here leads there: as by waypoint
                else if (to) g.travelToArea(to.id);
                lastPick = `way:${to?.key}${way?.obj ? ' by ' + way.obj.kind : way ? '' : ' (jumped)'}`;
              }
            }
            // stuck detection
            if (Math.hypot(pl.pos.x - lastPos.x, pl.pos.z - lastPos.z) < 0.05 && pl.state !== 'attack' && pl.state !== 'cast') stuck += 0.1; else stuck = 0;
            lastPos = { ...pl.pos };
            if (stuck > 6) { pl.intent = null; stuck = 0; const t = near[Math.floor(Math.random() * Math.min(5, near.length))]; if (t) pl.intent = engage(t.m, t.d); }
          }
        }
        g.update(STEP);
        if (Math.hypot(pl.pos.x - stallAnchor.x, pl.pos.z - stallAnchor.z) > 2) {
          stallAnchor = { ...pl.pos };
          stallSince = simTime;
        } else if (simTime - stallSince > 30 && stallsLogged < 4) {
          stallsLogged++;
          stallSince = simTime;
          const map = g.level.map;
          const it = pl.intent;
          const tgt = it?.target?.pos ?? it?.ground?.pos ?? it?.obj?.pos ?? it?.point ?? null;
          const grid = [];
          for (let y = Math.floor(pl.pos.z) - 3; y <= Math.floor(pl.pos.z) + 3; y++) {
            let row = '';
            for (let x = Math.floor(pl.pos.x) - 3; x <= Math.floor(pl.pos.x) + 3; x++) {
              const isP = x === Math.floor(pl.pos.x) && y === Math.floor(pl.pos.z);
              const isT = tgt && x === Math.floor(tgt.x) && y === Math.floor(tgt.z);
              row += isP ? '@' : isT ? 'T' : '.#P'[map.get(x, y) - 1] ?? ' ';
            }
            grid.push(row);
          }
          stats.timeline.push(`STALL in ${g.area.key} t=${Math.round(simTime)} pos=${pl.pos.x.toFixed(1)},${pl.pos.z.toFixed(1)} state=${pl.state} intent=${it?.kind}${it?.target ? '(' + it.target.def.id + (it.target.dead ? ',dead' : '') + ')' : ''} tgt=${tgt ? tgt.x.toFixed(1) + ',' + tgt.z.toFixed(1) : '-'} path=${pl.path?.length ?? 0} mana=${Math.round(pl.mana)} lastPick=${lastPick}\n      near: ${g.level.monsters.filter((m) => !m.dead).map((m) => ({ m, d: Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) })).sort((a, b) => a.d - b.d).slice(0, 3).map(({ m, d }) => `${m.def.id}@${d.toFixed(1)} los=${map.los(pl.pos, m.pos)} st=${m.state} tile=${map.get(Math.floor(m.pos.x), Math.floor(m.pos.z))}`).join(' | ')}\n      ${grid.join('\n      ')}`);
        }
        // into an area further along the route: the one before it is cleared
        const at = g.area.id === lastArea ? -1 : route.findIndex((a, k) => k > idx && a.id === g.area.id);
        lastArea = g.area.id;
        if (at > idx) {
          const d = pl.stats;
          stats.levels.push({
            area: cur.key, lvl: pl.level, secs: Math.round(simTime - areaStart), deaths: stats.deaths, gold: pl.gold, kills: stats.kills,
            life: Math.round(d.maxLife), def: Math.round(d.def), res: Math.round((d.res.fire + d.res.cold + d.res.light + d.res.poison) / 4),
            dmg: Math.round(((d.wMin + d.wMax) / 2) * (1 + d.dmgPct / 100)), ar: Math.round(d.ar),
          });
          idx = at;
          areaStart = simTime;
          areaDeaths = 0;
        }
      }
    };
    window.__runChunk = runChunk;
    window.__botDone = () => idx > endIdx || simTime > o.maxMinutes * 60;
    window.__botStatus = () => ({ area: route[Math.min(idx, route.length - 1)].key, simTime: Math.round(simTime), lvl: p().level, life: Math.round(p().life), max: p().stats.maxLife, deaths: stats.deaths });
    return { cls, route: stats.route, level: p().level };
  }, o);
  if (setup.error) {
    log(`BOT_ERROR ${setup.error}`);
    return;
  }
  log(`bot: ${setup.cls} at level ${setup.level}, ${setup.route.join(' → ')}`);
  const t0 = Date.now();
  while (!(await page.evaluate(() => window.__botDone()))) {
    await page.evaluate(() => window.__runChunk(20));
    const s = await page.evaluate(() => window.__botStatus());
    if (s.simTime % 120 < 20) log('…', JSON.stringify(s), `${Math.round((Date.now() - t0) / 1000)}s real`);
    if (Date.now() - t0 > 30 * 60 * 1000) break;
  }
  const result = await page.evaluate(async () => {
    const { displayName } = await import('/src/items/item.ts');
    const pl = game.player;
    const eq = Object.fromEntries(Object.entries(pl.equipment).map(([k, v]) => [k, `${displayName(v)} [${v.rarity}]`]));
    const d = pl.stats;
    return { ...window.__bot, final: { cls: pl.cls, lvl: pl.level, life: d.maxLife, def: d.def, dmg: [d.wMin, d.wMax, d.dmgPct], ar: d.ar, res: d.res, eq, base: pl.base, skills: pl.skills } };
  });
  const { timeline, deathList, ...rest } = result;
  log(JSON.stringify(rest));
  log('BOT_RESULT ' + JSON.stringify({ route: result.route, levels: result.levels, deathList, final: result.final, stalls: timeline.filter((t) => t.startsWith('STALL')).slice(0, 2), status: await page.evaluate(() => window.__botStatus()) }));
  const byArea = {};
  for (const t of deathList) byArea[t.area] = (byArea[t.area] ?? 0) + 1;
  log('deaths by area', JSON.stringify(byArea));
  log(timeline.join('\n'));
}
