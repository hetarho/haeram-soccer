// node multicmp.mjs <dir> <tag> <variant...>: per season of multi runs, transfers, squads, spread, results.
import { readFileSync } from 'node:fs';
const [dir, tag, ...vs] = process.argv.slice(2);
const M = Object.fromEntries(vs.map((v) => [v, JSON.parse(readFileSync(`${dir}/multi-${tag}-${v}.json`, 'utf8')).seasons]));
const n = M[vs[0]].length;
const mv = (m, side) => (m.moves['fee:' + side] ?? 0) + (m.moves['loan:' + side] ?? 0);
const ppgDiff = (a, b) => {
  const A = Object.fromEntries(a.pointsSd.map((x) => [x.group, x.ppgSd])), B = Object.fromEntries(b.pointsSd.map((x) => [x.group, x.ppgSd]));
  const d = Object.keys(A).filter((k) => k in B).map((k) => B[k] - A[k]);
  return d.reduce((s, x) => s + x, 0) / d.length;
};
for (let i = 0; i < n; i++) {
  console.log(`-- season ${M[vs[0]][i].year} (transfers: season Y all days; squads/OVR at Y+1 day 49)`);
  for (const v of vs) {
    const s = M[v][i];
    console.log(`${v.padEnd(5)} moves own/other Y ${mv(s.mY, 'own')}/${mv(s.mY, 'other')}, Y+1 summer ${mv(s.mN, 'own')}/${mv(s.mN, 'other')}; size own ${s.mN.sizes.own.mean.toFixed(2)}(${s.mN.sizes.own.min}-${s.mN.sizes.own.max}) other ${s.mN.sizes.other.mean.toFixed(2)}(${s.mN.sizes.other.min}-${s.mN.sizes.other.max}) <18: ${s.mN.sizes.own.under18}/${s.mN.sizes.other.under18}; top14 OVR own ${s.mN.strength.own.mean.toFixed(2)} other ${s.mN.strength.other.mean.toFixed(2)}; league OVR SD own ${s.mN.leagueStrengthSd.own.toFixed(2)} other ${s.mN.leagueStrengthSd.other.toFixed(2)}; ppgSD ${s.results.meanPpgSd} (paired vs ${vs[0]} ${ppgDiff(M[vs[0]][i].results, s.results).toFixed(3)}); g/m ${s.results.goalsPerMatch} home ${s.results.home} topScorer ${s.results.meanTopScorer}`);
  }
}
