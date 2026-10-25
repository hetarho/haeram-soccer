// Self time of a V8 .cpuprofile by source file and by function (top N), after T286's hand-off
// script; `--json` prints the same tables as JSON for docs/benchmarks/t450/profile-*.json.
// usage: node docs/benchmarks/t450/selftime.cjs <file.cpuprofile> [N] [--json]
const fs = require('fs');
const argv = process.argv.slice(2);
const json = argv.includes('--json');
const [file, n = 25] = argv.filter((a) => a !== '--json');
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((node) => [node.id, node]));
const dt = new Map();
p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const parent = new Map();
for (const node of p.nodes) for (const c of node.children ?? []) parent.set(c, node.id);
const where = (cf) =>
  (cf.url || cf.functionName || '(native)')
    .replace(/^file:\/\//, '')
    .replace(/^.*\/haeram-soccer(\/\.claude\/worktrees\/[^/]+)?\//, '');
const nameOf = (cf) =>
  `${cf.functionName || '(anon)'} ${where(cf).split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
const files = new Map(),
  fns = new Map(),
  inclusive = new Map();
let total = 0;
for (const [id, us] of dt) {
  const node = byId.get(id);
  const cf = node.callFrame;
  const f = where(cf);
  files.set(f, (files.get(f) ?? 0) + us);
  const fn = nameOf(cf);
  fns.set(fn, (fns.get(fn) ?? 0) + us);
  total += us;
  // Inclusive: each function on the sample's stack once.
  const seen = new Set();
  for (let at = id; at !== undefined; at = parent.get(at)) {
    const name = nameOf(byId.get(at).callFrame);
    if (seen.has(name)) continue;
    seen.add(name);
    inclusive.set(name, (inclusive.get(name) ?? 0) + us);
  }
}
const top = (m) =>
  [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, +n)
    .map(([k, us]) => ({ name: k, ms: Math.round(us / 1000), share: +((100 * us) / total).toFixed(1) }));
if (json) {
  console.log(
    JSON.stringify(
      { totalMs: Math.round(total / 1000), byFile: top(files), byFunction: top(fns), inclusive: top(inclusive) },
      null,
      1,
    ),
  );
} else {
  const line = (r) => `${String(r.ms).padStart(7)} ms ${r.share.toFixed(1).padStart(5)}%  ${r.name}`;
  console.log(`total ${(total / 1000).toFixed(0)} ms`);
  console.log('--- by file');
  console.log(top(files).map(line).join('\n'));
  console.log('--- by function');
  console.log(top(fns).map(line).join('\n'));
  console.log('--- inclusive');
  console.log(top(inclusive).map(line).join('\n'));
}
