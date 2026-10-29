/**
 * Act 1's six quests: their keys in a hero's quest record (src/game/quests/record.ts, by Diablo
 * II's QUESTSTATEFLAG numbers: D2MOO D2Game/include/QUESTS/Quests.h:17-23), our names for them
 * (tools/d2-names/quests.json name and nameEn, by their qstsa1q1… string keys:
 * tools/test/quests.test.mjs holds the two together) and the picture the quest log shows each by.
 */

/** a quest's key: its act and number, a1q1 to a1q6 as D2 numbers them (the importer's npc.txt discounts go by the same) */
export type QuestKey = 'a1q1' | 'a1q2' | 'a1q3' | 'a1q4' | 'a1q5' | 'a1q6';

/** what a quest's icon shows (src/ui/icons.ts questIcon) */
export type QuestIcon = 'den' | 'graves' | 'hammer' | 'cain' | 'tower' | 'demon';

export interface QuestDef {
  key: QuestKey;
  /** its QUESTSTATEFLAG number: which word of the record is its */
  flag: number;
  /** its D2 string key, the key of its row in tools/d2-names/quests.json */
  str: string;
  name: string;
  nameEn: string;
  icon: QuestIcon;
}

const quest = (key: QuestKey, name: string, nameEn: string, icon: QuestIcon): QuestDef => ({ key, flag: Number(key.slice(3)), str: `qsts${key}`, name, nameEn, icon });

/**
 * In the order D2's quest log lays Act 1 out, the order a hero meets them in (the Arreat Summit's
 * Quest 1–6): the search for Cain (a1q4) and the Forgotten Tower (a1q5) come before Tools of the
 * Trade (a1q3), though D2 numbers that one earlier
 */
export const ACT1_QUESTS: readonly QuestDef[] = [
  quest('a1q1', '涤荡邪巢', 'Purge the Den of Iniquity', 'den'),
  quest('a1q2', '众姊妹之冢', 'Where the Sisters Lie', 'graves'),
  quest('a1q4', '解救喀因', "Kahin's Deliverance", 'cain'),
  quest('a1q5', '尘封之塔', 'The Long-Forgotten Spire', 'tower'),
  quest('a1q3', '匠人之器', 'Tools of the Craft', 'hammer'),
  quest('a1q6', '为姊妹雪恨', 'Vengeance for the Sisters', 'demon'),
];

export const QUEST_BY_KEY = Object.fromEntries(ACT1_QUESTS.map((q) => [q.key, q])) as Readonly<Record<QuestKey, QuestDef>>;
