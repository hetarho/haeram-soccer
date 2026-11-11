import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  dependencies,
  isSource,
  runtimeImports,
  sourceFiles,
  sourceGraph,
} from '../../../../scripts/lib/source-graph';

it('the staging imports no world, season or match orchestration', () => {
  const root = process.cwd();
  const staging = 'packages/engine/src/staging/';
  const files = sourceFiles(root, [staging]).filter(
    (file) => isSource(file) && !/\.test\.[cm]?[jt]sx?$/.test(file),
  );
  expect(files.length).toBeGreaterThan(0);
  const graph = sourceGraph(root);
  for (const file of files) {
    // Resolve imports without executing them; inspect each staging file, including nested ones.
    dependencies(graph, [file]);
    expect(
      runtimeImports(readFileSync(file, 'utf8'), file).filter((name) => !name.startsWith('.')),
      relative(root, file),
    ).toEqual([]);
    for (const imported of graph.files.get(resolve(file)) ?? []) {
      const path = relative(root, imported);
      expect(
        path.startsWith(staging) ||
          path.startsWith('packages/contracts/') ||
          path === 'packages/engine/src/grid/pitch.ts' ||
          path === 'packages/engine/src/primitives.ts',
        `${relative(root, file)} imports ${path}`,
      ).toBe(true);
    }
  }
});
