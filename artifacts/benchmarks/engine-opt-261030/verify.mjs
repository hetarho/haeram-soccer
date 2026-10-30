/** Focused prototype correctness checks, deliberately outside production sources/test selection. */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
// Save canonicalization excludes internal infinities; V8 serialization can encode equal
// values differently. Tag value types, signed zero and non-finite sentinels deterministically.
function internalCanonical(v) {
  if (v === null) return 'null';
  if (typeof v === 'number') return 'number:' + (Object.is(v, -0) ? '-0' : String(v));
  if (typeof v === 'string') return 'string:' + JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'undefined') return typeof v + ':' + String(v);
  if (Array.isArray(v)) return '[' + v.map(internalCanonical).join(',') + ']';
  if (ArrayBuffer.isView(v))
    return (
      'typed:' +
      v.constructor.name +
      ':' +
      Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('hex')
    );
  assert.equal(Object.getPrototypeOf(v), Object.prototype, 'plain internal output object');
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + internalCanonical(v[k]))
      .join(',') +
    '}'
  );
}

const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, '../../..'),
  scratch = join(root, '.tmp/eo30-verify');
mkdirSync(scratch, { recursive: true });
const source = `
export * from './packages/engine/src/primitives';
export { binomialDraw, multinomialInto } from './packages/engine/src/aggregate/participation';
export * as sampling from './packages/engine/src/aggregate/participation';
export { createWorld, MATCH_MODEL_RELEASE } from './packages/engine/src/index';
export { buildGridSetup } from './packages/engine/src/grid/setup';
export { playGrid } from './packages/engine/src/grid/engine';
export { simulateAggregate } from './packages/engine/src/aggregate/engine';
export { canonical } from './packages/contracts/src/index';
`;
async function moduleOf(name) {
  const tree = name === 'baseline' ? root : join(root, '.tmp/eo30-variants', name),
    outfile = join(scratch, name + '.mjs');
  await build({
    absWorkingDir: tree,
    stdin: { contents: source, resolveDir: tree, sourcefile: 'probe.ts', loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    nodePaths: [join(root, 'node_modules')],
    logLevel: 'error',
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });
  return import(pathToFileURL(outfile).href);
}
const baseline = await moduleOf('baseline');
const seeds = [
  'perf-261027',
  'architecture-second-seed',
  'cdf-boundary-seed',
  'rng-prefetch-boundary',
];
const summary = [];
for (const name of [
  'float64-scratch',
  'int32-scratch',
  'cdf-cache',
  'sparse-weights',
  'wasm-scalar-rng',
  'wasm-buffered-rng',
  'grid-simd-hypot',
  'grid-wasm-phase',
]) {
  const mod = await moduleOf(name);
  let randomChecks = 0,
    binomialChecks = 0,
    multinomialChecks = 0;
  for (const seed of seeds) {
    const a = baseline.random(seed),
      b = mod.random(seed);
    for (let i = 0; i < 10000; i++) {
      assert.equal(b(), a(), `${name} RNG draw ${i}`);
      randomChecks++;
    }
    for (const n of [0, 1, 2, 3, 4, 8, 16, 32, 64, 128, 1000])
      for (const p of [0, 0.001, 0.01, 0.1, 0.3, 0.5, 0.7, 0.99, 1]) {
        const a = baseline.random(seed),
          b = mod.random(seed);
        for (let i = 0; i < 25; i++) {
          assert.equal(
            mod.binomialDraw(b, n, p),
            baseline.binomialDraw(a, n, p),
            `${name} B(${n},${p})`,
          );
          binomialChecks++;
        }
        assert.equal(b(), a(), `${name} binomial next-draw identity`);
      }
    for (const weights of [
      [0, 1, 0, 2, 3],
      [0, 0, 0],
      [0.1, 0.2, 0.3, 0.4],
      Array.from({ length: 18 }, (_, i) => (i % 3 === 0 ? 0 : i + 0.1)),
    ]) {
      mod.sampling.registerWeights?.(weights);
      for (const n of [0, 1, 2, 4, 8, 32, 100]) {
        const a = baseline.random(seed),
          b = mod.random(seed);
        for (let i = 0; i < 25; i++) {
          assert.deepEqual(
            mod.multinomialInto(
              b,
              n,
              weights,
              weights.map(() => 0),
            ),
            baseline.multinomialInto(
              a,
              n,
              weights,
              weights.map(() => 0),
            ),
            `${name} multinomial`,
          );
          multinomialChecks++;
        }
        assert.equal(b(), a(), `${name} multinomial next-draw identity`);
      }
    }
  }
  const hashes = [];
  for (const seed of seeds) {
    const worlds = [baseline, mod].map((m) =>
      m.createWorld(
        { country: 'ENG', name: 'Parity', color: '#284e35', seed, level: 'easy' },
        m.MATCH_MODEL_RELEASE,
      ),
    );
    const results = [];
    for (const [i, m] of [baseline, mod].entries()) {
      const w = worlds[i],
        hash = createHash('sha256');
      const fixtures = w.fixtures
        .filter((f) => f.home !== w.playerClub && f.away !== w.playerClub)
        .slice(0, 40);
      for (const f of fixtures) hash.update(m.canonical(m.simulateAggregate(w, f).record));
      results.push(hash.digest('hex'));
    }
    assert.equal(results[1], results[0], `${name} aggregate ${seed}`);
    hashes.push({ seed, aggregate: results[0] });
  }
  if (name.startsWith('grid-') || name.startsWith('wasm-')) {
    for (const seed of seeds.slice(0, 2)) {
      const results = [];
      for (const m of [baseline, mod]) {
        const w = m.createWorld(
          { country: 'ENG', name: 'Parity', color: '#284e35', seed, level: 'easy' },
          m.MATCH_MODEL_RELEASE,
        );
        const f = w.fixtures.find((f) => f.home === w.playerClub || f.away === w.playerClub);
        const playback = m.playGrid(m.buildGridSetup(w, f, { observe: true, recordPlayers: true }));
        // Grid diagnostics may contain non-finite sentinels, which save canonicalization rejects.
        // Preserve those bits in this internal-output check rather than JSON-dropping them.
        results.push({
          value: playback,
          hash: createHash('sha256').update(internalCanonical(playback)).digest('hex'),
        });
      }
      assert.deepStrictEqual(
        results[1].value,
        results[0].value,
        `${name} full observed grid output ${seed}`,
      );
      assert.equal(results[1].hash, results[0].hash, `${name} full observed grid digest ${seed}`);
      hashes.push({ seed, observedPlayback: results[0].hash });
    }
  }
  const result = { name, randomChecks, binomialChecks, multinomialChecks, hashes, passed: true };
  summary.push(result);
  console.log(JSON.stringify(result));
}
writeFileSync(join(here, 'correctness.json'), JSON.stringify(summary, null, 2));
