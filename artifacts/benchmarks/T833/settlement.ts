/** Required T833 settlement measurement; no staging, calendar progression or test suite. */
import { cpus, freemem, loadavg, platform, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { careerWorld } from '../../../packages/engine/src/career.testkit';
import { activateMatchModel, validateFullMatchRecord } from '../../../packages/engine/src/match-model';
import { SCRIPTED_RELEASE } from '../../../packages/engine/src/match-model-release';
import { simulateMatch } from '../../../packages/engine/src/match';

const original = careerWorld({ seed: 'settlement-833', country: 'BEL', year: 2024 });
const scripted = structuredClone(original);
activateMatchModel(scripted, SCRIPTED_RELEASE);
const fixtures = original.fixtures.filter((f) => f.home === original.playerClub || f.away === original.playerClub).slice(0, 22);
const loadBefore = loadavg();
const rows: Record<string, unknown>[] = [];
for (const [index, fixture] of fixtures.entries()) {
  const pair: Record<string, unknown> = { fixture: fixture.id, warmup: index < 2 };
  for (const revision of index % 2 ? [11, 10] : [10, 11]) {
    const w = revision === 10 ? original : scripted;
    const cpu = process.cpuUsage();
    const start = performance.now();
    const playback = simulateMatch(w, fixture, false);
    const milliseconds = performance.now() - start;
    const used = process.cpuUsage(cpu);
    pair[revision] = {
      milliseconds, cpuMilliseconds: (used.user + used.system) / 1000,
      model: playback.record.model, problems: playback.problems ?? [],
      recordIssues: validateFullMatchRecord(playback.record), material: !!playback.record.material,
      frames: playback.frames.length,
    };
  }
  rows.push(pair);
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2;
};
const measured = rows.filter((row) => !row.warmup);
const summaries = [10, 11].map((revision) => {
  const values = measured.map((row) => row[revision] as { milliseconds: number; cpuMilliseconds: number; problems: string[]; material: boolean; recordIssues: string[] });
  return { revision, fixtures: values.length, medianMilliseconds: median(values.map((v) => v.milliseconds)),
    medianCpuMilliseconds: median(values.map((v) => v.cpuMilliseconds)),
    material: values.filter((v) => v.material).length,
    scriptFailures: values.filter((v) => v.problems.length).length,
    invalidRecords: values.filter((v) => v.recordIssues.length).length };
});
const sourcePaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter((p) => /^(packages|tests|scripts)\//.test(p) && /\.(ts|json|mjs)$/.test(p)).sort();
const sourceHash = createHash('sha256');
for (const path of sourcePaths) sourceHash.update(path + '\0').update(readFileSync(path));
const report = {
  command: 'pnpm exec tsx artifacts/benchmarks/T833/settlement.ts',
  sourceFingerprint: sourceHash.digest('hex'),
  sourceFiles: sourcePaths.length,
  runnerSha256: createHash('sha256').update(readFileSync(new URL('./settlement.ts', import.meta.url))).digest('hex'),
  at: new Date().toISOString(), node: process.version,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  patchSha256: createHash('sha256').update(execFileSync('git', ['diff', 'HEAD'])).digest('hex'),
  machine: { platform: platform(), release: release(), arch: process.arch, cpu: cpus()[0]?.model,
    cores: cpus().length, loadBefore, loadAfter: loadavg(), totalMemory: totalmem(), freeMemory: freemem() },
  methodology: 'One immutable 2024 BEL takeover, same own fixture inputs on revisions 10/11, unobserved. Two warmup pairs then 20 measured pairs, order alternating. Includes record/detail/script/recount/material on revision 11; no staging or calendar progression. Wall time and process CPU are descriptive, not a speed-up claim.',
  seed: original.seed, summaries, rows, memory: process.memoryUsage(),
};
writeFileSync(new URL('./settlement.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summaries, machine: report.machine }));
