// Scout driver (read-only): per-day cost of a career as the Host plays it without helpers, with
// a breakdown into engine day, view projection, publication, posting clone, and probes for the
// autosave hand-off (v8.serialize) and the helper replica encode on round days.
import v8 from 'node:v8';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { generateHistory } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/history';
import { takeOver } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/takeover';
import { initializeReadModels } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/read-models';
import { careerWorld, careerClub } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/career.testkit';
import * as engine from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/index';
import { currentDay } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/calendar';
import { prepareRound, completeRound } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/season';
import { npcMarketDays } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/npc-market';
import { Host } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/host';
import { forPosting } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/viewPublisher';
import { FixtureReplicaWriter } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/fixtureReplica';

const cpu = () => {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
};
const now = () => Number(process.hrtime.bigint() / 1000n);
const [seed = 'perf-261027', daysArg = '60', mode = 'plain', out = 'days.json', yearArg = '1950'] =
  process.argv.slice(2);
const days = Number(daysArg);
let t = cpu();
let w: any;
if (yearArg === 'lived' || yearArg.endsWith('.bin')) {
  const file = yearArg.endsWith('.bin') ? yearArg : 'world-' + seed + '.bin';
  if (existsSync(file)) w = v8.deserialize(readFileSync(file));
  else {
    const h = generateHistory(seed, 1950 as any);
    w = takeOver(h, careerClub('ENG'), { tier: 'oil', traits: [] } as any);
    initializeReadModels(w);
    writeFileSync(file, v8.serialize(w));
  }
} else w = careerWorld({ country: 'ENG', seed, year: Number(yearArg) });
if (mode === 'gen') { console.error('built', cpu() - t); process.exit(0); }
w.cash = '99999999999';
const buildMs = cpu() - t;
const host = new Host() as any;
host.world = w;
let base = host.publish().viewSeq;
const writer = new FixtureReplicaWriter();
const rows: any[] = [];
const market = new Set(npcMarketDays(w.year).flat());
for (let n = 0; n < days; n++) {
  if (w.critical) {
    delete w.critical;
    w.revision++;
  }
  const day = currentDay(w) + 1,
    round = w.round,
    year = w.year,
    own = w.ownMatches.length;
  const row: any = { n, day, year, from: now() };
  let a = cpu();
  if (mode === 'helpers') {
    // The helper path: prepare (own match), replica encode, then the jobs computed locally.
    let copy: any, jobs: any;
    const prepared = prepareRound(w, (c, j) => ((copy = c), (jobs = j)), false);
    if (prepared) {
      row.prepare = cpu() - a;
      const e = cpu();
      const enc = writer.encode(copy, n + 1);
      enc.snapshot();
      row.encode = cpu() - e;
      row.jobs = jobs.length;
      const c = cpu();
      completeRound(w, undefined);
      row.complete = cpu() - c;
    } else engine.advanceDays(w, 1, undefined, false);
  } else engine.advanceDays(w, 1, undefined, false);
  row.engine = cpu() - a;
  row.mid = now();
  a = cpu();
  const view = host.view();
  row.view = cpu() - a;
  a = cpu();
  const reply = host.views.publish(view, base);
  row.publish = cpu() - a;
  a = cpu();
  structuredClone(forPosting(reply as any));
  row.post = cpu() - a;
  base = reply.viewSeq;
  row.to = now();
  row.kind =
    w.year !== year
      ? 'close'
      : w.round > round
        ? w.ownMatches.length > own
          ? 'round-own'
          : 'round'
        : market.has(day)
          ? 'market'
          : w.ownMatches.length > own
            ? 'cup-own'
            : 'other';
  if (n % 15 === 14 || row.kind === 'close') {
    a = cpu();
    const s = v8.serialize(w);
    row.serialize = cpu() - a;
    row.bytes = s.length;
    a = cpu();
    row.json = JSON.stringify(w).length;
    row.stringify = cpu() - a;
  }
  rows.push(row);
  console.error(
    `${n} d${day} ${row.kind} eng ${row.engine.toFixed(0)} view ${row.view.toFixed(0)} pub ${row.publish.toFixed(0)} post ${row.post.toFixed(0)}` +
      (row.encode !== undefined ? ` prep ${row.prepare.toFixed(0)} enc ${row.encode.toFixed(0)} compl ${row.complete.toFixed(0)}` : '') +
      (row.serialize !== undefined ? ` ser ${row.serialize.toFixed(0)} (${(row.bytes / 1e6).toFixed(1)} MB, json ${(row.json / 1e6).toFixed(1)}M)` : ''),
  );
}
writeFileSync(out, JSON.stringify({ seed, buildMs, mode, rows }));
