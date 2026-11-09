// T689 cv04-own: node own.mjs FILE… — the `own|…` rows of `scripts/scoring-chased-shots.ts` reports, a line a row:
// shots a team a match, conversion, recorded xG a shot and its factors, the decision's chance, metres carried
// after the decision, the share with a free teammate, the best alternative's chance and how often it beat the shot.
import { readFileSync } from 'node:fs';

const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '-');
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const teams = r.matches * 2;
  console.log(`${file} matches ${r.matches} rebuilt ${r.rebuilt} matched ${r.matched}`);
  for (const row of r.rows.filter((x) => x.key.startsWith('own|')).sort((a, b) => a.key.localeCompare(b.key))) {
    const m = (k) => (row[k] ?? 0) / row.n;
    console.log(
      [
        row.key.padEnd(26),
        `n ${String(row.n).padStart(5)}`,
        `/team ${(row.n / teams).toFixed(2)}`,
        `conv ${(100 * m('goals')).toFixed(1)}%`,
        `xg ${f3(m('xg'))}`,
        `place ${f3(m('place'))}`,
        `pf ${f3(m('pressureFactor'))}`,
        `narrow ${f3(m('narrow'))}`,
        `close ${f3(m('unblockedClose'))}`,
        `path ${f3(m('unblockedPath'))}`,
        `dec ${f3(m('decision'))}`,
        `decNarrow ${f3(m('decisionNarrow'))}`,
        `decClose ${f3(m('decisionClose'))}`,
        `stride ${(100 * m('kick')).toFixed(0)}%`,
        `carried ${m('carried').toFixed(2)}m`,
        `free ${(100 * m('withFree')).toFixed(0)}%`,
        `alt ${f3(m('alt'))}`,
        `altBetter ${(100 * m('altBetter')).toFixed(0)}%`,
        `decRec ${f3(m('decisionRecorded'))}`,
        `altBetterRec ${(100 * m('altBetterRecorded')).toFixed(0)}%`,
        `clear ${(100 * m('clear')).toFixed(0)}%`,
      ].join(' | '),
    );
  }
}
