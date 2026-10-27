// The skills stage → src/data/d2x/: every Paladin and Sorceress skill, the skills Act 1's monsters,
// their champion and unique modifiers and its hirelings use, and what those summon or fire, whole
// (Skills.txt with its SkillDesc.txt row); a names-and-class list of every other skill the data
// names or an item can roll (item properties, staff mods, synergies, prerequisites), which the game
// shows greyed as 本游戏未实现; every missile and state those refer to, and the states D2's code for
// them sets by id; SkillCalc.txt / MissCalc.txt;
// and D2's skill names → the game's skill ids.
//
// Units: D2 keeps damage in 256ths of a point shifted by HitShift, and mana by manashift; both are
// converted to points here (k / 2^n, exact as doubles: × 256 gives D2's integers back). Skill effect
// lengths and cooldowns are converted from frames (25 a second) to seconds, and so are a missile's
// elemental lengths; a missile's own clock (range, activation, sub-missile loops, hit delays) stays
// in frames, as D2 steps missiles. Params and calc expressions stay as written, in D2's units (their
// *desc columns say what they are), and the calcs are parsed (tools/d2/calc.mjs) so every one is
// valid and every skill, missile and stat they link to is in the data.
//
// The tables are the pinned 3.x ones; every row taken is checked against D2R 2.7 (the last before
// the Warlock expansion), so no balance change of the expansion slips in.
//
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f, by file and line.
import { REF27, importTs, load, record, rows, strings, tables, writeD2x } from './load.mjs';
import { MISSILE_FNS, SKILL_FNS, calcChecker, calcText, missileRange } from './calc.mjs';
import { glossaryOfficial, names } from './names.mjs';
import { GAME_CLASSES, WARLOCK } from './scope.mjs';
import { petsOf } from './world.mjs';

const FPS = 25;
const sec = (frames) => frames / FPS;
const GAME_CLASS = { pal: 'paladin', sor: 'sorceress' };

/**
 * The skills and missiles the champion and unique modifiers use: D2 hard-codes them, not the tables
 * (D2Game MONSTER/MonsterUnique.cpp, the callbacks by modifier at 1961-2010). By MonUMod id, with
 * its key to catch a renumbering; only the modifiers Act 1 can see are taken. The aura-enchanted
 * auras are the Paladin's (604-656). The ones D2 gives by hand in Act 1, Andariel's quest modifier
 * (MonsterSpawn.cpp:870) and the hireling's (MonsterAI.cpp:141), use neither.
 */
const UMOD_USES = {
  // curse: Amplify Damage at monster level / 5 + 1, by its aura calcs (984-1050)
  7: { key: 'curse', skills: ['Amplify Damage'] },
  // fire enchanted: the blast at death (1062-1090)
  9: { key: 'fire', missiles: ['monstercorpseexplode'] },
  10: { key: 'poisondead', missiles: ['corpsepoisoncloud'] },
  // lightning enchanted: charged bolts when hit (1139-1204)
  17: { key: 'lightning', missiles: ['lightunique'] },
  // cold enchanted: a nova at death, at Frost Nova's speed (1206-1215)
  18: { key: 'cold', missiles: ['coldunique', 'frostnova'] },
  20: { key: 'scarab', missiles: ['buglightning'] },
  23: { key: 'poisonhit', missiles: ['queenpoisoncloud'] },
  // teleport: a unique gets MonTeleport (592-602)
  26: { key: 'teleport', skills: ['MonTeleport'] },
  31: { key: 'goboom', missiles: ['monstercorpseexplode'] },
  33: { key: 'suicideminion_explode', missiles: ['suicidefireexplode', 'suicidecorpseexplode', 'suicideiceexplode'] },
  42: { key: 'lightningdeath', missiles: ['nova'] },
};

/**
 * The states D2's server code for the taken skills sets or checks by id, where no table column
 * names them (D2Game SKILLS/SkillPal.cpp, SkillSor.cpp, UNIT/SUnitDmg.cpp): by States.txt name,
 * with its id to catch a renumbering, and the skills. Conversion's terror test (SkillPal.cpp:1131)
 * is the AI's (AISPECIALSTATE_TERROR: whether the monster can be made to change sides), not the state.
 */
const CODE_STATES = {
  // Inferno's channelling: while it lasts the flame goes on with no start mana (SkillSor.cpp:95-102, 143-180)
  inferno: { id: 12, skills: ['Inferno'] },
  // Charge: on the paladin while he runs (SkillPal.cpp:705, SUnitMsg.cpp:614); a target that is
  // uninterruptable is charged at as a place, not followed (SkillPal.cpp:658-661)
  skill_move: { id: 18, skills: ['Charge'] },
  uninterruptable: { id: 54, skills: ['Charge'] },
  // Smite's calc2 is a stun length (SkillPal.cpp:164, 197-210), which sets this (SUnitDmg.cpp:1328-1370)
  stunned: { id: 21, skills: ['Smite'] },
  // a player's aura that costs mana stops mana regeneration while it drains (SkillPal.cpp:290-301, 474-476, 562-567)
  nomanaregen: { id: 85, skills: ['Prayer', 'Sanctuary'] },
  // a corpse Redemption has taken (SkillPal.cpp:1474)
  redeemed: { id: 99, skills: ['Redemption'] },
  // Holy Freeze: one in five of the monsters it chills shatter if they die chilled (SkillPal.cpp:1406, 1457)
  shatter: { id: 107, skills: ['Holy Freeze'] },
  // Conversion: a monster above the paladin's level fights at his while converted; this keeps its
  // own level and life for when it ends (SkillPal.cpp:1186-1221, 1233)
  conversion_save: { id: 109, skills: ['Conversion'] },
};

/** Skills.txt columns not taken, and why */
const SKILL_IGNORED = {
  lineNumber: 'row order (*Id is the skill id)',
  aitype: 'added with the 3.x tables (2.7 has no such column)',
  seqtrans: 'client: the animation it blends from',
  stsound: 'sound', stsoundclass: 'sound', dosound: 'sound', 'dosound a': 'sound', 'dosound b': 'sound', tgtsound: 'sound', prgsound: 'sound',
  ItemCastSound: 'sound', weaponsnd: 'sound', stsounddelay: 'sound', stsuccessonly: 'sound: plays the start sound only on success',
  castoverlay: 'visual overlay', srvoverlay: 'visual overlay', cltoverlaya: 'visual overlay', cltoverlayb: 'visual overlay', tgtoverlay: 'visual overlay',
  prgoverlay: 'visual overlay', ItemCastOverlay: 'visual overlay', sumoverlay: 'visual overlay',
  cltstfunc: 'client function (visuals)', cltdofunc: 'client function (visuals)', cltstopfunc: 'client function (visuals)',
  cltprgfunc1: 'client function (visuals)', cltprgfunc2: 'client function (visuals)', cltprgfunc3: 'client function (visuals)',
  cltcalc1: 'client calc (visuals)', cltcalc2: 'client calc (visuals)', cltcalc3: 'client calc (visuals)',
  '*cltcalc1 desc': 'client calc (visuals)', '*cltcalc2 desc': 'client calc (visuals)', '*cltcalc3 desc': 'client calc (visuals)',
  ItemCltEffect: 'client function when cast from an item', ItemCltCheckStart: 'client check when cast from an item',
};
/** Skills.txt 0/1 columns → our flag names */
const SKILL_FLAGS = {
  leftskill: 'left', rightskill: 'right', interrupt: 'interrupt', InTown: 'inTown', passive: 'passive', aura: 'aura', periodic: 'periodic',
  immediate: 'immediate', repeat: 'repeat', warp: 'warp', finishing: 'finishing', progressive: 'progressive', prgstack: 'prgStack', Kick: 'kick',
  lob: 'lob', decquant: 'decQuant', noammo: 'noAmmo', durability: 'durability', UseAttackRate: 'useAttackRate', alwayshit: 'alwaysHit',
  usemanaondo: 'manaOnDo', AttackNoMana: 'attackNoMana', enhanceable: 'enhanceable', TargetableOnly: 'targetableOnly',
  SearchEnemyXY: 'searchEnemyXY', SearchEnemyNear: 'searchEnemyNear', SearchOpenXY: 'searchOpenXY', TargetCorpse: 'targetCorpse',
  TargetPet: 'targetPet', TargetAlly: 'targetAlly', TargetItem: 'targetItem', TgtPlaceCheck: 'tgtPlaceCheck',
  ContinueCastUnselected: 'continueCastUnselected', ClearSelectedOnHold: 'clearSelectedOnHold', KeepCursorStateOnKill: 'keepCursorOnKill',
  scroll: 'scroll', periodicClearAura: 'periodicClearAura', ItemTgtDo: 'itemTgtDo', ItemCheckStart: 'itemCheckStart', requiresweapon: 'requiresWeapon',
};
/**
 * Pinned-table values that differ from 2.7, by skill: 2.7's are taken. The 3.x tables gave Energy
 * Shield an item function (ItemEffect 1); 2.7 has none.
 */
const SKILL_27 = { 'Energy Shield': ['ItemEffect'] };

/** SkillDesc.txt columns not taken, and why */
const DESC_IGNORED = {
  lineNumber: 'row order',
  IconCel: "D2's icon sprite", HireableIconCel: "D2's icon sprite",
  'str short': 'official description prose: the game writes its own', 'str long': 'official description prose: the game writes its own',
  'str alt': 'official description prose: the game writes its own',
};
/** SkillDesc.txt's three line blocks: line, texts and calcs columns by block */
const DESC_BLOCKS = [
  ['lines', 'descline', 'desctexta', 'desctextb', 'desccalca', 'desccalcb'],
  ['lines2', 'dsc2line', 'dsc2texta', 'dsc2textb', 'dsc2calca', 'dsc2calcb'],
  ['lines3', 'dsc3line', 'dsc3texta', 'dsc3textb', 'dsc3calca', 'dsc3calcb'],
];

/** Missiles.txt columns not taken, and why */
const MISSILE_IGNORED = {
  lineNumber: 'row order (*ID is the missile id)',
  pCltDoFunc: 'client function (visuals)', pCltHitFunc: 'client function (visuals)', ClientCol: 'client collision', ClientSend: 'network',
  CltSrcTown: 'client', CltCalc1: 'client calc', '*client calc 1 desc': 'client calc',
  ...Object.fromEntries([1, 2, 3, 4, 5].flatMap((i) => [[`CltParam${i}`, 'client param'], [`*client param${i} desc`, 'client param']])),
  ...Object.fromEntries([1, 2, 3].flatMap((i) => [[`cHitPar${i}`, 'client hit param'], [`*client hit param${i} desc`, 'client hit param']])),
  CelFile: 'sprite', animrate: 'sprite', AnimLen: 'sprite', AnimSpeed: 'sprite', LoopAnim: 'sprite', NumDirections: 'sprite', Trans: 'sprite',
  Flicker: 'light flicker', LocalBlood: 'blood visuals', zoffset: 'sprite offset', yoffset: 'sprite offset', MissileWeaponVFX: 'D2R weapon visuals',
  TravelSound: 'sound', HitSound: 'sound', ProgSound: 'sound', OnDiedSound: 'sound', ProgOverlay: 'visual overlay',
};
const MISSILE_FLAGS = {
  CollideKill: 'collideKill', LastCollide: 'lastCollide', CollideFriend: 'collideFriend', Collision: 'collision', CanSlow: 'canSlow',
  ReturnFire: 'returnFire', GetHit: 'getHit', SoftHit: 'softHit', Pierce: 'pierce', Explosion: 'explosion', AlwaysExplode: 'alwaysExplode',
  NoMultiShot: 'noMultiShot', NoUniqueMod: 'noUniqueMod', Half2HSrc: 'half2HSrc', ApplyMastery: 'applyMastery', MissileSkill: 'missileSkill',
  CanDestroy: 'canDestroy', Town: 'town', SrcTown: 'srcTown', SubLoop: 'subLoop',
};
/** sub-missile columns: server ones (whose damage counts) and client ones (visuals) */
const SUB_COLS = {
  srv: ['SubMissile1', 'SubMissile2', 'SubMissile3'],
  hit: ['HitSubMissile1', 'HitSubMissile2', 'HitSubMissile3', 'HitSubMissile4'],
  clt: ['CltSubMissile1', 'CltSubMissile2', 'CltSubMissile3'],
  cltHit: ['CltHitSubMissile1', 'CltHitSubMissile2', 'CltHitSubMissile3', 'CltHitSubMissile4'],
};

/** States.txt columns not taken, and why */
const STATE_IGNORED = {
  lineNumber: 'row order (*ID is the state id)',
  overlay1: 'visual overlay', overlay2: 'visual overlay', overlay3: 'visual overlay', overlay4: 'visual overlay', castoverlay: 'visual overlay',
  removerlay: 'visual overlay', pgsvoverlay: 'visual overlay', pgsv: 'visual (D2R)', vfxweaponstate: 'D2R weapon visuals', nooverlays: 'visual overlay',
  onsound: 'sound', offsound: 'sound', gfxtype: 'sprite palette', gfxclass: 'sprite palette', colorpri: 'sprite palette', colorshift: 'sprite palette',
  'light-r': 'light colour', 'light-g': 'light colour', 'light-b': 'light colour', itemtype: 'item glow', itemtrans: 'item glow',
  cltactivefunc: 'client function (visuals)', cltevent: 'client event (visuals)', clteventfunc: 'client event (visuals)', nosend: 'network',
};
const STATE_FLAGS = {
  plrstaydeath: 'playerStaysOnDeath', monstaydeath: 'monsterStaysOnDeath', bossstaydeath: 'bossStaysOnDeath', curable: 'curable', curse: 'curse',
  active: 'active', udead: 'undead', aura: 'aura', exp: 'exp', transform: 'transform', restrict: 'restrict', disguise: 'disguise',
  meleeonly: 'meleeOnly', noclear: 'noClear', remhit: 'removedOnHit', hide: 'hide', notondead: 'notOnDead', bossinv: 'bossInvulnerable',
  shatter: 'shatter', hidedead: 'hideDead', life: 'life', green: 'green', sunderfull: 'sunderFull', 'sunder-res-reduce': 'sunderResReduce',
};
/** the character screen colours a state turns a number: column → which number */
const STATE_COLOURS = {
  blue: { attblue: 'att', armblue: 'arm', damblue: 'dam', rfblue: 'rf', rlblue: 'rl', rcblue: 'rc', rpblue: 'rp', stambarblue: 'stamina' },
  red: { attred: 'att', armred: 'arm', damred: 'dam', rfred: 'rf', rlred: 'rl', rcred: 'rc', rpred: 'rp' },
};

/** records the columns the code reads off a table's rows, so check() can fail on a column with no rule */
function columns(label, ignored) {
  const read = new Set();
  return {
    wrap: (r) => new Proxy(r, { get: (t, k) => (typeof k === 'string' && read.add(k), t[k]) }),
    check(all) {
      const unknown = new Set();
      for (const r of all) for (const k of Object.keys(r)) if (!read.has(k) && !(k in ignored)) unknown.add(k);
      if (unknown.size) throw new Error(`${label}: columns with no rule: ${[...unknown].join(', ')}`);
      const both = Object.keys(ignored).filter((k) => read.has(k));
      if (both.length) throw new Error(`${label}: columns both read and ignored: ${both.join(', ')}`);
    },
  };
}
/** a row's columns that differ from its 2.7 row, but those not taken */
function diff27(a, b, ignored) {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!(k in ignored) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  return out;
}

/**
 * A value by D2's level bands (SKILLS_CalculateDamageBonusByLevel, D2Skills.cpp:2477-2505): the
 * base, then what each level adds for levels 2–8, 9–16, 17–22, 23–28 and 29+, each through f.
 */
const bands = (r, base, per, f) => [base, ...per].map((c) => f(r[c] ?? 0));
const snake = (en) => en.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export async function buildSkills({ itemSkills, staffMods, hirelingSkills, monsters, superuniques, umods, bases }) {
  const [skillsJ, descJ, sCalcJ, mCalcJ, missJ, statesJ, monJ, statJ, elemJ, weaponsJ, armorJ, miscJ] = await tables(
    'skills', 'skilldesc', 'skillcalc', 'misscalc', 'missiles', 'states', 'monstats', 'itemstatcost', 'elemtypes', 'weapons', 'armor', 'misc',
  );
  const [skills27, desc27, miss27, states27] = await Promise.all(['skills', 'skilldesc', 'missiles', 'states'].map((t) => load(REF27, t)));
  const S = await strings('skills', 'item-modifiers', 'ui', 'item-runes');
  const SKILL = new Map(rows(skillsJ).filter((s) => s.skill).map((s) => [s.skill, s]));
  const SKILL_LC = new Map([...SKILL.values()].map((s) => [s.skill.toLowerCase(), s]));
  const DESC = new Map(rows(descJ).map((d) => [d.skilldesc, d]));
  const MISS = new Map(rows(missJ).map((m) => [m.Missile, m]));
  const MISS_ID = new Map(rows(missJ).map((m) => [m['*ID'], m]));
  const STATE = new Map(rows(statesJ).map((s) => [s.state, s]));
  const STAT = new Map(rows(statJ).map((s) => [s.Stat, s]));
  const MON = new Map(rows(monJ).map((m) => [m.Id, m]));
  const ELEM = new Set(rows(elemJ).map((e) => e.Code));
  const S27 = new Map(rows(skills27).filter((s) => s.skill).map((s) => [s.skill, s]));
  const D27 = new Map(rows(desc27).map((d) => [d.skilldesc, d]));
  const M27 = new Map(rows(miss27).map((m) => [m.Missile, m]));
  const ST27 = new Map(rows(states27).map((s) => [s.state, s]));
  /** a skill by name as the tables write it (case varies: "gethit-skill" params, sumskill) */
  const skillRow = (n, where) => {
    const s = SKILL_LC.get(String(n).toLowerCase());
    if (!s) throw new Error(`${where}: no skill ${n}`);
    return s;
  };
  // a skill the expansion added is not in 2.7 (and the Warlock's are class war)
  const warlockEra = (s) => s.charclass === WARLOCK || !S27.has(s.skill);

  // ───────────────────────── which skills ─────────────────────────
  // Whole: the two classes' trees, what Act 1's monsters cast (Skill1-8, the SkillDamage they deal
  // and the ResurrectSkill that raises them), what their modifiers cast (UMOD_USES: those random
  // champions and uniques can roll, and Act 1's superuniques' own), what Act 1's hirelings cast;
  // then what those give their summons (sumskill1-5, and the summoned monster's own Skill1-8) and
  // the skills whose damage their server missiles deal (Missiles.txt Skill, Missile.cpp:505-560),
  // following server sub-missiles. Client missiles are visuals: their Skill column pulls nothing in.
  const from = new Map();
  const take = (n, why, where) => {
    const s = skillRow(n, where);
    if (warlockEra(s)) throw new Error(`${where}: ${s.skill} came with the Warlock expansion`);
    if (!from.has(s.skill)) from.set(s.skill, new Set());
    const had = from.get(s.skill).size;
    from.get(s.skill).add(why);
    return had === 0;
  };
  for (const s of SKILL.values()) if (GAME_CLASSES.has(s.charclass)) take(s.skill, 'class', 'class trees');
  // (a pet's skills come with its summoner's, below)
  for (const m of Object.values(monsters).filter((x) => !x.petOf)) {
    for (const s of m.skills ?? []) take(s.skill, 'monster', `monster ${m.id}`);
    if (m.skillDamage) take(m.skillDamage, 'monster', `monster ${m.id} SkillDamage`);
    if (m.resurrectSkill) take(m.resurrectSkill, 'monster', `monster ${m.id} ResurrectSkill`);
  }
  const rolled = umods.filter((u) => !u.disabled && [...u.cpick, ...u.upick].some(Boolean)).map((u) => u.id);
  const umodUses = [...new Set([...rolled, ...superuniques.flatMap((s) => s.mods)])].sort((a, b) => a - b).filter((id) => UMOD_USES[id]);
  for (const id of umodUses) {
    const u = umods.find((x) => x.id === id);
    if (u?.key !== UMOD_USES[id].key) throw new Error(`monumod ${id} is ${u?.key}, not ${UMOD_USES[id].key}`);
    for (const s of UMOD_USES[id].skills ?? []) take(s, 'umod', `monster modifier ${u.key}`);
  }
  for (const s of hirelingSkills) take(s, 'hireling', 'Act 1 hirelings');
  const srvMissiles = (name, acc) => {
    if (!name || acc.has(name)) return acc;
    const m = MISS.get(name);
    if (!m) throw new Error(`no missile ${name}`);
    acc.add(name);
    for (const c of [...SUB_COLS.srv, ...SUB_COLS.hit]) srvMissiles(m[c], acc);
    return acc;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const name of [...from.keys()]) {
      const s = SKILL.get(name);
      for (let i = 1; i <= 5; i++) if (s[`sumskill${i}`]) grew = take(s[`sumskill${i}`], 'summon', `${name} sumskill${i}`) || grew;
      const pet = s.summon && MON.get(s.summon);
      if (pet) for (let i = 1; i <= 8; i++) if (pet[`Skill${i}`]) grew = take(pet[`Skill${i}`], 'summon', `${s.summon} of ${name}`) || grew;
      const ms = new Set();
      for (const c of ['srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec']) srvMissiles(s[c], ms);
      for (const m of ms) {
        const k = MISS.get(m).Skill;
        if (k && skillRow(k, m).skill !== name) grew = take(k, 'missile', `missile ${m} of ${name}`) || grew;
      }
    }
  }

  // ───────────────────────── calcs ─────────────────────────
  const skillCodes = new Set(rows(sCalcJ).map((r) => r.code));
  const missCodes = new Set(rows(mCalcJ).map((r) => r.code));
  const has = { skill: (n) => SKILL_LC.has(n.toLowerCase()), missile: (n) => MISS.has(n), stat: (n) => STAT.has(n) };
  const checkSkillCalc = calcChecker({ codes: skillCodes, fns: SKILL_FNS, skillCodes, missCodes, has });
  const checkMissCalc = calcChecker({ codes: missCodes, fns: MISSILE_FNS, skillCodes, missCodes, has });
  // what the taken rows link to: other skills (whole or by name), missiles, states, stats, text keys
  const refs = { skills: new Map(), missiles: new Map(), states: new Map(), stats: new Map(), texts: new Set() };
  const ref = (kind, name, where) => {
    if (!refs[kind].has(name)) refs[kind].set(name, where);
    return name;
  };
  /** calcs whose open ( the import closed */
  const closed = [];
  const calc = (check) => (v, where) => {
    const c = calcText(v);
    if (c === undefined) return undefined;
    const r = check(c, where);
    for (const s of r.skills) ref('skills', skillRow(s, where).skill, where);
    for (const m of r.missiles) ref('missiles', m, where);
    for (const s of r.stats) ref('stats', s, where);
    if (r.text !== c) closed.push(where);
    return r.text;
  };
  const skillCalc = calc(checkSkillCalc);
  const missCalc = calc(checkMissCalc);
  const stat = (n, where) => {
    if (!STAT.has(n)) throw new Error(`${where}: no stat ${n}`);
    return ref('stats', n, where);
  };
  const state = (n, where) => {
    if (!STATE.has(n)) throw new Error(`${where}: no state ${n}`);
    return ref('states', n, where);
  };
  const missile = (n, where) => {
    if (!MISS.has(n)) throw new Error(`${where}: no missile ${n}`);
    return ref('missiles', n, where);
  };
  const elem = (t, where) => {
    if (!ELEM.has(t)) throw new Error(`${where}: no element ${t}`);
    return t;
  };
  /** numbered columns that are present: [n, value] */
  const present = (r, max, col) => {
    const out = [];
    for (let i = 1; i <= max; i++) {
      const v = r[col(i)];
      if (v !== undefined && v !== '') out.push([i, v]);
    }
    return out;
  };
  /** columns a(i) with their partner b(i), 1..max: [i, a, b] for each a present (b is read either way, for the column check) */
  const pairs = (r, max, a, b) => {
    const out = [];
    for (let i = 1; i <= max; i++) {
      const x = r[a(i)];
      const y = r[b(i)];
      if (x !== undefined && x !== '') out.push([i, x, y]);
    }
    return out;
  };
  /** a *desc column's note, without the quoting of the .txt export */
  const note = (v) => (typeof v === 'string' ? v.replace(/^"|"$/g, '').replace(/""/g, '"').trim() : v);
  /** a param or calc's *desc column, whichever spelling the table uses */
  const descCol = (r, cands) => note(cands.map((c) => r[c]).find((v) => v !== undefined && v !== ''));

  // ───────────────────────── skill names ─────────────────────────
  // Generic names keep the official Chinese (火球术, 冰封球); proper-noun-ish ones take ours from
  // tools/d2-names/skills.json; a skill whose name is a runeword's (Delirium's change) takes our
  // runeword name. Monster skills have no description row, and no name: the game shows none.
  const skillNames = names('skills');
  const runewordNames = names('runewords');
  const renamedOfficial = new Set();
  const STR_SKILL = new Map();
  for (const s of [...SKILL.values()].sort((a, b) => a['*Id'] - b['*Id'])) {
    const k = s.skilldesc && DESC.get(s.skilldesc)?.['str name'];
    if (k && !STR_SKILL.has(k)) STR_SKILL.set(k, s.skill);
  }
  function nameOf(s) {
    const k = s.skilldesc && DESC.get(s.skilldesc)?.['str name'];
    const en = (k && S.en[k]) || skillNames.en(s.skill);
    const official = k ? S.zh[k] : undefined;
    if (skillNames.has(s.skill) || (!official && !/^Runeword\d+$/.test(k ?? ''))) {
      if (official) renamedOfficial.add(official.trim());
      return { name: skillNames.get(s.skill, en, official), en };
    }
    if (/^Runeword\d+$/.test(k)) return { name: runewordNames.get(k, en, official), en };
    return { name: official.trim(), en };
  }

  // ───────────────────────── skills ─────────────────────────
  const skillCols = columns('skills', SKILL_IGNORED);
  const descCols = columns('skilldesc', DESC_IGNORED);
  const text = (v, where) => {
    if (STR_SKILL.has(v)) return { skill: ref('skills', STR_SKILL.get(v), where) };
    if (!S.zh[v]) throw new Error(`${where}: no string ${v}`);
    refs.texts.add(v);
    return v;
  };
  function descOf(d0, where) {
    const d = descCols.wrap(d0);
    // (the name string is read by nameOf)
    if (!d.skilldesc || !d['str name']) throw new Error(`${where}: no key or name string`);
    const o = { page: d.SkillPage ?? 0, row: d.SkillRow ?? 0, col: d.SkillColumn ?? 0 };
    if (d.ListRow) o.listRow = d.ListRow;
    if (d.ListPool) o.listPool = d.ListPool;
    if (d['str mana']) o.manaText = text(d['str mana'], where);
    if (d.descdam) o.dam = d.descdam;
    if (d.descatt) o.att = d.descatt;
    const ddam = [skillCalc(d['ddam calc1'], `${where} ddam calc1`), skillCalc(d['ddam calc2'], `${where} ddam calc2`)];
    if (ddam.some((x) => x !== undefined)) o.damCalc = ddam.map((x) => x ?? null);
    const pdm = [];
    for (let i = 1; i <= 3; i++) {
      const [e, min, max] = [d[`p${i}dmelem`], d[`p${i}dmmin`], d[`p${i}dmmax`]];
      if (!e && min === undefined && max === undefined) continue;
      pdm.push({ elem: e ? elem(e, where) : null, min: skillCalc(min, where) ?? 0, max: skillCalc(max, where) ?? 0 });
    }
    if (pdm.length) o.extraDam = pdm;
    const dm = [1, 2, 3].map((i) => d[`descmissile${i}`]).filter(Boolean).map((m) => missile(m, where));
    if (dm.length) o.missiles = dm;
    for (const [key, line, ta, tb, ca, cb] of DESC_BLOCKS) {
      const out = [];
      for (let i = 1; i <= 8; i++) {
        const [kind, textA, textB, calcA, calcB] = [line, ta, tb, ca, cb].map((c) => d[`${c}${i}`]);
        if (!kind) {
          if ([textA, textB, calcA, calcB].some((x) => x !== undefined)) throw new Error(`${where} ${line}${i}: texts or calcs on no line`);
          continue;
        }
        const l = { line: kind };
        const w = `${where} ${line}${i}`;
        if (textA) l.a = text(textA, w);
        if (textB) l.b = text(textB, w);
        const a = skillCalc(calcA, w);
        const b = skillCalc(calcB, w);
        if (a !== undefined) l.calcA = a;
        if (b !== undefined) l.calcB = b;
        out.push(l);
      }
      if (out.length) o[key] = out;
    }
    if (d['item proc text']) o.procText = text(d['item proc text'], where);
    if (d['item proc descline count']) o.procLines = d['item proc descline count'];
    return o;
  }

  const out = {};
  for (const name of [...from.keys()].sort((a, b) => SKILL.get(a)['*Id'] - SKILL.get(b)['*Id'])) {
    const raw = { ...SKILL.get(name) };
    const where = `skills ${name}`;
    for (const c of SKILL_27[name] ?? []) {
      if (S27.get(name)[c] === undefined) delete raw[c];
      else raw[c] = S27.get(name)[c];
    }
    const changed = diff27(raw, S27.get(name), SKILL_IGNORED);
    if (changed.length) throw new Error(`${where}: differs from 2.7 in ${changed.join(', ')}`);
    const r = skillCols.wrap(raw);
    if (r.skill !== name || !r.InGame) throw new Error(`${where}: not InGame`);
    const o = { id: r['*Id'] };
    const d0 = r.skilldesc && DESC.get(r.skilldesc);
    if (r.skilldesc && !d0) throw new Error(`${where}: no skilldesc ${r.skilldesc}`);
    if (d0) {
      const nm = nameOf(raw);
      if (!nm.name) continue;
      o.name = nm.name;
      if (nm.en) o.en = nm.en;
      const changedDesc = diff27(d0, D27.get(r.skilldesc), DESC_IGNORED);
      if (changedDesc.length) throw new Error(`skilldesc ${r.skilldesc}: differs from 2.7 in ${changedDesc.join(', ')}`);
    }
    if (r.charclass) o.cls = r.charclass;
    o.from = [...from.get(name)];
    o.reqLvl = r.reqlevel ?? 0;
    const req = [1, 2, 3].map((i) => r[`reqskill${i}`]).filter(Boolean).map((n) => ref('skills', skillRow(n, where).skill, where));
    if (req.length) o.reqSkills = req;
    if (r.maxlvl) o.maxLvl = r.maxlvl;
    if (d0) o.desc = descOf(d0, `skilldesc ${r.skilldesc}`);
    const flags = Object.entries(SKILL_FLAGS).filter(([c]) => r[c]).map(([, f]) => f);
    if (flags.length) o.flags = flags;
    if (r.range) o.range = r.range;
    if (r.anim) o.anim = r.anim;
    if (r.monanim) o.monAnim = r.monanim;
    if (r.seqnum || r.seqinput) o.seq = { num: r.seqnum ?? 0, input: r.seqinput ?? 0 };
    const funcs = {};
    if (r.srvstfunc) funcs.start = r.srvstfunc;
    if (r.srvdofunc) funcs.do = r.srvdofunc;
    if (r.srvstopfunc) funcs.stop = r.srvstopfunc;
    const prg = [1, 2, 3].map((i) => r[`srvprgfunc${i}`]).filter(Boolean);
    if (prg.length) funcs.prg = prg;
    if (Object.keys(funcs).length) o.funcs = funcs;
    // mana: (mana + (lvl − 1) × lvlmana) << manashift 256ths, at least minmana << 8 (Skills.cpp:1090-1096)
    const ms = 2 ** (r.manashift ?? 0) / 256;
    // a skill with neither mana nor lvlmana costs nothing, whatever its minmana (Skills.cpp:1079-1082)
    if (r.mana || r.lvlmana) {
      o.mana = { base: (r.mana ?? 0) * ms, perLvl: (r.lvlmana ?? 0) * ms };
      if (r.minmana) o.mana.min = r.minmana;
      // the mana needed to start a channelled skill (D2Skills.cpp:1878-1879)
      if (r.startmana) o.mana.start = r.startmana;
    }
    if (r.ToHitCalc !== undefined) o.toHit = { calc: skillCalc(r.ToHitCalc, `${where} ToHitCalc`) };
    else if (r.ToHit || r.LevToHit) o.toHit = { base: r.ToHit ?? 0, perLvl: r.LevToHit ?? 0 };
    // damage: (base + bands) << HitShift 256ths (D2Skills.cpp:2509-2738)
    const hs = (v) => (v * 2 ** (r.HitShift ?? 0)) / 256;
    const lev5 = (p) => [1, 2, 3, 4, 5].map((i) => `${p}${i}`);
    const phys = { min: bands(r, 'MinDam', lev5('MinLevDam'), hs), max: bands(r, 'MaxDam', lev5('MaxLevDam'), hs) };
    if ([...phys.min, ...phys.max].some(Boolean) || r.SrcDam || r.DmgSymPerCalc !== undefined) {
      o.phys = phys;
      // the weapon's damage it adds, SrcDam / 128 (2540-2552, 2607-2620); a skill's own attack shifts
      // it by HitShift with the rest (2567, 2635), its missiles add it unshifted (Missile.cpp:544-551, 661-662)
      if (r.SrcDam) o.phys.src = r.SrcDam / 128;
      if (r.SrcDam && (r.HitShift ?? 0) !== 8) o.phys.srcScale = 2 ** (r.HitShift ?? 0) / 256;
      // D2 takes this synergy before HitShift (2557-2567): with HitShift 8 it floors in whole points, as D2xSkill says
      const sym = skillCalc(r.DmgSymPerCalc, `${where} DmgSymPerCalc`);
      if (sym !== undefined && (r.HitShift ?? 0) !== 8) throw new Error(`${where}: a physical synergy with HitShift ${r.HitShift ?? 0}`);
      if (sym !== undefined) o.phys.sym = sym;
    }
    const emin = bands(r, 'EMin', lev5('EMinLev'), hs);
    const emax = bands(r, 'EMax', lev5('EMaxLev'), hs);
    // with no EType the E columns are plain numbers its calcs read (edmn: Inner Sight's armor, Prayer's healing)
    if (r.EType || [...emin, ...emax].some(Boolean)) {
      const e = r.EType ? { type: elem(r.EType, where), min: emin, max: emax } : { min: emin, max: emax };
      const sym = skillCalc(r.EDmgSymPerCalc, `${where} EDmgSymPerCalc`);
      if (sym !== undefined) e.sym = sym;
      o.elem = e;
    }
    // length: ELen + bands of 2–8, 9–16, 17+ (D2Skills.cpp:2742-2785), frames → seconds
    const elen = bands(r, 'ELen', ['ELevLen1', 'ELevLen2', 'ELevLen3'], sec);
    if (elen.some(Boolean)) (o.elem ??= {}).len = elen;
    const lenSym = skillCalc(r.ELenSymPerCalc, `${where} ELenSymPerCalc`);
    if (lenSym !== undefined) (o.elem ??= {}).lenSym = lenSym;
    const params = present(r, 14, (i) => `Param${i}`);
    const pdesc = new Map([...Array(14)].map((_, i) => [i + 1, descCol(r, [`*Param${i + 1} Description`, `*Param${i + 1} Description2`, `*Param${i + 1}Description`])]));
    if (params.length) {
      o.params = Object.fromEntries(params);
      const pd = params.filter(([i]) => pdesc.get(i)).map(([i]) => [i, pdesc.get(i)]);
      if (pd.length) o.paramDesc = Object.fromEntries(pd);
    }
    const calcs = present(r, 10, (i) => `calc${i}`).map(([i, v]) => [i, skillCalc(v, `${where} calc${i}`)]);
    const cdesc = new Map([...Array(10)].map((_, i) => [i + 1, descCol(r, [`*calc${i + 1} desc`, `*calc${i + 1}desc`])]));
    if (calcs.length) {
      o.calcs = Object.fromEntries(calcs);
      const cd = calcs.filter(([i]) => cdesc.get(i)).map(([i]) => [i, cdesc.get(i)]);
      if (cd.length) o.calcDesc = Object.fromEntries(cd);
    }
    // aura (and the buffs and debuffs that work like one): the state it gives, its length calc
    // (frames) and radius calc (sub-tiles, D2's distance unit: a tooltip shows × 2/3 of it as yards),
    // the stats it sets, the events it reacts to
    const aura = {};
    if (r.aurafilter) aura.filter = r.aurafilter;
    if (r.aurastate) aura.state = state(r.aurastate, where);
    if (r.auratargetstate) aura.targetState = state(r.auratargetstate, where);
    const len = skillCalc(r.auralencalc, `${where} auralencalc`);
    if (len !== undefined) aura.len = len;
    const rng = skillCalc(r.aurarangecalc, `${where} aurarangecalc`);
    if (rng !== undefined) aura.range = rng;
    const as = pairs(r, 6, (i) => `aurastat${i}`, (i) => `aurastatcalc${i}`).map(([i, s, c]) => ({ stat: stat(s, where), calc: skillCalc(c, `${where} aurastatcalc${i}`) ?? 0 }));
    if (as.length) aura.stats = as;
    const ev = pairs(r, 4, (i) => `auraevent${i}`, (i) => `auraeventfunc${i}`).map(([, e, f]) => ({ event: e, func: f ?? 0 }));
    if (ev.length) aura.events = ev;
    if (Object.keys(aura).length) o.aura = aura;
    const per = skillCalc(r.perdelay, `${where} perdelay`);
    if (per !== undefined) o.perDelay = per;
    const passive = {};
    if (r.passivestate) passive.state = state(r.passivestate, where);
    const ps = pairs(r, 14, (i) => `passivestat${i}`, (i) => `passivecalc${i}`).map(([i, s, c]) => ({ stat: stat(s, where), calc: skillCalc(c, `${where} passivecalc${i}`) ?? 0 }));
    if (ps.length) passive.stats = ps;
    if (r.passiveitype) passive.itype = r.passiveitype;
    if (r.passivereqweaponcount) passive.weapons = r.passivereqweaponcount;
    if (Object.keys(passive).length) o.passive = passive;
    // pets: the kind (pets of one kind share the cap) and how many. D2 reads petmax only for a pet
    // type's cap and in summon functions (Skills.cpp:1025-1050, SkillSor.cpp:1142…), so with neither
    // it is unread and left out: Energy Shield's 74. Revive raises corpses: pets and no summon.
    const petMax = skillCalc(r.petmax, `${where} petmax`);
    if (r.pettype || (r.summon && petMax !== undefined)) o.pet = { type: r.pettype ?? null, max: petMax ?? 0 };
    else if (petMax !== undefined && name !== 'Energy Shield') throw new Error(`${where}: petmax with no pet type or summon`);
    if (r.summon) {
      o.summon = { mon: r.summon, mode: r.summode ?? null };
      const sk = pairs(r, 5, (i) => `sumskill${i}`, (i) => `sumsk${i}calc`).map(([i, s, c]) => ({ skill: ref('skills', skillRow(s, where).skill, where), lvl: skillCalc(c, `${where} sumsk${i}calc`) ?? 0 }));
      if (sk.length) o.summon.skills = sk;
      if (r.sumumod) o.summon.umod = r.sumumod;
      if (r.requirespettype) o.summon.requiresPetType = r.requirespettype;
    } else if (r.summode || r.sumskill1) throw new Error(`${where}: summon fields with no summon`);
    const miss = {};
    for (const [c, k] of [['srvmissile', 'srv'], ['srvmissilea', 'srvA'], ['srvmissileb', 'srvB'], ['srvmissilec', 'srvC'], ['cltmissile', 'clt'], ['cltmissilea', 'cltA'], ['cltmissileb', 'cltB'], ['cltmissilec', 'cltC'], ['cltmissiled', 'cltD']]) {
      if (r[c]) miss[k] = missile(r[c], where);
    }
    if (Object.keys(miss).length) o.missiles = miss;
    const w = {};
    for (const [k, cols] of [['a', ['itypea1', 'itypea2', 'itypea3']], ['aNot', ['etypea1', 'etypea2']], ['b', ['itypeb1', 'itypeb2', 'itypeb3']], ['bNot', ['etypeb1', 'etypeb2']]]) {
      const t = cols.map((c) => r[c]).filter(Boolean);
      if (t.length) w[k] = t;
    }
    if (r.weapsel) w.sel = r.weapsel;
    if (Object.keys(w).length) o.weapons = w;
    const rs = [1, 2, 3].map((i) => r[`State${i}`]).filter(Boolean).map((s) => state(s, where));
    if (r.restrict || rs.length) o.restrict = { mode: r.restrict ?? 0, states: rs };
    // cooldowns: D2R's columns, frames → seconds
    if (r.localdelay || r.globaldelay) o.delay = { local: sec(r.localdelay ?? 0), global: sec(r.globaldelay ?? 0) };
    const prgc = present(r, 3, (i) => `prgcalc${i}`).map(([i, v]) => skillCalc(v, `${where} prgcalc${i}`));
    if (prgc.length || r.prgdam || r.prgchargestocast !== undefined || r.prgchargesconsumed !== undefined) {
      o.charge = { calcs: prgc, dam: r.prgdam ?? 0, toCast: r.prgchargestocast ?? 0, consumed: r.prgchargesconsumed ?? 0 };
    }
    if (r.ResultFlags || r.HitFlags || r.HitClass) o.hit = { result: r.ResultFlags ?? 0, flags: r.HitFlags ?? 0, class: r.HitClass ?? 0 };
    // cast from an item (charges, o-skills, chance to cast): the server function and how it targets
    if (r.ItemEffect || r.ItemTarget || r.ItemUseRestrict) o.item = { effect: r.ItemEffect ?? 0, target: r.ItemTarget ?? 0, ...(r.ItemUseRestrict ? { useRestrict: r.ItemUseRestrict } : {}) };
    if (r.LineOfSight) o.lineOfSight = r.LineOfSight;
    if (r.SelectProc) o.selectProc = r.SelectProc;
    o.attackRank = r.attackrank ?? 0;
    if (r.aibonus) o.aiBonus = r.aibonus;
    // what charges or levels of it add to an item's price, with reqlevel (D2Common Items.cpp:1814-1827, 1878-1892)
    if (r['cost mult'] || r['cost add']) o.cost = { mult: r['cost mult'] ?? 0, add: r['cost add'] ?? 0 };
    out[name] = o;
  }

  // ───────────────────────── missiles and states ─────────────────────────
  // what the skills refer to, what Act 1's monsters shoot (MissA1…), what the base items throw
  // (javelins, knives, potions: missiletype is a Missiles.txt *ID), the states of the potions
  // (state, cures), and on through sub-missiles and the missiles' and states' own links
  for (const m of Object.values(monsters)) for (const x of Object.values(m.missiles ?? {})) missile(x, `monster ${m.id}`);
  for (const id of umodUses) for (const m of UMOD_USES[id].missiles ?? []) missile(m, `monster modifier ${UMOD_USES[id].key}`);
  for (const r of [...rows(weaponsJ), ...rows(armorJ), ...rows(miscJ)]) {
    if (!r.code || !bases.has(r.code)) continue;
    if (r.missiletype !== undefined) {
      const m = MISS_ID.get(r.missiletype);
      if (!m) throw new Error(`base ${r.code}: no missile ${r.missiletype}`);
      missile(m.Missile, `base ${r.code}`);
    }
    for (const c of ['state', 'cstate1', 'cstate2']) if (r[c]) state(r[c], `base ${r.code}`);
  }
  // the states D2's code for the taken skills sets or checks by id
  for (const [n, c] of Object.entries(CODE_STATES)) {
    if (STATE.get(n)?.['*ID'] !== c.id) throw new Error(`states: ${n} is not id ${c.id}`);
    for (const s of c.skills) if (!out[s]) throw new Error(`states: ${n} is for ${s}, which is not taken`);
    state(n, `D2's code for ${c.skills.join(', ')}`);
  }
  const missCols = columns('missiles', MISSILE_IGNORED);
  const stateCols = columns('states', STATE_IGNORED);
  const missiles = {};
  const states = {};
  const sortedById = (m, byName) => [...m.keys()].sort((a, b) => byName.get(a)['*ID'] - byName.get(b)['*ID']);
  for (let more = true; more; ) {
    more = false;
    for (const name of sortedById(refs.missiles, MISS)) {
      if (missiles[name]) continue;
      more = true;
      const raw = MISS.get(name);
      const where = `missiles ${name}`;
      const old = M27.get(name);
      if (!old) throw new Error(`${where}: came with the Warlock expansion`);
      const range = missileRange(raw.Range, where);
      if (range[0] !== (old.Range ?? 0) || range[1] !== (old.LevRange ?? 0)) throw new Error(`${where}: Range ${raw.Range} is not 2.7's ${old.Range} + ${old.LevRange}/lvl`);
      const changed = diff27(raw, old, { ...MISSILE_IGNORED, Range: 1, LevRange: 1 });
      if (changed.length) throw new Error(`${where}: differs from 2.7 in ${changed.join(', ')}`);
      const r = missCols.wrap(raw);
      if (r.Missile !== name) throw new Error(`${where}: keyed wrong`);
      const o = { id: r['*ID'] };
      const funcs = {};
      if (r.pSrvDoFunc) funcs.do = r.pSrvDoFunc;
      if (r.pSrvHitFunc) funcs.hit = r.pSrvHitFunc;
      if (r.pSrvDmgFunc) funcs.dmg = r.pSrvDmgFunc;
      if (Object.keys(funcs).length) o.funcs = funcs;
      // speed: Vel + lvl × VelLev / 8 (D2 floors), at 75% of it (Missiles.cpp:118-145)
      if (r.Vel || r.MaxVel || r.VelLev || r.Accel) o.vel = { base: r.Vel ?? 0, max: r.MaxVel ?? 0, perLvl: (r.VelLev ?? 0) / 8, accel: r.Accel ?? 0 };
      // lifetime in frames: Range + lvl × LevRange (Missiles.cpp:205-208)
      o.range = missileRange(r.Range, where);
      if (r.Activate) o.activate = r.Activate;
      if (r.InitSteps) o.initSteps = r.InitSteps;
      if (r.RandStart) o.randStart = r.RandStart;
      if (r.SubStart || r.SubStop) o.loop = [r.SubStart ?? 0, r.SubStop ?? 0];
      const flags = Object.entries(MISSILE_FLAGS).filter(([c]) => r[c]).map(([, f]) => f);
      if (flags.length) o.flags = flags;
      o.size = r.Size ?? 0;
      o.collideType = r.CollideType ?? 0;
      if (r.CollisionOverlap) o.collisionOverlap = r.CollisionOverlap;
      if (r.NextHit) o.nextHit = r.NextHit;
      if (r.NextDelay) o.nextDelay = r.NextDelay;
      if (r.KnockBack) o.knockBack = r.KnockBack;
      if (r.ToHit) o.toHit = r.ToHit;
      if (r.Holy) o.holy = r.Holy;
      if (r.DamageRate) o.damageRate = r.DamageRate;
      if (r.Radius) o.radius = r.Radius;
      if (r.Skill) o.skill = ref('skills', skillRow(r.Skill, where).skill, where);
      // the weapon damage it adds, SrcDamage / 128; −1: none, not even the skill's (Missile.cpp:545-552)
      if (r.SrcDamage === -1) o.srcNone = true;
      else if (r.SrcDamage) o.src = r.SrcDamage / 128;
      // damage as a skill's (MISSILE_GetMinDamage… Missile.cpp:1002-1235); a missile's own
      // synergy is on its elemental damage (EDmgSymPerCalc)
      const hs = (v) => (v * 2 ** (r.HitShift ?? 0)) / 256;
      const lev5 = (p) => [1, 2, 3, 4, 5].map((i) => `${p}${i}`);
      const phys = { min: bands(r, 'MinDamage', lev5('MinLevDam'), hs), max: bands(r, 'MaxDamage', lev5('MaxLevDam'), hs) };
      if ([...phys.min, ...phys.max].some(Boolean)) o.phys = phys;
      const emin = bands(r, 'EMin', lev5('MinELev'), hs);
      const emax = bands(r, 'EMax', lev5('MaxELev'), hs);
      const sym = missCalc(r.EDmgSymPerCalc, `${where} EDmgSymPerCalc`);
      if (r.EType || [...emin, ...emax].some(Boolean)) {
        o.elem = r.EType ? { type: elem(r.EType, where), min: emin, max: emax } : { min: emin, max: emax };
        if (sym !== undefined) o.elem.sym = sym;
        // taken before HitShift (Missile.cpp:1160-1174), so it floors in 2^HitShift / 256 points
        if (sym !== undefined && (r.HitShift ?? 0) !== 8) o.elem.symUnit = 2 ** (r.HitShift ?? 0) / 256;
      } else if (sym !== undefined) throw new Error(`${where}: a damage synergy with no damage`);
      // elemental length (MISSILE_GetElementalLength, Missile.cpp:1238-1268), frames → seconds
      const elen = bands(r, 'ELen', ['ELevLen1', 'ELevLen2', 'ELevLen3'], sec);
      if (elen.some(Boolean)) (o.elem ??= {}).len = elen;
      const pr = (n, col, desc) => {
        const ps = present(r, n, col);
        const ds = new Map([...Array(n)].map((_, i) => [i + 1, note(r[desc(i + 1)])]));
        if (!ps.length) return undefined;
        const d = ps.filter(([i]) => ds.get(i)).map(([i]) => [i, ds.get(i)]);
        return d.length ? [Object.fromEntries(ps), Object.fromEntries(d)] : [Object.fromEntries(ps)];
      };
      for (const [k, n, col, desc] of [['params', 5, (i) => `Param${i}`, (i) => `*param${i} desc`], ['hitParams', 3, (i) => `sHitPar${i}`, (i) => `*server hit param${i} desc`], ['dmgParams', 2, (i) => `dParam${i}`, (i) => `*damage param${i} desc`]]) {
        const p = pr(n, col, desc);
        if (!p) continue;
        o[k] = p[0];
        if (p[1]) o[`${k.replace(/s$/, '')}Desc`] = p[1];
      }
      const calcs = {};
      const cdesc = {};
      for (const [k, col, desc] of [['srv', 'SrvCalc1', '*srv calc 1 desc'], ['hit', 'SHitCalc1', '*server hit calc 1 desc'], ['dmg', 'DmgCalc1', '*damage calc 1']]) {
        const c = missCalc(r[col], `${where} ${col}`);
        const d = note(r[desc]);
        if (c === undefined) continue;
        calcs[k] = c;
        if (d) cdesc[k] = d;
      }
      if (Object.keys(calcs).length) o.calcs = calcs;
      if (Object.keys(cdesc).length) o.calcDesc = cdesc;
      const sub = {};
      for (const [k, cols] of Object.entries(SUB_COLS)) {
        const ms = cols.map((c) => r[c]).filter(Boolean).map((m) => missile(m, where));
        if (ms.length) sub[k] = ms;
      }
      if (r.ExplosionMissile) sub.explosion = missile(r.ExplosionMissile, where);
      if (Object.keys(sub).length) o.sub = sub;
      if (r.ResultFlags || r.HitFlags || r.HitClass) o.hit = { result: r.ResultFlags ?? 0, flags: r.HitFlags ?? 0, class: r.HitClass ?? 0 };
      const light = { radius: r.Light ?? 0, rgb: [r.Red ?? 0, r.Green ?? 0, r.Blue ?? 0] };
      if (light.radius) o.light = light;
      missiles[name] = o;
    }
    for (const name of sortedById(refs.states, STATE)) {
      if (states[name]) continue;
      more = true;
      const raw = STATE.get(name);
      const where = `states ${name}`;
      if (!ST27.has(name)) throw new Error(`${where}: came with the Warlock expansion`);
      const changed = diff27(raw, ST27.get(name), STATE_IGNORED);
      if (changed.length) throw new Error(`${where}: differs from 2.7 in ${changed.join(', ')}`);
      const r = stateCols.wrap(raw);
      if (r.state !== name) throw new Error(`${where}: keyed wrong`);
      const o = { id: r['*ID'] };
      if (r.group) o.group = r.group;
      if (r.stat) o.stat = stat(r.stat, where);
      const flags = Object.entries(STATE_FLAGS).filter(([c]) => r[c]).map(([, f]) => f);
      if (flags.length) o.flags = flags;
      for (const [k, cols] of Object.entries(STATE_COLOURS)) {
        const c = Object.entries(cols).filter(([col]) => r[col]).map(([, v]) => v);
        if (c.length) o[k] = c;
      }
      const funcs = {};
      if (r.setfunc) funcs.set = r.setfunc;
      if (r.remfunc) funcs.rem = r.remfunc;
      if (r.srvactivefunc) funcs.active = r.srvactivefunc;
      if (Object.keys(funcs).length) o.funcs = funcs;
      if (r.skill) o.skill = ref('skills', skillRow(r.skill, where).skill, where);
      if (r.missile) o.missile = missile(r.missile, where);
      if (CODE_STATES[name]) o.code = CODE_STATES[name].skills;
      states[name] = o;
    }
  }
  skillCols.check([...SKILL.values()]);
  descCols.check(rows(descJ));
  missCols.check(rows(missJ));
  stateCols.check(rows(statesJ));

  // ───────────────────────── skills named, not taken ─────────────────────────
  // item properties (oskill, hit-skill, charged…), staff mods, synergies and prerequisites, missiles
  // and states: name, class and id, for the game to show greyed as 本游戏未实现, and what an item's
  // price and its staff-mod roll need of them
  for (const s of itemSkills) ref('skills', skillRow(s, 'item properties').skill, 'item properties');
  // A staff-mod roll takes any of the class's 30 skills by item level: the class's first skill id
  // + 5 × (tier − 1) + 0…4, rolled again while the skill's itypea1 is not the item's (D2Game
  // ITEMS/Items.cpp:2716-2857). So the class's skills must run on in id order, 30 of them.
  const staffModSkills = new Set();
  for (const c of staffMods) {
    const tree = [...SKILL.values()].filter((s) => s.charclass === c).sort((a, b) => a['*Id'] - b['*Id']);
    if (tree.length !== 30 || tree.some((s, i) => s['*Id'] !== tree[0]['*Id'] + i)) throw new Error(`${c}: staff mods need 30 skills with consecutive ids`);
    for (const s of tree) {
      ref('skills', s.skill, `${c} staff mods`);
      staffModSkills.add(s.skill);
    }
  }
  const onItems = new Set([...itemSkills.map((s) => skillRow(s, 'item properties').skill), ...staffModSkills]);
  const skillRefs = {};
  for (const name of [...refs.skills.keys()].sort((a, b) => SKILL.get(a)['*Id'] - SKILL.get(b)['*Id'])) {
    if (out[name]) continue;
    const s = SKILL.get(name);
    const where = refs.skills.get(name);
    if (warlockEra(s)) throw new Error(`${where}: names ${name}, which came with the Warlock expansion`);
    const o = { id: s['*Id'] };
    // a skill an item names or rolls must have a name to show; with none of ours it is in the report
    const nm = s.skilldesc ? nameOf(s) : {};
    if (!s.skilldesc && onItems.has(name)) throw new Error(`${where}: ${name} has no description row to name it by`);
    if (nm.name) o.name = nm.name;
    if (nm.en) o.en = nm.en;
    if (s.charclass) o.cls = s.charclass;
    o.reqLvl = s.reqlevel ?? 0;
    // an item's price counts the level and cost of its charges and skills
    if (s['cost mult'] || s['cost add']) o.cost = { mult: s['cost mult'] ?? 0, add: s['cost add'] ?? 0 };
    if (staffModSkills.has(name) && s.itypea1) o.staffModType = s.itypea1;
    skillRefs[name] = o;
  }
  for (const [name, where] of refs.skills) if (!out[name] && !skillRefs[name]) throw new Error(`${where}: ${name} is in neither list`);
  // what a taken skill summons is a monster of the world data (D2X_MONSTERS)
  for (const name of Object.keys(out)) {
    const lost = petsOf(SKILL.get(name), rows(monJ)).filter((id) => !monsters[id]);
    if (lost.length) throw new Error(`skills ${name}: summons ${lost.join(', ')}, which the world data does not have`);
  }

  // ───────────────────────── texts, stats, calc tables ─────────────────────────
  const texts = {};
  for (const k of [...refs.texts].sort()) texts[k] = S.zh[k];
  const statIds = {};
  for (const s of [...refs.stats.keys()].sort((a, b) => STAT.get(a)['*ID'] - STAT.get(b)['*ID'])) statIds[s] = STAT.get(s)['*ID'];
  // a code whose description is itself a calc (ln12 = par1 + (lvl - 1) * par2) is a macro of others
  const calcTable = (t, check) => {
    const o = {};
    for (const r of rows(t).sort((a, b) => a.lineNumber - b.lineNumber)) {
      const d = r['*Description'] ?? r['*description'] ?? '';
      let isExpr = /[+*/]/.test(d);
      if (isExpr) {
        try {
          check(d, `calc code ${r.code}`);
        } catch {
          isExpr = false;
        }
      }
      o[r.code] = isExpr ? { expr: d } : { desc: d };
    }
    return o;
  };
  const skillCalcTable = calcTable(sCalcJ, checkSkillCalc);
  const missCalcTable = calcTable(mCalcJ, checkMissCalc);

  // ───────────────────────── the game's ids ─────────────────────────
  // The game's skills keep their ids (src/data/d2/skillmap.ts D2_TO_GAME); the rest of the two
  // trees get new ones from their English names. The game skill no D2 skill matches goes (A5).
  const { D2_TO_GAME } = await importTs('src/data/d2/skillmap.ts');
  const { SKILLS: GAME_SKILLS } = await importTs('src/data/skills.ts');
  const gameById = new Map(GAME_SKILLS.map((s) => [s.id, s]));
  const gameIds = {};
  const usedIds = new Set();
  for (const [name, o] of Object.entries(out)) {
    if (!GAME_CLASSES.has(o.cls)) continue;
    const old = D2_TO_GAME[name];
    if (old) {
      const g = gameById.get(old);
      if (!g || g.cls !== GAME_CLASS[o.cls]) throw new Error(`skillmap.ts: ${name} → ${old}, which is no ${GAME_CLASS[o.cls]} skill of the game`);
      gameIds[name] = { id: old };
    } else {
      const id = snake(o.en ?? name);
      if (gameById.has(id)) throw new Error(`new skill id ${id} (${name}) is taken by a game skill`);
      gameIds[name] = { id, isNew: true };
    }
    if (usedIds.has(gameIds[name].id)) throw new Error(`two D2 skills map to ${gameIds[name].id}`);
    usedIds.add(gameIds[name].id);
  }
  for (const n of Object.keys(D2_TO_GAME)) if (!gameIds[n]) throw new Error(`skillmap.ts: ${n} is not a Paladin or Sorceress skill`);
  const gameOnly = GAME_SKILLS.map((s) => s.id).filter((id) => !usedIds.has(id));

  // ───────────────────────── checks ─────────────────────────
  // no glossary-replaced transliteration and no official name of a skill we renamed, in a name or a text
  const terms = [...glossaryOfficial(), ...renamedOfficial];
  const shown = [
    ...[...Object.values(out), ...Object.values(skillRefs)].map((s) => s.name).filter(Boolean),
    ...Object.values(texts),
  ];
  const leaked = [];
  for (const n of shown) {
    const t = terms.find((o) => n.includes(o));
    if (t) leaked.push(`${n} (${t})`);
  }
  if (leaked.length) throw new Error(`official proper nouns in the skill data:\n  ${leaked.join('\n  ')}`);
  // each class tree whole: 30 skills, each named and placed, 10 to a page
  for (const c of GAME_CLASSES) {
    const tree = Object.values(out).filter((s) => s.cls === c);
    const pages = [1, 2, 3].map((p) => tree.filter((s) => s.desc?.page === p).length);
    if (tree.length !== 30 || tree.some((s) => !s.name) || pages.some((n) => n !== 10)) throw new Error(`${c}: the skill tree is not 3 × 10 named skills (${pages.join('/')})`);
  }

  // ───────────────────────── write ─────────────────────────
  const T = (n) => `import type { ${n} } from './types';\n\n`;
  writeD2x(
    'skills.ts',
    `${T('D2xSkill, D2xSkillRef')}/**\n * The skills the game implements, by D2 skill name (Skills.txt): the Paladin's and Sorceress's trees,\n * what Act 1's monsters, their modifiers and its hirelings cast, and what those summon or fire. See\n * D2xSkill for units.\n */\nexport const D2X_SKILLS: Record<string, D2xSkill> = ${record(out)};\n\n` +
      `/** every other skill the data names or an item rolls (item properties, staff mods, synergies, prerequisites), by D2 name: shown greyed, 本游戏未实现 */\nexport const D2X_SKILL_REFS: Record<string, D2xSkillRef> = ${record(skillRefs)};\n\n` +
      `/** the Paladin and Sorceress skills → the game's skill ids; isNew: an id the game does not have yet */\nexport const D2X_GAME_SKILL_IDS: Record<string, { id: string; isNew?: true }> = ${record(gameIds)};\n\n` +
      `/** the game's skills no D2 skill matches */\nexport const D2X_GAME_ONLY_SKILLS: string[] = ${JSON.stringify(gameOnly)};\n\n` +
      `/** the description templates the skills' SkillDesc lines name, by string key: official generic text (printf-style %d, %s) */\nexport const D2X_SKILL_TEXT: Record<string, string> = ${record(texts)};\n\n` +
      `/** the ItemStatCost stats the skills and states set or read, by name → stat id */\nexport const D2X_SKILL_STATS: Record<string, number> = ${record(statIds)};\n`,
  );
  writeD2x('missiles.ts', `${T('D2xMissile')}/** every missile the skills, Act 1's monsters and the base items fire, by Missiles.txt name. See D2xMissile for units. */\nexport const D2X_MISSILES: Record<string, D2xMissile> = ${record(missiles)};\n`);
  writeD2x('states.ts', `${T('D2xState')}/** the states the skills and potions give (auras, curses, armors, buffs), and those D2's code for the skills sets or checks by id (code), by States.txt name */\nexport const D2X_STATES: Record<string, D2xState> = ${record(states)};\n`);
  writeD2x(
    'calc.ts',
    `${T('D2xCalcCode')}/** D2's frames per second: what frame counts in the skill and missile data are in */\nexport const D2X_FPS = ${FPS};\n\n` +
      `/** the codes a skill or description calc names (SkillCalc.txt); expr: a macro of other codes */\nexport const D2X_SKILL_CALC: Record<string, D2xCalcCode> = ${record(skillCalcTable)};\n\n` +
      `/** the codes a missile calc names (MissCalc.txt); expr: a macro of other codes */\nexport const D2X_MISSILE_CALC: Record<string, D2xCalcCode> = ${record(missCalcTable)};\n`,
  );
  const byFrom = (f) => Object.values(out).filter((s) => s.from.includes(f)).length;
  console.log(
    `skills: ${Object.keys(out).length} skills (${byFrom('class')} class, ${byFrom('monster')} monster, ${byFrom('umod')} modifier, ${byFrom('hireling')} hireling, ${byFrom('summon')} summon), ` +
      `${Object.keys(skillRefs).length} named only, ${Object.keys(missiles).length} missiles, ${Object.keys(states).length} states, ` +
      `${Object.keys(texts).length} texts, ${Object.keys(statIds).length} stats, ${Object.keys(skillCalcTable).length}+${Object.keys(missCalcTable).length} calc codes, ` +
      `${Object.values(gameIds).filter((g) => g.isNew).length} new game skill ids (${gameOnly.join(', ') || 'none'} has no D2 skill)`,
  );
  if (closed.length) console.log(`skills: closed the open ( of ${closed.length} calcs: ${closed.join('; ')}`);
}
