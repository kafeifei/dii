// Node tests on the game's own code: node tools/test/run.mjs [name…] (npm test)
// Boots Vite in middleware mode (no port, no browser) and loads src/ modules through
// ssrLoadModule, so a test calls the real TypeScript with the project's Vite config. Every
// tools/test/*.test.mjs (or those whose names contain one of the arguments) exports
// `default async (load) => {...}` and throws on failure; `load('/src/world/levelgen.ts')` returns
// that module. Modules are shared between the tests of one run.
import './shims.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const filters = process.argv.slice(2);
const files = fs
  .readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs') && (!filters.length || filters.some((s) => f.includes(s))))
  .sort();
if (!files.length) {
  console.log(`no tests match ${filters.join(' ')}`);
  process.exit(1);
}

const server = await createServer({
  root,
  logLevel: 'warn',
  appType: 'custom',
  // no websocket, no file watching: nothing here outlives the run
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const load = (id) => server.ssrLoadModule(id);

let failed = 0;
const t0 = performance.now();
for (const f of files) {
  const name = f.replace(/\.test\.mjs$/, '');
  const t = performance.now();
  try {
    const mod = await import(pathToFileURL(path.join(here, f)).href);
    await mod.default(load);
    console.log(`ok   ${name} (${Math.round(performance.now() - t)} ms)`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e?.stack ?? e}`);
  }
}
await server.close();
console.log(`${files.length - failed}/${files.length} passed in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
