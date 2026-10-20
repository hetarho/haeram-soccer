/**
 * Seconds per simulated season on the century benchmark's baseline world (T224, →MATCH-22).
 * `pnpm exec tsx scripts/season-throughput.ts [--seasons N] [--own-league summary|grid]`
 * Also runs unchanged on older trees, where the own-league switch does not exist.
 */
import { createWorld, simulateSeason } from '../packages/engine/src/index';
import * as match from '../packages/engine/src/match';

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
const seasons = Number(arg('--seasons') ?? 5);
const ownLeague = arg('--own-league');
if (!Number.isSafeInteger(seasons) || seasons < 1) throw new Error('--seasons takes a count');
if (ownLeague !== undefined) {
  if (ownLeague !== 'grid' && ownLeague !== 'summary')
    throw new Error('--own-league takes grid or summary');
  const set = (match as { setOwnLeagueEngine?: (engine: 'grid' | 'summary') => void })
    .setOwnLeagueEngine;
  if (!set) throw new Error('this tree has no own-league switch');
  set(ownLeague);
}
const w = createWorld({
  country: 'ENG',
  name: 'Century Athletic',
  color: '#284e35',
  seed: 'release-century-baseline',
  level: 'easy',
});
const times: number[] = [];
for (let n = 0; n < seasons; n++) {
  const start = performance.now();
  simulateSeason(w);
  times.push((performance.now() - start) / 1000);
}
const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
console.log(
  JSON.stringify({
    ownLeague: ownLeague ?? 'default',
    seasons,
    secondsPerSeason: Number(mean.toFixed(2)),
    perSeason: times.map((t) => Number(t.toFixed(2))),
    node: process.version,
  }),
);
