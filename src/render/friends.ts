import type { Renderer } from './renderer';

// The views of the hero's friends on the map besides the hero (M2a's mercenary): the renderer calls
// these as it builds a level, every frame, and when the tools count what stands in for models
// (Renderer.standInCount). There are no friends yet, so they do nothing; the hero's own view stays
// the renderer's.

/** a level being built: the friends' views on the last one let go */
export function clearFriends(_r: Renderer) {}

/** each frame, after the hero's view: a view for each friend on the level that has none, each animated, those gone let go */
export function syncFriends(_r: Renderer, _dt: number) {}

/** how many of the friends' views stand in for models not in yet */
export function friendStandIns(_r: Renderer): number {
  return 0;
}
