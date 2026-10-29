import { dist, type P2 } from '../core/math';
import { ENTER_LINE, isNight, soundsNear, type HeroLine } from '../audio/sounds';
import { displayName, type Item } from '../items/item';
import { isTome, isTownPortal, readable, townPortalFrom } from '../items/tomes';
import type { Arrival, Game } from './game';
import { holds, layOutUnplaced } from './items';
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
}

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
 * Through the town portal: from its far end into the camp, where its other end stands by the
 * start; from that end back to where it was opened, both ends closing (D2: the portal closes once
 * its owner comes back through it). On one map either way is a jump. With no portal open the way
 * back goes as a waypoint would
 */
function throughPortal(g: Game, id: number): boolean {
  const L = g.portalLevel;
  const far = L?.objects.find((o) => o.kind === 'portal' && !L.inTown(o.pos));
  if (id === CAMP_AREA) {
    const camp = g.maps.levelFor(CAMP_AREA)!;
    camp.objects = camp.objects.filter((o) => !(o.kind === 'portal' && camp.inTown(o.pos)));
    const s = camp.layout.start;
    const pt = { x: s.x - 2.5, z: s.z + 0.5 };
    const there = far && L ? L.areaAt(far.pos.x, far.pos.z) : undefined;
    const portal = new WorldObject('portal', pt, `传送门 · ${there?.name ?? '?'}`, 0.6);
    portal.dest = there?.id ?? CAMP_AREA;
    camp.objects.push(portal);
    arrive(g, camp, { x: pt.x + 1.2, z: pt.z + 0.6 }, false, 'portal');
    return true;
  }
  closePortals(g);
  if (!L || !far) return enterArea(g, id, 'waypoint');
  arrive(g, L, { x: far.pos.x + 1, z: far.pos.z + 0.8 }, false, 'portal');
  return true;
}

/** the hero's town portal gone, both its ends, wherever they are */
export function closePortals(g: Game) {
  // a rift's own ways (src/game/rift.ts) aren't the hero's portal
  for (const L of [...g.maps.kept(), g.portalLevel, ...g.rift.levels()]) if (L) L.objects = L.objects.filter((o) => o.kind !== 'portal' || o.rift);
  g.portalLevel = null;
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
  g.fetchAhead();
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
  // one town portal a hero: a new one closes the last, both its ends
  closePortals(g);
  const p = g.player;
  const a = p.facing;
  let pt = { x: p.pos.x + Math.sin(a) * 1.5, z: p.pos.z + Math.cos(a) * 1.5 };
  if (!L.map.circleClear(pt.x, pt.z, 0.4)) pt = { ...p.pos };
  const portal = new WorldObject('portal', pt, '回城传送门', 0.6);
  portal.dest = CAMP_AREA;
  L.objects.push(portal);
  g.portalLevel = L;
  g.fx.burst('portal', pt);
  g.sfx.play('env.portal_open', { pos: pt });
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
