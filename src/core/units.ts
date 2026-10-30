// D2's units in the game's: the one place they turn into metres and seconds. D2 measures lengths in
// subtiles (a tile is 5 × 5 of them), speeds in velocity points and time in frames; the game's world
// is in metres, a tile of our maps being one. Everything that carries one of D2's lengths, speeds or
// frame counts over reads it from here: stats.ts (MPS_PER_VELOCITY, M_PER_SUBTILE), zone.ts
// (OUT_SCALE), objgroups.ts (SUB), monai.ts (subtiles, frames), monstats.ts, frames.ts.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.

/** D2's frames a second: what its frame counts (lengths, delays, a frame's regeneration) are in */
export const FRAMES_PER_SEC = 25;

/** subtiles along a D2 tile's edge (DUNGEON_GameTileToSubtileCoords) */
export const SUBTILES_PER_D2_TILE = 5;

/** metres in a D2 tile: our areas are D2's 1.25 times over each way (plan: 区域大小先按原版放大 1.25 倍) */
export const M_PER_D2_TILE = 1.25;

/**
 * velocity points that move a unit or a missile one subtile a frame: a point moves a sixteenth of a
 * subtile a frame (Missiles.cpp:289-292, PathMisc.cpp:1159-1161 at its base 1024)
 */
export const VELOCITY_PER_SUBTILE = 16;

/**
 * metres a second for one point of D2's velocity, the hero's and the monsters' alike: still the
 * game's run from before D2's movement, 4.6 m/s, as CharStats RunVelocity 9 (walk 6 is then 3.07 m/s)
 */
export const MPS_PER_VELOCITY = 4.6 / 9;

/**
 * metres for one of D2's subtiles where a speed, a reach or a radius is D2's: on the scale of the
 * velocity above, 25/16 subtiles a second a point. The maps' tiles and objects go by M_PER_D2_TILE
 * and SUBTILES_PER_D2_TILE instead (zone.ts, objgroups.ts): two scales still, 1.31 apart
 * (docs/M2A-STEP0.md 3)
 */
export const M_PER_SUBTILE = (MPS_PER_VELOCITY * VELOCITY_PER_SUBTILE) / FRAMES_PER_SEC;
