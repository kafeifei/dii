# M2a 第 0 步：接口阶段

M2a 的决定见 `docs/M2A.md`，本文是第 0 步的做法。代码依据是 a15f162，行号按那个提交，动手前先在当时的代码上核对一遍。凡是没在代码里核实、靠推理得出的，都标了「（推断）」。

## 0. 结论

第 0 步在集成线上按顺序做 6 段：
1. 合并三个地基分支（calc、maze、art），补上 calc 合并后要做的几处。
2. 加两条护栏测试。
3. 把 `game.ts` 按职责搬到 7 个文件里，只搬不改。
4. 从 `renderer.ts` 里搬出三块。
5. 统一长度单位。
6. 定接口：只加类型、空字段和桩函数。没有佣兵时，玩法和现在完全一样。

第 0 步之后，6 条线可以同时做：西块大地图 W、地下城 D、物件 O、佣兵 M、绯鸦和怪物 B、美术声音 A。姐妹任务 Q 要等 M、B、W 合进来；秘境的地下城小层 R 要等 D。

## 1. 拆分 `src/game/game.ts`（2279 行）

### 1.1 搬到哪里

| 行（a15f162） | 内容 | 去处 |
| --- | --- | --- |
| 1–260 | 导入、`GameHooks`、常量、字段 | 留在原文件 |
| 262–452 | 开局、继续、刷新后接着玩、`openShared`、`newWorld`、`save`、`syncShared` | 留在原文件 |
| 455–584 | `persist`、`heroClaimed`、`backFromCache`、`outdated`、`heroElsewhere` | 留在原文件，规则 1–3 都压在这段上，M2a 也用不着改它 |
| 586–611 | `heldGrids`、`stashBlock`、`moveStashGold` | `items.ts` |
| 613–646 | `hasMap`、`levelFor`（含巢穴的种子） | `maps.ts` |
| 648–872 | `enterArea` … `areasNext`（含秘境的 `arrival`/`arrive` 钩子） | `travel.ts` |
| 874–892 | `say`、`watchLife` | 留在原文件 |
| 894–917 | `layOutUnplaced` | `items.ts` |
| 919–922 | `refreshShop` | `townsfolk.ts` |
| 924–942 | `respawn` | `bodies.ts` |
| 946–1056 | `update` | 留在原文件，只做调度；里面三段循环（爆炸 1008–1016、出口 1024–1031、尸体清理 1038–1050）搬到 fight、travel、fight |
| 1058–1358 | 鼠标、触屏、瞄准、`useSkillAt` | `controls.ts`（最后做，可以推迟到 M2a 之后） |
| 1362–1555 | 光环、互相推开、飞行物、锤子、充能弹 | `fight.ts` |
| 1557–1692 | `wake`、`killMonster`、`celebrateLevelUp`、`rollLoot`、`onProc`、`killPlayer` | `kills.ts` |
| 1694–1776 | `leaveCorpse`、`layOutCorpses`、`takeCorpse` | `bodies.ts` |
| 1778–1996 | `spawnDrops` … `useBelt` | `items.ts` |
| 1998–2093 | `interact`、`tellClosed` | `interact.ts`（按物件种类分派的表）+ `containers.ts`（宝箱、木桶、神龛） |
| 2095–2160 | `talkTo` … `vendorHeal` | `townsfolk.ts` |
| 2162–2242 | 回城门、`travel`、`travelToArea` | `travel.ts` |
| 2244–2278 | `setDifficulty`、`switchDifficulty` | 留在原文件；清空地图改为调用 `maps.forget()` |

拆完 `game.ts` 大约剩 750 行。

### 1.2 原则

- **写法**：照 `playerctl.ts`、`ai.ts` 的写法，新文件导出 `function xxx(g: Game, …)`，只写 `import type { Game }`，不产生运行时的循环依赖。
- **私有状态**：跟着使用它的函数走，每个模块一个小状态对象挂在 `Game` 上（例如 `g.trip = { atClosed, leftKind, wentUnder }`），不把十几个字段改成 public。
- **只搬不改**：每一步语句一样，`Math.random` 的调用顺序也一样。审查时用 `git diff --color-moved`。
- **`Game` 上的方法一个不删，改成一行转发。** 外面在用的有这些：
  - 工具和场景调用的：`teleportWithin`、`interact`、`killMonster`、`save`、`enterArea`、`newGame`、`moveStashGold`、`travel`、`continueGame`、`enterLevel`、`pickupGround`、`travelToArea`、`killPlayer`、`setDifficulty`、`syncShared`、`respawn`、`npcSpoke`、`castTownPortal`、`isLit`、`enterTrial`、`beltInsert`、`talkTo`、`npcTalk`、`stashBlock`、`dropFromBag`、`useBelt`、`autoBeltInsert`、`useSkillAt`、`refuseDrop`、`readHeld`、`onProc`、`npcLeft`、`mapOf`、`drink`、`openTownPortal`、`heroClaimed`、`dropBlock`、`wake`、`takeOver`、`spawnDrops`、`resume`、`readTownPortal`、`heldGrids`、`drinkable`、`closePortals`、`claimToResume`。
  - TypeScript 里是 private、但测试直接调用的：`layOutCorpses`、`updateArea`、`rollLoot`。
- **被工具换掉的方法，模块之间也必须经过实例调用**：`bot.mjs` 换掉了 `g.killMonster`，`west.test.mjs` 换掉了 `game.rollLoot`，`persist` 场景换掉了 `heroClaimed`、`syncShared`。所以 `combat.ts`/`ai.ts` 继续调 `g.killMonster(...)`，`kills.ts`、`containers.ts` 掷掉落时调 `g.rollLoot(...)`。
- **工具写的字段**：`bot.mjs` 会写 `g.lastDungeon = null`，`lastDungeon` 要留 getter 和 setter。

### 1.3 顺序（每步一个提交）

| 步 | 提交内容 | 每步都跑 tsc、npm test（含 replay 和 facade），另跑 |
| --- | --- | --- |
| G0 | 护栏：`tools/test/replay.test.mjs`、`tools/test/facade.test.mjs` | 全部单元测试 |
| G1 | `maps.ts`：`class Maps { west, den, gallery, lastDungeon, dungeons: Map<number, Level>; levelFor(id, fresh); mapOf(id); kept(): Level[]; forget() }`。`closePortals` 和 `layOutCorpses` 里手写的地图清单换成 `maps.kept()` + `portalLevel` + `rift.levels()` | rift、nearby、west、hero-d2；bot 跑一局 |
| G2 | `kills.ts` | hero-d2、d2-ai、quests、rift、tomes、west；monsters、smoke 场景 |
| G3 | `fight.ts` | d2-ai、nearby、hero-d2；monsters 场景 |
| G4 | `bodies.ts` | hero-d2、rift、stash；corpse 场景、rift 场景 |
| G5 | `items.ts` | ctrlclick、tomes、stash、items；ctrlclick、tomes、stash 场景 |
| G6 | `travel.ts`（秘境钩子跟着搬） | west、nearby、rift、areas、tomes；overworld、stream、rift 场景 |
| G7 | `interact.ts`（`USE: Partial<Record<ObjKind, (g, o) => void>>`）、`containers.ts`、`townsfolk.ts` | quests、services、rift；quests、persist 场景 |
| G8 | `controls.ts` | 可以推迟 |

### 1.4 护栏

**`replay.test.mjs`**
- 做法：测试期间把 `Math.random` 换成固定种子的生成器，结束时还原；`worldSeed` 也固定。
- 脚本：新角色 → 出营地 → 打怪 → 击杀 → 捡东西 → 开宝箱 → 喝药 → 回城门来回 → 死 → 复活 → 捡回尸体 → 用传送点 → 进出巢穴 → 换难度。
- 比对：在几个检查点上算一个摘要，和记下的值比，内容是：
  - 主角的位置、生命、经验、金币、物品 uid；
  - 地图上怪的死活和位置；
  - 地上的物品；
  - 任务记录；
  - 写出的存档文本。
- 规矩：G1–G7 和接口提交都不许改变摘要，只有单位那一段有意改变它（提交说明里写清楚，并更新记下的值）。

**`facade.test.mjs`**：断言 1.2 列出的成员都还在。

**要小心的地方**
- `seamless.test.mjs` 用的是假的 `game` 对象，只有 `{player, level, sfx, hooks, fx, killMonster}`。`ai.ts` 新加的调用都要能在它上面跑，比如写成 `g.friendlies?.() ?? [g.player]`。
- `nearby` 偶尔会失败（见 PROJECT-MAP「已知缺口」），不要当成是拆分弄坏的。

## 2. M2a 需要的接口

### 2.1 `killMonster(m, elem, killer)`

`killMonster(m: Monster, elem: Elem, killer: Killer = 'hero')`，`type Killer = 'hero' | Merc | null`。默认是 `'hero'`，现有约 46 处调用都不用改。

谁传什么：
- `combat.ts`：按 `pk.source` 判断，`Player` 传 `'hero'`，`Merc` 传她本人，没有 source 的也算 `'hero'`。
- 荆棘反伤：`'hero'`。
- 流血、中毒致死：读新字段 `Actor.bleedBy`/`poisonBy`（由 `applyDamage`、`strikeEffects` 设置）。
- 绯鸦死后倒下的亡灵：`null`。

| 效果 | 'hero' | Merc | null |
| --- | --- | --- | --- |
| 标成死亡、`monsterDied`、特效、死亡声、强化怪死亡爆炸、首领消息并存档 | 有 | 有 | 有 |
| 主角经验（`killXp`） | 有 | 有（佣兵杀的也给主角全份） | 无 |
| 佣兵经验（`killShare`） | 86/256 | 全份 | 无 |
| `procKill`、每杀回血回蓝、杀恶魔回血 | 有 | 无（推断，待查 D2MOO） | 无 |
| 掉落 | 主角的寻宝率 | 待查 D2MOO（推断：佣兵的） | 无 |
| `quests.monsterKilled(m, killer)`、`rift.killed` | 有 | 有 | 有 |

测试：hero-d2 加两段，一段是 `null` 击杀（没有经验、没有掉落，任务照算），一段是佣兵击杀（主角拿全份经验）。

### 2.2 怪物能以佣兵为目标

依据 M2A：在主角和佣兵里取最近的；主角在营地、或离怪 55 子格以上时都不算。佣兵在营地里不算，是照同一条推出来的（推断）。

- **新类型和成员**：`type Friendly = Player | Merc`；`Game.friendlies(): Friendly[]` 返回活着、在这张地图上的友方；`Monster.target: Friendly | null`。
- **`ai.ts` 选目标**：`findTarget` 在不死、不在营地、离怪不超过 55 子格的友方里取最近的，然后照原样做察觉距离、视线、致盲的判断。`gone` 和 `sight` 都看这个目标。
- **`ai.ts` 换坐标**：下面这些地方把 `g.player.pos` 换成目标的位置：`go`、`heroReach`、`escape`、`circle`、`keepAt`、`begin`、`fallback`、`bloodRaven`、`walk`、`updateMonster`、`fire`。
- **`ai.ts` 对所有友方都算的**：`clearOver`、`auraAround`、`blastDamage`。
- **逃跑仍然是离开主角**：恐惧来自主角的武器。
- **`combat.ts`**：`monsterStrike(g, m, t: Friendly, …)`。打到佣兵时转给 `merc.ts` 的 `mercStruck`：用她的防御和等级算命中；没有盾，不格挡；装备不磨损。`applyDamage` 加一个 `Merc` 分支，她的抗性照主角的规则吃难度惩罚，上限 75。
- **`fight.ts`**：飞行物和互相推开都对每个友方算。本帧要跑的怪 = 每个友方附近的怪的并集，主角附近的排前面并去重。
- **验收**：第 0 步里没有佣兵，`friendlies()` 只返回主角，replay 摘要不变。d2-ai 测试用测试里造的 `Merc` 检查四件事：
  - 选更近的那个；
  - 营地里的和 55 子格以外的不算；
  - 目标死了换一个；
  - 主角在营地、佣兵在野外时打佣兵。

### 2.3 佣兵的骨架和存档约定

**骨架**
- `src/game/merc.ts`：`class Merc extends Actor`（faction `'player'`），用 `Player.merc` 和 `hireling.ts` 的 `mercStats` 造出来。
- 桩函数：`updateMerc(g, merc, dt)`、`mercStruck`、`mercDied`。
- `Game.merc: Merc | null` 是当前地图上的那个人。
- `Player.merc: MercState | null`：hire、name、level、xp、equipment、life、dead，加 `raw?`（这个版本认不出的佣兵原样留着）。

**存档**
- `SaveV4.merc` 的形状不变，不加版本，也不加迁移步。
- `mapItems` 把佣兵的装备也包进去，读档时 `knownItem` 就管到它：认不出的装备放到营地储物箱旁边。
- 同一个提交里删掉 items 迁移第 1 步里单独处理佣兵装备的那段，否则同一件物品会被转两次。
- `loadSave` 把 `d.merc` 读进 `p.merc`。`writeSave` 从 `p.merc` 写；`raw` 原样写回；没有佣兵就写 `null`。
- 主角和佣兵在同一个存储键里一次写完，移动装备不会出现只存进去一半。交接和往返缓存的保证也就覆盖到佣兵。

**测试**
- `save.test` 里佣兵那段，从「原样写回」改成「读进 Player、再写出来一样」。
- 新增四项：
  - v1–v3 带佣兵装备时，每件只转一次、件数不变；
  - 认不出的装备放到储物箱旁、件数不变；
  - 没有佣兵的存档写出来一字不差；
  - 比当前版本新的存档带佣兵时只读、不回写。

### 2.4 `Layout` 的新字段

- `chests`、`barrels`、`shrines` 改成 `(P2 & 附加信息?)[]`，老的生成器给的普通 `P2` 仍然合法：
  - 宝箱：`{ d2?, locked?, trap?, sparkly?: 'unique' | 'consolation' }`；
  - 木桶：`{ d2?, exploding?, opened? }`；
  - 神龛：`{ kind? }`。
- `caskets?`、`remains?`、`wells?`：和 `objgroups.ts` 的 `Placed*` 一样。
- `cliffs?: Set<number>`：哪些墙格是悬崖。
- `cairn?: { center: P2; stones: P2[] }`：凯恩之石。
- `presets?: { kind; d2?; rect; area }[]`：摆了哪些预设房间或单元。
- `presetMonsters?: { pos; monster; quest? }[]`：预设放下的、又不是超级暗金的怪，比如荒冢里的绯鸦。
- `Level` 的构造函数按这些字段造物件。`spawn.ts` 加两个桩函数：`presetMonster`（W 线填）和 `spawnOne`（O 线填）。
- 测试：手造一个带全部新字段的 Layout，检查造出了对应的物件；老地图不受影响。

### 2.5 物件、墙、交互动词

- `ObjKind` 加 `'casket' | 'remains' | 'well'`。
- `WorldObject` 加 `d2?`、`locked?`、`trap?`、`sparkly?`、`exploding?`、`hole?`、`flies?`、`charges?`、`serves?: ServiceKind[]`。
- `spent(o)` 替换 `game.ts` 里两处手写的「用过了」判断。
- 凯恩之石不加物件种类，M2a 里放进 props，M2b 再加 `'stone'`。
- `ui.ts` 的 `USE_VERB`：石棺「打开」、遗骸「搜查」、井「饮用」。
- 物件的悬停名走改名表（规则 5），由 O 线补。
- 悬崖墙：`WallKind` 加 `'cliff'`，`WALL_HEIGHT` 加一项，先用现有岩石贴图；`wallKind` 先看 `layout.cliffs`。
- `needs.ts` 的 `objectNeeds`、`effects.ts`、`sfx.ts` 里按物件种类分派的地方也加分支。新种类先返回 `[]`，由代码画替身。

### 2.6 小地图

- 标记从 if/else 换成一张表：`MARKS: Partial<Record<ObjKind, {color, size, show?(o)}>>`。
- 佣兵画成一个绿点，D2 怎么画待查。
- 新物件默认不标（推断，待查）。

### 2.7 声音

- **声音类别**：`voice` 加 `'bird' | 'goat' | 'rogue'`。
- **monster 组**加 `die_bird`、`die_goat`、`die_rogue`、`hurt_rogue`、`nest_hatch`、`raven_summon`。
- **env 组**加 `casket`、`well`、`search`。
- **兜底**：每个新 id 都配一个现有的合成音，录音没做出来时也不会没声音。
- **死亡声**：`game.ts` 里的三元式换成 `sounds.ts` 的 `DEATH_SOUND: Record<Voice, SoundId>`。
- **墓穴环境**：`ENVIRONS` 加 `crypt`；`AREA_ENVIRON` 里 cave1、cave2 用 cave，crypt、mausoleum 用 crypt。

### 2.8 任务

- 存档形状不用改，标志本来就存在 `progress[d].quests` 里。
- `QuestHost` 加 `hasMerc()`、`giveFreeMerc(): boolean`，第 0 步先写成桩，返回 `false`。
- `Monster.quest?: QuestKey`：只有荒冢的 `presetMonsters` 放出的绯鸦带 `'a1q2'`，试炼场、秘境里的不带。
- `quests.monsterKilled(m, killer)`：绯鸦算不算完成，看主角当时站在哪（同一地块或相邻），不看是谁杀的。

### 2.9 区域、排序、连接图，bot 和 bench 的路线

- **新区域**：`areas.ts` 定义 9、13、18、19，键是 `cave1`、`cave2`、`crypt`、`mausoleum`。这些键会进存档和声音表，定了就不再改。名字从改名表读。
- **`BUILT` 按区域编号排**，拆成 `src/world/built-west.ts`（W 线管）和 `src/world/built-dungeons.ts`（D 线管），由 `areas.ts` 合起来。
- **连接图**：`areaLinks(id)` 从 `D2X_AREAS` 的 `walk`、`warps` 双向取；`routeTo(from, to)` 只在造好的区域里做广度优先搜索。`nextArea` 只留给调试面板用。
- **bot 和 bench**：路线改成一份行程，两站之间用 `routeTo` 找路。
- **后台下载顺序**：按连接图上离营地的远近排，needs.test 可能要跟着调（推断）。
- **测试**：areas.test 断言三件事：
  - `routeTo(1,3) = [1,2,3]`、`routeTo(1,8) = [1,2,8]`；
  - 不经过没造好的区域；
  - 传送点面板的顺序是 1、3、4。

### 2.10 地图登记和区域种子

- `maps.ts` 里加 `DUNGEON_MAKERS: Record<number, (seed, difficulty) => Layout>`，巢穴暂时还用 `generateDen`。
- `levelSeed(worldSeed, id) = (worldSeed + id) >>> 0`，照 D2 的 nLevelId + dwStartSeed。巢穴的种子留到 D 线换生成器时一起换。
- 存档只记区域，不记位置，所以换种子、换生成器都不会破坏存档。
- 尸体：`kept()` 包含所有地下城的地图；被放掉的地图上的尸体挪回营地，这是已有的规则。

### 2.11 合并地基分支并接线

**能干净合并**：三个分支都只加了文件。maze 分支改过的 `tools/d2-import.mjs`、`tools/d2-validate.mjs`，集成线上没动过。

**合并顺序**：calc → maze → art。每合一个都跑：
- tsc、npm test；
- `node tools/d2-import.mjs` 后 `git diff --exit-code src/data/d2x`，应该没有变化；
- `node tools/d2-validate.mjs`。

**calc 合并后的跟进，在第 0 步里集中做**（要重新生成 d2x，免得几条线各自生成）：
- `tools/d2/skills.mjs` 保留 aurastat、passivestat 的列号，`skillcalc` 改成按列号读。
- `monai.ts` 的 `dm` 和 skillcalc 的 `dm` 合成一个，以照 D2Skills.cpp 写的 skillcalc 版为准；看 d2-ai 测试里的光环数值变没变。
- 可选：两个 `D2Seed` 合成 `src/game/d2/seed.ts`。

**art 分支**：三张贴图是 1024²，没有经过 ai-textures 缩，合并时不进 `public/textures`（会直接进发布包）。A 线给它们加 `SPAN` 后用工具重做。`build-models.mjs` 的 `CHARACTER` 和 `budget` 不认 `merc_` 前缀，A 线要加。

**接线**：
- `skillcalc` 的半径经过 `monai.subtiles` 换算，单位定下来就自动跟着对；
- `hireling.ts` 给 M 线、Q 线用；
- `dungeons.ts` 给 `maps.ts` 用；
- `objgroups.ts` 的 `SUB` 读统一的单位常量。

### 2.12 界面和渲染

- **面板**：`openPanel` 加 `'hire'`、`'merc'`（先显示「还没做」）；加 `mercChanged?()`。
- **柯霞**：`kind: 'hire'` 的服务也造成 `'vendor'` 物件，用 `serves` 决定菜单里显示「雇佣」。她在营地里的位置在第 0 步就放进 `presets.ts`。
- **从 `renderer.ts` 搬出**（纯搬，看场景截图确认没变）：
  - `makeObjectView` → `render/objviews.ts`；
  - 墙的材质和高度表 → `render/walls.ts`；
  - 新建友方视图的挂点 `render/friends.ts`。

## 3. 距离单位

**两套换算**
- **甲**：1 子格 = 0.327 米。由 `stats.ts:144` 从主角跑步速度推出来（4.6 米/秒 = 速度 9）。用在移动速度、`monstats.ts` 的飞行距离和爆炸、`monai.ts` 的 `subtiles()`（察觉、寻路、近战够得着、随从拴绳、各种范围、光环半径）、`ai.ts` 的阈值，还有 calc 分支的半径。
- **乙**：1 子格 = 0.25 米。`zone.ts:23` 的 `OUT_SCALE` 定 1 个 D2 格 = 1.25 米。用在大地图和区域的大小、迷宫的格子、`objgroups.ts` 的物件尺寸和间距。

**混用的结果**：怪的各种距离、光环和爆炸半径，相对地图都比原版大 1.31 倍。例如察觉距离 35 子格：按甲是 11.4 米，按乙是 8.75 米；选目标的上限 55 子格：18 米对 13.75 米。

**三种做法**
1. **全按甲，地图放大到 1.635 倍**：推翻「1.25 倍」的决定，已发布的野外全部变样。不推荐。
2. **全按乙，速度也跟着换**：完全照原版的比例和节奏，但主角跑步从 4.6 米/秒降到 3.52 米/秒，慢 24%。要用户拍板。
3. **长度全按乙，速度保留，写成近似系数 `PACE ≈ 1.308`**：距离相对地图全部照原版，手感不变；唯一的偏差是移动比原版快 1.31 倍。飞行物的射程照原版，所以飞行时间要除以 `PACE`。以后要原版节奏，把 `PACE` 改成 1 就行。

**迁移（以第 3 种为例）**
1. 新文件 `src/core/units.ts`：
   - `M_PER_D2_TILE = 1.25`；
   - `M_PER_SUBTILE = 0.25`；
   - `D2_MPS_PER_VELOCITY = M_PER_SUBTILE * 25 / 16`；
   - `PACE = (4.6 / 9) / D2_MPS_PER_VELOCITY`；
   - `MPS_PER_VELOCITY = D2_MPS_PER_VELOCITY * PACE`。
2. `stats.ts` 从这里转出来，名字不变。
3. `zone.ts` 的 `OUT_SCALE = M_PER_D2_TILE`，`objgroups.ts` 的 `SUB = 1 / M_PER_SUBTILE`。
4. `monstats.ts` 的飞行时间除以 `PACE`。
5. `ai.ts`、`monai.ts`、`skillcalc` 都经过 `subtiles()`，自动跟着变。
6. 测试：
   - d2-monsters 的飞行时间断言要改，hero-d2 的速度不变；
   - 重跑 monsters、smoke 场景，两个职业的 bot 和 bench；
   - 这个提交里重新记一次 replay 摘要。

## 4. 分工

### 4.1 第 0 步（在集成线上按顺序做）

① 合并 → ② 护栏测试 → ③ G1–G7 → ④ 从 renderer 搬三块 → ⑤ 单位 → ⑥ 接口。

⑥ 的顺序：
1. `killer` 参数；
2. 怪物能以友方为目标；
3. 佣兵骨架和存档约定；
4. Layout、物件、墙、交互动词、小地图；
5. 声音 id；
6. 新区域、两份 BUILT、连接图、bot/bench 路线；
7. 地图登记表和 `levelSeed`；
8. 各种钩子和桩函数。

验收：发布前清单全部跑过；除了 ⑤，replay 摘要始终不变。

### 4.2 并行的几条线（第 0 步之后）

| 线 | 只改这些 | 依赖 | 做完的标准 | 存档风险 |
| --- | --- | --- | --- | --- |
| W 西块大地图 | `overworld.ts`、`zone.ts`、`presets.ts`、`built-west.ts`、`arealooks.ts`、`render/walls.ts`、`spawn.ts` 的 `presetMonster` | 第 0 步 | overworld、west、seamless、seams、spawn 测试（荒冢里只有一只绯鸦，带 a1q2；罗喀倪秀在凯恩之石旁）；overworld 场景截图；每块区域跑一次 bench | 列石荒野的传送点存得进去；在列石存档后刷新回到列石；旧版本读到区域 4 时回营地 |
| D 地下城 | `maps.ts` 的造图表、`built-dungeons.ts`、`dungeons.ts`、`maze.ts`、`objgroups.ts`、`levelgen.ts` 的主题 | 第 0 步；A 的贴图 | 每个地下城都能建出来、上下楼梯来回、同一种子同一张图、两个墓不同、房间数 12/24/36、每张不超过 200 ms；巢穴换成新的以后涤荡邪巢仍能完成；手机上看洞里的亮度 | 在墓窖里存档、刷新；在墓窖里死，刷新后尸体在营地、东西不少 |
| O 物件 | `containers.ts`、`loot.ts`、`render/objviews.ts`、`needs.ts` 的 `objectNeeds`、`spawn.ts` 的 `spawnOne` | 第 0 步 | 每种物件只能用一次；带锁的箱子只扣一把钥匙；超级宝箱 580/397 的规则；井有使用次数；石棺出怪约 18% | 钥匙数一把不多不少 |
| M 佣兵 | `merc.ts`、`mercai.ts`、`kills.ts`、`fight.ts`、`render/friends.ts`、`needs.ts`、`ui/hire.ts`、`ui/merc.ts` | 第 0 步、calc | 雇佣付钱；换佣兵时旧装备还给主角（背包 → 个人储物箱 → 储物箱旁），先确认，件数不变；穿脱件数不变；主角死时她也死，复活只付一次；经验分成；怪会选她；persist 场景带着她走刷新、回标题、交接；bot 带她跑一局 | 最重的一条：每个移动物品的操作都逐件清点；雇佣和换装后马上存档；老存档读写不变 |
| B 绯鸦和怪物 | `ai.ts`、`combat.ts` 的 `playerStrike`、`data/monsters.ts` | 第 0 步 | 僵尸从她脚下起来；累计上限 8/10/12；急射只射一支；raven2 不射；她死后 35 子格内的亡灵倒下，没经验、不掉东西；带盾的枯骸格挡 10% | 没有 |
| A 美术声音 | 贴图、`ai-textures.mjs`、`models-src`、`build-models.mjs`、`public/models`、`model-list.ts`、`audio-src`、`public/audio`、`files.ts`、CREDITS | 无；花额度前先查剩余 | 模型、声音、体积测试（现在 38.86 MB，上限 44 MB）；相似度查重（规则 6）；sfx、audio、music 场景 | 没有 |
| Q 姐妹之冢 | `quests/sisters.ts`、`quests/control.ts`、`data/dialogue.ts`、台词审阅页 | M、B、W | 领奖要站在她的地块或相邻；免费佣兵只给一次；已有佣兵就不给；噩梦不受影响；秘境里不算 | a1q2 的标志刷新、换难度后不丢，也不重复给 |
| R 秘境跟进 | `world/rift.ts` 的地下城小层改用迷宫 | D | rift 测试和场景 | 秘境照旧不存 |

### 4.3 第 0 步之后，共享文件归谁

- **谁都不再改**：`game.ts`、`areas.ts`、`levelgen.ts` 的 Layout、`objects.ts`、`sounds.ts` 的 id 表、`ui.ts` 的 USE_VERB、`automap.ts` 的标记表、`renderer.ts`。
- **只有一条线改**：`ai.ts`、`combat.ts` 归 B，`presets.ts` 归 W，`save.test` 归 M。
- **两条线改同一个文件、但各改各的函数**：`spawn.ts`（W 和 O）、`needs.ts`（O 和 M）。
- **生成的文件**：`d2x/*` 只在第 0 步生成；`model-list.ts`、`files.ts` 只由 A 生成。
- **合并顺序**：
  - A 随时可以合；
  - W、D、O、B、M1 各自合之前，在集成线最新的提交上把清单全跑一遍；
  - 然后 M2，Q 排在 D 之后，最后 R；
  - 全部合完以后：跑发布前清单和每块区域的 bench，请用户在 iPhone 上量一次，更新 PROJECT-MAP 和 M2A。

## 5. 要查清的（推断）

- 「佣兵在营地里也不算目标」：对照 D2MOO 的 `AIUTIL_CanSelectHostileTarget`。
- 佣兵击杀时：掉落用谁的寻宝率；每杀回血回蓝是不是只算杀手本人。
- 小地图上佣兵、棺材、井在 D2 里怎么画。
- 绯鸦领奖说的「地块」：建议按 D2 房间 10 米算，不按大地图 8 米的单元格算。
- 界面上的「码」：D2 怎么把子格换成说明里的码，留给 A5 去查。
- 洞里不点火把：确认 `Layout.torches` 为空时，renderer 不会另外补火把。
