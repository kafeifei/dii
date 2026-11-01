# 特效图片来源

这里的图片全部来自 CC0（公有领域）素材，可以免费商用、修改，不强制署名，署名是出于感谢。由 `tools/fx-sheets.mjs` 下载原图（放在 `models-src/fx/`，不入库），缩放、预乘后拼成 WebP，网格和每格是什么在 `src/render/sprites.ts` 的 `SHEETS`、`SPRITE`、`GROUND`、`BOLT`。

| 文件 | 内容 | 来源 | 作者 | 授权 |
| --- | --- | --- | --- | --- |
| `fireball` | 翻滚的火球，8×8 帧循环（FireBall01） | [Free VFX Image Sequences & Flipbooks](https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks)，Houdini 流体模拟渲染 | Unity Labs | CC0 1.0 |
| `flame` | 一缕火苗，16×4 帧循环（Flame03） | 同上 | Unity Labs | CC0 1.0 |
| `blaze` | 宽一点的火苗，16×4 帧循环（Flame02） | 同上 | Unity Labs | CC0 1.0 |
| `explosion` | 火球炸开化成黑烟，5×5 帧（Explosion01），带透明度 | 同上 | Unity Labs | CC0 1.0 |
| `smoke` | 翻滚的灰烟团，8×8 帧循环（WispySmoke01），带透明度，游戏里染成冷雾、毒雾、尘土 | 同上 | Unity Labs | CC0 1.0 |
| `sprites` | 光点、星芒、电弧、烟团、刀光、碎屑、圆环、漩涡等 19 个粒子图，5×4 | [Particle Pack 1.1](https://kenney.nl/assets/particle-pack) | Kenney | CC0 1.0 |
| `bolts` | 四道竖着的闪电（每张原图中间的一半，横着的那张转过来），4×1 | 同上 | Kenney | CC0 1.0 |
| `ground` | 地面的光晕、漩涡、圆环、焦痕、烟环，4×2 | 同上 | Kenney | CC0 1.0 |
