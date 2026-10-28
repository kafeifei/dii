// A quest as the game being played runs it: Diablo II keeps beside each hero's record a state of its
// own for every quest in a game (D2Game QUESTS/Quests.h D2QuestDataStrc), made anew each game from
// the record and driven by the game's events (QUESTS/Quests.cpp QUESTS_EventCallback). This is that
// state and those events, for one hero. D2MOO references are to github.com/ThePhrozenKeep/D2MOO at
// commit d9d394f.
import type { Sfx } from '../../audio/sfx';
import type { HeroLine } from '../../audio/sounds';
import { D2X_MONSTERS } from '../../data/d2x/monsters';
import type { Line } from '../../data/dialogue';
import type { QuestDef, QuestKey } from '../../data/quests';
import { CAMP_AREA, DEN_OF_EVIL, WILD_AREA, areaDef, type AreaDef } from '../../world/areas';
import type { Level } from '../level';
import type { Monster } from '../monster';
import type { Player } from '../player';
import { clearQuestState, questState, setQuestState, type QuestRecord } from './record';

/** what a quest needs of the game (Game) */
export interface QuestHost {
  readonly player: Player;
  readonly sfx: Sfx;
  readonly hooks: {
    message(text: string, color?: string, dur?: number): void;
    /** a quest moved on: the log has news */
    questsChanged?(): void;
    /** the hero's points changed */
    levelUp(): void;
  };
  say(line: HeroLine): void;
  save(): void;
  /** the map that holds area `id` in this game, if it has been made yet */
  mapOf(id: number): Level | null;
}

/** something a townsperson says: a quest's line, or their small talk */
export interface Topic {
  /** who says it (their MonStats id) */
  npc: string;
  /** the quest it belongs to; none for small talk */
  quest?: QuestKey;
  /** which of the quest's lines (data/dialogue.ts) */
  id: string;
  /** what is said, the placeholders filled */
  text: string;
  en: string;
}

/**
 * How the quest log shows a quest: off, not in this build; none, not given yet; active, under way;
 * reward, done and its reward waiting; done
 */
export type LogState = 'off' | 'none' | 'active' | 'reward' | 'done';

export interface LogEntry {
  state: LogState;
  /** the log's words for it, filled */
  text: string;
}

/** the names a line's placeholders stand for, from the rename tables: the areas' (AreaDef) and Akara's row (D2X_MONSTERS) */
function names(): Record<string, [string, string]> {
  const area = (id: number): [string, string] => {
    const a = areaDef(id)!;
    return [a.name, a.en];
  };
  const akara = D2X_MONSTERS.akara;
  return { camp: area(CAMP_AREA), moor: area(WILD_AREA), den: area(DEN_OF_EVIL), akara: [akara.name ?? '', akara.nameEn ?? ''] };
}

/** a line with its placeholders filled ({moor}, {akara}… and `vars`, {n}) */
export function fillLine(line: Line, vars: Record<string, string | number> = {}): Line {
  const n = names();
  const fill = (s: string, lang: 0 | 1) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : (n[k]?.[lang] ?? m)));
  return { zh: fill(line.zh, 0), en: fill(line.en, 1) };
}

/** whether area `a` is a town (leaving one is D2's QFLAG_LEAVETOWN) */
export const isTown = (a: AreaDef | null | undefined) => a?.kind === 'town';

/**
 * One quest in the game being played (D2QuestDataStrc): its state and its handlers for the game's
 * events. The quests of this build each extend it; the rest show in the log as not there yet.
 */
export abstract class QuestScript {
  /** fState: how far it has come in this game; 1 is not given yet (each quest's InitQuestData) */
  state = 1;
  /** fLastState: the status the log shows, D2's numbers for it (QUESTS_RefreshStatus, Quests.cpp:786-840) */
  last = 0;
  /**
   * bNotIntro: it plays in this game. Not once the hero has done it in an earlier game (its
   * reward granted, or left waiting: QUESTS_SequenceCycler, Quests.cpp:1094-1110)
   */
  playable = true;

  constructor(
    readonly def: QuestDef,
    protected host: QuestHost,
  ) {}

  get key(): QuestKey {
    return this.def.key;
  }

  /** the hero's record in the difficulty played */
  protected get record(): QuestRecord {
    const p = this.host.player;
    return p.quests[p.difficulty];
  }

  protected has(flag: number): boolean {
    return questState(this.record, this.key, flag);
  }

  protected set(flag: number) {
    setQuestState(this.record, this.key, flag);
  }

  protected clear(flag: number) {
    clearQuestState(this.record, this.key, flag);
  }

  /**
   * the log shows a new status (QUESTS_UnitIterate with a status cycle: fLastState, sent to the
   * client); `news` false refreshes it without flagging the log's button
   */
  protected status(n: number, news = true) {
    this.last = n;
    if (news) this.host.hooks.questsChanged?.();
  }

  protected topic(npc: string, id: string, line: Line, vars?: Record<string, string | number>): Topic {
    const l = fillLine(line, vars);
    return { npc, quest: this.key, id, text: l.zh, en: l.en };
  }

  /** the hero enters the game: what the record says of it (QUESTS_SequenceCycler and its PlayerStartedGame callback) */
  start() {}
  /** what `npc` says at once on being spoken to, before their menu (NpcActivate's SCROLLMENU_MESSAGE lines) */
  opening(_npc: string): Topic | null {
    return null;
  }
  /** what `npc` has to say about it under 交谈 (NpcActivate's other lines) */
  talk(_npc: string): Topic | null {
    return null;
  }
  /** a line of its was heard to the end or cut short (ScrollMessage) */
  spoke(_topic: Topic) {}
  /** the hero walked away from `npc` (NpcDeactivate) */
  left(_npc: string) {}
  /** `npc` has news of it: the mark over their head (its ActiveFilter) */
  news(_npc: string): boolean {
    return false;
  }
  /** the hero came into `area` from `prev` (ChangedLevel); a line for the hero to say, if it calls for one */
  changedArea(_area: AreaDef, _prev: AreaDef | null): HeroLine | null {
    return null;
  }
  /** a monster died at the hero's hand (MonsterKilled) */
  monsterKilled(_m: Monster) {}
  /** one of D2's quest ticks went by (QUESTS_QuestUpdater's timers) */
  tick() {}
  /** what the quest log shows of it */
  abstract log(): LogEntry;
  /** a map it lights up (QUESTS_TriggerFX's client effect) */
  lights(_level: Level): boolean {
    return false;
  }
}
