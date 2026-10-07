import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/fixtures/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
