# 改名报告

由 `tools/d2-import.mjs` 生成，不要手改。一行要有中文名（`name`）和英文名（`nameEn`）才收录；下面列出缺名字的行，它们导入时不收录，所以不会出现在掉落里。在对应的 `tools/d2-names/<类别>.json` 里补上再导入就会收录。

## 缺中文名的行

所有收录范围内的行都有中文名。

## 缺英文名的行

有中文名、还没有英文名的行。英文名的规则见 `style-en.md`，音译用 `glossary-en.json`。

所有收录范围内的行都有英文名。

## 范围说明

- 天梯专属：只有在固定版本（3.x）和 2.7 里都是天梯专属的行才排除。
  - 第 15 赛季把 9 件老暗金（Gravenspine、The Battlebranch、Bane Ash、Pluckeye、Piercerib、Blinkbats Form、The Ward、Manald Heal、Bloodletter）和天使套装（Angelic Raiment）的 4 件改成天梯专属。它们在 2.7（术士资料片之前）是普通物品，所以照 2.7 的行收录，中英文名都按两份规范起好了。
  - 2.6 的符文之语正好相反：2.7 里是天梯专属，固定版本里已经开放，也收录。

## 按范围排除的行

这些行不起名也不收录：术士资料片新增的内容、底材不收录的物品、没有属性的未用行等。

- itemtypes，术士资料片新增（4）：`cjwl`、`csch`、`grim`、`warl`
- armor，术士资料片新增（15）：`wa1`、`wa2`、`wa3`、`wa4`、`wa5`、`wa6`、`wa7`、`wa8`、`wa9`、`waa`、`wab`、`wac`、`wad`、`wae`、`waf`
- misc，D2CE 无字串（术士资料片新增或未用的行）（24）：`bpl`、`bps`、`hpf`、`hpo`、`mpf`、`mpo`、`rpl`、`rps`、`ua1`、`ua2`、`ua3`、`ua4`、`ua5`、`um1`、`um2`、`um3`、`um4`、`um5`、`um6`、`xa1`、`xa2`、`xa3`、`xa4`、`xa5`
- misc，术士资料片新增（2）：`cjw`、`cs2`
- magicprefix，术士资料片新增（D2CE 无字串）（50）：`670`、`671`、`672`、`673`、`674`、`675`、`676`、`677`、`678`、`679`、`680`、`681`、`682`、`683`、`684`、`685`、`686`、`687`、`688`、`689`、`690`、`691`、`692`、`693`、`694`、`695`、`696`、`697`、`698`、`699`、`701`、`702`、`704`、`705`、`706`、`707`、`708`、`709`、`710`、`711`、`712`、`713`、`714`、`715`、`716`、`717`、`718`、`719`、`720`、`721`
- magicprefix，术士专属（2）：`700`、`703`
- magicsuffix，没有物品类型（未用的行）（27）：`425`、`426`、`427`、`429`、`430`、`431`、`439`、`440`、`441`、`448`、`449`、`450`、`451`、`452`、`453`、`455`、`456`、`457`、`621`、`623`、`625`、`627`、`631`、`635`、`637`、`641`、`643`
- magicsuffix，术士资料片新增（D2CE 无字串）（38）：`748`、`749`、`750`、`751`、`752`、`753`、`754`、`755`、`756`、`757`、`758`、`759`、`760`、`761`、`762`、`763`、`764`、`765`、`766`、`767`、`768`、`769`、`770`、`771`、`772`、`773`、`774`、`775`、`776`、`777`、`778`、`779`、`780`、`781`、`782`、`783`、`784`、`785`
- automagic，术士资料片新增（D2CE 无字串）（8）：`36`、`37`、`38`、`39`、`40`、`41`、`42`、`43`
- uniqueitems，没有属性（未用的行）（1）：`Darkfear`
- uniqueitems，术士资料片新增（D2CE 无字串）（30）：`Ars Al'Diablolos`、`Ars Tor'Baalos`、`Ars Dul'Mephistos`、`Measured Wrath`、`Dreadfang`、`Wraithstep`、`Bloodpact Shard`、`Sling`、`Opalvein`、`Entropy Locket`、`Gheed's Wager`、`Unique Warlock Helm`、`Defender's Bile`、`Guardian's Thunder`、`Protector's Frost`、`Defender's Fire`、`Protector's Stone`、`Guardian's Light`、`PreCrafted Cold Rupture`、`Crafted Cold Rupture`、`PreCrafted Flame Rift`、`PreCrafted Crack of the Heavens`、`PreCrafted Rotting Fissure`、`PreCrafted Bone Break`、`PreCrafted Black Cleft`、`Crafted Flame Rift`、`Crafted Crack of the Heavens`、`Crafted Rotting Fissure`、`Crafted Bone Break`、`Crafted Black Cleft`
- setitems，术士资料片新增（D2CE 无字串）（13）：`Warlord's Conquest`、`Warlord's Lust`、`Warlord's Mantle`、`Warlord's Crushers`、`Warlord's Authority`、`Bane's Oathmaker`、`Bane's Wraithskin`、`Bane's Authority`、`Horazon's Countenance`、`Horazon's Dominion`、`Horazon's Hold`、`Horazon's Legacy`、`Horazon's Secrets`
- sets，术士资料片新增（D2CE 无字串）（3）：`Warlord's Glory`、`Bane's Garments`、`Horazon's Splendor`
- runes，术士技能（2）：`Runeword3`、`Runeword157`
- runes，术士资料片新增（D2CE 无字串）（3）：`Runeword180`、`Runeword181`、`Runeword182`
- charstats，术士资料片新增（1）：`war`
