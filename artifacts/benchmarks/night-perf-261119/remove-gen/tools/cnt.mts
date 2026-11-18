// WT=<tree> UNTIL=<season> tsx cnt.mts: matchday selections per season.
const ROOT = process.env.WT!;
const { historyWorld, liveHistory } = await import(`${ROOT}/packages/engine/src/history.ts`);
const w = historyWorld(process.env.SEED ?? 'generation-reference');
liveHistory(w, Number(process.env.UNTIL ?? 1933), (season: number) => {
  console.log(season - 1, 'selections', (globalThis as any).__sel);
  (globalThis as any).__sel = 0;
});
