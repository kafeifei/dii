// Crossing from one area into the next (src/world/seams.ts, src/render/arealooks.ts, src/audio/sounds.ts):
// the shares of the areas round a point are all one area deep inside it, half and half on the seam
// and move smoothly between; the ground's per-tile mix of looks sums to one, is pure a few tiles off
// a seam and mixed across it, on a straight seam and on the West overworld's for a few seeds; the
// camp, Blood Moor, Cold Plains, Stony Field and the Burial Grounds each look their own, and their looks blend by share (mist, grade,
// specks) over the sky's grade by night and by day; and each area names its music and ambience,
// D2's SoundEnv deciding which play on from one area into the next, which Sfx.enterArea crossfades.
const SEEDS = [1, 7, 42, 20261026];
/** the renderer's (src/render/renderer.ts GROUND_SEAM, AIR_SEAM) */
const GROUND_SEAM = 2;
const AIR_SEAM = 12;

export default async (load) => {
  // three first, as views.test.mjs does: loaded first through a game module instead, it comes in a
  // second time when that test asks for it
  await load('three');
  const { areaShares, lookMix } = await load('/src/world/seams.ts');
  const { generateOverworld } = await load('/src/world/overworld.ts');
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS, DEN_OF_EVIL, areaDef, areaList } = await load('/src/world/areas.ts');
  const { GROUND_LOOKS, NO_SHIFT, blendAtmos, hasOwnLook, lookOf, newAtmos, shiftGrade } = await load('/src/render/arealooks.ts');
  const { areaSound, soundKey } = await load('/src/audio/sounds.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const near = (a, b, eps) => Math.abs(a - b) <= eps;
  const share = (list, area) => list.find((s) => s.area === area)?.w ?? 0;

  // ── a straight seam: area 1 west of x = 20, area 2 east of it ──
  const W = 40;
  const H = 30;
  const halves = new Uint16Array(W * H).map((_, i) => (i % W < 20 ? 1 : 2));
  const sum = (list) => list.reduce((a, s) => a + s.w, 0);
  const deep = areaShares(halves, W, H, 4, 15, AIR_SEAM);
  check(deep.length === 1 && deep[0].area === 1 && deep[0].w === 1, `deep in area 1: ${JSON.stringify(deep)}`);
  const on = areaShares(halves, W, H, 20, 15, AIR_SEAM);
  check(near(share(on, 1), 0.5, 0.01) && near(sum(on), 1, 1e-9), `on the seam: ${JSON.stringify(on)}`);
  const justIn = areaShares(halves, W, H, 20 - AIR_SEAM, 15, AIR_SEAM);
  check(share(justIn, 1) === 1, `${AIR_SEAM} tiles in from the seam area 1 has ${share(justIn, 1)}`);
  // smooth and one way across, reusing its output
  let last = 1;
  let worst = 0;
  const out = [];
  for (let x = 2; x <= 38; x += 0.05) {
    const s = areaShares(halves, W, H, x, 15, AIR_SEAM, out);
    const a = share(s, 1);
    worst = Math.max(worst, Math.abs(a - last));
    check(a <= last + 1e-9, `area 1's share grew walking east at x ${x.toFixed(2)}`);
    check(near(sum(s), 1, 1e-9), `the shares at x ${x.toFixed(2)} sum to ${sum(s)}`);
    last = a;
  }
  check(worst < 0.01, `area 1's share jumped by ${worst.toFixed(3)} in a 5 cm step`);
  const off = areaShares(halves, W, H, -50, 15, AIR_SEAM);
  check(off.length === 1 && off[0].area === 1, `off the map: ${JSON.stringify(off)}`);

  // the ground's looks: slot 0 for area 1, 1 for area 2
  const [mix] = lookMix(halves, W, H, (a) => a - 1, 2, GROUND_SEAM);
  const reach = 2 * GROUND_SEAM;
  for (let x = 0; x < W; x++) {
    const i = (15 * W + x) * 4;
    const [a, b] = [mix[i], mix[i + 1]];
    check(near(a + b, 255, 2) && mix[i + 2] === 0 && mix[i + 3] === 0, `tile ${x}: shares ${a} ${b} ${mix[i + 2]} ${mix[i + 3]}`);
    const fromSeam = x < 20 ? 19 - x : x - 20;
    if (fromSeam >= reach) check(x < 20 ? a === 255 : b === 255, `tile ${x}, ${fromSeam} from the seam, isn't pure: ${a} ${b}`);
    if (x > 0) check(a <= mix[i - 4], `area 1's ground grew walking east at tile ${x}`);
  }
  const seamTile = (15 * W + 19) * 4;
  check(mix[seamTile] > 128 && mix[seamTile] < 230 && mix[seamTile + 4] < 128 && mix[seamTile + 4] > 25, `either side of the seam: ${mix[seamTile]}, ${mix[seamTile + 4]}`);

  // ── the camp, Blood Moor and Cold Plains each look their own; a dungeon its theme's ──
  const camp = areaDef(CAMP_AREA);
  const moor = areaDef(WILD_AREA);
  const plains = areaDef(COLD_PLAINS);
  for (const a of areaList()) {
    if (a.kind === 'dungeon') continue;
    check(hasOwnLook(a), `${a.key} has no look of its own`);
    check(!!GROUND_LOOKS[lookOf(a, 'town').ground], `${a.key}'s ground ${lookOf(a, 'town').ground} isn't a ground look`);
  }
  const stony = areaDef(STONY_FIELD);
  const barrow = areaDef(BURIAL_GROUNDS);
  const grounds = [camp, moor, plains, stony, barrow].map((a) => lookOf(a, 'town').ground);
  check(new Set(grounds).size === 5, `the camp, Blood Moor, Cold Plains, Stony Field and the Burial Grounds wear grounds ${grounds.join(', ')}`);
  // Stony Field's cliffs are its layout's (Layout.cliffs), its other walls the wilderness's ruins
  check(lookOf(stony, 'town').walls === 'ruins' && lookOf(barrow, 'town').walls === 'ruins', "Stony Field's or the Burial Grounds' walls aren't the wilderness's ruins");
  check(lookOf(camp, 'town').walls === 'palisade' && lookOf(moor, 'town').walls === 'ruins' && lookOf(plains, 'town').walls === 'ruins', 'the palisade is the camp\'s, the ruins the wilderness\'s');
  const den = lookOf(areaDef(DEN_OF_EVIL), 'cave');
  check(den.ground === 'cave' && den.walls === 'wall' && den.grade === NO_SHIFT && den.motes[0]?.[0] === 'cave', `the Den looks like ${JSON.stringify(den)}`);

  // ── their looks blended by share, over the sky's grade ──
  const looks = { [CAMP_AREA]: lookOf(camp, 'town'), [WILD_AREA]: lookOf(moor, 'town'), [COLD_PLAINS]: lookOf(plains, 'town') };
  const look = (a) => looks[a];
  const one = blendAtmos([{ area: COLD_PLAINS, w: 1 }], look, newAtmos());
  const P = looks[COLD_PLAINS];
  check(near(one.mist.opacity, P.mist.opacity, 1e-9) && near(one.grade.saturation, P.grade.saturation, 1e-9) && near(one.grade.tone, P.grade.tone, 1e-9), "one area's air isn't its look");
  check(one.motes.length === P.motes.length && one.motes.every(([k, r], i) => k === P.motes[i][0] && near(r, P.motes[i][1], 1e-9)), `Cold Plains' specks ${JSON.stringify(one.motes)}`);
  const half = blendAtmos([{ area: WILD_AREA, w: 0.5 }, { area: COLD_PLAINS, w: 0.5 }], look, newAtmos());
  const M = looks[WILD_AREA];
  check(near(half.mist.opacity, (M.mist.opacity + P.mist.opacity) / 2, 1e-9), `half and half the mist is ${half.mist.opacity}`);
  check(near(half.grade.saturation, (M.grade.saturation + P.grade.saturation) / 2, 1e-9) && near(half.grade.tone, (M.grade.tone + P.grade.tone) / 2, 1e-9), 'half and half the grade is not between');
  const frost = half.motes.find(([k]) => k === 'frost')?.[1];
  check(near(frost, 0.5, 1e-9), `half in Cold Plains the frost blows at ${frost}`);
  const luma = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
  };
  // the sky's grades by night and at noon (src/render/sky.ts NIGHT, DAY; not loaded here: through
  // post.ts it brings three's postprocessing, a second copy of three under node)
  const SKY = {
    night: { shadow: '#2a3c66', light: '#ffd6a0', split: 0.45, saturation: 0.92, gamma: 1.04, vignette: 0.55, grain: 0.03, bloom: 0.35 },
    day: { shadow: '#3a4252', light: '#fff2dc', split: 0.2, saturation: 0.86, gamma: 1.0, vignette: 0.4, grain: 0.025, bloom: 0.12 },
  };
  const g = {};
  for (const [t, base] of Object.entries(SKY)) {
    const same = shiftGrade(base, NO_SHIFT, {});
    check(same.shadow === base.shadow && same.light === base.light && same.saturation === base.saturation && same.vignette === base.vignette, `no shift isn't the sky's grade by ${t}`);
    for (const a of [CAMP_AREA, WILD_AREA, COLD_PLAINS]) {
      const r = (g[`${a}@${t}`] = shiftGrade(base, blendAtmos([{ area: a, w: 1 }], look, newAtmos()).grade, {}));
      const ok = [r.split, r.saturation, r.gamma, r.vignette, r.grain, r.bloom].every(Number.isFinite) && /^#[0-9a-f]{6}$/.test(r.shadow) && /^#[0-9a-f]{6}$/.test(r.light);
      check(ok, `area ${a} by ${t}: ${JSON.stringify(r)}`);
    }
  }
  // Cold Plains is colder and greyer than Blood Moor, by day and by night; the camp warmer
  for (const t of Object.keys(SKY)) {
    const [c, m, p] = [CAMP_AREA, WILD_AREA, COLD_PLAINS].map((a) => g[`${a}@${t}`]);
    const cool = (x) => luma(x.light).b - luma(x.light).r;
    check(cool(p) > cool(m) && cool(m) > cool(c), `at ${t} the lights' blue over red: camp ${cool(c)}, moor ${cool(m)}, plains ${cool(p)}`);
    check(p.saturation < m.saturation, `at ${t} Cold Plains is as saturated as Blood Moor`);
  }

  // ── on the West overworld: the ground's looks fade across each seam, and the air with the hero ──
  for (const seed of SEEDS) {
    const ow = generateOverworld(seed);
    const { w, h } = ow.map;
    const what = `seed ${seed}`;
    const slot = new Map([[CAMP_AREA, 0], [WILD_AREA, 1], [COLD_PLAINS, 2], [STONY_FIELD, 3], [BURIAL_GROUNDS, 4]]);
    const t = performance.now();
    const mixes = lookMix(ow.areaOf, w, h, (a) => slot.get(a), 5, GROUND_SEAM);
    const ms = performance.now() - t;
    check(ms < 60, `${what}: the ground's look mix took ${ms.toFixed(0)} ms`);
    // slot s's share at tile i, the five over two textures
    const sh = (i, s) => mixes[s >> 2][i * 4 + (s & 3)];
    let mixed = 0;
    let bad = 0;
    for (let i = 0; i < w * h; i++) {
      const v = [0, 1, 2, 3, 4].map((s) => sh(i, s));
      if (!near(v.reduce((a, b) => a + b, 0), 255, 4) || mixes[1][i * 4 + 1] || mixes[1][i * 4 + 2] || mixes[1][i * 4 + 3]) bad++;
      if (Math.max(...v) < 250) mixed++;
    }
    check(!bad, `${what}: ${bad} tile(s) whose looks don't sum to one`);
    check(mixed > 0 && mixed < w * h * 0.1, `${what}: ${mixed} of ${w * h} tiles mixed`);
    for (const s of ow.seams) {
      const at = (p) => Math.floor(p.z) * w + Math.floor(p.x);
      const [ia, ib] = [at(s.ta), at(s.tb)];
      const [sa, sb] = [slot.get(s.a), slot.get(s.b)];
      check(sh(ia, sb) > 20 && sh(ib, sa) > 20, `${what}: across seam ${s.a}-${s.b} the ground doesn't blend (${sh(ia, sb)}, ${sh(ib, sa)})`);
      // further in along the way through, each side's own
      const dx = Math.sign(Math.round(s.tb.x - s.ta.x));
      const dz = Math.sign(Math.round(s.tb.z - s.ta.z));
      const inA = at({ x: s.ta.x - dx * (2 * GROUND_SEAM + 1), z: s.ta.z - dz * (2 * GROUND_SEAM + 1) });
      const inB = at({ x: s.tb.x + dx * (2 * GROUND_SEAM + 1), z: s.tb.z + dz * (2 * GROUND_SEAM + 1) });
      check(sh(inA, sa) >= 250 && sh(inB, sb) >= 250, `${what}: ${2 * GROUND_SEAM + 1} tiles off seam ${s.a}-${s.b} the ground isn't each side's own`);
      // the air, walked through the opening from AIR_SEAM before it to AIR_SEAM past it: from all
      // of the one to all of the other, smoothly
      const shares = [];
      let jump = 0;
      let prev = null;
      for (let k = -AIR_SEAM - 1; k <= AIR_SEAM + 1; k += 0.1) {
        const c = { x: (s.ta.x + s.tb.x) / 2 + dx * k, z: (s.ta.z + s.tb.z) / 2 + dz * k };
        const b = share(areaShares(ow.areaOf, w, h, c.x, c.z, AIR_SEAM), s.b);
        if (prev !== null) jump = Math.max(jump, Math.abs(b - prev));
        prev = b;
        shares.push(b);
      }
      check(shares[0] < 0.02 && shares.at(-1) > 0.98, `${what}: walking through seam ${s.a}-${s.b} area ${s.b}'s share of the air went ${shares[0].toFixed(2)} to ${shares.at(-1).toFixed(2)}`);
      check(jump < 0.03, `${what}: area ${s.b}'s share of the air jumped ${jump.toFixed(3)} in a 10 cm step through seam ${s.a}-${s.b}`);
    }
  }

  // ── each area names its music and ambience (levels.json SoundEnv → soundenviron.json) ──
  for (const a of areaList()) {
    const s = areaSound(a);
    check(/^music\./.test(s.music ?? '') && (s.amb ?? []).length && s.amb.every((id) => /^amb\./.test(id)), `${a.key} names music ${s.music} and ambience ${s.amb}`);
  }
  check(soundKey(areaSound(camp)) !== soundKey(areaSound(moor)), "the camp sounds like Blood Moor: walking out wouldn't crossfade");
  check([plains, stony, barrow].every((a) => soundKey(areaSound(moor)) === soundKey(areaSound(a))), 'Blood Moor, Cold Plains, Stony Field and the Burial Grounds (SoundEnv 2) sound different');
  check(areaSound(camp).music === 'music.town' && areaSound(moor).music === 'music.wild' && areaSound(areaDef(DEN_OF_EVIL)).music === 'music.dungeon', 'the music by SoundEnv');
  // Sfx.enterArea crossfades when the sound changes and plays on when it doesn't (no AudioContext
  // in node: one is pretended, with no recordings, and the beds it starts are watched)
  const sfx = new Sfx();
  const beds = [];
  sfx.files = {};
  sfx.ctx = {};
  sfx.track = () => ({ stop() {} });
  sfx.ambience = (s) => (beds.push(s.bed), { stop() {} });
  const music = [];
  for (const a of [camp, moor, plains, moor, camp, areaDef(DEN_OF_EVIL)]) {
    sfx.enterArea(a);
    music.push(sfx.playing.music);
    check(sfx.area === a, `Sfx's area isn't ${a.key}`);
  }
  check(beds.join(' ') === 'town wild town dungeon', `camp > moor > plains > moor > camp > den started the beds ${beds.join(' ')}`);
  check(music.join(' ') === 'music.town music.wild music.wild music.wild music.town music.dungeon', `and named the music ${music.join(' ')}`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 30).join('\n  ')}`);
};
