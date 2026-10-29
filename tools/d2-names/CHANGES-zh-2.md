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

## 术语表：音译（glossary.json、glossary-en.json）

`glossary.json`、`glossary-en.json` 的 118 条音译逐条对照官方中文和 Blizzard 英文重审，改了下面 74 条（中文改了 45 条，英文改了 71 条），其余照旧。各条的 `note` 里记了曾用名和理由。

- 标准：中文对着官方中文念，英文对着 Blizzard 英文念，一听就对上原名，又不能念出来就是官方名（`style.md` 规则 1、5，`style-en.md` 规则 1、5）。
- 中文有两种毛病。一种念出来就是官方名：寰音（桓因）、该娅（盖亚）两个字都同音，只差声调。另一种挪得太远：每个音都换了，或者少了一个音（波勒迦托、楚丝琅、卓库勒、季约穆、钦弥勒……），往回拉成只改一个音，其余用同音字（翠思忒琅、铎谷勒、锦迈勒）。官方的「卡」统一写「喀」（札喀仑、亚喀蕾、喀森、喀廉、罗喀倪秀，原有的喀因、喀麟兹），卡夏写「柯霞」，免得营地里三个人都是喀字头。官方自己另起炉灶的（塔格奥、莱姗德、宋满、两个「威廉」），中文对着官方中文，英文对着 Blizzard 英文，两边不强求同音：Guillaume 和 Wilhelm 官方都叫威廉，季琏留「廉」的音、韦阑留「威」的音。
- 英文也有两种毛病。一种是我们中文的拼音，丢了原名的音（Yajalo、Jiasha、Wengde、Shiwebor、Peizhel、Lojanishiu、Zhokul……，规则 5 点名的就是这种），改回 Blizzard 的音，首音（K、R、B、V、Dr、Tr）都留住。另一种只动一两个字母，念出来就是原名（Huanyin、Yali Bhaba、Mahng Sung、Weirte、Yinifus、Lan Ersen、Chashi、Sangdar、Danghun、Yagayi），改到念出来是另一个名字。Hellforge 原来的 Nether Furnace 两个词都换了，只剩结构，改成 Netherforge，留 Forge（炉＝Forge，同「烈炉」Roaring Forge）。
- `d2-validate.mjs` 列的「术语表英文离 Blizzard 原名不超过 2 个字母」原来 21 条，现在 19 条，都看过：Aledor、Kahin、Dimorg、Diyabelo、Ba'eh、Tahmor、Mailahe 七条不改（理由写在 `glossary-en.json` 的 note 里）；另外 12 条是这次新起的（Ghiyed、Nadji、Iroth、Yagorai、Gherim、Durayel、Marlah、Tiruel、Angdarael、Aerlien、Khorast、Felovie），都多了一个音节或换了重读的元音，念出来不是原名。Iro、Naj、Grim、Mara 这种短名字，再改远就认不出了。
- `CHANGES-zh.md` 那 28 条都不在术语表里，这一组没有要回看的。
- 跟着要改的别处：各张表里还有 138 行用着旧写法（`sets.json` 59、`uniques.json` 50、`bases.json` 18、`npcs.json` 5、`monsters.json` 3、`areas.json`、`prefixes.json`、`suffixes.json` 各 1），照上表把旧的中文、英文写法换成新的就行；换完之前 `node tools/d2-validate.mjs` 的「transliterated names use the glossary」会失败（中文没变、英文变了的 50 行）。商人改名亚喀蕾以后，`tools/test/areas.test.mjs`、`tools/test/quests.test.mjs`、`tools/scenarios/quests.mjs`、`tools/bot.mjs`、`README.md` 里手抄的「亚珈萝」也要跟着改，`DIALOGUE-zh.md` 重新生成。

| 文件 | 原版 | 官方 → 旧名 → 新名 | 新英文名 | 为什么 |
| --- | --- | --- | --- | --- |
| glossary | Zakarum | 萨卡兰姆 → 札迦仑 → 札喀仑 | Zakhalun（原 Zajalun） | 迦念 jiā，丢了「卡」的 k 音，英文 Zajalun 也丢了 k（同 Yajalo）；喀＝卡的音，札喀仑读 za-ka-lun，英文留 Zak- |
| glossary | Akara | 阿卡拉 → 亚珈萝 → 亚喀蕾 | Akarelle（原 Yajalo） | Yajalo 是 style-en.md 点名的反例：罗马化的中文，丢了 Akara 的音；中文的「珈」也丢了 k；亚喀蕾读 ya-ka-lei，英文整留 Akar- |
| glossary | Charsi | 恰西 → 查茜（不变） | Charessa（原 Chashi） | 中文认得出，不改；Chashi 只动两个字母，念出来就是 Charsi（规则 1）；改为留 Char- 的三音节名 |
| glossary | Gheed | 基德 → 吉伊得（不变） | Ghiyed（原 Jiyed） | 中文认得出，不改；Jiyed 把硬音 G 念成了 J；改回 Gh-，和中文一样多一个音节（Ghee-yed），不是 Gheed 换拼写 |
| glossary | Kashya | 卡夏 → 迦霞 → 柯霞 | Khassia（原 Jiasha） | 迦念 jiā，对不上「卡」；柯霞 ke-xia，霞＝夏的音，营地里也不和「喀因」撞字头；Jiasha 丢了 K |
| glossary | Tancred | 坦克雷 → 檀格烈（不变） | Tangreth（原 Tangelier） | 中文认得出，不改；Tangelier 只剩 Tan-，读来像 tangerine；Tangreth 留 Tan-c-red 的骨架 |
| glossary | Bul-Kathos | 布尔凯索 → 波勒迦托 → 波勒铠梭 | Bol-Khatos（原 Bolegath） | 波勒迦托四个音都挪了，认不出「布尔凯索」；铠梭＝凯索的音，波勒≈布尔；Bolegath 丢了 -thos，新英文留连字符和 Kathos 的音 |
| glossary | Hwanin | 桓因 → 寰音 → 寰涅 | Hwaneth（原 Huanyin） | 寰音和桓因两字都同音（huán yīn），念出来就是官方名（规则 1），Huanyin 也就是 Hwanin；留第一个音，改第二个 |
| glossary | Guillaume | 威廉 → 季约穆 → 季琏 | Guilhem（原 Jeyomu） | 官方两人都叫「威廉」；季约穆认不出是威廉；季琏留「廉」的音，韦阑（Wilhelm）留「威」的音，一人留一半；Jeyomu 是罗马化的中文，Guilhem 是 Guillaume 的奥克语形式 |
| glossary | Wilhelm | 威廉 → 韦尔汉 → 韦阑 | Wilhan（原 Weirhan） | 韦尔汉（wei-er-han）离「威廉」远；韦阑 wei-lan，只改廉→阑；Weirhan 丢了 Wil-，Wilhan 留 Wil-h- |
| glossary | Whitstan | 威斯顿 → 惠茨丹 → 韦思丹 | Witsdane（原 Huitsdan） | 惠茨丹三个音都挪了；韦思丹只把顿换成丹；Huitsdan 是拼音，Witsdane 留 Wit-s- |
| glossary | Cathan | 卡珊 → 伽森 → 喀森 | Khathen（原 Ghasen） | 伽森的伽念 jiā，对不上「卡」；喀森 ka-sen；Ghasen 把 C 念成了 G，Khathen 留 K 和 th |
| glossary | Sander | 山德 → 桑达尔 → 善铎 | Sandreth（原 Sangdar） | 桑达尔 sang-da-er 离「山德」远（声母、韵母都挪了，还多一个音）；善铎 shan-duo；Sangdar 念出来几乎就是 Sander |
| glossary | Trang-Oul | 塔格奥 → 唐古尔 → 陀戈敖 | Thangur（不变） | 唐古尔跟的是英文，对不上官方的「塔格奥」，还像唐古拉山；陀戈敖只把塔换成陀（同「陀·剌沙」）；英文 Thangur 对 Trang-Oul 认得出，不改 |
| glossary | Civerb | 希弗伯 → 锡维勃（不变） | Siverbor（原 Shiwebor） | 中文认得出，不改；Shiwebor 是拼音（Shi-），丢了 Civ- 的音 |
| glossary | Dangoon | 覃君 → 丹衮 → 谭衮 | Tangun（原 Danghun） | 丹衮两个声母都换了（覃 t→d，君 j→g）；谭衮 tan-gun，谭＝覃的音；Danghun 念出来几乎就是 Dangoon；Tangun 是檀君（Dangun）的另一种罗马字 |
| glossary | Taebaek | 泰白 → 太魄（不变） | Taibeck（原 Taipor） | 中文认得出，不改；Taipor 丢了 -baek |
| glossary | Ondal | 温达 → 翁德（不变） | Ondamir（原 Wengde） | 中文认得出，不改；Wengde 是拼音，和 Ondal 没有一个音对得上；Ondamir 留 Onda- |
| glossary | Vidala | 维达拉 → 薇朵菈（不变） | Veydola（原 Weydola） | 中文认得出，不改；Weydola 把 V 念成了 W |
| glossary | Cleglaw | 克雷格劳 → 柯勒戈罗（不变） | Clegaro（原 Kelegaro） | 中文认得出，不改；Kelegaro 拆开了 Cleg-，新英文留 Cleg- |
| glossary | Iratha | 艾蕾萨 → 依蕊莎 → 爱蕊莎 | Eirusha（原 Yirusha） | 依蕊莎三个音都挪了；爱＝艾的音，只剩蕊莎两个音改了；Yirusha 多了 Y，Eirusha 随中文 |
| glossary | Naj | 诺吉 → 纳奇 → 纳济 | Nadji（原 Natchi） | 纳奇两个音都挪了；纳济留「吉」的音；Natchi 丢了 j，Nadji 两个音节，不是 Naj 换拼写 |
| glossary | Iro | 伊洛 → 以若（不变） | Iroth（原 Yirro） | 中文认得出，不改；Yirro 念出来就是 Iro 加个 Y；Iroth 多了 -th 的音 |
| glossary | Rixot | 瑞克撒特 → 里柯索 → 睿柯索 | Rikosso（原 Lykosso） | 里柯索把瑞换成里，认不出「瑞克撒特」；睿＝瑞的音；Lykosso 丢了 R |
| glossary | Krintiz | 克林茨 → 喀麟兹（不变） | Kharintz（原 Kalinz） | 中文认得出，不改；Kalinz 丢了 r 和 t |
| glossary | Kinemil | 金麦尔 → 钦弥勒 → 锦迈勒 | Kinmael（原 Chinmiel） | 钦弥勒三个音都挪了，还含「弥勒」（弥勒佛）；锦迈＝金麦的音，只改尔→勒；Chinmiel 丢了 K |
| glossary | Yaggai | 亚盖 → 雅嘎伊（不变） | Yagorai（原 Yagayi） | 中文认得出，不改；Yagayi 念出来几乎就是 Yaggai；Yagorai 多了 -or- |
| glossary | Tarn (Tarnhelm) | 塔恩 → 坦伦 → 坦恩 | Tharen（原 Tanlun） | 坦伦离「塔恩」远（恩→伦）；坦恩只把塔换成坦；Tanlun 丢了 r |
| glossary | Bverrit | 贝弗提 → 碑维利 → 碑孚利 | Beverith（原 Beiwelli） | 碑维利两个音挪了；孚＝弗的音，只改提→利；Beiwelli 是拼音，丢了 v |
| glossary | Cthon | 克索恩 → 刻顿 → 刻梭温 | Kesthon（原 Kedhun） | 刻顿少一个音，「索」没了；刻梭＝克索的音；Kedhun 丢了 th |
| glossary | Etlich | 艾利奇 → 厄特里 → 埃特里齐 | Etterlich（原 Etterli） | 厄特里和「艾利奇」只剩一个里；埃特里齐是艾利奇中间加一个特；英文补回 -lich |
| glossary | Mahim | 马哈姆 → 摩欣 → 玛翰穆 | Mahannim（原 Mohshin） | 摩欣认不出「马哈姆」；玛翰穆 ma-han-mu；Mohshin 丢了 Mah- |
| glossary | Manald | 马纳德 → 曼诺尔 → 玛诺铎 | Manodor（原 Mannoer） | 曼诺尔丢了德的 d；玛诺铎 ma-nuo-duo；Mannoer 也丢了 d |
| glossary | Jordan | 乔丹 → 觉旦 → 樵顿 | Jourdaine（原 Juedan） | 觉 jué 和乔 qiáo 差得远；樵顿 qiao-dun，樵＝乔的音，只改丹→顿；Juedan 是拼音，Jourdaine 是 Jordan 的法语形式加 e |
| glossary | Khalim | 卡林姆 → 哈廉 → 喀廉 | Khalyan（原 Halyan） | 哈廉丢了 k；喀＝卡的音；Halyan 丢了 Kh- |
| glossary | Baezil | 贝希尔 → 裴哲勒 → 碑夕勒 | Baeshel（原 Peizhel） | 裴哲勒三个音都挪了（b→p）；碑夕＝贝希的音，只改尔→勒；Peizhel 是拼音，也成了 P |
| glossary | Ali Baba | 阿里巴巴 → 亚利芭芭（不变） | Yalim Bhaba（原 Yali Bhaba） | 中文认得出，不改；Yali Bhaba 念出来就是 Ali Baba（只加了 Y 和不发音的 h） |
| glossary | Ginther | 金瑟 → 甘忒 → 晋忒 | Ghintor（原 Ganthe） | 甘忒两个音都挪了；晋＝金的音，只改瑟→忒；Ganthe 丢了 Gin- |
| glossary | Grim | 格里姆 → 戈临（不变） | Gherim（原 Ghelin） | 中文认得出，不改；Ghelin 丢了 r 和 m；Gherim 两个音节，不是 Grim 换拼写 |
| glossary | Duriel | 督瑞尔 → 杜里埃（不变） | Durayel（原 Dulyai） | 中文认得出，不改；Dulyai 丢了 r；Durayel 重音落在 ray 上，不是 Duriel 换拼写 |
| glossary | Skullder | 诗寇蒂 → 丝珂黛 → 施蔻黛 | Skuldra（原 Sikedai） | 丝珂黛三个音都挪了；施蔻＝诗寇的音，只改蒂→黛；Sikedai 是拼音 |
| glossary | Atma | 阿特玛 → 娅忒嫚（不变） | Atemane（原 Yatemane） | 中文认得出，不改；Yatemane 多了 Y，英文留 At- |
| glossary | Moser | 摩西尔 → 茂瑟 → 莫希勒 | Moshele（原 Mawse） | 茂瑟少一个音，两个音都挪了；莫希＝摩西的音，只改尔→勒；Mawse 丢了 -er |
| glossary | Gerke | 基尔克 → 盖柯 → 吉勒柯 | Gerrick（原 Gaikor） | 盖柯少一个音，基变成了盖；吉勒柯 ji-le-ke；Gaikor 丢了 Ger- |
| glossary | Radament | 罗达门特 → 剌丹蒙（不变） | Rhadamon（原 Ladanmon） | 中文认得出，不改；Ladanmon 把 R 也换成了 L，英文留 R |
| glossary | Arkaine | 阿凯尼 → 埃铿 → 埃铠倪 | Arkhaeni（原 Aikhen） | 埃铿少一个音；铠倪＝凯尼的音；Aikhen 丢了 r |
| glossary | Schaefer | 舍费尔 → 谢孚 → 奢斐勒 | Shaevel（原 Shiefu） | 谢孚少一个音；奢斐＝舍费的音，只改尔→勒；Shiefu 是拼音 |
| glossary | Mara | 玛拉 → 茉菈（不变） | Marlah（原 Molah） | 中文认得出，不改；Molah 丢了 Mar；Marlah 是另一个名字（Marla），不是 Mara 换拼写 |
| glossary | Lycander | 莱姗德 → 莉坎朵 → 睐珊朵 | Likando（不变） | 莉坎朵跟英文走，对不上官方的「莱姗德」；睐珊＝莱姗的音，只改德→朵；英文 Likando 对 Lycander 认得出，不改 |
| glossary | Tyrael | 泰瑞尔 → 提睿埃（不变） | Tiruel（原 Tiruai） | 中文认得出，不改；Tiruai 是拼音（rui）；Tiruel 两个元音都变了，不是 Tyrael 换拼写 |
| glossary | Mang Song | 宋满 → 芒颂 → 颂芒 | Mahng Seung（原 Mahng Sung） | 官方作「宋满」，芒颂把顺序倒了；颂芒只改满→芒；Mahng Sung 念出来就是 Mang Song |
| glossary | Kira | 奇拉 → 绮蕾（不变） | Kireth（原 Chilae） | 中文认得出，不改；Chilae 丢了 K |
| glossary | Ormus | 奥玛斯 → 欧牧司（不变） | Aurmos（原 Oumusi） | 中文认得出，不改；Oumusi 是拼音 |
| glossary | Dracul | 德古拉 → 卓库勒 → 铎谷勒 | Drokhul（原 Zhokul） | 「德古拉」是 Dracula 的通行译名，老玩家熟，卓库勒三个音都挪了；铎谷勒 duo-gu-le；Zhokul 丢了 Dr- |
| glossary | Astreon | 阿斯特隆 → 埃垂昂 → 埃思忒昂 | Aesthrion（原 Aechrion） | 埃垂昂少一个音，「斯」没了；埃思忒＝阿斯特的音，只改隆→昂；Aechrion 丢了 s |
| glossary | Arioc | 艾里欧克 → 阿瑞厄格 → 埃理鸥格 | Arriogh（原 Aruegh） | 阿瑞厄格四个音都挪了；埃理鸥＝艾里欧的音，只改克→格；Aruegh 丢了 -io- |
| glossary | Bishibosh | 毕须博须 → 必希鲍什（不变） | Bishibaushi（原 Pishibaush） | 中文认得出，不改；Pishibaush 把 B 换成了 P |
| glossary | Rakanishu | 拉卡尼休 → 罗迦倪秀 → 罗喀倪秀 | Lokhanishu（原 Lojanishiu） | 罗迦的迦念 jiā，丢了「卡」；喀＝卡的音；Lojanishiu 丢了 k |
| glossary | Andariel | 安达莉尔 → 昂妲蕾（不变） | Angdarael（原 Angdalae） | 中文认得出，不改；Angdalae 丢了 dar；Angdarael 多了 g、重音换了，不是 Andariel 换拼写 |
| glossary | Mephisto (Ars Dul'Mephistos) | 墨菲斯托 → 迷弗忒 → 迷斐思陀 | Mefistor（原 Miphoth） | 迷弗忒少一个音，「菲斯托」只剩弗忒；斐思陀＝菲斯托的音，只改墨→迷；Miphoth 丢了 -isto |
| glossary | Athena | 雅典娜 → 阿瑟妮 → 娅甸妮 | Asseni（不变） | 阿瑟妮跟英文走，丢了「雅典」的典，老玩家熟的是雅典娜；娅甸＝雅典的音，只改娜→妮；英文 Asseni 认得出，不改 |
| glossary | Gaea (Gaean) | 盖亚 → 该娅 → 噶娅 | Ghayah（原 Ghaiyah） | 该娅和盖亚两字都同音（只差声调），念出来就是官方名（规则 1）；噶娅 ga-ya；英文随中文 |
| glossary | Leviathan | 利维坦 → 勒韦屯 → 勒韦滩 | Livyatan（原 Lewetun） | 屯和坦只剩韵母相近；滩＝坦的音；Lewetun 丢了 v 和 -than，Livyatan 是 Leviathan 的希伯来文形式 |
| glossary | Titan | 泰坦 → 堤丹 → 太丹 | Taedan（原 Dydan） | 堤丹两个声母都换了（t→d）；太＝泰的音，只改坦→丹；Dydan 丢了 T |
| glossary | Tristram | 崔斯特姆 → 楚丝琅 → 翠思忒琅 | Trystrang（原 Chuslang） | 楚丝琅换了崔、丢了特，认不出「崔斯特姆」；翠思忒＝崔斯特的音，只改姆→琅；Chuslang 丢了 Tr- |
| glossary | Arreat | 亚瑞特 → 阿列忒 → 阿睿忒 | Arrieth（原 Alieth） | 阿列忒的列和瑞对不上；睿＝瑞的音；Alieth 丢了 r |
| glossary | Jared | 杰瑞德 → 贾睿铎（不变） | Jarredor（原 Jaruidor） | 中文认得出，不改；Jaruidor 是拼音（rui） |
| glossary | Aerin | 艾琳 → 埃芮恩 → 埃莲 | Aerlien（原 Airuen） | 埃芮恩多一个音，芮恩对不上琳；埃莲 ai-lian，只改琳→莲；Aerlien 三个音节，不是 Aerin 换拼写 |
| glossary | Kurast | 库拉斯特 → 柯剌斯（不变） | Khorast（原 Kolass） | 中文认得出，不改；Kolass 丢了 r；Khorast 重读的元音换了（同 Thol 对 Tal） |
| glossary | Wirt | 怀特 → 韦尔特（不变） | Weirtel（原 Weirte） | 中文认得出，不改；Weirte 念出来就是 Wirt |
| glossary | Lam Esen | 兰姆·艾森 → 岚·厄森（不变） | Lan Ershen（原 Lan Ersen） | 中文认得出，不改；Lan Ersen 念出来几乎就是 Lam Esen |
| glossary | Inifuss | 艾尼弗斯 → 伊妮孚斯（不变） | Ennifoss（原 Yinifus） | 中文认得出，不改；Yinifus 念出来就是 Inifuss |
| glossary | Hellforge / Hell Forge | 地狱熔炉 → 狱炉（不变） | Netherforge（原 Nether Furnace） | 中文认得出，不改；Nether Furnace 两个词都换了，只剩结构（规则 2）；留 Forge（炉＝Forge，同「烈炉」Roaring Forge） |
| glossary | Flavie | 弗拉维 → 菲萝薇（不变） | Felovie（原 Feilowei） | 中文认得出，不改；Feilowei 是拼音；Felovie 三个音节，不是 Flavie 换拼写 |

## 套装、符文之语（sets.json、runewords.json）

`sets.json` 175 条、`runewords.json` 99 条逐条对照官方中文和 Blizzard 英文重审。套装改了中文 143 条、英文 168 条，符文之语改了中文 80 条、英文 97 条（两版喧嚣算两条）；其余照旧。各行的 `note` 里记了曾用名。

- 中文：上一版多半是「逐字换同义词」往远处推，两个字全换（望楼、跋涉、迷障、团牌、甲仗、千锻刃、铜垣），或者换了意象（镌石之君、祖灵盟约、蛇蝎心肠、九死之志）。照新规则往回拉：留老玩家认它的那个字，只换一个字（远祖之誓、权柄、坚垒、钢锋、不朽之君、喀森的计策），或者整个留下加一两个字（太初混沌、雄狮之心、太古神话、按手圣礼）。套装部件照「X 的 Y」结构，Y 只换一个字或加一个字（不朽之君的锤锻、陀·剌沙的裁断、纳济的额环）。整套的称号统一：狂斗士、牛首王、神使、冥神（死神）、极地（北极）、炼狱（地狱）、兵主（Warlord，官方无中文）。
- 英文：照 Blizzard 英文重审。上一版英文大多是跟着中文另起的词（Eyrie、Graven Sovereign、Covenant of Forebear Shades、Mad Ravings），改成留 Blizzard 的关键词、换一个词或加一个词：Immortal Sovereign、Uncanny Enigma、Bitter Rain（style-en.md 的例子）、Seraphic Halo、Polar Gear、Heart of the Elder Oak。整套统一：Berserker（留下）、Oxhead King、Seraphic、Deathlord、Polar、Purgatorial、Hostlord。
- 官方中文另起炉灶的，中文对着官方中文、英文对着 Blizzard 英文：Magnus' Skin 官方叫「雄主的皮手套」，中文改为雄君的鲛皮手套（原来的音译「墨格努」中文老玩家对不上），英文 Morgenu 留 Magnus 的音；喧嚣（Hustle 的误译）改喧腾，两版同一个字串，同名；Mosaic 的碎彩迷离、Pattern 的典纹都一头接官方中文、一头接英文本义。
- 避开别处已有的名字：符文之语不用别的行的官方名（狂怒、暴怒、大地、光华、迷乱都是官方中文，Everlasting、Sorrow、Pestilence 单用是官方英文），也避开别的表的词：Bone 不叫枯骨（稀有名词、怪物前缀 Bone）、Exile 不叫放逐（游侠「放逐者」）、Venom 不叫毒涎（稀有名词 venom）、Steel 不用 style.md 例子里的「百炼」（前缀 Steel 的名字），Dragon 不再叫孽龙（怪物前缀 Dragon 的孽龙作 Wyrm，一个中文词只对一个英文词，改邪龙 / Baleful Dragon）。
- CHANGES-zh.md 里在这两个文件的 10 条都改回：Bulwark 铜垣 → 坚垒、Steel 千锻刃 → 钢锋、Hsarus' Iron Fist 团牌 → 铁腕，Immortal King 镌石之君 → 不朽之君，连同六个部件（见下表）。
- 术语表一组列出的 `sets.json` 59 行已照新写法换好（人名部分：波勒铠梭、寰涅、季琏、韦阑、韦思丹、喀森、善铎、陀戈敖、谭衮、爱蕊莎、纳济；英文 Tangreth、Bol-Khatos、Hwaneth、Siverbor、Ondamir、Veydola、Clegaro……），下表的新名字已含这些写法；只因术语表而变的只有 Tancred's Spine（Tangreth's Iron Backbone），不在表里。
- 没动的：陀·剌沙的殓布、何罗德门之徽，牛首王之盘角，檀格烈的铁脊，尊荣（Laurels），玄冰（Umbral Rime）。
- 跟着要改的别处：`monster-prefixes.json` SharpUM 的 note 说锋芒＝Glint「与符文之语 Blade's Glint 一致」，符文之语现在是 Glinting Edge；`suffixes.json` 几条 note 还提到旧名（铜垣、纳妲丽娅的宿怨、疾驰、疾行、海谟索的磐心、梅薇妮的慧眼）；`tools/icons/desc/sets.json`、`uniques.json` 的 note 里有几个旧英文名（Wengde's Puissance、Shalush's Roundel 等），只是记录，不进游戏。生成的 `src/data/d2x/sets.ts`、`runewords.ts`、`skills.ts`（迷狂的变身随符文之语改名迷妄 / Fevered Delirium）已重新生成。

| 文件 | 原版 | 官方 → 旧名 → 新名 | 新英文名 | 为什么 |
| --- | --- | --- | --- | --- |
| sets.json | Aldur's Watchtower | 艾尔多的警戒塔 → 阿勒铎的望楼 → 阿勒铎的瞭望塔 | Aledor's Lookout Tower（原 Aledor's Eyrie） | 警戒塔→瞭望塔，留塔；Watchtower→Lookout Tower，留 Tower |
| sets.json | Aldur's Advance | 艾尔多的成长 → 阿勒铎的跋涉 → 阿勒铎的生长 | Aledor's Progress（原 Aledor's Wayfaring） | 官方「成长」（Advance 的误译）只换一个字，留长；Advance→Progress |
| sets.json | Aldur's Deception | 艾尔多的欺骗 → 阿勒铎的迷障 → 阿勒铎的欺瞒 | Aledor's Ruse（原 Aledor's Mistveil） | 欺骗→欺瞒，留欺；Deception→Ruse |
| sets.json | Aldur's Rhythm | 艾尔多的律动 → 阿勒铎的脉搏 → 阿勒铎的节律 | Aledor's Cadence（原 Aledor's Pulse） | 律动→节律，留律；Rhythm→Cadence |
| sets.json | Aldur's Stony Gaze | 艾尔多的冷酷凝视 → 阿勒铎的石眸 → 阿勒铎的冷峻凝视 | Aledor's Stony Stare（原 Aledor's Granite Eyes） | 冷酷凝视只换一个字（酷→峻）；Gaze→Stare，留 Stony |
| sets.json | Berserker's Arsenal | 狂战士的兵械 → 狂斗士的武备 → 狂斗士的兵甲 | Berserker's Armaments（原 Frenzied Champion's Panoply） | 狂战士是通用词，全套改为狂斗士（只换一个字）；兵械→兵甲，留兵；英文全套留 Berserker，Arsenal→Armaments |
| sets.json | Berserker's Hatchet | 狂战士的手斧 → 狂斗士的劈斧（不变） | Berserker's Cleaver（原 Frenzied Champion's Cleaver） | 劈斧已留斧；英文全套留 Berserker；劈＝Cleaver，同暗金「劈霄」 |
| sets.json | Berserker's Hauberk | 狂战士的锁甲 → 狂斗士的怒铠 → 狂斗士的锁铠 | Berserker's Mail Shirt（原 Frenzied Champion's Wrathmail） | 锁甲→锁铠，留锁；Hauberk→Mail Shirt |
| sets.json | Berserker's Headgear | 狂战士的头盔 → 狂斗士的兜鍪 → 狂斗士的战盔 | Berserker's War Helm（原 Frenzied Champion's Bascinet） | 头盔→战盔，留盔；Headgear→War Helm |
| sets.json | Cow King's Leathers | 牛魔王之革 → 牛首王之裘 → 牛首王之皮革 | Oxhead King's Leathers（原 Oxhead King's Furred Robes） | 牛魔王是《西游记》人物名，全套改为牛首王（同超级暗金怪「牛首王」）；革→皮革，留革；Cow King→Oxhead King，Leathers 留下 |
| sets.json | Cow King's Hide | 牛魔王之皮 → 牛首王之兽革 → 牛首王之兽皮 | Oxhead King's Rawhide（原 Oxhead King's Tanned Jerkin） | 皮→兽皮，留皮；Hide→Rawhide |
| sets.json | Cow King's Hooves | 牛魔王之蹄 → 牛首王之重蹄（不变） | Oxhead King's Heavy Hooves（原 Oxhead King's Heavy Tread） | 重蹄已留蹄；英文随中文，Hooves 留下，加 Heavy（重） |
| sets.json | Hsarus' Defense | 萨鲁斯的防御 → 沙卢施的壁垒 → 沙卢施的防卫 | Shalush's Safeguard（原 Shalush's Redoubt） | 防御→防卫，留防；原「壁垒」是符文之语 Bulwark 的官方名；Defense→Safeguard |
| sets.json | Hsarus' Iron Fist | 萨鲁斯的铁拳 → 沙卢施的团牌 → 沙卢施的铁腕 | Shalush's Iron Hand（原 Shalush's Roundel） | 铁拳→铁腕，留铁；Fist→Hand，留 Iron；按旧规则改成的「团牌」认不出 |
| sets.json | Hsarus' Iron Heel | 萨鲁斯的铁踵 → 沙卢施的踏铁 → 沙卢施的铁足 | Shalush's Iron Tread（原 Shalush's Ironstep） | 铁踵→铁足，留铁（「铁蹄」是稀有名词 trample 的名字）；Heel→Tread，留 Iron |
| sets.json | Hsarus' Iron Stay | 萨鲁斯的铁固腰 → 沙卢施的铁箍 → 沙卢施的铁束腰 | Shalush's Iron Cinch（原 Shalush's Ironband） | 铁固腰只换一个字（固→束）；Stay→Cinch，留 Iron |
| sets.json | Isenhart's Armory | 依森哈特的武器库 → 伊申赫德的甲仗 → 伊申赫德的兵器库 | Ishenhed's Arms Vault（原 Ishenhed's Mail and Steel） | 武器库→兵器库，留器库；Armory→Arms Vault |
| sets.json | Isenhart's Case | 依森哈特的胸胄 → 伊申赫德的铁衣 → 伊申赫德的胸甲 | Ishenhed's Chest Case（原 Ishenhed's Iron Raiment） | 胸胄→胸甲，留胸；Case 留下，加 Chest（胸） |
| sets.json | Isenhart's Horns | 依森哈特的号角 → 伊申赫德的双角（不变） | Ishenhed's Twin Horns（原 Ishenhed's Twin Tines） | 双角已留角；Horns 留下，随中文加 Twin |
| sets.json | Isenhart's Lightbrand | 依森哈特的光之烙印 → 伊申赫德的辉刃 → 伊申赫德的辉光烙印 | Ishenhed's Gleaming Brand（原 Ishenhed's Burnished Blade） | 光之烙印→辉光烙印，留光、烙印；Lightbrand→Gleaming Brand，留 Brand |
| sets.json | Isenhart's Parry | 依森哈特的格挡 → 伊申赫德的拒锋 → 伊申赫德的招架 | Ishenhed's Riposte（原 Ishenhed's Bladeward） | 格挡→招架，一看就对得上的近义词；Parry→Riposte |
| sets.json | Natalya's Odium | 娜塔亚的杀意 → 纳妲丽娅的宿怨 → 纳妲丽娅的杀心 | Nadhalia's Loathing（原 Nadhalia's Abiding Grudge） | 杀意→杀心，留杀；Odium→Loathing |
| sets.json | Natalya's Mark | 娜塔亚的标记 → 纳妲丽娅的血痕 → 纳妲丽娅的暗记 | Nadhalia's Hidden Mark（原 Nadhalia's Bloodstreak） | 标记→暗记，留记；Mark 留下，加 Hidden（暗） |
| sets.json | Natalya's Shadow | 娜塔亚的阴影 → 纳妲丽娅的影衣 → 纳妲丽娅的幽影 | Nadhalia's Umbra（原 Nadhalia's Shadeweave） | 阴影→幽影，留影；Shadow→Umbra（幽影＝Umbra，同「枯骨幽影」；Shade 离 Shadow 只差两个字母） |
| sets.json | Natalya's Soul | 娜塔亚的灵魂 → 纳妲丽娅的魂踪 → 纳妲丽娅的游魂 | Nadhalia's Wandering Soul（原 Nadhalia's Spirit Trail） | 灵魂→游魂，留魂，靴子取游走之意；Soul 留下，加 Wandering（游） |
| sets.json | Natalya's Totem | 娜塔亚的徽记 → 纳妲丽娅的祖灵 → 纳妲丽娅的徽纹 | Nadhalia's Carved Totem（原 Nadhalia's Forebears） | 徽记→徽纹，留徽（「族徽」是稀有名词 emblem 的名字）；Totem 留下，加 Carved |
| sets.json | Tancred's Battlegear | 坦克雷的圣战装 → 檀格烈的戎装（不变） | Tangreth's Wargear（原 Tangelier's War Livery） | 戎装已留装；Battlegear→Wargear，留 gear |
| sets.json | Tancred's Crowbill | 坦克雷的鸦嘴锄 → 檀格烈的鸦啄 → 檀格烈的鸦嘴镐 | Tangreth's Crowbeak（原 Tangelier's Ravenpeck） | 鸦嘴锄只换一个字（锄→镐）；Crowbill→Crowbeak，留 Crow |
| sets.json | Tancred's Hobnails | 坦克雷的钉头鞋 → 檀格烈的征履 → 檀格烈的钉靴 | Tangreth's Hobnail Boots（原 Tangelier's Campaign Boots） | 钉头鞋→钉靴，留钉；Hobnails→Hobnail Boots |
| sets.json | Tancred's Skull | 坦克雷的头骨 → 檀格烈的枯颅 → 檀格烈的颅骨 | Tangreth's Skullbone（原 Tangelier's Withered Cranium） | 头骨→颅骨，留骨；Skull→Skullbone，留 Skull |
| sets.json | Tancred's Weird | 坦克雷的怪诞 → 檀格烈的诡谲 → 檀格烈的诡诞 | Tangreth's Strange Fate（原 Tangelier's Shifting Wiles） | 怪诞→诡诞，留诞；Weird（命运、怪异）→Strange Fate |
| sets.json | Angelic Raiment | 天使的装束 → 神使的法衣 → 神使的圣装 | Seraphic Raiment（原 Herald's Vestments） | 天使→神使，全套统一（只换一个字）；装束→圣装，留装；Angelic→Seraphic，全套统一，Raiment 留下 |
| sets.json | Angelic Halo | 天使的光环 → 神使的光冕（不变） | Seraphic Halo（原 Herald's Lightcrown） | 光冕已留光；Angelic→Seraphic，Halo 留下 |
| sets.json | Angelic Mantle | 天使的披风 → 神使的圣氅 → 神使的圣披风 | Seraphic Mantle（原 Herald's Hallowed Cloak） | 披风留下，加圣；Angelic→Seraphic，Mantle 留下 |
| sets.json | Angelic Sickle | 天使的镰刀 → 神使的月镰（不变） | Seraphic Sickle（原 Herald's Crescent Blade） | 月镰已留镰；Angelic→Seraphic，Sickle 留下 |
| sets.json | Angelic Wings | 天使的飞翼 → 神使的圣翎 → 神使的羽翼 | Seraphic Wings（原 Herald's Sacred Plume） | 飞翼→羽翼，留翼；Angelic→Seraphic，Wings 留下 |
| sets.json | Bul-Kathos' Children | 布尔凯索的子嗣 → 波勒迦托的血裔 → 波勒铠梭的后嗣 | Bol-Khatos' Offspring（原 Bolegath's Bloodline） | 子嗣→后嗣，留嗣；Children→Offspring |
| sets.json | Bul-Kathos' Sacred Charge | 布尔凯索的神圣职责 → 波勒迦托的圣命 → 波勒铠梭的神圣使命 | Bol-Khatos' Holy Charge（原 Bolegath's Decree of the Gods） | 神圣职责→神圣使命，留神圣；Sacred→Holy，留 Charge |
| sets.json | Bul-Kathos' Tribal Guardian | 布尔凯索的部族守护 → 波勒迦托的卫族之刃 → 波勒铠梭的部族护卫 | Bol-Khatos' Tribal Warden（原 Bolegath's Clanward Blade） | 部族守护→部族护卫，留部族、护；Guardian→Warden，留 Tribal |
| sets.json | Death's Disguise | 死神的伪装 → 冥主的假面 → 冥神的伪饰 | Deathlord's Masquerade（原 Netherlord's Mask） | 死神→冥神，全套统一（只换一个字）；伪装→伪饰，留伪；Death→Deathlord，全套统一，留 Death；Disguise→Masquerade |
| sets.json | Death's Guard | 死神之卫 → 冥主的护身索 → 冥神之护 | Deathlord's Ward（原 Netherlord's Warding Cord） | 死神之卫→冥神之护（卫→护）；Guard→Ward |
| sets.json | Death's Hand | 死神之手 → 冥主的骨掌 → 冥神之掌 | Deathlord's Palm（原 Netherlord's Bone Palm） | 死神之手→冥神之掌（手→掌）；Hand→Palm |
| sets.json | Death's Touch | 死神之触 → 冥主的轻拂 → 冥神之抚 | Deathlord's Caress（原 Netherlord's Fleeting Graze） | 死神之触→冥神之抚（触→抚）；Touch→Caress |
| sets.json | Hwanin's Majesty | 桓因的威严 → 寰音的君临 → 寰涅的威仪 | Hwaneth's Dread Majesty（原 Huanyin's Enthronement） | 威严→威仪，留威；Majesty 留下，加 Dread（威） |
| sets.json | Hwanin's Justice | 桓因的圣裁 → 寰音的天罚 → 寰涅的神裁 | Hwaneth's Divine Justice（原 Huanyin's Heavenly Wrath） | 圣裁→神裁，留裁；Justice 留下，加 Divine |
| sets.json | Hwanin's Refuge | 桓因的庇佑 → 寰音的圣所 → 寰涅的天佑 | Hwaneth's Haven（原 Huanyin's Sanctum） | 庇佑→天佑，留佑（「护佑之」是后缀）；Refuge→Haven |
| sets.json | Hwanin's Blessing | 桓因的祝福 → 寰音的恩泽 → 寰涅的祝祷 | Hwaneth's Benediction（原 Huanyin's Dew of Grace） | 祝福→祝祷，留祝；Blessing→Benediction |
| sets.json | Hwanin's Splendor | 桓因的壮美 → 寰音的荣光 → 寰涅的壮丽 | Hwaneth's Magnificence（原 Huanyin's Crown of Glory） | 壮美→壮丽，留壮，同符文之语 Splendor「壮丽」；Splendor→Magnificence |
| sets.json | M'avina's Battle Hymn | 艾维娜的战斗诗歌 → 梅薇妮的出征颂 → 梅薇妮的战斗颂歌 | Meiveni's War Hymn（原 Meiveni's Marching Paean） | 战斗诗歌只换一个字（诗→颂）；Battle→War，留 Hymn |
| sets.json | M'avina's Caster | 艾维娜的施展 → 梅薇妮的引弦 → 梅薇妮的施射 | Meiveni's Arrowcaster（原 Meiveni's Taut Bowstring） | 官方「施展」只换一个字（展→射），留施；Caster 留下，加 Arrow |
| sets.json | M'avina's Embrace | 艾维娜的拥抱 → 梅薇妮的拥卫 → 梅薇妮的怀抱 | Meiveni's Close Embrace（原 Meiveni's Encircling Guard） | 拥抱→怀抱，留抱；Embrace 留下，加 Close |
| sets.json | M'avina's Icy Clutch | 艾维娜的冰握 → 梅薇妮的霜爪 → 梅薇妮的寒握 | Meiveni's Icy Grip（原 Meiveni's Frost Talon） | 冰握→寒握，留握；Clutch→Grip，留 Icy |
| sets.json | M'avina's Tenet | 艾维娜的教义 → 梅薇妮的誓约 → 梅薇妮的教谕 | Meiveni's Doctrine（原 Meiveni's Covenant） | 教义→教谕，留教；Tenet→Doctrine |
| sets.json | M'avina's True Sight | 艾维娜的真视 → 梅薇妮的慧眼 → 梅薇妮的真眸 | Meiveni's True Gaze（原 Meiveni's Discerning Eye） | 真视→真眸，留真；Sight→Gaze，留 True |
| sets.json | Orphan's Call | 孤儿的号令 → 遗孤的号角（不变） | Orphan's Horn（原 Foundling's Horn） | 遗孤的号角已留孤、号；Orphan 留下，Call→Horn（号角） |
| sets.json | Guillaume's Face | 威廉的威容 → 季约穆的铁面 → 季琏的威颜 | Guilhem's Stern Face（原 Jeyomu's Iron Visage） | 威容→威颜，留威；Face 留下，加 Stern |
| sets.json | Magnus' Skin | 雄主的皮手套 → 墨格努的鲛皮 → 雄君的鲛皮手套 | Morgenu's Sharkhide（不变） | 官方把 Magnus 意译作「雄主」，中文老玩家认的是它：雄主→雄君，留雄；皮手套留下，加鲛（底材是鲨皮手套）；英文留 Magnus 的音，不变 |
| sets.json | Whitstan's Guard | 威斯顿之御 → 惠茨丹的戍盾 → 韦思丹之御盾 | Witsdane's Shieldguard（原 Huitsdan's Garrison Shield） | 之御留下，加盾；Guard 留下，加 Shield |
| sets.json | Wilhelm's Pride | 威廉的骄傲 → 韦尔汉的傲骨 → 韦阑的傲骨 | Wilhan's Arrogance（原 Weirhan's Unbowed Spine） | 傲骨已留傲；Pride→Arrogance |
| sets.json | The Disciple | 门徒 → 求道者 → 信徒 | The Devotee（原 The Wayseeker） | 门徒→信徒，留徒；Disciple→Devotee |
| sets.json | Credendum | 信念腰带 → 笃信之索 → 信念之索 | Credo Cord（原 Cord of Steadfast Faith） | 信念腰带→信念之索，留信念；Credendum→Credo，同词根 cred- |
| sets.json | Laying of Hands | 按手礼套 → 覆手圣礼 → 按手圣礼 | Laying of Holy Hands（原 Palm of Benediction） | 按手礼套→按手圣礼，留按手礼；Laying of Hands 留下，加 Holy |
| sets.json | Rite of Passage | 皈依之道 → 启途之仪 → 皈依之路 | Rite of Crossing（原 Sacrament of Setting Forth） | 皈依之道只换一个字（道→路）；Passage→Crossing，留 Rite of |
| sets.json | Dark Adherent | 隐秘教徒 → 暗誓者 → 幽秘教徒 | Shadow Adherent（原 Nightsworn） | 隐秘教徒只换一个字（隐→幽）；Dark→Shadow，留 Adherent |
| sets.json | Telling of Beads | 赐福念珠 → 捻珠默诵 → 祈福念珠 | Telling of Prayer Beads（原 Silent Rosary） | 赐福念珠只换一个字（赐→祈）；Telling of Beads 留下，加 Prayer |
| sets.json | Arcanna's Tricks | 阿卡娜的诡计 → 雅坎纳的幻术 → 雅坎纳的诡术 | Yakanna's Wiles（原 Yakanna's Phantasms） | 诡计→诡术，留诡；Tricks→Wiles |
| sets.json | Arcanna's Deathwand | 阿卡娜的死亡之杖 → 雅坎纳的夺魂杖 → 雅坎纳的夺命之杖 | Yakanna's Deathstaff（原 Yakanna's Soulthief Staff） | 死亡之杖→夺命之杖，留之杖；Deathwand→Deathstaff，留 Death |
| sets.json | Arcanna's Flesh | 阿卡娜的血肉 → 雅坎纳的凡躯 → 雅坎纳的肉身 | Yakanna's Mortal Flesh（原 Yakanna's Mortal Frame） | 血肉→肉身，留肉；Flesh 留下，加 Mortal |
| sets.json | Arcanna's Head | 阿卡娜的头 → 雅坎纳的首级（不变） | Yakanna's Severed Head（原 Yakanna's Severed Trophy） | 首级是斩下的头，一看就是头；Head 留下，加 Severed |
| sets.json | Arcanna's Sign | 阿卡娜的符号 → 雅坎纳的秘符（不变） | Yakanna's Secret Sign（原 Yakanna's Veiled Cipher） | 秘符已留符；Sign 留下，加 Secret（秘） |
| sets.json | Cathan's Traps | 卡珊的计谋 → 伽森的暗阱 → 喀森的计策 | Khathen's Pitfalls（原 Ghasen's Hidden Pitfalls） | 计谋→计策，留计；Traps→Pitfalls |
| sets.json | Cathan's Mesh | 卡珊的札甲 → 伽森的锁环衣 → 喀森的札铠 | Khathen's Mesh Coat（原 Ghasen's Ringwoven Coat） | 札甲→札铠，留札；Mesh 留下，加 Coat |
| sets.json | Cathan's Rule | 卡珊的统治 → 伽森的法度 → 喀森的统御 | Khathen's Reign（原 Ghasen's Lawstaff） | 统治→统御，留统；Rule→Reign |
| sets.json | Cathan's Seal | 卡珊的印章 → 伽森的封缄 → 喀森的印信 | Khathen's Signet（原 Ghasen's Unbroken Wax） | 印章→印信，留印；Seal→Signet |
| sets.json | Cathan's Sigil | 卡珊的符徽 → 伽森的纹章 → 喀森的灵符 | Khathen's Spirit Glyph（原 Ghasen's Blazon） | 符徽→灵符，留符；Sigil→Glyph（符＝Glyph，同「镌符巨匠」；灵＝Spirit） |
| sets.json | Cathan's Visage | 卡珊的面甲 → 伽森的真容 → 喀森的面具 | Khathen's Masked Visage（原 Ghasen's True Face） | 面甲→面具，留面（底材是面具）；Visage 留下，加 Masked |
| sets.json | Griswold's Legacy | 格里斯沃尔德的遗产 → 葛雷兹渥的薪传 → 葛雷兹渥的遗泽 | Gerezwor's Heritage（原 Gerezwor's Ancestral Flame） | 遗产→遗泽，留遗；Legacy→Heritage |
| sets.json | Griswold's Heart | 格里斯沃尔德的赤诚 → 葛雷兹渥的丹心（不变） | Gerezwor's Loyal Heart（原 Gerezwor's Crimson Fealty） | 丹心有心，也就是官方的赤诚；Heart 留下，加 Loyal |
| sets.json | Griswold's Honor | 格里斯沃尔德的荣耀 → 葛雷兹渥的清誉 → 葛雷兹渥的荣誉 | Gerezwor's Esteem（原 Gerezwor's Unsullied Name） | 荣耀→荣誉，留荣；Honor→Esteem |
| sets.json | Griswold's Valor | 格里斯沃尔德的勇气 → 葛雷兹渥的胆魄 → 葛雷兹渥的勇毅 | Gerezwor's Courage（原 Gerezwor's Dauntless Spirit） | 勇气→勇毅，留勇；Valor→Courage |
| sets.json | Griswold's Redemption | 格里斯沃尔德的救赎 → 葛雷兹渥的涤罪 → 葛雷兹渥的赎罪 | Gerezwor's Atonement（原 Gerezwor's Purgation） | 救赎→赎罪，留赎；Redemption→Atonement |
| sets.json | Immortal King | 不朽之王 → 镌石之君 → 不朽之君 | Immortal Sovereign（原 Graven Sovereign） | 不朽之王→不朽之君（style.md 的例子），全套统一；King→Sovereign，留 Immortal（君＝Sovereign，同「玄冰君」「雷君之魄」）；按旧规则改成的「镌石之君」认不出 |
| sets.json | Immortal King's Detail | 不朽之王的功业 → 镌石之君的勋绩 → 不朽之君的功勋 | Immortal Sovereign's Detail（原 Graven Sovereign's Deeds） | 功业→功勋，留功；King→Sovereign，Detail 留下 |
| sets.json | Immortal King's Forge | 不朽之王的锤炼 → 镌石之君的锻火 → 不朽之君的锤锻 | Immortal Sovereign's Forge（原 Graven Sovereign's Anvilfire） | 锤炼→锤锻，留锤；King→Sovereign，Forge 留下 |
| sets.json | Immortal King's Pillar | 不朽之王的基石 → 镌石之君的柱础 → 不朽之君的础石 | Immortal Sovereign's Pillar（原 Graven Sovereign's Plinth） | 基石→础石，留石；King→Sovereign，Pillar 留下 |
| sets.json | Immortal King's Soul Cage | 不朽之王的灵魂之笼 → 镌石之君的石椁 → 不朽之君的灵魂牢笼 | Immortal Sovereign's Soul Cage（原 Graven Sovereign's Sarcophagus） | 灵魂之笼→灵魂牢笼，留灵魂、笼；King→Sovereign，Soul Cage 留下 |
| sets.json | Immortal King's Stone Crusher | 不朽之王的碎石锤 → 镌石之君的裂岩槌 → 不朽之君的碎岩锤 | Immortal Sovereign's Stone Crusher（原 Graven Sovereign's Cragsplitter） | 碎石锤→碎岩锤，留碎、锤；King→Sovereign，Stone Crusher 留下 |
| sets.json | Immortal King's Will | 不朽之王的意志 → 镌石之君的遗诏 → 不朽之君的斗志 | Immortal Sovereign's Will（原 Graven Sovereign's Last Edict） | 意志→斗志，留志（意旨、遗志都只差声调）；King→Sovereign，Will 留下 |
| sets.json | Sander's Folly | 山德的愚行 → 桑达尔的痴妄 → 善铎的愚妄 | Sandreth's Foolery（原 Sangdar's Delusion） | 愚行→愚妄，留愚；Folly→Foolery |
| sets.json | Sander's Paragon | 山德的崇拜 → 桑达尔的圭臬 → 善铎的尊崇 | Sandreth's Exemplar（原 Sangdar's Touchstone） | 崇拜→尊崇，留崇；Paragon→Exemplar |
| sets.json | Sander's Riprap | 山德的石碓 → 桑达尔的垒石 → 善铎的垒石 | Sandreth's Ripstone（原 Sangdar's Drystone） | 垒石已留石；Riprap→Ripstone，留 Rip- |
| sets.json | Sander's Superstition | 山德的迷信 → 桑达尔的谶纬 → 善铎的盲信 | Sandreth's Blind Faith（原 Sangdar's Portents） | 迷信→盲信，留信；Superstition→Blind Faith |
| sets.json | Sander's Taboo | 山德的禁忌 → 桑达尔的犯讳 → 善铎的讳忌 | Sandreth's Interdict（原 Sangdar's Transgression） | 禁忌→讳忌，留忌；Taboo→Interdict |
| sets.json | Sazabi's Grand Tribute | 圣·沙略的伟大颂词 → 圣·撒札拜的无上献礼 → 圣·撒札拜的宏大颂词 | Saint Sazhabai's Great Tribute（原 Saint Sazhabai's Peerless Oblation） | 伟大颂词只换一个字（伟→宏）；Grand→Great，留 Tribute |
| sets.json | Sazabi's Cobalt Redeemer | 圣·沙略的济世之剑 → 圣·撒札拜的赎世青锋 → 圣·撒札拜的济世之锋 | Saint Sazhabai's Cobalt Savior（原 Saint Sazhabai's World-Absolving Edge） | 济世之剑→济世之锋，留济世之；Redeemer→Savior，留 Cobalt |
| sets.json | Sazabi's Ghost Liberator | 圣·沙略的魂灵解救者 → 圣·撒札拜的渡魂者 → 圣·撒札拜的魂灵解放者 | Saint Sazhabai's Spirit Liberator（原 Saint Sazhabai's Soul Ferryman） | 魂灵解救者只换一个字（救→放）；Ghost→Spirit，留 Liberator |
| sets.json | Sazabi's Mental Sheath | 圣·沙略的心灵庇护 → 圣·撒札拜的敛神之鞘 → 圣·撒札拜的心灵护鞘 | Saint Sazhabai's Mental Scabbard（原 Saint Sazhabai's Stillmind Sheath） | 心灵庇护→心灵护鞘，留心灵、护；Sheath→Scabbard，留 Mental |
| sets.json | Trang-Oul's Avatar | 塔格奥的化身 → 唐古尔的魔相 → 陀戈敖的化形 | Thangur's Incarnation（原 Thangur's Fiendform） | 化身→化形，留化；Avatar→Incarnation |
| sets.json | Trang-Oul's Claws | 塔格奥的利爪 → 唐古尔的噬骨爪 → 陀戈敖的锐爪 | Thangur's Talons（原 Thangur's Bonegnaw Talons） | 利爪→锐爪，留爪；Claws→Talons（爪＝Talon） |
| sets.json | Trang-Oul's Girth | 塔格奥的肚带 → 唐古尔的束腰 → 陀戈敖的腹带 | Thangur's Girthband（原 Thangur's Knotted Cincture） | 肚带→腹带，留带；Girth 留下，加 band（带） |
| sets.json | Trang-Oul's Guise | 塔格奥的伪装 → 唐古尔的诡容 → 陀戈敖的伪容 | Thangur's False Face（原 Thangur's False Countenance） | 伪装→伪容，留伪；Guise→False Face |
| sets.json | Trang-Oul's Scales | 塔格奥的鳞片 → 唐古尔的蟒鳞 → 陀戈敖的蛇鳞 | Thangur's Serpent Scales（原 Thangur's Serpent Mail） | 鳞片→蛇鳞，留鳞；Scales 留下，加 Serpent（蛇） |
| sets.json | Trang-Oul's Wing | 塔格奥的飞翼 → 唐古尔的残翼 → 陀戈敖的残翼 | Thangur's Tattered Wing（原 Thangur's Tattered Pennon） | 残翼已留翼；Wing 留下，加 Tattered（残） |
| sets.json | Arctic Gear | 北极装备 → 冰原行装 → 极地装备 | Polar Gear（原 Icefield Trappings） | 北极→极地，全套统一（只换一个字）；Arctic→Polar，全套统一，Gear 留下 |
| sets.json | Arctic Binding | 北极束带 → 冰原革带 → 极地革带 | Polar Binding（原 Icefield Baldric） | 束带→革带，留带；Arctic→Polar，Binding 留下 |
| sets.json | Arctic Furs | 北极毛皮 → 冰原裘衣 → 极地裘皮 | Polar Furs（原 Icefield Fur Mantle） | 毛皮→裘皮，留皮；Arctic→Polar，Furs 留下 |
| sets.json | Arctic Horn | 北极号角 → 冰原角弓 → 极地角弓 | Polar Horn（原 Icefield Hornbow） | 号角→角弓（底材是弓），留角；Arctic→Polar，Horn 留下 |
| sets.json | Arctic Mitts | 北极手套 → 冰原护掌 → 极地护手 | Polar Mitts（原 Icefield Palmguards） | 手套→护手，留手；Arctic→Polar，Mitts 留下 |
| sets.json | Civerb's Vestments | 希弗伯的法衣 → 锡维勃的祭服 → 锡维勃的祭衣 | Siverbor's Priestly Robes（原 Shiwebor's Altar Raiment） | 法衣→祭衣，留衣；Vestments→Priestly Robes |
| sets.json | Civerb's Cudgel | 希弗伯的短棍 → 锡维勃的惩戒棒 → 锡维勃的短棒 | Siverbor's Bludgeon（原 Shiwebor's Chastening Rod） | 短棍→短棒，留短；Cudgel→Bludgeon |
| sets.json | Civerb's Icon | 希弗伯的圣像 → 锡维勃的圣徽（不变） | Siverbor's Sacred Icon（原 Shiwebor's Holy Sigil） | 圣徽已留圣；Icon 留下，加 Sacred（圣） |
| sets.json | Civerb's Ward | 希弗伯的防护 → 锡维勃的圣垣 → 锡维勃的屏护 | Siverbor's Holy Ward（原 Shiwebor's Hallowed Rampart） | 防护→屏护，留护；Ward 留下，加 Holy |
| sets.json | Heaven's Brethren | 天堂同袍 → 天阙袍泽 → 天国同袍 | Heaven's Comrades（原 Comrades of the Empyrean） | 天堂同袍只换一个字（堂→国）；Brethren→Comrades，留 Heaven's |
| sets.json | Dangoon's Teaching | 覃君的教导 → 丹衮的垂训 → 谭衮的教诲 | Tangun's Instruction（原 Danghun's Precepts） | 教导→教诲，留教；Teaching→Instruction |
| sets.json | Haemosu's Adamant | 解慕苏的坚定 → 海谟索的磐心 → 海谟索的坚贞 | Haimorso's Steadfast Heart（原 Haimorso's Stoneheart） | 坚定→坚贞，留坚；Adamant→Steadfast Heart |
| sets.json | Taebaek's Glory | 泰白的荣耀 → 太魄的天辉 → 太魄的荣华 | Taibeck's Shining Glory（原 Taipor's Heavenly Radiance） | 荣耀→荣华，留荣（「光耀」给了符文之语 Radiance）；Glory 留下，加 Shining |
| sets.json | Ondal's Almighty | 温达的全灵 → 翁德的大能 → 翁德的全能 | Ondamir's Omnipotence（原 Wengde's Puissance） | 全灵→全能，留全，也正是 Almighty；Almighty→Omnipotence |
| sets.json | Infernal Tools | 地狱工具 → 炼狱法器 → 炼狱器具 | Purgatorial Tools（原 Purgatorial Instruments） | 地狱→炼狱，全套统一，留狱；工具→器具，留具；Infernal→Purgatorial（炼狱＝Purgatorial，同暗金「炼狱飞矢」），全套统一，Tools 留下 |
| sets.json | Infernal Cranium | 地狱颅骨 → 炼狱髑髅 → 炼狱颅盔 | Purgatorial Cranium（原 Purgatorial Death's-Head） | 颅骨→颅盔，留颅；Cranium 留下 |
| sets.json | Infernal Sign | 地狱印记 → 炼狱烙印 → 炼狱印痕 | Purgatorial Sign（原 Purgatorial Brand） | 印记→印痕，留印（「烙印」是符文之语 Brand 的官方名）；Sign 留下 |
| sets.json | Infernal Torch | 地狱火炬 → 炼狱燎火 → 炼狱火把 | Purgatorial Torch（原 Purgatorial Blaze） | 火炬→火把，留火；Torch 留下 |
| sets.json | Milabrega's Regalia | 米拉伯佳的王权 → 弥罗贝伽的王仪（不变） | Mirobeiga's Royal Regalia（原 Mirobeiga's Royal Pomp） | 王仪已留王；Regalia 留下，加 Royal（王） |
| sets.json | Milabrega's Diadem | 米拉伯佳的冠冕 → 弥罗贝伽的宝冠（不变） | Mirobeiga's Jeweled Diadem（原 Mirobeiga's Jeweled Crown） | 宝冠已留冠；Diadem 留下，加 Jeweled（宝） |
| sets.json | Milabrega's Orb | 米拉伯佳的宝球 → 弥罗贝伽的御珠 → 弥罗贝伽的宝珠 | Mirobeiga's Precious Orb（原 Mirobeiga's Sovereign Pearl） | 宝球→宝珠，留宝；Orb 留下，加 Precious（宝） |
| sets.json | Milabrega's Robe | 米拉伯佳的袍甲 → 弥罗贝伽的衮服 → 弥罗贝伽的袍铠 | Mirobeiga's Armored Robe（原 Mirobeiga's Coronation Mantle） | 袍甲→袍铠，留袍；Robe 留下，加 Armored |
| sets.json | Milabrega's Rod | 米拉伯佳的权杖 → 弥罗贝伽的王笏 → 弥罗贝伽的王杖 | Mirobeiga's Sceptre（不变） | 权杖→王杖，留杖；英文 Sceptre 不变 |
| sets.json | Sigon's Complete Steel | 西刚的全身甲胄 → 希贡的浑铁铠胄 → 希贡的全身铠胄 | Shigund's Full Steel（原 Shigund's Iron Panoply） | 全身甲胄只换一个字（甲→铠）；Complete→Full，留 Steel |
| sets.json | Sigon's Gage | 西刚的挑战 → 希贡的战帖（不变） | Shigund's Thrown Gage（原 Shigund's Thrown Gauntlet） | 战帖已留战；Gage 留下，加 Thrown |
| sets.json | Sigon's Guard | 西刚的守护 → 希贡的壁垒 → 希贡的守卫 | Shigund's Defender（原 Shigund's Redoubt） | 守护→守卫，留守；Guard→Defender |
| sets.json | Sigon's Sabot | 西刚的木底鞋 → 希贡的铁履 → 希贡的铁底鞋 | Shigund's Iron Sabatons（原 Shigund's Iron Sollerets） | 木底鞋只换一个字（木→铁）；Sabot→Sabatons，读音相近 |
| sets.json | Sigon's Shelter | 西刚的遮蔽 → 希贡的荫庇 → 希贡的遮护 | Shigund's Aegis（原 Shigund's Warding Shade） | 遮蔽→遮护，留遮；Shelter→Aegis |
| sets.json | Sigon's Visor | 西刚的面甲 → 希贡的覆面 → 希贡的面罩 | Shigund's Faceplate（不变） | 面甲→面罩，留面；英文 Faceplate 不变 |
| sets.json | Sigon's Wrap | 西刚的腰带 → 希贡的束甲带（不变） | Shigund's Mail Wrap（原 Shigund's Harness Girdle） | 束甲带已留带；Wrap 留下，加 Mail（甲） |
| sets.json | Vidala's Rig | 维达拉的配装 → 薇朵菈的猎装（不变） | Veydola's Hunting Rig（原 Weydola's Hunting Garb） | 猎装已留装；Rig 留下，加 Hunting（猎） |
| sets.json | Vidala's Ambush | 维达拉的突袭 → 薇朵菈的暗伏 → 薇朵菈的奇袭 | Veydola's Ambuscade（原 Weydola's Covert） | 突袭→奇袭，留袭；Ambush→Ambuscade |
| sets.json | Vidala's Barb | 维达拉的倒刺 → 薇朵菈的棘镞 → 薇朵菈的倒钩 | Veydola's Barbed Shaft（原 Weydola's Thorn Broadhead） | 倒刺→倒钩，留倒；Barb→Barbed Shaft |
| sets.json | Vidala's Fetlock | 维达拉的扣带靴 → 薇朵菈的轻蹄 → 薇朵菈的系带靴 | Veydola's Fleet Fetlock（原 Weydola's Fleet Hooves） | 扣带靴只换一个字（扣→系）；Fetlock 留下，加 Fleet |
| sets.json | Vidala's Snare | 维达拉的陷阱 → 薇朵菈的套索 → 薇朵菈的伏阱 | Veydola's Noose（原 Weydola's Noose） | 陷阱→伏阱，留阱（「陷坑」是区域名）；英文 Noose 不变 |
| sets.json | Bane's Garments | （无） → 拜因的衣冠（不变） | Baiyen's Garb（原 Baiyen's Regalia） | Garments→Garb（原 Regalia 是 Milabrega's Regalia 的原名） |
| sets.json | Bane's Authority | （无） → 拜因的印绶 → 拜因的权印 | Baiyen's Mandate（原 Baiyen's Signet Cord） | 官方无中文，照英文 Authority（权威）留权；Authority→Mandate |
| sets.json | Bane's Oathmaker | （无） → 拜因的誓锋（不变） | Baiyen's Oathblade（原 Baiyen's Sworn Edge） | 誓锋已留誓；Oathmaker→Oathblade，留 Oath |
| sets.json | Bane's Wraithskin | （无） → 拜因的魂蜕（不变） | Baiyen's Wraithhide（原 Baiyen's Soul Slough） | Wraithskin→Wraithhide，留 Wraith |
| sets.json | Cleglaw's Brace | 克雷格劳的支柱 → 柯勒戈罗的基石 → 柯勒戈罗的支撑 | Clegaro's Buttress（原 Kelegaro's Cornerstone） | 支柱→支撑，留支（原「基石」是不朽之王的基石的官方名）；Brace→Buttress |
| sets.json | Cleglaw's Claw | 克雷格劳之爪 → 柯勒戈罗的利钩 → 柯勒戈罗之铁爪 | Clegaro's Iron Claw（原 Kelegaro's Barbed Hook） | 之爪留下，加铁；Claw 留下，加 Iron（铁） |
| sets.json | Cleglaw's Pincers | 克雷格劳之钳 → 柯勒戈罗的铁螯 → 柯勒戈罗之巨钳 | Clegaro's Great Pincers（原 Kelegaro's Ironshell Grasp） | 之钳留下，加巨；Pincers 留下，加 Great（巨） |
| sets.json | Cleglaw's Tooth | 克雷格劳之牙 → 柯勒戈罗的獠齿 → 柯勒戈罗之尖牙 | Clegaro's Sharp Tooth（原 Kelegaro's Snarling Tusk） | 之牙留下，加尖；Tooth 留下，加 Sharp（尖） |
| sets.json | Horazon's Splendor | （无） → 浩瑞赞的辉华（不变） | Haurezan's Grandeur（原 Haurezan's Aureole） | Splendor→Grandeur |
| sets.json | Horazon's Countenance | （无） → 浩瑞赞的眉宇（不变） | Haurezan's Grave Countenance（原 Haurezan's Brow） | Countenance 留下，加 Grave |
| sets.json | Horazon's Dominion | （无） → 浩瑞赞的御境（不变） | Haurezan's Realm（原 Haurezan's Warded Realm） | Dominion→Realm |
| sets.json | Horazon's Hold | （无） → 浩瑞赞的执掌（不变） | Haurezan's Grip（原 Haurezan's Ruling Hand） | Hold→Grip |
| sets.json | Horazon's Legacy | （无） → 浩瑞赞的余荫（不变） | Haurezan's Bequest（原 Haurezan's Lingering Shade） | Legacy→Bequest |
| sets.json | Horazon's Secrets | （无） → 浩瑞赞的隐典（不变） | Haurezan's Secret Tome（原 Haurezan's Cloistered Tome） | Secrets→Secret Tome，随中文隐典 |
| sets.json | Iratha's Finery | 艾蕾萨的华服 → 依蕊莎的锦裳 → 爱蕊莎的华裳 | Eirusha's Fine Attire（原 Yirusha's Brocade） | 华服→华裳，留华；Finery→Fine Attire |
| sets.json | Iratha's Coil | 艾蕾萨的铁围盔 → 依蕊莎的蟠冠 → 爱蕊莎的铁环盔 | Eirusha's Iron Coil（原 Yirusha's Serpent Crown） | 铁围盔只换一个字（围→环）；Coil 留下，加 Iron（铁） |
| sets.json | Iratha's Collar | 艾蕾萨的护颈圈 → 依蕊莎的项锁 → 爱蕊莎的护颈环 | Eirusha's Neckguard（原 Yirusha's Locket） | 护颈圈只换一个字（圈→环）；Collar→Neckguard |
| sets.json | Iratha's Cord | 艾蕾萨的束带 → 依蕊莎的系绦 → 爱蕊莎的绦带 | Eirusha's Silken Cord（原 Yirusha's Silk Sash） | 束带→绦带，留带；Cord 留下，加 Silken |
| sets.json | Iratha's Cuff | 艾蕾萨的袖手套 → 依蕊莎的腕箍 → 爱蕊莎的袖甲 | Eirusha's Wristcuff（原 Yirusha's Banded Bracer） | 袖手套→袖甲，留袖；Cuff→Wristcuff，留 cuff |
| sets.json | Naj's Ancient Vestige | 诺吉的古代遗物 → 纳奇的上古遗痕 → 纳济的上古遗物 | Nadji's Ancient Relic（原 Natchi's Elder Imprint） | 古代遗物→上古遗物，留古、遗物；Vestige→Relic，留 Ancient |
| sets.json | Naj's Circlet | 诺吉的头环 → 纳奇的玄冕 → 纳济的额环 | Nadji's Brow Circlet（原 Natchi's Sable Diadem） | 头环→额环，留环；Circlet 留下，加 Brow（额） |
| sets.json | Naj's Light Plate | 诺吉的轻铠甲 → 纳奇的羽铠 → 纳济的轻板甲 | Nadji's Featherlight Plate（原 Natchi's Feather Mail） | 轻铠甲只换一个字（铠→板）；Light→Featherlight，留 Plate |
| sets.json | Naj's Puzzler | 诺吉的解密棒 → 纳奇的谜杖 → 纳济的解密杖 | Nadji's Puzzle Staff（原 Natchi's Riddle Staff） | 解密棒→解密杖，留解密；Puzzler→Puzzle Staff |
| sets.json | Tal Rasha's Adjudication | 塔·拉夏的裁决 → 陀·剌沙的审断 → 陀·剌沙的裁断 | Thol Lashar's Judgment（原 Thol Lashar's Reckoning） | 裁决→裁断，留裁；Adjudication→Judgment |
| sets.json | Tal Rasha's Fine-Spun Cloth | 塔·拉夏的精织带 → 陀·剌沙的纤缕 → 陀·剌沙的细织带 | Thol Lashar's Fine-Woven Cloth（原 Thol Lashar's Gossamer） | 精织带只换一个字（精→细）；Spun→Woven，留 Fine、Cloth |
| sets.json | Tal Rasha's Guardianship | 塔·拉夏的守护 → 陀·剌沙的屏藩 → 陀·剌沙的护持 | Thol Lashar's Wardship（原 Thol Lashar's Palisade） | 守护→护持，留护；Guardianship→Wardship |
| sets.json | Tal Rasha's Lidless Eye | 塔·拉夏的无睑之眼 → 陀·剌沙的不瞑之目 → 陀·剌沙的无睑之目 | Thol Lashar's Lidless Gaze（原 Thol Lashar's Everwatch Gaze） | 无睑之眼只换一个字（眼→目）；Eye→Gaze，留 Lidless |
| sets.json | Warlord's Glory | （无） → 兵主的威烈 → 兵主的荣光 | Hostlord's Glory（原 Hostlord's Dread Might） | Warlord 是称号，全套译作古称「兵主」（兵＝war，主＝lord）；官方无中文，Glory 照英文取荣光（同暗金「猎颅者的荣光」）；Warlord→Hostlord，全套统一，Glory 留下 |
| sets.json | Warlord's Authority | （无） → 兵主的号令 → 兵主的军令 | Hostlord's Command（原 Hostlord's Clarion） | 官方无中文，Authority 取军令（号令＝Clarion 是稀有名词 Calling 的）；Authority→Command |
| sets.json | Warlord's Conquest | （无） → 兵主的拓疆 → 兵主的征伐 | Hostlord's Subjugation（原 Hostlord's Borderbreaker） | 官方无中文，Conquest 照英文取征伐；Conquest→Subjugation |
| sets.json | Warlord's Crushers | （无） → 兵主的碾骨（不变） | Hostlord's Bonecrushers（原 Hostlord's Bonetreads） | 碾骨已是碾压；Crushers 留下，加 Bone（骨） |
| sets.json | Warlord's Lust | （无） → 兵主的血欲（不变） | Hostlord's Bloodlust（原 Hostlord's Blood Hunger） | 血欲已留欲；Lust 留下，加 Blood（血） |
| sets.json | Warlord's Mantle | （无） → 兵主的战氅（不变） | Hostlord's War Mantle（原 Hostlord's Warcloak） | 战氅；Mantle 留下，加 War（战） |
| runewords.json | Ancients' Pledge | 先祖之誓 → 祖灵盟约 → 远祖之誓 | Ancients' Vow（原 Covenant of Forebear Shades） | 先祖之誓只换一个字（先→远）；Pledge→Vow，留 Ancients'（Oath 是另一个符文之语） |
| runewords.json | Authority | 权威 → 统御 → 权柄 | High Authority（原 Reins of Command） | 权威→权柄，留权；Authority 留下，加 High |
| runewords.json | Beast | 野兽 → 兽魄 → 猛兽 | Feral Beast（原 Feral Anima） | 野兽→猛兽，留兽（「凶兽」是稀有名词 Beast）；Beast 留下，加 Feral |
| runewords.json | Black | 黑色 → 墨夜 → 漆黑 | Pitch Black（原 Inkdark Night） | 黑色→漆黑，留黑；Black 留下，加 Pitch |
| runewords.json | Bone | 白骨 → 骨冢 → 骸骨 | Charnel Bone（原 Charnel Barrow） | 白骨→骸骨，留骨（「枯骨」是稀有名词、怪物前缀 Bone）；Bone 留下，加 Charnel（骸＝Charnel） |
| runewords.json | Bramble | 荆棘 → 棘莽 → 荆丛 | Bramble Thicket（原 Snarl of Thorns） | 荆棘→荆丛，留荆；Bramble 留下，加 Thicket（丛） |
| runewords.json | Brand | 烙印 → 焚痕 → 灼印 | Scorching Brand（原 Scorchmark） | 烙印→灼印，留印；Brand 留下，加 Scorching（灼） |
| runewords.json | Breath of the Dying | 濒死之息 → 垂亡残喘 → 垂死之息 | Gasp of the Dying（原 Deathbed Gasp） | 濒死之息只换一个字（濒→垂）；Breath→Gasp，留 of the Dying |
| runewords.json | Bulwark | 壁垒 → 铜垣 → 坚垒 | Stout Bulwark（原 Brazen Rampart） | 壁垒→坚垒，留垒；Bulwark 留下，加 Stout（坚）；按旧规则改成的「铜垣」认不出 |
| runewords.json | Call to Arms | 战争召唤 → 执戈之召 → 战争号召 | Call to Battle（原 Muster of Spears） | 战争召唤→战争号召（style.md 的例子）；Arms→Battle，留 Call to |
| runewords.json | Chains of Honor | 荣耀之链 → 尊荣枷锁 → 荣耀锁链 | Fetters of Honor（原 Laurel Fetters） | 荣耀之链→荣耀锁链，留荣耀、链；Chains→Fetters，留 Honor |
| runewords.json | Chaos | 混沌 → 乱世 → 太初混沌 | Primal Chaos（原 Age of Turmoil） | 混沌整个留下，加太初；Chaos 留下，加 Primal（太初） |
| runewords.json | Coven | （无） → 夜巫秘会（不变） | Midnight Coven（原 Midnight Sabbat） | 官方无中文，夜巫秘会即 Coven；Coven 留下，加 Midnight（夜） |
| runewords.json | Crescent Moon | 新月 → 钩月（不变） | Sickle Moon（原 Moonhook） | 钩月已留月，新月如钩；Crescent→Sickle，留 Moon |
| runewords.json | Cure | 解药 → 药石 → 灵药 | Panacea（原 Balm and Lancet） | 解药→灵药，留药；Cure→Panacea |
| runewords.json | Death | 死亡 → 殒命 → 死兆 | Death Knell（原 Lastbreath） | 死亡→死兆，留死；Death 留下，加 Knell（丧钟，死兆） |
| runewords.json | Delirium | 迷狂 → 狂呓 → 迷妄 | Fevered Delirium（原 Mad Ravings） | 迷狂→迷妄，留迷，妄同谵妄（「癫狂」是前缀 Raging，「迷乱」是技能 Confuse 的官方名）；Delirium 留下，加 Fevered |
| runewords.json | Destruction | 毁灭 → 天崩 → 覆灭 | Ruination（原 Sundered Heavens） | 毁灭→覆灭，留灭；Destruction→Ruination |
| runewords.json | Doom | 厄运 → 劫数 → 厄劫 | Impending Doom（原 Fated Calamity） | 厄运→厄劫，留厄；Doom 留下，加 Impending |
| runewords.json | Dragon | 巨龙 → 孽龙 → 邪龙 | Baleful Dragon（原 Sinborn Wyrm） | 巨龙→邪龙，留龙（「孽龙」是怪物前缀 Dragon 的名字，在那里作 Wyrm，一个中文词只对一个英文词）；Dragon 留下，加 Baleful（邪） |
| runewords.json | Dream | 梦境 → 幽梦（不变） | Ghostly Dream（原 Phantom Reverie） | 幽梦已留梦；Dream 留下，加 Ghostly（幽） |
| runewords.json | Duress | 强压 → 钳制 → 威压 | Coercion（原 Iron Vise） | 强压→威压，留压；Duress→Coercion |
| runewords.json | Edge | 锐锋 → 锋芒（不变） | Glinting Edge（原 Blade's Glint） | 锋芒已留锋；Edge 留下，加 Glinting（芒） |
| runewords.json | Enigma | 谜团 → 诡谜（不变） | Uncanny Enigma（原 Uncanny Riddle） | 诡谜（style.md 的例子）；Enigma 留下，加 Uncanny（诡） |
| runewords.json | Enlightenment | 启迪 → 顿悟 → 启悟 | Illumination（原 Sudden Awakening） | 启迪→启悟，留启；Enlightenment→Illumination |
| runewords.json | Eternity | 永恒 → 亘古 → 永世 | Evermore（原 Time Immemorial） | 永恒→永世，留永；Eternity→Evermore（Everlasting 是官方的另一条英文） |
| runewords.json | Exile | 流放 → 远谪 → 流亡 | Banishment（原 Banished Afar） | 流放→流亡，留流（「放逐者」是游侠）；Exile→Banishment |
| runewords.json | Faith | 信念 → 狂信（不变） | Fervent Faith（原 Zealot's Creed） | 狂信已留信；Faith 留下，加 Fervent（狂） |
| runewords.json | Famine | 饥荒 → 饿殍 → 饥馑 | Starvation（原 The Starved Dead） | 饥荒→饥馑，留饥；Famine→Starvation |
| runewords.json | Flickering Flame | 闪烁火焰 → 明灭之焰 → 闪烁烛焰 | Guttering Flame（原 Gutterflame） | 闪烁火焰只换一个字（火→烛）；Flickering→Guttering，留 Flame |
| runewords.json | Fortitude | 刚毅 → 铁骨 → 坚毅 | Stalwart Fortitude（原 Bones of Iron） | 刚毅→坚毅，留毅；Fortitude 留下，加 Stalwart（坚） |
| runewords.json | Fury | 愤怒 → 怒潮 → 盛怒 | Towering Fury（原 Raging Tide） | 愤怒→盛怒，留怒（「狂怒」「暴怒」是官方的另几条中文）；Fury 留下，加 Towering（盛） |
| runewords.json | Gloom | 阴霾 → 晦冥 → 阴晦 | Lightless Gloom（原 Lightless Murk） | 阴霾→阴晦，留阴；Gloom 留下，加 Lightless |
| runewords.json | Grief | 悔恨 → 泣血 → 遗恨 | Lingering Sorrow（原 Weeping Blood） | 悔恨→遗恨，留恨；Grief→Lingering Sorrow（Sorrow 是官方的另一条英文） |
| runewords.json | Ground | 地面 → 厚土 → 实地 | Solid Ground（原 Deep Earth） | 地面→实地，留地（「大地」是官方的另一条中文）；Ground 留下，加 Solid（实） |
| runewords.json | Hand of Justice | 正义之手 → 秉衡之手 → 正义之掌 | Palm of Justice（原 Scale-Bearing Hand） | 正义之手只换一个字（手→掌）；Hand→Palm，留 of Justice |
| runewords.json | Harmony | 和谐 → 和鸣（不变） | Harmony of Voices（原 Answering Song） | 和鸣已留和；Harmony 留下，加 of Voices（鸣） |
| runewords.json | Heart of the Oak | 橡树之心 → 古橡心髓 → 古橡之心 | Heart of the Elder Oak（原 Elder Oak Marrow） | 橡树之心→古橡之心，留橡、之心，古橡同技能「古橡贤灵」；Heart of the Oak 留下，加 Elder（古） |
| runewords.json | Hearth | 壁炉 → 炉火（不变） | Hearthflame（原 Banked Embers） | 炉火已留炉；Hearth 留下，加 flame（火） |
| runewords.json | Holy Thunder | 圣雷 → 神霆 → 圣霆 | Sacred Thunder（原 Godsbolt） | 圣雷→圣霆，留圣；Holy→Sacred（圣＝Sacred），留 Thunder |
| runewords.json | Hustle | 喧嚣 → 疾驰 → 喧腾 | Headlong Hustle（原 Headlong Gallop） | 官方「喧嚣」是误译，但老玩家认的是它：喧嚣→喧腾，留喧，喧腾也有奔涌之意；Hustle 留下，加 Headlong；与 Runeword172 是同一个符文之语，同名 |
| runewords.json | Hustle | 喧嚣 → 疾行 → 喧腾 | Headlong Hustle（原 Swift Stride） | 官方「喧嚣」是误译，但老玩家认的是它：喧嚣→喧腾，留喧，喧腾也有奔涌之意；Hustle 留下，加 Headlong；与 Runeword171 是同一个符文之语，同名 |
| runewords.json | Infinity | 无限 → 无始无终 → 无穷 | Limitless（原 Neither Dawn nor Dusk） | 无限→无穷，留无；Infinity→Limitless（Boundless 是前缀「太虚」） |
| runewords.json | Insight | 眼光 → 洞明 → 慧眼 | Eye of Insight（原 Piercing Clarity） | 眼光→慧眼，留眼（「慧光之」是后缀）；Insight 留下，加 Eye of |
| runewords.json | King's Grace | 王恩 → 圣眷 → 君恩 | Sovereign's Grace（原 Favor of the Throne） | 王恩→君恩，留恩；King→Sovereign（君＝Sovereign），留 Grace |
| runewords.json | Kingslayer | 弑君者 → 碎冠者 → 弑王者 | Regicide（原 Crownbreaker） | 弑君者→弑王者，留弑…者；Kingslayer→Regicide |
| runewords.json | Last Wish | 临终之愿 → 弥留遗愿 → 临终遗愿 | Final Wish（原 Bequest at Death's Door） | 临终之愿→临终遗愿，留临终、愿；Last→Final，留 Wish |
| runewords.json | Lawbringer | 执法者 → 颁律者 → 执律者 | Lawkeeper（原 Herald of Edicts） | 执法者→执律者，留执…者；Lawbringer→Lawkeeper，留 Law |
| runewords.json | Leaf | 叶子 → 焚叶（不变） | Burning Leaf（原 Cinderfrond） | 焚叶已留叶；Leaf 留下，加 Burning（焚） |
| runewords.json | Lionheart | 狮心 → 雄狮之胆 → 雄狮之心 | Lionsoul（原 Lion's Gall） | 狮心整个留下，加雄、之；Lionheart→Lionsoul，留 Lion |
| runewords.json | Lore | 学识 → 秘卷 → 博识 | Deep Lore（原 Veiled Codex） | 学识→博识，留识；Lore 留下，加 Deep |
| runewords.json | Malice | 怨恨 → 蛇蝎心肠 → 积怨 | Rankling Malice（原 Heart of Scorpions） | 怨恨→积怨，留怨（「怨毒之」是后缀）；Malice 留下，加 Rankling |
| runewords.json | Melody | 旋律 → 弦歌 → 弦律 | Bowstring Melody（原 Stringsong） | 旋律→弦律，留律，弓类；Melody 留下，加 Bowstring（弦） |
| runewords.json | Memory | 回忆 → 前尘 → 追忆 | Remembrance（原 Yesteryear's Dust） | 回忆→追忆，留忆；Memory→Remembrance |
| runewords.json | Metamorphosis | 变形 → 蜕骨化形 → 蜕形 | Transformation（原 Bonemolt） | 变形→蜕形，留形；Metamorphosis→Transformation |
| runewords.json | Mist | 迷雾 → 幽岚 → 幽雾 | Ghostly Mist（原 Gloomfell Haze） | 迷雾→幽雾，留雾；Mist 留下，加 Ghostly（幽） |
| runewords.json | Mosaic | 模糊 → 碎彩迷离（不变） | Fractured Mosaic（原 Splintered Hues） | 碎彩迷离：碎彩是 Mosaic，迷离接官方「模糊」；Mosaic 留下，加 Fractured（碎） |
| runewords.json | Myth | 神话 → 太古神谭 → 太古神话 | Primeval Myth（原 Primeval Saga） | 神话整个留下，加太古；Myth 留下，加 Primeval（太古） |
| runewords.json | Nadir | 天底 → 渊底（不变） | Abyssal Nadir（原 Nethermost Deep） | 渊底已留底；Nadir 留下，加 Abyssal（渊） |
| runewords.json | Oath | 誓言 → 歃血之盟 → 誓约 | Solemn Oath（原 Bloodsealed Pact） | 誓言→誓约，留誓；Oath 留下，加 Solemn |
| runewords.json | Obedience | 顺从 → 俯首 → 服从 | Submission（原 Bowed Head） | 顺从→服从，留从；Obedience→Submission |
| runewords.json | Obsession | 执着 → 执魇 → 执念 | Fixation（原 Nightmare's Grip） | 执着→执念，留执；Obsession→Fixation |
| runewords.json | Passion | 热情 → 炽心 → 炽情 | Ardor（原 Kindled Heart） | 热情→炽情，留情；Passion→Ardor |
| runewords.json | Pattern | 典范 → 暗纹 → 典纹 | Etched Pattern（原 Dusk-Etched Tracery） | 典范→典纹，留典，纹是 Pattern 的本义；Pattern 留下，加 Etched |
| runewords.json | Peace | 平和 → 止戈 → 祥和 | Tranquility（原 Stilled Spear） | 平和→祥和，留和；Peace→Tranquility |
| runewords.json | Phoenix | 凤凰 → 烬羽涅槃 → 烬凰 | Ember Phoenix（原 Emberplume Rebirth） | 凤凰→烬凰，留凰；Phoenix 留下，加 Ember（烬） |
| runewords.json | Plague | 瘟疫 → 黑疫之潮 → 黑瘟 | Creeping Pestilence（原 Tide of Black Pestilence） | 瘟疫→黑瘟，留瘟；Plague→Creeping Pestilence（瘟＝Pestilence，同暗金「行瘟者」；Pestilence 单用是官方的另一条英文） |
| runewords.json | Pride | 骄傲 → 睥睨 → 倨傲 | Hubris（原 Gaze of Disdain） | 骄傲→倨傲，留傲；Pride→Hubris |
| runewords.json | Principle | 信条 → 守正之律 → 戒条 | Axiom（原 Canon of the Upright） | 信条→戒条，留条；Principle→Axiom |
| runewords.json | Prudence | 谨慎 → 履冰 → 审慎 | Caution（原 Thin Ice Underfoot） | 谨慎→审慎，留慎；Prudence→Caution |
| runewords.json | Radiance | 光辉 → 曜芒 → 光耀 | Brilliance（原 Daystar Gleam） | 光辉→光耀，留光（「光华」是官方的另一条中文）；Radiance→Brilliance |
| runewords.json | Rain | 暴雨 → 苦雨（不变） | Bitter Rain（原 Dolorous Deluge） | 苦雨已留雨；Rain 留下，加 Bitter（苦），style-en.md 的例子 |
| runewords.json | Rhyme | 韵律 → 长吟 → 诗韵 | Verse（原 Lingering Chant） | 韵律→诗韵，留韵；Rhyme→Verse |
| runewords.json | Rift | 裂隙 → 天裂（不变） | Skyrift（原 Skycleft） | 天裂已留裂；Rift 留下，加 Sky（天） |
| runewords.json | Ritual | （无） → 血祭（不变） | Blood Ritual（原 Blood Oblation） | 官方无中文，血祭即 Ritual；Ritual 留下，加 Blood（血） |
| runewords.json | Sanctuary | 庇护 → 圣荫 → 庇荫 | Shaded Sanctuary（原 Consecrated Shade） | 庇护→庇荫，留庇；Sanctuary 留下，加 Shaded（荫） |
| runewords.json | Silence | 沉默 → 死寂 → 沉寂 | Stillness（原 Grave Stillness） | 沉默→沉寂，留沉；Silence→Stillness |
| runewords.json | Smoke | 烟雾 → 狼烟（不变） | Wolfsmoke（原 Wolfbeacon） | 狼烟已留烟；Smoke 留下，加 Wolf（狼） |
| runewords.json | Spirit | 精神 → 神魂 → 精魂 | Living Spirit（原 Godsoul） | 精神→精魂，留精；Spirit 留下，加 Living |
| runewords.json | Splendor | 壮美 → 煌煌 → 壮丽 | Magnificence（原 Blazing Majesty） | 壮美→壮丽，留壮，同「寰音的壮丽」；Splendor→Magnificence |
| runewords.json | Stealth | 隐秘 → 匿影 → 隐匿 | Concealment（原 Concealing Shadow） | 隐秘→隐匿，留隐；Stealth→Concealment |
| runewords.json | Steel | 钢铁 → 千锻刃 → 钢锋 | Honed Steel（原 Thousand-Forged Blade） | 钢铁→钢锋，留钢（style.md 例子里的「百炼」是前缀 Steel 的名字）；Steel 留下，加 Honed（锋）；按旧规则改成的「千锻刃」认不出 |
| runewords.json | Stone | 磐石 → 苍岩 → 磐岩 | Stonecrag（原 Hoarcrag） | 磐石→磐岩，留磐；Stone 留下，加 crag（岩＝Crag） |
| runewords.json | Strength | 力量 → 扛鼎 → 巨力 | Great Might（原 Shouldered Cauldron） | 力量→巨力，留力；Strength→Great Might |
| runewords.json | Temper | 淬火 → 烈炉 → 淬炼 | Temper of the Forge（原 Roaring Forge） | 淬火→淬炼，留淬；Temper 留下，加 of the Forge（炼） |
| runewords.json | Treachery | 背叛 → 叛刃 → 背弃 | Betrayal（原 Turncoat's Blade） | 背叛→背弃，留背；Treachery→Betrayal |
| runewords.json | Unbending Will | 不屈之志 → 九死之志 → 不挠之志 | Unbending Resolve（原 Resolve of Nine Deaths） | 不屈之志只换一个字（屈→挠，不屈不挠）；Will→Resolve，留 Unbending |
| runewords.json | Venom | 毒液 → 蝮牙 → 蛇毒 | Serpent Venom（原 Adder's Fang） | 毒液→蛇毒，留毒（「毒涎」是稀有名词 venom）；Venom 留下，加 Serpent（蛇） |
| runewords.json | Vigilance | （无） → 不寐之眼（不变） | Sleepless Vigilance（原 Sleepless Eye） | 官方无中文，不寐之眼即 Vigilance；Vigilance 留下，加 Sleepless（不寐） |
| runewords.json | Voice of Reason | 理智之声 → 清明谏言 → 理性之声 | Voice of Sanity（原 Lucid Counsel） | 理智之声只换一个字（智→性）；Reason→Sanity，留 Voice of |
| runewords.json | Void | 虚空 → 冥空（不变） | Stygian Void（原 Stygian Hollow） | 冥空已留空；Void 留下，加 Stygian（冥） |
| runewords.json | Wealth | 财富 → 敛金 → 财宝 | Riches（原 Hoarded Gold） | 财富→财宝，留财；Wealth→Riches |
| runewords.json | White | 白色 → 缟素 → 素白 | Pure White（原 Pale Mourning Shroud） | 白色→素白，留白；White 留下，加 Pure（素） |
| runewords.json | Wind | 疾风 → 卷地风 → 劲风 | Strong Gale（原 Scouring Squall） | 疾风→劲风，留风；Wind→Strong Gale（风＝Gale） |
| runewords.json | Wisdom | 智慧 → 明哲 → 睿智 | Sagacity（原 Sage's Discernment） | 智慧→睿智，留智，同暗金「奎赫根的睿智」；Wisdom→Sagacity |
| runewords.json | Wrath | 怒火 → 赫怒 → 怒焰 | Wrathflame（原 Kingly Ire） | 怒火→怒焰，留怒；Wrath 留下，加 flame（焰） |
| runewords.json | Zephyr | 和风 → 轻飏 → 惠风 | Kindly Zephyr（原 Featherdrift） | 和风→惠风，留风（惠风和畅）；Zephyr 留下，加 Kindly（惠） |

## 暗金：uniques.json

`uniques.json` 的 403 条逐条对照官方中文和 Blizzard 英文重审，改了下面 375 条（中文 340 条、英文 371 条；术士版 6 个 PreCrafted 分解护符随同名的那条一起改，不另列），其余 22 条照旧。

- 中文：旧表大多是把官方名每个字都换成近义字，只剩结构（冷辉之镰、骸锋、魔渊之疠、雷暴之瞳、寒铁之瞳），或者换成新意象、要绕一道典故（窃光罗网、缚咒斧、金铁交鸣、镔铁长策、逆鳞），老玩家对不上号。这一轮都往回拉：留住老玩家认它的词（风之力的「风」「力」，死亡黑桃的「黑桃」，巨无霸的「巨无」），只换一个字，或者整个留下、加一两个字（长风之力、死寂黑桃、巨无匹、碎骨锤、陨铁石）。换的字都查过不是同音字、只差声调的字或形近字（嗥/号、叱/斥、槌/锤、殛/击、炎/焰、嗥/嚎这几处因此另换了字）。
- 英文：照 Blizzard 英文重审，大多是英文把原词全换掉了（Galechaser's Wrath、Gravedelver、Ossuary Edge、Avalanche Bombard），改成留 Blizzard 的关键词、换另一个词（Windmight、Deathdigger、Edgebone、Buriza-Do Daikyanon）；外语名留外语的那个词（Peur Vomir、Todesfaelle Feuer、Pierre Tombale Gisant、Hone Kudaki、Kuko Shakuen、Langer Brecher、Alma Oscura）。避开了：别的行 Blizzard 名字里的关键词（Lament、Fortune、Ire、Refuge、Gaze、Pupil 不拿到别的行去用）、符文之语的名字（Faith、Splendor、Radiance、Strength、Fury、Gloom）、只有词典才认的词（Seamew、Welkin、Skerry、Aspergill、Currier、Demesne、Ferule、Ululation）、别的作品和品牌（Earthshaker 是 DotA 英雄，Moonfall、Nosferatu 是电影，Hellmouth 是《吸血鬼猎人巴菲》，Netherrack 是《我的世界》，Lightsaber，DC 的 Nightwing，漫威的 Annihilus、Iron Fist），以及离原名只差两个字母以内的拼法（Iceglint、Burstbark、Steelclang、Shade Dancer 都另换了词）。
- 「地狱」作「冥狱」/ Nether：冥狱瘟疫 Netherplague、冥狱飞啸 Netherclap、冥狱之口 Nethermouth、冥狱屠戮者 Netherslayer、冥狱火炬 Netherfire Torch，同术语表的狱炉 Netherforge；地狱阔步作焚狱阔步 / Infernotread，地狱刑器作炼狱刑器 / Purgatory Rack。血鸦照怪物表作绯鸦 / Scarlet Raven（绯鸦之爪、绯鸦的冲锋、绯月）。
- 术语表：50 行照新的术语表换了音译，其中 35 行只换音译（各行的 note 里原来写的译名也跟着换了），另 15 行本来就改了名，note 里一并记了。Grim 在术语表里是人名（戈临 / Gherim），The Grim Reaper 的英文不能留 Grim，作 The Grisly Reaper。
- `CHANGES-zh.md` 里在这张表的 7 条都按官方名重新起了：忏罪之槌 → 苦痛刑槌，背信残锋 → 血盟残锋，缚咒斧 → 秘咒之钢，窃光罗网 → 幽影陷阱，金铁交鸣 → 鸣钢，铁鳌之壳 → 钢铁鳌壳，冻原之创 → 寒冰裂缝。Steelclash、Steel Carapace 两条原来为了英文 Iron 不和「钢」撞词，把钢换成了金铁、铁；Steel 是这两行该留的词（Steelclamor、Steel Shell），钢也就留下。
- 没动的：雪崩巨炮是 `style.md` 的例子，中文不改，英文照 `style-en.md` 改成留 Buriza 和 Kyanon 的音；带人名的大多照套装件「人名的物件」，人名用术语表的音译，物件是同一样东西（葛雷兹渥之刃、樵顿灵石、喀麟兹的铁钎），认得出，不改；任务物品 Horadric Staff、Hell Forge Hammer、Khalim's Flail / Will 只换了术语表的音译，因为 `bases.json` 的 hst、hfh、qf1、qf2 要和它们同名。
- 跟着要改的别处：`bases.json` 的 hfh、qf1、qf2 要随术语表写成 Sledge of the Netherforge、喀廉的链锤 / Khalyan's Chain Mace、喀廉的遗志 / Khalyan's Testament（世界那一组的表）；`tools/icons/desc/uniques.json` 的 note 里还写着旧英文名（for Fleshgnawer …），只是画图的说明，不进游戏。别的表的 note 里还有十几处提到暗金的旧名（`prefixes.json` 的浴血骁骑、寒铁之瞳，`suffixes.json` 的雷君之魄、苍狼长嗥，`sets.json` 的玄冰君、炼狱飞矢、猎颅者的荣光，`bases.json` msf、vip 的先王权杖、蝰蛇项坠，`rare-*.json`、`monster-*.json` 的獠牙阵、千钧裂颅、腥血铲、冥蛛罗网……），只是说明当初避开了谁，新名已不再撞，可以顺手改；`style-en.md` 规则 6 举的「Mantle of the Stone Ram」现在是 Stonefleece，那句只讲字数，不影响规则。`src/data/d2x/uniques.ts` 已重新生成。

| 文件 | 原版 | 官方 → 旧名 → 新名 | 新英文名 | 为什么 |
| --- | --- | --- | --- | --- |
| uniques.json | The Gnasher | 血肉撕咬 → 啮肉者 → 血肉啃咬 | Gnashmaw（原 Fleshgnawer） | 啮肉者丢了「撕咬」，英文丢了 Gnash；留「血肉」「咬」，撕换啃 |
| uniques.json | Deathspade | 死亡黑桃 → 掘墓锹 → 死寂黑桃 | Deathdigger（原 Gravedelver） | 掘墓锹、Gravedelver 认不出；留「死」和老玩家记得的「黑桃」，亡换寂；英文留 Death |
| uniques.json | Bladebone | 刃骨 → 骸锋 → 锋骨 | Edgebone（原 Ossuary Edge） | 骸锋两个字全换了；留「骨」，刃换锋；英文留 bone |
| uniques.json | Skull Splitter | 凿颅者 → 碎颅镐 → 凿颅镐 | Skullchisel（原 Headshatter Pick） | 碎颅镐把「凿」也换了；留「凿颅」，者换镐（底材军镐）；英文留 Skull，凿＝chisel |
| uniques.json | Rakescar | 钯肉斧 → 刮骨痕 → 钯痕斧 | Rakegash（原 Bonerasp Scar） | 刮骨痕三个字全换了；留「钯」「斧」，肉换痕（scar）；英文留 Rake |
| uniques.json | Goreshovel | 铲肉斧 → 腥血铲 → 铲血斧 | Bloodshovel（原 Bloodreek Spade） | 腥血铲丢了「斧」，英文 Bloodreek Spade 两个词全换；留「铲」「斧」，肉换血；英文留 shovel |
| uniques.json | The Chieftain | 酋长 → 蛮酋（不变） | Savage Chieftain（原 Savage Thane） | 英文 Savage Thane 丢了 Chieftain；留下，加 Savage（同中文蛮酋） |
| uniques.json | Brainhew | 劈颅者 → 斫脑者 → 劈脑者 | Braincleave（原 Sunderer of Minds） | 斫脑者两个实字全换了；留「劈」，颅换脑；英文留 Brain |
| uniques.json | Humongous | 巨无霸 → 庞然巨物 → 巨无匹 | Humongous Hewer（原 Hulking Behemoth） | 庞然巨物认不出巨无霸；留「巨无」，霸换匹；英文留 Humongous，加 Hewer（斧） |
| uniques.json | Torch of Iro | 伊洛的火炬 → 以若之炬（不变） | Iroth's Brand（原 Yirro's Brand） | 音译随术语表（Yirro→Iroth） |
| uniques.json | Maelstrom | 漩涡之力 → 狂涡之怒 → 漩涡之怒 | Maelstrom's Wrath（原 Fury of the Vortex） | 狂涡之怒连「漩」也换了，英文丢了 Maelstrom；留「漩涡」，力换怒 |
| uniques.json | Gravenspine | 脊骨雕塑 → 刻符骸脊 → 脊骨雕刻 | Graven Backbone（原 Runescored Backbone） | 刻符骸脊只剩一个脊；留「脊骨雕」，塑换刻；英文留 Graven |
| uniques.json | Ume's Lament | 婴灵的哀歌 → 婴魂悲咏 → 婴灵悲歌 | Lament of the Unborn（原 Dirge of the Unborn） | 婴魂悲咏两个词都换了；留「婴灵」，哀换悲；英文留 Lament，Ume 照官方意译作 Unborn |
| uniques.json | Felloak | 凶猛橡木 → 戾橡枝 → 凶戾橡木 | Grimoak（原 Baleful Oakbough） | 戾橡枝离凶猛橡木远；留「凶」「橡木」，猛换戾；英文留 oak |
| uniques.json | Knell Striker | 丧钟敲击者 → 葬钟之槌 → 丧钟之槌 | Knell Mallet（原 Gravebell Mallet） | 葬钟之槌、Gravebell 丢了「丧钟」/ Knell；留下，敲击者换槌 |
| uniques.json | Rusthandle | 腐锈权柄 → 锈斑之握 → 腐锈握柄 | Rustgrip（原 Rust-Mottled Grasp） | 锈斑之握只剩锈；留「腐锈」「柄」，权换握；英文留 Rust |
| uniques.json | Stormeye | 风暴之眼 → 雷暴之瞳 → 风暴之瞳 | Stormglare（原 Pupil of the Thunderhead） | 雷暴之瞳风、眼都换了；留「风暴」，眼换瞳；英文留 Storm |
| uniques.json | Stoutnail | 坚硬钉爪 → 顽铁钉 → 坚硬钉锤 | Stoutspike（原 Unyielding Ironspike） | 顽铁钉丢了「坚硬」；留「坚硬钉」，爪换锤（底材钉头棒）；英文留 Stout |
| uniques.json | Crushflange | 四叶破甲锤 → 碾棱锤 → 四叶碎甲锤 | Crushridge（原 Ridged Millhammer） | 碾棱锤认不出四叶破甲锤；只把破换碎；英文留 Crush |
| uniques.json | Bloodrise | 血色飞星 → 血涌晨星 → 血色晨星 | Bloodmorn（原 Daystar of Welling Gore） | 血涌晨星丢了「血色」；留「血色」「星」，飞换晨（底材晨星）；英文留 Blood |
| uniques.json | The General's Tan Do Li Ga | 将军的短连枷 → 统帅的铁连枷 → 将军的铁连枷 | The General's Iron Flail（原 The Marshal's Iron Flail） | 统帅、Marshal 丢了「将军」/ General；留下，短换铁 |
| uniques.json | Ironstone | 铁石 → 陨铁顽石 → 陨铁石 | Starfallen Ironstone（原 Starfallen Granite） | 陨铁顽石把「铁石」拆开了；整个留下，加「陨」；英文留 Ironstone |
| uniques.json | Bonesnap | 碎骨 → 折骨锤 → 碎骨锤 | Bonecrack（原 Marrowcrack Maul） | 折骨锤把「碎」也换了；整个留下，加「锤」；英文留 Bone |
| uniques.json | Steeldriver | 钢榔头 → 夯钢锤 → 精钢榔头 | Steelrammer（原 Steelshod Rammer） | 夯钢锤丢了「榔头」；整个留下，加「精」；英文留 Steel |
| uniques.json | Rixot's Keen | 瑞克撒特的挽歌 → 里柯索之恸 → 睿柯索的哀歌 | Rikosso's Dirge（原 Lykosso's Grief） | 恸离挽歌远；照套装件「人名的物件」，挽歌换哀歌；音译随术语表（里柯索→睿柯索，Lykosso→Rikosso） |
| uniques.json | Blood Crescent | 血色新月 → 赤月弯锋 → 血染新月 | Crimson Crescent（原 Redmoon Edge） | 赤月弯锋只剩月；留「血」「新月」，色换染；英文留 Crescent |
| uniques.json | Skewer of Krintiz | 克林茨的肉叉 → 喀麟兹的铁钎（不变） | Kharintz's Iron Prong（原 Kalinz's Iron Prong） | 音译随术语表（Kalinz→Kharintz） |
| uniques.json | Gleamscythe | 寒光镰刀 → 冷辉之镰 → 寒光弯镰 | Gleamsickle（原 Coldlight Sickle） | 冷辉之镰三处全换；留「寒光」「镰」；英文留 Gleam |
| uniques.json | Hellplague | 地狱瘟疫 → 魔渊之疠 → 冥狱瘟疫 | Netherplague（原 Abyssal Pestilence） | 魔渊之疠一个字不剩；留「狱」「瘟疫」，地换冥；英文留 plague |
| uniques.json | Shadowfang | 暗影之牙 → 阴翳獠牙 → 暗影獠牙 | Shadowtusk（原 Pall-Shrouded Tusk） | 阴翳獠牙丢了「暗影」；留下，之牙换獠牙；英文留 Shadow，獠牙＝Tusk |
| uniques.json | Soulflay | 剥魂者 → 剐魂之刃 → 剥魂之刃 | Soulskinner（原 Spiritcarver Blade） | 剐魂之刃把「剥」也换了；留「剥魂」，者换之刃；英文留 Soul |
| uniques.json | Kinemil's Awl | 金麦尔的锥子 → 钦弥勒之锥 → 锦迈勒之锥 | Kinmael's Bodkin（原 Chinmiel's Bodkin） | 音译随术语表（钦弥勒→锦迈勒，Chinmiel→Kinmael） |
| uniques.json | Blacktongue | 黑舌 → 乌毒之舌 → 黑毒之舌 | Tongue of Black Venom（原 Tongue of Sable Venom） | 乌毒之舌丢了「黑」；留「黑」「舌」，加毒；英文留 Black、Tongue |
| uniques.json | Ripsaw | 碎肉锯 → 撕筋锯刃 → 撕肉锯 | Rendsaw（原 Sinewrend Jagblade） | 撕筋锯刃丢了「肉」；留「肉锯」，碎换撕；英文留 saw |
| uniques.json | The Patriarch | 大族长 → 宗族元老 → 老族长 | Grey Patriarch（原 Greybeard of the Kindred） | 宗族元老、Greybeard 丢了「族长」/ Patriarch；大换老 |
| uniques.json | Gull | 海鸥 → 鸥喙（不变） | Gullbeak（原 Seamew's Beak） | 英文 Seamew 是只有词典才认的词；留 Gull，加 beak（同中文鸥喙） |
| uniques.json | The Jade Tan Do | 玉尖刀 → 翡翠尖刃 → 玉尖刃 | Jade Point（原 Kingfisher Jade Point） | 翡翠尖刃把「玉」也换了；留「玉尖」，刀换刃；英文留 Jade |
| uniques.json | Spectral Shard | 彩虹碎片 → 虹魄残锋 → 彩虹残片 | Spectral Sliver（原 Rainbow Anima's Broken Edge） | 虹魄残锋认不出彩虹碎片；留「彩虹」，碎换残；英文留 Spectral |
| uniques.json | Razortine | 剃刀尖齿 → 剃锋叉 → 剃刀尖叉 | Razorfork（原 Razorhone Fork） | 剃锋叉丢了「剃刀」；留「剃刀尖」，齿换叉（底材三叉戟）；英文留 Razor |
| uniques.json | Bloodthief | 血贼 → 窃血者（不变） | Bloodpilferer（原 Pilferer of Veins） | 英文 Pilferer of Veins 丢了 Blood；留下，thief 换 pilferer（同中文窃血者） |
| uniques.json | Lance of Yaggai | 亚盖长枪 → 雅嘎伊骑枪（不变） | Yagorai's Tilting Spear（原 Yagayi's Tilting Spear） | 音译随术语表（Yagayi→Yagorai） |
| uniques.json | The Tannr Gorerod | 皮匠的血刺枪 → 鞣革者的血棘 → 皮匠的血刺矛 | The Tanner's Gorepike（原 The Currier's Bloodthorn） | 鞣革者的血棘两处全换；留「皮匠的血刺」，枪换矛；英文 Currier 是词典词，留 Tanner、Gore |
| uniques.json | Steelgoad | 钢刺棒 → 镔铁长策 → 钢棘棒 | Steelprod（原 Damask Longlash） | 镔铁长策要绕《过秦论》才对得上；留「钢」「棒」，刺换棘；英文留 Steel |
| uniques.json | Soul Harvest | 收魂者 → 刈魂之镰 → 收魂之镰 | Soul Reaping（原 Scythe of Mown Souls） | 刈魂之镰把「收」也换了；留「收魂」，者换之镰；英文留 Soul |
| uniques.json | The Battlebranch | 突围者 → 鏖战虬枝 → 突围之枝 | Battlebough（原 Gnarled Limb of Strife） | 鏖战虬枝认不出突围者；留「突围」，者换之枝；英文留 Battle |
| uniques.json | Woestave | 降灾长戟 → 苦厄之杖 → 降祸长戟 | Woehaft（原 Staff of Bitter Travail） | 苦厄之杖认不出降灾长戟；留「降」「长戟」，灾换祸；英文留 Woe |
| uniques.json | The Grim Reaper | 恐怖收割者 → 索命刈者 → 狰狞收割者 | The Grisly Reaper（原 The Lifeclaimer） | 索命刈者、Lifeclaimer 全换了；留「收割者」/ Reaper，恐怖换狰狞（Grim 在术语表里是人名戈临，英文不能留） |
| uniques.json | Bane Ash | 祸根之灰 → 灾殃灰木 → 祸根灰木 | Bane Ashwood（原 Ashwood of Calamity） | 灾殃灰木丢了「祸根」；留「祸根」「灰」；英文留 Bane Ash，加 wood |
| uniques.json | Serpent Lord | 海蛇之王 → 群蛇之主 → 海蛇之主 | Serpent Sire（原 Sire of the Adderbrood） | 群蛇之主丢了「海蛇」；留下，王换主；英文留 Serpent |
| uniques.json | Spire of Lazarus | 拉扎鲁斯的螺旋杖 → 腊札禄的尖塔 → 腊札禄的旋纹杖 | Lazhalu's Steeple（不变） | 尖塔是英文直译，老玩家记的是螺旋杖；螺换纹 |
| uniques.json | The Iron Jang Bong | 铁长棍 → 撼山铁杵 → 铁巨棍 | The Iron Cudgel（原 Iron Mountainshaker） | 撼山铁杵只剩铁；留「铁」「棍」，长换巨；英文留 Iron |
| uniques.json | Pluckeye | 剜眼 → 摘目弓 → 剜眼弓 | Eyegouger's Bow（不变） | 摘目弓两个字全换；整个留下，加「弓」 |
| uniques.json | Witherstring | 凋零之击 → 枯藤弦 → 凋零之袭 | Withercord（原 Serevine Bowstring） | 枯藤弦认不出凋零之击；留「凋零之」，击换袭（「凋零之弦」又像凋零劲弦）；英文留 Wither |
| uniques.json | Raven Claw | 血鸦之爪 → 乌翎之爪 → 绯鸦之爪 | Raven Talon（原 Blackplume Talon） | 乌翎之爪认不出血鸦之爪；血鸦照怪物表作「绯鸦」；英文留 Raven |
| uniques.json | Rogue's Bow | 游猎之弓 → 绿林之弓 → 游侠之弓 | Rogue's Recurve（原 Bow of the Greenwood） | 绿林之弓丢了「游猎」/ Rogue；猎换侠；英文留 Rogue |
| uniques.json | Stormstrike | 风暴之击 → 疾雷之矢 → 风暴之矢 | Stormshot（原 Arrow of Sudden Thunder） | 疾雷之矢丢了「风暴」；留下，击换矢；英文留 Storm |
| uniques.json | Wizendraw | 凋零劲弦 → 朽弓满月 → 凋萎劲弦 | Wizenpull（原 Moldering Moonbow） | 朽弓满月认不出凋零劲弦；留「凋」「劲弦」，零换萎；英文留 Wizen |
| uniques.json | Hellclap | 地狱飞啸 → 冥狱霹雳 → 冥狱飞啸 | Netherclap（原 Nethergaol Levinbolt） | 冥狱霹雳丢了「飞啸」；留「狱」「飞啸」，地换冥；英文留 clap |
| uniques.json | Blastbark | 爆裂喧嚣 → 轰裂之吠 → 爆裂叫嚣 | Blastsnarl（原 Howl of Rupture） | 轰裂之吠丢了「爆裂」；留下，喧换叫；英文留 Blast |
| uniques.json | Leadcrow | 铅鸦 → 铅铸之乌 → 铅铸之鸦 | Leadrook（原 Rook of Poured Lead） | 「乌」认不出是鸦；留「铅」「鸦」；英文留 Lead，鸦＝Rook |
| uniques.json | Ichorsting | 灵液之刺 → 神血之螫 → 灵液之螫 | Ichorbarb（原 Barb of the Godsblood） | 神血之螫丢了「灵液」；留下，刺换螫；英文留 Ichor |
| uniques.json | Hellcast | 狱火投手 → 炼狱飞矢 → 狱火射手 | Hellshot（原 Purgatorial Quarrel） | 炼狱飞矢只剩「狱」；留「狱火」「手」，投换射；英文留 Hell |
| uniques.json | Doomslinger | 末日投手 → 终劫弩手 → 末日弩手 | Doomhurler（原 Worldsend Arbalist） | 终劫弩手丢了「末日」；留下，投换弩；英文留 Doom |
| uniques.json | Biggin's Bonnet | 幼童软帽 → 稚子便帽 → 稚童软帽 | Biggin's Cap（原 Weanling's Cap） | 稚子便帽三处全换；留「童」「软帽」，幼换稚；英文 Weanling 是词典词，留 Biggin |
| uniques.json | Tarnhelm | 塔恩之盔 → 坦伦隐盔 → 坦恩隐盔 | Tharen Veilhelm（原 Tanlun Veilhelm） | 音译随术语表（坦伦→坦恩，Tanlun→Tharen） |
| uniques.json | Coif of Glory | 荣光锁帽 → 殊荣链兜 → 荣光链帽 | Coif of Laurels（原 Laurel Mailhood） | 殊荣链兜认不出荣光锁帽；留「荣光」，锁换链；英文留 Coif |
| uniques.json | Duskdeep | 黄昏薄暮 → 暮霭深沉 → 黄昏深暮 | Gloamdeep（原 Brooding Gloam） | 暮霭深沉只剩暮；留「黄昏」「暮」，薄换深（deep）；英文留 deep |
| uniques.json | Wormskull | 蛆虫头骨 → 蠕蛆残颅 → 蛆虫颅骨 | Grubskull（原 Grubgnawed Cranium） | 蠕蛆残颅丢了「蛆虫」；留下，头换颅；英文留 skull |
| uniques.json | Howltusk | 怒号长牙 → 嗥啸獠牙 → 怒啸长牙 | Howlfang（原 Moonbaying Fang） | 嗥啸獠牙两个词都换了；留「怒」「长牙」，号换啸；英文留 Howl |
| uniques.json | Undead Crown | 不死王冠 → 亡者之冕 → 不死之冕 | Deathless Crown（原 Diadem of the Perished） | 亡者之冕丢了「不死」；留下，王冠换之冕；英文留 Crown |
| uniques.json | The Face of Horror | 恐惧面容 → 骇怖之容 → 惊惧面容 | The Face of Dread（原 Dreadgraven Visage） | 骇怖之容全换了；留「惧」「面容」，恐换惊；英文留 Face |
| uniques.json | Greyform | 灰影 → 苍灰形骸 → 苍灰之影 | Greyshape（原 Pallid Husk） | 苍灰形骸丢了「影」；留「灰」「影」，加苍；英文留 Grey |
| uniques.json | Blinkbat's Form | 火蝠之影 → 闪蝠魅形 → 闪蝠之影 | Blinkbat's Guise（原 Flitwing Phantasm） | 闪蝠魅形丢了「之影」；只把火换闪；英文留 Blinkbat |
| uniques.json | The Centurion | 百夫长 → 百战统领 → 百人长 | Centurion's Harness（原 Hundred-Fought Legate） | 百战统领认不出百夫长；夫换人；英文留 Centurion |
| uniques.json | Twitchthroe | 抽动的挣扎 → 痉挛苦楚 → 抽搐的挣扎 | Twitchpang（原 Palsied Torment） | 痉挛苦楚全换了；只把动换搐；英文留 Twitch |
| uniques.json | Darkglow | 黑暗幽光 → 幽暗冷辉 → 黑暗幽辉 | Darkshimmer（原 Coldlight of the Deep） | 幽暗冷辉认不出黑暗幽光；只把光换辉；英文留 Dark |
| uniques.json | Hawkmail | 雄鹰甲 → 鹰翎战甲 → 雄鹰战甲 | Hawk Hauberk（原 Hawkquill Hauberk） | 鹰翎战甲丢了「雄鹰」；留下，加战；英文 Hawkquill 改回 Hawk |
| uniques.json | Sparking Mail | 电光锁甲 → 迸雷链衣 → 电光链甲 | Sparking Chainshirt（原 Thunderburst Chainshirt） | 迸雷链衣丢了「电光」；留下，锁换链；英文留 Sparking |
| uniques.json | Venom Ward | 毒液禁区 → 毒涎守御 → 毒液禁地 | Venom Aegis（原 Fastness of Black Spittle） | 毒涎守御认不出毒液禁区；区换地；英文留 Venom |
| uniques.json | Iceblink | 闪耀冰晶 → 冰辉瞬闪 → 闪耀冰辉 | Iceflash（原 Fleeting Rimegleam） | 冰辉瞬闪打乱了；留「闪耀冰」，晶换辉；英文留 Ice |
| uniques.json | Boneflesh | 骨肉分离 → 枯骨腐肉 → 骨肉剥离 | Bonecarrion（原 Marrowless Carrion） | 枯骨腐肉丢了「分离」；分换剥；英文留 Bone |
| uniques.json | Rockfleece | 石中毛 → 磐石羊裘 → 石中裘 | Stonefleece（原 Mantle of the Stone Ram） | 磐石羊裘认不出石中毛；毛换裘；英文留 fleece |
| uniques.json | Rattlecage | 作响之笼 → 铿锵囚笼 → 作响囚笼 | Clattercage（原 Gaol of Clanging Chains） | 铿锵囚笼丢了「作响」；留下，之笼换囚笼；英文留 cage |
| uniques.json | Goldskin | 黄金之肤 → 镀金之躯 → 镀金之肤 | Goldhide（原 Gilded Vessel） | 镀金之躯丢了「肤」；留「金之肤」，黄换镀；英文留 Gold |
| uniques.json | Silks of the Victor | 胜者的丝绸 → 凯旋锦袍 → 胜者的丝袍 | Silks of the Conqueror（原 Triumphal Brocade） | 凯旋锦袍全换了；留「胜者的丝」，绸换袍；英文留 Silks |
| uniques.json | Heavenly Garb | 天界圣衣 → 苍穹法衣 → 天界法衣 | Heavenly Raiment（原 Raiment of the Welkin） | 苍穹法衣丢了「天界」；留下，圣换法；英文留 Heavenly，Welkin 是词典词 |
| uniques.json | Pelta Lunata | 新月小盾 → 弦月轻盾 → 新月轻盾 | Pelta Crescens（原 Quartermoon Buckler） | 弦月轻盾两处都换；留「新月」，小换轻；英文留拉丁文 Pelta，Lunata 换同义的 Crescens |
| uniques.json | Umbral Disk | 太阳黑轮 → 蚀影之轮 → 太阳暗轮 | Umbral Wheel（原 Wheel of the Eclipse） | 蚀影之轮认不出太阳黑轮；黑换暗；英文留 Umbral |
| uniques.json | Stormguild | 风暴行会 → 暴风盟誓 → 风暴盟会 | Stormleague（原 Oath of the Gale） | 暴风盟誓全换了；留「风暴」「会」，行换盟；英文留 Storm |
| uniques.json | Wall of the Eyeless | 无眼之墙 → 剜目骨垣 → 无眼之垣 | Rampart of the Eyeless（原 Gouged-Eye Bone Rampart） | 剜目骨垣认不出无眼之墙；墙换垣；英文留 Eyeless，垣＝Rampart |
| uniques.json | Swordback Hold | 剑背之架 → 剑脊坚堡 → 剑脊之架 | Swordspine Hold（原 Bastion of Bladed Spines） | 剑脊坚堡丢了「之架」；只把背换脊；英文留 Sword、Hold |
| uniques.json | Steelclash | 响钢 → 金铁交鸣 → 鸣钢 | Steelclamor（原 Chorus of Iron） | 金铁交鸣认不出响钢；留「钢」，响换鸣；旧名为了英文不撞 Iron 把钢换成金铁，现在 Steel 是这一行该留的词 |
| uniques.json | Bverrit Keep | 贝弗提的壁垒 → 碑维利要塞 → 碑孚利要塞 | Beverith Fortress（原 Beiwelli Fortress） | 音译随术语表（碑维利→碑孚利，Beiwelli→Beverith） |
| uniques.json | The Ward | 御敌 → 护界 → 御寇 | Hallowed Ward（原 Hallowed Boundary） | 护界、Hallowed Boundary 认不出；留「御」，敌换寇；英文留 Ward |
| uniques.json | Bloodfist | 染血拳套 → 血污之拳 → 沾血拳套 | Bloodknuckle（原 Gore-Caked Knuckles） | 血污之拳丢了「拳套」；只把染换沾；英文留 Blood |
| uniques.json | Chance Guards | 吉运守护 → 机缘护手 → 吉运护手 | Chance Gauntlets（原 Gauntlets of Providence） | 机缘护手丢了「吉运」；留下，守护换护手；英文留 Chance |
| uniques.json | Magefist | 法师之拳 → 术士铁拳 → 法师铁拳 | Magegrip（原 Sorcerer's Iron Grip） | 术士铁拳丢了「法师」；留下，之换铁；英文留 Mage |
| uniques.json | Frostburn | 霜灼 → 寒焚之握 → 霜焚 | Frostscorch（原 Clutch of Freezing Flame） | 寒焚之握两个字都换了；留「霜」，灼换焚；英文留 Frost |
| uniques.json | Hotspur | 热刺靴 → 炽焰马刺 → 炽刺靴 | Blazespur（原 Rowels of Living Flame） | 炽焰马刺丢了「靴」；留「刺靴」，热换炽（也避开热刺球队）；英文留 spur |
| uniques.json | Gorefoot | 践血 → 浴血之足 → 踏血 | Goretread（原 Bloodbathed Treads） | 浴血之足丢了「践」；践换踏；英文留 Gore |
| uniques.json | Treads of Cthon | 克索恩的征途 → 刻顿之履 → 刻梭温的征程 | Kesthon's Strides（原 Kedhun's Sabatons） | 履离老玩家记的「征途」远；途换程；英文 Sabatons 换 Strides；音译随术语表（刻顿→刻梭温，Kedhun→Kesthon） |
| uniques.json | Goblin Toe | 哥布林之趾 → 狞鬼尖趾 → 哥布林尖趾 | Goblin Tiptoe（原 Snarling Imp's Toe） | 狞鬼尖趾丢了「哥布林」/ Goblin；留下，之换尖 |
| uniques.json | Tearhaunch | 刺股靴 → 裂股战靴 → 裂股靴 | Tearflank（原 Hamstringer Warboots） | 裂股战靴多了一字；刺换裂即可；英文留 Tear |
| uniques.json | Snakecord | 蛇皮索 → 蛇鳞缚索 → 蛇鳞索 | Snakescale Cord（原 Serpentscale Binding） | 蛇鳞缚索多了一字；只把皮换鳞；英文留 Snake、Cord |
| uniques.json | Nightsmoke | 夜烟 → 暗宵烟缕 → 夜烟缕 | Nightfume（原 Wisps of the Starless Watch） | 暗宵烟缕丢了「夜」；整个留下，加缕；英文留 Night |
| uniques.json | Goldwrap | 金织带 → 鎏金缠腰 → 金缠带 | Goldswathe（原 Girdle of Molten Gilt） | 鎏金缠腰丢了「带」；只把织换缠；英文留 Gold |
| uniques.json | Bladebuckle | 刀刃腰扣 → 锋刃带钩 → 锋刃腰扣 | Bladeclasp（原 Razor-Hasped Cincture） | 锋刃带钩丢了「腰扣」；只把刀换锋；英文留 Blade |
| uniques.json | The Eye of Etlich | 艾利奇之眼 → 厄特里之目 → 埃特里齐之目 | Gaze of Etterlich（原 Gaze of Etterli） | 音译随术语表（厄特里→埃特里齐，Etterli→Etterlich） |
| uniques.json | The Mahim-Oak Curio | 马哈姆橡木珍品 → 摩欣橡木奇珍 → 玛翰穆橡木奇珍 | Mahannim's Oaken Charm（原 Mohshin's Oaken Charm） | 音译随术语表（摩欣→玛翰穆，Mohshin→Mahannim） |
| uniques.json | Manald Heal | 马纳德的治疗 → 曼诺尔之愈 → 玛诺铎之愈 | Manodor's Mending（原 Mannoer's Mending） | 音译随术语表（曼诺尔→玛诺铎，Mannoer→Manodor） |
| uniques.json | The Stone of Jordan | 乔丹之石 → 觉旦灵石 → 樵顿灵石 | Jourdaine's Spirit Gem（原 Juedan's Spirit Gem） | 音译随术语表（觉旦→樵顿，Juedan→Jourdaine） |
| uniques.json | Amulet of the Viper | 蝮蛇护符 → 蝰蛇项坠 → 蝮蛇项坠 | Pendant of the Viper（原 Coiled Adder Pendant） | 蝰蛇项坠把「蝮」也换了；留「蝮蛇」，护符换项坠；英文留 Viper |
| uniques.json | Staff of Kings | 列王之杖 → 先王权杖 → 列王权杖 | Scepter of Kings（原 Scepter of Bygone Kings） | 先王权杖丢了「列王」；留下，之换权；英文留 Kings |
| uniques.json | Hell Forge Hammer | 地狱熔炉之锤 → 狱炉锻锤（不变） | Sledge of the Netherforge（原 Sledge of the Nether Furnace） | 音译随术语表（Nether Furnace→Netherforge） |
| uniques.json | Khalim's Flail | 卡林姆的连枷 → 哈廉的链锤 → 喀廉的链锤 | Khalyan's Chain Mace（原 Halyan's Chain Mace） | 音译随术语表（哈廉→喀廉，Halyan→Khalyan） |
| uniques.json | Khalim's Will | 卡林姆的意志 → 哈廉的遗志 → 喀廉的遗志 | Khalyan's Testament（原 Halyan's Testament） | 音译随术语表（哈廉→喀廉，Halyan→Khalyan） |
| uniques.json | Coldkill | 冰殛 → 霜戮 → 冰戮 | Coldslayer（原 Rimeslayer） | 霜戮两个字都换了；留「冰」，殛换戮；英文留 Cold |
| uniques.json | Butcher's Pupil | 屠夫之瞳 → 血屠之眸 → 屠夫之眸 | Butcher's Leer（原 Bloodhewer's Gaze） | 血屠之眸丢了「屠夫」/ Butcher；留下，瞳换眸 |
| uniques.json | Islestrike | 海岛之击 → 孤屿劈击 → 孤岛之击 | Islecleave（原 Cleave of the Lone Skerry） | 孤屿劈击丢了「岛」；留「岛之击」，海换孤；英文留 Isle，Skerry 是词典词 |
| uniques.json | Pompeii's Wrath | 庞贝之怒 → 滂培天怒（不变） | Pangpei's Divine Wrath（原 Pangpei's Divine Ire） | 英文 Ire 是 Chromatic Ire 那一行的词；换回本行的 Wrath，加 Divine（同中文天怒） |
| uniques.json | Guardian Naga | 蛇神守护者 → 蛇灵护卫 → 蛇神护卫 | Naga Warden（原 Serpent-Spirit Warden） | 蛇灵护卫把「神」也换了；留「蛇神」，守护者换护卫；英文留 Naga |
| uniques.json | Warlord's Trust | 战争领主的信赖 → 统帅之托 → 战争领主的托付 | Warlord's Fealty（原 Marshal's Charge） | 统帅之托全换了；留「战争领主的」，信赖换托付；英文留 Warlord |
| uniques.json | Spellsteel | 魔咒之钢 → 缚咒斧 → 秘咒之钢 | Hexsteel（原 Hexbound Axe） | 缚咒斧丢了「钢」，是新意象；留「咒之钢」，魔换秘；英文留 steel |
| uniques.json | Stormrider | 御雷者 → 驰雷骁骑 → 驰雷者 | Stormgalloper（原 Thundergallop Cavalier） | 驰雷骁骑丢了「者」；只把御换驰；英文留 Storm |
| uniques.json | Boneslayer Blade | 碎骨者之刃 → 斩骸之锋 → 碎骨者之锋 | Boneslayer Edge（原 Corpsecleaver Edge） | 斩骸之锋全换了；留「碎骨者之」，刃换锋；英文留 Boneslayer |
| uniques.json | The Minotaur | 牛魔斧 → 牛首狂斧（不变） | Minotaur's Frenzy（原 Oxhead's Frenzy） | 英文 Oxhead's Frenzy 丢了 Minotaur；留下，加 Frenzy（同中文狂斧） |
| uniques.json | Suicide Branch | 自戕树杈 → 自缢枯枝 → 自戕枯枝 | Suicide Bough（原 Hanging Witherbough） | 自缢枯枝把「戕」也换了；留「自戕」，树杈换枯枝；英文留 Suicide |
| uniques.json | Carin Shard | 石冢碎片 → 荒冢残石 → 石冢残片 | Cairn Splinter（原 Crumbled Barrowstone） | 荒冢残石丢了「石冢」；留下，碎换残；英文留 Cairn |
| uniques.json | Blackhand Key | 黑手钥匙 → 墨掌之钥 → 黑掌钥匙 | Blackpalm Key（原 Key of the Inkpalm） | 墨掌之钥全换了；留「黑」「钥匙」，手换掌；英文留 Black、Key |
| uniques.json | Dark Clan Crusher | 暗族粉碎者 → 冥氏碾锤 → 暗族碾碎者 | Dark Clan Breaker（原 Netherkin Grindmaul） | 冥氏碾锤全换了；留「暗族」「碎者」，粉换碾；英文留 Dark Clan |
| uniques.json | Zakarum's Hand | 萨卡兰姆之手 → 札迦仑圣掌 → 札喀仑圣掌 | Zakhalun's Holy Palm（原 Zajalun's Holy Palm） | 音译随术语表（札迦仑→札喀仑，Zajalun→Zakhalun） |
| uniques.json | The Fetid Sprinkler | 恶臭喷杖 → 腐秽洒杖 → 恶臭洒杖 | The Fetid Spatterer（原 Rotfilth Aspergill） | 腐秽洒杖丢了「恶臭」；留下，喷换洒；英文留 Fetid，Aspergill 是词典词 |
| uniques.json | Hand of Blessed Light | 圣光之手 → 祝圣辉掌 → 圣光之掌 | Palm of Blessed Light（原 Consecrated Radiant Palm） | 祝圣辉掌全换了；留「圣光之」，手换掌；英文留 Blessed Light |
| uniques.json | Fleshrender | 血肉撕裂者 → 裂肤者 → 血肉撕碎者 | Fleshsunderer（原 Skinsplitter） | 裂肤者丢了「血肉撕」；只把裂换碎；英文留 Flesh |
| uniques.json | Sureshrill Frost | 神河之霜 → 锐啸寒霜 → 神河寒霜 | Sureshrill Rime（原 Shrieking Rime） | 锐啸寒霜丢了「神河」；留下，之霜换寒霜；英文留 Sureshrill |
| uniques.json | Moonfall | 月陨 → 碎月坠星 → 月坠 | Moonplunge（原 Riven Crescent's Plunging Star） | 碎月坠星离月陨远；留「月」，陨换坠；英文留 Moon（Moonfall 也是电影名） |
| uniques.json | Baezil's Vortex | 贝希尔的漩涡 → 裴哲勒的旋渊 → 碑夕勒的涡流 | Baeshel's Whirlpool（原 Peizhel's Whirling Abyss） | 旋渊不成词；漩涡换涡流；英文 Whirling Abyss 换 Whirlpool；音译随术语表（裴哲勒→碑夕勒，Peizhel→Baeshel） |
| uniques.json | Earthshaker | 震地者 → 撼山锤 → 震地锤 | Groundshaker（原 Mountainquake Maul） | 撼山锤丢了「震地」；留下，者换锤；Earthshaker 是 DotA 英雄名，英文留 shaker |
| uniques.json | Bloodtree Stump | 龙血木桩 → 血槐断桩 → 龙血断桩 | Bloodwood Stump（原 Splintered Bloodyew） | 血槐断桩丢了「龙血」；留下，木换断；英文留 Blood、Stump |
| uniques.json | The Gavel of Pain | 苦痛木槌 → 忏罪之槌 → 苦痛刑槌 | The Gavel of Agony（原 Maul of Penance） | 忏罪之槌认不出苦痛木槌；留「苦痛」「槌」，木换刑；英文留 Gavel |
| uniques.json | Bloodletter | 放血者 → 沥血之刃 → 泄血者 | Bloodspiller（原 Bloodweep Blade） | 沥血之刃丢了「者」；只把放换泄；英文留 Blood |
| uniques.json | Coldsteel Eye | 冷钢之眼 → 寒铁之瞳 → 寒钢之眼 | Coldsteel Stare（原 Frostiron Gaze） | 寒铁之瞳三个字全换；留「钢之眼」，冷换寒；英文留 Coldsteel |
| uniques.json | Hexfire | 妖术之火 → 咒焰 → 妖术之焰 | Hexflame（原 Malison Blaze） | 咒焰丢了「妖术」；留下，火换焰；英文留 Hex |
| uniques.json | Blade of Ali Baba | 阿里巴巴之刃 → 亚利芭芭弯刃（不变） | Yalim Bhaba's Scimitar（原 Yali Bhaba's Scimitar） | 音译随术语表（Yali Bhaba→Yalim Bhaba） |
| uniques.json | Ginther's Rift | 金瑟的破空之痕 → 甘忒的裂隙 → 晋忒的裂空之痕 | Ghintor's Fissure（原 Ganthe's Fissure） | 裂隙离官方「破空之痕」远；留「空之痕」，破换裂；音译随术语表（甘忒→晋忒，Ganthe→Ghintor） |
| uniques.json | Headstriker | 斩首者 → 击颅者 → 斩颅者 | Headsmiter（原 Smiter of Skulls） | 击颅者丢了「斩」；只把首换颅；英文留 Head |
| uniques.json | Plague Bearer | 瘟疫散播者 → 行瘟者 → 瘟疫传播者 | Plague Carrier（原 Envoy of Pestilence） | 行瘟者认不出瘟疫散播者；只把散换传；英文留 Plague |
| uniques.json | Crainte Vomir | 恐惧喷吐 → 呕怖巨剑 → 恐惧呕吐 | Peur Vomir（原 Dreadretch Greatsword） | 呕怖巨剑认不出恐惧喷吐；喷换呕；英文留法文 Vomir，Crainte 换同义的 Peur |
| uniques.json | Bing Sz Wang | 冰之王 → 玄冰君 → 冰之君 | Bing Sz Jun（原 Sovereign of the Umbral Rime） | 玄冰君用了符文之语「玄冰」的字；只把王换君；英文留 Bing Sz，Wang 换 Jun（君） |
| uniques.json | The Vile Husk | 邪祟之牙 → 邪秽之壳 → 邪祟之壳 | The Vile Carcass（原 Shell of the Festering） | 邪秽之壳丢了「邪祟」；留下，牙换壳（husk）；英文留 Vile |
| uniques.json | Cloudcrack | 裂云剑 → 劈霄 → 裂云刃 | Cloudsplit（原 Firmament Cleaver） | 劈霄两个字全换；留「裂云」，剑换刃；英文留 Cloud |
| uniques.json | Todesfaelle Flamme | 索命之焰 → 焚命 → 索命之火 | Todesfaelle Feuer（原 Lifepyre） | 焚命丢了「索」；留「索命之」，焰换火；英文留德文 Todesfaelle，Flamme 换 Feuer |
| uniques.json | Swordguard | 卫剑 → 守锋 → 卫锋 | Bladeguard（原 Keeper's Edge） | 守锋两个字全换；留「卫」，剑换锋；英文留 guard |
| uniques.json | Spineripper | 裂脊者 → 断脊之匕 → 抽脊者 | Spinetearer（原 Spinesnap Dirk） | 断脊之匕丢了「者」；裂换抽；英文留 Spine |
| uniques.json | Heart Carver | 剜心者 → 剖心刃 → 剜心刃 | Heart Gouger（原 Heartsplit Blade） | 剖心刃把「剜」也换了；留「剜心」，者换刃；英文留 Heart |
| uniques.json | Blackbog's Sharp | 黑沼之锋 → 墨泽利刃 → 黑沼之刃 | Blackbog's Edge（原 Inkmire Keenblade） | 墨泽利刃全换了；留「黑沼之」，锋换刃；英文留 Blackbog |
| uniques.json | Stormspike | 风暴匕刺 → 雷暴之棘 → 风暴尖刺 | Stormthorn（原 Thorn of the Thunderhead） | 雷暴之棘全换了；留「风暴」「刺」，匕换尖；英文留 Storm |
| uniques.json | The Impaler | 穿刺者 → 贯躯者 → 贯刺者 | The Impaling Spear（原 Transfixing Spear） | 贯躯者丢了「刺」；只把穿换贯；英文留 Impale |
| uniques.json | Kelpie Snare | 水妖捕叉 → 水魅罗网 → 水妖渔叉 | Kelpie Noose（原 Drownwraith Net） | 水魅罗网全换了；留「水妖」「叉」，捕换渔；英文留 Kelpie |
| uniques.json | Soulfeast Tine | 噬魂叉 → 魂宴之齿 → 啖魂叉 | Soulfeast Prong（原 Fang of the Soul Banquet） | 魂宴之齿认不出噬魂叉；只把噬换啖；英文留 Soulfeast |
| uniques.json | Hone Sundan | 骨寸断 → 百骸俱碎 → 骨寸碎 | Hone Kudaki（原 All Bones Asunder） | 百骸俱碎全换了；留「骨寸」，断换碎；英文留日文 Hone，Sundan 换同义的 Kudaki（砕き） |
| uniques.json | Spire of Honor | 荣耀之巅 → 崇誉之锋 → 荣耀之峰 | Spire of Renown（原 Point of Exalted Renown） | 崇誉之锋全换了；留「荣耀之」，巅换峰；英文留 Spire |
| uniques.json | The Meat Scraper | 刮肉长戟 → 削肉剔骨 → 剔肉长戟 | The Flesh Scraper（原 Flensed to the Bone） | 削肉剔骨丢了「长戟」；只把刮换剔；英文留 Scraper |
| uniques.json | Blackleach Blade | 暗蚀之刃 → 黑蛭之刃 → 暗蚀之锋 | Blackleach Edge（原 Sable Leechmaw） | 黑蛭之刃丢了「暗蚀」；留下，刃换锋；英文留 Blackleach |
| uniques.json | Athena's Wrath | 雅典娜之怒 → 阿瑟妮的震怒 → 娅甸妮的震怒 | Asseni's Fury（不变） | 音译随术语表（阿瑟妮→娅甸妮） |
| uniques.json | Pierre Tombale Couant | 墓石长戟 → 卧碑 → 墓碑长戟 | Pierre Tombale Gisant（原 Recumbent Stele） | 卧碑丢了「墓」「长戟」；只把石换碑；英文留法文 Pierre Tombale，Couant 换同义的 Gisant |
| uniques.json | Husoldal Evo | 皮肉吞噬者 → 啖肤者 → 皮肉啖噬者 | Husoldal Falo（原 Hidegorger） | 啖肤者丢了「皮肉」「噬」；只把吞换啖；英文留 Husoldal |
| uniques.json | Grim's Burning Dead | 格里姆的烈焰亡灵 → 戈临的燃骸 → 戈临的烈焰亡魂 | Gherim's Blazing Dead（原 Ghelin's Kindled Remains） | 燃骸离「烈焰亡灵」远；灵换魂；英文留 Dead，Burning 换 Blazing；音译随术语表（Ghelin→Gherim） |
| uniques.json | Razorswitch | 剃刀飞旋 → 剃锋鞭 → 剃刀飞鞭 | Razorwhip（原 Scourge of Razors） | 剃锋鞭丢了「剃刀飞」；只把旋换鞭；英文留 Razor |
| uniques.json | Ribcracker | 肋骨粉碎者 → 折肋者 → 肋骨击碎者 | Ribsmasher（原 Ribcage Ruin） | 折肋者丢了「骨」「碎者」；只把粉换击；英文留 Rib |
| uniques.json | Chromatic Ire | 多彩之怒 → 五色之嗔 → 多彩之嗔 | Chromatic Rancor（原 Five-Hued Rancor） | 五色之嗔丢了「多彩」；留下，怒换嗔；英文留 Chromatic |
| uniques.json | Warpspear | 扭曲之矛 → 折空之矛 → 扭曲之枪 | Warplance（原 Voidfold Spear） | 折空之矛丢了「扭曲」；留下，矛换枪；英文留 Warp |
| uniques.json | Skull Collector | 骷髅收集者 → 敛颅者 → 骷髅收藏者 | Skull Gatherer（原 Ossuary Warden） | 敛颅者认不出骷髅收集者；只把集换藏；英文留 Skull |
| uniques.json | Skystrike | 天击 → 苍穹落击 → 天袭 | Skysmite（原 Welkinfall） | 苍穹落击两个字换成四个；留「天」，击换袭；英文留 Sky，Welkin 是词典词 |
| uniques.json | Riphook | 撕裂之钩 → 剐钩 → 撕裂倒钩 | Rendhook（原 Thousandcut Hook） | 剐钩丢了「撕裂」；留下，之换倒；英文留 hook |
| uniques.json | Kuko Shakaku | 赤焰之击 → 绯炎之矢 → 赤焰之矢 | Kuko Shakuen（原 Arrow of Scarlet Flame） | 绯炎之矢丢了「赤焰」；留下，击换矢；英文留日文 Kuko，Shakaku 换赤焰的读音 Shakuen |
| uniques.json | Endlesshail | 无尽冰雹 → 雹落无休 → 无穷冰雹 | Ceaseless Hail（原 Pelting Without Respite） | 雹落无休全换了；留「无」「冰雹」，尽换穷；英文留 Hail |
| uniques.json | Witchwild String | 狂法劲弦 → 癫巫之弦 → 狂巫劲弦 | Witchwild Sinew（原 Mad Crone's String） | 癫巫之弦丢了「狂」「劲弦」；只把法换巫；英文留 Witchwild |
| uniques.json | Cliffkiller | 峭壁杀手 → 崩崖者 → 绝壁杀手 | Cliffslayer（原 Cragtoppler） | 崩崖者全换了；留「壁杀手」，峭换绝；英文留 Cliff |
| uniques.json | Magewrath | 法师之怒 → 术士之愤 → 法师之愤 | Magerage（原 Sorcerer's Indignation） | 术士之愤丢了「法师」；留下，怒换愤；英文留 Mage |
| uniques.json | Goldstrike Arch | 金击之弧 → 金霆之弓 → 金击之弓 | Goldstrike Bow（原 Bow of Golden Thunder） | 金霆之弓丢了「击」；只把弧换弓；英文留 Goldstrike |
| uniques.json | Langer Briser | 千步碎击 → 碎岳长弩 → 千步破击 | Langer Brecher（原 Summitshatter Arbalest） | 碎岳长弩全换了；留「千步」「击」，碎换破；英文留 Langer，法文 Briser 换德文 Brecher |
| uniques.json | Pus Spitter | 吐脓毒弩 → 喷脓者 → 喷脓毒弩 | Pus Spewer（原 Festerspew） | 喷脓者丢了「毒弩」；只把吐换喷；英文留 Pus |
| uniques.json | Buriza-Do Kyanon | 暴雪重炮 → 雪崩巨炮（不变） | Buriza-Do Daikyanon（原 Avalanche Bombard） | 中文雪崩巨炮是 style.md 的例子，不改；英文 Avalanche Bombard 是 style-en.md 规则 2 的反例，留 Buriza 和 Kyanon 的音，加 Dai（大，同中文巨炮） |
| uniques.json | Demon Machine | 恶魔机弩 → 鬼工连弩 → 恶魔连弩 | Demon Mechanism（原 Ghostwright's Repeater） | 鬼工连弩丢了「恶魔」；留下，机换连；英文留 Demon |
| uniques.json | Peasant Crown | 农夫兜帽 → 布衣之冠 → 农夫毡帽 | Rustic Crown（原 Crown of Homespun） | 布衣之冠全换了；留「农夫」「帽」，兜换毡；英文留 Crown |
| uniques.json | Rockstopper | 磐石头盔 → 御石盔 → 磐石战盔 | Stonestopper（原 Stonewarding Casque） | 御石盔丢了「磐」；留「磐石」「盔」，头换战；英文留 stopper |
| uniques.json | Stealskull | 偷取颅盔 → 夺颅之盔 → 窃取颅盔 | Snatchskull（原 Skullseizer Helm） | 夺颅之盔丢了「取」；只把偷换窃；英文留 skull |
| uniques.json | Darksight Helm | 暗视头盔 → 夜眸盔 → 暗视铁盔 | Darksight Visor（原 Nightgaze Visor） | 夜眸盔全换了；留「暗视」「盔」，头换铁；英文留 Darksight |
| uniques.json | Valkyrie Wing | 女武神之翼 → 天女战翼 → 女武神战翼 | Valkyrie Pinion（原 Skymaiden's Warwing） | 天女战翼丢了「女武神」/ Valkyrie；留下，之换战 |
| uniques.json | Crown of Thieves | 盗贼皇冠 → 群盗之冕 → 盗贼王冠 | Crown of Brigands（原 Coronet of a Hundred Brigands） | 群盗之冕全换了；留「盗贼」「冠」，皇换王；英文留 Crown |
| uniques.json | Blackhorn's Face | 黑牛角面甲 → 玄角魔面 → 黑牛角面具 | Blackhorn's Mask（原 Ebonhorn Fiendmask） | 玄角魔面全换了；留「黑牛角面」，甲换具；英文留 Blackhorn |
| uniques.json | Vampire Gaze | 吸血鬼的凝视 → 饮血魔眸 → 吸血鬼的注视 | Vampire Glower（原 Eye of the Bloodquaffer） | 饮血魔眸全换了；留「吸血鬼的」「视」，凝换注；英文留 Vampire |
| uniques.json | The Spirit Shroud | 覆灵尸衣 → 幽魂殓衣 → 覆灵殓衣 | The Ghost Shroud（原 Wraith Cerecloth） | 幽魂殓衣丢了「覆灵」；留下，尸换殓；英文留 Shroud |
| uniques.json | Skin of the Vipermagi | 蝮蛇法妖之皮 → 蛇巫之蜕 → 蝮蛇法妖之蜕 | Slough of the Vipermagi（原 Serpentwitch's Slough） | 蛇巫之蜕认不出蝮蛇法妖；留下，皮换蜕；英文留 Vipermagi |
| uniques.json | Skin of the Flayed One | 剥皮魔之皮 → 剐身者之革 → 剥皮魔之革 | Hide of the Flayed One（原 Fleshcarver's Hide） | 剐身者之革认不出剥皮魔；留下，皮换革；英文留 the Flayed One |
| uniques.json | Iron Pelt | 铁皮 → 铁鬃裘 → 铁裘 | Iron Furs（原 Ironbristle Mantle） | 铁鬃裘多了一字；只把皮换裘；英文留 Iron |
| uniques.json | Spirit Forge | 灵魂熔炉 → 魂火锻炉 → 灵魂锻炉 | Spirit Crucible（原 Soulfire Crucible） | 魂火锻炉丢了「灵魂」；留下，熔换锻；英文留 Spirit |
| uniques.json | Crow Caw | 鸦鸣 → 夜鸦哀啼 → 鸦啼 | Crow Croak（原 Duskrook's Keening） | 夜鸦哀啼多了两字；只把鸣换啼；英文留 Crow |
| uniques.json | Shaftstop | 摧锋甲 → 截矢甲 → 摧锋铠 | Shaftbane（原 Quarrelbane Hauberk） | 截矢甲认不出摧锋甲；甲换铠；英文留 Shaft |
| uniques.json | Duriel's Shell | 督瑞尔之壳 → 杜里埃的甲壳（不变） | Durayel's Carapace（原 Dulyai's Carapace） | 音译随术语表（Dulyai→Durayel） |
| uniques.json | Skullder's Ire | 诗寇蒂的愤怒 → 丝珂黛的怨怒 → 施蔻黛的怨怒 | Skuldra's Rage（原 Sikedai's Rancor） | 英文 Rancor 现在是 Chromatic Ire 那一行的词；换 Rage；音译随术语表（丝珂黛→施蔻黛，Sikedai→Skuldra） |
| uniques.json | Guardian Angel | 守护天使 → 天佑之翼 → 庇护天使 | Sheltering Angel（原 Wings of Heaven's Shelter） | 天佑之翼丢了「天使」；留下，守换庇；英文留 Angel |
| uniques.json | Toothrow | 排齿 → 獠牙阵 → 列齿 | Toothrank（原 Tusk Phalanx） | 獠牙阵认不出排齿；排换列；英文留 Tooth |
| uniques.json | Atma's Wail | 阿特玛的哭喊 → 娅忒嫚的悲号（不变） | Atemane's Outcry（原 Yatemane's Lament） | 英文 Lament 是 Ume's Lament 的词；换 Outcry；音译随术语表（Yatemane→Atemane） |
| uniques.json | Black Hades | 黑色冥王 → 黑渊冥君 → 黑色冥君 | Sable Hades（原 Blackdeep Netherlord） | 黑渊冥君丢了「色」；只把王换君；英文留 Hades |
| uniques.json | Corpsemourn | 遗体哀悼 → 殓尸哀歌 → 遗骸哀悼 | Corpsegrieve（原 Coffinwake Threnody） | 殓尸哀歌认不出遗体哀悼；体换骸；英文留 Corpse |
| uniques.json | Visceratuant | 刨肠 → 剜脏 → 剜肠 | Viscera Gouge（原 Gutgouger） | 剜脏把「肠」也换了；留「肠」，刨换剜；英文留 Viscera |
| uniques.json | Moser's Blessed Circle | 摩西尔的神圣圆环 → 茂瑟的圣环 → 莫希勒的圣环 | Moshele's Sacred Halo（原 Mawse's Sacred Halo） | 音译随术语表（茂瑟→莫希勒，Mawse→Moshele） |
| uniques.json | Stormchaser | 风暴追逐者 → 追霆者 → 风暴追猎者 | Stormhunter（原 Thunderhound） | 追霆者丢了「风暴」；留下，逐换猎；英文留 Storm |
| uniques.json | Tiamat's Rebuke | 魔龙的斥责 → 孽龙之叱 → 魔龙的怒斥 | Tiamat's Reproach（原 Fellwyrm's Bellow） | 孽龙之叱丢了「魔龙」；留下，斥责换怒斥；英文留 Tiamat |
| uniques.json | Gerke's Sanctuary | 基尔克的避难地 → 盖柯的庇所 → 吉勒柯的庇所 | Gerrick's Refuge（原 Gaikor's Refuge） | 音译随术语表（盖柯→吉勒柯，Gaikor→Gerrick） |
| uniques.json | Radament's Sphere | 罗达门特的领地 → 剌丹蒙的辖域（不变） | Rhadamon's Domain（原 Ladanmon's Demesne） | 英文 Demesne 是词典词；换 Domain；音译随术语表（Ladanmon→Rhadamon） |
| uniques.json | Lidless Wall | 警戒之墙 → 不瞑之壁 → 警戒之壁 | Lidless Parapet（原 Everwatch Battlement） | 不瞑之壁丢了「警戒」；留下，墙换壁；英文留 Lidless |
| uniques.json | Lance Guard | 长枪卫士 → 御矛之卫 → 长枪卫兵 | Lance Warden（原 Pikewarden） | 御矛之卫全换了；留「长枪卫」，士换兵；英文留 Lance |
| uniques.json | Venom Grip | 剧毒之握 → 毒涎之掌 → 剧毒之掌 | Venom Clutch（原 Viperspit Palm） | 毒涎之掌丢了「剧毒」；留下，握换掌；英文留 Venom |
| uniques.json | Gravepalm | 盗墓手套 → 坟土之掌 → 盗墓护手 | Gravehand（原 Barrowsoil Grasp） | 坟土之掌认不出盗墓手套；手套换护手；英文留 Grave |
| uniques.json | Ghoulhide | 食尸鬼皮 → 啖尸魔革 → 食尸鬼革 | Ghoulskin（原 Corpseglutton Leathers） | 啖尸魔革丢了「食尸鬼」；留下，皮换革；英文留 Ghoul |
| uniques.json | Lava Gout | 熔岩痛击 → 岩浆迸流 → 熔岩重击 | Lava Gush（原 Wellspring of Magma） | 岩浆迸流全换了；留「熔岩」「击」，痛换重；英文留 Lava |
| uniques.json | Hellmouth | 地狱之口 → 炼狱之喉 → 冥狱之口 | Nethermouth（原 Gullet of Purgatory） | 炼狱之喉丢了「之口」；留「狱之口」，地换冥；英文留 mouth（Hellmouth 也是《吸血鬼猎人巴菲》的地名） |
| uniques.json | Infernostride | 地狱阔步 → 焚狱之步 → 焚狱阔步 | Infernotread（原 Brimstone Tread） | 焚狱之步丢了「阔步」；留「狱阔步」，地换焚；英文留 Inferno |
| uniques.json | Waterwalk | 水上飘 → 踏浪行 → 浪上飘 | Watertread（原 Wavetreader） | 踏浪行认不出水上飘；水换浪；英文留 Water |
| uniques.json | Silkweave | 丝织靴 → 缫丝之履 → 丝织履 | Silkspun（原 Cocoonspun Buskins） | 缫丝之履丢了「丝织」；只把靴换履；英文留 Silk |
| uniques.json | War Traveler | 战争旅者 → 征尘行者 → 战争行者 | War Wayfarer（原 Marchdust Wayfarer） | 征尘行者丢了「战争」；留下，旅换行；英文留 War |
| uniques.json | Gore Rider | 血骑士 → 浴血骁骑 → 浴血骑士 | Gore Cavalier（原 Bloodbathed Cavalier） | 浴血骁骑丢了「骑士」；整个留下，加浴；英文留 Gore |
| uniques.json | String of Ears | 缠腰耳串 → 割耳之链 → 缠腰耳链 | Chain of Ears（原 Earcutter's Chain） | 割耳之链丢了「缠腰」；只把串换链；英文留 Ears |
| uniques.json | Razortail | 剃刀之尾 → 刃尾鞭 → 剃锋之尾 | Bladetail（原 Bladetail Scourge） | 刃尾鞭丢了「剃」；只把刀换锋；英文留 tail |
| uniques.json | Gloom's Trap | 阴影陷阱 → 窃光罗网 → 幽影陷阱 | Gloom's Snare（原 Snare of the Light-Pilferer） | 窃光罗网是新意象；留「影陷阱」，阴换幽；英文留 Gloom |
| uniques.json | Snowclash | 冰雪之击 → 霜雪交锋 → 霜雪之击 | Snowstrife（原 Hoarfrost Skirmish） | 霜雪交锋丢了「之击」；只把冰换霜；英文留 Snow |
| uniques.json | Thundergod's Vigor | 雷神之力 → 雷君之魄 → 雷君之力 | Thunderking's Vigor（原 Anima of the Levin Sovereign） | 雷君之魄丢了「力」；只把神换君（也避开漫威雷神）；英文留 Thunder、Vigor |
| uniques.json | Harlequin Crest | 谐角之冠 → 弄臣羽冠 → 谐角羽冠 | Harlequin Plume（原 Courtfool's Plume） | 弄臣羽冠丢了「谐角」；留下，之冠换羽冠；英文留 Harlequin |
| uniques.json | Veil of Steel | 钢铁面纱 → 寒钢垂帷 → 钢铁面罩 | Veil of Iron（原 Rimesteel Pall） | 寒钢垂帷认不出钢铁面纱；纱换罩；英文留 Veil |
| uniques.json | The Gladiator's Bane | 角斗士的祸根 → 斗奴之殃 → 角斗士的祸殃 | The Gladiator's Ruin（原 Pitslave's Calamity） | 斗奴之殃丢了「角斗士」；留下，根换殃；英文留 Gladiator |
| uniques.json | Arkaine's Valor | 阿凯尼的荣耀 → 埃铿的英勇 → 埃铠倪的英勇 | Arkhaeni's Gallantry（原 Aikhen's Gallantry） | 音译随术语表（埃铿→埃铠倪，Aikhen→Arkhaeni） |
| uniques.json | Blackoak Shield | 黑橡树盾 → 墨橡卫盾 → 黑橡木盾 | Blackoak Aegis（原 Inkoak Aegis） | 墨橡卫盾丢了「黑」；只把树换木；英文留 Blackoak |
| uniques.json | Stormshield | 暴风之盾 → 飓风坚壁 → 暴风坚盾 | Storm Bastion（原 Tempest Bastion） | 飓风坚壁丢了「暴风」「盾」；只把之换坚；英文留 Storm |
| uniques.json | Hellslayer | 地狱屠戮者 → 斩渊者 → 冥狱屠戮者 | Netherslayer（原 Abyss Hewer） | 斩渊者丢了「屠戮者」；地换冥；英文留 slayer |
| uniques.json | Schaefer's Hammer | 舍费尔之锤 → 谢孚的战锤 → 奢斐勒的战锤 | Shaevel's Sledge（原 Shiefu's Sledge） | 音译随术语表（谢孚→奢斐勒，Shiefu→Shaevel） |
| uniques.json | The Cranium Basher | 碎颅 → 千钧裂颅 → 千钧碎颅 | The Cranium Pounder（原 Thousandweight Skullrender） | 千钧裂颅把「碎」也换了；整个留下，加千钧；英文留 Cranium |
| uniques.json | Lightsabre | 光之军刀 → 辉光弯刀 → 光之弯刀 | Lightbrand（原 Radiant Curveblade） | 辉光弯刀把「光之」打乱了；只把军换弯；英文留 Light，避开电影的 lightsaber |
| uniques.json | Doombringer | 末日使者 → 引劫者 → 末日信使 | Doomherald（原 Harbinger of Calamity） | 引劫者丢了「末日」；留下，使者换信使；英文留 Doom |
| uniques.json | The Grandfather | 祖父 → 曾祖（不变） | The Grandsire（原 Eldest Forebear） | 英文 Eldest Forebear 两个词都换了；留 Grand |
| uniques.json | Wizardspike | 巫师之刺 → 秘咒之棘 → 巫师之棘 | Wizardthorn（原 Hexthorn） | 秘咒之棘丢了「巫师」；留下，刺换棘；英文留 Wizard |
| uniques.json | Constricting Ring | 紧缩之戒 → 绞缚指环 → 紧缚之戒 | Constricting Band（原 Throttling Band） | 绞缚指环丢了「紧」「之戒」；只把缩换缚；英文留 Constricting |
| uniques.json | Stormspire | 风暴穹窿 → 擎雷之塔 → 风暴穹顶 | Stormtower（原 Boltbearer's Tower） | 擎雷之塔全换了；留「风暴穹」，窿换顶；英文留 Storm |
| uniques.json | Eaglehorn | 鹰之号角 → 苍鹰角弓 → 苍鹰号角 | Eagle Clarion（原 Goshawk Hornbow） | 苍鹰角弓丢了「号角」；留下，之换苍；英文留 Eagle |
| uniques.json | Windforce | 风之力 → 逐风之怒 → 长风之力 | Windmight（原 Galechaser's Wrath） | 逐风之怒、Galechaser's Wrath 是规则 2 的反例；照 style.md、style-en.md 的例子 |
| uniques.json | Bul-Kathos' Wedding Band | 布尔凯索的婚戒 → 波勒迦托的誓戒 → 波勒铠梭的誓戒 | Bol-Khatos' Oathring（原 Bolegath's Oathring） | 音译随术语表（波勒迦托→波勒铠梭，Bolegath→Bol-Khatos） |
| uniques.json | The Cat's Eye | 猫眼 → 玄猫之瞳 → 猫瞳 | The Cat's Iris（原 Pupil of the Sable Lynx） | 玄猫之瞳多了两字；眼换瞳；英文留 Cat |
| uniques.json | The Rising Sun | 旭日 → 东升烈日（不变） | The Ascending Sun（原 Eastborn Dayblaze） | 英文 Eastborn Dayblaze 两个词都换了；留 Sun |
| uniques.json | Crescent Moon | 新月 → 钩月寒光 → 弦月 | Horned Moon（原 Horned Moon's Wintry Sheen） | 钩月寒光多了两字，钩月又是符文之语的名字；新换弦；英文留 Moon |
| uniques.json | Mara's Kaleidoscope | 玛拉的万花筒 → 茉菈的千华镜（不变） | Marlah's Thousandfold Mirror（原 Molah's Thousandfold Mirror） | 音译随术语表（Molah→Marlah） |
| uniques.json | Atma's Scarab | 阿特玛的圣甲虫 → 娅忒嫚的圣蜣 → 娅忒嫚的神甲虫 | Atemane's Sacred Beetle（原 Yatemane's Sacred Beetle） | 蜣是生僻字；留「甲虫」，圣换神；音译随术语表（Yatemane→Atemane） |
| uniques.json | Dwarf Star | 矮人之星 → 侏星余烬 → 矮人之辰 | Dwarf Sun（原 Dimstar Ember） | 侏星余烬认不出矮人之星；星换辰；英文留 Dwarf |
| uniques.json | Raven Frost | 乌鸦之霜 → 鸦羽凝霜 → 乌鸦凝霜 | Raven Rime（原 Hoarglazed Rookquill） | 鸦羽凝霜丢了「乌」；留「乌鸦」「霜」，之换凝；英文留 Raven |
| uniques.json | Highlord's Wrath | 大君之怒 → 霸君震怒 → 霸君之怒 | Highlord's Anger（原 Hegemon's Thundering Fury） | 霸君震怒丢了「之怒」；只把大换霸；英文留 Highlord |
| uniques.json | Saracen's Chance | 撒拉森的胜机 → 萨罗逊之运（不变） | Salosun's Luck（原 Salosun's Fortune） | 英文 Fortune 是 Gheed's Fortune 的词；换 Luck |
| uniques.json | Arreat's Face | 亚瑞特之貌 → 阿列忒岩颜 → 阿睿忒岩颜 | Arrieth's Crag Visage（原 Alieth's Crag Visage） | 音译随术语表（阿列忒→阿睿忒，Alieth→Arrieth） |
| uniques.json | Homunculus | 魔胎 → 瓮中胎 → 妖胎 | Vat Homunculus（原 Urnchild） | 瓮中胎丢了「魔」，英文 Urnchild 丢了 Homunculus；魔换妖；英文留下，加 Vat |
| uniques.json | Titan's Revenge | 泰坦的复仇 → 堤丹的血债 → 太丹的报复 | Taedan's Vengeance（原 Dydan's Blood Debt） | 血债离复仇远；复仇换报复；英文 Blood Debt 换 Vengeance；音译随术语表（堤丹→太丹，Dydan→Taedan） |
| uniques.json | Lycander's Aim | 莱姗德的远击 → 莉坎朵的神射 → 睐珊朵的远射 | Likando's Mark（原 Likando's Unerring Shaft） | 神射离远击远；击换射；英文 Unerring Shaft 换 Mark；音译随术语表（莉坎朵→睐珊朵） |
| uniques.json | Lycander's Flank | 莱姗德的侧击 → 莉坎朵的翼袭 → 睐珊朵的侧袭 | Likando's Flanking（原 Likando's Wingstrike） | 翼袭丢了「侧」；击换袭；英文留 Flank；音译随术语表（莉坎朵→睐珊朵） |
| uniques.json | The Oculus | 海妖之瞳 → 沧溟巨瞳 → 海魅之瞳 | The Abyssal Oculus（原 The Fathomless Eye） | 沧溟巨瞳全换了；留「海」「之瞳」，妖换魅；英文留 Oculus |
| uniques.json | Herald of Zakarum | 萨卡兰姆的使者 → 札迦仑传谕使 → 札喀仑传谕使 | Zakhalun Edictbearer（原 Zajalun Edictbearer） | 音译随术语表（札迦仑→札喀仑，Zajalun→Zakhalun） |
| uniques.json | Jalal's Mane | 狼王之鬃 → 头狼之鬣 → 狼王之鬣 | Packlord's Mane（原 Packleader's Ruff） | 头狼之鬣丢了「狼王」；留下，鬃换鬣；英文留 Mane |
| uniques.json | The Scalper | 头皮剥离者 → 揭颅者 → 头皮剥除者 | The Scalp Flayer（原 Skullflayer） | 揭颅者全换了；留「头皮剥」「者」，离换除；英文留 Scalp |
| uniques.json | Bloodmoon | 血月 → 猩红之月 → 绯月 | Scarlet Moon（原 Crimson Eclipse） | 猩红之月多了两字；血换绯（同绯鸦）；英文留 Moon |
| uniques.json | Djinn Slayer | 邪灵斩 → 屠灵者 → 邪灵屠 | Djinn Hewer（原 Spiritbutcher） | 屠灵者丢了「邪」；只把斩换屠；英文留 Djinn |
| uniques.json | Deathbit | 死亡之吻 → 黄泉一吻 → 夺命之吻 | Deathkiss（原 Netherspring Kiss） | 黄泉一吻要多绕一层；死亡换夺命；英文留 Death |
| uniques.json | Warshrike | 战争伯劳鸟 → 烽火伯劳 → 战火伯劳鸟 | Battleshrike（原 Beaconfire Shrike） | 烽火伯劳丢了「战」；只把争换火；英文留 shrike |
| uniques.json | Gut Siphon | 碎胆 → 汲腑 → 裂胆 | Entrail Siphon（原 Entrail Windlass） | 汲腑认不出碎胆；碎换裂；英文留 Siphon |
| uniques.json | Razor's Edge | 剃刀之锋 → 剃骨锋 → 剃刀之刃 | Razor's Bite（原 Boneshaver） | 剃骨锋丢了「刀」；只把锋换刃；英文留 Razor |
| uniques.json | Demon Limb | 恶魔断肢 → 殒魔之臂 → 恶魔残肢 | Demon Arm（原 Arm of the Slain Fiend） | 殒魔之臂全换了；留「恶魔」「肢」，断换残；英文留 Demon |
| uniques.json | Steel Shade | 钢罩 → 玄铁影罩 → 钢影罩 | Steel Cowl（原 Blackiron Shadowcowl） | 玄铁影罩丢了「钢」；留「钢」「罩」，加影；英文留 Steel |
| uniques.json | Tomb Reaver | 墓穴劫掠者 → 劫冢者 → 墓穴盗掠者 | Tomb Despoiler（原 Despoiler of Barrows） | 劫冢者全换了；留「墓穴」「掠者」，劫换盗；英文留 Tomb |
| uniques.json | Death's Web | 死亡迷网 → 冥蛛罗网 → 死亡蛛网 | Death's Gossamer（原 Gravespinner's Snare） | 冥蛛罗网丢了「死亡」；留下，迷换蛛；英文留 Death |
| uniques.json | Nature's Peace | 大自然的安宁 → 万物宁和 → 大自然的宁静 | Nature's Calm（原 Concord of All Things） | 万物宁和全换了；留「大自然的」「宁」；英文留 Nature |
| uniques.json | Azurewrath | 碧蓝怒火 → 苍冥之怒 → 湛蓝怒火 | Azurerage（原 Firmament's Ire） | 苍冥之怒全换了；留「蓝」「怒火」，碧换湛；英文留 Azure |
| uniques.json | Seraph's Hymn | 炽天使的圣歌 → 六翼颂歌 → 炽天使的颂歌 | Seraph's Canticle（原 Sixwing Canticle） | 六翼颂歌丢了「炽天使」/ Seraph；留下，圣换颂 |
| uniques.json | Fleshripper | 血肉割裂者 → 剐肉者 → 血肉剐裂者 | Fleshtearer（原 Sinewcarver） | 剐肉者丢了「血」「裂者」；只把割换剐；英文留 Flesh |
| uniques.json | Horizon's Tornado | 地平线的龙卷风 → 天涯飙风 → 地平线的飓风 | Horizon's Cyclone（原 Worldrim Gale） | 天涯飙风丢了「地平线」；留下，龙卷风换飓风；英文留 Horizon |
| uniques.json | Stone Crusher | 碎石者 → 崩岳者 → 碎岩者 | Rock Crusher（原 Mountainfeller） | 崩岳者全换了；只把石换岩；英文留 Crusher |
| uniques.json | Jade Talon | 碧玉爪 → 玉隼之爪 → 翠玉爪 | Jade Claw（原 Jadehawk Claw） | 玉隼之爪丢了「碧」；只把碧换翠；英文留 Jade |
| uniques.json | Shadow Dancer | 影舞者 → 影中舞步 → 影中舞者 | Dusk Dancer（原 Dance in the Gloom） | 影中舞步丢了「者」；整个留下，加中；英文留 Dancer |
| uniques.json | Cerebus' Bite | 冥犬的撕咬 → 三首犬之噬 → 冥犬的噬咬 | Cerberus' Maw（原 The Threefold Maw） | 三首犬之噬丢了「冥犬」；留下，撕换噬；英文留神话里的 Cerberus（原名拼作 Cerebus） |
| uniques.json | Tyrael's Might | 泰瑞尔的力量 → 提睿埃的威能（不变） | Tiruel's Majesty（原 Tiruai's Majesty） | 音译随术语表（Tiruai→Tiruel） |
| uniques.json | Soul Drainer | 吸魂者 → 啜魂之握 → 啜魂者 | Soul Sipper（原 Soulsipper's Grasp） | 啜魂之握丢了「者」；只把吸换啜；英文留 Soul |
| uniques.json | Rune Master | 符文大师 → 镌符巨匠 → 符文宗师 | Runewright（原 Glyphwright） | 镌符巨匠全换了；留「符文」「师」，大换宗；英文留 Rune |
| uniques.json | Death Cleaver | 死亡切肉斧 → 断魂屠刀 → 死亡剁肉斧 | Grave Cleaver（原 Soulsever Hackblade） | 断魂屠刀全换了；留「死亡」「肉斧」，切换剁；英文留 Cleaver |
| uniques.json | Executioner's Justice | 行刑者的裁决 → 刑吏的公义 → 行刑者的判决 | Executioner's Judgment（原 The Headsman's Due） | 刑吏的公义全换了；留「行刑者的」「决」，裁换判；英文留 Executioner |
| uniques.json | Stoneraven | 石鸦 → 岩栖之鸦 → 岩鸦 | Stonerook（原 Cragroost Crow） | 岩栖之鸦多了两字；石换岩；英文留 Stone，鸦＝Rook |
| uniques.json | Leviathan | 利维坦 → 勒韦屯 → 勒韦滩 | Livyatan（原 Lewetun） | 音译随术语表（勒韦屯→勒韦滩，Lewetun→Livyatan） |
| uniques.json | Wisp Projector | 鬼火投影 → 引魂磷灯 → 鬼火映影 | Wisp Lantern（原 Soulguide Lantern） | 引魂磷灯全换了；留「鬼火」「影」，投换映；英文留 Wisp |
| uniques.json | Gargoyle's Bite | 石像鬼之牙 → 檐兽之噬 → 石像鬼之齿 | Gargoyle's Fang（原 Eavesbeast's Fang） | 檐兽之噬要绕一道「石像鬼即檐兽」；留下，牙换齿；英文留 Gargoyle |
| uniques.json | Lacerator | 撕裂者 → 裂创者（不变） | Lacerating Hewer（原 Woundsplitter） | 英文 Woundsplitter 丢了 Lacerat-；留下，加 Hewer（斧） |
| uniques.json | Mang Song's Lesson | 宋满的教训 → 芒颂的戒尺 → 颂芒的训诫 | Mahng Seung's Teaching（原 Mahng Sung's Ferule） | 戒尺换了意象；教训换训诫；英文 Ferule 是词典词，换 Teaching；音译随术语表（芒颂→颂芒，Mahng Sung→Mahng Seung） |
| uniques.json | Viperfork | 蛇信长枪 → 蝰牙叉 → 蛇信长矛 | Adderfork（原 Asp-Fanged Fork） | 蝰牙叉全换了；留「蛇信长」，枪换矛；英文留 fork |
| uniques.json | Ethereal Edge | 无形之锋 → 虚灵之刃 → 无形之刃 | Ethereal Blade（原 Blade of the Unbodied） | 虚灵之刃丢了「无形」；留下，锋换刃；英文留 Ethereal |
| uniques.json | Demonhorn's Edge | 恶魔角锋 → 妖角之刃 → 恶魔角刃 | Demonhorn's Barb（原 Hellhorn Blade） | 妖角之刃丢了「恶魔」；只把锋换刃；英文留 Demonhorn |
| uniques.json | The Reaper's Toll | 死神丧钟 → 冥镰晚钟 → 冥神丧钟 | The Reaper's Peal（原 Gravescythe Vespers） | 冥镰晚钟丢了「丧钟」；留「神丧钟」，死换冥；英文留 Reaper |
| uniques.json | Spirit Keeper | 灵体守护者 → 守灵人 → 灵魂守护者 | Spirit Steward（原 Warden of the Bier） | 守灵人认不出灵体守护者；只把体换魂；英文留 Spirit |
| uniques.json | Hellrack | 地狱刑器 → 九幽拷架 → 炼狱刑器 | Purgatory Rack（原 Rack of the Nine Depths） | 九幽拷架全换了；留「狱刑器」，地换炼；英文留 Rack（Netherrack 撞《我的世界》） |
| uniques.json | Alma Negra | 黑魂 → 玄魄 → 黑魄 | Alma Oscura（原 Sable Anima） | 玄魄丢了「黑」；只把魂换魄（也避开「黑魂」）；英文留西班牙文 Alma，Negra 换 Oscura |
| uniques.json | Darkforce Spawn | 魔力肇生 → 冥渊之裔 → 魔力孽生 | Darkforce Scion（原 Nethergulf Scion） | 冥渊之裔全换了；只把肇换孽；英文留 Darkforce |
| uniques.json | Widowmaker | 寡妇制造者 → 造孀者 → 寡妇缔造者 | Sower of Widows（不变） | 造孀者丢了「寡妇」；只把制换缔 |
| uniques.json | Blood Raven's Charge | 血鸦的冲锋 → 绯鸦的突袭 → 绯鸦的冲锋 | Scarlet Raven's Charge（原 Scarlet Rook's Raid） | 血鸦照怪物表作「绯鸦」/ Scarlet Raven，突袭换回冲锋；英文留 Raven、Charge |
| uniques.json | Ghostflame | 魂焰 → 幽冥火 → 鬼焰 | Ghostfire（原 Sepulchral Flame） | 幽冥火丢了「焰」；只把魂换鬼；英文留 Ghost |
| uniques.json | Shadow Killer | 影弑 → 诛影者 → 影诛 | Shadow Slayer（原 Smiter of Shades） | 诛影者多了一字；弑换诛；英文留 Shadow |
| uniques.json | Gimmershred | 寒铁飞刃 → 霜芒碎骨 → 寒钢飞刃 | Glintshred（原 Frostglint Shatterbone） | 霜芒碎骨全换了；留「寒」「飞刃」，铁换钢；英文留 shred |
| uniques.json | Griffon's Eye | 狮鹫之眼 → 翼狮之眸 → 狮鹫之眸 | Griffon's Glance（原 Winged Lion's Glare） | 翼狮之眸要绕「狮鹫即翼狮」；留「狮鹫之」，眼换眸；英文留 Griffon |
| uniques.json | Windhammer | 风锤 → 啸风巨槌 → 啸风锤 | Windmaul（原 Galehowl Maul） | 啸风巨槌多了两字；整个留下，加啸；英文留 Wind |
| uniques.json | Thunderstroke | 雷击 → 霹雳一掷 → 雷掷 | Thunderthrow（原 Levincast） | 霹雳一掷丢了「雷」；击换掷（底材标枪）；英文留 Thunder |
| uniques.json | Demon's Arch | 恶魔扑击 → 妖魔掠空 → 恶魔掠击 | Demon's Vault（原 Skysweeping Fiend） | 妖魔掠空丢了「恶」「击」；只把扑换掠；英文留 Demon |
| uniques.json | Boneflame | 骨焰 → 燃髓之焰 → 骨火 | Bonepyre（原 Marrowblaze） | 燃髓之焰丢了「骨」；焰换火；英文留 Bone |
| uniques.json | Steel Pillar | 钢铁支柱 → 镔铁脊梁 → 钢铁梁柱 | Steel Column（原 Damask Backbone） | 镔铁脊梁丢了「钢」「柱」；只把支换梁；英文留 Steel |
| uniques.json | Nightwing's Veil | 夜翼面纱 → 夜枭之帷 → 夜羽面纱 | Nightfeather's Veil（原 Duskowl's Pall） | 夜枭之帷丢了「面纱」；翼换羽（也避开 DC 的夜翼）；英文留 Night、Veil |
| uniques.json | Crown of Ages | 年纪之冠 → 岁月之冕 → 年岁之冠 | Crown of Eons（原 Timeworn Diadem） | 岁月之冕两处都换；只把纪换岁；英文留 Crown |
| uniques.json | Andariel's Visage | 安达莉尔的仪容 → 昂妲蕾的魔颜（不变） | Angdarael's Fell Countenance（原 Angdalae's Fell Countenance） | 音译随术语表（Angdalae→Angdarael） |
| uniques.json | Dragonscale | 龙鳞 → 逆鳞 → 龙之逆鳞 | Wyrmscale（原 The Upturned Scale） | 逆鳞要绕一道典故；加「龙之」；英文留 scale |
| uniques.json | Steel Carapace | 钢铁甲壳 → 铁鳌之壳 → 钢铁鳌壳 | Steel Shell（原 Shell of the Iron Tortoise） | 铁鳌之壳为了英文不撞 Iron 把钢换了；Steel 是这一行该留的词，留「钢铁」，甲换鳌 |
| uniques.json | Ravenlore | 乌鸦的智慧 → 渡鸦秘传 → 渡鸦的智慧 | Ravencraft（原 Rook's Hidden Rites） | 渡鸦秘传丢了「的智慧」；只把乌换渡；英文留 Raven |
| uniques.json | Boneshade | 白骨阴魂 → 枯骨幽影 → 白骨幽魂 | Bonewraith（原 Marrowless Umbra） | 枯骨幽影丢了「白」「魂」；只把阴换幽；英文留 Bone |
| uniques.json | Flamebellow | 怒焰咆哮 → 炽炎狂啸 → 怒火咆哮 | Flameroar（原 Howling Conflagration） | 炽炎狂啸全换了；留「怒」「咆哮」，焰换火；英文留 Flame |
| uniques.json | Death's Fathom | 死亡深渊 → 亡者之渊 → 死亡幽渊 | Death's Abyss（原 Abyss of the Perished） | 亡者之渊丢了「死」；只把深换幽；英文留 Death |
| uniques.json | Wolfhowl | 狼嚎 → 苍狼长嗥 → 狼啸 | Wolfcall（原 Ululation of the Ashen Pack） | 苍狼长嗥多了两字；嚎换啸；英文留 Wolf，Ululation 是词典词 |
| uniques.json | Spirit Ward | 灵体守护 → 魂灵壁垒 → 灵体守卫 | Spirit Sentinel（原 Redoubt of the Unquiet） | 魂灵壁垒全换了；留「灵体守」，护换卫；英文留 Spirit |
| uniques.json | Kira's Guardian | 奇拉的守护 → 绮蕾的庇护（不变） | Kireth's Protector（原 Chilae's Refuge） | 英文 Refuge 已是 Gerke's Sanctuary 的英文；换 Protector；音译随术语表（Chilae→Kireth） |
| uniques.json | Ormus' Robes | 奥玛斯的法袍 → 欧牧司的秘袍（不变） | Aurmos' Arcane Raiment（原 Oumusi's Arcane Raiment） | 音译随术语表（Oumusi→Aurmos） |
| uniques.json | Gheed's Fortune | 基德的好运 → 吉伊得的横财（不变） | Ghiyed's Windfall（原 Jiyed's Windfall） | 音译随术语表（Jiyed→Ghiyed） |
| uniques.json | Stormlash | 风暴之鞭 → 狂岚鞭笞 → 风暴长鞭 | Stormscourge（原 Flaying Squall） | 狂岚鞭笞丢了「风暴」；只把之换长；英文留 Storm |
| uniques.json | Halaberd's Reign | 死亡女神的统治 → 冥后的王权 → 死亡女神的王权 | Grave Queen's Reign（原 Grave Queen's Dominion） | 冥后的王权丢了「死亡女神」；留下，统治换王权；英文留 Reign |
| uniques.json | Spike Thorn | 尖刺荆棘 → 刺棘藩篱 → 尖刺荆藤 | Spike Bramble（原 Bramble Palisade） | 刺棘藩篱全换了；留「尖刺荆」，棘换藤；英文留 Spike |
| uniques.json | Dracul's Grasp | 德古拉之握 → 卓库勒的血掌 → 铎谷勒的血掌 | Drokhul's Bloodpalm（原 Zhokul's Bloodpalm） | 音译随术语表（卓库勒→铎谷勒，Zhokul→Drokhul） |
| uniques.json | Frostwind | 冰霜之风 → 凛霜朔风 → 冰霜朔风 | Frostgale（原 Northgale of Bitter Rime） | 凛霜朔风丢了「冰」；留「冰霜」「风」，之换朔；英文留 Frost |
| uniques.json | Templar's Might | 圣殿骑士之力 → 圣所卫士之威 → 圣殿骑士之威 | Templar's Power（原 Sanctum Warden's Majesty） | 圣所卫士之威丢了「圣殿骑士」；留下，力换威；英文留 Templar |
| uniques.json | Eschuta's Temper | 艾丝屈塔的脾气 → 埃舒妲的嗔怒 → 埃舒妲的脾性 | Aishuda's Temperament（原 Aishuda's Ire） | 嗔怒离脾气远；气换性；英文 Ire 是 Chromatic Ire 的词 |
| uniques.json | Firelizard's Talons | 火蜥蜴之爪 → 焰蜥利爪 → 火蜥蜴利爪 | Firelizard's Claws（原 Cinderscale Claws） | 焰蜥利爪丢了「火蜥蜴」；留下，之换利；英文留 Firelizard |
| uniques.json | Sandstorm Trek | 沙暴之旅 → 风沙跋涉 → 沙暴之途 | Sandstorm March（原 Driftsand Wayfaring） | 风沙跋涉全换了；留「沙暴之」，旅换途；英文留 Sandstorm |
| uniques.json | Marrowwalk | 骨髓行走 → 骸髓之履 → 骨髓行者 | Marrowstride（原 Bonepith Treads） | 骸髓之履丢了「骨」「行」；走换者；英文留 Marrow |
| uniques.json | Heaven's Light | 天堂之光 → 天穹圣辉 → 天堂之辉 | Heaven's Brilliance（原 Radiance of the Firmament） | 天穹圣辉丢了「天堂之」；只把光换辉；英文留 Heaven |
| uniques.json | Arachnid Mesh | 蜘蛛网纹 → 毒蛛丝网 → 蜘蛛丝纹 | Arachnid Lattice（原 Venomsilk Lattice） | 毒蛛丝网丢了「蜘蛛」「纹」；只把网换丝；英文留 Arachnid |
| uniques.json | Nosferatu's Coil | 吸血圣王之圈 → 饮血魔君之环 → 吸血圣王之环 | Bloodlord's Coil（原 Blood Tyrant's Girdle） | 饮血魔君之环全换了；留「吸血圣王之」，圈换环；英文留 Coil（Nosferatu 是电影名） |
| uniques.json | Metalgrid | 金属网格 → 钢铁经纬 → 金属网栅 | Metalgrate（原 Steel Warp and Weft） | 钢铁经纬认不出金属网格；格换栅；英文留 Metal |
| uniques.json | Verdungo's Hearty Cord | 行刑者的绞首绳 → 刽子手的缢索 → 行刑者的绞索 | Hangman's Hearty Cord（原 Executioner's Halter） | 刽子手的缢索全换了；留「行刑者的绞」，首绳换索；英文留 Hearty Cord，Verdungo 照官方意译作 Hangman |
| uniques.json | Carrion Wind | 腐肉之风 → 腐尸阴风 → 腐肉阴风 | Carrion Gale（原 Charnel Gloomwind） | 腐尸阴风丢了「腐肉」；只把之换阴；英文留 Carrion |
| uniques.json | Giant Skull | 巨型颅骨 → 巨灵遗颅 → 巨人颅骨 | Giant Cranium（原 Cranium of the Colossus） | 巨灵遗颅全换了；留「巨」「颅骨」，型换人；英文留 Giant |
| uniques.json | Astreon's Iron Ward | 阿斯特隆的陨铁杖 → 埃垂昂的铁符 → 埃思忒昂的陨铁权杖 | Aesthrion's Iron Sigil（原 Aechrion's Iron Sigil） | 铁符离陨铁杖远；杖换权杖；音译随术语表（埃垂昂→埃思忒昂，Aechrion→Aesthrion） |
| uniques.json | Annihilus | 毁灭 → 寂灭（不变） | Silent Annihilation（原 The Silent Unmaking） | 英文 The Silent Unmaking 丢了 Annihil-；Annihilus 又是漫威反派名，取 Annihilation 加 Silent（同中文寂灭） |
| uniques.json | Arioc's Needle | 艾里欧克之针 → 阿瑞厄格之锥 → 埃理鸥格之锥 | Arriogh's Lancet（原 Aruegh's Lancet） | 音译随术语表（阿瑞厄格→埃理鸥格，Aruegh→Arriogh） |
| uniques.json | Cranebeak | 鹤嘴锄 → 铁鹤之喙 → 鹤嘴镐 | Cranebill（原 Ironcrane's Bill） | 铁鹤之喙丢了「鹤嘴」；只把锄换镐（底材战镐）；英文留 Crane |
| uniques.json | Nord's Tenderizer | 北方人的碎肉棒 → 北蛮的捶肉棍 → 北方人的捶肉棒 | Northman's Tenderizer（原 Northbrute's Fleshpounder） | 北蛮的捶肉棍丢了「北方人」；只把碎换捶；英文留 Tenderizer |
| uniques.json | Earth Shifter | 撼地者 → 移山者 → 撼地巨槌 | Earth Heaver（原 Uprooter of Peaks） | 移山者认不出撼地者；者换巨槌（也避开 DotA 的撼地者）；英文留 Earth |
| uniques.json | Wraith Flight | 怨灵飞行 → 怨魂疾翔 → 怨灵飞翔 | Wraith Swoop（原 Vengeful Shade's Swoop） | 怨魂疾翔丢了「灵」「飞」；只把行换翔；英文留 Wraith |
| uniques.json | Bonehew | 斩骨 → 斫骸者 → 斫骨 | Bonecleave（原 Cleaver of the Unburied） | 斫骸者丢了「骨」；斩换斫；英文留 Bone |
| uniques.json | Ondal's Wisdom | 温达的智慧 → 翁德的睿智（不变） | Ondamir's Sagacity（原 Wengde's Sagacity） | 音译随术语表（Wengde→Ondamir） |
| uniques.json | The Redeemer | 救赎者 → 赎世者（不变） | Redeemer of the World（原 Absolver of the World） | 英文 Absolver of the World 丢了 Redeemer；留下（同中文赎世者） |
| uniques.json | Head Hunter's Glory | 猎头者的荣耀 → 猎颅者的荣光 → 猎颅者的荣耀 | Skull Hunter's Glory（原 Skullstalker's Renown） | 猎颅者的荣光两处都换；留「荣耀」，头换颅（避开「猎头」的今义）；英文留 Hunter's Glory |
| uniques.json | Steelrend | 碎钢 → 裂钢之握 → 裂钢 | Steelsunder（原 Grip of Sundered Steel） | 裂钢之握多了两字；碎换裂；英文留 Steel |
| uniques.json | Rainbow Facet | 彩虹魔石 → 七彩棱晶 → 彩虹晶石 | Rainbow Prism（原 Sevenhue Prism） | 七彩棱晶丢了「彩虹」；留下，魔换晶；英文留 Rainbow |
| uniques.json | Hellfire Torch | 地狱火炬 → 冥狱燃炬 → 冥狱火炬 | Netherfire Torch（原 Nethergaol Cresset） | 冥狱燃炬丢了「火炬」；留「狱火炬」，地换冥；英文留 fire、Torch |
| uniques.json | Ars Dul'Mephistos | （无） → 迷弗忒禁典 → 迷斐思陀禁典 | Mefistor's Forbidden Codex（原 Miphoth's Forbidden Codex） | 音译随术语表（迷弗忒→迷斐思陀，Miphoth→Mefistor） |
| uniques.json | Measured Wrath | （无） → 沉敛之怒（不变） | Measured Anger（原 Seething Composure） | 英文 Seething Composure 两个词都换了；留 Measured |
| uniques.json | Dreadfang | （无） → 骇魄獠牙（不变） | Dreadtusk（原 Soulfright Tusk） | 英文 Soulfright Tusk 丢了 Dread；留下，fang 换 tusk（獠牙＝Tusk） |
| uniques.json | Wraithstep | （无） → 鬼影潜踪（不变） | Wraithpace（原 Lurking Visitant） | 英文 Lurking Visitant 两个词都换了；留 Wraith |
| uniques.json | Bloodpact Shard | （无） → 背信残锋 → 血盟残锋 | Bloodbond Shard（原 Broken Edge of the Faithless） | 背信残锋丢了「血」，英文全换了；留「血」「残锋」，契换盟；英文留 Blood、Shard |
| uniques.json | Sling | （无） → 掷石之环（不变） | Stone Sling（原 Stonehurler's Loop） | 英文 Stonehurler's Loop 丢了 Sling；留下，加 Stone |
| uniques.json | Opalvein | （无） → 幻彩石脉（不变） | Opalseam（原 Lode of Shifting Hues） | 英文 Lode of Shifting Hues 丢了 Opal；留下，vein 换 seam |
| uniques.json | Entropy Locket | （无） → 朽灭之匣（不变） | Entropy Keepsake（原 Reliquary of Withering） | 英文 Reliquary of Withering 丢了 Entropy；留下，Locket 换 Keepsake |
| uniques.json | Gheed's Wager | （无） → 吉伊得的豪赌（不变） | Ghiyed's Great Gamble（原 Jiyed's Great Gamble） | 音译随术语表（Jiyed→Ghiyed） |
| uniques.json | Cold Rupture | 寒冰裂口 → 冻原之创 → 寒冰裂缝 | Cold Fracture（原 Tundra's Wound） | 冻原之创是新意象；留「寒冰裂」，口换缝；英文留 Cold（术士版 PreCrafted 同名，一起改） |
| uniques.json | Flame Rift | 火焰裂隙 → 焚焰裂罅 → 火焰裂罅 | Flame Chasm（原 Crevice of the Pyre） | 焚焰裂罅丢了「火」；只把隙换罅；英文留 Flame（术士版 PreCrafted 同名，一起改） |
| uniques.json | Crack of the Heavens | 天堂裂痕 → 天穹裂痕（不变） | Scar of the Heavens（原 Firmament's Scar） | 英文 Firmament's Scar 两处都换；留 Heavens（术士版 PreCrafted 同名，一起改） |
| uniques.json | Rotting Fissure | 腐烂裂迹 → 腐瘴地罅 → 腐朽裂迹 | Rotting Crevice（原 Miasmal Earthrent） | 腐瘴地罅全换了；留「腐」「裂迹」，烂换朽；英文留 Rotting（术士版 PreCrafted 同名，一起改） |
| uniques.json | Bone Break | 白骨裂纹 → 骸骨摧折 → 白骨碎纹 | Bone Shatter（原 Shattered Remains） | 骸骨摧折全换了；留「白骨」「纹」，裂换碎；英文留 Bone（术士版 PreCrafted 同名，一起改） |
| uniques.json | Black Cleft | 漆黑裂痕 → 幽玄裂谷 → 漆黑裂谷 | Black Ravine（原 The Umbral Ravine） | 幽玄裂谷丢了「漆黑」；留下，痕换谷；英文留 Black（术士版 PreCrafted 同名，一起改） |

## 稀有名词、随机暗金怪名字（rare-prefixes.json、rare-suffixes.json、monster-prefixes.json、monster-suffixes.json、monster-titles.json）

五个词库 347 条逐条对照官方中文和 Blizzard 英文重审（稀有第一词 45、第二词 155，怪物前缀 53、后缀 69、称号 25），改了下面 208 条（中文 170 条、英文 147 条），其余照旧。各行的 `note` 里记了曾用名和理由，旧 note 里替旧名辩护的话删了。

- 标准：这几张表是拼名字用的两三个字的词，照 `style.md`「稀有名词库」那条：两个字留一个、换一个（野兽 → 凶兽）。上一版多半两个字全换了（惊悚 → 战栗、厄运 → 凶兆、混沌 → 狂乱、撕咬 → 啮噬，护甲和饰品的词大都如此：头罩、披风、斗篷、项链、项圈），往回拉成留住官方的一个字；官方中文本身就是误译的（Warp 闪烁、Fiend 妖蝠、Trample 登山鞋、Bile 愤怒、Gore 角刺），中文对着官方中文留字，英文对着 Blizzard 英文起。
- 英文：上一版大多是生僻词或换了意象（Quietus、Murrain、Eidolon、Flenser、Cerecloth、Gadling、Cuisse、Rowel、Annulet、Volute、Carcanet、Psaltery；Behemoth、Omen、Ouroboros、Pentacle、Pennon、Jackal）。改成 Blizzard 词的常见近义词（Demise、Contagion、Fright、Lyre、Gaze），或者留下 Blizzard 的词再加一个词（Graveghoul、Runestone、Bonesaw、Deathmask、Heelspur、Batwing、Blackheart、Longtongue、Shapeshifter、Goadstaff）。单字的词不能就是 Blizzard 的词，所以总要加一个词或换近义词。
- 同一个官方词在两张表里的，现在中英文都一样：Bite 啮咬/Gnaw，Razor 剃刃/Shear，Spawn 孽嗣/Brood，Storm 雷暴/Thunderstorm，Shadow 幽影/Umbra，Warp 闪逝/Twist，Plague 疫疠/Contagion，Bone 枯骨/Marrowless，Soul 魂魄/Anima，Dread 惊怖/Fright，Doom 厄难/Downfall，Death 死灭/Demise，Chaos 混冥/Bedlam，Horn 犄角/Antler，Wing 蝠翼/Batwing，Fist 重拳/Pummel，Wraith 怨灵/Wraithling，Slayer 屠命者/Manslayer，Impaler 洞穿者/Transfixer，「碎击」（Sunder、Break）崩碎/Shatter；Steel 和魔法前缀同用精钢/Truesteel。
- 避开别处已有的名字：官方名（惊惧、混乱、骑枪、壁障、铁头棒、卑劣；Brute、Terror、Tempest、Pestilence、Starlight、Sorrow、Woe、Merciless、Vicious、Devilkin、Jab、Shelter、Truncheon、Cranium、Carver、Fleshrender），别的表里我们的名字（精魂、苍穹、磐岩、坚垒、贯刺者、剜肠、鬼影、锋芒；Lancet、Fleshtearer、Prong、Rawhide、Pendant、Neckguard、Outcry、Lament、Leer、Safeguard），别的作品和品牌（Phantasm 电影、Eidolon《最终幻想》、Creeper《我的世界》、Wolfskin 户外品牌）。
- `CHANGES-zh.md` 里在这五个文件的 4 条都改回：Steel 燧石 → 精钢，Devil 魍魉 → 邪鬼，Wight 祟尸 → 尸魅，the Destroyer 夷平者 → 灭绝者（见下表）。
- `d2-validate.mjs` 的「离 Blizzard 原名不超过 2 个字母」里这一组有 5 条，都是另一个词，不改：Wrecker（Breaker）、Trail（Track）、Rime（Ice）、Wail（Call）、the Ungodly（the Unholy）。
- 跟着要改的别处（不在这一组的文件里）：`style.md` 的例子「刽子手·晦冥蚀触」现在拼作「屠命者·晦暗蚀触」，`style-en.md` 的「Murk Canker the Sledge」不变，但它举的「Loll 为长舌改作 Slander」已改成 Longtongue；`suffixes.json` 的「厉鬼之」of the Ghast（Wraith）和称号原来同用厉鬼＝Ghast，称号现在是怨灵·/the Wraithling；`uniques.json` 的「鬼影潜踪」Visitant 原来和怪物前缀 Shadow 同词，怪物前缀现在是幽影/Umbra。

| 文件 | 原版 | 官方 → 旧名 → 新名 | 新英文名 | 为什么 |
| --- | --- | --- | --- | --- |
| rare-prefixes.json | Beast | 野兽 → 凶兽（不变） | Wildbeast（原 Behemoth） | 英文 Behemoth 是巨兽，另一个意象；Wildbeast 留着 Beast（Brute 是官方怪物名） |
| rare-prefixes.json | Eagle | 雄鹰 → 鹰隼（不变） | Raptor（原 Peregrine） | 英文 Peregrine 是游隼，认不出 Eagle；Raptor 猛禽，正是鹰隼 |
| rare-prefixes.json | Ghoul | 食尸鬼 → 腐鬼 → 啖尸鬼 | Graveghoul（原 Rotwight） | 腐鬼只剩一个鬼；留住「尸鬼」，食换啖；英文留着 Ghoul |
| rare-prefixes.json | Dread | 惊悚 → 战栗 → 惊怖 | Fright（原 Tremor） | 战栗/Tremor 换了意象；留「惊」，悚换怖；Fright 与怪物前缀同（惊惧是符文之语 Dread，Terror 是符文之语名） |
| rare-prefixes.json | Doom | 厄运 → 凶兆 → 厄难 | Downfall（原 Omen） | 凶兆/Omen 是征兆，另一个意象；留「厄」，运换难；与怪物前缀同 |
| rare-prefixes.json | Grim | 恶毒 → 阴森 → 阴毒 | Sinister（不变） | 阴森与「恶毒」无一字相同；留「毒」 |
| rare-prefixes.json | Bone | 白骨 → 朽骨 → 枯骨 | Marrowless（原 Charnel） | 与怪物前缀 Bone 同用枯骨＝Marrowless（后缀「枯骨铠之」也是）；Charnel 在别处是「骸」 |
| rare-prefixes.json | Death | 死亡 → 殒灭 → 死灭 | Demise（原 Quietus） | 殒灭不留「死」；Quietus 是只有词典才知道的词 |
| rare-prefixes.json | Shadow | 暗影 → 阴翳 → 幽影 | Umbra（原 Pall） | 阴翳/Pall 认不出暗影；留「影」，幽影＝Umbra，与套装「纳妲丽娅的幽影」一致；与怪物前缀同 |
| rare-prefixes.json | Storm | 风暴 → 雷暴（不变） | Thunderstorm（原 Thunderhead） | 中文留「暴」不变；英文 Thunderhead 是雷雨云，Thunderstorm 留着 Storm；与怪物前缀同（Tempest 是符文之语名） |
| rare-prefixes.json | Rune | 符文 → 秘符（不变） | Runestone（原 Cipher） | 英文 Cipher 是密码，认不出 Rune；Runestone 留着 Rune |
| rare-prefixes.json | Plague | 瘟疫 → 疫疠（不变） | Contagion（原 Murrain） | Murrain 是只有词典才知道的词（牲畜瘟）；Pestilence 是符文之语名，且是我们符文之语「黑瘟」的英文 |
| rare-prefixes.json | Wraith | 怨魂 → 鬼魅 → 怨灵 | Wraithling（原 Phantasm） | 鬼魅与「怨魂」无一字相同；留「怨」；英文 Phantasm 是电影名；与称号 the Wraith 同 |
| rare-prefixes.json | Spirit | 精神 → 灵焰 → 精魄 | Essence（原 Foxfire） | 灵焰/Foxfire 是鬼火，另一个意象；留「精」（精魂已是符文之语 Spirit 的名字） |
| rare-prefixes.json | Cruel | 暴虐 → 嗜虐（不变） | Ruthless（原 Fell） | 英文 Fell 作「凶残」是古义；Ruthless 一看就是 Cruel（Merciless、Vicious 是魔法前缀名） |
| rare-prefixes.json | Empyrian | 穹天 → 霄汉 → 穹霄 | Firmament（原 Zenith） | 霄汉不留「穹」；苍穹已是前缀 Azure；Zenith 是天顶，Firmament 天穹 |
| rare-prefixes.json | Bramble | 刺棘 → 蒺藜 → 棘丛 | Briar（原 Caltrop） | 蒺藜/Caltrop 是铁蒺藜，另一个意象；留「棘」，棘＝Briar，与「棘棒」一致 |
| rare-prefixes.json | Loath | 怨念 → 憎厌 → 怨憎 | Spite（不变） | 憎厌与「怨念」无一字相同；留「怨」，怨＝Spite，与怪物「怨魄」Spitewraith 一致 |
| rare-prefixes.json | Glyph | 雕纹 → 古篆 → 铭纹 | Hieroglyph（原 Carven） | 古篆不留「纹」，Carven 是形容词；铭纹只换一字；Hieroglyph 留着 Glyph |
| rare-prefixes.json | Imp | 顽魔 → 魍魉 → 顽鬼 | Impling（原 Bogle） | 魍魉与「顽魔」无一字相同，又和怪物前缀 Devil 同名；留「顽」；Impling 留着 Imp |
| rare-prefixes.json | Fiend | 妖蝠 → 凶煞 → 魔蝠 | Archfiend（原 Malefic） | 官方中文「妖蝠」是蝠，凶煞认不出；留「蝠」；英文对 Blizzard 的 Fiend，Archfiend 留着 Fiend，Malefic 是生僻形容词 |
| rare-prefixes.json | Dire | 恐怖 → 惨厉 → 恐骇 | Harrowing（不变） | 惨厉与「恐怖」无一字相同；留「恐」，骇＝Harrowing，与后缀「骇啸之」一致 |
| rare-prefixes.json | Soul | 灵魂 → 魂魄（不变） | Anima（原 Eidolon） | Eidolon 是生僻词，又是《最终幻想》的召唤兽；Anima 拉丁语的魂；与怪物前缀同 |
| rare-prefixes.json | Carrion | 食腐鸟 → 秃鹫 → 食腐鹫 | Vulture（不变） | 秃鹫没有「食腐」；留「食腐」，鸟换鹫 |
| rare-prefixes.json | Armageddon | 末日 → 灭世 → 末劫 | Apocalypse（原 Worldruin） | 灭世不留「末」；末劫；Worldruin 是硬拼的词，Apocalypse 一看就是 Armageddon |
| rare-prefixes.json | Havoc | 浩劫 → 肆虐 → 大劫 | Mayhem（原 Rampage） | 肆虐/Rampage 和「浩劫」无一字相同；留「劫」；Mayhem 是 Havoc 的近义词 |
| rare-prefixes.json | Entropy | 熵能 → 衰朽 → 熵蚀 | Decay（不变） | 衰朽不留「熵」，老玩家认的就是这个熵 |
| rare-prefixes.json | Chaos | 混沌 → 狂乱 → 混冥 | Bedlam（不变） | 狂乱与「混沌」无一字相同；留「混」（混乱是魔法前缀 Chaotic 的官方名） |
| rare-prefixes.json | Warp | 闪烁 → 畸变 → 闪逝 | Twist（原 Aberrant） | 官方中文「闪烁」，畸变认不出；留「闪」；英文对 Blizzard 的 Warp，Aberrant 是形容词；与怪物前缀同 |
| rare-prefixes.json | Corruption | 腐蚀 → 污秽 → 腐化 | Depravity（原 Filth） | 污秽与「腐蚀」无一字相同；留「腐」；Filth 认不出 Corruption（Corrosion 已是前缀 Corrosive 的词） |
| rare-suffixes.json | Bite | 撕咬 → 啮噬 → 啮咬 | Gnaw（不变） | 啮噬不留「咬」；与怪物后缀 Bite 同 |
| rare-suffixes.json | Scratch | 撕扯 → 爪痕 → 抓扯 | Scrape（原 Clawmark） | 爪痕与「撕扯」无一字相同；留「扯」；Scrape 是 Scratch 的近义词 |
| rare-suffixes.json | Scalpel | 解剖刀 → 剔刃 → 解尸刀 | Dissector（原 Flenser） | 剔刃与「解剖刀」无一字相同；留「解」和「刀」；Flenser 是只有词典才知道的词（Lancet 已是暗金「埃理鸥格之锥」的词） |
| rare-suffixes.json | Gutter | 开膛刀 → 剜肠 → 剖膛刀 | Disemboweler（原 Entrail） | 剜肠不留「膛」「刀」，又和暗金 Visceratuant 的「剜肠」同名；英文 Entrail 是内脏，Disemboweler 是开膛的人 |
| rare-suffixes.json | Razor | 剃刀 → 薄刃 → 剃刃 | Shear（原 Sliver） | 薄刃不留「剃」；刀换刃；与怪物后缀 Razor 同 |
| rare-suffixes.json | Saw | 利锯 → 锯刃 → 骨锯 | Bonesaw（原 Ripper） | 英文 Ripper 是官方怪物后缀名；Bonesaw 留着 Saw |
| rare-suffixes.json | Cleaver | 切肉者 → 屠刀 → 切骨者 | Bonecleaver（原 Hackblade） | 屠刀与「切肉者」无一字相同；留「切」「者」；Bonecleaver 留着 Cleaver |
| rare-suffixes.json | Sever | 切割者 → 断喉者 → 割喉者 | Throatcutter（不变） | 断喉者不留「切割」；留「割」，断换割 |
| rare-suffixes.json | Sunder | 碎击 → 崩摧 → 崩碎 | Shatter（原 Avalanche） | 崩摧不留「碎击」；Avalanche 是雪崩，另一个意象；与怪物后缀 Break 同（官方都是「碎击」） |
| rare-suffixes.json | Rend | 刮肉者 → 裂躯者 → 裂肉者 | Tearflesh（原 Fleshtearer） | 裂躯者不留「肉」；裂＝Tear，与暗金「裂股靴」Tearflank 一致（Fleshtearer 已是暗金 Fleshripper 的英文，Fleshrender 是官方暗金名） |
| rare-suffixes.json | Mangler | 残伤者 → 肢解者 → 残毁者 | Mutilator（原 Dismemberer） | 肢解者不留「残」；Mutilator 是 Mangler 的近义词 |
| rare-suffixes.json | Slayer | 屠杀者 → 诛戮者 → 屠命者 | Manslayer（原 Headsman） | 诛戮者不留「屠」「杀」；Headsman 是刽子手；Manslayer 留着 Slayer；与称号 the Slayer 同 |
| rare-suffixes.json | Spawn | 魔嗣 → 孽裔 → 孽嗣 | Brood（原 Scion） | 孽裔不留「嗣」；Scion 是贵族后裔；与怪物后缀 Spawn 同 |
| rare-suffixes.json | Gnash | 猛咬 → 切齿 → 猛噬 | Gnashtooth（原 Rictus） | 切齿不留「猛」；Rictus 是只有词典才知道的词；Gnashtooth 留着 Gnash |
| rare-suffixes.json | Star | 之星 → 之曜 → 之孤星 | Lornstar（原 Comet） | 之曜不留「星」；Comet 是彗星；与怪物前缀 Star 同用孤星＝Lornstar（Starlight 是符文之语名） |
| rare-suffixes.json | Blow | 强击 → 重创 → 重击 | Strike（原 Wound） | 重创不留「击」；英文 Wound 是官方怪物后缀名 |
| rare-suffixes.json | Bane | 之灾 → 之殃 → 之天灾 | Calamity（不变） | 之殃不留「灾」；留「灾」（灾祸是怪物前缀 Bane 的官方名） |
| rare-suffixes.json | Crusher | 暴砸兽 → 辗轧者 → 猛砸者 | Pulverizer（原 Millstone） | 辗轧者与「暴砸兽」无一字相同；留「砸」；Millstone 是磨盘，又和称号 the Mauler 撞词 |
| rare-suffixes.json | Breaker | 破坏者 → 破阵者（不变） | Wrecker（原 Onslaught） | 中文留「破」不变；英文 Onslaught 是冲锋，认不出 Breaker |
| rare-suffixes.json | Grinder | 碾破者 → 磨骨者 → 碾骨者 | Bonegrinder（原 Bonerasp） | 磨骨者不留「碾」；Bonerasp 是硬拼的词；Bonegrinder 留着 Grinder |
| rare-suffixes.json | Lance | 长枪 → 马槊 → 马枪 | Longspear（不变） | 马槊不留「枪」（骑枪是底材 Lance 的官方名） |
| rare-suffixes.json | Spike | 尖枪 → 芒刺 → 尖锥 | Spikehead（原 Thorn） | 芒刺不留「尖」；英文 Thorn 是官方怪物后缀名（Prong 已是暗金的词） |
| rare-suffixes.json | Impaler | 穿刺者 → 贯心者 → 洞穿者 | Transfixer（原 Heartpiercer） | 贯心者不留「穿」「刺」；贯刺者已是暗金 The Impaler 的名字；与称号 the Impaler 同 |
| rare-suffixes.json | Prod | 戳刺 → 锐锥 → 锥刺 | Awl（不变） | 锐锥不留「戳」「刺」；留「刺」（Jab 是官方技能名） |
| rare-suffixes.json | Scourge | 灾星 → 天谴 → 祸星 | Affliction（原 Damnation） | 天谴与「灾星」无一字相同；留「星」；Damnation 是天罚，Scourge 是祸害 |
| rare-suffixes.json | Wrack | 破坏 → 摧残 → 毁坏 | Ravage（不变） | 摧残与「破坏」无一字相同；留「坏」 |
| rare-suffixes.json | Fletch | 箭羽 → 雕翎 → 雕羽 | Feather（原 Pinion） | 雕翎不留「羽」；羽＝Feather，与「腐羽鸦」「夜羽面纱」一致；Pinion 是生僻词 |
| rare-suffixes.json | Nock | 弓结 → 弦扣 → 弓弦 | Bowstring（不变） | 弦扣与「弓结」无一字相同；留「弓」 |
| rare-suffixes.json | Horn | 角刺 → 犄角（不变） | Antler（原 Tine） | 中文留「角」不变；Tine 是鹿角的叉尖，生僻；与怪物后缀 Horn 同 |
| rare-suffixes.json | Quill | 刺针 → 翎针（不变） | Bristle（原 Hackle） | 中文留「针」不变；Hackle 是只有词典才知道的词 |
| rare-suffixes.json | Goad | 刺棒 → 驱策 → 刺杖 | Goadstaff（原 Horsewhip） | 驱策与「刺棒」无一字相同；留「刺」；Horsewhip 是马鞭；Goadstaff 留着 Goad（Oxgoad 只比 Goad 多两个字母） |
| rare-suffixes.json | Call | 呼唤 → 招魂 → 唤魂 | Soulcall（原 Summoning） | 招魂不留「唤」；Summoning 是官方技能树名；Soulcall 留着 Call |
| rare-suffixes.json | Cry | 哭喊 → 悲号 → 哭号 | Weeping（原 Lament） | 悲号不留「哭」「喊」，又是暗金「娅忒嫚的悲号」的词；Lament 是暗金 Ume's Lament 的词 |
| rare-suffixes.json | Chant | 吟唱 → 颂祷 → 吟诵 | Litany（不变） | 颂祷与「吟唱」无一字相同；留「吟」 |
| rare-suffixes.json | Weaver | 编织者 → 织咒者（不变） | Hexspinner（原 Cursewright） | 中文留「织」「者」不变；Cursewright 认不出 Weaver；咒＝Hex，与「邪咒」一致 |
| rare-suffixes.json | Gnarl | 狂啸 → 怒嗥 → 怒啸 | Howl（不变） | 怒嗥与「狂啸」无一字相同；留「啸」 |
| rare-suffixes.json | Visage | 面罩 → 狞颜 → 狞面 | Grimace（不变） | 狞颜不留「面」 |
| rare-suffixes.json | Crest | 头冠 → 盔缨 → 羽冠 | Plume（不变） | 盔缨与「头冠」无一字相同；留「冠」 |
| rare-suffixes.json | Veil | 面纱 → 黑纱（不变） | Blackveil（原 Mourning） | 中文留「纱」不变；Mourning 是服丧，认不出 Veil |
| rare-suffixes.json | Hood | 头罩 → 风帽 → 头巾 | Headcloth（原 Coif） | 风帽与「头罩」无一字相同；留「头」；Coif 是生僻词 |
| rare-suffixes.json | Mask | 覆面甲 → 鬼面（不变） | Deathmask（原 Spectreface） | 中文留「面」不变；Spectreface 是硬拼的词；Deathmask 留着 Mask |
| rare-suffixes.json | Casque | 战盔 → 玄胄 → 战胄 | Warhelm（原 Sablehelm） | 玄胄不留「战」「盔」；Sablehelm 是硬拼的词 |
| rare-suffixes.json | Hide | 兽皮 → 生革 → 生皮 | Rawskin（不变） | 生革不留「皮」；英文不变（Rawhide 已是套装「牛首王之兽皮」的词） |
| rare-suffixes.json | Pelt | 毛皮 → 兽裘 → 毛裘 | Fur（原 Wolfskin） | 兽裘不留「毛」「皮」；Wolfskin 是户外品牌；裘＝Fur，与暗金「铁裘」、套装「极地裘皮」一致 |
| rare-suffixes.json | Wrap | 罩衣 → 裹衫 → 裹衣 | Swathe（不变） | 裹衫不留「衣」 |
| rare-suffixes.json | Cloak | 披风 → 大氅 → 风氅 | Windcloak（原 Greatcape） | 大氅不留「披」「风」；Windcloak 留着 Cloak |
| rare-suffixes.json | Shroud | 罩袍 → 殓衣 → 殓袍 | Graveshroud（原 Cerecloth） | 殓衣不留「袍」；Cerecloth 是生僻词；Graveshroud 留着 Shroud |
| rare-suffixes.json | Jack | 夹克 → 棉甲 → 夹袄 | Jerkin（原 Gambeson） | 棉甲与「夹克」无一字相同；留「夹」；Gambeson 是生僻词，Jerkin 是 Jack 的近义词 |
| rare-suffixes.json | Mantle | 斗篷 → 肩帔 → 肩篷 | Cape（原 Tippet） | 肩帔与「斗篷」无一字相同；留「篷」；Tippet 是生僻词 |
| rare-suffixes.json | Badge | 纹章 → 徽记 → 勋章 | Insignia（不变） | 徽记与「纹章」无一字相同；留「章」 |
| rare-suffixes.json | Rock | 磐石 → 峭岩 → 峭石 | Crag（不变） | 峭岩与「磐石」无一字相同；留「石」（磐岩已是符文之语 Stone 的名字） |
| rare-suffixes.json | Aegis | 壁垒 → 庇佑 → 坚壁 | Shieldwall（原 Refuge） | 庇佑与「壁垒」无一字相同；留「壁」（坚垒是符文之语 Bulwark 的名字，壁障是官方怪物名）；Refuge 认不出 Aegis |
| rare-suffixes.json | Ward | 守御 → 护阵 → 护御 | Safehold（原 Phalanx） | 护阵与「守御」不留「御」；Phalanx 是方阵，另一个意象（Shelter 是官方物品名） |
| rare-suffixes.json | Tower | 塔盾 → 楼橹 → 塔橹 | Turret（原 Barbican） | 楼橹与「塔盾」无一字相同；留「塔」；Barbican 是生僻词 |
| rare-suffixes.json | Wing | 飞翼 → 蝠翼（不变） | Batwing（原 Pennon） | 中文留「翼」不变；Pennon 是旗；Batwing 留着 Wing；与怪物后缀 Wing 同 |
| rare-suffixes.json | Fist | 之拳 → 怒拳 → 重拳 | Pummel（不变） | 怒拳改重拳，与怪物后缀 Fist 同（官方都是「之拳」，英文都是 Pummel） |
| rare-suffixes.json | Clutches | 之扼 → 魔爪 → 扼颈 | Stranglehold（原 Devilclaw） | 魔爪与「之扼」无一字相同；留「扼」；Devilclaw 是另一个意象 |
| rare-suffixes.json | Grip | 紧握 → 铁钳 → 紧攥 | Clench（原 Pincers） | 铁钳与「紧握」无一字相同；留「紧」；Pincers 是钳子 |
| rare-suffixes.json | Grasp | 掌握 → 攫取 → 攫握 | Grapple（不变） | 攫取与「掌握」无一字相同；留「握」 |
| rare-suffixes.json | Hold | 之握 → 之缚 → 之铁握 | Ironhold（原 Binding） | 之缚不留「握」；Binding 认不出 Hold；Ironhold 留着 Hold，铁＝Iron |
| rare-suffixes.json | Finger | 护指 → 指铠（不变） | Fingerguard（原 Gadling） | 中文留「指」不变；Gadling 是生僻词 |
| rare-suffixes.json | Knuckle | 指拳 → 指骨（不变） | Knucklebone（原 Fingerbone） | 中文留「指」不变；Knucklebone 留着 Knuckle |
| rare-suffixes.json | Shank | 护腿 → 腿铠（不变） | Shankplate（原 Cuisse） | 中文留「腿」不变；Cuisse 是生僻词 |
| rare-suffixes.json | Spur | 马刺靴 → 踵刺（不变） | Heelspur（原 Rowel） | 中文留「刺」不变；Rowel 是生僻词；Heelspur 留着 Spur |
| rare-suffixes.json | Stalker | 潜行靴 → 蹑踪 → 潜踪 | Prowler（原 Prowl） | 蹑踪不留「潜」；潜行换潜踪；Prowler 是 Stalker 的近义词 |
| rare-suffixes.json | Blazer | 拓荒靴 → 辟径 → 拓径 | Pathbreaker（原 Vanguard） | 辟径不留「拓」；Vanguard 是先锋，另一个意象 |
| rare-suffixes.json | Trample | 登山鞋 → 铁蹄 → 攀山靴 | Stomp（原 Ironhoof） | 官方中文是「登山鞋」，铁蹄认不出；留「山」；英文对 Blizzard 的 Trample |
| rare-suffixes.json | Brogues | 粗革皮鞋 → 革履（不变） | Leathers（原 Buskin） | 中文留「革」不变；Buskin 是生僻词 |
| rare-suffixes.json | Track | 足履 → 行迹 → 足迹 | Trail（原 Spoor） | 行迹不留「足」；Spoor 是生僻词 |
| rare-suffixes.json | Slippers | 便鞋 → 毡履 → 毡鞋 | Feltslipper（原 Feltsole） | 毡履与「便鞋」无一字相同；留「鞋」；Feltsole 认不出 Slippers |
| rare-suffixes.json | Buckle | 扣带 → 带钩（不变） | Belthook（原 Hasp） | 中文留「带」不变；Hasp 是生僻词 |
| rare-suffixes.json | Harness | 束带 → 缰辔 → 勒带 | Bridle（不变） | 缰辔与「束带」无一字相同；留「带」，勒＝Bridle |
| rare-suffixes.json | Fringe | 铰链 → 垂链（不变） | Tassel（原 Pendant） | 中文留「链」不变；英文 Pendant 是暗金「蝮蛇项坠」的词，又认不出 Fringe |
| rare-suffixes.json | Winding | 缠腰 → 萦带 → 缠带 | Bandage（原 Tendril） | 萦带不留「缠」；Tendril 是卷须，另一个意象 |
| rare-suffixes.json | Chain | 腰链 → 镣铐 → 镣链 | Shackle（原 Manacle） | 镣铐不留「链」 |
| rare-suffixes.json | Lash | 腰绳 → 笞鞭 → 鞭绳 | Whipcord（原 Flogging） | 笞鞭与「腰绳」无一字相同；留「绳」；Flogging 是动作 |
| rare-suffixes.json | Cord | 腰索 → 丝绦 → 丝索 | Silkcord（原 Braid） | 丝绦不留「索」；Silkcord 留着 Cord |
| rare-suffixes.json | Knot | 绳结 → 死结（不变） | Deathknot（原 Tangle） | 中文留「结」不变；Tangle 认不出 Knot；死＝Death |
| rare-suffixes.json | Circle | 圆圈 → 法环 → 法圈 | Spellcircle（原 Pentacle） | 法环不留「圈」；Pentacle 是五芒星 |
| rare-suffixes.json | Loop | 环圈 → 回环（不变） | Snareloop（原 Ouroboros） | 中文留「环」不变；Ouroboros 是衔尾蛇，另一个意象 |
| rare-suffixes.json | Eye | 法瞳 → 邪眸 → 邪瞳 | Gaze（原 Leer） | 邪眸不留「瞳」；瞳＝Gaze，与前缀「鹰瞳」Hawkgaze 一致；Leer 是暗金「屠夫之眸」的词 |
| rare-suffixes.json | Turn | 腰环 → 绕环（不变） | Twirl（原 Annulet） | 中文留「环」不变；Annulet 是生僻词 |
| rare-suffixes.json | Coil | 线圈 → 蟠绕 → 蟠圈 | Serpentcoil（原 Serpentine） | 蟠绕不留「圈」；Serpentcoil 留着 Coil |
| rare-suffixes.json | Gyre | 环带 → 涡旋 → 涡环 | Vortex（原 Whirlpool） | 涡旋与「环带」无一字相同；留「环」 |
| rare-suffixes.json | Whorl | 环盘 → 旋纹 → 旋盘 | Swirl（原 Volute） | 旋纹与「环盘」不留「盘」；Volute 是生僻词 |
| rare-suffixes.json | Heart | 之心 → 之魄 → 之心血 | Heartblood（原 Anima） | 之魄不留「心」；Anima 认不出 Heart；Heartblood 留着 Heart |
| rare-suffixes.json | Noose | 绳套 → 绞索 → 绞绳 | Garrote（不变） | 绞索与「绳套」无一字相同；留「绳」 |
| rare-suffixes.json | Necklace | 项链 → 璎珞 → 珠链 | Choker（原 Carcanet） | 璎珞与「项链」无一字相同；留「链」；Carcanet 是生僻词 |
| rare-suffixes.json | Collar | 项圈 → 颈枷 → 项枷 | Yoke（原 Pillory） | 颈枷不留「项」「圈」；Pillory 是刑台 |
| rare-suffixes.json | Torc | 颈圈 → 绞环 → 颈环 | Neckring（原 Wreath） | 绞环不留「颈」；Wreath 是花环，另一个意象 |
| rare-suffixes.json | Gorget | 护颈 → 颈甲（不变） | Neckplate（原 Bevor） | 中文留「颈」不变；Bevor 是生僻词（Neckguard 已是套装「爱蕊莎的护颈环」的词） |
| rare-suffixes.json | Scarab | 圣甲虫 → 金蜣 → 金甲虫 | Goldbeetle（不变） | 金蜣用生僻字「蜣」；留「甲虫」 |
| rare-suffixes.json | Brand | 烙印 → 灼痕 → 火印 | Firebrand（原 Scorch） | 灼痕与「烙印」无一字相同；留「印」；Firebrand 留着 Brand |
| rare-suffixes.json | Bludgeon | 大头棒 → 骨朵 → 瘤头棒 | Knobmace（不变） | 骨朵与「大头棒」无一字相同；留「头棒」，瘤＝Knob（铁头棒是底材 Quarterstaff 的官方名，Truncheon 是底材名） |
| rare-suffixes.json | Cudgel | 大棒 → 棘棍 → 棘棒 | Briarclub（不变） | 棘棍不留「棒」 |
| rare-suffixes.json | Harp | 竖琴 → 箜篌 → 骨琴 | Lyre（原 Psaltery） | 箜篌不留「琴」；Psaltery 是生僻词 |
| rare-suffixes.json | Bar | 木条 → 铁闩 → 铁条 | Ironbar（原 Latch） | 铁闩与「木条」无一字相同；留「条」；Ironbar 留着 Bar |
| rare-suffixes.json | Crook | 曲木 → 虬杖 → 曲杖 | Crookstaff（原 Wyrmstaff） | 虬杖不留「曲」；Wyrmstaff 是另一个意象；Crookstaff 留着 Crook |
| rare-suffixes.json | Mar | 残害 → 毁伤 → 戕害 | Scathe（不变） | 毁伤与「残害」不留「害」 |
| rare-suffixes.json | Shell | 之壳 → 之蜕 → 之空壳 | Husk（原 Slough） | 之蜕不留「壳」；Slough 是蜕下的皮；壳＝Husk，与前缀「栗壳」一致 |
| rare-suffixes.json | Stake | 木棍 → 刑桩 → 木桩 | Pyrestake（原 Gibbet） | 刑桩与「木棍」无一字相同；留「木」；Gibbet 是绞架 |
| rare-suffixes.json | Picket | 尖桩 → 拒马 → 锐桩 | Stakewall（不变） | 拒马不留「桩」 |
| rare-suffixes.json | Pale | 栅木 → 藩篱 → 栅栏 | Palisade（不变） | 藩篱与「栅木」无一字相同；留「栅」 |
| monster-prefixes.json | Gloom | 幽暗 → 晦冥 → 晦暗 | Murk（不变） | 晦冥与「幽暗」无一字相同；留「暗」 |
| monster-prefixes.json | Gray | 灰白 → 苍灰（不变） | Grizzled（原 Pallid） | 中文留「灰」不变；Pallid 是苍白，Grizzled 是花白 |
| monster-prefixes.json | Dire | 凶邪 → 狰恶 → 凶厉 | Fearsome（原 Grisly） | 狰恶与「凶邪」无一字相同；留「凶」；Grisly 是血腥 |
| monster-prefixes.json | Shadow | 暗影 → 鬼影 → 幽影 | Umbra（原 Visitant） | 鬼影是暗金「鬼影潜踪」的词，Visitant 认不出 Shadow；与稀有名词 Shadow 同用幽影＝Umbra |
| monster-prefixes.json | Haze | 阴霾 → 烟瘴 → 瘴霾 | Miasma（不变） | 烟瘴与「阴霾」无一字相同；留「霾」 |
| monster-prefixes.json | Storm | 风暴 → 狂飙 → 雷暴 | Thunderstorm（原 Squall） | 狂飙与「风暴」无一字相同；与稀有名词 Storm 同用雷暴＝Thunderstorm；Squall 是稀有名词「罡风」的词 |
| monster-prefixes.json | Warp | 闪烁 → 诡变 → 闪逝 | Twist（原 Eldritch） | 诡变与「闪烁」无一字相同；Eldritch 是形容词；与稀有名词 Warp 同 |
| monster-prefixes.json | Night | 夜幕 → 深宵 → 暮夜 | Nightfall（原 Midwatch） | 深宵与「夜幕」无一字相同；留「夜」；Midwatch 是守夜，Nightfall 留着 Night |
| monster-prefixes.json | Star | 星界 → 孤星（不变） | Lornstar（原 Lornlight） | 中文留「星」不变；Lornlight 认不出 Star，Lornstar 留着 Star |
| monster-prefixes.json | Pit | 深渊 → 幽窟 → 幽渊 | Hollow（不变） | 幽窟与「深渊」无一字相同；留「渊」 |
| monster-prefixes.json | Sharp | 锋利 → 锋芒 → 尖利 | Keen（原 Glint） | 锋芒是符文之语 Edge 的名字（Glinting Edge），Glint 认不出 Sharp；留「利」，锋换尖 |
| monster-prefixes.json | Ash | 火灰 → 残烬 → 烬灰 | Cinder（不变） | 残烬与「火灰」无一字相同；留「灰」 |
| monster-prefixes.json | Steel | 钢铁 → 燧石 → 精钢 | Truesteel（原 Flint） | 燧石是另一个意象；照新规则留「钢」，与魔法前缀 Steel 同用精钢＝Truesteel |
| monster-prefixes.json | Blight | 凋零 → 枯萎 → 凋萎 | Wilt（原 Sere） | 枯萎与「凋零」无一字相同；留「凋」；Sere 是生僻词 |
| monster-prefixes.json | Plague | 疾疫 → 疫疠（不变） | Contagion（原 Murrain） | 中文留「疫」不变；Murrain 是生僻词；与稀有名词 Plague 同 |
| monster-prefixes.json | Rot | 恶疮 → 朽腐 → 腐疮 | Putrid（不变） | 朽腐与「恶疮」无一字相同；留「疮」 |
| monster-prefixes.json | Bile | 愤怒 → 苦胆 → 愤懑 | Gall（不变） | 官方中文「愤怒」，苦胆认不出；留「愤」；英文对 Blizzard 的 Bile，不变 |
| monster-prefixes.json | Gut | 剖脏 → 剜肠 → 剜脏 | Entrail（不变） | 剜肠不留「脏」，又和暗金 Visceratuant 的「剜肠」同名 |
| monster-prefixes.json | Gore | 角刺 → 血污 → 抵角 | Hornthrust（原 Clot） | 官方中文「角刺」，血污认不出；留「角」；Clot 是血块 |
| monster-prefixes.json | Mind | 心智 → 魔念 → 心魔 | Psyche（原 Mania） | 魔念与「心智」无一字相同；留「心」；Mania 是癫狂 |
| monster-prefixes.json | Soul | 恶魂 → 魂魄（不变） | Anima（原 Eidolon） | 中文留「魂」不变；Eidolon 是生僻词，又是《最终幻想》的召唤兽；与稀有名词 Soul 同 |
| monster-prefixes.json | Grief | 悲惨 → 哀恸 → 悲恸 | Rue（不变） | 哀恸与「悲惨」无一字相同；留「悲」（Sorrow、Woe 是符文之语名） |
| monster-prefixes.json | Foul | 歹毒 → 污浊 → 狠毒 | Fetid（不变） | 污浊与「歹毒」无一字相同；留「毒」 |
| monster-prefixes.json | Vile | 卑鄙 → 龌龊 → 卑污 | Squalid（不变） | 龌龊与「卑鄙」无一字相同；留「卑」（卑劣是魔法前缀 Devious 的官方名） |
| monster-prefixes.json | Chaos | 混沌 → 淆乱 → 混冥 | Bedlam（原 Tumult） | 淆乱与「混沌」无一字相同；与稀有名词 Chaos 同 |
| monster-prefixes.json | Dread | 惊悚 → 骇怖 → 惊怖 | Fright（不变） | 骇怖不留「惊」「悚」；与稀有名词 Dread 同 |
| monster-prefixes.json | Doom | 厄运 → 劫数 → 厄难 | Downfall（原 Fateful） | 劫数与「厄运」无一字相同；与稀有名词 Doom 同 |
| monster-prefixes.json | Death | 死亡 → 殒灭 → 死灭 | Demise（原 Quietus） | 殒灭不留「死」；与稀有名词 Death 同 |
| monster-prefixes.json | Devil | 邪魔 → 魍魉 → 邪鬼 | Archdevil（原 Bogle） | 魍魉与「邪魔」无一字相同，又和稀有名词 Imp 同名；留「邪」；Archdevil 留着 Devil（Devilkin 是官方怪物名） |
| monster-suffixes.json | Feast | 暴食 → 狂宴 → 狂食 | Gorge（原 Revel） | 狂宴不留「食」；Revel 是狂欢 |
| monster-suffixes.json | Wound | 致伤 → 创痕 → 伤痕 | Scar（不变） | 创痕与「致伤」无一字相同；留「伤」；痕＝Scar，与暗金「天穹裂痕」一致 |
| monster-suffixes.json | Grin | 狞笑 → 怪笑（不变） | Sneer（原 Cackle） | 中文留「笑」不变；Cackle 是大笑，Sneer 才是狞笑 |
| monster-suffixes.json | Maim | 残害 → 断肢 → 残肢 | Cripple（原 Lop） | 断肢与「残害」无一字相同；留「残」；Lop 是砍枝 |
| monster-suffixes.json | Rend | 痛割 → 剐裂 → 裂割 | Tear（原 Rive） | 剐裂与「痛割」无一字相同；留「割」；Rive 是生僻词；裂＝Tear |
| monster-suffixes.json | Kill | 杀戮 → 屠灭 → 杀伐 | Carnage（不变） | 屠灭与「杀戮」无一字相同；留「杀」 |
| monster-suffixes.json | Call | 之唤 → 呼号 → 哀唤 | Wail（不变） | 呼号与「之唤」不留「唤」 |
| monster-suffixes.json | Vex | 妖术 → 缠扰 → 妖法 | Torment（不变） | 缠扰与「妖术」无一字相同；留「妖」 |
| monster-suffixes.json | Razor | 剃刀 → 削刃 → 剃刃 | Shear（不变） | 削刃不留「剃」；与稀有名词 Razor 同 |
| monster-suffixes.json | Shifter | 变形者 → 易形者（不变） | Shapeshifter（原 Turnskin） | 中文留「形者」不变；Turnskin 是生僻词；Shapeshifter 留着 Shifter |
| monster-suffixes.json | Crawler | 爬行者 → 匍行者（不变） | Bellycrawler（原 Creeper） | 中文留「行者」不变；Creeper 是《我的世界》的苦力怕 |
| monster-suffixes.json | Bender | 酗酒者 → 烂醉者 → 嗜酒者 | Sot（不变） | 烂醉者不留「酒」 |
| monster-suffixes.json | Spawn | 魔嗣 → 孽种 → 孽嗣 | Brood（原 Whelp） | 孽种不留「嗣」；Whelp 是幼崽；与稀有名词 Spawn 同 |
| monster-suffixes.json | Wight | 鬼魅 → 祟尸 → 尸魅 | Gravewight（原 Corpsehaunt） | 祟尸与「鬼魅」无一字相同；留「魅」；Corpsehaunt 认不出 Wight，Gravewight 留着 Wight |
| monster-suffixes.json | Growler | 咆哮 → 低吼 → 咆吼 | Roarer（原 Rumble） | 低吼与「咆哮」无一字相同；留「咆」；Rumble 是隆隆声 |
| monster-suffixes.json | Snarl | 凶啸 → 狺吠 → 嘶啸 | Yowl（不变） | 狺吠与「凶啸」无一字相同；留「啸」 |
| monster-suffixes.json | Wolf | 恶狼 → 豺狼（不变） | Wolfkin（原 Jackal） | 中文留「狼」不变；Jackal 是豺，另一种兽 |
| monster-suffixes.json | Bang | 巨响 → 轰鸣 → 轰响 | Crash（原 Clangor） | 轰鸣与「巨响」无一字相同；留「响」；Clangor 是生僻词 |
| monster-suffixes.json | Brow | 恶面 → 横眉 → 凶面 | Scowl（不变） | 横眉与「恶面」无一字相同；留「面」 |
| monster-suffixes.json | Eye | 之眼 → 邪眸 → 邪眼 | Evil-Eye（原 Leer） | 邪眸不留「眼」；Leer 是暗金「屠夫之眸」的词 |
| monster-suffixes.json | Maw | 之喉 → 巨口 → 巨喉 | Gullet（原 Gape） | 巨口与「之喉」不留「喉」；Gape 是张嘴 |
| monster-suffixes.json | Tongue | 之舌 → 长舌（不变） | Longtongue（原 Slander） | 中文留「舌」不变；Slander 是诽谤，认不出 Tongue；Longtongue 留着 Tongue |
| monster-suffixes.json | Horn | 之角 → 犄角（不变） | Antler（原 Tine） | 中文留「角」不变；Tine 是生僻词；与稀有名词 Horn 同 |
| monster-suffixes.json | Heart | 之心 → 黑心（不变） | Blackheart（原 Coalcore） | 中文留「心」不变；Coalcore 是硬拼的词；Blackheart 留着 Heart |
| monster-suffixes.json | Wing | 翼魔 → 蝠翼（不变） | Batwing（原 Pennon） | 中文留「翼」不变；Pennon 是旗；与稀有名词 Wing 同 |
| monster-suffixes.json | Pox | 恶疾 → 痘疮 → 恶痘 | Pustule（原 Blain） | 痘疮与「恶疾」无一字相同；留「恶」；Blain 是生僻词 |
| monster-suffixes.json | Drool | 涎魔 → 垂涎（不变） | Slobber（原 Slaver） | 中文留「涎」不变；Slaver 又作奴隶贩子 |
| monster-suffixes.json | Sludge | 污魔 → 淤泥 → 污泥 | Silt（不变） | 淤泥与「污魔」无一字相同；留「污」 |
| monster-suffixes.json | Break | 碎击 → 崩裂 → 崩碎 | Shatter（不变） | 崩裂与「碎击」无一字相同；留「碎」；与稀有名词 Sunder 同（官方都是「碎击」） |
| monster-suffixes.json | Shard | 刺头 → 残片 → 骨刺 | Splinter（不变） | 残片与「刺头」无一字相同；留「刺」 |
| monster-suffixes.json | Maul | 锤击 → 重殴 → 锤打 | Batter（原 Thrash） | 重殴与「锤击」无一字相同；留「锤」；Thrash 是乱打 |
| monster-suffixes.json | Lust | 邪淫者 → 贪欲者 → 淫欲者 | Lecher（原 Coveter） | 贪欲者不留「淫」；Coveter 是贪婪的人 |
| monster-titles.json | the Sharp | 尖锋者· → 快刃· → 利锋者· | the Whetted（不变） | 快刃与「尖锋者」无一字相同；留「锋者」 |
| monster-titles.json | the Jagged | 尖刺者· → 锯齿者· → 锯刺者· | the Sawtooth（不变） | 锯齿者不留「刺」，锯齿又是魔法前缀 Serrated 的官方名；留「刺者」 |
| monster-titles.json | the Impaler | 穿刺者· → 贯尸者· → 洞穿者· | the Transfixer（不变） | 贯尸者不留「穿」「刺」；与稀有名词 Impaler 同（贯刺者已是暗金 The Impaler 的名字） |
| monster-titles.json | the Slayer | 屠戮者· → 刽子手· → 屠命者· | the Manslayer（原 the Executioner） | 刽子手与「屠戮者」无一字相同；留「屠」「者」；Executioner 是刽子手；与稀有名词 Slayer 同 |
| monster-titles.json | the Mauler | 重槌者· → 碾杀者· → 铁槌者· | the Smiter（原 the Millstone） | 碾杀者不留「槌」；Millstone 是磨盘 |
| monster-titles.json | the Destroyer | 毁灭者· → 夷平者· → 灭绝者· | the Annihilator（原 the Leveler） | 夷平者与「毁灭者」无一字相同；留「灭」「者」；Leveler 认不出 Destroyer |
| monster-titles.json | the Wraith | 怨魂· → 厉鬼· → 怨灵· | the Wraithling（原 the Ghast） | 厉鬼与「怨魂」无一字相同；留「怨」；与稀有名词 Wraith 同 |
| monster-titles.json | the Shade | 阴魂· → 幽影· → 幽魂· | the Shadeborn（原 the Umbra） | 幽影与「阴魂」不留「魂」，幽影现在是 Shadow；Shadeborn 留着 Shade |
| monster-titles.json | the Unholy | 邪秽者· → 渎圣者· → 邪渎者· | the Ungodly（原 the Profaner） | 渎圣者不留「邪」；Ungodly 是 Unholy 的近义词 |
| monster-titles.json | the Grim | 冷酷者· → 肃杀者· → 冷厉者· | the Pitiless（不变） | 肃杀者与「冷酷者」不留「冷」 |
| monster-titles.json | the Dark | 黑暗者· → 幽晦者· → 昏暗者· | the Benighted（不变） | 幽晦者与「黑暗者」不留「暗」 |
| monster-titles.json | the Tainted | 污堕者· → 染秽者· → 秽堕者· | the Befouled（不变） | 染秽者与「污堕者」不留「堕」 |
| monster-titles.json | the Unclean | 不洁者· → 污秽者· → 不净者· | the Filth-Ridden（不变） | 污秽者与「不洁者」不留「不」 |
| monster-titles.json | the Cold | 冷冰者· → 霜寒者· → 冰霜者· | the Frostbitten（不变） | 霜寒者与「冷冰者」不留「冰」 |
