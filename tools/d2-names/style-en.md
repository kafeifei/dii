# English naming rules

The game "烬渊" (English title: Ember Abyss) replaces every Diablo II proper noun with its own name, in Chinese (`style.md`) and in English. Each row of a names file (`<category>.json`) has `name`, our Chinese name, and `nameEn`, our English name; `en` is Blizzard's English and `official` the official Chinese it was written against. `node tools/d2-import.mjs` only takes a row that has both names, lists the rest in `report.md`, and stops on a `nameEn` that is Blizzard's English or not plain ASCII; `node tools/d2-validate.mjs` checks the rules below on the generated data.

## Goal
- **Similar but different.** A veteran player should be able to tell which original item, monster or place it stands for, but it must not be Blizzard's English name. It must also not be that name with one letter or one word swapped for a near-synonym that reads the same, for example "Windforce" → "Wind Force".
- **Follow our Chinese name.** The English name carries the same image as our Chinese `name`, not the old official one. Example: our Chinese 逐风之怒 becomes "Galechaser's Wrath". It need not be a literal translation; it should read like a natural fantasy name. Where the same Chinese word recurs (钩爪 in a rare name and in a monster name), use the same English word.
- **Tone.** Dark, gothic, old-world, weighty. No modern words, no jokes, no puns on Blizzard names. Avoid names from other famous games, books or films, and real brands.

## Hard rules
1. **Must differ from `en`.** Compared case-insensitively, ignoring "The", apostrophes, spaces and hyphens. A one-word synonym swap that keeps the same structure and meaning does not count as different. A whole name (an item, set, runeword, monster, area, NPC or hireling) must not be the English of any other row Blizzard named either ("Exile" is a runeword).
2. **Use the glossary for transliterated names.** Every person, place, demon or faction name uses the English form in `glossary-en.json` (`newEn`, next to the Chinese `new` of `glossary.json`): where our Chinese name has 何罗德门, the English has "Heroldmen". No English name keeps Blizzard's (Horadric, Akara, Zakarum, …). A new transliteration goes into both glossaries.
3. **No duplicates.** None across uniques, set items, sets and runewords, and none inside any other list (affixes, rare words, monsters, areas, hirelings, the monster name words), except for rows of one D2 string, which share theirs. Quest bases carry their unique's name on purpose (`bases.json` hfh, hst, qf1, qf2).
4. **Title Case**, plain ASCII. Apostrophes and hyphens are fine. About 1–4 words.

## Per category
- **Magic prefixes**: an adjective or adjectival noun before the base name, as in "Jagged Long Sword" → our "Serrated …". One word or a short phrase, never "of".
- **Magic suffixes**: start with "of", as in "of Warding". Automagic rows follow the table they take their name from.
- **Rare name words**: the first list is nouns or images ("Beast", "Raven"), the second item-type or action nouns ("Bite", "Song", "Hold"); a rare item is "Raven Bite". One word each.
- **Sets**: the person part comes from the glossary and is the same in the set name and all its pieces. Pieces follow "<Name>'s <Thing>".
- **Monsters**: generic nouns such as "Zombie" and "Skeleton" may not stay as they are either (they are Blizzard's English); D2 coinages such as "Fallen", "Quill Rat" and "Moon Clan" change too. Superuniques are people or titles: person-name rules.
- **Random unique monster names**: prefix and suffix one word each, the title "the …" goes last: "Murk Canker the Sledge". The suffix keeps its slot's grammar: a noun ("Canker"), or an agent noun where the Chinese is 「X者」 ("Eviscerator").
- **Areas, NPCs, quests**: change in the same spirit as the Chinese name ("Blood Moor" → "Bloodmire Heath"). People use the glossary.
- **Hirelings** (`mercenaries.json`): personal names, short, gothic, each its own, after our Chinese transliteration in the glossary's manner (Akara 亚珈萝 → "Yajalo"); the two Japanese ones keep a Japanese name.
- **Skills** (`skills.json`): only the proper-noun-ish ones, as in Chinese; a skill named by a runeword's string takes the runeword's names.
- **Runes** are numbered: "Rune N", made by the importer.
- **Generic rows** (`bases.json` with `"generic": true`: generic words D2CE has no Chinese string for, like Scroll of Resistance) have only the Chinese and keep Blizzard's English.
