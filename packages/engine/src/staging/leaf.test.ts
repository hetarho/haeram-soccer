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
    (file) => isSource(file) && !/\.(?:test|testkit)\.[cm]?[jt]sx?$/.test(file),
  );
  expect(files.length).toBeGreaterThan(0);
  const graph = sourceGraph(root);
  for (const file of files) {
    // Resolve imports without executing them; inspect each staging file, including nested ones.
    for (const imported of dependencies(graph, [file])) {
      expect(
        !/^packages\/engine\/src\/(season(?:\.|\/)|world(?:\.|\/)|match\.ts$)/.test(
          relative(root, imported),
        ),
      ).toBe(true);
    }
    expect(
      runtimeImports(readFileSync(file, 'utf8'), file).filter((name) => !name.startsWith('.')),
      relative(root, file),
    ).toEqual([]);
    for (const imported of graph.files.get(resolve(file)) ?? []) {
      const path = relative(root, imported);
      expect(
        path.startsWith(staging) ||
          path.startsWith('packages/contracts/') ||
          path === 'packages/engine/src/match/pitch.ts' ||
          path === 'packages/engine/src/match/clock.ts' ||
          path === 'packages/engine/src/match/commentary.ts' ||
          path === 'packages/engine/src/match/motion.ts' ||
          path === 'packages/engine/src/match/record.ts' ||
          path === 'packages/engine/src/primitives.ts' ||
          path === 'packages/engine/src/script/count.ts' ||
          path === 'packages/engine/src/script/types.ts' ||
          path === 'packages/engine/src/script/failure.ts' ||
          path === 'packages/engine/src/formations.ts' ||
          path === 'packages/engine/src/portable-math.ts',
        `${relative(root, file)} imports ${path}`,
      ).toBe(true);
    }
  }
});

it('the script imports only leaves', () => {
  const root = process.cwd();
  const script = 'packages/engine/src/script/';
  const files = sourceFiles(root, [script]).filter(
    (file) => isSource(file) && !/\.(?:test|testkit)\.[cm]?[jt]sx?$/.test(file),
  );
  expect(files.length).toBeGreaterThan(0);
  const graph = sourceGraph(root);
  for (const file of files) {
    expect(
      runtimeImports(readFileSync(file, 'utf8'), file).filter((name) => !name.startsWith('.')),
      relative(root, file),
    ).toEqual([]);
    for (const imported of dependencies(graph, [file])) {
      const path = relative(root, imported);
      expect(
        !/^packages\/engine\/src\/(season(?:\.|\/)|world(?:\.|\/)|match\.ts$)/.test(path),
        `${relative(root, file)} reaches ${path}`,
      ).toBe(true);
    }
  }
});
