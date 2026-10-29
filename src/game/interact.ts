import { CAMP_AREA, builtWaypoints } from '../world/areas';
import { takeCorpse } from './bodies';
import { drinkWell, openBarrel, openCasket, openChest, searchRemains, useShrine } from './containers';
import type { Game } from './game';
import type { ObjKind, WorldObject } from './objects';
import { tellClosed } from './travel';

/** what using each kind of object does (interact); a rift's obelisk and ways are the rift's (Rifts.use) */
export const USE: Partial<Record<ObjKind, (g: Game, obj: WorldObject) => void>> = {
  chest: openChest,
  barrel: openBarrel,
  stairs: (g, obj) => {
    if (obj.closed) tellClosed(g, obj);
    else g.enterArea(obj.dest, 'stairs');
  },
  waypoint: (g, obj) => {
    const p = g.player;
    // using a waypoint activates it, in the difficulty being played (D2Game OBJECTS/ObjMode.cpp
    // OBJECTS_OperateFunction23_Waypoint: WAYPOINTS_ActivateWaypoint on pWaypointData[nDifficulty])
    const a = g.level.areaAt(obj.pos.x, obj.pos.z);
    if (!p.waypoints.includes(a.id) && builtWaypoints([a.id]).includes(a.id)) {
      p.waypoints = builtWaypoints([...p.waypoints, a.id]);
      g.hooks.message('传送点已激活', '#c8a86a', 2);
      g.say('waypoint');
      g.save();
    }
    g.hooks.openPanel('waypoint');
  },
  vendor: (g, obj) => {
    g.talkTo(obj);
  },
  stash: (g) => {
    g.hooks.openPanel('stash');
  },
  corpse: takeCorpse,
  exit: (g, obj) => {
    if (obj.closed) tellClosed(g, obj);
    else g.enterArea(obj.dest, 'exit');
  },
  shrine: useShrine,
  // a maze's (containers.ts): a casket or its grave opened, a rogue's corpse searched, a drink from a well
  casket: openCasket,
  remains: searchRemains,
  well: drinkWell,
  portal: (g, obj) => {
    g.sfx.play('env.portal_enter', { pos: obj.pos });
    g.enterArea(g.level.inTown(obj.pos) ? obj.dest : CAMP_AREA, 'portal');
  },
};

/** an object used by the hero: the rift's own first, else as USE has its kind */
export function interact(g: Game, obj: WorldObject) {
  if (g.rift.use(obj)) return;
  USE[obj.kind]?.(g, obj);
}
