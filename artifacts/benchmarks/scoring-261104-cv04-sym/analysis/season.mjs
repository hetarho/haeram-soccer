// T689 cv04-sym: node season.mjs DIR name… — pools a candidate's six `season-<name>-*.json` slices
// (`scripts/scoring-season-share.ts`) into one markdown row: club-seasons, the own club's goals for and
// against a match, MATCH-23's club top-scorer share (mean over club-seasons, normal 95% interval; each
// seed's mean beside it), his goals and starts, the top scorers' positions, ledger mismatches.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const [dir, ...names] = process.argv.slice(2);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x) => (100 * x).toFixed(1);
console.log(
  '| read | club-seasons | own goals / against a match | club top-scorer share [95%] | by seed | top scorer goals / 38 | his starts | top scorers by position | hat-tricks / own match | ledger mismatches |',
);
console.log('|---|---:|---|---|---|---:|---:|---|---:|---:|');
// `name` reads ENG's slices, `name@esp` another country's, `name@*` every country's.
for (const spec of names) {
  const [name, tag = ''] = spec.split('@');
  const re = new RegExp(`^season-${name}-${tag === '*' ? '[a-z]*' : tag}\\d+-\\d+\\.json$`);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)) : [];
  const rows = files.flatMap((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).rows);
  const valid = rows.filter((r) => r.tier === 0 && r.matches > 0);
  if (!valid.length) {
    console.log(`| ${spec} | missing |`);
    continue;
  }
  const s = valid.map((r) => r.topShare);
  const m = mean(s);
  const sd = Math.sqrt(s.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, s.length - 1));
  const h = (1.96 * sd) / Math.sqrt(s.length);
  const seeds = [...new Set(valid.map((r) => r.seed))].sort();
  const bySeed = seeds.map((sd) => pct(mean(valid.filter((r) => r.seed === sd).map((r) => r.topShare)))).join(' / ');
  const pos = {};
  for (const r of valid) pos[r.topPosition] = (pos[r.topPosition] ?? 0) + 1;
  const hat = valid.every((r) => r.hatTricks !== null)
    ? (valid.reduce((a, r) => a + r.hatTricks, 0) / valid.reduce((a, r) => a + r.matches, 0)).toFixed(3)
    : '-';
  console.log(
    `| ${spec} | ${valid.length} | ${mean(valid.map((r) => r.goals / r.matches)).toFixed(2)} / ${mean(valid.map((r) => r.conceded / r.matches)).toFixed(2)} | ${pct(m)} [${pct(m - h)}, ${pct(m + h)}] | ${bySeed} | ${mean(valid.map((r) => (38 * r.topGoals) / r.matches)).toFixed(1)} | ${pct(mean(valid.map((r) => r.topStarts / r.matches)))}% | ${Object.entries(pos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')} | ${hat} | ${valid.filter((r) => r.ledgerGoals !== r.goals).length} |`,
  );
}
