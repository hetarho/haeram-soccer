// Summarises the candidate tables of T694's reports: the strongest-three median's change from
// T693's reading per season, and the largest single-star rise, read from the markdown rows.
import { readFileSync } from 'node:fs';

const dir = '/home/deep/haeram/haeram-soccor-balance/artifacts/benchmarks/T694';
for (const name of ['books-calibration', 'books-held-out']) {
  const lines = readFileSync(`${dir}/${name}.md`, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith("### T693's candidate"));
  const bySeason = new Map();
  for (const line of lines.slice(start)) {
    const cells = line.split('|').map((c) => c.trim());
    if (!/^\d{4}\/\d+$/.test(cells[2] ?? '')) continue;
    const season = cells[2].slice(0, 4),
      s = Number(cells[4]),
      now = Number(cells[6].replace('%', '')),
      then = Number(cells[9].split('/')[0].replace('%', '')),
      largest = cells[10].startsWith('none') ? 0 : Number(cells[10].split(', ').at(-1).replace('%', ''));
    const e = bySeason.get(season) ?? { s: new Set(), deltas: [], bills: [], largest: 0 };
    e.s.add(s);
    e.deltas.push(now - then);
    e.bills.push(cells[10].startsWith('none') ? 0 : Number(cells[10].split(', ')[0].replace(/[+%]/g, '')));
    e.largest = Math.max(e.largest, largest);
    bySeason.set(season, e);
  }
  console.log(name);
  for (const [season, e] of bySeason)
    console.log(
      `  ${season} s ${[...e.s].join('/')}: median change ${Math.min(...e.deltas).toFixed(1)} to +${Math.max(...e.deltas).toFixed(1)} pp, wage bill ${Math.min(...e.bills).toFixed(1)} to ${Math.max(...e.bills).toFixed(1)}%, largest star rise ${e.largest.toFixed(1)}%`,
    );
}
