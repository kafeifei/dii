# 声音来源

**音效与配音由 ElevenLabs 生成**（[elevenlabs.io](https://elevenlabs.io)）：音效和环境声用它的文字生成音效（Sound Effects），配音用文字转语音（Text to Speech）和它的预置音色。账号是免费档：按 ElevenLabs 的条款，免费档生成的内容不能商用，发布时要注明 elevenlabs.io。这些文件的元数据里也写着 elevenlabs.io。

**音乐由 ACE-Step 1.5 生成**（[github.com/ACE-Step/ACE-Step-1.5](https://github.com/ACE-Step/ACE-Step-1.5)）：代码和模型权重都是 MIT 许可，生成的音频可以自由使用。音乐是在我们自己的 GPU 机器上用 `tools/audio/acestep.py` 生成的，不经过 ElevenLabs；每首的提示词（caption）、速度、调性、拍号、模型和种子见下表，这些文件的元数据里写的是 ACE-Step。

这些文件由 `tools/ai-audio.mjs` 按 `tools/audio/list.mjs` 生成：原始输出留在 `audio-src/`（不入库），再用 ffmpeg 和 `tools/audio/dsp.mjs` 后期处理（去掉首尾静音、响度归一，环境声做成无缝循环，音乐淡出）后编码成 AAC（.m4a）。没有录音的声音仍由代码实时合成（`src/audio/sfx.ts`），还没有录音的区域，音乐由代码现场作曲（`src/audio/score.ts`）。

本文件由 `tools/ai-audio.mjs` 生成，不要手改。`public/audio/` 里的每个录音都在下表，提示词或台词是生成它时用的那一版。

| 文件 | 类型 | 提示词或台词 | 模型 | 音色 | 生成于 |
| --- | --- | --- | --- | --- | --- |
| `combat.swing.1.m4a` | 音效 | a single fast sword swing whoosh through the air, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.swing.2.m4a` | 音效 | a single fast sword swing whoosh through the air, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.swing_blunt.1.m4a` | 音效 | a single heavy mace swung through the air, a deep thick whoosh, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.swing_blunt.2.m4a` | 音效 | a single heavy mace swung through the air, a deep thick whoosh, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.swing_heavy.1.m4a` | 音效 | a huge two-handed weapon swung in a wide slow arc, a long deep powerful whoosh, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.swing_heavy.2.m4a` | 音效 | a huge two-handed weapon swung in a wide slow arc, a long deep powerful whoosh, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.hit.1.m4a` | 音效 | a sword striking flesh, a short wet meaty slash impact, close, dry, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.hit.2.m4a` | 音效 | a sword striking flesh, a short wet meaty slash impact, close, dry, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.hit_heavy.1.m4a` | 音效 | a brutal crushing blow into a body, a heavy bone-crunching thud, close, dry, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.hit_heavy.2.m4a` | 音效 | a brutal crushing blow into a body, a heavy bone-crunching thud, close, dry, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.hit_bone.1.m4a` | 音效 | a weapon striking a skeleton, a dry hollow crack of bone and a short rattle, close, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.hit_bone.2.m4a` | 音效 | a weapon striking a skeleton, a dry hollow crack of bone and a short rattle, close, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.block.1.m4a` | 音效 | a sword blow blocked by a metal shield, a sharp metallic clang ringing briefly, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.block.2.m4a` | 音效 | a sword blow blocked by a metal shield, a sharp metallic clang ringing briefly, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `combat.arrow.1.m4a` | 音效 | a bow string released and an arrow whooshing away, short, close, dry, no impact, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.swing.1.m4a` | 音效 | a monster's claw swiping through the air, a short rough whoosh, close, dry, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.die.1.m4a` | 音效 | an undead ghoul dying, a short guttural groan and its body collapsing onto the ground, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.die.2.m4a` | 音效 | an undead ghoul dying, a short guttural groan and its body collapsing onto the ground, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.die_imp.1.m4a` | 音效 | a small demonic imp dying, a short high-pitched shriek cut off, then a light body thud, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.die_imp.2.m4a` | 音效 | a small demonic imp dying, a short high-pitched shriek cut off, then a light body thud, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.die_large.1.m4a` | 音效 | a huge beast dying, a deep roaring death groan and a heavy body crashing onto the ground, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.die_bone.1.m4a` | 音效 | a skeleton collapsing into a pile of bones, dry bones clattering and scattering on a stone floor, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `monster.die_bone.2.m4a` | 音效 | a skeleton collapsing into a pile of bones, dry bones clattering and scattering on a stone floor, no voice, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop.1.m4a` | 音效 | a wooden staff dropped onto stony ground, a hollow wooden clack and a short roll, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_potion.1.m4a` | 音效 | a small glass potion bottle dropped onto stone, a bright glassy clink and a slosh of liquid, not breaking, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_potion.2.m4a` | 音效 | a small glass potion bottle dropped onto stone, a bright glassy clink and a slosh of liquid, not breaking, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_ring.1.m4a` | 音效 | a small gold ring dropped onto a stone floor, a tiny bright metallic ting and a short spin, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_amulet.1.m4a` | 音效 | a metal amulet on a fine chain dropped onto stone, a delicate jingle of chain links, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_gem.1.m4a` | 音效 | a cut gemstone dropped onto a stone floor, a crisp crystalline click with a tiny glassy chime, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_weapon.1.m4a` | 音效 | a steel sword dropped onto a stone floor, a heavy metallic clang and a short rattle, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_weapon.2.m4a` | 音效 | a steel sword dropped onto a stone floor, a heavy metallic clang and a short rattle, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_armor.1.m4a` | 音效 | a chainmail armor dropped onto the ground, a heavy metallic rattle of rings settling, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_armor.2.m4a` | 音效 | a chainmail armor dropped onto the ground, a heavy metallic rattle of rings settling, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_leather.1.m4a` | 音效 | a pair of heavy leather boots dropped onto a wooden floor, a clear dull leather thud, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_rune.1.m4a` | 音效 | a small carved stone rune dropped onto stone, a solid stony clack followed by a deep mysterious resonant chime, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drop_unique.1.m4a` | 音效 | a magical treasure reveal stinger for a fantasy game, a bright shimmering golden chime swell over a soft deep hum, no melody, no drums | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.gold.1.m4a` | 音效 | a small handful of gold coins dropped onto a stone floor, a few bright metallic clinks, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.gold.2.m4a` | 音效 | a small handful of gold coins dropped onto a stone floor, a few bright metallic clinks, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.pickup.1.m4a` | 音效 | picking up a small item from the ground, a quick soft rustle of cloth and leather, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.pickup.2.m4a` | 音效 | picking up a small item from the ground, a quick soft rustle of cloth and leather, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.move.1.m4a` | 音效 | an item placed into a leather backpack, a short soft leather and cloth shuffle, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.equip.1.m4a` | 音效 | putting on a piece of armor, a short metallic buckle clink and a leather strap pulled tight, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.socket.1.m4a` | 音效 | a gem snapping firmly into a metal socket, a solid click and a bright magical ping, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.runeword.1.m4a` | 音效 | an ancient magical power awakening, a deep resonant gong-like swell with a bright shimmering sparkle on top, fantasy, no melody, no drums | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.transmute.1.m4a` | 音效 | an alchemical transmutation inside a small wooden box, a magical swirling whoosh ending in a soft bright chime, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `item.drink.1.m4a` | 音效 | drinking a potion from a small glass bottle, two quick gulps and a soft glassy clink, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `player.level_up.1.m4a` | 音效 | a triumphant magical level up sound for a dark fantasy game, a rising bright shimmering swell ending in a warm radiant chord, no drums | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.click.1.m4a` | 音效 | a single soft click of a small wooden button, very short, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.open.1.m4a` | 音效 | opening a leather satchel, a short soft leather flap and a rustle of parchment, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.close.1.m4a` | 音效 | closing a leather satchel, a short soft muffled leather flap thump, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.coins.1.m4a` | 音效 | a few gold coins counted into a hand, a short bright jingle, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.skill_learn.1.m4a` | 音效 | a short magical glow sound, a soft bright shimmer rising, fantasy, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.no_mana.1.m4a` | 音效 | a magic spell fizzling out, a short dull airy puff with a faint sputter, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.no_room.1.m4a` | 音效 | a short dull muffled thump of a stuffed leather bag, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.no_gold.1.m4a` | 音效 | an almost empty coin purse shaken once, a short dull rattle of a single coin, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.cant_use.1.m4a` | 音效 | a short low dull wooden knock, a refusal sound, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `ui.denied.1.m4a` | 音效 | a short low muted stone thud, a failure sound, close, dry, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.chest.1.m4a` | 音效 | a heavy wooden treasure chest creaking open, iron hinges squeak and the lid thuds back, close, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.barrel.1.m4a` | 音效 | a wooden barrel smashed open, wooden planks splintering and falling apart, close, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.barrel.2.m4a` | 音效 | a wooden barrel smashed open, wooden planks splintering and falling apart, close, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.shrine.1.m4a` | 音效 | an ancient stone shrine activating, a deep holy resonant hum swelling with a bright shimmering chime, fantasy, no melody | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.portal_open.1.m4a` | 音效 | a magical blue portal opening, a swirling whoosh rising into a humming resonant shimmer, fantasy, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.portal_enter.1.m4a` | 音效 | stepping through a magic portal, a quick deep whoosh and a warping shimmer, fantasy, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.waypoint.1.m4a` | 音效 | an ancient waypoint teleporter activating, a deep magical hum and a rising airy shimmer ending in a soft whoosh, fantasy, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `env.vendor_heal.1.m4a` | 音效 | a gentle healing spell, a soft warm shimmering chime with a soft breath of air, fantasy, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `amb.town.1.m4a` | 环境声（循环） | camp ambience: a crackling campfire close by, a soft steady wind over an open moor, no voices, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `amb.town_night.1.m4a` | 环境声（循环） | camp at night ambience: a crackling campfire close by, crickets chirping in the grass, a soft night wind, a distant owl, no voices, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `amb.wild.1.m4a` | 环境声（循环） | wild moor by day ambience: a steady cold wind over open grassland, grass rustling, a few distant birds calling far away, no voices, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `amb.wild_night.1.m4a` | 环境声（循环） | wild moor at night ambience: a cold wind over open grassland, crickets chirping steadily, grass rustling, no birds, no voices, no music | eleven_text_to_sound_v3 | — | 2026-10-26 |
| `music.town.1.m4a` | 音乐 | solo acoustic guitar for a dark fantasy video game camp, slow rubato fingerpicking on steel strings, phrygian and flamenco touches, long pauses between phrases, a faint low drone underneath, wind-swept and weary, melancholic, intimate, room reverb, no drums, instrumental（60 BPM，E minor，每小节 3 拍，150 秒） | ACE-Step 1.5 acestep-v15-xl-sft + acestep-5Hz-lm-1.7B，种子 111 | — | 2026-10-27 |
| `music.town.2.m4a` | 音乐 | dark medieval fantasy village theme for a video game, slow melancholic solo acoustic guitar, fingerpicked nylon strings with a phrygian flamenco feel, soft low ambient pads, distant hand drum, sparse and lonely, lots of space and reverb, weary refuge in a hostile land, instrumental（66 BPM，D minor，每小节 3 拍，150 秒） | ACE-Step 1.5 acestep-v15-xl-sft + acestep-5Hz-lm-1.7B，种子 101 | — | 2026-10-27 |
| `music.wild.1.m4a` | 音乐 | dark ambient fantasy wilderness soundtrack for a video game, ominous low string drones, eerie wordless distant choir pads, sparse deep tribal drum hits, faint plucked guitar notes, desolate moor at dusk, slow building tension, cinematic, haunting reverb, instrumental（60 BPM，A minor，每小节 4 拍，150 秒） | ACE-Step 1.5 acestep-v15-xl-sft + acestep-5Hz-lm-1.7B，种子 201 | — | 2026-10-27 |
| `music.dungeon.1.m4a` | 音乐 | dark ambient cave soundtrack for a video game, deep rumbling drones, metallic scrapes and resonant clangs, low dissonant strings, distant echoing percussion, unsettling and claustrophobic underground horror ambience, sparse, heavy reverb, instrumental（60 BPM，C minor，每小节 4 拍，150 秒） | ACE-Step 1.5 acestep-v15-turbo + acestep-5Hz-lm-1.7B，种子 302 | — | 2026-10-27 |
| `voice.paladin.bag_full.1.m4a` | 配音 | 「行囊已经满了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.bag_full.1.m4a` | 配音 | 「没地方放了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.cant_carry.1.m4a` | 配音 | 「我带不了更多了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.cant_carry.1.m4a` | 配音 | 「再多我可拿不动。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.cant_use.1.m4a` | 配音 | 「这东西不是给我用的。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.cant_use.1.m4a` | 配音 | 「这种东西，我用不上。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.too_weak.1.m4a` | 配音 | 「我的力量还不足以驾驭它。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.too_weak.1.m4a` | 配音 | 「它太沉了，不适合我。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.low_level.1.m4a` | 配音 | 「历练尚浅，还用不了它。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.low_level.1.m4a` | 配音 | 「还不到时候。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.no_mana.1.m4a` | 配音 | 「我的法力不够。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.no_mana.1.m4a` | 配音 | 「法力不足。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.no_gold.1.m4a` | 配音 | 「我的金币不够。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.no_gold.1.m4a` | 配音 | 「钱不够。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.cant_here.1.m4a` | 配音 | 「在这里不行。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.cant_here.1.m4a` | 配音 | 「这里施展不开。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.no_potion.1.m4a` | 配音 | 「药剂用完了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.no_potion.1.m4a` | 配音 | 「药水没了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.level_up.1.m4a` | 配音 | 「圣光赐我更多力量。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.level_up.1.m4a` | 配音 | 「我的力量又精进了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.low_health.1.m4a` | 配音 | 「我伤得很重……」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.low_health.1.m4a` | 配音 | 「伤得不轻……」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.poisoned.1.m4a` | 配音 | 「毒已入血。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.poisoned.1.m4a` | 配音 | 「我中毒了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.item_breaking.1.m4a` | 配音 | 「我的装备快撑不住了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.item_breaking.1.m4a` | 配音 | 「装备快坏了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.unique.1.m4a` | 配音 | 「这是一件非凡之物。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.unique.1.m4a` | 配音 | 「哦？这件倒是有点意思。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.set_item.1.m4a` | 配音 | 「这件东西……似乎还有同伴。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.set_item.1.m4a` | 配音 | 「这件该是成套的。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.rune.1.m4a` | 配音 | 「一枚古老的符文。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.rune.1.m4a` | 配音 | 「符文……上面的力量还在。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.enter_wild.1.m4a` | 配音 | 「荒野之中，处处杀机。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.enter_wild.1.m4a` | 配音 | 「荒野可不讲情面。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.enter_dungeon.1.m4a` | 配音 | 「黑暗在下面等着我。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.enter_dungeon.1.m4a` | 配音 | 「下面的空气……不太对劲。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.night_falls.1.m4a` | 配音 | 「夜色降临，邪物要出来了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.night_falls.1.m4a` | 配音 | 「入夜了，正好。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.evil_here.1.m4a` | 配音 | 「我感到了邪恶的气息。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.evil_here.1.m4a` | 配音 | 「这里的魔力很邪门。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.lair.1.m4a` | 配音 | 「这里就是那邪恶的巢穴。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.lair.1.m4a` | 配音 | 「就是这里了，邪恶的巢穴。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.graveyard.1.m4a` | 配音 | 「这里的死者不得安息。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.graveyard.1.m4a` | 配音 | 「死人也不肯安分。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.many_foes.1.m4a` | 配音 | 「它们成群结队地来了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.many_foes.1.m4a` | 配音 | 「来得正好，一起上吧。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.boss_near.1.m4a` | 配音 | 「来吧，恶徒。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.boss_near.1.m4a` | 配音 | 「终于来了个像样的。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.boss_dead.1.m4a` | 配音 | 「邪恶已被涤净。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.boss_dead.1.m4a` | 配音 | 「不过如此。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.area_clear.1.m4a` | 配音 | 「此地已经肃清。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.area_clear.1.m4a` | 配音 | 「清理干净了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.quest_done.1.m4a` | 配音 | 「使命完成了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.quest_done.1.m4a` | 配音 | 「事情办妥了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.waypoint.1.m4a` | 配音 | 「传送点，记下了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.waypoint.1.m4a` | 配音 | 「传送点，省了不少路。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.shrine.1.m4a` | 配音 | 「愿这力量护佑我。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.shrine.1.m4a` | 配音 | 「这股力量，我收下了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.paladin.back_in_town.1.m4a` | 配音 | 「总算可以歇口气了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.sorceress.back_in_town.1.m4a` | 配音 | 「回营地歇一歇。」 | eleven_v4 | Lily | 2026-10-26 |
