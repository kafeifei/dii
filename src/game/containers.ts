import { createItem } from '../items/gen';
import { displayName } from '../items/item';
import { SHRINE_BY_ID } from '../data/shrines';
import type { Game } from './game';
import { containerLoot } from './loot';
import type { WorldObject } from './objects';
import { areaLevel } from '../world/areas';

/** a chest opened, once: its treasure on the ground */
export function openChest(g: Game, obj: WorldObject) {
  const p = g.player;
  if (obj.used) return;
  obj.used = true;
  g.sfx.play('env.chest', { pos: obj.pos });
  g.fx.burst('chest', obj.pos);
  // the area it stands in's Chest A, B or C at the area's level, as D2 rolls a chest's treasure
  // class by its level's (src/game/loot.ts containerLoot; D2Game OBJECTS/ObjMode.cpp
  // OBJMODE_DropFromChestTCWithQuality: DATATBLS_GetMonsterLevelInArea)
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  const drops = g.rollLoot((hero) => containerLoot('chest', area, hero));
  // the Horadric Cube waits in the first chest opened in an area of level 4 or more (plan A2;
  // D2's is in the Halls of the Dead, in Act 2)
  if (areaLevel(area) >= 4 && !p.cubeFound) {
    p.cubeFound = true;
    const box = createItem('box');
    drops.push({ kind: 'item', item: box });
    g.hooks.message(`你找到了${displayName(box)}！`, '#c8a86a', 4);
  }
  g.spawnDrops(obj.pos, drops);
}

/** a barrel broken open, once: its treasure on the ground */
export function openBarrel(g: Game, obj: WorldObject) {
  if (obj.used) return;
  obj.used = true;
  g.sfx.play('env.barrel', { pos: obj.pos });
  g.fx.burst('barrel', obj.pos);
  // the area's classes at its level, as a chest's
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  g.spawnDrops(obj.pos, g.rollLoot((hero) => containerLoot('barrel', area, hero)));
}

/** a shrine used, once: its blessing on the hero */
export function useShrine(g: Game, obj: WorldObject) {
  const p = g.player;
  if (obj.used) return;
  obj.used = true;
  const def = SHRINE_BY_ID[obj.shrine ?? ''];
  if (!def) return;
  if (def.refill) {
    p.life = p.stats.maxLife;
    p.mana = p.stats.maxMana;
  } else {
    p.shrine = { id: def.id, left: def.secs };
    p.markDirty();
  }
  g.fx.burst('aura_switch', p.pos, { color: def.color });
  g.sfx.play('env.shrine', { pos: obj.pos });
  g.hooks.message(`${def.name}：${def.desc}`, def.color, 3);
  g.say('shrine');
}
