// T689 cv04-sym: markdown rows of the band checks (grid-bands.ts --candidate), with the goal-mix rows
// this window's levers move.   node bands.mjs LOG_DIR name[@N] ...
import { existsSync, readFileSync } from 'node:fs';

const [logs, ...names] = process.argv.slice(2);
const row = (text, key) => {
  const line = text.split('\n').find((l) => l.startsWith(key));
  if (!line) return '-';
  const [, value, ok] = line.slice(32).trim().split(/\s+/);
  return ok === 'FAIL' ? `${value}✗` : value;
};
const cols = [
  ['shots', 'shots (team)'],
  ['xG/shot', 'xG per shot'],
  ['on target %', 'on target %'],
  ['poss. → shot %', 'possessions ending in a shot'],
  ['goal area %', 'shots from goal area'],
  ['goals', 'goals (match)'],
  ['set-piece %', 'set-piece goals'],
  ['pen. %', 'penalty goals'],
  ['headed %', 'headed goals'],
  ['FW %', 'goals by FW'],
  ['MF %', 'goals by MF'],
  ['DF %', 'goals by DF'],
  ['corners', 'corners (team)'],
];
console.log(`| candidate | ${cols.map((c) => c[0]).join(' | ')} | rows inside | unopposed (scored) |`);
console.log(`|---|${cols.map(() => '---:').join('|')}|---:|---|`);
for (const spec of names) {
  const [name, size = '400'] = spec.split('@');
  const log = [`${logs}/bands-${name}-${size}.log`, `${logs}/bands-${name}-${size}.txt`].find(existsSync);
  const t = log ? readFileSync(log, 'utf8') : '';
  const un = t.match(/unopposed chances ([0-9.]+) a team \(([0-9.]+)% of shots\), scored ([0-9.]+)%/);
  console.log(
    `| ${name} | ${cols.map((c) => row(t, c[1])).join(' | ')} | ${t.match(/passed (\d+\/\d+)/)?.[1] ?? '-'} | ${un ? `${un[1]} (${un[3]}%)` : '-'} |`,
  );
}
