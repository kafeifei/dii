# 模型来源

这里大部分模型是本项目用 AI 生成的；剩下几个来自 CC0（公有领域）模型包，可以免费商用、修改，不强制署名，署名是出于感谢。

| 文件 | 来源 | 作者 | 授权 |
| --- | --- | --- | --- |
| `knight`、`skeleton_minion` | [KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)、[Skeletons](https://kaylousberg.itch.io/kaykit-skeletons) | Kay Lousberg | CC0 1.0 |
| `d_shelf_large` | [KayKit Dungeon Remastered](https://kaylousberg.itch.io/kaykit-dungeon-remastered) | Kay Lousberg | CC0 1.0 |

`knight` 只在 `?knight` 调试时用，`skeleton_minion` 只提供 KayKit 骨架的动作库。

其余全部是本项目用 AI 生成的，不是 CC0：设定图用图像模型按统一的风格版画，再用 Meshy 建模（人形角色和怪物还经过 Meshy 绑骨和动作库）。造型参照《暗黑破坏神 II》的风格，是原创形象，不是暴雪的美术资源。

| 文件 | 内容 | 源文件 |
| --- | --- | --- |
| `sorceress`、`paladin`、`npc_*`、`mon_*`（人形） | 职业、营地 NPC、怪物，带动作 | `models-src/ai/`，由 `tools/meshy-merge.mjs` 合成 |
| `mon_spider`、`mon_bat`、`mon_dragon`、`mon_skullfly` | 非人形怪，静态 | `models-src/ai-props/` |
| `d_*`、`h_*`、`x_*`，`axe_*`、`skeleton_*` 武器和盾 | 替换原 KayKit 地牢、墓园、营地建筑、武器的同名模型 | `models-src/ai-props/`，由 `tools/ai-props.mjs` 导入 |
| `p_*`、`w_*`、`g_*` | 营地物件和地牢装饰、新武器、地上的掉落物 | 同上 |

原始文件由 `tools/fetch-models.mjs` 下载到 `models-src/`（不入库），再由 `tools/build-models.mjs` 裁剪动画、压缩顶点后输出到这里，同时生成运行时加载清单 `src/render/model-list.ts`。
