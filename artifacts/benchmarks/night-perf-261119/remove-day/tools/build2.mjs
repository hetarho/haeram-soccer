// node build.mjs <tree> <out.mjs>: bundle the tree's scripts/perf/' + (process.argv[4] || 'side') + '.ts as the perf harness does.
import { build } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/node_modules/esbuild/lib/main.js';
const [tree, out] = process.argv.slice(2);
await build({ absWorkingDir: tree, entryPoints: [tree + '/scripts/perf/' + (process.argv[4] || 'side') + '.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error', nodePaths: ['/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/node_modules'],
  banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" } });
