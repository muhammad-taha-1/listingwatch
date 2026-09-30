import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // mongodb-memory-server downloads a binary on first run
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
