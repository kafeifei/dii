# 模型来源

这里的模型全部是 CC0（公有领域）授权，可以免费商用、修改，不强制署名。署名是出于感谢。

| 文件 | 来源 | 作者 | 授权 |
| --- | --- | --- | --- |
| `knight`、`barbarian`、`mage`、`axe_*` | [KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | Kay Lousberg | CC0 1.0 |
| `skeleton_*` | [KayKit Character Pack: Skeletons](https://kaylousberg.itch.io/kaykit-skeletons) | Kay Lousberg | CC0 1.0 |
| `d_*` | [KayKit Dungeon Remastered](https://kaylousberg.itch.io/kaykit-dungeon-remastered) | Kay Lousberg | CC0 1.0 |
| `q_*` | Quaternius 怪物模型（经 [poly.pizza](https://poly.pizza/u/Quaternius) 获取） | Quaternius | CC0 1.0 |

原始文件由 `tools/fetch-models.mjs` 下载到 `models-src/`（不入库），再由 `tools/build-models.mjs` 裁剪动画、压缩顶点后输出到这里。
