// Which Meshy clips make up each AI character, and the names the game plays them under.
// Used by tools/meshy-merge.mjs. `src` is the folder the avatar pipeline exported to.
//
//   file / clip   source glb and clip name (Meshy names clips by the animation library key)
//   inPlace       drop the root's horizontal drift so the sim, not the clip, moves the body
//   quick         'attack' | 'cast': cut to the swing / release, placed where the sim resolves
//                 it (attacks at 50% of the action, casts at 55%); found automatically as the
//                 frame where a hand reaches furthest forward (lunging clips won't cut cleanly)
//   range         [from, to] seconds to search for that frame (combos: pick one blow)
//   window        explicit [start, end] seconds instead of `quick`
//   reverse       play it backwards (a death run backwards is the skeletons' revive)
//   aim           turn the body so the drawn bow (right hand to left) points ahead at the clip's
//                 half-way point, where the sim looses the arrow: Meshy's archer shoots to her left

const AVATAR = '../avatar/viewer/public/models';

/** the free walk / run the rigging step exports alongside the rig */
const BASIC_MOVES = [
  { name: 'Walk', file: 'basic_walk.glb', clip: 'Armature|walking_man|baselayer', inPlace: true },
  { name: 'Run', file: 'basic_run.glb', clip: 'Armature|running|baselayer', inPlace: true },
];

/**
 * An AI monster from the avatar's batch.mjs + rig-batch.mjs: clips from its animations.glb, in place
 * unless they say otherwise, plus the free basic walk / run where it has no walk of its own.
 */
const mon = (dir, clips) => ({
  src: `${AVATAR}/${dir}`,
  base: 'animations.glb',
  clips: [
    ...clips.map((c) => ({ file: 'animations.glb', inPlace: true, ...c })),
    ...BASIC_MOVES.filter((b) => !clips.some((c) => c.name === b.name)),
  ],
});
/** hit and fall clips keep their root motion: the body is knocked back */
const HIT = { name: 'Hit', clip: 'Hit_Reaction', inPlace: false };
const DEATH = { name: 'Death', clip: 'dying_backwards', inPlace: false };
/** skeletons get back up when a shaman revives them: their death, backwards */
const REVIVE = { name: 'Revive', clip: 'dying_backwards', inPlace: false, reverse: true };

export const CHARS = {
  sorceress: {
    src: `${AVATAR}/sorceress`,
    base: 'animations.glb',
    clips: [
      { name: 'Idle', file: 'animations.glb', clip: 'Idle_3', inPlace: true },
      { name: 'Walk', file: 'animations.glb', clip: 'Walking_Woman', inPlace: true },
      { name: 'Run', file: 'animations.glb', clip: 'Run_02', inPlace: true },
      // text-to-motion staff swing
      { name: 'Attack', file: 'motion_attack.glb', clip: 'retarget_clip', window: [0.1, 0.9], inPlace: true },
      { name: 'Cast', file: 'animations_extra.glb', clip: 'mage_soell_cast', window: [1.39, 2.19], inPlace: true },
      { name: 'Hit', file: 'animations_hit.glb', clip: 'Hit_Reaction_1' },
      { name: 'Death', file: 'animations_hit.glb', clip: 'dying_backwards' },
    ],
  },
  paladin: {
    src: `${AVATAR}/paladin`,
    base: 'animations.glb',
    clips: [
      { name: 'Idle', file: 'animations.glb', clip: 'Combat_Stance', inPlace: true },
      { name: 'Walk', file: 'animations.glb', clip: 'Casual_Walk', inPlace: true },
      { name: 'Run', file: 'animations.glb', clip: 'Run_03', inPlace: true },
      { name: 'Attack', file: 'animations.glb', clip: 'Left_Slash', quick: 'attack', inPlace: true },
      { name: 'Attack2H', file: 'animations.glb', clip: 'Attack', quick: 'attack', inPlace: true },
      { name: 'Attack2H2', file: 'animations.glb', clip: 'Heavy_Hammer_Swing', quick: 'attack', inPlace: true },
      { name: 'Block', file: 'animations.glb', clip: 'Sword_Parry', inPlace: true },
      { name: 'Cast', file: 'animations.glb', clip: 'mage_soell_cast', quick: 'cast', inPlace: true },
      { name: 'Hit', file: 'animations_extra.glb', clip: 'Hit_Reaction' },
      { name: 'Death', file: 'animations_extra.glb', clip: 'dying_backwards' },
    ],
  },
  // monsters (mon_*); the batch exports name clips by library key
  mon_skeleton: mon('skeleton', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Right_Hand_Sword_Slash', quick: 'attack' },
    { name: 'Attack2', clip: 'Left_Slash', quick: 'attack' },
    { name: 'Block', clip: 'Sword_Parry' },
    HIT, DEATH, REVIVE,
  ]),
  mon_skeleton_elite: mon('skeleton_warrior', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Right_Hand_Sword_Slash', quick: 'attack' },
    { name: 'Attack2', clip: 'Left_Slash', quick: 'attack' },
    { name: 'Block', clip: 'Sword_Parry' },
    HIT, DEATH, REVIVE,
  ]),
  mon_skelarcher: mon('skelarcher', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Archery_Shot', quick: 'attack' },
    HIT, DEATH, REVIVE,
  ]),
  mon_skelmage: mon('skelmage', [
    { name: 'Idle', clip: 'Idle' },
    // the sorceress's cast, cut the same way
    { name: 'Attack', clip: 'mage_soell_cast', window: [1.39, 2.19] },
    { name: 'Cast', clip: 'Charged_Spell_Cast', quick: 'cast' },
    HIT, DEATH, REVIVE,
  ]),
  mon_shaman: mon('shaman', [
    { name: 'Idle', clip: 'Idle' },
    { name: 'Attack', clip: 'mage_soell_cast', window: [1.39, 2.19] },
    { name: 'Cast', clip: 'mage_soell_cast', window: [1.39, 2.19] },
    HIT, DEATH,
  ]),
  mon_wraith: mon('wraith', [
    { name: 'Idle', clip: 'Idle' },
    { name: 'Attack', clip: 'mage_soell_cast', window: [1.39, 2.19] },
    HIT, DEATH,
  ]),
  mon_mushroom: mon('mushroom', [
    { name: 'Idle', clip: 'Idle' },
    { name: 'Attack', clip: 'Punch_Forward_with_Both_Fists', quick: 'attack' },
    HIT, DEATH,
  ]),
  mon_yeti: mon('yeti', [
    { name: 'Idle', clip: 'Chest_Pound_Taunt' },
    { name: 'Attack', clip: 'Left_Hook_from_Guard', quick: 'attack' },
    { name: 'Attack2', clip: 'Right_Uppercut_from_Guard', quick: 'attack' },
    HIT, DEATH,
  ]),
  mon_butcher: mon('butcher', [
    { name: 'Idle', clip: 'Axe_Stance' },
    { name: 'Attack', clip: 'Heavy_Hammer_Swing', quick: 'attack' },
    { name: 'Attack2', clip: 'Charged_Axe_Chop', quick: 'attack' },
    { name: 'Attack3', clip: 'Axe_Spin_Attack', quick: 'attack' },
    { name: 'Charge', clip: 'Male_Head_Down_Charge' },
    HIT, DEATH,
  ]),
  mon_ghoul: mon('ghoul', [
    { name: 'Idle', clip: 'Idle' },
    { name: 'Attack', clip: 'Left_Hook_from_Guard', quick: 'attack' },
    { name: 'Attack2', clip: 'Right_Upper_Hook_from_Guard', quick: 'attack' },
    HIT, DEATH,
  ]),
  mon_demon: mon('demon', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Heavy_Hammer_Swing', quick: 'attack' },
    { name: 'Attack2', clip: 'Punch_Combo', quick: 'attack' },
    HIT, DEATH,
  ]),
  mon_lich: mon('lich', [
    { name: 'Idle', clip: 'Idle' },
    { name: 'Attack', clip: 'mage_soell_cast', window: [1.39, 2.19] },
    { name: 'Cast', clip: 'Charged_Spell_Cast', quick: 'cast' },
    HIT, DEATH,
  ]),
  mon_overlord: mon('overlord', [
    { name: 'Idle', clip: 'Chest_Pound_Taunt' },
    { name: 'Attack', clip: 'Heavy_Hammer_Swing', quick: 'attack' },
    { name: 'Attack2', clip: 'Punch_Combo', quick: 'attack' },
    HIT, DEATH,
  ]),
  // re-rigged 2026-10-30 (avatar zombie_rise: the same mesh, Meshy having dropped the 2026-10-09 rig) so
  // a rise joins its clips on one skeleton: the dead Blood Raven raises and the caskets let out come up
  // in D2's S1 (monstats spawn mode; D2GAME_SpawnTrapMonster mode 8), lying on its back, sitting up and
  // getting to its feet over 1.8 s, the hips kept over the spot it rises on
  mon_zombie: mon('zombie_rise', [
    { name: 'Idle', clip: 'Idle' },
    { name: 'Walk', clip: 'Monster_Walk' },
    { name: 'Attack', clip: 'Punch_Forward_with_Both_Fists', quick: 'attack' },
    HIT,
    { name: 'Death', clip: 'Knock_Down', inPlace: false },
    { name: 'Rise', file: 'animations_extra.glb', clip: 'Arise' },
  ]),
  // the Moongazer Tribe (D2 goatman1-5, Code GM: one body, BaseW 2hs with a two-handed weapon in the
  // right hand, MonStats2 RHv btx hal lax mau scy whm, the spec's to attach). Modes DT NU WL GH A1 DD
  // KB SQ (no RN: its +100 % lurch plays the run): A1 the two-handed overhead swing. From the avatar's
  // act1 goatwarrior (concept drawn from words alone, 2026-10-26); the free basic walk, its own
  // Slow_Orc_Walk being a crawl for D2's velocity
  mon_goatman: mon('goatwarrior', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Heavy_Hammer_Swing', quick: 'attack' },
    HIT, DEATH,
  ]),
  mon_imp: mon('imp', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Right_Hand_Sword_Slash', quick: 'attack' },
    { name: 'Attack2', clip: 'Left_Slash', quick: 'attack' },
    HIT, DEATH,
  ]),
  // the corrupted rogues (D2 corruptrogue* / cr_lancer* / cr_archer*: one body, three weapons);
  // which clip each plays is the spec's choice (src/render/specs.ts)
  mon_rogue_fallen: mon('rogue_fallen', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Right_Hand_Sword_Slash', quick: 'attack' },
    // a lunge: in place it rocks forward and back
    { name: 'Thrust', clip: 'Thrust_Slash', quick: 'attack', range: [0.5, 1.2] },
    // raise, draw and loose at full draw (2.7 s), put half-way as quick: 'attack' would; quick
    // can't find the loose itself: the furthest-reaching hand is the bow arm, held out through the
    // whole aim, and it picks the bow being lowered
    { name: 'Shoot', clip: 'Archery_Shot', window: [1.9, 3.5], aim: true },
    HIT, DEATH,
  ]),
  // the Scarlet Raven (D2 bloodraven, the corrupted rogues' CR body with her own head and legs,
  // monstats2 HDv/LGv brv): a model of her own, drawn empty-handed (her long war bow, LHv lbb, is the
  // spec's to attach). Modes DT NU WL GH A1 S1 DD KB SQ RN (monstats2 m*): A1 the shot (her quick
  // strike, monseq seq_brquickstrike, is its frames 0-6), S1 raising her dead (seq_bloodravencast,
  // 20 frames at 25 fps = 0.8 s)
  mon_bloodraven: mon('bloodraven', [
    // she stands guard upright: Combat_Stance crouches and bows her head, hiding her face from the
    // game's camera, so it is only her ready stance
    { name: 'Idle', file: 'animations_extra.glb', clip: 'Idle_3' },
    { name: 'Stance', clip: 'Combat_Stance' },
    { name: 'Walk', clip: 'Walking_Woman' },
    { name: 'Run', clip: 'Run_02' },
    // the rangers' cut of the same clip
    { name: 'Shoot', clip: 'Archery_Shot', window: [1.9, 3.5], aim: true },
    // the charged cast's second half: both hands sweep up from low in front to overhead, at the
    // top about half-way through, where the sim resolves a cast (QUICK.cast at 55%)
    { name: 'Cast', clip: 'Charged_Spell_Cast', window: [1.45, 2.25] },
    HIT, DEATH,
  ]),
  // camp folk only stand around (and walk when the camp gets busier); prefixed so they don't
  // collide with the KayKit bodies of the same name
  npc_vendor: { src: `${AVATAR}/vendor`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle_9', inPlace: true }, ...BASIC_MOVES] },
  npc_mercenary: { src: `${AVATAR}/barbarian`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle_02', inPlace: true }, ...BASIC_MOVES] },
  npc_rogue: { src: `${AVATAR}/rogue`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle_3', inPlace: true }, ...BASIC_MOVES] },
  npc_warden: { src: `${AVATAR}/warden`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle', inPlace: true }, ...BASIC_MOVES] },
  // the scout mercenary (D2 roguehire): the camp rogues' body (Code RG, as rogue1-3), so npc_rogue's
  // mesh, re-rigged in the avatar as merc_rogue (Meshy had dropped the 2026-10-09 rig) so all her
  // clips share one skeleton. Modes DT NU WL GH A1 DD KB RN (monstats2 m*); every skill she has
  // plays A1 (hireling.txt Mode1-3 = 4), so one Shoot. Merged at npc_rogue's triangles: the merge
  // and the build budget by prefix, and merc_ has none.
  merc_rogue: {
    ...mon('merc_rogue', [
      { name: 'Idle', clip: 'Idle_3' },
      { name: 'Shoot', clip: 'Archery_Shot', window: [1.9, 3.5], aim: true },
      HIT, DEATH,
    ]),
    tris: 15000,
  },
};
