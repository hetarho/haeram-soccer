// T689 cv04-sit: node tactics.mjs FILE… — MATCH-29 rows of a `grid-bands.ts --report --only tactics`
// (or `--conditions tactics:press-counter,tactics:counter-press`) report: press v counter's
// win-share gap pooled over both venues with a normal-approximation 95% interval (computed here from
// the two conditions' outcome shares, so it reads a two-condition report too), the report's own
// MATCH-29 rows when all 16 pairings ran, goals and hat-tricks a match.
import { existsSync, readFileSync } from 'node:fs';

const f2 = (x) => (x >= 0 ? '+' : '') + x.toFixed(3);
console.log(
  '| read | matches press v counter | press win share − counter\'s [95%] | press points vs the mean | counter points vs the mean | MATCH-29 inside / outside / insufficient | goals a match, pairings run | press–press / press–counter / counter–press goals | hat-tricks a match, pairings run / with press |',
);
console.log('|---|---:|---|---:|---:|---|---:|---|---|');
for (const f of process.argv.slice(2)) {
  if (!existsSync(f)) {
    console.log(`| ${f} | missing |`);
    continue;
  }
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const cond = (a, b) => d.conditions.find((c) => c.condition === `tactics:${a}-${b}`);
  const all = d.conditions.filter((c) => c.family === 'tactics');
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const press = all.filter((c) => c.condition.includes('press'));
  // Pooled press − counter win share: per match +1 press win, −1 counter win, 0 draw.
  const pc = cond('press', 'counter'),
    cp = cond('counter', 'press');
  const arms = [
    [pc.outcome.homeWin.share, pc.outcome.awayWin.share, pc.matches],
    [cp.outcome.awayWin.share, cp.outcome.homeWin.share, cp.matches],
  ];
  const n = arms.reduce((a, x) => a + x[2], 0);
  const m = arms.reduce((a, [p, c, k]) => a + (p - c) * k, 0) / n;
  const v = arms.reduce((a, [p, c, k]) => a + (p + c - (p - c) ** 2) * k, 0) / n;
  const h = 1.96 * Math.sqrt(v / n);
  const rows = d.tacticPairings?.rows ?? [];
  const row = (id) => rows.find((r) => r.id === id);
  const s = all.length === 16 ? d.tacticPairings.summary : null;
  const pts = (id) => (all.length === 16 && row(id) ? f2(row(id).value) : '-');
  const name = f.split('/').pop().replace(/\.json$/, '');
  const goals = (a, b) => (cond(a, b) ? cond(a, b).goals.mean.toFixed(2) : '-');
  console.log(
    `| ${name} | ${n} | ${f2(m)} [${f2(m - h)}, ${f2(m + h)}] | ${pts('points:press')} | ${pts('points:counter')} | ${s ? `${s.inside} / ${s.outside} / ${s.insufficient}` : '-'} | ${mean(all.map((c) => c.goals.mean)).toFixed(2)} | ${goals('press', 'press')} / ${goals('press', 'counter')} / ${goals('counter', 'press')} | ${mean(all.map((c) => c.concentration.hatTricksPerMatch)).toFixed(3)} / ${mean(press.map((c) => c.concentration.hatTricksPerMatch)).toFixed(3)} |`,
  );
}
