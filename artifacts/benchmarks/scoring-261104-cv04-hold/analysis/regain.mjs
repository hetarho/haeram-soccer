// T689 cv04-hold: node regain.mjs DIR name… — the regain diagnostic's rows
// (`scripts/scoring-regain-shots.ts`, matches 600–719) as one markdown row per variant: shots
// (goals) straight after an opponent's action; of them after the keeper's ball, won within 5 m of
// him and struck within 3 s; how he had the ball (a teammate's pass, or in his hands: a save he
// held — the other side's shot — or a delivery he claimed); the striker slot's.
import { readFileSync } from 'node:fs';

const [dir, ...names] = process.argv.slice(2);
const cell = (rows, ...keys) => {
  let shots = 0,
    goals = 0;
  for (const k of keys) {
    const r = rows.find((x) => x.key === k);
    if (r) [shots, goals] = [shots + r.shots, goals + r.goals];
  }
  return `${shots} (${goals})`;
};
console.log(
  '| variant | all shots | after an opponent\'s action | after the keeper\'s ball | won within 5 m of him | struck within 3 s | keeper had it from a teammate\'s pass | keeper had it in his hands | struck by the ST slot |',
);
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const n of names) {
  const d = JSON.parse(readFileSync(`${dir}/regain-${n}-600-720.json`, 'utf8'));
  const rows = d.rows;
  console.log(
    `| ${n} | ${d.allShots} | ${cell(rows, 'all')} | ${cell(rows, 'loser|GK')} | ${cell(rows, 'gkWonAt|<5m')} | ${cell(rows, 'gkShotAfter|<3s')} | ${cell(rows, 'gkGot|own:pass:complete')} | ${cell(rows, 'gkGot|opp:shot:shot', 'gkGot|opp:cross:held', 'gkGot|opp:corner:held', 'gkGot|opp:freeKick:held')} | ${cell(rows, 'shooter|ST')} |`,
  );
}
