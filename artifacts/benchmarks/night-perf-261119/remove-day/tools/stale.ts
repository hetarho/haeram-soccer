// D5 staleness (copied into the base tree as scripts/perf/stale.ts): over N lived days, how often each
// view part a weekly cache would hold changes from one day to the next, and how stale a weekly cache
// shows it (days a changed value waits until the next week's refresh). Prints one JSON line.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as engine from '../../packages/engine/src/index';
import { readingOnce } from '../../packages/engine/src/world';
import { staffMarket } from '../../packages/engine/src/staff';
import { disciplineNames } from '../../apps/web/src/runtime/disciplineNames';
import { officeRead } from '../../apps/web/src/runtime/officeRead';
const { managerCandidates, transferOffers } = engine as any;
const [file, daysArg = '84'] = process.argv.slice(2);
const w: any = v8.deserialize(readFileSync(file));
w.cash = '99999999999';
const parts: Record<string, (w: any) => unknown> = {
  managers: managerCandidates,
  coaches: staffMarket,
  transfers: transferOffers,
  discipline: disciplineNames,
  office: officeRead,
};
const h = (x: unknown) => createHash('sha256').update(JSON.stringify(x) ?? 'u').digest('hex').slice(0, 16);
const prev: Record<string, string> = {};
const cachedAt: Record<string, string> = {};
const out: Record<string, { changes: number; staleDays: number; days: number }> = {};
for (let n = 0; n < Number(daysArg); n++) {
  if (w.critical) { delete w.critical; w.revision++; }
  engine.advanceDays(w, 1, undefined, false);
  const day = w.calendar?.day ?? 0;
  const vals = readingOnce(w, () => Object.fromEntries(Object.entries(parts).map(([k, f]) => [k, h(f(w))])));
  const refresh = day % 7 === 0 || n === 0;
  for (const [k, v] of Object.entries(vals)) {
    const o = (out[k] ??= { changes: 0, staleDays: 0, days: 0 });
    o.days++;
    if (prev[k] !== undefined && prev[k] !== v) o.changes++;
    if (refresh) cachedAt[k] = v;
    if (cachedAt[k] !== v) o.staleDays++;
    prev[k] = v;
  }
}
console.log(JSON.stringify({ file: file.split('/').pop(), days: Number(daysArg), parts: out }));
