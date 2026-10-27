// Writes tools/d2-names/DIALOGUE-zh.md, the review page of every line the townsfolk say and every
// quest log text (src/data/dialogue.ts), with the names filled in as the game shows them:
//   node tools/dialogue-review.mjs
// tools/test/quests.test.mjs fails while the page is behind the lines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REVIEW = path.join(ROOT, 'tools/d2-names/DIALOGUE-zh.md');

/** characters as the voice would read them: the text without spaces, punctuation counted */
const count = (s) => [...s.replace(/\s/g, '')].length;
const cell = (s) => s.replace(/\|/g, '\\|');

/** the page, from the game's own modules (`load`: an ssrLoadModule) */
export async function reviewMarkdown(load) {
  const { GOSSIP, DEN_LINES, DEN_LOG, LOG_LINES } = await load('/src/data/dialogue.ts');
  const { QUEST_BY_KEY } = await load('/src/data/quests.ts');
  const { fillLine } = await load('/src/game/quests/quest.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const akara = D2X_MONSTERS.akara.name;
  const den = QUEST_BY_KEY.a1q1;
  const out = [];
  let total = 0;
  const table = (rows) => {
    out.push('| 键 | 什么时候 | 中文 | English | 字数 |', '| --- | --- | --- | --- | --- |');
    for (const [key, when, line, vars] of rows) {
      const l = fillLine(line, vars);
      total += count(l.zh);
      out.push(`| \`${key}\` | ${cell(when)} | ${cell(l.zh)} | ${cell(l.en)} | ${count(l.zh)} |`);
    }
    out.push('');
  };
  out.push(
    '# 台词审阅：第一幕开头',
    '',
    '由 `node tools/dialogue-review.mjs` 从 `src/data/dialogue.ts` 生成，不要手改；改台词改那个文件，再生成这一页。',
    '',
    '- 全部是新写的，按游戏自己的口吻，不是暗黑 2 原文，也不是它的翻译。场合照原版（D2MOO `A1Q1.cpp` 的 64、65、71、76 号台词各在什么时候说），话是我们自己的。',
    '- 地名、人名不写死在台词里，用占位符 `{moor}` `{den}` `{camp}` `{akara}`，显示时从改名表（`tools/d2-names/areas.json`、`npcs.json`）填进去；下面是填好之后的样子。`{n}` 是数目，这里按 3 填。',
    '- 中文是游戏里显示、将来配音念的；英文写在旁边给配音说明用。字数是中文去掉空白后的字符数，含标点，按每秒约 5 个字估算时长。',
    '- 定稿之后再配音（每条一个文件），现在不生成音频。',
    '',
    `## ${akara}：「${den.name}」（${den.nameEn}）`,
    '',
  );
  table([
    ['intro', `第一次和${akara}说话，她马上说（交出任务；原版 64 号，立刻播放）`, DEN_LINES.intro],
    ['remind', '接了任务还没出营地，点「交谈」（原版 65 号）', DEN_LINES.remind],
    ['remindOut', '出过营地或进过巢穴之后，点「交谈」（原版 71 号）', DEN_LINES.remindOut],
    ['reward', `清空巢穴后回来和${akara}说话，她马上说，说完给 1 个技能点（原版 76 号，立刻播放）`, DEN_LINES.reward],
  ]);
  out.push('## 屏幕上的提示（不配音）', '');
  table([
    ['cleared', '巢穴里最后一只怪物死的时候', DEN_LINES.cleared],
    ['back', '紧接着上一条', DEN_LINES.back],
    ['few', '巢穴里只剩 5 只或更少时，每杀一只', DEN_LINES.few, { n: 3 }],
    ['got', '领到奖励时', DEN_LINES.got],
  ]);
  out.push(`## ${akara}：闲谈（点「交谈」而她没有任务上的话要说时，轮流说）`, '');
  table(GOSSIP.akara.map((g, i) => [`gossip${i}`, g.after ? `「${QUEST_BY_KEY[g.after].name}」完成之后才说` : '随时', g]));
  out.push('## 任务日志', '');
  table([
    ['none', '任务还没人交给你', LOG_LINES.none],
    ['off', '这个版本还没有的任务（另外五个）', LOG_LINES.off],
    ['den.given', `「${den.name}」：接了任务，离开${akara}之后`, DEN_LOG.given],
    ['den.clear', `「${den.name}」：进了巢穴`, DEN_LOG.clear],
    ['den.few', `「${den.name}」：只剩 5 只或更少`, DEN_LOG.few, { n: 3 }],
    ['den.back', `「${den.name}」：清空了，回去领赏`, DEN_LOG.back],
    ['den.done', `「${den.name}」：领过奖励`, DEN_LOG.done],
  ]);
  out.push(`共 ${total} 字。`, '');
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
