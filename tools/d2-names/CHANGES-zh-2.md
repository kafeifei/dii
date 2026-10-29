# 名字改动（第二轮：老玩家一眼认出）

按改写后的 `style.md`、`style-en.md`（老玩家一眼认出，官方名是锚）把各张表重审了一遍，每组一节，表里列出这一轮改了的行：官方名 → 上一版的名字 → 新名字。各行的 `note` 里也记了曾用名。

## 世界：怪物、区域、NPC、任务、佣兵、技能、底材

`monsters.json`、`areas.json`、`npcs.json`、`quests.json`、`mercenaries.json`、`skills.json`、`bases.json` 逐条对照官方名重审，改了下面 82 条，其余照旧。

- 中文：认不出的都往回拉，留住老玩家认它的那个词（沉沦、刺毛→针鬃、剃刀、狼獾、骨灰的骨……），只换一个字或一个词。怪物里「全换了只剩结构」的（钉背妖、莽悍魈、窟孽秽獒、骸烬）和「换成新意象」的（箭猪、战彘之魂、燧背灰腹、裂面魔）都改了。
- 英文：照 Blizzard 英文重审，大多是中文没问题、英文把原词全换掉了（Abyssling、Netherfiend、Festering Lair、Effaced Spire），改成留 Blizzard 的关键词、换另一个词。流亡者（Rogue）一族的英文原先跟着官方中文作 Exile，那是「流亡者」的意思，不是 Rogue，改回 Rogue（营地、佣兵、单位名、墨心放逐者）。
- 佣兵：五个中文名离官方译名太近：埃黎、恺儿、芙罗莉娅、雯蒂每个字都是官方的同音字或只差声调，念出来一样；黛安是戴安妮的同音字去掉一个字。各换了一个音；京子的 Anzu 丢了原名的音，杏子又能读成きょうこ，换成喜代美（Kiyomi）。
- CHANGES-zh.md 里在这几个文件的 5 条：狼獾之心、刺毛鼠、火焰脊刺、京子都改了（见下表）；鲜血氏族的「血角部族」（Gorehorn Tribe）留着「血」，认得出，不改。
- 没动的：`npcs.json` 和带音译的超级暗金怪、底材、地名（昂妲蕾、戴克尔·喀因、楚丝琅、何罗德门……）都照术语表，留给术语表那一组；`bases.json` 其余各条都认得出。
- 跟着要改的别处：区域、任务的英文名在 `src/world/areas.ts`、`src/world/levelgen.ts`、`src/data/quests.ts`、`tools/test/west.test.mjs` 里有手抄的一份，已同步；`DIALOGUE-zh.md` 已重新生成。别的组的表里还有两处跟着旧名走：`uniques.json` 的 Bloodraven's Charge 英文是 Scarlet Rook's Raid（血鸦现在是 Scarlet Raven），`prefixes.json` 的 Shaman's 的 note 提到「堕渊魔巫祝」（现在是沉沦鬼巫祝）；`style-en.md` 佣兵一节还拿「响子 became 杏子」举例。

| 文件 | 原版 | 官方 → 旧名 → 新名 | 新英文名 | 为什么 |
| --- | --- | --- | --- | --- |
| monsters.json | Fallen | 沉沦魔 → 堕渊魔 → 沉沦鬼 | Fallen Imp（原 Abyssling） | 留住族名词根「沉沦」/ Fallen，只换「魔」 |
| monsters.json | Fallen Shaman | 沉沦魔萨满 → 堕渊魔巫祝 → 沉沦鬼巫祝 | Fallen Augur（原 Abyssling Augur） | 随沉沦鬼 |
| monsters.json | Carver | 利刃魔 → 剔骨魔 → 剜刃魔 | Bladecarver（原 Bonepicker） | 剔骨魔丢了「利刃」，英文丢了 Carver |
| monsters.json | Carver Shaman | 利刃魔萨满 → 剔骨魔巫祝 → 剜刃魔巫祝 | Bladecarver Augur（原 Bonepicker Augur） | 随剜刃魔 |
| monsters.json | Devilkin | 小恶魔 → 魔裔 → 小恶鬼 | Devilspawn（原 Hellscion） | 魔裔认不出是小恶魔 |
| monsters.json | Devilkin Shaman | 小恶魔萨满 → 魔裔巫祝 → 小恶鬼巫祝 | Devilspawn Augur（原 Hellscion Augur） | 随小恶鬼 |
| monsters.json | Dark One | 暗魔 → 冥魔（不变） | Darkfiend（原 Netherfiend） | 英文丢了 Dark |
| monsters.json | Dark Shaman | 黑暗魔萨满 → 冥魔巫祝（不变） | Darkfiend Augur（原 Netherfiend Augur） | 随冥魔 |
| monsters.json | Dark Ranger | 黑暗游侠 → 晦影游猎者（不变） | Gloomshade Ranger（原 Gloomshade Prowler） | 英文丢了 Ranger，又像 Dark Stalker |
| monsters.json | Dark Stalker | 黑暗偷袭者 → 晦影潜踪者 → 晦影潜袭者 | Gloomshade Stalker（原 Gloomshade Lurker） | 潜踪者对不上偷袭者 |
| monsters.json | Dark Lancer | 黑暗长枪手 → 晦影戟女 → 晦影长枪手 | Gloomshade Lancer（原 Gloomshade Glaivemaiden） | 戟女认不出是长枪手 |
| monsters.json | Vile Lancer | 邪恶长枪手 → 秽血戟女 → 秽血长枪手 | Foulblood Lancer（原 Foulblood Glaivemaiden） | 同晦影长枪手 |
| monsters.json | Black Rogue | 黑化流亡者 → 墨心逆女 → 墨心放逐者 | Sootheart Rogue（原 Sootheart Apostate） | 逆女、Apostate 认不出是流亡者 / Rogue |
| monsters.json | Quill Rat | 刺毛鼠 → 箭猪 → 针鬃鼠 | Quill Vermin（原 Arrowhog） | 箭猪是新意象（规则 2 的反例） |
| monsters.json | Spike Fiend | 刺脊魔 → 钉背妖 → 刺脊妖 | Spikeridge Horror（原 Nailback Horror） | 三个字全换，只剩结构 |
| monsters.json | Thorn Beast | 棘刺兽 → 蒺藜兽 → 荆棘兽 | Thorn Gnawer（原 Caltrop Gnawer） | 蒺藜、Caltrop 离棘刺 / Thorn 远了一步 |
| monsters.json | Razor Spine | 剃刀刺魔 → 锋脊妖 → 剃刀刺妖 | Razorridge Horror（原 Bladeridge Horror） | 锋脊丢了剃刀 / Razor |
| monsters.json | Flamespike the Crawler | 火焰脊刺 → 燧背灰腹 → 烈焰脊刺 | Flamequill the Crawler（原 Flintback Ashbelly） | 燧背灰腹是新意象 |
| monsters.json | Gargantuan Beast | 巨身兽 → 巨躯魈（不变） | Gargantuan Ape（原 Colossal Ape） | 英文两个词全换 |
| monsters.json | Brute | 蛮力兽 → 莽悍魈 → 蛮力魈 | Brute Ape（原 Rampant Ape） | 三个字全换，只剩结构 |
| monsters.json | Hungry Dead | 饥饿行尸 → 饿殍游尸（不变） | Starveling Dead（原 Starveling Shambler） | 英文两个词全换 |
| monsters.json | Returned | 回魂骷髅 → 归魂骸（不变） | Returned Skeleton（原 Soulcalled Skeleton） | 英文丢了 Returned |
| monsters.json | Returned Archer | 回魂弓手 → 归魂弓卒（不变） | Returned Bowman（原 Soulcalled Bowman） | 英文丢了 Returned |
| monsters.json | Returned Mage | 回魂法师 → 归魂咒师（不变） | Returned Incanter（原 Soulcalled Incanter） | 英文丢了 Returned |
| monsters.json | Wraith | 怨魂 → 戾魄 → 怨魄 | Spitewraith（原 Spiteshade） | 两个字全换 |
| monsters.json | Misshapen | 畸形魔 → 扭躯魔 → 畸躯魔 | Misshapen Imp（原 Twistframe Imp） | 扭躯丢了畸形 / Misshapen |
| monsters.json | Disfigured | 残身魔 → 裂面魔 → 残躯魔 | Disfigured Imp（原 Splitface Imp） | 裂面是新意象 |
| monsters.json | Tainted | 污染魔 → 浊秽魔 → 污秽魔 | Tainted Imp（原 Mirefilth Imp） | 浊秽两个字都换了 |
| monsters.json | Afflicted | 受难魔 → 罹厄魔 → 罹难魔 | Afflicted Imp（原 Ill-Starred Imp） | 罹厄两个字都换了 |
| monsters.json | Foul Crow Nest | 恶臭乌鸦巢 → 腐羽鸦窠（不变） | Rotfeather Crow Roost（原 Rotfeather Roost） | 英文丢了 Crow |
| monsters.json | Foul Crow | 恶臭乌鸦 → 腐羽鸦（不变） | Rotfeather Crow（原 Rotfeather） | 英文丢了 Crow |
| monsters.json | Arach | 结网蛛 → 悬丝蛛（不变） | Silkhanger Arach（原 Silkhanger Spider） | 英文丢了 Arach |
| monsters.json | The Banished | 被放逐者 → 流谪者 → 被贬逐者 | Banished Lord（原 Wandering Exile） | 流谪者像流亡者，英文丢了 Banished |
| monsters.json | Rogue | 流亡者 → 放逐者（不变） | Rogue Sister（原 Exiled One） | 英文跟着中文走，丢了 Rogue |
| monsters.json | Gargoyle Trap | 石像鬼陷阱 → 石魔机关（不变） | Gargoyle Engine（原 Stonefiend Engine） | 英文丢了 Gargoyle |
| monsters.json | Blood Raven | 血鸦 → 绯鸦（不变） | Scarlet Raven（原 Scarlet Rook） | 英文丢了 Raven |
| monsters.json | Bone Ash | 骨灰 → 骸烬 → 骨烬 | Bonecinder（原 Cinderwight） | 两个字全换 |
| monsters.json | Bonebreaker | 碎骨者 → 碾骨魁 → 摧骨者 | Bonesmasher（原 Bonemill Chieftain） | 碾骨魁、Bonemill Chieftain 认不出 |
| monsters.json | Coldcrow | 冰冷乌鸦 → 霜鸦（不变） | Rimecrow（原 Rimewing） | 英文丢了 crow |
| monsters.json | Corpsefire | 尸体发火 → 尸焰（不变） | Corpseblaze（原 Charnelblaze） | 英文两个词全换 |
| monsters.json | Pitspawn Fouldog | 渊生邪犬 → 窟孽秽獒 → 渊生秽犬 | Pitspawn Grimehound（原 Grottobrood Grimehound） | 四个字全换，只剩结构 |
| monsters.json | The Countess | 女伯爵 → 浴血女爵（不变） | The Bloodbathed Countess（原 The Bloodbathed Baroness） | 英文把 Countess 换成了另一个爵位 |
| monsters.json | The Smith | 铁匠 → 炉匠（不变） | The Forgesmith（原 The Forgewright） | 英文丢了 Smith |
| monsters.json | Treehead WoodFist | 树头木拳 → 朽颅橡拳 → 树颅橡拳 | Treeskull Oakfist（原 Rotskull Oakfist） | 树头丢了，朽颅是新意象 |
| areas.json | Rogue Encampment | 流亡者营地 → 放逐者营寨（不变） | Rogues' Stockade（原 Exiles' Stockade） | 英文跟着中文走，丢了 Rogue |
| areas.json | Cold Plains | 冰冷之原 → 凛寒原野（不变） | Bitterfrost Plains（原 Bitterfrost Wilds） | 英文两个词全换 |
| areas.json | Stony Field | 石块旷野 → 列石荒野（不变） | Stony Wastes（原 Menhir Wastes） | 英文两个词全换 |
| areas.json | Dark Wood | 黑暗森林 → 蔽日密林 → 晦暗密林 | Dark Thicket（原 Sunshroud Thicket） | 蔽日、Sunshroud 认不出是黑暗 / Dark |
| areas.json | Den of Evil | 邪恶洞穴 → 邪秽巢穴（不变） | Den of Iniquity（原 Festering Lair） | 英文两个词全换 |
| areas.json | Pit Level 1 | 深坑一层 → 陷坑一层（不变） | Sunken Pit Level 1（原 Sunken Oubliette Level 1） | 英文丢了 Pit |
| areas.json | Pit Level 2 | 深坑二层 → 陷坑二层（不变） | Sunken Pit Level 2（原 Sunken Oubliette Level 2） | 同陷坑一层 |
| areas.json | Burial Grounds | 埋骨之地 → 葬骨荒冢（不变） | Burial Barrows（原 Bone-Strewn Barrows） | 英文两个词全换 |
| areas.json | Crypt | 墓穴 → 冥窖 → 墓窖 | Charnel Crypt（原 Nether Vault） | 冥窖两个字全换，英文丢了 Crypt |
| areas.json | Mausoleum | 寝陵 → 安魂陵（不变） | Requiem Mausoleum（原 Requiem Sepulchre） | 英文丢了 Mausoleum |
| areas.json | Forgotten Tower | 被遗忘的高塔 → 湮忘古塔（不变） | Forgotten Spire（原 Effaced Spire） | 英文两个词全换 |
| areas.json | Tower Cellar Level 1 | 高塔地窖一层 → 古塔暗窖一层（不变） | Spire Cellar Level 1（原 Spire Undercroft Level 1） | 英文两个词全换 |
| areas.json | Tower Cellar Level 2 | 高塔地窖二层 → 古塔暗窖二层（不变） | Spire Cellar Level 2（原 Spire Undercroft Level 2） | 同古塔暗窖一层 |
| areas.json | Tower Cellar Level 3 | 高塔地窖三层 → 古塔暗窖三层（不变） | Spire Cellar Level 3（原 Spire Undercroft Level 3） | 同古塔暗窖一层 |
| areas.json | Tower Cellar Level 4 | 高塔地窖四层 → 古塔暗窖四层（不变） | Spire Cellar Level 4（原 Spire Undercroft Level 4） | 同古塔暗窖一层 |
| areas.json | Tower Cellar Level 5 | 高塔地窖五层 → 古塔暗窖五层（不变） | Spire Cellar Level 5（原 Spire Undercroft Level 5） | 同古塔暗窖一层 |
| areas.json | Monastery Gate | 修道院大门 → 隐修院城门（不变） | Monastery Barbican（原 Hermitage Barbican） | 英文两个词全换 |
| areas.json | Cathedral | 大教堂 → 穹顶圣堂（不变） | Domed Cathedral（原 Domed Sanctum） | 英文丢了 Cathedral |
| areas.json | Catacombs Level 1 | 地下墓穴一层 → 万骨墓道一层（不变） | Thousand-Bone Catacombs Level 1（原 Thousand-Bone Galleries Level 1） | 英文丢了 Catacombs |
| areas.json | Catacombs Level 2 | 地下墓穴二层 → 万骨墓道二层（不变） | Thousand-Bone Catacombs Level 2（原 Thousand-Bone Galleries Level 2） | 同万骨墓道一层 |
| areas.json | Catacombs Level 3 | 地下墓穴三层 → 万骨墓道三层（不变） | Thousand-Bone Catacombs Level 3（原 Thousand-Bone Galleries Level 3） | 同万骨墓道一层 |
| areas.json | Catacombs Level 4 | 地下墓穴四层 → 万骨墓道四层（不变） | Thousand-Bone Catacombs Level 4（原 Thousand-Bone Galleries Level 4） | 同万骨墓道一层 |
| areas.json | The Secret Cow Level | 神秘的奶牛关 → 哞哞秘境（不变） | The Hidden Cow Realm（原 The Lowing Realm） | 英文丢了 Cow |
| quests.json | Den of Evil | 邪恶洞穴 → 涤荡邪巢（不变） | Purge the Den of Iniquity（原 Purge the Foul Nest） | 英文丢了 Den 和 Evil |
| quests.json | Tools of the Trade | 交易的工具 → 匠人之器（不变） | Tools of the Craft（原 The Artisan's Hammer） | 英文丢了 Tools |
| quests.json | The Forgotten Tower | 遗忘之塔 → 尘封之塔（不变） | The Long-Forgotten Spire（原 The Dust-Sealed Spire） | 英文丢了 Forgotten |
| skills.json | Oak Sage | 橡木智灵 → 古橡贤灵（不变） | Elder Oak Sage（原 Elder Oak Spirit） | 英文用了符文之语 Spirit，丢了 Sage |
| skills.json | Heart of Wolverine | 狼獾之心 → 战彘之魂 → 狼獾之魂 | Soul of the Wolverine（原 Soul of the Warboar） | 战彘之魂是新意象（规则 2 的反例） |
| skills.json | Spirit of Barbs | 棘灵 → 刺藤之魂 → 棘刺之魂 | Soul of Barbs（原 Soul of the Briar Vine） | 刺藤之魂两个字全换，又撞后缀「刺藤之」 |
| skills.json | Shadow Warrior | 影身战士 → 孪影死士 → 孪影战士 | Twinshade Warrior（原 Twinshade Deathsworn） | 死士、Deathsworn 离战士远了一步 |
| skills.json | Shadow Master | 影身大师 → 孪影宗主 → 孪影宗师 | Twinshade Master（原 Twinshade Hierarch） | 宗主、Hierarch 离大师远了一步 |
| mercenaries.json | Rogue Scout | 流亡者斥候 → 放逐者斥候（不变） | Rogue Wayfinder（原 Exile Wayfinder） | 英文跟着中文走，丢了 Rogue |
| mercenaries.json | Elly | 艾丽 → 埃黎 → 埃黎丝 | Aeliss（不变） | 埃黎和艾丽只差声调 |
| mercenaries.json | Kyoko | 京子 → 杏子 → 喜代美 | Kiyomi（原 Anzu） | Anzu 丢了 Kyoko 的音，杏子又能读成京子 |
| mercenaries.json | Kyle | 凯尔 → 恺儿 → 恺芮 | Kaerys（不变） | 恺儿和凯尔只差声调 |
| mercenaries.json | Floria | 弗萝利亚 → 芙罗莉娅 → 芙罗蕾娅 | Ferolie（不变） | 芙罗莉娅念出来就是弗萝利亚 |
| mercenaries.json | Diane | 戴安妮 → 黛安 → 黛菀 | Daevanne（不变） | 黛安只是戴安妮的同音字少一个字 |
| mercenaries.json | Wendy | 温迪 → 雯蒂 → 雯瑟 | Wenthe（不变） | 雯蒂和温迪只差声调 |
