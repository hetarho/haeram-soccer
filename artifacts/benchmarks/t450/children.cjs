// Inclusive time of the callees of one function in a V8 .cpuprofile, summed over its frames.
// usage: node artifacts/benchmarks/t450/children.cjs <file.cpuprofile> <functionName regex> [N]
const fs = require('fs');
const [file, target, n = '20'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((node) => [node.id, node]));
const dt = new Map();
p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const total = (id) =>
  (dt.get(id) ?? 0) + (byId.get(id).children ?? []).reduce((a, c) => a + total(c), 0);
const re = new RegExp(target);
const agg = new Map();
let self = 0;
for (const node of p.nodes) {
  if (!re.test(node.callFrame.functionName)) continue;
  self += dt.get(node.id) ?? 0;
  for (const c of node.children ?? []) {
    const cf = byId.get(c).callFrame;
    const key = `${cf.functionName || '(anon)'}@${cf.url.split('/').pop()}:${cf.columnNumber}`;
    agg.set(key, (agg.get(key) ?? 0) + total(c));
  }
}
console.log(`self ${(self / 1000).toFixed(0)} ms`);
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, +n))
  console.log(`${(v / 1000).toFixed(0).padStart(6)} ${k}`);
