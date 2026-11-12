/**
 * The picture's measures on one exported fixture (→MATCH-39, T841): writes the fixture's script,
 * stages it whole and prints the 31 picture metrics (`staging/measure.ts`'s `stagingMetrics`,
 * each with its measured limit and pass/fail; a role metric for a role neither side plays reads
 * "n/a") and the fit lines (`fitLines`).
 *
 *   pnpm exec tsx scripts/staging-read.ts --fixture s01 [--json]
 *
 * `--fixture` names `packages/engine/src/script/fixtures/<id>.json` (s01–s10, T826); `--json`
 * prints one JSON object instead of the table.
 */
import { fixtureSides, loadDetail } from '../tests/fixtures/match-script';
import { writeScript } from '../packages/engine/src/script/write';
import { METRIC_IDS, fitLines, stagingMetrics } from '../packages/engine/src/staging/measure';
import { advance, createStaging } from '../packages/engine/src/staging/perform';

function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

const args = process.argv.slice(2);
const id = option(args, '--fixture');
if (!id || !/^[\w-]+$/.test(id))
  throw new Error('usage: staging-read.ts --fixture <id, e.g. s01> [--json]');

const detail = loadDetail(id);
const written = writeScript(detail, 'fit');
if (!('script' in written))
  throw new Error(`${id}: the script fails its count: ${written.problems.join('; ')}`);
const script = written.script;
const sides = fixtureSides(id, detail);
const staged = advance(createStaging(script, sides), Infinity);
if (!staged.done) throw new Error(`${id}: staging did not finish`);
const metrics = stagingMetrics(staged.frames, staged.events, script, sides);
const fit = fitLines(staged.frames, staged.events, script, detail);
const passed = metrics.filter((m) => m.pass).length;

if (args.includes('--json')) {
  console.log(JSON.stringify({ id, passed, total: metrics.length, metrics, fit }));
} else {
  console.log(`${id}: ${passed}/${metrics.length} metrics pass`);
  for (const name of METRIC_IDS) {
    const m = metrics.find((x) => x.id === name);
    console.log(
      m
        ? `${m.pass ? 'pass' : 'FAIL'}  ${m.id}  ${m.value}  ${m.limit}${m.detail ? `  ${m.detail}` : ''}`
        : `n/a   ${name}  (no side plays its role)`,
    );
  }
  console.log('fit lines');
  for (const f of fit)
    console.log(
      `${f.pass === undefined ? '    ' : f.pass ? 'pass' : 'FAIL'}  ${f.id}  ${f.value}${f.detail ? `  ${f.detail}` : ''}`,
    );
}
