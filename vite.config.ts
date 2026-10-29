import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { DEV_MODELS } from './src/render/dev-models.ts';

/**
 * The debug-only models (src/render/dev-models.ts) stay in public/models for the dev server; the
 * build takes them back out of the copy of public/ it makes, since the shipped game never loads them
 */
function dropDevModels(): Plugin {
  let models = '';
  return {
    name: 'dii:drop-dev-models',
    apply: 'build',
    configResolved(config) {
      models = path.resolve(config.root, config.build.outDir, 'models');
    },
    // public/ was copied in as the bundle began to be written
    writeBundle() {
      for (const key of Object.keys(DEV_MODELS)) fs.rmSync(path.join(models, `${key}.glb`), { force: true });
    },
  };
}

export default defineConfig({
  plugins: [dropDevModels()],
  server: {
    port: Number(process.env.PORT) || 5174,
    // saves live in localStorage, which is per origin: never silently hop to another port
    strictPort: true,
  },
});
