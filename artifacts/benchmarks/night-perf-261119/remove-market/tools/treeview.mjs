// node tree.mjs <profile> <rows> <kinds> <rootFn> <depth> [minPct]: call tree under rootFn within windows.
import { readFileSync } from 'node:fs';
const [pf, rf, kinds, root, depthArg = '3', minArg = '0.5'] = process.argv.slice(2);
const p = JSON.parse(readFileSync(pf, 'utf8'));
const rows = rf === "-" ? null : JSON.parse(readFileSync(rf, "utf8")).rows.filter((r) => kinds.split(',').includes(r.kind) && r.n > 0);
const off = Number(process.env.OFF ?? 0);
const parent = new Map(); for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n);
const byId = new Map(p.nodes.map((n) => [n.id, n]));
let t = p.startTime; const st = p.timeDeltas.map((d) => (t += d));
const key = (n) => `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber + 1}`;
const tree = { c: new Map(), v: 0 }; let counted = 0;
p.samples.forEach((id, i) => {
  const s = st[i];
  if (rows && !rows.some((r) => s >= r.mid + off && s <= r.to + off)) return;
  const node = byId.get(id); if (node.callFrame.functionName === '(idle)') return;
  counted++;
  const path = []; for (let n = node; n; n = parent.get(n.id)) path.push(key(n));
  path.reverse();
  const at = path.findIndex((k) => k.startsWith(root + ':'));
  if (at < 0) return;
  let cur = tree; cur.v++;
  for (let d = at; d < Math.min(path.length, at + Number(depthArg) + 1); d++) {
    let nx = cur.c.get(path[d]); if (!nx) cur.c.set(path[d], (nx = { c: new Map(), v: 0 }));
    nx.v++; cur = nx;
  }
});
const pr = (n, ind) => { for (const [k, v] of [...n.c].sort((a, b) => b[1].v - a[1].v)) { if (100 * v.v / counted < Number(minArg)) continue; console.log(`${' '.repeat(ind)}${(100 * v.v / counted).toFixed(1)}% ${k}`); pr(v, ind + 2); } };
console.log(`${counted} samples in windows`); pr(tree, 0);
