// T689 cv04: markdown rows of the screens — band check (grid-bands.ts --candidate) and, when run,
// the concentration decomposition.
//   node table.mjs ART_DIR BANDS_DIR name[@N][:part] ...
import { existsSync, readFileSync } from 'node:fs';

const [art, logs, ...names] = process.argv.slice(2);
const pct = (x) => (100 * x).toFixed(1);
const row = (text, key) => {
  const line = text.split('\n').find((l) => l.startsWith(key));
  if (!line) return '-';
  const [, value, ok] = line.slice(32).trim().split(/\s+/);
  return ok === 'FAIL' ? `${value}✗` : value;
};
console.log(
  '| candidate | band matches | shots a team | xG a shot | goal area / box / outside % | poss. ending in a shot % | goals | pen. goals % | FW / MF goals % | rows inside | unopposed a team (scored) | conc. goals / shots | hat-tricks | club top-scorer share [95%] | ST shots, goals % | CM goals % |',
);
console.log('|---|---:|---:|---:|---|---:|---:|---:|---|---:|---|---|---:|---|---|---:|');
for (const spec0 of names) {
  const [spec, part = 'calibration'] = spec0.split(':');
  const [name, size = '400'] = spec.split('@');
  // The run's logs are `.log`; the evidence keeps them as `.txt` (`*.log` is gitignored).
  const log = [`${logs}/bands-${name}-${size}.log`, `${logs}/bands-${name}-${size}.txt`].find(
    existsSync,
  );
  const t = log ? readFileSync(log, 'utf8') : '';
  const un = t.match(/unopposed chances ([0-9.]+) a team \(([0-9.]+)% of shots\), scored ([0-9.]+)%/);
  let file = `${art}/conc-${name}-${part}.json`;
  if (!existsSync(file) && name === 'ctl')
    file = `${art}/../scoring-261104-nx04/conc-arrHoldEZ60-${part}.json`;
  let conc = ['-', '-', '-', '-', '-'];
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    const st = c.positions.find((p) => p.pos === 'ST');
    const cm = c.positions.find((p) => p.pos === 'CM');
    const g = c.topGoalShare;
    conc = [
      `${c.goalsPerMatch.toFixed(2)} / ${c.shotsPerTeam.toFixed(1)}`,
      c.hatTricksPerMatch.toFixed(3),
      `${pct(g.mean)} [${pct(g.ci[0])}, ${pct(g.ci[1])}]`,
      `${pct(st.shotShare)}, ${pct(st.goalShare)}`,
      pct(cm.goalShare),
    ];
  }
  console.log(
    `| ${name}${part === 'calibration' ? '' : ` (${part})`} | ${t ? size : '-'} | ${row(t, 'shots (team)')} | ${row(t, 'xG per shot')} | ${row(t, 'shots from goal area')} / ${row(t, 'shots from rest of box')} / ${row(t, 'shots from outside')} | ${row(t, 'possessions ending in a shot')} | ${row(t, 'goals (match)')} | ${row(t, 'penalty goals')} | ${row(t, 'goals by FW')} / ${row(t, 'goals by MF')} | ${t.match(/passed (\d+\/\d+)/)?.[1] ?? '-'} | ${un ? `${un[1]} (${un[3]}%)` : '-'} | ${conc.join(' | ')} |`,
  );
}
