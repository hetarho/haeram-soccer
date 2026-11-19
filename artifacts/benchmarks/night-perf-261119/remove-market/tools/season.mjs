// node season.mjs <bundle> <world.bin> <out.json> [host 0|1]: one side lives the world's season to
// its last league round (engine only by default), per-day CPU by kind, then the season's stats.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [file, world, out, hostArg = '0'] = process.argv.slice(2);
const mod = await import(pathToFileURL(file).href);
const side = mod.open(world, hostArg === '1');
const w = side.w;
const year = w.year;
const rows = [];
const t0 = mod.cpu();
while (w.year === year && w.round < mod.ROUNDS) rows.push(side.step());
const cpu = mod.cpu() - t0;
const byKind = {};
for (const r of rows) {
  const k = (byKind[r.kind] ??= { n: 0, engine: 0, view: 0 });
  k.n++;
  k.engine += r.engine;
  k.view += (r.view ?? 0) + (r.publish ?? 0) + (r.post ?? 0);
}
const stats = mod.stats(w);
writeFileSync(out, JSON.stringify({ world, days: rows.length, cpu, byKind, rows, stats }, null, 1));
console.error('done', out, 'days', rows.length, 'cpu', cpu.toFixed(0));
