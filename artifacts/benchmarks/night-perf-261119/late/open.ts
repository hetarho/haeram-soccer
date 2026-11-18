// Records room open vs closed on the same world: per day, the reads the open page would trigger
// (current-season archive on an events/own-match change, club records per own match, manager
// history per key change), timed on the host with their posting clone.
import v8 from 'node:v8';
import { readFileSync, writeFileSync } from 'node:fs';
import * as engine from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/index';
import { Host } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/host';
import { forPosting } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/viewPublisher';
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const [src, daysArg = '60', out] = process.argv.slice(2);
const w: any = v8.deserialize(readFileSync(src!));
w.cash = '99999999999';
const host = new Host() as any;
host.world = w;
let base = host.views.publish(host.view(), undefined).viewSeq;
let rid = 0;
const req = (body: any) => ({ protocol: 1, session: 's', requestId: 'r' + ++rid, expectedRevision: -1, generation: 1, parentGeneration: 0, body });
const read = (body: any) => { const a = cpu(); const r = host.read(req(body)); structuredClone(r); return cpu() - a; };
let prev: any = host.view();
const rows: any[] = [];
for (let n = 0; n < Number(daysArg); n++) {
  if (w.critical) { delete w.critical; w.revision++; }
  const own = w.ownMatches.length;
  let a = cpu();
  engine.advanceDays(w, 1, undefined, false);
  const eng = cpu() - a;
  a = cpu();
  const view = host.view();
  const reply = host.views.publish(view, base);
  structuredClone(forPosting(reply));
  base = reply.viewSeq;
  const host1 = cpu() - a;
  const d = reply.viewDelta ?? {};
  const changed = (k: string) => k in (d.world ?? {}) || `world.${k}` in (d.patches ?? {}) || (d.dropped ?? []).includes(`world.${k}`);
  const eventsChanged = changed('events'), matchesChanged = changed('ownMatches');
  let reads = 0, kinds: string[] = [];
  if (eventsChanged || matchesChanged) { reads += read({ type: 'archive', year: w.year }); kinds.push('archive'); }
  if (w.ownMatches.length > own) { reads += read({ type: 'club-records' }); kinds.push('club-records'); }
  if (view.managerHistoryKey !== prev.managerHistoryKey) { reads += read({ type: 'manager-history', world: w.id }); kinds.push('manager-history'); }
  prev = view;
  rows.push({ n, eng, host: host1, reads, kinds });
  console.error(`${n} eng ${eng.toFixed(0)} view+pub+post ${host1.toFixed(0)} reads ${reads.toFixed(1)} ${kinds.join(',')}`);
}
const withRead = rows.filter((r) => r.kinds.length).length;
console.error(`days ${rows.length} days-with-read ${withRead} mean read ms ${(rows.reduce((a, r) => a + r.reads, 0) / Math.max(1, withRead)).toFixed(2)} max ${Math.max(...rows.map((r) => r.reads)).toFixed(1)}`);
if (out) writeFileSync(out, JSON.stringify(rows));
