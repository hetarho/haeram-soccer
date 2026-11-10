// T689 cv04-alt: node same.mjs A.json B.json [A2 B2 …] — whether each pair of diagnostic reports is
// equal once the candidate file's path (`patch`) is left out; prints the first differing rows when not.
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
let all = true;
for (let i = 0; i + 1 < files.length; i += 2) {
  const [a, b] = [files[i], files[i + 1]].map((f) => {
    const r = JSON.parse(readFileSync(f, 'utf8'));
    delete r.patch;
    return r;
  });
  const same = JSON.stringify(a) === JSON.stringify(b);
  all &&= same;
  console.log(`${same ? 'same' : 'DIFF'} ${files[i]} ${files[i + 1]}`);
  if (!same) {
    for (const k of Object.keys(a))
      if (k !== 'rows' && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        console.log(`  ${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
    const rowsB = new Map((b.rows ?? []).map((r) => [r.key, JSON.stringify(r)]));
    let shown = 0;
    for (const r of a.rows ?? [])
      if (rowsB.get(r.key) !== JSON.stringify(r) && shown++ < 5)
        console.log(`  ${JSON.stringify(r)}\n  ${rowsB.get(r.key)}`);
  }
}
process.exitCode = all ? 0 : 1;
