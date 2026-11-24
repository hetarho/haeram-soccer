# T1065 — can a save find unchanged rows cheaper than encoding them?

Measured 2026-11-24 on hq-dev1-pve2-vm2 (Xeon Silver 4214, 12 cores, Node v24.22.1, load 0.6–1.8),
tree e5a8b643e (the full comparison, T1061 reverted). Workload: the 1930 e2e start
(`records-room-journey`, 석유 재벌, every responsibility delegated, manual mode), the game created and
saved after six 다음 이벤트 stops; 2,856 in-memory rows (squad 450, person 1,985, player_record 328,
world_field 67, event 22, own_match 3, news_bucket 1). Medians of 7 runs (snapshot 3), in ms, for
every record of each world field (rows of 0.5 ms or more shown):

| field | records | `JSON.stringify` | deep equality with a committed copy | 32-bit structural fingerprint | taking the copy (`structuredClone`) |
|---|---|---|---|---|---|
| clubs | 1 | 2.19 | 2.15 | 1.92 | 6.89 |
| fixtures | 1 | 5.97 | 5.10 | 11.48 | 15.87 |
| squads | 450 | 35.51 | 34.63 | 122.79 | 134.71 |
| people | 1,985 | 3.02 | 2.48 | 11.07 | 14.20 |
| npcSeason | 1 | 7.93 | 6.63 | 19.97 | 60.22 |
| playerRecords | 328 | 0.62 | 0.43 | 1.41 | 4.10 |
| discipline | 1 | 1.37 | 1.93 | 3.99 | 7.17 |
| recentResults | 1 | 2.44 | 2.55 | 8.46 | 6.49 |
| **every field** | | **60.1** | **57.3** | **184.5** | **254.3** |

`worldToRows` over the same world: 66.7 ms. `RowSaver.save` with nothing changed: 75–107 ms, of
which building the rows 68–99 ms, `stable` 1.8–2.4 ms and SQLite 0.1–0.2 ms, so the save is the
encoding and nothing else in it is worth cutting.

Reading: a check complete enough to trust (every key in order, every value) walks every leaf, and
in JavaScript that costs what V8's native `JSON.stringify` costs (deep equality 0.95×, on records
that are all equal, its best case) or more (the fingerprint 3.1×, and its 32 bits are not
complete); the copy it compares with costs 4.2× a full encoding to take and doubles the memory a
world holds. Identity cannot stand in for it: the engine changes squads, people, the season and
`playerRecords` in place (T1061's suggestion, T1065's review case). No variant was kept.

Recipe (`node_modules/.bin/tsx recipe.mts` from the repository root):

```ts
// Experiment: cost of JSON.stringify per family against a deep-equal walk on a snapshot.
const R = process.cwd() + '/';
/* eslint-disable */
const { Host } = (await import(R + 'apps/web/src/runtime/host.ts')) as any;
const { memoryGames } = (await import(R + 'tests/fixtures/save-file.ts')) as any;
const { RESPONSIBILITY_KEYS } = (await import(R + 'packages/engine/src/responsibilities.ts')) as any;
const { daysUntilNextMatch } = (await import(R + 'packages/engine/src/calendar.ts')) as any;
const { worldToRows, FAMILIES } = (await import(R + 'apps/web/src/adapters/worldRows.ts')) as any;

const games = memoryGames();
const host = new Host(() => {}, {
  openStore: games.open,
  gameFiles: { list: games.list, remove: games.remove },
  databaseBytes: games.bytes,
});
let n = 0;
const req = (body: unknown) => ({
  protocol: 1,
  session: 's',
  requestId: `w${n++}`,
  expectedRevision: host.world?.revision ?? -1,
  body,
});
const g = await host.handle(
  req({ type: 'generate', choice: { tier: 'oil', traits: [], decade: 1930, seed: 'records-room-journey' } }),
);
const club = g.start.listings.find((l: any) => l.affordable);
await host.handle(req({ type: 'take-over', clubId: club.clubId }));
const w0 = host.world;
w0.settings.mode = 'manual';
for (const key of RESPONSIBILITY_KEYS) w0.settings.responsibilities[key] = 'delegated';
w0.settings.observations.matchEve = true;
await host.handle(req({ type: 'create-game', gameId: 'g' }));
for (let s = 0; s < 6; s++) {
  const command = daysUntilNextMatch(host.world) === 1 ? { type: 'advance-days', days: 1 } : { type: 'next-event' };
  const r = await host.handle(req({ type: 'command', command }));
  if (!r.ok) throw new Error(r.error);
  await host.handle(req({ type: 'save' }));
}
const w = host.world;





/** Deep equality that implies equal JSON text: same keys in the same order, same primitives. */
function same(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i] || !same(a[ka[i]!], b[ka[i]!])) return false;
  return true;
}
/** A 32-bit FNV-1a structural fingerprint (numbers by their bits, no text built). */
const f64 = new Float64Array(1), i32 = new Int32Array(f64.buffer);
function hash(v: any, h: number): number {
  switch (typeof v) {
    case 'number':
      if ((v | 0) === v) return Math.imul(h ^ v, 16777619);
      f64[0] = v; return Math.imul(Math.imul(h ^ i32[0]!, 16777619) ^ i32[1]!, 16777619);
    case 'string': { h = Math.imul(h ^ 0x73, 16777619); for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619); return h; }
    case 'boolean': return Math.imul(h ^ (v ? 0x74 : 0x66), 16777619);
    case 'object':
      if (v === null) return Math.imul(h ^ 0x6e, 16777619);
      if (Array.isArray(v)) { h = Math.imul(h ^ 0x5b, 16777619); for (let i = 0; i < v.length; i++) h = hash(v[i], h); return Math.imul(h ^ 0x5d, 16777619); }
      h = Math.imul(h ^ 0x7b, 16777619);
      for (const k in v) { h = hash(k, h); h = hash(v[k], h); }
      return Math.imul(h ^ 0x7d, 16777619);
    default: return h;
  }
}
const median = (fn: () => void, reps = 7) => {
  const ts: number[] = [];
  for (let i = 0; i < reps; i++) { const t = performance.now(); fn(); ts.push(performance.now() - t); }
  return +ts.sort((a, b) => a - b)[Math.floor(reps / 2)]!.toFixed(2);
};
const recordsOf = (f: string): unknown[] => {
  const v = (w as any)[f];
  if (FAMILIES[f]) return FAMILIES[f].shape === 'array' ? v : Object.values(v);
  return [v];
};
const total = { stringify: 0, deepEqual: 0, fingerprint: 0, snapshot: 0 };
const table: any[] = [];
for (const f of Object.keys(w)) {
  const recs = recordsOf(f);
  if (!recs?.length) continue;
  const snaps = recs.map((r) => structuredClone(r));
  const row = {
    field: f,
    records: recs.length,
    stringify: median(() => { for (const r of recs) JSON.stringify(r); }),
    deepEqual: median(() => { for (let i = 0; i < recs.length; i++) if (!same(recs[i], snaps[i])) throw new Error(f); }),
    fingerprint: median(() => { for (const r of recs) hash(r, 0x811c9dc5); }),
    snapshot: median(() => { for (const r of recs) structuredClone(r); }, 3),
  };
  for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += row[k];
  if (row.stringify >= 0.5) table.push(row);
}
console.table(table);
console.log(Object.fromEntries(Object.entries(total).map(([k, v]) => [k, +v.toFixed(1)])));
console.log('worldToRows', median(() => worldToRows(w)));
```
