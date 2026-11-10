// T689 cv04-alt: node totals.mjs CLEAR.json ORIGINS.json … — whether the clear-chance diagnostic read the
// same matches as `scoring-shot-origins.ts` on the same seeds and range (its shots and goals against the
// origins report's `place|…` rows): reading the decision live must not change the match.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
let ok = true;
for (let i = 0; i + 1 < args.length; i += 2) {
  const c = JSON.parse(readFileSync(args[i], 'utf8'));
  const o = JSON.parse(readFileSync(args[i + 1], 'utf8'));
  const place = o.rows.filter((r) => r.key.startsWith('place|'));
  const shots = place.reduce((a, r) => a + r.shots, 0);
  const goals = place.reduce((a, r) => a + r.goals, 0);
  const same = c.matches === o.matches && c.start === o.start && c.shots === shots && c.goals === goals;
  ok &&= same;
  console.log(`${same ? 'same' : 'DIFF'} ${args[i]}: ${c.shots} shots ${c.goals} goals; ${args[i + 1]}: ${shots} shots ${goals} goals`);
}
process.exitCode = ok ? 0 : 1;
