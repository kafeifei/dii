// What tools/ai-audio.mjs asks ElevenLabs for. Each entry is one id the game plays (src/audio/sounds.ts):
//   id        a sound id ('combat.swing'), an area's ambience ('amb.town'), or a voice line
//             ('voice.<speaker>.<line>')
//   kind      'sfx' a one-shot effect, mono; 'loop' an ambience, stereo, made seamless; 'voice' a line
//             spoken by a speaker below, mono
//   prompt    what the effect or ambience sounds like (sfx, loop), in English: ElevenLabs follows that best
//   text      the line, as spoken (voice); every character counts a credit
//   duration  seconds asked for (sfx, loop; 0.5 to 30, default 1 and 20), 'auto' to let the model pick:
//             it costs about 10 credits a second either way
//   variants  how many takes (default 1). Variety comes from Sfx picking a take and nudging its pitch,
//             so a second take is for sounds heard over and over, not the rule
//   influence how closely it follows the prompt, 0 to 1 (sfx 0.5, loop 0.3 by default)
//   voice     the speaker (voice; default: the id's second part)
//   gain      times its level in the game (src/audio/files.ts): every take is normalized alike, and
//             this sets it in the mix where the synthesized sound it replaces sat. tools/scenarios/
//             sfx.mjs renders both and fails past 3 dB apart, naming the gain that would match
//   lufs      its loudness instead of the kind's (sfx -16 short-term, voice -18, loop -24 integrated)
//   model     pin a model instead of the tool's choice
// Changing what an entry asks for (prompt, text, duration, influence, voice, model) makes its takes
// again, at a cost; gain only rewrites files.ts, lufs only processes the kept raw output again.

import fs from 'node:fs';

/**
 * Who speaks the voice lines: a voice from ElevenLabs' premade ones (GET /v1/voices, by name or id),
 * all of which read Mandarin with the multilingual models; those named here are verified for it.
 * `settings` go to the API as voice_settings (stability, similarity_boost, style, speed).
 */
export const SPEAKERS = {
  /** the paladin: a deep, steady middle-aged man */
  paladin: { voice: 'Brian' },
  /** the sorceress: a cool, assured woman */
  sorceress: { voice: 'Lily' },
};

/**
 * The heroes' lines, from their script (tools/audio/voice-lines.md, a table of key, when, and each
 * hero's words in 「」): one entry per hero and line, voice.<hero>.<key>. The script is what's
 * written and approved; this only reads it, so a line changed there is made again.
 */
function heroLines() {
  const md = fs.readFileSync(new URL('./voice-lines.md', import.meta.url), 'utf8');
  const heroes = Object.keys(SPEAKERS);
  const out = [];
  for (const row of md.split('\n').filter((l) => l.startsWith('| `'))) {
    const key = row.match(/^\| `([a-z0-9_]+)`/)[1];
    const words = [...row.matchAll(/「([^」]+)」/g)].map((m) => m[1]);
    if (words.length !== heroes.length) throw new Error(`voice-lines.md: ${key} has ${words.length} lines, not one for each of ${heroes.join(', ')}`);
    heroes.forEach((hero, i) => out.push({ id: `voice.${hero}.${key}`, kind: 'voice', text: words[i] }));
  }
  return out;
}

// Sound effects are asked for dry and close, without music: Sfx places them and the mix adds the
// room. One take each, two for what's heard over and over (swings, hits, deaths, the common drops):
// Sfx picks a take and nudges its pitch (VARY in src/audio/sounds.ts), which covers the rest.
// Durations are what's asked for; the takes come back trimmed of their silence.
export default [
  // ---- combat
  // the synthesized swing is soft, as it sounds with every attack; normalized like everything
  // else, its take was 22 dB over it
  { id: 'combat.swing', kind: 'sfx', prompt: 'a single fast sword swing whoosh through the air, close, dry, no impact, no music', duration: 0.6, variants: 2, gain: 0.039 },
  { id: 'combat.swing_blunt', kind: 'sfx', prompt: 'a single heavy mace swung through the air, a deep thick whoosh, close, dry, no impact, no music', duration: 0.6, variants: 2, gain: 0.025 },
  { id: 'combat.swing_heavy', kind: 'sfx', prompt: 'a huge two-handed weapon swung in a wide slow arc, a long deep powerful whoosh, close, dry, no impact, no music', duration: 0.8, variants: 2, gain: 0.023 },
  { id: 'combat.hit', kind: 'sfx', prompt: 'a sword striking flesh, a short wet meaty slash impact, close, dry, no voice, no music', duration: 0.5, variants: 2, gain: 0.17 },
  { id: 'combat.hit_heavy', kind: 'sfx', prompt: 'a brutal crushing blow into a body, a heavy bone-crunching thud, close, dry, no voice, no music', duration: 0.6, variants: 2, gain: 0.31 },
  { id: 'combat.hit_bone', kind: 'sfx', prompt: 'a weapon striking a skeleton, a dry hollow crack of bone and a short rattle, close, no voice, no music', duration: 0.5, variants: 2, gain: 0.13 },
  { id: 'combat.block', kind: 'sfx', prompt: 'a sword blow blocked by a metal shield, a sharp metallic clang ringing briefly, close, dry, no music', duration: 0.7, variants: 2, gain: 0.42 },
  { id: 'combat.arrow', kind: 'sfx', prompt: 'a bow string released and an arrow whooshing away, short, close, dry, no impact, no music', duration: 0.5, gain: 0.034 },

  // ---- monsters: their deaths by kind (their cries come with each milestone's monsters)
  { id: 'monster.swing', kind: 'sfx', prompt: "a monster's claw swiping through the air, a short rough whoosh, close, dry, no voice, no music", duration: 0.5, gain: 0.025 },
  { id: 'monster.die', kind: 'sfx', prompt: 'an undead ghoul dying, a short guttural groan and its body collapsing onto the ground, no music', duration: 1.2, variants: 2, gain: 0.095 },
  { id: 'monster.die_imp', kind: 'sfx', prompt: 'a small demonic imp dying, a short high-pitched shriek cut off, then a light body thud, no music', duration: 0.9, variants: 2, gain: 0.06 },
  { id: 'monster.die_large', kind: 'sfx', prompt: 'a huge beast dying, a deep roaring death groan and a heavy body crashing onto the ground, no music', duration: 1.5, gain: 0.086 },
  { id: 'monster.die_bone', kind: 'sfx', prompt: 'a skeleton collapsing into a pile of bones, dry bones clattering and scattering on a stone floor, no voice, no music', duration: 1, variants: 2, gain: 0.25 },

  // ---- items: each kind lands with its own sound, as in Diablo II
  { id: 'item.drop', kind: 'sfx', prompt: 'a wooden staff dropped onto stony ground, a hollow wooden clack and a short roll, close, dry, no music', duration: 0.5, gain: 0.099 },
  { id: 'item.drop_potion', kind: 'sfx', prompt: 'a small glass potion bottle dropped onto stone, a bright glassy clink and a slosh of liquid, not breaking, close, dry, no music', duration: 0.6, variants: 2, gain: 0.074 },
  { id: 'item.drop_ring', kind: 'sfx', prompt: 'a small gold ring dropped onto a stone floor, a tiny bright metallic ting and a short spin, close, dry, no music', duration: 0.6, gain: 0.088 },
  { id: 'item.drop_amulet', kind: 'sfx', prompt: 'a metal amulet on a fine chain dropped onto stone, a delicate jingle of chain links, close, dry, no music', duration: 0.6, gain: 0.11 },
  { id: 'item.drop_gem', kind: 'sfx', prompt: 'a cut gemstone dropped onto a stone floor, a crisp crystalline click with a tiny glassy chime, close, dry, no music', duration: 0.6, gain: 0.18 },
  { id: 'item.drop_weapon', kind: 'sfx', prompt: 'a steel sword dropped onto a stone floor, a heavy metallic clang and a short rattle, close, dry, no music', duration: 0.7, variants: 2, gain: 0.098 },
  { id: 'item.drop_armor', kind: 'sfx', prompt: 'a chainmail armor dropped onto the ground, a heavy metallic rattle of rings settling, close, dry, no music', duration: 0.7, variants: 2, gain: 0.051 },
  // asked for a "soft muffled" thump, the first take was all but silent (42 dB under full scale)
  { id: 'item.drop_leather', kind: 'sfx', prompt: 'a pair of heavy leather boots dropped onto a wooden floor, a clear dull leather thud, close, dry, no music', duration: 0.5, gain: 0.19 },
  { id: 'item.drop_rune', kind: 'sfx', prompt: 'a small carved stone rune dropped onto stone, a solid stony clack followed by a deep mysterious resonant chime, no music', duration: 1.2, gain: 0.44 },
  { id: 'item.drop_unique', kind: 'sfx', prompt: 'a magical treasure reveal stinger for a fantasy game, a bright shimmering golden chime swell over a soft deep hum, no melody, no drums', duration: 1.5, gain: 0.35 },
  { id: 'item.gold', kind: 'sfx', prompt: 'a small handful of gold coins dropped onto a stone floor, a few bright metallic clinks, close, dry, no music', duration: 0.8, variants: 2, gain: 0.27 },
  { id: 'item.pickup', kind: 'sfx', prompt: 'picking up a small item from the ground, a quick soft rustle of cloth and leather, close, dry, no music', duration: 0.5, variants: 2, gain: 0.017 },
  { id: 'item.move', kind: 'sfx', prompt: 'an item placed into a leather backpack, a short soft leather and cloth shuffle, close, dry, no music', duration: 0.5, gain: 0.016 },
  { id: 'item.equip', kind: 'sfx', prompt: 'putting on a piece of armor, a short metallic buckle clink and a leather strap pulled tight, close, dry, no music', duration: 0.7, gain: 0.059 },
  { id: 'item.socket', kind: 'sfx', prompt: 'a gem snapping firmly into a metal socket, a solid click and a bright magical ping, close, dry, no music', duration: 0.7, gain: 0.26 },
  { id: 'item.runeword', kind: 'sfx', prompt: 'an ancient magical power awakening, a deep resonant gong-like swell with a bright shimmering sparkle on top, fantasy, no melody, no drums', duration: 1.5, gain: 0.39 },
  { id: 'item.transmute', kind: 'sfx', prompt: 'an alchemical transmutation inside a small wooden box, a magical swirling whoosh ending in a soft bright chime, no music', duration: 1.2, gain: 0.11 },
  { id: 'item.drink', kind: 'sfx', prompt: 'drinking a potion from a small glass bottle, two quick gulps and a soft glassy clink, close, dry, no music', duration: 0.8, gain: 0.18 },

  // ---- the hero
  { id: 'player.level_up', kind: 'sfx', prompt: 'a triumphant magical level up sound for a dark fantasy game, a rising bright shimmering swell ending in a warm radiant chord, no drums', duration: 1.5, gain: 0.29 },

  // ---- the interface: one take each, played as recorded (no pitch nudge for ui.*)
  { id: 'ui.click', kind: 'sfx', prompt: 'a single soft click of a small wooden button, very short, close, dry, no music', duration: 0.5, gain: 0.027 },
  { id: 'ui.open', kind: 'sfx', prompt: 'opening a leather satchel, a short soft leather flap and a rustle of parchment, close, dry, no music', duration: 0.5, gain: 0.0082 },
  { id: 'ui.close', kind: 'sfx', prompt: 'closing a leather satchel, a short soft muffled leather flap thump, close, dry, no music', duration: 0.5, gain: 0.02 },
  { id: 'ui.coins', kind: 'sfx', prompt: 'a few gold coins counted into a hand, a short bright jingle, close, dry, no music', duration: 0.6, gain: 0.18 },
  { id: 'ui.skill_learn', kind: 'sfx', prompt: 'a short magical glow sound, a soft bright shimmer rising, fantasy, no music', duration: 0.8, gain: 0.38 },
  { id: 'ui.no_mana', kind: 'sfx', prompt: 'a magic spell fizzling out, a short dull airy puff with a faint sputter, close, dry, no music', duration: 0.5, gain: 0.038 },
  { id: 'ui.no_room', kind: 'sfx', prompt: 'a short dull muffled thump of a stuffed leather bag, close, dry, no music', duration: 0.5, gain: 0.25 },
  { id: 'ui.no_gold', kind: 'sfx', prompt: 'an almost empty coin purse shaken once, a short dull rattle of a single coin, close, dry, no music', duration: 0.5, gain: 0.045 },
  { id: 'ui.cant_use', kind: 'sfx', prompt: 'a short low dull wooden knock, a refusal sound, close, dry, no music', duration: 0.5, gain: 0.13 },
  { id: 'ui.denied', kind: 'sfx', prompt: 'a short low muted stone thud, a failure sound, close, dry, no music', duration: 0.5, gain: 0.25 },

  // ---- the world
  { id: 'env.chest', kind: 'sfx', prompt: 'a heavy wooden treasure chest creaking open, iron hinges squeak and the lid thuds back, close, no music', duration: 1.2, gain: 0.15 },
  { id: 'env.barrel', kind: 'sfx', prompt: 'a wooden barrel smashed open, wooden planks splintering and falling apart, close, no music', duration: 1, variants: 2, gain: 0.14 },
  { id: 'env.shrine', kind: 'sfx', prompt: 'an ancient stone shrine activating, a deep holy resonant hum swelling with a bright shimmering chime, fantasy, no melody', duration: 1.5, gain: 0.12 },
  { id: 'env.portal_open', kind: 'sfx', prompt: 'a magical blue portal opening, a swirling whoosh rising into a humming resonant shimmer, fantasy, no music', duration: 1.5, gain: 0.22 },
  { id: 'env.portal_enter', kind: 'sfx', prompt: 'stepping through a magic portal, a quick deep whoosh and a warping shimmer, fantasy, no music', duration: 1, gain: 0.32 },
  { id: 'env.waypoint', kind: 'sfx', prompt: 'an ancient waypoint teleporter activating, a deep magical hum and a rising airy shimmer ending in a soft whoosh, fantasy, no music', duration: 1.5, gain: 0.22 },
  { id: 'env.vendor_heal', kind: 'sfx', prompt: 'a gentle healing spell, a soft warm shimmering chime with a soft breath of air, fantasy, no music', duration: 1, gain: 0.15 },

  // ---- ambience: an area's loops, by day (amb) and by night (night) in src/audio/sounds.ts
  {
    id: 'amb.town',
    kind: 'loop',
    // the camp by day: nothing that says night, no crickets, no birds
    prompt: 'camp ambience: a crackling campfire close by, a soft steady wind over an open moor, no voices, no music',
    duration: 15,
    gain: 0.39,
  },
  {
    id: 'amb.town_night',
    kind: 'loop',
    prompt: 'camp at night ambience: a crackling campfire close by, crickets chirping in the grass, a soft night wind, a distant owl, no voices, no music',
    duration: 15,
    gain: 0.46,
  },
  {
    id: 'amb.wild',
    kind: 'loop',
    prompt: 'wild moor by day ambience: a steady cold wind over open grassland, grass rustling, a few distant birds calling far away, no voices, no music',
    duration: 16,
    gain: 0.36,
  },
  {
    id: 'amb.wild_night',
    kind: 'loop',
    prompt: 'wild moor at night ambience: a cold wind over open grassland, crickets chirping steadily, grass rustling, no birds, no voices, no music',
    duration: 16,
    gain: 0.36,
  },

  // ---- the heroes' voices
  ...heroLines(),
];
