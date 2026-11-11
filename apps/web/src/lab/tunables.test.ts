import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tunableLeaves } from '../../../../packages/engine/src/tunables';
import { sourceMessages } from '../../../../packages/contracts/src/source-messages';
import registry from '../../public/presentation/locales/index.json';
import { TUNABLE_DESCRIPTIONS, tunableDescription } from './descriptions';
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
    expect(leaf('AGGREGATE_CONFIG.shots.scale').comment).toMatch(/shot share/);
    // A leaf without a comment of its own takes its parent's.
    expect(leaf('STAGING_CONFIG.stage.holdMove.speed').comment).toMatch(/keeps it moving/);
    expect(leaves.filter((l) => l.loadTime)).toHaveLength(0);
    expect(catalog.groups.every((g) => g.file.endsWith('/config.ts'))).toBe(true);
  });

  it('every value and group has a Korean description', () => {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as Catalog;
    const ko = TUNABLE_DESCRIPTIONS;
    const missing = 'apps/web/src/lab/tunables.ko.json lacks or keeps stale descriptions (→LAB-3)';
    expect(Object.keys(ko.groups).sort(), missing).toEqual(
      catalog.groups.map((g) => g.name).sort(),
    );
    expect(Object.keys(ko.leaves).sort(), missing).toEqual(
      catalog.groups.flatMap((g) => g.leaves.map((l) => l.path)).sort(),
    );
    const texts = [
      ...Object.values(ko.groups).map((id) => sourceMessages[id]),
      ...Object.keys(ko.leaves).map((path) => tunableDescription(path)),
    ];
    expect(
      texts.filter((text) => !/[가-힣]/.test(text.trim())),
      missing,
    ).toEqual([]);
    for (const locale of registry.entries) {
      const pack = JSON.parse(
        readFileSync(
          new URL(`../../public/presentation/locales/${locale.resource}`, import.meta.url),
          'utf8',
        ),
      ).messages as Record<string, string>;
      for (const id of [
        ...Object.values(ko.groups),
        ...Object.values(ko.leaves).flatMap((d) => [d.control, d.message]),
      ]) {
        expect(pack[id], `${locale.id}: ${id}`).toBeTruthy();
      }
    }
  });
});
