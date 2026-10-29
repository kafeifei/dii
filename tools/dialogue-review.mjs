// Writes tools/d2-names/DIALOGUE-zh.md, the review page of every line the townsfolk say and every
// quest log text (src/data/dialogue.ts), with the names filled in as the game shows them, and of
// each line spoken, its recording: the take (voice.akara.a1q1_intro.1, public/audio/<take>.m4a) and
// its length, or that it's to be made, or to be made again since the line changed (what each take
// said is in tools/audio/made.json). tools/audio/list.mjs reads the spoken lines off this page:
//   node tools/dialogue-review.mjs
// tools/test/quests.test.mjs fails while the page is behind the lines, or the recordings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REVIEW = path.join(ROOT, 'tools/d2-names/DIALOGUE-zh.md');
const MADE = path.join(ROOT, 'tools/audio/made.json');
const AUDIO = path.join(ROOT, 'public/audio');

/** characters as the voice would read them: the text without spaces, punctuation counted */
const count = (s) => [...s.replace(/\s/g, '')].length;
const cell = (s) => s.replace(/\|/g, '\\|');

/** the page, from the game's own modules (`load`: an ssrLoadModule) */
export async function reviewMarkdown(load) {
  const { GOSSIP, GREETINGS, DEN_LINES, DEN_LOG, LOG_LINES } = await load('/src/data/dialogue.ts');
  const { QUEST_BY_KEY } = await load('/src/data/quests.ts');
  const { fillLine } = await load('/src/game/quests/quest.ts');
  const { npcLine } = await load('/src/audio/sounds.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const made = fs.existsSync(MADE) ? JSON.parse(fs.readFileSync(MADE, 'utf8')) : {};
  const akara = D2X_MONSTERS.akara.name;
  const den = QUEST_BY_KEY.a1q1;
  const out = [];
  let total = 0;
  let spoken = 0;
  let redo = 0;
  let unmade = 0;
  /** take `n` of voice line `id` saying `zh`: its name, and how it stands */
  const take = (id, n, zh) => {
    const name = `${id}.${n}`;
    const m = made[name];
    spoken++;
    if (!m || !fs.existsSync(path.join(AUDIO, `${name}.m4a`))) {
      unmade++;
      return `\`${name}\` 未录`;
    }
    if (m.text !== zh) {
      redo++;
      return `\`${name}\` **要重录**：录音念的是旧词`;
    }
    return `\`${name}\` ${m.secs.toFixed(1)} 秒`;
  };
  /** rows of [key, when, line, vars, voice]: `voice` [id, take] where it's spoken */
  const table = (rows) => {
    const voiced = rows.some((r) => r[4]);
    out.push(`| 键 | 什么时候 | 中文 | English | 字数 |${voiced ? ' 配音 |' : ''}`, `| --- | --- | --- | --- | --- |${voiced ? ' --- |' : ''}`);
    for (const [key, when, line, vars, voice] of rows) {
      const l = fillLine(line, vars);
      total += count(l.zh);
      const said = voice ? ` ${take(voice[0], voice[1], l.zh)} |` : '';
      out.push(`| \`${key}\` | ${cell(when)} | ${cell(l.zh)} | ${cell(l.en)} | ${count(l.zh)} |${said}`);
    }
    out.push('');
  };
  const quest = (id) => [npcLine('akara', id, den.key), 1];
  out.push(
    '# 台词审阅：第一幕开头',
    '',
    '由 `node tools/dialogue-review.mjs` 从 `src/data/dialogue.ts` 生成，不要手改；改台词改那个文件，再生成这一页。',
    '',
    '- 全部是新写的，按游戏自己的口吻，不是暗黑 2 原文，也不是它的翻译。场合照原版（D2MOO `A1Q1.cpp` 的 64、65、71、76 号台词各在什么时候说），话是我们自己的。',
    '- 地名、人名不写死在台词里，用占位符 `{moor}` `{den}` `{camp}` `{akara}`，显示时从改名表（`tools/d2-names/areas.json`、`npcs.json`）填进去；下面是填好之后的样子。`{n}` 是数目，这里按 3 填。',
    '- 中文是游戏里显示、配音念的；英文写在旁边给配音说明用。字数是中文去掉空白后的字符数，含标点，按每秒约 5 个字估算时长；配了音的台词按录音的长度滚动。',
    `- ${akara}说的每句都配了音（\`tools/audio/list.mjs\` 里的音色），配音照这一页的中文念（\`tools/audio/list.mjs\` 读这一页）。「配音」一栏是录音：\`voice.akara.a1q1_intro.1\` 就是 \`public/audio/voice.akara.a1q1_intro.1.m4a\`，后面是它的长度。`,
    '- 改了台词、重新生成这一页之后，录音念的还是旧词的那几条标「要重录」，没录过的标「未录」：运行 `node tools/ai-audio.mjs --budget <积分>` 录好，再生成一次这一页。',
    '',
    `## ${akara}：「${den.name}」（${den.nameEn}）`,
    '',
  );
  table([
    ['intro', `第一次和${akara}说话，她马上说（交出任务；原版 64 号，立刻播放）`, DEN_LINES.intro, undefined, quest('intro')],
    ['remind', '接了任务还没出营地，点「交谈」（原版 65 号）', DEN_LINES.remind, undefined, quest('remind')],
    ['remindOut', '出过营地或进过巢穴之后，点「交谈」（原版 71 号）', DEN_LINES.remindOut, undefined, quest('remindOut')],
    ['reward', `清空巢穴后回来和${akara}说话，她马上说，说完给 1 个技能点（原版 76 号，立刻播放）`, DEN_LINES.reward, undefined, quest('reward')],
  ]);
  out.push('## 屏幕上的提示（不配音）', '');
  table([
    ['cleared', '巢穴里最后一只怪物死的时候', DEN_LINES.cleared],
    ['back', '紧接着上一条', DEN_LINES.back],
    ['few', '巢穴里只剩 5 只或更少时，每杀一只', DEN_LINES.few, { n: 3 }],
    ['got', '领到奖励时', DEN_LINES.got],
  ]);
  out.push(`## ${akara}：闲谈（点「交谈」而她没有任务上的话要说时，轮流说）`, '');
  table(GOSSIP.akara.map((g, i) => [`gossip${i}`, g.after ? `「${QUEST_BY_KEY[g.after].name}」完成之后才说` : '随时', g, undefined, [npcLine('akara', `gossip${i}`), 1]]));
  out.push(
    `## ${akara}：问候和告别（只有声音，不显示）`,
    '',
    '原版的 NPC 有问候（`sounds.txt` 的 `akara_greeting_1`、`_2`，另有再点一下时的短句、回来时的和按时辰的），没有告别。这里一趟拜访问候一次、告别一次，告别是我们加的。每种三句，每次随机挑一句，不会连着两次是同一句。',
    '',
  );
  const { greeting, farewell } = GREETINGS.akara;
  table([
    ...greeting.map((g, i) => [`greeting${i}`, i ? '同上' : '这一趟第一次打开她的菜单时（她一开口就有任务上的话要说时不问候）；走开再回来算新的一趟', g, undefined, [npcLine('akara', 'greeting'), i + 1]]),
    ...farewell.map((g, i) => [`farewell${i}`, i ? '同上' : '这一趟第一次离开她时：取消、Esc、走开，或关上她的交易', g, undefined, [npcLine('akara', 'farewell'), i + 1]]),
  ]);
  out.push('## 任务日志（不配音）', '');
  table([
    ['none', '任务还没人交给你', LOG_LINES.none],
    ['off', '这个版本还没有的任务（另外五个）', LOG_LINES.off],
    ['den.given', `「${den.name}」：接了任务，离开${akara}之后`, DEN_LOG.given],
    ['den.clear', `「${den.name}」：进了巢穴`, DEN_LOG.clear],
    ['den.few', `「${den.name}」：只剩 5 只或更少`, DEN_LOG.few, { n: 3 }],
    ['den.back', `「${den.name}」：清空了，回去领赏`, DEN_LOG.back],
    ['den.done', `「${den.name}」：领过奖励`, DEN_LOG.done],
  ]);
  const left = [unmade && `${unmade} 条未录`, redo && `${redo} 条要重录`].filter(Boolean).join('，');
  out.push(`共 ${total} 字；配音 ${spoken} 条${left ? `，其中 ${left}` : '，都已录好'}。`, '');
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import('./test/shims.mjs');
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'warn', appType: 'custom', server: { middlewareMode: true, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    fs.writeFileSync(REVIEW, await reviewMarkdown((id) => server.ssrLoadModule(id)));
    console.log(`wrote ${path.relative(ROOT, REVIEW)}`);
  } finally {
    await server.close();
  }
}
