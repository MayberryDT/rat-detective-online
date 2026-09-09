import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(rootDir, 'test/visual'),
  resolve: { alias: process.env.VISUAL_REFERENCE === '1' ? [{ find: '../../src/entities/RatEntity', replacement: resolve(rootDir, '.wrangler/visual-reference/src/entities/RatEntity.ts') }] : [] },
  publicDir: resolve(rootDir, 'public'),
  build: {
    outDir: resolve(rootDir, process.env.VISUAL_REFERENCE === '1' ? 'dist-visual-reference' : 'dist-visual'),
    emptyOutDir: true,
    rollupOptions: {
      input: [resolve(rootDir, 'test/visual/capacity-render.html'), resolve(rootDir, 'test/visual/stage-prototype.html'), resolve(rootDir, 'test/visual/cheese-preview.html'), resolve(rootDir, 'test/visual/city-preview.html'), resolve(rootDir, 'test/visual/model-preview.html'), resolve(rootDir, 'test/visual/visual-fixture.html'), resolve(rootDir, 'test/visual/performance-fixture.html')],
    },
  },
});
