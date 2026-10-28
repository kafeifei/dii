// A hero's quest record, as Diablo II keeps one for each difficulty: a 16-bit word of flags for each
// quest (D2Common D2QuestRecord.cpp), here by quest key (a1q1…) in the save's
// progress[difficulty].quests (src/game/save.ts). D2MOO references are to
// github.com/ThePhrozenKeep/D2MOO at commit d9d394f.

/** a quest's flags, a bit each of its word (D2CommonDefinitions D2Constants.h:548-565 D2C_OriginalQuestFlags) */
export const QFLAG = {
  /** its reward was handed over: done */
  REWARDGRANTED: 0,
  /** done, the reward still to collect */
  REWARDPENDING: 1,
  /** given to the hero */
  STARTED: 2,
  /** given, and the hero has left town since */
  LEAVETOWN: 3,
  /** the hero has been to the quest's area */
  ENTERAREA: 4,
  /** each quest's own steps */
  CUSTOM1: 5,
  CUSTOM2: 6,
  CUSTOM3: 7,
  CUSTOM4: 8,
  CUSTOM5: 9,
  CUSTOM6: 10,
  CUSTOM7: 11,
  /** the log has shown it done (the client's word back, PlrMsg.cpp:3665-3679) */
  UPDATEQUESTLOG: 12,
  /** its goal was reached in the game being played */
  PRIMARYGOALDONE: 13,
  /** done in this game by someone else, so no reward of its own */
  COMPLETEDNOW: 14,
  /** done in an earlier game, its reward then still to collect */
  COMPLETEDBEFORE: 15,
} as const;

/** one difficulty's record: each quest's word by its key; a quest with none set isn't there */
export type QuestRecord = Record<string, number>;

/** a record for each difficulty: normal, nightmare, hell */
export type QuestRecords = [QuestRecord, QuestRecord, QuestRecord];

export const newQuestRecords = (): QuestRecords => [{}, {}, {}];

/** QUESTRECORD_GetQuestState (D2QuestRecord.cpp:7-12) */
export function questState(r: QuestRecord, key: string, flag: number): boolean {
  return (((r[key] ?? 0) >> flag) & 1) === 1;
}

/** QUESTRECORD_SetQuestState (15-20) */
export function setQuestState(r: QuestRecord, key: string, flag: number) {
  r[key] = ((r[key] ?? 0) | (1 << flag)) & 0xffff;
}

/** QUESTRECORD_ClearQuestState (23-28) */
export function clearQuestState(r: QuestRecord, key: string, flag: number) {
  const w = (r[key] ?? 0) & ~(1 << flag) & 0xffff;
  if (w) r[key] = w;
  else delete r[key];
}

/** QUESTRECORD_ResetIntermediateStateFlags (31-39): started through the quest's own steps, cleared as its reward is handed over */
export function resetIntermediateStateFlags(r: QuestRecord, key: string) {
  for (let f = QFLAG.STARTED; f <= QFLAG.CUSTOM7; f++) clearQuestState(r, key, f);
}

/**
 * A record as a save holds it, for the game about to start: D2 reads each difficulty's with
 * bResetStates (PLRSAVE2 PlrSave2.cpp:1615-1621, QUESTRECORD_CopyBufferToRecord D2QuestRecord.cpp:63-82):
 * what was reached in the last game is forgotten, and a reward left waiting is from an earlier game.
 * What isn't a word (a damaged save) is left out; quests this build doesn't know keep theirs.
 */
export function loadQuestRecord(saved: unknown): QuestRecord {
  const r: QuestRecord = {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return r;
  for (const [key, w] of Object.entries(saved)) {
    if (!Number.isInteger(w) || w <= 0 || w > 0xffff) continue;
    r[key] = w;
    clearQuestState(r, key, QFLAG.PRIMARYGOALDONE);
    clearQuestState(r, key, QFLAG.COMPLETEDNOW);
    if (questState(r, key, QFLAG.REWARDPENDING)) setQuestState(r, key, QFLAG.COMPLETEDBEFORE);
  }
  return r;
}

/**
 * The key of a QUESTSTATEFLAG number (D2Game Quests.h:17-70): Act 1's are 0 to 6, a1q0 being Warriv's
 * introduction; MonStats' quest number for a quest drop is one of these
 */
export function questKeyOf(flag: number): string | undefined {
  const acts: [first: number, act: number, n: number][] = [[0, 1, 7], [8, 2, 7], [16, 3, 7], [24, 4, 4], [34, 5, 7]];
  for (const [first, act, n] of acts) if (flag >= first && flag < first + n) return `a${act}q${flag - first}`;
  return undefined;
}

/**
 * Whether a monster with a quest drop (MonStats TCQuestId and TCQuestCP, D2xMonster.questTc) drops
 * its regular class for the hero: they have done the quest before, have its reward waiting, or
 * have its checkpoint (MONSTERMODE_DropTreasure, MonsterMode.cpp:552-559). Until then, its quest one.
 */
export function questTcDone(r: QuestRecord | undefined, tc: { quest: number; cp: number }): boolean {
  const key = questKeyOf(tc.quest);
  if (!r || !key) return false;
  return questState(r, key, QFLAG.COMPLETEDBEFORE) || questState(r, key, QFLAG.REWARDPENDING) || questState(r, key, tc.cp);
}

/** the quests whose reward is handed over or waiting: their NPCs' price multipliers apply (Items.cpp:2417-2420) */
export function rewardedQuests(r: QuestRecord): Set<string> {
  return new Set(Object.keys(r).filter((k) => questState(r, k, QFLAG.REWARDGRANTED) || questState(r, k, QFLAG.REWARDPENDING)));
}
