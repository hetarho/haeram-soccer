import { readFileSync } from 'node:fs';
const [dir, ...vs] = process.argv.slice(2);
const S = Object.fromEntries(vs.map((v) => [v, JSON.parse(readFileSync(`${dir}/season-${v}.json`, 'utf8'))]));
const row = (label, f) => console.log(label.padEnd(30), vs.map((v) => String(f(S[v])).padStart(12)).join(''));
console.log(''.padEnd(30), vs.map((v) => v.padStart(12)).join(''));
row('days', (s) => s.days);
row('engine CPU s (season)', (s) => (s.cpu / 1000).toFixed(1));
row('round-own mean ms', (s) => (s.byKind['round-own'].engine / s.byKind['round-own'].n).toFixed(0));
row('market mean ms', (s) => (s.byKind.market.engine / s.byKind.market.n).toFixed(0));
row('other mean ms', (s) => (s.byKind.other.engine / s.byKind.other.n).toFixed(1));
row('league matches', (s) => s.stats.leagueMatches);
row('goals/match', (s) => s.stats.goalsPerMatch);
row('home', (s) => s.stats.home);
row('draw', (s) => s.stats.draw);
row('away', (s) => s.stats.away);
row('mean points/game SD per league', (s) => s.stats.meanPpgSd);
row('mean league top scorer', (s) => s.stats.meanTopScorer);
row('mean top-5 scorers sum', (s) => (s.stats.scorers.reduce((a, x) => a + x.top5, 0) / s.stats.scorers.length).toFixed(1));
row('appearances (league)', (s) => s.stats.appearances);
row('starts', (s) => s.stats.starts);
row('players with minutes', (s) => s.stats.playersWithMinutes);
row('yellow cards (league)', (s) => s.stats.yellow);
row('NPC injured now', (s) => s.stats.npcInjured);
for (const pos of ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WG', 'ST', 'DF', 'MF', 'FW', 'LB', 'RB', 'CF', 'LW', 'RW']) {
  if (!S[vs[0]].stats.positions[pos]) continue;
  for (const k of ['passes', 'completed', 'tackles', 'interceptions', 'dribbles', 'shots', 'goals', 'assists', 'saves', 'd.keyPasses', 'd.progressivePasses', 'd.fouls', 'd.foulsWon', 'd.offsides', 'd.highTurnovers']) {
    const x = S[vs[0]].stats.positions[pos][k];
    if (!x) continue;
    row(`${pos} ${k}/90 mean (sd)`, (s) => { const y = s.stats.positions[pos]?.[k]; return y ? `${y.mean.toFixed(2)}(${y.sd.toFixed(2)})` : '-'; });
  }
}
row('players >=900min by pos', (s) => Object.entries(s.stats.positions).map(([p, k]) => p + ':' + (k.passes?.n ?? 0)).join(' '));
