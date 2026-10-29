# 台词审阅：第一幕开头

由 `node tools/dialogue-review.mjs` 从 `src/data/dialogue.ts` 生成，不要手改；改台词改那个文件，再生成这一页。

- 全部是新写的，按游戏自己的口吻，不是暗黑 2 原文，也不是它的翻译。场合照原版（D2MOO `A1Q1.cpp` 的 64、65、71、76 号台词各在什么时候说），话是我们自己的。
- 地名、人名不写死在台词里，用占位符 `{moor}` `{den}` `{camp}` `{akara}`，显示时从改名表（`tools/d2-names/areas.json`、`npcs.json`）填进去；下面是填好之后的样子。`{n}` 是数目，这里按 3 填。
- 中文是游戏里显示、将来配音念的；英文写在旁边给配音说明用。字数是中文去掉空白后的字符数，含标点，按每秒约 5 个字估算时长。
- 定稿之后再配音（每条一个文件），现在不生成音频。

## 亚喀蕾：「涤荡邪巢」（Purge the Den of Iniquity）

| 键 | 什么时候 | 中文 | English | 字数 |
| --- | --- | --- | --- | --- |
| `intro` | 第一次和亚喀蕾说话，她马上说（交出任务；原版 64 号，立刻播放） | 你来得正好，外乡人。昨夜我对着火光占卜，灰烬里浮出血沼荒原深处的一道裂口：一个洞穴，人们管它叫邪秽巢穴。邪气正从里面一缕一缕往外渗，荒原上的野兽因此发了狂，连埋下去的死人也躺不安稳。营寨里的人都得守着木栅，我一个也抽不出来。替我下去，把洞里的东西一个不留地清干净。等你回来，我教你一样新的本事。 | You come at a good hour, stranger. Last night I read the firelight, and out of the ashes rose a rift deep in Bloodmire Heath: a cave the folk here call the Den of Iniquity. A foul breath seeps out of it, thread by thread; it is what drives the beasts of the heath mad, and keeps even the buried dead from lying still. Everyone in the stockade must hold the palisade, and I cannot spare a single soul. Go down there for me and clear out everything inside, to the last. When you come back, I will teach you a new craft. | 147 |
| `remind` | 接了任务还没出营地，点「交谈」（原版 65 号） | 邪秽巢穴在血沼荒原里头。出了营门一路往荒原深处走，留心地上的洞口。去吧，别让那股气再漫出来。 | The Den of Iniquity lies out in Bloodmire Heath. Go through the gate and on into the heath, and watch the ground for its mouth. Go now, before that breath spreads any further. | 46 |
| `remindOut` | 出过营地或进过巢穴之后，点「交谈」（原版 71 号） | 我还感觉得到它，那个洞还在喘气。只要里面还剩一只邪物，它就合不上。 | I can still feel it: that cave is still breathing. While a single foul thing is left inside, it will not close. | 33 |
| `reward` | 清空巢穴后回来和亚喀蕾说话，她马上说，说完给 1 个技能点（原版 76 号，立刻播放） | 风里的腐味散了，火光里也再看不见那道裂口。你做到了我们做不到的事。来，闭上眼睛，跟着我的声音……好了。你心里又开了一扇门，往后你自会知道它通向哪里。 | The rot has gone from the wind, and the rift no longer shows in the firelight. You have done what we could not. Come, close your eyes and follow my voice… There. One more door has opened in you; in time you will learn where it leads. | 74 |

## 屏幕上的提示（不配音）

| 键 | 什么时候 | 中文 | English | 字数 |
| --- | --- | --- | --- | --- |
| `cleared` | 巢穴里最后一只怪物死的时候 | 邪秽巢穴里的邪物已被肃清 | The Den of Iniquity is cleansed of its foul things | 12 |
| `back` | 紧接着上一条 | 回流离者营寨去找亚喀蕾 | Return to Akarelle at the Rogues' Stockade | 11 |
| `few` | 巢穴里只剩 5 只或更少时，每杀一只 | 邪秽巢穴里还剩 3 只邪物 | 3 foul things remain in the Den of Iniquity | 11 |
| `got` | 领到奖励时 | 亚喀蕾传授了你一项本事：技能点 +1 | Akarelle taught you a new craft: +1 skill point | 17 |

## 亚喀蕾：闲谈（点「交谈」而她没有任务上的话要说时，轮流说）

| 键 | 什么时候 | 中文 | English | 字数 |
| --- | --- | --- | --- | --- |
| `gossip0` | 随时 | 这道木栅是拿断木和咬紧的牙关撑起来的。多撑一天，就多赢一天。 | This palisade is held up by split timber and clenched teeth. Every day it stands is a day won. | 30 |
| `gossip1` | 随时 | 受了伤就回来，别硬撑。草药我这儿有，火也从来没熄过。 | If you are hurt, come back; do not push on. I have herbs here, and this fire has never gone out. | 26 |
| `gossip2` | 「涤荡邪巢」完成之后才说 | 荒原上的风干净了些。昨夜，我总算睡了个整觉。 | The wind over the heath is cleaner now. Last night, at last, I slept until dawn. | 22 |

## 任务日志

| 键 | 什么时候 | 中文 | English | 字数 |
| --- | --- | --- | --- | --- |
| `none` | 任务还没人交给你 | 还没有人把这件事托付给你。 | No one has entrusted this to you yet. | 13 |
| `off` | 这个版本还没有的任务（另外五个） | 这一段旅程还没有开通。 | This part of the journey is not open yet. | 11 |
| `den.given` | 「涤荡邪巢」：接了任务，离开亚喀蕾之后 | 亚喀蕾在血沼荒原深处感应到一个邪秽的洞穴：邪秽巢穴。找到它。 | Akarelle has sensed a foul cave deep in Bloodmire Heath: the Den of Iniquity. Find it. | 30 |
| `den.clear` | 「涤荡邪巢」：进了巢穴 | 肃清邪秽巢穴里的所有邪物。 | Rid the Den of Iniquity of every foul thing in it. | 13 |
| `den.few` | 「涤荡邪巢」：只剩 5 只或更少 | 肃清邪秽巢穴里的所有邪物。还剩 3 只。 | Rid the Den of Iniquity of every foul thing in it. 3 remain. | 18 |
| `den.back` | 「涤荡邪巢」：清空了，回去领赏 | 邪秽巢穴已被肃清。回流离者营寨找亚喀蕾领取报酬。 | The Den of Iniquity is cleansed. Return to Akarelle at the Rogues' Stockade for your reward. | 24 |
| `den.done` | 「涤荡邪巢」：领过奖励 | 任务完成。亚喀蕾传授了你一个技能点。 | Quest complete. Akarelle taught you a skill point. | 18 |

共 556 字。
