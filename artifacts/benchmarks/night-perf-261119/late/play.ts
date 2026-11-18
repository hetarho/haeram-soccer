// Scout driver (read-only): plays the cached lived 1950 career forward season by season the way the
// Host does (engine day, view projection, publication, posting clone), and at every season close
// samples world/view part sizes, the autosave hand-off and every read the records pages ask for.
import v8 from 'node:v8';
import { writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import * as engine from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/index';
import { currentDay } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/calendar';
import { Host } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/host';
import { forPosting } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/viewPublisher';

const DIR = '/private/tmp/claude-501/-Users-ihaelam-project-haeram-soccer/c45bcc06-66c2-4d18-afd2-e8636426f0dc/scratchpad/late/';
const cpu = () => {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
};
const [src = DIR + '../days/world-perf-261027.bin', seasonsArg = '30', tag = 'play'] = process.argv.slice(2);
const seasons = Number(seasonsArg);
const LOG = DIR + tag + '.log', OUT = DIR + tag + '.jsonl';
const log = (s: string) => (appendFileSync(LOG, s + '\n'), console.error(s));
let w: any = v8.deserialize(readFileSync(src));
w.cash = '99999999999';
const host = new Host() as any;
host.world = w;
let base = host.views.publish(host.view(), undefined).viewSeq;
let rid = 0;
const req = (body: any) => ({ protocol: 1, session: 's', requestId: 'r' + ++rid, expectedRevision: -1, generation: 1, parentGeneration: 0, body });
const size = (x: unknown) => { try { return JSON.stringify(x)?.length ?? 0; } catch { return -1; } };
function timeRead(body: any) {
  const a = cpu();
  const reply = host.read(req(body));
  const read = cpu() - a;
  const b = cpu();
  const c = structuredClone(reply);
  const clone = cpu() - b;
  return { read: +read.toFixed(1), clone: +clone.toFixed(1), bytes: size(c), ok: reply.ok, err: reply.ok ? undefined : String(reply.error).slice(0, 120) };
}
function probe(played: number) {
  const row: any = { played, year: w.year, ownMatches: w.ownMatches.length, events: w.events.length, history: w.history.length };
  const parts: Record<string, number> = {};
  let total = 0;
  for (const k of Object.keys(w)) { const n = size(w[k]); parts[k] = n; total += n; }
  row.json = total;
  row.parts = Object.fromEntries(Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 25));
  let a = cpu();
  const ser = v8.serialize(w);
  row.serialize = +(cpu() - a).toFixed(0); row.serBytes = ser.length;
  a = cpu();
  structuredClone(w);
  row.cloneWorld = +(cpu() - a).toFixed(0);
  // view part sizes
  a = cpu();
  const view = host.view();
  row.viewMs = +(cpu() - a).toFixed(1);
  const vparts: Record<string, number> = {};
  for (const k of Object.keys(view)) if (k !== 'world') vparts[k] = size(view[k]);
  for (const k of Object.keys(view.world)) vparts['world.' + k] = size(view.world[k]);
  row.viewParts = Object.fromEntries(Object.entries(vparts).sort((a, b) => b[1] - a[1]).slice(0, 20));
  a = cpu();
  const full = host.views.publish(view, undefined);
  row.fullPublish = +(cpu() - a).toFixed(1);
  a = cpu();
  row.fullPostBytes = size(forPosting(full));
  // reads the records pages ask for
  const opp = w.ownMatches.at(-1) ? (w.ownMatches.at(-1).home === w.playerClub ? w.ownMatches.at(-1).away : w.ownMatches.at(-1).home) : w.clubs[1].id;
  const own = w.clubs.find((c: any) => c.id === w.playerClub);
  const cupKey = (w.cups ?? []).find((c: any) => c.country === own.country)?.fixtures?.[0]?.groupKey;
  row.reads = {
    archiveNow: timeRead({ type: 'archive', year: w.year }),
    archivePrev: timeRead({ type: 'archive', year: w.year - 1 }),
    clubRecords: timeRead({ type: 'club-records' }),
    managerHistory: timeRead({ type: 'manager-history', world: w.id }),
    headToHead: timeRead({ type: 'head-to-head', club: opp }),
    newsPage: timeRead({ type: 'news-page', world: w.id }),
    fullStatsLeague: timeRead({ type: 'full-stats', kind: 'league', groupKey: engine.groupKey(own) }),
    ...(cupKey ? { fullStatsCup: timeRead({ type: 'full-stats', kind: 'cup', groupKey: cupKey }) } : {}),
  };
  return row;
}
const agg: any = {};
const add = (kind: string, k: string, v: number) => {
  const a = (agg[kind] ??= {});
  const s = (a[k] ??= { n: 0, sum: 0, max: 0 });
  s.n++; s.sum += v; s.max = Math.max(s.max, v);
};
let played = 0;
log(`start ${w.year} own ${w.ownMatches.length}`);
appendFileSync(OUT, JSON.stringify({ probe: probe(0) }) + '\n');
const t0 = cpu();
let dayN = 0;
while (played < seasons) {
  if (w.critical) { delete w.critical; w.revision++; }
  if (engine.careerEnded?.(w) || w.bankrupt !== undefined || w.ended !== undefined) { log('career ended ' + w.ended + ' ' + w.bankrupt); break; }
  const year = w.year, round = w.round, own = w.ownMatches.length;
  let a = cpu();
  engine.advanceDays(w, 1, undefined, false);
  const eng = cpu() - a;
  a = cpu();
  const view = host.view();
  const vms = cpu() - a;
  a = cpu();
  const reply = host.views.publish(view, base);
  const pms = cpu() - a;
  a = cpu();
  structuredClone(forPosting(reply));
  const post = cpu() - a;
  base = reply.viewSeq;
  dayN++;
  const kind = w.year !== year ? 'close' : w.round > round ? (w.ownMatches.length > own ? 'round-own' : 'round') : w.ownMatches.length > own ? 'cup-own' : 'other';
  add(kind, 'engine', eng); add(kind, 'view', vms); add(kind, 'publish', pms); add(kind, 'post', post);
  if (w.year !== year) {
    played++;
    const fmt = Object.fromEntries(Object.entries(agg).map(([k, v]: any) => [k, Object.fromEntries(Object.entries(v).map(([m, s]: any) => [m, { mean: +(s.sum / s.n).toFixed(1), max: +s.max.toFixed(0), n: s.n }]))]));
    const pr = probe(played);
    const line = { played, year: w.year, seasonCpu: +(cpu() - t0).toFixed(0), days: fmt, probe: pr };
    appendFileSync(OUT, JSON.stringify(line) + '\n');
    log(`season ${played} -> ${w.year} cum ${(line.seasonCpu / 1000).toFixed(0)}s own ${w.ownMatches.length} ev ${w.events.length} json ${(pr.json / 1e6).toFixed(1)}M ser ${(pr.serBytes / 1e6).toFixed(1)}MB ${pr.serialize}ms clone ${pr.cloneWorld}ms view ${pr.viewMs} other ${JSON.stringify(fmt.other)} round-own ${JSON.stringify(fmt['round-own'])} reads ${JSON.stringify(Object.fromEntries(Object.entries(pr.reads).map(([k, v]: any) => [k, v.read + '+' + v.clone + '/' + v.bytes])))}`);
    for (const k of Object.keys(agg)) delete agg[k];
    if (played % 5 === 0) writeFileSync(DIR + `world-${tag}-${played}.bin`, v8.serialize(w));
  }
}
log('done ' + ((cpu() - t0) / 1000).toFixed(0) + 's');
