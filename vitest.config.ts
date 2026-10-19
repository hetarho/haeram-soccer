import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/fixtures/**/*.test.ts'],
    environment: 'node',
    // Whole-world season tests run 20–30 s alone with 16 attributes; a loaded machine doubles that.
    testTimeout: 60000,
  },
});
