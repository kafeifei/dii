// Balance bot scenario for tools/play.mjs: fast-forwards the sim with an automated player.
// node tools/play.mjs tools/bot.mjs --url "http://localhost:PORT/?dev" [--class sorceress] [--start-area camp] [--to coldplains] [--level 1] [--minutes 40]
// The hero plays Act 1's opening as a player does (src/world/areas.ts, the areas in the order a hero
// comes to them): in the camp it speaks to the merchant (亚珈萝, Akara's counterpart) first, so the
// Den of Evil is given (src/game/quests), out over Blood Moor into the Den, every monster there killed
// so the quest is done, back to her for the reward (a skill point, spent by its build), then on to
// Cold Plains, its waypoint touched and Bishibosh killed, and on until past --to. It fights what is
// near on the way; the last area there is, with none after it, is fought until nothing in it is left
// alive. The trial ground's floors (--start-area floor3 --to floor7) follow one another by their stairs.
// Like a player it picks up what is worth having, reads scrolls or a tome of identify, wears what
// Diablo II's numbers (the game's own: Player.stats, d2/stats.ts hitChance) say is better for its
// build, keeps the rest to sell, and goes to town by town portal (a scroll or a tome's charge; walking
// or by waypoint when it has none) when its potions run out, its bag fills or its gear wears thin
// (items break at 0): there it sells, buys potions, scrolls and tomes and better gear, and repairs,
// then goes back through its portal or by waypoint. --level starts the hero at that level, its points
// spent and wearing gear rolled at it. Options may come from the environment too (CLASS, START_AREA,
// TO, LEVEL, MINUTES), the way tools/balance.mjs passes them.
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : (process.env[k.toUpperCase().replace(/-/g, '_')] ?? d);
};

/**
 * What each class does, by skill id (src/data/skills.ts, the trees this game has). `points`: where its
 * points go, in order, each [skill, the level to take it to]; a skill a point can't go into yet is
 * passed over until it can, a missing prerequisite is learned first, a skill this build doesn't have
 * is left out. `attacks`: what it fights with, the first learned one there is mana for (the weapon
 * when none). `auras`: the one to keep on, the first learned. `buffs`: [skill, the Player field that is
 * its time left] to cast again as it wears off. `manaShare`: the belt's share of mana potions.
 * `melee`: it hits with its weapon (dexterity for attack rating), else it casts (vitality only).
 * A class with no build, or none of whose skills are left, spends on and fights with its own latest skills.
 */
const BUILDS = {
  // Might while Zeal waits for level 6, then Zeal, and Concentration from 18 (Might's the prerequisite)
  paladin: {
    points: [['might', 4], ['zeal', 12], ['concentration', 20], ['zeal', 20], ['might', 20]],
    attacks: ['zeal', 'sacred_strike'],
    auras: ['concentration', 'might'],
    buffs: [],
    manaShare: 1 / 4,
    melee: true,
  },
  // fire bolt, then fire ball from 12 (each the other's synergy), with warmth for the mana and frozen armor for the hits
  sorceress: {
    points: [['frozen_armor', 1], ['warmth', 1], ['fire_bolt', 8], ['fire_ball', 20], ['fire_wall', 1], ['meteor', 20], ['fire_bolt', 20], ['warmth', 20]],
    attacks: ['fire_ball', 'fire_bolt'],
    auras: [],
    buffs: [['frozen_armor', 'frozenArmor']],
    manaShare: 1 / 2,
    melee: false,
  },
};

export default async function (page, shot, log) {
  const o = {
    cls: opt('class', ''),
    startArea: opt('start-area', 'camp'),
    to: opt('to', 'coldplains'),
    level: +opt('level', 1),
    maxMinutes: +opt('minutes', 40),
    builds: BUILDS,
  };
  const setup = await page.evaluate(async (o) => {
    const { baseOf, displayName, isIdentified, itemReqStats } = await import('/src/items/item.ts');
    const V = await import('/src/items/vendor.ts');
    const T = await import('/src/items/tomes.ts');
    const { repairItem, isBroken } = await import('/src/items/d2/durability.ts');
    const { slotsFor } = await import('/src/data/items.ts');
    const { SKILL_BY_ID, SKILLS } = await import('/src/data/skills.ts');
    const { CLASS_IDS } = await import('/src/data/classes.ts');
    const { rollEquipment, createItem } = await import('/src/items/gen.ts');
    const { xpForLevel } = await import('/src/game/player.ts');
    const { bodyItems, takeBody } = await import('/src/game/corpse.ts');
    const { areaByKey, areaDef, nextArea, CAMP_AREA, DEN_OF_EVIL, COLD_PLAINS } = await import('/src/world/areas.ts');
    const { hitChance } = await import('/src/game/d2/stats.ts');
    const { QFLAG, questState } = await import('/src/game/quests/record.ts');
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
    const routeIdx = (id) => route.findIndex((a) => a.id === id);
    const denOnRoute = routeIdx(DEN_OF_EVIL) >= 0 && routeIdx(DEN_OF_EVIL) <= endIdx;
    // the skills the build names that this build of the game has, for the hero's class
    const own = (id) => SKILL_BY_ID[id]?.cls === cls;
    const b = o.builds[cls] ?? { points: [], attacks: [], auras: [], buffs: [], manaShare: 1 / 3, melee: true };
    const build = {
      points: b.points.filter(([id]) => own(id)),
      attacks: b.attacks.filter(own),
      auras: b.auras.filter(own),
      buffs: b.buffs.filter(([id]) => own(id)),
      manaShare: b.manaShare,
      melee: b.melee,
    };
    /** a skill that hurts what it is aimed at (a fallback's attack: not a teleport or a passive) */
    const hurts = (s) => s.kind === 'attack' || (s.kind === 'spell' && Object.keys(s.params(1, 0)).some((k) => /min|max|dps|dmg/i.test(k)));
    /** the class's own skills, latest first: what a class without a build goes by */
    const latest = SKILLS.filter((s) => s.cls === cls).sort((x, y) => y.reqLevel - x.reqLevel);

    // the sim is stepped here; the page's own update/render loop is skipped (much faster headless)
    g.headless = true;
    g.newGame('', cls);
    const STEP = 1 / 60;
    const stats = {
      route: route.slice(0, endIdx + 1).map((a) => a.key),
      deaths: 0, levels: [], events: [], kills: 0, uniques: 0, sets: 0, rares: 0, magics: 0, runes: 0, potionsUsed: 0,
      townTrips: 0, chickens: 0, portals: 0, waypointTrips: 0, jumps: 0, identified: 0, sold: 0, soldGold: 0, bought: {}, spent: {}, repairs: 0, equipped: [], timeline: [], deathList: [],
    };
    window.__bot = stats;
    let simTime = 0;
    const p = () => g.player;
    /** something worth a line in the results: when, at what level */
    const event = (ev, extra = {}) => stats.events.push({ ev, t: Math.round(simTime), lvl: p().level, ...extra });
    const kill = g.killMonster.bind(g);
    g.killMonster = (m, ...a) => {
      if (!m.dead) {
        stats.kills++;
        if (m.superUnique) event(`killed ${m.superUnique}`);
      }
      return kill(m, ...a);
    };
    // a townsperson spoken to (Game.talkTo): instead of the UI's menu, the bot hears the line and trades
    let met = null;
    g.hooks.npcMenu = (obj, opening) => {
      met = { obj, opening };
    };
    // a panel the game opens (the waypoint's list): the bot picks from it itself
    let panel = null;
    g.hooks.openPanel = (kind) => {
      panel = kind;
    };

    // ─────────── the Den of Evil (src/game/quests/denofevil.ts) ───────────
    const den = () => g.quests.script('a1q1');
    const qHas = (f) => questState(p().quests[p().difficulty], 'a1q1', f);
    /** the quest plays this game and its reward isn't had */
    const denLive = () => denOnRoute && !!den()?.playable && !qHas(QFLAG.REWARDGRANTED);
    /** Akara has given it (or it doesn't play) */
    const denGiven = () => !denLive() || den().state >= 2;
    /** the den is cleared (or the quest doesn't play) */
    const denDone = () => !denLive() || qHas(QFLAG.REWARDPENDING) || den().state >= 4;
    const rewardPending = () => denLive() && qHas(QFLAG.REWARDPENDING);
    let denCleared = false;

    // ─────────── what the hero has ───────────
    const bag = () => p().inventory.items.map((x) => x.item);
    const potions = (kind) => {
      const isK = (it) => it.baseId.startsWith(kind) || (kind === 'hp' && it.baseId.startsWith('rv'));
      return p().belt.reduce((n, c) => n + c.filter(isK).length, 0) + bag().filter(isK).length;
    };
    const tpCharges = () => T.townPortalsIn(p().inventory);
    const idFrom = () => bag().find((it) => (it.baseId === 'ibk' && T.tomeCharges(it) > 0) || it.baseId === 'isc');
    const freeCells = () => {
      const inv = p().inventory;
      let used = 0;
      for (const x of inv.items) {
        const [w, h] = inv.size(x.item);
        used += w * h;
      }
      return 40 - used;
    };
    /** item types it never fights with: a bow and the like want both hands and a quiver, a thrown weapon a stack */
    const OFF_TYPES = new Set(['bow', 'crossbow', 'javelin', 'throwing']);
    const wearable = (it) => !!slotsFor(baseOf(it).type).length && !OFF_TYPES.has(baseOf(it).type);
    const isBook = (it) => !!T.bookOf(it.baseId);
    /** the potions a belt is for: healing, mana and rejuvenation (stamina, antidote and thawing ones it leaves) */
    const beltPotion = (it) => /^(hp|mp|rv)/.test(it.baseId);
    /** spare potions carried in the bag past the belt's: a caster lives on mana potions */
    const SPARE = { hp: 4, mp: build.melee ? 2 : 8, rv: 4 };
    const kindOf = (it) => it.baseId.slice(0, 2);
    const spares = (kind) => bag().filter((x) => kindOf(x) === kind && keep.has(x)).length;
    const worn = () => Object.values(p().equipment).filter(Boolean);
    /** a worn piece down to its last 15% (two points at least), or broken: at 0 it gives nothing until repaired */
    const wornThin = () => worn().some((it) => it.maxDur && !it.eth && (isBroken(it) || (it.dur ?? it.maxDur) <= Math.max(2, it.maxDur * 0.15)));

    // ─────────── what Diablo II's numbers make of the hero ───────────
    /** the monsters round it, averaged: what its hits and theirs are judged against */
    let foe = { def: 5, ar: 15, lvl: 1 };
    const sampleFoes = () => {
      const L = g.level;
      const here = g.area?.id;
      const list = L.monsters.filter((m) => !m.dead && m.def.row.align === 0 && L.areaAt(m.pos.x, m.pos.z).id === here);
      if (list.length < 3) return;
      const avg = (f) => list.reduce((s, m) => s + f(m), 0) / list.length;
      foe = { def: avg((m) => m.defense), ar: avg((m) => m.ar), lvl: avg((m) => m.level) };
    };
    const mana = (id) => SKILL_BY_ID[id]?.mana(p().skillLevel(id)) ?? 0;
    /** the attack the build relies on now: its first learned one, else the latest learned one that hurts */
    const mainAttack = () => build.attacks.find((id) => p().skillLevel(id) > 0) ?? latest.find((s) => hurts(s) && p().skillLevel(s.id) > 0)?.id ?? 'attack';
    /**
     * How well the hero fares as it stands, by the game's own numbers (Player.stats): its main
     * attack's damage a second (a melee one with its weapon, its skill's bonuses, its attack speed and
     * D2's chance to hit the monsters round it; a spell's damage over its cast time, kept back by the
     * mana it has for it), against the blows it can take (life over D2's chance to be hit by them and
     * not blocked, resistances counting a little in Act 1), and its belt's room for potions
     */
    const score = () => {
      const pl = p();
      const d = pl.stats;
      const sk = mainAttack();
      const def = SKILL_BY_ID[sk];
      let dps;
      if (def?.kind === 'spell') {
        const par = pl.skillParams(sk);
        const avg = par.min !== undefined ? (par.min + par.max) / 2 : (par.dps ?? par.dmg ?? 1);
        const casts = d.maxMana / Math.max(1, mana(sk));
        dps = (avg / Math.max(0.2, d.castTime)) * Math.min(1, 0.3 + casts / 12);
      } else {
        const par = def && sk !== 'attack' ? pl.skillParams(sk) : {};
        const phys = ((d.wMin + d.wMax) / 2) * (1 + (d.dmgPct + (par.ed ?? 0)) / 100) * (1 + d.crit / 100);
        const elem = (d.fire[0] + d.fire[1] + d.cold[0] + d.cold[1] + d.light[0] + d.light[1] + d.magic[0] + d.magic[1]) / 2 + d.poison / 2;
        const ar = d.ar * (1 + (par.ar ?? 0) / 100);
        dps = (phys + elem) * d.attacksPerSec * (hitChance(ar, foe.def, pl.level, foe.lvl) / 100);
      }
      const beHit = (hitChance(foe.ar, d.def, foe.lvl, pl.level) / 100) * (1 - d.block / 100);
      const res = (d.res.fire + d.res.cold + d.res.light + d.res.poison) / 4;
      const ehp = (d.maxLife / Math.max(0.05, beHit)) * (1 + Math.max(0, res) / 400);
      const sustain = 1 + d.lifeSteal / 25 + (d.lifePerKill ?? 0) / 20;
      return Math.sqrt(Math.max(0.01, dps) * ehp * sustain) * (1 + 0.04 * pl.beltRows());
    };
    /** the main attack's average damage a hit (a cast's), as score() reckons it, for the tables */
    const hit = () => {
      const pl = p();
      const d = pl.stats;
      const sk = mainAttack();
      const def = SKILL_BY_ID[sk];
      if (def?.kind === 'spell') {
        const par = pl.skillParams(sk);
        return par.min !== undefined ? (par.min + par.max) / 2 : (par.dps ?? par.dmg ?? 0);
      }
      const par = def && sk !== 'attack' ? pl.skillParams(sk) : {};
      return ((d.wMin + d.wMax) / 2) * (1 + (d.dmgPct + (par.ed ?? 0)) / 100);
    };
    const recalc = () => {
      p().markDirty();
      p().recalc();
    };
    /** `fn` run with the hero's strength and dexterity raised to what `it` asks, as when its points go there */
    const withReqs = (it, fn) => {
      const pl = p();
      const req = itemReqStats(it);
      const was = { ...pl.base };
      pl.base.str = Math.max(pl.base.str, pl.base.str + req.str - pl.stats.str);
      pl.base.dex = Math.max(pl.base.dex, pl.base.dex + req.dex - pl.stats.dex);
      recalc();
      try {
        return fn();
      } finally {
        pl.base = was;
        recalc();
      }
    };
    /**
     * The slot `it` would do best in and what the hero's score would be there, against what it is now
     * (null: not better by 2%), tried on and taken off again. A shield isn't tried beside a
     * two-handed weapon; a two-handed weapon is tried with the shield off
     */
    const trial = (it) => {
      const pl = p();
      if (!wearable(it)) return null;
      const bb = baseOf(it);
      const before = score();
      let best = null;
      for (const slot of slotsFor(bb.type)) {
        if (slot === 'offhand' && pl.equipment.weapon && baseOf(pl.equipment.weapon).twoHanded) continue;
        const old = pl.equipment[slot];
        const oldOff = pl.equipment.offhand;
        pl.equipment[slot] = it;
        if (slot === 'weapon' && bb.twoHanded) delete pl.equipment.offhand;
        recalc();
        const s = pl.unusable(it) ? 0 : score();
        if (old) pl.equipment[slot] = old;
        else delete pl.equipment[slot];
        if (oldOff) pl.equipment.offhand = oldOff;
        recalc();
        if (s > before * 1.02 && (!best || s > best.s)) best = { slot, s, gain: s / before };
      }
      return best;
    };
    /** an identified piece the hero can't wear yet for its strength or dexterity alone, that would be better: the points it wants */
    const wish = { str: 0, dex: 0 };
    const waiting = new Set();
    const wouldSuit = (it) => {
      const pl = p();
      if (!wearable(it) || !isIdentified(it) || pl.meetsReq(it)) return false;
      const req = itemReqStats(it);
      // the level and class must be met already; strength and dexterity within a few levels' points
      const lvlOk = withReqs(it, () => pl.meetsReq(it));
      const short = Math.max(0, req.str - pl.stats.str) + Math.max(0, req.dex - pl.stats.dex);
      if (!lvlOk || short > pl.statPoints + 15) return false;
      if (!withReqs(it, () => trial(it))) return false;
      wish.str = Math.max(wish.str, req.str - (pl.stats.str - pl.base.str));
      wish.dex = Math.max(wish.dex, req.dex - (pl.stats.dex - pl.base.dex));
      return true;
    };
    /**
     * Wear `it` from the bag in its best slot if it is better there; what comes off goes into the bag
     * (sold at once at the merchant's: `sell`), or, with no room for it out in the field, nothing changes
     */
    const equip = (it, sell = null) => {
      const pl = p();
      if (!pl.meetsReq(it)) return false;
      const best = trial(it);
      if (!best) return false;
      const bb = baseOf(it);
      const off = [pl.equipment[best.slot], best.slot === 'weapon' && bb.twoHanded ? pl.equipment.offhand : undefined].filter(Boolean);
      const inBag = pl.inventory.contains(it);
      if (inBag) pl.inventory.remove(it);
      const back = [];
      const sold = [];
      for (const x of off) {
        if (pl.inventory.add(x)) back.push(x);
        else if (sell) sold.push(x);
        else {
          for (const y of back) pl.inventory.remove(y);
          if (inBag) pl.inventory.add(it);
          return false;
        }
      }
      pl.equipment[best.slot] = it;
      if (best.slot === 'weapon' && bb.twoHanded) delete pl.equipment.offhand;
      for (const x of sold) sell(x, false);
      recalc();
      waiting.delete(it);
      stats.equipped.push(`${Math.round(simTime)}s L${pl.level} ${best.slot}: ${displayName(it)} [${it.rarity}] ×${best.gain.toFixed(2)}`);
      return true;
    };
    /** a charm in the bag that does the hero good (charms work from the bag: Player.activeCharms) */
    const goodCharm = (it) => {
      const pl = p();
      if (baseOf(it).type !== 'charm' || !isIdentified(it)) return false;
      const withIt = score();
      const at = pl.inventory.items.find((x) => x.item === it);
      pl.inventory.remove(it);
      recalc();
      const without = score();
      if (!(at && pl.inventory.canPlace(it, at.x, at.y) && (pl.inventory.place(it, at.x, at.y), true))) pl.inventory.add(it);
      recalc();
      return withIt > without * 1.01;
    };

    // ─────────── points ───────────
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
    /**
     * Its points as a player spends them: strength and dexterity for the gear found that wants them
     * (wouldSuit), a melee hero's dexterity a point a level past its start for its attack rating, the
     * rest into vitality; skills by the build
     */
    const spend = () => {
      const pl = p();
      let changed = false;
      const dexFloor = build.melee ? 20 + pl.level : 0;
      while (pl.statPoints > 0) {
        let k = 'vit';
        if (pl.base.str < wish.str) k = 'str';
        else if (pl.base.dex < Math.max(wish.dex, dexFloor)) k = 'dex';
        pl.base[k]++;
        pl.statPoints--;
        changed = true;
      }
      let guard = 0;
      while (pl.skillPoints > 0 && guard++ < 50) {
        const id = nextPoint();
        if (!id) break;
        pl.skills[id] = (pl.skills[id] ?? 0) + 1;
        pl.skillPoints--;
        changed = true;
      }
      if (changed) recalc();
      const aura = build.auras.find((a) => pl.skillBase(a)) ?? (build.points.length ? null : latest.find((s) => s.kind === 'aura' && pl.skillBase(s.id))?.id);
      if (aura && pl.activeAura !== aura) {
        pl.activeAura = aura;
        pl.markDirty();
      }
      return changed;
    };

    // ─────────── the bag ───────────
    /** read identify on `it` from a scroll or the tome (the bag's inventory.ts identifyWith) */
    const identify = (it) => {
      const pl = p();
      const s = idFrom();
      if (!s || !T.readFrom([pl.inventory, pl.stash, pl.cube], s)) return false;
      it.identified = true;
      it.name = displayName(it);
      stats.identified++;
      recalc();
      return true;
    };
    /** worth identifying: gear of the hero's own, and charms and jewels (a player reads every blue and better there is) */
    const toIdentify = (it) => !isIdentified(it) && (wearable(it) || ['charm', 'jewel'].includes(baseOf(it).type));
    /**
     * Gear is judged anew when the hero's level changes (its requirements, its points); else each
     * piece once. What it keeps: potions for the belt and a few spare, its tomes and scrolls, gear to
     * identify or that it will wear once its points are in, charms that help, quest items. The rest
     * is junk to sell
     */
    const judged = new WeakSet();
    let judgedAt = 0;
    const keep = new WeakSet();
    const sortBag = (sell = null) => {
      const pl = p();
      if (judgedAt !== pl.level) {
        judgedAt = pl.level;
        wish.str = wish.dex = 0;
        for (const it of bag()) judged.delete(it);
      }
      for (const it of bag()) {
        if (judged.has(it)) continue;
        const bb = baseOf(it);
        if (bb.type === 'potion') {
          if (beltPotion(it) && g.beltInsert(it)) {
            pl.inventory.remove(it);
            continue;
          }
          if (beltPotion(it) && spares(kindOf(it)) < SPARE[kindOf(it)]) keep.add(it);
          else keep.delete(it);
          judged.add(it);
          continue;
        }
        // a loose scroll goes onto its tome, as a player drops it there (tomes.ts scrollIntoTome)
        const tome = T.isBookScroll(it) ? T.fillableTome(pl.inventory, it) : undefined;
        if (tome && T.scrollIntoTome(it, tome)) {
          pl.inventory.remove(it);
          continue;
        }
        if (isBook(it) || bb.noSell) {
          keep.add(it);
          judged.add(it);
          continue;
        }
        if (toIdentify(it)) {
          if (!identify(it)) {
            keep.add(it);
            continue;
          }
          if (it.rarity === 'unique') stats.uniques++;
          if (it.rarity === 'set') stats.sets++;
          if (it.rarity === 'rare') stats.rares++;
          if (it.rarity === 'magic') stats.magics++;
        }
        judged.add(it);
        if (wearable(it) && equip(it, sell)) continue;
        if ((wearable(it) && wouldSuit(it)) || goodCharm(it)) {
          keep.add(it);
          waiting.add(it);
        } else keep.delete(it);
      }
    };
    const junk = () => bag().filter((it) => !keep.has(it) && !baseOf(it).noSell);

    // ─────────── the merchant (src/items/vendor.ts, as the shop's UI trades: src/ui/inventory.ts) ───────────
    const tally = (k, n, gold) => {
      stats.bought[k] = (stats.bought[k] ?? 0) + n;
      stats.spent[k] = (stats.spent[k] ?? 0) + gold;
    };
    const sellOne = (it, fromBag = true) => {
      const pl = p();
      const v = V.sellPrice(g.shop, it, pl.tradeCtx());
      if (fromBag) pl.inventory.remove(it);
      pl.gold += v;
      V.shelveSold(g.shop, it);
      stats.sold++;
      stats.soldGold += v;
    };
    /** buy `it` off the shelf at its price: into the belt (a potion) or the bag; the item had, or null */
    const buy = (it, kind) => {
      const pl = p();
      const store = g.shop;
      const price = V.buyPrice(store, it, pl.tradeCtx());
      if (pl.gold < price) return null;
      const perm = store.perm.has(it);
      const got = perm ? V.takeFromStore(store, it) : it;
      const belted = baseOf(got).type === 'potion' && g.beltInsert(got);
      if (!belted && !pl.inventory.add(got)) return null;
      pl.gold -= price;
      if (!perm) V.takeFromStore(store, it);
      tally(kind, 1, price);
      return got;
    };
    const onShelf = (code) => g.shop.all().find((it) => it.baseId === code);
    /** a tome's charges bought in, one scroll at a time while the gold above `keepGold` lasts (vendor.ts buyIntoTome) */
    const fillTome = (code, upTo, keepGold) => {
      const pl = p();
      const scroll = onShelf(code);
      if (!scroll) return;
      for (let k = 0; k < 20; k++) {
        const tome = T.fillableTome(pl.inventory, scroll);
        if (!tome || T.tomeCharges(tome) >= upTo) return;
        if (pl.gold - V.buyPrice(g.shop, scroll, pl.tradeCtx()) < keepGold) return;
        const r = V.buyIntoTome(g.shop, scroll, pl.inventory, pl, pl.tradeCtx());
        if (!r?.n) return;
        tally(code, r.n, r.spent);
      }
    };
    /** a tome bought when the hero has none (its scrolls, if loose, go into it) */
    const getTome = (code, keepGold) => {
      const pl = p();
      if (bag().some((it) => it.baseId === code)) return;
      const t = onShelf(code);
      if (!t || pl.gold - V.buyPrice(g.shop, t, pl.tradeCtx()) < keepGold) return;
      const tome = buy(t, code);
      if (!tome) return;
      keep.add(tome);
      judged.add(tome);
      for (const s of bag().filter((x) => x !== tome && T.bookOf(x.baseId)?.tome === code && T.isBookScroll(x))) if (T.scrollIntoTome(s, tome)) pl.inventory.remove(s);
    };
    /** the belt filled with the best potions on the shelf: its share of mana potions, healing in the rest */
    const fillBelt = (keepGold) => {
      const pl = p();
      const rows = pl.beltRows();
      const best = (kind) => [5, 4, 3, 2, 1].map((n) => onShelf(`${kind}${n}`)).find(Boolean);
      const mpCols = Math.round(4 * build.manaShare);
      const cols = (kind) => pl.belt.filter((c) => c.length && c[0].baseId.startsWith(kind)).length;
      for (const kind of ['hp', 'mp']) {
        const want = kind === 'mp' ? mpCols : 4 - mpCols;
        const it = best(kind);
        if (!it) continue;
        for (let k = 0; k < 16; k++) {
          const sameCol = pl.belt.find((c) => c.length && c.length < rows && c[0].baseId === it.baseId);
          const empty = pl.belt.find((c) => !c.length);
          if (!sameCol && !(empty && cols(kind) < want)) break;
          if (pl.gold - V.buyPrice(g.shop, it, pl.tradeCtx()) < keepGold) break;
          const got = buy(it, kind);
          if (!got) break;
          if (pl.inventory.contains(got)) {
            // no column for it after all: kept as a spare
            keep.add(got);
            judged.add(got);
            break;
          }
        }
      }
    };
    /** spares for the bag past the belt (SPARE), while the gold above `keepGold` lasts */
    const buySpares = (keepGold) => {
      const pl = p();
      for (const kind of ['hp', 'mp']) {
        const it = [5, 4, 3, 2, 1].map((n) => onShelf(`${kind}${n}`)).find(Boolean);
        for (let k = 0; it && k < 12 && spares(kind) < SPARE[kind] && freeCells() > 6; k++) {
          if (pl.gold - V.buyPrice(g.shop, it, pl.tradeCtx()) < keepGold) break;
          const got = buy(it, kind);
          if (!got) break;
          keep.add(got);
          judged.add(got);
        }
      }
    };
    /** the shelf's gear that would do the hero most good for its price, while the gold above `keepGold` lasts */
    const buyGear = (keepGold) => {
      const pl = p();
      for (let k = 0; k < 4; k++) {
        const ctx = pl.tradeCtx();
        let best = null;
        for (const it of g.shop.all()) {
          if (!wearable(it) || !pl.meetsReq(it)) continue;
          const price = V.buyPrice(g.shop, it, ctx);
          if (pl.gold - price < keepGold) continue;
          const t = trial(it);
          if (!t || t.gain < 1.08) continue;
          const worth = (t.gain - 1) / Math.sqrt(price);
          if (!best || worth > best.worth) best = { it, worth, price, gain: t.gain };
        }
        if (!best) return;
        const got = buy(best.it, 'gear');
        if (!got) return;
        judged.add(got);
        if (!equip(got, sellOne)) {
          sellOne(got);
          return;
        }
      }
    };
    /** worn pieces mended, all of them that need it (the shop's 全部修理: vendor.ts repairAllList) */
    const repairAll = () => {
      const pl = p();
      const list = V.repairAllList(pl.equipment, pl.tradeCtx());
      if (!list.length) return;
      const total = list.reduce((n, r) => n + r.cost, 0);
      if (V.pay(pl, total)) {
        for (const r of list) repairItem(r.item);
        stats.repairs += total;
      } else {
        // short of gold: the worst first, as far as the gold goes (vendor.ts repairOne)
        for (const r of list.sort((a, c) => (a.item.dur ?? 0) / (a.item.maxDur || 1) - (c.item.dur ?? 0) / (c.item.maxDur || 1))) {
          const done = V.repairOne(r.item, pl, pl.tradeCtx());
          if (done) stats.repairs += done.spent;
          if (!done?.full) break;
        }
      }
      recalc();
    };
    /**
     * At the merchant: what is unknown read, upgrades worn, junk sold; repairs first, then the belt,
     * a tome of town portal with a few charges, a tome of identify, gear off the shelf with what is
     * left over a reserve, and the tomes topped up once the hero is well off
     */
    const trade = () => {
      const pl = p();
      sortBag(sellOne);
      for (const it of junk()) sellOne(it);
      repairAll();
      const reserve = 150 + 60 * pl.level;
      fillBelt(0);
      getTome('tbk', 0);
      fillTome('tsc', 3, 0);
      // no tome yet: a loose scroll or two to get home with
      for (let k = 0; k < 2 && tpCharges() < 2 && !bag().some((it) => it.baseId === 'tbk'); k++) {
        const s = onShelf('tsc');
        if (!s || !buy(s, 'tsc')) break;
      }
      buySpares(reserve / 3);
      getTome('ibk', reserve / 2);
      fillTome('isc', 3, reserve / 2);
      fillTome('tsc', 8, reserve);
      // gear with what is left past the next trip's potions and repairs
      buyGear(100 + 30 * pl.level);
      fillTome('tsc', 20, reserve * 3);
      fillTome('isc', 10, reserve * 3);
      // what the new tome can read now
      sortBag(sellOne);
      for (const it of junk()) sellOne(it);
    };

    // ─────────── going about ───────────
    let idx = 0;
    let homebound = false;
    /** out by town portal now, nearly dead and nothing to drink */
    let chicken = false;
    let leftTown = -Infinity;
    let campDone = false;
    /**
     * Why it should go to town: the reward, gear worn thin, hurt with nothing to drink (a hero's life
     * doesn't come back by itself in D2; the merchant heals for nothing: Game.vendorHeal), potions
     * gone, the bag full of things to sell, things to identify and nothing to read
     */
    const needTown = () => {
      if (rewardPending()) return 'reward';
      if (wornThin()) return 'repair';
      if (potions('hp') === 0 && p().life < p().stats.maxLife / 2) return 'heal';
      if (simTime - leftTown < 45) return null;
      const pl = p();
      if (potions('hp') === 0 && pl.gold >= 60) return 'potions';
      if (!build.melee && potions('mp') === 0 && pl.mana < pl.stats.maxMana / 3 && pl.gold >= 200 && simTime - leftTown > 150) return 'mana';
      if (freeCells() < 8 && junk().length >= 2) return 'bag';
      if (bag().filter(toIdentify).length >= 3 && !idFrom() && pl.gold >= 400) return 'identify';
      return null;
    };
    /** a route's area done with: the camp once Akara is heard, the den once cleared, the rest as soon as the hero goes on */
    const areaDone = (a) => (a.id === CAMP_AREA ? campDone : a.id === DEN_OF_EVIL ? denDone() : true);
    /** where it is going: the camp, else its route's area until that is done, then the next */
    const goal = () => {
      if (homebound) return CAMP_AREA;
      const cur = route[Math.min(idx, endIdx)];
      if (!areaDone(cur)) return cur.id;
      return route[idx + 1]?.id ?? cur.id;
    };
    /** this area's waypoint, if it has one there */
    const waypointHere = () => g.level.objects.find((ob) => ob.kind === 'waypoint' && g.level.areaAt(ob.pos.x, ob.pos.z).id === g.area.id);
    /** by waypoint to `to` (its list, the panel the game opens: Game.travel) once the hero has used it */
    let waypointTo = null;
    const touched = new Set();
    const byWaypoint = (to) => {
      const wp = waypointHere();
      if (!wp) return false;
      waypointTo = to;
      p().intent = { kind: 'interact', obj: wp };
      return true;
    };
    /** walk toward area `to`: into it on this map, else by the stairs or exit that lead there, else up out of where it is */
    const walkTo = (to) => {
      const L = g.level;
      const pl = p();
      let way = L.wayTo(to, pl.pos);
      for (let k = route.length - 1; !way && k >= 0; k--) if (route[k].id !== g.area.id) way = L.wayTo(route[k].id, pl.pos);
      if (!way && to !== CAMP_AREA) way = L.wayTo(CAMP_AREA, pl.pos);
      if (way?.obj) pl.intent = { kind: 'interact', obj: way.obj };
      else if (way) pl.intent = { kind: 'move', point: way.pos };
      else {
        // nothing here leads anywhere on the way: as by waypoint (a stall the results show)
        stats.jumps++;
        stats.timeline.push(`JUMP to ${to} from ${g.area.key} t=${Math.round(simTime)}`);
        g.travelToArea(to);
      }
      return way;
    };
    /**
     * Home to the camp: through its own portal, by the area's waypoint when it stands near (a scroll
     * saved), else a portal read from a scroll or the tome, else by that waypoint from further off,
     * else on foot
     */
    const goHome = () => {
      const pl = p();
      const L = g.level;
      const mine = g.portalLevel === L ? L.objects.find((ob) => ob.kind === 'portal' && !L.inTown(ob.pos)) : undefined;
      if (mine && Math.hypot(mine.pos.x - pl.pos.x, mine.pos.z - pl.pos.z) < 20) {
        pl.intent = { kind: 'interact', obj: mine };
        return 'portal';
      }
      const near = waypointHere();
      if (!chicken && near && pl.waypoints.includes(g.area.id) && Math.hypot(near.pos.x - pl.pos.x, near.pos.z - pl.pos.z) < 25) {
        byWaypoint(CAMP_AREA);
        return 'waypoint';
      }
      if (tpCharges() > 0) {
        if (pl.state === 'idle' || pl.state === 'move') {
          pl.intent = null;
          g.castTownPortal();
          stats.portals++;
        }
        return 'casting';
      }
      const wp = waypointHere();
      if (wp && pl.waypoints.includes(g.area.id) && Math.hypot(wp.pos.x - pl.pos.x, wp.pos.z - pl.pos.z) < 60) {
        byWaypoint(CAMP_AREA);
        return 'waypoint';
      }
      walkTo(CAMP_AREA);
      return 'walk';
    };
    /**
     * Out of the camp toward `to`: through the hero's portal when it leads there (or to the area
     * before it, on another map: back to the trial floor it came from), by waypoint when it's had,
     * else on foot; a place this map has no way to (the trial ground, which the debug panel opens) by jump
     */
    const leaveTown = (to) => {
      const pl = p();
      const L = g.level;
      const portal = L.objects.find((ob) => ob.kind === 'portal' && L.inTown(ob.pos));
      const onMap = (id) => L.areas.includes(id);
      if (portal && (portal.dest === to || (!onMap(to) && routeIdx(portal.dest) >= 0 && routeIdx(portal.dest) <= routeIdx(to)))) {
        pl.intent = { kind: 'interact', obj: portal };
        return 'portal';
      }
      if (to !== CAMP_AREA && pl.waypoints.includes(to) && byWaypoint(to)) return 'waypoint';
      if (!onMap(to) && !L.objects.some((ob) => (ob.kind === 'stairs' || ob.kind === 'exit') && ob.dest === to)) {
        stats.jumps++;
        stats.timeline.push(`JUMP to ${to} from the camp t=${Math.round(simTime)}`);
        g.travelToArea(to);
        return 'jump';
      }
      walkTo(to);
      return 'walk';
    };
    /** the hero in the camp: to the merchant (her heal, a quest's line, trade), then on its way */
    let town = null;
    const townStep = () => {
      const pl = p();
      if (!town) {
        town = { step: 'npc', t0: simTime };
        homebound = chicken = false;
      }
      if (simTime - town.t0 > 120) town.step = 'leave';
      if (met) {
        const { obj, opening } = met;
        met = null;
        // her line heard (a quest given, a reward handed over), then her trade, then she is left
        if (opening) {
          g.npcSpoke(opening);
          if (opening.id === 'intro') event('quest given');
          if (opening.id === 'reward') event('den rewarded');
        }
        spend();
        if (obj.kind === 'vendor') trade();
        g.npcLeft(obj);
        if (town.step === 'npc') town.step = 'leave';
        campDone = campDone || denGiven();
        return;
      }
      if (town.step === 'npc') {
        const v = g.level.objects.find((ob) => ob.kind === 'vendor' && g.level.inTown(ob.pos));
        if (!v) town.step = 'leave';
        else if (!pl.intent) pl.intent = { kind: 'interact', obj: v };
        return;
      }
      campDone = true;
      if (!pl.intent) leaveTown(goal());
    };

    // --level: as if played there, its points spent and wearing the best of a pile of gear rolled at it, with a tome of town portal
    if (o.level > 1) {
      const pl = p();
      pl.xp = xpForLevel(Math.min(99, o.level));
      pl.gainXp(0);
      pl.gold += pl.level * 300;
      spend();
      for (let i = 0; i < 60; i++) {
        // identified, as gear found and worn on the way would be
        const it = rollEquipment(pl.level, { quality: 2, identified: true });
        if (pl.inventory.add(it) && !equip(it)) pl.inventory.remove(it);
      }
      for (const it of bag()) if (wearable(it)) pl.inventory.remove(it);
      const tome = createItem('tbk');
      tome.qty = 10;
      pl.inventory.add(tome);
      pl.life = pl.stats.maxLife;
      pl.mana = pl.stats.maxMana;
    }
    if (start.id !== CAMP_AREA) {
      g.travelToArea(start.id);
      campDone = true;
    }
    sampleFoes();

    let lastArea = g.area.id;
    let seenArea = g.area.id;
    let diedAt = -Infinity;
    let areaStart = 0;
    let areaDeaths = 0;
    let potionCd = 0;
    let think = 0;
    let stuck = 0;
    let lastPos = { x: 0, z: 0 };
    const pickTries = new WeakMap();
    const groundVerdict = new WeakMap();
    const skipGround = new WeakSet();
    // stall diagnostics: no real progress for 30s of sim time
    let stallAnchor = { x: 0, z: 0 };
    let stallSince = 0;
    let stallsLogged = 0;
    let lastPick = '';
    /** an area left behind (or the last one cleared): how long it took and how the hero stands after it */
    const record = (area) => {
      const pl = p();
      const d = pl.stats;
      const w = pl.equipment.weapon;
      stats.levels.push({
        area: area.key, lvl: pl.level, secs: Math.round(simTime - areaStart), t: Math.round(simTime), deaths: stats.deaths, areaDeaths, gold: pl.gold, kills: stats.kills,
        life: Math.round(d.maxLife), def: Math.round(d.def), res: Math.round((d.res.fire + d.res.cold + d.res.light + d.res.poison) / 4),
        dmg: Math.round(((d.wMin + d.wMax) / 2) * (1 + d.dmgPct / 100)), hit: Math.round(hit()), attack: mainAttack(), ar: Math.round(d.ar), worn: worn().length,
        weapon: w ? `${displayName(w)} [${w.rarity}]` : '-', magicWorn: worn().filter((x) => !['normal', 'superior', 'low'].includes(x.rarity)).length,
      });
    };
    const near = () => g.level.monsters.filter((m) => !m.dead).map((m) => ({ m, d: Math.hypot(m.pos.x - p().pos.x, m.pos.z - p().pos.z) })).sort((a, c) => a.d - c.d);
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
    /**
     * A thing on the ground worth having: gold, potions it has room for, its scrolls and tomes,
     * anything magic or better, runes, gems, charms; plain gear it would wear, or while the bag has
     * room to carry it to the merchant
     */
    const worthHaving = (gi) => {
      if (gi.gold > 0) return true;
      const it = gi.item;
      if (!it || skipGround.has(gi)) return false;
      const pl = p();
      const bb = baseOf(it);
      const belt = bb.type === 'potion' && pl.belt.some((c) => c.length < pl.beltRows() && (!c.length || c[0].baseId === it.baseId));
      if (!belt && !pl.inventory.findSpace(it)) return false;
      if (bb.type === 'potion') return beltPotion(it) && (belt || potions(it.baseId.slice(0, 2)) < 4);
      if (isBook(it)) return true;
      if (!['normal', 'superior', 'low'].includes(it.rarity) || ['rune', 'gem', 'charm', 'jewel'].includes(bb.type)) return true;
      if (it.rarity === 'low' || !wearable(it)) return false;
      let v = groundVerdict.get(gi);
      if (!v || v.lvl !== pl.level) groundVerdict.set(gi, (v = { lvl: pl.level, better: pl.meetsReq(it) && !!trial(it) }));
      return v.better || freeCells() > 14;
    };
    /** the den's monsters that count for the quest (denofevil.ts countsInDen), nearest first */
    const denLeft = () => {
      const L = g.level;
      return near().filter(({ m }) => m.def.row.align === 0 && !m.def.row.neverCount && L.areaAt(m.pos.x, m.pos.z).id === DEN_OF_EVIL);
    };

    const fieldStep = (pl, cur) => {
      const L = g.level;
      const ns = near();
      // nearly dead with nothing to drink: out by town portal, as a player would
      if (pl.life < pl.stats.maxLife * 0.25 && potions('hp') === 0 && (tpCharges() > 0 || g.portalLevel === L) && !chicken) {
        homebound = chicken = true;
        pl.intent = null;
        stats.chickens++;
        stats.timeline.push(`CHICKEN in ${g.area.key} t=${Math.round(simTime)} lvl ${pl.level}`);
      }
      if (!homebound) {
        const why = needTown();
        if (why) {
          homebound = true;
          pl.intent = null;
          stats.timeline.push(`TOWN (${why}) from ${g.area.key} t=${Math.round(simTime)} lvl ${pl.level} gold ${pl.gold} tp ${tpCharges()}`);
        }
      }
      // buffs as they wear off
      if (pl.state === 'idle' || pl.state === 'move') {
        for (const [id, left] of build.buffs) if (pl.skillLevel(id) > 0 && !(pl[left] > 0) && pl.mana >= mana(id)) { g.useSkillAt(id, null, { ...pl.pos }, true); lastPick = `buff:${id}`; break; }
      }
      if (!(pl.state === 'idle' || pl.state === 'move')) return;
      if (chicken) {
        if (!pl.intent || pl.intent.kind !== 'interact') lastPick = 'chicken:' + goHome();
        return;
      }
      const fighting = pl.intent && pl.intent.kind === 'attack' && !pl.intent.target.dead;
      // what is near is fought, even on the way home (a portal is read standing)
      if (ns.length && ns[0].d < 7 && !fighting) {
        pl.intent = engage(ns[0].m, ns[0].d);
        lastPick = 'near-attack:' + (pl.intent.skill ?? 'closing in');
        return;
      }
      if (fighting) {
        const t = pl.intent.target;
        const dt = Math.hypot(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z);
        // a spell held on a target goes on being tried with no mana for it: the weapon then
        if (pl.intent.skill !== 'attack' && pl.mana < mana(pl.intent.skill)) {
          pl.intent = engage(t, dt);
          lastPick = 'no mana:' + (pl.intent.skill ?? 'closing in');
        } else if (ns.length && ns[0].m !== t && ns[0].d < 2.5 && dt > 3.5) {
          pl.intent = engage(ns[0].m, ns[0].d);
          lastPick = 'retarget:' + (pl.intent.skill ?? 'closing in');
        }
        return;
      }
      if (homebound) {
        if (!pl.intent || pl.intent.kind === 'pickup') lastPick = 'home:' + goHome();
        return;
      }
      if (pl.intent) return;
      // loot
      const loot = L.ground
        .filter((gi) => Math.hypot(gi.pos.x - pl.pos.x, gi.pos.z - pl.pos.z) < 9 && worthHaving(gi))
        .sort((a, c) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) - Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z))[0];
      if (loot && (!ns.length || ns[0].d > 6)) {
        const tries = (pickTries.get(loot) ?? 0) + 1;
        pickTries.set(loot, tries);
        // one it can't get to (behind something) is left
        if (tries > 80) skipGround.add(loot);
        pl.intent = { kind: 'pickup', ground: loot };
        lastPick = loot.gold ? `gold ${loot.gold}` : `pickup ${displayName(loot.item)}`;
        return;
      }
      // this area's waypoint, touched as it is found (a player always takes one), Cold Plains' gone
      // for first, fighting only what comes at the hero on the way
      const wp = waypointHere();
      if (wp && !pl.waypoints.includes(g.area.id) && !touched.has(g.area.id) && (g.area.id === COLD_PLAINS || Math.hypot(wp.pos.x - pl.pos.x, wp.pos.z - pl.pos.z) < 30)) {
        pl.intent = { kind: 'interact', obj: wp };
        lastPick = 'waypoint';
        return;
      }
      // further off, what is in the area it is about or going to (passing through another, it
      // doesn't go hunting there: on the way to the den, not into Cold Plains)
      const about = [cur.id, goal()];
      const far = ns.find(({ m, d }) => d < 40 && about.includes(L.areaAt(m.pos.x, m.pos.z).id));
      if (far) {
        pl.intent = engage(far.m, far.d);
        lastPick = 'far-attack:' + (pl.intent.skill ?? 'closing in');
        return;
      }
      // the den: every monster in it that counts, however far, until the quest is done
      if (g.area.id === DEN_OF_EVIL && denLive() && !denDone()) {
        const left = denLeft()[0];
        if (left) {
          pl.intent = left.d < 40 ? engage(left.m, left.d) : { kind: 'move', point: { ...left.m.pos } };
          lastPick = `den: ${den().remaining} left`;
          return;
        }
      }
      // a superunique of the area (Bishibosh in Cold Plains) sought out
      const su = L.monsters.find((m) => !m.dead && m.superUnique && g.area.id === cur.id && L.areaAt(m.pos.x, m.pos.z).id === g.area.id);
      if (su) {
        pl.intent = { kind: 'move', point: { ...su.pos } };
        lastPick = `seek ${su.superUnique}`;
        return;
      }
      if (idx === endIdx && !finish && g.area.id === cur.id) {
        // the last area there is: on to whatever is left alive in it, however far; done when nothing is
        const left = ns.find(({ m }) => L.areaAt(m.pos.x, m.pos.z).id === cur.id);
        if (left) pl.intent = { kind: 'move', point: { ...left.m.pos } };
        else {
          record(cur);
          idx = endIdx + 1;
        }
        lastPick = 'hunt';
        return;
      }
      const to = goal();
      if (to === g.area.id) return;
      walkTo(to);
      lastPick = `way:${to}`;
    };

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
          for (const m of around) { const k = `${m.def.id}/${m.rank}${m.mods.length ? '(' + m.modText() + ')' : ''}`; desc[k] = (desc[k] ?? 0) + 1; }
          stats.timeline.push(`death in ${g.area.key} lvl ${pl.level} t=${Math.round(simTime)} by ${JSON.stringify(desc)} proj=${g.level.projectiles.length}`);
          stats.deathList.push({ area: cur.key, lvl: pl.level, causes: desc, proj: g.level.projectiles.length });
          g.respawn();
          diedAt = simTime;
          // a player walks back for the body (D2: it keeps the gear and some experience); the bot takes it at once
          for (const c of pl.corpses) {
            if (c.xp) pl.gainXp(c.xp);
            c.xp = 0;
            takeBody(pl, c, (it) => g.beltInsert(it));
          }
          pl.corpses = pl.corpses.filter((c) => bodyItems(c).length);
          recalc();
          areaDeaths++;
          homebound = chicken = false;
          town = null;
          // stuck on a floor: do what a player does and start a fresh game of it (a new layout)
          if (areaDeaths % 4 === 0) g.lastDungeon = null;
          continue;
        }
        potionCd -= STEP;
        think -= STEP;
        if (potionCd <= 0 && pl.life < pl.stats.maxLife * 0.45) { if (drink('hp')) potionCd = 1.2; }
        if (potionCd <= 0 && thirsty() && !g.level.inTown(pl.pos)) { if (drink('mp')) potionCd = 1.5; }
        if (think <= 0) {
          think = 0.1;
          if (spend()) for (const it of waiting) judged.delete(it);
          sortBag();
          if (panel === 'waypoint') {
            panel = null;
            // touched: one this build doesn't keep (a trial floor's) isn't gone for again
            touched.add(g.area.id);
            const to = waypointTo;
            waypointTo = null;
            if (to !== null && to !== g.area.id && pl.waypoints.includes(to)) {
              stats.waypointTrips++;
              g.travel(to);
            }
          }
          if (g.level.inTown(pl.pos)) townStep();
          else {
            if (town) {
              town = null;
              leftTown = simTime;
            }
            fieldStep(pl, cur);
          }
          // stuck detection
          if (Math.hypot(pl.pos.x - lastPos.x, pl.pos.z - lastPos.z) < 0.05 && pl.state !== 'attack' && pl.state !== 'cast') stuck += 0.1; else stuck = 0;
          lastPos = { ...pl.pos };
          if (stuck > 6) {
            if (pl.intent?.kind === 'pickup') skipGround.add(pl.intent.ground);
            pl.intent = null;
            stuck = 0;
            const ns = near();
            const t = ns[Math.floor(Math.random() * Math.min(5, ns.length))];
            if (t && t.d < 40) pl.intent = engage(t.m, t.d);
          }
        }
        const hadWps = pl.waypoints.length;
        g.update(STEP);
        if (pl.waypoints.length > hadWps) event(`waypoint ${g.area.key}`);
        if (g.area.id !== seenArea) {
          // a trip home, however it went (a death's isn't one)
          if (g.area.kind === 'town' && areaDef(seenArea)?.kind !== 'town' && !pl.dead && simTime - diedAt > 1) stats.townTrips++;
          seenArea = g.area.id;
          if (g.area.id === DEN_OF_EVIL && !stats.events.some((e) => e.ev === 'den entered')) event('den entered');
          if (g.area.id === COLD_PLAINS && !stats.events.some((e) => e.ev === 'cold plains entered')) event('cold plains entered');
          sampleFoes();
        }
        if (!denCleared && denOnRoute && qHas(QFLAG.REWARDPENDING)) {
          denCleared = true;
          event('den cleared');
        }
        if (Math.hypot(pl.pos.x - stallAnchor.x, pl.pos.z - stallAnchor.z) > 2) {
          stallAnchor = { ...pl.pos };
          stallSince = simTime;
        } else if (simTime - stallSince > 30 && stallsLogged < 4 && !g.level.inTown(pl.pos)) {
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
          stats.timeline.push(`STALL in ${g.area.key} t=${Math.round(simTime)} pos=${pl.pos.x.toFixed(1)},${pl.pos.z.toFixed(1)} state=${pl.state} intent=${it?.kind}${it?.target ? '(' + it.target.def.id + (it.target.dead ? ',dead' : '') + ')' : ''} tgt=${tgt ? tgt.x.toFixed(1) + ',' + tgt.z.toFixed(1) : '-'} path=${pl.path?.length ?? 0} mana=${Math.round(pl.mana)} lastPick=${lastPick}\n      near: ${near().slice(0, 3).map(({ m, d }) => `${m.def.id}@${d.toFixed(1)} los=${map.los(pl.pos, m.pos)} st=${m.state} tile=${map.get(Math.floor(m.pos.x), Math.floor(m.pos.z))}`).join(' | ')}\n      ${grid.join('\n      ')}`);
        }
        // into the route's next area with this one done (walking through one further on, or into
        // Cold Plains before the den, doesn't count)
        const at = g.area.id === lastArea ? -1 : route.findIndex((a, k) => k > idx && a.id === g.area.id);
        lastArea = g.area.id;
        if (at === idx + 1 && areaDone(cur)) {
          record(cur);
          idx = at;
          areaStart = simTime;
          areaDeaths = 0;
        }
      }
    };
    window.__runChunk = runChunk;
    window.__botDone = () => idx > endIdx || simTime > o.maxMinutes * 60;
    window.__botStatus = () => ({ area: route[Math.min(idx, route.length - 1)].key, at: g.area.key, simTime: Math.round(simTime), lvl: p().level, life: Math.round(p().life), max: p().stats.maxLife, deaths: stats.deaths, gold: p().gold, tp: tpCharges(), hp: potions('hp') });
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
    const eq = Object.fromEntries(Object.entries(pl.equipment).map(([k, v]) => [k, `${displayName(v)} [${v.rarity}]${v.maxDur ? ` ${v.dur}/${v.maxDur}` : ''}`]));
    const d = pl.stats;
    return { ...window.__bot, final: { cls: pl.cls, lvl: pl.level, life: d.maxLife, def: d.def, dmg: [d.wMin, d.wMax, d.dmgPct], ar: d.ar, res: d.res, gold: pl.gold, eq, base: pl.base, skills: pl.skills, belt: pl.belt.map((c) => c.length), bag: pl.inventory.items.map((x) => displayName(x.item)) } };
  });
  // a look at the hero as the run left it: the scene drawn again where it stands, its bag and gear open beside it
  await page.evaluate(() => {
    window.renderer.snapCamera();
    for (let i = 0; i < 3; i++) window.renderer.render(1 / 60, 1);
  });
  await page.keyboard.press('i');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.renderer.render(1 / 60, 1));
  await shot('bot-end');
  const { timeline, deathList, equipped, ...rest } = result;
  log(JSON.stringify(rest));
  log('equipped:\n  ' + equipped.join('\n  '));
  log('BOT_RESULT ' + JSON.stringify({ route: result.route, levels: result.levels, events: result.events, deathList, final: result.final, trips: { town: result.townTrips, portals: result.portals, waypoints: result.waypointTrips, jumps: result.jumps, identified: result.identified, sold: result.sold, soldGold: result.soldGold, repairs: result.repairs, bought: result.bought, spent: result.spent }, stalls: timeline.filter((t) => t.startsWith('STALL')).slice(0, 2), status: await page.evaluate(() => window.__botStatus()) }));
  const byArea = {};
  for (const t of deathList) byArea[t.area] = (byArea[t.area] ?? 0) + 1;
  log('deaths by area', JSON.stringify(byArea));
  log(timeline.join('\n'));
}
