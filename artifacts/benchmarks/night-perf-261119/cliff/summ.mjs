// Summarises cliff/play.jsonl: per-season sizes, codec decision, clone, heap, engine time and growth.
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => (r.probe && r.played === undefined ? { probe: r.probe } : r)).filter((r) => r.probe?.codec !== undefined).filter((r, i, all) => !all.slice(i + 1).some((o) => o.probe.played === r.probe.played && o.days));
const L = 2_796_202;
console.log('pl year  people  json(MB) ser(MB) packed(MB) gzip(MB) cjk14   %limit codec          encMs decMs cloneMs heapMB rssMB | seasonEng(s) round-own mean/max  other mean  close');
let prev;
for (const r of rows) {
  const p = r.probe;
  const d = r.days ?? {};
  console.log(
    [String(p.played).padStart(2), p.year, String(p.people).padStart(6), (p.json / 1e6).toFixed(1).padStart(7), (p.serBytes / 1e6).toFixed(1).padStart(7), (p.packed / 1e6).toFixed(2).padStart(9), (p.gzip / 1e6).toFixed(3).padStart(8), String(p.cjk14).padStart(8), ((p.cjk14 / L) * 100).toFixed(1).padStart(6), p.codec.padEnd(14), String(p.encodeWallMs ?? p.toBrotliWallMs).padStart(5), String(p.decodeWallMs ?? '-').padStart(5), String(p.cloneWorld).padStart(6), String(p.heapUsedMB).padStart(6), String(p.rssMB).padStart(5), '|', r.seasonEngine ? (r.seasonEngine / 1000).toFixed(1).padStart(6) : '     -', d['round-own'] ? `${d['round-own'].mean}/${d['round-own'].max}`.padStart(12) : '', d.other ? String(d.other.mean).padStart(6) : '', d.close ? String(d.close.max).padStart(6) : ''].join(' '),
  );
  prev = p;
}
const ps = rows.map((r) => r.probe);
const last = ps.at(-1), k = Math.min(5, ps.length - 1), base = ps.at(-1 - k);
const rate = (last.gzip - base.gzip) / k;
console.log(`\ngzip growth over last ${k} seasons: ${(rate / 1e3).toFixed(1)} KB/season; cjk14 ${((last.cjk14 - base.cjk14) / k).toFixed(0)} chars/season`);
if (last.cjk14 < L) console.log(`projected crossing: +${(last.played + (L - last.cjk14) / ((last.cjk14 - base.cjk14) / k)).toFixed(1)} seasons (year ~${(last.year + (L - last.cjk14) / ((last.cjk14 - base.cjk14) / k)).toFixed(1)})`);
console.log('\nworld parts (KB) first vs last:');
const keys = Object.keys(last.parts);
for (const key of keys.slice(0, 18)) console.log(key.padEnd(16), String(((ps[0].parts[key] ?? 0) / 1e3).toFixed(0)).padStart(8), String((last.parts[key] / 1e3).toFixed(0)).padStart(8), ((last.parts[key] - (base.parts[key] ?? 0)) / k / 1e3).toFixed(0).padStart(6) + ' KB/season recent');
console.log('\nreads at last:', JSON.stringify(last.reads));
