/**
 * What the townsfolk say and what the quest log reads: our own writing, in the game's voice, never
 * Diablo II's text or a translation of it. Each line is the Chinese the game shows (and the voice
 * will speak), with its English beside it for the voice brief. A line names places and people
 * only through placeholders, filled from the rename tables as it is shown (src/game/quests/quest.ts
 * fillLine): {camp}, {moor}, {plains}, {den} and {graves} are areas 1, 2, 3, 8 and 17
 * (tools/d2-names/areas.json), {akara} and {kashya} are Akara's and Kashya's rows (npcs.json),
 * {raven} is Blood Raven's (monsters.json); {n} is a count, {name} a hireling's name. tools/d2-names/DIALOGUE-zh.md lists every
 * line for review (tools/dialogue-review.mjs writes it), with the recording of each line spoken:
 * the voice reads the page (tools/audio/list.mjs), and plays as the line scrolls (src/ui/npc.ts).
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
 * What a townsperson says as the hero comes to them, and as the hero leaves: spoken, never shown.
 * Diablo II gives its townsfolk greetings (sounds.txt akara_greeting_1 and _2), a short word for
 * being clicked again (akara_greeting_inactive_*), one for coming back and three for the time of
 * day, and no farewells. Here they greet the hero at a visit's first click and bid farewell as it
 * ends (the farewells are ours), each a take of voice.<npc>.greeting or .farewell (the nth line
 * take n), said one at random and never the one heard last (src/ui/npc.ts).
 */
export const GREETINGS: Record<string, { greeting: Line[]; farewell: Line[] }> = {
  akara: {
    greeting: [
      { zh: '愿火光照着你。', en: 'May the firelight fall on you.' },
      { zh: '我正等着你呢。', en: 'I was expecting you.' },
      { zh: '坐吧，歇一歇脚。', en: 'Sit, and rest your feet a while.' },
    ],
    farewell: [
      { zh: '去吧，火会一直燃着。', en: 'Go. The fire will keep burning.' },
      { zh: '愿你一路无伤。', en: 'May you walk the road unharmed.' },
      { zh: '记得活着回来。', en: 'Remember to come back alive.' },
    ],
  },
  // the scouts' captain: curt, a soldier's word for the stranger
  kashya: {
    greeting: [
      { zh: '有话就说。', en: 'If you have something to say, say it.' },
      { zh: '说吧，我在听。', en: "Go on. I'm listening." },
      { zh: '你还活着。', en: "You're still alive." },
    ],
    farewell: [
      { zh: '去吧，别死在外头。', en: "Go. Don't die out there." },
      { zh: '眼睛放亮些。', en: 'Keep your eyes sharp.' },
      { zh: '速去速回。', en: 'Go fast, and come back fast.' },
    ],
  },
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

/**
 * The Sisters' Burial Grounds (a1q2), by when they come (D2's own moments for it, D2MOO
 * D2Game/src/QUESTS/ACT1/A1Q2.cpp gpAct1Q2NpcMessages), Kashya's words, written in her voice: the
 * captain of the camp's scouts, curt, wary of the stranger, grieving the sister who turned:
 * - intro: Kashya gives the quest, once the Den of Evil is done (her message 81, played at once)
 * - remind: asked again before leaving the camp (82, under 交谈)
 * - remindOut: asked again once the hero has been out, or into the Burial Grounds (87, under 交谈)
 * - reward: back with Blood Raven dead, as she hands the reward over (92, played at once; under 交谈
 *   again in that visit)
 * - slain, back: on screen as Blood Raven dies with the hero near her; missed: as she dies with the
 *   hero too far off to have it done (D2's room rule: src/game/quests/sisters.ts nearRaven)
 * - got: on screen as the reward's hireling joins the hero; gotNone: as the reward is handed over to
 *   a hero who has one already
 * Her four spoken lines are recorded (spokenLines), as Akara's in the Den of Evil are.
 */
export const SISTERS_LINES = {
  intro: {
    zh: '你就是替{akara}清了那个洞的外乡人？好。我不信嘴上说的，只认做出来的。{raven}本是我们自己人，营里没有谁拉弓比她更稳。可她的心被什么东西攫走了，如今她守在{plains}那头的{graves}，把我们亲手埋下的姊妹一个个从土里拖出来，替她卖命。我的斥候没法朝昔日同袍的尸身放箭。你去。了结她，让那些坟重新安静下来。办成了，我的人就认你。',
    en: 'So you are the stranger who cleared that cave for {akara}? Good. I put no stock in talk, only in what gets done. {raven} was one of our own; no one in the stockade held a bow steadier. But something has seized her heart. Now she holds the {graves}, beyond the {plains}, and drags the sisters we buried with our own hands out of the earth, one by one, to fight for her. My scouts cannot loose arrows at the bodies of their old comrades. You go. Finish her, and let those graves lie quiet again. Do that, and my people will know you as one of their own.',
  },
  remind: {
    zh: '{graves}在{plains}的那一头。出了营门，穿过{moor}一直往前走。记着，别站远了跟她对射，她从不失手。贴上去打。',
    en: "The {graves} lie on the far side of the {plains}. Out through the gate, across {moor}, and keep going. And remember: don't stand off and trade shots with her. She never misses. Get in close.",
  },
  remindOut: {
    zh: '她还站着，对吧？我在木栅上都闻得见那边翻起来的土腥味。别让我等太久。',
    en: "She is still standing, isn't she? Up on the palisade I can smell the turned earth from out there. Don't keep me waiting long.",
  },
  reward: {
    zh: '探子回报，{graves}那边静下来了。……她曾是我们当中最好的一个，这一点我不会忘。你替我们做了我们下不去手的事。从今往后，我的斥候听你差遣：身边缺人手，就带一个走，这一个不收你的钱。',
    en: 'My lookouts say the {graves} have gone quiet. … She was the best of us once, and I will not forget it. You did what we could not bring ourselves to do. From now on my scouts are yours to call on: if you lack a hand at your side, take one with you, and this one costs you nothing.',
  },
  slain: { zh: '{raven}已经伏诛', en: '{raven} has fallen' },
  back: { zh: '回{camp}去找{kashya}', en: 'Return to {kashya} at the {camp}' },
  missed: { zh: '{raven}倒下时你不在她近旁，这一次不算你的', en: 'You were not near {raven} when she fell; this time it is not yours' },
  got: { zh: '{kashya}派{name}随你出征', en: '{kashya} sends {name} to march with you' },
  gotNone: { zh: '你已有佣兵，{kashya}没有另派人手；往后随时可以找她雇佣', en: 'You already have a hireling, so {kashya} sends no one; from now on you may hire from her at any time' },
} satisfies Record<string, Line>;

/**
 * The Sisters' Burial Grounds in the quest log, by D2's status numbers for it (A1Q2.cpp: 1 given,
 * 2 in the Burial Grounds, 3 back to Kashya, 12 done in this game without its reward, 13 done)
 */
export const SISTERS_LOG = {
  given: { zh: '{kashya}要你去{plains}那头的{graves}，了结堕落的{raven}。', en: '{kashya} wants you to go to the {graves}, beyond the {plains}, and put an end to the fallen {raven}.' },
  find: { zh: '在{graves}里找到{raven}，亲眼看着她倒下。', en: 'Find {raven} in the {graves} and see her fall with your own eyes.' },
  back: { zh: '{raven}已经伏诛。回{camp}找{kashya}复命。', en: '{raven} has fallen. Return to {kashya} at the {camp} to report.' },
  missed: { zh: '{raven}倒下时你不在她近旁，这一次不算你的。下一趟冒险再来。', en: 'You were not near {raven} when she fell, so this time it does not count for you. Try again on your next venture.' },
  done: { zh: '任务完成。{kashya}的斥候从此听你差遣。', en: "Quest complete. {kashya}'s scouts are yours to call on." },
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

/** a line a townsperson says aloud, as it's recorded: a take for each of its `lines` */
export interface Spoken {
  npc: string;
  /** the quest it belongs to; none for small talk and greetings */
  quest?: QuestKey;
  /** which: its key among the quest's lines (DEN_LINES.remindOut), gossip<n>, greeting or farewell */
  id: string;
  lines: Line[];
}

/** the four moments a quest-giver speaks in (DEN_LINES, SISTERS_LINES): the rest of a quest's lines are on screen */
const QUEST_SAYS = ['intro', 'remind', 'remindOut', 'reward'] as const;

/**
 * Every line the townsfolk say aloud, each recorded as voice.<npc>.<key> (src/audio/sounds.ts
 * npcLine) and spoken as it scrolls (src/ui/npc.ts): Akara's words in the Den of Evil and Kashya's
 * in the Sisters' Burial Grounds, their small talk, and their greetings and farewells, a take for
 * each way of saying them. tools/dialogue-review.mjs puts each on the review page, which the voice
 * reads (tools/audio/list.mjs, its speakers there).
 */
export function spokenLines(): Spoken[] {
  const out: Spoken[] = [
    ...QUEST_SAYS.map((id) => ({ npc: 'akara', quest: 'a1q1' as const, id, lines: [DEN_LINES[id]] })),
    ...QUEST_SAYS.map((id) => ({ npc: 'kashya', quest: 'a1q2' as const, id, lines: [SISTERS_LINES[id]] })),
  ];
  for (const [npc, lines] of Object.entries(GOSSIP)) lines.forEach((g, i) => out.push({ npc, id: `gossip${i}`, lines: [g] }));
  for (const [npc, g] of Object.entries(GREETINGS)) out.push({ npc, id: 'greeting', lines: g.greeting }, { npc, id: 'farewell', lines: g.farewell });
  return out;
}
