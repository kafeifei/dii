// AI replacements for pack props: key (the model the game asks for), orig (the pack source, for
// its bounds), src (the avatar project's assets/<set>/<id>) or file (any glb under it). Without
// orig the model is new: it keeps its generated size. See tools/ai-props.mjs.
//   yaw       degrees to turn the generated model before fitting
//   fit       'height' to match the original's height even if it gets wider (default: fit its box)
//   scale     multiplier on the fitted size
//   alignX/Z  'min' | 'max' to sit flush with that side of the original instead of centring it
//   split     { name, above }: cut the top off into its own mesh (chest lids)
//   box       [w, h, d] metres for a new model (no orig) to fit
//   tris      simplify to this many triangles
//   texture   texture size (default 512)
export const ASSETS = '../avatar/assets';

/** dungeon pack (d_*): same id in the avatar's dungeon set */
const d = (id, extra = {}) => ({ key: `d_${id}`, orig: `dungeon/${id}.glb`, src: `dungeon/${id}`, ...extra });
/**
 * Graveyard pieces drawn in other proportions than the pack's: match one side instead of fitting
 * inside its box (thin pack trees and crosses, flat bones, low benches, long fences).
 */
const GRAVEYARD_FIT = {
  ...Object.fromEntries(['tree_dead_small', 'tree_dead_medium', 'tree_dead_large', 'tree_pine_orange_medium', 'tree_pine_yellow_large', 'gravemarker_A', 'pillar', 'fence_pillar'].map((id) => [id, { fit: 'height' }])),
  ...Object.fromEntries(['bone_A', 'bone_B', 'bone_C', 'bench', 'fence', 'fence_broken', 'arch_gate'].map((id) => [id, { fit: 'width' }])),
};
/** Halloween pack (h_*): same id in the avatar's graveyard set */
const h = (id, extra = {}) => ({ key: `h_${id}`, orig: `halloween/${id}.gltf`, src: `graveyard/${id}`, ...extra });
/** hung on a wall: the back sits on the original's back plane */
const wall = (id, extra = {}) => d(id, { alignZ: 'min', ...extra });

export const PROPS = [
  // pilot
  { key: 'd_barrel_large', orig: 'dungeon/barrel_large.glb', src: 'pilot/barrel' },
  { key: 'd_box_large', orig: 'dungeon/box_large.glb', src: 'pilot/crate' },
  { key: 'h_gravestone', orig: 'halloween/gravestone.gltf', src: 'pilot/tombstone' },
  { key: 'd_torch_mounted', orig: 'dungeon/torch_mounted.glb', src: 'pilot/wall_torch', alignZ: 'min' },
  // dungeon
  d('chest_gold', { split: { name: 'chest_gold_lid', above: 0.62 } }),
  d('trunk_medium_A'),
  d('table_long_broken'),
  d('trunk_large_A', { scale: 1.3 }), // the camp stash: a long trunk would come out half height
  d('trunk_large_B'),
  d('trunk_small_A'),
  d('coin_stack_small'),
  d('pillar_decorated', { fit: 'height' }),
  d('pillar', { fit: 'height' }),
  d('table_long_decorated_A'),
  d('table_long_tablecloth_decorated_A'),
  d('table_medium_decorated_A'),
  d('table_small_decorated_A'),
  d('chair'),
  d('stool'),
  d('bed_frame'),
  d('bed_decorated'),
  d('barrel_small'),
  d('barrel_large_decorated'),
  d('barrel_small_stack'),
  d('box_small'),
  d('box_stacked'),
  d('crates_stacked'),
  d('keg'),
  d('keg_decorated'),
  d('candle_lit', { scale: 2 }), // the dish makes it wide; a candle this short is lost on the floor
  d('candle_triple'),
  d('bottle_A_labeled_brown'),
  d('sword_shield_broken'),
  d('rubble_half'),
  d('rubble_large'),
  wall('banner_patternA_red', { fit: 'height' }),
  wall('banner_patternB_red', { fit: 'height' }),
  wall('banner_shield_red', { fit: 'height' }),
  wall('banner_thin_red', { fit: 'height' }),
  wall('sword_shield'),
  wall('keyring_hanging', { fit: 'height' }),
  wall('shelves'),
  wall('shelf_small_candles'),
  // crypt / graveyard (h_*)
  ...['shrine', 'coffin', 'coffin_decorated', 'skull_candle', 'bone_A', 'bone_B', 'bone_C', 'ribcage', 'skull', 'shrine_candles', 'plaque_candles', 'bench',
    'bench_decorated', 'post_skull', 'grave_A', 'grave_B', 'gravemarker_A', 'gravemarker_B', 'grave_A_destroyed', 'candle_melted', 'tree_dead_small',
    'tree_dead_medium', 'tree_dead_large', 'tree_pine_orange_medium', 'tree_pine_yellow_large', 'lantern_standing', 'post_lantern', 'pillar', 'crypt',
    'fence', 'fence_broken', 'fence_pillar', 'arch_gate'].map((id) => h(id, GRAVEYARD_FIT[id])),
  // camp buildings and nature (x_*)
  ...['tavern', 'home_A', 'home_B', 'blacksmith', 'well'].map((id) => ({ key: `x_${id}`, orig: `hexagon/building_${id}_red.gltf`, src: `town/${id}` })),
  // the pack's trees are thin and its rocks flat: match the trees' height and the rocks' width
  ...['tree_single_A', 'tree_single_B'].map((id) => ({ key: `x_${id}`, orig: `hexagon/${id}.gltf`, src: `town/${id}`, fit: 'height' })),
  ...['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'].map((id) => ({ key: `x_${id}`, orig: `hexagon/${id}.gltf`, src: `town/${id}`, fit: 'width' })),
  // camp pieces and dungeon decor the game used to build from boxes (p_*)
  { key: 'p_campfire', src: 'town/campfire', box: [1.5, 0.45, 1.5] },
  { key: 'p_tent', src: 'town/tent', box: [3.0, 2.1, 3.2] },
  { key: 'p_waypoint', src: 'town/waypoint', box: [2.8, 0.9, 2.8] },
  { key: 'p_entrance', src: 'town/dungeon_entrance', box: [2.6, 2.6, 2.6] },
  { key: 'p_brazier', src: 'town/brazier', box: [0.7, 1.05, 0.7], fit: 'height' },
  { key: 'p_skullpile', src: 'decor/skullpile', box: [0.8, 0.5, 0.8] },
  { key: 'p_cage', src: 'decor/cage', box: [0.9, 1.5, 0.9] },
  { key: 'p_banner', src: 'decor/banner', box: [0.9, 2.6, 0.6], fit: 'height' },
  { key: 'p_stalagmite', src: 'decor/stalagmite', box: [0.9, 1.6, 0.9] },
  { key: 'p_crystal', src: 'decor/crystal', box: [0.8, 1.2, 0.8] },
  // held weapons and shields: KayKit pieces, plus new ones fitted to a KayKit piece of their size
  // so the grip lands in the hand the same way (blades up +Y, flat side facing z)
  // Meshy builds the one-handed sword twice side by side, however often it's asked; the greatsword is the same blade
  { key: 'skeleton_blade', orig: 'kaykit/Skeleton_Blade.gltf', src: 'gear/greatsword', fit: 'height' },
  { key: 'skeleton_axe', orig: 'kaykit/Skeleton_Axe.gltf', src: 'gear/skeleton_axe', fit: 'height' },
  { key: 'axe_1handed', orig: 'kaykit/axe_1handed.gltf', src: 'gear/axe', fit: 'height' },
  { key: 'axe_2handed', orig: 'kaykit/axe_2handed.gltf', src: 'gear/greataxe', fit: 'height' },
  { key: 'skeleton_staff', orig: 'kaykit/Skeleton_Staff.gltf', src: 'gear/bone_staff', fit: 'height', largest: true },
  { key: 'skeleton_crossbow', orig: 'kaykit/Skeleton_Crossbow.gltf', src: 'gear/crossbow', pitch: 90 },
  { key: 'skeleton_shield_small_a', orig: 'kaykit/Skeleton_Shield_Small_A.gltf', src: 'gear/shield_round' },
  { key: 'skeleton_shield_large_a', orig: 'kaykit/Skeleton_Shield_Large_A.gltf', src: 'gear/shield_tower' },
  { key: 'w_greatsword', orig: 'kaykit/Skeleton_Blade.gltf', src: 'gear/greatsword', fit: 'height', scale: 1.3 },
  { key: 'w_mace', orig: 'kaykit/Skeleton_Axe.gltf', src: 'gear/mace', fit: 'height' },
  { key: 'w_maul', orig: 'kaykit/axe_2handed.gltf', src: 'gear/maul', fit: 'height' },
  { key: 'w_staff', orig: 'kaykit/Skeleton_Staff.gltf', src: 'gear/staff', fit: 'height', largest: true },
  { key: 'w_cleaver', orig: 'kaykit/axe_2handed.gltf', src: 'gear/cleaver', fit: 'height' },
  // items lying on the ground (g_*), metres
  { key: 'g_helm', src: 'gear/helm', box: [0.34, 0.34, 0.34] },
  { key: 'g_armor', src: 'gear/armor', box: [0.6, 0.22, 0.75], pitch: -90 },
  { key: 'g_gloves', src: 'gear/gloves', box: [0.4, 0.12, 0.32], fit: 'width' },
  { key: 'g_boots', src: 'gear/boots', box: [0.4, 0.38, 0.32] },
  { key: 'g_belt', src: 'gear/belt', box: [0.42, 0.1, 0.42], fit: 'width' },
  { key: 'g_ring', src: 'gear/ring', box: [0.16, 0.08, 0.16] },
  { key: 'g_amulet', src: 'gear/amulet', box: [0.28, 0.06, 0.32], pitch: -90 },
  { key: 'g_potion', src: 'gear/potion', box: [0.2, 0.3, 0.2] },
  { key: 'g_rune', src: 'gear/rune', box: [0.2, 0.06, 0.24], pitch: -90 },
  // monsters that aren't humanoid: one piece, moved in code (ModelSpec.motion)
  { key: 'mon_spider', file: '../viewer/public/models/spider/model.glb', tris: 8000 },
  { key: 'mon_bat', file: '../viewer/public/models/bat/model.glb', tris: 8000 },
  { key: 'mon_dragon', file: '../viewer/public/models/dragon/model.glb', tris: 8000 },
  { key: 'mon_skullfly', src: 'monsters/skullfly' },
];
