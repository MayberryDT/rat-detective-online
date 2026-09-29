import { defineConfig } from 'vite';

// Two pages: the game, and the city map at /map (the Worker sends the old /heatmap here).
export default defineConfig({
  build: { rollupOptions: { input: { index: 'index.html', map: 'map.html' } } },
});
