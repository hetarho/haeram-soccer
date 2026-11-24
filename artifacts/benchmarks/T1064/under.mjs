/**
 * Reads a V8 `.cpuprofile` and reports, for the samples under a root function (`advanceDays` by
 * default), each function's self time and inclusive time (counted once per sample), the top `--top`.
 *
 *   node artifacts/benchmarks/T1064/under.mjs <profile> [--root advanceDays] [--top 40]
 *     [--children <function>]
 *
 * `--children` lists the direct callees of that function (inclusive, under the root).
 */
import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const root = arg('--root', 'advanceDays');
const top = Number(arg('--top', '40'));
const children = arg('--children');
const prof = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const label = (n) =>
  `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;
const dt = new Map();
prof.samples.forEach((id, i) => dt.set(i, (prof.timeDeltas[i + 1] ?? 0) / 1000));
const self = new Map(),
  incl = new Map(),
  kids = new Map();
let total = 0;
prof.samples.forEach((id, i) => {
  const ms = dt.get(i);
  const chain = [];
  for (let at = id; at !== undefined; at = parent.get(at)) chain.push(byId.get(at));
  const r = chain.findIndex((n) => n.callFrame.functionName === root);
  if (r < 0) return;
  total += ms;
  const under = chain.slice(0, r + 1);
  const leaf = label(under[0]);
  self.set(leaf, (self.get(leaf) ?? 0) + ms);
  const seen = new Set();
  for (const n of under) {
    const key = label(n);
    if (seen.has(key)) continue;
    seen.add(key);
    incl.set(key, (incl.get(key) ?? 0) + ms);
  }
  if (children) {
    // The outermost frame of `children` under the root, then its callee on this stack.
    for (let k = r; k > 0; k--)
      if (under[k].callFrame.functionName === children) {
        const callee = label(under[k - 1]);
        kids.set(callee, (kids.get(callee) ?? 0) + ms);
        break;
      }
  }
});
const show = (title, map) => {
  console.log(`\n${title}`);
  for (const [k, v] of [...map].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${v.toFixed(0).padStart(7)} ms ${((100 * v) / total).toFixed(1).padStart(5)}%  ${k}`);
};
console.log(`under ${root}: ${total.toFixed(0)} ms`);
show('self', self);
show('inclusive', incl);
if (children) show(`callees of ${children}`, kids);
