// The Den of Evil (a1q1, 涤荡邪巢) as Diablo II plays it: D2MOO D2Game/src/QUESTS/ACT1/A1Q1.cpp at
// commit d9d394f. Akara gives it; it starts anyway if the hero walks into the den first; it is
// done when every monster that counts in the den is dead, and Akara hands over a skill point, then
// or in any later game.
import { DEN_LINES, DEN_LOG } from '../../data/dialogue';
import { QUEST_BY_KEY } from '../../data/quests';
import { CAMP_AREA, DEN_OF_EVIL, type AreaDef } from '../../world/areas';
import type { Level } from '../level';
import { d2MonsterOf } from '../loot';
import type { Monster } from '../monster';
import { QuestScript, fillLine, type LogEntry, type QuestHost, type Topic } from './quest';
import { QFLAG, resetIntermediateStateFlags } from './record';

/** the NPC who gives it */
const AKARA = 'akara';
/**
 * quest ticks from the den's clearing until the log says to go back to Akara: QUESTS_CreateTimer's 8
 * (A1Q1.cpp:380), whose timer goes off on the ninth tick after (Quests.cpp:724, 780)
 */
const BACK_TICKS = 9;
/** at most this many left, each kill tells how many (A1Q1.cpp:346-361) */
const FEW = 5;

/**
 * Whether a monster counts toward clearing its level: those whose MonStats row is neverCount are
 * never counted in (MONSTERREGION_RegisterSpawnedMonster, MonsterRegion.cpp:1107-1118, the flag as
 * MonsterSpawn.cpp:740-745 passes it), and only a hostile one's death is counted
 * (MONSTERREGION_RecordMonsterKill, 1145-1153): so a critter or an ally (MonStats align 2 or 1)
 * never holds the quest up. The monster's row is the one it drops as (loot.ts d2MonsterOf); one
 * with none counts. D2 also leaves out what is summoned in play (the spawn's flag 8), which this
 * build's monsters never are.
 */
export function countsInLevel(m: Monster): boolean {
  const row = d2MonsterOf(m.def.id);
  return !row || (row.align === 0 && !row.neverCount);
}

/** whether `m`, one of the den map's monsters, counts in the den's monster region (pMonReg[LEVEL_DENOFEVIL], A1Q1.cpp:330) */
const countsInDen = (den: Level, m: Monster) => countsInLevel(m) && den.areaAt(m.pos.x, m.pos.z).id === DEN_OF_EVIL;

/** the monsters still standing in the den that count (D2: dwMonSpawnCount - dwMonKillCount of its monster region, A1Q1.cpp:334) */
export function monstersLeft(den: Level): number {
  let n = 0;
  for (const m of den.monsters) if (!m.dead && countsInDen(den, m)) n++;
  return n;
}

export class DenOfEvil extends QuestScript {
  /** bAkaraActivated: the hero has just been given it, and Akara's menu is still up */
  private akaraActivated = false;
  /** bFinished: the den was cleared in this game */
  private finished = false;
  /** quest ticks until the log says to go back (bTimerActive); -1 when none is running */
  private timer = -1;
  /** nMonstersLeft: the den's monsters still standing, as last counted */
  remaining = 0;
  /** the hero has made a kill this game (pQuestGUID): the den's clearing is theirs */
  private credited = false;
  /** the hero had the reward in this game, since last leaving town (tPlayerGUIDs) */
  private rewardedHere = false;
  /**
   * a den made before this quest's game began: the debug panel changed the difficulty, keeping the
   * maps, and its monsters lived and died in the last difficulty. D2 plays one difficulty a game,
   * so it isn't counted; the next game's den is
   */
  private readonly oldDen: Level | null;

  constructor(host: QuestHost) {
    super(QUEST_BY_KEY.a1q1, host);
    this.oldDen = host.mapOf(DEN_OF_EVIL);
  }

  /** the den of this game, once made */
  private get den(): Level | null {
    const den = this.host.mapOf(DEN_OF_EVIL);
    return den && den !== this.oldDen ? den : null;
  }

  start() {
    // done before: it doesn't play this game (QUESTS_SequenceCycler, Quests.cpp:1094-1110)
    if (this.has(QFLAG.REWARDGRANTED) || this.has(QFLAG.COMPLETEDBEFORE)) {
      this.playable = false;
      return;
    }
    // under way: as far as the record says (ACT1Q1_Callback13_PlayerStartedGame, A1Q1.cpp:532-556)
    if (this.has(QFLAG.ENTERAREA)) {
      this.last = 2;
      this.state = 3;
    } else if (this.has(QFLAG.LEAVETOWN)) {
      this.state = 3;
      this.last = 1;
    } else if (this.has(QFLAG.STARTED)) {
      this.state = 2;
      this.last = 1;
    }
  }

  /**
   * The line Akara says at once (ACT1Q1_Callback00_NpcActivate, A1Q1.cpp:289-319, through
   * gpAct1Q1NpcMessages): the reward speech while it waits, else the quest itself the first time
   */
  opening(npc: string): Topic | null {
    if (npc !== AKARA) return null;
    if (this.has(QFLAG.REWARDPENDING)) return this.topic(npc, 'reward', DEN_LINES.reward);
    if (this.rewardedHere || this.has(QFLAG.REWARDGRANTED) || !this.playable) return null;
    if (this.state === 1) return this.topic(npc, 'intro', DEN_LINES.intro);
    return null;
  }

  /** under 交谈, while it is under way: before leaving the camp (message 65), after (71) */
  talk(npc: string): Topic | null {
    if (npc !== AKARA || this.rewardedHere || this.has(QFLAG.REWARDGRANTED) || this.has(QFLAG.REWARDPENDING) || !this.playable) return null;
    if (this.state === 2) return this.topic(npc, 'remind', DEN_LINES.remind);
    if (this.state === 3) return this.topic(npc, 'remindOut', DEN_LINES.remindOut);
    return null;
  }

  /** ACT1Q1_Callback11_ScrollMessage (A1Q1.cpp:201-251) */
  spoke(t: Topic) {
    if (t.npc !== AKARA || t.quest !== this.key) return;
    if (t.id === 'intro') {
      // the quest is given (message 64)
      this.akaraActivated = true;
      this.state = 2;
      this.updateFlags();
    } else if (t.id === 'reward') this.reward();
  }

  /** the reward speech heard (message 76): a skill point, once (A1Q1.cpp:218-250) */
  private reward() {
    if (!this.has(QFLAG.REWARDPENDING)) return;
    if (this.has(QFLAG.PRIMARYGOALDONE) && this.state !== 5) {
      this.state = 5;
      this.status(13);
    }
    this.set(QFLAG.REWARDGRANTED);
    this.clear(QFLAG.REWARDPENDING);
    resetIntermediateStateFlags(this.record, this.key);
    const p = this.host.player;
    p.skillPoints += 1;
    this.rewardedHere = true;
    this.host.sfx.play('ui.skill_learn', { pos: p.pos });
    this.host.hooks.message(fillLine(DEN_LINES.got).zh, '#ffd24a', 4);
    this.host.hooks.levelUp();
    this.host.hooks.questsChanged?.();
    this.host.save();
  }

  /** Akara's menu closed after giving it: the log says to find the den (ACT1Q1_Callback02_NpcDeactivate, A1Q1.cpp:166-183) */
  left(npc: string) {
    if (npc !== AKARA || !this.akaraActivated) return;
    this.status(1);
    this.akaraActivated = false;
  }

  /** the mark over Akara: the quest to give, or its reward to hand over (ACT1Q1_ActiveFilterCallback, A1Q1.cpp:116-134) */
  news(npc: string): boolean {
    if (npc !== AKARA || this.has(QFLAG.REWARDGRANTED)) return false;
    if (this.has(QFLAG.REWARDPENDING)) return true;
    return this.playable && this.state === 1;
  }

  /** ACT1Q1_Callback03_ChangedLevel (A1Q1.cpp:446-506) */
  changedArea(area: AreaDef, prev: AreaDef | null) {
    if (area.id === DEN_OF_EVIL) {
      if (!this.playable) return null;
      if (this.state === 1 || this.state === 2) this.state = 3;
      // the first time in, given or not: the log says to clear it
      if (this.last >= 2) return null;
      this.status(2);
      this.updateFlags();
      // the hero knows the place (voice-lines.md 'lair')
      return 'lair' as const;
    }
    if (prev?.id !== CAMP_AREA) return null;
    // out of the camp: Akara's thanks are said (QUESTS_QuickRemovePlayerGUID)
    this.rewardedHere = false;
    if (this.state !== 2 || this.has(QFLAG.REWARDGRANTED) || this.has(QFLAG.REWARDPENDING)) return null;
    this.state = 3;
    this.updateFlags();
    if (this.last !== 1) this.status(1);
    return null;
  }

  /** the record follows the game's state (ACT1Q1_UnitIterate_UpdateQuestStateFlags, A1Q1.cpp:254-286) */
  private updateFlags() {
    if (this.has(QFLAG.REWARDGRANTED) || this.has(QFLAG.REWARDPENDING)) return;
    if (this.state === 2) this.set(QFLAG.STARTED);
    else if (this.state === 3) this.set(this.last === 1 ? QFLAG.LEAVETOWN : QFLAG.ENTERAREA);
  }

  /**
   * Every kill counts the den again (ACT1Q1_Callback08_MonsterKilled, A1Q1.cpp:322-383): with five or
   * fewer left the log tells how many, and with none it is done. Before the den is made (D2: its
   * rooms not yet populated) there is nothing to count.
   */
  monsterKilled(m: Monster) {
    if (!this.playable || this.finished) return;
    this.credited = true;
    const den = this.den;
    if (!den) return;
    const before = this.remaining;
    this.remaining = monstersLeft(den);
    if (this.remaining > 0) {
      // D2 sends status 4 on any kill anywhere (A1Q1.cpp:346-361); the on-screen count and the log's
      // news are ours, so only for a kill that changed it: one of the den's own, or fewer left
      const news = (den.monsters.includes(m) && countsInDen(den, m)) || this.remaining < before;
      if (this.remaining <= FEW) {
        this.status(4, news);
        if (news) this.host.hooks.message(fillLine(DEN_LINES.few, { n: this.remaining }).zh, '#c8a86a', 2.5);
      } else if (this.last === 4) this.status(4, news);
      return;
    }
    this.finish();
  }

  /** the den's last monster died (A1Q1.cpp:363-382) */
  private finish() {
    this.finished = true;
    this.state = 4;
    // QUESTS_GUIDUpdate (Quests.cpp:2516-2539): the hero, credited with a kill, has it done and its reward waiting
    if (this.credited && !this.has(QFLAG.REWARDGRANTED) && !this.has(QFLAG.REWARDPENDING)) {
      this.set(QFLAG.PRIMARYGOALDONE);
      this.set(QFLAG.REWARDPENDING);
    }
    // ACT1Q1_UnitIterate_SetCompletionFlag (386-399): anyone else without a reward has it done now
    if (!this.has(QFLAG.REWARDGRANTED) && !this.has(QFLAG.REWARDPENDING)) this.set(QFLAG.COMPLETEDNOW);
    // the quest's sound for whoever reached the goal (ACT1Q1_UnitIterate_AttachCompletionSound, 402-410: sound 35)
    if (this.has(QFLAG.PRIMARYGOALDONE)) {
      this.host.sfx.play('ui.quest_done', { pos: this.host.player.pos });
      this.host.say('quest_done');
      this.host.hooks.message(fillLine(DEN_LINES.cleared).zh, '#ffd24a', 5);
      this.host.hooks.message(fillLine(DEN_LINES.back).zh, '#c8a86a', 5);
    }
    // the log shows the den cleared; a while later, to go back to Akara (ACT1Q1_Timer_StatusCycler, 430-443)
    this.status(4);
    this.timer = BACK_TICKS;
    this.host.save();
  }

  tick() {
    if (this.timer < 0 || --this.timer > 0) return;
    this.timer = -1;
    if (this.state === 4) this.status(5);
  }

  /** once cleared in this game, the den is lit (QUESTS_TriggerFX event 0; ACT1Q1_CanClientFXBeTriggered, A1Q1.cpp:559-562) */
  lights(level: Level): boolean {
    return this.playable && this.state >= 4 && level === this.den;
  }

  log(): LogEntry {
    const entry = (state: LogEntry['state'], line: (typeof DEN_LOG)[keyof typeof DEN_LOG]) => ({ state, text: fillLine(line, { n: this.remaining }).zh });
    if (this.has(QFLAG.REWARDGRANTED)) return entry('done', DEN_LOG.done);
    if (this.has(QFLAG.REWARDPENDING)) return entry('reward', DEN_LOG.back);
    // done in this game without a reward of its own (QUESTS_RefreshStatus, Quests.cpp:786-840: status 12)
    if (this.has(QFLAG.COMPLETEDNOW)) return entry('done', DEN_LOG.done);
    switch (this.last) {
      case 1:
        return entry('active', DEN_LOG.given);
      case 2:
        return entry('active', DEN_LOG.clear);
      case 4:
        return entry('active', this.state >= 4 ? DEN_LOG.back : DEN_LOG.few);
      case 5:
        return entry('reward', DEN_LOG.back);
      case 12:
      case 13:
        return entry('done', DEN_LOG.done);
    }
    return { state: 'none', text: '' };
  }
}
