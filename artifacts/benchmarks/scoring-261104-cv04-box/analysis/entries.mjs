// T689 cv04-box: node entries.mjs NAME [PREFIX…] — merges `entries/entries-NAME-*.json` (the
// box-entry diagnostic `scripts/scoring-box-entries.ts`) and prints each row per team a match:
// entries, the share of them followed by a shot in the possession, its goals and xG an entry.
// PREFIX limits the rows (e.g. `how` `first` `howStart`); none prints every group. Goals after an
// entry count once for every entry of their possession, so their share of all goals passes 100%.
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../entries/', import.meta.url);
const [name, ...prefixes] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.startsWith(`entries-${name}-`) && f.endsWith('.json'));
const acc = new Map();
let matches = 0,
  shots = 0,
  goals = 0,
  poss = 0;
for (const f of files) {
  const r = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  // The 4-match smoke runs (`jobs/smoke.json`) are no read.
  if (r.matches < 100) continue;
  matches += r.matches;
  shots += r.shots;
  goals += r.goals;
  poss += r.possessionsWithEntry;
  for (const row of r.rows) {
    const a = acc.get(row.key) ?? { n: 0, shot: 0, goal: 0, xg: 0 };
    a.n += row.n;
    a.shot += row.shot;
    a.goal += row.goal;
    a.xg += row.xg;
    acc.set(row.key, a);
  }
}
const tm = 2 * matches;
const all = acc.get('all');
console.log(
  `${name}: ${files.length} files, ${matches} matches; shots ${(shots / tm).toFixed(2)} a team, goals ${(goals / matches).toFixed(2)} a match; ` +
    `box entries ${(all.n / tm).toFixed(2)} a team in ${(poss / tm).toFixed(2)} possessions (${(all.n / poss).toFixed(2)} an entering possession); ` +
    `goals after an entry ${((100 * all.goal) / goals).toFixed(1)}% of all`,
);
const keys = [...acc.keys()]
  .filter((k) => k !== 'all' && (!prefixes.length || prefixes.includes(k.split('|')[0])))
  .sort();
console.log('row | entries a team | of entries % | shot follows % | goals a team | of entry goals % | xG an entry');
for (const k of keys) {
  const a = acc.get(k);
  console.log(
    [
      k,
      (a.n / tm).toFixed(2),
      ((100 * a.n) / all.n).toFixed(1),
      ((100 * a.shot) / a.n).toFixed(1),
      (a.goal / tm).toFixed(3),
      ((100 * a.goal) / all.goal).toFixed(1),
      (a.xg / a.n).toFixed(3),
    ].join(' | '),
  );
}
