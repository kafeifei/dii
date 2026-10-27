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

// No voice lines yet: they're written with the first names in M1 and approved, then made at the end
// of a month's budget, once the game has something that plays voice.* (an entry is
// { id: 'voice.paladin.no_mana', kind: 'voice', text: '…' }).
export default [
  // a first few, to try the pipeline on before the month's batch. The synthesized swing is soft, as
  // it sounds with every attack; normalized like everything else, its take was 22 dB over it
  { id: 'combat.swing', kind: 'sfx', prompt: 'a single fast sword swing whoosh through the air, close, dry, no impact, no music', duration: 0.6, gain: 0.07 },
  { id: 'item.gold', kind: 'sfx', prompt: 'a small handful of gold coins dropped onto a stone floor, a few bright metallic clinks, close, dry, no music', duration: 0.8, gain: 0.27 },
  {
    id: 'amb.town',
    kind: 'loop',
    // by day as by night (the sky turns over the camp): nothing that says which, no crickets, no birds
    prompt: 'camp ambience: a crackling campfire close by, a soft steady wind over an open moor, no voices, no music',
    duration: 15,
    gain: 0.39,
  },
];
