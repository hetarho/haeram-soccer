// Self time of a V8 .cpuprofile by source file and by function (top N).
const fs = require('fs');
const [file, n = 25] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((node) => [node.id, node]));
const dt = new Map();
p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const files = new Map(), fns = new Map();
let total = 0;
for (const [id, us] of dt) {
  const node = byId.get(id);
  const cf = node.callFrame;
  const f = (cf.url || cf.functionName || '(native)').replace(/^.*\/agent-abeb76f2995c876f0\//, '').replace(/^file:\/\//, '');
  files.set(f, (files.get(f) ?? 0) + us);
  const fn = `${cf.functionName || '(anon)'} ${f.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
  fns.set(fn, (fns.get(fn) ?? 0) + us);
  total += us;
}
const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, +n).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(7)} ms ${((100 * us) / total).toFixed(1).padStart(5)}%  ${k}`);
console.log(`total ${(total / 1000).toFixed(0)} ms`);
console.log('--- by file');
console.log(top(files).join('\n'));
console.log('--- by function');
console.log(top(fns).join('\n'));
