import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VARIANTS,
  cellsAgainstBaseline,
  divisionRows,
  manifestFailures,
  orderFailures,
  patchFailures,
  recipeHash,
  reviewFailures,
  treeFailures,
} from './generation-repair-recipe';

const artifacts = join(__dirname, '../../artifacts/benchmarks/T916');
const committed = (name: string) => readFileSync(join(artifacts, name));

describe('T943 generation repair recipe', () => {
  it('accepts the committed patches and fails closed on a changed or missing one', () => {
    expect(patchFailures(committed)).toEqual([]);
    const codes = patchFailures((name) =>
      name === 'c2.patch' ? undefined : name === 'c1.patch' ? Buffer.from('x') : committed(name),
    ).map((f) => `${f.code}:${f.subject}`);
    expect(codes).toEqual(['patch-hash:c1', 'patch-missing:c2']);
  });

  it('allows only the two historical test files to differ from the control runtime', () => {
    const control = new Map([
      ['packages/engine/src/world.ts', 'a'],
      ['packages/engine/src/material.test.ts', 'b'],
    ]);
    const source = new Map([
      ['packages/engine/src/world.ts', 'a'],
      ['packages/engine/src/material.test.ts', 'c'],
    ]);
    expect(treeFailures(source, control)).toEqual([]);
    source.set('packages/engine/src/world.ts', 'z');
    source.set('pnpm-lock.yaml', 'n');
    expect(treeFailures(source, control).map((f) => f.subject)).toEqual([
      'packages/engine/src/world.ts',
      'pnpm-lock.yaml',
    ]);
  });

  it('matches a review only for the exact recipe, manifest and patches from another session', () => {
    const exact = { recipeHash: 'r', manifestHash: 'm' };
    const receipt = {
      task: 'T943',
      recipeHash: 'r',
      manifestHash: 'm',
      patches: Object.fromEntries(VARIANTS.map((v) => [v.id, v.sha256])),
      reviewer: { provider: 'codex', session: 'b' },
      author: { provider: 'claude', session: 'a' },
      approved: true,
    };
    expect(reviewFailures(receipt, exact)).toEqual([]);
    expect(reviewFailures(undefined, exact).map((f) => f.code)).toEqual(['review-missing']);
    expect(
      reviewFailures(
        { ...receipt, recipeHash: 'other workload', reviewer: receipt.author, approved: false },
        exact,
      ).map((f) => f.code),
    ).toEqual(['review-recipe', 'review-not-approved', 'review-not-independent']);
    expect(
      reviewFailures({ ...receipt, patches: { ...receipt.patches, c2: 'x' } }, exact).map(
        (f) => f.subject,
      ),
    ).toEqual(['c2']);
  });

  it('hashes the recipe by content and name and fails closed on a changed manifest', () => {
    expect(recipeHash({ a: 'x', b: 'y' })).toBe(recipeHash({ b: 'y', a: 'x' }));
    expect(recipeHash({ a: 'x' })).not.toBe(recipeHash({ a: 'y' }));
    expect(manifestFailures({ a: 1, b: [2] }, { b: [2], a: 1 })).toEqual([]);
    expect(manifestFailures({ a: 1 }, { a: 2 }).map((f) => f.code)).toEqual(['manifest-differs']);
  });

  it('hashes the execution helpers with the recipe, so a changed runner needs a new review', () => {
    const manifest = JSON.parse(readFileSync(join(artifacts, 'manifest.json'), 'utf8'));
    expect(Object.keys(manifest.recipe.files)).toEqual(
      expect.arrayContaining([
        'scripts/lib/measurement-identity.ts',
        'scripts/lib/source-graph.ts',
        'scripts/lib/verification-runner.ts',
        'scripts/natural-football/generation-repair-recipe.ts',
        'scripts/natural-football/generation-repair-run.ts',
        'scripts/natural-football/generation-repair.mjs',
      ]),
    );
  });

  it('retains every strict-order failure and every 1950 cell against the 1930 baseline', () => {
    const countries = [{ code: 'AAA', tiers: 3 }];
    const base = divisionRows(
      [
        { country: 'AAA', tier: 0, strength: 70 },
        { country: 'AAA', tier: 1, strength: 60 },
        { country: 'AAA', tier: 2, strength: 50 },
        { country: 'AAA', tier: 0, strength: 99, representative: true },
      ],
      countries,
    );
    expect(base.map((r) => r.mean)).toEqual([70, 60, 50]);
    expect(orderFailures(1930, base)).toEqual([]);
    const later = divisionRows(
      [
        { country: 'AAA', tier: 0, strength: 74 },
        { country: 'AAA', tier: 1, strength: 74 },
        { country: 'AAA', tier: 2, strength: 75 },
      ],
      countries,
    );
    expect(orderFailures(1950, later).map((f) => f.tier)).toEqual([1, 2]);
    expect(cellsAgainstBaseline(later, base).map((c) => c.outsideBand)).toEqual([
      false,
      true,
      true,
    ]);
    expect(cellsAgainstBaseline(later.slice(0, 1), base).map((c) => c.outsideBand)).toEqual([
      false,
      true,
      true,
    ]);
  });
});
