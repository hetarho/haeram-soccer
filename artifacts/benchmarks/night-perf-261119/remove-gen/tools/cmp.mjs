// node cmp.mjs <base.json> <variant.json> [label]: game-visible differences of two gstats outputs.
import { readFileSync } from 'node:fs';
const [bf, vf, label = vf] = process.argv.slice(2);
const B = JSON.parse(readFileSync(bf, 'utf8')),
  V = JSON.parse(readFileSync(vf, 'utf8'));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f = (x, d = 1) => (typeof x === 'number' ? x.toFixed(d) : String(x));
const out = { label };
out.genCpuS = [B.generationCpuMs / 1000, V.generationCpuMs / 1000].map((x) => +x.toFixed(1));
out.genWallS = [B.generationWallMs / 1000, V.generationWallMs / 1000].map((x) => +x.toFixed(1));
out.cpuRatio = +(V.generationCpuMs / B.generationCpuMs).toFixed(3);
const seasonsV = new Map(V.seasons.map((s) => [s.season, s]));
out.perSeason = B.seasons.map((s) => [s.season, s.cpuMs, seasonsV.get(s.season)?.cpuMs ?? null]);
const years = Object.keys(V.moves).filter((y) => B.moves[y]);
const mv = (M, k) => +mean(years.map((y) => M[y][k])).toFixed(0);
out.movesPerSeason = Object.fromEntries(['fee', 'loan', 'free', 'total'].map((k) => [k, [mv(B.moves, k), mv(V.moves, k)]]));
const postwar = years.filter((y) => +y >= 1946);
out.movesPostwar = Object.fromEntries(['fee', 'total'].map((k) => [k, [+mean(postwar.map((y) => B.moves[y][k])).toFixed(0), +mean(postwar.map((y) => V.moves[y][k])).toFixed(0)]]));
const W = (k) => [B.world[k], V.world[k]];
for (const k of ['squadPlayers', 'squadMedian', 'squadP90', 'squadMax', 'freeAgents', 'people', 'playerRecords']) out[k] = W(k);
out.jsonMB = W('jsonBytes').map((x) => +(x / 1048576).toFixed(1));
out.tiers = {};
for (const t of Object.keys(B.world.tiers).slice(0, 4)) {
  const b = B.world.tiers[t],
    v = V.world.tiers[t] ?? {};
  out.tiers[t] = Object.fromEntries(['meanOvr', 'sdOvr', 'meanXiOvr', 'meanStrength', 'sdStrength', 'squadMedian'].map((k) => [k, [b[k], v[k]]]));
}
// Top flight (tier 0) strength spread per country, from the 1950 clubs.
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const spread = (C) => {
  const by = new Map();
  for (const [id, c] of Object.entries(C)) if (c.t === 0) { const k = id.split(':')[0]; (by.get(k) ?? by.set(k, []).get(k)).push(c.s); }
  const rows = [...by.values()].map((s) => s.sort((a, b) => b - a)).map((s) => ({ top: s[0], top4: mean(s.slice(0, 4)), range: s[0] - s.at(-1), sd: sd(s) }));
  return Object.fromEntries(['top', 'top4', 'range', 'sd'].map((k) => [k, +mean(rows.map((r) => r[k])).toFixed(2)]));
};
const sb = spread(B.clubs), sv = spread(V.clubs);
out.topFlight = Object.fromEntries(Object.keys(sb).map((k) => [k, [sb[k], sv[k]]]));
// Champions and final tables.
const ck = Object.keys(B.champions).filter((k) => k in V.champions);
out.championsSame = `${ck.filter((k) => B.champions[k] === V.champions[k]).length}/${ck.length}`;
const tk = Object.keys(B.tables).filter((k) => k in V.tables);
const disp = (keys) => {
  let same = 0,
    sum = 0,
    n = 0;
  for (const k of keys) {
    const a = B.tables[k],
      b = V.tables[k];
    if (a[0] === b[0]) same++;
    const pos = new Map(b.map((id, i) => [id, i]));
    for (const [i, id] of a.entries()) if (pos.has(id)) (sum += Math.abs(pos.get(id) - i)), n++;
  }
  return { winnersSame: `${same}/${keys.length}`, meanRankShift: +(sum / Math.max(1, n)).toFixed(2) };
};
const top = tk.filter((k) => k.split(':')[2] === '0');
out.tablesTop = disp(top);
out.tablesAll = disp(tk);
const lastYear = Math.max(...tk.map((k) => +k.split(':')[0]));
out.tablesTopLast = { year: lastYear, ...disp(top.filter((k) => +k.split(':')[0] === lastYear)) };
// Strength and XI of the same clubs in 1950.
const ids = Object.keys(B.clubs).filter((id) => V.clubs[id]);
const dS = ids.map((id) => Math.abs(B.clubs[id].s - V.clubs[id].s));
out.clubStrengthAbsDiff = +mean(dS).toFixed(2);
out.xiOverlap = +mean(ids.map((id) => {
  const a = new Set(B.clubs[id].xi);
  return V.clubs[id].xi.filter((x) => a.has(x)).length / 11;
})).toFixed(3);
out.xiSameOrder = `${ids.filter((id) => B.clubs[id].xi.join() === V.clubs[id].xi.join()).length}/${ids.length}`;
console.log(JSON.stringify(out));
