import { relative } from 'node:path';
import { dependencies, sourceFiles, sourceGraph } from './source-graph';

/** Static runtime edges, not a timing or a claim about Vitest's dependency tracker. */
export function dependencyReport(root: string) {
  const graph = sourceGraph(root);
  const production = sourceFiles(root, ['packages/engine/src']).filter(
    (file) => file.endsWith('.ts') && !/\.(test|contract\.test)\.ts$/.test(file),
  );
  for (const file of production) dependencies(graph, [file]);
  const engine = new Set(production);
  let index = 0;
  const indexes = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (file: string) => {
    indexes.set(file, index);
    low.set(file, index++);
    stack.push(file);
    onStack.add(file);
    for (const next of graph.files.get(file) ?? []) {
      if (!engine.has(next)) continue;
      if (!indexes.has(next)) {
        visit(next);
        low.set(file, Math.min(low.get(file)!, low.get(next)!));
      } else if (onStack.has(next)) low.set(file, Math.min(low.get(file)!, indexes.get(next)!));
    }
    if (low.get(file) !== indexes.get(file)) return;
    const component: string[] = [];
    let next: string;
    do {
      next = stack.pop()!;
      onStack.delete(next);
      component.push(relative(root, next));
    } while (next !== file);
    components.push(component.sort());
  };
  production.forEach((file) => {
    if (!indexes.has(file)) visit(file);
  });
  const tests = sourceFiles(root, [
    'packages',
    'apps',
    'tests/fixtures',
    'scripts',
    'tests/config',
  ]).filter((file) => file.endsWith('.test.ts'));
  const reaches = (entry: string) =>
    dependencies(graph, [entry]).map((file) => relative(root, file));
  const shape = 'packages/engine/src/grid/shape.ts';
  const affected = tests.filter((file) => reaches(file).includes(shape));
  return {
    definition:
      'Static relative runtime imports/exports, including literal dynamic imports; type-only edges excluded.',
    engineModules: production.length,
    largestEngineCycle: components.sort((a, b) => b.length - a.length)[0] ?? [],
    tests: tests.length,
    testsReachingShape: affected.length,
    webTestsReachingShape: affected.filter((file) => relative(root, file).startsWith('apps/web/'))
      .length,
    gridExecution: reaches('packages/engine/src/grid/engine.ts'),
    packing: reaches('apps/web/src/adapters/packing.ts'),
  };
}
