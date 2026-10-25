// Assembles docs/benchmarks/full-model-release.json (T286, session v9n4) from the raw artifacts it
// names. handoff/assemble.cjs with its scratch paths replaced by the in-tree logs of
// gates-v9n4.mjs (docs/benchmarks/t286/gates/), the accuracy summary read in place, parity part B
// beside T401's round 64 tactics read (part T moved to T410), the pre-T450 run and the per-decade
// season wall-clock from the stamped progress log.
// usage: node docs/benchmarks/t286/assemble-v9n4.cjs <decision: on|off> [<reason>] [<capacity note>]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [decision, reason = '', capacityNote = ''] = process.argv.slice(2);
if (decision !== 'on' && decision !== 'off') throw new Error('decision: on|off');
const raw = __dirname;
const tree = path.resolve(raw, '../../..');
const logs = `${raw}/gates`;
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rel = (p) => path.relative(tree, p);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const artifact = (p) => ({ path: rel(p), sha256: sha(p), bytes: fs.statSync(p).size });
const jsonl = (p) =>
  fs.existsSync(p)
    ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
const loadSummary = (file) => {
  const rows = jsonl(file);
  if (!rows.length) return null;
  const loads = rows.map((r) => r.load1).sort((a, b) => a - b);
  const others = new Map();
  for (const r of rows)
    for (const b of r.busy)
      if (!/^node$|tsx|pnpm/.test(b.comm)) others.set(b.comm, Math.max(others.get(b.comm) ?? 0, b.cpu));
  const free = rows.map((r) => r.freeGiB).filter((v) => typeof v === 'number');
  return {
    file: rel(file),
    from: rows[0].at,
    to: rows.at(-1).at,
    samples: rows.length,
    load1Median: +loads[Math.floor(loads.length / 2)].toFixed(2),
    load1Max: +loads.at(-1).toFixed(2),
    freeGiBMin: free.length ? Math.min(...free) : null,
    otherProcessesAbove20PercentCpu: Object.fromEntries([...others].sort((a, b) => b[1] - a[1]).slice(0, 6)),
  };
};
const steps = jsonl(`${logs}/steps.jsonl`);
const step = (name) => {
  const start = steps.findLast((s) => s.step === name && s.event === 'start');
  if (!start) return null;
  const end = steps.find((s) => s.step === name && s.event === 'end' && s.at >= start.at);
  return { command: start.command, started: start.at, ended: end?.at, seconds: end?.seconds, exit: end?.status };
};
/** Wall-clock seconds a season per decade from the stamped `<profile>: n/100 seasons` lines. */
function decades(log) {
  if (!fs.existsSync(log)) return null;
  const marks = [];
  for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
    const m = /^(\S+) (baseline|active-management): (\d+)\/(\d+) seasons/.exec(line);
    if (m) marks.push({ at: Date.parse(m[1]), profile: m[2], n: +m[3] });
  }
  const out = {};
  marks.forEach((m, i) => {
    const prev = marks[i - 1];
    const from = prev && (prev.profile === m.profile ? prev.n : 0) === m.n - 10 ? prev : null;
    (out[m.profile] ??= {})[`${m.n - 9}-${m.n}`] = from ? +((m.at - from.at) / 10000).toFixed(2) : null;
  });
  return {
    note: 'wall clock between the progress stamps divided by ten; 91–100 includes the final-round codec, the first decade of active-management the profile switch, baseline 1–10 has no earlier stamp',
    secondsPerSeason: out,
  };
}

const candidatePath = `${raw}/candidate-100.json`;
const preT450Path = `${raw}/candidate-100-f5fc5c09.json`;
const baselinePath = `${raw}/baseline-9f69553-100.json`;
const storagePath = `${tree}/docs/benchmarks/T286-full-model-storage.json`;
const firstPlayPath = `${tree}/docs/benchmarks/T010-first-play.json`;
const detailedPath = `${tree}/docs/benchmarks/detailed-model-calibration.json`;
const aggregatePath = `${tree}/docs/benchmarks/aggregate-model-calibration.json`;
const partBPath = `${raw}/parity-r71-partB.json`;
const r64Path = `${tree}/docs/benchmarks/match-parity.json`;
const t450Path = `${tree}/docs/benchmarks/t450/throughput.json`;
const candidate = read(candidatePath);
const preT450 = read(preT450Path);
const baseline = read(baselinePath);
const storage = fs.existsSync(storagePath) && decision === 'on' ? read(storagePath) : null;
const firstPlay = fs.existsSync(firstPlayPath) ? read(firstPlayPath) : null;
const t450 = read(t450Path);
const comp = (r, id) => {
  const c = r.performance.components.find((x) => x.id === id);
  return c ? { medianMs: +c.medianMs.toFixed(4), p90Ms: +c.p90Ms.toFixed(4), samples: c.samples, maxMs: +c.maxMs.toFixed(3) } : null;
};

// ---- accuracy (handoff/acc-summary.cjs, read in place) ----
function accuracySummary(file) {
  const j = read(file);
  const core = j.conditions.find((c) => c.condition === 'core:equal-top-tier');
  const count = (rows) => rows.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  const list = (rows, statuses) =>
    rows
      .filter((r) => statuses.includes(r.status))
      .map((r) => `${r.id} ${typeof r.value === 'number' ? +r.value.toFixed(3) : r.value} [${r.band?.join('–')}] ${r.status}`);
  const targets = Object.values(core.targets);
  const adv = Object.values(core.advancedCounters ?? {});
  const tp = j.tacticPairings;
  const tpRows = tp?.rows ?? [];
  return {
    report: rel(file),
    kind: j.kind,
    task: j.task,
    command: j.provenance?.command ?? j.provenance?.parts?.map((p) => p.command),
    date: j.provenance?.date,
    gitHead: j.provenance?.gitHead ?? j.provenance?.source?.gitHead,
    fingerprint: j.provenance?.fingerprint?.sha256 ?? j.provenance?.source?.fingerprint?.sha256,
    conditions: j.conditions.length,
    coreMatches: core.matches,
    coreGoals: core.goals,
    match23: { counts: count(targets), notInside: list(targets, ['outside', 'unresolved', 'insufficient']) },
    match30: { counts: count(adv), notInside: list(adv, ['outside', 'unresolved']) },
    match29: {
      matches: tp?.matches,
      counts: tp?.summary ?? count(tpRows),
      notInside: tpRows.filter((r) => r.status && r.status !== 'inside').map((r) => `${r.id ?? r.label ?? r.kind} ${r.status}`),
    },
    curve: j.outcomeCurve?.meanAbsoluteError,
    invariantFailures: j.conditions.reduce(
      (n, c) => n + (c.invariants?.failed?.length ?? 0) + (c.invariants?.fullRecordFailures ?? 0),
      0,
    ),
  };
}
function parityRows(file, filter) {
  const j = read(file);
  const rows = j.conditions.filter((c) => filter(c.condition)).map((c) => ({
    condition: c.condition,
    matches: c.matches,
    metrics: c.reference.summary.metrics,
    relationships: c.reference.summary.relationships,
    pilotSize: c.reference.pilotValidationSize.size,
    belowPilotSize: c.reference.pilotValidationSize.size > c.matches,
    invariantFailures: c.reference.invariantFailures,
    differentMetrics: c.reference.metrics.filter((m) => m.status === 'different').map((m) => m.id),
    insufficientMetrics: c.reference.metrics.filter((m) => m.status === 'insufficient').map((m) => m.id),
    differentRelationships: c.reference.relationships.filter((r) => r.status === 'different').map((r) => r.pair.join(' ~ ')),
  }));
  const sum = (k) => rows.reduce((n, r) => n + (r.metrics[k] ?? 0), 0);
  return {
    artifact: rel(file),
    date: j.provenance?.date,
    gitHead: j.provenance?.gitHead,
    fingerprint: j.provenance?.fingerprint?.sha256,
    totals: { matches: rows.reduce((n, r) => n + r.matches, 0), equivalent: sum('equivalent'), different: sum('different'), insufficient: sum('insufficient'), underpowered: sum('underpowered') },
    conditions: rows,
  };
}

const capacity = candidate.seasons.map((s) => ({
  profile: s.profile,
  seasons: s.seasons,
  at: s.checkpointAt,
  checkpointBytes: s.checkpointBytes,
  limitBytes: candidate.configs.performance.storage.checkpointBytes,
  within: s.withinCheckpointLimit,
}));
const gateFigures = (r) => Object.fromEntries(r.releaseGates.gates.map((g) => [g.id, { medianMs: g.medianMs, budgetMs: g.budgetMs, status: g.status }]));

const report = {
  kind: 'full-model-release',
  task: 'T286',
  date: new Date().toISOString(),
  decision: {
    matchModelRelease: { revision: candidate.candidate.matchModelRevision, enabled: decision === 'on' },
    activation: decision,
    reason,
    accuracy: 'reported beside the release, not a gate (MATCH-28 r23, ARCH-31 r20)',
  },
  machine: candidate.provenance.machine,
  toolchain: candidate.provenance.toolchain,
  referenceMachine: candidate.configs.performance.release.referenceMachine,
  sources: {
    release: {
      gitHead: candidate.provenance.source.gitHead,
      dirty: candidate.provenance.source.gitDirty,
      runnerFingerprint: candidate.provenance.source.fingerprint.sha256,
      storageFingerprint: storage?.sourceFingerprint?.sha256 ?? null,
      firstPlayFingerprint: firstPlay?.sourceFingerprint?.sha256 ?? null,
      note: 'T286 at f5fc5c09 merged with work/v9n4-release (T437, T446, T447, T450: football bit-identical, seasons faster) and the full-record check run once at settlement with lazy labels (same outcome). The throughput runs measured cb64026c/e4de4490 (runner fingerprint 5be52cf06612); the final source differs from it only by scripts/first-play.mjs (the browser benchmark following the streamlined home), on which the storage and browser benchmarks ran',
    },
    baseline: {
      content: '9f695530d740807c6fd2b0cded4e86b5d16c8b7f (git archive into a scratch repository, run 261025)',
      localHead: baseline.provenance.source.gitHead,
      fingerprint: baseline.provenance.source.fingerprint.sha256,
      sameAsT273: baseline.provenance.source.fingerprint.sha256.startsWith('64c076338c8a'),
    },
    accuracy: {
      content: 'f1400a8b (git archive, run 261025): T450 and the record-check change keep every digest and world byte, so the read stands for the final football',
    },
  },
  gates: {
    throughput: {
      budgets: candidate.configs.performance.release,
      results: candidate.releaseGates,
      releaseEvidence: candidate.releaseEvidence,
      runnerLoad: candidate.load,
      samplerLoad: loadSummary(`${logs}/candidate.load.jsonl`),
      run: step('candidate'),
      seasonDecades: decades(`${logs}/candidate.log`),
      components: Object.fromEntries(
        ['fixture.candidate', 'candidate.preparation', 'candidate.generation', 'candidate.attribution', 'candidate.record', 'fixture.own-candidate', 'settlement.candidate', 'season.baseline', 'season.active-management', 'codec.encode', 'codec.decode', 'fixture.summary', 'fixture.grid'].map((id) => [id, comp(candidate, id)]),
      ),
      checks: candidate.checks,
      memory: candidate.memory,
      report: rel(candidatePath),
      firstRun: {
        report: rel(`${raw}/candidate-100-cb64026c-1.json`),
        gates: gateFigures(read(`${raw}/candidate-100-cb64026c-1.json`)),
        reasons: read(`${raw}/candidate-100-cb64026c-1.json`).releaseGates.reasons,
        load: read(`${raw}/candidate-100-cb64026c-1.json`).load,
        samplerLoad: loadSummary(`${logs}/candidate-1.load.jsonl`),
        seasonDecades: decades(`${logs}/candidate-1.log`),
        note: 'another session\'s batch (vitest, then Chromium e2e) ran beside it from 16:04Z',
      },
      preT450: {
        report: rel(preT450Path),
        gitHead: preT450.provenance.source.gitHead,
        fingerprint: preT450.provenance.source.fingerprint.sha256,
        gates: gateFigures(preT450),
        passed: preT450.releaseGates.passed,
        reasons: preT450.releaseGates.reasons,
        load: preT450.load,
      },
      t450: { report: rel(t450Path), remainingHotSpots: t450.remainingHotSpots },
    },
    capacity: {
      limit: candidate.configs.performance.storage,
      centuryFinalRound: capacity,
      passed: storage ? capacity.every((c) => c.within) && storage.passed : null,
      storageBenchmark: storage
        ? {
            report: rel(storagePath),
            passed: storage.passed,
            worst: storage.worstCheckpoint && { label: storage.worstCheckpoint.label, checkpointBytes: storage.worstCheckpoint.checkpointBytes, streams: storage.worstCheckpoint.streams?.slice(0, 6) },
            checkpoints: storage.measurements?.map((m) => ({ label: m.label, checkpointBytes: m.checkpointBytes, totalBytes: m.totalBytes, container: m.container, passed: m.passed })),
            run: step('storage'),
            firstRun: { log: 'docs/benchmarks/t286/gates/storage-1.log', samplerLoad: loadSummary(`${logs}/storage-1.load.jsonl`), fingerprint: '2012e0b33c36e7b98d84adb045e853a1aaa98651a0c3f19f3006d4f1a043f04d', note: 'same sizes and verdicts before the first-play fix; re-run so the browser benchmark reads one fingerprint' },
            samplerLoad: loadSummary(`${logs}/storage.load.jsonl`),
            elapsedMs: storage.elapsedMs,
            losslessRoundtrip: storage.losslessRoundtrip,
            resumedSeasonReplay: storage.resumedSeasonReplay,
            completeModelFromFounding: storage.completeModelFromFounding,
          }
        : `not run: ${capacityNote}`,
    },
    continuity: {
      unit: ['tests/fixtures/full-model-workload.test.ts (writer load = writerActivation; complete aggregates from founding and mid-season)', 'packages/engine/src/match-model.test.ts', 'packages/engine/src/season.settle.test.ts (activated settlement, the one record check at settlement)', 'apps/web/src/runtime/host.test.ts (prospective activation)', 'apps/web/src/adapters/persistence.test.ts'],
      storageActivation: storage?.activation ?? 'not run',
      browserJourney: { spec: 'tests/e2e/full-model-continuity.spec.ts', status: 'written; run by the pre-push batch (Chromium) and CI, not by this task (ARCH-30)' },
    },
    browser: firstPlay
      ? {
          report: rel(firstPlayPath),
          releasePassed: firstPlay.releasePassed,
          arch28Passed: firstPlay.passed,
          entry: firstPlay.entry,
          foundingCommandMs: [firstPlay.desktop?.foundingCommandMs, firstPlay.mobile?.foundingCommandMs],
          coldLoadAndFoundMs: [firstPlay.desktop?.coldLoadAndFoundMs, firstPlay.mobile?.coldLoadAndFoundMs],
          centuryLoadMs: firstPlay.centuryLoadMs,
          pointerToSecondFrameP95Ms: [firstPlay.pointerToSecondFrameP95Ms, firstPlay.mobile?.pointerToSecondFrameP95Ms],
          animationFps: [firstPlay.desktop?.animationFps, firstPlay.mobile?.animationFps],
          buildGzipBytes: firstPlay.buildGzipBytes,
          firstPlayPageTargetTransferBytes: [firstPlay.firstPlayPageTargetTransferBytes, firstPlay.mobileFirstPlayPageTargetTransferBytes],
          browser: firstPlay.browser,
          pageErrors: firstPlay.pageErrors,
          date: firstPlay.date,
          gitHead: firstPlay.gitHead ?? firstPlay.source?.gitHead,
          check: fs.existsSync(`${raw}/first-play-check.json`) ? { report: rel(`${raw}/first-play-check.json`), note: 'the fixed flow run once from first-play-check.mjs against the first storage run (entry baseline still f1400a8b there)', releasePassed: read(`${raw}/first-play-check.json`).releasePassed } : null,
        }
      : 'not run',
  },
  context: {
    pairedRatiosToBaselineSummaryPath: candidate.pairedComparison,
    baseline: {
      report: rel(baselinePath),
      components: Object.fromEntries(['fixture.summary', 'fixture.grid', 'season.baseline', 'season.active-management', 'codec.encode'].map((id) => [id, comp(baseline, id)])),
      seasons: baseline.seasons,
    },
  },
  accuracy: {
    gated: false,
    validationRound: 71,
    detailed: accuracySummary(detailedPath),
    aggregate: accuracySummary(aggregatePath),
    parity: {
      partB: { ...parityRows(partBPath, () => true), round: 71, note: 'the ten non-tactics conditions at their re-measured pilot sizes, on f1400a8b content' },
      tactics: {
        ...parityRows(r64Path, (c) => c.startsWith('tactics:')),
        round: 64,
        note: "T401's read on 5abb70a2 of the sixteen tactics conditions; part T of round 71 moved to T410 (owner, v9n4). The football changed since: T426 in-stride carry, T431 tendencies and freedom, T437 scoring recalibration, T441 cut-outs on the path, T442 lane shutting, T443 box zones and goal-side defence, T444 deliveries into the runners' zones, T445 bodies before the keeper and second balls, T446 lofted deliveries and lane reads, T447 box zone depth and the keeper on lofted balls (T422 and T436 change presentation and material only), so these rows are the latest read, not the released football's",
      },
      t401Round64NonTactics: parityRows(r64Path, (c) => !c.startsWith('tactics:')).totals,
    },
  },
  pending: [
    'the pre-push batch (Chromium) and CI on the final source, with tests/e2e/full-model-continuity.spec.ts and the other changed journeys (ARCH-30; the coordinator runs it)',
    'parity part T: the sixteen tactics conditions at validation round 71 (moved to T410 by the owner)',
    'the first-play entry above ARCH-28 (pre-existing; a first-play entry task)',
  ],
  artifacts: [candidatePath, preT450Path, baselinePath, storage ? storagePath : null, firstPlayPath, detailedPath, aggregatePath, partBPath, r64Path, t450Path]
    .filter((p) => p && fs.existsSync(p))
    .map((p) => artifact(p)),
};
fs.writeFileSync(`${tree}/docs/benchmarks/full-model-release.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ gates: gateFigures(candidate), passed: candidate.releaseGates.passed, reasons: candidate.releaseGates.reasons, decades: report.gates.throughput.seasonDecades?.secondsPerSeason, capacity: report.gates.capacity.passed, browser: firstPlay?.releasePassed }, null, 1));
