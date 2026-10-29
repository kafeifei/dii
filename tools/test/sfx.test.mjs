// Sound ids and the rules Sfx plays them by, without an AudioContext: the id table, that every id
// the code plays is in it (and every one in it is played), the hero's lines it says are lines it
// has, the area beds and when they change (walking to and fro over a seam, not at every step), how
// loud and where a sound with a place is heard, which voice a new sound takes
// over when the limits are reached (a critical sound must always get one), when a line may be said
// (one at a time, not the same one too often) and in which take (at random, never the last one
// again, only that one decoded), a townsperson's line taking the floor and giving it back when cut
// short, said by its own clock (heard from its start when it's in at once, joining its text where
// that has got to when it comes late), their greeting said beside the hero's line, and what's
// decoded walking into an area, or fetched ahead and decoded only when it's said (the line said next
// first, the rest keeping to the network's holds and making way, what the camp warms after that line).
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
  const { Sfx, spatial, earGains, voiceToSteal, PAN_MAX, Lines, LINE_GAP, LINE_AGAIN, LINE_LATE, SPEECH_LATE, SPEECH_WAIT, SPEECH_CUT, JOIN_MIN } = await load('/src/audio/sfx.ts');
  const { NPC_LINE, npcLine } = await load('/src/audio/sounds.ts');
  const { FILES } = await load('/src/audio/files.ts');
  const { Buffers } = await load('/src/audio/buffers.ts');
  const { THEMES, WILD_MAPS, isWild, dungeonFloor, themeForFloor } = await load('/src/world/levelgen.ts');
  const { areaDef, areaForDepth, dungeonArea, CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL } = await load('/src/world/areas.ts');
  const camp = areaDef(CAMP_AREA);
  const moor = areaDef(WILD_AREA);
  const plains = areaDef(COLD_PLAINS);
  const den = areaDef(DEN_OF_EVIL);
  const floor = (f) => areaDef(dungeonArea(f));
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
    // a template literal is taken whole, its substitutions and all, so its closing backtick isn't
    // read as the opening of another (a type like `${C}.${…}` hid every string after it in a file);
    // only one with no substitution can be an id
    for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`((?:[^`\\]|\\[\s\S])*)`/g)) {
      const s = m[1] ?? m[2] ?? (m[3].includes('${') ? '' : m[3]);
      if (idShaped.test(s)) use(s, line(m.index));
    }
  }
  check(calls > 50, `only ${calls} sfx.play calls found`);
  check(says > 10, `only ${says} lines said`);
  for (const id of ids) check(used.has(id), `${id}: nothing plays it`);

  // the beds, by area: the camp's wind and fire, the wilderness's wind, a drone underground; the
  // camp, the wilderness and a floor of each dungeon theme
  for (const depth of [0, ...Array.from({ length: WILD_MAPS }, (_, i) => i + 1), ...[1, 5, 9, 13].map((f) => WILD_MAPS + f)]) {
    const theme = depth === 0 ? THEMES.town : isWild(depth) ? THEMES.wild : themeForFloor(dungeonFloor(depth));
    const want = depth === 0 ? 'town' : theme.outdoor ? 'wild' : 'dungeon';
    const a = areaForDepth(depth);
    check(areaSound(a).bed === want, `${a.name} (area ${a.id}) plays ${areaSound(a).bed}, not ${want}`);
  }
  check(areaSound('title').bed === 'none', `the title screen plays ${areaSound('title').bed}`);
  check(areaSound('nowhere').bed === 'none', `an unknown screen plays ${areaSound('nowhere').bed}`);

  // from area to area, with no recordings, a bed starts only when it changes: the drone plays on
  // from floor to floor (into the cave too); the camp's fire fades out into the wilderness's wind.
  // Node has no AudioContext, so one is pretended and only the ambience Sfx starts is watched
  const quiet = () => {
    const sfx = new Sfx();
    const started = [];
    sfx.files = {};
    sfx.ctx = { currentTime: 0 };
    sfx.track = () => ({ stop() {} });
    sfx.ambience = (s) => (started.push(s.bed), { stop() {} });
    return { sfx, started };
  };
  {
    const { sfx, started } = quiet();
    const walk = [0, 1, WILD_MAPS + 1, WILD_MAPS + 2, WILD_MAPS + 5, 0].map(areaForDepth);
    for (const a of walk) sfx.enterArea(a);
    sfx.enterArea('title');
    const beds = started.join(' ');
    check(beds === 'town wild dungeon town none', `${walk.map((a) => a.key).join(' > ')} > title started the beds ${beds}, want town wild dungeon town none`);
  }

  // walking to and fro over the camp's seam (Game passes `walked`): out into Blood Moor the wind
  // takes over at once; a step back within SWITCH_HOLD waits, and comes to nothing if the hero has
  // stepped out again by then; still in the camp when the hold is up, its fire comes back. A jump
  // never waits, and Blood Moor into Cold Plains has nothing to switch
  {
    const { sfx, started } = quiet();
    const at = (t, a, walked = true) => {
      sfx.ctx.currentTime = t;
      sfx.enterArea(a, walked);
    };
    at(0, camp, false);
    at(10, moor);
    at(10.3, camp);
    at(10.6, moor);
    at(10.9, camp);
    const held = sfx.holding !== null && sfx.area === camp && sfx.playing.bed === 'wild';
    check(held, `stepping back into the camp 0.9 s after leaving it: held ${sfx.holding !== null}, Sfx's area ${sfx.area?.key}, playing ${sfx.playing.bed}`);
    // the hold's timer, run by hand
    clearTimeout(sfx.holding);
    sfx.ctx.currentTime = 12;
    sfx.settle(false);
    check(sfx.playing.bed === 'town', `the hold up with the hero in the camp, it plays ${sfx.playing.bed}`);
    at(12.5, moor);
    check(sfx.holding !== null && sfx.playing.bed === 'town', 'walking out again at once did not wait');
    // a waypoint to Cold Plains, then back into Blood Moor on foot and into the camp long after
    at(12.6, plains, false);
    check(sfx.holding === null && sfx.playing.bed === 'wild', `a jump during a hold: held ${sfx.holding !== null}, playing ${sfx.playing.bed}`);
    at(13, moor);
    check(sfx.holding === null && sfx.area === moor, 'Cold Plains into Blood Moor waited for something');
    at(20, camp);
    const beds = started.join(' ');
    check(beds === 'town wild town wild town', `to and fro over the camp's seam started the beds ${beds}, want town wild town wild town`);
  }

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

  // a line in several takes: each time one at random, never the one heard last, every one in turn;
  // the same line not again within LINE_AGAIN whatever take it's in. A take booked and never heard
  // (decoded too late, or not at all) doesn't count as the last one
  {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const L = new Lines();
    const id = 'voice.sorceress.rune';
    const seen = new Set();
    let prev;
    for (let k = 0; k < 200; k++) {
      const t = 100 + k * (LINE_AGAIN + 0.5);
      const b = L.book(id, t, 4, rand);
      const why = !b || !L.start(b, t, 1.5)
        ? `a line in four takes not said ${LINE_AGAIN + 0.5} s after the last time`
        : !(Number.isInteger(b.take) && b.take >= 0 && b.take < 4 && b.take !== prev)
          ? `take ${b.take} of four said after take ${prev}`
          : L.book(id, t + 1.5 + LINE_GAP, 4, rand) !== null
            ? `a line said again ${1.5 + LINE_GAP} s on, in another take`
            : null;
      // the first failure alone, not two hundred of it
      if (why) {
        problems.push(why);
        break;
      }
      seen.add(b.take);
      prev = b.take;
    }
    check(seen.size === 4, `a line's four takes: only ${[...seen].join(', ')} ever said`);
    const M = new Lines();
    const first = () => 0;
    const a = M.book(id, 0, 4, first);
    check(a?.take === 0 && M.start(a, 0, 1), `the first take of a line not said first with rand 0: ${a?.take}`);
    const b = M.book(id, LINE_AGAIN, 4, first);
    check(b?.take === 1, `after take 0, take ${b?.take} with rand 0, not 1`);
    M.drop(b, LINE_AGAIN);
    const c = M.book(id, 2 * LINE_AGAIN, 4, first);
    check(c?.take === 1, `a take dropped unheard counted as the last one: take ${c?.take} next, not 1`);
    const one = M.book('voice.paladin.no_gold', 3 * LINE_AGAIN, 1, () => 0.99);
    check(one?.take === 0 && M.start(one, 3 * LINE_AGAIN, 1) && M.book('voice.paladin.no_gold', 4 * LINE_AGAIN, 1, () => 0.99)?.take === 0, 'a line of one take not said in it every time');
  }
  // a townsperson's line of dialogue (Sfx.speak, solo: Lines.claim) takes the floor whatever holds it:
  // over the hero mid-line, over a line still decoding (never said after), however lately it was said,
  // as it goes with its text; it holds the floor for as long as its text runs (its take's length),
  // its recording coming or not, and may join that text any time before its end. Cut short, the floor
  // is the hero's again after LINE_GAP, at once if it hadn't started; a cut of a line gone by changes
  // nothing. A greeting or a farewell (not solo: Lines.aside) is said beside the hero's line: it
  // neither takes the floor nor waits for it nor drops the hero's line decoding, never in the take
  // heard last, and only within SPEECH_LATE
  {
    check(NPC_LINE.prio === 'critical' && NPC_LINE.vary === 0 && NPC_LINE.vol < LINE.vol && Math.abs(NPC_LINE.vol / LINE.vol - 210 / 255) < 0.01, `a townsperson's line plays as ${JSON.stringify(NPC_LINE)}`);
    check(npcLine('akara', 'remindOut', 'a1q1') === 'voice.akara.a1q1_remind_out' && npcLine('akara', 'gossip2') === 'voice.akara.gossip2', `npcLine: ${npcLine('akara', 'remindOut', 'a1q1')}`);
    const L = new Lines();
    const a = L.book('voice.paladin.no_mana', 10);
    check(a && L.start(a, 10, 3), 'a line with nothing said was not said');
    const q = L.claim('voice.akara.a1q1_intro', 10.5, 1, [30]);
    check(L.book('voice.paladin.bag_full', 11) === null, 'the hero spoke over a townsperson');
    check(L.book('voice.paladin.bag_full', 10.5 + SPEECH_WAIT + 29) === null, "the hero spoke over a townsperson's line whose recording hasn't come, its text still running");
    // its recording come 20 s late, 20 s into its text: it joins it, and the floor is held to its end
    const end = 30.5 + 10.25;
    check(L.start(q, 30.5, 10.25), "a townsperson's line come late didn't join its text");
    check(L.book('voice.paladin.bag_full', end + LINE_GAP - 0.01) === null && L.book('voice.paladin.bag_full', end + LINE_GAP) !== null, `a line joined late gave the floor back at ${end + LINE_GAP}, not after its end and LINE_GAP`);
    const r = L.claim('voice.akara.a1q1_remind', 50, 1, [10]);
    check(!L.start(r, 50 + SPEECH_WAIT + 10 + 0.01, 0.5), "a townsperson's line come after its text was over was said");
    const M = new Lines();
    const held = M.book('voice.paladin.rune', 20);
    const f = M.claim('voice.akara.gossip0', 20.1, 1, [6]);
    check(!M.start(held, 20.2, 1) && M.start(f, 20.2, 6), "a hero's line still decoding was said after a townsperson took the floor");
    M.cut(f, 21);
    check(M.book('voice.paladin.shrine', 21 + LINE_GAP - 0.01) === null && M.book('voice.paladin.shrine', 21 + LINE_GAP) !== null, `cut short, the hero speaks again ${LINE_GAP} s on`);
    const N = new Lines();
    const n1 = N.claim('voice.akara.a1q1_intro', 30, 1, [30]);
    N.cut(n1, 30.2);
    check(N.book('voice.paladin.rune', 30.2) !== null && !N.start(n1, 30.3, 30), 'a line cut before it started kept the floor, or started');
    const n2 = N.claim('voice.akara.gossip0', 40, 1, [6]);
    const n3 = N.claim('voice.akara.gossip1', 40.1, 1, [5]);
    check(!N.start(n2, 40.2, 5) && N.start(n3, 40.2, 5), 'a townsperson line taken over before it started was said');
    N.cut(n2, 41);
    check(N.book('voice.paladin.rune', 41 + LINE_GAP) === null, 'the cut of a line gone by freed the floor from the one being said');
    // a greeting beside the hero's line: neither cut nor held off, nor holding the floor
    const first = () => 0;
    const A = new Lines();
    const h = A.book('voice.paladin.rune', 60);
    check(h && A.start(h, 60, 2), "the hero's line not said");
    const g = A.aside('voice.akara.greeting', 60.5, 3, first);
    check(g.take === 0 && A.start(g, 60.5 + SPEECH_LATE - 0.01, 1.9), "a greeting kept from being said beside the hero's line, or by coming within SPEECH_LATE");
    check(A.book('voice.paladin.shrine', 60 + 2 + LINE_GAP) !== null, 'a greeting held the floor from the hero');
    const g2 = A.aside('voice.akara.greeting', 70, 3, first);
    check(g2.take === 1, `the same greeting's take twice running: ${g2.take}`);
    check(!A.start(g2, 70 + SPEECH_LATE + 0.01, 1.9), 'a greeting come too late was said');
    const g3 = A.aside('voice.akara.farewell', 80, 3, first);
    check(A.start(g3, 80, 2) && A.book('voice.paladin.bag_full', 80.5) !== null, 'the hero kept from speaking over a farewell');
    const decoding = A.book('voice.paladin.no_gold', 90);
    A.aside('voice.akara.greeting', 90.1, 3);
    check(A.start(decoding, 90.2, 1), "a hero's line still decoding given up for a greeting");
  }

  // and Sfx.speak by the line's clock, on a pretended context (each take decoded when the test says):
  // a line in within SPEECH_WAIT heard from its start, the clock starting with it; one come later
  // joining where the clock has got to, fading in; one with too little left, not at all. A greeting
  // never cuts the hero off, only a word of the townsperson's own still being said, and is said whole
  {
    const sfx = new Sfx();
    const take = (id, n = 1) => `${id}.${n}.m4a`;
    const ids = ['voice.akara.a', 'voice.akara.b', 'voice.akara.c'];
    sfx.files = Object.fromEntries(ids.map((id) => [id, { files: [take(id)], secs: [10] }]));
    sfx.files['voice.akara.greeting'] = { files: [1, 2, 3].map((n) => take('voice.akara.greeting', n)), secs: [1.5, 1.5, 1.5] };
    sfx.ctx = { currentTime: 0 };
    const gates = new Map();
    sfx.buffers = new Buffers((url) => new Promise((r) => gates.set(url.split('/').pop(), () => r({ length: 48000 * 10, numberOfChannels: 1, duration: 10, url }))));
    const played = [];
    sfx.sound = (sid, def, opts, t) => {
      const v = { id: sid, def, start: sfx.ctx.currentTime, end: sfx.ctx.currentTime + 0.005 + (t.buf.duration - t.lead), lead: t.lead, fade: t.fade ?? 0 };
      played.push(v);
      return v;
    };
    // (a voice cut short: it ends now)
    sfx.cut = (v) => {
      v.cut = true;
      v.end = Math.min(v.end, sfx.ctx.currentTime);
    };
    let hushes = 0;
    const hush = sfx.hush.bind(sfx);
    sfx.hush = () => {
      hushes++;
      hush();
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const at = async (t, file) => {
      sfx.ctx.currentTime = t;
      if (file) {
        gates.get(file)();
        await tick();
      }
    };
    const near = (x, y) => Math.abs(x - y) < 1e-9;
    // in at once: from its start
    const s1 = sfx.speak('voice.akara.a');
    check(s1 && s1.secs === 10 && s1.elapsed() === 0 && hushes === 1, `a line asked for: ${JSON.stringify({ secs: s1?.secs, hushes })}`);
    await at(0.1, take('voice.akara.a'));
    const p1 = played.at(-1);
    check(p1?.id === 'voice.akara.a' && p1.lead === 0 && p1.fade === 0 && s1.joined === 0 && p1.def === NPC_LINE, `a line in within SPEECH_WAIT didn't start from its start: ${JSON.stringify(p1)}`);
    await at(2.105);
    check(near(s1.elapsed(), 2), `2 s after its recording started, its clock says ${s1.elapsed()}`);
    s1.stop();
    check(s1.stopped && near(s1.elapsed(), 2), 'stopped, its clock went on');
    // in 3 s late: its text has scrolled on, and the recording joins it there, fading in
    await at(20);
    const s2 = sfx.speak('voice.akara.b');
    await at(20 + SPEECH_WAIT / 2);
    check(s2.elapsed() === 0, 'the text left its start before SPEECH_WAIT was up');
    await at(22);
    check(near(s2.elapsed(), 2 - SPEECH_WAIT), `2 s on, no recording yet, its clock says ${s2.elapsed()}, not ${2 - SPEECH_WAIT}`);
    await at(23, take('voice.akara.b'));
    const p2 = played.at(-1);
    const off = 23 + 0.005 - (20 + SPEECH_WAIT);
    check(p2?.id === 'voice.akara.b' && near(p2.lead, off) && near(s2.joined, off) && p2.fade === SPEECH_CUT, `come 3 s late, it started ${p2?.lead} s in (fading over ${p2?.fade}), not ${off}`);
    await at(25);
    check(near(s2.elapsed(), 25 - 20 - SPEECH_WAIT), `joined late, its clock says ${s2.elapsed()}`);
    check(sfx.lines.book('voice.paladin.rune', 25) === null, 'the hero spoke over a line joined late');
    const s2secs = await s2.started;
    check(s2secs === 10, `a line's length told as ${s2secs}`);
    s2.stop();
    // in with less than JOIN_MIN left: not started, its text going on without it
    await at(40);
    const s3 = sfx.speak('voice.akara.c');
    const n = played.length;
    await at(40 + SPEECH_WAIT + 10 - JOIN_MIN / 2, take('voice.akara.c'));
    check(played.length === n && (await s3.started) === null, 'a line come with less than JOIN_MIN of it left was started');
    // a greeting beside the hero's line: no hush, the hero's floor untouched; said whole, or not at all
    await at(60);
    const hero = sfx.lines.book('voice.paladin.no_mana', 60);
    sfx.lines.start(hero, 60, 2);
    const h0 = hushes;
    const g1 = sfx.speak('voice.akara.greeting', { solo: false });
    check(g1 && hushes === h0, 'a greeting cut the hero off');
    const gfile = played.length;
    const gtake = [...gates.keys()].find((f) => f.startsWith('voice.akara.greeting'));
    await at(60.5, gtake);
    const pg = played[gfile];
    check(pg?.id === 'voice.akara.greeting' && pg.lead === 0 && pg.fade === 0, `a greeting in 0.5 s late wasn't said whole: ${JSON.stringify(pg)}`);
    check(sfx.lines.book('voice.paladin.bag_full', 60 + 2 + LINE_GAP) !== null, 'a greeting held the floor from the hero');
    // a farewell asked for while the greeting is said: the greeting gives way, the hero doesn't
    const f1 = sfx.speak('voice.akara.greeting', { solo: false });
    check(g1.stopped && f1 && !f1.stopped && hushes === h0, `a second word of hers: the first ${g1.stopped ? 'gave way' : 'went on'}, hushes ${hushes - h0}`);
  }

  // fetched ahead (Sfx.prefetch): each take's file, one at a time in the order asked; asked again,
  // what's no longer wanted is let go; a take decoded uses the bytes fetched ahead (a copy), and one
  // only queued is fetched at once. Nothing is fetched where nothing could play it
  {
    const realFetch = globalThis.fetch;
    const hadAC = 'AudioContext' in globalThis;
    const asked = [];
    const pending = [];
    globalThis.fetch = (url) => {
      asked.push(String(url).split('/').pop());
      return new Promise((r) => pending.push(() => r({ ok: true, headers: { get: () => 'audio/mp4' }, arrayBuffer: async () => new ArrayBuffer(16) })));
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    try {
      const sfx = new Sfx();
      sfx.files = { 'voice.akara.x': { files: ['x.1.m4a'] }, 'voice.akara.y': { files: ['y.1.m4a', 'y.2.m4a'] }, 'voice.akara.z': { files: ['z.1.m4a'] } };
      sfx.prefetch(['voice.akara.x']);
      check(!asked.length, `fetched ahead with no WebAudio to play it: ${asked.join(' ')}`);
      globalThis.AudioContext = class {};
      sfx.prefetch(['voice.akara.x', 'voice.akara.y', 'voice.akara.nothing']);
      check(asked.join() === 'x.1.m4a', `fetching ahead started with ${asked.join(' ')}, not x.1.m4a alone`);
      pending.shift()();
      await tick();
      await tick();
      check(asked.join() === 'x.1.m4a,y.1.m4a', `after the first: ${asked.join(' ')}`);
      // asked again for z and x: y.2 isn't fetched; z after y.1, which is under way
      sfx.prefetch(['voice.akara.z', 'voice.akara.x']);
      pending.shift()();
      await tick();
      await tick();
      check(asked.join() === 'x.1.m4a,y.1.m4a,z.1.m4a' && !sfx.ahead.has('/audio/y.1.m4a') && sfx.ahead.has('/audio/x.1.m4a'), `asked again: fetched ${asked.join(' ')}, ahead ${[...sfx.ahead.keys()].join(' ')}`);
      // decoding x takes its bytes from what was fetched ahead, a copy each time
      const b1 = await sfx.bytes('/audio/x.1.m4a');
      const b2 = await sfx.bytes('/audio/x.1.m4a');
      check(asked.length === 3 && b1.byteLength === 16 && b1 !== b2, `decoding what was fetched ahead fetched again (${asked.join(' ')}), or gave the same buffer twice`);
      // queued, not yet fetched: asked for, it's fetched at once
      sfx.prefetch(['voice.akara.x', 'voice.akara.z', 'voice.akara.y']);
      const now = sfx.bytes('/audio/y.2.m4a');
      check(asked.at(-1) === 'y.2.m4a', `a take asked for while queued waited its turn: ${asked.join(' ')}`);
      while (pending.length) pending.shift()();
      check((await now).byteLength === 16, 'a take fetched out of turn has no bytes');
    } finally {
      globalThis.fetch = realFetch;
      if (!hadAC) delete globalThis.AudioContext;
    }
  }

  // the line said next (the first asked for: every take of it) is fetched ahead at once, whatever holds
  // the network; the others not while it's held (Network: the model library's holds), and the one under
  // way with most of its file to go stops to make way, first in the queue again, to start over once the
  // network is free; the line said next never stops. In the camp what's warmed (preload) waits for the
  // line said next to come; elsewhere it doesn't
  {
    const realFetch = globalThis.fetch;
    const hadAC = 'AudioContext' in globalThis;
    const asked = [];
    const pending = new Map();
    globalThis.fetch = (url, opts = {}) => {
      const file = String(url).split('/').pop();
      asked.push(file);
      return new Promise((r, no) => {
        pending.set(file, () => r({ ok: true, headers: { get: () => 'audio/mp4' }, arrayBuffer: async () => new ArrayBuffer(16) }));
        opts.signal?.addEventListener('abort', () => {
          pending.delete(file);
          no(new DOMException('stopped', 'AbortError'));
        });
      });
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const come = async (file) => {
      pending.get(file)?.();
      pending.delete(file);
      await tick();
      await tick();
    };
    try {
      globalThis.AudioContext = class {};
      const sfx = new Sfx();
      let held = true;
      sfx.network = { busy: () => held };
      sfx.files = { 'voice.akara.g': { files: ['g.1.m4a', 'g.2.m4a'] }, 'voice.akara.x': { files: ['x.1.m4a'] }, 'voice.akara.y': { files: ['y.1.m4a'] } };
      // in the camp, with something to decode with: what it warms noted, not decoded
      sfx.area = camp;
      sfx.ctx = {};
      const warmed = [];
      sfx.load = (id) => (warmed.push(id), Promise.resolve(true));
      sfx.prefetch(['voice.akara.g', 'voice.akara.x', 'voice.akara.y']);
      check(asked.join() === 'g.1.m4a', `held, fetching ahead began with ${asked.join(' ') || 'nothing'}, not the line said next`);
      const warm = sfx.preload(['ui.click']);
      sfx.makeWay();
      await tick();
      check(!warmed.length && pending.has('g.1.m4a'), `in the camp before the line said next: warmed ${warmed.join(' ') || 'nothing'}, the line ${pending.has('g.1.m4a') ? 'coming' : 'stopped to make way'}`);
      await come('g.1.m4a');
      check(asked.join() === 'g.1.m4a,g.2.m4a' && !warmed.length, `held, after the line's first take: fetched ${asked.join(' ')}, warmed ${warmed.join(' ') || 'nothing'}`);
      await come('g.2.m4a');
      await warm;
      check(warmed.join() === 'ui.click' && asked.length === 2, `the line said next in: warmed ${warmed.join(' ') || 'nothing'}, fetched ${asked.join(' ')} while held`);
      held = false;
      sfx.free();
      check(asked.at(-1) === 'x.1.m4a', `freed: fetched ${asked.join(' ')}`);
      // made way while under way: stopped, first in the queue again, not fetched while held, then again
      held = true;
      sfx.makeWay();
      await tick();
      await tick();
      check(!pending.has('x.1.m4a') && sfx.aheadQueue[0] === '/audio/x.1.m4a' && sfx.ahead.has('/audio/x.1.m4a'), `made way: ${pending.has('x.1.m4a') ? 'still coming' : 'stopped'}, queued ${sfx.aheadQueue.join(' ')}`);
      sfx.free();
      check(asked.filter((f) => f === 'x.1.m4a').length === 1, `held, a line that made way started over: ${asked.join(' ')}`);
      held = false;
      sfx.free();
      check(asked.filter((f) => f === 'x.1.m4a').length === 2, `freed, a line that made way didn't start over: ${asked.join(' ')}`);
      await come('x.1.m4a');
      check(asked.at(-1) === 'y.1.m4a' && (await sfx.ahead.get('/audio/x.1.m4a')).byteLength === 16, `after it: fetched ${asked.join(' ')}`);
      await come('y.1.m4a');
      // out of the camp what's warmed doesn't wait for a line said next
      const out = new Sfx();
      out.network = { busy: () => true };
      out.files = { 'voice.akara.z': { files: ['z.1.m4a'] } };
      out.area = moor;
      out.ctx = {};
      const warmedOut = [];
      out.load = (id) => (warmedOut.push(id), Promise.resolve(true));
      out.prefetch(['voice.akara.z']);
      await out.preload(['combat.hit']);
      check(warmedOut.join() === 'combat.hit' && pending.has('z.1.m4a'), `out of the camp: warmed ${warmedOut.join(' ') || 'nothing'} while the line said next came`);
      await come('z.1.m4a');
    } finally {
      globalThis.fetch = realFetch;
      if (!hadAC) delete globalThis.AudioContext;
    }
  }

  // and Sfx says the take booked, decoding only it: a pretended context, its decoder only noting the URL
  {
    const sfx = new Sfx();
    const id = 'voice.paladin.rune';
    const files = [1, 2, 3, 4].map((n) => `${id}.${n}.m4a`);
    sfx.files = { [id]: { files, gain: 0.5 } };
    sfx.ctx = { currentTime: 0 };
    const decoded = [];
    sfx.buffers = new Buffers((url) => (decoded.push(url), Promise.resolve({ length: 48000, numberOfChannels: 1, duration: 1, url })));
    const said = [];
    sfx.sound = (sid, def, opts, take) => said.push({ sid, def, url: take?.buf.url, gain: take?.gain });
    const tick = () => new Promise((r) => setTimeout(r, 0));
    for (let k = 0; k < 40; k++) {
      sfx.ctx.currentTime = k * (LINE_AGAIN + 1);
      sfx.play(id);
      await tick();
      // asked again a moment later: not said
      sfx.ctx.currentTime += 3;
      sfx.play(id);
      await tick();
    }
    const urls = said.map((x) => x.url);
    const turns = urls.filter((u, i) => i > 0 && u === urls[i - 1]).length;
    check(said.length === 40 && said.every((x) => x.sid === id && x.def === LINE && x.gain === 0.5), `40 times asked, ${LINE_AGAIN + 1} s apart, a line of four takes said ${said.length} times (each asked again 3 s on)`);
    check(turns === 0, `a take said twice running ${turns} times: ${urls.map((u) => u?.match(/\.(\d)\.m4a$/)?.[1]).join('')}`);
    check(files.every((f) => urls.some((u) => u?.endsWith(f))), `of four takes only ${new Set(urls).size} ever said`);
    check(new Set(decoded).size === decoded.length && decoded.length === 4 && decoded.every((u) => urls.includes(u)), `decoded ${decoded.length} files for a line of four takes, said in ${new Set(urls).size}: each once, as it's first said`);
    check(!decoded.length || decoded[0] === urls[0], `the line's first time decoded ${decoded[0]}, said ${urls[0]}`);
  }

  // walking in: the camp warms no fighting, the wilderness does; the next areas' ambience (across a
  // seam, down a cave mouth) and the line for walking into another kind of area, in the hero's own
  // voice, and nothing that isn't a sound
  for (const cls of ['paladin', 'sorceress']) {
    const town = soundsNear(camp, [moor], false, cls);
    const wild = soundsNear(moor, [camp, den], true, cls);
    const crypt = soundsNear(floor(1), [floor(2)], false, cls);
    // the wilderness on into the wilderness: nothing to say there
    const plainsNext = soundsNear(moor, [plains], false, cls);
    check(!plainsNext.some((id) => id.startsWith('voice.')), `${cls}: Blood Moor warms a line for Cold Plains: ${plainsNext.filter((id) => id.startsWith('voice.'))}`);
    check(!town.some((id) => id.startsWith('combat.') || id.startsWith('monster.')) && town.includes('item.pickup'), `the camp warms ${town.filter((id) => id.startsWith('combat.')).join(' ') || 'no pickup'}`);
    check(wild.includes('combat.hit') && wild.includes('monster.die'), 'the wilderness warms no fighting');
    check(town.includes('amb.wild') && wild.includes('amb.town_night') && !wild.includes('amb.wild_night'), `ways out's ambience: ${town.filter((id) => id.startsWith('amb.'))} / ${wild.filter((id) => id.startsWith('amb.'))}`);
    check(town.includes(heroLine(cls, 'enter_wild')) && wild.includes(heroLine(cls, 'back_in_town')) && wild.includes(heroLine(cls, 'enter_dungeon')), `${cls}: no line warmed for walking into the next areas`);
    check(!crypt.some((id) => id.startsWith('voice.')), `${cls}: floor to floor warms ${crypt.filter((id) => id.startsWith('voice.'))}`);
    for (const id of [...town, ...wild, ...crypt]) check(id in SOUNDS || AREA_FILES.includes(id) || id in FILES, `warmed: ${id} is no sound, area recording or line on file`);
    check(soundsNear('title', [], false, cls).length === 0, 'the title screen warms sounds');
  }
  check(areaKind(camp) === 'town' && areaKind(moor) === 'outdoor' && areaKind(den) === 'dungeon' && areaKind(floor(13)) === 'dungeon' && areaKind('title') === null, 'area kinds');

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  console.log(`  ${ids.length} sound ids, ${calls} sfx.play calls, all ids played and in the table; ${says} lines said`);
};
