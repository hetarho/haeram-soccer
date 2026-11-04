// T689 cv04: the striker stress case over its three validation seeds, as nx04 §2.
//   node stress.mjs DIR name ...   (reads stress-<name>-val-{1,2,3}.json; nx04's for released/earlyZones/arrHoldEZ60)
import { existsSync, readFileSync } from 'node:fs';

const [dir, ...names] = process.argv.slice(2);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ci = (xs) => {
  const m = mean(xs);
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  const h = (1.96 * sd) / Math.sqrt(xs.length);
  return `${(100 * m).toFixed(1)}% [${(100 * (m - h)).toFixed(1)}, ${(100 * (m + h)).toFixed(1)}]`;
};
for (const name of names) {
  const files = [1, 2, 3].map((k) => {
    const own = `${dir}/stress-${name}-val-${k}.json`;
    const nx = `${dir}/../scoring-261104-nx04/stress-${name}-val-${k}.json`;
    return JSON.parse(readFileSync(existsSync(own) ? own : nx, 'utf8'));
  });
  for (const arm of ['normal', 'stress']) {
    const a = files.map((f) => f[arm]);
    const invalid = a.reduce((s, x) => s + x.invalid, 0);
    console.log(
      `${name} ${arm}: goals ${mean(a.map((x) => x.goalsPerMatch)).toFixed(2)} own ${mean(a.map((x) => x.ownGoalsPerMatch)).toFixed(2)}` +
        ` shots ${mean(a.map((x) => x.ownShotsPerMatch)).toFixed(1)} top ${ci(a.map((x) => x.topShare))}` +
        ` top/38 ${mean(a.map((x) => x.topGoalsPer38)).toFixed(1)} largest ${Math.max(...a.map((x) => x.largestTopGoalsPer38))}` +
        ` hat ${mean(a.map((x) => x.hatTricksPerOwnMatch)).toFixed(3)} FW ${(100 * mean(a.map((x) => x.goalsByLine.FW))).toFixed(0)}%` +
        (arm === 'stress' ? ` star/38 ${mean(a.map((x) => x.starGoalsPer38)).toFixed(1)} star shots ${mean(a.map((x) => x.starShotsPerMatch)).toFixed(2)}` : '') +
        ` invalid ${invalid}`,
    );
  }
}
