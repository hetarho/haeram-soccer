/**
 * Compares the posted replies of a `waits-pair.ts` directory's matched runs (T1064): each round's
 * baseline and candidate rows in order, by kind, `replyHash` and `rowsPut`.
 *
 *   node artifacts/benchmarks/T1064/replies.mjs <waits-pair out dir>
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
let round = 0,
  equal = 0,
  differ = 0;
for (; existsSync(resolve(dir, `base-${round}.json`)); round++) {
  const [b, c] = ['base', 'candidate'].map((side) =>
    JSON.parse(readFileSync(resolve(dir, `${side}-${round}.json`), 'utf8')),
  );
  if (b.rows.length !== c.rows.length) throw new Error(`round ${round}: row counts differ`);
  b.rows.forEach((row, i) => {
    const other = c.rows[i];
    const same =
      row.kind === other.kind &&
      row.replyHash === other.replyHash &&
      (row.rowsPut ?? 0) === (other.rowsPut ?? 0);
    if (same) equal++;
    else {
      differ++;
      console.log(`round ${round} row ${i} ${row.kind}: ${row.replyHash} / ${other.replyHash}`);
    }
  });
}
console.log(JSON.stringify({ rounds: round, equal, differ }));
