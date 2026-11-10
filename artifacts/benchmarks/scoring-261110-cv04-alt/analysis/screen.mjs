// T689 cv04-alt: node screen.mjs NAME… — one line a candidate from this evidence: its 400-match band check
// (`logs/bands-NAME-400.txt`: goals a match, shots a team, goal-area / outside shot %, xG a shot, possessions
// ending in a shot %, offsides, rows passed) and its 300-match clear-chance read (`clear/clear-NAME-0-300.json`:
// possessions reaching a clear chance and decisions a team, the first one's goal %, big chances and scored a
// team, box entries a team leading to one and not), with box entries and the box's open-play conversion from
// `entries/entries-NAME-0-400.json` and `origins/origins-NAME-{0,300}-300.json` where present.
import { existsSync, readFileSync } from 'node:fs';

const here = new URL('../', import.meta.url);
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');
const read = (p) => (existsSync(new URL(p, here)) ? readFileSync(new URL(p, here), 'utf8') : undefined);
const band = (text, label) => {
  const line = text?.split('\n').find((l) => l.startsWith(label));
  return line ? Number(line.trim().split(/\s+/).at(-2)) : NaN;
};
console.log(
  'name | goals shots GA% out% xG/shot posShot% offs rows | firstClear/team decisions/team first goal% big bigScored | entries clear/none | entries(400) | box open conv% xG/shot (n matches)',
);
for (const name of process.argv.slice(2)) {
  const b = read(`logs/bands-${name}-400.txt`);
  const rows = b?.match(/passed (\d+)\/(\d+)/);
  const c = read(`clear/clear-${name}-0-300.json`);
  const cr = c ? JSON.parse(c) : undefined;
  const get = (k) => cr?.rows.find((x) => x.key === k);
  const pt = (n) => (cr ? n / 2 / cr.matches : NaN);
  const first = get('first|all');
  const all = get('clear|all');
  const shots = get('shot|all');
  const ec = get('entry|clear');
  const en = get('entry|none');
  const e = read(`entries/entries-${name}-0-400.json`);
  const er = e ? JSON.parse(e) : undefined;
  const entries = er ? er.rows.find((x) => x.key === 'all').n / 2 / er.matches : NaN;
  let boxShots = 0,
    boxGoals = 0,
    boxXg = 0,
    om = 0;
  for (const half of ['0-300', '300-300']) {
    const o = read(`origins/origins-${name}-${half}.json`);
    if (!o) continue;
    const or = JSON.parse(o);
    om += or.matches;
    // Open play: origins other than penalties, set pieces' second phases, restarts and deliveries' headers.
    for (const r of or.rows) {
      const [kind, origin, place] = r.key.split('|');
      if (kind !== 'originPlace' || place !== 'box') continue;
      if (origin === 'penalty' || origin.startsWith('restart-') || origin === 'setPiece-2nd') continue;
      boxShots += r.shots;
      boxGoals += r.goals;
      boxXg += r.xg;
    }
  }
  console.log(
    [
      name,
      `${f2(band(b, 'goals (match)'))} ${f2(band(b, 'shots (team)'))} ${f1(band(b, 'shots from goal area'))} ${f1(band(b, 'shots from outside'))} ${f2(band(b, 'xG per shot'))} ${f1(band(b, 'possessions ending in a shot'))} ${f2(band(b, 'offsides'))} ${rows ? rows[1] + '/' + rows[2] : '-'}`,
      `${f2(pt(first?.n))} ${f2(pt(all?.n))} ${f1(first ? (100 * first.goal) / first.n : NaN)} ${f2(pt(shots?.big))} ${f2(pt(shots?.bigGoal))}`,
      `${f2(pt(ec?.n))}/${f2(pt(en?.n))}`,
      f2(entries),
      om ? `${f1((100 * boxGoals) / boxShots)} ${f2(boxXg / boxShots)} (${om})` : '-',
    ].join(' | '),
  );
}
