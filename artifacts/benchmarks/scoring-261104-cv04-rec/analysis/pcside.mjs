// T689 cv04-rec: node pcside.mjs FILE… — press v counter per side from a `pc-*.json` report
// (`--conditions tactics:press-counter,tactics:counter-press`), pooled over both venues: the win-share
// gap (as cv04-sit's `tactics.mjs`), each side's goals, shots, xG a shot, through balls attempted /
// completed, possession and box entries a match, and the condition's own corners row when present.
import { existsSync, readFileSync } from 'node:fs';

const pool = (a, b, f) => (f(a[0]) * a[1] + f(b[0]) * b[1]) / (a[1] + b[1]);
console.log(
  '| read | matches | press win share − counter\'s [95%] | press: goals, shots, xG a shot, through balls (completed), possession | counter: goals, shots, xG a shot, through balls (completed), possession | corners a team (condition rows) |',
);
console.log('|---|---:|---|---|---|---|');
for (const f of process.argv.slice(2)) {
  if (!existsSync(f)) {
    console.log(`| ${f} | missing |`);
    continue;
  }
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const pc = d.conditions.find((c) => c.condition === 'tactics:press-counter');
  const cp = d.conditions.find((c) => c.condition === 'tactics:counter-press');
  const arms = [
    [pc.outcome.homeWin.share, pc.outcome.awayWin.share, pc.matches],
    [cp.outcome.awayWin.share, cp.outcome.homeWin.share, cp.matches],
  ];
  const n = arms.reduce((a, x) => a + x[2], 0);
  const m = arms.reduce((a, [p, c, k]) => a + (p - c) * k, 0) / n;
  const v = arms.reduce((a, [p, c, k]) => a + (p + c - (p - c) ** 2) * k, 0) / n;
  const h = 1.96 * Math.sqrt(v / n);
  const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(3);
  // Side 0 is home: press at home in press-counter, counter at home in counter-press.
  const press = [
    [pc.sides[0], pc.matches],
    [cp.sides[1], cp.matches],
  ];
  const counter = [
    [pc.sides[1], pc.matches],
    [cp.sides[0], cp.matches],
  ];
  const side = (arm) => {
    const g = (k) => pool(arm[0], arm[1], (x) => x[k]);
    return `${g('goals').toFixed(2)}, ${g('shots').toFixed(1)}, ${g('xgPerShot').toFixed(3)}, ${g('throughBalls').toFixed(2)} (${g('throughBallsCompleted').toFixed(2)}), ${(100 * g('possession')).toFixed(1)}%`;
  };
  const corners = [pc, cp]
    .map((c) => c.targets.find((t) => t.id === 'corners'))
    .map((t) => (t ? t.value.toFixed(2) : '-'))
    .join(' / ');
  const name = f.split('/').pop().replace(/\.json$/, '');
  console.log(`| ${name} | ${n} | ${sign(m)} [${sign(m - h)}, ${sign(m + h)}] | ${side(press)} | ${side(counter)} | ${corners} |`);
}
