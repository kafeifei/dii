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
| `voice.paladin.bag_full.2.m4a` | 配音 | 「装不下了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.bag_full.3.m4a` | 配音 | 「没有地方再放了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.bag_full.4.m4a` | 配音 | 「得先腾出些地方。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.bag_full.1.m4a` | 配音 | 「没地方放了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.bag_full.2.m4a` | 配音 | 「包里满了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.bag_full.3.m4a` | 配音 | 「塞不进去了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.bag_full.4.m4a` | 配音 | 「先腾点地方吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.cant_carry.1.m4a` | 配音 | 「我带不了更多了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.cant_carry.2.m4a` | 配音 | 「已经拿不下了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.cant_carry.3.m4a` | 配音 | 「我只能带这么多。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.cant_carry.4.m4a` | 配音 | 「再多就是负累。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.cant_carry.1.m4a` | 配音 | 「再多我可拿不动。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.cant_carry.2.m4a` | 配音 | 「够多了，拿不下。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.cant_carry.3.m4a` | 配音 | 「我又不是驮马。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.cant_carry.4.m4a` | 配音 | 「这些已经够沉了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.cant_use.1.m4a` | 配音 | 「这东西不是给我用的。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.cant_use.2.m4a` | 配音 | 「此物与我无缘。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.cant_use.3.m4a` | 配音 | 「我用不了这个。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.cant_use.4.m4a` | 配音 | 「这不适合我。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.cant_use.1.m4a` | 配音 | 「这种东西，我用不上。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.cant_use.2.m4a` | 配音 | 「这不是我的东西。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.cant_use.3.m4a` | 配音 | 「留给别人用吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.cant_use.4.m4a` | 配音 | 「我可不用这个。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.too_weak.1.m4a` | 配音 | 「我的力量还不足以驾驭它。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.too_weak.2.m4a` | 配音 | 「我还拿不动它。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.too_weak.3.m4a` | 配音 | 「力气不够。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.too_weak.4.m4a` | 配音 | 「我得再强壮些。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.too_weak.1.m4a` | 配音 | 「它太沉了，不适合我。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.too_weak.2.m4a` | 配音 | 「太重了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.too_weak.3.m4a` | 配音 | 「我举不起这个。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.too_weak.4.m4a` | 配音 | 「这得靠蛮力。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.low_level.1.m4a` | 配音 | 「历练尚浅，还用不了它。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.low_level.2.m4a` | 配音 | 「我还不够格。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.low_level.3.m4a` | 配音 | 「还需更多磨砺。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.low_level.4.m4a` | 配音 | 「日后再用它吧。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.low_level.1.m4a` | 配音 | 「还不到时候。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.low_level.2.m4a` | 配音 | 「我还驾驭不了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.low_level.3.m4a` | 配音 | 「再等等吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.low_level.4.m4a` | 配音 | 「火候还不够。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.no_mana.1.m4a` | 配音 | 「我的法力不够。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.no_mana.2.m4a` | 配音 | 「法力耗尽了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.no_mana.3.m4a` | 配音 | 「法力已经枯竭。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.no_mana.4.m4a` | 配音 | 「法力还没有恢复。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.no_mana.1.m4a` | 配音 | 「法力不足。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.no_mana.2.m4a` | 配音 | 「没有法力了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.no_mana.3.m4a` | 配音 | 「魔力用光了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.no_mana.4.m4a` | 配音 | 「还没缓过来。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.no_gold.1.m4a` | 配音 | 「我的金币不够。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.no_gold.2.m4a` | 配音 | 「我付不起。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.no_gold.3.m4a` | 配音 | 「钱袋快空了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.no_gold.4.m4a` | 配音 | 「囊中羞涩。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.no_gold.1.m4a` | 配音 | 「钱不够。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.no_gold.2.m4a` | 配音 | 「太贵了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.no_gold.3.m4a` | 配音 | 「我的钱不够。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.no_gold.4.m4a` | 配音 | 「这可买不起。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.cant_here.1.m4a` | 配音 | 「在这里不行。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.cant_here.2.m4a` | 配音 | 「此处不可。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.cant_here.3.m4a` | 配音 | 「这里做不到。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.cant_here.4.m4a` | 配音 | 「不是这个地方。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.cant_here.1.m4a` | 配音 | 「这里施展不开。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.cant_here.2.m4a` | 配音 | 「这儿不行。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.cant_here.3.m4a` | 配音 | 「在这儿可不行。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.cant_here.4.m4a` | 配音 | 「换个地方吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.no_potion.1.m4a` | 配音 | 「药剂用完了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.no_potion.2.m4a` | 配音 | 「没有药剂了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.no_potion.3.m4a` | 配音 | 「药剂已经喝光了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.no_potion.4.m4a` | 配音 | 「我得补些药剂。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.no_potion.1.m4a` | 配音 | 「药水没了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.no_potion.2.m4a` | 配音 | 「一瓶也不剩了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.no_potion.3.m4a` | 配音 | 「药水喝光了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.no_potion.4.m4a` | 配音 | 「该补药水了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.level_up.1.m4a` | 配音 | 「圣光赐我更多力量。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.level_up.2.m4a` | 配音 | 「我变得更强了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.level_up.3.m4a` | 配音 | 「信念愈发坚定。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.level_up.4.m4a` | 配音 | 「力量在我体内涌动。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.level_up.1.m4a` | 配音 | 「我的力量又精进了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.level_up.2.m4a` | 配音 | 「感觉好极了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.level_up.3.m4a` | 配音 | 「我又强了几分。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.level_up.4.m4a` | 配音 | 「这才像样。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.low_health.1.m4a` | 配音 | 「我伤得很重……」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.low_health.2.m4a` | 配音 | 「我需要治疗……」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.low_health.3.m4a` | 配音 | 「我快撑不住了……」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.low_health.4.m4a` | 配音 | 「伤势太重……」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.low_health.1.m4a` | 配音 | 「伤得不轻……」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.low_health.2.m4a` | 配音 | 「得快点疗伤……」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.low_health.3.m4a` | 配音 | 「这下不妙……」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.low_health.4.m4a` | 配音 | 「我还不能倒下……」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.poisoned.1.m4a` | 配音 | 「毒已入血。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.poisoned.2.m4a` | 配音 | 「毒在蔓延。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.poisoned.3.m4a` | 配音 | 「是毒！」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.poisoned.4.m4a` | 配音 | 「这毒好烈。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.poisoned.1.m4a` | 配音 | 「我中毒了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.poisoned.2.m4a` | 配音 | 「有毒……」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.poisoned.3.m4a` | 配音 | 「该死，是毒。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.poisoned.4.m4a` | 配音 | 「毒正在发作。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.item_breaking.1.m4a` | 配音 | 「我的装备快撑不住了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.item_breaking.2.m4a` | 配音 | 「装备需要修理了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.item_breaking.3.m4a` | 配音 | 「装备已经残破。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.item_breaking.4.m4a` | 配音 | 「得找人修一修了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.item_breaking.1.m4a` | 配音 | 「装备快坏了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.item_breaking.2.m4a` | 配音 | 「该找人修了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.item_breaking.3.m4a` | 配音 | 「这装备快散架了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.item_breaking.4.m4a` | 配音 | 「再不修就要坏了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.unique.1.m4a` | 配音 | 「这是一件非凡之物。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.unique.2.m4a` | 配音 | 「真是难得。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.unique.3.m4a` | 配音 | 「此物非同寻常。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.unique.4.m4a` | 配音 | 「好一件宝物。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.unique.1.m4a` | 配音 | 「哦？这件倒是有点意思。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.unique.2.m4a` | 配音 | 「好东西。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.unique.3.m4a` | 配音 | 「这才配得上我。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.unique.4.m4a` | 配音 | 「真是稀罕物。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.set_item.1.m4a` | 配音 | 「这件东西……似乎还有同伴。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.set_item.2.m4a` | 配音 | 「一套中的一件。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.set_item.3.m4a` | 配音 | 「其余的还在别处。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.set_item.4.m4a` | 配音 | 「得把它们凑齐。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.set_item.1.m4a` | 配音 | 「这件该是成套的。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.set_item.2.m4a` | 配音 | 「还差几件。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.set_item.3.m4a` | 配音 | 「凑齐了才有用。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.set_item.4.m4a` | 配音 | 「另外几件在哪儿？」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.rune.1.m4a` | 配音 | 「一枚古老的符文。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.rune.2.m4a` | 配音 | 「一枚符文。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.rune.3.m4a` | 配音 | 「符文，收好了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.rune.4.m4a` | 配音 | 「上面刻着古老的力量。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.rune.1.m4a` | 配音 | 「符文……上面的力量还在。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.rune.2.m4a` | 配音 | 「又一枚符文。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.rune.3.m4a` | 配音 | 「符文，用得着。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.rune.4.m4a` | 配音 | 「这个能派上用场。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.enter_wild.1.m4a` | 配音 | 「荒野之中，处处杀机。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.enter_wild.2.m4a` | 配音 | 「荒野险恶，务必小心。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.enter_wild.3.m4a` | 配音 | 「出发吧。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.enter_wild.4.m4a` | 配音 | 「信念指引我前行。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.enter_wild.1.m4a` | 配音 | 「荒野可不讲情面。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.enter_wild.2.m4a` | 配音 | 「走吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.enter_wild.3.m4a` | 配音 | 「外面可不太平。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.enter_wild.4.m4a` | 配音 | 「该活动活动了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.enter_dungeon.1.m4a` | 配音 | 「黑暗在下面等着我。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.enter_dungeon.2.m4a` | 配音 | 「我将深入黑暗。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.enter_dungeon.3.m4a` | 配音 | 「下面一片死寂。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.enter_dungeon.4.m4a` | 配音 | 「愿光明照亮前路。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.enter_dungeon.1.m4a` | 配音 | 「下面的空气……不太对劲。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.enter_dungeon.2.m4a` | 配音 | 「这底下藏着什么？」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.enter_dungeon.3.m4a` | 配音 | 「真够暗的。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.enter_dungeon.4.m4a` | 配音 | 「又冷又潮。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.night_falls.1.m4a` | 配音 | 「夜色降临，邪物要出来了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.night_falls.2.m4a` | 配音 | 「天黑了，要当心。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.night_falls.3.m4a` | 配音 | 「黑夜来临。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.night_falls.4.m4a` | 配音 | 「夜里更要警惕。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.night_falls.1.m4a` | 配音 | 「入夜了，正好。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.night_falls.2.m4a` | 配音 | 「天黑了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.night_falls.3.m4a` | 配音 | 「夜晚属于我。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.night_falls.4.m4a` | 配音 | 「这夜色不错。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.evil_here.1.m4a` | 配音 | 「我感到了邪恶的气息。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.evil_here.2.m4a` | 配音 | 「邪恶就在附近。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.evil_here.3.m4a` | 配音 | 「此地被玷污了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.evil_here.4.m4a` | 配音 | 「这里不洁。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.evil_here.1.m4a` | 配音 | 「这里的魔力很邪门。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.evil_here.2.m4a` | 配音 | 「有东西在暗处。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.evil_here.3.m4a` | 配音 | 「我不喜欢这里。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.evil_here.4.m4a` | 配音 | 「空气里有股腐臭。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.lair.1.m4a` | 配音 | 「这里就是那邪恶的巢穴。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.lair.2.m4a` | 配音 | 「找到它们的老巢了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.lair.3.m4a` | 配音 | 「邪恶的源头就在此。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.lair.4.m4a` | 配音 | 「终于找到了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.lair.1.m4a` | 配音 | 「就是这里了，邪恶的巢穴。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.lair.2.m4a` | 配音 | 「原来藏在这儿。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.lair.3.m4a` | 配音 | 「这就是它们的窝。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.lair.4.m4a` | 配音 | 「找到了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.graveyard.1.m4a` | 配音 | 「这里的死者不得安息。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.graveyard.2.m4a` | 配音 | 「愿逝者安息。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.graveyard.3.m4a` | 配音 | 「坟墓被惊扰了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.graveyard.4.m4a` | 配音 | 「亡者在此游荡。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.graveyard.1.m4a` | 配音 | 「死人也不肯安分。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.graveyard.2.m4a` | 配音 | 「一片坟地。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.graveyard.3.m4a` | 配音 | 「死气沉沉。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.graveyard.4.m4a` | 配音 | 「死人真多。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.many_foes.1.m4a` | 配音 | 「它们成群结队地来了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.many_foes.2.m4a` | 配音 | 「敌人太多了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.many_foes.3.m4a` | 配音 | 「它们蜂拥而至。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.many_foes.4.m4a` | 配音 | 「圣光护我！」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.many_foes.1.m4a` | 配音 | 「来得正好，一起上吧。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.many_foes.2.m4a` | 配音 | 「越多越好。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.many_foes.3.m4a` | 配音 | 「全都过来吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.many_foes.4.m4a` | 配音 | 「一群乌合之众。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.boss_near.1.m4a` | 配音 | 「来吧，恶徒。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.boss_near.2.m4a` | 配音 | 「你的末日到了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.boss_near.3.m4a` | 配音 | 「我来终结你。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.boss_near.4.m4a` | 配音 | 「受死吧。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.boss_near.1.m4a` | 配音 | 「终于来了个像样的。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.boss_near.2.m4a` | 配音 | 「就是你？」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.boss_near.3.m4a` | 配音 | 「让我看看你的本事。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.boss_near.4.m4a` | 配音 | 「你挡着我的路了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.boss_dead.1.m4a` | 配音 | 「邪恶已被涤净。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.boss_dead.2.m4a` | 配音 | 「正义得以伸张。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.boss_dead.3.m4a` | 配音 | 「回到黑暗中去吧。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.boss_dead.4.m4a` | 配音 | 「它再也起不来了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.boss_dead.1.m4a` | 配音 | 「不过如此。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.boss_dead.2.m4a` | 配音 | 「太弱了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.boss_dead.3.m4a` | 配音 | 「就这点本事？」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.boss_dead.4.m4a` | 配音 | 「早该倒下了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.area_clear.1.m4a` | 配音 | 「此地已经肃清。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.area_clear.2.m4a` | 配音 | 「这里安全了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.area_clear.3.m4a` | 配音 | 「一个不留。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.area_clear.4.m4a` | 配音 | 「此处已净。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.area_clear.1.m4a` | 配音 | 「清理干净了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.area_clear.2.m4a` | 配音 | 「全收拾了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.area_clear.3.m4a` | 配音 | 「没剩下什么了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.area_clear.4.m4a` | 配音 | 「这下清静了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.quest_done.1.m4a` | 配音 | 「使命完成了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.quest_done.2.m4a` | 配音 | 「我做到了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.quest_done.3.m4a` | 配音 | 「职责已尽。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.quest_done.4.m4a` | 配音 | 「这件事了结了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.quest_done.1.m4a` | 配音 | 「事情办妥了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.quest_done.2.m4a` | 配音 | 「搞定了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.quest_done.3.m4a` | 配音 | 「小事一桩。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.quest_done.4.m4a` | 配音 | 「交差去吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.waypoint.1.m4a` | 配音 | 「传送点，记下了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.waypoint.2.m4a` | 配音 | 「一个传送点。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.waypoint.3.m4a` | 配音 | 「此路已通。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.waypoint.4.m4a` | 配音 | 「日后可由此归来。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.waypoint.1.m4a` | 配音 | 「传送点，省了不少路。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.waypoint.2.m4a` | 配音 | 「省得再走一趟。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.waypoint.3.m4a` | 配音 | 「记住这里。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.waypoint.4.m4a` | 配音 | 「方便多了。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.shrine.1.m4a` | 配音 | 「愿这力量护佑我。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.shrine.2.m4a` | 配音 | 「感谢神恩。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.shrine.3.m4a` | 配音 | 「我感到了祝福。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.shrine.4.m4a` | 配音 | 「力量流遍全身。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.shrine.1.m4a` | 配音 | 「这股力量，我收下了。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.shrine.2.m4a` | 配音 | 「感觉不坏。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.shrine.3.m4a` | 配音 | 「正合我意。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.shrine.4.m4a` | 配音 | 「借来用用。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.paladin.back_in_town.1.m4a` | 配音 | 「总算可以歇口气了。」 | eleven_v4 | Brian | 2026-10-26 |
| `voice.paladin.back_in_town.2.m4a` | 配音 | 「回来了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.back_in_town.3.m4a` | 配音 | 「终于安全了。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.paladin.back_in_town.4.m4a` | 配音 | 「整顿一下再出发。」 | eleven_v4 | Brian | 2026-10-28 |
| `voice.sorceress.back_in_town.1.m4a` | 配音 | 「回营地歇一歇。」 | eleven_v4 | Lily | 2026-10-26 |
| `voice.sorceress.back_in_town.2.m4a` | 配音 | 「还是这里自在。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.back_in_town.3.m4a` | 配音 | 「先歇会儿。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.sorceress.back_in_town.4.m4a` | 配音 | 「整理一下吧。」 | eleven_v4 | Lily | 2026-10-28 |
| `voice.akara.a1q1_intro.1.m4a` | 配音 | 「你来得正好，外乡人。昨夜我对着火光占卜，灰烬里浮出血沼荒原深处的一道裂口：一个洞穴，人们管它叫邪秽巢穴。邪气正从里面一缕一缕往外渗，荒原上的野兽因此发了狂，连埋下去的死人也躺不安稳。营寨里的人都得守着木栅，我一个也抽不出来。替我下去，把洞里的东西一个不留地清干净。等你回来，我教你一样新的本事。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.a1q1_remind.1.m4a` | 配音 | 「邪秽巢穴在血沼荒原里头。出了营门一路往荒原深处走，留心地上的洞口。去吧，别让那股气再漫出来。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.a1q1_remind_out.1.m4a` | 配音 | 「我还感觉得到它，那个洞还在喘气。只要里面还剩一只邪物，它就合不上。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.a1q1_reward.1.m4a` | 配音 | 「风里的腐味散了，火光里也再看不见那道裂口。你做到了我们做不到的事。来，闭上眼睛，跟着我的声音……好了。你心里又开了一扇门，往后你自会知道它通向哪里。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.gossip0.1.m4a` | 配音 | 「这道木栅是拿断木和咬紧的牙关撑起来的。多撑一天，就多赢一天。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.gossip1.1.m4a` | 配音 | 「受了伤就回来，别硬撑。草药我这儿有，火也从来没熄过。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.gossip2.1.m4a` | 配音 | 「荒原上的风干净了些。昨夜，我总算睡了个整觉。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.greeting.1.m4a` | 配音 | 「愿火光照着你。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.greeting.2.m4a` | 配音 | 「我正等着你呢。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.greeting.3.m4a` | 配音 | 「坐吧，歇一歇脚。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.farewell.1.m4a` | 配音 | 「去吧，火会一直燃着。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.farewell.2.m4a` | 配音 | 「愿你一路无伤。」 | eleven_v4 | Sarah | 2026-10-29 |
| `voice.akara.farewell.3.m4a` | 配音 | 「记得活着回来。」 | eleven_v4 | Sarah | 2026-10-29 |
