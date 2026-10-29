# 给代理的说明

动手之前先读 `docs/PROJECT-MAP.md`：模块、存档存什么和什么时候存、必须守住的规则、测试和发布清单都在那里。计划和进度在 `docs/PLAN.md`，M2a 的决定在 `docs/M2A.md`。

## 不能破坏的
- 存档不丢、不复制物品；玩着的东西一定存得下来，存不下来就让游戏停下或一直提示（PROJECT-MAP「必须守住的规则」）。
- 规则照原版（D2R 2.7 的资料片列、D2MOO），注释写明出处；原版没有的数要注明是近似。
- 名字全部走改名表 `tools/d2-names/`。`src/data/d2x/` 是生成的，不要手改：改了表就跑 `node tools/d2-import.mjs`，再跑 `node tools/d2-validate.mjs`。
- 原版图片只用来认清物品，不进仓库、不喂给模型、不描。
- 模型只在 box 上跑，不在这台 Mac 上跑；box 的 GPU 和 Ollama 共用，先看 `nvidia-smi`，有人在用就别占。

## 怎么检查
- `npx tsc --noEmit`、`npm test`。
- 场景：`node tools/play.mjs tools/scenarios/<名>.mjs --url "http://localhost:<端口>/?dev" --out <新目录>`，一次跑一个；`persist` 不带 `?dev`。截图要看。
- 开发服务器用自己的端口（5181–5196），`PORT=<端口> npx vite --strictPort`，用完 kill 掉。5174 是用户在玩的，不碰。

## 命令和提交
- 不用 `rm`、`rmdir`、`unlink`、`find -delete`；组合命令不要以 `cd` 开头，用绝对路径、`git -C`、`npm --prefix`。不然会弹审批框，后台代理就卡住了。
- 不推送任何分支和 tag。
- 提交说明：标题「范围: 改了什么」，正文一到三句。
- 密钥（ElevenLabs、Tripo、Meshy）都在钥匙串里，由工具自己读；不要打印，不要写进文件或命令输出。

## 发布
照 PROJECT-MAP「发布」一节：清单全部通过后发 Vercel 和内部站点，再在主检出把 `main` 快进到发布的提交，打本地 tag。
