// Prints how world parts and view parts grow between probes in a play .jsonl.
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => r.probe ? { ...r.probe, days: r.days } : r);
const first = rows[0], last = rows.at(-1);
console.log('played', rows.map((r) => r.played).join(','));
const keys = (o) => Object.keys(o ?? {});
for (const [label, f] of [['world', 'parts'], ['view', 'viewParts']]) {
  const all = new Set(rows.flatMap((r) => keys(r[f])));
  const lines = [...all].map((k) => [k, rows.map((r) => r[f]?.[k] ?? 0)]).sort((a, b) => b[1].at(-1) - a[1].at(-1)).slice(0, 18);
  console.log(`\n${label} part KB by played seasons`);
  for (const [k, v] of lines) console.log(k.padEnd(28), v.map((x) => (x / 1e3).toFixed(0).padStart(7)).join(''));
}
console.log('\nper probe: played year own ev json(MB) ser(MB) serMs cloneWorldMs viewMs fullPublishMs fullPostKB');
for (const r of rows) console.log(r.played, r.year, r.ownMatches, r.events, (r.json / 1e6).toFixed(1), (r.serBytes / 1e6).toFixed(1), r.serialize, r.cloneWorld, r.viewMs, r.fullPublish, (r.fullPostBytes / 1e3).toFixed(0));
console.log('\nreads (read ms + clone ms / bytes)');
for (const r of rows) console.log(r.played, Object.entries(r.reads).map(([k, v]) => `${k} ${v.read}+${v.clone}/${(v.bytes / 1e3).toFixed(0)}K`).join(' | '));
console.log('\nday costs (mean/max ms) by kind');
for (const r of rows) if (r.days) console.log(r.played, Object.entries(r.days).map(([k, v]) => `${k}[n${v.engine.n}] eng ${v.engine.mean}/${v.engine.max} view ${v.view.mean}/${v.view.max} pub ${v.publish.mean}/${v.publish.max} post ${v.post.mean}/${v.post.max}`).join(' || '));
