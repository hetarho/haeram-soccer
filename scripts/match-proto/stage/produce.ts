// CLI: stages a playback and prints identifiers and numbers only (no prose).
//   pnpm exec tsx scripts/match-proto/stage/produce.ts [--seed <s>] [--no-showcase]
//     [--duration <seconds>] [--out <file>]
// `--seed` (default `demo`) is the showcase search's base, or with `--no-showcase` the script's
// seed. Prints `key=value` lines: the seed used, script attempts, staged candidates, each quota
// with its count, the duration, the score, the event counts by kind and the numbers of `recast`
// and `stretch` events. `--out` also writes the playback as JSON.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { quotaRequirements } from '../script/showcase.ts';
import { producePlayback } from './pipeline.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: 'demo' },
    'no-showcase': { type: 'boolean', default: false },
    duration: { type: 'string' },
    out: { type: 'string' },
  },
});

const duration = values.duration === undefined ? undefined : Number(values.duration);
const { playback, info } = producePlayback(values.seed, {
  showcase: !values['no-showcase'],
  ...(duration === undefined ? {} : { duration }),
});

const lines: string[] = [`seed=${info.seed}`, `attempts=${info.attempts}`, `staged=${info.staged}`];
for (const [id, required] of Object.entries(quotaRequirements())) {
  const met = info.check.met.includes(id) ? 1 : 0;
  lines.push(`quota.${id}=${info.check.counts[id] ?? 0}/${required} met=${met}`);
}
lines.push(`missing=${info.check.missing.join(',')}`);
lines.push(`duration=${playback.duration}`);
lines.push(`score=${playback.score[0]}-${playback.score[1]}`);
lines.push(`beats=${playback.beats.length}`);
lines.push(`frames=${playback.frames.length}`);
const kinds = new Map<string, number>();
for (const e of playback.events) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
for (const [kind, n] of [...kinds].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`event.${kind}=${n}`);
}
lines.push(`recast=${playback.events.filter((e) => e.recast).length}`);
lines.push(`stretch=${playback.events.filter((e) => e.stretch).length}`);
if (values.out) {
  writeFileSync(values.out, JSON.stringify(playback));
  lines.push(`out=${values.out}`);
}
console.log(lines.join('\n'));
