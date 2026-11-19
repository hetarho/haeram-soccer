// node closeprof.mjs <bundle> <world.bin> <out.cpuprofile>: lives to the season close and CPU-profiles the
// close step and the day after it (the summer's opening settlement); prints top self and inclusive times.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Session } from 'node:inspector/promises';
const [file, world, out] = process.argv.slice(2);
const mod = await import(pathToFileURL(file).href);
const side = mod.open(world, false);
const w = side.w;
const year = w.year;
while (w.year === year && w.round < mod.ROUNDS) side.step();
// The close follows the last round directly.
const s = new Session(); s.connect();
await s.post('Profiler.enable'); await s.post('Profiler.setSamplingInterval', { interval: 200 }); await s.post('Profiler.start');
const rows = [];
while (w.year === year) rows.push(side.step());
rows.push(side.step());
const { profile } = await s.post('Profiler.stop');
writeFileSync(out, JSON.stringify(profile));
console.log(rows.map((r) => `${r.year}:${r.day}:${r.kind}:${r.engine.toFixed(0)}`).join(' '));
// Self and inclusive time per function name.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = new Map();
profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
const self = new Map(), incl = new Map();
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
for (const [id, t] of dt) {
  const n = byId.get(id);
  const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(k, (self.get(k) ?? 0) + t);
  const seen = new Set();
  for (let x = id; x !== undefined; x = parent.get(x)) {
    const m = byId.get(x);
    const kk = `${m.callFrame.functionName || '(anon)'}`;
    if (seen.has(kk)) continue;
    seen.add(kk);
    incl.set(kk, (incl.get(kk) ?? 0) + t);
  }
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${(t / 1000).toFixed(0).padStart(6)} ms  ${k}`).join('\n');
console.log('--- self'); console.log(top(self, 25));
console.log('--- inclusive'); console.log(top(incl, 45));
