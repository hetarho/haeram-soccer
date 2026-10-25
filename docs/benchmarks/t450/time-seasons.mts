// T450: times one more candidate season of kept worlds (docs/benchmarks/t450/build-worlds.mts) and
// prints a sha256 of each world after it, so a cut that changes the football shows as a new digest.
// Run under `node --cpu-prof` (via tsx's loader) it profiles the season instead.
// usage: pnpm exec tsx docs/benchmarks/t450/time-seasons.mts <reps> <world.json> [<world.json>…]
//   Each listed world is played `reps` times, round-robin, each time from a fresh parse of its file;
//   the first world listed is also played once untimed first, to warm the JIT.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { World } from '../../../packages/contracts/src/types';
import { simulateSeason } from '../../../packages/engine/src/index';

const [repsArg = '1', ...files] = process.argv.slice(2);
const reps = Number(repsArg);
const raw = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));
const play = (file: string) => {
  const w = JSON.parse(raw.get(file)!) as World;
  const start = performance.now();
  simulateSeason(w);
  const ms = performance.now() - start;
  return { ms, digest: createHash('sha256').update(JSON.stringify(w)).digest('hex'), w };
};
if (reps > 0 && files[0]) {
  const warm = play(files[0]);
  console.log(JSON.stringify({ warmup: files[0], ms: Math.round(warm.ms) }));
}
for (let rep = 0; rep < Math.max(1, reps); rep++)
  for (const file of files) {
    const { ms, digest, w } = play(file);
    console.log(
      JSON.stringify({ file, rep, year: w.year, history: w.history.length, ms: Math.round(ms), digest }),
    );
  }
