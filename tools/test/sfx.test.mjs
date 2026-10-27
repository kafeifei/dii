// Sound ids and the rules Sfx plays them by, without an AudioContext: the id table, that every id
// the code plays is in it (and every one in it is played), the hero's lines it says are lines it
// has, the area beds, how loud and where a sound with a place is heard, which voice a new sound takes
// over when the limits are reached (a critical sound must always get one), when a line may be said
// (one at a time, not the same one too often), and what's decoded walking into an area.
// tools/scenarios/sfx.mjs renders the same in a page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATEGORIES = ['combat', 'player', 'item', 'ui', 'skill', 'monster', 'env'];
/** what must never be dropped */
const CRITICAL = ['player.level_up', 'player.hurt', 'item.drop_unique'];
/** more voices than Sfx ever plays at once */
const PLENTY = 64;

/** the game's code and the tools that drive it (not these tests, which name ids of their own) */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && f !== path.join(root, 'tools/test')) walk(f);
      } else if (/\.(ts|mjs|js)$/.test(e.name)) out.push(f);
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'tools'));
  return out;
}

/** the first argument of the call whose `(` is at `open`, as written */
function firstArg(src, open) {
  let depth = 0;
  let quote = null;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) return src.slice(open + 1, i);
      depth--;
    } else if (c === ',' && depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

const literals = (s) => [...s.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
/** the strings an expression can come to: not those it compares against (kind === 'arrow' ? …) */
const results = (s) => literals(s.replace(/[=!]==?\s*('[^'\n]*'|"[^"\n]*")|('[^'\n]*'|"[^"\n]*")\s*[=!]==?/g, ''));

export default async (load) => {
  const { SOUNDS, PRIORITY, HERO_LINES, LINE, ENTER_LINE, AREA_FILES, areaSound, areaKind, soundsNear, heroLine } = await load('/src/audio/sounds.ts');
  const { spatial, earGains, voiceToSteal, PAN_MAX, Lines, LINE_GAP, LINE_AGAIN, LINE_LATE } = await load('/src/audio/sfx.ts');
  const { FILES } = await load('/src/audio/files.ts');
  const { THEMES } = await load('/src/world/levelgen.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);

  const ids = Object.keys(SOUNDS);
  check(ids.length > 0, 'no sound ids');
  for (const id of ids) {
    const [cat, name, more] = id.split('.');
    check(CATEGORIES.includes(cat) && /^[a-z][a-z0-9_]*$/.test(name ?? '') && more === undefined, `${id}: not category.name`);
    const d = SOUNDS[id];
    check(typeof d.synth === 'string', `${id}: no synth`);
    check(d.prio === undefined || d.prio in PRIORITY, `${id}: priority ${d.prio}`);
    check(d.max === undefined || d.max >= 1, `${id}: max ${d.max}`);
    check(d.vol === undefined || d.vol > 0, `${id}: vol ${d.vol}`);
  }
  for (const id of CRITICAL) check(SOUNDS[id]?.prio === 'critical', `${id} is not critical`);

  // every id the code plays is in the table, whether tsc saw it or not (a cast, a tool's page
  // script): each sfx.play call's id, written there or in the variable it passes, and any string
  // anywhere shaped like an id
  const used = new Map();
  const use = (id, where) => {
    check(id in SOUNDS, `${where}: '${id}' is not a sound id`);
    if (!used.has(id)) used.set(id, where);
  };
  const idShaped = new RegExp(`^(${CATEGORIES.join('|')})\\.[a-z0-9_]+$`);
  let calls = 0;
  let says = 0;
  for (const file of sources()) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    const line = (i) => `${rel}:${src.slice(0, i).split('\n').length}`;
    for (const m of src.matchAll(/\bsfx\.play\(/g)) {
      calls++;
      const open = m.index + m[0].length - 1;
      const arg = firstArg(src, open).trim();
      // a hero's line (Game.say): tsc holds it to HERO_LINES, and the says below are checked
      if (arg.startsWith('heroLine(')) continue;
      let named = results(arg);
      if (!named.length && /^[A-Za-z_$][\w$]*$/.test(arg)) {
        // a variable: the ids it is given where it's declared
        const decl = src.slice(0, open).match(new RegExp(`(?:const|let|var)\\s+${arg}\\b[^=]*=([^;]+);(?![\\s\\S]*(?:const|let|var)\\s+${arg}\\b)`));
        named = decl ? results(decl[1]) : [];
      }
      check(named.length > 0, `${line(m.index)}: can't tell which sound sfx.play(${arg}) plays`);
      for (const id of named) use(id, line(m.index));
    }
    // what the hero is made to say, where it's written out
    for (const m of src.matchAll(/\.say\(/g)) {
      says++;
      for (const said of results(firstArg(src, m.index + m[0].length - 1))) check(HERO_LINES.includes(said), `${line(m.index)}: the hero has no line '${said}'`);
    }
    for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`$]*)`/g)) {
      const s = m[1] ?? m[2] ?? m[3];
      if (idShaped.test(s)) use(s, line(m.index));
    }
  }
  check(calls > 50, `only ${calls} sfx.play calls found`);
  check(says > 10, `only ${says} lines said`);
  for (const id of ids) check(used.has(id), `${id}: nothing plays it`);

  // the beds: today a level's theme stands for its area
  for (const [key, t] of Object.entries(THEMES)) {
    const want = t.outdoor ? 'town' : 'dungeon';
    check(areaSound(key).bed === want, `the ${key} theme plays ${areaSound(key).bed}, not ${want}`);
  }
  check(areaSound('title').bed === 'none', `the title screen plays ${areaSound('title').bed}`);
  check(areaSound('nowhere').bed === 'none', `an unknown area plays ${areaSound('nowhere').bed}`);

  // the listener at the origin; the screen's right along +x, 12 m to its edge
  const at = { x: 0, z: 0 };
  const view = { right: { x: 1, z: 0 }, halfWidth: 12 };
  const here = spatial(at, view, { x: 0, z: 0 });
  check(here?.gain === 1 && here.pan === 0, `at the listener: ${JSON.stringify(here)}`);
  // at the listener, each ear gets the sound's own level: as loud as a UI sound
  const ears = earGains(here?.pan ?? NaN);
  check(ears.l === 1 && ears.r === 1, `at the listener the ears get ${JSON.stringify(ears)}, a UI sound 1 and 1`);
  const ahead = spatial(at, view, { x: 0, z: 3 });
  check(ahead?.gain === 1 && ahead.pan === 0, `3 m up the screen: ${JSON.stringify(ahead)}`);
  check(spatial(at, null, { x: 8, z: 0 })?.pan === 0, 'panned with no view');
  for (const halfWidth of [0, NaN]) check(spatial(at, { right: view.right, halfWidth }, { x: 0, z: 0 })?.pan === 0, `pan with a view ${halfWidth} wide`);
  const r = spatial(at, view, { x: 8, z: 0 });
  const l = spatial(at, view, { x: -8, z: 0 });
  check(r && l && r.pan > 0 && l.pan === -r.pan && r.gain === l.gain && r.gain < 1, `8 m right ${JSON.stringify(r)}, left ${JSON.stringify(l)}`);
  // loudness: never below 0 or above 1, falling off with distance, silent past the cutoff
  let last = 1;
  for (let d = 0; d <= 40; d += 0.5) {
    const s = spatial(at, view, { x: 0, z: d });
    const g = s?.gain ?? 0;
    check(s === null || (g >= 0 && g <= 1), `gain ${g} at ${d} m`);
    check(g <= last, `louder at ${d} m (${g}) than nearer (${last})`);
    last = g;
  }
  check(spatial(at, view, { x: 0, z: 40 }) === null, 'heard 40 m away');
  const far = spatial(at, view, { x: 40, z: 0 }, true);
  check(far && far.gain > 0 && far.gain <= 1 && far.pan === PAN_MAX, `a critical sound 40 m right: ${JSON.stringify(far)}`);
  // pan: rising left to right across the screen, all the way at its edge and no further past it,
  // the same at any distance up the screen; a wider view pans the same offset less
  let prev = -Infinity;
  for (let x = -30; x <= 30; x += 0.25) {
    for (const z of [0, 5]) {
      const s = spatial(at, view, { x, z }, true);
      check(s && Math.abs(s.pan) <= PAN_MAX, `panned past PAN_MAX at x ${x}: ${JSON.stringify(s)}`);
      if (Math.abs(x) >= view.halfWidth) check(s?.pan === Math.sign(x) * PAN_MAX, `not panned all the way at x ${x}, past the edge: ${s?.pan}`);
    }
    const pan = spatial(at, view, { x, z: 0 }, true).pan;
    check(pan >= prev, `pan falls from ${prev} to ${pan} at x ${x}`);
    check(pan === spatial(at, view, { x, z: 5 }, true).pan, `pan at x ${x} changes up the screen`);
    prev = pan;
  }
  const wide = { right: view.right, halfWidth: 24 };
  check(spatial(at, wide, { x: 8, z: 0 }).pan === spatial(at, view, { x: 4, z: 0 }).pan, 'a twice as wide view does not pan 8 m like 4 m');
  // the screen's right in any direction: a turned view pans along it
  const turned = { right: { x: Math.SQRT1_2, z: -Math.SQRT1_2 }, halfWidth: 12 };
  const tr = spatial(at, turned, { x: 6, z: -6 }, true);
  check(Math.abs(tr.pan - PAN_MAX * Math.hypot(6, 6) / 12) < 1e-9, `along a turned view's right: ${tr.pan}`);
  check(Math.abs(spatial(at, turned, { x: 6, z: 6 }, true).pan) < 1e-9, 'panned along a turned view\'s up');
  // the ears: the near one keeps its level, the far one is turned down, neither above 1 or below 0
  let lastFar = 1;
  for (let p = 0; p <= PAN_MAX + 1e-9; p += 0.05) {
    const a = earGains(p);
    const b = earGains(-p);
    check(a.r === 1 && b.l === 1, `the near ear is turned down at pan ${p}: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
    check(a.l === b.r && a.l > 0 && a.l <= lastFar, `the far ear at pan ${p}: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
    lastFar = a.l;
  }

  // voices: room, an id past its own limit, and every voice busy
  const voice = (id, i) => ({ id, prio: PRIORITY[SOUNDS[id].prio ?? 'normal'], start: i });
  check(voiceToSteal([], 'combat.hit', SOUNDS['combat.hit']) === -1, 'no room with nothing playing');
  const hits = Array.from({ length: SOUNDS['combat.hit'].max }, (_, i) => voice('combat.hit', 10 - i));
  check(voiceToSteal(hits, 'combat.hit', SOUNDS['combat.hit']) === hits.length - 1, 'a hit past its limit does not take over the oldest hit');
  check(voiceToSteal(hits, 'combat.hit_bone', SOUNDS['combat.hit_bone']) === -1, 'another id is held back by the hits');
  // fill every voice, the overall limit being somewhere below PLENTY
  const busy = (ids) => {
    const out = [];
    for (let i = 0; out.length < PLENTY; i++) {
      const id = ids[i % ids.length];
      const v = voice(id, i);
      // ids at their own limit would take over themselves: give each voice its own id to look at
      out.push({ ...v, id: `${id}#${i}` });
    }
    return out;
  };
  const normals = busy(['combat.hit', 'monster.die']);
  check(voiceToSteal(normals, 'monster.swing', SOUNDS['monster.swing']) === null, 'a low sound took a voice from a normal one');
  check(voiceToSteal(normals, 'skill.fire_cast', SOUNDS['skill.fire_cast']) === 0, 'a normal sound did not take over the oldest normal one');
  const mixed = busy(['ui.click', 'monster.swing', 'combat.hit']);
  check(voiceToSteal(mixed, 'skill.fire_cast', SOUNDS['skill.fire_cast']) === 1, 'a normal sound did not take over the oldest low one');
  const criticals = busy(['player.level_up', 'item.drop_unique']);
  for (const id of CRITICAL) {
    check(voiceToSteal(criticals, id, SOUNDS[id]) === 0, `${id} found no voice among critical ones`);
    check(voiceToSteal(normals, id, SOUNDS[id]) === 0, `${id} found no voice among normal ones`);
  }

  // lines: as critical as they come, never off pitch, one at a time
  check(LINE.prio === 'critical' && LINE.vary === 0 && LINE.max === 1 && !LINE.synth, `a line plays as ${JSON.stringify(LINE)}`);
  for (const [kind, said] of Object.entries(ENTER_LINE)) check(HERO_LINES.includes(said), `walking into a ${kind} area the hero says '${said}', not one of its lines`);
  {
    const L = new Lines();
    const a = L.book('voice.paladin.no_mana', 10);
    check(a && L.start(a, 10, 1.5), 'a line asked for with nothing said was not said');
    check(L.book('voice.paladin.bag_full', 10.5) === null, 'a line started over another');
    check(L.book('voice.paladin.bag_full', 10 + 1.5 + LINE_GAP - 0.01) === null, 'a line started right after another, with no pause');
    const b = L.book('voice.paladin.bag_full', 10 + 1.5 + LINE_GAP);
    check(b && L.start(b, 10 + 1.5 + LINE_GAP, 1), 'a line after the last and its pause was not said');
    const free = 10 + 1.5 + LINE_GAP + 1 + LINE_GAP;
    check(L.book('voice.paladin.no_mana', free) === null && free - 10 < LINE_AGAIN, 'the same line said again too soon');
    const c = L.book('voice.paladin.no_mana', 10 + LINE_AGAIN);
    check(c !== null, `the same line not said again ${LINE_AGAIN} s on`);
    // still decoding: nothing else meanwhile; come too late, it isn't said and the floor is free
    const t = 10 + LINE_AGAIN;
    check(L.book('voice.paladin.unique', t + LINE_LATE / 2) === null, 'a line started while another was decoding');
    check(c && !L.start(c, t + LINE_LATE + 0.1, 1), 'a line decoded too late to go with its moment was said');
    const d = L.book('voice.paladin.unique', t + LINE_LATE + 0.1);
    check(d !== null, 'the floor stayed taken after a line came too late');
    // one that won't load gives the floor up at once
    L.drop(d, t + LINE_LATE + 0.2);
    const e = L.book('voice.paladin.rune', t + LINE_LATE + 0.2);
    check(e !== null && !L.start(d, t + LINE_LATE + 0.3, 1), 'a line given up on was said, or kept the floor');
    // one never heard from again: once LINE_LATE is past, the next may book, and the old one can't start
    const f = L.book('voice.paladin.shrine', t + 2 * LINE_LATE + 0.3);
    check(f !== null && !L.start(e, t + 2 * LINE_LATE + 0.3, 1), 'a line left booked kept the floor, or started after it was taken');
  }

  // walking in: the camp warms no fighting, the wilderness does; the ways out's ambience and the
  // line for walking into another kind of area, in the hero's own voice, and nothing that isn't a sound
  for (const cls of ['paladin', 'sorceress']) {
    const town = soundsNear('town', ['wild'], false, cls);
    const wild = soundsNear('wild', ['town', 'crypt'], true, cls);
    const crypt = soundsNear('crypt', ['crypt'], false, cls);
    check(!town.some((id) => id.startsWith('combat.') || id.startsWith('monster.')) && town.includes('item.pickup'), `the camp warms ${town.filter((id) => id.startsWith('combat.')).join(' ') || 'no pickup'}`);
    check(wild.includes('combat.hit') && wild.includes('monster.die'), 'the wilderness warms no fighting');
    check(town.includes('amb.wild') && wild.includes('amb.town_night') && !wild.includes('amb.wild_night'), `ways out's ambience: ${town.filter((id) => id.startsWith('amb.'))} / ${wild.filter((id) => id.startsWith('amb.'))}`);
    check(town.includes(heroLine(cls, 'enter_wild')) && wild.includes(heroLine(cls, 'back_in_town')) && wild.includes(heroLine(cls, 'enter_dungeon')), `${cls}: no line warmed for walking into the next areas`);
    check(!crypt.some((id) => id.startsWith('voice.')), `${cls}: floor to floor warms ${crypt.filter((id) => id.startsWith('voice.'))}`);
    for (const id of [...town, ...wild, ...crypt]) check(id in SOUNDS || AREA_FILES.includes(id) || id in FILES, `warmed: ${id} is no sound, area recording or line on file`);
    check(soundsNear('title', [], false, cls).length === 0, 'the title screen warms sounds');
  }
  check(areaKind('town') === 'town' && areaKind('wild') === 'outdoor' && areaKind('hell') === 'dungeon' && areaKind('title') === null, 'area kinds');

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${ids.length} sound ids, ${calls} sfx.play calls, all ids played and in the table; ${says} lines said`);
};
