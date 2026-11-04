// Holds every candidate career but the given tiers by writing its lock file, so the running
// driver only takes those; `mv` a lock away to release it.
import { closeSync, existsSync, openSync } from 'node:fs';
const [dir, keep] = process.argv.slice(2);
const kept = keep.split(',');
for (const tier of ['local', 'selfmade', 'midsize', 'industrial', 'chaebol', 'oil']) {
  if (kept.includes(tier)) continue;
  for (const seed of [0, 1])
    for (const code of ['ENG', 'ESP', 'FRA', 'GER']) {
      const lock = `${dir}/${tier}-${code}-${seed}.lock`;
      if (!existsSync(lock)) closeSync(openSync(lock, 'w'));
    }
}
