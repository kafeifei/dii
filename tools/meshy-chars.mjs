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
  mon_zombie: mon('zombie', [
    { name: 'Idle', clip: 'Idle' },
    { name: 'Walk', clip: 'Monster_Walk' },
    { name: 'Attack', clip: 'Punch_Forward_with_Both_Fists', quick: 'attack' },
    HIT,
    { name: 'Death', clip: 'Knock_Down', inPlace: false },
  ]),
  mon_imp: mon('imp', [
    { name: 'Idle', clip: 'Combat_Stance' },
    { name: 'Attack', clip: 'Right_Hand_Sword_Slash', quick: 'attack' },
    { name: 'Attack2', clip: 'Left_Slash', quick: 'attack' },
    HIT, DEATH,
  ]),
  // camp folk only stand around (and walk when the camp gets busier); prefixed so they don't
  // collide with the KayKit bodies of the same name
  npc_vendor: { src: `${AVATAR}/vendor`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle_9', inPlace: true }, ...BASIC_MOVES] },
  npc_mercenary: { src: `${AVATAR}/barbarian`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle_02', inPlace: true }, ...BASIC_MOVES] },
  npc_rogue: { src: `${AVATAR}/rogue`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle_3', inPlace: true }, ...BASIC_MOVES] },
  npc_warden: { src: `${AVATAR}/warden`, base: 'animations.glb', clips: [{ name: 'Idle', file: 'animations.glb', clip: 'Idle', inPlace: true }, ...BASIC_MOVES] },
};
