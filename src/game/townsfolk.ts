import { npcLine, type VoiceId } from '../audio/sounds';
import { CAMP_VENDORS, fillStore } from '../items/vendor';
import type { Game } from './game';
import type { WorldObject } from './objects';
import type { Topic } from './quests/quest';

export function refreshShop(g: Game) {
  // Diablo II's camp shelves for the one merchant: Charsi's weapons and armour, Akara's staves, potions, scrolls and tomes
  g.shop = fillStore(CAMP_VENDORS, Math.max(1, g.player.level), g.player.difficulty);
}

/**
 * Speaking to a townsperson, as in Diablo II: Akara's heal first (D2GAME_NPC_Heal, SUnitNpc.cpp:
 * 2784-2802), then the line a quest has them say at once, if any (QUESTS_NPCActivateSpeeches: a
 * SCROLLMENU_MESSAGE line, such as Akara giving the Den of Evil), then their menu. That line is
 * returned (the tests hear it through npcSpoke)
 */
export function talkTo(g: Game, obj: WorldObject): Topic | null {
  vendorHeal(g, obj);
  const opening = obj.npcId ? g.quests.opening(obj.npcId) : null;
  if (g.hooks.npcMenu) g.hooks.npcMenu(obj, opening);
  else g.hooks.openPanel('shop');
  return opening;
}

/** what the townsperson says under 交谈: a quest's word for the hero, else their small talk */
export function npcTalk(g: Game, obj: WorldObject): Topic | null {
  return obj.npcId ? g.quests.talk(obj.npcId) : null;
}

/** a townsperson's line heard to the end, or cut short: a quest given, a reward handed over */
export function npcSpoke(g: Game, topic: Topic) {
  g.quests.spoke(topic);
  // what they'd say next has changed (the quest given: its reminder; their small talk's next line)
  fetchAhead(g);
}

/**
 * While the hero is in the camp, what its people may say next is fetched ahead (Sfx.prefetch, the
 * files only, decoded when they're said): on a slow connection a line said at once (Akara's quest,
 * her reward) would otherwise come late, a greeting after its moment. Each one's line a quest has
 * them open with first, then their greetings, what 交谈 has them say and their farewells, as things
 * stand; asked again as they change (a line heard, the hero back in the camp). The first of them is
 * the line said next: Sfx fetches it before anything else it fetches or warms here
 */
export function fetchAhead(g: Game) {
  if (g.area?.kind !== 'town') return;
  const ids: VoiceId[] = [];
  const say = (t: Topic | null) => t && ids.push(npcLine(t.npc, t.id, t.quest));
  for (const o of g.level.objects) {
    if (!o.npcId) continue;
    say(g.quests.opening(o.npcId));
    ids.push(npcLine(o.npcId, 'greeting'));
    say(g.quests.nextTalk(o.npcId));
    ids.push(npcLine(o.npcId, 'farewell'));
  }
  g.sfx.prefetch(ids);
}

/** the hero turned from a townsperson (their menu shut) */
export function npcLeft(g: Game, obj: WorldObject) {
  if (obj.npcId) g.quests.left(obj.npcId);
}

/** like Akara in Diablo II: talking to the merchant puts life and mana back to full and cures poison, chill and the rest */
function vendorHeal(g: Game, vendor: WorldObject) {
  const p = g.player;
  const s = p.stats;
  if (p.life >= s.maxLife && p.mana >= s.maxMana && p.poisonTime <= 0 && p.chillTime <= 0 && p.bleedTime <= 0 && p.slowTime <= 0) return;
  p.life = s.maxLife;
  p.mana = s.maxMana;
  p.poisonTime = p.chillTime = p.bleedTime = p.slowTime = p.stunTime = 0;
  g.fx.burst('potion_hp', p.pos);
  g.fx.burst('potion_mp', p.pos);
  g.sfx.play('env.vendor_heal', { pos: p.pos });
  g.hooks.message(`${vendor.npc ?? '商人'}为你恢复了生命与法力`, '#c8a86a', 2);
}
