# 声音来源

**音效与配音由 ElevenLabs 生成**（[elevenlabs.io](https://elevenlabs.io)）：音效和环境声用它的文字生成音效（Sound Effects），配音用文字转语音（Text to Speech）和它的预置音色。账号是免费档：按 ElevenLabs 的条款，免费档生成的内容不能商用，发布时要注明 elevenlabs.io。每个文件的元数据里也写着 elevenlabs.io。

这些文件由 `tools/ai-audio.mjs` 按 `tools/audio/list.mjs` 生成：ElevenLabs 的原始输出留在 `audio-src/`（不入库），再用 ffmpeg 和 `tools/audio/dsp.mjs` 后期处理（去掉首尾静音、响度归一，环境声做成无缝循环）后编码成 AAC（.m4a）。没有录音的声音仍由代码实时合成（`src/audio/sfx.ts`），音乐是代码现场作曲的（`src/audio/score.ts`）。

本文件由 `tools/ai-audio.mjs` 生成，不要手改。`public/audio/` 里的每个录音都在下表，提示词或台词是生成它时用的那一版。

| 文件 | 类型 | 提示词或台词 | 模型 | 音色 | 生成于 |
| --- | --- | --- | --- | --- | --- |
| `combat.swing.1.m4a` | 音效 | a single fast sword swing whoosh through the air, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.gold.1.m4a` | 音效 | a small handful of gold coins dropped onto a stone floor, a few bright metallic clinks, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `amb.town.1.m4a` | 环境声（循环） | camp ambience: a crackling campfire close by, a soft steady wind over an open moor, no voices, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
