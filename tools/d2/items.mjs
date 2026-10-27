// The items stage → src/data/d2x/: every base item (bows, throwing weapons and other classes' items
// too: they drop, sell and take sockets even where the hero cannot use them), the item types, magic
// and rare affixes for all item types, the quality tables, uniques, sets, runewords, runes and gems.
// The game does not read these files yet; the item system (A2) moves onto them.
import { list, numbered, record, rows, strings, tables, writeD2x } from './load.mjs';
import { exclude, glossaryOfficial, names } from './names.mjs';
import { SKILL_PROPS, coverage, propReader } from './props.mjs';
import { WARLOCK, WARLOCK_SETS, WARLOCK_TYPES, ladderOnly, latestSeason } from './scope.mjs';

/** the NPCs that have shop columns in the base tables, by their internal names */
const NPCS = ['Charsi', 'Gheed', 'Akara', 'Fara', 'Lysander', 'Drognan', 'Hratli', 'Alkor', 'Ormus', 'Elzix', 'Asheara', 'Cain', 'Halbu', 'Jamella', 'Larzuk', 'Malah', 'Anya'];
const SHOP_COLS = [['min', 'Min'], ['max', 'Max'], ['magicMin', 'MagicMin'], ['magicMax', 'MagicMax'], ['magicLvl', 'MagicLvl']];
const GEM_TYPES = { gema: 'amethyst', gemt: 'topaz', gems: 'sapphire', geme: 'emerald', gemr: 'ruby', gemd: 'diamond', gemz: 'skull' };
/** the item kinds QualityItems.txt can apply each superior mod to */
const QUALITY_ON = ['armor', 'weapon', 'shield', 'scepter', 'wand', 'staff', 'bow', 'boots', 'gloves', 'belt'];
const WARLOCK_ROW = '术士资料片新增（D2CE 无字串）';

export async function buildItems() {
  const [weaponsJ, armorJ, miscJ, itypesJ, prefixJ, suffixJ, autoJ, rarePreJ, rareSufJ, qualityJ, lowJ, uniqueJ, setItemsJ, setsJ, runesJ, gemsJ, beltsJ] =
    await tables('weapons', 'armor', 'misc', 'itemtypes', 'magicprefix', 'magicsuffix', 'automagic', 'rareprefix', 'raresuffix', 'qualityitems', 'lowqualityitems', 'uniqueitems', 'setitems', 'sets', 'runes', 'gems', 'belts');
  const S = await strings('item-names', 'item-runes', 'item-nameaffixes');
  const { prop, isWarlock, unknownSkills, skillOf } = await propReader();
  const cover = coverage();
  const season = latestSeason(uniqueJ, setItemsJ, runesJ);
  /** official names of the proper nouns: none of them may reach the generated data */
  const officialNames = new Set();
  const official = (key) => {
    if (S.zh[key]) officialNames.add(S.zh[key]);
    return S.zh[key];
  };
  const props = (r, max, code, param, min, maxCol) =>
    numbered(r, max, code).map((i) => prop(r[code(i)], r[param(i)], r[min(i)], r[maxCol(i)])).filter(Boolean);

  // ───────────────────────── item types ─────────────────────────
  // (the row "none" is a placeholder with no type name)
  const ITYPE = Object.fromEntries(rows(itypesJ).filter((r) => r.Code && r.ItemType).map((r) => [r.Code, r]));
  const typeOk = (c) => !!ITYPE[c] && !WARLOCK_TYPES.has(c);
  function ancestors(code, acc = new Set()) {
    if (!code || acc.has(code)) return acc;
    acc.add(code);
    const t = ITYPE[code];
    if (t) for (const p of [t.Equiv1, t.Equiv2]) ancestors(p, acc);
    return acc;
  }
  /** the class an item type is for, from the first type up its Equiv chain that names one */
  function clsOf(type) {
    for (const a of ancestors(type)) {
      const c = ITYPE[a]?.Class;
      if (c && c !== WARLOCK) return c;
    }
  }
  const itemTypes = {};
  for (const [code, t] of Object.entries(ITYPE)) {
    if (WARLOCK_TYPES.has(code)) {
      exclude('itemtypes', '术士资料片新增', code);
      continue;
    }
    const o = { name: t.ItemType };
    const up = [t.Equiv1, t.Equiv2].filter(typeOk);
    if (up.length) o.up = up;
    const loc = [...new Set([t.BodyLoc1, t.BodyLoc2].filter(Boolean))];
    if (loc.length) o.bodyLoc = loc;
    if (t.Class && t.Class !== WARLOCK) o.cls = t.Class;
    // daggers got the Warlock's staff mods with the expansion
    if (t.StaffMods && t.StaffMods !== WARLOCK) o.staffMods = t.StaffMods;
    o.rarity = t.Rarity ?? 0;
    o.sockets = [t.MaxSockets1 ?? 0, t.MaxSockets2 ?? 0, t.MaxSockets3 ?? 0];
    o.socketLvls = [t.MaxSocketsLevelThreshold1 ?? 25, t.MaxSocketsLevelThreshold2 ?? 40];
    const flags = { tc: t.TreasureClass, canRare: t.Rare, normalOnly: t.Normal, magicOnly: t.Magic, throwable: t.Throwable, beltable: t.Beltable, stacks: t.AutoStack, repair: t.Repair, equip: t.Body };
    for (const [k, v] of Object.entries(flags)) if (v) o[k] = true;
    if (t.Shoots) o.shoots = t.Shoots;
    if (t.Quiver) o.quiver = t.Quiver;
    if (t.StorePage) o.store = t.StorePage;
    itemTypes[code] = o;
  }

  // ───────────────────────── base items ─────────────────────────
  const baseNames = names('bases');
  const BELT_SLOTS = Object.fromEntries(Object.entries(beltsJ).map(([i, b]) => [i, b.numboxes]));
  const runeNum = (code) => +code.slice(1);
  const renamed = new Set();
  /** who stocks the item: an NPC with no counts does not, whatever its MagicLvl (255 = the default) */
  function shop(r) {
    const o = {};
    for (const n of NPCS) {
      if (!SHOP_COLS.some(([k, col]) => k !== 'magicLvl' && r[n + col] > 0)) continue;
      const s = {};
      for (const [k, col] of SHOP_COLS) if (r[n + col] !== undefined) s[k] = r[n + col];
      o[n.toLowerCase()] = s;
    }
    return Object.keys(o).length ? o : undefined;
  }
  /** generic base names keep the official name; proper nouns in them come from bases.json */
  function baseName(r, en) {
    if (r.type === 'rune') return `${runeNum(r.code)} 号符文`;
    if (baseNames.has(r.code)) {
      renamed.add(r.code);
      return baseNames.get(r.code, en, official(r.namestr));
    }
    return S.zh[r.namestr];
  }
  const BASE = {};
  function base(kind, r) {
    if (!r.code) return;
    if (!typeOk(r.type)) {
      exclude(kind, WARLOCK_TYPES.has(r.type) ? '术士资料片新增' : '未知类型', r.code);
      return;
    }
    const en = S.en[r.namestr] ?? r.name;
    const name = baseName(r, en);
    // rows with no official string and no name of ours: unused leftovers and Warlock-era materials
    if (!name) return exclude(kind, 'D2CE 无字串（术士资料片新增或未用的行）', r.code);
    const o = { code: r.code, name, en, type: r.type };
    if (r.type2) o.type2 = r.type2;
    o.w = r.invwidth;
    o.h = r.invheight;
    o.qlvl = r.level ?? 0;
    o.reqLvl = r.levelreq ?? 0;
    if (r.reqstr) o.reqStr = r.reqstr;
    if (r.reqdex) o.reqDex = r.reqdex;
    const cls = clsOf(r.type);
    if (cls) o.cls = cls;
    // normal, exceptional and elite versions of the same base (quest weapons have none)
    if (r.normcode && r.ubercode && r.ultracode) {
      o.tiers = [r.normcode, r.ubercode, r.ultracode];
      o.tier = Math.max(0, o.tiers.indexOf(r.code));
    }
    o.rarity = r.rarity ?? 0;
    o.spawnable = !!r.spawnable;
    o.cost = r.cost ?? 0;
    if (r['gamble cost']) o.gambleCost = r['gamble cost'];
    if (r.durability) o.dur = r.durability;
    if (r.nodurability) o.noDur = true;
    if (r.gemsockets) {
      o.sockets = r.gemsockets;
      o.gemType = r.gemapplytype ?? 0;
    }
    if (r['magic lvl']) o.magicLvl = r['magic lvl'];
    if (r['auto prefix']) o.autoPrefix = r['auto prefix'];
    if (r.stackable) o.stack = [r.minstack ?? 0, r.maxstack ?? 0, r.spawnstack ?? 0];
    if (r.quest) o.quest = r.quest;
    if (r.questdiffcheck) o.questDiff = true;
    const up = [r.NightmareUpgrade, r.HellUpgrade];
    if (up.some((c) => c && c !== 'xxx')) o.upgrade = up.map((c) => (c && c !== 'xxx' ? c : null));
    if (r.lightradius) o.light = r.lightradius;
    if (r.missiletype) o.missile = r.missiletype;
    if (kind === 'weapons') {
      if (r.maxdam) o.dmg1 = [r.mindam ?? 0, r.maxdam];
      if (r['2handed']) {
        o.twoHanded = true;
        o.dmg2 = [r['2handmindam'] ?? 0, r['2handmaxdam'] ?? 0];
        if (r['1or2handed']) o.oneOrTwo = true;
      }
      if (r.maxmisdam) o.throwDmg = [r.minmisdam ?? 0, r.maxmisdam];
      o.wsm = r.speed ?? 0;
      o.wclass = r.wclass;
      if (r['2handedwclass'] && r['2handedwclass'] !== r.wclass) o.wclass2 = r['2handedwclass'];
      o.hitClass = r['hit class'];
      if (r.rangeadder) o.range = r.rangeadder;
      if (r['*quivered']) o.quivered = true;
    } else if (kind === 'armor') {
      o.ac = [r.minac ?? 0, r.maxac ?? 0];
      if (r.block) o.block = r.block;
      if (r.speed) o.speed = r.speed;
      // shields smite and boots kick with these
      if (r.maxdam) o.dmg = [r.mindam ?? 0, r.maxdam];
      if (r.type === 'belt') o.beltSlots = BELT_SLOTS[r.belt ?? 0];
    } else {
      if (r.belt) o.beltable = true;
      if (r.autobelt) o.autobelt = true;
      if (r.useable) o.useable = true;
      if (r.pSpell > 0) o.spell = r.pSpell;
      const st = numbered(r, 2, (i) => `stat${i}`).map((i) => [r[`stat${i}`], r[`calc${i}`] ?? 0]);
      if (st.length) o.stats = st;
      if (r.len) o.len = r.len;
      if (r.state) o.state = r.state;
      const cures = [r.cstate1, r.cstate2].filter(Boolean);
      if (cures.length) o.cures = cures;
      if (r.BetterGem && r.BetterGem !== 'non') o.next = r.BetterGem;
    }
    if (kind !== 'misc') {
      if (r.StrBonus) o.strBonus = r.StrBonus;
      if (r.DexBonus) o.dexBonus = r.DexBonus;
    }
    const s = shop(r);
    if (s) o.shop = s;
    BASE[r.code] = o;
    return o;
  }
  const weapons = rows(weaponsJ).map((r) => base('weapons', r)).filter(Boolean);
  const armor = rows(armorJ).map((r) => base('armor', r)).filter(Boolean);
  const misc = rows(miscJ).map((r) => base('misc', r)).filter(Boolean);

  // ───────────────────────── magic affixes and automagic ─────────────────────────
  const prefixNames = names('prefixes');
  const suffixNames = names('suffixes');
  function affix(where, idx, r, nm) {
    if (!r.Name) return;
    if (S.zh[r.Name] === undefined) return exclude(where, WARLOCK_ROW, idx);
    if (r.classspecific === WARLOCK) return exclude(where, '术士专属', idx);
    const ps = props(r, 3, (i) => `mod${i}code`, (i) => `mod${i}param`, (i) => `mod${i}min`, (i) => `mod${i}max`);
    if (ps.some(isWarlock)) return exclude(where, '术士技能', idx);
    const all = numbered(r, 7, (i) => `itype${i}`).map((i) => r[`itype${i}`]);
    if (!all.length) return exclude(where, '没有物品类型（未用的行）', idx);
    const itypes = all.filter(typeOk);
    if (!itypes.length) return exclude(where, '只用于术士物品', idx);
    const n = (typeof nm === 'function' ? nm(r.Name) : nm).get(r.Name, S.en[r.Name], official(r.Name));
    if (!n) return;
    const a = { id: +idx, name: n, en: S.en[r.Name], level: r.level ?? 0 };
    if (r.maxlevel) a.maxLevel = r.maxlevel;
    a.reqLvl = r.levelreq ?? 0;
    // a hero of this class needs classlevelreq instead (D2MOO ITEMS_GetLevelRequirement): the charged
    // skill suffixes ask less of the class whose skill they carry. No hero is a Warlock.
    if (r.class && r.class !== WARLOCK) {
      a.reqCls = r.class;
      a.reqClsLvl = r.classlevelreq ?? 0;
    }
    a.group = r.group ?? 0;
    a.freq = r.frequency ?? 0;
    a.spawnable = !!r.spawnable;
    if (r.rare) a.rare = true;
    if (r.classspecific) a.cls = r.classspecific;
    a.itypes = itypes;
    const etypes = numbered(r, 5, (i) => `etype${i}`).map((i) => r[`etype${i}`]).filter(typeOk);
    if (etypes.length) a.etypes = etypes;
    a.props = ps;
    if (r.multiply) a.priceMul = r.multiply;
    if (r.add) a.priceAdd = r.add;
    cover.add(where, ps);
    return a;
  }
  const affixes = (where, t, nm) => Object.entries(t).map(([i, r]) => affix(where, i, r, nm)).filter(Boolean);
  const prefixes = affixes('magicprefix', prefixJ, prefixNames);
  const suffixes = affixes('magicsuffix', suffixJ, suffixNames);
  // automagic rows reuse the prefix and suffix names
  const automagic = affixes('automagic', autoJ, (n) => (prefixNames.has(n) || !suffixNames.has(n) ? prefixNames : suffixNames));

  // ───────────────────────── rare names ─────────────────────────
  function rareWords(where, t, nm) {
    const out = [];
    // all classic rows; a few have no D2CE string, so the names file supplies the English
    for (const [idx, r] of Object.entries(t)) {
      if (!r.name) continue;
      const en = S.en[r.name] ?? nm.en(r.name);
      const n = nm.get(r.name, en, official(r.name));
      if (!n) continue;
      const o = { id: +idx, name: n, en };
      o.itypes = numbered(r, 7, (i) => `itype${i}`).map((i) => r[`itype${i}`]).filter(typeOk);
      const et = numbered(r, 4, (i) => `etype${i}`).map((i) => r[`etype${i}`]).filter(typeOk);
      if (et.length) o.etypes = et;
      out.push(o);
    }
    return out;
  }
  const rarePrefixes = rareWords('rareprefix', rarePreJ, names('rare-prefixes'));
  const rareSuffixes = rareWords('raresuffix', rareSufJ, names('rare-suffixes'));

  // ───────────────────────── superior and low quality ─────────────────────────
  const quality = Object.entries(qualityJ).map(([idx, r]) => {
    const ps = props(r, 2, (i) => `mod${i}code`, (i) => `mod${i}param`, (i) => `mod${i}min`, (i) => `mod${i}max`);
    cover.add('qualityitems', ps);
    return { id: +idx, on: QUALITY_ON.filter((k) => r[k]), props: ps };
  });
  // the low-quality prefixes are plain words ("Crude"): official names
  const lowQuality = Object.entries(lowJ).map(([idx, key]) => {
    if (!S.zh[key]) throw new Error(`low quality ${key}: no official string`);
    return { id: +idx, name: S.zh[key], en: S.en[key] };
  });

  // ───────────────────────── uniques ─────────────────────────
  const uniqueNames = names('uniques');
  const uniques = [];
  for (const r of rows(uniqueJ)) {
    if (!r.code) continue; // the table's section-divider rows
    if (S.zh[r.index] === undefined) {
      exclude('uniqueitems', WARLOCK_ROW, r.index);
      continue;
    }
    if (ladderOnly(r, season)) {
      exclude('uniqueitems', `天梯第 ${r.firstLadderSeason} 赛季专属`, r.index);
      continue;
    }
    if (!BASE[r.code]) {
      exclude('uniqueitems', '底材不收录', r.index);
      continue;
    }
    const ps = props(r, 12, (i) => `prop${i}`, (i) => `par${i}`, (i) => `min${i}`, (i) => `max${i}`);
    if (ps.some(isWarlock)) {
      exclude('uniqueitems', '术士技能', r.index);
      continue;
    }
    // placeholders like Darkfear: a base and nothing else
    if (!ps.length) {
      exclude('uniqueitems', '没有属性（未用的行）', r.index);
      continue;
    }
    const name = uniqueNames.get(r.index, S.en[r.index], official(r.index));
    if (!name) continue;
    const u = { id: r['*ID'], key: r.index, name, en: S.en[r.index], code: r.code, lvl: r.lvl ?? 0, reqLvl: r['lvl req'] ?? 0, rarity: r.rarity ?? 0, spawnable: !!r.spawnable };
    if (r['cost mult']) u.costMult = r['cost mult'];
    if (r['cost add']) u.costAdd = r['cost add'];
    if (r.carry1) u.carry1 = true;
    if (r.DropConditionCalc) u.dropCond = r.DropConditionCalc;
    u.props = ps;
    cover.add('uniqueitems', ps);
    uniques.push(u);
  }

  // ───────────────────────── sets ─────────────────────────
  const setNames = names('sets');
  // the set tables are keyed by name: back into table order, which add func 1 counts pieces by
  const byLine = (t) => rows(t).sort((a, b) => a.lineNumber - b.lineNumber);
  const setItems = [];
  const pieces = {};
  for (const r of byLine(setItemsJ)) {
    if (WARLOCK_SETS.has(r.set) || S.zh[r.index] === undefined) {
      exclude('setitems', WARLOCK_ROW, r.index);
      continue;
    }
    if (ladderOnly(r, season)) {
      exclude('setitems', `天梯第 ${r.firstLadderSeason} 赛季专属`, r.index);
      continue;
    }
    if (!BASE[r.item]) {
      exclude('setitems', '底材不收录', r.index);
      continue;
    }
    const ps = props(r, 9, (i) => `prop${i}`, (i) => `par${i}`, (i) => `min${i}`, (i) => `max${i}`);
    // the green bonuses: slot n holds aprop{n}a and aprop{n}b
    const bonus = [1, 2, 3, 4, 5].map((n) =>
      ['a', 'b'].filter((x) => r[`aprop${n}${x}`]).map((x) => prop(r[`aprop${n}${x}`], r[`apar${n}${x}`], r[`amin${n}${x}`], r[`amax${n}${x}`])).filter(Boolean),
    );
    while (bonus.length && !bonus[bonus.length - 1].length) bonus.pop();
    if ([...ps, ...bonus.flat()].some(isWarlock)) {
      exclude('setitems', '术士技能', r.index);
      continue;
    }
    const name = setNames.get(r.index, S.en[r.index], official(r.index));
    if (!name) continue;
    const o = { id: r['*ID'], key: r.index, set: r.set, name, en: S.en[r.index], code: r.item, lvl: r.lvl ?? 0, reqLvl: r['lvl req'] ?? 0, rarity: r.rarity ?? 0, spawnable: !!r.spawnable };
    if (r['cost mult']) o.costMult = r['cost mult'];
    if (r['cost add']) o.costAdd = r['cost add'];
    o.props = ps;
    o.addFunc = r['add func'] ?? 0;
    if (bonus.length) o.bonus = bonus;
    cover.add('setitems', [...ps, ...bonus.flat()]);
    setItems.push(o);
    (pieces[r.set] ??= []).push(r.index);
  }
  const sets = [];
  for (const r of byLine(setsJ)) {
    if (WARLOCK_SETS.has(r.index) || S.zh[r.index] === undefined) {
      exclude('sets', WARLOCK_ROW, r.index);
      continue;
    }
    if (!pieces[r.index]) {
      exclude('sets', '部件都不收录', r.index);
      continue;
    }
    const partial = [];
    for (const n of [2, 3, 4, 5]) {
      const ps = ['a', 'b'].filter((x) => r[`PCode${n}${x}`]).map((x) => prop(r[`PCode${n}${x}`], r[`PParam${n}${x}`], r[`PMin${n}${x}`], r[`PMax${n}${x}`])).filter(Boolean);
      if (ps.length) partial.push({ n, props: ps });
    }
    const full = props(r, 8, (i) => `FCode${i}`, (i) => `FParam${i}`, (i) => `FMin${i}`, (i) => `FMax${i}`);
    const name = setNames.get(r.index, S.en[r.index], official(r.index));
    if (!name) continue;
    cover.add('sets', [...partial.flatMap((p) => p.props), ...full]);
    sets.push({ id: r.index, name, en: S.en[r.index], pieces: pieces[r.index], partial, full });
  }

  // ───────────────────────── runes, gems, runewords ─────────────────────────
  const MISC = Object.fromEntries(rows(miscJ).filter((r) => r.code).map((r) => [r.code, r]));
  const runes = [];
  const gems = [];
  for (const r of rows(gemsJ)) {
    const b = BASE[r.code];
    const m = MISC[r.code];
    if (!b || !m) continue;
    const mods = (k) => props(r, 3, (i) => `${k}Mod${i}Code`, (i) => `${k}Mod${i}Param`, (i) => `${k}Mod${i}Min`, (i) => `${k}Mod${i}Max`);
    const o = { id: r.code, qlvl: b.qlvl, reqLvl: b.reqLvl, cost: b.cost, weapon: mods('weapon'), armor: mods('helm'), shield: mods('shield') };
    cover.add(m.type === 'rune' ? 'runes' : 'gems', [...o.weapon, ...o.armor, ...o.shield]);
    if (m.type === 'rune') {
      official(r.code);
      const num = runeNum(r.code);
      runes.push({ id: r.code, num, name: b.name, glyph: String(num), en: b.en, ...o });
    } else if (GEM_TYPES[m.type]) {
      gems.push({ id: r.code, name: b.name, en: b.en, gem: GEM_TYPES[m.type], grade: +m.type2.slice(3), ...o, ...(b.next ? { next: b.next } : {}) });
    }
  }
  runes.sort((a, b) => a.num - b.num);
  const runeLvl = Object.fromEntries(runes.map((r) => [r.id, r.reqLvl]));
  const rwNames = names('runewords');
  const runewords = [];
  for (const r of byLine(runesJ)) {
    if (!r.complete) continue;
    if (S.zh[r.Name] === undefined) {
      exclude('runes', WARLOCK_ROW, r.Name);
      continue;
    }
    if (ladderOnly(r, season)) {
      exclude('runes', `天梯第 ${r.firstLadderSeason} 赛季专属`, r.Name);
      continue;
    }
    const rs = numbered(r, 6, (i) => `Rune${i}`).map((i) => r[`Rune${i}`]);
    const ps = props(r, 7, (i) => `T1Code${i}`, (i) => `T1Param${i}`, (i) => `T1Min${i}`, (i) => `T1Max${i}`);
    if (ps.some(isWarlock)) {
      exclude('runes', '术士技能', r.Name);
      continue;
    }
    const name = rwNames.get(r.Name, S.en[r.Name] ?? r['*Rune Name'], official(r.Name));
    if (!name) continue;
    const o = { id: r.Name, name, en: S.en[r.Name] ?? r['*Rune Name'], runes: rs.map(runeNum) };
    o.itypes = numbered(r, 6, (i) => `itype${i}`).map((i) => r[`itype${i}`]).filter(typeOk);
    const et = numbered(r, 3, (i) => `etype${i}`).map((i) => r[`etype${i}`]).filter(typeOk);
    if (et.length) o.etypes = et;
    o.reqLvl = Math.max(...rs.map((x) => runeLvl[x] ?? 0));
    o.props = ps;
    cover.add('runes', ps);
    runewords.push(o);
  }

  // ───────────────────────── checks ─────────────────────────
  // No official proper-noun name may reach the data: renamed rows must not have kept an official
  // proper noun (generic base and gem names are official words by design), and no name at all may
  // hold an official transliteration the glossary replaces (赫拉迪姆, 卡林姆, …).
  const leaked = [];
  const bases = [...weapons, ...armor, ...misc];
  const renamedRows = [...bases.filter((b) => renamed.has(b.code)), ...prefixes, ...suffixes, ...automagic, ...rarePrefixes, ...rareSuffixes, ...uniques, ...setItems, ...sets, ...runewords, ...runes];
  for (const x of renamedRows) if (officialNames.has(x.name)) leaked.push(`${x.id ?? x.code} ${x.name}`);
  const terms = glossaryOfficial();
  for (const x of [...bases.filter((b) => !renamed.has(b.code)), ...renamedRows, ...gems]) {
    const t = terms.find((o) => x.name.includes(o));
    if (t) leaked.push(`${x.id ?? x.code} ${x.name} (${t})`);
  }
  if (leaked.length) throw new Error(`official proper-noun names in the generated data:\n  ${leaked.join('\n  ')}`);
  if (unknownSkills.size) throw new Error(`skill parameters not in skills.json: ${[...unknownSkills].join(', ')}`);
  await cover.check();

  // the skills the kept rows' properties name (rows left out may name the Warlock's)
  const skills = new Set();
  const allProps = [
    ...[...prefixes, ...suffixes, ...automagic, ...quality, ...uniques, ...runewords].flatMap((x) => x.props),
    ...setItems.flatMap((x) => [...x.props, ...(x.bonus ?? []).flat()]),
    ...sets.flatMap((x) => [...x.partial.flatMap((p) => p.props), ...x.full]),
    ...[...runes, ...gems].flatMap((x) => [...x.weapon, ...x.armor, ...x.shield]),
  ];
  for (const p of allProps) {
    if (SKILL_PROPS.has(p.c)) skills.add(p.p);
    // skill-rand rolls a skill id from min to max (Ormus' Robes: 36–60, the Sorceress's)
    if (p.c === 'skill-rand') {
      for (let id = p.min; id <= p.max; id++) {
        const s = skillOf(id);
        if (!s || s.charclass === WARLOCK) throw new Error(`skill-rand ${p.min}–${p.max}: skill ${id} is ${s ? "the Warlock's" : 'not in skills.json'}`);
        skills.add(s.skill);
      }
    }
  }
  // the classes whose skills bases roll as staff mods: an item's own type's StaffMods, not an
  // ancestor's (ITEMS_GetStaffMods, D2Common Items.cpp:2879-2899)
  const staffMods = [...new Set(bases.map((b) => itemTypes[b.type]?.staffMods).filter(Boolean))].sort();

  // ───────────────────────── write ─────────────────────────
  const T = (names) => `import type { ${names} } from './types';\n\n`;
  writeD2x('itemtypes.ts', `${T('D2xItemType')}/** item types by code: what they count as (up), where they are worn, sockets by item level, drop flags */\nexport const D2X_ITEM_TYPES: Record<string, D2xItemType> = ${record(itemTypes)};\n`);
  writeD2x('weapons.ts', `${T('D2xWeapon')}export const D2X_WEAPONS: D2xWeapon[] = ${list(weapons)};\n`);
  writeD2x('armor.ts', `${T('D2xArmor')}export const D2X_ARMOR: D2xArmor[] = ${list(armor)};\n`);
  writeD2x('misc.ts', `${T('D2xMisc')}export const D2X_MISC: D2xMisc[] = ${list(misc)};\n`);
  writeD2x('affixes.ts', `${T('D2xAffix')}export const D2X_PREFIXES: D2xAffix[] = ${list(prefixes)};\n\nexport const D2X_SUFFIXES: D2xAffix[] = ${list(suffixes)};\n\n/** the mods class items get on their own (bases' autoPrefix is the group) */\nexport const D2X_AUTOMAGIC: D2xAffix[] = ${list(automagic)};\n`);
  writeD2x('rare.ts', `${T('D2xRareWord')}/** a rare item's name is a prefix word and a suffix word */\nexport const D2X_RARE_PREFIXES: D2xRareWord[] = ${list(rarePrefixes)};\n\nexport const D2X_RARE_SUFFIXES: D2xRareWord[] = ${list(rareSuffixes)};\n`);
  writeD2x('quality.ts', `${T('D2xLowQuality, D2xQualityMod')}/** superior items roll one of these */\nexport const D2X_QUALITY: D2xQualityMod[] = ${list(quality)};\n\nexport const D2X_LOW_QUALITY: D2xLowQuality[] = ${list(lowQuality)};\n`);
  writeD2x('uniques.ts', `${T('D2xUnique')}export const D2X_UNIQUES: D2xUnique[] = ${list(uniques)};\n`);
  writeD2x('sets.ts', `${T('D2xSet, D2xSetItem')}export const D2X_SETS: D2xSet[] = ${list(sets)};\n\nexport const D2X_SET_ITEMS: D2xSetItem[] = ${list(setItems)};\n`);
  writeD2x('runewords.ts', `${T('D2xRuneword')}export const D2X_RUNEWORDS: D2xRuneword[] = ${list(runewords)};\n`);
  writeD2x('socketables.ts', `${T('D2xGem, D2xRune')}export const D2X_RUNES: D2xRune[] = ${list(runes)};\n\nexport const D2X_GEMS: D2xGem[] = ${list(gems)};\n`);
  console.log(
    `items: ${weapons.length} weapons, ${armor.length} armor, ${misc.length} misc, ${Object.keys(itemTypes).length} item types, ` +
      `${prefixes.length}+${suffixes.length} affixes, ${automagic.length} automagic, ${rarePrefixes.length}+${rareSuffixes.length} rare words, ` +
      `${quality.length} superior mods, ${uniques.length} uniques, ${sets.length} sets with ${setItems.length} pieces, ${runewords.length} runewords, ` +
      `${runes.length} runes, ${gems.length} gems; item props name ${skills.size} skills`,
  );
  // the skills stage needs every skill an item refers to or rolls; later stages check item codes against the bases
  return { skills: [...skills].sort(), staffMods, bases: new Set(Object.keys(BASE)), baseNames: new Map(Object.entries(BASE).map(([c, b]) => [c, b.name])) };
}
