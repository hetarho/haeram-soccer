// T689 cv04-alt: node alt.mjs FILE… — summarises `scripts/scoring-clear-chances.ts` reports side by
// side: per team a match (n / 2 / matches), the share of its group, and for decisions the possession's
// first shot after it (shot %, goal %, xG a shot, goal-area share of those shots).
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const reports = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const name = (f) => f.replace(/^.*clear-/, '').replace(/\.json$/, '');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');
const pc = (v) => (Number.isFinite(v) ? (100 * v).toFixed(1) : '-');
const get = (r, key) => r.rows.find((x) => x.key === key);
const perTeam = (r, n) => n / 2 / r.matches;

console.log(files.map((f, i) => `${name(f)}: ${reports[i].matches} matches, ${f2(reports[i].goals / reports[i].matches)} goals, ${f2(reports[i].shots / 2 / reports[i].matches)} shots a team; ${reports[i].finishes} finishes left out, ${reports[i].unmatched} holds unmatched`).join('\n'));

function group(prefix, depth, cols = 'dec') {
  const keys = new Set();
  for (const r of reports)
    for (const x of r.rows)
      if (x.key.startsWith(prefix) && x.key.split('|').length === depth) keys.add(x.key);
  const totalKey = prefix.split('|')[0] + '|all';
  console.log(`\n## ${prefix}*`);
  const head = cols === 'dec' ? 'n/team share shot% goal% xG/shot GA%' : 'n/team goals/team big/team bigGoals/team xG/shot conv%';
  console.log(['key', ...files.map((f) => `${name(f)}: ${head}`)].join(' | '));
  for (const key of [...keys].sort()) {
    const cells = reports.map((r) => {
      const x = get(r, key);
      if (!x) return '-';
      if (cols === 'dec') {
        const tot = get(r, totalKey)?.n ?? x.n;
        return `${f2(perTeam(r, x.n))} ${pc(x.n / tot)} ${pc(x.shot / x.n)} ${pc(x.goal / x.n)} ${f2(x.shot ? x.xg / x.shot : NaN)} ${pc(x.shot ? x.goalAreaShot / x.shot : NaN)}`;
      }
      return `${f2(perTeam(r, x.n))} ${f2(perTeam(r, x.goal))} ${f2(perTeam(r, x.big))} ${f2(perTeam(r, x.bigGoal))} ${f2(x.xg / x.n)} ${pc(x.goal / x.n)}`;
    });
    console.log([key.slice(prefix.length) || '(all)', ...cells].join(' | '));
  }
}

function entries() {
  console.log('\n## box entries: led to a clear chance or not');
  console.log(['key', ...files.map((f) => `${name(f)}: n/team shot% goal% behind%`)].join(' | '));
  const keys = new Set();
  for (const r of reports) for (const x of r.rows) if (x.key.startsWith('entry|')) keys.add(x.key);
  for (const key of [...keys].sort()) {
    const cells = reports.map((r) => {
      const x = get(r, key);
      return x ? `${f2(perTeam(r, x.n))} ${pc(x.shot / x.n)} ${pc(x.goal / x.n)} ${pc(x.behind / x.n)}` : '-';
    });
    console.log([key.slice(6), ...cells].join(' | '));
  }
}

function means(prefix) {
  console.log(`\n## ${prefix} means (a decision)`);
  const fields = ['narrow', 'keeperOff', 'dist', 'goalSide', 'near4', 'near8', 'deepest', 'since', 'passes', 'through', 'squareFree', 'entryBehind', 'st', 'mixShot', 'mixTakeOn', 'mixPass', 'mixCarry', 'recycled'];
  console.log(['field', ...files.map(name)].join(' | '));
  for (const k of fields)
    console.log([k, ...reports.map((r) => { const x = get(r, prefix); return x ? f2(x[k] / x.n) : '-'; })].join(' | '));
}

group('first|', 2);
group('first|became|', 3);
group('first|end|', 3);
group('first|regain|', 3);
group('first|since|', 3);
group('first|passes|', 3);
group('first|through|', 3);
group('first|entry|', 3);
group('first|entryStart|', 3);
group('first|entryBehind|', 3);
group('first|chase|', 3);
group('first|shut|', 3);
group('first|place|', 3);
group('first|position|', 3);
group('first|tactic|', 3);
group('first|against|', 3);
group('clear|', 2);
group('clear|became|', 3);
group('clear|end|', 3);
group('clear|became|', 5);
group('clear|shut|', 5);
group('clear|chase|', 5);
group('clear|place|', 5);
group('clear|near8|', 3);
group('clear|goalSide|', 3);
group('clear|deepest|', 3);
means('first|all');
means('clear|all');
console.log('\n## chain (clear decisions a possession)');
for (const r of reports) console.log(r.rows.filter((x) => x.key.startsWith('chain|')).map((x) => `${x.key.slice(6)} ${x.n} (${f2(x.decisions / x.n)})`).join(', '));
group('shot|', 2, 'shot');
group('shot|', 3, 'shot');
entries();
