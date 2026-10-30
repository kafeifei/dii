import { dist, type P2 } from '../core/math';
import { ENTER_LINE, isNight, soundsNear, type HeroLine } from '../audio/sounds';
import { displayName, type Item } from '../items/item';
import { isTome, isTownPortal, readable, townPortalFrom } from '../items/tomes';
import type { Arrival, Game } from './game';
import { holds, layOutUnplaced } from './items';
import { fetchAhead } from './townsfolk';
import type { Level } from './level';
import { WorldObject } from './objects';
import type { Difficulty } from './save';
import { CAMP_AREA, areaDef, areaForDepth, depthForArea, dungeonArea, trialFloor, type AreaDef, type AreaKind } from '../world/areas';
import type { Overworld } from '../world/overworld';

/**
 * seconds since walking out of a kind of area within which walking back into it says nothing: to and
 * fro over the camp's seam the hero doesn't remark on it at every step (as the area banner, src/ui/banner.ts)
 */
const REENTRY = 4;

/** what the game remembers of the hero's comings and goings (Game.trip) */
export interface Trip {
  /** the closed way the hero is at, told once until they step off it */
  atClosed: WorldObject | null;
  /** when the hero last walked out of each kind of area (Game.time), for REENTRY */
  leftKind: Map<AreaKind, number>;
  /** the hero has been underground this game: enter_dungeon is said the first time */
  wentUnder: boolean;
  /** the hero's town portal while it is open, its two ends each other's (TownPortal) */
  portal: TownPortal | null;
}

/**
 * The hero's town portal: the end where it was opened and the end in the camp, made together and
 * each leading to the other, as D2 links them (D2MOO d9d394f, Skills.cpp:3070-3071 UNITS_StoreOwner
 * both ways, so OBJECTS_OperateFunction15_Portal goes by the end's owner, ObjMode.cpp:3206-3210).
 * Each end is known by itself, never looked for among the portals on its map: a rift's floor has
 * its own ways that are portals too (src/game/rift.ts), and the camp has the rift's way in
 */
export interface TownPortal {
  /** the end where it was opened, and the map that is on */
  far: WorldObject;
  level: Level;
  /** the end in the camp, and the map holding the camp */
  camp: WorldObject;
  campLevel: Level;
}

/**
 * where the hero comes out of the far end, from it, and of the camp's end: a step, about 1.3 m, as
 * before (approximate: D2 sets them at the end and walks them on 5 subtiles along each of its axes,
 * ObjMode.cpp:3237)
 */
const OUT_STEP: P2 = { x: 1, z: 0.8 };
const IN_STEP: P2 = { x: 1.2, z: 0.6 };
/**
 * where the camp's end stands from the camp's start, the hero's way into it: a step toward the camp
 * fire, in the open, with nothing tall between it, or the hero coming out of it, and the view (the
 * camera looks from the +x, +z side: render/views.ts CAM_YAW). It stood 2.5 m west of the start
 * until 2026-10-29, right behind the rifts' obelisk as the view has it, which hid both. Approximate:
 * D2's town end goes to a spawn tile of the town's (Skills.cpp:3013 DUNGEON_FindActSpawnLocationEx)
 */
const CAMP_SPOT: P2 = { x: -1, z: -1 };
/** how far clear of each of the camp's people and things, past its own size, the camp's end stands (ours: D2 needs only the free spot, Skills.cpp:3041) */
const CAMP_ROOM = 1.2;
/**
 * how far ahead of the hero the far end opens, where they can see it, as before (approximate: D2
 * opens it where they stand, SkillItem.cpp:103, at the free spot by them, Skills.cpp:3118)
 */
const AHEAD = 1.5;
/** how wide the way from a portal (or the hero) to a spot by it must be open (ours): no slipping between two blocks that touch at a corner */
const CLEAR = 0.25;

/**
 * Go to area `id`, onto the map that holds it, arriving `how`: by a stair or an exit at the way
 * back to where they came from, by waypoint beside its waypoint, through a town portal at its
 * other end, else where the area starts. On the map the hero is on already it is a jump
 * (teleportWithin): nothing is rebuilt. False when this build has no map of it
 */
export function enterArea(g: Game, id: number, how: Arrival): boolean {
  if (how === 'portal') return throughPortal(g, id);
  const level = g.maps.levelFor(id, how === 'stairs');
  if (!level) return false;
  const at = arrival(g, level, id, how, g.area?.id);
  arrive(g, level, at.pos, true, how, at.facing);
  return true;
}

/** the old way in, by depth (?dev&lvl, tools): 0 the camp, WILD_MAPS Blood Moor, deeper the trial ground's floors */
export function enterLevel(g: Game, depth: number, how: Arrival) {
  enterArea(g, areaForDepth(depth).id, how);
}

/** the debug panel's trial ground: floor `floor` of the endless dungeon, made anew, played in difficulty `d` */
export function enterTrial(g: Game, floor: number, d?: Difficulty) {
  // the new difficulty's game begins on this floor, made once (setDifficulty would make one where the hero is)
  if (d !== undefined) g.switchDifficulty(d);
  g.sfx.play('env.waypoint', { pos: g.player.pos });
  enterArea(g, dungeonArea(floor), 'stairs');
}

/**
 * The hero set down at `at` on `level`: a jump on the map they're on, else onto it, its view built
 * anew; a map kept from earlier is found as it was left, its survivors healed and home again
 * (`reenter`, not through a town portal), coming `how`
 */
function arrive(g: Game, level: Level, at: P2, reenter: boolean, how: Arrival, facing?: number) {
  const p = g.player;
  g.trip.atClosed = null;
  if (level === g.level) teleportWithin(g, at, how);
  else {
    if (reenter) level.reenter();
    g.level = level;
    // on a rift's floor its tier's difficulty's rules hold for the hero, the one played's anywhere else
    const ruled = g.rift.difficultyOf(level);
    if (ruled !== p.ruled) {
      p.ruled = ruled;
      p.markDirty();
    }
    placePlayer(g, at);
    g.hooks.levelChanged(level);
    // a new level is always announced, even in the same area as the last
    updateArea(g, true, how);
  }
  if (facing !== undefined) p.facing = facing;
  const here = g.area?.id ?? CAMP_AREA;
  if (trialFloor(here) !== undefined) p.depthReached = Math.max(p.depthReached, depthForArea(here)!);
  g.save();
}

/** where on `level` the hero comes to area `id` by `how`, coming from area `from` */
function arrival(g: Game, level: Level, id: number, how: Arrival, from?: number): { pos: P2; facing?: number } {
  // out of a rift, by its obelisk
  const out = g.rift.arrival(id, how, from);
  if (out) return out;
  // by the way back to where they came from, a step in from it, facing in
  if ((how === 'stairs' || how === 'exit') && from !== undefined) {
    const back = level.objects.find((o) => (o.kind === 'stairs' || o.kind === 'exit') && o.dest === from && level.areaAt(o.pos.x, o.pos.z).id === id);
    if (back?.inward) {
      const d = back.radius + 1.6;
      return { pos: { x: back.pos.x + back.inward.x * d, z: back.pos.z + back.inward.z * d }, facing: Math.atan2(back.inward.x, back.inward.z) };
    }
  }
  // by waypoint, beside it (D2Game OBJECTS/ObjMode.cpp OBJMODE_TravelViaWaypoint warps the hero to the waypoint)
  const wp = how === 'waypoint' ? waypointIn(g, level, id) : undefined;
  if (wp) return { pos: { x: wp.pos.x + 1.2, z: wp.pos.z + 0.6 } };
  return { pos: areaStart(g, level, id) };
}

/** area `id`'s waypoint on `level`, if it has one there */
function waypointIn(g: Game, level: Level, id: number): WorldObject | undefined {
  return level.objects.find((o) => o.kind === 'waypoint' && level.areaAt(o.pos.x, o.pos.z).id === id);
}

/**
 * Where area `id` starts on `level`: the map's start if it's in it (the camp's, a dungeon's), else
 * beside its waypoint, else a couple of steps in from the seam on the camp's side (Blood Moor past
 * the camp's gate), else its tile nearest the start
 */
function areaStart(g: Game, level: Level, id: number): P2 {
  const L = level.layout;
  if (level.areaAt(L.start.x, L.start.z).id === id) return L.start;
  const wp = waypointIn(g, level, id);
  if (wp) return { x: wp.pos.x + 1.2, z: wp.pos.z + 0.6 };
  const ow = L as Partial<Overworld>;
  const rank = (a: number) => ow.order?.indexOf(a) ?? 0;
  const seam = ow.seams?.filter((sm) => sm.a === id || sm.b === id).sort((x, y) => rank(x.a === id ? x.b : x.a) - rank(y.a === id ? y.b : y.a))[0];
  if (seam) {
    const [inside, out] = seam.b === id ? [seam.tb, seam.ta] : [seam.ta, seam.tb];
    return { x: 3 * inside.x - 2 * out.x, z: 3 * inside.z - 2 * out.z };
  }
  return level.wayTo(id, L.start)?.pos ?? L.start;
}

/**
 * Through the hero's town portal toward area `id` (enterArea): into the camp by its far end, else
 * back by the camp's end. With none open the way goes as a waypoint would
 */
function throughPortal(g: Game, id: number): boolean {
  const tp = g.trip.portal;
  if (!tp) return enterArea(g, id, 'waypoint');
  return usePortal(g, id === CAMP_AREA ? tp.far : tp.camp);
}

/**
 * One end of the hero's town portal used: the hero comes out a step beside the other end, on the map
 * that is on as it was left (D2: OBJECTS_OperateFunction15_Portal, ObjMode.cpp:3206-3237, sets them at
 * the free spot by the other end's own and walks them a step on). The far end leaves both open; the
 * camp's end, the way back, closes both (ObjMode.cpp:3240-3253). On one map either way is a jump.
 * False for a portal that isn't an end of the hero's
 */
export function usePortal(g: Game, end: WorldObject): boolean {
  const tp = g.trip.portal;
  if (!tp || (end !== tp.far && end !== tp.camp)) return false;
  if (end === tp.far) {
    arrive(g, tp.campLevel, besidePortal(tp.campLevel, tp.camp, IN_STEP), false, 'portal');
    return true;
  }
  closePortals(g);
  arrive(g, tp.level, besidePortal(tp.level, tp.far, OUT_STEP), false, 'portal');
  return true;
}

/**
 * Where someone coming out of portal `o` on `L` stands: `step` from it (the walkable ground nearest
 * that), if the portal has an open way to it; else the nearest spot to that round the portal that
 * it has (D2's free spot by the portal, ObjMode.cpp:3226: never past a wall, a tree or a rock the
 * portal stands by, as the walkable ground nearest the step alone can be); else the portal's own spot
 */
function besidePortal(L: Level, o: WorldObject, step: P2): P2 {
  const m = L.map;
  const want = { x: o.pos.x + step.x, z: o.pos.z + step.z };
  const near = m.nearestWalkable(want.x, want.z);
  if (near && m.los(o.pos, near, CLEAR)) return near;
  let best: P2 | null = null;
  let bestD = Infinity;
  for (const r of [0.8, 1.1, 1.4, 1.8, 2.3]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c = { x: o.pos.x + Math.sin(a) * r, z: o.pos.z + Math.cos(a) * r };
      const d = dist(c, want);
      if (d < bestD && m.circleClear(c.x, c.z, 0.3) && m.los(o.pos, c, CLEAR)) {
        best = c;
        bestD = d;
      }
    }
    if (best) return best;
  }
  return { ...o.pos };
}

/** the hero's town portal gone, both its ends, wherever they are; the rifts' own ways (src/game/rift.ts) stay */
export function closePortals(g: Game) {
  const tp = g.trip.portal;
  if (tp) {
    tp.level.objects = tp.level.objects.filter((o) => o !== tp.far);
    tp.campLevel.objects = tp.campLevel.objects.filter((o) => o !== tp.camp);
  }
  g.trip.portal = null;
}

/**
 * Move the hero elsewhere on this map without leaving it (a waypoint, a town portal or respawning
 * on the overworld, coming `how`; the tools' jumps, no way in): the view jumps there and a new area
 * is announced, nothing is rebuilt.
 */
export function teleportWithin(g: Game, pos: P2, how: Arrival | null = null) {
  placePlayer(g, pos);
  g.hooks.teleported(how);
  updateArea(g, false, how);
}

/** the hero set down on walkable ground near `pos`, standing still, whatever they were doing dropped */
function placePlayer(g: Game, pos: P2) {
  const p = g.player;
  const safe = g.level.map.nearestWalkable(pos.x, pos.z) ?? pos;
  p.pos = { ...safe };
  p.prevPos = { ...safe };
  p.intent = null;
  p.path = null;
  p.setState('idle');
  p.knockVel = { x: 0, z: 0 };
  p.zealHitsLeft = 0;
  p.chargeTarget = null;
  g.playerAction = null;
  g.lmbMode = 'none';
  g.sfx.setListener(p.pos);
}

/**
 * announce the hero's area when it changed (or always, `entered` a level): its banner, its
 * ambience and music, and what the hero says coming to it. `how` they came: on foot over a seam
 * ('walk'), by a way in (Arrival), or null for a jump the tools made
 */
export function updateArea(g: Game, entered = false, how: Arrival | 'walk' | null = null) {
  const p = g.player;
  const area = g.level.areaAt(p.pos.x, p.pos.z);
  if (area === g.area && !entered) return;
  const prev = g.area;
  g.area = area;
  // into the camp, by any way in: the merchant has new stock, as D2's do each time the hero comes
  // back to town, and what fits nowhere waits by the stash
  if (area.kind === 'town' && (entered || prev?.kind !== 'town')) {
    g.refreshShop();
    layOutUnplaced(g, g.level);
  }
  // its ambience at this time of day, and its music, over the last area's; walked over a seam, a
  // switch back so soon after the last waits a moment (Sfx SWITCH_HOLD)
  g.sfx.setTime(g.clock);
  g.sfx.enterArea(area, how === 'walk');
  // the quests hear of it (ChangedLevel); one may give the hero a line of its own to say
  const quest = g.quests.areaChanged(area, prev);
  // in the camp, what its people may say now is fetched ahead, the line they'll say next first
  fetchAhead(g);
  // decode what's heard here and in the areas next to it, so it plays recorded from the first time
  // (in the camp, after that line: Sfx.preload)
  void g.sfx.preload(soundsNear(area, areasNext(g, area), isNight(g.clock), p.cls));
  const line = (prev && how !== 'respawn' && quest) || arrivalLine(g, area, prev, how);
  if (prev && prev.kind !== area.kind) g.trip.leftKind.set(prev.kind, g.time);
  if (area.kind === 'dungeon') g.trip.wentUnder = true;
  if (line) g.say(line);
  g.hooks.areaChanged(area, prev);
}

/**
 * What the hero says coming into `area` from `prev`: walking out of the camp, back into it,
 * underground the first time this game; not as a game starts or a dead hero is brought back, nor
 * walking back into a kind of area left a moment ago (REENTRY)
 */
function arrivalLine(g: Game, area: AreaDef, prev: AreaDef | null, how: Arrival | 'walk' | null): HeroLine | null {
  if (!prev || prev.kind === area.kind || how === 'start' || how === 'respawn') return null;
  if (area.kind === 'dungeon' && g.trip.wentUnder) return null;
  if (how === 'walk' && g.time - (g.trip.leftKind.get(area.kind) ?? -Infinity) < REENTRY) return null;
  return ENTER_LINE[area.kind];
}

/** the areas next to `area` on this map: across its seams, and where its ways on lead (stairs, exits, a portal) */
function areasNext(g: Game, area: AreaDef): AreaDef[] {
  const L = g.level;
  const out = new Set<number>();
  for (const sm of (L.layout as Partial<Overworld>).seams ?? []) {
    if (sm.a === area.id) out.add(sm.b);
    else if (sm.b === area.id) out.add(sm.a);
  }
  for (const o of L.objects) {
    const way = o.kind === 'stairs' || o.kind === 'exit' || o.kind === 'portal';
    if (way && !o.closed && o.dest !== undefined && L.areaAt(o.pos.x, o.pos.z) === area) out.add(o.dest);
  }
  out.delete(area.id);
  return [...out].flatMap((id) => areaDef(id) ?? []);
}

/** a way on to an area this build has no map of yet: said once while the hero is at it */
export function tellClosed(g: Game, obj: WorldObject) {
  if (g.trip.atClosed === obj) return;
  g.trip.atClosed = obj;
  g.hooks.message(`通往${areaDef(obj.dest)?.name ?? '那里'}的路还没有开通`, '#aaa', 2);
}

export function openTownPortal(g: Game) {
  const L = g.level;
  if (L.inTown(g.player.pos)) {
    g.hooks.message('你已经在营地里了', '#aaa', 1.5);
    g.say('cant_here');
    return;
  }
  // one town portal a hero: a new one closes the last, both its ends (SkillItem.cpp:101 PLAYER_RemoveTownPortal)
  closePortals(g);
  const p = g.player;
  const a = p.facing;
  // a pace ahead, on open ground the hero can see (not past a wall or a tree they face), else where they stand
  let pt = { x: p.pos.x + Math.sin(a) * AHEAD, z: p.pos.z + Math.cos(a) * AHEAD };
  if (!L.map.circleClear(pt.x, pt.z, 0.4) || !L.map.los(p.pos, pt, CLEAR)) pt = { ...p.pos };
  const far = new WorldObject('portal', pt, '回城传送门', 0.6);
  far.dest = CAMP_AREA;
  L.objects.push(far);
  // its other end in the camp at once, as D2 makes both together (Skills.cpp:3078-3109
  // D2GAME_CreatePortalObject_6FD13DF0, the town's end by D2GAME_CreateLinkPortal_6FD13B20): there
  // to go back through after dying, or after coming back to the camp another way
  const campLevel = g.maps.levelFor(CAMP_AREA)!;
  const there = L.areaAt(pt.x, pt.z);
  const camp = new WorldObject('portal', campSpot(campLevel), `传送门 · ${there.name}`, 0.6);
  camp.dest = there.id;
  campLevel.objects.push(camp);
  g.trip.portal = { far, level: L, camp, campLevel };
  g.fx.burst('portal', pt);
  g.sfx.play('env.portal_open', { pos: pt });
}

/**
 * Where the camp's end of a town portal stands: by the camp's start, the hero's way into it, on open
 * ground clear of its people and things (D2: its town's spot for it, then the free spot nearest that
 * no unit or object stands on, Skills.cpp:3013-3041 COLLISION_GetFreeCoordinatesEx)
 */
function campSpot(L: Level): P2 {
  const s = L.layout.start;
  const want = { x: s.x + CAMP_SPOT.x, z: s.z + CAMP_SPOT.z };
  const free = (c: P2) => L.map.circleClear(c.x, c.z, 0.6) && L.objects.every((o) => dist(o.pos, c) >= o.radius + CAMP_ROOM);
  if (free(want)) return want;
  for (let r = 1; r <= 6; r++) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c = { x: want.x + Math.sin(a) * r, z: want.z + Math.cos(a) * r };
      if (free(c)) return c;
    }
  }
  return L.map.nearestWalkable(want.x, want.z) ?? want;
}

/**
 * Read a town portal (the P key, a right-click on a tome or scroll of town portal, or its belt
 * column used): the hero casts it from `from`, else from the bag's tome of town portal, then a
 * scroll of it in the bag, then one in the belt (tomes.ts townPortalFrom). Nothing to read it
 * from, or a tome with no charge left: the hero says so. In the camp nothing is read, as D2's town
 * portal fails there and uses nothing
 */
export function castTownPortal(g: Game, from?: Item) {
  const p = g.player;
  if (p.dead || !(p.state === 'idle' || p.state === 'move')) return;
  if (g.level.inTown(p.pos)) {
    g.hooks.message('你已经在营地里了', '#aaa', 1.5);
    g.say('cant_here');
    return;
  }
  const src = from ?? townPortalFrom(p.inventory, p.belt);
  if (!src || !isTownPortal(src) || !readable(src)) return noTownPortal(g, src);
  p.setState('cast', 0.7);
  g.playerAction = { skill: 'townportal', target: null, point: { ...p.pos }, item: src };
  p.intent = null;
}

/**
 * The cast town portal opens: its scroll is used up, or its tome loses a charge, now (a cast cut
 * short uses none). Read from `from` while the hero still holds it, in a grid or the belt, with
 * something left to read, else from what the bag and the belt have now
 */
export function readTownPortal(g: Game, from?: Item) {
  const p = g.player;
  if (g.level.inTown(p.pos)) return;
  const held = from && holds(g, from) && readable(from) ? from : townPortalFrom(p.inventory, p.belt);
  if (!held || !g.readHeld(held)) return noTownPortal(g, from);
  openTownPortal(g);
  g.hooks.inventoryChanged();
}

/**
 * No town portal to read: the hero says so (a message: no recorded line of theirs is for it), an
 * empty tome that it has nothing left
 */
function noTownPortal(g: Game, tome?: Item) {
  const empty = tome && isTome(tome);
  g.hooks.message(empty ? `${displayName(tome)}里没有卷轴了` : '没有城镇传送卷轴了', '#ff6060', 1.5);
  g.sfx.play('ui.cant_use');
}

/** by waypoint to area `id`: on the map the hero is on, a jump (teleportWithin). False when this build has no map of it */
export function travel(g: Game, id: number): boolean {
  if (!g.hasMap(id)) return false;
  g.sfx.play('env.waypoint', { pos: g.player.pos });
  return enterArea(g, id, 'waypoint');
}

/**
 * Go to an area as a waypoint does, touched or not, for the tools (the debug panel, the bench, the
 * bot): beside its waypoint, or where it starts. False when this build has no map of it
 */
export function travelToArea(g: Game, id: number): boolean {
  return travel(g, id);
}

/** an exit on `L` the hero stands in: walked through (true, the step ends there), or told of if it's closed */
export function walkExits(g: Game, L: Level): boolean {
  const p = g.player;
  // exits are walked through
  if (!p.dead) {
    const exit = L.objects.find((o) => o.kind === 'exit' && dist(o.pos, p.pos) < o.radius);
    if (exit?.closed) tellClosed(g, exit);
    else if (exit) {
      enterArea(g, exit.dest, 'exit');
      return true;
    } else g.trip.atClosed = null;
  }
  return false;
}
