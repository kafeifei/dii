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
 * metres for one of D2's subtiles, a fifth of its tile: 0.25 m. Every length of D2's goes by it, the
 * maps' (zone.ts, objgroups.ts) and the monsters' reaches, radii and ranges alike (the user's call
 * of 2026-10-29, docs/M2A-STEP0.md 3: D2's own unit everywhere, no pace factor)
 */
export const M_PER_SUBTILE = M_PER_D2_TILE / SUBTILES_PER_D2_TILE;

/**
 * metres a second for one point of D2's velocity, the hero's and the monsters' alike: 25/16 subtiles
 * a second, 0.390625 m/s. The hero's CharStats RunVelocity 9 is 3.52 m/s, WalkVelocity 6 2.34 m/s
 */
export const MPS_PER_VELOCITY = (M_PER_SUBTILE * FRAMES_PER_SEC) / VELOCITY_PER_SUBTILE;
