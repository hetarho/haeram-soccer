// node selftime.mjs <a.cpuprofile> <b.cpuprofile>: self time by function (file:name), top differences.
import { readFileSync } from 'node:fs';

function selfTimes(file) {
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const t = new Map();
  const dt = p.timeDeltas;
  for (let i = 0; i < p.samples.length; i++) {
    const n = byId.get(p.samples[i]);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-1)[0]}:${f.lineNumber + 1}`;
    t.set(key, (t.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  }
  return t;
}
const [a, b] = process.argv.slice(2).map(selfTimes);
const keys = new Set([...a.keys(), ...b.keys()]);
const rows = [...keys].map((k) => [k, a.get(k) ?? 0, b.get(k) ?? 0]);
const total = (m) => [...m.values()].reduce((x, y) => x + y, 0);
console.log(`total ms: base ${total(a).toFixed(0)}, cand ${total(b).toFixed(0)}`);
rows.sort((x, y) => y[2] - y[1] - (x[2] - x[1]));
for (const [k, x, y] of rows.slice(0, 25)) console.log(`${(y - x).toFixed(0).padStart(7)} ${x.toFixed(0).padStart(7)} ${y.toFixed(0).padStart(7)}  ${k}`);
