/** Computation scope is separate from a report's full source provenance. */
import { dependencies, fingerprintFiles, sourceFiles, sourceGraph } from './source-graph';

export const MEASUREMENT_INPUTS = [
  'packages/catalogs/data',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
] as const;

export function measurementIdentity(
  entry: string,
  root = process.cwd(),
  options: { inputs?: readonly string[]; referenceOnly?: boolean } = {},
) {
  const graph = sourceGraph(root);
  const files = dependencies(graph, [entry]).filter(
    (file) =>
      !options.referenceOnly || !file.startsWith(`${graph.root}/packages/engine/src/aggregate/`),
  );
  return {
    ...fingerprintFiles(graph.root, [
      ...files,
      ...sourceFiles(graph.root, options.inputs ?? MEASUREMENT_INPUTS),
    ]),
    entry,
    scope: options.referenceOnly
      ? 'detailed reference; aggregate implementation excluded'
      : 'runtime dependency closure and declared inputs',
  };
}
