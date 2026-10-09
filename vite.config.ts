import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5174,
    // saves live in localStorage, which is per origin: never silently hop to another port
    strictPort: true,
  },
});
