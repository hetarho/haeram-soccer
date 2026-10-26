import { configDefaults, defineConfig } from 'vitest/config';
import { INTEGRATION_FILES, TEST_GLOBS } from './tests/config/test-tiers.ts';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: TEST_GLOBS,
          exclude: [...configDefaults.exclude, '**/*.contract.test.ts', ...INTEGRATION_FILES],
          testTimeout: 30000,
        },
      },
      {
        extends: true,
        test: { name: 'integration', include: [...INTEGRATION_FILES], testTimeout: 300000 },
      },
      {
        extends: true,
        test: {
          name: 'contract',
          include: TEST_GLOBS.map((pattern) => pattern.replace('.test.ts', '.contract.test.ts')),
          testTimeout: 300000,
        },
      },
    ],
  },
});
