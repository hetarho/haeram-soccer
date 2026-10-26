// Reads the logs artifacts/benchmarks/t450/measure.mjs wrote (.tmp/t450/gates) and the kept worlds, and
// prints the measured figures of both sides as JSON for artifacts/benchmarks/t450/throughput.json.
// usage: node artifacts/benchmarks/t450/assemble-throughput.cjs > .tmp/t450/figures.json
const fs = require('fs');
const crypto = require('crypto');
const G = '.tmp/t450/gates';
const lines = (file) =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l))
    : [];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const steps = lines(`${G}/steps.jsonl`);
function step(name) {
  const start = steps.filter((s) => s.step === name && s.event === 'start').at(-1);
  const end = steps.filter((s) => s.step === name && s.event === 'end' && s.at >= (start?.at ?? '')).at(-1);
  // The load file is appended to: only the samples of this step's last run count.
  const within = (l) => start && l.at >= start.at && (!end || l.at <= end.at);
  const samples = lines(`${G}/${name}.load.jsonl`).filter(within);
  const loads = samples.map((l) => l.load1);
  const others = samples.flatMap((l) => l.busy.filter((b) => b.comm !== 'node'));
  return start
    ? {
        at: start.at,
        seconds: end?.seconds,
        status: end?.status,
        engine: start.engine,
        dirty: start.dirty || undefined,
        command: start.command,
        load1: { median: +median(loads)?.toFixed(2), max: +Math.max(...loads).toFixed(2), samples: loads.length },
        busyOthers: [...new Set(others.map((b) => b.comm))],
      }
    : undefined;
}
function seasons(name) {
  const rows = lines(`${G}/${name}.log`);
  const byWorld = {};
  for (const r of rows) {
    if (r.warmup) continue;
    const key = r.file.split('/').slice(-2).join('/');
    (byWorld[key] ??= { year: r.year, ms: [], digests: new Set() }).ms.push(r.ms);
    byWorld[key].digests.add(r.digest);
  }
  return Object.fromEntries(
    Object.entries(byWorld).map(([k, v]) => [
      k,
      { season: v.year, ms: v.ms, medianMs: median(v.ms), digest: [...v.digests].join(' ') },
    ]),
  );
}
function series(name) {
  const rows = lines(`${G}/${name}.log`).filter((r) => r.ms !== undefined);
  if (!rows.length) return undefined;
  const ms = rows.map((r) => r.ms);
  const buckets = {};
  for (let k = 0; k < ms.length; k += 10)
    buckets[`${k + 1}-${Math.min(k + 10, ms.length)}`] = median(ms.slice(k, k + 10));
  return { seasons: ms.length, medianMs: median(ms), minMs: Math.min(...ms), maxMs: Math.max(...ms), byTen: buckets, ms };
}
function fixture(file) {
  if (!fs.existsSync(file)) return undefined;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const c = Object.fromEntries(j.performance.components.map((x) => [x.id, x]));
  const pick = (id) => c[id] && { medianMs: c[id].medianMs, p90Ms: c[id].p90Ms, samples: c[id].samples };
  return {
    source: { gitHead: j.provenance.source.gitHead, fingerprint: j.provenance.source.fingerprint.sha256.slice(0, 12) },
    'fixture.candidate': pick('fixture.candidate'),
    'candidate.generation': pick('candidate.generation'),
    'candidate.attribution': pick('candidate.attribution'),
    'fixture.own-candidate': pick('fixture.own-candidate'),
    'season.baseline (1 season)': pick('season.baseline'),
    'season.active-management (1 season)': pick('season.active-management'),
    memory: j.memory,
    checks: j.checks,
  };
}
const sha = (file) =>
  fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const kept = Object.fromEntries(
  [30, 60, 80].map((n) => [
    `season-${n}.world.json`,
    {
      before: sha(`.tmp/t450/before/season-${n}.world.json`),
      after: sha(`.tmp/t450/series-after/season-${n}.world.json`),
      beforeQuiet: sha(`.tmp/t450/series-before/season-${n}.world.json`),
    },
  ]),
);
const out = {};
for (const side of ['before', 'after'])
  out[side] = {
    seasons: { run: step(`${side}-seasons`), worlds: seasons(`${side}-seasons`) },
    active: { run: step(`${side}-active`), worlds: seasons(`${side}-active`) },
    fixture: { run: step(`${side}-fixture`), report: fixture(`.tmp/t450/mmb-${side}.json`) },
    series: { run: step(`${side}-series`), figures: series(`${side}-series`) },
  };
out.keptWorlds = kept;
console.log(JSON.stringify(out, null, 1));
