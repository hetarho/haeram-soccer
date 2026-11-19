// node m3prof.mjs <bundle> <world.bin> <days> <out.json>: engine-only days; on each settlement day the
// day's engine CPU and the settlement's phase times (wall ms between marks).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [file, world, daysArg, out] = process.argv.slice(2);
const mod = await import(pathToFileURL(file).href);
const side = mod.open(world, false);
const res = [];
for (let n = 0; n < Number(daysArg); n++) {
  globalThis.__mk = [];
  const t = performance.now();
  const row = side.step();
  const wall = performance.now() - t;
  for (const m of globalThis.__mk) {
    const ph = {};
    for (let i = 1; i < m.marks.length; i++) ph[m.marks[i][0]] = +(m.marks[i][1] - m.marks[i - 1][1]).toFixed(1);
    const market = m.marks.at(-1)[1] - m.marks[0][1];
    res.push({ day: row.day, kind: row.kind, engineCpu: +row.engine.toFixed(1), wall: +wall.toFixed(1), market: +market.toFixed(1), clubs: m.clubs, ph });
    console.error(JSON.stringify(res.at(-1)));
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
