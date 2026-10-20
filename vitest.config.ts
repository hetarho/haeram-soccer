import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'tests/fixtures/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    environment: 'node',
    // Whole-world season tests run 20–30 s alone with 16 attributes, and the own league's grid
    // matches (T218) make a season about five times slower until T224 measures and cuts that
    // cost; a loaded machine doubles it.
    testTimeout: 300000,
  },
});
