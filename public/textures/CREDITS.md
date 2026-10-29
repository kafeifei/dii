# 贴图来源

地面和墙面贴图（`public/textures/`）全部是本项目用 AI 生成的，不是任何游戏的美术资源：都在 avatar 项目里按同一套风格版画出来，原版的图从不交给模型。

2026-10-26 起的贴图由 avatar 的 `pipeline/textures.mjs` 生成：Meshy 的图生图（`gpt-image-2-5-sunburst`，每张 12 积分），每张一段提示词加风格版的文字（`pipeline/sets/style.mjs` 的 STYLE），参考图只用风格版和我们已经认可的贴图；再由 `pipeline/seamless.py` 做成两个方向都能平铺的无缝图，最后由 `tools/ai-textures.mjs` 转成 1024×1024、质量 85 的 webp。

| 文件 | 内容 | 参考图 | 生成于 |
| --- | --- | --- | --- |
| `grotto_floor` | 第一幕土洞的地面：灰褐的压实土和洞底淤土，露出平的基岩，碎石、砂砾，不带红色 | `wild_road`、`crypt_floor`、`crypt_wall` | 2026-10-29 |
| `grotto_wall` | 第一幕土洞的墙：成层、开裂的灰褐沉积岩和压实土，缝里塞着砂砾和细根，不带红色 | 同上 | 2026-10-29 |
| `stony_dirt` | 列石荒野的地面：碎石和粗砂上散着半埋的扁平石块，石缝里稀疏的枯草 | `wild_road`、`wild_grass`、`crypt_floor` | 2026-10-29 |
| `wild_grass`、`wild_dirt`、`wild_road` | 野外的草地、落叶地、土路 | 环境风格图、`town_floor`、`crypt_floor` | 2026-10-26 |
| `cave_*`、`crypt_*`、`hell_*`、`ice_*`、`town_*` | 血岩洞窟、墓穴、地狱、冰窟、营地的地面和墙 | — | 2026-10-09，和风格版一起画的基准资源（avatar `concept/style/STYLE.md`） |

2026-10-29 的三张没有用环境风格图作参考：它上面那块红色洞底会把洞穴染红。每张的提示词在 avatar 的 `pipeline/textures.mjs`，Meshy 任务号在 `pipeline/state/textures.json`。
