// Assembles artifacts/benchmarks/full-model-release.json (T286) from the raw artifacts it names.
// usage: node assemble.cjs <worktree> <scratch t286 dir> <decision: on|off> [<reason>]
const fs = require('fs');
const crypto = require('crypto');
const [tree, scratch, decision, reason = ''] = process.argv.slice(2);
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rel = (p) => p.slice(tree.length + 1);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const artifact = (p, extra = {}) => ({ path: rel(p), sha256: sha(p), bytes: fs.statSync(p).size, ...extra });
const jsonl = (p) =>
  fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const loadSummary = (name) => {
  const rows = jsonl(`${scratch}/gates/${name}.load.jsonl`);
  if (!rows.length) return null;
  const loads = rows.map((r) => r.load1).sort((a, b) => a - b);
  const others = new Map();
  for (const r of rows)
    for (const b of r.busy)
      if (!/^node$|tsx|pnpm/.test(b.comm)) others.set(b.comm, Math.max(others.get(b.comm) ?? 0, b.cpu));
  return {
    from: rows[0].at,
    to: rows.at(-1).at,
    samples: rows.length,
    load1Median: +loads[Math.floor(loads.length / 2)].toFixed(2),
    load1Max: +loads.at(-1).toFixed(2),
    otherProcessesAbove20PercentCpu: Object.fromEntries([...others].sort((a, b) => b[1] - a[1]).slice(0, 6)),
  };
};
const steps = jsonl(`${scratch}/gates/steps.jsonl`);
const step = (name) => {
  const start = steps.find((s) => s.step === name && s.event === 'start');
  const end = steps.find((s) => s.step === name && s.event === 'end');
  return start ? { command: start.command, started: start.at, ended: end?.at, seconds: end?.seconds, exit: end?.status } : null;
};

const raw = `${tree}/artifacts/benchmarks/t286`;
const candidatePath = `${raw}/candidate-100.json`;
const baselinePath = `${raw}/baseline-9f69553-100.json`;
const storagePath = `${tree}/artifacts/benchmarks/T286-full-model-storage.json`;
const firstPlayPath = `${tree}/artifacts/benchmarks/T010-first-play.json`;
const candidate = read(candidatePath);
const baseline = read(baselinePath);
const storage = fs.existsSync(storagePath) ? read(storagePath) : null;
const firstPlay = fs.existsSync(firstPlayPath) ? read(firstPlayPath) : null;
const med = (r, id) => r.performance.components.find((c) => c.id === id);
const comp = (r, id) => {
  const c = med(r, id);
  return c ? { medianMs: +c.medianMs.toFixed(4), p90Ms: +c.p90Ms.toFixed(4), samples: c.samples, maxMs: +c.maxMs.toFixed(3) } : null;
};
const accuracy = read(`${scratch}/acc-out/summary.json`);
const parityPath = `${tree}/artifacts/benchmarks/match-parity.json`;
const parity = read(parityPath);
const parityRows = parity.conditions.map((c) => ({
  condition: c.condition,
  matches: c.matches,
  metrics: c.reference.summary.metrics,
  relationships: c.reference.summary.relationships,
  pilotSize: c.reference.pilotValidationSize.size,
  belowPilotSize: c.reference.pilotValidationSize.size > c.matches,
  invariantFailures: c.reference.invariantFailures,
}));
const sum = (k) => parityRows.reduce((n, r) => n + (r.metrics[k] ?? 0), 0);

const capacity = candidate.seasons.map((s) => ({
  profile: s.profile,
  seasons: s.seasons,
  at: s.checkpointAt,
  checkpointBytes: s.checkpointBytes,
  limitBytes: candidate.configs.performance.storage.checkpointBytes,
  within: s.withinCheckpointLimit,
}));
const storageCheckpoints = storage
  ? storage.measurements.map((m) => ({ label: m.label, checkpointBytes: m.checkpointBytes, totalBytes: m.totalBytes, container: m.container, passed: m.passed }))
  : null;

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
    release: { gitHead: candidate.provenance.source.gitHead, dirty: candidate.provenance.source.gitDirty, runnerFingerprint: candidate.provenance.source.fingerprint.sha256, storageFingerprint: storage?.sourceFingerprint?.sha256 ?? null, firstPlayFingerprint: firstPlay?.sourceFingerprint?.sha256 ?? null },
    baseline: { content: '9f695530d740807c6fd2b0cded4e86b5d16c8b7f (git archive into the session scratchpad, committed there as a local repository)', localHead: baseline.provenance.source.gitHead, fingerprint: baseline.provenance.source.fingerprint.sha256, sameAsT273: baseline.provenance.source.fingerprint.sha256.startsWith('64c076338c8a') },
    accuracy: { content: 'f1400a8b (git archive into the session scratchpad); the release commit changes no football: only the switch, measurement scripts, tests and fixtures', detailedFingerprint: accuracy.detailed.fingerprint, aggregateAndParityFingerprint: accuracy.aggregate.fingerprint },
  },
  gates: {
    throughput: {
      budgets: candidate.configs.performance.release,
      results: candidate.releaseGates,
      releaseEvidence: candidate.releaseEvidence,
      runnerLoad: candidate.load,
      samplerLoad: loadSummary('candidate'),
      run: step('candidate'),
      components: Object.fromEntries(
        ['fixture.candidate', 'candidate.preparation', 'candidate.generation', 'candidate.attribution', 'candidate.record', 'fixture.own-candidate', 'settlement.candidate', 'season.baseline', 'season.active-management', 'codec.encode', 'codec.decode', 'fixture.summary', 'fixture.grid'].map((id) => [id, comp(candidate, id)]),
      ),
      checks: candidate.checks,
      memory: candidate.memory,
      report: rel(candidatePath),
    },
    capacity: {
      limit: candidate.configs.performance.storage,
      centuryFinalRound: capacity,
      passed: capacity.every((c) => c.within) && (storage ? storage.passed : false),
      storageBenchmark: storage
        ? { report: rel(storagePath), passed: storage.passed, worst: storage.worstCheckpoint && { label: storage.worstCheckpoint.label, checkpointBytes: storage.worstCheckpoint.checkpointBytes, streams: storage.worstCheckpoint.streams.slice(0, 6) }, checkpoints: storageCheckpoints, run: storage.run, elapsedMs: storage.elapsedMs, losslessRoundtrip: storage.losslessRoundtrip, resumedSeasonReplay: storage.resumedSeasonReplay, completeModelFromFounding: storage.completeModelFromFounding }
        : 'not run',
    },
    continuity: {
      unit: ['tests/fixtures/full-model-workload.test.ts (writer load = writerActivation; complete aggregates from founding and mid-season)', 'packages/engine/src/match-model.test.ts', 'apps/web/src/runtime/host.test.ts (prospective activation)', 'apps/web/src/adapters/persistence.test.ts'],
      storageActivation: storage?.activation ?? 'not run',
      centuryModel: storage ? storage.workloads.map((w) => ({ variant: w.variant, matchModel: w.matchModel })) : 'not run',
      browserJourney: { spec: 'tests/e2e/full-model-continuity.spec.ts', status: 'written; run by the pre-push batch (Chromium) and CI, not by this task (ARCH-30)' },
    },
    browser: firstPlay
      ? {
          report: rel(firstPlayPath),
          releasePassed: firstPlay.releasePassed,
          arch28Passed: firstPlay.passed,
          entry: firstPlay.entry,
          foundingCommandMs: [firstPlay.desktop.foundingCommandMs, firstPlay.mobile.foundingCommandMs],
          coldLoadAndFoundMs: [firstPlay.desktop.coldLoadAndFoundMs, firstPlay.mobile.coldLoadAndFoundMs],
          centuryLoadMs: firstPlay.centuryLoadMs,
          pointerToSecondFrameP95Ms: [firstPlay.pointerToSecondFrameP95Ms, firstPlay.mobile.pointerToSecondFrameP95Ms],
          animationFps: [firstPlay.desktop.animationFps, firstPlay.mobile.animationFps],
          buildGzipBytes: firstPlay.buildGzipBytes,
          firstPlayPageTargetTransferBytes: [firstPlay.firstPlayPageTargetTransferBytes, firstPlay.mobileFirstPlayPageTargetTransferBytes],
          browser: firstPlay.browser,
          pageErrors: firstPlay.pageErrors,
          date: firstPlay.date,
        }
      : 'not run',
  },
  context: {
    pairedRatiosToBaselineSummaryPath: candidate.pairedComparison,
    baseline: {
      report: rel(baselinePath),
      run: step('baseline'),
      samplerLoad: loadSummary('baseline'),
      components: Object.fromEntries(['fixture.summary', 'fixture.grid', 'season.baseline', 'season.active-management', 'codec.encode'].map((id) => [id, comp(baseline, id)])),
      seasons: baseline.seasons,
    },
  },
  accuracy: {
    gated: false,
    validationRound: 71,
    detailed: accuracy.detailed,
    aggregate: accuracy.aggregate,
    parity: {
      artifact: rel(parityPath),
      parts: parity.provenance.parts,
      totals: { matches: parityRows.reduce((n, r) => n + r.matches, 0), equivalent: sum('equivalent'), different: sum('different'), insufficient: sum('insufficient'), underpowered: sum('underpowered') },
      conditions: parityRows,
      tacticPairingParity: parity.tacticPairingParity?.summary ?? null,
    },
  },
  pending: [],
  artifacts: [candidatePath, baselinePath, storagePath, firstPlayPath, `${tree}/artifacts/benchmarks/detailed-model-calibration.json`, `${tree}/artifacts/benchmarks/aggregate-model-calibration.json`, parityPath]
    .filter((p) => fs.existsSync(p))
    .map((p) => artifact(p)),
};
fs.writeFileSync(`${tree}/artifacts/benchmarks/full-model-release.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ gates: report.gates.throughput.results, capacity: report.gates.capacity.centuryFinalRound, browser: report.gates.browser.releasePassed }, null, 1));
