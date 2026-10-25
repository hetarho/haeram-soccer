// Time of one function in a V8 .cpuprofile (its own and its callees') by caller chain.
// usage: node docs/benchmarks/t450/callers.cjs <file.cpuprofile> <functionName> [depth]
const fs = require('fs');
const [file, target, depth = '2'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const dt = new Map();
p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const total = (id) =>
  (dt.get(id) ?? 0) + (byId.get(id).children ?? []).reduce((a, c) => a + total(c), 0);
const agg = new Map();
for (const n of p.nodes) {
  if (!new RegExp(target).test(n.callFrame.functionName)) continue;
  let at = parent.get(n.id);
  const chain = [];
  for (let k = 0; k < +depth && at !== undefined; k++) {
    const c = byId.get(at).callFrame;
    chain.push(`${c.functionName || '(anon)'}@${c.url.split('/').pop()}:${c.columnNumber}`);
    at = parent.get(at);
  }
  const key = chain.join(' < ');
  agg.set(key, (agg.get(key) ?? 0) + total(n.id));
}
console.log(
  [...agg]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ${k}`)
    .join('\n'),
);
