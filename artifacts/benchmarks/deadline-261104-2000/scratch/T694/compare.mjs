// Checks T694's freshly lived rows against T693's archived ones: the same books, squads and W,
// and T693's W80 reproduced as each star's third entry.
import { readFileSync } from 'node:fs';

const dir = '/home/deep/haeram/haeram-soccor-balance/.tmp/T694';
for (const name of ['books-cal-0', 'books-cal-1', 'books-held-2', 'books-held-3']) {
  const then = JSON.parse(readFileSync(`${dir}/t693/${name}.json`, 'utf8'));
  const now = JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'));
  const key = (r) => `${r.seed}|${r.year}|${r.code}|${r.id}`;
  const byKey = new Map(now.map((r) => [key(r), r]));
  let same = 0,
    stars = 0,
    starsSame = 0,
    w80Moved = 0,
    adultMoved = 0;
  const diffs = [];
  for (const r of then) {
    const n = byKey.get(key(r));
    if (!n) {
      diffs.push(`missing ${key(r)}`);
      continue;
    }
    const fields = ['tier', 'strength', 'project', 'income', 'wages', 'costs', 'repriced', 'base'];
    const bad = fields.filter((f) => r[f] !== n[f]);
    if (r.stars.length !== n.stars.length) bad.push('stars.length');
    else
      r.stars.forEach(([full, w80], i) => {
        stars++;
        const [nFull, nW80, nLowered, age] = n.stars[i];
        if (nFull === full && nLowered === w80) starsSame++;
        else bad.push(`star ${i}`);
        if (nW80 !== nLowered) {
          w80Moved++;
          if (age >= 24) adultMoved++;
        }
      });
    if (bad.length) diffs.push(`${key(r)}: ${bad.join(', ')}`);
    else same++;
  }
  console.log(
    `${name}: T693 ${then.length} rows, T694 ${now.length}; ${same} identical (books, squad price, each star's W and T693's W80); stars ${starsSame} of ${stars} identical; W80 moved for ${w80Moved} stars, ${adultMoved} of them aged 24+`,
  );
  if (diffs.length) console.log(`  differences: ${diffs.slice(0, 10).join(' | ')}`);
}
