// Summarizes the detailed and aggregate calibration artifacts of T286's accuracy read (core
// MATCH-23 rows, MATCH-30 counters, MATCH-29 pairings, the MATCH-2 curve, invariants).
const fs = require('fs');
const dir = process.argv[2];
const out = {};
for (const [name, file] of [
  ['detailed', 'detailed-model-calibration.json'],
  ['aggregate', 'aggregate-model-calibration.json'],
]) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
  const core = j.conditions.find((c) => c.condition === 'core:equal-top-tier');
  const count = (rows) =>
    rows.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  const list = (rows, statuses) =>
    rows
      .filter((r) => statuses.includes(r.status))
      .map((r) => `${r.id} ${typeof r.value === 'number' ? +r.value.toFixed(3) : r.value} [${r.band?.join('–')}] ${r.status}`);
  const targets = Object.values(core.targets);
  const adv = Object.values(core.advancedCounters ?? {});
  const tp = j.tacticPairings;
  const tpRows = tp?.rows ?? [];
  const invFailures = j.conditions.reduce(
    (n, c) => n + (c.invariants?.failed?.length ?? 0) + (c.invariants?.fullRecordFailures ?? 0),
    0,
  );
  out[name] = {
    kind: j.kind,
    task: j.task,
    command: j.provenance?.command ?? j.provenance?.parts?.map((p) => p.command),
    date: j.provenance?.date,
    fingerprint: j.provenance?.fingerprint?.sha256,
    files: j.provenance?.fingerprint?.files,
    conditions: j.conditions.length,
    coreMatches: core.matches,
    coreGoals: core.goals,
    match23: { counts: count(targets), notInside: list(targets, ['outside', 'unresolved', 'insufficient']) },
    match30: { counts: count(adv), notInside: list(adv, ['outside', 'unresolved']) },
    match29: {
      matches: tp?.matches,
      counts: tp?.summary ?? count(tpRows),
      notInside: tpRows
        .filter((r) => r.status && r.status !== 'inside')
        .map((r) => `${r.id ?? r.label ?? r.kind} ${r.status}`),
    },
    curve: j.outcomeCurve?.meanAbsoluteError,
    invariantFailures: invFailures,
    seasons: j.seasons ? Object.keys(j.seasons) : undefined,
  };
}
fs.writeFileSync(`${dir}/summary.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
