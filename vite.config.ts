import { defineConfig } from 'vite';

// Two pages: the game, and the heat map at /heatmap.
export default defineConfig({
  build: { rollupOptions: { input: { index: 'index.html', heatmap: 'heatmap.html' } } },
});
