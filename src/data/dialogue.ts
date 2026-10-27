/**
 * What the townsfolk say and what the quest log reads: our own writing, in the game's voice, never
 * Diablo II's text or a translation of it. Each line is the Chinese the game shows (and the voice
 * will speak), with its English beside it for the voice brief. A line names places and people
 * only through placeholders, filled from the rename tables as it is shown (src/game/quests/quest.ts
 * fillLine): {camp}, {moor} and {den} are areas 1, 2 and 8 (tools/d2-names/areas.json),
 * {akara} is Akara's row (npcs.json); {n} is a count. tools/d2-names/DIALOGUE-zh.md lists every
 * line for review (tools/dialogue-review.mjs writes it).
 */
import type { QuestKey } from './quests';

export interface Line {
  zh: string;
  en: string;
}

/** a townsperson's small talk, under 交谈 when no quest has them say something else; `after` a quest is done */
export interface Gossip extends Line {
  after?: QuestKey;
}

/** what each townsperson says when there's nothing about a quest to say, by their MonStats id */
export const GOSSIP: Record<string, Gossip[]> = {
  akara: [
    {
      zh: '这道木栅是拿断木和咬紧的牙关撑起来的。多撑一天，就多赢一天。',
      en: 'This palisade is held up by split timber and clenched teeth. Every day it stands is a day won.',
    },
    {
      zh: '受了伤就回来，别硬撑。草药我这儿有，火也从来没熄过。',
      en: 'If you are hurt, come back; do not push on. I have herbs here, and this fire has never gone out.',
    },
    {
      zh: '荒原上的风干净了些。昨夜，我总算睡了个整觉。',
      en: 'The wind over the heath is cleaner now. Last night, at last, I slept until dawn.',
      after: 'a1q1',
    },
  ],
};

/**
 * The Den of Evil (a1q1), by when they come (D2's own moments for it, D2MOO
 * D2Game/src/QUESTS/ACT1/A1Q1.cpp gpAct1Q1NpcMessages):
 * - intro: Akara gives the quest, the first time she is spoken to (her message 64, played at once)
 * - remind: asked again before leaving the camp (65, under 交谈)
 * - remindOut: asked again once the hero has been out, or into the den (71, under 交谈)
 * - reward: back with the den cleared, as she hands the reward over (76, played at once)
 * - cleared, back: on screen as the den's last monster dies; few: as few are left (5 or less)
 * - got: on screen as the reward is handed over
 */
export const DEN_LINES = {
  intro: {
    zh: '你来得正好，外乡人。昨夜我对着火光占卜，灰烬里浮出{moor}深处的一道裂口：一个洞穴，人们管它叫{den}。邪气正从里面一缕一缕往外渗，荒原上的野兽因此发了狂，连埋下去的死人也躺不安稳。营寨里的人都得守着木栅，我一个也抽不出来。替我下去，把洞里的东西一个不留地清干净。等你回来，我教你一样新的本事。',
    en: 'You come at a good hour, stranger. Last night I read the firelight, and out of the ashes rose a rift deep in {moor}: a cave the folk here call the {den}. A foul breath seeps out of it, thread by thread; it is what drives the beasts of the heath mad, and keeps even the buried dead from lying still. Everyone in the stockade must hold the palisade, and I cannot spare a single soul. Go down there for me and clear out everything inside, to the last. When you come back, I will teach you a new craft.',
  },
  remind: {
    zh: '{den}在{moor}里头。出了营门一路往荒原深处走，留心地上的洞口。去吧，别让那股气再漫出来。',
    en: 'The {den} lies out in {moor}. Go through the gate and on into the heath, and watch the ground for its mouth. Go now, before that breath spreads any further.',
  },
  remindOut: {
    zh: '我还感觉得到它，那个洞还在喘气。只要里面还剩一只邪物，它就合不上。',
    en: 'I can still feel it: that cave is still breathing. While a single foul thing is left inside, it will not close.',
  },
  reward: {
    zh: '风里的腐味散了，火光里也再看不见那道裂口。你做到了我们做不到的事。来，闭上眼睛，跟着我的声音……好了。你心里又开了一扇门，往后你自会知道它通向哪里。',
    en: 'The rot has gone from the wind, and the rift no longer shows in the firelight. You have done what we could not. Come, close your eyes and follow my voice… There. One more door has opened in you; in time you will learn where it leads.',
  },
  cleared: { zh: '{den}里的邪物已被肃清', en: 'The {den} is cleansed of its foul things' },
  back: { zh: '回{camp}去找{akara}', en: 'Return to {akara} at the {camp}' },
  few: { zh: '{den}里还剩 {n} 只邪物', en: '{n} foul things remain in the {den}' },
  got: { zh: '{akara}传授了你一项本事：技能点 +1', en: '{akara} taught you a new craft: +1 skill point' },
} satisfies Record<string, Line>;

/** the quest log's words for a quest no one has given yet, and one this build doesn't have */
export const LOG_LINES = {
  none: { zh: '还没有人把这件事托付给你。', en: 'No one has entrusted this to you yet.' },
  off: { zh: '这一段旅程还没有开通。', en: 'This part of the journey is not open yet.' },
} satisfies Record<string, Line>;

/**
 * The Den of Evil in the quest log, by D2's status numbers for it (A1Q1.cpp: 1 given and the camp
 * left, 2 in the den, 4 five or fewer left, 5 back to Akara, 12 and 13 done)
 */
export const DEN_LOG = {
  given: { zh: '{akara}在{moor}深处感应到一个邪秽的洞穴：{den}。找到它。', en: '{akara} has sensed a foul cave deep in {moor}: the {den}. Find it.' },
  clear: { zh: '肃清{den}里的所有邪物。', en: 'Rid the {den} of every foul thing in it.' },
  few: { zh: '肃清{den}里的所有邪物。还剩 {n} 只。', en: 'Rid the {den} of every foul thing in it. {n} remain.' },
  back: { zh: '{den}已被肃清。回{camp}找{akara}领取报酬。', en: 'The {den} is cleansed. Return to {akara} at the {camp} for your reward.' },
  done: { zh: '任务完成。{akara}传授了你一个技能点。', en: 'Quest complete. {akara} taught you a skill point.' },
} satisfies Record<string, Line>;
