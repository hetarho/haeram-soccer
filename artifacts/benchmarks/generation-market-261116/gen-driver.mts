/**
 * Node-level driver for the start flow's world generation (host.ts 'generate' → generateHistory
 * with seasonDigest per season, clubListings/tierFortune, then takeOver + initializeReadModels).
 * Usage (repo root): pnpm exec tsx artifacts/benchmarks/generation-market-261116/gen-driver.mts [decade=1950] [seed=generation-reference] [--hash] [--no-takeover]
 * --until=<season> (or UNTIL=<season>) stops early for a quick hash check, without the takeover. WT=<checkout> measures another tree.
 */
import { createHash } from 'node:crypto';
const ROOT = process.env.WT ?? new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const decade = Number(args[0] ?? 1950);
const seed = args[1] ?? 'generation-reference';
const { historyWorld, liveHistory } = await import(`${ROOT}/packages/engine/src/history.ts`);
const { seasonFrom } = await import(`${ROOT}/packages/engine/src/wartime.ts`);
const { seasonDigest } = await import(`${ROOT}/packages/engine/src/generation-digest.ts`);
const { clubListings } = await import(`${ROOT}/packages/engine/src/listing.ts`);
const { tierFortune } = await import(`${ROOT}/packages/engine/src/club-value.ts`);
const { takeOver } = await import(`${ROOT}/packages/engine/src/takeover.ts`);
const { initializeReadModels } = await import(`${ROOT}/packages/engine/src/read-models.ts`);

const t0 = performance.now();
const w = historyWorld(seed);
const tInit = performance.now() - t0;
console.log(`historyWorld ${tInit.toFixed(0)} ms clubs=${w.clubs.length} players=${w.players.length}`);
let last = performance.now();
const seasons: { season: number; ms: number; digestMs: number; players: number; heapMB: number }[] = [];
const untilArg = process.argv.find((a) => a.startsWith("--until="))?.slice("--until=".length) ?? process.env.UNTIL;
const until = untilArg ? Number(untilArg) : seasonFrom(decade);
liveHistory(w, until, (season: number, world: any) => {
  const d0 = performance.now();
  seasonDigest(world);
  const now = performance.now();
  const row = {
    season,
    ms: Math.round(d0 - last),
    digestMs: Math.round(now - d0),
    players: world.players.length,
    heapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
  };
  seasons.push(row);
  console.log(JSON.stringify(row));
  last = performance.now();
});
const genMs = performance.now() - t0;
const l0 = performance.now();
const listings = clubListings(w, 'oil');
const fortune = tierFortune(w, 'oil');
const listMs = performance.now() - l0;
let hashHex = '';
if (flags.has('--hash')) {
  hashHex = createHash('sha256').update(JSON.stringify(w)).digest('hex');
}
let takeMs = 0;
if (!flags.has('--no-takeover') && !untilArg) {
  const club = listings.find((l: any) => l.affordable) ?? listings[0];
  const k0 = performance.now();
  const career = takeOver(w, club.clubId, { tier: 'oil', traits: [], decade, seed }, undefined, undefined);
  initializeReadModels(career);
  takeMs = performance.now() - k0;
}
const per = seasons.map((s) => s.ms + s.digestMs);
console.log(
  JSON.stringify({
    decade,
    seed,
    seasons: seasons.length,
    initMs: Math.round(tInit),
    generationMs: Math.round(genMs),
    perSeasonMeanMs: Math.round(per.reduce((a, b) => a + b, 0) / per.length),
    listingsMs: Math.round(listMs),
    takeoverMs: Math.round(takeMs),
    listings: listings.length,
    fortune: String(fortune),
    worldHash: hashHex || undefined,
  }),
);
