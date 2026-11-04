// T689 cv04-sit: node core.mjs FILE… — MATCH-28's core condition (equal top-tier sides) of a
// `grid-bands.ts --report --only core` report: MATCH-23 rows by status, the rows outside, and the
// MATCH-30 counters outside, with the invariant check.
import { existsSync, readFileSync } from 'node:fs';

for (const f of process.argv.slice(2)) {
  if (!existsSync(f)) {
    console.log(`${f}: missing`);
    continue;
  }
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const c = d.conditions.find((x) => x.condition.startsWith('core'));
  const by = (rows) => {
    const n = {};
    for (const r of rows) n[r.status] = (n[r.status] ?? 0) + 1;
    return n;
  };
  const fmt = (r) => `${r.id} ${typeof r.value === 'number' ? +r.value.toFixed(3) : r.value}`;
  const out = c.targets.filter((r) => r.status === 'outside');
  const adv = (c.advancedCounters ?? []).filter((r) => r.status === 'outside');
  const name = f.split('/').pop().replace(/\.json$/, '');
  console.log(
    `${name}: ${c.matches} matches, goals ${c.goals.mean.toFixed(2)}; MATCH-23 ${JSON.stringify(by(c.targets))}; ` +
      `outside: ${out.map(fmt).join(', ')}; MATCH-30 outside: ${adv.map(fmt).join(', ')}; ` +
      `invariants failed ${c.invariants.failed.length}, full-record ${c.invariants.fullRecordFailures}`,
  );
}
