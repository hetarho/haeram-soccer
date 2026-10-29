import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tunableLeaves } from '../../../../packages/engine/src/grid/tunables';
import { CATALOG_PATH, catalogText, type Catalog } from '../../../../scripts/lab-tunables';

describe('lab tunable catalog', () => {
  it('catalog matches the engine', async () => {
    const stale = 'apps/web/src/lab/tunables.json is stale: run `pnpm run lab:tunables`';
    const text = readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(text) as Catalog;
    const listed = catalog.groups.flatMap((g) => g.leaves.map((l) => [l.path, l.value]));
    expect(listed, stale).toEqual(tunableLeaves().map((l) => [l.path, l.value]));
    expect(text, stale).toBe(await catalogText());
  });

  it('carries comments and load-time marks', () => {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as Catalog;
    const leaves = catalog.groups.flatMap((g) => g.leaves);
    const leaf = (path: string) => leaves.find((l) => l.path === path)!;
    expect(leaf('SHOT_CONFIG.saveShare').comment).toMatch(/saves the grid keeps/);
    // A leaf without a comment of its own takes its parent's.
    expect(leaf('SHOT_CONFIG.candidate.header').comment).toMatch(/header's chance quality/);
    expect(leaf('GRID_MOVEMENT_CONFIG.turn').loadTime).toBe(true);
    expect(leaves.filter((l) => l.loadTime)).toHaveLength(4);
    expect(catalog.groups.every((g) => g.file.startsWith('packages/engine/src/grid/'))).toBe(true);
  });
});
