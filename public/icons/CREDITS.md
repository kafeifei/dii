# 物品图来源

背包里的物品图（`public/icons/items/`）全部是为本游戏生成的：在我们自己的 GPU 机器上用开源模型按同一种风格（painterly realism）画出来，不是任何游戏的美术资源。

| 步骤 | 模型 | 许可 | 图数 |
| --- | --- | --- | --- |
| 作画 | [black-forest-labs/FLUX.2-klein-4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) | Apache-2.0 | 400 |
| 抠图 | [ZhengPeng7/BiRefNet](https://huggingface.co/ZhengPeng7/BiRefNet) | MIT | 400 |

两个模型都是开放许可，可以商用、修改。

图怎么分照《暗黑破坏神 II》（D2R 2.7 的表，`tools/icons/pictures.mjs`）：一张图对应一个 invfile，同一条底材线的普通、扩展、精英三档共用一张；戒指、护符、珠宝、护身符各有几种外观，物品生成时定下一种；一部分暗金和套装物品有自己的图，其余显示底材的图。物品的颜色不画在图上：D2 给图调色，我们的近似见 `tools/icons/colours.py`（游戏里同样的算法在 `src/ui/recolour.ts`）。

原版的图只用来认清每件物品是什么（种类、比例、标志性的部件），从不交给模型（不做图生图、不当参考图），也不描、不量。每张图的文字描述（`tools/icons/desc/`）和形状参考（`tools/icons/box/guides.py` 画的通用平面形状）都是我们自己写、自己画的；暗金和套装的图以我们自己的底材图为参考重新设计。每张图导出前都和对应的原版图比过相似度（`tools/icons/similarity.py`，只用 numpy 和 PIL），分数到界线的重画，接近界线的再并排对照看过。

| 图 | 张数 |
| --- | --- |
| 底材 | 299 |
| 外观变体（戒指、护符、珠宝、护身符） | 23 |
| 暗金专属 | 73 |
| 套装专属 | 5 |
| 合计 | 400 |

每张图两个文件：`<图名>.webp`（2×，一格 68 px，给高分屏）和 `<图名>.1x.webp`（1×，一格 34 px，略锐化）；图名是 D2 的 invfile 名，小写。每张图的提示词、种子、批次、形状参考和模型记在 `tools/icons/made/<列表>.json`。

本文件由 `tools/ai-icons.mjs` 生成，不要手改。
