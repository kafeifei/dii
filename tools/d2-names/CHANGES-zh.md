# 中文名改动（自 4e62413 起）

> 注（2026-10-28）：这张表是按旧规则改的：那时「逐字换同义词」也算太像，所以这些名字都往远处改了。现在的规则是老玩家一眼认出（`style.md`「目标」和硬性规则 2，`style-en.md` 同），换一个同义字是可以的；下文引的 `style-en.md`「Similar but different」已经换成新的硬性规则 1、2。表里「战彘之魂」「镌石之君」这类认不出的名字，要照新规则重新对照官方名起。

这一轮英文名打磨里，改了中文名的行都在下面，请过目。理由大多是同一条：原来的中文名只是官方译名或英文原名逐字换了同义词，英文跟着中文起，也就只能是原名换同义词（`style-en.md`「Similar but different」）。另一条是「一个英文词只对一个中文词」：原名里有 Steel、King 这类词时英文得换一个词，而中文原来的字（钢、王）换来的英文词在别处已是另一个字的（Iron 是铁），就连中文一起换。每行的 `note` 里也记了原名。

| 文件 | 原版 | 原中文名 → 新中文名 | 新英文名 | 为什么 |
| --- | --- | --- | --- | --- |
| skills.json | Heart of Wolverine | 貂熊之魄 → 战彘之魂 | Soul of the Warboar | 貂熊是狼獾的另一通名、魄是心的同义词；中间试过的「贪狼之灵」仍是贪食的狼獾，又同含狼、灵，读作「召唤灵狼」；野猪是凯尔特人的战兽，德鲁伊正出于此；魂＝Soul，同「刺藤之魂」 |
| uniques.json | The Gavel of Pain | 痛楚判槌 → 忏罪之槌 | Maul of Penance | 痛楚≈苦痛，判槌就是 gavel 的直译；改为打得人忏罪的刑槌 |
| uniques.json | Bloodpact Shard | 血契残锋 → 背信残锋 | Broken Edge of the Faithless | 血契残锋是 Bloodpact Shard 的直译；改为背信者留下的残锋（这件是术士资料片的，不收录，名字照样改好） |
| uniques.json | Spellsteel | 咒铸精钢 → 缚咒斧 | Hexbound Axe | 咒铸精钢是 Spellsteel 的直译（咒、精钢），英文 Mettle 也只是 metal；底材长须斧，身上缚着四种法术的充能 |
| uniques.json | Gloom's Trap | 幽晦罗网 → 窃光罗网 | Snare of the Light-Pilferer | 幽晦≈阴影、罗网≈陷阱，逐词换同义词；这条腰带减照亮半径、偷法力，取偷走光的网；窃同「窃血者」 |
| uniques.json | Steelclash | 钢铁交鸣 → 金铁交鸣 | Chorus of Iron | 钢铁就是原名的 Steel，英文只好让钢作 Iron，和铁撞了词；取成语金铁交鸣，兵刃相击之声 |
| uniques.json | Steel Carapace | 钢鳌之壳 → 铁鳌之壳 | Shell of the Iron Tortoise | 同上：英文 Iron Tortoise 让钢作了 Iron；钢改铁 |
| uniques.json | Cold Rupture | 凛冰崩裂 → 冻原之创 | Tundra's Wound | 凛冰崩裂是寒冰裂口逐字换近义词，英文 Shattering of Bitter Ice 又几乎和后缀「碎凌之」of Shattering Ice 同名；改为冻土上裂开的伤口，与「天穹裂痕」成对（术士版 PreCrafted 同名，一起改） |
| runewords.json | Bulwark | 坚垣 → 铜垣 | Brazen Rampart | 坚垣≈壁垒；取铜墙铁壁，垣仍作 Rampart |
| runewords.json | Steel | 千锻钢 → 千锻刃 | Thousand-Forged Blade | 千锻钢仍是钢：英文要么留着 Steel（原名加一个形容词），要么让钢作 Iron 和铁撞词；改为千锤万锻的刀刃 |
| suffixes.json | of Thunder Storm | 雷云之 → 雷幄之 | of the Levin Canopy | 雷云只把雷暴术的暴换成云，英文 Thundercloud 也留着 Thunder；取雷云如帐幕张在施法者头顶 |
| suffixes.json | of Freezing Arrows | 凝霜矢之 → 霜花矢之 | of Frostflower Shafts | 凝霜≈冻结、矢≈箭，是官方「冻结箭」逐字换同义字，英文 Hoarfrost Shafts 也只是 Freezing Arrows 逐词换同义词；改为箭落处绽开一片霜花，冻住周围的敌人 |
| sets.json | Hsarus' Iron Fist | 沙卢施的铁腕 → 沙卢施的团牌 | Shalush's Roundel | 铁腕本就是铁拳之意；底材是小圆盾，取古代圆盾团牌 |
| sets.json | Immortal King | 万古之王 → 镌石之君 | Graven Sovereign | 万古≈不朽；取勒石记功、名垂不朽；原名里有 King，而王在「牛首王」里是 King，所以王改君，君＝Sovereign，同「雷君之魄」 |
| sets.json | Immortal King's Detail | 万古之王的勋绩 → 镌石之君的勋绩 | Graven Sovereign's Deeds | 随套装名 |
| sets.json | Immortal King's Forge | 万古之王的锻火 → 镌石之君的锻火 | Graven Sovereign's Anvilfire | 随套装名 |
| sets.json | Immortal King's Pillar | 万古之王的柱础 → 镌石之君的柱础 | Graven Sovereign's Plinth | 随套装名 |
| sets.json | Immortal King's Soul Cage | 万古之王的魂牢 → 镌石之君的石椁 | Graven Sovereign's Sarcophagus | 随套装名；魂牢就是灵魂之笼，英文 Soulhold 留着 Soul；改为国王生前就披上的石棺，与「镌石」同取石 |
| sets.json | Immortal King's Stone Crusher | 万古之王的裂岩槌 → 镌石之君的裂岩槌 | Graven Sovereign's Cragsplitter | 随套装名 |
| sets.json | Immortal King's Will | 万古之王的遗诏 → 镌石之君的遗诏 | Graven Sovereign's Last Edict | 随套装名 |
| monsters.json | Quill Rat | 针鬃鼠 → 箭猪 | Arrowhog | 针鬃≈刺毛；箭猪是豪猪的俗名，取射刺如箭；英文照箭猪拼（如 hedgehog），不用 Porcupine：那只是这种兽的普通英文名，没有自己的意象（古称 Porpentine 又是一位知名独立游戏作者的笔名） |
| monsters.json | Blood Clan | 沥血部族 → 血角部族 | Gorehorn Tribe | 沥血部族只是鲜血氏族换字（鲜→沥、氏→部），英文 Goredrip 也只有 drip 是自己的；取羊人染血的角 |
| monsters.json | Flamespike the Crawler | 焰棘匍行者 → 燧背灰腹 | Flintback Ashbelly | 焰棘匍行者是英文原名逐词直译；改为背刺如燧石迸火、肚腹拖在灰烬里爬 |
| monster-prefixes.json | Steel | 精钢 → 燧石 | Flint | 精钢仍是钢（官方「钢铁」只去了铁），英文要么留着 Steel，要么换同义词（Mettle 本是 metal 的另一写法，Tempered 是「淬焰之」的淬）；燧＝Flint，同「燧背灰腹」「燧薪之」 |
| monster-prefixes.json | Devil | 恶鬼 → 魍魉 | Bogle | 恶鬼是官方「邪魔」逐字换同义字（恶≈邪、鬼≈魔）；英文 Hellhaunt 的 haunt 又已是「狐祟」的祟；改为魍魉，与稀有名词「魍魉」Bogle 同 |
| monster-suffixes.json | Wight | 幽尸 → 祟尸 | Corpsehaunt | 这一行取的是作祟的尸身，haunt 是祟（前缀「狐祟」Fox-Haunted）；中文写幽，haunt 就对了两个字；改作祟尸，英文不变 |
| monster-titles.json | the Destroyer | 破灭者· → 夷平者· | the Leveler | 破灭≈毁灭，只换一字；改为夷为平地 |
| mercenaries.json | Kyoko | 响子 → 杏子 | Anzu | 響子读不出别的好名字：きょうこ是原名，ひびき是威士忌 Hibiki，按響（おと）、子（ね）读的 Otone 是英国音箱品牌；杏子也是京子的一种写法，另一种读法 あんず 就是 Anzu |

没有改中文、只改了英文的行（比如「雅坎纳的首级」「圣·撒札拜的赎世青锋」）不在表里，见各行的 `note`。
