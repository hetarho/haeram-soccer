/**
 * T943: T916's frozen four-variant generation repair recipe, rebuilt from retained Git objects.
 *
 *   pnpm exec tsx scripts/natural-football/generation-repair.mjs prepare [--write]
 *   pnpm exec tsx scripts/natural-football/generation-repair.mjs execute \
 *     --review <receipt.json> --heavy-lock <installed gusta src/check-cache.mjs> --out <fresh dir>
 *
 * `prepare` reads Git objects only (no world, no production edit): it checks that the historical
 * source's runtime trees equal the control's apart from two test files, pins the patched anchors,
 * checks every patch's hash and that it applies to a fresh export, records the run's transitive
 * runtime closure in that export and hashes the recipe. Without --write it compares the result with
 * the committed manifest and fails closed on any difference.
 *
 * `execute` is the host's separate explicit action. It requires the committed manifest to still
 * hold, a review receipt naming this exact recipe, manifest and patches from a session other than
 * the author's, and the shared heavy lock of the installed CLI (`withHeavyLock`). Each variant then
 * gets its own fresh export, patch and esbuild bundle, and runs as an owned child
 * (`runVerificationStage`), all four within T916's 30-minute cap; a timeout cancels them and
 * leaves them unfinished. Receipts record inputs, endpoint hashes, completion and cleanup.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';
import { dependencies, sourceGraph, typescriptVersion } from '../lib/source-graph.ts';
import { measurementIdentity } from '../lib/measurement-identity.ts';
import { runVerificationStage } from '../lib/verification-runner.ts';
import { runOwned } from './generation-repair-owned.ts';
import {
  ANCHORS,
  CONTROL,
  END_YEAR,
  MAX_CHILDREN,
  ORACLE,
  RUNTIME_INPUTS,
  SEED,
  SOURCE,
  TIMEBOX_MS,
  VARIANTS,
  anchorFailures,
  canonical,
  cellsAgainstBaseline,
  manifestFailures,
  patchFailures,
  recipeHash,
  reviewFailures,
  sha256,
  treeFailures,
} from './generation-repair-recipe.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const artifacts = join(repo, 'artifacts/benchmarks/T916');
const manifestFile = join(artifacts, 'manifest.json');
const RUN = 'scripts/natural-football/generation-repair-run.ts';
const ORCHESTRATOR = 'scripts/natural-football/generation-repair.mjs';
/**
 * Every file the recipe's behaviour depends on: the orchestrator's transitive local imports (the
 * owned-child runner, identity and graph helpers included, so a changed runner changes the hash a
 * review names), the child run and the patches.
 */
const recipeFiles = () =>
  [
    ...new Set([
      ...dependencies(sourceGraph(repo), [ORCHESTRATOR]).map((file) => relative(repo, file)),
      RUN,
      ...VARIANTS.map((v) => `artifacts/benchmarks/T916/${v.patch}`),
    ]),
  ].sort();
const EXPORT_PATHS = [...RUNTIME_INPUTS];

const git = (args, options = {}) => execFileSync('git', args, { cwd: repo, ...options });
const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
const emit = (value) => process.stdout.write(`${JSON.stringify(value, null, 1)}\n`);

function tree(commit) {
  const out = git(['ls-tree', '-r', commit, '--', ...RUNTIME_INPUTS], { encoding: 'utf8' });
  return new Map(
    out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [meta, path] = line.split('\t');
        return [path, meta.split(' ')[2]];
      }),
  );
}
const blob = (commit, path) => {
  try {
    return git(['show', `${commit}:${path}`]);
  } catch {
    return undefined;
  }
};

/** A fresh export of the historical runtime inputs with this recipe's run files beside them. */
function exportSource(dir) {
  mkdirSync(dir, { recursive: true });
  const archive = git(['archive', '--format=tar', SOURCE, '--', ...EXPORT_PATHS], {
    maxBuffer: 1 << 30,
  });
  execFileSync('tar', ['-x', '-C', dir], { input: archive });
  mkdirSync(join(dir, 'scripts/natural-football'), { recursive: true });
  for (const file of [RUN, 'scripts/natural-football/generation-repair-recipe.ts'])
    cpSync(join(repo, file), join(dir, file));
  return dir;
}
function applyPatch(dir, variant) {
  const patch = join(artifacts, variant.patch);
  if (readFileSync(patch).length === 0) return { applied: false, empty: true };
  execFileSync('git', ['apply', '--check', patch], { cwd: dir });
  execFileSync('git', ['apply', patch], { cwd: dir });
  return { applied: true, empty: false };
}

/**
 * Bundles the run from one export. Isolation: every bundled input lies in that export, or in this
 * checkout's node_modules for third-party packages; none comes from this checkout's source.
 */
async function bundleRun(treeDir, outfile) {
  const result = await build({
    absWorkingDir: treeDir,
    entryPoints: [RUN],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
    metafile: true,
    nodePaths: [join(repo, 'node_modules')],
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });
  const modules = join(repo, 'node_modules');
  const inputs = Object.keys(result.metafile.inputs).map((input) => resolve(treeDir, input));
  const outside = inputs.filter(
    (file) => !file.startsWith(`${treeDir}/`) && !file.startsWith(`${modules}/`),
  );
  return {
    sources: inputs.filter((file) => file.startsWith(`${treeDir}/`)).length,
    outside: outside.map((file) => relative(repo, file)),
  };
}

async function prepare() {
  const failures = [];
  for (const commit of [SOURCE, CONTROL])
    try {
      git(['cat-file', '-e', `${commit}^{commit}`]);
    } catch {
      failures.push({ code: 'commit-missing', subject: commit });
    }
  if (failures.length) return { failures };
  const source = tree(SOURCE),
    control = tree(CONTROL);
  failures.push(...treeFailures(source, control));
  failures.push(...anchorFailures((path) => blob(SOURCE, path)));
  for (const [path, anchor] of Object.entries(ANCHORS))
    if (source.get(path) !== anchor.blob)
      failures.push({
        code: 'anchor-blob',
        subject: path,
        expected: anchor.blob,
        observed: source.get(path) ?? 'absent',
      });
  failures.push(
    ...patchFailures((name) => {
      const file = join(artifacts, name);
      return existsSync(file) ? readFileSync(file) : undefined;
    }),
  );
  const scratch = mkdtempSync(join(tmpdir(), 't943-prepare-'));
  const applies = {};
  for (const variant of VARIANTS) {
    const dir = exportSource(join(scratch, variant.id));
    try {
      applies[variant.id] = applyPatch(dir, variant);
    } catch {
      failures.push({ code: 'patch-apply', subject: variant.id });
      continue;
    }
    // Bundling compiles the run against the patched export; it loads no world.
    const bundled = await bundleRun(dir, join(scratch, `${variant.id}.mjs`));
    applies[variant.id].bundledSources = bundled.sources;
    for (const file of bundled.outside)
      failures.push({ code: 'bundle-not-isolated', subject: `${variant.id}:${file}` });
  }
  // The run's transitive runtime closure, read in the unpatched control export.
  const root = join(scratch, 'control');
  const graph = sourceGraph(root);
  const closure = Object.fromEntries(
    dependencies(graph, [RUN]).map((file) => [
      relative(graph.root, file),
      sha256(readFileSync(file)),
    ]),
  );
  const identity = measurementIdentity(RUN, root);
  const recipe = Object.fromEntries(
    recipeFiles().map((file) => [file, readFileSync(join(repo, file))]),
  );
  const manifest = {
    schema: 't943-generation-repair-manifest-v1',
    task: 'T916',
    preparedBy: 'T943',
    source: SOURCE,
    control: CONTROL,
    seed: SEED,
    endYear: END_YEAR,
    observer: {
      initial: 'historyWorld(seed); advanceRound(w, undefined, false)',
      daily: 'advanceDays(w, 1, undefined, false) until w.year === 1950',
      rows: 'every first-day non-representative country/tier mean of stored strength',
      order: 'strict: each tier below the one above; every failure retained, none waived',
      cells: 'all 1950 country/tier cells against the control 1930 baseline, band 5',
    },
    oracle: ORACLE,
    timeboxMs: TIMEBOX_MS,
    maxChildren: MAX_CHILDREN,
    runtime: {
      inputs: RUNTIME_INPUTS,
      sourceTreeEqualsControl: treeFailures(source, control).length === 0,
      allowedDifferences: [...source.keys()]
        .filter((path) => source.get(path) !== control.get(path))
        .sort(),
      closure,
      closureFingerprint: identity,
    },
    toolchain: {
      node: process.version,
      typescript: typescriptVersion,
      esbuild: esbuildVersion,
      lockfile: source.get('pnpm-lock.yaml'),
    },
    anchors: ANCHORS,
    variants: VARIANTS.map((v) => ({ ...v, ...applies[v.id] })),
    recipe: {
      files: Object.fromEntries(
        Object.entries(recipe).map(([name, bytes]) => [name, sha256(bytes)]),
      ),
      hash: recipeHash(recipe),
    },
  };
  rmSync(scratch, { recursive: true, force: true });
  return { failures, manifest };
}

/** The boundaries an owned run persisted as it reached them; null before its first. */
function observed(run) {
  if (!existsSync(run.observationsFile)) return null;
  const bytes = readFileSync(run.observationsFile);
  try {
    const data = JSON.parse(bytes.toString('utf8'));
    return {
      file: run.observationsFile,
      sha256: sha256(bytes),
      complete: data.complete,
      through: data.through,
      years: data.years.map((entry) => entry.year),
      orderFailures: data.orderFailures,
    };
  } catch {
    return { file: run.observationsFile, sha256: sha256(bytes), unreadable: true };
  }
}

async function execute() {
  const prepared = await prepare();
  const committed = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, 'utf8'))
    : undefined;
  const failures = [...prepared.failures];
  if (!committed) failures.push({ code: 'manifest-missing', subject: manifestFile });
  else failures.push(...manifestFailures(committed, prepared.manifest));
  const manifestHash = committed ? sha256(canonical(committed)) : '';
  const reviewFile = arg('--review');
  const receipt =
    reviewFile && existsSync(reviewFile) ? JSON.parse(readFileSync(reviewFile, 'utf8')) : undefined;
  failures.push(
    ...reviewFailures(receipt, { recipeHash: committed?.recipe?.hash ?? '', manifestHash }),
  );
  const lockModule = arg('--heavy-lock'),
    out = arg('--out');
  const lock =
    lockModule && existsSync(lockModule)
      ? await import(pathToFileURL(resolve(lockModule)).href)
      : {};
  if (typeof lock.withHeavyLock !== 'function')
    failures.push({ code: 'heavy-lock-missing', subject: String(lockModule) });
  if (!out || existsSync(out)) failures.push({ code: 'out-not-fresh', subject: String(out) });
  if (failures.length) {
    emit({ status: 'refused', failures });
    process.exitCode = 1;
    return;
  }
  const runtime = join(
    resolve(repo, git(['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()),
    'gusta/v1',
  );
  mkdirSync(out, { recursive: true });
  await lock.withHeavyLock(runtime, 'T916 generation repair (T943 recipe)', async () => {
    const started = new Date().toISOString();
    const runs = [];
    for (const variant of VARIANTS) {
      const dir = join(out, variant.id);
      const treeDir = exportSource(join(dir, 'tree'));
      const patch = applyPatch(treeDir, variant);
      const bundle = join(dir, 'run.mjs');
      const bundled = await bundleRun(treeDir, bundle);
      if (bundled.outside.length)
        throw new Error(`generation-repair:bundle-not-isolated:${variant.id}`);
      runs.push({
        variant,
        patch,
        dir,
        receiptFile: join(dir, 'receipt.json'),
        observationsFile: join(dir, 'observations.json'),
        inputs: {
          bundleSha256: sha256(readFileSync(bundle)),
          patched: Object.fromEntries(
            Object.keys(ANCHORS).map((path) => [path, sha256(readFileSync(join(treeDir, path)))]),
          ),
        },
        bundle,
      });
    }
    // Every stage entry, cancellation and cleanup receipt included, is written as it changes, so an
    // interrupted coordinator still leaves the children's evidence on disk.
    // The runner calls `record` right after spawning; it never throws there, so a started child is
    // always returned to this coordinator and owned for cleanup. A failed write is kept as evidence.
    const entries = {};
    const stagesFile = join(out, 'stages.json');
    const recordFailures = [];
    const record = (id, entry) => {
      entries[id] = entry;
      try {
        writeFileSync(stagesFile, `${JSON.stringify(entries, null, 1)}\n`);
      } catch (error) {
        recordFailures.push({ stage: id, at: new Date().toISOString(), message: String(error) });
      }
    };
    // Each child is owned as soon as it starts: a coordinator signal, the timebox or an exceptional
    // exit (a later child's failed start included) cancels and awaits every started child before
    // the heavy lock is released (`runOwned`).
    const { done, timedOut, interrupted } = await runOwned(
      runs.map(
        (run) => () =>
          runVerificationStage(
            {
              stage: run.variant.id,
              command: process.execPath,
              args: [run.bundle, run.variant.id, run.receiptFile, run.observationsFile],
            },
            { directory: run.dir, onUpdate: (entry) => record(run.variant.id, entry) },
          ),
      ),
      { timeoutMs: TIMEBOX_MS },
    );
    const results = runs.map((run, index) => {
      // A run the interruption reached before it started stays unstarted, never passed.
      const entry = done[index] ?? { status: 'not-started', exitCode: null };
      const result =
        entry.status === 'passed' && existsSync(run.receiptFile)
          ? JSON.parse(readFileSync(run.receiptFile, 'utf8'))
          : undefined;
      return { run, entry, result };
    });
    const control = results.find((r) => r.run.variant.id === 'control')?.result;
    const baseline = control?.years?.[0]?.rows;
    const summary = {
      schema: 't943-generation-repair-execution-v1',
      manifestHash,
      recipeHash: committed.recipe.hash,
      review: { file: reviewFile, sha256: sha256(readFileSync(reviewFile)) },
      started,
      finished: new Date().toISOString(),
      timeboxMs: TIMEBOX_MS,
      timedOut,
      interrupted,
      stages: {
        file: stagesFile,
        sha256: existsSync(stagesFile) ? sha256(readFileSync(stagesFile)) : null,
        recordFailures,
      },
      oracle: {
        expected: ORACLE.sha256,
        serializer: control?.oracle?.reproduced ? 'proved-by-control-reproduction' : 'unresolved',
      },
      runs: results.map(({ run, entry, result }) => ({
        variant: run.variant.id,
        patchSha256: run.variant.sha256,
        inputs: run.inputs,
        completion: {
          status: entry.status,
          pid: entry.pid ?? null,
          started: entry.started,
          finished: entry.finished ?? null,
          exitCode: entry.exitCode,
          signal: entry.signal ?? null,
          elapsedMs: entry.elapsedMs,
          cancelRequested: entry.cancelRequested ?? null,
          cancellationCleanup: entry.cancellationCleanup ?? null,
          failure: entry.failure ?? null,
          stdoutPath: entry.stdoutPath,
          stderrPath: entry.stderrPath,
        },
        finished: !!result,
        receiptSha256: result ? sha256(readFileSync(run.receiptFile)) : null,
        // An unfinished run keeps every boundary it reached; these are not completion.
        observations: observed(run),
        endpoint: result?.endpoint ?? null,
        orderFailures: result?.orderFailures ?? null,
        baselineEqualsControl:
          result && baseline ? canonical(result.years[0].rows) === canonical(baseline) : null,
        cells1950:
          result && baseline ? cellsAgainstBaseline(result.years.at(-1).rows, baseline) : null,
      })),
      modelPassClaimed: false,
      timingClaimed: false,
    };
    writeFileSync(join(out, 'execution.json'), `${JSON.stringify(summary, null, 1)}\n`);
    emit({
      status: interrupted ? 'interrupted' : timedOut ? 'unfinished' : 'completed',
      execution: join(out, 'execution.json'),
    });
    if (interrupted) process.exitCode = 1;
  });
}

const mode = process.argv[2];
if (mode === 'prepare') {
  const { failures, manifest } = await prepare();
  if (manifest && process.argv.includes('--write') && !failures.length)
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
  else if (manifest && !process.argv.includes('--write')) {
    const committed = existsSync(manifestFile)
      ? JSON.parse(readFileSync(manifestFile, 'utf8'))
      : undefined;
    failures.push(
      ...(committed
        ? manifestFailures(committed, manifest)
        : [{ code: 'manifest-missing', subject: manifestFile }]),
    );
  }
  emit({
    status: failures.length ? 'failed' : 'ok',
    failures,
    recipeHash: manifest?.recipe.hash,
    manifestHash: manifest ? sha256(canonical(manifest)) : undefined,
  });
  if (failures.length) process.exitCode = 1;
} else if (mode === 'execute') await execute();
else {
  emit({
    status: 'usage',
    modes: ['prepare [--write]', 'execute --review <file> --heavy-lock <file> --out <dir>'],
  });
  process.exitCode = 2;
}
