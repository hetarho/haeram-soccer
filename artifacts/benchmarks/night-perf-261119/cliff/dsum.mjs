// Per day kind: thread CPU (engine+view+publish+post) and wall (from..to) mean/max from days2 JSON outputs.
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const { rows } = JSON.parse(readFileSync(f, 'utf8'));
  const by = {};
  let wallSum = 0, cpuSum = 0;
  for (const r of rows.slice(1)) {
    const k = (by[r.kind] ??= { n: 0, cpu: [], wall: [] });
    const c = r.engine + r.view + r.publish + r.post, w = (r.to - r.from) / 1000;
    k.n++; k.cpu.push(c); k.wall.push(w); wallSum += w; cpuSum += c;
  }
  const s = (a) => `${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0)}/${Math.max(...a).toFixed(0)}`;
  console.log(f.split('/').pop().padEnd(32), `total cpu ${(cpuSum / 1000).toFixed(1)}s wall ${(wallSum / 1000).toFixed(1)}s |`, Object.entries(by).map(([k, v]) => `${k}[${v.n}] cpu ${s(v.cpu)} wall ${s(v.wall)}`).join(' | '));
}
