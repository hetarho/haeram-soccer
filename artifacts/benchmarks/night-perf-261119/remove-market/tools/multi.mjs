// node multi.mjs <bundle> <world.bin> <seasons> <out.json>: engine-only, several seasons; per season the
// results at its last round and the market/squad stats at day 49 of the next year (after the summer window).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [file, world, nArg, out] = process.argv.slice(2);
const mod = await import(pathToFileURL(file).href);
const side = mod.open(world, false);
const w = side.w;
const Y0 = w.year;
const seasons = [];
const t0 = mod.cpu();
for (let y = 0; y < Number(nArg); y++) {
  const year = Y0 + y;
  while (w.year === year && w.round < mod.ROUNDS) side.step();
  const s = mod.stats(w);
  const mY = mod.mstats(w, year);
  while (w.year === year || (w.calendar?.day ?? 0) < 49) side.step();
  const mN = mod.mstats(w, year + 1);
  seasons.push({ year, results: { goalsPerMatch: s.goalsPerMatch, home: s.home, draw: s.draw, meanPpgSd: s.meanPpgSd, meanTopScorer: s.meanTopScorer, pointsSd: s.pointsSd, hashes: s.hashes }, mY, mN });
  console.error('season', year, 'cpu', ((mod.cpu() - t0) / 1000).toFixed(1));
}
writeFileSync(out, JSON.stringify({ world, seasons }, null, 1));
