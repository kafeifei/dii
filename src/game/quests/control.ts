// The quests of the game being played, as D2Game's quest control runs them (QUESTS/Quests.cpp):
// made with the game from the hero's record in its difficulty, told of the game's events, and asked
// what the townsfolk say, which of them has news and what the quest log shows. D2MOO references
// are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import type { HeroLine } from '../../audio/sounds';
import { FRAMES_PER_SEC } from '../../core/units';
import { GOSSIP, LOG_LINES } from '../../data/dialogue';
import { ACT1_QUESTS, type QuestKey } from '../../data/quests';
import type { AreaDef } from '../../world/areas';
import type { Killer } from '../actor';
import type { Level } from '../level';
import type { Monster } from '../monster';
import { DenOfEvil } from './denofevil';
import { fillLine, type LogEntry, type QuestHost, type QuestScript, type Topic } from './quest';
import { QFLAG, questState } from './record';

/** seconds between quest ticks: QUESTS_QuestUpdater runs every 20 frames (Game.cpp:1877-1880), 25 a second */
export const QUEST_TICK = 20 / FRAMES_PER_SEC;

export class Quests {
  /** the quests this build plays: only the Den of Evil so far */
  readonly scripts: QuestScript[];
  private clock = 0;
  /** each townsperson's next line of small talk */
  private gossipAt = new Map<string, number>();
  /**
   * the lines this game's townsfolk have been given to say (opening, talk): only those count when
   * heard (spoke), never one said in another game, its hero quit to the title or its difficulty left
   */
  private given = new WeakSet<Topic>();

  constructor(private host: QuestHost) {
    this.scripts = [new DenOfEvil(host)];
  }

  /** the hero enters the game (QUESTS_SequenceCycler, Quests.cpp:1073-1133: each quest's PlayerStartedGame) */
  start() {
    for (const s of this.scripts) s.start();
  }

  script(key: QuestKey): QuestScript | undefined {
    return this.scripts.find((s) => s.key === key);
  }

  /** what `npc` says at once on being spoken to, before their menu (QUESTS_NPCActivateSpeeches) */
  opening(npc: string): Topic | null {
    for (const s of this.scripts) {
      const t = s.opening(npc);
      if (t) return this.give(t);
    }
    return null;
  }

  /** what 交谈 has `npc` say: a quest's word if one has any, else their small talk in turn */
  talk(npc: string): Topic | null {
    return this.word(npc, true);
  }

  /** what 交谈 would have `npc` say now, not said: their next small talk stays next (townsfolk.ts fetchAhead) */
  nextTalk(npc: string): Topic | null {
    return this.word(npc, false);
  }

  private word(npc: string, said: boolean): Topic | null {
    for (const s of this.scripts) {
      const t = s.talk(npc);
      if (t) return this.give(t);
    }
    const g = this.gossip(npc, said);
    return g && this.give(g);
  }

  /** `t`, a line of this game's to say */
  private give(t: Topic): Topic {
    this.given.add(t);
    return t;
  }

  /**
   * their small talk in turn, of what they'd say by now, the turn moving on if it's `said`; each line
   * by its place among them all (gossip2), as it's recorded
   */
  private gossip(npc: string, said: boolean): Topic | null {
    const p = this.host.player;
    const rec = p.quests[p.difficulty];
    const all = GOSSIP[npc] ?? [];
    const lines = all.filter((g) => !g.after || questState(rec, g.after, QFLAG.REWARDGRANTED));
    if (!lines.length) return null;
    const i = (this.gossipAt.get(npc) ?? 0) % lines.length;
    if (said) this.gossipAt.set(npc, i + 1);
    const l = fillLine(lines[i]);
    return { npc, id: `gossip${all.indexOf(lines[i])}`, text: l.zh, en: l.en };
  }

  /** a line heard to the end, or cut short (ScrollMessage): one this game gave (given), never another game's */
  spoke(t: Topic) {
    if (!this.given.has(t)) return;
    for (const s of this.scripts) s.spoke(t);
  }

  /** the hero walked away from `npc` (NpcDeactivate) */
  left(npc: string) {
    for (const s of this.scripts) s.left(npc);
  }

  /** whether `npc` has quest news: the yellow mark over them (the quests' ActiveFilter) */
  hasNews(npc: string): boolean {
    return this.scripts.some((s) => s.news(npc));
  }

  /** the hero came into an area (ChangedLevel): a line a quest has them say, if any */
  areaChanged(area: AreaDef, prev: AreaDef | null): HeroLine | null {
    let line: HeroLine | null = null;
    for (const s of this.scripts) line = s.changedArea(area, prev) ?? line;
    return line;
  }

  /** a monster died (MonsterKilled), by `killer`'s hand, or by nobody's */
  monsterKilled(m: Monster, killer: Killer = 'hero') {
    for (const s of this.scripts) s.monsterKilled(m, killer);
  }

  update(dt: number) {
    this.clock += dt;
    while (this.clock >= QUEST_TICK) {
      this.clock -= QUEST_TICK;
      for (const s of this.scripts) s.tick();
    }
  }

  /** a map a quest has lit up */
  lights(level: Level): boolean {
    return this.scripts.some((s) => s.lights(level));
  }

  /** what the quest log shows of a quest */
  log(key: QuestKey): LogEntry {
    const s = this.script(key);
    if (!s) return { state: 'off', text: fillLine(LOG_LINES.off).zh };
    const e = s.log();
    return e.state === 'none' ? { state: 'none', text: fillLine(LOG_LINES.none).zh } : e;
  }

  /**
   * Quests the log has news of: done ones it hasn't shown done yet (the log sets QFLAG_UPDATEQUESTLOG
   * once it has, as D2's client says so with its packet 0x58, PlrMsg.cpp:3665-3679)
   */
  unseen(): QuestKey[] {
    const p = this.host.player;
    const rec = p.quests[p.difficulty];
    return ACT1_QUESTS.filter((q) => this.log(q.key).state === 'done' && !questState(rec, q.key, QFLAG.UPDATEQUESTLOG)).map((q) => q.key);
  }
}
