/**
 * The perf scripts' one way of bundling a tree's `scripts/perf/workloads.ts` (`ab.mjs`,
 * `profile.mjs`): esbuild from the tree's own root, so identical sources give byte-identical
 * bundles, and this checkout's `node_modules` for the dependencies.
 */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function bundleWorkloads(tree, outfile) {
  await build({
    absWorkingDir: tree,
    entryPoints: ['scripts/perf/workloads.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
    nodePaths: [join(repo, 'node_modules')],
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });
  return outfile;
}
