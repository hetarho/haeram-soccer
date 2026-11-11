// CLI: prints a fitted script as identifiers and numbers only (no prose).
//   pnpm exec tsx scripts/match-proto/fit/print.ts --match s01 [--beats <n>] [--seed <s>]
// `--match` is a settled match id (`s01` … `s10`) or `all`; `--seed` (default `fit`) the writer's
// seed; `--beats` (default 60) how many beats to list. Prints the match id, `mismatches=` (record
// cells the script counts back differently), `problems=` (validator findings), the cost line and
// the first beats, one per line: minute clock side move kind actor>receiver from>to outcome event,
// cells in the acting side's attack frame, `s<i>`/`f<i>` for a shot or foul row, `-` for none.
// With `all` it prints the first three lines of every match.
import { readdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readSettled, type Settled } from '../core/settled.ts';
import type { Beat } from '../core/types.ts';
import { cellAt } from './cells.ts';
import { compareRecord, countScript, fitCost } from './count.ts';
import { validateFitted } from './validate.ts';
import { writeFitted } from './write.ts';

const { values } = parseArgs({
  options: {
    match: { type: 'string', default: 's01' },
    seed: { type: 'string', default: 'fit' },
    beats: { type: 'string', default: '60' },
  },
});

const DIR = new URL('../fixtures/settled/', import.meta.url);
const load = (id: string): Settled =>
  readSettled(JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8')));

const beatLine = (settled: Settled, b: Beat): string => {
  const code = b.team === 0 ? 'H' : 'A';
  const row =
    b.event !== undefined
      ? `e${b.event}`
      : b.shot !== undefined
        ? `s${b.shot}`
        : b.foul !== undefined
          ? `f${b.foul}`
          : '-';
  return [
    Math.floor(b.clock! / 60),
    b.clock!.toFixed(1),
    code,
    b.move,
    b.kind,
    `${b.actor}>${b.receiver ?? b.opponent ?? '-'}`,
    `${cellAt(b.team, b.from)}>${cellAt(b.team, b.to)}`,
    b.outcome,
    row,
  ].join(' ');
};

const head = (settled: Settled): string[] => {
  const script = writeFitted(settled, values.seed);
  const cost = fitCost(script, settled);
  return [
    `match=${settled.id}`,
    `mismatches=${compareRecord(settled, countScript(script, settled)).length} problems=${validateFitted(settled, script).length}`,
    Object.entries(cost)
      .map(([k, v]) => `${k}=${v}`)
      .join(' '),
  ];
};

const lines: string[] = [];
if (values.match === 'all') {
  const ids = readdirSync(DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5))
    .sort();
  for (const id of ids) lines.push(...head(load(id)));
} else {
  const settled = load(values.match);
  lines.push(...head(settled));
  const script = writeFitted(settled, values.seed);
  for (const b of script.beats.slice(0, Number(values.beats))) lines.push(beatLine(settled, b));
}
console.log(lines.join('\n'));
