// T689 cv04-own: node screen.mjs NAME… — one line a candidate (cv04-ent's `screen.py` in JS, this window's paths):
// the box-entry diagnostic (entries a team a match, entering possessions, a shot / goal following an entry), the band
// check's goals, shots, shot places, possessions ending in a shot, offsides, set-piece goal share and rows inside (the
// runner's band log), the shot-origin diagnostic's open-play box beyond the goal area — shots a team, conversion and
// xG a shot, pooled over every origins file of the name (0–299, 300–599) — and the ST slot's share of the goals in
// those files, and the `own|…` rows' shots after the shooter's own carry (a team, conversion, xG a shot).
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const here = new URL('../', import.meta.url);
const logs = new URL('../../../../.tmp/cv04-own/logs/', import.meta.url);
const json = (u) => JSON.parse(readFileSync(u, 'utf8'));
const files = (dir, prefix) =>
  existsSync(new URL(dir + '/', here))
    ? readdirSync(new URL(dir + '/', here)).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).map((f) => new URL(`${dir}/${f}`, here))
    : [];

function origins(name) {
  let m = 0;
  const box = { n: 0, g: 0, xg: 0 },
    ga = { n: 0, g: 0, xg: 0 };
  let st = 0,
    goals = 0;
  for (const u of files('origins', `origins-${name}-`)) {
    const d = json(u);
    m += d.matches;
    for (const r of d.rows) {
      const k = r.key.split('|');
      if (k[0] === 'pos') {
        goals += r.goals;
        if (k[1] === 'ST') st += r.goals;
      }
      if (k[0] !== 'originPlaceBetween') continue;
      const [origin, place] = [k[1], k[2]];
      if (origin === 'penalty' || origin.startsWith('restart-') || origin === 'setPiece-2nd') continue;
      const a = place === 'box' ? box : place === 'goalArea' ? ga : null;
      if (!a) continue;
      a.n += r.shots;
      a.g += r.goals;
      a.xg += r.xg;
    }
  }
  if (!m) return '-';
  const f = (a) => `${(a.n / m / 2).toFixed(2)}/${((100 * a.g) / a.n).toFixed(1)}%/xg ${(a.xg / a.n).toFixed(3)}`;
  return `box ${f(box)} GA ${f(ga)} ST ${((100 * st) / goals).toFixed(1)}% (${m})`;
}

function entries(name) {
  const fs = files('entries', `entries-${name}-`);
  if (!fs.length) return 'ent -';
  let m = 0,
    poss = 0;
  const all = { n: 0, shot: 0, goal: 0 };
  for (const u of fs) {
    const d = json(u);
    m += d.matches;
    poss += d.possessionsWithEntry;
    for (const r of d.rows)
      if (r.key === 'all') {
        all.n += r.n;
        all.shot += r.shot;
        all.goal += r.goal;
      }
  }
  return `ent ${(all.n / m / 2).toFixed(2)} poss ${(poss / m / 2).toFixed(2)} shot ${((100 * all.shot) / all.n).toFixed(1)}% goal ${((100 * all.goal) / all.n).toFixed(1)}%`;
}

function bands(name) {
  const u = new URL(`bands-${name}-400.log`, logs);
  if (!existsSync(u)) return 'bands -';
  const t = readFileSync(u, 'utf8');
  const v = (re) => (t.match(re) ?? [])[1] ?? '-';
  return [
    `goals ${v(/goals \(match\)\s+\S+\s+([\d.]+)/)}`,
    `shots ${v(/\nshots \(team\)\s+\S+\s+([\d.]+)/)}`,
    `out/box/GA% ${v(/shots from outside %\s+\S+\s+([\d.]+)/)}/${v(/shots from rest of box %\s+\S+\s+([\d.]+)/)}/${v(/shots from goal area %\s+\S+\s+([\d.]+)/)}`,
    `poss ${v(/possessions \(team\)\s+\S+\s+([\d.]+)/)}`,
    `shot% ${v(/possessions ending in a shot %\s+\S+\s+([\d.]+)/)}`,
    `off ${v(/offsides \(team\)\s+\S+\s+([\d.]+)/)}`,
    `sp% ${v(/set-piece goals \(no pens\) %\s+\S+\s+([\d.]+)/)}`,
    `rows ${v(/passed (\d+\/\d+)/)}`,
  ].join(' ');
}

function own(name) {
  const fs = files('chased', `chased-${name}-0-300`);
  if (!fs.length) return 'own -';
  const d = json(fs[0]);
  const t = d.matches * 2;
  const row = (k) => d.rows.find((r) => r.key === k);
  const f = (k) => {
    const r = row(k);
    return r ? `${(r.n / t).toFixed(2)}/${((100 * r.goals) / r.n).toFixed(1)}%/xg ${(r.xg / r.n).toFixed(3)}` : '-';
  };
  return `own alone ${f('own|alone')} between ${f('own|between')}`;
}

for (const name of process.argv.slice(2))
  console.log(`${name.padEnd(8)} ${entries(name)} | ${bands(name)} | ${origins(name)} | ${own(name)}`);
