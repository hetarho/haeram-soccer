// node impact.mjs <bundle> <world.bin> <out.json> [nextDays=49]: engine-only; lives the world's season
// to its last league round (results + market stats), then on through the close to day <nextDays> of
// the next year (market stats of the new summer window, squads after the close).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [file, world, out, nextArg = '49'] = process.argv.slice(2);
const mod = await import(pathToFileURL(file).href);
const side = mod.open(world, false);
const w = side.w;
const year = w.year;
const rows = [];
const t0 = mod.cpu();
while (w.year === year && w.round < mod.ROUNDS) rows.push(side.step());
const cpu = mod.cpu() - t0;
const stats = mod.stats(w);
const m1 = mod.mstats(w, year);
const rows2 = [];
while (w.year === year || (w.calendar?.day ?? 0) < Number(nextArg)) rows2.push(side.step());
const m2 = mod.mstats(w, year + 1);
const byKind = {};
for (const r of [...rows, ...rows2]) {
  const k = (byKind[r.kind] ??= { n: 0, engine: 0, max: 0 });
  k.n++;
  k.engine += r.engine;
  k.max = Math.max(k.max, r.engine);
}
writeFileSync(out, JSON.stringify({ world, days: rows.length, days2: rows2.length, cpu, cpuAll: mod.cpu() - t0, byKind, rows: [...rows, ...rows2].map((r) => [r.year, r.day, r.kind, +r.engine.toFixed(1)]), stats, m1, m2 }, null, 1));
console.error('done', out, 'days', rows.length, rows2.length, 'cpu', cpu.toFixed(0));
