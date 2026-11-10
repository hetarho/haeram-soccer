// CLI: stages a playback and judges it by the staging metrics; identifiers and numbers only.
//   pnpm exec tsx scripts/match-proto/check/report.ts [--seed <s>] [--no-showcase]
//     [--duration <seconds>] [--json <file>] [--strict]
// `--seed` (default `demo`) is the showcase search's base, or with `--no-showcase` the script's
// seed. Prints the produce info, the script statistics of the performed beats, one line per metric
// (`id value limit ok|FAIL`, then its detail) and `passed n/m`. `--json` also writes
// `{ info, stats, metrics }`; `--strict` exits with 1 when a metric fails (default exit 0).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { quotaRequirements } from '../script/showcase.ts';
import { scriptStats, type ScriptStats } from '../script/stats.ts';
import { producePlayback, type ProduceInfo } from '../stage/pipeline.ts';
import { computeMetrics, type Metric } from './metrics.ts';

const TEAM_CODES = ['H', 'A'] as const;

/** The report as text lines: produce info, script statistics, one line per metric, the pass count. */
export function formatReport(
  info: ProduceInfo,
  stats: ScriptStats,
  metrics: readonly Metric[],
): string {
  const lines: string[] = [
    `seed=${info.seed}`,
    `attempts=${info.attempts}`,
    `staged=${info.staged}`,
  ];
  for (const [id, required] of Object.entries(quotaRequirements())) {
    const met = info.check.met.includes(id) ? 1 : 0;
    lines.push(`quota.${id}=${info.check.counts[id] ?? 0}/${required} met=${met}`);
  }
  lines.push(`missing=${info.check.missing.join(',')}`);
  lines.push(`score=${stats.score[0]}-${stats.score[1]}`);
  stats.teams.forEach((team, t) => {
    lines.push(
      `${TEAM_CODES[t]} ${Object.entries(team)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}`,
    );
  });
  for (const m of metrics) {
    const row = [m.id, String(m.value), m.limit, m.pass ? 'ok' : 'FAIL'];
    if (m.detail !== undefined) row.push(m.detail);
    lines.push(row.join(' '));
  }
  lines.push(`passed ${metrics.filter((m) => m.pass).length}/${metrics.length}`);
  return lines.join('\n');
}

function main(): void {
  const { values } = parseArgs({
    options: {
      seed: { type: 'string', default: 'demo' },
      'no-showcase': { type: 'boolean', default: false },
      duration: { type: 'string' },
      json: { type: 'string' },
      strict: { type: 'boolean', default: false },
    },
  });
  const duration = values.duration === undefined ? undefined : Number(values.duration);
  const { playback, info } = producePlayback(values.seed, {
    showcase: !values['no-showcase'],
    ...(duration === undefined ? {} : { duration }),
  });
  const stats = scriptStats(playback.beats);
  const metrics = computeMetrics(playback);
  process.stdout.write(`${formatReport(info, stats, metrics)}\n`);
  if (values.json) writeFileSync(values.json, JSON.stringify({ info, stats, metrics }, null, 2));
  if (values.strict && metrics.some((m) => !m.pass)) process.exitCode = 1;
}

const invoked = process.argv[1] !== undefined && resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) main();
