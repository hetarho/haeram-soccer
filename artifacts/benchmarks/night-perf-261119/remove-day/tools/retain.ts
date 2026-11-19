// D7 (copied into the base tree as scripts/perf/retain.ts): on a lived world, the autosave hand-off
// clone, its size and a Host day before and after pruning long-retired people and per-player records
// older than `keep` seasons. Prints one JSON line.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import { open, cpu } from './side';
import { Host } from '../../apps/web/src/runtime/host';

const [file, keepArg = '10', daysArg = '14', mode = 'both'] = process.argv.slice(2);
const keep = Number(keepArg);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

function measure(w: any) {
  const json = JSON.stringify(w).length;
  const clone: number[] = [],
    ser: number[] = [];
  let bytes = 0;
  for (let i = 0; i < 3; i++) {
    let a = cpu();
    structuredClone(w);
    clone.push(cpu() - a);
    a = cpu();
    bytes = v8.serialize(w).length;
    ser.push(cpu() - a);
  }
  const h = new Host() as any;
  h.world = w;
  const view: number[] = [];
  let base = h.publish().viewSeq;
  for (let i = 0; i < 6; i++) {
    const a = cpu();
    const reply = h.views.publish(h.view(), undefined);
    view.push(cpu() - a);
    base = reply.viewSeq;
  }
  return {
    jsonMB: +(json / 1e6).toFixed(2),
    v8MB: +(bytes / 1e6).toFixed(2),
    cloneMs: +median(clone).toFixed(0),
    serializeMs: +median(ser).toFixed(0),
    fullViewMs: +median(view.slice(1)).toFixed(1),
    people: Object.keys(w.people ?? {}).length,
    records: Object.keys(w.playerRecords ?? {}).length,
  };
}

function prune(w: any) {
  const cut = w.year - keep;
  const lastYear = (p: any) => Math.max(0, ...(p.employment ?? []).map((e: any) => e.to?.year ?? 9999));
  let people = 0,
    lines = 0,
    moves = 0,
    records = 0;
  const gone = new Set<string>();
  for (const [id, p] of Object.entries<any>(w.people)) {
    if (p.playing !== 'retired' || p.club || p.management || p.coaching || p.formerOwn || p.ownCareer) continue;
    if (lastYear(p) >= cut) continue;
    delete w.people[id];
    gone.add(id);
    people++;
  }
  for (const [id, r] of Object.entries<any>(w.playerRecords ?? {})) {
    if (gone.has(id) && !w.players.some((p: any) => p.id === id)) {
      delete w.playerRecords[id];
      records++;
      continue;
    }
    if (r.lines) {
      const n = r.lines.length;
      r.lines = r.lines.filter((l: any) => l.year >= cut);
      lines += n - r.lines.length;
    }
    if (r.moves) {
      const n = r.moves.length;
      r.moves = r.moves.filter((m: any) => m.year >= cut);
      moves += n - r.moves.length;
    }
  }
  return { cut, people, records, lines, moves };
}

function summary(rows: any[]) {
  const sum = (k: string, f: (r: any) => boolean) => rows.filter(f).reduce((s, r) => s + r[k], 0);
  const other = rows.filter((r) => r.kind === 'other');
  const view = (r: any) => r.view + r.publish + r.post;
  return {
    days: rows.length,
    engine: +sum('engine', () => true).toFixed(0),
    roundEngine: +sum('engine', (r) => r.kind.startsWith('round')).toFixed(0),
    rounds: rows.filter((r) => r.kind.startsWith('round')).length,
    viewAll: +rows.reduce((s, r) => s + view(r), 0).toFixed(0),
    otherDayMs: +(other.reduce((s, r) => s + r.engine + view(r), 0) / Math.max(1, other.length)).toFixed(1),
    otherViewMs: +(other.reduce((s, r) => s + view(r), 0) / Math.max(1, other.length)).toFixed(1),
  };
}

const out: any = { file, keep };
if (mode !== 'after') {
  const w: any = v8.deserialize(readFileSync(file));
  out.before = measure(w);
}
const side = open(file, true);
if (mode !== 'before') {
  out.pruned = prune(side.w);
  out.after = measure(side.w);
}
// Lived days through the Host, pruned and unpruned in lockstep (alternating which steps first).
const plain = open(file, true);
const rp: any[] = [], ru: any[] = [];
for (let i = 0; i < 2 + Number(daysArg); i++) {
  const a = i % 2 ? [side, plain] : [plain, side];
  const r = a.map((s) => s.step());
  if (i < 2) continue;
  rp.push(i % 2 ? r[0] : r[1]);
  ru.push(i % 2 ? r[1] : r[0]);
}
out.daysPruned = summary(rp);
out.daysUnpruned = summary(ru);
console.log(JSON.stringify(out));
