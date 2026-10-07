import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    // Each file owns live bot rooms. Bound competing workerd isolates so host
    // saturation is not mistaken for a five-second delivery failure.
    maxWorkers: 2,
    include: ['test/worker/**/*.test.ts'],
  },
});
