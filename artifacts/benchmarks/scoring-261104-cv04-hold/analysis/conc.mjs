// T689 cv04-hold: node conc.mjs FILE… — one markdown row per concentration report
// (`scripts/scoring-concentration.ts`): goals, shots, hat-tricks, the club top-scorer share with its
// seed-cluster interval, his shot share and conversion against the rest's, the ST and CM slots.
import { existsSync, readFileSync } from 'node:fs';

const pct = (x) => (100 * x).toFixed(1);
console.log(
  '| read | matches | goals / match | shots a team | hat-tricks / match | club top-scorer share [95%] | his shot share | his / the rest\'s conversion | top scorer goals / 38 | ST: shots an app., shot share, goal share | CM: shots an app., goal share |',
);
console.log('|---|---:|---:|---:|---:|---|---:|---|---:|---|---|');
for (const f of process.argv.slice(2)) {
  if (!existsSync(f)) {
    console.log(`| ${f} | missing |`);
    continue;
  }
  const c = JSON.parse(readFileSync(f, 'utf8'));
  const g = c.topGoalShare;
  const st = c.positions.find((p) => p.pos === 'ST');
  const cm = c.positions.find((p) => p.pos === 'CM');
  const name = f.split('/').pop().replace(/^conc-/, '').replace(/\.json$/, '');
  console.log(
    `| ${name} | ${c.matches} | ${c.goalsPerMatch.toFixed(2)} | ${c.shotsPerTeam.toFixed(1)} | ${c.hatTricksPerMatch.toFixed(3)} | ${pct(g.mean)} [${pct(g.ci[0])}, ${pct(g.ci[1])}] | ${pct(c.topShotShare.mean)} | ${pct(c.topConversion.mean)} / ${pct(c.restConversion.mean)} | ${c.topGoalsPer38.mean.toFixed(1)} | ${st.shotsPerApp.toFixed(2)}, ${pct(st.shotShare)}, ${pct(st.goalShare)} | ${cm.shotsPerApp.toFixed(2)}, ${pct(cm.goalShare)} |`,
  );
}
