// Which clubs won 1980–2009 in a country and seed, released and candidate, and how often the
// candidate's champions were sold down by the means level in that window.
import { readFileSync } from 'node:fs';

const [code, seed] = process.argv.slice(2);
const dir = '/home/deep/haeram/haeram-soccor-balance/.tmp/t696/books';
const read = (kind) => JSON.parse(readFileSync(`${dir}/${kind}-${seed}.extra.json`, 'utf8'))[0];
for (const kind of ['released', 'candidate']) {
  const extra = read(kind);
  const titles = new Map();
  for (const ch of extra.champions)
    if (ch.code === code && ch.year >= 1980 && ch.year <= 2009)
      titles.set(ch.club, (titles.get(ch.club) ?? 0) + 1);
  console.log(kind, [...titles].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' '));
  if (kind === 'candidate') {
    const sold = extra.sold.filter((s) => s.code === code && s.year >= 1979 && s.year <= 2009);
    console.log(
      'sold 1979–2009:',
      sold.length,
      'club-seasons,',
      sold.reduce((a, s) => a + s.from - s.to, 0),
      'points; of champions:',
      sold.filter((s) => titles.has(s.id) || [...titles.keys()].some((k) => k.includes(s.id))).length,
      sold.slice(0, 12).map((s) => `${s.year} ${s.id} t${s.tier} ${s.from}→${s.to}`).join(', '),
    );
  }
}
