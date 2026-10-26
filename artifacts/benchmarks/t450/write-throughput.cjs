// Writes artifacts/benchmarks/t450/throughput.json from the assembled figures (.tmp/t450/figures.json,
// assemble-throughput.cjs), the first after run (.tmp/t450/gates/run1), the cut shares
// (shares.cjs on the late profiles) and the reference figures quoted from T286.
// usage: node artifacts/benchmarks/t450/write-throughput.cjs
const fs = require('fs');
const os = require('os');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const fig = read('.tmp/t450/figures.json');
const shares = read('.tmp/t450/shares-late.json');
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
function timesOf(file) {
  const byWorld = {};
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.startsWith('{')) continue;
    const r = JSON.parse(l);
    if (r.warmup) continue;
    const k = r.file.split('/').slice(-2).join('/');
    (byWorld[k] ??= { season: r.year, ms: [], digest: r.digest }).ms.push(r.ms);
  }
  for (const v of Object.values(byWorld)) v.medianMs = median(v.ms);
  return byWorld;
}
const pct = (before, after) => +(((after - before) / before) * 100).toFixed(1);
const worldRow = (key, label) => {
  const b = fig.before.seasons.worlds[key] ?? fig.before.active.worlds[key];
  const a = fig.after.seasons.worlds[key] ?? fig.after.active.worlds[key];
  return {
    world: key,
    season: label,
    beforeMs: b.medianMs,
    afterMs: a.medianMs,
    change: `${pct(b.medianMs, a.medianMs)}%`,
    digestBefore: b.digest,
    digestAfter: a.digest,
    sameDigest: b.digest === a.digest,
  };
};
const fx = (side) => fig[side].fixture.report;
const series = (side) => {
  const f = fig[side].series.figures;
  const sorted = [...f.ms].sort((x, y) => x - y);
  return {
    run: fig[side].series.run,
    seasons: f.seasons,
    medianMs: f.medianMs,
    minMs: f.minMs,
    maxMs: f.maxMs,
    p90Ms: sorted[Math.floor(0.9 * sorted.length) - 1],
    over15sSeasons: f.ms.filter((m) => m > 15000).length,
    medianOfTenSeasons: f.byTen,
    ms: f.ms,
  };
};
const out = {
  task: 'T450',
  budget:
    "ARCH-31 r19: season engine time ≤ 15 s median for both century profiles on the reference machine (and the NPC fixture ≤ 1 ms median); T286's `--seasons 100` run decides the gate",
  machine: {
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    platform: os.platform(),
    arch: os.arch(),
    node: process.version,
    note: 'the ARCH-31 reference machine; other sessions were idle, load1 2–5 during the runs is mostly the measured process itself (V8 GC and compiler threads)',
  },
  commits: {
    before: '4a8c03dc (group head work/v9n4-release; the engine checked out from it into this worktree for every before run)',
    after: '3ab25c44 (engine source as at 6b2d5e55, the last engine change; 0b50961f for the after series)',
  },
  method: [
    'Worlds: `pnpm exec tsx artifacts/benchmarks/t450/build-worlds.mts 80 .tmp/t450/before 0,1,5,30,60,80` (baseline profile, seed release-century-baseline) and `… 50 .tmp/t450/active 0,30,50 active-management` (seed release-century-active-management), the candidate model from founding as scripts/match-model-baseline.ts founds them; season-N.world.json is the world at the start of season N+1.',
    'Seasons: `pnpm exec tsx artifacts/benchmarks/t450/time-seasons.mts 3 <worlds…>` plays one more season of each kept world from a fresh parse, three times round-robin after one untimed warm-up, and prints a sha256 of the world after it.',
    'Series: `pnpm exec tsx artifacts/benchmarks/t450/build-worlds.mts 80 .tmp/t450/series-<side> 30,60,80` plays 80 consecutive baseline seasons in one process, as the benchmark does, and keeps the worlds at seasons 30, 60 and 80.',
    'Fixture: `pnpm exec tsx scripts/match-model-baseline.ts --model candidate --seasons 1 --pilot 1 --out .tmp/t450/mmb-<side>.json` (200 timed fixtures × 3 repetitions after 10 warm-up).',
    'Every step ran alone through `node artifacts/benchmarks/t450/measure.mjs <side> <step…>`, which samples load1 and the busiest other processes every 30 s.',
  ],
  reference: {
    source: "T286's candidate 100-season run (relayed by the coordinator; its report stays in T286's worktree)",
    command: 'scripts/match-model-baseline.ts --model candidate --release --seasons 100 on f5fc5c09 (the group football plus T286 switch on), fingerprint 7f1dbca8df8d',
    npcFixtureMedianMs: 0.723,
    seasonMedianMs: { baseline: 18561, 'active-management': 20230 },
    quiet: false,
    load1: { median: 2.46, max: 8.21 },
  },
  seasons: {
    run: { before: fig.before.seasons.run, after: fig.after.seasons.run },
    baseline: [
      worldRow('before/season-1.world.json', '1952 (early: season 2, history 1)'),
      worldRow('before/season-30.world.json', '1981 (season 31)'),
      worldRow('before/season-60.world.json', '2011 (late: season 61)'),
      worldRow('before/season-80.world.json', '2031 (late: season 81)'),
    ],
    activeManagement: {
      run: { before: fig.before.active.run, after: fig.after.active.run },
      worlds: [
        worldRow('active/season-30.world.json', '1981 (season 31)'),
        worldRow('active/season-50.world.json', '2001 (season 51, about the 100-season median)'),
      ],
      note: 'one season of the kept world without the owner actions of `manage` (a small share of a season); worlds built on 9547e854 and checked to the same digests on 4a8c03dc',
    },
    afterFirstRun: {
      note: 'the same after command 33 min earlier on 0b50961f (same engine source), load1 median 3.7',
      baseline: timesOf('.tmp/t450/gates/run1/after-seasons.log'),
      activeManagement: timesOf('.tmp/t450/gates/run1/after-active.log'),
    },
    earlierBefore: {
      note: 'the same before command at 12:38Z, right after T286 finished (load1 about 2): s1 14.5, s30 15.6, s60 19.5, s80 20.5 s (medians of 3)',
    },
  },
  series: {
    note: 'Medians of 80 consecutive seasons in one process. With 20 more seasons all slower than these, a 100-season median is the mean of the 50th and 51st fastest of the 80: before about 20.2 s, after about 14.4 s.',
    before: series('before'),
    after: series('after'),
    keptWorldsIdentical: fig.keptWorlds,
  },
  fixture: {
    before: { run: fig.before.fixture.run, ...fx('before') },
    after: { run: fig.after.fixture.run, ...fx('after') },
    afterFirstRun: (() => {
      const j = read('.tmp/t450/gates/run1/mmb-after.json');
      const c = Object.fromEntries(j.performance.components.map((x) => [x.id, x]));
      return {
        'fixture.candidate': c['fixture.candidate'].medianMs,
        'fixture.own-candidate': c['fixture.own-candidate'].medianMs,
      };
    })(),
  },
  cuts: {
    note: 'Each cut is a cache, an index, an early exit or an allocation removed; the same draws in the same order. Shares of the late season saving from the before and after profiles of season 61 (profile-before.json, profile-after.json; shares.cjs): inclusive time of the functions each cut changed. They overlap a little and the profiles carry noise (unattributed below).',
    profiledSeason61: {
      beforeMs: shares.seasonBeforeMs,
      afterMs: shares.seasonAfterMs,
      savedMs: shares.savedMs,
      unattributedMs: shares.unattributedMs,
    },
    list: shares.cuts,
  },
  remainingHotSpots: {
    note: 'Inclusive ms of the after profile of season 61 (14.7 s profiled): where a later cut would have to go.',
    aggregateKernel:
      'simulateAggregate 8409 (about 10.7k fixtures): attributePlayerFacts 4045 (role weights, shares, multinomial and within splits, line credits), settleParticipation 3284 (generateTeamFacts 2483, planParticipation 736, deriveTeamFacts with assertLedger 623). The draws themselves (binomial, multinomialInto) and their float order are fixed, so what is left is per-call overhead.',
    gridOwnMatches:
      'playGrid 4793 (about 135 ms an own match): updateIntentions 1402 with planCoordination 1161 (defend 0.7, attack 0.35), the in-stride carry 1224 of which readsOf 673 (its hypothetical updateIntentions), advance 984 and stepToward, carryInStride 476, the reach scans reachOnPath 312 (T441–T446), boxScene 23 (T443).',
    preparation: 'prepareMatch 641, of it npcSquad 359: every squad invalidation (about 200 a season) regenerates the queried clubs\' 18 players (about 1.6k squads, 28k makePlayer).',
    validation:
      'assertFullMatchRecord 519 (packages/engine/src/match-model.ts, outside T450): each record is checked when it is built and again in recordMatch, and participationIssues builds an `${id} …` label for every player check before knowing there is an issue (about 330 strings a record).',
    history:
      'still growing with the people registry, smaller: refreshCoachingMarket 164, syncMentorExposures 129, qualifyManagers 119, settleNpcCoaching 82 at season 61.',
    harness: "tsx's keepNames `__name` (Object.defineProperty, shown as `set toTemporalInstant`) still costs about 0.2 s a season from closures made per call in other hot functions.",
  },
};
fs.writeFileSync('artifacts/benchmarks/t450/throughput.json', JSON.stringify(out, null, 1) + '\n');
console.log('wrote artifacts/benchmarks/t450/throughput.json');
