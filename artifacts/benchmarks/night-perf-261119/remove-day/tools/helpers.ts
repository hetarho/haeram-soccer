// D8 (copied into the base tree as scripts/perf/helpers.ts): the helper path's parts on round days
// with the own fixture, all on one thread: read copy + jobs, own match, replica encode (the hand-off),
// each job as a helper computes it, and the completion with the results. Prints one JSON line.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import * as engine from '../../packages/engine/src/index';
import { prepareRound, completeRound } from '../../packages/engine/src/season';
import { simulateRoundJob, jobPlayback } from '../../packages/engine/src/round-jobs';
import { FixtureReplicaWriter } from '../../apps/web/src/runtime/fixtureReplica';
import { createFixtureHelper } from '../../apps/web/src/runtime/fixtureHelper';
import { cpu } from './side';

const [file, daysArg = '42'] = process.argv.slice(2);
const w: any = v8.deserialize(readFileSync(file));
w.cash = '99999999999';
const writer = new FixtureReplicaWriter();
const helper = createFixtureHelper();
const rounds: any[] = [];
let rev = 0;
for (let n = 0; n < Number(daysArg); n++) {
  if (w.critical) {
    delete w.critical;
    w.revision++;
  }
  let copy: any, jobs: any, t1 = 0;
  const t0 = cpu();
  const prepared = prepareRound(w, (c, j) => {
    t1 = cpu();
    copy = c;
    jobs = j;
  }, false);
  if (!prepared) {
    engine.advanceDays(w, 1, undefined, false);
    continue;
  }
  const t2 = cpu();
  const row: any = { day: w.calendar.day, copyMs: t1 - t0, ownMs: t2 - t1, jobs: jobs.length };
  let a = cpu();
  const enc = writer.encode(copy, ++rev);
  const delta = enc.base > 0;
  const job: any = { protocol: 3, session: 's', id: rev, worldRevision: w.revision, base: enc.base, ...(delta ? { patch: enc.patch } : { copy: enc.snapshot() }), jobs };
  row.encodeMs = cpu() - a;
  row.patchKB = Math.round(((delta ? enc.patch : job.copy) ?? '').length / 1024);
  row.delta = delta;
  // The helper's side: receive (structured clone of the message) and apply the replica.
  a = cpu();
  const received = structuredClone(job);
  row.receiveMs = cpu() - a;
  // The helper worker as the product runs it: apply the replica (invalidating NPC squads when the
  // rosters changed), then every job of the share; one helper takes all jobs here.
  a = cpu();
  const reply: any = helper(received);
  row.helperMs = cpu() - a;
  if (reply.error) row.helperError = String(reply.error).slice(0, 160);
  const results: any[] = reply.results ?? [];
  // Per-job spread on the engine's own copy (same inputs), for the share sizes.
  const each: number[] = [];
  if (process.env.EACH) for (const j of jobs) { const b2 = cpu(); simulateRoundJob(copy, j); each.push(cpu() - b2); }
  if (each.length) { row.eachSum = each.reduce((s, x) => s + x, 0); row.jobMax = Math.max(...each); }
  a = cpu();
  const back = structuredClone(results);
  row.replyCloneMs = cpu() - a;
  row.rejected = jobs.filter((j: any, i: number) => !jobPlayback(w, j, back[i])).length;
  a = cpu();
  completeRound(w, back as any);
  row.completeMs = cpu() - a;
  rounds.push(row);
  console.error(JSON.stringify(row));
}
console.log(JSON.stringify({ file, rounds }));
