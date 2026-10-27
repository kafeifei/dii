import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import { DEN_OF_EVIL, WILD_AREA, areaDef } from './areas';
import { THEMES, generateDungeon, type Layout } from './levelgen';

/** the den's superunique (superuniques.json areaId 8) */
const CORPSEFIRE = D2X_SUPERUNIQUES.find((s) => s.key === 'Corpsefire')!;

/**
 * The Den of Evil (levels.json Id 8, "Act 1 - Cave 1"): one cave level under Blood Moor, its mouth
 * there (overworld.ts DRESS) and its one way out a stair back up to it. D2 makes it a maze of rooms
 * (DrlgType 1; lvlmaze.json Level 8) with no waypoint (Waypoint 255); ours is the endless dungeon's
 * first floor in the caves' look, without its stairs down or its waypoint: the way up stands where
 * the waypoint would, beside the start. Corpsefire (superuniques.json: a zombie1 and its minions,
 * areaId 8) waits in the room farthest from the way in, as the floor's stairs would.
 */
export function generateDen(seed: number): Layout {
  const L = generateDungeon(1, seed, DEN_OF_EVIL, THEMES.cave);
  const up = L.waypoints[0].pos;
  const far = L.stairs!;
  const dx = L.start.x - up.x;
  const dz = L.start.z - up.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    ...L,
    stairs: undefined,
    waypoints: [],
    areaOf: new Uint16Array(L.map.w * L.map.h).fill(DEN_OF_EVIL),
    // facing the start, so someone coming down stands between the two
    entrances: [{ x: up.x, z: up.z, dest: WILD_AREA, name: areaDef(WILD_AREA)!.name, kind: 'up', nx: dx / len, nz: dz / len }],
    // Corpsefire by its row, which has the rename table's name (tools/d2-names/monsters.json)
    superUniques: [{ pos: far, monster: 'zombie', key: CORPSEFIRE.key, name: CORPSEFIRE.name }],
  };
}
