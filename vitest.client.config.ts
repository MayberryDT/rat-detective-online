import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 4,
    include: ['test/client/**/*.test.ts'],
    setupFiles: ['test/client/setup.ts'],
  },
});
