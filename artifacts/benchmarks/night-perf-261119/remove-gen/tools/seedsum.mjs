// node seedsum.mjs <dir> <tags,> <variants,>: per variant, CPU ratio vs the same batch's base and
// 1950 distribution deltas per seed (variant − base), averaged over seeds.
import { readFileSync, existsSync } from 'node:fs';
const [dir, tagsArg, varsArg] = process.argv.slice(2);
const tags = tagsArg.split(','),
  vars = varsArg.split(',');
const load = (t, v) => {
  const f = `${dir}/${t}-${v}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const topFlight = (C) => {
  const by = new Map();
  for (const [id, c] of Object.entries(C)) if (c.t === 0) { const k = id.split(':')[0]; (by.get(k) ?? by.set(k, []).get(k)).push(c.s); }
  const rows = [...by.values()].map((s) => s.sort((a, b) => b - a));
  return { top: mean(rows.map((s) => s[0])), range: mean(rows.map((s) => s[0] - s.at(-1))), sd: mean(rows.map(sd)) };
};
const facts = (J) => {
  const ys = Object.keys(J.moves);
  const tf = topFlight(J.clubs);
  return {
    cpu: J.generationCpuMs / 1000,
    transfers: mean(ys.map((y) => J.moves[y].fee + J.moves[y].loan)),
    sqMed: J.world.squadMedian,
    sqP90: J.world.squadP90,
    sqMax: J.world.squadMax,
    players: J.world.squadPlayers,
    people: J.world.people,
    jsonMB: J.world.jsonBytes / 1048576,
    t0str: J.world.tiers[0].meanStrength,
    t0ovr: J.world.tiers[0].meanOvr,
    t1str: J.world.tiers[1].meanStrength,
    t3str: J.world.tiers[3]?.meanStrength,
    t3ovr: J.world.tiers[3]?.meanOvr,
    t0sd: J.world.tiers[0].sdStrength,
    top: tf.top,
    range: tf.range,
  };
};
const keys = ['cpu', 'transfers', 'sqMed', 'sqP90', 'sqMax', 'players', 'people', 'jsonMB', 't0str', 't0ovr', 't1str', 't3str', 't3ovr', 't0sd', 'top', 'range'];
const f2 = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2));
const baseF = Object.fromEntries(tags.map((t) => [t, load(t, 'base') && facts(load(t, 'base'))]));
console.log('base per seed: ' + tags.map((t) => `${t} ` + (baseF[t] ? keys.map((k) => `${k}=${f2(baseF[t][k])}`).join(' ') : 'missing')).join('\n               '));
for (const v of vars) {
  const per = tags.map((t) => {
    const J = load(t, v);
    if (!J || !baseF[t]) return undefined;
    const F = facts(J);
    return Object.fromEntries(keys.map((k) => [k, k === 'cpu' ? F.cpu / baseF[t].cpu : F[k] - baseF[t][k]]));
  }).filter(Boolean);
  if (!per.length) continue;
  const parts = keys.map((k) => {
    const xs = per.map((p) => p[k]);
    return `${k}${k === 'cpu' ? '×' : 'Δ'}=${f2(mean(xs))}${xs.length > 1 ? '[' + xs.map(f2).join('/') + ']' : ''}`;
  });
  console.log(`${v.padEnd(5)} n=${per.length} ${parts.join(' ')}`);
}
