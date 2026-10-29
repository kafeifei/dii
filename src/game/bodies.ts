import type { Drop } from '../items/gen';
import { bodyItems, leaveBody, takeBody } from './corpse';
import type { Game } from './game';
import { GroundItem, WorldObject } from './objects';
import { CAMP_AREA } from '../world/areas';

export function respawn(g: Game) {
  const p = g.player;
  // the body stays where the hero fell, with the gear, as the death plays out (game/corpse.ts)
  if (p.dead) leaveCorpse(g);
  p.dead = false;
  p.recalc();
  p.life = p.stats.maxLife;
  p.mana = p.stats.maxMana;
  p.stamina = p.stats.maxStamina;
  p.poisonTime = 0;
  p.chillTime = 0;
  // the curses and auras' marks go with the death (STATES_UpdateStayDeathFlags, PlrModes.cpp:1379-1390: what doesn't stay through it)
  p.ampTime = p.ampRes = 0;
  p.convictTime = p.convictRes = p.convictDef = 0;
  p.healQueue = [];
  p.manaQueue = [];
  // in the camp again, as D2 brings a dead hero back in town
  g.enterArea(CAMP_AREA, 'respawn');
}

/**
 * The body left where the hero fell once the death has played out (D2GAME_CORPSE_Handler,
 * PlrModes.cpp:429-650): all that was worn and the cursor's item on it (game/corpse.ts), the belt's
 * potions past its first row into the inventory or onto the ground, the inventory's gold in a
 * pile beside it
 */
function leaveCorpse(g: Game) {
  const p = g.player;
  const L = g.level;
  const cursor = g.hooks.getCursorItem();
  if (cursor) g.hooks.setCursorItem(null);
  const r = leaveBody(p, cursor, { level: L, pos: p.pos, area: L.areaAt(p.pos.x, p.pos.z).id }, g.lastDeath?.corpseXp ?? 0);
  const ground = [...r.dropped, ...r.loose.filter((it) => !p.inventory.add(it))];
  if (ground.length) g.spawnDrops(p.pos, ground.map((item): Drop => ({ kind: 'item', item })));
  if (p.gold > 0) {
    L.ground.push(new GroundItem(p.pos, null, p.gold, p.pos));
    p.gold = 0;
  }
  layOutCorpses(g);
  g.hooks.inventoryChanged();
}

/**
 * Each body on the map it lies on. One whose map this game has let go of (a trial floor two
 * floors back), and one read from a save, waits in the camp by the way in, as D2 sets a saved body
 * down in town (PLRSAVE2_ReadCorpses, PlrSave2.cpp:1104-1203). Cheap enough to run every frame.
 */
export function layOutCorpses(g: Game) {
  const p = g.player;
  if (!p.corpses.length) return;
  const L = g.level;
  // the maps this game keeps (levelFor), and the one the hero is on
  const live = new Set<object>([L]);
  for (const l of [...g.maps.kept(), g.portalLevel, ...g.rift.levels()]) if (l) live.add(l);
  // the map holding the camp: the overworld, or ?gallery's showroom (its start is the camp's)
  const camp = L.inTown(L.layout.start);
  p.corpses.forEach((c, i) => {
    if (c.level && !live.has(c.level)) {
      c.level = null;
      c.pos = null;
    }
    if (!(c.level === L || (!c.level && camp)) || L.objects.some((o) => o.corpse === c)) return;
    let pos = c.level ? c.pos : null;
    if (!pos) {
      const a = 2.4 + i * 0.9;
      pos = L.map.nearestWalkable(L.layout.start.x + Math.sin(a) * 2.2, L.layout.start.z + Math.cos(a) * 2.2) ?? L.layout.start;
    }
    const o = new WorldObject('corpse', pos, `${p.name}的尸体`, 0.7);
    o.corpse = c;
    L.objects.push(o);
  });
}

/**
 * The hero takes a body back: the experience it holds, given back as it is (PlrModes.cpp:713-722),
 * then its items (game/corpse.ts takeBody). What fits nowhere stays on it.
 */
export function takeCorpse(g: Game, o: WorldObject) {
  const p = g.player;
  const c = o.corpse;
  if (!c) return;
  if (c.xp > 0) {
    const gained = p.gainXp(c.xp);
    c.xp = 0;
    if (gained) {
      g.onProc('procLevelUp', null);
      g.celebrateLevelUp();
    }
  }
  const taken = takeBody(p, c, (it) => g.beltInsert(it));
  if (bodyItems(c).length) {
    g.hooks.message('背包放不下尸体上剩下的物品', '#ff6060', 2);
    g.sfx.play('ui.no_room');
  } else {
    g.level.objects = g.level.objects.filter((x) => x !== o);
    p.corpses = p.corpses.filter((x) => x !== c);
    g.sfx.play('item.equip', { pos: p.pos });
  }
  if (taken) {
    p.markDirty();
    g.hooks.inventoryChanged();
  }
}
