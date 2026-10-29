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
