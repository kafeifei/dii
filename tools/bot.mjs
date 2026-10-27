// Balance bot scenario for tools/play.mjs: fast-forwards the sim with an automated player.
// node tools/play.mjs tools/bot.mjs --url http://localhost:PORT/?dev
export default async function (page, shot, log) {
  const maxDepth = +(process.env.DEPTH || 8);
  const maxMinutes = +(process.env.MINUTES || 40);
  await page.evaluate(async ({ maxDepth, maxMinutes }) => {
    const { baseOf, displayName, weaponDamage, sellPrice } = await import('/src/items/item.ts');
    const { slotsFor } = await import('/src/data/items.ts');
    const { SKILL_BY_ID } = await import('/src/data/skills.ts');
    const { createItem } = await import('/src/items/gen.ts');
    const g = game;
    // the bot steps the sim itself; skip the page's own update/render loop (much faster headless)
    g.headless = true;
    const STEP = 1 / 60;
    const stats = { deaths: 0, levels: [], kills: 0, uniques: 0, sets: 0, rares: 0, runes: 0, potionsUsed: 0, timeline: [], deathList: [] };
    window.__bot = stats;
    let depth = 1;
    let levelStart = 0;
    g.enterLevel(1, 'stairs');
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
    // per-point priority with caps (a simple zeal/concentration melee build)
    const skillCaps = [['sacred_strike', 1], ['zeal', 20], ['might', 1], ['prayer', 1], ['holy_fire', 1], ['resist_all', 1], ['holy_freeze', 1], ['charge', 1], ['concentration', 20], ['vigor', 1], ['might', 20]];
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
        const pick = skillCaps.find(([s, cap]) => (pl.skills[s] ?? 0) < cap && pl.canLearn(SKILL_BY_ID[s]));
        if (!pick) break;
        pl.skills[pick[0]] = (pl.skills[pick[0]] ?? 0) + 1;
        pl.skillPoints--;
      }
      pl.markDirty(); pl.recalc();
      const aura = pl.skillBase('concentration') ? 'concentration' : pl.skillBase('might') ? 'might' : null;
      if (aura && pl.activeAura !== aura) { pl.activeAura = aura; pl.markDirty(); }
      // simulated town trip: keep the belt stocked with potions while gold allows
      const potionCount = pl.belt.reduce((a, c) => a + c.length, 0);
      if (potionCount < 4 && pl.gold > 200) {
        for (let k = 0; k < 6 && pl.gold > 100; k++) {
          const tier = pl.level >= 26 ? 'hp4' : pl.level >= 16 ? 'hp3' : pl.level >= 8 ? 'hp2' : 'hp1';
          const it = createItem(k % 3 === 2 ? tier.replace('hp', 'mp') : tier);
          if (g.beltInsert(it)) { pl.gold -= baseOf(it).price; stats.bought = (stats.bought ?? 0) + 1; }
        }
      }
    };
    // out of mana: plain swings, like a player would
    const attackSkill = () => (p().mana < 8 ? 'attack' : p().skillBase('zeal') ? 'zeal' : p().skillBase('sacred_strike') ? 'sacred_strike' : 'attack');
    const drink = (kind) => {
      const pl = p();
      for (let i = 0; i < 4; i++) if (pl.belt[i].length && (kind === 'hp' ? (pl.belt[i][0].baseId.startsWith('hp') || pl.belt[i][0].baseId.startsWith('rejuv')) : pl.belt[i][0].baseId.startsWith('mp'))) { g.useBelt(i); stats.potionsUsed++; return true; }
      const inv = pl.inventory.items.find((x) => x.item.baseId.startsWith(kind) || (kind === 'hp' && x.item.baseId.startsWith('rejuv')));
      if (inv) { pl.inventory.remove(inv.item); g.drink(inv.item); stats.potionsUsed++; return true; }
      return false;
    };
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
    let floorDeaths = 0;
    const runChunk = (seconds) => {
      const steps = Math.floor(seconds / STEP);
      for (let i = 0; i < steps; i++) {
        simTime += STEP;
        const pl = p();
        if (pl.dead) {
          stats.deaths++;
          const around = g.level.monsters.filter((m) => !m.dead && Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) < 7);
          const desc = {};
          for (const m of around) { const k = `${m.def.id}/${m.rank}${m.mods.length ? '(' + m.mods.join('+') + ')' : ''}`; desc[k] = (desc[k] ?? 0) + 1; }
          stats.timeline.push(`death at depth ${depth} lvl ${pl.level} t=${Math.round(simTime)} by ${JSON.stringify(desc)} proj=${g.level.projectiles.length}`);
          stats.deathList.push({ depth, lvl: pl.level, causes: desc, proj: g.level.projectiles.length });
          g.respawn();
          floorDeaths++;
          // stuck on a floor: do what a player does and start a fresh game of it (a new layout)
          if (floorDeaths % 4 === 0) g.lastDungeon = null;
          g.travel(depth);
          continue;
        }
        potionCd -= STEP;
        think -= STEP;
        if (potionCd <= 0 && pl.life < pl.stats.maxLife * 0.45) { if (drink('hp')) potionCd = 1.2; }
        if (potionCd <= 0 && pl.mana < 8) { if (drink('mp')) potionCd = 1.5; }
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
            const near = g.level.monsters.filter((m) => !m.dead).map((m) => ({ m, d: Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) })).sort((a, b) => a.d - b.d);
            const loot = g.level.ground.filter((gi) => !gi.gold && gi.item && pl.inventory.findSpace(gi.item) && Math.hypot(gi.pos.x - pl.pos.x, gi.pos.z - pl.pos.z) < 8).sort((a, b) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) - Math.hypot(b.pos.x - pl.pos.x, b.pos.z - pl.pos.z))[0];
            if (near.length && near[0].d < 7 && !(pl.intent && pl.intent.kind === 'attack' && !pl.intent.target.dead)) {
              pl.intent = { kind: 'attack', target: near[0].m, skill: attackSkill(), hold: true };
              lastPick = 'near-attack:' + pl.intent.skill;
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
                pl.intent = { kind: 'attack', target: near[0].m, skill: attackSkill(), hold: true };
                lastPick = 'far-attack:' + pl.intent.skill;
              } else {
                lastPick = 'stairs';
                const st = g.level.objects.find((o) => o.kind === 'stairs');
                pl.intent = { kind: 'interact', obj: st };
              }
            }
            // stuck detection
            if (Math.hypot(pl.pos.x - lastPos.x, pl.pos.z - lastPos.z) < 0.05 && pl.state !== 'attack') stuck += 0.1; else stuck = 0;
            lastPos = { ...pl.pos };
            if (stuck > 6) { pl.intent = null; stuck = 0; const t = near[Math.floor(Math.random() * Math.min(5, near.length))]; if (t) pl.intent = { kind: 'attack', target: t.m, skill: attackSkill(), hold: true }; }
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
          const tgt = it?.target?.pos ?? it?.ground?.pos ?? it?.obj?.pos ?? null;
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
          stats.timeline.push(`STALL depth ${depth} t=${Math.round(simTime)} pos=${pl.pos.x.toFixed(1)},${pl.pos.z.toFixed(1)} state=${pl.state} intent=${it?.kind}${it?.target ? '(' + it.target.def.id + (it.target.dead ? ',dead' : '') + ')' : ''} tgt=${tgt ? tgt.x.toFixed(1) + ',' + tgt.z.toFixed(1) : '-'} path=${pl.path?.length ?? 0} mana=${Math.round(pl.mana)} lastPick=${lastPick}\n      near: ${g.level.monsters.filter((m) => !m.dead).map((m) => ({ m, d: Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) })).sort((a, b) => a.d - b.d).slice(0, 3).map(({ m, d }) => `${m.def.id}@${d.toFixed(1)} los=${map.los(pl.pos, m.pos)} st=${m.state} tile=${map.get(Math.floor(m.pos.x), Math.floor(m.pos.z))}`).join(' | ')}\n      ${grid.join('\n      ')}`);
        }
        if (g.level.depth !== depth && g.level.depth > 0) {
          const d = pl.stats;
          stats.levels.push({
            depth, lvl: pl.level, secs: Math.round(simTime - levelStart), deaths: stats.deaths, gold: pl.gold, kills: stats.kills,
            life: Math.round(d.maxLife), def: Math.round(d.def), res: Math.round((d.res.fire + d.res.cold + d.res.light + d.res.poison) / 4),
            dmg: Math.round(((d.wMin + d.wMax) / 2) * (1 + d.dmgPct / 100)), ar: Math.round(d.ar),
          });
          depth = g.level.depth;
          levelStart = simTime;
          floorDeaths = 0;
        }
      }
    };
    window.__runChunk = runChunk;
    window.__botDone = () => depth > maxDepth || simTime > maxMinutes * 60;
    window.__botStatus = () => ({ depth, simTime: Math.round(simTime), lvl: p().level, life: Math.round(p().life), max: p().stats.maxLife, deaths: stats.deaths });
  }, { maxDepth, maxMinutes });
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
    return { ...window.__bot, final: { lvl: pl.level, life: d.maxLife, def: d.def, dmg: [d.wMin, d.wMax, d.dmgPct], ar: d.ar, res: d.res, eq, base: pl.base, skills: pl.skills } };
  });
  const { timeline, deathList, ...rest } = result;
  log(JSON.stringify(rest));
  log('BOT_RESULT ' + JSON.stringify({ levels: result.levels, deathList, final: result.final, stalls: timeline.filter((t) => t.startsWith('STALL')).slice(0, 2), status: await page.evaluate(() => window.__botStatus()) }));
  const byDepth = {};
  for (const t of deathList) byDepth[t.depth] = (byDepth[t.depth] ?? 0) + 1;
  log('deaths by depth', JSON.stringify(byDepth));
  log(timeline.join('\n'));
}
