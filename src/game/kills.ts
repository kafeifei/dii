import { chance, randInt } from '../core/math';
import { DEATH_SOUND, LARGE_MONSTER } from '../audio/sounds';
import { SKILL_BY_ID } from '../data/skills';
import { D2_TO_GAME } from '../data/d2/skillmap';
import type { Drop } from '../items/gen';
import type { Item } from '../items/item';
import { coldEnchantBurst, fireEnchantBurst } from './d2/monstats';
import { deathPenalty } from './d2/death';
import { killXp } from './d2/xp';
import { monsterLoot, type Finder } from './loot';
import { emptyPacket, type Killer } from './actor';
import { monsterDied, notice } from './ai';
import type { Game } from './game';
import { Merc, fallWithHero, mercKillXp, mercOwnKill } from './merc';
import type { Monster } from './monster';
import { DelayedBlast } from './objects';
import { castItemSkill } from './playerctl';
import type { StatKey } from '../data/stats';
import type { Elem } from '../data/monsters';
import { debugOpts } from './debug';
import { SHRINE_BY_ID } from '../data/shrines';

/** a monster struck before it noticed the hero: it notices them, its pack with it, as seeing them has it (src/game/ai.ts notice) */
export function wake(g: Game, m: Monster) {
  notice(g, m);
}

/**
 * A monster killed by `killer` (docs/M2A-STEP0.md 2.1): whoever killed it, it dies as it does, its
 * quests and the rift count it, a boss's fall is told and saved. The hireling has her share first,
 * whole for one of hers, 86/256 of one of the hero's (SUNITDMG_DistributeExperience gives the pet
 * before the hero: D2Game UNIT/SUnitDmg.cpp:2981-2988; merc.ts mercKillXp), then the hero the
 * experience of a kill of theirs or the hireling's, whole (2990-2991: the owner gets it either way).
 * What happens on a kill (the procs, life and mana per kill, the demon heal) is the killer's own:
 * those stats' events are put on the unit that wears them (D2Game ITEMS/ItemMode.cpp:92-101) and
 * fire for the attacker alone (SUNITEVENT_Trigger(UNITEVENT_KILL, pAttacker), SUnitDmg.cpp:1400;
 * SUnitEvent.cpp:122-142; SKILLS/SkillItem.cpp:1458-1557), so a kill of the hireling's heals her by
 * her gear's (mercOwnKill) and none of the hero's go off. What it drops goes by the killer's magic
 * find and its owner's together (rollLoot). A death no friendly dealt (`null`: Blood Raven's raised
 * dead falling with her) gives no experience and drops nothing
 */
export function killMonster(g: Game, m: Monster, elem: Elem, killer: Killer = 'hero') {
  if (m.dead) return;
  const p = g.player;
  m.dead = true;
  m.life = 0;
  m.deathTime = 0;
  m.killedBy = elem;
  m.setState('dead');
  m.path = null;
  m.move = null;
  m.act = null;
  // a cold kill shatters it (the renderer draws it so): no shaman raises it (D2's freeze state, STATES_CheckStateMaskUdeadOnUnit)
  m.corpseRaisable = elem !== 'cold';
  g.aged.set(m, g.level.time);
  monsterDied(g, m);
  // Diablo II's experience for the kill (SUNITDMG_ComputeExperienceGain: game/d2/xp.ts killXp):
  // the level gap's two tables, ExpRatio, then "+X% experience gained" and the shrine's on top;
  // none for a raised or summoned one, nor a drop (UNITFLAG_NOXP | UNITFLAG_NOTC), nor for one nobody killed
  // the hireling's share first, at the hero's level before this kill's (SUnitDmg.cpp:2981-2988)
  mercKillXp(g, m, killer);
  const addPct = (p.shrine ? (SHRINE_BY_ID[p.shrine.id].xpPct ?? 0) : 0) + (p.stats.bag.xpPct ?? 0);
  const gained = m.noXp || killer === null ? 0 : p.gainXp(Math.floor(killXp(m.xp, p.level, m.level, addPct) * debugOpts.xp));
  if (gained > 0) {
    onProc(g, 'procLevelUp', null);
    celebrateLevelUp(g);
  }
  if (killer instanceof Merc) mercOwnKill(g, killer, m);
  if (killer === 'hero') {
    const d = p.stats;
    onProc(g, 'procKill', m);
    if (m.def.demon && d.bag.demonHeal) p.life = Math.min(d.maxLife, p.life + d.bag.demonHeal);
    if (d.lifePerKill) p.life = Math.min(d.maxLife, p.life + d.lifePerKill);
    if (d.manaPerKill) p.mana = Math.min(d.maxMana, p.mana + d.manaPerKill);
  }
  // loot
  if (!m.noXp && killer !== null) g.spawnDrops(m.pos, g.rollLoot((hero) => monsterLoot(m, hero), killer));
  // the quests count it (MonsterKilled): the Den of Evil's last one done
  g.quests.monsterKilled(m, killer);
  // and the rift's progress
  g.rift.killed(m);
  // fx
  g.fx.death(m, m.def.blood, elem);
  // its look's death cry (src/data/monsters.ts voice, sounds.ts DEATH_SOUND), a big one's or a boss's the large one, bones' always their own
  const big = m.rank === 'boss' || m.def.scale >= LARGE_MONSTER;
  const snd = big && m.def.voice !== 'bone' ? 'monster.die_large' : DEATH_SOUND[m.def.voice];
  g.sfx.play(snd, { pos: m.pos });
  // a fire-enchanted (MonUMod 9) leader bursts as it dies, a cold-enchanted (18) one freezes round it
  // (src/game/d2/monstats.ts): only a champion's or unique's mode change sets them off, not its minions'
  // (MonsterUnique.cpp:1052-1058, 2016-2020: bUnique is MONTYPEFLAG_UNIQUE, which a minion hasn't)
  if (m.hasOwn(9)) {
    const b = fireEnchantBurst(m.def.row, m.difficulty, m.level, randInt);
    const pk = emptyPacket();
    pk.phys = b.phys;
    pk.fire = b.fire;
    pk.spell = true;
    pk.source = m;
    g.level.blasts.push(new DelayedBlast(m.pos, b.radius, 0.45, pk, 'monster', 'fire', m));
    setTimeout(() => {
      g.fx.burst('fireblast', m.pos, { radius: b.radius });
      g.sfx.play('skill.fire_impact', { pos: m.pos, vol: 0.7 });
    }, 400);
  }
  if (m.hasOwn(18)) {
    const b = coldEnchantBurst(m.level);
    const pk = emptyPacket();
    pk.cold = randInt(b.cold[0], b.cold[1]);
    pk.chill = b.chill;
    pk.spell = true;
    pk.source = m;
    g.level.blasts.push(new DelayedBlast(m.pos, b.radius, 0.1, pk, 'monster', 'frost', m));
    g.fx.burst('frostnova', m.pos, { radius: b.radius });
    g.sfx.play('skill.cold_impact', { pos: m.pos, vol: 0.7 });
  }
  if (m.rank === 'boss') {
    g.fx.shake(0.8);
    g.hooks.message(`${m.displayName} 被击败了！`, '#c8a86a', 4);
    g.say('boss_dead');
    g.save();
  }
}

/** chance-to-cast mods on the player's gear, for one kind of event */
/** the burst, sound and message of a level gained */
export function celebrateLevelUp(g: Game) {
  const p = g.player;
  g.fx.burst('levelup', p.pos);
  g.sfx.play('player.level_up', { pos: p.pos });
  g.hooks.message(`等级提升！你现在是 ${p.level} 级`, '#ffd24a', 3);
  g.say('level_up');
  g.hooks.levelUp();
}

/**
 * loot from a monster or a container (src/game/loot.ts) for the hero, rolled once more for each extra
 * pass the debug panel asks for. A monster the hireling killed drops by her magic and gold find and
 * her hero's added (D2GAME_DropTC_6FC51360: the killer, the dying monster's target set to its killer
 * at SUnitDmg.cpp:1862 and passed on at MonsterMode.cpp:572, finds by its own STAT_ITEM_MAGICBONUS plus
 * its owner's, AIGENERAL_GetMinionOwner, D2Game ITEMS/Items.cpp:2334-2341, gold the same at 2549-2556;
 * the hireling's owner is her hero, MonsterAI.cpp:127), in the hero's difficulty and quests (the
 * owner's quest flags pick a quest drop, MonsterMode.cpp:534-560)
 */
export function rollLoot(g: Game, roll: (hero: Finder) => Item[], by: Killer = 'hero'): Drop[] {
  const p = g.player;
  const own = p.stats;
  const s = by instanceof Merc ? { mf: by.mf + own.mf, gf: by.gf + own.gf } : own;
  // a rift's floors drop in its tier's difficulty, never a quest's class: its kills are no quest's
  const hero: Finder = { mf: s.mf, gf: s.gf, difficulty: p.rules, quests: p.ruled === null ? p.quests[p.difficulty] : 'done' };
  const drops: Drop[] = [];
  for (let i = 0; i < debugOpts.loot; i++) for (const item of roll(hero)) drops.push({ kind: 'item', item });
  return drops;
}

export function onProc(g: Game, kind: StatKey, target: Monster | null) {
  const p = g.player;
  for (const m of p.stats.procs) {
    if (m.stat !== kind || !chance(m.value / 100)) continue;
    castItemSkill(g, p, (SKILL_BY_ID[m.param ?? ''] ? m.param : D2_TO_GAME[m.param ?? ''])!, m.lvl ?? 1, target && !target.dead ? target : null);
  }
}

export function killPlayer(g: Game) {
  const p = g.player;
  if (p.dead) return;
  if (debugOpts.god) {
    p.life = p.d.maxLife;
    return;
  }
  onProc(g, 'procDeath', null);
  p.dead = true;
  // the hireling falls with the hero (docs/M2A.md 佣兵和任务: as in Diablo II)
  fallWithHero(g);
  p.life = 0;
  p.setState('dead');
  p.intent = null;
  // Diablo II's death penalty as the death starts (PLAYER_ApplyDeathPenalty: game/d2/death.ts):
  // min(level, 20) % of all the gold, the inventory's first, and in nightmare and hell some of
  // the level's experience; the gold left in the inventory drops by the body (leaveCorpse). The
  // shared pages' gold is out of reach of it, as in D2R
  const pen = deathPenalty({ level: p.level, xp: p.xp, gold: p.gold, stashGold: p.stashGold, diff: p.rules });
  p.gold = pen.goldDropped;
  p.stashGold = pen.stashGold;
  p.xp = pen.xp;
  g.lastDeath = pen;
  g.sfx.play('player.death', { pos: p.pos });
  g.fx.death(p, 'red', 'phys');
  g.hooks.playerDied();
}
