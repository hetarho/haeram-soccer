/**
 * T940: FixtureReplicaWriter.encode on successive round days of a stored 1950 world, base writer
 * (base-writer.ts, frozen at the task base) against the candidate in the tree, in interleaved
 * pairs from the same previous state. Asserts identical patch texts and rosterChanged, and writes
 * the median candidate/base encode-time ratio with a distribution-free 95% interval to
 * results.json beside this script.
 *
 * Run from the repository root: node --expose-gc --import tsx <this file> [world.bin] [rounds] [reps]
 */
import v8 from 'node:v8';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { World } from '../../../../packages/contracts/src/types';
import type { FixtureReadCopy } from '../../../../packages/engine/src/fixture-copy';
import { advanceDays, completeRound, prepareRound } from '../../../../packages/engine/src/season';
import { FixtureReplicaWriter } from '../../../../apps/web/src/runtime/fixtureReplica';
import { BaseFixtureReplicaWriter } from './base-writer';

const here = dirname(fileURLToPath(import.meta.url));
const file =
  process.argv[2] ||
  '/tmp/claude-2378/-home-deep-haeram-haeram-soccor/df2135f9-ba36-4023-bb25-ee99a520d827/scratchpad/scout-play/world-1950.bin';
const ROUNDS = Number(process.argv[3] ?? 4);
const REPS = Number(process.argv[4] ?? 9);
const loadAtStart = loadavg();
const gc = (globalThis as { gc?: () => void }).gc;

interface Writer {
  encode(copy: FixtureReadCopy, revision: number): { base: number; patch?: string };
}
const writers: Record<'base' | 'candidate', Writer> = {
  base: new BaseFixtureReplicaWriter(),
  candidate: new FixtureReplicaWriter(),
};
// The writers' private fingerprints, restored before every timed encode of a round.
const previousOf = (w: Writer) => Reflect.get(w, 'previous') as unknown;
const restore = (w: Writer, state: unknown) => Reflect.set(w, 'previous', state);
const rosterChanged = (patch: string | undefined) => {
  const m = /"rosterChanged":(true|false)}$/.exec(patch ?? '');
  if (!m) throw new Error('patch without rosterChanged');
  return m[1] === 'true';
};

const w = v8.deserialize(readFileSync(file)) as World;
w.cash = '99999999999';
const pairs: { round: number; rep: number; first: string; base: number; candidate: number }[] = [];
const rounds: Record<string, unknown>[] = [];
let revision = 0,
  measured = 0;
for (let day = 0; day < 400 && measured < ROUNDS; day++) {
  if (w.critical) {
    delete w.critical;
    w.revision++;
  }
  let copy: FixtureReadCopy | undefined;
  if (!prepareRound(w, (c) => (copy = c), false)) {
    advanceDays(w, 1, undefined, false);
    continue;
  }
  if (!copy) throw new Error('round without a copy');
  revision++;
  if (revision === 1) {
    // Seed both writers with the first round's snapshot; only later rounds encode patches.
    for (const writer of Object.values(writers))
      if (writer.encode(copy, revision).base !== 0) throw new Error('first encode is a patch');
    rounds.push({ round: 0, day: w.calendar.day, year: w.year, seed: true });
  } else {
    const saved = { base: previousOf(writers.base), candidate: previousOf(writers.candidate) };
    let patch: string | undefined;
    for (let rep = 0; rep < REPS; rep++) {
      const order: ('base' | 'candidate')[] =
        (rep + measured) % 2 ? ['candidate', 'base'] : ['base', 'candidate'];
      const ms: Record<string, number> = {};
      for (const name of order) {
        restore(writers[name], saved[name]);
        gc?.();
        const start = performance.now();
        const out = writers[name].encode(copy, revision);
        ms[name] = performance.now() - start;
        if (out.patch === undefined) throw new Error(`${name} encoded no patch`);
        if (patch === undefined) patch = out.patch;
        else if (out.patch !== patch) throw new Error(`patch texts differ (${name}, rep ${rep})`);
      }
      pairs.push({ round: measured + 1, rep, first: order[0]!, base: ms.base!, candidate: ms.candidate! });
    }
    // The same copy again: an unchanged roster, which both writers must report as unchanged.
    const again = Object.values(writers).map((writer) => writer.encode(copy!, revision + 1).patch);
    if (again[0] !== again[1]) throw new Error('unchanged-roster patch texts differ');
    measured++;
    rounds.push({
      round: measured,
      day: w.calendar.day,
      year: w.year,
      patchChars: patch!.length,
      rosterChanged: rosterChanged(patch),
      unchangedRepeatRosterChanged: rosterChanged(again[0]),
    });
    revision++;
  }
  completeRound(w, undefined);
}
if (measured < ROUNDS) throw new Error(`only ${measured} rounds measured`);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b),
    n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};
/** Distribution-free 95% interval of the median: order statistics k..n+1-k under Binomial(n, 1/2). */
function medianInterval(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b),
    n = s.length;
  let k = 0,
    cdf = 0;
  const choose = (n: number, r: number) => {
    let c = 1;
    for (let i = 1; i <= r; i++) c = (c * (n - r + i)) / i;
    return c;
  };
  while (cdf + choose(n, k) / 2 ** n <= 0.025) cdf += choose(n, k++) / 2 ** n;
  if (k === 0) throw new Error('too few pairs for a 95% interval');
  return { low: s[k - 1]!, high: s[n - k]!, coverage: 1 - 2 * cdf };
}
const ratios = pairs.map((p) => p.candidate / p.base);
const interval = medianInterval(ratios);
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const result = {
  task: 'T940',
  world: file,
  base: '9bfd5e5acbe0e201ce75b34bd0befe698ace7ed7 (base-writer.ts)',
  candidateHead: git('rev-parse', 'HEAD'),
  candidateDirty: git('status', '--porcelain', '--', 'apps/web/src/runtime/fixtureReplica.ts', 'packages/engine/src/fixture-copy.ts') !== '',
  host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, cores: cpus().length, node: process.version, gcBetweenEncodes: !!gc },
  loadavgBefore: loadAtStart,
  loadavgAfter: loadavg(),
  rounds,
  pairs: pairs.length,
  identicalPatchTexts: true,
  identicalRosterChanged: true,
  medianBaseMs: median(pairs.map((p) => p.base)),
  medianCandidateMs: median(pairs.map((p) => p.candidate)),
  medianRatio: median(ratios),
  ratioInterval95: interval,
  kept: interval.high < 1,
  pairRows: pairs.map((p) => ({ ...p, base: Math.round(p.base * 10) / 10, candidate: Math.round(p.candidate * 10) / 10 })),
};
writeFileSync(join(here, 'results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, pairRows: undefined }, null, 2));
