// The Sisters' Burial Grounds (a1q2, 众姊妹之冢) as Diablo II plays it: D2MOO D2Game/src/QUESTS/ACT1/A1Q2.cpp
// at commit d9d394f. Kashya offers it once the Den of Evil is done; it starts anyway if the hero walks
// into the Burial Grounds first; it is done when the Burial Grounds' Blood Raven dies with the hero in
// her room or one next to it, whoever killed her; and Kashya hands over a hireling for nothing, then or
// in any later game, and hires out before level 8 from then on (hireling.ts mayHire).
import { SISTERS_LINES, SISTERS_LOG } from '../../data/dialogue';
import { QUEST_BY_KEY } from '../../data/quests';
import { M_PER_D2_TILE } from '../../core/units';
import type { P2 } from '../../core/math';
import { BURIAL_GROUNDS, CAMP_AREA, type AreaDef } from '../../world/areas';
import { hirelingName } from '../d2/hireling';
import type { Killer } from '../actor';
import type { Level } from '../level';
import type { Monster } from '../monster';
import { QuestScript, fillLine, type LogEntry, type QuestHost, type Topic } from './quest';
import { QFLAG } from './record';

/** the NPC who gives it */
const KASHYA = 'kashya';
/**
 * quest ticks from her death until the log says to go back to Kashya: QUESTS_CreateTimer's 15
 * (A1Q2.cpp:346), whose timer goes off on the sixteenth tick after (Quests.cpp:724, 780)
 */
const BACK_TICKS = 16;

/**
 * D2's room, in metres: an outdoor level is cut into rooms of 8 × 8 tiles from its corner, its plain
 * cells (DRLGOUTPLACE_CreateOutdoorRoomEx, D2Common Drlg/DrlgOutdoors.cpp:799-830) and its presets
 * alike, the Burial Grounds' graveyard among them (DRLGPRESET_BuildArea, DrlgPreset.cpp:1259-1290);
 * at our scale a tile is M_PER_D2_TILE, so 10 m
 */
export const ROOM_M = 8 * M_PER_D2_TILE;

/** the room `p` is in, counted in rooms from `corner` */
const roomOf = (corner: P2, p: P2) => [Math.floor((p.x - corner.x) / ROOM_M), Math.floor((p.z - corner.z) / ROOM_M)];

/**
 * Whether `hero` stands in `raven`'s room or one of the rooms near it, the diagonal ones too
 * (ACT1Q2_UnitIterate_SetRewardPending, A1Q2.cpp:363-405: her room, or one of the hero's room's list
 * of rooms near it, DUNGEON_GetAdjacentRoomsListFromRoom, D2Common D2Dungeon.cpp:169-174). D2 counts a
 * room near when the gap to it is under 6 tiles either way (sub_6FD77BB0, Drlg/DrlgDrlgRoom.cpp:615-642),
 * which on its grid of 8-tile rooms is the eight round it; the rooms counted from the Burial Grounds'
 * corner (`corner`), and on past its edge (a room of the next area by its link is near too: 769-811)
 */
export function nearRaven(corner: P2, hero: P2, raven: P2): boolean {
  const [hx, hz] = roomOf(corner, hero);
  const [rx, rz] = roomOf(corner, raven);
  return Math.abs(hx - rx) <= 1 && Math.abs(hz - rz) <= 1;
}

/** the Burial Grounds' corner on `level`, its rooms' origin: the first tile of it, row by row and column by column */
function cornerOf(level: Level): P2 | null {
  const { w } = level.map;
  let x0 = Infinity;
  let z0 = Infinity;
  level.areas.forEach((id, i) => {
    if (id !== BURIAL_GROUNDS) return;
    x0 = Math.min(x0, i % w);
    z0 = Math.min(z0, Math.floor(i / w));
  });
  return x0 === Infinity ? null : { x: x0, z: z0 };
}

export class SistersBurialGrounds extends QuestScript {
  /** bKashyaActivated: the hero has just been given it, and Kashya's menu is still up */
  private kashyaActivated = false;
  /** quest ticks until the log says to go back (the timer of A1Q2.cpp:346); -1 when none is running */
  private timer = -1;
  /** the hero had the reward in this game, since last leaving town (tPlayerGUIDs, A1Q2.cpp:270, 491) */
  private rewardedHere = false;

  constructor(host: QuestHost) {
    super(QUEST_BY_KEY.a1q2, host);
    // ACT1Q2_InitQuestData (A1Q2.cpp:148): not on offer until the sequence reaches it (offer)
    this.state = 0;
  }

  start() {
    // done before: it doesn't play this game (QUESTS_SequenceCycler, Quests.cpp:1094-1110)
    if (this.has(QFLAG.REWARDGRANTED) || this.has(QFLAG.COMPLETEDBEFORE)) {
      this.playable = false;
      return;
    }
    // under way: as far as the record says (ACT1Q2_Callback13_PlayerStartedGame, A1Q2.cpp:537-561)
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
   * The sequence reached it (ACT1Q2_SeqCallback, A1Q2.cpp:509-534): Kashya offers it now, unless it is
   * under way already. The Den of Evil's sequence passes on to it once that quest is done in this game
   * or an earlier one (ACT1Q1_SeqCallback, A1Q1.cpp:509-529: Quests.cpp:1136-1149 runs it as a game
   * starts, A1Q1.cpp:225-236 as Akara hands her reward over): Quests.sequence
   */
  offer() {
    if (this.playable && this.state === 0) this.state = 1;
  }

  /**
   * The line Kashya says at once (ACT1Q2_Callback00_NpcActivate, A1Q2.cpp:277-316, through
   * gpAct1Q2NpcMessages): the reward speech while it waits (message 92), else the quest itself while
   * it's on offer (81)
   */
  opening(npc: string): Topic | null {
    if (npc !== KASHYA) return null;
    if (this.has(QFLAG.REWARDPENDING)) return this.topic(npc, 'reward', SISTERS_LINES.reward);
    if (this.rewardedHere || this.has(QFLAG.REWARDGRANTED) || !this.playable) return null;
    if (this.state === 1) return this.topic(npc, 'intro', SISTERS_LINES.intro);
    return null;
  }

  /**
   * under 交谈: while it is under way, before leaving the camp (82), after (87); and the reward speech
   * again in the visit it was handed over in, till the hero leaves the camp (the fifth table of
   * gpAct1Q2NpcMessages has Kashya's 92 under her menu: A1Q2.cpp:55-63, 304-307)
   */
  talk(npc: string): Topic | null {
    if (npc !== KASHYA || this.has(QFLAG.REWARDPENDING)) return null;
    if (this.rewardedHere) return this.topic(npc, 'reward', SISTERS_LINES.reward);
    if (this.has(QFLAG.REWARDGRANTED) || !this.playable) return null;
    if (this.state === 2) return this.topic(npc, 'remind', SISTERS_LINES.remind);
    if (this.state === 3) return this.topic(npc, 'remindOut', SISTERS_LINES.remindOut);
    return null;
  }

  /** ACT1Q2_Callback11_ScrollMessage (A1Q2.cpp:223-274) */
  spoke(t: Topic) {
    if (t.npc !== KASHYA || t.quest !== this.key) return;
    if (t.id === 'intro') {
      // the quest is given (message 81)
      this.kashyaActivated = true;
      this.state = 2;
      this.updateFlags();
    } else if (t.id === 'reward') this.reward();
  }

  /**
   * The reward speech heard (message 92, A1Q2.cpp:239-273): the reward granted, once, and a hireling
   * for nothing (D2GAME_NPC_AssignMercenary, SUnitNpc.cpp:2887-2939: the first on offer; none to a
   * hero who has one, dead or alive, 2896). Unlike the Den of Evil, D2 leaves the record's steps
   * (STARTED, LEAVETOWN, ENTERAREA) set (260-262). The flags are set before she is given, so the save
   * that takes her on (merc.ts giveFreeMerc) holds them too.
   */
  private reward() {
    if (!this.has(QFLAG.REWARDPENDING)) return;
    if (this.has(QFLAG.PRIMARYGOALDONE) && this.state !== 5) {
      this.state = 5;
      this.status(13);
    }
    this.set(QFLAG.REWARDGRANTED);
    this.clear(QFLAG.REWARDPENDING);
    this.rewardedHere = true;
    const given = this.host.giveFreeMerc();
    const st = this.host.player.merc;
    const n = given && st ? hirelingName(st.hire, st.name) : undefined;
    this.host.hooks.message(fillLine(given ? SISTERS_LINES.got : SISTERS_LINES.gotNone, { name: [n?.name ?? '', n?.nameEn ?? ''] }).zh, '#ffd24a', 4);
    this.host.hooks.questsChanged?.();
    this.host.save();
  }

  /** Kashya's menu closed after giving it: the log says to find Blood Raven (ACT1Q2_Callback02_NpcDeactivate, A1Q2.cpp:152-170) */
  left(npc: string) {
    if (npc !== KASHYA || !this.kashyaActivated) return;
    this.status(1);
    this.kashyaActivated = false;
    this.updateFlags();
  }

  /** the mark over Kashya: the quest to give, or its reward to hand over (ACT1Q2_ActiveFilterCallback, A1Q2.cpp:98-116) */
  news(npc: string): boolean {
    if (npc !== KASHYA || this.has(QFLAG.REWARDGRANTED)) return false;
    if (this.has(QFLAG.REWARDPENDING)) return true;
    return this.state === 1;
  }

  /** ACT1Q2_Callback03_ChangedLevel (A1Q2.cpp:461-506) */
  changedArea(area: AreaDef, prev: AreaDef | null) {
    if (area.id === BURIAL_GROUNDS && this.playable) {
      // into the Burial Grounds, given or not: under way (D2 keeps the first test's answer, 465-473)
      const moved = this.state < 3;
      if (moved) this.state = 3;
      if (this.last === 0 || this.last === 1) {
        // the first time in: the log says to find her
        this.status(2);
        this.updateFlags();
        // the hero knows the place (voice-lines.md 'graveyard')
        return 'graveyard' as const;
      }
      if (moved) {
        this.updateFlags();
        return null;
      }
    }
    if (prev?.id !== CAMP_AREA) return null;
    // out of the camp: Kashya's word on the reward is said (QUESTS_QuickRemovePlayerGUID)
    this.rewardedHere = false;
    if (this.state !== 2 || this.has(QFLAG.REWARDGRANTED) || this.has(QFLAG.REWARDPENDING)) return null;
    this.state = 3;
    this.updateFlags();
    return null;
  }

  /** the record follows the game's state (ACT1Q2_UnitIterate_UpdateQuestStateFlags, A1Q2.cpp:188-220) */
  private updateFlags() {
    if (this.has(QFLAG.REWARDGRANTED) || this.has(QFLAG.REWARDPENDING)) return;
    if (this.state === 2) this.set(QFLAG.STARTED);
    else if (this.state === 3) this.set(this.last === 1 ? QFLAG.LEAVETOWN : QFLAG.ENTERAREA);
  }

  /**
   * Whether the hero stood near `m` as she died: on her map, in her room or one next to it (nearRaven).
   * D2 asks it of the hero's room, alive or dead (A1Q2.cpp:365-405)
   */
  private heroNear(m: Monster): boolean {
    const L = this.host.level;
    if (!L || L !== this.host.mapOf(BURIAL_GROUNDS) || !L.monsters.includes(m)) return false;
    const corner = cornerOf(L);
    return !!corner && nearRaven(corner, this.host.player.pos, m.pos);
  }

  /**
   * Blood Raven died (ACT1Q2_Callback08_MonsterKilled, A1Q2.cpp:319-351). Only the Burial Grounds' one
   * is heard: D2 tells a death to the quests on the dying monster's own list (QUESTS_ParseKill,
   * Quests.cpp:453-458, 543-545), hers set as she is placed (Monster.quest, docs/M2A.md: not a trial
   * floor's nor a rift's). Whoever killed her, the hero, the hireling or nobody, the hero has it done
   * when standing near her (heroNear), the reward then waiting (363-416); else it is done in this game
   * without a reward (419-430), to be done again in a later one.
   */
  monsterKilled(m: Monster, _killer: Killer) {
    if (m.quest !== this.key || !this.playable) return;
    this.state = 4;
    // the kill closes Kashya's giving it, should her menu still be up (A1Q2.cpp:347)
    this.kashyaActivated = false;
    if (this.heroNear(m) && !this.has(QFLAG.REWARDGRANTED) && !this.has(QFLAG.REWARDPENDING)) {
      this.set(QFLAG.PRIMARYGOALDONE);
      this.set(QFLAG.REWARDPENDING);
    }
    // ACT1Q2_UnitIterate_SetCompletionFlag (419-430): without a reward, done in this game all the same
    if (!this.has(QFLAG.REWARDGRANTED) && !this.has(QFLAG.REWARDPENDING)) {
      this.set(QFLAG.COMPLETEDNOW);
      this.host.hooks.message(fillLine(SISTERS_LINES.missed).zh, '#c8a86a', 5);
      this.host.hooks.questsChanged?.();
    }
    // the quest's sound for the hero who reached the goal (ACT1Q2_UnitIterate_AttachCompletionSound, 433-441: sound 34)
    if (this.has(QFLAG.PRIMARYGOALDONE)) {
      this.host.sfx.play('ui.quest_done', { pos: this.host.player.pos });
      this.host.say('quest_done');
      this.host.hooks.message(fillLine(SISTERS_LINES.slain).zh, '#ffd24a', 5);
      this.host.hooks.message(fillLine(SISTERS_LINES.back).zh, '#c8a86a', 5);
      this.host.hooks.questsChanged?.();
    }
    // a while later, the log says to go back to Kashya (ACT1Q2_Timer_StatusCycler, 354-360)
    this.timer = BACK_TICKS;
    this.host.save();
  }

  tick() {
    if (this.timer < 0 || --this.timer > 0) return;
    this.timer = -1;
    this.status(3);
  }

  log(): LogEntry {
    const entry = (state: LogEntry['state'], line: (typeof SISTERS_LOG)[keyof typeof SISTERS_LOG]) => ({ state, text: fillLine(line).zh });
    if (this.has(QFLAG.REWARDGRANTED)) return entry('done', SISTERS_LOG.done);
    if (this.has(QFLAG.REWARDPENDING)) return entry('reward', SISTERS_LOG.back);
    // done in this game without a reward of its own (QUESTS_RefreshStatus, Quests.cpp:786-840: status 12)
    if (this.has(QFLAG.COMPLETEDNOW)) return entry('done', SISTERS_LOG.missed);
    switch (this.last) {
      case 1:
        return entry('active', SISTERS_LOG.given);
      case 2:
        return entry('active', SISTERS_LOG.find);
      case 3:
        return entry('reward', SISTERS_LOG.back);
      case 12:
      case 13:
        return entry('done', SISTERS_LOG.done);
    }
    return { state: 'none', text: '' };
  }
}
