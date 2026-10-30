# models-src/ai 里 M2a 新做的模型

这些模型是本项目用 AI 生成的，不是 CC0，也不是暴雪的美术资源：设定图用图像模型按统一的风格版画（参考图只有我们自己的风格版），只凭文字描述画，从没用过原版的任何图片；人形的由 Meshy 建模、绑骨，动作来自 Meshy 动作库，最后由 `tools/meshy-merge.mjs` 按 `tools/meshy-chars.mjs` 合成到这里；腐羽鸦由 Tripo 建模、绑骨，`tools/tripo-merge.mjs` 导入并在骨头上打关键帧；腐羽鸦窠是静态的，由 `tools/ai-props.mjs` 导入。其余模型的来源见 `public/models/CREDITS.md`。

2026-10-29 起 `merc_rogue`、`mon_bloodraven` 由 `tools/build-models.mjs` 构建进 `public/models`（`merc_` 照 `npc_` 的预算：约 9000 面、图最大 512），`public/models/CREDITS.md` 人形那一行已加上 `merc_rogue`。绯鸦这里的源文件保持 Meshy 出来的样子，底色图偏暗、红色少（平均亮度 44/255，红色图素 2.4%），构建时重新调色（`build-models.mjs` 的 `RECOLOUR`）：皮甲转成深红、饱和到约 0.6、提亮，皮肤调白偏冷，近黑的鸦羽、辫子和扣件保留色相、一起提亮；发布的图平均亮度 56，红色图素约 80%。

2026-10-30 替换了 M2a 的三个替身（羊头人用恶魔、腐羽鸦用蝙蝠、鸟巢是一棵染色的枯树；`mon_demon`、`mon_bat` 从此不再构建，列在 `build-models.mjs` 的 `UNUSED`），并给僵尸重新绑骨、加了爬起来的动作。四个都按 `mon_` 的预算构建（约 7000 面，鸟巢的细枝让简化停在 8371 面；图 512）。

| 文件 | 内容 | 怎么来的 | 积分 |
| --- | --- | --- | --- |
| `merc_rogue.glb` | 流离者斥候（佣兵）：和营地女游侠 `npc_rogue` 同一个网格；待机、走、跑、射箭、受击、死亡 | 2026-10-09 的女游侠模型（avatar `viewer/public/models/rogue/model.glb`），2026-10-29 在 Meshy 重新绑骨（原来的绑骨任务 Meshy 已经不保留了），动作库 243 待机 3、224 射箭、178 受击、189 向后倒地；走、跑是绑骨附带的免费动作 | Meshy：绑骨 5、动作 12 |
| `mon_bloodraven.glb` | 绯鸦：原创的堕落女游侠队长，苍白，暗红和黑色皮甲，鸦羽披肩、鸦纹胸甲、鸦头骨扣，黑发长辫；空手，长战弓由代码挂上 | 2026-10-29 只凭文字描述画的设定图（avatar `pipeline/sets/act1.mjs` 的 `bloodraven`）；Meshy 多视图建模、绑骨，动作库 243 待机 3、89 战斗姿态、1 女式走、14 跑、224 射箭、125 蓄力施法、178 受击、189 向后倒地 | Meshy：设定图 12、建模 30、绑骨 5、动作 24 |
| `mon_goatman.glb` | 望月部族（羊头人）：魁梧的山羊头兽人，盘角贴着头，深褐乱毛，兽皮和骨头的护甲、肩上一块肩胛骨、胸口一弯褪色的月牙；双手武器由代码按 D2 的 RHv 挂在右手 | 2026-10-26 只凭文字画的设定图（`act1.mjs` 的 `goatwarrior`），Meshy 多视图建模、绑骨，动作库 89 战斗姿态（待机）、128 重锤挥击（攻击）、178 受击、189 向后倒地，走、跑是绑骨附带的；2026-10-30 合成（没有新花积分） | Meshy（10-26）：设定图 12、建模 30、绑骨 5、动作 24 |
| `mon_foulcrow.glb` | 腐羽鸦：秃鹫大小的食腐鸦，煤黑和灰的乱羽，秃的暗红颈和头，带钩的骨色喙；悬停、平飞、扑击（刹住、爪子前伸再耙下、喙啄）、受击、死时翻倒仰躺 | 2026-10-26 只凭文字画的设定图（`act1.mjs` 的 `foulcrow`，Meshy 图生图），Tripo 单图建模、鸟类绑骨（`models-src/tripo/foulcrow/tripo.json`，60 根骨头、没有动作）；2026-10-30 在 `tools/tripo-merge.mjs` 的 `CROW` 里用代码在骨头上打关键帧：先把直立的身体前倾到水平（游戏的相机 39° 俯视，直立张翅看着像蝙蝠），翅根绕脊柱扇动、前臂和手依次滞后，翅膀上扬不超过 0.8 弧度（收拢过 1.2 会撕裂网格），简化到 7000 面 | Meshy 设定图 12；Tripo：建模 25、绑骨 20（10-26） |
| `mon_crownest.glb` | 腐羽鸦窠：约 1.5 米的朽树桩，顶上一大堆黑枝和荆条，夹着肋骨、腿骨、一个小兽头骨、灰红破布和黑羽 | 2026-10-26 只凭文字画的设定图（`act1.mjs` 的 `crow_nest`）；那时 meshy-t2 建的模型枝条和骨头成了粗块，2026-10-30 用 Meshy 最新模型从同一张设定图重新建模（`act1.mjs` 的 `crow_nest_v2`，avatar `pipeline/batch.mjs` 加了 `from`、`ai` 两个选项），`tools/ai-props.mjs` 导入（`smooth`：Meshy 把法线在每条边上拆开，焊不起来就简化不下去，去掉法线焊接、简化后重算平滑法线）；孵化的抖动、死时的塌陷是代码（`src/render/models.ts` 的 `motion: 'nest'`） | Meshy：设定图 12（10-26）、建模 30（10-30） |
| `mon_zombie.glb` | 饿殍游尸等僵尸：同一个网格（2026-10-09 的 avatar `zombie/model.glb`），重新绑骨，原来的五个动作在新骨架上重买，加了爬起来的 `Rise`（动作库 3 Arise：仰躺、坐起、撑地、站起，1.8 秒） | 2026-10-30 在 Meshy 重新绑骨（avatar 的 `zombie_rise`，原来的绑骨任务 Meshy 已经不保留了），动作库 0 待机、112 科学怪人走、214 双拳前击、178 受击、187 被击倒；从 10 个起身动作（3、344–352）里挑了 Arise，其余没用 | Meshy：绑骨 5、动作 15、候选起身动作 30 |

Meshy 的任务号在 avatar 的 `pipeline/state/merc_rogue.json`、`bloodraven.json`、`goatwarrior.json`、`zombie_rise.json` 和 `pipeline/state/batch-act1.json`。

相似度查重（规则 6，2026-10-30）：和绯鸦一样，在游戏里把每个模型单独渲染、绿幕抠出（8 个朝向，羊头人和腐羽鸦各待机、移动、攻击三种姿势，鸟巢待机和孵化两种），用 `tools/icons/similarity.py` 和原版的精灵动画逐帧比（原版图只放在会话的临时目录，不进仓库）。分数见 `docs/M2A.md`「收尾」。
