// CLI: prints a script as identifiers and numbers only (no prose).
//   pnpm exec tsx scripts/match-proto/script/print.ts [--seed <s>] [--showcase] [--beats <n>]
// `--seed` (default `demo`) is the seed, or with `--showcase` the base of the showcase search;
// `--beats` (default 40) how many beats to list. Prints the seed used, the attempts, each quota
// with its count, both teams' `TeamStats` and the first beats, one per line.
import { parseArgs } from 'node:util';
import { playerLabel } from '../core/squads.ts';
import type { Beat, Fixture } from '../core/types.ts';
import { generateScript } from './generate.ts';
import { checkQuotas, findShowcaseScript, quotaRequirements, showcaseWindow } from './showcase.ts';
import { scriptStats } from './stats.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: 'demo' },
    showcase: { type: 'boolean', default: false },
    beats: { type: 'string', default: '40' },
  },
});

const found = values.showcase
  ? findShowcaseScript(values.seed)
  : (() => {
      const script = generateScript(values.seed);
      return {
        script,
        seed: values.seed,
        attempts: 1,
        check: checkQuotas(showcaseWindow(script), script.fixture),
      };
    })();
const { script, check } = found;

const beatLine = (fixture: Fixture, b: Beat, t: number): string => {
  const parts = [
    `#${b.index}`,
    `t=${t.toFixed(1)}`,
    playerLabel(fixture, b.actor),
    b.move,
    b.kind,
    b.outcome,
  ];
  if (b.receiver !== undefined) parts.push(`-> ${playerLabel(fixture, b.receiver)}`);
  if (b.opponent !== undefined) parts.push(`x ${playerLabel(fixture, b.opponent)}`);
  if (b.reason !== undefined) parts.push(b.reason);
  return parts.join(' ');
};

const lines: string[] = [`seed=${found.seed}`, `attempts=${found.attempts}`];
for (const [id, required] of Object.entries(quotaRequirements())) {
  const ok = check.met.includes(id) ? 'ok' : 'missing';
  lines.push(`${id} ${check.counts[id]}/${required} ${ok}`);
}
const stats = scriptStats(script.beats);
stats.teams.forEach((team, t) => {
  const code = script.fixture.teams[t].code;
  lines.push(
    `${code} ${Object.entries(team)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );
});
const count = Math.max(0, Number.parseInt(values.beats, 10) || 0);
script.beats
  .slice(0, count)
  .forEach((b, i) => lines.push(beatLine(script.fixture, b, script.times[i])));
process.stdout.write(`${lines.join('\n')}\n`);
