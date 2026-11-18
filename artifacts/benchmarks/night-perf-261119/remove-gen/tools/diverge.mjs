// node diverge.mjs <base.json> <variant.json>...: per season, divisions whose final order differs, and moves.
import { readFileSync } from 'node:fs';
const [bf, ...vs] = process.argv.slice(2);
const B = JSON.parse(readFileSync(bf, 'utf8'));
for (const vf of vs) {
  const V = JSON.parse(readFileSync(vf, 'utf8'));
  const years = [...new Set(Object.keys(B.tables).map((k) => k.split(':')[0]))];
  const row = years.map((y) => {
    const ks = Object.keys(B.tables).filter((k) => k.startsWith(y + ':') && V.tables[k]);
    const diff = ks.filter((k) => B.tables[k].join() !== V.tables[k].join()).length;
    return `${y}:${diff}/${ks.length}${B.moves[y] && V.moves[y] ? ' m' + B.moves[y].total + '/' + V.moves[y].total : ''}`;
  });
  console.log(vf.split('/').pop(), row.join('  '));
}
