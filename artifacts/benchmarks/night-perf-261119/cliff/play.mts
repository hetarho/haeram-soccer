// Read-only driver: plays a lived career forward season by season (engine days only, as the
// engine worker does) and at every season close records sizes, the product codec decision
// (persistence.encode with pure-JS brotli stubbed so its choice is observed without running it),
// the autosave hand-off clone, heap and a few record reads. Saves a .bin every 5 seasons and at
// the first season whose checkpoint would go to brotli.
import { registerHooks } from 'node:module';
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'brotli/compress')
      return {
        url: 'data:text/javascript,export async function compress(){throw new Error("BROTLI_CHOSEN")}',
        shortCircuit: true,
      };
    return next(spec, ctx);
  },
});
import v8 from 'node:v8';
import { writeFileSync, readFileSync, appendFileSync } from 'node:fs';
const R = '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/';
const DIR = '/private/tmp/claude-501/-Users-ihaelam-project-haeram-soccer/c45bcc06-66c2-4d18-afd2-e8636426f0dc/scratchpad/cliff/';
const engine: any = await import(R + 'packages/engine/src/index');
const { currentDay } = await import(R + 'packages/engine/src/calendar');
const { npcMarketDays } = await import(R + 'packages/engine/src/npc-market');
const { Host } = await import(R + 'apps/web/src/runtime/host');
const { encode, decode } = await import(R + 'apps/web/src/adapters/persistence');
const { encodePayload, payloadBytes } = await import(R + 'apps/web/src/adapters/compression');
const { pack } = await import(R + 'apps/web/src/adapters/packing');
const { canonical } = await import(R + 'packages/contracts/src/index');

const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const pcpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const wall = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const [src, startArg = '15', targetArg = '35', tag = 'play'] = process.argv.slice(2);
let played = Number(startArg);
const target = Number(targetArg);
const LOG = DIR + tag + '.log', OUT = DIR + tag + '.jsonl';
const log = (s: string) => (appendFileSync(LOG, s + '\n'), console.error(s));
let w: any = v8.deserialize(readFileSync(src!));
w.cash = '99999999999';
if (w.owner) w.owner.fortune = '999999999999'; // the owner's own money ran out at the 1985-86 close (owner-bankruptcy ended the run); refilled like cash
const host = new Host() as any;
host.world = w;
let rid = 0;
const req = (body: any) => ({ protocol: 1, session: 's', requestId: 'r' + ++rid, expectedRevision: -1, generation: 1, parentGeneration: 0, body });
const size = (x: unknown) => { try { return JSON.stringify(x)?.length ?? 0; } catch { return -1; } };
const gc = (globalThis as any).gc as () => void;
function timeRead(body: any) {
  const a = cpu();
  const reply = host.read(req(body));
  const read = cpu() - a;
  return { read: +read.toFixed(1), bytes: size(reply), ok: reply.ok };
}
async function codecProbe(full: boolean) {
  const r: any = {};
  let a = cpu();
  const bytes = new TextEncoder().encode(canonical(pack(w)));
  r.packMs = +(cpu() - a).toFixed(0);
  r.packed = bytes.length;
  const fast = await encodePayload(bytes, () => true);
  r.fastCodec = fast.codec;
  r.cjk14 = fast.payload.length;
  r.gzip = payloadBytes(fast.codec, fast.payload).length;
  r.cjk14OfLimit = +(r.cjk14 / 2_796_202).toFixed(4);
  a = cpu(); const p = pcpu(), t = wall();
  try {
    const raw = await encode(w, 2, 1);
    r.codec = JSON.parse(raw).codec;
    r.rawChars = raw.length;
    r.rawUtf8 = Buffer.byteLength(raw);
    r.encodeThreadMs = +(cpu() - a).toFixed(0); r.encodeProcMs = +(pcpu() - p).toFixed(0); r.encodeWallMs = +(wall() - t).toFixed(0);
    if (full) {
      const b = cpu(), q = pcpu(), u = wall();
      await decode(raw);
      r.decodeThreadMs = +(cpu() - b).toFixed(0); r.decodeProcMs = +(pcpu() - q).toFixed(0); r.decodeWallMs = +(wall() - u).toFixed(0);
    }
  } catch (e) {
    r.codec = String(e).includes('BROTLI_CHOSEN') ? 'brotli-bmp127' : 'error ' + String(e).slice(0, 200);
    r.toBrotliThreadMs = +(cpu() - a).toFixed(0); r.toBrotliWallMs = +(wall() - t).toFixed(0);
  }
  return r;
}
async function probe(full: boolean) {
  const row: any = { played, year: w.year, ownMatches: w.ownMatches.length, events: w.events.length, history: w.history.length, people: Array.isArray(w.people) ? w.people.length : Object.keys(w.people ?? {}).length };
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
  Object.assign(row, await codecProbe(full));
  gc(); gc();
  const m = process.memoryUsage();
  row.heapUsedMB = +(m.heapUsed / 1e6).toFixed(0); row.rssMB = +(m.rss / 1e6).toFixed(0);
  const own = w.clubs.find((c: any) => c.id === w.playerClub);
  const cupKey = (w.cups ?? []).find((c: any) => c.country === own.country)?.fixtures?.[0]?.groupKey;
  row.reads = {
    archivePrev: timeRead({ type: 'archive', year: w.year - 1 }),
    clubRecords: timeRead({ type: 'club-records' }),
    managerHistory: timeRead({ type: 'manager-history', world: w.id }),
    fullStatsLeague: timeRead({ type: 'full-stats', kind: 'league', groupKey: engine.groupKey(own) }),
    ...(cupKey ? { fullStatsCup: timeRead({ type: 'full-stats', kind: 'cup', groupKey: cupKey }) } : {}),
  };
  return row;
}
const agg: any = {};
const add = (kind: string, v: number) => { const s = (agg[kind] ??= { n: 0, sum: 0, max: 0 }); s.n++; s.sum += v; s.max = Math.max(s.max, v); };
log(`start ${w.year} played ${played} target ${target}`);
const p0 = await probe(true);
appendFileSync(OUT, JSON.stringify({ probe: p0 }) + '\n');
log(`probe ${played} ${w.year} json ${(p0.json / 1e6).toFixed(1)}M packed ${(p0.packed / 1e6).toFixed(2)}MB gzip ${(p0.gzip / 1e6).toFixed(3)}MB cjk14 ${p0.cjk14} (${(p0.cjk14OfLimit * 100).toFixed(1)}%) codec ${p0.codec} clone ${p0.cloneWorld} heap ${p0.heapUsedMB}`);
const t0 = cpu();
let market = new Set(npcMarketDays(w.year).flat());
let cliffAt: number | undefined;
while (played < target || (cliffAt !== undefined && played < cliffAt + 1)) {
  if (w.critical) { delete w.critical; w.revision++; }
  if (engine.careerEnded?.(w) || w.bankrupt !== undefined || w.ended !== undefined) { log('career ended ' + w.ended + ' ' + w.bankrupt); break; }
  const year = w.year, round = w.round, own = w.ownMatches.length, day = currentDay(w) + 1;
  const a = cpu();
  engine.advanceDays(w, 1, undefined, false);
  const eng = cpu() - a;
  const kind = w.year !== year ? 'close' : w.round > round ? (w.ownMatches.length > own ? 'round-own' : 'round') : market.has(day) ? 'market' : w.ownMatches.length > own ? 'cup-own' : 'other';
  add(kind, eng);
  if (w.year !== year) {
    played++;
    market = new Set(npcMarketDays(w.year).flat());
    const days = Object.fromEntries(Object.entries(agg).map(([k, s]: any) => [k, { mean: +(s.sum / s.n).toFixed(1), max: +s.max.toFixed(0), n: s.n, sum: +s.sum.toFixed(0) }]));
    for (const k of Object.keys(agg)) delete agg[k];
    const seasonEngine = Object.values(days).reduce((x: number, d: any) => x + d.sum, 0);
    const full = played % 5 === 0;
    const pr = await probe(full);
    if (pr.codec === 'brotli-bmp127' && cliffAt === undefined) { cliffAt = played; writeFileSync(DIR + `world-${tag}-cliff-${played}.bin`, v8.serialize(w)); }
    appendFileSync(OUT, JSON.stringify({ played, year: w.year, cumCpu: +(cpu() - t0).toFixed(0), seasonEngine, days, probe: pr }) + '\n');
    log(`season ${played} -> ${w.year} cum ${((cpu() - t0) / 1000).toFixed(0)}s seasonEng ${(seasonEngine / 1000).toFixed(1)}s own ${w.ownMatches.length} people ${pr.people} json ${(pr.json / 1e6).toFixed(1)}M ser ${(pr.serBytes / 1e6).toFixed(1)}MB packed ${(pr.packed / 1e6).toFixed(2)}MB gzip ${(pr.gzip / 1e6).toFixed(3)}MB cjk14 ${pr.cjk14} (${(pr.cjk14OfLimit * 100).toFixed(1)}%) codec ${pr.codec} enc ${pr.encodeWallMs ?? pr.toBrotliWallMs}ms dec ${pr.decodeWallMs ?? '-'} clone ${pr.cloneWorld}ms heap ${pr.heapUsedMB}MB rss ${pr.rssMB} days ${JSON.stringify(Object.fromEntries(Object.entries(days).map(([k, d]: any) => [k, `${d.mean}/${d.max}x${d.n}`])))}`);
    if (full) writeFileSync(DIR + `world-${tag}-${played}.bin`, v8.serialize(w));
  }
}
log('done ' + ((cpu() - t0) / 1000).toFixed(0) + 's');
