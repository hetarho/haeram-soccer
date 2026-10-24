/**
 * T400 tables over scripts/match-parity.ts --report outputs (one file a run, its `--reference`
 * conditions sharing one detailed reference): a row a run with core's MATCH-28 counts, the three
 * finishing relationships (detailed / aggregate), the draw and away-win differences, the level
 * differences T372 listed, the second-yellow rate ratio, the aggregate's xT, its MATCH-23 core,
 * MATCH-30 and MATCH-29 counts, the curve and the pairing parity; then, with `--conditions`, a row
 * a reference condition with its counts and outcome-rate differences. Differences are aggregate −
 * detailed [95%]; ✗ different, ~ insufficient, no mark equivalent.
 *
 *   pnpm exec tsx t400-table.mts [--out <file.md>] [--conditions] <name>=<run.json> ...
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const o = args.indexOf('--out');
const file = o >= 0 ? args[o + 1] : undefined;
const perCondition = args.includes('--conditions');
const runs = args.filter(
  (a, k) => a !== '--conditions' && (o < 0 || (k !== o && k !== o + 1)),
);
const lines: string[] = [];
const print = (line: string) => (file ? lines.push(line) : console.log(line));
type Metric = {
  id: string;
  status: string;
  difference?: number;
  interval?: [number, number];
  rateRatio?: number;
  rateInterval?: [number, number];
};
type Relationship = {
  pair: [string, string];
  status: string;
  reference: number;
  candidate: number;
};
type Reading = { id: string; status: string; value?: number };
interface Condition {
  condition: string;
  targets: Reading[];
  advancedCounters: Reading[];
  reference?: {
    summary: { metrics: Record<string, number>; relationships: Record<string, number> };
    metrics: Metric[];
    relationships: Relationship[];
  };
}
interface Run {
  conditions: Condition[];
  outcomeCurve?: { meanAbsoluteError?: number | null };
  tacticPairings?: { summary: Record<string, number> };
  tacticPairingParity?: { counts?: Record<string, number> };
}
const mark = (s: string) => (s === 'equivalent' || s === 'inside' ? '' : s === 'different' || s === 'outside' ? '✗' : '~');
const diff = (m: Metric | undefined, d = 2) =>
  m?.difference !== undefined
    ? `${m.difference.toFixed(d)} [${m.interval![0].toFixed(d)}, ${m.interval![1].toFixed(d)}]${mark(m.status)}`
    : 'n/a';
const counts = (s: Record<string, number> | undefined, keys: string[]) =>
  keys.map((k) => s?.[k] ?? 0).join('/');
const load = (spec: string) => {
  const at = spec.indexOf('=');
  return { name: spec.slice(0, at), run: JSON.parse(readFileSync(spec.slice(at + 1), 'utf8')) as Run };
};
const header = [
  'run',
  'core eq/diff/insuf',
  'shots~goals',
  'xG~goals',
  'key passes~assists',
  'draws',
  'away wins',
  'passes',
  'tackles',
  'interceptions',
  'crosses',
  'throw-ins',
  'corners',
  'goal kicks',
  'PPDA',
  'high turnovers',
  'added minutes',
  'second yellows (ratio)',
  'xT',
  'MATCH-23 core',
  'MATCH-30 in/unres/out',
  'MATCH-29 in/insuf/out',
  'curve',
  'pairing parity eq/diff/insuf',
  'different (all reference conditions)',
];
print(`| ${header.join(' | ')} |`);
print(`|${header.map(() => '---').join('|')}|`);
const all = runs.map(load);
for (const { name, run } of all) {
  const core = run.conditions.find((c) => c.condition === 'core:equal-top-tier')!;
  const ref = core.reference;
  const metric = (id: string) => ref?.metrics.find((m) => m.id === id);
  const rel = (a: string, b: string) => {
    const r = ref?.relationships.find((x) => x.pair[0] === a && x.pair[1] === b);
    return r ? `${r.reference.toFixed(3)} / ${r.candidate.toFixed(3)}${mark(r.status)}` : 'n/a';
  };
  const second = metric('incident.secondYellow');
  const xt = core.advancedCounters.find((x) => x.id === 'xtAdded');
  const measured = core.targets.filter((t) => t.status !== 'unmeasured' && t.value !== undefined);
  const adv = (s: string) => core.advancedCounters.filter((x) => x.status === s).length;
  const curve = run.outcomeCurve?.meanAbsoluteError;
  const different = run.conditions.reduce((a, c) => a + (c.reference?.summary.metrics.different ?? 0), 0);
  print(
    `| ${[
      name,
      counts(ref?.summary.metrics, ['equivalent', 'different', 'insufficient']),
      rel('team.shots', 'team.goals'),
      rel('team.xg', 'team.goals'),
      rel('td.keyPasses', 'team.assists'),
      diff(metric('outcome.draw'), 3),
      diff(metric('outcome.awayWin'), 3),
      diff(metric('team.passes'), 1),
      diff(metric('team.tackles'), 2),
      diff(metric('team.interceptions'), 2),
      diff(metric('td.crosses'), 2),
      diff(metric('td.throwIns'), 2),
      diff(metric('td.corners'), 2),
      diff(metric('td.goalKicks'), 2),
      diff(metric('ratio.ppda'), 2),
      diff(metric('td.highTurnovers'), 2),
      diff(metric('outcome.addedMinutes'), 2),
      second?.rateRatio !== undefined
        ? `${second.rateRatio.toFixed(3)} [${second.rateInterval![0].toFixed(3)}, ${second.rateInterval![1].toFixed(3)}]${mark(second.status)}`
        : 'n/a',
      xt?.value !== undefined ? `${xt.value.toFixed(3)}${mark(xt.status)}` : 'n/a',
      `${measured.filter((t) => t.status === 'inside').length}/${measured.length}`,
      `${adv('inside')}/${adv('unresolved')}/${adv('outside')}`,
      counts(run.tacticPairings?.summary, ['inside', 'insufficient', 'outside']),
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
      counts(run.tacticPairingParity?.counts, ['equivalent', 'different', 'insufficient']),
      String(different),
    ].join(' | ')} |`,
  );
}
if (perCondition)
  for (const { name, run } of all) {
    print('');
    print(`**${name}**`);
    print('');
    const h = [
      'condition',
      'eq/diff/insuf/underpowered',
      'relationships eq/diff/insuf',
      'home wins',
      'draws',
      'away wins',
      'goals',
    ];
    print(`| ${h.join(' | ')} |`);
    print(`|${h.map(() => '---').join('|')}|`);
    for (const c of run.conditions) {
      const ref = c.reference;
      if (!ref) continue;
      const metric = (id: string) => ref.metrics.find((m) => m.id === id);
      print(
        `| ${[
          c.condition,
          counts(ref.summary.metrics, ['equivalent', 'different', 'insufficient', 'underpowered']),
          counts(ref.summary.relationships, ['equivalent', 'different', 'insufficient']),
          diff(metric('outcome.homeWin'), 3),
          diff(metric('outcome.draw'), 3),
          diff(metric('outcome.awayWin'), 3),
          diff(metric('outcome.goals'), 2),
        ].join(' | ')} |`,
      );
    }
  }
if (file) writeFileSync(file, `${lines.join('\n')}\n`);
