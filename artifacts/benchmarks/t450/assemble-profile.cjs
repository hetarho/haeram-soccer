// Writes artifacts/benchmarks/t450/profile-<label>.json from `selftime.cjs --json` tables of an early and
// a late season's .cpuprofile, with the commit, machine and command they were taken with.
// usage: node artifacts/benchmarks/t450/assemble-profile.cjs <label> <commit> <early.json> <late.json>
//          [<third name>=<third.json>]
const fs = require('fs');
const os = require('os');
const [label, commit, earlyFile, lateFile, ...more] = process.argv.slice(2);
const NOTES = {
  'set toTemporalInstant':
    "V8's name for the Object.defineProperty builtin here: tsx's esbuild keepNames helper __name, called each time a named closure is created",
  'time-seasons.mts': 'the harness: JSON.parse of the kept world and the digest after the season, outside the timed season',
};
const clean = (rows, n) =>
  rows.slice(0, n).map((r) => {
    const name = r.name.replace(/:1$/, '').replace(/^\(root\) \(root\):0$/, '(root)');
    const note = Object.entries(NOTES).find(([k]) => name.includes(k))?.[1];
    return { name, ms: r.ms, share: r.share, ...(note ? { note } : {}) };
  });
const season = (file, world) => {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    world,
    profileMs: t.totalMs,
    selfByFunction: clean(t.byFunction, 30),
    selfByFile: clean(t.byFile, 20),
    inclusive: clean(
      t.inclusive.filter((r) => !/^(\(root\)|evaluate|run esm|\(anon\) t450)/.test(r.name)),
      30,
    ),
  };
};
const out = {
  task: 'T450',
  label,
  commit,
  machine: {
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    platform: os.platform(),
    arch: os.arch(),
    memoryBytes: os.totalmem(),
    node: process.version,
  },
  command:
    'node --cpu-prof --cpu-prof-dir=.tmp/t450/prof --import tsx artifacts/benchmarks/t450/time-seasons.mts 0 <world.json>; node artifacts/benchmarks/t450/selftime.cjs <profile> 30 --json',
  worlds:
    'artifacts/benchmarks/t450/build-worlds.mts 80 .tmp/t450/before 0,1,5,30,60,80 on 4a8c03dc: the candidate model from founding on the century baseline profile (seed release-century-baseline); season-N.world.json is the world at the start of season N+1',
  note: 'One simulateSeason of a kept world, cold (no warm-up), under the V8 sampling profiler, which slows it by about 5%. Self time is the function body alone; inclusive counts its callees once per sample.',
  seasons: {
    early: season(earlyFile, 'season-1.world.json (the 1952 season, history 1)'),
    late: season(lateFile, 'season-60.world.json (the 2011 season, history 60)'),
    ...Object.fromEntries(
      more.map((m) => {
        const [name, file, world = ''] = m.split('=');
        return [name, season(file, world)];
      }),
    ),
  },
};
fs.writeFileSync(`artifacts/benchmarks/t450/profile-${label}.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote artifacts/benchmarks/t450/profile-${label}.json`);
