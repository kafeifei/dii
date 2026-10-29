# models-src/ai 里 M2a 新做的模型

这两个模型是本项目用 AI 生成的，不是 CC0，也不是暴雪的美术资源：设定图用图像模型按统一的风格版画，Meshy 建模、绑骨，动作来自 Meshy 动作库，最后由 `tools/meshy-merge.mjs` 按 `tools/meshy-chars.mjs` 合成到这里。其余模型的来源见 `public/models/CREDITS.md`。

它们还没有接进游戏，也没有进 `public/models`。接进去时，`public/models/CREDITS.md` 人形那一行要加上 `merc_rogue`（`mon_bloodraven` 已经在 `mon_*`（人形）里）。

| 文件 | 内容 | 怎么来的 | Meshy 积分 |
| --- | --- | --- | --- |
| `merc_rogue.glb` | 流离者斥候（佣兵）：和营地女游侠 `npc_rogue` 同一个网格；待机、走、跑、射箭、受击、死亡 | 2026-10-09 的女游侠模型（avatar `viewer/public/models/rogue/model.glb`），2026-10-29 在 Meshy 重新绑骨（原来的绑骨任务 Meshy 已经不保留了），动作库 243 待机 3、224 射箭、178 受击、189 向后倒地；走、跑是绑骨附带的免费动作 | 绑骨 5、动作 12 |
| `mon_bloodraven.glb` | 绯鸦：原创的堕落女游侠队长，苍白，暗红和黑色皮甲，鸦羽披肩、鸦纹胸甲、鸦头骨扣，黑发长辫；空手，长战弓由代码挂上 | 2026-10-29 只凭文字描述画的设定图（avatar `pipeline/sets/act1.mjs` 的 `bloodraven`，参考图只有我们自己的风格版），从没用过原版的任何图片；Meshy 多视图建模、绑骨，动作库 243 待机 3、89 战斗姿态、1 女式走、14 跑、224 射箭、125 蓄力施法、178 受击、189 向后倒地 | 设定图 12、建模 30、绑骨 5、动作 24 |

Meshy 的任务号在 avatar 的 `pipeline/state/merc_rogue.json`、`pipeline/state/bloodraven.json` 和 `pipeline/state/batch-act1.json`。
