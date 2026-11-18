/**
 * Generation driver with game-visible stats (measurement only).
 *   WT=<tree> OUT=<json> [START=1930] [DECADE=1950] [SEED=generation-reference] pnpm exec tsx gstats.mts
 * Lives the world as the start flow does (historyWorld + liveHistory with seasonDigest per season),
 * timing each season by main-thread CPU and wall; stats work is excluded from the timings. The tree's
 * season.ts must call globalThis.__onClose(w) at closeSeason's start (patch-hook.mjs).
 */
import { writeFileSync } from 'node:fs';
const ROOT = process.env.WT!;
const START = Number(process.env.START ?? 1930);
const decade = Number(process.env.DECADE ?? 1950);
const seed = process.env.SEED ?? 'generation-reference';
const { historyWorld, liveHistory } = await import(`${ROOT}/packages/engine/src/history.ts`);
const { seasonFrom } = await import(`${ROOT}/packages/engine/src/wartime.ts`);
const { seasonDigest } = await import(`${ROOT}/packages/engine/src/generation-digest.ts`);
const { mainOvr } = await import(`${ROOT}/packages/engine/src/player.ts`);
const { MATCH_MODEL_RELEASE } = await import(`${ROOT}/packages/engine/src/match-model.ts`);
const { ranked } = await import(`${ROOT}/packages/engine/src/league-fixtures.ts`);
const worldMod = await import(`${ROOT}/packages/engine/src/world.ts`);

const cpu = () => {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
};
let excluded = 0; // stats CPU spent inside the timed span
const tables: Record<string, string[]> = {};
const moves: Record<number, { fee: number; loan: number; free: number; total: number }> = {};
const squadAtClose: Record<number, { median: number; p90: number; players: number }> = {};
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]!;
};
(globalThis as any).__onClose = (w: any) => {
  const c0 = cpu();
  const groups = new Map<string, any[]>();
  for (const c of w.clubs) {
    if (c.representative || c.id.startsWith('euro:')) continue;
    if (!((w.tables[c.id]?.played ?? 0) > 0)) continue;
    const key = `${w.year}:${c.country}:${c.tier}:${c.group ?? 0}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  for (const [key, clubs] of groups) tables[key] = ranked(w, clubs).map((c: any) => c.id);
  const m = { fee: 0, loan: 0, free: 0, total: 0 };
  for (const r of Object.values<any>(w.playerRecords ?? {}))
    for (const mv of r.moves ?? [])
      if (mv.year === w.year) {
        m.total++;
        if (mv.loan) m.loan++;
        else if (mv.fee !== '0' && mv.from && mv.to) m.fee++;
        else m.free++;
      }
  moves[w.year] = m;
  const sizes = Object.entries<any[]>(w.squads ?? {})
    .filter(([id]) => !w.clubs.find((c: any) => c.id === id)?.representative)
    .map(([, ps]) => ps.length);
  squadAtClose[w.year] = { median: q(sizes, 0.5), p90: q(sizes, 0.9), players: sizes.reduce((a, b) => a + b, 0) };
  excluded += cpu() - c0;
};

const t0 = performance.now(),
  c0 = cpu();
const w = historyWorld(seed, MATCH_MODEL_RELEASE, START);
const initCpu = cpu() - c0,
  initWall = performance.now() - t0;
console.log(`historyWorld(${START}) cpu ${initCpu.toFixed(0)} ms clubs=${w.clubs.length}`);
const seasons: any[] = [];
let lastCpu = cpu(),
  lastWall = performance.now(),
  lastEx = excluded;
liveHistory(w, process.env.UNTIL ? Number(process.env.UNTIL) : seasonFrom(decade), (season: number, world: any) => {
  seasonDigest(world);
  const nowCpu = cpu(),
    nowWall = performance.now();
  const ex = excluded - lastEx;
  const row = {
    season,
    cpuMs: Math.round(nowCpu - lastCpu - ex),
    wallMs: Math.round(nowWall - lastWall - ex),
    players: Object.values<any[]>(world.squads ?? {}).reduce((n, ps) => n + ps.length, 0),
    heapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
  };
  seasons.push(row);
  console.log(JSON.stringify(row));
  lastCpu = cpu();
  lastWall = performance.now();
  lastEx = excluded;
});
worldMod.flushNpcSquads?.(w);
const genCpu = cpu() - c0 - excluded,
  genWall = performance.now() - t0 - excluded;

// Stats on the 1950 world.
const npc = w.clubs.filter((c: any) => !c.representative && w.squads?.[c.id]);
const sizes = npc.map((c: any) => w.squads[c.id].length);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const tiers: Record<number, any> = {};
for (const t of [...new Set(npc.map((c: any) => c.tier))].sort((a: any, b: any) => a - b) as number[]) {
  const cs = npc.filter((c: any) => c.tier === t);
  const ovrs = cs.flatMap((c: any) => w.squads[c.id].map((p: any) => mainOvr(p)));
  const xi = cs.map((c: any) => mean(w.squads[c.id].slice(0, 11).map((p: any) => mainOvr(p))));
  const str = cs.map((c: any) => c.strength);
  tiers[t] = {
    clubs: cs.length,
    meanOvr: +mean(ovrs).toFixed(2),
    sdOvr: +sd(ovrs).toFixed(2),
    meanXiOvr: +mean(xi).toFixed(2),
    meanStrength: +mean(str).toFixed(2),
    sdStrength: +sd(str).toFixed(2),
    squadMedian: q(cs.map((c: any) => w.squads[c.id].length), 0.5),
  };
}
const countries = [...new Set(npc.map((c: any) => c.country))];
const topSpread = countries.map((k) => {
  const s = npc.filter((c: any) => c.country === k && c.tier === 1).map((c: any) => c.strength).sort((a: number, b: number) => b - a);
  return { k, top: s[0], range: s[0] - s.at(-1), top4: mean(s.slice(0, 4)), sd: sd(s) };
}).filter((x) => x.top !== undefined);
const json = JSON.stringify(w);
const champions: Record<string, string> = {};
for (const a of w.history ?? []) for (const ch of a.champions ?? []) champions[`${a.year}:${ch.country}`] = ch.club;
const out = {
  tree: ROOT,
  start: START,
  decade,
  seed,
  initCpuMs: Math.round(initCpu),
  initWallMs: Math.round(initWall),
  generationCpuMs: Math.round(genCpu),
  generationWallMs: Math.round(genWall),
  seasons,
  moves,
  squadAtClose,
  world: {
    npcClubs: npc.length,
    squadPlayers: sizes.reduce((a: number, b: number) => a + b, 0),
    squadMedian: q(sizes, 0.5),
    squadP90: q(sizes, 0.9),
    squadMax: Math.max(...sizes),
    freeAgents: (w.freeAgents ?? []).length,
    people: Object.keys(w.people ?? {}).length,
    playerRecords: Object.keys(w.playerRecords ?? {}).length,
    jsonBytes: Buffer.byteLength(json),
    tiers,
    tier1: {
      meanTopStrength: +mean(topSpread.map((x) => x.top)).toFixed(2),
      meanTop4: +mean(topSpread.map((x) => x.top4)).toFixed(2),
      meanRange: +mean(topSpread.map((x) => x.range)).toFixed(2),
      meanSd: +mean(topSpread.map((x) => x.sd)).toFixed(2),
    },
  },
  champions,
  tables,
  clubs: Object.fromEntries(
    npc.map((c: any) => [c.id, { t: c.tier, s: c.strength, n: w.squads[c.id].length, xi: w.squads[c.id].slice(0, 11).map((p: any) => p.id) }]),
  ),
};
writeFileSync(process.env.OUT!, JSON.stringify(out));
console.log(
  JSON.stringify({ start: START, generationCpuMs: out.generationCpuMs, generationWallMs: out.generationWallMs, ...out.world, tiers: undefined }),
);
