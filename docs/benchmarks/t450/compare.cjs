// Inclusive time per function in two V8 .cpuprofiles side by side, sorted by the growth from the
// first to the second: what a later season spends more on.
// usage: node docs/benchmarks/t450/compare.cjs <a.cpuprofile> <b.cpuprofile> [N]
const fs = require('fs');
const [fa, fb, n = '40'] = process.argv.slice(2);
function inclusive(file) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byId = new Map(p.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of p.nodes) for (const c of node.children ?? []) parent.set(c, node.id);
  const dt = new Map();
  p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
  const out = new Map();
  for (const [id, us] of dt) {
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) {
      const cf = byId.get(at).callFrame;
      const name = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.columnNumber}`;
      if (seen.has(name)) continue;
      seen.add(name);
      out.set(name, (out.get(name) ?? 0) + us);
    }
  }
  return out;
}
const a = inclusive(fa),
  b = inclusive(fb);
const names = new Set([...a.keys(), ...b.keys()]);
const rows = [...names].map((k) => ({ k, a: (a.get(k) ?? 0) / 1000, b: (b.get(k) ?? 0) / 1000 }));
rows.sort((x, y) => y.b - y.a - (x.b - x.a));
for (const r of rows.slice(0, +n))
  console.log(
    `${r.a.toFixed(0).padStart(7)} ${r.b.toFixed(0).padStart(7)} ${(r.b - r.a).toFixed(0).padStart(6)}  ${r.k}`,
  );
