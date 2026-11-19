// node impcmp.mjs <dir> <world tag> <variant...>: compare impact runs imp-<tag>-<v>.json.
import { readFileSync, existsSync } from 'node:fs';
const [dir, tag, ...vs] = process.argv.slice(2);
const S = Object.fromEntries(vs.filter((v) => existsSync(`${dir}/imp-${tag}-${v}.json`)).map((v) => [v, JSON.parse(readFileSync(`${dir}/imp-${tag}-${v}.json`, 'utf8'))]));
const V = Object.keys(S);
const row = (label, f) => console.log(label.padEnd(44), V.map((v) => { try { return String(f(S[v])).padStart(16); } catch { return '-'.padStart(16); } }).join(''));
console.log(''.padEnd(44), V.map((v) => v.padStart(16)).join(''));
const mv = (m, from = 0) => Object.entries(m.byDay).filter(([d]) => Number(d) >= from).reduce((s, [, n]) => s + n, 0);
row('engine CPU s, day 8 to last round', (s) => (s.cpu / 1000).toFixed(1));
row('engine CPU s, to next year day 49', (s) => (s.cpuAll / 1000).toFixed(1));
row('settlement days (market kind) n', (s) => s.byKind.market?.n ?? 0);
row('market day mean / max engine ms', (s) => `${(s.byKind.market.engine / s.byKind.market.n).toFixed(0)} / ${s.byKind.market.max.toFixed(0)}`);
row('close day engine ms', (s) => s.byKind.close.engine.toFixed(0));
row('round-own mean / max ms', (s) => `${(s.byKind['round-own'].engine / s.byKind['round-own'].n).toFixed(0)} / ${s.byKind['round-own'].max.toFixed(0)}`);
row('market days (engine ms)', (s) => s.rows.filter((r) => r[2] === 'market' || r[2] === 'close').map((r) => `${r[1]}:${Math.round(r[3])}`).join(' '));
row('NPC transfers Y (day>=8)', (s) => mv(s.m1, 8));
row('  by settlement day', (s) => Object.entries(s.m1.byDay).filter(([d]) => Number(d) >= 8).map(([d, n]) => `${d}:${n}`).join(' '));
row('NPC transfers Y+1 summer (to day 49)', (s) => mv(s.m2));
row('  by day', (s) => Object.entries(s.m2.byDay).map(([d, n]) => `${d}:${n}`).join(' '));
row('Y+1 summer moves own/other (fee+loan)', (s) => `${(s.m2.moves['fee:own'] ?? 0) + (s.m2.moves['loan:own'] ?? 0)}/${(s.m2.moves['fee:other'] ?? 0) + (s.m2.moves['loan:other'] ?? 0)}`);
row('Y moves own/other (all days)', (s) => `${(s.m1.moves['fee:own'] ?? 0) + (s.m1.moves['loan:own'] ?? 0)}/${(s.m1.moves['fee:other'] ?? 0) + (s.m1.moves['loan:other'] ?? 0)}`);
row('Y fees paid (bn)', (s) => (Number(BigInt(s.m1.feeSum) / 1000000n) / 1000).toFixed(1));
for (const [lab, k] of [['last round', 'm1'], ['Y+1 day 49', 'm2']]) {
  row(`squad size own mean(min-max) @${lab}`, (s) => `${s[k].sizes.own.mean.toFixed(2)}(${s[k].sizes.own.min}-${s[k].sizes.own.max})`);
  row(`squad size other mean(min-max) @${lab}`, (s) => `${s[k].sizes.other.mean.toFixed(2)}(${s[k].sizes.other.min}-${s[k].sizes.other.max})`);
  row(`top-14 OVR own mean(sd) @${lab}`, (s) => `${s[k].strength.own.mean.toFixed(2)}(${s[k].strength.own.sd.toFixed(2)})`);
  row(`top-14 OVR other mean(sd) @${lab}`, (s) => `${s[k].strength.other.mean.toFixed(2)}(${s[k].strength.other.sd.toFixed(2)})`);
  row(`within-league OVR SD own/other @${lab}`, (s) => `${s[k].leagueStrengthSd.own.toFixed(2)}/${s[k].leagueStrengthSd.other.toFixed(2)}`);
  row(`squads hash @${lab}`, (s) => s[k].hashSquads);
}
row('goals/match', (s) => s.stats.goalsPerMatch);
row('home/draw/away', (s) => `${s.stats.home}/${s.stats.draw}/${s.stats.away}`);
row('mean ppg SD per league', (s) => s.stats.meanPpgSd);
row('mean league top scorer', (s) => s.stats.meanTopScorer);
for (const h of Object.keys(S[V[0]].stats.hashes)) row('hash ' + h, (s) => s.stats.hashes[h] + (s.stats.hashes[h] === S[V[0]].stats.hashes[h] ? ' =' : ' x'));
