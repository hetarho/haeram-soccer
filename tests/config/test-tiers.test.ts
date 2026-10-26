import { expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { INTEGRATION_FILES, testTier } from './test-tiers';
import config from '../../vitest.config';

function tests(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((item) => {
    const file = join(root, item.name);
    return item.isDirectory() ? tests(file) : file.endsWith('.test.ts') ? [file] : [];
  });
}
it('assigns every test once and rejects stale/duplicate integration entries', () => {
  expect(new Set(INTEGRATION_FILES).size).toBe(INTEGRATION_FILES.length);
  for (const file of INTEGRATION_FILES) {
    expect(existsSync(file), file).toBe(true);
    expect(file.endsWith('.contract.test.ts')).toBe(false);
  }
  const all = ['packages', 'apps', 'tests/fixtures', 'tests/config', 'scripts'].flatMap(tests);
  const projects = config.test!.projects!.filter(
    (project) => typeof project === 'object' && project !== null && 'test' in project,
  ) as { test: { name: string; include: string[]; exclude?: string[] } }[];
  for (const { test } of projects)
    expect(
      test.include.every((pattern) =>
        ['packages/', 'apps/', 'tests/fixtures/', 'tests/config/', 'scripts/'].some((root) =>
          pattern.startsWith(root),
        ),
      ),
    ).toBe(true);
  for (const file of all) {
    const selected = projects.filter(
      ({ test }) =>
        test.include.some((pattern) => matchesGlob(file, pattern)) &&
        !test.exclude?.some((pattern) => matchesGlob(file, pattern)),
    );
    expect(
      selected.map(({ test }) => test.name),
      file,
    ).toEqual([testTier(file)]);
  }
});
it('keeps host, replay, long-career and full-match checks out of the task unit project', () => {
  for (const file of [
    'packages/engine/src/feature-replay.test.ts',
    'packages/engine/src/feature-replay.retained.test.ts',
    'apps/web/src/runtime/host.test.ts',
    'apps/web/src/adapters/persistence.long-career.test.ts',
    'packages/engine/src/grid/engine.test.ts',
  ])
    expect(testTier(file)).toBe('integration');
  expect(testTier('scripts/lib/source-graph.test.ts')).toBe('unit');
  expect(testTier('packages/engine/src/fixtures.contract.test.ts')).toBe('contract');
});
