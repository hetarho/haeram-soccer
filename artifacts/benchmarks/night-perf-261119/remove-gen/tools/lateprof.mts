// WT=<tree> FROM=<season> N=<seasons> OUT=<cpuprofile> tsx lateprof.mts: live unprofiled to FROM, profile N seasons.
import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';
const ROOT = process.env.WT!;
const { historyWorld, liveHistory } = await import(`${ROOT}/packages/engine/src/history.ts`);
const w = historyWorld('generation-reference');
const from = Number(process.env.FROM), n = Number(process.env.N ?? 1);
liveHistory(w, from);
console.log('reached', w.year, 'people', Object.keys(w.people ?? {}).length);
const s = new Session(); s.connect();
await s.post('Profiler.enable'); await s.post('Profiler.setSamplingInterval', { interval: 500 });
await s.post('Profiler.start');
const t0 = performance.now();
liveHistory(w, from + n);
const { profile } = await s.post('Profiler.stop');
console.log('profiled', n, 'seasons', (performance.now() - t0).toFixed(0), 'ms');
writeFileSync(process.env.OUT!, JSON.stringify(profile));
