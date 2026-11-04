// T689 cv04-box: node table.mjs NAME… — one markdown row per candidate from its merged
// `entries/entries-NAME-*.json` (the box-entry diagnostic): matches, shots a team, goals a match,
// box entries a team, entering possessions a team, entries made by a carry / a short pass / a pass
// in behind (the decision's `through` kind) a team, the share ending behind the deepest outfielder,
// with fewer than two defending outfielders goal-side and with fewer than two in the box, and the
// share followed by a shot in the possession.
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../entries/', import.meta.url);
console.log(
  '| read | matches | shots a team | goals a match | box entries a team | entering possessions | carry / short / in behind | behind the deepest % | <2 goal-side % | <2 in the box % | shot follows % |',
);
console.log('|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|');
for (const name of process.argv.slice(2)) {
  const files = readdirSync(dir).filter((f) => f.startsWith(`entries-${name}-`) && f.endsWith('.json'));
  const acc = new Map();
  let matches = 0,
    shots = 0,
    goals = 0,
    poss = 0;
  for (const f of files) {
    const r = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (r.matches < 100) continue;
    matches += r.matches;
    shots += r.shots;
    goals += r.goals;
    poss += r.possessionsWithEntry;
    for (const row of r.rows) {
      const a = acc.get(row.key) ?? { n: 0, shot: 0 };
      a.n += row.n;
      a.shot += row.shot;
      acc.set(row.key, a);
    }
  }
  const tm = 2 * matches;
  const n = (k) => acc.get(k)?.n ?? 0;
  const all = n('all');
  const pct = (k) => ((100 * n(k)) / all).toFixed(1);
  console.log(
    `| ${name} | ${matches} | ${(shots / tm).toFixed(2)} | ${(goals / matches).toFixed(2)} | ${(all / tm).toFixed(2)} | ${(poss / tm).toFixed(2)} | ` +
      `${(n('how|carry') / tm).toFixed(1)} / ${(n('how|pass-short') / tm).toFixed(1)} / ${(n('how|pass-through') / tm).toFixed(1)} | ` +
      `${pct('behind|true')} | ${pct('goalSide|<2')} | ${pct('defInBox|<2')} | ${((100 * acc.get('all').shot) / all).toFixed(1)} |`,
  );
}
