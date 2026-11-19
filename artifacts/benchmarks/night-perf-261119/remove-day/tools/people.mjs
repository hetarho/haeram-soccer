import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
const w = v8.deserialize(readFileSync(process.argv[2]));
const people = w.people;
const ids = Object.keys(people);
const sample = people[ids[0]];
console.log('people sample keys', Object.keys(sample), JSON.stringify(sample).slice(0, 600));
const keyCount = {};
for (const id of ids) for (const k of Object.keys(people[id])) keyCount[k] = (keyCount[k] ?? 0) + 1;
console.log(keyCount);
// sizes by sub-key
const sz = {};
for (const id of ids) for (const [k, v] of Object.entries(people[id])) sz[k] = (sz[k] ?? 0) + (JSON.stringify(v)?.length ?? 0);
console.log(Object.fromEntries(Object.entries(sz).map(([k, v]) => [k, (v / 1e6).toFixed(2)])));
const rid = Object.keys(w.playerRecords);
const r0 = w.playerRecords[rid[0]];
console.log('record sample', JSON.stringify(r0).slice(0, 500));
const rk = {}; const rs = {};
for (const id of rid) for (const [k, v] of Object.entries(w.playerRecords[id])) { rk[k] = (rk[k] ?? 0) + 1; rs[k] = (rs[k] ?? 0) + JSON.stringify(v).length; }
console.log(rk, Object.fromEntries(Object.entries(rs).map(([k, v]) => [k, (v / 1e6).toFixed(2)])));
